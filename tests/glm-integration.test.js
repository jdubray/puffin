/**
 * GLM session integration tests — checkout resolution, MCP config
 * generation (HTTP against the always-on server, stdio fallback), and
 * /glm-* command scaffolding into a scratch project.
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const {
  resolveGlmDir,
  resolveCommandsDir,
  setupGlmSessionIntegration
} = require('../src/main/glm-integration.js')

const repoRoot = path.resolve(__dirname, '..')
const siblingGlm = path.resolve(repoRoot, '..', 'glm')
const haveGlm = fs.existsSync(
  path.join(siblingGlm, 'integrations', 'mcp', 'src', 'bin', 'glm-mcp.ts'))

function makeScratchProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-glm-int-'))
}

/** A scratch ~/.glm/config.json; pass token: null to simulate "not set up". */
function makeGlmConfig(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-glm-cfg-'))
  const file = path.join(dir, 'config.json')
  if (config) fs.writeFileSync(file, JSON.stringify(config))
  return file
}

describe('glm-integration', () => {
  it('writes an HTTP MCP config pointing at the server, with the bearer token', () => {
    const scratch = makeScratchProject()
    const glmConfigPath = makeGlmConfig({ port: 4400, token: 'tok-abc123' })
    try {
      const result = setupGlmSessionIntegration({
        projectPath: scratch,
        configuredDir: path.join(scratch, 'nowhere'),
        glmConfigPath
      })

      assert.strictEqual(result.transport, 'http')
      const mcp = JSON.parse(fs.readFileSync(result.mcpConfigPath, 'utf-8'))
      assert.strictEqual(mcp.mcpServers.glm.type, 'http')
      assert.strictEqual(mcp.mcpServers.glm.url, 'http://127.0.0.1:4400/mcp')
      assert.strictEqual(mcp.mcpServers.glm.headers.Authorization, 'Bearer tok-abc123')

      // Concrete values, not ${VAR} references the client would have to expand
      assert.ok(!JSON.stringify(mcp).includes('${'))
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true })
      fs.rmSync(path.dirname(glmConfigPath), { recursive: true, force: true })
    }
  })

  it('keeps the credential out of the project tree', () => {
    const scratch = makeScratchProject()
    const glmConfigPath = makeGlmConfig({ port: 3300, token: 'tok-secret' })
    try {
      const result = setupGlmSessionIntegration({
        projectPath: scratch, glmConfigPath
      })
      assert.ok(!path.resolve(result.mcpConfigPath).startsWith(path.resolve(scratch)),
        'MCP config (which carries a token) must not be written inside the project')
      assert.ok(!fs.existsSync(path.join(scratch, '.puffin', 'glm-mcp.json')))
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true })
      fs.rmSync(path.dirname(glmConfigPath), { recursive: true, force: true })
    }
  })

  it('gives two projects two configs', () => {
    const a = makeScratchProject()
    const b = makeScratchProject()
    const glmConfigPath = makeGlmConfig({ port: 3300, token: 'tok' })
    try {
      const ra = setupGlmSessionIntegration({ projectPath: a, glmConfigPath })
      const rb = setupGlmSessionIntegration({ projectPath: b, glmConfigPath })
      assert.notStrictEqual(ra.mcpConfigPath, rb.mcpConfigPath)
    } finally {
      for (const d of [a, b]) fs.rmSync(d, { recursive: true, force: true })
      fs.rmSync(path.dirname(glmConfigPath), { recursive: true, force: true })
    }
  })

  it('falls back to the stdio server when no token is configured',
    { skip: !haveGlm && 'no sibling glm checkout' }, () => {
      const scratch = makeScratchProject()
      const glmConfigPath = makeGlmConfig(null) // no ~/.glm/config.json at all
      try {
        const result = setupGlmSessionIntegration({
          projectPath: scratch,
          configuredDir: siblingGlm,
          glmConfigPath
        })
        assert.strictEqual(result.transport, 'stdio')
        const mcp = JSON.parse(fs.readFileSync(result.mcpConfigPath, 'utf-8'))
        assert.strictEqual(mcp.mcpServers.glm.command, 'bun')
        assert.match(mcp.mcpServers.glm.args[1], /glm-mcp\.ts$/)
      } finally {
        fs.rmSync(scratch, { recursive: true, force: true })
        fs.rmSync(path.dirname(glmConfigPath), { recursive: true, force: true })
      }
    })

  it('writes nothing when GLM is neither configured nor checked out', () => {
    const scratch = makeScratchProject()
    const glmConfigPath = makeGlmConfig(null)
    try {
      const result = setupGlmSessionIntegration({
        projectPath: scratch,
        configuredDir: path.join(scratch, 'nowhere'),
        glmConfigPath
      })
      if (!result.glmDir) {
        assert.strictEqual(result.transport, null)
        assert.strictEqual(result.mcpConfigPath, null)
      }
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true })
      fs.rmSync(path.dirname(glmConfigPath), { recursive: true, force: true })
    }
  })

  it('resolves the sibling checkout of the Puffin repo',
    { skip: !haveGlm && 'no sibling glm checkout' }, () => {
      assert.strictEqual(path.resolve(resolveGlmDir(repoRoot, null)), siblingGlm)
    })

  it('prefers the plugin commands directory over the pre-plugin one',
    { skip: !haveGlm && 'no sibling glm checkout' }, () => {
      const dir = resolveCommandsDir(siblingGlm)
      if (fs.existsSync(path.join(siblingGlm, 'plugin', 'commands'))) {
        assert.strictEqual(dir, path.join(siblingGlm, 'plugin', 'commands'))
      } else {
        assert.ok(dir === null || dir.includes('integrations'))
      }
    })

  it('scaffolds /glm-* commands into the project',
    { skip: !haveGlm && 'no sibling glm checkout' }, () => {
      const scratch = makeScratchProject()
      const glmConfigPath = makeGlmConfig({ port: 3300, token: 'tok' })
      try {
        const result = setupGlmSessionIntegration({
          projectPath: scratch, configuredDir: siblingGlm, glmConfigPath
        })
        assert.strictEqual(result.glmDir, siblingGlm)
        assert.ok(result.commands.includes('glm-ready'))
        assert.ok(result.commands.includes('glm-build'))
        assert.ok(fs.existsSync(
          path.join(scratch, '.claude', 'commands', 'glm-build.md')))

        // Idempotent: a second run rewrites nothing but reports the same set
        const again = setupGlmSessionIntegration({
          projectPath: scratch, configuredDir: siblingGlm, glmConfigPath
        })
        assert.deepStrictEqual(again.commands, result.commands)
      } finally {
        fs.rmSync(scratch, { recursive: true, force: true })
        fs.rmSync(path.dirname(glmConfigPath), { recursive: true, force: true })
      }
    })

  it('points the endpoint at the project\'s bound workspace', () => {
    const scratch = makeScratchProject()
    const glmConfigPath = makeGlmConfig({ port: 3300, token: 'tok', workspace: 'global-default' })
    try {
      const bound = setupGlmSessionIntegration({
        projectPath: scratch, workspace: 'ws-bound-id', glmConfigPath
      })
      const url = JSON.parse(fs.readFileSync(bound.mcpConfigPath, 'utf-8')).mcpServers.glm.url
      assert.strictEqual(url, 'http://127.0.0.1:3300/mcp?workspace=ws-bound-id')
      assert.strictEqual(bound.workspace, 'ws-bound-id')

      // Unbound projects fall back to ~/.glm's global default
      const unbound = setupGlmSessionIntegration({ projectPath: scratch, glmConfigPath })
      const url2 = JSON.parse(fs.readFileSync(unbound.mcpConfigPath, 'utf-8')).mcpServers.glm.url
      assert.match(url2, /\?workspace=global-default$/)
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true })
      fs.rmSync(path.dirname(glmConfigPath), { recursive: true, force: true })
    }
  })

})
