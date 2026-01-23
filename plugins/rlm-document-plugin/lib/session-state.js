/**
 * RLM Session State Machine
 *
 * Manages session lifecycle, query history, and finding aggregation.
 * Provides state transitions and history tracking for RLM analysis sessions.
 */

/**
 * Session state constants
 */
const SessionState = {
  INITIALIZING: 'initializing',
  READY: 'ready',
  QUERYING: 'querying',
  PROCESSING: 'processing',
  CLOSED: 'closed',
  ERROR: 'error'
}

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS = {
  [SessionState.INITIALIZING]: [SessionState.READY, SessionState.ERROR, SessionState.CLOSED],
  [SessionState.READY]: [SessionState.QUERYING, SessionState.CLOSED, SessionState.ERROR],
  [SessionState.QUERYING]: [SessionState.PROCESSING, SessionState.READY, SessionState.ERROR, SessionState.CLOSED],
  [SessionState.PROCESSING]: [SessionState.READY, SessionState.ERROR, SessionState.CLOSED],
  [SessionState.ERROR]: [SessionState.READY, SessionState.CLOSED],
  [SessionState.CLOSED]: []
}

/**
 * SessionStateMachine - Manages RLM session state and history
 */
class SessionStateMachine {
  /**
   * @param {string} sessionId - Unique session identifier
   * @param {Object} options - Configuration options
   */
  constructor(sessionId, options = {}) {
    this.sessionId = sessionId
    this.state = SessionState.INITIALIZING
    this.createdAt = Date.now()
    this.updatedAt = Date.now()

    // Document info
    this.documentPath = options.documentPath || null
    this.documentInfo = options.documentInfo || null

    // State history for debugging/auditing
    this.stateHistory = [{
      state: SessionState.INITIALIZING,
      timestamp: this.createdAt,
      reason: 'Session created'
    }]

    // Query tracking
    this.queryHistory = []
    this.currentQuery = null

    // Aggregated findings across all queries
    this.allFindings = []

    // Progress tracking for current operation
    this.progress = {
      current: 0,
      total: 0,
      phase: null  // 'chunking', 'analyzing', 'aggregating'
    }

    // Error tracking
    this.lastError = null
  }

  /**
   * Transition to a new state
   * @param {string} newState - Target state
   * @param {Object} metadata - Additional transition metadata
   * @returns {boolean} True if transition succeeded
   */
  transition(newState, metadata = {}) {
    const validTargets = VALID_TRANSITIONS[this.state] || []

    if (!validTargets.includes(newState)) {
      console.warn(`[SessionState] Invalid transition: ${this.state} -> ${newState}`)
      return false
    }

    const previousState = this.state
    this.state = newState
    this.updatedAt = Date.now()

    this.stateHistory.push({
      from: previousState,
      to: newState,
      timestamp: this.updatedAt,
      reason: metadata.reason || null,
      ...metadata
    })

    // Clear error on successful transition away from ERROR
    if (previousState === SessionState.ERROR && newState !== SessionState.ERROR) {
      this.lastError = null
    }

    return true
  }

  /**
   * Check if the session can accept queries
   * @returns {boolean}
   */
  canQuery() {
    return this.state === SessionState.READY
  }

  /**
   * Check if the session is in a terminal state
   * @returns {boolean}
   */
  isClosed() {
    return this.state === SessionState.CLOSED
  }

  /**
   * Start a new query
   * @param {string} query - Query text
   * @param {Object} options - Query options
   * @returns {Object} Query record
   */
  startQuery(query, options = {}) {
    if (!this.canQuery()) {
      throw new Error(`Cannot start query in state: ${this.state}`)
    }

    this.transition(SessionState.QUERYING, { reason: 'Query started' })

    this.currentQuery = {
      id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      text: query,
      type: options.type || 'query',
      startedAt: Date.now(),
      completedAt: null,
      iterations: 0,
      chunksProcessed: 0,
      findings: [],
      status: 'running',
      error: null
    }

    return this.currentQuery
  }

  /**
   * Update progress for current operation
   * @param {number} current - Current progress value
   * @param {number} total - Total items to process
   * @param {string} phase - Current phase name
   */
  updateProgress(current, total, phase = null) {
    this.progress = {
      current,
      total,
      phase: phase || this.progress.phase,
      percentage: total > 0 ? Math.round((current / total) * 100) : 0
    }
    this.updatedAt = Date.now()
  }

  /**
   * Record a finding from chunk analysis
   * @param {Object} finding - Finding object
   */
  addFinding(finding) {
    if (!this.currentQuery) {
      console.warn('[SessionState] No active query for finding')
      return
    }

    const enrichedFinding = {
      ...finding,
      queryId: this.currentQuery.id,
      timestamp: Date.now()
    }

    this.currentQuery.findings.push(enrichedFinding)
    this.allFindings.push(enrichedFinding)
  }

