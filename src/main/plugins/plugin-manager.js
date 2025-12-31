/**
 * Plugin Manager
 *
 * Orchestrates plugin lifecycle: activation, deactivation, enable/disable.
 * Coordinates between PluginLoader, PluginContext, PluginRegistry, and PluginStateStore.
 */

const { EventEmitter } = require('events')
const { PluginContext } = require('./plugin-context')
const { PluginRegistry } = require('./plugin-registry')
const { PluginStateStore } = require('./plugin-state-store')
const { PluginLifecycleState } = require('./plugin-loader')
const { ViewRegistry } = require('./view-registry')

/**
 * PluginManager - Manages plugin lifecycle
 *
 * Events:
 *   'plugin:activating' - { name }
 *   'plugin:activated' - { name, plugin }
 *   'plugin:activation-failed' - { name, error }
 *   'plugin:deactivating' - { name }
 *   'plugin:deactivated' - { name }
 *   'plugin:deactivation-failed' - { name, error }
 *   'plugin:enabled' - { name }
 *   'plugin:disabled' - { name }
 */
class PluginManager extends EventEmitter {
  /**
   * @param {Object} options
   * @param {PluginLoader} options.loader - Plugin loader instance
   * @param {Object} options.ipcMain - Electron ipcMain
   * @param {Object} [options.services] - Shared services to expose to plugins
   * @param {string} [options.projectPath] - Current project path (for .puffin/ context)
   */
  constructor(options = {}) {
    super()

    this.loader = options.loader
    this.ipcMain = options.ipcMain
    this.services = options.services || {}
    this.projectPath = options.projectPath || null

    // Core components
    this.registry = new PluginRegistry()
    this.stateStore = new PluginStateStore()
    this.viewRegistry = new ViewRegistry()

    // Track active plugins and their contexts
    this.activePlugins = new Map() // name -> { plugin, context }
    this.activationErrors = new Map() // name -> error

    // Initialization state
    this.initialized = false
    this.shuttingDown = false
  }

  /**
   * Initialize the plugin manager
   * Loads persisted state and activates enabled plugins
   * @returns {Promise<{ activated: string[], failed: string[], disabled: string[] }>}
   */
  async initialize() {
    if (this.initialized) {
      throw new Error('PluginManager already initialized')
    }

    // Load persisted state
    await this.stateStore.load()

    // Get loaded plugins from loader
    const loadedPlugins = this.loader.getLoadedPlugins()
    const activated = []
    const failed = []
    const disabled = []

    // Check which plugins should be activated
    for (const plugin of loadedPlugins) {
      const isEnabled = await this.stateStore.isEnabled(plugin.name)

      if (!isEnabled) {
        disabled.push(plugin.name)
        console.log(`[PluginManager] Skipping disabled plugin: ${plugin.name}`)
        continue
      }

      try {
        await this.activatePlugin(plugin.name)
        activated.push(plugin.name)
      } catch (error) {
        failed.push(plugin.name)
        console.error(`[PluginManager] Failed to activate ${plugin.name}:`, error.message)
      }
    }

    // Clean up orphaned states
    const pluginNames = loadedPlugins.map(p => p.name)
    const orphaned = await this.stateStore.cleanupOrphanedStates(pluginNames)
    if (orphaned.length > 0) {
      console.log(`[PluginManager] Cleaned up ${orphaned.length} orphaned plugin states`)
    }

    this.initialized = true

    return { activated, failed, disabled }
  }

