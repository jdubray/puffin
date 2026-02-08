/**
 * Outcome Parser
 *
 * Extracts outcome text from user story descriptions by parsing
 * the "so that [outcome]" clause. Pure utility with no side effects.
 *
 * @module outcome-parser
 */

/**
 * Pattern to match "so that" clause and capture everything after it.
 * - Case-insensitive
 * - Handles multiline input (captures to end of string)
 * - Requires at least one whitespace after "so that"
 */
const SO_THAT_PATTERN = /\bso\s+that\s+(.+)/is

/**
 * Extract the outcome clause from a user story description.
 *
 * Looks for a "so that [outcome]" pattern and returns the
 * captured outcome text, trimmed of surrounding whitespace.
 *
 * @param {string} storyText - Full user story text or description
 * @returns {string|null} Extracted outcome text, or null if not found
 *
 * @example
 * extractOutcome('As a user, I want login so that I can access my account')
 * // => 'I can access my account'
 *
 * @example
 * extractOutcome('As a user, I want login')
 * // => null
 */
function extractOutcome(storyText) {
  if (!storyText || typeof storyText !== 'string') {
    return null
  }

  const match = storyText.match(SO_THAT_PATTERN)

  if (!match || !match[1]) {
    return null
  }

  const outcome = match[1].trim()
  return outcome.length > 0 ? outcome : null
}

module.exports = { extractOutcome, SO_THAT_PATTERN }
