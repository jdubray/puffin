/**
 * Tests for Assertion Generator
 *
 * Tests the heuristic-based assertion generation from user stories.
 */

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')

const {
  AssertionGenerator,
  AssertionType,
  generateAssertions,
  generateFromCriterion,
  suggestAssertions
} = require('../../src/main/generators/assertion-generator')

describe('AssertionGenerator', () => {
  let generator

  beforeEach(() => {
    generator = new AssertionGenerator()
  })

  describe('FILE_EXISTS patterns', () => {
    it('should detect file creation from criterion', () => {
      const assertions = generateFromCriterion('Create file "src/utils/helper.js"', 0)
      assert.ok(assertions.length > 0, 'Should generate assertions')
      assert.strictEqual(assertions[0].type, AssertionType.FILE_EXISTS)
      assert.ok(assertions[0].target.includes('helper.js'))
    })

    it('should detect directory creation', () => {
      const assertions = generateFromCriterion('Add new directory called "components"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.FILE_EXISTS)
      assert.ok(assertions[0].assertion.type === 'directory')
    })

    it('should detect file should exist', () => {
      // Pattern expects .js/.ts/.jsx/.tsx extension for 'should exist' pattern
      const assertions = generateFromCriterion('File "config.js" should exist', 0)
      assert.ok(assertions.length > 0, 'Should generate assertions')
      assert.strictEqual(assertions[0].type, AssertionType.FILE_EXISTS)
    })
  })

  describe('CLASS_STRUCTURE patterns', () => {
    it('should detect class creation', () => {
      const assertions = generateFromCriterion('Create class "UserService"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.CLASS_STRUCTURE)
      assert.strictEqual(assertions[0].assertion.class_name, 'UserService')
    })

    it('should detect class with methods', () => {
      const assertions = generateFromCriterion('Class "DataManager" should have method "fetchData"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.CLASS_STRUCTURE)
      assert.strictEqual(assertions[0].assertion.class_name, 'DataManager')
      assert.ok(assertions[0].assertion.methods.includes('fetchData'))
    })

    it('should detect class inheritance', () => {
      const assertions = generateFromCriterion('"UserRepository" class should extend "BaseRepository"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.CLASS_STRUCTURE)
      assert.strictEqual(assertions[0].assertion.extends, 'BaseRepository')
    })
  })

  describe('FUNCTION_SIGNATURE patterns', () => {
    it('should detect function creation', () => {
      const assertions = generateFromCriterion('Add function "processData"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.FUNCTION_SIGNATURE)
      assert.strictEqual(assertions[0].assertion.function_name, 'processData')
    })

    it('should detect async function', () => {
      const assertions = generateFromCriterion('Create async function "fetchData"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.FUNCTION_SIGNATURE)
      assert.strictEqual(assertions[0].assertion.async, true)
    })

    it('should detect function parameters', () => {
      const assertions = generateFromCriterion('Function "saveUser" should accept parameter "userData"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.FUNCTION_SIGNATURE)
      assert.ok(assertions[0].assertion.parameters.includes('userData'))
    })
  })

  describe('EXPORT_EXISTS patterns', () => {
    it('should detect module exports', () => {
      const assertions = generateFromCriterion('Module should export "MyClass"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.EXPORT_EXISTS)
      assert.ok(assertions[0].assertion.exports.some(e => e.name === 'MyClass'))
    })

    it('should detect class export', () => {
      const assertions = generateFromCriterion('Export class "ValidationService"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.EXPORT_EXISTS)
      const exp = assertions[0].assertion.exports.find(e => e.name === 'ValidationService')
      assert.ok(exp)
      assert.strictEqual(exp.type, 'class')
    })
  })

  describe('IPC_HANDLER_REGISTERED patterns', () => {
    it('should detect IPC handler registration', () => {
      const assertions = generateFromCriterion('Register IPC handler "state:getData"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.IPC_HANDLER_REGISTERED)
      assert.ok(assertions[0].assertion.handlers.includes('state:getData'))
    })

    it('should detect IPC channel should be available', () => {
      const assertions = generateFromCriterion('IPC channel "file:save" should be registered', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.IPC_HANDLER_REGISTERED)
    })
  })

  describe('CSS_SELECTOR_EXISTS patterns', () => {
    it('should detect CSS class creation', () => {
      const assertions = generateFromCriterion('Add CSS class ".btn-primary"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.CSS_SELECTOR_EXISTS)
      assert.ok(assertions[0].assertion.selectors.includes('.btn-primary'))
    })

    it('should detect button style', () => {
      // Button with style/class triggers CSS pattern
      const assertions = generateFromCriterion('Button should have style "submit-btn"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.CSS_SELECTOR_EXISTS)
    })
  })

  describe('JSON_PROPERTY patterns', () => {
    it('should detect package.json property', () => {
      const assertions = generateFromCriterion('Package.json should have property "scripts.build"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.JSON_PROPERTY)
      assert.strictEqual(assertions[0].assertion.path, 'scripts.build')
      assert.strictEqual(assertions[0].assertion.operator, 'exists')
    })

    it('should detect config property', () => {
      const assertions = generateFromCriterion('Config should contain "database.host"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.JSON_PROPERTY)
    })
  })

  describe('FILE_CONTAINS patterns', () => {
    it('should detect file contains content', () => {
      const assertions = generateFromCriterion('File "README.md" should contain "Installation"', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.FILE_CONTAINS)
      assert.strictEqual(assertions[0].assertion.match, 'literal')
      assert.strictEqual(assertions[0].assertion.content, 'Installation')
    })
  })

  describe('PATTERN_MATCH patterns', () => {
    it('should detect no console.log', () => {
      const assertions = generateFromCriterion('Code should not contain console.log', 0)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].type, AssertionType.PATTERN_MATCH)
      assert.strictEqual(assertions[0].assertion.operator, 'absent')
    })
  })

  describe('generateAssertions', () => {
    it('should generate from story with title and description', () => {
      const story = {
        title: 'Add new component called UserService',
        description: 'Create class AuthManager for the application',
        acceptanceCriteria: []
      }
      const assertions = generateAssertions(story)
      assert.ok(assertions.length > 0, 'Should generate assertions from description')
      assert.ok(assertions.some(a => a.criterion === 'description'))
    })

    it('should generate from acceptance criteria', () => {
      const story = {
        title: 'User Management',
        description: '',
        acceptanceCriteria: [
          'Create file "src/services/user.js"',
          'Export class "UserService"',
          'Add method "getUser"'
        ]
      }
      const assertions = generateAssertions(story)
      assert.ok(assertions.length >= 2, 'Should generate multiple assertions')
    })

    it('should deduplicate assertions', () => {
      const story = {
        title: 'Create file "src/test.js"',
        description: 'Add file "src/test.js"',
        acceptanceCriteria: []
      }
      const assertions = generateAssertions(story)
      // Should only have one assertion for the same file
      const fileAssertions = assertions.filter(a =>
        a.type === AssertionType.FILE_EXISTS && a.target.includes('test.js')
      )
      assert.strictEqual(fileAssertions.length, 1, 'Should deduplicate same file assertions')
    })

    it('should handle empty story', () => {
      const story = {
        title: '',
        description: '',
        acceptanceCriteria: []
      }
      const assertions = generateAssertions(story)
      assert.strictEqual(assertions.length, 0)
    })

    it('should set criterion reference', () => {
      const story = {
        title: '',
        description: '',
        acceptanceCriteria: ['Create file "test.js"']
      }
      const assertions = generateAssertions(story)
      assert.ok(assertions.length > 0)
      assert.strictEqual(assertions[0].criterion, 'AC1')
    })
  })

  describe('suggestAssertions', () => {
    it('should suggest tests for new features', () => {
      const story = {
        title: 'Add new feature for user authentication',
        description: 'Implement login functionality',
        acceptanceCriteria: []
      }
      const suggestions = suggestAssertions(story)
      assert.ok(suggestions.length > 0)
      const testSuggestion = suggestions.find(s => s.message.includes('tests'))
      assert.ok(testSuggestion)
    })

    it('should suggest documentation for APIs', () => {
      const story = {
        title: 'Create public API endpoint',
        description: 'Add REST endpoint',
        acceptanceCriteria: []
      }
      const suggestions = suggestAssertions(story)
      const docSuggestion = suggestions.find(s => s.message.includes('JSDoc'))
      assert.ok(docSuggestion)
    })

    it('should suggest IPC bridge for Electron', () => {
      const story = {
        title: 'IPC communication',
        description: 'Main process to renderer',
        acceptanceCriteria: []
      }
      const suggestions = suggestAssertions(story)
      const ipcSuggestion = suggestions.find(s => s.message.includes('IPC bridge'))
      assert.ok(ipcSuggestion)
    })
  })

  describe('AssertionGenerator class', () => {
    it('should generate with options', () => {
      const story = {
        title: 'Create service',
        description: '',
        acceptanceCriteria: ['Add function "getData"']
      }
      const result = generator.generate(story, { includeSuggestions: true })

      assert.ok(result.assertions)
      assert.ok(result.meta)
      assert.ok(result.suggestions)
      assert.strictEqual(result.meta.storyTitle, 'Create service')
    })

    it('should return assertion types', () => {
      const types = generator.getAssertionTypes()
      assert.ok(types.FILE_EXISTS)
      assert.ok(types.CLASS_STRUCTURE)
      assert.ok(Object.keys(types).length === 10)
    })

    it('should return pattern descriptions', () => {
      const patterns = generator.getPatternDescriptions()
      assert.ok(Array.isArray(patterns))
      assert.ok(patterns.length > 0)
      assert.ok(patterns[0].pattern)
      assert.ok(patterns[0].type)
    })
  })
})
