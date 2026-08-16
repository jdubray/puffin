/**
 * Generation planning — which components go in which phase, and why.
 *
 * A generation is a batch of components generated from the sekkei in one run.
 * With dozens of net-new specs the first real question is not "how do I
 * generate?" but "in what order, and how much at a time?" — and that question
 * has a derivable answer, so nothing here asks a model.
 *
 * Asking a model would produce a plausible grouping that cannot be reproduced,
 * cannot be re-derived when the next spec lands, and quietly hides the two
 * facts that actually decide the order: whether a component has what a
 * generation consumes, and what it depends on. Both are in the sekkei already.
 *
 * Four cuts, in this order:
 *
 *   1. READINESS. A component enters a generation only if it carries a prompt
 *      spec (template + outputs) and an acceptance spec with a verifier
 *      command. The ones that don't are not "later phases" — they are
 *      authoring work, and they come back as phase zero.
 *   2. LANE. polygen / capture-ready / acceptance-only. A phase where some
 *      cards are model-checked and others are proved by replay is a phase
 *      nobody can judge at a glance.
 *   3. DEPENDENCY. Containment (system → capability → component) is not
 *      dependency; the `depends-on` edges are. Topological layers, leaves
 *      first, so a component is never generated before what it calls.
 *   4. SIZE. A phase that cannot be reviewed in one sitting is not a phase.
 *
 * @module shared/generation-plan
 */

/** Default cards per phase — a reviewable sitting, not a machine limit. */
export const DEFAULT_PHASE_SIZE = 6

/** The two spec kinds a generation consumes. */
const PROMPT_SPEC = 'prompt'
const ACCEPTANCE_SPEC = 'acceptance'

/**
 * Does this interaction declare a state contract?
 *
 * Read as substance, not label. GLM spells the discriminator 'fsm', but the
 * thing being declared is not a finite state machine in Lamport's sense and
 * SAM does not model one: what a contract actually pins down is the vocabulary
 * a TRACE is checked against — the named positions the code passes through and
 * the moves between them. A machine may be unbounded; the checker explores a
 * finite window of it, which is a property of the check, not of the code.
 *
 * So the test is whether a state vocabulary is there to check against. An
 * interaction labelled 'fsm' with no states declares nothing, and one that
 * declares states under a future label still declares something.
 *
 * @param {Object} node - Any sekkei node
 * @returns {boolean}
 */
function declaresStateContract(node) {
  if (node.stratum !== 'interaction') return false
  const body = node.body || {}
  const hasVocabulary = Array.isArray(body.states) && body.states.length > 0 &&
    Array.isArray(body.transitions) && body.transitions.length > 0
  return hasVocabulary || body.contract === 'fsm'
}

/**
 * The verifier command an acceptance spec carries. GLM has written this two
 * ways — a bare string, and `{command}` — and a plan that recognised only one
 * would report ready components as unready.
 *
 * @param {Object} body - Spec node body
 * @returns {string} Empty when absent
 */
function verifierCommand(body) {
  const verifier = body?.verifier
  if (typeof verifier === 'string') return verifier.trim()
  if (verifier && typeof verifier.command === 'string') return verifier.command.trim()
  return ''
}

/**
 * The instruction text a prompt spec carries.
 *
 * Read under every key the sekkei has actually used. Real sekkeis are authored
 * with `template`; GLM's own generator reads `prompt_template`; `content` is
 * the generic SpecBody field. Recognising only one of them reported eight fully
 * authored components as unready and sent them all to phase zero — a planner
 * that is wrong about readiness is worse than no planner, because it sends you
 * to rewrite specs that were already finished.
 *
 * @param {Object} body - Prompt spec body
 * @returns {string} Empty when the spec is genuinely a stub
 */
