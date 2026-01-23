/**
 * Claude Code Client
 *
 * Invokes Claude Code CLI as a subprocess for sub-LLM queries.
 * Uses --print mode for non-interactive, single-response queries.
 *
 * Benefits:
 * - No API key required (uses Claude Code subscription)
 * - Consistent with user's existing Claude Code setup
 * - Can specify model (haiku for speed/cost, sonnet for quality)
 */

const { spawn } = require('child_process')
const { EventEmitter } = require('events')
const crypto = require('crypto')

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  claudePath: 'claude',       // Assumes claude is in PATH
  model: 'haiku',             // Default to haiku for speed/cost
  timeout: 30000,             // 30s timeout per query
  maxConcurrent: 5,           // Max parallel queries
  maxTokens: 1024,            // Max tokens per response
  cacheEnabled: true,         // Enable response caching
  cacheTTL: 3600000           // Cache TTL: 1 hour
}

/**
 * ClaudeCodeClient - Delegates LLM queries to Claude Code CLI
 */
class ClaudeCodeClient extends EventEmitter {
  /**
   * @param {Object} options - Client options
   * @param {string} options.claudePath - Path to claude CLI
   * @param {string} options.model - Model to use (haiku, sonnet)
   * @param {number} options.timeout - Query timeout in ms
   * @param {number} options.maxConcurrent - Max parallel queries
   * @param {boolean} options.cacheEnabled - Enable response caching
   */
  constructor(options = {}) {
    super()

    this.config = { ...DEFAULT_CONFIG, ...options }
    this._activeQueries = 0
    this._queryQueue = []
    this._cache = new Map()
    this._cacheStats = { hits: 0, misses: 0 }
  }

