/**
 * Plugin Registry
 *
 * Central registry for tracking all plugin registrations.
 * Enables plugin-to-plugin communication and provides
 * access to registered handlers for the SAM pattern integration.
 */

const { EventEmitter } = require('events')

/**
 * PluginRegistry - Tracks all plugin registrations
 */
class PluginRegistry extends EventEmitter {
  constructor() {
    super()

    // Maps: qualifiedName -> { pluginName, handler }
    this.actions = new Map()
    this.acceptors = new Map()
    this.reactors = new Map()
    this.components = new Map()
    this.ipcHandlers = new Map()

    // Track registrations per plugin for cleanup
    this.pluginRegistrations = new Map()

    // Event subscriptions: eventName -> [{ pluginName, handler }]
    this.subscriptions = new Map()
  }

  // ═══════════════════════════════════════════════════════════════
  // REGISTRATION METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Register an action
   * @param {string} pluginName - Plugin that owns this registration
   * @param {string} name - Qualified action name
   * @param {Function} handler - Action handler
   */
  registerAction(pluginName, name, handler) {
    this.actions.set(name, { pluginName, handler })
    this._trackRegistration(pluginName, 'actions', name)
    this.emit('action:registered', { pluginName, name })
  }

  /**
   * Register an acceptor
   * @param {string} pluginName - Plugin that owns this registration
   * @param {string} name - Qualified acceptor name
   * @param {Function} handler - Acceptor handler
   */
  registerAcceptor(pluginName, name, handler) {
    this.acceptors.set(name, { pluginName, handler })
    this._trackRegistration(pluginName, 'acceptors', name)
    this.emit('acceptor:registered', { pluginName, name })
  }

  /**
   * Register a reactor
   * @param {string} pluginName - Plugin that owns this registration
   * @param {string} name - Qualified reactor name
   * @param {Function} handler - Reactor handler
   */
  registerReactor(pluginName, name, handler) {
    this.reactors.set(name, { pluginName, handler })
    this._trackRegistration(pluginName, 'reactors', name)
    this.emit('reactor:registered', { pluginName, name })
  }

  /**
   * Register a component
   * @param {string} pluginName - Plugin that owns this registration
   * @param {string} name - Qualified component name
   * @param {Object|Function} component - Component class or factory
   */
  registerComponent(pluginName, name, component) {
    this.components.set(name, { pluginName, component })
    this._trackRegistration(pluginName, 'components', name)
    this.emit('component:registered', { pluginName, name })
  }

  /**
   * Register an IPC handler
   * @param {string} pluginName - Plugin that owns this registration
   * @param {string} channel - IPC channel
   * @param {Function} handler - IPC handler
   */
  registerIpcHandler(pluginName, channel, handler) {
    this.ipcHandlers.set(channel, { pluginName, handler })
    this._trackRegistration(pluginName, 'ipcHandlers', channel)
    this.emit('ipcHandler:registered', { pluginName, channel })
  }

  // ═══════════════════════════════════════════════════════════════
  // RETRIEVAL METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get an action handler by name
   * @param {string} name - Action name
   * @returns {Function|null}
   */
  getAction(name) {
    const entry = this.actions.get(name)
    return entry ? entry.handler : null
  }

  /**
   * Get all registered actions
   * @returns {Array<{ name: string, pluginName: string }>}
   */
  getAllActions() {
    return Array.from(this.actions.entries()).map(([name, entry]) => ({
      name,
      pluginName: entry.pluginName
    }))
  }

  /**
   * Get an acceptor handler by name
   * @param {string} name - Acceptor name
   * @returns {Function|null}
   */
  getAcceptor(name) {
    const entry = this.acceptors.get(name)
    return entry ? entry.handler : null
  }

  /**
   * Get all registered acceptors
   * @returns {Array<{ name: string, pluginName: string }>}
   */
  getAllAcceptors() {
    return Array.from(this.acceptors.entries()).map(([name, entry]) => ({
      name,
      pluginName: entry.pluginName
    }))
  }

  /**
   * Get all acceptor handlers (for SAM integration)
   * @returns {Function[]}
   */
  getAcceptorHandlers() {
    return Array.from(this.acceptors.values()).map(entry => entry.handler)
  }

  /**
   * Get a reactor handler by name
   * @param {string} name - Reactor name
   * @returns {Function|null}
   */
  getReactor(name) {
    const entry = this.reactors.get(name)
    return entry ? entry.handler : null
  }

  /**
   * Get all registered reactors
   * @returns {Array<{ name: string, pluginName: string }>}
   */
  getAllReactors() {
    return Array.from(this.reactors.entries()).map(([name, entry]) => ({
      name,
      pluginName: entry.pluginName
    }))
  }

