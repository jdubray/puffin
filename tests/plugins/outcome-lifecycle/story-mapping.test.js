/**
 * Tests for Story Mapping operations in LifecycleRepository
 */

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert')
const { LifecycleRepository } = require('../../../plugins/outcome-lifecycle-plugin/lib/lifecycle-repository')

/**
 * In-memory mock of Storage for unit testing.
 */
class MockStorage {
  constructor(initialData = null) {
    this.data = initialData || { version: 1, lifecycles: [] }
  }

  async load() {
    return JSON.parse(JSON.stringify(this.data))
  }

  async save(data) {
    this.data = JSON.parse(JSON.stringify(data))
  }
}

describe('Story Mapping', () => {
  let storage
  let repo

  beforeEach(() => {
    storage = new MockStorage()
    repo = new LifecycleRepository(storage)
  })

  // --- mapStory ---

  describe('mapStory', () => {
    it('should map a story to a lifecycle', async () => {
      const lc = await repo.create('Outcome A')
      const updated = await repo.mapStory(lc.id, 'story-1')

      assert.deepStrictEqual(updated.storyMappings, ['story-1'])
    })

    it('should map multiple stories to a lifecycle', async () => {
      const lc = await repo.create('Outcome A')
      await repo.mapStory(lc.id, 'story-1')
      const updated = await repo.mapStory(lc.id, 'story-2')

      assert.deepStrictEqual(updated.storyMappings, ['story-1', 'story-2'])
    })

    it('should prevent duplicate mappings', async () => {
      const lc = await repo.create('Outcome A')
      await repo.mapStory(lc.id, 'story-1')
      const updated = await repo.mapStory(lc.id, 'story-1')

      assert.deepStrictEqual(updated.storyMappings, ['story-1'])
    })

    it('should update updatedAt timestamp', async () => {
      const lc = await repo.create('Outcome A')
      const updated = await repo.mapStory(lc.id, 'story-1')

      assert.ok(updated.updatedAt >= lc.updatedAt)
    })

    it('should persist the mapping', async () => {
      const lc = await repo.create('Outcome A')
      await repo.mapStory(lc.id, 'story-1')

      const reloaded = await repo.get(lc.id)
      assert.deepStrictEqual(reloaded.storyMappings, ['story-1'])
    })

    it('should return null for non-existent lifecycle', async () => {
      const result = await repo.mapStory('no-such-id', 'story-1')
      assert.strictEqual(result, null)
    })

    it('should return null for null lifecycleId', async () => {
      assert.strictEqual(await repo.mapStory(null, 'story-1'), null)
    })

    it('should throw for missing storyId', async () => {
      const lc = await repo.create('Outcome A')
      await assert.rejects(() => repo.mapStory(lc.id, ''), /storyId is required/)
      await assert.rejects(() => repo.mapStory(lc.id, null), /storyId is required/)
    })
  })

  // --- unmapStory ---

  describe('unmapStory', () => {
    it('should remove a story mapping', async () => {
      const lc = await repo.create('Outcome A')
      await repo.mapStory(lc.id, 'story-1')
      await repo.mapStory(lc.id, 'story-2')

      const updated = await repo.unmapStory(lc.id, 'story-1')

      assert.deepStrictEqual(updated.storyMappings, ['story-2'])
    })

    it('should persist the removal', async () => {
      const lc = await repo.create('Outcome A')
      await repo.mapStory(lc.id, 'story-1')
      await repo.unmapStory(lc.id, 'story-1')

      const reloaded = await repo.get(lc.id)
      assert.deepStrictEqual(reloaded.storyMappings, [])
    })

    it('should return lifecycle unchanged if story not mapped', async () => {
      const lc = await repo.create('Outcome A')
      await repo.mapStory(lc.id, 'story-1')

      const result = await repo.unmapStory(lc.id, 'story-999')
      assert.deepStrictEqual(result.storyMappings, ['story-1'])
    })

    it('should return null for non-existent lifecycle', async () => {
      assert.strictEqual(await repo.unmapStory('no-such-id', 'story-1'), null)
    })

    it('should return null for null arguments', async () => {
      assert.strictEqual(await repo.unmapStory(null, 'story-1'), null)
      assert.strictEqual(await repo.unmapStory('id', null), null)
    })
  })

  // --- getStoriesForLifecycle ---

  describe('getStoriesForLifecycle', () => {
    it('should return mapped story IDs', async () => {
      const lc = await repo.create('Outcome A')
      await repo.mapStory(lc.id, 'story-1')
      await repo.mapStory(lc.id, 'story-2')

      const stories = await repo.getStoriesForLifecycle(lc.id)
      assert.deepStrictEqual(stories, ['story-1', 'story-2'])
    })

    it('should return empty array for lifecycle with no mappings', async () => {
      const lc = await repo.create('Outcome A')
      const stories = await repo.getStoriesForLifecycle(lc.id)
      assert.deepStrictEqual(stories, [])
    })

    it('should return empty array for non-existent lifecycle', async () => {
      const stories = await repo.getStoriesForLifecycle('no-such-id')
      assert.deepStrictEqual(stories, [])
    })

    it('should return empty array for null id', async () => {
      assert.deepStrictEqual(await repo.getStoriesForLifecycle(null), [])
    })

    it('should return a copy, not the original array', async () => {
      const lc = await repo.create('Outcome A')
      await repo.mapStory(lc.id, 'story-1')

      const stories = await repo.getStoriesForLifecycle(lc.id)
      stories.push('injected')

      const storiesAgain = await repo.getStoriesForLifecycle(lc.id)
      assert.deepStrictEqual(storiesAgain, ['story-1'])
    })
  })

  // --- getLifecyclesForStory ---

  describe('getLifecyclesForStory', () => {
    it('should return all lifecycles containing a story', async () => {
      const lc1 = await repo.create('Outcome A')
      const lc2 = await repo.create('Outcome B')
      await repo.create('Outcome C')

      await repo.mapStory(lc1.id, 'story-1')
      await repo.mapStory(lc2.id, 'story-1')

      const lifecycles = await repo.getLifecyclesForStory('story-1')
      assert.strictEqual(lifecycles.length, 2)

      const ids = lifecycles.map(lc => lc.id)
      assert.ok(ids.includes(lc1.id))
      assert.ok(ids.includes(lc2.id))
    })

    it('should return empty array if story is not mapped anywhere', async () => {
      await repo.create('Outcome A')
      const lifecycles = await repo.getLifecyclesForStory('unmapped-story')
      assert.deepStrictEqual(lifecycles, [])
    })

    it('should return empty array for null storyId', async () => {
      assert.deepStrictEqual(await repo.getLifecyclesForStory(null), [])
    })

    it('should not include lifecycles after unmapping', async () => {
      const lc1 = await repo.create('Outcome A')
      const lc2 = await repo.create('Outcome B')

      await repo.mapStory(lc1.id, 'story-1')
      await repo.mapStory(lc2.id, 'story-1')
      await repo.unmapStory(lc1.id, 'story-1')

      const lifecycles = await repo.getLifecyclesForStory('story-1')
      assert.strictEqual(lifecycles.length, 1)
      assert.strictEqual(lifecycles[0].id, lc2.id)
    })
  })

  // --- Cross-cutting ---

  describe('delete lifecycle clears mappings', () => {
    it('should remove lifecycle and its mappings from getLifecyclesForStory', async () => {
      const lc1 = await repo.create('Outcome A')
      const lc2 = await repo.create('Outcome B')

      await repo.mapStory(lc1.id, 'story-1')
      await repo.mapStory(lc2.id, 'story-1')

      await repo.delete(lc1.id)

      const lifecycles = await repo.getLifecyclesForStory('story-1')
      assert.strictEqual(lifecycles.length, 1)
      assert.strictEqual(lifecycles[0].id, lc2.id)
    })
  })
})
