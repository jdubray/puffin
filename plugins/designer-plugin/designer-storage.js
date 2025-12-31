/**
 * Designer Storage Service
 *
 * Handles persistence of GUI design definitions in the plugin's storage directory.
 * Designs are stored in .puffin/plugins/designer/designs/ as JSON files.
 */

const fs = require('fs').promises
const path = require('path')

/**
 * Error thrown when a design name conflicts with an existing design
 */
class DuplicateNameError extends Error {
  /**
   * @param {string} name - The duplicate name
   * @param {string} existingFilename - The filename of the existing design
   */
  constructor(name, existingFilename) {
    super(`A design named "${name}" already exists`)
    this.name = 'DuplicateNameError'
    this.code = 'DUPLICATE_NAME'
    this.duplicateName = name
    this.existingFilename = existingFilename
  }
}

/**
 * @typedef {Object} DesignElement
 * @property {string} id - Element unique identifier
 * @property {string} type - Element type (button, input, container, etc.)
 * @property {Object} properties - Element-specific properties
 * @property {Array<DesignElement>} [children] - Child elements for containers
 */

/**
 * @typedef {Object} Design
 * @property {string} id - Design unique identifier
 * @property {string} name - Human-readable design name
 * @property {string} description - Optional design description
 * @property {Array<DesignElement>} elements - GUI elements in the design
 * @property {Object} metadata - Design metadata
 * @property {string} metadata.createdAt - ISO timestamp of creation
 * @property {string} metadata.lastModified - ISO timestamp of last modification
 * @property {string} metadata.version - Schema version
 */

class DesignerStorage {
  /**
   * @param {string} designsDir - Path to designs directory (.puffin/gui-definitions)
   * @param {Object} logger - Logger instance for diagnostics
   */
  constructor(designsDir, logger) {
    this.designsDir = designsDir
    this.logger = logger || console
  }

