/**
 * Generation Coordinator — the batch above the cards.
 *
 * A phase queued from the sekkei is not just a handful of cards: it is a run,
 * with a policy that says what an escalation means. The `generation` machine
 * (machines/generation/) holds that run; this module is what makes it real —
 * it creates the instance, tells it what its cards did, and refuses the
 * dispatches a held batch is not allowed to accept.
 *
 * That refusal is the whole point. Before this existed the policy was a word
 * printed on a phase: a card could escalate and the other five would carry on
 * regardless, which is `continue` behaviour whatever the label said. A gate
 * that can be walked past is a report, not a gate — so `hold` is enforced
 * here, as a rejected dispatch, in the one place every card movement passes
 * through.
 *
 * Membership lives in `.puffin/generations.json` because polyrun instances
 * carry state, not relationships: the machine knows three cards are pending,
 * not which three.
 *
 * @module generation-coordinator
 */

const fs = require('fs')
const path = require('path')

/** Card states that settle a card's contribution to its batch. */
const CARD_OUTCOME = {
  done: 'CARD_DONE',
  needsHuman: 'CARD_ESCALATED'
}

/**
 * The one action a held batch still accepts on its cards.
 *
 * RESUME is how a person un-sticks the escalated card, and a hold that blocked
 * it would be a deadlock: the batch waits for a human who is not allowed to
 * act.
 */
const ALLOWED_WHILE_HELD = new Set(['RESUME'])

class GenerationCoordinator {
  /**
   * @param {Object} options
   * @param {Object} options.board - BoardRuntime (or anything with the same surface)
   * @param {string|null} [options.projectPath]
   */
  constructor({ board, projectPath = null } = {}) {
    this.board = board
    this.projectPath = projectPath
  }

  setProjectPath(projectPath) {
    this.projectPath = projectPath
  }

  /** @private */
  _registryPath() {
    return this.projectPath ? path.join(this.projectPath, '.puffin', 'generations.json') : null
  }

