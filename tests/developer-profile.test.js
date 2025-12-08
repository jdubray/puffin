/**
 * Tests for DeveloperProfileManager
 *
 * Tests profile validation, CRUD operations, and data integrity.
 * Note: GitHub OAuth tests are mocked since they require network access.
 */

const { describe, it, beforeEach, afterEach, mock } = require('node:test')
const assert = require('node:assert')
const fs = require('fs').promises
const path = require('path')
const os = require('os')

// We need to mock Electron's app module before importing the profile manager
const mockApp = {
  getPath: (name) => {
    if (name === 'userData') {
      return process.env.TEST_USER_DATA_PATH || os.tmpdir()
    }
    return os.tmpdir()
  }
}

// Mock Electron modules
const mockElectron = {
  app: mockApp,
  shell: {
    openExternal: async () => {}
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (str) => Buffer.from(str),
    decryptString: (buf) => buf.toString()
  }
}

// Override require for electron
const Module = require('module')
const originalRequire = Module.prototype.require
Module.prototype.require = function(id) {
  if (id === 'electron') {
    return mockElectron
  }
  return originalRequire.apply(this, arguments)
}

const { DeveloperProfileManager, CODING_STYLE_OPTIONS, DEFAULT_PROFILE } = require('../src/main/developer-profile.js')

