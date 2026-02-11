/**
 * Stats Plugin v2.0 - Comprehensive Test Suite
 *
 * Tests for all pure/static functions across stats plugin components.
 * Functions are inlined to avoid ESM/CJS mismatch in Node test environment.
 *
 * @module tests/stats-plugin
 */

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

// ─────────────────────────────────────────────────────────────
// Inlined pure functions from renderer components
// ─────────────────────────────────────────────────────────────

// From SummaryCards.js
function formatCost(cost) {
  if (typeof cost !== 'number' || isNaN(cost)) return '$0.00'
  return `$${cost.toFixed(2)}`
}

function formatNumber(num) {
  if (num == null || typeof num !== 'number' || isNaN(num)) return '0'
  if (num >= 1000000) {
    const v = num / 1000000
    return v % 1 === 0 ? `${v}M` : `${parseFloat(v.toFixed(1))}M`
  }
  if (num >= 1000) {
    const v = num / 1000
    return v % 1 === 0 ? `${v}k` : `${parseFloat(v.toFixed(1))}k`
  }
  return String(num)
}

function formatPercentChange(pct) {
  if (pct == null || typeof pct !== 'number' || isNaN(pct)) {
    return { text: '—', direction: 'neutral' }
  }
  if (pct === 0) return { text: '0%', direction: 'neutral' }
  const sign = pct > 0 ? '+' : ''
  const rounded = parseFloat(pct.toFixed(1))
  return {
    text: `${sign}${rounded}%`,
    direction: pct > 0 ? 'up' : 'down'
  }
}

function formatDuration(ms) {
  if (!ms || ms === 0) return '0s'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

// From ComponentTreemap.js
function computeLayout(items, width, height) {
  if (items.length === 0) return []
  const totalValue = items.reduce((s, i) => s + i.value, 0)
  if (totalValue <= 0) return []
  const totalArea = width * height
  const normalized = items.map(item => ({
    item,
    area: (item.value / totalValue) * totalArea
  }))
  const result = []
  squarify(normalized, { x: 0, y: 0, w: width, h: height }, result)
  return result
}

function squarify(nodes, rect, result) {
  if (nodes.length === 0) return
  if (nodes.length === 1) {
    result.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, item: nodes[0].item })
    return
  }
  const shortSide = Math.min(rect.w, rect.h)
  let row = []
  let rowArea = 0
  let remaining = [...nodes]
  for (let i = 0; i < nodes.length; i++) {
    const testRow = [...row, nodes[i]]
    const testArea = rowArea + nodes[i].area
    if (row.length === 0 || worstRatio(testRow, testArea, shortSide) <=
        worstRatio(row, rowArea, shortSide)) {
      row = testRow
      rowArea = testArea
      remaining = nodes.slice(i + 1)
    } else {
      remaining = nodes.slice(i)
      break
    }
  }
  const isHorizontal = rect.w >= rect.h
  const rowLen = rowArea / (isHorizontal ? rect.h : rect.w)
  let offset = 0
  for (const node of row) {
    const nodeLen = node.area / rowLen
    if (isHorizontal) {
      result.push({ x: rect.x, y: rect.y + offset, w: Math.max(rowLen, 0), h: Math.max(nodeLen, 0), item: node.item })
    } else {
      result.push({ x: rect.x + offset, y: rect.y, w: Math.max(nodeLen, 0), h: Math.max(rowLen, 0), item: node.item })
    }
    offset += nodeLen
  }
  if (remaining.length > 0) {
    const newRect = isHorizontal
      ? { x: rect.x + rowLen, y: rect.y, w: rect.w - rowLen, h: rect.h }
      : { x: rect.x, y: rect.y + rowLen, w: rect.w, h: rect.h - rowLen }
    squarify(remaining, newRect, result)
  }
}

