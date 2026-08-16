/**
 * The batch above the cards.
 *
 * The generation machine is model-checked, so what needs testing here is the
 * wiring: that a held batch actually refuses dispatches, that a card's outcome
 * reaches its batch exactly once, and that neither of those depends on a file
 * that might not be there.
 *
 * The gate is the reason this module exists. Before it, `hold` was a word
 * printed on a phase — so a test that only checked bookkeeping would pass on
 * the very code this replaced.
 */

'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { GenerationCoordinator } = require('../src/main/generation-coordinator.js')

/**
 * A board that runs the real generation machine's rules in memory.
 *
 * Faked rather than launched because polyrun needs a system node and a sqlite
 * store; what these tests are about is the coordinator's decisions, and those
 * only need the batch to hold and settle the way the machine does.
 */
function fakeBoard() {
  const instances = new Map()
  const calls = []

  return {
    calls,
    instances,
    async createGeneration(id) {
      instances.set(id, { genState: 'drafting', policy: '', pending: 0, escalated: 0 })
      return { created: true }
    },
    async createCard(id) {
      instances.set(id, { cardState: 'backlog' })
      return { created: true }
    },
    async getCard(id) {
      if (!instances.has(id)) throw new Error(`unknown instance '${id}'`)
      return { state: instances.get(id) }
    },
    async dispatch(id, action, data = {}) {
      calls.push({ id, action, data })
      const state = instances.get(id)
      if (!state) throw new Error(`unknown instance '${id}'`)

      if (state.genState !== undefined) {
        const next = { ...state }
        if (action === 'SELECT') next.pending = data.count
        else if (action === 'START') { next.genState = 'running'; next.policy = data.policy }
        else if (action === 'CARD_DONE' || action === 'CARD_ESCALATED') {
          if (next.genState !== 'running') {
            return { stepKind: 'rejected', rejectReason: 'card-outcomes-only-while-running', state }
          }
          next.pending -= 1
          if (action === 'CARD_ESCALATED') next.escalated += 1
          next.genState = next.pending === 0
            ? (next.escalated > 0 ? 'doneWithEscalations' : 'done')
            : (action === 'CARD_ESCALATED' && next.policy === 'hold' ? 'held' : 'running')
        } else if (action === 'RESUME_GENERATION') {
          if (next.genState !== 'held') {
            return { stepKind: 'rejected', rejectReason: 'resume-only-from-held', state }
          }
          next.genState = next.pending === 0 ? 'done' : 'running'
        } else if (action === 'CANCEL') next.genState = 'halted'
        instances.set(id, next)
        return { stepKind: 'accepted', state: next }
      }

      // A card: the test names the state it lands in via data._lands.
      const next = { ...state, cardState: data._lands || state.cardState }
      instances.set(id, next)
      return { stepKind: 'accepted', state: next }
    }
  }
}

let dir, board, coordinator

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-gen-'))
  board = fakeBoard()
  coordinator = new GenerationCoordinator({ board, projectPath: dir })
  await board.createCard('card-a')
  await board.createCard('card-b')
  await board.createCard('card-c')
})

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const startBatch = (policy = 'hold', cards = ['card-a', 'card-b', 'card-c']) =>
  coordinator.createGeneration({ generationId: 'gen-1', phase: 1, policy, cards })

// --- starting a batch -------------------------------------------------------

describe('starting a generation', () => {
  it('selects the membership and then records the policy', async () => {
    const result = await startBatch('hold')
    assert.strictEqual(result.success, true)
    assert.deepStrictEqual(board.calls.map(c => c.action), ['SELECT', 'START'])
    assert.strictEqual(board.calls[0].data.count, 3)
    assert.strictEqual(board.instances.get('gen-1').genState, 'running')
    assert.strictEqual(board.instances.get('gen-1').policy, 'hold')
  })

  it('refuses a batch with no cards', async () => {
    const result = await coordinator.createGeneration(
      { generationId: 'gen-x', phase: 1, policy: 'hold', cards: [] })
    assert.strictEqual(result.success, false)
    assert.deepStrictEqual(board.calls, [])
  })

  it('refuses a policy the machine does not declare', async () => {
    const result = await coordinator.createGeneration(
      { generationId: 'gen-x', phase: 1, policy: 'whenever', cards: ['card-a'] })
    assert.strictEqual(result.success, false)
    assert.match(result.error, /whenever/)
  })

  it('records membership, which the machine does not carry', async () => {
    await startBatch()
    const saved = JSON.parse(fs.readFileSync(path.join(dir, '.puffin', 'generations.json'), 'utf-8'))
    assert.deepStrictEqual(saved.generations[0].cards, ['card-a', 'card-b', 'card-c'])
    assert.strictEqual(saved.generations[0].phase, 1)
  })
})

