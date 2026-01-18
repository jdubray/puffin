/**
 * MarkerUtils - Utility functions for Puffin inline prompt markers
 *
 * Marker syntax: /@puffin: prompt text here //
 *
 * Features:
 * - Detection and extraction of markers from document content
 * - Creation of properly formatted markers
 * - Removal of markers from content
 * - HTML highlighting of markers for visual distinction
 *
 * KNOWN LIMITATIONS:
 * - The end delimiter '//' is identical to JavaScript single-line comment syntax.
 *   This can cause false positives when the sequence `/@puffin: ... //` appears
 *   unintentionally in code files (e.g., in comments or string literals).
 * - Best practices to avoid false positives:
 *   1. Use markers on their own lines when possible
 *   2. Avoid placing `/@puffin:` in comments or strings unless intentional
 *   3. The unique `/@puffin:` start delimiter significantly reduces false matches
 * - Future versions may introduce a more unique end delimiter (e.g., `//@puffin`)
 *   for improved disambiguation in code-heavy documents.
 */

/**
 * Marker syntax constants
 *
 * Note: MARKER_END uses '//' which overlaps with JS comment syntax.
 * The combination of MARKER_START + MARKER_END creates sufficient uniqueness
 * for most use cases, but see module header for known limitations.
 */
export const MARKER_START = '/@puffin:'
export const MARKER_END = '//'

/**
 * Regex pattern to match Puffin markers
 * Captures the prompt text inside the marker
 * Supports multiline content within markers
 *
 * Pattern breakdown:
 * - \/@puffin:  - Literal start delimiter
 * - \s*         - Optional whitespace after start
 * - ([\s\S]*?)  - Capture group for prompt content (non-greedy, includes newlines)
 * - \s*         - Optional whitespace before end
 * - \/\/        - Literal end delimiter
 */
export const MARKER_REGEX = /\/@puffin:\s*([\s\S]*?)\s*\/\//g

/**
 * Find all markers in content
 * @param {string} content - Document content to search
 * @returns {Array<{fullMatch: string, prompt: string, startIndex: number, endIndex: number}>}
 */
