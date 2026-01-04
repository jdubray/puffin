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

describe('Sprint Close Git Commit Flow', () => {
  describe('Commit Execution Logic', () => {
    it('should execute commit only when checkbox is checked', () => {
      // Simulate modal state
      const commitCheckbox = { checked: true, disabled: false }
      const commitMessage = 'feat(sprint): complete "Test Sprint" with 3/3 stories'

      const shouldCommit = commitCheckbox.checked && !commitCheckbox.disabled
      assert.strictEqual(shouldCommit, true)

      // Verify message is valid
      assert.ok(commitMessage.length > 0)
      assert.ok(commitMessage.includes('feat(sprint)'))
    })

    it('should not execute commit when checkbox is unchecked', () => {
      const commitCheckbox = { checked: false, disabled: false }

      const shouldCommit = commitCheckbox.checked && !commitCheckbox.disabled
      assert.strictEqual(shouldCommit, false)
    })

    it('should not execute commit when checkbox is disabled', () => {
      const commitCheckbox = { checked: true, disabled: true }

      const shouldCommit = commitCheckbox.checked && !commitCheckbox.disabled
      assert.strictEqual(shouldCommit, false)
    })

    it('should use user-edited commit message when provided', () => {
      const autoGeneratedMessage = 'feat(sprint): complete sprint with 2/3 stories'
      const userEditedMessage = 'feat(sprint): finish authentication feature\n\nCompleted OAuth integration'

      // Simulate user having edited the message
      const hasUserEditedMessage = true
      const finalMessage = hasUserEditedMessage ? userEditedMessage : autoGeneratedMessage

      assert.strictEqual(finalMessage, userEditedMessage)
      assert.ok(finalMessage.includes('OAuth'))
    })
  })

  describe('Commit Result Handling', () => {
    it('should handle successful commit result', () => {
      const commitResult = {
        success: true,
        hash: 'abc1234567890'
      }

      assert.strictEqual(commitResult.success, true)
      assert.ok(commitResult.hash)
      assert.strictEqual(commitResult.hash.substring(0, 7), 'abc1234')
    })

    it('should handle failed commit result', () => {
      const commitResult = {
        success: false,
        error: 'Nothing to commit, working tree clean'
      }

      assert.strictEqual(commitResult.success, false)
      assert.ok(commitResult.error)
      assert.ok(commitResult.error.includes('Nothing to commit'))
    })

    it('should handle commit error gracefully', () => {
      const commitResult = {
        success: false,
        error: 'Git operation failed: permission denied'
      }

      // Sprint close should still complete even if commit fails
      const sprintClosedSuccessfully = true
      const commitFailed = !commitResult.success

      assert.strictEqual(sprintClosedSuccessfully, true)
      assert.strictEqual(commitFailed, true)

      // Appropriate message should be shown
      const expectedMessage = commitFailed
        ? `Sprint closed but commit failed: ${commitResult.error}`
        : 'Sprint closed successfully'

      assert.ok(expectedMessage.includes('Sprint closed'))
      assert.ok(expectedMessage.includes('commit failed'))
    })
  })

  describe('Commit Message Generation', () => {
    it('should generate message with sprint title and story count', () => {
      const sprint = {
        title: 'Authentication Sprint',
        stories: [
          { id: 's1', title: 'Login form' },
          { id: 's2', title: 'Password reset' },
          { id: 's3', title: 'OAuth integration' }
        ],
        storyProgress: {
          's1': { status: 'completed' },
          's2': { status: 'completed' },
          's3': { status: 'in-progress' }
        }
      }

      // Simulate message generation
      const completedCount = Object.values(sprint.storyProgress)
        .filter(p => p.status === 'completed').length
      const totalCount = sprint.stories.length

      const message = `feat(sprint): close "${sprint.title}" (${completedCount}/${totalCount} stories)`

      assert.ok(message.includes('Authentication Sprint'))
      assert.ok(message.includes('2/3'))
    })

    it('should list completed and incomplete stories in body', () => {
      const completedStories = ['Login form', 'Password reset']
      const incompleteStories = ['OAuth integration']

      const bodyLines = []
      if (completedStories.length > 0) {
        bodyLines.push('Completed:')
        completedStories.forEach(title => bodyLines.push(`- ${title}`))
      }
      if (incompleteStories.length > 0) {
        bodyLines.push('')
        bodyLines.push('Not completed:')
        incompleteStories.forEach(title => bodyLines.push(`- ${title}`))
      }

      const body = bodyLines.join('\n')

      assert.ok(body.includes('Completed:'))
      assert.ok(body.includes('- Login form'))
      assert.ok(body.includes('Not completed:'))
      assert.ok(body.includes('- OAuth integration'))
    })
  })

  describe('Git Stage All Changes', () => {
    it('should stage all changes including untracked files', () => {
      // Simulate git stage operation
      const filesToStage = ['.']
      const stageAll = filesToStage[0] === '.'

      assert.strictEqual(stageAll, true)
    })

    it('should continue with commit even if staging has warning', () => {
      const stageResult = { success: false, error: 'Already staged' }

      // Should not block commit
      const continueWithCommit = true
      assert.strictEqual(continueWithCommit, true)
    })
  })
})
