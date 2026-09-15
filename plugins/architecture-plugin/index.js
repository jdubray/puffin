/**
 * Architecture Plugin - Entry Point
 *
 * The Architecture tab: a workbench around the `archlens` CLI. It finds the
 * project's `<name>.analysis.json`, shows its questions and diagrams, answers
 * new questions from the analysis, and reports drift. Model calls happen only
 * on explicit user actions (prose answer; extend/map/refresh via the Prompt tab).
 */

const crypto = require('crypto')
const fsp = require('fs').promises
const path = require('path')

const { AnalysisStore, resolveInside, DEFAULT_DIAGRAMS_DIR } = require('./lib/analysis-store')
const { ArchlensRunner } = require('./lib/archlens-runner')
const { AskService } = require('./lib/ask-service')
const { DiagramServer } = require('./lib/diagram-server')

const SETTINGS_KEY = 'settings'
const NOTES_FILE = 'questions.md'

const DEFAULT_SETTINGS = {
  archlensPath: '',
  analysisFile: '',
  diagramsDir: DEFAULT_DIAGRAMS_DIR,
  coverageFloor: 0.4,
  checkOnOpen: true,
  renderBrowserCheck: false,
  followTheme: true
}

/**
 * Lazily require document-edit-service so unit tests can inject their own.
 * @returns {Function}
 */
function defaultEditDocument(args) {
  const { editDocument } = require('../../src/main/document-edit-service')
  return editDocument(args)
}

