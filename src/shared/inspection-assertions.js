/**
 * Inspection Assertions Type Definitions and Validators
 *
 * Provides type definitions, constants, and validation functions for the
 * inspection assertions feature. Based on the metamodel defined in
 * docs/INSPECTION_ASSERTIONS_METAMODEL.md
 *
 * @module shared/inspection-assertions
 */

/**
 * Valid assertion types
 * @readonly
 * @enum {string}
 */
export const AssertionType = {
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
 * List of all valid assertion types
 * @type {string[]}
 */
export const ASSERTION_TYPES = Object.values(AssertionType)

/**
 * Assertion result status values
 * @readonly
 * @enum {string}
 */
export const AssertionStatus = {
  PASSED: 'passed',
  FAILED: 'failed',
  ERROR: 'error'
}

/**
 * JSON_PROPERTY operator values
 * @readonly
 * @enum {string}
 */
export const JsonOperator = {
  EXISTS: 'exists',
  EQUALS: 'equals',
  CONTAINS: 'contains',
  MATCHES: 'matches'
}

/**
 * FILE_CONTAINS match types
 * @readonly
 * @enum {string}
 */
export const MatchType = {
  LITERAL: 'literal',
  REGEX: 'regex'
}

/**
 * PATTERN_MATCH operators
 * @readonly
 * @enum {string}
 */
export const PatternOperator = {
  PRESENT: 'present',
  ABSENT: 'absent'
}

/**
 * EXPORT_EXISTS export types
 * @readonly
 * @enum {string}
 */
export const ExportType = {
  CLASS: 'class',
  FUNCTION: 'function',
  CONST: 'const',
  DEFAULT: 'default',
  ANY: 'any'
}

/**
 * FILE_EXISTS target types
 * @readonly
 * @enum {string}
 */
export const FileType = {
  FILE: 'file',
  DIRECTORY: 'directory'
}

/**
 * Validate an inspection assertion object
 *
 * @param {Object} assertion - The assertion to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAssertion(assertion) {
  const errors = []

  if (!assertion || typeof assertion !== 'object') {
    return { valid: false, errors: ['Assertion must be an object'] }
  }

  // Required fields
  if (!assertion.id || typeof assertion.id !== 'string') {
    errors.push('Assertion id is required and must be a string')
  }

  if (!assertion.type || !ASSERTION_TYPES.includes(assertion.type)) {
    errors.push(`Assertion type must be one of: ${ASSERTION_TYPES.join(', ')}`)
  }

  if (!assertion.target || typeof assertion.target !== 'string') {
    errors.push('Assertion target is required and must be a string')
  }

  if (!assertion.message || typeof assertion.message !== 'string') {
    errors.push('Assertion message is required and must be a string')
  }

  // Criterion is optional but must be a string if present
  if (assertion.criterion !== undefined && typeof assertion.criterion !== 'string') {
    errors.push('Assertion criterion must be a string')
  }

  // Assertion parameters must be an object if present
  if (assertion.assertion !== undefined && typeof assertion.assertion !== 'object') {
    errors.push('Assertion parameters must be an object')
  }

  // Type-specific validation
  if (errors.length === 0 && assertion.type) {
    const typeErrors = validateAssertionParams(assertion.type, assertion.assertion)
    errors.push(...typeErrors)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate type-specific assertion parameters
 *
 * @param {string} type - The assertion type
 * @param {Object} params - The assertion parameters
 * @returns {string[]} Array of error messages
 */
export function validateAssertionParams(type, params) {
  const errors = []

  switch (type) {
    case AssertionType.FILE_EXISTS:
      if (params?.type && !Object.values(FileType).includes(params.type)) {
        errors.push(`FILE_EXISTS type must be 'file' or 'directory'`)
      }
      break

    case AssertionType.FILE_CONTAINS:
      if (!params?.match || !Object.values(MatchType).includes(params.match)) {
        errors.push(`FILE_CONTAINS requires match type: 'literal' or 'regex'`)
      }
      if (!params?.content || typeof params.content !== 'string') {
        errors.push('FILE_CONTAINS requires content string')
      }
      break

    case AssertionType.JSON_PROPERTY:
      if (!params?.path || typeof params.path !== 'string') {
        errors.push('JSON_PROPERTY requires path string')
      }
      if (!params?.operator || !Object.values(JsonOperator).includes(params.operator)) {
        errors.push(`JSON_PROPERTY requires operator: ${Object.values(JsonOperator).join(', ')}`)
      }
      break

    case AssertionType.EXPORT_EXISTS:
      if (!params?.exports || !Array.isArray(params.exports)) {
        errors.push('EXPORT_EXISTS requires exports array')
      } else {
        for (const exp of params.exports) {
          if (!exp.name || typeof exp.name !== 'string') {
            errors.push('Each export must have a name string')
          }
          if (exp.type && !Object.values(ExportType).includes(exp.type)) {
            errors.push(`Export type must be: ${Object.values(ExportType).join(', ')}`)
          }
        }
      }
      break

    case AssertionType.CLASS_STRUCTURE:
      if (!params?.class_name || typeof params.class_name !== 'string') {
        errors.push('CLASS_STRUCTURE requires class_name string')
      }
      if (params?.methods && !Array.isArray(params.methods)) {
        errors.push('CLASS_STRUCTURE methods must be an array')
      }
      if (params?.properties && !Array.isArray(params.properties)) {
        errors.push('CLASS_STRUCTURE properties must be an array')
      }
      break

    case AssertionType.FUNCTION_SIGNATURE:
      if (!params?.function_name || typeof params.function_name !== 'string') {
        errors.push('FUNCTION_SIGNATURE requires function_name string')
      }
      if (params?.parameters && !Array.isArray(params.parameters)) {
        errors.push('FUNCTION_SIGNATURE parameters must be an array')
      }
      break

    case AssertionType.IMPORT_EXISTS:
      if (!params?.imports || !Array.isArray(params.imports)) {
        errors.push('IMPORT_EXISTS requires imports array')
      } else {
        for (const imp of params.imports) {
          if (!imp.module || typeof imp.module !== 'string') {
            errors.push('Each import must have a module string')
          }
        }
      }
      break

    case AssertionType.IPC_HANDLER_REGISTERED:
      if (!params?.handlers || !Array.isArray(params.handlers)) {
        errors.push('IPC_HANDLER_REGISTERED requires handlers array')
      }
      break

    case AssertionType.CSS_SELECTOR_EXISTS:
      if (!params?.selectors || !Array.isArray(params.selectors)) {
        errors.push('CSS_SELECTOR_EXISTS requires selectors array')
      }
      break

    case AssertionType.PATTERN_MATCH:
      if (!params?.pattern || typeof params.pattern !== 'string') {
        errors.push('PATTERN_MATCH requires pattern string')
      }
      if (!params?.operator || !Object.values(PatternOperator).includes(params.operator)) {
        errors.push(`PATTERN_MATCH requires operator: 'present' or 'absent'`)
      }
      break
  }

  return errors
}

/**
 * Validate an array of inspection assertions
 *
 * @param {Object[]} assertions - Array of assertions to validate
 * @returns {{ valid: boolean, errors: string[], details: Object[] }}
 */
export function validateAssertions(assertions) {
  if (!Array.isArray(assertions)) {
    return {
      valid: false,
      errors: ['Assertions must be an array'],
      details: []
    }
  }

  const allErrors = []
  const details = []

  // Check for duplicate IDs
  const ids = new Set()
  for (const assertion of assertions) {
    if (assertion.id) {
      if (ids.has(assertion.id)) {
        allErrors.push(`Duplicate assertion ID: ${assertion.id}`)
      }
      ids.add(assertion.id)
    }
  }

  // Validate each assertion
  for (let i = 0; i < assertions.length; i++) {
    const result = validateAssertion(assertions[i])
    details.push({
      index: i,
      id: assertions[i]?.id,
      valid: result.valid,
      errors: result.errors
    })
    if (!result.valid) {
      allErrors.push(`Assertion ${i} (${assertions[i]?.id || 'no id'}): ${result.errors.join('; ')}`)
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    details
  }
}

/**
 * Validate assertion results object
 *
 * @param {Object} results - The assertion results to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAssertionResults(results) {
  const errors = []

  if (!results || typeof results !== 'object') {
    return { valid: false, errors: ['Assertion results must be an object'] }
  }

  // Required fields
  if (!results.evaluatedAt || typeof results.evaluatedAt !== 'string') {
    errors.push('evaluatedAt is required and must be an ISO timestamp string')
  }

  if (!results.summary || typeof results.summary !== 'object') {
    errors.push('summary is required and must be an object')
  } else {
    const { total, passed, failed, undecided } = results.summary
    if (typeof total !== 'number' || total < 0) {
      errors.push('summary.total must be a non-negative number')
    }
    if (typeof passed !== 'number' || passed < 0) {
      errors.push('summary.passed must be a non-negative number')
    }
    if (typeof failed !== 'number' || failed < 0) {
      errors.push('summary.failed must be a non-negative number')
    }
    if (undecided !== undefined && (typeof undecided !== 'number' || undecided < 0)) {
      errors.push('summary.undecided must be a non-negative number if present')
    }
  }

  if (!results.results || !Array.isArray(results.results)) {
    errors.push('results array is required')
  } else {
    for (let i = 0; i < results.results.length; i++) {
      const result = results.results[i]
      if (!result.assertionId || typeof result.assertionId !== 'string') {
        errors.push(`results[${i}].assertionId is required`)
      }
      if (!result.status || !Object.values(AssertionStatus).includes(result.status)) {
        errors.push(`results[${i}].status must be: ${Object.values(AssertionStatus).join(', ')}`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Create a new assertion with default values
 *
 * @param {Object} partial - Partial assertion data
 * @returns {Object} Complete assertion object with defaults
 */
export function createAssertion(partial = {}) {
  return {
    id: partial.id || `IA${Date.now()}`,
    criterion: partial.criterion || 'general',
    type: partial.type || AssertionType.FILE_EXISTS,
    target: partial.target || '',
    assertion: partial.assertion || {},
    message: partial.message || ''
  }
}

/**
 * Create an assertion result object
 *
 * @param {string} assertionId - The assertion ID
 * @param {string} status - The result status
 * @param {string} message - The result message
 * @param {Object|null} details - Optional failure details
 * @returns {Object} Assertion result object
 */
export function createAssertionResult(assertionId, status, message, details = null) {
  return {
    assertionId,
    status,
    message,
    details
  }
}

/**
 * Create an assertion results summary
 *
 * @param {Object[]} results - Array of individual assertion results
 * @returns {Object} Complete assertion results object with summary
 */
export function createAssertionResults(results) {
  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === AssertionStatus.PASSED).length,
    failed: results.filter(r => r.status === AssertionStatus.FAILED).length,
    undecided: results.filter(r => r.status === AssertionStatus.ERROR).length
  }

  return {
    evaluatedAt: new Date().toISOString(),
    summary,
    results
  }
}

