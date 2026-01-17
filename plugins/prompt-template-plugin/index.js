/**
 * Prompt Template Plugin - Entry Point
 * Manages prompt templates for reuse in Claude interactions
 */

const fs = require('fs').promises
const path = require('path')
const crypto = require('crypto')

/**
 * Template data model
 * @typedef {Object} Template
 * @property {string} id - Unique identifier (UUID)
 * @property {string} title - Template title
 * @property {string} content - Template content
 * @property {string} lastEdited - ISO 8601 timestamp of last edit
 */

/** Storage file name within .puffin directory */
const STORAGE_FILE = 'prompt-templates.json'

/**
 * Default templates for new users
 * These are seeded on first plugin load when storage is empty
 * @type {Array<{title: string, content: string}>}
 */
const DEFAULT_TEMPLATES = [
  {
    title: 'Code Review Request',
    content: `Please review this code for potential issues, best practices, and improvements:

\`\`\`
[Paste your code here]
\`\`\`

Focus on:
- Code correctness and potential bugs
- Performance considerations
- Security vulnerabilities
- Readability and maintainability
- Adherence to best practices`
  },
  {
    title: 'Bug Fix Request',
    content: `I'm encountering a bug that I need help fixing.

**Current Behavior:**
[Describe what is happening]

**Expected Behavior:**
[Describe what should happen]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Relevant Code:**
\`\`\`
[Paste relevant code here]
\`\`\`

**Error Messages (if any):**
\`\`\`
[Paste error messages here]
\`\`\``
  },
  {
    title: 'Feature Implementation',
    content: `I need to implement a new feature with the following requirements:

**Feature Description:**
[Describe the feature]

**Requirements:**
- [Requirement 1]
- [Requirement 2]
- [Requirement 3]

**Technical Constraints:**
- [Any technical constraints or existing architecture to consider]

**Acceptance Criteria:**
- [Criteria 1]
- [Criteria 2]

Please suggest an implementation approach and provide the code.`
  },
  {
    title: 'Refactoring Request',
    content: `Please help me refactor this code to improve its quality.

**Current Code:**
\`\`\`
[Paste code to refactor]
\`\`\`

**Goals:**
- [ ] Improve readability
- [ ] Improve performance
- [ ] Reduce complexity
- [ ] Better separation of concerns
- [ ] Add proper error handling
- [ ] Other: [specify]

**Constraints:**
- [Any constraints on the refactoring, e.g., maintain backward compatibility]`
  },
  {
    title: 'Documentation Request',
    content: `Please write documentation for the following code:

\`\`\`
[Paste code to document]
\`\`\`

**Documentation Type:**
- [ ] JSDoc/TSDoc comments
- [ ] README section
- [ ] API documentation
- [ ] Usage examples
- [ ] Architecture overview

**Audience:**
[Who will read this documentation? e.g., other developers, API consumers, end users]

**Additional Context:**
[Any additional context about the code or project]`
  }
]

