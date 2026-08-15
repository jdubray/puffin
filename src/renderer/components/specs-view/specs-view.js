/**
 * Sekkei View Component
 *
 * The GLM spine of Puffin 2.0: everything centers on a sekkei. This view is
 * the explorer — workspace selector, summary dashboard, the sekkei DAG as a
 * tree (derived from glm id segments), a node detail pane, and the 7-gate
 * verifier. Read-mostly v1; node editing arrives with the sekkei node
 * editor (repurposed document-editor surface).
 */

import { renderMarkdown } from '../../lib/markdown.js'

/** Escape text for safe interpolation into HTML */
function esc(text) {
  const div = document.createElement('div')
  div.textContent = String(text ?? '')
  return div.innerHTML
}

/** Escape for an HTML attribute value (esc() leaves quotes alone). */
function escAttr(text) {
  return esc(text).replace(/"/g, '&quot;')
}

const STRATUM_ORDER = ['system', 'capability', 'component', 'interaction', 'spec']

/** English plurals for the summary tiles — 'capabilitys' is not a word. */
const STRATUM_PLURAL = {
  system: 'systems',
  capability: 'capabilities',
  component: 'components',
  interaction: 'interactions',
  spec: 'specs'
}

/** A glm id: <org>:<project>[.<segment>…] — the dot is what makes it a path. */
const GLM_ID_RE = /^[a-z][a-z0-9_-]*:[a-z0-9][a-z0-9._-]*$/i
const URL_RE = /^https?:\/\/[^\s"]+$/i

/**
 * Render a node body as readable, syntax-coloured JSON. Structure is preserved
 * (braces, brackets, keys) so the shape stays recognisable, but string quotes
 * are dropped and the two kinds of reference are made navigable: a glm id
 * becomes a link that selects that node in this sekkei, a URL opens externally.
 * A glm-id-shaped string with no node behind it is flagged rather than linked —
 * a dangling depends_on is exactly the kind of thing worth seeing.
 *
 * @param {*} value - Any JSON value
 * @param {Set<string>} knownIds - glm ids present in the loaded sekkei
 * @param {number} indent - Current depth (2 spaces per level)
 * @returns {string} HTML
 */
function renderJson(value, knownIds, indent = 0) {
  const pad = '  '.repeat(indent)
  const padIn = '  '.repeat(indent + 1)
  const comma = '<span class="j-punct">,</span>\n'

  if (value === null || value === undefined) return '<span class="j-null">null</span>'

  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="j-punct">[]</span>'
    const items = value
      .map(v => padIn + renderJson(v, knownIds, indent + 1))
      .join(comma)
    return `<span class="j-punct">[</span>\n${items}\n${pad}<span class="j-punct">]</span>`
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return '<span class="j-punct">{}</span>'
    const items = keys
      .map(k => `${padIn}<span class="j-key">${esc(k)}</span><span class="j-punct">: </span>` +
        renderJson(value[k], knownIds, indent + 1))
      .join(comma)
    return `<span class="j-punct">{</span>\n${items}\n${pad}<span class="j-punct">}</span>`
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return `<span class="j-num">${esc(String(value))}</span>`
  }

  return renderJsonString(String(value), knownIds, indent)
}

/** String leaf: link a glm id, link a URL, wrap long prose. @private */
function renderJsonString(text, knownIds, indent) {
  if (text.includes('.') && GLM_ID_RE.test(text)) {
    return knownIds.has(text)
      ? `<a class="j-link" data-glm-id="${escAttr(text)}" title="Go to ${escAttr(text)}">${esc(text)}</a>`
      : `<span class="j-str j-missing" title="No such node in this sekkei">${esc(text)}</span>`
  }
  if (URL_RE.test(text)) {
    return `<a class="j-link" data-action="open-url" data-url="${escAttr(text)}" title="${escAttr(text)}">${esc(text)}</a>`
  }
  if (text.includes('\n')) {
    const pad = '  '.repeat(indent + 1)
    return `<span class="j-str">${text.split('\n').map(esc).join('\n' + pad)}</span>`
  }
  return `<span class="j-str">${esc(text)}</span>`
}

/**
 * The sekkei authoring prompt. Same conversational loop as the Prompt tab,
 * but the artifact is the DESIGN, not the code: the session edits sekkei
 * nodes through the glm_* MCP tools Puffin wires into every session.
 */
function buildAuthoringPrompt(instruction, { workspaceSlug, workspaceId, selectedGlmId, nodeCount }) {
  return `You are authoring a sekkei (設計) — the design of record for this project.
You edit SPECIFICATIONS, never source code.

Workspace: ${workspaceSlug} (id ${workspaceId}) — currently ${nodeCount} node(s).
${selectedGlmId ? `Currently selected node: ${selectedGlmId}\n` : ''}
The GLM connection is already wired for you: the glm_* MCP tools below are live
and pointed at this workspace. There is nothing to configure and nothing to find
on disk — do NOT read ~/.glm, the GLM checkout, or any *.glm* file, and do not
search for a server URL, token or workspace id. Every fact about this sekkei
comes from a glm_* tool call. The only files you may read are this project's own
documents, under this project directory.

Use the glm_* MCP tools for every change:
  glm_status, glm_list_components, glm_get_node — read the current design
  glm_create_node — add a node (system | capability | component | interaction | spec)
  glm_apply_patch — update an existing node's body (JSON-Patch)
  glm_verify — run the 7-gate verifier when the change is complete

Sekkei authoring rules:
- Strata nest: system → capability → component → interaction → spec. Put content at
  the altitude it belongs to; never inline a child's content into its parent.
- glm ids follow <org>:<project>.<capability>.<component>[.spec.<kind>]. Call
  glm_list_components first and reuse the existing prefix exactly.${nodeCount === 0 ? ` This sekkei is EMPTY, so there is
  no prefix to reuse — derive one from the workspace slug (${workspaceSlug}) and
  apply it consistently to every node you create. Do not look for it elsewhere.` : ''}
- Specs are the machine-runnable leaves: acceptance specs carry deliverables and a
  verifier command; prompt specs carry the context bundle and template that let a
  coding agent regenerate the component with no human input.
- Acceptance criteria must be mechanically checkable. Business rules must be
  unambiguous declarative statements.
- Do NOT create, modify, or delete source files. Implementation happens later, in a
  code workflow driven from these specs.

Report what you changed as a short list of glm ids with the operation applied.

Request: ${instruction}`
}

/**
 * Openings a session uses when it proposes the next piece of work:
 * "Want me to author the missing acceptance specs?", "Should I …", etc.
 */
const OFFER_RE = /\b(want me to|would you like me to|shall i|should i|do you want me to|do you want|i can)\b/i

/** A bullet or numbered list item. */
const LIST_ITEM_RE = /^\s*(?:[-*•]|\d+[.)])\s+(.*\S)\s*$/

