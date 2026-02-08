/**
 * Lifecycle Repository
 *
 * CRUD operations for outcome lifecycles backed by file-based Storage.
 * Wraps Storage with domain logic: ID generation, timestamp management,
 * validation, filtering, and referential integrity on delete.
 *
 * @module lifecycle-repository
 */

const crypto = require('crypto')

/** Valid lifecycle statuses */
const VALID_STATUSES = ['not_started', 'in_progress', 'achieved']

/** Fields allowed in update operations */
const UPDATABLE_FIELDS = ['title', 'description', 'status']

/**
 * Repository for lifecycle CRUD operations.
 *
 * @example
 * const repo = new LifecycleRepository(storage);
 * const lifecycle = await repo.create('Ship auth', 'Users can log in');
 * const all = await repo.list({ status: 'not_started' });
 */
class LifecycleRepository {
  /**
   * @param {import('./storage').Storage} storage - Storage instance
   */
  constructor(storage) {
    if (!storage) {
      throw new Error('LifecycleRepository requires a Storage instance')
    }
    this.storage = storage
  }

  /**
   * Create a new lifecycle
   *
   * @param {string} title - Lifecycle title (required, non-empty)
   * @param {string} [description=''] - Lifecycle description
   * @returns {Promise<Object>} Created lifecycle object
   * @throws {Error} If title is missing or empty
   */
  async create(title, description = '') {
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw new Error('Lifecycle title is required and must be a non-empty string')
    }

    const now = new Date().toISOString()
    const lifecycle = {
      id: crypto.randomUUID(),
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      status: 'not_started',
      dependencies: [],
      storyMappings: [],
      createdAt: now,
      updatedAt: now
    }

    const data = await this.storage.load()
    data.lifecycles.push(lifecycle)
    await this.storage.save(data)

