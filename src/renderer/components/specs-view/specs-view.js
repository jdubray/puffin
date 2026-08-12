/**
 * Specs View Component (VSSpecs)
 *
 * The GLM spine of Puffin 2.0: everything centers on a sekkei. This view is
 * the explorer — workspace selector, summary dashboard, the sekkei DAG as a
 * tree (derived from glm id segments), a node detail pane, and the 7-gate
 * verifier. Read-mostly v1; node editing arrives with the sekkei node
 * editor (repurposed document-editor surface).
 */

/** Escape text for safe interpolation into HTML */
function esc(text) {
  const div = document.createElement('div')
  div.textContent = String(text ?? '')
  return div.innerHTML
}

const STRATUM_ORDER = ['system', 'capability', 'component', 'interaction', 'spec']

/**
 * The recycled spec-authoring focus (formerly the 'specifications' workspace
 * prompt), retargeted at sekkei nodes: the AI edits ONE node's content and
 * returns it as JSON that must pass the 7-gate verifier — never code, never
 * free-form markdown.
 */
function buildNodeAssistPrompt(node, instruction) {
  const editable = {
    title: node.title || '',
    description: node.description || '',
    body: node.body ?? {}
  }
  return `You are a sekkei (設計) node editor for a GLM workspace — a specifications
author, not a coder. Focus on requirements clarity, feature definitions and scope,
business rules, edge cases, constraints, and testable acceptance criteria.

Sekkei authoring rules:
- The node is the authoritative design artifact; write it so a coding agent could
  implement from it without guessing.
- Stay at this node's altitude: a '${node.stratum}' node${node.specKind ? ` (spec kind '${node.specKind}')` : ''} —
  do not inline content that belongs in child nodes.
- Keep identifiers, spec_kind vocabulary, and field names exactly as they are.
- Acceptance criteria must be mechanically checkable; business rules must be
  unambiguous declarative statements.
- Do NOT write or reference source code changes.

Current node ${node.glmId}:
${JSON.stringify(editable, null, 2)}

Instruction: ${instruction}

Return ONLY a JSON object with exactly the keys "title", "description", and "body"
(the revised node content). No prose, no markdown fences.`
}

export class SpecsViewComponent {
  constructor(intents) {
    this.intents = intents
    this.container = null
    this.status = null
    this.workspaces = []
    this.workspaceId = null
    this.summary = null
    this.nodes = []
    this.selectedGlmId = null
    this.selectedNode = null
    this.verifyResult = null
    this.expanded = new Set()
    this.isBusy = false
    this.hasLoaded = false
    this.socketStatus = null
    this.lastEvent = null
    this._refreshTimer = null
    // Node editor state
    this.editing = null // { glmId, title, description, bodyText, error, isSaving, isAssisting, aiDraft }
    this._heartbeatTimer = null
  }

  init() {
    this.container = document.getElementById('specs-view-root')
    if (!this.container) {
      console.log('[SPECS-VIEW] Container not found')
      return
    }
    this.render()
    this.container.addEventListener('click', (e) => this._onClick(e))
    this.container.addEventListener('change', (e) => this._onChange(e))

    // Live workspace events (main-process socket, replay-on-reconnect)
    window.puffin.glm.onEvent(({ workspaceId, event }) => {
      if (workspaceId !== this.workspaceId) return
      this.lastEvent = event
      this._scheduleLiveRefresh(event)
    })
    window.puffin.glm.onSocketStatus(({ workspaceId, status }) => {
      if (workspaceId !== this.workspaceId) return
      this.socketStatus = status
      this.render()
    })
  }

