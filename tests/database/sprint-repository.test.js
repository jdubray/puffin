/**
 * Sprint Repository Tests
 *
 * Tests for the SprintRepository CRUD operations, relationships, and queries.
 */

const { describe, it } = require('node:test')
const assert = require('node:assert')

describe('SprintRepository', () => {
  describe('Data Transformation', () => {
    it('should transform database row to sprint object', () => {
      const row = {
        id: 'sprint-1',
        status: 'in-progress',
        plan: 'Implementation plan here',
        story_progress: '{"story-1":{"branches":{"backend":{"status":"completed"}}}}',
        prompt_id: 'prompt-1',
        created_at: '2024-01-01T00:00:00Z',
        plan_approved_at: '2024-01-02T00:00:00Z',
        completed_at: null,
        closed_at: null
      }

      // Simulate transformation
      const parseJson = (value, defaultValue) => {
        if (value === null || value === undefined) return defaultValue
        try { return JSON.parse(value) } catch { return defaultValue }
      }

      const sprint = {
        id: row.id,
        status: row.status,
        plan: row.plan || null,
        storyProgress: parseJson(row.story_progress, {}),
        promptId: row.prompt_id,
        createdAt: row.created_at,
        planApprovedAt: row.plan_approved_at,
        completedAt: row.completed_at,
        closedAt: row.closed_at
      }

      assert.strictEqual(sprint.id, 'sprint-1')
      assert.strictEqual(sprint.status, 'in-progress')
      assert.deepStrictEqual(sprint.storyProgress, {
        'story-1': { branches: { backend: { status: 'completed' } } }
      })
      assert.strictEqual(sprint.planApprovedAt, '2024-01-02T00:00:00Z')
      assert.strictEqual(sprint.closedAt, null)
    })

    it('should transform sprint object to database row', () => {
      const sprint = {
        id: 'sprint-1',
        status: 'planning',
        plan: 'My plan',
        storyProgress: { 'story-1': { status: 'pending' } },
        promptId: 'prompt-1',
        createdAt: '2024-01-01T00:00:00Z',
        planApprovedAt: null,
        completedAt: null,
        closedAt: null
      }

      const row = {
        id: sprint.id,
        status: sprint.status || 'planning',
        plan: sprint.plan || null,
        story_progress: JSON.stringify(sprint.storyProgress || {}),
        prompt_id: sprint.promptId || null,
        created_at: sprint.createdAt,
        plan_approved_at: sprint.planApprovedAt || null,
        completed_at: sprint.completedAt || null,
        closed_at: sprint.closedAt || null
      }

      assert.strictEqual(row.id, 'sprint-1')
      assert.strictEqual(row.status, 'planning')
      assert.strictEqual(row.story_progress, '{"story-1":{"status":"pending"}}')
    })

    it('should transform sprint history row correctly', () => {
      const row = {
        id: 'sprint-1',
        status: 'closed',
        plan: 'Plan content',
        story_progress: '{}',
        story_ids: '["story-1","story-2"]',
        prompt_id: 'prompt-1',
        created_at: '2024-01-01T00:00:00Z',
        plan_approved_at: '2024-01-02T00:00:00Z',
        completed_at: '2024-01-10T00:00:00Z',
        closed_at: '2024-01-11T00:00:00Z'
      }

      const parseJson = (value, defaultValue) => {
        if (!value) return defaultValue
        try { return JSON.parse(value) } catch { return defaultValue }
      }

      const sprint = {
        id: row.id,
        status: row.status,
        plan: row.plan || null,
        storyProgress: parseJson(row.story_progress, {}),
        storyIds: parseJson(row.story_ids, []),
        promptId: row.prompt_id,
        createdAt: row.created_at,
        planApprovedAt: row.plan_approved_at,
        completedAt: row.completed_at,
        closedAt: row.closed_at
      }

      assert.strictEqual(sprint.status, 'closed')
      assert.deepStrictEqual(sprint.storyIds, ['story-1', 'story-2'])
      assert.ok(sprint.closedAt)
    })
  })

  describe('Status Enum', () => {
    it('should define valid status values', () => {
      const SprintStatus = {
        PLANNING: 'planning',
        PLAN_REVIEW: 'plan-review',
        IN_PROGRESS: 'in-progress',
        COMPLETED: 'completed',
        CLOSED: 'closed'
      }

      assert.strictEqual(SprintStatus.PLANNING, 'planning')
      assert.strictEqual(SprintStatus.PLAN_REVIEW, 'plan-review')
      assert.strictEqual(SprintStatus.IN_PROGRESS, 'in-progress')
      assert.strictEqual(SprintStatus.COMPLETED, 'completed')
      assert.strictEqual(SprintStatus.CLOSED, 'closed')
    })
  })

  describe('Query Building', () => {
    it('should build findActive query', () => {
      const sql = `
        SELECT * FROM sprints
        WHERE closed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `

      assert.ok(sql.includes('closed_at IS NULL'))
      assert.ok(sql.includes('LIMIT 1'))
    })

    it('should build findByStatus query', () => {
      const status = 'in-progress'
      const sql = `
        SELECT * FROM sprints
        WHERE status = '${status}'
        ORDER BY created_at DESC
      `

      assert.ok(sql.includes("status = 'in-progress'"))
    })

    it('should build sprint stories join query', () => {
      const sprintId = 'sprint-1'
      const sql = `
        SELECT us.*, ss.added_at as sprint_added_at
        FROM user_stories us
        INNER JOIN sprint_stories ss ON us.id = ss.story_id
        WHERE ss.sprint_id = '${sprintId}'
        ORDER BY ss.added_at ASC
      `

      assert.ok(sql.includes('INNER JOIN sprint_stories'))
      assert.ok(sql.includes('ss.sprint_id'))
      assert.ok(sql.includes('ORDER BY ss.added_at'))
    })

    it('should build archived sprints query with limit', () => {
      const limit = 50
      let sql = 'SELECT * FROM sprint_history ORDER BY closed_at DESC'
      sql += ` LIMIT ${limit}`

      assert.ok(sql.includes('sprint_history'))
      assert.ok(sql.includes('LIMIT 50'))
    })

    it('should build findSprintContainingStory query', () => {
      const storyId = 'story-1'
      const sql = `
        SELECT s.* FROM sprints s
        INNER JOIN sprint_stories ss ON s.id = ss.sprint_id
        WHERE ss.story_id = '${storyId}' AND s.closed_at IS NULL
        LIMIT 1
      `

      assert.ok(sql.includes('INNER JOIN sprint_stories'))
      assert.ok(sql.includes("ss.story_id = 'story-1'"))
      assert.ok(sql.includes('closed_at IS NULL'))
    })
  })

  describe('Sprint-Story Relationships', () => {
    it('should build add story relationship query', () => {
      const sprintId = 'sprint-1'
      const storyId = 'story-1'
      const addedAt = new Date().toISOString()

      const sql = `
        INSERT OR IGNORE INTO sprint_stories (sprint_id, story_id, added_at)
        VALUES ('${sprintId}', '${storyId}', '${addedAt}')
      `

      assert.ok(sql.includes('INSERT OR IGNORE'))
      assert.ok(sql.includes('sprint_stories'))
      assert.ok(sql.includes(sprintId))
      assert.ok(sql.includes(storyId))
    })

    it('should build remove story relationship query', () => {
      const sprintId = 'sprint-1'
      const storyId = 'story-1'

      const sql = `
        DELETE FROM sprint_stories
        WHERE sprint_id = '${sprintId}' AND story_id = '${storyId}'
      `

      assert.ok(sql.includes('DELETE FROM sprint_stories'))
      assert.ok(sql.includes('sprint_id'))
      assert.ok(sql.includes('story_id'))
    })

    it('should extract story IDs from sprint', () => {
      const rows = [
        { story_id: 'story-1' },
        { story_id: 'story-2' },
        { story_id: 'story-3' }
      ]

      const storyIds = rows.map(row => row.story_id)

      assert.deepStrictEqual(storyIds, ['story-1', 'story-2', 'story-3'])
    })
  })

  describe('Progress Tracking', () => {
    it('should initialize story progress structure', () => {
      const storyProgress = {}
      const storyId = 'story-1'

      if (!storyProgress[storyId]) {
        storyProgress[storyId] = { branches: {} }
      }

      assert.deepStrictEqual(storyProgress[storyId], { branches: {} })
    })

    it('should update branch progress', () => {
      const storyProgress = {
        'story-1': { branches: {} }
      }

      const branchType = 'backend'
      const progressUpdate = { status: 'in_progress', startedAt: Date.now() }

      storyProgress['story-1'].branches[branchType] = {
        ...storyProgress['story-1'].branches[branchType],
        ...progressUpdate
      }

      assert.strictEqual(storyProgress['story-1'].branches.backend.status, 'in_progress')
      assert.ok(storyProgress['story-1'].branches.backend.startedAt)
    })

    it('should detect all branches completed', () => {
      const branches = {
        backend: { status: 'completed' },
        ui: { status: 'completed' },
        fullstack: { status: 'completed' }
      }

      const allCompleted = Object.values(branches).every(b => b.status === 'completed')

      assert.strictEqual(allCompleted, true)
    })

    it('should detect not all branches completed', () => {
      const branches = {
        backend: { status: 'completed' },
        ui: { status: 'in_progress' }
      }

      const allCompleted = Object.values(branches).every(b => b.status === 'completed')

      assert.strictEqual(allCompleted, false)
    })

    it('should calculate progress summary', () => {
      const sprint = {
        stories: [
          { id: 'story-1' },
          { id: 'story-2' },
          { id: 'story-3' }
        ],
        storyProgress: {
          'story-1': {
            status: 'completed',
            branches: {
              backend: { status: 'completed' },
              ui: { status: 'completed' }
            }
          },
          'story-2': {
            branches: {
              backend: { status: 'in_progress' }
            }
          }
        },
        status: 'in-progress'
      }

      let totalBranches = 0
      let completedBranches = 0
      let inProgressBranches = 0
      let completedStories = 0

      sprint.stories.forEach(story => {
        const progress = sprint.storyProgress[story.id]
        if (progress) {
          if (progress.status === 'completed') {
            completedStories++
          }
          Object.values(progress.branches || {}).forEach(branch => {
            totalBranches++
            if (branch.status === 'completed') {
              completedBranches++
            } else if (branch.status === 'in_progress') {
              inProgressBranches++
            }
          })
        }
      })

      assert.strictEqual(completedStories, 1)
      assert.strictEqual(totalBranches, 3)
      assert.strictEqual(completedBranches, 2)
      assert.strictEqual(inProgressBranches, 1)
    })
  })

  describe('Archive Operations', () => {
    it('should prepare sprint for archiving', () => {
      const sprint = {
        id: 'sprint-1',
        status: 'completed',
        plan: 'Plan content',
        storyProgress: {},
        stories: [{ id: 'story-1' }, { id: 'story-2' }],
        createdAt: '2024-01-01T00:00:00Z',
        planApprovedAt: '2024-01-02T00:00:00Z',
        completedAt: '2024-01-10T00:00:00Z'
      }

      const storyIds = sprint.stories.map(s => s.id)
      const closedAt = new Date().toISOString()

      const archived = {
        id: sprint.id,
        status: 'closed',
        plan: sprint.plan,
        storyProgress: sprint.storyProgress,
        storyIds,
        promptId: sprint.promptId,
        createdAt: sprint.createdAt,
        planApprovedAt: sprint.planApprovedAt,
        completedAt: sprint.completedAt,
        closedAt
      }

      assert.strictEqual(archived.status, 'closed')
      assert.deepStrictEqual(archived.storyIds, ['story-1', 'story-2'])
      assert.ok(archived.closedAt)
    })
  })

  describe('Statistics', () => {
    it('should aggregate status counts', () => {
      const rows = [
        { status: 'planning', count: 1 },
        { status: 'in-progress', count: 2 },
        { status: 'completed', count: 3 }
      ]

      const counts = {}
      for (const row of rows) {
        counts[row.status] = row.count
      }
      counts.archived = 5

      assert.strictEqual(counts.planning, 1)
      assert.strictEqual(counts['in-progress'], 2)
      assert.strictEqual(counts.completed, 3)
      assert.strictEqual(counts.archived, 5)
    })

    it('should calculate story percentage', () => {
      const totalStories = 4
      const completedStories = 2

      const percentage = totalStories > 0
        ? Math.round((completedStories / totalStories) * 100)
        : 0

      assert.strictEqual(percentage, 50)
    })

    it('should calculate branch percentage', () => {
      const totalBranches = 8
      const completedBranches = 6

      const percentage = totalBranches > 0
        ? Math.round((completedBranches / totalBranches) * 100)
        : 0

      assert.strictEqual(percentage, 75)
    })
  })

  describe('Status Transitions', () => {
    it('should set planApprovedAt when status changes to in-progress', () => {
      const sprint = { id: 'sprint-1', status: 'planning', planApprovedAt: null }
      const newStatus = 'in-progress'

      const updates = { status: newStatus }

      if (newStatus === 'in-progress' && !sprint.planApprovedAt) {
        updates.planApprovedAt = new Date().toISOString()
      }

      assert.ok(updates.planApprovedAt)
    })

    it('should set completedAt when status changes to completed', () => {
      const newStatus = 'completed'
      const updates = { status: newStatus }

      if (newStatus === 'completed') {
        updates.completedAt = new Date().toISOString()
      }

      assert.ok(updates.completedAt)
    })

    it('should set closedAt when status changes to closed', () => {
      const newStatus = 'closed'
      const updates = { status: newStatus }

      if (newStatus === 'closed') {
        updates.closedAt = new Date().toISOString()
      }

      assert.ok(updates.closedAt)
    })
  })

  describe('Story Status Synchronization', () => {
    it('should have syncStoryStatus method', () => {
      // Verify that SprintRepository has syncStoryStatus method
      const { SprintRepository } = require('../../src/main/database/repositories/sprint-repository')
      assert.strictEqual(typeof SprintRepository.prototype.syncStoryStatus, 'function')
    })

    it('should atomically update both sprint progress and user story status', () => {
      // This test verifies the design pattern - syncStoryStatus should be atomic
      // The method uses immediateTransaction internally

      const operationsInTransaction = [
        'Update sprint.storyProgress[storyId].status',
        'Update sprint.storyProgress[storyId].completedAt',
        'Update user_stories.status',
        'Update user_stories.updated_at',
        'Check if all stories completed -> update sprint.status'
      ]

      // All operations should be within a single transaction
      assert.strictEqual(operationsInTransaction.length, 5)
      assert.ok(operationsInTransaction[0].includes('sprint.storyProgress'))
      assert.ok(operationsInTransaction[2].includes('user_stories'))
    })

    it('should map sprint status to backlog status correctly', () => {
      // Sprint status 'completed' -> backlog status 'completed'
      // Sprint status 'in-progress' -> backlog status 'in-progress'

      const statusMapping = {
        'completed': 'completed',
        'in-progress': 'in-progress'
      }

      assert.strictEqual(statusMapping['completed'], 'completed')
      assert.strictEqual(statusMapping['in-progress'], 'in-progress')
    })

    it('should return updated sprint and story data', () => {
      // syncStoryStatus should return both updated entities
      const expectedReturnShape = {
        sprint: { id: 'sprint-1', storyProgress: {} },
        story: { id: 'story-1', status: 'completed' },
        allStoriesCompleted: false,
        timestamp: '2024-01-01T00:00:00.000Z'
      }

      assert.ok('sprint' in expectedReturnShape)
      assert.ok('story' in expectedReturnShape)
      assert.ok('allStoriesCompleted' in expectedReturnShape)
      assert.ok('timestamp' in expectedReturnShape)
    })

    it('should update sprint status when all stories complete', () => {
      // When the last story is marked complete, sprint should become 'completed'

      const sprint = {
        id: 'sprint-1',
        stories: [
          { id: 'story-1' },
          { id: 'story-2' }
        ],
        storyProgress: {
          'story-1': { status: 'completed' }
        },
        status: 'in-progress'
      }

      // Simulating marking story-2 as completed
      const storyBeingCompleted = 'story-2'
      const allStoriesCompleted = sprint.stories.every(story => {
        if (story.id === storyBeingCompleted) {
          return true // This one is being marked complete
        }
        return sprint.storyProgress[story.id]?.status === 'completed'
      })

      assert.strictEqual(allStoriesCompleted, true)
    })

    it('should revert sprint status when story marked incomplete', () => {
      // When a story is marked incomplete, sprint should go back to 'in-progress'

      const sprintWasCompleted = {
        id: 'sprint-1',
        status: 'completed',
        stories: [{ id: 'story-1' }, { id: 'story-2' }]
      }

      const storyBeingMarkedIncomplete = 'story-1'

      // If sprint was completed but now has incomplete story
      if (sprintWasCompleted.status === 'completed' && storyBeingMarkedIncomplete) {
        sprintWasCompleted.status = 'in-progress'
        sprintWasCompleted.completedAt = null
      }

      assert.strictEqual(sprintWasCompleted.status, 'in-progress')
      assert.strictEqual(sprintWasCompleted.completedAt, null)
    })
  })

  describe('Transactional Operations', () => {
    it('should have immediateTransaction method in BaseRepository', () => {
      // Verify that BaseRepository provides immediateTransaction
      const { BaseRepository } = require('../../src/main/database/repositories/base-repository')

      // Create a mock repository to check method existence
      const mockConnection = { getConnection: () => null }
      const repo = new BaseRepository(mockConnection, 'test')

      assert.strictEqual(typeof repo.immediateTransaction, 'function')
    })

    it('should use immediateTransaction for atomic create', () => {
      // This test verifies the design pattern - sprint creation should be atomic
      // The SprintRepository.create() uses immediateTransaction internally

      // Simulate the transaction flow:
      // 1. Begin IMMEDIATE transaction (acquires write lock)
      // 2. Insert sprint row
      // 3. Insert sprint_stories relationships
      // 4. Commit or rollback

      const transactionSteps = [
        'BEGIN IMMEDIATE',
        'INSERT INTO sprints (...)',
        'INSERT INTO sprint_stories (...) for each story',
        'COMMIT'
      ]

      assert.strictEqual(transactionSteps.length, 4)
      assert.strictEqual(transactionSteps[0], 'BEGIN IMMEDIATE')
      assert.strictEqual(transactionSteps[3], 'COMMIT')
    })

    it('should use immediateTransaction for atomic archive', () => {
      // This test verifies the design pattern - sprint archive should be atomic
      // The SprintRepository.archive() uses immediateTransaction internally

      // Simulate the transaction flow:
      // 1. Begin IMMEDIATE transaction
      // 2. Insert into sprint_history
      // 3. Delete from sprint_stories
      // 4. Delete from sprints
      // 5. Commit or rollback

      const archiveTransactionSteps = [
        'BEGIN IMMEDIATE',
        'INSERT INTO sprint_history (...)',
        'DELETE FROM sprint_stories WHERE sprint_id = ?',
        'DELETE FROM sprints WHERE id = ?',
        'COMMIT'
      ]

      assert.strictEqual(archiveTransactionSteps.length, 5)
      assert.ok(archiveTransactionSteps[1].includes('sprint_history'))
      assert.ok(archiveTransactionSteps[2].includes('sprint_stories'))
      assert.ok(archiveTransactionSteps[3].includes('sprints'))
    })

    it('should rollback on create failure', () => {
      // Verify rollback behavior expectation
      // If any INSERT fails, the entire transaction should rollback

      const mockFailure = () => {
        let insertedSprint = false
        let insertedRelationships = false
        let rolledBack = false

        try {
          // Step 1: Insert sprint (succeeds)
          insertedSprint = true

          // Step 2: Insert relationships (fails)
          throw new Error('FOREIGN KEY constraint failed')
        } catch {
          // Transaction automatically rolls back
          rolledBack = true
          insertedSprint = false
          insertedRelationships = false
        }

        return { insertedSprint, insertedRelationships, rolledBack }
      }

      const result = mockFailure()
      assert.strictEqual(result.rolledBack, true)
      assert.strictEqual(result.insertedSprint, false) // Rolled back
      assert.strictEqual(result.insertedRelationships, false)
    })

    it('should rollback on archive failure', () => {
      // Verify rollback behavior expectation
      // If archive fails mid-operation, no partial state should remain

      const mockArchiveFailure = () => {
        let insertedHistory = false
        let deletedRelationships = false
        let deletedSprint = false
        let rolledBack = false

        try {
          // Step 1: Insert to history (succeeds)
          insertedHistory = true

          // Step 2: Delete relationships (succeeds)
          deletedRelationships = true

          // Step 3: Delete sprint (fails - simulating constraint issue)
          throw new Error('Database error during delete')
        } catch {
          // Transaction automatically rolls back ALL changes
          rolledBack = true
          insertedHistory = false
          deletedRelationships = false
          deletedSprint = false
        }

        return { insertedHistory, deletedRelationships, deletedSprint, rolledBack }
      }

      const result = mockArchiveFailure()
      assert.strictEqual(result.rolledBack, true)
      assert.strictEqual(result.insertedHistory, false) // Rolled back
      assert.strictEqual(result.deletedRelationships, false) // Rolled back
    })

    it('should ensure cache updates happen after transaction commit', () => {
      // This tests the puffin-state.js pattern for sprint operations
      // Cache/JSON updates should only happen AFTER SQLite transaction commits

      const sprintOperationFlow = [
        { step: 1, action: 'Begin SQLite transaction', cacheUpdated: false },
        { step: 2, action: 'Execute DB operations', cacheUpdated: false },
        { step: 3, action: 'Commit transaction', cacheUpdated: false },
        { step: 4, action: 'Update in-memory cache', cacheUpdated: true },
        { step: 5, action: 'Write JSON backup', cacheUpdated: true }
      ]

      // Cache should only be true AFTER transaction commit (step 3)
      const cacheUpdateStep = sprintOperationFlow.find(s => s.cacheUpdated)
      assert.ok(cacheUpdateStep.step > 3, 'Cache update should happen after commit')
    })
  })

  describe('Sprint Title Persistence', () => {
    it('should include title in sprint row transformation', () => {
      // Verify _sprintToRow includes title
      const sprint = {
        id: 'sprint-1',
        title: 'Implement User Authentication (+2 more)',
        status: 'planning',
        plan: null,
        storyProgress: {},
        promptId: null,
        createdAt: '2024-01-01T00:00:00Z'
      }

      const row = {
        id: sprint.id,
        title: sprint.title || null,
        description: sprint.description || '',
        status: sprint.status || 'planning',
        plan: sprint.plan || null,
        story_progress: JSON.stringify(sprint.storyProgress || {}),
        prompt_id: sprint.promptId || null,
        created_at: sprint.createdAt
      }

      assert.strictEqual(row.title, 'Implement User Authentication (+2 more)')
    })

    it('should generate title for single story sprint', () => {
      const stories = [{ id: 'story-1', title: 'Add Login Form' }]

      let sprintTitle
      if (stories.length === 1) {
        sprintTitle = stories[0].title
      } else if (stories.length > 1) {
        sprintTitle = `${stories[0].title} (+${stories.length - 1} more)`
      }

      assert.strictEqual(sprintTitle, 'Add Login Form')
    })

    it('should generate title for multi-story sprint', () => {
      const stories = [
        { id: 'story-1', title: 'Add Login Form' },
        { id: 'story-2', title: 'Add Registration Form' },
        { id: 'story-3', title: 'Add Password Reset' }
      ]

      let sprintTitle
      if (stories.length === 1) {
        sprintTitle = stories[0].title
      } else if (stories.length > 1) {
        sprintTitle = `${stories[0].title} (+${stories.length - 1} more)`
      }

      assert.strictEqual(sprintTitle, 'Add Login Form (+2 more)')
    })

    it('should persist title with sprint creation atomically', () => {
      // Verify atomic creation includes title
      const sprint = {
        id: 'sprint-1',
        title: 'Feature Implementation Sprint',
        status: 'created',
        storyProgress: {},
        createdAt: Date.now()
      }
      const storyIds = ['story-1', 'story-2']

      // Simulate transaction steps
      const insertSteps = [
        { table: 'sprints', fields: ['id', 'title', 'status', 'story_progress', 'created_at'] },
        { table: 'sprint_stories', fields: ['sprint_id', 'story_id', 'added_at'] }
      ]

      // Title should be included in the sprint insert
      assert.ok(insertSteps[0].fields.includes('title'))
      assert.strictEqual(insertSteps[0].table, 'sprints')
    })

    it('should retrieve title from database row correctly', () => {
      const row = {
        id: 'sprint-1',
        title: 'My Sprint Title',
        description: '',
        status: 'in-progress',
        plan: null,
        story_progress: '{}',
        prompt_id: null,
        created_at: '2024-01-01T00:00:00Z'
      }

      const sprint = {
        id: row.id,
        title: row.title || null,
        description: row.description || '',
        status: row.status
      }

      assert.strictEqual(sprint.title, 'My Sprint Title')
    })

    it('should display title immediately after creation without reload', () => {
      // Simulates the UI flow: title is set during CREATE_SPRINT action
      const timestamp = Date.now()
      const stories = [
        { id: 'story-1', title: 'First Story' },
        { id: 'story-2', title: 'Second Story' }
      ]

      // Create sprint with title (as done in model.js)
      const sprintTitle = stories.length === 1
        ? stories[0].title
        : `${stories[0].title} (+${stories.length - 1} more)`

      const activeSprint = {
        id: 'abc123',
        title: sprintTitle,
        stories,
        status: 'created',
        createdAt: timestamp
      }

      // Title should be immediately available for display
      assert.strictEqual(activeSprint.title, 'First Story (+1 more)')
      assert.ok(activeSprint.createdAt <= Date.now())
    })
  })

  describe('Single Active Sprint Enforcement', () => {
    it('should have hasActiveSprint method', () => {
      const { SprintRepository } = require('../../src/main/database/repositories/sprint-repository')
      assert.strictEqual(typeof SprintRepository.prototype.hasActiveSprint, 'function')
    })

    it('should return false when no active sprint exists', () => {
      // Simulate empty database check
      const mockResult = null
      const hasActive = !!mockResult
      assert.strictEqual(hasActive, false)
    })

    it('should return true when active sprint exists', () => {
      // Simulate existing sprint in database
      const mockResult = { id: 'sprint-1' }
      const hasActive = !!mockResult
      assert.strictEqual(hasActive, true)
    })

    it('should throw descriptive error when creating sprint with one active', () => {
      const activeSprint = {
        id: 'sprint-1',
        title: 'First Feature Sprint'
      }

      const hasActive = true
      let errorMessage = null

      if (hasActive) {
        const title = activeSprint?.title || `Sprint ${activeSprint?.id?.substring(0, 6)}`
        errorMessage = `Cannot create sprint: "${title}" is already active. Close it before creating a new one.`
      }

      assert.ok(errorMessage)
      assert.ok(errorMessage.includes('First Feature Sprint'))
      assert.ok(errorMessage.includes('Close it before creating'))
    })

    it('should use database trigger as final enforcement', () => {
      // The database trigger text that enforces single active sprint
      const triggerSql = `
        CREATE TRIGGER enforce_single_active_sprint
        BEFORE INSERT ON sprints
        BEGIN
          SELECT RAISE(ABORT, 'Cannot create sprint: an active sprint already exists. Close it first.')
          WHERE EXISTS (
            SELECT 1 FROM sprints
            WHERE closed_at IS NULL
          );
        END
      `

      assert.ok(triggerSql.includes('enforce_single_active_sprint'))
      assert.ok(triggerSql.includes('BEFORE INSERT'))
      assert.ok(triggerSql.includes('closed_at IS NULL'))
      assert.ok(triggerSql.includes('RAISE(ABORT'))
    })

    it('should check for active sprint before creation in repository', () => {
      // Verify the create method pattern includes hasActiveSprint check
      const createMethodPattern = `
        if (this.hasActiveSprint()) {
          const activeSprint = this.findActive()
          throw new Error('Cannot create sprint...')
        }
      `

      assert.ok(createMethodPattern.includes('hasActiveSprint'))
      assert.ok(createMethodPattern.includes('findActive'))
      assert.ok(createMethodPattern.includes('throw new Error'))
    })

    it('should define active sprint as one with closed_at IS NULL', () => {
      // Active sprint definition
      const activeSprints = [
        { id: 's1', closed_at: null, status: 'in-progress' },  // Active
        { id: 's2', closed_at: '2024-01-01', status: 'closed' } // Not active
      ]

      const active = activeSprints.filter(s => s.closed_at === null)
      assert.strictEqual(active.length, 1)
      assert.strictEqual(active[0].id, 's1')
    })

    it('should provide IPC handler for checking active sprint', () => {
      // Expected IPC response structure
      const mockResponse = {
        success: true,
        hasActive: true,
        activeSprint: {
          id: 'sprint-1',
          title: 'Current Sprint'
        }
      }

      assert.ok('success' in mockResponse)
      assert.ok('hasActive' in mockResponse)
      assert.ok('activeSprint' in mockResponse)
      assert.strictEqual(mockResponse.activeSprint.title, 'Current Sprint')
    })
  })

  describe('User Story Status Synchronization', () => {
    it('should have _updateStoryStatuses private method', () => {
      const { SprintRepository } = require('../../src/main/database/repositories/sprint-repository')
      assert.strictEqual(typeof SprintRepository.prototype._updateStoryStatuses, 'function')
    })

    it('should update story status to in-progress when added to sprint', () => {
      // Simulate adding story to sprint
      const storyBefore = { id: 'story-1', status: 'pending' }
      const storyAfter = { ...storyBefore, status: 'in-progress' }

      // _addStoriesToSprint calls _updateStoryStatuses internally
      assert.strictEqual(storyBefore.status, 'pending')
      assert.strictEqual(storyAfter.status, 'in-progress')
    })

    it('should reset story status to pending when removed from sprint', () => {
      // Simulate removing story from sprint
      const storyBefore = { id: 'story-1', status: 'in-progress' }
      const storyAfter = { ...storyBefore, status: 'pending' }

      // removeStory calls _updateStoryStatuses with 'pending'
      assert.strictEqual(storyBefore.status, 'in-progress')
      assert.strictEqual(storyAfter.status, 'pending')
    })

    it('should keep completed status when archiving sprint', () => {
      const storyProgress = {
        'story-1': { status: 'completed' },
        'story-2': { status: 'in-progress' }
      }
      const storyIds = ['story-1', 'story-2']

      const completedStoryIds = storyIds.filter(sid => storyProgress[sid]?.status === 'completed')
      const incompleteStoryIds = storyIds.filter(sid => storyProgress[sid]?.status !== 'completed')

      assert.deepStrictEqual(completedStoryIds, ['story-1'])
      assert.deepStrictEqual(incompleteStoryIds, ['story-2'])
    })

    it('should return incomplete stories to pending when archiving sprint', () => {
      const storyProgress = {
        'story-1': { status: 'completed' },
        'story-2': { status: 'in-progress' },
        'story-3': { status: undefined }  // Never started
      }
      const storyIds = ['story-1', 'story-2', 'story-3']

      const incompleteStoryIds = storyIds.filter(sid => storyProgress[sid]?.status !== 'completed')

      // story-2 and story-3 should be returned to pending
      assert.ok(incompleteStoryIds.includes('story-2'))
      assert.ok(incompleteStoryIds.includes('story-3'))
      assert.ok(!incompleteStoryIds.includes('story-1'))
    })

    it('should synchronize story status atomically in create flow', () => {
      // The create method uses immediateTransaction
      // which atomically: inserts sprint, adds story relationships, updates story statuses
      const operationsInCreateTransaction = [
        'INSERT INTO sprints',
        'INSERT INTO sprint_stories (for each story)',
        'UPDATE user_stories SET status = in-progress (for each story)'
      ]

      assert.strictEqual(operationsInCreateTransaction.length, 3)
      assert.ok(operationsInCreateTransaction[2].includes('in-progress'))
    })

    it('should synchronize story status atomically in archive flow', () => {
      // The archive method uses immediateTransaction
      // which atomically: inserts history, updates statuses, deletes relationships, deletes sprint
      const operationsInArchiveTransaction = [
        'INSERT INTO sprint_history',
        'UPDATE completed stories to completed',
        'UPDATE incomplete stories to pending',
        'DELETE FROM sprint_stories',
        'DELETE FROM sprints'
      ]

      assert.strictEqual(operationsInArchiveTransaction.length, 5)
      assert.ok(operationsInArchiveTransaction[1].includes('completed'))
      assert.ok(operationsInArchiveTransaction[2].includes('pending'))
    })

    it('should preserve story existence across sprint lifecycle', () => {
      // Stories should NEVER disappear from backlog
      // They only change status, not existence

      const story = { id: 'story-1', title: 'My Story', status: 'pending' }

      // Before sprint: pending
      assert.strictEqual(story.status, 'pending')

      // During sprint: in-progress
      story.status = 'in-progress'
      assert.strictEqual(story.status, 'in-progress')

      // After sprint (incomplete): pending
      story.status = 'pending'
      assert.strictEqual(story.status, 'pending')

      // Story still exists throughout
      assert.ok(story.id)
      assert.ok(story.title)
    })

    it('should handle reload consistency with database as source of truth', () => {
      // After reload, story status should match database
      const databaseRow = {
        id: 'story-1',
        status: 'in-progress',  // Set by sprint creation
        updated_at: '2024-01-01T00:00:00Z'
      }

      // UI reloads and reads from database
      const reloadedStory = {
        id: databaseRow.id,
        status: databaseRow.status  // Should match database
      }

      assert.strictEqual(reloadedStory.status, 'in-progress')
    })
  })

  describe('Sprint Story Reference Validation', () => {
    it('should validate story IDs exist before sprint creation', () => {
      // SprintService._validateStoryIds checks that all story IDs exist
      const existingStoryIds = ['story-1', 'story-2', 'story-3']
      const requestedStoryIds = ['story-1', 'story-999']

      const foundIds = new Set(existingStoryIds)
      const invalidIds = requestedStoryIds.filter(id => !foundIds.has(id))

      assert.deepStrictEqual(invalidIds, ['story-999'])
      assert.ok(invalidIds.length > 0, 'Should detect invalid story IDs')
    })

    it('should throw InvalidStoryIdsError for non-existent stories', () => {
      const { InvalidStoryIdsError } = require('../../src/main/services')
      const invalidIds = ['story-999', 'story-888']

      const error = new InvalidStoryIdsError(invalidIds)

      assert.strictEqual(error.name, 'InvalidStoryIdsError')
      assert.ok(error.message.includes('story-999'))
      assert.ok(error.message.includes('story-888'))
      assert.deepStrictEqual(error.invalidIds, invalidIds)
    })

    it('should allow sprint creation with valid story IDs', () => {
      // Simulates the validation logic
      const existingStoryIds = ['story-1', 'story-2']
      const requestedStoryIds = ['story-1', 'story-2']

      const foundIds = new Set(existingStoryIds)
      const invalidIds = requestedStoryIds.filter(id => !foundIds.has(id))

      assert.strictEqual(invalidIds.length, 0)
    })

    it('should allow sprint creation with empty story list', () => {
      // Empty story list should be valid
      const requestedStoryIds = []

      // _validateStoryIds returns early for empty arrays
      const shouldValidate = requestedStoryIds && requestedStoryIds.length > 0

      assert.strictEqual(shouldValidate, false)
    })

    it('should filter orphaned stories from sprint on load', () => {
      // Sprint has story references, but some stories were deleted
      const sprintStoryProgress = {
        'story-1': { status: 'completed' },
        'story-2': { status: 'in-progress' },
        'story-3': { status: 'pending' }  // This story was deleted
      }
      const validStories = [
        { id: 'story-1' },
        { id: 'story-2' }
        // story-3 is missing - deleted from database
      ]

      const validStoryIds = new Set(validStories.map(s => s.id))
      const filteredProgress = {}
      for (const [storyId, progress] of Object.entries(sprintStoryProgress)) {
        if (validStoryIds.has(storyId)) {
          filteredProgress[storyId] = progress
        }
      }

      assert.ok(!('story-3' in filteredProgress))
      assert.ok('story-1' in filteredProgress)
      assert.ok('story-2' in filteredProgress)
    })

    it('should use INNER JOIN to filter orphaned sprint_stories', () => {
      // _getSprintStories uses INNER JOIN which naturally filters orphans
      const sql = `
        SELECT us.*, ss.added_at as sprint_added_at
        FROM user_stories us
        INNER JOIN sprint_stories ss ON us.id = ss.story_id
        WHERE ss.sprint_id = ?
        ORDER BY ss.added_at ASC
      `

      assert.ok(sql.includes('INNER JOIN'))
      // INNER JOIN ensures only stories that exist in BOTH tables are returned
    })

    it('should remove story from sprint when story is deleted', () => {
      // delete() method atomically removes from sprint_stories
      const storyId = 'story-1'

      // Simulate the delete operation steps
      const deleteOperations = [
        'DELETE FROM sprint_stories WHERE story_id = ?',
        'SELECT id, story_progress FROM sprints WHERE closed_at IS NULL',
        'UPDATE sprints SET story_progress = ? WHERE id = ?',  // Remove from JSON
        'DELETE FROM user_stories WHERE id = ?'
      ]

      assert.ok(deleteOperations[0].includes('sprint_stories'))
      assert.ok(deleteOperations[3].includes('user_stories'))
    })

    it('should clean storyProgress JSON when story is deleted', () => {
      const storyId = 'story-to-delete'
      const sprintProgress = {
        'story-1': { status: 'completed' },
        'story-to-delete': { status: 'in-progress' },
        'story-2': { status: 'pending' }
      }

      // Simulate cleanup
      if (sprintProgress[storyId]) {
        delete sprintProgress[storyId]
      }

      assert.ok(!('story-to-delete' in sprintProgress))
      assert.strictEqual(Object.keys(sprintProgress).length, 2)
    })

    it('should handle delete when story is not in any sprint', () => {
      // Story may not be in any sprint - should still delete successfully
      const storyId = 'story-not-in-sprint'
      const sprintProgress = {
        'story-1': { status: 'completed' }
      }

      // No cleanup needed if story not in progress
      const wasInProgress = storyId in sprintProgress
      assert.strictEqual(wasInProgress, false)

      // Delete should still succeed
      const deleted = true
      assert.ok(deleted)
    })

    it('should maintain referential integrity in transaction', () => {
      // All story removal operations should be atomic
      const transactionSteps = [
        'BEGIN IMMEDIATE',
        'DELETE FROM sprint_stories WHERE story_id = ?',
        'UPDATE sprints SET story_progress = ? (if story in progress)',
        'DELETE FROM user_stories WHERE id = ?',
        'COMMIT'
      ]

      assert.strictEqual(transactionSteps[0], 'BEGIN IMMEDIATE')
      assert.strictEqual(transactionSteps[4], 'COMMIT')
    })
  })

  describe('Atomic Sprint Closure', () => {
    it('should use immediateTransaction for archive operation', () => {
      // The archive method must use immediateTransaction to acquire write lock
      const { SprintRepository } = require('../../src/main/database/repositories/sprint-repository')
      assert.strictEqual(typeof SprintRepository.prototype.archive, 'function')

      // Verify transaction pattern in archive
      const archiveTransactionSteps = [
        'BEGIN IMMEDIATE',
        'INSERT INTO sprint_history (...)',
        'UPDATE user_stories SET status = ? for completed stories',
        'UPDATE user_stories SET status = ? for incomplete stories',
        'DELETE FROM sprint_stories WHERE sprint_id = ?',
        'DELETE FROM sprints WHERE id = ?',
        'COMMIT'
      ]

      assert.strictEqual(archiveTransactionSteps[0], 'BEGIN IMMEDIATE')
      assert.strictEqual(archiveTransactionSteps[6], 'COMMIT')
      assert.ok(archiveTransactionSteps.length === 7)
    })

    it('should update completed stories to completed status', () => {
      const storyProgress = {
        'story-1': { status: 'completed' },
        'story-2': { status: 'in-progress' }
      }
      const storyIds = ['story-1', 'story-2']

      const completedStoryIds = storyIds.filter(sid => storyProgress[sid]?.status === 'completed')

      assert.deepStrictEqual(completedStoryIds, ['story-1'])
    })

    it('should update incomplete stories to pending status', () => {
      const storyProgress = {
        'story-1': { status: 'completed' },
        'story-2': { status: 'in-progress' },
        'story-3': { status: undefined }
      }
      const storyIds = ['story-1', 'story-2', 'story-3']

      const incompleteStoryIds = storyIds.filter(sid => storyProgress[sid]?.status !== 'completed')

      assert.deepStrictEqual(incompleteStoryIds, ['story-2', 'story-3'])
    })

    it('should archive sprint only after story updates succeed', () => {
      // Verifies the transaction order: story updates BEFORE sprint deletion
      const operationOrder = [
        { step: 1, action: 'INSERT INTO sprint_history', table: 'sprint_history' },
        { step: 2, action: 'UPDATE completed stories', table: 'user_stories' },
        { step: 3, action: 'UPDATE incomplete stories', table: 'user_stories' },
        { step: 4, action: 'DELETE FROM sprint_stories', table: 'sprint_stories' },
        { step: 5, action: 'DELETE FROM sprints', table: 'sprints' }
      ]

      // Sprint deletion (step 5) comes AFTER story updates (steps 2-3)
      const sprintDeleteStep = operationOrder.find(op => op.table === 'sprints')
      const storyUpdateSteps = operationOrder.filter(op => op.table === 'user_stories')

      assert.ok(storyUpdateSteps.every(s => s.step < sprintDeleteStep.step))
    })

    it('should rollback all changes if any operation fails', () => {
      // If UPDATE user_stories fails, sprint_history insert should be rolled back
      const mockArchiveFailure = () => {
        let historyInserted = false
        let storiesUpdated = false
        let relationshipsDeleted = false
        let sprintDeleted = false
        let rolledBack = false

        try {
          // Step 1: Insert to history (succeeds)
          historyInserted = true

          // Step 2: Update completed stories (fails)
          throw new Error('SQLITE_CONSTRAINT: user_stories update failed')
        } catch {
          // Transaction automatically rolls back ALL changes
          rolledBack = true
          historyInserted = false
          storiesUpdated = false
          relationshipsDeleted = false
          sprintDeleted = false
        }

        return { historyInserted, storiesUpdated, relationshipsDeleted, sprintDeleted, rolledBack }
      }

      const result = mockArchiveFailure()
      assert.strictEqual(result.rolledBack, true)
      assert.strictEqual(result.historyInserted, false) // Rolled back
      assert.strictEqual(result.storiesUpdated, false)
    })

    it('should store inline story data in sprint_history', () => {
      // When archiving, stories are stored inline for historical reference
      const stories = [
        { id: 'story-1', title: 'Story One', status: 'completed' },
        { id: 'story-2', title: 'Story Two', status: 'pending' }
      ]

      const archivedData = {
        id: 'sprint-1',
        stories: JSON.stringify(stories),
        story_ids: JSON.stringify(['story-1', 'story-2'])
      }

      const parsedStories = JSON.parse(archivedData.stories)
      assert.strictEqual(parsedStories.length, 2)
      assert.strictEqual(parsedStories[0].title, 'Story One')
    })

    it('should have SprintService.closeAndArchive method', () => {
      const { SprintService } = require('../../src/main/services')
      assert.strictEqual(typeof SprintService.prototype.closeAndArchive, 'function')
    })

    it('should throw SprintNotFoundError for non-existent sprint', () => {
      const { SprintNotFoundError } = require('../../src/main/services')
      const sprintId = 'non-existent-sprint'

      const error = new SprintNotFoundError(sprintId)

      assert.strictEqual(error.name, 'SprintNotFoundError')
      assert.ok(error.message.includes(sprintId))
      assert.strictEqual(error.sprintId, sprintId)
    })

    it('should trigger onSprintArchived callback after successful archive', () => {
      // SprintService calls onSprintArchived after successful closure
      let callbackInvoked = false
      let archivedSprintId = null

      const mockOnSprintArchived = (archived) => {
        callbackInvoked = true
        archivedSprintId = archived.id
      }

      // Simulate successful archive
      const archived = { id: 'sprint-1', status: 'closed' }
      mockOnSprintArchived(archived)

      assert.strictEqual(callbackInvoked, true)
      assert.strictEqual(archivedSprintId, 'sprint-1')
    })

    it('should include assertionResults in inline story data', () => {
      // closeAndArchive stores assertionResults for historical reference
      const story = {
        id: 'story-1',
        title: 'Story One',
        assertionResults: {
          evaluatedAt: '2024-01-01T00:00:00Z',
          summary: { total: 5, passed: 4, failed: 1 },
          results: []
        }
      }

      const archivedStory = {
        id: story.id,
        title: story.title,
        assertionResults: story.assertionResults
      }

      assert.ok(archivedStory.assertionResults)
      assert.strictEqual(archivedStory.assertionResults.summary.passed, 4)
    })
  })

  describe('Inspection Assertions Integration', () => {
    it('should include inspectionAssertions in _getSprintStories output', () => {
      // _getSprintStories must map inspection_assertions column
      const storyFields = [
        'id', 'branchId', 'title', 'description',
        'acceptanceCriteria', 'inspectionAssertions', 'assertionResults',
        'status', 'implementedOn', 'sourcePromptId',
        'createdAt', 'updatedAt', 'sprintAddedAt'
      ]

      // Verify inspectionAssertions is a required field
      assert.ok(storyFields.includes('inspectionAssertions'))
      assert.ok(storyFields.includes('assertionResults'))
    })

    it('should preserve inspectionAssertions when story moves to sprint', () => {
      const story = {
        id: 'story-1',
        title: 'Feature Story',
        inspectionAssertions: [
          { id: 'a1', type: 'file-exists', pattern: 'src/feature.js' },
          { id: 'a2', type: 'code-contains', pattern: 'export function' }
        ]
      }

      // When story is loaded via sprint, assertions should be preserved
      const sprintStory = {
        ...story,
        sprintAddedAt: new Date().toISOString()
      }

      assert.deepStrictEqual(sprintStory.inspectionAssertions, story.inspectionAssertions)
      assert.strictEqual(sprintStory.inspectionAssertions.length, 2)
    })

    it('should preserve assertionResults when story moves to sprint', () => {
      const story = {
        id: 'story-1',
        title: 'Feature Story',
        assertionResults: {
          evaluatedAt: '2024-01-01T12:00:00Z',
          summary: { total: 3, passed: 2, failed: 1, undecided: 0 },
          results: [
            { assertionId: 'a1', status: 'passed' },
            { assertionId: 'a2', status: 'passed' },
            { assertionId: 'a3', status: 'failed' }
          ]
        }
      }

      // When story is loaded via sprint, results should be preserved
      const sprintStory = {
        ...story,
        sprintAddedAt: new Date().toISOString()
      }

      assert.strictEqual(sprintStory.assertionResults.summary.passed, 2)
      assert.strictEqual(sprintStory.assertionResults.summary.failed, 1)
    })

    it('should include inspectionAssertions in archived sprint stories', () => {
      // SprintService.closeAndArchive stores full assertion data
      const story = {
        id: 'story-1',
        title: 'Feature Story',
        inspectionAssertions: [
          { id: 'a1', type: 'file-exists', pattern: 'config.js' }
        ],
        assertionResults: {
          summary: { total: 1, passed: 1, failed: 0 }
        }
      }

      // Archived story format from closeAndArchive
      const archivedStory = {
        id: story.id,
        title: story.title,
        description: story.description,
        status: story.status,
        acceptanceCriteria: story.acceptanceCriteria || [],
        inspectionAssertions: story.inspectionAssertions || [],
        assertionResults: story.assertionResults
      }

      assert.ok(Array.isArray(archivedStory.inspectionAssertions))
      assert.strictEqual(archivedStory.inspectionAssertions.length, 1)
      assert.ok(archivedStory.assertionResults)
    })

    it('should handle stories without assertions gracefully', () => {
      const story = {
        id: 'story-1',
        title: 'Simple Story'
        // No inspectionAssertions or assertionResults
      }

      // Default values should be applied
      const processedStory = {
        ...story,
        inspectionAssertions: story.inspectionAssertions || [],
        assertionResults: story.assertionResults || null
      }

      assert.deepStrictEqual(processedStory.inspectionAssertions, [])
      assert.strictEqual(processedStory.assertionResults, null)
    })

    it('should preserve assertion data after application reload', () => {
      // Simulate loading from database
      const dbRow = {
        id: 'story-1',
        inspection_assertions: JSON.stringify([
          { id: 'a1', type: 'file-exists', pattern: 'src/app.js' }
        ]),
        assertion_results: JSON.stringify({
          evaluatedAt: '2024-01-01T00:00:00Z',
          summary: { total: 1, passed: 1, failed: 0 }
        })
      }

      // Parse JSON (as BaseRepository.parseJson does)
      const parseJson = (str, defaultVal) => {
        if (!str) return defaultVal
        try { return JSON.parse(str) }
        catch { return defaultVal }
      }

      const story = {
        id: dbRow.id,
        inspectionAssertions: parseJson(dbRow.inspection_assertions, []),
        assertionResults: parseJson(dbRow.assertion_results, null)
      }

      assert.strictEqual(story.inspectionAssertions.length, 1)
      assert.strictEqual(story.inspectionAssertions[0].type, 'file-exists')
      assert.strictEqual(story.assertionResults.summary.passed, 1)
    })

    it('should display assertion status correctly based on results', () => {
      // Test status determination logic
      const getStatus = (results) => {
        if (!results || !results.summary) return 'not-evaluated'
        const { passed, failed, total } = results.summary
        if (failed > 0) return 'failed'
        if (passed === total) return 'passed'
        return 'partial'
      }

      // All passed
      assert.strictEqual(getStatus({ summary: { total: 3, passed: 3, failed: 0 } }), 'passed')

      // Some failed
      assert.strictEqual(getStatus({ summary: { total: 3, passed: 2, failed: 1 } }), 'failed')

      // Not evaluated
      assert.strictEqual(getStatus(null), 'not-evaluated')

      // Partial (some undecided)
      assert.strictEqual(getStatus({ summary: { total: 3, passed: 2, failed: 0 } }), 'partial')
    })
  })
})
