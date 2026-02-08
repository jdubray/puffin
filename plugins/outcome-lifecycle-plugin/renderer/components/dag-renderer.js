/**
 * DAG Renderer
 *
 * SVG-based graph visualization for outcome lifecycles.
 * Supports two modes:
 * - **Granular mode**: Shows all individual lifecycle outcomes (getDag)
 * - **Synthesized mode**: Shows Claude-synthesized high-level outcome flow (getSynthesizedDag)
 *
 * In synthesized mode, nodes represent business-value outcomes with
 * aggregation badges, and a control bar provides re-synthesis.
 *
 * Note: Renderer files use ES modules (import/export); main-process files use CommonJS.
 *
 * @module outcome-lifecycle-plugin/renderer/dag-renderer
 */

const PLUGIN_NAME = 'outcome-lifecycle-plugin'

/* ==========================================================================
   Constants
   ========================================================================== */

const NODE_WIDTH = 180
const NODE_HEIGHT = 64
const NODE_RADIUS = 10
const PADDING = 50
const ARROW_SIZE = 8

const STATUS_COLORS = {
  not_started: { fill: '#3a3a3a', stroke: '#666', text: '#ccc' },
  in_progress: { fill: '#1e3a5f', stroke: '#3b82f6', text: '#93c5fd' },
  achieved:    { fill: '#14532d', stroke: '#22c55e', text: '#86efac' }
}

const DEFAULT_COLOR = STATUS_COLORS.not_started

/* ==========================================================================
   DAGRenderer
   ========================================================================== */

/**
 * SVG-based DAG visualization component.
 *
 * @param {HTMLElement} container - Element to render into
 * @param {object} [options]
 * @param {boolean} [options.synthesized=false] - Use synthesized flow mode
 * @param {Function} [options.onNodeClick] - Called with node id on click
 * @param {Function} [options.onResynthesizeClick] - Called when re-synthesize is requested
 */
class DAGRenderer {
  constructor(container, options = {}) {
    this.container = container
    this.synthesized = options.synthesized || false
    this.onNodeClick = options.onNodeClick || null
    this.onResynthesizeClick = options.onResynthesizeClick || null

    /** @type {{nodes: Array, edges: Array}|null} */
    this._dagData = null
    /** @type {SVGSVGElement|null} */
    this._svg = null

    this._boundKeyHandler = this._handleKeyDown.bind(this)
  }

  /**
   * Load DAG data and render.
   */
  async render() {
    this.container.innerHTML = this.synthesized
      ? '<div class="olc-dag-loading">Analyzing outcome flow…</div>'
      : '<div class="olc-dag-loading">Loading graph…</div>'

    try {
      const action = this.synthesized ? 'getSynthesizedDag' : 'getDag'
      const result = await window.puffin.plugins.invoke(PLUGIN_NAME, action)
      this._dagData = result.dag || result || { nodes: [], edges: [] }
    } catch (err) {
      console.error('[outcome-lifecycle-plugin] Failed to load DAG:', err)
      const msg = this.synthesized && err.message && err.message.includes('not found')
        ? 'Claude CLI not found. Install it to enable outcome flow synthesis.'
        : 'Failed to load diagram'
      this.container.innerHTML = `<div class="olc-dag-error">${msg}</div>`
      return
    }

    if (this._dagData.nodes.length === 0) {
      this.container.innerHTML = this.synthesized
        ? '<div class="olc-dag-empty">No outcomes available to synthesize</div>'
        : '<div class="olc-dag-empty">No lifecycles with dependencies to visualize</div>'
      return
    }

    if (this.synthesized) {
      this._renderWithControls()
    } else {
      this._renderSVG()
    }
    this.container.addEventListener('keydown', this._boundKeyHandler)
  }

  /**
   * Render the synthesized flow with control bar.
   * @private
   */
  _renderWithControls() {
    const nodeCount = this._dagData.nodes.length
    const edgeCount = this._dagData.edges.length

    // Create wrapper
    this.container.innerHTML = `
      <div class="olc-dag-controls">
        <div class="olc-dag-controls-left">
          <span class="olc-dag-info">${nodeCount} outcome states, ${edgeCount} transitions</span>
        </div>
        <button class="olc-btn olc-resynthesize-btn" title="Re-analyze outcomes with Claude">Re-synthesize</button>
      </div>
      <div class="olc-dag-render-target"></div>
    `

    // Wire re-synthesize button
    const btn = this.container.querySelector('.olc-resynthesize-btn')
    if (btn && this.onResynthesizeClick) {
      btn.addEventListener('click', () => this.onResynthesizeClick())
    }

    // Render SVG into target
    const target = this.container.querySelector('.olc-dag-render-target')
    this._renderSVGInto(target)
  }

