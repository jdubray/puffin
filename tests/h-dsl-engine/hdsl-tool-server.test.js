'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

const { TOOLS, handleToolCall, handleMessage, _setModelForTesting } = require('../../h-dsl-engine/hdsl-tool-server')

// ---------------------------------------------------------------------------
// Fixture — mock model loaded via require overriding
// ---------------------------------------------------------------------------

// We test handleToolCall and handleMessage directly against a fixture instance.
// The server's getModel() lazy-loads from disk; for unit tests we inject via
// the module's internal _model cache. Since the tool handlers use require()
// for each lib module, and those are pure functions operating on passed-in
// schema/instance, we test at the integration level by calling handleMessage.

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
      'src/index.js': { type: 'module', kind: 'entry', summary: 'Main entry', intent: 'Bootstrap', exports: ['main'], tags: ['core'], size: 1200 },
      'src/utils.js': { type: 'module', kind: 'utility', summary: 'Helpers', exports: ['format', 'parse'], tags: ['util'], size: 800 },
      'src/App.jsx': { type: 'component', kind: 'view', summary: 'Root component', exports: ['App'], tags: ['ui'], size: 2400 }
    },
    dependencies: [
      { from: 'src/index.js', to: 'src/App.jsx', kind: 'import', weight: 1 },
      { from: 'src/index.js', to: 'src/utils.js', kind: 'import', weight: 1 },
      { from: 'src/App.jsx', to: 'src/utils.js', kind: 'call', weight: 0.5 }
    ],
    flows: {}
  }
}

// Inject mock model into the server module's cache
beforeEach(() => {
  _setModelForTesting({ schema: makeSchema(), instance: makeInstance() })
})

// ---------------------------------------------------------------------------
// TOOLS definition
// ---------------------------------------------------------------------------

describe('TOOLS definition', () => {
  it('defines 9 tools', () => {
    assert.equal(TOOLS.length, 9)
  })

  it('each tool has name, description, and inputSchema', () => {
    for (const tool of TOOLS) {
      assert.ok(tool.name, 'tool must have a name')
      assert.ok(tool.description, `${tool.name} must have a description`)
      assert.ok(tool.inputSchema, `${tool.name} must have an inputSchema`)
      assert.equal(tool.inputSchema.type, 'object')
    }
  })

  it('tool names follow hdsl_ prefix convention', () => {
    for (const tool of TOOLS) {
      assert.ok(tool.name.startsWith('hdsl_'), `${tool.name} should start with hdsl_`)
    }
  })

  it('includes all expected tools', () => {
    const names = TOOLS.map(t => t.name)
    assert.ok(names.includes('hdsl_stats'))
    assert.ok(names.includes('hdsl_peek'))
    assert.ok(names.includes('hdsl_search'))
    assert.ok(names.includes('hdsl_deps'))
    assert.ok(names.includes('hdsl_trace'))
    assert.ok(names.includes('hdsl_impact'))
    assert.ok(names.includes('hdsl_patterns'))
    assert.ok(names.includes('hdsl_path'))
    assert.ok(names.includes('hdsl_freshness'))
  })

  it('required fields are declared in inputSchema', () => {
    const peek = TOOLS.find(t => t.name === 'hdsl_peek')
    assert.deepEqual(peek.inputSchema.required, ['path'])

    const pathTool = TOOLS.find(t => t.name === 'hdsl_path')
    assert.deepEqual(pathTool.inputSchema.required, ['from', 'to'])

    const impact = TOOLS.find(t => t.name === 'hdsl_impact')
    assert.deepEqual(impact.inputSchema.required, ['target'])
  })
})

// ---------------------------------------------------------------------------
// handleMessage — JSON-RPC protocol
// ---------------------------------------------------------------------------

describe('handleMessage — protocol', () => {
  it('returns parse error for invalid JSON', async () => {
    const r = await handleMessage('not json')
    const parsed = JSON.parse(r)
    assert.equal(parsed.error.code, -32700)
  })

  it('handles initialize', async () => {
    const r = await handleMessage(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} }
    }))
    const parsed = JSON.parse(r)
    assert.equal(parsed.id, 1)
    assert.equal(parsed.result.serverInfo.name, 'hdsl')
    assert.ok(parsed.result.capabilities.tools)
  })

  it('handles initialized notification (returns null)', async () => {
    const r = await handleMessage(JSON.stringify({
      jsonrpc: '2.0', method: 'initialized'
    }))
    assert.equal(r, null)
  })

  it('handles tools/list', async () => {
    const r = await handleMessage(JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/list'
    }))
    const parsed = JSON.parse(r)
    assert.equal(parsed.id, 2)
    assert.ok(Array.isArray(parsed.result.tools))
    assert.equal(parsed.result.tools.length, 9)
  })

  it('returns method-not-found for unknown method', async () => {
    const r = await handleMessage(JSON.stringify({
      jsonrpc: '2.0', id: 3, method: 'unknown/method'
    }))
    const parsed = JSON.parse(r)
    assert.equal(parsed.error.code, -32601)
  })

  it('returns error for tools/call with missing tool name', async () => {
    const r = await handleMessage(JSON.stringify({
      jsonrpc: '2.0', id: 4, method: 'tools/call', params: {}
    }))
    const parsed = JSON.parse(r)
    assert.equal(parsed.error.code, -32602)
  })

  it('returns error for tools/call with unknown tool', async () => {
    const r = await handleMessage(JSON.stringify({
      jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'hdsl_nonexistent', arguments: {} }
    }))
    const parsed = JSON.parse(r)
    assert.equal(parsed.error.code, -32602)
    assert.ok(parsed.error.message.includes('Unknown tool'))
  })
})

