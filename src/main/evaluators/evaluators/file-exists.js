/**
 * FILE_EXISTS Assertion Evaluator
 *
 * Verifies that a file or directory exists at the specified path.
 *
 * @module evaluators/file-exists
 */

const { BaseEvaluator } = require('./base-evaluator')

/**
 * Evaluator for FILE_EXISTS assertions
 */
class FileExistsEvaluator extends BaseEvaluator {
  /**
   * Evaluate a FILE_EXISTS assertion
   *
   * @param {Object} assertion - The assertion to evaluate
   * @param {string} assertion.target - Path to check
   * @param {Object} [assertion.assertion] - Assertion parameters
   * @param {string} [assertion.assertion.type] - 'file' or 'directory'
   * @returns {Promise<{ passed: boolean, message: string, details?: Object }>}
   */
  async evaluate(assertion) {
    const targetPath = this.resolvePath(assertion.target)
    const expectedType = assertion.assertion?.type || 'file'

    const stats = await this.getStats(targetPath)

    if (!stats) {
      return this.fail(
        `${expectedType === 'directory' ? 'Directory' : 'File'} does not exist: ${assertion.target}`,
        { path: assertion.target, expectedType, exists: false }
      )
    }

    // Check type if specified
    if (expectedType === 'directory') {
      if (!stats.isDirectory()) {
        return this.fail(
          `Expected directory but found file: ${assertion.target}`,
          { path: assertion.target, expectedType, actualType: 'file' }
        )
      }
    } else if (expectedType === 'file') {
      if (!stats.isFile()) {
        return this.fail(
          `Expected file but found directory: ${assertion.target}`,
          { path: assertion.target, expectedType, actualType: 'directory' }
        )
      }
    }

    return this.pass(
      `${expectedType === 'directory' ? 'Directory' : 'File'} exists: ${assertion.target}`,
      { path: assertion.target, type: expectedType }
    )
  }
}

module.exports = { FileExistsEvaluator }