/**
 * Pull the offered next steps out of a reply so they can be ticked off instead
 * of retyped.
 *
 * A session almost always ends by proposing work — "Want me to author the
 * missing acceptance and prompt specs for the 8 components now?" — and the
 * only way to accept was to paraphrase it back. Two shapes are recognised: an
 * offer sentence on its own, and an offer that introduces a list (in which
 * case the list items are the choices, since that's where the detail lives).
 *
 * Deliberately conservative: no offer, no checklist. A wrong guess here costs
 * more than a missing one — the composer is right there.
 *
 * @param {string} text - The reply
 * @returns {Array<{id: string, text: string}>}
 */
function extractFollowUps(text) {
  if (!text || typeof text !== 'string') return []
  const lines = text.split('\n')
  const offers = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || LIST_ITEM_RE.test(line)) continue
    if (!OFFER_RE.test(line)) continue

    // A list directly under the offer carries the real choices
    const items = []
    for (let j = i + 1; j < lines.length; j++) {
      const match = lines[j].match(LIST_ITEM_RE)
      if (match) { items.push(match[1]); continue }
      if (lines[j].trim() === '' && items.length === 0) continue // blank before the list
      break
    }

    if (items.length > 0) {
      offers.push(...items)
    } else {
      // Just the offer sentence — trim it to the proposal itself
      const sentence = (line.match(/[^.!?]*\?/) || [line])[0].trim()
      offers.push(sentence.replace(/^[-*•]\s*/, ''))
    }
  }

  // Dedupe, cap, and drop anything too short to be a real instruction
  const seen = new Set()
  return offers
    .map(t => t.replace(/\s+/g, ' ').trim())
    .filter(t => t.length >= 12 && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .slice(0, 8)
    .map((t, i) => ({ id: `fu-${i}`, text: t }))
}

/** Legal SCR events per status (mirror of GLM's domain/scr.ts FSM) */
const SCR_EVENTS = {
  'Draft': ['submit'],
  'Submitted': ['startReview'],
  'Under Review': ['approve', 'return', 'reject'],
  'Returned': ['reopen'],
  'Approved': ['implement'],
  'Implemented': ['release'],
  'Rejected': [],
  'Released': []
}

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

