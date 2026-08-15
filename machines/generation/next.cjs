'use strict';

/**
 * Generation — SAM v2 strict-profile machine.
 *
 * One run over a selected set of specs: the batch level above the task card.
 * A generation is chosen from the sekkei (new and changed nodes), started with
 * a policy, and settles into a terminal that names what happened.
 *
 * The policy is the point. When a card escalates to a human, a batch can
 * reasonably stop ('hold' — atomic, nothing runs past a problem) or carry on
 * ('continue' — more gets done overnight, and the terminal records what was
 * stepped over). Neither is obviously right, so the machine does not decide:
 * both are declared values, the user picks per run, and the checker proves the
 * machine behaves under either. What is NOT negotiable is that the choice is
 * made once and the outcome is named honestly — a generation never reports
 * plain 'done' when something was left for a person.
 */

const { createInstance } = require('@cognitive-fab/sam-pattern');

const instance = createInstance({ strict: true, hasAsyncActions: false });

const INITIAL_STATE = {
  genState: 'drafting',
  policy: '',
  pending: 0,
  escalated: 0,
};

/** Bounds keep the state space finite; the real batch size is the card count. */
const MAX_SELECTION = 3;
const MAX_ESCALATIONS = 2;

const modelShape = {
  genState: { type: 'string' },
  policy: { type: 'string' },
  pending: { type: 'number' },
  escalated: { type: 'number' },
};

const ACTIVE = new Set(['drafting', 'running', 'held']);
const TERMINAL = new Set(['done', 'doneWithEscalations', 'halted']);
const POLICIES = new Set(['hold', 'continue']);

const componentActions = {
  SELECT: {
    action: (data = {}) => ({ ...data }),
    schema: { count: { type: 'number', required: true } },
    domain: [{ count: 1 }, { count: 2 }, { count: 3 }],
  },
  START: {
    action: (data = {}) => ({ ...data }),
    schema: { policy: { type: 'string', required: true } },
    domain: [{ policy: 'hold' }, { policy: 'continue' }],
  },
  CARD_DONE: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  CARD_ESCALATED: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  RESUME_GENERATION: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  CANCEL: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
};

/** The terminal a settled batch lands in — escalations are never silent. */
const settledState = (escalated) => (escalated > 0 ? 'doneWithEscalations' : 'done');

const acceptors = {
  // The membership of a generation is fixed before it starts: a batch whose
  // contents can change mid-run has no meaningful "finished".
  SELECT: (model) => (proposal, { reject, next, unchanged }) => {
    const data = proposal || {};
    if (TERMINAL.has(model.genState)) return reject('terminals-are-frozen');
    if (model.genState !== 'drafting') return reject('select-only-while-drafting');
    if (!Number.isInteger(data.count) || data.count < 1 || data.count > MAX_SELECTION) {
      return reject('select-only-while-drafting');
    }
    next.pending = data.count;
    unchanged('genState', 'policy', 'escalated');
  },

  // START records the policy. Both values are legal; the user decides which
  // one this run is judged by, and it cannot change afterwards.
  START: (model) => (proposal, { reject, next, unchanged }) => {
    const data = proposal || {};
    if (TERMINAL.has(model.genState)) return reject('terminals-are-frozen');
    if (model.genState !== 'drafting') return reject('policy-is-chosen-once');
    if (model.pending === 0) return reject('start-needs-a-selection');
    if (!POLICIES.has(data.policy)) return reject('start-needs-a-selection');
    next.genState = 'running';
    next.policy = data.policy;
    unchanged('pending', 'escalated');
  },

  CARD_DONE: (model) => (proposal, { reject, next, unchanged }) => {
    if (TERMINAL.has(model.genState)) return reject('terminals-are-frozen');
    if (model.genState !== 'running') return reject('card-outcomes-only-while-running');
    const pending = model.pending - 1;
    next.pending = pending;
    next.genState = pending === 0 ? settledState(model.escalated) : 'running';
    unchanged('policy', 'escalated');
  },

  // The one place the policy shows: an escalation either stops the batch or is
  // carried forward into a terminal that says so.
  CARD_ESCALATED: (model) => (proposal, { reject, next, unchanged }) => {
    if (TERMINAL.has(model.genState)) return reject('terminals-are-frozen');
    if (model.genState !== 'running') return reject('card-outcomes-only-while-running');

    const pending = model.pending - 1;
    const escalated = Math.min(model.escalated + 1, MAX_ESCALATIONS);
    next.pending = pending;
    next.escalated = escalated;
    next.genState = pending === 0
      ? settledState(escalated)
      : (model.policy === 'hold' ? 'held' : 'running');
    unchanged('policy');
  },

  // A held batch waits for a person. Resuming never clears the escalation
  // count: the generation remembers what it stepped over.
  RESUME_GENERATION: (model) => (proposal, { reject, next, unchanged }) => {
    if (TERMINAL.has(model.genState)) return reject('terminals-are-frozen');
    if (model.genState !== 'held') return reject('resume-only-from-held');
    next.genState = model.pending === 0 ? settledState(model.escalated) : 'running';
    unchanged('policy', 'pending', 'escalated');
  },

  CANCEL: (model) => (proposal, { reject, next, unchanged }) => {
    if (TERMINAL.has(model.genState)) return reject('terminals-are-frozen');
    if (!ACTIVE.has(model.genState)) return reject('cancel-only-while-active');
    next.genState = 'halted';
    unchanged('policy', 'pending', 'escalated');
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
  SELECT: (data = {}) => intents.SELECT(data),
  START: (data = {}) => intents.START(data),
  CARD_DONE: (data = {}) => intents.CARD_DONE(data),
  CARD_ESCALATED: (data = {}) => intents.CARD_ESCALATED(data),
  RESUME_GENERATION: (data = {}) => intents.RESUME_GENERATION(data),
  CANCEL: (data = {}) => intents.CANCEL(data),
};

module.exports = { instance, init, actions, getState, setState };
