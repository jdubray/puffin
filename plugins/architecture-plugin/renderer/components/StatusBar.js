/**
 * StatusBar - Freshness badge from `archlens check` + `enforce`, with a report popover.
 */

import { escapeHtml, el } from './dom.js'

/**
 * Summarise a check result into a badge.
 * @param {Object|null} last - `{ check, enforce, at }`
 * @returns {{ level: string, text: string }}
 */
export function summarizeCheck(last) {
  if (!last) return { level: 'unknown', text: 'not checked' }
  const code = last.check?.code
  const docs = last.check?.documents
  const enf = last.enforce?.result
  const violations = enf?.code?.violations?.length || enf?.model?.length || 0
  if (!code) return { level: 'unknown', text: last.check?.raw ? 'check failed' : 'not checked' }
  if (!code.pinAvailable && !code.pinned) return { level: 'unknown', text: 'not a git repo' }
  const gone = (code.gone || []).length + (docs?.gone || []).length
  if (gone > 0 || last.check?.ok === false) return { level: 'stale', text: `stale: ${gone} citation${gone === 1 ? '' : 's'} gone` }
  if (violations > 0) return { level: 'stale', text: `${violations} constraint violation${violations === 1 ? '' : 's'}` }
  const built = (code.built || []).length
  const moved = (code.moved || []).length
  if (built > 0) return { level: 'drift', text: `${built} planned component${built === 1 ? '' : 's'} now built` }
  if ((code.ahead || 0) > 0 || moved > 0) {
    const parts = []
    if (code.ahead > 0) parts.push(`${code.ahead} commit${code.ahead === 1 ? '' : 's'} ahead`)
    if (moved > 0) parts.push(`${moved} cited file${moved === 1 ? '' : 's'} changed`)
    return { level: 'drift', text: parts.join(', ') }
  }
  return { level: 'ok', text: 'in sync' }
}

export class StatusBar {
  /**
   * @param {HTMLElement} container
   * @param {Object} handlers
   * @param {Function} handlers.onOpenEvidence - (path) => void
   */
  constructor(container, handlers) {
    this.container = container
    this.handlers = handlers
    this.last = null
    this.container.classList.add('arch-status')
    this.container.addEventListener('click', (e) => this._onClick(e))
    this.render()
  }

  setResult(last) {
    this.last = last
    this.render()
  }

  setChecking() {
    this.container.innerHTML = `<span class="arch-badge-status arch-status-unknown">● checking…</span>`
  }

  render() {
    const s = summarizeCheck(this.last)
    this.container.innerHTML = `<button class="arch-badge-status arch-status-${s.level}" data-action="report" data-help="Whether the analysis still matches the code at HEAD. Click for the report.">● ${escapeHtml(s.text)}</button>`
  }

  _onClick(e) {
    if (e.target.closest('[data-action="report"]')) this._toggleReport()
    const link = e.target.closest('a.arch-link[data-evidence]')
    if (link) { e.preventDefault(); this.handlers.onOpenEvidence?.(link.dataset.evidence) }
  }

  _toggleReport() {
    if (this._popover) { this._popover.remove(); this._popover = null; return }
    if (!this.last) return
    const code = this.last.check?.code || {}
    const docs = this.last.check?.documents || {}
    const enf = this.last.enforce?.result || {}
    const list = (title, items, fmt) => items && items.length ? `<h5>${title} <span class="arch-nav-count">${items.length}</span></h5><ul>${items.map(fmt).join('')}</ul>` : ''
    const fileLink = (p) => `<a href="#" class="arch-link" data-evidence="${escapeHtml(p)}">${escapeHtml(p)}</a>`
    const pop = el('div', { class: 'arch-popover' }, `
      <div class="arch-popover-head"><b>Check report</b> <span class="arch-muted">${escapeHtml(new Date(this.last.at).toLocaleString())}</span></div>
      <div class="arch-muted">pinned ${escapeHtml((code.pinned || '').slice(0, 7) || '—')} · HEAD ${escapeHtml((code.head || '').slice(0, 7) || '—')} · ${code.fine ?? 0}/${code.total ?? 0} citations fine</div>
      ${list('Gone', code.gone, g => `<li>${fileLink(g.path)} <span class="arch-muted">${escapeHtml(g.what || '')}</span></li>`)}
      ${list('Changed since pin', code.moved, m => `<li>${fileLink(m.path)} <span class="arch-muted">${escapeHtml(m.what || '')}</span></li>`)}
      ${list('Planned but built', code.built, b => `<li>${fileLink(b.path)} <span class="arch-muted">${escapeHtml(b.what || '')}</span></li>`)}
      ${list('Document citations gone', docs.gone, d => `<li>${fileLink(d.path || d.file || '')}</li>`)}
      ${list('Constraint violations (analysis)', enf.model, v => `<li>${escapeHtml(v.rule || v.id || JSON.stringify(v))}</li>`)}
      ${list('Constraint violations (code)', enf.code?.violations, v => `<li>${escapeHtml(v.from)} → ${escapeHtml(v.to)} ${(v.sites || []).slice(0, 2).map(s => fileLink(`${s.file}`)).join(' ')}</li>`)}
      ${list('Undeclared edges in code', enf.code?.undeclared, v => `<li>${escapeHtml(v.from)} → ${escapeHtml(v.to)} <span class="arch-muted">${(v.sites || []).slice(0, 1).map(s => escapeHtml(`${s.file}:${s.line}`)).join('')}</span></li>`)}
      ${!code.pinned ? `<div class="arch-muted">No pinned revision; drift cannot be measured.</div>` : ''}`)
    this.container.appendChild(pop)
    this._popover = pop
    setTimeout(() => document.addEventListener('click', (ev) => {
      if (this._popover && !this._popover.contains(ev.target)) { this._popover.remove(); this._popover = null }
    }, { once: true }), 0)
  }
}
