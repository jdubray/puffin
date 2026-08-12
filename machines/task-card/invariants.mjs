/**
 * Task card — invariants: the board's anti-loop rules, checked exhaustively.
 */

const STATES = new Set(['backlog', 'ready', 'implementing', 'validating', 'done', 'needsHuman']);
const SIGNALS = new Set(['', 'missing-deliverable', 'verifier-failed', 'budget-exhausted', 'escalated']);
const FAILURES = new Set(['missing-deliverable', 'verifier-failed']);

export const stateInvariants = [
  {
    name: 'card-state-in-vocabulary',
    pred: (s) => STATES.has(s.cardState),
  },
  {
    name: 'signal-in-vocabulary',
    pred: (s) => SIGNALS.has(s.lastSignal),
  },
  {
    name: 'rework-is-bounded',
    // The budget can never be exceeded — the third failure escalates instead.
    pred: (s) => Number.isInteger(s.reworkCount) && s.reworkCount >= 0 && s.reworkCount <= 2,
  },
  {
    name: 'pre-gate-cards-carry-no-rework',
    pred: (s) => !(s.cardState === 'backlog' || s.cardState === 'ready') || s.reworkCount === 0,
  },
  {
    name: 'done-carries-no-open-signal',
    pred: (s) => s.cardState !== 'done' || s.lastSignal === '',
  },
  {
    name: 'needs-human-names-why',
    // A card waiting on a human always says why it is there.
    pred: (s) => s.cardState !== 'needsHuman' ||
      s.lastSignal === 'budget-exhausted' || s.lastSignal === 'escalated',
  },
  {
    name: 'rework-carries-its-signal',
    // Mid-rework implementation always holds the concrete failure it is
    // fixing ('' only on a fresh or human-resumed start).
    pred: (s) => s.cardState !== 'implementing' || s.reworkCount === 0 || FAILURES.has(s.lastSignal),
  },
];

export const transitionInvariants = [
  {
    name: 'done-only-via-validation-passed',
    pred: (pre, action, data, post) =>
      post.cardState !== 'done' || pre.cardState === 'done' || action === 'VALIDATION_PASSED',
  },
  {
    name: 'corrections-are-event-driven',
    // The ONLY way back into implementing from further down the flow is a
    // concrete signal: VALIDATION_FAILED (the bend) or RESUME (the human).
    pred: (pre, action, data, post) => {
      if (post.cardState !== 'implementing') return true
      if (pre.cardState === 'implementing' || pre.cardState === 'ready') {
        return pre.cardState === 'implementing' || action === 'START_IMPLEMENTATION'
      }
      return action === 'VALIDATION_FAILED' || action === 'RESUME'
    },
  },
  {
    name: 'rework-increments-only-on-failure',
    pred: (pre, action, data, post) =>
      post.reworkCount <= pre.reworkCount || (action === 'VALIDATION_FAILED' && post.reworkCount === pre.reworkCount + 1),
  },
  {
    name: 'budget-reset-only-by-human',
    pred: (pre, action, data, post) =>
      post.reworkCount >= pre.reworkCount || action === 'RESUME',
  },
  {
    name: 'terminal-is-frozen',
    pred: (pre, action, data, post) =>
      pre.cardState !== 'done' ||
      (post.cardState === 'done' && post.reworkCount === pre.reworkCount && post.lastSignal === pre.lastSignal),
  },
  {
    name: 'gate-verdict-decides-ready',
    pred: (pre, action, data, post) =>
      !(action === 'MARK_READY' && post.cardState === 'ready' && pre.cardState !== 'ready') ||
      data?.gate === 'pass',
  },
];
