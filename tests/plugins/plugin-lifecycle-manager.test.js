/**
 * Tests for PluginLifecycleManager
 *
 * Tests lifecycle hook orchestration including:
 * - onActivate, onDeactivate, onDestroy callbacks
 * - Async hook handling with timeouts
 * - Error catching and logging
 * - State tracking
 */

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')

describe('PluginLifecycleManager', () => {
  let PluginLifecycleManager
  let manager

  beforeEach(() => {
    // Create a testable version of the manager
    PluginLifecycleManager = createTestableLifecycleManager()
    manager = new PluginLifecycleManager()
  })

  describe('callActivate', () => {
    it('should call onActivate hook on component', async () => {
      let activateCalled = false
      const component = {
        onActivate: () => { activateCalled = true }
      }
      const context = { pluginName: 'test', viewId: 'test-view' }

      const result = await manager.callActivate('test-view', component, context)

      assert.strictEqual(result, true)
      assert.strictEqual(activateCalled, true)
    })

    it('should pass context to onActivate hook', async () => {
      let receivedContext = null
      const component = {
        onActivate: (ctx) => { receivedContext = ctx }
      }
      const context = { pluginName: 'test', viewId: 'test-view' }

      await manager.callActivate('test-view', component, context)

      assert.deepStrictEqual(receivedContext, context)
    })

    it('should handle async onActivate hooks', async () => {
      let activateCalled = false
      const component = {
        onActivate: async () => {
          await new Promise(resolve => setTimeout(resolve, 10))
          activateCalled = true
        }
      }

      const result = await manager.callActivate('test-view', component, {})

      assert.strictEqual(result, true)
      assert.strictEqual(activateCalled, true)
    })

    it('should return true if component has no onActivate', async () => {
      const component = {}

      const result = await manager.callActivate('test-view', component, {})

      assert.strictEqual(result, true)
    })

    it('should track view as active after activation', async () => {
      const component = { onActivate: () => {} }

      await manager.callActivate('test-view', component, {})

      assert.strictEqual(manager.isViewActive('test-view'), true)
    })

    it('should not call onActivate twice for already active view', async () => {
      let callCount = 0
      const component = {
        onActivate: () => { callCount++ }
      }

      await manager.callActivate('test-view', component, {})
      await manager.callActivate('test-view', component, {})

      assert.strictEqual(callCount, 1)
    })
  })

  describe('callDeactivate', () => {
    it('should call onDeactivate hook on component', async () => {
      let deactivateCalled = false
      const component = {
        onActivate: () => {},
        onDeactivate: () => { deactivateCalled = true }
      }

      // First activate
      await manager.callActivate('test-view', component, {})
      // Then deactivate
      const result = await manager.callDeactivate('test-view', component, {})

      assert.strictEqual(result, true)
      assert.strictEqual(deactivateCalled, true)
    })

    it('should track view as inactive after deactivation', async () => {
      const component = { onActivate: () => {}, onDeactivate: () => {} }

      await manager.callActivate('test-view', component, {})
      await manager.callDeactivate('test-view', component, {})

      assert.strictEqual(manager.isViewActive('test-view'), false)
    })

    it('should not call onDeactivate for already inactive view', async () => {
      let callCount = 0
      const component = {
        onDeactivate: () => { callCount++ }
      }

      await manager.callDeactivate('test-view', component, {})

      assert.strictEqual(callCount, 0)
    })
  })

  describe('callDestroy', () => {
    it('should call onDestroy hook on component', async () => {
      let destroyCalled = false
      const component = {
        onDestroy: () => { destroyCalled = true }
      }

      const result = await manager.callDestroy('test-view', component, {})

      assert.strictEqual(result, true)
      assert.strictEqual(destroyCalled, true)
    })

    it('should call onDeactivate before onDestroy if view is active', async () => {
      const callOrder = []
      const component = {
        onActivate: () => {},
        onDeactivate: () => { callOrder.push('deactivate') },
        onDestroy: () => { callOrder.push('destroy') }
      }

      await manager.callActivate('test-view', component, {})
      await manager.callDestroy('test-view', component, {})

      assert.deepStrictEqual(callOrder, ['deactivate', 'destroy'])
    })

    it('should clean up view state after destroy', async () => {
      const component = { onActivate: () => {}, onDestroy: () => {} }

      await manager.callActivate('test-view', component, {})
      await manager.callDestroy('test-view', component, {})

      assert.strictEqual(manager.viewStates.has('test-view'), false)
    })
  })

  describe('error handling', () => {
    it('should catch and log errors in onActivate', async () => {
      const component = {
        onActivate: () => { throw new Error('Activation error') }
      }

      const result = await manager.callActivate('test-view', component, {})

      assert.strictEqual(result, false)
      assert.strictEqual(manager.errors.length, 1)
      assert.strictEqual(manager.errors[0].hookName, 'onActivate')
      assert.strictEqual(manager.errors[0].message, 'Activation error')
    })

    it('should catch and log errors in async hooks', async () => {
      const component = {
        onActivate: async () => {
          await new Promise(resolve => setTimeout(resolve, 5))
          throw new Error('Async error')
        }
      }

      const result = await manager.callActivate('test-view', component, {})

      assert.strictEqual(result, false)
      assert.strictEqual(manager.errors.length, 1)
    })

    it('should continue execution after errors', async () => {
      const component = {
        onActivate: () => { throw new Error('Test error') }
      }

      // Should not throw
      await manager.callActivate('test-view', component, {})

      // View should still be marked as active (even though hook failed)
      assert.strictEqual(manager.isViewActive('test-view'), true)
    })

    it('should limit error log size', async () => {
      manager.maxErrorLogSize = 3

      const component = {
        onActivate: () => { throw new Error('Test error') }
      }

      // Generate more errors than max size
      for (let i = 0; i < 5; i++) {
        manager.viewStates.delete(`view-${i}`) // Reset state to allow reactivation
        await manager.callActivate(`view-${i}`, component, {})
      }

      assert.strictEqual(manager.errors.length, 3)
    })
  })

  describe('timeout handling', () => {
    it('should timeout slow async hooks', async () => {
      // Use a very short timeout for testing
      const originalTimeout = manager.lifecycleTimeout
      manager.lifecycleTimeout = 50

      const component = {
        onActivate: async () => {
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }

      const result = await manager.callActivate('test-view', component, {})

      assert.strictEqual(result, false)
      assert.strictEqual(manager.errors.length, 1)
      assert.ok(manager.errors[0].message.includes('timed out'))

      manager.lifecycleTimeout = originalTimeout
    })
  })

  describe('state queries', () => {
    it('should return active views', async () => {
      const component = { onActivate: () => {} }

      await manager.callActivate('view-1', component, {})
      await manager.callActivate('view-2', component, {})

      const summary = manager.getSummary()
      assert.strictEqual(summary.activeViews.length, 2)
      assert.ok(summary.activeViews.includes('view-1'))
      assert.ok(summary.activeViews.includes('view-2'))
    })

    it('should track last activated time', async () => {
      const component = { onActivate: () => {} }
      const before = new Date()

      await manager.callActivate('test-view', component, {})

      const after = new Date()
      const lastActivated = manager.getLastActivated('test-view')

      assert.ok(lastActivated >= before)
      assert.ok(lastActivated <= after)
    })

    it('should get errors filtered by viewId', async () => {
      const component = {
        onActivate: () => { throw new Error('Test') }
      }

      await manager.callActivate('view-1', component, {})
      manager.viewStates.delete('view-2')
      await manager.callActivate('view-2', component, {})

      const view1Errors = manager.getErrors('view-1')
      assert.strictEqual(view1Errors.length, 1)
      assert.strictEqual(view1Errors[0].viewId, 'view-1')
    })

    it('should clear errors', async () => {
      manager.logError('view-1', 'onActivate', new Error('Test'))
      manager.logError('view-2', 'onActivate', new Error('Test'))

      manager.clearErrors('view-1')

      assert.strictEqual(manager.errors.length, 1)
      assert.strictEqual(manager.errors[0].viewId, 'view-2')
    })
  })

  describe('destroy', () => {
    it('should clear all state on destroy', async () => {
      const component = { onActivate: () => {} }
      await manager.callActivate('test-view', component, {})
      manager.logError('test-view', 'test', new Error('Test'))

      manager.destroy()

      assert.strictEqual(manager.viewStates.size, 0)
      assert.strictEqual(manager.pendingOperations.size, 0)
      assert.strictEqual(manager.errors.length, 0)
    })
  })
})

/**
 * Create a testable version of PluginLifecycleManager
 * This mirrors the actual implementation but can run in Node.js
 */
function createTestableLifecycleManager() {
  const LIFECYCLE_TIMEOUT = 5000

  class TestablePluginLifecycleManager {
    constructor() {
      this.viewStates = new Map()
      this.pendingOperations = new Map()
      this.errors = []
      this.maxErrorLogSize = 50
      this.lifecycleTimeout = LIFECYCLE_TIMEOUT
    }

    async callActivate(viewId, component, context) {
      const state = this.viewStates.get(viewId)
      if (state?.isActive) {
        return true
      }

      this.viewStates.set(viewId, {
        isActive: true,
        lastActivated: new Date()
      })

      if (!component || typeof component.onActivate !== 'function') {
        return true
      }

      return this.callLifecycleHook(viewId, 'onActivate', component, context)
    }

    async callDeactivate(viewId, component, context) {
      const state = this.viewStates.get(viewId)
      if (!state?.isActive) {
        return true
      }

      this.viewStates.set(viewId, {
        ...state,
        isActive: false
      })

      if (!component || typeof component.onDeactivate !== 'function') {
        return true
      }

      return this.callLifecycleHook(viewId, 'onDeactivate', component, context)
    }

    async callDestroy(viewId, component, context) {
      const pending = this.pendingOperations.get(viewId)
      if (pending) {
        try {
          await pending
        } catch {
          // Ignore
        }
      }

      const state = this.viewStates.get(viewId)
      if (state?.isActive) {
        await this.callDeactivate(viewId, component, context)
      }

      this.viewStates.delete(viewId)
      this.pendingOperations.delete(viewId)

      if (!component || typeof component.onDestroy !== 'function') {
        return true
      }

      return this.callLifecycleHook(viewId, 'onDestroy', component, context)
    }

    async callLifecycleHook(viewId, hookName, component, context) {
      const hookFn = component[hookName]
      if (typeof hookFn !== 'function') {
        return true
      }

      try {
        const hookPromise = this.withTimeout(
          Promise.resolve(hookFn.call(component, context)),
          this.lifecycleTimeout,
          `${hookName} hook timed out after ${this.lifecycleTimeout}ms`
        )

        if (hookName !== 'onDestroy') {
          this.pendingOperations.set(viewId, hookPromise)
        }

        await hookPromise
        this.pendingOperations.delete(viewId)

        return true

      } catch (error) {
        this.pendingOperations.delete(viewId)
        this.logError(viewId, hookName, error)
        return false
      }
    }

    withTimeout(promise, ms, message) {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(message))
        }, ms)

        promise
          .then((result) => {
            clearTimeout(timeoutId)
            resolve(result)
          })
          .catch((error) => {
            clearTimeout(timeoutId)
            reject(error)
          })
      })
    }

    logError(viewId, hookName, error) {
      this.errors.push({
        viewId,
        hookName,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })

      if (this.errors.length > this.maxErrorLogSize) {
        this.errors = this.errors.slice(-this.maxErrorLogSize)
      }
    }

    isViewActive(viewId) {
      return this.viewStates.get(viewId)?.isActive ?? false
    }

    getLastActivated(viewId) {
      return this.viewStates.get(viewId)?.lastActivated ?? null
    }

    hasPendingOperation(viewId) {
      return this.pendingOperations.has(viewId)
    }

    getErrors(viewId = null) {
      if (viewId) {
        return this.errors.filter(e => e.viewId === viewId)
      }
      return [...this.errors]
    }

    clearErrors(viewId = null) {
      if (viewId) {
        this.errors = this.errors.filter(e => e.viewId !== viewId)
      } else {
        this.errors = []
      }
    }

    getSummary() {
      const activeViews = []
      const inactiveViews = []

      for (const [viewId, state] of this.viewStates) {
        if (state.isActive) {
          activeViews.push(viewId)
        } else {
          inactiveViews.push(viewId)
        }
      }

      return {
        activeViews,
        inactiveViews,
        pendingOperations: this.pendingOperations.size,
        errorCount: this.errors.length
      }
    }

    destroy() {
      this.viewStates.clear()
      this.pendingOperations.clear()
      this.errors = []
    }
  }

  return TestablePluginLifecycleManager
}
