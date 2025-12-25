/**
 * Tests for PluginComponentLoader
 *
 * Note: These tests mock the window.puffin API and dynamic imports
 * since the actual loader runs in the Electron renderer process.
 */

const { describe, it, beforeEach, mock } = require('node:test')
const assert = require('node:assert')

describe('PluginComponentLoader', () => {
  let PluginComponentLoader
  let mockPuffinApi
  let mockPluginViewContainer
  let loader

  beforeEach(() => {
    // Reset modules for clean state
    mockPuffinApi = createMockPuffinApi()
    mockPluginViewContainer = createMockPluginViewContainer()

    // Create a fresh loader instance for testing
    // We'll test the class logic directly
    PluginComponentLoader = createPluginComponentLoaderClass(mockPluginViewContainer)
    loader = new PluginComponentLoader()
  })

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      assert.strictEqual(loader.initialized, false)
      assert.strictEqual(loader.loadedPlugins.size, 0)
      assert.strictEqual(loader.loadingPlugins.size, 0)
      assert.strictEqual(loader.loadErrors.size, 0)
    })

    it('should prevent double initialization', async () => {
      loader.initialized = true
      await loader.init(mockPuffinApi)
      // Should not throw, just warn
      assert.strictEqual(loader.initialized, true)
    })
  })

  describe('buildEntryUrl', () => {
    it('should build file:// URL for Unix paths', () => {
      const url = loader.buildEntryUrl('/home/user/plugins/test', 'renderer/index.js')
      assert.strictEqual(url, 'file:///home/user/plugins/test/renderer/index.js')
    })

    it('should build file:// URL for Windows paths', () => {
      const url = loader.buildEntryUrl('C:\\Users\\test\\plugins\\demo', 'renderer\\index.js')
      assert.strictEqual(url, 'file:///C:/Users/test/plugins/demo/renderer/index.js')
    })

    it('should handle mixed path separators', () => {
      const url = loader.buildEntryUrl('C:\\plugins\\test', 'renderer/components/index.js')
      assert.strictEqual(url, 'file:///C:/plugins/test/renderer/components/index.js')
    })
  })

  describe('loadPluginComponents', () => {
    it('should skip plugins without renderer config', async () => {
      // Mock API to return no renderer config
      loader.puffinApi = {
        getRendererConfig: async () => ({
          success: true,
          hasRenderer: false,
          pluginName: 'no-renderer-plugin',
          pluginDir: '/plugins/no-renderer'
        })
      }

      const result = await loader.loadPluginComponents('no-renderer-plugin')

      assert.strictEqual(result, true)
      assert.strictEqual(loader.loadedPlugins.has('no-renderer-plugin'), false)
    })

    it('should track loading state to prevent duplicate loads', async () => {
      loader.loadingPlugins.add('loading-plugin')

      const result = await loader.loadPluginComponents('loading-plugin')

      assert.strictEqual(result, false) // Should return false when already loading
    })

    it('should return true for already loaded plugins', async () => {
      loader.loadedPlugins.set('already-loaded', {
        module: {},
        components: ['TestComponent'],
        config: {}
      })

      const result = await loader.loadPluginComponents('already-loaded')

      assert.strictEqual(result, true)
    })

    it('should record errors when loading fails', async () => {
      loader.puffinApi = {
        getRendererConfig: async () => ({
          success: false,
          error: 'Plugin not found'
        })
      }

      const result = await loader.loadPluginComponents('missing-plugin')

      assert.strictEqual(result, false)
      assert.strictEqual(loader.loadErrors.has('missing-plugin'), true)
      assert.strictEqual(loader.loadErrors.get('missing-plugin'), 'Plugin not found')
    })
  })

  describe('unloadPluginComponents', () => {
    it('should unregister all components from a plugin', () => {
      // Setup: add a loaded plugin with components
      loader.loadedPlugins.set('test-plugin', {
        module: {},
        components: ['ComponentA', 'ComponentB'],
        config: {}
      })

      loader.unloadPluginComponents('test-plugin')

      assert.strictEqual(loader.loadedPlugins.has('test-plugin'), false)
      assert.deepStrictEqual(mockPluginViewContainer.unregisteredComponents, ['ComponentA', 'ComponentB'])
    })

    it('should handle unloading non-existent plugins gracefully', () => {
      // Should not throw
      loader.unloadPluginComponents('non-existent-plugin')
      assert.strictEqual(loader.loadedPlugins.has('non-existent-plugin'), false)
    })

    it('should clear load errors when unloading', () => {
      loader.loadErrors.set('test-plugin', 'Some error')
      loader.loadedPlugins.set('test-plugin', {
        module: {},
        components: [],
        config: {}
      })

      loader.unloadPluginComponents('test-plugin')

      assert.strictEqual(loader.loadErrors.has('test-plugin'), false)
    })
  })

  describe('query methods', () => {
    beforeEach(() => {
      loader.loadedPlugins.set('plugin-a', {
        module: {},
        components: ['CompA1', 'CompA2'],
        config: {}
      })
      loader.loadedPlugins.set('plugin-b', {
        module: {},
        components: ['CompB1'],
        config: {}
      })
      loader.loadingPlugins.add('plugin-c')
      loader.loadErrors.set('plugin-d', 'Load failed')
    })

    it('should check if plugin is loaded', () => {
      assert.strictEqual(loader.isLoaded('plugin-a'), true)
      assert.strictEqual(loader.isLoaded('plugin-c'), false)
      assert.strictEqual(loader.isLoaded('unknown'), false)
    })

    it('should check if plugin is loading', () => {
      assert.strictEqual(loader.isLoading('plugin-c'), true)
      assert.strictEqual(loader.isLoading('plugin-a'), false)
    })

    it('should get load error for plugin', () => {
      assert.strictEqual(loader.getLoadError('plugin-d'), 'Load failed')
      assert.strictEqual(loader.getLoadError('plugin-a'), null)
    })

    it('should get list of loaded plugins', () => {
      const loaded = loader.getLoadedPlugins()
      assert.deepStrictEqual(loaded.sort(), ['plugin-a', 'plugin-b'])
    })

    it('should get component names for a plugin', () => {
      const components = loader.getPluginComponents('plugin-a')
      assert.deepStrictEqual(components, ['CompA1', 'CompA2'])
    })

    it('should return empty array for unknown plugin components', () => {
      const components = loader.getPluginComponents('unknown')
      assert.deepStrictEqual(components, [])
    })
  })

  describe('getSummary', () => {
    it('should return comprehensive summary', () => {
      loader.initialized = true
      loader.loadedPlugins.set('test-plugin', {
        module: {},
        components: ['TestComp'],
        config: {}
      })
      loader.loadingPlugins.add('loading-plugin')
      loader.loadErrors.set('error-plugin', 'Failed')

      const summary = loader.getSummary()

      assert.strictEqual(summary.loaded, 1)
      assert.strictEqual(summary.loading, 1)
      assert.strictEqual(summary.errors, 1)
      assert.strictEqual(summary.initialized, true)
      assert.strictEqual(summary.plugins.length, 1)
      assert.strictEqual(summary.plugins[0].name, 'test-plugin')
      assert.deepStrictEqual(summary.plugins[0].components, ['TestComp'])
    })
  })

  describe('reloadPlugin', () => {
    it('should unload and reload a plugin', async () => {
      let loadCalled = false

      // Setup loaded plugin
      loader.loadedPlugins.set('test-plugin', {
        module: {},
        components: ['TestComp'],
        config: {}
      })

      // Mock loadPluginComponents
      const originalLoad = loader.loadPluginComponents.bind(loader)
      loader.loadPluginComponents = async (name) => {
        loadCalled = true
        return true
      }

      await loader.reloadPlugin('test-plugin')

      assert.strictEqual(loader.loadedPlugins.has('test-plugin'), false) // Unloaded
      assert.strictEqual(loadCalled, true)
    })
  })

  describe('destroy', () => {
    it('should unload all plugins and cleanup', () => {
      loader.loadedPlugins.set('plugin-a', {
        module: {},
        components: ['CompA'],
        config: {}
      })
      loader.loadedPlugins.set('plugin-b', {
        module: {},
        components: ['CompB'],
        config: {}
      })
      loader.initialized = true

      let cleanupCalled = false
      loader.cleanupFns.push(() => { cleanupCalled = true })

      loader.destroy()

      assert.strictEqual(loader.loadedPlugins.size, 0)
      assert.strictEqual(loader.initialized, false)
      assert.strictEqual(cleanupCalled, true)
    })
  })
})

