/**
 * Polygraph Workbench Component
 *
 * The flagship Polygraph integration: for any project built with Polygraph,
 * discover machine artifact directories, run the model checker (local, no
 * API key), and render polyviz diagrams — all through the engines via
 * window.puffin.polygraph.* (never re-derived in the UI).
 */

/** Escape text for safe interpolation into HTML */
function esc(text) {
  const div = document.createElement('div')
  div.textContent = String(text ?? '')
  return div.innerHTML
}

/**
 * Sanitize polyviz SVG markup before inline injection: keep only the SVG
 * element, drop scripts/foreignObject and event-handler attributes. Diagram
 * labels derive from project files, so the markup is not blindly trusted.
 */
function sanitizeSvg(markup) {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml')
  const svg = doc.documentElement
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') return ''

  const banned = 'script, foreignObject, style, use, animate, animateTransform, set'
  for (const el of [...svg.querySelectorAll(banned)]) {
    el.remove()
  }
  const walker = doc.createTreeWalker(svg, NodeFilter.SHOW_ELEMENT)
  let node = svg
  while (node) {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase()
      // Drop event handlers and any (possibly namespaced) href/xlink:href
      // that is not a same-document fragment reference.
      if (name.startsWith('on') || (name.endsWith('href') && !attr.value.startsWith('#'))) {
        node.removeAttributeNS(attr.namespaceURI, attr.localName)
      }
    }
    node = walker.nextNode()
  }
  return svg.outerHTML
}

export class PolygraphWorkbenchComponent {
  constructor(intents) {
    this.intents = intents
    this.container = null
    this.status = null
    this.machines = []
    this.results = new Map() // machineDir -> check result
    this.diagrams = new Map() // machineDir -> { svgs: [{name, markup}] }
    this.isBusy = false
    this.hasScanned = false
  }

  init() {
    this.container = document.getElementById('polygraph-workbench')
    if (!this.container) {
      console.log('[POLYGRAPH-WB] Container not found')
      return
    }
    this.render()
    this.container.addEventListener('click', (e) => this._onClick(e))
  }

  /** Called when the view becomes visible */
  onShow() {
    if (!this.hasScanned && !this.isBusy) {
      this.refresh()
    }
  }

  async refresh() {
    this.isBusy = true
    this.render()
    try {
      const status = await window.puffin.polygraph.getStatus()
      this.status = status
      if (status.available) {
        const discovered = await window.puffin.polygraph.discover()
        this.machines = discovered.success ? discovered.machines : []
      } else {
        this.machines = []
      }
      this.hasScanned = true
    } catch (error) {
      console.error('[POLYGRAPH-WB] Refresh failed:', error)
      this.status = { available: false, error: error.message }
    } finally {
      this.isBusy = false
      this.render()
    }
  }

  async checkMachine(machineDir) {
    this.results.set(machineDir, { pending: true })
    this.render()
    try {
      const result = await window.puffin.polygraph.check({ machineDir })
      this.results.set(machineDir, result)
    } catch (error) {
      this.results.set(machineDir, { success: false, error: error.message })
    }
    this.render()
  }

  async checkAll() {
    this.isBusy = true
    for (const machine of this.machines) {
      this.results.set(machine.dir, { pending: true })
    }
    this.render()
    try {
      const response = await window.puffin.polygraph.checkAll()
      if (response.success) {
        for (const entry of response.results) {
          this.results.set(entry.dir, entry.check)
        }
      }
    } catch (error) {
      console.error('[POLYGRAPH-WB] checkAll failed:', error)
    } finally {
      this.isBusy = false
      this.render()
    }
  }

  async renderDiagrams(machineDir) {
    this.diagrams.set(machineDir, { pending: true })
    this.render()
    try {
      const isDark = !document.body.classList.contains('light-theme')
      const result = await window.puffin.polygraph.renderDiagrams({
        machineDir,
        theme: isDark ? 'dark' : 'light'
      })
      if (!result.success) {
        this.diagrams.set(machineDir, { error: result.error || result.output || 'Render failed' })
      } else {
        const svgs = []
        for (const svgPath of result.svgs) {
          const read = await window.puffin.polygraph.readDiagram({ svgPath })
          if (read.success) {
            const name = svgPath.split(/[\\/]/).pop().replace(/\.svg$/i, '')
            svgs.push({ name, markup: sanitizeSvg(read.svg) })
          }
        }
        this.diagrams.set(machineDir, { svgs })
      }
    } catch (error) {
      this.diagrams.set(machineDir, { error: error.message })
    }
    this.render()
  }

  _onClick(e) {
    const button = e.target.closest('button[data-action]')
    if (!button || this.isBusy && button.dataset.action !== 'refresh') return
    const { action, dir } = button.dataset

    if (action === 'refresh') this.refresh()
    else if (action === 'check-all') this.checkAll()
    else if (action === 'check' && dir) this.checkMachine(dir)
    else if (action === 'diagrams' && dir) this.renderDiagrams(dir)
    else if (action === 'hide-diagrams' && dir) {
      this.diagrams.delete(dir)
      this.render()
    }
  }

