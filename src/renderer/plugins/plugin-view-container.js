/**
 * Plugin View Container
 *
 * Manages the rendering and lifecycle of plugin view content.
 * Handles loading plugin components and rendering them in the view area.
 */

import { pluginLifecycleManager } from './plugin-lifecycle-manager.js'
import { pluginContextProxy } from './plugin-context-proxy.js'

/**
 * PluginViewContainer - Manages plugin view content rendering
 */
export class PluginViewContainer {
  constructor() {
    // Container element
    this.container = null

    // Track loaded components
    this.loadedComponents = new Map() // viewId -> component instance

    // Plugin component registry (populated by plugins)
    this.componentRegistry = new Map() // componentName -> component class/function

    // Lifecycle manager reference
    this.lifecycleManager = pluginLifecycleManager

    // Context proxy reference
    this.contextProxy = pluginContextProxy
  }

  /**
   * Initialize the plugin view container
   */
  init() {
    this.container = document.getElementById('plugin-view-container')

    if (!this.container) {
      console.warn('[PluginViewContainer] Container element not found')
    }

    console.log('[PluginViewContainer] Initialized')
  }

  /**
   * Register a plugin component
   * @param {string} name - Component name (matches view.component in manifest)
   * @param {Function|Object} component - Component class or factory
   */
  registerComponent(name, component) {
    this.componentRegistry.set(name, component)
    console.log(`[PluginViewContainer] Registered component: ${name}`)
  }

  /**
   * Unregister a plugin component
   * @param {string} name - Component name
   */
  unregisterComponent(name) {
    this.componentRegistry.delete(name)
    console.log(`[PluginViewContainer] Unregistered component: ${name}`)
  }

  /**
   * Render a plugin view
   * @param {string} viewId - View ID
   * @param {Object} view - View configuration
   * @param {HTMLElement} viewElement - View panel element
   * @returns {Promise<Object|null>} Component instance or null
   */
  async renderView(viewId, view, viewElement) {
    // Check if component is specified
    if (!view.component) {
      // No component specified, leave placeholder
      return null
    }

    // Check if component is registered
    const ComponentClass = this.componentRegistry.get(view.component)
    if (!ComponentClass) {
      console.warn(`[PluginViewContainer] Component not registered: ${view.component}`)
      this.showComponentNotFound(viewElement, view.component)
      return null
    }

    try {
      // Clear placeholder
      viewElement.innerHTML = ''

      // Create component wrapper
      const wrapper = document.createElement('div')
      wrapper.className = 'plugin-component-wrapper'
      viewElement.appendChild(wrapper)

      // Create context for this view
      const context = this.contextProxy.createContext({
        pluginName: view.pluginName,
        viewId,
        view
      })

      // Instantiate component
      let instance
      if (typeof ComponentClass === 'function') {
        // Check if it's a class (has prototype) or factory function
        if (ComponentClass.prototype && ComponentClass.prototype.constructor) {
          instance = new ComponentClass(wrapper, {
            viewId,
            view,
            pluginName: view.pluginName,
            context
          })
        } else {
          // Factory function
          instance = ComponentClass(wrapper, {
            viewId,
            view,
            pluginName: view.pluginName,
            context
          })
        }
      }

      // Store pluginName on instance for tracking
      if (instance) {
        instance.pluginName = view.pluginName
        instance._context = context
      }

      // Initialize if method exists
      if (instance && typeof instance.init === 'function') {
        await instance.init()
      }

      // Store reference
      this.loadedComponents.set(viewId, instance)

      console.log(`[PluginViewContainer] Rendered component ${view.component} for view ${viewId}`)

      return instance

    } catch (error) {
      console.error(`[PluginViewContainer] Failed to render component:`, error)
      this.showComponentError(viewElement, view.component, error)
      return null
    }
  }

  /**
   * Show component not found message
   * @param {HTMLElement} element - Container element
   * @param {string} componentName - Component name
   */
  showComponentNotFound(element, componentName) {
    element.innerHTML = `
      <div class="plugin-view-error">
        <span class="error-icon">⚠️</span>
        <h3>Component Not Found</h3>
        <p>The component <code>${this.escapeHtml(componentName)}</code> is not registered.</p>
        <p class="error-hint">Make sure the plugin has loaded its renderer components.</p>
      </div>
    `
  }

