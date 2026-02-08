'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { navigate, walk, findPath, getEntityNeighbors, buildAdjacency } = require('../../h-dsl-engine/lib/graph-navigator')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInstance() {
  return {
    artifacts: {
      'src/index.js': { type: 'module', kind: 'entry', summary: 'Main entry', exports: ['main'], tags: ['core'] },
      'src/App.jsx': { type: 'component', kind: 'view', summary: 'Root component', exports: ['App'], tags: ['ui'] },
      'src/utils.js': { type: 'module', kind: 'utility', summary: 'Helpers', exports: ['format'], tags: ['util'] },
      'src/services/api.js': { type: 'module', kind: 'service', summary: 'API client', exports: ['get'], tags: ['api'] },
      'src/services/auth.js': { type: 'module', kind: 'service', summary: 'Auth service', exports: ['login'], tags: ['auth'] },
      'src/models/User.js': { type: 'module', kind: 'model', summary: 'User model', exports: ['User'], tags: ['model'] },
      'src/components/Header.jsx': { type: 'component', kind: 'view', summary: 'Header', exports: ['Header'], tags: ['ui'] }
    },
    dependencies: [
      { from: 'src/index.js', to: 'src/App.jsx', kind: 'import', weight: 1 },
      { from: 'src/index.js', to: 'src/utils.js', kind: 'import', weight: 1 },
      { from: 'src/App.jsx', to: 'src/services/api.js', kind: 'import', weight: 1 },
      { from: 'src/App.jsx', to: 'src/utils.js', kind: 'call', weight: 0.5 },
      { from: 'src/App.jsx', to: 'src/components/Header.jsx', kind: 'import', weight: 1 },
      { from: 'src/services/api.js', to: 'src/services/auth.js', kind: 'import', weight: 1 },
      { from: 'src/services/api.js', to: 'src/models/User.js', kind: 'import', weight: 1 },
      { from: 'src/models/User.js', to: 'src/utils.js', kind: 'call', weight: 0.5 },
      { from: 'src/components/Header.jsx', to: 'src/utils.js', kind: 'call', weight: 0.5 }
    ]
  }
}

// ---------------------------------------------------------------------------
// buildAdjacency
// ---------------------------------------------------------------------------

describe('buildAdjacency', () => {
  it('builds full adjacency when no type filter', () => {
    const { outAdj, inAdj } = buildAdjacency(makeInstance().dependencies, undefined)
    assert.ok(outAdj.has('src/index.js'))
    assert.equal(outAdj.get('src/index.js').length, 2)
    assert.ok(inAdj.has('src/utils.js'))
  })

  it('filters by relationship type', () => {
    const { outAdj } = buildAdjacency(makeInstance().dependencies, ['import'])
    // App.jsx has 2 import deps and 1 call dep; should only see 2
    assert.equal(outAdj.get('src/App.jsx').length, 2)
  })

  it('excludes non-matching types', () => {
    const { outAdj } = buildAdjacency(makeInstance().dependencies, ['extends'])
    assert.equal(outAdj.size, 0)
  })
})

// ---------------------------------------------------------------------------
// walk
// ---------------------------------------------------------------------------

describe('walk', () => {
  const instance = makeInstance()

  it('walks outgoing from a starting entity', () => {
    const r = walk({ instance, options: { start: 'src/index.js', direction: 'outgoing', maxDepth: 1 } })
    assert.equal(r.operation, 'walk')
    assert.ok(r.nodes.some(n => n.path === 'src/App.jsx'))
    assert.ok(r.nodes.some(n => n.path === 'src/utils.js'))
  })

  it('walks incoming to a target entity', () => {
    const r = walk({ instance, options: { start: 'src/utils.js', direction: 'incoming', maxDepth: 1 } })
    // Who depends on utils: index.js, App.jsx, User.js, Header.jsx
    assert.ok(r.nodeCount >= 4)
  })

  it('filters by relationship type', () => {
    const r = walk({ instance, options: { start: 'src/App.jsx', direction: 'outgoing', relationshipTypes: ['call'], maxDepth: 1 } })
    // Only call deps from App: utils.js
    assert.equal(r.nodes.filter(n => n.path !== 'src/App.jsx').length, 1)
    assert.ok(r.nodes.some(n => n.path === 'src/utils.js'))
  })

  it('respects maxDepth', () => {
    const d1 = walk({ instance, options: { start: 'src/index.js', direction: 'outgoing', maxDepth: 1 } })
    const d3 = walk({ instance, options: { start: 'src/index.js', direction: 'outgoing', maxDepth: 3 } })
    assert.ok(d3.nodeCount >= d1.nodeCount)
  })

  it('returns layers showing BFS depth', () => {
    const r = walk({ instance, options: { start: 'src/index.js', direction: 'outgoing', maxDepth: 2 } })
    assert.equal(r.layers[0].depth, 0)
    assert.deepEqual(r.layers[0].artifacts, ['src/index.js'])
    assert.equal(r.layers[1].depth, 1)
  })

  it('respects limit', () => {
    const r = walk({ instance, options: { start: 'src/index.js', direction: 'outgoing', maxDepth: 10, limit: 3 } })
    assert.ok(r.nodeCount <= 3)
  })

  it('returns empty for non-matching start', () => {
    const r = walk({ instance, options: { start: 'nonexistent*' } })
    assert.equal(r.nodes.length, 0)
  })

  it('throws without start', () => {
    assert.throws(() => walk({ instance, options: {} }), /start/)
  })
})

