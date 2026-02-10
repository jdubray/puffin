/**
 * ComponentPerformanceTable Logic Tests
 *
 * Tests for static helpers:
 * - sortRows (multi-column sort)
 * - displayName (component ID → display name)
 * - toCSV (CSV export)
 * - toMarkdown (Markdown export)
 * - csvEscape (field escaping)
 * - abbreviateNumber
 * - formatDuration
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

// ── Replicated static methods from ComponentPerformanceTable ──

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

function csvEscape(val) {
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCSV(rows) {
  if (!rows || rows.length === 0) return ''
  const headers = ['Component', 'Operations', 'Cost', 'Tokens', 'Avg Duration (ms)', '% of Cost']
  const lines = [headers.join(',')]
  for (const r of rows) {
    const fields = [
      csvEscape(displayName(r.component)),
      String(r.operations),
      r.totalCost.toFixed(4),
      String(r.totalTokens),
      String(r.avgDuration),
      String(r.pctOfCost)
    ]
    lines.push(fields.join(','))
  }
  return lines.join('\n')
}

function abbreviateNumber(n) {
  if (n == null || isNaN(n)) return '0'
  if (n >= 1000000) return `${parseFloat((n / 1000000).toFixed(1))}M`
  if (n >= 1000) return `${parseFloat((n / 1000).toFixed(1))}k`
  return String(Math.round(n))
}

function toMarkdown(rows) {
  if (!rows || rows.length === 0) return ''
  const lines = []
  lines.push('# Component Performance Report')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push('| Component | Operations | Cost | Tokens | Avg Duration | % of Cost |')
  lines.push('|-----------|-----------|------|--------|-------------|-----------|')
  for (const r of rows) {
    const name = displayName(r.component)
    lines.push(
      `| ${name} | ${r.operations.toLocaleString()} | $${r.totalCost.toFixed(2)} | ${abbreviateNumber(r.totalTokens)} | ${formatDuration(r.avgDuration)} | ${r.pctOfCost}% |`
    )
  }
  return lines.join('\n')
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0s'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

// ── Sample data ────────────────────────────────────────────────

const SAMPLE_ROWS = [
  { component: 'claude-service', operations: 42, totalCost: 1.5234, totalTokens: 150000, avgDuration: 5000, pctOfCost: 65.2 },
  { component: 'cre-plan', operations: 8, totalCost: 0.5100, totalTokens: 75000, avgDuration: 12000, pctOfCost: 21.8 },
  { component: 'memory-plugin', operations: 15, totalCost: 0.3050, totalTokens: 30000, avgDuration: 2000, pctOfCost: 13.0 }
]

// ── Tests ──────────────────────────────────────────────────────

describe('ComponentPerformanceTable logic', () => {
  describe('displayName', () => {
    it('should map known component IDs to display names', () => {
      assert.strictEqual(displayName('claude-service'), 'Claude Service')
      assert.strictEqual(displayName('cre-plan'), 'CRE Plan Generator')
      assert.strictEqual(displayName('hdsl-engine'), 'h-DSL Engine')
    })

    it('should return raw ID for unknown components', () => {
      assert.strictEqual(displayName('custom-thing'), 'custom-thing')
    })

    it('should return empty string for null/undefined', () => {
      assert.strictEqual(displayName(null), '')
      assert.strictEqual(displayName(undefined), '')
    })
  })

  describe('sortRows', () => {
    it('should sort by cost descending (default)', () => {
      const sorted = sortRows(SAMPLE_ROWS, 'totalCost', 'desc')
      assert.strictEqual(sorted[0].component, 'claude-service')
      assert.strictEqual(sorted[1].component, 'cre-plan')
      assert.strictEqual(sorted[2].component, 'memory-plugin')
    })

    it('should sort by cost ascending', () => {
      const sorted = sortRows(SAMPLE_ROWS, 'totalCost', 'asc')
      assert.strictEqual(sorted[0].component, 'memory-plugin')
      assert.strictEqual(sorted[2].component, 'claude-service')
    })

    it('should sort by operations descending', () => {
      const sorted = sortRows(SAMPLE_ROWS, 'operations', 'desc')
      assert.strictEqual(sorted[0].operations, 42)
      assert.strictEqual(sorted[1].operations, 15)
      assert.strictEqual(sorted[2].operations, 8)
    })

    it('should sort by component name alphabetically (asc)', () => {
      const sorted = sortRows(SAMPLE_ROWS, 'component', 'asc')
      // Display names: "CRE Plan Generator", "Claude Service", "Memory Plugin"
      assert.strictEqual(sorted[0].component, 'claude-service')  // "Claude..." < "CRE..."
      assert.strictEqual(sorted[1].component, 'cre-plan')
      assert.strictEqual(sorted[2].component, 'memory-plugin')
    })

    it('should sort by component name descending', () => {
      const sorted = sortRows(SAMPLE_ROWS, 'component', 'desc')
      assert.strictEqual(sorted[0].component, 'memory-plugin')
    })

    it('should not mutate original array', () => {
      const original = [...SAMPLE_ROWS]
      sortRows(SAMPLE_ROWS, 'operations', 'asc')
      assert.deepStrictEqual(SAMPLE_ROWS, original)
    })

    it('should handle empty array', () => {
      assert.deepStrictEqual(sortRows([], 'totalCost', 'desc'), [])
    })

    it('should sort by pctOfCost', () => {
      const sorted = sortRows(SAMPLE_ROWS, 'pctOfCost', 'desc')
      assert.strictEqual(sorted[0].pctOfCost, 65.2)
      assert.strictEqual(sorted[2].pctOfCost, 13.0)
    })

    it('should sort by avgDuration', () => {
      const sorted = sortRows(SAMPLE_ROWS, 'avgDuration', 'desc')
      assert.strictEqual(sorted[0].avgDuration, 12000)
      assert.strictEqual(sorted[2].avgDuration, 2000)
    })
  })

  describe('csvEscape', () => {
    it('should pass through simple strings', () => {
      assert.strictEqual(csvEscape('hello'), 'hello')
      assert.strictEqual(csvEscape('42'), '42')
    })

    it('should quote strings containing commas', () => {
      assert.strictEqual(csvEscape('hello, world'), '"hello, world"')
    })

    it('should quote strings containing double quotes and double them', () => {
      assert.strictEqual(csvEscape('say "hi"'), '"say ""hi"""')
    })

    it('should quote strings containing newlines', () => {
      assert.strictEqual(csvEscape('line1\nline2'), '"line1\nline2"')
    })

    it('should handle empty string', () => {
      assert.strictEqual(csvEscape(''), '')
    })

    it('should convert non-string to string', () => {
      assert.strictEqual(csvEscape(42), '42')
      assert.strictEqual(csvEscape(null), 'null')
    })
  })

  describe('toCSV', () => {
    it('should return empty string for empty/null rows', () => {
      assert.strictEqual(toCSV([]), '')
      assert.strictEqual(toCSV(null), '')
    })

    it('should produce header row plus data rows', () => {
      const csv = toCSV(SAMPLE_ROWS)
      const lines = csv.split('\n')
      assert.strictEqual(lines.length, 4) // 1 header + 3 data
      assert.ok(lines[0].startsWith('Component,'))
    })

    it('should include display names for components', () => {
      const csv = toCSV(SAMPLE_ROWS)
      assert.ok(csv.includes('Claude Service'))
      assert.ok(csv.includes('CRE Plan Generator'))
    })

    it('should format cost to 4 decimals', () => {
      const csv = toCSV(SAMPLE_ROWS)
      assert.ok(csv.includes('1.5234'))
      assert.ok(csv.includes('0.5100'))
    })

    it('should include all columns', () => {
      const csv = toCSV(SAMPLE_ROWS)
      const header = csv.split('\n')[0]
      assert.ok(header.includes('Component'))
      assert.ok(header.includes('Operations'))
      assert.ok(header.includes('Cost'))
      assert.ok(header.includes('Tokens'))
      assert.ok(header.includes('Avg Duration'))
      assert.ok(header.includes('% of Cost'))
    })
  })

  describe('toMarkdown', () => {
    it('should return empty string for empty/null rows', () => {
      assert.strictEqual(toMarkdown([]), '')
      assert.strictEqual(toMarkdown(null), '')
    })

    it('should include title and table header', () => {
      const md = toMarkdown(SAMPLE_ROWS)
      assert.ok(md.includes('# Component Performance Report'))
      assert.ok(md.includes('| Component |'))
      assert.ok(md.includes('|-----------|'))
    })

    it('should include component display names', () => {
      const md = toMarkdown(SAMPLE_ROWS)
      assert.ok(md.includes('Claude Service'))
      assert.ok(md.includes('Memory Plugin'))
    })

    it('should include formatted costs', () => {
      const md = toMarkdown(SAMPLE_ROWS)
      assert.ok(md.includes('$1.52'))
      assert.ok(md.includes('$0.51'))
    })

    it('should include abbreviated tokens', () => {
      const md = toMarkdown(SAMPLE_ROWS)
      assert.ok(md.includes('150k'))
      assert.ok(md.includes('75k'))
    })

    it('should include percent of cost', () => {
      const md = toMarkdown(SAMPLE_ROWS)
      assert.ok(md.includes('65.2%'))
      assert.ok(md.includes('21.8%'))
    })

    it('should include generated date', () => {
      const md = toMarkdown(SAMPLE_ROWS)
      const today = new Date().toISOString().slice(0, 10)
      assert.ok(md.includes(`Generated: ${today}`))
    })
  })

  describe('abbreviateNumber', () => {
    it('should return "0" for null/NaN', () => {
      assert.strictEqual(abbreviateNumber(null), '0')
      assert.strictEqual(abbreviateNumber(NaN), '0')
    })

    it('should handle small numbers', () => {
      assert.strictEqual(abbreviateNumber(0), '0')
      assert.strictEqual(abbreviateNumber(42), '42')
      assert.strictEqual(abbreviateNumber(999), '999')
    })

    it('should abbreviate thousands', () => {
      assert.strictEqual(abbreviateNumber(1000), '1k')
      assert.strictEqual(abbreviateNumber(1500), '1.5k')
      assert.strictEqual(abbreviateNumber(150000), '150k')
    })

    it('should abbreviate millions', () => {
      assert.strictEqual(abbreviateNumber(1000000), '1M')
      assert.strictEqual(abbreviateNumber(2500000), '2.5M')
    })
  })

  describe('formatDuration', () => {
    it('should return "0s" for zero/null/negative', () => {
      assert.strictEqual(formatDuration(0), '0s')
      assert.strictEqual(formatDuration(null), '0s')
      assert.strictEqual(formatDuration(-100), '0s')
    })

    it('should format seconds', () => {
      assert.strictEqual(formatDuration(5000), '5s')
      assert.strictEqual(formatDuration(59000), '59s')
    })

    it('should format minutes and seconds', () => {
      assert.strictEqual(formatDuration(90000), '1m 30s')
      assert.strictEqual(formatDuration(300000), '5m 0s')
    })

    it('should format hours and minutes', () => {
      assert.strictEqual(formatDuration(3660000), '1h 1m')
      assert.strictEqual(formatDuration(7200000), '2h 0m')
    })
  })

  describe('filter behavior', () => {
    it('display name filter should match known components', () => {
      const filter = 'cre'
      const lowerFilter = filter.toLowerCase()
      const filtered = SAMPLE_ROWS.filter(c => {
        const display = displayName(c.component).toLowerCase()
        const raw = c.component.toLowerCase()
        return display.includes(lowerFilter) || raw.includes(lowerFilter)
      })
      assert.strictEqual(filtered.length, 1)
      assert.strictEqual(filtered[0].component, 'cre-plan')
    })

    it('should match by raw component ID', () => {
      const filter = 'memory'
      const lowerFilter = filter.toLowerCase()
      const filtered = SAMPLE_ROWS.filter(c => {
        const display = displayName(c.component).toLowerCase()
        const raw = c.component.toLowerCase()
        return display.includes(lowerFilter) || raw.includes(lowerFilter)
      })
      assert.strictEqual(filtered.length, 1)
      assert.strictEqual(filtered[0].component, 'memory-plugin')
    })

    it('should match by display name', () => {
      const filter = 'Claude'
      const lowerFilter = filter.toLowerCase()
      const filtered = SAMPLE_ROWS.filter(c => {
        const display = displayName(c.component).toLowerCase()
        const raw = c.component.toLowerCase()
        return display.includes(lowerFilter) || raw.includes(lowerFilter)
      })
      assert.strictEqual(filtered.length, 1)
      assert.strictEqual(filtered[0].component, 'claude-service')
    })

    it('should return empty for no match', () => {
      const filter = 'nonexistent'
      const lowerFilter = filter.toLowerCase()
      const filtered = SAMPLE_ROWS.filter(c => {
        const display = displayName(c.component).toLowerCase()
        const raw = c.component.toLowerCase()
        return display.includes(lowerFilter) || raw.includes(lowerFilter)
      })
      assert.strictEqual(filtered.length, 0)
    })
  })

  describe('combined sort + filter', () => {
    it('should sort filtered results', () => {
      // Filter to "CRE" components
      const allCre = [
        { component: 'cre-plan', operations: 8, totalCost: 0.51, totalTokens: 75000, avgDuration: 12000, pctOfCost: 21.8 },
        { component: 'cre-ris', operations: 12, totalCost: 0.22, totalTokens: 40000, avgDuration: 8000, pctOfCost: 9.4 },
        { component: 'cre-assertion', operations: 5, totalCost: 0.15, totalTokens: 20000, avgDuration: 6000, pctOfCost: 6.4 }
      ]

      const sorted = sortRows(allCre, 'operations', 'desc')
      assert.strictEqual(sorted[0].component, 'cre-ris')
      assert.strictEqual(sorted[1].component, 'cre-plan')
      assert.strictEqual(sorted[2].component, 'cre-assertion')
    })
  })
})
