/**
 * BoardRuntime's HTTP surface.
 *
 * The wire shape is the whole subject. polyrun answers the list endpoints with
 * a bare array, and Puffin's IPC layer spreads whatever it gets into
 * `{ success: true, ... }` — spreading an array produces `{0: card, 1: card}`
 * and no `instances` field, so the board rendered empty columns over a store
 * holding six cards. Nothing threw, nothing logged; the list was simply read
 * under a name that was never there.
 */

'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')

const { BoardRuntime } = require('../src/main/board-runtime.js')

const CARDS = [
  { instanceId: 'card-a', status: 'active', seq: 0, state: { cardState: 'backlog' } },
  { instanceId: 'card-b', status: 'active', seq: 3, state: { cardState: 'planning' } }
]

let realFetch, requested

beforeEach(() => {
  realFetch = globalThis.fetch
  requested = []
})

afterEach(() => { globalThis.fetch = realFetch })

/** Answer any GET with `body`, recording the path. */
function stubFetch(body) {
  globalThis.fetch = async (url) => {
    requested.push(new URL(url).pathname)
    return { ok: true, status: 200, text: async () => JSON.stringify(body) }
  }
}

describe('listCards', () => {
  it('names the array, so a spread into an IPC envelope keeps it reachable', async () => {
    stubFetch(CARDS)
    const result = await new BoardRuntime({ projectPath: 'C:/tmp' }).listCards()
    assert.deepStrictEqual(result, { instances: CARDS })
    // The exact bug: this is what the IPC handler does with the return value.
    assert.deepStrictEqual({ success: true, ...result }.instances, CARDS)
  })

  it('asks polyrun for task-card instances', async () => {
    stubFetch(CARDS)
    await new BoardRuntime({ projectPath: 'C:/tmp' }).listCards()
    assert.deepStrictEqual(requested, ['/machines/task-card/instances'])
  })

  it('reports an empty board as an empty list, not as nothing', async () => {
    stubFetch([])
    const result = await new BoardRuntime({ projectPath: 'C:/tmp' }).listCards()
    assert.deepStrictEqual(result.instances, [])
  })
})

describe('listGenerations', () => {
  it('names the array the same way', async () => {
    const batches = [{ instanceId: 'gen-1', state: { genState: 'running' } }]
    stubFetch(batches)
    const result = await new BoardRuntime({ projectPath: 'C:/tmp' }).listGenerations()
    assert.deepStrictEqual(result, { instances: batches })
    assert.deepStrictEqual(requested, ['/machines/generation/instances'])
  })
})
