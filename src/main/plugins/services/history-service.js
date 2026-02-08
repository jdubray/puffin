/**
 * History Service
 *
 * Provides read-only access to Puffin history data for plugins.
 * Wraps PuffinState with a clean, documented API.
 */

/**
 * Branch information returned by the history service
 * @typedef {Object} BranchInfo
 * @property {string} id - Branch identifier
 * @property {string} name - Display name
 * @property {number} promptCount - Number of prompts in this branch
 * @property {Date|null} lastActivity - Timestamp of last prompt or null if empty
 */

/**
 * Prompt information returned by the history service
 * @typedef {Object} PromptInfo
 * @property {string} id - Prompt identifier
 * @property {string} branchId - Parent branch identifier
 * @property {string} content - Prompt content text
 * @property {Date} timestamp - When the prompt was created
 * @property {string|null} parentId - Parent prompt ID for threaded conversations
 * @property {ResponseInfo|null} response - Response data or null if pending
 */

/**
 * Response information for a prompt
 * @typedef {Object} ResponseInfo
 * @property {string} content - Response content text
 * @property {string} sessionId - Claude session identifier
 * @property {number} cost - Estimated cost in dollars
 * @property {number} turns - Number of conversation turns
 * @property {number} duration - Duration in milliseconds
 * @property {Date} timestamp - When the response was received
 */

/**
 * HistoryService - Read-only access to Puffin history for plugins
 *
 * Usage:
 * ```javascript
 * const history = context.getService('history')
 *
 * if (history.isAvailable()) {
 *   const branches = await history.getBranches()
 *   const prompts = await history.getPrompts('specifications')
 *   const allPrompts = await history.getAllPrompts()
 * }
 * ```
 */
class HistoryService {
  /**
   * @param {Object} options
   * @param {Function} [options.getPuffinState] - Function that returns PuffinState instance
   */
  constructor(options = {}) {
    /**
     * Function to get PuffinState instance (lazy binding)
     * @type {Function|null}
     * @private
     */
    this._getPuffinState = options.getPuffinState || null
  }

  /**
   * Set the PuffinState getter function
   * Called during initialization to enable lazy access to puffinState
   * @param {Function} getPuffinState - Function that returns PuffinState instance
   */
  setPuffinStateGetter(getPuffinState) {
    this._getPuffinState = getPuffinState
  }

  /**
   * Get the current PuffinState instance
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
   * Check if history data is available
   * @returns {boolean} True if a project is open and history is accessible
   */
  isAvailable() {
    const puffinState = this._getPuffinStateInstance()
    const available = puffinState != null && puffinState.history != null
    return available
  }

  /**
   * Get all branches with summary information
   * @returns {Promise<BranchInfo[]>} Array of branch info objects
   */
  async getBranches() {
    const puffinState = this._getPuffinStateInstance()
    if (!puffinState || !puffinState.history) {
      return []
    }

    try {
      const history = puffinState.history
      const branches = history.branches || {}

      return Object.values(branches).map(branch => this._transformBranch(branch))
    } catch (error) {
      console.warn('[HistoryService] Error getting branches:', error.message)
      return []
    }
  }

  /**
   * Get prompts for a specific branch
   * @param {string} branchName - Branch identifier (e.g., 'specifications', 'ui')
   * @returns {Promise<PromptInfo[]>} Array of prompt info objects
   */
  async getPrompts(branchName) {
    const puffinState = this._getPuffinStateInstance()
    if (!puffinState || !puffinState.history) {
      return []
    }

    if (!branchName || typeof branchName !== 'string') {
      console.warn('[HistoryService] Invalid branch name provided')
      return []
    }

    try {
      const history = puffinState.history
      const branch = history.branches?.[branchName]

      if (!branch) {
        return []
      }

      const prompts = branch.prompts || []
      return prompts.map(prompt => this._transformPrompt(prompt, branchName))
    } catch (error) {
      console.warn('[HistoryService] Error getting prompts for branch:', error.message)
      return []
    }
  }

  /**
   * Get all prompts across all branches
   * @returns {Promise<PromptInfo[]>} Array of all prompt info objects
   */
  async getAllPrompts() {
    const puffinState = this._getPuffinStateInstance()
    if (!puffinState || !puffinState.history) {
      return []
    }

    try {
      const history = puffinState.history
      const branches = history.branches || {}
      const allPrompts = []

      for (const [branchId, branch] of Object.entries(branches)) {
        const prompts = branch.prompts || []
        for (const prompt of prompts) {
          allPrompts.push(this._transformPrompt(prompt, branchId))
        }
      }

      // Sort by timestamp, most recent first
      allPrompts.sort((a, b) => b.timestamp - a.timestamp)

      return allPrompts
    } catch (error) {
      console.warn('[HistoryService] Error getting all prompts:', error.message)
      return []
    }
  }

  /**
   * Get summary statistics for all history
   * @returns {Promise<Object>} Statistics object with counts and totals
   */
  async getStatistics() {
    if (!this.isAvailable()) {
      return {
        totalBranches: 0,
        totalPrompts: 0,
        totalCost: 0,
        totalTurns: 0,
        totalDuration: 0
      }
    }

    try {
      const allPrompts = await this.getAllPrompts()

      let totalCost = 0
      let totalTurns = 0
      let totalDuration = 0

      for (const prompt of allPrompts) {
        if (prompt.response) {
          totalCost += prompt.response.cost || 0
          totalTurns += prompt.response.turns || 0
          totalDuration += prompt.response.duration || 0
        }
      }

      const branches = await this.getBranches()

      return {
        totalBranches: branches.length,
        totalPrompts: allPrompts.length,
        totalCost,
        totalTurns,
        totalDuration
      }
    } catch (error) {
      console.warn('[HistoryService] Error getting statistics:', error.message)
      return {
        totalBranches: 0,
        totalPrompts: 0,
        totalCost: 0,
        totalTurns: 0,
        totalDuration: 0
      }
    }
  }

  /**
   * Transform raw branch data to BranchInfo format
   * @param {Object} branch - Raw branch data from PuffinState
   * @returns {BranchInfo} Transformed branch info
   * @private
   */
  _transformBranch(branch) {
    const prompts = branch.prompts || []
    let lastActivity = null

    if (prompts.length > 0) {
      // Find the most recent timestamp
      const timestamps = prompts
        .map(p => p.timestamp || p.response?.timestamp)
        .filter(Boolean)
        .map(t => new Date(t))

      if (timestamps.length > 0) {
        lastActivity = new Date(Math.max(...timestamps))
      }
    }

    return {
      id: branch.id,
      name: branch.name,
      promptCount: prompts.length,
      lastActivity
    }
  }

  /**
   * Transform raw prompt data to PromptInfo format
   * @param {Object} prompt - Raw prompt data from PuffinState
   * @param {string} branchId - Parent branch identifier
   * @returns {PromptInfo} Transformed prompt info
   * @private
   */
  _transformPrompt(prompt, branchId) {
    const result = {
      id: prompt.id,
      branchId,
      content: prompt.content || '',
      timestamp: prompt.timestamp ? new Date(prompt.timestamp) : new Date(),
      parentId: prompt.parentId || null,
      response: null
    }

    if (prompt.response) {
      result.response = {
        content: prompt.response.content || '',
        sessionId: prompt.response.sessionId || '',
        cost: prompt.response.cost || 0,
        turns: prompt.response.turns || 0,
        duration: prompt.response.duration || 0,
        timestamp: prompt.response.timestamp ? new Date(prompt.response.timestamp) : new Date()
      }
    }

    return result
  }
}

module.exports = { HistoryService }
