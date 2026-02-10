/**
 * NormalizedEfficiencyChart Logic Tests
 *
 * Tests for static helpers:
 * - linearRegression (OLS trend line)
 * - computePercentChange (first-to-last % change)
 * - computeThresholds (p25/p75 thresholds)
 * - barColor (value-based color mapping)
 * - abbreviateNumber
 * - formatDuration
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

// ── Replicated static methods from NormalizedEfficiencyChart ──

function linearRegression(values) {
  const n = values.length
  if (n < 2) return null

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }

  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return null

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  return { slope: +slope.toFixed(6), intercept: +intercept.toFixed(6) }
}

function computePercentChange(weeks, metricKey) {
  if (!weeks || weeks.length < 2) return null

  let first = null, last = null
  for (let i = 0; i < weeks.length; i++) {
    const v = weeks[i][metricKey] || 0
    if (v > 0) {
      if (first === null) first = v
      last = v
    }
  }

  if (first === null || first === 0) return null
  return +((last - first) / first * 100).toFixed(1)
}

function computeThresholds(values) {
  const nonZero = values.filter(v => v > 0).sort((a, b) => a - b)
  if (nonZero.length === 0) return { low: 0, high: 0 }
  const p25 = nonZero[Math.floor(nonZero.length * 0.25)] || 0
  const p75 = nonZero[Math.floor(nonZero.length * 0.75)] || 0
  return { low: p25, high: p75 }
}

function barColor(value, thresholds) {
  if (value <= 0) return '#555'
  if (value <= thresholds.low) return '#48bb78'
  if (value <= thresholds.high) return '#ecc94b'
  return '#f56565'
}

function abbreviateNumber(n) {
  if (n == null || isNaN(n)) return '0'
  if (n >= 1000000) return `${parseFloat((n / 1000000).toFixed(1))}M`
  if (n >= 1000) return `${parseFloat((n / 1000).toFixed(1))}k`
  return String(Math.round(n))
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0s'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h${m % 60}m`
  if (m > 0) return `${m}m${s % 60}s`
  return `${s}s`
}

// ── Tests ──────────────────────────────────────────────────────

describe('NormalizedEfficiencyChart logic', () => {
  describe('linearRegression', () => {
    it('should return null for fewer than 2 values', () => {
      assert.strictEqual(linearRegression([]), null)
      assert.strictEqual(linearRegression([5]), null)
    })

    it('should compute zero slope for constant values', () => {
      const result = linearRegression([10, 10, 10, 10])
      assert.notStrictEqual(result, null)
      assert.strictEqual(result.slope, 0)
      assert.strictEqual(result.intercept, 10)
    })

    it('should compute positive slope for increasing values', () => {
      const result = linearRegression([0, 1, 2, 3])
      assert.notStrictEqual(result, null)
      assert.strictEqual(result.slope, 1)
      assert.strictEqual(result.intercept, 0)
    })

    it('should compute negative slope for decreasing values', () => {
      const result = linearRegression([6, 4, 2, 0])
      assert.notStrictEqual(result, null)
      assert.strictEqual(result.slope, -2)
      assert.strictEqual(result.intercept, 6)
    })

    it('should handle noisy data', () => {
      // Values: 10, 12, 8, 14 — general upward trend
      const result = linearRegression([10, 12, 8, 14])
      assert.notStrictEqual(result, null)
      assert.ok(result.slope > 0, `Slope ${result.slope} should be positive`)
    })

    it('should handle two values', () => {
      const result = linearRegression([5, 15])
      assert.notStrictEqual(result, null)
      assert.strictEqual(result.slope, 10)
      assert.strictEqual(result.intercept, 5)
    })

    it('should handle all zeros', () => {
      const result = linearRegression([0, 0, 0])
      assert.notStrictEqual(result, null)
      assert.strictEqual(result.slope, 0)
      assert.strictEqual(result.intercept, 0)
    })
  })

  describe('computePercentChange', () => {
    it('should return null for null/empty weeks', () => {
      assert.strictEqual(computePercentChange(null, 'costPerStory'), null)
      assert.strictEqual(computePercentChange([], 'costPerStory'), null)
    })

    it('should return null for single week', () => {
      assert.strictEqual(computePercentChange([{ costPerStory: 10 }], 'costPerStory'), null)
    })

    it('should return 0 when first equals last', () => {
      const weeks = [
        { costPerStory: 5 },
        { costPerStory: 10 },
        { costPerStory: 5 }
      ]
      assert.strictEqual(computePercentChange(weeks, 'costPerStory'), 0)
    })

    it('should return positive change for increase', () => {
      const weeks = [
        { costPerStory: 10 },
        { costPerStory: 15 }
      ]
      assert.strictEqual(computePercentChange(weeks, 'costPerStory'), 50)
    })

    it('should return negative change for decrease', () => {
      const weeks = [
        { costPerStory: 20 },
        { costPerStory: 10 }
      ]
      assert.strictEqual(computePercentChange(weeks, 'costPerStory'), -50)
    })

    it('should skip zero-value weeks for first/last', () => {
      const weeks = [
        { costPerStory: 0 },
        { costPerStory: 10 },
        { costPerStory: 0 },
        { costPerStory: 20 },
        { costPerStory: 0 }
      ]
      // First non-zero = 10, last non-zero = 20 → +100%
      assert.strictEqual(computePercentChange(weeks, 'costPerStory'), 100)
    })

    it('should return null when all values are zero', () => {
      const weeks = [
        { costPerStory: 0 },
        { costPerStory: 0 }
      ]
      assert.strictEqual(computePercentChange(weeks, 'costPerStory'), null)
    })

    it('should handle missing metric key', () => {
      const weeks = [
        { tokensPerStory: 100 },
        { tokensPerStory: 200 }
      ]
      // costPerStory is undefined → treated as 0
      assert.strictEqual(computePercentChange(weeks, 'costPerStory'), null)
    })

    it('should work for tokensPerStory', () => {
      const weeks = [
        { tokensPerStory: 1000 },
        { tokensPerStory: 800 }
      ]
      assert.strictEqual(computePercentChange(weeks, 'tokensPerStory'), -20)
    })
  })

  describe('computeThresholds', () => {
    it('should return zeros for empty array', () => {
      assert.deepStrictEqual(computeThresholds([]), { low: 0, high: 0 })
    })

    it('should return zeros for all-zero values', () => {
      assert.deepStrictEqual(computeThresholds([0, 0, 0]), { low: 0, high: 0 })
    })

    it('should compute p25 and p75 for sorted values', () => {
      // Non-zero sorted: [1, 2, 3, 4, 5, 6, 7, 8]
      // p25 = index 2 → 3, p75 = index 6 → 7
      const result = computeThresholds([1, 2, 3, 4, 5, 6, 7, 8])
      assert.strictEqual(result.low, 3)
      assert.strictEqual(result.high, 7)
    })

    it('should ignore zeros in threshold calculation', () => {
      const result = computeThresholds([0, 0, 5, 10, 15, 20])
      // Non-zero sorted: [5, 10, 15, 20]. p25=index 1→10, p75=index 3→20
      assert.strictEqual(result.low, 10)
      assert.strictEqual(result.high, 20)
    })

    it('should handle single non-zero value', () => {
      const result = computeThresholds([0, 5, 0])
      // Non-zero: [5]. p25=index 0→5, p75=index 0→5
      assert.strictEqual(result.low, 5)
      assert.strictEqual(result.high, 5)
    })
  })

  describe('barColor', () => {
    it('should return gray for zero/negative values', () => {
      assert.strictEqual(barColor(0, { low: 5, high: 10 }), '#555')
      assert.strictEqual(barColor(-1, { low: 5, high: 10 }), '#555')
    })

    it('should return green for values at or below low threshold', () => {
      assert.strictEqual(barColor(3, { low: 5, high: 10 }), '#48bb78')
      assert.strictEqual(barColor(5, { low: 5, high: 10 }), '#48bb78')
    })

    it('should return yellow for values between low and high', () => {
      assert.strictEqual(barColor(7, { low: 5, high: 10 }), '#ecc94b')
      assert.strictEqual(barColor(10, { low: 5, high: 10 }), '#ecc94b')
    })

    it('should return red for values above high threshold', () => {
      assert.strictEqual(barColor(15, { low: 5, high: 10 }), '#f56565')
    })

    it('should handle equal thresholds', () => {
      // value = threshold: should be green (<=)
      assert.strictEqual(barColor(5, { low: 5, high: 5 }), '#48bb78')
      // value > threshold: red
      assert.strictEqual(barColor(6, { low: 5, high: 5 }), '#f56565')
    })
  })

  describe('abbreviateNumber', () => {
    it('should return "0" for null/NaN', () => {
      assert.strictEqual(abbreviateNumber(null), '0')
      assert.strictEqual(abbreviateNumber(NaN), '0')
    })

    it('should handle small numbers', () => {
      assert.strictEqual(abbreviateNumber(42), '42')
      assert.strictEqual(abbreviateNumber(0), '0')
    })

    it('should abbreviate thousands', () => {
      assert.strictEqual(abbreviateNumber(1500), '1.5k')
      assert.strictEqual(abbreviateNumber(25000), '25k')
    })

    it('should abbreviate millions', () => {
      assert.strictEqual(abbreviateNumber(2500000), '2.5M')
    })
  })

  describe('formatDuration', () => {
    it('should return "0s" for zero/null', () => {
      assert.strictEqual(formatDuration(0), '0s')
      assert.strictEqual(formatDuration(null), '0s')
      assert.strictEqual(formatDuration(-5), '0s')
    })

    it('should format seconds', () => {
      assert.strictEqual(formatDuration(5000), '5s')
      assert.strictEqual(formatDuration(45000), '45s')
    })

    it('should format minutes and seconds', () => {
      assert.strictEqual(formatDuration(90000), '1m30s')
      assert.strictEqual(formatDuration(300000), '5m0s')
    })

    it('should format hours and minutes', () => {
      assert.strictEqual(formatDuration(3660000), '1h1m')
      assert.strictEqual(formatDuration(7200000), '2h0m')
    })
  })

  describe('regression trend interpretation', () => {
    it('negative slope = improving efficiency (costs going down)', () => {
      // Decreasing cost per story over time
      const values = [10, 9, 8, 7, 6, 5]
      const reg = linearRegression(values)
      assert.ok(reg.slope < 0, 'Slope should be negative for improving efficiency')
    })

    it('positive slope = degrading efficiency (costs going up)', () => {
      const values = [5, 6, 7, 8, 9, 10]
      const reg = linearRegression(values)
      assert.ok(reg.slope > 0, 'Slope should be positive for degrading efficiency')
    })

    it('regression line should pass through data range', () => {
      const values = [10, 12, 8, 14, 11, 13]
      const reg = linearRegression(values)
      // Check first and last predicted values are within reasonable range
      const firstPredicted = reg.intercept
      const lastPredicted = reg.slope * (values.length - 1) + reg.intercept
      assert.ok(firstPredicted > 0)
      assert.ok(lastPredicted > 0)
    })
  })

  describe('zero stories handling (AC6)', () => {
    it('computePercentChange should skip zero-story weeks', () => {
      const weeks = [
        { costPerStory: 10, storyCount: 2 },
        { costPerStory: 10, storyCount: 0 }, // zero stories — costPerStory = totalCost/1
        { costPerStory: 5, storyCount: 1 }
      ]
      // First non-zero = 10, last non-zero = 5 → -50%
      const pct = computePercentChange(weeks, 'costPerStory')
      assert.strictEqual(pct, -50)
    })

    it('barColor should gray-out zero values', () => {
      // When storyCount=0, value might be 0
      assert.strictEqual(barColor(0, { low: 5, high: 10 }), '#555')
    })

    it('linearRegression should handle weeks with zero values', () => {
      const values = [10, 0, 8, 0, 6]
      const reg = linearRegression(values)
      assert.notStrictEqual(reg, null)
      // Trend line exists even with zeros
      assert.ok(typeof reg.slope === 'number')
    })
  })
})
