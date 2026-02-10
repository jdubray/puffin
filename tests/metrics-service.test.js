/**
 * MetricsService Unit Tests
 *
 * Tests for the centralized metrics collection service.
 */

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')

// Inline mock for better-sqlite3 database
function createMockDatabase() {
  const insertedRows = []
  const mockStmt = {
    run: (params) => { insertedRows.push(params); return { changes: 1 } },
    all: (params) => [],
    get: (params) => null
  }

  return {
    isInitialized: () => true,
    getConnection: () => ({
      prepare: (sql) => mockStmt,
      transaction: (fn) => (...args) => fn(...args),
      exec: () => {}
    }),
    _insertedRows: insertedRows,
    _mockStmt: mockStmt
  }
}

describe('MetricsService', () => {
  let MetricsService, MetricEventType, MetricComponent
  let metricsService
  let mockDb

  beforeEach(() => {
    // Fresh require to reset singleton
    delete require.cache[require.resolve('../src/main/metrics-service')]
    const mod = require('../src/main/metrics-service')
    MetricsService = mod.MetricsService
    MetricEventType = mod.MetricEventType
    MetricComponent = mod.MetricComponent

    mockDb = createMockDatabase()
    metricsService = new MetricsService(mockDb)
  })

  afterEach(() => {
    if (metricsService) {
      metricsService.shutdown()
    }
  })

  describe('Constructor', () => {
    it('should initialize with default settings', () => {
      assert.strictEqual(metricsService.batchSize, 50)
      assert.strictEqual(metricsService.flushInterval, 300000)
      assert.deepStrictEqual(metricsService.batchQueue, [])
    })

    it('should handle missing database gracefully', () => {
      const service = new MetricsService(null)
      assert.ok(service)
      assert.strictEqual(service.insertStmt, null)
      service.shutdown()
    })

    it('should handle uninitialized database gracefully', () => {
      const uninitDb = { isInitialized: () => false, getConnection: () => null }
      const service = new MetricsService(uninitDb)
      assert.ok(service)
      assert.strictEqual(service.insertStmt, null)
      service.shutdown()
    })
  })

  describe('MetricEventType constants', () => {
    it('should define START, COMPLETE, ERROR', () => {
      assert.strictEqual(MetricEventType.START, 'start')
      assert.strictEqual(MetricEventType.COMPLETE, 'complete')
      assert.strictEqual(MetricEventType.ERROR, 'error')
    })
  })

  describe('MetricComponent constants', () => {
    it('should define all component identifiers', () => {
      assert.strictEqual(MetricComponent.CLAUDE_SERVICE, 'claude-service')
      assert.strictEqual(MetricComponent.CRE_PLAN, 'cre-plan')
      assert.strictEqual(MetricComponent.CRE_RIS, 'cre-ris')
      assert.strictEqual(MetricComponent.CRE_ASSERTION, 'cre-assertion')
      assert.strictEqual(MetricComponent.HDSL_ENGINE, 'hdsl-engine')
      assert.strictEqual(MetricComponent.MEMORY_PLUGIN, 'memory-plugin')
      assert.strictEqual(MetricComponent.OUTCOMES_PLUGIN, 'outcomes-plugin')
    })
  })

  describe('recordEvent()', () => {
    it('should add event to batch queue', () => {
      metricsService.recordEvent({
        component: 'claude-service',
        operation: 'interactive-session',
        event_type: 'start'
      })

      assert.strictEqual(metricsService.batchQueue.length, 1)
      const event = metricsService.batchQueue[0]
      assert.strictEqual(event.component, 'claude-service')
      assert.strictEqual(event.operation, 'interactive-session')
      assert.strictEqual(event.event_type, 'start')
      assert.ok(event.id) // UUID assigned
      assert.ok(event.created_at) // Timestamp assigned
    })

    it('should assign UUID and timestamp automatically', () => {
      metricsService.recordEvent({
        component: 'test',
        operation: 'test-op',
        event_type: 'start'
      })

      const event = metricsService.batchQueue[0]
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      assert.match(event.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      // ISO date format
      assert.match(event.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('should serialize metadata to JSON string', () => {
      metricsService.recordEvent({
        component: 'test',
        operation: 'test-op',
        event_type: 'complete',
        metadata: { model: 'sonnet', exitCode: 0 }
      })

      const event = metricsService.batchQueue[0]
      assert.strictEqual(typeof event.metadata, 'string')
      const parsed = JSON.parse(event.metadata)
      assert.strictEqual(parsed.model, 'sonnet')
      assert.strictEqual(parsed.exitCode, 0)
    })

    it('should default optional fields to null', () => {
      metricsService.recordEvent({
        component: 'test',
        operation: 'test-op',
        event_type: 'start'
      })

      const event = metricsService.batchQueue[0]
      assert.strictEqual(event.session_id, null)
      assert.strictEqual(event.branch_id, null)
      assert.strictEqual(event.story_id, null)
      assert.strictEqual(event.plan_id, null)
      assert.strictEqual(event.sprint_id, null)
      assert.strictEqual(event.input_tokens, null)
      assert.strictEqual(event.output_tokens, null)
      assert.strictEqual(event.total_tokens, null)
      assert.strictEqual(event.cost_usd, null)
      assert.strictEqual(event.turns, null)
      assert.strictEqual(event.duration_ms, null)
    })

    it('should emit event for real-time consumers', () => {
      let emittedEvent = null
      metricsService.on('event', (e) => { emittedEvent = e })

      metricsService.recordEvent({
        component: 'test',
        operation: 'test-op',
        event_type: 'complete',
        cost_usd: 0.05
      })

      assert.ok(emittedEvent)
      assert.strictEqual(emittedEvent.cost_usd, 0.05)
    })

    it('should flush when batch size reached', () => {
      // Set small batch size
      metricsService.batchSize = 3

      metricsService.recordEvent({ component: 'a', operation: 'op', event_type: 'start' })
      metricsService.recordEvent({ component: 'b', operation: 'op', event_type: 'start' })
      assert.strictEqual(metricsService.batchQueue.length, 2)

      // Third event should trigger flush
      metricsService.recordEvent({ component: 'c', operation: 'op', event_type: 'start' })
      assert.strictEqual(metricsService.batchQueue.length, 0)
    })
  })

  describe('recordStart()', () => {
    it('should create a start event with context and metadata', () => {
      metricsService.recordStart('claude-service', 'interactive-session',
        { session_id: 'sess-1', branch_id: 'main' },
        { model: 'opus' }
      )

      const event = metricsService.batchQueue[0]
      assert.strictEqual(event.event_type, 'start')
      assert.strictEqual(event.component, 'claude-service')
      assert.strictEqual(event.operation, 'interactive-session')
      assert.strictEqual(event.session_id, 'sess-1')
      assert.strictEqual(event.branch_id, 'main')
      assert.strictEqual(JSON.parse(event.metadata).model, 'opus')
    })
  })

  describe('recordComplete()', () => {
    it('should create a complete event with metrics data', () => {
      metricsService.recordComplete('cre-plan', 'generate-plan',
        { plan_id: 'plan-1', sprint_id: 'sprint-1' },
        { cost_usd: 0.12, duration_ms: 5000, turns: 3 },
        { itemCount: 5 }
      )

      const event = metricsService.batchQueue[0]
      assert.strictEqual(event.event_type, 'complete')
      assert.strictEqual(event.plan_id, 'plan-1')
      assert.strictEqual(event.sprint_id, 'sprint-1')
      assert.strictEqual(event.cost_usd, 0.12)
      assert.strictEqual(event.duration_ms, 5000)
      assert.strictEqual(event.turns, 3)
      assert.strictEqual(JSON.parse(event.metadata).itemCount, 5)
    })
  })

  describe('recordError()', () => {
    it('should create an error event from Error object', () => {
      const error = new Error('CLI timed out')
      metricsService.recordError('claude-service', 'one-shot-prompt',
        { session_id: 'sess-2' }, error, { timeout: 60000 }
      )

      const event = metricsService.batchQueue[0]
      assert.strictEqual(event.event_type, 'error')
      const metadata = JSON.parse(event.metadata)
      assert.strictEqual(metadata.message, 'CLI timed out')
      assert.ok(metadata.stack) // Stack trace included
      assert.strictEqual(metadata.timeout, 60000)
    })

    it('should create an error event from string', () => {
      metricsService.recordError('cre-ris', 'generate-ris',
        {}, 'AI call failed'
      )

      const event = metricsService.batchQueue[0]
      const metadata = JSON.parse(event.metadata)
      assert.strictEqual(metadata.message, 'AI call failed')
    })
  })

  describe('_flushBatch()', () => {
    it('should write all queued events to database', () => {
      metricsService.recordEvent({ component: 'a', operation: 'op1', event_type: 'start' })
      metricsService.recordEvent({ component: 'b', operation: 'op2', event_type: 'complete' })

      assert.strictEqual(metricsService.batchQueue.length, 2)
      metricsService._flushBatch()
      assert.strictEqual(metricsService.batchQueue.length, 0)
    })

    it('should emit batch-flushed event with count', () => {
      let flushedCount = null
      metricsService.on('batch-flushed', ({ count }) => { flushedCount = count })

      metricsService.recordEvent({ component: 'a', operation: 'op', event_type: 'start' })
      metricsService.recordEvent({ component: 'b', operation: 'op', event_type: 'start' })
      metricsService._flushBatch()

      assert.strictEqual(flushedCount, 2)
    })

    it('should be a no-op when queue is empty', () => {
      // Should not throw
      metricsService._flushBatch()
      assert.strictEqual(metricsService.batchQueue.length, 0)
    })
  })

  describe('queryEvents()', () => {
    it('should return empty array when no events', () => {
      const events = metricsService.queryEvents()
      assert.ok(Array.isArray(events))
    })

    it('should return empty array when database unavailable', () => {
      const service = new MetricsService({ isInitialized: () => false, getConnection: () => null })
      const events = service.queryEvents()
      assert.deepStrictEqual(events, [])
      service.shutdown()
    })
  })

  describe('getComponentStats()', () => {
    it('should return null when database unavailable', () => {
      const service = new MetricsService({ isInitialized: () => false, getConnection: () => null })
      const stats = service.getComponentStats('claude-service')
      assert.strictEqual(stats, null)
      service.shutdown()
    })
  })

  describe('shutdown()', () => {
    it('should stop the batch timer', async () => {
      assert.ok(metricsService.flushTimer !== null)
      await metricsService.shutdown()
      assert.strictEqual(metricsService.flushTimer, null)
    })

    it('should flush remaining events', async () => {
      metricsService.recordEvent({ component: 'a', operation: 'op', event_type: 'start' })
      assert.strictEqual(metricsService.batchQueue.length, 1)

      await metricsService.shutdown()
      assert.strictEqual(metricsService.batchQueue.length, 0)
    })

    it('should emit shutdown event', async () => {
      let shutdownEmitted = false
      metricsService.on('shutdown', () => { shutdownEmitted = true })
      await metricsService.shutdown()
      assert.ok(shutdownEmitted)
    })
  })

  describe('Singleton functions', () => {
    it('should initialize and return service via initializeMetricsService', () => {
      delete require.cache[require.resolve('../src/main/metrics-service')]
      const { initializeMetricsService, getMetricsService } = require('../src/main/metrics-service')

      const service = initializeMetricsService(mockDb)
      assert.strictEqual(service.constructor.name, 'MetricsService')

      const retrieved = getMetricsService()
      assert.strictEqual(retrieved, service)

      service.shutdown()
    })

    it('should return null from getMetricsService before initialization', () => {
      delete require.cache[require.resolve('../src/main/metrics-service')]
      const { getMetricsService } = require('../src/main/metrics-service')

      const service = getMetricsService()
      assert.strictEqual(service, null)
    })
  })
})