  /**
   * Activate a plugin
   * @param {string} name - Plugin name
   * @returns {Promise<void>}
   */
  async activatePlugin(name) {
    if (this.activePlugins.has(name)) {
      console.log(`[PluginManager] Plugin already active: ${name}`)
      return
    }

    const plugin = this.loader.getPlugin(name)
    if (!plugin) {
      throw new Error(`Plugin not found: ${name}`)
    }

    if (plugin.state !== 'loaded') {
      throw new Error(`Plugin not loaded: ${name} (state: ${plugin.state})`)
    }

    // Set lifecycle state to activating
    plugin.setLifecycleState(PluginLifecycleState.ACTIVATING)
    this.emit('plugin:activating', { name })

    try {
      // Create context for this plugin
      const context = new PluginContext(name, plugin.directory, {
        registry: this.registry,
        ipcMain: this.ipcMain,
        services: this.services,
        projectPath: this.projectPath
      })

      // Call plugin's activate function
      if (typeof plugin.module.activate === 'function') {
        await plugin.module.activate(context)
      }

      // Register view contributions from manifest
      if (plugin.viewContributions && plugin.viewContributions.length > 0) {
        const viewResult = this.viewRegistry.registerViews(name, plugin.viewContributions)
        if (viewResult.errors.length > 0) {
          console.warn(`[PluginManager] View registration warnings for ${name}:`, viewResult.errors)
        }
        console.log(`[PluginManager] Registered ${viewResult.registered.length} views for ${name}`)
      }

      // Set lifecycle state to active
      plugin.setLifecycleState(PluginLifecycleState.ACTIVE)

      // Track as active
      this.activePlugins.set(name, { plugin, context })
      this.activationErrors.delete(name)

      // Record activation in state store
      await this.stateStore.recordActivation(name)

      this.emit('plugin:activated', { name, plugin })
      console.log(`[PluginManager] Activated: ${name}`)

    } catch (error) {
      // Set lifecycle state to failed and record error
      plugin.setActivationError(error)
      this.activationErrors.set(name, error.message)
      this.emit('plugin:activation-failed', { name, error })
      console.error(`[PluginManager] Activation failed for ${name}:`, error.message)
      throw error
    }
  }

  /**
   * Deactivate a plugin
   * @param {string} name - Plugin name
   * @returns {Promise<void>}
   */
  async deactivatePlugin(name) {
    const active = this.activePlugins.get(name)
    if (!active) {
      console.log(`[PluginManager] Plugin not active: ${name}`)
      return
    }

    const { plugin, context } = active

    // Set lifecycle state to deactivating
    plugin.setLifecycleState(PluginLifecycleState.DEACTIVATING)
    this.emit('plugin:deactivating', { name })

    try {
      // Call plugin's deactivate function
      if (typeof plugin.module.deactivate === 'function') {
        await plugin.module.deactivate()
      }

      // Cleanup context (removes IPC handlers and registry entries)
      context._cleanup()

      // Unregister view contributions
      const viewResult = this.viewRegistry.unregisterPluginViews(name)
      if (viewResult.unregistered.length > 0) {
        console.log(`[PluginManager] Unregistered ${viewResult.unregistered.length} views for ${name}`)
      }

      // Set lifecycle state to inactive
      plugin.setLifecycleState(PluginLifecycleState.INACTIVE)

      // Remove from active plugins
      this.activePlugins.delete(name)

      this.emit('plugin:deactivated', { name })
      console.log(`[PluginManager] Deactivated: ${name}`)

    } catch (error) {
      // Even on error, set to inactive and remove from active
      plugin.setLifecycleState(PluginLifecycleState.INACTIVE)
      this.activePlugins.delete(name)

      this.emit('plugin:deactivation-failed', { name, error })
      console.error(`[PluginManager] Error deactivating ${name}:`, error.message)

      throw error
    }
  }

  /**
   * Enable a plugin (persist and activate)
   * @param {string} name - Plugin name
   * @returns {Promise<boolean>} Success status
   */
  async enablePlugin(name) {
    const plugin = this.loader.getPlugin(name)
    if (!plugin) {
      throw new Error(`Plugin not found: ${name}`)
    }

    // Persist enabled state
    await this.stateStore.enable(name)

    // Activate if not already active
    if (!this.activePlugins.has(name)) {
      try {
        await this.activatePlugin(name)
      } catch (error) {
        console.error(`[PluginManager] Failed to activate after enabling: ${name}`, error.message)
        return false
      }
    }

    this.emit('plugin:enabled', { name })
    return true
  }

  /**
   * Disable a plugin (deactivate and persist)
   * @param {string} name - Plugin name
   * @returns {Promise<boolean>} Success status
   */
  async disablePlugin(name) {
    // Deactivate if active
    if (this.activePlugins.has(name)) {
      try {
        await this.deactivatePlugin(name)
      } catch (error) {
        console.error(`[PluginManager] Error during deactivation while disabling: ${name}`, error.message)
        // Continue to disable even if deactivation has errors
      }
    }

    // Persist disabled state
    await this.stateStore.disable(name)

    this.emit('plugin:disabled', { name })
    return true
  }

