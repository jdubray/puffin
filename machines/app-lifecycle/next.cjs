'use strict';

/**
 * App lifecycle — SAM v2 strict-profile machine.
 *
 * Managed replacement for the legacy appFsm skeleton
 * (src/renderer/sam/instance.js). One deliberate divergence, named in the
 * contract as `recovery-cannot-skip-loading`: RECOVER from an error raised
 * before project state loaded returns to 'loading' (retry the load), never
 * to a hollow 'ready'.
 */

const { createInstance } = require('@cognitive-fab/sam-pattern');

const instance = createInstance({ strict: true, hasAsyncActions: false });

const INITIAL_STATE = {
  appState: 'initializing',
  loaded: false,
};

const modelShape = {
  appState: { type: 'string' },
  loaded: { type: 'boolean' },
};

const componentActions = {
  INITIALIZE_APP: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  LOAD_STATE: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  START_PROMPTING: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  SUBMIT_PROMPT: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  COMPLETE_RESPONSE: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  APP_ERROR: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
  RECOVER: { action: (data = {}) => ({ ...data }), schema: {}, domain: [{}] },
};

const acceptors = {
  INITIALIZE_APP: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.appState !== 'initializing') {
      return reject('initialize-only-from-initializing');
    }
    next.appState = 'loading';
    unchanged('loaded');
  },

  LOAD_STATE: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.appState !== 'loading') {
      return reject('load-only-from-loading');
    }
    next.appState = 'ready';
    next.loaded = true;
  },

  START_PROMPTING: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.appState !== 'ready') {
      return reject('prompt-only-when-ready');
    }
    next.appState = 'prompting';
    unchanged('loaded');
  },

  SUBMIT_PROMPT: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.appState !== 'ready' && model.appState !== 'prompting') {
      return reject('submit-only-when-ready-or-prompting');
    }
    next.appState = 'processing';
    unchanged('loaded');
  },

  COMPLETE_RESPONSE: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.appState !== 'processing') {
      return reject('complete-only-when-processing');
    }
    next.appState = 'ready';
    unchanged('loaded');
  },

  APP_ERROR: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.appState === 'error') {
      return reject('already-in-error');
    }
    next.appState = 'error';
    unchanged('loaded');
  },

  // RECOVER: back to ready when state is loaded; otherwise retry the load —
  // recovery must not skip loading (contract: recovery-cannot-skip-loading).
  RECOVER: (model) => (proposal, { reject, next, unchanged }) => {
    if (model.appState !== 'error') {
      return reject('recover-only-from-error');
    }
    next.appState = model.loaded ? 'ready' : 'loading';
    unchanged('loaded');
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
  INITIALIZE_APP: (data = {}) => intents.INITIALIZE_APP(data),
  LOAD_STATE: (data = {}) => intents.LOAD_STATE(data),
  START_PROMPTING: (data = {}) => intents.START_PROMPTING(data),
  SUBMIT_PROMPT: (data = {}) => intents.SUBMIT_PROMPT(data),
  COMPLETE_RESPONSE: (data = {}) => intents.COMPLETE_RESPONSE(data),
  APP_ERROR: (data = {}) => intents.APP_ERROR(data),
  RECOVER: (data = {}) => intents.RECOVER(data),
};

module.exports = { instance, init, actions, getState, setState };
