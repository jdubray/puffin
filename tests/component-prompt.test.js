/**
 * The prompt a card runs.
 *
 * These assert what must be IN the prompt, because everything missing from it
 * is something the session will either guess at or spend turns retrieving.
 * The two stages differ in exactly one way that matters — planning writes no
 * files — and that difference is load-bearing, so it is tested directly.
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { buildComponentPrompt, allowedToolsFor } = require('../src/main/component-prompt.js')

const ID = 'cogfab:sim.kernel.core'

const nodes = () => [
  {
    glmId: ID, stratum: 'component', title: 'kernel.mjs', description: 'the clock',
    body: { boundary: 'owns the dispatch loop', runtime: 'node' }
  },
  {
    glmId: `${ID}.spec.prompt`, stratum: 'spec', specKind: 'prompt',
    body: {
      template: 'Implement the virtual clock and dispatch loop.',
      outputs: ['src/kernel.mjs'],
      context_bundle: ['cogfab:sim.kernel.streams']
    }
  },
  {
    glmId: `${ID}.spec.acceptance`, stratum: 'spec', specKind: 'acceptance',
    body: { verifier: { command: 'bun test src/kernel.test.mjs' },
      deliverables: ['src/kernel.mjs', 'src/kernel.test.mjs'],
      acceptance_criteria: ['events fire in timestamp order'] }
  },
  {
    glmId: `${ID}.dispatch_cycle`, stratum: 'interaction', title: 'dispatch cycle',
    body: { contract: 'fsm', states: ['idle', 'running'], transitions: ['idle->running'] }
  },
  {
    glmId: 'cogfab:sim.kernel.streams', stratum: 'component', title: 'streams',
    description: 'named RNG streams', body: { boundary: 'owns randomness' }
  }
]

const build = (overrides = {}) =>
  buildComponentPrompt({ nodes: nodes(), glmId: ID, ...overrides })

describe('what the prompt carries', () => {
  it('carries the spec template, outputs and verifier', () => {
    const result = build()
    assert.strictEqual(result.success, true)
    assert.match(result.prompt, /virtual clock and dispatch loop/)
    assert.match(result.prompt, /src\/kernel\.mjs/)
    assert.match(result.prompt, /bun test src\/kernel\.test\.mjs/)
    // Both the prompt spec's outputs and the acceptance spec's deliverables:
    // the verifier runs the test file, so a card that did not declare it could
    // not pass its own gate without writing something "out of scope".
    assert.deepStrictEqual(result.outputs, ['src/kernel.mjs', 'src/kernel.test.mjs'])
  })

  it('resolves the context bundle instead of handing over ids to go fetch', () => {
    // A session that has to retrieve its own context spends turns on it and can
    // silently skip what it cannot find.
    const result = build()
    assert.match(result.prompt, /named RNG streams/)
    assert.match(result.prompt, /owns randomness/)
  })

  it('reports a dangling reference rather than resolving it to nothing', () => {
    const withGhost = nodes()
    withGhost[1].body.context_bundle = ['cogfab:sim.kernel.streams', 'cogfab:sim.ghost']
    const result = buildComponentPrompt({ nodes: withGhost, glmId: ID })
    assert.deepStrictEqual(result.missingContext, ['cogfab:sim.ghost'])
    assert.match(result.prompt, /UNRESOLVED REFERENCES/)
    assert.match(result.prompt, /defect\s+in the spec/)
  })

  it('includes the acceptance criteria the card will be judged on', () => {
    assert.match(build().prompt, /events fire in timestamp order/)
  })

  it('includes the interaction contract, which is the state vocabulary', () => {
    assert.match(build().prompt, /dispatch_cycle/)
    assert.match(build().prompt, /idle->running/)
  })

  it('says plainly when the acceptance spec names no verifier', () => {
    const noGate = nodes().filter(n => !n.glmId.endsWith('.spec.acceptance'))
    const result = buildComponentPrompt({ nodes: noGate, glmId: ID })
    assert.strictEqual(result.success, true)
    assert.match(result.prompt, /cannot pass its gate/)
  })

  it('refuses to build a prompt from a spec with no template', () => {
    // The planner should have caught this; refusing here means a card can never
    // start work on a spec that says nothing.
    const stub = nodes()
    stub[1].body.template = ''
    const result = buildComponentPrompt({ nodes: stub, glmId: ID })
    assert.strictEqual(result.success, false)
    assert.match(result.error, /no prompt spec template/)
  })

  it('refuses an unknown component', () => {
    const result = buildComponentPrompt({ nodes: nodes(), glmId: 'cogfab:sim.nope' })
    assert.strictEqual(result.success, false)
  })
})

describe('the two stages', () => {
  it('forbids writing during planning', () => {
    const result = build({ stage: 'plan' })
    assert.match(result.prompt, /Do NOT write or edit any file/)
    assert.doesNotMatch(result.prompt, /Write the files listed under OUTPUTS/)
  })

  it('asks planning to name what the spec does not settle', () => {
    assert.match(build({ stage: 'plan' }).prompt, /Name anything the spec does not settle/)
  })

  it('asks implementation to run the verifier itself', () => {
    const result = build({ stage: 'implement' })
    assert.match(result.prompt, /Run it yourself before you finish/)
    assert.doesNotMatch(result.prompt, /Do NOT write or edit any file/)
  })

  it('tells implementation to escalate rather than guess', () => {
    // An escalated card is a normal outcome; a wrong guess found at review is not.
    assert.match(build({ stage: 'implement' }).prompt, /stop and say so/)
  })
})

describe('what the session may run', () => {
  it("grants the verifier's binary, since that is the gate it must run", () => {
    // acceptEdits covers file edits only. Without this the session can write
    // the code and not test it, and the turn burns down on "This command
    // requires approval" in a panel with no approve button.
    assert.deepStrictEqual(allowedToolsFor('bun test src/kernel.test.mjs'), ['Bash(bun:*)'])
    assert.deepStrictEqual(allowedToolsFor('npm test -- kernel'), ['Bash(npm:*)'])
  })

  it('grants the binary rather than the exact command', () => {
    // The session legitimately varies it - one file, a filter, 2>&1 - and an
    // allowlist of one exact string refuses every variant.
    assert.strictEqual(allowedToolsFor('bun test x')[0], 'Bash(bun:*)')
  })

  it('grants nothing when the verifier is not a plain executable', () => {
    // A path, a pipe or a shell operator is the spec asking for something an
    // allowlist should not quietly hand over.
    for (const odd of ['cd foo && bun test', './scripts/verify.sh', 'a|b', '', '   ', null]) {
      assert.deepStrictEqual(allowedToolsFor(odd), [], String(odd))
    }
  })

  it('tells the session where the boundary is', () => {
    const result = build({ stage: 'implement' })
    assert.deepStrictEqual(result.allowedTools, ['Bash(bun:*)'])
    assert.match(result.prompt, /you may run `bun` commands without asking/)
    assert.match(result.prompt, /stop and say which one/)
  })

  it('says so plainly when nothing is pre-approved', () => {
    const noGate = nodes().filter(n => !n.glmId.endsWith('.spec.acceptance'))
    const result = buildComponentPrompt({ nodes: noGate, glmId: ID, stage: 'implement' })
    assert.deepStrictEqual(result.allowedTools, [])
    assert.match(result.prompt, /no command is pre-approved/)
  })
})

describe('scratch space', () => {
  it('points throwaway work outside the repository', () => {
    // The session reached for /tmp and was blocked - only the project is
    // writable - and writing probe scripts into the project instead would
    // dirty the tree the out-of-scope check reads.
    const result = build({ stage: 'implement', scratchDir: 'C:/tmp/puffin-card-scratch/x' })
    assert.match(result.prompt, /SCRATCH/)
    assert.match(result.prompt, /C:\/tmp\/puffin-card-scratch\/x/)
    assert.match(result.prompt, /\/tmp is NOT writable/)
    assert.match(result.prompt, /changes this card did not declare/)
  })

  it('says nothing about scratch when none was provided', () => {
    assert.doesNotMatch(build().prompt, /SCRATCH/)
  })
})

describe('the proof lane', () => {
  it('names capture-ready where polygen cannot emit', () => {
    const result = build({
      stage: 'implement',
      lane: { language: { language: 'python' }, stateful: { lane: 'captured' } }
    })
    assert.match(result.prompt, /CAPTURE-READY/)
    assert.match(result.prompt, /step-listener seam/)
    assert.match(result.prompt, /python/)
  })

  it('names the model check where polygen does emit', () => {
    const result = build({
      lane: { language: { language: 'javascript' }, stateful: { lane: 'generated' } }
    })
    assert.match(result.prompt, /model-check/)
    assert.doesNotMatch(result.prompt, /CAPTURE-READY/)
  })

  it('omits the lane paragraph entirely when the lane is unknown', () => {
    assert.doesNotMatch(build().prompt, /HOW THIS IS PROVED/)
  })
})