export function findAllMarkers(content) {
  if (!content) return []

  const markers = []
  // Reset regex lastIndex for fresh search
  const regex = new RegExp(MARKER_REGEX.source, MARKER_REGEX.flags)

  let match
  while ((match = regex.exec(content)) !== null) {
    markers.push({
      fullMatch: match[0],
      prompt: match[1].trim(),
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }

  return markers
}

/**
 * Check if content contains any markers
 * @param {string} content - Document content to check
 * @returns {boolean}
 */
export function hasMarkers(content) {
  if (!content) return false
  // Reset regex and test
  const regex = new RegExp(MARKER_REGEX.source, MARKER_REGEX.flags)
  return regex.test(content)
}

/**
 * Get the count of markers in content
 * Optimized to count without creating full marker objects
 * @param {string} content - Document content
 * @returns {number}
 */
export function countMarkers(content) {
  if (!content) return 0

  // Use matchAll for efficient counting without building full marker objects
  const regex = new RegExp(MARKER_REGEX.source, MARKER_REGEX.flags)
  const matches = content.matchAll(regex)

  // Count matches without storing them
  let count = 0
  for (const _ of matches) {
    count++
  }
  return count
}

/**
 * Create a new marker with the given prompt text
 * @param {string} promptText - The prompt text to embed (defaults to empty)
 * @returns {string} Formatted marker string
 */
export function createMarker(promptText = '') {
  const text = promptText.trim()
  if (text) {
    // Check if prompt spans multiple lines
    if (text.includes('\n')) {
      return `${MARKER_START}\n${text}\n${MARKER_END}`
    }
    return `${MARKER_START} ${text} ${MARKER_END}`
  }
  return `${MARKER_START}  ${MARKER_END}`
}

/**
 * Remove all markers from content
 * @param {string} content - Document content
 * @returns {string} Content with markers removed
 */
export function removeAllMarkers(content) {
  if (!content) return content
  return content.replace(new RegExp(MARKER_REGEX.source, MARKER_REGEX.flags), '')
}

/**
 * Remove a specific marker by index
 * @param {string} content - Document content
 * @param {number} markerIndex - Index of marker to remove (0-based)
 * @returns {string} Content with the specified marker removed
 */
export function removeMarkerByIndex(content, markerIndex) {
  if (!content) return content

  const markers = findAllMarkers(content)
  if (markerIndex < 0 || markerIndex >= markers.length) {
    return content
  }

  const marker = markers[markerIndex]
  return content.slice(0, marker.startIndex) + content.slice(marker.endIndex)
}

/**
 * Extract all prompt texts from markers
 * @param {string} content - Document content
 * @returns {string[]} Array of prompt texts
 */
export function extractPrompts(content) {
  return findAllMarkers(content).map(m => m.prompt)
}

/**
 * Combine all prompts into a single string for Claude
 * @param {string} content - Document content
 * @param {string} separator - Separator between prompts (default: newline with divider)
 * @returns {string} Combined prompt text
 */
export function combinePrompts(content, separator = '\n---\n') {
  const prompts = extractPrompts(content)
  return prompts.join(separator)
}

/**
 * Escape HTML entities to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML insertion
 */
function escapeHtmlEntities(str) {
  if (!str) return str
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Highlight markers in HTML content for visual distinction
 * Wraps markers in a span with the 'puffin-marker' class
 *
 * SECURITY: This function sanitizes marker content to prevent XSS attacks.
 * Any HTML entities in the marker content are escaped before wrapping.
 *
 * @param {string} html - HTML content (possibly from highlight.js)
 * @returns {string} HTML with markers wrapped in highlighting spans
 */
export function highlightMarkersInHtml(html) {
  if (!html) return html

  // Pattern to match markers, being careful with HTML entities
  // The content might have HTML escaping applied
  const escapedMarkerPattern = /(\/@puffin:[\s\S]*?\/\/)/g

  // Replace markers with sanitized, wrapped versions
  // The marker content is escaped to prevent XSS if it contains HTML/script tags
  return html.replace(escapedMarkerPattern, (match) => {
    const sanitizedMatch = escapeHtmlEntities(match)
    return `<span class="puffin-marker">${sanitizedMatch}</span>`
  })
}

/**
 * Validate marker syntax
 * Checks if a string is a properly formatted marker
 * @param {string} text - Text to validate
 * @returns {boolean}
 */
export function isValidMarker(text) {
  if (!text) return false
  const trimmed = text.trim()
  return trimmed.startsWith(MARKER_START) && trimmed.endsWith(MARKER_END)
}

/**
 * Get marker at cursor position
 * @param {string} content - Document content
 * @param {number} cursorPosition - Cursor position in content
 * @returns {{marker: Object, index: number}|null} Marker info if cursor is inside a marker
 */
export function getMarkerAtPosition(content, cursorPosition) {
  const markers = findAllMarkers(content)

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]
    if (cursorPosition >= marker.startIndex && cursorPosition <= marker.endIndex) {
      return { marker, index: i }
    }
  }

  return null
}

/**
 * Get the optimal insertion position for cursor after creating a marker
 * (Inside the marker, after the opening delimiter and space)
 * @param {number} markerStart - Start position where marker was inserted
 * @returns {number} Cursor position inside the marker
 */
export function getCursorPositionInMarker(markerStart) {
  // Position after "/@puffin: "
  return markerStart + MARKER_START.length + 1
}

// Default export for convenience
export default {
  MARKER_START,
  MARKER_END,
  MARKER_REGEX,
  findAllMarkers,
  hasMarkers,
  countMarkers,
  createMarker,
  removeAllMarkers,
  removeMarkerByIndex,
  extractPrompts,
  combinePrompts,
  highlightMarkersInHtml,
  isValidMarker,
  getMarkerAtPosition,
  getCursorPositionInMarker
}