describe('DeveloperProfileManager', () => {
  let profileManager
  let testDir

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'puffin-profile-test-'))
    process.env.TEST_USER_DATA_PATH = testDir
    profileManager = new DeveloperProfileManager()
    // Reset the cached path
    profileManager.profilePath = null
  })

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (e) {
      // Ignore cleanup errors
    }
    delete process.env.TEST_USER_DATA_PATH
  })

  describe('validate', () => {
    it('should accept valid profile data', () => {
      const result = profileManager.validate({
        name: 'John Doe',
        preferredCodingStyle: 'HYBRID',
        email: 'john@example.com'
      })

      assert.strictEqual(result.isValid, true)
      assert.strictEqual(result.errors.length, 0)
    })

    it('should require name', () => {
      const result = profileManager.validate({
        preferredCodingStyle: 'HYBRID'
      })

      assert.strictEqual(result.isValid, false)
      assert.ok(result.errors.some(e => e.field === 'name'))
    })

    it('should require preferredCodingStyle', () => {
      const result = profileManager.validate({
        name: 'John Doe'
      })

      assert.strictEqual(result.isValid, false)
      assert.ok(result.errors.some(e => e.field === 'preferredCodingStyle'))
    })

    it('should reject invalid coding style', () => {
      const result = profileManager.validate({
        name: 'John Doe',
        preferredCodingStyle: 'INVALID_STYLE'
      })

      assert.strictEqual(result.isValid, false)
      assert.ok(result.errors.some(e => e.field === 'preferredCodingStyle'))
    })

    it('should validate email format', () => {
      const result = profileManager.validate({
        name: 'John Doe',
        preferredCodingStyle: 'HYBRID',
        email: 'not-an-email'
      })

      assert.strictEqual(result.isValid, false)
      assert.ok(result.errors.some(e => e.field === 'email'))
    })

    it('should accept valid email', () => {
      const result = profileManager.validate({
        name: 'John Doe',
        preferredCodingStyle: 'HYBRID',
        email: 'john@example.com'
      })

      assert.strictEqual(result.isValid, true)
    })

    it('should limit bio length', () => {
      const result = profileManager.validate({
        name: 'John Doe',
        preferredCodingStyle: 'HYBRID',
        bio: 'x'.repeat(501)
      })

      assert.strictEqual(result.isValid, false)
      assert.ok(result.errors.some(e => e.field === 'bio'))
    })

    it('should validate nested preferences', () => {
      const result = profileManager.validate({
        name: 'John Doe',
        preferredCodingStyle: 'HYBRID',
        preferences: {
          testingApproach: 'INVALID'
        }
      })

      assert.strictEqual(result.isValid, false)
      assert.ok(result.errors.some(e => e.field === 'preferences.testingApproach'))
    })
  })

  describe('create', () => {
    it('should create a valid profile', async () => {
      const profile = await profileManager.create({
        name: 'Test User',
        preferredCodingStyle: 'FUNCTIONAL'
      })

      assert.strictEqual(profile.name, 'Test User')
      assert.strictEqual(profile.preferredCodingStyle, 'FUNCTIONAL')
      assert.ok(profile.createdAt)
      assert.ok(profile.updatedAt)
    })

    it('should throw on missing name', async () => {
      await assert.rejects(async () => {
        await profileManager.create({
          preferredCodingStyle: 'HYBRID'
        })
      }, /Name is required/)
    })

    it('should throw on invalid coding style', async () => {
      await assert.rejects(async () => {
        await profileManager.create({
          name: 'Test',
          preferredCodingStyle: 'INVALID'
        })
      }, /Invalid coding style/)
    })

    it('should trim whitespace from name', async () => {
      const profile = await profileManager.create({
        name: '  Test User  ',
        preferredCodingStyle: 'HYBRID'
      })

      assert.strictEqual(profile.name, 'Test User')
    })
  })

  describe('update', () => {
    beforeEach(async () => {
      await profileManager.create({
        name: 'Original',
        preferredCodingStyle: 'HYBRID'
      })
    })

    it('should update existing profile', async () => {
      const updated = await profileManager.update({
        name: 'Updated Name'
      })

      assert.strictEqual(updated.name, 'Updated Name')
    })

    it('should preserve existing fields', async () => {
      const updated = await profileManager.update({
        email: 'test@example.com'
      })

      assert.strictEqual(updated.name, 'Original')
      assert.strictEqual(updated.email, 'test@example.com')
    })

    it('should reject empty name', async () => {
      await assert.rejects(async () => {
        await profileManager.update({ name: '   ' })
      }, /Name cannot be empty/)
    })
  })

  describe('delete', () => {
    it('should delete existing profile', async () => {
      await profileManager.create({
        name: 'To Delete',
        preferredCodingStyle: 'HYBRID'
      })

      const deleted = await profileManager.delete()
      assert.strictEqual(deleted, true)

      const exists = await profileManager.exists()
      assert.strictEqual(exists, false)
    })

    it('should return false when no profile exists', async () => {
      const deleted = await profileManager.delete()
      assert.strictEqual(deleted, false)
    })
  })

  describe('exists', () => {
    it('should return false when no profile', async () => {
      const exists = await profileManager.exists()
      assert.strictEqual(exists, false)
    })

    it('should return true after creation', async () => {
      await profileManager.create({
        name: 'Test',
        preferredCodingStyle: 'HYBRID'
      })

      const exists = await profileManager.exists()
      assert.strictEqual(exists, true)
    })
  })

  describe('exportProfile / importProfile', () => {
    it('should export profile as JSON', async () => {
      await profileManager.create({
        name: 'Export Test',
        preferredCodingStyle: 'OOP'
      })

      const json = await profileManager.exportProfile()
      const parsed = JSON.parse(json)

      assert.strictEqual(parsed.name, 'Export Test')
      assert.strictEqual(parsed.preferredCodingStyle, 'OOP')
    })

    it('should import valid profile JSON', async () => {
      const profileData = {
        name: 'Imported',
        preferredCodingStyle: 'FUNCTIONAL'
      }

      const imported = await profileManager.importProfile(
        JSON.stringify(profileData),
        true
      )

      assert.strictEqual(imported.name, 'Imported')
    })

    it('should reject invalid JSON', async () => {
      await assert.rejects(async () => {
        await profileManager.importProfile('not valid json', true)
      }, /Invalid JSON format/)
    })

    it('should reject import without overwrite when profile exists', async () => {
      await profileManager.create({
        name: 'Existing',
        preferredCodingStyle: 'HYBRID'
      })

      await assert.rejects(async () => {
        await profileManager.importProfile(
          JSON.stringify({ name: 'New', preferredCodingStyle: 'OOP' }),
          false
        )
      }, /Profile already exists/)
    })
  })

  describe('getOptions', () => {
    it('should return all coding style options', () => {
      const options = profileManager.getOptions()

      assert.ok(options.programmingStyle)
      assert.ok(options.testingApproach)
      assert.ok(options.documentationLevel)
      assert.ok(options.errorHandling)
      assert.ok(options.naming)
      assert.ok(options.comments)
    })

    it('should include expected programming styles', () => {
      const options = profileManager.getOptions()

      assert.ok(options.programmingStyle.includes('FUNCTIONAL'))
      assert.ok(options.programmingStyle.includes('OOP'))
      assert.ok(options.programmingStyle.includes('HYBRID'))
    })
  })
})

describe('CODING_STYLE_OPTIONS', () => {
  it('should have all expected categories', () => {
    assert.ok(CODING_STYLE_OPTIONS.programmingStyle)
    assert.ok(CODING_STYLE_OPTIONS.testingApproach)
    assert.ok(CODING_STYLE_OPTIONS.documentationLevel)
    assert.ok(CODING_STYLE_OPTIONS.errorHandling)
    assert.ok(CODING_STYLE_OPTIONS.naming)
    assert.ok(CODING_STYLE_OPTIONS.comments)
  })
})

describe('DEFAULT_PROFILE', () => {
  it('should have required default fields', () => {
    assert.strictEqual(DEFAULT_PROFILE.name, '')
    assert.strictEqual(DEFAULT_PROFILE.preferredCodingStyle, 'HYBRID')
    assert.ok(DEFAULT_PROFILE.preferences)
    assert.ok(DEFAULT_PROFILE.github)
    assert.strictEqual(DEFAULT_PROFILE.github.connected, false)
  })
})
