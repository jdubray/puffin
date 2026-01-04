/**
 * CLASS_STRUCTURE Assertion Evaluator
 *
 * Verifies that a class has expected methods and properties.
 *
 * @module evaluators/class-structure
 */

const { BaseEvaluator } = require('./base-evaluator')

/**
 * Evaluator for CLASS_STRUCTURE assertions
 */
class ClassStructureEvaluator extends BaseEvaluator {
  /**
   * Evaluate a CLASS_STRUCTURE assertion
   *
   * @param {Object} assertion - The assertion to evaluate
   * @param {string} assertion.target - Path to file containing the class
   * @param {Object} assertion.assertion - Assertion parameters
   * @param {string} assertion.assertion.class_name - Name of the class
   * @param {string[]} [assertion.assertion.methods] - Expected method names
   * @param {string[]} [assertion.assertion.properties] - Expected property names
   * @param {string} [assertion.assertion.extends] - Expected parent class
   * @returns {Promise<{ passed: boolean, message: string, details?: Object }>}
   */
  async evaluate(assertion) {
    const targetPath = this.resolvePath(assertion.target)
    const { class_name, methods, properties, extends: extendsClass } = assertion.assertion || {}

    if (!class_name) {
      return this.fail(
        'CLASS_STRUCTURE requires class_name',
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

    // Parse class from file
    const classInfo = this.parseClass(fileContent, class_name)

    if (!classInfo) {
      return this.fail(
        `Class not found: ${class_name}`,
        { path: assertion.target, className: class_name }
      )
    }

    const issues = []

    // Check extends
    if (extendsClass && classInfo.extends !== extendsClass) {
      issues.push({
        type: 'extends',
        expected: extendsClass,
        actual: classInfo.extends || 'none'
      })
    }

    // Check methods
    if (methods && Array.isArray(methods)) {
      const missingMethods = methods.filter(m => !classInfo.methods.includes(m))
      if (missingMethods.length > 0) {
        issues.push({
          type: 'methods',
          missing: missingMethods,
          found: classInfo.methods
        })
      }
    }

    // Check properties
    if (properties && Array.isArray(properties)) {
      const missingProperties = properties.filter(p => !classInfo.properties.includes(p))
      if (missingProperties.length > 0) {
        issues.push({
          type: 'properties',
          missing: missingProperties,
          found: classInfo.properties
        })
      }
    }

    if (issues.length > 0) {
      return this.fail(
        `Class structure mismatch: ${class_name}`,
        {
          path: assertion.target,
          className: class_name,
          issues,
          classInfo
        }
      )
    }

    return this.pass(
      `Class structure verified: ${class_name}`,
      {
        path: assertion.target,
        className: class_name,
        methods: classInfo.methods,
        properties: classInfo.properties,
        extends: classInfo.extends
      }
    )
  }

  /**
   * Parse class information from file content
   *
   * @param {string} content - File content
   * @param {string} className - Name of class to find
   * @returns {{ name: string, extends?: string, methods: string[], properties: string[] } | null}
   */
  parseClass(content, className) {
    // Find the class declaration
    const classPattern = new RegExp(
      `class\\s+${className}(?:\\s+extends\\s+(\\w+))?\\s*\\{`,
      'm'
    )
    const classMatch = content.match(classPattern)

    if (!classMatch) {
      return null
    }

    const extendsClass = classMatch[1] || null

    // Find the class body - we need to match braces
    const startIndex = content.indexOf(classMatch[0])
    const classBody = this.extractClassBody(content, startIndex + classMatch[0].length - 1)

    if (!classBody) {
      return null
    }

    // Parse methods and properties
    const methods = this.parseClassMethods(classBody)
    const properties = this.parseClassProperties(classBody, className)

    return {
      name: className,
      extends: extendsClass,
      methods,
      properties
    }
  }

  /**
   * Extract class body by matching braces
   *
   * @param {string} content - File content
   * @param {number} startBrace - Index of opening brace
   * @returns {string | null}
   */
  extractClassBody(content, startBrace) {
    let braceCount = 1
    let i = startBrace + 1

    while (i < content.length && braceCount > 0) {
      const char = content[i]

      // Skip strings
      if (char === '"' || char === "'" || char === '`') {
        i = this.skipString(content, i)
        continue
      }

      // Skip comments
      if (char === '/' && content[i + 1] === '/') {
        i = content.indexOf('\n', i)
        if (i === -1) break
        continue
      }
      if (char === '/' && content[i + 1] === '*') {
        i = content.indexOf('*/', i) + 2
        if (i === 1) break
        continue
      }

      if (char === '{') braceCount++
      if (char === '}') braceCount--
      i++
    }

    if (braceCount !== 0) {
      return null
    }

    return content.substring(startBrace + 1, i - 1)
  }

  /**
   * Skip string literal
   *
   * @param {string} content - Content
   * @param {number} start - Start index (quote char)
   * @returns {number} End index
   */
  skipString(content, start) {
    const quote = content[start]
    let i = start + 1

    while (i < content.length) {
      if (content[i] === '\\') {
        i += 2
        continue
      }
      if (content[i] === quote) {
        // For template literals, also check for ${}
        if (quote === '`' && content[i + 1] !== undefined) {
          i++
          continue
        }
        return i + 1
      }
      i++
    }

    return i
  }

  /**
   * Parse method names from class body
   *
   * @param {string} classBody - Class body content
   * @returns {string[]}
   */
  parseClassMethods(classBody) {
    const methods = []

    // Standard methods: methodName(
    const methodPattern = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g
    let match

    while ((match = methodPattern.exec(classBody)) !== null) {
      const name = match[1]
      // Skip constructor and getters/setters detected as methods
      if (name !== 'constructor' && !methods.includes(name)) {
        methods.push(name)
      }
    }

    // Getter/setter methods: get/set methodName()
    const getSetPattern = /(?:get|set)\s+(\w+)\s*\(/g
    while ((match = getSetPattern.exec(classBody)) !== null) {
      const name = match[1]
      if (!methods.includes(name)) {
        methods.push(name)
      }
    }

    // Arrow function class fields: methodName = () =>
    const arrowPattern = /(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g
    while ((match = arrowPattern.exec(classBody)) !== null) {
      const name = match[1]
      if (!methods.includes(name)) {
        methods.push(name)
      }
    }

    return methods
  }

  /**
   * Parse property names from class body
   *
   * @param {string} classBody - Class body content
   * @param {string} className - Class name (for constructor detection)
   * @returns {string[]}
   */
  parseClassProperties(classBody, className) {
    const properties = []

    // Class field declarations: propertyName = value or propertyName;
    const fieldPattern = /^\s*(\w+)\s*(?:=|;)/gm
    let match

    while ((match = fieldPattern.exec(classBody)) !== null) {
      const name = match[1]
      // Skip if it looks like a method (followed by parentheses)
      const afterMatch = classBody.substring(match.index + match[0].length - 1).trim()
      if (!afterMatch.startsWith('(') && !properties.includes(name)) {
        properties.push(name)
      }
    }

    // Constructor this.property assignments
    const constructorMatch = classBody.match(/constructor\s*\([^)]*\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s)
    if (constructorMatch) {
      const constructorBody = constructorMatch[1]
      const thisPattern = /this\.(\w+)\s*=/g

      while ((match = thisPattern.exec(constructorBody)) !== null) {
        const name = match[1]
        if (!properties.includes(name)) {
          properties.push(name)
        }
      }
    }

    return properties
  }
}

module.exports = { ClassStructureEvaluator }