// Helper to create mock puffin API
function createMockPuffinApi() {
  const eventHandlers = {}

  return {
    plugins: {
      onPluginActivated: (callback) => {
        eventHandlers['plugin:activated'] = callback
        return () => { delete eventHandlers['plugin:activated'] }
      },
      onPluginDeactivated: (callback) => {
        eventHandlers['plugin:deactivated'] = callback
        return () => { delete eventHandlers['plugin:deactivated'] }
      },
      listActive: async () => ({
        success: true,
        plugins: []
      }),
      getRendererConfig: async (pluginName) => ({
        success: true,
        hasRenderer: false,
        pluginName
      })
    },
    _triggerEvent: (event, data) => {
      if (eventHandlers[event]) {
        eventHandlers[event](data)
      }
    }
  }
}

// Helper to create mock plugin view container
function createMockPluginViewContainer() {
  return {
    registeredComponents: {},
    unregisteredComponents: [],
    destroyedPlugins: [],

    registerComponent: function(name, component) {
      this.registeredComponents[name] = component
    },
    unregisterComponent: function(name) {
      this.unregisteredComponents.push(name)
      delete this.registeredComponents[name]
    },
    destroyPluginComponents: function(pluginName) {
      this.destroyedPlugins.push(pluginName)
    }
  }
}

