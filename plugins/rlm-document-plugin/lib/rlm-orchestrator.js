/**
 * RLM Orchestrator
 *
 * Manages the recursive document analysis loop. Coordinates between:
 * - Python REPL (document chunking, search)
 * - Claude Code Client (sub-LLM queries)
 * - Session State Machine (lifecycle management)
 * - Result Aggregator (finding aggregation)
 *
 * Provides progress tracking and streaming results to the UI.
 */

const { EventEmitter } = require('events')
const { SessionStateMachine, SessionState } = require('./session-state')
const { ClaudeCodeClient, MockClaudeClient } = require('./claude-code-client')
const { ResultAggregator } = require('./result-aggregator')

/**
 * Default orchestrator configuration
 */
const DEFAULT_CONFIG = {
  // Query loop settings
  maxIterations: 3,
  chunksPerIteration: 10,

  // Claude Code settings
  model: 'haiku',
  maxConcurrent: 5,

  // Progress simulation (Microsoft style: never quite reaches 100%)
  progressSimulation: true,

  // Use mock client for testing
  useMock: false
}

/**
 * RlmOrchestrator - Controls the RLM analysis loop
 */
class RlmOrchestrator extends EventEmitter {
  /**
   * @param {Object} options - Orchestrator options
   * @param {Object} options.replManager - Python REPL manager instance
   * @param {Object} options.log - Logger instance
   * @param {Object} options.config - Configuration overrides
   */
  constructor(options = {}) {
    super()

    this.replManager = options.replManager
    this.log = options.log || console
    this.config = { ...DEFAULT_CONFIG, ...options.config }

    // Session tracking
    this.sessions = new Map()  // sessionId -> SessionStateMachine

    // Claude Code client (created lazily or with mock)
    this._claudeClient = null

    // Progress tracking
    this._progressIntervals = new Map()
  }

  /**
   * Get or create the Claude Code client
   * @returns {ClaudeCodeClient|MockClaudeClient}
   */
  getClaudeClient() {
    if (!this._claudeClient) {
      if (this.config.useMock) {
        this._claudeClient = new MockClaudeClient({
          model: this.config.model
        })
        this.log.info?.('[RlmOrchestrator] Using mock Claude client')
      } else {
        this._claudeClient = new ClaudeCodeClient({
          model: this.config.model,
          maxConcurrent: this.config.maxConcurrent
        })
        this.log.info?.('[RlmOrchestrator] Using Claude Code client')
      }

      // Forward client events
      this._claudeClient.on('query:start', data => this.emit('claude:query:start', data))
      this._claudeClient.on('query:complete', data => this.emit('claude:query:complete', data))
      this._claudeClient.on('batch:progress', data => this.emit('claude:batch:progress', data))
      this._claudeClient.on('cache:hit', data => this.emit('claude:cache:hit', data))
    }

    return this._claudeClient
  }

  /**
   * Configure the Claude Code client
   * @param {Object} config - Client configuration
   */
  configureClient(config) {
    this.config = { ...this.config, ...config }

    if (this._claudeClient) {
      this._claudeClient.configure(config)
    }
  }

