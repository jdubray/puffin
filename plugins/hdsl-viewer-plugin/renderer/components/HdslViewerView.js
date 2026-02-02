/**
 * HdslViewerView — Main component for the h-DSL Code Model Viewer.
 * Vanilla JavaScript implementation (no JSX).
 *
 * Displays:
 *   - Schema element types with their fields and h-M3 primitives
 *   - Relationship diagram between element types
 *   - Instance statistics summary
 *   - Extension log
 */
export class HdslViewerView {
  /**
   * @param {HTMLElement} element - Container element provided by Puffin.
   * @param {Object} options
   * @param {string} options.viewId
   * @param {Object} options.view
   * @param {string} options.pluginName
   * @param {Object} options.context
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options

    // State
    this.schema = null
    this.instance = null
    this.loading = true
    this.error = null
    this.activeTab = 'schema'      // 'schema' | 'instance' | 'graph'
    this.expandedTypes = new Set()  // element type names currently expanded
    this.expandedArtifacts = new Set() // artifact paths currently expanded
    this.instanceFilter = ''       // search filter for instance tab

    // Graph tab state
    this.graphZoom = 1
    this.graphPanX = 0
    this.graphPanY = 0
    this.graphSelectedNode = null  // artifact path of selected node
    this.graphFilter = ''          // search filter for graph nodes
    this.graphNodePositions = null // Map<path, {x, y}> — computed layout
    this.graphDragging = false
    this.graphDragStart = null     // {x, y} for pan start
    this._graphAbort = null        // AbortController for graph event listeners
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async init() {
    this.container.className = 'hdsl-viewer-view'
    this.updateView()
    await this.fetchData()
  }

  onActivate() {
    // Refresh data when view becomes visible
    if (!this.loading && !this.error) {
      this.fetchData()
    }
  }

  onDeactivate() { /* no-op */ }

  destroy() {
    if (this._graphAbort) this._graphAbort.abort()
    this.container.innerHTML = ''
    this.schema = null
    this.instance = null
  }

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  async fetchData() {
    this.loading = true
    this.error = null
    this.updateView()

    try {
      const [schema, instance] = await Promise.all([
        window.puffin.plugins.invoke('hdsl-viewer-plugin', 'getSchema', {}),
        window.puffin.plugins.invoke('hdsl-viewer-plugin', 'getInstance', {})
      ])

      this.schema = schema
      this.instance = instance
      this.loading = false
      this.updateView()
    } catch (err) {
      this.error = err.message || 'Failed to load code model data'
      this.loading = false
      this.updateView()
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  updateView() {
    if (!this.container) return

    if (this.loading) {
      this.container.innerHTML = `
        <div class="hdsl-loading">
          <div class="hdsl-spinner"></div>
          <p>Loading code model...</p>
        </div>`
      return
    }

    if (this.error) {
      this.container.innerHTML = `
        <div class="hdsl-error">
          <span class="hdsl-error-icon">⚠️</span>
          <h3>Code Model Unavailable</h3>
          <p>${this.escapeHtml(this.error)}</p>
          <button class="hdsl-btn hdsl-btn-primary hdsl-retry-btn">Retry</button>
        </div>`
      this.container.querySelector('.hdsl-retry-btn')
        ?.addEventListener('click', () => this.fetchData())
      return
    }

    this.renderMain()
  }

  renderMain() {
    const elementTypes = this.schema ? Object.keys(this.schema.elementTypes) : []
    const artifactCount = this.instance ? Object.keys(this.instance.artifacts).length : 0
    const depCount = this.instance ? (this.instance.dependencies || []).length : 0
    const flowCount = this.instance ? Object.keys(this.instance.flows || {}).length : 0

    this.container.innerHTML = `
      <div class="hdsl-header">
        <div class="hdsl-header-text">
          <h2>Code Model</h2>
          <p class="hdsl-subtitle">h-DSL Schema v${this.escapeHtml(this.schema?.version || '?')} &middot; h-M3 v${this.escapeHtml(this.schema?.m3Version || '?')}</p>
        </div>
        <div class="hdsl-header-actions">
          <button class="hdsl-btn hdsl-btn-secondary hdsl-refresh-btn" title="Refresh data">Refresh</button>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="hdsl-summary-cards">
        <div class="hdsl-card">
          <div class="hdsl-card-value">${elementTypes.length}</div>
          <div class="hdsl-card-label">Element Types</div>
        </div>
        <div class="hdsl-card">
          <div class="hdsl-card-value">${artifactCount}</div>
          <div class="hdsl-card-label">Artifacts</div>
        </div>
        <div class="hdsl-card">
          <div class="hdsl-card-value">${depCount}</div>
          <div class="hdsl-card-label">Dependencies</div>
        </div>
        <div class="hdsl-card">
          <div class="hdsl-card-value">${flowCount}</div>
          <div class="hdsl-card-label">Flows</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="hdsl-tabs">
        <button class="hdsl-tab ${this.activeTab === 'schema' ? 'active' : ''}" data-tab="schema">Schema</button>
        <button class="hdsl-tab ${this.activeTab === 'instance' ? 'active' : ''}" data-tab="instance">Instance</button>
        <button class="hdsl-tab ${this.activeTab === 'graph' ? 'active' : ''}" data-tab="graph">Relationships</button>
      </div>

      <!-- Tab Content -->
      <div class="hdsl-tab-content" id="hdsl-tab-content"></div>
    `

    // Render active tab content
    const contentEl = this.container.querySelector('#hdsl-tab-content')
    if (this.activeTab === 'schema') {
      this.renderSchemaTab(contentEl)
    } else if (this.activeTab === 'instance') {
      this.renderInstanceTab(contentEl)
    } else if (this.activeTab === 'graph') {
      this.renderGraphTab(contentEl)
    }

    this.attachEventListeners()
  }

  // ---------------------------------------------------------------------------
  // Schema tab
  // ---------------------------------------------------------------------------

  renderSchemaTab(container) {
    const types = this.schema?.elementTypes || {}
    const extensions = this.schema?.extensionLog || []

    let html = '<div class="hdsl-schema-panel">'

    for (const [typeName, typeDef] of Object.entries(types)) {
      const isExpanded = this.expandedTypes.has(typeName)
      const fieldCount = typeDef.fields ? Object.keys(typeDef.fields).length : 0
      const m3Badge = typeDef.m3Type === 'RELATION'
        ? '<span class="hdsl-badge hdsl-badge-relation">RELATION</span>'
        : '<span class="hdsl-badge hdsl-badge-slot">SLOT</span>'

      html += `
        <div class="hdsl-type-card ${isExpanded ? 'expanded' : ''}" data-type="${this.escapeHtml(typeName)}">
          <div class="hdsl-type-header">
            <span class="hdsl-type-toggle">${isExpanded ? '▼' : '▶'}</span>
            <span class="hdsl-type-name">${this.escapeHtml(typeName)}</span>
            ${m3Badge}
            <span class="hdsl-type-field-count">${fieldCount} fields</span>
          </div>
          ${isExpanded ? this.renderTypeFields(typeDef) : ''}
        </div>`
    }

    // Extension log
    if (extensions.length > 0) {
      html += `
        <div class="hdsl-extension-log">
          <h4>Schema Extensions (${extensions.length})</h4>
          <ul>${extensions.map(ext => `
            <li>
              <span class="hdsl-ext-types">${this.escapeHtml((ext.elementTypes || []).join(', '))}</span>
              <span class="hdsl-ext-rationale">${this.escapeHtml(ext.rationale || '')}</span>
              <span class="hdsl-ext-source">${this.escapeHtml(ext.source || '')}</span>
            </li>`).join('')}
          </ul>
        </div>`
    }

    html += '</div>'
    container.innerHTML = html
  }

  renderTypeFields(typeDef) {
    const fields = typeDef.fields || {}
    let html = '<div class="hdsl-type-fields">'
    html += '<table class="hdsl-fields-table">'
    html += '<thead><tr><th>Field</th><th>h-M3</th><th>Attributes</th></tr></thead><tbody>'

    for (const [fieldName, fieldDef] of Object.entries(fields)) {
      if (fieldDef.fields) {
        // Nested fields (e.g. behavior.pre/post/err or steps)
        html += `<tr class="hdsl-field-group"><td colspan="3"><strong>${this.escapeHtml(fieldName)}</strong> (nested)</td></tr>`
        for (const [subName, subDef] of Object.entries(fieldDef.fields)) {
          html += this.renderFieldRow(`${fieldName}.${subName}`, subDef)
        }
      } else {
        html += this.renderFieldRow(fieldName, fieldDef)
      }
    }

    html += '</tbody></table></div>'
    return html
  }

  renderFieldRow(name, def) {
    const attrs = []
    if (def.required) attrs.push('required')
    if (def.array) attrs.push('array')
    if (def.enum) attrs.push(`enum: ${this.escapeHtml(def.enum.join(', '))}`)

    const m3Class = def.m3Type === 'PROSE' ? 'hdsl-m3-prose' : 'hdsl-m3-term'

    return `<tr>
      <td class="hdsl-field-name"><code>${this.escapeHtml(name)}</code></td>
      <td><span class="${m3Class}">${this.escapeHtml(def.m3Type || '—')}</span></td>
      <td class="hdsl-field-attrs">${attrs.length > 0 ? attrs.join(', ') : '—'}</td>
    </tr>`
  }

  // ---------------------------------------------------------------------------
  // Instance tab
  // ---------------------------------------------------------------------------

  renderInstanceTab(container) {
    if (!this.instance) {
      container.innerHTML = '<p class="hdsl-empty">No instance data available.</p>'
      return
    }

    const artifacts = this.instance.artifacts || {}
    const deps = this.instance.dependencies || []
    const flows = this.instance.flows || {}
    const stats = this.instance.stats || {}
    const filter = this.instanceFilter.toLowerCase()

    // Group artifacts by type, applying filter
    const byType = {}
    for (const [artPath, art] of Object.entries(artifacts)) {
      if (filter && !artPath.toLowerCase().includes(filter)
        && !(art.summary || '').toLowerCase().includes(filter)
        && !(art.tags || []).some(t => t.toLowerCase().includes(filter))) {
        continue
      }
      const t = art.type || 'unknown'
      if (!byType[t]) byType[t] = []
      byType[t].push({ path: artPath, ...art })
    }

    // Build dependency lookup: artifact → { outbound: [], inbound: [] }
    const depMap = {}
    for (const dep of deps) {
      if (!depMap[dep.from]) depMap[dep.from] = { outbound: [], inbound: [] }
      if (!depMap[dep.to]) depMap[dep.to] = { outbound: [], inbound: [] }
      depMap[dep.from].outbound.push(dep)
      depMap[dep.to].inbound.push(dep)
    }

    let html = '<div class="hdsl-instance-panel">'

    // Stats row
    html += `
      <div class="hdsl-instance-stats">
        <span>Files scanned: <strong>${stats.filesScanned || '—'}</strong></span>
        <span>Artifacts: <strong>${stats.artifactCount || Object.keys(artifacts).length}</strong></span>
        <span>Dependencies: <strong>${stats.dependencyCount || deps.length}</strong></span>
        <span>Prose coverage: <strong>${stats.proseCoverage != null ? Math.round(stats.proseCoverage * 100) + '%' : '—'}</strong></span>
        <span>Bootstrap: <strong>${this.instance.bootstrapDate ? new Date(this.instance.bootstrapDate).toLocaleDateString() : '—'}</strong></span>
      </div>`

    // Filter input
    html += `
      <div class="hdsl-instance-filter">
        <input type="text" class="hdsl-filter-input" placeholder="Filter artifacts by path, summary, or tag..."
               value="${this.escapeHtml(this.instanceFilter)}" />
      </div>`

    // Artifact groups
    const sortedTypes = Object.entries(byType).sort((a, b) => b[1].length - a[1].length)
    for (const [type, arts] of sortedTypes) {
      html += `
        <div class="hdsl-artifact-group">
          <h4>${this.escapeHtml(type)} <span class="hdsl-count">(${arts.length})</span></h4>`

      for (const a of arts) {
        const isExpanded = this.expandedArtifacts.has(a.path)
        const children = a.children || []
        const tags = a.tags || []
        const exports = a.exports || []
        const artDeps = depMap[a.path] || { outbound: [], inbound: [] }
        const hasDetails = children.length > 0 || artDeps.outbound.length > 0 || artDeps.inbound.length > 0

        html += `
          <div class="hdsl-artifact-card ${isExpanded ? 'expanded' : ''}" data-artifact="${this.escapeHtml(a.path)}">
            <div class="hdsl-artifact-header">
              <span class="hdsl-artifact-toggle">${hasDetails ? (isExpanded ? '▼' : '▶') : '·'}</span>
              <code class="hdsl-artifact-path">${this.escapeHtml(a.path)}</code>
              <span class="hdsl-artifact-meta">
                ${tags.map(t => `<span class="hdsl-tag">${this.escapeHtml(t)}</span>`).join('')}
                <span class="hdsl-artifact-size">${this.formatSize(a.size)}</span>
              </span>
            </div>
            <div class="hdsl-artifact-summary-row">
              <span class="hdsl-artifact-summary-text">${this.escapeHtml(a.summary || '—')}</span>
              ${exports.length > 0 ? `<span class="hdsl-artifact-export-count">${exports.length} exports</span>` : ''}
            </div>`

        if (isExpanded) {
          html += '<div class="hdsl-artifact-details">'

          // Intent
          if (a.intent) {
            html += `<div class="hdsl-detail-section"><span class="hdsl-detail-label">Intent</span><span>${this.escapeHtml(a.intent)}</span></div>`
          }

          // Exports list
          if (exports.length > 0) {
            html += `<div class="hdsl-detail-section"><span class="hdsl-detail-label">Exports</span><span>${exports.map(e => `<code>${this.escapeHtml(e)}</code>`).join(', ')}</span></div>`
          }

          // Children — functions and classes
          if (children.length > 0) {
            html += `<div class="hdsl-children-section"><span class="hdsl-detail-label">Symbols (${children.length})</span>`
            html += '<table class="hdsl-children-table"><thead><tr><th>Name</th><th>Kind</th><th>Line</th><th>Summary</th></tr></thead><tbody>'
            for (const child of children) {
              const kindClass = child.kind === 'class' ? 'hdsl-kind-class' : 'hdsl-kind-function'
              html += `<tr>
                <td><code class="${kindClass}">${this.escapeHtml(child.name)}</code>${child.signature ? ` <span class="hdsl-signature">${this.escapeHtml(child.signature)}</span>` : ''}</td>
                <td><span class="hdsl-kind-badge ${kindClass}">${this.escapeHtml(child.kind)}</span></td>
                <td class="hdsl-line-num">${child.line || '—'}</td>
                <td class="hdsl-child-summary">${this.escapeHtml(child.summary || '—')}</td>
              </tr>`
              // Class methods
              if (child.methods && child.methods.length > 0) {
                for (const m of child.methods) {
                  html += `<tr class="hdsl-method-row">
                    <td><code class="hdsl-kind-method">.${this.escapeHtml(m.name)}</code></td>
                    <td><span class="hdsl-kind-badge hdsl-kind-method">method</span></td>
                    <td class="hdsl-line-num">${m.line || '—'}</td>
                    <td class="hdsl-child-summary">${this.escapeHtml(m.summary || '—')}</td>
                  </tr>`
                }
              }
            }
            html += '</tbody></table></div>'
          }

          // Dependencies
          if (artDeps.outbound.length > 0) {
            html += `<div class="hdsl-deps-section"><span class="hdsl-detail-label">Imports (${artDeps.outbound.length})</span>`
            html += '<div class="hdsl-dep-list">'
            for (const d of artDeps.outbound) {
              html += `<div class="hdsl-dep-edge hdsl-dep-outbound">
                <span class="hdsl-dep-arrow-out">&rarr;</span>
                <code>${this.escapeHtml(d.to)}</code>
                <span class="hdsl-dep-intent">${this.escapeHtml(d.intent || '')}</span>
                <span class="hdsl-dep-weight">${this.escapeHtml(d.weight || '')}</span>
              </div>`
            }
            html += '</div></div>'
          }

          if (artDeps.inbound.length > 0) {
            html += `<div class="hdsl-deps-section"><span class="hdsl-detail-label">Imported by (${artDeps.inbound.length})</span>`
            html += '<div class="hdsl-dep-list">'
            for (const d of artDeps.inbound) {
              html += `<div class="hdsl-dep-edge hdsl-dep-inbound">
                <span class="hdsl-dep-arrow-in">&larr;</span>
                <code>${this.escapeHtml(d.from)}</code>
                <span class="hdsl-dep-intent">${this.escapeHtml(d.intent || '')}</span>
              </div>`
            }
            html += '</div></div>'
          }

          html += '</div>' // .hdsl-artifact-details
        }

        html += '</div>' // .hdsl-artifact-card
      }

      html += '</div>' // .hdsl-artifact-group
    }

    // Flows
    const flowEntries = Object.entries(flows)
    if (flowEntries.length > 0) {
      html += '<div class="hdsl-flows-section"><h4>Flows</h4>'
      for (const [flowName, flow] of flowEntries) {
        html += `
          <div class="hdsl-flow-card">
            <strong>${this.escapeHtml(flow.name || flowName)}</strong>
            <p>${this.escapeHtml(flow.summary || '')}</p>
            <div class="hdsl-flow-steps">
              ${(flow.steps || []).map((s, i) => `
                <span class="hdsl-flow-step">
                  ${i > 0 ? '<span class="hdsl-flow-arrow">&rarr;</span>' : ''}
                  <code>${this.escapeHtml(s.artifact || '')}</code>
                </span>`).join('')}
            </div>
          </div>`
      }
      html += '</div>'
    }

    html += '</div>'
    container.innerHTML = html
  }

  /**
   * Format file size in human-readable form.
   * @param {number} bytes
   * @returns {string}
   */
  formatSize(bytes) {
    if (bytes == null) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // ---------------------------------------------------------------------------
  // Graph tab — relationship visualization
  // ---------------------------------------------------------------------------

  renderGraphTab(container) {
    if (!this.instance) {
      container.innerHTML = '<p class="hdsl-empty">No instance data available.</p>'
      return
    }

    const artifacts = this.instance.artifacts || {}
    const deps = this.instance.dependencies || []
    const artPaths = Object.keys(artifacts)
    const filter = this.graphFilter.toLowerCase()

    // Filter visible nodes
    const visiblePaths = filter
      ? artPaths.filter(p => p.toLowerCase().includes(filter)
          || (artifacts[p].summary || '').toLowerCase().includes(filter)
          || (artifacts[p].tags || []).some(t => t.toLowerCase().includes(filter)))
      : artPaths
    const visibleSet = new Set(visiblePaths)

    // Compute layout positions if not cached or node set changed
    if (!this.graphNodePositions || this.graphNodePositions.size !== visiblePaths.length || this._graphLayoutFilter !== this.graphFilter) {
      this.graphNodePositions = this.computeGraphLayout(visiblePaths, deps, artifacts)
      this._graphLayoutFilter = this.graphFilter
    }
    const positions = this.graphNodePositions

    // Filter edges to visible nodes and build adjacency map
    const visibleEdges = deps.filter(d => visibleSet.has(d.from) && visibleSet.has(d.to))
    const graphDepMap = {}
    for (const dep of visibleEdges) {
      if (!graphDepMap[dep.from]) graphDepMap[dep.from] = { outbound: [], inbound: [] }
      if (!graphDepMap[dep.to]) graphDepMap[dep.to] = { outbound: [], inbound: [] }
      graphDepMap[dep.from].outbound.push(dep)
      graphDepMap[dep.to].inbound.push(dep)
    }

    // Dependency kind color map
    const kindColors = { imports: '#4fc3f7', calls: '#81c784', extends: '#ce93d8', implements: '#ffb74d', configures: '#ef9a9a', tests: '#a5d6a7' }

    // Build SVG edges
    const NODE_W = 160
    const NODE_H = 40
    let svgEdges = ''
    for (const dep of visibleEdges) {
      const fromPos = positions.get(dep.from)
      const toPos = positions.get(dep.to)
      if (!fromPos || !toPos) continue
      const x1 = fromPos.x + NODE_W / 2
      const y1 = fromPos.y + NODE_H
      const x2 = toPos.x + NODE_W / 2
      const y2 = toPos.y
      const color = kindColors[dep.kind] || '#4fc3f7'
      const isSelected = this.graphSelectedNode === dep.from || this.graphSelectedNode === dep.to
      const opacity = this.graphSelectedNode ? (isSelected ? 0.9 : 0.15) : 0.5
      const midY = (y1 + y2) / 2
      svgEdges += `<path d="M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}"
        stroke="${color}" stroke-width="${isSelected ? 2 : 1}" fill="none" opacity="${opacity}"
        data-from="${this.escapeHtml(dep.from)}" data-to="${this.escapeHtml(dep.to)}" />`
    }

    // Compute SVG viewBox bounds
    let maxX = 800, maxY = 600
    for (const pos of positions.values()) {
      if (pos.x + NODE_W + 20 > maxX) maxX = pos.x + NODE_W + 20
      if (pos.y + NODE_H + 20 > maxY) maxY = pos.y + NODE_H + 20
    }

    // Build node HTML overlays
    let nodeHtml = ''
    for (const artPath of visiblePaths) {
      const pos = positions.get(artPath)
      if (!pos) continue
      const art = artifacts[artPath]
      const isSelected = this.graphSelectedNode === artPath
      const shortName = artPath.split('/').pop()
      const typeClass = art.type === 'test' ? 'hdsl-gnode-test'
        : art.type === 'config' ? 'hdsl-gnode-config'
        : 'hdsl-gnode-module'

      nodeHtml += `
        <div class="hdsl-gnode ${typeClass} ${isSelected ? 'hdsl-gnode-selected' : ''}"
             style="left:${pos.x}px;top:${pos.y}px;width:${NODE_W}px"
             data-path="${this.escapeHtml(artPath)}" title="${this.escapeHtml(artPath)}">
          <span class="hdsl-gnode-name">${this.escapeHtml(shortName)}</span>
          <span class="hdsl-gnode-type">${this.escapeHtml(art.type || '')}</span>
        </div>`
    }

    // Dependency kind legend
    const depKinds = new Map()
    for (const dep of visibleEdges) {
      const k = dep.kind || 'imports'
      depKinds.set(k, (depKinds.get(k) || 0) + 1)
    }

    let legendHtml = ''
    if (depKinds.size > 0) {
      legendHtml = '<div class="hdsl-graph-legend">'
      for (const [kind, count] of [...depKinds.entries()].sort((a, b) => b[1] - a[1])) {
        const color = kindColors[kind] || '#4fc3f7'
        legendHtml += `<span class="hdsl-legend-item"><span class="hdsl-legend-swatch" style="background:${color}"></span>${this.escapeHtml(kind)} (${count})</span>`
      }
      legendHtml += '</div>'
    }

    // Detail panel for selected node
    let detailHtml = ''
    if (this.graphSelectedNode && artifacts[this.graphSelectedNode]) {
      const art = artifacts[this.graphSelectedNode]
      const selectedDeps = graphDepMap[this.graphSelectedNode] || { outbound: [], inbound: [] }
      const outbound = selectedDeps.outbound
      const inbound = selectedDeps.inbound
      const children = art.children || []

      detailHtml = `
        <div class="hdsl-graph-detail">
          <div class="hdsl-graph-detail-header">
            <code>${this.escapeHtml(this.graphSelectedNode)}</code>
            <button class="hdsl-btn hdsl-graph-detail-close" title="Close">&times;</button>
          </div>
          <div class="hdsl-graph-detail-body">
            <div class="hdsl-detail-section"><span class="hdsl-detail-label">Type</span><span>${this.escapeHtml(art.type || '—')}</span></div>
            <div class="hdsl-detail-section"><span class="hdsl-detail-label">Summary</span><span>${this.escapeHtml(art.summary || '—')}</span></div>
            ${art.intent ? `<div class="hdsl-detail-section"><span class="hdsl-detail-label">Intent</span><span>${this.escapeHtml(art.intent)}</span></div>` : ''}
            ${(art.tags || []).length > 0 ? `<div class="hdsl-detail-section"><span class="hdsl-detail-label">Tags</span><span>${art.tags.map(t => `<span class="hdsl-tag">${this.escapeHtml(t)}</span>`).join(' ')}</span></div>` : ''}
            ${children.length > 0 ? `<div class="hdsl-detail-section"><span class="hdsl-detail-label">Symbols</span><span>${children.map(c => `<code>${this.escapeHtml(c.name)}</code>`).join(', ')}</span></div>` : ''}
            ${outbound.length > 0 ? `
              <div class="hdsl-deps-section"><span class="hdsl-detail-label">Imports (${outbound.length})</span>
                <div class="hdsl-dep-list">${outbound.map(d => `
                  <div class="hdsl-dep-edge hdsl-dep-outbound hdsl-graph-dep-link" data-target="${this.escapeHtml(d.to)}">
                    <span class="hdsl-dep-arrow-out">&rarr;</span>
                    <code>${this.escapeHtml(d.to.split('/').pop())}</code>
                    <span class="hdsl-dep-intent">${this.escapeHtml(d.intent || '')}</span>
                  </div>`).join('')}
                </div>
              </div>` : ''}
            ${inbound.length > 0 ? `
              <div class="hdsl-deps-section"><span class="hdsl-detail-label">Imported by (${inbound.length})</span>
                <div class="hdsl-dep-list">${inbound.map(d => `
                  <div class="hdsl-dep-edge hdsl-dep-inbound hdsl-graph-dep-link" data-target="${this.escapeHtml(d.from)}">
                    <span class="hdsl-dep-arrow-in">&larr;</span>
                    <code>${this.escapeHtml(d.from.split('/').pop())}</code>
                    <span class="hdsl-dep-intent">${this.escapeHtml(d.intent || '')}</span>
                  </div>`).join('')}
                </div>
              </div>` : ''}
          </div>
        </div>`
    }

    container.innerHTML = `
      <div class="hdsl-graph-panel">
        <div class="hdsl-graph-toolbar">
          <input type="text" class="hdsl-graph-filter-input" placeholder="Search nodes..."
                 value="${this.escapeHtml(this.graphFilter)}" />
          <span class="hdsl-graph-node-count">${visiblePaths.length} nodes, ${visibleEdges.length} edges</span>
          <div class="hdsl-graph-zoom-controls">
            <button class="hdsl-btn hdsl-graph-zoom-out" title="Zoom out">−</button>
            <span class="hdsl-graph-zoom-level">${Math.round(this.graphZoom * 100)}%</span>
            <button class="hdsl-btn hdsl-graph-zoom-in" title="Zoom in">+</button>
            <button class="hdsl-btn hdsl-graph-zoom-reset" title="Reset view">Fit</button>
          </div>
        </div>
        ${legendHtml}
        <div class="hdsl-graph-viewport">
          <div class="hdsl-graph-canvas" style="transform: scale(${this.graphZoom}) translate(${this.graphPanX}px, ${this.graphPanY}px); transform-origin: 0 0;">
            <svg class="hdsl-graph-svg" width="${maxX}" height="${maxY}" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="hdsl-arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#4fc3f7" opacity="0.6" />
                </marker>
              </defs>
              ${svgEdges}
            </svg>
            ${nodeHtml}
          </div>
        </div>
        ${detailHtml}
      </div>`
  }

  /**
   * Compute a simple layered layout for graph nodes.
   * Groups nodes by directory depth, then spreads within each layer.
   * @param {string[]} paths
   * @param {Array} deps
   * @param {Object} artifacts
   * @returns {Map<string, {x: number, y: number}>}
   */
  computeGraphLayout(paths, deps, artifacts) {
    const positions = new Map()
    if (paths.length === 0) return positions

    const NODE_W = 160
    const NODE_H = 40
    const H_GAP = 30
    const V_GAP = 60

    // Build adjacency for topological layering
    const outMap = new Map()
    const inDegree = new Map()
    for (const p of paths) {
      outMap.set(p, [])
      inDegree.set(p, 0)
    }
    const pathSet = new Set(paths)
    for (const dep of deps) {
      if (pathSet.has(dep.from) && pathSet.has(dep.to)) {
        outMap.get(dep.from).push(dep.to)
        inDegree.set(dep.to, (inDegree.get(dep.to) || 0) + 1)
      }
    }

    // BFS topological layering (Sugiyama-style)
    const layers = []
    const assigned = new Set()
    let queue = paths.filter(p => inDegree.get(p) === 0)
    if (queue.length === 0) queue = [paths[0]] // break cycles

    while (queue.length > 0 && assigned.size < paths.length) {
      const layer = []
      const nextQueue = []
      for (const node of queue) {
        if (assigned.has(node)) continue
        assigned.add(node)
        layer.push(node)
      }
      layers.push(layer)
      for (const node of layer) {
        for (const target of (outMap.get(node) || [])) {
          if (!assigned.has(target)) {
            nextQueue.push(target)
          }
        }
      }
      queue = nextQueue
      // If stuck (cycles), pick an unassigned node
      if (queue.length === 0 && assigned.size < paths.length) {
        const remaining = paths.find(p => !assigned.has(p))
        if (remaining) queue = [remaining]
      }
    }

    // Assign positions per layer
    const PADDING = 20
    let y = PADDING
    for (const layer of layers) {
      let x = PADDING
      for (const path of layer) {
        positions.set(path, { x, y })
        x += NODE_W + H_GAP
      }
      y += NODE_H + V_GAP
    }

    return positions
  }

  // ---------------------------------------------------------------------------
  // Event listeners
  // ---------------------------------------------------------------------------

  attachEventListeners() {
    // Refresh
    this.container.querySelector('.hdsl-refresh-btn')
      ?.addEventListener('click', () => this.fetchData())

    // Tabs
    this.container.querySelectorAll('.hdsl-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeTab = tab.dataset.tab
        this.updateView()
      })
    })

    // Type card expand/collapse
    this.container.querySelectorAll('.hdsl-type-header').forEach(header => {
      header.addEventListener('click', () => {
        const typeName = header.closest('.hdsl-type-card')?.dataset.type
        if (!typeName) return
        if (this.expandedTypes.has(typeName)) {
          this.expandedTypes.delete(typeName)
        } else {
          this.expandedTypes.add(typeName)
        }
        this.updateView()
      })
    })

    // Artifact card expand/collapse
    this.container.querySelectorAll('.hdsl-artifact-header').forEach(header => {
      header.addEventListener('click', () => {
        const artPath = header.closest('.hdsl-artifact-card')?.dataset.artifact
        if (!artPath) return
        if (this.expandedArtifacts.has(artPath)) {
          this.expandedArtifacts.delete(artPath)
        } else {
          this.expandedArtifacts.add(artPath)
        }
        this.updateView()
      })
    })

    // Instance filter input
    const filterInput = this.container.querySelector('.hdsl-filter-input')
    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        this.instanceFilter = e.target.value
        const contentEl = this.container.querySelector('#hdsl-tab-content')
        if (contentEl) this.renderInstanceTab(contentEl)
        this.attachArtifactListeners()
      })
    }

    // Graph interactions
    this.attachGraphListeners()
  }

  /**
   * Attach click listeners for artifact cards (instance tab).
   * Extracted to avoid duplication when re-rendering filtered results.
   */
  attachArtifactListeners() {
    this.container.querySelectorAll('.hdsl-artifact-header').forEach(header => {
      header.addEventListener('click', () => {
        const artPath = header.closest('.hdsl-artifact-card')?.dataset.artifact
        if (!artPath) return
        if (this.expandedArtifacts.has(artPath)) {
          this.expandedArtifacts.delete(artPath)
        } else {
          this.expandedArtifacts.add(artPath)
        }
        this.updateView()
      })
    })
  }

  /**
   * Attach all event listeners for the interactive graph tab.
   */
  attachGraphListeners() {
    // Abort previous graph listeners to prevent stacking
    if (this._graphAbort) this._graphAbort.abort()
    this._graphAbort = new AbortController()
    const signal = this._graphAbort.signal

    const viewport = this.container.querySelector('.hdsl-graph-viewport')
    if (!viewport) return

    // Node click → select/deselect
    this.container.querySelectorAll('.hdsl-gnode').forEach(node => {
      node.addEventListener('click', (e) => {
        e.stopPropagation()
        const nodePath = node.dataset.path
        this.graphSelectedNode = this.graphSelectedNode === nodePath ? null : nodePath
        const contentEl = this.container.querySelector('#hdsl-tab-content')
        if (contentEl) this.renderGraphTab(contentEl)
        this.attachGraphListeners()
      }, { signal })
    })

    // Detail panel close button
    this.container.querySelector('.hdsl-graph-detail-close')
      ?.addEventListener('click', () => {
        this.graphSelectedNode = null
        const contentEl = this.container.querySelector('#hdsl-tab-content')
        if (contentEl) this.renderGraphTab(contentEl)
        this.attachGraphListeners()
      }, { signal })

    // Detail panel dep links → navigate to that node
    this.container.querySelectorAll('.hdsl-graph-dep-link').forEach(link => {
      link.addEventListener('click', () => {
        const target = link.dataset.target
        if (target) {
          this.graphSelectedNode = target
          // Pan to selected node
          const pos = this.graphNodePositions?.get(target)
          if (pos) {
            this.graphPanX = -pos.x + 200
            this.graphPanY = -pos.y + 100
          }
          const contentEl = this.container.querySelector('#hdsl-tab-content')
          if (contentEl) this.renderGraphTab(contentEl)
          this.attachGraphListeners()
        }
      }, { signal })
    })

    // Zoom controls
    this.container.querySelector('.hdsl-graph-zoom-in')
      ?.addEventListener('click', () => {
        this.graphZoom = Math.min(3, this.graphZoom + 0.15)
        this.applyGraphTransform()
      }, { signal })

    this.container.querySelector('.hdsl-graph-zoom-out')
      ?.addEventListener('click', () => {
        this.graphZoom = Math.max(0.1, this.graphZoom - 0.15)
        this.applyGraphTransform()
      }, { signal })

    this.container.querySelector('.hdsl-graph-zoom-reset')
      ?.addEventListener('click', () => {
        // Fit all nodes in viewport
        if (this.graphNodePositions && this.graphNodePositions.size > 0) {
          let maxX = 0, maxY = 0
          for (const pos of this.graphNodePositions.values()) {
            if (pos.x + 180 > maxX) maxX = pos.x + 180
            if (pos.y + 60 > maxY) maxY = pos.y + 60
          }
          const vw = viewport.clientWidth || 800
          const vh = viewport.clientHeight || 500
          this.graphZoom = Math.min(1, Math.min(vw / maxX, vh / maxY))
        } else {
          this.graphZoom = 1
        }
        this.graphPanX = 0
        this.graphPanY = 0
        this.applyGraphTransform()
      }, { signal })

    // Mouse wheel zoom
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.08 : 0.08
      this.graphZoom = Math.max(0.1, Math.min(3, this.graphZoom + delta))
      this.applyGraphTransform()
    }, { passive: false, signal })

    // Pan via mouse drag on viewport background
    viewport.addEventListener('mousedown', (e) => {
      // Only pan on direct viewport clicks (not on nodes)
      if (e.target === viewport || (e.target.closest('.hdsl-graph-canvas') && !e.target.closest('.hdsl-gnode'))) {
        this.graphDragging = true
        this.graphDragStart = { x: e.clientX - this.graphPanX * this.graphZoom, y: e.clientY - this.graphPanY * this.graphZoom }
        viewport.style.cursor = 'grabbing'
      }
    }, { signal })

    viewport.addEventListener('mousemove', (e) => {
      if (!this.graphDragging || !this.graphDragStart) return
      this.graphPanX = (e.clientX - this.graphDragStart.x) / this.graphZoom
      this.graphPanY = (e.clientY - this.graphDragStart.y) / this.graphZoom
      this.applyGraphTransform()
    }, { signal })

    const onMouseUp = () => {
      this.graphDragging = false
      this.graphDragStart = null
      if (viewport) viewport.style.cursor = 'grab'
    }

    viewport.addEventListener('mouseleave', onMouseUp, { signal })
    viewport.addEventListener('mouseup', onMouseUp, { signal })

    // Graph filter input
    const graphFilterInput = this.container.querySelector('.hdsl-graph-filter-input')
    if (graphFilterInput) {
      graphFilterInput.addEventListener('input', (e) => {
        this.graphFilter = e.target.value
        this.graphNodePositions = null // force re-layout
        this.graphSelectedNode = null
        const contentEl = this.container.querySelector('#hdsl-tab-content')
        if (contentEl) this.renderGraphTab(contentEl)
        this.attachGraphListeners()
        // Re-focus search input
        this.container.querySelector('.hdsl-graph-filter-input')?.focus()
      }, { signal })
    }
  }

  /**
   * Apply zoom/pan transform to graph canvas without full re-render.
   */
  applyGraphTransform() {
    const canvas = this.container.querySelector('.hdsl-graph-canvas')
    if (canvas) {
      canvas.style.transform = `scale(${this.graphZoom}) translate(${this.graphPanX}px, ${this.graphPanY}px)`
    }
    const zoomLabel = this.container.querySelector('.hdsl-graph-zoom-level')
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(this.graphZoom * 100)}%`
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = String(text)
    return div.innerHTML
  }
}

export default HdslViewerView
