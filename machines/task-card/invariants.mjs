/**
 * Task card — invariants: the board's anti-loop rules, checked exhaustively.
 *
 * These are the article's four moves turned into predicates a checker enforces
 * rather than promises a team makes. Front-loaded context is a plan stage that
 * cannot be skipped; feedback is event-driven and bounded; a correction names
 * its target and its signal; and "re-plan" is not an option the machine offers.
 */

const STATES = new Set([
  'backlog', 'ready', 'planning', 'implementing', 'validating', 'reviewing', 'done', 'needsHuman'
])
const SIGNALS = new Set([
  '', 'missing-deliverable', 'verifier-failed', 'defect', 'spec-mismatch',
  'budget-exhausted', 'escalated'
])
/** Signals that send work backward — each names one concrete thing to fix. */
const CORRECTIONS = new Set(['missing-deliverable', 'verifier-failed', 'defect', 'spec-mismatch'])

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
    // One budget across both correction sources — the third escalates instead.
    pred: (s) => Number.isInteger(s.reworkCount) && s.reworkCount >= 0 && s.reworkCount <= 2,
  },
  {
    name: 'pre-work-cards-carry-no-rework',
    // Nothing before implementation has corrections behind it: a card in
    // planning is either fresh or human-resumed, and RESUME resets the budget.
    pred: (s) => !['backlog', 'ready', 'planning'].includes(s.cardState) || s.reworkCount === 0,
  },
  {
    name: 'planning-carries-no-signal',
    // The plan is written against the spec, not against a failure. If a signal
    // survived into planning, someone had made the plan a correction loop.
    pred: (s) => s.cardState !== 'planning' || s.lastSignal === '',
  },
  {
    name: 'done-carries-no-open-signal',
    pred: (s) => s.cardState !== 'done' || s.lastSignal === '',
  },
  {
    name: 'reviewing-carries-no-open-signal',
    // A card under review has passed validation; nothing is outstanding.
    pred: (s) => s.cardState !== 'reviewing' || s.lastSignal === '',
  },
  {
    name: 'needs-human-names-why',
    pred: (s) => s.cardState !== 'needsHuman' ||
      s.lastSignal === 'budget-exhausted' || s.lastSignal === 'escalated',
  },
  {
    name: 'rework-carries-its-signal',
    // Mid-correction implementation always holds the concrete thing it is
    // fixing ('' only on a fresh or human-resumed start).
    pred: (s) => s.cardState !== 'implementing' || s.reworkCount === 0 ||
      CORRECTIONS.has(s.lastSignal),
  },
]

export const transitionInvariants = [
  {
    name: 'done-only-via-review-passed',
    // Validation alone no longer finishes a card: review is a stage of the
    // workflow, so the only door into done is REVIEW_PASSED.
    pred: (pre, action, data, post) =>
      post.cardState !== 'done' || pre.cardState === 'done' || action === 'REVIEW_PASSED',
  },
  {
    name: 'review-only-after-validation',
    pred: (pre, action, data, post) =>
      post.cardState !== 'reviewing' || pre.cardState === 'reviewing' ||
      action === 'VALIDATION_PASSED',
  },
  {
    name: 'work-is-planned-first',
    // Implementation is entered only from a finished plan, or by a correction
    // bend carrying its signal. There is no path from ready straight to work.
    pred: (pre, action, data, post) => {
      if (post.cardState !== 'implementing' || pre.cardState === 'implementing') return true
      return action === 'PLAN_READY' || action === 'VALIDATION_FAILED' || action === 'REVIEW_FAILED'
    },
  },
  {
    name: 'no-automatic-replan',
    // The move the article refuses to offer. Planning is entered once per
    // attempt: by START_WORK, or by a human taking RESUME. Nothing in the
    // normal flow can send work back to the drawing board.
    pred: (pre, action, data, post) => {
      if (post.cardState !== 'planning' || pre.cardState === 'planning') return true
      return action === 'START_WORK' || action === 'RESUME'
    },
  },
  {
    name: 'corrections-are-event-driven',
    // Work moves backward only on a concrete failure event — never a timer,
    // never a schedule, never "just in case".
    pred: (pre, action, data, post) => {
      const backward = (pre.cardState === 'validating' || pre.cardState === 'reviewing') &&
        post.cardState === 'implementing'
      if (!backward) return true
      return action === 'VALIDATION_FAILED' || action === 'REVIEW_FAILED'
    },
  },
  {
    name: 'corrections-name-their-target',
    // Every bend hands the implementer the one thing to fix, as-is.
    pred: (pre, action, data, post) => {
      if (post.cardState !== 'implementing') return true
      if (post.reworkCount === pre.reworkCount) return true
      return CORRECTIONS.has(post.lastSignal)
    },
  },
  {
    name: 'rework-increments-only-on-failure',
    pred: (pre, action, data, post) => {
      if (post.reworkCount === pre.reworkCount) return true
      if (post.reworkCount === 0) return action === 'RESUME'
      return (action === 'VALIDATION_FAILED' || action === 'REVIEW_FAILED') &&
        post.reworkCount === pre.reworkCount + 1
    },
  },
  {
    name: 'budget-reset-only-by-human',
    pred: (pre, action, data, post) =>
      !(pre.reworkCount > 0 && post.reworkCount === 0) || action === 'RESUME',
  },
  {
    name: 'terminal-is-frozen',
    pred: (pre, action, data, post) =>
      pre.cardState !== 'done' ||
      (post.cardState === 'done' && post.reworkCount === pre.reworkCount &&
        post.lastSignal === pre.lastSignal),
  },
  {
    name: 'gate-verdict-decides-ready',
    // A card reaches ready only on a passing DoRC verdict — no human override.
    pred: (pre, action, data, post) => {
      if (post.cardState !== 'ready' || pre.cardState === 'ready') return true
      return action === 'MARK_READY' && data && data.gate === 'pass'
    },
  },
]
