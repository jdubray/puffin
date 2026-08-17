/**
 * From an approved change request to the work it implies.
 *
 * An SCR is the sekkei's record that the design had to decide something. It
 * carries the nodes it touches, and once a person has approved it the code for
 * those nodes is by definition out of date — so the run that brings the code
 * back in line is derivable rather than something to assemble by hand.
 *
 * `Approved` is the trigger, and it is the only status that is. Draft is a
 * proposal, Under Review is a conversation, and Rejected is an answer;
 * regenerating on any of them would build from a design nobody has agreed to.
 * At the other end, `Implemented` is what the workflow REPORTS — a status the
 * board earns by finishing the cards, not one a person has to remember to set —
 * and `Released` stays a human call, because shipping is not the same fact as
 * building.
 *
 * @module shared/scr-plan
 */

/** The one status that authorizes work. */
export const TRIGGER_STATUS = 'Approved'

/** Statuses past the point where the work is still outstanding. */
const SETTLED = new Set(['Implemented', 'Released', 'Rejected'])

/**
 * The components an SCR's target nodes resolve to.
 *
 * A target may be the component, or a spec leaf, or an interaction beneath it;
 * each is lifted to the component that owns it, because the unit of work is the
 * component. A target that resolves to nothing is reported rather than dropped:
 * an SCR aimed at a node that no longer exists is a change request nobody can
 * act on, and silently planning zero work would read as "already done".
 *
 * @param {{targetNodes?: string[]}} scr
 * @param {Array<{glmId: string, stratum: string}>} nodes
 * @returns {{components: string[], unresolved: string[]}}
 */
export function componentsForScr(scr, nodes = []) {
  const componentIds = new Set(
    nodes.filter(n => n.stratum === 'component').map(n => n.glmId))
  const components = new Set()
  const unresolved = []

  for (const target of scr?.targetNodes || []) {
    const owner = ownerOf(target, componentIds)
    if (owner) components.add(owner)
    else unresolved.push(target)
  }
  return { components: [...components].sort(), unresolved }
}

/** The component a node hangs beneath, or the node itself. @private */
function ownerOf(glmId, componentIds) {
  if (componentIds.has(glmId)) return glmId
  const segments = String(glmId).split('.')
  for (let i = segments.length - 1; i > 0; i--) {
    const candidate = segments.slice(0, i).join('.')
    if (componentIds.has(candidate)) return candidate
  }
  return null
}

/**
 * What is outstanding for each approved SCR.
 *
 * @param {Object} params
 * @param {Array<Object>} params.scrs
 * @param {Array<Object>} params.nodes
 * @param {Array<Object>} params.cards - board cards, with state
 * @param {(glmId: string) => string} params.cardIdFor
 * @param {(instanceId: string) => string} params.baseCardId
 * @returns {Array<Object>} one entry per approved SCR, newest first
 */
export function scrWorkPlan({ scrs = [], nodes = [], cards = [], cardIdFor, baseCardId }) {
  const openByBase = new Map()
  const doneByBase = new Set()
  for (const card of cards) {
    const base = baseCardId(card.instanceId || card.id || '')
    if (card.state?.cardState === 'done') doneByBase.add(base)
    else openByBase.set(base, card)
  }

  return scrs
    .filter(scr => scr.status === TRIGGER_STATUS)
    .map(scr => {
      const { components, unresolved } = componentsForScr(scr, nodes)
      const work = components.map(glmId => {
        const base = cardIdFor(glmId)
        const open = openByBase.get(base)
        return {
          glmId,
          // 'open' — a card is already working this component; the SCR waits on
          // it rather than minting a second.
          // 'settled' — the last run finished, so this SCR needs a new one.
          // 'absent' — never carded at all.
          state: open ? 'open' : doneByBase.has(base) ? 'settled' : 'absent',
          cardState: open?.state?.cardState || null,
          instanceId: open ? (open.instanceId || open.id) : null
        }
      })
      const needsCards = work.filter(w => w.state !== 'open')
      const waiting = work.filter(w => w.state === 'open')
      return {
        id: scr.id,
        title: scr.title,
        scrClass: scr.scrClass,
        components,
        unresolved,
        work,
        needsCards: needsCards.map(w => w.glmId),
        waitingOn: waiting.map(w => w.glmId),
        // Nothing to card and nothing open: every component this SCR targets
        // has a finished run that started AFTER the approval, so the work the
        // SCR asked for is done and its status can say so.
        complete: components.length > 0 && needsCards.length === 0 && waiting.length === 0
      }
    })
    .reverse()
}

/**
 * Is this SCR's work finished, given the cards its run created?
 *
 * Separate from scrWorkPlan because the plan is computed before a run and this
 * is asked after: a card list where every one of an SCR's components is done
 * means the SCR itself has been implemented.
 *
 * @param {string[]} components
 * @param {Array<Object>} cards
 * @param {(glmId: string) => string} cardIdFor
 * @param {(instanceId: string) => string} baseCardId
 * @returns {boolean}
 */
export function scrWorkFinished(components, cards, cardIdFor, baseCardId) {
  if (!components || components.length === 0) return false
  return components.every(glmId => {
    const base = cardIdFor(glmId)
    const mine = cards.filter(c => baseCardId(c.instanceId || c.id || '') === base)
    return mine.length > 0 && mine.every(c => c.state?.cardState === 'done')
  })
}

/** Is this SCR past the point of needing work? */
export function isSettled(scr) {
  return SETTLED.has(scr?.status)
}