  /**
   * Build and insert the SVG element into a target container.
   * @param {HTMLElement} [target]
   * @private
   */
  _renderSVG(target) {
    this._renderSVGInto(target || this.container)
  }

  /**
   * @param {HTMLElement} target
   * @private
   */
  _renderSVGInto(target) {
    const { nodes, edges } = this._dagData

    // Build a node lookup for edge drawing
    const nodeMap = new Map()
    for (const n of nodes) nodeMap.set(n.id, n)

    // Compute SVG viewBox dimensions
    let maxX = 0
    let maxY = 0
    for (const n of nodes) {
      if (n.x + NODE_WIDTH > maxX) maxX = n.x + NODE_WIDTH
      if (n.y + NODE_HEIGHT > maxY) maxY = n.y + NODE_HEIGHT
    }
    const svgWidth = maxX + PADDING * 2
    const svgHeight = maxY + PADDING * 2

    // Build SVG markup
    const edgeMarkup = edges.map(e => this._renderEdge(e, nodeMap)).join('')
    const nodeMarkup = nodes.map(n => this._renderNode(n)).join('')

    const graphLabel = this.synthesized ? 'Outcome flow diagram' : 'Lifecycle dependency graph'

    target.innerHTML = `
      <div class="olc-dag-container" role="img" aria-label="${graphLabel}">
        <svg class="olc-dag-svg"
             xmlns="http://www.w3.org/2000/svg"
             viewBox="0 0 ${svgWidth} ${svgHeight}"
             preserveAspectRatio="xMidYMid meet"
             role="presentation">
          <defs>
            <marker id="olc-arrowhead"
                    markerWidth="${ARROW_SIZE}" markerHeight="${ARROW_SIZE}"
                    refX="${ARROW_SIZE}" refY="${ARROW_SIZE / 2}"
                    orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L${ARROW_SIZE},${ARROW_SIZE / 2} L0,${ARROW_SIZE}"
                    fill="var(--text-tertiary, #666)" />
            </marker>
          </defs>
          <g class="olc-dag-edges">${edgeMarkup}</g>
          <g class="olc-dag-nodes">${nodeMarkup}</g>
        </svg>
      </div>
    `

    this._svg = target.querySelector('.olc-dag-svg')

    // Attach click handlers via delegation
    this._boundClickHandler = (e) => {
      const nodeGroup = e.target.closest('.olc-dag-node')
      if (nodeGroup && this.onNodeClick) {
        this.onNodeClick(nodeGroup.dataset.id)
      }
    }
    this._svg.addEventListener('click', this._boundClickHandler)
  }

  /**
   * Render a single node as an SVG group.
   * @param {object} node - {id, label?, title?, status, x, y, description?, aggregates?}
   * @returns {string} SVG markup
   * @private
   */
  _renderNode(node) {
    const colors = STATUS_COLORS[node.status] || DEFAULT_COLOR
    const x = node.x + PADDING
    const y = node.y + PADDING

    // Use label for synthesized, title for granular
    const displayText = node.label || node.title || node.id
    const maxChars = 20
    const truncated = displayText.length > maxChars
      ? displayText.slice(0, maxChars - 1) + '\u2026'
      : displayText

    const statusLabels = {
      not_started: 'Not Started',
      in_progress: 'In Progress',
      achieved: 'Achieved'
    }
    const statusLabel = statusLabels[node.status] || node.status

    // Tooltip with description for synthesized nodes
    const tooltip = node.description
      ? `<title>${this._escapeXml(displayText)}: ${this._escapeXml(node.description)}</title>`
      : `<title>${this._escapeXml(displayText)} \u2014 ${statusLabel}</title>`

    // Aggregation badge for synthesized nodes
    let badge = ''
    if (this.synthesized && node.aggregates && node.aggregates.length > 0) {
      const badgeX = x + NODE_WIDTH - 14
      const badgeY = y + 10
      badge = `
        <circle cx="${badgeX}" cy="${badgeY}" r="11"
                fill="${colors.stroke}" opacity="0.9" />
        <text x="${badgeX}" y="${badgeY + 4}"
              text-anchor="middle" fill="#fff"
              font-size="10" font-weight="700" font-family="inherit">
          ${node.aggregates.length}
        </text>
      `
    }

    return `
      <g class="olc-dag-node ${this.synthesized ? 'olc-dag-node-flow' : ''}"
         data-id="${node.id}" tabindex="0"
         role="button" aria-label="${this._escapeAttr(displayText)} \u2014 ${statusLabel}"
         style="cursor: pointer;">
        ${tooltip}
        <rect x="${x}" y="${y}"
              width="${NODE_WIDTH}" height="${NODE_HEIGHT}"
              rx="${NODE_RADIUS}" ry="${NODE_RADIUS}"
              fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2" />
        <text x="${x + NODE_WIDTH / 2}" y="${y + 26}"
              text-anchor="middle" fill="${colors.text}"
              font-size="13" font-weight="600" font-family="inherit">
          ${this._escapeXml(truncated)}
        </text>
        <text x="${x + NODE_WIDTH / 2}" y="${y + 46}"
              text-anchor="middle" fill="${colors.stroke}"
              font-size="10" font-family="inherit">
          ${statusLabel}
        </text>
        ${badge}
      </g>
    `
  }

