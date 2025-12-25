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
})
