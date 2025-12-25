/**
 * PluginRegistry Tests
 *
 * Tests for the central registry tracking all plugin registrations.
 */

const { PluginRegistry } = require('../../src/main/plugins/plugin-registry')

describe('PluginRegistry', () => {
  let registry

  beforeEach(() => {
    registry = new PluginRegistry()
  })

  afterEach(() => {
    registry.clear()
  })

  describe('action registration', () => {
    it('should register and retrieve an action', () => {
      const handler = jest.fn()
      registry.registerAction('plugin-a', 'plugin-a:doThing', handler)

      expect(registry.getAction('plugin-a:doThing')).toBe(handler)
    })

    it('should return null for unregistered action', () => {
      expect(registry.getAction('unknown:action')).toBeNull()
    })

    it('should emit event on registration', () => {
      const listener = jest.fn()
      registry.on('action:registered', listener)

      registry.registerAction('plugin-a', 'plugin-a:action', jest.fn())

      expect(listener).toHaveBeenCalledWith({
        pluginName: 'plugin-a',
        name: 'plugin-a:action'
      })
    })

    it('should list all registered actions', () => {
      registry.registerAction('plugin-a', 'plugin-a:action1', jest.fn())
      registry.registerAction('plugin-b', 'plugin-b:action2', jest.fn())

      const actions = registry.getAllActions()

      expect(actions).toHaveLength(2)
      expect(actions).toContainEqual({ name: 'plugin-a:action1', pluginName: 'plugin-a' })
      expect(actions).toContainEqual({ name: 'plugin-b:action2', pluginName: 'plugin-b' })
    })
  })

  describe('acceptor registration', () => {
    it('should register and retrieve an acceptor', () => {
      const handler = jest.fn()
      registry.registerAcceptor('plugin-a', 'plugin-a:validate', handler)

      expect(registry.getAcceptor('plugin-a:validate')).toBe(handler)
    })

    it('should return all acceptor handlers', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      registry.registerAcceptor('plugin-a', 'plugin-a:validate1', handler1)
      registry.registerAcceptor('plugin-b', 'plugin-b:validate2', handler2)

      const handlers = registry.getAcceptorHandlers()

      expect(handlers).toHaveLength(2)
      expect(handlers).toContain(handler1)
      expect(handlers).toContain(handler2)
    })

    it('should list all registered acceptors', () => {
      registry.registerAcceptor('plugin-a', 'plugin-a:acceptor1', jest.fn())

      const acceptors = registry.getAllAcceptors()

      expect(acceptors).toHaveLength(1)
      expect(acceptors[0]).toEqual({ name: 'plugin-a:acceptor1', pluginName: 'plugin-a' })
    })
  })

  describe('reactor registration', () => {
    it('should register and retrieve a reactor', () => {
      const handler = jest.fn()
      registry.registerReactor('plugin-a', 'plugin-a:onUpdate', handler)

      expect(registry.getReactor('plugin-a:onUpdate')).toBe(handler)
    })

    it('should list all registered reactors', () => {
      registry.registerReactor('plugin-a', 'plugin-a:reactor1', jest.fn())
      registry.registerReactor('plugin-a', 'plugin-a:reactor2', jest.fn())

      const reactors = registry.getAllReactors()

      expect(reactors).toHaveLength(2)
    })
  })

  describe('component registration', () => {
    it('should register and retrieve a component', () => {
      const component = { render: () => {} }
      registry.registerComponent('plugin-a', 'plugin-a:Widget', component)

      expect(registry.getComponent('plugin-a:Widget')).toBe(component)
    })

    it('should list all registered components', () => {
      registry.registerComponent('plugin-a', 'plugin-a:Widget1', {})
      registry.registerComponent('plugin-b', 'plugin-b:Widget2', {})

      const components = registry.getAllComponents()

      expect(components).toHaveLength(2)
    })
  })

  describe('IPC handler registration', () => {
    it('should register and track IPC handler', () => {
      const handler = jest.fn()
      registry.registerIpcHandler('plugin-a', 'plugin:plugin-a:getData', handler)

      const registrations = registry.getPluginRegistrations('plugin-a')
      expect(registrations.ipcHandlers).toBe(1)
    })

    it('should emit event on IPC handler registration', () => {
      const listener = jest.fn()
      registry.on('ipcHandler:registered', listener)

      registry.registerIpcHandler('plugin-a', 'plugin:plugin-a:handler', jest.fn())

      expect(listener).toHaveBeenCalledWith({
        pluginName: 'plugin-a',
        channel: 'plugin:plugin-a:handler'
      })
    })
  })

  describe('plugin-to-plugin communication', () => {
    it('should allow subscribing to events', () => {
      const handler = jest.fn()
      registry.subscribe('data:updated', 'listener-plugin', handler)

      registry.emitPluginEvent('data:updated', 'source-plugin', { value: 42 })

      expect(handler).toHaveBeenCalledWith({
        source: 'source-plugin',
        data: { value: 42 }
      })
    })

    it('should allow multiple subscribers', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()
      registry.subscribe('event', 'plugin-1', handler1)
      registry.subscribe('event', 'plugin-2', handler2)

      registry.emitPluginEvent('event', 'source', { msg: 'hello' })

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })

    it('should return unsubscribe function', () => {
      const handler = jest.fn()
      const unsubscribe = registry.subscribe('event', 'plugin', handler)

      unsubscribe()
      registry.emitPluginEvent('event', 'source', {})

      expect(handler).not.toHaveBeenCalled()
    })

    it('should handle errors in event handlers', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      const errorHandler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error')
      })
      const successHandler = jest.fn()

      registry.subscribe('event', 'failing-plugin', errorHandler)
      registry.subscribe('event', 'success-plugin', successHandler)

      registry.emitPluginEvent('event', 'source', {})

      // Error should be logged but not thrown
      expect(consoleSpy).toHaveBeenCalled()
      // Other handlers should still be called
      expect(successHandler).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('should do nothing when emitting to no subscribers', () => {
      // Should not throw
      expect(() => {
        registry.emitPluginEvent('nonexistent-event', 'source', {})
      }).not.toThrow()
    })
  })

  describe('plugin unregistration', () => {
    beforeEach(() => {
      registry.registerAction('plugin-a', 'plugin-a:action1', jest.fn())
      registry.registerAction('plugin-a', 'plugin-a:action2', jest.fn())
      registry.registerAcceptor('plugin-a', 'plugin-a:acceptor', jest.fn())
      registry.registerReactor('plugin-a', 'plugin-a:reactor', jest.fn())
      registry.registerComponent('plugin-a', 'plugin-a:component', {})
      registry.registerIpcHandler('plugin-a', 'plugin:plugin-a:handler', jest.fn())
      registry.subscribe('event', 'plugin-a', jest.fn())
    })

    it('should remove all registrations for a plugin', () => {
      registry.unregisterPlugin('plugin-a')

      expect(registry.getAction('plugin-a:action1')).toBeNull()
      expect(registry.getAction('plugin-a:action2')).toBeNull()
      expect(registry.getAcceptor('plugin-a:acceptor')).toBeNull()
      expect(registry.getReactor('plugin-a:reactor')).toBeNull()
      expect(registry.getComponent('plugin-a:component')).toBeNull()
    })

    it('should emit event on unregistration', () => {
      const listener = jest.fn()
      registry.on('plugin:unregistered', listener)

      registry.unregisterPlugin('plugin-a')

      expect(listener).toHaveBeenCalledWith({ pluginName: 'plugin-a' })
    })

    it('should remove event subscriptions', () => {
      const handler = jest.fn()
      registry.subscribe('test-event', 'plugin-a', handler)

      registry.unregisterPlugin('plugin-a')
      registry.emitPluginEvent('test-event', 'source', {})

      expect(handler).not.toHaveBeenCalled()
    })

    it('should not affect other plugins', () => {
      registry.registerAction('plugin-b', 'plugin-b:action', jest.fn())

      registry.unregisterPlugin('plugin-a')

      expect(registry.getAction('plugin-b:action')).not.toBeNull()
    })

    it('should handle unregistering non-existent plugin', () => {
      expect(() => {
        registry.unregisterPlugin('nonexistent-plugin')
      }).not.toThrow()
    })
  })

  describe('getPluginRegistrations', () => {
    it('should return registration counts for a plugin', () => {
      registry.registerAction('plugin-a', 'plugin-a:action1', jest.fn())
      registry.registerAction('plugin-a', 'plugin-a:action2', jest.fn())
      registry.registerAcceptor('plugin-a', 'plugin-a:acceptor', jest.fn())

      const registrations = registry.getPluginRegistrations('plugin-a')

      expect(registrations).toEqual({
        actions: 2,
        acceptors: 1,
        reactors: 0,
        components: 0,
        ipcHandlers: 0
      })
    })

    it('should return null for unknown plugin', () => {
      expect(registry.getPluginRegistrations('unknown')).toBeNull()
    })
  })

  describe('getSummary', () => {
    it('should return overall registry summary', () => {
      registry.registerAction('plugin-a', 'plugin-a:action', jest.fn())
      registry.registerAcceptor('plugin-b', 'plugin-b:acceptor', jest.fn())
      registry.subscribe('event', 'plugin-c', jest.fn())

      const summary = registry.getSummary()

      expect(summary).toEqual({
        plugins: 2, // plugin-a and plugin-b have registrations
        actions: 1,
        acceptors: 1,
        reactors: 0,
        components: 0,
        ipcHandlers: 0,
        subscriptions: 1
      })
    })
  })

  describe('clear', () => {
    it('should remove all registrations', () => {
      registry.registerAction('plugin-a', 'plugin-a:action', jest.fn())
      registry.registerAcceptor('plugin-b', 'plugin-b:acceptor', jest.fn())
      registry.subscribe('event', 'plugin-c', jest.fn())

      registry.clear()

      const summary = registry.getSummary()
      expect(summary.plugins).toBe(0)
      expect(summary.actions).toBe(0)
      expect(summary.acceptors).toBe(0)
      expect(summary.subscriptions).toBe(0)
    })

    it('should emit event on clear', () => {
      const listener = jest.fn()
      registry.on('registry:cleared', listener)

      registry.clear()

      expect(listener).toHaveBeenCalled()
    })
  })
})
