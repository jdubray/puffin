/**
 * DailyTrendsChart - Multi-metric daily trends visualization.
 *
 * Features:
 * - Multi-line area chart: cost (filled area), tokens (line), operations (line)
 * - Dual Y-axes: left = cost USD, right = tokens
 * - Sparkline rows below chart for tokens & operations
 * - Hover tooltip with exact values for each day
 * - Click day to emit filter event
 * - Color-coded legend
 */

const METRICS = {
  cost: { key: 'totalCost', label: 'Cost', color: '#6c63ff', fillAlpha: 0.25 },
  tokens: { key: 'totalTokens', label: 'Tokens', color: '#48bb78', fillAlpha: 0 },
  operations: { key: 'operations', label: 'Operations', color: '#ecc94b', fillAlpha: 0 }
}

const SPARKLINE_CHARS = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588' // ▁▂▃▄▅▆▇█

export class DailyTrendsChart {
  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} [options]
   * @param {Function} [options.invoke] - IPC invoke function
   * @param {Function} [options.onDayClick] - Callback when a day is clicked: (dateString) => void
   */
  constructor(element, options = {}) {
    this.container = element
    this.invoke = options.invoke || ((plugin, handler, args) =>
      window.puffin.plugins.invoke(plugin, handler, args))
    this.onDayClick = options.onDayClick || null

    // State
    this.days = 30
    this.data = null       // getDailyTrends() result
    this.loading = false
    this.hoveredIndex = -1 // index into this.data.days

    // DOM refs
    this._canvas = null
    this._tooltip = null
    this._sparklineRow = null
  }

  /**
   * Initialize: render shell and fetch data
   */
  async init() {
    this.render()
    await this.fetchData()
  }

  /**
   * Fetch daily trends from backend
   */
  async fetchData() {
    this.loading = true
    this.render()

    try {
      this.data = await this.invoke('stats-plugin', 'getDailyTrends', { days: this.days })
    } catch (err) {
      console.error('[DailyTrendsChart] fetchData failed:', err)
      this.data = null
    }

    this.loading = false
    this.render()
  }

  /**
   * Full render: legend, canvas, sparklines
   */
  render() {
    if (!this.container) return
    this.container.innerHTML = ''
    this.container.className = 'daily-trends-component'

    // Header + legend
    const header = document.createElement('div')
    header.className = 'daily-trends-header'
    header.innerHTML = `
      <h3 class="daily-trends-title">Daily Trends (${this.days}d)</h3>
      <div class="daily-trends-legend">
        ${Object.values(METRICS).map(m =>
          `<span class="daily-trends-legend-item">
            <span class="daily-trends-legend-swatch" style="background:${m.color}"></span>
            ${m.label}
          </span>`
        ).join('')}
      </div>
    `
    this.container.appendChild(header)

    // Loading / empty state
    if (this.loading) {
      const loadEl = document.createElement('div')
      loadEl.className = 'daily-trends-loading'
      loadEl.textContent = 'Loading...'
      this.container.appendChild(loadEl)
      return
    }

    const entries = this.data?.days || []
    if (entries.length === 0) {
      const emptyEl = document.createElement('div')
      emptyEl.className = 'daily-trends-empty'
      emptyEl.textContent = 'No data available for this period'
      this.container.appendChild(emptyEl)
      return
    }

    // Canvas container
    const canvasWrap = document.createElement('div')
    canvasWrap.className = 'daily-trends-canvas-wrap'
    this._canvas = document.createElement('canvas')
    this._canvas.className = 'daily-trends-canvas'
    canvasWrap.appendChild(this._canvas)
    this.container.appendChild(canvasWrap)

    // Tooltip
    this._createTooltip()

    // Attach mouse listeners on canvas
    this._attachCanvasListeners()

    // Draw chart
    this._drawChart()

    // Sparkline rows
    this._renderSparklines(entries)
  }

  // ── Canvas chart drawing ─────────────────────────────────────

  _drawChart() {
    const entries = this.data?.days || []
    if (!this._canvas || entries.length === 0) return

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

    const pad = { top: 20, right: 70, bottom: 50, left: 65 }
    const cw = cssWidth - pad.left - pad.right
    const ch = cssHeight - pad.top - pad.bottom

    const maxCost = Math.max(...entries.map(d => d.totalCost), 0.01)
    const maxTokens = Math.max(...entries.map(d => d.totalTokens), 1)
    const maxOps = Math.max(...entries.map(d => d.operations), 1)

    const xStep = entries.length > 1 ? cw / (entries.length - 1) : cw

    // Helper: map value to Y
    const yForCost = v => pad.top + ch - (v / maxCost) * ch
    const yForTokens = v => pad.top + ch - (v / maxTokens) * ch
    const yForOps = v => pad.top + ch - (v / maxOps) * ch
    const xFor = i => pad.left + i * xStep

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

    // ── Left Y-axis labels (cost) ──
    ctx.fillStyle = METRICS.cost.color
    ctx.font = '10px system-ui'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const val = maxCost - (maxCost / 4) * i
      const y = pad.top + (ch / 4) * i
      ctx.fillText(`$${val.toFixed(2)}`, pad.left - 8, y + 3)
    }

    // ── Right Y-axis labels (tokens) ──
    ctx.fillStyle = METRICS.tokens.color
    ctx.textAlign = 'left'
    for (let i = 0; i <= 4; i++) {
      const val = maxTokens - (maxTokens / 4) * i
      const y = pad.top + (ch / 4) * i
      ctx.fillText(DailyTrendsChart.abbreviateNumber(val), pad.left + cw + 8, y + 3)
    }

    // ── X-axis labels ──
    ctx.fillStyle = '#888'
    ctx.font = '9px system-ui'
    ctx.textAlign = 'center'
    const labelEvery = Math.max(1, Math.floor(entries.length / 10))
    for (let i = 0; i < entries.length; i += labelEvery) {
      const x = xFor(i)
      const label = entries[i].date.slice(5) // "MM-DD"
      ctx.save()
      ctx.translate(x, cssHeight - 8)
      ctx.rotate(-Math.PI / 5)
      ctx.textAlign = 'right'
      ctx.fillText(label, 0, 0)
      ctx.restore()
    }

    // ── Cost area fill ──
    ctx.beginPath()
    ctx.moveTo(xFor(0), yForCost(0))
    for (let i = 0; i < entries.length; i++) {
      ctx.lineTo(xFor(i), yForCost(entries[i].totalCost))
    }
    ctx.lineTo(xFor(entries.length - 1), yForCost(0))
    ctx.closePath()
    ctx.fillStyle = DailyTrendsChart.colorWithAlpha(METRICS.cost.color, 0.2)
    ctx.fill()

    // ── Cost line ──
    this._drawLine(ctx, entries, xFor, yForCost, 'totalCost', METRICS.cost.color, 2)

    // ── Tokens line ──
    this._drawLine(ctx, entries, xFor, yForTokens, 'totalTokens', METRICS.tokens.color, 1.5)

    // ── Operations line ──
    this._drawLine(ctx, entries, xFor, yForOps, 'operations', METRICS.operations.color, 1.5)

    // ── Hover highlight ──
    if (this.hoveredIndex >= 0 && this.hoveredIndex < entries.length) {
      const hx = xFor(this.hoveredIndex)
      ctx.strokeStyle = '#aaa'
      ctx.lineWidth = 0.8
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(hx, pad.top)
      ctx.lineTo(hx, pad.top + ch)
      ctx.stroke()
      ctx.setLineDash([])

      // Dots at each metric
      const day = entries[this.hoveredIndex]
      this._drawDot(ctx, hx, yForCost(day.totalCost), METRICS.cost.color)
      this._drawDot(ctx, hx, yForTokens(day.totalTokens), METRICS.tokens.color)
      this._drawDot(ctx, hx, yForOps(day.operations), METRICS.operations.color)
    }

    // Cache layout info for hit testing
    this._chartLayout = { pad, cw, ch, cssWidth, cssHeight, xStep, entries }
  }

  _drawLine(ctx, entries, xFor, yFor, key, color, lineWidth) {
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    for (let i = 0; i < entries.length; i++) {
      const x = xFor(i)
      const y = yFor(entries[i][key])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  _drawDot(ctx, x, y, color) {
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // ── Mouse interaction ────────────────────────────────────────

  _attachCanvasListeners() {
    if (!this._canvas) return

    this._canvas.addEventListener('mousemove', (e) => {
      const idx = this._hitTestIndex(e)
      if (idx !== this.hoveredIndex) {
        this.hoveredIndex = idx
        this._drawChart()
        if (idx >= 0) {
          this._showTooltip(e, idx)
        } else {
          this._hideTooltip()
        }
      } else if (idx >= 0) {
        this._moveTooltip(e)
      }
    })

    this._canvas.addEventListener('mouseleave', () => {
      if (this.hoveredIndex >= 0) {
        this.hoveredIndex = -1
        this._drawChart()
        this._hideTooltip()
      }
    })

    this._canvas.addEventListener('click', (e) => {
      const idx = this._hitTestIndex(e)
      if (idx >= 0 && this.onDayClick) {
        const day = (this.data?.days || [])[idx]
        if (day) this.onDayClick(day.date)
      }
    })
  }

  _hitTestIndex(e) {
    if (!this._chartLayout) return -1
    const { pad, xStep, entries } = this._chartLayout
    const rect = this._canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    if (mx < pad.left || mx > pad.left + this._chartLayout.cw ||
        my < pad.top || my > pad.top + this._chartLayout.ch) {
      return -1
    }

    const idx = Math.round((mx - pad.left) / xStep)
    if (idx >= 0 && idx < entries.length) return idx
    return -1
  }

  // ── Tooltip ──────────────────────────────────────────────────

  _createTooltip() {
    if (this._tooltip) return
    this._tooltip = document.createElement('div')
    this._tooltip.className = 'daily-trends-tooltip'
    this._tooltip.style.display = 'none'
    document.body.appendChild(this._tooltip)
  }

  _showTooltip(e, idx) {
    if (!this._tooltip) return
    const day = (this.data?.days || [])[idx]
    if (!day) return

    this._tooltip.innerHTML = `
      <strong>${day.date}</strong>
      <div class="daily-trends-tooltip-row">
        <span class="daily-trends-tooltip-swatch" style="background:${METRICS.cost.color}"></span>
        Cost: $${day.totalCost.toFixed(2)}
      </div>
      <div class="daily-trends-tooltip-row">
        <span class="daily-trends-tooltip-swatch" style="background:${METRICS.tokens.color}"></span>
        Tokens: ${day.totalTokens.toLocaleString()}
      </div>
      <div class="daily-trends-tooltip-row">
        <span class="daily-trends-tooltip-swatch" style="background:${METRICS.operations.color}"></span>
        Ops: ${day.operations}
      </div>
      <div class="daily-trends-tooltip-row" style="color:#888">
        Duration: ${this._fmtDuration(day.totalDuration)}
      </div>
    `
    this._tooltip.style.display = 'block'
    this._moveTooltip(e)
  }

  _moveTooltip(e) {
    if (!this._tooltip) return
    this._tooltip.style.left = `${e.clientX + 14}px`
    this._tooltip.style.top = `${e.clientY - 10}px`
  }

  _hideTooltip() {
    if (this._tooltip) this._tooltip.style.display = 'none'
  }

  // ── Sparklines ───────────────────────────────────────────────

  _renderSparklines(entries) {
    const wrap = document.createElement('div')
    wrap.className = 'daily-trends-sparklines'

    const tokenValues = entries.map(d => d.totalTokens)
    const opValues = entries.map(d => d.operations)

    wrap.innerHTML = `
      <div class="daily-trends-sparkline-row">
        <span class="daily-trends-sparkline-label" style="color:${METRICS.tokens.color}">Tokens</span>
        <span class="daily-trends-sparkline-chart">${DailyTrendsChart.renderSparkline(tokenValues, METRICS.tokens.color)}</span>
      </div>
      <div class="daily-trends-sparkline-row">
        <span class="daily-trends-sparkline-label" style="color:${METRICS.operations.color}">Ops</span>
        <span class="daily-trends-sparkline-chart">${DailyTrendsChart.renderSparkline(opValues, METRICS.operations.color)}</span>
      </div>
    `
    this.container.appendChild(wrap)
  }

  // ── Static helpers ───────────────────────────────────────────

  /**
   * Render a unicode sparkline string from an array of numbers.
   * @param {number[]} values
   * @param {string} [color] - CSS color (used for inline styling on each char)
   * @returns {string} HTML with colored spans
   */
  static renderSparkline(values, color) {
    if (!values || values.length === 0) return ''
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1

    return values.map(v => {
      const idx = Math.min(Math.round(((v - min) / range) * 7), 7)
      const ch = SPARKLINE_CHARS[idx]
      return color
        ? `<span style="color:${color}">${ch}</span>`
        : ch
    }).join('')
  }

  /**
   * Abbreviate a number: 1500 → "1.5k", 2500000 → "2.5M"
   * @param {number} n
   * @returns {string}
   */
  static abbreviateNumber(n) {
    if (n == null || isNaN(n)) return '0'
    if (n >= 1000000) return `${parseFloat((n / 1000000).toFixed(1))}M`
    if (n >= 1000) return `${parseFloat((n / 1000).toFixed(1))}k`
    return String(Math.round(n))
  }

  /**
   * Add alpha channel to a hex color.
   * @param {string} hex - e.g. "#6c63ff"
   * @param {number} alpha - 0 to 1
   * @returns {string} rgba() string
   */
  static colorWithAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  // ── Helpers ──────────────────────────────────────────────────

  _fmtDuration(ms) {
    if (!ms || ms <= 0) return '0s'
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    if (h > 0) return `${h}h ${m % 60}m`
    if (m > 0) return `${m}m ${s % 60}s`
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

export default DailyTrendsChart
