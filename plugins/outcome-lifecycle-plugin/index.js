/**
 * Outcome Lifecycle Plugin - Main Process Entry Point
 *
 * Tracks desired outcomes extracted from user stories and manages
 * their lifecycle through a dependency DAG.
 */

const { Storage, initialize: initStorage, createDefaultData } = require('./lib/storage')
const { LifecycleRepository } = require('./lib/lifecycle-repository')
const { DAGEngine } = require('./lib/dag-engine')
const { computeStatus } = require('./lib/status-engine')
const { extractOutcome } = require('./lib/outcome-parser')
const ipcHandlers = require('./lib/ipc-handlers')
const { ClaudeClient } = require('../memory-plugin/lib/claude-client')
const { SynthesisEngine } = require('./lib/synthesis-engine')

const OutcomeLifecyclePlugin = {
  name: 'outcome-lifecycle-plugin',
  context: null,
  storage: null,
  repository: null,
  dagEngine: null,
  claudeClient: null,
  synthesisEngine: null,
  _unsubscribeStoryStatus: null,
  _storyStatusCache: {},  // { storyId: status } — updated on each event
  _eventQueue: null,  // Promise chain to serialize event handling
  _bootstrapTimer: null,  // Delayed bootstrap timer
  _bootstrapAttempt: 0,   // Current retry attempt

  /**
   * Activate the plugin
   * @param {Object} context - Plugin context provided by Puffin
   */
  async activate(context) {
    this.context = context
    const ctxLog = context.log || console
    const logger = { ...ctxLog, log: ctxLog.log || ctxLog.info || console.log }

    try {
      if (!context.projectPath) {
        throw new Error('context.projectPath is required')
      }
      const projectPath = context.projectPath
      logger.info('[outcome-lifecycle-plugin] Activating with project path:', projectPath)

      // S2: Initialize file-based storage
      const { basePath } = await initStorage(projectPath)
      this.storage = new Storage(basePath)
      this.repository = new LifecycleRepository(this.storage)
      this.dagEngine = new DAGEngine(this.repository)

      // Initialize Claude client and synthesis engine
      this.claudeClient = new ClaudeClient({ model: 'haiku', logger })
      this.synthesisEngine = new SynthesisEngine({
        repository: this.repository,
        claudeClient: this.claudeClient,
        storage: this.storage,
        logger
      })

      // S7: Subscribe to story status change events (serialized via promise chain)
      this._eventQueue = Promise.resolve()
      this._unsubscribeStoryStatus = context.subscribe('story:status-changed', (event) => {
        this._eventQueue = this._eventQueue.then(() =>
          this._handleStoryStatusChanged(event, logger)
        ).catch((err) => {
          logger.error('[outcome-lifecycle-plugin] Unhandled event queue error:', err.message)
        })
      })
      logger.info('[outcome-lifecycle-plugin] Subscribed to story:status-changed events')

      // Bootstrap: on first load, extract outcomes from existing stories
      // Retry with backoff until stories service is available (PuffinState may not be open yet)
      this._bootstrapAttempt = 0
      this._scheduleBootstrap(context, logger)

      // S9: Register IPC handlers
      ipcHandlers.register(context, {
        repository: this.repository,
        dagEngine: this.dagEngine,
        synthesisEngine: this.synthesisEngine,
        reprocessFn: () => this._resetAndReprocess(context, logger)
      })
      logger.info('[outcome-lifecycle-plugin] Registered IPC handlers')

      logger.info('[outcome-lifecycle-plugin] Activated successfully')
    } catch (error) {
      logger.error('[outcome-lifecycle-plugin] Activation failed (degraded mode):', error.message)
    }
  },

  /**
   * Schedule bootstrap with retry. Waits for stories service to become available.
   * @param {Object} context - Plugin context
   * @param {Object} logger - Logger instance
   */
  _scheduleBootstrap(context, logger) {
    const MAX_ATTEMPTS = 8
    const delays = [2000, 3000, 4500, 6000, 8000, 10000, 15000, 20000]

    this._bootstrapTimer = setTimeout(async () => {
      this._bootstrapAttempt++
      const storyService = context.getService('stories')
      const available = storyService && storyService.isAvailable()
      const stories = available ? storyService.getAll() : []

      if (stories.length === 0 && this._bootstrapAttempt < MAX_ATTEMPTS) {
        logger.info(`[outcome-lifecycle-plugin] Stories not ready, retrying in ${delays[this._bootstrapAttempt] / 1000}s (attempt ${this._bootstrapAttempt}/${MAX_ATTEMPTS})`)
        this._scheduleBootstrap(context, logger)
        return
      }

      await this._bootstrapFromStories(context, logger)
    }, delays[this._bootstrapAttempt] || 2000)
  },

  /**
   * Bootstrap lifecycles from existing user stories on first load.
   * Extracts outcomes from story descriptions and creates lifecycle records.
   * Only runs when no lifecycles exist yet (first activation).
   *
   * @param {Object} context - Plugin context
   * @param {Object} logger - Logger instance
   */
  async _bootstrapFromStories(context, logger) {
    try {
      const existing = await this.repository.list()
      if (existing.length > 0) {
        logger.info('[outcome-lifecycle-plugin] Bootstrap: skipped, ' + existing.length + ' lifecycle(s) already exist')
        return
      }

      logger.info('[outcome-lifecycle-plugin] Bootstrap: no lifecycles found, checking for stories...')

      const storyService = context.getService('stories')
      if (!storyService || !storyService.isAvailable()) {
        logger.warn('[outcome-lifecycle-plugin] Bootstrap: stories service not available (registered: ' + !!storyService + ', available: ' + (storyService ? storyService.isAvailable() : 'N/A') + ')')
        return
      }

      const stories = storyService.getAll()
      logger.info('[outcome-lifecycle-plugin] Bootstrap: found ' + stories.length + ' stories to scan')
      if (stories.length === 0) {
        return
      }

      // Group stories by extracted outcome to deduplicate
      const outcomeMap = new Map() // outcome text -> [storyIds]
      for (const story of stories) {
        const outcome = extractOutcome(story.description)
        if (!outcome) continue

        const key = outcome.toLowerCase()
        if (!outcomeMap.has(key)) {
          outcomeMap.set(key, { text: outcome, storyIds: [] })
        }
        outcomeMap.get(key).storyIds.push(story.id)
      }

      if (outcomeMap.size === 0) {
        logger.info('[outcome-lifecycle-plugin] No outcomes extracted from stories')
        return
      }

      // Create lifecycles and map stories
      let created = 0
      for (const { text, storyIds } of outcomeMap.values()) {
        const lifecycle = await this.repository.create(text, `Auto-extracted from ${storyIds.length} story(ies)`)
        for (const storyId of storyIds) {
          await this.repository.mapStory(lifecycle.id, storyId)
        }

        // Compute initial status from story statuses
        const storyStatuses = storyIds.map(id => {
          const story = stories.find(s => s.id === id)
          const status = story ? story.status : 'pending'
          // Cache for event handling
          this._storyStatusCache[id] = status
          return status
        })
        const computedStatus = computeStatus(storyStatuses)
        if (computedStatus !== 'not_started') {
          await this.repository.update(lifecycle.id, { status: computedStatus })
        }

        created++
      }

      logger.info(`[outcome-lifecycle-plugin] Bootstrap complete: created ${created} lifecycle(s) from ${stories.length} stories`)
    } catch (err) {
      logger.error('[outcome-lifecycle-plugin] Bootstrap failed:', err.message)
    }
  },

  /**
   * Reset all lifecycle data and re-extract from current user stories.
   * Wipes lifecycles.json back to defaults, clears synthesis cache,
   * then runs bootstrap extraction.
   *
   * @param {Object} context - Plugin context
   * @param {Object} logger - Logger instance
   * @returns {Promise<{created: number, total: number}>}
   */
  async _resetAndReprocess(context, logger) {
    logger.info('[outcome-lifecycle-plugin] Resetting all lifecycles and reprocessing from stories...')

    // 1. Wipe storage to defaults (clears lifecycles + synthesized graph)
    await this.storage.save(createDefaultData())
    this._storyStatusCache = {}

    // 2. Re-extract from stories (skip the "already exists" check by using empty storage)
    const storyService = context.getService('stories')
    if (!storyService || !storyService.isAvailable()) {
      throw new Error('Stories service not available')
    }

    const stories = storyService.getAll()
    if (stories.length === 0) {
      logger.info('[outcome-lifecycle-plugin] Reset complete: no stories found')
      return { created: 0, total: 0 }
    }

    // Group stories by extracted outcome to deduplicate
    const outcomeMap = new Map()
    for (const story of stories) {
      const outcome = extractOutcome(story.description)
      if (!outcome) continue

      const key = outcome.toLowerCase()
      if (!outcomeMap.has(key)) {
        outcomeMap.set(key, { text: outcome, storyIds: [] })
      }
      outcomeMap.get(key).storyIds.push(story.id)
    }

    // Create lifecycles and map stories
    let created = 0
    for (const { text, storyIds } of outcomeMap.values()) {
      const lifecycle = await this.repository.create(text, `Auto-extracted from ${storyIds.length} story(ies)`)
      for (const storyId of storyIds) {
        await this.repository.mapStory(lifecycle.id, storyId)
      }

      const storyStatuses = storyIds.map(id => {
        const story = stories.find(s => s.id === id)
        const status = story ? story.status : 'pending'
        this._storyStatusCache[id] = status
        return status
      })
      const computedStatus = computeStatus(storyStatuses)
      if (computedStatus !== 'not_started') {
        await this.repository.update(lifecycle.id, { status: computedStatus })
      }
      created++
    }

    logger.info(`[outcome-lifecycle-plugin] Reset complete: created ${created} lifecycle(s) from ${stories.length} stories`)
    return { created, total: stories.length }
  },

  /**
   * Handle story status change events from SprintService via plugin registry.
   * Finds all lifecycles mapped to the changed story and recomputes their status.
   *
   * @param {Object} event - Plugin event
   * @param {string} event.source - Source plugin name
   * @param {Object} event.data - Event data
   * @param {string} event.data.storyId - Changed story ID
   * @param {string} event.data.status - New story status
   * @param {Object} logger - Logger instance
   */
  async _handleStoryStatusChanged(event, logger) {
    const { storyId, status } = event.data || event
    if (!storyId) return

    // Update local status cache
    this._storyStatusCache[storyId] = status

    try {
      // Find all lifecycles that reference this story
      const lifecycles = await this.repository.getLifecyclesForStory(storyId)

      if (lifecycles.length === 0) {
        // AC4: No errors if completed story has no lifecycle mappings
        return
      }

      logger.info(
        `[outcome-lifecycle-plugin] Story "${storyId}" -> "${status}", recomputing ${lifecycles.length} lifecycle(s)`
      )

      // Recompute status for each affected lifecycle
      for (const lifecycle of lifecycles) {
        const storyStatuses = this._getStoryStatusesForLifecycle(lifecycle)
        const newStatus = computeStatus(storyStatuses)

        if (newStatus !== lifecycle.status) {
          await this.repository.update(lifecycle.id, { status: newStatus })
          logger.info(
            `[outcome-lifecycle-plugin] Lifecycle "${lifecycle.title}" status: ${lifecycle.status} -> ${newStatus}`
          )
        }
      }
    } catch (err) {
      logger.error('[outcome-lifecycle-plugin] Error handling story status change:', err.message)
    }
  },

  /**
   * Get the current statuses for all stories mapped to a lifecycle.
   * Uses the local story status cache, which is populated by story:status-changed events.
   * Stories not yet seen in events default to 'not_started'.
   *
   * @param {Object} lifecycle - Lifecycle object with storyMappings array
   * @returns {string[]} Array of story status strings
   */
  _getStoryStatusesForLifecycle(lifecycle) {
    const storyIds = lifecycle.storyMappings || []
    return storyIds.map(id => this._storyStatusCache[id] || 'not_started')
  },

  /**
   * Deactivate the plugin
   */
  async deactivate() {
    const ctxLog = (this.context && this.context.log) || console
    const logger = { ...ctxLog, log: ctxLog.log || ctxLog.info || console.log }

    // Clear bootstrap timer if still pending
    if (this._bootstrapTimer) {
      clearTimeout(this._bootstrapTimer)
      this._bootstrapTimer = null
    }

    // S7: Unsubscribe from story status events
    if (this._unsubscribeStoryStatus) {
      try {
        this._unsubscribeStoryStatus()
      } catch (err) {
        logger.error('[outcome-lifecycle-plugin] Error unsubscribing from events:', err.message)
      }
      this._unsubscribeStoryStatus = null
    }
    // Note: IPC handlers are auto-cleaned by context._cleanup()

    this._storyStatusCache = {}
    this._eventQueue = null
    this._bootstrapTimer = null
    this._bootstrapAttempt = 0
    this.synthesisEngine = null
    this.claudeClient = null
    this.dagEngine = null
    this.repository = null
    this.storage = null
    this.context = null
    logger.info('[outcome-lifecycle-plugin] Deactivated')
  }
}

module.exports = OutcomeLifecyclePlugin
