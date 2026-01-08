/**
 * Sprint Repository
 *
 * Provides CRUD operations and queries for sprints.
 * Manages sprint-to-story relationships via the sprint_stories junction table.
 * Handles both active sprints and archived sprint history.
 *
 * @module database/repositories/sprint-repository
 */

const { BaseRepository } = require('./base-repository')

/**
 * Sprint status values
 * @readonly
 * @enum {string}
 */
const SprintStatus = {
  PLANNING: 'planning',
  PLAN_REVIEW: 'plan-review',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  CLOSED: 'closed'
}

/**
 * Repository for sprint data access
 */
class SprintRepository extends BaseRepository {
  /**
   * Create a sprint repository
   *
   * @param {import('../connection').DatabaseConnection} connection - Database connection
   */
  constructor(connection) {
    super(connection, 'sprints')
  }

  /**
   * Transform a database row to a sprint object
   *
   * @private
   * @param {Object} row - Database row
   * @returns {Object} Sprint object
   */
  _rowToSprint(row) {
    if (!row) return null

    return {
      id: row.id,
      title: row.title || '',
      description: row.description || '',
      status: row.status,
      plan: row.plan || null,
      storyProgress: this.parseJson(row.story_progress, {}),
      promptId: row.prompt_id,
      createdAt: row.created_at,
      planApprovedAt: row.plan_approved_at,
      completedAt: row.completed_at,
      closedAt: row.closed_at
    }
  }

  /**
   * Transform a sprint object to database row values
   *
   * @private
   * @param {Object} sprint - Sprint object
   * @returns {Object} Values for database insert/update
   */
  _sprintToRow(sprint) {
    return {
      id: sprint.id,
      title: sprint.title || '',
      description: sprint.description || '',
      status: sprint.status || SprintStatus.PLANNING,
      plan: sprint.plan || null,
      story_progress: this.toJson(sprint.storyProgress || {}),
      prompt_id: sprint.promptId || null,
      created_at: sprint.createdAt || this.now(),
      plan_approved_at: sprint.planApprovedAt || null,
      completed_at: sprint.completedAt || null,
      closed_at: sprint.closedAt || null
    }
  }

