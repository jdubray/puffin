/**
 * Excalidraw Plugin - Entry Point
 *
 * Provides Excalidraw-based sketching and diagramming capabilities.
 * Designs are stored in .puffin/excalidraw-designs/ as .excalidraw files.
 */

const path = require('path')
const { ExcalidrawStorage } = require('./excalidraw-storage')

const ExcalidrawPlugin = {
  context: null,
  storage: null,

  /**
   * Activate the plugin — initializes storage and registers IPC handlers/actions
   * @param {Object} context - Plugin context from PluginManager
   * @param {string} context.projectPath - Absolute path to the project root
   * @param {Object} context.log - Logger instance { info, debug, warn, error }
   * @param {Function} context.registerIpcHandler - Register an IPC handler
   * @param {Function} context.registerAction - Register a programmatic action
   * @returns {Promise<void>}
   * @throws {Error} If projectPath is not provided in context
   */
  async activate(context) {
    this.context = context

    const projectPath = context.projectPath
    if (!projectPath) {
      throw new Error('Excalidraw plugin requires projectPath in context')
    }

    const designsDir = path.join(projectPath, '.puffin', 'excalidraw-designs')
    this.storage = new ExcalidrawStorage(designsDir, context.log)

    await this.storage.ensureDesignsDirectory()

    // Register IPC handlers for renderer communication
    context.registerIpcHandler('saveDesign', this.handleSaveDesign.bind(this))
    context.registerIpcHandler('loadDesign', this.handleLoadDesign.bind(this))
    context.registerIpcHandler('listDesigns', this.handleListDesigns.bind(this))
    context.registerIpcHandler('updateDesign', this.handleUpdateDesign.bind(this))
    context.registerIpcHandler('deleteDesign', this.handleDeleteDesign.bind(this))
    context.registerIpcHandler('renameDesign', this.handleRenameDesign.bind(this))
    context.registerIpcHandler('checkNameUnique', this.handleCheckNameUnique.bind(this))
    context.registerIpcHandler('exportDesign', this.handleExportDesign.bind(this))
    context.registerIpcHandler('importDesign', this.handleImportDesign.bind(this))

    // Register actions for programmatic access
    context.registerAction('saveDesign', this.saveDesign.bind(this))
    context.registerAction('loadDesign', this.loadDesign.bind(this))
    context.registerAction('listDesigns', this.listDesigns.bind(this))
    context.registerAction('deleteDesign', this.deleteDesign.bind(this))

    context.log.info('Excalidraw plugin activated')
    context.log.debug(`Designs directory: ${this.storage.designsDir}`)
  },

  /**
   * Deactivate the plugin — cleans up storage reference
   * @returns {Promise<void>}
   */
  async deactivate() {
    if (!this.context) return
    this.storage = null
    this.context.log.info('Excalidraw plugin deactivated')
    this.context = null
  },

  // ============ Core API Methods ============

  /**
   * Save a new design
   * @param {Object} options - Save options
   * @param {string} options.name - Design name
   * @param {Object} options.sceneData - Excalidraw scene data { elements, appState, files }
   * @param {Object} [options.metadata] - Optional metadata { description, thumbnailData }
   * @returns {Promise<{filename: string, design: Object}>} Saved filename and design metadata
   * @throws {Error} If name is empty or sceneData is invalid
   * @throws {DuplicateNameError} If a design with the same name already exists
   */
  async saveDesign(options) {
    const { name, sceneData, metadata } = options
    return this.storage.saveDesign(name, sceneData, metadata)
  },

  /**
   * Load a design by filename
   * @param {string} filename - Design filename (e.g., 'my_design.excalidraw')
   * @returns {Promise<{scene: Object, meta: Object}>} Scene data and metadata
   * @throws {Error} If design is not found or filename is invalid
   */
  async loadDesign(filename) {
    return this.storage.loadDesign(filename)
  },

  /**
   * List all saved designs with metadata
   * @returns {Promise<Array<{filename: string, id: string, name: string, description: string, elementCount: number, metadata: Object, thumbnailData: string|null}>>}
   */
  async listDesigns() {
    return this.storage.listDesigns()
  },

  /**
   * Update an existing design
   * @param {string} filename - Design filename
   * @param {Object} updates - Partial updates { sceneData?, name?, description?, thumbnailData? }
   * @returns {Promise<{scene: Object, meta: Object}>} Updated scene and metadata
   * @throws {Error} If design is not found
   */
  async updateDesign(filename, updates) {
    return this.storage.updateDesign(filename, updates)
  },

  /**
   * Delete a design (removes both .excalidraw and .meta.json files)
   * @param {string} filename - Design filename
   * @returns {Promise<boolean>} True if deleted successfully
   * @throws {Error} If design is not found
   */
  async deleteDesign(filename) {
    return this.storage.deleteDesign(filename)
  },

  /**
   * Rename a design (changes name, filename, and both files)
   * @param {string} oldFilename - Current filename
   * @param {string} newName - New design name
   * @returns {Promise<{oldFilename: string, newFilename: string, design: Object}>}
   * @throws {Error} If design is not found or new name is empty
   * @throws {DuplicateNameError} If new name conflicts with an existing design
   */
  async renameDesign(oldFilename, newName) {
    return this.storage.renameDesign(oldFilename, newName)
  },

  /**
   * Check if a design name is unique
   * @param {string} name - Name to check
   * @param {string} [excludeFilename] - Filename to exclude from check (for rename)
   * @returns {Promise<boolean>} True if name is available
   */
  async checkNameUnique(name, excludeFilename) {
    return this.storage.isNameUnique(name, excludeFilename)
  },

  /**
   * Export a design as a portable JSON string
   * @param {string} filename - Design filename
   * @returns {Promise<string>} JSON string containing scene data and ppiMetadata
   * @throws {Error} If design is not found
   */
  async exportDesign(filename) {
    return this.storage.exportDesign(filename)
  },

  /**
   * Import a design from JSON string
   * @param {string} jsonContent - JSON string of Excalidraw data
   * @param {string} [newName] - Optional new name (overrides embedded name)
   * @returns {Promise<{filename: string, design: Object}>} Imported filename and metadata
   * @throws {DuplicateNameError} If name conflicts with an existing design
   */
  async importDesign(jsonContent, newName) {
    return this.storage.importDesign(jsonContent, newName)
  },

  // ============ IPC Handlers ============

  async handleSaveDesign(options) {
    return this.saveDesign(options)
  },

  async handleLoadDesign(filename) {
    return this.loadDesign(filename)
  },

  async handleListDesigns() {
    return this.listDesigns()
  },

  async handleUpdateDesign({ filename, updates }) {
    return this.updateDesign(filename, updates)
  },

  async handleDeleteDesign(filename) {
    return this.deleteDesign(filename)
  },

  async handleRenameDesign({ oldFilename, newName }) {
    return this.renameDesign(oldFilename, newName)
  },

  async handleCheckNameUnique({ name, excludeFilename }) {
    return this.checkNameUnique(name, excludeFilename)
  },

  async handleExportDesign(filename) {
    return this.exportDesign(filename)
  },

  async handleImportDesign({ jsonContent, newName }) {
    return this.importDesign(jsonContent, newName)
  }
}

module.exports = ExcalidrawPlugin
