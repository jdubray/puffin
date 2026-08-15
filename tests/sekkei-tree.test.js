/**
 * Sekkei tree shape — nesting derived from glm id segments.
 *
 * The bug this guards: a spec's id is `<component>.spec.<kind>`, so its
 * immediate parent path (`<component>.spec`) names no node. Matching on the
 * immediate parent alone made every spec a root of its own, which pushed specs
 * above the system node and left no path down to components and interactions.
 * Attaching to the nearest EXISTING ancestor is the fix.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let buildTree

before(async () => {
  ;({ buildTree } = await import('../src/renderer/components/specs-view/specs-view.js'))
})

const node = (glmId, stratum, title) => ({ glmId, stratum, title: title || glmId })

/** A sekkei shaped like a real one: system → capability → component → … */
const NODES = [
  node('cogfab:demo', 'system', 'demo'),
  node('cogfab:demo.kernel', 'capability', 'Kernel'),
  node('cogfab:demo.kernel.kernel_core', 'component', 'kernel core'),
  node('cogfab:demo.kernel.kernel_core.step', 'interaction', 'advance one step'),
  node('cogfab:demo.kernel.kernel_core.spec.acceptance', 'spec', 'Acceptance'),
  node('cogfab:demo.kernel.kernel_core.spec.prompt', 'spec', 'Prompt'),
  node('cogfab:demo.world', 'capability', 'World')
]

/** Flatten to `depth:glmId` pairs for readable assertions. */
function flatten(tree, depth = 0, out = []) {
  for (const entry of tree) {
    out.push({ depth, glmId: entry.node.glmId })
    flatten(entry.children, depth + 1, out)
  }
  return out
}

describe('buildTree', () => {
  it('nests specs under their component, not at the root', () => {
    const flat = flatten(buildTree(NODES))
    const spec = flat.find(e => e.glmId.endsWith('.spec.acceptance'))
    assert.strictEqual(spec.depth, 3, 'system → capability → component → spec')
    assert.ok(!flat.slice(0, 1).some(e => e.glmId.includes('.spec.')),
      'no spec may appear before the system node')
  })

  it('has exactly one root — the system node', () => {
    const tree = buildTree(NODES)
    assert.strictEqual(tree.length, 1)
    assert.strictEqual(tree[0].node.glmId, 'cogfab:demo')
  })

  it('keeps components reachable from their capability', () => {
    const tree = buildTree(NODES)
    const kernel = tree[0].children.find(c => c.node.glmId === 'cogfab:demo.kernel')
    assert.ok(kernel, 'the capability is a child of the system')
    assert.deepStrictEqual(
      kernel.children.map(c => c.node.glmId), ['cogfab:demo.kernel.kernel_core'])
  })

  it('orders siblings by stratum, so interactions precede specs', () => {
    const tree = buildTree(NODES)
    const component = tree[0].children[0].children[0]
    assert.deepStrictEqual(component.children.map(c => c.node.stratum),
      ['interaction', 'spec', 'spec'])
  })

  it('keeps a node whose ancestors are all missing as a root', () => {
    const orphan = [node('cogfab:other.thing.deep', 'spec', 'Orphan')]
    const tree = buildTree(orphan)
    assert.strictEqual(tree.length, 1)
    assert.strictEqual(tree[0].node.glmId, 'cogfab:other.thing.deep')
  })

  it('handles an empty sekkei', () => {
    assert.deepStrictEqual(buildTree([]), [])
  })

  it('does not lose a node — every input appears exactly once', () => {
    const flat = flatten(buildTree(NODES))
    assert.strictEqual(flat.length, NODES.length)
    assert.strictEqual(new Set(flat.map(e => e.glmId)).size, NODES.length)
  })
})