  /**
   * Query Claude Code with a chunk of context
   * @param {string} context - Document chunk content
   * @param {string} question - Analysis question
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Parsed findings
   */
  async query(context, question, options = {}) {
    const model = options.model || this.config.model
    const maxTokens = options.maxTokens || this.config.maxTokens

    // Check cache first
    if (this.config.cacheEnabled) {
      const cacheKey = this._getCacheKey(context, question, model)
      const cached = this._getFromCache(cacheKey)
      if (cached) {
        this._cacheStats.hits++
        this.emit('cache:hit', { question: question.slice(0, 50) })
        return cached
      }
      this._cacheStats.misses++
    }

    // Wait if at concurrency limit
    while (this._activeQueries >= this.config.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    this._activeQueries++
    this.emit('query:start', { activeQueries: this._activeQueries })

    try {
      const prompt = this.buildPrompt(context, question)
      let response
      try {
        response = await this.invokeClaudeCode(prompt, { model, maxTokens })
      } catch (invokeError) {
        console.error('[ClaudeCodeClient] invokeClaudeCode failed:', invokeError.message)
        throw invokeError
      }

      console.log('[ClaudeCodeClient] Raw response length:', response?.length || 0)
      console.log('[ClaudeCodeClient] Raw response preview:', response?.slice(0, 200))

      const result = this.parseResponse(response)
      console.log('[ClaudeCodeClient] Parsed result:', JSON.stringify(result, null, 2).slice(0, 300))

      // Cache the result
      if (this.config.cacheEnabled) {
        const cacheKey = this._getCacheKey(context, question, model)
        this._setCache(cacheKey, result)
      }

      return result
    } finally {
      this._activeQueries--
      this.emit('query:complete', { activeQueries: this._activeQueries })
    }
  }

  /**
   * Invoke Claude Code CLI
   * @param {string} prompt - Full prompt to send
   * @param {Object} options - Invocation options
   * @returns {Promise<string>} Raw response text
   */
  async invokeClaudeCode(prompt, options = {}) {
    const model = options.model || this.config.model

    return new Promise((resolve, reject) => {
      // Note: Claude Code CLI doesn't support --max-tokens flag
      // Response length is controlled by the prompt itself
      const args = [
        '--print',                          // Non-interactive, single response
        '--model', model
      ]

      const proc = spawn(this.config.claudePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false

      // Set up timeout
      const timeoutId = setTimeout(() => {
        timedOut = true
        proc.kill('SIGTERM')
      }, this.config.timeout)

      proc.stdout.on('data', data => {
        stdout += data.toString()
      })

      proc.stderr.on('data', data => {
        stderr += data.toString()
      })

      proc.on('close', code => {
        clearTimeout(timeoutId)

        console.log(`[ClaudeCodeClient] Process closed with code ${code}`)
        console.log(`[ClaudeCodeClient] stdout length: ${stdout.length}, stderr length: ${stderr.length}`)
        if (stderr) {
          console.log(`[ClaudeCodeClient] stderr: ${stderr.slice(0, 500)}`)
        }

        if (timedOut) {
          reject(new Error(`Claude Code query timed out after ${this.config.timeout}ms`))
          return
        }

        if (code === 0) {
          resolve(stdout.trim())
        } else {
          // Check for common errors
          if (stderr.includes('not found') || stderr.includes('command not found')) {
            reject(new Error('Claude Code CLI not found. Please ensure "claude" is installed and in PATH.'))
          } else if (stderr.includes('rate limit')) {
            reject(new Error('Claude Code rate limit reached. Please wait before retrying.'))
          } else {
            reject(new Error(`Claude Code exited with code ${code}: ${stderr || 'Unknown error'}`))
          }
        }
      })

      proc.on('error', err => {
        clearTimeout(timeoutId)
        if (err.code === 'ENOENT') {
          reject(new Error('Claude Code CLI not found. Please ensure "claude" is installed and in PATH.'))
        } else {
          reject(err)
        }
      })

      // Send prompt via stdin
      proc.stdin.write(prompt)
      proc.stdin.end()
    })
  }

  /**
   * Build the sub-LLM prompt for chunk analysis
   * @param {string} context - Document chunk content
   * @param {string} question - Analysis question
   * @returns {string} Formatted prompt
   */
  buildPrompt(context, question) {
    return `You are extracting relevant information from a document chunk.

<document_chunk>
${context}
</document_chunk>

<user_question>
${question}
</user_question>

Extract key information from this chunk. Respond with ONLY a JSON object:
{
  "relevant": true or false,
  "findings": ["key point 1", "key point 2"],
  "confidence": "high" or "medium" or "low",
  "keyTerms": ["important", "terms"],
  "suggestedFollowup": "follow-up query if needed"
}

IMPORTANT:
- Set "relevant" to TRUE if the chunk contains ANY useful information, concepts, or context related to the question - even if it doesn't directly answer it
- Extract 1-3 key points that summarize what this chunk is about
- Include findings about the main topics, concepts, or facts in the chunk
- Be generous with relevance - if there's potentially useful information, mark it relevant
- Only set "relevant" to false if the chunk is completely unrelated (e.g., table of contents, blank, or off-topic)
- Respond with ONLY the JSON, no markdown code blocks`
  }

  /**
   * Parse Claude's response into structured findings
   * @param {string} response - Raw response text
   * @returns {Object} Parsed findings object
   */
  parseResponse(response) {
    // Strip markdown code blocks if present (```json ... ```)
    let cleanResponse = response.trim()
    if (cleanResponse.startsWith('```')) {
      // Remove opening ```json or ``` and closing ```
      cleanResponse = cleanResponse
        .replace(/^```(?:json)?\s*\n?/, '')
        .replace(/\n?```\s*$/, '')
        .trim()
    }

    // Try to extract JSON from response
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])

        // Check if this is a synthesis response (has 'answer' field)
        if (parsed.answer !== undefined) {
          return {
            answer: parsed.answer,
            keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
            confidence: ['high', 'medium', 'low'].includes(parsed.confidence)
              ? parsed.confidence
              : 'medium',
            // Include any other fields
            ...parsed
          }
        }

        // Otherwise, treat as chunk analysis response
        return {
          relevant: Boolean(parsed.relevant),
          findings: Array.isArray(parsed.findings) ? parsed.findings : [],
          confidence: ['high', 'medium', 'low'].includes(parsed.confidence)
            ? parsed.confidence
            : 'medium',
          keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : [],
          suggestedFollowup: parsed.suggestedFollowup || null
        }
      } catch (e) {
        // Fall through to text parsing
      }
    }

    // Fallback: treat entire response as a finding
    return {
      relevant: true,
      findings: [response.trim().slice(0, 500)],
      confidence: 'medium',
      keyTerms: [],
      suggestedFollowup: null
    }
  }

  /**
   * Batch query multiple chunks with progress tracking
   * @param {Array<Object>} chunks - Chunks to analyze
   * @param {string} question - Analysis question
   * @param {Object} options - Query options
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Array<Object>>} Results for each chunk
   */
  async queryBatch(chunks, question, options = {}, onProgress = null) {
    const results = []
    const total = chunks.length
    let completed = 0

    // Process in parallel with concurrency limit
    const processChunk = async (chunk, index) => {
      try {
        const result = await this.query(chunk.content, question, options)
        results[index] = {
          chunkIndex: chunk.index,
          chunkId: chunk.id,
          success: true,
          ...result
        }
      } catch (error) {
        results[index] = {
          chunkIndex: chunk.index,
          chunkId: chunk.id,
          success: false,
          error: error.message,
          relevant: false,
          findings: [],
          confidence: 'low'
        }
      }

      completed++
      if (onProgress) {
        onProgress(completed, total)
      }
      this.emit('batch:progress', { completed, total, percentage: Math.round((completed / total) * 100) })
    }

    // Start all queries (concurrency is handled in query())
    await Promise.all(chunks.map((chunk, i) => processChunk(chunk, i)))

    return results
  }

  /**
   * Check if Claude Code CLI is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const result = await this.invokeClaudeCode('Say "ok"', {
        model: 'haiku',
        maxTokens: 10
      })
      return result.toLowerCase().includes('ok')
    } catch (error) {
      return false
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      ...this._cacheStats,
      size: this._cache.size,
      hitRate: this._cacheStats.hits + this._cacheStats.misses > 0
        ? (this._cacheStats.hits / (this._cacheStats.hits + this._cacheStats.misses) * 100).toFixed(1) + '%'
        : '0%'
    }
  }

  /**
   * Clear the response cache
   */
  clearCache() {
    this._cache.clear()
    this._cacheStats = { hits: 0, misses: 0 }
  }

  /**
   * Update configuration
   * @param {Object} updates - Config updates
   */
  configure(updates) {
    this.config = { ...this.config, ...updates }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Generate cache key from query parameters
   * @private
   */
  _getCacheKey(context, question, model) {
    const hash = crypto.createHash('md5')
      .update(context + '|' + question + '|' + model)
      .digest('hex')
    return hash
  }

  /**
   * Get item from cache if not expired
   * @private
   */
  _getFromCache(key) {
    const entry = this._cache.get(key)
    if (!entry) return null

    if (Date.now() - entry.timestamp > this.config.cacheTTL) {
      this._cache.delete(key)
      return null
    }

    return entry.value
  }

  /**
   * Set item in cache
   * @private
   */
  _setCache(key, value) {
    this._cache.set(key, {
      value,
      timestamp: Date.now()
    })

    // Limit cache size (LRU-ish)
    if (this._cache.size > 1000) {
      const firstKey = this._cache.keys().next().value
      this._cache.delete(firstKey)
    }
  }
}

