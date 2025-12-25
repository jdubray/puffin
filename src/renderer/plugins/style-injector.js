/**
 * Plugin Style Injector
 *
 * Handles CSS injection and removal for plugins.
 * Manages plugin stylesheets with proper scoping and cleanup.
 */

/**
 * StyleInjector - Manages plugin CSS injection
 */
export class StyleInjector {
  constructor() {
    // Track loaded stylesheets by plugin
    this.loadedStyles = new Map() // pluginName -> Set of link elements

    // Track loading state
    this.loadingPromises = new Map() // pluginName -> Promise

    // Container for plugin styles (inserted after app styles)
    this.styleContainer = null
  }

  /**
   * Initialize the style injector
   */
  init() {
    // Create a container for plugin styles at the end of <head>
    this.styleContainer = document.createElement('div')
    this.styleContainer.id = 'plugin-styles'
    this.styleContainer.setAttribute('data-plugin-styles', 'true')
    document.head.appendChild(this.styleContainer)

    console.log('[StyleInjector] Initialized')
  }

  /**
   * Inject CSS styles for a plugin
   * @param {string} pluginName - Name of the plugin
   * @param {string[]} cssPaths - Array of CSS file paths (relative to plugin directory)
   * @param {string} pluginDir - Absolute path to plugin directory
   * @returns {Promise<{ loaded: string[], errors: string[] }>}
   */
  async injectPluginStyles(pluginName, cssPaths, pluginDir) {
    // Skip if no styles to inject
    if (!cssPaths || cssPaths.length === 0) {
      return { loaded: [], errors: [] }
    }

    // Check if already loading
    if (this.loadingPromises.has(pluginName)) {
      console.log(`[StyleInjector] Already loading styles for ${pluginName}, waiting...`)
      return this.loadingPromises.get(pluginName)
    }

    // Create loading promise
    const loadingPromise = this._doInjectStyles(pluginName, cssPaths, pluginDir)
    this.loadingPromises.set(pluginName, loadingPromise)

    try {
      const result = await loadingPromise
      return result
    } finally {
      this.loadingPromises.delete(pluginName)
    }
  }

  /**
   * Internal method to inject styles
   * @private
   */
  async _doInjectStyles(pluginName, cssPaths, pluginDir) {
    const loaded = []
    const errors = []

    // Remove any existing styles for this plugin first
    this.removePluginStyles(pluginName)

    // Create a set to track link elements for this plugin
    const linkElements = new Set()

    // Load each CSS file
    for (const cssPath of cssPaths) {
      try {
        const linkElement = await this._loadStylesheet(pluginName, cssPath, pluginDir)
        linkElements.add(linkElement)
        loaded.push(cssPath)
      } catch (error) {
        console.warn(`[StyleInjector] Failed to load ${cssPath} for ${pluginName}:`, error.message)
        errors.push(`${cssPath}: ${error.message}`)
      }
    }

    // Store references to link elements
    if (linkElements.size > 0) {
      this.loadedStyles.set(pluginName, linkElements)
    }

    console.log(`[StyleInjector] Loaded ${loaded.length}/${cssPaths.length} styles for ${pluginName}`)

    return { loaded, errors }
  }

  /**
   * Load a single stylesheet
   * @private
   * @param {string} pluginName - Plugin name
   * @param {string} cssPath - Relative CSS file path
   * @param {string} pluginDir - Plugin directory path
   * @returns {Promise<HTMLLinkElement>}
   */
  _loadStylesheet(pluginName, cssPath, pluginDir) {
    return new Promise((resolve, reject) => {
      // Construct full path
      // On Windows, we need to use file:// protocol
      const fullPath = this._constructFilePath(pluginDir, cssPath)

      // Create link element
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.type = 'text/css'
      link.href = fullPath
      link.setAttribute('data-plugin', pluginName)
      link.setAttribute('data-plugin-style', cssPath)

      // Handle load success
      link.onload = () => {
        console.log(`[StyleInjector] Loaded: ${cssPath} for ${pluginName}`)
        resolve(link)
      }

      // Handle load error
      link.onerror = () => {
        // Remove failed link element
        if (link.parentNode) {
          link.parentNode.removeChild(link)
        }
        reject(new Error(`Failed to load stylesheet: ${cssPath}`))
      }

      // Add to DOM
      if (this.styleContainer) {
        this.styleContainer.appendChild(link)
      } else {
        document.head.appendChild(link)
      }
    })
  }

