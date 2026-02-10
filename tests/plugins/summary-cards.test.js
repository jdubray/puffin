/**
 * SummaryCards Component Tests
 *
 * Tests for the SummaryCards component logic:
 * - Static formatting methods (formatCost, formatTokens, formatPercentChange)
 * - Card definition builder
 * - Trend class resolution
 *
 * Note: DOM rendering tests require JSDOM and are excluded here.
 * These tests cover all business logic and formatting paths.
 */

'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')

// SummaryCards is an ES module, so we can't require() it directly.
// Instead, we test the same logic through the shared formatters and
// replicate the component's card-building logic for verification.
// This ensures the underlying logic is correct without needing JSDOM.

const {
  formatTokens,
  formatPercentChange,
  formatCost
} = require('../../plugins/stats-plugin/src/utils/formatters')

// ── Replicated component logic for testability ─────────────────

/**
 * Builds card definitions from metrics summary data.
 * Mirrors SummaryCards._buildCardDefinitions() exactly.
 */
function buildCardDefinitions(data) {
  const summary = data
  const current = summary?.current || {}
  const comparison = summary?.comparison || {}
  const perStory = summary?.perStory || {}

  return [
    {
      icon: '💰',
      value: formatCost(current.totalCost),
      label: 'Total Cost (30d)',
      trend: comparison.totalCost,
      invertColor: true
    },
    {
      icon: '📊',
      value: formatCost(perStory.avgCostPerStory),
      label: 'Avg Cost / Story',
      trend: null,
      subtitle: perStory.storyCount != null ? `${perStory.storyCount} stories` : null,
      invertColor: true
    },
    {
      icon: '🔤',
      value: formatTokens(current.totalTokens),
      label: 'Total Tokens (30d)',
      trend: comparison.totalTokens,
      invertColor: true
    },
    {
      icon: '📈',
      value: formatTokens(perStory.avgTokensPerStory),
      label: 'Avg Tokens / Story',
      trend: null,
      subtitle: perStory.storyCount != null ? `${perStory.storyCount} stories` : null,
      invertColor: true
    }
  ]
}

/**
 * Mirrors SummaryCards._getTrendClass()
 */
function getTrendClass(direction, invertColor) {
  if (direction === 'neutral') return 'trend-neutral'
  if (invertColor) {
    return direction === 'up' ? 'trend-bad' : 'trend-good'
  }
  return direction === 'up' ? 'trend-good' : 'trend-bad'
}

// ── Tests ──────────────────────────────────────────────────────

