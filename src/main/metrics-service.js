/**
 * MetricsService - Centralized metrics collection for cognitive architecture instrumentation
 *
 * Provides event-based metrics tracking with batched async writes to SQLite.
 * Tracks token consumption, cost, and timing for all AI operations across:
 * - Claude Service (interactive sessions, one-shot prompts)
 * - CRE Process (plan generation, RIS generation, assertion generation)
 * - h-DSL Engine (code model queries)
 * - Memory Plugin (AI queries)
 * - Outcomes Plugin (extraction/synthesis)
 *
 * @module metrics-service
 */

const { v4: uuidv4 } = require('uuid')
const EventEmitter = require('events')

/**
 * Event types for metrics tracking
 */
const MetricEventType = {
  START: 'start',
  COMPLETE: 'complete',
  ERROR: 'error'
}

/**
 * Component identifiers for metrics tracking
 */
const MetricComponent = {
  CLAUDE_SERVICE: 'claude-service',
  CRE_PLAN: 'cre-plan',
  CRE_RIS: 'cre-ris',
  CRE_ASSERTION: 'cre-assertion',
  HDSL_ENGINE: 'hdsl-engine',
  MEMORY_PLUGIN: 'memory-plugin',
  OUTCOMES_PLUGIN: 'outcomes-plugin',
  SKILLS_SYSTEM: 'skills-system'
}

/**
 * MetricsService - Singleton service for metrics collection and persistence
 */
class MetricsService extends EventEmitter {
  /**
   * @param {Object} database - Database instance from puffin-state
   */
  constructor(database) {
    super()
    this.database = database
    this.batchQueue = []
    this.batchSize = 50
    this.flushInterval = 300000 // 5 minutes — AI operations are slow, no need for aggressive flushing
    this.flushTimer = null
    this.insertStmt = null // Legacy: writes to metrics_events (kept during transition)
    this.insertPromptStmt = null // New: writes to prompt_metrics
    this._flushing = false
    this._initializeStatements()
    this._startBatchTimer()
  }

  /**
   * Initialize prepared statements for efficient batch inserts
   * @private
   */
  _initializeStatements() {
    if (!this.database || !this.database.isInitialized()) {
      console.warn('[METRICS] Database not initialized, statements will be prepared on first write')
      return
    }

    const db = this.database.getConnection()
    if (!db) {
      console.warn('[METRICS] No database connection available')
      return
    }

    // Verify database connection is open
    if (!db.open) {
      console.warn('[METRICS] Database connection is not open, statements will be prepared later')
      return
    }

    // Legacy statement: writes to metrics_events (kept during transition)
    this.insertStmt = db.prepare(`
      INSERT INTO metrics_events (
        id, component, operation, event_type,
        session_id, branch_id, story_id, plan_id, sprint_id,
        input_tokens, output_tokens, total_tokens,
        cost_usd, turns, duration_ms,
        metadata, created_at
      ) VALUES (
        @id, @component, @operation, @event_type,
        @session_id, @branch_id, @story_id, @plan_id, @sprint_id,
        @input_tokens, @output_tokens, @total_tokens,
        @cost_usd, @turns, @duration_ms,
        @metadata, @created_at
      )
    `)

    // New statement: writes to prompt_metrics (primary going forward)
    this.insertPromptStmt = db.prepare(`
      INSERT INTO prompt_metrics (
        id, component, operation, event_type,
        session_id, branch_id, story_id, plan_id, sprint_id,
        input_tokens, output_tokens, total_tokens,
        cost_usd, turns, duration_ms,
        metadata, created_at
      ) VALUES (
        @id, @component, @operation, @event_type,
        @session_id, @branch_id, @story_id, @plan_id, @sprint_id,
        @input_tokens, @output_tokens, @total_tokens,
        @cost_usd, @turns, @duration_ms,
        @metadata, @created_at
      )
    `)
  }

