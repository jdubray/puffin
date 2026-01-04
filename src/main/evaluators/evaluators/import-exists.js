/**
 * IMPORT_EXISTS Assertion Evaluator
 *
 * Verifies that a file imports specific modules.
 *
 * @module evaluators/import-exists
 */

const { BaseEvaluator } = require('./base-evaluator')

/**
 * Evaluator for IMPORT_EXISTS assertions
 */
class ImportExistsEvaluator extends BaseEvaluator {
  /**
   * Evaluate an IMPORT_EXISTS assertion
   *
   * @param {Object} assertion - The assertion to evaluate
   * @param {string} assertion.target - Path to file
   * @param {Object} assertion.assertion - Assertion parameters
   * @param {Array<{module: string, names?: string[]}>} assertion.assertion.imports - Expected imports
   * @returns {Promise<{ passed: boolean, message: string, details?: Object }>}
   */
  async evaluate(assertion) {
    const targetPath = this.resolvePath(assertion.target)
    const { imports: expectedImports } = assertion.assertion || {}

    if (!expectedImports || !Array.isArray(expectedImports)) {
      return this.fail(
        'IMPORT_EXISTS requires imports array',
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

    // Parse imports from file
    const foundImports = this.parseImports(fileContent)
    const missing = []

    for (const expected of expectedImports) {
      const found = foundImports.find(imp => imp.module === expected.module)

      if (!found) {
        missing.push({
          module: expected.module,
          reason: 'module not imported'
        })
      } else if (expected.names && Array.isArray(expected.names)) {
        const missingNames = expected.names.filter(name => !found.names.includes(name))
        if (missingNames.length > 0) {
          missing.push({
            module: expected.module,
            reason: 'missing named imports',
            names: missingNames,
            foundNames: found.names
          })
        }
      }
    }

    if (missing.length > 0) {
      return this.fail(
        `Missing imports in: ${assertion.target}`,
        {
          path: assertion.target,
          missing,
          foundImports: foundImports.map(i => ({
            module: i.module,
            names: i.names
          }))
        }
      )
    }

    return this.pass(
      `All expected imports found in: ${assertion.target}`,
      {
        path: assertion.target,
        imports: expectedImports.map(i => i.module)
      }
    )
  }

  /**
   * Parse imports from file content
   * Handles ES modules and CommonJS
   *
   * @param {string} content - File content
   * @returns {Array<{module: string, names: string[], type: string}>}
   */
  parseImports(content) {
    const imports = []

    // ES module: import { a, b } from 'module'
    const namedImportPattern = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g
    let match

    while ((match = namedImportPattern.exec(content)) !== null) {
      const names = match[1].split(',').map(n => {
        const parts = n.trim().split(/\s+as\s+/)
        return parts[parts.length - 1].trim() // Use the alias if present
      }).filter(n => n)

      imports.push({
        module: match[2],
        names,
        type: 'named'
      })
    }

    // ES module: import name from 'module'
    const defaultImportPattern = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g
    while ((match = defaultImportPattern.exec(content)) !== null) {
      const existing = imports.find(i => i.module === match[2])
      if (existing) {
        existing.names.push(match[1])
      } else {
        imports.push({
          module: match[2],
          names: [match[1]],
          type: 'default'
        })
      }
    }

    // ES module: import * as name from 'module'
    const namespaceImportPattern = /import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g
    while ((match = namespaceImportPattern.exec(content)) !== null) {
      imports.push({
        module: match[2],
        names: [match[1]],
        type: 'namespace'
      })
    }

    // ES module: import 'module' (side-effect)
    const sideEffectPattern = /import\s+['"]([^'"]+)['"]/g
    while ((match = sideEffectPattern.exec(content)) !== null) {
      // Only add if not already added by other patterns
      if (!imports.find(i => i.module === match[1])) {
        imports.push({
          module: match[1],
          names: [],
          type: 'side-effect'
        })
      }
    }

    // CommonJS: const { a, b } = require('module')
    const cjsDestructurePattern = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    while ((match = cjsDestructurePattern.exec(content)) !== null) {
      const names = match[1].split(',').map(n => {
        const parts = n.trim().split(':')
        return parts[parts.length - 1].trim() // Use the local name if renamed
      }).filter(n => n)

      imports.push({
        module: match[2],
        names,
        type: 'commonjs-destructure'
      })
    }

    // CommonJS: const name = require('module')
    const cjsPattern = /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    while ((match = cjsPattern.exec(content)) !== null) {
      const existing = imports.find(i => i.module === match[2])
      if (!existing) {
        imports.push({
          module: match[2],
          names: [match[1]],
          type: 'commonjs'
        })
      }
    }

    // CommonJS: require('module') without assignment
    const cjsStandalonePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    while ((match = cjsStandalonePattern.exec(content)) !== null) {
      if (!imports.find(i => i.module === match[1])) {
        imports.push({
          module: match[1],
          names: [],
          type: 'commonjs-require'
        })
      }
    }

    return imports
  }
}

module.exports = { ImportExistsEvaluator }
