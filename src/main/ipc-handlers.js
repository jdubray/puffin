/**
 * Puffin - IPC Handlers
 *
 * Handles inter-process communication between main and renderer.
 * Uses PuffinState for directory-based state management.
 */

const { dialog, shell } = require('electron')
const { PuffinState } = require('./puffin-state')
const { ClaudeService } = require('./claude-service')
const { DeveloperProfileManager } = require('./developer-profile')
const { GitService } = require('./git-service')
const ClaudeMdGenerator = require('./claude-md-generator')

let puffinState = null
let claudeService = null
let developerProfile = null
let gitService = null
let claudeMdGenerator = null
let projectPath = null

/**
 * Setup all IPC handlers
 * @param {IpcMain} ipcMain - Electron IPC main process
 * @param {string} initialProjectPath - The project directory path
 */
function setupIpcHandlers(ipcMain, initialProjectPath) {
  projectPath = initialProjectPath
  puffinState = new PuffinState()
  claudeService = new ClaudeService()
  developerProfile = new DeveloperProfileManager()
  gitService = new GitService()
  claudeMdGenerator = new ClaudeMdGenerator()

  // Set Claude CLI working directory to the project path
  claudeService.setProjectPath(projectPath)

  // Set Git service project path
  gitService.setProjectPath(projectPath)

  // State handlers
  setupStateHandlers(ipcMain)

  // Claude handlers
  setupClaudeHandlers(ipcMain)

  // File handlers
  setupFileHandlers(ipcMain)

  // Developer profile handlers
  setupProfileHandlers(ipcMain)

  // Git handlers
  setupGitHandlers(ipcMain)

  // Shell handlers
  setupShellHandlers(ipcMain)
}

/**
 * State-related IPC handlers (replaces project handlers)
 */
