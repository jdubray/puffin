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

    // Sub-components (v2)
    this._summaryCards = null
    this._treemap = null
    this._dailyTrends = null
    this._efficiencyChart = null
    this._perfTable = null

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

      <!-- v2: Metrics-based components (hidden if metrics unavailable) -->
      <div id="stats-v2-section" style="${this.metricsAvailable ? '' : 'display:none'}">
        <div id="metrics-summary-cards-container"></div>
        <div id="component-treemap-container"></div>
        <div id="daily-trends-container"></div>
        <div id="efficiency-chart-container"></div>
        <div id="perf-table-container"></div>
      </div>

      <!-- v1: Legacy history-based components (always shown if data exists) -->
      <div id="stats-v1-section">
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
    const cardsContainer = this.container.querySelector('#metrics-summary-cards-container')
    if (cardsContainer) {
      this._summaryCards = new SummaryCards(cardsContainer, { data: this.metricsSummary })
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
   * Destroy all v2 sub-components
   */
  _destroySubComponents() {
    if (this._summaryCards) { this._summaryCards.destroy(); this._summaryCards = null }
    if (this._treemap) { this._treemap.destroy(); this._treemap = null }
    if (this._dailyTrends) { this._dailyTrends.destroy(); this._dailyTrends = null }
    if (this._efficiencyChart) { this._efficiencyChart.destroy(); this._efficiencyChart = null }
    if (this._perfTable) { this._perfTable.destroy(); this._perfTable = null }
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

  async handleExport() {
    try {
      const markdown = this.generateMarkdown()
      const dialogResult = await window.puffin.plugins.invoke(
        'stats-plugin', 'showSaveDialog',
        {
          defaultPath: 'puffin-stats-report.md',
          filters: [
            { name: 'Markdown', extensions: ['md'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        }
      )
      if (!dialogResult?.filePath) return
      await window.puffin.plugins.invoke(
        'stats-plugin', 'saveMarkdownExport',
        { content: markdown, filePath: dialogResult.filePath }
      )
      this.showNotification('Export successful!', 'success')
    } catch (err) {
      console.error('[StatsView] Export failed:', err)
      this.showNotification(`Export failed: ${err.message}`, 'error')
    }
  }

  generateMarkdown() {
    const totals = this.computeTotals(this.weeklyStats)
    const branchTotals = this.computeBranchTotals()
    const date = new Date().toLocaleDateString()

    let md = `# Puffin Usage Statistics Report\n\n`
    md += `Generated: ${date}\n\n`

    md += `## Summary\n\n`
    md += `- **Total Turns**: ${totals.turns.toLocaleString()}\n`
    md += `- **Total Cost**: $${totals.cost.toFixed(2)}\n`
    md += `- **Total Duration**: ${this.formatDuration(totals.duration)}\n`
    md += `- **Branches**: ${this.branchStats.length}\n`
    md += `- **Metrics Mode**: ${this.metricsAvailable ? 'v2 (metrics + history)' : 'v1 (history only)'}\n\n`

    md += `## Statistics by Branch\n\n`
    md += `| Branch | Threads | Turns | Cost | Duration |\n`
    md += `|--------|---------|-------|------|----------|\n`
    branchTotals.forEach(branch => {
      md += `| ${branch.name} | ${branch.threads} | ${branch.turns} | $${branch.cost.toFixed(2)} | ${this.formatDuration(branch.duration)} |\n`
    })
    md += `| **Total** | **${branchTotals.reduce((sum, b) => sum + b.threads, 0)}** | **${totals.turns}** | **$${totals.cost.toFixed(2)}** | **${this.formatDuration(totals.duration)}** |\n\n`

    md += `## Weekly Breakdown\n\n`
    md += `| Week | Turns | Cost | Duration |\n`
    md += `|------|-------|------|----------|\n`
    this.weeklyStats.forEach(week => {
      md += `| ${week.week} | ${week.turns} | $${week.cost.toFixed(2)} | ${this.formatDuration(week.duration)} |\n`
    })

    return md
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
