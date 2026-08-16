/**
 * new · rebuild · built, per component.
 *
 * The middle one is why this exists. A component whose spec changed after it
 * was built looks identical in a tree to one nobody has touched, so noticing it
 * falls to someone remembering — and after a design session that amended four
 * spec nodes, remembering is exactly what fails.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let buildStateOf

before(async () => {
  global.document = {
    createElement: () => ({
      set textContent(v) { this._v = String(v ?? '') },
      get innerHTML() { return this._v }
    })
  }
  ;({ buildStateOf } = await import('../src/renderer/components/specs-view/specs-view.js'))
})

const ID = 'cogfab:sim.world.loader'
const CARD = 'cogfab-sim.world.loader'

const component = (updatedAt) => ({ glmId: ID, stratum: 'component', title: 'world.mjs', updatedAt })
const spec = (updatedAt) => ({
  glmId: `${ID}.spec.functional`, stratum: 'spec', specKind: 'functional', updatedAt
})
const built = (at) => ({ [CARD]: { stage: 'implement', ok: true, at } })

describe('buildStateOf', () => {
  it('calls a component with no implementation session new', () => {
    const state = buildStateOf([component('2026-08-01T00:00:00Z')], {})
    assert.strictEqual(state[ID].state, 'new')
  })

  it('calls a built component whose design has not moved built', () => {
    const state = buildStateOf(
      [component('2026-08-01T00:00:00Z')], built('2026-08-02T00:00:00Z'))
    assert.strictEqual(state[ID].state, 'built')
  })

  it('calls a component whose spec moved after the build a rebuild', () => {
    const state = buildStateOf(
      [component('2026-08-01T00:00:00Z'), spec('2026-08-03T00:00:00Z')],
      built('2026-08-02T00:00:00Z'))
    assert.strictEqual(state[ID].state, 'stale')
    assert.strictEqual(state[ID].changedAt, '2026-08-03T00:00:00Z')
  })

  it('counts a change to any spec leaf as a change to the component', () => {
    // A spec leaf changing IS the component changing: it is the source the
    // code was generated from.
    const state = buildStateOf(
      [component('2026-07-01T00:00:00Z'), spec('2026-08-03T00:00:00Z')],
      built('2026-08-02T00:00:00Z'))
    assert.strictEqual(state[ID].state, 'stale')
  })

  it('compares each component against its own build, not one watermark', () => {
    // A sekkei where one edit marks forty components stale teaches you to
    // ignore the marker.
    const other = 'cogfab:sim.kernel.core'
    const nodes = [
      component('2026-08-03T00:00:00Z'),
      { glmId: other, stratum: 'component', updatedAt: '2026-07-01T00:00:00Z' }
    ]
    const log = {
      ...built('2026-08-02T00:00:00Z'),
      'cogfab-sim.kernel.core': { stage: 'implement', ok: true, at: '2026-08-02T00:00:00Z' }
    }
    const state = buildStateOf(nodes, log)
    assert.strictEqual(state[ID].state, 'stale')
    assert.strictEqual(state[other].state, 'built')
  })

  it('does not count a planning or review turn as a build', () => {
    // Those read the design; they produced nothing the design can outrun.
    for (const stage of ['plan', 'review', 'verify']) {
      const state = buildStateOf([component('2026-08-01T00:00:00Z')],
        { [CARD]: { stage, ok: true, at: '2026-08-02T00:00:00Z' } })
      assert.strictEqual(state[ID].state, 'new', stage)
    }
  })

  it('does not count a failed implementation as a build', () => {
    const state = buildStateOf([component('2026-08-01T00:00:00Z')],
      { [CARD]: { stage: 'implement', ok: false, at: '2026-08-02T00:00:00Z' } })
    assert.strictEqual(state[ID].state, 'new')
  })

  it('says nothing about strata that have no code of their own', () => {
    const state = buildStateOf([
      { glmId: 'cogfab:sim', stratum: 'system' },
      { glmId: 'cogfab:sim.world', stratum: 'capability' },
      component('2026-08-01T00:00:00Z')
    ], {})
    assert.deepStrictEqual(Object.keys(state), [ID])
  })

  it('handles an empty sekkei and a missing log', () => {
    assert.deepStrictEqual(buildStateOf([], {}), {})
    assert.deepStrictEqual(buildStateOf(), {})
  })
})
