/**
 * archlens-runner - Locates the archlens CLI and runs it as a child process.
 *
 * archlens needs Node 22+; Electron's bundled Node satisfies that, so the CLI is
 * spawned with `process.execPath` under ELECTRON_RUN_AS_NODE. Never `shell: true`:
 * questions and long paths are passed as single argv elements.
 */

const { spawn, execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const SKILL_BIN = path.join('skills', 'archlens', 'bin', 'archlens.mjs')
const DEFAULT_TIMEOUT_MS = 60000
const RENDER_TIMEOUT_MS = 60000
const RENDER_TIMEOUT_WITH_CHECK_MS = 180000

/** Oldest archlens whose CLI has ask/check/enforce/review/seed. */
const MIN_VERSION = '0.5.0'

/** Exit code archlens uses when `ask` finds nothing. */
const ASK_EMPTY_EXIT = 3

/**
 * Compare two semver strings (desc sort helper).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function semverDesc(a, b) {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0)
  }
  return 0
}

/**
 * Parse `archlens render` / `questions` output into per-question summaries.
 * @param {string} stdout
 * @returns {{ questions: Object<string, {title: string, dropped: string[], fixed: string[], failed: string|null, wrote: string|null}>, delivered: string|null }}
 */
function parseRenderOutput(stdout) {
  const questions = {}
  let current = null
  let delivered = null
  for (const rawLine of String(stdout || '').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '')
    let m
    if ((m = line.match(/^— (\S+): (.*)$/))) {
      current = { title: m[2], dropped: [], fixed: [], failed: null, wrote: null }
      questions[m[1]] = current
    } else if ((m = line.match(/^(\S+)\s{2,}(.+)$/)) && !line.startsWith(' ')) {
      // `archlens questions` form: "<id>  <title>"
      if (!/^(wrote|warning|error|note)$/.test(m[1])) {
        current = { title: m[2], dropped: [], fixed: [], failed: null, wrote: null }
        questions[m[1]] = current
      }
    } else if (current && (m = line.match(/^\s+dropped\s+(.*)$/))) {
      current.dropped.push(m[1])
    } else if (current && (m = line.match(/^\s+fixed\s+(.*)$/))) {
      current.fixed.push(m[1])
    } else if (current && (m = line.match(/^\s+FAILED\s+(.*)$/))) {
      current.failed = m[1]
    } else if (current && (m = line.match(/^\s+wrote\s+(.*)$/))) {
      current.wrote = m[1]
    } else if ((m = line.match(/^(\d+\/\d+) diagram\(s\) delivered\.$/))) {
      delivered = m[1]
    }
  }
  return { questions, delivered }
}

/**
 * Parse `archlens validate` output.
 * @param {string} stdout
 * @returns {{ errors: {where: string, message: string, fix: string|null}[], warnings: {where: string, message: string, fix: string|null}[] }}
 */
function parseValidateOutput(stdout) {
  const errors = []
  const warnings = []
  let last = null
  for (const line of String(stdout || '').split(/\r?\n/)) {
    let m
    if ((m = line.match(/^(error|warning) ([^:]+): (.*)$/))) {
      last = { where: m[2], message: m[3], fix: null }
      ;(m[1] === 'error' ? errors : warnings).push(last)
    } else if (last && (m = line.match(/^\s+fix: (.*)$/))) {
      last.fix = m[1]
    }
  }
  return { errors, warnings }
}

/**
 * Parse `archlens doctor` output.
 * @param {string} stdout
 * @param {number} code
 * @returns {{ ok: boolean, node: string|null, archify: string|null, problems: string[] }}
 */
function parseDoctorOutput(stdout, code) {
  const result = { ok: code === 0, node: null, archify: null, problems: [] }
  for (const line of String(stdout || '').split(/\r?\n/)) {
    let m
    if ((m = line.match(/^\[ok\] Node\.js (\S+)/))) result.node = m[1]
    else if ((m = line.match(/^\[ok\] archify at (.*)$/))) result.archify = m[1]
    else if ((m = line.match(/^\[!!\] (.*)$/))) result.problems.push(m[1])
  }
  return result
}

