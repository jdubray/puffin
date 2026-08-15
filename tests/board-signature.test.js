/**
 * The board's change signature.
 *
 * The board polls every five seconds for changes it did not make itself. The
 * first version re-rendered on every tick regardless, which rebuilt a finished
 * session's transcript forever — a completed run looked like it was still
 * working, and any selected text or scroll position was thrown away twice a
 * minute.
 *
 * So the tick now renders only when this signature changes, and the signature
 * has to cover everything the board draws. A field left out is a real change
 * that silently never repaints, which is a worse bug than the flicker: these
 * tests are the list of what must be in it.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let boardSignature

before(async () => {
  // The module imports a stylesheet-free sibling and touches document only
  // inside methods, so importing it for the pure export is safe with a stub.
  global.document = {
    createElement: () => ({
      set textContent(v) { this._v = String(v ?? '') },
      get innerHTML() { return this._v }
    })
  }
  ;({ boardSignature } = await import('../src/renderer/components/board-view/board-view.js'))
})

const card = (overrides = {}) => ({
  instanceId: 'card-a',
  seq: 3,
  status: 'active',
  state: { cardState: 'implementing', reworkCount: 0, lastSignal: '' },
  ...overrides
})

const batch = (overrides = {}) => ({
  generationId: 'gen-1',
  phase: 1,
  policy: 'hold',
  cards: ['card-a', 'card-b'],
  state: { genState: 'running', pending: 2, escalated: 0 },
  ...overrides
})

describe('boardSignature', () => {
  it('is stable when nothing changed', () => {
    assert.strictEqual(
      boardSignature([card()], [batch()]),
      boardSignature([card()], [batch()]))
  })

  it('changes when a card moves', () => {
    const moved = card({ seq: 4, state: { cardState: 'validating', reworkCount: 0, lastSignal: '' } })
    assert.notStrictEqual(boardSignature([card()]), boardSignature([moved]))
  })

  it('changes when a card is added or removed', () => {
    assert.notStrictEqual(
      boardSignature([card()]),
      boardSignature([card(), card({ instanceId: 'card-b' })]))
  })

  it('changes when the rework count rises — it is a badge on the card', () => {
    const reworked = card({ state: { cardState: 'implementing', reworkCount: 1, lastSignal: '' } })
    assert.notStrictEqual(boardSignature([card()]), boardSignature([reworked]))
  })

  it('changes when the last signal changes — also a badge', () => {
    const signalled = card({ state: { cardState: 'implementing', reworkCount: 0, lastSignal: 'defect' } })
    assert.notStrictEqual(boardSignature([card()]), boardSignature([signalled]))
  })

  it('changes when a batch holds', () => {
    // The loudest thing on the board. If a hold did not repaint, the cards
    // would start refusing to move with nothing on screen explaining why.
    const held = batch({ state: { genState: 'held', pending: 2, escalated: 1 } })
    assert.notStrictEqual(boardSignature([], [batch()]), boardSignature([], [held]))
  })

  it('changes when a batch settles', () => {
    const done = batch({ state: { genState: 'doneWithEscalations', pending: 0, escalated: 1 } })
    assert.notStrictEqual(boardSignature([], [batch()]), boardSignature([], [done]))
  })

  it('changes when a new batch starts', () => {
    assert.notStrictEqual(
      boardSignature([], [batch()]),
      boardSignature([], [batch(), batch({ generationId: 'gen-2', phase: 2 })]))
  })

  it('handles an empty board and missing state without throwing', () => {
    assert.strictEqual(typeof boardSignature(), 'string')
    assert.strictEqual(typeof boardSignature([{ id: 'x' }], [{ generationId: 'g' }]), 'string')
  })
})