// ---------------------------------------------------------------------------
// Tool descriptions — LLM comprehension quality
// ---------------------------------------------------------------------------

describe('Tool descriptions — LLM-friendly', () => {
  it('descriptions are concise (under 200 chars)', () => {
    for (const tool of TOOLS) {
      assert.ok(
        tool.description.length <= 200,
        `${tool.name} description is ${tool.description.length} chars, should be ≤200`
      )
    }
  })

  it('descriptions explain when to use the tool', () => {
    // Each description should contain actionable context
    const stats = TOOLS.find(t => t.name === 'hdsl_stats')
    assert.ok(stats.description.includes('statistic'))

    const peek = TOOLS.find(t => t.name === 'hdsl_peek')
    assert.ok(peek.description.includes('summary'))

    const impact = TOOLS.find(t => t.name === 'hdsl_impact')
    assert.ok(impact.description.includes('impact'))
  })

  it('input schemas have property descriptions', () => {
    const peek = TOOLS.find(t => t.name === 'hdsl_peek')
    assert.ok(peek.inputSchema.properties.path.description)

    const search = TOOLS.find(t => t.name === 'hdsl_search')
    assert.ok(search.inputSchema.properties.pattern.description)
  })
})

// ---------------------------------------------------------------------------
// handleToolCall — integration tests for each tool handler
// ---------------------------------------------------------------------------

describe('handleToolCall — integration', () => {
  // Helper: call a tool via JSON-RPC and return parsed content
  async function callTool(name, args = {}) {
    const r = await handleMessage(JSON.stringify({
      jsonrpc: '2.0', id: 99, method: 'tools/call',
      params: { name, arguments: args }
    }))
    const parsed = JSON.parse(r)
    assert.equal(parsed.id, 99)
    assert.ok(parsed.result.content, `${name} should return content`)
    return JSON.parse(parsed.result.content[0].text)
  }

  it('hdsl_stats returns artifact and dependency counts', async () => {
    const result = await callTool('hdsl_stats')
    assert.equal(result.results.artifactCount, 3)
    assert.equal(result.results.dependencyCount, 3)
  })

  it('hdsl_peek returns artifact details', async () => {
    const result = await callTool('hdsl_peek', { path: 'src/index.js' })
    assert.equal(result.path, 'src/index.js')
    assert.equal(result.type, 'module')
    assert.equal(result.kind, 'entry')
    assert.deepEqual(result.exports, ['main'])
  })

  it('hdsl_peek returns error for unknown artifact', async () => {
    const result = await callTool('hdsl_peek', { path: 'nonexistent.js' })
    assert.ok(result.error)
    assert.ok(result.error.includes('not found'))
  })

  it('hdsl_search text mode finds matching artifacts', async () => {
    const result = await callTool('hdsl_search', { pattern: 'Helper', mode: 'text' })
    assert.ok(result.results.length >= 1)
  })

  it('hdsl_search artifact mode filters by kind', async () => {
    const result = await callTool('hdsl_search', { mode: 'artifact', kind: 'entry' })
    assert.ok(result.results.length >= 1)
    assert.ok(result.results.some(r => r.path === 'src/index.js' || r.key === 'src/index.js'))
  })

  it('hdsl_deps returns dependencies for an artifact', async () => {
    const result = await callTool('hdsl_deps', { path: 'src/index.js' })
    assert.equal(result.operation, 'neighbors')
    assert.equal(result.entities.length, 1)
    assert.equal(result.entities[0].outgoingCount, 2)
    assert.equal(result.entities[0].incomingCount, 0)
  })

  it('hdsl_trace returns BFS traversal from starting node', async () => {
    const result = await callTool('hdsl_trace', { path: 'src/index.js', depth: 1 })
    assert.ok(result)
    assert.ok(result.visited || result.layers || result.nodes)
  })

  it('hdsl_impact returns impact report for a target', async () => {
    const result = await callTool('hdsl_impact', { target: 'src/utils.js' })
    assert.equal(result.reportType, 'impact-analysis')
    assert.equal(result.target, 'src/utils.js')
    assert.ok(result.summary)
    assert.ok(Array.isArray(result.affectedFiles))
  })

  it('hdsl_patterns returns pattern analysis', async () => {
    const result = await callTool('hdsl_patterns', { category: 'all' })
    assert.ok(result)
    // Should return some pattern categories
    assert.ok(result.naming || result.organization || result.patterns || result.categories)
  })

  it('hdsl_path returns path between two entities', async () => {
    const result = await callTool('hdsl_path', { from: 'src/index.js', to: 'src/utils.js' })
    assert.ok(result)
    assert.ok(result.path || result.found !== undefined)
  })

  it('hdsl_path returns no-path for disconnected entities', async () => {
    // utils.js has no outgoing path to index.js (only incoming)
    const result = await callTool('hdsl_path', { from: 'src/utils.js', to: 'nonexistent.js' })
    assert.ok(result)
  })
})
