/**
 * Sekkei thread persistence — design turns live in the same history stream as
 * code turns, tagged by surface, and the Tasks list is filtered per view.
 *
 * These guard the reason the feature exists: a design conversation used to be
 * component-local state that a restart erased.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let submitPrompt, submitPromptAcceptor, initialModel, computeState

before(async () => {
  const actions = await import('../src/renderer/sam/actions.js')
  const model = await import('../src/renderer/sam/model.js')
  const state = await import('../src/renderer/sam/state.js')
  submitPrompt = actions.submitPrompt
  submitPromptAcceptor = model.submitPromptAcceptor
  initialModel = model.initialModel
  computeState = state.computeState
})

/** A model with an empty 'main' stream and no other state to trip over. */
function freshModel(currentView = 'prompt') {
  return {
    ...structuredClone(initialModel),
    currentView,
    history: {
      branches: { main: { id: 'main', name: 'Main', prompts: [] } },
      activeBranch: 'main',
      activePromptId: null,
      expandedThreads: {},
      threadSearchQuery: ''
    }
  }
}

function submit(model, data) {
  const action = submitPrompt({ branchId: 'main', ...data })
  submitPromptAcceptor(model)(action)
  return action.payload.id
}

describe('sekkei threads', () => {
  it('records the surface on every turn, defaulting to prompt', () => {
    const model = freshModel()
    submit(model, { content: 'refactor the parser' })
    submit(model, { content: 'add a capability', surface: 'sekkei', workspaceId: 'ws-1' })

    const [code, design] = model.history.branches.main.prompts
    assert.strictEqual(code.surface, 'prompt')
    assert.strictEqual(code.workspaceId, null)
    assert.strictEqual(design.surface, 'sekkei')
    assert.strictEqual(design.workspaceId, 'ws-1')
  })

  it('honours a caller-supplied id so follow-ups can thread onto it', () => {
    const model = freshModel()
    const rootId = submit(model, { id: 'sk-root', content: 'seed the sekkei', surface: 'sekkei' })
    assert.strictEqual(rootId, 'sk-root')

    submit(model, { id: 'sk-2', parentId: 'sk-root', content: 'now fix the edges', surface: 'sekkei' })
    const root = model.history.branches.main.prompts.find(p => p.id === 'sk-root')
    assert.deepStrictEqual(root.children, ['sk-2'])
  })

  it('shows design threads on the Sekkei tab and code threads elsewhere', () => {
    const model = freshModel('prompt')
    submit(model, { id: 'p1', content: 'refactor the parser' })
    submit(model, { id: 's1', content: 'seed the sekkei', surface: 'sekkei', workspaceId: 'ws-1' })

    const onPrompt = computeState(model).history.promptTree.map(p => p.id)
    assert.deepStrictEqual(onPrompt, ['p1'])

    model.currentView = 'specs'
    const onSekkei = computeState(model).history.promptTree.map(p => p.id)
    assert.deepStrictEqual(onSekkei, ['s1'])
  })

  it('treats pre-surface history as code threads', () => {
    const model = freshModel('prompt')
    model.history.branches.main.prompts.push({
      id: 'legacy', parentId: null, content: 'from an older Puffin',
      timestamp: Date.now(), response: null, children: []
    })

    const visible = computeState(model).history.promptTree
    assert.deepStrictEqual(visible.map(p => p.id), ['legacy'])
    assert.strictEqual(visible[0].surface, 'prompt')
  })

  it('carries the surface and session onto the selected prompt, so a thread can be reopened', () => {
    const model = freshModel('specs')
    submit(model, { id: 's1', content: 'seed the sekkei', surface: 'sekkei', workspaceId: 'ws-1' })
    const prompt = model.history.branches.main.prompts[0]
    prompt.response = { content: 'created 42 nodes', sessionId: 'sess-abc' }
    model.history.activePromptId = 's1'

    const selected = computeState(model).history.selectedPrompt
    assert.strictEqual(selected.surface, 'sekkei')
    assert.strictEqual(selected.workspaceId, 'ws-1')
    assert.strictEqual(selected.response.sessionId, 'sess-abc')
    assert.strictEqual(selected.response.content, 'created 42 nodes')
  })
})
