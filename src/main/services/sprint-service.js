/**
 * Sprint Service
 *
 * Provides a consistent service layer for all sprint operations with:
 * - Proper transaction handling for atomicity
 * - Standardized error handling and context
 * - Cache invalidation management
 * - Event emission for UI updates
 *
 * @module services/sprint-service
 */

/**
 * Custom error for when an active sprint already exists
 */
class ActiveSprintExistsError extends Error {
  constructor(activeSprint) {
    const title = activeSprint?.title || `Sprint ${activeSprint?.id?.substring(0, 6)}`
    super(`Cannot create sprint: "${title}" is already active. Close it before creating a new one.`)
    this.name = 'ActiveSprintExistsError'
    this.activeSprint = activeSprint
  }
}

/**
 * Custom error for invalid story references
 */
class InvalidStoryIdsError extends Error {
  constructor(invalidIds) {
    super(`Invalid story IDs: ${invalidIds.join(', ')}`)
    this.name = 'InvalidStoryIdsError'
    this.invalidIds = invalidIds
  }
}

/**
 * Custom error for sprint not found
 */
class SprintNotFoundError extends Error {
  constructor(sprintId) {
    super(`Sprint ${sprintId} not found`)
    this.name = 'SprintNotFoundError'
    this.sprintId = sprintId
  }
}

/**
 * Service layer for sprint operations with consistent transaction handling
 */
class SprintService {
  /**
   * Create a new SprintService
   *
   * @param {Object} options - Service dependencies
   * @param {Object} options.sprintRepo - Sprint repository instance
   * @param {Object} options.userStoryRepo - User story repository instance
   * @param {Function} [options.onSprintCreated] - Callback when sprint is created
   * @param {Function} [options.onSprintArchived] - Callback when sprint is archived
   * @param {Function} [options.onStoryStatusChanged] - Callback when story status changes
   */
  constructor({ sprintRepo, userStoryRepo, onSprintCreated, onSprintArchived, onStoryStatusChanged }) {
    this.sprintRepo = sprintRepo
    this.userStoryRepo = userStoryRepo
    this.onSprintCreated = onSprintCreated || (() => {})
    this.onSprintArchived = onSprintArchived || (() => {})
    this.onStoryStatusChanged = onStoryStatusChanged || (() => {})
  }

