/**
 * Claude Config Plugin - Entry Point
 *
 * Manages CLAUDE_{context}.md configuration files in .claude/ directory.
 * Provides viewing, editing, section management, and prompt-based update capabilities.
 */

const { ClaudeConfig } = require('./claude-config')
const { parseSections, getSection, updateSection, listSections, generateDiff, formatDiff } = require('./section-parser')
const { proposeChange, applyChange, parseIntent } = require('./change-proposer')

const ClaudeConfigPlugin = {
  context: null,
  config: null,
  unwatchConfig: null,

  /**
   * Activate the plugin
   * @param {Object} context - Plugin context from PluginManager
   */
  async activate(context) {
    this.context = context

    // Initialize config service with project path
    const projectPath = context.projectPath
    if (!projectPath) {
      throw new Error('Claude Config plugin requires projectPath in context')
    }

    this.config = new ClaudeConfig(projectPath, context.log)

    // Register IPC handlers for renderer communication
    context.registerIpcHandler('getConfig', this.handleGetConfig.bind(this))
    context.registerIpcHandler('getConfigWithContext', this.handleGetConfigWithContext.bind(this))
    context.registerIpcHandler('updateConfig', this.handleUpdateConfig.bind(this))
    context.registerIpcHandler('getMetadata', this.handleGetMetadata.bind(this))

    // Context file management handlers
    context.registerIpcHandler('listContextFiles', this.handleListContextFiles.bind(this))
    context.registerIpcHandler('selectContext', this.handleSelectContext.bind(this))

    // Section management handlers
    context.registerIpcHandler('listSections', this.handleListSections.bind(this))
    context.registerIpcHandler('getSection', this.handleGetSection.bind(this))
    context.registerIpcHandler('updateSection', this.handleUpdateSection.bind(this))

    // Prompt-based update handlers
    context.registerIpcHandler('proposeChange', this.handleProposeChange.bind(this))
    context.registerIpcHandler('applyProposedChange', this.handleApplyProposedChange.bind(this))

    // Register actions for programmatic access
    context.registerAction('getConfig', this.getConfig.bind(this))
    context.registerAction('getConfigWithContext', this.getConfigWithContext.bind(this))
    context.registerAction('updateConfig', this.updateConfig.bind(this))
    context.registerAction('getMetadata', this.getMetadata.bind(this))
    context.registerAction('listContextFiles', this.listContextFiles.bind(this))
    context.registerAction('selectContext', this.selectContext.bind(this))
    context.registerAction('listSections', this.listSections.bind(this))
    context.registerAction('proposeChange', this.proposeChange.bind(this))
    context.registerAction('applyProposedChange', this.applyProposedChange.bind(this))
    context.registerAction('getBranchFocus', this.getBranchFocus.bind(this))

    // Set up file watcher for live updates
    try {
      this.unwatchConfig = await this.config.watchConfig((eventType, filePath) => {
        context.log.debug(`Context file changed: ${eventType} at ${filePath}`)
        context.emit('claude-config:changed', { eventType, filePath })
      })
    } catch (err) {
      context.log.warn(`Failed to set up file watcher: ${err.message}`)
    }

    context.log.info('Claude Config plugin activated')
    context.log.debug(`Project path: ${projectPath}`)
  },

  /**
   * Deactivate the plugin
   */
  async deactivate() {
    // Stop file watcher
    if (this.unwatchConfig) {
      this.unwatchConfig()
      this.unwatchConfig = null
    }

    this.config = null
    this.context.log.info('Claude Config plugin deactivated')
  },

  // ============ Core API Methods ============

  /**
   * Get the CLAUDE.md content
   * @param {Object} [options] - Read options
   * @param {boolean} [options.useCache=false] - Use cached content
   * @returns {Promise<{content: string, path: string, exists: boolean}>}
   */
  async getConfig(options = {}) {
    return this.config.readConfig(options)
  },

  /**
   * Get the CLAUDE.md content with full context (branch info, source detection)
   * @param {Object} [options] - Read options
   * @returns {Promise<Object>} Config with branch context
   */
  async getConfigWithContext(options = {}) {
    return this.config.getConfigWithContext(options)
  },

  /**
   * Update the CLAUDE.md content
   * @param {string} content - New content
   * @param {Object} [options] - Write options
   * @returns {Promise<{path: string, created: boolean}>}
   */
  async updateConfig(content, options = {}) {
    const result = await this.config.writeConfig(content, options)

    // Emit event to notify listeners (e.g., ClaudeService) of the update
    const contextName = this.config.getSelectedContext()
    this.context.emit('branch-focus-updated', {
      branchId: contextName,
      content,
      path: result.path,
      source: 'updateConfig'
    })

    return result
  },

  /**
   * Get context file metadata
   * @returns {Promise<Object>}
   */
  async getMetadata() {
    return this.config.getConfigMetadata()
  },

  // ============ Context File Management Methods ============

  /**
   * List all available context files in .claude/ directory
   * @returns {Promise<Array>} List of context files
   */
  async listContextFiles() {
    return this.config.listContextFiles()
  },

  /**
   * Select a context file to work with
   * @param {string} contextName - Name of context to select
   * @returns {Promise<Object>} The selected context's config
   */
  async selectContext(contextName) {
    this.config.setSelectedContext(contextName)
    return this.config.readConfig()
  },

  // ============ Section Management Methods ============

  /**
   * List all sections in the CLAUDE.md file
   * @returns {Promise<Array>}
   */
  async listSections() {
    const { content } = await this.config.readConfig()
    return listSections(content)
  },

  /**
   * Get a specific section's content
   * @param {string} sectionName - Name of section to retrieve
   * @returns {Promise<Object|null>}
   */
  async getSectionContent(sectionName) {
    const { content } = await this.config.readConfig()
    return getSection(content, sectionName)
  },

  /**
   * Update a specific section
   * @param {string} sectionName - Name of section to update
   * @param {string} newContent - New content for the section
   * @returns {Promise<{updated: boolean, path: string}>}
   */
  async updateSectionContent(sectionName, newContent) {
    const { content, path } = await this.config.readConfig()
    const result = updateSection(content, sectionName, newContent)

    if (result.updated) {
      await this.config.writeConfig(result.content)

      // Emit event if Branch Focus section was updated
      if (sectionName.toLowerCase().includes('branch focus')) {
        const contextName = this.config.getSelectedContext()
        this.context.emit('branch-focus-updated', {
          branchId: contextName,
          sectionName,
          content: newContent,
          path,
          source: 'updateSection'
        })
      }

      return { updated: true, path }
    }

    return { updated: false, path }
  },

  // ============ Prompt-Based Update Methods ============

  /**
   * Propose a change based on natural language prompt
   * @param {string} prompt - User's natural language request
   * @returns {Promise<Object>} Proposal with diff
   */
  async proposeChange(prompt) {
    const { content } = await this.config.readConfig()
    return proposeChange(prompt, content)
  },

  /**
   * Apply a proposed change
   * @param {string} proposedContent - The proposed content to apply
   * @returns {Promise<{applied: boolean, path: string}>}
   */
  async applyProposedChange(proposedContent) {
    if (!proposedContent) {
      return { applied: false, path: null }
    }

    const result = await this.config.writeConfig(proposedContent)
    return { applied: true, path: result.path }
  },

  // ============ Branch Focus Methods ============

  /**
   * Get the branch focus content for a specific branch
   * @param {string} branchId - The branch identifier
   * @param {Object} [options] - Options
   * @param {boolean} [options.codeModificationAllowed=true] - For custom branches
   * @returns {Promise<{focus: string|null, source: string, branchId: string}>}
   */
  async getBranchFocus(branchId, options = {}) {
    return this.config.getBranchFocus(branchId, options)
  },

  // ============ IPC Handlers ============
  // These wrap the core methods for IPC communication
  // Note: PluginContext.registerIpcHandler() adds its own error handling wrapper

  async handleGetConfig(options) {
    return this.getConfig(options)
  },

  async handleGetConfigWithContext(options) {
    return this.getConfigWithContext(options)
  },

  async handleUpdateConfig({ content, options }) {
    return this.updateConfig(content, options)
  },

  async handleGetMetadata() {
    return this.getMetadata()
  },

  // Context file management handlers
  async handleListContextFiles() {
    return this.listContextFiles()
  },

  async handleSelectContext({ contextName }) {
    return this.selectContext(contextName)
  },

  // Section management handlers
  async handleListSections() {
    return this.listSections()
  },

  async handleGetSection({ sectionName }) {
    return this.getSectionContent(sectionName)
  },

  async handleUpdateSection({ sectionName, content }) {
    return this.updateSectionContent(sectionName, content)
  },

  // Prompt-based update handlers
  async handleProposeChange({ prompt }) {
    return this.proposeChange(prompt)
  },

  async handleApplyProposedChange({ proposedContent }) {
    return this.applyProposedChange(proposedContent)
  }
}

module.exports = ClaudeConfigPlugin
