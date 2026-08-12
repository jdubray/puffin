/**
 * App lifecycle — invariants.
 */

const STATES = new Set(['initializing', 'loading', 'ready', 'prompting', 'processing', 'error']);
const NEEDS_LOAD = new Set(['ready', 'prompting', 'processing']);

export const stateInvariants = [
  {
    name: 'app-state-in-vocabulary',
    pred: (s) => STATES.has(s.appState),
  },
  {
    name: 'active-states-imply-loaded',
    // The app is never ready/prompting/processing without loaded project
    // state — this is the invariant the legacy appFsm violated via RECOVER.
    pred: (s) => !NEEDS_LOAD.has(s.appState) || s.loaded === true,
  },
  {
    name: 'initializing-implies-unloaded',
    pred: (s) => s.appState !== 'initializing' || s.loaded === false,
  },
];

export const transitionInvariants = [
  {
    name: 'loaded-is-monotone',
    // Nothing ever un-loads project state.
    pred: (pre, action, data, post) => !pre.loaded || post.loaded,
  },
  {
    name: 'error-only-via-app-error',
    pred: (pre, action, data, post) =>
      post.appState !== 'error' || pre.appState === 'error' || action === 'APP_ERROR',
  },
  {
    name: 'loaded-set-only-by-load-state',
    pred: (pre, action, data, post) =>
      pre.loaded === post.loaded || action === 'LOAD_STATE',
  },
  {
    name: 'no-processing-without-submission',
    pred: (pre, action, data, post) =>
      post.appState !== 'processing' || pre.appState === 'processing' || action === 'SUBMIT_PROMPT',
  },
];