/**
 * MockClaudeClient - For testing without Claude Code
 */
class MockClaudeClient extends EventEmitter {
  constructor(options = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...options }
    this._delay = options.mockDelay || 100
  }

  async query(context, question, options = {}) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, this._delay))

    // Simple keyword-based mock response
    const keywords = question.toLowerCase().split(/\s+/).filter(k => k.length > 3)
    const contextLower = context.toLowerCase()
    const matches = keywords.filter(k => contextLower.includes(k))

    return {
      relevant: matches.length > 0,
      findings: matches.length > 0
        ? [`Found ${matches.length} keyword matches: ${matches.join(', ')}`]
        : [],
      confidence: matches.length > 2 ? 'high' : matches.length > 0 ? 'medium' : 'low',
      keyTerms: matches,
      suggestedFollowup: null
    }
  }

  async queryBatch(chunks, question, options = {}, onProgress = null) {
    const results = []
    for (let i = 0; i < chunks.length; i++) {
      const result = await this.query(chunks[i].content, question, options)
      results.push({
        chunkIndex: chunks[i].index,
        chunkId: chunks[i].id,
        success: true,
        ...result
      })

      if (onProgress) {
        onProgress(i + 1, chunks.length)
      }
    }
    return results
  }

  async isAvailable() {
    return true
  }

  getCacheStats() {
    return { hits: 0, misses: 0, size: 0, hitRate: '0%' }
  }

  clearCache() {}

  configure(updates) {
    this.config = { ...this.config, ...updates }
  }
}

module.exports = {
  ClaudeCodeClient,
  MockClaudeClient,
  DEFAULT_CONFIG
}
