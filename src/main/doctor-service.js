/**
 * Doctor — one place that answers "why isn't this working?"
 *
 * Puffin's integrations fail quietly and in different places: the GLM server is
 * down, its MCP endpoint 404s because the server predates it, the Polygraph
 * checkout moved, bun isn't on PATH, polyrun can't open `node:sqlite`. Each
 * surface reports its own corner, so diagnosing meant visiting three tabs and
 * knowing which corner to look in.
 *
 * Every check answers the same shape — what was tested, what happened, and what
 * to do about it — and a check that cannot run says `skip` rather than
 * inventing a verdict. `claude doctor` is included as one section; it owns the
 * CLI installation, this owns everything Puffin wired around it.
 *
 * @module doctor-service
 */

const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { readGlmConfig } = require('./glm-client')
const { PluginCheckService } = require('./plugin-check-service')
const { detectProjectLanguage } = require('./project-language')

const PROBE_TIMEOUT_MS = 8000

/**
 * One check's result.
 *
 * @typedef {Object} Check
 * @property {string} id
 * @property {string} group - Section the check belongs to
 * @property {string} label - What was tested
 * @property {'ok'|'warn'|'fail'|'skip'} status
 * @property {string} detail - What happened
 * @property {string} [fix] - What to do when it isn't ok
 */

/** Run a command and capture its output; never throws. @private */
function run(cmd, args, { timeoutMs = PROBE_TIMEOUT_MS, cwd } = {}) {
  return new Promise(resolve => {
    let proc
    try {
      proc = spawn(cmd, args, {
        cwd,
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      })
    } catch (error) {
      return resolve({ code: -1, stdout: '', stderr: error.message })
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      try { proc.kill() } catch { /* already gone */ }
      resolve({ code: -1, stdout, stderr: `timed out after ${timeoutMs}ms` })
    }, timeoutMs)
    proc.stdout?.on('data', d => { stdout += d.toString() })
    proc.stderr?.on('data', d => { stderr += d.toString() })
    proc.on('error', error => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: error.message })
    })
    proc.on('close', code => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

/** A bounded HTTP probe that reports rather than throws. @private */
async function probe(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const text = await response.text().catch(() => '')
    return { ok: response.ok, status: response.status, text }
  } catch (error) {
    return { ok: false, status: 0, error: error.name === 'AbortError' ? 'timed out' : error.message }
  } finally {
    clearTimeout(timer)
  }
}

class DoctorService {
  /**
   * @param {Object} deps - The services already wired in main; the doctor
   *   reports on what the app will actually use, not on a fresh resolution.
   */
  constructor({
    projectPath = null, polygraphService = null, boardRuntime = null,
    runCommand = run, probeUrl = probe, pluginCheckService = null
  } = {}) {
    this.projectPath = projectPath
    this.polygraphService = polygraphService
    this.boardRuntime = boardRuntime
    // Spawning and probing are injectable so tests don't shell out to the real
    // CLI or reach the network — the report's shape is what they check.
    this._run = runCommand
    this._probe = probeUrl
    this.pluginCheckService = pluginCheckService || new PluginCheckService()
  }

  setProjectPath(projectPath) {
    this.projectPath = projectPath
  }

  /**
   * Run every check. Groups run concurrently; a group that throws becomes one
   * failed check rather than taking the report down with it.
   *
   * @returns {Promise<{checks: Check[], summary: {ok: number, warn: number, fail: number, skip: number}}>}
   */
  async run() {
    const groups = await Promise.all([
      this._safe('Claude CLI', () => this.checkClaude()),
      this._safe('GLM', () => this.checkGlm()),
      this._safe('Polygraph', () => this.checkPolygraph()),
      this._safe('Plugins', () => this.checkPlugins()),
      this._safe('Workflow', () => this.checkBoard()),
      this._safe('Project', () => this.checkProject())
    ])

    const checks = groups.flat()
    const summary = { ok: 0, warn: 0, fail: 0, skip: 0 }
    for (const check of checks) summary[check.status] = (summary[check.status] || 0) + 1
    return { checks, summary }
  }

  /** @private */
  async _safe(group, fn) {
    try {
      return await fn()
    } catch (error) {
      return [{
        id: `${group.toLowerCase()}:error`,
        group,
        label: `${group} checks`,
        status: 'fail',
        detail: error.message,
        fix: 'This is a bug in the doctor itself — the check threw instead of reporting.'
      }]
    }
  }

