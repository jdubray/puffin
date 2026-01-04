/**
 * FILE_CONTAINS Assertion Evaluator
 *
 * Verifies that a file contains specific content (literal or regex).
 *
 * @module evaluators/file-contains
 */

const { BaseEvaluator } = require('./base-evaluator')

/**
 * Evaluator for FILE_CONTAINS assertions
 */
class FileContainsEvaluator extends BaseEvaluator {
  /**
   * Evaluate a FILE_CONTAINS assertion
   *
   * @param {Object} assertion - The assertion to evaluate
   * @param {string} assertion.target - Path to file
   * @param {Object} assertion.assertion - Assertion parameters
   * @param {string} assertion.assertion.match - 'literal' or 'regex'
   * @param {string} assertion.assertion.content - Content to search for
   * @returns {Promise<{ passed: boolean, message: string, details?: Object }>}
   */
  async evaluate(assertion) {
    const targetPath = this.resolvePath(assertion.target)
    const { match, content } = assertion.assertion || {}

    if (!match || !content) {
      return this.fail(
        'FILE_CONTAINS requires match type and content',
        { path: assertion.target, match, content }
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

    // Check content based on match type
    let found = false
    let matchDetails = {}

    if (match === 'literal') {
      found = fileContent.includes(content)
      matchDetails = { matchType: 'literal', searchContent: content }
    } else if (match === 'regex') {
      try {
        const regex = new RegExp(content, 'm')
        const matchResult = fileContent.match(regex)
        found = matchResult !== null
        matchDetails = {
          matchType: 'regex',
          pattern: content,
          matchedText: matchResult ? matchResult[0] : null
        }
      } catch (error) {
        return this.fail(
          `Invalid regex pattern: ${content}`,
          { path: assertion.target, pattern: content, error: error.message }
        )
      }
    } else {
      return this.fail(
        `Unknown match type: ${match}`,
        { path: assertion.target, matchType: match }
      )
    }

    if (found) {
      return this.pass(
        `File contains expected content: ${assertion.target}`,
        { path: assertion.target, ...matchDetails }
      )
    } else {
      return this.fail(
        `File does not contain expected content: ${assertion.target}`,
        { path: assertion.target, ...matchDetails }
      )
    }
  }
}

module.exports = { FileContainsEvaluator }
