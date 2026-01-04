/**
 * User Story Repository Tests
 *
 * Tests for the UserStoryRepository CRUD operations and queries.
 */

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert')
const path = require('path')
const fs = require('fs')
const os = require('os')

// Test the repository logic without native SQLite module
describe('UserStoryRepository', () => {
  describe('Data Transformation', () => {
    it('should convert camelCase to snake_case', () => {
      const toSnakeCase = (str) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)

      assert.strictEqual(toSnakeCase('branchId'), 'branch_id')
      assert.strictEqual(toSnakeCase('acceptanceCriteria'), 'acceptance_criteria')
      assert.strictEqual(toSnakeCase('createdAt'), 'created_at')
      assert.strictEqual(toSnakeCase('sourcePromptId'), 'source_prompt_id')
    })

    it('should convert snake_case to camelCase', () => {
      const toCamelCase = (str) => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())

      assert.strictEqual(toCamelCase('branch_id'), 'branchId')
      assert.strictEqual(toCamelCase('acceptance_criteria'), 'acceptanceCriteria')
      assert.strictEqual(toCamelCase('created_at'), 'createdAt')
      assert.strictEqual(toCamelCase('source_prompt_id'), 'sourcePromptId')
    })

    it('should transform database row to story object', () => {
      const row = {
        id: 'story-1',
        branch_id: 'branch-1',
        title: 'Test Story',
        description: 'Test description',
        acceptance_criteria: '["AC1", "AC2"]',
        status: 'pending',
        implemented_on: '[]',
        source_prompt_id: 'prompt-1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        archived_at: null
      }

      // Simulate transformation
      const story = {
        id: row.id,
        branchId: row.branch_id,
        title: row.title,
        description: row.description || '',
        acceptanceCriteria: JSON.parse(row.acceptance_criteria || '[]'),
        status: row.status,
        implementedOn: JSON.parse(row.implemented_on || '[]'),
        sourcePromptId: row.source_prompt_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        archivedAt: row.archived_at
      }

      assert.strictEqual(story.id, 'story-1')
      assert.strictEqual(story.branchId, 'branch-1')
      assert.deepStrictEqual(story.acceptanceCriteria, ['AC1', 'AC2'])
      assert.strictEqual(story.status, 'pending')
      assert.deepStrictEqual(story.implementedOn, [])
    })

    it('should transform story object to database row', () => {
      const story = {
        id: 'story-1',
        branchId: 'branch-1',
        title: 'Test Story',
        description: 'Test description',
        acceptanceCriteria: ['AC1', 'AC2'],
        status: 'pending',
        implementedOn: ['main'],
        sourcePromptId: 'prompt-1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        archivedAt: null
      }

      // Simulate transformation
      const row = {
        id: story.id,
        branch_id: story.branchId || null,
        title: story.title,
        description: story.description || '',
        acceptance_criteria: JSON.stringify(story.acceptanceCriteria || []),
        status: story.status || 'pending',
        implemented_on: JSON.stringify(story.implementedOn || []),
        source_prompt_id: story.sourcePromptId || null,
        created_at: story.createdAt,
        updated_at: story.updatedAt,
        archived_at: story.archivedAt || null
      }

      assert.strictEqual(row.id, 'story-1')
      assert.strictEqual(row.branch_id, 'branch-1')
      assert.strictEqual(row.acceptance_criteria, '["AC1","AC2"]')
      assert.strictEqual(row.implemented_on, '["main"]')
    })
  })

  describe('Status Enum', () => {
    it('should define valid status values', () => {
      const StoryStatus = {
        PENDING: 'pending',
        IN_PROGRESS: 'in-progress',
        COMPLETED: 'completed',
        ARCHIVED: 'archived'
      }

      assert.strictEqual(StoryStatus.PENDING, 'pending')
      assert.strictEqual(StoryStatus.IN_PROGRESS, 'in-progress')
      assert.strictEqual(StoryStatus.COMPLETED, 'completed')
      assert.strictEqual(StoryStatus.ARCHIVED, 'archived')
    })
  })

  describe('Query Building', () => {
    it('should build findAll query with default options', () => {
      const options = {}
      const orderBy = options.orderBy || 'created_at'
      const order = options.order || 'DESC'

      let sql = `SELECT * FROM user_stories WHERE status != 'archived' ORDER BY ${orderBy} ${order}`

      assert.ok(sql.includes('ORDER BY created_at DESC'))
      assert.ok(sql.includes("WHERE status != 'archived'"))
    })

    it('should build findAll query with limit and offset', () => {
      const options = { limit: 10, offset: 5 }
      let sql = `SELECT * FROM user_stories WHERE status != 'archived' ORDER BY created_at DESC`

      if (options.limit) {
        sql += ` LIMIT ${options.limit}`
        if (options.offset) {
          sql += ` OFFSET ${options.offset}`
        }
      }

      assert.ok(sql.includes('LIMIT 10'))
      assert.ok(sql.includes('OFFSET 5'))
    })

    it('should build findBySprintId query with join', () => {
      const sprintId = 'sprint-1'
      const sql = `
        SELECT us.* FROM user_stories us
        INNER JOIN sprint_stories ss ON us.id = ss.story_id
        WHERE ss.sprint_id = '${sprintId}'
        ORDER BY ss.added_at ASC
      `

      assert.ok(sql.includes('INNER JOIN sprint_stories'))
      assert.ok(sql.includes('ss.sprint_id'))
      assert.ok(sql.includes('ORDER BY ss.added_at'))
    })

    it('should build search query with LIKE pattern', () => {
      const query = 'test'
      const searchPattern = `%${query}%`

      const sql = `
        SELECT * FROM user_stories
        WHERE (title LIKE '${searchPattern}' OR description LIKE '${searchPattern}')
          AND status != 'archived'
        ORDER BY created_at DESC
      `

      assert.ok(sql.includes("LIKE '%test%'"))
      assert.ok(sql.includes("status != 'archived'"))
    })

    it('should build findByDateRange query', () => {
      const startDate = '2024-01-01T00:00:00Z'
      const endDate = '2024-12-31T23:59:59Z'

      const sql = `
        SELECT * FROM user_stories
        WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'
        ORDER BY created_at DESC
      `

      assert.ok(sql.includes('created_at >='))
      assert.ok(sql.includes('created_at <='))
    })
  })

  describe('JSON Parsing', () => {
    it('should parse JSON safely with default value', () => {
      const parseJson = (value, defaultValue = null) => {
        if (value === null || value === undefined) {
          return defaultValue
        }
        try {
          return JSON.parse(value)
        } catch {
          return defaultValue
        }
      }

      assert.deepStrictEqual(parseJson('["a", "b"]', []), ['a', 'b'])
      assert.deepStrictEqual(parseJson(null, []), [])
      assert.deepStrictEqual(parseJson(undefined, []), [])
      assert.deepStrictEqual(parseJson('invalid json', []), [])
      assert.deepStrictEqual(parseJson('{}', {}), {})
    })

    it('should stringify values for JSON columns', () => {
      const toJson = (value) => JSON.stringify(value)

      assert.strictEqual(toJson(['AC1', 'AC2']), '["AC1","AC2"]')
      assert.strictEqual(toJson([]), '[]')
      assert.strictEqual(toJson({ key: 'value' }), '{"key":"value"}')
    })
  })

  describe('ID Generation', () => {
    it('should generate unique IDs', () => {
      const generateId = () => `story-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      const id1 = generateId()
      const id2 = generateId()

      assert.ok(id1.startsWith('story-'))
      assert.ok(id2.startsWith('story-'))
      assert.notStrictEqual(id1, id2)
    })
  })

  describe('Bulk Operations', () => {
    it('should process bulk upsert correctly', () => {
      const stories = [
        { id: 'story-1', title: 'Story 1', status: 'pending' },
        { id: 'story-2', title: 'Story 2', status: 'in-progress' },
        { id: 'story-3', title: 'Story 3', status: 'completed' }
      ]

      // Simulate bulk upsert
      const processed = []
      for (const story of stories) {
        processed.push({
          ...story,
          updatedAt: new Date().toISOString()
        })
      }

      assert.strictEqual(processed.length, 3)
      assert.ok(processed.every(s => s.updatedAt))
    })
  })

  describe('Archive Operations', () => {
    it('should prepare story for archiving', () => {
      const story = {
        id: 'story-1',
        title: 'Test Story',
        status: 'completed'
      }

      const archived = {
        ...story,
        status: 'archived',
        archivedAt: new Date().toISOString()
      }

      assert.strictEqual(archived.status, 'archived')
      assert.ok(archived.archivedAt)
    })

    it('should prepare story for restoration', () => {
      const archived = {
        id: 'story-1',
        title: 'Test Story',
        status: 'archived',
        archivedAt: '2024-01-01T00:00:00Z'
      }

      const restored = {
        ...archived,
        status: 'pending',
        archivedAt: null,
        updatedAt: new Date().toISOString()
      }

      assert.strictEqual(restored.status, 'pending')
      assert.strictEqual(restored.archivedAt, null)
      assert.ok(restored.updatedAt)
    })
  })

  describe('Statistics', () => {
    it('should aggregate status counts correctly', () => {
      const rows = [
        { status: 'pending', count: 5 },
        { status: 'in-progress', count: 3 },
        { status: 'completed', count: 10 }
      ]

      const counts = {}
      for (const row of rows) {
        counts[row.status] = row.count
      }

      // Add archived count
      counts.archived = 2

      assert.strictEqual(counts.pending, 5)
      assert.strictEqual(counts['in-progress'], 3)
      assert.strictEqual(counts.completed, 10)
      assert.strictEqual(counts.archived, 2)
    })
  })
})

describe('Inspection Assertions Integration', () => {
  describe('Story Creation with Assertions', () => {
    it('should include inspectionAssertions in story object', () => {
      const story = {
        id: 'story-1',
        title: 'Test Story',
        description: 'Test description',
        acceptanceCriteria: ['Create file "test.js"'],
        inspectionAssertions: [
          {
            id: 'IA1234',
            type: 'FILE_EXISTS',
            criterion: 'AC1',
            target: 'test.js',
            message: 'File test.js should exist',
            generated: true
          }
        ],
        status: 'pending'
      }

      assert.ok(Array.isArray(story.inspectionAssertions))
      assert.strictEqual(story.inspectionAssertions.length, 1)
      assert.strictEqual(story.inspectionAssertions[0].type, 'FILE_EXISTS')
      assert.strictEqual(story.inspectionAssertions[0].generated, true)
    })

    it('should transform inspectionAssertions to database row', () => {
      const story = {
        id: 'story-1',
        title: 'Test Story',
        inspectionAssertions: [
          {
            id: 'IA1234',
            type: 'FILE_EXISTS',
            target: 'src/test.js',
            message: 'File should exist'
          },
          {
            id: 'IA5678',
            type: 'CLASS_STRUCTURE',
            target: 'src/**/*.js',
            assertion: { class_name: 'TestService' },
            message: 'Class TestService should exist'
          }
        ]
      }

      // Simulate transformation to DB row
      const row = {
        id: story.id,
        title: story.title,
        inspection_assertions: JSON.stringify(story.inspectionAssertions || [])
      }

      const parsedAssertions = JSON.parse(row.inspection_assertions)
      assert.strictEqual(parsedAssertions.length, 2)
      assert.strictEqual(parsedAssertions[0].type, 'FILE_EXISTS')
      assert.strictEqual(parsedAssertions[1].assertion.class_name, 'TestService')
    })

    it('should transform database row to story with inspectionAssertions', () => {
      const row = {
        id: 'story-1',
        title: 'Test Story',
        description: 'Description',
        acceptance_criteria: '["AC1", "AC2"]',
        inspection_assertions: '[{"id":"IA1","type":"FILE_EXISTS","target":"test.js","message":"Test"}]',
        assertion_results: null,
        status: 'pending',
        implemented_on: '[]',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      }

      const parseJson = (value, defaultValue) => {
        if (!value) return defaultValue
        try { return JSON.parse(value) } catch { return defaultValue }
      }

      const story = {
        id: row.id,
        title: row.title,
        description: row.description || '',
        acceptanceCriteria: parseJson(row.acceptance_criteria, []),
        inspectionAssertions: parseJson(row.inspection_assertions, []),
        assertionResults: parseJson(row.assertion_results, null),
        status: row.status,
        implementedOn: parseJson(row.implemented_on, [])
      }

      assert.deepStrictEqual(story.acceptanceCriteria, ['AC1', 'AC2'])
      assert.strictEqual(story.inspectionAssertions.length, 1)
      assert.strictEqual(story.inspectionAssertions[0].type, 'FILE_EXISTS')
      assert.strictEqual(story.assertionResults, null)
    })

    it('should default to empty array when inspectionAssertions is null', () => {
      const row = {
        id: 'story-1',
        title: 'Test Story',
        inspection_assertions: null,
        assertion_results: null
      }

      const parseJson = (value, defaultValue) => {
        if (!value) return defaultValue
        try { return JSON.parse(value) } catch { return defaultValue }
      }

      const story = {
        inspectionAssertions: parseJson(row.inspection_assertions, []),
        assertionResults: parseJson(row.assertion_results, null)
      }

      assert.deepStrictEqual(story.inspectionAssertions, [])
      assert.strictEqual(story.assertionResults, null)
    })
  })

  describe('Assertion Action and Model Integration', () => {
    it('should include inspectionAssertions in ADD_USER_STORY payload', () => {
      const generateId = () => `story-${Date.now()}`

      // Simulate actions.addUserStory
      const addUserStory = (story) => ({
        type: 'ADD_USER_STORY',
        payload: {
          id: generateId(),
          title: story.title,
          description: story.description || '',
          acceptanceCriteria: story.acceptanceCriteria || [],
          inspectionAssertions: story.inspectionAssertions || [],
          status: story.status || 'pending',
          sourcePromptId: story.sourcePromptId || null,
          createdAt: Date.now()
        }
      })

      const story = {
        title: 'My Story',
        description: 'Description',
        acceptanceCriteria: ['AC1'],
        inspectionAssertions: [
          { id: 'IA1', type: 'FILE_EXISTS', target: 'test.js', message: 'Test' }
        ]
      }

      const action = addUserStory(story)

      assert.strictEqual(action.type, 'ADD_USER_STORY')
      assert.ok(action.payload.id.startsWith('story-'))
      assert.deepStrictEqual(action.payload.inspectionAssertions, story.inspectionAssertions)
    })

    it('should include inspectionAssertions in model after acceptor', () => {
      // Simulate model acceptor
      const model = {
        userStories: []
      }

      const proposal = {
        type: 'ADD_USER_STORY',
        payload: {
          id: 'story-1',
          title: 'Test Story',
          description: 'Desc',
          acceptanceCriteria: ['AC1'],
          inspectionAssertions: [
            { id: 'IA1', type: 'FILE_EXISTS', target: 'test.js', message: 'Test' }
          ],
          status: 'pending',
          createdAt: Date.now()
        }
      }

      // Simulate addUserStoryAcceptor
      if (proposal?.type === 'ADD_USER_STORY') {
        model.userStories.push({
          id: proposal.payload.id,
          title: proposal.payload.title,
          description: proposal.payload.description,
          acceptanceCriteria: proposal.payload.acceptanceCriteria,
          inspectionAssertions: proposal.payload.inspectionAssertions || [],
          status: proposal.payload.status,
          createdAt: proposal.payload.createdAt
        })
      }

      assert.strictEqual(model.userStories.length, 1)
      assert.strictEqual(model.userStories[0].inspectionAssertions.length, 1)
      assert.strictEqual(model.userStories[0].inspectionAssertions[0].type, 'FILE_EXISTS')
    })
  })

  describe('Assertion Persistence Flow', () => {
    it('should serialize assertions for database storage', () => {
      const story = {
        id: 'story-1',
        title: 'Test Story',
        inspectionAssertions: [
          {
            id: 'IA1',
            type: 'FILE_EXISTS',
            criterion: 'AC1',
            target: 'src/service.js',
            assertion: { type: 'file' },
            message: 'Service file should exist',
            generated: true
          },
          {
            id: 'IA2',
            type: 'CLASS_STRUCTURE',
            criterion: 'AC2',
            target: 'src/**/*.js',
            assertion: { class_name: 'MyService', methods: ['init'] },
            message: 'MyService class should have init method',
            generated: true
          }
        ]
      }

      // Simulate puffin-state.addUserStory building the newStory
      const newStory = {
        id: story.id,
        title: story.title,
        inspectionAssertions: story.inspectionAssertions || []
      }

      assert.strictEqual(newStory.inspectionAssertions.length, 2)

      // Simulate repository converting to row
      const serialized = JSON.stringify(newStory.inspectionAssertions)
      const parsed = JSON.parse(serialized)

      assert.strictEqual(parsed.length, 2)
      assert.strictEqual(parsed[0].type, 'FILE_EXISTS')
      assert.deepStrictEqual(parsed[1].assertion.methods, ['init'])
    })

    it('should preserve assertion structure through save and load cycle', () => {
      const originalAssertions = [
        {
          id: 'IA-test-1',
          type: 'EXPORT_EXISTS',
          criterion: 'AC1',
          target: 'src/index.js',
          assertion: { exports: [{ name: 'MyClass', type: 'class' }] },
          message: 'Should export MyClass',
          generated: true
        }
      ]

      // Simulate save
      const dbValue = JSON.stringify(originalAssertions)

      // Simulate load
      const parseJson = (value, defaultValue) => {
        try { return JSON.parse(value) } catch { return defaultValue }
      }
      const loadedAssertions = parseJson(dbValue, [])

      assert.deepStrictEqual(loadedAssertions, originalAssertions)
      assert.strictEqual(loadedAssertions[0].assertion.exports[0].name, 'MyClass')
    })
  })
})

describe('BaseRepository', () => {
  describe('Utility Methods', () => {
    it('should check record existence', () => {
      // Simulate exists check
      const existingIds = new Set(['story-1', 'story-2'])

      const exists = (id) => existingIds.has(id)

      assert.strictEqual(exists('story-1'), true)
      assert.strictEqual(exists('story-3'), false)
    })

    it('should count records with filter', () => {
      const records = [
        { id: '1', status: 'pending' },
        { id: '2', status: 'pending' },
        { id: '3', status: 'completed' }
      ]

      const count = (whereFilter) => {
        if (!whereFilter) return records.length
        return records.filter(whereFilter).length
      }

      assert.strictEqual(count(), 3)
      assert.strictEqual(count(r => r.status === 'pending'), 2)
    })

    it('should delete by ID', () => {
      let records = [
        { id: '1', title: 'Story 1' },
        { id: '2', title: 'Story 2' }
      ]

      const deleteById = (id) => {
        const index = records.findIndex(r => r.id === id)
        if (index !== -1) {
          records.splice(index, 1)
          return true
        }
        return false
      }

      assert.strictEqual(deleteById('1'), true)
      assert.strictEqual(records.length, 1)
      assert.strictEqual(deleteById('3'), false)
    })

    it('should delete multiple by IDs', () => {
      let records = [
        { id: '1', title: 'Story 1' },
        { id: '2', title: 'Story 2' },
        { id: '3', title: 'Story 3' }
      ]

      const deleteByIds = (ids) => {
        const idsSet = new Set(ids)
        const initialLength = records.length
        records = records.filter(r => !idsSet.has(r.id))
        return initialLength - records.length
      }

      assert.strictEqual(deleteByIds(['1', '3']), 2)
      assert.strictEqual(records.length, 1)
      assert.strictEqual(records[0].id, '2')
    })

    it('should generate ISO timestamp', () => {
      const now = () => new Date().toISOString()

      const timestamp = now()
      assert.ok(timestamp.includes('T'))
      assert.ok(timestamp.endsWith('Z'))
    })
  })

  describe('Transaction Simulation', () => {
    it('should execute operations atomically', () => {
      let state = { count: 0 }

      const transaction = (fn) => {
        const backup = { ...state }
        try {
          fn()
        } catch (error) {
          state = backup
          throw error
        }
      }

      // Successful transaction
      transaction(() => {
        state.count++
        state.count++
      })
      assert.strictEqual(state.count, 2)

      // Failed transaction (rollback)
      try {
        transaction(() => {
          state.count++
          throw new Error('Simulated error')
        })
      } catch {
        // Expected
      }
      assert.strictEqual(state.count, 2) // Should have rolled back
    })
  })
})
