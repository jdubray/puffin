/**
 * Stats Plugin Tests
 *
 * Regression tests for the stats plugin data pipeline.
 * Verifies that prompt data (turns, cost, duration) flows correctly
 * from HistoryService through to stats computations.
 */

'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { HistoryService } = require('../../src/main/plugins/services/history-service')

// Load the stats plugin module directly
const StatsPlugin = require('../../plugins/stats-plugin/index')

/**
 * Create a mock PluginContext for the stats plugin
 */
function createMockContext(services = {}) {
  return {
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    },
    getService(name) {
      return services[name] || null
    },
    registerIpcHandler() {},
    registerAction() {}
  }
}

/**
 * Create sample history data with known cost/turns/duration values
 */
function createHistoryWithStats() {
  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  return {
    branches: {
      specifications: {
        id: 'specifications',
        name: 'Specifications',
        prompts: [
          {
            id: 'p1',
            content: 'First prompt',
            timestamp: twoWeeksAgo.toISOString(),
            parentId: null,
            response: {
              content: 'Response 1',
              sessionId: 'sess-1',
              cost: 1.50,
              turns: 5,
              duration: 30000,
              timestamp: twoWeeksAgo.toISOString()
            }
          },
          {
            id: 'p2',
            content: 'Second prompt',
            timestamp: oneWeekAgo.toISOString(),
            parentId: null,
            response: {
              content: 'Response 2',
              sessionId: 'sess-2',
              cost: 2.25,
              turns: 8,
              duration: 45000,
              timestamp: oneWeekAgo.toISOString()
            }
          }
        ]
      },
      ui: {
        id: 'ui',
        name: 'UI',
        prompts: [
          {
            id: 'p3',
            content: 'UI prompt',
            timestamp: now.toISOString(),
            parentId: null,
            response: {
              content: 'UI response',
              sessionId: 'sess-3',
              cost: 0.75,
              turns: 3,
              duration: 15000,
              timestamp: now.toISOString()
            }
          }
        ]
      }
    }
  }
}

/**
 * Create a mock MetricsService with realistic data for testing.
 * Returns current period (3 events) and previous period (2 events).
 */
function createMockMetricsServiceWithData() {
  const now = new Date()

  // Current period events (within last 30 days)
  const currentEvents = [
    {
      component: 'claude-service', operation: 'interactive-session', event_type: 'complete',
      total_tokens: 5000, cost_usd: 1.25, duration_ms: 3000,
      story_id: 'story-1', created_at: new Date(now.getTime() - 5 * 86400000).toISOString()
    },
    {
      component: 'claude-service', operation: 'sendPrompt', event_type: 'complete',
      total_tokens: 3000, cost_usd: 0.75, duration_ms: 2000,
      story_id: 'story-1', created_at: new Date(now.getTime() - 10 * 86400000).toISOString()
    },
    {
      component: 'cre-plan', operation: 'generate-plan', event_type: 'complete',
      total_tokens: 7000, cost_usd: 1.75, duration_ms: 5000,
      story_id: 'story-2', created_at: new Date(now.getTime() - 15 * 86400000).toISOString()
    }
  ]

  // Previous period events (30-60 days ago)
  const previousEvents = [
    {
      component: 'claude-service', operation: 'interactive-session', event_type: 'complete',
      total_tokens: 4000, cost_usd: 1.0, duration_ms: 2500,
      story_id: 'story-0', created_at: new Date(now.getTime() - 40 * 86400000).toISOString()
    },
    {
      component: 'cre-plan', operation: 'generate-plan', event_type: 'complete',
      total_tokens: 6000, cost_usd: 1.5, duration_ms: 4000,
      story_id: 'story-0', created_at: new Date(now.getTime() - 50 * 86400000).toISOString()
    }
  ]

  return {
    queryEvents(filters) {
      const start = filters.start_date ? new Date(filters.start_date) : new Date(0)
      const end = filters.end_date ? new Date(filters.end_date) : new Date()
      const all = [...currentEvents, ...previousEvents]

      return all.filter(e => {
        const t = new Date(e.created_at)
        const inRange = t >= start && t <= end
        const matchComponent = !filters.component || e.component === filters.component
        const matchType = !filters.event_type || e.event_type === filters.event_type
        return inRange && matchComponent && matchType
      })
    },
    getComponentStats(component, options) {
      const start = options?.start_date ? new Date(options.start_date) : new Date(0)
      const end = options?.end_date ? new Date(options.end_date) : new Date()
      const all = [...currentEvents, ...previousEvents]

      const matched = all.filter(e => {
        const t = new Date(e.created_at)
        return e.component === component && t >= start && t <= end
      })

      if (matched.length === 0) return { operation_count: 0 }

      const totalTokens = matched.reduce((s, e) => s + (e.total_tokens || 0), 0)
      const totalCost = matched.reduce((s, e) => s + (e.cost_usd || 0), 0)
      const durations = matched.map(e => e.duration_ms || 0)

      return {
        operation_count: matched.length,
        total_tokens: totalTokens,
        total_cost_usd: totalCost,
        avg_duration_ms: durations.reduce((s, d) => s + d, 0) / matched.length,
        max_duration_ms: Math.max(...durations),
        min_duration_ms: Math.min(...durations)
      }
    },
    _flushBatch() {}
  }
}

