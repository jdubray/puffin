/**
 * Generation machine — the batch above the card, and the policy the user picks.
 *
 * The escalation policy is a real choice, so both values are exercised here and
 * the checker proves the machine under each. What is not a choice is honesty:
 * a generation that left work for a person cannot report plain `done`.
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

const machineDir = path.join(__dirname, '..', '..', 'machines', 'generation')
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

/** Select `count` specs and start under `policy`. */
function started(step, count, policy) {
  step('SELECT', { count })
  return step('START', { policy })
}

describe('generation machine', () => {
  it('will not start without a selection', () => {
    const step = fresh()
    assert.strictEqual(step('START', { policy: 'continue' }).changed, false)
  })

  it('fixes membership before the run', () => {
    const step = fresh()
    started(step, 2, 'continue')
    assert.strictEqual(step('SELECT', { count: 3 }).changed, false,
      'the batch cannot grow mid-run — "finished" would mean nothing')
  })

  it('records the policy once and never changes it', () => {
    const step = fresh()
    let r = started(step, 2, 'hold')
    assert.strictEqual(r.post.policy, 'hold')
    r = step('START', { policy: 'continue' })
    assert.strictEqual(r.changed, false, 'a run cannot change the rules it is judged by')
  })

  it("under 'hold', an escalation stops the batch", () => {
    const step = fresh()
    started(step, 3, 'hold')
    const r = step('CARD_ESCALATED')
    assert.strictEqual(r.post.genState, 'held')
    assert.strictEqual(r.post.escalated, 1)
    assert.strictEqual(r.post.pending, 2, 'the remaining cards are untouched, not cancelled')
  })

  it("under 'continue', the batch runs on and remembers", () => {
    const step = fresh()
    started(step, 3, 'continue')
    let r = step('CARD_ESCALATED')
    assert.strictEqual(r.post.genState, 'running', 'nothing holds')
    assert.strictEqual(r.post.escalated, 1)

    step('CARD_DONE')
    r = step('CARD_DONE')
    assert.strictEqual(r.post.genState, 'doneWithEscalations',
      'the terminal names what was stepped over')
  })

  it('a clean run settles as plain done', () => {
    const step = fresh()
    started(step, 2, 'continue')
    step('CARD_DONE')
    const r = step('CARD_DONE')
    assert.strictEqual(r.post.genState, 'done')
    assert.strictEqual(r.post.escalated, 0)
  })

  it('resuming a hold never forgives what it stepped over', () => {
    const step = fresh()
    started(step, 2, 'hold')
    step('CARD_ESCALATED')
    let r = step('RESUME_GENERATION')
    assert.strictEqual(r.post.genState, 'running')
    assert.strictEqual(r.post.escalated, 1, 'the count survives the resume')

    r = step('CARD_DONE')
    assert.strictEqual(r.post.genState, 'doneWithEscalations',
      'and it still decides the terminal')
  })

  it('absorbs a late card outcome', () => {
    const step = fresh()
    started(step, 1, 'continue')
    step('CARD_DONE')
    assert.strictEqual(machine.getState().genState, 'done')
    assert.strictEqual(step('CARD_DONE').changed, false, 'a duplicate is a no-op, not a crash')
  })

  it('cancels while active, and terminals stay frozen', () => {
    const step = fresh()
    started(step, 2, 'hold')
    let r = step('CANCEL')
    assert.strictEqual(r.post.genState, 'halted')
    for (const action of ['CARD_DONE', 'CARD_ESCALATED', 'RESUME_GENERATION', 'CANCEL']) {
      assert.strictEqual(step(action).changed, false, `${action} on halted must be a no-op`)
    }
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

    it('no invariant violations reachable, under either policy',
      { skip: !isAvailable && 'polygraph checkout not found' }, () => {
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
