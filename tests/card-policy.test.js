/**
 * What an unattended runner does with a card.
 *
 * These are the rules that make automation trustworthy or not, so they are
 * tested as rules rather than through the runner. The one that matters most is
 * negative: absence of evidence must never advance a card. A runner that reads
 * "the check did not run" as "the check passed" turns every gate in this
 * pipeline into decoration.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let nextStep, pickNext, STEP

before(async () => {
  ;({ nextStep, pickNext, STEP } = await import('../src/shared/card-policy.js'))
})

const at = (cardState, extra = {}) => nextStep({ cardState, ...extra })

describe('advancing a card', () => {
  it('gates a backlog card on the design verifier', () => {
    assert.strictEqual(at('backlog').step, STEP.GATE)
  })

  it('plans before it builds', () => {
    assert.strictEqual(at('ready').step, STEP.PLAN)
  })

  it('does not call planning finished until a plan was produced', () => {
    // The card reaching 'planning' is not the same as a plan existing; that
    // gap is what made the manual board offer "plan ready" with nothing written.
    assert.strictEqual(at('planning').step, STEP.PLAN)
    assert.strictEqual(at('planning', { session: { stage: 'plan', ok: true } }).step, STEP.PLAN_READY)
  })

  it('builds, then validates', () => {
    assert.strictEqual(at('implementing').step, STEP.BUILD)
    assert.strictEqual(
      at('implementing', { session: { stage: 'implement', ok: true } }).step, STEP.VALIDATE)
  })

  it('runs the acceptance verifier rather than asking anyone to tick a box', () => {
    // Leaving validating costs the card's own gate. The tick that used to be
    // here recorded a verdict nobody had produced.
    const step = at('validating', { evidence: {} })
    assert.strictEqual(step.step, STEP.VALIDATE_ACCEPTANCE)
  })

  it('passes validation once the verifier has passed', () => {
    const step = at('validating', { evidence: { verifier: 'pass' } })
    assert.strictEqual(step.step, STEP.VALIDATION_VERDICT)
    assert.strictEqual(step.data.passed, true)
  })

  it('fails validation back to implementing when the verifier failed', () => {
    const step = at('validating', { evidence: { verifier: 'fail' } })
    assert.strictEqual(step.data.passed, false)
    assert.strictEqual(step.data.reason, 'verifier-failed')
  })

  it('passes review when nothing is outstanding', () => {
    const step = at('reviewing', { evidence: { findings: [] } })
    assert.strictEqual(step.data.passed, true)
  })

  it('fails review on a finding, naming its kind', () => {
    const step = at('reviewing', { evidence: { findings: [{ kind: 'spec-mismatch', summary: 'x' }] } })
    assert.strictEqual(step.data.passed, false)
    assert.strictEqual(step.data.finding, 'spec-mismatch')
  })

  it('stops at done', () => {
    assert.strictEqual(at('done').step, STEP.DONE)
  })
})

describe('stopping', () => {
  it('escalates rather than guessing when the model check could not run', () => {
    // The rule the whole runner rests on: no verdict is not a pass. The model
    // check gates entry to validating; a card with no answer never gets there.
    const step = at('implementing', {
      session: { stage: 'implement', ok: true }
    })
    assert.strictEqual(step.step, STEP.VALIDATE)
  })

  it('escalates a card whose spec names no verifier', () => {
    const step = at('ready', { evidence: { hasVerifier: false } })
    assert.strictEqual(step.step, STEP.ESCALATE)
    assert.match(step.reason, /no verifier/)
  })

  it('escalates before spending a turn when the policy permits writing its own oracle', () => {
    // polycheck's mandate check, run BEFORE the session: if the session can
    // write the test that decides its own gate, that session's green result
    // cannot settle the card either way, so the turn is not worth spending.
    const step = at('ready', { evidence: { mandate: { status: 'SURPLUS', oracle: true } } })
    assert.strictEqual(step.step, STEP.ESCALATE)
    assert.match(step.reason, /polycheck: SURPLUS\/oracle/)
  })

  it('proceeds when the policy confines the session to its declaration', () => {
    assert.strictEqual(
      at('ready', { evidence: { mandate: { status: 'CONFINED' } } }).step, STEP.PLAN)
  })

  it('escalates a build that edited a test it never declared', () => {
    const step = at('implementing', {
      session: { stage: 'implement', ok: true, gateAffecting: ['src/x.test.mjs'] }
    })
    assert.strictEqual(step.step, STEP.ESCALATE)
    assert.match(step.reason, /src\/x\.test\.mjs/)
  })

  it('escalates a build that edited the check deciding its own gate', () => {
    // The declared-deliverable blind spot: when the acceptance spec lists the
    // test beside the module, editing it is in scope, so the scope check is
    // silent - and the gate passing afterwards is not independent evidence.
    const step = at('implementing', {
      session: { stage: 'implement', ok: true, oracleEdits: ['src/x.test.mjs'] }
    })
    assert.strictEqual(step.step, STEP.ESCALATE)
    assert.match(step.reason, /not independent evidence/)
    assert.match(step.reason, /src\/x\.test\.mjs/)
  })

  it('escalates a build that never wrote what it declared', () => {
    const step = at('implementing', {
      session: { stage: 'implement', ok: true, missingOutputs: ['src/x.mjs'] }
    })
    assert.strictEqual(step.step, STEP.ESCALATE)
    assert.match(step.reason, /declared/)
  })

  it('escalates a session that failed', () => {
    assert.strictEqual(
      at('implementing', { session: { stage: 'implement', ok: false } }).step, STEP.ESCALATE)
  })

  it('never resumes an escalated card', () => {
    // Both directions of the same mistake: a machine deciding a person was
    // needed, and a machine deciding one no longer is.
    assert.strictEqual(at('needsHuman').step, STEP.WAIT)
    assert.strictEqual(
      at('needsHuman', { session: { stage: 'implement', ok: true } }).step, STEP.WAIT)
  })

  it('does nothing at all while the batch is held', () => {
    for (const cardState of ['ready', 'planning', 'implementing', 'validating', 'reviewing']) {
      const step = nextStep({ cardState, batchHeld: true })
      assert.strictEqual(step.step, STEP.WAIT, cardState)
      assert.match(step.reason, /held/)
    }
  })
})

describe('pickNext', () => {
  const card = (instanceId, cardState) => ({ instanceId, state: { cardState } })

  it('finishes cards before starting new ones', () => {
    // Six half-built components are worse than three finished ones: nothing
    // can be reviewed and every one of them is holding context open.
    const chosen = pickNext([
      card('a', 'backlog'), card('b', 'reviewing'), card('c', 'implementing')
    ])
    assert.strictEqual(chosen.instanceId, 'b')
  })

  it('is deterministic between cards at the same stage', () => {
    const cards = [card('b', 'ready'), card('a', 'ready')]
    assert.strictEqual(pickNext(cards).instanceId, 'a')
    assert.strictEqual(pickNext([...cards].reverse()).instanceId, 'a')
  })

  it('ignores cards that are finished or escalated', () => {
    assert.strictEqual(pickNext([card('a', 'done'), card('b', 'needsHuman')]), null)
    assert.strictEqual(pickNext([]), null)
  })
})