  /**
   * Get a component by name
   * @param {string} name - Component name
   * @returns {Object|Function|null}
   */
  getComponent(name) {
    const entry = this.components.get(name)
    return entry ? entry.component : null
  }

  /**
   * Get all registered components
   * @returns {Array<{ name: string, pluginName: string }>}
   */
  getAllComponents() {
    return Array.from(this.components.entries()).map(([name, entry]) => ({
      name,
      pluginName: entry.pluginName
    }))
  }

  // ═══════════════════════════════════════════════════════════════
  // PLUGIN-TO-PLUGIN COMMUNICATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Subscribe to an event
   * @param {string} eventName - Event name
   * @param {string} pluginName - Subscribing plugin
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  subscribe(eventName, pluginName, handler) {
    if (!this.subscriptions.has(eventName)) {
      this.subscriptions.set(eventName, [])
    }

    const subscription = { pluginName, handler }
    this.subscriptions.get(eventName).push(subscription)

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(eventName)
      if (subs) {
        const index = subs.indexOf(subscription)
        if (index !== -1) {
          subs.splice(index, 1)
        }
      }
    }
  }

  /**
   * Emit an event to all subscribers
   * @param {string} eventName - Event name
   * @param {string} sourcePlugin - Plugin emitting the event
   * @param {any} data - Event data
   */
  emitPluginEvent(eventName, sourcePlugin, data) {
    const subs = this.subscriptions.get(eventName)
    if (!subs) return

    for (const { pluginName, handler } of subs) {
      try {
        handler({ source: sourcePlugin, data })
      } catch (error) {
        console.error(`[PluginRegistry] Error in event handler for "${eventName}" in plugin "${pluginName}":`, error.message)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Track a registration for a plugin
   * @private
   */
  _trackRegistration(pluginName, type, name) {
    if (!this.pluginRegistrations.has(pluginName)) {
      this.pluginRegistrations.set(pluginName, {
        actions: [],
        acceptors: [],
        reactors: [],
        components: [],
        ipcHandlers: []
      })
    }
    this.pluginRegistrations.get(pluginName)[type].push(name)
  }

  /**
   * Unregister all registrations for a plugin
   * @param {string} pluginName - Plugin to unregister
   */
  unregisterPlugin(pluginName) {
    const registrations = this.pluginRegistrations.get(pluginName)
    if (!registrations) return

    // Remove actions
    for (const name of registrations.actions) {
      this.actions.delete(name)
    }

    // Remove acceptors
    for (const name of registrations.acceptors) {
      this.acceptors.delete(name)
    }

    // Remove reactors
    for (const name of registrations.reactors) {
      this.reactors.delete(name)
    }

    // Remove components
    for (const name of registrations.components) {
      this.components.delete(name)
    }

    // Remove IPC handlers
    for (const channel of registrations.ipcHandlers) {
      this.ipcHandlers.delete(channel)
    }

    // Remove event subscriptions
    for (const [eventName, subs] of this.subscriptions) {
      this.subscriptions.set(
        eventName,
        subs.filter(s => s.pluginName !== pluginName)
      )
    }

    // Clear plugin tracking
    this.pluginRegistrations.delete(pluginName)

    this.emit('plugin:unregistered', { pluginName })
  }

  /**
   * Get registrations summary for a plugin
   * @param {string} pluginName - Plugin name
   * @returns {Object|null}
   */
  getPluginRegistrations(pluginName) {
    const registrations = this.pluginRegistrations.get(pluginName)
    if (!registrations) return null

    return {
      actions: registrations.actions.length,
      acceptors: registrations.acceptors.length,
      reactors: registrations.reactors.length,
      components: registrations.components.length,
      ipcHandlers: registrations.ipcHandlers.length
    }
  }

  /**
   * Get full registry summary
   * @returns {Object}
   */
  getSummary() {
    return {
      plugins: this.pluginRegistrations.size,
      actions: this.actions.size,
      acceptors: this.acceptors.size,
      reactors: this.reactors.size,
      components: this.components.size,
      ipcHandlers: this.ipcHandlers.size,
      subscriptions: this.subscriptions.size
    }
  }

  /**
   * Clear all registrations
   */
  clear() {
    this.actions.clear()
    this.acceptors.clear()
    this.reactors.clear()
    this.components.clear()
    this.ipcHandlers.clear()
    this.pluginRegistrations.clear()
    this.subscriptions.clear()
    this.emit('registry:cleared')
  }
}

module.exports = { PluginRegistry }
