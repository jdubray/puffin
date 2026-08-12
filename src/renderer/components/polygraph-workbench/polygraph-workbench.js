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
    this.elicitation = new Map() // machineDir -> { report, question, lastOutput, pending }
    this.evolution = new Map() // machineDir -> { report, verdict, ref, pending }
    this.author = 'puffin-user'
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

  /** Open (or refresh) the elicitation section for a machine */
  async openElicitation(machineDir) {
    this.elicitation.set(machineDir, { pending: true })
    this.render()
    try {
      const [reportRes, questionRes] = await Promise.all([
        window.puffin.polygraph.nvReport({ machineDir }),
        window.puffin.polygraph.nvQuestions({ machineDir })
      ])
      this.elicitation.set(machineDir, {
        report: reportRes.success ? reportRes.report : null,
        question: questionRes.success ? questionRes.question : null,
        error: !reportRes.success ? (reportRes.error || 'polynv unavailable') : null
      })
    } catch (error) {
      this.elicitation.set(machineDir, { error: error.message })
    }
    this.render()
  }

  async harvest(machineDir) {
    this.elicitation.set(machineDir, { pending: true })
    this.render()
    const result = await window.puffin.polygraph.nvHarvest({ machineDir })
    await this.openElicitation(machineDir)
    const entry = this.elicitation.get(machineDir)
    if (entry) {
      entry.lastOutput = result.output || result.error
      this.render()
    }
  }

  async record(machineDir, disposition) {
    const concernInput = this.container.querySelector(
      `input[data-concern-for="${CSS.escape(machineDir)}"]`)
    const concern = concernInput?.value?.trim() || undefined
    const entry = this.elicitation.get(machineDir)
    const questionId = entry?.question?.id
    if (!questionId) return

    this.elicitation.set(machineDir, { ...entry, pending: true })
    this.render()
    const result = await window.puffin.polygraph.nvRecord({
      machineDir, id: questionId, disposition, author: this.author, concern
    })
    await this.openElicitation(machineDir)
    const refreshed = this.elicitation.get(machineDir)
    if (refreshed) {
      refreshed.lastOutput = result.output || result.error
      this.render()
    }
  }

  /** Run the polyvers evolution gate against the git baseline (HEAD) */
  async runEvolution(machineDir) {
    this.evolution.set(machineDir, { pending: true })
    this.render()
    try {
      const result = await window.puffin.polygraph.evolution({ machineDir })
      this.evolution.set(machineDir, result)
    } catch (error) {
      this.evolution.set(machineDir, { success: false, error: error.message })
    }
    this.render()
  }

  async scaffoldMigration(machineDir) {
    this.evolution.set(machineDir, { pending: true })
    this.render()
    const result = await window.puffin.polygraph.scaffoldMigration({ machineDir })
    // Re-run the gate — the scaffold changes the migrate gate's outcome
    await this.runEvolution(machineDir)
    const entry = this.evolution.get(machineDir)
    if (entry) {
      entry.scaffoldOutput = result.output || result.error
      this.render()
    }
  }

  _onClick(e) {
    const button = e.target.closest('button[data-action]')
    if (!button || this.isBusy && button.dataset.action !== 'refresh') return
    const { action, dir, disposition } = button.dataset

    if (action === 'refresh') this.refresh()
    else if (action === 'check-all') this.checkAll()
    else if (action === 'check' && dir) this.checkMachine(dir)
    else if (action === 'diagrams' && dir) this.renderDiagrams(dir)
    else if (action === 'hide-diagrams' && dir) {
      this.diagrams.delete(dir)
      this.render()
    }
    else if (action === 'elicit' && dir) this.openElicitation(dir)
    else if (action === 'hide-elicit' && dir) {
      this.elicitation.delete(dir)
      this.render()
    }
    else if (action === 'harvest' && dir) this.harvest(dir)
    else if (action === 'record' && dir && disposition) this.record(dir, disposition)
    else if (action === 'evolution' && dir) this.runEvolution(dir)
    else if (action === 'hide-evolution' && dir) {
      this.evolution.delete(dir)
      this.render()
    }
    else if (action === 'scaffold-migration' && dir) this.scaffoldMigration(dir)
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
    const elicitation = this.elicitation.get(machine.dir)
    const evolution = this.evolution.get(machine.dir)

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
          <button class="btn btn-secondary btn-sm" data-action="${elicitation ? 'hide-elicit' : 'elicit'}"
            data-dir="${esc(machine.dir)}"
            ${!this.status?.available ? 'disabled' : ''}>${elicitation ? 'Hide invariants' : 'Invariants'}</button>
          <button class="btn btn-secondary btn-sm" data-action="${evolution ? 'hide-evolution' : 'evolution'}"
            data-dir="${esc(machine.dir)}"
            ${!this.status?.available ? 'disabled' : ''}>${evolution ? 'Hide evolution' : 'Evolution'}</button>
        </div>
      </div>
      ${result ? this._renderResult(result) : ''}
      ${diagram ? this._renderDiagrams(diagram) : ''}
      ${elicitation ? this._renderElicitation(machine, elicitation) : ''}
      ${evolution ? this._renderEvolution(machine, evolution) : ''}
    </div>`
  }

  _renderEvolution(machine, entry) {
    if (entry.pending) {
      return '<div class="pgwb-result pgwb-result-pending">polyvers gating against the git baseline…</div>'
    }
    if (!entry.success) {
      return `<div class="pgwb-result pgwb-result-fail">✗ ${esc(entry.error || 'Evolution gate failed')}</div>`
    }
    if (entry.baseline === 'none') {
      return `<div class="pgwb-elicit">
        <div class="pgwb-elicit-header">Evolution gate</div>
        <div class="pgwb-elicit-empty">New machine — no baseline at ${esc(entry.ref)}, nothing to gate.
        The gate activates once a first version is committed.</div>
      </div>`
    }

    const report = entry.report || {}
    const isPass = report.verdict === 'PASS'
    const gates = report.gates || []
    const migrateFailed = gates.some(g => g.gate === 'migrate' && !g.ok)

    return `<div class="pgwb-elicit">
      <div class="pgwb-elicit-header">Evolution gate — vs ${esc(entry.ref)}
        <span class="pgwb-badge ${isPass ? '' : 'pgwb-badge-warn'}">${esc(report.verdict || '?')}</span>
        ${report.identical ? '<span class="pgwb-badge">identical</span>' : ''}
        ${(report.lanes || []).map(l => `<span class="pgwb-badge">${esc(l)}</span>`).join('')}
      </div>
      ${report.identical ? '<div class="pgwb-elicit-empty">No change against the baseline — nothing to gate.</div>' : `
        <div class="pgwb-gates">
          ${gates.map(g => `
            <div class="pgwb-gate ${g.ok ? 'pgwb-gate-ok' : 'pgwb-gate-fail'}">
              <span class="pgwb-gate-mark">${g.ok ? '✓' : '✗'}</span>
              <span class="pgwb-gate-name">${esc(g.gate)}</span>
              <span class="pgwb-gate-summary">${esc(g.summary || '')}</span>
            </div>
            ${!g.ok && g.failures?.length ? `<pre class="pgwb-output">${esc(g.failures.slice(0, 12).join('\n'))}</pre>` : ''}
          `).join('')}
        </div>
        ${report.corpus ? `<div class="pgwb-corpus-note">Corpus: ${esc(report.corpus.source)} (${report.corpus.count} snapshot${report.corpus.count === 1 ? '' : 's'})</div>` : ''}
        ${migrateFailed ? `<div class="pgwb-question-actions">
          <button class="btn btn-primary btn-sm" data-action="scaffold-migration" data-dir="${esc(machine.dir)}">Scaffold migration</button>
          <span class="pgwb-question-note">Shape changed — scaffold a migrate.cjs from the diff, then complete it by hand.</span>
        </div>` : ''}
      `}
      ${entry.scaffoldOutput ? `<pre class="pgwb-output">${esc(entry.scaffoldOutput)}</pre>` : ''}
    </div>`
  }

  _renderElicitation(machine, entry) {
    if (entry.pending) {
      return '<div class="pgwb-result pgwb-result-pending">polynv running…</div>'
    }
    if (entry.error) {
      return `<div class="pgwb-result pgwb-result-fail">✗ ${esc(entry.error)}</div>`
    }

    const report = entry.report
    const statusLine = report
      ? `<div class="pgwb-elicit-status">
          <span class="pgwb-badge">${esc(report.verdict || '')}</span>
          ${report.total ? `<span>${report.counts?.open ?? 0} open of ${report.total} candidates</span>` : ''}
          ${(report.findings?.length ?? 0) > 0 ? `<span class="pgwb-badge pgwb-badge-warn">${report.findings.length} live finding${report.findings.length === 1 ? '' : 's'}</span>` : ''}
        </div>`
      : ''

    let body
    if (!report || !report.total) {
      body = `<div class="pgwb-elicit-empty">
        No intent ledger yet. Harvest proposes candidate invariants from the machine's own
        vocabulary (terminal states, typed fields, reject rules) — each pre-checked against
        the machine before you're asked.
        <div><button class="btn btn-primary btn-sm" data-action="harvest" data-dir="${esc(machine.dir)}">Harvest candidates</button></div>
      </div>`
    } else if (entry.question) {
      body = this._renderQuestion(machine, entry.question)
    } else {
      body = `<div class="pgwb-elicit-empty">
        No open questions — the ledger has converged for now.
        <button class="btn btn-secondary btn-sm" data-action="harvest" data-dir="${esc(machine.dir)}">Re-harvest</button>
      </div>`
    }

    return `<div class="pgwb-elicit">
      <div class="pgwb-elicit-header">Invariant elicitation ${statusLine}</div>
      ${body}
      ${entry.lastOutput ? `<pre class="pgwb-output">${esc(entry.lastOutput)}</pre>` : ''}
    </div>`
  }

  _renderQuestion(machine, q) {
    const holds = q.precheck === 'HOLDS'
    return `<div class="pgwb-question">
      <div class="pgwb-question-head">
        <code>${esc(q.id)}</code>
        <span class="pgwb-badge ${holds ? '' : 'pgwb-badge-warn'}">${esc(q.precheck)}${holds ? '' : ` — ${esc(q.precheckDetail || '')}`}</span>
      </div>
      <div class="pgwb-question-text">${esc(q.question)}</div>
      ${q.evidence ? `<div class="pgwb-question-evidence">Evidence — ${esc(q.evidence.from)}: “${esc(q.evidence.quote)}”</div>` : ''}
      ${q.predicate ? `<pre class="pgwb-question-pred">${esc(q.predicate)}</pre>` : ''}
      ${!holds && q.counterexample ? `<div class="pgwb-question-cex">
        <div class="pgwb-question-cex-title">Counterexample (shortest path from init)</div>
        <pre class="pgwb-output">${esc(q.counterexample.join('\n'))}</pre>
      </div>` : ''}
      ${!holds ? '<div class="pgwb-question-note">Confirming a FAILS rule records a live finding: the machine reachably violates it, and the counterexample above is the repro.</div>' : ''}
      <div class="pgwb-question-actions">
        <input type="text" class="pgwb-concern" placeholder="concern / rationale (optional)"
          data-concern-for="${esc(machine.dir)}">
        <button class="btn btn-primary btn-sm" data-action="record" data-disposition="confirm" data-dir="${esc(machine.dir)}">Confirm</button>
        <button class="btn btn-secondary btn-sm" data-action="record" data-disposition="reject" data-dir="${esc(machine.dir)}">Reject</button>
        <button class="btn btn-secondary btn-sm" data-action="record" data-disposition="defer" data-dir="${esc(machine.dir)}">Defer</button>
        <button class="btn btn-secondary btn-sm" data-action="record" data-disposition="abandon" data-dir="${esc(machine.dir)}">Abandon</button>
      </div>
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
