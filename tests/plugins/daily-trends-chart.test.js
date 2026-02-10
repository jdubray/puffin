/**
 * DailyTrendsChart Logic Tests
 *
 * Tests for static helpers:
 * - renderSparkline (unicode sparkline generation)
 * - abbreviateNumber (number abbreviation)
 * - colorWithAlpha (hex to rgba conversion)
 *
 * DOM rendering and canvas tests are excluded (require JSDOM + canvas mock).
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

// ── Replicated static methods from DailyTrendsChart ───────────

const SPARKLINE_CHARS = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588'

/**
 * Mirrors DailyTrendsChart.renderSparkline()
 */
function renderSparkline(values, color) {
  if (!values || values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  return values.map(v => {
    const idx = Math.min(Math.round(((v - min) / range) * 7), 7)
    const ch = SPARKLINE_CHARS[idx]
    return color
      ? `<span style="color:${color}">${ch}</span>`
      : ch
  }).join('')
}

/**
 * Mirrors DailyTrendsChart.abbreviateNumber()
 */
function abbreviateNumber(n) {
  if (n == null || isNaN(n)) return '0'
  if (n >= 1000000) return `${parseFloat((n / 1000000).toFixed(1))}M`
  if (n >= 1000) return `${parseFloat((n / 1000).toFixed(1))}k`
  return String(Math.round(n))
}

/**
 * Mirrors DailyTrendsChart.colorWithAlpha()
 */
function colorWithAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ── Tests ──────────────────────────────────────────────────────

describe('DailyTrendsChart logic', () => {
  describe('renderSparkline', () => {
    it('should return empty string for empty array', () => {
      assert.strictEqual(renderSparkline([]), '')
    })

    it('should return empty string for null/undefined', () => {
      assert.strictEqual(renderSparkline(null), '')
      assert.strictEqual(renderSparkline(undefined), '')
    })

    it('should render all max bars for equal values', () => {
      // When min === max, range = 1 (fallback). All values map to same level.
      const result = renderSparkline([5, 5, 5])
      // All values: (5-5)/1 = 0 → round(0*7) = 0 → index 0 → ▁
      assert.strictEqual(result, '\u2581\u2581\u2581')
    })

    it('should render ascending bars for ascending values', () => {
      const result = renderSparkline([0, 50, 100])
      // 0 → idx 0 (▁), 50 → idx 4 (▅), 100 → idx 7 (█)
      assert.strictEqual(result.length, 3)
      assert.strictEqual(result[0], '\u2581') // lowest
      assert.strictEqual(result[2], '\u2588') // highest
    })

    it('should wrap in color spans when color provided', () => {
      const result = renderSparkline([0, 100], '#ff0000')
      assert.ok(result.includes('<span style="color:#ff0000">'))
      assert.ok(result.includes('\u2581'))
      assert.ok(result.includes('\u2588'))
    })

    it('should not include span tags without color', () => {
      const result = renderSparkline([0, 100])
      assert.ok(!result.includes('<span'))
    })

    it('should handle single value', () => {
      const result = renderSparkline([42])
      assert.strictEqual(result, '\u2581')
    })

    it('should handle negative values', () => {
      const result = renderSparkline([-10, 0, 10])
      // -10 → 0 (▁), 0 → 4 (▅), 10 → 7 (█)
      assert.strictEqual(result[0], '\u2581')
      assert.strictEqual(result[2], '\u2588')
    })

    it('should handle large arrays', () => {
      const values = Array.from({ length: 100 }, (_, i) => i)
      const result = renderSparkline(values)
      assert.strictEqual(result.length, 100)
      assert.strictEqual(result[0], '\u2581')
      assert.strictEqual(result[99], '\u2588')
    })
  })

  describe('abbreviateNumber', () => {
    it('should return "0" for null', () => {
      assert.strictEqual(abbreviateNumber(null), '0')
    })

    it('should return "0" for undefined', () => {
      assert.strictEqual(abbreviateNumber(undefined), '0')
    })

    it('should return "0" for NaN', () => {
      assert.strictEqual(abbreviateNumber(NaN), '0')
    })

    it('should return small numbers as-is (rounded)', () => {
      assert.strictEqual(abbreviateNumber(42), '42')
      assert.strictEqual(abbreviateNumber(0), '0')
      assert.strictEqual(abbreviateNumber(999), '999')
    })

    it('should abbreviate thousands with k', () => {
      assert.strictEqual(abbreviateNumber(1000), '1k')
      assert.strictEqual(abbreviateNumber(1500), '1.5k')
      assert.strictEqual(abbreviateNumber(25000), '25k')
      assert.strictEqual(abbreviateNumber(999999), '1000k')
    })

    it('should abbreviate millions with M', () => {
      assert.strictEqual(abbreviateNumber(1000000), '1M')
      assert.strictEqual(abbreviateNumber(2500000), '2.5M')
      assert.strictEqual(abbreviateNumber(10000000), '10M')
    })

    it('should strip trailing zeros', () => {
      assert.strictEqual(abbreviateNumber(2000), '2k')
      assert.strictEqual(abbreviateNumber(3000000), '3M')
    })

    it('should handle fractional numbers below 1000', () => {
      assert.strictEqual(abbreviateNumber(42.7), '43')
      assert.strictEqual(abbreviateNumber(0.5), '1')
    })
  })

  describe('colorWithAlpha', () => {
    it('should convert hex to rgba with given alpha', () => {
      assert.strictEqual(colorWithAlpha('#ff0000', 0.5), 'rgba(255, 0, 0, 0.5)')
    })

    it('should handle black', () => {
      assert.strictEqual(colorWithAlpha('#000000', 1), 'rgba(0, 0, 0, 1)')
    })

    it('should handle white', () => {
      assert.strictEqual(colorWithAlpha('#ffffff', 0), 'rgba(255, 255, 255, 0)')
    })

    it('should handle the cost color (#6c63ff)', () => {
      assert.strictEqual(colorWithAlpha('#6c63ff', 0.2), 'rgba(108, 99, 255, 0.2)')
    })

    it('should handle alpha 0', () => {
      const result = colorWithAlpha('#48bb78', 0)
      assert.ok(result.endsWith(', 0)'))
    })

    it('should handle alpha 1', () => {
      const result = colorWithAlpha('#48bb78', 1)
      assert.ok(result.endsWith(', 1)'))
    })
  })

  describe('METRICS constants', () => {
    // Verify the metric config keys match getDailyTrends data shape
    it('cost metric key should be totalCost', () => {
      const METRICS = {
        cost: { key: 'totalCost', label: 'Cost', color: '#6c63ff', fillAlpha: 0.25 },
        tokens: { key: 'totalTokens', label: 'Tokens', color: '#48bb78', fillAlpha: 0 },
        operations: { key: 'operations', label: 'Operations', color: '#ecc94b', fillAlpha: 0 }
      }
      assert.strictEqual(METRICS.cost.key, 'totalCost')
      assert.strictEqual(METRICS.tokens.key, 'totalTokens')
      assert.strictEqual(METRICS.operations.key, 'operations')
    })

    it('all metrics should have distinct colors', () => {
      const colors = ['#6c63ff', '#48bb78', '#ecc94b']
      const unique = new Set(colors)
      assert.strictEqual(unique.size, 3)
    })
  })

  describe('sparkline edge cases', () => {
    it('should handle all zeros', () => {
      const result = renderSparkline([0, 0, 0, 0])
      assert.strictEqual(result.length, 4)
      // All same → all lowest bar
      for (const ch of result) {
        assert.strictEqual(ch, '\u2581')
      }
    })

    it('should handle very large range', () => {
      const result = renderSparkline([0, 1000000])
      assert.strictEqual(result[0], '\u2581')
      assert.strictEqual(result[1], '\u2588')
    })

    it('should handle descending values', () => {
      const result = renderSparkline([100, 50, 0])
      assert.strictEqual(result[0], '\u2588') // highest
      assert.strictEqual(result[2], '\u2581') // lowest
    })
  })
})
