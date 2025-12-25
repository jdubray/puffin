/**
 * Plugin Lifecycle Manager
 *
 * Orchestrates lifecycle hooks for plugin components.
 * Handles onActivate, onDeactivate, and onDestroy callbacks
 * with proper async handling, timeouts, and error catching.
 */

/**
 * Default timeout for async lifecycle hooks (ms)
 */
const LIFECYCLE_TIMEOUT = 5000

/**
 * PluginLifecycleManager - Manages plugin component lifecycle hooks
 */
export class PluginLifecycleManager {
  constructor() {
    // Track lifecycle state per view
    this.viewStates = new Map() // viewId -> { isActive: boolean, lastActivated: Date }

    // Track pending async operations
    this.pendingOperations = new Map() // viewId -> Promise

    // Error log for debugging
    this.errors = []
    this.maxErrorLogSize = 50
  }

  /**
   * Call onActivate lifecycle hook on a component
   * @param {string} viewId - View ID
   * @param {Object} component - Component instance
   * @param {Object} context - Plugin context
   * @returns {Promise<boolean>} Success status
   */
  async callActivate(viewId, component, context) {
    // Check if already active
    const state = this.viewStates.get(viewId)
    if (state?.isActive) {
      console.log(`[PluginLifecycleManager] View already active: ${viewId}`)
      return true
    }

    // Update state
    this.viewStates.set(viewId, {
      isActive: true,
      lastActivated: new Date()
    })

    // Check for onActivate method
    if (!component || typeof component.onActivate !== 'function') {
      return true // No hook to call, success
    }

    return this.callLifecycleHook(viewId, 'onActivate', component, context)
  }

  /**
   * Call onDeactivate lifecycle hook on a component
   * @param {string} viewId - View ID
   * @param {Object} component - Component instance
   * @param {Object} context - Plugin context
   * @returns {Promise<boolean>} Success status
   */
  async callDeactivate(viewId, component, context) {
    // Check if already inactive
    const state = this.viewStates.get(viewId)
    if (!state?.isActive) {
      console.log(`[PluginLifecycleManager] View already inactive: ${viewId}`)
      return true
    }

    // Update state
    this.viewStates.set(viewId, {
      ...state,
      isActive: false
    })

    // Check for onDeactivate method
    if (!component || typeof component.onDeactivate !== 'function') {
      return true // No hook to call, success
    }

    return this.callLifecycleHook(viewId, 'onDeactivate', component, context)
  }

  /**
   * Call onDestroy lifecycle hook on a component
   * @param {string} viewId - View ID
   * @param {Object} component - Component instance
   * @param {Object} context - Plugin context
   * @returns {Promise<boolean>} Success status
   */
  async callDestroy(viewId, component, context) {
    // Wait for any pending operations to complete
    const pending = this.pendingOperations.get(viewId)
    if (pending) {
      try {
        await pending
      } catch {
        // Ignore errors from pending operations during destroy
      }
    }

    // Ensure deactivate is called first if still active
    const state = this.viewStates.get(viewId)
    if (state?.isActive) {
      await this.callDeactivate(viewId, component, context)
    }

    // Clean up state
    this.viewStates.delete(viewId)
    this.pendingOperations.delete(viewId)

    // Check for onDestroy method
    if (!component || typeof component.onDestroy !== 'function') {
      return true // No hook to call, success
    }

    return this.callLifecycleHook(viewId, 'onDestroy', component, context)
  }

  /**
   * Call a lifecycle hook with timeout and error handling
   * @param {string} viewId - View ID
   * @param {string} hookName - Name of the hook (onActivate, onDeactivate, onDestroy)
   * @param {Object} component - Component instance
   * @param {Object} context - Plugin context
   * @returns {Promise<boolean>} Success status
   */
  async callLifecycleHook(viewId, hookName, component, context) {
    const hookFn = component[hookName]
    if (typeof hookFn !== 'function') {
      return true
    }

    console.log(`[PluginLifecycleManager] Calling ${hookName} for view: ${viewId}`)

    try {
      // Wrap in Promise.resolve to handle both sync and async hooks
      const hookPromise = this.withTimeout(
        Promise.resolve(hookFn.call(component, context)),
        LIFECYCLE_TIMEOUT,
        `${hookName} hook timed out after ${LIFECYCLE_TIMEOUT}ms`
      )

      // Track pending operation (except for destroy which we don't need to track)
      if (hookName !== 'onDestroy') {
        this.pendingOperations.set(viewId, hookPromise)
      }

      await hookPromise

      // Clear pending operation
      this.pendingOperations.delete(viewId)

      console.log(`[PluginLifecycleManager] ${hookName} completed for view: ${viewId}`)
      return true

    } catch (error) {
      // Clear pending operation
      this.pendingOperations.delete(viewId)

      // Log error but don't crash
      this.logError(viewId, hookName, error)
      console.error(`[PluginLifecycleManager] Error in ${hookName} for view ${viewId}:`, error.message)

      return false
    }
  }

