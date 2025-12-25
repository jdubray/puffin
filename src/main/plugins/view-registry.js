/**
 * View Registry
 *
 * Central registry for plugin view contributions.
 * Manages view registration, unregistration, and queries.
 * Coordinates between plugin lifecycle and renderer notifications.
 */

const { EventEmitter } = require('events')
const { validateViewContribution, VALID_VIEW_LOCATIONS } = require('./contribution-parser')

/**
 * ViewRegistry - Manages registered plugin views
 *
 * Events:
 *   'view:registered' - { view, pluginName }
 *   'view:unregistered' - { viewId, pluginName }
 *   'views:cleared' - { pluginName }
 */
class ViewRegistry extends EventEmitter {
  constructor() {
    super()

    // Map of viewId -> view object
    this.views = new Map()

    // Map of pluginName -> Set of viewIds (for cleanup)
    this.pluginViews = new Map()
  }

  /**
   * Register a view contribution
   * @param {string} pluginName - Name of the plugin registering the view
   * @param {Object} viewConfig - View configuration object
   * @returns {{ success: boolean, viewId?: string, error?: string }}
   */
  registerView(pluginName, viewConfig) {
    // Validate the view configuration
    const errors = validateViewContribution(viewConfig, 'view', pluginName)
    if (errors.length > 0) {
      const errorMessage = errors.join('; ')
      console.error(`[ViewRegistry] Validation failed for view from ${pluginName}:`, errorMessage)
      return { success: false, error: errorMessage }
    }

    // Create qualified view ID
    const viewId = `${pluginName}:${viewConfig.id}`

    // Check for duplicate
    if (this.views.has(viewId)) {
      const error = `View ID "${viewId}" is already registered`
      console.error(`[ViewRegistry] ${error}`)
      return { success: false, error }
    }

    // Build the view object
    const view = {
      id: viewId,
      localId: viewConfig.id,
      name: viewConfig.name,
      location: viewConfig.location,
      pluginName,
      registeredAt: new Date().toISOString()
    }

    // Add optional properties
    if (viewConfig.icon) view.icon = viewConfig.icon
    if (typeof viewConfig.order === 'number') view.order = viewConfig.order
    if (viewConfig.when) view.when = viewConfig.when
    if (viewConfig.component) view.component = viewConfig.component

    // Store the view
    this.views.set(viewId, view)

    // Track by plugin
    if (!this.pluginViews.has(pluginName)) {
      this.pluginViews.set(pluginName, new Set())
    }
    this.pluginViews.get(pluginName).add(viewId)

    console.log(`[ViewRegistry] Registered view "${viewId}" at location "${view.location}"`)

    // Emit event
    this.emit('view:registered', { view, pluginName })

    return { success: true, viewId }
  }

  /**
   * Register multiple views from a plugin's parsed contributions
   * @param {string} pluginName - Name of the plugin
   * @param {Array} parsedViews - Array of parsed view objects (already validated)
   * @returns {{ registered: string[], errors: string[] }}
   */
  registerViews(pluginName, parsedViews) {
    const registered = []
    const errors = []

    for (const view of parsedViews) {
      // Check for duplicate (using the already-qualified ID)
      if (this.views.has(view.id)) {
        errors.push(`View ID "${view.id}" is already registered`)
        continue
      }

      // Store the view with registration timestamp
      const registeredView = {
        ...view,
        registeredAt: new Date().toISOString()
      }
      this.views.set(view.id, registeredView)

      // Track by plugin
      if (!this.pluginViews.has(pluginName)) {
        this.pluginViews.set(pluginName, new Set())
      }
      this.pluginViews.get(pluginName).add(view.id)

      registered.push(view.id)

      console.log(`[ViewRegistry] Registered view "${view.id}" at location "${view.location}"`)

      // Emit event
      this.emit('view:registered', { view: registeredView, pluginName })
    }

    return { registered, errors }
  }

