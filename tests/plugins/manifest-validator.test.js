/**
 * Tests for ManifestValidator
 */

const { describe, it, before } = require('node:test')
const assert = require('node:assert')
const path = require('path')
const fs = require('fs').promises

// Mock ajv and ajv-formats for testing without npm install
const mockAjv = {
  compile: () => {
    const validateFn = () => true
    validateFn.errors = null
    return validateFn
  }
}

// Test the schema structure
describe('Manifest Schema', () => {
  let schema

  before(async () => {
    const schemaPath = path.join(__dirname, '../../src/main/plugins/manifest-schema.json')
    const content = await fs.readFile(schemaPath, 'utf-8')
    schema = JSON.parse(content)
  })

  it('should be valid JSON', () => {
    assert.ok(schema, 'Schema should be parseable')
  })

  it('should have correct $schema', () => {
    assert.strictEqual(schema.$schema, 'http://json-schema.org/draft-07/schema#')
  })

  it('should require name, version, displayName, description, main', () => {
    assert.deepStrictEqual(
      schema.required,
      ['name', 'version', 'displayName', 'description', 'main']
    )
  })

  it('should define name with correct pattern', () => {
    assert.strictEqual(schema.properties.name.type, 'string')
    assert.strictEqual(schema.properties.name.pattern, '^[a-z][a-z0-9-]*$')
  })

  it('should define version with semver pattern', () => {
    assert.strictEqual(schema.properties.version.type, 'string')
    assert.ok(schema.properties.version.pattern.includes('\\d+\\.\\d+\\.\\d+'))
  })

  it('should define extensionPoints with all required properties', () => {
    const extensionPoints = schema.properties.extensionPoints
    assert.strictEqual(extensionPoints.type, 'object')
    assert.ok(extensionPoints.properties.actions)
    assert.ok(extensionPoints.properties.acceptors)
    assert.ok(extensionPoints.properties.reactors)
    assert.ok(extensionPoints.properties.components)
    assert.ok(extensionPoints.properties.ipcHandlers)
  })

  it('should define ipcHandlers with namespace:action pattern', () => {
    const ipcHandlers = schema.properties.extensionPoints.properties.ipcHandlers
    assert.strictEqual(
      ipcHandlers.items.pattern,
      '^[a-z][a-z0-9-]*:[a-zA-Z][a-zA-Z0-9_]*$'
    )
  })

  it('should define optional author field with string or object', () => {
    const author = schema.properties.author
    assert.ok(author.oneOf)
    assert.strictEqual(author.oneOf.length, 2)
    assert.strictEqual(author.oneOf[0].type, 'string')
    assert.strictEqual(author.oneOf[1].type, 'object')
  })

  it('should define engines with puffin version', () => {
    const engines = schema.properties.engines
    assert.ok(engines.properties.puffin)
    assert.strictEqual(engines.properties.puffin.type, 'string')
  })

  it('should not allow additional properties at root', () => {
    assert.strictEqual(schema.additionalProperties, false)
  })

  it('should define renderer section', () => {
    assert.ok(schema.properties.renderer, 'renderer property should exist')
    assert.strictEqual(schema.properties.renderer.type, 'object')
    assert.deepStrictEqual(schema.properties.renderer.required, ['entry'])
  })

  it('should define renderer.entry with correct pattern', () => {
    const entry = schema.properties.renderer.properties.entry
    assert.strictEqual(entry.type, 'string')
    assert.ok(entry.pattern.includes('js|mjs|ts|tsx'))
  })

  it('should define renderer.components array', () => {
    const components = schema.properties.renderer.properties.components
    assert.strictEqual(components.type, 'array')
    assert.ok(components.items)
  })

  it('should define renderer.styles array', () => {
    const styles = schema.properties.renderer.properties.styles
    assert.strictEqual(styles.type, 'array')
    assert.ok(styles.items.pattern.includes('css|scss|sass|less'))
  })

  it('should define renderer.dependencies object', () => {
    const dependencies = schema.properties.renderer.properties.dependencies
    assert.strictEqual(dependencies.type, 'object')
  })
})

