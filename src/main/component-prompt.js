/**
 * The prompt a card runs.
 *
 * A component's prompt spec is not a prompt — it is the ingredients: a
 * template, a context bundle of glm ids, the files to write, and the verifier
 * that will judge the result. This module resolves those into the text a
 * session actually receives.
 *
 * Two stages, because the task-card machine has two:
 *
 *   PLAN (ready → planning) — read the spec and the code around it, then say
 *   how this component will be built. No files written. The point is to find
 *   out what the spec left ambiguous BEFORE a session spends a turn guessing.
 *
 *   IMPLEMENT (implementing) — write the files the spec names, against the
 *   verifier the acceptance spec names.
 *
 * The context bundle is resolved here rather than handed over as a list of
 * ids: a session that has to go fetch its own context spends turns on
 * retrieval and can silently skip a node it could not find. Resolution also
 * makes a dangling reference visible — it is reported in the prompt instead of
 * quietly resolving to nothing.
 *
 * @module component-prompt
 */

'use strict'

/**
 * Hard constraints for the implementation stage.
 *
 * Deliberately not GLM's multi-file delimiter format: Puffin's sessions have
 * Write and Edit, so asking for files as delimited text would make the model
 * re-encode work it can do directly, and nothing here parses that format.
 */
const IMPLEMENT_RULES = `Rules for this implementation:
- Write the files listed under OUTPUTS, at exactly those paths. Do not invent
  others, and do not write outside them.
- The verifier below is the gate. Run it yourself before you finish, and fix
  what it reports rather than explaining it away.
- Do not weaken types to pass: no 'as any', no @ts-ignore, no skipped tests.
- If the spec is ambiguous or contradicts the code you find, stop and say so
  rather than picking one reading silently. An escalated card is a normal
  outcome; a wrong guess discovered at review is not.`

const REVIEW_RULES = `For this review turn:
- Read the spec above, then read the files this card produced. Do NOT edit
  anything: a reviewer that fixes what it finds has reviewed nothing.
- The gates have already run. The verifier passed and the state check gave its
  answer, so do not re-litigate them — look for what a passing test suite does
  not see: behaviour the spec asks for that no test exercises, a spec rule the
  code contradicts, an acceptance criterion satisfied in letter and not in
  substance, an error path that cannot be reached.
- Report findings worst-first, each naming the spec clause and the file and
  line. If a finding is a defect in the code, say 'defect'. If the code is
  reasonable and the SPEC is what is wrong or unclear, say 'spec-mismatch' —
  those go back to different places.
- Finding nothing is a real answer. Say so plainly rather than manufacturing a
  concern to look thorough; a review that always finds something teaches the
  reader to discount it.`

const PLAN_RULES = `For this planning turn:
- Read the spec above and the code it will sit in. Do NOT write or edit any file.
- Produce a short plan: the files you will create, the shape of the public
  surface, the collaborators you will touch, and the order you will build in.
- Name anything the spec does not settle. That list is the point of this turn —
  it is cheaper to answer now than to discover it half-implemented.`

/**
 * The tools a card's session may use without asking.
 *
 * A card session has no one to answer a permission prompt: the board shows the
 * reply but has no approve button, so an unapproved Bash call stalls the turn
 * and the transcript fills with "This command requires approval" until the
 * turn budget runs out. That is what makes this list load-bearing rather than
 * a convenience.
 *
 * It is derived from the verifier rather than fixed, and it grants the verifier's
 * BINARY (`Bash(bun:*)`), not the exact string: the session legitimately runs
 * the suite in variants - one file, a filter, with 2>&1 - and an allowlist of
 * one exact command refuses all of them. Nothing else is granted; a session
 * that needs more says so and the card escalates, which is the honest outcome.
 *
 * @param {string} verifier - The acceptance spec's verifier command
 * @returns {string[]} --allowedTools entries
 */
