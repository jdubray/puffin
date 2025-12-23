/**
 * Similarity Hash Utility for Stuck Detection
 *
 * Generates hashes from response content to detect when Claude
 * is "stuck" producing similar outputs repeatedly.
 */

/**
 * Generate a similarity hash from response content
 * Uses a simplified approach: extract key indicators that would be
 * similar if Claude is "stuck" in a loop
 *
 * Key indicators of stuck behavior:
 * - Same tool calls being made
 * - Same error messages
 * - Same file modifications
 * - Similar content structure
 *
 * @param {Object} response - The response object
 * @param {string} response.content - The response text content
 * @param {string[]} response.toolsUsed - Array of tool names used
 * @param {string[]} response.filesModified - Array of file paths modified
 * @returns {string} A hash string for comparison
 */
export function computeSimilarityHash(response) {
  const parts = []

  // Include tool usage pattern (most reliable indicator)
  if (response.toolsUsed && response.toolsUsed.length > 0) {
    parts.push('tools:' + response.toolsUsed.slice().sort().join(','))
  }

  // Include files modified pattern
  if (response.filesModified && response.filesModified.length > 0) {
    parts.push('files:' + response.filesModified.slice().sort().join(','))
  }

  // Include content length bucket (same length = suspicious)
  const contentLength = response.content?.length || 0
  const lengthBucket = Math.floor(contentLength / 500) * 500
  parts.push('len:' + lengthBucket)

  // Include first 200 chars hash (catches repeated messages)
  const contentStart = (response.content || '').substring(0, 200)
  parts.push('start:' + simpleHash(contentStart))

  // Combine all parts
  return simpleHash(parts.join('|'))
}

/**
 * Simple string hash for comparison
 * Uses djb2-like algorithm for fast hashing
 *
 * @param {string} str - String to hash
 * @returns {string} Base-36 encoded hash
 */
function simpleHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString(36)
}

/**
 * Generate a human-readable summary of the response
 * For displaying in the stuck alert
 *
 * @param {Object} response - The response object
 * @param {string} response.content - The response text content
 * @param {string[]} response.toolsUsed - Array of tool names used
 * @param {string[]} response.filesModified - Array of file paths modified
 * @returns {string} Human-readable summary
 */
export function generateOutputSummary(response) {
  const parts = []

  if (response.toolsUsed?.length > 0) {
    parts.push(`Tools: ${response.toolsUsed.slice(0, 3).join(', ')}`)
  }

  if (response.filesModified?.length > 0) {
    parts.push(`Files: ${response.filesModified.length} modified`)
  }

  const contentPreview = (response.content || '').substring(0, 100)
  if (contentPreview) {
    parts.push(`"${contentPreview}..."`)
  }

  return parts.join(' | ') || 'No content'
}