  /** The CLI Puffin spawns: present, healthy, and new enough for --effort. */
  async checkClaude() {
    const checks = []

    const version = await this._run('claude', ['--version'])
    const versionText = `${version.stdout}${version.stderr}`.trim()
    checks.push({
      id: 'claude:present',
      group: 'Claude CLI',
      label: 'claude on PATH',
      status: version.code === 0 ? 'ok' : 'fail',
      detail: version.code === 0 ? versionText : (versionText || 'could not run `claude --version`'),
      fix: version.code === 0 ? undefined : 'Install Claude Code and make sure `claude` resolves on PATH.'
    })

    if (version.code !== 0) {
      checks.push({
        id: 'claude:effort',
        group: 'Claude CLI',
        label: '--effort supported',
        status: 'skip',
        detail: 'skipped — the CLI did not run'
      })
      return checks
    }

    const help = await this._run('claude', ['--help'])
    const helpText = `${help.stdout}${help.stderr}`
    const hasEffort = /--effort\s+<level>/.test(helpText)
    checks.push({
      id: 'claude:effort',
      group: 'Claude CLI',
      label: '--effort supported',
      status: hasEffort ? 'ok' : 'warn',
      detail: hasEffort
        ? 'the Effort selector reaches the CLI'
        : 'this CLI has no --effort flag; the selector will be ignored',
      fix: hasEffort ? undefined : 'Update Claude Code, or leave Effort on Default.'
    })

    const doctor = await this._run('claude', ['doctor'], { cwd: this.projectPath || undefined })
    const doctorText = `${doctor.stdout}${doctor.stderr}`.trim()
    checks.push({
      id: 'claude:doctor',
      group: 'Claude CLI',
      label: 'claude doctor',
      status: doctor.code === 0 ? 'ok' : 'warn',
      detail: doctorText || 'no output',
      fix: doctor.code === 0
        ? undefined
        : 'Run `/doctor` inside a Claude Code session — it can fix what it finds.'
    })

    checks.push(this._checkWorkspaceTrust())

    return checks
  }

  /**
   * Has this project been trusted by the Claude CLI?
   *
   * An untrusted workspace does not refuse politely: the CLI exits with a
   * Windows crash code and a line about ignoring permission entries, which
   * reaches the board as "the session did not finish" - the same message a
   * busy process and a real crash produce, and the only one of the three that
   * is fixed by a config line rather than by trying again.
   *
   * Read-only, and it reads the CLI's own config because that is where the
   * answer is; Puffin cannot grant trust on the user's behalf and does not try.
   * @private
   */
  _checkWorkspaceTrust() {
    const base = {
      id: 'claude:trust',
      group: 'Claude CLI',
      label: 'this project is trusted by the CLI'
    }
    if (!this.projectPath) {
      return { ...base, status: 'skip', detail: 'skipped: no project open' }
    }

    const configPath = path.join(os.homedir(), '.claude.json')
    let config
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch {
      // Absent or unreadable is not untrusted - a fresh install has no file
      // yet - so this reports that it could not tell, which is what it means.
      return {
        ...base,
        status: 'skip',
        detail: `skipped: could not read ${configPath}`
      }
    }

    const key = this.projectPath.split(path.sep).join('/')
    const entry = config.projects?.[key] || config.projects?.[this.projectPath]
    if (entry?.hasTrustDialogAccepted === true) {
      return { ...base, status: 'ok', detail: 'trusted' }
    }

    return {
      ...base,
      status: 'fail',
      detail: 'not trusted — sessions started here exit before doing anything, ' +
        'reporting only that they did not finish',
      fix: `Run \`claude\` once inside ${this.projectPath} and accept the trust ` +
        `dialog, or set projects["${key}"].hasTrustDialogAccepted to true in ${configPath}.`
    }
  }

