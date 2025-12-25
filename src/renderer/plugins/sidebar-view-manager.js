/**
 * Sidebar View Manager
 *
 * Manages plugin sidebar tabs, nav tabs, and view switching.
 * Integrates with the ViewRegistry via IPC to dynamically add/remove plugin views.
 */

import { pluginViewContainer } from './plugin-view-container.js'

/**
 * SidebarViewManager - Manages plugin sidebar and navigation tabs
 */
export class SidebarViewManager {
  constructor() {
    // Container elements
    this.sidebarContainer = null
    this.navContainer = null
    this.viewContainer = null

    // Track registered views
    this.views = new Map() // viewId -> { view, tabElement, viewElement }

    // Current active plugin view (null if built-in view is active)
    this.activePluginView = null

    // Event cleanup functions
    this.cleanupFns = []

    // Callback for view activation
    this.onViewActivate = null
  }

  /**
   * Initialize the sidebar view manager
   * @param {Object} options
   * @param {Function} options.onViewActivate - Callback when a plugin view is activated
   */
  async init(options = {}) {
    this.onViewActivate = options.onViewActivate || null

    // Get or create container elements
    this.sidebarContainer = document.getElementById('plugin-sidebar-views')
    this.navContainer = document.getElementById('main-nav')
    this.viewContainer = document.getElementById('plugin-view-container')

    if (!this.sidebarContainer) {
      console.warn('[SidebarViewManager] Plugin sidebar container not found')
    }

    if (!this.navContainer) {
      console.warn('[SidebarViewManager] Main nav container not found')
    }

    // Subscribe to view registration events from main process
    this.subscribeToEvents()

    // Load existing views
    await this.loadExistingViews()

    console.log('[SidebarViewManager] Initialized')
  }

  /**
   * Subscribe to IPC events for view changes
   */
  subscribeToEvents() {
    if (!window.puffin || !window.puffin.plugins) {
      console.warn('[SidebarViewManager] puffin.plugins API not available')
      return
    }

    // View registered
    const unsubRegistered = window.puffin.plugins.onViewRegistered((data) => {
      console.log('[SidebarViewManager] View registered:', data.view.id)
      this.addView(data.view)
    })
    this.cleanupFns.push(unsubRegistered)

    // View unregistered
    const unsubUnregistered = window.puffin.plugins.onViewUnregistered((data) => {
      console.log('[SidebarViewManager] View unregistered:', data.viewId)
      this.removeView(data.viewId)
    })
    this.cleanupFns.push(unsubUnregistered)

    // Views cleared (plugin disabled)
    const unsubCleared = window.puffin.plugins.onViewsCleared((data) => {
      console.log('[SidebarViewManager] Views cleared for plugin:', data.pluginName)
      this.removePluginViews(data.pluginName)
    })
    this.cleanupFns.push(unsubCleared)
  }

  /**
   * Load existing registered views from the registry
   */
  async loadExistingViews() {
    if (!window.puffin || !window.puffin.plugins) {
      return
    }

    try {
      // Load sidebar views
      const sidebarResult = await window.puffin.plugins.getSidebarViews()
      if (sidebarResult.success && sidebarResult.views) {
        for (const view of sidebarResult.views) {
          this.addView(view)
        }
        console.log(`[SidebarViewManager] Loaded ${sidebarResult.views.length} sidebar views`)
      }

      // Load nav views
      const navResult = await window.puffin.plugins.getViewsByLocation('nav')
      if (navResult.success && navResult.views) {
        for (const view of navResult.views) {
          this.addView(view)
        }
        console.log(`[SidebarViewManager] Loaded ${navResult.views.length} nav views`)
      }
    } catch (error) {
      console.error('[SidebarViewManager] Failed to load existing views:', error)
    }
  }

  /**
   * Add a view to the appropriate location
   * @param {Object} view - View configuration from registry
   */
  addView(view) {
    if (this.views.has(view.id)) {
      console.warn(`[SidebarViewManager] View already exists: ${view.id}`)
      return
    }

    // Create tab element based on location
    let tabElement
    if (view.location === 'nav') {
      tabElement = this.createNavTab(view)
    } else {
      tabElement = this.createSidebarTab(view)
    }

    // Create view container
    const viewElement = this.createViewContainer(view)

    // Store references
    this.views.set(view.id, {
      view,
      tabElement,
      viewElement
    })

    // Add to DOM based on location
    if (view.location === 'nav') {
      if (this.navContainer) {
        // Insert before the hidden debug button if it exists
        const debugBtn = this.navContainer.querySelector('#debug-nav-btn')
        if (debugBtn) {
          this.navContainer.insertBefore(tabElement, debugBtn)
        } else {
          this.navContainer.appendChild(tabElement)
        }
      }
    } else {
      if (this.sidebarContainer) {
        this.sidebarContainer.appendChild(tabElement)
      }
    }

    if (this.viewContainer) {
      this.viewContainer.appendChild(viewElement)
    }

    console.log(`[SidebarViewManager] Added view: ${view.id} at location: ${view.location}`)
  }

