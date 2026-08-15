'use strict';

/**
 * Task card — SAM v2 strict-profile machine.
 *
 * The verified kanban's unit of work ("Workflows Not Loops" applied to the
 * board): columns are these states, a drag is a dispatch this machine may
 * reject, doneness is mechanical (the DoRC gate at ready, the verifier at
 * validating, the reviewer at reviewing), and correction is a bounded,
 * signal-carrying bend — never a loop.
 *
 * Work begins with a PLAN, because the plan is the front-loaded context that
 * makes the first pass the good pass. Nothing re-plans automatically: the only
 * road back to planning is a human taking RESUME on an escalated card. Review
 * is a stage of this machine rather than a tool bolted alongside it, so a
 * finding travels the same bounded bend a validation failure does.
 */

const { createInstance } = require('@cognitive-fab/sam-pattern');

const instance = createInstance({ strict: true, hasAsyncActions: false });

const INITIAL_STATE = {
  cardState: 'backlog',
  reworkCount: 0,
  lastSignal: '',
};

const REWORK_BUDGET = 2;

const modelShape = {
  cardState: { type: 'string' },
  reworkCount: { type: 'number' },
  lastSignal: { type: 'string' },
};

const ACTIVE = new Set(['ready', 'planning', 'implementing', 'validating', 'reviewing']);
const FAILURE_REASONS = new Set(['missing-deliverable', 'verifier-failed']);
const REVIEW_FINDINGS = new Set(['defect', 'spec-mismatch']);
/** Polygraph verdicts that let work leave implementing. */
const CHECK_VERDICTS = new Set(['pass', 'not-applicable']);

const componentActions = {
  MARK_READY: {
    action: (data = {}) => ({ ...data }),
    schema: { gate: { type: 'string', required: true } },
    domain: [{ gate: 'pass' }, { gate: 'fail' }],
  },
  START_WORK: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  PLAN_READY: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  SUBMIT_FOR_VALIDATION: {
    action: (data = {}) => ({ ...data }),
    schema: { check: { type: 'string', required: true } },
    domain: [{ check: 'pass' }, { check: 'fail' }, { check: 'not-applicable' }],
  },
  VALIDATION_PASSED: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  REVIEW_PASSED: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  REVIEW_FAILED: {
    action: (data = {}) => ({ ...data }),
    schema: { finding: { type: 'string', required: true } },
    domain: [{ finding: 'defect' }, { finding: 'spec-mismatch' }],
  },
  VALIDATION_FAILED: {
    action: (data = {}) => ({ ...data }),
    schema: { reason: { type: 'string', required: true } },
    domain: [{ reason: 'missing-deliverable' }, { reason: 'verifier-failed' }],
  },
  ESCALATE: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  RESUME: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
};

