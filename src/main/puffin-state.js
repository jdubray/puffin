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
const ARCHIVED_STORIES_FILE = 'archived-stories.json'
const ACTIVE_SPRINT_FILE = 'active-sprint.json'
const SPRINT_HISTORY_FILE = 'sprint-history.json'
const STORY_GENERATIONS_FILE = 'story-generations.json'
const GIT_OPERATIONS_FILE = 'git-operations.json'
const GUI_DESIGNS_DIR = 'gui-definitions'
const UI_GUIDELINES_FILE = 'ui-guidelines.json'
const STYLESHEETS_DIR = 'stylesheets'
const CLAUDE_PLUGINS_DIR = 'claude-plugins' // Claude Code skill plugins directory

class PuffinState {
  constructor() {
    this.projectPath = null
    this.puffinPath = null
    this.config = null
    this.history = null
    this.userStories = null
    this.archivedStories = null
    this.sprintHistory = null
    this.storyGenerations = null
    this.uiGuidelines = null
    this.gitOperations = null
    this.claudePlugins = null // Claude Code skill plugins
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
    await this.ensureDirectory(path.join(this.puffinPath, STYLESHEETS_DIR))
    await this.ensureDirectory(path.join(this.puffinPath, CLAUDE_PLUGINS_DIR))

    // Load or initialize state
    this.config = await this.loadConfig()
    this.history = await this.loadHistory()
    this.userStories = await this.loadUserStories()
    this.archivedStories = await this.loadArchivedStories()
    this.activeSprint = await this.loadActiveSprint()
    this.sprintHistory = await this.loadSprintHistory()
    this.storyGenerations = await this.loadStoryGenerations()
    this.uiGuidelines = await this.loadUiGuidelines()
    this.gitOperations = await this.loadGitOperations()
    this.claudePlugins = await this.loadClaudePlugins()

    // Auto-archive completed stories older than 2 weeks
    await this.autoArchiveOldStories()

    // Migrate any archived stories from main file to archive file
    await this.migrateArchivedStories()

    return this.getState()
  }

  /**
   * Auto-archive completed stories that are older than 2 weeks
   * Moves them to the archived-stories.json file
   * @private
   */
  async autoArchiveOldStories() {
    const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000
    const now = Date.now()
    const storiesToArchive = []

    for (const story of this.userStories) {
      if (story.status === 'completed' && story.updatedAt) {
        const updatedAt = new Date(story.updatedAt).getTime()
        if (now - updatedAt > TWO_WEEKS_MS) {
          story.status = 'archived'
          story.archivedAt = new Date().toISOString()
          storiesToArchive.push(story)
        }
      }
    }

    if (storiesToArchive.length > 0) {
      // Move stories to archive
      for (const story of storiesToArchive) {
        this.archivedStories.push(story)
        const index = this.userStories.findIndex(s => s.id === story.id)
        if (index !== -1) {
          this.userStories.splice(index, 1)
        }
      }

      console.log(`[PUFFIN-STATE] Auto-archived ${storiesToArchive.length} completed stories older than 2 weeks`)
      await this.saveUserStories()
      await this.saveArchivedStories()
    }
  }