  /**
   * Debounced refresh on live events: node/SCR/drift changes reload the
   * workspace data; noisy bursts (e.g. a /glm-build run) collapse into one
   * reload per second.
   */
  _scheduleLiveRefresh(event) {
    const type = event?.type || ''
    if (!/^(node|scr|drift|generation|variant|git)\./.test(type)) return
    if (this.editing) return // never reload under the user's cursor
    if (this._refreshTimer) return
    this._refreshTimer = setTimeout(async () => {
      this._refreshTimer = null
      const selected = this.selectedGlmId
      await this._loadWorkspace({ keepSelection: true })
      if (selected) {
        this.selectedGlmId = selected
        this.selectedNode = this.nodes.find(n => n.glmId === selected) || this.selectedNode
      }
      this.render()
    }, 1000)
  }

  onShow() {
    if (!this.hasLoaded && !this.isBusy) {
      this.refresh()
    }
  }

  async refresh() {
    this.isBusy = true
    this.render()
    try {
      this.status = await window.puffin.glm.getStatus()
      if (this.status.available) {
        const res = await window.puffin.glm.listWorkspaces()
        this.workspaces = res.success ? res.workspaces : []
        if (!this.workspaceId && this.workspaces.length > 0) {
          this.workspaceId = this.workspaces[0].id
        }
        if (this.workspaceId) {
          await this._loadWorkspace()
        }
      }
      this.hasLoaded = true
    } catch (error) {
      console.error('[SPECS-VIEW] Refresh failed:', error)
      this.status = { available: false, error: error.message }
    } finally {
      this.isBusy = false
      this.render()
    }
  }

  async _loadWorkspace({ keepSelection = false } = {}) {
    const workspaceId = this.workspaceId
    const [summaryRes, nodesRes] = await Promise.all([
      window.puffin.glm.getSummary({ workspaceId }),
      window.puffin.glm.listNodes({ workspaceId })
    ])
    this.summary = summaryRes.success ? summaryRes.summary : null
    this.nodes = nodesRes.success ? nodesRes.nodes : []
    if (!keepSelection) {
      this.selectedGlmId = null
      this.selectedNode = null
      this.verifyResult = null
    }
    // Expand the first two levels by default
    for (const node of this.nodes) {
      const segments = this._segments(node.glmId)
      if (segments.length <= 2) this.expanded.add(this._parentPath(node.glmId))
    }
    // Follow the workspace with the live channel
    this.socketStatus = 'connecting'
    window.puffin.glm.subscribe({ workspaceId })
  }

  async selectNode(glmId) {
    this.selectedGlmId = glmId
    const local = this.nodes.find(n => n.glmId === glmId)
    this.selectedNode = local || null
    this.render()
    const res = await window.puffin.glm.getNode({ workspaceId: this.workspaceId, glmId })
    if (res.success && this.selectedGlmId === glmId) {
      this.selectedNode = res.node?.node || res.node
      this.render()
    }
  }

  async runVerifier() {
    this.verifyResult = { pending: true }
    this.render()
    const res = await window.puffin.glm.verify({ workspaceId: this.workspaceId })
    this.verifyResult = res.success ? res.result : { error: res.error }
    this.render()
  }

  // ===== Node editor =====

  async startEdit() {
    const node = this.selectedNode
    if (!node) return
    const lock = await window.puffin.glm.lock({
      workspaceId: this.workspaceId, glmId: node.glmId
    })
    if (!lock.success && lock.status === 423) {
      this.editing = { glmId: node.glmId, error: `Locked: ${lock.error}`, lockDenied: true }
      this.render()
      return
    }
    this.editing = {
      glmId: node.glmId,
      title: node.title || '',
      description: node.description || '',
      bodyText: JSON.stringify(node.body ?? {}, null, 2),
      error: null
    }
    // Keep the lock alive during long edits (TTL heartbeat)
    this._heartbeatTimer = setInterval(() => {
      window.puffin.glm.lock({
        workspaceId: this.workspaceId, glmId: node.glmId, op: 'heartbeat'
      })
    }, 60000)
    this.render()
  }

