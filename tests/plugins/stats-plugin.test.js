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
