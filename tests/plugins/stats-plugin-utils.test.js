/**
 * Stats Plugin Utility Tests
 *
 * Tests for formatters (formatTokens, formatPercentChange, formatComponentName, renderSparkline)
 * and export utilities (generateMetricsReport, generateCSV).
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  formatTokens,
  formatPercentChange,
  formatComponentName,
  renderSparkline,
  COMPONENT_DISPLAY_NAMES,
  formatCost,
  formatDuration,
  formatNumber
} = require('../../plugins/stats-plugin/src/utils/formatters')

const {
  generateMetricsReport,
  generateCSV,
  escapeMarkdown
} = require('../../plugins/stats-plugin/src/utils/markdown-exporter')

// ── formatTokens ───────────────────────────────────────────────

describe('formatTokens', () => {
  it('should return "0" for null/undefined/NaN', () => {
    assert.strictEqual(formatTokens(null), '0')
    assert.strictEqual(formatTokens(undefined), '0')
    assert.strictEqual(formatTokens(NaN), '0')
    assert.strictEqual(formatTokens('abc'), '0')
  })

  it('should return plain number for values < 1000', () => {
    assert.strictEqual(formatTokens(0), '0')
    assert.strictEqual(formatTokens(1), '1')
    assert.strictEqual(formatTokens(999), '999')
  })

  it('should abbreviate thousands with k', () => {
    assert.strictEqual(formatTokens(1000), '1k')
    assert.strictEqual(formatTokens(1500), '1.5k')
    assert.strictEqual(formatTokens(15000), '15k')
    assert.strictEqual(formatTokens(999999), '1000k')
  })

  it('should abbreviate millions with M', () => {
    assert.strictEqual(formatTokens(1000000), '1M')
    assert.strictEqual(formatTokens(2500000), '2.5M')
    assert.strictEqual(formatTokens(10000000), '10M')
  })

  it('should handle negative values', () => {
    assert.strictEqual(formatTokens(-5000), '-5k')
    assert.strictEqual(formatTokens(-1500000), '-1.5M')
  })

  it('should trim trailing zeros in decimals', () => {
    assert.strictEqual(formatTokens(2000), '2k')
    assert.strictEqual(formatTokens(3000000), '3M')
  })
})

// ── formatPercentChange ────────────────────────────────────────

describe('formatPercentChange', () => {
  it('should return neutral dash for null/undefined/NaN', () => {
    assert.deepStrictEqual(formatPercentChange(null), { text: '—', direction: 'neutral' })
    assert.deepStrictEqual(formatPercentChange(undefined), { text: '—', direction: 'neutral' })
    assert.deepStrictEqual(formatPercentChange(NaN), { text: '—', direction: 'neutral' })
  })

  it('should return neutral for zero', () => {
    assert.deepStrictEqual(formatPercentChange(0), { text: '0%', direction: 'neutral' })
  })

  it('should format positive change with + prefix', () => {
    const result = formatPercentChange(50)
    assert.strictEqual(result.text, '+50%')
    assert.strictEqual(result.direction, 'up')
  })

  it('should format negative change with - prefix', () => {
    const result = formatPercentChange(-25.3)
    assert.strictEqual(result.text, '-25.3%')
    assert.strictEqual(result.direction, 'down')
  })

  it('should round to 1 decimal place', () => {
    const result = formatPercentChange(33.333)
    assert.strictEqual(result.text, '+33.3%')
  })

  it('should handle very small positive change', () => {
    const result = formatPercentChange(0.1)
    assert.strictEqual(result.text, '+0.1%')
    assert.strictEqual(result.direction, 'up')
  })
})

// ── formatComponentName ────────────────────────────────────────

describe('formatComponentName', () => {
  it('should return "Unknown" for null/undefined/empty', () => {
    assert.strictEqual(formatComponentName(null), 'Unknown')
    assert.strictEqual(formatComponentName(undefined), 'Unknown')
    assert.strictEqual(formatComponentName(''), 'Unknown')
  })

  it('should map known component IDs to display names', () => {
    assert.strictEqual(formatComponentName('claude-service'), 'Claude Service')
    assert.strictEqual(formatComponentName('cre-plan'), 'CRE Plan Generator')
    assert.strictEqual(formatComponentName('cre-ris'), 'CRE RIS Generator')
    assert.strictEqual(formatComponentName('cre-assertion'), 'CRE Assertion Generator')
    assert.strictEqual(formatComponentName('hdsl-engine'), 'h-DSL Engine')
    assert.strictEqual(formatComponentName('memory-plugin'), 'Memory Plugin')
    assert.strictEqual(formatComponentName('outcomes-plugin'), 'Outcomes Plugin')
    assert.strictEqual(formatComponentName('skills-system'), 'Skills System')
  })

  it('should return the raw ID for unknown components', () => {
    assert.strictEqual(formatComponentName('custom-thing'), 'custom-thing')
  })

  it('should have entries for all known MetricComponent values', () => {
    const expectedIds = [
      'claude-service', 'cre-plan', 'cre-ris', 'cre-assertion',
      'hdsl-engine', 'memory-plugin', 'outcomes-plugin', 'skills-system'
    ]
    for (const id of expectedIds) {
      assert.ok(COMPONENT_DISPLAY_NAMES[id], `Missing display name for ${id}`)
    }
  })
})

// ── renderSparkline ────────────────────────────────────────────

describe('renderSparkline', () => {
  it('should return empty string for empty/null input', () => {
    assert.strictEqual(renderSparkline([]), '')
    assert.strictEqual(renderSparkline(null), '')
    assert.strictEqual(renderSparkline(undefined), '')
  })

  it('should render a sparkline of correct length', () => {
    const result = renderSparkline([1, 2, 3, 4, 5])
    assert.strictEqual(result.length, 5)
  })

  it('should use lowest bar for min and highest for max', () => {
    const result = renderSparkline([0, 100])
    assert.strictEqual(result[0], '▁')
    assert.strictEqual(result[1], '█')
  })

  it('should handle all-same values', () => {
    const result = renderSparkline([5, 5, 5])
    assert.strictEqual(result.length, 3)
    // All same → all get the lowest bar
    assert.strictEqual(result, '▁▁▁')
  })

  it('should treat NaN/null values as 0', () => {
    const result = renderSparkline([0, null, NaN, 10])
    assert.strictEqual(result.length, 4)
    // index 0,1,2 are 0 (min), index 3 is 10 (max)
    assert.strictEqual(result[3], '█')
  })

  it('should respect explicit min/max options', () => {
    const result = renderSparkline([5], { min: 0, max: 10 })
    assert.strictEqual(result.length, 1)
    // 5 is halfway → should be middle bar (index 4 of 0-8)
    assert.strictEqual(result, '▅')
  })

  it('should handle single value', () => {
    const result = renderSparkline([42])
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result, '▁') // single value → range 0 → min bar
  })
})

// ── generateMetricsReport ──────────────────────────────────────

describe('generateMetricsReport', () => {
  it('should return a report with title and timestamp for empty data', () => {
    const report = generateMetricsReport()
    assert.ok(report.includes('# Metrics Report'))
    assert.ok(report.includes('Generated on'))
    assert.ok(report.includes('No metrics data available'))
  })

  it('should include custom title', () => {
    const report = generateMetricsReport({}, { title: 'Custom Title' })
    assert.ok(report.includes('# Custom Title'))
  })

  it('should render summary section', () => {
    const report = generateMetricsReport({
      summary: {
        periodDays: 30,
        current: {
          operations: 100,
          totalTokens: 500000,
          totalCost: 12.50,
          avgDuration: 3000,
          totalDuration: 300000
        },
        comparison: {
          operations: 25,
          totalTokens: 10,
          totalCost: -5,
          avgDuration: 15
        },
        perStory: {
          storyCount: 10,
          avgTokensPerStory: 50000,
          avgCostPerStory: 1.25,
          avgDurationPerStory: 30000
        }
      }
    })

    assert.ok(report.includes('## Summary'))
    assert.ok(report.includes('30 days'))
    assert.ok(report.includes('Operations'))
    assert.ok(report.includes('+25%'))
    assert.ok(report.includes('10 stories'))
  })

  it('should render component breakdown section', () => {
    const report = generateMetricsReport({
      componentBreakdown: {
        components: [
          { component: 'claude-service', operations: 50, totalTokens: 100000, totalCost: 5.0, pctOfCost: 62.5 },
          { component: 'cre-plan', operations: 10, totalTokens: 30000, totalCost: 3.0, pctOfCost: 37.5 }
        ]
      }
    })

    assert.ok(report.includes('## Component Breakdown'))
    assert.ok(report.includes('Claude Service'))
    assert.ok(report.includes('CRE Plan Generator'))
    assert.ok(report.includes('62.5%'))
  })

  it('should render daily trends with sparklines', () => {
    const report = generateMetricsReport({
      dailyTrends: [
        { date: '2025-01-01', operations: 5, totalTokens: 10000, totalCost: 2.50 },
        { date: '2025-01-02', operations: 0, totalTokens: 0, totalCost: 0 },
        { date: '2025-01-03', operations: 3, totalTokens: 6000, totalCost: 1.50 }
      ]
    })

    assert.ok(report.includes('## Daily Trends'))
    assert.ok(report.includes('2025-01-01'))
    // Empty day (operations=0) should be skipped in table
    assert.ok(!report.includes('2025-01-02'))
    assert.ok(report.includes('2025-01-03'))
  })

  it('should render weekly normalized section', () => {
    const report = generateMetricsReport({
      weeklyNormalized: [
        { week: '2025-W01', storyCount: 3, costPerStory: 1.25, tokensPerStory: 5000, durationPerOp: 2500 },
        { week: '2025-W02', storyCount: 0, costPerStory: 0, tokensPerStory: 0, durationPerOp: 0 }
      ]
    })

    assert.ok(report.includes('## Weekly Normalized'))
    assert.ok(report.includes('2025-W01'))
    assert.ok(report.includes('2025-W02'))
  })
})

// ── generateCSV ────────────────────────────────────────────────

describe('generateCSV', () => {
  it('should return empty string for empty/null array', () => {
    assert.strictEqual(generateCSV([]), '')
    assert.strictEqual(generateCSV(null), '')
    assert.strictEqual(generateCSV(undefined), '')
  })

  it('should generate header row from first object keys', () => {
    const csv = generateCSV([{ a: 1, b: 2 }])
    const lines = csv.split('\n')
    assert.strictEqual(lines[0], 'a,b')
    assert.strictEqual(lines[1], '1,2')
  })

  it('should handle multiple rows', () => {
    const csv = generateCSV([
      { name: 'Alice', score: 90 },
      { name: 'Bob', score: 85 }
    ])
    const lines = csv.split('\n')
    assert.strictEqual(lines.length, 3)
    assert.strictEqual(lines[0], 'name,score')
    assert.strictEqual(lines[1], 'Alice,90')
    assert.strictEqual(lines[2], 'Bob,85')
  })

  it('should escape fields containing commas', () => {
    const csv = generateCSV([{ text: 'hello, world', num: 1 }])
    assert.ok(csv.includes('"hello, world"'))
  })

  it('should escape fields containing double quotes', () => {
    const csv = generateCSV([{ text: 'say "hi"', num: 1 }])
    assert.ok(csv.includes('"say ""hi"""'))
  })

  it('should escape fields containing newlines', () => {
    const csv = generateCSV([{ text: 'line1\nline2', num: 1 }])
    assert.ok(csv.includes('"line1\nline2"'))
  })

  it('should handle null/undefined values', () => {
    const csv = generateCSV([{ a: null, b: undefined, c: 0 }])
    const lines = csv.split('\n')
    assert.strictEqual(lines[1], ',,0')
  })

  it('should respect custom columns option', () => {
    const csv = generateCSV(
      [{ a: 1, b: 2, c: 3 }],
      { columns: ['c', 'a'] }
    )
    const lines = csv.split('\n')
    assert.strictEqual(lines[0], 'c,a')
    assert.strictEqual(lines[1], '3,1')
  })

  it('should support custom delimiter', () => {
    const csv = generateCSV(
      [{ a: 1, b: 2 }],
      { delimiter: '\t' }
    )
    const lines = csv.split('\n')
    assert.strictEqual(lines[0], 'a\tb')
    assert.strictEqual(lines[1], '1\t2')
  })

  it('should escape fields containing the custom delimiter', () => {
    const csv = generateCSV(
      [{ text: 'a\tb', num: 1 }],
      { delimiter: '\t' }
    )
    assert.ok(csv.includes('"a\tb"'))
  })
})
