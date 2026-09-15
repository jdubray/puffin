/**
 * analysis-store - Finds, loads, indexes and watches an arch-lens analysis
 * (`<name>.analysis.json`) and the diagrams rendered from it.
 *
 * The analysis is the artifact; everything the tab shows is derived from it.
 * This module never validates semantics (that is `archlens validate`'s job) —
 * it only needs parseable JSON with the top-level arrays present.
 */

const fs = require('fs')
const fsp = require('fs').promises
const path = require('path')

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.puffin', 'coverage'])
const ANALYSIS_SUFFIX = '.analysis.json'
const DEFAULT_DIAGRAMS_DIR = 'docs/architecture'
const WATCH_DEBOUNCE_MS = 300
const MAX_SCAN_DEPTH = 6

/**
 * Resolve a project-relative or absolute path and assert it stays inside the project.
 * @param {string} projectPath
 * @param {string} candidate
 * @returns {string} Absolute path
 * @throws {Error} when the path escapes the project
 */
function resolveInside(projectPath, candidate) {
  const abs = path.isAbsolute(candidate) ? path.normalize(candidate) : path.resolve(projectPath, candidate)
  const rel = path.relative(projectPath, abs)
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    return abs
  }
  throw new Error(`Path is outside the project: ${candidate}`)
}

