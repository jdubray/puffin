/**
 * GLM session integration — wires spawned Claude Code sessions to GLM.
 *
 * Two artifacts, both project-scoped and non-fatal when GLM is absent:
 *   1. `.puffin/glm-mcp.json` — an --mcp-config registering the `glm` stdio
 *      MCP server (10 tools: glm_status, glm_get_component_spec,
 *      glm_record_generation, …). The server self-configures from
 *      ~/.glm/config.json; the LLM call stays client-side (ADR-0006).
 *   2. `.claude/commands/glm-*.md` — the /glm-* slash commands
 *      (/glm-ready = DoRC gate, /glm-build = generate→verify→attest
 *      orchestration), copied from the GLM checkout's source of truth.
 *
 * @module glm-integration
 */

const fs = require('fs')
const path = require('path')

/**
 * Resolve the GLM checkout directory.
 * Order: explicit config > sibling of the project > sibling of the Puffin repo.
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
 * Write the project's GLM MCP config and install the /glm-* commands.
 * Idempotent; returns what was set up (all nulls when GLM isn't found).
 *
 * @param {Object} params
 * @param {string} params.projectPath
 * @param {string} [params.configuredDir] - config.glmDir
 * @returns {{glmDir: string|null, mcpConfigPath: string|null, commands: string[]}}
 */
function setupGlmSessionIntegration({ projectPath, configuredDir } = {}) {
  const result = { glmDir: null, mcpConfigPath: null, commands: [] }
  if (!projectPath) return result

  const glmDir = resolveGlmDir(projectPath, configuredDir)
  if (!glmDir) return result
  result.glmDir = glmDir

  // 1. MCP config — bun runs the stdio server straight from the checkout
  try {
    const mcpBin = path.join(glmDir, 'integrations', 'mcp', 'src', 'bin', 'glm-mcp.ts')
    const mcpConfig = {
      mcpServers: {
        glm: { command: 'bun', args: ['run', mcpBin] }
      }
    }
    const mcpConfigPath = path.join(projectPath, '.puffin', 'glm-mcp.json')
    fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true })
    const serialized = JSON.stringify(mcpConfig, null, 2)
    if (!fs.existsSync(mcpConfigPath) ||
        fs.readFileSync(mcpConfigPath, 'utf-8') !== serialized) {
      fs.writeFileSync(mcpConfigPath, serialized)
    }
    result.mcpConfigPath = mcpConfigPath
  } catch (error) {
    console.warn('[GLM-INTEGRATION] MCP config write failed (non-fatal):', error.message)
  }

  // 2. /glm-* commands — copied from the checkout's source of truth
  try {
    const commandsSrc = path.join(glmDir, 'integrations', 'mcp', 'commands')
    const commandsDest = path.join(projectPath, '.claude', 'commands')
    if (fs.existsSync(commandsSrc)) {
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

  return result
}

module.exports = { resolveGlmDir, setupGlmSessionIntegration }