  /**
   * Shutdown all plugins (called on app exit)
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.shuttingDown) {
      return
    }

    this.shuttingDown = true
    console.log('[PluginManager] Shutting down all plugins...')

    const activeNames = Array.from(this.activePlugins.keys())

    for (const name of activeNames) {
      try {
        await this.deactivatePlugin(name)
      } catch (error) {
        console.error(`[PluginManager] Error during shutdown of ${name}:`, error.message)
      }
    }

    console.log('[PluginManager] Shutdown complete')
  }

  /**
   * Reload a plugin (deactivate and reactivate)
   * @param {string} name - Plugin name
   * @returns {Promise<boolean>}
   */
  async reloadPlugin(name) {
    const wasActive = this.activePlugins.has(name)

    if (wasActive) {
      await this.deactivatePlugin(name)
    }

    // Clear require cache to reload module
    const plugin = this.loader.getPlugin(name)
    if (plugin && plugin.mainPath) {
      delete require.cache[require.resolve(plugin.mainPath)]

      // Reload module
      try {
        plugin.module = require(plugin.mainPath)
        plugin.state = 'loaded'
      } catch (error) {
        plugin.state = 'error'
        plugin.error = error.message
        throw error
      }
    }

    if (wasActive) {
      await this.activatePlugin(name)
    }

    return true
  }

  // ═══════════════════════════════════════════════════════════════
  // QUERY METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if a plugin is active
   * @param {string} name - Plugin name
   * @returns {boolean}
   */
  isActive(name) {
    return this.activePlugins.has(name)
  }

  /**
   * Get active plugin names
   * @returns {string[]}
   */
  getActivePlugins() {
    return Array.from(this.activePlugins.keys())
  }

  /**
   * Get plugin state (active/inactive/error)
   * @param {string} name - Plugin name
   * @returns {'active' | 'inactive' | 'error' | 'not-found'}
   */
  getPluginState(name) {
    if (this.activePlugins.has(name)) {
      return 'active'
    }
    if (this.activationErrors.has(name)) {
      return 'error'
    }
    if (this.loader.getPlugin(name)) {
      return 'inactive'
    }
    return 'not-found'
  }

  /**
   * Get activation error for a plugin
   * @param {string} name - Plugin name
   * @returns {string|null}
   */
  getActivationError(name) {
    return this.activationErrors.get(name) || null
  }

  /**
   * Get plugin context (for debugging/testing)
   * @param {string} name - Plugin name
   * @returns {PluginContext|null}
   */
  getPluginContext(name) {
    const active = this.activePlugins.get(name)
    return active ? active.context : null
  }

  /**
   * Get the plugin registry
   * @returns {PluginRegistry}
   */
  getRegistry() {
    return this.registry
  }

  /**
   * Get the state store
   * @returns {PluginStateStore}
   */
  getStateStore() {
    return this.stateStore
  }

  /**
   * Get the view registry
   * @returns {ViewRegistry}
   */
  getViewRegistry() {
    return this.viewRegistry
  }

  /**
   * Get comprehensive plugin info
   * @param {string} name - Plugin name
   * @returns {Promise<Object|null>}
   */
  async getPluginInfo(name) {
    const plugin = this.loader.getPlugin(name)
    if (!plugin) return null

    const persistedState = await this.stateStore.getPluginState(name)
    const registrations = this.registry.getPluginRegistrations(name)

    return {
      ...plugin.toJSON(),
      isActive: this.isActive(name),
      isEnabled: persistedState.enabled !== false,
      activationError: this.getActivationError(name),
      registrations,
      config: persistedState.config,
      lastActivated: persistedState.lastActivated,
      firstSeen: persistedState.firstSeen
    }
  }

  /**
   * Get summary of plugin system state
   * @returns {Promise<Object>}
   */
  async getSummary() {
    const loaderSummary = this.loader.getSummary()
    const registrySummary = this.registry.getSummary()
    const viewRegistrySummary = this.viewRegistry.getSummary()
    const disabledPlugins = await this.stateStore.getDisabledPlugins()

    return {
      ...loaderSummary,
      active: this.activePlugins.size,
      disabled: disabledPlugins.length,
      errors: this.activationErrors.size,
      registry: registrySummary,
      views: viewRegistrySummary,
      initialized: this.initialized,
      shuttingDown: this.shuttingDown
    }
  }
}

module.exports = { PluginManager }
