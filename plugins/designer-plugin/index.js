/**
 * Designer Plugin - Entry Point
 *
 * Provides GUI design definition storage and management.
 * Designs are stored in .puffin/plugins/designer/designs/
 */

const path = require('path')
const { DesignerStorage } = require('./designer-storage')

const DesignerPlugin = {
  context: null,
  storage: null,

  /**
   * Activate the plugin
   * @param {Object} context - Plugin context from PluginManager
   */
  async activate(context) {
    this.context = context

    // Initialize storage with project-relative storage directory
    // Designs are stored in {project}/.puffin/gui-definitions/
    const projectPath = context.projectPath
    if (!projectPath) {
      throw new Error('Designer plugin requires projectPath in context')
    }
    const designsDir = path.join(projectPath, '.puffin', 'gui-definitions')
    this.storage = new DesignerStorage(designsDir, context.log)

    // Ensure designs directory exists on activation
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

    context.log.info('Designer plugin activated')
    context.log.debug(`Designs directory: ${this.storage.designsDir}`)
  },

  /**
   * Deactivate the plugin
   */
  async deactivate() {
    this.storage = null
    this.context.log.info('Designer plugin deactivated')
  },

  // ============ Core API Methods ============

  /**
   * Save a new design
   * @param {Object} options - Save options
   * @param {string} options.name - Design name
   * @param {Array} options.elements - GUI elements
   * @param {string} [options.description] - Optional description
   * @returns {Promise<{filename: string, design: Object}>}
   */
  async saveDesign(options) {
    const { name, elements, description } = options
    return this.storage.saveDesign(name, elements, description)
  },

  /**
   * Load a design by filename
   * @param {string} filename - Design filename
   * @returns {Promise<Object>} Design object
   */
  async loadDesign(filename) {
    return this.storage.loadDesign(filename)
  },

  /**
   * List all saved designs
   * @returns {Promise<Array>} Array of design metadata
   */
  async listDesigns() {
    return this.storage.listDesigns()
  },

  /**
   * Update an existing design
   * @param {string} filename - Design filename
   * @param {Object} updates - Partial updates
   * @returns {Promise<Object>} Updated design
   */
  async updateDesign(filename, updates) {
    return this.storage.updateDesign(filename, updates)
  },

  /**
   * Delete a design
   * @param {string} filename - Design filename
   * @returns {Promise<boolean>}
   */
  async deleteDesign(filename) {
    return this.storage.deleteDesign(filename)
  },

  /**
   * Rename a design
   * @param {string} oldFilename - Current filename
   * @param {string} newName - New design name
   * @returns {Promise<Object>}
   */
  async renameDesign(oldFilename, newName) {
    return this.storage.renameDesign(oldFilename, newName)
  },

  /**
   * Check if a design name is unique
   * @param {string} name - Name to check
   * @param {string} [excludeFilename] - Filename to exclude
   * @returns {Promise<boolean>}
   */
  async checkNameUnique(name, excludeFilename) {
    return this.storage.isNameUnique(name, excludeFilename)
  },

  /**
   * Export a design as JSON string
   * @param {string} filename - Design filename
   * @returns {Promise<string>}
   */
  async exportDesign(filename) {
    return this.storage.exportDesign(filename)
  },

  /**
   * Import a design from JSON string
   * @param {string} jsonContent - JSON content
   * @param {string} [newName] - Optional new name
   * @returns {Promise<Object>}
   */
  async importDesign(jsonContent, newName) {
    return this.storage.importDesign(jsonContent, newName)
  },

  // ============ IPC Handlers ============
  // These wrap the core methods for IPC communication
  // Note: PluginContext.registerIpcHandler() adds its own error handling wrapper
  // So handlers should throw errors rather than returning { success: false }

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

module.exports = DesignerPlugin
