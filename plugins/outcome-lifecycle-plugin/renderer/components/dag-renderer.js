/**
 * DAG Renderer
 *
 * SVG-based directed acyclic graph visualization for lifecycle dependencies.
 * Renders nodes as rounded rectangles colored by status, with directed edges
 * drawn as cubic Bézier curves with arrowheads.
 *
 * Note: Renderer files use ES modules (import/export); main-process files use CommonJS.
 *
 * @module outcome-lifecycle-plugin/renderer/dag-renderer
 */

const PLUGIN_NAME = 'outcome-lifecycle-plugin'

/* ==========================================================================
   Constants
   ========================================================================== */

const NODE_WIDTH = 160
const NODE_HEIGHT = 56
const NODE_RADIUS = 8
const PADDING = 40
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
 * Fetches the serialized DAG from the backend and renders an interactive
 * SVG graph. Nodes are clickable and fire a callback to navigate to
 * lifecycle details.
 */
class DAGRenderer {
  /**
   * @param {HTMLElement} container - Element to render into
   * @param {object} [options]
   * @param {Function} [options.onNodeClick] - Called with lifecycle id on click
   */
  constructor(container, options = {}) {
    this.container = container
    this.onNodeClick = options.onNodeClick || null

    /** @type {{nodes: Array, edges: Array}|null} */
    this._dagData = null
    /** @type {SVGSVGElement|null} */
    this._svg = null
    /** @type {string|null} */
    this._hoveredNodeId = null

    this._boundKeyHandler = this._handleKeyDown.bind(this)
  }

  /**
   * Load DAG data and render.
   */
  async render() {
    this.container.innerHTML = '<div class="olc-dag-loading">Loading graph…</div>'

    try {
      const result = await window.puffin.plugins.invoke(PLUGIN_NAME, 'getDag')
      this._dagData = result.dag || result || { nodes: [], edges: [] }
    } catch (err) {
      console.error('[outcome-lifecycle-plugin] Failed to load DAG:', err)
      this.container.innerHTML = '<div class="olc-dag-error">Failed to load dependency graph</div>'
      return
    }

    if (this._dagData.nodes.length === 0) {
      this.container.innerHTML = '<div class="olc-dag-empty">No lifecycles with dependencies to visualize</div>'
      return
    }

    this._renderSVG()
    this.container.addEventListener('keydown', this._boundKeyHandler)
  }

  /**
   * Build and insert the SVG element.
   * @private
   */
  _renderSVG() {
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

    this.container.innerHTML = `
      <div class="olc-dag-container" role="img" aria-label="Lifecycle dependency graph">
        <svg class="olc-dag-svg"
             xmlns="http://www.w3.org/2000/svg"
             viewBox="0 0 ${svgWidth} ${svgHeight}"
             width="${svgWidth}" height="${svgHeight}"
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

    this._svg = this.container.querySelector('.olc-dag-svg')

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
   * @param {object} node - {id, title, status, x, y}
   * @returns {string} SVG markup
   * @private
   */
  _renderNode(node) {
    const colors = STATUS_COLORS[node.status] || DEFAULT_COLOR
    const x = node.x + PADDING
    const y = node.y + PADDING

    // Truncate title to fit
    const maxChars = 18
    const displayTitle = node.title.length > maxChars
      ? node.title.slice(0, maxChars - 1) + '…'
      : node.title

    // Status label
    const statusLabels = {
      not_started: 'Not Started',
      in_progress: 'In Progress',
      achieved: 'Achieved'
    }
    const statusLabel = statusLabels[node.status] || node.status

    return `
      <g class="olc-dag-node" data-id="${node.id}" tabindex="0"
         role="button" aria-label="${this._escapeAttr(node.title)} — ${statusLabel}"
         style="cursor: pointer;">
        <rect x="${x}" y="${y}"
              width="${NODE_WIDTH}" height="${NODE_HEIGHT}"
              rx="${NODE_RADIUS}" ry="${NODE_RADIUS}"
              fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2" />
        <text x="${x + NODE_WIDTH / 2}" y="${y + 24}"
              text-anchor="middle" fill="${colors.text}"
              font-size="13" font-weight="600" font-family="inherit">
          ${this._escapeXml(displayTitle)}
        </text>
        <text x="${x + NODE_WIDTH / 2}" y="${y + 42}"
              text-anchor="middle" fill="${colors.stroke}"
              font-size="10" font-family="inherit">
          ${statusLabel}
        </text>
      </g>
    `
  }

  /**
   * Render a directed edge as a cubic Bézier curve with arrowhead.
   * Edge goes from `edge.from` (dependency) to `edge.to` (dependent).
   * @param {object} edge - {from, to}
   * @param {Map} nodeMap - id → node lookup
   * @returns {string} SVG markup
   * @private
   */
  _renderEdge(edge, nodeMap) {
    const fromNode = nodeMap.get(edge.from)
    const toNode = nodeMap.get(edge.to)
    if (!fromNode || !toNode) return ''

    // From right side of source node to left side of target node
    const x1 = fromNode.x + PADDING + NODE_WIDTH
    const y1 = fromNode.y + PADDING + NODE_HEIGHT / 2
    const x2 = toNode.x + PADDING
    const y2 = toNode.y + PADDING + NODE_HEIGHT / 2

    // Cubic Bézier with horizontal control points
    const dx = Math.abs(x2 - x1) * 0.5
    const cx1 = x1 + dx
    const cx2 = x2 - dx

    return `
      <path class="olc-dag-edge"
            d="M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}"
            fill="none" stroke="var(--text-tertiary, #555)" stroke-width="1.5"
            marker-end="url(#olc-arrowhead)"
            aria-hidden="true" />
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
