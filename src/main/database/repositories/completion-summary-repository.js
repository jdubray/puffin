/**
 * Completion Summary Repository
 *
 * Manages CRUD operations for the completion_summaries table.
 * Stores structured completion data captured when stories are
 * marked complete during orchestrated sprint execution.
 *
 * @module database/repositories/completion-summary-repository
 */

const { BaseRepository } = require('./base-repository')
const crypto = require('crypto')

class CompletionSummaryRepository extends BaseRepository {
  constructor(connection) {
    super(connection, 'completion_summaries')
  }

  /**
   * Transform a database row to a completion summary object
   * @private
   */
  _rowToSummary(row) {
    if (!row) return null

    return {
      id: row.id,
      storyId: row.story_id,
      sessionId: row.session_id,
      summary: row.summary || '',
      filesModified: this.parseJson(row.files_modified, []),
      testsStatus: row.tests_status || 'unknown',
      criteriaMatched: this.parseJson(row.criteria_matched, []),
      turns: row.turns || 0,
      cost: row.cost || 0,
      duration: row.duration || 0,
      createdAt: row.created_at
    }
  }

  /**
   * Transform a completion summary object to database row values
   * @private
   */
  _summaryToRow(summary) {
    return {
      id: summary.id || crypto.randomUUID(),
      story_id: summary.storyId,
      session_id: summary.sessionId || null,
      summary: summary.summary || '',
      files_modified: this.toJson(summary.filesModified || []),
      tests_status: summary.testsStatus || 'unknown',
      criteria_matched: this.toJson(summary.criteriaMatched || []),
      turns: summary.turns || 0,
      cost: summary.cost || 0,
      duration: summary.duration || 0,
      created_at: summary.createdAt || this.now()
    }
  }

  /**
   * Create a new completion summary
   *
   * @param {Object} summary - Completion summary data
   * @param {string} summary.storyId - Foreign key to user_stories
   * @param {string} [summary.sessionId] - Claude session ID
   * @param {string} summary.summary - Human-readable summary text
   * @param {string[]} [summary.filesModified] - Files created/modified
   * @param {string} [summary.testsStatus] - Test pass/fail status
   * @param {Object[]} [summary.criteriaMatched] - AC match status
   * @param {number} [summary.turns] - CLI turns used
   * @param {number} [summary.cost] - USD cost
   * @param {number} [summary.duration] - Duration in ms
   * @returns {Object} Created completion summary
   */
  create(summary) {
    const db = this.getDb()
    const row = this._summaryToRow(summary)

    const sql = `
      INSERT INTO completion_summaries (
        id, story_id, session_id, summary, files_modified,
        tests_status, criteria_matched, turns, cost, duration, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const params = [
      row.id,
      row.story_id,
      row.session_id,
      row.summary,
      row.files_modified,
      row.tests_status,
      row.criteria_matched,
      row.turns,
      row.cost,
      row.duration,
      row.created_at
    ]

    this.traceQuery('INSERT', sql, params, () => {
      db.prepare(sql).run(...params)
    })

    return this.findById(row.id)
  }

  /**
   * Find a completion summary by ID
   *
   * @param {string} id - Summary ID
   * @returns {Object|null} Completion summary or null
   */
  findById(id) {
    const db = this.getDb()
    const sql = 'SELECT * FROM completion_summaries WHERE id = ?'

    const row = this.traceQuery('SELECT', sql, [id], () => {
      return db.prepare(sql).get(id)
    })

    return this._rowToSummary(row)
  }

  /**
   * Find completion summary by story ID
   *
   * @param {string} storyId - User story ID
   * @returns {Object|null} Most recent completion summary or null
   */
  findByStoryId(storyId) {
    const db = this.getDb()
    const sql = 'SELECT * FROM completion_summaries WHERE story_id = ? ORDER BY created_at DESC LIMIT 1'

    const row = this.traceQuery('SELECT_BY_STORY', sql, [storyId], () => {
      return db.prepare(sql).get(storyId)
    })

    return this._rowToSummary(row)
  }

  /**
   * Find all completion summaries for a story
   *
   * @param {string} storyId - User story ID
   * @returns {Object[]} Array of completion summaries
   */
  findAllByStoryId(storyId) {
    const db = this.getDb()
    const sql = 'SELECT * FROM completion_summaries WHERE story_id = ? ORDER BY created_at DESC'

    const rows = this.traceQuery('SELECT_ALL_BY_STORY', sql, [storyId], () => {
      return db.prepare(sql).all(storyId)
    })

    return rows.map(row => this._rowToSummary(row))
  }

  /**
   * Delete all completion summaries for a story
   *
   * @param {string} storyId - User story ID
   * @returns {number} Number of records deleted
   */
  deleteByStoryId(storyId) {
    const db = this.getDb()
    const sql = 'DELETE FROM completion_summaries WHERE story_id = ?'

    const result = this.traceQuery('DELETE_BY_STORY', sql, [storyId], () => {
      return db.prepare(sql).run(storyId)
    })

    return result.changes
  }
}

module.exports = { CompletionSummaryRepository }
