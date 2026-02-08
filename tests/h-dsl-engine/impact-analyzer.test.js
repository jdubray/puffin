'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { analyzeImpact, computeRiskScores, categorizeOverallRisk } = require('../../h-dsl-engine/lib/impact-analyzer')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSchema() {
  return {
    elementTypes: {
      module: { description: 'A JS module', fields: {} },
      component: { description: 'A UI component', fields: {} }
    }
  }
}

function makeInstance() {
  return {
    artifacts: {
      'src/index.js': { type: 'module', kind: 'entry', summary: 'Main entry', size: 1200, exports: ['main'], tags: ['core'] },
      'src/utils.js': { type: 'module', kind: 'utility', summary: 'Helpers', size: 800, exports: ['format', 'parse', 'validate'], tags: ['util'] },
      'src/App.jsx': { type: 'component', kind: 'view', summary: 'Root component', size: 2400, exports: ['App'], tags: ['ui'] },
      'src/lib/api.js': { type: 'module', kind: 'service', summary: 'API client', size: 3000, exports: ['get', 'post', 'put', 'del'], tags: ['api'] },
      'src/lib/auth.js': { type: 'module', kind: 'service', summary: 'Auth service', size: 1500, exports: ['login', 'logout'], tags: ['auth'] },
      'src/components/Header.jsx': { type: 'component', kind: 'view', summary: 'Page header', size: 600, exports: ['Header'], tags: ['ui'] },
      'src/components/Footer.jsx': { type: 'component', kind: 'view', summary: 'Page footer', size: 400, exports: ['Footer'], tags: ['ui'] }
    },
    dependencies: [
      { from: 'src/index.js', to: 'src/App.jsx', kind: 'import', weight: 1 },
      { from: 'src/index.js', to: 'src/utils.js', kind: 'import', weight: 1 },
      { from: 'src/App.jsx', to: 'src/lib/api.js', kind: 'import', weight: 1 },
      { from: 'src/App.jsx', to: 'src/utils.js', kind: 'call', weight: 0.5 },
      { from: 'src/App.jsx', to: 'src/components/Header.jsx', kind: 'import', weight: 1 },
      { from: 'src/App.jsx', to: 'src/components/Footer.jsx', kind: 'import', weight: 1 },
      { from: 'src/lib/api.js', to: 'src/lib/auth.js', kind: 'import', weight: 1 },
      { from: 'src/components/Header.jsx', to: 'src/utils.js', kind: 'call', weight: 0.5 },
      { from: 'src/components/Footer.jsx', to: 'src/utils.js', kind: 'call', weight: 0.5 }
    ],
    flows: {}
  }
}

// ---------------------------------------------------------------------------
// analyzeImpact — basic report structure
// ---------------------------------------------------------------------------

describe('analyzeImpact — report structure', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('returns a valid impact report for a target', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/utils.js' } })
    assert.equal(r.reportType, 'impact-analysis')
    assert.equal(r.target, 'src/utils.js')
    assert.deepEqual(r.targetEntities, ['src/utils.js'])
    assert.ok(r.summary)
    assert.ok(Array.isArray(r.affectedFiles))
    assert.ok(Array.isArray(r.highRiskEntities))
    assert.ok(r.dependencyChains.forward)
    assert.ok(r.dependencyChains.reverse)
  })

  it('returns empty report for non-matching target', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'nonexistent*' } })
    assert.equal(r.targetEntities.length, 0)
    assert.equal(r.summary.totalAffected, 0)
    assert.equal(r.summary.riskLevel, 'low')
  })

  it('throws without name', () => {
    assert.throws(
      () => analyzeImpact({ schema, instance, target: {} }),
      /name/
    )
  })
})

// ---------------------------------------------------------------------------
// analyzeImpact — dependency chains
// ---------------------------------------------------------------------------

describe('analyzeImpact — dependency chains', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('finds reverse dependents (who depends on utils)', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/utils.js', depth: 2 } })
    // utils is depended on by: index.js, App.jsx, Header.jsx, Footer.jsx
    assert.ok(r.summary.transitiveDependentCount >= 3)
  })

  it('finds forward dependencies (what api.js depends on)', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/lib/api.js', depth: 2 } })
    // api.js depends on auth.js
    assert.ok(r.dependencyChains.forward.edgeCount >= 1)
  })

  it('respects depth parameter', () => {
    const shallow = analyzeImpact({ schema, instance, target: { name: 'src/lib/auth.js', depth: 1 } })
    const deep = analyzeImpact({ schema, instance, target: { name: 'src/lib/auth.js', depth: 3 } })
    assert.ok(deep.affectedFiles.length >= shallow.affectedFiles.length)
  })

  it('skips reverse when includeReverseImpact is false', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/utils.js', includeReverseImpact: false } })
    assert.equal(r.dependencyChains.reverse, null)
  })
})

// ---------------------------------------------------------------------------
// analyzeImpact — affected files
// ---------------------------------------------------------------------------

describe('analyzeImpact — affected files', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('marks target entities with isTarget=true', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/App.jsx' } })
    const target = r.affectedFiles.find(f => f.path === 'src/App.jsx')
    assert.equal(target.isTarget, true)
  })

  it('includes type and kind for each file', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/App.jsx' } })
    const target = r.affectedFiles.find(f => f.path === 'src/App.jsx')
    assert.equal(target.type, 'component')
    assert.equal(target.kind, 'view')
  })

  it('includes dependents and dependencies lists', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/App.jsx', depth: 1 } })
    const app = r.affectedFiles.find(f => f.path === 'src/App.jsx')
    assert.ok(app.dependents.length >= 1) // index.js
    assert.ok(app.dependencies.length >= 3) // api, utils, Header, Footer
  })

  it('sorts targets first, then by risk score', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/index*' } })
    assert.equal(r.affectedFiles[0].isTarget, true)
  })
})

