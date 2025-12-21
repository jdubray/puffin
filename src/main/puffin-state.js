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
const USER_STORIES_FILE = 'user-stories.json'
const ACTIVE_SPRINT_FILE = 'active-sprint.json'
const STORY_GENERATIONS_FILE = 'story-generations.json'
const GIT_OPERATIONS_FILE = 'git-operations.json'
const GUI_DESIGNS_DIR = 'gui-designs'
const GUI_DEFINITIONS_DIR = 'gui-definitions'
const UI_GUIDELINES_FILE = 'ui-guidelines.json'
const STYLESHEETS_DIR = 'stylesheets'

class PuffinState {
  constructor() {
    this.projectPath = null
    this.puffinPath = null
    this.config = null
    this.history = null
    this.architecture = null
    this.userStories = null
    this.storyGenerations = null
    this.uiGuidelines = null
    this.gitOperations = null
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
    await this.ensureDirectory(path.join(this.puffinPath, STYLESHEETS_DIR))

    // Load or initialize state
    this.config = await this.loadConfig()
    this.history = await this.loadHistory()
    this.architecture = await this.loadArchitecture()
    this.userStories = await this.loadUserStories()
    this.activeSprint = await this.loadActiveSprint()
    this.storyGenerations = await this.loadStoryGenerations()
    this.uiGuidelines = await this.loadUiGuidelines()
    this.gitOperations = await this.loadGitOperations()

    // Auto-archive completed stories older than 2 weeks
    await this.autoArchiveOldStories()

    return this.getState()
  }

