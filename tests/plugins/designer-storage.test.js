/**
 * DesignerStorage Tests
 *
 * Tests for the designer plugin storage service, with focus on namespace enforcement.
 */

const path = require('path')
const fs = require('fs').promises
const os = require('os')
const { DesignerStorage, DuplicateNameError } = require('../../plugins/designer-plugin/designer-storage')

describe('DesignerStorage', () => {
  let storage
  let testDir

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(os.tmpdir(), `designer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.mkdir(testDir, { recursive: true })

    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
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

      expect(error.name).toBe('DuplicateNameError')
      expect(error.code).toBe('DUPLICATE_NAME')
      expect(error.duplicateName).toBe('Test Design')
      expect(error.existingFilename).toBe('test_design.json')
      expect(error.message).toBe('A design named "Test Design" already exists')
    })

    it('should be an instance of Error', () => {
      const error = new DuplicateNameError('Test', 'test.json')
      expect(error instanceof Error).toBe(true)
    })
  })

  describe('saveDesign', () => {
    it('should save a new design successfully', async () => {
      const result = await storage.saveDesign('My Design', [{ id: '1', type: 'button' }], 'A test design')

      expect(result.filename).toBe('my_design.json')
      expect(result.design.name).toBe('My Design')
      expect(result.design.description).toBe('A test design')
      expect(result.design.elements).toHaveLength(1)
    })

    it('should throw DuplicateNameError when saving design with existing name', async () => {
      // Save first design
      await storage.saveDesign('Login Form', [{ id: '1', type: 'input' }])

      // Attempt to save another design with the same name
      await expect(
        storage.saveDesign('Login Form', [{ id: '2', type: 'button' }])
      ).rejects.toThrow(DuplicateNameError)
    })

    it('should include correct properties in DuplicateNameError', async () => {
      await storage.saveDesign('Dashboard', [])

      try {
        await storage.saveDesign('Dashboard', [])
        fail('Expected DuplicateNameError to be thrown')
      } catch (error) {
        expect(error.code).toBe('DUPLICATE_NAME')
        expect(error.duplicateName).toBe('Dashboard')
        expect(error.existingFilename).toBe('dashboard.json')
      }
    })

    it('should allow different names that sanitize differently', async () => {
      await storage.saveDesign('My Form', [])

      // "My-Form" sanitizes to "my_form" which is different from "my_form"
      // But "My Form" also sanitizes to "my_form", so this should fail
      await expect(
        storage.saveDesign('My Form!', []) // sanitizes to my_form_ which is different
      ).resolves.toBeDefined()
    })

    it('should treat names with same sanitized form as duplicates', async () => {
      await storage.saveDesign('Login Form', [])

      // These all sanitize to "login_form"
      await expect(storage.saveDesign('login form', [])).rejects.toThrow(DuplicateNameError)
      await expect(storage.saveDesign('LOGIN FORM', [])).rejects.toThrow(DuplicateNameError)
      await expect(storage.saveDesign('Login-Form', [])).rejects.toThrow(DuplicateNameError)
    })
  })

  describe('checkNameUniqueness', () => {
    it('should not throw for unique name', async () => {
      await expect(storage.checkNameUniqueness('New Design')).resolves.toBeUndefined()
    })

    it('should throw DuplicateNameError for existing name', async () => {
      await storage.saveDesign('Existing Design', [])

      await expect(
        storage.checkNameUniqueness('Existing Design')
      ).rejects.toThrow(DuplicateNameError)
    })

    it('should allow checking name excluding a specific file', async () => {
      const result = await storage.saveDesign('My Design', [])

      // Checking same name but excluding the file itself (for rename scenarios)
      await expect(
        storage.checkNameUniqueness('My Design', result.filename)
      ).resolves.toBeUndefined()
    })

    it('should still throw when excluding different file', async () => {
      await storage.saveDesign('Design A', [])
      const resultB = await storage.saveDesign('Design B', [])

      // Checking name of A while excluding B should still throw
      await expect(
        storage.checkNameUniqueness('Design A', resultB.filename)
      ).rejects.toThrow(DuplicateNameError)
    })
  })

  describe('isNameUnique', () => {
    it('should return true for unique name', async () => {
      const result = await storage.isNameUnique('Unique Name')
      expect(result).toBe(true)
    })

    it('should return false for existing name', async () => {
      await storage.saveDesign('Taken Name', [])

      const result = await storage.isNameUnique('Taken Name')
      expect(result).toBe(false)
    })

    it('should return true when excluding the matching file', async () => {
      const saved = await storage.saveDesign('Test Design', [])

      const result = await storage.isNameUnique('Test Design', saved.filename)
      expect(result).toBe(true)
    })
  })

  describe('renameDesign', () => {
    it('should successfully rename to a unique name', async () => {
      const saved = await storage.saveDesign('Original Name', [])

      const result = await storage.renameDesign(saved.filename, 'New Name')

      expect(result.newFilename).toBe('new_name.json')
      expect(result.design.name).toBe('New Name')

      // Verify old file is gone
      const designs = await storage.listDesigns()
      expect(designs.find(d => d.filename === saved.filename)).toBeUndefined()
      expect(designs.find(d => d.filename === 'new_name.json')).toBeDefined()
    })

    it('should throw error when renaming to existing name', async () => {
      await storage.saveDesign('Existing', [])
      const toRename = await storage.saveDesign('ToRename', [])

      await expect(
        storage.renameDesign(toRename.filename, 'Existing')
      ).rejects.toThrow('already exists')
    })

    it('should allow renaming to same name (no-op)', async () => {
      const saved = await storage.saveDesign('Same Name', [])

      // Renaming to the same name should succeed (it's the same file)
      const result = await storage.renameDesign(saved.filename, 'Same Name')
      expect(result.design.name).toBe('Same Name')
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

      expect(result.design.name).toBe('Imported Design')
      expect(result.filename).toBe('imported_design.json')
    })

    it('should throw DuplicateNameError when importing with existing name', async () => {
      await storage.saveDesign('Conflicting Name', [])

      const designJson = JSON.stringify({
        name: 'Conflicting Name',
        elements: []
      })

      await expect(
        storage.importDesign(designJson)
      ).rejects.toThrow(DuplicateNameError)
    })

    it('should allow override name during import', async () => {
      await storage.saveDesign('Original', [])

      const designJson = JSON.stringify({
        name: 'Original', // Would conflict
        elements: []
      })

      // Override with unique name
      const result = await storage.importDesign(designJson, 'Unique Override')
      expect(result.design.name).toBe('Unique Override')
    })

    it('should throw when override name also conflicts', async () => {
      await storage.saveDesign('Existing', [])

      const designJson = JSON.stringify({
        name: 'Whatever',
        elements: []
      })

      await expect(
        storage.importDesign(designJson, 'Existing')
      ).rejects.toThrow(DuplicateNameError)
    })
  })

  describe('sanitizeFilename', () => {
    it('should convert to lowercase and replace special chars', () => {
      expect(storage.sanitizeFilename('My Design')).toBe('my_design')
      expect(storage.sanitizeFilename('Test-Design')).toBe('test_design')
      expect(storage.sanitizeFilename('Design!@#$%')).toBe('design_____')
      expect(storage.sanitizeFilename('UPPERCASE')).toBe('uppercase')
    })
  })
})