  /**
   * Initialize orchestrator for a session
   * @param {string} sessionId - Session ID
   * @param {Object} options - Session options
   * @returns {SessionStateMachine}
   */
  initSession(sessionId, options = {}) {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)
    }

    const session = new SessionStateMachine(sessionId, {
      documentPath: options.documentPath,
      documentInfo: options.documentInfo
    })

    session.transition(SessionState.READY, { reason: 'Orchestrator initialized' })
    this.sessions.set(sessionId, session)

    this.log.info?.(`[RlmOrchestrator] Session initialized: ${sessionId}`)

    return session
  }

  /**
   * Get session state machine
   * @param {string} sessionId - Session ID
   * @returns {SessionStateMachine|null}
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null
  }

  /**
   * Execute an RLM query with iterative refinement
   * @param {string} sessionId - Session ID
   * @param {string} query - User query
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Aggregated results
   */
  async executeQuery(sessionId, query, options = {}) {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    if (!session.canQuery()) {
      throw new Error(`Session not ready for queries (state: ${session.state})`)
    }

    // Start query tracking
    const queryRecord = session.startQuery(query, { type: options.type || 'rlm' })
    this.log.info?.(`[RlmOrchestrator] Starting RLM query: ${query.slice(0, 50)}...`)

    // Create result aggregator
    const aggregator = new ResultAggregator({
      convergence: {
        maxIterations: options.maxIterations || this.config.maxIterations
      }
    })

    // Start progress simulation
    this._startProgressSimulation(sessionId)

    try {
      // Transition to processing state
      session.transition(SessionState.PROCESSING, { reason: 'Query processing' })

      let currentQuery = query
      let iteration = 0
      const maxIterations = options.maxIterations || this.config.maxIterations

      while (iteration < maxIterations) {
        iteration++
        session.recordIteration()

        this.emit('query:iteration:start', {
          sessionId,
          iteration,
          maxIterations,
          query: currentQuery
        })

        // Step 1: Get relevant chunks from REPL
        this.log.info?.(`[RlmOrchestrator] Iteration ${iteration}: Getting chunks for "${currentQuery.slice(0, 30)}..."`)

        const searchResults = await this.replManager.executeQuery(sessionId, currentQuery)
        const relevantChunks = searchResults?.relevantChunks || []

        session.updateProgress(0, relevantChunks.length, 'analyzing')

        this.emit('query:chunks:found', {
          sessionId,
          iteration,
          chunkCount: relevantChunks.length
        })

        if (relevantChunks.length === 0) {
          this.log.info?.(`[RlmOrchestrator] No relevant chunks found for iteration ${iteration}`)
          break
        }

        // Step 2: Get full chunk content for each relevant chunk
        const chunksWithContent = await this._getChunkContents(sessionId, relevantChunks)

        // Step 3: Analyze chunks with Claude Code
        this.log.info?.(`[RlmOrchestrator] Analyzing ${chunksWithContent.length} chunks with Claude Code`)

        const client = this.getClaudeClient()
        let analysisResults
        try {
          analysisResults = await client.queryBatch(
            chunksWithContent,
            currentQuery,
            { model: options.model || this.config.model },
            (completed, total) => {
              session.updateProgress(completed, total, 'analyzing')
              session.recordChunkProcessed()
            }
          )
          this.log.info?.(`[RlmOrchestrator] Claude Code returned ${analysisResults.length} results`)

          // Log each result for debugging
          for (const result of analysisResults) {
            this.log.debug?.(`[RlmOrchestrator] Chunk ${result.chunkIndex}: relevant=${result.relevant}, findings=${result.findings?.length || 0}, success=${result.success}`)
            if (result.error) {
              this.log.warn?.(`[RlmOrchestrator] Chunk ${result.chunkIndex} error: ${result.error}`)
            }
          }
        } catch (error) {
          this.log.error?.(`[RlmOrchestrator] Claude Code batch query failed: ${error.message}`)
          throw error
        }

        // Step 4: Add to aggregator
        const aggregationResult = aggregator.addBatch(analysisResults)

        this.emit('query:iteration:complete', {
          sessionId,
          iteration,
          newFindings: aggregationResult.newFindings,
          totalFindings: aggregationResult.totalFindings,
          converged: aggregationResult.converged
        })

        // Check for convergence
        if (aggregationResult.converged) {
          this.log.info?.(`[RlmOrchestrator] Query converged after ${iteration} iterations`)
          break
        }

        // Step 5: Get suggested follow-up for next iteration
        const followups = aggregator.getSuggestedFollowups()
        if (followups.length > 0 && iteration < maxIterations) {
          currentQuery = followups[0]
          this.log.info?.(`[RlmOrchestrator] Refining query to: ${currentQuery.slice(0, 50)}...`)
        }
      }

      // Get aggregated findings
      const aggregatedResults = aggregator.export()

      // Step 6: Synthesize findings into a coherent answer
      let results = aggregatedResults
      if (aggregatedResults.findings.length > 0) {
        this.log.info?.(`[RlmOrchestrator] Synthesizing ${aggregatedResults.findings.length} findings into summary`)

        try {
          const synthesis = await this._synthesizeFindings(query, aggregatedResults.findings, options)
          results = {
            ...aggregatedResults,
            synthesis: synthesis
          }
          this.log.info?.(`[RlmOrchestrator] Synthesis complete`)
        } catch (error) {
          this.log.warn?.(`[RlmOrchestrator] Synthesis failed, returning raw findings: ${error.message}`)
          // Continue with raw findings if synthesis fails
        }
      }

      // Stop progress simulation
      this._stopProgressSimulation(sessionId)

      // Complete the query
      session.completeQuery(results)

      this.emit('query:complete', {
        sessionId,
        queryId: queryRecord.id,
        results
      })

      this.log.info?.(`[RlmOrchestrator] Query complete: ${results.summary.totalFindings} findings`)

      return results

    } catch (error) {
      this._stopProgressSimulation(sessionId)
      session.failQuery(error)

      this.emit('query:error', {
        sessionId,
        error: error.message
      })

      throw error
    }
  }

  /**
   * Execute a simple (non-iterative) query
   * Faster, single-pass analysis for quick lookups
   * @param {string} sessionId - Session ID
   * @param {string} query - User query
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Results
   */
  async executeSimpleQuery(sessionId, query, options = {}) {
    return this.executeQuery(sessionId, query, {
      ...options,
      maxIterations: 1
    })
  }

  /**
   * Close orchestrator session
   * @param {string} sessionId - Session ID
   */
  closeSession(sessionId) {
    const session = this.sessions.get(sessionId)
    if (session) {
      this._stopProgressSimulation(sessionId)
      session.close()
      this.sessions.delete(sessionId)
      this.log.info?.(`[RlmOrchestrator] Session closed: ${sessionId}`)
    }
  }

  /**
   * Get session status
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session status
   */
  getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId)
    return session ? session.getStatus() : null
  }

  /**
   * Get orchestrator statistics
   * @returns {Object} Stats
   */
  getStats() {
    const clientStats = this._claudeClient ? this._claudeClient.getCacheStats() : null

    return {
      activeSessions: this.sessions.size,
      claudeClient: clientStats,
      config: {
        model: this.config.model,
        maxIterations: this.config.maxIterations,
        maxConcurrent: this.config.maxConcurrent,
        useMock: this.config.useMock
      }
    }
  }

  /**
   * Cleanup all sessions
   */
  async cleanup() {
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId)
    }

    if (this._claudeClient) {
      this._claudeClient.clearCache()
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Get full content for chunks
   * @private
   */
  async _getChunkContents(sessionId, relevantChunks) {
    const chunksWithContent = []

    for (const chunk of relevantChunks) {
      // If chunk already has content (from REPL preview), use it
      if (chunk.preview || chunk.content) {
        chunksWithContent.push({
          index: chunk.chunkIndex,
          id: `chunk_${chunk.chunkIndex}`,
          content: chunk.preview || chunk.content
        })
      } else {
        // Otherwise fetch from REPL
        try {
          const fullChunk = await this.replManager.getChunk(sessionId, chunk.chunkIndex)
          if (fullChunk?.chunk) {
            chunksWithContent.push({
              index: chunk.chunkIndex,
              id: fullChunk.chunk.id || `chunk_${chunk.chunkIndex}`,
              content: fullChunk.chunk.content
            })
          }
        } catch (error) {
          this.log.warn?.(`[RlmOrchestrator] Failed to get chunk ${chunk.chunkIndex}: ${error.message}`)
        }
      }
    }

    return chunksWithContent
  }

  /**
   * Synthesize findings into a coherent answer
   * @param {string} query - Original user query
   * @param {Array} findings - Extracted findings from chunks
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Synthesized answer
   * @private
   */
  async _synthesizeFindings(query, findings, options = {}) {
    const client = this.getClaudeClient()

    // Build context from findings
    const findingsText = findings
      .map((f, i) => `[${i + 1}] ${f.text}`)
      .join('\n')

    const synthesisPrompt = `Based on the following extracted findings from a document, provide a coherent answer to the user's question.

<user_question>
${query}
</user_question>

<extracted_findings>
${findingsText}
</extracted_findings>

Synthesize these findings into a clear, well-organized response that directly answers the question. Structure your response as JSON:
{
  "answer": "A comprehensive answer synthesizing the findings (2-4 paragraphs)",
  "keyPoints": ["Main point 1", "Main point 2", "Main point 3"],
  "confidence": "high" or "medium" or "low"
}

Rules:
- Combine related findings into coherent paragraphs
- Don't just list the findings - synthesize them into flowing prose
- If findings are incomplete, note what information might be missing
- Respond with ONLY the JSON, no markdown code blocks`

    const response = await client.invokeClaudeCode(synthesisPrompt, {
      model: options.model || this.config.model
    })

    this.log.info?.(`[RlmOrchestrator] Synthesis raw response: ${response?.slice(0, 200)}...`)

    // Parse the synthesis response
    const parsed = client.parseResponse(response)
    this.log.info?.(`[RlmOrchestrator] Synthesis parsed: hasAnswer=${!!parsed.answer}, keyPoints=${parsed.keyPoints?.length || 0}`)

    return parsed
  }

  /**
   * Start progress bar simulation (Microsoft style)
   * Progress loops: 0→95%, then resets to 25%→95%, etc.
   * @private
   */
  _startProgressSimulation(sessionId) {
    if (!this.config.progressSimulation) return

    let progress = 0
    let phase = 0

    const interval = setInterval(() => {
      // Simulate progress that never quite reaches 100%
      const increment = Math.random() * 5 + 1

      if (progress < 95) {
        progress = Math.min(95, progress + increment)
      } else {
        // Reset (Microsoft style: you thought you were done...)
        phase++
        progress = 25
      }

      this.emit('progress:update', {
        sessionId,
        progress: Math.round(progress),
        phase,
        simulated: true
      })
    }, 500)

    this._progressIntervals.set(sessionId, interval)
  }

  /**
   * Stop progress simulation
   * @private
   */
  _stopProgressSimulation(sessionId) {
    const interval = this._progressIntervals.get(sessionId)
    if (interval) {
      clearInterval(interval)
      this._progressIntervals.delete(sessionId)

      // Emit 100% on completion
      this.emit('progress:update', {
        sessionId,
        progress: 100,
        phase: 'complete',
        simulated: false
      })
    }
  }
}

module.exports = { RlmOrchestrator, DEFAULT_CONFIG }
