/**
 * EXPORT_EXISTS Assertion Evaluator
 *
 * Verifies that a module exports specific identifiers.
 *
 * @module evaluators/export-exists
 */

const { BaseEvaluator } = require('./base-evaluator')

/**
 * Evaluator for EXPORT_EXISTS assertions
 */
class ExportExistsEvaluator extends BaseEvaluator {
  /**
   * Evaluate an EXPORT_EXISTS assertion
   *
   * @param {Object} assertion - The assertion to evaluate
   * @param {string} assertion.target - Path to module file
   * @param {Object} assertion.assertion - Assertion parameters
   * @param {Array<{name: string, type?: string}>} assertion.assertion.exports - Expected exports
   * @returns {Promise<{ passed: boolean, message: string, details?: Object }>}
   */
  async evaluate(assertion) {
    const targetPath = this.resolvePath(assertion.target)
    const { exports: expectedExports } = assertion.assertion || {}

    if (!expectedExports || !Array.isArray(expectedExports)) {
      return this.fail(
        'EXPORT_EXISTS requires exports array',
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

    // Parse exports from file
    const foundExports = this.parseExports(fileContent)
    const missing = []
    const typeMismatches = []

    for (const expected of expectedExports) {
      const found = foundExports.find(exp => exp.name === expected.name)

      if (!found) {
        missing.push(expected.name)
      } else if (expected.type && expected.type !== 'any' && found.type !== expected.type) {
        typeMismatches.push({
          name: expected.name,
          expected: expected.type,
          actual: found.type
        })
      }
    }

    if (missing.length > 0 || typeMismatches.length > 0) {
      return this.fail(
        `Missing or mismatched exports in: ${assertion.target}`,
        {
          path: assertion.target,
          missing,
          typeMismatches,
          foundExports: foundExports.map(e => ({ name: e.name, type: e.type }))
        }
      )
    }

    return this.pass(
      `All expected exports found in: ${assertion.target}`,
      {
        path: assertion.target,
        exports: expectedExports.map(e => e.name)
      }
    )
  }

  /**
   * Parse exports from file content
   * Handles CommonJS (module.exports) and ES modules (export)
   *
   * @param {string} content - File content
   * @returns {Array<{name: string, type: string}>}
   */
  parseExports(content) {
    const exports = []

    // ES module: export class ClassName
    const classExports = content.matchAll(/export\s+class\s+(\w+)/g)
    for (const match of classExports) {
      exports.push({ name: match[1], type: 'class' })
    }

    // ES module: export function functionName
    const functionExports = content.matchAll(/export\s+function\s+(\w+)/g)
    for (const match of functionExports) {
      exports.push({ name: match[1], type: 'function' })
    }

    // ES module: export async function functionName
    const asyncFunctionExports = content.matchAll(/export\s+async\s+function\s+(\w+)/g)
    for (const match of asyncFunctionExports) {
      exports.push({ name: match[1], type: 'function' })
    }

    // ES module: export const/let/var name
    const constExports = content.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)
    for (const match of constExports) {
      exports.push({ name: match[1], type: 'const' })
    }

    // ES module: export default
    if (/export\s+default/.test(content)) {
      // Check what's being exported as default
      const defaultClassMatch = content.match(/export\s+default\s+class\s+(\w+)/)
      const defaultFunctionMatch = content.match(/export\s+default\s+function\s+(\w+)/)

      if (defaultClassMatch) {
        exports.push({ name: 'default', type: 'class' })
      } else if (defaultFunctionMatch) {
        exports.push({ name: 'default', type: 'function' })
      } else {
        exports.push({ name: 'default', type: 'default' })
      }
    }

    // ES module: export { name1, name2 }
    const namedExports = content.matchAll(/export\s*\{([^}]+)\}/g)
    for (const match of namedExports) {
      const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0].trim())
      for (const name of names) {
        if (name && !exports.find(e => e.name === name)) {
          exports.push({ name, type: 'any' })
        }
      }
    }

    // CommonJS: module.exports = { name1, name2 }
    const moduleExportsMatch = content.match(/module\.exports\s*=\s*\{([^}]+)\}/)
    if (moduleExportsMatch) {
      const names = moduleExportsMatch[1].split(',').map(n => {
        const parts = n.trim().split(':')
        return parts[0].trim()
      })
      for (const name of names) {
        if (name && !exports.find(e => e.name === name)) {
          // Try to determine type from the file
          const type = this.inferType(content, name)
          exports.push({ name, type })
        }
      }
    }

    // CommonJS: module.exports.name = ...
    const moduleExportsProp = content.matchAll(/module\.exports\.(\w+)\s*=/g)
    for (const match of moduleExportsProp) {
      if (!exports.find(e => e.name === match[1])) {
        const type = this.inferType(content, match[1])
        exports.push({ name: match[1], type })
      }
    }

    // CommonJS: exports.name = ...
    const exportsProp = content.matchAll(/exports\.(\w+)\s*=/g)
    for (const match of exportsProp) {
      if (!exports.find(e => e.name === match[1])) {
        const type = this.inferType(content, match[1])
        exports.push({ name: match[1], type })
      }
    }

    return exports
  }

  /**
   * Infer type of an identifier from file content
   * @param {string} content - File content
   * @param {string} name - Identifier name
   * @returns {string}
   */
  inferType(content, name) {
    // Check for class definition
    if (new RegExp(`class\\s+${name}\\s*[{(]`).test(content)) {
      return 'class'
    }

    // Check for function definition
    if (new RegExp(`function\\s+${name}\\s*\\(`).test(content)) {
      return 'function'
    }

    // Check for arrow function
    if (new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`).test(content) ||
        new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s*)?\\w+\\s*=>`).test(content)) {
      return 'function'
    }

    // Check for const/let/var
    if (new RegExp(`(?:const|let|var)\\s+${name}\\s*=`).test(content)) {
      return 'const'
    }

    return 'any'
  }
}

module.exports = { ExportExistsEvaluator }