  /**
   * Auto-archive completed stories that are older than 2 weeks
   * @private
   */
  async autoArchiveOldStories() {
    const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000
    const now = Date.now()
    let archiveCount = 0

    for (const story of this.userStories) {
      if (story.status === 'completed' && story.updatedAt) {
        const updatedAt = new Date(story.updatedAt).getTime()
        if (now - updatedAt > TWO_WEEKS_MS) {
          story.status = 'archived'
          story.archivedAt = new Date().toISOString()
          archiveCount++
        }
      }
    }

    if (archiveCount > 0) {
      console.log(`[PUFFIN-STATE] Auto-archived ${archiveCount} completed stories older than 2 weeks`)
      await this.saveUserStories()
    }
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
      architecture: this.architecture,
      userStories: this.userStories,
      activeSprint: this.activeSprint,
      storyGenerations: this.storyGenerations,
      uiGuidelines: this.uiGuidelines,
      gitOperations: this.gitOperations
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
   * Add a user story
   * @param {Object} story - User story object
   */
  async addUserStory(story) {
    const newStory = {
      id: story.id || this.generateId(),
      branchId: story.branchId || null, // Branch where story was derived from
      title: story.title,
      description: story.description || '',
      acceptanceCriteria: story.acceptanceCriteria || [],
      status: story.status || 'pending',
      implementedOn: story.implementedOn || [], // Branches where this story has been implemented
      sourcePromptId: story.sourcePromptId || null,
      createdAt: story.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.userStories.push(newStory)
    await this.saveUserStories()
    return newStory
  }

  /**
   * Update a user story
   * @param {string} storyId - Story ID
   * @param {Object} updates - Partial updates
   */
  async updateUserStory(storyId, updates) {
    const index = this.userStories.findIndex(s => s.id === storyId)
    if (index === -1) return null

    this.userStories[index] = {
      ...this.userStories[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    await this.saveUserStories()
    return this.userStories[index]
  }

  /**
   * Delete a user story
   * @param {string} storyId - Story ID
   */
  async deleteUserStory(storyId) {
    const index = this.userStories.findIndex(s => s.id === storyId)
    if (index === -1) return false

    this.userStories.splice(index, 1)
    await this.saveUserStories()
    return true
  }

  /**
   * Get all user stories
   */
  getUserStories() {
    return this.userStories
  }

  // ============ Story Generation Tracking Methods ============

  /**
   * Get all story generations
   */
  getStoryGenerations() {
    return this.storyGenerations
  }

  /**
   * Add a story generation record
   * @param {Object} generation - Story generation object
   */
  async addStoryGeneration(generation) {
    const newGeneration = {
      id: generation.id || this.generateId(),
      user_prompt: generation.user_prompt,
      project_context: generation.project_context || null,
      generated_stories: (generation.generated_stories || []).map(story => ({
        id: story.id || this.generateId(),
        title: story.title,
        description: story.description || '',
        acceptance_criteria: story.acceptance_criteria || [],
        user_action: story.user_action || 'pending',
        modification_diff: story.modification_diff || null,
        rejection_reason: story.rejection_reason || null,
        backlog_story_id: story.backlog_story_id || null
      })),
      timestamp: generation.timestamp || new Date().toISOString(),
      model_used: generation.model_used || 'sonnet'
    }
    this.storyGenerations.generations.push(newGeneration)
    await this.saveStoryGenerations()
    return newGeneration
  }

  /**
   * Update a story generation record
   * @param {string} generationId - Generation ID
   * @param {Object} updates - Partial updates
   */
  async updateStoryGeneration(generationId, updates) {
    const index = this.storyGenerations.generations.findIndex(g => g.id === generationId)
    if (index === -1) return null

    this.storyGenerations.generations[index] = {
      ...this.storyGenerations.generations[index],
      ...updates
    }
    await this.saveStoryGenerations()
    return this.storyGenerations.generations[index]
  }

  /**
   * Update a generated story's feedback within a generation
   * @param {string} generationId - Generation ID
   * @param {string} storyId - Story ID within the generation
   * @param {Object} feedback - Feedback updates (user_action, modification_diff, rejection_reason, etc.)
   */
  async updateGeneratedStoryFeedback(generationId, storyId, feedback) {
    const generation = this.storyGenerations.generations.find(g => g.id === generationId)
    if (!generation) return null

    const story = generation.generated_stories.find(s => s.id === storyId)
    if (!story) return null

    Object.assign(story, feedback)
    await this.saveStoryGenerations()
    return story
  }

  /**
   * Add an implementation journey
   * @param {Object} journey - Implementation journey object
   */
  async addImplementationJourney(journey) {
    const newJourney = {
      id: journey.id || this.generateId(),
      story_id: journey.story_id,
      prompt_id: journey.prompt_id,
      turn_count: journey.turn_count || 0,
      inputs: journey.inputs || [],
      status: journey.status || 'pending',
      outcome_notes: journey.outcome_notes || null,
      started_at: journey.started_at || new Date().toISOString(),
      completed_at: journey.completed_at || null
    }
    this.storyGenerations.implementation_journeys.push(newJourney)
    await this.saveStoryGenerations()
    return newJourney
  }

  /**
   * Update an implementation journey
   * @param {string} journeyId - Journey ID
   * @param {Object} updates - Partial updates
   */
  async updateImplementationJourney(journeyId, updates) {
    const index = this.storyGenerations.implementation_journeys.findIndex(j => j.id === journeyId)
    if (index === -1) return null

    this.storyGenerations.implementation_journeys[index] = {
      ...this.storyGenerations.implementation_journeys[index],
      ...updates
    }
    await this.saveStoryGenerations()
    return this.storyGenerations.implementation_journeys[index]
  }

  /**
   * Add an input to an implementation journey
   * @param {string} journeyId - Journey ID
   * @param {Object} input - Input object with turn_number, type, content_summary
   */
  async addImplementationInput(journeyId, input) {
    const journey = this.storyGenerations.implementation_journeys.find(j => j.id === journeyId)
    if (!journey) return null

    journey.inputs.push({
      turn_number: input.turn_number,
      type: input.type || 'technical',
      content_summary: input.content_summary || '',
      timestamp: new Date().toISOString()
    })
    await this.saveStoryGenerations()
    return journey
  }

  /**
   * Export story generations data for analysis
   */
  exportStoryGenerations() {
    return JSON.stringify(this.storyGenerations, null, 2)
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
    this.validateFilename(filename)
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
    this.validateFilename(filename)
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
    this.validateFilename(filename)
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
    this.validateFilename(filename)
    const filepath = path.join(this.puffinPath, GUI_DEFINITIONS_DIR, filename)
    await fs.unlink(filepath)
    return true
  }

  /**
   * Update UI guidelines
   * @param {Object} updates - Partial guidelines updates
   */
  async updateUiGuidelines(updates) {
    this.uiGuidelines = {
      ...this.uiGuidelines,
      ...updates,
      updatedAt: new Date().toISOString()
    }
    await this.saveUiGuidelines()
    return this.uiGuidelines
  }

  /**
   * Update a specific guideline section
   * @param {string} section - Guidelines section (layout, typography, colors, etc.)
   * @param {string} content - Markdown content
   */
  async updateGuidelineSection(section, content) {
    this.uiGuidelines.guidelines[section] = content
    this.uiGuidelines.updatedAt = new Date().toISOString()
    await this.saveUiGuidelines()
    return this.uiGuidelines
  }

  /**
   * Add a stylesheet
   * @param {Object} stylesheet - Stylesheet object
   */
  async addStylesheet(stylesheet) {
    const newStylesheet = {
      id: stylesheet.id || this.generateId(),
      name: stylesheet.name,
      content: stylesheet.content || '',
      enabled: stylesheet.enabled !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.uiGuidelines.stylesheets.push(newStylesheet)
    await this.saveUiGuidelines()
    return newStylesheet
  }

  /**
   * Update a stylesheet
   * @param {string} stylesheetId - Stylesheet ID
   * @param {Object} updates - Partial updates
   */
  async updateStylesheet(stylesheetId, updates) {
    const index = this.uiGuidelines.stylesheets.findIndex(s => s.id === stylesheetId)
    if (index === -1) return null

    this.uiGuidelines.stylesheets[index] = {
      ...this.uiGuidelines.stylesheets[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    this.uiGuidelines.updatedAt = new Date().toISOString()
    await this.saveUiGuidelines()
    return this.uiGuidelines.stylesheets[index]
  }

  /**
   * Delete a stylesheet
   * @param {string} stylesheetId - Stylesheet ID
   */
  async deleteStylesheet(stylesheetId) {
    const index = this.uiGuidelines.stylesheets.findIndex(s => s.id === stylesheetId)
    if (index === -1) return false

    this.uiGuidelines.stylesheets.splice(index, 1)
    this.uiGuidelines.updatedAt = new Date().toISOString()
    await this.saveUiGuidelines()
    return true
  }

  /**
   * Update design tokens
   * @param {Object} tokenUpdates - Design token updates
   */
  async updateDesignTokens(tokenUpdates) {
    this.uiGuidelines.designTokens = {
      ...this.uiGuidelines.designTokens,
      ...tokenUpdates
    }
    this.uiGuidelines.updatedAt = new Date().toISOString()
    await this.saveUiGuidelines()
    return this.uiGuidelines.designTokens
  }

  /**
   * Add a component pattern
   * @param {Object} pattern - Component pattern object
   */
  async addComponentPattern(pattern) {
    const newPattern = {
      id: pattern.id || this.generateId(),
      name: pattern.name,
      description: pattern.description || '',
      htmlTemplate: pattern.htmlTemplate || '',
      cssRules: pattern.cssRules || '',
      guidelines: pattern.guidelines || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.uiGuidelines.componentPatterns.push(newPattern)
    await this.saveUiGuidelines()
    return newPattern
  }

  /**
   * Update a component pattern
   * @param {string} patternId - Pattern ID
   * @param {Object} updates - Partial updates
   */
  async updateComponentPattern(patternId, updates) {
    const index = this.uiGuidelines.componentPatterns.findIndex(p => p.id === patternId)
    if (index === -1) return null

    this.uiGuidelines.componentPatterns[index] = {
      ...this.uiGuidelines.componentPatterns[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    this.uiGuidelines.updatedAt = new Date().toISOString()
    await this.saveUiGuidelines()
    return this.uiGuidelines.componentPatterns[index]
  }

  /**
   * Delete a component pattern
   * @param {string} patternId - Pattern ID
   */
  async deleteComponentPattern(patternId) {
    const index = this.uiGuidelines.componentPatterns.findIndex(p => p.id === patternId)
    if (index === -1) return false

    this.uiGuidelines.componentPatterns.splice(index, 1)
    this.uiGuidelines.updatedAt = new Date().toISOString()
    await this.saveUiGuidelines()
    return true
  }

  /**
   * Export UI guidelines and stylesheets for 3CLI integration
   * @param {Object} options - Export options
   */
  async exportUiGuidelines(options = {}) {
    const {
      includeGuidelines = true,
      includeStylesheets = true,
      includeTokens = true,
      includePatterns = true,
      format = 'markdown'
    } = options

    let output = ''

    if (includeGuidelines && format === 'markdown') {
      output += '## UI Guidelines\n\n'

      const sections = ['layout', 'typography', 'colors', 'components', 'interactions']
      for (const section of sections) {
        const content = this.uiGuidelines.guidelines[section]
        if (content && content.trim()) {
          const sectionName = section.charAt(0).toUpperCase() + section.slice(1)
          output += `### ${sectionName} Guidelines\n${content}\n\n`
        }
      }
    }

    if (includeStylesheets && format === 'markdown') {
      const enabledStylesheets = this.uiGuidelines.stylesheets.filter(s => s.enabled)
      if (enabledStylesheets.length > 0) {
        output += '## Stylesheets\n\n'
        for (const stylesheet of enabledStylesheets) {
          output += `### ${stylesheet.name}\n\n`
          output += '```css\n'
          output += stylesheet.content
          output += '\n```\n\n'
        }
      }
    }

    if (includeTokens && format === 'markdown') {
      output += '## Design Tokens\n\n'

      const tokens = this.uiGuidelines.designTokens
      if (tokens.colors && Object.keys(tokens.colors).length > 0) {
        output += '### Colors\n'
        for (const [key, color] of Object.entries(tokens.colors)) {
          output += `- **${color.name || key}**: ${color.value} ${color.description ? `(${color.description})` : ''}\n`
        }
        output += '\n'
      }

      if (tokens.typography) {
        if (tokens.typography.fontFamilies?.length > 0) {
          output += '### Font Families\n'
          for (const font of tokens.typography.fontFamilies) {
            output += `- **${font.name}**: ${font.value} ${font.description ? `(${font.description})` : ''}\n`
          }
          output += '\n'
        }

        if (tokens.typography.fontSizes?.length > 0) {
          output += '### Font Sizes\n'
          for (const size of tokens.typography.fontSizes) {
            output += `- **${size.name}**: ${size.value} ${size.description ? `(${size.description})` : ''}\n`
          }
          output += '\n'
        }
      }

      if (tokens.spacing?.length > 0) {
        output += '### Spacing\n'
        for (const space of tokens.spacing) {
          output += `- **${space.name}**: ${space.value} ${space.description ? `(${space.description})` : ''}\n`
        }
        output += '\n'
      }
    }

    if (includePatterns && format === 'markdown') {
      if (this.uiGuidelines.componentPatterns.length > 0) {
        output += '## Component Patterns\n\n'
        for (const pattern of this.uiGuidelines.componentPatterns) {
          output += `### ${pattern.name}\n`
          if (pattern.description) {
            output += `${pattern.description}\n\n`
          }
          if (pattern.guidelines) {
            output += `**Guidelines:**\n${pattern.guidelines}\n\n`
          }
          if (pattern.htmlTemplate) {
            output += `**HTML Template:**\n\`\`\`html\n${pattern.htmlTemplate}\n\`\`\`\n\n`
          }
          if (pattern.cssRules) {
            output += `**CSS Rules:**\n\`\`\`css\n${pattern.cssRules}\n\`\`\`\n\n`
          }
        }
      }
    }

    return output.trim()
  }

  /**
   * Generate Claude.md file from project configuration
   * Creates a comprehensive project guide for Claude Code
   * @param {Object} options - Generation options
   */
  async generateClaudeMd(options = {}) {
    const {
      includeConfig = true,
      includeUxStyle = true,
      includeArchitecture = true,
      includeUiGuidelines = true
    } = options

    let output = `# ${this.config.name || 'Project'}\n\n`

    // Project description
    if (this.config.description) {
      output += `${this.config.description}\n\n`
    }

    // Assumptions
    if (includeConfig && this.config.assumptions?.length > 0) {
      output += '## Assumptions\n\n'
      for (const assumption of this.config.assumptions) {
        output += `- ${assumption}\n`
      }
      output += '\n'
    }

    // Technical Architecture
    if (includeConfig && this.config.technicalArchitecture) {
      output += '## Technical Architecture\n\n'
      output += `${this.config.technicalArchitecture}\n\n`
    }

    // Data Model
    if (includeConfig && this.config.dataModel) {
      output += '## Data Model\n\n'
      output += `${this.config.dataModel}\n\n`
    }

    // Coding Preferences
    if (includeConfig && this.config.options) {
      output += '## Coding Preferences\n\n'
      const opts = this.config.options
      output += `- **Programming Style**: ${opts.programmingStyle || 'HYBRID'}\n`
      output += `- **Testing Approach**: ${opts.testingApproach || 'TDD'}\n`
      output += `- **Documentation Level**: ${opts.documentationLevel || 'STANDARD'}\n`
      output += `- **Error Handling**: ${opts.errorHandling || 'EXCEPTIONS'}\n`
      if (opts.codeStyle) {
        output += `- **Naming Convention**: ${opts.codeStyle.naming || 'CAMEL'}\n`
        output += `- **Comment Style**: ${opts.codeStyle.comments || 'JSDoc'}\n`
      }
      output += '\n'
    }

    // UX Style Guidelines
    if (includeUxStyle && this.config.uxStyle) {
      const ux = this.config.uxStyle
      output += '## UX Style Guidelines\n\n'
      output += `- **Alignment**: ${ux.alignment || 'left'}\n`
      output += `- **Font Family**: ${ux.fontFamily || 'system-ui, -apple-system, sans-serif'}\n`
      output += `- **Base Font Size**: ${ux.fontSize || '16px'}\n`
      output += '\n'

      if (ux.colorPalette) {
        output += '### Color Palette\n\n'
        output += `- **Primary**: ${ux.colorPalette.primary || '#6c63ff'}\n`
        output += `- **Secondary**: ${ux.colorPalette.secondary || '#16213e'}\n`
        output += `- **Accent**: ${ux.colorPalette.accent || '#48bb78'}\n`
        output += `- **Background**: ${ux.colorPalette.background || '#ffffff'}\n`
        output += `- **Text**: ${ux.colorPalette.text || '#1a1a2e'}\n`
        output += `- **Error**: ${ux.colorPalette.error || '#f56565'}\n`
        output += '\n'
      }

      if (ux.baselineCss) {
        output += '### Baseline CSS\n\n'
        output += '```css\n'
        output += ux.baselineCss
        output += '\n```\n\n'
      }
    }

    // Architecture document
    if (includeArchitecture && this.architecture?.content) {
      output += '## Architecture\n\n'
      output += `${this.architecture.content}\n\n`
    }

    // UI Guidelines (from the detailed guidelines system)
    if (includeUiGuidelines) {
      const guidelinesExport = await this.exportUiGuidelines({
        includeGuidelines: true,
        includeStylesheets: true,
        includeTokens: true,
        includePatterns: true,
        format: 'markdown'
      })
      if (guidelinesExport) {
        output += guidelinesExport
        output += '\n'
      }
    }

    return output.trim()
  }

  /**
   * Write Claude.md file to the project's .claude directory
   * @param {Object} options - Generation options
   */
  async writeClaudeMd(options = {}) {
    const content = await this.generateClaudeMd(options)

    // Ensure .claude directory exists
    const claudeDir = path.join(this.projectPath, '.claude')
    await this.ensureDirectory(claudeDir)

    // Write Claude.md file
    const claudeMdPath = path.join(claudeDir, 'Claude.md')
    await fs.writeFile(claudeMdPath, content, 'utf-8')

    return { path: claudeMdPath, content }
  }

  // ============ Git Operations Methods ============

  /**
   * Add a Git operation to the history log
   * @param {Object} operation - Operation details
   */
  async addGitOperation(operation) {
    const newOperation = {
      id: this.generateId(),
      type: operation.type,
      timestamp: new Date().toISOString(),
      branch: operation.branch || null,
      hash: operation.hash || null,
      message: operation.message || null,
      sourceBranch: operation.sourceBranch || null,
      sessionId: operation.sessionId || null,
      details: operation.details || {}
    }

    this.gitOperations.operations.push(newOperation)

    // Keep only the last 500 operations to prevent unbounded growth
    if (this.gitOperations.operations.length > 500) {
      this.gitOperations.operations = this.gitOperations.operations.slice(-500)
    }

    await this.saveGitOperations()
    return newOperation
  }

  /**
   * Get Git operation history with optional filtering
   * @param {Object} options - Filter options
   * @param {number} [options.limit=100] - Maximum number of operations to return
   * @param {string} [options.type] - Filter by operation type
   * @param {string} [options.sessionId] - Filter by session ID
   * @returns {Array} Filtered operations
   */
  getGitOperationHistory(options = {}) {
    const { limit = 100, type, sessionId } = options

    let operations = [...this.gitOperations.operations]

    // Filter by type if specified
    if (type) {
      operations = operations.filter(op => op.type === type)
    }

    // Filter by session ID if specified
    if (sessionId) {
      operations = operations.filter(op => op.sessionId === sessionId)
    }

    // Sort by timestamp descending (most recent first)
    operations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    // Limit results
    return operations.slice(0, limit)
  }

  /**
   * Update Git settings in config
   * @param {Object} settings - Git settings to update
   */
  async updateGitSettings(settings) {
    if (!this.config.gitSettings) {
      this.config.gitSettings = {}
    }

    this.config.gitSettings = {
      ...this.config.gitSettings,
      ...settings,
      updatedAt: new Date().toISOString()
    }

    await this.saveConfig()
    return this.config.gitSettings
  }

  /**
   * Get Git settings from config
   * @returns {Object} Git settings
   */
  getGitSettings() {
    return this.config.gitSettings || {}
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
      const config = JSON.parse(content)
      // Ensure uxStyle exists for older configs
      if (!config.uxStyle) {
        config.uxStyle = this.getDefaultUxStyle()
      }
      return config
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
        uxStyle: this.getDefaultUxStyle(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await this.saveConfig(defaultConfig)
      return defaultConfig
    }
  }

  /**
   * Get default UX style configuration
   * @private
   */
  getDefaultUxStyle() {
    return {
      baselineCss: '',
      alignment: 'left',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '16px',
      colorPalette: {
        primary: '#6c63ff',
        secondary: '#16213e',
        accent: '#48bb78',
        background: '#ffffff',
        text: '#1a1a2e',
        error: '#f56565'
      }
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
   * Load user stories or create empty array
   * @private
   */
  async loadUserStories() {
    const storiesPath = path.join(this.puffinPath, USER_STORIES_FILE)
    try {
      const content = await fs.readFile(storiesPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      // Create empty user stories array
      const defaultStories = []
      await this.saveUserStories(defaultStories)
      return defaultStories
    }
  }

  /**
   * Save user stories
   * @private
   */
  async saveUserStories(stories = this.userStories) {
    const storiesPath = path.join(this.puffinPath, USER_STORIES_FILE)
    await fs.writeFile(storiesPath, JSON.stringify(stories, null, 2), 'utf-8')
  }

  /**
   * Load active sprint or return null
   * @private
   */
  async loadActiveSprint() {
    const sprintPath = path.join(this.puffinPath, ACTIVE_SPRINT_FILE)
    try {
      const content = await fs.readFile(sprintPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      // No active sprint
      return null
    }
  }

  /**
   * Save active sprint (or delete file if null)
   * @private
   */
  async saveActiveSprint(sprint = this.activeSprint) {
    const sprintPath = path.join(this.puffinPath, ACTIVE_SPRINT_FILE)
    if (sprint) {
      await fs.writeFile(sprintPath, JSON.stringify(sprint, null, 2), 'utf-8')
    } else {
      // Remove the file if sprint is cleared
      try {
        await fs.unlink(sprintPath)
      } catch {
        // File doesn't exist, that's fine
      }
    }
  }

  /**
   * Update active sprint
   * @param {Object|null} sprint - Sprint data or null to clear
   */
  async updateActiveSprint(sprint) {
    this.activeSprint = sprint
    await this.saveActiveSprint(sprint)
    return { success: true }
  }

  /**
   * Update sprint story progress
   * @param {string} storyId - Story ID
   * @param {string} branchType - Branch type (ui, backend, fullstack)
   * @param {Object} progressUpdate - Progress update { status, startedAt?, completedAt? }
   */
  async updateSprintStoryProgress(storyId, branchType, progressUpdate) {
    if (!this.activeSprint) {
      return { success: false, error: 'No active sprint' }
    }

    // Initialize storyProgress if not exists
    if (!this.activeSprint.storyProgress) {
      this.activeSprint.storyProgress = {}
    }

    // Initialize progress for this story if not exists
    if (!this.activeSprint.storyProgress[storyId]) {
      this.activeSprint.storyProgress[storyId] = {
        branches: {}
      }
    }

    // Update the branch progress
    this.activeSprint.storyProgress[storyId].branches[branchType] = {
      ...this.activeSprint.storyProgress[storyId].branches[branchType],
      ...progressUpdate
    }

    // Check if all branches for this story are completed
    const storyProgress = this.activeSprint.storyProgress[storyId]
    const allBranchesCompleted = Object.values(storyProgress.branches).every(
      b => b.status === 'completed'
    )

    if (allBranchesCompleted && Object.keys(storyProgress.branches).length > 0) {
      storyProgress.status = 'completed'
      storyProgress.completedAt = Date.now()
    }

    // Check if all stories in the sprint are completed
    const allStoriesCompleted = this.activeSprint.stories.every(story => {
      const progress = this.activeSprint.storyProgress[story.id]
      return progress?.status === 'completed'
    })

    if (allStoriesCompleted && this.activeSprint.stories.length > 0) {
      this.activeSprint.status = 'completed'
      this.activeSprint.completedAt = Date.now()
    }

    await this.saveActiveSprint(this.activeSprint)
    return { success: true, sprint: this.activeSprint }
  }

  /**
   * Get sprint progress summary
   * @returns {Object} Progress summary with counts and percentages
   */
  getSprintProgress() {
    if (!this.activeSprint) {
      return null
    }

    const sprint = this.activeSprint
    const storyProgress = sprint.storyProgress || {}

    let totalBranches = 0
    let completedBranches = 0
    let inProgressBranches = 0
    let completedStories = 0

    sprint.stories.forEach(story => {
      const progress = storyProgress[story.id]
      if (progress) {
        if (progress.status === 'completed') {
          completedStories++
        }

        Object.values(progress.branches || {}).forEach(branch => {
          totalBranches++
          if (branch.status === 'completed') {
            completedBranches++
          } else if (branch.status === 'in_progress') {
            inProgressBranches++
          }
        })
      }
    })

    return {
      totalStories: sprint.stories.length,
      completedStories,
      storyPercentage: sprint.stories.length > 0
        ? Math.round((completedStories / sprint.stories.length) * 100)
        : 0,
      totalBranches,
      completedBranches,
      inProgressBranches,
      branchPercentage: totalBranches > 0
        ? Math.round((completedBranches / totalBranches) * 100)
        : 0,
      status: sprint.status,
      isComplete: sprint.status === 'completed'
    }
  }

  /**
   * Load story generations or create default
   * @private
   */
  async loadStoryGenerations() {
    const generationsPath = path.join(this.puffinPath, STORY_GENERATIONS_FILE)
    try {
      const content = await fs.readFile(generationsPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      // Create default story generations structure
      const defaultGenerations = {
        generations: [],
        implementation_journeys: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await this.saveStoryGenerations(defaultGenerations)
      return defaultGenerations
    }
  }

  /**
   * Save story generations
   * @private
   */
  async saveStoryGenerations(generations = this.storyGenerations) {
    generations.updatedAt = new Date().toISOString()
    const generationsPath = path.join(this.puffinPath, STORY_GENERATIONS_FILE)
    await fs.writeFile(generationsPath, JSON.stringify(generations, null, 2), 'utf-8')
  }

  /**
   * Load UI guidelines or create default
   * @private
   */
  async loadUiGuidelines() {
    const guidelinesPath = path.join(this.puffinPath, UI_GUIDELINES_FILE)
    try {
      const content = await fs.readFile(guidelinesPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      // Create default UI guidelines structure
      const defaultGuidelines = {
        guidelines: {
          layout: `# Layout Guidelines

## Grid System
- Use consistent spacing and grid structure
- Maintain proper visual hierarchy
- Consider responsive design principles

## Alignment
- Align elements consistently
- Use proper margins and padding
- Follow established layout patterns`,

          typography: `# Typography Guidelines

## Font Selection
- Primary font for headings
- Secondary font for body text
- Monospace font for code

## Font Sizing
- Establish a type scale
- Use consistent line heights
- Maintain readable font sizes across devices`,

          colors: `# Color Guidelines

## Color Palette
- Primary colors for branding
- Secondary colors for accents
- Neutral colors for text and backgrounds

## Accessibility
- Maintain adequate contrast ratios
- Consider color blindness
- Test in different lighting conditions`,

          components: `# Component Guidelines

## Consistency
- Reusable component patterns
- Consistent interaction patterns
- Standard component variants

## States
- Default, hover, focus, disabled states
- Loading and error states
- Active and selected states`,

          interactions: `# Interaction Guidelines

## User Feedback
- Provide clear feedback for user actions
- Use appropriate animations and transitions
- Indicate loading and processing states

## Accessibility
- Keyboard navigation support
- Screen reader compatibility
- Touch-friendly targets for mobile`
        },
        stylesheets: [],
        designTokens: {
          colors: {
            primary: { name: 'Primary', value: '#6c63ff', description: 'Main brand color' },
            secondary: { name: 'Secondary', value: '#16213e', description: 'Secondary accent color' },
            success: { name: 'Success', value: '#48bb78', description: 'Success state color' },
            warning: { name: 'Warning', value: '#ecc94b', description: 'Warning state color' },
            error: { name: 'Error', value: '#f56565', description: 'Error state color' },
            neutral: { name: 'Neutral', value: '#e6e6e6', description: 'Neutral text color' }
          },
          typography: {
            fontFamilies: [
              { name: 'Primary', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', description: 'Main UI font' },
              { name: 'Monospace', value: '"SF Mono", "Fira Code", Consolas, monospace', description: 'Code and technical content' }
            ],
            fontSizes: [
              { name: 'Small', value: '0.875rem', description: 'Small text, captions' },
              { name: 'Base', value: '1rem', description: 'Body text default' },
              { name: 'Large', value: '1.125rem', description: 'Large body text' },
              { name: 'H3', value: '1.25rem', description: 'Heading 3' },
              { name: 'H2', value: '1.5rem', description: 'Heading 2' },
              { name: 'H1', value: '1.75rem', description: 'Heading 1' }
            ],
            fontWeights: [
              { name: 'Normal', value: '400', description: 'Regular text' },
              { name: 'Medium', value: '500', description: 'Medium emphasis' },
              { name: 'Semibold', value: '600', description: 'Headings, labels' },
              { name: 'Bold', value: '700', description: 'Strong emphasis' }
            ]
          },
          spacing: [
            { name: 'XS', value: '0.25rem', description: 'Extra small spacing' },
            { name: 'SM', value: '0.5rem', description: 'Small spacing' },
            { name: 'MD', value: '0.75rem', description: 'Medium spacing' },
            { name: 'LG', value: '1rem', description: 'Large spacing' },
            { name: 'XL', value: '1.5rem', description: 'Extra large spacing' },
            { name: '2XL', value: '2rem', description: 'Double extra large spacing' }
          ],
          radii: [
            { name: 'None', value: '0', description: 'No border radius' },
            { name: 'Small', value: '4px', description: 'Small border radius' },
            { name: 'Medium', value: '8px', description: 'Medium border radius' },
            { name: 'Large', value: '12px', description: 'Large border radius' },
            { name: 'Full', value: '50%', description: 'Fully rounded (circles)' }
          ],
          shadows: [
            { name: 'None', value: 'none', description: 'No shadow' },
            { name: 'Small', value: '0 1px 2px rgba(0, 0, 0, 0.2)', description: 'Subtle shadow' },
            { name: 'Medium', value: '0 2px 8px rgba(0, 0, 0, 0.3)', description: 'Standard shadow' },
            { name: 'Large', value: '0 4px 16px rgba(0, 0, 0, 0.4)', description: 'Prominent shadow' }
          ]
        },
        componentPatterns: [
          {
            id: 'button-primary',
            name: 'Primary Button',
            description: 'Main call-to-action button with primary styling',
            htmlTemplate: '<button class="btn btn-primary">Button Text</button>',
            cssRules: `.btn-primary {
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-small);
  padding: var(--spacing-md) var(--spacing-lg);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  background: var(--color-primary-dark);
  transform: translateY(-1px);
}`,
            guidelines: 'Use for primary actions like "Save", "Submit", "Create". Limit to one per page section.',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await this.saveUiGuidelines(defaultGuidelines)
      return defaultGuidelines
    }
  }

  /**
   * Save UI guidelines
   * @private
   */
  async saveUiGuidelines(guidelines = this.uiGuidelines) {
    const guidelinesPath = path.join(this.puffinPath, UI_GUIDELINES_FILE)
    await fs.writeFile(guidelinesPath, JSON.stringify(guidelines, null, 2), 'utf-8')
  }

  /**
   * Load Git operations or create default
   * @private
   */
  async loadGitOperations() {
    const operationsPath = path.join(this.puffinPath, GIT_OPERATIONS_FILE)
    try {
      const content = await fs.readFile(operationsPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      // Create default Git operations structure
      const defaultOperations = {
        operations: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await this.saveGitOperations(defaultOperations)
      return defaultOperations
    }
  }

  /**
   * Save Git operations
   * @private
   */
  async saveGitOperations(operations = this.gitOperations) {
    operations.updatedAt = new Date().toISOString()
    const operationsPath = path.join(this.puffinPath, GIT_OPERATIONS_FILE)
    await fs.writeFile(operationsPath, JSON.stringify(operations, null, 2), 'utf-8')
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
   * Validate filename to prevent path traversal attacks
   * @param {string} filename - Filename to validate
   * @throws {Error} If filename contains path traversal characters
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
