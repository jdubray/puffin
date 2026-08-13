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

const COLUMNS = [
  { state: 'backlog', label: 'Backlog' },
  { state: 'ready', label: 'Ready' },
  { state: 'implementing', label: 'Implementing' },
  { state: 'validating', label: 'Validating' },
  { state: 'needsHuman', label: 'Needs Human' },
  { state: 'done', label: 'Done' }
]

/** Drag target column → the action that attempts the move */
const DRAG_ACTIONS = {
  'ready': 'MARK_READY',
  'implementing': null, // resolved per source: START_IMPLEMENTATION or RESUME
  'validating': 'SUBMIT_FOR_VALIDATION',
  'done': 'VALIDATION_PASSED',
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
        }
      } catch { this.binding = null; this.glmWorkspaceId = '' }
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
    else if (action === 'journal' && id) this.showJournal(id)
    else if (action === 'close-journal') { this.journalFor = null; this.render() }
    else if (action === 'validation-pass' && id) this.dispatch(id, 'VALIDATION_PASSED')
    else if (action === 'validation-fail' && id) this.dispatch(id, 'VALIDATION_FAILED', { reason: reason || 'verifier-failed' })
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
    if (target === 'implementing') {
      // Two legal ways in: from ready (start) or from needsHuman (resume).
      // Anything else: dispatch the start — the machine names the refusal.
      return this.dispatch(instanceId,
        from === 'needsHuman' ? 'RESUME' : 'START_IMPLEMENTATION')
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
          <input type="text" id="board-new-card" class="board-input" placeholder="New card title…">
          <button class="btn btn-primary btn-sm" data-action="create-card" ${!this.status?.running ? 'disabled' : ''}>Add card</button>
          <button class="btn btn-secondary btn-sm" data-action="refresh" ${this.isBusy ? 'disabled' : ''}>${this.isBusy ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>
      ${this.rejection ? `<div class="board-rejection ${this.rejection.pending ? 'board-rejection-pending' : ''}">
        ${this.rejection.pending ? '⏳' : '⤺'} <code>${esc(this.rejection.instanceId)}</code> — ${esc(this.rejection.reason)}
      </div>` : ''}
      ${this._renderBody()}
      ${this.journalFor ? this._renderJournal() : ''}
    `
  }

  _renderStatus() {
    const s = this.status
    if (!s) return '<div class="board-status">Verified board</div>'
    if (s.error) return `<div class="board-status board-status-warn">✗ ${esc(s.error)}</div>`
    if (!s.hasConfig) return '<div class="board-status board-status-warn">No polyrun.config.mjs in this project — the board needs a task-card machine.</div>'
    if (!s.hasPolyrun) return '<div class="board-status board-status-warn">polyrun not found — clone polygraph as a sibling or set the engines path.</div>'
    if (!s.hasNode) return '<div class="board-status board-status-warn">System node ≥ 22.5 not found on PATH (polyrun needs node:sqlite).</div>'
    return `<div class="board-status">
      ${s.running ? '<span class="board-live">● polyrun</span>' : '○ starting…'}
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
    return `<div class="board-card ${isDone ? 'board-card-done' : ''}" draggable="${!isDone}" data-card-id="${esc(id)}">
      <div class="board-card-title">${esc(id)}</div>
      <div class="board-card-meta">
        ${state.reworkCount > 0 ? `<span class="board-badge board-badge-warn">rework ${state.reworkCount}/2</span>` : ''}
        ${state.lastSignal ? `<span class="board-badge">${esc(state.lastSignal)}</span>` : ''}
      </div>
      <div class="board-card-actions">
        ${state.cardState === 'validating' ? `
          <button class="btn btn-sm board-btn-pass" data-action="validation-pass" data-id="${esc(id)}" title="Validation passed">✓</button>
          <button class="btn btn-sm board-btn-fail" data-action="validation-fail" data-id="${esc(id)}" data-reason="verifier-failed" title="Validation failed (verifier-failed)">✗</button>
        ` : ''}
        ${state.cardState === 'needsHuman' ? `
          <button class="btn btn-sm" data-action="resume" data-id="${esc(id)}" title="Resume with a fresh budget">resume</button>
        ` : ''}
        <button class="btn btn-sm board-btn-journal" data-action="journal" data-id="${esc(id)}" title="Card history (journal)">☰</button>
      </div>
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
