/**
 * Plugin Context
 *
 * Provides a sandboxed API for plugins to interact with Puffin.
 * Each plugin receives its own context instance during activation.
 */

const path = require('path')
const fs = require('fs').promises
const os = require('os')

/**
 * PluginContext - API surface exposed to plugins
 *
 * Provides methods for:
 * - Registering actions, acceptors, reactors, components
 * - Registering IPC handlers
 * - Plugin-scoped storage
 * - Logging utilities
 */
class PluginContext {
  /**
   * @param {string} pluginName - Name of the plugin
   * @param {string} pluginDir - Directory path of the plugin
   * @param {Object} options - Context options
   * @param {Object} options.registry - Plugin registry for tracking registrations
   * @param {Object} options.ipcMain - Electron ipcMain for registering handlers
   * @param {Object} options.services - Shared services (optional)
   * @param {string} options.projectPath - Current project path (where .puffin/ lives)
   */
  constructor(pluginName, pluginDir, options = {}) {
    this.pluginName = pluginName
    this.pluginDir = pluginDir
    this.pluginDirectory = pluginDir // Alias for test compatibility
    this.registry = options.registry
    this.ipcMain = options.ipcMain
    this.services = options.services || {}
    this.projectPath = options.projectPath || null // Project root (contains .puffin/)

    // Storage directory for this plugin
    this.storageDir = path.join(os.homedir(), '.puffin', 'plugin-data', pluginName)

    // Track what this plugin has registered for cleanup
    this._registrations = {
      actions: [],
      acceptors: [],
      reactors: [],
      components: [],
      ipcHandlers: []
    }

    // Track event subscriptions for cleanup
    this._subscriptions = []

    // Bound logger (exposed as both log and via getLogger())
    this._logger = this._createLogger()
    this.log = this._logger

    // Storage interface (exposed directly and via getStorage())
    this.storage = this._createStorage()
  }

  // ═══════════════════════════════════════════════════════════════
  // REGISTRATION APIs
  // ═══════════════════════════════════════════════════════════════

