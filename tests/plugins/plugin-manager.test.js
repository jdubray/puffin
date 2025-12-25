/**
 * PluginManager Tests
 *
 * Tests for the plugin lifecycle orchestration.
 */

const { PluginManager } = require('../../src/main/plugins/plugin-manager')
const { PluginStateStore } = require('../../src/main/plugins/plugin-state-store')
const fs = require('fs').promises
const path = require('path')
const os = require('os')

// Mock PluginLoader
class MockPluginLoader {
  constructor() {
    this.plugins = new Map()
  }

  addPlugin(name, pluginData) {
    this.plugins.set(name, {
      name,
      state: 'loaded',
      directory: `/plugins/${name}`,
      module: {
        activate: jest.fn().mockResolvedValue(undefined),
        deactivate: jest.fn().mockResolvedValue(undefined),
        ...pluginData.module
      },
      toJSON: () => ({
        name,
        version: pluginData.version || '1.0.0',
        displayName: pluginData.displayName || name
      }),
      ...pluginData
    })
  }

  getPlugin(name) {
    return this.plugins.get(name) || null
  }

  getLoadedPlugins() {
    return Array.from(this.plugins.values()).filter(p => p.state === 'loaded')
  }

  getSummary() {
    return {
      total: this.plugins.size,
      loaded: this.getLoadedPlugins().length,
      failed: 0
    }
  }
}