  /** The GLM server, its MCP endpoint, and how sessions are wired to it. */
  async checkGlm() {
    const checks = []
    const config = readGlmConfig()
    const configPath = path.join(os.homedir(), '.glm', 'config.json')

    checks.push({
      id: 'glm:config',
      group: 'GLM',
      label: 'solo-mode config',
      status: config.token ? 'ok' : 'warn',
      detail: config.token
        ? `${configPath} — port ${config.port}`
        : `no token in ${configPath}`,
      fix: config.token ? undefined : 'Start GLM in solo mode; it writes the port and token there.'
    })

    const health = await this._probe(`http://127.0.0.1:${config.port}/api/v1/health`)
    const reachable = health.ok
    checks.push({
      id: 'glm:server',
      group: 'GLM',
      label: 'server reachable',
      status: reachable ? 'ok' : 'fail',
      detail: reachable
        ? `http://127.0.0.1:${config.port} — ${health.text.slice(0, 120)}`
        : `no answer on port ${config.port}${health.error ? ` (${health.error})` : ''}`,
      fix: reachable ? undefined : 'Start the GLM server; the supervisor restarts it after a kill.'
    })

    if (!reachable) {
      checks.push({
        id: 'glm:mcp',
        group: 'GLM',
        label: 'MCP endpoint (/mcp)',
        status: 'skip',
        detail: 'skipped — the server did not answer'
      })
      return checks
    }

    // A 401 is a healthy answer here: the endpoint exists and refused an
    // unauthenticated caller. A 404 means the server predates /mcp.
    const mcp = await this._probe(`http://127.0.0.1:${config.port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
    const exists = mcp.status !== 0 && mcp.status !== 404
    checks.push({
      id: 'glm:mcp',
      group: 'GLM',
      label: 'MCP endpoint (/mcp)',
      status: exists ? 'ok' : 'fail',
      detail: exists
        ? `answers (HTTP ${mcp.status})`
        : 'HTTP 404 — this server does not serve MCP over HTTP',
      fix: exists ? undefined : 'Restart the GLM server so it picks up the /mcp route.'
    })

    return checks
  }

  /** The Polygraph checkout and the engines Puffin drives. */
  async checkPolygraph() {
    if (!this.polygraphService) {
      return [{
        id: 'polygraph:service',
        group: 'Polygraph',
        label: 'engines',
        status: 'skip',
        detail: 'skipped — the service is not wired in this process'
      }]
    }

    const dir = this.polygraphService.resolvePolygraphDir?.()
    const checks = [{
      id: 'polygraph:checkout',
      group: 'Polygraph',
      label: 'checkout',
      status: dir ? 'ok' : 'warn',
      detail: dir || 'no Polygraph checkout found',
      fix: dir ? undefined : 'Clone Polygraph beside this project, or set the engines path in Config.'
    }]

    if (!dir) return checks

    // The CLI engines Puffin spawns directly.
    for (const [engine, rel] of [
      ['verify', path.join('scripts', 'check.mjs')],
      ['polynv', path.join('polynv', 'bin', 'polynv.mjs')],
      ['polyvers', path.join('polyvers', 'bin', 'polyvers.mjs')],
      ['polyviz', path.join('polyviz', 'bin', 'polyviz.mjs')]
    ]) {
      const bin = path.join(dir, rel)
      const present = fs.existsSync(bin)
      checks.push({
        id: `polygraph:${engine}`,
        group: 'Polygraph',
        label: engine,
        status: present ? 'ok' : 'warn',
        detail: present ? bin : `not found at ${rel}`,
        fix: present ? undefined : `This checkout has no ${engine}; update it to use that engine.`
      })
    }

    // polygen has no binary — it is an agent a session invokes, so what matters
    // is whether this checkout ships it for Claude Code to find.
    const polygenAgent = fs.existsSync(path.join(dir, 'agents', 'polygen.md'))
    checks.push({
      id: 'polygraph:polygen',
      group: 'Polygraph',
      label: 'polygen agent',
      status: polygenAgent ? 'ok' : 'warn',
      detail: polygenAgent
        ? 'available to sessions as /polygraph:polygen'
        : 'no agents/polygen.md in this checkout',
      fix: polygenAgent ? undefined : 'Update the Polygraph checkout to author machines from a session.'
    })

    if (this.projectPath) {
      const discovered = this.polygraphService.discoverMachines?.(this.projectPath) || []
      const machines = discovered.machines || discovered
      checks.push({
        id: 'polygraph:machines',
        group: 'Polygraph',
        label: 'machines in this project',
        status: 'ok',
        detail: Array.isArray(machines) && machines.length
          ? `${machines.length} found`
          : 'none — this project has no Polygraph artifacts yet'
      })
    }

    return checks
  }

  /**
   * The Claude Code plugins the workflow depends on.
   *
   * Installed and enabled are reported apart: a disabled plugin is on disk and
   * contributes nothing, which from a session's point of view is identical to
   * missing — but enabling it is a one-liner and installing is a download.
   */
  async checkPlugins() {
    const status = this.pluginCheckService.getStatus()
    return status.plugins.map(plugin => {
      const state = plugin.installed
        ? (plugin.enabled ? 'ok' : 'warn')
        : (plugin.required ? 'fail' : 'warn')
      return {
        id: `plugin:${plugin.name}`,
        group: 'Plugins',
        label: `${plugin.name} plugin`,
        status: state,
        detail: plugin.installed
          ? (plugin.enabled
              ? `enabled${plugin.marketplace ? ` (${plugin.marketplace})` : ''} — ${plugin.purpose}`
              : 'installed but disabled — sessions cannot see it')
          : `not installed — ${plugin.purpose}`,
        fix: state === 'ok'
          ? undefined
          : (plugin.installed
              ? `Run: claude plugin enable ${plugin.name}`
              : `Use the install prompt in Config, or run: claude plugin install ${plugin.name}`)
      }
    })
  }

  /** polyrun and the runtime the board depends on. */
  async checkBoard() {
    const nodeMajor = Number(process.versions.node.split('.')[0])
    const checks = [{
      id: 'board:sqlite',
      group: 'Workflow',
      label: 'node:sqlite available',
      status: nodeMajor >= 22 ? 'ok' : 'fail',
      detail: `node ${process.versions.node}`,
      fix: nodeMajor >= 22 ? undefined : 'polyrun stores cards in node:sqlite, which needs Node 22+.'
    }]

    if (!this.boardRuntime?.getStatus) {
      checks.push({
        id: 'board:runtime',
        group: 'Workflow',
        label: 'board runtime',
        status: 'skip',
        detail: 'skipped — the runtime is not wired in this process'
      })
      return checks
    }

    const status = await this.boardRuntime.getStatus()
    const usable = !!(status.hasPolyrun && status.hasNode && status.hasConfig)
    checks.push({
      id: 'board:runtime',
      group: 'Workflow',
      label: 'board runtime',
      status: usable ? (status.running ? 'ok' : 'warn') : 'fail',
      detail: usable
        ? (status.running ? 'running' : 'ready, not started')
        : [
            status.hasPolyrun ? null : 'polyrun missing',
            status.hasNode ? null : 'node missing',
            status.hasConfig ? null : 'no task-card config'
          ].filter(Boolean).join(', '),
      fix: usable ? undefined : 'Open the Workflow tab — it starts the runtime and reports what it needs.'
    })

    return checks
  }

  /** The project's own state directory and the surfaces that read it. */
  async checkProject() {
    if (!this.projectPath) {
      return [{
        id: 'project:open',
        group: 'Project',
        label: 'project open',
        status: 'warn',
        detail: 'no project is open',
        fix: 'Open a project folder.'
      }]
    }

    const checks = []
    const puffinDir = path.join(this.projectPath, '.puffin')
    let writable = false
    try {
      fs.mkdirSync(puffinDir, { recursive: true })
      fs.accessSync(puffinDir, fs.constants.W_OK)
      writable = true
    } catch { /* reported below */ }

    checks.push({
      id: 'project:state',
      group: 'Project',
      label: '.puffin writable',
      status: writable ? 'ok' : 'fail',
      detail: writable ? puffinDir : `cannot write to ${puffinDir}`,
      fix: writable ? undefined : 'Check the folder permissions — Puffin keeps project state there.'
    })

    // Which build lane this project is in. polygen emits JavaScript, so on a
    // Python or Go project it is not broken — it is not applicable, and the
    // acceptance-verifier lane carries the work instead.
    const lang = detectProjectLanguage(this.projectPath)
    checks.push({
      id: 'project:language',
      group: 'Project',
      label: 'polygen applicable',
      status: lang.polygenApplicable ? 'ok' : 'skip',
      detail: lang.language
        ? (lang.polygenApplicable
            ? `${lang.language} (${lang.evidence}) — machines can be generated`
            : `not applicable — this is a ${lang.language} project (${lang.evidence}) and polygen emits JavaScript; machines are authored by hand here, and the model checker still applies`)
        : 'not applicable — no build file recognised, so polygen is not offered',
      fix: lang.polygenApplicable
        ? undefined
        : 'Not a fault: implement through the acceptance-verifier lane, and hand-author any state machine.'
    })

    const docsDir = path.join(this.projectPath, 'docs')
    const hasDocs = fs.existsSync(docsDir)
    checks.push({
      id: 'project:docs',
      group: 'Project',
      label: 'docs/ present',
      status: hasDocs ? 'ok' : 'warn',
      detail: hasDocs ? docsDir : 'no docs/ directory',
      fix: hasDocs ? undefined : 'The Docs view reads docs/; create it or write a document from that tab.'
    })

    return checks
  }
}

module.exports = { DoctorService }