  /**
   * Create a sidebar tab element for a view
   * @param {Object} view - View configuration
   * @returns {HTMLElement}
   */
  createSidebarTab(view) {
    const section = document.createElement('div')
    section.className = 'sidebar-section plugin-sidebar-section'
    section.dataset.viewId = view.id
    section.dataset.pluginName = view.pluginName

    // Create header with icon and name
    const header = document.createElement('div')
    header.className = 'plugin-sidebar-header'

    // Icon
    if (view.icon) {
      const icon = document.createElement('span')
      icon.className = 'plugin-sidebar-icon'
      icon.textContent = this.getIconDisplay(view.icon)
      header.appendChild(icon)
    }

    // Name
    const name = document.createElement('h3')
    name.className = 'plugin-sidebar-title'
    name.textContent = view.name
    header.appendChild(name)

    section.appendChild(header)

    // Click handler
    section.addEventListener('click', () => {
      this.activateView(view.id)
    })

    return section
  }

  /**
   * Create a nav tab element for a view (main navigation bar)
   * @param {Object} view - View configuration
   * @returns {HTMLElement}
   */
  createNavTab(view) {
    const button = document.createElement('button')
    button.className = 'nav-btn plugin-nav-btn'
    button.dataset.viewId = view.id
    button.dataset.pluginName = view.pluginName

    // Use icon + name or just name
    if (view.icon) {
      button.textContent = `${this.getIconDisplay(view.icon)} ${view.name}`
    } else {
      button.textContent = view.name
    }

    // Click handler
    button.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.activateView(view.id)
    })

    return button
  }

  /**
   * Create a view container element
   * @param {Object} view - View configuration
   * @returns {HTMLElement}
   */
  createViewContainer(view) {
    const container = document.createElement('div')
    container.className = 'plugin-view-panel'
    container.id = `plugin-view-${view.id.replace(':', '-')}`
    container.dataset.viewId = view.id
    container.dataset.pluginName = view.pluginName

    // Add placeholder content
    const placeholder = document.createElement('div')
    placeholder.className = 'plugin-view-placeholder'
    placeholder.innerHTML = `
      <h2>${this.escapeHtml(view.name)}</h2>
      <p>Plugin view from <strong>${this.escapeHtml(view.pluginName)}</strong></p>
      ${view.component ? `<p class="plugin-component-info">Component: ${this.escapeHtml(view.component)}</p>` : ''}
    `
    container.appendChild(placeholder)

    return container
  }

  /**
   * Get icon display (support for emoji, icon names, etc.)
   * @param {string} icon - Icon value
   * @returns {string}
   */
  getIconDisplay(icon) {
    // Common icon mappings
    const iconMap = {
      chart: '📊',
      analytics: '📈',
      dashboard: '📋',
      settings: '⚙️',
      plugin: '🔌',
      code: '💻',
      file: '📄',
      folder: '📁',
      star: '⭐',
      heart: '❤️',
      lightning: '⚡',
      clock: '🕐',
      calendar: '📅',
      user: '👤',
      users: '👥',
      search: '🔍',
      filter: '🔎',
      bell: '🔔',
      mail: '📧',
      message: '💬',
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      success: '✅',
      play: '▶️',
      pause: '⏸️',
      stop: '⏹️'
    }

    // If it's a known icon name, use the mapping
    if (iconMap[icon]) {
      return iconMap[icon]
    }

    // If it looks like an emoji or short string, use as-is
    if (icon.length <= 4) {
      return icon
    }

    // Default fallback
    return '🔌'
  }

  /**
   * Remove a view from the sidebar
   * @param {string} viewId - View ID to remove
   */
  removeView(viewId) {
    const entry = this.views.get(viewId)
    if (!entry) {
      return
    }

    // Remove from DOM
    if (entry.tabElement && entry.tabElement.parentNode) {
      entry.tabElement.parentNode.removeChild(entry.tabElement)
    }

    if (entry.viewElement && entry.viewElement.parentNode) {
      entry.viewElement.parentNode.removeChild(entry.viewElement)
    }

    // If this was the active view, deactivate
    if (this.activePluginView === viewId) {
      this.deactivateCurrentView()
    }

    // Remove from tracking
    this.views.delete(viewId)

    console.log(`[SidebarViewManager] Removed view: ${viewId}`)
  }

  /**
   * Remove all views from a plugin
   * @param {string} pluginName - Plugin name
   */
  removePluginViews(pluginName) {
    const viewsToRemove = []

    for (const [viewId, entry] of this.views) {
      if (entry.view.pluginName === pluginName) {
        viewsToRemove.push(viewId)
      }
    }

    for (const viewId of viewsToRemove) {
      this.removeView(viewId)
    }
  }

  /**
   * Activate a plugin view
   * Triggers onDeactivate on previous view and onActivate on new view
   * @param {string} viewId - View ID to activate
   */
  async activateView(viewId) {
    const entry = this.views.get(viewId)
    if (!entry) {
      console.warn(`[SidebarViewManager] View not found: ${viewId}`)
      return
    }

    // Deactivate current view first (triggers onDeactivate lifecycle)
    await this.deactivateCurrentView()

    // Mark tab as active
    entry.tabElement.classList.add('active')

    // Show view panel
    entry.viewElement.classList.add('active')

    // Hide built-in views
    this.hideBuiltInViews()

    // Show the plugin view container
    if (this.viewContainer) {
      this.viewContainer.classList.add('has-active-view')
    }

    // Track active view
    this.activePluginView = viewId

    // Render the component if not already rendered
    const existingComponent = pluginViewContainer.getComponent(viewId)
    if (!existingComponent && entry.view.component) {
      await pluginViewContainer.renderView(viewId, entry.view, entry.viewElement)
    }

    // Trigger onActivate lifecycle hook
    await pluginViewContainer.activateView(viewId)

    // Notify callback
    if (this.onViewActivate) {
      this.onViewActivate(viewId, entry.view)
    }

    console.log(`[SidebarViewManager] Activated view: ${viewId}`)
  }

  /**
   * Deactivate the current plugin view
   * Triggers onDeactivate lifecycle hook
   * @returns {Promise<void>}
   */
  async deactivateCurrentView() {
    if (!this.activePluginView) {
      return
    }

    const previousViewId = this.activePluginView

    const entry = this.views.get(this.activePluginView)
    if (entry) {
      entry.tabElement.classList.remove('active')
      entry.viewElement.classList.remove('active')
    }

    this.activePluginView = null

    // Hide the plugin view container
    if (this.viewContainer) {
      this.viewContainer.classList.remove('has-active-view')
    }

    // Trigger onDeactivate lifecycle hook
    await pluginViewContainer.deactivateView(previousViewId)
  }

  /**
   * Hide all built-in views (when plugin view is activated)
   */
  hideBuiltInViews() {
    const builtInViews = document.querySelectorAll('#view-container > .view')
    for (const view of builtInViews) {
      view.classList.remove('active')
    }

    // Also deactivate nav buttons
    const navBtns = document.querySelectorAll('#main-nav .nav-btn')
    for (const btn of navBtns) {
      btn.classList.remove('active')
    }
  }

  /**
   * Deactivate plugin view and show a built-in view
   * Called when user clicks on a built-in nav button
   * @returns {Promise<void>}
   */
  async showBuiltInView() {
    await this.deactivateCurrentView()
  }

  /**
   * Check if a plugin view is currently active
   * @returns {boolean}
   */
  hasActivePluginView() {
    return this.activePluginView !== null
  }

  /**
   * Get the currently active plugin view ID
   * @returns {string|null}
   */
  getActiveViewId() {
    return this.activePluginView
  }

  /**
   * Get all registered views
   * @returns {Object[]}
   */
  getAllViews() {
    return Array.from(this.views.values()).map(e => e.view)
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
   * Cleanup and destroy the manager
   */
  destroy() {
    // Remove all views
    for (const viewId of this.views.keys()) {
      this.removeView(viewId)
    }

    // Unsubscribe from events
    for (const cleanup of this.cleanupFns) {
      if (typeof cleanup === 'function') {
        cleanup()
      }
    }
    this.cleanupFns = []

    console.log('[SidebarViewManager] Destroyed')
  }
}

// Export singleton instance
export const sidebarViewManager = new SidebarViewManager()
