/**
 * Plugin Component Loader
 *
 * Dynamically loads plugin renderer components from their entry points.
 * Handles ES module loading, component registration, and cleanup.
 */

import { pluginViewContainer } from './plugin-view-container.js'

/**
 * Default timeout for component loading (ms)
 */
const LOAD_TIMEOUT = 10000

/**
 * PluginComponentLoader - Manages dynamic loading of plugin renderer components
 */
export class PluginComponentLoader {
  constructor() {
    // Track loaded plugins and their modules
    this.loadedPlugins = new Map() // pluginName -> { module, components[], config }

    // Track loading state to prevent duplicate loads
    this.loadingPlugins = new Set()

    // Track load errors for debugging
    this.loadErrors = new Map() // pluginName -> error

    // Event cleanup functions
    this.cleanupFns = []

    // Initialization state
    this.initialized = false
  }

  /**
   * Initialize the component loader
   * Subscribes to plugin lifecycle events
   */
  async init() {
    if (this.initialized) {
      console.warn('[PluginComponentLoader] Already initialized')
      return
    }

    if (!window.puffin || !window.puffin.plugins) {
      console.warn('[PluginComponentLoader] puffin.plugins API not available')
      return
    }

    // Subscribe to plugin activated events
    const unsubActivated = window.puffin.plugins.onPluginActivated(async (data) => {
      console.log(`[PluginComponentLoader] Plugin activated: ${data.name}`)
      await this.loadPluginComponents(data.name)
    })
    this.cleanupFns.push(unsubActivated)

    // Subscribe to plugin deactivated events
    const unsubDeactivated = window.puffin.plugins.onPluginDeactivated((data) => {
      console.log(`[PluginComponentLoader] Plugin deactivated: ${data.name}`)
      this.unloadPluginComponents(data.name)
    })
    this.cleanupFns.push(unsubDeactivated)

    // Load components for already-active plugins
    await this.loadExistingPlugins()

    this.initialized = true
    console.log('[PluginComponentLoader] Initialized')
  }

  /**
   * Load components for plugins that are already active
   */
  async loadExistingPlugins() {
    try {
      const result = await window.puffin.plugins.listActive()
      if (result.success && result.plugins) {
        console.log(`[PluginComponentLoader] Loading components for ${result.plugins.length} active plugins`)
        for (const pluginName of result.plugins) {
          await this.loadPluginComponents(pluginName)
        }
      }
    } catch (error) {
      console.error('[PluginComponentLoader] Failed to load existing plugins:', error)
    }
  }

  /**
   * Load renderer components for a plugin
   * @param {string} pluginName - Plugin name
   * @returns {Promise<boolean>} Success status
   */
  async loadPluginComponents(pluginName) {
    // Check if already loaded
    if (this.loadedPlugins.has(pluginName)) {
      console.log(`[PluginComponentLoader] Components already loaded for: ${pluginName}`)
      return true
    }

    // Check if currently loading
    if (this.loadingPlugins.has(pluginName)) {
      console.log(`[PluginComponentLoader] Already loading: ${pluginName}`)
      return false
    }

    this.loadingPlugins.add(pluginName)
    this.loadErrors.delete(pluginName)

    try {
      // Get renderer config from main process
      const config = await window.puffin.plugins.getRendererConfig(pluginName)

      if (!config.success) {
        throw new Error(config.error || 'Failed to get renderer config')
      }

      // Check if plugin has renderer components
      if (!config.hasRenderer) {
        console.log(`[PluginComponentLoader] No renderer components for: ${pluginName}`)
        this.loadingPlugins.delete(pluginName)
        return true
      }

      // Build the file:// URL for the entry point
      const entryUrl = this.buildEntryUrl(config.pluginDir, config.entry)
      console.log(`[PluginComponentLoader] Loading entry: ${entryUrl}`)

      // Dynamically import the module with timeout
      const module = await this.importWithTimeout(entryUrl, LOAD_TIMEOUT)

      // Extract and register components
      const registeredComponents = []
      for (const componentConfig of config.components) {
        const { name, export: exportName, type } = componentConfig

        // Get the exported component
        const component = exportName === 'default'
          ? module.default
          : module[exportName]

        if (!component) {
          console.warn(`[PluginComponentLoader] Export not found: ${exportName} in ${pluginName}`)
          continue
        }

        // Register with the view container
        pluginViewContainer.registerComponent(name, component)
        registeredComponents.push(name)
        console.log(`[PluginComponentLoader] Registered component: ${name} (${type || 'class'})`)
      }

      // Track the loaded plugin
      this.loadedPlugins.set(pluginName, {
        module,
        components: registeredComponents,
        config
      })

      console.log(`[PluginComponentLoader] Loaded ${registeredComponents.length} components for: ${pluginName}`)
      return true

    } catch (error) {
      console.error(`[PluginComponentLoader] Failed to load components for ${pluginName}:`, error)
      this.loadErrors.set(pluginName, error.message)
      return false

    } finally {
      this.loadingPlugins.delete(pluginName)
    }
  }

