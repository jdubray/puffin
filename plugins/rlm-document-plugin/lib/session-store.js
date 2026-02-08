/**
 * RLM Document Plugin - Session Store
 *
 * Manages session persistence with CRUD operations and 30-day auto-cleanup.
 * Uses atomic writes for data safety and project-level storage.
 */

const fs = require('fs').promises
const path = require('path')
const crypto = require('crypto')
const { SESSION, STORAGE, QUERY } = require('./config')
const {
  SessionState,
  createSessionMetadata,
  createQueryResult,
  createSessionsIndex,
  createSessionIndexEntry,
  createBuffersStorage,
  validateSessionMetadata,
  touchSession,
  isSessionExpired
} = require('./schemas')

/**
 * SessionStore - Manages RLM session persistence
 */
class SessionStore {
  /**
   * Create a new SessionStore
   * @param {string} storageDir - Base storage directory (.puffin/rlm-sessions)
   * @param {Object} options - Store options
   * @param {Object} options.log - Logger instance
   */
  constructor(storageDir, options = {}) {
    this.storageDir = storageDir
    this.sessionsDir = path.join(storageDir, STORAGE.SESSIONS_DIR)
    this.indexPath = path.join(storageDir, STORAGE.INDEX_FILE)
    this.log = options.log || console
    this.initialized = false
  }

  /**
   * Initialize the session store
   * Creates necessary directories if they don't exist
   */
  async initialize() {
    await fs.mkdir(this.storageDir, { recursive: true })
    await fs.mkdir(this.sessionsDir, { recursive: true })

    // Ensure index file exists
    try {
      await fs.access(this.indexPath)
    } catch {
      await this.saveIndex(createSessionsIndex())
    }

    this.initialized = true
  }

  /**
   * Ensure store is initialized before operations
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('SessionStore not initialized. Call initialize() first.')
    }
  }

  // ==================== Index Operations ====================

  /**
   * Load the sessions index
   * @returns {Promise<Object>} Sessions index object
   */
  async loadIndex() {
    this.ensureInitialized()

    try {
      const data = await fs.readFile(this.indexPath, 'utf-8')
      return JSON.parse(data)
    } catch (error) {
      // Return empty index if file is missing or corrupt
      return createSessionsIndex()
    }
  }

  /**
   * Save the sessions index using atomic write
   * @param {Object} index - Index object to save
   */
  async saveIndex(index) {
    const tempPath = `${this.indexPath}.tmp`

    try {
      // Update timestamp
      index.updatedAt = new Date().toISOString()

      // Write to temp file
      await fs.writeFile(tempPath, JSON.stringify(index, null, 2), 'utf-8')

      // Atomic rename
      await fs.rename(tempPath, this.indexPath)
    } catch (error) {
      // Cleanup temp file on error
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      throw error
    }
  }

  // ==================== Session CRUD ====================

  /**
   * Create a new session
   * @param {Object} params - Session parameters
   * @param {string} params.documentPath - Absolute path to document
   * @param {string} params.relativePath - Relative path from project
   * @param {number} params.fileSize - File size in bytes
   * @param {Object} params.config - Session configuration
   * @returns {Promise<Object>} Created session
   */
  async createSession(params) {
    this.ensureInitialized()

    // Check session limit
    const index = await this.loadIndex()
    if (index.sessions.length >= SESSION.MAX_PER_PROJECT) {
      throw new Error(`Maximum sessions limit reached (${SESSION.MAX_PER_PROJECT})`)
    }

    // Generate session ID
    const sessionId = this.generateSessionId()

    // Create session metadata
    const session = createSessionMetadata({
      id: sessionId,
      ...params
    })

    // Validate session
    const validation = validateSessionMetadata(session)
    if (!validation.isValid) {
      throw new Error(`Invalid session: ${validation.errors.join(', ')}`)
    }

    // Create session directory structure
    const sessionDir = path.join(this.sessionsDir, sessionId)
    await fs.mkdir(sessionDir, { recursive: true })
    await fs.mkdir(path.join(sessionDir, STORAGE.RESULTS_DIR), { recursive: true })
    await fs.mkdir(path.join(sessionDir, STORAGE.CHUNKS_DIR), { recursive: true })

    // Save session metadata
    await this.saveSessionMetadata(sessionId, session)

    // Initialize empty buffers
    await this.saveBuffers(sessionId, createBuffersStorage())

    // Update index
    index.sessions.push(createSessionIndexEntry(session))
    await this.saveIndex(index)

    return session
  }