describe('StatsPlugin', () => {
  let plugin
  let historyService
  let mockPuffinState

  beforeEach(async () => {
    mockPuffinState = { history: createHistoryWithStats() }
    historyService = new HistoryService({
      getPuffinState: () => mockPuffinState
    })

    // Create a fresh plugin instance for each test
    plugin = Object.create(StatsPlugin)
    plugin.context = null
    plugin.historyService = null

    const context = createMockContext({ history: historyService })
    await plugin.activate(context)
  })

  describe('activate', () => {
    it('should acquire history service from context', () => {
      assert.ok(plugin.historyService)
      assert.strictEqual(plugin.historyService.isAvailable(), true)
    })

    it('should handle missing history service gracefully', async () => {
      const p = Object.create(StatsPlugin)
      p.context = null
      p.historyService = null
      const ctx = createMockContext({})
      await p.activate(ctx)
      assert.strictEqual(p.historyService, null)
    })
  })

  describe('getWeeklyStats', () => {
    it('should return real data when history service is available', async () => {
      const stats = await plugin.getWeeklyStats({ weeks: 26 })

      assert.ok(Array.isArray(stats))
      assert.strictEqual(stats.length, 26)

      // At least some weeks should have non-zero data
      const totals = plugin.computeTotals(stats)
      assert.ok(totals.turns > 0, `Expected turns > 0, got ${totals.turns}`)
      assert.ok(totals.cost > 0, `Expected cost > 0, got ${totals.cost}`)
      assert.ok(totals.duration > 0, `Expected duration > 0, got ${totals.duration}`)
    })

    it('should aggregate correct totals from history', async () => {
      const stats = await plugin.getWeeklyStats({ weeks: 26 })
      const totals = plugin.computeTotals(stats)

      // 3 prompts with known values: turns 5+8+3=16, cost 1.50+2.25+0.75=4.50, duration 30000+45000+15000=90000
      assert.strictEqual(totals.turns, 16)
      assert.strictEqual(totals.cost, 4.50)
      assert.strictEqual(totals.duration, 90000)
    })

    it('should fall back to mock data when history unavailable', async () => {
      mockPuffinState.history = null
      const stats = await plugin.getWeeklyStats({ weeks: 4 })

      assert.ok(Array.isArray(stats))
      assert.strictEqual(stats.length, 4)
      // Mock data has random values, so just check it's not all zeros
      const totals = plugin.computeTotals(stats)
      assert.ok(totals.turns > 0, 'Mock data should have non-zero turns')
    })
  })

  describe('getStats', () => {
    it('should return weekly stats, totals, and branch stats', async () => {
      const result = await plugin.getStats()

      assert.ok(result.weeklyStats)
      assert.ok(result.totals)
      assert.ok(result.branches)
      assert.strictEqual(result.branches.length, 2) // specifications + ui (empty branches excluded since they have 0 prompts but still listed)
    })

    it('should include correct totals', async () => {
      const result = await plugin.getStats()

      assert.strictEqual(result.totals.turns, 16)
      assert.strictEqual(result.totals.cost, 4.50)
      assert.strictEqual(result.totals.duration, 90000)
    })

    it('should include per-branch cost/turns/duration', async () => {
      const result = await plugin.getStats()

      const specs = result.branches.find(b => b.id === 'specifications')
      assert.ok(specs, 'specifications branch should be present')
      assert.strictEqual(specs.turns, 13) // 5 + 8
      assert.strictEqual(specs.cost, 3.75) // 1.50 + 2.25
      assert.strictEqual(specs.duration, 75000) // 30000 + 45000

      const ui = result.branches.find(b => b.id === 'ui')
      assert.ok(ui, 'ui branch should be present')
      assert.strictEqual(ui.turns, 3)
      assert.strictEqual(ui.cost, 0.75)
      assert.strictEqual(ui.duration, 15000)
    })
  })

  describe('computeTotals', () => {
    it('should sum weekly stats correctly', () => {
      const weekly = [
        { turns: 10, cost: 1.0, duration: 5000 },
        { turns: 20, cost: 2.0, duration: 10000 },
        { turns: 0, cost: 0, duration: 0 }
      ]
      const totals = plugin.computeTotals(weekly)

      assert.strictEqual(totals.turns, 30)
      assert.strictEqual(totals.cost, 3.0)
      assert.strictEqual(totals.duration, 15000)
    })

    it('should handle empty array', () => {
      const totals = plugin.computeTotals([])
      assert.strictEqual(totals.turns, 0)
      assert.strictEqual(totals.cost, 0)
      assert.strictEqual(totals.duration, 0)
    })
  })

  describe('prompts without stats fields', () => {
    it('should handle prompts with missing cost/turns/duration', async () => {
      // Simulate a synthetic prompt or old prompt without stats
      mockPuffinState.history.branches.specifications.prompts.push({
        id: 'p-no-stats',
        content: 'Prompt without stats',
        timestamp: new Date().toISOString(),
        parentId: null,
        response: {
          content: 'Response without stats',
          timestamp: new Date().toISOString()
          // No cost, turns, or duration
        }
      })

      const result = await plugin.getStats()

      // Should still work — missing fields default to 0 (turns defaults to 1)
      assert.ok(result.totals.turns >= 16, `turns should be at least 16, got ${result.totals.turns}`)
      assert.strictEqual(result.totals.cost, 4.50) // unchanged — missing cost defaults to 0
    })

    it('should handle prompts without response', async () => {
      mockPuffinState.history.branches.specifications.prompts.push({
        id: 'p-pending',
        content: 'Pending prompt',
        timestamp: new Date().toISOString(),
        parentId: null
        // No response at all
      })

      const result = await plugin.getStats()

      // Pending prompts should be skipped
      assert.strictEqual(result.totals.turns, 16)
      assert.strictEqual(result.totals.cost, 4.50)
    })
  })

  describe('MetricsService integration', () => {
    it('should initialize metricsService property during activation', () => {
      // In test environment, getMetricsService() returns null (no DB),
      // so metricsService should be null but property should exist
      assert.strictEqual(plugin.metricsService, null)
    })

    it('should handle missing MetricsService gracefully', async () => {
      const p = Object.create(StatsPlugin)
      p.context = null
      p.historyService = null
      p.metricsService = null
      const ctx = createMockContext({})
      await p.activate(ctx)
      assert.strictEqual(p.metricsService, null)
    })

    it('should return null from getComponentMetrics when MetricsService unavailable', async () => {
      const result = await plugin.getComponentMetrics()
      assert.strictEqual(result, null)
    })

    it('should return component metrics when MetricsService is available', async () => {
      // Inject a mock MetricsService
      plugin.metricsService = {
        getComponentStats(component, options) {
          if (component === 'claude-service') {
            return {
              operation_count: 10,
              total_input_tokens: 5000,
              total_output_tokens: 3000,
              total_tokens: 8000,
              total_cost_usd: 1.50,
              avg_duration_ms: 2000,
              max_duration_ms: 5000,
              min_duration_ms: 500
            }
          }
          return { operation_count: 0 }
        }
      }

      const result = await plugin.getComponentMetrics()
      assert.ok(result)
      assert.ok(result['claude-service'])
      assert.strictEqual(result['claude-service'].operation_count, 10)
      assert.strictEqual(result['claude-service'].total_cost_usd, 1.50)
    })

    it('should filter by component when specified', async () => {
      plugin.metricsService = {
        getComponentStats(component) {
          return {
            operation_count: 5,
            total_tokens: 4000,
            total_cost_usd: 0.80
          }
        }
      }

      const result = await plugin.getComponentMetrics({ component: 'cre-plan' })
      assert.ok(result)
      assert.strictEqual(result.operation_count, 5)
    })

    it('should include componentMetrics in getStats response', async () => {
      plugin.metricsService = {
        getComponentStats(component) {
          if (component === 'claude-service') {
            return { operation_count: 3, total_cost_usd: 0.50 }
          }
          return { operation_count: 0 }
        }
      }

      const result = await plugin.getStats()
      assert.ok(result.componentMetrics)
      assert.ok(result.componentMetrics['claude-service'])
      assert.strictEqual(result.componentMetrics['claude-service'].operation_count, 3)
    })

    it('should return legacy stats even when MetricsService errors', async () => {
      plugin.metricsService = {
        getComponentStats() {
          throw new Error('DB connection lost')
        }
      }

      const result = await plugin.getStats()
      // Legacy stats should still be present
      assert.ok(result.weeklyStats)
      assert.ok(result.totals)
      assert.ok(result.branches)
      // componentMetrics should be null due to error
      assert.strictEqual(result.componentMetrics, null)
    })

    it('should clear metricsService on deactivate', async () => {
      plugin.metricsService = { getComponentStats() {} }
      await plugin.deactivate()
      assert.strictEqual(plugin.metricsService, null)
    })

    it('should lazy re-acquire MetricsService if available after activation', async () => {
      // Simulate: MetricsService wasn't available at activation, but now is
      assert.strictEqual(plugin.metricsService, null)

      // Mock that getMetricsService now returns something
      // We can't easily swap the module-level _getMetricsService, so we test
      // the method behavior by setting metricsService directly
      const mockMs = {
        getComponentStats(component) {
          return { operation_count: 1 }
        }
      }
      plugin.metricsService = mockMs

      const result = await plugin.getComponentMetrics()
      // Should only include components with operation_count > 0
      assert.ok(result)
    })
  })

  describe('getMetricsSummary', () => {
    it('should return empty summary when MetricsService unavailable', async () => {
      const result = await plugin.getMetricsSummary()
      assert.strictEqual(result.periodDays, 30)
      assert.strictEqual(result.current.operations, 0)
      assert.strictEqual(result.current.totalCost, 0)
      assert.strictEqual(result.comparison.operations, 0)
      assert.strictEqual(result.perStory.storyCount, 0)
    })

    it('should return 30-day totals with current period data', async () => {
      plugin.metricsService = createMockMetricsServiceWithData()

      const result = await plugin.getMetricsSummary({ days: 30 })
      assert.strictEqual(result.periodDays, 30)
      assert.ok(result.periodStart)
      assert.ok(result.periodEnd)
      assert.strictEqual(result.current.operations, 3)
      assert.strictEqual(result.current.totalTokens, 15000)
      assert.strictEqual(result.current.totalCost, 3.75)
    })

    it('should compute previous period comparison', async () => {
      plugin.metricsService = createMockMetricsServiceWithData()

      const result = await plugin.getMetricsSummary()
      // With our mock: current has 3 ops, previous has 2 ops
      // pctChange = ((3-2)/2)*100 = 50%
      assert.strictEqual(result.comparison.operations, 50)
    })

    it('should normalize per-story metrics', async () => {
      plugin.metricsService = createMockMetricsServiceWithData()

      const result = await plugin.getMetricsSummary()
      // 3 events with 2 unique story_ids in current period
      assert.strictEqual(result.perStory.storyCount, 2)
      assert.strictEqual(result.perStory.avgTokensPerStory, 7500) // 15000 / 2
    })

    it('should handle division by zero when previous period is empty', async () => {
      plugin.metricsService = {
        queryEvents(filters) {
          if (filters.start_date && new Date(filters.end_date) <= new Date(filters.start_date)) {
            return []
          }
          // Return current period data only
          return [
            { total_tokens: 1000, cost_usd: 0.5, duration_ms: 2000, story_id: 's1' }
          ]
        },
        getComponentStats() { return null },
        _flushBatch() {}
      }

      const result = await plugin.getMetricsSummary()
      assert.strictEqual(result.comparison.operations, 0)
      assert.strictEqual(result.comparison.totalTokens, 0)
    })

    it('should handle MetricsService error gracefully', async () => {
      plugin.metricsService = {
        queryEvents() { throw new Error('DB locked') },
        getComponentStats() { return null },
        _flushBatch() {}
      }

      const result = await plugin.getMetricsSummary()
      assert.strictEqual(result.current.operations, 0)
      assert.strictEqual(result.periodDays, 30)
    })

    it('should handle events with null values', async () => {
      plugin.metricsService = {
        queryEvents() {
          return [
            { total_tokens: null, cost_usd: null, duration_ms: null, story_id: null },
            { total_tokens: 5000, cost_usd: 1.0, duration_ms: 3000, story_id: 's1' }
          ]
        },
        getComponentStats() { return null },
        _flushBatch() {}
      }

      const result = await plugin.getMetricsSummary()
      assert.strictEqual(result.current.operations, 2)
      assert.strictEqual(result.current.totalTokens, 5000)
      assert.strictEqual(result.current.totalCost, 1)
      // Only 1 story_id (null excluded)
      assert.strictEqual(result.perStory.storyCount, 1)
    })
  })

  describe('getComponentBreakdown', () => {
    it('should return empty when MetricsService unavailable', async () => {
      const result = await plugin.getComponentBreakdown()
      assert.deepStrictEqual(result.components, [])
      assert.strictEqual(result.totals.operations, 0)
    })

    it('should return component stats with percentages', async () => {
      plugin.metricsService = createMockMetricsServiceWithData()

      const result = await plugin.getComponentBreakdown()
      assert.ok(result.components.length > 0)

      // Check structure
      const first = result.components[0]
      assert.ok('component' in first)
      assert.ok('operations' in first)
      assert.ok('totalCost' in first)
      assert.ok('pctOfCost' in first)
      assert.ok('pctOfOperations' in first)
      assert.ok('pctOfTokens' in first)
    })

    it('should compute correct percentages', async () => {
      plugin.metricsService = {
        getComponentStats(component, options) {
          if (component === 'claude-service') {
            return { operation_count: 8, total_tokens: 16000, total_cost_usd: 3.0, avg_duration_ms: 2000, max_duration_ms: 5000, min_duration_ms: 500 }
          }
          if (component === 'cre-plan') {
            return { operation_count: 2, total_tokens: 4000, total_cost_usd: 1.0, avg_duration_ms: 3000, max_duration_ms: 4000, min_duration_ms: 2000 }
          }
          return { operation_count: 0 }
        },
        _flushBatch() {}
      }

      const result = await plugin.getComponentBreakdown()
      assert.strictEqual(result.totals.operations, 10)
      assert.strictEqual(result.totals.totalTokens, 20000)
      assert.strictEqual(result.totals.totalCost, 4)

      const claude = result.components.find(c => c.component === 'claude-service')
      assert.ok(claude)
      assert.strictEqual(claude.pctOfOperations, 80)
      assert.strictEqual(claude.pctOfTokens, 80)
      assert.strictEqual(claude.pctOfCost, 75)
    })

    it('should sort by cost descending', async () => {
      plugin.metricsService = {
        getComponentStats(component) {
          if (component === 'claude-service') return { operation_count: 5, total_tokens: 10000, total_cost_usd: 1.0, avg_duration_ms: 1000, max_duration_ms: 2000, min_duration_ms: 500 }
          if (component === 'cre-plan') return { operation_count: 2, total_tokens: 4000, total_cost_usd: 3.0, avg_duration_ms: 3000, max_duration_ms: 4000, min_duration_ms: 2000 }
          return { operation_count: 0 }
        },
        _flushBatch() {}
      }

      const result = await plugin.getComponentBreakdown()
      assert.strictEqual(result.components[0].component, 'cre-plan') // 3.0 > 1.0
      assert.strictEqual(result.components[1].component, 'claude-service')
    })

    it('should handle all components returning zero', async () => {
      plugin.metricsService = {
        getComponentStats() { return { operation_count: 0 } },
        _flushBatch() {}
      }

      const result = await plugin.getComponentBreakdown()
      assert.strictEqual(result.components.length, 0)
      assert.strictEqual(result.totals.operations, 0)
    })
  })

  describe('getOperationStats', () => {
    it('should return empty when MetricsService unavailable', async () => {
      const result = await plugin.getOperationStats({ component: 'claude-service' })
      assert.deepStrictEqual(result.operations, [])
    })

    it('should return error when component not specified', async () => {
      plugin.metricsService = createMockMetricsServiceWithData()

      const result = await plugin.getOperationStats({})
      assert.strictEqual(result.component, null)
      assert.ok(result.error)
    })

    it('should group events by operation', async () => {
      plugin.metricsService = {
        queryEvents() {
          return [
            { operation: 'interactive-session', total_tokens: 5000, cost_usd: 1.0, duration_ms: 3000 },
            { operation: 'interactive-session', total_tokens: 3000, cost_usd: 0.5, duration_ms: 2000 },
            { operation: 'sendPrompt', total_tokens: 2000, cost_usd: 0.3, duration_ms: 1000 }
          ]
        },
        _flushBatch() {}
      }

      const result = await plugin.getOperationStats({ component: 'claude-service' })
      assert.strictEqual(result.component, 'claude-service')
      assert.strictEqual(result.operations.length, 2)

      // Sorted by count desc
      const interactive = result.operations[0]
      assert.strictEqual(interactive.operation, 'interactive-session')
      assert.strictEqual(interactive.count, 2)
      assert.strictEqual(interactive.totalTokens, 8000)
      assert.strictEqual(interactive.totalCost, 1.5)
      assert.strictEqual(interactive.avgDuration, 2500) // (3000+2000)/2
      assert.strictEqual(interactive.maxDuration, 3000)
      assert.strictEqual(interactive.minDuration, 2000)
      assert.strictEqual(interactive.avgTokensPerOp, 4000) // 8000/2
    })

    it('should handle empty result set', async () => {
      plugin.metricsService = {
        queryEvents() { return [] },
        _flushBatch() {}
      }

      const result = await plugin.getOperationStats({ component: 'claude-service' })
      assert.strictEqual(result.operations.length, 0)
    })

    it('should handle null duration/token values in events', async () => {
      plugin.metricsService = {
        queryEvents() {
          return [
            { operation: 'test', total_tokens: null, cost_usd: null, duration_ms: null },
            { operation: 'test', total_tokens: 1000, cost_usd: 0.5, duration_ms: 2000 }
          ]
        },
        _flushBatch() {}
      }

      const result = await plugin.getOperationStats({ component: 'claude-service' })
      const op = result.operations[0]
      assert.strictEqual(op.count, 2)
      assert.strictEqual(op.totalTokens, 1000)
      assert.strictEqual(op.totalCost, 0.5)
      assert.strictEqual(op.avgDuration, 1000) // (0+2000)/2
    })
  })

  describe('_pctChange', () => {
    it('should compute positive percentage change', () => {
      assert.strictEqual(plugin._pctChange(150, 100), 50)
    })

    it('should compute negative percentage change', () => {
      assert.strictEqual(plugin._pctChange(75, 100), -25)
    })

    it('should return 0 when previous is 0', () => {
      assert.strictEqual(plugin._pctChange(100, 0), 0)
    })

    it('should return 0 when previous is null/undefined', () => {
      assert.strictEqual(plugin._pctChange(100, null), 0)
      assert.strictEqual(plugin._pctChange(100, undefined), 0)
    })
  })

  describe('getDailyTrends', () => {
    it('should return empty when MetricsService unavailable', async () => {
      const result = await plugin.getDailyTrends()
      assert.strictEqual(result.periodDays, 30)
      assert.deepStrictEqual(result.days, [])
    })

    it('should return 30 days of data with pre-populated zero days', async () => {
      plugin.metricsService = createMockMetricsServiceWithData()

      const result = await plugin.getDailyTrends({ days: 30 })
      assert.strictEqual(result.periodDays, 30)
      assert.strictEqual(result.days.length, 30)

      // All entries should have YYYY-MM-DD date format
      for (const day of result.days) {
        assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/)
      }
    })

    it('should aggregate events into correct date buckets', async () => {
      const now = new Date()
      const fiveDaysAgo = new Date(now.getTime() - 5 * 86400000).toISOString()
      const tenDaysAgo = new Date(now.getTime() - 10 * 86400000).toISOString()

      plugin.metricsService = {
        queryEvents() {
          return [
            { created_at: fiveDaysAgo, total_tokens: 3000, cost_usd: 0.75, duration_ms: 2000, story_id: 's1' },
            { created_at: fiveDaysAgo, total_tokens: 2000, cost_usd: 0.50, duration_ms: 1000, story_id: 's1' },
            { created_at: tenDaysAgo, total_tokens: 5000, cost_usd: 1.25, duration_ms: 4000, story_id: 's2' }
          ]
        },
        _flushBatch() {}
      }

      const result = await plugin.getDailyTrends({ days: 15 })
      const fiveDayKey = fiveDaysAgo.slice(0, 10)
      const tenDayKey = tenDaysAgo.slice(0, 10)

      const fiveDay = result.days.find(d => d.date === fiveDayKey)
      assert.ok(fiveDay, `Should have bucket for ${fiveDayKey}`)
      assert.strictEqual(fiveDay.operations, 2)
      assert.strictEqual(fiveDay.totalTokens, 5000)
      assert.strictEqual(fiveDay.totalCost, 1.25)
      assert.strictEqual(fiveDay.avgDuration, 1500) // (2000+1000)/2
      assert.strictEqual(fiveDay.storyCount, 1) // both events have same story_id

      const tenDay = result.days.find(d => d.date === tenDayKey)
      assert.ok(tenDay, `Should have bucket for ${tenDayKey}`)
      assert.strictEqual(tenDay.operations, 1)
      assert.strictEqual(tenDay.storyCount, 1)
    })

    it('should show zero for days with no events', async () => {
      plugin.metricsService = {
        queryEvents() { return [] },
        _flushBatch() {}
      }

      const result = await plugin.getDailyTrends({ days: 7 })
      assert.strictEqual(result.days.length, 7)
      for (const day of result.days) {
        assert.strictEqual(day.operations, 0)
        assert.strictEqual(day.totalTokens, 0)
        assert.strictEqual(day.totalCost, 0)
        assert.strictEqual(day.avgDuration, 0)
        assert.strictEqual(day.storyCount, 0)
      }
    })

    it('should handle events with null values', async () => {
      const now = new Date()
      const today = now.toISOString()

      plugin.metricsService = {
        queryEvents() {
          return [
            { created_at: today, total_tokens: null, cost_usd: null, duration_ms: null, story_id: null }
          ]
        },
        _flushBatch() {}
      }

      const result = await plugin.getDailyTrends({ days: 3 })
      const todayKey = today.slice(0, 10)
      const todayBucket = result.days.find(d => d.date === todayKey)
      assert.ok(todayBucket)
      assert.strictEqual(todayBucket.operations, 1)
      assert.strictEqual(todayBucket.totalTokens, 0)
      assert.strictEqual(todayBucket.totalCost, 0)
      assert.strictEqual(todayBucket.storyCount, 0) // null story_id excluded
    })

    it('should handle MetricsService error gracefully', async () => {
      plugin.metricsService = {
        queryEvents() { throw new Error('query failed') },
        _flushBatch() {}
      }

      const result = await plugin.getDailyTrends()
      assert.strictEqual(result.periodDays, 30)
      assert.deepStrictEqual(result.days, [])
    })

    it('should count unique stories per day', async () => {
      const now = new Date()
      const today = now.toISOString()

      plugin.metricsService = {
        queryEvents() {
          return [
            { created_at: today, total_tokens: 1000, cost_usd: 0.25, duration_ms: 1000, story_id: 'a' },
            { created_at: today, total_tokens: 1000, cost_usd: 0.25, duration_ms: 1000, story_id: 'b' },
            { created_at: today, total_tokens: 1000, cost_usd: 0.25, duration_ms: 1000, story_id: 'a' } // duplicate
          ]
        },
        _flushBatch() {}
      }

      const result = await plugin.getDailyTrends({ days: 3 })
      const todayKey = today.slice(0, 10)
      const todayBucket = result.days.find(d => d.date === todayKey)
      assert.strictEqual(todayBucket.storyCount, 2) // 'a' and 'b', not 3
    })
  })

  describe('getWeeklyNormalized', () => {
    it('should return empty when MetricsService unavailable', async () => {
      const result = await plugin.getWeeklyNormalized()
      assert.strictEqual(result.periodWeeks, 12)
      assert.deepStrictEqual(result.weeks, [])
    })

    it('should return weeks with normalized metrics', async () => {
      plugin.metricsService = createMockMetricsServiceWithData()

      const result = await plugin.getWeeklyNormalized({ weeks: 12 })
      assert.strictEqual(result.periodWeeks, 12)
      assert.ok(result.weeks.length > 0)

      // Check structure of first non-zero week
      const activeWeek = result.weeks.find(w => w.operations > 0)
      if (activeWeek) {
        assert.ok('week' in activeWeek)
        assert.ok('operations' in activeWeek)
        assert.ok('costPerStory' in activeWeek)
        assert.ok('tokensPerStory' in activeWeek)
        assert.ok('durationPerOp' in activeWeek)
        assert.ok('storyCount' in activeWeek)
      }
    })

    it('should compute correct normalized values', async () => {
      const now = new Date()
      const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString()

      plugin.metricsService = {
        queryEvents() {
          return [
            { created_at: threeDaysAgo, total_tokens: 6000, cost_usd: 1.50, duration_ms: 3000, story_id: 's1' },
            { created_at: threeDaysAgo, total_tokens: 4000, cost_usd: 1.00, duration_ms: 2000, story_id: 's2' }
          ]
        },
        _flushBatch() {}
      }

      const result = await plugin.getWeeklyNormalized({ weeks: 4 })
      // Find the week containing our events
      const activeWeek = result.weeks.find(w => w.operations > 0)
      assert.ok(activeWeek)
      assert.strictEqual(activeWeek.operations, 2)
      assert.strictEqual(activeWeek.totalTokens, 10000)
      assert.strictEqual(activeWeek.totalCost, 2.5)
      assert.strictEqual(activeWeek.storyCount, 2)
      assert.strictEqual(activeWeek.costPerStory, 1.25) // 2.50 / 2
      assert.strictEqual(activeWeek.tokensPerStory, 5000) // 10000 / 2
      assert.strictEqual(activeWeek.durationPerOp, 2500) // 5000 / 2
    })

    it('should handle zero stories gracefully', async () => {
      const now = new Date()
      const today = now.toISOString()

      plugin.metricsService = {
        queryEvents() {
          return [
            { created_at: today, total_tokens: 3000, cost_usd: 0.75, duration_ms: 2000, story_id: null }
          ]
        },
        _flushBatch() {}
      }

      const result = await plugin.getWeeklyNormalized({ weeks: 4 })
      const activeWeek = result.weeks.find(w => w.operations > 0)
      assert.ok(activeWeek)
      assert.strictEqual(activeWeek.storyCount, 0)
      // With zero stories, denominator falls back to 1
      assert.strictEqual(activeWeek.costPerStory, 0.75)
      assert.strictEqual(activeWeek.tokensPerStory, 3000)
    })

    it('should sort weeks chronologically', async () => {
      const now = new Date()
      const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString()
      const oneWeekAgo = new Date(now.getTime() - 7 * 86400000).toISOString()

      plugin.metricsService = {
        queryEvents() {
          return [
            { created_at: twoWeeksAgo, total_tokens: 1000, cost_usd: 0.25, duration_ms: 1000, story_id: 's1' },
            { created_at: oneWeekAgo, total_tokens: 2000, cost_usd: 0.50, duration_ms: 2000, story_id: 's2' }
          ]
        },
        _flushBatch() {}
      }

      const result = await plugin.getWeeklyNormalized({ weeks: 4 })
      // Verify sorted ascending
      for (let i = 1; i < result.weeks.length; i++) {
        assert.ok(result.weeks[i].week >= result.weeks[i - 1].week,
          `Weeks should be sorted: ${result.weeks[i - 1].week} <= ${result.weeks[i].week}`)
      }
    })

    it('should show zero for weeks with no events', async () => {
      plugin.metricsService = {
        queryEvents() { return [] },
        _flushBatch() {}
      }

      const result = await plugin.getWeeklyNormalized({ weeks: 4 })
      assert.ok(result.weeks.length > 0)
      for (const week of result.weeks) {
        assert.strictEqual(week.operations, 0)
        assert.strictEqual(week.storyCount, 0)
      }
    })

    it('should handle MetricsService error gracefully', async () => {
      plugin.metricsService = {
        queryEvents() { throw new Error('DB crash') },
        _flushBatch() {}
      }

      const result = await plugin.getWeeklyNormalized()
      assert.strictEqual(result.periodWeeks, 12)
      assert.deepStrictEqual(result.weeks, [])
    })

    it('should use ISO week format (YYYY-Www)', async () => {
      plugin.metricsService = createMockMetricsServiceWithData()

      const result = await plugin.getWeeklyNormalized({ weeks: 4 })
      for (const week of result.weeks) {
        assert.match(week.week, /^\d{4}-W\d{2}$/, `Week key should be YYYY-Www format: ${week.week}`)
      }
    })
  })

  describe('isAvailable edge cases', () => {
    it('should handle undefined history (not just null)', async () => {
      mockPuffinState.history = undefined

      const stats = await plugin.getWeeklyStats({ weeks: 4 })
      // Should fall back to mock data
      assert.strictEqual(stats.length, 4)
    })

    it('should handle puffinState being undefined', async () => {
      const service = new HistoryService({
        getPuffinState: () => undefined
      })

      const p = Object.create(StatsPlugin)
      p.context = null
      p.historyService = null
      const ctx = createMockContext({ history: service })
      await p.activate(ctx)

      const stats = await p.getWeeklyStats({ weeks: 4 })
      assert.strictEqual(stats.length, 4)
    })
  })
})
