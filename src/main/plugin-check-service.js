/**
 * Claude Code plugin availability.
 *
 * Puffin's workflow leans on the Polygraph plugin: polygen authors machines,
 * polynv elicits invariants, polyvers gates a version change. Those arrive as
 * agents and slash commands contributed by a plugin — and plugins install at
 * **user** level (`~/.claude/plugins/`, enabled in `~/.claude/settings.json`),
 * not per project. So the question "is it installed?" has one answer for the
 * whole machine, and a project that looks broken usually isn't.
 *
 * Without the plugin a session simply has no `polygraph:polygen` to call and
 * fails with nothing to point at, which is the kind of silence this module
 * exists to break.
 *
 * @module plugin-check-service
 */

const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

/** Plugins Puffin's workflow depends on, and what each one is for. */
const REQUIRED_PLUGINS = [
  {
    name: 'polygraph',
    required: true,
    purpose: 'authoring and verifying state machines (polygen, polynv, polyvers)'
  },
  {
    name: 'polyviz',
    required: false,
    purpose: 'rendering machine diagrams'
  }
]

const INSTALL_TIMEOUT_MS = 120000

/** Read a JSON file, or null when it isn't there / isn't JSON. @private */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

class PluginCheckService {
  /**
   * @param {Object} [options]
   * @param {string} [options.claudeHome] - Override ~/.claude (tests)
   * @param {Function} [options.runCommand] - Override the spawner (tests)
   */
  constructor({ claudeHome, runCommand } = {}) {
    this.claudeHome = claudeHome || path.join(os.homedir(), '.claude')
    this._run = runCommand || this._spawn.bind(this)
  }

  /** @private */
  _spawn(cmd, args, { timeoutMs = INSTALL_TIMEOUT_MS } = {}) {
    return new Promise(resolve => {
      let proc
      try {
        proc = spawn(cmd, args, { windowsHide: true, env: { ...process.env } })
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

  /**
   * What's installed and switched on, for each plugin Puffin depends on.
   *
   * Installed and enabled are separate facts: a disabled plugin is present on
   * disk and contributes nothing, which looks identical to missing from where a
   * session stands. They are reported apart so the advice can differ — enabling
   * is a one-liner, installing is a download.
   *
   * @returns {{plugins: Array<{name, required, purpose, installed, enabled, marketplace: string|null}>, satisfied: boolean, missingRequired: string[]}}
   */
  getStatus() {
    const settings = readJson(path.join(this.claudeHome, 'settings.json')) || {}
    const enabledMap = settings.enabledPlugins || {}
    const installed = readJson(path.join(this.claudeHome, 'plugins', 'installed_plugins.json'))
    const installedKeys = Object.keys(installed?.plugins || {})

    const plugins = REQUIRED_PLUGINS.map(spec => {
      // Keys are `plugin@marketplace`; the marketplace name is the user's, so
      // match on the plugin half rather than assuming ours.
      const installedKey = installedKeys.find(k => k.split('@')[0] === spec.name)
      const enabledKey = Object.keys(enabledMap).find(k => k.split('@')[0] === spec.name)
      return {
        ...spec,
        installed: !!installedKey,
        enabled: !!(enabledKey && enabledMap[enabledKey]),
        marketplace: (installedKey || enabledKey)?.split('@')[1] || null
      }
    })

    const missingRequired = plugins
      .filter(p => p.required && !(p.installed && p.enabled))
      .map(p => p.name)

    return { plugins, satisfied: missingRequired.length === 0, missingRequired }
  }

  /**
   * The marketplace to install from.
   *
   * A local Polygraph checkout is preferred over the remote: it is the same
   * source the engines already run from, it works offline, and it cannot drift
   * from the CLI engines Puffin spawns. The git URL is the fallback for a
   * machine with no checkout.
   *
   * @param {string|null} polygraphDir
   * @returns {{source: string, kind: 'local'|'remote'}}
   */
  resolveMarketplace(polygraphDir) {
    if (polygraphDir && fs.existsSync(path.join(polygraphDir, '.claude-plugin', 'marketplace.json'))) {
      return { source: polygraphDir, kind: 'local' }
    }
    return { source: 'https://github.com/cognitive-fab/polygraph.git', kind: 'remote' }
  }

  /**
   * Install (and enable) the plugins Puffin needs.
   *
   * Each step's output is returned, because `claude plugin` failures are
   * informative and swallowing them would leave the user with "install failed"
   * and nowhere to go.
   *
   * @param {Object} [options]
   * @param {string} [options.polygraphDir] - A local checkout to install from
   * @returns {Promise<{success: boolean, steps: Array<{cmd: string, code: number, output: string}>, error?: string}>}
   */
  async install({ polygraphDir = null } = {}) {
    const steps = []
    const marketplace = this.resolveMarketplace(polygraphDir)

    const record = async (args) => {
      const result = await this._run('claude', args)
      steps.push({
        cmd: `claude ${args.join(' ')}`,
        code: result.code,
        output: `${result.stdout}${result.stderr}`.trim()
      })
      return result
    }

    // Adding a marketplace that is already known is not an error worth
    // stopping for — the install below is what matters.
    await record(['plugin', 'marketplace', 'add', marketplace.source])

    for (const spec of REQUIRED_PLUGINS) {
      const result = await record(['plugin', 'install', spec.name, '--scope', 'user', '--yes'])
      if (result.code !== 0 && spec.required) {
        return {
          success: false,
          steps,
          error: `could not install ${spec.name}: ${(result.stderr || result.stdout || '').trim().slice(0, 400)}`
        }
      }
      // Installing does not always enable; enabling twice is harmless.
      await record(['plugin', 'enable', spec.name])
    }

    const status = this.getStatus()
    return status.satisfied
      ? { success: true, steps }
      : {
          success: false,
          steps,
          error: `still missing after install: ${status.missingRequired.join(', ')}`
        }
  }
}

module.exports = { PluginCheckService, REQUIRED_PLUGINS }
