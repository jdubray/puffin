/**
 * AskPanel - The Answer view: a question's slice (stage 1), an optional prose
 * answer (stage 2), and the hand-off to Claude Code for a diagram (stage 3).
 */

import { escapeHtml, invoke, toast, renderMarkdownInto, statusBadge, submitPrompt, isSessionRunning } from './dom.js'

export class AskPanel {
  /**
   * @param {HTMLElement} container
   * @param {Object} handlers
   * @param {Function} handlers.onSelectRecord - (kind, id) => void
   * @param {Function} handlers.onSelectQuestion - (id) => void
   * @param {Function} handlers.onExtendStarted - (question) => void
   * @param {Function} handlers.onClose - () => void
   */
  constructor(container, handlers) {
    this.container = container
    this.handlers = handlers
    this.slice = null
    this.answer = null
    this.history = []
    this.container.classList.add('arch-ask', 'hidden')
    this.container.addEventListener('click', (e) => this._onClick(e))
  }

  setHistory(history) {
    this.history = history || []
  }

  show() { this.container.classList.remove('hidden') }
  hide() { this.container.classList.add('hidden') }

  /**
   * Stage 1: run the slice and render it.
   * @param {string} question
   */
  async ask(question) {
    const q = String(question || '').trim()
    if (!q) return
    this.show()
    this.answer = null
    this.container.innerHTML = `<div class="arch-ask-loading">Asking the analysis…</div>`
    try {
      this.slice = await invoke('ask', { question: q })
    } catch (error) {
      this.container.innerHTML = `<div class="arch-ask-error">${escapeHtml(error.message)}</div><button class="btn small outline" data-action="close">Close</button>`
      return
    }
    try { this.history = await invoke('getAskHistory') } catch { /* keep */ }
    this.render()
  }

  render() {
    const s = this.slice
    if (!s) return
    const pct = Math.round((s.coverage || 0) * 100)
    const level = s.empty ? 'none' : s.coverage >= s.coverageFloor ? 'ok' : 'low'
    const link = (kind, id, text) => `<a href="#" class="arch-link" data-kind="${kind}" data-id="${escapeHtml(id)}">${escapeHtml(text)}</a>`
    this.container.innerHTML = `
      <div class="arch-ask-header">
        <h3>${escapeHtml(s.question)}</h3>
        <button class="btn small outline" data-action="close" title="Back to the diagram (Esc)">✕</button>
      </div>
      <div class="arch-coverage arch-coverage-${level}">
        <div class="arch-coverage-bar"><div class="arch-coverage-fill" style="width:${pct}%"></div></div>
        <div class="arch-coverage-text">
          ${s.empty ? 'The analysis does not cover this question.' : `Coverage ${pct}%`}
          ${s.unmatched.length ? ` · never mentions: ${s.unmatched.map(w => `<b>${escapeHtml(w)}</b>`).join(', ')}` : ''}
        </div>
      </div>
      <div class="arch-ask-actions">
        ${s.canAnswer ? `<button class="btn small primary" data-action="answer" data-help="One model call, no tools: an answer written only from the slice below.">Answer in prose</button>` : ''}
        <button class="btn small outline" data-action="extend" data-help="Runs /archlens in Claude Code for this project: adds the question to the analysis and renders a diagram.">${s.empty || level === 'low' ? 'Extend the analysis' : 'Answer with a diagram'}</button>
      </div>
      <div class="arch-answer hidden"></div>
      ${s.alreadyAnswered.length ? `
      <section class="arch-ask-section arch-ask-already">
        <h4>Already answered?</h4>
        ${s.alreadyAnswered.map(q => `
          <div class="arch-card">
            <div class="arch-card-title"><a href="#" class="arch-link" data-question="${escapeHtml(q.id)}">${escapeHtml(q.title || q.id)}</a> <span class="arch-badge arch-badge-kind">${q.shape}</span></div>
            <div class="arch-card-body">${escapeHtml(q.answer || '')}</div>
            <a href="#" class="arch-link arch-muted" data-question="${escapeHtml(q.id)}">Open diagram →</a>
          </div>`).join('')}
      </section>` : ''}
      ${s.components.length ? `
      <section class="arch-ask-section">
        <h4>Components <span class="arch-nav-count">${s.components.length}${s.capped.components ? '+' : ''}</span></h4>
        <table class="arch-table arch-table-compact"><tbody>
          ${s.components.map(c => `<tr><td>${link('component', c.id, c.name)} ${statusBadge(c.status)}<div class="arch-muted">${c.matched.map(escapeHtml).join(', ')}</div></td><td>${escapeHtml(c.responsibility || '')}${(c.evidence || []).length ? `<div class="arch-muted">${c.evidence.slice(0, 3).map(e => escapeHtml(e.path)).join(', ')}</div>` : ''}</td></tr>`).join('')}
        </tbody></table>
      </section>` : ''}
      ${s.relations.length ? `
      <section class="arch-ask-section">
        <h4>Relations <span class="arch-nav-count">${s.relations.length}${s.capped.relations ? '+' : ''}</span></h4>
        <ul class="arch-rels">${s.relations.map(r => `<li>${link('component', r.from, r.fromName)} → ${link('component', r.to, r.toName)} <span class="arch-muted">${escapeHtml(r.summary || '')}</span>${r.what_crosses ? `<div class="arch-crosses">${escapeHtml(r.what_crosses)}</div>` : ''}</li>`).join('')}</ul>
      </section>` : ''}
      ${s.facts.length ? `
      <section class="arch-ask-section">
        <h4>Facts</h4>
        <ul class="arch-facts">${s.facts.map(f => `<li><span class="arch-badge arch-badge-kind">${escapeHtml(f.kind || '')}</span> ${link('fact', f.id, f.claim || f.id)}${f.because ? `<div class="arch-muted">${escapeHtml(f.because)}</div>` : ''}</li>`).join('')}</ul>
      </section>` : ''}
      ${s.boundaries.filter(b => b.claim).length ? `
      <section class="arch-ask-section">
        <h4>Boundary claims</h4>
        <ul class="arch-facts">${s.boundaries.filter(b => b.claim).map(b => `<li>${link('boundary', b.id, b.label || b.id)}<div class="arch-muted">${escapeHtml(b.claim)}</div></li>`).join('')}</ul>
      </section>` : ''}
      ${s.glossary.length ? `
      <section class="arch-ask-section">
        <h4>Terms</h4>
        <dl class="arch-terms">${s.glossary.map(t => `<dt>${link('term', t.term, t.term)}</dt><dd>${escapeHtml(t.definition || '')}</dd>`).join('')}</dl>
      </section>` : ''}
      ${this.history.length ? `
      <section class="arch-ask-section arch-ask-history">
        <h4>Recent questions</h4>
        <ul>${this.history.slice(0, 8).map(h => `<li><a href="#" class="arch-link" data-ask="${escapeHtml(h.question)}">${escapeHtml(h.question)}</a> <span class="arch-muted">${h.stage}${typeof h.coverage === 'number' ? ` · ${Math.round(h.coverage * 100)}%` : ''}</span></li>`).join('')}</ul>
      </section>` : ''}`
    this.container.scrollTop = 0
  }

