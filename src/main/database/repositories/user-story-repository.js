/**
 * User Story Repository
 *
 * Provides CRUD operations and queries for user stories.
 * Handles the transformation between JavaScript objects (camelCase)
 * and database columns (snake_case).
 *
 * @module database/repositories/user-story-repository
 */

const { BaseRepository } = require('./base-repository')

/**
 * User story status values
 * @readonly
 * @enum {string}
 */
const StoryStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',  // Changed from 'implemented' to match UI convention
  ARCHIVED: 'archived'
}

/**
 * Repository for user story data access
 */
class UserStoryRepository extends BaseRepository {
  /**
   * Create a user story repository
   *
   * @param {import('../connection').DatabaseConnection} connection - Database connection
   */
  constructor(connection) {
    super(connection, 'user_stories')
  }

  /**
   * Transform a database row to a user story object
   *
   * @private
   * @param {Object} row - Database row
   * @returns {Object} User story object
   */
  _rowToStory(row) {
    if (!row) return null

    return {
      id: row.id,
      branchId: row.branch_id,
      title: row.title,
      description: row.description || '',
      acceptanceCriteria: this.parseJson(row.acceptance_criteria, []),
      status: row.status,
      implementedOn: this.parseJson(row.implemented_on, []),
      sourcePromptId: row.source_prompt_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at
    }
  }

  /**
   * Transform a user story object to database row values
   *
   * @private
   * @param {Object} story - User story object
   * @returns {Object} Values for database insert/update
   */
  _storyToRow(story) {
    return {
      id: story.id,
      branch_id: story.branchId || null,
      title: story.title,
      description: story.description || '',
      acceptance_criteria: this.toJson(story.acceptanceCriteria || []),
      status: story.status || StoryStatus.PENDING,
      implemented_on: this.toJson(story.implementedOn || []),
      source_prompt_id: story.sourcePromptId || null,
      created_at: story.createdAt || this.now(),
      updated_at: story.updatedAt || this.now(),
      archived_at: story.archivedAt || null
    }
  }

  // ===== CREATE OPERATIONS =====