const acceptors = {
  // MARK_READY: the DoRC gate verdict decides — 'pass' is the only way in.
  MARK_READY: (model) => (proposal, { reject, next, unchanged }) => {
    const data = proposal || {};
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (model.cardState !== 'backlog') return reject('ready-only-from-backlog');
    if (data.gate !== 'pass') return reject('ready-requires-gate-pass');
    next.cardState = 'ready';
    unchanged('reworkCount', 'lastSignal');
  },

  // START_WORK enters PLANNING: the plan is what makes the first pass the good
  // pass, so it is a stage, not a preamble someone may skip.
  START_WORK: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (model.cardState !== 'ready') return reject('work-starts-with-a-plan');
    next.cardState = 'planning';
    unchanged('reworkCount', 'lastSignal');
  },

  // The single door from plan to work. There is no PLAN_FAILED: a plan that
  // cannot be made is a human's problem (ESCALATE), not another lap.
  PLAN_READY: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (model.cardState !== 'planning') return reject('plan-ready-only-while-planning');
    next.cardState = 'implementing';
    unchanged('reworkCount', 'lastSignal');
  },

  // Work leaves implementing only past the Polygraph model check. A failing
  // check is a rejection, not a warning: a machine that violates its own
  // invariants cannot reach review, let alone done.
  SUBMIT_FOR_VALIDATION: (model) => (proposal, { reject, next, unchanged }) => {
    const data = proposal || {};
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (model.cardState !== 'implementing') return reject('validate-only-from-implementing');
    if (!CHECK_VERDICTS.has(data.check)) return reject('model-check-precedes-validation');
    next.cardState = 'validating';
    unchanged('reworkCount', 'lastSignal');
  },

  // Validation passing does not finish the card — it hands it to review.
  VALIDATION_PASSED: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (model.cardState !== 'validating') return reject('verdict-only-while-validating');
    next.cardState = 'reviewing';
    next.lastSignal = '';
    unchanged('reworkCount');
  },

  REVIEW_PASSED: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (model.cardState !== 'reviewing') return reject('review-verdict-only-while-reviewing');
    next.cardState = 'done';
    next.lastSignal = '';
    unchanged('reworkCount');
  },

  // The second bend, sharing ONE budget with validation: two corrections in
  // total, from either source, then a human.
  REVIEW_FAILED: (model) => (proposal, { reject, next, unchanged }) => {
    const data = proposal || {};
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (model.cardState !== 'reviewing') return reject('review-verdict-only-while-reviewing');
    if (!REVIEW_FINDINGS.has(data.finding)) return reject('review-verdict-only-while-reviewing');

    if (model.reworkCount >= REWORK_BUDGET) {
      next.cardState = 'needsHuman';
      next.lastSignal = 'budget-exhausted';
      unchanged('reworkCount');
      return;
    }
    next.cardState = 'implementing';
    next.reworkCount = model.reworkCount + 1;
    next.lastSignal = data.finding;
  },

  // VALIDATION_FAILED: the one backward bend — carries its concrete reason,
  // bounded by the rework budget; exhaustion hands the card to a human.
  VALIDATION_FAILED: (model) => (proposal, { reject, next, unchanged }) => {
    const data = proposal || {};
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (model.cardState !== 'validating') return reject('verdict-only-while-validating');
    if (!FAILURE_REASONS.has(data.reason)) return reject('verdict-only-while-validating');

    if (model.reworkCount >= REWORK_BUDGET) {
      next.cardState = 'needsHuman';
      next.lastSignal = 'budget-exhausted';
      unchanged('reworkCount');
      return;
    }
    next.cardState = 'implementing';
    next.reworkCount = model.reworkCount + 1;
    next.lastSignal = data.reason;
  },

  ESCALATE: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (!ACTIVE.has(model.cardState)) return reject('escalate-only-while-active');
    next.cardState = 'needsHuman';
    next.lastSignal = 'escalated';
    unchanged('reworkCount');
  },

  // RESUME: the human sends the card back with a fresh budget — and back to
  // PLANNING, because whatever exhausted the budget invalidated the plan. This
  // is the only edge into planning that is not the first START_WORK, and a
  // person has to take it deliberately.
  RESUME: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (model.cardState !== 'needsHuman') return reject('resume-only-from-needs-human');
    next.cardState = 'planning';
    next.reworkCount = 0;
    next.lastSignal = '';
  },
};

const control = instance({
  initialState: { ...INITIAL_STATE },
  component: { modelShape, actions: componentActions, acceptors, reactors: [] },
});

const { intents } = control;

const getState = () => instance({}).getState();

const setState = (snapshot) => instance({}).setState(snapshot);

const init = () => setState(INITIAL_STATE);

const actions = {
  MARK_READY: (data = {}) => intents.MARK_READY(data),
  START_WORK: (data = {}) => intents.START_WORK(data),
  PLAN_READY: (data = {}) => intents.PLAN_READY(data),
  SUBMIT_FOR_VALIDATION: (data = {}) => intents.SUBMIT_FOR_VALIDATION(data),
  VALIDATION_PASSED: (data = {}) => intents.VALIDATION_PASSED(data),
  VALIDATION_FAILED: (data = {}) => intents.VALIDATION_FAILED(data),
  REVIEW_PASSED: (data = {}) => intents.REVIEW_PASSED(data),
  REVIEW_FAILED: (data = {}) => intents.REVIEW_FAILED(data),
  ESCALATE: (data = {}) => intents.ESCALATE(data),
  RESUME: (data = {}) => intents.RESUME(data),
};

module.exports = { instance, init, actions, getState, setState };