  /**
   * Transform a sprint history row to object
   *
   * @private
   * @param {Object} row - Database row from sprint_history
   * @returns {Object} Archived sprint object
   */
  _historyRowToSprint(row) {
    if (!row) return null

    // Use stored title, or generate from closed date as fallback
    let title = row.title
    if (!title && row.closed_at) {
      try {
        const date = new Date(row.closed_at)
        if (!isNaN(date.getTime())) {
          title = `Sprint ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        }
      } catch (e) {
        // Fall through to null title
      }
    }

    // Parse inline stories if available (from migration 003)
    const inlineStories = this.parseJson(row.stories, null)

    return {
      id: row.id,
      title,
      description: row.description || '',
      status: row.status,
      plan: row.plan || null,
      storyProgress: this.parseJson(row.story_progress, {}),
      storyIds: this.parseJson(row.story_ids, []),
      stories: inlineStories, // May be null for old sprints
      promptId: row.prompt_id,
      createdAt: row.created_at,
      planApprovedAt: row.plan_approved_at,
      completedAt: row.completed_at,
      closedAt: row.closed_at
    }
  }

  // ===== CREATE OPERATIONS =====

  /**
   * Create a new sprint
   *
   * Uses immediateTransaction to acquire write lock immediately,
   * ensuring atomic creation of sprint and story relationships.
   *
   * @param {Object} sprint - Sprint data
   * @param {string[]} [storyIds] - IDs of stories to include in sprint
   * @returns {Object} Created sprint with stories
   * @throws {Error} If an active sprint already exists or transaction fails
   */
  create(sprint, storyIds = []) {
    const db = this.getDb()

    // Check for existing active sprint before attempting creation
    // This provides a cleaner error message than the database trigger
    if (this.hasActiveSprint()) {
      const activeSprint = this.findActive()
      const title = activeSprint?.title || `Sprint ${activeSprint?.id?.substring(0, 6)}`
      throw new Error(`Cannot create sprint: "${title}" is already active. Close it before creating a new one.`)
    }

    return this.immediateTransaction(() => {
      const row = this._sprintToRow(sprint)

      const stmt = db.prepare(`
        INSERT INTO sprints (
          id, title, description, status, plan, story_progress, prompt_id,
          created_at, plan_approved_at, completed_at, closed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        row.id,
        row.title,
        row.description,
        row.status,
        row.plan,
        row.story_progress,
        row.prompt_id,
        row.created_at,
        row.plan_approved_at,
        row.completed_at,
        row.closed_at
      )

      // Add story relationships
      if (storyIds.length > 0) {
        this._addStoriesToSprint(row.id, storyIds)
      }

      return this.findById(row.id)
    })
  }

  // ===== READ OPERATIONS =====

  /**
   * Find a sprint by ID (with stories)
   *
   * Automatically filters out orphaned story references from both
   * the stories array and the storyProgress object.
   *
   * @param {string} id - Sprint ID
   * @returns {Object|null} Sprint with stories or null
   */
  findById(id) {
    const db = this.getDb()
    const sql = 'SELECT * FROM sprints WHERE id = ?'
    const params = [id]

    const row = this.traceQuery('SELECT_SPRINT', sql, params, () => {
      return db.prepare(sql).get(id)
    })

    if (!row) return null

    const sprint = this._rowToSprint(row)
    sprint.stories = this._getSprintStories(id)

    // Filter orphaned entries from storyProgress
    // Only keep progress for stories that still exist
    const validStoryIds = new Set(sprint.stories.map(s => s.id))
    const filteredProgress = {}
    for (const [storyId, progress] of Object.entries(sprint.storyProgress)) {
      if (validStoryIds.has(storyId)) {
        filteredProgress[storyId] = progress
      }
    }
    sprint.storyProgress = filteredProgress

    return sprint
  }

  /**
   * Find the active sprint (non-closed sprint)
   *
   * Automatically filters out orphaned story references from both
   * the stories array and the storyProgress object.
   *
   * @returns {Object|null} Active sprint or null
   */
  findActive() {
    const db = this.getDb()
    const sql = `
      SELECT * FROM sprints
      WHERE closed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `

    const row = this.traceQuery('SELECT_ACTIVE_SPRINT', sql, [], () => {
      return db.prepare(sql).get()
    })

    if (!row) return null

    const sprint = this._rowToSprint(row)
    sprint.stories = this._getSprintStories(row.id)

    // Filter orphaned entries from storyProgress
    const validStoryIds = new Set(sprint.stories.map(s => s.id))
    const filteredProgress = {}
    for (const [storyId, progress] of Object.entries(sprint.storyProgress)) {
      if (validStoryIds.has(storyId)) {
        filteredProgress[storyId] = progress
      }
    }
    sprint.storyProgress = filteredProgress

    return sprint
  }

  /**
   * Check if an active sprint exists
   *
   * @returns {boolean} True if an active sprint exists
   */
  hasActiveSprint() {
    const db = this.getDb()
    const sql = 'SELECT 1 FROM sprints WHERE closed_at IS NULL LIMIT 1'

    const row = this.traceQuery('CHECK_ACTIVE_SPRINT', sql, [], () => {
      return db.prepare(sql).get()
    })

    return !!row
  }

  /**
   * Find all active sprints (not closed)
   *
   * @returns {Object[]} Array of active sprints
   */
  findAllActive() {
    const db = this.getDb()
    const rows = db.prepare(`
      SELECT * FROM sprints
      WHERE closed_at IS NULL
      ORDER BY created_at DESC
    `).all()

    return rows.map(row => {
      const sprint = this._rowToSprint(row)
      sprint.stories = this._getSprintStories(row.id)
      return sprint
    })
  }

  /**
   * Find sprints by status
   *
   * @param {string} status - Sprint status
   * @returns {Object[]} Array of sprints
   */
  findByStatus(status) {
    const db = this.getDb()
    const rows = db.prepare(`
      SELECT * FROM sprints
      WHERE status = ?
      ORDER BY created_at DESC
    `).all(status)

    return rows.map(row => {
      const sprint = this._rowToSprint(row)
      sprint.stories = this._getSprintStories(row.id)
      return sprint
    })
  }

  /**
   * Get stories for a sprint
   *
   * Uses INNER JOIN which naturally filters out orphaned story references
   * (stories that were deleted but still have junction table entries).
   *
   * @private
   * @param {string} sprintId - Sprint ID
   * @returns {Object[]} Array of story objects
   */
  _getSprintStories(sprintId) {
    const db = this.getDb()
    // INNER JOIN filters out orphans: only returns stories that exist in user_stories
    const rows = db.prepare(`
      SELECT us.*, ss.added_at as sprint_added_at
      FROM user_stories us
      INNER JOIN sprint_stories ss ON us.id = ss.story_id
      WHERE ss.sprint_id = ?
      ORDER BY ss.added_at ASC
    `).all(sprintId)

    return rows.map(row => ({
      id: row.id,
      branchId: row.branch_id,
      title: row.title,
      description: row.description || '',
      acceptanceCriteria: this.parseJson(row.acceptance_criteria, []),
      inspectionAssertions: this.parseJson(row.inspection_assertions, []),
      assertionResults: this.parseJson(row.assertion_results, null),
      status: row.status,
      implementedOn: this.parseJson(row.implemented_on, []),
      sourcePromptId: row.source_prompt_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sprintAddedAt: row.sprint_added_at
    }))
  }

  /**
   * Get story IDs for a sprint
   *
   * @param {string} sprintId - Sprint ID
   * @returns {string[]} Array of story IDs
   */
  getStoryIds(sprintId) {
    const db = this.getDb()
    const rows = db.prepare(`
      SELECT story_id FROM sprint_stories
      WHERE sprint_id = ?
      ORDER BY added_at ASC
    `).all(sprintId)

    return rows.map(row => row.story_id)
  }

  // ===== UPDATE OPERATIONS =====

  /**
   * Update a sprint
   *
   * Uses immediateTransaction for atomic updates.
   *
   * @param {string} id - Sprint ID
   * @param {Object} updates - Fields to update
   * @returns {Object|null} Updated sprint or null if not found
   * @throws {Error} If transaction fails (automatically rolled back)
   */
  update(id, updates) {
    const db = this.getDb()
    const existing = this.findById(id)

    if (!existing) return null

    return this.immediateTransaction(() => {
      // Merge updates with existing data
      const updated = { ...existing, ...updates }
      const row = this._sprintToRow(updated)

      const stmt = db.prepare(`
        UPDATE sprints SET
          title = ?,
          description = ?,
          status = ?,
          plan = ?,
          story_progress = ?,
          prompt_id = ?,
          plan_approved_at = ?,
          completed_at = ?,
          closed_at = ?
        WHERE id = ?
      `)

      stmt.run(
        row.title,
        row.description,
        row.status,
        row.plan,
        row.story_progress,
        row.prompt_id,
        row.plan_approved_at,
        row.completed_at,
        row.closed_at,
        id
      )

      return this.findById(id)
    })
  }

  /**
   * Update sprint status
   *
   * @param {string} id - Sprint ID
   * @param {string} status - New status
   * @returns {Object|null} Updated sprint or null if not found
   */
  updateStatus(id, status) {
    const updates = { status }

    // Set timestamp based on status
    if (status === SprintStatus.COMPLETED) {
      updates.completedAt = this.now()
    } else if (status === SprintStatus.CLOSED) {
      updates.closedAt = this.now()
    } else if (status === SprintStatus.IN_PROGRESS && !this.findById(id)?.planApprovedAt) {
      updates.planApprovedAt = this.now()
    }

    return this.update(id, updates)
  }

  /**
   * Update sprint plan
   *
   * @param {string} id - Sprint ID
   * @param {string} plan - New plan content
   * @returns {Object|null} Updated sprint or null if not found
   */
  updatePlan(id, plan) {
    return this.update(id, { plan })
  }

  /**
   * Update story progress for a sprint
   *
   * @param {string} id - Sprint ID
   * @param {string} storyId - Story ID
   * @param {string} branchType - Branch type (ui, backend, fullstack)
   * @param {Object} progressUpdate - Progress update { status, startedAt?, completedAt? }
   * @returns {Object|null} Updated sprint or null if not found
   */
  updateStoryProgress(id, storyId, branchType, progressUpdate) {
    const existing = this.findById(id)
    if (!existing) return null

    const storyProgress = existing.storyProgress || {}

    // Initialize progress for this story if not exists
    if (!storyProgress[storyId]) {
      storyProgress[storyId] = { branches: {} }
    }

    // Update the branch progress
    storyProgress[storyId].branches[branchType] = {
      ...storyProgress[storyId].branches[branchType],
      ...progressUpdate
    }

    // Check if all branches for this story are completed
    const allBranchesCompleted = Object.values(storyProgress[storyId].branches).every(
      b => b.status === 'completed'
    )

    if (allBranchesCompleted && Object.keys(storyProgress[storyId].branches).length > 0) {
      storyProgress[storyId].status = 'completed'
      storyProgress[storyId].completedAt = Date.now()
    }

    const updates = { storyProgress }

    // Check if all stories in the sprint are completed
    const allStoriesCompleted = existing.stories.every(story => {
      const progress = storyProgress[story.id]
      return progress?.status === 'completed'
    })

    if (allStoriesCompleted && existing.stories.length > 0) {
      updates.status = SprintStatus.COMPLETED
      updates.completedAt = this.now()
    }

    return this.update(id, updates)
  }

  /**
   * Approve sprint plan
   *
   * @param {string} id - Sprint ID
   * @returns {Object|null} Updated sprint or null if not found
   */
  approvePlan(id) {
    return this.update(id, {
      status: SprintStatus.IN_PROGRESS,
      planApprovedAt: this.now()
    })
  }

  /**
   * Atomically sync story status between sprint and backlog
   *
   * Updates both the sprint's story progress AND the user_stories table
   * in a single immediate transaction. This ensures status is always
   * consistent between sprint view and backlog view.
   *
   * @param {string} sprintId - Sprint ID
   * @param {string} storyId - Story ID
   * @param {string} status - New status ('completed' or 'in-progress')
   * @param {Object} [userStoryRepo] - UserStoryRepository instance for backlog update
   * @returns {Object} Result with updated sprint and story
   * @throws {Error} If transaction fails (automatically rolled back)
   */
  syncStoryStatus(sprintId, storyId, status, userStoryRepo) {
    console.log(`[SQL-TRACE] SYNC_STORY_STATUS: sprintId=${sprintId}, storyId=${storyId}, status=${status}`)

    const db = this.getDb()
    const sprint = this.findById(sprintId)

    if (!sprint) {
      console.log(`[SQL-TRACE] SYNC_STORY_STATUS ABORTED: sprint ${sprintId} not found`)
      throw new Error(`Sprint ${sprintId} not found`)
    }

    console.log(`[SQL-TRACE] SYNC_STORY_STATUS: sprint found, stories count=${sprint.stories?.length || 0}`)

    const timestamp = this.now()

    return this.immediateTransaction(() => {
      // 1. Update sprint story progress
      const storyProgress = sprint.storyProgress || {}

      if (!storyProgress[storyId]) {
        storyProgress[storyId] = { branches: {} }
      }

      storyProgress[storyId].status = status
      storyProgress[storyId].completedAt = status === 'completed' ? timestamp : null

      // Update the sprint's storyProgress (do NOT modify closed_at here)
      const updateSprintSql = 'UPDATE sprints SET story_progress = ? WHERE id = ?'
      const updateSprintParams = [this.toJson(storyProgress), sprintId]
      this.traceQuery('UPDATE_SPRINT_PROGRESS', updateSprintSql, updateSprintParams, () => {
        db.prepare(updateSprintSql).run(...updateSprintParams)
      })

      // 2. Update user story status in backlog
      // Use 'completed' status to match UI convention (not 'implemented')
      const storyStatus = status === 'completed' ? 'completed' : 'in-progress'
      const updateStorySql = 'UPDATE user_stories SET status = ?, updated_at = ? WHERE id = ?'
      const updateStoryParams = [storyStatus, timestamp, storyId]
      this.traceQuery('UPDATE_USER_STORY_STATUS', updateStorySql, updateStoryParams, () => {
        db.prepare(updateStorySql).run(...updateStoryParams)
      })

      // 3. Check if all stories in sprint are now completed
      const allStoriesCompleted = sprint.stories.every(story => {
        if (story.id === storyId) {
          return status === 'completed'
        }
        return storyProgress[story.id]?.status === 'completed'
      })

      console.log(`[SQL-TRACE] SYNC_STORY_STATUS: allStoriesCompleted=${allStoriesCompleted}`)

      // Update sprint status if needed
      if (allStoriesCompleted && sprint.stories.length > 0) {
        const completeSql = 'UPDATE sprints SET status = ?, completed_at = ? WHERE id = ?'
        const completeParams = [SprintStatus.COMPLETED, timestamp, sprintId]
        this.traceQuery('UPDATE_SPRINT_COMPLETED', completeSql, completeParams, () => {
          db.prepare(completeSql).run(...completeParams)
        })
      } else if (sprint.status === SprintStatus.COMPLETED) {
        // Sprint was completed but now has incomplete story
        const inProgressSql = 'UPDATE sprints SET status = ?, completed_at = NULL WHERE id = ?'
        const inProgressParams = [SprintStatus.IN_PROGRESS, sprintId]
        this.traceQuery('UPDATE_SPRINT_IN_PROGRESS', inProgressSql, inProgressParams, () => {
          db.prepare(inProgressSql).run(...inProgressParams)
        })
      }

      // Return the updated data
      const updatedSprint = this.findById(sprintId)
      const updatedStory = userStoryRepo ? userStoryRepo.findById(storyId) : null

      console.log(`[SQL-TRACE] SYNC_STORY_STATUS COMPLETE: storyStatus=${updatedStory?.status}`)

      return {
        sprint: updatedSprint,
        story: updatedStory,
        allStoriesCompleted,
        timestamp
      }
    })
  }

  // ===== SPRINT-STORY RELATIONSHIP OPERATIONS =====

  /**
   * Update status of multiple stories atomically
   *
   * @private
   * @param {string[]} storyIds - Story IDs to update
   * @param {string} status - New status ('pending', 'in-progress', 'completed')
   */
  _updateStoryStatuses(storyIds, status) {
    if (!storyIds || storyIds.length === 0) return

    const db = this.getDb()
    const timestamp = this.now()
    const stmt = db.prepare(`
      UPDATE user_stories SET status = ?, updated_at = ? WHERE id = ?
    `)

    for (const storyId of storyIds) {
      stmt.run(status, timestamp, storyId)
    }

    console.log(`[SQL-TRACE] UPDATE_STORY_STATUSES: ${storyIds.length} stories -> ${status}`)
  }

  /**
   * Add stories to a sprint
   *
   * @private
   * @param {string} sprintId - Sprint ID
   * @param {string[]} storyIds - Story IDs to add
   * @param {boolean} [updateStatus=true] - Whether to update story status to 'in-progress'
   */
  _addStoriesToSprint(sprintId, storyIds, updateStatus = true) {
    const db = this.getDb()
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO sprint_stories (sprint_id, story_id, added_at)
      VALUES (?, ?, ?)
    `)

    const now = this.now()
    for (const storyId of storyIds) {
      stmt.run(sprintId, storyId, now)
    }

    // Update story statuses to 'in-progress' when added to sprint
    if (updateStatus && storyIds.length > 0) {
      this._updateStoryStatuses(storyIds, 'in-progress')
    }
  }

  /**
   * Add a story to a sprint
   *
   * @param {string} sprintId - Sprint ID
   * @param {string} storyId - Story ID to add
   * @returns {boolean} True if added
   */
  addStory(sprintId, storyId) {
    const db = this.getDb()

    return this.immediateTransaction(() => {
      try {
        db.prepare(`
          INSERT INTO sprint_stories (sprint_id, story_id, added_at)
          VALUES (?, ?, ?)
        `).run(sprintId, storyId, this.now())

        // Update story status to 'in-progress' when added to sprint
        this._updateStoryStatuses([storyId], 'in-progress')

        return true
      } catch (error) {
        // Already exists or constraint violation
        return false
      }
    })
  }

  /**
   * Remove a story from a sprint
   *
   * @param {string} sprintId - Sprint ID
   * @param {string} storyId - Story ID to remove
   * @param {boolean} [resetStatus=true] - Whether to reset story status to 'pending'
   * @returns {boolean} True if removed
   */
  removeStory(sprintId, storyId, resetStatus = true) {
    const db = this.getDb()

    return this.immediateTransaction(() => {
      const result = db.prepare(`
        DELETE FROM sprint_stories
        WHERE sprint_id = ? AND story_id = ?
      `).run(sprintId, storyId)

      // Reset story status to 'pending' when removed from sprint
      if (result.changes > 0 && resetStatus) {
        this._updateStoryStatuses([storyId], 'pending')
      }

      return result.changes > 0
    })
  }

  /**
   * Set the stories for a sprint (replaces existing)
   *
   * Uses immediateTransaction for atomic story replacement.
   *
   * @param {string} sprintId - Sprint ID
   * @param {string[]} storyIds - Story IDs to set
   * @returns {Object|null} Updated sprint or null if not found
   * @throws {Error} If transaction fails (automatically rolled back)
   */
  setStories(sprintId, storyIds) {
    const db = this.getDb()

    return this.immediateTransaction(() => {
      // Remove all existing relationships
      db.prepare('DELETE FROM sprint_stories WHERE sprint_id = ?').run(sprintId)

      // Add new relationships
      if (storyIds.length > 0) {
        this._addStoriesToSprint(sprintId, storyIds)
      }

      return this.findById(sprintId)
    })
  }

  // ===== ARCHIVE OPERATIONS =====

  /**
   * Archive a sprint (move to sprint_history)
   *
   * Uses immediateTransaction to acquire write lock immediately,
   * ensuring atomic move of sprint to history with no partial state.
   * Operations: insert to history, delete relationships, delete sprint.
   *
   * @param {string} id - Sprint ID
   * @param {Object[]|null} stories - Optional inline story data to store
   * @param {Object} overrides - Optional field overrides (title, description, closedAt)
   * @returns {Object|null} Archived sprint or null if not found
   * @throws {Error} If transaction fails (automatically rolled back)
   */
  archive(id, stories = null, overrides = {}) {
    console.log(`[SQL-TRACE] SPRINT_ARCHIVE: id=${id}, storiesProvided=${!!stories}, overrides=${JSON.stringify(overrides)}`)

    const db = this.getDb()
    const existing = this.findById(id)

    if (!existing) {
      console.log(`[SQL-TRACE] SPRINT_ARCHIVE ABORTED: sprint ${id} not found`)
      return null
    }

    console.log(`[SQL-TRACE] SPRINT_ARCHIVE: sprint found, status=${existing.status}`)

    return this.immediateTransaction(() => {
      const storyIds = this.getStoryIds(id)
      const closedAt = overrides.closedAt || existing.closedAt || this.now()

      // Use overrides for title/description if provided (from modal input)
      const title = overrides.title || existing.title
      const description = overrides.description !== undefined ? overrides.description : (existing.description || '')

      console.log(`[SQL-TRACE] SPRINT_ARCHIVE: storyIds=${JSON.stringify(storyIds)}, title="${title}"`)

      // Insert into sprint_history (with optional inline stories from migration 003)
      const insertSql = `
        INSERT INTO sprint_history (
          id, title, description, status, plan, story_progress, story_ids, stories, prompt_id,
          created_at, plan_approved_at, completed_at, closed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      const insertParams = [
        existing.id,
        title,
        description,
        SprintStatus.CLOSED,
        existing.plan,
        this.toJson(existing.storyProgress || {}),
        this.toJson(storyIds),
        this.toJson(stories || []),
        existing.promptId,
        existing.createdAt,
        existing.planApprovedAt,
        existing.completedAt,
        closedAt
      ]
      this.traceQuery('INSERT_SPRINT_HISTORY', insertSql, insertParams, () => {
        db.prepare(insertSql).run(...insertParams)
      })

      // Update story statuses based on their completion state
      // Completed stories stay 'completed', incomplete stories return to 'pending'
      const storyProgress = existing.storyProgress || {}
      const completedStoryIds = storyIds.filter(sid => storyProgress[sid]?.status === 'completed')
      const incompleteStoryIds = storyIds.filter(sid => storyProgress[sid]?.status !== 'completed')

      // Keep completed stories as 'completed'
      if (completedStoryIds.length > 0) {
        this._updateStoryStatuses(completedStoryIds, 'completed')
      }

      // Return incomplete stories to 'pending' so they can be added to future sprints
      if (incompleteStoryIds.length > 0) {
        this._updateStoryStatuses(incompleteStoryIds, 'pending')
      }

      console.log(`[SQL-TRACE] SPRINT_ARCHIVE: ${completedStoryIds.length} completed, ${incompleteStoryIds.length} returned to pending`)

      // Remove sprint-story relationships
      const deleteRelSql = 'DELETE FROM sprint_stories WHERE sprint_id = ?'
      this.traceQuery('DELETE_SPRINT_STORIES', deleteRelSql, [id], () => {
        db.prepare(deleteRelSql).run(id)
      })

      // Delete from sprints
      const deleteSprintSql = 'DELETE FROM sprints WHERE id = ?'
      this.traceQuery('DELETE_SPRINT', deleteSprintSql, [id], () => {
        db.prepare(deleteSprintSql).run(id)
      })

      console.log(`[SQL-TRACE] SPRINT_ARCHIVE COMPLETE: sprint ${id} moved to history`)

      return {
        ...existing,
        title,
        description,
        status: SprintStatus.CLOSED,
        storyIds,
        stories: stories || [],
        closedAt
      }
    })
  }

