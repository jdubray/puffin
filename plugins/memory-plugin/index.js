/**
 * Memory Plugin - Main Process Entry Point
 *
 * Extracts and persists domain-level knowledge from branch conversations.
 * Uses Claude CLI (via lightweight client) for LLM-powered extraction and evolution.
 */

const path = require('path')
const { initialize: initStorage } = require('./lib/storage-init.js')
const { FileSystemLayer } = require('./lib/file-system-layer.js')
const { ClaudeClient } = require('./lib/claude-client.js')
const { MemoryManager } = require('./lib/memory-manager.js')
const { Maintenance } = require('./lib/maintenance.js')
const ipcHandlers = require('./lib/ipc-handlers.js')

const MemoryPlugin = {
  name: 'memory-plugin',
  context: null,
  fsLayer: null,
  memoryManager: null,
  maintenance: null,
  registeredChannels: [],

  /**
   * Activate the plugin
   * @param {Object} context - Plugin context provided by Puffin
   */
  async activate(context) {
    this.context = context
    const ctxLog = context.log || console
    const logger = { ...ctxLog, log: ctxLog.log || ctxLog.info || console.log }

    try {
      // Determine project root
      const projectPath = context.projectPath || process.cwd()
      logger.info('[memory-plugin] Activating with project path:', projectPath)

      // Initialize storage directory
      const { basePath } = await initStorage(projectPath)

      // Create file system layer
      this.fsLayer = new FileSystemLayer(basePath)

      // Create Claude CLI client
      const claudeClient = new ClaudeClient({
        model: 'haiku',
        logger
      })

      // Create history service adapter
      // The HistoryService uses getPrompts(branchName) which returns transformed prompts
      // We adapt it to the getBranchPrompts interface expected by MemoryManager
      const historyService = this._createHistoryAdapter(context, logger)

      // Create MemoryManager
      this.memoryManager = new MemoryManager({
        fsLayer: this.fsLayer,
        claudeClient,
        historyService,
        logger
      })

      // Create Maintenance (needs historyService to discover unmemoized branches on startup)
      this.maintenance = new Maintenance({
        fsLayer: this.fsLayer,
        memoryManager: this.memoryManager,
        historyService,
        logger
      })

      // Register IPC handlers
      const ipcMain = context.ipcMain
      if (ipcMain) {
        this.registeredChannels = ipcHandlers.register(ipcMain, {
          memoryManager: this.memoryManager,
          fsLayer: this.fsLayer,
          maintenance: this.maintenance,
          logger
        })
      }

      // Run startup maintenance check (async, non-blocking)
      this.maintenance.startupCheck()

      logger.info('[memory-plugin] Activated successfully')

    } catch (error) {
      logger.error('[memory-plugin] Activation failed (degraded mode):', error.message)
      // Plugin continues in degraded mode — IPC handlers may not be registered
    }
  },

  /**
   * Deactivate the plugin
   */
  async deactivate() {
    const ctxLog = (this.context && this.context.log) || console
    const logger = { ...ctxLog, log: ctxLog.log || ctxLog.info || console.log }

    // Unregister IPC handlers
    if (this.context && this.context.ipcMain && this.registeredChannels.length > 0) {
      ipcHandlers.unregister(this.context.ipcMain, this.registeredChannels)
      this.registeredChannels = []
    }

    this.fsLayer = null
    this.memoryManager = null
    this.maintenance = null
    this.context = null

    logger.info('[memory-plugin] Deactivated')
  },

  /**
   * Create an adapter that bridges Puffin's HistoryService to MemoryManager's expected interface
   * @param {Object} context - Plugin context
   * @param {Object} logger
   * @returns {Object} Adapter with getBranchPrompts(branchId) and getBranches()
   * @private
   */
  _createHistoryAdapter(context, logger) {
    return {
      /**
       * Get all branch IDs from the history service
       * @returns {Promise<string[]>} Array of branch ID strings
       */
      async getBranches() {
        const historyService = context.getService && context.getService('history')
        if (historyService) {
          const branches = await historyService.getBranches()
          return branches.map(b => b.id || b.name).filter(Boolean)
        }

        // Fallback: read branch keys from history.json
        logger.warn('[memory-plugin] HistoryService not available, reading history.json for branch list')
        const fs = require('fs').promises
        const historyPath = path.join(context.projectPath || process.cwd(), '.puffin', 'history.json')
        try {
          const raw = await fs.readFile(historyPath, 'utf-8')
          const history = JSON.parse(raw)
          return Object.keys(history.branches || {})
        } catch (err) {
          if (err.code === 'ENOENT') return []
          throw err
        }
      },

      async getBranchPrompts(branchId) {
        // Try context.getService('history') first
        const historyService = context.getService && context.getService('history')
        if (historyService) {
          const prompts = await historyService.getPrompts(branchId)
          // Transform to the format MemoryManager expects: { content, response: { content } }
          return prompts.map(p => {
            const responseContent = p.responseContent
              || (p.response && typeof p.response === 'object' ? p.response.content : p.response)
              || ''
            return {
              content: p.content || p.userContent || '',
              response: { content: responseContent }
            }
          })
        }

        // Fallback: direct history.json file read
        logger.warn('[memory-plugin] HistoryService not available, reading history.json directly')
        const fs = require('fs').promises
        const historyPath = path.join(context.projectPath || process.cwd(), '.puffin', 'history.json')
        try {
          const raw = await fs.readFile(historyPath, 'utf-8')
          const history = JSON.parse(raw)
          const branch = history.branches && history.branches[branchId]
          if (!branch || !branch.prompts) return []
          return branch.prompts.map(p => ({
            content: p.content || '',
            response: { content: (p.response && p.response.content) || '' }
          }))
        } catch (err) {
          if (err.code === 'ENOENT') return []
          throw err
        }
      }
    }
  }
}

module.exports = MemoryPlugin