  /**
   * Construct file path for CSS loading
   * @private
   * @param {string} pluginDir - Plugin directory
   * @param {string} cssPath - Relative CSS path
   * @returns {string} Full file URL
   */
  _constructFilePath(pluginDir, cssPath) {
    // Normalize path separators
    const normalizedDir = pluginDir.replace(/\\/g, '/')
    const normalizedPath = cssPath.replace(/\\/g, '/')

    // Remove leading ./ if present
    const cleanPath = normalizedPath.replace(/^\.\//, '')

    // Construct full path
    let fullPath = `${normalizedDir}/${cleanPath}`

    // Add file:// protocol if not already present
    if (!fullPath.startsWith('file://')) {
      // Handle Windows paths (C:/)
      if (/^[A-Za-z]:\//.test(fullPath)) {
        fullPath = `file:///${fullPath}`
      } else if (fullPath.startsWith('/')) {
        fullPath = `file://${fullPath}`
      } else {
        fullPath = `file:///${fullPath}`
      }
    }

    return fullPath
  }

  /**
   * Remove all styles for a plugin
   * @param {string} pluginName - Plugin name
   * @returns {number} Number of stylesheets removed
   */
  removePluginStyles(pluginName) {
    // Get tracked link elements
    const linkElements = this.loadedStyles.get(pluginName)

    if (linkElements) {
      for (const link of linkElements) {
        if (link.parentNode) {
          link.parentNode.removeChild(link)
        }
      }
      this.loadedStyles.delete(pluginName)
      console.log(`[StyleInjector] Removed ${linkElements.size} styles for ${pluginName}`)
      return linkElements.size
    }

    // Also clean up any orphaned styles (in case of inconsistent state)
    const orphanedLinks = document.querySelectorAll(`link[data-plugin="${pluginName}"]`)
    for (const link of orphanedLinks) {
      link.parentNode?.removeChild(link)
    }

    if (orphanedLinks.length > 0) {
      console.log(`[StyleInjector] Cleaned up ${orphanedLinks.length} orphaned styles for ${pluginName}`)
    }

    return orphanedLinks.length
  }

  /**
   * Check if styles are loaded for a plugin
   * @param {string} pluginName - Plugin name
   * @returns {boolean}
   */
  isLoaded(pluginName) {
    return this.loadedStyles.has(pluginName) && this.loadedStyles.get(pluginName).size > 0
  }

  /**
   * Check if styles are currently loading for a plugin
   * @param {string} pluginName - Plugin name
   * @returns {boolean}
   */
  isLoading(pluginName) {
    return this.loadingPromises.has(pluginName)
  }

  /**
   * Get list of loaded style files for a plugin
   * @param {string} pluginName - Plugin name
   * @returns {string[]} Array of CSS file paths
   */
  getLoadedStyles(pluginName) {
    const linkElements = this.loadedStyles.get(pluginName)
    if (!linkElements) return []

    return Array.from(linkElements).map(link => link.getAttribute('data-plugin-style'))
  }

  /**
   * Get all loaded plugins with styles
   * @returns {string[]} Array of plugin names
   */
  getPluginsWithStyles() {
    return Array.from(this.loadedStyles.keys())
  }

  /**
   * Get summary of loaded styles
   * @returns {Object}
   */
  getSummary() {
    const summary = {
      plugins: this.loadedStyles.size,
      totalStylesheets: 0,
      byPlugin: {}
    }

    for (const [pluginName, links] of this.loadedStyles) {
      summary.totalStylesheets += links.size
      summary.byPlugin[pluginName] = links.size
    }

    return summary
  }

  /**
   * Reload styles for a plugin
   * @param {string} pluginName - Plugin name
   * @param {string[]} cssPaths - CSS file paths
   * @param {string} pluginDir - Plugin directory
   * @returns {Promise<{ loaded: string[], errors: string[] }>}
   */
  async reloadPluginStyles(pluginName, cssPaths, pluginDir) {
    this.removePluginStyles(pluginName)
    return this.injectPluginStyles(pluginName, cssPaths, pluginDir)
  }

  /**
   * Remove all plugin styles
   */
  clearAllStyles() {
    for (const pluginName of this.loadedStyles.keys()) {
      this.removePluginStyles(pluginName)
    }

    // Also clear any orphaned plugin styles
    const allPluginStyles = document.querySelectorAll('link[data-plugin]')
    for (const link of allPluginStyles) {
      link.parentNode?.removeChild(link)
    }

    console.log('[StyleInjector] Cleared all plugin styles')
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    this.clearAllStyles()

    // Remove style container
    if (this.styleContainer && this.styleContainer.parentNode) {
      this.styleContainer.parentNode.removeChild(this.styleContainer)
    }

    this.loadedStyles.clear()
    this.loadingPromises.clear()

    console.log('[StyleInjector] Destroyed')
  }
}

// Export singleton instance
export const styleInjector = new StyleInjector()