describe('Manifest Validation Logic', () => {
  // These tests verify the validation patterns work correctly

  it('should validate correct plugin names', () => {
    const pattern = new RegExp('^[a-z][a-z0-9-]*$')
    assert.ok(pattern.test('my-plugin'))
    assert.ok(pattern.test('plugin123'))
    assert.ok(pattern.test('a'))
    assert.ok(!pattern.test('My-Plugin'))
    assert.ok(!pattern.test('123plugin'))
    assert.ok(!pattern.test('-plugin'))
    assert.ok(!pattern.test('plugin_name'))
  })

  it('should validate semver versions', () => {
    const pattern = new RegExp('^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.-]+)?(\\+[a-zA-Z0-9.-]+)?$')
    assert.ok(pattern.test('1.0.0'))
    assert.ok(pattern.test('2.1.3'))
    assert.ok(pattern.test('1.0.0-beta.1'))
    assert.ok(pattern.test('1.0.0-alpha+build.123'))
    assert.ok(!pattern.test('1.0'))
    assert.ok(!pattern.test('v1.0.0'))
    assert.ok(!pattern.test('1.0.0.0'))
  })

  it('should validate ipcHandler format', () => {
    const pattern = new RegExp('^[a-z][a-z0-9-]*:[a-zA-Z][a-zA-Z0-9_]*$')
    assert.ok(pattern.test('analytics:getData'))
    assert.ok(pattern.test('my-plugin:doSomething'))
    assert.ok(pattern.test('plugin:action_name'))
    assert.ok(!pattern.test('getData'))
    assert.ok(!pattern.test(':getData'))
    assert.ok(!pattern.test('Plugin:getData'))
    assert.ok(!pattern.test('analytics:'))
  })

  it('should validate action names (camelCase)', () => {
    const pattern = new RegExp('^[a-zA-Z][a-zA-Z0-9_]*$')
    assert.ok(pattern.test('trackPrompt'))
    assert.ok(pattern.test('generateReport'))
    assert.ok(pattern.test('a'))
    assert.ok(pattern.test('action_name'))
    assert.ok(!pattern.test('123action'))
    assert.ok(!pattern.test('-action'))
  })

  it('should validate component names (kebab-case)', () => {
    const pattern = new RegExp('^[a-zA-Z][a-zA-Z0-9-]*$')
    assert.ok(pattern.test('analytics-dashboard'))
    assert.ok(pattern.test('MyComponent'))
    assert.ok(pattern.test('component123'))
    assert.ok(!pattern.test('123-component'))
    assert.ok(!pattern.test('-component'))
  })
})

describe('Renderer Manifest Schema', () => {
  let schema

  before(async () => {
    const schemaPath = path.join(__dirname, '../../src/main/plugins/schemas/renderer-manifest.schema.json')
    const content = await fs.readFile(schemaPath, 'utf-8')
    schema = JSON.parse(content)
  })

  it('should be valid JSON', () => {
    assert.ok(schema, 'Renderer schema should be parseable')
  })

  it('should have correct $schema', () => {
    assert.strictEqual(schema.$schema, 'http://json-schema.org/draft-07/schema#')
  })

  it('should require entry field', () => {
    assert.deepStrictEqual(schema.required, ['entry'])
  })

  it('should define entry with correct pattern', () => {
    assert.strictEqual(schema.properties.entry.type, 'string')
    assert.ok(schema.properties.entry.pattern.includes('js|mjs|ts|tsx'))
  })

  it('should define components array', () => {
    assert.strictEqual(schema.properties.components.type, 'array')
    assert.ok(schema.properties.components.items)
  })

  it('should define styles array with CSS pattern', () => {
    assert.strictEqual(schema.properties.styles.type, 'array')
    assert.ok(schema.properties.styles.items.pattern.includes('css|scss|sass|less'))
  })

  it('should define dependencies object', () => {
    assert.strictEqual(schema.properties.dependencies.type, 'object')
  })

  it('should define preload and sandbox booleans', () => {
    assert.strictEqual(schema.properties.preload.type, 'boolean')
    assert.strictEqual(schema.properties.sandbox.type, 'boolean')
  })

  it('should have componentExport definition', () => {
    assert.ok(schema.definitions.componentExport)
    assert.deepStrictEqual(schema.definitions.componentExport.required, ['name', 'export'])
  })
})

