/**
 * Generation planning.
 *
 * The plan is derived, not prompted, so these tests are the specification of
 * what "derived" means: the same sekkei must always produce the same phases,
 * an unready component must never reach a phase, and a dependency must never
 * be generated after the thing that calls it.
 */

'use strict'

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

let planGeneration, laneFor, promptTemplate, DEFAULT_PHASE_SIZE

before(async () => {
  ;({ planGeneration, laneFor, promptTemplate, DEFAULT_PHASE_SIZE } =
    await import('../src/shared/generation-plan.js'))
})

// --- fixtures ---------------------------------------------------------------

const component = (glmId, extra = {}) => ({
  glmId, stratum: 'component', title: glmId.split('.').pop(),
  body: { boundary: 'x', runtime: 'node' }, updatedAt: '2026-08-01T00:00:00Z', ...extra
})

const promptSpec = (componentId, body = {}) => ({
  glmId: `${componentId}.spec.prompt`, stratum: 'spec', specKind: 'prompt',
  title: 'prompt', updatedAt: '2026-08-01T00:00:00Z',
  body: { prompt_template: 'build it', outputs: ['src/x.js'], ...body }
})

const acceptanceSpec = (componentId, body = {}) => ({
  glmId: `${componentId}.spec.acceptance`, stratum: 'spec', specKind: 'acceptance',
  title: 'acceptance', updatedAt: '2026-08-01T00:00:00Z',
  body: { verifier: 'npm test -- x', ...body }
})

const fsmInteraction = (componentId, body = {}) => ({
  glmId: `${componentId}.fsm`, stratum: 'interaction', title: 'fsm',
  updatedAt: '2026-08-01T00:00:00Z',
  body: { contract: 'fsm', states: ['a', 'b'], transitions: ['a->b'], ...body }
})

/** A component with everything a generation consumes. */
const readyComponent = (glmId, extra = {}) => [
  component(glmId, extra), promptSpec(glmId), acceptanceSpec(glmId)
]

const GENERATED = { stateful: { lane: 'generated' } }
const CAPTURED = { stateful: { lane: 'captured' } }

// --- readiness --------------------------------------------------------------

