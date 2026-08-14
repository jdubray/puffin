/**
 * Docs View — read this project's `docs/` tree.
 *
 * Markdown is rendered with the shared reply renderer, so a document reads the
 * same way a reply does. HTML documents render inside a **sandboxed iframe**
 * with no `allow-scripts` and no `allow-same-origin`: a checked-in HTML file is
 * only as trustworthy as whoever committed it, and this window holds the
 * `window.puffin` preload bridge. Sandboxing puts the document behind a real
 * browser boundary rather than a filter that has to be right every time.
 */

import { renderMarkdown } from '../../lib/markdown.js'

/** Escape text for safe interpolation into HTML */
function esc(text) {
  const div = document.createElement('div')
  div.textContent = String(text ?? '')
  return div.innerHTML
}

/**
 * The document-authoring prompt.
 *
 * The deliverable is a file under `docs/`, not a message: the session writes it
 * and reports what it wrote. HTML is constrained to what the reader can
 * actually show — the Docs view renders it in a sandboxed frame with no
 * scripts and no network, so a document that reaches for a CDN font or a chart
 * library renders broken and there is no console to tell you why.
 *
 * @param {string} instruction - What the user asked for
 * @param {Object} context
 * @param {string} [context.targetPath] - Document to revise, relative to docs/
 * @param {string} [context.format] - 'html' | 'markdown'
 * @param {string[]} [context.existing] - Current docs/ contents, for naming and cross-reference
 * @returns {string}
 */
function buildDocsPrompt(instruction, { targetPath, format, existing = [] } = {}) {
  const wantsHtml = format === 'html'
  return `You are authoring a document in this project's \`docs/\` directory.

${targetPath
  ? `Revise the existing document \`docs/${targetPath}\`. Read it first, keep what still holds, and write it back to the same path.`
  : `Create a new document under \`docs/\`. Choose a descriptive kebab-case filename and file it in an existing subdirectory when one fits.`}
Format: ${wantsHtml ? 'a single self-contained HTML file' : 'Markdown'}.

${wantsHtml ? `The Docs view renders HTML inside a sandboxed iframe: no scripts run, and
nothing external loads. So the file must be self-contained — inline all CSS,
use no <script>, no CDN links, no webfonts, no remote images (embed as data:
URIs if an image is essential). Include <!DOCTYPE html>, a <title>, and a
viewport meta. Design it to be read: real typographic hierarchy, a considered
palette, and legible on a light page since the frame paints its own white
ground.

` : ''}Content rules:
- Ground every claim in this repository. Read the code, the specs and the
  existing docs rather than describing what a project like this usually does.
- Say plainly what is not built yet. A document that describes intent as if it
  were fact is worse than one that admits the gap.
- Keep it project-portable: this repository is a tool, so do not name whatever
  project someone happens to be building with it.
${existing.length ? `
Existing documents (for naming and cross-reference):
${existing.slice(0, 40).map(f => `  ${f}`).join('\n')}${
  existing.length > 40 ? `\n  … and ${existing.length - 40} more` : ''}
` : ''}
Write the file with the Write tool. Do not print the document in your reply —
report only the path you wrote and, in two or three sentences, what it covers
and anything you deliberately left out.

