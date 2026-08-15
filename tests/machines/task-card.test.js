/**
 * Task card machine — behavior tests + model-check gate.
 * The verified kanban's anti-loop rules, exercised directly.
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

const machineDir = path.join(__dirname, '..', '..', 'machines', 'task-card')
const machine = require(path.join(machineDir, 'next.cjs'))

function fresh() {
  machine.init()
  return (action, data = {}) => {
    const pre = machine.getState()
    machine.actions[action](data)
    const post = machine.getState()
    return { pre, post, changed: JSON.stringify(pre) !== JSON.stringify(post) }
  }
}

describe('task-card machine', () => {
  it('the gate verdict decides ready — a human cannot drag past it', () => {
    const step = fresh()
    let r = step('MARK_READY', { gate: 'fail' })
    assert.strictEqual(r.changed, false, 'gate=fail is an observable rejection')
    r = step('MARK_READY', { gate: 'pass' })
    assert.strictEqual(r.post.cardState, 'ready')
  })

  it('rejects the illegal drag backlog → planning', () => {
    const step = fresh()
    const { changed } = step('START_WORK')
    assert.strictEqual(changed, false)
  })

  it('work is planned before it is implemented', () => {
    const step = fresh()
    step('MARK_READY', { gate: 'pass' })
    let r = step('START_WORK')
    assert.strictEqual(r.post.cardState, 'planning', 'START_WORK enters the plan, not the work')

    // No shortcut: implementation is reachable only through PLAN_READY
    r = step('SUBMIT_FOR_VALIDATION')
    assert.strictEqual(r.changed, false, 'a card cannot skip from planning to validating')

    r = step('PLAN_READY')
    assert.strictEqual(r.post.cardState, 'implementing')
  })

  it('offers no way to re-plan — that road is the human\'s alone', () => {
    const step = fresh()
    step('MARK_READY', { gate: 'pass' })
    step('START_WORK')
    step('PLAN_READY')
    step('SUBMIT_FOR_VALIDATION')

    // A correction returns to implementing, never to planning
    const r = step('VALIDATION_FAILED', { reason: 'verifier-failed' })
    assert.strictEqual(r.post.cardState, 'implementing')

    // And PLAN_READY outside planning is an observable no-op
    assert.strictEqual(step('PLAN_READY').changed, false)
  })

  it('review is a stage: validation hands over, review finishes', () => {
    const step = fresh()
    step('MARK_READY', { gate: 'pass' })
    step('START_WORK')
    step('PLAN_READY')
    step('SUBMIT_FOR_VALIDATION')

    let r = step('VALIDATION_PASSED')
    assert.strictEqual(r.post.cardState, 'reviewing', 'passing validation does not finish a card')

    r = step('REVIEW_PASSED')
    assert.strictEqual(r.post.cardState, 'done')
  })

  it('a review finding bends back with its name, on the same budget', () => {
    const step = fresh()
    step('MARK_READY', { gate: 'pass' })
    step('START_WORK')
    step('PLAN_READY')

    // One validation failure, then one review finding: two corrections total
    step('SUBMIT_FOR_VALIDATION')
    let r = step('VALIDATION_FAILED', { reason: 'missing-deliverable' })
    assert.strictEqual(r.post.reworkCount, 1)

    step('SUBMIT_FOR_VALIDATION')
    step('VALIDATION_PASSED')
    r = step('REVIEW_FAILED', { finding: 'spec-mismatch' })
    assert.strictEqual(r.post.cardState, 'implementing')
    assert.strictEqual(r.post.lastSignal, 'spec-mismatch', 'the correction names one thing to fix')
    assert.strictEqual(r.post.reworkCount, 2, 'validation and review share one budget')

    // The third correction, from either source, escalates
    step('SUBMIT_FOR_VALIDATION')
    step('VALIDATION_PASSED')
    r = step('REVIEW_FAILED', { finding: 'defect' })
    assert.strictEqual(r.post.cardState, 'needsHuman')
    assert.strictEqual(r.post.lastSignal, 'budget-exhausted')
  })

  it('the rework bend carries its concrete signal, at most twice', () => {
    const step = fresh()
    step('MARK_READY', { gate: 'pass' })
    step('START_WORK')
    step('PLAN_READY')
    for (let lap = 1; lap <= 2; lap++) {
      step('SUBMIT_FOR_VALIDATION')
      const r = step('VALIDATION_FAILED', { reason: 'verifier-failed' })
      assert.strictEqual(r.post.cardState, 'implementing')
      assert.strictEqual(r.post.reworkCount, lap)
      assert.strictEqual(r.post.lastSignal, 'verifier-failed')
    }
    // Third failure does not get another lap — the human gets the card
    step('SUBMIT_FOR_VALIDATION')
    const r = step('VALIDATION_FAILED', { reason: 'missing-deliverable' })
    assert.strictEqual(r.post.cardState, 'needsHuman')
    assert.strictEqual(r.post.lastSignal, 'budget-exhausted')
    assert.strictEqual(r.post.reworkCount, 2, 'budget never exceeded')
  })

  it('RESUME grants a fresh budget from needsHuman only', () => {
    const step = fresh()
    let r = step('RESUME')
    assert.strictEqual(r.changed, false, 'resume outside needsHuman rejects')
    step('MARK_READY', { gate: 'pass' })
    step('START_WORK')
    step('PLAN_READY')
    step('ESCALATE')
    r = step('RESUME')
    // Back to planning, not to work: whatever exhausted the budget invalidated
    // the plan, and a human took this road deliberately.
    assert.strictEqual(r.post.cardState, 'planning')
    assert.strictEqual(r.post.reworkCount, 0)
    assert.strictEqual(r.post.lastSignal, '')
  })

  it('done is a frozen terminal', () => {
    const step = fresh()
    step('MARK_READY', { gate: 'pass' })
    step('START_WORK')
    step('PLAN_READY')
    step('SUBMIT_FOR_VALIDATION')
    step('VALIDATION_PASSED')
    let r = step('REVIEW_PASSED')
    assert.strictEqual(r.post.cardState, 'done')
    for (const action of ['MARK_READY', 'START_WORK', 'PLAN_READY', 'ESCALATE', 'RESUME']) {
      r = step(action, { gate: 'pass' })
      assert.strictEqual(r.changed, false, `${action} on done must be a no-op`)
    }
  })

  it('late validation verdicts are absorbed', () => {
    const step = fresh()
    step('MARK_READY', { gate: 'pass' })
    const { changed } = step('VALIDATION_PASSED')
    assert.strictEqual(changed, false)
  })

  it('strict-profile validate() is clean', () => {
    const report = machine.instance({}).validate()
    assert.strictEqual(report.errors?.length ?? 0, 0,
      `validate() errors: ${JSON.stringify(report.errors)}`)
  })

  describe('model check (Polygraph gate)', () => {
    const polygraphDir = path.resolve(__dirname, '..', '..',
      process.env.POLYGRAPH_DIR || '../polygraph')
    const checker = path.join(polygraphDir, 'scripts', 'check.mjs')
    const isAvailable = fs.existsSync(checker)

    it('no invariant violations reachable', { skip: !isAvailable && 'polygraph checkout not found' }, () => {
      const res = spawnSync(process.execPath, [
        checker,
        '--spec', path.join(machineDir, 'next.cjs'),
        '--contract', path.join(machineDir, 'contract.json'),
        '--invariants', path.join(machineDir, 'invariants.mjs')
      ], { encoding: 'utf-8' })
      const out = `${res.stdout}${res.stderr}`
      assert.strictEqual(res.status, 0, out)
      assert.ok(out.includes('no invariant violations reachable'), out)
    })
  })
})
