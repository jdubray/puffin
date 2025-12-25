/**
 * StatsView - Main container component for the Stats Plugin UI
 * Vanilla JavaScript implementation (no JSX)
 *
 * Displays:
 * - Summary cards with totals
 * - Stats table per branch and per week
 * - Charts for visualization
 */
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
    this.loading = true
    this.error = null
    this.activeChart = 'weekly' // 'weekly' | 'branch' | 'cost'
  }

  /**
   * Initialize the component
   */
  async init() {
    console.log('[StatsView] init() called, container:', this.container)

    this.container.className = 'stats-view'
    this.updateView()
    await this.fetchStats()
    console.log('[StatsView] init() complete')
  }

  /**
   * Update the view based on current state
   */
  updateView() {
    if (!this.container) return

    this.container.innerHTML = ''

    // Show loading state
    if (this.loading) {
      this.container.innerHTML = `
        <div class="stats-loading">
          <div class="stats-spinner"></div>
          <p>Loading statistics...</p>
        </div>
      `
      return
    }

    // Show error state
    if (this.error) {
      this.container.innerHTML = `
        <div class="stats-error">
          <span class="stats-error-icon">⚠️</span>
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

    // Render full stats view
    this.renderStats()
  }

  /**
   * Render the full statistics view
   */
  renderStats() {
    const totals = this.computeTotals(this.weeklyStats)
    const branchTotals = this.computeBranchTotals()

    this.container.innerHTML = `
      <div class="stats-header">
        <div class="stats-header-text">
          <h2>📊 Usage Statistics</h2>
          <p class="stats-subtitle">Last 26 weeks</p>
        </div>
        <div class="stats-header-actions">
          <button class="stats-btn stats-btn-secondary stats-refresh-btn" title="Refresh data">
            🔄 Refresh
          </button>
          <button class="stats-btn stats-btn-primary stats-export-btn" title="Export as Markdown">
            📄 Export
          </button>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="stats-summary-cards">
        <div class="stats-card">
          <div class="stats-card-icon">💬</div>
          <div class="stats-card-content">
            <div class="stats-card-value">${totals.turns.toLocaleString()}</div>
            <div class="stats-card-label">Total Turns</div>
          </div>
        </div>
        <div class="stats-card">
          <div class="stats-card-icon">💰</div>
          <div class="stats-card-content">
            <div class="stats-card-value">$${totals.cost.toFixed(2)}</div>
            <div class="stats-card-label">Total Cost</div>
          </div>
        </div>
        <div class="stats-card">
          <div class="stats-card-icon">⏱️</div>
          <div class="stats-card-content">
            <div class="stats-card-value">${this.formatDuration(totals.duration)}</div>
            <div class="stats-card-label">Total Duration</div>
          </div>
        </div>
        <div class="stats-card">
          <div class="stats-card-icon">🌿</div>
          <div class="stats-card-content">
            <div class="stats-card-value">${this.branchStats.length}</div>
            <div class="stats-card-label">Branches</div>
          </div>
        </div>
      </div>

      <!-- Charts Section -->
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

      <!-- Tables Section -->
      <div class="stats-tables-section">
        <!-- Branch Stats Table -->
        <div class="stats-table-container">
          <h3>📁 Statistics by Branch</h3>
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

        <!-- Weekly Stats Table -->
        <div class="stats-table-container">
          <h3>📅 Weekly Breakdown</h3>
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
    `

    // Attach event listeners
    this.attachEventListeners()

    // Render the chart
    this.renderChart()
  }

  /**
   * Attach event listeners to rendered elements
   */
  attachEventListeners() {
    // Refresh button
    this.container.querySelector('.stats-refresh-btn')?.addEventListener('click', () => {
      this.fetchStats()
    })

    // Export button
    this.container.querySelector('.stats-export-btn')?.addEventListener('click', () => {
      this.handleExport()
    })

    // Chart tabs
    this.container.querySelectorAll('.stats-chart-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const chartType = e.target.dataset.chart
        this.activeChart = chartType

        // Update active tab styling
        this.container.querySelectorAll('.stats-chart-tab').forEach(t => t.classList.remove('active'))
        e.target.classList.add('active')

        // Re-render chart
        this.renderChart()
      })
    })
  }

  /**
   * Render branch statistics table rows
   */
  renderBranchTableRows(branchTotals) {
    if (branchTotals.length === 0) {
      return '<tr><td colspan="5" class="stats-no-data">No branch data available</td></tr>'
    }

    return branchTotals
      .sort((a, b) => b.turns - a.turns) // Sort by turns descending
      .map(branch => `
        <tr>
          <td>
            <span class="stats-branch-name">${this.escapeHtml(branch.name)}</span>
          </td>
          <td>${branch.threads}</td>
          <td>${branch.turns.toLocaleString()}</td>
          <td>$${branch.cost.toFixed(2)}</td>
          <td>${this.formatDuration(branch.duration)}</td>
        </tr>
      `)
      .join('')
  }

  /**
   * Render weekly statistics table rows
   */
  renderWeeklyTableRows() {
    if (this.weeklyStats.length === 0) {
      return '<tr><td colspan="5" class="stats-no-data">No weekly data available</td></tr>'
    }

    // Show most recent weeks first
    return [...this.weeklyStats]
      .reverse()
      .slice(0, 12) // Show last 12 weeks
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

  /**
   * Render chart based on active chart type
   */
  renderChart() {
    const canvas = this.container.querySelector('#stats-chart')
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const rect = canvas.parentElement.getBoundingClientRect()

    // Set canvas size based on container
    canvas.width = Math.max(rect.width - 40, 600)
    canvas.height = 280

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    switch (this.activeChart) {
      case 'weekly':
        this.renderWeeklyChart(ctx, canvas)
        break
      case 'branch':
        this.renderBranchChart(ctx, canvas)
        break
      case 'cost':
        this.renderCostChart(ctx, canvas)
        break
    }
  }

  /**
   * Render weekly trends bar chart
   */
  renderWeeklyChart(ctx, canvas) {
    const data = this.weeklyStats.slice(-12) // Last 12 weeks
    if (data.length === 0) {
      this.renderNoDataMessage(ctx, canvas)
      return
    }

    const padding = { top: 40, right: 20, bottom: 60, left: 60 }
    const chartWidth = canvas.width - padding.left - padding.right
    const chartHeight = canvas.height - padding.top - padding.bottom

    const maxTurns = Math.max(...data.map(d => d.turns), 1)
    const barWidth = (chartWidth / data.length) * 0.7
    const barGap = (chartWidth / data.length) * 0.3

    // Draw title
    ctx.fillStyle = '#e0e0e0'
    ctx.font = 'bold 14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Turns per Week', canvas.width / 2, 20)

    // Draw bars
    data.forEach((week, i) => {
      const x = padding.left + i * (barWidth + barGap) + barGap / 2
      const barHeight = (week.turns / maxTurns) * chartHeight
      const y = padding.top + chartHeight - barHeight

      // Bar gradient
      const gradient = ctx.createLinearGradient(x, y, x, y + barHeight)
      gradient.addColorStop(0, '#6c63ff')
      gradient.addColorStop(1, '#4a42c9')

      ctx.fillStyle = gradient
      ctx.fillRect(x, y, barWidth, barHeight)

      // Value on top
      ctx.fillStyle = '#e0e0e0'
      ctx.font = '10px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(week.turns.toString(), x + barWidth / 2, y - 5)

      // Week label
      ctx.save()
      ctx.translate(x + barWidth / 2, canvas.height - 10)
      ctx.rotate(-Math.PI / 4)
      ctx.fillStyle = '#888'
      ctx.font = '9px system-ui'
      ctx.textAlign = 'right'
      ctx.fillText(week.week.replace(/^\d{4}-/, ''), 0, 0)
      ctx.restore()
    })

    // Y-axis labels
    ctx.fillStyle = '#888'
    ctx.font = '10px system-ui'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const value = Math.round((maxTurns / 4) * i)
      const y = padding.top + chartHeight - (chartHeight / 4) * i
      ctx.fillText(value.toString(), padding.left - 10, y + 4)

      // Grid line
      ctx.strokeStyle = '#333'
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(canvas.width - padding.right, y)
      ctx.stroke()
    }
  }

  /**
   * Render branch comparison chart (horizontal bars)
   */
  renderBranchChart(ctx, canvas) {
    const branchTotals = this.computeBranchTotals()
    if (branchTotals.length === 0) {
      this.renderNoDataMessage(ctx, canvas)
      return
    }

    const data = branchTotals.sort((a, b) => b.turns - a.turns).slice(0, 8)
    const padding = { top: 40, right: 80, bottom: 20, left: 120 }
    const chartWidth = canvas.width - padding.left - padding.right
    const chartHeight = canvas.height - padding.top - padding.bottom

    const maxTurns = Math.max(...data.map(d => d.turns), 1)
    const barHeight = Math.min((chartHeight / data.length) * 0.7, 30)
    const barGap = (chartHeight / data.length) - barHeight

    // Draw title
    ctx.fillStyle = '#e0e0e0'
    ctx.font = 'bold 14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Turns by Branch', canvas.width / 2, 20)

    // Colors for branches
    const colors = ['#6c63ff', '#48bb78', '#ecc94b', '#f56565', '#38b2ac', '#ed64a6', '#667eea', '#fc8181']

    // Draw bars
    data.forEach((branch, i) => {
      const y = padding.top + i * (barHeight + barGap)
      const barWidth = (branch.turns / maxTurns) * chartWidth

      // Bar
      ctx.fillStyle = colors[i % colors.length]
      ctx.fillRect(padding.left, y, barWidth, barHeight)

      // Branch name
      ctx.fillStyle = '#e0e0e0'
      ctx.font = '11px system-ui'
      ctx.textAlign = 'right'
      ctx.fillText(branch.name, padding.left - 10, y + barHeight / 2 + 4)

      // Value
      ctx.fillStyle = '#e0e0e0'
      ctx.textAlign = 'left'
      ctx.fillText(`${branch.turns} turns`, padding.left + barWidth + 10, y + barHeight / 2 + 4)
    })
  }

  /**
   * Render cost analysis line chart
   */
  renderCostChart(ctx, canvas) {
    const data = this.weeklyStats.slice(-12)
    if (data.length === 0) {
      this.renderNoDataMessage(ctx, canvas)
      return
    }

    const padding = { top: 40, right: 20, bottom: 60, left: 70 }
    const chartWidth = canvas.width - padding.left - padding.right
    const chartHeight = canvas.height - padding.top - padding.bottom

    const maxCost = Math.max(...data.map(d => d.cost), 0.1)
    const pointSpacing = chartWidth / (data.length - 1 || 1)

    // Draw title
    ctx.fillStyle = '#e0e0e0'
    ctx.font = 'bold 14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Cost per Week ($)', canvas.width / 2, 20)

    // Draw grid
    ctx.strokeStyle = '#333'
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(canvas.width - padding.right, y)
      ctx.stroke()

      // Y-axis label
      const value = maxCost - (maxCost / 4) * i
      ctx.fillStyle = '#888'
      ctx.font = '10px system-ui'
      ctx.textAlign = 'right'
      ctx.fillText(`$${value.toFixed(2)}`, padding.left - 10, y + 4)
    }

    // Draw line
    ctx.beginPath()
    ctx.strokeStyle = '#48bb78'
    ctx.lineWidth = 2

    data.forEach((week, i) => {
      const x = padding.left + i * pointSpacing
      const y = padding.top + chartHeight - (week.cost / maxCost) * chartHeight

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    })
    ctx.stroke()

    // Draw points and labels
    data.forEach((week, i) => {
      const x = padding.left + i * pointSpacing
      const y = padding.top + chartHeight - (week.cost / maxCost) * chartHeight

      // Point
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#48bb78'
      ctx.fill()

      // X-axis label
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

  /**
   * Render "no data" message in chart
   */
  renderNoDataMessage(ctx, canvas) {
    ctx.fillStyle = '#666'
    ctx.font = '14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('No data available', canvas.width / 2, canvas.height / 2)
  }

  /**
   * Fetch statistics data from the plugin
   */
  async fetchStats() {
    console.log('[StatsView] fetchStats() called')
    this.loading = true
    this.error = null
    this.updateView()

    try {
      // Fetch weekly stats
      console.log('[StatsView] Invoking getWeeklyStats...')
      const weeklyResult = await window.puffin.plugins.invoke('stats-plugin', 'getWeeklyStats', {
        weeks: 26
      })
      console.log('[StatsView] weeklyResult:', weeklyResult)
      this.weeklyStats = weeklyResult || []

      // Fetch branch stats
      console.log('[StatsView] Invoking getStats...')
      const statsResult = await window.puffin.plugins.invoke('stats-plugin', 'getStats', {})
      console.log('[StatsView] statsResult:', statsResult)
      this.branchStats = statsResult?.branches || []

      this.loading = false
      console.log('[StatsView] Data loaded successfully')
      this.updateView()
    } catch (err) {
      console.error('[StatsView] Failed to fetch stats:', err)
      this.error = err.message || 'Failed to fetch statistics'
      this.loading = false
      this.updateView()
    }
  }

  /**
   * Compute totals from weekly stats
   */
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

  /**
   * Compute per-branch totals from branch stats
   */
  computeBranchTotals() {
    if (!this.branchStats || this.branchStats.length === 0) {
      return []
    }

    return this.branchStats.map(branch => ({
      name: branch.name || branch.id,
      threads: branch.promptCount || 0,
      turns: branch.turns || 0,
      cost: branch.cost || 0,
      duration: branch.duration || 0
    }))
  }

  /**
   * Handle export to markdown
   */
  async handleExport() {
    try {
      const markdown = this.generateMarkdown()

      // Show save dialog via plugin
      const dialogResult = await window.puffin.plugins.invoke(
        'stats-plugin',
        'showSaveDialog',
        {
          defaultPath: 'puffin-stats-report.md',
          filters: [
            { name: 'Markdown', extensions: ['md'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        }
      )

      if (!dialogResult?.filePath) {
        return // User cancelled
      }

      // Save the file
      await window.puffin.plugins.invoke(
        'stats-plugin',
        'saveMarkdownExport',
        {
          content: markdown,
          filePath: dialogResult.filePath
        }
      )

      this.showNotification('Export successful!', 'success')
    } catch (err) {
      console.error('[StatsView] Export failed:', err)
      this.showNotification(`Export failed: ${err.message}`, 'error')
    }
  }

  /**
   * Generate markdown report
   */
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
    md += `- **Branches**: ${this.branchStats.length}\n\n`

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

  /**
   * Show notification toast
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div')
    notification.className = `stats-notification stats-notification-${type}`
    notification.innerHTML = `
      <span class="stats-notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
      <span class="stats-notification-message">${this.escapeHtml(message)}</span>
    `

    document.body.appendChild(notification)

    // Animate in
    requestAnimationFrame(() => {
      notification.classList.add('show')
    })

    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove('show')
      setTimeout(() => notification.remove(), 300)
    }, 3000)
  }

  /**
   * Format duration in milliseconds to human-readable string
   */
  formatDuration(ms) {
    if (!ms || ms === 0) return '0s'

    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Lifecycle: Called when view is activated
   */
  onActivate() {
    // Refresh chart on window resize
    this.resizeHandler = () => this.renderChart()
    window.addEventListener('resize', this.resizeHandler)
  }

  /**
   * Lifecycle: Called when view is deactivated
   */
  onDeactivate() {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler)
    }
  }

  /**
   * Cleanup when component is destroyed
   */
  destroy() {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler)
    }
    if (this.container) {
      this.container.innerHTML = ''
      this.container = null
    }
  }
}

// Export as default for compatibility
export default StatsView