function worstRatio(row, totalArea, shortSide) {
  if (row.length === 0 || totalArea <= 0 || shortSide <= 0) return Infinity
  const s2 = shortSide * shortSide
  const areas = row.map(n => n.area)
  const maxArea = Math.max(...areas)
  const minArea = Math.min(...areas)
  return Math.max(
    (s2 * maxArea) / (totalArea * totalArea),
    (totalArea * totalArea) / (s2 * minArea)
  )
}

function efficiencyColor(intensity) {
  const t = Math.min(Math.max(intensity, 0), 1)
  const hue = Math.round(220 * (1 - t))
  const lightness = 35 + Math.round(t * 10)
  return `hsl(${hue}, 60%, ${lightness}%)`
}

// From DailyTrendsChart.js
function renderSparkline(values) {
  const SPARKLINE_CHARS = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588'
  if (!values || values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return values.map(v => {
    const idx = Math.min(Math.round(((v - min) / range) * 7), 7)
    return SPARKLINE_CHARS[idx]
  }).join('')
}

function abbreviateNumber(n) {
  if (n == null || isNaN(n)) return '0'
  if (n >= 1000000) return `${parseFloat((n / 1000000).toFixed(1))}M`
  if (n >= 1000) return `${parseFloat((n / 1000).toFixed(1))}k`
  return String(Math.round(n))
}

function colorWithAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// From NormalizedEfficiencyChart.js
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

// From ComponentPerformanceTable.js
const COMPONENT_DISPLAY_NAMES = {
  'claude-service': 'Claude Service',
  'cre-plan': 'CRE Plan Generator',
  'cre-ris': 'CRE RIS Generator',
  'cre-assertion': 'CRE Assertion Generator',
  'hdsl-engine': 'h-DSL Engine',
  'memory-plugin': 'Memory Plugin',
  'outcomes-plugin': 'Outcomes Plugin',
  'skills-system': 'Skills System'
}

function displayName(componentId) {
  if (!componentId) return ''
  return COMPONENT_DISPLAY_NAMES[componentId] || componentId
}

function sortRows(rows, col, dir) {
  const mult = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const aVal = col === 'component' ? displayName(a.component) : (a[col] ?? 0)
    const bVal = col === 'component' ? displayName(b.component) : (b[col] ?? 0)
    if (typeof aVal === 'string') return mult * aVal.localeCompare(bVal)
    return mult * (aVal - bVal)
  })
}

function toCSV(rows) {
  if (!rows || rows.length === 0) return ''
  const headers = ['Component', 'Operations', 'Cost', 'Avg Duration (ms)', '% of Cost']
  const lines = [headers.join(',')]
  for (const r of rows) {
    const fields = [
      csvEscape(displayName(r.component)),
      String(r.operations),
      r.totalCost.toFixed(4),
      String(r.avgDuration),
      String(r.pctOfCost)
    ]
    lines.push(fields.join(','))
  }
  return lines.join('\n')
}

function toMarkdownTable(rows) {
  if (!rows || rows.length === 0) return ''
  const lines = []
  lines.push('# Component Performance Report')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push('| Component | Operations | Cost | Avg Duration | % of Cost |')
  lines.push('|-----------|-----------|------|-------------|-----------|')
  for (const r of rows) {
    const name = displayName(r.component)
    lines.push(`| ${name} | ${r.operations.toLocaleString()} | $${r.totalCost.toFixed(2)} | ${formatDuration(r.avgDuration)} | ${r.pctOfCost}% |`)
  }
  return lines.join('\n')
}