  /**
   * Unregister a view by ID
   * @param {string} viewId - Qualified view ID (pluginName:viewId)
   * @returns {{ success: boolean, error?: string }}
   */
  unregisterView(viewId) {
    const view = this.views.get(viewId)
    if (!view) {
      return { success: false, error: `View not found: ${viewId}` }
    }

    const pluginName = view.pluginName

    // Remove from views map
    this.views.delete(viewId)

    // Remove from plugin tracking
    const pluginViewSet = this.pluginViews.get(pluginName)
    if (pluginViewSet) {
      pluginViewSet.delete(viewId)
      if (pluginViewSet.size === 0) {
        this.pluginViews.delete(pluginName)
      }
    }

    console.log(`[ViewRegistry] Unregistered view "${viewId}"`)

    // Emit event
    this.emit('view:unregistered', { viewId, pluginName })

    return { success: true }
  }

  /**
   * Unregister all views from a plugin
   * @param {string} pluginName - Plugin name
   * @returns {{ unregistered: string[] }}
   */
  unregisterPluginViews(pluginName) {
    const viewIds = this.pluginViews.get(pluginName)
    const unregistered = []

    if (!viewIds || viewIds.size === 0) {
      return { unregistered }
    }

    // Copy to array before modifying
    const idsToRemove = Array.from(viewIds)

    for (const viewId of idsToRemove) {
      this.views.delete(viewId)
      unregistered.push(viewId)
      this.emit('view:unregistered', { viewId, pluginName })
    }

    // Clear plugin tracking
    this.pluginViews.delete(pluginName)

    console.log(`[ViewRegistry] Unregistered ${unregistered.length} views from plugin "${pluginName}"`)

    // Emit cleared event
    this.emit('views:cleared', { pluginName })

    return { unregistered }
  }

  /**
   * Get a view by ID
   * @param {string} viewId - Qualified view ID
   * @returns {Object|null}
   */
  getView(viewId) {
    return this.views.get(viewId) || null
  }

  /**
   * Get all views at a specific location
   * @param {string} location - Location name (sidebar, panel, etc.)
   * @returns {Object[]} Views sorted by order
   */
  getViewsByLocation(location) {
    const views = []
    for (const view of this.views.values()) {
      if (view.location === location) {
        views.push(view)
      }
    }
    return views.sort((a, b) => (a.order || 100) - (b.order || 100))
  }

  /**
   * Get all sidebar views
   * @returns {Object[]} Views sorted by order
   */
  getSidebarViews() {
    return this.getViewsByLocation('sidebar')
  }

  /**
   * Get all views from a plugin
   * @param {string} pluginName - Plugin name
   * @returns {Object[]}
   */
  getPluginViews(pluginName) {
    const viewIds = this.pluginViews.get(pluginName)
    if (!viewIds) return []

    const views = []
    for (const viewId of viewIds) {
      const view = this.views.get(viewId)
      if (view) views.push(view)
    }
    return views
  }

  /**
   * Get all registered views
   * @returns {Object[]}
   */
  getAllViews() {
    return Array.from(this.views.values())
  }

  /**
   * Check if a view is registered
   * @param {string} viewId - Qualified view ID
   * @returns {boolean}
   */
  hasView(viewId) {
    return this.views.has(viewId)
  }

  /**
   * Get view count
   * @returns {number}
   */
  getViewCount() {
    return this.views.size
  }

  /**
   * Get summary of registered views
   * @returns {Object}
   */
  getSummary() {
    const byLocation = {}
    for (const location of VALID_VIEW_LOCATIONS) {
      byLocation[location] = this.getViewsByLocation(location).length
    }

    return {
      total: this.views.size,
      plugins: this.pluginViews.size,
      byLocation
    }
  }

  /**
   * Clear all registered views
   */
  clear() {
    const plugins = Array.from(this.pluginViews.keys())

    this.views.clear()
    this.pluginViews.clear()

    for (const pluginName of plugins) {
      this.emit('views:cleared', { pluginName })
    }

    console.log('[ViewRegistry] Cleared all registered views')
  }
}

module.exports = { ViewRegistry }