// ---------------------------------------------------------------------------
// analyzeImpact — risk scoring
// ---------------------------------------------------------------------------

describe('analyzeImpact — risk scoring', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('assigns risk scores to affected files', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/utils.js' } })
    for (const f of r.affectedFiles) {
      assert.ok(typeof f.riskScore === 'number')
      assert.ok(f.riskScore >= 0 && f.riskScore <= 1)
    }
  })

  it('gives higher risk to utils (many dependents)', () => {
    const r = analyzeImpact({ schema, instance, target: { name: '*', depth: 1 } })
    const utils = r.affectedFiles.find(f => f.path === 'src/utils.js')
    const footer = r.affectedFiles.find(f => f.path === 'src/components/Footer.jsx')
    // utils has 4 dependents, footer has 1
    assert.ok(utils.riskScore > footer.riskScore)
  })

  it('includes risk factors breakdown', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/utils.js' } })
    const utils = r.affectedFiles.find(f => f.path === 'src/utils.js')
    assert.ok('dependentCount' in utils.riskFactors)
    assert.ok('dependencyCount' in utils.riskFactors)
    assert.ok('exportCount' in utils.riskFactors)
    assert.ok('centrality' in utils.riskFactors)
  })
})

// ---------------------------------------------------------------------------
// analyzeImpact — high risk identification
// ---------------------------------------------------------------------------

describe('analyzeImpact — high risk entities', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('identifies entities with risk >= 0.6 as high-risk', () => {
    const r = analyzeImpact({ schema, instance, target: { name: '*', depth: 1 } })
    for (const hr of r.highRiskEntities) {
      assert.ok(hr.riskScore >= 0.6, `${hr.path} has riskScore ${hr.riskScore} < 0.6`)
    }
  })

  it('sorts high-risk entities by risk descending', () => {
    const r = analyzeImpact({ schema, instance, target: { name: '*', depth: 1 } })
    for (let i = 1; i < r.highRiskEntities.length; i++) {
      assert.ok(r.highRiskEntities[i - 1].riskScore >= r.highRiskEntities[i].riskScore)
    }
  })
})

// ---------------------------------------------------------------------------
// analyzeImpact — summary
// ---------------------------------------------------------------------------

describe('analyzeImpact — summary', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('includes overall risk level', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/utils.js', depth: 2 } })
    assert.ok(['low', 'medium', 'high', 'critical'].includes(r.summary.riskLevel))
  })

  it('includes affected-by-type breakdown', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/utils.js', depth: 2 } })
    assert.ok(typeof r.summary.affectedByType === 'object')
  })

  it('counts match expectations for utils.js', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/utils.js', depth: 1 } })
    assert.equal(r.summary.targetCount, 1)
    assert.ok(r.summary.totalAffected >= 3) // index, App, Header, Footer depend on it
  })
})

// ---------------------------------------------------------------------------
// categorizeOverallRisk
// ---------------------------------------------------------------------------

describe('categorizeOverallRisk', () => {
  it('returns low for minimal impact', () => {
    assert.equal(categorizeOverallRisk([], 2), 'low')
  })

  it('returns medium for moderate impact', () => {
    assert.equal(categorizeOverallRisk([{ riskScore: 0.7 }], 3), 'medium')
  })

  it('returns high for significant impact', () => {
    assert.equal(categorizeOverallRisk([{ riskScore: 0.8 }, { riskScore: 0.7 }], 8), 'high')
  })

  it('returns critical for large-scale impact', () => {
    assert.equal(categorizeOverallRisk([{ riskScore: 0.9 }], 25), 'critical')
  })
})

// ---------------------------------------------------------------------------
// computeRiskScores
// ---------------------------------------------------------------------------

describe('computeRiskScores', () => {
  it('returns scores for given paths', () => {
    const instance = makeInstance()
    const inAdj = new Map()
    const outAdj = new Map()
    for (const d of instance.dependencies) {
      if (!outAdj.has(d.from)) outAdj.set(d.from, [])
      outAdj.get(d.from).push(d)
      if (!inAdj.has(d.to)) inAdj.set(d.to, [])
      inAdj.get(d.to).push(d)
    }

    const scores = computeRiskScores(
      new Set(['src/utils.js', 'src/components/Footer.jsx']),
      instance, inAdj, outAdj, 7
    )

    assert.ok(scores.has('src/utils.js'))
    assert.ok(scores.has('src/components/Footer.jsx'))
    assert.ok(scores.get('src/utils.js').riskScore > scores.get('src/components/Footer.jsx').riskScore)
  })

  it('skips artifacts not in instance', () => {
    const instance = makeInstance()
    const scores = computeRiskScores(new Set(['ghost.js']), instance, new Map(), new Map(), 7)
    assert.equal(scores.size, 0)
  })
})

// ---------------------------------------------------------------------------
// Pattern matching (glob)
// ---------------------------------------------------------------------------

describe('analyzeImpact — glob pattern support', () => {
  const schema = makeSchema()
  const instance = makeInstance()

  it('matches multiple targets with wildcard', () => {
    const r = analyzeImpact({ schema, instance, target: { name: 'src/lib/*' } })
    assert.ok(r.targetEntities.includes('src/lib/api.js'))
    assert.ok(r.targetEntities.includes('src/lib/auth.js'))
    assert.equal(r.summary.targetCount, 2)
  })
})