  render() {
    if (!this.container) return
    this.container.innerHTML = `
      <div class="pgwb-toolbar">
        ${this._renderStatus()}
        <div class="pgwb-toolbar-actions">
          <button class="btn btn-secondary" data-action="refresh" ${this.isBusy ? 'disabled' : ''}>
            ${this.isBusy ? 'Scanning…' : 'Scan project'}
          </button>
          <button class="btn btn-primary" data-action="check-all"
            ${this.isBusy || !this.status?.available || this.machines.length === 0 ? 'disabled' : ''}>
            Check all
          </button>
        </div>
      </div>
      ${this._renderBody()}
    `
  }

  _renderStatus() {
    if (!this.status) {
      return '<div class="pgwb-status">Polygraph workbench</div>'
    }
    if (!this.status.available) {
      return `<div class="pgwb-status pgwb-status-missing">
        Polygraph engines not found — clone <code>polygraph</code> as a sibling checkout
        or set <code>POLYGRAPH_DIR</code>.
      </div>`
    }
    return `<div class="pgwb-status pgwb-status-ok">
      Engines: <code>${esc(this.status.polygraphDir)}</code>
      ${this.status.polyviz ? '· polyviz available' : '· polyviz not found'}
    </div>`
  }

  _renderBody() {
    if (!this.hasScanned) {
      return '<div class="pgwb-empty">Scanning for machine artifact directories…</div>'
    }
    if (this.machines.length === 0) {
      return `<div class="pgwb-empty">
        No Polygraph machines found in this project.<br>
        A machine is a directory containing <code>contract.json</code> and a
        SAM v2 strict-profile module (<code>next.cjs</code>).
      </div>`
    }
    return `<div class="pgwb-machines">
      ${this.machines.map(m => this._renderMachine(m)).join('')}
    </div>`
  }

  _renderMachine(machine) {
    const result = this.results.get(machine.dir)
    const diagram = this.diagrams.get(machine.dir)

    return `<div class="pgwb-machine">
      <div class="pgwb-machine-header">
        <div class="pgwb-machine-title">
          <span class="pgwb-machine-name">${esc(machine.name)}</span>
          <span class="pgwb-machine-path">${esc(machine.relDir)}</span>
        </div>
        <div class="pgwb-machine-badges">
          ${machine.hasInvariants ? '<span class="pgwb-badge">invariants</span>' : '<span class="pgwb-badge pgwb-badge-warn">no invariants</span>'}
          ${machine.traceFiles > 0 ? `<span class="pgwb-badge">${machine.traceFiles} trace file${machine.traceFiles === 1 ? '' : 's'}</span>` : ''}
          ${machine.hasEffects ? '<span class="pgwb-badge">effects</span>' : ''}
          ${machine.hasPolyrunConfig ? '<span class="pgwb-badge">polyrun</span>' : ''}
          ${machine.hasIntentLedger ? '<span class="pgwb-badge">intent ledger</span>' : ''}
        </div>
        <div class="pgwb-machine-actions">
          <button class="btn btn-secondary btn-sm" data-action="check" data-dir="${esc(machine.dir)}"
            ${!this.status?.available ? 'disabled' : ''}>Check</button>
          <button class="btn btn-secondary btn-sm" data-action="${diagram ? 'hide-diagrams' : 'diagrams'}"
            data-dir="${esc(machine.dir)}"
            ${!this.status?.polyviz ? 'disabled' : ''}>${diagram ? 'Hide diagrams' : 'Diagrams'}</button>
        </div>
      </div>
      ${result ? this._renderResult(result) : ''}
      ${diagram ? this._renderDiagrams(diagram) : ''}
    </div>`
  }

  _renderResult(result) {
    if (result.pending) {
      return '<div class="pgwb-result pgwb-result-pending">Model check running…</div>'
    }
    if (result.success) {
      return `<div class="pgwb-result pgwb-result-ok">
        ✓ ${result.statesExplored} states explored — no invariant violations reachable
        ${result.checkedInvariants === false ? '<span class="pgwb-badge pgwb-badge-warn">no invariants checked</span>' : ''}
      </div>`
    }
    return `<div class="pgwb-result pgwb-result-fail">
      <div>✗ ${result.violations > 0
        ? `${result.violations} invariant violation${result.violations === 1 ? '' : 's'} — shortest counterexample paths below`
        : esc(result.error || 'Model check failed')}</div>
      ${result.output ? `<pre class="pgwb-output">${esc(result.output)}</pre>` : ''}
    </div>`
  }

  _renderDiagrams(diagram) {
    if (diagram.pending) {
      return '<div class="pgwb-result pgwb-result-pending">Rendering diagrams…</div>'
    }
    if (diagram.error) {
      return `<div class="pgwb-result pgwb-result-fail">✗ ${esc(diagram.error)}</div>`
    }
    if (!diagram.svgs || diagram.svgs.length === 0) {
      return '<div class="pgwb-result pgwb-result-fail">No diagrams produced</div>'
    }
    return `<div class="pgwb-diagrams">
      ${diagram.svgs.map(d => `
        <div class="pgwb-diagram">
          <div class="pgwb-diagram-title">${esc(d.name)}</div>
          <div class="pgwb-diagram-svg">${d.markup}</div>
        </div>`).join('')}
    </div>`
  }
}
