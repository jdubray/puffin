/**
 * RLM Document Plugin - Schema Definitions and Validation
 *
 * Defines the data schemas for sessions, queries, results, and evidence.
 * Provides validation functions to ensure data integrity.
 */

const { SESSION, CHUNKING, QUERY } = require('./config')

/**
 * Session states
 */
const SessionState = {
  ACTIVE: 'active',
  CLOSED: 'closed'
}

/**
 * Query strategies
 */
const QueryStrategy = {
  SINGLE: 'single',
  RECURSIVE: 'recursive'
}

/**
 * Confidence levels for evidence
 */
const ConfidenceLevel = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
}

/**
 * Create a new session metadata object
 * @param {Object} params - Session parameters
 * @param {string} params.id - Session ID
 * @param {string} params.documentPath - Absolute path to document
 * @param {string} params.relativePath - Relative path from project root
 * @param {number} params.fileSize - Document file size in bytes
 * @param {Object} params.config - Session configuration
 * @returns {Object} Session metadata object
 */
function createSessionMetadata(params) {
  const {
    id,
    documentPath,
    relativePath,
    fileSize,
    config = {}
  } = params

  const now = new Date().toISOString()

  return {
    // Identity
    id,
    version: 1,

    // Document info
    documentPath,
    relativePath,
    fileSize,

    // Timestamps
    createdAt: now,
    lastAccessedAt: now,

    // Configuration
    config: {
      chunkSize: config.chunkSize || CHUNKING.DEFAULT_SIZE,
      chunkOverlap: config.chunkOverlap || CHUNKING.DEFAULT_OVERLAP
    },

    // Statistics
    stats: {
      totalChunks: 0,
      queriesRun: 0,
      evidenceCollected: 0
    },

    // State
    state: SessionState.ACTIVE
  }
}

/**
 * Create a new query result object
 * @param {Object} params - Query parameters
 * @param {string} params.id - Query ID
 * @param {string} params.sessionId - Parent session ID
 * @param {string} params.query - Query text
 * @param {string} params.strategy - Query strategy
 * @returns {Object} Query result object
 */
function createQueryResult(params) {
  const {
    id,
    sessionId,
    query,
    strategy = QueryStrategy.RECURSIVE
  } = params

  return {
    // Identity
    id,
    sessionId,

    // Query info
    query,
    strategy,
    timestamp: new Date().toISOString(),

    // Results (populated after execution)
    evidence: [],
    synthesis: null,

    // Metrics
    tokensUsed: 0,
    chunksAnalyzed: 0,
    executionTimeMs: 0,

    // Status
    status: 'pending'
  }
}

/**
 * Create an evidence finding object
 * @param {Object} params - Evidence parameters
 * @returns {Object} Evidence object
 */
function createEvidence(params) {
  const {
    chunkId,
    chunkIndex,
    point,
    excerpt,
    confidence = ConfidenceLevel.MEDIUM,
    lineRange = null
  } = params

  return {
    chunkId,
    chunkIndex,
    point,
    excerpt,
    confidence,
    lineRange,
    suggestedNext: []
  }
}

/**
 * Create a chunk metadata object
 * @param {Object} params - Chunk parameters
 * @returns {Object} Chunk metadata
 */
function createChunkMetadata(params) {
  const {
    index,
    start,
    end,
    lineStart = null,
    lineEnd = null
  } = params

  return {
    id: `chunk_${String(index).padStart(3, '0')}`,
    index,
    start,
    end,
    length: end - start,
    lineStart,
    lineEnd
  }
}

/**
 * Create a sessions index object
 * @param {Array} sessions - Array of session entries
 * @returns {Object} Sessions index
 */
function createSessionsIndex(sessions = []) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    sessions
  }
}

/**
 * Create a session index entry (lightweight reference)
 * @param {Object} session - Full session metadata
 * @returns {Object} Index entry
 */
function createSessionIndexEntry(session) {
  return {
    id: session.id,
    documentPath: session.documentPath,
    relativePath: session.relativePath,
    createdAt: session.createdAt,
    lastAccessedAt: session.lastAccessedAt,
    state: session.state
  }
}

/**
 * Create a buffers storage object
 * @returns {Object} Buffers object
 */
function createBuffersStorage() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    buffers: []
  }
}

// ==================== Validation Functions ====================

/**
 * Validate a session metadata object
 * @param {Object} session - Session to validate
 * @returns {Object} Validation result with isValid and errors
 */