describe('PluginManager', () => {
  let manager
  let loader
  let mockIpcMain
  let testDir
  let testStatePath

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(os.tmpdir(), `puffin-pm-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })
    testStatePath = path.join(testDir, 'plugin-state.json')

    loader = new MockPluginLoader()
    mockIpcMain = {
      handle: jest.fn(),
      removeHandler: jest.fn()
    }

    // Add some test plugins
    loader.addPlugin('plugin-a', { version: '1.0.0' })
    loader.addPlugin('plugin-b', { version: '2.0.0' })

    manager = new PluginManager({
      loader,
      ipcMain: mockIpcMain,
      services: {}
    })

    // Override state store path for testing
    manager.stateStore = new PluginStateStore(testStatePath)
  })

  afterEach(async () => {
    if (manager && !manager.shuttingDown) {
      await manager.shutdown()
    }
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('initialize', () => {
    it('should load persisted state', async () => {
      await manager.initialize()

      expect(manager.stateStore.loaded).toBe(true)
    })

    it('should activate enabled plugins', async () => {
      const result = await manager.initialize()

      expect(result.activated).toContain('plugin-a')
      expect(result.activated).toContain('plugin-b')
      expect(result.failed).toHaveLength(0)
      expect(result.disabled).toHaveLength(0)
    })

    it('should skip disabled plugins', async () => {
      // Pre-disable plugin-b
      await manager.stateStore.load()
      await manager.stateStore.disable('plugin-b')

      const result = await manager.initialize()

      expect(result.activated).toContain('plugin-a')
      expect(result.disabled).toContain('plugin-b')
      expect(manager.isActive('plugin-a')).toBe(true)
      expect(manager.isActive('plugin-b')).toBe(false)
    })

    it('should report failed activations', async () => {
      loader.addPlugin('failing-plugin', {
        module: {
          activate: jest.fn().mockRejectedValue(new Error('Activation failed'))
        }
      })

      const result = await manager.initialize()

      expect(result.failed).toContain('failing-plugin')
    })

    it('should throw if already initialized', async () => {
      await manager.initialize()

      await expect(manager.initialize()).rejects.toThrow('already initialized')
    })

    it('should set initialized flag', async () => {
      expect(manager.initialized).toBe(false)

      await manager.initialize()

      expect(manager.initialized).toBe(true)
    })

    it('should emit events during initialization', async () => {
      const activatedListener = jest.fn()
      manager.on('plugin:activated', activatedListener)

      await manager.initialize()

      expect(activatedListener).toHaveBeenCalledTimes(2)
    })
  })

  describe('activatePlugin', () => {
    beforeEach(async () => {
      await manager.stateStore.load()
    })

    it('should activate a loaded plugin', async () => {
      await manager.activatePlugin('plugin-a')

      expect(manager.isActive('plugin-a')).toBe(true)
    })

    it('should call plugin activate function', async () => {
      await manager.activatePlugin('plugin-a')

      const plugin = loader.getPlugin('plugin-a')
      expect(plugin.module.activate).toHaveBeenCalled()
    })

    it('should create plugin context', async () => {
      await manager.activatePlugin('plugin-a')

      const context = manager.getPluginContext('plugin-a')
      expect(context).not.toBeNull()
      expect(context.pluginName).toBe('plugin-a')
    })

    it('should emit activating and activated events', async () => {
      const activatingListener = jest.fn()
      const activatedListener = jest.fn()
      manager.on('plugin:activating', activatingListener)
      manager.on('plugin:activated', activatedListener)

      await manager.activatePlugin('plugin-a')

      expect(activatingListener).toHaveBeenCalledWith({ name: 'plugin-a' })
      expect(activatedListener).toHaveBeenCalledWith({
        name: 'plugin-a',
        plugin: expect.anything()
      })
    })

    it('should record activation in state store', async () => {
      await manager.activatePlugin('plugin-a')

      const state = await manager.stateStore.getPluginState('plugin-a')
      expect(state.lastActivated).toBeDefined()
    })

    it('should throw for unknown plugin', async () => {
      await expect(manager.activatePlugin('unknown'))
        .rejects.toThrow('Plugin not found: unknown')
    })

    it('should skip if already active', async () => {
      await manager.activatePlugin('plugin-a')
      const plugin = loader.getPlugin('plugin-a')

      await manager.activatePlugin('plugin-a')

      // Should only be called once
      expect(plugin.module.activate).toHaveBeenCalledTimes(1)
    })

    it('should track activation errors', async () => {
      loader.addPlugin('failing-plugin', {
        module: {
          activate: jest.fn().mockRejectedValue(new Error('Failed'))
        }
      })

      await expect(manager.activatePlugin('failing-plugin')).rejects.toThrow()

      expect(manager.getActivationError('failing-plugin')).toBe('Failed')
    })

    it('should emit activation-failed event on error', async () => {
      loader.addPlugin('failing-plugin', {
        module: {
          activate: jest.fn().mockRejectedValue(new Error('Failed'))
        }
      })

      const listener = jest.fn()
      manager.on('plugin:activation-failed', listener)

      await expect(manager.activatePlugin('failing-plugin')).rejects.toThrow()

      expect(listener).toHaveBeenCalledWith({
        name: 'failing-plugin',
        error: expect.any(Error)
      })
    })
  })

  describe('deactivatePlugin', () => {
    beforeEach(async () => {
      await manager.stateStore.load()
      await manager.activatePlugin('plugin-a')
    })

    it('should deactivate an active plugin', async () => {
      await manager.deactivatePlugin('plugin-a')

      expect(manager.isActive('plugin-a')).toBe(false)
    })

    it('should call plugin deactivate function', async () => {
      await manager.deactivatePlugin('plugin-a')

      const plugin = loader.getPlugin('plugin-a')
      expect(plugin.module.deactivate).toHaveBeenCalled()
    })

    it('should cleanup context', async () => {
      const context = manager.getPluginContext('plugin-a')
      const cleanupSpy = jest.spyOn(context, '_cleanup')

      await manager.deactivatePlugin('plugin-a')

      expect(cleanupSpy).toHaveBeenCalled()
    })

    it('should emit deactivating and deactivated events', async () => {
      const deactivatingListener = jest.fn()
      const deactivatedListener = jest.fn()
      manager.on('plugin:deactivating', deactivatingListener)
      manager.on('plugin:deactivated', deactivatedListener)

      await manager.deactivatePlugin('plugin-a')

      expect(deactivatingListener).toHaveBeenCalledWith({ name: 'plugin-a' })
      expect(deactivatedListener).toHaveBeenCalledWith({ name: 'plugin-a' })
    })

    it('should skip if not active', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      await manager.deactivatePlugin('plugin-b') // Not activated

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('not active'))
      consoleSpy.mockRestore()
    })

    it('should still remove from active even if deactivate throws', async () => {
      loader.addPlugin('throwing-plugin', {
        module: {
          activate: jest.fn(),
          deactivate: jest.fn().mockRejectedValue(new Error('Deactivate error'))
        }
      })
      await manager.activatePlugin('throwing-plugin')

      await expect(manager.deactivatePlugin('throwing-plugin')).rejects.toThrow()

      expect(manager.isActive('throwing-plugin')).toBe(false)
    })
  })

  describe('enablePlugin', () => {
    beforeEach(async () => {
      await manager.stateStore.load()
    })

    it('should enable and activate a plugin', async () => {
      await manager.stateStore.disable('plugin-a')

      const result = await manager.enablePlugin('plugin-a')

      expect(result).toBe(true)
      expect(await manager.stateStore.isEnabled('plugin-a')).toBe(true)
      expect(manager.isActive('plugin-a')).toBe(true)
    })

    it('should emit enabled event', async () => {
      const listener = jest.fn()
      manager.on('plugin:enabled', listener)

      await manager.enablePlugin('plugin-a')

      expect(listener).toHaveBeenCalledWith({ name: 'plugin-a' })
    })

    it('should throw for unknown plugin', async () => {
      await expect(manager.enablePlugin('unknown'))
        .rejects.toThrow('Plugin not found: unknown')
    })

    it('should return false if activation fails', async () => {
      loader.addPlugin('failing-plugin', {
        module: {
          activate: jest.fn().mockRejectedValue(new Error('Failed'))
        }
      })

      const result = await manager.enablePlugin('failing-plugin')

      expect(result).toBe(false)
      // But should still be enabled in state store
      expect(await manager.stateStore.isEnabled('failing-plugin')).toBe(true)
    })
  })

  describe('disablePlugin', () => {
    beforeEach(async () => {
      await manager.stateStore.load()
      await manager.activatePlugin('plugin-a')
    })

    it('should deactivate and disable a plugin', async () => {
      const result = await manager.disablePlugin('plugin-a')

      expect(result).toBe(true)
      expect(await manager.stateStore.isEnabled('plugin-a')).toBe(false)
      expect(manager.isActive('plugin-a')).toBe(false)
    })

    it('should emit disabled event', async () => {
      const listener = jest.fn()
      manager.on('plugin:disabled', listener)

      await manager.disablePlugin('plugin-a')

      expect(listener).toHaveBeenCalledWith({ name: 'plugin-a' })
    })

    it('should continue to disable even if deactivation fails', async () => {
      loader.addPlugin('throwing-plugin', {
        module: {
          activate: jest.fn(),
          deactivate: jest.fn().mockRejectedValue(new Error('Error'))
        }
      })
      await manager.activatePlugin('throwing-plugin')

      const result = await manager.disablePlugin('throwing-plugin')

      expect(result).toBe(true)
      expect(await manager.stateStore.isEnabled('throwing-plugin')).toBe(false)
    })
  })

  describe('shutdown', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should deactivate all plugins', async () => {
      await manager.shutdown()

      expect(manager.isActive('plugin-a')).toBe(false)
      expect(manager.isActive('plugin-b')).toBe(false)
    })

    it('should set shuttingDown flag', async () => {
      await manager.shutdown()

      expect(manager.shuttingDown).toBe(true)
    })

    it('should only run once', async () => {
      const plugin = loader.getPlugin('plugin-a')

      await manager.shutdown()
      await manager.shutdown()

      expect(plugin.module.deactivate).toHaveBeenCalledTimes(1)
    })

    it('should continue even if some plugins fail to deactivate', async () => {
      loader.addPlugin('failing-plugin', {
        module: {
          activate: jest.fn(),
          deactivate: jest.fn().mockRejectedValue(new Error('Error'))
        }
      })
      await manager.activatePlugin('failing-plugin')

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      await manager.shutdown()

      expect(consoleSpy).toHaveBeenCalled()
      expect(manager.getActivePlugins()).toHaveLength(0)

      consoleSpy.mockRestore()
    })
  })

  describe('reloadPlugin', () => {
    beforeEach(async () => {
      await manager.stateStore.load()
      await manager.activatePlugin('plugin-a')
    })

    it('should deactivate and reactivate a plugin', async () => {
      const plugin = loader.getPlugin('plugin-a')

      await manager.reloadPlugin('plugin-a')

      expect(plugin.module.deactivate).toHaveBeenCalled()
      expect(plugin.module.activate).toHaveBeenCalledTimes(2)
    })

    it('should return true on success', async () => {
      const result = await manager.reloadPlugin('plugin-a')
      expect(result).toBe(true)
    })
  })

  describe('query methods', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('isActive should return correct status', () => {
      expect(manager.isActive('plugin-a')).toBe(true)
      expect(manager.isActive('unknown')).toBe(false)
    })

    it('getActivePlugins should return active plugin names', () => {
      const active = manager.getActivePlugins()

      expect(active).toContain('plugin-a')
      expect(active).toContain('plugin-b')
    })

    it('getPluginState should return correct state', () => {
      expect(manager.getPluginState('plugin-a')).toBe('active')
      expect(manager.getPluginState('unknown')).toBe('not-found')
    })

    it('getPluginState should return error for failed plugins', async () => {
      loader.addPlugin('failing-plugin', {
        module: {
          activate: jest.fn().mockRejectedValue(new Error('Failed'))
        }
      })

      try {
        await manager.activatePlugin('failing-plugin')
      } catch {
        // Expected
      }

      expect(manager.getPluginState('failing-plugin')).toBe('error')
    })

    it('getActivationError should return error message', async () => {
      loader.addPlugin('failing-plugin', {
        module: {
          activate: jest.fn().mockRejectedValue(new Error('Custom error'))
        }
      })

      try {
        await manager.activatePlugin('failing-plugin')
      } catch {
        // Expected
      }

      expect(manager.getActivationError('failing-plugin')).toBe('Custom error')
    })

    it('getRegistry should return the registry', () => {
      const registry = manager.getRegistry()
      expect(registry).toBeDefined()
    })

    it('getStateStore should return the state store', () => {
      const store = manager.getStateStore()
      expect(store).toBeDefined()
    })
  })

  describe('getPluginInfo', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should return comprehensive plugin info', async () => {
      const info = await manager.getPluginInfo('plugin-a')

      expect(info).toMatchObject({
        name: 'plugin-a',
        isActive: true,
        isEnabled: true,
        activationError: null
      })
    })

    it('should return null for unknown plugin', async () => {
      const info = await manager.getPluginInfo('unknown')
      expect(info).toBeNull()
    })
  })

  describe('getSummary', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should return complete system summary', async () => {
      const summary = await manager.getSummary()

      expect(summary).toMatchObject({
        total: 2,
        loaded: 2,
        active: 2,
        disabled: 0,
        errors: 0,
        initialized: true,
        shuttingDown: false
      })
    })
  })
})
