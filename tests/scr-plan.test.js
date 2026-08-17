/**
 * From an approved change request to the work it implies.
 *
 * The rules that matter are about which statuses do and do not authorize work.
 * Regenerating on a Draft would build from a design nobody has agreed to;
 * regenerating on a Rejected would build from one that was refused. Both look
 * like helpfulness and are the opposite.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let componentsForScr, scrWorkPlan, scrWorkFinished, isSettled, TRIGGER_STATUS
let cardIdFor, baseCardId

before(async () => {
  ;({ componentsForScr, scrWorkPlan, scrWorkFinished, isSettled, TRIGGER_STATUS } =
    await import('../src/shared/scr-plan.js'))
  ;({ cardIdFor, baseCardId } = await import('../src/shared/card-id.js'))
})

const P = 'cogfab:polysim.'
const nodes = [
  { glmId: `${P}observation.probes`, stratum: 'component' },
  { glmId: `${P}observation.probes.spec.functional`, stratum: 'spec' },
  { glmId: `${P}kernel.kernel_core`, stratum: 'component' },
  { glmId: `${P}kernel.kernel_core.dispatch_cycle`, stratum: 'interaction' },
  { glmId: 'cogfab:polysim', stratum: 'system' }
]

const scr = (over = {}) => ({
  id: 'SCR-1', title: 'a decision', scrClass: 'II', status: 'Approved',
  targetNodes: [`${P}observation.probes`], ...over
})
const card = (glmId, cardState, run = 1) =>
  ({ instanceId: cardIdFor(glmId, run), state: { cardState } })

const plan = (scrs, cards = []) =>
  scrWorkPlan({ scrs, nodes, cards, cardIdFor, baseCardId })

describe('componentsForScr', () => {
  it('takes a component target as itself', () => {
    const { components } = componentsForScr(scr(), nodes)
    assert.deepStrictEqual(components, [`${P}observation.probes`])
  })

  it('lifts a spec leaf and an interaction to the component that owns them', () => {
    // The unit of work is the component; a spec is what changed about it.
    const { components } = componentsForScr(scr({
      targetNodes: [`${P}observation.probes.spec.functional`, `${P}kernel.kernel_core.dispatch_cycle`]
    }), nodes)
    assert.deepStrictEqual(components, [`${P}kernel.kernel_core`, `${P}observation.probes`])
  })

  it('reports a target that resolves to nothing rather than dropping it', () => {
    // An SCR aimed at a node that no longer exists cannot be acted on, and
    // planning zero work for it would read as "already done".
    const { components, unresolved } = componentsForScr(
      scr({ targetNodes: [`${P}gone.away`] }), nodes)
    assert.deepStrictEqual(components, [])
    assert.deepStrictEqual(unresolved, [`${P}gone.away`])
  })

  it('does not lift a system or capability target into a component', () => {
    const { components, unresolved } = componentsForScr(
      scr({ targetNodes: ['cogfab:polysim'] }), nodes)
    assert.deepStrictEqual(components, [])
    assert.deepStrictEqual(unresolved, ['cogfab:polysim'])
  })

  it('de-duplicates two targets under one component', () => {
    const { components } = componentsForScr(scr({
      targetNodes: [`${P}observation.probes`, `${P}observation.probes.spec.functional`]
    }), nodes)
    assert.strictEqual(components.length, 1)
  })
})

describe('which statuses authorize work', () => {
  it('acts only on Approved', () => {
    assert.strictEqual(TRIGGER_STATUS, 'Approved')
    for (const status of ['Draft', 'Submitted', 'Under Review', 'Returned', 'Rejected']) {
      assert.deepStrictEqual(plan([scr({ status })]), [], status)
    }
    assert.strictEqual(plan([scr({ status: 'Approved' })]).length, 1)
  })

  it('does not act on its own completion states', () => {
    // Implemented is what the workflow reports; acting on it would loop.
    for (const status of ['Implemented', 'Released']) {
      assert.deepStrictEqual(plan([scr({ status })]), [], status)
      assert.strictEqual(isSettled(scr({ status })), true, status)
    }
    assert.strictEqual(isSettled(scr({ status: 'Approved' })), false)
  })
})

describe('what an approved SCR needs', () => {
  it('needs a card for a component that has never had one', () => {
    const [entry] = plan([scr()])
    assert.deepStrictEqual(entry.needsCards, [`${P}observation.probes`])
    assert.deepStrictEqual(entry.waitingOn, [])
    assert.strictEqual(entry.complete, false)
  })

  it('needs a NEW card for a component whose last run settled', () => {
    // Done is terminal, so an approved SCR against a finished component is a
    // second run rather than a reopening.
    const [entry] = plan([scr()], [card(`${P}observation.probes`, 'done')])
    assert.deepStrictEqual(entry.needsCards, [`${P}observation.probes`])
    assert.strictEqual(entry.work[0].state, 'settled')
  })

  it('waits on an open card rather than minting a second', () => {
    const [entry] = plan([scr()], [card(`${P}observation.probes`, 'implementing')])
    assert.deepStrictEqual(entry.needsCards, [])
    assert.deepStrictEqual(entry.waitingOn, [`${P}observation.probes`])
    assert.strictEqual(entry.work[0].cardState, 'implementing')
  })

  it('treats an escalated card as open, not as work to redo', () => {
    // needsHuman is a card waiting for a person; another card would not help.
    const [entry] = plan([scr()], [card(`${P}observation.probes`, 'needsHuman')])
    assert.deepStrictEqual(entry.waitingOn, [`${P}observation.probes`])
  })

  it('spans every component its targets resolve to', () => {
    const [entry] = plan([scr({
      targetNodes: [`${P}observation.probes`, `${P}kernel.kernel_core.dispatch_cycle`]
    })])
    assert.strictEqual(entry.components.length, 2)
    assert.strictEqual(entry.needsCards.length, 2)
  })

  it('is never complete when it resolved to no components at all', () => {
    // Otherwise an SCR aimed at a deleted node would immediately report the
    // work as finished.
    const [entry] = plan([scr({ targetNodes: [`${P}gone`] })])
    assert.strictEqual(entry.complete, false)
    assert.deepStrictEqual(entry.unresolved, [`${P}gone`])
  })
})

describe('scrWorkFinished', () => {
  const probes = `${P}observation.probes`

  it('is finished when every component has a done card', () => {
    assert.strictEqual(
      scrWorkFinished([probes], [card(probes, 'done')], cardIdFor, baseCardId), true)
  })

  it('is not finished while any run of a component is open', () => {
    // A second run in flight means the component is being worked; the SCR is
    // not implemented until it settles.
    const cards = [card(probes, 'done'), card(probes, 'implementing', 2)]
    assert.strictEqual(scrWorkFinished([probes], cards, cardIdFor, baseCardId), false)
  })

  it('is not finished when a component has no card at all', () => {
    assert.strictEqual(scrWorkFinished([probes], [], cardIdFor, baseCardId), false)
  })

  it('is not finished for an empty component list', () => {
    assert.strictEqual(scrWorkFinished([], [card(probes, 'done')], cardIdFor, baseCardId), false)
  })
})
