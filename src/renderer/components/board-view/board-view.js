/**
 * Board View — the verified kanban.
 *
 * Columns are the task-card machine's states; cards are durable polyrun
 * instances; a drag is a dispatch the machine may REJECT (the card bounces
 * back with the named reason). Doneness is mechanical where a gate is
 * wired: dragging backlog→ready asks the GLM verifier for the DoRC verdict
 * and dispatches MARK_READY with the gate's answer — not the human's.
 */

/** Escape text for safe interpolation into HTML */
function esc(text) {
  const div = document.createElement('div')
  div.textContent = String(text ?? '')
  return div.innerHTML
}

/**
 * A card's instanceId is derived from its sekkei node's glm id — the work
 * IS the spec. Lossy but deterministic, so the node is found by comparing
 * derived ids (no side table to drift).
 */
function cardIdForNode(glmId) {
  return String(glmId).replace(/[^a-zA-Z0-9._-]/g, '-')
}

const COLUMNS = [
  { state: 'backlog', label: 'Backlog' },
  { state: 'ready', label: 'Ready' },
  { state: 'planning', label: 'Planning' },
  { state: 'implementing', label: 'Implementing' },
  { state: 'validating', label: 'Validating' },
  { state: 'reviewing', label: 'Reviewing' },
  { state: 'needsHuman', label: 'Needs Human' },
  { state: 'done', label: 'Done' }
]

/**
 * Drag target column → the action that attempts the move.
 *
 * Work is planned before it is implemented, and reviewed before it is done —
 * both are stages of the machine, so both are columns here rather than steps
 * someone remembers to take.
 */
const DRAG_ACTIONS = {
  'ready': 'MARK_READY',
  'planning': null, // START_WORK from ready, RESUME from needsHuman
  'implementing': 'PLAN_READY', // the only forward door into work
  'validating': 'SUBMIT_FOR_VALIDATION',
  'reviewing': 'VALIDATION_PASSED',
  'done': 'REVIEW_PASSED',
  'needsHuman': 'ESCALATE',
  'backlog': null // no action leads back to backlog — the machine will say so
}

export class BoardViewComponent {
  constructor(intents) {
    this.intents = intents
    this.container = null
    this.status = null
    this.cards = []
    this.rejection = null // { instanceId, reason }
    this.journalFor = null // { instanceId, entries }
    this.binding = null // this project's bound sekkei (the gate's source)
    this.glmWorkspaceId = '' // '' = unbound → ungated, disclosed in the toolbar
    this.sekkeiNodes = [] // implementable nodes of the bound sekkei
    this.machines = [] // Polygraph machines discovered in this project
    this.linkNote = null // { instanceId, message, ok } — result of a spec link
    this.picker = null // { candidates } — nodes with no card yet
    this.isBusy = false
    this.hasLoaded = false
    this._pollTimer = null
  }

  init() {
    this.container = document.getElementById('board-view-root')
    if (!this.container) {
      console.log('[BOARD-VIEW] Container not found')
      return
    }
    this.render()
    this.container.addEventListener('click', (e) => this._onClick(e))
    this.container.addEventListener('change', (e) => this._onChange(e))
    this.container.addEventListener('dragstart', (e) => this._onDragStart(e))
    this.container.addEventListener('dragover', (e) => this._onDragOver(e))
    this.container.addEventListener('dragleave', (e) => this._onDragLeave(e))
    this.container.addEventListener('drop', (e) => this._onDrop(e))
  }

  onShow() {
    if (!this.hasLoaded && !this.isBusy) this.refresh()
    if (!this._pollTimer) {
      this._pollTimer = setInterval(() => {
        if (document.getElementById('board-view')?.classList.contains('active')) {
          this._reloadCards()
        }
      }, 5000)
    }
  }

