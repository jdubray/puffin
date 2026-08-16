/**
 * The one parseable fact a turn carries out.
 *
 * An unattended runner needs to know whether a plan left questions and whether
 * a review found anything. Inferring that from prose is how a runner becomes
 * confident about the wrong thing: "nothing here is unsettled" and a list of
 * six questions look nearly identical to a keyword match.
 *
 * The rule that matters is the null one. A turn that did not say is not a turn
 * that said none, and the runner must treat not-knowing as a reason to hand
 * over rather than a reason to carry on.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let unsettledCount, findingCount

before(async () => {
  ;({ unsettledCount, findingCount } = await import('../src/shared/turn-report.js'))
})

describe('unsettledCount', () => {
  it('reads a count', () => {
    assert.strictEqual(unsettledCount('the plan\n\nUNSETTLED: 5'), 5)
  })

  it('reads none as zero', () => {
    assert.strictEqual(unsettledCount('the plan\n\nUNSETTLED: none'), 0)
  })

  it('is null when the turn did not say', () => {
    // Not zero. The runner hands over on null; treating it as none would make
    // a turn that forgot the line indistinguishable from a clean one.
    assert.strictEqual(unsettledCount('a long plan with no final line'), null)
    assert.strictEqual(unsettledCount(''), null)
    assert.strictEqual(unsettledCount(null), null)
  })

  it('takes the last statement, not a quoted example', () => {
    // A turn explaining the format would otherwise have its example parsed
    // instead of its answer.
    const text = [
      'I will end with `UNSETTLED: none` if I find nothing.',
      '',
      '1. the temporal rule roster',
      '2. the probe config shape',
      '',
      'UNSETTLED: 2'
    ].join('\n')
    assert.strictEqual(unsettledCount(text), 2)
  })

  it('tolerates case and surrounding space', () => {
    assert.strictEqual(unsettledCount('  unsettled:  3  '), 3)
  })

  it('is not fooled by the word appearing in prose', () => {
    assert.strictEqual(unsettledCount('Three things are unsettled here.'), null)
  })
})

describe('findingCount', () => {
  it('reads a review count', () => {
    assert.strictEqual(findingCount('...\nFINDINGS: 2'), 2)
    assert.strictEqual(findingCount('...\nFINDINGS: none'), 0)
  })

  it('is null when the review did not say', () => {
    assert.strictEqual(findingCount('looks fine to me'), null)
  })

  it('does not read a plan tail as a review tail', () => {
    assert.strictEqual(findingCount('UNSETTLED: 4'), null)
    assert.strictEqual(unsettledCount('FINDINGS: 4'), null)
  })
})
