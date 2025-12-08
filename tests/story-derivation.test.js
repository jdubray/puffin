/**
 * Tests for story derivation parsing logic
 *
 * Tests the extractStoriesFromResponse and findJsonArray methods
 * in ClaudeService to ensure robust parsing of Claude's responses.
 */

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')

// We need to mock spawn since ClaudeService uses it
const mockSpawn = () => ({
  on: () => {},
  stdout: { on: () => {} },
  stderr: { on: () => {} },
  stdin: { write: () => {}, end: () => {} }
})

// Mock child_process
const originalRequire = require
require = function(id) {
  if (id === 'child_process') {
    return { spawn: mockSpawn }
  }
  return originalRequire(id)
}

const { ClaudeService } = require('../src/main/claude-service.js')

describe('ClaudeService - Story Derivation', () => {
  let claudeService

  beforeEach(() => {
    claudeService = new ClaudeService()
  })

  describe('extractStoriesFromResponse', () => {
    it('should parse a clean JSON array', () => {
      const response = `[
        {
          "title": "User Login",
          "description": "As a user, I want to log in so that I can access my account",
          "acceptanceCriteria": ["User can enter email", "User can enter password"]
        }
      ]`

      const result = claudeService.extractStoriesFromResponse(response)

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.stories.length, 1)
      assert.strictEqual(result.stories[0].title, 'User Login')
    })

    it('should parse JSON array with surrounding text', () => {
      const response = `Here are the user stories:

[
  {
    "title": "Dashboard View",
    "description": "As a user, I want to see a dashboard",
    "acceptanceCriteria": ["Shows summary", "Real-time updates"]
  }
]

Let me know if you need more details.`

      const result = claudeService.extractStoriesFromResponse(response)

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.stories.length, 1)
      assert.strictEqual(result.stories[0].title, 'Dashboard View')
    })

    it('should parse JSON from markdown code blocks', () => {
      const response = `Here are the stories:

\`\`\`json
[
  {
    "title": "API Integration",
    "description": "As a developer, I want API access",
    "acceptanceCriteria": ["REST endpoints", "Authentication"]
  }
]
\`\`\`
`

      const result = claudeService.extractStoriesFromResponse(response)

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.stories.length, 1)
      assert.strictEqual(result.stories[0].title, 'API Integration')
    })

    it('should handle multiple stories', () => {
      const response = `[
        {"title": "Story 1", "description": "Desc 1", "acceptanceCriteria": []},
        {"title": "Story 2", "description": "Desc 2", "acceptanceCriteria": []},
        {"title": "Story 3", "description": "Desc 3", "acceptanceCriteria": []}
      ]`

      const result = claudeService.extractStoriesFromResponse(response)

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.stories.length, 3)
    })

    it('should fail on empty response', () => {
      const result = claudeService.extractStoriesFromResponse('')

      assert.strictEqual(result.success, false)
      assert.ok(result.error.includes('Empty response'))
    })

    it('should fail on null response', () => {
      const result = claudeService.extractStoriesFromResponse(null)

      assert.strictEqual(result.success, false)
      assert.ok(result.error.includes('Empty response'))
    })

    it('should fail on empty array', () => {
      const response = '[]'
      const result = claudeService.extractStoriesFromResponse(response)

      assert.strictEqual(result.success, false)
      assert.ok(result.error.includes('empty'))
    })

    it('should fail on non-JSON response', () => {
      const response = 'I cannot generate user stories for this request.'
      const result = claudeService.extractStoriesFromResponse(response)

      assert.strictEqual(result.success, false)
      assert.ok(result.error.includes('Could not find valid JSON'))
    })

    it('should skip stories without titles', () => {
      const response = `[
        {"title": "Valid Story", "description": "Valid", "acceptanceCriteria": []},
        {"description": "No title", "acceptanceCriteria": []},
        {"title": "", "description": "Empty title", "acceptanceCriteria": []}
      ]`

      const result = claudeService.extractStoriesFromResponse(response)

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.stories.length, 1)
      assert.strictEqual(result.stories[0].title, 'Valid Story')
    })

    it('should fail if all stories are invalid', () => {
      const response = `[
        {"description": "No title 1"},
        {"title": "", "description": "Empty title"}
      ]`

      const result = claudeService.extractStoriesFromResponse(response)

      assert.strictEqual(result.success, false)
      assert.ok(result.error.includes('No valid stories'))
    })

    it('should normalize story data', () => {
      const response = `[
        {
          "title": "  Trimmed Title  ",
          "description": "  Trimmed description  ",
          "acceptanceCriteria": ["  Valid  ", "", "  Also valid  ", null]
        }
      ]`

      const result = claudeService.extractStoriesFromResponse(response)

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.stories[0].title, 'Trimmed Title')
      assert.strictEqual(result.stories[0].description, 'Trimmed description')
      // Should filter out empty and null criteria
      assert.strictEqual(result.stories[0].acceptanceCriteria.length, 2)
    })

    it('should handle missing optional fields', () => {
      const response = `[{"title": "Minimal Story"}]`

      const result = claudeService.extractStoriesFromResponse(response)

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.stories[0].title, 'Minimal Story')
      assert.strictEqual(result.stories[0].description, '')
      assert.deepStrictEqual(result.stories[0].acceptanceCriteria, [])
    })

    it('should handle nested arrays in acceptance criteria text', () => {
      const response = `[
        {
          "title": "Complex Story",
          "description": "Story with nested content",
          "acceptanceCriteria": ["Check [item1] and [item2]", "Another criterion"]
        }
      ]`

      const result = claudeService.extractStoriesFromResponse(response)

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.stories[0].acceptanceCriteria.length, 2)
    })

    it('should handle JSON with escaped characters', () => {
      const response = `[
        {
          "title": "Story with \\"quotes\\"",
          "description": "Line 1\\nLine 2",
          "acceptanceCriteria": ["Tab\\there"]
        }
      ]`

      const result = claudeService.extractStoriesFromResponse(response)

      assert.strictEqual(result.success, true)
      assert.strictEqual(result.stories[0].title, 'Story with "quotes"')
    })
  })

  describe('findJsonArray', () => {
    it('should find array at start of text', () => {
      const text = '[{"title": "Test"}]'
      const result = claudeService.findJsonArray(text)

      assert.ok(Array.isArray(result))
      assert.strictEqual(result.length, 1)
    })

    it('should find array in middle of text', () => {
      const text = 'Some prefix text [{"title": "Test"}] some suffix'
      const result = claudeService.findJsonArray(text)

      assert.ok(Array.isArray(result))
      assert.strictEqual(result[0].title, 'Test')
    })

    it('should handle nested brackets in strings', () => {
      const text = '[{"title": "Test [with brackets]", "arr": ["a", "b"]}]'
      const result = claudeService.findJsonArray(text)

      assert.ok(Array.isArray(result))
      assert.strictEqual(result[0].title, 'Test [with brackets]')
    })

    it('should return null when no array found', () => {
      const text = 'No array here, just text'
      const result = claudeService.findJsonArray(text)

      assert.strictEqual(result, null)
    })

    it('should handle escaped quotes in strings', () => {
      const text = '[{"title": "Say \\"Hello\\""}]'
      const result = claudeService.findJsonArray(text)

      assert.ok(Array.isArray(result))
      assert.strictEqual(result[0].title, 'Say "Hello"')
    })

    it('should find first complete array when multiple exist', () => {
      const text = '[{"first": true}] and later [{"second": true}]'
      const result = claudeService.findJsonArray(text)

      assert.ok(Array.isArray(result))
      assert.strictEqual(result[0].first, true)
    })
  })
})
