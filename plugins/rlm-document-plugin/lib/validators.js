/**
 * RLM Document Plugin - Input Validators
 *
 * Provides validation utilities for IPC handler inputs.
 * Ensures security (path traversal prevention) and data integrity.
 */

const path = require('path')
const { CHUNKING, FILE_LIMITS, EXPORT } = require('./config')

/**
 * Validate a document path is within the project directory
 * Prevents path traversal attacks
 * @param {string} documentPath - Path to validate
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Validation result
 */
function validateDocumentPath(documentPath, projectRoot) {
  if (!documentPath || typeof documentPath !== 'string') {
    return { isValid: false, error: 'Document path is required and must be a string' }
  }

  // Check for null bytes (path traversal technique)
  if (documentPath.includes('\0')) {
    return { isValid: false, error: 'Invalid characters in document path' }
  }

  // Resolve to absolute path
  const resolvedPath = path.resolve(projectRoot, documentPath)
  const resolvedRoot = path.resolve(projectRoot)

  // Ensure path is within project (with proper boundary check)
  if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
    return { isValid: false, error: 'Document must be within project directory' }
  }

  return { isValid: true, resolvedPath }
}

/**
 * Validate a session ID format
 * @param {string} sessionId - Session ID to validate
 * @returns {Object} Validation result
 */
function validateSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return { isValid: false, error: 'Session ID is required and must be a string' }
  }

  // Session IDs should match expected format: ses_<timestamp><random>
  if (!sessionId.startsWith('ses_') || sessionId.length < 10) {
    return { isValid: false, error: 'Invalid session ID format' }
  }

  // Check for dangerous characters
  if (!/^ses_[a-z0-9]+$/i.test(sessionId)) {
    return { isValid: false, error: 'Session ID contains invalid characters' }
  }

  return { isValid: true }
}

/**
 * Validate chunk configuration
 * @param {Object} config - Chunk configuration
 * @returns {Object} Validation result with normalized values
 */
function validateChunkConfig(config = {}) {
  const { chunkSize, chunkOverlap } = config
  const errors = []

  // Validate chunk size
  let validChunkSize = CHUNKING.DEFAULT_SIZE
  if (chunkSize !== undefined) {
    if (typeof chunkSize !== 'number' || !Number.isInteger(chunkSize)) {
      errors.push('Chunk size must be an integer')
    } else if (chunkSize < CHUNKING.MIN_SIZE) {
      errors.push(`Chunk size must be at least ${CHUNKING.MIN_SIZE}`)
    } else if (chunkSize > CHUNKING.MAX_SIZE) {
      errors.push(`Chunk size must be at most ${CHUNKING.MAX_SIZE}`)
    } else {
      validChunkSize = chunkSize
    }
  }

  // Validate chunk overlap
  let validChunkOverlap = CHUNKING.DEFAULT_OVERLAP
  if (chunkOverlap !== undefined) {
    if (typeof chunkOverlap !== 'number' || !Number.isInteger(chunkOverlap)) {
      errors.push('Chunk overlap must be an integer')
    } else if (chunkOverlap < 0) {
      errors.push('Chunk overlap must be non-negative')
    } else if (chunkOverlap >= validChunkSize) {
      errors.push('Chunk overlap must be less than chunk size')
    } else {
      validChunkOverlap = chunkOverlap
    }
  }

  if (errors.length > 0) {
    return { isValid: false, error: errors.join('; ') }
  }

  return {
    isValid: true,
    config: {
      chunkSize: validChunkSize,
      chunkOverlap: validChunkOverlap
    }
  }
}

/**
 * Validate a grep/search pattern
 * Ensures the pattern is safe to use as a regex
 * @param {string} pattern - Pattern to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.allowRegex - Allow regex patterns (default: true)
 * @param {number} options.maxLength - Maximum pattern length (default: 1000)
 * @returns {Object} Validation result
 */
function validateGrepPattern(pattern, options = {}) {
  const { allowRegex = true, maxLength = 1000 } = options

  if (!pattern || typeof pattern !== 'string') {
    return { isValid: false, error: 'Search pattern is required and must be a string' }
  }

  if (pattern.length === 0) {
    return { isValid: false, error: 'Search pattern cannot be empty' }
  }

  if (pattern.length > maxLength) {
    return { isValid: false, error: `Search pattern exceeds maximum length of ${maxLength}` }
  }

  // Test if pattern is valid regex
  if (allowRegex) {
    try {
      new RegExp(pattern)
    } catch (error) {
      return { isValid: false, error: `Invalid regex pattern: ${error.message}` }
    }
  }

  return { isValid: true, pattern }
}

/**
 * Sanitize a grep pattern by escaping regex metacharacters
 * Use this when you want to search for literal text
 * @param {string} pattern - Pattern to sanitize
 * @returns {string} Escaped pattern safe for regex
 */
