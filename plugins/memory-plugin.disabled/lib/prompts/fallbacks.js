/**
 * Edge Case Fallback Prompts
 *
 * Handles empty, trivial, and ambiguous conversations by returning no-op
 * or low-confidence results without invoking the LLM.
 *
 * @module prompts/fallbacks
 */

/** Minimum meaningful content length per turn (user + response combined) */
const MIN_TURN_CONTENT_LENGTH = 50

/** Minimum number of substantive turns to warrant extraction */
const MIN_SUBSTANTIVE_TURNS = 1

/**
 * No-op extraction result returned when conversation is empty or trivial
 * @returns {Object} Empty extraction result
 */
function emptyResult() {
  return { extractions: [] }
}

/**
 * Check if a prompts array represents an empty conversation
 * @param {Array<{ content: string, response: { content: string } }>} prompts
 * @returns {boolean}
 */
function isEmptyConversation(prompts) {
  if (!Array.isArray(prompts) || prompts.length === 0) return true

  // Check if every prompt lacks meaningful response content
  return prompts.every(p => {
    const responseText = (p.response && p.response.content) || ''
    return responseText.trim().length === 0
  })
}

/**
 * Check if a conversation is too trivial to extract knowledge from
 * (e.g. single short exchange, greetings only)
 * @param {Array<{ content: string, response: { content: string } }>} prompts
 * @returns {boolean}
 */
function isTrivialConversation(prompts) {
  if (!Array.isArray(prompts)) return true

  const substantiveTurns = prompts.filter(p => {
    const userText = (p.content || '').trim()
    const responseText = (p.response && p.response.content) || ''
    return (userText.length + responseText.trim().length) >= MIN_TURN_CONTENT_LENGTH
  })

  return substantiveTurns.length < MIN_SUBSTANTIVE_TURNS
}

/**
 * Evaluate a conversation and return a fallback result if appropriate,
 * or null if the conversation should proceed to LLM extraction.
 *
 * @param {Array<{ content: string, response: { content: string } }>} prompts
 * @param {Object} [logger] - Optional logger with .log() and .warn() methods
 * @returns {{ result: Object, reason: string } | null} Fallback result or null to proceed
 */
function checkFallback(prompts, logger) {
  const log = logger || console

  if (isEmptyConversation(prompts)) {
    log.log('[memory-plugin:fallbacks] Empty conversation — returning no-op result')
    return { result: emptyResult(), reason: 'empty' }
  }

  if (isTrivialConversation(prompts)) {
    log.log('[memory-plugin:fallbacks] Trivial conversation (' + prompts.length + ' turns) — returning no-op result')
    return { result: emptyResult(), reason: 'trivial' }
  }

  return null
}

module.exports = {
  MIN_TURN_CONTENT_LENGTH,
  MIN_SUBSTANTIVE_TURNS,
  emptyResult,
  isEmptyConversation,
  isTrivialConversation,
  checkFallback
}
