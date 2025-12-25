/**
 * Plugin Context Proxy
 *
 * Creates renderer-side context objects for plugin components.
 * Provides access to plugin metadata and proxied storage operations via IPC.
 */

/**
 * PluginContextProxy - Factory for creating plugin contexts in the renderer
 */
export class PluginContextProxy {
  constructor() {
    // Cache contexts to avoid recreating
    this.contextCache = new Map() // `${pluginName}:${viewId}` -> context
  }

  /**
   * Create or get a context for a plugin view
   * @param {Object} options - Context options
   * @param {string} options.pluginName - Plugin name
   * @param {string} options.viewId - View ID
   * @param {Object} options.view - View configuration
   * @returns {Object} Plugin context
   */
  createContext({ pluginName, viewId, view }) {
    const cacheKey = `${pluginName}:${viewId}`

    // Return cached context if available
    if (this.contextCache.has(cacheKey)) {
      return this.contextCache.get(cacheKey)
    }

    // Create new context
    const context = {
      // Plugin metadata
      pluginName,
      viewId,
      view: Object.freeze({ ...view }),

      // Storage proxy (uses IPC under the hood)
      storage: this.createStorageProxy(pluginName),

      // Logging proxy (prefixes with plugin name)
      log: this.createLogProxy(pluginName),

      // Event emitter proxy (for cross-view communication)
      events: this.createEventProxy(pluginName)
    }

    // Freeze the context to prevent modifications
    Object.freeze(context)

    // Cache it
    this.contextCache.set(cacheKey, context)

    return context
  }

  /**
   * Create a storage proxy for a plugin
   * Storage operations are proxied via IPC to the main process
   * @param {string} pluginName - Plugin name
   * @returns {Object} Storage API
   */
  createStorageProxy(pluginName) {
    return {
      /**
       * Get a value from storage
       * @param {string} key - Storage key
       * @returns {Promise<any>}
       */
      get: async (key) => {
        if (!window.puffin?.plugins) {
          console.warn('[PluginContextProxy] Storage API not available')
          return undefined
        }

        try {
          const result = await window.puffin.plugins.getStorageValue?.(pluginName, key)
          return result?.success ? result.value : undefined
        } catch (error) {
          console.error(`[PluginContextProxy] Storage get error:`, error)
          return undefined
        }
      },

      /**
       * Set a value in storage
       * @param {string} key - Storage key
       * @param {any} value - Value to store
       * @returns {Promise<boolean>}
       */
      set: async (key, value) => {
        if (!window.puffin?.plugins) {
          console.warn('[PluginContextProxy] Storage API not available')
          return false
        }

        try {
          const result = await window.puffin.plugins.setStorageValue?.(pluginName, key, value)
          return result?.success ?? false
        } catch (error) {
          console.error(`[PluginContextProxy] Storage set error:`, error)
          return false
        }
      },

      /**
       * Delete a value from storage
       * @param {string} key - Storage key
       * @returns {Promise<boolean>}
       */
      delete: async (key) => {
        if (!window.puffin?.plugins) {
          console.warn('[PluginContextProxy] Storage API not available')
          return false
        }

        try {
          const result = await window.puffin.plugins.deleteStorageValue?.(pluginName, key)
          return result?.success ?? false
        } catch (error) {
          console.error(`[PluginContextProxy] Storage delete error:`, error)
          return false
        }
      },

      /**
       * Get all storage keys
       * @returns {Promise<string[]>}
       */
      keys: async () => {
        if (!window.puffin?.plugins) {
          console.warn('[PluginContextProxy] Storage API not available')
          return []
        }

        try {
          const result = await window.puffin.plugins.getStorageKeys?.(pluginName)
          return result?.success ? result.keys : []
        } catch (error) {
          console.error(`[PluginContextProxy] Storage keys error:`, error)
          return []
        }
      },

      /**
       * Clear all storage
       * @returns {Promise<boolean>}
       */
      clear: async () => {
        if (!window.puffin?.plugins) {
          console.warn('[PluginContextProxy] Storage API not available')
          return false
        }

        try {
          const result = await window.puffin.plugins.clearStorage?.(pluginName)
          return result?.success ?? false
        } catch (error) {
          console.error(`[PluginContextProxy] Storage clear error:`, error)
          return false
        }
      }
    }
  }

