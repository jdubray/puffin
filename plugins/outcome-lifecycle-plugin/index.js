/**
 * Outcome Lifecycle Plugin - Main Process Entry Point
 *
 * Tracks desired outcomes extracted from user stories and manages
 * their lifecycle through a dependency DAG.
 */

const { Storage, initialize: initStorage } = require('./lib/storage')
const { LifecycleRepository } = require('./lib/lifecycle-repository')
const { DAGEngine } = require('./lib/dag-engine')
const { computeStatus } = require('./lib/status-engine')
const ipcHandlers = require('./lib/ipc-handlers')

const OutcomeLifecyclePlugin = {
  name: 'outcome-lifecycle-plugin',
  context: null,
  storage: null,
  repository: null,
  dagEngine: null,
  _unsubscribeStoryStatus: null,
  _storyStatusCache: {},  // { storyId: status } — updated on each event
  _eventQueue: null,  // Promise chain to serialize event handling

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

      // S9: Register IPC handlers
      ipcHandlers.register(context, {
        repository: this.repository,
        dagEngine: this.dagEngine
      })
      logger.info('[outcome-lifecycle-plugin] Registered IPC handlers')

      logger.info('[outcome-lifecycle-plugin] Activated successfully')
    } catch (error) {
      logger.error('[outcome-lifecycle-plugin] Activation failed (degraded mode):', error.message)
    }
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
    this.dagEngine = null
    this.repository = null
    this.storage = null
    this.context = null
    logger.info('[outcome-lifecycle-plugin] Deactivated')
  }
}

module.exports = OutcomeLifecyclePlugin