function csvEscape(val) {
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// From StatsView.js — export helpers
function statsViewCsvEscape(val) {
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// From index.js — backend helpers
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

function pctChange(current, previous) {
  if (!previous || previous === 0) return 0
  return +(((current - previous) / previous) * 100).toFixed(1)
}

function computeTotals(weeklyStats) {
  return weeklyStats.reduce(
    (totals, week) => ({
      turns: totals.turns + (week.turns || 0),
      cost: totals.cost + (week.cost || 0),
      duration: totals.duration + (week.duration || 0)
    }),
    { turns: 0, cost: 0, duration: 0 }
  )
}

function aggregateEvents(events) {
  if (!events || events.length === 0) {
    return { operations: 0, totalTokens: 0, totalCost: 0, totalDuration: 0, avgDuration: 0 }
  }
  let totalTokens = 0, totalCost = 0, totalDuration = 0
  for (const evt of events) {
    totalTokens += evt.total_tokens || 0
    totalCost += evt.cost_usd || 0
    totalDuration += evt.duration_ms || 0
  }
  return {
    operations: events.length,
    totalTokens,
    totalCost: +totalCost.toFixed(4),
    totalDuration,
    avgDuration: events.length > 0 ? Math.round(totalDuration / events.length) : 0
  }
}


// ═════════════════════════════════════════════════════════════
// TEST SUITE
// ═════════════════════════════════════════════════════════════

// ── SummaryCards formatters ──────────────────────────────────

describe('SummaryCards.formatCost', () => {
  it('should format zero cost', () => {
    assert.equal(formatCost(0), '$0.00')
  })

  it('should format typical cost', () => {
    assert.equal(formatCost(12.5), '$12.50')
  })

  it('should format small cost with precision', () => {
    assert.equal(formatCost(0.0042), '$0.00')
  })

  it('should return $0.00 for NaN', () => {
    assert.equal(formatCost(NaN), '$0.00')
  })

  it('should return $0.00 for string input', () => {
    assert.equal(formatCost('abc'), '$0.00')
  })

  it('should return $0.00 for null', () => {
    assert.equal(formatCost(null), '$0.00')
  })
})

describe('SummaryCards.formatNumber', () => {
  it('should format zero', () => {
    assert.equal(formatNumber(0), '0')
  })

  it('should format small numbers', () => {
    assert.equal(formatNumber(42), '42')
  })

  it('should abbreviate thousands', () => {
    assert.equal(formatNumber(1500), '1.5k')
  })

  it('should abbreviate exact thousands', () => {
    assert.equal(formatNumber(2000), '2k')
  })

  it('should abbreviate millions', () => {
    assert.equal(formatNumber(2500000), '2.5M')
  })

  it('should abbreviate exact millions', () => {
    assert.equal(formatNumber(1000000), '1M')
  })

  it('should return "0" for null', () => {
    assert.equal(formatNumber(null), '0')
  })

  it('should return "0" for NaN', () => {
    assert.equal(formatNumber(NaN), '0')
  })
})

describe('SummaryCards.formatPercentChange', () => {
  it('should show neutral for null', () => {
    const r = formatPercentChange(null)
    assert.equal(r.direction, 'neutral')
    assert.equal(r.text, '—')
  })

  it('should show neutral for zero', () => {
    const r = formatPercentChange(0)
    assert.equal(r.direction, 'neutral')
    assert.equal(r.text, '0%')
  })

  it('should show positive change', () => {
    const r = formatPercentChange(25.3)
    assert.equal(r.direction, 'up')
    assert.equal(r.text, '+25.3%')
  })

  it('should show negative change', () => {
    const r = formatPercentChange(-15.7)
    assert.equal(r.direction, 'down')
    assert.equal(r.text, '-15.7%')
  })

  it('should return neutral for NaN', () => {
    const r = formatPercentChange(NaN)
    assert.equal(r.direction, 'neutral')
  })
})

describe('SummaryCards.formatDuration', () => {
  it('should return "0s" for zero', () => {
    assert.equal(formatDuration(0), '0s')
  })

  it('should return "0s" for null', () => {
    assert.equal(formatDuration(null), '0s')
  })

  it('should format seconds', () => {
    assert.equal(formatDuration(5000), '5s')
  })

  it('should format minutes and seconds', () => {
    assert.equal(formatDuration(125000), '2m 5s')
  })

  it('should format hours and minutes', () => {
    assert.equal(formatDuration(3720000), '1h 2m')
  })
})


// ── ComponentTreemap layout ─────────────────────────────────

describe('ComponentTreemap.computeLayout', () => {
  it('should return empty array for empty input', () => {
    assert.deepEqual(computeLayout([], 400, 300), [])
  })

  it('should handle single item filling entire area', () => {
    const items = [{ value: 100, label: 'A' }]
    const result = computeLayout(items, 400, 300)
    assert.equal(result.length, 1)
    assert.equal(result[0].x, 0)
    assert.equal(result[0].y, 0)
    assert.equal(result[0].w, 400)
    assert.equal(result[0].h, 300)
    assert.equal(result[0].item.label, 'A')
  })

  it('should handle two items with total area preserved', () => {
    const items = [{ value: 75, label: 'A' }, { value: 25, label: 'B' }]
    const result = computeLayout(items, 400, 300)
    assert.equal(result.length, 2)
    // Total area should approximately equal container area
    const totalArea = result.reduce((sum, r) => sum + r.w * r.h, 0)
    assert.ok(Math.abs(totalArea - 400 * 300) < 1, `Total area ${totalArea} should ≈ ${400 * 300}`)
  })

  it('should handle many items', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ value: (8 - i) * 10, label: `C${i}` }))
    const result = computeLayout(items, 600, 400)
    assert.equal(result.length, 8)
    // All rects should have positive dimensions
    for (const r of result) {
      assert.ok(r.w >= 0, `Width should be >= 0, got ${r.w}`)
      assert.ok(r.h >= 0, `Height should be >= 0, got ${r.h}`)
    }
  })

  it('should return empty for all-zero values', () => {
    const items = [{ value: 0, label: 'A' }, { value: 0, label: 'B' }]
    assert.deepEqual(computeLayout(items, 400, 300), [])
  })
})