  /**
   * Build file:// URL for a plugin entry point
   * @param {string} pluginDir - Plugin directory path
   * @param {string} entry - Relative entry path
   * @returns {string} File URL
   */
  buildEntryUrl(pluginDir, entry) {
    // Normalize path separators
    let fullPath = `${pluginDir}/${entry}`.replace(/\\/g, '/')

    // Handle Windows drive letters (C:/ -> file:///C:/)
    if (/^[a-zA-Z]:\//.test(fullPath)) {
      return `file:///${fullPath}`
    }

    // Unix-style paths
    return `file://${fullPath}`
  }

  /**
   * Dynamically import a module with timeout
   * @param {string} url - Module URL
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Loaded module
   */
  async importWithTimeout(url, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Module load timeout after ${timeout}ms: ${url}`))
      }, timeout)

      import(url)
        .then((module) => {
          clearTimeout(timeoutId)
          resolve(module)
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          reject(error)
        })
    })
  }

  /**
   * Unload components for a plugin
   * @param {string} pluginName - Plugin name
   */
  unloadPluginComponents(pluginName) {
    const loaded = this.loadedPlugins.get(pluginName)
    if (!loaded) {
      console.log(`[PluginComponentLoader] No components loaded for: ${pluginName}`)
      return
    }

    // Unregister each component
    for (const componentName of loaded.components) {
      pluginViewContainer.unregisterComponent(componentName)
      console.log(`[PluginComponentLoader] Unregistered component: ${componentName}`)
    }

    // Destroy any active component instances from this plugin
    pluginViewContainer.destroyPluginComponents(pluginName)

    // Remove from tracking
    this.loadedPlugins.delete(pluginName)
    this.loadErrors.delete(pluginName)

    console.log(`[PluginComponentLoader] Unloaded components for: ${pluginName}`)
  }

  /**
   * Check if a plugin's components are loaded
   * @param {string} pluginName - Plugin name
   * @returns {boolean}
   */
  isLoaded(pluginName) {
    return this.loadedPlugins.has(pluginName)
  }

  /**
   * Check if a plugin is currently loading
   * @param {string} pluginName - Plugin name
   * @returns {boolean}
   */
  isLoading(pluginName) {
    return this.loadingPlugins.has(pluginName)
  }

  /**
   * Get load error for a plugin
   * @param {string} pluginName - Plugin name
   * @returns {string|null}
   */
  getLoadError(pluginName) {
    return this.loadErrors.get(pluginName) || null
  }

  /**
   * Get list of loaded plugins
   * @returns {string[]}
   */
  getLoadedPlugins() {
    return Array.from(this.loadedPlugins.keys())
  }

  /**
   * Get component names for a loaded plugin
   * @param {string} pluginName - Plugin name
   * @returns {string[]}
   */
  getPluginComponents(pluginName) {
    const loaded = this.loadedPlugins.get(pluginName)
    return loaded ? [...loaded.components] : []
  }

  /**
   * Get summary of loader state
   * @returns {Object}
   */
  getSummary() {
    return {
      loaded: this.loadedPlugins.size,
      loading: this.loadingPlugins.size,
      errors: this.loadErrors.size,
      initialized: this.initialized,
      plugins: Array.from(this.loadedPlugins.entries()).map(([name, data]) => ({
        name,
        components: data.components,
        hasError: this.loadErrors.has(name)
      }))
    }
  }

  /**
   * Reload components for a specific plugin
   * @param {string} pluginName - Plugin name
   * @returns {Promise<boolean>}
   */
  async reloadPlugin(pluginName) {
    this.unloadPluginComponents(pluginName)
    return this.loadPluginComponents(pluginName)
  }

  /**
   * Cleanup and destroy the loader
   */
  destroy() {
    // Unload all plugins
    for (const pluginName of this.loadedPlugins.keys()) {
      this.unloadPluginComponents(pluginName)
    }

    // Unsubscribe from events
    for (const cleanup of this.cleanupFns) {
      if (typeof cleanup === 'function') {
        cleanup()
      }
    }
    this.cleanupFns = []

    this.initialized = false
    console.log('[PluginComponentLoader] Destroyed')
  }
}

// Export singleton instance
export const pluginComponentLoader = new PluginComponentLoader()