/**
 * Get human-readable description for an assertion type
 *
 * @param {string} type - The assertion type
 * @returns {string} Human-readable description
 */
export function getAssertionTypeDescription(type) {
  const descriptions = {
    [AssertionType.FILE_EXISTS]: 'Verifies that a file or directory exists',
    [AssertionType.FILE_CONTAINS]: 'Verifies that a file contains specific content',
    [AssertionType.JSON_PROPERTY]: 'Verifies that a JSON file has expected properties',
    [AssertionType.EXPORT_EXISTS]: 'Verifies that a module exports specific identifiers',
    [AssertionType.CLASS_STRUCTURE]: 'Verifies that a class has expected methods and properties',
    [AssertionType.FUNCTION_SIGNATURE]: 'Verifies that a function has the expected signature',
    [AssertionType.IMPORT_EXISTS]: 'Verifies that a file imports specific modules',
    [AssertionType.IPC_HANDLER_REGISTERED]: 'Verifies that IPC handlers are registered',
    [AssertionType.CSS_SELECTOR_EXISTS]: 'Verifies that CSS selectors are defined',
    [AssertionType.PATTERN_MATCH]: 'Verifies presence or absence of patterns in files'
  }
  return descriptions[type] || 'Unknown assertion type'
}

/**
 * Format assertion for compact display
 *
 * @param {Object} assertion - The assertion object
 * @returns {string} Formatted string for display
 */
export function formatAssertionCompact(assertion) {
  return `[${assertion.type}] ${assertion.message} (${assertion.target})`
}