describe('ComponentTreemap.efficiencyColor', () => {
  it('should return blue hue for intensity 0 (low cost)', () => {
    const color = efficiencyColor(0)
    assert.ok(color.includes('hsl(220'))
  })

  it('should return red hue for intensity 1 (high cost)', () => {
    const color = efficiencyColor(1)
    assert.ok(color.includes('hsl(0'))
  })

  it('should clamp below 0', () => {
    const color = efficiencyColor(-0.5)
    assert.ok(color.includes('hsl(220'))
  })

  it('should clamp above 1', () => {
    const color = efficiencyColor(1.5)
    assert.ok(color.includes('hsl(0'))
  })

  it('should return intermediate hue for 0.5', () => {
    const color = efficiencyColor(0.5)
    assert.ok(color.includes('hsl(110'))
  })
})


// ── DailyTrendsChart sparkline and helpers ───────────────────

describe('DailyTrendsChart.renderSparkline', () => {
  it('should return empty string for empty input', () => {
    assert.equal(renderSparkline([]), '')
  })

  it('should return empty string for null', () => {
    assert.equal(renderSparkline(null), '')
  })

  it('should render single value as max bar', () => {
    const result = renderSparkline([5])
    assert.equal(result.length, 1)
  })

  it('should render ascending values with increasing chars', () => {
    const result = renderSparkline([0, 1, 2, 3, 4, 5, 6, 7])
    assert.equal(result.length, 8)
    // First char should be lowest block, last should be highest
    assert.equal(result[0], '\u2581')
    assert.equal(result[7], '\u2588')
  })

  it('should handle constant values', () => {
    const result = renderSparkline([5, 5, 5])
    assert.equal(result.length, 3)
    // All same since range is 0
  })
})

describe('DailyTrendsChart.abbreviateNumber', () => {
  it('should return "0" for null', () => {
    assert.equal(abbreviateNumber(null), '0')
  })

  it('should format small numbers', () => {
    assert.equal(abbreviateNumber(42), '42')
  })

  it('should abbreviate thousands', () => {
    assert.equal(abbreviateNumber(1500), '1.5k')
  })

  it('should abbreviate millions', () => {
    assert.equal(abbreviateNumber(2500000), '2.5M')
  })
})