function validateSessionMetadata(session) {
  const errors = []

  // Required fields
  if (!session.id || typeof session.id !== 'string') {
    errors.push('Session ID is required and must be a string')
  }

  if (!session.documentPath || typeof session.documentPath !== 'string') {
    errors.push('Document path is required and must be a string')
  }

  if (!session.relativePath || typeof session.relativePath !== 'string') {
    errors.push('Relative path is required and must be a string')
  }

  if (typeof session.fileSize !== 'number' || session.fileSize < 0) {
    errors.push('File size must be a non-negative number')
  }

  // Timestamps
  if (!session.createdAt || !isValidISODate(session.createdAt)) {
    errors.push('Created timestamp must be a valid ISO date')
  }

  if (!session.lastAccessedAt || !isValidISODate(session.lastAccessedAt)) {
    errors.push('Last accessed timestamp must be a valid ISO date')
  }

  // Configuration
  if (session.config) {
    if (typeof session.config.chunkSize !== 'number' ||
        session.config.chunkSize < CHUNKING.MIN_SIZE ||
        session.config.chunkSize > CHUNKING.MAX_SIZE) {
      errors.push(`Chunk size must be between ${CHUNKING.MIN_SIZE} and ${CHUNKING.MAX_SIZE}`)
    }

    if (typeof session.config.chunkOverlap !== 'number' ||
        session.config.chunkOverlap < 0 ||
        session.config.chunkOverlap >= session.config.chunkSize) {
      errors.push('Chunk overlap must be non-negative and less than chunk size')
    }
  }

  // State
  if (!Object.values(SessionState).includes(session.state)) {
    errors.push(`State must be one of: ${Object.values(SessionState).join(', ')}`)
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Validate a query result object
 * @param {Object} result - Query result to validate
 * @returns {Object} Validation result
 */
function validateQueryResult(result) {
  const errors = []

  if (!result.id || typeof result.id !== 'string') {
    errors.push('Query ID is required and must be a string')
  }

  if (!result.sessionId || typeof result.sessionId !== 'string') {
    errors.push('Session ID is required and must be a string')
  }

  if (!result.query || typeof result.query !== 'string') {
    errors.push('Query text is required and must be a string')
  }

  if (!Object.values(QueryStrategy).includes(result.strategy)) {
    errors.push(`Strategy must be one of: ${Object.values(QueryStrategy).join(', ')}`)
  }

  if (!result.timestamp || !isValidISODate(result.timestamp)) {
    errors.push('Timestamp must be a valid ISO date')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Validate an evidence object
 * @param {Object} evidence - Evidence to validate
 * @returns {Object} Validation result
 */
function validateEvidence(evidence) {
  const errors = []

  if (!evidence.chunkId || typeof evidence.chunkId !== 'string') {
    errors.push('Chunk ID is required and must be a string')
  }

  if (typeof evidence.chunkIndex !== 'number' || evidence.chunkIndex < 0) {
    errors.push('Chunk index must be a non-negative number')
  }

  if (!evidence.point || typeof evidence.point !== 'string') {
    errors.push('Evidence point is required and must be a string')
  }

  if (!evidence.excerpt || typeof evidence.excerpt !== 'string') {
    errors.push('Evidence excerpt is required and must be a string')
  }

  if (!Object.values(ConfidenceLevel).includes(evidence.confidence)) {
    errors.push(`Confidence must be one of: ${Object.values(ConfidenceLevel).join(', ')}`)
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Check if a string is a valid ISO 8601 date
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} True if valid
 */
function isValidISODate(dateStr) {
  if (typeof dateStr !== 'string') return false
  const date = new Date(dateStr)
  return !isNaN(date.getTime()) && dateStr === date.toISOString()
}

/**
 * Update session's lastAccessedAt timestamp
 * @param {Object} session - Session to update
 * @returns {Object} Updated session
 */
function touchSession(session) {
  return {
    ...session,
    lastAccessedAt: new Date().toISOString()
  }
}

/**
 * Check if a session is expired based on retention policy
 * @param {Object} session - Session to check
 * @param {number} retentionDays - Retention period in days
 * @returns {boolean} True if session is expired
 */
function isSessionExpired(session, retentionDays = SESSION.RETENTION_DAYS) {
  // Only closed sessions can expire
  if (session.state !== SessionState.CLOSED) {
    return false
  }

  const cutoffMs = Date.now() - (retentionDays * 24 * 60 * 60 * 1000)
  const lastAccessMs = new Date(session.lastAccessedAt).getTime()

  return lastAccessMs < cutoffMs
}

module.exports = {
  // Enums
  SessionState,
  QueryStrategy,
  ConfidenceLevel,

  // Factory functions
  createSessionMetadata,
  createQueryResult,
  createEvidence,
  createChunkMetadata,
  createSessionsIndex,
  createSessionIndexEntry,
  createBuffersStorage,

  // Validation functions
  validateSessionMetadata,
  validateQueryResult,
  validateEvidence,
  isValidISODate,

  // Utility functions
  touchSession,
  isSessionExpired
}
