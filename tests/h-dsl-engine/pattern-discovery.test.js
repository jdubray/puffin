'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { discoverPatterns, detectNamingConvention, findDominant } = require('../../h-dsl-engine/lib/pattern-discovery')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSchema() {
  return {
    elementTypes: {
      module: { description: 'A JS module', fields: {} },
      component: { description: 'A UI component', fields: {} },
      service: { description: 'A backend service', fields: {} },
      config: { description: 'Configuration file', fields: {} }
    }
  }
}

function makeInstance() {
  return {
    artifacts: {
      'src/index.js': { type: 'module', kind: 'entry', summary: 'Main entry', exports: ['main'], tags: ['core'], size: 1200 },
      'src/utils.js': { type: 'module', kind: 'utility', summary: 'Helpers', exports: ['formatDate', 'parseConfig', 'validateInput'], tags: ['util'], size: 800 },
      'src/App.jsx': { type: 'component', kind: 'view', summary: 'Root component', exports: ['App'], tags: ['ui'], size: 2400 },
      'src/components/Header.jsx': { type: 'component', kind: 'view', summary: 'Page header', exports: ['Header'], tags: ['ui'], size: 600 },
      'src/components/Footer.jsx': { type: 'component', kind: 'view', summary: 'Page footer', exports: ['Footer'], tags: ['ui'], size: 400 },
      'src/components/index.js': { type: 'module', kind: 'barrel', summary: 'Component barrel', exports: ['Header', 'Footer'], tags: [], size: 100 },
      'src/services/api.js': { type: 'service', kind: 'service', summary: 'API client', exports: ['getUser', 'postData', 'deleteItem', 'updateRecord', 'fetchList'], tags: ['api'], size: 3000 },
      'src/services/auth.js': { type: 'service', kind: 'service', summary: 'Auth service', exports: ['login', 'logout'], tags: ['auth'], size: 1500 },
      'src/config/settings.js': { type: 'config', kind: 'config', summary: 'App settings', exports: ['APP_NAME', 'API_URL'], tags: ['config'], size: 200 },
      'tests/api.test.js': { type: 'module', kind: 'test', summary: 'API tests', exports: [], tags: ['test'], size: 500 }
    },
    dependencies: [
      { from: 'src/index.js', to: 'src/App.jsx', kind: 'import', weight: 1 },
      { from: 'src/index.js', to: 'src/utils.js', kind: 'import', weight: 1 },
      { from: 'src/App.jsx', to: 'src/services/api.js', kind: 'import', weight: 1 },
      { from: 'src/App.jsx', to: 'src/utils.js', kind: 'call', weight: 0.5 },
      { from: 'src/App.jsx', to: 'src/components/Header.jsx', kind: 'import', weight: 1 },
      { from: 'src/App.jsx', to: 'src/components/Footer.jsx', kind: 'import', weight: 1 },
      { from: 'src/services/api.js', to: 'src/services/auth.js', kind: 'import', weight: 1 },
      { from: 'src/services/api.js', to: 'src/config/settings.js', kind: 'import', weight: 1 },
      { from: 'src/services/api.js', to: 'src/utils.js', kind: 'import', weight: 1 },
      { from: 'src/components/Header.jsx', to: 'src/utils.js', kind: 'call', weight: 0.5 },
      { from: 'tests/api.test.js', to: 'src/services/api.js', kind: 'import', weight: 1 }
    ],
    flows: {}
  }
}

// ---------------------------------------------------------------------------
// detectNamingConvention
// ---------------------------------------------------------------------------

describe('detectNamingConvention', () => {
  it('detects camelCase', () => {
    assert.equal(detectNamingConvention('formatDate'), 'camelCase')
  })

  it('detects PascalCase', () => {
    assert.equal(detectNamingConvention('Header'), 'PascalCase')
  })

  it('detects snake_case', () => {
    assert.equal(detectNamingConvention('format_date'), 'snake_case')
  })

  it('detects kebab-case', () => {
    assert.equal(detectNamingConvention('my-component'), 'kebab-case')
  })

  it('detects UPPER_SNAKE', () => {
    assert.equal(detectNamingConvention('API_URL'), 'UPPER_SNAKE')
  })

  it('returns other for mixed', () => {
    assert.equal(detectNamingConvention('my_Component'), 'other')
  })
})

// ---------------------------------------------------------------------------
// findDominant
// ---------------------------------------------------------------------------

describe('findDominant', () => {
  it('returns key with highest count', () => {
    assert.equal(findDominant({ a: 3, b: 7, c: 2 }), 'b')
  })

  it('returns null for empty map', () => {
    assert.equal(findDominant({}), null)
  })
})

// ---------------------------------------------------------------------------
// discoverPatterns — naming
// ---------------------------------------------------------------------------

describe('discoverPatterns — naming', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('returns file name convention distribution', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'naming' } })
    assert.ok(r.naming)
    assert.ok(r.naming.fileNames.distribution)
    assert.ok(r.naming.fileNames.dominant)
  })

  it('returns export convention distribution', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'naming' } })
    assert.ok(r.naming.exports.distribution)
    assert.ok(r.naming.exports.dominant)
    // camelCase exports dominate (formatDate, parseConfig, getUser, etc.)
    assert.equal(r.naming.exports.dominant, 'camelCase')
  })

  it('includes examples', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'naming' } })
    assert.ok(Object.keys(r.naming.fileNames.examples).length > 0)
    assert.ok(Object.keys(r.naming.exports.examples).length > 0)
  })
})

