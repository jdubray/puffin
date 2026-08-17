/**
 * Board View — the verified kanban.
 *
 * Columns are the task-card machine's states; cards are durable polyrun
 * instances; a drag is a dispatch the machine may REJECT (the card bounces
 * back with the named reason). Doneness is mechanical where a gate is
 * wired: dragging backlog→ready asks the GLM verifier for the DoRC verdict
 * and dispatches MARK_READY with the gate's answer — not the human's.
 */

import { readVerifierRun, describeVerdict } from '../../../shared/verifier-verdict.js'
import { nextStep, pickNext, STEP } from '../../../shared/card-policy.js'
import { dependenciesOf } from '../../../shared/generation-plan.js'
import { renderMarkdown } from '../../lib/markdown.js'
import { splitOutput } from '../../lib/verifier-output.js'
import { cardIdFor as cardIdForNode, baseCardId, nextCardId, runOf } from '../../../shared/card-id.js'
import { unsettledCount, findingCount } from '../../../shared/turn-report.js'

/** Escape for an HTML attribute value — esc() leaves quotes alone. */
function escAttr(text) {
  return esc(text).replace(/"/g, '&quot;')
}

/** Escape text for safe interpolation into HTML */
function esc(text) {
  const div = document.createElement('div')
  div.textContent = String(text ?? '')
  return div.innerHTML
}

/**
 * A card's instanceId is derived from its sekkei node's glm id — the work
 * IS the spec. Lossy but deterministic, so the node is found by comparing
 * derived ids (no side table to drift).
 */


const COLUMNS = [
  { state: 'backlog', label: 'Backlog' },
  { state: 'ready', label: 'Ready' },
  { state: 'planning', label: 'Planning' },
  { state: 'implementing', label: 'Implementing' },
  { state: 'validating', label: 'Validating' },
  { state: 'reviewing', label: 'Reviewing' },
  { state: 'needsHuman', label: 'Needs Human' },
  { state: 'done', label: 'Done' }
]

/**
 * Drag target column → the action that attempts the move.
 *
 * Work is planned before it is implemented, and reviewed before it is done —
 * both are stages of the machine, so both are columns here rather than steps
 * someone remembers to take.
 */
/**
 * A cheap signature of everything the board draws from the runtime.
 *
 * Equal signatures mean a re-render would produce identical HTML, which is
 * what lets the poll tick find nothing and cost nothing. Every field the board
 * actually displays belongs here: one left out is a change that silently never
 * repaints, which is a worse failure than the flicker this replaced.
 *
 * @param {Array<Object>} cards
 * @param {Array<Object>} generations
 * @returns {string}
 */
export function boardSignature(cards = [], generations = []) {
  const cardPart = cards
    .map(c => [
      c.instanceId || c.id, c.seq, c.status,
      c.state?.cardState, c.state?.reworkCount, c.state?.lastSignal
    ].join(':'))
    .join('|')
  const batchPart = generations
    .map(g => [
      g.generationId, g.phase, g.policy, g.cards?.length,
      g.state?.genState, g.state?.pending, g.state?.escalated
    ].join(':'))
    .join('|')
  return `${cardPart}#${batchPart}`
}

const DRAG_ACTIONS = {
  'ready': 'MARK_READY',
  'planning': null, // START_WORK from ready, RESUME from needsHuman
  'implementing': 'PLAN_READY', // the only forward door into work
  'validating': null, // the Polygraph model check answers, not the drag
  'reviewing': 'VALIDATION_PASSED',
  'done': 'REVIEW_PASSED',
  'needsHuman': 'ESCALATE',
  'backlog': null // no action leads back to backlog — the machine will say so
}

export class BoardViewComponent {
  constructor(intents) {
    this.intents = intents
    this.container = null
    this.status = null
    this.cards = []
    this.generations = []
    this.session = null
    // instanceId -> {stage, at, ok}: which sessions have run, so a card can
    // show it and a button can say 'again' instead of implying nothing happened.
    this.sessionLog = {}
    this.runner = null
    this.confirm = null
    this.expandedColumn = null
    this.scrNote = null   // the result of raising an SCR from a planning turn  // a collapsed column opened by hand or by a drag   // a session the user has been asked to confirm    // the phase runner, when it is working
    this.policy = null    // polycheck's verdict per card, when it is installed
    // Off by default: skipping permission prompts is the user's call to make,
    // once, in the open - not a default they discover after the fact.
    this.unattended = false
    // Who accepts a clean review. The gates do not change; this is who signs.
    this.reviewBy = 'human'   // the one running card session, if any
    this.rejection = null // { instanceId, reason }
    this.journalFor = null // { instanceId, entries }
    this.binding = null // this project's bound sekkei (the gate's source)
    this.glmWorkspaceId = '' // '' = unbound → ungated, disclosed in the toolbar
    this.sekkeiNodes = [] // implementable nodes of the bound sekkei
    this.machines = [] // Polygraph machines discovered in this project
    this.linkNote = null // { instanceId, message, ok } — result of a spec link
    this.picker = null // { candidates } — nodes with no card yet
    this.isBusy = false
    this.hasLoaded = false
    this._pollTimer = null
  }

  init() {
    this.container = document.getElementById('board-view-root')
    if (!this.container) {
      console.log('[BOARD-VIEW] Container not found')
      return
    }
    this.render()
    this.container.addEventListener('click', (e) => this._onClick(e))
    this.container.addEventListener('change', (e) => this._onChange(e))
    this.container.addEventListener('dragstart', (e) => this._onDragStart(e))
    this.container.addEventListener('dragover', (e) => this._onDragOver(e))
    this.container.addEventListener('dragleave', (e) => this._onDragLeave(e))
    this.container.addEventListener('drop', (e) => this._onDrop(e))
  }

  onShow() {
    if (!this.hasLoaded && !this.isBusy) this.refresh()
    this._startPolling()
  }

  /**
   * Watch for changes the board did not make itself.
   *
   * Cards move by dispatch from this view, so polling exists only for what
   * happens elsewhere - another window, a resumed batch, a card driven from
   * the CLI. It is therefore allowed to find nothing, and finding nothing must
   * cost nothing: the tick re-renders only when the board actually differs.
   *
   * The first version re-rendered every five seconds unconditionally. That
   * rebuilt the whole board - including a finished session's transcript -
   * forever, throwing away scroll position and any text being selected, which
   * is what made a finished session look like it was still working.
   * @private
   */
  _startPolling() {
    if (this._pollTimer) return
    this._pollTimer = setInterval(async () => {
      // No onHide in the component contract, so the timer retires itself and
      // onShow starts a fresh one. A hidden view polling forever is how you
      // end up with an app that is never idle.
      if (!document.getElementById('board-view')?.classList.contains('active')) {
        return this._stopPolling()
      }
      // A running session owns the screen: its transcript is streaming into a
      // pane a full render would rebuild under the reader.
      if (this.session?.running) return
      await this._reloadCards()
    }, 5000)
  }

  /** @private */
  _stopPolling() {
    if (!this._pollTimer) return
    clearInterval(this._pollTimer)
    this._pollTimer = null
  }

  /** @private */
  _boardSignature() {
    return boardSignature(this.cards, this.generations)
  }

  async refresh() {
    this.isBusy = true
    this.render()
    try {
      this.status = await window.puffin.board.getStatus()
      if (this.status.hasConfig && this.status.hasPolyrun && this.status.hasNode) {
        if (!this.status.running) {
          const started = await window.puffin.board.start()
          if (!started.success) {
            this.status.error = started.error
          } else {
            this.status.running = true
          }
        }
        if (this.status.running) await this._reloadCards()
      }
      // The DoRC gate runs against THIS project's bound sekkei — one
      // project, one sekkei; nothing to choose here.
      try {
        const glm = await window.puffin.glm.getStatus()
        if (glm.available) {
          const bindingRes = await window.puffin.glm.getBinding()
          this.binding = bindingRes.success ? bindingRes.binding : null
          this.glmWorkspaceId = this.binding?.workspaceId || ''
          if (this.glmWorkspaceId) {
            const nodesRes = await window.puffin.glm.listNodes({ workspaceId: this.glmWorkspaceId })
            // Components and spec leaves are the implementable units
            this.sekkeiNodes = (nodesRes.success ? nodesRes.nodes : [])
              .filter(n => n.stratum === 'component' || n.stratum === 'spec')
          }
        }
      } catch { this.binding = null; this.glmWorkspaceId = '' }

      // What previous sessions did to these cards. Loaded before anything is
      // drawn, so an off-spec finding is on screen from the first render
      // rather than only for whoever was watching when it happened.
      try {
        const saved = await window.puffin.board.readSessionLog()
        if (saved.success) this.sessionLog = saved.log || {}
      } catch { /* an empty log is a fine starting point */ }

      // Machines discovered in this project, so a card can reach the
      // elicitation for the machine implementing it.
      try {
        const machines = await window.puffin.polygraph.discover()
        this.machines = machines.success ? (machines.machines || []) : []
      } catch { this.machines = [] }

      this.hasLoaded = true
    } catch (error) {
      this.status = { error: error.message }
    } finally {
      this.isBusy = false
      this.render()
    }
  }

  /**
   * Reload cards and batches, and render only if that changed anything.
   *
   * @param {{force?: boolean}} [options] - force renders regardless, for the
   *   callers that changed something the signature does not cover (a rejection
   *   message, a closed panel).
   */
  async _reloadCards({ force = false } = {}) {
    const before = this._boardSignature()
    const res = await window.puffin.board.listCards()
    if (res.success) {
      this.cards = res.instances || res.list || []
    }
    // Batches are reloaded with the cards, because a card movement is exactly
    // what changes them - a hold appears the moment a card escalates.
    try {
      const batches = await window.puffin.board.listGenerations()
      this.generations = batches.success ? batches.generations : []
    } catch { this.generations = [] }

    if (force || this._boardSignature() !== before) this.render()
  }

  // ===== the runner: the board driving itself =====

  /**
   * Work the phase without a human at each step.
   *
   * Running it by hand teaches you the workflow; it does not scale to a sekkei
   * with dozens of components. What makes automation acceptable here is that
   * the decisions are not the runner's: card-policy.js decides, purely, from
   * the card's state and the evidence gathered about it, and every rule there
   * is written so that absence of evidence stops rather than advances.
   *
   * So this loop is deliberately dumb. It gathers evidence, asks, and does what
   * it is told - including stopping.
   */
  async runPhase() {
    if (this.runner?.running) return this.stopRunner()

    // attempts: `${instanceId}:${step}` -> count. A legitimate flow never needs
    // the same step twice running on the same card; a second attempt means the
    // step did not take, and repeating it is a loop rather than progress.
    this.runner = { running: true, log: [], stoppedBy: null, attempts: new Map() }
    this.render()

    // The policy pre-check, once for the whole phase: it is a property of the
    // repo's settings, not of any one card, and running it per card would ask
    // the same question six times.
    await this._checkPolicy()

    try {
      // A card the runner cannot act on is skipped, not a reason to stop: a
      // board is a set of independent chains, and one card waiting on a person
      // must not park the other seven. The pass ends when a full sweep moves
      // nothing - the honest definition of "there is nothing left I can do".
      const parked = new Set()
      while (this.runner?.running) {
        await this._reloadCards({ force: true })
        const actionable = this.cards.filter(c => !parked.has(c.instanceId || c.id))
        const card = pickNext(actionable)
        if (!card) {
          this._runnerNote(parked.size > 0
            ? `nothing left the runner can move — ${parked.size} card(s) need a person`
            : 'every card is finished')
          break
        }
        const before = card.state?.cardState
        const outcome = await this._runOneStep(card)
        await this._reloadCards({ force: true })
        const after = this.cards.find(c => (c.instanceId || c.id) === (card.instanceId || card.id))
        if (after?.state?.cardState !== before) {
          // Real movement: forget what this card had already tried, so a
          // legitimate second pass through a stage is not mistaken for a loop.
          for (const key of [...this.runner.attempts.keys()]) {
            if (key.startsWith(`${card.instanceId || card.id}:`)) this.runner.attempts.delete(key)
          }
        }
        if (outcome === 'park') parked.add(card.instanceId || card.id)
        else if (outcome === 'stop') break
      }
    } finally {
      if (this.runner) this.runner.running = false
      this.render()
    }
  }

  /** Stop after the step in flight. The card and the batch are left as they are. */
  stopRunner() {
    if (!this.runner) return
    this.runner.running = false
    this.runner.stoppedBy = 'you'
    this._runnerNote('stopped')
    this.render()
  }

  /**
   * @private
   * One decision, executed. Returns true when the loop should end.
   */
  async _runOneStep(card) {
    const instanceId = card.instanceId || card.id
    const node = this._nodeForCard(instanceId)
    const batch = this._activeGenerations().find(g => g.cards.includes(instanceId))
    const decision = nextStep({
      cardState: card.state?.cardState,
      session: this.sessionLog[instanceId] || null,
      batchHeld: batch?.state?.genState === 'held',
      evidence: {
        mandate: node ? this.policy?.mandate?.[node.glmId] : null,
        hasVerifier: this.sessionLog[instanceId]?.hasVerifier,
        check: this.sessionLog[instanceId]?.check,
        verifier: this.sessionLog[instanceId]?.verifier,
        blockedBy: this._unbuiltDependencies(instanceId).map(d => d.title),
        oracleEdits: this.sessionLog[instanceId]?.oracleEdits,
        checkReason: this.sessionLog[instanceId]?.checkReason,
        findings: this._findingsFor(instanceId)
      }
    })

    // A dispatch the board refuses leaves the card exactly where it was, and
    // the same decision comes back next pass. That is how a held batch turned
    // "run the validation gate" into an infinite loop that also tried to start
    // a session on every turn of it.
    const key = `${instanceId}:${decision.step}`
    const attempts = (this.runner.attempts.get(key) || 0) + 1
    this.runner.attempts.set(key, attempts)
    if (attempts > 1) {
      this._runnerNote(
        `${node?.title || instanceId}: ${decision.step} did not take effect — ` +
        `${this.rejection?.reason || 'the board refused it'}. Parking this card.`)
      return 'park'
    }

    // One session at a time is a hard limit of the CLI, not a preference: a
    // second submit fails with "a Claude CLI process is already running", and
    // a runner that keeps trying turns one stuck card into a stream of errors.
    if (this.session?.running &&
        [STEP.PLAN, STEP.BUILD, STEP.RUN_REVIEW, STEP.VALIDATE_ACCEPTANCE].includes(decision.step)) {
      this._runnerNote(`${node?.title || instanceId}: a session is still running — parking this card`)
      return 'park'
    }

    this._runnerNote(`${node?.title || instanceId}: ${decision.step} — ${decision.reason}`)

    switch (decision.step) {
      case STEP.GATE:
        await this.gateAndMarkReady(instanceId)
        break
      case STEP.PLAN: {
        await this.startWork(instanceId, { confirmed: true })
        // A plan whose questions the design does not answer is not a plan to
        // implement from. The runner files the questions where the design keeps
        // them and hands the card to a person, rather than letting the next
        // turn decide them quietly in code.
        const unsettled = unsettledCount(this.session?.text)
        if (unsettled === null) {
          this._runnerNote(`${node?.title || instanceId}: the plan did not say whether anything is unsettled — handing over`)
          await this.dispatch(instanceId, 'ESCALATE')
          return 'park'
        }
        if (unsettled > 0) {
          await this.raiseScr(instanceId)
          this._runnerNote(`${node?.title || instanceId}: ${unsettled} unsettled question(s) — SCR raised, handed over`)
          await this.dispatch(instanceId, 'ESCALATE')
          return 'park'
        }
        break
      }
      case STEP.PLAN_READY:
        await this.dispatch(instanceId, 'PLAN_READY')
        break
      case STEP.BUILD:
        // confirmed: the runner has already been told to work this phase, and
        // a dialog waiting for a click is a dialog nobody is there to answer -
        // it returned without running and the next pass read that as a session
        // that did not finish. Dependency blocking is not skipped with it: the
        // policy above decides that from evidence.blockedBy.
        await this.runImplementation(instanceId, { confirmed: true })
        break
      case STEP.VALIDATE:
        await this.checkAndSubmit(instanceId)
        break
      case STEP.VALIDATE_ACCEPTANCE:
        // Runs the gate and dispatches its verdict in one go, so the runner
        // never has to invent one.
        await this.runVerifier(instanceId)
        break
      case STEP.VALIDATION_VERDICT:
        await this.dispatch(instanceId,
          decision.data.passed ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED',
          decision.data.passed ? {} : { reason: decision.data.reason })
        break
      case STEP.RUN_REVIEW: {
        await this.runReview(instanceId)
        const findings = findingCount(this.session?.text)
        if (findings === null) {
          this._runnerNote(`${node?.title || instanceId}: the review did not state a finding count — handing over`)
          return 'park'
        }
        if (findings > 0) {
          await this.raiseScr(instanceId)
          this._runnerNote(`${node?.title || instanceId}: review found ${findings} — SCR raised, handed over`)
          await this.failReview(instanceId, 'defect')
          return 'park'
        }
        if (this.reviewBy !== 'agent') {
          // The default: a clean review is reported, and a person accepts it.
          this._runnerNote(`${node?.title || instanceId}: review found nothing — waiting for you to accept`)
          return 'park'
        }
        break
      }
      case STEP.REVIEW:
        await this.dispatch(instanceId,
          decision.data.passed ? 'REVIEW_PASSED' : 'REVIEW_FAILED',
          decision.data.passed ? {} : { finding: decision.data.finding })
        break
      case STEP.ESCALATE:
        // The card carries the reason, so the person who picks it up is not
        // left reading a transcript to find out why it stopped.
        await this.dispatch(instanceId, 'ESCALATE')
        this.sessionLog[instanceId] = {
          ...(this.sessionLog[instanceId] || {}),
          escalatedBecause: this.sessionLog[instanceId]?.error
            ? `${decision.reason}: ${this.sessionLog[instanceId].error}`
            : decision.reason
        }
        this._persistSessionLog()
        break
      case STEP.WAIT:
      case STEP.DONE:
        // This card cannot move; another one still might.
        return 'park'
      default:
        return 'park'
    }

    // An escalated card is parked, not a stop. Under 'hold' the batch freezes
    // by itself and the next card's dispatch is refused, which ends the sweep
    // anyway; under 'continue' the remaining work is exactly what the policy
    // said to carry on with.
    if (decision.step === STEP.ESCALATE) {
      this.runner.stoppedBy = decision.reason
      return 'park'
    }
    return 'continue'
  }

  /**
   * Run this card's acceptance verifier, and dispatch what it said.
   *
   * The validating column used to be a tick a person pressed. That is a gate
   * with nothing behind it: the acceptance spec names the command, Puffin can
   * run it, and a verdict nobody produced is not a verdict. Now the button
   * runs the gate and the dispatch carries its exit code.
   *
   * @param {string} instanceId
   */
  async runVerifier(instanceId) {
    const node = this._nodeForCard(instanceId)
    if (!node) {
      this.rejection = { instanceId, reason: 'no sekkei node behind this card' }
      return this.render()
    }

    const built = await window.puffin.board.componentPrompt({
      workspaceId: this.glmWorkspaceId, glmId: node.glmId, stage: 'implement'
    })
    const command = built.success ? built.verifier : ''
    if (!command) {
      // Not a pass and not a fail: the card cannot be decided this way at all,
      // and saying so beats inviting someone to tick it.
      this.rejection = {
        instanceId,
        reason: 'the acceptance spec names no verifier — nothing here can decide this card'
      }
      return this.render()
    }

    this.session = {
      instanceId, stage: 'verify', title: node.title || node.glmId,
      text: `$ ${command}\n`, running: true, error: null
    }
    this.render()

    const result = await window.puffin.board.runVerifier({ command })

    // Could not run: not a pass, not a fail, and above all not a reason to
    // send the card back to implementing. The card stays put and the reason
    // goes on screen, because what is broken is the spec, not the code.
    if (result.success && result.ran === false) {
      this.session = {
        ...this.session, running: false, text: `$ ${command}`, error: result.reason
      }
      this.rejection = { instanceId, reason: result.reason }
      return this.render()
    }

    const passed = result.success && result.passed
    this.session = {
      ...this.session,
      running: false,
      text: `$ ${command}\n\n${result.output || result.error || ''}`.slice(-40000),
      error: result.success ? null : result.error,
      verdict: result.success
        ? (passed ? 'passed' : `exited ${result.timedOut ? 'on a timeout' : result.code}`)
        : null
    }
    this.sessionLog[instanceId] = {
      ...(this.sessionLog[instanceId] || {}),
      verifier: passed ? 'pass' : 'fail',
      verifierAt: new Date().toISOString(),
      verifierCode: result.code ?? null
    }
    this._persistSessionLog()

    // A verifier that could not run is not a failing verifier. Failing the
    // card would blame the code for the harness.
    if (!result.success) return this.render()

    await this.dispatch(instanceId,
      passed ? 'VALIDATION_PASSED' : 'VALIDATION_FAILED',
      passed ? {} : { reason: 'verifier-failed' })
    this.render()
  }

  /**
   * Review this card against its spec.
   *
   * The gates have already answered what they can. Review is for what a passing
   * suite cannot see: behaviour the spec asks for that nothing exercises, a
   * rule the code contradicts, a criterion met in letter and not in substance.
   *
   * It reports; it does not decide.
   *
   * @param {string} instanceId
   */
  async runReview(instanceId) {
    return this._runSession(instanceId, 'review')
  }

  /**
   * @private
   * What review already knows before anyone reads anything.
   *
   * Assembled from the gates and the scope check rather than asked of the user:
   * three buttons with nothing behind them are a judgement nobody is in a
   * position to make.
   */
  _reviewEvidence(instanceId) {
    const log = this.sessionLog[instanceId] || {}
    const rows = []

    rows.push(log.verifier === 'pass'
      ? { ok: true, text: 'the acceptance verifier passed' }
      : log.verifier === 'fail'
        ? { ok: false, text: 'the acceptance verifier failed' }
        : { ok: null, text: 'the acceptance verifier has not run here' })

    rows.push(log.check === 'pass'
      ? { ok: true, text: 'the state check passed' }
      : log.check === 'not-applicable'
        ? { ok: null, text: 'no state contract - nothing for the checker to explore' }
        : log.check === 'fail'
          ? { ok: false, text: 'the state check failed' }
          : { ok: null, text: 'the state check has not run here' })

    if (log.missingOutputs?.length > 0) {
      rows.push({ ok: false, text: `declared but not written: ${log.missingOutputs.join(', ')}` })
    } else if (log.changed?.length > 0) {
      rows.push({
        ok: true,
        text: `wrote ${log.changed.length} file${log.changed.length === 1 ? '' : 's'}, all declared`
      })
    }
    if (log.outOfScope?.length > 0) {
      rows.push({ ok: false, text: `outside its declared outputs: ${log.outOfScope.join(', ')}` })
    }
    if (log.oracleEdits?.length > 0) {
      rows.push({
        ok: false,
        text: `edited the check that decides its own gate: ${log.oracleEdits.join(', ')}`
      })
    }
    return rows
  }

  /**
   * Send a card back, keeping what the review said.
   *
   * Without this the rework loop is blind: the card returns to implementing and
   * the next session rebuilds from the spec alone, knowing nothing about the
   * defects that sent it here - so it is free to reproduce them exactly, and
   * the same review finds them again.
   *
   * @param {string} instanceId
   * @param {'defect'|'spec-mismatch'} finding
   */
  async failReview(instanceId, finding) {
    if (this.session?.stage === 'review' && this.session.instanceId === instanceId &&
        this.session.text) {
      this.sessionLog[instanceId] = {
        ...(this.sessionLog[instanceId] || {}),
        reviewFindings: this.session.text,
        reviewedAt: new Date().toISOString()
      }
      this._persistSessionLog()
    }
    await this.dispatch(instanceId, 'REVIEW_FAILED', { finding })
  }

  /** @private Findings that should fail review rather than pass it. */
  _findingsFor(instanceId) {
    const log = this.sessionLog[instanceId] || {}
    const findings = []
    if (log.gateAffecting?.length > 0) {
      findings.push({
        kind: 'spec-mismatch',
        summary: `a test or fixture was changed outside the card's outputs: ${log.gateAffecting.join(', ')}`
      })
    }
    return findings
  }

  /** @private */
  _runnerNote(text) {
    if (!this.runner) return
    this.runner.log.push(text)
    if (this.runner.log.length > 200) this.runner.log.shift()
    this.render()
  }

  /**
   * Ask polycheck what this project's policy permits, per card.
   *
   * @private
   */
  async _checkPolicy() {
    const cards = this.cards.map(c => {
      const node = this._nodeForCard(c.instanceId || c.id)
      return node ? { id: node.glmId, gloss: node.title || node.glmId, outputs: [] } : null
    }).filter(Boolean)

    // Outputs come from the same place the session's prompt does, so the
    // declaration polycheck checks is the one the card is actually held to.
    for (const card of cards) {
      try {
        const built = await window.puffin.board.componentPrompt({
          workspaceId: this.glmWorkspaceId, glmId: card.id, stage: 'implement'
        })
        if (built.success) card.outputs = built.outputs || []
      } catch { /* a card with no outputs simply cannot be confined */ }
    }

    try {
      const result = await window.puffin.board.policyCheck({ cards })
      this.policy = result.success ? result : null
      if (result.success) {
        const surplus = Object.entries(result.mandate || {}).filter(([, v]) => v.oracle)
        this._runnerNote(surplus.length === 0
          ? 'policy: every card is confined to what it declared'
          : `policy: ${surplus.length} card(s) could write the check that decides their own gate`)
      } else if (result.available === false) {
        this._runnerNote('policy: polycheck not installed — running without the pre-check')
      }
    } catch { /* the runner proceeds; the post-hoc scope check still applies */ }
    this.render()
  }

  // ===== running a card's session =====

  /**
   * Start work on a card: dispatch START_WORK, then run its PLANNING session.
   *
   * The dispatch goes first on purpose. It can be rejected - by the card (work
   * starts from ready) or by a held batch - and a session launched before the
   * machine agreed would be work the board never asked for.
   *
   * @param {string} instanceId
   */
  async startWork(instanceId, { confirmed = false } = {}) {
    if (!confirmed && this._alreadyRan(instanceId, 'plan')) {
      return this._askAgain(instanceId, 'plan')
    }
    await this.dispatch(instanceId, 'START_WORK')
    const card = this.cards.find(c => (c.instanceId || c.id) === instanceId)
    if (card?.state?.cardState !== 'planning') return // rejected; the reason is on screen
    return this._runSession(instanceId, 'plan')
  }

  /**
   * Run the IMPLEMENTATION session for a card already in implementing.
   *
   * Separate from planning because the machine separates them: planning names
   * what the spec left open, and a person decides the plan is ready. Handing
   * both to one session would collapse that decision into a turn boundary.
   *
   * @param {string} instanceId
   */
  async runImplementation(instanceId, { confirmed = false } = {}) {
    // A rebuild is not a free retry: it spends a turn, and it rewrites the
    // files the card declared - including a module that is already finished and
    // passing. Cheap to ask, expensive to undo.
    if (!confirmed && this._alreadyRan(instanceId, 'implement')) {
      return this._askAgain(instanceId, 'implement')
    }
    // Order is not a formality here: a component built before what it calls
    // exists writes an injection seam it cannot exercise, and its suite fails
    // for a reason that belongs to another card.
    const blocked = confirmed ? [] : this._unbuiltDependencies(instanceId)
    if (blocked.length > 0) {
      const first = this._buildFirst(instanceId)
      this.confirm = {
        instanceId,
        stage: 'implement',
        title: this._nodeForCard(instanceId)?.title || instanceId,
        blockedBy: blocked,
        buildFirst: first ? (first.title || first.glmId) : null
      }
      return this.render()
    }
    return this._runSession(instanceId, 'implement')
  }

  /**
   * Which of this card's dependencies are not finished yet.
   *
   * The sekkei says what each component depends on; the board knows which
   * cards are done. Building ahead of that order produces code that cannot run
   * and a suite that fails for a reason belonging to another card - three times
   * now: experiment before kernel, experiment before world, twin before world.
   * @private
   */
  _unbuiltDependencies(instanceId) {
    const node = this._nodeForCard(instanceId)
    if (!node) return []
    const components = this.sekkeiNodes.filter(n => n.stratum === 'component')
    const componentIds = new Set(components.map(n => n.glmId))
    const deps = dependenciesOf(node, componentIds)

    return [...deps]
      .map(glmId => {
        const card = this.cards.find(c => baseCardId(c.instanceId || c.id) === cardIdForNode(glmId))
        const state = card?.state?.cardState
        return this._codeExistsFor(glmId, card)
          ? null
          : {
              glmId,
              title: components.find(n => n.glmId === glmId)?.title || glmId,
              state: state || 'not on the board'
            }
      })
      .filter(Boolean)
  }

  /**
   * @private
   * Does this component's code exist yet?
   *
   * The question a dependency check is actually asking. It is NOT "has the card
   * been accepted": a component sitting in validating or reviewing has been
   * written and has cleared its gates, and waiting for the ceremony of review
   * before anything may build against it deadlocks a chain of four - which is
   * exactly what it did.
   *
   * An implementation session that finished is the other way to know, for a
   * card still in implementing whose code is on disk.
   */
  _codeExistsFor(glmId, card) {
    const state = card?.state?.cardState
    if (['validating', 'reviewing', 'done'].includes(state)) return true
    const log = this.sessionLog[card?.instanceId || cardIdForNode(glmId)] || {}
    return log.stage === 'implement' && log.ok === true
  }

  /**
   * @private
   * The one to build first: a blocked dependency that is not itself blocked.
   *
   * A list of blockers tells you that you are stuck; the head of the chain
   * tells you what to do about it.
   */
  _buildFirst(instanceId) {
    const seen = new Set()
    const walk = (id) => {
      if (seen.has(id)) return null
      seen.add(id)
      const blockers = this._unbuiltDependencies(id)
      if (blockers.length === 0) return id
      for (const blocker of blockers) {
        const next = walk(cardIdForNode(blocker.glmId))
        if (next) return next
      }
      return null
    }
    const head = walk(instanceId)
    return head && head !== instanceId ? this._nodeForCard(head) : null
  }

  /**
   * @private
   * Has a session of this stage already SUCCEEDED on this card?
   *
   * A failed turn is not work to protect: asking "this was already built,
   * rebuild it?" about a session that never finished offers to preserve
   * something that does not exist.
   */
  _alreadyRan(instanceId, stage) {
    const log = this.sessionLog[instanceId] || {}
    return log.stage === stage && log.ok === true
  }

  /**
   * @private
   * Put the question on screen with what it actually costs: when the last one
   * ran, what it will overwrite, and where the card's gate currently stands.
   */
  _askAgain(instanceId, stage) {
    const log = this.sessionLog[instanceId] || {}
    const node = this._nodeForCard(instanceId)
    this.confirm = {
      instanceId,
      stage,
      title: node?.title || instanceId,
      at: log.at || null,
      verifier: log.verifier || null,
      changed: log.changed || []
    }
    this.render()
  }

  /** Run the session the confirmation was about. */
  async confirmSession() {
    const ask = this.confirm
    if (!ask) return
    this.confirm = null
    if (ask.stage === 'plan') return this.startWork(ask.instanceId, { confirmed: true })
    return this.runImplementation(ask.instanceId, { confirmed: true })
  }

  /**
   * @private
   * Build the prompt from the sekkei and run it, streaming into the panel.
   */
  async _runSession(instanceId, stage) {
    const node = this._nodeForCard(instanceId)
    if (!node) {
      this.rejection = { instanceId, reason: 'no sekkei node behind this card - nothing to build from' }
      return this.render()
    }
    if (this.session?.running) {
      this.rejection = { instanceId, reason: 'a session is already running - one at a time' }
      return this.render()
    }

    // The working tree as it stands BEFORE the turn. Without this there is no
    // way to tell what the session changed from what was already dirty.
    let before = ''
    try {
      const snap = await window.puffin.board.workspaceSnapshot()
      if (snap.success) before = snap.snapshot
    } catch { /* not a git repo: the scope check simply reports nothing */ }

    this.session = {
      instanceId, stage, title: node.title || node.glmId,
      text: '', running: true, error: null, before, outputs: []
    }
    this.render()

    const built = await window.puffin.board.componentPrompt({
      workspaceId: this.glmWorkspaceId,
      glmId: node.glmId,
      stage,
      priorFindings: stage === 'implement' ? (this.sessionLog[instanceId]?.reviewFindings || '') : ''
    })
    if (!built.success) {
      this.session = { ...this.session, running: false, error: built.error }
      this.sessionLog[instanceId] = {
        stage, at: new Date().toISOString(), ok: false, error: built.error
      }
      this._persistSessionLog()
      this.render()
      return
    }
    this.session.outputs = built.outputs || []

    this._subscribeSession()
    // The runner needs to know when the turn is over. Without this it would
    // ask for the next step while the session was still writing files, and
    // decide on evidence that had not been gathered yet.
    const settled = new Promise(resolve => { this._sessionSettled = resolve })
    window.puffin.claude.submit({
      prompt: built.prompt,
      sessionId: null,
      // The verifier's binary, so the session can run its own gate. Without it
      // acceptEdits lets the session write files but not test them, and the
      // turn burns down asking for an approval this panel cannot give.
      allowedTools: built.allowedTools || [],
      // The session may write here as well as in the project. Without it the
      // only writable place is the repo, and every probe script the session
      // writes becomes an undeclared change on the card.
      additionalDirs: built.scratchDir ? [{ path: built.scratchDir }] : [],
      unattended: this.unattended === true
    })
    return settled
  }

  /**
   * @private
   * Subscribe once. The response channel is global, so the guard is the
   * session's own running flag rather than a per-card listener.
   */
  _subscribeSession() {
    if (this._sessionSubscribed) return
    this._sessionSubscribed = true
    window.puffin.claude.onResponse((chunk) => {
      if (!this.session?.running) return
      this.session.text += typeof chunk === 'string' ? chunk : (chunk?.content || '')
      this._renderSessionOnly()
    })
    window.puffin.claude.onComplete(() => {
      if (!this.session?.running) return
      this.session.running = false
      // Record it on the card. Without this the only trace of a finished
      // session is a panel the user closes, and the button still reads
      // "build it" — which is indistinguishable from never having run.
      this.sessionLog[this.session.instanceId] = {
        stage: this.session.stage,
        at: new Date().toISOString(),
        ok: true
      }
      this._persistSessionLog()
      this._checkSessionScope().finally(() => this._settleSession())
      // The card does NOT advance here. A finished turn is not a passed gate:
      // planning ends when a person says the plan is ready, and implementing
      // ends at the model check - both are decisions the machine owns.
      this.render()
    })
    window.puffin.claude.onError((error) => {
      if (!this.session?.running) return
      this.session.running = false
      this.session.error = typeof error === 'string' ? error : (error?.message || 'failed')
      this.sessionLog[this.session.instanceId] = {
        stage: this.session.stage,
        at: new Date().toISOString(),
        ok: false,
        // What the CLI actually said. "the session did not finish" is true of
        // a crash, a busy process and an untrusted workspace alike, and only
        // one of those is fixed by trying again.
        error: this.session.error
      }
      this._persistSessionLog()
      this._settleSession()
      this.render()
    })
  }

  /**
   * @private
   * What did the turn actually touch?
   *
   * Asked of git, not of the session. A session that edits a test to turn a
   * red gate green reports it honestly - the one we saw did - and the notice
   * still goes unread, because prose in the middle of a transcript is not a
   * signal. This puts the answer on the card, where the review gate is.
   */
  async _checkSessionScope() {
    const { instanceId, before, outputs } = this.session || {}
    if (!instanceId) return
    try {
      const scope = await window.puffin.board.sessionScope({ before, outputs })
      if (!scope.success) return
      const entry = this.sessionLog[instanceId]
      if (entry) {
        entry.changed = scope.changed
        entry.outOfScope = scope.outOfScope
        entry.gateAffecting = scope.gateAffecting
        // Both answered in main, where the filesystem is: a declared output is
        // missing when it is not there, not when this turn left it alone.
        if (this.session?.stage === 'implement') {
          entry.missingOutputs = scope.missingOutputs || []
          entry.oracleEdits = scope.oracleEdits || []
        }
      }
      if (this.session?.instanceId === instanceId) this.session.scope = scope
      this._persistSessionLog()
      this.render()
    } catch { /* the turn still happened; the scope check is best-effort */ }
  }

  /** @private Best-effort: a lost log costs a badge, never the work. */
  _persistSessionLog() {
    try { window.puffin.board.writeSessionLog({ log: this.sessionLog }) } catch { /* ignore */ }
  }

  /** @private Release whatever is awaiting this turn, exactly once. */
  _settleSession() {
    const resolve = this._sessionSettled
    this._sessionSettled = null
    if (resolve) resolve()
  }

  /**
   * Turn a planning turn's unsettled questions into a Sekkei Change Request.
   *
   * A plan's most valuable output is the list of what the spec does not settle,
   * and that list had nowhere to go: it sat in a panel, got answered inside one
   * session, and the next card asking the same cross-component question
   * answered it differently. Several of them are not card-local at all - where
   * machine artifacts live touches the world loader, the kernel and the twin
   * engine at once.
   *
   * An SCR is the sekkei's own vehicle for "the design has to decide
   * something", so the questions go there rather than into a commit message.
   * Raised, not answered: what the answer IS stays a person's call.
   *
   * @param {string} instanceId
   */
  async raiseScr(instanceId) {
    const node = this._nodeForCard(instanceId)
    const session = this.session
    if (!node || !session?.text || !this.glmWorkspaceId) return

    this.scrNote = { instanceId, pending: true }
    this.render()

    const result = await window.puffin.glm.createScr({
      workspaceId: this.glmWorkspaceId,
      title: `Decisions owed: ${node.title || node.glmId}`,
      // The planning turn's own words. Summarising them here would lose what
      // makes them useful - each question already carries the file and line
      // that raised it.
      problem: `Raised from the ${session.stage === 'implement' ? 'implementation'
        : session.stage === 'review' ? 'review' : 'planning'} turn for ${node.glmId}.` +
        `\n\n${session.text}`,
      scrClass: 'II',
      targetNodes: [node.glmId]
    })

    this.scrNote = result.success
      ? { instanceId, ok: true, id: result.scr?.id || result.id || '' }
      : { instanceId, ok: false, error: result.error }
    this.render()
  }

  /** Stop the running session. The card stays where it is. */
  async cancelSession() {
    try { await window.puffin.claude.cancel() } catch { /* already gone */ }
    if (this.session) this.session.running = false
    this._settleSession()
    this.render()
  }

  /**
   * @private
   * Repaint only the session body, so a streaming reply does not rebuild the
   * board underneath the user's cursor.
   */
  _renderSessionOnly() {
    const body = this.container?.querySelector('#board-session-body')
    if (!body) return this.render()
    // Follow the tail only if the reader is already at it. Scrolling back to
    // re-read something while a session streams should not keep yanking the
    // view down, which is what an unconditional scrollTop does.
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40
    if (this.session.stage === 'verify') return this.render()
    body.innerHTML = renderMarkdown(this.session.text)
    if (atBottom) body.scrollTop = body.scrollHeight
  }

  /**
   * Carry on after a hold. A person's decision, never automatic: the batch
   * held because something needed a human, and resuming says one has looked.
   *
   * @param {string} generationId
   */
  async resumeGeneration(generationId) {
    const result = await window.puffin.board.resumeGeneration({ generationId })
    if (!result.success) this.rejection = { instanceId: generationId, reason: result.error }
    await this._reloadCards({ force: true })
  }

  /** Stop a batch. The cards stay where they are; only the run ends. */
  async cancelGeneration(generationId) {
    const result = await window.puffin.board.cancelGeneration({ generationId })
    if (!result.success) this.rejection = { instanceId: generationId, reason: result.error }
    await this._reloadCards({ force: true })
  }

  /**
   * The batches worth showing: the ones still running or held.
   *
   * A settled generation is history - it belongs in a journal, not across the
   * top of a board someone is working on.
   * @private
   */
  _activeGenerations() {
    return (this.generations || [])
      .filter(g => ['drafting', 'running', 'held'].includes(g.state?.genState))
  }

  async createCard() {
    const input = this.container.querySelector('#board-new-card')
    const title = input?.value?.trim()
    if (!title) return
    const instanceId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      .slice(0, 60) || `card-${Date.now()}`
    const result = await window.puffin.board.createCard({ instanceId })
    if (!result.success) {
      this.rejection = { instanceId, reason: result.error }
    } else if (input) {
      input.value = ''
    }
    await this._reloadCards({ force: true })
  }

  /**
   * Attempt a move — dispatch the action; the machine decides. A rejection
   * is surfaced with its named reason and the board re-renders from truth.
   */
  async dispatch(instanceId, action, data = {}) {
    this.rejection = null
    const result = await window.puffin.board.dispatch({ instanceId, action, data })
    if (!result.success) {
      this.rejection = { instanceId, reason: result.error }
    } else if (result.stepKind === 'rejected' || result.decision?.stepKind === 'rejected') {
      const reason = result.rejectReason || result.decision?.rejectReason || 'rejected'
      this.rejection = { instanceId, reason }
    }
    await this._reloadCards({ force: true })
  }

  /**
   * implementing→validating goes through the Polygraph model check.
   *
   * The same shape as the DoRC gate at ready: the engine answers, the dispatch
   * carries its verdict, and a failing check leaves the card where it is. A
   * card with no machine behind it reports 'not-applicable' — an honest
   * declared value, not a way around the gate, and the acceptance verifier is
   * still ahead of it either way.
   */
  async checkAndSubmit(instanceId) {
    const card = this.cards.find(c => (c.instanceId || c.id) === instanceId)
    const machine = this._machineFor(card)

    if (!machine) {
      this.sessionLog[instanceId] = {
        ...(this.sessionLog[instanceId] || {}), check: 'not-applicable', checkReason: null
      }
      this._persistSessionLog()
      return this.dispatch(instanceId, 'SUBMIT_FOR_VALIDATION', { check: 'not-applicable' })
    }

    const label = machine.kind === 'corpus'
      ? `replaying ${machine.name}'s corpus…`
      : `model-checking ${machine.name}…`
    this.rejection = { instanceId, reason: label, pending: true }
    this.render()

    try {
      const verdict = machine.kind === 'corpus'
        ? await this._replayCorpus(machine)
        : await this._modelCheck(machine)

      // Kept on the card: the runner decides the validation verdict from the
      // gate that actually ran, never from the fact that a step completed.
      this.sessionLog[instanceId] = {
        ...(this.sessionLog[instanceId] || {}),
        check: verdict.passed ? 'pass' : 'fail',
        checkReason: verdict.passed ? null : verdict.reason
      }
      this._persistSessionLog()
      await this.dispatch(instanceId, 'SUBMIT_FOR_VALIDATION', {
        check: verdict.passed ? 'pass' : 'fail'
      })
      if (!verdict.passed && !this.rejection) {
        this.rejection = { instanceId, reason: verdict.reason }
        this.render()
      }
    } catch (error) {
      this.rejection = { instanceId, reason: `the gate could not run: ${error.message}` }
      this.render()
    }
  }

  /** Exhaustive exploration — available when the module is JS. @private */
  async _modelCheck(machine) {
    const result = await window.puffin.polygraph.check({ machineDir: machine.dir })
    // A check that explored almost nothing is not a proof, however green it
    // reads. The checker says what it skipped and how far it got; a card should
    // not pass its state gate on an exploration of one state.
    const hollow = result.success && (result.hollow || (result.statesExplored ?? 0) <= 1)
    const passed = result.success && !(result.violations?.length > 0) && !hollow
    return {
      passed,
      // The counterexample is the point: name what the checker found.
      // Name what the checker said. "an invariant is reachable" is only true
      // when one is: a spec that would not load explored zero states, and
      // reporting a violation there sends the reader hunting for a
      // counterexample that does not exist.
      statesExplored: result.statesExplored,
      reason: result.violations?.[0]?.name
        ? `model check failed — ${result.violations[0].name} is reachable`
        : hollow
          ? `the model check explored ${result.statesExplored ?? 0} state(s)` +
            `${result.skipped ? ` and skipped ${result.skipped} action/field(s) for want of a declared domain` : ''} — ` +
            'that is a green result over almost nothing, not a proof. Declare the ' +
            "domains in the contract, and give each intent one data object so a domain entry is one payload."
          : `model check failed — ${result.error || 'the checker gave no reason'}`
    }
  }

  /**
   * Corpus validation and replay — the gate for a component whose module lives
   * in a language the checker cannot execute.
   *
   * capture-ready shapes such a module so a step listener emits
   * {pre, action, data, post} windows; those windows cross the language
   * boundary and are what gets proved here. It samples where the checker
   * exhausts, so an EMPTY corpus is a failure rather than a pass: "nothing was
   * captured" must never read as "nothing was wrong".
   *
   * @private
   */
  async _replayCorpus(machine) {
    if (!machine.traceFiles) {
      return {
        passed: false,
        reason: `no trace corpus for ${machine.name} — author it capture-ready and ` +
          'register the step listener; an unproved component cannot pass the gate'
      }
    }

    const validation = await window.puffin.polygraph.validateCorpus({ machineDir: machine.dir })
    if (!validation.success) {
      return { passed: false, reason: `corpus is not well-formed — ${validation.error || 'see the workbench'}` }
    }

    const replay = await window.puffin.polygraph.replay({ machineDir: machine.dir })
    const passed = replay.success && !(replay.mismatches?.length > 0)
    return {
      passed,
      reason: `replay failed — ${replay.mismatches?.[0]?.window ||
        replay.error || 'the corpus disagrees with the contract'}`
    }
  }

  /** backlog→ready goes through the DoRC gate when a GLM workspace is wired */
  async gateAndMarkReady(instanceId) {
    if (!this.glmWorkspaceId) {
      // No gate wired — disclosed, not faked: the dispatch carries 'pass'
      // and the card renders an 'ungated' badge until GLM is selected.
      return this.dispatch(instanceId, 'MARK_READY', { gate: 'pass', ungated: true })
    }
    this.rejection = { instanceId, reason: 'running the DoRC gate…', pending: true }
    this.render()
    try {
      const verdict = await window.puffin.glm.verify({ workspaceId: this.glmWorkspaceId })
      // One reader for this payload — see shared/verifier-verdict.js. Reading
      // it by hand here is what made the gate unpassable: the gates live under
      // run.gateResults, so the old lookup found an empty list every time.
      const gateVerdict = readVerifierRun(verdict.result)
      const passed = verdict.success && gateVerdict.passed
      await this.dispatch(instanceId, 'MARK_READY', { gate: passed ? 'pass' : 'fail' })
      if (!passed) {
        // Overwrite, do not defer to the machine's reason. The card's own
        // 'ready-requires-gate-pass' is true but useless on its own: it says a
        // gate refused without saying which, and the DoRC gates fail for
        // reasons a person has to go and fix.
        this.rejection = { instanceId, reason: describeVerdict(gateVerdict) }
        this.render()
      }
    } catch (error) {
      this.rejection = { instanceId, reason: `gate error: ${error.message}` }
      this.render()
    }
  }

  /** Open the picker of sekkei nodes that have no card yet. */
  openPicker() {
    // A settled card is a finished RUN, not a component that is spoken for.
    // Excluding it hid every component that had ever been done - including one
    // whose machine had never actually been checked, which is exactly the case
    // that needs a second run.
    const open = new Set(
      this.cards
        .filter(c => c.state?.cardState !== 'done')
        .map(c => baseCardId(c.instanceId || c.id)))
    this.picker = {
      candidates: this.sekkeiNodes
        .filter(n => !open.has(cardIdForNode(n.glmId)))
        .map(n => ({ ...n, nextRun: nextCardId(n.glmId, this.cards).run }))
    }
    this.render()
  }

  /**
   * The Polygraph machine implementing a card, matched on the glm id's last
   * segment (`…kernel.kernel_core` → a machine named `kernel-core`). Names are
   * compared with `_` and `-` treated alike, since the sekkei writes snake_case
   * ids and machine directories are conventionally kebab-case.
   *
   * @param {Object} card
   * @returns {Object|null} The discovered machine, or null when none matches
   * @private
   */
  _machineFor(card) {
    const instanceId = card?.instanceId || card?.id
    if (!instanceId || !this.machines.length) return null
    const norm = s => String(s).toLowerCase().replace(/[_-]/g, '')
    const leaf = norm(String(instanceId).split('.').pop())
    if (!leaf) return null
    return this.machines.find(m => norm(m.name) === leaf) || null
  }

  /**
   * Open the invariant elicitation for the machine implementing this card.
   *
   * The dialog itself already lives in the Polygraph workbench (and, properly,
   * in the polynv skill) — this is the way in from the work, so you don't have
   * to go find the machine by hand.
   */
  openInvariants(instanceId) {
    const card = this.cards.find(c => (c.instanceId || c.id) === instanceId)
    const machine = this._machineFor(card)
    if (!machine) return
    this.intents?.switchView?.('polygraph')
    document.dispatchEvent(new CustomEvent('puffin-open-elicitation', {
      detail: { machineDir: machine.dir }
    }))
  }

  /**
   * Record the machine's confirmed invariants on the sekkei spec — as a
   * reference to the ledger, never a copy of the predicates.
   *
   * The predicate has one home (the machine's ledger, where polynv maintains
   * it); the spec records that these constraints exist, who confirmed them and
   * when, so a reader of the design sees what the code guarantees and GLM's
   * drift detection has something to compare. Copying the JavaScript here
   * would give the same fact two homes and guarantee they diverge.
   */
  async linkInvariantsToSpec(instanceId) {
    const card = this.cards.find(c => (c.instanceId || c.id) === instanceId)
    const machine = this._machineFor(card)
    if (!machine || !this.glmWorkspaceId) return

    // The card id is the glm id with unsafe characters replaced; find the node
    // it came from rather than trying to reverse that.
    const node = this.sekkeiNodes.find(n => cardIdForNode(n.glmId) === instanceId)
    if (!node) {
      this.linkNote = { instanceId, ok: false, message: 'no sekkei node behind this card' }
      return this.render()
    }

    this.linkNote = { instanceId, ok: true, message: 'reading the ledger…' }
    this.render()

    try {
      const res = await window.puffin.polygraph.confirmedInvariants({ machineDir: machine.dir })
      if (!res.success) throw new Error(res.error)
      if (!res.invariants.length) {
        this.linkNote = { instanceId, ok: false, message: 'no confirmed invariants yet — elicit first' }
        return this.render()
      }

      const current = await window.puffin.glm.getNode({
        workspaceId: this.glmWorkspaceId, glmId: node.glmId
      })
      const body = { ...(current?.node?.body || current?.body || {}) }
      body.invariants = {
        source: 'polygraph:intent-ledger',
        machine: machine.relDir || machine.name,
        ledger: `${machine.relDir || machine.name}/intent-ledger.json`,
        confirmed: res.invariants
      }

      const saved = await window.puffin.glm.updateNode({
        workspaceId: this.glmWorkspaceId, glmId: node.glmId, input: { body }
      })
      if (!saved?.success && saved?.error) throw new Error(saved.error)

      this.linkNote = {
        instanceId, ok: true,
        message: `linked ${res.invariants.length} confirmed invariant(s) to ${node.glmId}`
      }
    } catch (error) {
      this.linkNote = { instanceId, ok: false, message: error.message }
    }
    this.render()
  }

  /** Pull one spec onto the board — the card IS the work of implementing it. */
  async addFromSekkei(glmId) {
    // A settled card is a finished run, and done is terminal by design — so a
    // component that has been built before starts a NEW card rather than
    // reopening one the machine considers closed.
    const { instanceId, isNewRun, run } = nextCardId(glmId, this.cards)
    const result = await window.puffin.board.createCard({ instanceId })
    if (!result.success) this.rejection = { instanceId, reason: result.error }
    else if (isNewRun) this.rejection = { instanceId, reason: `run ${run} of this component` }
    await this._reloadCards({ force: true })
    if (this.picker) this.openPicker()
  }

  /** The sekkei node behind a card, when the card came from a spec. */
  _nodeForCard(instanceId) {
    // Any run of a component maps back to the same node.
    const base = baseCardId(instanceId)
    return this.sekkeiNodes.find(n => cardIdForNode(n.glmId) === base) || null
  }

  async showJournal(instanceId) {
    const res = await window.puffin.board.journal({ instanceId })
    this.journalFor = {
      instanceId,
      entries: res.success ? (res.journal || res.entries || []) : [],
      error: res.success ? null : res.error
    }
    this.render()
  }

  // ===== events =====

  _onChange(e) {
    if (e.target.id === 'board-unattended') {
      this.unattended = e.target.checked
    }
    if (e.target.id === 'board-review-by') {
      this.reviewBy = e.target.value
    }
  }

  _onClick(e) {
    // The column header is a heading, not a button, but it toggles a collapsed
    // column open — so it gets its own lookup rather than being made a button
    // for the sake of one handler.
    const header = e.target.closest('.board-column-header[data-action]')
    if (header) {
      const state = header.dataset.id
      this.expandedColumn = this.expandedColumn === state ? null : state
      return this.render()
    }

    const button = e.target.closest('button[data-action]')
    if (!button) return
    const { action, id, reason } = button.dataset
    if (action === 'refresh') this.refresh()
    else if (action === 'create-card') this.createCard()
    else if (action === 'open-picker') this.openPicker()
    else if (action === 'close-picker') { this.picker = null; this.render() }
    else if (action === 'add-node' && id) this.addFromSekkei(id)
    else if (action === 'invariants' && id) this.openInvariants(id)
    else if (action === 'link-invariants' && id) this.linkInvariantsToSpec(id)
    else if (action === 'journal' && id) this.showJournal(id)
    else if (action === 'close-journal') { this.journalFor = null; this.render() }
    else if (action === 'validation-pass' && id) this.dispatch(id, 'VALIDATION_PASSED')
    else if (action === 'validation-fail' && id) this.dispatch(id, 'VALIDATION_FAILED', { reason: reason || 'verifier-failed' })
    else if (action === 'plan-ready' && id) this.dispatch(id, 'PLAN_READY')
    else if (action === 'review-pass' && id) this.dispatch(id, 'REVIEW_PASSED')
    else if (action === 'review-fail' && id) this.failReview(id, reason || 'defect')
    else if (action === 'resume' && id) this.dispatch(id, 'RESUME')
    else if (action === 'escalate' && id) this.dispatch(id, 'ESCALATE')
    else if (action === 'run-phase') this.runPhase()
    else if (action === 'run-verifier' && id) this.runVerifier(id)
    else if (action === 'run-review' && id) this.runReview(id)
    else if (action === 'raise-scr' && id) this.raiseScr(id)
    else if (action === 'start-work' && id) this.startWork(id)
    else if (action === 'validate' && id) this.checkAndSubmit(id)
    else if (action === 'implement' && id) this.runImplementation(id)
    else if (action === 'close-session') { this.session = null; this.render() }
    else if (action === 'close-runner') { this.runner = null; this.render() }
    else if (action === 'confirm-session') this.confirmSession()
    else if (action === 'cancel-confirm') { this.confirm = null; this.render() }
    else if (action === 'cancel-session') this.cancelSession()
    else if (action === 'resume-generation' && id) this.resumeGeneration(id)
    else if (action === 'cancel-generation' && id) this.cancelGeneration(id)
  }

  _onDragStart(e) {
    const card = e.target.closest('[data-card-id]')
    if (card) {
      e.dataTransfer.setData('text/plain', card.dataset.cardId)
      e.dataTransfer.effectAllowed = 'move'
    }
  }

  _onDragOver(e) {
    const column = e.target.closest('[data-column]')
    if (!column) return
    e.preventDefault()
    column.classList.add('board-drop-target')
    // Deliberately no expand-on-hover. A collapsed lane is now wide enough to
    // drop into as it stands, and widening one mid-drag shifts every column to
    // its right — moving the target out from under the cursor at the moment
    // the user is aiming at it.
  }

  _onDragLeave(e) {
    const column = e.target.closest('[data-column]')
    if (column) column.classList.remove('board-drop-target')
  }

  _onDrop(e) {
    const column = e.target.closest('[data-column]')
    if (!column) return
    e.preventDefault()
    column.classList.remove('board-drop-target')
    this.expandedColumn = null
    const instanceId = e.dataTransfer.getData('text/plain')
    if (!instanceId) return
    const target = column.dataset.column
    const card = this.cards.find(c => (c.instanceId || c.id) === instanceId)
    const from = card?.state?.cardState

    if (target === from) return
    if (target === 'ready') return this.gateAndMarkReady(instanceId)
    if (target === 'validating') return this.checkAndSubmit(instanceId)
    if (target === 'planning') {
      // Two legal ways in: starting work, or a human resuming an escalated
      // card — which returns to planning because whatever exhausted the budget
      // invalidated the plan.
      //
      // Starting work goes through startWork, the same path as the button, so
      // a drag and a click cannot mean different things. They did: dragging
      // dispatched START_WORK alone, so the card landed in planning with "plan
      // ready" already offered and no plan ever written.
      if (from === 'needsHuman') return this.dispatch(instanceId, 'RESUME')
      return this.startWork(instanceId)
    }
    const action = DRAG_ACTIONS[target]
    if (action) return this.dispatch(instanceId, action)
    // No action leads there (e.g. back to backlog) — say so in the model's terms
    this.rejection = { instanceId, reason: `no action leads to '${target}' — corrections are event-driven` }
    this.render()
  }

  // ===== rendering =====

  render() {
    if (!this.container) return
    this.container.innerHTML = `
      <div class="board-toolbar">
        ${this._renderStatus()}
        <div class="board-toolbar-actions">
          <span class="board-gate-chip" title="The Ready gate runs this project's sekkei verifier">
            ${this.binding
              ? `⛓ gate: ${esc(this.binding.name)}`
              : 'ungated — bind a sekkei in Specs'}
          </span>
          <button class="btn btn-primary btn-sm" data-action="open-picker"
            ${!this.status?.running || !this.binding ? 'disabled' : ''}
            title="${this.binding ? 'Pull a spec from the sekkei onto the board' : 'Bind a sekkei in the Sekkei tab first'}">
            Add from sekkei
          </button>
          <input type="text" id="board-new-card" class="board-input" placeholder="ad-hoc card…">
          <button class="btn btn-secondary btn-sm" data-action="create-card" ${!this.status?.running ? 'disabled' : ''}>Add</button>
          <button class="btn btn-primary btn-sm" data-action="run-phase"
            ${!this.status?.running ? 'disabled' : ''}
            title="Work the phase without stopping at each step. The runner advances a card only on positive evidence and escalates otherwise.">
            ${this.runner?.running ? '⏹ Stop' : '▶ Run phase'}
          </button>
          <label class="board-unattended" title="Who accepts a card once its review comes back clean. The gates are the same either way; this is about who signs.">
            review
            <select id="board-review-by" class="board-select">
              <option value="human" ${this.reviewBy !== 'agent' ? 'selected' : ''}>by me</option>
              <option value="agent" ${this.reviewBy === 'agent' ? 'selected' : ''}>by the runner</option>
            </select>
          </label>
          <label class="board-unattended" title="Card sessions have no approve button, so a command that is not pre-approved hangs the turn. Unattended runs them without asking — the same trust you give a terminal you have already opened.">
            <input type="checkbox" id="board-unattended" ${this.unattended ? 'checked' : ''}> unattended
          </label>
          <button class="btn btn-secondary btn-sm" data-action="refresh" ${this.isBusy ? 'disabled' : ''}>${this.isBusy ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>
      ${this.rejection ? `<div class="board-rejection ${this.rejection.pending ? 'board-rejection-pending' : ''}">
        ${this.rejection.pending ? '⏳' : '⤺'} <code>${esc(this.rejection.instanceId)}</code> — ${esc(this.rejection.reason)}
      </div>` : ''}
      ${this._renderConfirm()}
      ${this._renderGenerations()}
      ${this._renderRunner()}
      ${this._renderSession()}
      ${this.picker ? this._renderPicker() : ''}
      ${this._renderBody()}
      ${this.journalFor ? this._renderJournal() : ''}
    `
  }

  /**
   * The runner's own account of itself.
   *
   * Every decision it made, in the words of the rule that made it, so an
   * unattended run is readable afterwards rather than being a board that
   * changed while nobody was looking.
   * @private
   */
  _renderRunner() {
    const runner = this.runner
    if (!runner) return ''
    return `<div class="board-runner ${runner.running ? 'board-runner-live' : ''}">
      <div class="board-runner-head">
        <b>${runner.running ? '▶ running the phase' : '■ runner stopped'}</b>
        ${runner.stoppedBy ? `<span class="board-runner-why">${esc(runner.stoppedBy)}</span>` : ''}
        <span class="board-runner-actions">
          ${runner.running
            ? '<button class="btn btn-secondary btn-sm" data-action="run-phase">Stop</button>'
            : '<button class="btn btn-secondary btn-sm" data-action="close-runner">Close</button>'}
        </span>
      </div>
      <ol class="board-runner-log">
        ${runner.log.slice(-12).map(line => `<li>${esc(line)}</li>`).join('')}
      </ol>
    </div>`
  }

  /**
   * The running session, if any.
   *
   * Shown on the board rather than sent to the Prompt tab because the session
   * belongs to a card: its subject is that card's spec, and reading it here is
   * how you decide whether the plan is ready.
   * @private
   */
  _renderSession() {
    const session = this.session
    if (!session) return ''
    const label = session.stage === 'plan' ? 'planning'
      : session.stage === 'verify' ? 'acceptance verifier'
        : session.stage === 'review' ? 'review'
          : 'implementing'
    return `<div class="board-session">
      <div class="board-session-head">
        <b>${session.running ? '&#9203;' : '&#9679;'} ${esc(session.title)}</b>
        <span class="board-session-meta">${esc(label)}${session.stage === 'verify' ? '' : ' session'}${
          session.running ? ' &mdash; running' : session.verdict ? ` &mdash; ${esc(session.verdict)}` : ' &mdash; finished'}</span>
        <span class="board-session-actions">
          ${session.running
            ? '<button class="btn btn-secondary btn-sm" data-action="cancel-session">Stop</button>'
            : '<button class="btn btn-secondary btn-sm" data-action="close-session">Close</button>'}
        </span>
      </div>
      ${session.error ? `<div class="board-rejection">&#10007; ${esc(session.error)}</div>` : ''}
      ${session.stage === 'verify'
        ? this._renderVerifierOutput(session)
        : `<div class="board-session-body md-body" id="board-session-body">${renderMarkdown(session.text)}</div>`}
      ${this._renderScopeFinding(session.scope)}
      ${!session.running && !session.error && session.stage === 'verify' ? `<div class="board-session-note">
        <b>${session.verdict === 'passed'
          ? 'The verifier passed and the card has moved to reviewing.'
          : 'The verifier failed and the card went back to implementing.'}</b>
        ${session.verdict === 'passed'
          ? 'The gates have said what they can. What is left is a reading of the code against its spec.'
          : 'The gates decided this; nothing here needs your verdict.'}
        ${session.verdict === 'passed' ? `<span class="board-session-next">
          <button class="btn btn-primary btn-sm" data-action="run-review"
            data-id="${esc(session.instanceId)}">Review it against the spec</button>
          <button class="btn btn-secondary btn-sm" data-action="review-pass"
            data-id="${esc(session.instanceId)}">Accept without reading &rarr; done</button>
        </span>` : ''}
      </div>` : ''}
      ${!session.running && !session.error && session.stage !== 'verify' ? `<div class="board-session-note">
        <b>The turn is over and the card has not moved.</b> ${session.stage === 'plan'
          ? 'A finished turn is not a plan you have agreed to, so read it first.'
          : session.stage === 'review'
            ? 'A review reports; it does not decide. Accept it or send it back yourself.'
            : 'A finished turn is not a passed gate: the session ran the acceptance verifier, ' +
              'the model check has not run yet.'}
        <span class="board-session-next">
          ${session.stage === 'plan'
            ? `<button class="btn btn-primary btn-sm" data-action="plan-ready"
                 data-id="${esc(session.instanceId)}">The plan is ready &rarr; implementing</button>`
            : session.stage === 'review'
              ? `<button class="btn btn-primary btn-sm" data-action="review-pass"
                   data-id="${esc(session.instanceId)}">Nothing outstanding &rarr; done</button>
                 <button class="btn btn-secondary btn-sm" data-action="review-fail"
                   data-id="${esc(session.instanceId)}" data-reason="defect">Send it back</button>`
              : `<button class="btn btn-primary btn-sm" data-action="validate"
                   data-id="${esc(session.instanceId)}">Run the model check &rarr; validating</button>`}
        </span>
        ${session.stage === 'verify' ? '' : `<span class="board-session-next">
          <button class="btn btn-secondary btn-sm" data-action="raise-scr"
            data-id="${esc(session.instanceId)}"
            title="Put what this turn had to decide into a Sekkei Change Request, so the answer lands in the design rather than in one session">Raise an SCR from this</button>
          ${this.scrNote?.instanceId === session.instanceId ? `<span class="board-scr-note">${
            this.scrNote.pending ? 'raising…'
              : this.scrNote.ok ? 'SCR raised — answer it in the Sekkei tab'
                : `could not raise it: ${esc(this.scrNote.error || '')}`}</span>` : ''}
        </span>`}
      </div>` : ''}
    </div>`
  }

  /**
   * A verifier run: the tally first, the failures next, the log last.
   *
   * Markdown was folding this into a paragraph - single newlines become spaces -
   * so 46 result lines arrived as one block of prose. Test output is
   * line-structured and the lines are the information.
   * @private
   */
  _renderVerifierOutput(session) {
    const { command, headline, failures, passes, rest } = splitOutput(session.text)
    const tally = [
      headline.pass !== null ? `<b class="v-pass">${headline.pass} pass</b>` : null,
      headline.fail ? `<b class="v-fail">${headline.fail} fail</b>`
        : headline.fail === 0 ? '<span class="v-pass">0 fail</span>' : null,
      headline.skip ? `<span>${headline.skip} skipped</span>` : null
    ].filter(Boolean).join(' · ')

    return `<div class="board-verifier" id="board-session-body">
      ${command ? `<div class="board-verifier-cmd">$ ${esc(command)}</div>` : ''}
      ${tally ? `<div class="board-verifier-tally">${tally}</div>` : ''}
      ${failures.length > 0 ? `<pre class="board-verifier-lines fail">${
        failures.map(l => esc(l)).join('\n')}</pre>` : ''}
      ${passes > 0 && failures.length === 0
        ? `<div class="board-verifier-quiet">${passes} passing test${passes === 1 ? '' : 's'}, nothing to report</div>`
        : passes > 0 ? `<div class="board-verifier-quiet">${passes} other test${passes === 1 ? '' : 's'} passed</div>` : ''}
      ${rest.length > 0 ? `<details class="board-verifier-more">
        <summary>full output (${rest.length} line${rest.length === 1 ? '' : 's'})</summary>
        <pre class="board-verifier-lines">${rest.map(l => esc(l)).join('\n')}</pre>
      </details>` : ''}
    </div>`
  }

  /**
   * Files the turn changed that the card never declared.
   *
   * Loud, and loudest for a test file: that is the shape where a failing gate
   * becomes a passing one without the code changing. Puffin cannot tell a good
   * reason from a bad one and does not try - it makes sure the question gets
   * asked before review, instead of leaving it in a transcript.
   * @private
   */
  _renderScopeFinding(scope) {
    if (!scope || scope.outOfScope.length === 0) return ''
    const gate = scope.gateAffecting || []
    return `<div class="board-scope ${gate.length > 0 ? 'board-scope-gate' : ''}">
      <div class="board-scope-head">
        ${gate.length > 0 ? '&#9888; ' : ''}This turn changed ${scope.outOfScope.length}
        file${scope.outOfScope.length === 1 ? '' : 's'} the card did not declare
      </div>
      <div class="board-scope-list">
        ${scope.outOfScope.map(f => `<code class="${gate.includes(f) ? 'board-scope-gatefile' : ''}">${esc(f)}</code>`).join(' ')}
      </div>
      ${gate.length > 0 ? `<div class="board-scope-why">
        ${gate.length === 1 ? 'That is a test or fixture' : 'Those are tests or fixtures'} —
        the one change that can turn a failing gate green without the code
        changing. Read the diff before this card passes review.
      </div>` : ''}
    </div>`
  }

  /**
   * The "are you sure" for a session that has already run.
   * @private
   */
  _renderConfirm() {
    const ask = this.confirm
    if (!ask) return ''
    const verb = ask.stage === 'plan' ? 'planned' : 'built'
    const when = ask.at ? String(ask.at).slice(11, 16) : 'earlier'

    if (ask.blockedBy?.length > 0) {
      return `<div class="board-confirm">
        <div class="board-confirm-head">
          <b>${esc(ask.title)} depends on ${ask.blockedBy.length === 1 ? 'a component' : 'components'} that ${ask.blockedBy.length === 1 ? 'is' : 'are'} not finished.</b>
        </div>
        <div class="board-confirm-body">
          ${ask.blockedBy.map(d => `<code>${esc(d.title)}</code> <span class="board-confirm-state">(${esc(d.state)})</span>`).join(' · ')}
          <div>Building now means writing against something that does not exist yet.
          The session will do the honest thing — inject a seam and refuse by name —
          but its verifier will fail for a reason belonging to another card.</div>
          ${ask.buildFirst
            ? `<div class="board-confirm-first">Build <b>${esc(ask.buildFirst)}</b> first —
               it is the end of this chain and nothing is blocking it.</div>`
            : ''}
        </div>
        <div class="board-confirm-actions">
          <button class="btn btn-secondary btn-sm" data-action="cancel-confirm">Cancel</button>
          <button class="btn btn-primary btn-sm" data-action="confirm-session">Build anyway</button>
        </div>
      </div>`
    }

    return `<div class="board-confirm">
      <div class="board-confirm-head">
        <b>${esc(ask.title)} was already ${verb} at ${esc(when)}.</b>
      </div>
      <div class="board-confirm-body">
        Running it again spends another turn and rewrites the files this card
        declared${ask.changed.length > 0
          ? `, which last time were: ${ask.changed.slice(0, 6).map(f => `<code>${esc(f)}</code>`).join(' ')}`
          : ''}.
        ${ask.verifier === 'pass'
          ? '<b>Its verifier currently passes</b> — a rebuild can only lose that.'
          : ask.verifier === 'fail'
            ? 'Its verifier currently fails, so a rebuild may well be what it needs.'
            : ''}
      </div>
      <div class="board-confirm-actions">
        <button class="btn btn-secondary btn-sm" data-action="cancel-confirm">Cancel</button>
        <button class="btn btn-primary btn-sm" data-action="confirm-session">
          ${ask.stage === 'plan' ? 'Plan again' : 'Build again'}
        </button>
      </div>
    </div>`
  }

  /** @private Cards of this batch still sitting in needsHuman. */
  _escalatedIn(generation) {
    return (generation.cards || []).filter(id =>
      this.cards.find(c => (c.instanceId || c.id) === id)?.state?.cardState === 'needsHuman')
  }

  /** @private */
  _cardTitle(instanceId) {
    return this._nodeForCard(instanceId)?.title || instanceId
  }

  /**
   * The batch strip: one line per active generation.
   *
   * A held batch is the loudest thing on the board on purpose - while it is
   * held, its cards refuse to move, and a user who cannot see why would read
   * that as the board being broken.
   * @private
   */
  _renderGenerations() {
    const active = this._activeGenerations()
    if (active.length === 0) return ''
    return `<div class="board-generations">
      ${active.map(g => {
        const state = g.state || {}
        const held = state.genState === 'held'
        return `<div class="board-generation ${held ? 'board-generation-held' : ''}">
          <span class="board-generation-name">${held ? '⏸' : '▶'} Phase ${esc(String(g.phase))}</span>
          <span class="board-generation-meta">
            ${esc(String(state.pending ?? 0))} of ${esc(String(g.cards.length))} outstanding ·
            policy <code>${esc(state.policy || g.policy)}</code>${
              state.escalated > 0 ? ` · <b>${esc(String(state.escalated))}</b> escalated` : ''}
          </span>
          ${held ? `<span class="board-generation-why">${this._escalatedIn(g).length > 0
            ? `A card escalated and this phase runs on <b>hold</b> — every card in it
               refuses to move until you resume the phase.
               Still escalated: ${this._escalatedIn(g).map(c => esc(this._cardTitle(c))).join(', ')}.`
            : `<b>Nothing is escalated any more</b> — the phase is still held because
               carrying on is a person's call, not the board's. Resume it to continue.`}</span>` : ''}
          <span class="board-generation-actions">
            ${held ? `<button class="btn btn-primary btn-sm" data-action="resume-generation"
              data-id="${esc(g.generationId)}">Resume phase</button>` : ''}
            <button class="btn btn-secondary btn-sm" data-action="cancel-generation"
              data-id="${esc(g.generationId)}" title="End the run; the cards stay on the board">End</button>
          </span>
        </div>`
      }).join('')}
    </div>`
  }

  _renderPicker() {
    const { candidates } = this.picker
    return `<div class="board-picker">
      <div class="board-picker-header">
        Specs to implement — <b>${esc(this.binding?.name || '')}</b>
        <button class="btn btn-secondary btn-sm" data-action="close-picker">Close</button>
      </div>
      ${candidates.length === 0 ? `<div class="board-picker-empty">
        Every implementable node in this sekkei is already on the board.
        ${this.sekkeiNodes.length === 0 ? 'This sekkei has no components or spec leaves yet — author them in the Sekkei tab.' : ''}
      </div>` : `
        <div class="board-picker-list">
          ${candidates.map(node => `
            <div class="board-picker-row">
              <span class="board-picker-stratum">${esc(node.stratum)}</span>
              <span class="board-picker-title">${esc(node.title || node.glmId)}</span>
              <code class="board-picker-id">${esc(node.glmId)}</code>
              ${node.nextRun > 1 ? `<span class="board-picker-run">run ${node.nextRun}</span>` : ''}
              <button class="btn btn-sm" data-action="add-node" data-id="${esc(node.glmId)}">
                ${node.nextRun > 1 ? '+ run again' : '+ add'}</button>
            </div>
          `).join('')}
        </div>
      `}
    </div>`
  }

  _renderStatus() {
    const s = this.status
    if (!s) return '<div class="board-status">Verified board</div>'
    if (s.error) return `<div class="board-status board-status-warn">✗ ${esc(s.error)}</div>`
    if (!s.hasProject) return '<div class="board-status board-status-warn">No project open.</div>'
    if (!s.hasConfig) return '<div class="board-status board-status-warn">Puffin\'s bundled task-card machine is missing from this install.</div>'
    if (!s.hasPolyrun) return '<div class="board-status board-status-warn">polyrun not found — clone polygraph as a sibling or set the engines path.</div>'
    if (!s.hasNode) return '<div class="board-status board-status-warn">System node ≥ 22.5 not found on PATH (polyrun needs node:sqlite).</div>'
    return `<div class="board-status">
      ${s.running ? '<span class="board-live">● polyrun</span>' : '○ starting…'}
      ${s.usingProjectConfig ? '· project workflow' : '· default workflow'}
      · every move is a machine dispatch — illegal drags bounce with their reason
    </div>`
  }

  _renderBody() {
    if (!this.status?.running) {
      return '<div class="board-empty">The board backend is not running.</div>'
    }
    const byState = {}
    for (const column of COLUMNS) byState[column.state] = []
    for (const card of this.cards) {
      const state = card.state?.cardState || 'backlog'
      ;(byState[state] || byState.backlog).push(card)
    }
    // An empty column earns a spine, not a share of the width. Eight equal
    // columns for two that have cards is how a board with 43 components becomes
    // unreadable — the cards get the room and the empty stages stay visible as
    // labels, so the shape of the workflow is still on screen.
    return `<div class="board-columns">
      ${COLUMNS.map(column => {
        const cards = byState[column.state]
        const collapsed = cards.length === 0 && this.expandedColumn !== column.state
        return `
        <div class="board-column ${collapsed ? 'board-column-collapsed' : ''}"
             data-column="${column.state}"
             title="${collapsed ? `${esc(column.label)} — empty` : ''}">
          <div class="board-column-header" data-action="toggle-column" data-id="${column.state}">
            <span class="board-column-label">${esc(column.label)}</span>
            <span class="board-count">${cards.length}</span>
          </div>
          <div class="board-column-cards">
            ${cards.map(card => this._renderCard(card)).join('')}
          </div>
        </div>`
      }).join('')}
    </div>`
  }

  _renderCard(card) {
    const id = card.instanceId || card.id
    const state = card.state || {}
    const isDone = state.cardState === 'done'
    const node = this._nodeForCard(id)
    const machine = this._machineFor(card)
    const note = this.linkNote?.instanceId === id ? this.linkNote : null
    const ran = this.sessionLog[id] || null
    return `<div class="board-card ${isDone ? 'board-card-done' : ''}" draggable="${!isDone}" data-card-id="${esc(id)}">
      <div class="board-card-title">${esc(node?.title || id)}${
        runOf(id) > 1 ? `<span class="board-card-run">run ${runOf(id)}</span>` : ''}</div>
      ${node ? `<div class="board-card-node"><span class="board-card-stratum">${esc(node.stratum)}</span> ${esc(node.glmId)}</div>` : ''}
      <div class="board-card-meta">
        ${machine ? `<span class="board-badge board-badge-machine"
          title="${machine.kind === 'corpus'
            ? `${esc(machine.relDir || machine.name)} — non-JS module: gated on corpus replay (capture-ready)`
            : `${esc(machine.relDir || machine.name)} — gated on the model check`}"
        >◇ ${esc(machine.name)}${machine.kind === 'corpus' ? ' · corpus' : ''}</span>` : ''}
        ${ran ? `<span class="board-badge ${ran.ok ? 'board-badge-ran' : 'board-badge-warn'}"
          title="${esc(ran.stage === 'plan' ? 'A planning session finished' : 'An implementation session finished')} at ${esc(String(ran.at).slice(11, 16))} — the card does not move on its own"
        >${ran.stage === 'plan' ? 'planned' : 'built'}${ran.ok ? '' : ' ✗'}</span>` : ''}
        ${ran?.outOfScope?.length > 0 ? `<span class="board-badge board-badge-scope"
          title="Changed outside this card's declared outputs: ${escAttr(ran.outOfScope.join(', '))}${
            ran.gateAffecting?.length > 0 ? ' — includes a test or fixture, which can turn a failing gate green without the code changing' : ''}"
        >${ran.gateAffecting?.length > 0 ? '⚠ ' : ''}off-spec ${ran.outOfScope.length}</span>` : ''}
        ${state.reworkCount > 0 ? `<span class="board-badge board-badge-warn">rework ${state.reworkCount}/2</span>` : ''}
        ${state.lastSignal ? `<span class="board-badge">${esc(state.lastSignal)}</span>` : ''}
      </div>
      <div class="board-card-actions">
        ${state.cardState === 'validating' ? `
          <button class="btn btn-sm board-btn-pass" data-action="run-verifier" data-id="${esc(id)}"
            ${node && !this.session?.running ? '' : 'disabled'}
            title="${node
              ? 'Run this card&apos;s acceptance verifier and record what it says'
              : 'This card is not backed by a sekkei node'}">▶ verify</button>
          <button class="btn btn-sm" data-action="validation-pass" data-id="${esc(id)}"
            title="Record a pass yourself — for a card whose gate cannot run here. The verifier is the evidence; this is you standing in for it.">✓</button>
          <button class="btn btn-sm board-btn-fail" data-action="validation-fail" data-id="${esc(id)}" data-reason="verifier-failed" title="Record a failure — back to implementing">✗</button>
        ` : ''}
        ${state.cardState === 'ready' ? `
          <button class="btn btn-sm board-btn-pass" data-action="start-work" data-id="${esc(id)}"
            ${node && !this.session?.running ? '' : 'disabled'}
            title="${node
              ? 'Start work: run a planning session from this component&apos;s prompt spec'
              : 'This card is not backed by a sekkei node'}">▶ ${ran?.stage === 'plan' ? 'plan again' : 'plan it'}</button>
        ` : ''}
        ${state.cardState === 'planning' ? `
          <button class="btn btn-sm board-btn-pass" data-action="plan-ready" data-id="${esc(id)}" title="The plan is written — start implementing">plan ready</button>
        ` : ''}
        ${state.cardState === 'implementing' ? `
          <button class="btn btn-sm board-btn-pass" data-action="implement" data-id="${esc(id)}"
            ${node && !this.session?.running ? '' : 'disabled'}
            title="${node
              ? 'Run the implementation session: write the files the spec names, against its verifier'
              : 'This card is not backed by a sekkei node'}">▶ ${ran?.stage === 'implement' ? 'build again' : 'build it'}</button>
        ` : ''}
        ${state.cardState === 'reviewing' ? `
          <button class="btn btn-sm board-btn-pass" data-action="run-review" data-id="${esc(id)}"
            ${node && !this.session?.running ? '' : 'disabled'}
            title="${node
              ? 'Read this card against its spec and report findings — the gates have already run'
              : 'This card is not backed by a sekkei node'}">▶ review</button>
          <button class="btn btn-sm board-btn-pass" data-action="review-pass" data-id="${esc(id)}"
            title="Accept: nothing outstanding that the gates or a reading found">✓ accept</button>
          <button class="btn btn-sm board-btn-fail" data-action="review-fail" data-id="${esc(id)}" data-reason="defect" title="A defect in the code — back to implementing">✗ defect</button>
          <button class="btn btn-sm board-btn-fail" data-action="review-fail" data-id="${esc(id)}" data-reason="spec-mismatch" title="The code is reasonable and the spec is what is wrong — back to implementing, and the spec needs an SCR">✗ spec</button>
        ` : ''}
        ${state.cardState === 'reviewing' ? `
          <div class="board-review-evidence">
            ${this._reviewEvidence(id).map(row => `
              <div class="board-review-row ${row.ok === false ? 'bad' : row.ok === true ? 'good' : 'unknown'}">
                ${row.ok === false ? '✗' : row.ok === true ? '✓' : '·'} ${esc(row.text)}
              </div>`).join('')}
          </div>
        ` : ''}
        ${state.cardState === 'needsHuman' ? `
          <button class="btn btn-sm" data-action="resume" data-id="${esc(id)}" title="Resume with a fresh budget">resume</button>
        ` : ''}
        ${machine ? `
          <button class="btn btn-sm" data-action="invariants" data-id="${esc(id)}"
            title="Invariant elicitation for ${esc(machine.name)}">◇ invariants</button>
          <button class="btn btn-sm" data-action="link-invariants" data-id="${esc(id)}"
            ${this.glmWorkspaceId ? '' : 'disabled'}
            title="${this.glmWorkspaceId
              ? 'Record the confirmed invariants on this spec (a reference, not a copy)'
              : 'No sekkei bound'}">↗ to spec</button>
        ` : ''}
        <button class="btn btn-sm board-btn-journal" data-action="journal" data-id="${esc(id)}" title="Card history (journal)">☰</button>
      </div>
      ${note ? `<div class="board-link-note ${note.ok ? '' : 'board-link-note-warn'}">${esc(note.message)}</div>` : ''}
    </div>`
  }

  _renderJournal() {
    const j = this.journalFor
    return `<div class="board-journal">
      <div class="board-journal-header">
        Journal — <code>${esc(j.instanceId)}</code>
        <button class="btn btn-secondary btn-sm" data-action="close-journal">Close</button>
      </div>
      ${j.error ? `<div class="board-status-warn">✗ ${esc(j.error)}</div>` : `
        <div class="board-journal-entries">
          ${j.entries.map(entry => `
            <div class="board-journal-entry ${entry.stepKind === 'rejected' ? 'board-journal-rejected' : ''}">
              <span class="board-journal-seq">#${entry.seq ?? ''}</span>
              <code>${esc(entry.action || entry.stepKind || '')}</code>
              ${entry.stepKind === 'rejected' ? `<span class="board-badge board-badge-warn">rejected: ${esc(entry.rejectReason || '')}</span>` : ''}
              <span class="board-journal-state">${esc(JSON.stringify(entry.state ?? entry.post ?? ''))}</span>
            </div>
          `).join('')}
        </div>
      `}
    </div>`
  }
}