  /**
   * Delete a sprint without archiving to history
   * Used for zero-progress sprints that user wants to discard
   *
   * This method:
   * 1. Resets ALL sprint stories to 'pending' status
   * 2. Removes sprint_stories relationships
   * 3. Deletes the sprint from sprints table
   * 4. Does NOT add to sprint_history
   *
   * @param {string} id - Sprint ID to delete
   * @returns {boolean} True if deletion succeeded, false if sprint not found
   * @throws {Error} If transaction fails (automatically rolled back)
   */
  delete(id) {
    console.log(`[SQL-TRACE] SPRINT_DELETE: id=${id}`)

    const db = this.getDb()
    const existing = this.findById(id)

    if (!existing) {
      console.log(`[SQL-TRACE] SPRINT_DELETE ABORTED: sprint ${id} not found`)
      return false
    }

    console.log(`[SQL-TRACE] SPRINT_DELETE: sprint found, status=${existing.status}`)

    return this.immediateTransaction(() => {
      const storyIds = this.getStoryIds(id)

      console.log(`[SQL-TRACE] SPRINT_DELETE: resetting ${storyIds.length} stories to pending`)

      // Reset ALL stories to 'pending' status (not just incomplete ones)
      if (storyIds.length > 0) {
        this._updateStoryStatuses(storyIds, 'pending')
      }

      // Remove sprint-story relationships
      const deleteRelSql = 'DELETE FROM sprint_stories WHERE sprint_id = ?'
      this.traceQuery('DELETE_SPRINT_STORIES', deleteRelSql, [id], () => {
        db.prepare(deleteRelSql).run(id)
      })

      // Delete the sprint (NOT archived to sprint_history)
      const deleteSprintSql = 'DELETE FROM sprints WHERE id = ?'
      const result = this.traceQuery('DELETE_SPRINT', deleteSprintSql, [id], () => {
        return db.prepare(deleteSprintSql).run(id)
      })

      console.log(`[SQL-TRACE] SPRINT_DELETE COMPLETE: sprint ${id} deleted, ${storyIds.length} stories returned to pending`)

      return result.changes > 0
    })
  }