Request: ${instruction}`
}

/** Group documents by their directory under docs/ — '' is the root. */
function byFolder(documents) {
  const groups = new Map()
  for (const doc of documents) {
    const at = doc.filename.lastIndexOf('/')
    const folder = at < 0 ? '' : doc.filename.slice(0, at)
    if (!groups.has(folder)) groups.set(folder, [])
    groups.get(folder).push(doc)
  }
  // Root first, then alphabetical — the top level is the table of contents
  return [...groups.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
}

export class DocsViewComponent {
  constructor(intents) {
    this.intents = intents
    this.container = null
    this.documents = []
    this.selected = null // { filename, name, kind, content }
    this.error = null
    this.isBusy = false
    this.hasLoaded = false
    this.query = ''
    // Authoring loop — the Prompt tab's shape, aimed at docs/
    this.authoring = { isRunning: false, response: '', error: null, lastInstruction: '' }
    this.authoringSessionId = null
    this.authoringThreadId = null
    this.format = 'html'
    this.reviseOpen = true // revise the open document rather than create a new one
    this.models = []
    this.defaultModel = ''
    this._composerDraft = ''
    this._authoringSubscribed = false
  }

  init() {
    this.container = document.getElementById('docs-view-root')
    if (!this.container) {
      console.log('[DOCS-VIEW] Container not found')
      return
    }
    this.render()
    this.container.addEventListener('click', (e) => this._onClick(e))
    this.container.addEventListener('input', (e) => {
      if (e.target.id === 'docs-search') {
        this.query = e.target.value
        this._renderListOnly()
      } else if (e.target.id === 'docs-author-input') {
        this._composerDraft = e.target.value
      }
    })
  }

  onShow() {
    if (!this.hasLoaded && !this.isBusy) this.refresh()
    if (!this.models.length) this._loadModels()
  }

  /** The composer's model list — fetched here, since the view owns its own. */
  async _loadModels() {
    try {
      const res = await window.puffin.claude.getModels()
      this.models = res?.models || res || []
      this.defaultModel = res?.defaultModel || ''
      this.render()
    } catch { /* the composer falls back to the CLI default */ }
  }

  async refresh() {
    this.isBusy = true
    this.error = null
    this.render()
    try {
      const res = await window.puffin.state.getDesignDocuments()
      this.documents = res?.success ? (res.documents || []) : []
      if (!res?.success) this.error = res?.error || 'could not read docs/'
      this.hasLoaded = true
    } catch (error) {
      this.error = error.message
    } finally {
      this.isBusy = false
      this.render()
    }
  }

  async open(filename) {
    this.error = null
    this.selected = { filename, name: filename, kind: 'markdown', content: '', pending: true }
    this.render()
    try {
      const res = await window.puffin.state.loadDesignDocument(filename)
      if (!res?.success) throw new Error(res?.error || 'could not read the document')
      this.selected = res.document
    } catch (error) {
      this.selected = null
      this.error = error.message
    }
    this.render()
  }

  _onClick(e) {
    const button = e.target.closest('[data-action]')
    if (!button) return
    const { action, value } = button.dataset
    if (action === 'refresh') this.refresh()
    else if (action === 'open-doc' && value) this.open(value)
    else if (action === 'close-doc') { this.selected = null; this.render() }
    else if (action === 'write-doc') this.submitAuthoring()
    else if (action === 'cancel-doc') this.cancelAuthoring()
    else if (action === 'new-doc-thread') this.newAuthoringThread()
    else if (action === 'set-format' && value) { this.format = value; this.render() }
    else if (action === 'toggle-revise') { this.reviseOpen = !this.reviseOpen; this.render() }
  }

  /**
   * Ask a session to write a document into docs/.
   *
   * The reply is a report, not the document — the file lands on disk and the
   * view opens it, which is the only way to know the thing actually renders.
   */
  submitAuthoring() {
    const input = this.container.querySelector('#docs-author-input')
    const instruction = input?.value?.trim()
    if (!instruction || this.authoring.isRunning) return

    const model = this.container.querySelector('#docs-model')?.value || undefined
    const effort = this.container.querySelector('#docs-effort')?.value || ''
    const targetPath = this._reviseTarget()

    if (input) input.value = ''
    this._composerDraft = ''
    this._knownBefore = new Set(this.documents.map(d => d.filename))
    this.authoring = { isRunning: true, response: '', error: null, lastInstruction: instruction }
    this.render()

    if (!this._authoringSubscribed) {
      this._authoringSubscribed = true
      window.puffin.claude.onResponse((chunk) => {
        if (!this.authoring.isRunning) return
        this.authoring.response += typeof chunk === 'string' ? chunk : (chunk?.content || '')
        this._renderReplyOnly()
      })
      window.puffin.claude.onComplete(async (response) => {
        if (!this.authoring.isRunning) return
        this.authoring.isRunning = false
        if (response?.sessionId) this.authoringSessionId = response.sessionId
        await this.refresh()
        // Open what was written: the document it revised, or whatever is new.
        const written = targetPath || this._firstNewDocument()
        if (written) await this.open(written)
        else this.render()
      })
      window.puffin.claude.onError((error) => {
        if (!this.authoring.isRunning) return
        this.authoring.isRunning = false
        this.authoring.error = typeof error === 'string' ? error : (error?.message || 'failed')
        this.render()
      })
    }

    // One history stream, tagged as a document turn (see sam/state.js)
    const turnId = `dc-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
    try {
      this.intents?.submitPrompt?.({
        id: turnId,
        branchId: 'main',
        parentId: this.authoringThreadId || null,
        content: instruction,
        surface: 'docs'
      })
      if (!this.authoringThreadId) this.authoringThreadId = turnId
    } catch (error) {
      console.warn('[DOCS-VIEW] Could not record the authoring turn:', error.message)
    }

    window.puffin.claude.submit({
      prompt: buildDocsPrompt(instruction, {
        targetPath,
        format: targetPath ? this._formatOf(targetPath) : this.format,
        existing: this.documents.map(d => d.filename)
      }),
      model,
      effort: effort || undefined,
      sessionId: this.authoringSessionId || null
    })
  }

  /** The open document, when the composer is set to revise it. @private */
  _reviseTarget() {
    return (this.reviseOpen && this.selected && !this.selected.pending)
      ? this.selected.filename
      : null
  }

  /** @private */
  _formatOf(filename) {
    return /\.html?$/i.test(filename) ? 'html' : 'markdown'
  }

  /** The document that appeared during the last turn. @private */
  _firstNewDocument() {
    const before = this._knownBefore || new Set()
    return this.documents.map(d => d.filename).find(f => !before.has(f)) || null
  }

  cancelAuthoring() {
    window.puffin.claude.cancel()
    this.authoring.isRunning = false
    this.render()
  }

  /** Start a fresh authoring conversation — new session, new thread. */
  newAuthoringThread() {
    this.authoringSessionId = null
    this.authoringThreadId = null
    this.authoring = { isRunning: false, response: '', error: null, lastInstruction: '' }
    this._composerDraft = ''
    this.render()
  }

  _filtered() {
    const q = this.query.trim().toLowerCase()
    if (!q) return this.documents
    return this.documents.filter(d => d.filename.toLowerCase().includes(q))
  }

  /** Re-render just the list, so typing in the filter never rebuilds the reader. */
  _renderListOnly() {
    const list = this.container.querySelector('#docs-list')
    if (list) list.innerHTML = this._renderList()
  }

  render() {
    if (!this.container) return
    this.container.innerHTML = `
      <div class="docs-toolbar">
        <span class="docs-count">
          ${this.isBusy ? 'Scanning docs/…' : `${this.documents.length} document${this.documents.length === 1 ? '' : 's'} in docs/`}
        </span>
        <button class="btn btn-secondary btn-sm" data-action="refresh" ${this.isBusy ? 'disabled' : ''}>Refresh</button>
      </div>

      ${this.error ? `<div class="docs-error">✗ ${esc(this.error)}</div>` : ''}

      <div class="docs-body">
        <aside class="docs-index">
          <input type="text" id="docs-search" class="docs-search" placeholder="Filter…"
            value="${esc(this.query)}">
          <div id="docs-list" class="docs-list">${this._renderList()}</div>
        </aside>
        <main class="docs-reader">${this._renderReader()}</main>
      </div>

      ${this._renderComposer()}
    `
    // The iframe is filled after insertion: srcdoc set as a property, never
    // interpolated into the markup.
    const frame = this.container.querySelector('#docs-frame')
    if (frame && this.selected?.kind === 'html') {
      frame.srcdoc = this.selected.content
    }
    const draft = this.container.querySelector('#docs-author-input')
    if (draft && this._composerDraft) draft.value = this._composerDraft
  }

  /** Re-render just the reply, so streaming never rebuilds the reader. @private */
  _renderReplyOnly() {
    const pane = this.container.querySelector('#docs-reply-body')
    if (pane) {
      pane.innerHTML = renderMarkdown(this.authoring.response)
      pane.scrollTop = pane.scrollHeight
    }
  }

  /**
   * The composer: a prompt window whose deliverable is a file in docs/.
   *
   * Pinned under the reader rather than beside it — you read the document, then
   * say what should change about it, the way the Prompt tab works.
   */
  _renderComposer() {
    const a = this.authoring
    const target = this._reviseTarget()
    return `
      <div class="docs-composer">
        ${(a.isRunning || a.response || a.error) ? `
          <div class="docs-reply">
            ${a.lastInstruction ? `<div class="docs-reply-echo">${esc(a.lastInstruction)}</div>` : ''}
            ${a.error ? `<div class="docs-error">✗ ${esc(a.error)}</div>` : ''}
            <div id="docs-reply-body" class="docs-markdown docs-reply-body">${renderMarkdown(a.response)}</div>
            ${a.isRunning ? '<div class="docs-reply-status">⟳ writing…</div>' : ''}
          </div>` : ''}

        <textarea id="docs-author-input" class="docs-author-input" rows="3"
          placeholder="${target
            ? `Describe the revision to ${esc(target)}…`
            : 'Describe the document to write — it lands in docs/ and opens here.'}"
          ${a.isRunning ? 'disabled' : ''}></textarea>

        <div class="docs-composer-row">
          <div class="docs-target ${target ? 'is-revise' : ''}">
            ${this.selected && !this.selected.pending ? `
              <label class="docs-check">
                <input type="checkbox" data-action="toggle-revise" ${this.reviseOpen ? 'checked' : ''}
                  ${a.isRunning ? 'disabled' : ''}>
                <span>Revise <code>${esc(this.selected.filename)}</code></span>
              </label>` : '<span class="docs-target-new">New document in docs/</span>'}
          </div>

          ${target ? '' : `
            <div class="docs-format">
              ${['html', 'markdown'].map(f => `
                <button class="btn btn-sm ${this.format === f ? 'active' : ''}"
                  data-action="set-format" data-value="${f}" ${a.isRunning ? 'disabled' : ''}
                >${f === 'html' ? 'HTML' : 'Markdown'}</button>`).join('')}
            </div>`}

          <select id="docs-model" class="docs-select" ${a.isRunning ? 'disabled' : ''}>
            ${this.models.length === 0
              ? '<option value="">Default model</option>'
              : this.models.map(m => `<option value="${esc(m.id)}"${m.id === this.defaultModel ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}
          </select>

          <select id="docs-effort" class="docs-select" ${a.isRunning ? 'disabled' : ''}>
            <option value="">Effort: default</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="xhigh">X-High</option>
            <option value="max">Max</option>
          </select>

          <div class="docs-composer-actions">
            <button class="btn btn-secondary btn-sm" data-action="new-doc-thread"
              ${a.isRunning || !this.authoringSessionId ? 'disabled' : ''}
              title="Start a fresh authoring conversation">＋ New</button>
            ${a.isRunning
              ? '<button class="btn btn-sm" data-action="cancel-doc">Cancel</button>'
              : `<button class="btn btn-primary btn-sm" data-action="write-doc">
                   ${target ? 'Revise' : 'Write'} document
                 </button>`}
          </div>
        </div>
      </div>`
  }

  _renderList() {
    const docs = this._filtered()
    if (!docs.length) {
      return `<div class="docs-empty">${
        this.documents.length
          ? 'Nothing matches that filter.'
          : 'No .md or .html documents under docs/.'
      }</div>`
    }
    return byFolder(docs).map(([folder, entries]) => `
      <div class="docs-group">
        <div class="docs-group-name">${folder ? esc(folder) : 'docs/'}</div>
        ${entries.map(doc => {
          const label = doc.filename.slice(folder ? folder.length + 1 : 0)
          const isOpen = this.selected?.filename === doc.filename
          return `<button class="docs-item ${isOpen ? 'active' : ''}"
            data-action="open-doc" data-value="${esc(doc.filename)}" title="${esc(doc.filename)}">
            <span class="docs-kind docs-kind-${esc(doc.kind)}">${doc.kind === 'html' ? 'HTM' : 'MD'}</span>
            <span class="docs-item-name">${esc(label)}</span>
          </button>`
        }).join('')}
      </div>
    `).join('')
  }

  _renderReader() {
    const doc = this.selected
    if (!doc) {
      return `<div class="docs-placeholder">
        Pick a document. Markdown renders inline; HTML opens in a sandboxed
        frame — it cannot run scripts or reach this window.
      </div>`
    }
    if (doc.pending) return '<div class="docs-placeholder">Loading…</div>'

    const header = `
      <div class="docs-reader-head">
        <span class="docs-reader-title">${esc(doc.filename)}</span>
        <button class="btn btn-secondary btn-sm" data-action="close-doc">Close</button>
      </div>`

    if (doc.kind === 'html') {
      // sandbox="" — no scripts, no same-origin, no forms, no top navigation.
      return `${header}
        <iframe id="docs-frame" class="docs-frame" sandbox=""
          title="${esc(doc.filename)}" referrerpolicy="no-referrer"></iframe>`
    }
    return `${header}
      <div class="docs-markdown">${renderMarkdown(doc.content)}</div>`
  }
}
