'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { queryModel, extractSubgraph, buildNodeSummary } = require('../../h-dsl-engine/lib/query-interface')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSchema() {
  return {
    elementTypes: {
      module: { description: 'A JS module', fields: { exports: {}, imports: {} } },
      component: { description: 'A UI component', fields: { props: {} } },
      service: { description: 'A backend service', fields: { endpoints: {} } }
    }
  }
}

function makeInstance() {
  return {
    artifacts: {
      'src/index.js': { type: 'module', kind: 'entry', summary: 'Main entry point', intent: 'Bootstrap the app', size: 1200, tags: ['core'], exports: ['main'] },
      'src/utils.js': { type: 'module', kind: 'utility', summary: 'Helper functions', size: 800, tags: ['util'] },
      'src/App.jsx': { type: 'component', kind: 'view', summary: 'Root UI component', size: 2400, tags: ['ui', 'core'] },
      'src/lib/api.js': { type: 'module', kind: 'service', summary: 'API client for backend', intent: 'HTTP requests', size: 3000, tags: ['api'] },
      'src/lib/auth.js': { type: 'service', kind: 'service', summary: 'Authentication service', size: 1500, tags: ['auth'] },
      'src/components/Header.jsx': { type: 'component', kind: 'view', summary: 'Page header', size: 600, tags: ['ui'] }
    },
    dependencies: [
      { from: 'src/index.js', to: 'src/App.jsx', kind: 'import', weight: 1 },
      { from: 'src/index.js', to: 'src/utils.js', kind: 'import', weight: 1 },
      { from: 'src/App.jsx', to: 'src/lib/api.js', kind: 'import', weight: 1 },
      { from: 'src/App.jsx', to: 'src/utils.js', kind: 'call', weight: 0.5 },
      { from: 'src/App.jsx', to: 'src/components/Header.jsx', kind: 'import', weight: 1 },
      { from: 'src/lib/api.js', to: 'src/lib/auth.js', kind: 'import', weight: 1 },
      { from: 'src/components/Header.jsx', to: 'src/utils.js', kind: 'call', weight: 0.5 }
    ],
    flows: {}
  }
}

// ---------------------------------------------------------------------------
// buildNodeSummary
// ---------------------------------------------------------------------------

describe('buildNodeSummary', () => {
  it('builds compact summary from artifact', () => {
    const n = buildNodeSummary('src/index.js', makeInstance().artifacts['src/index.js'])
    assert.equal(n.path, 'src/index.js')
    assert.equal(n.type, 'module')
    assert.equal(n.kind, 'entry')
    assert.equal(n.summary, 'Main entry point')
    assert.deepEqual(n.exports, ['main'])
  })

  it('handles missing optional fields', () => {
    const n = buildNodeSummary('x.js', { type: 'module' })
    assert.equal(n.kind, null)
    assert.equal(n.summary, null)
    assert.deepEqual(n.tags, [])
  })
})

// ---------------------------------------------------------------------------
// extractSubgraph
// ---------------------------------------------------------------------------

describe('extractSubgraph', () => {
  it('returns root and depth-1 neighbors', () => {
    const instance = makeInstance()
    const { nodes, edges } = extractSubgraph(instance, new Set(['src/App.jsx']), 1)
    const paths = nodes.map(n => n.path)
    assert.ok(paths.includes('src/App.jsx'))
    // Neighbors: index.js (inbound), api.js, utils.js, Header.jsx (outbound)
    assert.ok(paths.includes('src/index.js'))
    assert.ok(paths.includes('src/lib/api.js'))
    assert.ok(edges.length >= 4)
  })

  it('depth 0 returns only root nodes with no expansion', () => {
    const instance = makeInstance()
    const { nodes, edges } = extractSubgraph(instance, new Set(['src/utils.js']), 0)
    assert.equal(nodes.length, 1)
    assert.equal(nodes[0].path, 'src/utils.js')
    assert.equal(edges.length, 0)
  })
})

// ---------------------------------------------------------------------------
// entity query
// ---------------------------------------------------------------------------

describe('queryModel — entity', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('finds entities by name pattern and returns subgraph', () => {
    const r = queryModel({ schema, instance, query: { type: 'entity', name: 'App*' } })
    assert.equal(r.queryType, 'entity')
    assert.ok(r.nodeCount >= 1)
    // Root node should be App.jsx
    assert.ok(r.nodes.some(n => n.path === 'src/App.jsx'))
    // Should have edges
    assert.ok(r.edgeCount > 0)
  })

  it('filters by entityType', () => {
    const r = queryModel({ schema, instance, query: { type: 'entity', name: '*', entityType: 'component' } })
    // Root matches are only components, but neighbors may be other types
    const componentNodes = r.nodes.filter(n => n.type === 'component')
    assert.ok(componentNodes.length >= 2)
  })

  it('enriches nodes with typeDescription', () => {
    const r = queryModel({ schema, instance, query: { type: 'entity', name: 'index*' } })
    const indexNode = r.nodes.find(n => n.path === 'src/index.js')
    assert.equal(indexNode.typeDescription, 'A JS module')
  })

  it('respects depth parameter', () => {
    const d0 = queryModel({ schema, instance, query: { type: 'entity', name: 'src/lib/auth*', depth: 0 } })
    const d1 = queryModel({ schema, instance, query: { type: 'entity', name: 'src/lib/auth*', depth: 1 } })
    assert.ok(d1.nodeCount > d0.nodeCount)
  })

  it('throws without name', () => {
    assert.throws(
      () => queryModel({ schema, instance, query: { type: 'entity' } }),
      /name/
    )
  })
})