// --- the gate ---------------------------------------------------------------

describe('the hold gate', () => {
  it('holds the batch when a card escalates under hold', async () => {
    await startBatch('hold')
    await coordinator.dispatchCard('card-a', 'ESCALATE', { _lands: 'needsHuman' })
    assert.strictEqual(board.instances.get('gen-1').genState, 'held')
  })

  it('refuses to move another card while held — the gate itself', async () => {
    await startBatch('hold')
    await coordinator.dispatchCard('card-a', 'ESCALATE', { _lands: 'needsHuman' })

    const before = board.calls.length
    const result = await coordinator.dispatchCard('card-b', 'START_WORK', {})

    assert.strictEqual(result.held, true)
    assert.strictEqual(result.success, false)
    assert.match(result.error, /held/)
    // Names the control. Telling someone who has just resumed the escalated
    // card to "resolve the escalation" sends them hunting for what else the
    // board wants.
    assert.match(result.error, /Resume phase/)
    // Not merely reported: the dispatch never reached the board.
    assert.strictEqual(board.calls.length, before)
    assert.strictEqual(board.instances.get('card-b').cardState, 'backlog')
  })

  it('still lets a person resume the escalated card, or the hold deadlocks', async () => {
    await startBatch('hold')
    await coordinator.dispatchCard('card-a', 'ESCALATE', { _lands: 'needsHuman' })
    const result = await coordinator.dispatchCard('card-a', 'RESUME', { _lands: 'planning' })
    assert.notStrictEqual(result.held, true)
    assert.strictEqual(board.instances.get('card-a').cardState, 'planning')
  })

  it('lets the batch run again once resumed', async () => {
    await startBatch('hold')
    await coordinator.dispatchCard('card-a', 'ESCALATE', { _lands: 'needsHuman' })
    await coordinator.resume('gen-1')
    const result = await coordinator.dispatchCard('card-b', 'START_WORK', {})
    assert.notStrictEqual(result.held, true)
    assert.strictEqual(board.instances.get('gen-1').genState, 'running')
  })

  it('never holds under continue — the batch runs on and remembers', async () => {
    await startBatch('continue')
    await coordinator.dispatchCard('card-a', 'ESCALATE', { _lands: 'needsHuman' })
    const result = await coordinator.dispatchCard('card-b', 'START_WORK', {})
    assert.notStrictEqual(result.held, true)
    assert.strictEqual(board.instances.get('gen-1').genState, 'running')
    assert.strictEqual(board.instances.get('gen-1').escalated, 1)
  })

  it('leaves cards outside any batch alone', async () => {
    await coordinator.createGeneration(
      { generationId: 'gen-1', phase: 1, policy: 'hold', cards: ['card-a'] })
    await coordinator.dispatchCard('card-a', 'ESCALATE', { _lands: 'needsHuman' })
    // card-c belongs to no generation, so no batch can hold it.
    const result = await coordinator.dispatchCard('card-c', 'START_WORK', { _lands: 'planning' })
    assert.notStrictEqual(result.held, true)
    assert.strictEqual(board.instances.get('card-c').cardState, 'planning')
  })
})

// --- outcomes ---------------------------------------------------------------

