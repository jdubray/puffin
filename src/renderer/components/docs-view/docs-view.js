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
      }
    })
  }

  onShow() {
    if (!this.hasLoaded && !this.isBusy) this.refresh()
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
    `
    // The iframe is filled after insertion: srcdoc set as a property, never
    // interpolated into the markup.
    const frame = this.container.querySelector('#docs-frame')
    if (frame && this.selected?.kind === 'html') {
      frame.srcdoc = this.selected.content
    }
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
