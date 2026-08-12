/**
 * GlmClient tests — config handling plus live integration against the
 * always-on local GLM server (skipped cleanly when it isn't running).
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const { GlmClient } = require('../src/main/glm-client.js')

describe('GlmClient', () => {
  describe('config', () => {
    it('defaults sanely when no config file exists', async () => {
      const client = new GlmClient({ configPath: path.join(os.tmpdir(), 'no-such-glm-config.json') })
      const status = await client.getStatus().catch(() => null)
      // With no token the client still answers; availability depends on the
      // local server, but hasToken must be false and the port the default.
      assert.strictEqual(status.hasToken, false)
      assert.strictEqual(status.port, 3300)
    })

    it('reads port and token from the config file', () => {
      const configPath = path.join(os.tmpdir(), 'glm-test-config.json')
      fs.writeFileSync(configPath, JSON.stringify({ port: 4400, token: 'abc' }))
      try {
        const client = new GlmClient({ configPath })
        assert.strictEqual(client.baseUrl, 'http://127.0.0.1:4400/api/v1')
      } finally {
        fs.rmSync(configPath, { force: true })
      }
    })
  })

  describe('live server', () => {
    let available = false
    const client = new GlmClient()

    before(async () => {
      const status = await client.getStatus()
      available = status.available && status.hasToken
    })

    it('lists workspaces', async (t) => {
      if (!available) return t.skip('GLM server not running')
      const workspaces = await client.listWorkspaces()
      assert.ok(Array.isArray(workspaces))
      if (workspaces.length > 0) {
        assert.ok(workspaces[0].id)
        assert.ok(workspaces[0].name)
      }
    })

    it('fetches a workspace summary with stratum counts', async (t) => {
      if (!available) return t.skip('GLM server not running')
      const workspaces = await client.listWorkspaces()
      if (workspaces.length === 0) return t.skip('no workspaces')
      const summary = await client.getSummary(workspaces[0].id)
      assert.ok(summary.workspace)
      assert.strictEqual(typeof summary.nodes.total, 'number')
      assert.ok(summary.nodes.byStratum)
    })

    it('lists nodes with glm ids', async (t) => {
      if (!available) return t.skip('GLM server not running')
      const workspaces = await client.listWorkspaces()
      const withNodes = []
      for (const ws of workspaces) {
        const nodes = await client.listNodes(ws.id)
        if (nodes.length > 0) { withNodes.push({ ws, nodes }); break }
      }
      if (withNodes.length === 0) return t.skip('no populated workspace')
      const { nodes } = withNodes[0]
      assert.ok(nodes[0].glmId)
      assert.ok(nodes[0].stratum)
    })
  })
})