describe('readiness — the cut that decides phase zero', () => {
  it('plans a ready component into a phase', () => {
    const plan = planGeneration(readyComponent('acme:app.core'))
    assert.strictEqual(plan.phases.length, 1)
    assert.deepStrictEqual(plan.phases[0].components.map(c => c.glmId), ['acme:app.core'])
    assert.deepStrictEqual(plan.notReady, [])
  })

  it('holds back a component with no prompt spec, and says why', () => {
    const plan = planGeneration([component('acme:app.core'), acceptanceSpec('acme:app.core')])
    assert.strictEqual(plan.phases.length, 0)
    assert.strictEqual(plan.notReady.length, 1)
    assert.match(plan.notReady[0].reasons[0], /no prompt spec/)
  })

  it('holds back a component whose acceptance spec carries no verifier', () => {
    const plan = planGeneration([
      component('acme:app.core'), promptSpec('acme:app.core'),
      acceptanceSpec('acme:app.core', { verifier: '   ' })
    ])
    assert.strictEqual(plan.totals.ready, 0)
    assert.match(plan.notReady[0].reasons[0], /verifier command/)
  })

  it('accepts the object form of a verifier as well as the string form', () => {
    // GLM writes this both ways; a plan that knew one shape would report a
    // ready component as unready and send real work to phase zero.
    const plan = planGeneration([
      component('acme:app.core'), promptSpec('acme:app.core'),
      acceptanceSpec('acme:app.core', { verifier: { command: 'pytest -q', expect: 'exit0' } })
    ])
    assert.strictEqual(plan.totals.ready, 1)
  })

  it('reads the template under every key a real sekkei has used', () => {
    // The bug this exists to prevent: sekkeis are authored with `template`,
    // GLM's generator reads `prompt_template`, and SpecBody calls it
    // `content`. Knowing only one key reported eight finished components as
    // unready and sent them all to phase zero.
    for (const key of ['template', 'prompt_template', 'content']) {
      assert.strictEqual(promptTemplate({ [key]: 'build it' }), 'build it', key)
    }
    assert.strictEqual(promptTemplate({ template: '  ' }), '')
    assert.strictEqual(promptTemplate({}), '')
    assert.strictEqual(promptTemplate(null), '')
  })

  it('plans a component whose prompt spec uses the authored `template` key', () => {
    const plan = planGeneration([
      component('acme:app.core'),
      { ...promptSpec('acme:app.core'), body: { template: 'build it', outputs: ['src/x.js'] } },
      acceptanceSpec('acme:app.core')
    ])
    assert.strictEqual(plan.totals.ready, 1)
  })

  it('holds back a prompt spec that names no outputs', () => {
    const plan = planGeneration([
      component('acme:app.core'), promptSpec('acme:app.core', { outputs: [] }),
      acceptanceSpec('acme:app.core')
    ])
    assert.match(plan.notReady[0].reasons.join(' '), /outputs/)
  })

  it('reports every gap at once, since they are the authoring work', () => {
    const plan = planGeneration([component('acme:app.core')])
    assert.strictEqual(plan.notReady[0].reasons.length, 2)
  })

  it('requires something to check against from a component that claims a state contract', () => {
    // A contract with no vocabulary declares nothing: there is no trace shape
    // for a checker or a replay to be judged against.
    const plan = planGeneration([
      ...readyComponent('acme:app.core'),
      fsmInteraction('acme:app.core', { states: [], transitions: [] })
    ])
    assert.strictEqual(plan.totals.ready, 0)
    assert.match(plan.notReady[0].reasons.join(' '), /no states or transitions/)
  })

  it('reads a declared state vocabulary as the contract, whatever it is labelled', () => {
    // The label is GLM's discriminator; the substance is the state vocabulary
    // a trace gets checked against. A future label that still declares states
    // and transitions is still a contract.
    const plan = planGeneration([
      ...readyComponent('acme:app.core'),
      fsmInteraction('acme:app.core', { contract: 'trace', states: ['a', 'b'], transitions: ['a->b'] })
    ], { buildLane: GENERATED })
    assert.strictEqual(plan.totals.ready, 1)
    assert.strictEqual(plan.phases[0].lane, 'generated')
  })

  it('does not require a contract from a stateless component', () => {
    const plan = planGeneration(readyComponent('acme:app.core'))
    assert.strictEqual(plan.totals.ready, 1)
  })
})

// --- lane -------------------------------------------------------------------

describe('lane — what proves the component', () => {
  it('sends a stateful component down the project lane', () => {
    const nodes = [...readyComponent('acme:app.core'), fsmInteraction('acme:app.core')]
    assert.strictEqual(
      planGeneration(nodes, { buildLane: GENERATED }).phases[0].lane, 'generated')
    assert.strictEqual(
      planGeneration(nodes, { buildLane: CAPTURED }).phases[0].lane, 'captured')
  })

  it('never offers polygen for a stateless component, whatever the language', () => {
    const plan = planGeneration(readyComponent('acme:app.core'), { buildLane: GENERATED })
    assert.strictEqual(plan.phases[0].lane, 'acceptance')
  })

  it('treats an unknown build lane as capture-ready, never as generated', () => {
    // Guessing 'generated' would route a Python component to a generator that
    // emits JavaScript; guessing 'captured' only asks for a corpus.
    assert.strictEqual(laneFor(true, null), 'captured')
    assert.strictEqual(laneFor(true, {}), 'captured')
  })

  it('never mixes lanes inside one phase', () => {
    const nodes = [
      ...readyComponent('acme:app.a'), fsmInteraction('acme:app.a'),
      ...readyComponent('acme:app.b')
    ]
    const plan = planGeneration(nodes, { buildLane: CAPTURED })
    assert.strictEqual(plan.phases.length, 2)
    for (const phase of plan.phases) {
      const lanes = new Set(phase.components.map(() => phase.lane))
      assert.strictEqual(lanes.size, 1)
    }
  })
})