  async refresh() {
    this.isBusy = true
    this.render()
    try {
      this.status = await window.puffin.board.getStatus()
      if (this.status.hasConfig && this.status.hasPolyrun && this.status.hasNode) {
        if (!this.status.running) {
          const started = await window.puffin.board.start()
          if (!started.success) {
            this.status.error = started.error
          } else {
            this.status.running = true
          }
        }
        if (this.status.running) await this._reloadCards()
      }
      // The DoRC gate runs against THIS project's bound sekkei — one
      // project, one sekkei; nothing to choose here.
      try {
        const glm = await window.puffin.glm.getStatus()
        if (glm.available) {
          const bindingRes = await window.puffin.glm.getBinding()
          this.binding = bindingRes.success ? bindingRes.binding : null
          this.glmWorkspaceId = this.binding?.workspaceId || ''
          if (this.glmWorkspaceId) {
            const nodesRes = await window.puffin.glm.listNodes({ workspaceId: this.glmWorkspaceId })
            // Components and spec leaves are the implementable units
            this.sekkeiNodes = (nodesRes.success ? nodesRes.nodes : [])
              .filter(n => n.stratum === 'component' || n.stratum === 'spec')
          }
        }
      } catch { this.binding = null; this.glmWorkspaceId = '' }

      // Machines discovered in this project, so a card can reach the
      // elicitation for the machine implementing it.
      try {
        const machines = await window.puffin.polygraph.discover()
        this.machines = machines.success ? (machines.machines || []) : []
      } catch { this.machines = [] }

      this.hasLoaded = true
    } catch (error) {
      this.status = { error: error.message }
    } finally {
      this.isBusy = false
      this.render()
    }
  }

  async _reloadCards() {
    const res = await window.puffin.board.listCards()
    if (res.success) {
      this.cards = res.instances || res.list || []
      this.render()
    }
  }

  async createCard() {
    const input = this.container.querySelector('#board-new-card')
    const title = input?.value?.trim()
    if (!title) return
    const instanceId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      .slice(0, 60) || `card-${Date.now()}`
    const result = await window.puffin.board.createCard({ instanceId })
    if (!result.success) {
      this.rejection = { instanceId, reason: result.error }
    } else if (input) {
      input.value = ''
    }
    await this._reloadCards()
  }

  /**
   * Attempt a move — dispatch the action; the machine decides. A rejection
   * is surfaced with its named reason and the board re-renders from truth.
   */
  async dispatch(instanceId, action, data = {}) {
    this.rejection = null
    const result = await window.puffin.board.dispatch({ instanceId, action, data })
    if (!result.success) {
      this.rejection = { instanceId, reason: result.error }
    } else if (result.stepKind === 'rejected' || result.decision?.stepKind === 'rejected') {
      const reason = result.rejectReason || result.decision?.rejectReason || 'rejected'
      this.rejection = { instanceId, reason }
    }
    await this._reloadCards()
  }

  /** backlog→ready goes through the DoRC gate when a GLM workspace is wired */
  async gateAndMarkReady(instanceId) {
    if (!this.glmWorkspaceId) {
      // No gate wired — disclosed, not faked: the dispatch carries 'pass'
      // and the card renders an 'ungated' badge until GLM is selected.
      return this.dispatch(instanceId, 'MARK_READY', { gate: 'pass', ungated: true })
    }
    this.rejection = { instanceId, reason: 'running the DoRC gate…', pending: true }
    this.render()
    try {
      const verdict = await window.puffin.glm.verify({ workspaceId: this.glmWorkspaceId })
      const gates = verdict.result?.gates || verdict.result?.results || []
      const passed = verdict.success && (verdict.result?.ok ?? verdict.result?.passed ??
        (Array.isArray(gates) && gates.length > 0 && gates.every(g => g.ok ?? g.passed)))
      await this.dispatch(instanceId, 'MARK_READY', { gate: passed ? 'pass' : 'fail' })
      if (!passed && !this.rejection) {
        this.rejection = { instanceId, reason: 'DoRC gate failed — the verifier said no' }
        this.render()
      }
    } catch (error) {
      this.rejection = { instanceId, reason: `gate error: ${error.message}` }
      this.render()
    }
  }

  /** Open the picker of sekkei nodes that have no card yet. */
  openPicker() {
    const existing = new Set(this.cards.map(c => c.instanceId || c.id))
    this.picker = {
      candidates: this.sekkeiNodes.filter(n => !existing.has(cardIdForNode(n.glmId)))
    }
    this.render()
  }

