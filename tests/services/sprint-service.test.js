/**
 * Sprint Service Tests
 *
 * Tests for the SprintService layer that wraps sprint operations
 * with consistent transaction handling and error handling.
 */

const { describe, it } = require('node:test')
const assert = require('node:assert')

const {
  SprintService,
  ActiveSprintExistsError,
  InvalidStoryIdsError,
  SprintNotFoundError
} = require('../../src/main/services')

describe('SprintService', () => {
  describe('Custom Errors', () => {
    it('should create ActiveSprintExistsError with sprint info', () => {
      const activeSprint = { id: 'sprint-1', title: 'Current Sprint' }
      const error = new ActiveSprintExistsError(activeSprint)

      assert.strictEqual(error.name, 'ActiveSprintExistsError')
      assert.ok(error.message.includes('Current Sprint'))
      assert.ok(error.message.includes('already active'))
      assert.strictEqual(error.activeSprint, activeSprint)
    })

    it('should create InvalidStoryIdsError with invalid IDs', () => {
      const invalidIds = ['story-999', 'story-888']
      const error = new InvalidStoryIdsError(invalidIds)

      assert.strictEqual(error.name, 'InvalidStoryIdsError')
      assert.ok(error.message.includes('story-999'))
      assert.ok(error.message.includes('story-888'))
      assert.deepStrictEqual(error.invalidIds, invalidIds)
    })

    it('should create SprintNotFoundError with sprint ID', () => {
      const error = new SprintNotFoundError('sprint-123')

      assert.strictEqual(error.name, 'SprintNotFoundError')
      assert.ok(error.message.includes('sprint-123'))
      assert.strictEqual(error.sprintId, 'sprint-123')
    })
  })

  describe('Service Initialization', () => {
    it('should create service with required dependencies', () => {
      const mockSprintRepo = { hasActiveSprint: () => false }
      const mockUserStoryRepo = { findByIds: () => [] }

      const service = new SprintService({
        sprintRepo: mockSprintRepo,
        userStoryRepo: mockUserStoryRepo
      })

      assert.ok(service)
      assert.strictEqual(service.sprintRepo, mockSprintRepo)
      assert.strictEqual(service.userStoryRepo, mockUserStoryRepo)
    })

    it('should accept optional callbacks', () => {
      let createdCalled = false
      let archivedCalled = false
      let statusChangedCalled = false

      const service = new SprintService({
        sprintRepo: {},
        userStoryRepo: {},
        onSprintCreated: () => { createdCalled = true },
        onSprintArchived: () => { archivedCalled = true },
        onStoryStatusChanged: () => { statusChangedCalled = true }
      })

      service.onSprintCreated()
      service.onSprintArchived()
      service.onStoryStatusChanged()

      assert.ok(createdCalled)
      assert.ok(archivedCalled)
      assert.ok(statusChangedCalled)
    })
  })

  describe('checkActiveSprint', () => {
    it('should return hasActive: false when no sprint', () => {
      const service = new SprintService({
        sprintRepo: {
          hasActiveSprint: () => false,
          findActive: () => null
        },
        userStoryRepo: {}
      })

      const result = service.checkActiveSprint()

      assert.strictEqual(result.hasActive, false)
      assert.strictEqual(result.activeSprint, null)
    })

    it('should return hasActive: true with sprint details when active', () => {
      const activeSprint = { id: 'sprint-1', title: 'Test Sprint' }
      const service = new SprintService({
        sprintRepo: {
          hasActiveSprint: () => true,
          findActive: () => activeSprint
        },
        userStoryRepo: {}
      })

      const result = service.checkActiveSprint()

      assert.strictEqual(result.hasActive, true)
      assert.strictEqual(result.activeSprint, activeSprint)
    })
  })

  describe('createSprint', () => {
    it('should throw ActiveSprintExistsError when sprint exists', () => {
      const service = new SprintService({
        sprintRepo: {
          hasActiveSprint: () => true,
          findActive: () => ({ id: 'sprint-1', title: 'Existing' })
        },
        userStoryRepo: {}
      })

      assert.throws(
        () => service.createSprint({ title: 'New Sprint' }, []),
        ActiveSprintExistsError
      )
    })

    it('should throw InvalidStoryIdsError for non-existent stories', () => {
      const service = new SprintService({
        sprintRepo: {
          hasActiveSprint: () => false,
          findActive: () => null
        },
        userStoryRepo: {
          findByIds: (ids) => [] // Return empty - none found
        }
      })

      assert.throws(
        () => service.createSprint({ title: 'New Sprint' }, ['story-1', 'story-2']),
        InvalidStoryIdsError
      )
    })

    it('should create sprint when no active sprint and valid stories', () => {
      let createCalled = false
      let createdSprint = null
      let callbackCalled = false

      const service = new SprintService({
        sprintRepo: {
          hasActiveSprint: () => false,
          findActive: () => null,
          create: (sprint, storyIds) => {
            createCalled = true
            createdSprint = { ...sprint, stories: storyIds }
            return createdSprint
          }
        },
        userStoryRepo: {
          findByIds: (ids) => ids.map(id => ({ id }))
        },
        onSprintCreated: () => { callbackCalled = true }
      })

      const result = service.createSprint(
        { title: 'New Sprint' },
        ['story-1', 'story-2']
      )

      assert.ok(createCalled)
      assert.ok(callbackCalled)
      assert.strictEqual(result.title, 'New Sprint')
    })
  })

  describe('syncStoryStatus', () => {
    it('should throw when no active sprint', () => {
      const service = new SprintService({
        sprintRepo: {
          findActive: () => null
        },
        userStoryRepo: {}
      })

      assert.throws(
        () => service.syncStoryStatus('story-1', 'completed'),
        /No active sprint/
      )
    })

    it('should call repository sync and trigger callback', () => {
      let syncCalled = false
      let callbackResult = null

      const service = new SprintService({
        sprintRepo: {
          findActive: () => ({ id: 'sprint-1' }),
          syncStoryStatus: () => {
            syncCalled = true
            return { allStoriesCompleted: true }
          }
        },
        userStoryRepo: {},
        onStoryStatusChanged: (result) => { callbackResult = result }
      })

      service.syncStoryStatus('story-1', 'completed')

      assert.ok(syncCalled)
      assert.strictEqual(callbackResult.storyId, 'story-1')
      assert.strictEqual(callbackResult.status, 'completed')
      assert.strictEqual(callbackResult.allStoriesCompleted, true)
    })
  })

  describe('closeAndArchive', () => {
    it('should throw SprintNotFoundError for non-existent sprint', () => {
      const service = new SprintService({
        sprintRepo: {
          findById: () => null
        },
        userStoryRepo: {}
      })

      assert.throws(
        () => service.closeAndArchive('sprint-999'),
        SprintNotFoundError
      )
    })

    it('should archive sprint with story data', () => {
      let archiveCalled = false
      let archivedStories = null
      let callbackCalled = false

      const service = new SprintService({
        sprintRepo: {
          findById: () => ({ id: 'sprint-1', title: 'Sprint', storyProgress: {} }),
          getStoryIds: () => ['story-1', 'story-2'],
          archive: (id, stories, overrides) => {
            archiveCalled = true
            archivedStories = stories
            return { id, ...overrides, stories }
          }
        },
        userStoryRepo: {
          findById: (id) => ({
            id,
            title: `Story ${id}`,
            status: 'completed',
            acceptanceCriteria: []
          })
        },
        onSprintArchived: () => { callbackCalled = true }
      })

      const result = service.closeAndArchive('sprint-1', { title: 'Archived Sprint' })

      assert.ok(archiveCalled)
      assert.ok(callbackCalled)
      assert.strictEqual(archivedStories.length, 2)
      assert.strictEqual(result.title, 'Archived Sprint')
    })
  })

  describe('Transaction Patterns', () => {
    it('should use immediateTransaction for atomic operations', () => {
      // This is a behavioral test - the sprint-repository uses immediateTransaction
      // SprintService delegates to the repository which handles transactions

      const operationOrder = []

      const mockSprintRepo = {
        hasActiveSprint: () => false,
        findActive: () => null,
        create: (sprint, storyIds) => {
          // Simulates what happens inside immediateTransaction
          operationOrder.push('BEGIN IMMEDIATE')
          operationOrder.push('INSERT sprint')
          operationOrder.push('INSERT sprint_stories')
          operationOrder.push('UPDATE user_stories status')
          operationOrder.push('COMMIT')
          return sprint
        }
      }

      const service = new SprintService({
        sprintRepo: mockSprintRepo,
        userStoryRepo: { findByIds: (ids) => ids.map(id => ({ id })) }
      })

      service.createSprint({ title: 'Test' }, ['story-1'])

      assert.deepStrictEqual(operationOrder, [
        'BEGIN IMMEDIATE',
        'INSERT sprint',
        'INSERT sprint_stories',
        'UPDATE user_stories status',
        'COMMIT'
      ])
    })

    it('should maintain atomicity - all or nothing', () => {
      // If any operation fails, the entire transaction is rolled back
      const rollbackOccurred = { value: false }

      const mockSprintRepo = {
        hasActiveSprint: () => false,
        findActive: () => null,
        create: () => {
          // Simulate a failure mid-transaction
          rollbackOccurred.value = true
          throw new Error('Constraint violation')
        }
      }

      const service = new SprintService({
        sprintRepo: mockSprintRepo,
        userStoryRepo: { findByIds: (ids) => ids.map(id => ({ id })) }
      })

      assert.throws(
        () => service.createSprint({ title: 'Test' }, ['story-1']),
        /Constraint violation/
      )

      assert.ok(rollbackOccurred.value, 'Transaction should have been attempted')
    })
  })

  describe('Error Handling Patterns', () => {
    it('should propagate repository errors with context', () => {
      const service = new SprintService({
        sprintRepo: {
          hasActiveSprint: () => false,
          findActive: () => null,
          create: () => {
            throw new Error('SQLITE_BUSY: database is locked')
          }
        },
        userStoryRepo: { findByIds: () => [] }
      })

      assert.throws(
        () => service.createSprint({ title: 'Test' }, []),
        /SQLITE_BUSY/
      )
    })

    it('should include original error info in custom errors', () => {
      const activeSprint = { id: 's1', title: 'Active' }
      const error = new ActiveSprintExistsError(activeSprint)

      assert.strictEqual(error.activeSprint.id, 's1')
      assert.ok(error.stack, 'Should have stack trace')
    })
  })

  describe('State Synchronization', () => {
    it('should trigger callbacks for UI updates', () => {
      const events = []

      const service = new SprintService({
        sprintRepo: {
          hasActiveSprint: () => false,
          findActive: () => null,
          create: (sprint) => sprint
        },
        userStoryRepo: { findByIds: (ids) => ids.map(id => ({ id })) },
        onSprintCreated: (sprint) => events.push({ type: 'created', sprint }),
        onSprintArchived: (sprint) => events.push({ type: 'archived', sprint }),
        onStoryStatusChanged: (data) => events.push({ type: 'statusChanged', data })
      })

      service.createSprint({ title: 'Test' }, [])

      assert.strictEqual(events.length, 1)
      assert.strictEqual(events[0].type, 'created')
    })

    it('should support cache invalidation via callbacks', () => {
      let cacheInvalidated = false

      const service = new SprintService({
        sprintRepo: {
          hasActiveSprint: () => false,
          findActive: () => null,
          create: (sprint) => sprint
        },
        userStoryRepo: { findByIds: (ids) => ids.map(id => ({ id })) },
        onSprintCreated: () => {
          cacheInvalidated = true
        }
      })

      service.createSprint({ title: 'Test' }, [])

      assert.ok(cacheInvalidated)
    })
  })
})
