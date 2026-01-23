/**
 * RLM Document Plugin - Entry Point
 *
 * Recursive Language Model analysis for large documents with iterative
 * exploration and evidence extraction. This plugin provides session-based
 * document analysis with Python REPL integration.
 */

const path = require('path')
const fs = require('fs').promises
const { STORAGE, getConfig } = require('./lib/config')
const { detectPython } = require('./lib/python-detector')
const SessionStore = require('./lib/session-store')
const ReplManager = require('./lib/repl-manager')
const { exportSession, getExportFormats } = require('./lib/exporters')
const {
  validateDocumentPath,
  validateSessionId,
  validateExportFormat,
  validateQuery,
  validateGrepPattern,
  validateChunkIndex,
  validateChunkConfig,
  validateBufferContent
} = require('./lib/validators')

const RlmDocumentPlugin = {
  name: 'rlm-document-plugin',
  context: null,
  projectPath: null,
  sessionStore: null,
  replManager: null,
  pythonPath: null,
  cleanupTimer: null,

  /**
   * Activate the plugin
   * @param {Object} context - Plugin context provided by Puffin
   */
  async activate(context) {
    this.context = context

    // Initialize project path
    this.projectPath = context.projectPath || process.cwd()

    // Initialize session store
    const storageDir = path.join(this.projectPath, STORAGE.BASE_DIR)
    this.sessionStore = new SessionStore(storageDir, { log: context.log })
    await this.sessionStore.initialize()

    // Detect Python installation
    const pythonResult = await detectPython()
    if (pythonResult.success) {
      this.pythonPath = pythonResult.path
      context.log.info(`[rlm-document-plugin] Python detected: ${pythonResult.path} (${pythonResult.version.string})`)

      // Initialize REPL manager with detected Python
      const scriptPath = path.join(__dirname, 'scripts', 'rlm_repl.py')
      this.replManager = new ReplManager({
        pythonPath: this.pythonPath,
        scriptPath,
        log: context.log
      })

      // Set up REPL manager events
      this.replManager.on('repl:initialized', ({ sessionId, documentPath }) => {
        context.log.info(`[rlm-document-plugin] REPL initialized for session ${sessionId}`)
      })

      this.replManager.on('repl:closed', ({ sessionId, code }) => {
        context.log.info(`[rlm-document-plugin] REPL closed for session ${sessionId} (code: ${code})`)
      })
    } else {
      context.log.warn(`[rlm-document-plugin] Python not detected: ${pythonResult.error}`)
      context.log.warn(`[rlm-document-plugin] REPL features will be unavailable until Python is installed`)
      this.replManager = null
    }

    // Register IPC handlers
    this.registerHandlers(context)

    // Schedule session cleanup check (30-day retention)
    this.scheduleCleanup()

    context.log.info('[rlm-document-plugin] Activated')
  },

  /**
   * Deactivate the plugin (cleanup)
   */
  async deactivate() {
    // Clear cleanup timer if scheduled
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    // Close all REPL processes
    if (this.replManager) {
      await this.replManager.closeAll()
      this.replManager = null
    }

    this.context.log.info('[rlm-document-plugin] Deactivated')
    this.context = null
    this.sessionStore = null
  },

  /**
   * Register IPC handlers for renderer communication
   * @param {Object} context - Plugin context
   */
  registerHandlers(context) {
    // Session management
    context.registerIpcHandler('init-session', this.handleInitSession.bind(this))
    context.registerIpcHandler('close-session', this.handleCloseSession.bind(this))
    context.registerIpcHandler('list-sessions', this.handleListSessions.bind(this))
    context.registerIpcHandler('get-session', this.handleGetSession.bind(this))
    context.registerIpcHandler('delete-session', this.handleDeleteSession.bind(this))

    // Query results
    context.registerIpcHandler('get-query-results', this.handleGetQueryResults.bind(this))

    // Document operations
    context.registerIpcHandler('query', this.handleQuery.bind(this))
    context.registerIpcHandler('peek', this.handlePeek.bind(this))
    context.registerIpcHandler('grep', this.handleGrep.bind(this))
    context.registerIpcHandler('get-chunks', this.handleGetChunks.bind(this))
    context.registerIpcHandler('get-chunk', this.handleGetChunk.bind(this))

    // Buffers
    context.registerIpcHandler('add-buffer', this.handleAddBuffer.bind(this))
    context.registerIpcHandler('get-buffers', this.handleGetBuffers.bind(this))

    // Results and configuration
    context.registerIpcHandler('export-results', this.handleExportResults.bind(this))
    context.registerIpcHandler('get-export-formats', this.handleGetExportFormats.bind(this))
    context.registerIpcHandler('get-config', this.handleGetConfig.bind(this))
    context.registerIpcHandler('get-storage-stats', this.handleGetStorageStats.bind(this))
    context.registerIpcHandler('get-repl-stats', this.handleGetReplStats.bind(this))
  },

  /**
   * Schedule periodic session cleanup
   * Runs 30-day cleanup on activation and then daily
   */
  scheduleCleanup() {
    // Run initial cleanup
    this.runSessionCleanup().catch(err => {
      this.context.log.error('[rlm-document-plugin] Cleanup error:', err.message)
    })

    // Schedule daily cleanup (24 hours)
    const DAY_MS = 24 * 60 * 60 * 1000
    this.cleanupTimer = setInterval(() => {
      this.runSessionCleanup().catch(err => {
        this.context.log.error('[rlm-document-plugin] Scheduled cleanup error:', err.message)
      })
    }, DAY_MS)

    // Ensure timer doesn't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref()
    }
  },

  /**
   * Run session cleanup - delete sessions older than 30 days
   */
  async runSessionCleanup() {
    const cleanedCount = await this.sessionStore.cleanupExpiredSessions()
    if (cleanedCount > 0) {
      this.context.log.info(`[rlm-document-plugin] Cleaned up ${cleanedCount} expired sessions`)
    }
  },

  /**
   * Ensure REPL is available
   * @throws {Error} If Python/REPL is not available
   */
  requireRepl() {
    if (!this.replManager) {
      throw new Error('Python REPL is not available. Please install Python 3.7+')
    }
  },

  /**
   * Ensure REPL is initialized for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<boolean>} True if REPL is ready
   */
  async ensureReplInitialized(sessionId) {
    this.requireRepl()

    if (this.replManager.hasRepl(sessionId)) {
      return true
    }

    // Get session and initialize REPL
    const session = await this.sessionStore.getSession(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    await this.replManager.initRepl(sessionId, session.documentPath, session.config)
    return true
  },

  // ==================== IPC Handlers ====================

  /**
   * Initialize a new RLM session for a document
   * @param {Object} options - Session options
   * @param {string} options.documentPath - Relative path to document
   * @param {number} options.chunkSize - Optional chunk size override
   * @param {number} options.chunkOverlap - Optional overlap override
   * @returns {Promise<Object>} Session info or error
   */
  async handleInitSession(options = {}) {
    const { documentPath, chunkSize, chunkOverlap } = options

    if (!documentPath) {
      return { error: 'Document path is required' }
    }

    // Validate path is within project
    const pathValidation = validateDocumentPath(documentPath, this.projectPath)
    if (!pathValidation.isValid) {
      this.context.log.warn(`[rlm-document-plugin] Blocked session init: ${pathValidation.error}`)
      return { error: pathValidation.error }
    }

    // Check file exists and get stats
    let stats
    try {
      stats = await fs.stat(pathValidation.resolvedPath)
    } catch (error) {
      return { error: 'Document not found' }
    }

    try {
      // Create session using SessionStore
      const sessionConfig = {
        chunkSize: chunkSize || getConfig().chunking.DEFAULT_SIZE,
        chunkOverlap: chunkOverlap || getConfig().chunking.DEFAULT_OVERLAP
      }

      const session = await this.sessionStore.createSession({
        documentPath: pathValidation.resolvedPath,
        relativePath: documentPath,
        fileSize: stats.size,
        config: sessionConfig
      })

      // Initialize REPL if Python is available
      let replInfo = null
      if (this.replManager) {
        try {
          replInfo = await this.replManager.initRepl(
            session.id,
            pathValidation.resolvedPath,
            sessionConfig
          )

          // Update session with chunk count
          if (replInfo.chunkCount) {
            await this.sessionStore.updateSession(session.id, {
              stats: {
                ...session.stats,
                totalChunks: replInfo.chunkCount
              }
            })
            session.stats.totalChunks = replInfo.chunkCount
          }
        } catch (replError) {
          this.context.log.warn(`[rlm-document-plugin] REPL init failed: ${replError.message}`)
          replInfo = { error: replError.message }
        }
      }

      this.context.log.info(`[rlm-document-plugin] Created session ${session.id} for ${documentPath}`)
      return {
        session,
        repl: replInfo
      }
    } catch (error) {
      return { error: error.message }
    }
  },

  /**
   * Get a session by ID
   * @param {Object} options - Options with sessionId
   * @returns {Promise<Object>} Session or error
   */
  async handleGetSession(options = {}) {
    const { sessionId, touch = true } = options

    if (!sessionId) {
      return { error: 'Session ID is required' }
    }

    const session = await this.sessionStore.getSession(sessionId, { touch })

    if (!session) {
      return { error: `Session not found: ${sessionId}` }
    }

    // Include REPL status if available
    const replStatus = this.replManager?.getReplStatus(sessionId) || null

    return { session, replStatus }
  },

  /**
   * Close an RLM session
   * @param {Object} options - Options with sessionId
   * @returns {Promise<Object>} Success status
   */
  async handleCloseSession(options = {}) {
    const { sessionId } = options

    if (!sessionId) {
      return { error: 'Session ID is required' }
    }

    try {
      // Close REPL if active
      if (this.replManager?.hasRepl(sessionId)) {
        await this.replManager.closeRepl(sessionId)
      }

      await this.sessionStore.closeSession(sessionId)
      this.context.log.info(`[rlm-document-plugin] Closed session ${sessionId}`)
      return { success: true }
    } catch (error) {
      return { error: error.message }
    }
  },

  /**
   * Delete an RLM session
   * @param {Object} options - Options with sessionId
   * @returns {Promise<Object>} Success status
   */
  async handleDeleteSession(options = {}) {
    const { sessionId } = options

    if (!sessionId) {
      return { error: 'Session ID is required' }
    }

    try {
      // Close REPL if active
      if (this.replManager?.hasRepl(sessionId)) {
        await this.replManager.closeRepl(sessionId)
      }

      await this.sessionStore.deleteSession(sessionId)
      this.context.log.info(`[rlm-document-plugin] Deleted session ${sessionId}`)
      return { success: true }
    } catch (error) {
      return { error: error.message }
    }
  },

  /**
   * List all sessions for the current project
   * @param {Object} options - Options
   * @param {boolean} options.includeMetadata - Include full metadata
   * @param {string} options.state - Filter by state
   * @returns {Promise<Object>} Sessions array
   */
  async handleListSessions(options = {}) {
    const { includeMetadata = true, state = null } = options

    const sessions = await this.sessionStore.listSessions({
      includeMetadata,
      state
    })

    return { sessions }
  },

  /**
   * Get query results for a session
   * @param {Object} options - Options with sessionId
   * @returns {Promise<Object>} Query results array
   */
  async handleGetQueryResults(options = {}) {
    const { sessionId, queryId = null } = options

    if (!sessionId) {
      return { error: 'Session ID is required' }
    }

    try {
      if (queryId) {
        const result = await this.sessionStore.getQueryResult(sessionId, queryId)
        if (!result) {
          return { error: `Query not found: ${queryId}` }
        }
        return { result }
      }

      const results = await this.sessionStore.getQueryResults(sessionId)
      return { results }
    } catch (error) {
      return { error: error.message }
    }
  },

  /**
   * Execute a query against a document session
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Query result
   */
  async handleQuery(options = {}) {
    const { sessionId, query } = options

    if (!sessionId) {
      return { error: 'Session ID is required' }
    }

    if (!query) {
      return { error: 'Query is required' }
    }

    try {
      await this.ensureReplInitialized(sessionId)
      const result = await this.replManager.executeQuery(sessionId, query)
      return { result }
    } catch (error) {
      return { error: error.message }
    }
  },

  /**
   * Peek at content range in a session document
   * @param {Object} options - Peek options
   * @returns {Promise<Object>} Content result
   */
  async handlePeek(options = {}) {
    const { sessionId, start = 0, end } = options

    if (!sessionId) {
      return { error: 'Session ID is required' }
    }

    try {
      await this.ensureReplInitialized(sessionId)
      const result = await this.replManager.peek(sessionId, start, end)
      return { result }
    } catch (error) {
      return { error: error.message }
    }
  },

  /**
   * Grep for patterns in a session document
   * @param {Object} options - Grep options
   * @returns {Promise<Object>} Search results
   */
  async handleGrep(options = {}) {
    const { sessionId, pattern, maxMatches, contextLines } = options

    if (!sessionId) {
      return { error: 'Session ID is required' }
    }

    if (!pattern) {
      return { error: 'Search pattern is required' }
    }

    try {
      await this.ensureReplInitialized(sessionId)
      const result = await this.replManager.grep(sessionId, pattern, {
        maxMatches,
        contextLines
      })
      return { result }
    } catch (error) {
      return { error: error.message }
    }
  },

  /**
   * Get chunk information for a session
   * @param {Object} options - Options with sessionId
   * @returns {Promise<Object>} Chunks result
   */
  async handleGetChunks(options = {}) {
    const { sessionId, includeContent = false } = options

    if (!sessionId) {
      return { error: 'Session ID is required' }
    }

    try {
      await this.ensureReplInitialized(sessionId)
      const result = await this.replManager.getChunks(sessionId, includeContent)
      return { result }
    } catch (error) {
      return { error: error.message }
    }
  },

  /**
   * Get a specific chunk by index
   * @param {Object} options - Options with sessionId and index
   * @returns {Promise<Object>} Chunk result
   */
  async handleGetChunk(options = {}) {
    const { sessionId, index } = options

    if (!sessionId) {
      return { error: 'Session ID is required' }
    }

    if (index === undefined || index === null) {
      return { error: 'Chunk index is required' }
    }

    try {
      await this.ensureReplInitialized(sessionId)
      const result = await this.replManager.getChunk(sessionId, index)
      return { result }
    } catch (error) {
      return { error: error.message }
    }
  },

  /**
   * Add content to session buffer
   * @param {Object} options - Buffer options
   * @returns {Promise<Object>} Buffer result
   */
  async handleAddBuffer(options = {}) {
    const { sessionId, content, label } = options

    if (!sessionId) {
      return { error: 'Session ID is required' }
    }

    if (content === undefined || content === null) {
      return { error: 'Buffer content is required' }
    }

    try {
      await this.ensureReplInitialized(sessionId)
      const result = await this.replManager.addBuffer(sessionId, content, label)

      // Also persist to session store
      await this.sessionStore.addBuffer(sessionId, content, label)

      return { result }
    } catch (error) {
      return { error: error.message }
    }
  },

  /**
   * Get buffers for a session
   * @param {Object} options - Options with sessionId
   * @returns {Promise<Object>} Buffers result
   */
  async handleGetBuffers(options = {}) {
    const { sessionId } = options

    if (!sessionId) {
      return { error: 'Session ID is required' }
    }

    try {
      // Try REPL first for in-memory buffers
      if (this.replManager?.hasRepl(sessionId)) {
        const result = await this.replManager.getBuffers(sessionId)
        return { result }
      }

      // Fall back to persisted buffers
      const buffers = await this.sessionStore.getBuffers(sessionId)
      return { result: buffers }
    } catch (error) {
      return { error: error.message }
    }
  },

  /**
   * Export session results to JSON or Markdown format
   * @param {Object} options - Export options
   * @param {string} options.sessionId - Session ID to export
   * @param {string} options.format - Export format ('json' or 'markdown')
   * @param {Object} options.exportOptions - Format-specific options
   * @returns {Promise<Object>} Export result with content, mimeType, filename
   */
  async handleExportResults(options = {}) {
    const { sessionId, format = 'json', exportOptions = {} } = options

    // Validate session ID
    const sessionValidation = validateSessionId(sessionId)
    if (!sessionValidation.isValid) {
      return { error: sessionValidation.error }
    }

    // Validate export format
    const formatValidation = validateExportFormat(format)
    if (!formatValidation.isValid) {
      return { error: formatValidation.error }
    }

    try {
      // Get session metadata
      const session = await this.sessionStore.getSession(sessionId, { touch: false })
      if (!session) {
        return { error: `Session not found: ${sessionId}` }
      }

      // Get query results for the session
      const results = await this.sessionStore.getQueryResults(sessionId)

      // Generate export
      const exportResult = exportSession(session, results, formatValidation.format, exportOptions)

      this.context.log.info(`[rlm-document-plugin] Exported session ${sessionId} as ${formatValidation.format}`)

      return {
        export: exportResult,
        session: {
          id: session.id,
          documentPath: session.relativePath || session.documentPath,
          queryCount: results.length
        }
      }
    } catch (error) {
      this.context.log.error(`[rlm-document-plugin] Export error: ${error.message}`)
      return { error: error.message }
    }
  },

  /**
   * Get available export formats
   * @returns {Promise<Object>} Available formats
   */
  async handleGetExportFormats() {
    return { formats: getExportFormats() }
  },

  /**
   * Get plugin configuration
   * @returns {Promise<Object>} Configuration object
   */
  async handleGetConfig() {
    return {
      config: getConfig(),
      pythonAvailable: !!this.pythonPath,
      pythonPath: this.pythonPath
    }
  },

  /**
   * Get storage statistics
   * @returns {Promise<Object>} Storage stats
   */
  async handleGetStorageStats() {
    const stats = await this.sessionStore.getStorageStats()
    return { stats }
  },

  /**
   * Get REPL manager statistics
   * @returns {Promise<Object>} REPL stats
   */
  async handleGetReplStats() {
    if (!this.replManager) {
      return { error: 'REPL manager not available' }
    }

    return { stats: this.replManager.getStats() }
  }
}

module.exports = RlmDocumentPlugin