  /**
   * The Polygraph machine implementing a card, matched on the glm id's last
   * segment (`…kernel.kernel_core` → a machine named `kernel-core`). Names are
   * compared with `_` and `-` treated alike, since the sekkei writes snake_case
   * ids and machine directories are conventionally kebab-case.
   *
   * @param {Object} card
   * @returns {Object|null} The discovered machine, or null when none matches
   * @private
   */
  _machineFor(card) {
    const instanceId = card?.instanceId || card?.id
    if (!instanceId || !this.machines.length) return null
    const norm = s => String(s).toLowerCase().replace(/[_-]/g, '')
    const leaf = norm(String(instanceId).split('.').pop())
    if (!leaf) return null
    return this.machines.find(m => norm(m.name) === leaf) || null
  }

  /**
   * Open the invariant elicitation for the machine implementing this card.
   *
   * The dialog itself already lives in the Polygraph workbench (and, properly,
   * in the polynv skill) — this is the way in from the work, so you don't have
   * to go find the machine by hand.
   */
  openInvariants(instanceId) {
    const card = this.cards.find(c => (c.instanceId || c.id) === instanceId)
    const machine = this._machineFor(card)
    if (!machine) return
    this.intents?.switchView?.('polygraph')
    document.dispatchEvent(new CustomEvent('puffin-open-elicitation', {
      detail: { machineDir: machine.dir }
    }))
  }

  /**
   * Record the machine's confirmed invariants on the sekkei spec — as a
   * reference to the ledger, never a copy of the predicates.
   *
   * The predicate has one home (the machine's ledger, where polynv maintains
   * it); the spec records that these constraints exist, who confirmed them and
   * when, so a reader of the design sees what the code guarantees and GLM's
   * drift detection has something to compare. Copying the JavaScript here
   * would give the same fact two homes and guarantee they diverge.
   */
  async linkInvariantsToSpec(instanceId) {
    const card = this.cards.find(c => (c.instanceId || c.id) === instanceId)
    const machine = this._machineFor(card)
    if (!machine || !this.glmWorkspaceId) return

    // The card id is the glm id with unsafe characters replaced; find the node
    // it came from rather than trying to reverse that.
    const node = this.sekkeiNodes.find(n => cardIdForNode(n.glmId) === instanceId)
    if (!node) {
      this.linkNote = { instanceId, ok: false, message: 'no sekkei node behind this card' }
      return this.render()
    }

    this.linkNote = { instanceId, ok: true, message: 'reading the ledger…' }
    this.render()

    try {
      const res = await window.puffin.polygraph.confirmedInvariants({ machineDir: machine.dir })
      if (!res.success) throw new Error(res.error)
      if (!res.invariants.length) {
        this.linkNote = { instanceId, ok: false, message: 'no confirmed invariants yet — elicit first' }
        return this.render()
      }

      const current = await window.puffin.glm.getNode({
        workspaceId: this.glmWorkspaceId, glmId: node.glmId
      })
      const body = { ...(current?.node?.body || current?.body || {}) }
      body.invariants = {
        source: 'polygraph:intent-ledger',
        machine: machine.relDir || machine.name,
        ledger: `${machine.relDir || machine.name}/intent-ledger.json`,
        confirmed: res.invariants
      }

      const saved = await window.puffin.glm.updateNode({
        workspaceId: this.glmWorkspaceId, glmId: node.glmId, input: { body }
      })
      if (!saved?.success && saved?.error) throw new Error(saved.error)

      this.linkNote = {
        instanceId, ok: true,
        message: `linked ${res.invariants.length} confirmed invariant(s) to ${node.glmId}`
      }
    } catch (error) {
      this.linkNote = { instanceId, ok: false, message: error.message }
    }
    this.render()
  }

  /** Pull one spec onto the board — the card IS the work of implementing it. */
  async addFromSekkei(glmId) {
    const instanceId = cardIdForNode(glmId)
    const result = await window.puffin.board.createCard({ instanceId })
    if (!result.success) this.rejection = { instanceId, reason: result.error }
    await this._reloadCards()
    if (this.picker) this.openPicker()
  }

  /** The sekkei node behind a card, when the card came from a spec. */
  _nodeForCard(instanceId) {
    return this.sekkeiNodes.find(n => cardIdForNode(n.glmId) === instanceId) || null
  }

