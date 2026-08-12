/**
 * Polygraph Service
 *
 * The main-process side of Puffin's Polygraph workbench: integration with the
 * Polygraph toolset for ANY project built with Polygraph (Puffin's own
 * machines/ directory is just one such project).
 *
 * Responsibilities:
 *   - discover machine artifact directories in the opened project
 *     (contract.json + next.cjs/machine.cjs + invariants.mjs, plus traces,
 *     polyrun config, findings, compat reports, intent ledgers)
 *   - run the Polygraph model checker per machine (local, deterministic, $0)
 *   - render polyviz diagrams for a machine's artifact dir
 *
 * Engine access follows the PolySec convention: a sibling checkout resolved
 * from POLYGRAPH_DIR (default ../polygraph relative to the Puffin repo, or a
 * configured absolute path). Puffin NEVER re-implements engine logic — every
 * answer comes from the engines, invoked as child processes.
 *
 * @module polygraph-service
 */

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

/** Directories never scanned for machine artifacts */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.puffin', '.claude'
])

/** Maximum directory depth for artifact discovery */
const MAX_DEPTH = 6

class PolygraphService {
  /**
   * @param {Object} [options]
   * @param {string} [options.polygraphDir] - Path to a Polygraph checkout
   * @param {string} [options.projectPath] - Project to operate on
   */
  constructor(options = {}) {
    this.projectPath = options.projectPath || null
    this._polygraphDir = options.polygraphDir || null
  }

  /** Update the active project path (mirrors setIpcProjectPath). */
  setProjectPath(projectPath) {
    this.projectPath = projectPath
    this._resolvedDir = undefined // project change can change the resolution
  }

  /**
   * Resolve the Polygraph checkout directory.
   * Order: explicit option > POLYGRAPH_DIR env > sibling of the project >
   * sibling of the Puffin repo.
   *
   * Relative values (including the documented '../polygraph' form of
   * POLYGRAPH_DIR) are resolved against stable bases — the project path and
   * the repo root — never the process cwd, which is arbitrary for a packaged
   * Electron app launched from a shortcut.
   *
   * Memoized; invalidated by setProjectPath().
   *
   * @returns {string|null} Absolute path, or null when no checkout found
   */
  resolvePolygraphDir() {
    if (this._resolvedDir !== undefined) return this._resolvedDir

    const bases = [
      this.projectPath,
      path.resolve(__dirname, '..', '..')
    ].filter(Boolean)

    const candidates = []
    for (const raw of [this._polygraphDir, process.env.POLYGRAPH_DIR]) {
      if (!raw) continue
      if (path.isAbsolute(raw)) {
        candidates.push(raw)
      } else {
        for (const base of bases) candidates.push(path.resolve(base, raw))
      }
    }
    for (const base of bases) {
      candidates.push(path.resolve(base, '..', 'polygraph'))
    }

    this._resolvedDir = candidates.find(
      dir => fs.existsSync(path.join(dir, 'scripts', 'check.mjs'))
    ) ?? null
    return this._resolvedDir
  }

  /**
   * Availability report for the workbench UI.
   *
   * @returns {{available: boolean, polygraphDir: string|null, polyviz: boolean}}
   */
  getStatus() {
    const dir = this.resolvePolygraphDir()
    return {
      available: dir !== null,
      polygraphDir: dir,
      polyviz: dir !== null && fs.existsSync(path.join(dir, 'polyviz', 'bin', 'polyviz.mjs'))
    }
  }

  /**
   * Discover Polygraph machine artifact directories in the project.
   *
   * A machine dir is any directory containing contract.json AND a module
   * (next.cjs, machine.cjs, next.js or reference.js). Companion artifacts
   * are reported when present.
   *
   * @param {string} [rootPath] - Defaults to the active project path
   * @returns {Object[]} One descriptor per machine dir
   */
  discoverMachines(rootPath = this.projectPath) {
    if (!rootPath || !fs.existsSync(rootPath)) return []

    const machines = []
    const walk = (dir, depth) => {
      if (depth > MAX_DEPTH) return
      let entries
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }

      const names = new Set(entries.filter(e => e.isFile()).map(e => e.name))
      if (names.has('contract.json')) {
        const moduleFile = ['next.cjs', 'machine.cjs', 'next.js', 'reference.js']
          .find(f => names.has(f))
        if (moduleFile) {
          machines.push(this._describeMachine(dir, moduleFile, names, rootPath))
        }
      }

      for (const entry of entries) {
        if (entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(path.join(dir, entry.name), depth + 1)
        }
      }
    }

