/**
 * PluginStateStore Tests
 *
 * Tests for persisting plugin enabled/disabled state.
 */

const { PluginStateStore } = require('../../src/main/plugins/plugin-state-store')
const fs = require('fs').promises
const path = require('path')
const os = require('os')

describe('PluginStateStore', () => {
  let store
  let testDir
  let testStatePath

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), `puffin-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })
    testStatePath = path.join(testDir, 'plugin-state.json')

    store = new PluginStateStore(testStatePath)
  })

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('load', () => {
    it('should create default state if file does not exist', async () => {
      const state = await store.load()

      expect(state).toHaveProperty('version', 1)
      expect(state).toHaveProperty('plugins', {})
      expect(state).toHaveProperty('createdAt')
      expect(state).toHaveProperty('updatedAt')
    })

    it('should load existing state from file', async () => {
      const existingState = {
        version: 1,
        plugins: {
          'test-plugin': { enabled: false }
        },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      await fs.writeFile(testStatePath, JSON.stringify(existingState))

      const state = await store.load()

      expect(state.plugins['test-plugin'].enabled).toBe(false)
    })

    it('should handle corrupted JSON gracefully', async () => {
      await fs.writeFile(testStatePath, 'not valid json')
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const state = await store.load()

      expect(state).toHaveProperty('version', 1)
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('should set loaded flag', async () => {
      expect(store.loaded).toBe(false)

      await store.load()

      expect(store.loaded).toBe(true)
    })
  })

  describe('save', () => {
    it('should save state to file', async () => {
      await store.load()
      store.state.plugins['test-plugin'] = { enabled: true }

      await store.save()

      const fileContent = await fs.readFile(testStatePath, 'utf-8')
      const savedState = JSON.parse(fileContent)
      expect(savedState.plugins['test-plugin'].enabled).toBe(true)
    })

    it('should update timestamp on save', async () => {
      await store.load()
      const originalTime = store.state.updatedAt

      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10))

      await store.save()

      expect(store.state.updatedAt).not.toBe(originalTime)
    })

    it('should create directory if it does not exist', async () => {
      const nestedPath = path.join(testDir, 'nested', 'dir', 'state.json')
      const nestedStore = new PluginStateStore(nestedPath)

      await nestedStore.load()
      await nestedStore.save()

      const exists = await fs.access(nestedPath).then(() => true).catch(() => false)
      expect(exists).toBe(true)
    })
  })

  describe('isEnabled', () => {
    beforeEach(async () => {
      await store.load()
    })

    it('should return true for unknown plugins (default enabled)', async () => {
      const enabled = await store.isEnabled('new-plugin')
      expect(enabled).toBe(true)
    })

    it('should return true for explicitly enabled plugins', async () => {
      store.state.plugins['test-plugin'] = { enabled: true }

      const enabled = await store.isEnabled('test-plugin')
      expect(enabled).toBe(true)
    })

    it('should return false for disabled plugins', async () => {
      store.state.plugins['test-plugin'] = { enabled: false }

      const enabled = await store.isEnabled('test-plugin')
      expect(enabled).toBe(false)
    })
  })

  describe('enable', () => {
    beforeEach(async () => {
      await store.load()
    })

    it('should enable a plugin', async () => {
      store.state.plugins['test-plugin'] = { enabled: false }

      await store.enable('test-plugin')

      expect(store.state.plugins['test-plugin'].enabled).toBe(true)
    })

    it('should record enabledAt timestamp', async () => {
      await store.enable('test-plugin')

      expect(store.state.plugins['test-plugin'].enabledAt).toBeDefined()
    })

    it('should preserve existing plugin state', async () => {
      store.state.plugins['test-plugin'] = {
        enabled: false,
        config: { key: 'value' }
      }

      await store.enable('test-plugin')

      expect(store.state.plugins['test-plugin'].config).toEqual({ key: 'value' })
    })

    it('should persist to disk', async () => {
      await store.enable('test-plugin')

      const fileContent = await fs.readFile(testStatePath, 'utf-8')
      const savedState = JSON.parse(fileContent)
      expect(savedState.plugins['test-plugin'].enabled).toBe(true)
    })
  })

  describe('disable', () => {
    beforeEach(async () => {
      await store.load()
    })

    it('should disable a plugin', async () => {
      store.state.plugins['test-plugin'] = { enabled: true }

      await store.disable('test-plugin')

      expect(store.state.plugins['test-plugin'].enabled).toBe(false)
    })

    it('should record disabledAt timestamp', async () => {
      await store.disable('test-plugin')

      expect(store.state.plugins['test-plugin'].disabledAt).toBeDefined()
    })

    it('should persist to disk', async () => {
      await store.disable('test-plugin')

      const fileContent = await fs.readFile(testStatePath, 'utf-8')
      const savedState = JSON.parse(fileContent)
      expect(savedState.plugins['test-plugin'].enabled).toBe(false)
    })
  })

  describe('recordActivation', () => {
    beforeEach(async () => {
      await store.load()
    })

    it('should record lastActivated timestamp', async () => {
      await store.recordActivation('test-plugin')

      expect(store.state.plugins['test-plugin'].lastActivated).toBeDefined()
    })

    it('should set firstSeen on first activation', async () => {
      await store.recordActivation('test-plugin')

      expect(store.state.plugins['test-plugin'].firstSeen).toBeDefined()
    })

    it('should not update firstSeen on subsequent activations', async () => {
      const firstTime = '2024-01-01T00:00:00.000Z'
      store.state.plugins['test-plugin'] = {
        enabled: true,
        firstSeen: firstTime
      }

      await store.recordActivation('test-plugin')

      expect(store.state.plugins['test-plugin'].firstSeen).toBe(firstTime)
    })
  })

  describe('getPluginState', () => {
    beforeEach(async () => {
      await store.load()
    })

    it('should return default state for unknown plugin', async () => {
      const state = await store.getPluginState('unknown-plugin')

      expect(state).toEqual({
        enabled: true,
        config: {},
        firstSeen: null,
        lastActivated: null
      })
    })

    it('should return stored state for known plugin', async () => {
      store.state.plugins['test-plugin'] = {
        enabled: false,
        config: { theme: 'dark' },
        firstSeen: '2024-01-01',
        lastActivated: '2024-01-02'
      }

      const state = await store.getPluginState('test-plugin')

      expect(state.enabled).toBe(false)
      expect(state.config).toEqual({ theme: 'dark' })
    })
  })

  describe('setPluginState', () => {
    beforeEach(async () => {
      await store.load()
    })

    it('should set plugin state', async () => {
      await store.setPluginState('test-plugin', {
        enabled: true,
        config: { key: 'value' }
      })

      expect(store.state.plugins['test-plugin']).toMatchObject({
        enabled: true,
        config: { key: 'value' }
      })
    })

    it('should merge with existing state', async () => {
      store.state.plugins['test-plugin'] = {
        enabled: true,
        config: { existing: 'value' }
      }

      await store.setPluginState('test-plugin', {
        config: { new: 'value' }
      })

      expect(store.state.plugins['test-plugin'].enabled).toBe(true)
      expect(store.state.plugins['test-plugin'].config).toEqual({ new: 'value' })
    })
  })

  describe('getPluginConfig / setPluginConfig', () => {
    beforeEach(async () => {
      await store.load()
    })

    it('should get plugin config', async () => {
      store.state.plugins['test-plugin'] = {
        enabled: true,
        config: { theme: 'dark', size: 'large' }
      }

      const config = await store.getPluginConfig('test-plugin')

      expect(config).toEqual({ theme: 'dark', size: 'large' })
    })

    it('should return empty object for plugin with no config', async () => {
      const config = await store.getPluginConfig('unknown-plugin')
      expect(config).toEqual({})
    })

    it('should set plugin config', async () => {
      await store.setPluginConfig('test-plugin', { setting: 'value' })

      expect(store.state.plugins['test-plugin'].config).toEqual({ setting: 'value' })
    })
  })

  describe('getDisabledPlugins', () => {
    beforeEach(async () => {
      await store.load()
    })

    it('should return list of disabled plugin names', async () => {
      store.state.plugins = {
        'enabled-plugin': { enabled: true },
        'disabled-plugin-1': { enabled: false },
        'disabled-plugin-2': { enabled: false }
      }

      const disabled = await store.getDisabledPlugins()

      expect(disabled).toHaveLength(2)
      expect(disabled).toContain('disabled-plugin-1')
      expect(disabled).toContain('disabled-plugin-2')
    })

    it('should return empty array if no plugins disabled', async () => {
      store.state.plugins = {
        'plugin-a': { enabled: true },
        'plugin-b': { enabled: true }
      }

      const disabled = await store.getDisabledPlugins()

      expect(disabled).toEqual([])
    })
  })

  describe('removePluginState', () => {
    beforeEach(async () => {
      await store.load()
    })

    it('should remove plugin state', async () => {
      store.state.plugins['test-plugin'] = { enabled: true }

      await store.removePluginState('test-plugin')

      expect(store.state.plugins['test-plugin']).toBeUndefined()
    })

    it('should persist deletion to disk', async () => {
      store.state.plugins['test-plugin'] = { enabled: true }
      await store.save()

      await store.removePluginState('test-plugin')

      const fileContent = await fs.readFile(testStatePath, 'utf-8')
      const savedState = JSON.parse(fileContent)
      expect(savedState.plugins['test-plugin']).toBeUndefined()
    })
  })

  describe('cleanupOrphanedStates', () => {
    beforeEach(async () => {
      await store.load()
    })

    it('should remove states for plugins that no longer exist', async () => {
      store.state.plugins = {
        'existing-plugin': { enabled: true },
        'removed-plugin-1': { enabled: true },
        'removed-plugin-2': { enabled: false }
      }

      const orphaned = await store.cleanupOrphanedStates(['existing-plugin'])

      expect(orphaned).toHaveLength(2)
      expect(orphaned).toContain('removed-plugin-1')
      expect(orphaned).toContain('removed-plugin-2')
      expect(store.state.plugins['existing-plugin']).toBeDefined()
      expect(store.state.plugins['removed-plugin-1']).toBeUndefined()
    })

    it('should return empty array if no orphans', async () => {
      store.state.plugins = {
        'plugin-a': { enabled: true },
        'plugin-b': { enabled: true }
      }

      const orphaned = await store.cleanupOrphanedStates(['plugin-a', 'plugin-b'])

      expect(orphaned).toEqual([])
    })

    it('should persist cleanup to disk', async () => {
      store.state.plugins = {
        'keep': { enabled: true },
        'remove': { enabled: true }
      }
      await store.save()

      await store.cleanupOrphanedStates(['keep'])

      const fileContent = await fs.readFile(testStatePath, 'utf-8')
      const savedState = JSON.parse(fileContent)
      expect(savedState.plugins['remove']).toBeUndefined()
    })
  })

  describe('getAllStates', () => {
    beforeEach(async () => {
      await store.load()
    })

    it('should return copy of all plugin states', async () => {
      store.state.plugins = {
        'plugin-a': { enabled: true },
        'plugin-b': { enabled: false }
      }

      const states = await store.getAllStates()

      expect(states).toEqual({
        'plugin-a': { enabled: true },
        'plugin-b': { enabled: false }
      })

      // Verify it's a copy
      states['plugin-a'].enabled = false
      expect(store.state.plugins['plugin-a'].enabled).toBe(true)
    })
  })
})
