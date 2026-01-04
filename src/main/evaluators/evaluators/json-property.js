/**
 * JSON_PROPERTY Assertion Evaluator
 *
 * Verifies that a JSON file has expected properties.
 *
 * @module evaluators/json-property
 */

const { BaseEvaluator } = require('./base-evaluator')

/**
 * Evaluator for JSON_PROPERTY assertions
 */
class JsonPropertyEvaluator extends BaseEvaluator {
  /**
   * Evaluate a JSON_PROPERTY assertion
   *
   * @param {Object} assertion - The assertion to evaluate
   * @param {string} assertion.target - Path to JSON file
   * @param {Object} assertion.assertion - Assertion parameters
   * @param {string} assertion.assertion.path - JSON path (dot-notation)
   * @param {string} assertion.assertion.operator - 'exists', 'equals', 'contains', 'matches'
   * @param {*} [assertion.assertion.value] - Expected value (for equals/contains/matches)
   * @returns {Promise<{ passed: boolean, message: string, details?: Object }>}
   */
  async evaluate(assertion) {
    const targetPath = this.resolvePath(assertion.target)
    const { path: jsonPath, operator, value } = assertion.assertion || {}

    if (!jsonPath || !operator) {
      return this.fail(
        'JSON_PROPERTY requires path and operator',
        { path: assertion.target, jsonPath, operator }
      )
    }

    // Check file exists
    if (!(await this.fileExists(targetPath))) {
      return this.fail(
        `File does not exist: ${assertion.target}`,
        { path: assertion.target, exists: false }
      )
    }

    // Read and parse JSON
    let jsonContent
    try {
      const fileContent = await this.readFile(targetPath)
      jsonContent = JSON.parse(fileContent)
    } catch (error) {
      return this.fail(
        `Failed to parse JSON: ${assertion.target}`,
        { path: assertion.target, error: error.message }
      )
    }

    // Get value at path
    const actualValue = this.getValueAtPath(jsonContent, jsonPath)
    const pathExists = actualValue !== undefined

    // Evaluate based on operator
    switch (operator) {
      case 'exists':
        if (pathExists) {
          return this.pass(
            `Property exists: ${jsonPath}`,
            { path: assertion.target, jsonPath, value: actualValue }
          )
        } else {
          return this.fail(
            `Property does not exist: ${jsonPath}`,
            { path: assertion.target, jsonPath }
          )
        }

      case 'equals':
        if (!pathExists) {
          return this.fail(
            `Property does not exist: ${jsonPath}`,
            { path: assertion.target, jsonPath, expected: value }
          )
        }
        if (this.deepEquals(actualValue, value)) {
          return this.pass(
            `Property equals expected value: ${jsonPath}`,
            { path: assertion.target, jsonPath, value: actualValue }
          )
        } else {
          return this.fail(
            `Property value mismatch: ${jsonPath}`,
            { path: assertion.target, jsonPath, expected: value, actual: actualValue }
          )
        }

      case 'contains':
        if (!pathExists) {
          return this.fail(
            `Property does not exist: ${jsonPath}`,
            { path: assertion.target, jsonPath, expected: value }
          )
        }
        if (this.contains(actualValue, value)) {
          return this.pass(
            `Property contains expected value: ${jsonPath}`,
            { path: assertion.target, jsonPath, value: actualValue, contains: value }
          )
        } else {
          return this.fail(
            `Property does not contain expected value: ${jsonPath}`,
            { path: assertion.target, jsonPath, actual: actualValue, expected: value }
          )
        }

      case 'matches':
        if (!pathExists) {
          return this.fail(
            `Property does not exist: ${jsonPath}`,
            { path: assertion.target, jsonPath, pattern: value }
          )
        }
        try {
          const regex = new RegExp(value)
          const stringValue = String(actualValue)
          if (regex.test(stringValue)) {
            return this.pass(
              `Property matches pattern: ${jsonPath}`,
              { path: assertion.target, jsonPath, value: actualValue, pattern: value }
            )
          } else {
            return this.fail(
              `Property does not match pattern: ${jsonPath}`,
              { path: assertion.target, jsonPath, value: actualValue, pattern: value }
            )
          }
        } catch (error) {
          return this.fail(
            `Invalid regex pattern: ${value}`,
            { path: assertion.target, jsonPath, pattern: value, error: error.message }
          )
        }

      default:
        return this.fail(
          `Unknown operator: ${operator}`,
          { path: assertion.target, jsonPath, operator }
        )
    }
  }

  /**
   * Get value at a dot-notation path
   * @param {Object} obj - The object to traverse
   * @param {string} path - Dot-notation path
   * @returns {*} Value at path or undefined
   */
  getValueAtPath(obj, path) {
    const parts = path.split('.')
    let current = obj

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }

      // Handle array indexing
      const arrayMatch = part.match(/^(.+)\[(\d+)\]$/)
      if (arrayMatch) {
        const [, key, index] = arrayMatch
        current = current[key]
        if (!Array.isArray(current)) {
          return undefined
        }
        current = current[parseInt(index, 10)]
      } else {
        current = current[part]
      }
    }

    return current
  }

  /**
   * Deep equality check
   * @param {*} a - First value
   * @param {*} b - Second value
   * @returns {boolean}
   */
  deepEquals(a, b) {
    if (a === b) return true
    if (typeof a !== typeof b) return false
    if (typeof a !== 'object') return false
    if (a === null || b === null) return a === b
    if (Array.isArray(a) !== Array.isArray(b)) return false

    const keysA = Object.keys(a)
    const keysB = Object.keys(b)

    if (keysA.length !== keysB.length) return false

    return keysA.every(key => this.deepEquals(a[key], b[key]))
  }

  /**
   * Check if value contains another value
   * @param {*} haystack - Container value
   * @param {*} needle - Value to find
   * @returns {boolean}
   */
  contains(haystack, needle) {
    if (typeof haystack === 'string') {
      return haystack.includes(String(needle))
    }
    if (Array.isArray(haystack)) {
      return haystack.some(item => this.deepEquals(item, needle))
    }
    if (typeof haystack === 'object' && haystack !== null) {
      // For objects, check if all needle keys exist with matching values
      if (typeof needle === 'object' && needle !== null) {
        return Object.keys(needle).every(key =>
          this.deepEquals(haystack[key], needle[key])
        )
      }
    }
    return false
  }
}

module.exports = { JsonPropertyEvaluator }
