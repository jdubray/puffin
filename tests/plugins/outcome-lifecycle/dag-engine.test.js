/**
 * Tests for DAG Engine
 */

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const { DAGEngine } = require('../../../plugins/outcome-lifecycle-plugin/lib/dag-engine')
const { LifecycleRepository } = require('../../../plugins/outcome-lifecycle-plugin/lib/lifecycle-repository')

/** In-memory mock storage */
class MockStorage {
  constructor() {
    this.data = { version: 1, lifecycles: [] }
  }
  async load() { return this.data }
  async save(d) { this.data = d }
}

/**
 * Helper: create a lifecycle directly in storage and return it.
 */
function addLifecycle(storage, id, title, deps = []) {
  const now = new Date().toISOString()
  const lc = {
    id, title, description: '',
    status: 'not_started', dependencies: deps,
    storyMappings: [], createdAt: now, updatedAt: now
  }
  storage.data.lifecycles.push(lc)
  return lc
}

describe('DAGEngine', () => {
  let storage, repo, dag

  beforeEach(() => {
    storage = new MockStorage()
    repo = new LifecycleRepository(storage)
    dag = new DAGEngine(repo)
  })

  // --- Constructor ---

  it('should throw if no repository provided', () => {
    assert.throws(() => new DAGEngine(null), /requires a LifecycleRepository/)
  })

  // --- addDependency ---

  describe('addDependency', () => {
    it('should add a dependency', async () => {
      addLifecycle(storage, 'a', 'A')
      addLifecycle(storage, 'b', 'B')

      const result = await dag.addDependency('a', 'b')
      assert.deepStrictEqual(result.dependencies, ['b'])
    })

    it('should reject self-dependency', async () => {
      addLifecycle(storage, 'a', 'A')
      await assert.rejects(() => dag.addDependency('a', 'a'), /cannot depend on itself/)
    })

    it('should reject missing fromId', async () => {
      await assert.rejects(() => dag.addDependency(null, 'b'), /required/)
    })

    it('should reject missing toId', async () => {
      await assert.rejects(() => dag.addDependency('a', null), /required/)
    })

    it('should reject if from lifecycle not found', async () => {
      addLifecycle(storage, 'b', 'B')
      await assert.rejects(() => dag.addDependency('missing', 'b'), /not found/)
    })

    it('should reject if to lifecycle not found', async () => {
      addLifecycle(storage, 'a', 'A')
      await assert.rejects(() => dag.addDependency('a', 'missing'), /not found/)
    })

    it('should silently skip duplicate dependency', async () => {
      addLifecycle(storage, 'a', 'A', ['b'])
      addLifecycle(storage, 'b', 'B')

      const result = await dag.addDependency('a', 'b')
      assert.deepStrictEqual(result.dependencies, ['b'])
    })

    it('should detect direct cycle', async () => {
      addLifecycle(storage, 'a', 'A', ['b'])
      addLifecycle(storage, 'b', 'B')

      await assert.rejects(
        () => dag.addDependency('b', 'a'),
        /would create a cycle/
      )
      // Verify rollback
      const b = storage.data.lifecycles.find(lc => lc.id === 'b')
      assert.deepStrictEqual(b.dependencies, [])
    })

    it('should detect transitive cycle', async () => {
      addLifecycle(storage, 'a', 'A', ['b'])
      addLifecycle(storage, 'b', 'B', ['c'])
      addLifecycle(storage, 'c', 'C')

      await assert.rejects(
        () => dag.addDependency('c', 'a'),
        /would create a cycle/
      )
    })

    it('should allow diamond dependency (no cycle)', async () => {
      // a -> b, a -> c, b -> d, c -> d
      addLifecycle(storage, 'd', 'D')
      addLifecycle(storage, 'b', 'B', ['d'])
      addLifecycle(storage, 'c', 'C', ['d'])
      addLifecycle(storage, 'a', 'A', ['b', 'c'])

      // Should not throw — it's a DAG
      const sorted = await dag.topologicalSort()
      assert.strictEqual(sorted.length, 4)
    })
  })

  // --- removeDependency ---

  describe('removeDependency', () => {
    it('should remove an existing dependency', async () => {
      addLifecycle(storage, 'a', 'A', ['b'])
      addLifecycle(storage, 'b', 'B')

      const result = await dag.removeDependency('a', 'b')
      assert.deepStrictEqual(result.dependencies, [])
    })

    it('should return lifecycle unchanged if dep not present', async () => {
      addLifecycle(storage, 'a', 'A')
      const result = await dag.removeDependency('a', 'x')
      assert.deepStrictEqual(result.dependencies, [])
    })

    it('should return null for missing lifecycle', async () => {
      const result = await dag.removeDependency('missing', 'b')
      assert.strictEqual(result, null)
    })

    it('should return null for null args', async () => {
      assert.strictEqual(await dag.removeDependency(null, 'b'), null)
      assert.strictEqual(await dag.removeDependency('a', null), null)
    })
  })

  // --- getDependencies ---

  describe('getDependencies', () => {
    it('should return dependency ids', async () => {
      addLifecycle(storage, 'a', 'A', ['b', 'c'])
      addLifecycle(storage, 'b', 'B')
      addLifecycle(storage, 'c', 'C')

      const deps = await dag.getDependencies('a')
      assert.deepStrictEqual(deps, ['b', 'c'])
    })

    it('should return empty for unknown id', async () => {
      assert.deepStrictEqual(await dag.getDependencies('x'), [])
    })

    it('should return defensive copy', async () => {
      addLifecycle(storage, 'a', 'A', ['b'])
      const deps = await dag.getDependencies('a')
      deps.push('mutated')
      const deps2 = await dag.getDependencies('a')
      assert.deepStrictEqual(deps2, ['b'])
    })
  })

  // --- getDependents ---

  describe('getDependents', () => {
    it('should return ids of dependents', async () => {
      addLifecycle(storage, 'a', 'A', ['c'])
      addLifecycle(storage, 'b', 'B', ['c'])
      addLifecycle(storage, 'c', 'C')

      const dependents = await dag.getDependents('c')
      assert.deepStrictEqual(dependents.sort(), ['a', 'b'])
    })

    it('should return empty if no dependents', async () => {
      addLifecycle(storage, 'a', 'A')
      assert.deepStrictEqual(await dag.getDependents('a'), [])
    })

    it('should return empty for null', async () => {
      assert.deepStrictEqual(await dag.getDependents(null), [])
    })
  })

  // --- topologicalSort ---

  describe('topologicalSort', () => {
    it('should return empty for no lifecycles', async () => {
      const sorted = await dag.topologicalSort()
      assert.deepStrictEqual(sorted, [])
    })

    it('should return single node', async () => {
      addLifecycle(storage, 'a', 'A')
      const sorted = await dag.topologicalSort()
      assert.deepStrictEqual(sorted, ['a'])
    })

    it('should return valid order for linear chain', async () => {
      addLifecycle(storage, 'a', 'A', ['b'])
      addLifecycle(storage, 'b', 'B', ['c'])
      addLifecycle(storage, 'c', 'C')

      const sorted = await dag.topologicalSort()
      // c must come before b, b before a
      assert.ok(sorted.indexOf('c') < sorted.indexOf('b'))
      assert.ok(sorted.indexOf('b') < sorted.indexOf('a'))
    })

    it('should return valid order for diamond', async () => {
      addLifecycle(storage, 'd', 'D')
      addLifecycle(storage, 'b', 'B', ['d'])
      addLifecycle(storage, 'c', 'C', ['d'])
      addLifecycle(storage, 'a', 'A', ['b', 'c'])

      const sorted = await dag.topologicalSort()
      assert.ok(sorted.indexOf('d') < sorted.indexOf('b'))
      assert.ok(sorted.indexOf('d') < sorted.indexOf('c'))
      assert.ok(sorted.indexOf('b') < sorted.indexOf('a'))
      assert.ok(sorted.indexOf('c') < sorted.indexOf('a'))
    })

    it('should handle disconnected components', async () => {
      addLifecycle(storage, 'a', 'A')
      addLifecycle(storage, 'b', 'B')
      addLifecycle(storage, 'c', 'C')

      const sorted = await dag.topologicalSort()
      assert.strictEqual(sorted.length, 3)
    })

    it('should throw on cycle', async () => {
      // Manually create a cycle in storage
      addLifecycle(storage, 'a', 'A', ['b'])
      addLifecycle(storage, 'b', 'B', ['a'])

      await assert.rejects(
        () => dag.topologicalSort(),
        /Circular dependency detected/
      )
    })

    it('should include cycle node names in error', async () => {
      addLifecycle(storage, 'a', 'Alpha', ['b'])
      addLifecycle(storage, 'b', 'Beta', ['a'])

      await assert.rejects(
        () => dag.topologicalSort(),
        (err) => {
          assert.ok(err.message.includes('Alpha'))
          assert.ok(err.message.includes('Beta'))
          return true
        }
      )
    })
  })

  // --- serialize ---

  describe('serialize', () => {
    it('should return empty graph for no lifecycles', async () => {
      const graph = await dag.serialize()
      assert.deepStrictEqual(graph, { nodes: [], edges: [] })
    })

    it('should serialize single node at origin', async () => {
      addLifecycle(storage, 'a', 'A')
      const graph = await dag.serialize()

      assert.strictEqual(graph.nodes.length, 1)
      assert.strictEqual(graph.nodes[0].id, 'a')
      assert.strictEqual(graph.nodes[0].title, 'A')
      assert.strictEqual(graph.nodes[0].x, 0)
      assert.strictEqual(graph.nodes[0].y, 0)
      assert.deepStrictEqual(graph.edges, [])
    })

    it('should place dependent in deeper layer', async () => {
      addLifecycle(storage, 'a', 'A', ['b'])
      addLifecycle(storage, 'b', 'B')

      const graph = await dag.serialize()
      const nodeA = graph.nodes.find(n => n.id === 'a')
      const nodeB = graph.nodes.find(n => n.id === 'b')

      // b is root (layer 0), a depends on b (layer 1)
      assert.ok(nodeB.x < nodeA.x)
    })

    it('should produce correct edges', async () => {
      addLifecycle(storage, 'a', 'A', ['b'])
      addLifecycle(storage, 'b', 'B')

      const graph = await dag.serialize()
      assert.strictEqual(graph.edges.length, 1)
      assert.deepStrictEqual(graph.edges[0], { from: 'b', to: 'a' })
    })

    it('should include status on nodes', async () => {
      const lc = addLifecycle(storage, 'a', 'A')
      lc.status = 'achieved'

      const graph = await dag.serialize()
      assert.strictEqual(graph.nodes[0].status, 'achieved')
    })

    it('should handle diamond layout', async () => {
      addLifecycle(storage, 'd', 'D')
      addLifecycle(storage, 'b', 'B', ['d'])
      addLifecycle(storage, 'c', 'C', ['d'])
      addLifecycle(storage, 'a', 'A', ['b', 'c'])

      const graph = await dag.serialize()
      assert.strictEqual(graph.nodes.length, 4)
      assert.strictEqual(graph.edges.length, 4)
    })
  })
})
