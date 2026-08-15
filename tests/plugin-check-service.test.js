/**
 * Plugin availability — the check behind the startup prompt.
 *
 * Two distinctions carry the weight. Installed and enabled are separate facts,
 * because a disabled plugin is on disk and contributes nothing — identical to
 * missing from a session's point of view, but a one-line fix rather than a
 * download. And the marketplace name belongs to the user, so matching must key
 * on the plugin half of `plugin@marketplace`.
 */

'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { PluginCheckService } = require('../src/main/plugin-check-service.js')

let home

/** Lay out a fake ~/.claude with the given settings and install records. */
function writeClaudeHome({ enabled = {}, installed = [] } = {}) {
  fs.mkdirSync(path.join(home, 'plugins'), { recursive: true })
  fs.writeFileSync(path.join(home, 'settings.json'),
    JSON.stringify({ enabledPlugins: enabled }))
  fs.writeFileSync(path.join(home, 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: Object.fromEntries(installed.map(k => [k, [{ scope: 'user' }]])) }))
}

const service = (runCommand) => new PluginCheckService({ claudeHome: home, runCommand })

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-claude-home-')) })
afterEach(() => fs.rmSync(home, { recursive: true, force: true }))

describe('PluginCheckService.getStatus', () => {
  it('is satisfied when the required plugin is installed and enabled', () => {
    writeClaudeHome({
      enabled: { 'polygraph@polygraph': true, 'polyviz@polygraph': true },
      installed: ['polygraph@polygraph', 'polyviz@polygraph']
    })
    const status = service().getStatus()
    assert.strictEqual(status.satisfied, true)
    assert.deepStrictEqual(status.missingRequired, [])
    assert.strictEqual(status.plugins.find(p => p.name === 'polygraph').marketplace, 'polygraph')
  })

  it('treats installed-but-disabled as not satisfied', () => {
    writeClaudeHome({
      enabled: { 'polygraph@polygraph': false },
      installed: ['polygraph@polygraph']
    })
    const plugin = service().getStatus().plugins.find(p => p.name === 'polygraph')
    assert.strictEqual(plugin.installed, true)
    assert.strictEqual(plugin.enabled, false)
    assert.deepStrictEqual(service().getStatus().missingRequired, ['polygraph'])
  })

  it('matches whatever the user named the marketplace', () => {
    writeClaudeHome({
      enabled: { 'polygraph@my-fork': true },
      installed: ['polygraph@my-fork']
    })
    const status = service().getStatus()
    assert.strictEqual(status.satisfied, true)
    assert.strictEqual(status.plugins.find(p => p.name === 'polygraph').marketplace, 'my-fork')
  })

  it('does not let an optional plugin block satisfaction', () => {
    writeClaudeHome({
      enabled: { 'polygraph@polygraph': true },
      installed: ['polygraph@polygraph']
    })
    const status = service().getStatus()
    assert.strictEqual(status.satisfied, true)
    assert.strictEqual(status.plugins.find(p => p.name === 'polyviz').installed, false)
  })

  it('reports everything missing when ~/.claude has nothing in it', () => {
    const status = service().getStatus()
    assert.strictEqual(status.satisfied, false)
    assert.deepStrictEqual(status.missingRequired, ['polygraph'])
    for (const plugin of status.plugins) {
      assert.strictEqual(plugin.installed, false)
      assert.strictEqual(plugin.enabled, false)
    }
  })

  it('survives malformed settings rather than throwing', () => {
    fs.mkdirSync(path.join(home, 'plugins'), { recursive: true })
    fs.writeFileSync(path.join(home, 'settings.json'), '{not json')
    assert.strictEqual(service().getStatus().satisfied, false)
  })
})

describe('PluginCheckService.resolveMarketplace', () => {
  it('prefers a local checkout that actually carries a marketplace manifest', () => {
    const checkout = path.join(home, 'polygraph')
    fs.mkdirSync(path.join(checkout, '.claude-plugin'), { recursive: true })
    fs.writeFileSync(path.join(checkout, '.claude-plugin', 'marketplace.json'), '{}')
    assert.deepStrictEqual(service().resolveMarketplace(checkout), {
      source: checkout, kind: 'local'
    })
  })

  it('falls back to the remote when the checkout has no manifest', () => {
    const bare = path.join(home, 'not-a-marketplace')
    fs.mkdirSync(bare, { recursive: true })
    assert.strictEqual(service().resolveMarketplace(bare).kind, 'remote')
    assert.strictEqual(service().resolveMarketplace(null).kind, 'remote')
  })
})

describe('PluginCheckService.install', () => {
  it('adds the marketplace, installs and enables, then re-checks', async () => {
    const calls = []
    const run = (cmd, args) => {
      calls.push(args.join(' '))
      // The install "succeeds", so the recheck must see it
      writeClaudeHome({
        enabled: { 'polygraph@polygraph': true, 'polyviz@polygraph': true },
        installed: ['polygraph@polygraph', 'polyviz@polygraph']
      })
      return Promise.resolve({ code: 0, stdout: 'ok', stderr: '' })
    }
    const result = await service(run).install({ polygraphDir: null })

    assert.strictEqual(result.success, true)
    assert.ok(calls.some(c => c.startsWith('plugin marketplace add')))
    assert.ok(calls.includes('plugin install polygraph --scope user --yes'))
    assert.ok(calls.includes('plugin enable polygraph'))
  })

  it('stops on a failed required install and hands back what the CLI said', async () => {
    const run = (cmd, args) => Promise.resolve(
      args.includes('install')
        ? { code: 1, stdout: '', stderr: 'marketplace not found' }
        : { code: 0, stdout: '', stderr: '' })
    const result = await service(run).install({})

    assert.strictEqual(result.success, false)
    assert.match(result.error, /marketplace not found/)
    assert.ok(result.steps.length >= 2, 'the attempted commands are reported')
    assert.ok(result.steps.every(s => s.cmd.startsWith('claude ')))
  })

  it('fails honestly when the commands succeed but the plugin still is not there', async () => {
    const run = () => Promise.resolve({ code: 0, stdout: 'done', stderr: '' })
    const result = await service(run).install({})
    assert.strictEqual(result.success, false)
    assert.match(result.error, /still missing after install/)
  })
})
