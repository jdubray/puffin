/**
 * What a card's session touched, versus what it was allowed to touch.
 *
 * The case these exist for actually happened: a session hit a failing test,
 * concluded the fixture was wrong rather than the code, and edited the test
 * file — which is outside the card's OUTPUTS. It was right, and it said so
 * plainly, and the notice still went unread because it was prose in the middle
 * of a long transcript. So the check has to be structural.
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  compareScope, parsePorcelain, changedPaths, isDeclared, gateAffecting
} = require('../src/main/session-scope.js')

describe('parsePorcelain', () => {
  it('reads status codes and paths', () => {
    const entries = parsePorcelain(' M src/experiment.mjs\n?? src/new.mjs\n')
    assert.strictEqual(entries.get('src/experiment.mjs'), ' M')
    assert.strictEqual(entries.get('src/new.mjs'), '??')
  })

  it('takes the new path of a rename', () => {
    const entries = parsePorcelain('R  src/old.mjs -> src/new.mjs\n')
    assert.ok(entries.has('src/new.mjs'))
    assert.ok(!entries.has('src/old.mjs'))
  })

  it('unquotes a path git had to quote', () => {
    assert.ok(parsePorcelain('?? "src/a file.mjs"\n').has('src/a file.mjs'))
  })

  it('survives empty and ragged input', () => {
    assert.strictEqual(parsePorcelain('').size, 0)
    assert.strictEqual(parsePorcelain('\n\nx\n').size, 0)
  })
})

describe('changedPaths', () => {
  it('reports a file that appeared', () => {
    const before = parsePorcelain('')
    const after = parsePorcelain('?? src/new.mjs\n')
    assert.deepStrictEqual(changedPaths(before, after), ['src/new.mjs'])
  })

  it('reports a file whose status changed', () => {
    const before = parsePorcelain('?? src/a.mjs\n')
    const after = parsePorcelain(' M src/a.mjs\n')
    assert.deepStrictEqual(changedPaths(before, after), ['src/a.mjs'])
  })

  it('says nothing about a file that was already dirty and did not move', () => {
    // The session must not be blamed for the working tree it inherited.
    const same = ' M src/pre-existing.mjs\n'
    assert.deepStrictEqual(changedPaths(parsePorcelain(same), parsePorcelain(same)), [])
  })

  it('ignores a path that went back to clean', () => {
    const before = parsePorcelain(' M src/a.mjs\n')
    assert.deepStrictEqual(changedPaths(before, parsePorcelain('')), [])
  })
})

describe('isDeclared', () => {
  it('matches an exact declared output', () => {
    assert.strictEqual(isDeclared('src/kernel.mjs', ['src/kernel.mjs']), true)
  })

  it('matches when the spec is rooted above the session', () => {
    // Real specs say `polysim/src/kernel.mjs` while the session runs inside
    // polysim. Strictness here would flag every legitimate output, and a
    // warning that fires on everything is read as noise.
    assert.strictEqual(isDeclared('src/kernel.mjs', ['polysim/src/kernel.mjs']), true)
    assert.strictEqual(isDeclared('polysim/src/kernel.mjs', ['src/kernel.mjs']), true)
  })

  it('does not match on a partial segment', () => {
    assert.strictEqual(isDeclared('src/mykernel.mjs', ['src/kernel.mjs']), false)
  })

  it('does not match a different file in the same directory', () => {
    assert.strictEqual(isDeclared('src/kernel.test.mjs', ['src/kernel.mjs']), false)
  })

  it('declares nothing when the spec named no outputs', () => {
    assert.strictEqual(isDeclared('src/kernel.mjs', []), false)
  })
})

describe('compareScope', () => {
  it('separates declared work from everything else', () => {
    const result = compareScope({
      before: '',
      after: ' M src/experiment.mjs\n M src/experiment.test.mjs\n',
      outputs: ['polysim/src/experiment.mjs']
    })
    assert.deepStrictEqual(result.declared, ['src/experiment.mjs'])
    assert.deepStrictEqual(result.outOfScope, ['src/experiment.test.mjs'])
  })

  it('is quiet when the session stayed inside its outputs', () => {
    const result = compareScope({
      before: '',
      after: ' M src/experiment.mjs\n',
      outputs: ['src/experiment.mjs']
    })
    assert.deepStrictEqual(result.outOfScope, [])
  })

  it('treats every change as out of scope when no outputs were declared', () => {
    // A spec that names no outputs cannot vouch for anything, and silence
    // there would be the wrong default.
    const result = compareScope({ before: '', after: ' M src/x.mjs\n', outputs: [] })
    assert.deepStrictEqual(result.outOfScope, ['src/x.mjs'])
  })
})

describe('gateAffecting', () => {
  it('picks out a test file, which is how a red gate turns green', () => {
    assert.deepStrictEqual(
      gateAffecting(['src/experiment.test.mjs', 'docs/notes.md']),
      ['src/experiment.test.mjs'])
  })

  it('recognises the usual test layouts across languages', () => {
    const paths = [
      'tests/unit/thing.js', '__tests__/thing.js', 'spec/thing_spec.rb',
      'src/thing_test.go', 'app/test_thing.py', 'test/fixtures/data.json',
      'conftest.py', 'src/thing.spec.ts'
    ]
    assert.deepStrictEqual(gateAffecting(paths).sort(), paths.sort())
  })

  it('leaves ordinary source alone', () => {
    assert.deepStrictEqual(gateAffecting(['src/kernel.mjs', 'README.md']), [])
  })
})
