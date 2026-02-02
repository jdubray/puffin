'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { executeQuery, patternToRegex } = require('../../h-dsl-engine/lib/explorer')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSchema() {
  return {
    elementTypes: {
      module: { description: 'A JS module', fields: { exports: {}, imports: {} } },
      component: { description: 'A UI component', fields: { props: {} } }
    }
  }
}

function makeInstance() {
  return {
    artifacts: {
      'src/index.js': { type: 'module', kind: 'entry', summary: 'Main entry point', intent: 'Bootstrap the app', size: 1200, tags: ['core'], exports: ['main'] },
      'src/utils.js': { type: 'module', kind: 'utility', summary: 'Helper functions', size: 800, tags: ['util'] },
      'src/App.jsx': { type: 'component', kind: 'view', summary: 'Root UI component', size: 2400, tags: ['ui', 'core'] },
      'src/lib/api.js': { type: 'module', kind: 'service', summary: 'API client for backend', intent: 'HTTP requests', size: 3000, tags: ['api'] }
    },
    dependencies: [
      { from: 'src/index.js', to: 'src/App.jsx', kind: 'import', weight: 1 },
      { from: 'src/index.js', to: 'src/utils.js', kind: 'import', weight: 1 },
      { from: 'src/App.jsx', to: 'src/lib/api.js', kind: 'import', weight: 1 },
      { from: 'src/App.jsx', to: 'src/utils.js', kind: 'call', weight: 0.5 }
    ],
    flows: {
      startup: { summary: 'App startup flow', steps: [{ artifact: 'src/index.js', action: 'init' }] },
      render: { summary: 'Render cycle', steps: [{ artifact: 'src/App.jsx', action: 'render' }, { artifact: 'src/utils.js', action: 'format' }] }
    }
  }
}

// ---------------------------------------------------------------------------
// patternToRegex
// ---------------------------------------------------------------------------

describe('patternToRegex', () => {
  it('converts wildcard to regex', () => {
    const re = patternToRegex('src/*.js')
    assert.ok(re.test('src/index.js'))
    assert.ok(!re.test('lib/index.js'))
  })

  it('is case-insensitive', () => {
    const re = patternToRegex('App')
    assert.ok(re.test('src/App.jsx'))
    assert.ok(re.test('src/app.jsx'))
  })

  it('escapes special regex characters', () => {
    const re = patternToRegex('src/lib/api.js')
    assert.ok(re.test('src/lib/api.js'))
    assert.ok(!re.test('src/libXapi.js'))
  })
})

// ---------------------------------------------------------------------------
// artifact query
// ---------------------------------------------------------------------------

describe('executeQuery — artifact', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('returns all artifacts without filters', () => {
    const r = executeQuery({ schema, instance, query: { type: 'artifact' } })
    assert.equal(r.queryType, 'artifact')
    assert.equal(r.count, 4)
  })

  it('filters by pattern', () => {
    const r = executeQuery({ schema, instance, query: { type: 'artifact', pattern: '*utils*' } })
    assert.equal(r.count, 1)
    assert.equal(r.results[0].path, 'src/utils.js')
  })

  it('filters by elementType', () => {
    const r = executeQuery({ schema, instance, query: { type: 'artifact', elementType: 'component' } })
    assert.equal(r.count, 1)
    assert.equal(r.results[0].path, 'src/App.jsx')
  })

  it('filters by kind', () => {
    const r = executeQuery({ schema, instance, query: { type: 'artifact', kind: 'service' } })
    assert.equal(r.count, 1)
    assert.equal(r.results[0].path, 'src/lib/api.js')
  })

  it('respects limit', () => {
    const r = executeQuery({ schema, instance, query: { type: 'artifact', limit: 2 } })
    assert.equal(r.count, 2)
    assert.equal(r.total, 4)
  })
})

// ---------------------------------------------------------------------------
// deps query
// ---------------------------------------------------------------------------

