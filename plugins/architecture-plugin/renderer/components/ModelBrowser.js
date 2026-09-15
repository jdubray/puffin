/**
 * ModelBrowser - Centre pane tables for the five model sections.
 */

import { escapeHtml, statusBadge } from './dom.js'

const TITLES = { components: 'Components', relations: 'Relations', boundaries: 'Boundaries', facts: 'Facts', glossary: 'Glossary' }

export class ModelBrowser {
  /**
   * @param {HTMLElement} container
   * @param {Object} handlers
   * @param {Function} handlers.onSelectRecord - (kind, id) => void
   * @param {Function} handlers.onSelectQuestion - (id) => void
   */
  constructor(container, handlers) {
    this.container = container
    this.handlers = handlers
    this.model = null
    this.section = null
    this.filter = ''
    this.container.classList.add('arch-model', 'hidden')
    this.container.addEventListener('click', (e) => this._onClick(e))
    this.container.addEventListener('input', (e) => {
      if (e.target.classList.contains('arch-model-search')) {
        this.filter = e.target.value.trim().toLowerCase()
        this._renderBody()
      }
    })
  }

  setModel(model) {
    this.model = model
    if (this.section) this.show(this.section)
  }

  show(section) {
    this.section = section
    this.container.classList.remove('hidden')
    this.container.innerHTML = `
      <div class="arch-model-header">
        <h3>${TITLES[section] || section} <span class="arch-nav-count">${(this.model?.[section] || []).length}</span></h3>
        <input class="arch-model-search" type="search" placeholder="Filter…" value="${escapeHtml(this.filter)}">
      </div>
      <div class="arch-model-body"></div>`
    this._renderBody()
  }

  hide() {
    this.container.classList.add('hidden')
  }

  highlight(kind, id) {
    this.container.querySelectorAll('tr.active, .arch-card.active').forEach(n => n.classList.remove('active'))
    const node = this.container.querySelector(`[data-kind="${kind}"][data-id="${CSS.escape(id)}"]`)
    node?.closest('tr, .arch-card')?.classList.add('active')
  }

  _rows(list) {
    if (!this.filter) return list
    return list.filter(item => JSON.stringify(item).toLowerCase().includes(this.filter))
  }

  _renderBody() {
    const body = this.container.querySelector('.arch-model-body')
    if (!body || !this.model) return
    const s = this.section
    const rows = this._rows(this.model[s] || [])
    const link = (kind, id, text) => `<a href="#" class="arch-link" data-kind="${kind}" data-id="${escapeHtml(id)}">${escapeHtml(text)}</a>`
    if (s === 'components') {
      body.innerHTML = `<table class="arch-table"><thead><tr><th>Name</th><th>Kind</th><th>Status</th><th>Responsibility</th><th>Boundary</th><th>Rel.</th><th>Q.</th></tr></thead><tbody>
        ${rows.map(c => `<tr><td>${link('component', c.id, c.name)}${c.detail ? `<div class="arch-muted">${escapeHtml(c.detail)}</div>` : ''}</td><td>${escapeHtml(c.kind || '')}</td><td>${statusBadge(c.status)}</td><td>${escapeHtml(c.responsibility || '')}</td><td>${escapeHtml(c.boundary || '')}</td><td>${c.relations}</td><td>${c.questions}</td></tr>`).join('')}
      </tbody></table>`
    } else if (s === 'relations') {
      body.innerHTML = `<table class="arch-table"><thead><tr><th>From</th><th>To</th><th>Mechanism</th><th>Summary</th><th>Crosses</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${link('component', r.from, r.fromName)}</td><td>${link('component', r.to, r.toName)}</td><td>${escapeHtml(r.mechanism || '')}</td><td>${link('relation', r.id, r.summary || '(details)')}</td><td>${escapeHtml(r.crosses || '')}</td></tr>`).join('')}
      </tbody></table>`
    } else if (s === 'boundaries') {
      body.innerHTML = `<div class="arch-cards">${rows.map(b => `
        <div class="arch-card"><div class="arch-card-title">${link('boundary', b.id, b.label || b.id)} <span class="arch-badge arch-badge-kind">${escapeHtml(b.kind || '')}</span> <span class="arch-nav-count">${b.members} members</span></div>
        <div class="arch-card-body">${escapeHtml(b.claim || '')}</div></div>`).join('')}</div>`
    } else if (s === 'facts') {
      const groups = new Map()
      for (const f of rows) { const k = f.kind || 'fact'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f) }
      body.innerHTML = [...groups.entries()].map(([kind, list]) => `
        <h4 class="arch-group">${escapeHtml(kind)} <span class="arch-nav-count">${list.length}</span></h4>
        <ul class="arch-facts">${list.map(f => `<li>${link('fact', f.id, f.claim || f.id)}${f.hasRule ? ' <span class="arch-badge arch-badge-kind">rule</span>' : ''}${f.because ? `<div class="arch-muted">${escapeHtml(f.because)}</div>` : ''}</li>`).join('')}</ul>`).join('')
    } else if (s === 'glossary') {
      body.innerHTML = `<dl class="arch-terms arch-terms-wide">${rows.map(g => `
        <dt>${link('term', g.term, g.term)}${(g.also || []).length ? ` <span class="arch-muted">(${g.also.map(escapeHtml).join(', ')})</span>` : ''}</dt>
        <dd>${escapeHtml(g.definition || '')}${(g.questions || []).length ? `<div class="arch-usedin">Used in: ${g.questions.map(q => `<a href="#" class="arch-link" data-question="${escapeHtml(q.id)}">${escapeHtml(q.title || q.id)}</a>`).join(', ')}</div>` : '<div class="arch-usedin arch-muted">Not used by any question</div>'}</dd>`).join('')}</dl>`
    }
  }

  _onClick(e) {
    const link = e.target.closest('a.arch-link')
    if (!link) return
    e.preventDefault()
    if (link.dataset.kind) this.handlers.onSelectRecord?.(link.dataset.kind, link.dataset.id)
    else if (link.dataset.question) this.handlers.onSelectQuestion?.(link.dataset.question)
  }
}