  /**
   * @private
   * A missing or corrupt registry reads as "no batches", never as an error:
   * losing the file must cost the hold gate, not the board itself.
   */
  _read() {
    const file = this._registryPath()
    if (!file || !fs.existsSync(file)) return { generations: [] }
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
      return Array.isArray(parsed?.generations) ? parsed : { generations: [] }
    } catch {
      return { generations: [] }
    }
  }

  /** @private */
  _write(registry) {
    const file = this._registryPath()
    if (!file) return
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(registry, null, 2))
  }

  /** @private The batch a card belongs to, or null. */
  _generationOf(instanceId, registry = this._read()) {
    return registry.generations.find(g => g.cards.includes(instanceId)) || null
  }

  /**
   * Start a generation over cards that already exist on the board.
   *
   * SELECT then START, in that order and once each: membership is fixed before
   * the run and the policy is chosen once — both are enforced by the machine,
   * so a failure here is a real rejection worth surfacing rather than a retry.
   *
   * @param {Object} params
   * @param {string} params.generationId - polyrun instance id for the batch
   * @param {number} params.phase - which phase of the plan this is
   * @param {'hold'|'continue'} params.policy
   * @param {string[]} params.cards - card instance ids, already created
   * @returns {Promise<{success: boolean, generation?: Object, error?: string}>}
   */
  async createGeneration({ generationId, phase, policy, cards = [] }) {
    if (!Array.isArray(cards) || cards.length === 0) {
      return { success: false, error: 'A generation needs at least one card' }
    }
    if (policy !== 'hold' && policy !== 'continue') {
      return { success: false, error: `Unknown policy '${policy}'` }
    }

    try {
      await this.board.createGeneration(generationId)
      const selected = await this.board.dispatch(generationId, 'SELECT', { count: cards.length })
      if (selected?.stepKind === 'rejected') {
        return { success: false, error: `Selection rejected: ${selected.rejectReason}` }
      }
      const started = await this.board.dispatch(generationId, 'START', { policy })
      if (started?.stepKind === 'rejected') {
        return { success: false, error: `Start rejected: ${started.rejectReason}` }
      }

      const registry = this._read()
      const generation = {
        generationId,
        phase,
        policy,
        cards: [...cards],
        settled: {}, // cardId → 'done' | 'escalated'; each card settles once
        createdAt: new Date().toISOString()
      }
      registry.generations.push(generation)
      this._write(registry)
      return { success: true, generation }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Dispatch to a card, with the batch in the loop.
   *
   * Three things happen here that a bare dispatch does not do: a held batch
   * refuses the action, an accepted step that settles a card is reported to
   * the batch, and a card reports its outcome at most once.
   *
   * That last one matters more than it looks. An escalated card can be resumed
   * and go on to finish; without the settled map it would tell the batch it
   * escalated AND that it completed, and `pending` would fall past zero.
   *
   * @param {string} instanceId - card instance id
   * @param {string} action
   * @param {Object} [data]
   * @param {string} [actionId]
   * @returns {Promise<Object>} The dispatch result, or a held refusal
   */
  async dispatchCard(instanceId, action, data = {}, actionId) {
    const registry = this._read()
    const generation = this._generationOf(instanceId, registry)

    if (generation && !ALLOWED_WHILE_HELD.has(action)) {
      const batch = await this._genState(generation.generationId)
      if (batch?.genState === 'held') {
        // Name the control, not the principle. A user who has just resumed the
        // escalated card is told to "resolve the escalation" they already
        // resolved, and left hunting for what else the board wants.
        return {
          success: false,
          held: true,
          generationId: generation.generationId,
          error: `Phase ${generation.phase} is held — a card escalated and this ` +
            `phase runs on policy 'hold', so none of its cards move until a ` +
            `person says to carry on. Use "Resume phase" on the phase strip ` +
            `above the board.`
        }
      }
    }

    const result = await this.board.dispatch(instanceId, action, data, actionId)
    if (!generation || result?.stepKind !== 'accepted') return result

    const outcome = CARD_OUTCOME[result.state?.cardState]
    if (!outcome || generation.settled[instanceId]) return result

    const batchResult = await this.board.dispatch(generation.generationId, outcome, {})
    // Recorded only when the batch actually took it: a rejected outcome (a
    // batch already settled or held) must stay reportable, or the card would
    // be silently written off.
    if (batchResult?.stepKind === 'accepted') {
      const fresh = this._read()
      const entry = fresh.generations.find(g => g.generationId === generation.generationId)
      if (entry) {
        entry.settled[instanceId] = outcome === 'CARD_DONE' ? 'done' : 'escalated'
        this._write(fresh)
      }
    }
    return { ...result, generation: batchResult?.state || null }
  }

  /** @private Live state of a batch, or null when it cannot be read. */
  async _genState(generationId) {
    try {
      const instance = await this.board.getCard(generationId)
      return instance?.state || null
    } catch {
      return null
    }
  }

  /**
   * Every generation this project has run, newest first, with live state.
   *
   * @returns {Promise<{success: boolean, generations: Array<Object>}>}
   */
  async listGenerations() {
    const registry = this._read()
    const generations = []
    for (const generation of registry.generations) {
      generations.push({ ...generation, state: await this._genState(generation.generationId) })
    }
    generations.reverse()
    return { success: true, generations }
  }

  /**
   * Carry on after a hold — the human's decision, never automatic.
   *
   * @param {string} generationId
   */
  async resume(generationId) {
    return this._drive(generationId, 'RESUME_GENERATION')
  }

  /**
   * Stop a batch. The cards stay; only the run ends, as `halted`.
   *
   * @param {string} generationId
   */
  async cancel(generationId) {
    return this._drive(generationId, 'CANCEL')
  }

  /** @private */
  async _drive(generationId, action) {
    try {
      const result = await this.board.dispatch(generationId, action, {})
      if (result?.stepKind === 'rejected') {
        return { success: false, error: result.rejectReason, state: result.state }
      }
      return { success: true, state: result?.state || null }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}

module.exports = { GenerationCoordinator, CARD_OUTCOME, ALLOWED_WHILE_HELD }