  /**
   * Show component error message
   * @param {HTMLElement} element - Container element
   * @param {string} componentName - Component name
   * @param {Error} error - Error object
   */
  showComponentError(element, componentName, error) {
    element.innerHTML = `
      <div class="plugin-view-error">
        <span class="error-icon">❌</span>
        <h3>Component Error</h3>
        <p>Failed to render <code>${this.escapeHtml(componentName)}</code></p>
        <pre class="error-message">${this.escapeHtml(error.message)}</pre>
      </div>
    `
  }

  /**
   * Destroy a view's component
   * Calls onDestroy lifecycle hook before cleanup
   * @param {string} viewId - View ID
   * @returns {Promise<void>}
   */
  async destroyView(viewId) {
    const instance = this.loadedComponents.get(viewId)
    if (instance) {
      // Get context for lifecycle hook
      const context = instance._context || null

      // Call onDestroy lifecycle hook via manager
      await this.lifecycleManager.callDestroy(viewId, instance, context)

      // Call destroy if method exists (legacy support)
      if (typeof instance.destroy === 'function') {
        try {
          instance.destroy()
        } catch (error) {
          console.error(`[PluginViewContainer] Error destroying component:`, error)
        }
      }

      // Clear context cache
      if (instance.pluginName) {
        this.contextProxy.clearContext(instance.pluginName, viewId)
      }

      this.loadedComponents.delete(viewId)
      console.log(`[PluginViewContainer] Destroyed component for view: ${viewId}`)
    }
  }

  /**
   * Activate a view's component (trigger onActivate lifecycle)
   * @param {string} viewId - View ID
   * @returns {Promise<boolean>} Success status
   */
  async activateView(viewId) {
    const instance = this.loadedComponents.get(viewId)
    if (!instance) {
      console.warn(`[PluginViewContainer] No component for view: ${viewId}`)
      return false
    }

    const context = instance._context || null
    return this.lifecycleManager.callActivate(viewId, instance, context)
  }

  /**
   * Deactivate a view's component (trigger onDeactivate lifecycle)
   * @param {string} viewId - View ID
   * @returns {Promise<boolean>} Success status
   */
  async deactivateView(viewId) {
    const instance = this.loadedComponents.get(viewId)
    if (!instance) {
      console.warn(`[PluginViewContainer] No component for view: ${viewId}`)
      return false
    }

    const context = instance._context || null
    return this.lifecycleManager.callDeactivate(viewId, instance, context)
  }

  /**
   * Destroy all components from a plugin
   * @param {string} pluginName - Plugin name
   * @returns {Promise<void>}
   */
  async destroyPluginComponents(pluginName) {
    const toDestroy = []

    for (const [viewId, instance] of this.loadedComponents) {
      // Check if this view belongs to the plugin
      if (instance && instance.pluginName === pluginName) {
        toDestroy.push(viewId)
      }
    }

    // Destroy all concurrently
    await Promise.all(toDestroy.map(viewId => this.destroyView(viewId)))

    // Clear all contexts for this plugin
    this.contextProxy.clearPluginContexts(pluginName)
  }

  /**
   * Unregister all components from a plugin and destroy instances
   * Called when a plugin is disabled or unloaded
   * @param {string} pluginName - Plugin name
   * @param {string[]} componentNames - List of component names to unregister
   * @returns {Promise<void>}
   */
  async unregisterPluginComponents(pluginName, componentNames = []) {
    // First destroy all active component instances from this plugin
    await this.destroyPluginComponents(pluginName)

    // Then unregister the component classes
    for (const name of componentNames) {
      this.unregisterComponent(name)
    }

    console.log(`[PluginViewContainer] Unregistered ${componentNames.length} components from ${pluginName}`)
  }

  /**
   * Get a loaded component instance
   * @param {string} viewId - View ID
   * @returns {Object|null}
   */
  getComponent(viewId) {
    return this.loadedComponents.get(viewId) || null
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string}
   */
  escapeHtml(str) {
    if (!str) return ''
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  /**
   * Cleanup and destroy
   * @returns {Promise<void>}
   */
  async destroy() {
    // Destroy all components
    const viewIds = Array.from(this.loadedComponents.keys())
    await Promise.all(viewIds.map(viewId => this.destroyView(viewId)))

    // Clear registries
    this.componentRegistry.clear()

    // Cleanup lifecycle manager
    this.lifecycleManager.destroy()

    // Cleanup context proxy
    this.contextProxy.destroy()

    console.log('[PluginViewContainer] Destroyed')
  }
}

// Export singleton instance
export const pluginViewContainer = new PluginViewContainer()
