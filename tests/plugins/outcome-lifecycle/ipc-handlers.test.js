/**
 * Tests for S9: IPC Handlers
 *
 * Verifies that all IPC handlers are registered, validate input correctly,
 * and delegate to the repository/DAG engine appropriately.
 */

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const { register } = require('../../../plugins/outcome-lifecycle-plugin/lib/ipc-handlers')

/**
 * Create a mock context that captures registered handlers.
 * @returns {{ context: Object, handlers: Map<string, Function> }}
 */
function createMockContext() {
  const handlers = new Map()
  const context = {
    registerIpcHandler(channel, handler) {
      handlers.set(channel, handler)
    }
  }
  return { context, handlers }
}

/**
 * Create an in-memory storage + repository + DAG engine for testing.
 */
function createDeps(initialLifecycles = []) {
  const data = { lifecycles: initialLifecycles.map(lc => ({ ...lc })) }

  const mockStorage = {
    async load() { return JSON.parse(JSON.stringify(data)) },
    async save(newData) { data.lifecycles = newData.lifecycles }
  }

  const { LifecycleRepository } = require('../../../plugins/outcome-lifecycle-plugin/lib/lifecycle-repository')
  const { DAGEngine } = require('../../../plugins/outcome-lifecycle-plugin/lib/dag-engine')

  const repository = new LifecycleRepository(mockStorage)
  const dagEngine = new DAGEngine(repository)

  return { repository, dagEngine, data }
}

function makeLifecycle(id, title, opts = {}) {
  return {
    id,
    title,
    description: opts.description || '',
    status: opts.status || 'not_started',
    dependencies: opts.dependencies || [],
    storyMappings: opts.storyMappings || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

describe('IPC Handlers - Registration', () => {
  it('should register all expected channels', () => {
    const { context, handlers } = createMockContext()
    const deps = createDeps()
    register(context, deps)

    const expected = [
      'createLifecycle', 'getLifecycle', 'updateLifecycle',
      'deleteLifecycle', 'listLifecycles',
      'mapStory', 'unmapStory',
      'getStoriesForLifecycle', 'getLifecyclesForStory',
      'addDependency', 'removeDependency', 'getDag'
    ]

    for (const channel of expected) {
      assert.ok(handlers.has(channel), `Missing handler: ${channel}`)
    }
    assert.strictEqual(handlers.size, expected.length)
  })
})

describe('IPC Handlers - createLifecycle', () => {
  it('should create a lifecycle with title and description', async () => {
    const { context, handlers } = createMockContext()
    const deps = createDeps()
    register(context, deps)

    const result = await handlers.get('createLifecycle')({ title: 'Ship auth', description: 'Users can log in' })
    assert.strictEqual(result.title, 'Ship auth')
    assert.strictEqual(result.description, 'Users can log in')
    assert.strictEqual(result.status, 'not_started')
    assert.ok(result.id)
  })

  it('should throw when title is missing', async () => {
    const { context, handlers } = createMockContext()
    register(context, createDeps())

    await assert.rejects(
      handlers.get('createLifecycle')({}),
      /title is required/
    )
  })

  it('should throw when title is empty string', async () => {
    const { context, handlers } = createMockContext()
    register(context, createDeps())

    await assert.rejects(
      handlers.get('createLifecycle')({ title: '  ' }),
      /title/i
    )
  })
})

describe('IPC Handlers - getLifecycle', () => {
  it('should return a lifecycle by id', async () => {
    const lc = makeLifecycle('lc-1', 'Auth')
    const { context, handlers } = createMockContext()
    register(context, createDeps([lc]))

    const result = await handlers.get('getLifecycle')({ id: 'lc-1' })
    assert.strictEqual(result.title, 'Auth')
  })

  it('should throw when id not found', async () => {
    const { context, handlers } = createMockContext()
    register(context, createDeps())

    await assert.rejects(
      handlers.get('getLifecycle')({ id: 'nonexistent' }),
      /not found/
    )
  })

  it('should throw when id is missing', async () => {
    const { context, handlers } = createMockContext()
    register(context, createDeps())

    await assert.rejects(
      handlers.get('getLifecycle')({}),
      /id is required/
    )
  })
})

describe('IPC Handlers - updateLifecycle', () => {
  it('should update lifecycle fields', async () => {
    const lc = makeLifecycle('lc-1', 'Auth')
    const { context, handlers } = createMockContext()
    register(context, createDeps([lc]))

    const result = await handlers.get('updateLifecycle')({ id: 'lc-1', fields: { title: 'Auth v2' } })
    assert.strictEqual(result.title, 'Auth v2')
  })

  it('should throw when fields is missing', async () => {
    const { context, handlers } = createMockContext()
    register(context, createDeps([makeLifecycle('lc-1', 'Auth')]))

    await assert.rejects(
      handlers.get('updateLifecycle')({ id: 'lc-1' }),
      /fields object is required/
    )
  })

  it('should throw when lifecycle not found', async () => {
    const { context, handlers } = createMockContext()
    register(context, createDeps())

    await assert.rejects(
      handlers.get('updateLifecycle')({ id: 'nope', fields: { title: 'x' } }),
      /not found/
    )
  })
})

describe('IPC Handlers - deleteLifecycle', () => {
  it('should delete and return { deleted: true }', async () => {
    const lc = makeLifecycle('lc-1', 'Auth')
    const { context, handlers } = createMockContext()
    register(context, createDeps([lc]))

    const result = await handlers.get('deleteLifecycle')({ id: 'lc-1' })
    assert.strictEqual(result.deleted, true)
  })

  it('should return { deleted: false } for missing lifecycle', async () => {
    const { context, handlers } = createMockContext()
    register(context, createDeps())

    const result = await handlers.get('deleteLifecycle')({ id: 'nope' })
    assert.strictEqual(result.deleted, false)
  })
})

describe('IPC Handlers - listLifecycles', () => {
  it('should return all lifecycles', async () => {
    const lc1 = makeLifecycle('lc-1', 'Auth')
    const lc2 = makeLifecycle('lc-2', 'Onboarding')
    const { context, handlers } = createMockContext()
    register(context, createDeps([lc1, lc2]))

    const result = await handlers.get('listLifecycles')()
    assert.strictEqual(result.length, 2)
  })

  it('should filter by status', async () => {
    const lc1 = makeLifecycle('lc-1', 'Auth', { status: 'achieved' })
    const lc2 = makeLifecycle('lc-2', 'Onboarding', { status: 'not_started' })
    const { context, handlers } = createMockContext()
    register(context, createDeps([lc1, lc2]))

    const result = await handlers.get('listLifecycles')({ status: 'achieved' })
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].title, 'Auth')
  })
})