  /**
   * Migrate any existing archived stories from main file to archive file
   * This handles the transition for existing projects
   * @private
   */
  async migrateArchivedStories() {
    const archivedInMain = this.userStories.filter(s => s.status === 'archived')

    if (archivedInMain.length > 0) {
      // Move archived stories to the archive file
      for (const story of archivedInMain) {
        // Check if already in archive (by ID)
        if (!this.archivedStories.find(s => s.id === story.id)) {
          this.archivedStories.push(story)
        }
      }

      // Remove archived stories from main list
      this.userStories = this.userStories.filter(s => s.status !== 'archived')

      console.log(`[PUFFIN-STATE] Migrated ${archivedInMain.length} archived stories to separate file`)
      await this.saveUserStories()
      await this.saveArchivedStories()
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
      userStories: this.userStories,
      archivedStoriesCount: this.archivedStories?.length || 0,
      activeSprint: this.activeSprint,
      sprintHistory: this.sprintHistory?.sprints || [],
      storyGenerations: this.storyGenerations,
      uiGuidelines: this.uiGuidelines,
      gitOperations: this.gitOperations,
      claudePlugins: this.claudePlugins
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
   * Add a user story
   * @param {Object} story - User story object
   */
  async addUserStory(story) {
    // Check for duplicate by ID to prevent double-adds
    const storyId = story.id || this.generateId()
    const existingStory = this.userStories.find(s => s.id === storyId)
    if (existingStory) {
      console.warn(`[PUFFIN-STATE] Story with ID "${storyId}" already exists. Updating instead of adding.`)
      return this.updateUserStory(storyId, story)
    }

    const newStory = {
      id: storyId,
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

    const updatedStory = {
      ...this.userStories[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }

    // If status changed to 'archived', move to archive file
    if (updates.status === 'archived' && this.userStories[index].status !== 'archived') {
      updatedStory.archivedAt = new Date().toISOString()
      this.archivedStories.push(updatedStory)
      this.userStories.splice(index, 1)
      await this.saveUserStories()
      await this.saveArchivedStories()
      console.log(`[PUFFIN-STATE] Moved story to archive: ${storyId}`)
      return updatedStory
    }

    this.userStories[index] = updatedStory
    await this.saveUserStories()
    return this.userStories[index]
  }

  /**
   * Restore an archived story back to active stories
   * @param {string} storyId - Story ID
   * @param {string} newStatus - Status to restore to (default: 'pending')
   */
  async restoreArchivedStory(storyId, newStatus = 'pending') {
    const index = this.archivedStories.findIndex(s => s.id === storyId)
    if (index === -1) return null

    const story = this.archivedStories[index]
    story.status = newStatus
    story.archivedAt = null
    story.updatedAt = new Date().toISOString()

    // Move back to active stories
    this.userStories.push(story)
    this.archivedStories.splice(index, 1)

    await this.saveUserStories()
    await this.saveArchivedStories()
    console.log(`[PUFFIN-STATE] Restored story from archive: ${storyId}`)
    return story
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
   * List GUI designs with metadata
   * @returns {Promise<Array<{filename: string, name: string, description: string, elementCount: number}>>}
   */
  async listGuiDesigns() {
    const dirPath = path.join(this.puffinPath, GUI_DESIGNS_DIR)
    try {
      const files = await fs.readdir(dirPath)
      const jsonFiles = files.filter(f => f.endsWith('.json'))

      const designs = await Promise.all(
        jsonFiles.map(async (filename) => {
          try {
            const filepath = path.join(dirPath, filename)
            const content = await fs.readFile(filepath, 'utf-8')
            const design = JSON.parse(content)
            return {
              filename,
              name: design.name || filename.replace('.json', ''),
              description: design.description || '',
              elementCount: Array.isArray(design.elements) ? design.elements.length : 0
            }
          } catch {
            return null
          }
        })
      )

      return designs.filter(d => d !== null)
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

  // ============ Claude Code Plugin Methods ============

  /**
   * Get all installed Claude Code plugins
   * @returns {Array} Array of plugin objects with manifest and skill content
   */
  getClaudePlugins() {
    return this.claudePlugins || []
  }

  /**
   * Get a specific Claude Code plugin by ID
   * @param {string} pluginId - Plugin ID (directory name)
   * @returns {Object|null} Plugin object or null if not found
   */
  getClaudePlugin(pluginId) {
    return this.claudePlugins?.find(p => p.id === pluginId) || null
  }

  /**
   * Install a Claude Code plugin
   * Creates plugin directory with manifest.json and skill.md
   * @param {Object} pluginData - Plugin data
   * @param {string} pluginData.id - Unique plugin ID (used as directory name)
   * @param {string} pluginData.name - Human-readable plugin name
   * @param {string} pluginData.description - Plugin description
   * @param {string} pluginData.version - Plugin version
   * @param {string} pluginData.skillContent - Markdown content for the skill
   * @param {string} [pluginData.author] - Plugin author
   * @param {string} [pluginData.source] - Source URL or path
   * @returns {Promise<Object>} Installed plugin object
   */
  async installClaudePlugin(pluginData) {
    const { id, name, description, version, skillContent, author, source } = pluginData

    // Validate required fields
    if (!id || typeof id !== 'string') {
      throw new Error('Plugin ID is required and must be a string')
    }
    if (!name || typeof name !== 'string') {
      throw new Error('Plugin name is required and must be a string')
    }
    if (!skillContent || typeof skillContent !== 'string') {
      throw new Error('Plugin skill content is required and must be a string')
    }

    // Sanitize plugin ID for filesystem
    const sanitizedId = this.sanitizeFilename(id)

    // Check if plugin already exists in memory cache
    const existingPluginIndex = this.claudePlugins?.findIndex(p => p.id === sanitizedId) ?? -1
    if (existingPluginIndex !== -1) {
      // Verify the plugin directory still exists on disk
      const existingPluginDir = path.join(this.puffinPath, CLAUDE_PLUGINS_DIR, sanitizedId)
      try {
        await fs.access(existingPluginDir)
        // Directory exists, plugin is truly installed
        throw new Error(`Plugin with ID "${sanitizedId}" is already installed`)
      } catch (accessError) {
        if (accessError.code === 'ENOENT') {
          // Directory was deleted externally, remove from cache
          console.log(`[PUFFIN-STATE] Plugin "${sanitizedId}" was deleted externally, removing from cache`)
          this.claudePlugins.splice(existingPluginIndex, 1)
        } else {
          throw accessError
        }
      }
    }

    // Create plugin directory
    const pluginDir = path.join(this.puffinPath, CLAUDE_PLUGINS_DIR, sanitizedId)
    await this.ensureDirectory(pluginDir)

    // Create manifest
    const manifest = {
      id: sanitizedId,
      name,
      description: description || '',
      version: version || '1.0.0',
      author: author || '',
      source: source || '',
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Write manifest.json
    const manifestPath = path.join(pluginDir, 'manifest.json')
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

    // Write skill.md
    const skillPath = path.join(pluginDir, 'skill.md')
    await fs.writeFile(skillPath, skillContent, 'utf-8')

    // Add to in-memory cache
    const plugin = {
      ...manifest,
      skillContent,
      path: pluginDir
    }

    if (!this.claudePlugins) {
      this.claudePlugins = []
    }
    this.claudePlugins.push(plugin)

    console.log(`[PUFFIN-STATE] Installed Claude plugin: ${name} (${sanitizedId})`)
    return plugin
  }

  /**
   * Update a Claude Code plugin
   * @param {string} pluginId - Plugin ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated plugin object
   */
  async updateClaudePlugin(pluginId, updates) {
    const pluginIndex = this.claudePlugins?.findIndex(p => p.id === pluginId)
    if (pluginIndex === -1 || pluginIndex === undefined) {
      throw new Error(`Plugin "${pluginId}" not found`)
    }

    const plugin = this.claudePlugins[pluginIndex]
    const pluginDir = path.join(this.puffinPath, CLAUDE_PLUGINS_DIR, pluginId)

    // Update manifest fields
    const updatedManifest = {
      id: plugin.id,
      name: updates.name || plugin.name,
      description: updates.description !== undefined ? updates.description : plugin.description,
      version: updates.version || plugin.version,
      author: updates.author !== undefined ? updates.author : plugin.author,
      source: updates.source !== undefined ? updates.source : plugin.source,
      installedAt: plugin.installedAt,
      updatedAt: new Date().toISOString()
    }

    // Write updated manifest
    const manifestPath = path.join(pluginDir, 'manifest.json')
    await fs.writeFile(manifestPath, JSON.stringify(updatedManifest, null, 2), 'utf-8')

    // Update skill content if provided
    let skillContent = plugin.skillContent
    if (updates.skillContent !== undefined) {
      skillContent = updates.skillContent
      const skillPath = path.join(pluginDir, 'skill.md')
      await fs.writeFile(skillPath, skillContent, 'utf-8')
    }

    // Update in-memory cache
    const updatedPlugin = {
      ...updatedManifest,
      skillContent,
      path: pluginDir
    }
    this.claudePlugins[pluginIndex] = updatedPlugin

    console.log(`[PUFFIN-STATE] Updated Claude plugin: ${updatedPlugin.name} (${pluginId})`)
    return updatedPlugin
  }

  /**
   * Uninstall a Claude Code plugin
   * Removes plugin directory and all contents
   * @param {string} pluginId - Plugin ID
   * @returns {Promise<boolean>} True if uninstalled successfully
   */
  async uninstallClaudePlugin(pluginId) {
    const pluginIndex = this.claudePlugins?.findIndex(p => p.id === pluginId)
    if (pluginIndex === -1 || pluginIndex === undefined) {
      throw new Error(`Plugin "${pluginId}" not found`)
    }

    const plugin = this.claudePlugins[pluginIndex]
    const pluginDir = path.join(this.puffinPath, CLAUDE_PLUGINS_DIR, pluginId)

    // Remove plugin directory recursively
    await fs.rm(pluginDir, { recursive: true, force: true })

    // Remove from in-memory cache
    this.claudePlugins.splice(pluginIndex, 1)

    // Remove plugin from any branch assignments
    await this.removePluginFromAllBranches(pluginId)

    console.log(`[PUFFIN-STATE] Uninstalled Claude plugin: ${plugin.name} (${pluginId})`)
    return true
  }

  /**
   * Assign a plugin to a branch
   * @param {string} pluginId - Plugin ID
   * @param {string} branchId - Branch ID
   * @returns {Promise<Object>} Updated branch object
   */
  async assignPluginToBranch(pluginId, branchId) {
    // Verify plugin exists
    const plugin = this.getClaudePlugin(pluginId)
    if (!plugin) {
      throw new Error(`Plugin "${pluginId}" not found`)
    }

    // Verify branch exists
    const branch = this.history.branches[branchId]
    if (!branch) {
      throw new Error(`Branch "${branchId}" not found`)
    }

    // Initialize assignedPlugins array if not exists
    if (!branch.assignedPlugins) {
      branch.assignedPlugins = []
    }

    // Check if already assigned
    if (branch.assignedPlugins.includes(pluginId)) {
      return branch // Already assigned
    }

    // Add plugin to branch
    branch.assignedPlugins.push(pluginId)
    await this.saveHistory()

    console.log(`[PUFFIN-STATE] Assigned plugin "${pluginId}" to branch "${branchId}"`)
    return branch
  }

  /**
   * Unassign a plugin from a branch
   * @param {string} pluginId - Plugin ID
   * @param {string} branchId - Branch ID
   * @returns {Promise<Object>} Updated branch object
   */
  async unassignPluginFromBranch(pluginId, branchId) {
    const branch = this.history.branches[branchId]
    if (!branch) {
      throw new Error(`Branch "${branchId}" not found`)
    }

    if (!branch.assignedPlugins) {
      return branch // No plugins assigned
    }

    const index = branch.assignedPlugins.indexOf(pluginId)
    if (index === -1) {
      return branch // Plugin not assigned to this branch
    }

    branch.assignedPlugins.splice(index, 1)
    await this.saveHistory()

    console.log(`[PUFFIN-STATE] Unassigned plugin "${pluginId}" from branch "${branchId}"`)
    return branch
  }

  /**
   * Get plugins assigned to a branch
   * @param {string} branchId - Branch ID
   * @returns {Array} Array of plugin objects assigned to the branch
   */
  getBranchPlugins(branchId) {
    const branch = this.history.branches[branchId]
    if (!branch || !branch.assignedPlugins) {
      return []
    }

    return branch.assignedPlugins
      .map(pluginId => this.getClaudePlugin(pluginId))
      .filter(plugin => plugin !== null)
  }

  /**
   * Remove plugin from all branches (used during uninstall)
   * @param {string} pluginId - Plugin ID
   * @private
   */
  async removePluginFromAllBranches(pluginId) {
    let modified = false

    for (const branchId of Object.keys(this.history.branches)) {
      const branch = this.history.branches[branchId]
      if (branch.assignedPlugins) {
        const index = branch.assignedPlugins.indexOf(pluginId)
        if (index !== -1) {
          branch.assignedPlugins.splice(index, 1)
          modified = true
        }
      }
    }

    if (modified) {
      await this.saveHistory()
    }
  }

  /**
   * Get combined skill content for a branch
   * Combines all assigned plugin skills into a single markdown string
   * @param {string} branchId - Branch ID
   * @returns {string} Combined skill markdown content
   */
  getBranchSkillContent(branchId) {
    const plugins = this.getBranchPlugins(branchId)
    if (plugins.length === 0) {
      return ''
    }

    const sections = plugins.map(plugin => {
      return `## ${plugin.name}\n\n${plugin.skillContent}`
    })

    return `# Assigned Skills\n\n${sections.join('\n\n---\n\n')}`
  }

  /**
   * Parse a GitHub URL to extract raw content URLs
   * Supports formats like:
   * - https://github.com/owner/repo/tree/branch/path
   * - https://github.com/owner/repo/blob/branch/path
   * @param {string} url - GitHub URL
   * @returns {Object} Parsed URL info with rawBase for fetching files
   * @private
   */
  parseGitHubUrl(url) {
    // Clean and validate URL first - extract just the URL part
    let cleanUrl = url.trim()

    // If there's extra text after the URL, extract just the URL
    // Match a valid GitHub URL pattern and ignore anything after
    const urlExtract = cleanUrl.match(/(https:\/\/github\.com\/[^\s]+)/)
    if (urlExtract) {
      cleanUrl = urlExtract[1]
    }

    // Remove trailing slashes
    cleanUrl = cleanUrl.replace(/\/+$/, '')

    // Match GitHub URL patterns - use non-greedy matching for path
    const treeMatch = cleanUrl.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/([^\s]+)/)
    const blobMatch = cleanUrl.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/([^\s]+)/)
    const match = treeMatch || blobMatch

    if (!match) {
      throw new Error('Invalid GitHub URL format. Expected: https://github.com/owner/repo/tree/branch/path')
    }

    const [, owner, repo, branch, pluginPath] = match
    const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${pluginPath}`

    console.log(`[PUFFIN-STATE] Parsed GitHub URL:`, { owner, repo, branch, pluginPath, rawBase })

    return { owner, repo, branch, pluginPath, rawBase }
  }

  /**
   * Validate a Claude Code plugin from a source URL
   * Fetches and parses the package.json to get plugin metadata
   * @param {string} source - Plugin source (GitHub URL or local path)
   * @param {string} type - Source type ('github', 'url', or 'local') - 'url' auto-detects
   * @returns {Promise<Object>} Validation result with success and manifest
   */
  async validateClaudePlugin(source, type = 'github') {
    try {
      // Clean the source URL - remove any extra text/whitespace
      let cleanSource = source.trim()
      const urlMatch = cleanSource.match(/(https:\/\/[^\s]+)/)
      if (urlMatch) {
        cleanSource = urlMatch[1]
      }
      console.log(`[PUFFIN-STATE] Validating plugin from: ${cleanSource} (type: ${type})`)

      // Auto-detect type from URL if type is 'url' or 'github'
      let effectiveType = type
      if (type === 'url' || type === 'github') {
        if (cleanSource.includes('github.com')) {
          effectiveType = 'github'
        } else if (cleanSource.includes('raw.githubusercontent.com')) {
          effectiveType = 'raw'
        } else {
          return { success: false, error: `Unable to detect source type from URL. Please use a GitHub URL.` }
        }
      }

      if (effectiveType === 'github') {
        const { rawBase } = this.parseGitHubUrl(cleanSource)

        // Claude Code plugins use .claude-plugin/plugin.json for metadata
        const pluginJsonUrl = `${rawBase}/.claude-plugin/plugin.json`
        console.log(`[PUFFIN-STATE] Fetching Claude plugin metadata from: ${pluginJsonUrl}`)

        const response = await fetch(pluginJsonUrl)
        if (!response.ok) {
          throw new Error(`Failed to fetch plugin.json: ${response.status} ${response.statusText}`)
        }

        const pluginJson = await response.json()

        // Extract relevant fields from Claude plugin format
        const manifest = {
          name: pluginJson.name || 'Unknown Plugin',
          description: pluginJson.description || 'No description available',
          version: pluginJson.version || '1.0.0',
          author: typeof pluginJson.author === 'object'
            ? pluginJson.author.name
            : pluginJson.author || '',
          icon: '🔌' // Default icon for Claude plugins
        }

        return { success: true, manifest, source: cleanSource, type: effectiveType }
      } else if (effectiveType === 'local') {
        // TODO: Implement local path validation
        throw new Error('Local plugin installation not yet supported')
      } else {
        throw new Error(`Unknown source type: ${effectiveType}`)
      }
    } catch (error) {
      console.error('[PUFFIN-STATE] Plugin validation failed:', error.message)
      return { success: false, error: error.message }
    }
  }

  /**
   * Add a Claude Code plugin from a source URL
   * Validates, fetches skill content, and installs the plugin
   * @param {string} source - Plugin source (GitHub URL or local path)
   * @param {string} type - Source type ('github', 'url', or 'local') - 'url' auto-detects
   * @returns {Promise<Object>} Result with success and plugin object
   */
  async addClaudePlugin(source, type = 'github') {
    try {
      // First validate to get metadata (this also resolves the effective type)
      const validation = await this.validateClaudePlugin(source, type)
      if (!validation.success) {
        return validation
      }

      // Use the resolved type and cleaned source from validation
      const effectiveType = validation.type
      const cleanSource = validation.source

      if (effectiveType === 'github') {
        const { rawBase } = this.parseGitHubUrl(cleanSource)

        // Claude Code plugins store skills in skills/{name}/SKILL.md
        const pluginName = validation.manifest.name
        const skillUrl = `${rawBase}/skills/${pluginName}/SKILL.md`
        console.log(`[PUFFIN-STATE] Fetching skill content from: ${skillUrl}`)

        const skillResponse = await fetch(skillUrl)
        if (!skillResponse.ok) {
          throw new Error(`Failed to fetch skill.md: ${skillResponse.status} ${skillResponse.statusText}`)
        }

        const skillContent = await skillResponse.text()

        // Generate plugin ID from name
        const pluginId = validation.manifest.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')

        // Install the plugin
        const plugin = await this.installClaudePlugin({
          id: pluginId,
          name: validation.manifest.name,
          description: validation.manifest.description,
          version: validation.manifest.version,
          author: validation.manifest.author,
          source: cleanSource,
          skillContent: skillContent
        })

        return { success: true, plugin }
      } else {
        throw new Error(`Unknown source type: ${type}`)
      }
    } catch (error) {
      console.error('[PUFFIN-STATE] Plugin installation failed:', error.message)
      return { success: false, error: error.message }
    }
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
          specifications: { id: 'specifications', name: 'Specifications', prompts: [], codeModificationAllowed: false },
          architecture: { id: 'architecture', name: 'Architecture', prompts: [], codeModificationAllowed: true },
          ui: { id: 'ui', name: 'UI', prompts: [], codeModificationAllowed: true },
          backend: { id: 'backend', name: 'Backend', prompts: [], codeModificationAllowed: true },
          deployment: { id: 'deployment', name: 'Deployment', prompts: [], codeModificationAllowed: true },
          improvements: { id: 'improvements', name: 'Improvements', icon: 'code', prompts: [], codeModificationAllowed: true },
          tmp: { id: 'tmp', name: 'Tmp', prompts: [], codeModificationAllowed: true }
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
   * Load user stories or create empty array
   * Enhanced with backup recovery for data protection
   * @private
   */
  async loadUserStories() {
    const storiesPath = path.join(this.puffinPath, USER_STORIES_FILE)
    const backupPath = path.join(this.puffinPath, 'user-stories.backup.json')

    try {
      const content = await fs.readFile(storiesPath, 'utf-8')
      const stories = JSON.parse(content)

      // Validate that stories is an array
      if (!Array.isArray(stories)) {
        console.error('[PUFFIN-STATE] User stories file is not an array, attempting backup recovery')
        return await this._recoverFromBackup(backupPath)
      }

      // If main file is empty but backup exists with stories, recover
      if (stories.length === 0) {
        const recoveredStories = await this._recoverFromBackup(backupPath)
        if (recoveredStories.length > 0) {
          console.log(`[PUFFIN-STATE] RECOVERY: Restored ${recoveredStories.length} stories from backup`)
          return recoveredStories
        }
        return []
      }

      // Deduplicate stories by ID (cleanup for any existing duplicates)
      const seenIds = new Set()
      const uniqueStories = []
      let duplicateCount = 0

      for (const story of stories) {
        if (seenIds.has(story.id)) {
          duplicateCount++
          console.warn(`[PUFFIN-STATE] Removing duplicate story: "${story.title}" (${story.id})`)
          continue
        }
        seenIds.add(story.id)
        uniqueStories.push(story)
      }

      // If duplicates were found, save the cleaned list
      if (duplicateCount > 0) {
        console.log(`[PUFFIN-STATE] Removed ${duplicateCount} duplicate stories from storage`)
        await this.saveUserStories(uniqueStories)
      }

      // Create a backup of valid stories for recovery purposes
      if (uniqueStories.length > 0) {
        await this._createBackup(backupPath, uniqueStories)
      }

      return uniqueStories
    } catch (error) {
      // Check if file doesn't exist (ENOENT) - try backup first
      if (error.code === 'ENOENT') {
        console.log('[PUFFIN-STATE] No user stories file found, checking for backup')
        const recoveredStories = await this._recoverFromBackup(backupPath)
        if (recoveredStories.length > 0) {
          console.log(`[PUFFIN-STATE] RECOVERY: Restored ${recoveredStories.length} stories from backup (main file missing)`)
          // Save recovered stories to main file
          await this.saveUserStories(recoveredStories)
          return recoveredStories
        }
        return []
      }

      // For other errors (parse errors, permission issues), try backup
      console.error('[PUFFIN-STATE] Error loading user stories:', error.message)
      const recoveredStories = await this._recoverFromBackup(backupPath)
      if (recoveredStories.length > 0) {
        console.log(`[PUFFIN-STATE] RECOVERY: Restored ${recoveredStories.length} stories from backup after error`)
        return recoveredStories
      }
      console.error('[PUFFIN-STATE] SAFETY: No backup available, returning empty array')
      return []
    }
  }

  /**
   * Attempt to recover stories from backup file
   * @private
   */
  async _recoverFromBackup(backupPath) {
    try {
      const content = await fs.readFile(backupPath, 'utf-8')
      const stories = JSON.parse(content)
      if (Array.isArray(stories) && stories.length > 0) {
        return stories
      }
    } catch {
      // No backup available or backup is invalid
    }
    return []
  }

  /**
   * Create a backup of stories
   * @private
   */
  async _createBackup(backupPath, stories) {
    try {
      await fs.writeFile(backupPath, JSON.stringify(stories, null, 2), 'utf-8')
      console.log(`[PUFFIN-STATE] Backup created with ${stories.length} stories`)
    } catch (error) {
      console.error('[PUFFIN-STATE] Failed to create backup:', error.message)
    }
  }

  /**
   * Save user stories with safety checks to prevent accidental data loss
   * @private
   */
  async saveUserStories(stories = this.userStories) {
    const storiesPath = path.join(this.puffinPath, USER_STORIES_FILE)

    // Safety check: Don't write if stories is undefined or not an array
    if (!Array.isArray(stories)) {
      console.error('[PUFFIN-STATE] SAFETY: Refusing to save user stories - not an array:', typeof stories)
      return
    }

    // Safety check: If writing empty array but file exists with stories, create backup first
    if (stories.length === 0) {
      try {
        const existingContent = await fs.readFile(storiesPath, 'utf-8')
        const existingStories = JSON.parse(existingContent)
        if (Array.isArray(existingStories) && existingStories.length > 0) {
          // Create backup before wiping
          const backupPath = path.join(this.puffinPath, 'user-stories.backup.json')
          await fs.writeFile(backupPath, existingContent, 'utf-8')
          console.warn(`[PUFFIN-STATE] SAFETY: Creating backup before writing empty array. ${existingStories.length} stories backed up to user-stories.backup.json`)
        }
      } catch {
        // File doesn't exist or can't be parsed, safe to proceed
      }
    }

    await fs.writeFile(storiesPath, JSON.stringify(stories, null, 2), 'utf-8')
  }

  /**
   * Load archived stories
   * @private
   */
  async loadArchivedStories() {
    const archivePath = path.join(this.puffinPath, ARCHIVED_STORIES_FILE)
    try {
      const content = await fs.readFile(archivePath, 'utf-8')
      return JSON.parse(content)
    } catch {
      // No archived stories file yet
      return []
    }
  }

  /**
   * Save archived stories
   * @private
   */
  async saveArchivedStories(stories = this.archivedStories) {
    const archivePath = path.join(this.puffinPath, ARCHIVED_STORIES_FILE)
    await fs.writeFile(archivePath, JSON.stringify(stories, null, 2), 'utf-8')
  }

  /**
   * Get all archived stories
   */
  getArchivedStories() {
    return this.archivedStories || []
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
   * Load sprint history or create default
   * @private
   */
  async loadSprintHistory() {
    const historyPath = path.join(this.puffinPath, SPRINT_HISTORY_FILE)
    try {
      const content = await fs.readFile(historyPath, 'utf-8')
      return JSON.parse(content)
    } catch {
      // Create default sprint history structure
      const defaultHistory = {
        sprints: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      return defaultHistory
    }
  }

  /**
   * Save sprint history
   * @private
   */
  async saveSprintHistory(history = this.sprintHistory) {
    history.updatedAt = new Date().toISOString()
    const historyPath = path.join(this.puffinPath, SPRINT_HISTORY_FILE)
    await fs.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8')
  }

  /**
   * Archive a closed sprint to history
   * @param {Object} sprint - Sprint object to archive
   */
  async archiveSprintToHistory(sprint) {
    // Convert sprint to archival format with story references
    const archivedSprint = {
      id: sprint.id,
      status: 'closed',
      closedAt: sprint.closedAt || new Date().toISOString(),
      createdAt: sprint.createdAt,
      completedAt: sprint.completedAt,
      planApprovedAt: sprint.planApprovedAt,
      // Store story IDs as references, not full copies
      storyIds: (sprint.stories || []).map(s => s.id),
      // Preserve the implementation plan - KEY VALUE
      plan: sprint.plan,
      // Preserve story progress for historical reference
      storyProgress: sprint.storyProgress,
      promptId: sprint.promptId
    }

    this.sprintHistory.sprints.push(archivedSprint)
    await this.saveSprintHistory()
    return archivedSprint
  }

  /**
   * Get sprint history with optional filters
   * @param {Object} options - Filter options
   */
  getSprintHistory(options = {}) {
    const { limit = 50 } = options
    const sprints = [...this.sprintHistory.sprints]
      .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))
      .slice(0, limit)
    return sprints
  }

  /**
   * Get a specific archived sprint with resolved story data
   * @param {string} sprintId - Sprint ID to retrieve
   */
  async getArchivedSprint(sprintId) {
    const sprint = this.sprintHistory.sprints.find(s => s.id === sprintId)
    if (!sprint) return null

    // Resolve story references to actual story data
    const resolvedStories = sprint.storyIds.map(storyId => {
      const story = this.userStories.find(s => s.id === storyId) ||
        this.archivedStories.find(s => s.id === storyId)
      return story || { id: storyId, title: '[Deleted Story]', status: 'unknown' }
    })

    return {
      ...sprint,
      stories: resolvedStories
    }
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

  // ============ Design Document Methods ============

  /**
   * Scan the docs/ directory for markdown files
   * @returns {Promise<Array>} Array of document objects with name and path
   */
  async scanDesignDocuments() {
    // Debug: write to file for visibility
    const debugLog = async (msg) => {
      const debugPath = path.join(this.projectPath || '.', '.puffin', 'design-docs-debug.log')
      try {
        await fs.appendFile(debugPath, `${new Date().toISOString()} - ${msg}\n`)
      } catch (e) {
        // Ignore debug write errors
      }
    }

    await debugLog(`scanDesignDocuments called`)
    await debugLog(`projectPath: ${this.projectPath}`)

    const docsPath = path.join(this.projectPath, 'docs')
    await debugLog(`docsPath: ${docsPath}`)

    try {
      const files = await fs.readdir(docsPath)
      await debugLog(`Found ${files.length} total files`)
      const mdFiles = files.filter(f => f.endsWith('.md'))
      await debugLog(`Found ${mdFiles.length} .md files: ${mdFiles.join(', ')}`)

      return mdFiles.map(filename => ({
        filename,
        name: filename.replace(/\.md$/, ''),
        path: path.join(docsPath, filename)
      }))
    } catch (err) {
      // docs/ directory doesn't exist or is not accessible
      await debugLog(`Error: ${err.code} - ${err.message}`)
      if (err.code === 'ENOENT') {
        return []
      }
      throw err
    }
  }

  /**
   * Get list of available design documents
   * Returns document metadata without content
   * @returns {Promise<Array>} Array of document objects
   */
  async getDesignDocuments() {
    if (!this.projectPath) {
      console.warn('[PUFFIN-STATE] getDesignDocuments called before project opened')
      return []
    }
    return this.scanDesignDocuments()
  }

  /**
   * Load a design document's content
   * @param {string} filename - The document filename (e.g., 'DESIGN.md')
   * @returns {Promise<Object>} Document object with name and content
   */
  async loadDesignDocument(filename) {
    // Validate filename to prevent path traversal
    if (!filename || typeof filename !== 'string') {
      throw new Error('Invalid filename: must be a non-empty string')
    }
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid filename: path traversal not allowed')
    }
    if (!filename.endsWith('.md')) {
      throw new Error('Invalid filename: must be a .md file')
    }

    const docsPath = path.join(this.projectPath, 'docs')
    const filepath = path.join(docsPath, filename)

    try {
      const content = await fs.readFile(filepath, 'utf-8')
      return {
        filename,
        name: filename.replace(/\.md$/, ''),
        path: filepath,
        content
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`Design document not found: ${filename}`)
      }
      throw err
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
   * Load Claude Code plugins from the claude-plugins directory
   * Scans .puffin/claude-plugins/ for subdirectories with manifest.json and skill.md
   * @private
   */
  async loadClaudePlugins() {
    const pluginsDir = path.join(this.puffinPath, CLAUDE_PLUGINS_DIR)
    const plugins = []

    try {
      const entries = await fs.readdir(pluginsDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const pluginDir = path.join(pluginsDir, entry.name)
        const manifestPath = path.join(pluginDir, 'manifest.json')
        const skillPath = path.join(pluginDir, 'skill.md')

        try {
          // Read manifest
          const manifestContent = await fs.readFile(manifestPath, 'utf-8')
          const manifest = JSON.parse(manifestContent)

          // Read skill content
          let skillContent = ''
          try {
            skillContent = await fs.readFile(skillPath, 'utf-8')
          } catch {
            console.warn(`[PUFFIN-STATE] Missing skill.md for plugin: ${entry.name}`)
          }

          plugins.push({
            ...manifest,
            id: manifest.id || entry.name,
            skillContent,
            path: pluginDir
          })
        } catch (err) {
          console.warn(`[PUFFIN-STATE] Failed to load plugin "${entry.name}":`, err.message)
        }
      }

      console.log(`[PUFFIN-STATE] Loaded ${plugins.length} Claude Code plugin(s)`)
      return plugins
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Plugins directory doesn't exist yet
        return []
      }
      console.error('[PUFFIN-STATE] Error loading Claude plugins:', err.message)
      return []
    }
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
