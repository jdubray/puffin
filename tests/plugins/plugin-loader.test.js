/**
 * Tests for PluginLoader
 */

const { describe, it, before, after, beforeEach } = require('node:test')
const assert = require('node:assert')
const path = require('path')
const fs = require('fs').promises
const os = require('os')

// Test the PluginLoader with mock plugins
describe('PluginLoader', () => {
  let testPluginsDir
  let PluginLoader
  let Plugin

  before(async () => {
    // Create a temporary plugins directory for testing
    testPluginsDir = path.join(os.tmpdir(), `puffin-test-plugins-${Date.now()}`)
    await fs.mkdir(testPluginsDir, { recursive: true })

    // Import the modules
    const pluginModule = require('../../src/main/plugins/plugin-loader')
    PluginLoader = pluginModule.PluginLoader
    Plugin = pluginModule.Plugin
  })

  after(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testPluginsDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('Plugin class', () => {
    it('should create a plugin from manifest', () => {
      const manifest = {
        name: 'test-plugin',
        version: '1.0.0',
        displayName: 'Test Plugin',
        description: 'A test plugin',
        main: 'index.js',
        dependencies: { 'other-plugin': '^1.0.0' }
      }

      const plugin = new Plugin(manifest, '/path/to/plugin')

      assert.strictEqual(plugin.name, 'test-plugin')
      assert.strictEqual(plugin.version, '1.0.0')
      assert.strictEqual(plugin.displayName, 'Test Plugin')
      assert.strictEqual(plugin.state, 'discovered')
      assert.strictEqual(plugin.lifecycleState, 'inactive')
      assert.strictEqual(plugin.mainPath, path.join('/path/to/plugin', 'index.js'))
      assert.deepStrictEqual(plugin.dependencies, { 'other-plugin': '^1.0.0' })
    })

    it('should serialize to JSON', () => {
      const manifest = {
        name: 'test-plugin',
        version: '1.0.0',
        displayName: 'Test Plugin',
        description: 'A test plugin',
        main: 'index.js'
      }

      const plugin = new Plugin(manifest, '/path/to/plugin')
      const json = plugin.toJSON()

      assert.strictEqual(json.name, 'test-plugin')
      assert.strictEqual(json.version, '1.0.0')
      assert.strictEqual(json.state, 'discovered')
      assert.strictEqual(json.lifecycleState, 'inactive')
      assert.ok(json.manifest)
    })

    it('should track lifecycle state transitions', () => {
      const manifest = {
        name: 'test-plugin',
        version: '1.0.0',
        displayName: 'Test Plugin',
        description: 'A test plugin',
        main: 'index.js'
      }

      const plugin = new Plugin(manifest, '/path/to/plugin')

      // Initial state
      assert.strictEqual(plugin.lifecycleState, 'inactive')
      assert.strictEqual(plugin.isActive(), false)

      // Transition to activating
      plugin.setLifecycleState('activating')
      assert.strictEqual(plugin.lifecycleState, 'activating')

      // Transition to active
      plugin.setLifecycleState('active')
      assert.strictEqual(plugin.lifecycleState, 'active')
      assert.strictEqual(plugin.isActive(), true)
      assert.ok(plugin.activatedAt)

      // Transition to deactivating
      plugin.setLifecycleState('deactivating')
      assert.strictEqual(plugin.lifecycleState, 'deactivating')

      // Transition to inactive
      plugin.setLifecycleState('inactive')
      assert.strictEqual(plugin.lifecycleState, 'inactive')
      assert.strictEqual(plugin.isActive(), false)
      assert.ok(plugin.deactivatedAt)
    })

    it('should record activation errors', () => {
      const manifest = {
        name: 'test-plugin',
        version: '1.0.0',
        displayName: 'Test Plugin',
        description: 'A test plugin',
        main: 'index.js'
      }

      const plugin = new Plugin(manifest, '/path/to/plugin')

      plugin.setActivationError(new Error('Activation failed'))

      assert.strictEqual(plugin.lifecycleState, 'activation-failed')
      assert.strictEqual(plugin.activationError, 'Activation failed')
    })

    it('should check if plugin can be activated', () => {
      const manifest = {
        name: 'test-plugin',
        version: '1.0.0',
        displayName: 'Test Plugin',
        description: 'A test plugin',
        main: 'index.js'
      }

      const plugin = new Plugin(manifest, '/path/to/plugin')

      // Cannot activate in discovered state
      assert.strictEqual(plugin.canActivate(), false)

      // Can activate when loaded
      plugin.state = 'loaded'
      assert.strictEqual(plugin.canActivate(), true)

      // Cannot activate when already active
      plugin.setLifecycleState('active')
      assert.strictEqual(plugin.canActivate(), false)

      // Can activate after failure
      plugin.setActivationError('Failed')
      assert.strictEqual(plugin.canActivate(), true)
    })
  })

  describe('PluginLoader initialization', () => {
    it('should create with default plugins directory', () => {
      const loader = new PluginLoader()
      const expectedDir = path.join(os.homedir(), '.puffin', 'plugins')

      assert.strictEqual(loader.getPluginsDirectory(), expectedDir)
    })

    it('should create with custom plugins directory', () => {
      const loader = new PluginLoader({ pluginsDir: testPluginsDir })

      assert.strictEqual(loader.getPluginsDirectory(), testPluginsDir)
    })

    it('should start with no plugins', () => {
      const loader = new PluginLoader({ pluginsDir: testPluginsDir })

      assert.strictEqual(loader.getAllPlugins().length, 0)
      assert.strictEqual(loader.getLoadedPlugins().length, 0)
      assert.strictEqual(loader.getFailedPlugins().length, 0)
    })
  })

  describe('Plugin discovery', () => {
    let loader

    beforeEach(async () => {
      loader = new PluginLoader({ pluginsDir: testPluginsDir })

      // Clean up test directory
      const entries = await fs.readdir(testPluginsDir).catch(() => [])
      for (const entry of entries) {
        await fs.rm(path.join(testPluginsDir, entry), { recursive: true, force: true })
      }
    })

    it('should discover plugins with valid manifests', async () => {
      // Create a test plugin
      const pluginDir = path.join(testPluginsDir, 'valid-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      await fs.writeFile(
        path.join(pluginDir, 'puffin-plugin.json'),
        JSON.stringify({
          name: 'valid-plugin',
          version: '1.0.0',
          displayName: 'Valid Plugin',
          description: 'A valid test plugin',
          main: 'index.js'
        })
      )

      const discovered = await loader.discoverPlugins()

      assert.strictEqual(discovered.length, 1)
      assert.strictEqual(discovered[0].name, 'valid-plugin')
    })

    it('should skip directories without manifest', async () => {
      // Create a directory without manifest
      const noManifestDir = path.join(testPluginsDir, 'no-manifest')
      await fs.mkdir(noManifestDir, { recursive: true })
      await fs.writeFile(path.join(noManifestDir, 'index.js'), 'module.exports = {}')

      const discovered = await loader.discoverPlugins()

      assert.strictEqual(discovered.length, 0)
    })

    it('should skip files (non-directories)', async () => {
      // Create a file instead of directory
      await fs.writeFile(path.join(testPluginsDir, 'not-a-plugin.txt'), 'just a file')

      const discovered = await loader.discoverPlugins()

      assert.strictEqual(discovered.length, 0)
    })

    it('should emit plugin:discovered event', async () => {
      const pluginDir = path.join(testPluginsDir, 'event-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      await fs.writeFile(
        path.join(pluginDir, 'puffin-plugin.json'),
        JSON.stringify({
          name: 'event-plugin',
          version: '1.0.0',
          displayName: 'Event Plugin',
          description: 'Tests events',
          main: 'index.js'
        })
      )

      let discoveredPlugin = null
      loader.on('plugin:discovered', ({ plugin }) => {
        discoveredPlugin = plugin
      })

      await loader.discoverPlugins()

      assert.ok(discoveredPlugin)
      assert.strictEqual(discoveredPlugin.name, 'event-plugin')
    })
  })

  describe('Dependency resolution', () => {
    it('should order plugins with no dependencies', () => {
      const loader = new PluginLoader({ pluginsDir: testPluginsDir })

      const pluginA = new Plugin({
        name: 'plugin-a', version: '1.0.0', displayName: 'A',
        description: 'Plugin A', main: 'index.js'
      }, '/a')

      const pluginB = new Plugin({
        name: 'plugin-b', version: '1.0.0', displayName: 'B',
        description: 'Plugin B', main: 'index.js'
      }, '/b')

      const result = loader.resolveDependencies([pluginA, pluginB])

      assert.strictEqual(result.ordered.length, 2)
      assert.strictEqual(result.circular.length, 0)
      assert.strictEqual(result.missing.size, 0)
    })

    it('should order plugins respecting dependencies', () => {
      const loader = new PluginLoader({ pluginsDir: testPluginsDir })

      const pluginA = new Plugin({
        name: 'plugin-a', version: '1.0.0', displayName: 'A',
        description: 'Plugin A', main: 'index.js'
      }, '/a')

      const pluginB = new Plugin({
        name: 'plugin-b', version: '1.0.0', displayName: 'B',
        description: 'Plugin B', main: 'index.js',
        dependencies: { 'plugin-a': '^1.0.0' }
      }, '/b')

      const result = loader.resolveDependencies([pluginA, pluginB])

      assert.strictEqual(result.ordered.length, 2)
      assert.strictEqual(result.ordered[0].name, 'plugin-a')
      assert.strictEqual(result.ordered[1].name, 'plugin-b')
    })

    it('should detect circular dependencies', () => {
      const loader = new PluginLoader({ pluginsDir: testPluginsDir })

      const pluginA = new Plugin({
        name: 'plugin-a', version: '1.0.0', displayName: 'A',
        description: 'Plugin A', main: 'index.js',
        dependencies: { 'plugin-b': '^1.0.0' }
      }, '/a')

      const pluginB = new Plugin({
        name: 'plugin-b', version: '1.0.0', displayName: 'B',
        description: 'Plugin B', main: 'index.js',
        dependencies: { 'plugin-a': '^1.0.0' }
      }, '/b')

      const result = loader.resolveDependencies([pluginA, pluginB])

      assert.strictEqual(result.ordered.length, 0)
      assert.strictEqual(result.circular.length, 2)
    })

    it('should detect missing dependencies', () => {
      const loader = new PluginLoader({ pluginsDir: testPluginsDir })

      const pluginA = new Plugin({
        name: 'plugin-a', version: '1.0.0', displayName: 'A',
        description: 'Plugin A', main: 'index.js',
        dependencies: { 'missing-plugin': '^1.0.0' }
      }, '/a')

      const result = loader.resolveDependencies([pluginA])

      assert.strictEqual(result.ordered.length, 0)
      assert.ok(result.missing.has('plugin-a'))
      assert.deepStrictEqual(result.missing.get('plugin-a'), ['missing-plugin'])
    })
  })

  describe('Plugin loading', () => {
    let loader

    beforeEach(async () => {
      loader = new PluginLoader({ pluginsDir: testPluginsDir })

      // Clean up test directory
      const entries = await fs.readdir(testPluginsDir).catch(() => [])
      for (const entry of entries) {
        await fs.rm(path.join(testPluginsDir, entry), { recursive: true, force: true })
      }
    })

    it('should load a valid plugin', async () => {
      // Create a valid plugin
      const pluginDir = path.join(testPluginsDir, 'loadable-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      await fs.writeFile(
        path.join(pluginDir, 'puffin-plugin.json'),
        JSON.stringify({
          name: 'loadable-plugin',
          version: '1.0.0',
          displayName: 'Loadable Plugin',
          description: 'A loadable test plugin',
          main: 'index.js'
        })
      )
      await fs.writeFile(
        path.join(pluginDir, 'index.js'),
        `module.exports = {
          activate: async (context) => { console.log('activated') },
          deactivate: async () => { console.log('deactivated') }
        }`
      )

      const result = await loader.loadPlugins()

      assert.strictEqual(result.loaded.length, 1)
      assert.strictEqual(result.failed.length, 0)
      assert.strictEqual(result.loaded[0].name, 'loadable-plugin')
      assert.strictEqual(result.loaded[0].state, 'loaded')
    })

    it('should fail plugins without activate function', async () => {
      const pluginDir = path.join(testPluginsDir, 'no-activate')
      await fs.mkdir(pluginDir, { recursive: true })
      await fs.writeFile(
        path.join(pluginDir, 'puffin-plugin.json'),
        JSON.stringify({
          name: 'no-activate',
          version: '1.0.0',
          displayName: 'No Activate',
          description: 'Missing activate',
          main: 'index.js'
        })
      )
      await fs.writeFile(
        path.join(pluginDir, 'index.js'),
        'module.exports = {}'
      )

      const result = await loader.loadPlugins()

      assert.strictEqual(result.loaded.length, 0)
      assert.strictEqual(result.failed.length, 1)
      assert.ok(result.failed[0].error.includes('activate'))
    })

    it('should emit plugins:complete event', async () => {
      let completeEvent = null
      loader.on('plugins:complete', (event) => {
        completeEvent = event
      })

      await loader.loadPlugins()

      assert.ok(completeEvent)
      assert.ok(Array.isArray(completeEvent.loaded))
      assert.ok(Array.isArray(completeEvent.failed))
    })
  })

  describe('getSummary', () => {
    it('should return correct summary', async () => {
      const loader = new PluginLoader({ pluginsDir: testPluginsDir })

      // Create a valid plugin
      const pluginDir = path.join(testPluginsDir, 'summary-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      await fs.writeFile(
        path.join(pluginDir, 'puffin-plugin.json'),
        JSON.stringify({
          name: 'summary-plugin',
          version: '1.0.0',
          displayName: 'Summary Plugin',
          description: 'For summary test',
          main: 'index.js'
        })
      )
      await fs.writeFile(
        path.join(pluginDir, 'index.js'),
        'module.exports = { activate: async () => {} }'
      )

      await loader.loadPlugins()

      const summary = loader.getSummary()

      assert.strictEqual(summary.total, 1)
      assert.strictEqual(summary.loaded, 1)
      assert.strictEqual(summary.failed, 0)
      assert.strictEqual(summary.pluginsDirectory, testPluginsDir)
      assert.strictEqual(summary.initialized, true)
    })
  })
})

describe('EventEmitter behavior', () => {
  it('should emit all lifecycle events in order', async () => {
    const testDir = path.join(os.tmpdir(), `puffin-events-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })

    // Create a valid plugin
    const pluginDir = path.join(testDir, 'event-test')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'puffin-plugin.json'),
      JSON.stringify({
        name: 'event-test',
        version: '1.0.0',
        displayName: 'Event Test',
        description: 'Tests event order',
        main: 'index.js'
      })
    )
    await fs.writeFile(
      path.join(pluginDir, 'index.js'),
      'module.exports = { activate: async () => {} }'
    )

    const { PluginLoader } = require('../../src/main/plugins/plugin-loader')
    const loader = new PluginLoader({ pluginsDir: testDir })

    const events = []
    loader.on('plugin:discovered', () => events.push('discovered'))
    loader.on('plugin:validated', () => events.push('validated'))
    loader.on('plugin:loaded', () => events.push('loaded'))
    loader.on('plugins:discovery-complete', () => events.push('discovery-complete'))
    loader.on('plugins:complete', () => events.push('complete'))

    await loader.loadPlugins()

    assert.deepStrictEqual(events, [
      'discovered',
      'discovery-complete',
      'validated',
      'loaded',
      'complete'
    ])

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true })
  })
})

describe('Manifest Validation Error Handling', () => {
  let testDir
  let PluginLoader

  before(async () => {
    testDir = path.join(os.tmpdir(), `puffin-validation-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })
    PluginLoader = require('../../src/main/plugins/plugin-loader').PluginLoader
  })

  after(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  beforeEach(async () => {
    // Clean up test directory between tests
    const entries = await fs.readdir(testDir).catch(() => [])
    for (const entry of entries) {
      await fs.rm(path.join(testDir, entry), { recursive: true, force: true })
    }
  })

  it('should reject plugin with missing required fields', async () => {
    const pluginDir = path.join(testDir, 'missing-fields')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'puffin-plugin.json'),
      JSON.stringify({
        name: 'missing-fields'
        // Missing: version, displayName, description, main
      })
    )

    const loader = new PluginLoader({ pluginsDir: testDir })
    let validationEvent = null
    loader.on('plugin:validation-failed', (event) => {
      validationEvent = event
    })

    const result = await loader.loadPlugins()

    assert.strictEqual(result.loaded.length, 0)
    assert.strictEqual(result.failed.length, 1)
    assert.ok(validationEvent)
    assert.ok(validationEvent.errors.length > 0)

    // Check that errors include field information
    const versionError = validationEvent.errors.find(e =>
      e.message.includes('version') || e.field === 'version'
    )
    assert.ok(versionError, 'Should have error about missing version')
  })

  it('should reject plugin with invalid name format', async () => {
    const pluginDir = path.join(testDir, 'Invalid-Name')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'puffin-plugin.json'),
      JSON.stringify({
        name: 'Invalid-Name', // Should be lowercase
        version: '1.0.0',
        displayName: 'Invalid Name Plugin',
        description: 'Has invalid name',
        main: 'index.js'
      })
    )

    const loader = new PluginLoader({ pluginsDir: testDir })
    let validationEvent = null
    loader.on('plugin:validation-failed', (event) => {
      validationEvent = event
    })

    const result = await loader.loadPlugins()

    assert.strictEqual(result.loaded.length, 0)
    assert.strictEqual(result.failed.length, 1)
    assert.ok(validationEvent)

    // Check error includes field name and suggestion
    const nameError = validationEvent.errors.find(e =>
      e.field === 'name' || e.message.includes('name')
    )
    assert.ok(nameError, 'Should have error about invalid name')
    assert.ok(nameError.suggestion, 'Should have a suggestion for fixing the error')
  })

  it('should reject plugin with invalid version format', async () => {
    const pluginDir = path.join(testDir, 'bad-version')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'puffin-plugin.json'),
      JSON.stringify({
        name: 'bad-version',
        version: 'not-semver', // Invalid version
        displayName: 'Bad Version Plugin',
        description: 'Has invalid version',
        main: 'index.js'
      })
    )

    const loader = new PluginLoader({ pluginsDir: testDir })
    let validationEvent = null
    loader.on('plugin:validation-failed', (event) => {
      validationEvent = event
    })

    const result = await loader.loadPlugins()

    assert.strictEqual(result.loaded.length, 0)
    assert.strictEqual(result.failed.length, 1)
    assert.ok(validationEvent)

    const versionError = validationEvent.errors.find(e =>
      e.field === 'version' || e.message.includes('version')
    )
    assert.ok(versionError, 'Should have error about invalid version')
  })

  it('should reject plugin with missing entry point file', async () => {
    const pluginDir = path.join(testDir, 'missing-main')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'puffin-plugin.json'),
      JSON.stringify({
        name: 'missing-main',
        version: '1.0.0',
        displayName: 'Missing Main Plugin',
        description: 'Entry point does not exist',
        main: 'nonexistent.js' // File does not exist
      })
    )

    const loader = new PluginLoader({ pluginsDir: testDir })
    let validationEvent = null
    loader.on('plugin:validation-failed', (event) => {
      validationEvent = event
    })

    const result = await loader.loadPlugins()

    assert.strictEqual(result.loaded.length, 0)
    assert.strictEqual(result.failed.length, 1)
    assert.ok(validationEvent)

    const mainError = validationEvent.errors.find(e => e.field === 'main')
    assert.ok(mainError, 'Should have error about missing entry point')
    assert.ok(mainError.message.includes('Entry point not found'))
    assert.ok(mainError.suggestion.includes('Create the file'))
  })

  it('should include validationErrors in plugin object', async () => {
    const pluginDir = path.join(testDir, 'validation-errors-test')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'puffin-plugin.json'),
      JSON.stringify({
        name: 'validation-errors-test',
        version: 'bad',
        displayName: 'Test',
        description: 'Test',
        main: 'index.js'
      })
    )

    const loader = new PluginLoader({ pluginsDir: testDir })
    const result = await loader.loadPlugins()

    assert.strictEqual(result.failed.length, 1)
    const failedPlugin = result.failed[0]

    assert.ok(failedPlugin.validationErrors, 'Plugin should have validationErrors array')
    assert.ok(Array.isArray(failedPlugin.validationErrors))
    assert.ok(failedPlugin.validationErrors.length > 0)

    // Check error structure
    const error = failedPlugin.validationErrors[0]
    assert.ok(error.field !== undefined, 'Error should have field property')
    assert.ok(error.message, 'Error should have message property')
  })

  it('should include validationErrors in getErrors() result', async () => {
    const pluginDir = path.join(testDir, 'get-errors-test')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'puffin-plugin.json'),
      JSON.stringify({
        name: 'get-errors-test',
        version: '1.0',  // Invalid semver
        displayName: 'Test',
        description: 'Test',
        main: 'index.js'
      })
    )

    const loader = new PluginLoader({ pluginsDir: testDir })
    await loader.loadPlugins()

    const errors = loader.getErrors()
    assert.strictEqual(errors.length, 1)
    assert.ok(errors[0].validationErrors, 'getErrors should include validationErrors')
  })

  it('should reject plugin with invalid type for field', async () => {
    const pluginDir = path.join(testDir, 'wrong-type')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'puffin-plugin.json'),
      JSON.stringify({
        name: 'wrong-type',
        version: '1.0.0',
        displayName: 'Wrong Type Plugin',
        description: 12345, // Should be string
        main: 'index.js'
      })
    )

    const loader = new PluginLoader({ pluginsDir: testDir })
    let validationEvent = null
    loader.on('plugin:validation-failed', (event) => {
      validationEvent = event
    })

    const result = await loader.loadPlugins()

    assert.strictEqual(result.loaded.length, 0)
    assert.strictEqual(result.failed.length, 1)
    assert.ok(validationEvent)

    const typeError = validationEvent.errors.find(e =>
      e.keyword === 'type' || e.message.includes('type')
    )
    assert.ok(typeError, 'Should have error about wrong type')
  })

  it('should allow valid plugins to proceed without issues', async () => {
    const pluginDir = path.join(testDir, 'valid-plugin')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'puffin-plugin.json'),
      JSON.stringify({
        name: 'valid-plugin',
        version: '1.0.0',
        displayName: 'Valid Plugin',
        description: 'A properly formatted plugin',
        main: 'index.js',
        author: 'Test Author',
        keywords: ['test', 'valid'],
        engines: {
          puffin: '>=2.0.0'
        }
      })
    )
    await fs.writeFile(
      path.join(pluginDir, 'index.js'),
      'module.exports = { activate: async () => {}, deactivate: async () => {} }'
    )

    const loader = new PluginLoader({ pluginsDir: testDir })
    let validatedEvent = null
    loader.on('plugin:validated', (event) => {
      validatedEvent = event
    })

    const result = await loader.loadPlugins()

    assert.strictEqual(result.loaded.length, 1)
    assert.strictEqual(result.failed.length, 0)
    assert.ok(validatedEvent, 'Should emit validated event')
    assert.strictEqual(validatedEvent.plugin.state, 'validated')
  })
})
