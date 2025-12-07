/**
 * Puffin State Manager
 *
 * Manages the .puffin/ directory within a target project.
 * All state is persisted automatically - no explicit save/load needed.
 *
 * Directory structure:
 *   .puffin/
 *   ├── config.json       # Project configuration & options
 *   ├── history.json      # Prompt history & branches
 *   ├── architecture.md   # Architecture document
 *   └── gui-designs/      # Saved GUI design exports
 */

const fs = require('fs').promises
const path = require('path')

const PUFFIN_DIR = '.puffin'
const CONFIG_FILE = 'config.json'
const HISTORY_FILE = 'history.json'
const ARCHITECTURE_FILE = 'architecture.md'
const GUI_DESIGNS_DIR = 'gui-designs'
const GUI_DEFINITIONS_DIR = 'gui-definitions'

class PuffinState {
  constructor() {
    this.projectPath = null
    this.puffinPath = null
    this.config = null
    this.history = null
    this.architecture = null
  }

  /**
   * Open a project directory
   * Creates .puffin/ if it doesn't exist
   * @param {string} projectPath - Path to the project directory
   */
  async open(projectPath) {
    this.projectPath = projectPath
    this.puffinPath = path.join(projectPath, PUFFIN_DIR)

    // Ensure .puffin directory exists
    await this.ensureDirectory(this.puffinPath)
    await this.ensureDirectory(path.join(this.puffinPath, GUI_DESIGNS_DIR))
    await this.ensureDirectory(path.join(this.puffinPath, GUI_DEFINITIONS_DIR))

    // Load or initialize state
    this.config = await this.loadConfig()
    this.history = await this.loadHistory()
    this.architecture = await this.loadArchitecture()

    return this.getState()
  }

  /**
   * Get the current state
   */
  getState() {
    return {
      projectPath: this.projectPath,
      projectName: path.basename(this.projectPath),
      config: this.config,
      history: this.history,
      architecture: this.architecture
    }
  }

  /**
   * Update configuration
   * @param {Object} updates - Partial config updates
   */
  async updateConfig(updates) {
    this.config = {
      ...this.config,
      ...updates,
      updatedAt: new Date().toISOString()
    }
    await this.saveConfig()
    return this.config
  }

  /**
   * Update history (branches and prompts)
   * @param {Object} history - Full history object
   */
  async updateHistory(history) {
    this.history = {
      ...history,
      updatedAt: new Date().toISOString()
    }
    await this.saveHistory()
    return this.history
  }

  /**
   * Add a prompt to history
   * @param {string} branchId - Branch to add prompt to
   * @param {Object} prompt - Prompt object
   */
  async addPrompt(branchId, prompt) {
    if (!this.history.branches[branchId]) {
      this.history.branches[branchId] = {
        id: branchId,
        name: branchId.charAt(0).toUpperCase() + branchId.slice(1),
        prompts: []
      }
    }

    this.history.branches[branchId].prompts.push({
      ...prompt,
      id: prompt.id || this.generateId(),
      timestamp: prompt.timestamp || new Date().toISOString()
    })

    this.history.updatedAt = new Date().toISOString()
    await this.saveHistory()
    return this.history
  }

  /**
   * Update a prompt's response
   * @param {string} branchId - Branch containing the prompt
   * @param {string} promptId - Prompt to update
   * @param {Object} response - Response data
   */
  async updatePromptResponse(branchId, promptId, response) {
    const branch = this.history.branches[branchId]
    if (!branch) return null

    const prompt = branch.prompts.find(p => p.id === promptId)
    if (!prompt) return null

    prompt.response = {
      ...response,
      timestamp: new Date().toISOString()
    }

    this.history.updatedAt = new Date().toISOString()
    await this.saveHistory()
    return this.history
  }

  /**
   * Update architecture document
   * @param {string} content - Markdown content
   */
  async updateArchitecture(content) {
    this.architecture = {
      content,
      updatedAt: new Date().toISOString()
    }
    await this.saveArchitecture()
    return this.architecture
  }

  /**
   * Save a GUI design
   * @param {string} name - Design name
   * @param {Object} design - Design data
   */
  async saveGuiDesign(name, design) {
    const filename = `${this.sanitizeFilename(name)}.json`
    const filepath = path.join(this.puffinPath, GUI_DESIGNS_DIR, filename)
    await fs.writeFile(filepath, JSON.stringify(design, null, 2), 'utf-8')
    return filename
  }

  /**
   * List GUI designs
   */
  async listGuiDesigns() {
    const dirPath = path.join(this.puffinPath, GUI_DESIGNS_DIR)
    try {
      const files = await fs.readdir(dirPath)
      return files.filter(f => f.endsWith('.json'))
    } catch {
      return []
    }
  }

  /**
   * Load a GUI design
   * @param {string} filename - Design filename
   */
  async loadGuiDesign(filename) {
    const filepath = path.join(this.puffinPath, GUI_DESIGNS_DIR, filename)
    const content = await fs.readFile(filepath, 'utf-8')
    return JSON.parse(content)
  }