  async showJournal(instanceId) {
    const res = await window.puffin.board.journal({ instanceId })
    this.journalFor = {
      instanceId,
      entries: res.success ? (res.journal || res.entries || []) : [],
      error: res.success ? null : res.error
    }
    this.render()
  }

  // ===== events =====

  _onChange() { /* no board-level selectors — the gate follows the binding */ }

  _onClick(e) {
    const button = e.target.closest('button[data-action]')
    if (!button) return
    const { action, id, reason } = button.dataset
    if (action === 'refresh') this.refresh()
    else if (action === 'create-card') this.createCard()
    else if (action === 'open-picker') this.openPicker()
    else if (action === 'close-picker') { this.picker = null; this.render() }
    else if (action === 'add-node' && id) this.addFromSekkei(id)
    else if (action === 'invariants' && id) this.openInvariants(id)
    else if (action === 'link-invariants' && id) this.linkInvariantsToSpec(id)
    else if (action === 'journal' && id) this.showJournal(id)
    else if (action === 'close-journal') { this.journalFor = null; this.render() }
    else if (action === 'validation-pass' && id) this.dispatch(id, 'VALIDATION_PASSED')
    else if (action === 'validation-fail' && id) this.dispatch(id, 'VALIDATION_FAILED', { reason: reason || 'verifier-failed' })
    else if (action === 'plan-ready' && id) this.dispatch(id, 'PLAN_READY')
    else if (action === 'review-pass' && id) this.dispatch(id, 'REVIEW_PASSED')
    else if (action === 'review-fail' && id) this.dispatch(id, 'REVIEW_FAILED', { finding: reason || 'defect' })
    else if (action === 'resume' && id) this.dispatch(id, 'RESUME')
    else if (action === 'escalate' && id) this.dispatch(id, 'ESCALATE')
  }

  _onDragStart(e) {
    const card = e.target.closest('[data-card-id]')
    if (card) {
      e.dataTransfer.setData('text/plain', card.dataset.cardId)
      e.dataTransfer.effectAllowed = 'move'
    }
  }

  _onDragOver(e) {
    const column = e.target.closest('[data-column]')
    if (column) {
      e.preventDefault()
      column.classList.add('board-drop-target')
    }
  }

  _onDragLeave(e) {
    const column = e.target.closest('[data-column]')
    if (column) column.classList.remove('board-drop-target')
  }

  _onDrop(e) {
    const column = e.target.closest('[data-column]')
    if (!column) return
    e.preventDefault()
    column.classList.remove('board-drop-target')
    const instanceId = e.dataTransfer.getData('text/plain')
    if (!instanceId) return
    const target = column.dataset.column
    const card = this.cards.find(c => (c.instanceId || c.id) === instanceId)
    const from = card?.state?.cardState

    if (target === from) return
    if (target === 'ready') return this.gateAndMarkReady(instanceId)
    if (target === 'planning') {
      // Two legal ways in: starting work, or a human resuming an escalated
      // card — which returns to planning because whatever exhausted the budget
      // invalidated the plan.
      return this.dispatch(instanceId, from === 'needsHuman' ? 'RESUME' : 'START_WORK')
    }
    const action = DRAG_ACTIONS[target]
    if (action) return this.dispatch(instanceId, action)
    // No action leads there (e.g. back to backlog) — say so in the model's terms
    this.rejection = { instanceId, reason: `no action leads to '${target}' — corrections are event-driven` }
    this.render()
  }

  // ===== rendering =====

