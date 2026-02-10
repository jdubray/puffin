/**
 * NormalizedEfficiencyChart - Tabbed bar chart for per-story/per-operation efficiency.
 *
 * Features:
 * - 3 tabs: Cost/Story, Tokens/Story, Duration/Operation
 * - Bar chart for last 12 weeks, color-coded by value thresholds
 * - Linear regression trend line overlay
 * - Overall % change indicator (first → last week)
 * - Zero-story weeks rendered as empty bars with label
 */

const TABS = [
  { id: 'costPerStory', label: 'Cost / Story', unit: '$', format: v => `$${v.toFixed(2)}` },
  { id: 'tokensPerStory', label: 'Tokens / Story', unit: 'tok', format: v => NormalizedEfficiencyChart.abbreviateNumber(v) },
  { id: 'durationPerOp', label: 'Duration / Op', unit: 'ms', format: v => NormalizedEfficiencyChart.formatDuration(v) }
]

export class NormalizedEfficiencyChart {
  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} [options]
   * @param {Function} [options.invoke] - IPC invoke function
   */
  constructor(element, options = {}) {
    this.container = element
    this.invoke = options.invoke || ((plugin, handler, args) =>
      window.puffin.plugins.invoke(plugin, handler, args))

    // State
    this.activeTab = 'costPerStory'
    this.data = null       // getWeeklyNormalized() result
    this.loading = false

    // DOM refs
    this._canvas = null
    this._tooltip = null
  }

  async init() {
    this.render()
    await this.fetchData()
  }

  async fetchData() {
    this.loading = true
    this.render()

    try {
      this.data = await this.invoke('stats-plugin', 'getWeeklyNormalized', { weeks: 12 })
    } catch (err) {
      console.error('[NormalizedEfficiencyChart] fetchData failed:', err)
      this.data = null
    }

    this.loading = false
    this.render()
  }

  render() {
    if (!this.container) return
    this.container.innerHTML = ''
    this.container.className = 'efficiency-chart-component'

    // Header with tabs + % change badge
    const header = document.createElement('div')
    header.className = 'efficiency-chart-header'

    const tabBar = document.createElement('div')
    tabBar.className = 'efficiency-chart-tabs'
    for (const tab of TABS) {
      const btn = document.createElement('button')
      btn.className = `efficiency-chart-tab${this.activeTab === tab.id ? ' active' : ''}`
      btn.textContent = tab.label
      btn.dataset.tab = tab.id
      btn.addEventListener('click', () => {
        this.activeTab = tab.id
        this.render()
      })
      tabBar.appendChild(btn)
    }
    header.appendChild(tabBar)

    // % change badge
    const weeks = this.data?.weeks || []
    const pctChange = NormalizedEfficiencyChart.computePercentChange(weeks, this.activeTab)
    if (pctChange !== null) {
      const badge = document.createElement('span')
      badge.className = `efficiency-chart-pct ${pctChange <= 0 ? 'pct-good' : 'pct-bad'}`
      const arrow = pctChange < 0 ? '\u2193' : pctChange > 0 ? '\u2191' : '\u2192' // ↓ ↑ →
      badge.textContent = `${arrow} ${Math.abs(pctChange).toFixed(1)}%`
      badge.title = 'Change from first to latest week'
      header.appendChild(badge)
    }

    this.container.appendChild(header)

    // Loading / empty
    if (this.loading) {
      const el = document.createElement('div')
      el.className = 'efficiency-chart-loading'
      el.textContent = 'Loading...'
      this.container.appendChild(el)
      return
    }

    if (weeks.length === 0) {
      const el = document.createElement('div')
      el.className = 'efficiency-chart-empty'
      el.textContent = 'No data available'
      this.container.appendChild(el)
      return
    }

    // Canvas
    const canvasWrap = document.createElement('div')
    canvasWrap.className = 'efficiency-chart-canvas-wrap'
    this._canvas = document.createElement('canvas')
    this._canvas.className = 'efficiency-chart-canvas'
    canvasWrap.appendChild(this._canvas)
    this.container.appendChild(canvasWrap)

    this._createTooltip()
    this._attachCanvasListeners()
    this._drawChart()
  }

  // ── Chart drawing ────────────────────────────────────────────

  _drawChart() {
    const weeks = this.data?.weeks || []
    if (!this._canvas || weeks.length === 0) return

    const tab = TABS.find(t => t.id === this.activeTab) || TABS[0]
    const values = weeks.map(w => w[tab.id] || 0)

    const rect = this._canvas.parentElement.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const cssWidth = Math.max(rect.width, 400)
    const cssHeight = 260

    this._canvas.style.width = `${cssWidth}px`
    this._canvas.style.height = `${cssHeight}px`
    this._canvas.width = cssWidth * dpr
    this._canvas.height = cssHeight * dpr

    const ctx = this._canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, cssWidth, cssHeight)

    const pad = { top: 20, right: 20, bottom: 50, left: 65 }
    const cw = cssWidth - pad.left - pad.right
    const ch = cssHeight - pad.top - pad.bottom

    const maxVal = Math.max(...values, 0.01)
    const barWidth = (cw / weeks.length) * 0.65
    const barGap = (cw / weeks.length) * 0.35
    const barStep = cw / weeks.length

    // ── Grid lines ──
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(pad.left + cw, y)
      ctx.stroke()
    }

    // ── Y-axis labels ──
    ctx.fillStyle = '#aaa'
    ctx.font = '10px system-ui'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const val = maxVal - (maxVal / 4) * i
      const y = pad.top + (ch / 4) * i
      ctx.fillText(tab.format(val), pad.left - 8, y + 3)
    }

    // ── Bars (color-coded by value) ──
    const thresholds = NormalizedEfficiencyChart.computeThresholds(values)

    for (let i = 0; i < weeks.length; i++) {
      const v = values[i]
      const barH = (v / maxVal) * ch
      const x = pad.left + i * barStep + barGap / 2
      const y = pad.top + ch - barH

      // Color: lower is better for all efficiency metrics
      ctx.fillStyle = NormalizedEfficiencyChart.barColor(v, thresholds)

      if (weeks[i].storyCount === 0 && (tab.id === 'costPerStory' || tab.id === 'tokensPerStory')) {
        // Zero-story week: draw a thin dashed outline instead
        ctx.strokeStyle = '#555'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.strokeRect(x, pad.top + ch - 4, barWidth, 4)
        ctx.setLineDash([])
      } else {
        ctx.fillRect(x, y, barWidth, Math.max(barH, 1))
      }

      // X-axis week label
      ctx.fillStyle = '#888'
      ctx.font = '9px system-ui'
      ctx.textAlign = 'center'
      const label = weeks[i].week.replace(/^\d{4}-/, '')
      ctx.fillText(label, x + barWidth / 2, cssHeight - 12)
    }

    // ── Trend line (linear regression) ──
    const regression = NormalizedEfficiencyChart.linearRegression(values)
    if (regression) {
      ctx.beginPath()
      ctx.strokeStyle = '#e0e0e0'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])

      for (let i = 0; i < weeks.length; i++) {
        const regVal = regression.slope * i + regression.intercept
        const clampedVal = Math.max(regVal, 0)
        const x = pad.left + i * barStep + barGap / 2 + barWidth / 2
        const y = pad.top + ch - (clampedVal / maxVal) * ch

        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Cache for hit-testing
    this._chartLayout = { pad, cw, ch, cssWidth, cssHeight, barStep, barGap, barWidth, weeks, values, tab }
  }

  // ── Mouse interaction ────────────────────────────────────────

  _attachCanvasListeners() {
    if (!this._canvas) return

    this._canvas.addEventListener('mousemove', (e) => {
      const idx = this._hitTestIndex(e)
      if (idx >= 0) {
        this._showTooltip(e, idx)
      } else {
        this._hideTooltip()
      }
    })

    this._canvas.addEventListener('mouseleave', () => this._hideTooltip())
  }

  _hitTestIndex(e) {
    if (!this._chartLayout) return -1
    const { pad, barStep, barGap, barWidth, weeks } = this._chartLayout
    const rect = this._canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left

    for (let i = 0; i < weeks.length; i++) {
      const x = pad.left + i * barStep + barGap / 2
      if (mx >= x && mx <= x + barWidth) return i
    }
    return -1
  }

  // ── Tooltip ──────────────────────────────────────────────────

  _createTooltip() {
    if (this._tooltip) return
    this._tooltip = document.createElement('div')
    this._tooltip.className = 'efficiency-chart-tooltip'
    this._tooltip.style.display = 'none'
    document.body.appendChild(this._tooltip)
  }

  _showTooltip(e, idx) {
    if (!this._tooltip || !this._chartLayout) return
    const { weeks, tab } = this._chartLayout
    const w = weeks[idx]
    if (!w) return

    const value = w[tab.id] || 0
    this._tooltip.innerHTML = `
      <strong>${w.week}</strong>
      <div>${tab.label}: ${tab.format(value)}</div>
      <div style="color:#888">Stories: ${w.storyCount} &middot; Ops: ${w.operations}</div>
    `
    this._tooltip.style.display = 'block'
    this._tooltip.style.left = `${e.clientX + 14}px`
    this._tooltip.style.top = `${e.clientY - 10}px`
  }

  _hideTooltip() {
    if (this._tooltip) this._tooltip.style.display = 'none'
  }

  // ── Static helpers (testable without DOM) ────────────────────

  /**
   * Compute linear regression (ordinary least squares).
   * @param {number[]} values - Y values; X values are indices [0..n-1]
   * @returns {{ slope: number, intercept: number } | null}
   */
  static linearRegression(values) {
    const n = values.length
    if (n < 2) return null

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
    for (let i = 0; i < n; i++) {
      sumX += i
      sumY += values[i]
      sumXY += i * values[i]
      sumX2 += i * i
    }

    const denom = n * sumX2 - sumX * sumX
    if (denom === 0) return null

    const slope = (n * sumXY - sumX * sumY) / denom
    const intercept = (sumY - slope * sumX) / n

    return { slope: +slope.toFixed(6), intercept: +intercept.toFixed(6) }
  }

  /**
   * Compute % change from first non-zero week to last non-zero week.
   * @param {Object[]} weeks - Array of week objects
   * @param {string} metricKey - Key to extract
   * @returns {number|null} Percent change (positive = increase, negative = decrease)
   */
  static computePercentChange(weeks, metricKey) {
    if (!weeks || weeks.length < 2) return null

    // Find first and last non-zero value
    let first = null, last = null
    for (let i = 0; i < weeks.length; i++) {
      const v = weeks[i][metricKey] || 0
      if (v > 0) {
        if (first === null) first = v
        last = v
      }
    }

    if (first === null || first === 0) return null
    return +((last - first) / first * 100).toFixed(1)
  }

  /**
   * Compute p25 and p75 thresholds from values for color coding.
   * @param {number[]} values
   * @returns {{ low: number, high: number }}
   */
  static computeThresholds(values) {
    const nonZero = values.filter(v => v > 0).sort((a, b) => a - b)
    if (nonZero.length === 0) return { low: 0, high: 0 }
    const p25 = nonZero[Math.floor(nonZero.length * 0.25)] || 0
    const p75 = nonZero[Math.floor(nonZero.length * 0.75)] || 0
    return { low: p25, high: p75 }
  }

  /**
   * Map a value to a bar color: green (below p25), yellow (p25-p75), red (above p75).
   * Lower values are "better" for efficiency metrics.
   * @param {number} value
   * @param {{ low: number, high: number }} thresholds
   * @returns {string} CSS color
   */
  static barColor(value, thresholds) {
    if (value <= 0) return '#555'
    if (value <= thresholds.low) return '#48bb78'    // green — efficient
    if (value <= thresholds.high) return '#ecc94b'   // yellow — moderate
    return '#f56565'                                  // red — expensive
  }

  /**
   * Abbreviate a number: 1500 → "1.5k", 2500000 → "2.5M"
   */
  static abbreviateNumber(n) {
    if (n == null || isNaN(n)) return '0'
    if (n >= 1000000) return `${parseFloat((n / 1000000).toFixed(1))}M`
    if (n >= 1000) return `${parseFloat((n / 1000).toFixed(1))}k`
    return String(Math.round(n))
  }

  /**
   * Format milliseconds into compact human-readable string.
   */
  static formatDuration(ms) {
    if (!ms || ms <= 0) return '0s'
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    if (h > 0) return `${h}h${m % 60}m`
    if (m > 0) return `${m}m${s % 60}s`
    return `${s}s`
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this._tooltip) {
      this._tooltip.remove()
      this._tooltip = null
    }
    if (this.container) {
      this.container.innerHTML = ''
      this.container = null
    }
    this._canvas = null
    this._chartLayout = null
    this.data = null
  }
}

export default NormalizedEfficiencyChart