function sanitizeGrepPattern(pattern) {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Validate a peek range
 * @param {number} start - Start position
 * @param {number} end - End position
 * @param {number} contentLength - Total content length (optional)
 * @returns {Object} Validation result
 */
function validatePeekRange(start, end, contentLength = null) {
  const errors = []

  // Validate start
  if (start === undefined || start === null) {
    return { isValid: true, start: 0, end } // Default start to 0
  }

  if (typeof start !== 'number' || !Number.isInteger(start)) {
    errors.push('Start position must be an integer')
  } else if (start < 0) {
    errors.push('Start position must be non-negative')
  }

  // Validate end
  if (end !== undefined && end !== null) {
    if (typeof end !== 'number' || !Number.isInteger(end)) {
      errors.push('End position must be an integer')
    } else if (end <= start) {
      errors.push('End position must be greater than start position')
    }
  }

  // Validate against content length if provided
  if (contentLength !== null && errors.length === 0) {
    if (start >= contentLength) {
      errors.push('Start position exceeds content length')
    }
    if (end !== undefined && end > contentLength) {
      // Clamp end to content length instead of error
      end = contentLength
    }
  }

  if (errors.length > 0) {
    return { isValid: false, error: errors.join('; ') }
  }

  return { isValid: true, start, end }
}

/**
 * Validate a chunk index
 * @param {number} index - Chunk index
 * @param {number} totalChunks - Total number of chunks (optional)
 * @returns {Object} Validation result
 */
function validateChunkIndex(index, totalChunks = null) {
  if (index === undefined || index === null) {
    return { isValid: false, error: 'Chunk index is required' }
  }

  if (typeof index !== 'number' || !Number.isInteger(index)) {
    return { isValid: false, error: 'Chunk index must be an integer' }
  }

  if (index < 0) {
    return { isValid: false, error: 'Chunk index must be non-negative' }
  }

  if (totalChunks !== null && index >= totalChunks) {
    return { isValid: false, error: `Chunk index ${index} out of range (0-${totalChunks - 1})` }
  }

  return { isValid: true, index }
}

/**
 * Validate export format
 * @param {string} format - Export format
 * @returns {Object} Validation result
 */
function validateExportFormat(format) {
  if (!format || typeof format !== 'string') {
    return { isValid: false, error: 'Export format is required' }
  }

  const normalizedFormat = format.toLowerCase().trim()

  if (!EXPORT.FORMATS.includes(normalizedFormat)) {
    return {
      isValid: false,
      error: `Invalid export format. Supported formats: ${EXPORT.FORMATS.join(', ')}`
    }
  }

  return { isValid: true, format: normalizedFormat }
}

/**
 * Validate file size is within limits
 * @param {number} fileSize - File size in bytes
 * @returns {Object} Validation result with warnings
 */
function validateFileSize(fileSize) {
  if (typeof fileSize !== 'number' || fileSize < 0) {
    return { isValid: false, error: 'Invalid file size' }
  }

  const warnings = []

  if (fileSize > FILE_LIMITS.MAX_SIZE) {
    return {
      isValid: false,
      error: `File size (${formatBytes(fileSize)}) exceeds maximum of ${formatBytes(FILE_LIMITS.MAX_SIZE)}`
    }
  }

  if (fileSize > FILE_LIMITS.WARN_SIZE) {
    warnings.push(`Large file (${formatBytes(fileSize)}) may cause performance issues`)
  }

  return { isValid: true, warnings }
}

/**
 * Validate query text
 * @param {string} query - Query text
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateQuery(query, options = {}) {
  const { maxLength = 10000 } = options

  if (!query || typeof query !== 'string') {
    return { isValid: false, error: 'Query is required and must be a string' }
  }

  const trimmedQuery = query.trim()

  if (trimmedQuery.length === 0) {
    return { isValid: false, error: 'Query cannot be empty' }
  }

  if (trimmedQuery.length > maxLength) {
    return { isValid: false, error: `Query exceeds maximum length of ${maxLength}` }
  }

  return { isValid: true, query: trimmedQuery }
}

/**
 * Validate buffer content
 * @param {string} content - Buffer content
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateBufferContent(content, options = {}) {
  const { maxLength = 1000000 } = options // 1MB default max

  if (content === undefined || content === null) {
    return { isValid: false, error: 'Buffer content is required' }
  }

  if (typeof content !== 'string') {
    return { isValid: false, error: 'Buffer content must be a string' }
  }

  if (content.length > maxLength) {
    return { isValid: false, error: `Buffer content exceeds maximum length of ${maxLength}` }
  }

  return { isValid: true, content }
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

module.exports = {
  validateDocumentPath,
  validateSessionId,
  validateChunkConfig,
  validateGrepPattern,
  sanitizeGrepPattern,
  validatePeekRange,
  validateChunkIndex,
  validateExportFormat,
  validateFileSize,
  validateQuery,
  validateBufferContent,
  formatBytes
}
