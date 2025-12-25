/**
 * Tests for ContributionParser
 */

const { describe, it } = require('node:test')
const assert = require('node:assert')
const {
  parseViewContributions,
  validateViewContribution,
  getViewsByLocation,
  getViewLocations,
  mergeViewContributions,
  VALID_VIEW_LOCATIONS
} = require('../../src/main/plugins/contribution-parser')

describe('ContributionParser', () => {
  describe('VALID_VIEW_LOCATIONS', () => {
    it('should contain expected locations', () => {
      assert.deepStrictEqual(VALID_VIEW_LOCATIONS, [
        'sidebar',
        'panel',
        'statusbar',
        'toolbar',
        'editor'
      ])
    })
  })

  describe('parseViewContributions', () => {
    it('should return empty result for manifest without contributes', () => {
      const manifest = { name: 'test-plugin' }
      const result = parseViewContributions(manifest, 'test-plugin')

      assert.deepStrictEqual(result.views, [])
      assert.deepStrictEqual(result.errors, [])
      assert.deepStrictEqual(result.warnings, [])
    })

    it('should return empty result for manifest without views', () => {
      const manifest = { contributes: {} }
      const result = parseViewContributions(manifest, 'test-plugin')

      assert.deepStrictEqual(result.views, [])
      assert.deepStrictEqual(result.errors, [])
      assert.deepStrictEqual(result.warnings, [])
    })

    it('should error if views is not an array', () => {
      const manifest = { contributes: { views: 'not-an-array' } }
      const result = parseViewContributions(manifest, 'test-plugin')

      assert.strictEqual(result.views.length, 0)
      assert.strictEqual(result.errors.length, 1)
      assert.ok(result.errors[0].includes('must be an array'))
    })

    it('should parse valid view contribution', () => {
      const manifest = {
        contributes: {
          views: [
            {
              id: 'my-view',
              name: 'My View',
              location: 'sidebar',
              icon: 'chart',
              order: 10
            }
          ]
        }
      }
      const result = parseViewContributions(manifest, 'test-plugin')

      assert.strictEqual(result.views.length, 1)
      assert.strictEqual(result.errors.length, 0)

      const view = result.views[0]
      assert.strictEqual(view.id, 'test-plugin:my-view')
      assert.strictEqual(view.localId, 'my-view')
      assert.strictEqual(view.name, 'My View')
      assert.strictEqual(view.location, 'sidebar')
      assert.strictEqual(view.icon, 'chart')
      assert.strictEqual(view.order, 10)
      assert.strictEqual(view.pluginName, 'test-plugin')
    })

    it('should warn when icon is missing', () => {
      const manifest = {
        contributes: {
          views: [
            {
              id: 'my-view',
              name: 'My View',
              location: 'sidebar'
            }
          ]
        }
      }
      const result = parseViewContributions(manifest, 'test-plugin')

      assert.strictEqual(result.views.length, 1)
      assert.strictEqual(result.warnings.length, 1)
      assert.ok(result.warnings[0].includes('no icon specified'))
    })

    it('should parse optional when clause', () => {
      const manifest = {
        contributes: {
          views: [
            {
              id: 'my-view',
              name: 'My View',
              location: 'sidebar',
              icon: 'chart',
              when: 'editorFocus'
            }
          ]
        }
      }
      const result = parseViewContributions(manifest, 'test-plugin')

      assert.strictEqual(result.views[0].when, 'editorFocus')
    })

    it('should parse optional component name', () => {
      const manifest = {
        contributes: {
          views: [
            {
              id: 'my-view',
              name: 'My View',
              location: 'sidebar',
              icon: 'chart',
              component: 'MyViewComponent'
            }
          ]
        }
      }
      const result = parseViewContributions(manifest, 'test-plugin')

      assert.strictEqual(result.views[0].component, 'MyViewComponent')
    })

    it('should parse multiple views', () => {
      const manifest = {
        contributes: {
          views: [
            { id: 'view-a', name: 'View A', location: 'sidebar', icon: 'a' },
            { id: 'view-b', name: 'View B', location: 'panel', icon: 'b' }
          ]
        }
      }
      const result = parseViewContributions(manifest, 'test-plugin')

      assert.strictEqual(result.views.length, 2)
      assert.strictEqual(result.views[0].id, 'test-plugin:view-a')
      assert.strictEqual(result.views[1].id, 'test-plugin:view-b')
    })

    it('should error on duplicate view IDs', () => {
      const manifest = {
        contributes: {
          views: [
            { id: 'my-view', name: 'View 1', location: 'sidebar', icon: 'a' },
            { id: 'my-view', name: 'View 2', location: 'panel', icon: 'b' }
          ]
        }
      }
      const result = parseViewContributions(manifest, 'test-plugin')

      assert.strictEqual(result.views.length, 1)
      assert.strictEqual(result.errors.length, 1)
      assert.ok(result.errors[0].includes('Duplicate view ID'))
    })

    it('should skip invalid view objects', () => {
      const manifest = {
        contributes: {
          views: [
            'not-an-object',
            null,
            { id: 'valid-view', name: 'Valid', location: 'sidebar', icon: 'v' }
          ]
        }
      }
      const result = parseViewContributions(manifest, 'test-plugin')

      assert.strictEqual(result.views.length, 1)
      assert.strictEqual(result.errors.length, 2)
    })
  })

  describe('validateViewContribution', () => {
    it('should error on missing id', () => {
      const errors = validateViewContribution(
        { name: 'View', location: 'sidebar' },
        'views[0]',
        'test-plugin'
      )

      assert.ok(errors.some(e => e.includes('Missing required property "id"')))
    })

    it('should error on invalid id type', () => {
      const errors = validateViewContribution(
        { id: 123, name: 'View', location: 'sidebar' },
        'views[0]',
        'test-plugin'
      )

      assert.ok(errors.some(e => e.includes('"id" must be a string')))
    })

    it('should error on invalid id format', () => {
      const errors = validateViewContribution(
        { id: 'MyView', name: 'View', location: 'sidebar' },
        'views[0]',
        'test-plugin'
      )

      assert.ok(errors.some(e => e.includes('must be lowercase')))
    })

    it('should error on missing name', () => {
      const errors = validateViewContribution(
        { id: 'my-view', location: 'sidebar' },
        'views[0]',
        'test-plugin'
      )

      assert.ok(errors.some(e => e.includes('Missing required property "name"')))
    })

    it('should error on empty name', () => {
      const errors = validateViewContribution(
        { id: 'my-view', name: '', location: 'sidebar' },
        'views[0]',
        'test-plugin'
      )

      assert.ok(errors.some(e => e.includes('"name" cannot be empty')))
    })

    it('should error on name too long', () => {
      const errors = validateViewContribution(
        { id: 'my-view', name: 'a'.repeat(51), location: 'sidebar' },
        'views[0]',
        'test-plugin'
      )

      assert.ok(errors.some(e => e.includes('exceeds maximum length')))
    })

    it('should error on missing location', () => {
      const errors = validateViewContribution(
        { id: 'my-view', name: 'View' },
        'views[0]',
        'test-plugin'
      )

      assert.ok(errors.some(e => e.includes('Missing required property "location"')))
    })

    it('should error on invalid location', () => {
      const errors = validateViewContribution(
        { id: 'my-view', name: 'View', location: 'invalid' },
        'views[0]',
        'test-plugin'
      )

      assert.ok(errors.some(e => e.includes('Invalid location "invalid"')))
      assert.ok(errors.some(e => e.includes('Valid locations are:')))
    })

    it('should error on empty icon', () => {
      const errors = validateViewContribution(
        { id: 'my-view', name: 'View', location: 'sidebar', icon: '' },
        'views[0]',
        'test-plugin'
      )

      assert.ok(errors.some(e => e.includes('"icon" cannot be empty')))
    })

    it('should error on non-integer order', () => {
      const errors = validateViewContribution(
        { id: 'my-view', name: 'View', location: 'sidebar', order: 5.5 },
        'views[0]',
        'test-plugin'
      )

      assert.ok(errors.some(e => e.includes('"order" must be an integer')))
    })

    it('should error on order out of range', () => {
      const errors = validateViewContribution(
        { id: 'my-view', name: 'View', location: 'sidebar', order: 1001 },
        'views[0]',
        'test-plugin'
      )

      assert.ok(errors.some(e => e.includes('must be between 0 and 1000')))
    })

    it('should error on invalid component name', () => {
      const errors = validateViewContribution(
        { id: 'my-view', name: 'View', location: 'sidebar', component: 'myComponent' },
        'views[0]',
        'test-plugin'
      )

      assert.ok(errors.some(e => e.includes('PascalCase')))
    })

    it('should return no errors for valid view', () => {
      const errors = validateViewContribution(
        {
          id: 'my-view',
          name: 'My View',
          location: 'sidebar',
          icon: 'chart',
          order: 10,
          when: 'always',
          component: 'MyComponent'
        },
        'views[0]',
        'test-plugin'
      )

      assert.strictEqual(errors.length, 0)
    })
  })

  describe('getViewsByLocation', () => {
    const views = [
      { id: 'a', location: 'sidebar', order: 20 },
      { id: 'b', location: 'panel', order: 10 },
      { id: 'c', location: 'sidebar', order: 10 },
      { id: 'd', location: 'sidebar' }
    ]

    it('should filter views by location', () => {
      const result = getViewsByLocation(views, 'sidebar')
      assert.strictEqual(result.length, 3)
      assert.ok(result.every(v => v.location === 'sidebar'))
    })

    it('should return empty array for unknown location', () => {
      const result = getViewsByLocation(views, 'toolbar')
      assert.strictEqual(result.length, 0)
    })

    it('should sort by order', () => {
      const result = getViewsByLocation(views, 'sidebar')
      assert.strictEqual(result[0].id, 'c') // order: 10
      assert.strictEqual(result[1].id, 'a') // order: 20
      assert.strictEqual(result[2].id, 'd') // order: undefined -> 100
    })
  })

  describe('getViewLocations', () => {
    it('should return unique locations', () => {
      const views = [
        { location: 'sidebar' },
        { location: 'panel' },
        { location: 'sidebar' },
        { location: 'statusbar' }
      ]

      const locations = getViewLocations(views)
      assert.strictEqual(locations.length, 3)
      assert.ok(locations.includes('sidebar'))
      assert.ok(locations.includes('panel'))
      assert.ok(locations.includes('statusbar'))
    })

    it('should return empty array for no views', () => {
      const locations = getViewLocations([])
      assert.strictEqual(locations.length, 0)
    })
  })

  describe('mergeViewContributions', () => {
    it('should merge views from multiple plugins', () => {
      const pluginViews = new Map([
        ['plugin-a', [{ id: 'a:view1', order: 20 }]],
        ['plugin-b', [{ id: 'b:view1', order: 10 }]]
      ])

      const merged = mergeViewContributions(pluginViews)
      assert.strictEqual(merged.length, 2)
    })

    it('should sort merged views by order', () => {
      const pluginViews = new Map([
        ['plugin-a', [{ id: 'a:view1', order: 50 }]],
        ['plugin-b', [{ id: 'b:view1', order: 10 }]],
        ['plugin-c', [{ id: 'c:view1', order: 30 }]]
      ])

      const merged = mergeViewContributions(pluginViews)
      assert.strictEqual(merged[0].id, 'b:view1')
      assert.strictEqual(merged[1].id, 'c:view1')
      assert.strictEqual(merged[2].id, 'a:view1')
    })

    it('should handle empty map', () => {
      const merged = mergeViewContributions(new Map())
      assert.strictEqual(merged.length, 0)
    })
  })
})
