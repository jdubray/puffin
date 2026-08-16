/**
 * A card's id, and the component behind it.
 *
 * A card is one RUN of one component, not the component itself. That
 * distinction was missing and it dead-ended the board: `done` is terminal in
 * the task-card machine — deliberately, since re-running is a new generation
 * rather than a mutation of a settled one — while the card id was the component
 * id, so a component whose card was done could never be worked again. Creating
 * a card for it returned the finished one, and there is no action that leads
 * back out of done.
 *
 * So a second run gets a second id. The first keeps the bare name, because the
 * common case should read as the component it builds; later runs carry a
 * generation suffix, and the component is recovered by stripping it.
 *
 * @module shared/card-id
 */

/** What polyrun accepts in an instance id. */
const UNSAFE = /[^a-zA-Z0-9._-]/g

/** `--r2`, `--r3`, … — the run marker, kept out of the glm id's own alphabet. */
const RUN_SUFFIX = /--r(\d+)$/

/**
 * The card id for a component's Nth run.
 *
 * @param {string} glmId
 * @param {number} [run=1] - 1 for the first card, 2 for the next, …
 * @returns {string}
 */
export function cardIdFor(glmId, run = 1) {
  const base = String(glmId).replace(UNSAFE, '-')
  return run > 1 ? `${base}--r${run}` : base
}

/**
 * The card id a component's glm id maps to, ignoring which run it was.
 *
 * @param {string} instanceId
 * @returns {string} the base id, with any run suffix removed
 */
export function baseCardId(instanceId) {
  return String(instanceId).replace(RUN_SUFFIX, '')
}

/**
 * Which run a card is, from its id.
 *
 * @param {string} instanceId
 * @returns {number}
 */
export function runOf(instanceId) {
  const match = String(instanceId).match(RUN_SUFFIX)
  return match ? Number(match[1]) : 1
}

/**
 * The id to use for the NEXT card of a component.
 *
 * A component with no card, or whose cards are all still open, gets its
 * existing id back — re-queueing a phase must not mint a duplicate of work
 * already in flight. Only a settled card earns a fresh one, because only a
 * settled card is a run that finished.
 *
 * @param {string} glmId
 * @param {Array<{instanceId?: string, id?: string, state?: Object}>} cards
 * @returns {{instanceId: string, isNewRun: boolean, run: number}}
 */
export function nextCardId(glmId, cards = []) {
  const base = cardIdFor(glmId)
  const mine = cards.filter(card => baseCardId(card.instanceId || card.id || '') === base)
  if (mine.length === 0) return { instanceId: base, isNewRun: false, run: 1 }

  const open = mine.find(card => card.state?.cardState !== 'done')
  if (open) {
    const instanceId = open.instanceId || open.id
    return { instanceId, isNewRun: false, run: runOf(instanceId) }
  }

  const run = Math.max(...mine.map(card => runOf(card.instanceId || card.id || ''))) + 1
  return { instanceId: cardIdFor(glmId, run), isNewRun: true, run }
}
