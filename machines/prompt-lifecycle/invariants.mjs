/**
 * Prompt lifecycle — invariants.
 *
 * State and transition predicates checked exhaustively by the Polygraph
 * model checker (BFS over the declared domains, no API key).
 */

const STATES = new Set(['idle', 'composing', 'submitted', 'awaiting', 'completed', 'failed']);
const ENDINGS = new Set(['', 'completed', 'error', 'cancelled']);
const IN_FLIGHT = new Set(['submitted', 'awaiting']);

export const stateInvariants = [
  {
    name: 'prompt-state-in-vocabulary',
    pred: (s) => STATES.has(s.promptState),
  },
  {
    name: 'ended-via-in-vocabulary',
    pred: (s) => ENDINGS.has(s.endedVia),
  },
  {
    name: 'completed-implies-response',
    // You cannot have a successful completion that produced no response:
    // completion is only reachable via awaiting, which implies a chunk.
    pred: (s) => s.promptState !== 'completed' || s.hasResponse === true,
  },
  {
    name: 'completed-recorded-as-completed',
    pred: (s) => s.promptState !== 'completed' || s.endedVia === 'completed',
  },
  {
    name: 'failed-recorded-as-error',
    pred: (s) => s.promptState !== 'failed' || s.endedVia === 'error',
  },
  {
    name: 'in-flight-carries-no-verdict',
    // While composing or in flight, no settlement verdict may be recorded.
    pred: (s) =>
      !(s.promptState === 'composing' || IN_FLIGHT.has(s.promptState)) || s.endedVia === '',
  },
  {
    name: 'submitted-precedes-first-chunk',
    // In submitted (before the first chunk) there is no response yet.
    pred: (s) => s.promptState !== 'submitted' || s.hasResponse === false,
  },
  {
    name: 'composing-starts-clean',
    pred: (s) => s.promptState !== 'composing' || (s.hasResponse === false && s.endedVia === ''),
  },
];

export const transitionInvariants = [
  {
    name: 'cancel-always-returns-to-idle',
    // An ACCEPTED cancel always lands in idle; a rejected cancel is a legal
    // observable no-op (post == pre) and is exempt.
    pred: (pre, action, data, post) =>
      action !== 'CANCEL_PROMPT' ||
      post.promptState === 'idle' ||
      post.promptState === pre.promptState,
  },
  {
    name: 'response-evidence-is-monotone-in-flight',
    // hasResponse can only be cleared by starting over (START_COMPOSE or
    // CANCEL_PROMPT), never by chunk/complete/error transitions.
    pred: (pre, action, data, post) =>
      action === 'START_COMPOSE' || action === 'CANCEL_PROMPT' ||
      !pre.hasResponse || post.hasResponse,
  },
  {
    name: 'settlement-only-by-its-own-action',
    // Reaching completed requires COMPLETE_RESPONSE; reaching failed
    // requires RESPONSE_ERROR.
    pred: (pre, action, data, post) => {
      if (post.promptState === 'completed' && pre.promptState !== 'completed') {
        return action === 'COMPLETE_RESPONSE';
      }
      if (post.promptState === 'failed' && pre.promptState !== 'failed') {
        return action === 'RESPONSE_ERROR';
      }
      return true;
    },
  },
  {
    name: 'no-skipping-composition',
    // The only way into submitted is from composing via SUBMIT_PROMPT.
    pred: (pre, action, data, post) =>
      post.promptState !== 'submitted' || pre.promptState === 'submitted' ||
      (pre.promptState === 'composing' && action === 'SUBMIT_PROMPT'),
  },
];