describe('card outcomes reaching the batch', () => {
  it('reports a finished card once', async () => {
    await startBatch('hold')
    await coordinator.dispatchCard('card-a', 'REVIEW_PASSED', { _lands: 'done' })
    assert.strictEqual(board.instances.get('gen-1').pending, 2)
  })

  it('does not report a card twice, however many times it is dispatched to', async () => {
    // An escalated card can be resumed and go on to finish. Reporting both
    // outcomes would drive pending below zero and settle the batch early.
    await startBatch('continue')
    await coordinator.dispatchCard('card-a', 'ESCALATE', { _lands: 'needsHuman' })
    await coordinator.dispatchCard('card-a', 'RESUME', { _lands: 'planning' })
    await coordinator.dispatchCard('card-a', 'REVIEW_PASSED', { _lands: 'done' })

    assert.strictEqual(board.instances.get('gen-1').pending, 2)
    assert.strictEqual(board.instances.get('gen-1').escalated, 1)
  })

  it('ignores a step the card rejected', async () => {
    await startBatch('hold')
    board.dispatch = async () => ({ stepKind: 'rejected', rejectReason: 'done-is-terminal' })
    await coordinator.dispatchCard('card-a', 'REVIEW_PASSED', {})
    assert.strictEqual(board.instances.get('gen-1').pending, 3)
  })

  it('settles as done when every card finishes clean', async () => {
    await startBatch('continue')
    for (const card of ['card-a', 'card-b', 'card-c']) {
      await coordinator.dispatchCard(card, 'REVIEW_PASSED', { _lands: 'done' })
    }
    assert.strictEqual(board.instances.get('gen-1').genState, 'done')
  })

  it('settles as doneWithEscalations when one was stepped over', async () => {
    // The honesty rule the machine exists to enforce, seen from the wiring.
    await startBatch('continue')
    await coordinator.dispatchCard('card-a', 'ESCALATE', { _lands: 'needsHuman' })
    await coordinator.dispatchCard('card-b', 'REVIEW_PASSED', { _lands: 'done' })
    await coordinator.dispatchCard('card-c', 'REVIEW_PASSED', { _lands: 'done' })
    assert.strictEqual(board.instances.get('gen-1').genState, 'doneWithEscalations')
  })

  it('keeps a card reportable when the batch refused its outcome', async () => {
    // A rejected outcome must not be recorded as settled, or the card would be
    // written off without ever having been counted. A cancelled batch is where
    // this happens: the run is halted, but a card already in flight still lands.
    await startBatch('continue')
    await coordinator.cancel('gen-1')
    await coordinator.dispatchCard('card-a', 'REVIEW_PASSED', { _lands: 'done' })

    const registry = JSON.parse(
      fs.readFileSync(path.join(dir, '.puffin', 'generations.json'), 'utf-8'))
    assert.strictEqual(registry.generations[0].settled['card-a'], undefined)
    assert.strictEqual(board.instances.get('card-a').cardState, 'done', 'the card still moved')
  })
})

// --- degradation ------------------------------------------------------------

describe('when the registry is not there', () => {
  it('dispatches normally with no project path', async () => {
    const loose = new GenerationCoordinator({ board, projectPath: null })
    const result = await loose.dispatchCard('card-a', 'START_WORK', { _lands: 'planning' })
    assert.strictEqual(result.stepKind, 'accepted')
  })

  it('treats a corrupt registry as no batches rather than failing the board', async () => {
    fs.mkdirSync(path.join(dir, '.puffin'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.puffin', 'generations.json'), 'not json{')
    const result = await coordinator.dispatchCard('card-a', 'START_WORK', { _lands: 'planning' })
    assert.strictEqual(result.stepKind, 'accepted')
    assert.deepStrictEqual((await coordinator.listGenerations()).generations, [])
  })
})

// --- listing and driving ----------------------------------------------------

describe('listing and driving', () => {
  it('lists batches newest first, with live state', async () => {
    await startBatch('hold', ['card-a'])
    await board.createCard('card-d')
    await coordinator.createGeneration(
      { generationId: 'gen-2', phase: 2, policy: 'continue', cards: ['card-d'] })
    const { generations } = await coordinator.listGenerations()
    assert.deepStrictEqual(generations.map(g => g.generationId), ['gen-2', 'gen-1'])
    assert.strictEqual(generations[0].state.genState, 'running')
  })

  it('reports a rejected resume rather than pretending it worked', async () => {
    await startBatch('hold')
    const result = await coordinator.resume('gen-1') // running, not held
    assert.strictEqual(result.success, false)
    assert.match(result.error, /resume-only-from-held/)
  })

  it('cancels a running batch', async () => {
    await startBatch('hold')
    const result = await coordinator.cancel('gen-1')
    assert.strictEqual(result.success, true)
    assert.strictEqual(board.instances.get('gen-1').genState, 'halted')
  })
})
