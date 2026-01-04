/**
 * Document Viewer Plugin - Entry Point
 *
 * Provides browsing and preview of documentation files from the docs/ directory.
 * Features a tree view for navigation and markdown preview for file content.
 */

const { DocumentScanner } = require('./document-scanner')

const DocumentViewerPlugin = {
  context: null,
  scanner: null,

  /**
   * Activate the plugin
   * @param {Object} context - Plugin context from PluginManager
   */
  async activate(context) {
    this.context = context

    // Initialize scanner with project path
    const projectPath = context.projectPath
    if (!projectPath) {
      throw new Error('Document Viewer plugin requires projectPath in context')
    }

    this.scanner = new DocumentScanner(projectPath, context.log)

    // Register IPC handlers for renderer communication
    context.registerIpcHandler('scanDirectory', this.handleScanDirectory.bind(this))
    context.registerIpcHandler('getFileContent', this.handleGetFileContent.bind(this))
    context.registerIpcHandler('refreshTree', this.handleRefreshTree.bind(this))
    context.registerIpcHandler('getStats', this.handleGetStats.bind(this))

    // File organization handlers
    context.registerIpcHandler('moveItem', this.handleMoveItem.bind(this))
    context.registerIpcHandler('listDirectories', this.handleListDirectories.bind(this))
    context.registerIpcHandler('createDirectory', this.handleCreateDirectory.bind(this))

    // Register actions for programmatic access
    context.registerAction('scanDirectory', this.scanDirectory.bind(this))
    context.registerAction('getFileContent', this.getFileContent.bind(this))
    context.registerAction('refreshTree', this.refreshTree.bind(this))
    context.registerAction('getStats', this.getStats.bind(this))
    context.registerAction('moveItem', this.moveItem.bind(this))
    context.registerAction('listDirectories', this.listDirectories.bind(this))
    context.registerAction('createDirectory', this.createDirectory.bind(this))

    context.log.info('Document Viewer plugin activated')
    context.log.debug(`Docs path: ${this.scanner.getDocsPath()}`)
  },

  /**
   * Deactivate the plugin
   */
  async deactivate() {
    this.scanner = null
    this.context.log.info('Document Viewer plugin deactivated')
  },

  // ============ Core API Methods ============

  /**
   * Scan the docs directory and return tree structure
   * @returns {Promise<Object>} Tree with root node
   */
  async scanDirectory() {
    return this.scanner.scanDirectory()
  },

  /**
   * Get the content of a specific file
   * @param {string} filePath - Path to the file
   * @returns {Promise<Object>} File content and metadata
   */
  async getFileContent(filePath) {
    return this.scanner.getFileContent(filePath)
  },

  /**
   * Refresh the tree (alias for scanDirectory)
   * @returns {Promise<Object>} Fresh tree structure
   */
  async refreshTree() {
    return this.scanner.scanDirectory()
  },

  /**
   * Get statistics about the docs directory
   * @returns {Promise<Object>} Directory statistics
   */
  async getStats() {
    return this.scanner.getStats()
  },

  // ============ File Organization Methods ============

  /**
   * Move a file or directory to a new location
   * @param {string} sourcePath - Source file/directory path
   * @param {string} targetDir - Target directory path
   * @returns {Promise<Object>} Move result
   */
  async moveItem(sourcePath, targetDir) {
    return this.scanner.moveItem(sourcePath, targetDir)
  },

  /**
   * List all directories within docs
   * @returns {Promise<Array>} List of directories
   */
  async listDirectories() {
    return this.scanner.listDirectories()
  },

  /**
   * Create a new directory
   * @param {string} dirPath - Path for new directory
   * @returns {Promise<Object>} Creation result
   */
  async createDirectory(dirPath) {
    return this.scanner.createDirectory(dirPath)
  },

  // ============ IPC Handlers ============

  async handleScanDirectory() {
    return this.scanDirectory()
  },

  async handleGetFileContent({ filePath }) {
    return this.getFileContent(filePath)
  },

  async handleRefreshTree() {
    return this.refreshTree()
  },

  async handleGetStats() {
    return this.getStats()
  },

  // File organization handlers
  async handleMoveItem({ sourcePath, targetDir }) {
    return this.moveItem(sourcePath, targetDir)
  },

  async handleListDirectories() {
    return this.listDirectories()
  },

  async handleCreateDirectory({ dirPath }) {
    return this.createDirectory(dirPath)
  }
}

module.exports = DocumentViewerPlugin