  /**
   * Start the batch flush timer
   * @private
   */
  _startBatchTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }

    this.flushTimer = setInterval(() => {
      if (this.batchQueue.length > 0) {
        this._flushBatch()
      }
    }, this.flushInterval)

    // Don't prevent Node.js from exiting
    if (this.flushTimer.unref) {
      this.flushTimer.unref()
    }
  }

  /**
   * Stop the batch flush timer
   * @private
   */
  _stopBatchTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  /**
   * Flush batched metrics to database
   * @private
   */
  _flushBatch() {
    if (this.batchQueue.length === 0 || this._flushing) {
      return
    }

    this._flushing = true
    try {
      // Check if database is initialized and ready
      if (!this.database || !this.database.isInitialized()) {
        console.warn('[METRICS] Cannot flush batch: database not initialized')
        return
      }

      // Ensure statements are initialized
      if (!this.insertStmt || !this.insertPromptStmt) {
        this._initializeStatements()
      }

      if (!this.insertStmt || !this.insertPromptStmt) {
        console.error('[METRICS] Cannot flush batch: insert statements not initialized')
        return
      }

      const db = this.database.getConnection()
      if (!db) {
        console.error('[METRICS] Cannot flush batch: no database connection')
        return
      }

      // Verify database connection is open (better-sqlite3 specific check)
      if (!db.open) {
        console.error('[METRICS] Cannot flush batch: database connection is not open')
        return
      }

      // Batch insert within transaction for performance
      // Dual-write to both tables during transition period
      const insertMany = db.transaction((events) => {
        for (const event of events) {
          this.insertStmt.run(event) // Legacy: metrics_events
          this.insertPromptStmt.run(event) // New: prompt_metrics (+ story_metrics via trigger)
        }
      })

      insertMany(this.batchQueue)

      const count = this.batchQueue.length
      this.batchQueue = []

      this.emit('batch-flushed', { count })
    } catch (error) {
      console.error('[METRICS] Error flushing batch:', error.message)
      this.emit('error', { error, context: 'flush-batch' })
    } finally {
      this._flushing = false
    }
  }

  /**
   * Record a metrics event
   *
   * @param {Object} event - Event data
   * @param {string} event.component - Component identifier (use MetricComponent constants)
   * @param {string} event.operation - Operation name (e.g., 'interactive-session', 'generate-plan')
   * @param {string} event.event_type - Event type (use MetricEventType constants)
   * @param {string} [event.session_id] - Claude session ID
   * @param {string} [event.branch_id] - Git branch ID
   * @param {string} [event.story_id] - User story ID
   * @param {string} [event.plan_id] - CRE plan ID
   * @param {string} [event.sprint_id] - Sprint ID
   * @param {number} [event.input_tokens] - Input tokens consumed
   * @param {number} [event.output_tokens] - Output tokens generated
   * @param {number} [event.total_tokens] - Total tokens (input + output)
   * @param {number} [event.cost_usd] - Cost in USD
   * @param {number} [event.turns] - Number of turns in conversation
   * @param {number} [event.duration_ms] - Duration in milliseconds
   * @param {Object} [event.metadata] - Additional metadata (will be JSON stringified)
   */
  recordEvent(event) {
    try {
      const now = new Date().toISOString()
      const metricEvent = {
        id: uuidv4(),
        component: event.component,
        operation: event.operation,
        event_type: event.event_type,
        session_id: event.session_id || null,
        branch_id: event.branch_id || null,
        story_id: event.story_id || null,
        plan_id: event.plan_id || null,
        sprint_id: event.sprint_id || null,
        input_tokens: event.input_tokens ?? null,
        output_tokens: event.output_tokens ?? null,
        total_tokens: event.total_tokens ?? null,
        cost_usd: event.cost_usd ?? null,
        turns: event.turns ?? null,
        duration_ms: event.duration_ms ?? null,
        metadata: JSON.stringify(event.metadata || {}),
        created_at: now
      }

      // Add to batch queue
      this.batchQueue.push(metricEvent)

      // Emit for real-time consumers
      this.emit('event', metricEvent)

      // Flush if batch size reached
      if (this.batchQueue.length >= this.batchSize) {
        this._flushBatch()
      }
    } catch (error) {
      console.error('[METRICS] Error recording event:', error.message)
      this.emit('error', { error, context: 'record-event' })
    }
  }

  /**
   * Record a start event for an operation
   *
   * @param {string} component - Component identifier
   * @param {string} operation - Operation name
   * @param {Object} context - Context data (session_id, branch_id, story_id, etc.)
   * @param {Object} [metadata] - Additional metadata
   */
  recordStart(component, operation, context, metadata = {}) {
    this.recordEvent({
      component,
      operation,
      event_type: MetricEventType.START,
      ...context,
      metadata
    })
  }

  /**
   * Record a complete event for an operation
   *
   * @param {string} component - Component identifier
   * @param {string} operation - Operation name
   * @param {Object} context - Context data (session_id, branch_id, story_id, etc.)
   * @param {Object} metrics - Metrics data (input_tokens, output_tokens, cost_usd, duration_ms, etc.)
   * @param {Object} [metadata] - Additional metadata
   */
  recordComplete(component, operation, context, metrics, metadata = {}) {
    this.recordEvent({
      component,
      operation,
      event_type: MetricEventType.COMPLETE,
      ...context,
      ...metrics,
      metadata
    })
  }

  /**
   * Record an error event for an operation
   *
   * @param {string} component - Component identifier
   * @param {string} operation - Operation name
   * @param {Object} context - Context data (session_id, branch_id, story_id, etc.)
   * @param {Error|string} error - Error object or message
   * @param {Object} [metadata] - Additional metadata
   */
  recordError(component, operation, context, error, metadata = {}) {
    const errorData = {
      message: error.message || error,
      stack: error.stack || undefined,
      ...metadata
    }

    this.recordEvent({
      component,
      operation,
      event_type: MetricEventType.ERROR,
      ...context,
      metadata: errorData
    })
  }

  /**
   * Query metrics events with filters
   *
   * @param {Object} filters - Query filters
   * @param {string} [filters.component] - Filter by component
   * @param {string} [filters.operation] - Filter by operation
   * @param {string} [filters.event_type] - Filter by event type
   * @param {string} [filters.session_id] - Filter by session ID
   * @param {string} [filters.story_id] - Filter by story ID
   * @param {string} [filters.start_date] - Filter by start date (ISO string)
   * @param {string} [filters.end_date] - Filter by end date (ISO string)
   * @param {number} [filters.limit] - Limit results (default 1000)
   * @returns {Array<Object>} Array of metric events
   */
  queryEvents(filters = {}) {
    try {
      // Check if database is initialized before attempting flush or query
      if (!this.database || !this.database.isInitialized()) {
        console.warn('[METRICS] Cannot query: database not initialized')
        return []
      }

      // Flush pending batch before query
      this._flushBatch()

      const db = this.database.getConnection()
      if (!db) {
        console.error('[METRICS] Cannot query: no database connection')
        return []
      }

      // Verify database connection is open
      if (!db.open) {
        console.error('[METRICS] Cannot query: database connection is not open')
        return []
      }

      const conditions = []
      const params = {}

      if (filters.component) {
        conditions.push('component = @component')
        params.component = filters.component
      }
      if (filters.operation) {
        conditions.push('operation = @operation')
        params.operation = filters.operation
      }
      if (filters.event_type) {
        conditions.push('event_type = @event_type')
        params.event_type = filters.event_type
      }
      if (filters.session_id) {
        conditions.push('session_id = @session_id')
        params.session_id = filters.session_id
      }
      if (filters.story_id) {
        conditions.push('story_id = @story_id')
        params.story_id = filters.story_id
      }
      if (filters.start_date) {
        conditions.push('created_at >= @start_date')
        params.start_date = filters.start_date
      }
      if (filters.end_date) {
        conditions.push('created_at <= @end_date')
        params.end_date = filters.end_date
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 1000, 1), 10000)

      const query = `
        SELECT * FROM prompt_metrics
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `

      const stmt = db.prepare(query)
      const results = stmt.all(params)

      // Parse JSON metadata
      return results.map(row => ({
        ...row,
        metadata: JSON.parse(row.metadata || '{}')
      }))
    } catch (error) {
      console.error('[METRICS] Error querying events:', error.message)
      this.emit('error', { error, context: 'query-events' })
      return []
    }
  }

  /**
   * Get aggregated metrics for a component
   *
   * @param {string} component - Component identifier
   * @param {Object} [options] - Query options
   * @param {string} [options.start_date] - Start date filter
   * @param {string} [options.end_date] - End date filter
   * @returns {Object} Aggregated metrics
   */
  getComponentStats(component, options = {}) {
    try {
      // Check if database is initialized before attempting flush or query
      if (!this.database || !this.database.isInitialized()) {
        console.warn('[METRICS] Cannot get component stats: database not initialized')
        return null
      }

      this._flushBatch()

      const db = this.database.getConnection()
      if (!db) {
        return null
      }

      // Verify database connection is open
      if (!db.open) {
        console.error('[METRICS] Cannot get component stats: database connection is not open')
        return null
      }

      const conditions = ['component = @component', "event_type = 'complete'"]
      const params = { component }

      if (options.start_date) {
        conditions.push('created_at >= @start_date')
        params.start_date = options.start_date
      }
      if (options.end_date) {
        conditions.push('created_at <= @end_date')
        params.end_date = options.end_date
      }

      const query = `
        SELECT
          COUNT(*) as operation_count,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(cost_usd) as total_cost_usd,
          AVG(duration_ms) as avg_duration_ms,
          MAX(duration_ms) as max_duration_ms,
          MIN(duration_ms) as min_duration_ms
        FROM prompt_metrics
        WHERE ${conditions.join(' AND ')}
      `

      const stmt = db.prepare(query)
      return stmt.get(params)
    } catch (error) {
      console.error('[METRICS] Error getting component stats:', error.message)
      return null
    }
  }

  /**
   * Get story-level metrics (aggregated per story)
   *
   * @param {Object} [filters] - Query filters
   * @param {string} [filters.story_id] - Filter by story ID
   * @param {string} [filters.sprint_id] - Filter by sprint ID
   * @param {number} [filters.limit] - Limit results (default 1000)
   * @returns {Array<Object>} Array of story metrics
   */
  getStoryMetrics(filters = {}) {
    try {
      // Check if database is initialized
      if (!this.database || !this.database.isInitialized()) {
        console.warn('[METRICS] Cannot query story metrics: database not initialized')
        return []
      }

      // Flush pending batch to ensure story_metrics is up to date
      this._flushBatch()

      const db = this.database.getConnection()
      if (!db) {
        console.error('[METRICS] Cannot query story metrics: no database connection')
        return []
      }

      if (!db.open) {
        console.error('[METRICS] Cannot query story metrics: database connection is not open')
        return []
      }

      const conditions = []
      const params = {}

      if (filters.story_id) {
        conditions.push('id = @story_id')
        params.story_id = filters.story_id
      }
      if (filters.sprint_id) {
        conditions.push('sprint_id = @sprint_id')
        params.sprint_id = filters.sprint_id
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 1000, 1), 10000)

      const query = `
        SELECT * FROM story_metrics
        ${whereClause}
        ORDER BY total_cost_usd DESC
        LIMIT ${limit}
      `

      const stmt = db.prepare(query)
      return stmt.all(params)
    } catch (error) {
      console.error('[METRICS] Error querying story metrics:', error.message)
      this.emit('error', { error, context: 'query-story-metrics' })
      return []
    }
  }

  /**
   * Flush all pending metrics and cleanup
   */
  async shutdown() {
    try {
      this._stopBatchTimer()
      this._flushBatch()
      this.emit('shutdown')
    } catch (error) {
      console.error('[METRICS] Error during shutdown:', error.message)
    }
  }
}

// Singleton instance (initialized lazily when database is ready)
let metricsServiceInstance = null

/**
 * Initialize the metrics service singleton
 *
 * @param {Object} database - Database instance from puffin-state
 * @returns {MetricsService}
 */
function initializeMetricsService(database) {
  if (!metricsServiceInstance) {
    metricsServiceInstance = new MetricsService(database)
    console.log('[METRICS] Service initialized')
  }
  return metricsServiceInstance
}

/**
 * Get the metrics service singleton instance
 *
 * @returns {MetricsService|null}
 */
function getMetricsService() {
  if (!metricsServiceInstance) {
    console.warn('[METRICS] Service not initialized - call initializeMetricsService() first')
  }
  return metricsServiceInstance
}

/**
 * Shutdown and clear the metrics service singleton.
 * Safe to call multiple times.
 */
async function shutdownMetricsService() {
  if (metricsServiceInstance) {
    await metricsServiceInstance.shutdown()
    metricsServiceInstance = null
  }
}

module.exports = {
  MetricsService,
  MetricEventType,
  MetricComponent,
  initializeMetricsService,
  getMetricsService,
  shutdownMetricsService
}