    return lifecycle
  }

  /**
   * Get a single lifecycle by ID
   *
   * @param {string} id - Lifecycle ID
   * @returns {Promise<Object|null>} Lifecycle object or null if not found
   */
  async get(id) {
    if (!id) return null

    const data = await this.storage.load()
    return data.lifecycles.find(lc => lc.id === id) || null
  }

  /**
   * Update specified fields on a lifecycle
   *
   * Only title, description, and status may be updated.
   * The updatedAt timestamp is set automatically.
   *
   * @param {string} id - Lifecycle ID
   * @param {Object} fields - Fields to update
   * @param {string} [fields.title] - New title
   * @param {string} [fields.description] - New description
   * @param {string} [fields.status] - New status
   * @returns {Promise<Object|null>} Updated lifecycle or null if not found
   * @throws {Error} If status value is invalid or title is set to empty
   */
  async update(id, fields) {
    if (!id || !fields || typeof fields !== 'object') return null

    // Validate status if provided
    if (fields.status !== undefined && !VALID_STATUSES.includes(fields.status)) {
      throw new Error(`Invalid status "${fields.status}". Must be one of: ${VALID_STATUSES.join(', ')}`)
    }

    // Validate title if provided
    if (fields.title !== undefined) {
      if (typeof fields.title !== 'string' || fields.title.trim().length === 0) {
        throw new Error('Title must be a non-empty string')
      }
    }

    const data = await this.storage.load()
    const index = data.lifecycles.findIndex(lc => lc.id === id)

    if (index === -1) return null

    const lifecycle = data.lifecycles[index]

    // Apply only allowed fields
    for (const key of UPDATABLE_FIELDS) {
      if (fields[key] !== undefined) {
        lifecycle[key] = typeof fields[key] === 'string' ? fields[key].trim() : fields[key]
      }
    }

    lifecycle.updatedAt = new Date().toISOString()
    data.lifecycles[index] = lifecycle
    await this.storage.save(data)

    return lifecycle
  }

  /**
   * Delete a lifecycle by ID
   *
   * Also removes this lifecycle's ID from any other lifecycle's
   * dependencies array to maintain referential integrity.
   *
   * @param {string} id - Lifecycle ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    if (!id) return false

    const data = await this.storage.load()
    const index = data.lifecycles.findIndex(lc => lc.id === id)

    if (index === -1) return false

    // Remove the lifecycle
    data.lifecycles.splice(index, 1)

    // Remove from other lifecycles' dependencies
    for (const lc of data.lifecycles) {
      const depIndex = lc.dependencies.indexOf(id)
      if (depIndex !== -1) {
        lc.dependencies.splice(depIndex, 1)
        lc.updatedAt = new Date().toISOString()
      }
    }

    await this.storage.save(data)
    return true
  }

  /**
   * List lifecycles with optional filtering and sorting
   *
   * @param {Object} [filters] - Filter/sort options
   * @param {string} [filters.status] - Filter by status
   * @param {string} [filters.search] - Search in title and description (case-insensitive)
   * @param {string} [filters.sortBy='createdAt'] - Sort field: 'createdAt', 'updatedAt', 'title'
   * @param {string} [filters.sortOrder='desc'] - Sort order: 'asc' or 'desc'
   * @returns {Promise<Object[]>} Filtered and sorted lifecycle list
   */
  async list(filters = {}) {
    const data = await this.storage.load()
    let results = data.lifecycles

    // Filter by status
    if (filters.status) {
      results = results.filter(lc => lc.status === filters.status)
    }

    // Search in title and description
    if (filters.search && typeof filters.search === 'string') {
      const term = filters.search.toLowerCase()
      results = results.filter(lc =>
        (lc.title || '').toLowerCase().includes(term) ||
        (lc.description || '').toLowerCase().includes(term)
      )
    }

    // Sort
    const sortBy = filters.sortBy || 'createdAt'
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1

    results.sort((a, b) => {
      const aVal = a[sortBy] || ''
      const bVal = b[sortBy] || ''

      if (aVal < bVal) return -1 * sortOrder
      if (aVal > bVal) return 1 * sortOrder
      return 0
    })

    return results
  }

  // --- Story Mapping ---

  /**
   * Map a story to a lifecycle
   *
   * Adds the storyId to the lifecycle's storyMappings array.
   * Silently skips if the mapping already exists (prevents duplicates).
   *
   * @param {string} lifecycleId - Lifecycle ID
   * @param {string} storyId - Story ID to map
   * @returns {Promise<Object|null>} Updated lifecycle or null if lifecycle not found
   * @throws {Error} If storyId is missing
   */
  async mapStory(lifecycleId, storyId) {
    if (!lifecycleId) return null
    if (!storyId || typeof storyId !== 'string') {
      throw new Error('storyId is required and must be a non-empty string')
    }

    const data = await this.storage.load()
    const lifecycle = data.lifecycles.find(lc => lc.id === lifecycleId)

    if (!lifecycle) return null

    // Prevent duplicates
    if (lifecycle.storyMappings.includes(storyId)) {
      return lifecycle
    }

    lifecycle.storyMappings.push(storyId)
    lifecycle.updatedAt = new Date().toISOString()
    await this.storage.save(data)

    return lifecycle
  }

  /**
   * Remove a story mapping from a lifecycle
   *
   * @param {string} lifecycleId - Lifecycle ID
   * @param {string} storyId - Story ID to unmap
   * @returns {Promise<Object|null>} Updated lifecycle or null if lifecycle not found
   */
  async unmapStory(lifecycleId, storyId) {
    if (!lifecycleId || !storyId) return null

    const data = await this.storage.load()
    const lifecycle = data.lifecycles.find(lc => lc.id === lifecycleId)

    if (!lifecycle) return null

    const index = lifecycle.storyMappings.indexOf(storyId)
    if (index === -1) {
      return lifecycle // Not mapped, return as-is
    }

    lifecycle.storyMappings.splice(index, 1)
    lifecycle.updatedAt = new Date().toISOString()
    await this.storage.save(data)

    return lifecycle
  }

  /**
   * Get all story IDs mapped to a lifecycle
   *
   * @param {string} lifecycleId - Lifecycle ID
   * @returns {Promise<string[]>} Array of story IDs, empty if lifecycle not found
   */
  async getStoriesForLifecycle(lifecycleId) {
    if (!lifecycleId) return []

    const data = await this.storage.load()
    const lifecycle = data.lifecycles.find(lc => lc.id === lifecycleId)

    return lifecycle ? [...lifecycle.storyMappings] : []
  }

  /**
   * Get all lifecycles that a story is mapped to
   *
   * @param {string} storyId - Story ID
   * @returns {Promise<Object[]>} Array of lifecycle objects containing this story
   */
  async getLifecyclesForStory(storyId) {
    if (!storyId) return []

    const data = await this.storage.load()
    return data.lifecycles.filter(lc =>
      lc.storyMappings.includes(storyId)
    )
  }
}

module.exports = { LifecycleRepository, VALID_STATUSES, UPDATABLE_FIELDS }
