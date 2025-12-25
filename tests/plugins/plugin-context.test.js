/**
 * PluginContext Tests
 *
 * Tests for the plugin context API that plugins use to register handlers.
 */

const { PluginContext } = require('../../src/main/plugins/plugin-context')
const { PluginRegistry } = require('../../src/main/plugins/plugin-registry')

describe('PluginContext', () => {
  let context
  let registry
  let mockIpcMain

  beforeEach(() => {
    registry = new PluginRegistry()
    mockIpcMain = {
      handlers: new Map(),
      handle: jest.fn((channel, handler) => {
        mockIpcMain.handlers.set(channel, handler)
      }),
      removeHandler: jest.fn((channel) => {
        mockIpcMain.handlers.delete(channel)
      })
    }

    context = new PluginContext('test-plugin', '/path/to/plugin', {
      registry,
      ipcMain: mockIpcMain,
      services: { testService: { foo: 'bar' } }
    })
  })

  afterEach(() => {
    context._cleanup()
  })

  describe('constructor', () => {
    it('should set plugin name and directory', () => {
      expect(context.pluginName).toBe('test-plugin')
      expect(context.pluginDirectory).toBe('/path/to/plugin')
    })

    it('should initialize empty registrations tracking', () => {
      expect(context._registrations.actions).toEqual([])
      expect(context._registrations.acceptors).toEqual([])
      expect(context._registrations.reactors).toEqual([])
      expect(context._registrations.components).toEqual([])
      expect(context._registrations.ipcHandlers).toEqual([])
    })
  })

  describe('registerAction', () => {
    it('should register an action with qualified name', () => {
      const handler = jest.fn()
      context.registerAction('doSomething', handler)

      const registered = registry.getAction('test-plugin:doSomething')
      expect(registered).toBe(handler)
    })

    it('should track registration for cleanup', () => {
      context.registerAction('action1', jest.fn())
      context.registerAction('action2', jest.fn())

      expect(context._registrations.actions).toHaveLength(2)
      expect(context._registrations.actions).toContain('test-plugin:action1')
      expect(context._registrations.actions).toContain('test-plugin:action2')
    })

    it('should allow calling registered action', async () => {
      const handler = jest.fn().mockResolvedValue('result')
      context.registerAction('myAction', handler)

      const action = registry.getAction('test-plugin:myAction')
      const result = await action({ data: 'test' })

      expect(handler).toHaveBeenCalledWith({ data: 'test' })
      expect(result).toBe('result')
    })
  })

  describe('registerAcceptor', () => {
    it('should register an acceptor with qualified name', () => {
      const handler = jest.fn()
      context.registerAcceptor('validateData', handler)

      const registered = registry.getAcceptor('test-plugin:validateData')
      expect(registered).toBe(handler)
    })

    it('should track registration for cleanup', () => {
      context.registerAcceptor('acceptor1', jest.fn())
      expect(context._registrations.acceptors).toContain('test-plugin:acceptor1')
    })
  })

  describe('registerReactor', () => {
    it('should register a reactor with qualified name', () => {
      const handler = jest.fn()
      context.registerReactor('onUpdate', handler)

      const registered = registry.getReactor('test-plugin:onUpdate')
      expect(registered).toBe(handler)
    })

    it('should track registration for cleanup', () => {
      context.registerReactor('reactor1', jest.fn())
      expect(context._registrations.reactors).toContain('test-plugin:reactor1')
    })
  })

  describe('registerComponent', () => {
    it('should register a component with qualified name', () => {
      const component = { render: () => {} }
      context.registerComponent('MyWidget', component)

      const registered = registry.getComponent('test-plugin:MyWidget')
      expect(registered).toBe(component)
    })

    it('should track registration for cleanup', () => {
      context.registerComponent('Widget1', {})
      expect(context._registrations.components).toContain('test-plugin:Widget1')
    })
  })

  describe('registerIpcHandler', () => {
    it('should register IPC handler with plugin-scoped channel', () => {
      const handler = jest.fn()
      context.registerIpcHandler('getData', handler)

      expect(mockIpcMain.handle).toHaveBeenCalledWith(
        'plugin:test-plugin:getData',
        expect.any(Function)
      )
    })

    it('should track IPC handler for cleanup', () => {
      context.registerIpcHandler('handler1', jest.fn())
      expect(context._registrations.ipcHandlers).toContain('plugin:test-plugin:handler1')
    })

    it('should wrap handler to catch errors', async () => {
      const errorHandler = jest.fn().mockRejectedValue(new Error('Test error'))
      context.registerIpcHandler('failingHandler', errorHandler)

      const wrappedHandler = mockIpcMain.handlers.get('plugin:test-plugin:failingHandler')
      const result = await wrappedHandler({}, 'arg1')

      expect(result).toEqual({
        error: 'Test error',
        plugin: 'test-plugin'
      })
    })
  })

  describe('subscribe', () => {
    it('should subscribe to events', () => {
      const handler = jest.fn()
      context.subscribe('someEvent', handler)

      // Emit event
      registry.emitPluginEvent('someEvent', 'other-plugin', { value: 42 })

      expect(handler).toHaveBeenCalledWith({
        source: 'other-plugin',
        data: { value: 42 }
      })
    })

    it('should return unsubscribe function', () => {
      const handler = jest.fn()
      const unsubscribe = context.subscribe('event', handler)

      unsubscribe()
      registry.emitPluginEvent('event', 'source', {})

      expect(handler).not.toHaveBeenCalled()
    })

    it('should track subscription for cleanup', () => {
      context.subscribe('event1', jest.fn())
      context.subscribe('event2', jest.fn())

      expect(context._subscriptions).toHaveLength(2)
    })
  })

  describe('emit', () => {
    it('should emit event with plugin as source', () => {
      const handler = jest.fn()
      registry.subscribe('myEvent', 'listener-plugin', handler)

      context.emit('myEvent', { message: 'hello' })

      expect(handler).toHaveBeenCalledWith({
        source: 'test-plugin',
        data: { message: 'hello' }
      })
    })
  })

  describe('callAction', () => {
    it('should call registered action by qualified name', async () => {
      const otherContext = new PluginContext('other-plugin', '/other', { registry })
      const handler = jest.fn().mockResolvedValue('success')
      otherContext.registerAction('someAction', handler)

      const result = await context.callAction('other-plugin:someAction', { arg: 1 })

      expect(handler).toHaveBeenCalledWith({ arg: 1 })
      expect(result).toBe('success')

      otherContext._cleanup()
    })

    it('should throw error for unknown action', async () => {
      await expect(context.callAction('unknown:action', {}))
        .rejects.toThrow('Action not found: unknown:action')
    })
  })

  describe('getService', () => {
    it('should return registered service', () => {
      const service = context.getService('testService')
      expect(service).toEqual({ foo: 'bar' })
    })

    it('should return undefined for unknown service', () => {
      const service = context.getService('unknownService')
      expect(service).toBeUndefined()
    })
  })

  describe('log', () => {
    let consoleSpy

    beforeEach(() => {
      consoleSpy = {
        log: jest.spyOn(console, 'log').mockImplementation(),
        warn: jest.spyOn(console, 'warn').mockImplementation(),
        error: jest.spyOn(console, 'error').mockImplementation()
      }
    })

    afterEach(() => {
      consoleSpy.log.mockRestore()
      consoleSpy.warn.mockRestore()
      consoleSpy.error.mockRestore()
    })

    it('should log info with plugin prefix', () => {
      context.log.info('Test message')
      expect(consoleSpy.log).toHaveBeenCalledWith('[Plugin:test-plugin]', 'Test message')
    })

    it('should log warn with plugin prefix', () => {
      context.log.warn('Warning message')
      expect(consoleSpy.warn).toHaveBeenCalledWith('[Plugin:test-plugin]', 'Warning message')
    })

    it('should log error with plugin prefix', () => {
      context.log.error('Error message')
      expect(consoleSpy.error).toHaveBeenCalledWith('[Plugin:test-plugin]', 'Error message')
    })

    it('should handle multiple arguments', () => {
      context.log.info('Message', { data: 1 }, 'more')
      expect(consoleSpy.log).toHaveBeenCalledWith('[Plugin:test-plugin]', 'Message', { data: 1 }, 'more')
    })
  })

  describe('storage', () => {
    const fs = require('fs').promises
    const path = require('path')
    const os = require('os')

    it('should have correct storage path', () => {
      const expectedPath = path.join(os.homedir(), '.puffin', 'plugin-data', 'test-plugin')
      expect(context.storage.path).toBe(expectedPath)
    })

    // Note: Full storage tests would require mocking fs operations
    // These are integration tests that would need file system access
  })

  describe('_cleanup', () => {
    it('should unregister all registrations from registry', () => {
      context.registerAction('action1', jest.fn())
      context.registerAcceptor('acceptor1', jest.fn())
      context.registerReactor('reactor1', jest.fn())
      context.registerComponent('component1', {})
      context.registerIpcHandler('handler1', jest.fn())

      context._cleanup()

      expect(registry.getAction('test-plugin:action1')).toBeNull()
      expect(registry.getAcceptor('test-plugin:acceptor1')).toBeNull()
      expect(registry.getReactor('test-plugin:reactor1')).toBeNull()
      expect(registry.getComponent('test-plugin:component1')).toBeNull()
    })

    it('should remove IPC handlers', () => {
      context.registerIpcHandler('handler1', jest.fn())
      context.registerIpcHandler('handler2', jest.fn())

      context._cleanup()

      expect(mockIpcMain.removeHandler).toHaveBeenCalledWith('plugin:test-plugin:handler1')
      expect(mockIpcMain.removeHandler).toHaveBeenCalledWith('plugin:test-plugin:handler2')
    })

    it('should unsubscribe from all events', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      context.subscribe('event1', handler1)
      context.subscribe('event2', handler2)

      context._cleanup()

      // Emit events after cleanup
      registry.emitPluginEvent('event1', 'source', {})
      registry.emitPluginEvent('event2', 'source', {})

      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).not.toHaveBeenCalled()
    })

    it('should clear internal tracking', () => {
      context.registerAction('action1', jest.fn())
      context.subscribe('event1', jest.fn())

      context._cleanup()

      expect(context._registrations.actions).toEqual([])
      expect(context._subscriptions).toEqual([])
    })
  })
})