// ---------------------------------------------------------------------------
// discoverPatterns — organization
// ---------------------------------------------------------------------------

describe('discoverPatterns — organization', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('returns directory analysis', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'organization' } })
    assert.ok(r.organization)
    assert.ok(r.organization.directories)
    assert.ok(r.organization.overallStyle)
  })

  it('detects top-level directories', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'organization' } })
    assert.ok(r.organization.directories.src)
    assert.ok(r.organization.directories.tests)
  })

  it('includes extension distribution', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'organization' } })
    assert.ok(r.organization.extensionDistribution['.js'] >= 1)
    assert.ok(r.organization.extensionDistribution['.jsx'] >= 1)
  })
})

// ---------------------------------------------------------------------------
// discoverPatterns — modules
// ---------------------------------------------------------------------------

describe('discoverPatterns — modules', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('finds barrel files', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'modules' } })
    assert.ok(r.modules.barrelFiles.length >= 1)
    assert.ok(r.modules.barrelFiles.some(b => b.path === 'src/components/index.js'))
  })

  it('finds shared utilities', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'modules' } })
    // utils.js is depended on by 4 modules (index, App, api, Header)
    assert.ok(r.modules.sharedUtilities.some(s => s.path === 'src/utils.js'))
  })

  it('detects barrel-exports pattern', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'modules' } })
    assert.ok(r.modules.patterns.some(p => p.name === 'barrel-exports'))
  })

  it('includes dependency kind distribution', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'modules' } })
    assert.ok(r.modules.dependencyKindDistribution.import >= 1)
  })

  it('finds high-export modules', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'modules' } })
    // api.js has 5 exports
    assert.ok(r.modules.patterns.some(p => p.name === 'high-export-modules'))
  })
})

// ---------------------------------------------------------------------------
// discoverPatterns — architecture
// ---------------------------------------------------------------------------

describe('discoverPatterns — architecture', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('detects architectural layers', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'architecture' } })
    assert.ok(r.architecture)
    assert.ok(r.architecture.layers)
    assert.ok(r.architecture.style)
  })

  it('identifies presentation and service layers', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'architecture' } })
    assert.ok(r.architecture.layers.service >= 2) // api.js, auth.js
    assert.ok(r.architecture.layers.presentation >= 1) // components
  })

  it('detects cross-layer dependencies', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'architecture' } })
    assert.ok(r.architecture.crossLayerEdgeCount >= 1)
    assert.ok(Object.keys(r.architecture.crossLayerDependencies).length >= 1)
  })

  it('includes layer examples with file paths', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'architecture' } })
    for (const [, examples] of Object.entries(r.architecture.layerExamples)) {
      for (const ex of examples) {
        assert.ok(ex.path)
        assert.ok(ex.type)
      }
    }
  })

  it('includes element type usage', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'architecture' } })
    assert.ok(r.architecture.elementTypeUsage.module >= 1)
    assert.ok(r.architecture.schemaElementTypes.length >= 1)
  })
})

// ---------------------------------------------------------------------------
// discoverPatterns — similar
// ---------------------------------------------------------------------------

describe('discoverPatterns — similar', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('finds similar implementations by feature type', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'similar', featureType: 'service' } })
    assert.ok(r.similar)
    assert.ok(r.similar.matchCount >= 2) // api.js, auth.js
    assert.ok(r.similar.examples.some(e => e.path.includes('api')))
  })

  it('includes dependency context for matches', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'similar', featureType: 'service' } })
    const apiMatch = r.similar.examples.find(e => e.path.includes('api'))
    assert.ok(apiMatch)
    assert.ok(apiMatch.dependsOn.length >= 1)
    assert.ok(apiMatch.dependedOnBy.length >= 1)
  })

  it('includes relevance scores', () => {
    const r = discoverPatterns({ schema, instance, query: { category: 'similar', featureType: 'component' } })
    for (const ex of r.similar.examples) {
      assert.ok(typeof ex.relevanceScore === 'number')
    }
  })

  it('throws without featureType', () => {
    assert.throws(
      () => discoverPatterns({ schema, instance, query: { category: 'similar' } }),
      /featureType/
    )
  })
})

// ---------------------------------------------------------------------------
// discoverPatterns — area filtering
// ---------------------------------------------------------------------------

describe('discoverPatterns — area filtering', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('scopes analysis to a specific area', () => {
    const full = discoverPatterns({ schema, instance, query: { category: 'naming' } })
    const scoped = discoverPatterns({ schema, instance, query: { category: 'naming', area: 'src/components/*' } })
    assert.ok(scoped.artifactCount < full.artifactCount)
    assert.ok(scoped.artifactCount >= 2) // Header, Footer, index
  })
})

// ---------------------------------------------------------------------------
// discoverPatterns — all category
// ---------------------------------------------------------------------------

describe('discoverPatterns — all categories', () => {
  it('returns all sections when category is all', () => {
    const r = discoverPatterns({ schema: makeSchema(), instance: makeInstance() })
    assert.equal(r.reportType, 'pattern-discovery')
    assert.ok(r.naming)
    assert.ok(r.organization)
    assert.ok(r.modules)
    assert.ok(r.architecture)
  })
})