describe('executeQuery — deps', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('returns outbound deps', () => {
    const r = executeQuery({ schema, instance, query: { type: 'deps', artifact: 'src/index.js', direction: 'outbound' } })
    assert.equal(r.count, 2)
  })

  it('returns inbound deps', () => {
    const r = executeQuery({ schema, instance, query: { type: 'deps', artifact: 'src/utils.js', direction: 'inbound' } })
    assert.equal(r.count, 2)
  })

  it('returns both directions', () => {
    const r = executeQuery({ schema, instance, query: { type: 'deps', artifact: 'src/App.jsx', direction: 'both' } })
    assert.ok(r.count >= 3) // 1 inbound + 2 outbound
  })

  it('filters by dep kind', () => {
    const r = executeQuery({ schema, instance, query: { type: 'deps', artifact: 'src/App.jsx', direction: 'outbound', kind: 'call' } })
    assert.equal(r.count, 1)
    assert.equal(r.results[0].to, 'src/utils.js')
  })

  it('throws without artifact field', () => {
    assert.throws(
      () => executeQuery({ schema, instance, query: { type: 'deps' } }),
      /artifact/
    )
  })
})

// ---------------------------------------------------------------------------
// flow query
// ---------------------------------------------------------------------------

describe('executeQuery — flow', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('returns all flows', () => {
    const r = executeQuery({ schema, instance, query: { type: 'flow' } })
    assert.equal(r.count, 2)
  })

  it('filters by pattern', () => {
    const r = executeQuery({ schema, instance, query: { type: 'flow', pattern: 'start*' } })
    assert.equal(r.count, 1)
    assert.equal(r.results[0].name, 'startup')
  })
})

// ---------------------------------------------------------------------------
// type query
// ---------------------------------------------------------------------------

describe('executeQuery — type', () => {
  it('lists element types', () => {
    const r = executeQuery({ schema: makeSchema(), instance: makeInstance(), query: { type: 'type' } })
    assert.equal(r.count, 2)
    assert.ok(r.results.some(t => t.name === 'module'))
    assert.ok(r.results.some(t => t.name === 'component'))
  })
})

// ---------------------------------------------------------------------------
// stats query
// ---------------------------------------------------------------------------

describe('executeQuery — stats', () => {
  it('returns aggregate statistics', () => {
    const r = executeQuery({ schema: makeSchema(), instance: makeInstance(), query: { type: 'stats' } })
    assert.equal(r.queryType, 'stats')
    assert.equal(r.results.artifactCount, 4)
    assert.equal(r.results.dependencyCount, 4)
    assert.equal(r.results.flowCount, 2)
    assert.equal(r.results.elementTypeCount, 2)
    assert.equal(r.results.artifactsByType.module, 3)
    assert.equal(r.results.artifactsByType.component, 1)
    assert.equal(r.results.totalSize, 7400)
  })
})

// ---------------------------------------------------------------------------
// search query
// ---------------------------------------------------------------------------

describe('executeQuery — search', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('finds artifacts by text match', () => {
    const r = executeQuery({ schema, instance, query: { type: 'search', pattern: 'API backend' } })
    assert.ok(r.count >= 1)
    assert.equal(r.results[0].path, 'src/lib/api.js')
  })

  it('ranks by relevance', () => {
    const r = executeQuery({ schema, instance, query: { type: 'search', pattern: 'core' } })
    // Both index.js and App.jsx have 'core' tag
    assert.ok(r.count >= 2)
  })

  it('throws without pattern', () => {
    assert.throws(
      () => executeQuery({ schema, instance, query: { type: 'search' } }),
      /pattern/
    )
  })
})

// ---------------------------------------------------------------------------
// unknown query type
// ---------------------------------------------------------------------------

describe('executeQuery — unknown type', () => {
  it('throws for unknown query type', () => {
    assert.throws(
      () => executeQuery({ schema: makeSchema(), instance: makeInstance(), query: { type: 'banana' } }),
      /Unknown query type/
    )
  })
})
