/**
 * ReadingPane - Right pane: the prose behind whatever is selected.
 * Renders a question (answer, context, long read, components, facts, omissions,
 * terms) or a single model record (component, relation, boundary, fact, term).
 */

import { escapeHtml, renderMarkdownInto, statusBadge } from './dom.js'

export class ReadingPane {
  /**
   * @param {HTMLElement} container
   * @param {Object} handlers
   * @param {Function} handlers.onSelectRecord - (kind, id) => void
   * @param {Function} handlers.onSelectQuestion - (id) => void
   * @param {Function} handlers.onOpenEvidence - (path) => void
   */
  constructor(container, handlers) {
    this.container = container
    this.handlers = handlers
    this.container.classList.add('arch-reading')
    this.container.addEventListener('click', (e) => this._onClick(e))
    this.showEmpty()
  }

  showEmpty(message = 'Select a question or a model item to read about it.') {
    this.container.innerHTML = `<div class="arch-reading-empty">${escapeHtml(message)}</div>`
  }

  /**
   * @param {Object} q - Hydrated question from `getQuestion`
   * @param {Object} [options]
   * @param {string} [options.reply] - A model's reply to show above the analysis sections
   */
  showQuestion(q, { reply } = {}) {
    const involves = q.involves || []
    const highlight = new Set(q.highlight || [])
    this.container.innerHTML = `
      <article class="arch-read arch-read-question">
        ${reply ? `<section class="arch-read-reply"><h4>Reply</h4><div class="arch-md" data-md="reply"></div></section>` : ''}
        <h3 class="arch-read-title">${escapeHtml(q.title || q.id)}</h3>
        <p class="arch-read-ask">${escapeHtml(q.ask || '')}</p>
        ${q.answer ? `<section><h4>Answer</h4><div class="arch-md" data-md="answer"></div></section>` : ''}
        ${q.context ? `<section><h4>Context</h4><div class="arch-md" data-md="context"></div></section>` : ''}
        ${q.narrative ? `<section><h4>The long read</h4><div class="arch-md" data-md="narrative"></div></section>` : ''}
        <section>
          <h4>Components <span class="arch-nav-count">${involves.length}</span></h4>
          <table class="arch-table arch-table-compact">
            <tbody>
              ${involves.map(c => `
                <tr class="${highlight.has(c.id) ? 'arch-highlight' : ''}">
                  <td><a href="#" class="arch-link" data-kind="component" data-id="${escapeHtml(c.id)}">${escapeHtml(c.name)}</a> ${statusBadge(c.status)}</td>
                  <td>${escapeHtml(c.responsibility || '')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </section>
        ${(q.facts || []).length ? `
        <section>
          <h4>Facts</h4>
          <ul class="arch-facts">
            ${q.facts.map(f => `
              <li><span class="arch-badge arch-badge-kind">${escapeHtml(f.kind || 'fact')}</span>
                <a href="#" class="arch-link" data-kind="fact" data-id="${escapeHtml(f.id)}">${escapeHtml(f.claim || f.id)}</a>
                ${f.because ? `<div class="arch-muted">${escapeHtml(f.because)}</div>` : ''}</li>`).join('')}
          </ul>
        </section>` : ''}
        ${q.omits ? `<section><h4>Deliberately not shown</h4><p>${escapeHtml(q.omits)}</p></section>` : ''}
        ${(q.terms || []).length ? `
        <section>
          <h4>Terms used here</h4>
          <dl class="arch-terms">
            ${q.terms.map(t => `<dt><a href="#" class="arch-link" data-kind="term" data-id="${escapeHtml(t.term)}">${escapeHtml(t.term)}</a></dt><dd>${escapeHtml(t.definition || '')}</dd>`).join('')}
          </dl>
        </section>` : ''}
      </article>`
    if (reply) renderMarkdownInto(this.container.querySelector('[data-md="reply"]'), reply)
    for (const key of ['answer', 'context', 'narrative']) {
      const target = this.container.querySelector(`[data-md="${key}"]`)
      if (target) renderMarkdownInto(target, q[key])
    }
    this.container.scrollTop = 0
  }

  /**
   * @param {Object} rec - Hydrated record from `getRecord` (has `kind`)
   */
  showRecord(rec) {
    const renderers = {
      component: () => this._component(rec),
      relation: () => this._relation(rec),
      boundary: () => this._boundary(rec),
      fact: () => this._fact(rec),
      term: () => this._term(rec)
    }
    const html = renderers[rec.kind]?.() || `<pre>${escapeHtml(JSON.stringify(rec, null, 2))}</pre>`
    this.container.innerHTML = `<article class="arch-read arch-read-${rec.kind}">${html}</article>`
    this.container.scrollTop = 0
  }

  _evidence(list) {
    if (!list || !list.length) return ''
    return `<section><h4>Evidence</h4><ul class="arch-evidence">${list.map(e => `
      <li><a href="#" class="arch-link" data-evidence="${escapeHtml(e.path)}">${escapeHtml(e.path)}${e.line ? `:${e.line}` : ''}</a>${e.label ? ` <span class="arch-muted">— ${escapeHtml(e.label)}</span>` : ''}</li>`).join('')}</ul></section>`
  }

  _questions(list) {
    if (!list || !list.length) return ''
    return `<section><h4>Appears in</h4><ul class="arch-qlist">${list.map(q => `
      <li><a href="#" class="arch-link" data-question="${escapeHtml(q.id)}">${escapeHtml(q.title || q.id)}</a></li>`).join('')}</ul></section>`
  }

  _component(c) {
    const rels = c.relations || []
    return `
      <div class="arch-read-kind">Component</div>
      <h3 class="arch-read-title">${escapeHtml(c.name)} ${statusBadge(c.status)}</h3>
      <p class="arch-muted">${escapeHtml(c.itemKind || '')}${c.detail ? ` · ${escapeHtml(c.detail)}` : ''}${c.boundary ? ` · in <a href="#" class="arch-link" data-kind="boundary" data-id="${escapeHtml(c.boundary.id)}">${escapeHtml(c.boundary.label)}</a>` : ''}</p>
      <section><h4>Responsibility</h4><p>${escapeHtml(c.responsibility || '')}</p></section>
      ${this._evidence(c.evidence)}
      ${(c.doc_refs || []).length ? `<section><h4>Documents</h4><ul>${c.doc_refs.map(d => `<li><a href="#" class="arch-link" data-evidence="${escapeHtml(d.path)}">${escapeHtml(d.path)}</a>${d.section ? ` § ${escapeHtml(d.section)}` : ''}${d.quote ? `<blockquote>${escapeHtml(d.quote)}</blockquote>` : ''}</li>`).join('')}</ul></section>` : ''}
      ${rels.length ? `<section><h4>Relations <span class="arch-nav-count">${rels.length}</span></h4>
        <ul class="arch-rels">${rels.map(r => `
          <li><span class="arch-dir">${r.direction === 'out' ? '→' : '←'}</span>
            <a href="#" class="arch-link" data-kind="component" data-id="${escapeHtml(r.other.id)}">${escapeHtml(r.other.name)}</a>
            <span class="arch-muted">${escapeHtml(r.summary || r.mechanism || '')}</span>
            ${r.what_crosses ? `<div class="arch-crosses">${escapeHtml(r.what_crosses)}</div>` : ''}
            ${r.id ? `<a href="#" class="arch-link arch-muted" data-kind="relation" data-id="${escapeHtml(r.id)}">details</a>` : ''}</li>`).join('')}</ul></section>` : ''}
      ${this._questions(c.questions)}`
  }

  _relation(r) {
    return `
      <div class="arch-read-kind">Relation</div>
      <h3 class="arch-read-title">
        <a href="#" class="arch-link" data-kind="component" data-id="${escapeHtml(r.from)}">${escapeHtml(r.fromName)}</a>
        → <a href="#" class="arch-link" data-kind="component" data-id="${escapeHtml(r.to)}">${escapeHtml(r.toName)}</a></h3>
      <p class="arch-muted">${escapeHtml(r.mechanism || '')}${r.crosses ? ` · crosses <b>${escapeHtml(r.crosses)}</b>` : ''}</p>
      ${r.summary ? `<section><h4>Summary</h4><p>${escapeHtml(r.summary)}</p></section>` : ''}
      ${r.what_crosses ? `<section><h4>What crosses</h4><p>${escapeHtml(r.what_crosses)}</p></section>` : ''}
      ${this._evidence(r.evidence)}
      ${this._questions(r.questions)}`
  }

  _boundary(b) {
    return `
      <div class="arch-read-kind">Boundary · ${escapeHtml(b.itemKind || '')}</div>
      <h3 class="arch-read-title">${escapeHtml(b.label || b.id)}</h3>
      <section><h4>Claim</h4><p>${escapeHtml(b.claim || '')}</p></section>
      ${this._evidence(b.evidence)}
      <section><h4>Members <span class="arch-nav-count">${(b.members || []).length}</span></h4>
        <ul class="arch-inline-list">${(b.members || []).map(m => `<li><a href="#" class="arch-link" data-kind="component" data-id="${escapeHtml(m.id)}">${escapeHtml(m.name)}</a></li>`).join('')}</ul></section>
      ${(b.crossing || []).length ? `<section><h4>Relations crossing it <span class="arch-nav-count">${b.crossing.length}</span></h4>
        <ul class="arch-rels">${b.crossing.map(r => `<li><a href="#" class="arch-link" data-kind="relation" data-id="${escapeHtml(r.id)}">${escapeHtml(r.from)} → ${escapeHtml(r.to)}</a> <span class="arch-muted">${escapeHtml(r.summary || '')}</span>${r.what_crosses ? `<div class="arch-crosses">${escapeHtml(r.what_crosses)}</div>` : ''}</li>`).join('')}</ul></section>` : ''}`
  }

  _fact(f) {
    return `
      <div class="arch-read-kind">Fact · ${escapeHtml(f.itemKind || '')}</div>
      <h3 class="arch-read-title">${escapeHtml(f.claim || f.id)}</h3>
      ${f.because ? `<section><h4>Because</h4><p>${escapeHtml(f.because)}</p></section>` : ''}
      ${f.rule ? `<section><h4>Rule</h4><pre class="arch-pre">${escapeHtml(JSON.stringify(f.rule, null, 2))}</pre></section>` : ''}
      ${this._evidence(f.evidence)}
      ${this._questions(f.questions)}`
  }

  _term(t) {
    return `
      <div class="arch-read-kind">Term</div>
      <h3 class="arch-read-title">${escapeHtml(t.term)}</h3>
      ${(t.also || []).length ? `<p class="arch-muted">also: ${t.also.map(a => escapeHtml(a)).join(', ')}</p>` : ''}
      <section><p>${escapeHtml(t.definition || '')}</p></section>
      ${this._questions(t.questions)}`
  }

  _onClick(e) {
    const link = e.target.closest('a.arch-link')
    if (!link) return
    e.preventDefault()
    if (link.dataset.kind) this.handlers.onSelectRecord?.(link.dataset.kind, link.dataset.id)
    else if (link.dataset.question) this.handlers.onSelectQuestion?.(link.dataset.question)
    else if (link.dataset.evidence) this.handlers.onOpenEvidence?.(link.dataset.evidence)
  }
}
