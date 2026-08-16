/**
 * The machine-readable tail of a session's reply.
 *
 * An unattended runner has to know two things a transcript states only in
 * prose: did this turn find questions the design does not answer, and did a
 * review find anything. Guessing at that from the text is how a runner learns
 * to be confident about the wrong thing — a plan that says "nothing is
 * unsettled" and one that lists six questions read almost identically to a
 * keyword match.
 *
 * So the prompts ask for one last line in a fixed shape, and this reads it.
 * Determinism at the edges: the turn stays prose for the human, and carries one
 * parseable fact for the machine.
 *
 * When the line is absent the answer is `null`, never zero. A turn that did not
 * say is not a turn that said none — and the runner treats not-knowing as a
 * reason to stop rather than a reason to continue.
 *
 * @module shared/turn-report
 */

/** `UNSETTLED: none` · `UNSETTLED: 3` — the last line a planning turn writes. */
const UNSETTLED = /^\s*UNSETTLED:\s*(none|\d+)\s*$/im

/** `FINDINGS: none` · `FINDINGS: 2` — the same for a review turn. */
const FINDINGS = /^\s*FINDINGS:\s*(none|\d+)\s*$/im

/**
 * How many questions a planning turn left unanswered.
 *
 * @param {string} text
 * @returns {number|null} null when the turn did not say
 */
export function unsettledCount(text) {
  return countFrom(text, UNSETTLED)
}

/**
 * How many findings a review turn reported.
 *
 * @param {string} text
 * @returns {number|null} null when the turn did not say
 */
export function findingCount(text) {
  return countFrom(text, FINDINGS)
}

/** @private */
function countFrom(text, pattern) {
  // Read from the end: a turn that quotes the format while explaining itself
  // would otherwise have its example parsed instead of its answer.
  const lines = String(text || '').split('\n').reverse()
  for (const line of lines) {
    const match = line.match(pattern)
    if (match) return match[1].toLowerCase() === 'none' ? 0 : Number(match[1])
  }
  return null
}

/** The sentence every stage's rules end with, so the tail is always there. */
export const REPORT_LINE = {
  plan: 'End your reply with one final line, exactly `UNSETTLED: none` or ' +
    '`UNSETTLED: <n>` where n is how many questions above the design does not ' +
    'answer. It is read by the runner, so it must be the last line and nothing else.',
  review: 'End your reply with one final line, exactly `FINDINGS: none` or ' +
    '`FINDINGS: <n>` where n is how many findings you reported. It is read by ' +
    'the runner, so it must be the last line and nothing else.'
}
