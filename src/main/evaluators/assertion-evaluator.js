/**
 * Assertion Evaluator Orchestrator
 *
 * Coordinates the evaluation of inspection assertions for user stories.
 * Delegates to type-specific evaluators and aggregates results.
 *
 * @module evaluators/assertion-evaluator
 */

const fs = require('fs').promises
const path = require('path')

// Import type-specific evaluators
const { FileExistsEvaluator } = require('./evaluators/file-exists')
const { FileContainsEvaluator } = require('./evaluators/file-contains')
const { JsonPropertyEvaluator } = require('./evaluators/json-property')
const { ExportExistsEvaluator } = require('./evaluators/export-exists')
const { ClassStructureEvaluator } = require('./evaluators/class-structure')
const { FunctionSignatureEvaluator } = require('./evaluators/function-signature')
const { ImportExistsEvaluator } = require('./evaluators/import-exists')
const { IpcHandlerEvaluator } = require('./evaluators/ipc-handler')
const { CssSelectorEvaluator } = require('./evaluators/css-selector')
const { PatternMatchEvaluator } = require('./evaluators/pattern-match')

/**
 * Assertion type constants
 */
const AssertionType = {
  FILE_EXISTS: 'FILE_EXISTS',
  FILE_CONTAINS: 'FILE_CONTAINS',
  JSON_PROPERTY: 'JSON_PROPERTY',
  EXPORT_EXISTS: 'EXPORT_EXISTS',
  CLASS_STRUCTURE: 'CLASS_STRUCTURE',
  FUNCTION_SIGNATURE: 'FUNCTION_SIGNATURE',
  IMPORT_EXISTS: 'IMPORT_EXISTS',
  IPC_HANDLER_REGISTERED: 'IPC_HANDLER_REGISTERED',
  CSS_SELECTOR_EXISTS: 'CSS_SELECTOR_EXISTS',
  PATTERN_MATCH: 'PATTERN_MATCH'
}

/**
 * Result status constants
 */
const AssertionStatus = {
  PASSED: 'passed',
  FAILED: 'failed',
  ERROR: 'error'
}

/**
 * Main assertion evaluator class
 */
class AssertionEvaluator {
  /**
   * Create an assertion evaluator
   * @param {string} projectPath - Root path of the project
   */
  constructor(projectPath) {
    this.projectPath = projectPath
    this.evaluators = this._initializeEvaluators()
  }

  /**
   * Initialize type-specific evaluators
   * @private
   * @returns {Object} Map of type to evaluator instance
   */
  _initializeEvaluators() {
    return {
      [AssertionType.FILE_EXISTS]: new FileExistsEvaluator(this.projectPath),
      [AssertionType.FILE_CONTAINS]: new FileContainsEvaluator(this.projectPath),
      [AssertionType.JSON_PROPERTY]: new JsonPropertyEvaluator(this.projectPath),
      [AssertionType.EXPORT_EXISTS]: new ExportExistsEvaluator(this.projectPath),
      [AssertionType.CLASS_STRUCTURE]: new ClassStructureEvaluator(this.projectPath),
      [AssertionType.FUNCTION_SIGNATURE]: new FunctionSignatureEvaluator(this.projectPath),
      [AssertionType.IMPORT_EXISTS]: new ImportExistsEvaluator(this.projectPath),
      [AssertionType.IPC_HANDLER_REGISTERED]: new IpcHandlerEvaluator(this.projectPath),
      [AssertionType.CSS_SELECTOR_EXISTS]: new CssSelectorEvaluator(this.projectPath),
      [AssertionType.PATTERN_MATCH]: new PatternMatchEvaluator(this.projectPath)
    }
  }

  /**
   * Evaluate a single assertion
   *
   * @param {Object} assertion - The assertion to evaluate
   * @returns {Promise<Object>} Evaluation result
   */
  async evaluateAssertion(assertion) {
    const startTime = Date.now()

    try {
      const evaluator = this.evaluators[assertion.type]

      if (!evaluator) {
        return {
          assertionId: assertion.id,
          status: AssertionStatus.ERROR,
          message: `Unknown assertion type: ${assertion.type}`,
          details: { unsupportedType: assertion.type },
          duration: Date.now() - startTime
        }
      }

      const result = await evaluator.evaluate(assertion)

      return {
        assertionId: assertion.id,
        status: result.passed ? AssertionStatus.PASSED : AssertionStatus.FAILED,
        message: result.message,
        details: result.details || null,
        duration: Date.now() - startTime
      }
    } catch (error) {
      return {
        assertionId: assertion.id,
        status: AssertionStatus.ERROR,
        message: `Evaluation error: ${error.message}`,
        details: { error: error.message, stack: error.stack },
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Evaluate all assertions for a story
   *
   * @param {Object[]} assertions - Array of assertions to evaluate
   * @param {Function} [onProgress] - Optional progress callback (index, total, result)
   * @returns {Promise<Object>} Complete evaluation results
   */
  async evaluateAll(assertions, onProgress = null) {
    if (!Array.isArray(assertions) || assertions.length === 0) {
      return {
        evaluatedAt: new Date().toISOString(),
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          error: 0
        },
        results: []
      }
    }

    const results = []
    const startTime = Date.now()

    // Evaluate assertions in parallel (with a reasonable concurrency limit)
    const CONCURRENCY_LIMIT = 5
    const chunks = this._chunkArray(assertions, CONCURRENCY_LIMIT)

    let processedCount = 0

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(async (assertion) => {
          const result = await this.evaluateAssertion(assertion)
          processedCount++

          if (onProgress) {
            onProgress(processedCount, assertions.length, result)
          }

          return result
        })
      )
      results.push(...chunkResults)
    }

    // Calculate summary
    const summary = {
      total: results.length,
      passed: results.filter(r => r.status === AssertionStatus.PASSED).length,
      failed: results.filter(r => r.status === AssertionStatus.FAILED).length,
      error: results.filter(r => r.status === AssertionStatus.ERROR).length
    }

    return {
      evaluatedAt: new Date().toISOString(),
      duration: Date.now() - startTime,
      summary,
      results
    }
  }

  /**
   * Split array into chunks
   * @private
   */
  _chunkArray(array, size) {
    const chunks = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}

module.exports = { AssertionEvaluator, AssertionType, AssertionStatus }