// ---------------------------------------------------------------------------
// findPath
// ---------------------------------------------------------------------------

describe('findPath', () => {
  const instance = makeInstance()

  it('finds path between connected entities', () => {
    const r = findPath({ instance, options: { from: 'src/index.js', to: 'src/services/auth.js' } })
    assert.equal(r.found, true)
    assert.ok(r.length >= 2) // index -> App -> api -> auth (or shorter)
    assert.equal(r.steps[0], 'src/index.js')
    assert.equal(r.steps[r.steps.length - 1], 'src/services/auth.js')
  })

  it('returns path edges', () => {
    const r = findPath({ instance, options: { from: 'src/index.js', to: 'src/App.jsx' } })
    assert.equal(r.found, true)
    assert.equal(r.length, 1)
    assert.equal(r.edges.length, 1)
    assert.equal(r.edges[0].kind, 'import')
  })

  it('includes pathNodes with details', () => {
    const r = findPath({ instance, options: { from: 'src/index.js', to: 'src/App.jsx' } })
    assert.equal(r.pathNodes.length, 2)
    assert.equal(r.pathNodes[0].type, 'module')
    assert.equal(r.pathNodes[1].type, 'component')
  })

  it('returns not-found for disconnected entities', () => {
    // Create an instance with an isolated node
    const inst = makeInstance()
    inst.artifacts['isolated.js'] = { type: 'module', kind: 'orphan', exports: [] }
    const r = findPath({ instance: inst, options: { from: 'isolated.js', to: 'src/index.js', maxDepth: 5 } })
    assert.equal(r.found, false)
  })

  it('returns not-found for nonexistent entity', () => {
    const r = findPath({ instance, options: { from: 'ghost.js', to: 'src/index.js' } })
    assert.equal(r.found, false)
    assert.ok(r.reason.includes('not found'))
  })

  it('respects relationship type filter', () => {
    // With only call edges, index.js can't reach auth.js (only import edges connect them)
    const r = findPath({ instance, options: { from: 'src/index.js', to: 'src/services/auth.js', relationshipTypes: ['call'] } })
    assert.equal(r.found, false)
  })

  it('throws without from/to', () => {
    assert.throws(() => findPath({ instance, options: { from: 'a' } }), /from.*to/)
  })
})

// ---------------------------------------------------------------------------
// getEntityNeighbors
// ---------------------------------------------------------------------------

describe('getEntityNeighbors', () => {
  const instance = makeInstance()

  it('returns neighbors grouped by relationship kind', () => {
    const r = getEntityNeighbors({ instance, options: { entity: 'src/App.jsx', direction: 'both' } })
    const app = r.entities[0]
    assert.equal(app.path, 'src/App.jsx')
    assert.ok(app.outgoing.import.length >= 2)
    assert.ok(app.outgoing.call.length >= 1)
    assert.ok(app.incoming.import.length >= 1)
  })

  it('only outgoing when direction is outgoing', () => {
    const r = getEntityNeighbors({ instance, options: { entity: 'src/App.jsx', direction: 'outgoing' } })
    const app = r.entities[0]
    assert.ok(app.outgoing)
    assert.equal(app.incoming, undefined)
  })

  it('only incoming when direction is incoming', () => {
    const r = getEntityNeighbors({ instance, options: { entity: 'src/utils.js', direction: 'incoming' } })
    const utils = r.entities[0]
    assert.equal(utils.outgoing, undefined)
    assert.ok(utils.incoming)
    assert.ok(utils.incomingCount >= 4)
  })

  it('includes neighbor metadata', () => {
    const r = getEntityNeighbors({ instance, options: { entity: 'src/index.js', direction: 'outgoing' } })
    const idx = r.entities[0]
    const importNeighbors = idx.outgoing.import
    assert.ok(importNeighbors.some(n => n.path === 'src/App.jsx' && n.type === 'component'))
  })

  it('returns empty for non-matching entity', () => {
    const r = getEntityNeighbors({ instance, options: { entity: 'ghost*' } })
    assert.equal(r.entities.length, 0)
  })

  it('throws without entity', () => {
    assert.throws(() => getEntityNeighbors({ instance, options: {} }), /entity/)
  })
})

// ---------------------------------------------------------------------------
// navigate dispatcher
// ---------------------------------------------------------------------------

describe('navigate', () => {
  const instance = makeInstance()

  it('dispatches walk operation', () => {
    const r = navigate({ instance, options: { operation: 'walk', start: 'src/index.js', maxDepth: 1 } })
    assert.equal(r.operation, 'walk')
  })

  it('dispatches path operation', () => {
    const r = navigate({ instance, options: { operation: 'path', from: 'src/index.js', to: 'src/App.jsx' } })
    assert.equal(r.operation, 'path')
  })

  it('dispatches neighbors operation', () => {
    const r = navigate({ instance, options: { operation: 'neighbors', entity: 'src/App.jsx' } })
    assert.equal(r.operation, 'neighbors')
  })

  it('throws for unknown operation', () => {
    assert.throws(() => navigate({ instance, options: { operation: 'teleport' } }), /Unknown/)
  })
})