  /**
   * Get a session by ID
   * @param {string} sessionId - Session ID
   * @param {Object} options - Options
   * @param {boolean} options.touch - Update lastAccessedAt (default: true)
   * @returns {Promise<Object|null>} Session or null if not found
   */
  async getSession(sessionId, options = {}) {
    this.ensureInitialized()
    const { touch = true } = options

    try {
      const session = await this.loadSessionMetadata(sessionId)

      if (touch) {
        // Update access time
        const updated = touchSession(session)
        await this.saveSessionMetadata(sessionId, updated)
        await this.updateIndexEntry(sessionId, { lastAccessedAt: updated.lastAccessedAt })
        return updated
      }

      return session
    } catch (error) {
      return null
    }
  }

  /**
   * Update a session
   * @param {string} sessionId - Session ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated session
   */
  async updateSession(sessionId, updates) {
    this.ensureInitialized()

    const session = await this.loadSessionMetadata(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Apply updates
    const updated = {
      ...session,
      ...updates,
      lastAccessedAt: new Date().toISOString()
    }

    // Validate
    const validation = validateSessionMetadata(updated)
    if (!validation.isValid) {
      throw new Error(`Invalid session update: ${validation.errors.join(', ')}`)
    }

    // Save
    await this.saveSessionMetadata(sessionId, updated)

    // Update index entry
    await this.updateIndexEntry(sessionId, {
      lastAccessedAt: updated.lastAccessedAt,
      state: updated.state
    })

    return updated
  }

  /**
   * Close a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Closed session
   */
  async closeSession(sessionId) {
    return this.updateSession(sessionId, { state: SessionState.CLOSED })
  }

  /**
   * Delete a session and all its data
   * @param {string} sessionId - Session ID
   */
  async deleteSession(sessionId) {
    this.ensureInitialized()

    const sessionDir = path.join(this.sessionsDir, sessionId)

    // Remove session directory recursively
    try {
      await fs.rm(sessionDir, { recursive: true, force: true })
    } catch (error) {
      this.log.warn?.(`[session-store] Failed to delete session directory: ${error.message}`)
    }

    // Remove from index
    const index = await this.loadIndex()
    index.sessions = index.sessions.filter(s => s.id !== sessionId)
    await this.saveIndex(index)
  }

  /**
   * List all sessions
   * @param {Object} options - List options
   * @param {boolean} options.includeMetadata - Include full metadata (default: false)
   * @param {string} options.state - Filter by state
   * @returns {Promise<Array>} Array of sessions
   */
  async listSessions(options = {}) {
    this.ensureInitialized()
    const { includeMetadata = false, state = null } = options

    const index = await this.loadIndex()
    let sessions = index.sessions

    // Filter by state if specified
    if (state) {
      sessions = sessions.filter(s => s.state === state)
    }

    // Include full metadata if requested
    if (includeMetadata) {
      sessions = await Promise.all(
        sessions.map(async (entry) => {
          try {
            return await this.loadSessionMetadata(entry.id)
          } catch {
            return entry
          }
        })
      )
    }

    return sessions
  }

  // ==================== Query Results ====================

  /**
   * Save a query result
   * @param {string} sessionId - Session ID
   * @param {Object} result - Query result object
   */
  async saveQueryResult(sessionId, result) {
    this.ensureInitialized()

    const resultsDir = path.join(this.sessionsDir, sessionId, STORAGE.RESULTS_DIR)
    const resultPath = path.join(resultsDir, `${result.id}.json`)
    const tempPath = `${resultPath}.tmp`

    await fs.writeFile(tempPath, JSON.stringify(result, null, 2), 'utf-8')
    await fs.rename(tempPath, resultPath)

    // Update session stats
    const session = await this.loadSessionMetadata(sessionId)
    session.stats.queriesRun++
    session.stats.evidenceCollected += result.evidence?.length || 0
    await this.saveSessionMetadata(sessionId, touchSession(session))
  }

  /**
   * Get all query results for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Array>} Array of query results
   */
  async getQueryResults(sessionId) {
    this.ensureInitialized()

    const resultsDir = path.join(this.sessionsDir, sessionId, STORAGE.RESULTS_DIR)

    try {
      const files = await fs.readdir(resultsDir)
      const results = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(async (f) => {
            const data = await fs.readFile(path.join(resultsDir, f), 'utf-8')
            return JSON.parse(data)
          })
      )

      // Sort by timestamp descending
      return results.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
    } catch {
      return []
    }
  }