  /**
   * Ensure the designs directory exists
   * Called during plugin activation
   * @returns {Promise<void>}
   */
  async ensureDesignsDirectory() {
    try {
      await fs.mkdir(this.designsDir, { recursive: true })
      this.logger.debug(`Designs directory ensured: ${this.designsDir}`)
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err
      }
    }
  }

  /**
   * Generate a unique ID for designs
   * @returns {string} Unique identifier
   * @private
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
  }

  /**
   * Sanitize a name for use as a filename
   * @param {string} name - Name to sanitize
   * @returns {string} Filesystem-safe name
   * @private
   */
  sanitizeFilename(name) {
    return name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
  }

  /**
   * Validate filename to prevent path traversal
   * @param {string} filename - Filename to validate
   * @throws {Error} If filename is invalid
   * @private
   */
  validateFilename(filename) {
    if (!filename || typeof filename !== 'string') {
      throw new Error('Invalid filename: must be a non-empty string')
    }
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid filename: path traversal not allowed')
    }
    if (!filename.endsWith('.json')) {
      throw new Error('Invalid filename: must be a .json file')
    }
  }

  /**
   * Save a new GUI design
   * @param {string} name - Design name
   * @param {Array<DesignElement>} elements - GUI elements
   * @param {string} [description] - Optional description
   * @returns {Promise<{filename: string, design: Design}>} Saved design with filename
   * @throws {DuplicateNameError} If a design with the same name already exists
   */
  async saveDesign(name, elements, description = '') {
    if (!name || typeof name !== 'string') {
      throw new Error('Design name is required and must be a string')
    }
    if (!Array.isArray(elements)) {
      throw new Error('Design elements must be an array')
    }

    // Enforce namespace uniqueness before saving
    await this.checkNameUniqueness(name)

    const design = {
      id: this.generateId(),
      name,
      description: description || '',
      elements,
      metadata: {
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        version: '1.0'
      }
    }

    const filename = `${this.sanitizeFilename(name)}.json`
    const filepath = path.join(this.designsDir, filename)

    await fs.writeFile(filepath, JSON.stringify(design, null, 2), 'utf-8')
    this.logger.debug(`Saved design: ${name} -> ${filename}`)

    return { filename, design }
  }

  /**
   * Load a design by filename
   * @param {string} filename - Design filename (e.g., 'my_design.json')
   * @returns {Promise<Design>} Design object
   */
  async loadDesign(filename) {
    this.validateFilename(filename)
    const filepath = path.join(this.designsDir, filename)

    try {
      const content = await fs.readFile(filepath, 'utf-8')
      return JSON.parse(content)
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`Design not found: ${filename}`)
      }
      throw err
    }
  }

  /**
   * List all saved designs with metadata
   * @returns {Promise<Array<{filename: string, id: string, name: string, description: string, metadata: Object}>>}
   */
  async listDesigns() {
    try {
      const files = await fs.readdir(this.designsDir)
      const jsonFiles = files.filter(f => f.endsWith('.json'))

      const designs = await Promise.all(
        jsonFiles.map(async (filename) => {
          try {
            const filepath = path.join(this.designsDir, filename)
            const content = await fs.readFile(filepath, 'utf-8')
            const design = JSON.parse(content)
            return {
              filename,
              id: design.id,
              name: design.name,
              description: design.description || '',
              elementCount: design.elements?.length || 0,
              metadata: design.metadata
            }
          } catch (err) {
            this.logger.warn(`Failed to load design ${filename}: ${err.message}`)
            return null
          }
        })
      )

      return designs.filter(d => d !== null)
    } catch (err) {
      if (err.code === 'ENOENT') {
        return []
      }
      throw err
    }
  }

  /**
   * Update an existing design
   * @param {string} filename - Design filename
   * @param {Object} updates - Partial updates to apply
   * @returns {Promise<Design>} Updated design
   */
  async updateDesign(filename, updates) {
    this.validateFilename(filename)

    const design = await this.loadDesign(filename)
    const updatedDesign = {
      ...design,
      ...updates,
      id: design.id, // Preserve original ID
      metadata: {
        ...design.metadata,
        lastModified: new Date().toISOString()
      }
    }

    const filepath = path.join(this.designsDir, filename)
    await fs.writeFile(filepath, JSON.stringify(updatedDesign, null, 2), 'utf-8')
    this.logger.debug(`Updated design: ${filename}`)

    return updatedDesign
  }

  /**
   * Delete a design
   * @param {string} filename - Design filename
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteDesign(filename) {
    this.validateFilename(filename)
    const filepath = path.join(this.designsDir, filename)

    try {
      await fs.unlink(filepath)
      this.logger.debug(`Deleted design: ${filename}`)
      return true
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`Design not found: ${filename}`)
      }
      throw err
    }
  }

  /**
   * Rename a design (changes both the name field and filename)
   * @param {string} oldFilename - Current filename
   * @param {string} newName - New design name
   * @returns {Promise<{oldFilename: string, newFilename: string, design: Design}>}
   */
  async renameDesign(oldFilename, newName) {
    this.validateFilename(oldFilename)

    if (!newName || typeof newName !== 'string') {
      throw new Error('New name is required and must be a string')
    }

    // Load existing design
    const design = await this.loadDesign(oldFilename)

    // Create new filename
    const newFilename = `${this.sanitizeFilename(newName)}.json`
    const newFilepath = path.join(this.designsDir, newFilename)
    const oldFilepath = path.join(this.designsDir, oldFilename)

    // Check if new filename already exists (and it's not the same file)
    if (newFilename !== oldFilename) {
      try {
        await fs.access(newFilepath)
        throw new Error(`A design with the name "${newName}" already exists`)
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err
        }
        // File doesn't exist, we can proceed
      }
    }

    // Update design with new name
    const updatedDesign = {
      ...design,
      name: newName,
      metadata: {
        ...design.metadata,
        lastModified: new Date().toISOString()
      }
    }

    // Write to new location
    await fs.writeFile(newFilepath, JSON.stringify(updatedDesign, null, 2), 'utf-8')

    // Delete old file if filename changed
    if (newFilename !== oldFilename) {
      await fs.unlink(oldFilepath)
    }

    this.logger.debug(`Renamed design: ${oldFilename} -> ${newFilename}`)

    return {
      oldFilename,
      newFilename,
      design: updatedDesign
    }
  }

  /**
   * Check if a design name is unique
   * @param {string} name - Name to check
   * @param {string} [excludeFilename] - Filename to exclude from check (for renames)
   * @returns {Promise<boolean>} True if name is unique
   */
  async isNameUnique(name, excludeFilename = null) {
    const sanitized = this.sanitizeFilename(name)
    const targetFilename = `${sanitized}.json`

    if (excludeFilename && targetFilename === excludeFilename) {
      return true
    }

    const filepath = path.join(this.designsDir, targetFilename)

    try {
      await fs.access(filepath)
      return false // File exists, name is not unique
    } catch (err) {
      if (err.code === 'ENOENT') {
        return true // File doesn't exist, name is unique
      }
      throw err
    }
  }

  /**
   * Check name uniqueness and throw if duplicate exists
   * @param {string} name - Name to check
   * @param {string} [excludeFilename] - Filename to exclude from check (for renames)
   * @throws {DuplicateNameError} If a design with the same sanitized name exists
   */
  async checkNameUniqueness(name, excludeFilename = null) {
    const sanitized = this.sanitizeFilename(name)
    const targetFilename = `${sanitized}.json`

    if (excludeFilename && targetFilename === excludeFilename) {
      return // Same file, no conflict
    }

    const filepath = path.join(this.designsDir, targetFilename)

    try {
      await fs.access(filepath)
      // File exists - this is a conflict
      throw new DuplicateNameError(name, targetFilename)
    } catch (err) {
      if (err.code === 'ENOENT') {
        return // File doesn't exist, name is unique
      }
      throw err // Re-throw DuplicateNameError or other errors
    }
  }

  /**
   * Export a design as a portable format
   * @param {string} filename - Design filename
   * @returns {Promise<string>} JSON string of the design
   */
  async exportDesign(filename) {
    const design = await this.loadDesign(filename)
    return JSON.stringify(design, null, 2)
  }

  /**
   * Import a design from JSON string
   * @param {string} jsonContent - JSON string of the design
   * @param {string} [newName] - Optional new name for the imported design
   * @returns {Promise<{filename: string, design: Design}>}
   * @throws {DuplicateNameError} If a design with the same name already exists
   */
  async importDesign(jsonContent, newName = null) {
    const importedDesign = JSON.parse(jsonContent)

    const name = newName || importedDesign.name || 'Imported Design'
    const elements = importedDesign.elements || []
    const description = importedDesign.description || ''

    return this.saveDesign(name, elements, description)
  }
}

module.exports = { DesignerStorage, DuplicateNameError }