describe('IPC Handlers - mapStory / unmapStory', () => {
  it('should map a story to a lifecycle', async () => {
    const lc = makeLifecycle('lc-1', 'Auth')
    const { context, handlers } = createMockContext()
    register(context, createDeps([lc]))

    const result = await handlers.get('mapStory')({ lifecycleId: 'lc-1', storyId: 's-1' })
    assert.ok(result.storyMappings.includes('s-1'))
  })

  it('should unmap a story', async () => {
    const lc = makeLifecycle('lc-1', 'Auth', { storyMappings: ['s-1'] })
    const { context, handlers } = createMockContext()
    register(context, createDeps([lc]))

    const result = await handlers.get('unmapStory')({ lifecycleId: 'lc-1', storyId: 's-1' })
    assert.ok(!result.storyMappings.includes('s-1'))
  })

  it('should throw when lifecycleId missing', async () => {
    const { context, handlers } = createMockContext()
    register(context, createDeps())

    await assert.rejects(
      handlers.get('mapStory')({ storyId: 's-1' }),
      /lifecycleId is required/
    )
  })

  it('should throw when lifecycle not found', async () => {
    const { context, handlers } = createMockContext()
    register(context, createDeps())

    await assert.rejects(
      handlers.get('mapStory')({ lifecycleId: 'nope', storyId: 's-1' }),
      /not found/
    )
  })
})

describe('IPC Handlers - getStoriesForLifecycle / getLifecyclesForStory', () => {
  it('should return story IDs for a lifecycle', async () => {
    const lc = makeLifecycle('lc-1', 'Auth', { storyMappings: ['s-1', 's-2'] })
    const { context, handlers } = createMockContext()
    register(context, createDeps([lc]))

    const result = await handlers.get('getStoriesForLifecycle')({ lifecycleId: 'lc-1' })
    assert.deepStrictEqual(result, ['s-1', 's-2'])
  })

  it('should return lifecycles for a story', async () => {
    const lc1 = makeLifecycle('lc-1', 'Auth', { storyMappings: ['s-1'] })
    const lc2 = makeLifecycle('lc-2', 'Onboard', { storyMappings: ['s-1'] })
    const { context, handlers } = createMockContext()
    register(context, createDeps([lc1, lc2]))

    const result = await handlers.get('getLifecyclesForStory')({ storyId: 's-1' })
    assert.strictEqual(result.length, 2)
  })
})

describe('IPC Handlers - DAG operations', () => {
  it('should add a dependency', async () => {
    const lc1 = makeLifecycle('lc-1', 'Auth')
    const lc2 = makeLifecycle('lc-2', 'Onboard')
    const { context, handlers } = createMockContext()
    register(context, createDeps([lc1, lc2]))

    const result = await handlers.get('addDependency')({ fromId: 'lc-2', toId: 'lc-1' })
    assert.ok(result.dependencies.includes('lc-1'))
  })

  it('should remove a dependency', async () => {
    const lc1 = makeLifecycle('lc-1', 'Auth')
    const lc2 = makeLifecycle('lc-2', 'Onboard', { dependencies: ['lc-1'] })
    const { context, handlers } = createMockContext()
    register(context, createDeps([lc1, lc2]))

    const result = await handlers.get('removeDependency')({ fromId: 'lc-2', toId: 'lc-1' })
    assert.ok(!result.dependencies.includes('lc-1'))
  })

  it('should throw when fromId missing', async () => {
    const { context, handlers } = createMockContext()
    register(context, createDeps())

    await assert.rejects(
      handlers.get('addDependency')({ toId: 'lc-1' }),
      /fromId is required/
    )
  })

  it('should return serialized DAG', async () => {
    const lc1 = makeLifecycle('lc-1', 'Auth')
    const lc2 = makeLifecycle('lc-2', 'Onboard', { dependencies: ['lc-1'] })
    const { context, handlers } = createMockContext()
    register(context, createDeps([lc1, lc2]))

    const result = await handlers.get('getDag')()
    assert.ok(Array.isArray(result.nodes))
    assert.ok(Array.isArray(result.edges))
    assert.strictEqual(result.nodes.length, 2)
    assert.strictEqual(result.edges.length, 1)
  })
})
