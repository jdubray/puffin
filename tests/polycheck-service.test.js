/**
 * polycheck integration.
 *
 * The parsing is tested against output from a real polycheck run, not a shape
 * invented here — the last two payload bugs in this codebase were both a reader
 * guessing at a wire format nobody had checked.
 */

'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { PolycheckService, summarise } = require('../src/main/polycheck-service.js')

/** Trimmed from `polycheck example/mandate --mandate mandate.json --json`. */
const LIVE_REPORT = {
  version: '0.7.0',
  verdict: 'PROOF',
  mandate: {
    source: 'mandate.json',
    results: [
      {
        id: 'summarizer-card',
        gloss: 'build the release-notes summarizer',
        root: 'app',
        outputs: ['app/src/summarize.mjs'],
        status: 'SURPLUS',
        reason: 'writer',
        fix: { kind: 'confine', cls: 'oracle', grants: ['Edit(./src/**)'], declare: ['src/summarize.mjs'] },
        surplus: [
          { step: 1, grant: 'Edit(./src/**)', path: 'src/summarize.spec.mjs', class: 'oracle' },
          { step: 2, grant: 'Edit(./src/**)', path: 'src/other.mjs', class: 'scope' }
        ]
      },
      {
        id: 'config-card',
        status: 'CONFINED',
        outputs: ['app/config/app.yaml'],
        surplus: []
      }
    ]
  }
}

describe('summarise', () => {
  it('separates a card that can write its own oracle from one that cannot', () => {
    const byCard = summarise(LIVE_REPORT)
    assert.strictEqual(byCard['summarizer-card'].status, 'SURPLUS')
    assert.strictEqual(byCard['summarizer-card'].oracle, true)
    assert.deepStrictEqual(byCard['summarizer-card'].oraclePaths, ['src/summarize.spec.mjs'])
    assert.strictEqual(byCard['config-card'].status, 'CONFINED')
    assert.strictEqual(byCard['config-card'].oracle, false)
  })

  it('keeps non-oracle surplus visible without calling it an oracle', () => {
    // Worth showing, not worth stopping an automated run for.
    assert.deepStrictEqual(
      summarise(LIVE_REPORT)['summarizer-card'].paths.sort(),
      ['src/other.mjs', 'src/summarize.spec.mjs'])
  })

  it('carries polycheck\'s own fix through', () => {
    assert.deepStrictEqual(summarise(LIVE_REPORT)['summarizer-card'].fix.declare, ['src/summarize.mjs'])
  })

  it('reports nothing for a run with no mandate', () => {
    assert.deepStrictEqual(summarise({ verdict: 'PROOF' }), {})
    assert.deepStrictEqual(summarise(null), {})
  })
})

describe('PolycheckService', () => {
  let dir

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-pc-')) })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('reports plainly when polycheck is not installed', async () => {
    const svc = new PolycheckService({ projectPath: dir, polycheckDir: path.join(dir, 'nope') })
    const before = process.env.POLYCHECK_DIR
    process.env.POLYCHECK_DIR = path.join(dir, 'also-nope')
    try {
      // Only assert the shape: a real sibling checkout may still resolve.
      const status = svc.getStatus()
      assert.strictEqual(typeof status.available, 'boolean')
      if (!status.available) {
        const result = await svc.check({})
        assert.strictEqual(result.success, false)
        assert.match(result.error, /polycheck not found/)
      }
    } finally {
      if (before === undefined) delete process.env.POLYCHECK_DIR
      else process.env.POLYCHECK_DIR = before
    }
  })

  it('writes a mandate outside the repository', () => {
    // polycheck's own requirement: a declaration the session can edit proves
    // nothing, so it must not live where the session's write grants reach.
    const svc = new PolycheckService({ projectPath: dir })
    const file = svc.writeMandate([{ id: 'card-a', gloss: 'a', outputs: ['src/a.mjs'] }])
    assert.ok(!file.startsWith(dir), 'the mandate must not be written into the project')
    const written = JSON.parse(fs.readFileSync(file, 'utf-8'))
    assert.strictEqual(written.mandates[0].id, 'card-a')
    assert.deepStrictEqual(written.mandates[0].outputs, ['src/a.mjs'])
    fs.rmSync(file, { force: true })
  })

  it('treats exit 1 as a verdict rather than a crash', async () => {
    // Exit 1 IS the finding — refusing to parse it would throw away the whole
    // point of the run.
    const svc = new PolycheckService({
      projectPath: dir,
      polycheckDir: dir,
      runCommand: async () => ({ code: 1, stdout: JSON.stringify(LIVE_REPORT), stderr: '' })
    })
    fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'bin', 'polycheck.mjs'), '')

    const result = await svc.check({ cards: [{ id: 'summarizer-card', outputs: ['app/src/summarize.mjs'] }] })
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.mandate['summarizer-card'].oracle, true)
  })

  it('reports an unparseable run as a failure instead of a pass', async () => {
    const svc = new PolycheckService({
      projectPath: dir,
      polycheckDir: dir,
      runCommand: async () => ({ code: 3, stdout: '', stderr: 'no policy found' })
    })
    fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'bin', 'polycheck.mjs'), '')

    const result = await svc.check({})
    assert.strictEqual(result.success, false)
    assert.match(result.error, /no policy found/)
  })
})
