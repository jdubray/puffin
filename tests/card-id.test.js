/**
 * A card is one run of a component, not the component.
 *
 * That distinction was missing and it dead-ended the board. `done` is terminal
 * in the task-card machine — deliberately, since re-running is a new generation
 * and not a mutation of a settled one — while the card id WAS the component id.
 * So a component whose card was done could never be worked again: creating a
 * card returned the finished one, and no action leads back out of done. The
 * board said "no action leads to 'backlog' — corrections are event-driven",
 * which was true and left nowhere to go.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let cardIdFor, baseCardId, runOf, nextCardId

before(async () => {
  ;({ cardIdFor, baseCardId, runOf, nextCardId } = await import('../src/shared/card-id.js'))
})

const GLM = 'cogfab:polysim.twin.twin_engine'
const BASE = 'cogfab-polysim.twin.twin_engine'
const card = (instanceId, cardState) => ({ instanceId, state: { cardState } })

describe('cardIdFor', () => {
  it('gives the first run the bare name', () => {
    // The common case should read as the component it builds.
    assert.strictEqual(cardIdFor(GLM), BASE)
    assert.strictEqual(cardIdFor(GLM, 1), BASE)
  })

  it('marks a later run', () => {
    assert.strictEqual(cardIdFor(GLM, 2), `${BASE}--r2`)
  })

  it('replaces what polyrun will not take in an id', () => {
    assert.ok(!cardIdFor(GLM).includes(':'))
  })
})

describe('baseCardId and runOf', () => {
  it('recovers the component from any run', () => {
    assert.strictEqual(baseCardId(`${BASE}--r3`), BASE)
    assert.strictEqual(baseCardId(BASE), BASE)
  })

  it('reads the run number back', () => {
    assert.strictEqual(runOf(BASE), 1)
    assert.strictEqual(runOf(`${BASE}--r7`), 7)
  })

  it('does not mistake a glm id segment for a run marker', () => {
    // Ids carry dots and dashes of their own; only the --rN tail is a run.
    assert.strictEqual(baseCardId('acme-app.r2'), 'acme-app.r2')
    assert.strictEqual(runOf('acme-app.r2'), 1)
  })
})

describe('nextCardId', () => {
  it('uses the bare id when the component has no card', () => {
    assert.deepStrictEqual(nextCardId(GLM, []), { instanceId: BASE, isNewRun: false, run: 1 })
  })

  it('returns the open card rather than minting a duplicate', () => {
    // Re-queueing a phase must not create a second card for work in flight.
    for (const state of ['backlog', 'ready', 'planning', 'implementing', 'validating', 'reviewing', 'needsHuman']) {
      const result = nextCardId(GLM, [card(BASE, state)])
      assert.strictEqual(result.instanceId, BASE, state)
      assert.strictEqual(result.isNewRun, false, state)
    }
  })

  it('mints a new run once the card is done', () => {
    // The dead end this exists to open: done is terminal, so a component whose
    // spec has since changed needs a NEW card, not a resurrected one.
    const result = nextCardId(GLM, [card(BASE, 'done')])
    assert.strictEqual(result.instanceId, `${BASE}--r2`)
    assert.strictEqual(result.isNewRun, true)
    assert.strictEqual(result.run, 2)
  })

  it('counts from the highest run, not the number of cards', () => {
    const result = nextCardId(GLM, [card(BASE, 'done'), card(`${BASE}--r2`, 'done')])
    assert.strictEqual(result.instanceId, `${BASE}--r3`)
  })

  it('prefers an open later run over minting another', () => {
    const result = nextCardId(GLM, [card(BASE, 'done'), card(`${BASE}--r2`, 'implementing')])
    assert.strictEqual(result.instanceId, `${BASE}--r2`)
    assert.strictEqual(result.isNewRun, false)
  })

  it('ignores cards belonging to other components', () => {
    const result = nextCardId(GLM, [card('cogfab-polysim.kernel.streams', 'done')])
    assert.strictEqual(result.instanceId, BASE)
  })
})
