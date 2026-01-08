/**
 * Tests for Calendar Plugin Escape Utilities
 *
 * Tests XSS prevention in escape utilities and BranchIndicator component.
 */

const { describe, it, before } = require('node:test')
const assert = require('node:assert')

describe('Calendar Escape Utilities', () => {
  let escapeHtml
  let escapeAttr

  before(async () => {
    const escapeModule = await import('../../plugins/calendar/utils/escape.js')
    escapeHtml = escapeModule.escapeHtml
    escapeAttr = escapeModule.escapeAttr
  })

  describe('escapeHtml', () => {
    it('should escape < and > characters', () => {
      assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;')
      assert.strictEqual(escapeHtml('<div>test</div>'), '&lt;div&gt;test&lt;/div&gt;')
    })

    it('should escape & character', () => {
      assert.strictEqual(escapeHtml('foo & bar'), 'foo &amp; bar')
      assert.strictEqual(escapeHtml('&amp;'), '&amp;amp;')
    })

    it('should handle null input', () => {
      assert.strictEqual(escapeHtml(null), '')
    })

    it('should handle undefined input', () => {
      assert.strictEqual(escapeHtml(undefined), '')
    })

    it('should handle non-string input', () => {
      assert.strictEqual(escapeHtml(123), '')
      assert.strictEqual(escapeHtml({}), '')
      assert.strictEqual(escapeHtml([]), '')
    })

    it('should preserve safe strings', () => {
      assert.strictEqual(escapeHtml('Hello World'), 'Hello World')
      assert.strictEqual(escapeHtml('feature/my-branch'), 'feature/my-branch')
      assert.strictEqual(escapeHtml('test123'), 'test123')
    })

    it('should handle empty string', () => {
      assert.strictEqual(escapeHtml(''), '')
    })
  })

  describe('escapeAttr', () => {
    it('should escape double quotes', () => {
      assert.strictEqual(escapeAttr('test"value'), 'test&quot;value')
      assert.strictEqual(escapeAttr('"quoted"'), '&quot;quoted&quot;')
    })

    it('should escape single quotes', () => {
      assert.strictEqual(escapeAttr("it's"), "it&#39;s")
      assert.strictEqual(escapeAttr("'single'"), "&#39;single&#39;")
    })

    it('should escape < > & characters', () => {
      assert.strictEqual(escapeAttr('<script>'), '&lt;script&gt;')
      assert.strictEqual(escapeAttr('foo & bar'), 'foo &amp; bar')
    })

    it('should handle null input', () => {
      assert.strictEqual(escapeAttr(null), '')
    })

    it('should handle undefined input', () => {
      assert.strictEqual(escapeAttr(undefined), '')
    })

    it('should handle non-string input', () => {
      assert.strictEqual(escapeAttr(123), '')
      assert.strictEqual(escapeAttr({}), '')
    })

    it('should preserve safe strings', () => {
      assert.strictEqual(escapeAttr('Hello World'), 'Hello World')
      assert.strictEqual(escapeAttr('feature/my-branch'), 'feature/my-branch')
    })

    it('should handle complex XSS payloads', () => {
      const payload = '" onclick="alert(1)" data-x="'
      const escaped = escapeAttr(payload)
      assert.ok(!escaped.includes('"'))
      assert.ok(escaped.includes('&quot;'))
    })
  })
})

