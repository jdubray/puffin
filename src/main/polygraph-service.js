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
  }

  /**
   * Resolve the Polygraph checkout directory.
   * Order: explicit option > POLYGRAPH_DIR env > sibling of the project >
   * sibling of the Puffin repo.
   *
   * @returns {string|null} Absolute path, or null when no checkout found
   */
  resolvePolygraphDir() {
    const candidates = [
      this._polygraphDir,
      process.env.POLYGRAPH_DIR,
      this.projectPath ? path.resolve(this.projectPath, '..', 'polygraph') : null,
      path.resolve(__dirname, '..', '..', '..', 'polygraph')
    ].filter(Boolean)

    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, 'scripts', 'check.mjs'))) {
        return dir
      }
    }
    return null
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

    const outDir = options.outDir || (this.projectPath
      ? path.join(this.projectPath, '.puffin', 'polyviz', path.basename(machineDir))
      : path.join(machineDir, '.polyviz-out'))
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
      const proc = spawn(cmd, args, { windowsHide: true })
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
