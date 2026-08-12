/**
 * App lifecycle machine — behavior tests + model-check gate.
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

const machineDir = path.join(__dirname, '..', '..', 'machines', 'app-lifecycle')
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

describe('app-lifecycle machine', () => {
  it('boots to ready through loading', () => {
    const step = fresh()
    step('INITIALIZE_APP')
    const { post } = step('LOAD_STATE')
    assert.strictEqual(post.appState, 'ready')
    assert.strictEqual(post.loaded, true)
  })

  it('recovery cannot skip loading (the legacy appFsm flaw)', () => {
    const step = fresh()
    step('APP_ERROR') // error before anything loaded
    const { post } = step('RECOVER')
    assert.strictEqual(post.appState, 'loading', 'pre-load recovery retries the load')
    assert.strictEqual(post.loaded, false)
  })

  it('recovery after load returns to ready', () => {
    const step = fresh()
    step('INITIALIZE_APP')
    step('LOAD_STATE')
    step('APP_ERROR')
    const { post } = step('RECOVER')
    assert.strictEqual(post.appState, 'ready')
  })

  it('submit runs from ready or prompting; complete returns to ready', () => {
    const step = fresh()
    step('INITIALIZE_APP')
    step('LOAD_STATE')
    step('START_PROMPTING')
    let r = step('SUBMIT_PROMPT')
    assert.strictEqual(r.post.appState, 'processing')
    r = step('COMPLETE_RESPONSE')
    assert.strictEqual(r.post.appState, 'ready')
  })

  it('errors do not stack (already-in-error is a no-op)', () => {
    const step = fresh()
    step('APP_ERROR')
    const { changed } = step('APP_ERROR')
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