  /**
   * Create a logging proxy for a plugin
   * All log messages are prefixed with the plugin name
   * @param {string} pluginName - Plugin name
   * @returns {Object} Log API
   */
  createLogProxy(pluginName) {
    const prefix = `[Plugin:${pluginName}]`

    return {
      debug: (...args) => console.debug(prefix, ...args),
      info: (...args) => console.info(prefix, ...args),
      log: (...args) => console.log(prefix, ...args),
      warn: (...args) => console.warn(prefix, ...args),
      error: (...args) => console.error(prefix, ...args)
    }
  }

  /**
   * Create an event proxy for cross-view communication
   * @param {string} pluginName - Plugin name
   * @returns {Object} Event API
   */
  createEventProxy(pluginName) {
    // Use a simple in-memory event bus
    // Events are namespaced to the plugin
    const eventBus = PluginContextProxy.getEventBus()

    return {
      /**
       * Emit an event
       * @param {string} eventName - Event name
       * @param {any} data - Event data
       */
      emit: (eventName, data) => {
        const qualifiedName = `${pluginName}:${eventName}`
        eventBus.emit(qualifiedName, data)
      },

      /**
       * Subscribe to an event
       * @param {string} eventName - Event name
       * @param {Function} handler - Event handler
       * @returns {Function} Unsubscribe function
       */
      on: (eventName, handler) => {
        const qualifiedName = `${pluginName}:${eventName}`
        return eventBus.on(qualifiedName, handler)
      },

      /**
       * Subscribe to an event (one-time)
       * @param {string} eventName - Event name
       * @param {Function} handler - Event handler
       * @returns {Function} Unsubscribe function
       */
      once: (eventName, handler) => {
        const qualifiedName = `${pluginName}:${eventName}`
        return eventBus.once(qualifiedName, handler)
      }
    }
  }

  /**
   * Clear cached context for a view
   * @param {string} pluginName - Plugin name
   * @param {string} viewId - View ID
   */
  clearContext(pluginName, viewId) {
    const cacheKey = `${pluginName}:${viewId}`
    this.contextCache.delete(cacheKey)
  }

  /**
   * Clear all cached contexts for a plugin
   * @param {string} pluginName - Plugin name
   */
  clearPluginContexts(pluginName) {
    const keysToDelete = []

    for (const key of this.contextCache.keys()) {
      if (key.startsWith(`${pluginName}:`)) {
        keysToDelete.push(key)
      }
    }

    for (const key of keysToDelete) {
      this.contextCache.delete(key)
    }
  }

  /**
   * Get the shared event bus instance
   * @returns {Object}
   */
  static getEventBus() {
    if (!PluginContextProxy._eventBus) {
      PluginContextProxy._eventBus = new SimpleEventBus()
    }
    return PluginContextProxy._eventBus
  }

  /**
   * Cleanup
   */
  destroy() {
    this.contextCache.clear()
    console.log('[PluginContextProxy] Destroyed')
  }
}

/**
 * Simple in-memory event bus for plugin communication
 */
class SimpleEventBus {
  constructor() {
    this.handlers = new Map() // eventName -> Set<handler>
  }

  /**
   * Emit an event
   * @param {string} eventName - Event name
   * @param {any} data - Event data
   */
  emit(eventName, data) {
    const handlers = this.handlers.get(eventName)
    if (!handlers) return

    for (const handler of handlers) {
      try {
        handler(data)
      } catch (error) {
        console.error(`[EventBus] Error in handler for ${eventName}:`, error)
      }
    }
  }

  /**
   * Subscribe to an event
   * @param {string} eventName - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(eventName, handler) {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Set())
    }

    this.handlers.get(eventName).add(handler)

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(eventName)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          this.handlers.delete(eventName)
        }
      }
    }
  }

  /**
   * Subscribe to an event (one-time)
   * @param {string} eventName - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  once(eventName, handler) {
    const wrappedHandler = (data) => {
      unsubscribe()
      handler(data)
    }

    const unsubscribe = this.on(eventName, wrappedHandler)
    return unsubscribe
  }

  /**
   * Clear all handlers
   */
  clear() {
    this.handlers.clear()
  }
}

// Export singleton instance
export const pluginContextProxy = new PluginContextProxy()
