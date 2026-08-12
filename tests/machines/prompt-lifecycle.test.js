/**
 * Prompt lifecycle machine — behavior tests + model-check gate.
 *
 * The machine itself lives in machines/prompt-lifecycle/ and is checked
 * exhaustively by the Polygraph checker (see scripts/verify-machines.mjs).
 * These tests exercise the module directly (fast, no external checkout)
 * and, when a Polygraph checkout is available, run the full model check
 * as a suite gate.
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

const machineDir = path.join(__dirname, '..', '..', 'machines', 'prompt-lifecycle')
const machine = require(path.join(machineDir, 'next.cjs'))

/** Reset to init and return a step helper reporting accept/reject. */
function fresh() {
  machine.init()
  return (action, data = {}) => {
    const pre = machine.getState()
    machine.actions[action](data)
    const post = machine.getState()
    return { pre, post, changed: JSON.stringify(pre) !== JSON.stringify(post) }
  }
}

describe('prompt-lifecycle machine', () => {
  it('walks the happy path to completed', () => {
    const step = fresh()
    step('START_COMPOSE')
    step('SUBMIT_PROMPT')
    step('RECEIVE_RESPONSE_CHUNK')
    const { post } = step('COMPLETE_RESPONSE')
    assert.strictEqual(post.promptState, 'completed')
    assert.strictEqual(post.hasResponse, true)
    assert.strictEqual(post.endedVia, 'completed')
  })

  it('rejects zero-chunk completion (complete-only-from-awaiting)', () => {
    const step = fresh()
    step('START_COMPOSE')
    step('SUBMIT_PROMPT')
    const { changed, post } = step('COMPLETE_RESPONSE')
    assert.strictEqual(changed, false)
    assert.strictEqual(post.promptState, 'submitted')
  })

  it('rejects double submit as an observable no-op', () => {
    const step = fresh()
    step('START_COMPOSE')
    step('SUBMIT_PROMPT')
    const { changed } = step('SUBMIT_PROMPT')
    assert.strictEqual(changed, false)
  })

  it('absorbs a late chunk after cancel (post == pre)', () => {
    const step = fresh()
    step('START_COMPOSE')
    step('SUBMIT_PROMPT')
    step('CANCEL_PROMPT')
    const { changed, post } = step('RECEIVE_RESPONSE_CHUNK')
    assert.strictEqual(changed, false)
    assert.strictEqual(post.promptState, 'idle')
    assert.strictEqual(post.endedVia, 'cancelled')
  })

  it('cancel of a mere composition records no verdict', () => {
    const step = fresh()
    step('START_COMPOSE')
    const { post } = step('CANCEL_PROMPT')
    assert.strictEqual(post.promptState, 'idle')
    assert.strictEqual(post.endedVia, '')
  })

  it('error settles as failed, then a new composition starts clean', () => {
    const step = fresh()
    step('START_COMPOSE')
    step('SUBMIT_PROMPT')
    step('RECEIVE_RESPONSE_CHUNK')
    let r = step('RESPONSE_ERROR')
    assert.strictEqual(r.post.promptState, 'failed')
    assert.strictEqual(r.post.endedVia, 'error')
    r = step('START_COMPOSE')
    assert.strictEqual(r.post.promptState, 'composing')
    assert.strictEqual(r.post.hasResponse, false)
    assert.strictEqual(r.post.endedVia, '')
  })

  it('strict-profile validate() is clean', () => {
    const report = machine.instance({}).validate()
    assert.ok(report, 'validate() returned a report')
    assert.strictEqual(report.errors?.length ?? 0, 0,
      `validate() errors: ${JSON.stringify(report.errors)}`)
  })

  describe('model check (Polygraph gate)', () => {
    const polygraphDir = path.resolve(__dirname, '..', '..',
      process.env.POLYGRAPH_DIR || '../polygraph')
    const checker = path.join(polygraphDir, 'scripts', 'check.mjs')
    const available = fs.existsSync(checker)

    it('no invariant violations reachable', { skip: !available && 'polygraph checkout not found' }, () => {
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
