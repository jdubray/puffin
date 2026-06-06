/**
 * Tests for ClaudeMdGenerator command scaffolding
 *
 * Verifies that bundled slash commands (e.g. /puffin-sync) are copied into a
 * target project's .claude/ during generation, idempotently.
 */

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ClaudeMdGenerator = require('../../src/main/claude-md-generator')

describe('ClaudeMdGenerator — scaffoldCommands', () => {
  let projectDir
  let generator

  beforeEach(async () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-scaffold-test-'))
    generator = new ClaudeMdGenerator()
    await generator.initialize(projectDir)
  })

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true })
  })

  it('writes the puffin-sync command and .cjs script into .claude/', async () => {
    await generator.scaffoldCommands()

    const commandPath = path.join(projectDir, '.claude', 'commands', 'puffin-sync.md')
    const scriptPath = path.join(projectDir, '.claude', 'scripts', 'puffin-sync.cjs')

    assert.ok(fs.existsSync(commandPath), 'command.md should be written')
    assert.ok(fs.existsSync(scriptPath), 'script.cjs should be written')

    const command = fs.readFileSync(commandPath, 'utf-8')
    assert.match(command, /Send completed fix\/improvement summary/)
    assert.match(command, /node \.claude\/scripts\/puffin-sync\.cjs/)

    const script = fs.readFileSync(scriptPath, 'utf-8')
    assert.match(script, /findPuffinDir/)
  })

  it('uses .cjs so it runs under ESM ("type":"module") projects', async () => {
    await generator.scaffoldCommands()
    const scriptPath = path.join(projectDir, '.claude', 'scripts', 'puffin-sync.cjs')
    assert.ok(fs.existsSync(scriptPath), 'script must use the .cjs extension')
    assert.ok(
      !fs.existsSync(path.join(projectDir, '.claude', 'scripts', 'puffin-sync.js')),
      'no .js variant should be written'
    )
  })

  it('removes a stale .js script left by earlier versions', async () => {
    const scriptsDir = path.join(projectDir, '.claude', 'scripts')
    fs.mkdirSync(scriptsDir, { recursive: true })
    const stalePath = path.join(scriptsDir, 'puffin-sync.js')
    fs.writeFileSync(stalePath, '// old commonjs-in-.js script')

    await generator.scaffoldCommands()

    assert.ok(!fs.existsSync(stalePath), 'stale .js should be removed')
    assert.ok(fs.existsSync(path.join(scriptsDir, 'puffin-sync.cjs')), '.cjs should be written')
  })

  it('is idempotent — a second run leaves content unchanged', async () => {
    await generator.scaffoldCommands()
    const scriptPath = path.join(projectDir, '.claude', 'scripts', 'puffin-sync.cjs')
    const first = fs.readFileSync(scriptPath, 'utf-8')

    await generator.scaffoldCommands()
    const second = fs.readFileSync(scriptPath, 'utf-8')

    assert.strictEqual(first, second, 'content should be stable across runs')
  })

  it('restores the command when a user deletes it', async () => {
    await generator.scaffoldCommands()
    const commandPath = path.join(projectDir, '.claude', 'commands', 'puffin-sync.md')
    fs.rmSync(commandPath)
    assert.ok(!fs.existsSync(commandPath))

    await generator.scaffoldCommands()
    assert.ok(fs.existsSync(commandPath), 'deleted command should be re-created')
  })
})
