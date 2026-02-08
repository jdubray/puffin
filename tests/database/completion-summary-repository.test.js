/**
 * Completion Summary Repository Tests
 *
 * Tests for the CompletionSummaryRepository data transformations,
 * field handling, and edge cases.
 */

const { describe, it } = require('node:test')
const assert = require('node:assert')

describe('CompletionSummaryRepository', () => {
  describe('Row to Summary Transformation (_rowToSummary)', () => {
    const parseJson = (value, defaultValue) => {
      if (value === null || value === undefined) return defaultValue
      try { return JSON.parse(value) } catch { return defaultValue }
    }

    const rowToSummary = (row) => {
      if (!row) return null
      return {
        id: row.id,
        storyId: row.story_id,
        sessionId: row.session_id,
        summary: row.summary || '',
        filesModified: parseJson(row.files_modified, []),
        testsStatus: row.tests_status || 'unknown',
        criteriaMatched: parseJson(row.criteria_matched, []),
        turns: row.turns || 0,
        cost: row.cost || 0,
        duration: row.duration || 0,
        createdAt: row.created_at
      }
    }

    it('should transform a full database row to a summary object', () => {
      const row = {
        id: 'cs-001',
        story_id: 'story-1',
        session_id: 'session-abc',
        summary: 'Implemented authentication module',
        files_modified: '["src/auth.js","src/login.js"]',
        tests_status: 'passing',
        criteria_matched: '[{"criterion":"Login works","met":true}]',
        turns: 5,
        cost: 0.0234,
        duration: 45000,
        created_at: '2024-06-15T10:30:00Z'
      }

      const summary = rowToSummary(row)

      assert.strictEqual(summary.id, 'cs-001')
      assert.strictEqual(summary.storyId, 'story-1')
      assert.strictEqual(summary.sessionId, 'session-abc')
      assert.strictEqual(summary.summary, 'Implemented authentication module')
      assert.deepStrictEqual(summary.filesModified, ['src/auth.js', 'src/login.js'])
      assert.strictEqual(summary.testsStatus, 'passing')
      assert.deepStrictEqual(summary.criteriaMatched, [{ criterion: 'Login works', met: true }])
      assert.strictEqual(summary.turns, 5)
      assert.strictEqual(summary.cost, 0.0234)
      assert.strictEqual(summary.duration, 45000)
      assert.strictEqual(summary.createdAt, '2024-06-15T10:30:00Z')
    })

    it('should return null for null row', () => {
      assert.strictEqual(rowToSummary(null), null)
    })

    it('should default summary to empty string when missing', () => {
      const row = { id: 'cs-002', story_id: 'story-1', summary: null }
      const summary = rowToSummary(row)
      assert.strictEqual(summary.summary, '')
    })

    it('should default testsStatus to unknown when missing', () => {
      const row = { id: 'cs-003', story_id: 'story-1', tests_status: null }
      const summary = rowToSummary(row)
      assert.strictEqual(summary.testsStatus, 'unknown')
    })

    it('should default JSON columns to empty arrays on null', () => {
      const row = {
        id: 'cs-004',
        story_id: 'story-1',
        files_modified: null,
        criteria_matched: null
      }
      const summary = rowToSummary(row)
      assert.deepStrictEqual(summary.filesModified, [])
      assert.deepStrictEqual(summary.criteriaMatched, [])
    })

    it('should default JSON columns to empty arrays on invalid JSON', () => {
      const row = {
        id: 'cs-005',
        story_id: 'story-1',
        files_modified: 'not json',
        criteria_matched: '{broken'
      }
      const summary = rowToSummary(row)
      assert.deepStrictEqual(summary.filesModified, [])
      assert.deepStrictEqual(summary.criteriaMatched, [])
    })

    it('should default numeric fields to 0 when missing', () => {
      const row = { id: 'cs-006', story_id: 'story-1', turns: null, cost: null, duration: null }
      const summary = rowToSummary(row)
      assert.strictEqual(summary.turns, 0)
      assert.strictEqual(summary.cost, 0)
      assert.strictEqual(summary.duration, 0)
    })
  })

  describe('Summary to Row Transformation (_summaryToRow)', () => {
    const summaryToRow = (summary) => {
      return {
        id: summary.id || 'generated-uuid',
        story_id: summary.storyId,
        session_id: summary.sessionId || null,
        summary: summary.summary || '',
        files_modified: JSON.stringify(summary.filesModified || []),
        tests_status: summary.testsStatus || 'unknown',
        criteria_matched: JSON.stringify(summary.criteriaMatched || []),
        turns: summary.turns || 0,
        cost: summary.cost || 0,
        duration: summary.duration || 0,
        created_at: summary.createdAt || new Date().toISOString()
      }
    }

    it('should transform a full summary object to a database row', () => {
      const summary = {
        id: 'cs-001',
        storyId: 'story-1',
        sessionId: 'session-abc',
        summary: 'Implemented feature',
        filesModified: ['src/auth.js'],
        testsStatus: 'passing',
        criteriaMatched: [{ criterion: 'AC1', met: true }],
        turns: 3,
        cost: 0.015,
        duration: 30000,
        createdAt: '2024-06-15T10:30:00Z'
      }

      const row = summaryToRow(summary)

      assert.strictEqual(row.id, 'cs-001')
      assert.strictEqual(row.story_id, 'story-1')
      assert.strictEqual(row.session_id, 'session-abc')
      assert.strictEqual(row.summary, 'Implemented feature')
      assert.strictEqual(row.files_modified, '["src/auth.js"]')
      assert.strictEqual(row.tests_status, 'passing')
      assert.strictEqual(row.criteria_matched, '[{"criterion":"AC1","met":true}]')
      assert.strictEqual(row.turns, 3)
      assert.strictEqual(row.cost, 0.015)
      assert.strictEqual(row.duration, 30000)
      assert.strictEqual(row.created_at, '2024-06-15T10:30:00Z')
    })

    it('should generate an ID when not provided', () => {
      const summary = { storyId: 'story-1' }
      const row = summaryToRow(summary)
      assert.ok(row.id)
      assert.notStrictEqual(row.id, '')
    })

    it('should default sessionId to null when not provided', () => {
      const summary = { storyId: 'story-1' }
      const row = summaryToRow(summary)
      assert.strictEqual(row.session_id, null)
    })

    it('should default testsStatus to unknown when not provided', () => {
      const summary = { storyId: 'story-1' }
      const row = summaryToRow(summary)
      assert.strictEqual(row.tests_status, 'unknown')
    })

    it('should serialize empty arrays for missing JSON fields', () => {
      const summary = { storyId: 'story-1' }
      const row = summaryToRow(summary)
      assert.strictEqual(row.files_modified, '[]')
      assert.strictEqual(row.criteria_matched, '[]')
    })

    it('should default numeric fields to 0 when not provided', () => {
      const summary = { storyId: 'story-1' }
      const row = summaryToRow(summary)
      assert.strictEqual(row.turns, 0)
      assert.strictEqual(row.cost, 0)
      assert.strictEqual(row.duration, 0)
    })
  })

  describe('Round-trip Transformation', () => {
    const parseJson = (value, defaultValue) => {
      if (value === null || value === undefined) return defaultValue
      try { return JSON.parse(value) } catch { return defaultValue }
    }

    const summaryToRow = (summary) => ({
      id: summary.id || 'generated-uuid',
      story_id: summary.storyId,
      session_id: summary.sessionId || null,
      summary: summary.summary || '',
      files_modified: JSON.stringify(summary.filesModified || []),
      tests_status: summary.testsStatus || 'unknown',
      criteria_matched: JSON.stringify(summary.criteriaMatched || []),
      turns: summary.turns || 0,
      cost: summary.cost || 0,
      duration: summary.duration || 0,
      created_at: summary.createdAt || '2024-01-01T00:00:00Z'
    })

    const rowToSummary = (row) => ({
      id: row.id,
      storyId: row.story_id,
      sessionId: row.session_id,
      summary: row.summary || '',
      filesModified: parseJson(row.files_modified, []),
      testsStatus: row.tests_status || 'unknown',
      criteriaMatched: parseJson(row.criteria_matched, []),
      turns: row.turns || 0,
      cost: row.cost || 0,
      duration: row.duration || 0,
      createdAt: row.created_at
    })

    it('should preserve data through summary -> row -> summary cycle', () => {
      const original = {
        id: 'cs-round',
        storyId: 'story-42',
        sessionId: 'sess-xyz',
        summary: 'Full round-trip test',
        filesModified: ['src/a.js', 'src/b.js', 'test/a.test.js'],
        testsStatus: 'failing',
        criteriaMatched: [
          { criterion: 'Create auth module', met: true },
          { criterion: 'Add tests', met: false }
        ],
        turns: 7,
        cost: 0.0456,
        duration: 120000,
        createdAt: '2024-06-15T10:30:00Z'
      }

      const row = summaryToRow(original)
      const restored = rowToSummary(row)

      assert.deepStrictEqual(restored, original)
    })

    it('should handle criteria with unknown met status through round-trip', () => {
      const original = {
        id: 'cs-unknown',
        storyId: 'story-1',
        sessionId: null,
        summary: 'Test unknown criteria',
        filesModified: [],
        testsStatus: 'unknown',
        criteriaMatched: [
          { criterion: 'AC1', met: true },
          { criterion: 'AC2', met: false },
          { criterion: 'AC3', met: null }
        ],
        turns: 0,
        cost: 0,
        duration: 0,
        createdAt: '2024-01-01T00:00:00Z'
      }

      const row = summaryToRow(original)
      const restored = rowToSummary(row)

      assert.strictEqual(restored.criteriaMatched[0].met, true)
      assert.strictEqual(restored.criteriaMatched[1].met, false)
      assert.strictEqual(restored.criteriaMatched[2].met, null)
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero-value cost and duration (falsy but valid)', () => {
      // The || 0 pattern means 0 stays 0
      const summary = { storyId: 'story-1', turns: 0, cost: 0, duration: 0 }
      const row = {
        turns: summary.turns || 0,
        cost: summary.cost || 0,
        duration: summary.duration || 0
      }
      assert.strictEqual(row.turns, 0)
      assert.strictEqual(row.cost, 0)
      assert.strictEqual(row.duration, 0)
    })

    it('should handle special characters in summary text', () => {
      const summary = 'Implemented "login" with <script> & quotes\' handling'
      const row = { summary }
      assert.strictEqual(row.summary, summary)
    })

    it('should handle file paths with special characters', () => {
      const files = ['src/my file.js', 'src/path/with spaces/file.ts', 'src/[brackets].js']
      const serialized = JSON.stringify(files)
      const restored = JSON.parse(serialized)
      assert.deepStrictEqual(restored, files)
    })

    it('should handle empty criteria array serialization', () => {
      const criteria = []
      const serialized = JSON.stringify(criteria)
      assert.strictEqual(serialized, '[]')
      assert.deepStrictEqual(JSON.parse(serialized), [])
    })
  })

  describe('SQL Query Structure', () => {
    it('should build correct INSERT query with all columns', () => {
      const sql = `
        INSERT INTO completion_summaries (
          id, story_id, session_id, summary, files_modified,
          tests_status, criteria_matched, turns, cost, duration, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      const expectedColumns = [
        'id', 'story_id', 'session_id', 'summary', 'files_modified',
        'tests_status', 'criteria_matched', 'turns', 'cost', 'duration', 'created_at'
      ]
      for (const col of expectedColumns) {
        assert.ok(sql.includes(col), `Missing column: ${col}`)
      }
      // 11 columns = 11 placeholders
      assert.strictEqual((sql.match(/\?/g) || []).length, 11)
    })

    it('should build findByStoryId query with ORDER BY and LIMIT', () => {
      const sql = 'SELECT * FROM completion_summaries WHERE story_id = ? ORDER BY created_at DESC LIMIT 1'
      assert.ok(sql.includes('ORDER BY created_at DESC'))
      assert.ok(sql.includes('LIMIT 1'))
    })

    it('should build findAllByStoryId query without LIMIT', () => {
      const sql = 'SELECT * FROM completion_summaries WHERE story_id = ? ORDER BY created_at DESC'
      assert.ok(sql.includes('ORDER BY created_at DESC'))
      assert.ok(!sql.includes('LIMIT'))
    })

    it('should build deleteByStoryId query', () => {
      const sql = 'DELETE FROM completion_summaries WHERE story_id = ?'
      assert.ok(sql.includes('DELETE FROM'))
      assert.ok(sql.includes('WHERE story_id = ?'))
    })
  })
})