  /**
   * Wrap a promise with a timeout
   * @param {Promise} promise - Promise to wrap
   * @param {number} ms - Timeout in milliseconds
   * @param {string} message - Timeout error message
   * @returns {Promise}
   */
  withTimeout(promise, ms, message) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(message))
      }, ms)

      promise
        .then((result) => {
          clearTimeout(timeoutId)
          resolve(result)
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          reject(error)
        })
    })
  }

  /**
   * Log a lifecycle error
   * @param {string} viewId - View ID
   * @param {string} hookName - Hook name
   * @param {Error} error - Error object
   */
  logError(viewId, hookName, error) {
    const entry = {
      viewId,
      hookName,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }

    this.errors.push(entry)

    // Trim error log if too large
    if (this.errors.length > this.maxErrorLogSize) {
      this.errors = this.errors.slice(-this.maxErrorLogSize)
    }
  }

  /**
   * Check if a view is currently active
   * @param {string} viewId - View ID
   * @returns {boolean}
   */
  isViewActive(viewId) {
    return this.viewStates.get(viewId)?.isActive ?? false
  }

  /**
   * Get the last activated time for a view
   * @param {string} viewId - View ID
   * @returns {Date|null}
   */
  getLastActivated(viewId) {
    return this.viewStates.get(viewId)?.lastActivated ?? null
  }

  /**
   * Check if a view has a pending operation
   * @param {string} viewId - View ID
   * @returns {boolean}
   */
  hasPendingOperation(viewId) {
    return this.pendingOperations.has(viewId)
  }

  /**
   * Get lifecycle errors for debugging
   * @param {string} [viewId] - Optional filter by view ID
   * @returns {Object[]}
   */
  getErrors(viewId = null) {
    if (viewId) {
      return this.errors.filter(e => e.viewId === viewId)
    }
    return [...this.errors]
  }

  /**
   * Clear lifecycle errors
   * @param {string} [viewId] - Optional filter by view ID
   */
  clearErrors(viewId = null) {
    if (viewId) {
      this.errors = this.errors.filter(e => e.viewId !== viewId)
    } else {
      this.errors = []
    }
  }

  /**
   * Get summary of lifecycle state
   * @returns {Object}
   */
  getSummary() {
    const activeViews = []
    const inactiveViews = []

    for (const [viewId, state] of this.viewStates) {
      if (state.isActive) {
        activeViews.push(viewId)
      } else {
        inactiveViews.push(viewId)
      }
    }

    return {
      activeViews,
      inactiveViews,
      pendingOperations: this.pendingOperations.size,
      errorCount: this.errors.length
    }
  }

  /**
   * Destroy all views for a plugin
   * @param {string} pluginName - Plugin name
   * @param {Map<string, Object>} components - Map of viewId -> component
   * @param {Function} contextFactory - Function to create context for each view
   * @returns {Promise<void>}
   */
  async destroyPluginViews(pluginName, components, contextFactory) {
    const promises = []

    for (const [viewId, component] of components) {
      // Check if this view belongs to the plugin
      if (component?.pluginName === pluginName) {
        const context = contextFactory ? contextFactory(viewId) : null
        promises.push(this.callDestroy(viewId, component, context))
      }
    }

    await Promise.all(promises)
    console.log(`[PluginLifecycleManager] Destroyed all views for plugin: ${pluginName}`)
  }

  /**
   * Cleanup and reset the manager
   */
  destroy() {
    this.viewStates.clear()
    this.pendingOperations.clear()
    this.errors = []
    console.log('[PluginLifecycleManager] Destroyed')
  }
}

// Export singleton instance
export const pluginLifecycleManager = new PluginLifecycleManager()