const ArchitecturePlugin = {
  context: null,
  store: null,
  runner: null,
  askService: null,
  diagrams: null,
  settings: { ...DEFAULT_SETTINGS },
  projectKey: 'default',
  lastCheck: null,
  lastRender: null,
  _editDocument: defaultEditDocument,

  /**
   * Activate the plugin
   * @param {Object} context - Plugin context from PluginManager
   */
  async activate(context) {
    this.context = context
    const projectPath = context.projectPath
    if (!projectPath) {
      throw new Error('Architecture plugin requires projectPath in context')
    }
    this.projectKey = crypto.createHash('sha1').update(projectPath).digest('hex').slice(0, 12)
    this.settings = await this._loadSettings()

    this.store = new AnalysisStore({ projectPath, log: context.log })
    this.runner = new ArchlensRunner({ projectPath, log: context.log, configuredPath: this.settings.archlensPath || null })
    this.diagrams = new DiagramServer({ store: this.store, projectPath })
    this.askService = new AskService({
      store: this.store,
      runner: this.runner,
      storage: context.storage,
      editDocument: (args) => this._editDocument(args),
      getConfig: () => (typeof context.services?.getConfig === 'function' ? context.services.getConfig() : {}),
      getClaudeService: () => context.getService('claudeService'),
      log: context.log,
      projectKey: this.projectKey
    })

    const handlers = {
      status: this.handleStatus,
      doctor: this.handleDoctor,
      load: this.handleLoad,
      getQuestion: this.handleGetQuestion,
      getRecord: this.handleGetRecord,
      getDiagram: this.handleGetDiagram,
      ask: this.handleAsk,
      answer: this.handleAnswer,
      render: this.handleRender,
      check: this.handleCheck,
      validate: this.handleValidate,
      seed: this.handleSeed,
      openEvidence: this.handleOpenEvidence,
      openExternal: this.handleOpenExternal,
      getAskHistory: this.handleGetAskHistory,
      saveNote: this.handleSaveNote,
      cancel: this.handleCancel,
      getSettings: this.handleGetSettings,
      setSettings: this.handleSetSettings
    }
    for (const [name, fn] of Object.entries(handlers)) {
      context.registerIpcHandler(name, fn.bind(this))
    }
    context.registerAction('status', this.handleStatus.bind(this))
    context.registerAction('ask', this.handleAsk.bind(this))

    context.log.info('Architecture plugin activated')
  },

  /**
   * Deactivate the plugin
   */
  async deactivate() {
    this.store?.unwatch()
    this.runner?.cancel()
    this.store = null
    this.runner = null
    this.askService = null
    this.diagrams = null
    this.context?.log.info('Architecture plugin deactivated')
  },

  // ============ Settings ============

  async _loadSettings() {
    try {
      const all = (await this.context.storage.get(SETTINGS_KEY)) || {}
      return { ...DEFAULT_SETTINGS, ...(all[this.projectKey] || {}) }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  },

  async _saveSettings() {
    const all = (await this.context.storage.get(SETTINGS_KEY).catch(() => null)) || {}
    all[this.projectKey] = this.settings
    await this.context.storage.set(SETTINGS_KEY, all)
  },

  // ============ State ============

  /**
   * Make sure the analysis is discovered and loaded. Returns false when there is none.
   * @param {boolean} [force] - Re-discover
   * @returns {Promise<boolean>}
   */
  async _ensureLoaded(force = false) {
    if (!this.store.analysisPath || force) {
      await this.store.discover(this.settings.analysisFile || undefined)
      if (this.store.analysisPath && this.settings.diagramsDir && this.settings.diagramsDir !== DEFAULT_DIAGRAMS_DIR) {
        try { this.store.setDiagramsDir(this.settings.diagramsDir) } catch (error) { this.context.log.warn(error.message) }
      }
    }
    if (!this.store.analysisPath) return false
    if (!this.store.analysis || force) {
      await this.store.load()
      this._startWatching()
    }
    return true
  },

  _startWatching() {
    this.store.watch((ev) => {
      if (ev.kind === 'analysis') {
        this.store.load()
          .then(() => this.context.sendToRenderer?.('changed', { kind: 'analysis' }))
          .catch(err => this.context.log.warn(`Analysis reload failed: ${err.message}`))
      } else {
        const m = ev.file.match(/^(.*)\.(architecture|sequence)\.html$/)
        this.context.sendToRenderer?.('changed', { kind: 'diagram', questionId: m ? m[1] : null })
      }
    })
  },

  _rel(p) {
    return path.relative(this.context.projectPath, p).replace(/\\/g, '/')
  },

  // ============ Handlers ============

  /**
   * Overall tab state.
   * @returns {Promise<Object>}
   */
  async handleStatus({ rediscover = false } = {}) {
    const resolved = this.runner.resolve()
    let state = 'ready'
    let hasAnalysis = false
    try {
      hasAnalysis = await this._ensureLoaded(rediscover)
    } catch (error) {
      return { state: 'error', error: error.message, archlens: resolved, analysisPath: this.store.analysisPath && this._rel(this.store.analysisPath), candidates: this.store.candidates.map(c => this._rel(c)), settings: this.settings }
    }
    let renderState = {}
    if (!resolved || resolved.tooOld) state = 'no-archlens'
    else if (!hasAnalysis) state = 'no-analysis'
    else {
      renderState = await this.store.renderState()
      const anyRendered = Object.values(renderState).some(r => r.rendered)
      if (!anyRendered && this.store.analysis.questions.length > 0) state = 'no-diagrams'
    }
    // An analysis is still browsable without archlens; only tell the UI which is missing
    return {
      state,
      hasAnalysis,
      projectName: path.basename(this.context.projectPath),
      archlens: resolved ? { binPath: resolved.binPath, source: resolved.source, version: resolved.version, tooOld: resolved.tooOld } : null,
      analysisPath: this.store.analysisPath ? this._rel(this.store.analysisPath) : null,
      diagramsDir: this._rel(this.store.diagramsDir),
      candidates: this.store.candidates.map(c => this._rel(c)),
      renderState,
      settings: this.settings,
      lastCheck: this.lastCheck
    }
  },

  async handleDoctor({ path: candidatePath } = {}) {
    if (typeof candidatePath === 'string') {
      this.runner.setConfiguredPath(candidatePath.trim() || null)
    }
    return this.runner.doctor()
  },

  /**
   * Analysis summary for the navigator and header.
   */
  async handleLoad({ analysisPath, reload = false } = {}) {
    if (analysisPath) {
      this.store.select(resolveInside(this.context.projectPath, analysisPath))
      this.settings.analysisFile = this._rel(this.store.analysisPath)
      await this._saveSettings()
      await this.store.load()
      this._startWatching()
    } else if (!(await this._ensureLoaded(reload))) {
      throw new Error('No architecture analysis found in this project')
    }
    const a = this.store.analysis
    const renderState = await this.store.renderState()
    let dropped = {}
    if (this.runner.resolve()) {
      try { dropped = await this.runner.questions(this.store.analysisPath) } catch (error) { this.context.log.warn(`questions failed: ${error.message}`) }
    }
    return {
      system: a.system,
      schemaVersion: a.schema_version,
      counts: this.store.counts(),
      analysisPath: this._rel(this.store.analysisPath),
      diagramsDir: this._rel(this.store.diagramsDir),
      questions: a.questions.map(q => ({
        id: q.id,
        title: q.title,
        ask: q.ask,
        shape: q.shape === 'sequence' ? 'sequence' : 'architecture',
        involves: (q.involves || []).length,
        render: renderState[q.id],
        dropped: dropped[q.id]?.dropped || []
      })),
      model: this.store.describeModel()
    }
  },

  async handleGetQuestion({ id } = {}) {
    await this._requireAnalysis()
    const q = this.store.describeQuestion(id)
    if (!q) throw new Error(`Unknown question: ${id}`)
    const renderState = await this.store.renderState()
    return { ...q, render: renderState[id] }
  },

  async handleGetRecord({ kind, id } = {}) {
    await this._requireAnalysis()
    let record = null
    switch (kind) {
      case 'component': record = this.store.describeComponent(id); break
      case 'relation': record = this.store.describeRelation(id); break
      case 'boundary': record = this.store.describeBoundary(id); break
      case 'fact': record = this.store.describeFact(id); break
      case 'term': record = this.store.describeTerm(id); break
      default: throw new Error(`Unknown record kind: ${kind}`)
    }
    if (!record) throw new Error(`Unknown ${kind}: ${id}`)
    // `kind` names the record type; the record's own kind (e.g. a component's 'service') moves to itemKind
    return { ...record, itemKind: record.kind, kind }
  },

  async handleGetDiagram({ id } = {}) {
    await this._requireAnalysis()
    const d = await this.diagrams.getDiagram(id)
    return { html: d.html, shape: d.shape, mtime: d.mtime, htmlPath: this._rel(d.htmlPath) }
  },

  async handleAsk({ question } = {}) {
    await this._requireAnalysis()
    this._requireArchlens()
    const slice = await this.askService.slice(question)
    slice.coverageFloor = this.settings.coverageFloor
    slice.canAnswer = !slice.empty && slice.coverage >= this.settings.coverageFloor
    await this.askService.recordHistory({ question: slice.question, stage: 'sliced', coverage: slice.coverage })
    return slice
  },

  async handleAnswer({ question, slice } = {}) {
    await this._requireAnalysis()
    this._requireArchlens()
    return this.askService.answer(question, slice)
  },

  async handleRender({ questionId, browserCheck } = {}) {
    await this._requireAnalysis()
    this._requireArchlens()
    const useCheck = typeof browserCheck === 'boolean' ? browserCheck : !!this.settings.renderBrowserCheck
    const outDir = this.store.diagramsDir
    await fsp.mkdir(outDir, { recursive: true })
    const result = await this.runner.render(this.store.analysisPath, outDir, {
      questionId,
      repoRoot: this.context.projectPath,
      browserCheck: useCheck,
      onLine: (line) => this.context.sendToRenderer?.('progress', { op: 'render', line })
    })
    this.lastRender = { at: new Date().toISOString(), ...result }
    this.context.sendToRenderer?.('changed', { kind: 'render' })
    return result
  },

  async handleCheck() {
    await this._requireAnalysis()
    this._requireArchlens()
    const repoRoot = this.context.projectPath
    const [check, enforce] = await Promise.all([
      this.runner.check(this.store.analysisPath, repoRoot),
      this.runner.enforce(this.store.analysisPath, repoRoot).catch(error => ({ ok: false, result: null, exitCode: null, raw: error.message }))
    ])
    this.lastCheck = { at: new Date().toISOString(), check, enforce }
    return this.lastCheck
  },

  async handleValidate() {
    await this._requireAnalysis()
    this._requireArchlens()
    return this.runner.validate(this.store.analysisPath)
  },

  /**
   * Draft an analysis from a compose file or package manifest.
   */
  async handleSeed({ source, name } = {}) {
    this._requireArchlens()
    const projectPath = this.context.projectPath
    const sourcePath = resolveInside(projectPath, source || 'package.json')
    const systemName = (name || path.basename(projectPath)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'system'
    const outDir = path.join(projectPath, DEFAULT_DIAGRAMS_DIR)
    await fsp.mkdir(outDir, { recursive: true })
    const outPath = path.join(outDir, `${systemName}.analysis.json`)
    const result = await this.runner.seed(sourcePath, outPath, { name: systemName, repoRoot: projectPath })
    if (!result.ok) throw new Error(result.raw.trim() || 'archlens seed failed')
    this.store.select(outPath)
    await this.store.load()
    this._startWatching()
    return { analysisPath: this._rel(outPath), raw: result.raw }
  },

  async handleOpenEvidence({ path: relPath } = {}) {
    return this.diagrams.resolveEvidence(relPath)
  },

  /**
   * Open an http(s) link in the browser, or a file inside the project with the
   * system default application (used for rendered diagram pages).
   */
  async handleOpenExternal({ url, path: relPath } = {}) {
    const { shell } = require('electron')
    if (relPath) {
      const abs = resolveInside(this.context.projectPath, String(relPath))
      const problem = await shell.openPath(abs)
      if (problem) throw new Error(problem)
      return { ok: true }
    }
    if (!/^https?:\/\//i.test(String(url || ''))) throw new Error('Only http(s) links can be opened')
    await shell.openExternal(url)
    return { ok: true }
  },

  async handleGetAskHistory() {
    return this.askService.getHistory()
  },

  /**
   * Append a prose answer to docs/architecture/questions.md.
   */
  async handleSaveNote({ question, answer } = {}) {
    await this._requireAnalysis()
    if (!question || !answer) throw new Error('question and answer are required')
    const notePath = path.join(this.store.diagramsDir, NOTES_FILE)
    const stamp = new Date().toISOString().slice(0, 10)
    const block = `\n## ${question.trim()}\n\n_${stamp}_\n\n${answer.trim()}\n`
    let existing = ''
    try { existing = await fsp.readFile(notePath, 'utf8') } catch { existing = `# Architecture questions\n\nProse answers saved from Puffin's Architecture tab. Each answer was written from the analysis slice only.\n` }
    await fsp.writeFile(notePath, existing + block, 'utf8')
    return { ok: true, path: this._rel(notePath) }
  },

  async handleCancel({ label } = {}) {
    return { cancelled: this.runner.cancel(label) }
  },

  async handleGetSettings() {
    return { ...this.settings, defaults: DEFAULT_SETTINGS }
  },

  async handleSetSettings(patch = {}) {
    const next = { ...this.settings }
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (patch[key] !== undefined) next[key] = patch[key]
    }
    next.coverageFloor = Math.min(1, Math.max(0, Number(next.coverageFloor) || 0))
    this.settings = next
    await this._saveSettings()
    this.runner.setConfiguredPath(next.archlensPath || null)
    if (patch.analysisFile !== undefined || patch.diagramsDir !== undefined) {
      this.store.unwatch()
      this.store.analysisPath = null
      this.store.analysis = null
    }
    return this.settings
  },

  async _requireAnalysis() {
    if (!(await this._ensureLoaded())) throw new Error('No architecture analysis found in this project')
  },

  _requireArchlens() {
    const resolved = this.runner.resolve()
    if (!resolved) throw new Error('archlens is not installed. Install it with /plugin install archlens@arch-lens, or set its path in the Architecture settings.')
    if (resolved.tooOld) throw new Error(`archlens ${resolved.version} is too old; 0.5.0+ is required.`)
  }
}

module.exports = ArchitecturePlugin