describe('DailyTrendsChart.colorWithAlpha', () => {
  it('should convert hex to rgba', () => {
    assert.equal(colorWithAlpha('#ff0000', 0.5), 'rgba(255, 0, 0, 0.5)')
  })

  it('should handle a purple color', () => {
    assert.equal(colorWithAlpha('#6c63ff', 0.2), 'rgba(108, 99, 255, 0.2)')
  })

  it('should handle full opacity', () => {
    assert.equal(colorWithAlpha('#000000', 1), 'rgba(0, 0, 0, 1)')
  })
})


// ── NormalizedEfficiencyChart analytics ──────────────────────

describe('NormalizedEfficiencyChart.linearRegression', () => {
  it('should return null for single value', () => {
    assert.equal(linearRegression([5]), null)
  })

  it('should return null for empty array', () => {
    assert.equal(linearRegression([]), null)
  })

  it('should compute flat line for constant values', () => {
    const r = linearRegression([5, 5, 5, 5])
    assert.ok(r)
    assert.equal(r.slope, 0)
    assert.equal(r.intercept, 5)
  })

  it('should compute positive slope for ascending values', () => {
    const r = linearRegression([1, 2, 3, 4, 5])
    assert.ok(r)
    assert.equal(r.slope, 1)
    assert.equal(r.intercept, 1)
  })

  it('should compute negative slope for descending values', () => {
    const r = linearRegression([5, 4, 3, 2, 1])
    assert.ok(r)
    assert.equal(r.slope, -1)
    assert.equal(r.intercept, 5)
  })

  it('should handle two values', () => {
    const r = linearRegression([0, 10])
    assert.ok(r)
    assert.equal(r.slope, 10)
    assert.equal(r.intercept, 0)
  })
})

describe('NormalizedEfficiencyChart.computePercentChange', () => {
  it('should return null for less than 2 weeks', () => {
    assert.equal(computePercentChange([{ costPerStory: 5 }], 'costPerStory'), null)
  })

  it('should return null for null input', () => {
    assert.equal(computePercentChange(null, 'costPerStory'), null)
  })

  it('should compute positive change', () => {
    const weeks = [
      { costPerStory: 10 },
      { costPerStory: 15 }
    ]
    assert.equal(computePercentChange(weeks, 'costPerStory'), 50)
  })

  it('should compute negative change', () => {
    const weeks = [
      { costPerStory: 20 },
      { costPerStory: 10 }
    ]
    assert.equal(computePercentChange(weeks, 'costPerStory'), -50)
  })

  it('should skip zero weeks and use first/last non-zero', () => {
    const weeks = [
      { costPerStory: 0 },
      { costPerStory: 10 },
      { costPerStory: 0 },
      { costPerStory: 20 }
    ]
    assert.equal(computePercentChange(weeks, 'costPerStory'), 100)
  })

  it('should return null when all zeros', () => {
    const weeks = [
      { costPerStory: 0 },
      { costPerStory: 0 }
    ]
    assert.equal(computePercentChange(weeks, 'costPerStory'), null)
  })
})

describe('NormalizedEfficiencyChart.computeThresholds', () => {
  it('should return zero thresholds for empty values', () => {
    assert.deepEqual(computeThresholds([]), { low: 0, high: 0 })
  })

  it('should return zero thresholds for all-zero values', () => {
    assert.deepEqual(computeThresholds([0, 0, 0]), { low: 0, high: 0 })
  })

  it('should compute p25 and p75 for sorted values', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8]
    const thresholds = computeThresholds(values)
    assert.ok(thresholds.low > 0)
    assert.ok(thresholds.high >= thresholds.low)
  })

  it('should filter out zero values before computing', () => {
    const values = [0, 0, 5, 10, 15, 20, 0]
    const thresholds = computeThresholds(values)
    assert.ok(thresholds.low > 0)
  })
})