  /**
   * Find archived sprints
   *
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=50] - Maximum number of results
   * @param {number} [options.offset] - Number of results to skip
   * @returns {Object[]} Array of archived sprints
   */
  findArchived(options = {}) {
    const db = this.getDb()
    const { limit = 50, offset } = options

    let sql = 'SELECT * FROM sprint_history ORDER BY closed_at DESC'

    if (limit) {
      sql += ` LIMIT ${limit}`
      if (offset) {
        sql += ` OFFSET ${offset}`
      }
    }

    const rows = db.prepare(sql).all()
    return rows.map(row => this._historyRowToSprint(row))
  }

  /**
   * Find an archived sprint by ID
   *
   * @param {string} id - Sprint ID
   * @returns {Object|null} Archived sprint or null
   */
  findArchivedById(id) {
    const db = this.getDb()
    const row = db.prepare('SELECT * FROM sprint_history WHERE id = ?').get(id)
    return this._historyRowToSprint(row)
  }

  /**
   * Find an archived sprint with resolved story data
   *
   * @param {string} id - Sprint ID
   * @param {Object} userStoryRepository - UserStoryRepository instance for resolving stories
   * @returns {Object|null} Archived sprint with stories or null
   */
  findArchivedWithStories(id, userStoryRepository) {
    const sprint = this.findArchivedById(id)
    if (!sprint) return null

    // If we have inline stories (from migration 003), use them directly
    if (sprint.stories && sprint.stories.length > 0) {
      return sprint
    }

    // Otherwise, resolve story references from user_stories/archived_stories tables
    const resolvedStories = sprint.storyIds.map(storyId => {
      const activeStory = userStoryRepository.findById(storyId)
      const archivedStory = activeStory ? null : userStoryRepository.findArchivedById(storyId)
      const story = activeStory || archivedStory

      return story || { id: storyId, title: '[Deleted Story]', status: 'unknown' }
    })

    return {
      ...sprint,
      stories: resolvedStories
    }
  }