export function promptTemplate(body) {
  for (const key of ['template', 'prompt_template', 'content']) {
    const value = body?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** The glm id of the component a node hangs beneath, or the node itself. @private */
function componentIdOf(glmId, componentIds) {
  if (componentIds.has(glmId)) return glmId
  const segments = String(glmId).split('.')
  for (let i = segments.length - 1; i > 0; i--) {
    const candidate = segments.slice(0, i).join('.')
    if (componentIds.has(candidate)) return candidate
  }
  return null
}

/**
 * Which lane a component is built and proved in.
 *
 * Mirrors `validationLaneFor` in the main process, but decided per component
 * rather than per project: a project has one language, and within it a
 * stateful component and a stateless one are still proved differently.
 *
 * @param {boolean} stateful - Does an FSM interaction hang beneath it
 * @param {{stateful?: {lane?: string}}} [buildLane] - From project:buildLane
 * @returns {'generated'|'captured'|'acceptance'}
 */
export function laneFor(stateful, buildLane) {
  if (!stateful) return 'acceptance'
  return buildLane?.stateful?.lane === 'generated' ? 'generated' : 'captured'
}

/** Human label for a lane, used in the phase heading. */
export const LANE_LABEL = {
  generated: 'polygen — model-checked',
  captured: 'capture-ready — proved by replay',
  acceptance: 'acceptance verifier'
}

/**
 * Everything blocking a component from entering a generation.
 *
 * Reported as a list rather than a boolean because "not ready" is a work item:
 * the reasons ARE the authoring instructions for phase zero.
 *
 * @param {Object} component - The component node
 * @param {Map<string, Object>} specsByKind - spec_kind → node, for this component
 * @param {boolean} stateful
 * @returns {string[]} Empty when ready
 */
function readinessGaps(component, specsByKind, stateful) {
  const gaps = []
  const prompt = specsByKind.get(PROMPT_SPEC)
  const acceptance = specsByKind.get(ACCEPTANCE_SPEC)

  if (!prompt) {
    gaps.push('no prompt spec — nothing tells the implementer what to build')
  } else {
    const body = prompt.body || {}
    const template = promptTemplate(body)
    if (!template) gaps.push('prompt spec carries no template')
    if (!Array.isArray(body.outputs) || body.outputs.length === 0) {
      gaps.push('prompt spec names no outputs — generation has nowhere to write')
    }
  }

  if (!acceptance) {
    gaps.push('no acceptance spec — the card would have no gate to pass')
  } else if (!verifierCommand(acceptance.body)) {
    gaps.push('acceptance spec has no verifier command')
  }

  // A stateful component with no contract cannot be model-checked OR replayed
  // against anything: the corpus would have no shape to be consistent with.
  if (stateful && !component._hasContract) {
    gaps.push('declares a state contract with no states or transitions to check against')
  }

  return gaps
}

/**
 * Group ready components into dependency layers.
 *
 * Kahn's algorithm over the `depends-on` edges, restricted to the components
 * being generated: an edge to something already built, or to something not in
 * this run, does not constrain the order. What remains when no node has a
 * clear dependency is a cycle, and a cycle is reported rather than broken —
 * silently picking an order inside one would hand you a card that cannot pass.
 *
 * @param {Array<{glmId: string, deps: Set<string>}>} items
 * @returns {{layers: Array<Array<Object>>, cycle: Array<Object>}}
 */
function dependencyLayers(items) {
  const remaining = new Map(items.map(item => [item.glmId, item]))
  const placed = new Set()
  const layers = []

  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter(item => [...item.deps].every(dep => !remaining.has(dep) || placed.has(dep)))

    if (ready.length === 0) return { layers, cycle: [...remaining.values()] }

    for (const item of ready) {
      remaining.delete(item.glmId)
    }
    for (const item of ready) placed.add(item.glmId)
    layers.push(ready)
  }

  return { layers, cycle: [] }
}

/**
 * Plan a generation over a sekkei.
 *
 * @param {Array<Object>} nodes - Sekkei nodes, ideally with `relationships`
 * @param {Object} [options]
 * @param {Object} [options.buildLane] - From project:buildLane
 * @param {number} [options.phaseSize=DEFAULT_PHASE_SIZE]
 * @param {string|null} [options.since] - ISO time; only components touched
 *   after it are candidates. Null plans the whole sekkei.
 * @param {Set<string>|Array<string>} [options.alreadyOnBoard] - Component glm
 *   ids that already have a card, so a re-plan does not re-queue them.
 * @returns {{phases: Array<Object>, notReady: Array<Object>, cycle: Array<Object>,
 *            queued: Array<Object>, totals: Object}}
 */
export function planGeneration(nodes = [], options = {}) {
  const {
    buildLane = null,
    phaseSize = DEFAULT_PHASE_SIZE,
    since = null,
    alreadyOnBoard = []
  } = options

  const onBoard = alreadyOnBoard instanceof Set ? alreadyOnBoard : new Set(alreadyOnBoard)
  const components = nodes.filter(n => n.stratum === 'component')
  const componentIds = new Set(components.map(n => n.glmId))
  const sinceMs = since ? new Date(since).getTime() : null

  /** Descendants grouped under their component, so one pass over nodes serves all. */
  const specsFor = new Map()
  const statefulIds = new Set()
  const contractIds = new Set()
  const touchedAt = new Map(components.map(c => [c.glmId, timeOf(c)]))

  for (const node of nodes) {
    if (node.stratum === 'component') continue
    const owner = componentIdOf(node.glmId, componentIds)
    if (!owner) continue

    touchedAt.set(owner, Math.max(touchedAt.get(owner) || 0, timeOf(node)))

    if (node.stratum === 'spec') {
      if (!specsFor.has(owner)) specsFor.set(owner, new Map())
      const kind = node.specKind || node.body?.spec_kind || ''
      specsFor.get(owner).set(String(kind).toLowerCase(), node)
    }
    if (declaresStateContract(node)) {
      statefulIds.add(owner)
      const states = node.body?.states
      const transitions = node.body?.transitions
      if (Array.isArray(states) && states.length > 0 &&
          Array.isArray(transitions) && transitions.length > 0) {
        contractIds.add(owner)
      }
    }
  }

  const notReady = []
  const queued = []
  const ready = []

  for (const component of components) {
    if (sinceMs !== null && (touchedAt.get(component.glmId) || 0) <= sinceMs) continue

    const stateful = statefulIds.has(component.glmId)
    const specs = specsFor.get(component.glmId) || new Map()
    const withContract = { ...component, _hasContract: contractIds.has(component.glmId) }
    const gaps = readinessGaps(withContract, specs, stateful)
    const lane = laneFor(stateful, buildLane)
    const entry = {
      glmId: component.glmId,
      title: component.title || component.glmId,
      lane,
      stateful,
      reasons: gaps
    }

    if (gaps.length > 0) notReady.push(entry)
    else if (onBoard.has(component.glmId)) queued.push(entry)
    else ready.push({ ...entry, deps: dependenciesOf(component, componentIds) })
  }

  const { layers, cycle } = dependencyLayers(ready)

  // What the plan could not derive, said out loud. A phase ordering with no
  // edges behind it and a lane chosen by default both look like answers; the
  // planner is the only thing in a position to know they were not.
  const advisories = []
  if (ready.length > 1 && ready.every(item => item.deps.size === 0)) {
    advisories.push({
      kind: 'no-dependency-edges',
      text: 'No component in scope declares a depends-on edge, so every phase ' +
        'is one layer and the split is by size alone. Add the edges in the ' +
        'sekkei to get an ordering that means something.'
    })
  }
  if (components.length > 0 && statefulIds.size === 0) {
    advisories.push({
      kind: 'nothing-declared-stateful',
      text: 'No interaction declares a state contract, so every component is ' +
        'planned as stateless and proved by its acceptance verifier alone — ' +
        'no model check, and no capture-ready instruction in its prompt spec. ' +
        'Plenty of stateful code needs nothing more than that; this is only ' +
        'worth changing where the reachable states are the risk.'
    })
  }

  const phases = []
  layers.forEach((layer, layerIndex) => {
    // Lane before size: a phase must be judgeable as one kind of thing.
    const byLane = new Map()
    for (const item of layer) {
      if (!byLane.has(item.lane)) byLane.set(item.lane, [])
      byLane.get(item.lane).push(item)
    }
    for (const [lane, items] of byLane) {
      items.sort((a, b) => a.glmId.localeCompare(b.glmId))
      for (let i = 0; i < items.length; i += phaseSize) {
        phases.push({
          number: phases.length + 1,
          layer: layerIndex + 1,
          lane,
          laneLabel: LANE_LABEL[lane],
          components: items.slice(i, i + phaseSize).map(stripDeps),
          // The first phase runs on hold: it is where you learn what the prompt
          // specs left out, and holding stops at the first escalation instead
          // of generating the rest of the batch with the same defect in it.
          policy: phases.length === 0 ? 'hold' : 'continue'
        })
      }
    }
  })

  return {
    phases,
    advisories,
    notReady: notReady.sort((a, b) => a.glmId.localeCompare(b.glmId)),
    cycle: cycle.map(stripDeps),
    queued: queued.sort((a, b) => a.glmId.localeCompare(b.glmId)),
    totals: {
      components: components.length,
      candidates: notReady.length + queued.length + ready.length,
      ready: ready.length,
      notReady: notReady.length,
      queued: queued.length,
      phases: phases.length
    }
  }
}

/** Drop the internal dep set before the plan leaves this module. @private */
function stripDeps({ deps, ...rest }) {
  return rest
}

/** Last-touched time of a node, in ms. @private */
function timeOf(node) {
  return new Date(node.updatedAt || node.authoredAt || 0).getTime() || 0
}

/**
 * The components a component depends on.
 *
 * `depends-on` edges may point at a spec or an interaction rather than the
 * component itself; each is lifted to the component that owns it, because the
 * generation unit is the component. Self-edges are dropped — a component that
 * depends on its own spec depends on nothing.
 *
 * Exported because the board needs the same answer per card: a component built
 * before what it calls exists produces code that cannot run and tests that fail
 * for a reason belonging to another card.
 *
 * @param {Object} component - The component node, with relationships
 * @param {Set<string>} componentIds - Every component in the sekkei
 * @returns {Set<string>}
 */
export function dependenciesOf(component, componentIds) {
  const deps = new Set()
  for (const rel of component.relationships || []) {
    if (rel.kind !== 'depends-on') continue
    const owner = componentIdOf(rel.targetGlmId, componentIds)
    if (owner && owner !== component.glmId) deps.add(owner)
  }
  return deps
}
