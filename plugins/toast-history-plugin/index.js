/**
 * Toast History Plugin - Entry Point
 *
 * Tracks and persists toast notifications for display in a history view.
 * Stores toasts to .puffin/toast-history.json for persistence across sessions.
 */

const fs = require('fs').promises
const path = require('path')

const ToastHistoryPlugin = {
  context: null,
  toastCache: null,
  storagePath: null,

  /**
   * Activate the plugin
   * @param {Object} context - Plugin context from PluginManager
   */
  async activate(context) {
    this.context = context

    const projectPath = context.projectPath
    if (!projectPath) {
      throw new Error('Toast History plugin requires projectPath in context')
    }

    // Set up storage path
    this.storagePath = path.join(projectPath, '.puffin', 'toast-history.json')

    // Ensure .puffin directory exists
    const puffinDir = path.dirname(this.storagePath)
    try {
      await fs.mkdir(puffinDir, { recursive: true })
    } catch (error) {
      if (error.code !== 'EEXIST') {
        context.log.error('Failed to create .puffin directory:', error.message)
      }
    }

    // Load existing toasts
    await this.loadToasts()

    // Register IPC handlers for renderer communication
    context.registerIpcHandler('get-all', this.handleGetAll.bind(this))
    context.registerIpcHandler('add', this.handleAdd.bind(this))
    context.registerIpcHandler('delete', this.handleDelete.bind(this))
    context.registerIpcHandler('delete-before', this.handleDeleteBefore.bind(this))

    // Register actions for programmatic access
    context.registerAction('getToastHistory', this.getToastHistory.bind(this))
    context.registerAction('addToast', this.addToast.bind(this))
    context.registerAction('deleteToast', this.deleteToast.bind(this))
    context.registerAction('deleteOldToasts', this.deleteOldToasts.bind(this))

    context.log.info('Toast History plugin activated')
    context.log.debug(`Storage path: ${this.storagePath}`)
  },

  /**
   * Deactivate the plugin
   */
  async deactivate() {
    // Save any pending changes before deactivating
    if (this.toastCache) {
      await this.saveToasts()
    }
    this.toastCache = null
    this.context.log.info('Toast History plugin deactivated')
  },

  // ============ Storage Methods ============

  /**
   * Load toasts from storage file
   */
  async loadToasts() {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8')
      const parsed = JSON.parse(data)
      this.toastCache = parsed.toasts || []
      this.context.log.debug(`Loaded ${this.toastCache.length} toasts from storage`)
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, start fresh
        this.toastCache = []
        this.context.log.debug('No existing toast history, starting fresh')
      } else {
        this.context.log.error('Failed to load toast history:', error.message)
        this.toastCache = []
      }
    }
  },

  /**
   * Save toasts to storage file
   */
  async saveToasts() {
    try {
      const data = {
        version: 1,
        toasts: this.toastCache
      }
      await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf-8')
      this.context.log.debug(`Saved ${this.toastCache.length} toasts to storage`)
    } catch (error) {
      this.context.log.error('Failed to save toast history:', error.message)
      throw error
    }
  },

  // ============ Core API Methods ============

  /**
   * Get all toast history
   * @returns {Array} Array of toast objects
   */
  async getToastHistory() {
    return this.toastCache || []
  },

  /**
   * Add a new toast to history
   * @param {Object} toast - Toast object with message, type, timestamp
   * @returns {Object} The added toast with id
   */
  async addToast(toast) {
    const newToast = {
      id: toast.id || `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message: toast.message,
      type: toast.type || 'info',
      timestamp: toast.timestamp || Date.now(),
      source: toast.source || 'unknown'
    }

    this.toastCache.push(newToast)
    await this.saveToasts()

    this.context.log.debug(`Added toast: ${newToast.id} (${newToast.type})`)

    return newToast
  },

  /**
   * Delete a specific toast by ID
   * @param {string} toastId - Toast ID to delete
   * @returns {Object} Result with success status
   */
  async deleteToast(toastId) {
    const initialLength = this.toastCache.length
    this.toastCache = this.toastCache.filter(t => t.id !== toastId)

    if (this.toastCache.length < initialLength) {
      await this.saveToasts()
      this.context.log.debug(`Deleted toast: ${toastId}`)
      return { success: true }
    }

    return { success: false, error: 'Toast not found' }
  },

  /**
   * Delete all toasts before a given timestamp
   * @param {number} timestamp - Unix timestamp (ms)
   * @returns {Object} Result with deleted count
   */
  async deleteOldToasts(timestamp) {
    const initialLength = this.toastCache.length
    this.toastCache = this.toastCache.filter(t => t.timestamp >= timestamp)
    const deletedCount = initialLength - this.toastCache.length

    if (deletedCount > 0) {
      await this.saveToasts()
      this.context.log.debug(`Deleted ${deletedCount} old toasts`)
    }

    return { success: true, deletedCount }
  },

  // ============ IPC Handlers ============

  async handleGetAll() {
    return this.getToastHistory()
  },

  async handleAdd(toast) {
    return this.addToast(toast)
  },

  async handleDelete({ toastId }) {
    return this.deleteToast(toastId)
  },

  async handleDeleteBefore({ timestamp }) {
    return this.deleteOldToasts(timestamp)
  }
}

module.exports = ToastHistoryPlugin
