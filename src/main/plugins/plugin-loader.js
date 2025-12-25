/**
 * Plugin Loader Service
 *
 * Discovers and loads plugins from the ~/.puffin/plugins/ directory.
 * Validates manifests, resolves dependencies, and emits lifecycle events.
 */

const { EventEmitter } = require('events')
const fs = require('fs').promises
const path = require('path')
const os = require('os')

const { ManifestValidator } = require('./manifest-validator')
const { parseViewContributions, logContributionErrors } = require('./contribution-parser')

/**
 * Plugin load states
 * @enum {string}
 */
const PluginLoadState = {
  DISCOVERED: 'discovered',
  VALIDATED: 'validated',
  LOADED: 'loaded',
  ERROR: 'error'
}

/**
 * Plugin lifecycle states (activation)
 * @enum {string}
 */
const PluginLifecycleState = {
  INACTIVE: 'inactive',
  ACTIVATING: 'activating',
  ACTIVE: 'active',
  DEACTIVATING: 'deactivating',
  ACTIVATION_FAILED: 'activation-failed'
}

/**
 * Plugin state representation
 */
class Plugin {
  constructor(manifest, directory) {
    this.name = manifest.name
    this.version = manifest.version
    this.displayName = manifest.displayName
    this.description = manifest.description
    this.main = manifest.main
    this.manifest = manifest
    this.directory = directory
    this.mainPath = path.join(directory, manifest.main)
    this.state = PluginLoadState.DISCOVERED // Load state: discovered | validated | loaded | error
    this.lifecycleState = PluginLifecycleState.INACTIVE // Lifecycle state: inactive | activating | active | deactivating | activation-failed
    this.error = null
    this.activationError = null // Error from activate() call
    this.validationErrors = null // Array of detailed validation errors
    this.module = null
    this.dependencies = manifest.dependencies || {}
    this.activatedAt = null
    this.deactivatedAt = null

    // View contributions parsed from manifest
    this.viewContributions = []
    this.contributionErrors = []
    this.contributionWarnings = []
  }

  /**
   * Set lifecycle state with timestamp tracking
   * @param {string} state - New lifecycle state
   */
  setLifecycleState(state) {
    this.lifecycleState = state
    if (state === PluginLifecycleState.ACTIVE) {
      this.activatedAt = new Date().toISOString()
      this.activationError = null
    } else if (state === PluginLifecycleState.INACTIVE) {
      this.deactivatedAt = new Date().toISOString()
    }
  }

  /**
   * Record an activation error
   * @param {Error|string} error - The error that occurred
   */
  setActivationError(error) {
    this.activationError = error instanceof Error ? error.message : error
    this.lifecycleState = PluginLifecycleState.ACTIVATION_FAILED
  }

  /**
   * Check if plugin is currently active
   * @returns {boolean}
   */
  isActive() {
    return this.lifecycleState === PluginLifecycleState.ACTIVE
  }

  /**
   * Check if plugin can be activated
   * @returns {boolean}
   */
  canActivate() {
    return this.state === PluginLoadState.LOADED &&
           (this.lifecycleState === PluginLifecycleState.INACTIVE ||
            this.lifecycleState === PluginLifecycleState.ACTIVATION_FAILED)
  }

  toJSON() {
    return {
      name: this.name,
      version: this.version,
      displayName: this.displayName,
      description: this.description,
      directory: this.directory,
      state: this.state,
      lifecycleState: this.lifecycleState,
      error: this.error,
      activationError: this.activationError,
      validationErrors: this.validationErrors,
      dependencies: this.dependencies,
      manifest: this.manifest,
      activatedAt: this.activatedAt,
      deactivatedAt: this.deactivatedAt,
      viewContributions: this.viewContributions,
      contributionErrors: this.contributionErrors,
      contributionWarnings: this.contributionWarnings
    }
  }

  /**
   * Get views filtered by location
   * @param {string} location - Location to filter by
   * @returns {Array} Views at the specified location
   */
  getViewsByLocation(location) {
    return this.viewContributions
      .filter(view => view.location === location)
      .sort((a, b) => (a.order || 100) - (b.order || 100))
  }

  /**
   * Check if plugin has any view contributions
   * @returns {boolean}
   */
  hasViews() {
    return this.viewContributions.length > 0
  }
}