  /** Stage 2 */
  async runAnswer() {
    const box = this.container.querySelector('.arch-answer')
    const btn = this.container.querySelector('[data-action="answer"]')
    if (!box || !this.slice) return
    box.classList.remove('hidden')
    box.innerHTML = `<div class="arch-ask-loading">Writing an answer from the slice…</div>`
    if (btn) btn.disabled = true
    try {
      const result = await invoke('answer', { question: this.slice.question, slice: this.slice })
      if (!result.success) throw new Error(result.error || 'No answer')
      this.answer = result
      const unknown = result.citations?.unknown || []
      box.innerHTML = `
        <div class="arch-answer-head"><h4>Answer <span class="arch-muted">via ${escapeHtml(result.provider)}</span></h4>
          <div>
            <button class="btn small outline" data-action="copy">Copy</button>
            <button class="btn small outline" data-action="note" data-help="Append this answer to docs/architecture/questions.md">Save as note</button>
            <button class="btn small outline" data-action="extend">Turn into a diagram</button>
          </div></div>
        <div class="arch-md arch-answer-body"></div>
        ${unknown.length ? `<div class="arch-muted">Cited but not in the slice: ${unknown.map(escapeHtml).join(', ')}</div>` : ''}`
      renderMarkdownInto(box.querySelector('.arch-answer-body'), result.response)
    } catch (error) {
      box.innerHTML = `<div class="arch-ask-error">${escapeHtml(error.message)}</div>`
    } finally {
      if (btn) btn.disabled = false
    }
  }

  /** Stage 3 */
  async runExtend() {
    if (!this.slice) return
    if (await isSessionRunning()) { toast('A Claude session is already running. Wait for it to finish.', 'warning'); return }
    const prompt = `/archlens ${this.slice.question}`
    const ok = await submitPrompt(prompt)
    if (!ok) { toast('Could not submit to the Prompt tab. Copy the question and run /archlens there.', 'error'); return }
    toast('Sent to Claude Code — the new diagram will appear when the render finishes.', 'info')
    try { await invoke('getAskHistory') } catch { /* ignore */ }
    this.handlers.onExtendStarted?.(this.slice.question)
  }

  async _onClick(e) {
    const btn = e.target.closest('button[data-action]')
    if (btn) {
      const action = btn.dataset.action
      if (action === 'close') this.handlers.onClose?.()
      else if (action === 'answer') await this.runAnswer()
      else if (action === 'extend') await this.runExtend()
      else if (action === 'copy') navigator.clipboard?.writeText?.(this.answer?.response || '').then(() => toast('Copied', 'success'))
      else if (action === 'note') {
        try {
          const r = await invoke('saveNote', { question: this.slice.question, answer: this.answer?.response || '' })
          toast(`Saved to ${r.path}`, 'success')
        } catch (error) { toast(error.message, 'error') }
      }
      return
    }
    const link = e.target.closest('a.arch-link')
    if (!link) return
    e.preventDefault()
    if (link.dataset.kind) this.handlers.onSelectRecord?.(link.dataset.kind, link.dataset.id)
    else if (link.dataset.question) this.handlers.onSelectQuestion?.(link.dataset.question)
    else if (link.dataset.ask) this.ask(link.dataset.ask)
  }
}