  render() {
    if (!this.container) return
    this.container.innerHTML = `
      <div class="board-toolbar">
        ${this._renderStatus()}
        <div class="board-toolbar-actions">
          <span class="board-gate-chip" title="The Ready gate runs this project's sekkei verifier">
            ${this.binding
              ? `⛓ gate: ${esc(this.binding.name)}`
              : 'ungated — bind a sekkei in Specs'}
          </span>
          <button class="btn btn-primary btn-sm" data-action="open-picker"
            ${!this.status?.running || !this.binding ? 'disabled' : ''}
            title="${this.binding ? 'Pull a spec from the sekkei onto the board' : 'Bind a sekkei in the Sekkei tab first'}">
            Add from sekkei
          </button>
          <input type="text" id="board-new-card" class="board-input" placeholder="ad-hoc card…">
          <button class="btn btn-secondary btn-sm" data-action="create-card" ${!this.status?.running ? 'disabled' : ''}>Add</button>
          <button class="btn btn-secondary btn-sm" data-action="refresh" ${this.isBusy ? 'disabled' : ''}>${this.isBusy ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>
      ${this.rejection ? `<div class="board-rejection ${this.rejection.pending ? 'board-rejection-pending' : ''}">
        ${this.rejection.pending ? '⏳' : '⤺'} <code>${esc(this.rejection.instanceId)}</code> — ${esc(this.rejection.reason)}
      </div>` : ''}
      ${this.picker ? this._renderPicker() : ''}
      ${this._renderBody()}
      ${this.journalFor ? this._renderJournal() : ''}
    `
  }

  _renderPicker() {
    const { candidates } = this.picker
    return `<div class="board-picker">
      <div class="board-picker-header">
        Specs to implement — <b>${esc(this.binding?.name || '')}</b>
        <button class="btn btn-secondary btn-sm" data-action="close-picker">Close</button>
      </div>
      ${candidates.length === 0 ? `<div class="board-picker-empty">
        Every implementable node in this sekkei is already on the board.
        ${this.sekkeiNodes.length === 0 ? 'This sekkei has no components or spec leaves yet — author them in the Sekkei tab.' : ''}
      </div>` : `
        <div class="board-picker-list">
          ${candidates.map(node => `
            <div class="board-picker-row">
              <span class="board-picker-stratum">${esc(node.stratum)}</span>
              <span class="board-picker-title">${esc(node.title || node.glmId)}</span>
              <code class="board-picker-id">${esc(node.glmId)}</code>
              <button class="btn btn-sm" data-action="add-node" data-id="${esc(node.glmId)}">+ add</button>
            </div>
          `).join('')}
        </div>
      `}
    </div>`
  }

  _renderStatus() {
    const s = this.status
    if (!s) return '<div class="board-status">Verified board</div>'
    if (s.error) return `<div class="board-status board-status-warn">✗ ${esc(s.error)}</div>`
    if (!s.hasProject) return '<div class="board-status board-status-warn">No project open.</div>'
    if (!s.hasConfig) return '<div class="board-status board-status-warn">Puffin\'s bundled task-card machine is missing from this install.</div>'
    if (!s.hasPolyrun) return '<div class="board-status board-status-warn">polyrun not found — clone polygraph as a sibling or set the engines path.</div>'
    if (!s.hasNode) return '<div class="board-status board-status-warn">System node ≥ 22.5 not found on PATH (polyrun needs node:sqlite).</div>'
    return `<div class="board-status">
      ${s.running ? '<span class="board-live">● polyrun</span>' : '○ starting…'}
      ${s.usingProjectConfig ? '· project workflow' : '· default workflow'}
      · every move is a machine dispatch — illegal drags bounce with their reason
    </div>`
  }

  _renderBody() {
    if (!this.status?.running) {
      return '<div class="board-empty">The board backend is not running.</div>'
    }
    const byState = {}
    for (const column of COLUMNS) byState[column.state] = []
    for (const card of this.cards) {
      const state = card.state?.cardState || 'backlog'
      ;(byState[state] || byState.backlog).push(card)
    }
    return `<div class="board-columns">
      ${COLUMNS.map(column => `
        <div class="board-column" data-column="${column.state}">
          <div class="board-column-header">
            ${esc(column.label)}
            <span class="board-count">${byState[column.state].length}</span>
          </div>
          <div class="board-column-cards">
            ${byState[column.state].map(card => this._renderCard(card)).join('')}
          </div>
        </div>
      `).join('')}
    </div>`
  }

