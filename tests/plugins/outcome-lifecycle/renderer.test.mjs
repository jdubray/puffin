/**
 * Renderer unit tests for OutcomeLifecycleView and DAGRenderer.
 *
 * Uses a minimal DOM mock (no jsdom dependency) to exercise view
 * initialization, event handling, cleanup, and DAG rendering.
 */

import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'

/* ==========================================================================
   Minimal DOM Mock
   ========================================================================== */

class MockElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase()
    this.innerHTML = ''
    this.textContent = ''
    this.className = ''
    this.children = []
    this.attributes = {}
    this.style = {}
    this.dataset = {}
    this._listeners = {}
    this._parent = null
    this.tabIndex = -1
  }

  setAttribute(k, v) { this.attributes[k] = v }
  getAttribute(k) { return this.attributes[k] ?? null }

  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = []
    this._listeners[type].push(fn)
  }

  removeEventListener(type, fn) {
    if (!this._listeners[type]) return
    this._listeners[type] = this._listeners[type].filter(f => f !== fn)
  }

  dispatchEvent(event) {
    const handlers = this._listeners[event.type] || []
    for (const h of handlers) h(event)
  }

  querySelector(sel) {
    // Very minimal: parse the innerHTML to find elements by class
    // For our tests we just return a new mock or null
    if (this._queryOverrides && this._queryOverrides[sel] !== undefined) {
      return this._queryOverrides[sel]
    }
    // Default: return a mock element if innerHTML contains the selector class
    const classMatch = sel.match(/^\.([\w-]+)$/)
    if (classMatch && this.innerHTML.includes(classMatch[1])) {
      const el = new MockElement('div')
      el.className = classMatch[1]
      return el
    }
    return null
  }

  querySelectorAll(sel) {
    if (this._queryAllOverrides && this._queryAllOverrides[sel]) {
      return this._queryAllOverrides[sel]
    }
    return []
  }

  closest(sel) {
    // stub for event delegation
    return null
  }

  contains(el) {
    return false
  }

  focus() {}

  appendChild(child) {
    this.children.push(child)
    child._parent = this
  }

  get classList() {
    const self = this
    return {
      toggle(cls, force) {
        // no-op in mock
      }
    }
  }
}

function createMockDocument() {
  return {
    createElement(tag) { return new MockElement(tag) },
    activeElement: null,
    querySelector() { return null },
    querySelectorAll() { return [] }
  }
}

// Install globals that renderer code expects
globalThis.document = createMockDocument()
globalThis.window = {
  puffin: {
    plugins: {
      invoke: mock.fn(async () => ({ nodes: [], edges: [] }))
    }
  }
}

/* ==========================================================================
   Import renderer modules (ESM)
   ========================================================================== */

const { DAGRenderer } = await import(
  '../../../../plugins/outcome-lifecycle-plugin/renderer/components/dag-renderer.js'
)
const { OutcomeLifecycleView, OutcomeLifecycleAPI } = await import(
  '../../../../plugins/outcome-lifecycle-plugin/renderer/components/index.js'
)

/* ==========================================================================
   DAGRenderer Tests
   ========================================================================== */

describe('DAGRenderer', () => {
  let container

  beforeEach(() => {
    container = new MockElement('div')
    // Reset the invoke mock
    globalThis.window.puffin.plugins.invoke = mock.fn(async () => ({
      nodes: [],
      edges: []
    }))
  })

  it('should store constructor options', () => {
    const onClick = () => {}
    const dag = new DAGRenderer(container, { onNodeClick: onClick })
    assert.equal(dag.container, container)
    assert.equal(dag.onNodeClick, onClick)
  })

  it('should show empty state when no nodes returned', async () => {
    const dag = new DAGRenderer(container)
    await dag.render()
    assert.ok(container.innerHTML.includes('olc-dag-empty'))
  })

  it('should render SVG when nodes exist', async () => {
    globalThis.window.puffin.plugins.invoke = mock.fn(async () => ({
      nodes: [
        { id: 'n1', title: 'Lifecycle A', status: 'not_started', x: 0, y: 0 },
        { id: 'n2', title: 'Lifecycle B', status: 'achieved', x: 200, y: 0 }
      ],
      edges: [{ from: 'n1', to: 'n2' }]
    }))

    const dag = new DAGRenderer(container)
    await dag.render()
    assert.ok(container.innerHTML.includes('olc-dag-svg'), 'Should contain SVG')
    assert.ok(container.innerHTML.includes('Lifecycle A'), 'Should contain node title A')
    assert.ok(container.innerHTML.includes('Lifecycle B'), 'Should contain node title B')
    assert.ok(container.innerHTML.includes('olc-dag-edge'), 'Should contain edge')
  })

  it('should show error when IPC fails', async () => {
    globalThis.window.puffin.plugins.invoke = mock.fn(async () => {
      throw new Error('IPC failure')
    })

    const dag = new DAGRenderer(container)
    await dag.render()
    assert.ok(container.innerHTML.includes('olc-dag-error'))
  })

  it('should escape XML characters in node titles', () => {
    const dag = new DAGRenderer(container)
    const escaped = dag._escapeXml('<script>"alert"</script>')
    assert.ok(!escaped.includes('<script>'))
    assert.ok(escaped.includes('&lt;script&gt;'))
    assert.ok(escaped.includes('&quot;'))
  })

  it('should escape attribute characters', () => {
    const dag = new DAGRenderer(container)
    const escaped = dag._escapeAttr('a"b<c>&d')
    assert.ok(!escaped.includes('"'))
    assert.equal(escaped, 'a&quot;b&lt;c&gt;&amp;d')
  })

  it('should clean up on destroy', async () => {
    globalThis.window.puffin.plugins.invoke = mock.fn(async () => ({
      nodes: [{ id: 'n1', title: 'Test', status: 'not_started', x: 0, y: 0 }],
      edges: []
    }))

    const dag = new DAGRenderer(container)
    await dag.render()

    dag.destroy()
    assert.equal(dag._svg, null)
    assert.equal(dag._dagData, null)
    assert.equal(dag._boundClickHandler, null)
    assert.equal(container.innerHTML, '')
  })

  it('should truncate long titles', async () => {
    globalThis.window.puffin.plugins.invoke = mock.fn(async () => ({
      nodes: [{ id: 'n1', title: 'A very long lifecycle title that exceeds limit', status: 'not_started', x: 0, y: 0 }],
      edges: []
    }))

    const dag = new DAGRenderer(container)
    await dag.render()
    // Title should be truncated (maxChars = 18, so 17 chars + …)
    assert.ok(!container.innerHTML.includes('that exceeds limit'))
  })
})