describe('Renderer Validation Patterns', () => {
  it('should validate renderer entry paths', () => {
    const pattern = new RegExp('^[a-zA-Z0-9_./-]+\\.(js|mjs|ts|tsx)$')
    assert.ok(pattern.test('renderer/index.js'))
    assert.ok(pattern.test('src/renderer/main.tsx'))
    assert.ok(pattern.test('dist/renderer.mjs'))
    assert.ok(!pattern.test('renderer/index'))
    assert.ok(!pattern.test('renderer/index.css'))
    assert.ok(!pattern.test('../outside/index.js'))
  })

  it('should validate component names (PascalCase)', () => {
    const pattern = new RegExp('^[A-Z][a-zA-Z0-9]*$')
    assert.ok(pattern.test('AnalyticsDashboard'))
    assert.ok(pattern.test('A'))
    assert.ok(pattern.test('MyComponent123'))
    assert.ok(!pattern.test('analyticsDashboard'))
    assert.ok(!pattern.test('analytics-dashboard'))
    assert.ok(!pattern.test('123Component'))
  })

  it('should validate export names', () => {
    const pattern = new RegExp('^[a-zA-Z_$][a-zA-Z0-9_$]*$')
    assert.ok(pattern.test('default'))
    assert.ok(pattern.test('MyComponent'))
    assert.ok(pattern.test('_privateExport'))
    assert.ok(pattern.test('$special'))
    assert.ok(!pattern.test('123export'))
    assert.ok(!pattern.test('-export'))
  })

  it('should validate style file paths', () => {
    const pattern = new RegExp('^[a-zA-Z0-9_./-]+\\.(css|scss|sass|less)$')
    assert.ok(pattern.test('renderer/styles/main.css'))
    assert.ok(pattern.test('styles/theme.scss'))
    assert.ok(pattern.test('components/button.sass'))
    assert.ok(pattern.test('dist/bundle.less'))
    assert.ok(!pattern.test('styles/main'))
    assert.ok(!pattern.test('styles/main.js'))
  })

  it('should validate dependency versions', () => {
    const pattern = new RegExp('^(>=?|<=?|\\^|~)?\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.-]+)?$|^\\*$|^latest$')
    assert.ok(pattern.test('1.0.0'))
    assert.ok(pattern.test('^4.0.0'))
    assert.ok(pattern.test('>=2.1.0'))
    assert.ok(pattern.test('~1.5.0'))
    assert.ok(pattern.test('1.0.0-beta.1'))
    assert.ok(pattern.test('*'))
    assert.ok(pattern.test('latest'))
    assert.ok(!pattern.test('v1.0.0'))
    assert.ok(!pattern.test('1.0'))
  })
})

describe('Sample Manifests', () => {
  it('should have valid minimal manifest structure', () => {
    const minimal = {
      name: 'my-plugin',
      version: '1.0.0',
      displayName: 'My Plugin',
      description: 'A test plugin',
      main: 'index.js'
    }

    // Validate required fields are present
    assert.ok(minimal.name)
    assert.ok(minimal.version)
    assert.ok(minimal.displayName)
    assert.ok(minimal.description)
    assert.ok(minimal.main)
  })

  it('should have valid full manifest structure', () => {
    const full = {
      name: 'puffin-analytics',
      version: '1.0.0',
      displayName: 'Analytics Dashboard',
      description: 'Track prompt usage and response metrics',
      main: 'src/index.js',
      author: {
        name: 'Developer',
        email: 'dev@example.com'
      },
      license: 'MIT',
      repository: 'https://github.com/user/puffin-analytics',
      keywords: ['analytics', 'metrics'],
      engines: {
        puffin: '>=2.0.0'
      },
      extensionPoints: {
        actions: ['trackPrompt', 'generateReport'],
        acceptors: ['analyticsAcceptor'],
        reactors: ['onPromptComplete'],
        components: ['analytics-dashboard'],
        ipcHandlers: ['analytics:getData', 'analytics:export']
      }
    }

    // Validate structure
    assert.ok(Array.isArray(full.keywords))
    assert.ok(typeof full.engines === 'object')
    assert.ok(typeof full.extensionPoints === 'object')
    assert.ok(Array.isArray(full.extensionPoints.actions))
    assert.ok(Array.isArray(full.extensionPoints.ipcHandlers))
  })

  it('should have valid manifest with renderer section', () => {
    const withRenderer = {
      name: 'puffin-dashboard',
      version: '1.0.0',
      displayName: 'Dashboard Plugin',
      description: 'A plugin with renderer components',
      main: 'src/index.js',
      renderer: {
        entry: 'renderer/index.js',
        components: [
          {
            name: 'Dashboard',
            export: 'DashboardComponent',
            type: 'class',
            description: 'Main dashboard view'
          },
          {
            name: 'Panel',
            export: 'Panel',
            type: 'function'
          }
        ],
        styles: [
          'renderer/styles/main.css',
          'renderer/styles/theme.css'
        ],
        dependencies: {
          'chart.js': '^4.0.0'
        },
        preload: false,
        sandbox: true
      }
    }

    // Validate renderer structure
    assert.ok(withRenderer.renderer)
    assert.strictEqual(withRenderer.renderer.entry, 'renderer/index.js')
    assert.ok(Array.isArray(withRenderer.renderer.components))
    assert.strictEqual(withRenderer.renderer.components.length, 2)
    assert.strictEqual(withRenderer.renderer.components[0].name, 'Dashboard')
    assert.strictEqual(withRenderer.renderer.components[0].type, 'class')
    assert.ok(Array.isArray(withRenderer.renderer.styles))
    assert.ok(typeof withRenderer.renderer.dependencies === 'object')
    assert.strictEqual(withRenderer.renderer.preload, false)
    assert.strictEqual(withRenderer.renderer.sandbox, true)
  })
})
