/**
 * PATTERN_MATCH Assertion Evaluator
 *
 * Verifies presence or absence of patterns in files.
 *
 * @module evaluators/pattern-match
 */

const { BaseEvaluator } = require('./base-evaluator')

/**
 * Evaluator for PATTERN_MATCH assertions
 */
class PatternMatchEvaluator extends BaseEvaluator {
  /**
   * Evaluate a PATTERN_MATCH assertion
   *
   * @param {Object} assertion - The assertion to evaluate
   * @param {string} assertion.target - Path to file
   * @param {Object} assertion.assertion - Assertion parameters
   * @param {string} assertion.assertion.pattern - Regex pattern to search for
   * @param {string} assertion.assertion.operator - 'present' or 'absent'
   * @param {string} [assertion.assertion.flags] - Regex flags (e.g., 'i', 'g', 'm')
   * @returns {Promise<{ passed: boolean, message: string, details?: Object }>}
   */
  async evaluate(assertion) {
    const targetPath = this.resolvePath(assertion.target)
    const { pattern, operator, flags } = assertion.assertion || {}

    if (!pattern) {
      return this.fail(
        'PATTERN_MATCH requires pattern string',
        { path: assertion.target }
      )
    }

    if (!operator || !['present', 'absent'].includes(operator)) {
      return this.fail(
        'PATTERN_MATCH requires operator: "present" or "absent"',
        { path: assertion.target, operator }
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

    // Create regex
    let regex
    try {
      regex = new RegExp(pattern, flags || 'm')
    } catch (error) {
      return this.fail(
        `Invalid regex pattern: ${pattern}`,
        { path: assertion.target, pattern, error: error.message }
      )
    }

    // Check pattern
    const matchResult = fileContent.match(regex)
    const patternFound = matchResult !== null

    if (operator === 'present') {
      if (patternFound) {
        return this.pass(
          `Pattern found in: ${assertion.target}`,
          {
            path: assertion.target,
            pattern,
            operator,
            matchedText: matchResult[0],
            matchIndex: matchResult.index
          }
        )
      } else {
        return this.fail(
          `Pattern not found in: ${assertion.target}`,
          {
            path: assertion.target,
            pattern,
            operator
          }
        )
      }
    } else {
      // operator === 'absent'
      if (!patternFound) {
        return this.pass(
          `Pattern correctly absent from: ${assertion.target}`,
          {
            path: assertion.target,
            pattern,
            operator
          }
        )
      } else {
        return this.fail(
          `Pattern should be absent but was found in: ${assertion.target}`,
          {
            path: assertion.target,
            pattern,
            operator,
            matchedText: matchResult[0],
            matchIndex: matchResult.index
          }
        )
      }
    }
  }
}

module.exports = { PatternMatchEvaluator }