function setupStateHandlers(ipcMain) {
  // Initialize/load state from .puffin/ directory
  ipcMain.handle('state:init', async () => {
    try {
      const state = await puffinState.open(projectPath)

      // Initialize CLAUDE.md generator and generate initial files
      await claudeMdGenerator.initialize(projectPath)
      const activeBranch = state.history?.activeBranch || 'specifications'
      await claudeMdGenerator.generateAll(state, activeBranch)

      return { success: true, state }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get current state
  ipcMain.handle('state:get', async () => {
    try {
      const state = puffinState.getState()
      return { success: true, state }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Update config
  ipcMain.handle('state:updateConfig', async (event, updates) => {
    try {
      const config = await puffinState.updateConfig(updates)

      // Regenerate CLAUDE.md base (config affects all branches)
      const state = puffinState.getState()
      const activeBranch = state.history?.activeBranch || 'specifications'
      await claudeMdGenerator.updateBase(state, activeBranch)

      return { success: true, config }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Update history
  ipcMain.handle('state:updateHistory', async (event, history) => {
    try {
      const updated = await puffinState.updateHistory(history)
      return { success: true, history: updated }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Add prompt to history
  ipcMain.handle('state:addPrompt', async (event, { branchId, prompt }) => {
    try {
      const history = await puffinState.addPrompt(branchId, prompt)
      return { success: true, history }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Update prompt response
  ipcMain.handle('state:updatePromptResponse', async (event, { branchId, promptId, response }) => {
    try {
      const history = await puffinState.updatePromptResponse(branchId, promptId, response)
      return { success: true, history }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Update architecture
  ipcMain.handle('state:updateArchitecture', async (event, content) => {
    try {
      const architecture = await puffinState.updateArchitecture(content)

      // Regenerate architecture branch CLAUDE.md
      const state = puffinState.getState()
      const activeBranch = state.history?.activeBranch || 'specifications'
      await claudeMdGenerator.updateBranch('architecture', state, activeBranch)
      // Also update backend branch (it extracts data model from architecture)
      await claudeMdGenerator.updateBranch('backend', state, activeBranch)

      return { success: true, architecture }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // GUI design operations
  ipcMain.handle('state:saveGuiDesign', async (event, { name, design }) => {
    try {
      const filename = await puffinState.saveGuiDesign(name, design)
      return { success: true, filename }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:listGuiDesigns', async () => {
    try {
      const designs = await puffinState.listGuiDesigns()
      return { success: true, designs }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:loadGuiDesign', async (event, filename) => {
    try {
      const design = await puffinState.loadGuiDesign(filename)
      return { success: true, design }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // GUI definition operations
  ipcMain.handle('state:saveGuiDefinition', async (event, { name, description, elements }) => {
    try {
      const result = await puffinState.saveGuiDefinition(name, description, elements)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:listGuiDefinitions', async () => {
    try {
      const definitions = await puffinState.listGuiDefinitions()
      return { success: true, definitions }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:loadGuiDefinition', async (event, filename) => {
    try {
      const definition = await puffinState.loadGuiDefinition(filename)
      return { success: true, definition }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateGuiDefinition', async (event, { filename, updates }) => {
    try {
      const definition = await puffinState.updateGuiDefinition(filename, updates)
      return { success: true, definition }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:deleteGuiDefinition', async (event, filename) => {
    try {
      await puffinState.deleteGuiDefinition(filename)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // User story operations
  ipcMain.handle('state:getUserStories', async () => {
    try {
      const stories = puffinState.getUserStories()
      return { success: true, stories }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:addUserStory', async (event, story) => {
    try {
      const newStory = await puffinState.addUserStory(story)

      // Regenerate CLAUDE.md base (stories are in base context)
      const state = puffinState.getState()
      const activeBranch = state.history?.activeBranch || 'specifications'
      await claudeMdGenerator.updateBase(state, activeBranch)

      return { success: true, story: newStory }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateUserStory', async (event, { storyId, updates }) => {
    try {
      const story = await puffinState.updateUserStory(storyId, updates)

      // Regenerate CLAUDE.md base (stories are in base context)
      const state = puffinState.getState()
      const activeBranch = state.history?.activeBranch || 'specifications'
      await claudeMdGenerator.updateBase(state, activeBranch)

      return { success: true, story }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:deleteUserStory', async (event, storyId) => {
    try {
      const deleted = await puffinState.deleteUserStory(storyId)

      // Regenerate CLAUDE.md base (stories are in base context)
      const state = puffinState.getState()
      const activeBranch = state.history?.activeBranch || 'specifications'
      await claudeMdGenerator.updateBase(state, activeBranch)

      return { success: true, deleted }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get archived stories
  ipcMain.handle('state:getArchivedStories', async () => {
    try {
      const stories = puffinState.getArchivedStories()
      return { success: true, stories }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Restore an archived story
  ipcMain.handle('state:restoreArchivedStory', async (event, { storyId, newStatus }) => {
    try {
      const story = await puffinState.restoreArchivedStory(storyId, newStatus)

      // Regenerate CLAUDE.md base (stories are in base context)
      const state = puffinState.getState()
      const activeBranch = state.history?.activeBranch || 'specifications'
      await claudeMdGenerator.updateBase(state, activeBranch)

      return { success: true, story }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ============ Sprint Operations ============

  ipcMain.handle('state:updateActiveSprint', async (event, sprint) => {
    try {
      await puffinState.updateActiveSprint(sprint)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Update sprint story progress (for branch started/completed tracking)
  ipcMain.handle('state:updateSprintStoryProgress', async (event, { storyId, branchType, progressUpdate }) => {
    try {
      const result = await puffinState.updateSprintStoryProgress(storyId, branchType, progressUpdate)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get sprint progress summary
  ipcMain.handle('state:getSprintProgress', async () => {
    try {
      const progress = puffinState.getSprintProgress()
      return { success: true, progress }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ============ Design Document Operations ============

  // Get list of available design documents from docs/ directory
  ipcMain.handle('state:getDesignDocuments', async () => {
    try {
      console.log('[IPC] state:getDesignDocuments called')
      console.log('[IPC] puffinState.projectPath:', puffinState.projectPath)
      const documents = await puffinState.getDesignDocuments()
      console.log('[IPC] Found documents:', documents.length)
      return { success: true, documents }
    } catch (error) {
      console.error('[IPC] state:getDesignDocuments error:', error)
      return { success: false, error: error.message }
    }
  })

  // Load a specific design document's content
  ipcMain.handle('state:loadDesignDocument', async (event, filename) => {
    try {
      const document = await puffinState.loadDesignDocument(filename)
      return { success: true, document }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ============ Story Generation Tracking Operations ============

  ipcMain.handle('state:getStoryGenerations', async () => {
    try {
      const generations = puffinState.getStoryGenerations()
      return { success: true, generations }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:addStoryGeneration', async (event, generation) => {
    try {
      const newGeneration = await puffinState.addStoryGeneration(generation)
      return { success: true, generation: newGeneration }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateStoryGeneration', async (event, { generationId, updates }) => {
    try {
      const generation = await puffinState.updateStoryGeneration(generationId, updates)
      return { success: true, generation }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateGeneratedStoryFeedback', async (event, { generationId, storyId, feedback }) => {
    try {
      const story = await puffinState.updateGeneratedStoryFeedback(generationId, storyId, feedback)
      return { success: true, story }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:addImplementationJourney', async (event, journey) => {
    try {
      const newJourney = await puffinState.addImplementationJourney(journey)
      return { success: true, journey: newJourney }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateImplementationJourney', async (event, { journeyId, updates }) => {
    try {
      const journey = await puffinState.updateImplementationJourney(journeyId, updates)
      return { success: true, journey }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:addImplementationInput', async (event, { journeyId, input }) => {
    try {
      const journey = await puffinState.addImplementationInput(journeyId, input)
      return { success: true, journey }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:exportStoryGenerations', async () => {
    try {
      const data = puffinState.exportStoryGenerations()
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Helper to regenerate UI branch CLAUDE.md
  async function regenerateUiBranchContext() {
    const state = puffinState.getState()
    const activeBranch = state.history?.activeBranch || 'specifications'
    await claudeMdGenerator.updateBranch('ui', state, activeBranch)
  }

  // UI Guidelines operations
  ipcMain.handle('state:updateUiGuidelines', async (event, updates) => {
    try {
      const guidelines = await puffinState.updateUiGuidelines(updates)
      await regenerateUiBranchContext()
      return { success: true, guidelines }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateGuidelineSection', async (event, { section, content }) => {
    try {
      const guidelines = await puffinState.updateGuidelineSection(section, content)
      await regenerateUiBranchContext()
      return { success: true, guidelines }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:addStylesheet', async (event, stylesheet) => {
    try {
      const newStylesheet = await puffinState.addStylesheet(stylesheet)
      await regenerateUiBranchContext()
      return { success: true, stylesheet: newStylesheet }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateStylesheet', async (event, { stylesheetId, updates }) => {
    try {
      const stylesheet = await puffinState.updateStylesheet(stylesheetId, updates)
      await regenerateUiBranchContext()
      return { success: true, stylesheet }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:deleteStylesheet', async (event, stylesheetId) => {
    try {
      const deleted = await puffinState.deleteStylesheet(stylesheetId)
      await regenerateUiBranchContext()
      return { success: true, deleted }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateDesignTokens', async (event, tokenUpdates) => {
    try {
      const tokens = await puffinState.updateDesignTokens(tokenUpdates)
      await regenerateUiBranchContext()
      return { success: true, tokens }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:addComponentPattern', async (event, pattern) => {
    try {
      const newPattern = await puffinState.addComponentPattern(pattern)
      await regenerateUiBranchContext()
      return { success: true, pattern: newPattern }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateComponentPattern', async (event, { patternId, updates }) => {
    try {
      const pattern = await puffinState.updateComponentPattern(patternId, updates)
      await regenerateUiBranchContext()
      return { success: true, pattern }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:deleteComponentPattern', async (event, patternId) => {
    try {
      const deleted = await puffinState.deleteComponentPattern(patternId)
      await regenerateUiBranchContext()
      return { success: true, deleted }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:exportUiGuidelines', async (event, options) => {
    try {
      const exported = await puffinState.exportUiGuidelines(options)
      return { success: true, content: exported }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Generate Claude.md file (legacy - static generation)
  ipcMain.handle('state:generateClaudeMd', async (event, options) => {
    try {
      const result = await puffinState.writeClaudeMd(options)
      return { success: true, path: result.path, content: result.content }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Activate a branch - swaps CLAUDE.md to branch-specific content
  ipcMain.handle('state:activateBranch', async (event, branchId) => {
    try {
      const state = puffinState.getState()
      await claudeMdGenerator.activateBranch(branchId)
      return { success: true, branchId }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

/**
 * Claude CLI IPC handlers
 */
function setupClaudeHandlers(ipcMain) {
  // Check if Claude CLI is available
  ipcMain.handle('claude:check', async () => {
    const available = await claudeService.isAvailable()
    const version = available ? await claudeService.getVersion() : null
    return { available, version }
  })

  // Submit prompt to Claude CLI
  ipcMain.on('claude:submit', async (event, data) => {
    try {
      // Ensure we're using the correct project path
      const submitData = {
        ...data,
        projectPath: projectPath
      }

      await claudeService.submit(
        submitData,
        // On chunk received (streaming output)
        (chunk) => {
          event.sender.send('claude:response', chunk)
        },
        // On complete
        (response) => {
          event.sender.send('claude:complete', response)
        },
        // On raw JSON line (for CLI Output view)
        (jsonLine) => {
          event.sender.send('claude:raw', jsonLine)
        }
      )
    } catch (error) {
      console.error('[IPC-ERROR] claude:submit failed:', error)
      console.error('[IPC-ERROR] Error stack:', error.stack)
      event.sender.send('claude:error', { message: error.message })
    }
  })

  // Cancel current request
  ipcMain.on('claude:cancel', () => {
    claudeService.cancel()
  })

  // Derive user stories from a prompt
  ipcMain.on('claude:deriveStories', async (event, data) => {
    console.log('[IPC] claude:deriveStories received')
    console.log('[IPC] prompt length:', data?.prompt?.length || 0)
    console.log('[IPC] conversationContext length:', data?.conversationContext?.length || 0)
    console.log('[IPC] projectPath:', projectPath)

    // Send progress updates to renderer for debugging
    const sendProgress = (message) => {
      console.log('[IPC-PROGRESS]', message)
      event.sender.send('claude:derivationProgress', { message, timestamp: Date.now() })
    }

    sendProgress('Starting story derivation...')

    try {
      sendProgress('Calling claudeService.deriveStories...')
      const result = await claudeService.deriveStories(
        data.prompt,
        projectPath,
        data.project,
        sendProgress,  // Pass progress callback
        data.conversationContext  // Pass conversation context
      )

      console.log('[IPC] deriveStories result:', result?.success, 'stories:', result?.stories?.length || 0)

      if (result.success) {
        console.log('[IPC] Sending claude:storiesDerived with', result.stories.length, 'stories')
        event.sender.send('claude:storiesDerived', {
          stories: result.stories,
          originalPrompt: data.prompt
        })
      } else {
        // Include helpful context for the user to retry
        event.sender.send('claude:storyDerivationError', {
          error: result.error,
          rawResponse: result.rawResponse,
          canRetry: true,
          suggestion: 'Try rephrasing your request with more specific details about what you want to build.'
        })
      }
    } catch (error) {
      console.error('[IPC] deriveStories error:', error)
      event.sender.send('claude:storyDerivationError', {
        error: error.message,
        canRetry: true
      })
    }
  })

  // Modify stories based on feedback
  ipcMain.on('claude:modifyStories', async (event, data) => {
    try {
      const result = await claudeService.modifyStories(
        data.stories,
        data.feedback,
        projectPath,
        data.project
      )

      if (result.success) {
        event.sender.send('claude:storiesDerived', {
          stories: result.stories,
          originalPrompt: data.originalPrompt
        })
      } else {
        event.sender.send('claude:storyDerivationError', {
          error: result.error
        })
      }
    } catch (error) {
      event.sender.send('claude:storyDerivationError', {
        error: error.message
      })
    }
  })

  // Generate title for a prompt
  ipcMain.handle('claude:generateTitle', async (event, content) => {
    try {
      const title = await claudeService.generateTitle(content)
      return { success: true, title }
    } catch (error) {
      console.warn('Title generation failed:', error)
      return { success: true, title: claudeService.generateFallbackTitle(content) }
    }
  })

  // Send a simple prompt and get a response (non-streaming)
  ipcMain.handle('claude:sendPrompt', async (event, prompt, options = {}) => {
    try {
      const result = await claudeService.sendPrompt(prompt, options)
      return result
    } catch (error) {
      console.error('sendPrompt failed:', error)
      return { success: false, error: error.message }
    }
  })
}

/**
 * File operation IPC handlers
 */
function setupFileHandlers(ipcMain) {
  // Export data
  ipcMain.handle('file:export', async (event, data) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: 'Export',
        defaultPath: data.filename || 'export',
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'Markdown', extensions: ['md'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (filePath) {
        const fs = require('fs').promises
        await fs.writeFile(filePath, data.content, 'utf-8')
        return { success: true, filePath }
      }

      return { success: false, error: 'Export cancelled' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Import data
  ipcMain.handle('file:import', async (event, type) => {
    try {
      const filters = type === 'json'
        ? [{ name: 'JSON', extensions: ['json'] }]
        : [{ name: 'All Files', extensions: ['*'] }]

      const { filePaths } = await dialog.showOpenDialog({
        title: 'Import',
        filters,
        properties: ['openFile']
      })

      if (filePaths && filePaths.length > 0) {
        const fs = require('fs').promises
        const content = await fs.readFile(filePaths[0], 'utf-8')
        return { success: true, content, filePath: filePaths[0] }
      }

      return { success: false, error: 'Import cancelled' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Save markdown content to file
  ipcMain.handle('file:saveMarkdown', async (event, content) => {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Save Markdown',
        defaultPath: 'response.md',
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (canceled || !filePath) {
        return { success: false, canceled: true }
      }

      const fs = require('fs').promises
      await fs.writeFile(filePath, content, 'utf-8')
      return { success: true, filePath }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

/**
 * Developer profile IPC handlers
 */
function setupProfileHandlers(ipcMain) {
  // Get developer profile
  ipcMain.handle('profile:get', async () => {
    try {
      const profile = await developerProfile.get()
      return { success: true, profile }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Check if profile exists
  ipcMain.handle('profile:exists', async () => {
    try {
      const exists = await developerProfile.exists()
      return { success: true, exists }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Create developer profile
  ipcMain.handle('profile:create', async (event, profileData) => {
    try {
      // Validate first
      const validation = developerProfile.validate(profileData)
      if (!validation.isValid) {
        return { success: false, errors: validation.errors }
      }

      const profile = await developerProfile.create(profileData)
      return { success: true, profile }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Update developer profile
  ipcMain.handle('profile:update', async (event, updates) => {
    try {
      // Validate updates
      const currentProfile = await developerProfile.get()
      if (!currentProfile) {
        return { success: false, error: 'No profile exists to update' }
      }

      const mergedData = { ...currentProfile, ...updates }
      const validation = developerProfile.validate(mergedData)
      if (!validation.isValid) {
        return { success: false, errors: validation.errors }
      }

      const profile = await developerProfile.update(updates)
      return { success: true, profile }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Delete developer profile
  ipcMain.handle('profile:delete', async () => {
    try {
      const deleted = await developerProfile.delete()
      return { success: true, deleted }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Export developer profile
  ipcMain.handle('profile:export', async () => {
    try {
      const profileJson = await developerProfile.exportProfile()

      // Show save dialog
      const { filePath } = await dialog.showSaveDialog({
        title: 'Export Developer Profile',
        defaultPath: 'developer-profile.json',
        filters: [
          { name: 'JSON', extensions: ['json'] }
        ]
      })

      if (filePath) {
        const fs = require('fs').promises
        await fs.writeFile(filePath, profileJson, 'utf-8')
        return { success: true, filePath }
      }

      return { success: false, error: 'Export cancelled' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Import developer profile
  ipcMain.handle('profile:import', async (event, { overwrite = false } = {}) => {
    try {
      // Show open dialog
      const { filePaths } = await dialog.showOpenDialog({
        title: 'Import Developer Profile',
        filters: [
          { name: 'JSON', extensions: ['json'] }
        ],
        properties: ['openFile']
      })

      if (filePaths && filePaths.length > 0) {
        const fs = require('fs').promises
        const content = await fs.readFile(filePaths[0], 'utf-8')

        // Validate JSON before importing
        let parsedContent
        try {
          parsedContent = JSON.parse(content)
        } catch {
          return { success: false, error: 'Invalid JSON file' }
        }

        // Check if we need to warn about overwrite
        const exists = await developerProfile.exists()
        if (exists && !overwrite) {
          return {
            success: false,
            error: 'Profile already exists',
            requiresOverwrite: true
          }
        }

        const profile = await developerProfile.importProfile(content, overwrite)
        return { success: true, profile }
      }

      return { success: false, error: 'Import cancelled' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get available coding style options
  ipcMain.handle('profile:getOptions', async () => {
    try {
      const options = developerProfile.getOptions()
      return { success: true, options }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Validate profile data without saving
  ipcMain.handle('profile:validate', async (event, profileData) => {
    try {
      const validation = developerProfile.validate(profileData)
      return { success: true, ...validation }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ============================================
  // GitHub Integration Handlers
  // ============================================

  // Connect with Personal Access Token
  ipcMain.handle('github:connectWithPAT', async (event, token) => {
    try {
      const profile = await developerProfile.connectWithPAT(token)
      return { success: true, profile }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Start GitHub OAuth Device Flow
  ipcMain.handle('github:startAuth', async () => {
    try {
      const deviceInfo = await developerProfile.startGithubAuth()
      return { success: true, ...deviceInfo }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Open GitHub verification URL in browser
  ipcMain.handle('github:openAuth', async (event, verificationUri) => {
    try {
      await developerProfile.openGithubAuth(verificationUri)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Poll for GitHub token (this runs in background)
  ipcMain.handle('github:pollToken', async (event, { deviceCode, interval, expiresIn }) => {
    try {
      const tokenInfo = await developerProfile.pollForGithubToken(deviceCode, interval, expiresIn)
      // Complete authentication and update profile
      const profile = await developerProfile.completeGithubAuth(tokenInfo)
      return { success: true, profile }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Check if GitHub is connected
  ipcMain.handle('github:isConnected', async () => {
    try {
      const connected = await developerProfile.isGithubConnected()
      return { success: true, connected }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Disconnect GitHub
  ipcMain.handle('github:disconnect', async () => {
    try {
      const profile = await developerProfile.disconnectGithub()
      return { success: true, profile }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Refresh GitHub profile data
  ipcMain.handle('github:refreshProfile', async () => {
    try {
      const profile = await developerProfile.refreshGithubProfile()
      return { success: true, profile }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Fetch GitHub repositories
  ipcMain.handle('github:getRepositories', async (event, options = {}) => {
    try {
      const { repositories, rateLimit } = await developerProfile.fetchGithubRepositories(options)
      return { success: true, repositories, rateLimit }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Fetch GitHub activity
  ipcMain.handle('github:getActivity', async (event, perPage = 30) => {
    try {
      const { events, rateLimit } = await developerProfile.fetchGithubActivity(perPage)
      return { success: true, events, rateLimit }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

/**
 * Git operation IPC handlers
 */
function setupGitHandlers(ipcMain) {
  // Check if Git is available on the system
  ipcMain.handle('git:isAvailable', async () => {
    try {
      const available = await gitService.isGitAvailable()
      return { success: true, available }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Check if project is a Git repository
  ipcMain.handle('git:isRepository', async () => {
    try {
      const result = await gitService.isGitRepository()
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get repository status (branch, files, ahead/behind)
  ipcMain.handle('git:getStatus', async () => {
    try {
      const result = await gitService.getStatus()
      if (result.success) {
        return { success: true, status: result.status }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get current branch name
  ipcMain.handle('git:getCurrentBranch', async () => {
    try {
      const result = await gitService.getCurrentBranch()
      if (result.success) {
        return { success: true, branch: result.branch }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get list of all branches
  ipcMain.handle('git:getBranches', async () => {
    try {
      const result = await gitService.getBranches()
      if (result.success) {
        return { success: true, branches: result.branches }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Validate branch name
  ipcMain.handle('git:validateBranchName', async (event, name) => {
    try {
      const result = gitService.validateBranchName(name)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Create a new branch
  ipcMain.handle('git:createBranch', async (event, { name, prefix, checkout }) => {
    try {
      const result = await gitService.createBranch(name, { prefix, checkout })
      if (result.success) {
        // Log the operation
        await puffinState.addGitOperation({
          type: 'branch_create',
          branch: result.branch,
          details: { prefix, checkout }
        })
        return { success: true, branch: result.branch }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Checkout a branch
  ipcMain.handle('git:checkout', async (event, name) => {
    try {
      const result = await gitService.checkout(name)
      if (result.success) {
        // Log the operation
        await puffinState.addGitOperation({
          type: 'checkout',
          branch: result.branch
        })
        return { success: true, branch: result.branch }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Stage files
  ipcMain.handle('git:stageFiles', async (event, files) => {
    try {
      const result = await gitService.stageFiles(files)
      if (result.success) {
        return { success: true, staged: result.staged }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Unstage files
  ipcMain.handle('git:unstageFiles', async (event, files) => {
    try {
      const result = await gitService.unstageFiles(files)
      if (result.success) {
        return { success: true, unstaged: result.unstaged }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Create a commit
  ipcMain.handle('git:commit', async (event, { message, sessionId }) => {
    try {
      const result = await gitService.commit(message)
      if (result.success) {
        // Log the operation with session link if provided
        await puffinState.addGitOperation({
          type: 'commit',
          hash: result.hash,
          message: message,
          sessionId: sessionId || null
        })
        return { success: true, hash: result.hash }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Merge a branch
  ipcMain.handle('git:merge', async (event, { sourceBranch, noFf }) => {
    try {
      const result = await gitService.merge(sourceBranch, { noFf })
      if (result.success) {
        // Log the operation
        await puffinState.addGitOperation({
          type: 'merge',
          sourceBranch,
          details: { noFf }
        })
        return { success: true, merged: result.merged }
      }
      // Return merge conflict details if present
      if (result.conflicts) {
        return {
          success: false,
          conflicts: result.conflicts,
          error: result.error,
          guidance: result.guidance
        }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Abort merge
  ipcMain.handle('git:abortMerge', async () => {
    try {
      const result = await gitService.abortMerge()
      if (result.success) {
        return { success: true }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Delete a branch
  ipcMain.handle('git:deleteBranch', async (event, { name, force }) => {
    try {
      const result = await gitService.deleteBranch(name, { force })
      if (result.success) {
        // Log the operation
        await puffinState.addGitOperation({
          type: 'branch_delete',
          branch: result.deleted
        })
        return { success: true, deleted: result.deleted }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get commit log
  ipcMain.handle('git:getLog', async (event, options = {}) => {
    try {
      const result = await gitService.getLog(options)
      if (result.success) {
        return { success: true, commits: result.commits }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get diff
  ipcMain.handle('git:getDiff', async (event, options = {}) => {
    try {
      const result = await gitService.getDiff(options)
      if (result.success) {
        return { success: true, diff: result.diff }
      }
      return { success: false, error: result.error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get Git settings
  ipcMain.handle('git:getSettings', async () => {
    try {
      const settings = gitService.getSettings()
      return { success: true, settings }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Update Git settings
  ipcMain.handle('git:updateSettings', async (event, settings) => {
    try {
      gitService.updateSettings(settings)
      // Also persist to puffin state
      await puffinState.updateGitSettings(settings)
      return { success: true, settings: gitService.getSettings() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get Git operation history
  ipcMain.handle('git:getOperationHistory', async (event, options = {}) => {
    try {
      const history = puffinState.getGitOperationHistory(options)
      return { success: true, history }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Configure Git user identity
  ipcMain.handle('git:configureUserIdentity', async (event, { name, email, global = false }) => {
    try {
      const result = await gitService.configureUserIdentity(name, email, global)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get Git user identity
  ipcMain.handle('git:getUserIdentity', async (event, global = false) => {
    try {
      const result = await gitService.getUserIdentity(global)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

/**
 * Shell operation handlers
 */
function setupShellHandlers(ipcMain) {
  // Open external URL in default browser
  ipcMain.handle('shell:openExternal', async (event, url) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

/**
 * Plugin system IPC handlers (basic - loader only)
 * @param {IpcMain} ipcMain
 * @param {PluginLoader} pluginLoader
 */
function setupPluginHandlers(ipcMain, pluginLoader) {
  // Get list of all plugins
  ipcMain.handle('plugins:list', async () => {
    try {
      const plugins = pluginLoader.getAllPlugins().map(p => p.toJSON())
      return { success: true, plugins }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get loaded plugins only
  ipcMain.handle('plugins:listLoaded', async () => {
    try {
      const plugins = pluginLoader.getLoadedPlugins().map(p => p.toJSON())
      return { success: true, plugins }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get failed plugins with errors
  ipcMain.handle('plugins:listFailed', async () => {
    try {
      const plugins = pluginLoader.getFailedPlugins().map(p => p.toJSON())
      return { success: true, plugins }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get plugin by name
  ipcMain.handle('plugins:get', async (event, name) => {
    try {
      const plugin = pluginLoader.getPlugin(name)
      if (!plugin) {
        return { success: false, error: `Plugin not found: ${name}` }
      }
      return { success: true, plugin: plugin.toJSON() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get plugin load errors
  ipcMain.handle('plugins:getErrors', async () => {
    try {
      const errors = pluginLoader.getErrors()
      return { success: true, errors }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get plugin summary
  ipcMain.handle('plugins:getSummary', async () => {
    try {
      const summary = pluginLoader.getSummary()
      return { success: true, summary }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Reload all plugins
  ipcMain.handle('plugins:reload', async () => {
    try {
      const result = await pluginLoader.reloadPlugins()
      return {
        success: true,
        loaded: result.loaded.map(p => p.toJSON()),
        failed: result.failed.map(p => p.toJSON())
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get plugins directory path
  ipcMain.handle('plugins:getDirectory', async () => {
    try {
      const directory = pluginLoader.getPluginsDirectory()
      return { success: true, directory }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

/**
 * Plugin manager IPC handlers (full lifecycle management)
 * @param {IpcMain} ipcMain
 * @param {PluginManager} pluginManager
 */
function setupPluginManagerHandlers(ipcMain, pluginManager) {
  // Enable a plugin
  ipcMain.handle('plugins:enable', async (event, name) => {
    try {
      const success = await pluginManager.enablePlugin(name)
      return { success }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Disable a plugin
  ipcMain.handle('plugins:disable', async (event, name) => {
    try {
      const success = await pluginManager.disablePlugin(name)
      return { success }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get active plugins
  ipcMain.handle('plugins:listActive', async () => {
    try {
      const activeNames = pluginManager.getActivePlugins()
      return { success: true, plugins: activeNames }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get plugin state (active/inactive/error)
  ipcMain.handle('plugins:getState', async (event, name) => {
    try {
      const state = pluginManager.getPluginState(name)
      const error = pluginManager.getActivationError(name)
      return { success: true, state, error }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get full plugin info (with lifecycle state)
  ipcMain.handle('plugins:getInfo', async (event, name) => {
    try {
      const info = await pluginManager.getPluginInfo(name)
      if (!info) {
        return { success: false, error: `Plugin not found: ${name}` }
      }
      return { success: true, info }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get full summary (includes manager state)
  ipcMain.handle('plugins:getFullSummary', async () => {
    try {
      const summary = await pluginManager.getSummary()
      return { success: true, summary }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Reload a specific plugin
  ipcMain.handle('plugins:reloadPlugin', async (event, name) => {
    try {
      await pluginManager.reloadPlugin(name)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get registry summary
  ipcMain.handle('plugins:getRegistrySummary', async () => {
    try {
      const registry = pluginManager.getRegistry()
      const summary = registry.getSummary()
      return { success: true, summary }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get all registered actions
  ipcMain.handle('plugins:getActions', async () => {
    try {
      const registry = pluginManager.getRegistry()
      const actions = registry.getAllActions()
      return { success: true, actions }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get all registered components
  ipcMain.handle('plugins:getComponents', async () => {
    try {
      const registry = pluginManager.getRegistry()
      const components = registry.getAllComponents()
      return { success: true, components }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

module.exports = { setupIpcHandlers, setupPluginHandlers, setupPluginManagerHandlers }
