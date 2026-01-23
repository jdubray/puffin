/**
 * RLM Document Plugin - REPL Manager
 *
 * Manages Python REPL processes for document analysis sessions.
 * Provides JSON-RPC communication, concurrency control, and lifecycle management.
 */

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs').promises
const { EventEmitter } = require('events')
const Semaphore = require('./semaphore')
const { QUERY, REPL } = require('./config')
const { characterChunks, calculateChunkIndices } = require('./chunk-strategy')

/**
 * Generate a unique request ID
 * @returns {string} UUID-like request ID
 */
function generateRequestId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`
}

/**
 * ReplManager - Manages REPL processes for RLM sessions
 */
class ReplManager extends EventEmitter {
  /**
   * Create a new ReplManager
   * @param {Object} options - Manager options
   * @param {string} options.pythonPath - Path to Python executable
   * @param {string} options.scriptPath - Path to rlm_repl.py
   * @param {Object} options.log - Logger instance
   * @param {boolean} options.allowEval - Enable eval() method for arbitrary code execution (default: false)
   */
  constructor(options = {}) {
    super()
    this.pythonPath = options.pythonPath || 'python'
    this.scriptPath = options.scriptPath || path.join(__dirname, '..', 'scripts', 'rlm_repl.py')
    this.log = options.log || console

    // Security: eval() is disabled by default due to arbitrary code execution risk
    this.allowEval = options.allowEval === true

    // Session state
    this.processes = new Map()  // sessionId -> ProcessState
    this.pendingRequests = new Map()  // requestId -> { resolve, reject, timeout }

    // Concurrency control
    this.querySemaphore = new Semaphore(QUERY.MAX_CONCURRENT)
  }

  /**
   * Initialize a REPL for a session
   * @param {string} sessionId - Session ID
   * @param {string} documentPath - Absolute path to document
   * @param {Object} config - Session configuration
   * @returns {Promise<Object>} Initialization result
   */
  async initRepl(sessionId, documentPath, config = {}) {
    // Check if already initialized
    if (this.processes.has(sessionId)) {
      return { status: 'already_initialized', sessionId }
    }

    // Verify script exists
    try {
      await fs.access(this.scriptPath)
    } catch (error) {
      throw new Error(`REPL script not found: ${this.scriptPath}`)
    }

    // Spawn Python process
    const proc = spawn(this.pythonPath, [this.scriptPath], {
      cwd: path.dirname(documentPath),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1'
      }
    })

    // Create process state
    const state = {
      process: proc,
      sessionId,
      documentPath,
      config,
      status: 'starting',
      buffer: '',
      chunks: null,
      createdAt: new Date().toISOString()
    }

    this.processes.set(sessionId, state)

    // Set up stdout handler for JSON-RPC responses
    proc.stdout.on('data', (data) => {
      this.handleStdout(sessionId, data)
    })

    // Set up stderr handler for logging
    proc.stderr.on('data', (data) => {
      this.log.warn?.(`[repl-manager] ${sessionId} stderr: ${data.toString().trim()}`)
    })

    // Handle process exit
    proc.on('close', (code) => {
      this.handleProcessExit(sessionId, code)
    })

    proc.on('error', (error) => {
      this.log.error?.(`[repl-manager] ${sessionId} error: ${error.message}`)
      this.handleProcessExit(sessionId, -1)
    })

    // Wait for process to be ready, then initialize
    await this.waitForReady(sessionId)

    // Send init command with document path
    const initResult = await this.sendCommand(sessionId, 'init', {
      documentPath,
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap
    })

    state.status = 'ready'
    state.chunks = initResult.chunks || null

    this.emit('repl:initialized', { sessionId, documentPath })

    return {
      status: 'initialized',
      sessionId,
      documentPath,
      contentLength: initResult.contentLength,
      chunkCount: initResult.chunkCount
    }
  }

  /**
   * Wait for REPL process to be ready
   * @param {string} sessionId - Session ID
   * @param {number} timeout - Timeout in milliseconds
   */
  async waitForReady(sessionId, timeout = REPL.SPAWN_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const state = this.processes.get(sessionId)
      if (!state) {
        reject(new Error(`Session not found: ${sessionId}`))
        return
      }

      // Simple wait for process to start
      const timer = setTimeout(() => {
        reject(new Error('REPL process startup timeout'))
      }, timeout)

      // Check if process is running
      if (state.process.pid) {
        clearTimeout(timer)
        resolve()
      } else {
        state.process.once('spawn', () => {
          clearTimeout(timer)
          resolve()
        })
      }
    })
  }

  /**
   * Handle stdout data from REPL
   * @param {string} sessionId - Session ID
   * @param {Buffer} data - Raw data
   */
  handleStdout(sessionId, data) {
    const state = this.processes.get(sessionId)
    if (!state) return

    // Append to buffer
    state.buffer += data.toString('utf-8')

    // Process complete JSON-RPC messages (newline-delimited)
    const lines = state.buffer.split('\n')
    state.buffer = lines.pop() || ''  // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const message = JSON.parse(line)
        this.handleRpcResponse(message)
      } catch (error) {
        this.log.warn?.(`[repl-manager] ${sessionId} invalid JSON: ${line}`)
      }
    }
  }

  /**
   * Handle JSON-RPC response
   * @param {Object} message - Parsed JSON-RPC message
   */
  handleRpcResponse(message) {
    const { id, result, error } = message

    if (!id) {
      // Notification (no id) - log and ignore
      this.log.info?.(`[repl-manager] notification: ${JSON.stringify(message)}`)
      return
    }

    const pending = this.pendingRequests.get(id)
    if (!pending) {
      this.log.warn?.(`[repl-manager] no pending request for id: ${id}`)
      return
    }

    // Clear timeout
    if (pending.timeout) {
      clearTimeout(pending.timeout)
    }

    // Remove from pending
    this.pendingRequests.delete(id)

    // Resolve or reject
    if (error) {
      pending.reject(new Error(error.message || JSON.stringify(error)))
    } else {
      pending.resolve(result)
    }
  }

  /**
   * Handle REPL process exit
   * @param {string} sessionId - Session ID
   * @param {number} code - Exit code
   */
  handleProcessExit(sessionId, code) {
    const state = this.processes.get(sessionId)
    if (!state) return

    state.status = 'closed'
    this.log.info?.(`[repl-manager] ${sessionId} exited with code ${code}`)

    // Reject all pending requests for this session
    for (const [reqId, pending] of this.pendingRequests) {
      if (pending.sessionId === sessionId) {
        if (pending.timeout) clearTimeout(pending.timeout)
        pending.reject(new Error('REPL process exited'))
        this.pendingRequests.delete(reqId)
      }
    }

    this.emit('repl:closed', { sessionId, code })
  }

  /**
   * Send a JSON-RPC command to the REPL
   * @param {string} sessionId - Session ID
   * @param {string} method - RPC method name
   * @param {Object} params - Method parameters
   * @param {number} timeout - Request timeout
   * @returns {Promise<*>} Command result
   */
  async sendCommand(sessionId, method, params = {}, timeout = QUERY.TIMEOUT_MS) {
    const state = this.processes.get(sessionId)
    if (!state) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    if (state.status === 'closed') {
      throw new Error(`Session ${sessionId} is closed`)
    }

    const id = generateRequestId()
    const request = {
      jsonrpc: REPL.PROTOCOL_VERSION,
      id,
      method,
      params
    }

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request ${method} timed out after ${timeout}ms`))
      }, timeout)

      // Store pending request
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout: timeoutId,
        method,
        sessionId
      })

      // Send request
      const message = JSON.stringify(request) + '\n'
      state.process.stdin.write(message, 'utf-8', (error) => {
        if (error) {
          this.pendingRequests.delete(id)
          clearTimeout(timeoutId)
          reject(error)
        }
      })
    })
  }

  /**
   * Execute a query with concurrency control
   * @param {string} sessionId - Session ID
   * @param {string} query - Query text
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(sessionId, query) {
    return this.querySemaphore.withPermit(async () => {
      return this.sendCommand(sessionId, 'query', { query })
    }, QUERY.TIMEOUT_MS)
  }

  /**
   * Peek at content range
   * @param {string} sessionId - Session ID
   * @param {number} start - Start position
   * @param {number} end - End position
   * @returns {Promise<Object>} Content result
   */
  async peek(sessionId, start, end) {
    return this.sendCommand(sessionId, 'peek', { start, end })
  }

  /**
   * Search for pattern in document
   * @param {string} sessionId - Session ID
   * @param {string} pattern - Regex pattern
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async grep(sessionId, pattern, options = {}) {
    return this.sendCommand(sessionId, 'grep', {
      pattern,
      maxMatches: options.maxMatches || 10,
      contextLines: options.contextLines || 2
    })
  }

  /**
   * Get chunks for a session
   * @param {string} sessionId - Session ID
   * @param {boolean} includeContent - Include chunk content
   * @returns {Promise<Object>} Chunks result
   */
  async getChunks(sessionId, includeContent = false) {
    return this.sendCommand(sessionId, 'get_chunks', { includeContent })
  }

  /**
   * Get a specific chunk
   * @param {string} sessionId - Session ID
   * @param {number} index - Chunk index
   * @returns {Promise<Object>} Chunk content
   */
  async getChunk(sessionId, index) {
    return this.sendCommand(sessionId, 'get_chunk', { index })
  }

  /**
   * Execute arbitrary Python code (for advanced use)
   *
   * SECURITY WARNING: This method executes arbitrary Python code in the REPL context.
   * It is disabled by default and must be explicitly enabled via the `allowEval` constructor option.
   * Only enable this in trusted environments where user input is not passed to this method.
   *
   * @param {string} sessionId - Session ID
   * @param {string} code - Python code
   * @returns {Promise<Object>} Execution result
   * @throws {Error} If eval is not enabled via allowEval option
   */
  async eval(sessionId, code) {
    if (!this.allowEval) {
      throw new Error(
        'eval() is disabled for security reasons. ' +
        'To enable, pass { allowEval: true } to ReplManager constructor. ' +
        'Only enable this in trusted environments.'
      )
    }

    return this.querySemaphore.withPermit(async () => {
      return this.sendCommand(sessionId, 'eval', { code })
    }, QUERY.TIMEOUT_MS)
  }

  /**
   * Add to buffer
   * @param {string} sessionId - Session ID
   * @param {string} content - Content to add
   * @param {string} label - Optional label
   * @returns {Promise<Object>} Buffer result
   */
  async addBuffer(sessionId, content, label = null) {
    return this.sendCommand(sessionId, 'add_buffer', { content, label })
  }

  /**
   * Get buffers
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object>} Buffers
   */
  async getBuffers(sessionId) {
    return this.sendCommand(sessionId, 'get_buffers', {})
  }

  /**
   * Close a REPL session
   * @param {string} sessionId - Session ID
   */
  async closeRepl(sessionId) {
    const state = this.processes.get(sessionId)
    if (!state) return

    // Try graceful shutdown first
    try {
      await this.sendCommand(sessionId, 'shutdown', {}, 5000)
    } catch {
      // Ignore errors during shutdown
    }

    // Kill process
    if (state.process && !state.process.killed) {
      state.process.kill()
    }

    this.processes.delete(sessionId)
    this.emit('repl:closed', { sessionId, code: 0 })
  }

  /**
   * Close all REPL sessions
   */
  async closeAll() {
    const sessionIds = [...this.processes.keys()]
    await Promise.all(sessionIds.map(id => this.closeRepl(id)))

    // Drain semaphore
    this.querySemaphore.drain(new Error('ReplManager shutting down'))
  }

  /**
   * Check if a session has an active REPL
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if REPL is active
   */
  hasRepl(sessionId) {
    const state = this.processes.get(sessionId)
    return state && state.status === 'ready'
  }

  /**
   * Get REPL status for a session
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Status info or null
   */
  getReplStatus(sessionId) {
    const state = this.processes.get(sessionId)
    if (!state) return null

    return {
      sessionId,
      status: state.status,
      documentPath: state.documentPath,
      createdAt: state.createdAt,
      pid: state.process?.pid
    }
  }

  /**
   * Get stats about active REPLs
   * @returns {Object} Stats object
   */
  getStats() {
    const sessions = [...this.processes.values()]
    return {
      activeSessions: sessions.filter(s => s.status === 'ready').length,
      totalSessions: sessions.length,
      pendingRequests: this.pendingRequests.size,
      availablePermits: this.querySemaphore.getAvailable(),
      queuedRequests: this.querySemaphore.getQueueLength()
    }
  }
}

module.exports = ReplManager
