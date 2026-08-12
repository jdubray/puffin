'use strict';

/**
 * Prompt lifecycle — SAM v2 strict-profile machine.
 *
 * Managed replacement for the legacy promptFsm skeleton
 * (src/renderer/sam/instance.js): same alphabet and reachable lifecycle,
 * with rejections made observable and the response/settlement evidence
 * (hasResponse, endedVia) promoted to declared state.
 */

const { createInstance } = require('@cognitive-fab/sam-pattern');

const instance = createInstance({ strict: true, hasAsyncActions: false });

const INITIAL_STATE = {
  promptState: 'idle',
  hasResponse: false,
  endedVia: '',
};

const modelShape = {
  promptState: { type: 'string' },
  hasResponse: { type: 'boolean' },
  endedVia: { type: 'string' },
};

const IN_FLIGHT = new Set(['submitted', 'awaiting']);
const SETTLED = new Set(['idle', 'completed', 'failed']);

const componentActions = {
  START_COMPOSE: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  SUBMIT_PROMPT: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  RECEIVE_RESPONSE_CHUNK: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  COMPLETE_RESPONSE: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  RESPONSE_ERROR: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  CANCEL_PROMPT: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
};

const acceptors = {
  // START_COMPOSE: begin a fresh composition from any settled state.
  START_COMPOSE: (model) => (proposal, { reject, next, unchanged }) => {
    if (!SETTLED.has(model.promptState)) {
      return reject('compose-only-from-settled');
    }
    next.promptState = 'composing';
    next.hasResponse = false;
    next.endedVia = '';
  },

  // SUBMIT_PROMPT: hand the composed prompt to the CLI. Double-submit rejects.
  SUBMIT_PROMPT: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.promptState !== 'composing') {
      return reject('submit-only-from-composing');
    }
    next.promptState = 'submitted';
    unchanged('hasResponse', 'endedVia');
  },

  // RECEIVE_RESPONSE_CHUNK: first chunk moves submitted -> awaiting; later
  // chunks are a legal self-loop in awaiting. Late chunks after settle/cancel
  // are absorbed as observable rejects.
  RECEIVE_RESPONSE_CHUNK: (model) => (proposal, { reject, next, unchanged }) => {
    if (!IN_FLIGHT.has(model.promptState)) {
      return reject('chunk-only-while-in-flight');
    }
    next.promptState = 'awaiting';
    next.hasResponse = true;
    unchanged('endedVia');
  },

  // COMPLETE_RESPONSE: settle successfully. Requires at least one chunk
  // (awaiting), faithful to the legacy promptFsm.
  COMPLETE_RESPONSE: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.promptState !== 'awaiting') {
      return reject('complete-only-from-awaiting');
    }
    next.promptState = 'completed';
    next.endedVia = 'completed';
    unchanged('hasResponse');
  },

  // RESPONSE_ERROR: settle with failure, only while in flight.
  RESPONSE_ERROR: (model) => (proposal, { reject, next, unchanged }) => {
    if (!IN_FLIGHT.has(model.promptState)) {
      return reject('error-only-while-in-flight');
    }
    next.promptState = 'failed';
    next.endedVia = 'error';
    unchanged('hasResponse');
  },

  // CANCEL_PROMPT: abort an active composition or run, back to idle.
  // A cancelled run records 'cancelled'; cancelling mere composition
  // records nothing ran ('').
  CANCEL_PROMPT: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.promptState === 'composing') {
      next.promptState = 'idle';
      next.hasResponse = false;
      next.endedVia = '';
      return;
    }
    if (IN_FLIGHT.has(model.promptState)) {
      next.promptState = 'idle';
      next.hasResponse = false;
      next.endedVia = 'cancelled';
      return;
    }
    return reject('cancel-only-while-active');
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
  START_COMPOSE: (data = {}) => intents.START_COMPOSE(data),
  SUBMIT_PROMPT: (data = {}) => intents.SUBMIT_PROMPT(data),
  RECEIVE_RESPONSE_CHUNK: (data = {}) => intents.RECEIVE_RESPONSE_CHUNK(data),
  COMPLETE_RESPONSE: (data = {}) => intents.COMPLETE_RESPONSE(data),
  RESPONSE_ERROR: (data = {}) => intents.RESPONSE_ERROR(data),
  CANCEL_PROMPT: (data = {}) => intents.CANCEL_PROMPT(data),
};

module.exports = { instance, init, actions, getState, setState };