  // ===== DELETE OPERATIONS =====

  /**
   * Delete a sprint (and its story relationships)
   *
   * Uses immediateTransaction for atomic deletion.
   *
   * @param {string} id - Sprint ID
   * @returns {boolean} True if deleted
   * @throws {Error} If transaction fails (automatically rolled back)
   */
  delete(id) {
    const db = this.getDb()

    return this.immediateTransaction(() => {
      // Foreign key cascade will handle sprint_stories
      const result = db.prepare('DELETE FROM sprints WHERE id = ?').run(id)
      return result.changes > 0
    })
  }

  /**
   * Delete an archived sprint
   *
   * @param {string} id - Sprint ID
   * @returns {boolean} True if deleted
   */
  deleteArchived(id) {
    const db = this.getDb()
    const result = db.prepare('DELETE FROM sprint_history WHERE id = ?').run(id)
    return result.changes > 0
  }

  /**
   * Insert a sprint directly into history (for migration)
   *
   * Accepts both camelCase (preferred) and snake_case (legacy) property names
   * for backwards compatibility with existing migration code.
   *
   * @param {Object} sprint - Sprint data to insert
   * @returns {Object} Inserted sprint
   */
  insertToHistory(sprint) {
    const db = this.getDb()

    // Check if already exists
    const existing = db.prepare('SELECT id FROM sprint_history WHERE id = ?').get(sprint.id)
    if (existing) {
      console.log(`[SPRINT-REPO] Sprint ${sprint.id} already in history, skipping`)
      return this.findArchivedById(sprint.id)
    }

    // Accept both camelCase (preferred) and snake_case (legacy) for backwards compatibility
    const storyProgress = sprint.storyProgress || sprint.story_progress || {}
    const storyIds = sprint.storyIds || sprint.story_ids || []
    const promptId = sprint.promptId || sprint.prompt_id || null
    const createdAt = sprint.createdAt || sprint.created_at || this.now()
    const planApprovedAt = sprint.planApprovedAt || sprint.plan_approved_at || null
    const completedAt = sprint.completedAt || sprint.completed_at || null
    const closedAt = sprint.closedAt || sprint.closed_at || this.now()

    db.prepare(`
      INSERT INTO sprint_history (
        id, title, description, status, plan, story_progress, story_ids, prompt_id,
        created_at, plan_approved_at, completed_at, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sprint.id,
      sprint.title || '',
      sprint.description || '',
      sprint.status || 'archived',
      sprint.plan || null,
      this.toJson(storyProgress),
      this.toJson(storyIds),
      promptId,
      createdAt,
      planApprovedAt,
      completedAt,
      closedAt
    )

    return this.findArchivedById(sprint.id)
  }

  // ===== STATISTICS =====

  /**
   * Get sprint progress summary
   *
   * @param {string} id - Sprint ID
   * @returns {Object|null} Progress summary or null if not found
   */
  getProgress(id) {
    const sprint = this.findById(id)
    if (!sprint) return null

    const storyProgress = sprint.storyProgress || {}

    let totalBranches = 0
    let completedBranches = 0
    let inProgressBranches = 0
    let completedStories = 0

    sprint.stories.forEach(story => {
      const progress = storyProgress[story.id]
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

    return {
      totalStories: sprint.stories.length,
      completedStories,
      storyPercentage: sprint.stories.length > 0
        ? Math.round((completedStories / sprint.stories.length) * 100)
        : 0,
      totalBranches,
      completedBranches,
      inProgressBranches,
      branchPercentage: totalBranches > 0
        ? Math.round((completedBranches / totalBranches) * 100)
        : 0,
      status: sprint.status,
      isComplete: sprint.status === SprintStatus.COMPLETED
    }
  }

  /**
   * Get sprint counts by status
   *
   * @returns {Object} Counts by status
   */
  getStatusCounts() {
    const db = this.getDb()
    const rows = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM sprints
      GROUP BY status
    `).all()

    const counts = {}
    for (const row of rows) {
      counts[row.status] = row.count
    }

    // Add archived count
    const archivedCount = db.prepare('SELECT COUNT(*) as count FROM sprint_history').get()
    counts.archived = archivedCount.count

    return counts
  }

  /**
   * Get total active sprint count
   *
   * @returns {number}
   */
  getActiveCount() {
    const db = this.getDb()
    const result = db.prepare('SELECT COUNT(*) as count FROM sprints WHERE closed_at IS NULL').get()
    return result.count
  }

  /**
   * Get archived sprint count
   *
   * @returns {number}
   */
  getArchivedCount() {
    const db = this.getDb()
    const result = db.prepare('SELECT COUNT(*) as count FROM sprint_history').get()
    return result.count
  }

  /**
   * Check if a story is in any active sprint
   *
   * @param {string} storyId - Story ID
   * @returns {Object|null} Sprint containing the story or null
   */
  findSprintContainingStory(storyId) {
    const db = this.getDb()
    const row = db.prepare(`
      SELECT s.* FROM sprints s
      INNER JOIN sprint_stories ss ON s.id = ss.sprint_id
      WHERE ss.story_id = ? AND s.closed_at IS NULL
      LIMIT 1
    `).get(storyId)

    if (!row) return null

    const sprint = this._rowToSprint(row)
    sprint.stories = this._getSprintStories(row.id)
    return sprint
  }
}

module.exports = { SprintRepository, SprintStatus }
