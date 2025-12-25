/**
 * Tests for ViewRegistry
 */

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const { ViewRegistry } = require('../../src/main/plugins/view-registry')

describe('ViewRegistry', () => {
  let registry

  beforeEach(() => {
    registry = new ViewRegistry()
  })

  describe('registerView', () => {
    it('should register a valid view', () => {
      const result = registry.registerView('my-plugin', {
        id: 'my-view',
        name: 'My View',
        location: 'sidebar',
        icon: 'chart'
      })

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.viewId, 'my-plugin:my-view')
    })

    it('should reject duplicate view IDs', () => {
      registry.registerView('my-plugin', {
        id: 'my-view',
        name: 'My View',
        location: 'sidebar'
      })

      const result = registry.registerView('my-plugin', {
        id: 'my-view',
        name: 'Another View',
        location: 'panel'
      })

      assert.strictEqual(result.success, false)
      assert.ok(result.error.includes('already registered'))
    })

    it('should reject invalid view configurations', () => {
      const result = registry.registerView('my-plugin', {
        id: 'my-view',
        name: 'My View'
        // missing location
      })

      assert.strictEqual(result.success, false)
      assert.ok(result.error.includes('location'))
    })

    it('should reject invalid location', () => {
      const result = registry.registerView('my-plugin', {
        id: 'my-view',
        name: 'My View',
        location: 'invalid-location'
      })

      assert.strictEqual(result.success, false)
      assert.ok(result.error.includes('Invalid location'))
    })

    it('should emit view:registered event', () => {
      let eventData = null
      registry.on('view:registered', (data) => {
        eventData = data
      })

      registry.registerView('my-plugin', {
        id: 'my-view',
        name: 'My View',
        location: 'sidebar'
      })

      assert.ok(eventData)
      assert.strictEqual(eventData.pluginName, 'my-plugin')
      assert.strictEqual(eventData.view.id, 'my-plugin:my-view')
    })

    it('should include optional properties', () => {
      registry.registerView('my-plugin', {
        id: 'my-view',
        name: 'My View',
        location: 'sidebar',
        icon: 'chart',
        order: 10,
        when: 'editorFocus',
        component: 'MyViewComponent'
      })

      const view = registry.getView('my-plugin:my-view')
      assert.strictEqual(view.icon, 'chart')
      assert.strictEqual(view.order, 10)
      assert.strictEqual(view.when, 'editorFocus')
      assert.strictEqual(view.component, 'MyViewComponent')
    })
  })

  describe('registerViews', () => {
    it('should register multiple views at once', () => {
      const views = [
        { id: 'view-a', localId: 'view-a', name: 'View A', location: 'sidebar', pluginName: 'my-plugin' },
        { id: 'view-b', localId: 'view-b', name: 'View B', location: 'panel', pluginName: 'my-plugin' }
      ]

      const result = registry.registerViews('my-plugin', views)

      assert.strictEqual(result.registered.length, 2)
      assert.strictEqual(result.errors.length, 0)
    })

    it('should skip duplicate IDs', () => {
      registry.registerView('my-plugin', {
        id: 'existing-view',
        name: 'Existing',
        location: 'sidebar'
      })

      const views = [
        { id: 'my-plugin:existing-view', localId: 'existing-view', name: 'Duplicate', location: 'panel', pluginName: 'my-plugin' },
        { id: 'my-plugin:new-view', localId: 'new-view', name: 'New', location: 'sidebar', pluginName: 'my-plugin' }
      ]

      const result = registry.registerViews('my-plugin', views)

      assert.strictEqual(result.registered.length, 1)
      assert.strictEqual(result.errors.length, 1)
      assert.ok(result.errors[0].includes('already registered'))
    })
  })

  describe('unregisterView', () => {
    it('should unregister an existing view', () => {
      registry.registerView('my-plugin', {
        id: 'my-view',
        name: 'My View',
        location: 'sidebar'
      })

      const result = registry.unregisterView('my-plugin:my-view')

      assert.strictEqual(result.success, true)
      assert.strictEqual(registry.hasView('my-plugin:my-view'), false)
    })

    it('should return error for non-existent view', () => {
      const result = registry.unregisterView('non-existent:view')

      assert.strictEqual(result.success, false)
      assert.ok(result.error.includes('not found'))
    })

    it('should emit view:unregistered event', () => {
      registry.registerView('my-plugin', {
        id: 'my-view',
        name: 'My View',
        location: 'sidebar'
      })

      let eventData = null
      registry.on('view:unregistered', (data) => {
        eventData = data
      })

      registry.unregisterView('my-plugin:my-view')

      assert.ok(eventData)
      assert.strictEqual(eventData.viewId, 'my-plugin:my-view')
      assert.strictEqual(eventData.pluginName, 'my-plugin')
    })
  })

  describe('unregisterPluginViews', () => {
    it('should unregister all views from a plugin', () => {
      registry.registerView('my-plugin', { id: 'view-a', name: 'A', location: 'sidebar' })
      registry.registerView('my-plugin', { id: 'view-b', name: 'B', location: 'panel' })
      registry.registerView('other-plugin', { id: 'view-c', name: 'C', location: 'sidebar' })

      const result = registry.unregisterPluginViews('my-plugin')

      assert.strictEqual(result.unregistered.length, 2)
      assert.strictEqual(registry.hasView('my-plugin:view-a'), false)
      assert.strictEqual(registry.hasView('my-plugin:view-b'), false)
      assert.strictEqual(registry.hasView('other-plugin:view-c'), true)
    })

    it('should return empty array for plugin with no views', () => {
      const result = registry.unregisterPluginViews('non-existent-plugin')

      assert.strictEqual(result.unregistered.length, 0)
    })

    it('should emit views:cleared event', () => {
      registry.registerView('my-plugin', { id: 'view-a', name: 'A', location: 'sidebar' })

      let eventData = null
      registry.on('views:cleared', (data) => {
        eventData = data
      })

      registry.unregisterPluginViews('my-plugin')

      assert.ok(eventData)
      assert.strictEqual(eventData.pluginName, 'my-plugin')
    })
  })

  describe('getViewsByLocation', () => {
    beforeEach(() => {
      registry.registerView('plugin-a', { id: 'view-1', name: 'View 1', location: 'sidebar', order: 20 })
      registry.registerView('plugin-a', { id: 'view-2', name: 'View 2', location: 'panel' })
      registry.registerView('plugin-b', { id: 'view-3', name: 'View 3', location: 'sidebar', order: 10 })
      registry.registerView('plugin-b', { id: 'view-4', name: 'View 4', location: 'sidebar' })
    })

    it('should return views at specified location', () => {
      const views = registry.getViewsByLocation('sidebar')

      assert.strictEqual(views.length, 3)
      assert.ok(views.every(v => v.location === 'sidebar'))
    })

    it('should sort views by order', () => {
      const views = registry.getViewsByLocation('sidebar')

      assert.strictEqual(views[0].id, 'plugin-b:view-3') // order: 10
      assert.strictEqual(views[1].id, 'plugin-a:view-1') // order: 20
      assert.strictEqual(views[2].id, 'plugin-b:view-4') // order: undefined -> 100
    })

    it('should return empty array for location with no views', () => {
      const views = registry.getViewsByLocation('statusbar')

      assert.strictEqual(views.length, 0)
    })
  })

  describe('getSidebarViews', () => {
    it('should return only sidebar views', () => {
      registry.registerView('my-plugin', { id: 'sidebar-view', name: 'Sidebar', location: 'sidebar' })
      registry.registerView('my-plugin', { id: 'panel-view', name: 'Panel', location: 'panel' })

      const views = registry.getSidebarViews()

      assert.strictEqual(views.length, 1)
      assert.strictEqual(views[0].location, 'sidebar')
    })
  })

  describe('getPluginViews', () => {
    it('should return all views from a plugin', () => {
      registry.registerView('my-plugin', { id: 'view-a', name: 'A', location: 'sidebar' })
      registry.registerView('my-plugin', { id: 'view-b', name: 'B', location: 'panel' })
      registry.registerView('other-plugin', { id: 'view-c', name: 'C', location: 'sidebar' })

      const views = registry.getPluginViews('my-plugin')

      assert.strictEqual(views.length, 2)
      assert.ok(views.every(v => v.pluginName === 'my-plugin'))
    })

    it('should return empty array for plugin with no views', () => {
      const views = registry.getPluginViews('non-existent')

      assert.strictEqual(views.length, 0)
    })
  })

  describe('getAllViews', () => {
    it('should return all registered views', () => {
      registry.registerView('plugin-a', { id: 'view-1', name: 'View 1', location: 'sidebar' })
      registry.registerView('plugin-b', { id: 'view-2', name: 'View 2', location: 'panel' })

      const views = registry.getAllViews()

      assert.strictEqual(views.length, 2)
    })
  })

  describe('getSummary', () => {
    it('should return correct summary', () => {
      registry.registerView('plugin-a', { id: 'view-1', name: 'View 1', location: 'sidebar' })
      registry.registerView('plugin-a', { id: 'view-2', name: 'View 2', location: 'panel' })
      registry.registerView('plugin-b', { id: 'view-3', name: 'View 3', location: 'sidebar' })

      const summary = registry.getSummary()

      assert.strictEqual(summary.total, 3)
      assert.strictEqual(summary.plugins, 2)
      assert.strictEqual(summary.byLocation.sidebar, 2)
      assert.strictEqual(summary.byLocation.panel, 1)
      assert.strictEqual(summary.byLocation.statusbar, 0)
    })
  })

  describe('clear', () => {
    it('should remove all views', () => {
      registry.registerView('plugin-a', { id: 'view-1', name: 'View 1', location: 'sidebar' })
      registry.registerView('plugin-b', { id: 'view-2', name: 'View 2', location: 'panel' })

      registry.clear()

      assert.strictEqual(registry.getViewCount(), 0)
      assert.strictEqual(registry.getAllViews().length, 0)
    })

    it('should emit views:cleared for each plugin', () => {
      registry.registerView('plugin-a', { id: 'view-1', name: 'View 1', location: 'sidebar' })
      registry.registerView('plugin-b', { id: 'view-2', name: 'View 2', location: 'panel' })

      const clearedPlugins = []
      registry.on('views:cleared', (data) => {
        clearedPlugins.push(data.pluginName)
      })

      registry.clear()

      assert.strictEqual(clearedPlugins.length, 2)
      assert.ok(clearedPlugins.includes('plugin-a'))
      assert.ok(clearedPlugins.includes('plugin-b'))
    })
  })
})
