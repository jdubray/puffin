/**
 * Service Layer Exports
 *
 * Services provide a consistent abstraction layer between
 * IPC handlers and repositories, ensuring:
 * - Proper transaction handling
 * - Standardized error handling
 * - Cache invalidation
 * - Event emission
 *
 * @module services
 */

const {
  SprintService,
  ActiveSprintExistsError,
  InvalidStoryIdsError,
  SprintNotFoundError
} = require('./sprint-service')

module.exports = {
  SprintService,
  ActiveSprintExistsError,
  InvalidStoryIdsError,
  SprintNotFoundError
}
