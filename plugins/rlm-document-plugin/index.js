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
const { RlmOrchestrator } = require('./lib/rlm-orchestrator')
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
  orchestrator: null,
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

    // Initialize RLM Orchestrator (requires REPL manager)
    if (this.replManager) {
      this.orchestrator = new RlmOrchestrator({
        replManager: this.replManager,
        log: context.log,
        config: {
          model: 'haiku',        // Default to haiku (fast/cheap)
          maxConcurrent: 5,      // 5 parallel Claude Code processes
          maxIterations: 3,      // Up to 3 refinement iterations
          useMock: false         // Use real Claude Code CLI
        }
      })

      // Forward orchestrator events for UI updates
      this.orchestrator.on('progress:update', data => {
        context.log.debug('[rlm-document-plugin] Progress update', data)
      })

      this.orchestrator.on('query:iteration:start', data => {
        context.log.info(`[rlm-document-plugin] Query iteration ${data.iteration} started`)
      })

      this.orchestrator.on('query:complete', data => {
        context.log.info(`[rlm-document-plugin] Query complete: ${data.results?.summary?.totalFindings || 0} findings`)
      })

      context.log.info('[rlm-document-plugin] RLM Orchestrator initialized')
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

    // Cleanup orchestrator
    if (this.orchestrator) {
      await this.orchestrator.cleanup()
      this.orchestrator = null
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
    context.registerIpcHandler('initSession', this.handleInitSession.bind(this))
    context.registerIpcHandler('closeSession', this.handleCloseSession.bind(this))
    context.registerIpcHandler('listSessions', this.handleListSessions.bind(this))
    context.registerIpcHandler('getSession', this.handleGetSession.bind(this))
    context.registerIpcHandler('deleteSession', this.handleDeleteSession.bind(this))

    // Query results
    context.registerIpcHandler('getQueryResults', this.handleGetQueryResults.bind(this))

    // Document operations
    context.registerIpcHandler('query', this.handleQuery.bind(this))
    context.registerIpcHandler('peek', this.handlePeek.bind(this))
    context.registerIpcHandler('grep', this.handleGrep.bind(this))
    context.registerIpcHandler('getChunks', this.handleGetChunks.bind(this))
    context.registerIpcHandler('getChunk', this.handleGetChunk.bind(this))

    // Buffers
    context.registerIpcHandler('addBuffer', this.handleAddBuffer.bind(this))
    context.registerIpcHandler('getBuffers', this.handleGetBuffers.bind(this))

    // Results and configuration
    context.registerIpcHandler('exportResults', this.handleExportResults.bind(this))
    context.registerIpcHandler('getExportFormats', this.handleGetExportFormats.bind(this))
    context.registerIpcHandler('getConfig', this.handleGetConfig.bind(this))
    context.registerIpcHandler('getStorageStats', this.handleGetStorageStats.bind(this))
    context.registerIpcHandler('getReplStats', this.handleGetReplStats.bind(this))

    // File operations (for DocumentPicker)
    context.registerIpcHandler('showFileDialog', this.handleShowFileDialog.bind(this))
    context.registerIpcHandler('getFileStat', this.handleGetFileStat.bind(this))

    // RLM Orchestrator operations
    context.registerIpcHandler('executeRlmQuery', this.handleExecuteRlmQuery.bind(this))
    context.registerIpcHandler('getOrchestratorStatus', this.handleGetOrchestratorStatus.bind(this))
    context.registerIpcHandler('configureOrchestrator', this.handleConfigureOrchestrator.bind(this))
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
    this.context.log.info('[rlm-document-plugin] handleInitSession called', options)
    const { documentPath, chunkSize, chunkOverlap } = options

    if (!documentPath) {
      this.context.log.warn('[rlm-document-plugin] No documentPath provided')
      return { error: 'Document path is required' }
    }

    // Validate path is within project
    this.context.log.info('[rlm-document-plugin] Validating path...', { documentPath, projectPath: this.projectPath })
    const pathValidation = validateDocumentPath(documentPath, this.projectPath)
    if (!pathValidation.isValid) {
      this.context.log.warn(`[rlm-document-plugin] Blocked session init: ${pathValidation.error}`)
      return { error: pathValidation.error }
    }
    this.context.log.info('[rlm-document-plugin] Path validated', { resolvedPath: pathValidation.resolvedPath })

    // Check file exists and get stats
    let stats
    try {
      this.context.log.info('[rlm-document-plugin] Checking file stats...')
      stats = await fs.stat(pathValidation.resolvedPath)
      this.context.log.info('[rlm-document-plugin] File stats retrieved', { size: stats.size })
    } catch (error) {
      this.context.log.error('[rlm-document-plugin] File not found', { error: error.message })
      return { error: 'Document not found' }
    }

    try {
      // Create session using SessionStore
      const sessionConfig = {
        chunkSize: chunkSize || getConfig().chunking.DEFAULT_SIZE,
        chunkOverlap: chunkOverlap || getConfig().chunking.DEFAULT_OVERLAP
      }
      this.context.log.info('[rlm-document-plugin] Creating session...', sessionConfig)

      const session = await this.sessionStore.createSession({
        documentPath: pathValidation.resolvedPath,
        relativePath: documentPath,
        fileSize: stats.size,
        config: sessionConfig
      })
      this.context.log.info('[rlm-document-plugin] Session created', { sessionId: session.id })

      // Initialize REPL if Python is available
      // Note: REPL init is async but we don't block on it to avoid hanging the session creation
      let replInfo = null
      if (this.replManager) {
        this.context.log.info('[rlm-document-plugin] REPL manager available, will initialize in background')
        // Don't await - let REPL init happen in background
        this.replManager.initRepl(
          session.id,
          pathValidation.resolvedPath,
          sessionConfig
        ).then(info => {
          this.context.log.info('[rlm-document-plugin] REPL initialized (background)', info)
          // Update session with chunk count asynchronously
          if (info.chunkCount) {
            this.sessionStore.updateSession(session.id, {
              stats: {
                ...session.stats,
                totalChunks: info.chunkCount
              }
            }).catch(err => {
              this.context.log.warn('[rlm-document-plugin] Failed to update session with chunk count', err.message)
            })
          }
        }).catch(replError => {
          this.context.log.warn(`[rlm-document-plugin] REPL init failed (background): ${replError.message}`)
        })
        replInfo = { status: 'initializing' }
      } else {
        this.context.log.info('[rlm-document-plugin] No REPL manager available')
      }

      this.context.log.info(`[rlm-document-plugin] Created session ${session.id} for ${documentPath}`)
      return {
        session,
        repl: replInfo
      }
    } catch (error) {
      this.context.log.error('[rlm-document-plugin] Session creation failed', { error: error.message, stack: error.stack })
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
  },

  /**
   * Show native file dialog for document selection
   * @param {Object} options - Dialog options
   * @param {string} options.filter - File type filter (all, text, code, data, markup)
   * @returns {Promise<Object>} Dialog result with canceled and filePaths
   */
  async handleShowFileDialog(options = {}) {
    const { dialog } = require('electron')
    const { SUPPORTED_EXTENSIONS } = require('./lib/config')

    // Map filter types to extensions
    const filterMap = {
      all: SUPPORTED_EXTENSIONS.map(e => e.replace('.', '')),
      text: ['md', 'txt', 'rst', 'asciidoc', 'log'],
      code: ['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h'],
      data: ['json', 'yaml', 'yml', 'xml', 'toml', 'csv', 'sql', 'graphql'],
      markup: ['html', 'css', 'scss']
    }

    const selectedFilter = options.filter || 'all'
    const extensions = filterMap[selectedFilter] || filterMap.all

    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Document for Analysis',
        defaultPath: this.projectPath,
        filters: [
          { name: 'Supported Documents', extensions },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      })

      return {
        canceled: result.canceled,
        filePaths: result.filePaths || []
      }
    } catch (error) {
      this.context.log.error('[rlm-document-plugin] File dialog error:', error.message)
      return { error: error.message }
    }
  },

  /**
   * Get file statistics (size, etc.) for validation
   * @param {Object} params - Parameters
   * @param {string} params.path - File path
   * @returns {Promise<Object>} File stats
   */
  async handleGetFileStat(params = {}) {
    const { path: filePath } = params

    if (!filePath) {
      return { error: 'File path is required' }
    }

    // Validate path is within project
    const validation = validateDocumentPath(filePath, this.projectPath)
    if (!validation.isValid) {
      return { error: validation.error }
    }

    try {
      const stats = await fs.stat(validation.resolvedPath)
      return {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        modified: stats.mtime.toISOString(),
        created: stats.birthtime.toISOString()
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { error: 'File not found' }
      }
      return { error: error.message }
    }
  },

  // ==================== RLM Orchestrator Handlers ====================

  /**
   * Execute a full RLM query with iterative refinement
   * Uses Claude Code CLI for sub-LLM queries
   * @param {Object} options - Query options
   * @param {string} options.sessionId - Session ID
   * @param {string} options.query - User query
   * @param {string} options.model - Model to use (haiku, sonnet)
   * @param {number} options.maxIterations - Max refinement iterations
   * @returns {Promise<Object>} Aggregated results
   */
  async handleExecuteRlmQuery(options = {}) {
    const { sessionId, query, model, maxIterations } = options

    if (!sessionId) {
      return { error: 'Session ID is required' }
    }

    if (!query) {
      return { error: 'Query is required' }
    }

    if (!this.orchestrator) {
      return { error: 'RLM Orchestrator is not available. Please ensure Python is installed.' }
    }

    try {
      // Ensure REPL is initialized for the session
      await this.ensureReplInitialized(sessionId)

      // Initialize orchestrator session if needed
      const session = await this.sessionStore.getSession(sessionId)
      if (!session) {
        return { error: `Session not found: ${sessionId}` }
      }

      if (!this.orchestrator.getSession(sessionId)) {
        this.orchestrator.initSession(sessionId, {
          documentPath: session.documentPath,
          documentInfo: session
        })
      }

      // Execute the RLM query
      this.context.log.info(`[rlm-document-plugin] Executing RLM query: ${query.slice(0, 50)}...`)

      const results = await this.orchestrator.executeQuery(sessionId, query, {
        model: model || 'haiku',
        maxIterations: maxIterations || 3
      })

      // Store results in session
      if (results.findings && results.findings.length > 0) {
        const queryId = `qry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        await this.sessionStore.saveQueryResult(sessionId, {
          id: queryId,
          query,
          type: 'rlm',
          findings: results.findings,
          evidence: results.findings,
          summary: results.summary,
          timestamp: new Date().toISOString()
        })
      }

      return { results }

    } catch (error) {
      this.context.log.error(`[rlm-document-plugin] RLM query error: ${error.message}`)
      return { error: error.message }
    }
  },

  /**
   * Get orchestrator status for a session
   * @param {Object} options - Options with sessionId
   * @returns {Promise<Object>} Orchestrator status
   */
  async handleGetOrchestratorStatus(options = {}) {
    const { sessionId } = options

    if (!this.orchestrator) {
      return {
        available: false,
        error: 'RLM Orchestrator is not available'
      }
    }

    const status = {
      available: true,
      stats: this.orchestrator.getStats()
    }

    if (sessionId) {
      status.session = this.orchestrator.getSessionStatus(sessionId)
    }

    return status
  },

  /**
   * Configure the orchestrator
   * @param {Object} options - Configuration options
   * @param {string} options.model - Model to use (haiku, sonnet)
   * @param {number} options.maxIterations - Max iterations
   * @param {number} options.maxConcurrent - Max parallel queries
   * @returns {Promise<Object>} Updated configuration
   */
  async handleConfigureOrchestrator(options = {}) {
    if (!this.orchestrator) {
      return { error: 'RLM Orchestrator is not available' }
    }

    const { model, maxIterations, maxConcurrent } = options

    const updates = {}
    if (model && ['haiku', 'sonnet'].includes(model)) {
      updates.model = model
    }
    if (maxIterations && maxIterations > 0 && maxIterations <= 10) {
      updates.maxIterations = maxIterations
    }
    if (maxConcurrent && maxConcurrent > 0 && maxConcurrent <= 10) {
      updates.maxConcurrent = maxConcurrent
    }

    if (Object.keys(updates).length > 0) {
      this.orchestrator.configureClient(updates)
      this.context.log.info('[rlm-document-plugin] Orchestrator configured', updates)
    }

    return {
      config: this.orchestrator.getStats().config
    }
  }
}

module.exports = RlmDocumentPlugin
