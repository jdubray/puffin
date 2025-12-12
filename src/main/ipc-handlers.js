/**
 * Puffin - IPC Handlers
 *
 * Handles inter-process communication between main and renderer.
 * Uses PuffinState for directory-based state management.
 */

const { dialog } = require('electron')
const { PuffinState } = require('./puffin-state')
const { ClaudeService } = require('./claude-service')
const { DeveloperProfileManager } = require('./developer-profile')
const ClaudeMdGenerator = require('./claude-md-generator')

let puffinState = null
let claudeService = null
let developerProfile = null
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
  claudeMdGenerator = new ClaudeMdGenerator()

  // Set Claude CLI working directory to the project path
  claudeService.setProjectPath(projectPath)

  // State handlers
  setupStateHandlers(ipcMain)

  // Claude handlers
  setupClaudeHandlers(ipcMain)

  // File handlers
  setupFileHandlers(ipcMain)

  // Developer profile handlers
  setupProfileHandlers(ipcMain)
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
    console.log('[IPC] projectPath:', projectPath)
    try {
      const result = await claudeService.deriveStories(
        data.prompt,
        projectPath,
        data.project
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

module.exports = { setupIpcHandlers }
