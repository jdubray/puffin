/**
 * Can this verifier run here?
 *
 * The case is real: every acceptance spec in a live sekkei declared its gate as
 * `bun test polysim/src/x.test.mjs` while the session runs inside polysim, so
 * every command named a path one directory too high. Bun exits non-zero for a
 * missing file exactly as it does for a failing assertion — so eight cards
 * failed their gate at once and were sent back to implementing for a defect
 * none of them had.
 *
 * A gate that refuses is evidence. A gate that never ran is not.
 */

'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { inspectVerifier, pathArguments } = require('../src/main/verifier-command.js')

let dir

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-verif-'))
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'src', 'streams.test.mjs'), '')
})

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('pathArguments', () => {
  it('finds the file a test command names', () => {
    assert.deepStrictEqual(pathArguments('bun test src/streams.test.mjs'), ['src/streams.test.mjs'])
  })

  it('does not mistake a subcommand or a flag for a path', () => {
    assert.deepStrictEqual(pathArguments('npm test -- --reporter=dot'), [])
    assert.deepStrictEqual(pathArguments('cargo test'), [])
  })

  it('leaves globs and variables alone rather than guessing', () => {
    // The check may miss a bad path; it must never invent one.
    assert.deepStrictEqual(pathArguments('bun test src/**/*.test.mjs'), [])
    assert.deepStrictEqual(pathArguments('bun test $TESTS/x.mjs'), [])
  })

  it('ignores shell operators and urls', () => {
    assert.deepStrictEqual(pathArguments('bun test src/a.mjs 2>&1 | tail -5'), ['src/a.mjs'])
    assert.deepStrictEqual(pathArguments('curl https://example.com/x'), [])
  })
})

describe('inspectVerifier', () => {
  it('runs a command whose paths are all there', () => {
    const result = inspectVerifier('bun test src/streams.test.mjs', dir)
    assert.strictEqual(result.runnable, true)
    assert.deepStrictEqual(result.missing, [])
  })

  it('refuses to run one that names a path which does not exist', () => {
    const result = inspectVerifier('bun test polysim/src/streams.test.mjs', dir)
    assert.strictEqual(result.runnable, false)
    assert.deepStrictEqual(result.missing, ['polysim/src/streams.test.mjs'])
  })

  it('names the root-prefix mistake when that is what it is', () => {
    // Saves the reader the hunt. It does NOT strip the prefix and run anyway:
    // the spec is the design of record and a silent correction at the gate
    // would leave it wrong forever while every card went green.
    const result = inspectVerifier('bun test polysim/src/streams.test.mjs', dir)
    assert.match(result.reason, /rooted one directory too high/)
    assert.match(result.reason, /src\/streams\.test\.mjs exists/)
  })

  it('runs a command with no path arguments at all', () => {
    // `cargo test`, `npm test` — the runner is not in a position to second-guess
    // a command it cannot read.
    assert.strictEqual(inspectVerifier('cargo test', dir).runnable, true)
  })

  it('runs when there is no project to check against', () => {
    assert.strictEqual(inspectVerifier('bun test src/x.mjs', null).runnable, true)
  })

  it('accepts an absolute path that exists', () => {
    const abs = path.join(dir, 'src', 'streams.test.mjs')
    assert.strictEqual(inspectVerifier(`bun test ${abs}`, dir).runnable, true)
  })
})