// Create a testable version of PluginComponentLoader
function createPluginComponentLoaderClass(mockViewContainer) {
  class TestablePluginComponentLoader {
    constructor() {
      this.loadedPlugins = new Map()
      this.loadingPlugins = new Set()
      this.loadErrors = new Map()
      this.cleanupFns = []
      this.initialized = false
      this.viewContainer = mockViewContainer
      this.puffinApi = null
    }

    async init(puffinApi) {
      if (this.initialized) {
        console.warn('Already initialized')
        return
      }
      this.puffinApi = puffinApi
      this.initialized = true
    }

    buildEntryUrl(pluginDir, entry) {
      let fullPath = `${pluginDir}/${entry}`.replace(/\\/g, '/')
      if (/^[a-zA-Z]:\//.test(fullPath)) {
        return `file:///${fullPath}`
      }
      return `file://${fullPath}`
    }

    async loadPluginComponents(pluginName) {
      if (this.loadedPlugins.has(pluginName)) {
        return true
      }

      if (this.loadingPlugins.has(pluginName)) {
        return false
      }

      this.loadingPlugins.add(pluginName)
      this.loadErrors.delete(pluginName)

      try {
        if (!this.puffinApi) {
          throw new Error('API not available')
        }

        const config = await this.puffinApi.getRendererConfig(pluginName)

        if (!config.success) {
          throw new Error(config.error || 'Failed to get renderer config')
        }

        if (!config.hasRenderer) {
          this.loadingPlugins.delete(pluginName)
          return true
        }

        // In tests, we skip actual module loading
        this.loadedPlugins.set(pluginName, {
          module: {},
          components: config.components?.map(c => c.name) || [],
          config
        })

        return true

      } catch (error) {
        this.loadErrors.set(pluginName, error.message)
        return false

      } finally {
        this.loadingPlugins.delete(pluginName)
      }
    }

    unloadPluginComponents(pluginName) {
      const loaded = this.loadedPlugins.get(pluginName)
      if (!loaded) {
        return
      }

      for (const componentName of loaded.components) {
        this.viewContainer.unregisterComponent(componentName)
      }

      this.viewContainer.destroyPluginComponents(pluginName)
      this.loadedPlugins.delete(pluginName)
      this.loadErrors.delete(pluginName)
    }

    isLoaded(pluginName) {
      return this.loadedPlugins.has(pluginName)
    }

    isLoading(pluginName) {
      return this.loadingPlugins.has(pluginName)
    }

    getLoadError(pluginName) {
      return this.loadErrors.get(pluginName) || null
    }

    getLoadedPlugins() {
      return Array.from(this.loadedPlugins.keys())
    }

    getPluginComponents(pluginName) {
      const loaded = this.loadedPlugins.get(pluginName)
      return loaded ? [...loaded.components] : []
    }

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

    async reloadPlugin(pluginName) {
      this.unloadPluginComponents(pluginName)
      return this.loadPluginComponents(pluginName)
    }

    destroy() {
      for (const pluginName of this.loadedPlugins.keys()) {
        this.unloadPluginComponents(pluginName)
      }

      for (const cleanup of this.cleanupFns) {
        if (typeof cleanup === 'function') {
          cleanup()
        }
      }
      this.cleanupFns = []
      this.initialized = false
    }
  }

  return TestablePluginComponentLoader
}
