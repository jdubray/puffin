/**
 * Puffin - IPC Handlers
 *
 * Handles inter-process communication between main and renderer.
 * Uses PuffinState for directory-based state management.
 */

const { dialog } = require('electron')
const { PuffinState } = require('./puffin-state')
const { ClaudeService } = require('./claude-service')

let puffinState = null
let claudeService = null
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

  // Set Claude CLI working directory to the project path
  claudeService.setProjectPath(projectPath)

  // State handlers
  setupStateHandlers(ipcMain)

  // Claude handlers
  setupClaudeHandlers(ipcMain)

  // File handlers
  setupFileHandlers(ipcMain)
}

/**
 * State-related IPC handlers (replaces project handlers)
 */
function setupStateHandlers(ipcMain) {
  // Initialize/load state from .puffin/ directory
  ipcMain.handle('state:init', async () => {
    try {
      const state = await puffinState.open(projectPath)
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
      return { success: true, story: newStory }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateUserStory', async (event, { storyId, updates }) => {
    try {
      const story = await puffinState.updateUserStory(storyId, updates)
      return { success: true, story }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:deleteUserStory', async (event, storyId) => {
    try {
      const deleted = await puffinState.deleteUserStory(storyId)
      return { success: true, deleted }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // UI Guidelines operations
  ipcMain.handle('state:updateUiGuidelines', async (event, updates) => {
    try {
      const guidelines = await puffinState.updateUiGuidelines(updates)
      return { success: true, guidelines }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateGuidelineSection', async (event, { section, content }) => {
    try {
      const guidelines = await puffinState.updateGuidelineSection(section, content)
      return { success: true, guidelines }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:addStylesheet', async (event, stylesheet) => {
    try {
      const newStylesheet = await puffinState.addStylesheet(stylesheet)
      return { success: true, stylesheet: newStylesheet }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateStylesheet', async (event, { stylesheetId, updates }) => {
    try {
      const stylesheet = await puffinState.updateStylesheet(stylesheetId, updates)
      return { success: true, stylesheet }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:deleteStylesheet', async (event, stylesheetId) => {
    try {
      const deleted = await puffinState.deleteStylesheet(stylesheetId)
      return { success: true, deleted }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateDesignTokens', async (event, tokenUpdates) => {
    try {
      const tokens = await puffinState.updateDesignTokens(tokenUpdates)
      return { success: true, tokens }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:addComponentPattern', async (event, pattern) => {
    try {
      const newPattern = await puffinState.addComponentPattern(pattern)
      return { success: true, pattern: newPattern }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateComponentPattern', async (event, { patternId, updates }) => {
    try {
      const pattern = await puffinState.updateComponentPattern(patternId, updates)
      return { success: true, pattern }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:deleteComponentPattern', async (event, patternId) => {
    try {
      const deleted = await puffinState.deleteComponentPattern(patternId)
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

  // Generate Claude.md file
  ipcMain.handle('state:generateClaudeMd', async (event, options) => {
    try {
      const result = await puffinState.writeClaudeMd(options)
      return { success: true, path: result.path, content: result.content }
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

module.exports = { setupIpcHandlers }
