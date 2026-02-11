/**
 * ComponentTreemap - Interactive treemap showing component-level cost breakdown.
 *
 * Features:
 * - Rectangle size proportional to selected metric (cost or operations)
 * - Color gradient based on efficiency (cost per operation)
 * - Click to drill down into operation-level view
 * - Metric toggle and time range selector
 * - Hover tooltips with exact values
 */

import { COMPONENT_DISPLAY_NAMES } from './component-names.js'

export class ComponentTreemap {
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
    this.metric = 'totalCost'    // 'totalCost' | 'operations'
    this.days = 30               // 7 | 30 | 90
    this.breakdown = null        // getComponentBreakdown() result
    this.drillComponent = null   // component id when drilled down
    this.drillData = null        // getOperationStats() result
    this.loading = false
    this._tooltip = null
  }

  /**
   * Initialize and fetch data
   */
  async init() {
    this.render()
    await this.fetchData()
  }

  /**
   * Render the full component (controls + treemap area)
   */
  render() {
    if (!this.container) return
    this.container.innerHTML = ''
    this.container.className = 'treemap-component'

    // Controls bar
    const controls = document.createElement('div')
    controls.className = 'treemap-controls'
    controls.innerHTML = `
      <div class="treemap-control-group">
        <label class="treemap-control-label">Metric</label>
        <div class="treemap-toggle" data-group="metric">
          <button class="treemap-toggle-btn ${this.metric === 'totalCost' ? 'active' : ''}" data-value="totalCost">Cost</button>
          <button class="treemap-toggle-btn ${this.metric === 'operations' ? 'active' : ''}" data-value="operations">Operations</button>
        </div>
      </div>
      <div class="treemap-control-group">
        <label class="treemap-control-label">Period</label>
        <div class="treemap-toggle" data-group="days">
          <button class="treemap-toggle-btn ${this.days === 7 ? 'active' : ''}" data-value="7">7d</button>
          <button class="treemap-toggle-btn ${this.days === 30 ? 'active' : ''}" data-value="30">30d</button>
          <button class="treemap-toggle-btn ${this.days === 90 ? 'active' : ''}" data-value="90">90d</button>
        </div>
      </div>
    `
    this.container.appendChild(controls)

    // Breadcrumb / back nav (visible when drilled down)
    const breadcrumb = document.createElement('div')
    breadcrumb.className = 'treemap-breadcrumb'
    breadcrumb.style.display = this.drillComponent ? 'flex' : 'none'
    breadcrumb.innerHTML = `
      <button class="treemap-back-btn">← All Components</button>
      <span class="treemap-breadcrumb-label">${this._escapeHtml(this._displayName(this.drillComponent))}</span>
    `
    this.container.appendChild(breadcrumb)

    // Treemap area
    const treemapArea = document.createElement('div')
    treemapArea.className = 'treemap-area'
    if (this.loading) {
      treemapArea.innerHTML = '<div class="treemap-loading">Loading...</div>'
    }
    this.container.appendChild(treemapArea)

    // Tooltip (hidden, appended to body)
    this._createTooltip()

    // Attach control listeners
    this._attachControlListeners(controls, breadcrumb)

    // Render the treemap rectangles
    if (!this.loading) {
      this._renderTreemap(treemapArea)
    }
  }

  /**
   * Fetch component breakdown (or operation drill-down) from backend
   */
  async fetchData() {
    this.loading = true
    this.render()

    try {
      if (this.drillComponent) {
        this.drillData = await this.invoke('stats-plugin', 'getOperationStats', {
          component: this.drillComponent,
          days: this.days
        })
      } else {
        this.breakdown = await this.invoke('stats-plugin', 'getComponentBreakdown', {
          days: this.days
        })
      }
    } catch (err) {
      console.error('[ComponentTreemap] fetchData failed:', err)
    }

    this.loading = false
    this.render()
  }

  // ── Treemap layout & rendering ─────────────────────────────────

  /**
   * Render treemap rectangles into the given container
   */
  _renderTreemap(area) {
    const items = this._getTreemapItems()
    if (items.length === 0) {
      area.innerHTML = '<div class="treemap-empty">No data available for this period</div>'
      return
    }

    const rect = area.getBoundingClientRect()
    const width = Math.max(rect.width, 300)
    const height = 340
    area.style.height = `${height}px`
    area.style.position = 'relative'

    const layout = ComponentTreemap.computeLayout(items, width, height)
    const maxEfficiency = Math.max(...items.map(i => i.efficiency), 0.001)

    for (const node of layout) {
      const el = document.createElement('div')
      el.className = 'treemap-rect'
      el.style.left = `${node.x}px`
      el.style.top = `${node.y}px`
      el.style.width = `${node.w}px`
      el.style.height = `${node.h}px`

      // Color: gradient based on efficiency (cost per operation)
      const intensity = node.item.efficiency / maxEfficiency
      el.style.backgroundColor = ComponentTreemap.efficiencyColor(intensity)

      // Label (only if rect is big enough)
      const showLabel = node.w > 60 && node.h > 40
      const showValue = node.w > 80 && node.h > 55
      el.innerHTML = `
        ${showLabel ? `<span class="treemap-rect-label">${this._escapeHtml(node.item.label)}</span>` : ''}
        ${showValue ? `<span class="treemap-rect-value">${this._escapeHtml(node.item.formattedValue)}</span>` : ''}
      `

      // Tooltip on hover
      el.addEventListener('mouseenter', (e) => this._showTooltip(e, node.item))
      el.addEventListener('mousemove', (e) => this._moveTooltip(e))
      el.addEventListener('mouseleave', () => this._hideTooltip())

      // Click to drill down (only at component level)
      if (!this.drillComponent && node.item.id) {
        el.style.cursor = 'pointer'
        el.addEventListener('click', () => {
          this.drillComponent = node.item.id
          this.drillData = null
          this.fetchData()
        })
      }

      area.appendChild(el)
    }
  }

  /**
   * Build normalized items array from current data
   * @returns {Array<Object>}
   */
  _getTreemapItems() {
    if (this.drillComponent && this.drillData) {
      return (this.drillData.operations || [])
        .filter(op => this._metricValue(op) > 0)
        .map(op => ({
          id: null,
          label: op.operation,
          value: this._metricValue(op),
          formattedValue: this._formatMetricValue(this._metricValue(op)),
          efficiency: op.count > 0 ? (op.totalCost / op.count) : 0,
          raw: op
        }))
        .sort((a, b) => b.value - a.value)
    }

    if (this.breakdown) {
      return (this.breakdown.components || [])
        .filter(c => this._metricValue(c) > 0)
        .map(c => ({
          id: c.component,
          label: this._displayName(c.component),
          value: this._metricValue(c),
          formattedValue: this._formatMetricValue(this._metricValue(c)),
          efficiency: c.operations > 0 ? (c.totalCost / c.operations) : 0,
          raw: c
        }))
        .sort((a, b) => b.value - a.value)
    }

    return []
  }

  /**
   * Extract the currently selected metric value from a data row.
   * Handles both component breakdown and operation stats shapes.
   */
  _metricValue(row) {
    if (this.metric === 'operations') {
      return row.operations || row.count || 0
    }
    return row[this.metric] || 0
  }

  /**
   * Format the metric value for display
   */
  _formatMetricValue(val) {
    if (this.metric === 'totalCost') {
      return typeof val === 'number' ? `$${val.toFixed(2)}` : '$0.00'
    }
    // operations
    if (val >= 1000000) return `${parseFloat((val / 1000000).toFixed(1))}M`
    if (val >= 1000) return `${parseFloat((val / 1000).toFixed(1))}k`
    return String(val)
  }

  // ── Squarified treemap layout algorithm ────────────────────────

  /**
   * Compute squarified treemap layout.
   * @param {Array<Object>} items - Items with `.value` property (sorted desc)
   * @param {number} width - Container width
   * @param {number} height - Container height
   * @returns {Array<Object>} Layout nodes with {x, y, w, h, item}
   */
  static computeLayout(items, width, height) {
    if (items.length === 0) return []

    const totalValue = items.reduce((s, i) => s + i.value, 0)
    if (totalValue <= 0) return []

    // Normalize values to areas
    const totalArea = width * height
    const normalized = items.map(item => ({
      item,
      area: (item.value / totalValue) * totalArea
    }))

    const result = []
    ComponentTreemap._squarify(normalized, { x: 0, y: 0, w: width, h: height }, result)
    return result
  }

  /**
   * Recursive squarified layout.
   * @private
   */
  static _squarify(nodes, rect, result) {
    if (nodes.length === 0) return
    if (nodes.length === 1) {
      result.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, item: nodes[0].item })
      return
    }

    // Determine shortest side
    const shortSide = Math.min(rect.w, rect.h)
    let row = []
    let rowArea = 0
    let remaining = [...nodes]

    for (let i = 0; i < nodes.length; i++) {
      const testRow = [...row, nodes[i]]
      const testArea = rowArea + nodes[i].area

      if (row.length === 0 || ComponentTreemap._worstRatio(testRow, testArea, shortSide) <=
          ComponentTreemap._worstRatio(row, rowArea, shortSide)) {
        row = testRow
        rowArea = testArea
        remaining = nodes.slice(i + 1)
      } else {
        remaining = nodes.slice(i)
        break
      }
    }

    // Lay out the row
    const isHorizontal = rect.w >= rect.h
    const rowLen = rowArea / (isHorizontal ? rect.h : rect.w)
    let offset = 0

    for (const node of row) {
      const nodeLen = node.area / rowLen
      if (isHorizontal) {
        result.push({
          x: rect.x,
          y: rect.y + offset,
          w: Math.max(rowLen, 0),
          h: Math.max(nodeLen, 0),
          item: node.item
        })
      } else {
        result.push({
          x: rect.x + offset,
          y: rect.y,
          w: Math.max(nodeLen, 0),
          h: Math.max(rowLen, 0),
          item: node.item
        })
      }
      offset += nodeLen
    }

    // Recurse on remaining
    if (remaining.length > 0) {
      const newRect = isHorizontal
        ? { x: rect.x + rowLen, y: rect.y, w: rect.w - rowLen, h: rect.h }
        : { x: rect.x, y: rect.y + rowLen, w: rect.w, h: rect.h - rowLen }
      ComponentTreemap._squarify(remaining, newRect, result)
    }
  }

  /**
   * Compute the worst aspect ratio in a row.
   * @private
   */
  static _worstRatio(row, totalArea, shortSide) {
    if (row.length === 0 || totalArea <= 0 || shortSide <= 0) return Infinity
    const s2 = shortSide * shortSide
    const areas = row.map(n => n.area)
    const maxArea = Math.max(...areas)
    const minArea = Math.min(...areas)
    return Math.max(
      (s2 * maxArea) / (totalArea * totalArea),
      (totalArea * totalArea) / (s2 * minArea)
    )
  }

  /**
   * Map efficiency intensity [0..1] to a color.
   * Low efficiency (cheap per op) = cool blue, high = warm red/orange.
   * @param {number} intensity - 0 to 1
   * @returns {string} CSS color
   */
  static efficiencyColor(intensity) {
    const t = Math.min(Math.max(intensity, 0), 1)
    // Interpolate from blue (low cost/op) to red (high cost/op)
    // Using HSL: hue 220 (blue) → hue 0 (red), saturation 60%, lightness 35-45%
    const hue = Math.round(220 * (1 - t))
    const lightness = 35 + Math.round(t * 10)
    return `hsl(${hue}, 60%, ${lightness}%)`
  }

  // ── Tooltip ────────────────────────────────────────────────────

  _createTooltip() {
    if (this._tooltip) return
    this._tooltip = document.createElement('div')
    this._tooltip.className = 'treemap-tooltip'
    this._tooltip.style.display = 'none'
    document.body.appendChild(this._tooltip)
  }

  _showTooltip(e, item) {
    if (!this._tooltip) return
    const raw = item.raw || {}

    let html = `<strong>${this._escapeHtml(item.label)}</strong>`
    if (raw.totalCost != null) html += `<br>Cost: $${raw.totalCost.toFixed(2)}`
    const ops = raw.operations || raw.count
    if (ops != null) html += `<br>Operations: ${ops}`
    if (raw.avgDuration != null) html += `<br>Avg Duration: ${this._fmtDuration(raw.avgDuration)}`
    if (raw.pctOfCost != null) html += `<br>% of Cost: ${raw.pctOfCost}%`
    if (raw.avgCostPerOp != null) html += `<br>Avg Cost/Op: $${raw.avgCostPerOp.toFixed(4)}`

    this._tooltip.innerHTML = html
    this._tooltip.style.display = 'block'
    this._moveTooltip(e)
  }

  _moveTooltip(e) {
    if (!this._tooltip) return
    this._tooltip.style.left = `${e.clientX + 12}px`
    this._tooltip.style.top = `${e.clientY + 12}px`
  }

  _hideTooltip() {
    if (this._tooltip) this._tooltip.style.display = 'none'
  }

  // ── Control listeners ──────────────────────────────────────────

  _attachControlListeners(controls, breadcrumb) {
    // Metric toggle
    controls.querySelector('[data-group="metric"]')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.treemap-toggle-btn')
      if (!btn) return
      this.metric = btn.dataset.value
      this.render()
      if (!this.loading) this._renderTreemap(this.container.querySelector('.treemap-area'))
    })

    // Days toggle
    controls.querySelector('[data-group="days"]')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.treemap-toggle-btn')
      if (!btn) return
      this.days = parseInt(btn.dataset.value, 10)
      this.fetchData()
    })

    // Back button
    breadcrumb.querySelector('.treemap-back-btn')?.addEventListener('click', () => {
      this.drillComponent = null
      this.drillData = null
      this.fetchData()
    })
  }

  // ── Helpers ────────────────────────────────────────────────────

  _displayName(componentId) {
    if (!componentId) return ''
    return COMPONENT_DISPLAY_NAMES[componentId] || componentId
  }

  _escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = String(text)
    return div.innerHTML
  }

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
    this.breakdown = null
    this.drillData = null
  }
}

export default ComponentTreemap