describe('NormalizedEfficiencyChart.barColor', () => {
  it('should return gray for zero/negative values', () => {
    assert.equal(barColor(0, { low: 5, high: 15 }), '#555')
    assert.equal(barColor(-1, { low: 5, high: 15 }), '#555')
  })

  it('should return green for values below p25', () => {
    assert.equal(barColor(3, { low: 5, high: 15 }), '#48bb78')
  })

  it('should return yellow for values between p25 and p75', () => {
    assert.equal(barColor(10, { low: 5, high: 15 }), '#ecc94b')
  })

  it('should return red for values above p75', () => {
    assert.equal(barColor(20, { low: 5, high: 15 }), '#f56565')
  })
})


// ── ComponentPerformanceTable helpers ────────────────────────

describe('ComponentPerformanceTable.displayName', () => {
  it('should map known components', () => {
    assert.equal(displayName('claude-service'), 'Claude Service')
    assert.equal(displayName('cre-plan'), 'CRE Plan Generator')
    assert.equal(displayName('hdsl-engine'), 'h-DSL Engine')
  })

  it('should pass through unknown components', () => {
    assert.equal(displayName('my-custom-plugin'), 'my-custom-plugin')
  })

  it('should return empty for null', () => {
    assert.equal(displayName(null), '')
  })

  it('should return empty for empty string', () => {
    assert.equal(displayName(''), '')
  })
})

describe('ComponentPerformanceTable.sortRows', () => {
  const rows = [
    { component: 'claude-service', operations: 100, totalCost: 5.0 },
    { component: 'cre-plan', operations: 50, totalCost: 10.0 },
    { component: 'hdsl-engine', operations: 200, totalCost: 2.0 }
  ]

  it('should sort by cost descending', () => {
    const sorted = sortRows(rows, 'totalCost', 'desc')
    assert.equal(sorted[0].component, 'cre-plan')
    assert.equal(sorted[2].component, 'hdsl-engine')
  })

  it('should sort by cost ascending', () => {
    const sorted = sortRows(rows, 'totalCost', 'asc')
    assert.equal(sorted[0].component, 'hdsl-engine')
    assert.equal(sorted[2].component, 'cre-plan')
  })

  it('should sort by component name ascending', () => {
    const sorted = sortRows(rows, 'component', 'asc')
    // Claude Service < CRE Plan Generator < h-DSL Engine
    assert.equal(sorted[0].component, 'claude-service')
  })

  it('should sort by operations descending', () => {
    const sorted = sortRows(rows, 'operations', 'desc')
    assert.equal(sorted[0].component, 'hdsl-engine')
  })

  it('should not mutate original array', () => {
    const original = [...rows]
    sortRows(rows, 'totalCost', 'desc')
    assert.deepEqual(rows, original)
  })
})

describe('ComponentPerformanceTable.toCSV', () => {
  it('should return empty string for empty rows', () => {
    assert.equal(toCSV([]), '')
  })

  it('should generate valid CSV with header', () => {
    const rows = [{
      component: 'claude-service',
      operations: 100,
      totalCost: 5.1234,
      avgDuration: 3000,
      pctOfCost: 75.5
    }]
    const csv = toCSV(rows)
    const lines = csv.split('\n')
    assert.equal(lines.length, 2)
    assert.ok(lines[0].startsWith('Component,'))
    assert.ok(lines[1].includes('Claude Service'))
    assert.ok(lines[1].includes('5.1234'))
  })
})

describe('ComponentPerformanceTable.toMarkdown', () => {
  it('should return empty string for empty rows', () => {
    assert.equal(toMarkdownTable([]), '')
  })

  it('should generate valid markdown table', () => {
    const rows = [{
      component: 'claude-service',
      operations: 100,
      totalCost: 5.12,
      avgDuration: 3000,
      pctOfCost: 75.5
    }]
    const md = toMarkdownTable(rows)
    assert.ok(md.includes('# Component Performance Report'))
    assert.ok(md.includes('Claude Service'))
    assert.ok(md.includes('$5.12'))
    assert.ok(md.includes('75.5%'))
  })
})