class ArchlensRunner {
  /**
   * @param {Object} options
   * @param {string} options.projectPath
   * @param {Object} [options.log]
   * @param {string} [options.configuredPath] - archlens.mjs path from settings
   * @param {string} [options.homeDir] - override for tests
   * @param {string} [options.execPath] - override for tests
   */
  constructor({ projectPath, log, configuredPath, homeDir, execPath } = {}) {
    this.projectPath = projectPath
    this.log = log || console
    this.configuredPath = configuredPath || null
    this.homeDir = homeDir || os.homedir()
    this.execPath = execPath || process.execPath
    this._resolved = null
    this._running = new Set()
  }

  /**
   * Update the configured path and forget the cached resolution.
   * @param {string|null} configuredPath
   */
  setConfiguredPath(configuredPath) {
    this.configuredPath = configuredPath || null
    this._resolved = null
  }

  /**
   * Candidate locations, in probe order.
   * @returns {{ path: string, source: string }[]}
   */
  candidates() {
    const list = []
    if (this.configuredPath) list.push({ path: this.configuredPath, source: 'settings' })
    if (process.env.ARCHLENS_BIN) list.push({ path: process.env.ARCHLENS_BIN, source: 'env' })

    // Installed Claude Code plugin: read the exact install path first
    const installed = path.join(this.homeDir, '.claude', 'plugins', 'installed_plugins.json')
    try {
      const doc = JSON.parse(fs.readFileSync(installed, 'utf8'))
      const entries = (doc.plugins && doc.plugins['archlens@arch-lens']) || doc['archlens@arch-lens'] || []
      for (const e of entries) {
        if (e && e.installPath) list.push({ path: path.join(e.installPath, SKILL_BIN), source: 'claude-plugin' })
      }
    } catch { /* not installed as a plugin */ }

    // Plugin cache, highest version first
    const cacheDir = path.join(this.homeDir, '.claude', 'plugins', 'cache', 'arch-lens', 'archlens')
    try {
      const versions = fs.readdirSync(cacheDir).filter(v => /^\d+\.\d+\.\d+/.test(v)).sort(semverDesc)
      for (const v of versions) list.push({ path: path.join(cacheDir, v, SKILL_BIN), source: 'claude-plugin-cache' })
    } catch { /* no cache */ }

    // Installed as a plain skill
    list.push({ path: path.join(this.homeDir, '.claude', 'skills', 'archlens', 'bin', 'archlens.mjs'), source: 'claude-skill' })

    // Sibling checkout (development convenience)
    if (this.projectPath) {
      list.push({ path: path.join(path.dirname(this.projectPath), 'archlens', SKILL_BIN), source: 'sibling-checkout' })
      list.push({ path: path.join(path.dirname(this.projectPath), 'arch-lens', SKILL_BIN), source: 'sibling-checkout' })
    }
    return list
  }