  /**
   * Register a SAM action
   * @param {string} name - Action name
   * @param {Function} handler - Action handler function
   */
  registerAction(name, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Action handler for "${name}" must be a function`)
    }

    const qualifiedName = `${this.pluginName}:${name}`
    this._registrations.actions.push(qualifiedName)

    if (this.registry) {
      this.registry.registerAction(this.pluginName, qualifiedName, handler)
    }

    this._logger.debug(`Registered action: ${qualifiedName}`)
  }

  /**
   * Register a SAM acceptor
   * @param {string} name - Acceptor name
   * @param {Function} handler - Acceptor function (model => proposal => void)
   */
  registerAcceptor(name, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Acceptor handler for "${name}" must be a function`)
    }

    const qualifiedName = `${this.pluginName}:${name}`
    this._registrations.acceptors.push(qualifiedName)

    if (this.registry) {
      this.registry.registerAcceptor(this.pluginName, qualifiedName, handler)
    }

    this._logger.debug(`Registered acceptor: ${qualifiedName}`)
  }

  /**
   * Register a SAM reactor
   * @param {string} name - Reactor name
   * @param {Function} handler - Reactor function
   */
  registerReactor(name, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Reactor handler for "${name}" must be a function`)
    }

    const qualifiedName = `${this.pluginName}:${name}`
    this._registrations.reactors.push(qualifiedName)

    if (this.registry) {
      this.registry.registerReactor(this.pluginName, qualifiedName, handler)
    }

    this._logger.debug(`Registered reactor: ${qualifiedName}`)
  }

  /**
   * Register a UI component
   * @param {string} name - Component name
   * @param {Object|Function} component - Component class or factory
   */
  registerComponent(name, component) {
    const qualifiedName = `${this.pluginName}:${name}`
    this._registrations.components.push(qualifiedName)

    if (this.registry) {
      this.registry.registerComponent(this.pluginName, qualifiedName, component)
    }

    this._logger.debug(`Registered component: ${qualifiedName}`)
  }

  /**
   * Register an IPC handler
   * @param {string} channel - IPC channel name (will be prefixed with plugin name)
   * @param {Function} handler - Handler function (event, ...args) => result
   */
  registerIpcHandler(channel, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`IPC handler for "${channel}" must be a function`)
    }

    // Ensure channel has plugin namespace prefix for IPC
    const qualifiedChannel = `plugin:${this.pluginName}:${channel}`

    this._registrations.ipcHandlers.push(qualifiedChannel)

    if (this.ipcMain) {
      // Wrap handler with error handling
      this.ipcMain.handle(qualifiedChannel, async (event, ...args) => {
        try {
          const result = await handler(...args)
          return { success: true, data: result }
        } catch (error) {
          this._logger.error(`IPC handler error for ${qualifiedChannel}:`, error.message)
          return { success: false, error: error.message, plugin: this.pluginName }
        }
      })
    }

    if (this.registry) {
      this.registry.registerIpcHandler(this.pluginName, qualifiedChannel, handler)
    }

    this._logger.debug(`Registered IPC handler: ${qualifiedChannel}`)
  }

  // ═══════════════════════════════════════════════════════════════
  // STORAGE APIs
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the plugin's storage interface
   * @returns {Object} Storage interface
   */
  getStorage() {
    return this.storage
  }

  // ═══════════════════════════════════════════════════════════════
  // LOGGING APIs
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the plugin's logger
   * @returns {Object} Logger interface
   */
  getLogger() {
    return this._logger
  }

  /**
   * Create a namespaced logger
   * @private
   */
  _createLogger() {
    const prefix = `[Plugin:${this.pluginName}]`

    return {
      debug: (...args) => console.debug(prefix, ...args),
      info: (...args) => console.log(prefix, ...args),
      warn: (...args) => console.warn(prefix, ...args),
      error: (...args) => console.error(prefix, ...args)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // UTILITY APIs
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the plugin's directory path
   * @returns {string}
   */
  getPluginDirectory() {
    return this.pluginDir
  }

  /**
   * Get a service by name
   * @param {string} name - Service name
   * @returns {Object|undefined}
   */
  getService(name) {
    return this.services[name]
  }

  /**
   * Subscribe to an event (for plugin-to-plugin communication)
   * @param {string} eventName - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  subscribe(eventName, handler) {
    if (this.registry) {
      const unsubscribe = this.registry.subscribe(eventName, this.pluginName, handler)
      this._subscriptions.push(unsubscribe)
      return unsubscribe
    }
    return () => {}
  }

  /**
   * Call an action registered by another plugin
   * @param {string} qualifiedName - Fully qualified action name (plugin:action)
   * @param {any} payload - Action payload
   * @returns {Promise<any>} Action result
   */
  async callAction(qualifiedName, payload) {
    if (!this.registry) {
      throw new Error('Registry not available')
    }

    const action = this.registry.getAction(qualifiedName)
    if (!action) {
      throw new Error(`Action not found: ${qualifiedName}`)
    }

    return action(payload)
  }

  /**
   * Emit an event (for plugin-to-plugin communication)
   * @param {string} eventName - Event name
   * @param {any} data - Event data
   */
  emit(eventName, data) {
    if (this.registry) {
      this.registry.emitPluginEvent(eventName, this.pluginName, data)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP (internal)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Cleanup all registrations (called during deactivation)
   * @internal
   */
  _cleanup() {
    // Remove IPC handlers
    for (const channel of this._registrations.ipcHandlers) {
      if (this.ipcMain) {
        this.ipcMain.removeHandler(channel)
      }
    }

    // Unsubscribe from all events
    for (const unsubscribe of this._subscriptions) {
      unsubscribe()
    }

    // Unregister from registry
    if (this.registry) {
      this.registry.unregisterPlugin(this.pluginName)
    }

    // Clear tracking
    this._registrations = {
      actions: [],
      acceptors: [],
      reactors: [],
      components: [],
      ipcHandlers: []
    }
    this._subscriptions = []

    this._logger.debug('Cleanup complete')
  }

  /**
   * Get registration summary
   * @returns {Object}
   */
  getRegistrationSummary() {
    return {
      actions: this._registrations.actions.length,
      acceptors: this._registrations.acceptors.length,
      reactors: this._registrations.reactors.length,
      components: this._registrations.components.length,
      ipcHandlers: this._registrations.ipcHandlers.length
    }
  }

  /**
   * Create the storage interface
   * @private
   */
  _createStorage() {
    return {
      path: this.storageDir,
      get: async (key) => {
        try {
          const filePath = path.join(this.storageDir, `${key}.json`)
          const content = await fs.readFile(filePath, 'utf-8')
          return JSON.parse(content)
        } catch (error) {
          if (error.code === 'ENOENT') {
            return undefined
          }
          throw error
        }
      },
      set: async (key, value) => {
        await fs.mkdir(this.storageDir, { recursive: true })
        const filePath = path.join(this.storageDir, `${key}.json`)
        await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8')
      },
      delete: async (key) => {
        try {
          const filePath = path.join(this.storageDir, `${key}.json`)
          await fs.unlink(filePath)
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error
          }
        }
      },
      keys: async () => {
        try {
          const files = await fs.readdir(this.storageDir)
          return files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace(/\.json$/, ''))
        } catch (error) {
          if (error.code === 'ENOENT') {
            return []
          }
          throw error
        }
      },
      clear: async () => {
        try {
          const files = await fs.readdir(this.storageDir)
          for (const file of files) {
            await fs.unlink(path.join(this.storageDir, file))
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error
          }
        }
      }
    }
  }
}

module.exports = { PluginContext }
