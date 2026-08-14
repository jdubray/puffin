/**
 * GLM session integration — wires spawned Claude Code sessions to GLM.
 *
 * Two artifacts, both non-fatal when GLM is absent:
 *   1. An `--mcp-config` registering the `glm` MCP server. GLM now serves MCP
 *      over Streamable HTTP at `/mcp` on the same always-on server Puffin
 *      already talks REST to, so the config points there and carries the
 *      solo-mode bearer token. The stdio subprocess (bun + a checkout) is the
 *      fallback for machines where the server isn't configured, and stays
 *      supported upstream for debugging the MCP layer.
 *   2. `.claude/commands/glm-*.md` — the /glm-* slash commands
 *      (/glm-ready = DoRC gate, /glm-build = generate→verify→attest
 *      orchestration), copied from the GLM checkout's source of truth.
 *
 * The MCP config holds a live credential, so it is written under the OS temp
 * dir rather than into `.puffin/` — a token inside the project tree is one
 * `git add -A` away from being published, and not every project gitignores
 * `.puffin/`. The URL and token are resolved and inlined here rather than left
 * as `${GLM_URL}` / `${GLM_SOLO_TOKEN}` references: Puffin knows both values,
 * and inlining them means the config does not depend on the client expanding
 * environment-variable syntax.
 *
 * @module glm-integration
 */

const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { readGlmConfig } = require('./glm-client')

/**
 * Resolve the GLM checkout directory.
 * Order: explicit config > sibling of the project > sibling of the Puffin repo.
 *
 * Only needed for the /glm-* commands and the stdio fallback — the HTTP
 * transport works with no checkout at all.
 *
 * @param {string|null} projectPath
 * @param {string|null} configuredDir - config.glmDir (absolute or project-relative)
 * @returns {string|null}
 */
function resolveGlmDir(projectPath, configuredDir) {
  const candidates = []
  if (configuredDir && typeof configuredDir === 'string' && configuredDir.trim()) {
    const raw = configuredDir.trim()
    if (path.isAbsolute(raw)) candidates.push(raw)
    else if (projectPath) candidates.push(path.resolve(projectPath, raw))
  }
  if (projectPath) candidates.push(path.resolve(projectPath, '..', 'glm'))
  candidates.push(path.resolve(__dirname, '..', '..', '..', 'glm'))

  return candidates.find(dir =>
    fs.existsSync(path.join(dir, 'integrations', 'mcp', 'src', 'bin', 'glm-mcp.ts'))
  ) ?? null
}

/**
 * Where the /glm-* command markdown lives in a GLM checkout.
 * `plugin/commands` is the source of truth since GLM shipped as a Claude Code
 * plugin; `integrations/mcp/commands` is the pre-plugin location.
 *
 * @param {string} glmDir
 * @returns {string|null}
 * @private
 */
function resolveCommandsDir(glmDir) {
  return [
    path.join(glmDir, 'plugin', 'commands'),
    path.join(glmDir, 'integrations', 'mcp', 'commands')
  ].find(dir => fs.existsSync(dir)) ?? null
}

/**
 * Per-project path for the generated MCP config. Outside the project tree
 * because the file carries a bearer token; keyed by project so two open
 * projects never trample each other's config.
 *
 * @param {string} projectPath
 * @returns {string}
 * @private
 */
function mcpConfigPathFor(projectPath) {
  const key = crypto.createHash('sha1').update(path.resolve(projectPath)).digest('hex').slice(0, 12)
  return path.join(os.tmpdir(), `puffin-glm-mcp-${key}.json`)
}

/**
 * Write the project's GLM MCP config and install the /glm-* commands.
 * Idempotent; returns what was set up.
 *
 * @param {Object} params
 * @param {string} params.projectPath
 * @param {string} [params.configuredDir] - config.glmDir
 * @param {string} [params.workspace] - The project's bound workspace (id or slug).
 *   The HTTP endpoint takes its default workspace from `?workspace=`; without
 *   it the tools resolve an empty id and every call 404s on `/workspaces//…`.
 *   One project ↔ one sekkei, so the binding is the right default — falling
 *   back to ~/.glm's global `workspace` only when the project isn't bound.
 * @param {string} [params.glmConfigPath] - Override for ~/.glm/config.json (tests)
 * @returns {{glmDir: string|null, mcpConfigPath: string|null, transport: string|null, workspace: string|null, commands: string[]}}
 */
function setupGlmSessionIntegration({ projectPath, configuredDir, workspace, glmConfigPath } = {}) {
  const result = {
    glmDir: null, mcpConfigPath: null, transport: null, workspace: null, commands: []
  }
  if (!projectPath) return result

  const glmDir = resolveGlmDir(projectPath, configuredDir)
  result.glmDir = glmDir

  // 1. MCP config — HTTP against the always-on server, stdio only as fallback
  const config = readGlmConfig(glmConfigPath)
  const { port, token } = config
  const activeWorkspace = (workspace || config.workspace || '').trim() || null
  result.workspace = activeWorkspace

  let mcpServer = null
  if (token) {
    const query = activeWorkspace ? `?workspace=${encodeURIComponent(activeWorkspace)}` : ''
    mcpServer = {
      type: 'http',
      url: `http://127.0.0.1:${port}/mcp${query}`,
      headers: { Authorization: `Bearer ${token}` }
    }
    result.transport = 'http'
  } else if (glmDir) {
    // No token means solo mode isn't configured; the stdio server reads
    // ~/.glm itself and fails just as loudly, but needs no header.
    mcpServer = {
      command: 'bun',
      args: ['run', path.join(glmDir, 'integrations', 'mcp', 'src', 'bin', 'glm-mcp.ts')]
    }
    result.transport = 'stdio'
  }

  if (mcpServer) {
    try {
      const mcpConfigPath = mcpConfigPathFor(projectPath)
      const serialized = JSON.stringify({ mcpServers: { glm: mcpServer } }, null, 2)
      let current = null
      try { current = fs.readFileSync(mcpConfigPath, 'utf-8') } catch { /* first run */ }
      if (current !== serialized) {
        fs.writeFileSync(mcpConfigPath, serialized, { mode: 0o600 })
      }
      result.mcpConfigPath = mcpConfigPath
    } catch (error) {
      console.warn('[GLM-INTEGRATION] MCP config write failed (non-fatal):', error.message)
      result.transport = null
    }
  }

  // 2. /glm-* commands — copied from the checkout's source of truth
  if (glmDir) {
    try {
      const commandsSrc = resolveCommandsDir(glmDir)
      const commandsDest = path.join(projectPath, '.claude', 'commands')
      if (commandsSrc) {
        fs.mkdirSync(commandsDest, { recursive: true })
        for (const file of fs.readdirSync(commandsSrc).filter(f => f.endsWith('.md'))) {
          const content = fs.readFileSync(path.join(commandsSrc, file), 'utf-8')
          const dest = path.join(commandsDest, file)
          if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf-8') !== content) {
            fs.writeFileSync(dest, content)
          }
          result.commands.push(file.replace(/\.md$/, ''))
        }
      }
    } catch (error) {
      console.warn('[GLM-INTEGRATION] Command scaffolding failed (non-fatal):', error.message)
    }
  }

  return result
}

module.exports = { resolveGlmDir, resolveCommandsDir, setupGlmSessionIntegration }