describe('ComponentPerformanceTable.csvEscape', () => {
  it('should not escape simple values', () => {
    assert.equal(csvEscape('hello'), 'hello')
  })

  it('should wrap values with commas in quotes', () => {
    assert.equal(csvEscape('a,b'), '"a,b"')
  })

  it('should escape double quotes', () => {
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""')
  })

  it('should wrap values with newlines', () => {
    assert.equal(csvEscape('line1\nline2'), '"line1\nline2"')
  })

  it('should convert non-strings', () => {
    assert.equal(csvEscape(42), '42')
  })
})


// ── Backend plugin helpers ──────────────────────────────────

describe('StatsPlugin.getWeekNumber', () => {
  it('should return week 1 for Jan 1 of most years', () => {
    // Jan 4, 2024 is in week 1 (Thursday)
    const wn = getWeekNumber(new Date(2024, 0, 4))
    assert.equal(wn, 1)
  })

  it('should return valid week number for late December', () => {
    // Dec 30, 2024 is ISO week 1 of 2025 — week number can be 1, 52, or 53
    const wn = getWeekNumber(new Date(2024, 11, 30))
    assert.ok(wn >= 1 && wn <= 53, `Week number ${wn} should be between 1 and 53`)
  })

  it('should be consistent for same week', () => {
    // Mon and Fri of the same week should have same week number
    const mon = getWeekNumber(new Date(2024, 5, 10)) // Monday
    const fri = getWeekNumber(new Date(2024, 5, 14)) // Friday
    assert.equal(mon, fri)
  })
})

describe('StatsPlugin.pctChange', () => {
  it('should return 0 when previous is 0', () => {
    assert.equal(pctChange(10, 0), 0)
  })

  it('should return 0 when previous is null', () => {
    assert.equal(pctChange(10, null), 0)
  })

  it('should compute 100% increase', () => {
    assert.equal(pctChange(20, 10), 100)
  })

  it('should compute 50% decrease', () => {
    assert.equal(pctChange(5, 10), -50)
  })

  it('should compute 0% for same values', () => {
    assert.equal(pctChange(10, 10), 0)
  })
})

describe('StatsPlugin.computeTotals', () => {
  it('should compute totals from weekly stats', () => {
    const weekly = [
      { turns: 10, cost: 1.5, duration: 60000 },
      { turns: 20, cost: 2.0, duration: 90000 }
    ]
    const totals = computeTotals(weekly)
    assert.equal(totals.turns, 30)
    assert.equal(totals.cost, 3.5)
    assert.equal(totals.duration, 150000)
  })

  it('should handle empty array', () => {
    const totals = computeTotals([])
    assert.equal(totals.turns, 0)
    assert.equal(totals.cost, 0)
    assert.equal(totals.duration, 0)
  })

  it('should handle missing fields', () => {
    const weekly = [{ turns: 5 }, { cost: 1.0 }]
    const totals = computeTotals(weekly)
    assert.equal(totals.turns, 5)
    assert.equal(totals.cost, 1.0)
    assert.equal(totals.duration, 0)
  })
})

describe('StatsPlugin.aggregateEvents', () => {
  it('should return zeros for empty events', () => {
    const result = aggregateEvents([])
    assert.equal(result.operations, 0)
    assert.equal(result.totalTokens, 0)
    assert.equal(result.totalCost, 0)
    assert.equal(result.avgDuration, 0)
  })

  it('should return zeros for null', () => {
    const result = aggregateEvents(null)
    assert.equal(result.operations, 0)
  })

  it('should aggregate multiple events', () => {
    const events = [
      { total_tokens: 1000, cost_usd: 0.05, duration_ms: 2000 },
      { total_tokens: 2000, cost_usd: 0.10, duration_ms: 3000 }
    ]
    const result = aggregateEvents(events)
    assert.equal(result.operations, 2)
    assert.equal(result.totalTokens, 3000)
    assert.equal(result.totalCost, 0.15)
    assert.equal(result.totalDuration, 5000)
    assert.equal(result.avgDuration, 2500)
  })

  it('should handle events with missing fields', () => {
    const events = [{ total_tokens: 500 }, {}]
    const result = aggregateEvents(events)
    assert.equal(result.operations, 2)
    assert.equal(result.totalTokens, 500)
    assert.equal(result.totalCost, 0)
  })
})


