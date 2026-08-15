/**
 * Generation — invariants over a batch run.
 *
 * The escalation policy is a genuine choice, so the machine holds both values
 * and the checker proves each one behaves. What is not a choice: a settled
 * generation names its outcome honestly, the policy cannot change mid-run, and
 * the evolution gate is answered before any card starts.
 */

const STATES = new Set(['drafting', 'running', 'held', 'done', 'doneWithEscalations', 'halted'])
const POLICIES = new Set(['', 'hold', 'continue'])
const SETTLED = new Set(['done', 'doneWithEscalations'])
const TERMINAL = new Set(['done', 'doneWithEscalations', 'halted'])

export const stateInvariants = [
  {
    name: 'generation-state-in-vocabulary',
    pred: (s) => STATES.has(s.genState),
  },
  {
    name: 'policy-in-vocabulary',
    pred: (s) => POLICIES.has(s.policy),
  },
  {
    name: 'counts-are-bounded',
    pred: (s) =>
      Number.isInteger(s.pending) && s.pending >= 0 && s.pending <= 3 &&
      Number.isInteger(s.escalated) && s.escalated >= 0 && s.escalated <= 2,
  },
  {
    name: 'a-running-batch-has-a-policy',
    // Nothing runs before the user has said what an escalation means here.
    pred: (s) => !['running', 'held'].includes(s.genState) || s.policy !== '',
  },
  {
    name: 'drafting-has-not-run-anything',
    pred: (s) => s.genState !== 'drafting' || (s.policy === '' && s.escalated === 0),
  },
  {
    name: 'settled-means-nothing-pending',
    // "Finished" cannot mean "finished except for two cards still open".
    pred: (s) => !SETTLED.has(s.genState) || s.pending === 0,
  },
  {
    name: 'plain-done-means-nothing-escalated',
    // The honesty rule: a generation that left work for a person says so in
    // its terminal, rather than reporting success and burying the count.
    pred: (s) => s.genState !== 'done' || s.escalated === 0,
  },
  {
    name: 'escalations-name-themselves',
    pred: (s) => s.genState !== 'doneWithEscalations' || s.escalated > 0,
  },
  {
    name: 'only-hold-holds',
    // The single behavioural difference between the two policies, stated as a
    // property rather than trusted to the acceptor that implements it.
    pred: (s) => s.genState !== 'held' || s.policy === 'hold',
  },
]

export const transitionInvariants = [
  {
    name: 'policy-never-changes-mid-run',
    // A run cannot change the rules it is being judged by halfway through.
    pred: (pre, action, data, post) =>
      pre.policy === '' || post.policy === pre.policy,
  },
  {
    name: 'policy-is-set-only-by-start',
    pred: (pre, action, data, post) =>
      post.policy === pre.policy || action === 'START',
  },
  {
    name: 'membership-is-fixed-before-the-run',
    // pending changes by selection while drafting, or by one settling card.
    pred: (pre, action, data, post) => {
      if (post.pending === pre.pending) return true
      if (pre.genState === 'drafting') return action === 'SELECT'
      return (action === 'CARD_DONE' || action === 'CARD_ESCALATED') &&
        post.pending === pre.pending - 1
    },
  },
  {
    name: 'escalations-only-accumulate',
    // The count never falls: resuming a held batch does not forgive what it
    // stepped over, and no action can quietly reset it.
    pred: (pre, action, data, post) => post.escalated >= pre.escalated,
  },
  {
    name: 'escalation-count-rises-only-on-escalation',
    pred: (pre, action, data, post) =>
      post.escalated === pre.escalated || action === 'CARD_ESCALATED',
  },
  {
    name: 'hold-stops-at-the-first-escalation',
    // Under 'hold', an escalation with work still outstanding always holds —
    // never runs on. This is what the user is choosing between.
    pred: (pre, action, data, post) => {
      if (action !== 'CARD_ESCALATED' || pre.genState !== 'running') return true
      if (pre.policy !== 'hold') return true
      return post.pending === 0 || post.genState === 'held'
    },
  },
  {
    name: 'continue-never-holds',
    pred: (pre, action, data, post) =>
      pre.policy !== 'continue' || post.genState !== 'held',
  },
  {
    name: 'settling-requires-the-last-card',
    // A generation reaches a settled terminal only as the last card lands, or
    // when a human resumes a hold with nothing left outstanding.
    pred: (pre, action, data, post) => {
      if (!SETTLED.has(post.genState) || SETTLED.has(pre.genState)) return true
      return action === 'CARD_DONE' || action === 'CARD_ESCALATED' ||
        action === 'RESUME_GENERATION'
    },
  },
  {
    name: 'halted-only-by-cancel',
    pred: (pre, action, data, post) =>
      post.genState !== 'halted' || pre.genState === 'halted' || action === 'CANCEL',
  },
  {
    name: 'terminals-are-frozen',
    pred: (pre, action, data, post) =>
      !TERMINAL.has(pre.genState) ||
      (post.genState === pre.genState && post.pending === pre.pending &&
        post.escalated === pre.escalated && post.policy === pre.policy),
  },
]
