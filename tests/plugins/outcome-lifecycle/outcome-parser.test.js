/**
 * Tests for Outcome Parser
 */

const { describe, it } = require('node:test')
const assert = require('node:assert')
const { extractOutcome } = require('../../../plugins/outcome-lifecycle-plugin/lib/outcome-parser')

describe('outcome-parser', () => {
  describe('extractOutcome', () => {
    // --- Standard cases ---

    it('should extract outcome from standard user story format', () => {
      const text = 'As a user, I want to log in so that I can access my account'
      assert.strictEqual(extractOutcome(text), 'I can access my account')
    })

    it('should extract outcome from story with line breaks', () => {
      const text = 'As a developer, I want automated tests\nso that I can catch regressions early'
      assert.strictEqual(extractOutcome(text), 'I can catch regressions early')
    })

    it('should extract multiline outcome text', () => {
      const text = 'As a user, I want notifications so that I am informed\nof important updates and changes'
      assert.strictEqual(extractOutcome(text), 'I am informed\nof important updates and changes')
    })

    // --- Case variations ---

    it('should handle uppercase "So that"', () => {
      const text = 'As a user, I want search So that I can find content quickly'
      assert.strictEqual(extractOutcome(text), 'I can find content quickly')
    })

    it('should handle all-uppercase "SO THAT"', () => {
      const text = 'As a user, I want export SO THAT data can be shared'
      assert.strictEqual(extractOutcome(text), 'data can be shared')
    })

    it('should handle mixed case "So That"', () => {
      const text = 'As an admin, I want reports So That I can track usage'
      assert.strictEqual(extractOutcome(text), 'I can track usage')
    })

    // --- Whitespace variations ---

    it('should handle extra whitespace between "so" and "that"', () => {
      const text = 'As a user, I want settings so   that I can customize the app'
      assert.strictEqual(extractOutcome(text), 'I can customize the app')
    })

    it('should trim leading/trailing whitespace from outcome', () => {
      const text = 'As a user, I want help so that   I can learn the features   '
      assert.strictEqual(extractOutcome(text), 'I can learn the features')
    })

    // --- Missing clause cases ---

    it('should return null when no "so that" clause exists', () => {
      const text = 'As a user, I want to log in'
      assert.strictEqual(extractOutcome(text), null)
    })

    it('should return null for empty string', () => {
      assert.strictEqual(extractOutcome(''), null)
    })

    it('should return null for null input', () => {
      assert.strictEqual(extractOutcome(null), null)
    })

    it('should return null for undefined input', () => {
      assert.strictEqual(extractOutcome(undefined), null)
    })

    it('should return null for non-string input', () => {
      assert.strictEqual(extractOutcome(42), null)
      assert.strictEqual(extractOutcome({}), null)
      assert.strictEqual(extractOutcome([]), null)
    })

    it('should return null when "so that" is followed by only whitespace', () => {
      assert.strictEqual(extractOutcome('I want X so that   '), null)
    })

    // --- Edge cases ---

    it('should match first "so that" occurrence', () => {
      const text = 'I want A so that B happens so that C also occurs'
      assert.strictEqual(extractOutcome(text), 'B happens so that C also occurs')
    })

    it('should handle "so that" at start of string', () => {
      const text = 'so that outcomes are tracked'
      assert.strictEqual(extractOutcome(text), 'outcomes are tracked')
    })

    it('should not match partial words like "also that"', () => {
      const text = 'I want this also that would be nice'
      assert.strictEqual(extractOutcome(text), null)
    })

    it('should handle story with only "so that" and nothing else', () => {
      assert.strictEqual(extractOutcome('so that'), null)
    })
  })
})
