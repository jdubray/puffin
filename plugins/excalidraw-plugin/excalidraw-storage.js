/**
 * Excalidraw Storage Service
 *
 * Handles persistence of Excalidraw designs in .puffin/excalidraw-designs/.
 * Uses two-file pattern: .excalidraw (scene data) + .meta.json (metadata/thumbnails).
 */

const fs = require('fs').promises
const path = require('path')
const { randomUUID } = require('crypto')

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
 * @typedef {Object} ExcalidrawScene
 * @property {string} type - Always "excalidraw"
 * @property {number} version - Schema version (2)
 * @property {Array} elements - Excalidraw elements
 * @property {Object} appState - Excalidraw app state
 * @property {Object} [files] - Embedded image files
 */

/**
 * @typedef {Object} DesignMeta
 * @property {string} id - Unique design identifier
 * @property {string} name - Human-readable design name
 * @property {string} description - Optional description
 * @property {number} elementCount - Number of elements in the scene
 * @property {string} createdAt - ISO timestamp of creation
 * @property {string} lastModified - ISO timestamp of last modification
 * @property {string} version - Schema version
 * @property {string|null} thumbnailData - Base64 thumbnail (deferred to Story 3)
 */

class ExcalidrawStorage {
  /**
   * @param {string} designsDir - Path to designs directory (.puffin/excalidraw-designs)
   * @param {Object} logger - Logger instance for diagnostics
   */
  constructor(designsDir, logger) {
    this.designsDir = designsDir
    this.logger = logger || console
  }

  /**
   * Ensure the designs directory exists
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
   * @returns {string}
   * @private
   */
  generateId() {
    return randomUUID()
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
    if (!filename.endsWith('.excalidraw')) {
      throw new Error('Invalid filename: must be a .excalidraw file')
    }
  }

  /**
   * Validate scene data has required Excalidraw structure
   * @param {Object} sceneData - Scene data to validate
   * @throws {Error} If scene data is invalid
   * @private
   */
  validateSceneData(sceneData) {
    if (!sceneData || typeof sceneData !== 'object') {
      throw new Error('Invalid scene data: must be an object')
    }
    if (!Array.isArray(sceneData.elements)) {
      throw new Error('Invalid scene data: elements must be an array')
    }
  }

  /**
   * Build a complete Excalidraw scene object with defaults
   * @param {Object} sceneData - Partial scene data
   * @returns {ExcalidrawScene}
   * @private
   */
  buildScene(sceneData) {
    return {
      type: 'excalidraw',
      version: 2,
      source: 'puffin-excalidraw-plugin',
      elements: sceneData.elements || [],
      appState: sceneData.appState || {},
      files: sceneData.files || {}
    }
  }

  /**
   * Save a new Excalidraw design
   * @param {string} name - Design name
   * @param {Object} sceneData - Excalidraw scene data { elements, appState, files }
   * @param {Object} [metadata] - Optional metadata { description, elementCount }
   * @returns {Promise<{filename: string, design: DesignMeta}>}
   * @throws {DuplicateNameError} If a design with the same name already exists
   */
  async saveDesign(name, sceneData, metadata = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('Design name is required and must be a string')
    }

    this.validateSceneData(sceneData)
    await this.checkNameUniqueness(name)

    const id = this.generateId()
    const now = new Date().toISOString()
    const sanitized = this.sanitizeFilename(name)
    const filename = `${sanitized}.excalidraw`
    const metaFilename = `${sanitized}.meta.json`

    // Build scene file
    const scene = this.buildScene(sceneData)

    // Build meta file
    const meta = {
      id,
      name,
      description: metadata.description || '',
      elementCount: sceneData.elements.length,
      createdAt: now,
      lastModified: now,
      version: '1.0',
      thumbnailData: metadata.thumbnailData || null
    }

    const scenePath = path.join(this.designsDir, filename)
    const metaPath = path.join(this.designsDir, metaFilename)

    // Write meta first, then scene. If the scene write fails, clean up the
    // orphaned meta file. A scene file without meta is handled gracefully by
    // listDesigns/loadDesign (they generate fallback metadata from the scene),
    // but we still attempt cleanup to avoid stale files.
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
    try {
      await fs.writeFile(scenePath, JSON.stringify(scene, null, 2), 'utf-8')
    } catch (err) {
      // Clean up orphaned meta file on scene write failure
      try { await fs.unlink(metaPath) } catch (_) { /* best effort */ }
      throw err
    }

    this.logger.debug(`Saved design: ${name} -> ${filename}`)

