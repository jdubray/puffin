/**
 * CSS_SELECTOR_EXISTS Assertion Evaluator
 *
 * Verifies that CSS selectors are defined in stylesheets.
 *
 * @module evaluators/css-selector
 */

const { BaseEvaluator } = require('./base-evaluator')

/**
 * Evaluator for CSS_SELECTOR_EXISTS assertions
 */
class CssSelectorEvaluator extends BaseEvaluator {
  /**
   * Evaluate a CSS_SELECTOR_EXISTS assertion
   *
   * @param {Object} assertion - The assertion to evaluate
   * @param {string} assertion.target - Path to CSS file
   * @param {Object} assertion.assertion - Assertion parameters
   * @param {string[]} assertion.assertion.selectors - Expected CSS selectors
   * @returns {Promise<{ passed: boolean, message: string, details?: Object }>}
   */
  async evaluate(assertion) {
    const targetPath = this.resolvePath(assertion.target)
    const { selectors: expectedSelectors } = assertion.assertion || {}

    if (!expectedSelectors || !Array.isArray(expectedSelectors)) {
      return this.fail(
        'CSS_SELECTOR_EXISTS requires selectors array',
        { path: assertion.target }
      )
    }

    // Check file exists
    if (!(await this.fileExists(targetPath))) {
      return this.fail(
        `File does not exist: ${assertion.target}`,
        { path: assertion.target, exists: false }
      )
    }

    // Read file content
    let fileContent
    try {
      fileContent = await this.readFile(targetPath)
    } catch (error) {
      return this.fail(
        `Failed to read file: ${assertion.target}`,
        { path: assertion.target, error: error.message }
      )
    }

    // Parse selectors from file
    const foundSelectors = this.parseSelectors(fileContent)
    const missing = []

    for (const expected of expectedSelectors) {
      if (!this.selectorExists(expected, foundSelectors)) {
        missing.push(expected)
      }
    }

    if (missing.length > 0) {
      return this.fail(
        `Missing CSS selectors in: ${assertion.target}`,
        {
          path: assertion.target,
          missing,
          foundSelectors: foundSelectors.slice(0, 50) // Limit output
        }
      )
    }

    return this.pass(
      `All expected CSS selectors found in: ${assertion.target}`,
      {
        path: assertion.target,
        selectors: expectedSelectors
      }
    )
  }

  /**
   * Parse CSS selectors from file content
   *
   * @param {string} content - CSS file content
   * @returns {string[]} Array of selectors
   */
  parseSelectors(content) {
    const selectors = []

    // Remove comments
    content = content.replace(/\/\*[\s\S]*?\*\//g, '')

    // Match selectors before {
    // This handles multi-line selectors and grouped selectors
    const selectorPattern = /([^{}]+)\{/g
    let match

    while ((match = selectorPattern.exec(content)) !== null) {
      const selectorGroup = match[1].trim()

      if (!selectorGroup) continue

      // Skip @rules content
      if (selectorGroup.startsWith('@')) {
        // Extract media query or keyframes name but skip the rule itself
        if (selectorGroup.startsWith('@media') || selectorGroup.startsWith('@supports')) {
          continue
        }
        if (selectorGroup.startsWith('@keyframes') || selectorGroup.startsWith('@-webkit-keyframes')) {
          const keyframeName = selectorGroup.match(/@(?:-webkit-)?keyframes\s+(\S+)/)
          if (keyframeName) {
            selectors.push(`@keyframes ${keyframeName[1]}`)
          }
          continue
        }
        continue
      }

      // Split grouped selectors (a, b, c { ... })
      const individualSelectors = selectorGroup.split(',').map(s => s.trim()).filter(s => s)

      for (const selector of individualSelectors) {
        // Normalize whitespace
        const normalized = selector.replace(/\s+/g, ' ').trim()
        if (normalized && !selectors.includes(normalized)) {
          selectors.push(normalized)
        }
      }
    }

    return selectors
  }

  /**
   * Check if a selector exists in the found selectors
   * Handles exact match and partial matching for flexibility
   *
   * @param {string} expected - Expected selector
   * @param {string[]} found - Found selectors
   * @returns {boolean}
   */
  selectorExists(expected, found) {
    const normalizedExpected = expected.replace(/\s+/g, ' ').trim()

    // Exact match
    if (found.includes(normalizedExpected)) {
      return true
    }

    // Check for class or id selector as part of compound selectors
    // e.g., ".btn" should match ".btn:hover" or ".container .btn"
    for (const selector of found) {
      // Check if the expected selector appears as a complete token
      const pattern = new RegExp(
        `(^|[\\s>+~])${this.escapeRegex(normalizedExpected)}($|[\\s>+~:.[#])`,
        'i'
      )
      if (pattern.test(` ${selector} `)) {
        return true
      }

      // Also check if expected equals the start of a selector (for pseudo-classes)
      if (selector.startsWith(normalizedExpected + ':') ||
          selector.startsWith(normalizedExpected + '[') ||
          selector.startsWith(normalizedExpected + '.') ||
          selector.startsWith(normalizedExpected + '#')) {
        return true
      }
    }

    return false
  }

  /**
   * Escape special regex characters in a string
   *
   * @param {string} str - String to escape
   * @returns {string}
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}

module.exports = { CssSelectorEvaluator }
