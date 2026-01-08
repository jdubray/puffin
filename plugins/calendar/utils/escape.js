/**
 * Escape Utilities
 *
 * Centralized HTML and attribute escaping functions for XSS prevention.
 * These utilities ensure consistent escaping across all calendar components.
 */

/**
 * Escape HTML special characters for safe insertion into element content.
 * Uses regex-based replacement for Node.js compatibility in tests.
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for HTML content
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return ''
  if (typeof text !== 'string') return ''

  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Escape attribute special characters for safe insertion into HTML attributes.
 * Escapes quotes and other characters that could break out of attribute context.
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for HTML attributes
 */
function escapeAttr(text) {
  if (text === null || text === undefined) return ''
  if (typeof text !== 'string') return ''

  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export { escapeHtml, escapeAttr }