// ---------------------------------------------------------------------------
// relation query
// ---------------------------------------------------------------------------

describe('queryModel — relation', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('finds relations from a source pattern', () => {
    const r = queryModel({ schema, instance, query: { type: 'relation', from: 'src/App*' } })
    assert.equal(r.queryType, 'relation')
    assert.ok(r.edgeCount >= 3) // App has 3 outbound deps
  })

  it('finds relations to a target', () => {
    const r = queryModel({ schema, instance, query: { type: 'relation', to: 'src/utils*' } })
    // utils.js has 3 inbound deps
    assert.ok(r.edgeCount >= 3)
  })

  it('filters by depKind', () => {
    const r = queryModel({ schema, instance, query: { type: 'relation', from: 'src/App*', depKind: 'call' } })
    assert.equal(r.edgeCount, 1)
    assert.equal(r.edges[0].kind, 'call')
  })

  it('finds relations by name (either end)', () => {
    const r = queryModel({ schema, instance, query: { type: 'relation', name: '*auth*' } })
    assert.ok(r.edgeCount >= 1)
    assert.ok(r.edges.some(e => e.from.includes('auth') || e.to.includes('auth')))
  })

  it('includes involved nodes', () => {
    const r = queryModel({ schema, instance, query: { type: 'relation', from: 'src/index*' } })
    assert.ok(r.nodes.some(n => n.path === 'src/index.js'))
    assert.ok(r.nodes.some(n => n.path === 'src/App.jsx'))
  })

  it('throws without from/to/name', () => {
    assert.throws(
      () => queryModel({ schema, instance, query: { type: 'relation' } }),
      /from.*to.*name/i
    )
  })
})

// ---------------------------------------------------------------------------
// structure query
// ---------------------------------------------------------------------------

describe('queryModel — structure', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('returns directory tree and type breakdown', () => {
    const r = queryModel({ schema, instance, query: { type: 'structure' } })
    assert.equal(r.queryType, 'structure')
    assert.equal(r.totalArtifacts, 6)
    assert.ok(r.byType.module >= 3)
    assert.ok(r.byType.component >= 2)
    assert.ok(r.tree.src)
  })

  it('filters by pattern', () => {
    const r = queryModel({ schema, instance, query: { type: 'structure', name: 'src/lib*' } })
    assert.equal(r.totalArtifacts, 2)
  })

  it('filters by entityType', () => {
    const r = queryModel({ schema, instance, query: { type: 'structure', entityType: 'component' } })
    assert.equal(r.totalArtifacts, 2)
    assert.deepEqual(r.byType, { component: 2 })
  })

  it('includes type descriptions from schema', () => {
    const r = queryModel({ schema, instance, query: { type: 'structure' } })
    assert.equal(r.typeDescriptions.module, 'A JS module')
    assert.equal(r.typeDescriptions.component, 'A UI component')
  })
})

// ---------------------------------------------------------------------------
// impact query
// ---------------------------------------------------------------------------

describe('queryModel — impact', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('returns transitive dependency graph', () => {
    const r = queryModel({ schema, instance, query: { type: 'impact', name: 'src/index*', depth: 3 } })
    assert.equal(r.queryType, 'impact')
    // index -> App, utils; App -> api, utils, Header; api -> auth; Header -> utils
    assert.ok(r.nodeCount >= 5)
    assert.ok(r.edgeCount >= 5)
  })

  it('marks root nodes', () => {
    const r = queryModel({ schema, instance, query: { type: 'impact', name: 'src/index*', depth: 1 } })
    const root = r.nodes.find(n => n.path === 'src/index.js')
    assert.equal(root.isRoot, true)
    const neighbor = r.nodes.find(n => n.path === 'src/App.jsx')
    assert.equal(neighbor.isRoot, false)
  })

  it('returns layers showing BFS depth', () => {
    const r = queryModel({ schema, instance, query: { type: 'impact', name: 'src/index*', depth: 2 } })
    assert.ok(r.layers.length >= 2)
    assert.equal(r.layers[0].depth, 0)
    assert.deepEqual(r.layers[0].artifacts, ['src/index.js'])
  })

  it('supports direction filtering', () => {
    const outOnly = queryModel({ schema, instance, query: { type: 'impact', name: 'src/App*', depth: 1, direction: 'outbound' } })
    const inOnly = queryModel({ schema, instance, query: { type: 'impact', name: 'src/App*', depth: 1, direction: 'inbound' } })
    // Outbound: api, utils, Header. Inbound: index
    assert.ok(outOnly.nodeCount >= 4)
    assert.ok(inOnly.nodeCount >= 2)
  })

  it('returns empty result for non-matching pattern', () => {
    const r = queryModel({ schema, instance, query: { type: 'impact', name: 'nonexistent*' } })
    assert.equal(r.nodeCount, 0)
    assert.equal(r.edgeCount, 0)
  })

  it('throws without name', () => {
    assert.throws(
      () => queryModel({ schema, instance, query: { type: 'impact' } }),
      /name/
    )
  })
})

// ---------------------------------------------------------------------------
// unknown query type
// ---------------------------------------------------------------------------

describe('queryModel — unknown type', () => {
  it('throws for unknown query type', () => {
    assert.throws(
      () => queryModel({ schema: makeSchema(), instance: makeInstance(), query: { type: 'foobar' } }),
      /Unknown query type/
    )
  })
})