/**
 * PluginLoader - Discovers and loads plugins
 *
 * Events:
 *   'plugin:discovered' - { plugin: Plugin }
 *   'plugin:validated' - { plugin: Plugin }
 *   'plugin:validation-failed' - { plugin: Plugin, errors: Array }
 *   'plugin:loaded' - { plugin: Plugin }
 *   'plugin:load-failed' - { plugin: Plugin, error: Error }
 *   'plugins:discovery-complete' - { discovered: number }
 *   'plugins:complete' - { loaded: Plugin[], failed: Plugin[] }
 */
class PluginLoader extends EventEmitter {
  constructor(options = {}) {
    super()

    this.validator = new ManifestValidator()
    this.plugins = new Map()
    this.loadedPlugins = new Map()
    this.failedPlugins = new Map()

    // Default plugin directory: ~/.puffin/plugins/
    this.pluginsDir = options.pluginsDir || path.join(os.homedir(), '.puffin', 'plugins')

    // Track initialization state
    this.initialized = false
    this.loading = false
  }

  /**
   * Get the plugins directory path
   * @returns {string}
   */
  getPluginsDirectory() {
    return this.pluginsDir
  }

  /**
   * Ensure the plugins directory exists
   * @returns {Promise<void>}
   */
  async ensurePluginsDirectory() {
    try {
      await fs.mkdir(this.pluginsDir, { recursive: true })
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err
      }
    }
  }

  /**
   * Discover all plugins in the plugins directory
   * @returns {Promise<Plugin[]>} Array of discovered plugins
   */
  async discoverPlugins() {
    await this.ensurePluginsDirectory()

    const discovered = []

    try {
      const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue
        }

        const pluginDir = path.join(this.pluginsDir, entry.name)
        const manifestPath = path.join(pluginDir, 'puffin-plugin.json')

        try {
          await fs.access(manifestPath)

          // Read and parse manifest
          const content = await fs.readFile(manifestPath, 'utf-8')
          let manifest

          try {
            manifest = JSON.parse(content)
          } catch (parseError) {
            console.error(`[PluginLoader] Invalid JSON in ${manifestPath}:`, parseError.message)
            continue
          }

          const plugin = new Plugin(manifest, pluginDir)
          this.plugins.set(plugin.name, plugin)
          discovered.push(plugin)

          this.emit('plugin:discovered', { plugin })

        } catch (err) {
          // No manifest file, skip this directory
          if (err.code !== 'ENOENT') {
            console.error(`[PluginLoader] Error reading ${manifestPath}:`, err.message)
          }
        }
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log(`[PluginLoader] Plugins directory does not exist: ${this.pluginsDir}`)
      } else {
        console.error(`[PluginLoader] Error scanning plugins directory:`, err.message)
      }
    }

    this.emit('plugins:discovery-complete', { discovered: discovered.length })
    return discovered
  }

  /**
   * Validate all discovered plugins
   * @returns {Promise<{ valid: Plugin[], invalid: Plugin[] }>}
   */
  async validatePlugins() {
    const valid = []
    const invalid = []

    for (const plugin of this.plugins.values()) {
      const result = this.validator.validate(plugin.manifest)

      if (result.valid) {
        // Additional validation: check main entry point exists
        try {
          await fs.access(plugin.mainPath)

          // Parse view contributions from manifest
          const contributions = parseViewContributions(plugin.manifest, plugin.name)
          plugin.viewContributions = contributions.views
          plugin.contributionErrors = contributions.errors
          plugin.contributionWarnings = contributions.warnings

          // Log contribution errors/warnings if any
          if (contributions.errors.length > 0 || contributions.warnings.length > 0) {
            logContributionErrors(contributions.errors, contributions.warnings)
          }

          plugin.state = 'validated'
          valid.push(plugin)
          this.emit('plugin:validated', { plugin })
        } catch {
          plugin.state = 'error'
          const error = {
            field: 'main',
            message: `Entry point not found: ${plugin.main}`,
            suggestion: `Create the file "${plugin.main}" or update the "main" field`,
            keyword: 'file',
            value: plugin.main
          }
          plugin.error = error.message
          plugin.validationErrors = [error]
          invalid.push(plugin)
          this.logValidationErrors(plugin.name, [error])
          this.emit('plugin:validation-failed', { plugin, errors: [error] })
        }
      } else {
        plugin.state = 'error'
        plugin.error = result.errors.map(e => e.message).join('; ')
        plugin.validationErrors = result.errors
        invalid.push(plugin)
        this.logValidationErrors(plugin.name, result.errors)
        this.emit('plugin:validation-failed', { plugin, errors: result.errors })
      }
    }

    return { valid, invalid }
  }

  /**
   * Log validation errors in a developer-friendly format
   * @param {string} pluginName - Name of the plugin
   * @param {Array} errors - Array of validation errors
   * @private
   */
  logValidationErrors(pluginName, errors) {
    console.error(`[PluginLoader] Manifest validation failed for "${pluginName}":`)
    for (const error of errors) {
      console.error(`  ✗ ${error.message}`)
      if (error.field && error.field !== 'manifest') {
        console.error(`    Field: ${error.field}`)
      }
      if (error.value !== undefined && error.value !== null) {
        const displayValue = typeof error.value === 'string'
          ? `"${error.value}"`
          : JSON.stringify(error.value)
        console.error(`    Got: ${displayValue}`)
      }
      if (error.suggestion) {
        console.error(`    Suggestion: ${error.suggestion}`)
      }
    }
  }

  /**
   * Resolve plugin dependencies and return load order
   * Uses Kahn's algorithm for topological sort
   * @param {Plugin[]} plugins - Validated plugins
   * @returns {{ ordered: Plugin[], circular: string[], missing: Map<string, string[]> }}
   */
  resolveDependencies(plugins) {
    const pluginMap = new Map(plugins.map(p => [p.name, p]))
    const inDegree = new Map()
    const dependents = new Map() // plugin -> plugins that depend on it
    const missing = new Map() // plugin -> missing dependencies

    // Initialize
    for (const plugin of plugins) {
      inDegree.set(plugin.name, 0)
      dependents.set(plugin.name, [])
    }

    // Build dependency graph
    for (const plugin of plugins) {
      const deps = Object.keys(plugin.dependencies)

      for (const dep of deps) {
        if (pluginMap.has(dep)) {
          // Increment in-degree for this plugin (it depends on something)
          inDegree.set(plugin.name, inDegree.get(plugin.name) + 1)
          // Add this plugin to the dependents of the dependency
          dependents.get(dep).push(plugin.name)
        } else {
          // Missing dependency
          if (!missing.has(plugin.name)) {
            missing.set(plugin.name, [])
          }
          missing.get(plugin.name).push(dep)
        }
      }
    }

    // Kahn's algorithm
    const queue = []
    const ordered = []

    // Start with plugins that have no dependencies (in-degree = 0)
    for (const [name, degree] of inDegree) {
      if (degree === 0 && !missing.has(name)) {
        queue.push(name)
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()
      const plugin = pluginMap.get(current)

      if (plugin) {
        ordered.push(plugin)
      }

      // Reduce in-degree of dependents
      for (const dependent of dependents.get(current) || []) {
        inDegree.set(dependent, inDegree.get(dependent) - 1)
        if (inDegree.get(dependent) === 0 && !missing.has(dependent)) {
          queue.push(dependent)
        }
      }
    }

    // Check for circular dependencies
    const circular = []
    for (const [name, degree] of inDegree) {
      if (degree > 0 && !missing.has(name)) {
        circular.push(name)
      }
    }

    return { ordered, circular, missing }
  }

  /**
   * Load a single plugin module
   * @param {Plugin} plugin - Plugin to load
   * @returns {Promise<boolean>} Success status
   */
  async loadPlugin(plugin) {
    try {
      // Clear require cache to allow reloading
      delete require.cache[require.resolve(plugin.mainPath)]

      // Load the plugin module
      const pluginModule = require(plugin.mainPath)

      // Validate that the module exports required functions
      if (typeof pluginModule.activate !== 'function') {
        throw new Error('Plugin must export an activate() function')
      }

      plugin.module = pluginModule
      plugin.state = 'loaded'
      this.loadedPlugins.set(plugin.name, plugin)

      this.emit('plugin:loaded', { plugin })
      return true

    } catch (err) {
      plugin.state = 'error'
      plugin.error = err.message
      this.failedPlugins.set(plugin.name, plugin)

      this.emit('plugin:load-failed', { plugin, error: err })
      console.error(`[PluginLoader] Failed to load plugin "${plugin.name}":`, err.message)
      return false
    }
  }

  /**
   * Load all validated plugins in dependency order
   * @returns {Promise<{ loaded: Plugin[], failed: Plugin[] }>}
   */
  async loadPlugins() {
    if (this.loading) {
      throw new Error('Plugin loading already in progress')
    }

    this.loading = true
    const loaded = []
    const failed = []

    try {
      // Discover plugins
      await this.discoverPlugins()

      // Validate plugins
      const { valid, invalid } = await this.validatePlugins()
      failed.push(...invalid)

      // Resolve dependencies
      const { ordered, circular, missing } = this.resolveDependencies(valid)

      // Handle circular dependencies
      for (const name of circular) {
        const plugin = this.plugins.get(name)
        if (plugin) {
          plugin.state = 'error'
          plugin.error = 'Circular dependency detected'
          failed.push(plugin)
          this.failedPlugins.set(name, plugin)
          this.emit('plugin:load-failed', {
            plugin,
            error: new Error('Circular dependency detected')
          })
        }
      }

      // Handle missing dependencies
      for (const [name, deps] of missing) {
        const plugin = this.plugins.get(name)
        if (plugin) {
          plugin.state = 'error'
          plugin.error = `Missing dependencies: ${deps.join(', ')}`
          failed.push(plugin)
          this.failedPlugins.set(name, plugin)
          this.emit('plugin:load-failed', {
            plugin,
            error: new Error(plugin.error)
          })
        }
      }

      // Load plugins in order
      for (const plugin of ordered) {
        const success = await this.loadPlugin(plugin)
        if (success) {
          loaded.push(plugin)
        } else {
          failed.push(plugin)
        }
      }

      this.initialized = true
      this.emit('plugins:complete', { loaded, failed })

      console.log(`[PluginLoader] Loaded ${loaded.length} plugin(s), ${failed.length} failed`)

      return { loaded, failed }

    } finally {
      this.loading = false
    }
  }

  /**
   * Get a plugin by name
   * @param {string} name - Plugin name
   * @returns {Plugin|null}
   */
  getPlugin(name) {
    return this.plugins.get(name) || null
  }

  /**
   * Get all discovered plugins
   * @returns {Plugin[]}
   */
  getAllPlugins() {
    return Array.from(this.plugins.values())
  }

  /**
   * Get all loaded plugins
   * @returns {Plugin[]}
   */
  getLoadedPlugins() {
    return Array.from(this.loadedPlugins.values())
  }

  /**
   * Get all failed plugins
   * @returns {Plugin[]}
   */
  getFailedPlugins() {
    return Array.from(this.failedPlugins.values())
  }

  /**
   * Check if a plugin is loaded
   * @param {string} name - Plugin name
   * @returns {boolean}
   */
  isLoaded(name) {
    return this.loadedPlugins.has(name)
  }

  /**
   * Get plugin load errors for display
   * @returns {Array<{ name: string, displayName: string, error: string, validationErrors: Array|null }>}
   */
  getErrors() {
    const errors = []
    for (const plugin of this.failedPlugins.values()) {
      errors.push({
        name: plugin.name,
        displayName: plugin.displayName,
        error: plugin.error,
        validationErrors: plugin.validationErrors || null
      })
    }
    return errors
  }

  /**
   * Get formatted error messages for a plugin
   * @param {string} name - Plugin name
   * @returns {string|null} Formatted error message or null if no errors
   */
  getFormattedErrors(name) {
    const plugin = this.failedPlugins.get(name)
    if (!plugin) return null

    if (!plugin.validationErrors || plugin.validationErrors.length === 0) {
      return plugin.error
    }

    return this.validator.formatErrorsForDisplay(plugin.validationErrors, { verbose: true })
  }

  /**
   * Reload all plugins
   * @returns {Promise<{ loaded: Plugin[], failed: Plugin[] }>}
   */
  async reloadPlugins() {
    // Clear current state
    this.plugins.clear()
    this.loadedPlugins.clear()
    this.failedPlugins.clear()
    this.initialized = false

    // Load again
    return this.loadPlugins()
  }

  /**
   * Get summary of plugin states
   * @returns {Object}
   */
  getSummary() {
    return {
      total: this.plugins.size,
      loaded: this.loadedPlugins.size,
      failed: this.failedPlugins.size,
      pluginsDirectory: this.pluginsDir,
      initialized: this.initialized
    }
  }
}

module.exports = {
  PluginLoader,
  Plugin,
  PluginLoadState,
  PluginLifecycleState
}
