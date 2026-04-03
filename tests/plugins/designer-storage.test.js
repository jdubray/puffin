/**
 * DesignerStorage Tests
 *
 * Tests for the designer plugin storage service, with focus on namespace enforcement.
 */

const { describe, it, beforeEach, afterEach, mock } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const fs = require('fs').promises
const os = require('os')
const { DesignerStorage, DuplicateNameError } = require('../../plugins/designer-plugin.disabled/designer-storage')

describe('DesignerStorage', () => {
  let storage
  let testDir

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(os.tmpdir(), `designer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.mkdir(testDir, { recursive: true })

    const mockLogger = {
      debug: mock.fn(),
      info: mock.fn(),
      warn: mock.fn(),
      error: mock.fn()
    }

    storage = new DesignerStorage(testDir, mockLogger)
    await storage.ensureDesignsDirectory()
  })

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (err) {
      // Ignore cleanup errors
    }
  })

  describe('DuplicateNameError', () => {
    it('should have correct properties', () => {
      const error = new DuplicateNameError('Test Design', 'test_design.json')

      assert.strictEqual(error.name, 'DuplicateNameError')
      assert.strictEqual(error.code, 'DUPLICATE_NAME')
      assert.strictEqual(error.duplicateName, 'Test Design')
      assert.strictEqual(error.existingFilename, 'test_design.json')
      assert.strictEqual(error.message, 'A design named "Test Design" already exists')
    })

    it('should be an instance of Error', () => {
      const error = new DuplicateNameError('Test', 'test.json')
      assert.ok(error instanceof Error)
    })
  })

  describe('saveDesign', () => {
    it('should save a new design successfully', async () => {
      const result = await storage.saveDesign('My Design', [{ id: '1', type: 'button' }], 'A test design')

      assert.strictEqual(result.filename, 'my_design.json')
      assert.strictEqual(result.design.name, 'My Design')
      assert.strictEqual(result.design.description, 'A test design')
      assert.strictEqual(result.design.elements.length, 1)
    })

    it('should throw DuplicateNameError when saving design with existing name', async () => {
      // Save first design
      await storage.saveDesign('Login Form', [{ id: '1', type: 'input' }])

      // Attempt to save another design with the same name
      await assert.rejects(
        () => storage.saveDesign('Login Form', [{ id: '2', type: 'button' }]),
        DuplicateNameError
      )
    })

    it('should include correct properties in DuplicateNameError', async () => {
      await storage.saveDesign('Dashboard', [])

      try {
        await storage.saveDesign('Dashboard', [])
        assert.fail('Expected DuplicateNameError to be thrown')
      } catch (error) {
        assert.strictEqual(error.code, 'DUPLICATE_NAME')
        assert.strictEqual(error.duplicateName, 'Dashboard')
        assert.strictEqual(error.existingFilename, 'dashboard.json')
      }
    })

    it('should allow different names that sanitize differently', async () => {
      await storage.saveDesign('My Form', [])

      // "My Form!" sanitizes to "my_form_" which differs from "my_form"
      const result = await storage.saveDesign('My Form!', [])
      assert.ok(result)
    })

    it('should treat names with same sanitized form as duplicates', async () => {
      await storage.saveDesign('Login Form', [])

      // These sanitize to "login_form" — same as 'Login Form'
      await assert.rejects(() => storage.saveDesign('login form', []), DuplicateNameError)
      await assert.rejects(() => storage.saveDesign('LOGIN FORM', []), DuplicateNameError)
      // 'Login-Form' → 'login-form' (hyphen preserved) — different file, not a duplicate
      const hyphenResult = await storage.saveDesign('Login-Form', [])
      assert.ok(hyphenResult)
    })
  })

  describe('checkNameUniqueness', () => {
    it('should not throw for unique name', async () => {
      await storage.checkNameUniqueness('New Design') // should resolve without throwing
    })

    it('should throw DuplicateNameError for existing name', async () => {
      await storage.saveDesign('Existing Design', [])

      await assert.rejects(
        () => storage.checkNameUniqueness('Existing Design'),
        DuplicateNameError
      )
    })

    it('should allow checking name excluding a specific file', async () => {
      const result = await storage.saveDesign('My Design', [])

      // Checking same name but excluding the file itself (for rename scenarios)
      await storage.checkNameUniqueness('My Design', result.filename) // should not throw
    })

    it('should still throw when excluding different file', async () => {
      await storage.saveDesign('Design A', [])
      const resultB = await storage.saveDesign('Design B', [])

      // Checking name of A while excluding B should still throw
      await assert.rejects(
        () => storage.checkNameUniqueness('Design A', resultB.filename),
        DuplicateNameError
      )
    })
  })

  describe('isNameUnique', () => {
    it('should return true for unique name', async () => {
      const result = await storage.isNameUnique('Unique Name')
      assert.strictEqual(result, true)
    })

    it('should return false for existing name', async () => {
      await storage.saveDesign('Taken Name', [])

      const result = await storage.isNameUnique('Taken Name')
      assert.strictEqual(result, false)
    })

    it('should return true when excluding the matching file', async () => {
      const saved = await storage.saveDesign('Test Design', [])

      const result = await storage.isNameUnique('Test Design', saved.filename)
      assert.strictEqual(result, true)
    })
  })

  describe('renameDesign', () => {
    it('should successfully rename to a unique name', async () => {
      const saved = await storage.saveDesign('Original Name', [])

      const result = await storage.renameDesign(saved.filename, 'New Name')

      assert.strictEqual(result.newFilename, 'new_name.json')
      assert.strictEqual(result.design.name, 'New Name')

      // Verify old file is gone
      const designs = await storage.listDesigns()
      assert.ok(!designs.find(d => d.filename === saved.filename))
      assert.ok(designs.find(d => d.filename === 'new_name.json'))
    })

    it('should throw error when renaming to existing name', async () => {
      await storage.saveDesign('Existing', [])
      const toRename = await storage.saveDesign('ToRename', [])

      await assert.rejects(
        () => storage.renameDesign(toRename.filename, 'Existing'),
        /already exists/
      )
    })

    it('should allow renaming to same name (no-op)', async () => {
      const saved = await storage.saveDesign('Same Name', [])

      // Renaming to the same name should succeed (it's the same file)
      const result = await storage.renameDesign(saved.filename, 'Same Name')
      assert.strictEqual(result.design.name, 'Same Name')
    })
  })

  describe('importDesign', () => {
    it('should import design with unique name', async () => {
      const designJson = JSON.stringify({
        name: 'Imported Design',
        elements: [{ id: '1', type: 'container' }],
        description: 'An imported design'
      })

      const result = await storage.importDesign(designJson)

      assert.strictEqual(result.design.name, 'Imported Design')
      assert.strictEqual(result.filename, 'imported_design.json')
    })

    it('should throw DuplicateNameError when importing with existing name', async () => {
      await storage.saveDesign('Conflicting Name', [])

      const designJson = JSON.stringify({
        name: 'Conflicting Name',
        elements: []
      })

      await assert.rejects(
        () => storage.importDesign(designJson),
        DuplicateNameError
      )
    })

    it('should allow override name during import', async () => {
      await storage.saveDesign('Original', [])

      const designJson = JSON.stringify({
        name: 'Original', // Would conflict
        elements: []
      })

      // Override with unique name
      const result = await storage.importDesign(designJson, 'Unique Override')
      assert.strictEqual(result.design.name, 'Unique Override')
    })

    it('should throw when override name also conflicts', async () => {
      await storage.saveDesign('Existing', [])

      const designJson = JSON.stringify({
        name: 'Whatever',
        elements: []
      })

      await assert.rejects(
        () => storage.importDesign(designJson, 'Existing'),
        DuplicateNameError
      )
    })
  })

  describe('sanitizeFilename', () => {
    it('should convert to lowercase and replace special chars', () => {
      assert.strictEqual(storage.sanitizeFilename('My Design'), 'my_design')
      assert.strictEqual(storage.sanitizeFilename('Test-Design'), 'test-design') // hyphens preserved
      assert.strictEqual(storage.sanitizeFilename('Design!@#$%'), 'design_____')
      assert.strictEqual(storage.sanitizeFilename('UPPERCASE'), 'uppercase')
    })
  })
})
