import { SummaryCards } from './SummaryCards.js'
import { ComponentTreemap } from './ComponentTreemap.js'
import { DailyTrendsChart } from './DailyTrendsChart.js'
import { NormalizedEfficiencyChart } from './NormalizedEfficiencyChart.js'
import { ComponentPerformanceTable } from './ComponentPerformanceTable.js'

/**
 * StatsView - Main container orchestrating all Stats Plugin sub-components.
 *
 * Dual-mode:
 *   v2 (metrics-based): SummaryCards, ComponentTreemap, DailyTrendsChart,
 *                        NormalizedEfficiencyChart, ComponentPerformanceTable
 *   v1 (legacy):        Branch/weekly tables, canvas charts
 *
 * Both modes display when data is available. v2 sections are hidden when
 * MetricsService is unavailable (metricsSummary fetch fails).
 */

/** @type {number} Auto-refresh interval in ms */
const AUTO_REFRESH_MS = 60000

export class StatsView {
  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} options - Component options
   * @param {string} options.viewId - View ID
   * @param {Object} options.view - View configuration
   * @param {string} options.pluginName - Plugin name
   * @param {Object} options.context - Plugin context
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}

    // State
    this.weeklyStats = []
    this.branchStats = []
    this.metricsSummary = null
    this.metricsAvailable = false  // true if MetricsService responded
    this.loading = true
    this.error = null
    this.activeChart = 'weekly' // 'weekly' | 'branch' | 'cost'
    this.metricsViewMode = 'prompt' // 'prompt' | 'story'

    // Sub-components (v2)
    this._summaryCards = null
    this._treemap = null
    this._dailyTrends = null
    this._efficiencyChart = null
    this._perfTable = null
    this._storyMetricsInitialized = false

    // Timers
    this._refreshTimer = null
    this._isActive = false
  }

  /**
   * Initialize the component
   */
  async init() {
    console.log('[StatsView] init() called')
    this.container.className = 'stats-view'
    this.updateView()
    await this.fetchStats()
  }

  // ── View rendering ───────────────────────────────────────────

  /**
   * Update the view based on current state
   */
  updateView() {
    if (!this.container) return

    // Destroy existing sub-components before clearing DOM
    this._destroySubComponents()
    this.container.innerHTML = ''

    if (this.loading) {
      this.container.innerHTML = `
        <div class="stats-loading">
          <div class="stats-spinner"></div>
          <p>Loading statistics...</p>
        </div>
      `
      return
    }

    if (this.error) {
      this.container.innerHTML = `
        <div class="stats-error">
          <span class="stats-error-icon">\u26A0\uFE0F</span>
          <h3>Error Loading Statistics</h3>
          <p>${this.escapeHtml(this.error)}</p>
          <button class="stats-retry-btn">Retry</button>
        </div>
      `
      this.container.querySelector('.stats-retry-btn')?.addEventListener('click', () => {
        this.fetchStats()
      })
      return
    }

    this.renderStats()
  }

  /**
   * Render the full statistics view with all sections
   */
  renderStats() {
    const totals = this.computeTotals(this.weeklyStats)
    const branchTotals = this.computeBranchTotals()
    const modeLabel = this.metricsAvailable ? 'Metrics + History' : 'History only'

    this.container.innerHTML = `
      <div class="stats-header">
        <div class="stats-header-top">
          <div class="stats-header-text">
            <h2>Usage Statistics</h2>
            <p class="stats-subtitle">
              ${modeLabel}
              <span class="stats-mode-badge ${this.metricsAvailable ? 'mode-v2' : 'mode-v1'}">${this.metricsAvailable ? 'v2' : 'v1'}</span>
            </p>
          </div>
          <div class="stats-header-actions">
            <button class="stats-btn stats-btn-secondary stats-refresh-btn" title="Refresh data">
              Refresh
            </button>
            <button class="stats-btn stats-btn-primary stats-export-btn" title="Export as Markdown">
              Export
            </button>
          </div>
        </div>
        <div class="stats-header-totals">
          <div class="stats-total-item">
            <div class="stats-total-icon">🔄</div>
            <div class="stats-total-content">
              <div class="stats-total-value">${totals.turns.toLocaleString()}</div>
              <div class="stats-total-label">Total Turns</div>
            </div>
          </div>
          <div class="stats-total-item">
            <div class="stats-total-icon">💰</div>
            <div class="stats-total-content">
              <div class="stats-total-value">$${totals.cost.toFixed(2)}</div>
              <div class="stats-total-label">Total Cost</div>
            </div>
          </div>
          <div class="stats-total-item">
            <div class="stats-total-icon">⏱️</div>
            <div class="stats-total-content">
              <div class="stats-total-value">${this.formatDuration(totals.duration)}</div>
              <div class="stats-total-label">Total Duration</div>
            </div>
          </div>
        </div>
      </div>

      <!-- v2: Metrics-based components (hidden if metrics unavailable) -->
      <div id="stats-v2-section" class="stats-v2-section" style="${this.metricsAvailable ? '' : 'display:none'}">
        <!-- Metrics View Mode Toggle -->
        <div class="metrics-mode-toggle">
          <button class="metrics-mode-btn ${this.metricsViewMode === 'prompt' ? 'active' : ''}" data-mode="prompt">
            📊 Prompt Metrics
            <span class="metrics-mode-desc">Individual AI Operations</span>
          </button>
          <button class="metrics-mode-btn ${this.metricsViewMode === 'story' ? 'active' : ''}" data-mode="story">
            📚 Story Metrics
            <span class="metrics-mode-desc">Aggregated per User Story</span>
          </button>
        </div>

        <!-- Prompt Metrics View -->
        <div id="prompt-metrics-view" class="metrics-view-section" style="${this.metricsViewMode === 'prompt' ? '' : 'display:none'}">
          <section class="stats-section">
            <div id="metrics-summary-cards-container"></div>
          </section>

          <section class="stats-section">
            <h3 class="stats-section-title">Component Breakdown (Prompts)</h3>
            <div id="component-treemap-container"></div>
          </section>

          <section class="stats-section">
            <div id="daily-trends-container"></div>
          </section>

          <section class="stats-section">
            <h3 class="stats-section-title">Normalized Efficiency (Prompts)</h3>
            <div id="efficiency-chart-container"></div>
          </section>

          <section class="stats-section">
            <div id="perf-table-container"></div>
          </section>
        </div>

        <!-- Story Metrics View -->
        <div id="story-metrics-view" class="metrics-view-section" style="${this.metricsViewMode === 'story' ? '' : 'display:none'}">
          <section class="stats-section">
            <div id="story-metrics-cards-container"></div>
          </section>

          <section class="stats-section">
            <h3 class="stats-section-title">Story Cost Breakdown</h3>
            <div id="story-treemap-container"></div>
          </section>

          <section class="stats-section">
            <h3 class="stats-section-title">Story Performance Overview</h3>
            <div id="story-table-container"></div>
          </section>
        </div>
      </div>

      <!-- v1: Legacy history-based components (hidden when v2 is available) -->
      <div id="stats-v1-section" style="${this.metricsAvailable ? 'display:none' : ''}" class="stats-v1-section">
        <div class="stats-charts-section">
          <div class="stats-chart-tabs">
            <button class="stats-chart-tab ${this.activeChart === 'weekly' ? 'active' : ''}" data-chart="weekly">
              Weekly Trends
            </button>
            <button class="stats-chart-tab ${this.activeChart === 'branch' ? 'active' : ''}" data-chart="branch">
              By Branch
            </button>
            <button class="stats-chart-tab ${this.activeChart === 'cost' ? 'active' : ''}" data-chart="cost">
              Cost Analysis
            </button>
          </div>
          <div class="stats-chart-container">
            <canvas id="stats-chart" width="800" height="300"></canvas>
          </div>
        </div>

        <div class="stats-tables-section">
          <div class="stats-table-container">
            <h3>Statistics by Branch</h3>
            <table class="stats-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Threads</th>
                  <th>Turns</th>
                  <th>Cost</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                ${this.renderBranchTableRows(branchTotals)}
              </tbody>
              <tfoot>
                <tr class="stats-table-total">
                  <td><strong>Total</strong></td>
                  <td><strong>${branchTotals.reduce((sum, b) => sum + b.threads, 0)}</strong></td>
                  <td><strong>${totals.turns.toLocaleString()}</strong></td>
                  <td><strong>$${totals.cost.toFixed(2)}</strong></td>
                  <td><strong>${this.formatDuration(totals.duration)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="stats-table-container">
            <h3>Weekly Breakdown</h3>
            <div class="stats-table-scroll">
              <table class="stats-table">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Turns</th>
                    <th>Cost</th>
                    <th>Duration</th>
                    <th>Avg/Day</th>
                  </tr>
                </thead>
                <tbody>
                  ${this.renderWeeklyTableRows()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `

    // Attach event listeners
    this.attachEventListeners()

    // Initialize v2 sub-components (only if metrics available)
    if (this.metricsAvailable) {
      this._initSubComponents()
    }

    // Render the v1 canvas chart
    this.renderChart()
  }

  // ── Sub-component lifecycle ──────────────────────────────────

  /**
   * Initialize all v2 sub-components into their container divs.
   * Sub-components that need data fetch will do so independently.
   * SummaryCards gets pre-fetched data directly.
   */
  _initSubComponents() {
    // SummaryCards — data passed directly (already fetched in parallel)
    // Use 'prompt' mode to show only prompt-level metrics (no per-story aggregates)
    const cardsContainer = this.container.querySelector('#metrics-summary-cards-container')
    if (cardsContainer) {
      this._summaryCards = new SummaryCards(cardsContainer, {
        data: this.metricsSummary,
        mode: 'prompt'
      })
      this._summaryCards.render()
    }

    // ComponentTreemap — fetches getComponentBreakdown internally
    const treemapContainer = this.container.querySelector('#component-treemap-container')
    if (treemapContainer) {
      this._treemap = new ComponentTreemap(treemapContainer)
      this._treemap.init()
    }

    // DailyTrendsChart — fetches getDailyTrends internally
    const dailyTrendsContainer = this.container.querySelector('#daily-trends-container')
    if (dailyTrendsContainer) {
      this._dailyTrends = new DailyTrendsChart(dailyTrendsContainer)
      this._dailyTrends.init()
    }

    // NormalizedEfficiencyChart — fetches getWeeklyNormalized internally
    const efficiencyContainer = this.container.querySelector('#efficiency-chart-container')
    if (efficiencyContainer) {
      this._efficiencyChart = new NormalizedEfficiencyChart(efficiencyContainer)
      this._efficiencyChart.init()
    }

    // ComponentPerformanceTable — fetches getComponentBreakdown internally
    const perfTableContainer = this.container.querySelector('#perf-table-container')
    if (perfTableContainer) {
      this._perfTable = new ComponentPerformanceTable(perfTableContainer)
      this._perfTable.init()
    }
  }

  /**
   * Initialize story metrics view (lazy loaded)
   */
  async _initStoryMetrics() {
    const storyCardsContainer = this.container.querySelector('#story-metrics-cards-container')
    const storyTreemapContainer = this.container.querySelector('#story-treemap-container')
    const storyTableContainer = this.container.querySelector('#story-table-container')

    if (!storyCardsContainer || !storyTreemapContainer || !storyTableContainer) return

    try {
      // Fetch story metrics from story_metrics table
      const result = await window.puffin.plugins.invoke('stats-plugin', 'getStoryMetrics', {})

      if (!result || !result.stories || result.stories.length === 0) {
        storyCardsContainer.innerHTML = '<div class="stats-empty">No story metrics available yet.</div>'
        storyTreemapContainer.innerHTML = '<div class="stats-empty">Complete some user stories to see metrics here.</div>'
        storyTableContainer.innerHTML = '<div class="stats-empty">Complete some user stories to see metrics here.</div>'
        this._storyMetricsInitialized = true
        return
      }

      // Render story summary cards
      this._renderStoryMetricsCards(storyCardsContainer, result)

      // Render story treemap
      this._renderStoryTreemap(storyTreemapContainer, result.stories)

      // Render story performance table
      this._renderStoryMetricsTable(storyTableContainer, result.stories)

      this._storyMetricsInitialized = true
    } catch (err) {
      console.error('[StatsView] Failed to load story metrics:', err)
      storyCardsContainer.innerHTML = `<div class="stats-error-small">Failed to load story metrics: ${this.escapeHtml(err.message)}</div>`
    }
  }

  /**
   * Render story metrics summary cards
   */
  _renderStoryMetricsCards(container, data) {
    const { stories, totals } = data
    const avgCostPerStory = stories.length > 0 ? totals.totalCost / stories.length : 0
    const avgOpsPerStory = stories.length > 0 ? totals.totalOperations / stories.length : 0

    container.innerHTML = `
      <div class="metrics-summary-cards">
        <div class="metrics-card">
          <div class="metrics-card-icon">📚</div>
          <div class="metrics-card-body">
            <div class="metrics-card-value-row">
              <div class="metrics-card-value">${stories.length}</div>
            </div>
            <div class="metrics-card-label">Total Stories</div>
          </div>
        </div>
        <div class="metrics-card">
          <div class="metrics-card-icon">💰</div>
          <div class="metrics-card-body">
            <div class="metrics-card-value-row">
              <div class="metrics-card-value">$${totals.totalCost.toFixed(2)}</div>
            </div>
            <div class="metrics-card-label">Total Cost (Stories)</div>
          </div>
        </div>
        <div class="metrics-card">
          <div class="metrics-card-icon">📊</div>
          <div class="metrics-card-body">
            <div class="metrics-card-value-row">
              <div class="metrics-card-value">${totals.totalOperations}</div>
            </div>
            <div class="metrics-card-label">Total Operations</div>
          </div>
        </div>
        <div class="metrics-card">
          <div class="metrics-card-icon">💵</div>
          <div class="metrics-card-body">
            <div class="metrics-card-value-row">
              <div class="metrics-card-value">$${avgCostPerStory.toFixed(2)}</div>
            </div>
            <div class="metrics-card-label">Avg Cost / Story</div>
          </div>
        </div>
        <div class="metrics-card">
          <div class="metrics-card-icon">🔢</div>
          <div class="metrics-card-body">
            <div class="metrics-card-value-row">
              <div class="metrics-card-value">${Math.round(avgOpsPerStory)}</div>
            </div>
            <div class="metrics-card-label">Avg Operations / Story</div>
          </div>
        </div>
      </div>
    `
  }

  /**
   * Render story treemap (visual cost breakdown by story)
   */
  _renderStoryTreemap(container, stories) {
    // Sort by cost descending and take top 15
    const sorted = [...stories]
      .filter(s => s.total_cost_usd > 0)
      .sort((a, b) => b.total_cost_usd - a.total_cost_usd)
      .slice(0, 15)

    if (sorted.length === 0) {
      container.innerHTML = '<div class="stats-empty">No story cost data available</div>'
      return
    }

    const totalCost = sorted.reduce((sum, s) => sum + s.total_cost_usd, 0)
    const maxCost = sorted[0].total_cost_usd

    const boxes = sorted.map(story => {
      const pct = (story.total_cost_usd / totalCost) * 100
      const efficiency = story.total_operations > 0
        ? story.total_cost_usd / story.total_operations
        : 0

      // Color scale: green (low cost/op) to red (high cost/op)
      const colorIntensity = Math.min(efficiency / 0.5, 1) // $0.50 per op = max red
      const hue = (1 - colorIntensity) * 120 // 120 = green, 0 = red
      const bgColor = `hsl(${hue}, 60%, 35%)`

      return `
        <div class="story-treemap-box" style="flex: ${pct}; background: ${bgColor};" title="${this.escapeHtml(story.story_title)}">
          <div class="story-treemap-label">${this.escapeHtml(this._truncate(story.story_title, 30))}</div>
          <div class="story-treemap-value">$${story.total_cost_usd.toFixed(2)}</div>
          <div class="story-treemap-pct">${pct.toFixed(1)}%</div>
        </div>
      `
    }).join('')

    container.innerHTML = `
      <div class="story-treemap-grid">
        ${boxes}
      </div>
    `
  }

  /**
   * Render story performance table
   */
  _renderStoryMetricsTable(container, stories) {
    // Sort by cost descending
    const sorted = [...stories].sort((a, b) => b.total_cost_usd - a.total_cost_usd)

    const rows = sorted.map(story => {
      const avgCostPerOp = story.total_operations > 0 ? story.total_cost_usd / story.total_operations : 0
      const duration = this.formatDuration(story.total_duration_ms)

      return `
        <tr>
          <td class="story-title-cell">
            <div class="story-title">${this.escapeHtml(story.story_title)}</div>
            <div class="story-meta">${story.id}</div>
          </td>
          <td class="numeric-cell">${story.total_operations}</td>
          <td class="numeric-cell cost-cell">$${story.total_cost_usd.toFixed(2)}</td>
          <td class="numeric-cell">$${avgCostPerOp.toFixed(3)}</td>
          <td class="numeric-cell">${duration}</td>
          <td class="status-cell">
            <span class="story-status story-status-${story.status}">${story.status}</span>
          </td>
        </tr>
      `
    }).join('')

    container.innerHTML = `
      <div class="story-metrics-table-wrapper">
        <table class="story-metrics-table">
          <thead>
            <tr>
              <th>Story</th>
              <th class="numeric-cell">Operations</th>
              <th class="numeric-cell">Total Cost</th>
              <th class="numeric-cell">Avg Cost/Op</th>
              <th class="numeric-cell">Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `
  }

  /**
   * Destroy all v2 sub-components
   */
  _destroySubComponents() {
    if (this._summaryCards) { this._summaryCards.destroy(); this._summaryCards = null }
    if (this._treemap) { this._treemap.destroy(); this._treemap = null }
    if (this._dailyTrends) { this._dailyTrends.destroy(); this._dailyTrends = null }
    if (this._efficiencyChart) { this._efficiencyChart.destroy(); this._efficiencyChart = null }
    if (this._perfTable) { this._perfTable.destroy(); this._perfTable = null }
    this._storyMetricsInitialized = false
  }

  // ── Event listeners ──────────────────────────────────────────

  attachEventListeners() {
    this.container.querySelector('.stats-refresh-btn')?.addEventListener('click', () => {
      this.fetchStats()
    })

    this.container.querySelector('.stats-export-btn')?.addEventListener('click', () => {
      this.handleExport()
    })

    this.container.querySelectorAll('.stats-chart-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const chartType = e.target.dataset.chart
        this.activeChart = chartType
        this.container.querySelectorAll('.stats-chart-tab').forEach(t => t.classList.remove('active'))
        e.target.classList.add('active')
        this.renderChart()
      })
    })

    // Metrics view mode toggle (prompt vs story)
    this.container.querySelectorAll('.metrics-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.mode
        this.metricsViewMode = mode
        this.container.querySelectorAll('.metrics-mode-btn').forEach(b => b.classList.remove('active'))
        e.currentTarget.classList.add('active')

        // Toggle visibility
        const promptView = this.container.querySelector('#prompt-metrics-view')
        const storyView = this.container.querySelector('#story-metrics-view')
        if (promptView) promptView.style.display = mode === 'prompt' ? '' : 'none'
        if (storyView) storyView.style.display = mode === 'story' ? '' : 'none'

        // Initialize story metrics on first view
        if (mode === 'story' && !this._storyMetricsInitialized) {
          this._initStoryMetrics()
        }
      })
    })
  }

  // ── Data fetching (parallel with Promise.allSettled) ─────────

  /**
   * Fetch all data sources in parallel.
   * v1 (legacy): getWeeklyStats, getStats
   * v2 (metrics): getMetricsSummary
   *
   * Each fetch is independent — failures are isolated.
   */
  async fetchStats() {
    console.log('[StatsView] fetchStats() called')
    this.loading = true
    this.error = null
    this.updateView()

    const invoke = (handler, args) =>
      window.puffin.plugins.invoke('stats-plugin', handler, args)

    const [weeklyResult, statsResult, metricsResult] = await Promise.allSettled([
      invoke('getWeeklyStats', { weeks: 26 }),
      invoke('getStats', {}),
      invoke('getMetricsSummary', { days: 30 })
    ])

    // v1 legacy data
    if (weeklyResult.status === 'fulfilled') {
      this.weeklyStats = weeklyResult.value || []
    } else {
      console.warn('[StatsView] getWeeklyStats failed:', weeklyResult.reason?.message)
      this.weeklyStats = []
    }

    if (statsResult.status === 'fulfilled') {
      this.branchStats = statsResult.value?.branches || []
    } else {
      console.warn('[StatsView] getStats failed:', statsResult.reason?.message)
      this.branchStats = []
    }

    // v2 metrics data — determines metricsAvailable flag
    if (metricsResult.status === 'fulfilled' && metricsResult.value) {
      this.metricsSummary = metricsResult.value
      this.metricsAvailable = true
    } else {
      console.warn('[StatsView] MetricsSummary unavailable:', metricsResult.reason?.message || 'null response')
      this.metricsSummary = null
      this.metricsAvailable = false
    }

    // If ALL fetches failed, show error
    const allFailed = weeklyResult.status === 'rejected' &&
                      statsResult.status === 'rejected' &&
                      metricsResult.status === 'rejected'
    if (allFailed) {
      this.error = 'Failed to fetch statistics from all data sources'
    }

    this.loading = false
    console.log('[StatsView] Data loaded. metricsAvailable:', this.metricsAvailable)
    this.updateView()
  }

  // ── Auto-refresh ─────────────────────────────────────────────

  _startAutoRefresh() {
    this._stopAutoRefresh()
    this._refreshTimer = setInterval(() => {
      if (!this.loading) {
        console.log('[StatsView] Auto-refreshing data')
        this.fetchStats()
      }
    }, AUTO_REFRESH_MS)
  }

  _stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer)
      this._refreshTimer = null
    }
  }

  // ── v1 legacy rendering ──────────────────────────────────────

  renderBranchTableRows(branchTotals) {
    if (branchTotals.length === 0) {
      return '<tr><td colspan="5" class="stats-no-data">No branch data available</td></tr>'
    }

    return branchTotals
      .sort((a, b) => b.turns - a.turns)
      .map(branch => `
        <tr>
          <td><span class="stats-branch-name">${this.escapeHtml(branch.name)}</span></td>
          <td>${branch.threads}</td>
          <td>${branch.turns.toLocaleString()}</td>
          <td>$${branch.cost.toFixed(2)}</td>
          <td>${this.formatDuration(branch.duration)}</td>
        </tr>
      `)
      .join('')
  }

  renderWeeklyTableRows() {
    if (this.weeklyStats.length === 0) {
      return '<tr><td colspan="5" class="stats-no-data">No weekly data available</td></tr>'
    }

    return [...this.weeklyStats]
      .reverse()
      .slice(0, 12)
      .map(week => {
        const avgPerDay = week.turns / 7
        return `
          <tr>
            <td>${this.escapeHtml(week.week)}</td>
            <td>${week.turns.toLocaleString()}</td>
            <td>$${week.cost.toFixed(2)}</td>
            <td>${this.formatDuration(week.duration)}</td>
            <td>${avgPerDay.toFixed(1)}</td>
          </tr>
        `
      })
      .join('')
  }

  // ── v1 canvas charts ────────────────────────────────────────

  renderChart() {
    const canvas = this.container?.querySelector('#stats-chart')
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = Math.max(rect.width - 40, 600)
    canvas.height = 280
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    switch (this.activeChart) {
      case 'weekly': this.renderWeeklyChart(ctx, canvas); break
      case 'branch': this.renderBranchChart(ctx, canvas); break
      case 'cost': this.renderCostChart(ctx, canvas); break
    }
  }

  renderWeeklyChart(ctx, canvas) {
    const data = this.weeklyStats.slice(-12)
    if (data.length === 0) { this.renderNoDataMessage(ctx, canvas); return }

    const padding = { top: 40, right: 20, bottom: 60, left: 60 }
    const chartWidth = canvas.width - padding.left - padding.right
    const chartHeight = canvas.height - padding.top - padding.bottom
    const maxTurns = Math.max(...data.map(d => d.turns), 1)
    const barWidth = (chartWidth / data.length) * 0.7
    const barGap = (chartWidth / data.length) * 0.3

    ctx.fillStyle = '#e0e0e0'
    ctx.font = 'bold 14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Turns per Week', canvas.width / 2, 20)

    data.forEach((week, i) => {
      const x = padding.left + i * (barWidth + barGap) + barGap / 2
      const barHeight = (week.turns / maxTurns) * chartHeight
      const y = padding.top + chartHeight - barHeight

      const gradient = ctx.createLinearGradient(x, y, x, y + barHeight)
      gradient.addColorStop(0, '#6c63ff')
      gradient.addColorStop(1, '#4a42c9')
      ctx.fillStyle = gradient
      ctx.fillRect(x, y, barWidth, barHeight)

      ctx.fillStyle = '#e0e0e0'
      ctx.font = '10px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(week.turns.toString(), x + barWidth / 2, y - 5)

      ctx.save()
      ctx.translate(x + barWidth / 2, canvas.height - 10)
      ctx.rotate(-Math.PI / 4)
      ctx.fillStyle = '#888'
      ctx.font = '9px system-ui'
      ctx.textAlign = 'right'
      ctx.fillText(week.week.replace(/^\d{4}-/, ''), 0, 0)
      ctx.restore()
    })

    ctx.fillStyle = '#888'
    ctx.font = '10px system-ui'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const value = Math.round((maxTurns / 4) * i)
      const y = padding.top + chartHeight - (chartHeight / 4) * i
      ctx.fillText(value.toString(), padding.left - 10, y + 4)
      ctx.strokeStyle = '#333'
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(canvas.width - padding.right, y)
      ctx.stroke()
    }
  }

  renderBranchChart(ctx, canvas) {
    const branchTotals = this.computeBranchTotals()
    if (branchTotals.length === 0) { this.renderNoDataMessage(ctx, canvas); return }

    const data = branchTotals.sort((a, b) => b.turns - a.turns).slice(0, 8)
    const padding = { top: 40, right: 80, bottom: 20, left: 120 }
    const chartWidth = canvas.width - padding.left - padding.right
    const chartHeight = canvas.height - padding.top - padding.bottom
    const maxTurns = Math.max(...data.map(d => d.turns), 1)
    const barHeight = Math.min((chartHeight / data.length) * 0.7, 30)
    const barGap = (chartHeight / data.length) - barHeight

    ctx.fillStyle = '#e0e0e0'
    ctx.font = 'bold 14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Turns by Branch', canvas.width / 2, 20)

    const colors = ['#6c63ff', '#48bb78', '#ecc94b', '#f56565', '#38b2ac', '#ed64a6', '#667eea', '#fc8181']

    data.forEach((branch, i) => {
      const y = padding.top + i * (barHeight + barGap)
      const bw = (branch.turns / maxTurns) * chartWidth
      ctx.fillStyle = colors[i % colors.length]
      ctx.fillRect(padding.left, y, bw, barHeight)
      ctx.fillStyle = '#e0e0e0'
      ctx.font = '11px system-ui'
      ctx.textAlign = 'right'
      ctx.fillText(branch.name, padding.left - 10, y + barHeight / 2 + 4)
      ctx.textAlign = 'left'
      ctx.fillText(`${branch.turns} turns`, padding.left + bw + 10, y + barHeight / 2 + 4)
    })
  }

  renderCostChart(ctx, canvas) {
    const data = this.weeklyStats.slice(-12)
    if (data.length === 0) { this.renderNoDataMessage(ctx, canvas); return }

    const padding = { top: 40, right: 20, bottom: 60, left: 70 }
    const chartWidth = canvas.width - padding.left - padding.right
    const chartHeight = canvas.height - padding.top - padding.bottom
    const maxCost = Math.max(...data.map(d => d.cost), 0.1)
    const pointSpacing = chartWidth / (data.length - 1 || 1)

    ctx.fillStyle = '#e0e0e0'
    ctx.font = 'bold 14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Cost per Week ($)', canvas.width / 2, 20)

    ctx.strokeStyle = '#333'
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(canvas.width - padding.right, y)
      ctx.stroke()
      const value = maxCost - (maxCost / 4) * i
      ctx.fillStyle = '#888'
      ctx.font = '10px system-ui'
      ctx.textAlign = 'right'
      ctx.fillText(`$${value.toFixed(2)}`, padding.left - 10, y + 4)
    }

    ctx.beginPath()
    ctx.strokeStyle = '#48bb78'
    ctx.lineWidth = 2
    data.forEach((week, i) => {
      const x = padding.left + i * pointSpacing
      const y = padding.top + chartHeight - (week.cost / maxCost) * chartHeight
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.stroke()

    data.forEach((week, i) => {
      const x = padding.left + i * pointSpacing
      const y = padding.top + chartHeight - (week.cost / maxCost) * chartHeight
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#48bb78'
      ctx.fill()
      ctx.save()
      ctx.translate(x, canvas.height - 10)
      ctx.rotate(-Math.PI / 4)
      ctx.fillStyle = '#888'
      ctx.font = '9px system-ui'
      ctx.textAlign = 'right'
      ctx.fillText(week.week.replace(/^\d{4}-/, ''), 0, 0)
      ctx.restore()
    })
  }

  renderNoDataMessage(ctx, canvas) {
    ctx.fillStyle = '#666'
    ctx.font = '14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('No data available', canvas.width / 2, canvas.height / 2)
  }

  // ── Data helpers ─────────────────────────────────────────────

  computeTotals(stats) {
    return stats.reduce(
      (totals, week) => ({
        turns: totals.turns + (week.turns || 0),
        cost: totals.cost + (week.cost || 0),
        duration: totals.duration + (week.duration || 0)
      }),
      { turns: 0, cost: 0, duration: 0 }
    )
  }

  computeBranchTotals() {
    if (!this.branchStats || this.branchStats.length === 0) return []
    return this.branchStats.map(branch => ({
      name: branch.name || branch.id,
      threads: branch.promptCount || 0,
      turns: branch.turns || 0,
      cost: branch.cost || 0,
      duration: branch.duration || 0
    }))
  }

  // ── Export ───────────────────────────────────────────────────

  handleExport() {
    this._showExportDialog()
  }

  _showExportDialog() {
    // Remove any existing dialog
    const existing = this.container.querySelector('.stats-export-dialog-overlay')
    if (existing) existing.remove()

    const overlay = document.createElement('div')
    overlay.className = 'stats-export-dialog-overlay'

    const dialog = document.createElement('div')
    dialog.className = 'stats-export-dialog'
    dialog.innerHTML = `
      <div class="stats-export-dialog-header">
        <h3>Export Statistics</h3>
        <button class="stats-export-dialog-close" title="Close">\u2715</button>
      </div>
      <div class="stats-export-dialog-body">
        <div class="stats-export-field">
          <label class="stats-export-label">Format</label>
          <div class="stats-export-format-group">
            <label class="stats-export-format-option">
              <input type="radio" name="export-format" value="markdown" checked />
              <span class="stats-export-format-label">Markdown</span>
              <span class="stats-export-format-ext">.md</span>
            </label>
            <label class="stats-export-format-option">
              <input type="radio" name="export-format" value="csv" />
              <span class="stats-export-format-label">CSV</span>
              <span class="stats-export-format-ext">.csv</span>
            </label>
            <label class="stats-export-format-option">
              <input type="radio" name="export-format" value="json" />
              <span class="stats-export-format-label">JSON</span>
              <span class="stats-export-format-ext">.json</span>
            </label>
          </div>
        </div>
        <div class="stats-export-field">
          <label class="stats-export-label">Sections</label>
          <div class="stats-export-sections">
            <label class="stats-export-section-option">
              <input type="checkbox" name="export-section" value="summary" checked />
              Summary
            </label>
            <label class="stats-export-section-option">
              <input type="checkbox" name="export-section" value="branches" checked />
              Branch Statistics
            </label>
            <label class="stats-export-section-option">
              <input type="checkbox" name="export-section" value="weekly" checked />
              Weekly Breakdown
            </label>
            <label class="stats-export-section-option ${this.metricsAvailable ? '' : 'disabled'}">
              <input type="checkbox" name="export-section" value="components" ${this.metricsAvailable ? 'checked' : 'disabled'} />
              Component Metrics
            </label>
          </div>
        </div>
        <div class="stats-export-field">
          <label class="stats-export-label">Time Range</label>
          <select class="stats-export-range-select">
            <option value="all" selected>All Data</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="12">Last 12 weeks</option>
          </select>
        </div>
      </div>
      <div class="stats-export-dialog-footer">
        <button class="stats-btn stats-btn-secondary stats-export-cancel-btn">Cancel</button>
        <button class="stats-btn stats-btn-primary stats-export-confirm-btn">Export</button>
      </div>
    `
    overlay.appendChild(dialog)
    this.container.appendChild(overlay)

    // Bind events
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove()
    })
    dialog.querySelector('.stats-export-dialog-close').addEventListener('click', () => overlay.remove())
    dialog.querySelector('.stats-export-cancel-btn').addEventListener('click', () => overlay.remove())
    dialog.querySelector('.stats-export-confirm-btn').addEventListener('click', () => {
      const format = dialog.querySelector('input[name="export-format"]:checked')?.value || 'markdown'
      const sections = Array.from(dialog.querySelectorAll('input[name="export-section"]:checked'))
        .map(cb => cb.value)
      const range = dialog.querySelector('.stats-export-range-select')?.value || 'all'
      overlay.remove()
      this._executeExport(format, sections, range)
    })
  }

  async _executeExport(format, sections, range) {
    try {
      const content = this._generateExportContent(format, sections, range)
      const extMap = { markdown: 'md', csv: 'csv', json: 'json' }
      const ext = extMap[format] || 'md'
      const filterMap = {
        markdown: [{ name: 'Markdown', extensions: ['md'] }],
        csv: [{ name: 'CSV', extensions: ['csv'] }],
        json: [{ name: 'JSON', extensions: ['json'] }]
      }

      const dialogResult = await window.puffin.plugins.invoke(
        'stats-plugin', 'showSaveDialog',
        {
          defaultPath: `puffin-stats-report.${ext}`,
          filters: filterMap[format] || filterMap.markdown
        }
      )
      if (!dialogResult?.filePath) return

      await window.puffin.plugins.invoke(
        'stats-plugin', 'saveMarkdownExport',
        { content, filePath: dialogResult.filePath }
      )
      this.showNotification('Export successful!', 'success')
    } catch (err) {
      console.error('[StatsView] Export failed:', err)
      this.showNotification(`Export failed: ${err.message}`, 'error')
    }
  }

  _generateExportContent(format, sections, range) {
    const filteredWeekly = this._filterByRange(this.weeklyStats, range)
    const totals = this.computeTotals(filteredWeekly)
    const branchTotals = this.computeBranchTotals()

    if (format === 'json') {
      return this._generateJSON(sections, filteredWeekly, totals, branchTotals)
    }
    if (format === 'csv') {
      return this._generateCSV(sections, filteredWeekly, totals, branchTotals)
    }
    return this._generateMarkdown(sections, filteredWeekly, totals, branchTotals)
  }

  _filterByRange(weeklyStats, range) {
    if (range === 'all') return weeklyStats
    const weeks = parseInt(range, 10)
    if (isNaN(weeks) || weeks <= 0) return weeklyStats
    return weeklyStats.slice(-weeks)
  }

  _generateMarkdown(sections, weeklyStats, totals, branchTotals) {
    const date = new Date().toLocaleDateString()
    let md = `# Puffin Usage Statistics Report\n\n`
    md += `Generated: ${date}\n\n`

    if (sections.includes('summary')) {
      md += `## Summary\n\n`
      md += `- **Total Turns**: ${totals.turns.toLocaleString()}\n`
      md += `- **Total Cost**: $${totals.cost.toFixed(2)}\n`
      md += `- **Total Duration**: ${this.formatDuration(totals.duration)}\n`
      md += `- **Branches**: ${this.branchStats.length}\n`
      md += `- **Metrics Mode**: ${this.metricsAvailable ? 'v2 (metrics + history)' : 'v1 (history only)'}\n\n`
    }

    if (sections.includes('branches') && branchTotals.length > 0) {
      md += `## Statistics by Branch\n\n`
      md += `| Branch | Threads | Turns | Cost | Duration |\n`
      md += `|--------|---------|-------|------|----------|\n`
      branchTotals.forEach(branch => {
        md += `| ${branch.name} | ${branch.threads} | ${branch.turns} | $${branch.cost.toFixed(2)} | ${this.formatDuration(branch.duration)} |\n`
      })
      md += `| **Total** | **${branchTotals.reduce((sum, b) => sum + b.threads, 0)}** | **${totals.turns}** | **$${totals.cost.toFixed(2)}** | **${this.formatDuration(totals.duration)}** |\n\n`
    }

    if (sections.includes('weekly') && weeklyStats.length > 0) {
      md += `## Weekly Breakdown\n\n`
      md += `| Week | Turns | Cost | Duration |\n`
      md += `|------|-------|------|----------|\n`
      weeklyStats.forEach(week => {
        md += `| ${week.week} | ${week.turns} | $${week.cost.toFixed(2)} | ${this.formatDuration(week.duration)} |\n`
      })
      md += '\n'
    }

    return md
  }

  _generateCSV(sections, weeklyStats, totals, branchTotals) {
    const lines = []

    if (sections.includes('summary')) {
      lines.push('Section,Metric,Value')
      lines.push(`Summary,Total Turns,${totals.turns}`)
      lines.push(`Summary,Total Cost,${totals.cost.toFixed(2)}`)
      lines.push(`Summary,Total Duration (ms),${totals.duration}`)
      lines.push(`Summary,Branches,${this.branchStats.length}`)
      lines.push('')
    }

    if (sections.includes('branches') && branchTotals.length > 0) {
      lines.push('Branch,Threads,Turns,Cost,Duration (ms)')
      branchTotals.forEach(b => {
        lines.push(`${StatsView.csvEscape(b.name)},${b.threads},${b.turns},${b.cost.toFixed(2)},${b.duration}`)
      })
      lines.push('')
    }

    if (sections.includes('weekly') && weeklyStats.length > 0) {
      lines.push('Week,Turns,Cost,Duration (ms)')
      weeklyStats.forEach(w => {
        lines.push(`${w.week},${w.turns},${w.cost.toFixed(2)},${w.duration}`)
      })
      lines.push('')
    }

    return lines.join('\n')
  }

  _generateJSON(sections, weeklyStats, totals, branchTotals) {
    const data = {
      generated: new Date().toISOString(),
      metricsMode: this.metricsAvailable ? 'v2' : 'v1'
    }

    if (sections.includes('summary')) {
      data.summary = {
        totalTurns: totals.turns,
        totalCost: totals.cost,
        totalDuration: totals.duration,
        branchCount: this.branchStats.length
      }
    }

    if (sections.includes('branches')) {
      data.branches = branchTotals
    }

    if (sections.includes('weekly')) {
      data.weekly = weeklyStats
    }

    return JSON.stringify(data, null, 2)
  }

  static csvEscape(val) {
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  // ── Notification ─────────────────────────────────────────────

  showNotification(message, type = 'info') {
    const notification = document.createElement('div')
    notification.className = `stats-notification stats-notification-${type}`
    notification.innerHTML = `
      <span class="stats-notification-icon">${type === 'success' ? '\u2713' : type === 'error' ? '\u2717' : '\u2139'}</span>
      <span class="stats-notification-message">${this.escapeHtml(message)}</span>
    `
    document.body.appendChild(notification)
    requestAnimationFrame(() => notification.classList.add('show'))
    setTimeout(() => {
      notification.classList.remove('show')
      setTimeout(() => notification.remove(), 300)
    }, 3000)
  }

  // ── Utilities ────────────────────────────────────────────────

  formatDuration(ms) {
    if (!ms || ms === 0) return '0s'
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  _truncate(text, maxLen) {
    if (!text) return ''
    if (text.length <= maxLen) return text
    return text.substring(0, maxLen - 3) + '...'
  }

  // ── Lifecycle ────────────────────────────────────────────────

  /**
   * Called when view becomes active/visible.
   * Starts auto-refresh timer and resize handler.
   */
  onActivate() {
    this._isActive = true
    this.resizeHandler = () => this.renderChart()
    window.addEventListener('resize', this.resizeHandler)
    this._startAutoRefresh()
  }

  /**
   * Called when view is hidden/deactivated.
   * Stops auto-refresh timer and resize handler.
   */
  onDeactivate() {
    this._isActive = false
    this._stopAutoRefresh()
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler)
      this.resizeHandler = null
    }
  }

  /**
   * Full cleanup when component is destroyed.
   */
  destroy() {
    this._stopAutoRefresh()
    this._destroySubComponents()
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler)
      this.resizeHandler = null
    }
    if (this.container) {
      this.container.innerHTML = ''
      this.container = null
    }
  }
}

export default StatsView