    walk(rootPath, 0)
    return machines
  }

  /**
   * @private
   */
  _describeMachine(dir, moduleFile, names, rootPath) {
    const tracesDir = path.join(dir, 'traces')
    let traceFiles = 0
    if (fs.existsSync(tracesDir)) {
      try {
        traceFiles = fs.readdirSync(tracesDir).filter(f => f.endsWith('.ndjson')).length
      } catch { /* unreadable traces dir — report 0 */ }
    }

    return {
      name: path.basename(dir),
      dir,
      relDir: path.relative(rootPath, dir) || '.',
      moduleFile,
      hasInvariants: names.has('invariants.mjs'),
      hasIntentLedger: names.has('intent-ledger.json'),
      hasEffects: names.has('effects.cjs') || names.has('effects.manifest.json'),
      hasPolyrunConfig: names.has('polyrun.config.mjs'),
      traceFiles
    }
  }

  /**
   * Model-check one machine artifact directory with the Polygraph checker.
   *
   * @param {string} machineDir - Absolute path of the artifact directory
   * @param {Object} [options]
   * @param {string} [options.moduleFile] - Module filename (default: auto-detect)
   * @param {number} [options.maxStates] - State-space cap
   * @returns {Promise<Object>} Parsed check result
   */
  async checkMachine(machineDir, options = {}) {
    const polygraphDir = this.resolvePolygraphDir()
    if (!polygraphDir) {
      return { success: false, error: 'Polygraph checkout not found (set POLYGRAPH_DIR)' }
    }

    const moduleFile = options.moduleFile ||
      ['next.cjs', 'machine.cjs', 'next.js', 'reference.js']
        .find(f => fs.existsSync(path.join(machineDir, f)))
    const contract = path.join(machineDir, 'contract.json')
    if (!moduleFile || !fs.existsSync(contract)) {
      return { success: false, error: `Not a machine artifact dir: ${machineDir}` }
    }

    const args = [
      path.join(polygraphDir, 'scripts', 'check.mjs'),
      '--spec', path.join(machineDir, moduleFile),
      '--contract', contract
    ]
    const invariants = path.join(machineDir, 'invariants.mjs')
    if (fs.existsSync(invariants)) {
      args.push('--invariants', invariants)
    }
    if (options.maxStates) {
      args.push('--max-states', String(options.maxStates))
    }

    const { code, stdout, stderr } = await this._run(process.execPath, args)
    const output = `${stdout}${stderr}`.trim()

    return {
      success: code === 0 && output.includes('no invariant violations reachable'),
      exitCode: code,
      statesExplored: Number(output.match(/states explored: (\d+)/)?.[1] ?? 0),
      violations: this._countViolations(output),
      checkedInvariants: fs.existsSync(invariants),
      output
    }
  }

  /**
   * Check every machine in the project.
   *
   * @param {string} [rootPath]
   * @returns {Promise<Object[]>} Machine descriptors with check results
   */
  async checkAll(rootPath = this.projectPath) {
    const machines = this.discoverMachines(rootPath)
    const results = []
    for (const machine of machines) {
      const check = await this.checkMachine(machine.dir, { moduleFile: machine.moduleFile })
      results.push({ ...machine, check })
    }
    return results
  }

  /**
   * Render polyviz diagrams for a machine artifact directory.
   *
   * @param {string} machineDir - Artifact dir (polyviz adaptDir input)
   * @param {Object} [options]
   * @param {string} [options.outDir] - Output dir (default: .puffin/polyviz/<name>)
   * @param {string} [options.diagram] - Diagram id (default 'all')
   * @param {string} [options.theme] - 'dark' | 'light'
   * @returns {Promise<Object>} { success, svgs: [paths], output }
   */
  async renderDiagrams(machineDir, options = {}) {
    const polygraphDir = this.resolvePolygraphDir()
    if (!polygraphDir) {
      return { success: false, error: 'Polygraph checkout not found (set POLYGRAPH_DIR)' }
    }
    const polyviz = path.join(polygraphDir, 'polyviz', 'bin', 'polyviz.mjs')
    if (!fs.existsSync(polyviz)) {
      return { success: false, error: 'polyviz not found in the Polygraph checkout' }
    }

    // Key the output dir by the machine's project-relative path (not its
    // basename) so same-named machines in different subtrees don't collide.
    const machineKey = this.projectPath
      ? path.relative(this.projectPath, machineDir).split(path.sep).join('__') || 'root'
      : path.basename(machineDir)
    const outDir = options.outDir || (this.projectPath
      ? path.join(this.projectPath, '.puffin', 'polyviz', machineKey)
      : path.join(machineDir, '.polyviz-out'))

    // Clear previous output — the result must reflect THIS render only, so
    // stale SVGs can never mask a failed render as success.
    fs.rmSync(outDir, { recursive: true, force: true })
    fs.mkdirSync(outDir, { recursive: true })

    const args = [
      polyviz, 'render',
      '--in', machineDir,
      '--diagram', options.diagram || 'all',
      '--out', outDir,
      '--format', 'svg'
    ]
    if (options.theme) {
      args.push('--theme', options.theme)
    }

    const { code, stdout, stderr } = await this._run(process.execPath, args)
    const svgs = fs.existsSync(outDir)
      ? fs.readdirSync(outDir).filter(f => f.endsWith('.svg')).map(f => path.join(outDir, f))
      : []

    return {
      success: code === 0 && svgs.length > 0,
      svgs,
      outDir,
      output: `${stdout}${stderr}`.trim()
    }
  }

  /**
   * @private
   * Locate the polynv CLI inside the Polygraph checkout.
   */
  _polynvBin() {
    const polygraphDir = this.resolvePolygraphDir()
    if (!polygraphDir) return null
    const bin = path.join(polygraphDir, 'polynv', 'bin', 'polynv.mjs')
    return fs.existsSync(bin) ? bin : null
  }

  /**
   * Harvest invariant candidates from a machine's own vocabulary into its
   * intent ledger (polynv harvest — mechanical templates, no LLM, no key).
   *
   * @param {string} machineDir
   * @returns {Promise<{success: boolean, output?: string, error?: string}>}
   */
  async harvestInvariants(machineDir) {
    const bin = this._polynvBin()
    if (!bin) return { success: false, error: 'polynv not found in the Polygraph checkout' }
    const { code, stdout, stderr } = await this._run(process.execPath,
      [bin, 'harvest', '--artifacts', machineDir])
    return { success: code === 0, output: `${stdout}${stderr}`.trim() }
  }

  /**
   * Get the next open, pre-checked elicitation question (or all of them).
   *
   * @param {string} machineDir
   * @param {Object} [options]
   * @param {boolean} [options.all] - Return every open question
   * @returns {Promise<{success: boolean, question?: Object|null, questions?: Object[], error?: string}>}
   */
  async getQuestions(machineDir, options = {}) {
    const bin = this._polynvBin()
    if (!bin) return { success: false, error: 'polynv not found in the Polygraph checkout' }
    const args = [bin, 'questions', '--artifacts', machineDir, '--json']
    if (!options.all) args.push('--next')
    const { code, stdout, stderr } = await this._run(process.execPath, args)
    if (code !== 0) return { success: false, error: `${stdout}${stderr}`.trim() }
    try {
      const parsed = JSON.parse(stdout)
      return options.all
        ? { success: true, questions: Array.isArray(parsed) ? parsed : [parsed] }
        : { success: true, question: Array.isArray(parsed) ? (parsed[0] ?? null) : parsed }
    } catch {
      // No open questions renders as prose, not JSON
      return options.all
        ? { success: true, questions: [] }
        : { success: true, question: null }
    }
  }

  /**
   * Record a disposition for one elicitation question (append-only ledger).
   *
   * @param {string} machineDir
   * @param {Object} params
   * @param {string} params.id - Question/record id
   * @param {'confirm'|'reject'|'abandon'|'defer'|'modify'} params.disposition
   * @param {string} params.author - Attributed human author
   * @param {string} [params.concern] - Why (recorded on the ledger)
   * @param {string} [params.js] - Revised predicate (modify only)
   * @returns {Promise<{success: boolean, output?: string, error?: string}>}
   */
  async recordDisposition(machineDir, { id, disposition, author, concern, js } = {}) {
    const bin = this._polynvBin()
    if (!bin) return { success: false, error: 'polynv not found in the Polygraph checkout' }
    const validDispositions = ['confirm', 'reject', 'abandon', 'defer', 'modify']
    if (!id || !validDispositions.includes(disposition) || !author) {
      return { success: false, error: 'id, a valid disposition, and author are required' }
    }
    const args = [bin, 'record', '--artifacts', machineDir,
      '--id', id, '--disposition', disposition, '--author', author]
    if (concern) args.push('--concern', concern)
    if (js) args.push('--js', js)
    const { code, stdout, stderr } = await this._run(process.execPath, args)
    return { success: code === 0, output: `${stdout}${stderr}`.trim() }
  }

  /**
   * Elicitation convergence report for a machine (polynv report --json).
   *
   * @param {string} machineDir
   * @returns {Promise<{success: boolean, report?: Object, error?: string}>}
   */
  async getElicitationReport(machineDir) {
    const bin = this._polynvBin()
    if (!bin) return { success: false, error: 'polynv not found in the Polygraph checkout' }
    // NOTE: report's exit code is a convergence gate (PARTIAL → nonzero),
    // not an error signal — parse the JSON regardless.
    const { stdout, stderr } = await this._run(process.execPath,
      [bin, 'report', '--artifacts', machineDir, '--json'])
    try {
      return { success: true, report: JSON.parse(stdout) }
    } catch {
      const text = `${stdout}${stderr}`.trim()
      // An empty/absent ledger renders as prose — report that as "no ledger"
      return text.includes('Error')
        ? { success: false, error: text }
        : { success: true, report: null }
    }
  }

  /**
   * @private
   * Locate the polyvers CLI inside the Polygraph checkout.
   */
  _polyversBin() {
    const polygraphDir = this.resolvePolygraphDir()
    if (!polygraphDir) return null
    const bin = path.join(polygraphDir, 'polyvers', 'bin', 'polyvers.mjs')
    return fs.existsSync(bin) ? bin : null
  }

  /**
   * @private
   * Extract the git baseline of a machine artifact dir into
   * .puffin/polyvers-baseline/<machineKey>/ — INSIDE the project, so the
   * baseline module can still resolve its npm dependencies.
   *
   * @returns {Promise<{found: boolean, dir?: string, files?: string[], error?: string}>}
   */
  async _extractBaseline(machineDir, ref) {
    if (!this.projectPath) return { found: false, error: 'No active project' }
    const relDir = path.relative(this.projectPath, machineDir).split(path.sep).join('/')
    if (relDir.startsWith('..')) return { found: false, error: 'Machine outside the project' }

    const ls = await this._run('git',
      ['-C', this.projectPath, 'ls-tree', '--name-only', ref, '--', `${relDir}/`])
    if (ls.code !== 0) return { found: false, error: ls.stderr.trim() || 'git ls-tree failed' }

    const ARTIFACT_FILES = ['contract.json', 'next.cjs', 'machine.cjs', 'next.js',
      'reference.js', 'invariants.mjs', 'effects.cjs', 'effects.manifest.json', 'migrate.cjs']
    const present = ls.stdout.split('\n').map(l => l.trim()).filter(Boolean)
      .map(p => p.split('/').pop())
      .filter(name => ARTIFACT_FILES.includes(name))

    if (!present.includes('contract.json')) {
      return { found: false } // new machine — no baseline to gate against
    }

    const machineKey = relDir.split('/').join('__')
    const baseDir = path.join(this.projectPath, '.puffin', 'polyvers-baseline', machineKey)
    fs.rmSync(baseDir, { recursive: true, force: true })
    fs.mkdirSync(baseDir, { recursive: true })

    for (const name of present) {
      const show = await this._run('git',
        ['-C', this.projectPath, 'show', `${ref}:${relDir}/${name}`])
      if (show.code !== 0) return { found: false, error: show.stderr.trim() }
      fs.writeFileSync(path.join(baseDir, name), show.stdout)
    }
    return { found: true, dir: baseDir, files: present }
  }

  /**
   * Evolution gate: compare the working machine against its git baseline
   * with polyvers (classify + the gates its lanes require).
   *
   * @param {string} machineDir
   * @param {Object} [options]
   * @param {string} [options.ref='HEAD'] - Git ref for the baseline
   * @param {string} [options.snapshotsPath] - Live fleet snapshots (preferred
   *   over the synthesized corpus, which is the weakest tier)
   * @returns {Promise<Object>} { success, baseline, report?, error? }
   */
  async evolutionGate(machineDir, options = {}) {
    const bin = this._polyversBin()
    if (!bin) return { success: false, error: 'polyvers not found in the Polygraph checkout' }
    const ref = options.ref || 'HEAD'

    const baseline = await this._extractBaseline(machineDir, ref)
    if (baseline.error) return { success: false, error: baseline.error }
    if (!baseline.found) {
      return { success: true, baseline: 'none', ref, verdict: 'NEW' }
    }

    try {
      const args = [bin, 'check', '--old', baseline.dir, '--new', machineDir, '--json']
      if (options.snapshotsPath) args.push('--snapshots', options.snapshotsPath)
      else args.push('--synthesize')

      const { stdout, stderr } = await this._run(process.execPath, args)
      try {
        const report = JSON.parse(stdout)
        return { success: true, baseline: 'git', ref, report }
      } catch {
        return { success: false, error: `${stdout}${stderr}`.trim() }
      }
    } finally {
      fs.rmSync(baseline.dir, { recursive: true, force: true })
    }
  }

  /**
   * Scaffold a migrate.cjs in the machine dir from the shape diff against
   * the git baseline (polyvers migrate scaffold).
   *
   * @param {string} machineDir
   * @param {Object} [options]
   * @param {string} [options.ref='HEAD']
   * @returns {Promise<{success: boolean, output?: string, error?: string}>}
   */
  async scaffoldMigration(machineDir, options = {}) {
    const bin = this._polyversBin()
    if (!bin) return { success: false, error: 'polyvers not found in the Polygraph checkout' }

    const baseline = await this._extractBaseline(machineDir, options.ref || 'HEAD')
    if (baseline.error || !baseline.found) {
      return { success: false, error: baseline.error || 'No baseline to scaffold from' }
    }
    try {
      const { code, stdout, stderr } = await this._run(process.execPath,
        [bin, 'migrate', 'scaffold', '--old', baseline.dir, '--new', machineDir])
      return { success: code === 0, output: `${stdout}${stderr}`.trim() }
    } finally {
      fs.rmSync(baseline.dir, { recursive: true, force: true })
    }
  }

  /**
   * Read a rendered diagram's SVG markup for inline display.
   *
   * Only files produced by renderDiagrams are readable: the path must be an
   * .svg inside the active project (or inside a machine's .polyviz-out
   * fallback dir when no project is set).
   *
   * @param {string} svgPath - Absolute path returned by renderDiagrams
   * @returns {{success: boolean, svg?: string, error?: string}}
   */
  readDiagram(svgPath) {
    if (typeof svgPath !== 'string' || !svgPath.toLowerCase().endsWith('.svg')) {
      return { success: false, error: 'Not an SVG path' }
    }
    if (!this.projectPath) {
      return { success: false, error: 'No active project' }
    }

    try {
      // realpath both sides so symlinks cannot escape the project root
      const realRoot = fs.realpathSync(path.resolve(this.projectPath))
      const real = fs.realpathSync(path.resolve(svgPath))
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
        return { success: false, error: 'Path outside the project' }
      }
      return { success: true, svg: fs.readFileSync(real, 'utf-8') }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * @private
   * Count invariant violations from checker output.
   */
  _countViolations(output) {
    const match = output.match(/(\d+) invariant violation/)
    return match ? Number(match[1]) : 0
  }

  /**
   * @private
   * Run a child process, capturing output.
   */
  _run(cmd, args) {
    return new Promise((resolve) => {
      // ELECTRON_RUN_AS_NODE: inside Electron's main process,
      // process.execPath is electron.exe — without this flag the engine
      // scripts would launch as a second Electron GUI instance and hang.
      const proc = spawn(cmd, args, {
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      })
      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', d => { stdout += d })
      proc.stderr.on('data', d => { stderr += d })
      proc.on('error', err => resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}` }))
      proc.on('close', code => resolve({ code, stdout, stderr }))
    })
  }
}

module.exports = { PolygraphService }