  _renderCard(card) {
    const id = card.instanceId || card.id
    const state = card.state || {}
    const isDone = state.cardState === 'done'
    const node = this._nodeForCard(id)
    const machine = this._machineFor(card)
    const note = this.linkNote?.instanceId === id ? this.linkNote : null
    return `<div class="board-card ${isDone ? 'board-card-done' : ''}" draggable="${!isDone}" data-card-id="${esc(id)}">
      <div class="board-card-title">${esc(node?.title || id)}</div>
      ${node ? `<div class="board-card-node"><span class="board-card-stratum">${esc(node.stratum)}</span> ${esc(node.glmId)}</div>` : ''}
      <div class="board-card-meta">
        ${machine ? `<span class="board-badge board-badge-machine" title="Implemented by ${esc(machine.relDir || machine.name)}">◇ ${esc(machine.name)}</span>` : ''}
        ${state.reworkCount > 0 ? `<span class="board-badge board-badge-warn">rework ${state.reworkCount}/2</span>` : ''}
        ${state.lastSignal ? `<span class="board-badge">${esc(state.lastSignal)}</span>` : ''}
      </div>
      <div class="board-card-actions">
        ${state.cardState === 'validating' ? `
          <button class="btn btn-sm board-btn-pass" data-action="validation-pass" data-id="${esc(id)}" title="Validation passed — hands the card to review">✓</button>
          <button class="btn btn-sm board-btn-fail" data-action="validation-fail" data-id="${esc(id)}" data-reason="verifier-failed" title="Validation failed (verifier-failed)">✗</button>
        ` : ''}
        ${state.cardState === 'planning' ? `
          <button class="btn btn-sm board-btn-pass" data-action="plan-ready" data-id="${esc(id)}" title="The plan is written — start implementing">plan ready</button>
        ` : ''}
        ${state.cardState === 'reviewing' ? `
          <button class="btn btn-sm board-btn-pass" data-action="review-pass" data-id="${esc(id)}" title="Review passed — the card is done">✓</button>
          <button class="btn btn-sm board-btn-fail" data-action="review-fail" data-id="${esc(id)}" data-reason="defect" title="Review found a defect — back to implementing">✗ defect</button>
          <button class="btn btn-sm board-btn-fail" data-action="review-fail" data-id="${esc(id)}" data-reason="spec-mismatch" title="Review found the code does not match the spec">✗ spec</button>
        ` : ''}
        ${state.cardState === 'needsHuman' ? `
          <button class="btn btn-sm" data-action="resume" data-id="${esc(id)}" title="Resume with a fresh budget">resume</button>
        ` : ''}
        ${machine ? `
          <button class="btn btn-sm" data-action="invariants" data-id="${esc(id)}"
            title="Invariant elicitation for ${esc(machine.name)}">◇ invariants</button>
          <button class="btn btn-sm" data-action="link-invariants" data-id="${esc(id)}"
            ${this.glmWorkspaceId ? '' : 'disabled'}
            title="${this.glmWorkspaceId
              ? 'Record the confirmed invariants on this spec (a reference, not a copy)'
              : 'No sekkei bound'}">↗ to spec</button>
        ` : ''}
        <button class="btn btn-sm board-btn-journal" data-action="journal" data-id="${esc(id)}" title="Card history (journal)">☰</button>
      </div>
      ${note ? `<div class="board-link-note ${note.ok ? '' : 'board-link-note-warn'}">${esc(note.message)}</div>` : ''}
    </div>`
  }

  _renderJournal() {
    const j = this.journalFor
    return `<div class="board-journal">
      <div class="board-journal-header">
        Journal — <code>${esc(j.instanceId)}</code>
        <button class="btn btn-secondary btn-sm" data-action="close-journal">Close</button>
      </div>
      ${j.error ? `<div class="board-status-warn">✗ ${esc(j.error)}</div>` : `
        <div class="board-journal-entries">
          ${j.entries.map(entry => `
            <div class="board-journal-entry ${entry.stepKind === 'rejected' ? 'board-journal-rejected' : ''}">
              <span class="board-journal-seq">#${entry.seq ?? ''}</span>
              <code>${esc(entry.action || entry.stepKind || '')}</code>
              ${entry.stepKind === 'rejected' ? `<span class="board-badge board-badge-warn">rejected: ${esc(entry.rejectReason || '')}</span>` : ''}
              <span class="board-journal-state">${esc(JSON.stringify(entry.state ?? entry.post ?? ''))}</span>
            </div>
          `).join('')}
        </div>
      `}
    </div>`
  }
}
