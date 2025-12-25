/**
 * Plugin Manifest Validator
 *
 * Validates puffin-plugin.json manifest files against the JSON schema.
 * Provides developer-friendly error messages with field paths.
 */

const Ajv = require('ajv')
const addFormats = require('ajv-formats')
const fs = require('fs').promises
const path = require('path')

const manifestSchema = require('./manifest-schema.json')

/**
 * Validation error with developer-friendly message
 */
class ManifestValidationError extends Error {
  /**
   * @param {string} message - Error message
   * @param {Array} errors - Array of validation errors
   */
  constructor(message, errors = []) {
    super(message)
    this.name = 'ManifestValidationError'
    this.errors = errors
  }
}

/**
 * ManifestValidator - Validates plugin manifest files
 */
class ManifestValidator {
  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false
    })

    // Add format validators (email, uri, etc.)
    addFormats(this.ajv)

    // Compile the schema
    this.validateFn = this.ajv.compile(manifestSchema)
  }

  /**
   * Format a single validation error into a developer-friendly message
   * @param {Object} error - AJV error object
   * @returns {Object} Formatted error
   * @private
   */
  formatError(error) {
    const fieldPath = error.instancePath
      ? error.instancePath.replace(/^\//, '').replace(/\//g, '.')
      : 'manifest'

    let message = ''
    let suggestion = ''

    switch (error.keyword) {
      case 'required':
        message = `Missing required field: "${error.params.missingProperty}"`
        suggestion = `Add the "${error.params.missingProperty}" field to your manifest`
        break

      case 'type':
        message = `Invalid type for "${fieldPath}": expected ${error.params.type}, got ${typeof error.data}`
        suggestion = `Change "${fieldPath}" to be a ${error.params.type}`
        break

      case 'pattern':
        message = `Invalid format for "${fieldPath}": "${error.data}" does not match required pattern`
        suggestion = this.getPatternSuggestion(fieldPath, error.params.pattern)
        break

      case 'minLength':
        message = `"${fieldPath}" is too short: minimum length is ${error.params.limit}`
        suggestion = `Provide a value with at least ${error.params.limit} character(s)`
        break

      case 'maxLength':
        message = `"${fieldPath}" is too long: maximum length is ${error.params.limit}`
        suggestion = `Shorten the value to at most ${error.params.limit} characters`
        break

      case 'enum':
        message = `Invalid value for "${fieldPath}": must be one of [${error.params.allowedValues.join(', ')}]`
        suggestion = `Use one of the allowed values: ${error.params.allowedValues.join(', ')}`
        break

      case 'format':
        message = `Invalid ${error.params.format} format for "${fieldPath}"`
        suggestion = `Provide a valid ${error.params.format}`
        break

      case 'additionalProperties':
        message = `Unknown field "${error.params.additionalProperty}" in ${fieldPath || 'manifest'}`
        suggestion = `Remove the "${error.params.additionalProperty}" field or check for typos`
        break

      case 'uniqueItems':
        message = `Duplicate items found in "${fieldPath}"`
        suggestion = 'Remove duplicate entries from the array'
        break

      case 'maxItems':
        message = `Too many items in "${fieldPath}": maximum is ${error.params.limit}`
        suggestion = `Reduce the number of items to at most ${error.params.limit}`
        break

      case 'oneOf':
        message = `Invalid value for "${fieldPath}": does not match any allowed format`
        suggestion = 'Check the documentation for valid formats'
        break

      default:
        message = error.message || `Validation failed for "${fieldPath}"`
        suggestion = 'Check the manifest schema documentation'
    }

    return {
      field: fieldPath,
      message,
      suggestion,
      keyword: error.keyword,
      value: error.data
    }
  }

  /**
   * Get a helpful suggestion for pattern validation errors
   * @param {string} fieldPath - Path to the field
   * @param {string} pattern - The regex pattern
   * @returns {string} Suggestion message
   * @private
   */
  getPatternSuggestion(fieldPath, pattern) {
    const suggestions = {
      name: 'Use lowercase letters, numbers, and hyphens. Must start with a letter (e.g., "my-plugin")',
      version: 'Use semantic versioning format: MAJOR.MINOR.PATCH (e.g., "1.0.0", "2.1.0-beta.1")',
      'engines.puffin': 'Use a version range (e.g., ">=2.0.0", "^1.5.0", "~1.0.0")',
      'extensionPoints.actions': 'Use camelCase starting with a letter (e.g., "trackPrompt")',
      'extensionPoints.acceptors': 'Use camelCase starting with a letter (e.g., "analyticsAcceptor")',
      'extensionPoints.reactors': 'Use camelCase starting with a letter (e.g., "onDataChange")',
      'extensionPoints.components': 'Use kebab-case starting with a letter (e.g., "analytics-dashboard")',
      'extensionPoints.ipcHandlers': 'Use namespace:action format (e.g., "analytics:getData")',
      keywords: 'Use alphanumeric characters and hyphens only',
      // Renderer manifest suggestions
      'renderer.entry': 'Use a relative path to a JavaScript/TypeScript file (e.g., "renderer/index.js")',
      'renderer.components.name': 'Use PascalCase starting with uppercase (e.g., "AnalyticsDashboard")',
      'renderer.components.export': 'Use a valid JavaScript identifier (e.g., "default" or "MyComponent")',
      'renderer.styles': 'Use a relative path to a CSS/SCSS file (e.g., "renderer/styles.css")'
    }

    // Check for array item paths like extensionPoints.actions.0 or renderer.components.0.name
    const basePath = fieldPath.replace(/\.\d+/g, '')

    return suggestions[fieldPath] || suggestions[basePath] || `Value must match pattern: ${pattern}`
  }

  /**
   * Validate a manifest object
   * @param {Object} manifest - The manifest object to validate
   * @returns {Object} Validation result { valid: boolean, errors: Array, manifest?: Object }
   */
  validate(manifest) {
    if (!manifest || typeof manifest !== 'object') {
      return {
        valid: false,
        errors: [{
          field: 'manifest',
          message: 'Manifest must be a valid object',
          suggestion: 'Ensure the manifest file contains a valid JSON object',
          keyword: 'type',
          value: manifest
        }]
      }
    }

    const valid = this.validateFn(manifest)

    if (valid) {
      return {
        valid: true,
        errors: [],
        manifest
      }
    }

    const errors = this.validateFn.errors.map(error => this.formatError(error))

    return {
      valid: false,
      errors
    }
  }

  /**
   * Validate a manifest file from disk
   * @param {string} filepath - Path to the puffin-plugin.json file
   * @returns {Promise<Object>} Validation result { valid: boolean, errors: Array, manifest?: Object }
   */
  async validateFile(filepath) {
    try {
      const content = await fs.readFile(filepath, 'utf-8')
      let manifest

      try {
        manifest = JSON.parse(content)
      } catch (parseError) {
        return {
          valid: false,
          errors: [{
            field: 'manifest',
            message: `Invalid JSON: ${parseError.message}`,
            suggestion: 'Check for syntax errors like missing commas, quotes, or brackets',
            keyword: 'parse',
            value: null
          }]
        }
      }

      return this.validate(manifest)
    } catch (readError) {
      if (readError.code === 'ENOENT') {
        return {
          valid: false,
          errors: [{
            field: 'manifest',
            message: `Manifest file not found: ${filepath}`,
            suggestion: 'Ensure puffin-plugin.json exists in the plugin directory',
            keyword: 'file',
            value: null
          }]
        }
      }

      return {
        valid: false,
        errors: [{
          field: 'manifest',
          message: `Failed to read manifest: ${readError.message}`,
          suggestion: 'Check file permissions and path',
          keyword: 'file',
          value: null
        }]
      }
    }
  }

  /**
   * Validate a manifest from a plugin directory
   * @param {string} pluginDir - Path to the plugin directory
   * @returns {Promise<Object>} Validation result
   */
  async validatePluginDirectory(pluginDir) {
    const manifestPath = path.join(pluginDir, 'puffin-plugin.json')
    const result = await this.validateFile(manifestPath)

    if (result.valid) {
      const warnings = []

      // Additional validation: check that main entry point exists
      const mainPath = path.join(pluginDir, result.manifest.main)
      try {
        await fs.access(mainPath)
      } catch {
        result.valid = false
        result.errors = [{
          field: 'main',
          message: `Entry point not found: ${result.manifest.main}`,
          suggestion: `Create the file "${result.manifest.main}" or update the "main" field`,
          keyword: 'file',
          value: result.manifest.main
        }]
        delete result.manifest
        return result
      }

      // Validate renderer entry point if specified
      if (result.manifest.renderer?.entry) {
        const rendererEntryPath = path.join(pluginDir, result.manifest.renderer.entry)
        try {
          await fs.access(rendererEntryPath)
        } catch {
          warnings.push({
            field: 'renderer.entry',
            message: `Renderer entry point not found: ${result.manifest.renderer.entry}`,
            suggestion: `Create the file "${result.manifest.renderer.entry}" or update the "renderer.entry" field`,
            keyword: 'file',
            value: result.manifest.renderer.entry
          })
        }
      }

      // Validate renderer style files if specified
      if (result.manifest.renderer?.styles?.length > 0) {
        for (const stylePath of result.manifest.renderer.styles) {
          const fullStylePath = path.join(pluginDir, stylePath)
          try {
            await fs.access(fullStylePath)
          } catch {
            warnings.push({
              field: 'renderer.styles',
              message: `Style file not found: ${stylePath}`,
              suggestion: `Create the file "${stylePath}" or remove it from the "renderer.styles" array`,
              keyword: 'file',
              value: stylePath
            })
          }
        }
      }

      // Add warnings to result (but don't fail validation)
      result.warnings = warnings
    }

    return result
  }

  /**
   * Format validation errors for display
   * @param {Array} errors - Array of validation errors
   * @param {Object} options - Formatting options
   * @returns {string} Formatted error message
   */
  formatErrorsForDisplay(errors, options = {}) {
    const { color = false, verbose = true } = options

    if (!errors || errors.length === 0) {
      return 'No errors'
    }

    const lines = errors.map((error, index) => {
      let line = `${index + 1}. ${error.message}`

      if (verbose && error.suggestion) {
        line += `\n   Suggestion: ${error.suggestion}`
      }

      return line
    })

    return lines.join('\n\n')
  }

  /**
   * Get the JSON schema for external use
   * @returns {Object} The manifest JSON schema
   */
  getSchema() {
    return manifestSchema
  }
}

module.exports = {
  ManifestValidator,
  ManifestValidationError
}
