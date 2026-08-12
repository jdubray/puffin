'use strict';

/**
 * Task card — SAM v2 strict-profile machine.
 *
 * The verified kanban's unit of work ("Workflows Not Loops" applied to the
 * board): columns are these states, a drag is a dispatch this machine may
 * reject, doneness is mechanical (the DoRC gate at ready, the validation
 * verdict at done), and rework is a bounded, signal-carrying bend — never
 * a loop.
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

const ACTIVE = new Set(['ready', 'implementing', 'validating']);
const FAILURE_REASONS = new Set(['missing-deliverable', 'verifier-failed']);

const componentActions = {
  MARK_READY: {
    action: (data = {}) => ({ ...data }),
    schema: { gate: { type: 'string', required: true } },
    domain: [{ gate: 'pass' }, { gate: 'fail' }],
  },
  START_IMPLEMENTATION: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  SUBMIT_FOR_VALIDATION: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  VALIDATION_PASSED: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
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

  START_IMPLEMENTATION: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (model.cardState !== 'ready') return reject('implement-only-from-ready');
    next.cardState = 'implementing';
    unchanged('reworkCount', 'lastSignal');
  },

  SUBMIT_FOR_VALIDATION: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (model.cardState !== 'implementing') return reject('validate-only-from-implementing');
    next.cardState = 'validating';
    unchanged('reworkCount', 'lastSignal');
  },

  VALIDATION_PASSED: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (model.cardState !== 'validating') return reject('verdict-only-while-validating');
    next.cardState = 'done';
    next.lastSignal = '';
    unchanged('reworkCount');
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

  // RESUME: the human sends the card back to work with a fresh budget.
  RESUME: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.cardState === 'done') return reject('done-is-terminal');
    if (model.cardState !== 'needsHuman') return reject('resume-only-from-needs-human');
    next.cardState = 'implementing';
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
  START_IMPLEMENTATION: (data = {}) => intents.START_IMPLEMENTATION(data),
  SUBMIT_FOR_VALIDATION: (data = {}) => intents.SUBMIT_FOR_VALIDATION(data),
  VALIDATION_PASSED: (data = {}) => intents.VALIDATION_PASSED(data),
  VALIDATION_FAILED: (data = {}) => intents.VALIDATION_FAILED(data),
  ESCALATE: (data = {}) => intents.ESCALATE(data),
  RESUME: (data = {}) => intents.RESUME(data),
};

module.exports = { instance, init, actions, getState, setState };
