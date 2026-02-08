/**
 * Status Engine
 *
 * Pure function to compute a lifecycle's status from its mapped stories'
 * statuses. No side effects — takes an array of story status strings
 * and returns the derived lifecycle status.
 *
 * @module status-engine
 */

/** Story status that counts as "done" */
const COMPLETED_STATUS = 'completed'

/** Story statuses that indicate work has begun */
const ACTIVE_STATUSES = ['in-progress', 'completed']

/**
 * Compute a lifecycle status from mapped story statuses.
 *
 * Rules:
 * - No stories (empty array) → 'not_started'
 * - All stories pending (none started or completed) → 'not_started'
 * - All stories completed → 'achieved'
 * - Any story in-progress or some completed → 'in_progress'
 *
 * @param {string[]} storyStatuses - Array of status strings for mapped stories
 * @returns {string} Computed lifecycle status: 'not_started' | 'in_progress' | 'achieved'
 */
function computeStatus(storyStatuses) {
  if (!Array.isArray(storyStatuses) || storyStatuses.length === 0) {
    return 'not_started'
  }

  const completedCount = storyStatuses.filter(s => s === COMPLETED_STATUS).length
  const total = storyStatuses.length

  if (completedCount === total) return 'achieved'

  const activeCount = storyStatuses.filter(s => ACTIVE_STATUSES.includes(s)).length
  if (activeCount === 0) return 'not_started'

  return 'in_progress'
}

module.exports = { computeStatus, COMPLETED_STATUS, ACTIVE_STATUSES }
