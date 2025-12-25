/**
 * Plugin State Store
 *
 * Persists plugin enabled/disabled state across application restarts.
 * Stores state in ~/.puffin/plugin-state.json
 */

const fs = require('fs').promises
const path = require('path')
const os = require('os')

/**
 * PluginStateStore - Persists plugin states
 */
class PluginStateStore {
  /**
   * @param {string} [statePath] - Path to state file (defaults to ~/.puffin/plugin-state.json)
   */
  constructor(statePath) {
    this.statePath = statePath || path.join(os.homedir(), '.puffin', 'plugin-state.json')
    this.state = null
    this.loaded = false
  }

  /**
   * Load state from disk
   * @returns {Promise<Object>}
   */
  async load() {
    try {
      const content = await fs.readFile(this.statePath, 'utf-8')
      this.state = JSON.parse(content)
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create default state
        this.state = this._getDefaultState()
      } else {
        console.error('[PluginStateStore] Error loading state:', error.message)
        this.state = this._getDefaultState()
      }
    }

    this.loaded = true
    return this.state
  }

  /**
   * Save state to disk
   * @returns {Promise<void>}
   */
  async save() {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.statePath)
      await fs.mkdir(dir, { recursive: true })

      // Update timestamp
      this.state.updatedAt = new Date().toISOString()

      // Write atomically (write to temp, then rename)
      const tempPath = `${this.statePath}.tmp`
      await fs.writeFile(tempPath, JSON.stringify(this.state, null, 2), 'utf-8')
      await fs.rename(tempPath, this.statePath)
    } catch (error) {
      console.error('[PluginStateStore] Error saving state:', error.message)
      throw error
    }
  }

  /**
   * Get default state structure
   * @private
   */
  _getDefaultState() {
    return {
      version: 1,
      plugins: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  /**
   * Ensure state is loaded
   * @private
   */
  async _ensureLoaded() {
    if (!this.loaded) {
      await this.load()
    }
  }

  /**
   * Get state for a plugin
   * @param {string} pluginName - Plugin name
   * @returns {Promise<Object>} Plugin state
   */
  async getPluginState(pluginName) {
    await this._ensureLoaded()

    return this.state.plugins[pluginName] || {
      enabled: true, // Plugins are enabled by default
      config: {},
      firstSeen: null,
      lastActivated: null
    }
  }

  /**
   * Set state for a plugin
   * @param {string} pluginName - Plugin name
   * @param {Object} pluginState - State to set
   * @returns {Promise<void>}
   */
  async setPluginState(pluginName, pluginState) {
    await this._ensureLoaded()

    this.state.plugins[pluginName] = {
      ...this.state.plugins[pluginName],
      ...pluginState
    }

    await this.save()
  }

  /**
   * Check if a plugin is enabled
   * @param {string} pluginName - Plugin name
   * @returns {Promise<boolean>}
   */
  async isEnabled(pluginName) {
    const state = await this.getPluginState(pluginName)
    return state.enabled !== false // Default to true
  }

  /**
   * Enable a plugin
   * @param {string} pluginName - Plugin name
   * @returns {Promise<void>}
   */
  async enable(pluginName) {
    await this._ensureLoaded()

    const existing = this.state.plugins[pluginName] || {}
    this.state.plugins[pluginName] = {
      ...existing,
      enabled: true,
      enabledAt: new Date().toISOString()
    }

    await this.save()
  }

  /**
   * Disable a plugin
   * @param {string} pluginName - Plugin name
   * @returns {Promise<void>}
   */
  async disable(pluginName) {
    await this._ensureLoaded()

    const existing = this.state.plugins[pluginName] || {}
    this.state.plugins[pluginName] = {
      ...existing,
      enabled: false,
      disabledAt: new Date().toISOString()
    }

    await this.save()
  }

  /**
   * Record that a plugin was activated
   * @param {string} pluginName - Plugin name
   * @returns {Promise<void>}
   */
  async recordActivation(pluginName) {
    await this._ensureLoaded()

    const existing = this.state.plugins[pluginName] || { enabled: true, config: {} }
    this.state.plugins[pluginName] = {
      ...existing,
      lastActivated: new Date().toISOString(),
      firstSeen: existing.firstSeen || new Date().toISOString()
    }

    await this.save()
  }

  /**
   * Get plugin configuration
   * @param {string} pluginName - Plugin name
   * @returns {Promise<Object>}
   */
  async getPluginConfig(pluginName) {
    const state = await this.getPluginState(pluginName)
    return state.config || {}
  }

  /**
   * Set plugin configuration
   * @param {string} pluginName - Plugin name
   * @param {Object} config - Configuration object
   * @returns {Promise<void>}
   */
  async setPluginConfig(pluginName, config) {
    await this._ensureLoaded()

    const existing = this.state.plugins[pluginName] || { enabled: true }
    this.state.plugins[pluginName] = {
      ...existing,
      config
    }

    await this.save()
  }

  /**
   * Get all plugin states
   * @returns {Promise<Object>}
   */
  async getAllStates() {
    await this._ensureLoaded()
    return { ...this.state.plugins }
  }

  /**
   * Get list of disabled plugins
   * @returns {Promise<string[]>}
   */
  async getDisabledPlugins() {
    await this._ensureLoaded()

    return Object.entries(this.state.plugins)
      .filter(([, state]) => state.enabled === false)
      .map(([name]) => name)
  }

  /**
   * Remove plugin state (for uninstalled plugins)
   * @param {string} pluginName - Plugin name
   * @returns {Promise<void>}
   */
  async removePluginState(pluginName) {
    await this._ensureLoaded()

    delete this.state.plugins[pluginName]
    await this.save()
  }

  /**
   * Clean up states for plugins that no longer exist
   * @param {string[]} existingPlugins - List of currently installed plugin names
   * @returns {Promise<string[]>} List of removed plugin names
   */
  async cleanupOrphanedStates(existingPlugins) {
    await this._ensureLoaded()

    const existingSet = new Set(existingPlugins)
    const orphaned = []

    for (const pluginName of Object.keys(this.state.plugins)) {
      if (!existingSet.has(pluginName)) {
        orphaned.push(pluginName)
        delete this.state.plugins[pluginName]
      }
    }

    if (orphaned.length > 0) {
      await this.save()
    }

    return orphaned
  }
}

module.exports = { PluginStateStore }