  /**
   * Record chunk processed
   */
  recordChunkProcessed() {
    if (this.currentQuery) {
      this.currentQuery.chunksProcessed++
    }
  }

  /**
   * Record an iteration of the query loop
   */
  recordIteration() {
    if (this.currentQuery) {
      this.currentQuery.iterations++
    }
  }

  /**
   * Complete the current query
   * @param {Object} results - Final aggregated results
   */
  completeQuery(results = {}) {
    if (!this.currentQuery) {
      console.warn('[SessionState] No active query to complete')
      return
    }

    this.currentQuery.completedAt = Date.now()
    this.currentQuery.status = 'completed'
    this.currentQuery.results = results

    // Add to history
    this.queryHistory.push({ ...this.currentQuery })

    // Clear current query
    const completedQuery = this.currentQuery
    this.currentQuery = null

    // Reset progress
    this.progress = { current: 0, total: 0, phase: null }

    // Transition back to ready
    this.transition(SessionState.READY, { reason: 'Query completed' })

    return completedQuery
  }

  /**
   * Fail the current query
   * @param {Error|string} error - Error that caused failure
   */
  failQuery(error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (this.currentQuery) {
      this.currentQuery.completedAt = Date.now()
      this.currentQuery.status = 'failed'
      this.currentQuery.error = errorMessage

      // Add to history even on failure
      this.queryHistory.push({ ...this.currentQuery })
      this.currentQuery = null
    }

    this.lastError = errorMessage
    this.progress = { current: 0, total: 0, phase: null }

    this.transition(SessionState.ERROR, { reason: errorMessage })
  }

  /**
   * Recover from error state
   */
  recover() {
    if (this.state === SessionState.ERROR) {
      this.transition(SessionState.READY, { reason: 'Recovered from error' })
      return true
    }
    return false
  }

  /**
   * Close the session
   */
  close() {
    // Cancel any active query
    if (this.currentQuery) {
      this.currentQuery.status = 'cancelled'
      this.currentQuery.completedAt = Date.now()
      this.queryHistory.push({ ...this.currentQuery })
      this.currentQuery = null
    }

    this.transition(SessionState.CLOSED, { reason: 'Session closed' })
  }

  /**
   * Get deduplicated and ranked findings
   * @returns {Array} Aggregated findings
   */
  getAggregatedFindings() {
    // Group by content similarity (simple dedup)
    const seen = new Set()
    const unique = []

    for (const finding of this.allFindings) {
      // Create a simple hash of the finding content
      const key = JSON.stringify(finding.findings || finding.point || finding)

      if (!seen.has(key)) {
        seen.add(key)
        unique.push(finding)
      }
    }

    // Sort by confidence
    const confidenceOrder = { high: 3, medium: 2, low: 1 }
    unique.sort((a, b) => {
      const aScore = confidenceOrder[a.confidence] || 0
      const bScore = confidenceOrder[b.confidence] || 0
      return bScore - aScore
    })

    return unique
  }

  /**
   * Get session status summary
   * @returns {Object} Status summary
   */
  getStatus() {
    return {
      sessionId: this.sessionId,
      state: this.state,
      documentPath: this.documentPath,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      queryCount: this.queryHistory.length,
      totalFindings: this.allFindings.length,
      currentQuery: this.currentQuery ? {
        id: this.currentQuery.id,
        text: this.currentQuery.text,
        status: this.currentQuery.status,
        chunksProcessed: this.currentQuery.chunksProcessed,
        iterations: this.currentQuery.iterations
      } : null,
      progress: this.progress,
      lastError: this.lastError
    }
  }

  /**
   * Serialize session state for persistence
   * @returns {Object} Serializable state
   */
  toJSON() {
    return {
      sessionId: this.sessionId,
      state: this.state,
      documentPath: this.documentPath,
      documentInfo: this.documentInfo,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      queryHistory: this.queryHistory,
      allFindings: this.allFindings,
      lastError: this.lastError
    }
  }

  /**
   * Restore session from serialized state
   * @param {Object} data - Serialized state
   * @returns {SessionStateMachine}
   */
  static fromJSON(data) {
    const session = new SessionStateMachine(data.sessionId, {
      documentPath: data.documentPath,
      documentInfo: data.documentInfo
    })

    session.state = data.state || SessionState.READY
    session.createdAt = data.createdAt || Date.now()
    session.updatedAt = data.updatedAt || Date.now()
    session.queryHistory = data.queryHistory || []
    session.allFindings = data.allFindings || []
    session.lastError = data.lastError || null

    return session
  }
}

module.exports = {
  SessionState,
  SessionStateMachine,
  VALID_TRANSITIONS
}
