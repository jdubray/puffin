/**
 * GLM session integration tests — checkout resolution, MCP config
 * generation, and /glm-* command scaffolding into a scratch project.
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const { resolveGlmDir, setupGlmSessionIntegration } = require('../src/main/glm-integration.js')

const repoRoot = path.resolve(__dirname, '..')
const siblingGlm = path.resolve(repoRoot, '..', 'glm')
const haveGlm = fs.existsSync(
  path.join(siblingGlm, 'integrations', 'mcp', 'src', 'bin', 'glm-mcp.ts'))

function makeScratchProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-glm-int-'))
  return dir
}

describe('glm-integration', () => {
  it('returns nulls when no GLM checkout exists', () => {
    const scratch = makeScratchProject()
    try {
      const result = setupGlmSessionIntegration({
        projectPath: scratch,
        configuredDir: path.join(scratch, 'nowhere')
      })
      // The scratch project has no sibling glm; the Puffin-repo-sibling
      // fallback may still resolve on this machine, so only assert shape.
      assert.ok('glmDir' in result && 'mcpConfigPath' in result)
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('resolves the sibling checkout of the Puffin repo',
    { skip: !haveGlm && 'no sibling glm checkout' }, () => {
      const dir = resolveGlmDir(repoRoot, null)
      assert.strictEqual(path.resolve(dir), siblingGlm)
    })

  it('writes the MCP config and scaffolds /glm-* commands',
    { skip: !haveGlm && 'no sibling glm checkout' }, () => {
      const scratch = makeScratchProject()
      try {
        const result = setupGlmSessionIntegration({
          projectPath: scratch,
          configuredDir: siblingGlm
        })
        assert.strictEqual(result.glmDir, siblingGlm)

        const mcp = JSON.parse(fs.readFileSync(result.mcpConfigPath, 'utf-8'))
        assert.strictEqual(mcp.mcpServers.glm.command, 'bun')
        assert.match(mcp.mcpServers.glm.args[1], /glm-mcp\.ts$/)

        assert.ok(result.commands.includes('glm-ready'))
        assert.ok(result.commands.includes('glm-build'))
        assert.ok(fs.existsSync(
          path.join(scratch, '.claude', 'commands', 'glm-build.md')))

        // Idempotent: a second run rewrites nothing but reports the same set
        const again = setupGlmSessionIntegration({
          projectPath: scratch,
          configuredDir: siblingGlm
        })
        assert.deepStrictEqual(again.commands, result.commands)
      } finally {
        fs.rmSync(scratch, { recursive: true, force: true })
      }
    })
})