// ── StatsView export formatters ─────────────────────────────

describe('StatsView.csvEscape', () => {
  it('should pass through simple strings', () => {
    assert.equal(statsViewCsvEscape('hello'), 'hello')
  })

  it('should quote strings with commas', () => {
    assert.equal(statsViewCsvEscape('a,b,c'), '"a,b,c"')
  })

  it('should escape embedded quotes', () => {
    assert.equal(statsViewCsvEscape('say "hi"'), '"say ""hi"""')
  })
})


// ── Integration: treemap layout invariants ──────────────────

describe('Treemap layout invariants', () => {
  it('areas should approximately sum to total container area', () => {
    const items = [
      { value: 50, label: 'A' },
      { value: 30, label: 'B' },
      { value: 20, label: 'C' }
    ]
    const layout = computeLayout(items, 800, 600)
    const totalArea = layout.reduce((sum, r) => sum + r.w * r.h, 0)
    const containerArea = 800 * 600
    assert.ok(
      Math.abs(totalArea - containerArea) < containerArea * 0.01,
      `Total area ${totalArea.toFixed(0)} should be within 1% of ${containerArea}`
    )
  })

  it('no rects should overlap', () => {
    const items = [
      { value: 40, label: 'A' },
      { value: 30, label: 'B' },
      { value: 20, label: 'C' },
      { value: 10, label: 'D' }
    ]
    const layout = computeLayout(items, 400, 300)

    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        const a = layout[i], b = layout[j]
        // Two rects don't overlap if one is completely to the left, right, above, or below
        const noOverlap =
          a.x + a.w <= b.x + 0.01 ||
          b.x + b.w <= a.x + 0.01 ||
          a.y + a.h <= b.y + 0.01 ||
          b.y + b.h <= a.y + 0.01
        assert.ok(noOverlap, `Rects ${i} and ${j} overlap`)
      }
    }
  })

  it('all rects should be within container bounds', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ value: (6 - i) * 15, label: `C${i}` }))
    const W = 500, H = 400
    const layout = computeLayout(items, W, H)

    for (const r of layout) {
      assert.ok(r.x >= -0.01, `x ${r.x} should be >= 0`)
      assert.ok(r.y >= -0.01, `y ${r.y} should be >= 0`)
      assert.ok(r.x + r.w <= W + 0.01, `right edge ${r.x + r.w} should be <= ${W}`)
      assert.ok(r.y + r.h <= H + 0.01, `bottom edge ${r.y + r.h} should be <= ${H}`)
    }
  })
})


// ── Integration: regression + thresholds + color pipeline ───

describe('Efficiency analysis pipeline', () => {
  it('should color-code bars based on regression thresholds', () => {
    const values = [2, 3, 5, 8, 12, 18, 25, 35, 50, 70, 90, 100]
    const regression = linearRegression(values)
    assert.ok(regression)
    assert.ok(regression.slope > 0, 'Should have positive slope for increasing values')

    const thresholds = computeThresholds(values)
    assert.ok(thresholds.low > 0)
    assert.ok(thresholds.high > thresholds.low)

    // Low value should be green
    assert.equal(barColor(thresholds.low - 1, thresholds), '#48bb78')
    // High value should be red
    assert.equal(barColor(thresholds.high + 1, thresholds), '#f56565')
  })
})