  async _endEdit(release = true) {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer)
      this._heartbeatTimer = null
    }
    if (release && this.editing && !this.editing.lockDenied) {
      await window.puffin.glm.lock({
        workspaceId: this.workspaceId, glmId: this.editing.glmId, op: 'release'
      })
    }
    this.editing = null
  }

  _readEditorInputs() {
    const title = this.container.querySelector('#specs-edit-title')?.value ?? this.editing.title
    const description = this.container.querySelector('#specs-edit-desc')?.value ?? this.editing.description
    const bodyText = this.container.querySelector('#specs-edit-body')?.value ?? this.editing.bodyText
    Object.assign(this.editing, { title, description, bodyText })
  }

  async saveEdit() {
    if (!this.editing) return
    this._readEditorInputs()
    let body
    try {
      body = JSON.parse(this.editing.bodyText || '{}')
    } catch (parseError) {
      this.editing.error = `Body is not valid JSON: ${parseError.message}`
      this.render()
      return
    }
    this.editing.isSaving = true
    this.editing.error = null
    this.render()
    const result = await window.puffin.glm.updateNode({
      workspaceId: this.workspaceId,
      glmId: this.editing.glmId,
      input: { title: this.editing.title, description: this.editing.description, body }
    })
    if (!result.success) {
      this.editing.isSaving = false
      this.editing.error = result.error
      this.render()
      return
    }
    await this._endEdit()
    this.selectedNode = result.node
    // The node.changed event also arrives on the socket; local update is
    // immediate, the debounced reload reconciles the tree.
    this.render()
  }

  async cancelEdit() {
    await this._endEdit()
    this.render()
  }

  /** AI assist: revise the node draft via the configured doc-edit provider. */
  async assistEdit() {
    if (!this.editing) return
    this._readEditorInputs()
    const instruction = this.container.querySelector('#specs-assist-input')?.value?.trim()
    if (!instruction) return

    let draftBody
    try {
      draftBody = JSON.parse(this.editing.bodyText || '{}')
    } catch {
      draftBody = {}
    }
    const draftNode = {
      ...this.selectedNode,
      title: this.editing.title,
      description: this.editing.description,
      body: draftBody
    }

    this.editing.isAssisting = true
    this.editing.error = null
    this.render()
    const result = await window.puffin.ai.editDocument({
      prompt: buildNodeAssistPrompt(draftNode, instruction)
    })
    this.editing.isAssisting = false
    if (!result.success) {
      this.editing.error = result.error || 'AI assist failed'
      this.render()
      return
    }
    try {
      const text = String(result.response || '')
        .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
      const revised = JSON.parse(text)
      this.editing.title = typeof revised.title === 'string' ? revised.title : this.editing.title
      this.editing.description = typeof revised.description === 'string' ? revised.description : this.editing.description
      this.editing.bodyText = JSON.stringify(revised.body ?? draftBody, null, 2)
      this.editing.aiDraft = true
    } catch {
      this.editing.error = 'AI returned unparseable output — draft unchanged'
    }
    this.render()
  }

  /** glm id → path segments after the org:project prefix */
  _segments(glmId) {
    if (!glmId) return []
    const withoutOrg = glmId.includes(':') ? glmId.split(':')[1] : glmId
    return withoutOrg.split('.')
  }

  _parentPath(glmId) {
    const segments = this._segments(glmId)
    return segments.slice(0, -1).join('.')
  }

  _onChange(e) {
    if (e.target.id === 'specs-workspace-select') {
      this.workspaceId = e.target.value
      this.isBusy = true
      this.render()
      this._loadWorkspace().finally(() => {
        this.isBusy = false
        this.render()
      })
    }
  }

  _onClick(e) {
    const nodeRow = e.target.closest('[data-glm-id]')
    const button = e.target.closest('button[data-action]')

    if (button) {
      const { action } = button.dataset
      if (action === 'refresh') this.refresh()
      else if (action === 'verify') this.runVerifier()
      else if (action === 'toggle' && nodeRow) {
        const key = nodeRow.dataset.glmId
        if (this.expanded.has(key)) this.expanded.delete(key)
        else this.expanded.add(key)
        this.render()
      }
      else if (action === 'edit-node') this.startEdit()
      else if (action === 'save-node') this.saveEdit()
      else if (action === 'cancel-edit') this.cancelEdit()
      else if (action === 'assist-node') this.assistEdit()
      return
    }
    if (nodeRow && !this.editing) {
      this.selectNode(nodeRow.dataset.glmId)
    }
  }

  render() {
    if (!this.container) return
    // A re-render rebuilds the editor's inputs — capture in-progress edits
    // first so no keystroke is ever lost.
    if (this.editing && !this.editing.lockDenied &&
        this.container.querySelector('#specs-edit-title')) {
      this._readEditorInputs()
    }
    this.container.innerHTML = `
      <div class="specs-toolbar">
        ${this._renderStatus()}
        <div class="specs-toolbar-actions">
          ${this.workspaces.length > 0 ? `
            <select id="specs-workspace-select" class="form-control specs-ws-select">
              ${this.workspaces.map(w => `
                <option value="${esc(w.id)}" ${w.id === this.workspaceId ? 'selected' : ''}>${esc(w.name)} (${esc(w.slug)})</option>
              `).join('')}
            </select>` : ''}
          <button class="btn btn-secondary" data-action="refresh" ${this.isBusy ? 'disabled' : ''}>
            ${this.isBusy ? 'Loading…' : 'Refresh'}
          </button>
          <button class="btn btn-primary" data-action="verify"
            ${this.isBusy || !this.workspaceId ? 'disabled' : ''}>Run verifier</button>
        </div>
      </div>
      ${this._renderSummary()}
      ${this._renderVerify()}
      <div class="specs-body">
        <div class="specs-tree">${this._renderTree()}</div>
        <div class="specs-detail">${this._renderDetail()}</div>
      </div>
    `
  }

  _renderStatus() {
    if (!this.status) return '<div class="specs-status">Specs (GLM)</div>'
    if (!this.status.available) {
      return `<div class="specs-status specs-status-missing">
        GLM server not reachable on port ${this.status.port} — start it, or check <code>~/.glm/config.json</code>.
      </div>`
    }
    const live = this.socketStatus === 'open'
      ? '<span class="specs-live specs-live-on">● live</span>'
      : this.socketStatus
        ? `<span class="specs-live">○ ${esc(this.socketStatus)}</span>`
        : ''
    return `<div class="specs-status">
      GLM v${esc(this.status.version || '?')} · port ${this.status.port}
      ${!this.status.hasToken ? ' · <span class="specs-warn">no token in ~/.glm/config.json</span>' : ''}
      ${live}
    </div>`
  }

  _renderSummary() {
    const s = this.summary
    if (!s) return ''
    const strata = s.nodes?.byStratum || {}
    const scrs = s.scrs?.byStatus || {}
    const activeScrs = Object.entries(scrs).filter(([, count]) => count > 0)
    return `<div class="specs-summary">
      ${STRATUM_ORDER.map(k => `
        <div class="specs-stat"><span class="v">${strata[k] ?? 0}</span><span class="k">${esc(k)}${(strata[k] ?? 0) === 1 ? '' : 's'}</span></div>
      `).join('')}
      <div class="specs-stat"><span class="v">${s.scrs?.active ?? 0}</span><span class="k">active SCRs</span></div>
      <div class="specs-stat"><span class="v">${s.drift?.drifted ?? 0}</span><span class="k">drifted</span></div>
      ${activeScrs.length > 0 ? `<div class="specs-scr-badges">${activeScrs.map(([status, count]) =>
        `<span class="specs-badge">${count} ${esc(status)}</span>`).join('')}</div>` : ''}
    </div>`
  }

  _renderVerify() {
    const v = this.verifyResult
    if (!v) return ''
    if (v.pending) return '<div class="specs-verify specs-verify-pending">Verifier running…</div>'
    if (v.error) return `<div class="specs-verify specs-verify-fail">✗ ${esc(v.error)}</div>`
    const gates = v.gates || v.results || []
    const passed = v.ok ?? v.passed ?? (Array.isArray(gates) && gates.every(g => g.ok ?? g.passed))
    return `<div class="specs-verify ${passed ? 'specs-verify-ok' : 'specs-verify-fail'}">
      ${passed ? '✓ all verifier gates green (Definition of Ready to Code)' : '✗ verifier gates failing'}
      ${Array.isArray(gates) && gates.length ? `<div class="specs-gates">${gates.map(g =>
        `<span class="specs-badge ${g.ok ?? g.passed ? '' : 'specs-badge-warn'}">${esc(g.name || g.gate || '?')}</span>`
      ).join('')}</div>` : ''}
      ${!passed && v.problems?.length ? `<pre class="specs-output">${esc(v.problems.slice(0, 20).map(p =>
        typeof p === 'string' ? p : JSON.stringify(p)).join('\n'))}</pre>` : ''}
    </div>`
  }

  _renderTree() {
    if (this.nodes.length === 0) {
      return `<div class="specs-empty">${this.workspaceId
        ? 'No nodes in this workspace yet.'
        : 'Select a GLM workspace.'}</div>`
    }
    // Build a path tree from glm id segments
    const byPath = new Map()
    for (const node of this.nodes) {
      byPath.set(this._segments(node.glmId).join('.'), node)
    }
    const childrenOf = new Map()
    for (const node of this.nodes) {
      const segments = this._segments(node.glmId)
      const parent = segments.slice(0, -1).join('.')
      if (!childrenOf.has(parent)) childrenOf.set(parent, [])
      childrenOf.get(parent).push(node)
    }
    for (const children of childrenOf.values()) {
      children.sort((a, b) =>
        STRATUM_ORDER.indexOf(a.stratum) - STRATUM_ORDER.indexOf(b.stratum) ||
        (a.title || '').localeCompare(b.title || ''))
    }

    const renderLevel = (parentPath, depth) => {
      const children = childrenOf.get(parentPath) || []
      return children.map(node => {
        const nodePath = this._segments(node.glmId).join('.')
        const hasChildren = (childrenOf.get(nodePath) || []).length > 0
        const isExpanded = this.expanded.has(nodePath)
        const isSelected = node.glmId === this.selectedGlmId
        return `
          <div class="specs-node ${isSelected ? 'selected' : ''}" data-glm-id="${esc(node.glmId)}"
            style="padding-left: ${10 + depth * 16}px">
            ${hasChildren
              ? `<button class="specs-twisty" data-action="toggle">${isExpanded ? '▾' : '▸'}</button>`
              : '<span class="specs-twisty-spacer"></span>'}
            <span class="specs-stratum specs-stratum-${esc(node.stratum)}">${esc((node.stratum || '?')[0].toUpperCase())}</span>
            <span class="specs-node-title">${esc(node.title || node.glmId)}</span>
            <span class="specs-node-rev">${esc(node.revisionMajor || '')}${node.revisionIteration != null ? `.${node.revisionIteration}` : ''}</span>
          </div>
          ${hasChildren && isExpanded ? renderLevel(nodePath, depth + 1) : ''}
        `
      }).join('')
    }

    // Roots: nodes whose parent path has no node
    const roots = this.nodes.filter(n => !byPath.has(this._parentPath(n.glmId)))
    const rootPaths = new Set(roots.map(n => this._parentPath(n.glmId)))
    return [...rootPaths].map(p => renderLevel(p, 0)).join('')
  }

  _renderDetail() {
    const node = this.selectedNode
    if (!node) {
      return '<div class="specs-empty">Select a node to inspect it.</div>'
    }
    if (this.editing && this.editing.glmId === node.glmId) {
      return this._renderEditor(node)
    }
    const body = node.body && typeof node.body === 'object' ? node.body : null
    return `
      <div class="specs-detail-header">
        <span class="specs-stratum specs-stratum-${esc(node.stratum)}">${esc(node.stratum)}</span>
        <h3>${esc(node.title || node.glmId)}</h3>
        <button class="btn btn-secondary btn-sm specs-edit-btn" data-action="edit-node">Edit</button>
      </div>
      <div class="specs-detail-meta">
        <code>${esc(node.glmId)}</code>
        <span>rev ${esc(node.revisionMajor || '?')}.${node.revisionIteration ?? '?'} · ${esc(node.revisionStatus || '')}</span>
        ${node.specKind ? `<span class="specs-badge">${esc(node.specKind)}</span>` : ''}
      </div>
      ${node.description ? `<p class="specs-detail-desc">${esc(node.description)}</p>` : ''}
      ${body ? `<pre class="specs-output">${esc(JSON.stringify(body, null, 2))}</pre>` : ''}
      <div class="specs-detail-prov">
        ${node.authoredBy ? `authored by ${esc(node.authoredBy)}` : ''}
        ${node.updatedAt ? ` · updated ${esc(String(node.updatedAt).slice(0, 10))}` : ''}
        ${node.contentHash ? ` · <code>${esc(String(node.contentHash).slice(0, 12))}</code>` : ''}
      </div>
    `
  }

  _renderEditor(node) {
    const edit = this.editing
    if (edit.lockDenied) {
      return `
        <div class="specs-detail-header">
          <span class="specs-stratum specs-stratum-${esc(node.stratum)}">${esc(node.stratum)}</span>
          <h3>${esc(node.title || node.glmId)}</h3>
        </div>
        <div class="specs-editor-error">✗ ${esc(edit.error)}</div>
        <button class="btn btn-secondary btn-sm" data-action="cancel-edit">Back</button>
      `
    }
    const busy = edit.isSaving || edit.isAssisting
    return `
      <div class="specs-detail-header">
        <span class="specs-stratum specs-stratum-${esc(node.stratum)}">${esc(node.stratum)}</span>
        <h3>Editing <code>${esc(node.glmId)}</code></h3>
      </div>
      ${edit.aiDraft ? '<div class="specs-ai-note">AI draft — review before saving; the ledger records you as the author.</div>' : ''}
      ${edit.error ? `<div class="specs-editor-error">✗ ${esc(edit.error)}</div>` : ''}
      <div class="specs-editor">
        <label>Title</label>
        <input type="text" id="specs-edit-title" class="form-control" value="${esc(edit.title)}" ${busy ? 'disabled' : ''}>
        <label>Description</label>
        <textarea id="specs-edit-desc" rows="3" ${busy ? 'disabled' : ''}>${esc(edit.description)}</textarea>
        <label>Body <span class="specs-hint">(JSON — validated by the stratum's schema on save)</span></label>
        <textarea id="specs-edit-body" class="specs-edit-body" rows="14" spellcheck="false" ${busy ? 'disabled' : ''}>${esc(edit.bodyText)}</textarea>
        <div class="specs-assist-row">
          <input type="text" id="specs-assist-input" class="form-control"
            placeholder="AI assist — e.g. 'tighten the acceptance criteria', 'add edge cases for concurrent edits'"
            ${busy ? 'disabled' : ''}>
          <button class="btn btn-secondary btn-sm" data-action="assist-node" ${busy ? 'disabled' : ''}>
            ${edit.isAssisting ? 'Assisting…' : 'Assist'}
          </button>
        </div>
        <div class="specs-editor-actions">
          <button class="btn btn-primary btn-sm" data-action="save-node" ${busy ? 'disabled' : ''}>
            ${edit.isSaving ? 'Saving…' : 'Save'}
          </button>
          <button class="btn btn-secondary btn-sm" data-action="cancel-edit" ${busy ? 'disabled' : ''}>Cancel</button>
        </div>
      </div>
    `
  }
}
