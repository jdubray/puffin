/**
 * Reading a verifier's output.
 *
 * It was being rendered as markdown — which is what a session's reply is, and
 * what test output emphatically is not. Markdown folds single newlines into
 * spaces, so a 46-line run arrived as one paragraph of prose.
 *
 * The sample below is a real bun run, trimmed. Test names contain the words
 * "fail" and "refuses", which is exactly what a naive tally gets wrong.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let summarise, splitOutput

before(async () => {
  ;({ summarise, splitOutput } = await import('../src/renderer/lib/verifier-output.js'))
})

const GREEN = [
  '$ bun test src/experiment.test.mjs',
  '',
  'bun test v1.3.9 (cf6cdbbb)',
  '',
  'src/experiment.test.mjs:',
  '(pass) statistics primitives > Student-t CDF and quantile are mutually inverse',
  '(pass) Kim-Nelson selection > refuses degenerate parameters',
  '(pass) acceptance: FR-7 end to end > a monitor finding exits nonzero',
  '',
  ' 46 pass',
  ' 0 fail',
  ' 228 expect() calls',
  'Ran 46 tests across 1 file. [275.00ms]'
].join('\n')

const RED = [
  '$ bun test src/experiment.test.mjs',
  '(pass) statistics primitives > confidenceInterval matches the closed form',
  '(fail) warm-up policies > MSER-5 deletes a decaying transient',
  'Expected: 0.369',
  'Received: 0.936',
  '      at src/experiment.test.mjs:379:5',
  '',
  ' 45 pass',
  ' 1 fail'
].join('\n')

describe('summarise', () => {
  it('reads the tally a runner prints', () => {
    assert.deepStrictEqual(summarise(GREEN), { pass: 46, fail: 0, skip: null })
  })

  it('reads a failing tally', () => {
    const counts = summarise(RED)
    assert.strictEqual(counts.pass, 45)
    assert.strictEqual(counts.fail, 1)
  })

  it('reads from the end, because test names say "fail" too', () => {
    // "refuses degenerate parameters", "a monitor finding exits nonzero" — a
    // tally taken from the first match reads the suite's prose, not its result.
    const withNoisyNames = [
      '(pass) 3 failures are reported before any statistics section',
      ' 46 pass',
      ' 0 fail'
    ].join('\n')
    assert.strictEqual(summarise(withNoisyNames).fail, 0)
  })

  it('reports nothing rather than guessing when there is no tally', () => {
    assert.deepStrictEqual(summarise('some other tool said something'),
      { pass: null, fail: null, skip: null })
    assert.deepStrictEqual(summarise(''), { pass: null, fail: null, skip: null })
  })

  it('sees through colour codes', () => {
    assert.strictEqual(summarise('[32m 46 pass[0m').pass, 46)
  })
})

describe('splitOutput', () => {
  it('collapses the passing bulk and keeps the failures out in the open', () => {
    const result = splitOutput(RED)
    assert.strictEqual(result.passes, 1)
    assert.ok(result.failures.some(l => l.includes('MSER-5')))
    assert.ok(result.failures.some(l => l.includes('Expected: 0.369')))
  })

  it('keeps the stack line with its failure rather than in the log', () => {
    assert.ok(splitOutput(RED).failures.some(l => l.includes('at src/experiment.test.mjs:379')))
  })

  it('names the command that ran', () => {
    assert.strictEqual(splitOutput(GREEN).command, 'bun test src/experiment.test.mjs')
  })

  it('has nothing to report on a clean run', () => {
    const result = splitOutput(GREEN)
    assert.deepStrictEqual(result.failures, [])
    assert.strictEqual(result.passes, 3)
    assert.strictEqual(result.headline.fail, 0)
  })

  it('keeps unrecognised lines instead of dropping them', () => {
    // A runner this does not know is the case where silently swallowing output
    // would leave the reader with nothing at all.
    const result = splitOutput('cargo test\nrunning 3 tests\nweird runner line')
    assert.ok(result.rest.some(l => l.includes('weird runner line')))
  })

  it('survives empty output', () => {
    const result = splitOutput('')
    assert.deepStrictEqual(result.failures, [])
    assert.deepStrictEqual(result.rest, [])
  })
})
