/**
 * What to do next with a card, when nobody is watching.
 *
 * Running the board by hand is a good way to learn the workflow and a poor way
 * to run 43 components through it. But automation only earns its place if it
 * makes the same decisions a careful person would — including the decision to
 * stop. So the rules live here, as one pure function over the card's state and
 * the evidence gathered about it, rather than being distributed through the
 * runner as ifs nobody can audit.
 *
 * The design rule throughout: an automated step is allowed to advance a card
 * only on POSITIVE evidence. Absence of evidence escalates. A runner that
 * treats "the check did not run" as "the check passed" would convert every gate
 * in this pipeline into decoration, which is the one failure mode the whole
 * design exists to prevent.
 *
 * `needsHuman` is a terminal for the runner. It never resumes a card it did not
 * escalate, and it never resumes one it did: the escalation happened because
 * something needed a person, and a machine deciding that a person is no longer
 * needed is the same mistake in the other direction.
 *
 * @module shared/card-policy
 */

/** What the runner can ask the board to do. */
export const STEP = {
  GATE: 'gate',                 // run the DoRC verifier, then MARK_READY
  PLAN: 'plan',                 // START_WORK + the planning session
  PLAN_READY: 'planReady',      // planning → implementing
  BUILD: 'build',               // the implementation session
  VALIDATE: 'validate',         // the model check / corpus replay, then submit
  VALIDATE_ACCEPTANCE: 'validateAcceptance', // run the card's own verifier
  VALIDATION_VERDICT: 'validationVerdict',
  REVIEW: 'review',             // pass or fail review from the findings
  ESCALATE: 'escalate',         // hand it to a person, with a reason
  WAIT: 'wait',                 // nothing to do right now
  DONE: 'done'
}

/**
 * Findings that stop an automated run rather than being noted in passing.
 *
 * Each is a case where the evidence for "this card is finished" is not
 * evidence at all, and a person has to look.
 */
const BLOCKING = {
  oracleSurplus: 'the policy lets this session write the check that decides its own gate — ' +
    'a green gate here would not be evidence (polycheck: SURPLUS/oracle)',
  gateAffectingEdit: 'the session changed a test or fixture it never declared — ' +
    'that is how a failing gate turns green without the code changing',
  oracleEdit: 'the session edited the check that decides its own gate — the gate ' +
    'passing afterwards is not independent evidence that the code is right',
  missingOutputs: 'the session finished without writing files the card declared',
  sessionFailed: 'the session did not finish',
  noVerifier: 'the acceptance spec names no verifier, so nothing can decide this card',
  checkUnavailable: 'the validation gate could not run, and an unrun gate is not a passed gate',
  checkFailed: 'the state check did not pass, and the card machine will not enter ' +
    'validation on a failing check — the module has to change, not the gate'
}

/**
 * Decide the next step for one card.
 *
 * @param {Object} params
 * @param {string} params.cardState - from the task-card machine
 * @param {Object} [params.evidence] - what the runner has gathered
 * @param {Object} [params.session] - the last session on this card, if any
 * @param {boolean} [params.batchHeld] - the generation is held
 * @returns {{step: string, reason: string, data?: Object}}
 */
