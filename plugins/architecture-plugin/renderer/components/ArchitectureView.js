/**
 * ArchitectureView - The Architecture tab.
 *
 * Owns the four top-level states (no-archlens, no-analysis, no-diagrams, ready),
 * the three-pane layout, IPC calls, and the main-process event subscription.
 */

import { escapeHtml, invoke, toast, submitPrompt, isSessionRunning, openInEditor } from './dom.js'
import { QuestionNavigator } from './QuestionNavigator.js'
import { DiagramFrame } from './DiagramFrame.js'
import { ReadingPane } from './ReadingPane.js'
import { ModelBrowser } from './ModelBrowser.js'
import { AskPanel } from './AskPanel.js'
import { StatusBar } from './StatusBar.js'

const PLUGIN = 'architecture-plugin'
const LAYOUT_KEY = 'architecture-plugin:layout'

export class ArchitectureView {
  /**
   * @param {HTMLElement} element - Wrapper provided by the plugin view container
   * @param {Object} options - `{ viewId, view, pluginName, context }`
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.status = null
    this.data = null
    this.selected = null // { type: 'question'|'section'|'record', id, kind? }
    this.pendingExtend = null
    this._unsubscribe = []
    this._layout = this._loadLayout()
  }

  async init() {
    this.container.classList.add('arch-root')
    this._unsubscribe.push(window.puffin.plugins.onEvent?.(PLUGIN, (event, data) => this._onPluginEvent(event, data)) || (() => {}))
    if (window.puffin?.claude?.onComplete) {
      this._unsubscribe.push(window.puffin.claude.onComplete(() => this._onSessionComplete()))
    }
    if (window.puffin?.claude?.onError) {
      this._unsubscribe.push(window.puffin.claude.onError(() => this._onSessionComplete()))
    }
    this._onKeyDown = (e) => this._handleKey(e)
    // Delegated once: empty-state and banner buttons survive re-renders
    this.container.addEventListener('click', (e) => {
      if (e.target.closest('.arch-empty, .arch-banner')) this._onEmptyAction(e)
    })
    await this.refresh()
  }

  async onActivate() {
    document.addEventListener('keydown', this._onKeyDown)
    if (!this.status) await this.refresh()
  }

  onDeactivate() {
    document.removeEventListener('keydown', this._onKeyDown)
  }

  onDestroy() { this.destroy() }

  destroy() {
    document.removeEventListener('keydown', this._onKeyDown)
    for (const off of this._unsubscribe) { try { off() } catch { /* ignore */ } }
    this.diagram?.destroy()
    this.navigator?.destroy()
  }

  // ============ State ============

  /**
   * Re-read status and rebuild the view for it.
   * @param {Object} [opts]
   * @param {boolean} [opts.rediscover]
   */
  async refresh({ rediscover = false } = {}) {
    try {
      this.status = await invoke('status', { rediscover })
    } catch (error) {
      this._renderError(error.message)
      return
    }
    if (this.status.state === 'error') { this._renderError(this.status.error); return }
    if (!this.status.hasAnalysis) {
      this._renderNoAnalysis()
      return
    }
    await this._renderReady()
  }

  // ============ Empty states ============

  _renderError(message) {
    this.container.innerHTML = `<div class="arch-empty"><h3>Architecture</h3><p class="arch-ask-error">${escapeHtml(message)}</p><button class="btn small outline" data-action="refresh">Retry</button></div>`
    this.container.querySelector('[data-action="refresh"]').addEventListener('click', () => this.refresh({ rediscover: true }))
  }

  _archlensBanner() {
    const a = this.status.archlens
    if (a && !a.tooOld) return ''
    return `
      <div class="arch-banner arch-banner-warn">
        <b>archlens ${a ? `${escapeHtml(a.version)} is too old` : 'is not installed'}.</b>
        The analysis can still be browsed; asking, rendering and checking need archlens ${a ? '0.5+' : ''}.
        <div class="arch-muted">Install in Claude Code: <code>/plugin marketplace add cognitive-fab/arch-lens</code> then <code>/plugin install archlens@arch-lens</code>, and <code>npx skills add tt-a1i/archify -g</code> for the renderer. Or point Puffin at a checkout below.</div>
        <div class="arch-inline-form">
          <input type="text" class="arch-input" data-field="archlensPath" placeholder="…/archlens/skills/archlens/bin/archlens.mjs" value="${escapeHtml(this.status.settings?.archlensPath || '')}">
          <button class="btn small outline" data-action="recheck">Re-check</button>
        </div>
      </div>`
  }

  _renderNoAnalysis() {
    const candidates = this.status.candidates || []
    this.container.innerHTML = `
      <div class="arch-empty">
        <h3>No architecture analysis yet</h3>
        <p>An arch-lens analysis (<code>&lt;name&gt;.analysis.json</code>) is the source of every diagram and answer on this tab. This project does not have one.</p>
        ${this._archlensBanner()}
        <div class="arch-empty-actions">
          <button class="btn primary" data-action="map" data-help="Runs Claude Code with the archlens skill to read this project and write its first analysis and diagrams.">Map this architecture</button>
          <button class="btn outline" data-action="seed" data-help="Drafts an analysis from package.json or docker-compose.yml with TODOs to fill in.">Seed from package.json</button>
          <button class="btn outline" data-action="seed-compose">Seed from docker-compose.yml</button>
          ${candidates.length ? `<select class="arch-select" data-field="candidate">${candidates.map(c => `<option>${escapeHtml(c)}</option>`).join('')}</select><button class="btn outline" data-action="choose">Use this analysis</button>` : ''}
        </div>
        <details class="arch-map-options">
          <summary>Options for mapping</summary>
          <label>Focus <input type="text" class="arch-input" data-field="focus" placeholder="e.g. start with the request pipeline"></label>
          <label>Sources only <input type="text" class="arch-input" data-field="sources" placeholder="e.g. docs/DESIGN.md (analyse the document, not the code)"></label>
        </details>
      </div>`
  }

  async _onEmptyAction(e) {
    const btn = e.target.closest('button[data-action]')
    if (!btn) return
    const action = btn.dataset.action
    const field = (name) => this.container.querySelector(`[data-field="${name}"]`)?.value?.trim() || ''
    try {
      if (action === 'map') await this.runMap({ focus: field('focus'), sources: field('sources') })
      else if (action === 'seed' || action === 'seed-compose') {
        btn.disabled = true
        const r = await invoke('seed', { source: action === 'seed' ? 'package.json' : 'docker-compose.yml' })
        toast(`Seeded ${r.analysisPath}. Every TODO in it needs writing before it is an analysis.`, 'success')
        await this.refresh({ rediscover: true })
      } else if (action === 'choose') {
        await invoke('load', { analysisPath: field('candidate') })
        await this.refresh()
      } else if (action === 'recheck') {
        await invoke('setSettings', { archlensPath: field('archlensPath') })
        const d = await invoke('doctor', {})
        toast(d.ok ? `archlens ${d.version} found (${d.source})` : d.problems.join('; '), d.ok ? 'success' : 'error')
        await this.refresh({ rediscover: true })
      }
    } catch (error) {
      toast(error.message, 'error')
      btn.disabled = false
    }
  }

  // ============ Ready ============

  async _renderReady() {
    try {
      this.data = await invoke('load', {})
    } catch (error) {
      this._renderError(error.message)
      return
    }
    const sys = this.data.system || {}
    const rev = sys.repository?.revision ? sys.repository.revision.slice(0, 7) : null
    this.container.innerHTML = `
      ${this._archlensBanner()}
      <div class="arch-header">
        <div class="arch-header-title">
          <h3 title="${escapeHtml(sys.purpose || '')}">${escapeHtml(sys.name || 'Architecture')}</h3>
          <span class="arch-muted">${rev ? `analysed at ${escapeHtml(rev)}` : escapeHtml(this.data.analysisPath)}</span>
          <span class="arch-status-slot"></span>
        </div>
        <form class="arch-ask-form">
          <input type="text" class="arch-input arch-ask-input" placeholder="Ask a question about this architecture… ( / )" data-help="Answered first from the analysis (instant, no model). Then optionally in prose, or with a new diagram.">
          <button type="submit" class="btn small primary">Ask</button>
        </form>
        <div class="arch-header-actions">
          <button class="btn small outline" data-action="refresh-analysis" data-help="Runs Claude Code to bring the analysis up to date with the code, then re-renders.">Refresh analysis</button>
          <button class="btn small outline" data-action="render" data-help="Render every question's diagram with archlens (no browser check).">Render all</button>
          <button class="btn small outline" data-action="render-check" title="Render with archify's headless-browser check (slow)">▾</button>
          <button class="btn small outline" data-action="check" data-help="Re-check citations against the code and every ruled constraint.">Check</button>
          <button class="btn small outline" data-action="validate" data-help="Run archlens validate on the analysis.">Validate</button>
          <button class="btn small outline arch-toggle ${this._layout.railCollapsed ? '' : 'active'}" data-action="toggle-rail" title="Show or hide the question list">☰</button>
          <button class="btn small outline arch-toggle ${this._layout.readingCollapsed ? '' : 'active'}" data-action="toggle-reading" title="Show or hide the reading pane">📖</button>
          <button class="btn small outline" data-action="settings" title="Settings">⚙</button>
        </div>
      </div>
      <div class="arch-progress hidden"></div>
      <div class="arch-body">
        <div class="arch-rail ${this._layout.railCollapsed ? 'collapsed' : ''} ${this._layout.railPinned ? 'pinned' : ''}"><div class="arch-nav-host"></div></div>
        <div class="arch-center">
          <div class="arch-diagram-host"></div>
          <div class="arch-model-host"></div>
          <div class="arch-ask-host"></div>
        </div>
        <div class="arch-reading-host ${this._layout.readingCollapsed ? 'collapsed' : ''} ${this._layout.readingPinned ? 'pinned' : ''}"></div>
      </div>
      <div class="arch-settings hidden"></div>`

    this.navigator = new QuestionNavigator(this.container.querySelector('.arch-nav-host'), {
      onSelectQuestion: (id) => this.selectQuestion(id),
      onSelectSection: (key) => this.selectSection(key),
      onRenderQuestion: (id) => this.runRender({ questionId: id }),
      onOpenHtml: (id) => this.openHtml(id)
    })
    this.diagram = new DiagramFrame(this.container.querySelector('.arch-diagram-host'), {
      onReload: (id) => { this.diagram.invalidate(id); this.selectQuestion(id, { force: true }) },
      onOpenHtml: (id) => this.openHtml(id),
      onOpenJson: (id) => this.openSpec(id)
    })
    this.reading = new ReadingPane(this.container.querySelector('.arch-reading-host'), {
      onSelectRecord: (kind, id) => this.selectRecord(kind, id),
      onSelectQuestion: (id) => this.selectQuestion(id),
      onOpenEvidence: (p) => this.openEvidence(p)
    })
    this.model = new ModelBrowser(this.container.querySelector('.arch-model-host'), {
      onSelectRecord: (kind, id) => this.selectRecord(kind, id),
      onSelectQuestion: (id) => this.selectQuestion(id)
    })
    this.askPanel = new AskPanel(this.container.querySelector('.arch-ask-host'), {
      onSelectRecord: (kind, id) => this.selectRecord(kind, id),
      onSelectQuestion: (id) => this.selectQuestion(id),
      onExtendStarted: (question) => this._startExtend(question),
      onClose: () => this._closeAsk()
    })
    this.statusBar = new StatusBar(this.container.querySelector('.arch-status-slot'), {
      onOpenEvidence: (p) => this.openEvidence(p)
    })
    this.diagram.followTheme = this.status.settings?.followTheme !== false

    this.navigator.setData({ questions: this.data.questions, counts: this.data.counts })
    this.model.setModel(this.data.model)
    this.container.querySelector('.arch-header-actions').addEventListener('click', (e) => this._onHeaderAction(e))
    this.container.querySelector('.arch-ask-form').addEventListener('submit', (e) => {
      e.preventDefault()
      const input = this.container.querySelector('.arch-ask-input')
      this.ask(input.value)
    })
    if (this.status.lastCheck) this.statusBar.setResult(this.status.lastCheck)
    else if (this.status.settings?.checkOnOpen && this.status.archlens && !this.status.archlens.tooOld) this.runCheck({ quiet: true })

    const first = this.data.questions[0]
    const remembered = this._layout.selected
    if (remembered?.type === 'question' && this.data.questions.some(q => q.id === remembered.id)) this.selectQuestion(remembered.id)
    else if (remembered?.type === 'section') this.selectSection(remembered.id)
    else if (first) this.selectQuestion(first.id)
    else if (this.status.state === 'no-diagrams' || this.data.questions.length === 0) {
      this.reading.showEmpty('This analysis has no questions yet. Ask one to add the first diagram.')
    }
  }

  // ============ Selection ============

  _questionMeta(id) {
    return this.data?.questions.find(q => q.id === id) || null
  }

  async selectQuestion(id, { force = false } = {}) {
    this._closeAsk({ silent: true })
    this.model.hide()
    this.container.querySelector('.arch-diagram-host').classList.remove('hidden')
    this.selected = { type: 'question', id }
    this.navigator.select('question', id)
    this._saveLayout()
    const meta = this._questionMeta(id)
    if (meta) this.diagram.show(meta, { force })
    try {
      const q = await invoke('getQuestion', { id })
      if (this.selected?.id !== id) return
      const reply = this.pendingExtend?.reply && this.pendingExtend?.questionId === id ? this.pendingExtend.reply : null
      this.reading.showQuestion(q, { reply })
      if (meta && q.render) { meta.render = q.render }
    } catch (error) {
      this.reading.showEmpty(error.message)
    }
  }

  selectSection(key) {
    this._closeAsk({ silent: true })
    this.selected = { type: 'section', id: key }
    this.navigator.select('section', key)
    this._saveLayout()
    this.container.querySelector('.arch-diagram-host').classList.add('hidden')
    this.model.show(key)
    this.reading.showEmpty(`Select a ${key === 'glossary' ? 'term' : key.replace(/s$/, '')} to read about it.`)
  }

  async selectRecord(kind, id) {
    const sectionFor = { component: 'components', relation: 'relations', boundary: 'boundaries', fact: 'facts', term: 'glossary' }
    if (this.selected?.type !== 'section' && this.askPanel.container.classList.contains('hidden')) {
      // Coming from a question: switch the centre to the model section so the record is in context
      this.selectSection(sectionFor[kind] || 'components')
    }
    try {
      const rec = await invoke('getRecord', { kind, id })
      this.reading.showRecord(rec)
      this.model.highlight(kind, id)
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  // ============ Actions ============

  async ask(question) {
    const q = String(question || '').trim()
    if (!q) return
    if (!this.status.archlens || this.status.archlens.tooOld) { toast('Asking needs archlens 0.5+ (see the banner).', 'warning'); return }
    this.model.hide()
    this.container.querySelector('.arch-diagram-host').classList.add('hidden')
    this.reading.showEmpty('Pick a component, relation, fact or term from the answer to read about it.')
    await this.askPanel.ask(q)
  }

  _closeAsk({ silent = false } = {}) {
    if (this.askPanel?.container.classList.contains('hidden')) return
    this.askPanel.hide()
    if (silent) return
    if (this.selected?.type === 'question') this.selectQuestion(this.selected.id)
    else if (this.selected?.type === 'section') this.selectSection(this.selected.id)
    else this.container.querySelector('.arch-diagram-host').classList.remove('hidden')
  }

  async _onHeaderAction(e) {
    const btn = e.target.closest('button[data-action]')
    if (!btn) return
    const action = btn.dataset.action
    if (action === 'refresh-analysis') await this.runRefreshAnalysis()
    else if (action === 'render') await this.runRender({})
    else if (action === 'render-check') await this.runRender({ browserCheck: true })
    else if (action === 'check') await this.runCheck({})
    else if (action === 'validate') await this.runValidate()
    else if (action === 'settings') this.toggleSettings()
    else if (action === 'toggle-rail' || action === 'toggle-reading') this._togglePane(action === 'toggle-rail' ? 'rail' : 'reading', btn)
  }

  /**
   * Show/hide a side pane. Showing it also pins it, so narrow windows keep it visible.
   * @param {'rail'|'reading'} pane
   * @param {HTMLElement} btn
   */
  _togglePane(pane, btn) {
    const host = this.container.querySelector(pane === 'rail' ? '.arch-rail' : '.arch-reading-host')
    if (!host) return
    const visible = host.getBoundingClientRect().width > 0 && !host.classList.contains('collapsed')
    host.classList.toggle('collapsed', visible)
    host.classList.toggle('pinned', !visible)
    btn.classList.toggle('active', !visible)
    this._layout[`${pane}Collapsed`] = visible
    this._layout[`${pane}Pinned`] = !visible
    this._saveLayout()
  }

  _needArchlens() {
    if (!this.status.archlens || this.status.archlens.tooOld) { toast('This needs archlens 0.5+ (see the banner).', 'warning'); return false }
    return true
  }

  async runRender({ questionId, browserCheck } = {}) {
    if (!this._needArchlens()) return
    const progress = this.container.querySelector('.arch-progress')
    progress.classList.remove('hidden')
    progress.innerHTML = `<div class="arch-progress-title">Rendering${questionId ? ` ${escapeHtml(questionId)}` : ' all questions'}… <button class="btn small outline" data-action="cancel">Cancel</button></div><pre class="arch-progress-log"></pre>`
    progress.querySelector('[data-action="cancel"]').addEventListener('click', () => invoke('cancel', { label: 'render' }).catch(() => {}))
    this._setBusy(true)
    try {
      const r = await invoke('render', { questionId, browserCheck })
      const failed = Object.entries(r.questions || {}).filter(([, q]) => q.failed)
      const dropped = Object.values(r.questions || {}).reduce((n, q) => n + (q.dropped || []).length, 0)
      const summary = `${r.delivered || '0/0'} diagrams delivered${dropped ? `, ${dropped} dropped line${dropped === 1 ? '' : 's'}` : ''}${failed.length ? `, ${failed.length} failed` : ''}${r.timedOut ? ' (timed out)' : ''}`
      toast(summary, r.ok ? 'success' : 'warning')
      this.diagram.invalidate(questionId || null)
      await this._reloadData({ keepSelection: true, force: true })
    } catch (error) {
      toast(`Render failed: ${error.message}`, 'error')
    } finally {
      this._setBusy(false)
      progress.classList.add('hidden')
    }
  }

  async runCheck({ quiet = false } = {}) {
    if (!quiet && !this._needArchlens()) return
    this.statusBar.setChecking()
    try {
      const r = await invoke('check', {})
      this.statusBar.setResult(r)
      if (!quiet) {
        const s = this.statusBar.render && r ? null : null
        void s
        toast(`Check finished: ${this.container.querySelector('.arch-badge-status')?.textContent?.replace('● ', '') || 'done'}`, r.check?.ok ? 'success' : 'warning')
      }
    } catch (error) {
      this.statusBar.setResult(null)
      if (!quiet) toast(`Check failed: ${error.message}`, 'error')
    }
  }

  async runValidate() {
    if (!this._needArchlens()) return
    try {
      const r = await invoke('validate', {})
      const progress = this.container.querySelector('.arch-progress')
      progress.classList.remove('hidden')
      progress.innerHTML = `
        <div class="arch-progress-title">Validate: ${r.errors.length} error(s), ${r.warnings.length} warning(s) <button class="btn small outline" data-action="close">✕</button></div>
        ${r.errors.length ? `<ul class="arch-validate arch-validate-errors">${r.errors.map(x => `<li><b>${escapeHtml(x.where)}</b>: ${escapeHtml(x.message)}${x.fix ? `<div class="arch-muted">fix: ${escapeHtml(x.fix)}</div>` : ''}</li>`).join('')}</ul>` : ''}
        ${r.warnings.length ? `<ul class="arch-validate">${r.warnings.map(x => `<li><b>${escapeHtml(x.where)}</b>: ${escapeHtml(x.message)}${x.fix ? `<div class="arch-muted">fix: ${escapeHtml(x.fix)}</div>` : ''}</li>`).join('')}</ul>` : ''}
        ${!r.errors.length && !r.warnings.length ? '<div class="arch-muted">The analysis is clean.</div>' : ''}`
      progress.querySelector('[data-action="close"]').addEventListener('click', () => progress.classList.add('hidden'))
    } catch (error) {
      toast(`Validate failed: ${error.message}`, 'error')
    }
  }

  async runRefreshAnalysis() {
    if (await isSessionRunning()) { toast('A Claude session is already running.', 'warning'); return }
    let findings = ''
    const last = this.status.lastCheck || this.statusBar.last
    const code = last?.check?.code
    if (code) {
      const parts = []
      if (code.gone?.length) parts.push(`gone: ${code.gone.map(g => g.path).join(', ')}`)
      if (code.moved?.length) parts.push(`changed since pin: ${code.moved.map(m => m.path).join(', ')}`)
      if (code.built?.length) parts.push(`planned but now built: ${code.built.map(b => b.what).join(', ')}`)
      if (code.ahead) parts.push(`${code.ahead} commit(s) ahead of the pinned revision`)
      findings = parts.length ? `\`archlens check\` reports: ${parts.join('; ')}.` : '`archlens check` reports no drift; re-read the sources for anything the analysis misses.'
    }
    const prompt = [
      `Bring ${this.data.analysisPath} up to date with the code at HEAD using archlens.`,
      findings,
      `Re-read the changed evidence, update responsibilities, relations and what_crosses where they moved, change status for components that are now built, move system.repository.revision to HEAD, validate, and render into ${this.data.diagramsDir} with --repo-root . --no-check.`,
      'Do not remove questions; if one no longer holds, say so in its answer.'
    ].filter(Boolean).join('\n')
    const ok = await submitPrompt(prompt)
    if (!ok) { toast('Could not submit to the Prompt tab.', 'error'); return }
    toast('Refresh sent to Claude Code. The tab reloads when the analysis changes.', 'info')
    this._startExtend(null)
  }

  async runMap({ focus, sources } = {}) {
    if (await isSessionRunning()) { toast('A Claude session is already running.', 'warning'); return }
    const name = String(this.status?.projectName || 'system').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const prompt = [
      `Map this project's architecture with archlens.`,
      sources ? `Use ${sources} as the only source; mark components the code does not contain as planned and record the source in system.sources.` : 'Read the code.',
      `Write docs/architecture/${name || 'system'}.analysis.json with a glossary and, for every question, an answer, context and narrative; validate it; then render into docs/architecture with --repo-root . --no-check.`,
      focus ? `Start with: ${focus}.` : 'Start with the questions a newcomer would ask first.'
    ].join('\n')
    const ok = await submitPrompt(prompt)
    if (!ok) { toast('Could not submit to the Prompt tab.', 'error'); return }
    toast('Mapping started in Claude Code. This tab updates when the analysis appears.', 'info')
    this.pendingExtend = { question: null, startedAt: Date.now(), map: true }
  }

  _startExtend(question) {
    this.pendingExtend = { question, startedAt: Date.now(), questionIds: new Set((this.data?.questions || []).map(q => q.id)) }
    const progress = this.container.querySelector('.arch-progress')
    if (!progress) return
    progress.classList.remove('hidden')
    progress.innerHTML = `<div class="arch-progress-title">Claude Code is ${question ? 'answering with a diagram' : 'refreshing the analysis'}… <span class="arch-muted">watch the CLI Output tab for the stream</span></div>
      <ol class="arch-steps"><li class="active">reading sources</li><li>writing the analysis</li><li>rendering</li><li>done</li></ol>`
  }

  _setStep(n) {
    this.container.querySelectorAll('.arch-steps li').forEach((li, i) => li.classList.toggle('active', i <= n))
  }

  _onSessionComplete() {
    if (!this.pendingExtend) return
    const p = this.pendingExtend
    setTimeout(async () => {
      if (p.map) {
        this.pendingExtend = null
        await this.refresh({ rediscover: true })
        return
      }
      this._setStep(3)
      await this._reloadData({ keepSelection: true, force: true })
      const newIds = (this.data?.questions || []).map(q => q.id).filter(id => !p.questionIds?.has(id))
      const progress = this.container.querySelector('.arch-progress')
      if (newIds.length) {
        this.diagram.invalidate(null)
        await this.selectQuestion(newIds[newIds.length - 1], { force: true })
      } else if (p.question) {
        toast('The session finished but no new question was added to the analysis.', 'warning')
      }
      progress?.classList.add('hidden')
      this.pendingExtend = null
      if (this.status.archlens && !this.status.archlens.tooOld) this.runCheck({ quiet: true })
    }, 500)
  }

  async _onPluginEvent(event, data) {
    if (event === 'progress' && data?.op === 'render') {
      const log = this.container.querySelector('.arch-progress-log')
      if (log) { log.textContent += `${data.line}\n`; log.scrollTop = log.scrollHeight }
      return
    }
    if (event !== 'changed') return
    if (this.pendingExtend && !this.pendingExtend.map) {
      if (data?.kind === 'analysis') this._setStep(1)
      if (data?.kind === 'diagram' || data?.kind === 'render') this._setStep(2)
    }
    if (!this.data) { await this.refresh({ rediscover: true }); return }
    if (data?.kind === 'diagram' && data.questionId) this.diagram.invalidate(data.questionId)
    if (data?.kind === 'analysis') this.diagram.invalidate(null)
    await this._reloadData({ keepSelection: true, force: data?.kind !== 'diagram' })
  }

  async _reloadData({ keepSelection = true, force = false } = {}) {
    try {
      this.data = await invoke('load', {})
    } catch (error) {
      toast(error.message, 'error')
      return
    }
    this.navigator.setData({ questions: this.data.questions, counts: this.data.counts })
    this.model.setModel(this.data.model)
    if (keepSelection && this.selected?.type === 'question') {
      if (this.data.questions.some(q => q.id === this.selected.id)) await this.selectQuestion(this.selected.id, { force })
      else this.diagram.clear()
    }
  }

  // ============ Files ============

  async openEvidence(relPath) {
    try {
      const r = await invoke('openEvidence', { path: relPath })
      if (!r.exists) { toast(`Not found in the project: ${relPath}`, 'warning'); return }
      if (!(await openInEditor(r.absolutePath))) toast(`Editor tab not available for ${relPath}`, 'info')
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  async openHtml(id) {
    const meta = this._questionMeta(id)
    if (!meta?.render?.rendered) { toast('Not rendered yet.', 'warning'); return }
    const rel = `${this.data.diagramsDir}/${id}.${meta.shape}.html`
    try {
      await invoke('openExternal', { path: rel })
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  async openSpec(id) {
    const meta = this._questionMeta(id)
    if (!meta) return
    await this.openEvidence(`${this.data.diagramsDir}/${id}.${meta.shape}.json`)
  }

  // ============ Settings ============

  async toggleSettings() {
    const host = this.container.querySelector('.arch-settings')
    if (!host.classList.contains('hidden')) { host.classList.add('hidden'); return }
    let s
    try { s = await invoke('getSettings') } catch (error) { toast(error.message, 'error'); return }
    host.classList.remove('hidden')
    host.innerHTML = `
      <div class="arch-settings-panel">
        <div class="arch-settings-head"><b>Architecture settings</b> <button class="btn small outline" data-action="close">✕</button></div>
        <label>archlens path <input type="text" class="arch-input" data-field="archlensPath" value="${escapeHtml(s.archlensPath || '')}" placeholder="auto (${escapeHtml(this.status.archlens?.binPath || 'not found')})"></label>
        <label>Analysis file <input type="text" class="arch-input" data-field="analysisFile" value="${escapeHtml(s.analysisFile || '')}" placeholder="auto (${escapeHtml(this.data?.analysisPath || '')})"></label>
        <label>Diagrams directory <input type="text" class="arch-input" data-field="diagramsDir" value="${escapeHtml(s.diagramsDir || '')}"></label>
        <label>Coverage floor for prose answers <input type="number" min="0" max="1" step="0.05" class="arch-input arch-input-short" data-field="coverageFloor" value="${escapeHtml(String(s.coverageFloor))}"></label>
        <label><input type="checkbox" data-field="checkOnOpen" ${s.checkOnOpen ? 'checked' : ''}> Run check when the tab opens</label>
        <label><input type="checkbox" data-field="renderBrowserCheck" ${s.renderBrowserCheck ? 'checked' : ''}> Browser check on render (slow)</label>
        <label><input type="checkbox" data-field="followTheme" ${s.followTheme ? 'checked' : ''}> Diagram theme follows Puffin</label>
        <div class="arch-settings-actions"><button class="btn small primary" data-action="save">Save</button></div>
      </div>`
    host.querySelector('[data-action="close"]').addEventListener('click', () => host.classList.add('hidden'))
    host.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const get = (n) => host.querySelector(`[data-field="${n}"]`)
      const patch = {
        archlensPath: get('archlensPath').value.trim(),
        analysisFile: get('analysisFile').value.trim(),
        diagramsDir: get('diagramsDir').value.trim() || 'docs/architecture',
        coverageFloor: parseFloat(get('coverageFloor').value) || 0,
        checkOnOpen: get('checkOnOpen').checked,
        renderBrowserCheck: get('renderBrowserCheck').checked,
        followTheme: get('followTheme').checked
      }
      try {
        await invoke('setSettings', patch)
        host.classList.add('hidden')
        toast('Settings saved', 'success')
        await this.refresh({ rediscover: true })
      } catch (error) { toast(error.message, 'error') }
    })
  }

  // ============ Keyboard & layout ============

  _handleKey(e) {
    const tag = (e.target?.tagName || '').toLowerCase()
    const typing = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable
    if (e.key === '/' && !typing) {
      e.preventDefault()
      this.container.querySelector('.arch-ask-input')?.focus()
    } else if (e.key === 'Escape') {
      if (!this.askPanel?.container.classList.contains('hidden')) this._closeAsk()
      else this.container.querySelector('.arch-settings')?.classList.add('hidden')
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !typing && this.navigator) {
      const id = this.navigator.step(e.key === 'ArrowDown' ? 1 : -1)
      if (id) { e.preventDefault(); this.selectQuestion(id) }
    }
  }

  _setBusy(busy) {
    this.container.querySelectorAll('.arch-header-actions button').forEach(b => { b.disabled = busy })
  }

  _loadLayout() {
    try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') } catch { return {} }
  }

  _saveLayout() {
    this._layout.selected = this.selected
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(this._layout)) } catch { /* ignore */ }
  }
}

export default ArchitectureView
