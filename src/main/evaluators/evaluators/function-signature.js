/**
 * FUNCTION_SIGNATURE Assertion Evaluator
 *
 * Verifies that a function has the expected signature.
 *
 * @module evaluators/function-signature
 */

const { BaseEvaluator } = require('./base-evaluator')

/**
 * Evaluator for FUNCTION_SIGNATURE assertions
 */
class FunctionSignatureEvaluator extends BaseEvaluator {
  /**
   * Evaluate a FUNCTION_SIGNATURE assertion
   *
   * @param {Object} assertion - The assertion to evaluate
   * @param {string} assertion.target - Path to file containing the function
   * @param {Object} assertion.assertion - Assertion parameters
   * @param {string} assertion.assertion.function_name - Name of the function
   * @param {string[]} [assertion.assertion.parameters] - Expected parameter names
   * @param {boolean} [assertion.assertion.async] - Whether function should be async
   * @returns {Promise<{ passed: boolean, message: string, details?: Object }>}
   */
  async evaluate(assertion) {
    const targetPath = this.resolvePath(assertion.target)
    const { function_name, parameters, async: isAsync } = assertion.assertion || {}

    if (!function_name) {
      return this.fail(
        'FUNCTION_SIGNATURE requires function_name',
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

    // Parse function from file
    const funcInfo = this.parseFunction(fileContent, function_name)

    if (!funcInfo) {
      return this.fail(
        `Function not found: ${function_name}`,
        { path: assertion.target, functionName: function_name }
      )
    }

    const issues = []

    // Check async
    if (isAsync !== undefined && funcInfo.async !== isAsync) {
      issues.push({
        type: 'async',
        expected: isAsync,
        actual: funcInfo.async
      })
    }

    // Check parameters
    if (parameters && Array.isArray(parameters)) {
      const missingParams = parameters.filter(p => !funcInfo.parameters.includes(p))
      const extraParams = funcInfo.parameters.filter(p => !parameters.includes(p))

      if (missingParams.length > 0 || extraParams.length > 0) {
        issues.push({
          type: 'parameters',
          expected: parameters,
          actual: funcInfo.parameters,
          missing: missingParams,
          extra: extraParams
        })
      }
    }

    if (issues.length > 0) {
      return this.fail(
        `Function signature mismatch: ${function_name}`,
        {
          path: assertion.target,
          functionName: function_name,
          issues,
          funcInfo
        }
      )
    }

    return this.pass(
      `Function signature verified: ${function_name}`,
      {
        path: assertion.target,
        functionName: function_name,
        parameters: funcInfo.parameters,
        async: funcInfo.async
      }
    )
  }

  /**
   * Parse function information from file content
   *
   * @param {string} content - File content
   * @param {string} functionName - Name of function to find
   * @returns {{ name: string, parameters: string[], async: boolean } | null}
   */
  parseFunction(content, functionName) {
    // Try different function patterns

    // Standard function declaration: function name() or async function name()
    const funcDeclPattern = new RegExp(
      `(async\\s+)?function\\s+${functionName}\\s*\\(([^)]*)\\)`,
      'm'
    )
    let match = content.match(funcDeclPattern)
    if (match) {
      return {
        name: functionName,
        async: !!match[1],
        parameters: this.parseParameters(match[2])
      }
    }

    // Arrow function: const name = () => or const name = async () =>
    const arrowPattern = new RegExp(
      `(?:const|let|var)\\s+${functionName}\\s*=\\s*(async\\s*)?\\(([^)]*)\\)\\s*=>`,
      'm'
    )
    match = content.match(arrowPattern)
    if (match) {
      return {
        name: functionName,
        async: !!match[1],
        parameters: this.parseParameters(match[2])
      }
    }

    // Arrow function with single param: const name = async x =>
    const singleParamArrowPattern = new RegExp(
      `(?:const|let|var)\\s+${functionName}\\s*=\\s*(async\\s+)?(\\w+)\\s*=>`,
      'm'
    )
    match = content.match(singleParamArrowPattern)
    if (match) {
      return {
        name: functionName,
        async: !!match[1],
        parameters: [match[2]]
      }
    }

    // Method in object literal: name: function() or name: async function()
    const methodPattern = new RegExp(
      `${functionName}\\s*:\\s*(async\\s+)?function\\s*\\(([^)]*)\\)`,
      'm'
    )
    match = content.match(methodPattern)
    if (match) {
      return {
        name: functionName,
        async: !!match[1],
        parameters: this.parseParameters(match[2])
      }
    }

    // Shorthand method: name() { or async name() {
    const shorthandPattern = new RegExp(
      `(async\\s+)?${functionName}\\s*\\(([^)]*)\\)\\s*\\{`,
      'm'
    )
    match = content.match(shorthandPattern)
    if (match) {
      return {
        name: functionName,
        async: !!match[1],
        parameters: this.parseParameters(match[2])
      }
    }

    // Method arrow: name: () => or name: async () =>
    const methodArrowPattern = new RegExp(
      `${functionName}\\s*:\\s*(async\\s*)?\\(([^)]*)\\)\\s*=>`,
      'm'
    )
    match = content.match(methodArrowPattern)
    if (match) {
      return {
        name: functionName,
        async: !!match[1],
        parameters: this.parseParameters(match[2])
      }
    }

    // Export function: export function name() or export async function name()
    const exportFuncPattern = new RegExp(
      `export\\s+(async\\s+)?function\\s+${functionName}\\s*\\(([^)]*)\\)`,
      'm'
    )
    match = content.match(exportFuncPattern)
    if (match) {
      return {
        name: functionName,
        async: !!match[1],
        parameters: this.parseParameters(match[2])
      }
    }

    return null
  }

  /**
   * Parse parameter names from parameter string
   *
   * @param {string} paramString - Parameters as string
   * @returns {string[]}
   */
  parseParameters(paramString) {
    if (!paramString || !paramString.trim()) {
      return []
    }

    // Split by comma, handling nested parentheses for destructuring
    const params = []
    let current = ''
    let depth = 0

    for (const char of paramString) {
      if (char === '(' || char === '{' || char === '[') {
        depth++
        current += char
      } else if (char === ')' || char === '}' || char === ']') {
        depth--
        current += char
      } else if (char === ',' && depth === 0) {
        if (current.trim()) {
          params.push(this.extractParamName(current.trim()))
        }
        current = ''
      } else {
        current += char
      }
    }

    if (current.trim()) {
      params.push(this.extractParamName(current.trim()))
    }

    return params.filter(p => p)
  }

  /**
   * Extract parameter name from parameter declaration
   * Handles defaults, destructuring, and rest parameters
   *
   * @param {string} param - Parameter string
   * @returns {string}
   */
  extractParamName(param) {
    // Remove default value
    param = param.split('=')[0].trim()

    // Rest parameter: ...name
    if (param.startsWith('...')) {
      return param.substring(3).trim()
    }

    // Destructuring: { a, b } or [a, b]
    if (param.startsWith('{') || param.startsWith('[')) {
      // Return the whole destructuring pattern
      return param
    }

    // Simple parameter
    return param
  }
}

module.exports = { FunctionSignatureEvaluator }
