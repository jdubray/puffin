/**
 * Tests for PuffinState
 *
 * Tests the core state management functionality including:
 * - Filename validation (path traversal prevention)
 * - File operations (save, load, delete)
 * - State initialization
 */

const { describe, it, beforeEach, afterEach, mock } = require('node:test')
const assert = require('node:assert')
const fs = require('fs').promises
const path = require('path')
const os = require('os')

// Import the module under test
const { PuffinState } = require('../src/main/puffin-state.js')

describe('PuffinState', () => {
  let puffinState
  let testDir

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'puffin-test-'))
    puffinState = new PuffinState()
  })

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (e) {
      // Ignore cleanup errors
    }
  })

  describe('validateFilename', () => {
    beforeEach(async () => {
      // Initialize state so we can call validateFilename
      await puffinState.open(testDir)
    })

    it('should accept valid filenames', () => {
      assert.doesNotThrow(() => {
        puffinState.validateFilename('test.json')
      })
      assert.doesNotThrow(() => {
        puffinState.validateFilename('my-design.json')
      })
      assert.doesNotThrow(() => {
        puffinState.validateFilename('design_v2.json')
      })
    })

    it('should reject filenames with path traversal (..)', () => {
      assert.throws(() => {
        puffinState.validateFilename('../config.json')
      }, /path traversal not allowed/)

      assert.throws(() => {
        puffinState.validateFilename('../../etc/passwd.json')
      }, /path traversal not allowed/)

      assert.throws(() => {
        puffinState.validateFilename('foo/../bar.json')
      }, /path traversal not allowed/)
    })

    it('should reject filenames with forward slashes', () => {
      assert.throws(() => {
        puffinState.validateFilename('path/to/file.json')
      }, /path traversal not allowed/)

      assert.throws(() => {
        puffinState.validateFilename('/etc/passwd.json')
      }, /path traversal not allowed/)
    })

    it('should reject filenames with backslashes', () => {
      assert.throws(() => {
        puffinState.validateFilename('path\\to\\file.json')
      }, /path traversal not allowed/)

      assert.throws(() => {
        puffinState.validateFilename('..\\config.json')
      }, /path traversal not allowed/)
    })

    it('should reject non-JSON files', () => {
      assert.throws(() => {
        puffinState.validateFilename('script.js')
      }, /must be a .json file/)

      assert.throws(() => {
        puffinState.validateFilename('data.txt')
      }, /must be a .json file/)

      assert.throws(() => {
        puffinState.validateFilename('noextension')
      }, /must be a .json file/)
    })

    it('should reject empty or invalid filenames', () => {
      assert.throws(() => {
        puffinState.validateFilename('')
      }, /must be a non-empty string/)

      assert.throws(() => {
        puffinState.validateFilename(null)
      }, /must be a non-empty string/)

      assert.throws(() => {
        puffinState.validateFilename(undefined)
      }, /must be a non-empty string/)

      assert.throws(() => {
        puffinState.validateFilename(123)
      }, /must be a non-empty string/)
    })
  })

  describe('sanitizeFilename', () => {
    beforeEach(async () => {
      await puffinState.open(testDir)
    })

    it('should convert to lowercase', () => {
      assert.strictEqual(puffinState.sanitizeFilename('MyDesign'), 'mydesign')
      assert.strictEqual(puffinState.sanitizeFilename('TEST'), 'test')
    })

    it('should replace invalid characters with underscores', () => {
      assert.strictEqual(puffinState.sanitizeFilename('my design'), 'my_design')
      assert.strictEqual(puffinState.sanitizeFilename('test@file'), 'test_file')
      assert.strictEqual(puffinState.sanitizeFilename('a/b\\c'), 'a_b_c')
    })

    it('should preserve valid characters', () => {
      assert.strictEqual(puffinState.sanitizeFilename('my-design_v2'), 'my-design_v2')
      assert.strictEqual(puffinState.sanitizeFilename('test123'), 'test123')
    })
  })

  describe('open', () => {
    it('should create .puffin directory if it does not exist', async () => {
      await puffinState.open(testDir)

      const puffinDir = path.join(testDir, '.puffin')
      const stat = await fs.stat(puffinDir)
      assert.ok(stat.isDirectory())
    })

    it('should create required subdirectories', async () => {
      await puffinState.open(testDir)

      const dirs = ['gui-designs', 'gui-definitions', 'stylesheets']
      for (const dir of dirs) {
        const dirPath = path.join(testDir, '.puffin', dir)
        const stat = await fs.stat(dirPath)
        assert.ok(stat.isDirectory(), `${dir} should be a directory`)
      }
    })

    it('should initialize default config', async () => {
      const state = await puffinState.open(testDir)

      assert.ok(state.config)
      assert.strictEqual(state.config.name, path.basename(testDir))
      assert.ok(state.config.options)
      assert.strictEqual(state.config.options.programmingStyle, 'HYBRID')
    })

    it('should initialize default history with branches', async () => {
      const state = await puffinState.open(testDir)

      assert.ok(state.history)
      assert.ok(state.history.branches)
      assert.ok(state.history.branches.specifications)
      assert.ok(state.history.branches.architecture)
      assert.ok(state.history.branches.ui)
      assert.ok(state.history.branches.backend)
      assert.ok(state.history.branches.deployment)
    })
  })

  describe('GUI Definition Operations', () => {
    beforeEach(async () => {
      await puffinState.open(testDir)
    })

    it('should save and load a GUI definition', async () => {
      const elements = [{ type: 'button', label: 'Test' }]
      const { filename, definition } = await puffinState.saveGuiDefinition('Test Design', 'A test', elements)

      assert.ok(filename.endsWith('.json'))
      assert.strictEqual(definition.name, 'Test Design')
      assert.strictEqual(definition.description, 'A test')
      assert.deepStrictEqual(definition.elements, elements)

      // Load it back
      const loaded = await puffinState.loadGuiDefinition(filename)
      assert.strictEqual(loaded.name, 'Test Design')
      assert.deepStrictEqual(loaded.elements, elements)
    })

    it('should list GUI definitions', async () => {
      await puffinState.saveGuiDefinition('Design 1', '', [])
      await puffinState.saveGuiDefinition('Design 2', '', [])

      const definitions = await puffinState.listGuiDefinitions()
      assert.strictEqual(definitions.length, 2)
    })

    it('should delete a GUI definition', async () => {
      const { filename } = await puffinState.saveGuiDefinition('To Delete', '', [])

      let definitions = await puffinState.listGuiDefinitions()
      assert.strictEqual(definitions.length, 1)

      await puffinState.deleteGuiDefinition(filename)

      definitions = await puffinState.listGuiDefinitions()
      assert.strictEqual(definitions.length, 0)
    })

    it('should reject path traversal in loadGuiDefinition', async () => {
      await assert.rejects(async () => {
        await puffinState.loadGuiDefinition('../config.json')
      }, /path traversal not allowed/)
    })

    it('should reject path traversal in deleteGuiDefinition', async () => {
      await assert.rejects(async () => {
        await puffinState.deleteGuiDefinition('../../important.json')
      }, /path traversal not allowed/)
    })

    it('should reject path traversal in updateGuiDefinition', async () => {
      await assert.rejects(async () => {
        await puffinState.updateGuiDefinition('../config.json', { name: 'hacked' })
      }, /path traversal not allowed/)
    })
  })

  describe('User Stories', () => {
    beforeEach(async () => {
      await puffinState.open(testDir)
    })

    it('should add a user story', async () => {
      const story = await puffinState.addUserStory({
        title: 'Test Story',
        description: 'As a user, I want to test'
      })

      assert.ok(story.id)
      assert.strictEqual(story.title, 'Test Story')
      assert.strictEqual(story.status, 'pending')
    })

    it('should update a user story', async () => {
      const story = await puffinState.addUserStory({ title: 'Original' })

      const updated = await puffinState.updateUserStory(story.id, {
        title: 'Updated',
        status: 'completed'
      })

      assert.strictEqual(updated.title, 'Updated')
      assert.strictEqual(updated.status, 'completed')
    })

    it('should delete a user story', async () => {
      const story = await puffinState.addUserStory({ title: 'To Delete' })

      let stories = puffinState.getUserStories()
      assert.strictEqual(stories.length, 1)

      const deleted = await puffinState.deleteUserStory(story.id)
      assert.strictEqual(deleted, true)

      stories = puffinState.getUserStories()
      assert.strictEqual(stories.length, 0)
    })
  })

  describe('Config Operations', () => {
    beforeEach(async () => {
      await puffinState.open(testDir)
    })

    it('should update config', async () => {
      const updated = await puffinState.updateConfig({
        description: 'Test project'
      })

      assert.strictEqual(updated.description, 'Test project')
      assert.ok(updated.updatedAt)
    })

    it('should persist config changes', async () => {
      await puffinState.updateConfig({ description: 'Persisted' })

      // Create new instance and reload
      const newState = new PuffinState()
      const state = await newState.open(testDir)

      assert.strictEqual(state.config.description, 'Persisted')
    })
  })

  describe('isPuffinProject', () => {
    it('should return true for initialized projects', async () => {
      await puffinState.open(testDir)

      const result = await PuffinState.isPuffinProject(testDir)
      assert.strictEqual(result, true)
    })

    it('should return false for non-puffin directories', async () => {
      const result = await PuffinState.isPuffinProject(testDir)
      assert.strictEqual(result, false)
    })
  })

  describe('Cache Independence', () => {
    beforeEach(async () => {
      await puffinState.open(testDir)
    })

    it('should have invalidateCache method', () => {
      assert.strictEqual(typeof puffinState.invalidateCache, 'function')
    })

    it('should invalidate specific cache types', () => {
      // Set some cache values
      puffinState.userStories = [{ id: 'test' }]
      puffinState.archivedStories = [{ id: 'archived' }]
      puffinState.activeSprint = { id: 'sprint' }

      // Invalidate only userStories
      puffinState.invalidateCache(['userStories'])

      assert.strictEqual(puffinState.userStories, null)
      assert.notStrictEqual(puffinState.archivedStories, null)
      assert.notStrictEqual(puffinState.activeSprint, null)
    })

    it('should invalidate all caches when no types specified', () => {
      // Set some cache values
      puffinState.userStories = [{ id: 'test' }]
      puffinState.archivedStories = [{ id: 'archived' }]
      puffinState.activeSprint = { id: 'sprint' }

      // Invalidate all
      puffinState.invalidateCache()

      assert.strictEqual(puffinState.userStories, null)
      assert.strictEqual(puffinState.archivedStories, null)
      assert.strictEqual(puffinState.activeSprint, null)
    })

    it('should query SQLite on getUserStories even if cache is null', async () => {
      // Add a story to SQLite
      await puffinState.addUserStory({ title: 'SQLite Story' })

      // Clear the cache
      puffinState.invalidateCache(['userStories'])
      assert.strictEqual(puffinState.userStories, null)

      // getUserStories should still return the story from SQLite
      const stories = puffinState.getUserStories()
      assert.ok(Array.isArray(stories))
      assert.strictEqual(stories.length, 1)
      assert.strictEqual(stories[0].title, 'SQLite Story')

      // Cache should now be populated
      assert.notStrictEqual(puffinState.userStories, null)
    })

    it('should query SQLite on getArchivedStories even if cache is null', async () => {
      // Add and archive a story
      const story = await puffinState.addUserStory({ title: 'To Archive' })
      await puffinState.updateUserStory(story.id, { status: 'archived' })

      // Clear the cache
      puffinState.invalidateCache(['archivedStories'])
      assert.strictEqual(puffinState.archivedStories, null)

      // getArchivedStories should still return from SQLite
      const archived = puffinState.getArchivedStories()
      assert.ok(Array.isArray(archived))
      assert.strictEqual(archived.length, 1)
      assert.strictEqual(archived[0].title, 'To Archive')
    })

    it('should work correctly after cache invalidation on add', async () => {
      // Add first story
      const story1 = await puffinState.addUserStory({ title: 'Story 1' })

      // Cache is invalidated by addUserStory, verify we can still read
      const stories = puffinState.getUserStories()
      assert.strictEqual(stories.length, 1)

      // Add second story
      await puffinState.addUserStory({ title: 'Story 2' })

      // Should see both stories
      const allStories = puffinState.getUserStories()
      assert.strictEqual(allStories.length, 2)
    })

    it('should work correctly after cache invalidation on update', async () => {
      const story = await puffinState.addUserStory({ title: 'Original' })

      // Update the story (this invalidates cache)
      await puffinState.updateUserStory(story.id, { title: 'Updated' })

      // Should see the updated title
      const stories = puffinState.getUserStories()
      assert.strictEqual(stories[0].title, 'Updated')
    })

    it('should work correctly after cache invalidation on delete', async () => {
      await puffinState.addUserStory({ title: 'Story 1' })
      const story2 = await puffinState.addUserStory({ title: 'Story 2' })

      // Delete one story (this invalidates cache)
      await puffinState.deleteUserStory(story2.id)

      // Should see only one story
      const stories = puffinState.getUserStories()
      assert.strictEqual(stories.length, 1)
      assert.strictEqual(stories[0].title, 'Story 1')
    })

    it('should populate cache from SQLite reads', async () => {
      // Add a story
      await puffinState.addUserStory({ title: 'Test' })

      // Clear cache completely
      puffinState.invalidateCache()
      assert.strictEqual(puffinState.userStories, null)

      // Read should populate cache
      const stories = puffinState.getUserStories()
      assert.strictEqual(stories.length, 1)

      // Cache should now be set
      assert.ok(puffinState.userStories !== null)
      assert.strictEqual(puffinState.userStories.length, 1)
    })

    it('should return empty array on getUserStories with null cache and no SQLite data', () => {
      // Fresh state with no stories
      puffinState.invalidateCache(['userStories'])

      const stories = puffinState.getUserStories()
      assert.ok(Array.isArray(stories))
      assert.strictEqual(stories.length, 0)
    })

    it('getState should use SQLite-first accessors', async () => {
      // Add a story
      await puffinState.addUserStory({ title: 'State Test' })

      // Invalidate cache
      puffinState.invalidateCache()

      // getState should still return the story
      const state = puffinState.getState()
      assert.ok(Array.isArray(state.userStories))
      assert.strictEqual(state.userStories.length, 1)
      assert.strictEqual(state.userStories[0].title, 'State Test')
    })
  })
})