  /**
   * Save a GUI definition with metadata
   * @param {string} name - Definition name
   * @param {string} description - Optional description
   * @param {Array} elements - GUI elements array
   */
  async saveGuiDefinition(name, description, elements) {
    const definition = {
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
    const filepath = path.join(this.puffinPath, GUI_DEFINITIONS_DIR, filename)
    await fs.writeFile(filepath, JSON.stringify(definition, null, 2), 'utf-8')
    return { filename, definition }
  }

  /**
   * List GUI definitions with metadata
   */
  async listGuiDefinitions() {
    const dirPath = path.join(this.puffinPath, GUI_DEFINITIONS_DIR)
    try {
      const files = await fs.readdir(dirPath)
      const jsonFiles = files.filter(f => f.endsWith('.json'))

      const definitions = await Promise.all(
        jsonFiles.map(async (filename) => {
          try {
            const filepath = path.join(dirPath, filename)
            const content = await fs.readFile(filepath, 'utf-8')
            const definition = JSON.parse(content)
            return {
              filename,
              ...definition
            }
          } catch (error) {
            // Skip corrupted files
            return null
          }
        })
      )

      return definitions.filter(def => def !== null)
    } catch {
      return []
    }
  }

  /**
   * Load a GUI definition
   * @param {string} filename - Definition filename
   */
  async loadGuiDefinition(filename) {
    const filepath = path.join(this.puffinPath, GUI_DEFINITIONS_DIR, filename)
    const content = await fs.readFile(filepath, 'utf-8')
    return JSON.parse(content)
  }

  /**
   * Update a GUI definition
   * @param {string} filename - Definition filename
   * @param {Object} updates - Partial updates to apply
   */
  async updateGuiDefinition(filename, updates) {
    const definition = await this.loadGuiDefinition(filename)
    const updatedDefinition = {
      ...definition,
      ...updates,
      metadata: {
        ...definition.metadata,
        lastModified: new Date().toISOString()
      }
    }

    const filepath = path.join(this.puffinPath, GUI_DEFINITIONS_DIR, filename)
    await fs.writeFile(filepath, JSON.stringify(updatedDefinition, null, 2), 'utf-8')
    return updatedDefinition
  }

  /**
   * Delete a GUI definition
   * @param {string} filename - Definition filename
   */
  async deleteGuiDefinition(filename) {
    const filepath = path.join(this.puffinPath, GUI_DEFINITIONS_DIR, filename)
    await fs.unlink(filepath)
    return true
  }

  // ============ Private Methods ============

  /**
   * Load config or create default
   * @private
   */
  async loadConfig() {
    const configPath = path.join(this.puffinPath, CONFIG_FILE)
    try {
      const content = await fs.readFile(configPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      // Create default config
      const defaultConfig = {
        name: path.basename(this.projectPath),
        description: '',
        assumptions: [],
        technicalArchitecture: '',
        dataModel: '',
        options: {
          programmingStyle: 'HYBRID',
          testingApproach: 'TDD',
          documentationLevel: 'STANDARD',
          errorHandling: 'EXCEPTIONS',
          codeStyle: {
            naming: 'CAMEL',
            comments: 'JSDoc'
          }
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await this.saveConfig(defaultConfig)
      return defaultConfig
    }
  }

  /**
   * Save config
   * @private
   */
  async saveConfig(config = this.config) {
    const configPath = path.join(this.puffinPath, CONFIG_FILE)
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  /**
   * Load history or create default
   * @private
   */
  async loadHistory() {
    const historyPath = path.join(this.puffinPath, HISTORY_FILE)
    try {
      const content = await fs.readFile(historyPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      // Create default history with standard branches
      const defaultHistory = {
        branches: {
          specifications: { id: 'specifications', name: 'Specifications', prompts: [] },
          architecture: { id: 'architecture', name: 'Architecture', prompts: [] },
          ui: { id: 'ui', name: 'UI', prompts: [] },
          backend: { id: 'backend', name: 'Backend', prompts: [] },
          deployment: { id: 'deployment', name: 'Deployment', prompts: [] },
          tmp: { id: 'tmp', name: 'Tmp', prompts: [] }
        },
        activeBranch: 'specifications',
        activePromptId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await this.saveHistory(defaultHistory)
      return defaultHistory
    }
  }

  /**
   * Save history
   * @private
   */
  async saveHistory(history = this.history) {
    const historyPath = path.join(this.puffinPath, HISTORY_FILE)
    await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8')
  }

  /**
   * Load architecture or create default
   * @private
   */
  async loadArchitecture() {
    const archPath = path.join(this.puffinPath, ARCHITECTURE_FILE)
    try {
      const content = await fs.readFile(archPath, 'utf-8')
      return {
        content,
        updatedAt: (await fs.stat(archPath)).mtime.toISOString()
      }
    } catch {
      // Create default architecture template
      const defaultContent = `# ${path.basename(this.projectPath)} Architecture

## Overview

Describe the overall system architecture...

## Components

List and describe the main components...

## Data Flow

Explain how data flows through the system...

## APIs

Document your API endpoints...

## Technology Stack

- Frontend:
- Backend:
- Database:
- Infrastructure:
`
      await this.saveArchitecture({ content: defaultContent })
      return {
        content: defaultContent,
        updatedAt: new Date().toISOString()
      }
    }
  }

  /**
   * Save architecture
   * @private
   */
  async saveArchitecture(arch = this.architecture) {
    const archPath = path.join(this.puffinPath, ARCHITECTURE_FILE)
    await fs.writeFile(archPath, arch.content, 'utf-8')
  }

  /**
   * Ensure directory exists
   * @private
   */
  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true })
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    }
  }

  /**
   * Generate a unique ID
   * @private
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
  }

  /**
   * Sanitize filename
   * @private
   */
  sanitizeFilename(name) {
    return name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
  }

  /**
   * Check if a directory has .puffin/ initialized
   * @static
   */
  static async isPuffinProject(dirPath) {
    try {
      await fs.access(path.join(dirPath, PUFFIN_DIR))
      return true
    } catch {
      return false
    }
  }
}

module.exports = { PuffinState }
