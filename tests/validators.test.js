/**
 * Tests for shared validators
 *
 * Note: validators.js uses ES modules, so we test via dynamic import
 */

const { describe, it } = require('node:test')
const assert = require('node:assert')

// Helper to dynamically import ESM module
async function importValidators() {
  return await import('../src/shared/validators.js')
}

describe('validators', () => {
  describe('validateProject', () => {
    it('should reject null project', async () => {
      const { validateProject } = await importValidators()
      const result = validateProject(null)

      assert.strictEqual(result.valid, false)
      assert.ok(result.errors.includes('Project is required'))
    })

    it('should require project name', async () => {
      const { validateProject } = await importValidators()
      const result = validateProject({ description: 'test' })

      assert.strictEqual(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('name')))
    })

    it('should reject long project names', async () => {
      const { validateProject } = await importValidators()
      const result = validateProject({
        name: 'x'.repeat(101),
        description: 'test'
      })

      assert.strictEqual(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('100 characters')))
    })

    it('should require description', async () => {
      const { validateProject } = await importValidators()
      const result = validateProject({ name: 'test' })

      assert.strictEqual(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('description')))
    })

    it('should accept valid project', async () => {
      const { validateProject } = await importValidators()
      const result = validateProject({
        name: 'Test Project',
        description: 'A test project'
      })

      assert.strictEqual(result.valid, true)
      assert.strictEqual(result.errors.length, 0)
    })

    it('should validate assumptions is array', async () => {
      const { validateProject } = await importValidators()
      const result = validateProject({
        name: 'Test',
        description: 'Test',
        assumptions: 'not an array'
      })

      assert.strictEqual(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('array')))
    })
  })

  describe('validatePrompt', () => {
    it('should reject null prompt', async () => {
      const { validatePrompt } = await importValidators()
      const result = validatePrompt(null)

      assert.strictEqual(result.valid, false)
    })

    it('should require content', async () => {
      const { validatePrompt } = await importValidators()
      const result = validatePrompt({ branchId: 'main' })

      assert.strictEqual(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('content')))
    })

    it('should require branchId', async () => {
      const { validatePrompt } = await importValidators()
      const result = validatePrompt({ content: 'test prompt' })

      assert.strictEqual(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('Branch ID')))
    })

    it('should accept valid prompt', async () => {
      const { validatePrompt } = await importValidators()
      const result = validatePrompt({
        content: 'Build a feature',
        branchId: 'specifications'
      })

      assert.strictEqual(result.valid, true)
    })
  })

  describe('validateGuiElement', () => {
    it('should reject null element', async () => {
      const { validateGuiElement } = await importValidators()
      const result = validateGuiElement(null)

      assert.strictEqual(result.valid, false)
    })

    it('should require valid type', async () => {
      const { validateGuiElement } = await importValidators()
      const result = validateGuiElement({
        type: 'invalid-type',
        properties: {}
      })

      assert.strictEqual(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('type')))
    })

    it('should accept valid element types', async () => {
      const { validateGuiElement } = await importValidators()
      const validTypes = ['container', 'text', 'input', 'button', 'image', 'list', 'form', 'nav', 'card', 'modal']

      for (const type of validTypes) {
        const result = validateGuiElement({ type, properties: {} })
        assert.strictEqual(result.valid, true, `${type} should be valid`)
      }
    })

    it('should require properties object', async () => {
      const { validateGuiElement } = await importValidators()
      const result = validateGuiElement({ type: 'button' })

      assert.strictEqual(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('properties')))
    })
  })

  describe('validateBranch', () => {
    it('should reject null branch', async () => {
      const { validateBranch } = await importValidators()
      const result = validateBranch(null)

      assert.strictEqual(result.valid, false)
    })

    it('should require id', async () => {
      const { validateBranch } = await importValidators()
      const result = validateBranch({ name: 'Test' })

      assert.strictEqual(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('ID')))
    })

    it('should require name', async () => {
      const { validateBranch } = await importValidators()
      const result = validateBranch({ id: 'test' })

      assert.strictEqual(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('name')))
    })

    it('should accept valid branch', async () => {
      const { validateBranch } = await importValidators()
      const result = validateBranch({
        id: 'specifications',
        name: 'Specifications',
        prompts: []
      })

      assert.strictEqual(result.valid, true)
    })

    it('should validate prompts is array', async () => {
      const { validateBranch } = await importValidators()
      const result = validateBranch({
        id: 'test',
        name: 'Test',
        prompts: 'not an array'
      })

      assert.strictEqual(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('array')))
    })
  })

  describe('sanitizeString', () => {
    it('should escape HTML entities', async () => {
      const { sanitizeString } = await importValidators()

      assert.strictEqual(sanitizeString('<script>'), '&lt;script&gt;')
      assert.strictEqual(sanitizeString('"quoted"'), '&quot;quoted&quot;')
      assert.strictEqual(sanitizeString("it's"), "it&#039;s")
      assert.strictEqual(sanitizeString('a & b'), 'a &amp; b')
    })

    it('should handle non-string input', async () => {
      const { sanitizeString } = await importValidators()

      assert.strictEqual(sanitizeString(null), '')
      assert.strictEqual(sanitizeString(undefined), '')
      assert.strictEqual(sanitizeString(123), '')
    })

    it('should preserve safe strings', async () => {
      const { sanitizeString } = await importValidators()

      assert.strictEqual(sanitizeString('Hello World'), 'Hello World')
      assert.strictEqual(sanitizeString('test123'), 'test123')
    })
  })

  describe('isValidFilePath', () => {
    it('should reject non-string input', async () => {
      const { isValidFilePath } = await importValidators()

      assert.strictEqual(isValidFilePath(null), false)
      assert.strictEqual(isValidFilePath(123), false)
      assert.strictEqual(isValidFilePath({}), false)
    })

    it('should reject path traversal attempts', async () => {
      const { isValidFilePath } = await importValidators()

      assert.strictEqual(isValidFilePath('../etc/passwd'), false)
      assert.strictEqual(isValidFilePath('foo/../bar'), false)
      assert.strictEqual(isValidFilePath('..\\windows\\system32'), false)
    })

    it('should accept valid paths', async () => {
      const { isValidFilePath } = await importValidators()

      assert.strictEqual(isValidFilePath('file.txt'), true)
      assert.strictEqual(isValidFilePath('path/to/file.json'), true)
      assert.strictEqual(isValidFilePath('my-file_v2.js'), true)
    })

    it('should reject paths with invalid characters', async () => {
      const { isValidFilePath } = await importValidators()

      assert.strictEqual(isValidFilePath('file name.txt'), false) // space
      assert.strictEqual(isValidFilePath('file@name.txt'), false) // @
      assert.strictEqual(isValidFilePath('file:name.txt'), false) // colon
    })
  })
})