/* ==========================================================================
   OutcomeLifecycleView Tests
   ========================================================================== */

describe('OutcomeLifecycleView', () => {
  let container

  beforeEach(() => {
    container = new MockElement('div')
    // Mock listLifecycles to return empty
    globalThis.window.puffin.plugins.invoke = mock.fn(async (plugin, channel, args) => {
      if (channel === 'listLifecycles') return []
      if (channel === 'getDag') return { nodes: [], edges: [] }
      return {}
    })
  })

  it('should construct with expected defaults', () => {
    const view = new OutcomeLifecycleView(container)
    assert.equal(view.container, container)
    assert.deepEqual(view._lifecycles, [])
    assert.equal(view._selectedId, null)
    assert.equal(view._dagVisible, false)
    assert.deepEqual(view._eventListeners, [])
  })

  it('should render two-pane layout on init', async () => {
    const view = new OutcomeLifecycleView(container)
    await view.init()
    assert.equal(container.className, 'olc-view')
    assert.ok(container.innerHTML.includes('olc-sidebar'), 'Should have sidebar')
    assert.ok(container.innerHTML.includes('olc-detail'), 'Should have detail pane')
    assert.ok(container.innerHTML.includes('olc-btn-create'), 'Should have create button')
    assert.ok(container.innerHTML.includes('olc-dag-toggle'), 'Should have DAG toggle')
  })

  it('should show empty list state', async () => {
    const view = new OutcomeLifecycleView(container)
    await view.init()
    assert.ok(container.innerHTML.includes('No lifecycles yet') || container.innerHTML.includes('olc-list'))
  })

  it('should track event listeners for cleanup', async () => {
    const view = new OutcomeLifecycleView(container)
    await view.init()
    // Should have registered keydown, click, change listeners
    assert.ok(view._eventListeners.length >= 3, `Expected >= 3 listeners, got ${view._eventListeners.length}`)
  })

  it('should clean up all listeners on destroy', async () => {
    const view = new OutcomeLifecycleView(container)
    await view.init()

    const listenerCount = view._eventListeners.length
    assert.ok(listenerCount > 0)

    view.destroy()
    assert.deepEqual(view._eventListeners, [])
    assert.equal(container.innerHTML, '')
  })

  it('should format dates gracefully', () => {
    const view = new OutcomeLifecycleView(container)
    assert.equal(view._formatDate(null), '—')
    assert.equal(view._formatDate(''), '—')
    // Valid date should produce a string (locale-dependent)
    const result = view._formatDate('2025-01-15T00:00:00Z')
    assert.ok(typeof result === 'string' && result.length > 0)
  })
})

/* ==========================================================================
   OutcomeLifecycleAPI Tests
   ========================================================================== */

describe('OutcomeLifecycleAPI', () => {
  beforeEach(() => {
    globalThis.window.puffin.plugins.invoke = mock.fn(async () => ({}))
  })

  it('should call invoke with correct plugin name and channel for each method', async () => {
    const methods = [
      ['createLifecycle', ['title', 'desc']],
      ['getLifecycle', ['id1']],
      ['listLifecycles', []],
      ['deleteLifecycle', ['id1']],
      ['getDag', []],
      ['mapStory', ['lc1', 's1']],
      ['unmapStory', ['lc1', 's1']],
      ['getStoriesForLifecycle', ['lc1']],
      ['getLifecyclesForStory', ['s1']],
      ['addDependency', ['from1', 'to1']],
      ['removeDependency', ['from1', 'to1']]
    ]

    for (const [method, args] of methods) {
      globalThis.window.puffin.plugins.invoke = mock.fn(async () => ({}))
      await OutcomeLifecycleAPI[method](...args)

      const calls = globalThis.window.puffin.plugins.invoke.mock.calls
      assert.equal(calls.length, 1, `Expected 1 call for ${method}`)
      assert.equal(calls[0].arguments[0], 'outcome-lifecycle-plugin', `Plugin name for ${method}`)
      assert.equal(calls[0].arguments[1], method, `Channel name for ${method}`)
    }
  })

  it('updateLifecycle should pass id and spread fields', async () => {
    globalThis.window.puffin.plugins.invoke = mock.fn(async () => ({}))
    await OutcomeLifecycleAPI.updateLifecycle('lc1', { status: 'achieved' })
    const call = globalThis.window.puffin.plugins.invoke.mock.calls[0]
    assert.equal(call.arguments[1], 'updateLifecycle')
    // Current implementation spreads fields: { id, ...fields }
    const args = call.arguments[2]
    assert.equal(args.id, 'lc1')
    assert.equal(args.status, 'achieved')
  })
})
