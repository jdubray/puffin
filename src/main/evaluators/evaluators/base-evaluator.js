/**
 * Base Evaluator Class
 *
 * Provides common functionality for all assertion evaluators.
 *
 * @module evaluators/base-evaluator
 */

const fs = require('fs').promises
const path = require('path')

/**
 * Base class for assertion evaluators
 */
class BaseEvaluator {
  /**
   * Create a base evaluator
   * @param {string} projectPath - Root path of the project
   */
  constructor(projectPath) {
    this.projectPath = projectPath
  }

  /**
   * Resolve a target path relative to the project root
   * @param {string} target - The target path from the assertion
   * @returns {string} Absolute path
   */
  resolvePath(target) {
    if (path.isAbsolute(target)) {
      return target
    }
    return path.join(this.projectPath, target)
  }

  /**
   * Check if a file exists
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>}
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Read file contents
   * @param {string} filePath - Path to read
   * @returns {Promise<string>}
   */
  async readFile(filePath) {
    return fs.readFile(filePath, 'utf8')
  }

  /**
   * Get file stats
   * @param {string} filePath - Path to check
   * @returns {Promise<import('fs').Stats|null>}
   */
  async getStats(filePath) {
    try {
      return await fs.stat(filePath)
    } catch {
      return null
    }
  }

  /**
   * Create a passing result
   * @param {string} message - Success message
   * @param {Object} [details] - Optional details
   * @returns {{ passed: boolean, message: string, details?: Object }}
   */
  pass(message, details = null) {
    return { passed: true, message, details }
  }

  /**
   * Create a failing result
   * @param {string} message - Failure message
   * @param {Object} [details] - Optional details
   * @returns {{ passed: boolean, message: string, details?: Object }}
   */
  fail(message, details = null) {
    return { passed: false, message, details }
  }

  /**
   * Evaluate an assertion - must be implemented by subclasses
   * @param {Object} assertion - The assertion to evaluate
   * @returns {Promise<{ passed: boolean, message: string, details?: Object }>}
   */
  async evaluate(assertion) {
    throw new Error('evaluate() must be implemented by subclass')
  }
}

module.exports = { BaseEvaluator }