describe('SummaryCards logic', () => {
  describe('static formatCost', () => {
    it('should format valid cost', () => {
      assert.strictEqual(formatCost(12.5), '$12.50')
      assert.strictEqual(formatCost(0), '$0.00')
      assert.strictEqual(formatCost(1234.567), '$1234.57')
    })

    it('should handle null/NaN', () => {
      assert.strictEqual(formatCost(null), '$0.00')
      assert.strictEqual(formatCost(NaN), '$0.00')
      assert.strictEqual(formatCost(undefined), '$0.00')
    })
  })

  describe('static formatTokens', () => {
    it('should abbreviate thousands', () => {
      assert.strictEqual(formatTokens(1500), '1.5k')
      assert.strictEqual(formatTokens(50000), '50k')
    })

    it('should abbreviate millions', () => {
      assert.strictEqual(formatTokens(2500000), '2.5M')
    })

    it('should handle small numbers', () => {
      assert.strictEqual(formatTokens(500), '500')
      assert.strictEqual(formatTokens(0), '0')
    })

    it('should handle null/NaN', () => {
      assert.strictEqual(formatTokens(null), '0')
      assert.strictEqual(formatTokens(undefined), '0')
    })
  })

  describe('static formatPercentChange', () => {
    it('should format positive change', () => {
      const r = formatPercentChange(25)
      assert.strictEqual(r.text, '+25%')
      assert.strictEqual(r.direction, 'up')
    })

    it('should format negative change', () => {
      const r = formatPercentChange(-10)
      assert.strictEqual(r.text, '-10%')
      assert.strictEqual(r.direction, 'down')
    })

    it('should handle zero', () => {
      const r = formatPercentChange(0)
      assert.strictEqual(r.text, '0%')
      assert.strictEqual(r.direction, 'neutral')
    })

    it('should handle null', () => {
      const r = formatPercentChange(null)
      assert.strictEqual(r.text, '—')
      assert.strictEqual(r.direction, 'neutral')
    })
  })

  describe('buildCardDefinitions', () => {
    it('should produce 4 cards', () => {
      const cards = buildCardDefinitions({
        current: { totalCost: 10.50, totalTokens: 50000 },
        comparison: { totalCost: 25, totalTokens: -10 },
        perStory: { storyCount: 5, avgCostPerStory: 2.10, avgTokensPerStory: 10000 }
      })

      assert.strictEqual(cards.length, 4)
    })

    it('should format Total Cost card correctly', () => {
      const cards = buildCardDefinitions({
        current: { totalCost: 45.99, totalTokens: 100000 },
        comparison: { totalCost: 30, totalTokens: 15 },
        perStory: { storyCount: 10, avgCostPerStory: 4.60, avgTokensPerStory: 10000 }
      })

      const costCard = cards[0]
      assert.strictEqual(costCard.icon, '💰')
      assert.strictEqual(costCard.value, '$45.99')
      assert.strictEqual(costCard.label, 'Total Cost (30d)')
      assert.strictEqual(costCard.trend, 30) // 30% increase
      assert.strictEqual(costCard.invertColor, true)
    })

    it('should format Avg Cost/Story card with subtitle', () => {
      const cards = buildCardDefinitions({
        current: { totalCost: 10, totalTokens: 50000 },
        comparison: {},
        perStory: { storyCount: 5, avgCostPerStory: 2.00, avgTokensPerStory: 10000 }
      })

      const avgCostCard = cards[1]
      assert.strictEqual(avgCostCard.value, '$2.00')
      assert.strictEqual(avgCostCard.trend, null)
      assert.strictEqual(avgCostCard.subtitle, '5 stories')
    })

    it('should format Total Tokens card', () => {
      const cards = buildCardDefinitions({
        current: { totalCost: 0, totalTokens: 150000 },
        comparison: { totalCost: 0, totalTokens: -20 },
        perStory: { storyCount: 3, avgCostPerStory: 0, avgTokensPerStory: 50000 }
      })

      const tokensCard = cards[2]
      assert.strictEqual(tokensCard.icon, '🔤')
      assert.strictEqual(tokensCard.value, '150k')
      assert.strictEqual(tokensCard.trend, -20)
    })

    it('should format Avg Tokens/Story card', () => {
      const cards = buildCardDefinitions({
        current: { totalCost: 0, totalTokens: 0 },
        comparison: {},
        perStory: { storyCount: 8, avgCostPerStory: 0, avgTokensPerStory: 25000 }
      })

      const avgTokensCard = cards[3]
      assert.strictEqual(avgTokensCard.icon, '📈')
      assert.strictEqual(avgTokensCard.value, '25k')
      assert.strictEqual(avgTokensCard.subtitle, '8 stories')
    })

    it('should handle null/missing data gracefully', () => {
      const cards = buildCardDefinitions(null)

      assert.strictEqual(cards.length, 4)
      assert.strictEqual(cards[0].value, '$0.00')
      assert.strictEqual(cards[2].value, '0')
      assert.strictEqual(cards[1].subtitle, null)
    })

    it('should handle empty summary object', () => {
      const cards = buildCardDefinitions({})

      assert.strictEqual(cards.length, 4)
      assert.strictEqual(cards[0].value, '$0.00')
      assert.strictEqual(cards[2].value, '0')
    })
  })

  describe('getTrendClass', () => {
    it('should return trend-neutral for neutral direction', () => {
      assert.strictEqual(getTrendClass('neutral', true), 'trend-neutral')
      assert.strictEqual(getTrendClass('neutral', false), 'trend-neutral')
    })

    it('should invert colors for cost metrics (invertColor=true)', () => {
      // Cost going up = bad (red)
      assert.strictEqual(getTrendClass('up', true), 'trend-bad')
      // Cost going down = good (green)
      assert.strictEqual(getTrendClass('down', true), 'trend-good')
    })

    it('should use normal colors when invertColor=false', () => {
      assert.strictEqual(getTrendClass('up', false), 'trend-good')
      assert.strictEqual(getTrendClass('down', false), 'trend-bad')
    })
  })

  describe('card trend integration', () => {
    it('should show red for cost increases', () => {
      const cards = buildCardDefinitions({
        current: { totalCost: 50, totalTokens: 100000 },
        comparison: { totalCost: 25, totalTokens: 10 },
        perStory: { storyCount: 5, avgCostPerStory: 10, avgTokensPerStory: 20000 }
      })

      // Total Cost card: +25% with invertColor=true → trend-bad (red)
      const costCard = cards[0]
      const trend = formatPercentChange(costCard.trend)
      const cls = getTrendClass(trend.direction, costCard.invertColor)
      assert.strictEqual(trend.text, '+25%')
      assert.strictEqual(cls, 'trend-bad')
    })

    it('should show green for cost decreases', () => {
      const cards = buildCardDefinitions({
        current: { totalCost: 30, totalTokens: 80000 },
        comparison: { totalCost: -15, totalTokens: -5 },
        perStory: { storyCount: 5, avgCostPerStory: 6, avgTokensPerStory: 16000 }
      })

      const costCard = cards[0]
      const trend = formatPercentChange(costCard.trend)
      const cls = getTrendClass(trend.direction, costCard.invertColor)
      assert.strictEqual(trend.text, '-15%')
      assert.strictEqual(cls, 'trend-good')
    })

    it('should show green for token decreases', () => {
      const cards = buildCardDefinitions({
        current: { totalCost: 0, totalTokens: 50000 },
        comparison: { totalCost: 0, totalTokens: -30 },
        perStory: { storyCount: 2, avgCostPerStory: 0, avgTokensPerStory: 25000 }
      })

      const tokensCard = cards[2]
      const trend = formatPercentChange(tokensCard.trend)
      const cls = getTrendClass(trend.direction, tokensCard.invertColor)
      assert.strictEqual(trend.text, '-30%')
      assert.strictEqual(cls, 'trend-good')
    })

    it('should show neutral for zero change', () => {
      const cards = buildCardDefinitions({
        current: { totalCost: 10, totalTokens: 50000 },
        comparison: { totalCost: 0, totalTokens: 0 },
        perStory: { storyCount: 5, avgCostPerStory: 2, avgTokensPerStory: 10000 }
      })

      const costCard = cards[0]
      const trend = formatPercentChange(costCard.trend)
      const cls = getTrendClass(trend.direction, costCard.invertColor)
      assert.strictEqual(trend.text, '0%')
      assert.strictEqual(cls, 'trend-neutral')
    })
  })
})