  /**
   * Get a specific query result
   * @param {string} sessionId - Session ID
   * @param {string} queryId - Query ID
   * @returns {Promise<Object|null>} Query result or null
   */
  async getQueryResult(sessionId, queryId) {
    this.ensureInitialized()

    const resultPath = path.join(
      this.sessionsDir,
      sessionId,
      STORAGE.RESULTS_DIR,
      `${queryId}.json`
    )

    try {
      const data = await fs.readFile(resultPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  // ==================== Buffers ====================

  /**
   * Save buffers for a session
   * @param {string} sessionId - Session ID
   * @param {Object} buffers - Buffers object
   */
  async saveBuffers(sessionId, buffers) {
    this.ensureInitialized()

    const buffersPath = path.join(this.sessionsDir, sessionId, STORAGE.BUFFERS_FILE)
    const tempPath = `${buffersPath}.tmp`

    buffers.updatedAt = new Date().toISOString()
    await fs.writeFile(tempPath, JSON.stringify(buffers, null, 2), 'utf-8')
    await fs.rename(tempPath, buffersPath)
  }

  /**
   * Get buffers for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Buffers object
   */
  async getBuffers(sessionId) {
    this.ensureInitialized()

    const buffersPath = path.join(this.sessionsDir, sessionId, STORAGE.BUFFERS_FILE)

    try {
      const data = await fs.readFile(buffersPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return createBuffersStorage()
    }
  }

  /**
   * Add a buffer entry
   * @param {string} sessionId - Session ID
   * @param {string} content - Buffer content
   * @param {string} label - Optional label
   */
  async addBuffer(sessionId, content, label = null) {
    const buffers = await this.getBuffers(sessionId)

    buffers.buffers.push({
      index: buffers.buffers.length,
      content,
      label,
      createdAt: new Date().toISOString()
    })

    await this.saveBuffers(sessionId, buffers)
  }

  // ==================== Cleanup ====================

  /**
   * Run cleanup to remove expired sessions
   * @param {number} retentionDays - Retention period (default: 30)
   * @returns {Promise<number>} Number of sessions cleaned up
   */
  async cleanupExpiredSessions(retentionDays = SESSION.RETENTION_DAYS) {
    this.ensureInitialized()

    // Use index entries only (not full metadata) for efficiency
    // Index entries contain state and lastAccessedAt which is all isSessionExpired needs
    const sessions = await this.listSessions({ includeMetadata: false })
    let cleanedCount = 0

    for (const session of sessions) {
      if (isSessionExpired(session, retentionDays)) {
        try {
          await this.deleteSession(session.id)
          cleanedCount++
          this.log.info?.(`[session-store] Cleaned up expired session: ${session.id}`)
        } catch (error) {
          this.log.error?.(`[session-store] Failed to cleanup session ${session.id}: ${error.message}`)
        }
      }
    }

    return cleanedCount
  }

  /**
   * Get storage statistics
   * @returns {Promise<Object>} Storage stats
   */
  async getStorageStats() {
    this.ensureInitialized()

    const sessions = await this.listSessions({ includeMetadata: true })

    const stats = {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.state === SessionState.ACTIVE).length,
      closedSessions: sessions.filter(s => s.state === SessionState.CLOSED).length,
      totalQueries: sessions.reduce((sum, s) => sum + (s.stats?.queriesRun || 0), 0),
      totalEvidence: sessions.reduce((sum, s) => sum + (s.stats?.evidenceCollected || 0), 0)
    }

    return stats
  }

  // ==================== Private Helpers ====================

  /**
   * Generate a unique session ID using cryptographically secure random bytes
   * @returns {string} Session ID
   */
  generateSessionId() {
    const timestamp = Date.now().toString(36)
    const random = crypto.randomBytes(4).toString('hex')
    return `${SESSION.ID_PREFIX}${timestamp}${random}`
  }

  /**
   * Generate a unique query ID using cryptographically secure random bytes
   * @returns {string} Query ID
   */
  generateQueryId() {
    const timestamp = Date.now().toString(36)
    const random = crypto.randomBytes(4).toString('hex')
    return `${QUERY.ID_PREFIX}${timestamp}${random}`
  }

  /**
   * Load session metadata from file
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Session metadata
   */
  async loadSessionMetadata(sessionId) {
    const metadataPath = path.join(
      this.sessionsDir,
      sessionId,
      STORAGE.METADATA_FILE
    )
    const data = await fs.readFile(metadataPath, 'utf-8')
    return JSON.parse(data)
  }

  /**
   * Save session metadata to file
   * @param {string} sessionId - Session ID
   * @param {Object} session - Session metadata
   */
  async saveSessionMetadata(sessionId, session) {
    const sessionDir = path.join(this.sessionsDir, sessionId)
    const metadataPath = path.join(sessionDir, STORAGE.METADATA_FILE)
    const tempPath = `${metadataPath}.tmp`

    await fs.writeFile(tempPath, JSON.stringify(session, null, 2), 'utf-8')
    await fs.rename(tempPath, metadataPath)
  }

  /**
   * Update a session's entry in the index
   * @param {string} sessionId - Session ID
   * @param {Object} updates - Fields to update
   */
  async updateIndexEntry(sessionId, updates) {
    const index = await this.loadIndex()

    index.sessions = index.sessions.map(entry => {
      if (entry.id === sessionId) {
        return { ...entry, ...updates }
      }
      return entry
    })

    await this.saveIndex(index)
  }
}

module.exports = SessionStore