export { extractFollowUps }

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
    // SCR panel state
    this.scrs = []
    this.showScrs = false
    this.scrForm = null // { title, problem, scrClass, error, isSaving }
    this.scrError = null
    // One project, one sekkei
    this.binding = null // { workspaceId, slug, name, autoDetected }
    this.bindError = null
    this.isBinding = false
    this.borrowing = false // read-only peek at another project's sekkei
    this.projectName = ''
    // Authoring loop (the Prompt tab's shape, aimed at the design)
    this.authoring = { isRunning: false, response: '', error: null, lastInstruction: '' }
    // The open design conversation: its CLI session (resumed on follow-ups)
    // and the history entry follow-ups thread onto. Null = next turn starts a
    // fresh conversation.
    this.authoringSessionId = null
    this.authoringThreadId = null
    // Next steps the last reply offered, as a checklist
    this.followUps = []
    this.selectedFollowUps = []
    this.followUpNote = ''
    // Changes since the last code generation → the workflow's inbox
    this.lastGenerationAt = null
    this.queueNote = null
    // Composer context sources + voice
    this.designDocs = []
    this.guiDesigns = []
    this.selectedDocs = []
    this.selectedGuis = []
    this.openMenu = null // 'docs' | 'gui'
    this.quickMode = false
    this.models = []
    this.defaultModel = ''
    this.isRecording = false
    this._recorder = null
    this._chunks = []
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

    // Selecting a design thread in the Tasks list reopens it here.
    document.addEventListener('puffin-state-change', (e) => {
      const selected = e.detail?.state?.history?.selectedPrompt
      if (!selected || selected.surface !== 'sekkei') return
      if (selected.id === this.authoringThreadId) return
      this.restoreAuthoringThread(selected)
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
        const bindingRes = await window.puffin.glm.getBinding()
        this.binding = bindingRes.success ? bindingRes.binding : null
        this.workspaces = bindingRes.success ? (bindingRes.workspaces || []) : []
        this.bindError = bindingRes.success
          ? (bindingRes.stale ? 'The sekkei this project was bound to no longer exists.' : null)
          : bindingRes.error
        // The bound sekkei is THE sekkei — no picking unless borrowing
        if (this.binding && !this.borrowing) {
          this.workspaceId = this.binding.workspaceId
          await this._loadWorkspace()
        } else if (!this.binding) {
          this.workspaceId = null
        }
      }
      try {
        const state = await window.puffin.state.get()
        const resolved = state?.state || state || {}
        this.projectName = resolved.projectName || ''
        this.lastGenerationAt = resolved.config?.glmLastGenerationAt || null
      } catch { /* project name is cosmetic */ }
      // Context sources for the composer (both optional)
      try {
        const docs = await window.puffin.state.getDesignDocuments()
        this.designDocs = docs?.documents || docs || []
      } catch { this.designDocs = [] }
      try {
        const designs = await window.puffin.state.listGuiDesigns()
        this.guiDesigns = designs?.designs || designs || []
      } catch { this.guiDesigns = [] }
      // The composer renders after startup's loadModels(), so it fetches
      // its own list rather than inheriting empty options.
      try {
        const res = await window.puffin.claude.getModels()
        this.models = res?.models || []
        this.defaultModel = res?.default || ''
      } catch { this.models = [] }
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
    const scrsRes = await window.puffin.glm.listScrs({ workspaceId })
    this.scrs = scrsRes.success ? (scrsRes.scrs || []) : []
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

  // ===== Authoring loop =====

  /** Submit a spec-authoring request — the session edits nodes via glm_* MCP. */
  submitAuthoring(overrideInstruction) {
    const input = this.container.querySelector('#specs-author-input')
    const instruction = overrideInstruction || input?.value?.trim()
    if (!instruction || this.authoring.isRunning || !this.workspaceId || this.borrowing) return

    // Composer options
    const model = this.container.querySelector('#sekkei-model')?.value || undefined
    const effort = this.container.querySelector('#sekkei-effort')?.value || ''
    const isQuick = !!this.container.querySelector('#sekkei-quick')?.checked
    const docPath = this.container.querySelector('#sekkei-docs')?.value || ''
    const guiName = this.container.querySelector('#sekkei-gui')?.value || ''

    let body = instruction
    if (docPath) body += `\n\nReference document (read it before answering): ${docPath}`
    if (guiName) body += `\n\nReference GUI design: .puffin/gui-definitions/${guiName}`
    if (isQuick) {
      body = `Answer this question about the sekkei. Do NOT create, update or delete any node — this is a read-only question.\n\n${body}`
    }

    // Clear the composer BEFORE rendering. render() snapshots the draft so a
    // re-render can't eat a half-typed instruction — which also means a draft
    // cleared after render is restored on the next one.
    if (input && !overrideInstruction) input.value = ''
    this._composerDraft = ''

    this.authoring = { isRunning: true, response: '', error: null, lastInstruction: instruction }
    this.followUps = []
    this.selectedFollowUps = []
    this.followUpNote = ''
    this.render()

    if (!this._authoringSubscribed) {
      this._authoringSubscribed = true
      window.puffin.claude.onResponse((chunk) => {
        if (!this.authoring.isRunning) return
        this.authoring.response += typeof chunk === 'string' ? chunk : (chunk?.content || '')
        this._renderAuthoringOnly()
      })
      window.puffin.claude.onComplete((response) => {
        if (!this.authoring.isRunning) return
        this.authoring.isRunning = false
        // Keep the CLI session so the next instruction continues this design
        // conversation instead of re-reading the whole sekkei from scratch.
        if (response?.sessionId) this.authoringSessionId = response.sessionId
        this.followUps = extractFollowUps(this.authoring.response)
        this.selectedFollowUps = this.followUps.map(f => f.id) // offered work is usually wanted
        this.followUpNote = ''
        // Node changes already streamed in over the GLM channel; reload to
        // be certain the tree matches the design after the edit.
        this._loadWorkspace({ keepSelection: true }).then(() => this.render())
      })
      window.puffin.claude.onError((error) => {
        if (!this.authoring.isRunning) return
        this.authoring.isRunning = false
        this.authoring.error = typeof error === 'string' ? error : (error?.message || 'failed')
        this.render()
      })
    }

    // Record the turn in the one history stream, tagged as a design turn, so
    // it survives a restart and lands in the Tasks list for this tab. Also
    // sets pendingPromptId, which is what makes the global response listeners
    // persist the reply against this entry.
    const turnId = `sk-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
    try {
      this.intents?.submitPrompt?.({
        id: turnId,
        branchId: 'main',
        // Follow-ups hang off the conversation's first turn, so one sitting is
        // one thread in the list rather than one entry per message.
        parentId: this.authoringThreadId || null,
        content: instruction,
        surface: 'sekkei',
        workspaceId: this.workspaceId
      })
      if (!this.authoringThreadId) this.authoringThreadId = turnId
    } catch (error) {
      console.warn('[SPECS-VIEW] Could not record the authoring turn:', error.message)
    }

    window.puffin.claude.submit({
      prompt: buildAuthoringPrompt(body, {
        workspaceSlug: this.binding?.slug || '',
        workspaceId: this.workspaceId,
        selectedGlmId: this.selectedGlmId,
        nodeCount: this.nodes.length
      }),
      model,
      effort: effort || undefined,
      // Continue the open design conversation; null starts a fresh one
      sessionId: this.authoringSessionId || null
    })
  }

  /** Tick / untick one proposed next step. @private */
  _toggleFollowUp(id) {
    if (!id) return
    // Keep the note the user may have typed before re-rendering
    const note = this.container.querySelector('#specs-followup-note')
    if (note) this.followUpNote = note.value
    const at = this.selectedFollowUps.indexOf(id)
    if (at >= 0) this.selectedFollowUps.splice(at, 1)
    else this.selectedFollowUps.push(id)
    this.render()
  }

  /**
   * Accept the ticked next steps: send them back as one instruction on the
   * same session, so the model already has the context it proposed them from.
   */
  runFollowUps() {
    if (this.authoring.isRunning || !this.selectedFollowUps.length) return
    const note = this.container.querySelector('#specs-followup-note')?.value?.trim() || ''
    const chosen = this.followUps
      .filter(f => this.selectedFollowUps.includes(f.id))
      .map(f => f.text)

    const instruction = [
      'Yes — go ahead with the following, in order:',
      ...chosen.map((t, i) => `${i + 1}. ${t}`),
      note ? `\nOne adjustment: ${note}` : ''
    ].filter(Boolean).join('\n')

    this.followUps = []
    this.selectedFollowUps = []
    this.followUpNote = ''
    this.submitAuthoring(instruction)
  }

  /**
   * Start a fresh design conversation: the next instruction opens a new CLI
   * session (and a new thread) instead of continuing this one.
   */
  newAuthoringThread() {
    this.authoringSessionId = null
    this.authoringThreadId = null
    this.authoring = { isRunning: false, response: '', error: null, lastInstruction: '' }
    this.followUps = []
    this.selectedFollowUps = []
    this.followUpNote = ''
    this._composerDraft = ''
    this.render()
  }

  /**
   * Reopen a design thread from the Tasks list: its reply comes back into the
   * pane and its CLI session is resumed, so a restart never strands work.
   *
   * @param {Object} prompt - state.history.selectedPrompt
   */
  restoreAuthoringThread(prompt) {
    if (!prompt || prompt.surface !== 'sekkei') return
    if (this.authoring.isRunning) return
    this.authoringSessionId = prompt.response?.sessionId || null
    this.authoringThreadId = prompt.id
    this.authoring = {
      isRunning: false,
      response: prompt.response?.content || '',
      error: null,
      lastInstruction: prompt.content || ''
    }
    this.followUps = extractFollowUps(this.authoring.response)
    this.selectedFollowUps = []
    this.followUpNote = ''
    this.render()
  }

  _togglePick(field, value) {
    if (!value) return
    const list = this[field]
    const at = list.indexOf(value)
    if (at >= 0) list.splice(at, 1)
    else list.push(value)
    this.render()
  }

  /** Queue the selected spec onto the Workflow as a work item. */
  async createWorkItem() {
    if (!this.selectedGlmId) return
    const instanceId = String(this.selectedGlmId).replace(/[^a-zA-Z0-9._-]/g, '-')
    this.queueNote = { pending: true }
    this.render()
    const status = await window.puffin.board.getStatus()
    if (!status.running) {
      const started = await window.puffin.board.start()
      if (!started.success) {
        this.queueNote = { error: started.error }
        this.render()
        return
      }
    }
    const result = await window.puffin.board.createCard({ instanceId })
    this.queueNote = result.success ? { added: 1, skipped: 0 } : { error: result.error }
    this.render()
  }

  /** Voice input — record, transcribe, drop the text into the composer. */
  async toggleMic() {
    if (this.isRecording) {
      this._recorder?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm'
      this._recorder = new MediaRecorder(stream, { mimeType })
      this._chunks = []
      this._recorder.ondataavailable = (e) => { if (e.data.size > 0) this._chunks.push(e.data) }
      this._recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        this.isRecording = false
        this.render()
        try {
          const blob = new Blob(this._chunks, { type: mimeType })
          const buffer = await blob.arrayBuffer()
          const result = await window.puffin.speech.transcribe(Array.from(new Uint8Array(buffer)))
          const text = result?.text || result?.transcript
          const input = this.container.querySelector('#specs-author-input')
          if (text && input) {
            input.value = input.value ? `${input.value} ${text}` : text
            this._composerDraft = input.value
            input.focus()
          } else if (!text) {
            this.authoring.error = result?.error || 'Transcription returned nothing (set the Speech API key in Config)'
            this.render()
          }
        } catch (error) {
          this.authoring.error = `Transcription failed: ${error.message}`
          this.render()
        }
      }
      this._recorder.start()
      this.isRecording = true
      this.render()
    } catch (error) {
      this.authoring.error = `Microphone unavailable: ${error.message}`
      this.render()
    }
  }

  /** Review the sekkei itself — gaps, ambiguity, altitude errors. */
  reviewSpecs() {
    this.submitAuthoring(
      `Review this sekkei as a specification reviewer, and report findings only — do NOT change any node.
Look for: missing or thin acceptance criteria; ambiguous business rules; content sitting at the wrong
stratum; components with no spec leaves; interactions that no component references; and anything a
coding agent would have to guess at. List findings worst-first with the glm id each one is about.`)
  }

  /** Queue the selected spec onto the Workflow as a work item. */
  async createWorkItem() {
    if (!this.selectedGlmId) return
    const instanceId = String(this.selectedGlmId).replace(/[^a-zA-Z0-9._-]/g, '-')
    this.queueNote = { pending: true }
    this.render()
    const status = await window.puffin.board.getStatus()
    if (!status.running) {
      const started = await window.puffin.board.start()
      if (!started.success) {
        this.queueNote = { error: started.error }
        this.render()
        return
      }
    }
    const result = await window.puffin.board.createCard({ instanceId })
    this.queueNote = result.success
      ? { added: 1, skipped: 0 }
      : { error: result.error }
    this.render()
  }

  /** Voice input — record, transcribe, drop the text into the composer. */
  async toggleMic() {
    if (this.isRecording) {
      this._recorder?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm'
      this._recorder = new MediaRecorder(stream, { mimeType })
      this._chunks = []
      this._recorder.ondataavailable = (e) => { if (e.data.size > 0) this._chunks.push(e.data) }
      this._recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        this.isRecording = false
        this.render()
        try {
          const blob = new Blob(this._chunks, { type: mimeType })
          const buffer = await blob.arrayBuffer()
          const result = await window.puffin.speech.transcribe(Array.from(new Uint8Array(buffer)))
          const text = result?.text || result?.transcript
          const input = this.container.querySelector('#specs-author-input')
          if (text && input) {
            input.value = input.value ? `${input.value} ${text}` : text
            input.focus()
          } else if (!text) {
            this.authoring.error = result?.error || 'Transcription returned nothing (is the Speech API key set in Config?)'
            this.render()
          }
        } catch (error) {
          this.authoring.error = `Transcription failed: ${error.message}`
          this.render()
        }
      }
      this._recorder.start()
      this.isRecording = true
      this.render()
    } catch (error) {
      this.authoring.error = `Microphone unavailable: ${error.message}`
      this.render()
    }
  }

  /**
   * Re-render just the authoring pane so streaming never disturbs the tree.
   * Markdown is re-rendered per chunk: a half-arrived `**bold` would otherwise
   * sit as literal asterisks until the turn ended.
   */
  _renderAuthoringOnly() {
    const pane = this.container.querySelector('#specs-author-response')
    if (pane) {
      pane.innerHTML = renderMarkdown(this.authoring.response)
      pane.scrollTop = pane.scrollHeight
    }
  }

  cancelAuthoring() {
    window.puffin.claude.cancel()
    this.authoring.isRunning = false
    this.render()
  }

  // ===== Changes since the last generation =====

  /** Nodes touched since the last code generation — the workflow's inbox. */
  _changedNodes() {
    if (!this.lastGenerationAt) return this.nodes.filter(n => n.stratum === 'component' || n.stratum === 'spec')
    const since = new Date(this.lastGenerationAt).getTime()
    return this.nodes.filter(n =>
      (n.stratum === 'component' || n.stratum === 'spec') &&
      new Date(n.updatedAt || n.authoredAt || 0).getTime() > since)
  }

  /** Queue the changed specs onto the workflow as cards — when the user says so. */
  async queueChangesToWorkflow() {
    const changed = this._changedNodes()
    if (changed.length === 0) return
    this.queueNote = { pending: true }
    this.render()

    const status = await window.puffin.board.getStatus()
    if (!status.running) {
      const started = await window.puffin.board.start()
      if (!started.success) {
        this.queueNote = { error: started.error }
        this.render()
        return
      }
    }
    const existing = new Set(((await window.puffin.board.listCards()).instances || [])
      .map(c => c.instanceId || c.id))

    let added = 0
    for (const node of changed) {
      const instanceId = String(node.glmId).replace(/[^a-zA-Z0-9._-]/g, '-')
      if (existing.has(instanceId)) continue
      const result = await window.puffin.board.createCard({ instanceId })
      if (result.success) added++
    }
    this.queueNote = { added, skipped: changed.length - added }
    this.render()
  }

  /** Mark this design as generated — resets the change window. */
  async markGenerated() {
    this.lastGenerationAt = new Date().toISOString()
    await window.puffin.state.updateConfig({ glmLastGenerationAt: this.lastGenerationAt })
    this.queueNote = null
    this.render()
  }

  // ===== Binding (one project, one sekkei) =====

  /** Create an empty sekkei for this project and bind it. */
  async createAndBind() {
    const slugInput = this.container.querySelector('#specs-bind-slug')
    const slug = slugInput?.value?.trim()
    if (!slug) {
      this.bindError = 'A slug is required'
      this.render()
      return
    }
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(slug)) {
      this.bindError = 'Slug must be lowercase letters, digits and dashes, starting with a letter'
      this.render()
      return
    }
    await this._bind({ create: true, slug, name: this.projectName || slug })
  }

  async bindExisting() {
    const select = this.container.querySelector('#specs-bind-existing')
    const workspaceId = select?.value
    if (!workspaceId) return
    await this._bind({ workspaceId })
  }

  async _bind(args) {
    this.isBinding = true
    this.bindError = null
    this.render()
    const result = await window.puffin.glm.bindWorkspace(args)
    this.isBinding = false
    if (!result.success) {
      this.bindError = result.error
      this.render()
      return
    }
    this.binding = result.binding
    this.borrowing = false
    this.workspaceId = result.binding.workspaceId
    await this._loadWorkspace()
    this.render()
  }

  /** Peek at another project's sekkei — read-only, never rebinds. */
  async borrowWorkspace(workspaceId) {
    this.borrowing = true
    this.workspaceId = workspaceId
    this.isBusy = true
    this.render()
    await this._loadWorkspace()
    this.isBusy = false
    this.render()
  }

  async stopBorrowing() {
    this.borrowing = false
    this.workspaceId = this.binding?.workspaceId || null
    if (this.workspaceId) {
      this.isBusy = true
      this.render()
      await this._loadWorkspace()
      this.isBusy = false
    }
    this.render()
  }

  // ===== SCRs =====

  async createScr() {
    const title = this.container.querySelector('#scr-title')?.value?.trim()
    const problem = this.container.querySelector('#scr-problem')?.value?.trim()
    const scrClass = this.container.querySelector('#scr-class')?.value || 'II'
    if (!title || !problem) {
      this.scrForm = { ...this.scrForm, title, problem, scrClass, error: 'Title and problem are required' }
      this.render()
      return
    }
    this.scrForm = { title, problem, scrClass, isSaving: true }
    this.render()
    const targetNodes = this.selectedGlmId ? [this.selectedGlmId] : []
    const result = await window.puffin.glm.createScr({
      workspaceId: this.workspaceId, title, problem, scrClass, targetNodes
    })
    if (!result.success) {
      this.scrForm = { title, problem, scrClass, error: result.error }
    } else {
      this.scrForm = null
      const scrsRes = await window.puffin.glm.listScrs({ workspaceId: this.workspaceId })
      this.scrs = scrsRes.success ? (scrsRes.scrs || []) : this.scrs
    }
    this.render()
  }

  async driveScr(scrId, scrEvent) {
    let reason
    if (scrEvent === 'return') {
      reason = window.prompt('Return reason (recorded on the SCR):')
      if (reason === null) return
    }
    this.scrError = null
    const result = await window.puffin.glm.scrStatus({
      workspaceId: this.workspaceId, scrId, event: scrEvent, reason
    })
    if (!result.success) {
      this.scrError = `${scrId}: ${result.error}`
    } else {
      const scrsRes = await window.puffin.glm.listScrs({ workspaceId: this.workspaceId })
      this.scrs = scrsRes.success ? (scrsRes.scrs || []) : this.scrs
    }
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
    if (e.target.id === 'specs-borrow-select') {
      const workspaceId = e.target.value
      if (workspaceId) this.borrowWorkspace(workspaceId)
      else this.stopBorrowing()
    }
  }

  _onClick(e) {
    const nodeRow = e.target.closest('[data-glm-id]')
    const button = e.target.closest('[data-action]')
    // A click outside an open menu closes it
    if (this.openMenu && !e.target.closest('.dropdown')) {
      this.openMenu = null
      this.render()
      return
    }

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
      else if (action === 'toggle-scrs') {
        this.showScrs = !this.showScrs
        this.render()
      }
      else if (action === 'new-scr') {
        this.scrForm = { title: '', problem: '', scrClass: 'II' }
        this.render()
      }
      else if (action === 'cancel-scr') {
        this.scrForm = null
        this.render()
      }
      else if (action === 'create-scr') this.createScr()
      else if (action === 'scr-event') {
        this.driveScr(button.dataset.scrId, button.dataset.event)
      }
      else if (action === 'author') this.submitAuthoring()
      else if (action === 'cancel-author') this.cancelAuthoring()
      else if (action === 'queue-changes') this.queueChangesToWorkflow()
      else if (action === 'mark-generated') this.markGenerated()
      else if (action === 'create-bind') this.createAndBind()
      else if (action === 'bind-existing') this.bindExisting()
      else if (action === 'stop-borrowing') this.stopBorrowing()
      else if (action === 'review-specs') this.reviewSpecs()
      else if (action === 'new-work-item') this.createWorkItem()
      else if (action === 'mic') this.toggleMic()
      else if (action === 'new-authoring-thread') this.newAuthoringThread()
      else if (action === 'toggle-followup') this._toggleFollowUp(button.dataset.value)
      else if (action === 'run-followups') this.runFollowUps()
      else if (action === 'toggle-quick') { this.quickMode = !this.quickMode; this.render() }
      else if (action === 'menu-docs') { this.openMenu = this.openMenu === 'docs' ? null : 'docs'; this.render() }
      else if (action === 'menu-gui') { this.openMenu = this.openMenu === 'gui' ? null : 'gui'; this.render() }
      else if (action === 'pick-doc') this._togglePick('selectedDocs', button.dataset.value)
      else if (action === 'pick-gui') this._togglePick('selectedGuis', button.dataset.value)
      // shell:openExternal is exposed under the github namespace in the preload
      else if (action === 'open-url') window.puffin.github?.openExternal?.(button.dataset.url)
      else if (action === 'clear-doc') { this.selectedDocs = []; this.render() }
      else if (action === 'clear-gui') { this.selectedGuis = []; this.render() }
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
    // Same for the composer: the draft and the option choices survive re-render.
    const draftEl = this.container.querySelector('#specs-author-input')
    if (draftEl) {
      this._composerDraft = draftEl.value
      const val = (id) => this.container.querySelector(id)?.value
      this._composerOpts = {
        provider: val('#sekkei-provider'),
        model: val('#sekkei-model'),
        effort: val('#sekkei-effort')
      }
    }
    // Three areas: prompting (left) · the sekkei and its GLM controls
    // (centre) · the selected node (right).
    this.container.innerHTML = !this.binding && this.status?.available
      ? `<div class="specs-toolbar">${this._renderStatus()}</div>${this._renderBindScreen()}`
      : `
      <div class="specs-3col">

        <section class="specs-col specs-col-prompt">
          <div class="specs-col-head">Prompt</div>
          ${this.borrowing
            ? '<div class="specs-reply-empty">Authoring is disabled while borrowing another sekkei.</div>'
            : this._renderAuthoring()}
        </section>

        <section class="specs-col specs-col-sekkei">
          <div class="specs-col-head">
            Sekkei
            <span class="specs-col-head-actions">
              ${this._renderBindingChip()}
              <button class="btn btn-secondary btn-sm" data-action="refresh" ${this.isBusy ? 'disabled' : ''}>
                ${this.isBusy ? 'Loading…' : 'Refresh'}
              </button>
              <button class="btn btn-primary btn-sm" data-action="verify"
                ${this.isBusy || !this.workspaceId || this.borrowing ? 'disabled' : ''}>Run verifier</button>
            </span>
          </div>
          <div class="specs-col-scroll">
            ${this._renderStatus()}
            ${this.borrowing ? `<div class="specs-borrow-banner">
              Read-only — borrowed sekkei. <b>${esc(this.projectName || 'This project')}</b>'s binding is unchanged.
              <button class="btn btn-secondary btn-sm" data-action="stop-borrowing">Back to my sekkei</button>
            </div>` : ''}
            ${this._renderSummary()}
            ${this.borrowing ? '' : this._renderChanges()}
            ${this._renderVerify()}
            ${this.borrowing ? '' : this._renderScrs()}
            <div class="specs-tree">${this._renderTree()}</div>
          </div>
        </section>

        <section class="specs-col specs-col-node">
          <div class="specs-col-head">Node</div>
          <div class="specs-col-scroll specs-detail">${this._renderDetail()}</div>
        </section>

      </div>
    `
    this._restoreComposer()
  }

  /** Put the draft and option choices back after innerHTML replacement. */
  _restoreComposer() {
    const composer = this.container.querySelector('#specs-author-input')
    if (!composer) return
    if (this._composerDraft) composer.value = this._composerDraft
    const opts = this._composerOpts || {}
    const set = (id, value, isCheck) => {
      const el = this.container.querySelector(id)
      if (!el || value === undefined) return
      if (isCheck) el.checked = value
      else if ([...el.options].some(o => o.value === value)) el.value = value
    }
    set('#sekkei-provider', opts.provider)
    set('#sekkei-model', opts.model)
    set('#sekkei-effort', opts.effort)
  }

  /**
   * The authoring pane: the reply window above, the composer pinned below —
   * the Prompt tab's shape, aimed at the design.
   */
  /**
   * The next steps the reply offered, as a checklist. Tick what you want, add
   * a note if it needs steering, and Go sends it back on the same session —
   * the alternative being to retype the session's own proposal at it.
   */
  _renderFollowUps() {
    if (!this.followUps?.length) return ''
    const chosen = this.selectedFollowUps.length
    return `
      <div class="specs-followups">
        <div class="specs-followups-head">Proposed next steps</div>
        ${this.followUps.map(f => `
          <label class="specs-followup ${this.selectedFollowUps.includes(f.id) ? 'checked' : ''}">
            <input type="checkbox" data-action="toggle-followup" data-value="${escAttr(f.id)}"
              ${this.selectedFollowUps.includes(f.id) ? 'checked' : ''}>
            <span>${esc(f.text)}</span>
          </label>
        `).join('')}
        <div class="specs-followups-go">
          <input type="text" id="specs-followup-note" class="specs-followup-note"
            placeholder="Optional: anything to change about it"
            value="${escAttr(this.followUpNote || '')}">
          <button class="btn primary btn-sm" data-action="run-followups" ${chosen ? '' : 'disabled'}>
            ▶ Go${chosen ? ` (${chosen})` : ''}
          </button>
        </div>
      </div>`
  }

  _renderAuthoring() {
    const a = this.authoring
    return `
      <div class="specs-reply" id="specs-author-response-wrap">
        ${a.lastInstruction ? `<div class="specs-reply-echo">${esc(a.lastInstruction)}</div>` : ''}
        ${a.error ? `<div class="specs-editor-error">✗ ${esc(a.error)}</div>` : ''}
        ${(a.isRunning || a.response)
          ? `<div id="specs-author-response" class="specs-reply-body markdown-body">${renderMarkdown(a.response)}</div>`
          : `<div class="specs-reply-empty">
               Describe a design change and the session edits this sekkei —
               creating, updating and deleting nodes. It never touches source code;
               implementation happens later, as a workflow.
             </div>`}
        ${a.isRunning ? '<div class="specs-reply-status">⟳ authoring…</div>' : ''}
        ${a.isRunning ? '' : this._renderFollowUps()}
      </div>
      <div class="specs-composer">
        <textarea id="specs-author-input" class="specs-author-input" rows="3"
          placeholder="e.g. add a capability for run scheduling, with a component per queue"
          ${a.isRunning ? 'disabled' : ''}></textarea>

        <div class="prompt-options">
          <div class="prompt-option-group">
            <label for="sekkei-provider" class="prompt-select-label">Provider:</label>
            <select id="sekkei-provider" class="prompt-model-select" ${a.isRunning ? 'disabled' : ''}>
              <option value="claude">Claude</option>
              <option value="vibe">Mistral Vibe</option>
              <option value="local">Local LLM</option>
            </select>
          </div>
          <div class="prompt-option-group">
            <label for="sekkei-model" class="prompt-select-label">Model:</label>
            <select id="sekkei-model" class="prompt-model-select" ${a.isRunning ? 'disabled' : ''}>
              ${this.models.length === 0
                ? '<option value="">Loading models…</option>'
                : this.models.map(m => `<option value="${esc(m.id)}"${m.id === this.defaultModel ? ' selected' : ''}>${esc(m.name)} — ${esc(m.description)}</option>`).join('')}
            </select>
          </div>
          <div class="prompt-option-group">
            <label for="sekkei-effort" class="prompt-select-label">Effort:</label>
            <select id="sekkei-effort" class="prompt-model-select" ${a.isRunning ? 'disabled' : ''}>
              <option value="">Default</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="xhigh">X-High</option>
              <option value="max">Max</option>
            </select>
          </div>
        </div>

        <div class="prompt-actions specs-composer-actions">
          <button class="btn outline" data-action="new-authoring-thread"
            ${a.isRunning ? 'disabled' : ''}
            title="${this.authoringSessionId
              ? 'Start a fresh design conversation (the current one stays in Tasks)'
              : 'Already a fresh conversation'}">＋ New design thread</button>
          <button class="btn outline ${this.quickMode ? 'active' : ''}" data-action="toggle-quick"
            title="Ask about the sekkei without changing anything">💬 Quick Q</button>
          <button class="btn outline" data-action="review-specs"
            ${a.isRunning || !this.workspaceId ? 'disabled' : ''}
            title="Review this sekkei for gaps, ambiguity and altitude errors">🔍 Review specs</button>
          <button class="btn outline" data-action="new-work-item"
            ${!this.selectedGlmId ? 'disabled' : ''}
            title="${this.selectedGlmId
              ? `Put ${this.selectedGlmId} on the Workflow board as a card to implement`
              : 'Select a spec in the tree first'}">→ Send to Workflow</button>

          <div class="dropdown ${this.openMenu === 'docs' ? 'open' : ''}" id="sekkei-docs-dropdown">
            <button class="btn secondary" data-action="menu-docs" title="Include design documents as reference">
              Include Docs${this.selectedDocs.length ? ` (${this.selectedDocs.length})` : ''} ▾
            </button>
            <div class="dropdown-menu">${this._renderMenuItems(this.designDocs, this.selectedDocs, 'doc', 'No documents in docs/')}</div>
          </div>

          <div class="dropdown ${this.openMenu === 'gui' ? 'open' : ''}" id="sekkei-gui-dropdown">
            <button class="btn secondary" data-action="menu-gui" title="Include a GUI design as visual context">
              Include GUI${this.selectedGuis.length ? ` (${this.selectedGuis.length})` : ''} ▾
            </button>
            <div class="dropdown-menu">${this._renderMenuItems(this.guiDesigns, this.selectedGuis, 'gui', 'No GUI designs yet')}</div>
          </div>

          <button class="mic-btn ${this.isRecording ? 'recording' : ''}" data-action="mic"
            ${a.isRunning ? 'disabled' : ''} title="Voice input (speech-to-text)">🎙</button>

          ${a.isRunning
            ? '<button class="btn secondary" data-action="cancel-author">Cancel</button>'
            : `<button class="btn primary" data-action="author" ${!this.workspaceId ? 'disabled' : ''}>Author</button>`}
        </div>
      </div>`
  }

  /** Multi-select menu items, in the prompt view's shape. */
  _renderMenuItems(items, selected, kind, emptyLabel) {
    if (!items || items.length === 0) {
      return `<div class="dropdown-item disabled"><span class="item-label">${esc(emptyLabel)}</span></div>`
    }
    const rows = items.map(item => {
      const value = item.filename || item.path || item.name || String(item)
      const label = item.name || item.filename || String(item)
      const isSelected = selected.includes(value)
      return `<div class="dropdown-item ${isSelected ? 'selected' : ''}"
        data-action="pick-${kind}" data-value="${esc(value)}">
        <span class="item-checkbox">${isSelected ? '☑' : '☐'}</span>
        <span class="item-label">${esc(label)}</span>
      </div>`
    }).join('')
    const clear = selected.length > 0
      ? `<div class="dropdown-item clear-selection" data-action="clear-${kind}">
           <span class="item-icon">✕</span><span class="item-label">Clear Selection</span>
         </div><div class="dropdown-divider"></div>`
      : ''
    return clear + rows
  }

  _renderChanges() {
    const changed = this._changedNodes()
    const note = this.queueNote
    return `<div class="specs-changes">
      <div class="specs-changes-line">
        <b>${changed.length}</b> spec${changed.length === 1 ? '' : 's'} changed
        ${this.lastGenerationAt
          ? `since the last generation (${esc(String(this.lastGenerationAt).slice(0, 16).replace('T', ' '))})`
          : '— nothing generated from this sekkei yet'}
        <span class="specs-changes-actions">
          <button class="btn btn-primary btn-sm" data-action="queue-changes"
            ${changed.length === 0 || note?.pending ? 'disabled' : ''}>
            ${note?.pending ? 'Queueing…' : 'Queue to Workflow'}
          </button>
          <button class="btn btn-secondary btn-sm" data-action="mark-generated"
            title="Reset the change window — the current design is what the code reflects">Mark generated</button>
        </span>
      </div>
      ${note?.error ? `<div class="specs-editor-error">✗ ${esc(note.error)}</div>` : ''}
      ${note && note.added !== undefined ? `<div class="specs-changes-note">
        Queued ${note.added} card${note.added === 1 ? '' : 's'} onto the Workflow${note.skipped ? ` (${note.skipped} already there)` : ''} —
        open the Workflow tab to run them.
      </div>` : ''}
    </div>`
  }

  _renderBindingChip() {
    if (!this.status?.available) return ''
    if (!this.binding) return ''
    const others = this.workspaces.filter(w => w.id !== this.binding.workspaceId)
    return `
      <span class="specs-bound" title="This project's sekkei">
        ⛓ ${esc(this.binding.name)} <code>${esc(this.binding.slug)}</code>
      </span>
      ${others.length > 0 ? `
        <select id="specs-borrow-select" class="form-control specs-ws-select"
          title="Peek at another project's sekkei (read-only)">
          <option value="">borrow from…</option>
          ${others.map(w => `<option value="${esc(w.id)}" ${this.borrowing && w.id === this.workspaceId ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}
        </select>` : ''}
    `
  }

  _renderBindScreen() {
    const suggested = (this.projectName || '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
      .replace(/^[^a-z]*/, '') || 'my-project'
    return `<div class="specs-bind">
      <h3>This project has no sekkei yet</h3>
      <p>A Puffin project is bound to exactly one sekkei — its design of record.
      Create an empty one for <b>${esc(this.projectName || 'this project')}</b>, or bind a sekkei
      that already exists. Binding also points the sekkei at this project's directory,
      so generation and acceptance verifiers run here.</p>
      ${this.bindError ? `<div class="specs-editor-error">✗ ${esc(this.bindError)}</div>` : ''}
      <div class="specs-bind-row">
        <input type="text" id="specs-bind-slug" class="form-control"
          value="${esc(suggested)}" placeholder="sekkei slug" ${this.isBinding ? 'disabled' : ''}>
        <button class="btn btn-primary" data-action="create-bind" ${this.isBinding ? 'disabled' : ''}>
          ${this.isBinding ? 'Creating…' : 'Create empty sekkei'}
        </button>
      </div>
      ${this.workspaces.length > 0 ? `
        <div class="specs-bind-row specs-bind-existing">
          <select id="specs-bind-existing" class="form-control" ${this.isBinding ? 'disabled' : ''}>
            <option value="">bind an existing sekkei…</option>
            ${this.workspaces.map(w => `<option value="${esc(w.id)}">${esc(w.name)} (${esc(w.slug)})</option>`).join('')}
          </select>
          <button class="btn btn-secondary" data-action="bind-existing" ${this.isBinding ? 'disabled' : ''}>Bind</button>
        </div>` : ''}
    </div>`
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
        <div class="specs-stat"><span class="v">${strata[k] ?? 0}</span><span class="k">${esc((strata[k] ?? 0) === 1 ? k : STRATUM_PLURAL[k])}</span></div>
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

  _renderScrs() {
    if (!this.workspaceId) return ''
    const open = this.scrs.filter(s => !['Released', 'Rejected'].includes(s.status))
    return `<div class="specs-scrs">
      <div class="specs-scrs-header">
        <button class="specs-twisty" data-action="toggle-scrs">${this.showScrs ? '▾' : '▸'}</button>
        <span class="specs-scrs-title">Changes (SCRs)</span>
        <span class="specs-badge">${open.length} open · ${this.scrs.length} total</span>
        <button class="btn btn-secondary btn-sm specs-scr-new" data-action="new-scr">New SCR</button>
      </div>
      ${this.scrError ? `<div class="specs-editor-error">✗ ${esc(this.scrError)}</div>` : ''}
      ${this.scrForm ? this._renderScrForm() : ''}
      ${this.showScrs || this.scrForm ? this._renderScrList() : ''}
    </div>`
  }

  _renderScrForm() {
    const form = this.scrForm
    return `<div class="specs-scr-form">
      ${form.error ? `<div class="specs-editor-error">✗ ${esc(form.error)}</div>` : ''}
      <input type="text" id="scr-title" placeholder="Title — what changes" value="${esc(form.title || '')}" ${form.isSaving ? 'disabled' : ''}>
      <textarea id="scr-problem" rows="2" placeholder="Problem — why this change is needed" ${form.isSaving ? 'disabled' : ''}>${esc(form.problem || '')}</textarea>
      <div class="specs-scr-form-row">
        <select id="scr-class" ${form.isSaving ? 'disabled' : ''}>
          <option value="II" ${form.scrClass !== 'I' ? 'selected' : ''}>Class II (minor — no interface change)</option>
          <option value="I" ${form.scrClass === 'I' ? 'selected' : ''}>Class I (major — interface/contract change)</option>
        </select>
        ${this.selectedGlmId ? `<span class="specs-hint">target: <code>${esc(this.selectedGlmId)}</code></span>` : ''}
        <button class="btn btn-primary btn-sm" data-action="create-scr" ${form.isSaving ? 'disabled' : ''}>
          ${form.isSaving ? 'Creating…' : 'Create'}
        </button>
        <button class="btn btn-secondary btn-sm" data-action="cancel-scr" ${form.isSaving ? 'disabled' : ''}>Cancel</button>
      </div>
    </div>`
  }

  _renderScrList() {
    if (this.scrs.length === 0) {
      return '<div class="specs-empty">No SCRs yet — an SCR is the unit of change: Draft → Submitted → Under Review → Approved → Implemented → Released.</div>'
    }
    return `<div class="specs-scr-list">
      ${this.scrs.map(scr => `
        <div class="specs-scr-row">
          <code class="specs-scr-id">${esc(scr.id)}</code>
          <span class="specs-badge">Class ${esc(scr.scrClass)}</span>
          <span class="specs-scr-title-text">${esc(scr.title)}</span>
          <span class="specs-badge specs-scr-status-${esc(String(scr.status).replace(/\s/g, '-'))}">${esc(scr.status)}</span>
          <span class="specs-scr-actions">
            ${(SCR_EVENTS[scr.status] || []).map(ev => `
              <button class="btn btn-secondary btn-sm" data-action="scr-event"
                data-scr-id="${esc(scr.id)}" data-event="${esc(ev)}">${esc(ev)}</button>
            `).join('')}
          </span>
        </div>
      `).join('')}
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
      ${body ? `<pre class="specs-json">${renderJson(body, new Set(this.nodes.map(n => n.glmId)))}</pre>` : ''}
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