  /**
   * Create a new user story
   *
   * @param {Object} story - User story data
   * @returns {Object} Created user story
   */
  create(story) {
    const db = this.getDb()
    const row = this._storyToRow(story)

    const stmt = db.prepare(`
      INSERT INTO user_stories (
        id, branch_id, title, description, acceptance_criteria,
        status, implemented_on, source_prompt_id, created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      row.id,
      row.branch_id,
      row.title,
      row.description,
      row.acceptance_criteria,
      row.status,
      row.implemented_on,
      row.source_prompt_id,
      row.created_at,
      row.updated_at,
      row.archived_at
    )

    return this.findById(row.id)
  }

  /**
   * Create multiple user stories in a transaction
   *
   * @param {Object[]} stories - Array of user story data
   * @returns {Object[]} Created user stories
   */
  createMany(stories) {
    if (!stories || stories.length === 0) return []

    return this.transaction(() => {
      const created = []
      for (const story of stories) {
        created.push(this.create(story))
      }
      return created
    })
  }

  // ===== READ OPERATIONS =====

  /**
   * Find a user story by ID
   *
   * @param {string} id - Story ID
   * @returns {Object|null} User story or null
   */
  findById(id) {
    const db = this.getDb()
    const row = db.prepare(`
      SELECT * FROM user_stories WHERE id = ?
    `).get(id)

    return this._rowToStory(row)
  }

  /**
   * Find all user stories (excluding archived)
   *
   * @param {Object} [options] - Query options
   * @param {string} [options.orderBy='created_at'] - Column to order by
   * @param {string} [options.order='DESC'] - Sort order (ASC or DESC)
   * @param {number} [options.limit] - Maximum number of results
   * @param {number} [options.offset] - Number of results to skip
   * @returns {Object[]} Array of user stories
   */
  findAll(options = {}) {
    const db = this.getDb()
    const { orderBy = 'created_at', order = 'DESC', limit, offset } = options

    let sql = `SELECT * FROM user_stories WHERE status != 'archived' ORDER BY ${orderBy} ${order}`

    if (limit) {
      sql += ` LIMIT ${limit}`
      if (offset) {
        sql += ` OFFSET ${offset}`
      }
    }

    const rows = db.prepare(sql).all()
    return rows.map(row => this._rowToStory(row))
  }

  /**
   * Find user stories by status
   *
   * @param {string} status - Story status
   * @returns {Object[]} Array of user stories
   */
  findByStatus(status) {
    const db = this.getDb()
    const rows = db.prepare(`
      SELECT * FROM user_stories
      WHERE status = ?
      ORDER BY created_at DESC
    `).all(status)

    return rows.map(row => this._rowToStory(row))
  }

  /**
   * Find user stories by branch ID
   *
   * @param {string} branchId - Branch ID
   * @returns {Object[]} Array of user stories
   */
  findByBranchId(branchId) {
    const db = this.getDb()
    const rows = db.prepare(`
      SELECT * FROM user_stories
      WHERE branch_id = ?
      ORDER BY created_at DESC
    `).all(branchId)

    return rows.map(row => this._rowToStory(row))
  }

  /**
   * Find user stories by sprint ID
   *
   * @param {string} sprintId - Sprint ID
   * @returns {Object[]} Array of user stories
   */
  findBySprintId(sprintId) {
    const db = this.getDb()
    const rows = db.prepare(`
      SELECT us.* FROM user_stories us
      INNER JOIN sprint_stories ss ON us.id = ss.story_id
      WHERE ss.sprint_id = ?
      ORDER BY ss.added_at ASC
    `).all(sprintId)

    return rows.map(row => this._rowToStory(row))
  }

  /**
   * Find user stories created within a date range
   *
   * @param {string} startDate - Start date (ISO string)
   * @param {string} endDate - End date (ISO string)
   * @returns {Object[]} Array of user stories
   */
  findByDateRange(startDate, endDate) {
    const db = this.getDb()
    const rows = db.prepare(`
      SELECT * FROM user_stories
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `).all(startDate, endDate)

    return rows.map(row => this._rowToStory(row))
  }

  /**
   * Find user stories matching a search query
   *
   * @param {string} query - Search query
   * @returns {Object[]} Array of matching user stories
   */
  search(query) {
    const db = this.getDb()
    const searchPattern = `%${query}%`
    const rows = db.prepare(`
      SELECT * FROM user_stories
      WHERE (title LIKE ? OR description LIKE ?)
        AND status != 'archived'
      ORDER BY created_at DESC
    `).all(searchPattern, searchPattern)

    return rows.map(row => this._rowToStory(row))
  }

  /**
   * Find user stories by multiple IDs
   *
   * @param {string[]} ids - Array of story IDs
   * @returns {Object[]} Array of user stories
   */
  findByIds(ids) {
    if (!ids || ids.length === 0) return []

    const db = this.getDb()
    const placeholders = ids.map(() => '?').join(',')
    const rows = db.prepare(`
      SELECT * FROM user_stories
      WHERE id IN (${placeholders})
      ORDER BY created_at DESC
    `).all(...ids)

    return rows.map(row => this._rowToStory(row))
  }

  // ===== UPDATE OPERATIONS =====

  /**
   * Update a user story
   *
   * @param {string} id - Story ID
   * @param {Object} updates - Fields to update
   * @returns {Object|null} Updated user story or null if not found
   */
  update(id, updates) {
    const db = this.getDb()
    const existing = this.findById(id)

    if (!existing) {
      return null
    }

    // Merge updates with existing data
    const updated = { ...existing, ...updates, updatedAt: this.now() }
    const row = this._storyToRow(updated)

    const stmt = db.prepare(`
      UPDATE user_stories SET
        branch_id = ?,
        title = ?,
        description = ?,
        acceptance_criteria = ?,
        status = ?,
        implemented_on = ?,
        source_prompt_id = ?,
        updated_at = ?,
        archived_at = ?
      WHERE id = ?
    `)

    stmt.run(
      row.branch_id,
      row.title,
      row.description,
      row.acceptance_criteria,
      row.status,
      row.implemented_on,
      row.source_prompt_id,
      row.updated_at,
      row.archived_at,
      id
    )

    return this.findById(id)
  }

  /**
   * Update user story status
   *
   * @param {string} id - Story ID
   * @param {string} status - New status
   * @returns {Object|null} Updated user story or null if not found
   */
  updateStatus(id, status) {
    return this.update(id, { status })
  }

  /**
   * Mark a story as implemented on a specific branch
   *
   * @param {string} id - Story ID
   * @param {string} branchName - Branch name where implemented
   * @returns {Object|null} Updated user story or null if not found
   */
  markImplementedOn(id, branchName) {
    const existing = this.findById(id)
    if (!existing) return null

    const implementedOn = existing.implementedOn || []
    if (!implementedOn.includes(branchName)) {
      implementedOn.push(branchName)
    }

    return this.update(id, {
      implementedOn,
      status: StoryStatus.COMPLETED
    })
  }

  /**
   * Update or create a user story (upsert)
   *
   * @param {Object} story - User story data
   * @returns {Object} Updated or created user story
   */
  upsert(story) {
    if (this.exists(story.id)) {
      return this.update(story.id, story)
    }
    return this.create(story)
  }

  /**
   * Bulk update/insert user stories
   *
   * @param {Object[]} stories - Array of user stories
   * @returns {number} Number of stories processed
   */
  bulkUpsert(stories) {
    if (!stories || stories.length === 0) return 0

    return this.transaction(() => {
      for (const story of stories) {
        this.upsert(story)
      }
      return stories.length
    })
  }

  // ===== DELETE OPERATIONS =====

  /**
   * Archive a user story (soft delete)
   *
   * @param {string} id - Story ID
   * @returns {Object|null} Archived story or null if not found
   */
  archive(id) {
    const existing = this.findById(id)
    if (!existing) return null

    // Move to archived_stories table
    const db = this.getDb()

    return this.transaction(() => {
      // Insert into archived_stories
      const row = this._storyToRow({
        ...existing,
        status: StoryStatus.ARCHIVED,
        archivedAt: this.now()
      })

      db.prepare(`
        INSERT OR REPLACE INTO archived_stories (
          id, branch_id, title, description, acceptance_criteria,
          status, implemented_on, source_prompt_id, created_at, updated_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.branch_id,
        row.title,
        row.description,
        row.acceptance_criteria,
        row.status,
        row.implemented_on,
        row.source_prompt_id,
        row.created_at,
        row.updated_at,
        row.archived_at
      )

      // Delete from user_stories
      db.prepare('DELETE FROM user_stories WHERE id = ?').run(id)

      return { ...existing, status: StoryStatus.ARCHIVED, archivedAt: row.archived_at }
    })
  }

  /**
   * Archive multiple user stories
   *
   * @param {string[]} ids - Array of story IDs
   * @returns {number} Number of stories archived
   */
  archiveMany(ids) {
    if (!ids || ids.length === 0) return 0

    return this.transaction(() => {
      let count = 0
      for (const id of ids) {
        if (this.archive(id)) {
          count++
        }
      }
      return count
    })
  }

  /**
   * Permanently delete a user story
   *
   * @param {string} id - Story ID
   * @returns {boolean} True if deleted
   */
  delete(id) {
    return this.deleteById(id)
  }

  // ===== ARCHIVED STORY OPERATIONS =====

  /**
   * Find all archived stories
   *
   * @param {Object} [options] - Query options
   * @param {number} [options.limit] - Maximum number of results
   * @param {number} [options.offset] - Number of results to skip
   * @returns {Object[]} Array of archived stories
   */
  findArchived(options = {}) {
    const db = this.getDb()
    const { limit, offset } = options

    let sql = 'SELECT * FROM archived_stories ORDER BY archived_at DESC'

    if (limit) {
      sql += ` LIMIT ${limit}`
      if (offset) {
        sql += ` OFFSET ${offset}`
      }
    }

    const rows = db.prepare(sql).all()
    return rows.map(row => this._rowToStory(row))
  }

  /**
   * Find an archived story by ID
   *
   * @param {string} id - Story ID
   * @returns {Object|null} Archived story or null
   */
  findArchivedById(id) {
    const db = this.getDb()
    const row = db.prepare('SELECT * FROM archived_stories WHERE id = ?').get(id)
    return this._rowToStory(row)
  }

  /**
   * Restore an archived story to active status
   *
   * @param {string} id - Story ID
   * @param {string} [status='pending'] - Status to restore to
   * @returns {Object|null} Restored story or null if not found
   */
  restore(id, status = StoryStatus.PENDING) {
    const db = this.getDb()
    const archived = this.findArchivedById(id)

    if (!archived) return null

    return this.transaction(() => {
      // Insert back into user_stories
      const row = this._storyToRow({
        ...archived,
        status,
        archivedAt: null,
        updatedAt: this.now()
      })

      db.prepare(`
        INSERT OR REPLACE INTO user_stories (
          id, branch_id, title, description, acceptance_criteria,
          status, implemented_on, source_prompt_id, created_at, updated_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.branch_id,
        row.title,
        row.description,
        row.acceptance_criteria,
        row.status,
        row.implemented_on,
        row.source_prompt_id,
        row.created_at,
        row.updated_at,
        null
      )

      // Delete from archived_stories
      db.prepare('DELETE FROM archived_stories WHERE id = ?').run(id)

      return { ...archived, status, archivedAt: null }
    })
  }

  /**
   * Permanently delete an archived story
   *
   * @param {string} id - Story ID
   * @returns {boolean} True if deleted
   */
  deleteArchived(id) {
    const db = this.getDb()
    const result = db.prepare('DELETE FROM archived_stories WHERE id = ?').run(id)
    return result.changes > 0
  }

  // ===== STATISTICS =====

  /**
   * Get story counts by status
   *
   * @returns {Object} Counts by status
   */
  getStatusCounts() {
    const db = this.getDb()
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM user_stories
      GROUP BY status
    `).all()

    const counts = {}
    for (const row of rows) {
      counts[row.status] = row.count
    }

    // Add archived count
    const archivedCount = db.prepare('SELECT COUNT(*) as count FROM archived_stories').get()
    counts.archived = archivedCount.count

    return counts
  }

  /**
   * Get total story count (excluding archived)
   *
   * @returns {number}
   */
  getTotalCount() {
    return this.count("status != 'archived'")
  }

  /**
   * Get archived story count
   *
   * @returns {number}
   */
  getArchivedCount() {
    const db = this.getDb()
    const result = db.prepare('SELECT COUNT(*) as count FROM archived_stories').get()
    return result.count
  }
}

module.exports = { UserStoryRepository, StoryStatus }
