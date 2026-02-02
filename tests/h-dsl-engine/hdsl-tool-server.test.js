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