  /**
   * Version of the archlens checkout a bin path belongs to (from the package.json
   * beside it), or '0.0.0' when unknown.
   * @param {string} binPath
   * @returns {string}
   */
  static versionOf(binPath) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(binPath), '..', 'package.json'), 'utf8'))
      return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
    } catch {
      return '0.0.0'
    }
  }

  /**
   * Find the archlens CLI. An explicitly configured path (settings, env) wins;
   * otherwise the highest-versioned install is used, because older published
   * versions lack `ask`/`check`/`enforce`.
   * @returns {{ binPath: string, source: string, version: string, tooOld: boolean }|null}
   */
  resolve() {
    if (this._resolved) return this._resolved
    const existing = []
    for (const c of this.candidates()) {
      try {
        if (fs.statSync(c.path).isFile()) existing.push({ binPath: c.path, source: c.source, version: ArchlensRunner.versionOf(c.path) })
      } catch { /* try next */ }
    }
    if (existing.length === 0) return null
    const explicit = existing.find(c => c.source === 'settings' || c.source === 'env')
    const best = explicit || [...existing].sort((a, b) => semverDesc(a.version, b.version))[0]
    this._resolved = { ...best, tooOld: semverDesc(best.version, MIN_VERSION) > 0 }
    return this._resolved
  }

  /**
   * Run archlens with the given arguments.
   * @param {string[]} args
   * @param {Object} [options]
   * @param {string} [options.cwd]
   * @param {number} [options.timeoutMs]
   * @param {Function} [options.onLine] - Called with each stdout line
   * @param {string} [options.label] - For logging/cancel bookkeeping
   * @returns {Promise<{ code: number|null, stdout: string, stderr: string, timedOut: boolean, killed: boolean }>}
   */
  run(args, { cwd, timeoutMs = DEFAULT_TIMEOUT_MS, onLine, label } = {}) {
    const resolved = this.resolve()
    if (!resolved) return Promise.reject(new Error('archlens not found'))

    return new Promise((resolvePromise, reject) => {
      let child
      try {
        child = spawn(this.execPath, [resolved.binPath, ...args], {
          cwd: cwd || this.projectPath || undefined,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        })
      } catch (error) {
        return reject(error)
      }
      const entry = { child, label: label || args[0], killed: false }
      this._running.add(entry)

      let stdout = ''
      let stderr = ''
      let lineBuffer = ''
      let timedOut = false

      const timer = setTimeout(() => {
        timedOut = true
        this._kill(child)
      }, timeoutMs)

      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        stdout += chunk
        if (onLine) {
          lineBuffer += chunk
          const lines = lineBuffer.split(/\r?\n/)
          lineBuffer = lines.pop()
          for (const l of lines) { try { onLine(l) } catch { /* ignore listener errors */ } }
        }
      })
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk) => { stderr += chunk })

      child.on('error', (error) => {
        clearTimeout(timer)
        this._running.delete(entry)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        this._running.delete(entry)
        if (onLine && lineBuffer) { try { onLine(lineBuffer) } catch { /* ignore */ } }
        resolvePromise({ code, stdout, stderr, timedOut, killed: entry.killed })
      })
    })
  }

  _kill(child) {
    if (!child || child.killed) return
    for (const entry of this._running) if (entry.child === child) entry.killed = true
    if (process.platform === 'win32' && child.pid) {
      try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* already gone */ }
    } else {
      try { child.kill('SIGTERM') } catch { /* ignore */ }
    }
  }

  /**
   * Cancel every running archlens process (optionally only those with a label).
   * @param {string} [label]
   * @returns {number} processes signalled
   */
  cancel(label) {
    let n = 0
    for (const entry of [...this._running]) {
      if (!label || entry.label === label) { this._kill(entry.child); n++ }
    }
    return n
  }

  _parseJson(stdout, what) {
    const text = String(stdout || '').trim()
    const start = text.indexOf('{')
    if (start < 0) throw new Error(`archlens ${what} produced no JSON`)
    return JSON.parse(text.slice(start))
  }

  // ============ Typed commands ============

  /** @returns {Promise<{ ok: boolean, node: string|null, archify: string|null, problems: string[], binPath: string|null, source: string|null, version: string|null, minVersion: string }>} */
  async doctor() {
    const resolved = this.resolve()
    if (!resolved) return { ok: false, node: null, archify: null, problems: ['archlens.mjs not found'], binPath: null, source: null, version: null, minVersion: MIN_VERSION }
    const meta = { binPath: resolved.binPath, source: resolved.source, version: resolved.version, minVersion: MIN_VERSION }
    try {
      const r = await this.run(['doctor'], { timeoutMs: 20000, label: 'doctor' })
      const parsed = parseDoctorOutput(r.stdout + '\n' + r.stderr, r.code)
      if (!parsed.ok && parsed.problems.length === 0) parsed.problems.push((r.stderr || r.stdout || `exit ${r.code}`).trim())
      if (resolved.tooOld) {
        parsed.ok = false
        parsed.problems.push(`archlens ${resolved.version} is too old; ${MIN_VERSION}+ is required (ask/check/enforce)`)
      }
      return { ...parsed, ...meta }
    } catch (error) {
      return { ok: false, node: null, archify: null, problems: [error.message], ...meta }
    }
  }

  /**
   * @param {string} analysisPath
   * @returns {Promise<{ ok: boolean, errors: Object[], warnings: Object[], raw: string }>}
   */
  async validate(analysisPath) {
    const r = await this.run(['validate', analysisPath], { label: 'validate' })
    const parsed = parseValidateOutput(r.stdout)
    return { ok: r.code === 0, ...parsed, raw: r.stdout + (r.stderr ? `\n${r.stderr}` : '') }
  }

  /**
   * Dropped lines per question without rendering.
   * @param {string} analysisPath
   * @returns {Promise<Object<string, Object>>}
   */
  async questions(analysisPath) {
    const r = await this.run(['questions', analysisPath], { label: 'questions' })
    return parseRenderOutput(r.stdout).questions
  }

  /**
   * @param {string} analysisPath
   * @param {string} outDir
   * @param {Object} [options]
   * @param {string} [options.questionId]
   * @param {string} [options.repoRoot]
   * @param {boolean} [options.browserCheck=false]
   * @param {Function} [options.onLine]
   * @returns {Promise<{ ok: boolean, code: number|null, questions: Object, delivered: string|null, raw: string, timedOut: boolean }>}
   */
  async render(analysisPath, outDir, { questionId, repoRoot, browserCheck = false, onLine } = {}) {
    const args = ['render', analysisPath, outDir]
    if (questionId) args.push('--question', questionId)
    if (repoRoot) args.push('--repo-root', repoRoot)
    if (!browserCheck) args.push('--no-check')
    const r = await this.run(args, {
      timeoutMs: browserCheck ? RENDER_TIMEOUT_WITH_CHECK_MS : RENDER_TIMEOUT_MS,
      onLine,
      label: 'render'
    })
    const parsed = parseRenderOutput(r.stdout)
    return { ok: r.code === 0 && !r.timedOut, code: r.code, ...parsed, raw: r.stdout + (r.stderr ? `\n${r.stderr}` : ''), timedOut: r.timedOut }
  }

  /**
   * @param {string} analysisPath
   * @param {string} question
   * @returns {Promise<Object>} The ask slice; `empty: true` when uncovered
   */
  async ask(analysisPath, question) {
    const r = await this.run(['ask', analysisPath, question, '--json'], { label: 'ask' })
    if (r.code !== 0 && r.code !== ASK_EMPTY_EXIT) {
      throw new Error((r.stderr || r.stdout || `archlens ask exited ${r.code}`).trim())
    }
    try {
      const slice = this._parseJson(r.stdout, 'ask')
      if (r.code === ASK_EMPTY_EXIT) slice.empty = true
      return slice
    } catch (error) {
      if (r.code === ASK_EMPTY_EXIT) {
        return { question, terms: [], components: [], relations: [], facts: [], questions: [], boundaries: [], glossary: [], unmatched: [], coverage: 0, empty: true }
      }
      throw error
    }
  }

  /**
   * @param {string} analysisPath
   * @param {string} repoRoot
   * @returns {Promise<{ ok: boolean, code: Object|null, documents: Object|null, exitCode: number|null, raw: string }>}
   */
  async check(analysisPath, repoRoot) {
    const r = await this.run(['check', analysisPath, '--repo-root', repoRoot, '--json'], { label: 'check' })
    let parsed = null
    try { parsed = this._parseJson(r.stdout, 'check') } catch { /* fall through */ }
    return { ok: r.code === 0, code: parsed?.code || null, documents: parsed?.documents || null, exitCode: r.code, raw: r.stdout + (r.stderr ? `\n${r.stderr}` : '') }
  }

  /**
   * @param {string} analysisPath
   * @param {string} repoRoot
   * @returns {Promise<{ ok: boolean, result: Object|null, exitCode: number|null, raw: string }>}
   */
  async enforce(analysisPath, repoRoot) {
    const r = await this.run(['enforce', analysisPath, '--repo-root', repoRoot, '--json'], { label: 'enforce' })
    let parsed = null
    try { parsed = this._parseJson(r.stdout, 'enforce') } catch { /* fall through */ }
    return { ok: r.code === 0, result: parsed, exitCode: r.code, raw: r.stdout + (r.stderr ? `\n${r.stderr}` : '') }
  }

  /**
   * @param {string} sourcePath - compose file or package.json
   * @param {string} outPath
   * @param {Object} [options]
   * @param {string} [options.name]
   * @param {string} [options.repoRoot]
   * @returns {Promise<{ ok: boolean, raw: string }>}
   */
  async seed(sourcePath, outPath, { name, repoRoot } = {}) {
    const args = ['seed', sourcePath, outPath]
    if (name) args.push('--name', name)
    if (repoRoot) args.push('--repo-root', repoRoot)
    const r = await this.run(args, { label: 'seed' })
    return { ok: r.code === 0, raw: r.stdout + (r.stderr ? `\n${r.stderr}` : '') }
  }
}

module.exports = { ArchlensRunner, parseRenderOutput, parseValidateOutput, parseDoctorOutput, ASK_EMPTY_EXIT, MIN_VERSION }
