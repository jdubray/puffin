/**
 * Tests for command-scaffolder
 *
 * Verifies that bundled slash commands (e.g. /puffin-sync) are copied into a
 * target project's .claude/ directory, idempotently. As of 4.0 this is the only
 * thing Puffin writes under .claude/ — CLAUDE.md is left untouched.
 */

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { scaffoldCommands } = require('../src/main/command-scaffolder')

describe('command-scaffolder — scaffoldCommands', () => {
  let projectDir
  let claudeDir

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-scaffold-test-'))
    claudeDir = path.join(projectDir, '.claude')
  })

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  it('writes the puffin-sync command and .cjs script into .claude/', async () => {
    await scaffoldCommands(claudeDir)

    const commandPath = path.join(claudeDir, 'commands', 'puffin-sync.md')
    const scriptPath = path.join(claudeDir, 'scripts', 'puffin-sync.cjs')

    assert.ok(fs.existsSync(commandPath), 'command.md should be written')
    assert.ok(fs.existsSync(scriptPath), 'script.cjs should be written')

    const command = fs.readFileSync(commandPath, 'utf-8')
    assert.match(command, /Send completed fix\/improvement summary/)
    assert.match(command, /node \.claude\/scripts\/puffin-sync\.cjs/)

    const script = fs.readFileSync(scriptPath, 'utf-8')
    assert.match(script, /findPuffinDir/)
  })

  it('uses .cjs so it runs under ESM ("type":"module") projects', async () => {
    await scaffoldCommands(claudeDir)
    const scriptPath = path.join(claudeDir, 'scripts', 'puffin-sync.cjs')
    assert.ok(fs.existsSync(scriptPath), 'script must use the .cjs extension')
    assert.ok(
      !fs.existsSync(path.join(claudeDir, 'scripts', 'puffin-sync.js')),
      'no .js variant should be written'
    )
  })

  it('removes a stale .js script left by earlier versions', async () => {
    const scriptsDir = path.join(claudeDir, 'scripts')
    fs.mkdirSync(scriptsDir, { recursive: true })
    const stalePath = path.join(scriptsDir, 'puffin-sync.js')
    fs.writeFileSync(stalePath, '// old commonjs-in-.js script')

    await scaffoldCommands(claudeDir)

    assert.ok(!fs.existsSync(stalePath), 'stale .js should be removed')
    assert.ok(fs.existsSync(path.join(scriptsDir, 'puffin-sync.cjs')), '.cjs should be written')
  })

  it('is idempotent — a second run leaves content unchanged', async () => {
    await scaffoldCommands(claudeDir)
    const scriptPath = path.join(claudeDir, 'scripts', 'puffin-sync.cjs')
    const first = fs.readFileSync(scriptPath, 'utf-8')

    await scaffoldCommands(claudeDir)
    const second = fs.readFileSync(scriptPath, 'utf-8')

    assert.strictEqual(first, second, 'content should be stable across runs')
  })

  it('restores the command when a user deletes it', async () => {
    await scaffoldCommands(claudeDir)
    const commandPath = path.join(claudeDir, 'commands', 'puffin-sync.md')
    fs.rmSync(commandPath)
    assert.ok(!fs.existsSync(commandPath))

    await scaffoldCommands(claudeDir)
    assert.ok(fs.existsSync(commandPath), 'deleted command should be re-created')
  })

  it('is a no-op when given no claudeDir', async () => {
    await assert.doesNotReject(() => scaffoldCommands(undefined))
  })
})