    return { filename, design: meta }
  }

  /**
   * Load a design by filename (returns both scene and metadata)
   * @param {string} filename - Design filename (e.g., 'my_design.excalidraw')
   * @returns {Promise<{scene: ExcalidrawScene, meta: DesignMeta}>}
   */
  async loadDesign(filename) {
    this.validateFilename(filename)

    const scenePath = path.join(this.designsDir, filename)
    const metaFilename = filename.replace(/\.excalidraw$/, '.meta.json')
    const metaPath = path.join(this.designsDir, metaFilename)

    try {
      const sceneContent = await fs.readFile(scenePath, 'utf-8')
      const scene = JSON.parse(sceneContent)

      let meta = null
      try {
        const metaContent = await fs.readFile(metaPath, 'utf-8')
        meta = JSON.parse(metaContent)
      } catch (metaErr) {
        // Meta file is optional — build fallback from scene
        this.logger.debug(`No meta file for ${filename}, using fallback`)
        meta = {
          id: this.generateId(),
          name: filename.replace(/\.excalidraw$/, ''),
          description: '',
          elementCount: scene.elements?.length || 0,
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          version: '1.0',
          thumbnailData: null
        }
      }

      return { scene, meta }
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`Design not found: ${filename}`)
      }
      throw err
    }
  }

  /**
   * List all saved designs with metadata
   * @returns {Promise<Array<{filename: string, id: string, name: string, description: string, elementCount: number, metadata: Object}>>}
   */
  async listDesigns() {
    try {
      const files = await fs.readdir(this.designsDir)
      const excalidrawFiles = files.filter(f => f.endsWith('.excalidraw'))

      const designs = await Promise.all(
        excalidrawFiles.map(async (filename) => {
          try {
            const metaFilename = filename.replace(/\.excalidraw$/, '.meta.json')
            const metaPath = path.join(this.designsDir, metaFilename)

            let meta
            try {
              const metaContent = await fs.readFile(metaPath, 'utf-8')
              meta = JSON.parse(metaContent)
            } catch (metaErr) {
              // Fallback: read scene to get element count
              const scenePath = path.join(this.designsDir, filename)
              const sceneContent = await fs.readFile(scenePath, 'utf-8')
              const scene = JSON.parse(sceneContent)
              meta = {
                id: this.generateId(),
                name: filename.replace(/\.excalidraw$/, ''),
                description: '',
                elementCount: scene.elements?.length || 0,
                createdAt: null,
                lastModified: null,
                version: '1.0',
                thumbnailData: null
              }
            }

            return {
              filename,
              id: meta.id,
              name: meta.name,
              description: meta.description || '',
              elementCount: meta.elementCount || 0,
              metadata: {
                createdAt: meta.createdAt,
                lastModified: meta.lastModified,
                version: meta.version
              },
              thumbnailData: meta.thumbnailData || null
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
   * @param {Object} updates - Partial updates { sceneData?, name?, description? }
   * @returns {Promise<{scene: ExcalidrawScene, meta: DesignMeta}>}
   */
  async updateDesign(filename, updates) {
    this.validateFilename(filename)

    const { scene: existingScene, meta: existingMeta } = await this.loadDesign(filename)
    const now = new Date().toISOString()

    // Update scene if sceneData provided
    let updatedScene = existingScene
    if (updates.sceneData) {
      this.validateSceneData(updates.sceneData)
      updatedScene = this.buildScene(updates.sceneData)
    }

    // Update metadata
    const updatedMeta = {
      ...existingMeta,
      name: updates.name || existingMeta.name,
      description: updates.description !== undefined ? updates.description : existingMeta.description,
      elementCount: updatedScene.elements.length,
      lastModified: now,
      thumbnailData: updates.thumbnailData !== undefined ? updates.thumbnailData : existingMeta.thumbnailData
    }

    const scenePath = path.join(this.designsDir, filename)
    const metaFilename = filename.replace(/\.excalidraw$/, '.meta.json')
    const metaPath = path.join(this.designsDir, metaFilename)

    // Note: Non-atomic two-file write. If crash occurs between writes, the
    // existing files serve as fallback (loadDesign/listDesigns handle gracefully).
    await fs.writeFile(scenePath, JSON.stringify(updatedScene, null, 2), 'utf-8')
    await fs.writeFile(metaPath, JSON.stringify(updatedMeta, null, 2), 'utf-8')

    this.logger.debug(`Updated design: ${filename}`)

    return { scene: updatedScene, meta: updatedMeta }
  }

  /**
   * Delete a design (both .excalidraw and .meta.json)
   * @param {string} filename - Design filename
   * @returns {Promise<boolean>}
   */
  async deleteDesign(filename) {
    this.validateFilename(filename)

    const scenePath = path.join(this.designsDir, filename)
    const metaFilename = filename.replace(/\.excalidraw$/, '.meta.json')
    const metaPath = path.join(this.designsDir, metaFilename)

    try {
      await fs.unlink(scenePath)
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`Design not found: ${filename}`)
      }
      throw err
    }

    // Delete meta file (ignore if missing)
    try {
      await fs.unlink(metaPath)
    } catch (metaErr) {
      // Meta file may not exist — not an error
    }

    this.logger.debug(`Deleted design: ${filename}`)
    return true
  }

  /**
   * Rename a design (changes name, filename, and both files)
   * @param {string} oldFilename - Current filename
   * @param {string} newName - New design name
   * @returns {Promise<{oldFilename: string, newFilename: string, design: DesignMeta}>}
   */
  async renameDesign(oldFilename, newName) {
    this.validateFilename(oldFilename)

    if (!newName || typeof newName !== 'string') {
      throw new Error('New name is required and must be a string')
    }

    const newSanitized = this.sanitizeFilename(newName)
    const newFilename = `${newSanitized}.excalidraw`
    const newMetaFilename = `${newSanitized}.meta.json`

    // Check uniqueness (excluding current file)
    if (newFilename !== oldFilename) {
      await this.checkNameUniqueness(newName, oldFilename)
    }

    // Load existing design
    const { scene, meta } = await this.loadDesign(oldFilename)
    const now = new Date().toISOString()

    // Update metadata with new name
    const updatedMeta = {
      ...meta,
      name: newName,
      lastModified: now
    }

    const newScenePath = path.join(this.designsDir, newFilename)
    const newMetaPath = path.join(this.designsDir, newMetaFilename)

    if (newFilename !== oldFilename) {
      // Use fs.rename for atomic same-directory move (no duplicate window)
      const oldScenePath = path.join(this.designsDir, oldFilename)
      const oldMetaFilename = oldFilename.replace(/\.excalidraw$/, '.meta.json')
      const oldMetaPath = path.join(this.designsDir, oldMetaFilename)

      await fs.rename(oldScenePath, newScenePath)
      try {
        await fs.rename(oldMetaPath, newMetaPath)
      } catch (e) {
        // Meta file may not exist — not an error
      }
    }

    // Write updated meta content (name change + lastModified)
    await fs.writeFile(newMetaPath, JSON.stringify(updatedMeta, null, 2), 'utf-8')

    this.logger.debug(`Renamed design: ${oldFilename} -> ${newFilename}`)

    return { oldFilename, newFilename, design: updatedMeta }
  }

  /**
   * Check if a design name is unique
   * @param {string} name - Name to check
   * @param {string} [excludeFilename] - Filename to exclude from check
   * @returns {Promise<boolean>}
   */
  async isNameUnique(name, excludeFilename = null) {
    const sanitized = this.sanitizeFilename(name)
    const targetFilename = `${sanitized}.excalidraw`

    if (excludeFilename && targetFilename === excludeFilename) {
      return true
    }

    const filepath = path.join(this.designsDir, targetFilename)

    try {
      await fs.access(filepath)
      return false
    } catch (err) {
      if (err.code === 'ENOENT') {
        return true
      }
      throw err
    }
  }

  /**
   * Check name uniqueness and throw if duplicate exists
   * @param {string} name - Name to check
   * @param {string} [excludeFilename] - Filename to exclude
   * @throws {DuplicateNameError}
   * @private
   */
  async checkNameUniqueness(name, excludeFilename = null) {
    const sanitized = this.sanitizeFilename(name)
    const targetFilename = `${sanitized}.excalidraw`

    if (excludeFilename && targetFilename === excludeFilename) {
      return
    }

    const filepath = path.join(this.designsDir, targetFilename)

    try {
      await fs.access(filepath)
      throw new DuplicateNameError(name, targetFilename)
    } catch (err) {
      if (err.code === 'ENOENT') {
        return
      }
      throw err
    }
  }

  /**
   * Export a design as a portable JSON string
   * @param {string} filename - Design filename
   * @returns {Promise<string>} JSON string of the complete design
   */
  async exportDesign(filename) {
    const { scene, meta } = await this.loadDesign(filename)
    const exportData = {
      ...scene,
      ppiMetadata: meta
    }
    return JSON.stringify(exportData, null, 2)
  }

  /**
   * Maximum allowed import size in bytes (50 MB)
   * @type {number}
   */
  static MAX_IMPORT_SIZE = 50 * 1024 * 1024

  /**
   * Import a design from JSON string
   * @param {string} jsonContent - JSON string of Excalidraw data
   * @param {string} [newName] - Optional new name for the imported design
   * @returns {Promise<{filename: string, design: DesignMeta}>}
   * @throws {Error} If content exceeds size limit
   * @throws {DuplicateNameError}
   */
  async importDesign(jsonContent, newName = null) {
    if (!jsonContent || typeof jsonContent !== 'string') {
      throw new Error('Import content must be a non-empty string')
    }
    if (jsonContent.length > ExcalidrawStorage.MAX_IMPORT_SIZE) {
      throw new Error(`Import content too large: ${(jsonContent.length / (1024 * 1024)).toFixed(1)} MB exceeds ${ExcalidrawStorage.MAX_IMPORT_SIZE / (1024 * 1024)} MB limit`)
    }

    const imported = JSON.parse(jsonContent)

    const name = newName || imported.ppiMetadata?.name || imported.name || 'Imported Design'
    const sceneData = {
      elements: imported.elements || [],
      appState: imported.appState || {},
      files: imported.files || {}
    }
    const metadata = {
      description: imported.ppiMetadata?.description || imported.description || '',
      thumbnailData: imported.ppiMetadata?.thumbnailData || null
    }

    return this.saveDesign(name, sceneData, metadata)
  }
}

module.exports = { ExcalidrawStorage, DuplicateNameError }