const PromptTemplatePlugin = {
  name: 'prompt-template-plugin',
  context: null,
  storagePath: null,

  /**
   * Activate the plugin
   * @param {Object} context - Plugin context provided by Puffin
   */
  async activate(context) {
    this.context = context

    // Determine storage path: .puffin/prompt-templates.json
    const projectPath = context.projectPath || process.cwd()
    this.storagePath = path.join(projectPath, '.puffin', STORAGE_FILE)

    // Register IPC handlers for renderer communication
    context.registerIpcHandler('getAll', this.getAllTemplates.bind(this))
    context.registerIpcHandler('save', this.saveTemplate.bind(this))
    context.registerIpcHandler('delete', this.deleteTemplate.bind(this))

    // Seed default templates if storage is empty
    await this._seedDefaultTemplates()

    context.log.info('Prompt Template plugin activated')
    context.log.info(`Storage path: ${this.storagePath}`)
  },

  /**
   * Deactivate the plugin (cleanup)
   */
  async deactivate() {
    this.context.log.info('Prompt Template plugin deactivated')
    this.context = null
    this.storagePath = null
  },

  /**
   * Generate a unique ID for a new template
   * @returns {string} UUID string
   */
  generateId() {
    return crypto.randomUUID()
  },

  /**
   * Seed default templates on first load when storage is empty
   * @private
   */
  async _seedDefaultTemplates() {
    try {
      const existingTemplates = await this._readStorage()

      // Only seed if storage is empty (file doesn't exist or contains no templates)
      if (existingTemplates.length > 0) {
        this.context.log.info(`Found ${existingTemplates.length} existing templates, skipping seed`)
        return
      }

      const now = new Date().toISOString()
      const seededTemplates = DEFAULT_TEMPLATES.map(template => ({
        id: this.generateId(),
        title: template.title,
        content: template.content,
        lastEdited: now
      }))

      await this._writeStorage(seededTemplates)
      this.context.log.info(`Seeded ${seededTemplates.length} default templates`)
    } catch (error) {
      // Don't fail plugin activation if seeding fails
      this.context.log.error(`Failed to seed default templates: ${error.message}`)
    }
  },

  /**
   * Read templates from storage file
   * @returns {Promise<Template[]>} Array of templates, empty array if file not found
   * @private
   */
  async _readStorage() {
    try {
      const data = await fs.readFile(this.storagePath, 'utf8')
      const parsed = JSON.parse(data)
      // Ensure we return an array
      return Array.isArray(parsed) ? parsed : []
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty array (graceful handling)
        return []
      }
      this.context.log.error(`Failed to read templates: ${error.message}`)
      throw error
    }
  },

  /**
   * Write templates to storage file
   * Uses atomic write pattern (write to temp, then rename)
   * @param {Template[]} templates - Array of templates to save
   * @private
   */
  async _writeStorage(templates) {
    const tempPath = `${this.storagePath}.tmp`

    try {
      // Ensure .puffin directory exists
      const dir = path.dirname(this.storagePath)
      await fs.mkdir(dir, { recursive: true })

      // Write to temp file first for atomic operation
      await fs.writeFile(tempPath, JSON.stringify(templates, null, 2), 'utf8')

      // Rename temp to actual file (atomic on most filesystems)
      try {
        await fs.rename(tempPath, this.storagePath)
      } catch (renameError) {
        // Clean up temp file on rename failure
        try {
          await fs.unlink(tempPath)
        } catch {
          // Ignore cleanup errors - best effort
        }
        throw renameError
      }
    } catch (error) {
      this.context.log.error(`Failed to write templates: ${error.message}`)
      throw error
    }
  },

  /**
   * Get all templates
   * @returns {Promise<Template[]>} Array of template objects
   */
  async getAllTemplates() {
    try {
      const templates = await this._readStorage()
      return templates
    } catch (error) {
      this.context.log.error(`getAllTemplates failed: ${error.message}`)
      return []
    }
  },

  /**
   * Save a template (create or update)
   * @param {Object} template - Template object with optional id, title, content
   * @returns {Promise<Template>} Saved template with id and lastEdited
   * @throws {Error} If input validation fails
   */
  async saveTemplate(template) {
    // Input validation
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      throw new Error('Invalid template data: expected an object')
    }

    // Validate and sanitize fields
    const id = typeof template.id === 'string' ? template.id.trim() : null
    const title = typeof template.title === 'string' ? template.title : ''
    const content = typeof template.content === 'string' ? template.content : ''

    // Enforce maximum lengths to prevent abuse
    const MAX_TITLE_LENGTH = 500
    const MAX_CONTENT_LENGTH = 100000

    if (title.length > MAX_TITLE_LENGTH) {
      throw new Error(`Title exceeds maximum length of ${MAX_TITLE_LENGTH} characters`)
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      throw new Error(`Content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`)
    }

    const templates = await this._readStorage()
    const now = new Date().toISOString()

    let savedTemplate

    if (id) {
      // Update existing template
      const index = templates.findIndex(t => t.id === id)
      if (index !== -1) {
        savedTemplate = {
          id: id,
          title: title || templates[index].title,
          content: content !== '' ? content : templates[index].content,
          lastEdited: now
        }
        templates[index] = savedTemplate
      } else {
        // ID provided but not found - treat as new template with that ID
        savedTemplate = {
          id: id,
          title: title,
          content: content,
          lastEdited: now
        }
        templates.push(savedTemplate)
      }
    } else {
      // Create new template with auto-generated ID
      savedTemplate = {
        id: this.generateId(),
        title: title,
        content: content,
        lastEdited: now
      }
      templates.push(savedTemplate)
    }

    await this._writeStorage(templates)
    this.context.log.info(`Template saved: ${savedTemplate.id}`)

    return savedTemplate
  },

  /**
   * Delete a template by ID
   * @param {string} id - Template ID to delete
   * @returns {Promise<boolean>} True if deleted successfully
   * @throws {Error} If input validation fails
   */
  async deleteTemplate(id) {
    // Input validation
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('Invalid template ID: expected a non-empty string')
    }

    const sanitizedId = id.trim()
    const templates = await this._readStorage()
    const initialLength = templates.length
    const filteredTemplates = templates.filter(t => t.id !== sanitizedId)

    if (filteredTemplates.length === initialLength) {
      // Template not found
      this.context.log.warn(`Template not found for deletion: ${sanitizedId}`)
      return false
    }

    await this._writeStorage(filteredTemplates)
    this.context.log.info(`Template deleted: ${sanitizedId}`)

    return true
  }
}

module.exports = PromptTemplatePlugin
