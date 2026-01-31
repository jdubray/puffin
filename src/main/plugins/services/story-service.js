/**
 * Story Service
 *
 * Provides read-only access to user story data for plugins.
 * Wraps PuffinState with a clean, documented API.
 *
 * @module plugins/services/story-service
 */

/**
 * Story information returned by the story service
 * @typedef {Object} StoryInfo
 * @property {string} id - Story identifier
 * @property {string} branchId - Associated branch
 * @property {string} title - Story title
 * @property {string} description - Full description (As a..., I want..., so that...)
 * @property {string} status - Story status: 'pending', 'in-progress', 'completed', 'archived'
 * @property {Array} acceptanceCriteria - Acceptance criteria
 * @property {string|null} sourcePromptId - Originating prompt ID
 * @property {string} createdAt - ISO timestamp
 * @property {string} updatedAt - ISO timestamp
 */

/**
 * StoryService - Read-only access to user stories for plugins
 *
 * Usage:
 * ```javascript
 * const stories = context.getService('stories')
 *
 * if (stories.isAvailable()) {
 *   const all = stories.getAll()
 *   const pending = stories.getByStatus('pending')
 * }
 * ```
 */
class StoryService {
  /**
   * @param {Object} options
   * @param {Function} [options.getPuffinState] - Function that returns PuffinState instance
   */
  constructor(options = {}) {
    this._getPuffinState = options.getPuffinState || null
  }

  /**
   * Set the PuffinState getter function
   * @param {Function} getPuffinState
   */
  setPuffinStateGetter(getPuffinState) {
    this._getPuffinState = getPuffinState
  }

  /**
   * @returns {Object|null}
   * @private
   */
  _getPuffinStateInstance() {
    if (typeof this._getPuffinState === 'function') {
      return this._getPuffinState()
    }
    return null
  }

  /**
   * Check if story data is available
   * @returns {boolean}
   */
  isAvailable() {
    const puffinState = this._getPuffinStateInstance()
    return puffinState !== null && typeof puffinState.getUserStories === 'function'
  }

  /**
   * Get all non-archived user stories
   * @returns {StoryInfo[]}
   */
  getAll() {
    const puffinState = this._getPuffinStateInstance()
    if (!puffinState) return []

    try {
      return puffinState.getUserStories() || []
    } catch (error) {
      console.warn('[StoryService] Error getting stories:', error.message)
      return []
    }
  }

  /**
   * Get stories filtered by status
   * @param {string} status - 'pending', 'in-progress', 'completed', 'archived'
   * @returns {StoryInfo[]}
   */
  getByStatus(status) {
    return this.getAll().filter(s => s.status === status)
  }

  /**
   * Get a single story by ID
   * @param {string} id - Story ID
   * @returns {StoryInfo|null}
   */
  getById(id) {
    if (!id) return null
    return this.getAll().find(s => s.id === id) || null
  }
}

module.exports = { StoryService }
