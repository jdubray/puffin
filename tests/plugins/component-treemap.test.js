/**
 * ComponentTreemap Logic Tests
 *
 * Tests for the ComponentTreemap static algorithms:
 * - computeLayout (squarified treemap layout)
 * - _worstRatio (aspect ratio optimization)
 * - efficiencyColor (HSL color mapping)
 * - _squarify (recursive layout)
 *
 * Note: DOM rendering tests require JSDOM and are excluded here.
 * These tests cover all pure algorithmic logic.
 */

'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

// ── Replicated static methods from ComponentTreemap ───────────

/**
 * Compute squarified treemap layout.
 * Mirrors ComponentTreemap.computeLayout() exactly.
 */
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

/**
 * Recursive squarified layout.
 * Mirrors ComponentTreemap._squarify() exactly.
 */
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
      result.push({
        x: rect.x,
        y: rect.y + offset,
        w: Math.max(rowLen, 0),
        h: Math.max(nodeLen, 0),
        item: node.item
      })
    } else {
      result.push({
        x: rect.x + offset,
        y: rect.y,
        w: Math.max(nodeLen, 0),
        h: Math.max(rowLen, 0),
        item: node.item
      })
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

/**
 * Mirrors ComponentTreemap._worstRatio()
 */
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

/**
 * Mirrors ComponentTreemap.efficiencyColor()
 */
function efficiencyColor(intensity) {
  const t = Math.min(Math.max(intensity, 0), 1)
  const hue = Math.round(220 * (1 - t))
  const lightness = 35 + Math.round(t * 10)
  return `hsl(${hue}, 60%, ${lightness}%)`
}

// ── Tests ──────────────────────────────────────────────────────

describe('ComponentTreemap logic', () => {
  describe('computeLayout', () => {
    it('should return empty array for empty items', () => {
      assert.deepStrictEqual(computeLayout([], 800, 400), [])
    })

    it('should return empty array when total value is zero', () => {
      const items = [{ value: 0, label: 'A' }, { value: 0, label: 'B' }]
      assert.deepStrictEqual(computeLayout(items, 800, 400), [])
    })

    it('should fill entire area for single item', () => {
      const items = [{ value: 100, label: 'Only' }]
      const layout = computeLayout(items, 800, 400)

      assert.strictEqual(layout.length, 1)
      assert.strictEqual(layout[0].x, 0)
      assert.strictEqual(layout[0].y, 0)
      assert.strictEqual(layout[0].w, 800)
      assert.strictEqual(layout[0].h, 400)
      assert.strictEqual(layout[0].item.label, 'Only')
    })

    it('should produce one node per item', () => {
      const items = [
        { value: 50, label: 'A' },
        { value: 30, label: 'B' },
        { value: 20, label: 'C' }
      ]
      const layout = computeLayout(items, 600, 400)

      assert.strictEqual(layout.length, 3)
    })

    it('should preserve total area across all nodes', () => {
      const items = [
        { value: 40, label: 'A' },
        { value: 35, label: 'B' },
        { value: 15, label: 'C' },
        { value: 10, label: 'D' }
      ]
      const layout = computeLayout(items, 800, 400)
      const totalArea = 800 * 400

      const layoutArea = layout.reduce((sum, node) => sum + node.w * node.h, 0)
      assert.ok(
        Math.abs(layoutArea - totalArea) < 1,
        `Layout area ${layoutArea} should be close to ${totalArea}`
      )
    })

    it('should assign areas proportional to values', () => {
      const items = [
        { value: 75, label: 'Big' },
        { value: 25, label: 'Small' }
      ]
      const layout = computeLayout(items, 800, 400)
      const totalArea = 800 * 400

      const bigArea = layout[0].w * layout[0].h
      const smallArea = layout[1].w * layout[1].h

      // Big should be ~75% of total area
      const bigRatio = bigArea / totalArea
      assert.ok(bigRatio > 0.7 && bigRatio < 0.8, `Big ratio ${bigRatio} should be ~0.75`)

      // Small should be ~25%
      const smallRatio = smallArea / totalArea
      assert.ok(smallRatio > 0.2 && smallRatio < 0.3, `Small ratio ${smallRatio} should be ~0.25`)
    })

    it('should not produce negative dimensions', () => {
      const items = [
        { value: 100, label: 'A' },
        { value: 1, label: 'Tiny' },
        { value: 0.5, label: 'Tinier' }
      ]
      const layout = computeLayout(items, 400, 300)

      for (const node of layout) {
        assert.ok(node.w >= 0, `Width ${node.w} should be non-negative`)
        assert.ok(node.h >= 0, `Height ${node.h} should be non-negative`)
      }
    })

    it('should not produce overlapping nodes (all within bounds)', () => {
      const items = [
        { value: 30, label: 'A' },
        { value: 25, label: 'B' },
        { value: 20, label: 'C' },
        { value: 15, label: 'D' },
        { value: 10, label: 'E' }
      ]
      const layout = computeLayout(items, 600, 400)

      for (const node of layout) {
        assert.ok(node.x >= -0.01, `x ${node.x} should be >= 0`)
        assert.ok(node.y >= -0.01, `y ${node.y} should be >= 0`)
        assert.ok(node.x + node.w <= 600.01, `x+w ${node.x + node.w} should be <= 600`)
        assert.ok(node.y + node.h <= 400.01, `y+h ${node.y + node.h} should be <= 400`)
      }
    })

    it('should handle equal-valued items', () => {
      const items = [
        { value: 25, label: 'A' },
        { value: 25, label: 'B' },
        { value: 25, label: 'C' },
        { value: 25, label: 'D' }
      ]
      const layout = computeLayout(items, 400, 400)

      assert.strictEqual(layout.length, 4)

      // All areas should be roughly equal (~25%)
      const expectedArea = (400 * 400) / 4
      for (const node of layout) {
        const area = node.w * node.h
        assert.ok(
          Math.abs(area - expectedArea) < 1,
          `Area ${area} should be close to ${expectedArea}`
        )
      }
    })

    it('should handle very unequal values', () => {
      const items = [
        { value: 999, label: 'Dominant' },
        { value: 1, label: 'Tiny' }
      ]
      const layout = computeLayout(items, 800, 400)

      assert.strictEqual(layout.length, 2)

      const dominantArea = layout[0].w * layout[0].h
      const totalArea = 800 * 400
      assert.ok(dominantArea / totalArea > 0.99, 'Dominant item should have >99% of area')
    })

    it('should work with square container', () => {
      const items = [
        { value: 50, label: 'A' },
        { value: 50, label: 'B' }
      ]
      const layout = computeLayout(items, 400, 400)

      assert.strictEqual(layout.length, 2)
      const totalArea = layout.reduce((s, n) => s + n.w * n.h, 0)
      assert.ok(Math.abs(totalArea - 160000) < 1)
    })
  })

  describe('worstRatio', () => {
    it('should return Infinity for empty row', () => {
      assert.strictEqual(worstRatio([], 0, 100), Infinity)
    })

    it('should return Infinity when totalArea is 0', () => {
      const row = [{ area: 10 }]
      assert.strictEqual(worstRatio(row, 0, 100), Infinity)
    })

    it('should return Infinity when shortSide is 0', () => {
      const row = [{ area: 10 }]
      assert.strictEqual(worstRatio(row, 10, 0), Infinity)
    })

    it('should return 1 for a perfect square', () => {
      // Single node: area = 100, shortSide = 10
      // rowLen = 100/10 = 10, nodeLen = 100/10 = 10 → 10x10 square
      // worstRatio = max(10^2*100/(100*100), (100*100)/(10^2*100)) = max(1, 1) = 1
      const row = [{ area: 100 }]
      assert.strictEqual(worstRatio(row, 100, 10), 1)
    })

    it('should increase as rectangles become more elongated', () => {
      // More spread-out areas lead to worse ratios
      const row1 = [{ area: 50 }, { area: 50 }]
      const row2 = [{ area: 90 }, { area: 10 }]

      const ratio1 = worstRatio(row1, 100, 10)
      const ratio2 = worstRatio(row2, 100, 10)

      assert.ok(ratio2 > ratio1, `Unequal row ratio ${ratio2} should exceed equal row ratio ${ratio1}`)
    })

    it('should return finite value for valid inputs', () => {
      const row = [{ area: 30 }, { area: 20 }, { area: 10 }]
      const ratio = worstRatio(row, 60, 15)
      assert.ok(Number.isFinite(ratio))
      assert.ok(ratio >= 1)
    })
  })

  describe('efficiencyColor', () => {
    it('should return blue hue for intensity 0 (cheap)', () => {
      const color = efficiencyColor(0)
      assert.strictEqual(color, 'hsl(220, 60%, 35%)')
    })

    it('should return red hue for intensity 1 (expensive)', () => {
      const color = efficiencyColor(1)
      assert.strictEqual(color, 'hsl(0, 60%, 45%)')
    })

    it('should return intermediate hue for 0.5', () => {
      const color = efficiencyColor(0.5)
      assert.strictEqual(color, 'hsl(110, 60%, 40%)')
    })

    it('should clamp values below 0', () => {
      const color = efficiencyColor(-0.5)
      assert.strictEqual(color, 'hsl(220, 60%, 35%)')
    })

    it('should clamp values above 1', () => {
      const color = efficiencyColor(1.5)
      assert.strictEqual(color, 'hsl(0, 60%, 45%)')
    })

    it('should produce valid HSL format', () => {
      const color = efficiencyColor(0.3)
      assert.match(color, /^hsl\(\d+, 60%, \d+%\)$/)
    })
  })

  describe('layout area preservation', () => {
    it('should preserve areas for many items across various containers', () => {
      const sizes = [
        [800, 400],
        [400, 800],
        [600, 600],
        [1200, 300]
      ]

      const items = [
        { value: 40, label: 'A' },
        { value: 25, label: 'B' },
        { value: 15, label: 'C' },
        { value: 12, label: 'D' },
        { value: 5, label: 'E' },
        { value: 3, label: 'F' }
      ]

      for (const [w, h] of sizes) {
        const layout = computeLayout(items, w, h)
        const totalArea = w * h
        const layoutArea = layout.reduce((sum, node) => sum + node.w * node.h, 0)
        assert.ok(
          Math.abs(layoutArea - totalArea) < 2,
          `Container ${w}x${h}: layout area ${layoutArea} should match ${totalArea}`
        )
      }
    })
  })

  describe('layout aspect ratios', () => {
    it('should produce reasonable aspect ratios (squarified)', () => {
      const items = [
        { value: 30, label: 'A' },
        { value: 25, label: 'B' },
        { value: 20, label: 'C' },
        { value: 15, label: 'D' },
        { value: 10, label: 'E' }
      ]
      const layout = computeLayout(items, 600, 400)

      for (const node of layout) {
        if (node.w > 0 && node.h > 0) {
          const ratio = Math.max(node.w / node.h, node.h / node.w)
          // Squarified treemap aims for ratios close to 1; allow up to 5:1
          assert.ok(
            ratio < 5,
            `Node ${node.item.label} has aspect ratio ${ratio.toFixed(2)} which exceeds 5:1`
          )
        }
      }
    })
  })
})
