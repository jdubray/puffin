/**
 * HistoryService Tests
 *
 * Tests for the history service that provides read-only access to Puffin history data.
 */

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const { HistoryService } = require('../../../src/main/plugins/services/history-service')

describe('HistoryService', () => {
  let historyService
  let mockPuffinState

  // Sample history data for testing
  const createSampleHistory = () => ({
    branches: {
      specifications: {
        id: 'specifications',
        name: 'Specifications',
        prompts: [
          {
            id: 'prompt-1',
            content: 'First prompt content',
            timestamp: '2024-01-15T10:00:00Z',
            parentId: null,
            response: {
              content: 'Response to first prompt',
              sessionId: 'session-123',
              cost: 0.05,
              turns: 2,
              duration: 15000,
              timestamp: '2024-01-15T10:00:30Z'
            }
          },
          {
            id: 'prompt-2',
            content: 'Second prompt content',
            timestamp: '2024-01-20T14:30:00Z',
            parentId: 'prompt-1',
            response: {
              content: 'Response to second prompt',
              sessionId: 'session-124',
              cost: 0.08,
              turns: 3,
              duration: 20000,
              timestamp: '2024-01-20T14:30:45Z'
            }
          }
        ]
      },
      ui: {
        id: 'ui',
        name: 'UI/UX',
        prompts: [
          {
            id: 'prompt-3',
            content: 'UI design prompt',
            timestamp: '2024-01-18T09:00:00Z',
            parentId: null,
            response: {
              content: 'UI design response',
              sessionId: 'session-125',
              cost: 0.12,
              turns: 4,
              duration: 30000,
              timestamp: '2024-01-18T09:01:00Z'
            }
          }
        ]
      },
      empty: {
        id: 'empty',
        name: 'Empty Branch',
        prompts: []
      }
    }
  })

  beforeEach(() => {
    mockPuffinState = {
      history: createSampleHistory()
    }

    historyService = new HistoryService({
      getPuffinState: () => mockPuffinState
    })
  })

  describe('constructor', () => {
    it('should create instance with getPuffinState function', () => {
      const service = new HistoryService({
        getPuffinState: () => mockPuffinState
      })
      assert.strictEqual(service.isAvailable(), true)
    })

    it('should create instance without options', () => {
      const service = new HistoryService()
      assert.strictEqual(service.isAvailable(), false)
    })
  })

  describe('setPuffinStateGetter', () => {
    it('should allow setting getter after construction', () => {
      const service = new HistoryService()
      assert.strictEqual(service.isAvailable(), false)

      service.setPuffinStateGetter(() => mockPuffinState)
      assert.strictEqual(service.isAvailable(), true)
    })
  })

  describe('isAvailable', () => {
    it('should return true when puffinState has history', () => {
      assert.strictEqual(historyService.isAvailable(), true)
    })

    it('should return false when getter returns null', () => {
      const service = new HistoryService({
        getPuffinState: () => null
      })
      assert.strictEqual(service.isAvailable(), false)
    })

    it('should return false when history is null', () => {
      mockPuffinState.history = null
      assert.strictEqual(historyService.isAvailable(), false)
    })

    it('should return false when no getter is set', () => {
      const service = new HistoryService()
      assert.strictEqual(service.isAvailable(), false)
    })
  })

  describe('getBranches', () => {
    it('should return all branches with summary information', async () => {
      const branches = await historyService.getBranches()

      assert.strictEqual(branches.length, 3)

      const specs = branches.find(b => b.id === 'specifications')
      assert.ok(specs)
      assert.strictEqual(specs.name, 'Specifications')
      assert.strictEqual(specs.promptCount, 2)
      assert.ok(specs.lastActivity instanceof Date)
    })

    it('should return branch with zero prompts', async () => {
      const branches = await historyService.getBranches()
      const empty = branches.find(b => b.id === 'empty')

      assert.ok(empty)
      assert.strictEqual(empty.promptCount, 0)
      assert.strictEqual(empty.lastActivity, null)
    })

    it('should return empty array when history unavailable', async () => {
      const service = new HistoryService()
      const branches = await service.getBranches()

      assert.deepStrictEqual(branches, [])
    })

    it('should handle missing branches gracefully', async () => {
      mockPuffinState.history.branches = null
      const branches = await historyService.getBranches()

      assert.deepStrictEqual(branches, [])
    })
  })

  describe('getPrompts', () => {
    it('should return prompts for a specific branch', async () => {
      const prompts = await historyService.getPrompts('specifications')

      assert.strictEqual(prompts.length, 2)
      assert.strictEqual(prompts[0].id, 'prompt-1')
      assert.strictEqual(prompts[0].branchId, 'specifications')
      assert.strictEqual(prompts[0].content, 'First prompt content')
      assert.ok(prompts[0].timestamp instanceof Date)
    })

    it('should return prompts with response data', async () => {
      const prompts = await historyService.getPrompts('specifications')

      assert.ok(prompts[0].response)
      assert.strictEqual(prompts[0].response.content, 'Response to first prompt')
      assert.strictEqual(prompts[0].response.cost, 0.05)
      assert.strictEqual(prompts[0].response.turns, 2)
      assert.strictEqual(prompts[0].response.duration, 15000)
      assert.ok(prompts[0].response.timestamp instanceof Date)
    })

    it('should return empty array for empty branch', async () => {
      const prompts = await historyService.getPrompts('empty')
      assert.deepStrictEqual(prompts, [])
    })

    it('should return empty array for non-existent branch', async () => {
      const prompts = await historyService.getPrompts('nonexistent')
      assert.deepStrictEqual(prompts, [])
    })

    it('should return empty array for invalid branch name', async () => {
      const prompts = await historyService.getPrompts(null)
      assert.deepStrictEqual(prompts, [])

      const prompts2 = await historyService.getPrompts('')
      assert.deepStrictEqual(prompts2, [])

      const prompts3 = await historyService.getPrompts(123)
      assert.deepStrictEqual(prompts3, [])
    })

    it('should return empty array when history unavailable', async () => {
      const service = new HistoryService()
      const prompts = await service.getPrompts('specifications')
      assert.deepStrictEqual(prompts, [])
    })
  })

  describe('getAllPrompts', () => {
    it('should return all prompts across all branches', async () => {
      const allPrompts = await historyService.getAllPrompts()

      assert.strictEqual(allPrompts.length, 3)
    })

    it('should include branchId in each prompt', async () => {
      const allPrompts = await historyService.getAllPrompts()

      const branchIds = allPrompts.map(p => p.branchId)
      assert.ok(branchIds.includes('specifications'))
      assert.ok(branchIds.includes('ui'))
    })

    it('should sort prompts by timestamp (most recent first)', async () => {
      const allPrompts = await historyService.getAllPrompts()

      // Verify timestamps are in descending order
      for (let i = 1; i < allPrompts.length; i++) {
        assert.ok(allPrompts[i - 1].timestamp >= allPrompts[i].timestamp)
      }
    })

    it('should return empty array when history unavailable', async () => {
      const service = new HistoryService()
      const allPrompts = await service.getAllPrompts()
      assert.deepStrictEqual(allPrompts, [])
    })
  })

  describe('getStatistics', () => {
    it('should return aggregated statistics', async () => {
      const stats = await historyService.getStatistics()

      assert.strictEqual(stats.totalBranches, 3)
      assert.strictEqual(stats.totalPrompts, 3)
      assert.strictEqual(stats.totalCost, 0.25) // 0.05 + 0.08 + 0.12
      assert.strictEqual(stats.totalTurns, 9) // 2 + 3 + 4
      assert.strictEqual(stats.totalDuration, 65000) // 15000 + 20000 + 30000
    })

    it('should return zero statistics when history unavailable', async () => {
      const service = new HistoryService()
      const stats = await service.getStatistics()

      assert.strictEqual(stats.totalBranches, 0)
      assert.strictEqual(stats.totalPrompts, 0)
      assert.strictEqual(stats.totalCost, 0)
      assert.strictEqual(stats.totalTurns, 0)
      assert.strictEqual(stats.totalDuration, 0)
    })
  })

  describe('data transformation', () => {
    it('should transform ISO date strings to Date objects', async () => {
      const prompts = await historyService.getPrompts('specifications')

      assert.ok(prompts[0].timestamp instanceof Date)
      assert.ok(prompts[0].response.timestamp instanceof Date)
    })

    it('should handle missing response gracefully', async () => {
      mockPuffinState.history.branches.specifications.prompts[0].response = null

      const prompts = await historyService.getPrompts('specifications')
      assert.strictEqual(prompts[0].response, null)
    })

    it('should handle missing optional fields', async () => {
      mockPuffinState.history.branches.specifications.prompts[0] = {
        id: 'minimal-prompt'
        // Missing content, timestamp, parentId, response
      }

      const prompts = await historyService.getPrompts('specifications')
      assert.strictEqual(prompts[0].id, 'minimal-prompt')
      assert.strictEqual(prompts[0].content, '')
      assert.strictEqual(prompts[0].parentId, null)
      assert.ok(prompts[0].timestamp instanceof Date)
    })
  })

  describe('error handling', () => {
    it('should handle errors when getting branches', async () => {
      mockPuffinState.history = {
        get branches() {
          throw new Error('Database error')
        }
      }

      const branches = await historyService.getBranches()
      assert.deepStrictEqual(branches, [])
    })
  })
})
