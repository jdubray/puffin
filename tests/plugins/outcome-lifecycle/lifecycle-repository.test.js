/**
 * Tests for Lifecycle Repository
 */

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const { LifecycleRepository, VALID_STATUSES } = require('../../../plugins/outcome-lifecycle-plugin/lib/lifecycle-repository')

/**
 * In-memory mock of Storage for unit testing.
 * Mirrors the load()/save() interface of the real Storage class.
 */
class MockStorage {
  constructor(initialData = null) {
    this.data = initialData || { version: 1, lifecycles: [] }
    this.saveCount = 0
  }

  async load() {
    // Return a deep copy to simulate file read
    return JSON.parse(JSON.stringify(this.data))
  }

  async save(data) {
    this.data = JSON.parse(JSON.stringify(data))
    this.saveCount++
  }
}

describe('LifecycleRepository', () => {
  let storage
  let repo

  beforeEach(() => {
    storage = new MockStorage()
    repo = new LifecycleRepository(storage)
  })

  // --- Constructor ---

  describe('constructor', () => {
    it('should throw if storage is not provided', () => {
      assert.throws(() => new LifecycleRepository(null), /requires a Storage instance/)
    })
  })

  // --- create ---

  describe('create', () => {
    it('should create a lifecycle with title and description', async () => {
      const lc = await repo.create('Ship auth', 'Users can log in')

      assert.ok(lc.id)
      assert.strictEqual(lc.title, 'Ship auth')
      assert.strictEqual(lc.description, 'Users can log in')
      assert.strictEqual(lc.status, 'not_started')
      assert.deepStrictEqual(lc.dependencies, [])
      assert.deepStrictEqual(lc.storyMappings, [])
      assert.ok(lc.createdAt)
      assert.ok(lc.updatedAt)
    })

    it('should create a lifecycle with title only', async () => {
      const lc = await repo.create('Ship auth')

      assert.strictEqual(lc.title, 'Ship auth')
      assert.strictEqual(lc.description, '')
    })

    it('should trim whitespace from title and description', async () => {
      const lc = await repo.create('  Ship auth  ', '  Users can log in  ')

      assert.strictEqual(lc.title, 'Ship auth')
      assert.strictEqual(lc.description, 'Users can log in')
    })

    it('should persist the created lifecycle', async () => {
      await repo.create('First', 'desc')
      await repo.create('Second', 'desc')

      assert.strictEqual(storage.data.lifecycles.length, 2)
      assert.strictEqual(storage.saveCount, 2)
    })

    it('should generate unique IDs', async () => {
      const lc1 = await repo.create('One')
      const lc2 = await repo.create('Two')

      assert.notStrictEqual(lc1.id, lc2.id)
    })

    it('should throw if title is missing', async () => {
      await assert.rejects(() => repo.create(''), /title is required/)
      await assert.rejects(() => repo.create(null), /title is required/)
      await assert.rejects(() => repo.create(undefined), /title is required/)
    })

    it('should throw if title is whitespace-only', async () => {
      await assert.rejects(() => repo.create('   '), /title is required/)
    })

    it('should handle non-string description gracefully', async () => {
      const lc = await repo.create('Title', 42)
      assert.strictEqual(lc.description, '')
    })
  })

  // --- get ---

  describe('get', () => {
    it('should retrieve a lifecycle by ID', async () => {
      const created = await repo.create('Test', 'desc')
      const found = await repo.get(created.id)

      assert.strictEqual(found.id, created.id)
      assert.strictEqual(found.title, 'Test')
    })

    it('should return null for non-existent ID', async () => {
      const found = await repo.get('non-existent-id')
      assert.strictEqual(found, null)
    })

    it('should return null for null/undefined ID', async () => {
      assert.strictEqual(await repo.get(null), null)
      assert.strictEqual(await repo.get(undefined), null)
    })
  })

  // --- update ---

  describe('update', () => {
    it('should update title', async () => {
      const created = await repo.create('Old title', 'desc')
      const updated = await repo.update(created.id, { title: 'New title' })

      assert.strictEqual(updated.title, 'New title')
      assert.strictEqual(updated.description, 'desc')
    })

    it('should update description', async () => {
      const created = await repo.create('Title', 'Old desc')
      const updated = await repo.update(created.id, { description: 'New desc' })

      assert.strictEqual(updated.description, 'New desc')
    })

    it('should update status', async () => {
      const created = await repo.create('Title')
      const updated = await repo.update(created.id, { status: 'in_progress' })

      assert.strictEqual(updated.status, 'in_progress')
    })

    it('should update multiple fields at once', async () => {
      const created = await repo.create('Title', 'desc')
      const updated = await repo.update(created.id, {
        title: 'New',
        description: 'New desc',
        status: 'achieved'
      })

      assert.strictEqual(updated.title, 'New')
      assert.strictEqual(updated.description, 'New desc')
      assert.strictEqual(updated.status, 'achieved')
    })

    it('should set updatedAt timestamp', async () => {
      const created = await repo.create('Title')
      // Small delay to ensure different timestamps
      const updated = await repo.update(created.id, { title: 'New' })

      assert.ok(updated.updatedAt >= created.updatedAt)
    })

    it('should trim string values', async () => {
      const created = await repo.create('Title')
      const updated = await repo.update(created.id, { title: '  Trimmed  ' })

      assert.strictEqual(updated.title, 'Trimmed')
    })

    it('should ignore fields not in UPDATABLE_FIELDS', async () => {
      const created = await repo.create('Title')
      const updated = await repo.update(created.id, {
        title: 'New',
        id: 'hacked-id',
        createdAt: '2000-01-01',
        storyMappings: ['injected'],
        dependencies: ['injected']
      })

      assert.strictEqual(updated.id, created.id)
      assert.strictEqual(updated.createdAt, created.createdAt)
      assert.deepStrictEqual(updated.storyMappings, [])
      assert.deepStrictEqual(updated.dependencies, [])
    })

    it('should return null for non-existent ID', async () => {
      const result = await repo.update('no-such-id', { title: 'x' })
      assert.strictEqual(result, null)
    })

    it('should return null for null/invalid args', async () => {
      assert.strictEqual(await repo.update(null, {}), null)
      assert.strictEqual(await repo.update('id', null), null)
    })

    it('should throw for invalid status', async () => {
      const created = await repo.create('Title')
      await assert.rejects(
        () => repo.update(created.id, { status: 'invalid' }),
        /Invalid status/
      )
    })

    it('should throw if title is set to empty', async () => {
      const created = await repo.create('Title')
      await assert.rejects(
        () => repo.update(created.id, { title: '' }),
        /non-empty string/
      )
    })
  })

  // --- delete ---

  describe('delete', () => {
    it('should delete a lifecycle', async () => {
      const created = await repo.create('Title')
      const result = await repo.delete(created.id)

      assert.strictEqual(result, true)
      assert.strictEqual(storage.data.lifecycles.length, 0)
    })

    it('should return false for non-existent ID', async () => {
      const result = await repo.delete('no-such-id')
      assert.strictEqual(result, false)
    })

    it('should return false for null ID', async () => {
      assert.strictEqual(await repo.delete(null), false)
    })

    it('should remove deleted ID from other lifecycles dependencies', async () => {
      const lc1 = await repo.create('First')
      const lc2 = await repo.create('Second')

      // Manually add dependency to simulate DAG
      const data = await storage.load()
      data.lifecycles[1].dependencies = [lc1.id]
      await storage.save(data)

      await repo.delete(lc1.id)

      const remaining = await repo.get(lc2.id)
      assert.deepStrictEqual(remaining.dependencies, [])
    })

    it('should not affect unrelated lifecycles', async () => {
      const lc1 = await repo.create('First')
      const lc2 = await repo.create('Second')
      const lc3 = await repo.create('Third')

      await repo.delete(lc2.id)

      assert.ok(await repo.get(lc1.id))
      assert.strictEqual(await repo.get(lc2.id), null)
      assert.ok(await repo.get(lc3.id))
    })
  })

  // --- list ---

  describe('list', () => {
    it('should return all lifecycles when no filters', async () => {
      await repo.create('A')
      await repo.create('B')
      await repo.create('C')

      const results = await repo.list()
      assert.strictEqual(results.length, 3)
    })

    it('should return empty array when no lifecycles exist', async () => {
      const results = await repo.list()
      assert.deepStrictEqual(results, [])
    })

    it('should filter by status', async () => {
      const lc1 = await repo.create('A')
      await repo.create('B')
      await repo.update(lc1.id, { status: 'in_progress' })

      const results = await repo.list({ status: 'in_progress' })
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].title, 'A')
    })

    it('should search in title and description', async () => {
      await repo.create('Login feature', 'Authentication flow')
      await repo.create('Dashboard', 'Main page layout')
      await repo.create('Auth config', 'Configure providers')

      const results = await repo.list({ search: 'auth' })
      assert.strictEqual(results.length, 2)
    })

    it('should search case-insensitively', async () => {
      await repo.create('LOGIN', 'AUTHENTICATION')
      const results = await repo.list({ search: 'login' })
      assert.strictEqual(results.length, 1)
    })

    it('should sort by createdAt descending by default', async () => {
      await repo.create('First')
      await repo.create('Second')
      await repo.create('Third')

      // Set distinct timestamps to make sort deterministic
      storage.data.lifecycles[0].createdAt = '2026-01-01T00:00:00.000Z'
      storage.data.lifecycles[1].createdAt = '2026-01-02T00:00:00.000Z'
      storage.data.lifecycles[2].createdAt = '2026-01-03T00:00:00.000Z'

      const results = await repo.list()
      assert.strictEqual(results[0].title, 'Third')
      assert.strictEqual(results[2].title, 'First')
    })

    it('should sort ascending when specified', async () => {
      await repo.create('First')
      await repo.create('Second')

      const results = await repo.list({ sortOrder: 'asc' })
      assert.strictEqual(results[0].title, 'First')
      assert.strictEqual(results[1].title, 'Second')
    })

    it('should sort by title', async () => {
      await repo.create('Banana')
      await repo.create('Apple')
      await repo.create('Cherry')

      const results = await repo.list({ sortBy: 'title', sortOrder: 'asc' })
      assert.strictEqual(results[0].title, 'Apple')
      assert.strictEqual(results[1].title, 'Banana')
      assert.strictEqual(results[2].title, 'Cherry')
    })

    it('should combine status filter and search', async () => {
      const lc1 = await repo.create('Auth login', 'desc')
      await repo.create('Auth signup', 'desc')
      await repo.update(lc1.id, { status: 'achieved' })

      const results = await repo.list({ status: 'achieved', search: 'auth' })
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].title, 'Auth login')
    })
  })

  // --- VALID_STATUSES ---

  describe('VALID_STATUSES', () => {
    it('should contain expected values', () => {
      assert.deepStrictEqual(VALID_STATUSES, ['not_started', 'in_progress', 'achieved'])
    })
  })
})