function allowedToolsFor(verifier) {
  const command = String(verifier || '').trim()
  // A compound command grants nothing. Its first word is not the verifier -
  // `cd build && ctest` would hand over `cd` and still leave ctest blocked,
  // which is the worst of both: a grant that buys nothing and hides the fact
  // that the real command was never approved.
  if (/[&|;<>`$(){}\n]/.test(command)) return []
  const binary = command.split(/\s+/)[0]
  // A bare executable name only. A path here is the spec pointing at a script
  // whose contents an allowlist cannot vouch for.
  if (!/^[a-zA-Z0-9_.-]+$/.test(binary)) return []
  return [`Bash(${binary}:*)`]
}

/**
 * The verifier command an acceptance spec carries, in either shape GLM writes.
 *
 * @param {Object} body
 * @returns {string}
 */
function verifierCommand(body) {
  const verifier = body?.verifier
  if (typeof verifier === 'string') return verifier.trim()
  if (verifier && typeof verifier.command === 'string') return verifier.command.trim()
  return ''
}

/**
 * The instruction text of a prompt spec, under any key a sekkei has used.
 *
 * @param {Object} body
 * @returns {string}
 */
function promptTemplate(body) {
  for (const key of ['template', 'prompt_template', 'content']) {
    const value = body?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/**
 * Does this component declare a state contract of its own?
 *
 * The build lane is a property of the project — it says what polygen can emit
 * here. Whether a machine is wanted for THIS component is a property of the
 * component, and asking the second question of the first is how a prompt ends
 * up hedging with "if this component is stateful" at a model that cannot check.
 *
 * @param {Array<Object>} descendants - nodes beneath the component
 * @returns {boolean}
 */
function declaresStateContract(descendants) {
  return descendants.some(node => {
    if (node.stratum !== 'interaction') return false
    const body = node.body || {}
    const vocabulary = Array.isArray(body.states) && body.states.length > 0 &&
      Array.isArray(body.transitions) && body.transitions.length > 0
    return vocabulary || body.contract === 'fsm'
  })
}

/** Where a component's machine lives, relative to the project. @private */
function machineDirFor(glmId) {
  const name = String(glmId).split('.').pop()
  return `machines/${name}`
}

/** A node's body as readable text for the bundle. @private */
function bodyText(node) {
  const body = node.body
  if (body === null || body === undefined) return ''
  if (typeof body === 'string') return body
  return JSON.stringify(body, null, 2)
}

/**
 * Resolve a context bundle of glm ids into text.
 *
 * @param {string[]} ids
 * @param {Map<string, Object>} byId
 * @returns {{text: string, missing: string[]}}
 */
function resolveBundle(ids, byId) {
  const parts = []
  const missing = []
  for (const id of ids) {
    const node = byId.get(id)
    if (!node) {
      missing.push(id)
      continue
    }
    parts.push(`--- ${id} (${node.stratum}) — ${node.title || ''}\n` +
      `${node.description ? node.description + '\n' : ''}${bodyText(node)}`)
  }
  return { text: parts.join('\n\n'), missing }
}

/**
 * Build the prompt for one card.
 *
 * @param {Object} params
 * @param {Array<Object>} params.nodes - Every sekkei node (flat)
 * @param {string} params.glmId - The component being built
 * @param {'plan'|'implement'} [params.stage='plan']
 * @param {Object} [params.lane] - From project:buildLane, for the proof brief
 * @param {string} [params.sourceDir] - Where the outputs are rooted
 * @returns {{success: boolean, prompt?: string, error?: string, outputs?: string[],
 *            verifier?: string, title?: string, missingContext?: string[]}}
 */
function buildComponentPrompt({ nodes = [], glmId, stage = 'plan', lane = null, sourceDir = '', scratchDir = '' }) {
  const byId = new Map(nodes.map(n => [n.glmId, n]))
  const component = byId.get(glmId)
  if (!component) return { success: false, error: `No node '${glmId}' in this sekkei` }

  const prompt = byId.get(`${glmId}.spec.prompt`)
  const acceptance = byId.get(`${glmId}.spec.acceptance`)
  const template = promptTemplate(prompt?.body)
  if (!template) {
    return { success: false, error: `${glmId} has no prompt spec template — author it before starting work` }
  }

  // The prompt spec's outputs AND the acceptance spec's deliverables. They
  // disagree in practice - a spec names streams.mjs under outputs while its
  // acceptance node lists streams.mjs and streams.test.mjs, and the verifier
  // runs the test file - so a session that writes only the outputs cannot pass
  // its own gate. Taking both means the card declares everything it is judged
  // on, and the out-of-scope check stops flagging a file the design asked for.
  const outputs = [...new Set([
    ...(prompt?.body?.outputs || []),
    ...(acceptance?.body?.deliverables || [])
  ].map(o => (typeof o === 'string' ? o : o?.path)).filter(Boolean))]
  const verifier = verifierCommand(acceptance?.body)
  const bundle = resolveBundle(prompt?.body?.context_bundle || [], byId)
  const allowed = allowedToolsFor(verifier)

  // Everything hanging beneath the component: its interactions and its other
  // spec leaves. A session that reads only the prompt spec misses the
  // acceptance criteria it will be judged against.
  const descendants = nodes.filter(n =>
    n.glmId !== glmId && n.glmId.startsWith(`${glmId}.`) &&
    n.glmId !== `${glmId}.spec.prompt`)

  // A machine is a deliverable of this card, not an aside. Saying "write only
  // what OUTPUTS lists" and then asking for a machines/ directory is a
  // contradiction, and a session that resolves it by obeying the stricter rule
  // is behaving correctly — so the files go in OUTPUTS instead.
  const wantsMachine = lane?.stateful?.lane === 'generated' && declaresStateContract(descendants)
  const machineDir = machineDirFor(glmId)
  if (wantsMachine) {
    outputs.push(
      `${machineDir}/contract.json`,
      `${machineDir}/next.cjs`,
      `${machineDir}/invariants.mjs`)
  }

  const sections = [
    stage === 'review'
      ? 'You are reviewing one component of a sekkei (設計) — the design of record — ' +
        'against the spec it was built from.'
      : 'You are implementing one component of a sekkei (設計) — the design of record.',
    `COMPONENT: ${component.title || glmId}\nglm id: ${glmId}` +
      (component.description ? `\n${component.description}` : '') +
      (component.body ? `\n${bodyText(component)}` : ''),
    `SPEC (what to build):\n${template}`,
    outputs.length > 0
      ? `OUTPUTS (write exactly these${sourceDir ? `, relative to ${sourceDir}` : ''}):\n` +
        outputs.map(o => `- ${o}`).join('\n')
      : 'OUTPUTS: the spec names none — say so rather than guessing at paths.',
    verifier
      ? `VERIFIER (the gate this card must pass):\n${verifier}`
      : 'VERIFIER: the acceptance spec names none. Say so — this card cannot pass its gate without one.',
    descendants.length > 0
      ? `THIS COMPONENT'S OTHER SEKKEI NODES:\n\n` +
        descendants.map(n => `--- ${n.glmId} (${n.specKind || n.stratum})\n` +
          `${n.description ? n.description + '\n' : ''}${bodyText(n)}`).join('\n\n')
      : '',
    bundle.text ? `CONTEXT BUNDLE (resolved from the spec's references):\n\n${bundle.text}` : '',
    bundle.missing.length > 0
      ? `UNRESOLVED REFERENCES — these ids are in the spec's context bundle but ` +
        `no such node exists: ${bundle.missing.join(', ')}. Treat that as a defect ` +
        `in the spec, not as context you should invent.`
      : '',
    lane ? laneBrief(lane, stage, { wantsMachine, machineDir }) : '',
    stage === 'implement' ? IMPLEMENT_RULES
      : stage === 'review' ? REVIEW_RULES
        : PLAN_RULES,
    // Scratch work needs somewhere to go, and it must not be the repo. A
    // session reaching for /tmp is blocked (only the project is writable), and
    // a session dropping probe scripts next to the source dirties the working
    // tree - which now feeds the out-of-scope check and would report the
    // session's own scaffolding as an undeclared change.
    scratchDir
      ? `SCRATCH: for throwaway files - probe scripts, captured output, notes to ` +
        `yourself - use ${scratchDir}. It is writable and outside the repository. ` +
        `/tmp is NOT writable in this session, and scratch files written into the ` +
        `project will be reported as changes this card did not declare.`
      : '',
    // Say what the session may run. Without this it discovers the boundary by
    // hitting it, and a refused command reads to the model as a transient
    // failure worth retrying rather than a rule.
    allowed.length > 0
      ? `SHELL: you may run \`${allowed[0].slice(5, -1).replace(':*', '')}\` commands without asking. ` +
        `Anything else needs an approval nobody is watching for, so it will hang: ` +
        `if you need another command, stop and say which one and why.`
      : `SHELL: no command is pre-approved for this card, and nobody is watching ` +
        `for an approval prompt. Do not start one - say what you would have run.`
  ]

  return {
    success: true,
    prompt: sections.filter(Boolean).join('\n\n'),
    outputs,
    verifier,
    allowedTools: allowed,
    title: component.title || glmId,
    missingContext: bundle.missing
  }
}

/**
 * How this component gets proved, in the project's lane.
 *
 * Same instruction the prompt spec should already carry, restated at the point
 * of use: a spec authored before the lane was known would otherwise send a
 * session off to write a module with no capture seam, and that is not
 * something you can add afterwards without a rewrite.
 *
 * @private
 */
function laneBrief(lane, stage, { wantsMachine = false, machineDir = 'machines/<component>' } = {}) {
  const language = lane.language?.language || 'this project'
  const kind = lane.stateful?.lane

  if (kind === 'generated' && !wantsMachine) {
    // Nothing here declares a state contract, so there is no machine to write
    // and no model check to pass. Saying so beats a conditional the model has
    // to adjudicate.
    return 'HOW THIS IS PROVED: no interaction of this component declares a ' +
      'state contract, so there is no state graph to check — the acceptance ' +
      'verifier above is the proof.'
  }

  if (kind === 'generated') {
    // The layout is not decoration: Polygraph discovers a machine by finding a
    // contract beside a module. A component authored as a perfect state machine
    // that lives nowhere it looks is not checkable, and its card's validation
    // gate goes on reporting 'not-applicable' forever.
    return 'HOW THIS IS PROVED: this component\'s interaction declares a state ' +
      'contract — the states and transitions listed above. Author the checkable ' +
      'part as a SAM v2 strict-profile module, and put it where Polygraph looks:\n' +
      `  ${machineDir}/contract.json   state keys, actions, finite data domains\n` +
      `  ${machineDir}/next.cjs        createInstance({strict: true}), named\n` +
      '                                acceptors, reject(reason) never throw\n' +
      `  ${machineDir}/invariants.mjs  what must hold in every reachable state\n` +
      'Those three paths are in your OUTPUTS above: they are deliverables of ' +
      'this card, not extras.\n' +
      "The module MUST use @cognitive-fab/sam-pattern's createInstance. Do not " +
      'shim it and do not fall back to a local factory with the same surface: ' +
      'the checker reads library-specific behaviour — lastStep().classification, ' +
      'step.mutations, the shallow-frozen pre-state, merge-only setState — so a ' +
      'lookalike changes what is being proved rather than standing in for it, and ' +
      'a green check would be a green check on the stand-in. If the package is ' +
      'not installed, stop and say so: a missing dependency escalates a card, it ' +
      'does not license a substitute.\n' +
      'The checker explores a FINITE window, so bound the domains deliberately (a ' +
      'queue of 0..3, a cascade depth of 0..2) and say in the contract that the ' +
      'bound is the checker\'s window and not a runtime cap — the proof rests on ' +
      'the shape, which holds at any size. This module is the abstraction the ' +
      'implementation is checked against; it does not replace the implementation, ' +
      'and the acceptance verifier above still decides the code.'
  }
  return `HOW THIS IS PROVED: polygen emits JavaScript, so it does not apply to ` +
    `${language}. If this component is stateful, write it CAPTURE-READY (the ` +
    `/polygraph:capture-ready skill): one named step boundary, a declared state ` +
    `projection, observable rejections, and a step-listener seam present from the ` +
    `first commit${stage === 'implement' ? ', emitting one NDJSON line per step into a traces/ directory' : ''}. ` +
    `The corpus that seam produces is the only evidence that crosses out of ` +
    `${language} — a module written without it cannot be captured without a rewrite.`
}

module.exports = { buildComponentPrompt, promptTemplate, verifierCommand, allowedToolsFor }
