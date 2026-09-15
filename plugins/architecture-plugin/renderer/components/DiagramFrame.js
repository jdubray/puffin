/**
 * DiagramFrame - Shows one archify page in a sandboxed iframe, with a toolbar
 * and the "dropped" strip that says what the diagram left out.
 */

import { escapeHtml, invoke, toast, currentTheme, openInEditor } from './dom.js'

const CACHE_MAX = 3

export class DiagramFrame {
  /**
   * @param {HTMLElement} container
   * @param {Object} [options]
   * @param {Function} [options.onOpenJson] - (questionId) => void
   */
  constructor(container, options = {}) {
    this.container = container
    this.options = options
    this.questionId = null
    this.theme = currentTheme()
    this.followTheme = true
    this._cache = new Map()
    this._onMessage = (e) => this._handleMessage(e)
    window.addEventListener('message', this._onMessage)
    this.container.classList.add('arch-diagram')
    this.render()
  }

  render() {
    this.container.innerHTML = `
      <div class="arch-diagram-toolbar">
        <span class="arch-diagram-title"></span>
        <span class="arch-diagram-spacer"></span>
        <button class="btn small outline" data-action="theme" data-help="Toggle the diagram between light and dark.">${this.theme === 'dark' ? '☀ Light' : '☾ Dark'}</button>
        <button class="btn small outline" data-action="reload" data-help="Reload the diagram from disk.">↻</button>
        <button class="btn small outline" data-action="browser" data-help="Open the diagram page in your browser.">Open in browser</button>
        <button class="btn small outline" data-action="json" data-help="Open the generated archify specification in the Editor.">Spec</button>
      </div>
      <div class="arch-dropped hidden"></div>
      <div class="arch-diagram-body">
        <div class="arch-diagram-placeholder">Select a question to see its diagram.</div>
        <iframe class="arch-diagram-frame hidden" sandbox="allow-scripts allow-same-origin" title="Architecture diagram"></iframe>
      </div>`
    this.container.querySelector('.arch-diagram-toolbar').addEventListener('click', (e) => this._onToolbar(e))
    this.iframe = this.container.querySelector('iframe')
    this.placeholder = this.container.querySelector('.arch-diagram-placeholder')
    this.droppedEl = this.container.querySelector('.arch-dropped')
    this.titleEl = this.container.querySelector('.arch-diagram-title')
  }

  /**
   * Show a question's diagram.
   * @param {Object} question - `{ id, title, render, dropped }`
   * @param {Object} [options]
   * @param {boolean} [options.force] - Bypass the cache
   */
  async show(question, { force = false } = {}) {
    this.questionId = question.id
    this.titleEl.textContent = question.title || question.id
    this._renderDropped(question.dropped || [])
    if (!question.render?.rendered) {
      this._showPlaceholder('This question has not been rendered yet. Use <b>Render all</b> or re-render it from the question list.')
      return
    }
    let entry = !force ? this._cache.get(question.id) : null
    if (!entry || entry.mtime !== question.render.mtime) {
      try {
        const d = await invoke('getDiagram', { id: question.id })
        entry = { html: d.html, mtime: d.mtime, htmlPath: d.htmlPath }
        this._cache.set(question.id, entry)
        while (this._cache.size > CACHE_MAX) this._cache.delete(this._cache.keys().next().value)
      } catch (error) {
        this._showPlaceholder(`Could not load the diagram: ${escapeHtml(error.message)}`)
        return
      }
    }
    if (this.questionId !== question.id) return
    this.placeholder.classList.add('hidden')
    this.iframe.classList.remove('hidden')
    this.iframe.srcdoc = entry.html
    this.htmlPath = entry.htmlPath
  }

  /** Forget cached HTML for a question (after a re-render). */
  invalidate(questionId) {
    if (questionId) this._cache.delete(questionId)
    else this._cache.clear()
  }

  clear() {
    this.questionId = null
    this.titleEl.textContent = ''
    this._renderDropped([])
    this._showPlaceholder('Select a question to see its diagram.')
  }

  _showPlaceholder(html) {
    this.iframe.classList.add('hidden')
    this.iframe.srcdoc = ''
    this.placeholder.innerHTML = html
    this.placeholder.classList.remove('hidden')
  }

  _renderDropped(lines) {
    if (!lines.length) {
      this.droppedEl.classList.add('hidden')
      this.droppedEl.innerHTML = ''
      return
    }
    this.droppedEl.classList.remove('hidden')
    this.droppedEl.innerHTML = `
      <details>
        <summary data-help="What the renderer had to leave out of this diagram.">Left out of this diagram (${lines.length})</summary>
        <ul>${lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
      </details>`
  }

  setTheme(theme) {
    this.theme = theme === 'light' ? 'light' : 'dark'
    const btn = this.container.querySelector('[data-action="theme"]')
    if (btn) btn.textContent = this.theme === 'dark' ? '☀ Light' : '☾ Dark'
    this._postTheme()
  }

  _postTheme() {
    try { this.iframe.contentWindow?.postMessage({ type: 'archlens:theme', theme: this.theme }, '*') } catch { /* ignore */ }
  }

  async _onToolbar(e) {
    const action = e.target.closest('button')?.dataset.action
    if (!action) return
    if (action === 'theme') {
      this.setTheme(this.theme === 'dark' ? 'light' : 'dark')
    } else if (action === 'reload') {
      if (this.questionId) this.options.onReload?.(this.questionId)
    } else if (action === 'browser') {
      if (this.htmlPath) this.options.onOpenHtml?.(this.questionId)
    } else if (action === 'json') {
      if (this.questionId) this.options.onOpenJson?.(this.questionId)
    }
  }

  async _handleMessage(e) {
    if (!this.iframe || e.source !== this.iframe.contentWindow) return
    const d = e.data
    if (!d || typeof d.type !== 'string') return
    if (d.type === 'archlens:ready') {
      this._postTheme()
    } else if (d.type === 'archlens:open') {
      try {
        const r = await invoke('openEvidence', { path: d.path })
        if (!r.exists) { toast(`File not found in the project: ${d.path}`, 'warning'); return }
        const opened = await openInEditor(r.absolutePath)
        if (!opened) toast(`Open ${d.path} in the Editor tab (editor not available)`, 'info')
      } catch (error) {
        toast(error.message, 'error')
      }
    } else if (d.type === 'archlens:external') {
      try { await invoke('openExternal', { url: d.url }) } catch (error) { toast(error.message, 'error') }
    }
  }

  destroy() {
    window.removeEventListener('message', this._onMessage)
    this._cache.clear()
  }
}