/**
 * Escape a string for use inside a RegExp.
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

class AnalysisStore {
  /**
   * @param {Object} options
   * @param {string} options.projectPath
   * @param {Object} [options.log]
   */
  constructor({ projectPath, log }) {
    this.projectPath = projectPath
    this.log = log || console
    this.analysisPath = null
    this.diagramsDir = path.join(projectPath, DEFAULT_DIAGRAMS_DIR)
    this.analysis = null
    this.index = null
    this.candidates = []
    this._watchers = []
    this._watchTimer = null
    this._onChange = null
  }

  // ============ Discovery ============

  /**
   * Find analysis files in the project.
   * Order: configured file, then docs/architecture, then a bounded recursive scan.
   * @param {string} [configuredPath] - Project-relative path from settings
   * @returns {Promise<{ analysisPath: string|null, candidates: string[] }>}
   */
  async discover(configuredPath) {
    const found = []
    const push = (p) => { if (p && !found.includes(p)) found.push(p) }

    if (configuredPath) {
      try {
        const abs = resolveInside(this.projectPath, configuredPath)
        await fsp.access(abs)
        push(abs)
      } catch (error) {
        this.log.warn?.(`Configured analysis not found: ${configuredPath} (${error.message})`)
      }
    }

    const preferredDir = path.join(this.projectPath, DEFAULT_DIAGRAMS_DIR)
    for (const p of await this._listAnalyses(preferredDir)) push(p)

    if (found.length === 0) {
      await this._scan(this.projectPath, 0, push)
    }

    this.candidates = found
    this.analysisPath = found[0] || null
    if (this.analysisPath) {
      this.diagramsDir = path.dirname(this.analysisPath)
    }
    return { analysisPath: this.analysisPath, candidates: found }
  }

  async _listAnalyses(dir) {
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      return entries
        .filter(e => e.isFile() && e.name.endsWith(ANALYSIS_SUFFIX))
        .map(e => path.join(dir, e.name))
        .sort()
    } catch {
      return []
    }
  }

  async _scan(dir, depth, push) {
    if (depth > MAX_SCAN_DEPTH) return
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(ANALYSIS_SUFFIX)) {
        push(path.join(dir, entry.name))
      }
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        await this._scan(path.join(dir, entry.name), depth + 1, push)
      }
    }
  }

  /**
   * Select a specific analysis file (must be inside the project).
   * @param {string} analysisPath
   */
  select(analysisPath) {
    this.analysisPath = resolveInside(this.projectPath, analysisPath)
    this.diagramsDir = path.dirname(this.analysisPath)
    this.analysis = null
    this.index = null
  }

  /**
   * Override the diagrams directory (project-relative or absolute, inside the project).
   * @param {string} dir
   */
  setDiagramsDir(dir) {
    this.diagramsDir = resolveInside(this.projectPath, dir)
  }

  // ============ Loading ============

  /**
   * Parse the selected analysis and build lookup indexes.
   * @returns {Promise<Object>} The analysis document
   */
  async load() {
    if (!this.analysisPath) throw new Error('No analysis selected')
    const raw = await fsp.readFile(this.analysisPath, 'utf8')
    const doc = JSON.parse(raw)
    for (const key of ['components', 'relations', 'boundaries', 'facts', 'glossary', 'questions']) {
      if (!Array.isArray(doc[key])) doc[key] = []
    }
    if (!doc.system || typeof doc.system !== 'object') doc.system = { name: path.basename(this.analysisPath, ANALYSIS_SUFFIX) }
    this.analysis = doc
    this.index = this._buildIndex(doc)
    return doc
  }

  _buildIndex(doc) {
    const byId = (list) => new Map(list.filter(x => x && x.id).map(x => [x.id, x]))
    const components = byId(doc.components)
    const relations = byId(doc.relations)
    const boundaries = byId(doc.boundaries)
    const facts = byId(doc.facts)
    const questions = byId(doc.questions)

    const relationsByComponent = new Map()
    for (const r of doc.relations) {
      for (const end of [r.from, r.to]) {
        if (!relationsByComponent.has(end)) relationsByComponent.set(end, [])
        relationsByComponent.get(end).push(r)
      }
    }

    const boundaryOfComponent = new Map()
    for (const b of doc.boundaries) {
      for (const id of b.contains || []) boundaryOfComponent.set(id, b)
    }

    const questionsByComponent = new Map()
    const questionsByFact = new Map()
    for (const q of doc.questions) {
      for (const id of q.involves || []) {
        if (!questionsByComponent.has(id)) questionsByComponent.set(id, [])
        questionsByComponent.get(id).push(q)
      }
      for (const id of q.facts || []) {
        if (!questionsByFact.has(id)) questionsByFact.set(id, [])
        questionsByFact.get(id).push(q)
      }
    }

    const glossary = new Map()
    for (const g of doc.glossary) {
      if (!g || !g.term) continue
      glossary.set(g.term.toLowerCase(), g)
      for (const alias of g.also || []) glossary.set(String(alias).toLowerCase(), g)
    }

    return { components, relations, boundaries, facts, questions, relationsByComponent, boundaryOfComponent, questionsByComponent, questionsByFact, glossary }
  }

  _requireLoaded() {
    if (!this.analysis || !this.index) throw new Error('Analysis not loaded')
  }

  // ============ Queries ============

  /**
   * Summary counts for the header.
   * @returns {Object}
   */
  counts() {
    this._requireLoaded()
    const a = this.analysis
    return {
      components: a.components.length,
      relations: a.relations.length,
      boundaries: a.boundaries.length,
      facts: a.facts.length,
      glossary: a.glossary.length,
      questions: a.questions.length
    }
  }

  getComponent(id) { this._requireLoaded(); return this.index.components.get(id) || null }
  getRelation(id) { this._requireLoaded(); return this.index.relations.get(id) || null }
  getBoundary(id) { this._requireLoaded(); return this.index.boundaries.get(id) || null }
  getFact(id) { this._requireLoaded(); return this.index.facts.get(id) || null }
  getQuestion(id) { this._requireLoaded(); return this.index.questions.get(id) || null }

  /**
   * Find a relation by its endpoints.
   * @param {string} from
   * @param {string} to
   * @returns {Object|null}
   */
  findRelation(from, to) {
    this._requireLoaded()
    return this.analysis.relations.find(r => r.from === from && r.to === to) || null
  }

  /**
   * Glossary entries used by a question — the archlens rule: an entry is used
   * when its term or an alias appears (word-bounded, case-insensitive) in the
   * question's prose or in an involved component's name/detail/responsibility.
   * @param {Object} question
   * @returns {Object[]}
   */
  termsForQuestion(question) {
    this._requireLoaded()
    const parts = [question.ask, question.answer, question.context, question.narrative, question.omits, question.title]
    for (const id of question.involves || []) {
      const c = this.index.components.get(id)
      if (c) parts.push(c.name, c.detail, c.responsibility)
    }
    const text = parts.filter(Boolean).join('\n')
    const used = []
    for (const entry of this.analysis.glossary) {
      if (!entry || !entry.term) continue
      const names = [entry.term, ...(entry.also || [])].filter(Boolean)
      const hit = names.some(n => new RegExp(`(^|[^\\w])${escapeRegExp(n)}(?=[^\\w]|$)`, 'i').test(text))
      if (hit && !used.includes(entry)) used.push(entry)
    }
    return used
  }

  /**
   * Hydrate a question with everything the reading pane needs.
   * @param {string} id
   * @returns {Object|null}
   */
  describeQuestion(id) {
    const q = this.getQuestion(id)
    if (!q) return null
    const involves = (q.involves || []).map(cid => this.describeComponent(cid, { brief: true })).filter(Boolean)
    const facts = (q.facts || []).map(fid => this.getFact(fid)).filter(Boolean)
    const terms = this.termsForQuestion(q)
    const shape = q.shape === 'sequence' ? 'sequence' : 'architecture'
    return { ...q, shape, involves, facts, terms }
  }

  /**
   * Hydrate a component with its boundary, relations and questions.
   * @param {string} id
   * @param {Object} [options]
   * @param {boolean} [options.brief] - Skip relation/question expansion
   * @returns {Object|null}
   */
  describeComponent(id, { brief = false } = {}) {
    const c = this.getComponent(id)
    if (!c) return null
    const boundary = this.index.boundaryOfComponent.get(id) || null
    const base = { ...c, boundary: boundary ? { id: boundary.id, label: boundary.label } : null }
    if (brief) return base
    const relations = (this.index.relationsByComponent.get(id) || []).map(r => ({
      ...r,
      direction: r.from === id ? 'out' : 'in',
      other: this._nameOf(r.from === id ? r.to : r.from)
    }))
    const questions = (this.index.questionsByComponent.get(id) || []).map(q => ({ id: q.id, title: q.title }))
    return { ...base, relations, questions }
  }

  describeRelation(id) {
    const r = this.getRelation(id)
    if (!r) return null
    const questions = this.analysis.questions
      .filter(q => (q.involves || []).includes(r.from) && (q.involves || []).includes(r.to))
      .map(q => ({ id: q.id, title: q.title }))
    return { ...r, fromName: this._nameOf(r.from).name, toName: this._nameOf(r.to).name, questions }
  }

  describeBoundary(id) {
    const b = this.getBoundary(id)
    if (!b) return null
    const members = (b.contains || []).map(cid => this._nameOf(cid))
    const inside = new Set(b.contains || [])
    const crossing = this.analysis.relations
      .filter(r => inside.has(r.from) !== inside.has(r.to))
      .map(r => ({ id: r.id, from: r.from, to: r.to, summary: r.summary, what_crosses: r.what_crosses }))
    return { ...b, members, crossing }
  }

  describeFact(id) {
    const f = this.getFact(id)
    if (!f) return null
    const questions = (this.index.questionsByFact.get(id) || []).map(q => ({ id: q.id, title: q.title }))
    return { ...f, questions }
  }

  describeTerm(term) {
    this._requireLoaded()
    const entry = this.index.glossary.get(String(term).toLowerCase())
    if (!entry) return null
    const questions = this.analysis.questions
      .filter(q => this.termsForQuestion(q).includes(entry))
      .map(q => ({ id: q.id, title: q.title }))
    return { ...entry, questions }
  }

  /**
   * Glossary with back-references, alphabetical.
   * @returns {Object[]}
   */
  describeGlossary() {
    this._requireLoaded()
    const usedBy = new Map()
    for (const q of this.analysis.questions) {
      for (const entry of this.termsForQuestion(q)) {
        if (!usedBy.has(entry)) usedBy.set(entry, [])
        usedBy.get(entry).push({ id: q.id, title: q.title })
      }
    }
    return [...this.analysis.glossary]
      .filter(g => g && g.term)
      .sort((a, b) => a.term.localeCompare(b.term))
      .map(g => ({ ...g, questions: usedBy.get(g) || [] }))
  }

  /**
   * Model tables for the browser view.
   * @returns {Object}
   */
  describeModel() {
    this._requireLoaded()
    const a = this.analysis
    return {
      components: a.components.map(c => ({
        id: c.id, name: c.name, kind: c.kind, status: c.status, detail: c.detail, responsibility: c.responsibility,
        boundary: this.index.boundaryOfComponent.get(c.id)?.label || null,
        relations: (this.index.relationsByComponent.get(c.id) || []).length,
        questions: (this.index.questionsByComponent.get(c.id) || []).length
      })),
      relations: a.relations.map(r => ({
        id: r.id, from: r.from, to: r.to, fromName: this._nameOf(r.from).name, toName: this._nameOf(r.to).name,
        mechanism: r.mechanism, summary: r.summary, crosses: r.crosses || null
      })),
      boundaries: a.boundaries.map(b => ({ id: b.id, kind: b.kind, label: b.label, claim: b.claim, members: (b.contains || []).length })),
      facts: a.facts.map(f => ({ id: f.id, kind: f.kind, claim: f.claim, because: f.because, hasRule: !!f.rule })),
      glossary: this.describeGlossary()
    }
  }

  _nameOf(id) {
    const c = this.index.components.get(id)
    return { id, name: c ? c.name : id, status: c ? c.status : undefined }
  }

  // ============ Render state ============

  /**
   * Diagram file names for a question.
   * @param {Object} question
   * @returns {{ stem: string, html: string, json: string, shape: string }}
   */
  diagramFilesFor(question) {
    const shape = question.shape === 'sequence' ? 'sequence' : 'architecture'
    const stem = `${question.id}.${shape}`
    return { stem, shape, html: path.join(this.diagramsDir, `${stem}.html`), json: path.join(this.diagramsDir, `${stem}.json`) }
  }

  /**
   * Whether each question is rendered, and whether the render is older than the analysis.
   * @returns {Promise<Object<string, {rendered: boolean, stale: boolean, htmlPath: string|null, mtime: number|null}>>}
   */
  async renderState() {
    this._requireLoaded()
    let analysisMtime = 0
    try { analysisMtime = (await fsp.stat(this.analysisPath)).mtimeMs } catch { /* keep 0 */ }
    const result = {}
    for (const q of this.analysis.questions) {
      const files = this.diagramFilesFor(q)
      try {
        const st = await fsp.stat(files.html)
        result[q.id] = { rendered: true, stale: st.mtimeMs < analysisMtime, htmlPath: files.html, mtime: st.mtimeMs, shape: files.shape }
      } catch {
        result[q.id] = { rendered: false, stale: false, htmlPath: null, mtime: null, shape: files.shape }
      }
    }
    return result
  }

  // ============ Watching ============

  /**
   * Watch the analysis file and the diagrams directory.
   * @param {Function} onChange - ({ kind: 'analysis'|'diagram', file }) => void
   */
  watch(onChange) {
    this.unwatch()
    this._onChange = onChange
    this._mtimes = new Map()
    if (this.analysisPath) this._mtimeMoved(this.analysisPath)
    if (this.analysis) {
      for (const q of this.analysis.questions) this._mtimeMoved(this.diagramFilesFor(q).html)
    }
    const dirs = new Set()
    if (this.analysisPath) dirs.add(path.dirname(this.analysisPath))
    if (this.diagramsDir) dirs.add(this.diagramsDir)
    for (const dir of dirs) {
      try {
        const w = fs.watch(dir, (_event, filename) => this._onWatchEvent(dir, filename))
        w.on('error', (err) => this.log.warn?.(`[analysis-store] watcher error on ${dir}: ${err.message}`))
        this._watchers.push(w)
      } catch (error) {
        this.log.warn?.(`[analysis-store] cannot watch ${dir}: ${error.message}`)
      }
    }
  }

  _onWatchEvent(dir, filename) {
    if (!filename) return
    const name = filename.toString()
    const full = path.join(dir, name)
    let kind = null
    if (this.analysisPath && full === this.analysisPath) kind = 'analysis'
    else if (/\.(architecture|sequence)\.html$/.test(name)) kind = 'diagram'
    if (!kind) return
    const key = `${kind}:${name}`
    this._pending = this._pending || new Map()
    this._pending.set(key, { kind, file: name })
    clearTimeout(this._watchTimer)
    this._watchTimer = setTimeout(() => {
      const events = [...this._pending.values()]
      this._pending.clear()
      for (const ev of events) {
        // Windows reports reads as changes; only forward events whose mtime moved
        if (!this._mtimeMoved(path.join(dir, ev.file))) continue
        try { this._onChange?.(ev) } catch (err) { this.log.error?.(`[analysis-store] onChange failed: ${err.message}`) }
      }
    }, WATCH_DEBOUNCE_MS)
  }

  _mtimeMoved(file) {
    this._mtimes = this._mtimes || new Map()
    let mtime = null
    try { mtime = fs.statSync(file).mtimeMs } catch { mtime = null }
    const prev = this._mtimes.has(file) ? this._mtimes.get(file) : undefined
    this._mtimes.set(file, mtime)
    return prev === undefined || prev !== mtime
  }

  /** Stop watching. */
  unwatch() {
    clearTimeout(this._watchTimer)
    for (const w of this._watchers) { try { w.close() } catch { /* ignore */ } }
    this._watchers = []
  }
}

module.exports = { AnalysisStore, resolveInside, ANALYSIS_SUFFIX, DEFAULT_DIAGRAMS_DIR }