describe('BranchIndicator XSS Prevention', () => {
  let BranchIndicator

  before(async () => {
    const branchModule = await import('../../plugins/calendar/renderer/components/BranchIndicator.js')
    BranchIndicator = branchModule.BranchIndicator
  })

  describe('renderInline static method', () => {
    it('should escape HTML in branch names', () => {
      const html = BranchIndicator.renderInline([
        { name: '<script>alert("xss")</script>' }
      ])

      assert.ok(!html.includes('<script>'), 'Should not contain unescaped script tag')
      assert.ok(html.includes('&lt;script&gt;'), 'Should contain escaped script tag')
    })

    it('should escape quotes in title attributes', () => {
      const html = BranchIndicator.renderInline([
        { name: 'branch" onclick="alert(1)' }
      ])

      // The double quote should be escaped, preventing attribute breakout
      assert.ok(!html.includes('title="branch"'), 'Should not have unescaped quote breaking attribute')
      assert.ok(html.includes('&quot;'), 'Should contain escaped quotes')
      assert.ok(html.includes('title="branch&quot;'), 'Should have properly escaped title attribute')
    })

    it('should escape single quotes in branch names', () => {
      const html = BranchIndicator.renderInline([
        { name: "branch' onerror='alert(1)" }
      ])

      assert.ok(html.includes('&#39;'), 'Should contain escaped single quotes')
    })

    it('should escape overflow tooltip content', () => {
      const maliciousBranches = [
        { name: 'branch1' },
        { name: 'branch2' },
        { name: 'branch3' },
        { name: '<img src=x onerror=alert(1)>' },
        { name: '<script>evil()</script>' }
      ]

      const html = BranchIndicator.renderInline(maliciousBranches, { maxVisible: 3 })

      // Check that HTML tags are escaped in the overflow tooltip
      assert.ok(!html.includes('title="<img'), 'Should not contain unescaped img tag in title')
      assert.ok(!html.includes('title="<script'), 'Should not contain unescaped script tag in title')
      assert.ok(html.includes('&lt;img'), 'Should contain escaped img tag')
      assert.ok(html.includes('&lt;script'), 'Should contain escaped script tag')
    })

    it('should handle branches with ampersands', () => {
      const html = BranchIndicator.renderInline([
        { name: 'feature/foo&bar' }
      ])

      assert.ok(html.includes('&amp;'), 'Should escape ampersands')
    })

    it('should handle empty branches array', () => {
      const html = BranchIndicator.renderInline([])
      assert.strictEqual(html, '')
    })

    it('should handle null branches', () => {
      const html = BranchIndicator.renderInline(null)
      assert.strictEqual(html, '')
    })

    it('should handle string branch names', () => {
      const html = BranchIndicator.renderInline([
        '<script>xss</script>',
        'safe-branch'
      ])

      assert.ok(!html.includes('<script>'), 'Should escape string branch names')
    })

    it('should escape abbreviated names', () => {
      const html = BranchIndicator.renderInline([
        { name: '<script>longname</script>', abbreviatedName: '<b>short</b>' }
      ])

      assert.ok(!html.includes('<b>'), 'Should escape abbreviatedName')
      assert.ok(html.includes('&lt;b&gt;'), 'Should contain escaped abbreviated name')
    })

    it('should preserve valid CSS color values', () => {
      const html = BranchIndicator.renderInline([
        { name: 'main', color: 'hsl(220, 70%, 55%)' }
      ])

      assert.ok(html.includes('hsl(220, 70%, 55%)'), 'Should preserve HSL color')
    })
  })
})