export function nextStep({ cardState, evidence = {}, session = null, batchHeld = false } = {}) {
  // A held batch outranks everything. Its whole purpose is that nothing else
  // in the phase moves until a person has looked at what escalated.
  if (batchHeld) {
    return { step: STEP.WAIT, reason: 'the batch is held — a card escalated and this phase runs on hold' }
  }

  switch (cardState) {
    case 'done':
      return { step: STEP.DONE, reason: 'the card is finished' }

    case 'needsHuman':
      // Never auto-resumed. Something needed a person; deciding that one is no
      // longer needed is the same error facing the other way.
      return { step: STEP.WAIT, reason: 'escalated — waiting for a person' }

    case 'backlog':
      return { step: STEP.GATE, reason: 'the design gate decides whether this is ready to code' }

    case 'ready': {
      // The policy pre-check runs before a turn is spent, not after. If the
      // session can write its own oracle, the result of that session cannot
      // settle the card either way.
      if (evidence.mandate?.status === 'SURPLUS' && evidence.mandate.oracle) {
        return { step: STEP.ESCALATE, reason: BLOCKING.oracleSurplus }
      }
      if (evidence.hasVerifier === false) {
        return { step: STEP.ESCALATE, reason: BLOCKING.noVerifier }
      }
      return { step: STEP.PLAN, reason: 'plan the implementation from the prompt spec' }
    }

    case 'planning': {
      if (!session || session.stage !== 'plan') {
        return { step: STEP.PLAN, reason: 'no plan has been produced for this card yet' }
      }
      if (session.ok === false) return { step: STEP.ESCALATE, reason: BLOCKING.sessionFailed }
      return { step: STEP.PLAN_READY, reason: 'the plan is written' }
    }

    case 'implementing': {
      if (!session || session.stage !== 'implement') {
        // Order first. A component built before what it calls exists writes a
        // seam it cannot exercise, and its verifier then fails for a reason
        // belonging to another card - which the runner would read as this
        // card's defect and send it round again.
        if (evidence.blockedBy?.length > 0) {
          return {
            step: STEP.WAIT,
            reason: `waiting on ${evidence.blockedBy.join(', ')} — this card depends on ` +
              'work that is not finished'
          }
        }
        return { step: STEP.BUILD, reason: 'write the files the spec declares' }
      }
      if (session.ok === false) return { step: STEP.ESCALATE, reason: BLOCKING.sessionFailed }
      // A build that touched a test it never declared is exactly the shape the
      // mandate exists for. Detected after the fact here, prevented before it
      // by the policy check above; both matter, because a policy can be tight
      // and the session can still have been handed the file some other way.
      if (session.gateAffecting?.length > 0) {
        return {
          step: STEP.ESCALATE,
          reason: `${BLOCKING.gateAffectingEdit}: ${session.gateAffecting.join(', ')}`
        }
      }
      // The same hazard from the other side, and the one a scope check alone
      // cannot see: when the acceptance spec lists the test as a deliverable,
      // editing it is perfectly in scope. Creating it is normal; changing one
      // that already existed, during the turn that had to make it pass, is the
      // case polycheck calls an oracle.
      if (session.oracleEdits?.length > 0) {
        return {
          step: STEP.ESCALATE,
          reason: `${BLOCKING.oracleEdit}: ${session.oracleEdits.join(', ')}`
        }
      }
      if (session.missingOutputs?.length > 0) {
        return {
          step: STEP.ESCALATE,
          reason: `${BLOCKING.missingOutputs}: ${session.missingOutputs.join(', ')}`
        }
      }
      // A failing state check is not a step backwards to retry: the card
      // machine refuses SUBMIT_FOR_VALIDATION unless the check passed or does
      // not apply, so asking again produces the same rejection forever. What
      // has to change is the module.
      if (evidence.check === 'fail') {
        return {
          step: STEP.ESCALATE,
          reason: `${BLOCKING.checkFailed}${evidence.checkReason ? `: ${evidence.checkReason}` : ''}`
        }
      }
      return { step: STEP.VALIDATE, reason: 'the code is in — run the validation gate' }
    }

    case 'validating': {
      // Two different gates, in order. Entering validating already cost the
      // state-space argument (model check, or corpus replay, or an honest
      // 'not-applicable'); leaving it costs the card's OWN acceptance verifier.
      // Neither substitutes for the other, and neither is a person ticking a box.
      const verifier = evidence.verifier
      if (verifier === undefined || verifier === null) {
        return { step: STEP.VALIDATE_ACCEPTANCE, reason: "run the card's acceptance verifier" }
      }
      if (verifier === 'pass') {
        return {
          step: STEP.VALIDATION_VERDICT,
          data: { passed: true },
          reason: 'the acceptance verifier passed'
        }
      }
      return {
        step: STEP.VALIDATION_VERDICT,
        data: { passed: false, reason: 'verifier-failed' },
        reason: 'the acceptance verifier failed — back to implementing'
      }
    }

    case 'reviewing': {
      const findings = evidence.findings || []
      if (findings.length > 0) {
        return {
          step: STEP.REVIEW,
          data: { passed: false, finding: findings[0].kind || 'defect' },
          reason: `review found ${findings[0].summary || 'a defect'}`
        }
      }
      return { step: STEP.REVIEW, data: { passed: true }, reason: 'validated and nothing outstanding' }
    }

    default:
      return { step: STEP.WAIT, reason: `no rule for '${cardState}'` }
  }
}

/**
 * Which card the runner should act on next.
 *
 * Furthest-along first, so a phase finishes cards rather than starting all of
 * them: a batch of six half-built components is worse than three finished ones,
 * because nothing can be reviewed and every one of them is holding context.
 *
 * @param {Array<{instanceId: string, state: Object}>} cards
 * @returns {Object|null}
 */
export function pickNext(cards = []) {
  const rank = {
    reviewing: 0, validating: 1, implementing: 2, planning: 3, ready: 4, backlog: 5
  }
  const actionable = cards.filter(c => rank[c.state?.cardState] !== undefined)
  if (actionable.length === 0) return null
  return actionable.sort((a, b) =>
    rank[a.state.cardState] - rank[b.state.cardState] ||
    String(a.instanceId).localeCompare(String(b.instanceId)))[0]
}

export const BLOCKING_REASONS = BLOCKING
