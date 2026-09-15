/**
 * QuestionNavigator - Left rail: the questions (one per diagram) and the model sections.
 */

import { escapeHtml, el } from './dom.js'

const MODEL_SECTIONS = [
  { key: 'components', label: 'Components' },
  { key: 'relations', label: 'Relations' },
  { key: 'boundaries', label: 'Boundaries' },
  { key: 'facts', label: 'Facts' },
  { key: 'glossary', label: 'Glossary' }
]

export class QuestionNavigator {
  /**
   * @param {HTMLElement} container
   * @param {Object} handlers
   * @param {Function} handlers.onSelectQuestion - (id) => void
   * @param {Function} handlers.onSelectSection - (key) => void
   * @param {Function} handlers.onRenderQuestion - (id) => void
   * @param {Function} handlers.onOpenHtml - (id) => void
   */
  constructor(container, handlers) {
    this.container = container
    this.handlers = handlers
    this.questions = []
    this.counts = {}
    this.selected = null // { type: 'question'|'section', id }
    this.filter = ''
    this.container.classList.add('arch-nav')
    this.container.addEventListener('click', (e) => this._onClick(e))
    this.container.addEventListener('contextmenu', (e) => this._onContextMenu(e))
    this.container.addEventListener('input', (e) => {
      if (e.target.classList.contains('arch-nav-search')) {
        this.filter = e.target.value.trim().toLowerCase()
        this._renderList()
      }
    })
  }

  /**
   * @param {Object} data - `{ questions, counts }` from `load`
   */
  setData({ questions, counts }) {
    this.questions = questions || []
    this.counts = counts || {}
    this.render()
  }

  /**
   * Update render state for questions without a full reload.
   * @param {Object} renderState
   */
  setRenderState(renderState) {
    for (const q of this.questions) {
      if (renderState[q.id]) q.render = renderState[q.id]
    }
    this._renderList()
  }

  select(type, id) {
    this.selected = { type, id }
    this.container.querySelectorAll('.arch-nav-item').forEach(node => {
      node.classList.toggle('active', node.dataset.type === type && node.dataset.id === id)
    })
  }

  /**
   * Move the question selection by an offset (keyboard).
   * @param {number} delta
   * @returns {string|null} New question id
   */
  step(delta) {
    const ids = this._visibleQuestions().map(q => q.id)
    if (ids.length === 0) return null
    let idx = this.selected?.type === 'question' ? ids.indexOf(this.selected.id) : -1
    idx = Math.min(ids.length - 1, Math.max(0, idx + delta))
    return ids[idx]
  }

  render() {
    this.container.innerHTML = `
      <div class="arch-nav-section">
        <div class="arch-nav-heading">
          <span>Questions</span>
          <span class="arch-nav-count">${this.questions.length}</span>
        </div>
        <input class="arch-nav-search" type="search" placeholder="Filter questions…" value="${escapeHtml(this.filter)}" data-help="Filter the questions by title, ask, or component.">
        <ul class="arch-nav-list arch-nav-questions"></ul>
      </div>
      <div class="arch-nav-section">
        <div class="arch-nav-heading"><span>Model</span></div>
        <ul class="arch-nav-list arch-nav-model">
          ${MODEL_SECTIONS.map(s => `
            <li class="arch-nav-item arch-nav-model-item" data-type="section" data-id="${s.key}" data-help="Browse every ${s.label.toLowerCase()} in the analysis.">
              <span class="arch-nav-label">${s.label}</span>
              <span class="arch-nav-count">${this.counts[s.key] ?? ''}</span>
            </li>`).join('')}
        </ul>
      </div>`
    this._renderList()
    if (this.selected) this.select(this.selected.type, this.selected.id)
  }

  _visibleQuestions() {
    if (!this.filter) return this.questions
    return this.questions.filter(q => {
      const hay = `${q.title || ''} ${q.ask || ''} ${q.id}`.toLowerCase()
      return hay.includes(this.filter)
    })
  }

  _renderList() {
    const list = this.container.querySelector('.arch-nav-questions')
    if (!list) return
    const visible = this._visibleQuestions()
    if (visible.length === 0) {
      list.innerHTML = `<li class="arch-nav-empty">${this.questions.length ? 'No question matches.' : 'No questions yet.'}</li>`
      return
    }
    list.innerHTML = visible.map(q => {
      const r = q.render || {}
      const dot = !r.rendered ? 'none' : (r.stale ? 'stale' : 'ok')
      const dotTitle = dot === 'ok' ? 'Rendered' : dot === 'stale' ? 'Rendered before the analysis last changed' : 'Not rendered'
      const glyph = q.shape === 'sequence' ? '⇄' : '▦'
      return `
        <li class="arch-nav-item arch-nav-question ${this.selected?.type === 'question' && this.selected.id === q.id ? 'active' : ''}"
            data-type="question" data-id="${escapeHtml(q.id)}" title="${escapeHtml(q.ask || '')}">
          <span class="arch-dot arch-dot-${dot}" title="${dotTitle}"></span>
          <span class="arch-nav-glyph" title="${q.shape === 'sequence' ? 'Sequence' : 'Architecture'}">${glyph}</span>
          <span class="arch-nav-label">${escapeHtml(q.title || q.id)}</span>
          <span class="arch-nav-count">${q.involves ?? ''}</span>
        </li>`
    }).join('')
  }

  _onClick(e) {
    const item = e.target.closest('.arch-nav-item')
    if (!item) return
    const { type, id } = item.dataset
    this.select(type, id)
    if (type === 'question') this.handlers.onSelectQuestion?.(id)
    else this.handlers.onSelectSection?.(id)
  }

  _onContextMenu(e) {
    const item = e.target.closest('.arch-nav-question')
    if (!item) return
    e.preventDefault()
    this._closeMenu()
    const id = item.dataset.id
    const menu = el('div', { class: 'arch-context-menu' }, `
      <button data-action="render">Re-render this question</button>
      <button data-action="open">Open HTML in browser</button>
      <button data-action="copy">Copy question id</button>`)
    menu.style.left = `${e.clientX}px`
    menu.style.top = `${e.clientY}px`
    menu.addEventListener('click', (ev) => {
      const action = ev.target.dataset.action
      if (action === 'render') this.handlers.onRenderQuestion?.(id)
      else if (action === 'open') this.handlers.onOpenHtml?.(id)
      else if (action === 'copy') navigator.clipboard?.writeText?.(id)
      this._closeMenu()
    })
    document.body.appendChild(menu)
    this._menu = menu
    setTimeout(() => document.addEventListener('click', this._closeMenuBound = () => this._closeMenu(), { once: true }), 0)
  }

  _closeMenu() {
    if (this._menu) { this._menu.remove(); this._menu = null }
  }

  destroy() {
    this._closeMenu()
  }
}
