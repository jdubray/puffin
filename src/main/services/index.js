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

const {
  TempImageService,
  getTempImageService,
  SUPPORTED_EXTENSIONS: SUPPORTED_IMAGE_EXTENSIONS
} = require('./temp-image-service')

module.exports = {
  SprintService,
  ActiveSprintExistsError,
  InvalidStoryIdsError,
  SprintNotFoundError,
  TempImageService,
  getTempImageService,
  SUPPORTED_IMAGE_EXTENSIONS
}