describe('BranchIndicator Memory Management', () => {
  let BranchIndicator

  // Check if we're in a DOM environment
  const hasDom = typeof globalThis.document !== 'undefined'

  before(async () => {
    const branchModule = await import('../../plugins/calendar/renderer/components/BranchIndicator.js')
    BranchIndicator = branchModule.BranchIndicator
  })

  describe('class structure', () => {
    it('should export BranchIndicator class', () => {
      assert.ok(BranchIndicator, 'BranchIndicator should be exported')
      assert.strictEqual(typeof BranchIndicator, 'function', 'BranchIndicator should be a constructor')
    })

    it('should have prototype methods for memory management', () => {
      assert.strictEqual(typeof BranchIndicator.prototype.cleanupListeners, 'function', 'Should have cleanupListeners method')
      assert.strictEqual(typeof BranchIndicator.prototype.closePopover, 'function', 'Should have closePopover method')
      assert.strictEqual(typeof BranchIndicator.prototype.destroy, 'function', 'Should have destroy method')
    })

    it('should have prototype methods for event binding', () => {
      assert.strictEqual(typeof BranchIndicator.prototype.bindEvents, 'function', 'Should have bindEvents method')
      assert.strictEqual(typeof BranchIndicator.prototype.showOverflowPopover, 'function', 'Should have showOverflowPopover method')
    })
  })

  // DOM-dependent tests - these verify runtime behavior in browser environments
  // They are skipped in Node.js without jsdom as document is not available
  describe('listener tracking (requires DOM)', { skip: !hasDom }, () => {
    it('should initialize listener tracking arrays', () => {
      const indicator = new BranchIndicator({ branches: [] })

      assert.ok(Array.isArray(indicator.boundListeners), 'boundListeners should be an array')
      assert.ok(Array.isArray(indicator.documentListeners), 'documentListeners should be an array')
      assert.strictEqual(indicator.currentPopover, null, 'currentPopover should be null initially')

      indicator.destroy()
    })

    it('should track element listeners when binding events', () => {
      const mockBranches = [
        { name: 'main' },
        { name: 'feature/test' }
      ]
      const indicator = new BranchIndicator({ branches: mockBranches })

      // Should have click and keydown listeners for each pill (2 branches = 4 listeners)
      assert.strictEqual(indicator.boundListeners.length, 4, 'Should track 4 listeners (2 per pill)')

      indicator.destroy()
    })

    it('should clear listeners on destroy', () => {
      const mockBranches = [{ name: 'main' }]
      const indicator = new BranchIndicator({ branches: mockBranches })

      assert.ok(indicator.boundListeners.length > 0, 'Should have listeners before destroy')

      indicator.destroy()

      assert.strictEqual(indicator.boundListeners.length, 0, 'Should clear boundListeners on destroy')
      assert.strictEqual(indicator.documentListeners.length, 0, 'Should clear documentListeners on destroy')
    })

    it('should not accumulate listeners on re-render', () => {
      const mockBranches = [{ name: 'main' }]
      const indicator = new BranchIndicator({ branches: mockBranches })

      const initialListenerCount = indicator.boundListeners.length

      // Re-render by setting branches
      indicator.setBranches([{ name: 'develop' }])

      assert.strictEqual(
        indicator.boundListeners.length,
        initialListenerCount,
        'Should not accumulate listeners on re-render'
      )

      indicator.destroy()
    })

    it('should clear all listeners when setting empty branches', () => {
      const mockBranches = [{ name: 'main' }, { name: 'develop' }]
      const indicator = new BranchIndicator({ branches: mockBranches })

      indicator.setBranches([])

      assert.strictEqual(indicator.boundListeners.length, 0, 'Should clear listeners when no branches')

      indicator.destroy()
    })
  })

  describe('popover cleanup (requires DOM)', { skip: !hasDom }, () => {
    it('should track currentPopover reference', () => {
      const indicator = new BranchIndicator({ branches: [] })

      assert.strictEqual(indicator.currentPopover, null, 'currentPopover should be null initially')

      indicator.destroy()
    })

    it('should clear currentPopover on destroy', () => {
      const indicator = new BranchIndicator({ branches: [] })

      // Manually set a mock popover to test cleanup
      indicator.currentPopover = { parentNode: null, remove: () => {} }

      indicator.destroy()

      assert.strictEqual(indicator.currentPopover, null, 'currentPopover should be null after destroy')
    })

    it('should clear document listeners when closing popover', () => {
      const indicator = new BranchIndicator({ branches: [] })

      // Simulate having document listeners
      indicator.documentListeners.push({ event: 'click', handler: () => {} })
      indicator.documentListeners.push({ event: 'keydown', handler: () => {} })

      assert.strictEqual(indicator.documentListeners.length, 2, 'Should have 2 document listeners')

      indicator.closePopover()

      assert.strictEqual(indicator.documentListeners.length, 0, 'Should clear document listeners')

      indicator.destroy()
    })
  })

  describe('cleanupListeners behavior (requires DOM)', { skip: !hasDom }, () => {
    it('should clear both listener arrays', () => {
      const indicator = new BranchIndicator({ branches: [{ name: 'main' }] })

      // Add some mock document listeners
      indicator.documentListeners.push({ event: 'test', handler: () => {} })

      assert.ok(indicator.boundListeners.length > 0, 'Should have bound listeners')
      assert.ok(indicator.documentListeners.length > 0, 'Should have document listeners')

      indicator.cleanupListeners()

      assert.strictEqual(indicator.boundListeners.length, 0, 'boundListeners should be empty')
      assert.strictEqual(indicator.documentListeners.length, 0, 'documentListeners should be empty')

      indicator.destroy()
    })
  })
})