  /**
   * Render a directed edge as a cubic Bezier curve with arrowhead.
   * Handles both left-to-right flow and back-edges (right-to-left).
   * @param {object} edge - {from, to, label?}
   * @param {Map} nodeMap - id -> node lookup
   * @returns {string} SVG markup
   * @private
   */
  _renderEdge(edge, nodeMap) {
    const fromNode = nodeMap.get(edge.from)
    const toNode = nodeMap.get(edge.to)
    if (!fromNode || !toNode) return ''

    const fromCenterX = fromNode.x + PADDING + NODE_WIDTH / 2
    const toCenterX = toNode.x + PADDING + NODE_WIDTH / 2
    const isBackEdge = fromCenterX >= toCenterX && fromNode.id !== toNode.id

    let x1, y1, x2, y2, pathD

    if (isBackEdge) {
      // Back-edge: arc below/above the nodes
      x1 = fromNode.x + PADDING + NODE_WIDTH / 2
      y1 = fromNode.y + PADDING + NODE_HEIGHT
      x2 = toNode.x + PADDING + NODE_WIDTH / 2
      y2 = toNode.y + PADDING + NODE_HEIGHT

      const arcY = Math.max(y1, y2) + 50
      pathD = `M${x1},${y1} C${x1},${arcY} ${x2},${arcY} ${x2},${y2}`
    } else {
      // Forward edge: right side to left side
      x1 = fromNode.x + PADDING + NODE_WIDTH
      y1 = fromNode.y + PADDING + NODE_HEIGHT / 2
      x2 = toNode.x + PADDING
      y2 = toNode.y + PADDING + NODE_HEIGHT / 2

      const dx = Math.abs(x2 - x1) * 0.4
      const cx1 = x1 + dx
      const cx2 = x2 - dx
      pathD = `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`
    }

    const edgeColor = isBackEdge
      ? 'var(--accent-color, #3b82f6)'
      : 'var(--text-tertiary, #555)'
    const dashArray = isBackEdge ? 'stroke-dasharray="6 4"' : ''

    let labelMarkup = ''
    if (edge.label) {
      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2 - 8
      labelMarkup = `
        <text x="${midX}" y="${midY}" text-anchor="middle"
              fill="var(--text-secondary, #888)" font-size="9" font-family="inherit">
          ${this._escapeXml(edge.label)}
        </text>
      `
    }

    return `
      <path class="olc-dag-edge ${isBackEdge ? 'olc-dag-edge-back' : ''}"
            d="${pathD}"
            fill="none" stroke="${edgeColor}" stroke-width="1.5"
            ${dashArray}
            marker-end="url(#olc-arrowhead)"
            aria-hidden="true" />
      ${labelMarkup}
    `
  }

  /**
   * Handle keyboard navigation on focused nodes.
   * @private
   */
  _handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      const focused = this.container.querySelector('.olc-dag-node:focus')
      if (focused && this.onNodeClick) {
        e.preventDefault()
        this.onNodeClick(focused.dataset.id)
      }
    }
  }

  /**
   * Refresh the DAG (re-fetch and re-render).
   */
  async refresh() {
    await this.render()
  }

  /**
   * Clean up event listeners.
   */
  destroy() {
    if (this._svg && this._boundClickHandler) {
      this._svg.removeEventListener('click', this._boundClickHandler)
    }
    this.container.removeEventListener('keydown', this._boundKeyHandler)
    this.container.innerHTML = ''
    this._svg = null
    this._dagData = null
    this._boundClickHandler = null
  }

  /** @private */
  _escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  /** @private */
  _escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}

export { DAGRenderer }
export default DAGRenderer