// --- dependency -------------------------------------------------------------

describe('dependency — leaves first', () => {
  const dependsOn = (target) => ({ relationships: [{ kind: 'depends-on', targetGlmId: target }] })

  it('generates a dependency before its dependent', () => {
    const nodes = [
      ...readyComponent('acme:app.api', dependsOn('acme:app.store')),
      ...readyComponent('acme:app.store')
    ]
    const plan = planGeneration(nodes)
    assert.strictEqual(plan.phases.length, 2)
    assert.deepStrictEqual(plan.phases[0].components.map(c => c.glmId), ['acme:app.store'])
    assert.deepStrictEqual(plan.phases[1].components.map(c => c.glmId), ['acme:app.api'])
  })

  it('lifts an edge that points at a spec up to the component that owns it', () => {
    // Containment is not dependency, but a depends-on may still name a leaf;
    // read literally it would constrain nothing and the layering would flatten.
    const nodes = [
      ...readyComponent('acme:app.api', dependsOn('acme:app.store.spec.prompt')),
      ...readyComponent('acme:app.store')
    ]
    const plan = planGeneration(nodes)
    assert.strictEqual(plan.phases[0].components[0].glmId, 'acme:app.store')
    assert.strictEqual(plan.phases[1].components[0].glmId, 'acme:app.api')
  })

  it('ignores an edge to something outside this run', () => {
    const plan = planGeneration(
      readyComponent('acme:app.api', dependsOn('acme:other.thing')))
    assert.strictEqual(plan.phases.length, 1)
  })

  it('ignores a self-edge', () => {
    const plan = planGeneration(
      readyComponent('acme:app.api', dependsOn('acme:app.api.spec.prompt')))
    assert.strictEqual(plan.phases.length, 1)
  })

  it('puts independent components in the same layer', () => {
    const plan = planGeneration([
      ...readyComponent('acme:app.a'), ...readyComponent('acme:app.b')
    ])
    assert.strictEqual(plan.phases.length, 1)
    assert.strictEqual(plan.phases[0].components.length, 2)
  })

  it('reports a cycle instead of picking an order inside it', () => {
    const nodes = [
      ...readyComponent('acme:app.a', dependsOn('acme:app.b')),
      ...readyComponent('acme:app.b', dependsOn('acme:app.a'))
    ]
    const plan = planGeneration(nodes)
    assert.deepStrictEqual(plan.phases, [])
    assert.deepStrictEqual(plan.cycle.map(c => c.glmId).sort(), ['acme:app.a', 'acme:app.b'])
  })

  it('still phases the components a cycle does not touch', () => {
    const nodes = [
      ...readyComponent('acme:app.a', dependsOn('acme:app.b')),
      ...readyComponent('acme:app.b', dependsOn('acme:app.a')),
      ...readyComponent('acme:app.free')
    ]
    const plan = planGeneration(nodes)
    assert.deepStrictEqual(plan.phases[0].components.map(c => c.glmId), ['acme:app.free'])
    assert.strictEqual(plan.cycle.length, 2)
  })
})

// --- size and policy --------------------------------------------------------

describe('size and policy', () => {
  const many = (count) => Array.from({ length: count },
    (_, i) => readyComponent(`acme:app.c${String(i).padStart(2, '0')}`)).flat()

  it('splits a layer larger than one sitting', () => {
    const plan = planGeneration(many(14), { phaseSize: 5 })
    assert.deepStrictEqual(plan.phases.map(p => p.components.length), [5, 5, 4])
    assert.deepStrictEqual(plan.phases.map(p => p.layer), [1, 1, 1])
  })

  it('numbers phases in the order they are meant to run', () => {
    const plan = planGeneration(many(14), { phaseSize: 5 })
    assert.deepStrictEqual(plan.phases.map(p => p.number), [1, 2, 3])
  })

  it('defaults to a reviewable phase size', () => {
    assert.strictEqual(planGeneration(many(20)).phases[0].components.length, DEFAULT_PHASE_SIZE)
  })

  it('starts on hold and carries on afterwards', () => {
    // The first phase is where you find out what the prompt specs left out.
    const plan = planGeneration(many(14), { phaseSize: 5 })
    assert.deepStrictEqual(plan.phases.map(p => p.policy), ['hold', 'continue', 'continue'])
  })
})