  /**
   * Generate a unique ID for a sprint
   * @private
   */
  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
  }

  /**
   * Get current ISO timestamp
   * @private
   */
  _now() {
    return new Date().toISOString()
  }

  /**
   * Validate that all story IDs exist
   *
   * @private
   * @param {string[]} storyIds - Story IDs to validate
   * @throws {InvalidStoryIdsError} If any story IDs don't exist
   */
  _validateStoryIds(storyIds) {
    if (!storyIds || storyIds.length === 0) return

    const stories = this.userStoryRepo.findByIds(storyIds)
    const foundIds = new Set(stories.map(s => s.id))
    const invalidIds = storyIds.filter(id => !foundIds.has(id))

    if (invalidIds.length > 0) {
      throw new InvalidStoryIdsError(invalidIds)
    }
  }

  /**
   * Check if an active sprint exists
   *
   * @returns {{ hasActive: boolean, activeSprint: Object|null }}
   */
  checkActiveSprint() {
    const hasActive = this.sprintRepo.hasActiveSprint()
    const activeSprint = hasActive ? this.sprintRepo.findActive() : null
    return { hasActive, activeSprint }
  }

  /**
   * Create a new sprint with stories
   *
   * This operation is atomic - all database operations occur in a single transaction.
   * If any step fails, the entire operation is rolled back.
   *
   * @param {Object} sprintData - Sprint data
   * @param {string} sprintData.title - Sprint title
   * @param {string} [sprintData.description] - Sprint description
   * @param {Object} [sprintData.storyProgress] - Initial story progress
   * @param {string[]} storyIds - IDs of stories to include
   * @returns {Object} Created sprint with stories
   * @throws {ActiveSprintExistsError} If an active sprint already exists
   * @throws {InvalidStoryIdsError} If any story IDs don't exist
   */
  createSprint(sprintData, storyIds = []) {
    // Pre-validation (fail fast before transaction)
    const { hasActive, activeSprint } = this.checkActiveSprint()
    if (hasActive) {
      throw new ActiveSprintExistsError(activeSprint)
    }

    this._validateStoryIds(storyIds)

    // Build sprint object
    const sprint = {
      id: sprintData.id || this._generateId(),
      title: sprintData.title || '',
      description: sprintData.description || '',
      status: 'created',
      storyProgress: sprintData.storyProgress || {},
      promptId: sprintData.promptId || null,
      plan: sprintData.plan || null,
      createdAt: sprintData.createdAt || this._now()
    }

    // Execute atomic creation
    // SprintRepository.create() uses immediateTransaction internally
    // and _addStoriesToSprint updates story statuses to 'in-progress'
    const createdSprint = this.sprintRepo.create(sprint, storyIds)

    // Notify listeners
    this.onSprintCreated(createdSprint)

    return createdSprint
  }

  /**
   * Update an existing sprint
   *
   * @param {string} sprintId - Sprint ID
   * @param {Object} updates - Fields to update
   * @returns {Object|null} Updated sprint or null if not found
   */
  updateSprint(sprintId, updates) {
    const sprint = this.sprintRepo.findById(sprintId)
    if (!sprint) {
      throw new SprintNotFoundError(sprintId)
    }

    return this.sprintRepo.update(sprintId, updates)
  }

  /**
   * Synchronize story status between sprint and backlog
   *
   * This is an atomic operation that updates both:
   * - sprint.storyProgress[storyId].status
   * - user_stories.status
   *
   * @param {string} storyId - Story ID
   * @param {string} status - New status ('completed' or 'in-progress')
   * @returns {Object} Result with updated sprint and story
   */
  syncStoryStatus(storyId, status) {
    const activeSprint = this.sprintRepo.findActive()
    if (!activeSprint) {
      throw new Error('No active sprint found')
    }

    // Execute atomic sync
    const result = this.sprintRepo.syncStoryStatus(
      activeSprint.id,
      storyId,
      status,
      this.userStoryRepo
    )

    // Notify listeners
    this.onStoryStatusChanged({
      storyId,
      status,
      sprintId: activeSprint.id,
      allStoriesCompleted: result.allStoriesCompleted
    })

    return result
  }

  /**
   * Close and archive a sprint atomically
   *
   * This operation:
   * 1. Updates all story statuses (completed stories stay completed, others go to pending)
   * 2. Archives sprint data to sprint_history
   * 3. Removes the active sprint
   *
   * All steps occur in a single transaction.
   *
   * @param {string} sprintId - Sprint ID to close
   * @param {Object} [options] - Close options
   * @param {string} [options.title] - Override title for archive
   * @param {string} [options.description] - Override description for archive
   * @returns {Object} Archived sprint data
   * @throws {SprintNotFoundError} If sprint not found
   */
  closeAndArchive(sprintId, options = {}) {
    const sprint = this.sprintRepo.findById(sprintId)
    if (!sprint) {
      throw new SprintNotFoundError(sprintId)
    }

    // Get story data for archival - include full assertion data for historical reference
    const storyIds = this.sprintRepo.getStoryIds(sprintId)
    const stories = storyIds.map(id => {
      const story = this.userStoryRepo.findById(id)
      if (story) {
        return {
          id: story.id,
          title: story.title,
          description: story.description,
          status: story.status,
          acceptanceCriteria: story.acceptanceCriteria || [],
          inspectionAssertions: story.inspectionAssertions || [],
          assertionResults: story.assertionResults
        }
      }
      return null
    }).filter(Boolean)

    // Build archive overrides
    const overrides = {
      title: options.title || sprint.title,
      description: options.description !== undefined ? options.description : sprint.description,
      closedAt: this._now()
    }

    // Execute atomic archive
    // SprintRepository.archive() uses immediateTransaction and updates story statuses
    const archived = this.sprintRepo.archive(sprintId, stories, overrides)

    if (!archived) {
      throw new SprintNotFoundError(sprintId)
    }

    // Notify listeners
    this.onSprintArchived(archived)

    return archived
  }

  /**
   * Add a story to the active sprint
   *
   * @param {string} storyId - Story ID to add
   * @returns {boolean} True if added
   * @throws {Error} If no active sprint
   * @throws {InvalidStoryIdsError} If story doesn't exist
   */
  addStoryToActiveSprint(storyId) {
    const activeSprint = this.sprintRepo.findActive()
    if (!activeSprint) {
      throw new Error('No active sprint found')
    }

    this._validateStoryIds([storyId])

    // SprintRepository.addStory() uses transaction and updates status
    return this.sprintRepo.addStory(activeSprint.id, storyId)
  }

  /**
   * Remove a story from the active sprint
   *
   * @param {string} storyId - Story ID to remove
   * @returns {boolean} True if removed
   * @throws {Error} If no active sprint
   */
  removeStoryFromActiveSprint(storyId) {
    const activeSprint = this.sprintRepo.findActive()
    if (!activeSprint) {
      throw new Error('No active sprint found')
    }

    // SprintRepository.removeStory() uses transaction and resets status to pending
    return this.sprintRepo.removeStory(activeSprint.id, storyId)
  }

  /**
   * Get the active sprint with stories
   *
   * @returns {Object|null} Active sprint or null
   */
  getActiveSprint() {
    return this.sprintRepo.findActive()
  }

  /**
   * Get sprint history
   *
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=50] - Maximum number of results
   * @returns {Object[]} Array of archived sprints
   */
  getSprintHistory(options = {}) {
    return this.sprintRepo.findArchived(options)
  }

  /**
   * Get an archived sprint with resolved story data
   *
   * @param {string} sprintId - Sprint ID
   * @returns {Object|null} Archived sprint or null
   */
  getArchivedSprint(sprintId) {
    return this.sprintRepo.findArchivedWithStories(sprintId, this.userStoryRepo)
  }
}

module.exports = {
  SprintService,
  ActiveSprintExistsError,
  InvalidStoryIdsError,
  SprintNotFoundError
}
