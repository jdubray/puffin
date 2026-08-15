/**
 * Reading the DoRC verifier's answer.
 *
 * The payload below is a real one, copied from a live GLM workspace — because
 * the bug was never in the logic, it was in reading a shape nobody had checked
 * against the wire. Two readers guessed `result.gates`, got an empty array, and
 * drew opposite conclusions: `[].every()` is true, so one showed all-green;
 * the other demanded a non-empty list, so no card could ever pass.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let readVerifierRun, describeVerdict

before(async () => {
  ;({ readVerifierRun, describeVerdict } = await import('../src/shared/verifier-verdict.js'))
})

/** The exact shape GLM returns from POST /workspaces/:id/verify. */
const liveResponse = (overrides = {}) => ({
  run: {
    id: '322e2257',
    workspaceId: '05e6b84e',
    gateResults: {
      gates: [
        { name: '1.envelope', passed: true, issues: [] },
        { name: '2.stratum_hierarchy', passed: true, issues: [] },
        { name: '5.spec_coverage', passed: true, issues: [] },
        {
          name: '7.integration_check',
          passed: false,
          issues: ['missing package.json at source_dir', 'missing tsconfig.json at source_dir']
        }
      ]
    },
    overallPass: false,
    ...overrides
  }
})

describe('readVerifierRun', () => {
  it('finds the gates where GLM actually puts them', () => {
    const verdict = readVerifierRun(liveResponse())
    assert.strictEqual(verdict.total, 4)
    assert.strictEqual(verdict.passedCount, 3)
    assert.strictEqual(verdict.passed, false)
    assert.deepStrictEqual(verdict.failed.map(g => g.name), ['7.integration_check'])
  })

  it('passes a run where every gate is green', () => {
    const green = liveResponse()
    green.run.gateResults.gates = green.run.gateResults.gates.map(g => ({ ...g, passed: true }))
    green.run.overallPass = true
    assert.strictEqual(readVerifierRun(green).passed, true)
  })

  it('does NOT call an empty gate list a pass', () => {
    // The vacuous-truth bug: [].every(...) is true, so a payload read under the
    // wrong key reported every gate green while displaying none of them.
    const verdict = readVerifierRun({ run: { gateResults: { gates: [] } } })
    assert.strictEqual(verdict.passed, false)
    assert.strictEqual(verdict.empty, true)
  })

  it('does not call a missing payload a pass either', () => {
    for (const nothing of [undefined, null, {}, { run: {} }]) {
      assert.strictEqual(readVerifierRun(nothing).passed, false, String(nothing))
    }
  })

  it("respects the server's own verdict over a green-looking list", () => {
    // If GLM says the run failed, a list that reads green means the disagreement
    // is unresolved — and an unresolved gate is not a passed gate.
    const conflicted = liveResponse()
    conflicted.run.gateResults.gates = conflicted.run.gateResults.gates.map(g => ({ ...g, passed: true }))
    conflicted.run.overallPass = false
    assert.strictEqual(readVerifierRun(conflicted).passed, false)
  })

  it('reads the older flat shapes too', () => {
    assert.strictEqual(readVerifierRun({ gates: [{ name: 'a', ok: true }] }).passed, true)
    assert.strictEqual(readVerifierRun({ results: [{ name: 'a', passed: false }] }).passed, false)
  })
})

describe('describeVerdict', () => {
  it('names the failing gate and what it wants', () => {
    const text = describeVerdict(readVerifierRun(liveResponse()))
    assert.match(text, /7\.integration_check/)
    assert.match(text, /missing package\.json/)
    assert.match(text, /missing tsconfig\.json/)
  })

  it('says plainly that an empty run is unproven, not fine', () => {
    assert.match(describeVerdict(readVerifierRun({})), /unproven/)
  })
})