// --- scope ------------------------------------------------------------------

describe('advisories — what the plan could not derive', () => {
  it('says so when nothing declares a dependency, since the order means nothing', () => {
    const plan = planGeneration([
      ...readyComponent('acme:app.a'), ...readyComponent('acme:app.b')
    ])
    assert.ok(plan.advisories.some(a => a.kind === 'no-dependency-edges'))
  })

  it('stays quiet once the edges are there', () => {
    const plan = planGeneration([
      ...readyComponent('acme:app.a',
        { relationships: [{ kind: 'depends-on', targetGlmId: 'acme:app.b' }] }),
      ...readyComponent('acme:app.b')
    ])
    assert.ok(!plan.advisories.some(a => a.kind === 'no-dependency-edges'))
  })

  it('says so when no interaction declares an fsm contract', () => {
    // Everything then plans as stateless: no model check, and no capture-ready
    // instruction in the prompt spec. That is a real answer or a missing
    // contract, and only the author knows which.
    const plan = planGeneration(readyComponent('acme:app.a'))
    assert.ok(plan.advisories.some(a => a.kind === 'nothing-declared-stateful'))
  })

  it('stays quiet once something is stateful', () => {
    const plan = planGeneration([
      ...readyComponent('acme:app.a'), fsmInteraction('acme:app.a')
    ])
    assert.ok(!plan.advisories.some(a => a.kind === 'nothing-declared-stateful'))
  })
})

describe('scope', () => {
  it('plans what has no code and what the design has outrun', () => {
    // Scope is per component, not one timestamp for the sekkei. A watermark
    // answers "has anything been generated since I last said so", which nobody
    // maintains and which reads as "nothing has been built" on a project with
    // three finished components.
    const plan = planGeneration([
      ...readyComponent('acme:app.done'),
      ...readyComponent('acme:app.moved'),
      ...readyComponent('acme:app.fresh')
    ], {
      buildState: {
        'acme:app.done': { state: 'built' },
        'acme:app.moved': { state: 'stale' },
        'acme:app.fresh': { state: 'new' }
      }
    })
    assert.deepStrictEqual(
      plan.phases[0].components.map(c => c.glmId).sort(),
      ['acme:app.fresh', 'acme:app.moved'])
  })

  it('plans everything when no build state is given', () => {
    const plan = planGeneration([
      ...readyComponent('acme:app.a'), ...readyComponent('acme:app.b')
    ])
    assert.strictEqual(plan.totals.candidates, 2)
  })

  it('does not re-queue a component that already has a card', () => {
    const plan = planGeneration([
      ...readyComponent('acme:app.a'), ...readyComponent('acme:app.b')
    ], { alreadyOnBoard: ['acme:app.a'] })
    assert.deepStrictEqual(plan.queued.map(c => c.glmId), ['acme:app.a'])
    assert.deepStrictEqual(plan.phases[0].components.map(c => c.glmId), ['acme:app.b'])
  })

  it('is deterministic — the same sekkei plans the same way twice', () => {
    const nodes = many12()
    assert.deepStrictEqual(planGeneration(nodes), planGeneration(nodes))
  })

  it('handles an empty sekkei', () => {
    const plan = planGeneration([])
    assert.deepStrictEqual(plan.phases, [])
    assert.strictEqual(plan.totals.components, 0)
  })

  it('survives a sekkei with no relationships loaded at all', () => {
    const plan = planGeneration(readyComponent('acme:app.core'))
    assert.strictEqual(plan.phases.length, 1)
  })
})

function many12() {
  return Array.from({ length: 12 },
    (_, i) => readyComponent(`acme:app.c${String(i).padStart(2, '0')}`)).flat()
}
