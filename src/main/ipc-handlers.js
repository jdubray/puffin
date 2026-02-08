/**
 * Puffin - IPC Handlers
 *
 * Handles inter-process communication between main and renderer.
 * Uses PuffinState for directory-based state management.
 */

const { dialog, shell } = require('electron')
const { marked } = require('marked')
const fs = require('fs')
const path = require('path')
const { PuffinState } = require('./puffin-state')
const { ClaudeService } = require('./claude-service')
const { DeveloperProfileManager } = require('./developer-profile')
const { GitService } = require('./git-service')
const ClaudeMdGenerator = require('./claude-md-generator')
const { AssertionEvaluator } = require('./evaluators/assertion-evaluator')
const { AssertionGenerator } = require('./generators/assertion-generator')
const { getTempImageService } = require('./services')

let puffinState = null
let claudeService = null
let developerProfile = null
let gitService = null
let claudeMdGenerator = null
let tempImageService = null
let projectPath = null

// Maximum allowed image file size (50MB)
const MAX_IMAGE_SIZE = 50 * 1024 * 1024

// Windows reserved filenames that can cause git issues
const WINDOWS_RESERVED_NAMES = ['nul', 'con', 'prn', 'aux', 'com1', 'com2', 'com3', 'com4', 'lpt1', 'lpt2', 'lpt3']

/**
 * Clean up Windows reserved filenames from the project root
 * These files can be accidentally created and prevent git operations
 */
function cleanupWindowsReservedFiles() {
  if (!projectPath) return

  for (const name of WINDOWS_RESERVED_NAMES) {
    const filePath = path.join(projectPath, name)
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        console.log(`[GIT-CLEANUP] Removed Windows reserved file: ${name}`)
      }
    } catch (e) {
      // Ignore errors - file might be locked or not exist
    }
  }
}

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

  // Image attachment handlers
  setupImageHandlers(ipcMain)
}

/**
 * State-related IPC handlers (replaces project handlers)
 */
function setupStateHandlers(ipcMain) {
  // Initialize/load state from .puffin/ directory
  ipcMain.handle('state:init', async () => {
    try {
      const state = await puffinState.open(projectPath)

      // Initialize CRE (Central Reasoning Engine)
      try {
        const cre = require('./cre')
        await cre.initialize({
          ipcMain,
          app: require('electron').app,
          db: puffinState.database.connection.getConnection(),
          config: state.config || {},
          projectRoot: projectPath,
          claudeService
        })
        // Persist CRE defaults into config.json on first init
        if (state.config?.cre) {
          await puffinState.saveConfig()
        }
      } catch (creErr) {
        console.error('[CRE] Initialization failed (non-fatal):', creErr.message)
      }

      // Initialize CLAUDE.md generator and generate initial files
      await claudeMdGenerator.initialize(projectPath)
      const activeBranch = state.history?.activeBranch || 'specifications'

      // Pass skill and agent content getters to include assigned content in branch files
      const getSkillContent = (branchId) => puffinState.getBranchSkillContent(branchId)
      const getAgentContent = (branchId) => puffinState.getBranchAgentContent(branchId)
      await claudeMdGenerator.generateAll(state, activeBranch, getSkillContent, getAgentContent)

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
      // Get existing branches before update
      const oldState = puffinState.getState()
      const existingBranches = Object.keys(oldState.history?.branches || {})

      const updated = await puffinState.updateHistory(history)

      // Check for new branches and create their CLAUDE files
      const newBranches = Object.keys(history.branches || {})
      for (const branchId of newBranches) {
        if (!existingBranches.includes(branchId)) {
          console.log(`[IPC] Creating CLAUDE file for new branch: ${branchId}`)
          const state = puffinState.getState()
          const skillContent = puffinState.getBranchSkillContent(branchId)
          const agentContent = puffinState.getBranchAgentContent(branchId)
          await claudeMdGenerator.generateBranch(branchId, state, skillContent, agentContent)
        }
      }

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

  // Process sync inbox from CLI (allows refresh without restart)
  ipcMain.handle('state:processSyncInbox', async () => {
    try {
      await puffinState.processSyncInbox()
      return { success: true, history: puffinState.history }
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

  // User story operations
  ipcMain.handle('state:getUserStories', async () => {
    try {
      const stories = puffinState.getUserStories()
      console.log('[IPC:getUserStories] Returning', stories?.length || 0, 'stories from database')
      // SAFETY: Ensure we always return an array, never null/undefined
      if (!Array.isArray(stories)) {
        console.error('[IPC:getUserStories] SAFETY: stories is not an array, returning empty array')
        return { success: true, stories: [] }
      }
      if (stories.length === 0) {
        console.warn('[IPC:getUserStories] WARNING: Database returned 0 stories')
      }
      return { success: true, stories }
    } catch (error) {
      console.error('[IPC:getUserStories] Error:', error.message)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:addUserStory', async (event, story) => {
    try {
      // Create the story first
      let newStory = await puffinState.addUserStory(story)

      // Auto-generate inspection assertions if not already provided
      if (!newStory.inspectionAssertions || newStory.inspectionAssertions.length === 0) {
        try {
          const generator = new AssertionGenerator()
          const result = generator.generate(newStory, { includeSuggestions: false })

          if (result.assertions && result.assertions.length > 0) {
            // Update the story with generated assertions
            newStory = await puffinState.updateUserStory(newStory.id, {
              inspectionAssertions: result.assertions
            })
            console.log(`[IPC] Auto-generated ${result.assertions.length} assertions for story: ${newStory.title}`)
          }
        } catch (genError) {
          console.warn('[IPC] Failed to auto-generate assertions:', genError.message)
          // Don't fail the story creation if assertion generation fails
        }
      }

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
      console.log('[IPC] deleteUserStory called with storyId:', storyId)
      const deleted = await puffinState.deleteUserStory(storyId)
      console.log('[IPC] deleteUserStory result:', deleted ? 'deleted successfully' : 'story not found')

      // Regenerate CLAUDE.md base (stories are in base context)
      const state = puffinState.getState()
      const activeBranch = state.history?.activeBranch || 'specifications'
      await claudeMdGenerator.updateBase(state, activeBranch)

      return { success: true, deleted }
    } catch (error) {
      console.error('[IPC] deleteUserStory error:', error.message)
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

  // Check if an active sprint exists (for single-sprint enforcement)
  ipcMain.handle('state:hasActiveSprint', async () => {
    try {
      if (!puffinState.database?.sprints) {
        return { success: true, hasActive: false }
      }
      const hasActive = puffinState.database.sprints.hasActiveSprint()
      const activeSprint = hasActive ? puffinState.database.sprints.findActive() : null
      return {
        success: true,
        hasActive,
        activeSprint: activeSprint ? {
          id: activeSprint.id,
          title: activeSprint.title || `Sprint ${activeSprint.id?.substring(0, 6)}`
        } : null
      }
    } catch (error) {
      console.error('[IPC] state:hasActiveSprint failed:', error.message)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('state:updateActiveSprint', async (event, sprint) => {
    try {
      console.log(`[IPC] state:updateActiveSprint called with sprint: id=${sprint?.id}, status=${sprint?.status}, stories=${sprint?.stories?.length || 0}`)
      await puffinState.updateActiveSprint(sprint)
      console.log('[IPC] state:updateActiveSprint completed successfully')
      return { success: true }
    } catch (error) {
      console.error('[IPC] state:updateActiveSprint failed:', error.message)
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

  // Atomically sync story status between sprint and backlog
  // This updates both in a single transaction - no manual refresh needed
  ipcMain.handle('state:syncStoryStatus', async (event, { storyId, status }) => {
    try {
      const result = await puffinState.syncStoryStatus(storyId, status)

      // Emit event for UI refresh (no polling needed)
      if (result.success) {
        event.sender.send('story-status-synced', {
          storyId,
          status,
          sprint: result.sprint,
          story: result.story,
          allStoriesCompleted: result.allStoriesCompleted
        })
      }

      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ============ Sprint History Operations ============

  // Archive sprint to history
  ipcMain.handle('state:archiveSprintToHistory', async (event, sprint) => {
    try {
      const archivedSprint = await puffinState.archiveSprintToHistory(sprint)
      return { success: true, sprint: archivedSprint }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get sprint history
  ipcMain.handle('state:getSprintHistory', async (event, options = {}) => {
    try {
      const sprints = puffinState.getSprintHistory(options)
      return { success: true, sprints }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get specific archived sprint with resolved stories
  ipcMain.handle('state:getArchivedSprint', async (event, sprintId) => {
    try {
      const sprint = await puffinState.getArchivedSprint(sprintId)
      if (!sprint) {
        return { success: false, error: 'Sprint not found' }
      }
      return { success: true, sprint }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Delete sprint without archiving (for zero-progress sprints)
  // Returns all stories to pending status
  ipcMain.handle('state:deleteSprint', async (event, sprintId) => {
    try {
      const result = await puffinState.deleteSprint(sprintId)
      return { success: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ============ Inspection Assertion Evaluation ============

  // Evaluate assertions for a user story
  ipcMain.handle('state:evaluateStoryAssertions', async (event, storyId) => {
    try {
      // Get story with its assertions
      const story = puffinState.getUserStoryById(storyId)
      if (!story) {
        return { success: false, error: 'Story not found' }
      }

      // Get inspection assertions for the story.
      // getStoryInspectionAssertions checks user_stories.inspection_assertions first,
      // then falls back to the CRE inspection_assertions table if the column is empty.
      const assertions = puffinState.getStoryInspectionAssertions(storyId)
      console.log('[IPC] evaluateStoryAssertions:', storyId, 'assertions:', assertions?.length || 0)
      if (!assertions || assertions.length === 0) {
        return {
          success: true,
          results: {
            evaluatedAt: new Date().toISOString(),
            summary: { total: 0, passed: 0, failed: 0, error: 0 },
            results: []
          },
          storyId
        }
      }

      // Create evaluator with project path
      const evaluator = new AssertionEvaluator(projectPath)

      // Evaluate all assertions with progress reporting
      const results = await evaluator.evaluateAll(assertions, (index, total, result) => {
        // Emit progress events for UI updates
        event.sender.send('assertion-evaluation-progress', {
          storyId,
          current: index,
          total,
          lastResult: result
        })
      })

      // Store results in database
      await puffinState.saveAssertionResults(storyId, results)

      // Emit completion event
      event.sender.send('assertion-evaluation-complete', {
        storyId,
        results
      })

      return { success: true, results, storyId }
    } catch (error) {
      console.error('[IPC] evaluateStoryAssertions error:', error)
      return { success: false, error: error.message }
    }
  })

  // Sync assertions from the CRE inspection_assertions table to user_stories column.
  // The CRE generator writes to both, but the user_stories write can fail silently.
  // This handler reconciles the two stores for a list of story IDs.
  ipcMain.handle('state:syncAssertionsFromCreTable', async (_event, storyIds) => {
    if (!Array.isArray(storyIds) || storyIds.length === 0) {
      return { success: true, synced: 0 }
    }
    let synced = 0
    try {
      const db = puffinState.database.connection.getConnection()
      for (const storyId of storyIds) {
        // Check if user_stories already has assertions
        const row = db.prepare('SELECT inspection_assertions FROM user_stories WHERE id = ?').get(storyId)
        if (!row) continue
        const existing = JSON.parse(row.inspection_assertions || '[]')
        if (existing.length > 0) continue // already has assertions

        // Check CRE inspection_assertions table
        const creRows = db.prepare(
          'SELECT id, type, target, message, assertion_data FROM inspection_assertions WHERE story_id = ? ORDER BY created_at'
        ).all(storyId)
        if (creRows.length === 0) continue

        const assertions = creRows.map(r => ({
          id: r.id,
          type: r.type,
          target: r.target,
          message: r.message,
          assertion: JSON.parse(r.assertion_data || '{}')
        }))
        db.prepare('UPDATE user_stories SET inspection_assertions = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(assertions), new Date().toISOString(), storyId)
        synced++
        console.log(`[IPC] syncAssertionsFromCreTable: synced ${assertions.length} assertions for story ${storyId}`)
      }
      return { success: true, synced }
    } catch (error) {
      console.error('[IPC] syncAssertionsFromCreTable error:', error)
      return { success: false, error: error.message, synced }
    }
  })

  // Get stored assertion results for a story
  ipcMain.handle('state:getAssertionResults', async (event, storyId) => {
    try {
      const results = puffinState.getAssertionResults(storyId)
      return { success: true, results, storyId }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Evaluate a single assertion (for manual re-runs)
  ipcMain.handle('state:evaluateSingleAssertion', async (event, { storyId, assertionId }) => {
    try {
      const assertions = puffinState.getStoryInspectionAssertions(storyId)
      const assertion = assertions?.find(a => a.id === assertionId)

      if (!assertion) {
        return { success: false, error: 'Assertion not found' }
      }

      const evaluator = new AssertionEvaluator(projectPath)
      const result = await evaluator.evaluateAssertion(assertion)

      return { success: true, result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Generate inspection assertions from a story
  ipcMain.handle('state:generateAssertions', async (event, { story, options }) => {
    try {
      const generator = new AssertionGenerator()
      const result = generator.generate(story, {
        includeSuggestions: options?.includeSuggestions ?? true,
        projectContext: options?.projectContext
      })

      console.log('[IPC] generateAssertions:', {
        storyTitle: story.title,
        assertionCount: result.assertions.length,
        suggestionCount: result.suggestions?.length || 0
      })

      return { success: true, ...result }
    } catch (error) {
      console.error('[IPC] generateAssertions error:', error)
      return { success: false, error: error.message }
    }
  })

  // Get assertion generation patterns for UI display
  ipcMain.handle('state:getAssertionPatterns', async () => {
    try {
      const generator = new AssertionGenerator()
      const patterns = generator.getPatternDescriptions()
      const types = generator.getAssertionTypes()
      return { success: true, patterns, types }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Generate inspection assertions for sprint stories using Claude
  ipcMain.handle('state:generateSprintAssertions', async (event, { stories, plan, model }) => {
    try {
      console.log('[IPC] generateSprintAssertions called with', stories.length, 'stories')

      // Use the module-level claudeService instance
      if (!claudeService) {
        return { success: false, error: 'Claude service not available' }
      }

      // Get coding standard from config (if configured)
      const codingStandard = puffinState?.config?.codingStandard?.content || ''

      // Generate assertions via Claude
      const result = await claudeService.generateInspectionAssertions(stories, plan, codingStandard, (msg) => {
        // Send progress updates to renderer
        event.sender.send('assertion-generation-progress', { message: msg })
      }, model)

      if (!result.success) {
        console.error('[IPC] generateSprintAssertions failed:', result.error)
        return { success: false, error: result.error }
      }

      // Persist assertions to each story in the database
      const assertionsByStory = result.assertions
      let totalPersisted = 0

      for (const [storyId, assertions] of Object.entries(assertionsByStory)) {
        if (Array.isArray(assertions) && assertions.length > 0) {
          try {
            await puffinState.updateUserStory(storyId, {
              inspectionAssertions: assertions
            })
            totalPersisted += assertions.length
            console.log(`[IPC] Persisted ${assertions.length} assertions for story ${storyId}`)
          } catch (err) {
            console.error(`[IPC] Failed to persist assertions for story ${storyId}:`, err)
          }
        }
      }

      console.log('[IPC] generateSprintAssertions complete:', totalPersisted, 'assertions persisted')
      return {
        success: true,
        assertions: assertionsByStory,
        totalAssertions: totalPersisted
      }
    } catch (error) {
      console.error('[IPC] generateSprintAssertions error:', error)
      return { success: false, error: error.message }
    }
  })

  // ============ Completion Summary Operations ============

  // Store a completion summary linked to a user story
  ipcMain.handle('state:storeCompletionSummary', async (event, { storyId, summary }) => {
    try {
      if (!puffinState.database?.completionSummaries) {
        return { success: false, error: 'Completion summary repository not available' }
      }

      const created = puffinState.database.completionSummaries.create({
        storyId,
        sessionId: summary.sessionId || null,
        summary: summary.summary || '',
        filesModified: summary.filesModified || [],
        testsStatus: summary.testStatus || summary.testsStatus || 'unknown',
        criteriaMatched: summary.criteriaStatus || summary.criteriaMatched || [],
        turns: summary.turns || 0,
        cost: summary.cost || 0,
        duration: summary.duration || 0
      })

      console.log('[IPC] storeCompletionSummary: stored for story', storyId, 'id:', created.id)
      return { success: true, completionSummary: created }
    } catch (error) {
      console.error('[IPC] storeCompletionSummary error:', error)
      return { success: false, error: error.message }
    }
  })

  // Get completion summary for a story (most recent)
  ipcMain.handle('state:getCompletionSummary', async (event, storyId) => {
    try {
      if (!puffinState.database?.completionSummaries) {
        return { success: false, error: 'Completion summary repository not available' }
      }

      const summary = puffinState.database.completionSummaries.findByStoryId(storyId)
      return { success: true, completionSummary: summary }
    } catch (error) {
      console.error('[IPC] getCompletionSummary error:', error)
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
    const skillContent = puffinState.getBranchSkillContent('ui')
    const agentContent = puffinState.getBranchAgentContent('ui')
    await claudeMdGenerator.updateBranch('ui', state, activeBranch, skillContent, agentContent)
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

  // ============ Claude Code Plugin Handlers ============

  // Get all installed Claude Code plugins
  ipcMain.handle('state:getClaudePlugins', async () => {
    try {
      const plugins = puffinState.getClaudePlugins()
      return { success: true, plugins }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get a specific Claude Code plugin by ID
  ipcMain.handle('state:getClaudePlugin', async (event, pluginId) => {
    try {
      const plugin = puffinState.getClaudePlugin(pluginId)
      if (!plugin) {
        return { success: false, error: `Plugin "${pluginId}" not found` }
      }
      return { success: true, plugin }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Install a Claude Code plugin
  ipcMain.handle('state:installClaudePlugin', async (event, pluginData) => {
    try {
      const plugin = await puffinState.installClaudePlugin(pluginData)
      return { success: true, plugin }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Update a Claude Code plugin
  ipcMain.handle('state:updateClaudePlugin', async (event, { pluginId, updates }) => {
    try {
      const plugin = await puffinState.updateClaudePlugin(pluginId, updates)
      return { success: true, plugin }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Uninstall a Claude Code plugin
  ipcMain.handle('state:uninstallClaudePlugin', async (event, pluginId) => {
    try {
      await puffinState.uninstallClaudePlugin(pluginId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Validate a Claude plugin from source URL (fetches metadata without installing)
  ipcMain.handle('state:validateClaudePlugin', async (event, { source, type }) => {
    try {
      const result = await puffinState.validateClaudePlugin(source, type)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Add a Claude plugin from source URL (validates, fetches, and installs)
  ipcMain.handle('state:addClaudePlugin', async (event, { source, type }) => {
    try {
      const result = await puffinState.addClaudePlugin(source, type)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Assign a plugin to a branch
  ipcMain.handle('state:assignPluginToBranch', async (event, { pluginId, branchId }) => {
    try {
      const branch = await puffinState.assignPluginToBranch(pluginId, branchId)

      // Regenerate the branch CLAUDE.md with updated skill and agent content
      const state = puffinState.getState()
      const activeBranch = state.history?.activeBranch || 'specifications'
      const skillContent = puffinState.getBranchSkillContent(branchId)
      const agentContent = puffinState.getBranchAgentContent(branchId)
      await claudeMdGenerator.updateBranch(branchId, state, activeBranch, skillContent, agentContent)

      return { success: true, branch }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Unassign a plugin from a branch
  ipcMain.handle('state:unassignPluginFromBranch', async (event, { pluginId, branchId }) => {
    try {
      const branch = await puffinState.unassignPluginFromBranch(pluginId, branchId)

      // Regenerate the branch CLAUDE.md with updated skill and agent content
      const state = puffinState.getState()
      const activeBranch = state.history?.activeBranch || 'specifications'
      const skillContent = puffinState.getBranchSkillContent(branchId)
      const agentContent = puffinState.getBranchAgentContent(branchId)
      await claudeMdGenerator.updateBranch(branchId, state, activeBranch, skillContent, agentContent)

      return { success: true, branch }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get plugins assigned to a branch
  ipcMain.handle('state:getBranchPlugins', async (event, branchId) => {
    try {
      const plugins = puffinState.getBranchPlugins(branchId)
      return { success: true, plugins }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get combined skill content for a branch
  ipcMain.handle('state:getBranchSkillContent', async (event, branchId) => {
    try {
      const content = puffinState.getBranchSkillContent(branchId)
      return { success: true, content }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ============ Claude Code Agent Handlers ============

  // Get all installed Claude Code agents
  ipcMain.handle('state:getClaudeAgents', async () => {
    try {
      const agents = puffinState.getClaudeAgents()
      return { success: true, agents }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get a specific Claude Code agent
  ipcMain.handle('state:getClaudeAgent', async (event, agentId) => {
    try {
      const agent = puffinState.getClaudeAgent(agentId)
      if (!agent) {
        return { success: false, error: `Agent "${agentId}" not found` }
      }
      return { success: true, agent }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Assign an agent to a branch
  ipcMain.handle('state:assignAgentToBranch', async (event, { agentId, branchId }) => {
    try {
      const branch = await puffinState.assignAgentToBranch(agentId, branchId)

      // Regenerate the branch CLAUDE.md with updated agent content
      const state = puffinState.getState()
      const activeBranch = state.history?.activeBranch || 'specifications'
      const getSkillContent = (bId) => puffinState.getBranchSkillContent(bId)
      const getAgentContent = (bId) => puffinState.getBranchAgentContent(bId)
      await claudeMdGenerator.updateBranch(branchId, state, activeBranch, getSkillContent(branchId), getAgentContent(branchId))

      return { success: true, branch }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Unassign an agent from a branch
  ipcMain.handle('state:unassignAgentFromBranch', async (event, { agentId, branchId }) => {
    try {
      const branch = await puffinState.unassignAgentFromBranch(agentId, branchId)

      // Regenerate the branch CLAUDE.md with updated agent content
      const state = puffinState.getState()
      const activeBranch = state.history?.activeBranch || 'specifications'
      const getSkillContent = (bId) => puffinState.getBranchSkillContent(bId)
      const getAgentContent = (bId) => puffinState.getBranchAgentContent(bId)
      await claudeMdGenerator.updateBranch(branchId, state, activeBranch, getSkillContent(branchId), getAgentContent(branchId))

      return { success: true, branch }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get agents assigned to a branch
  ipcMain.handle('state:getBranchAgents', async (event, branchId) => {
    try {
      const agents = puffinState.getBranchAgents(branchId)
      return { success: true, agents }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Get combined agent content for a branch
  ipcMain.handle('state:getBranchAgentContent', async (event, branchId) => {
    try {
      const content = puffinState.getBranchAgentContent(branchId)
      return { success: true, content }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Install/upload an agent
  ipcMain.handle('state:installAgent', async (event, agentData) => {
    try {
      const agent = await puffinState.installAgent(agentData)
      return { success: true, agent }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Uninstall an agent
  ipcMain.handle('state:uninstallAgent', async (event, agentId) => {
    try {
      await puffinState.uninstallAgent(agentId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Database reset handler (for development/troubleshooting)
  // This runs pending migrations and optionally clears sprint data
  ipcMain.handle('state:resetDatabase', async (event, options = {}) => {
    try {
      const result = await puffinState.resetDatabase(options)
      return { success: true, ...result }
    } catch (error) {
      console.error('[IPC] Database reset failed:', error)
      return { success: false, error: error.message }
    }
  })

  // Get database migration status
  ipcMain.handle('state:getDatabaseStatus', async () => {
    try {
      const status = await puffinState.getDatabaseStatus()
      return { success: true, ...status }
    } catch (error) {
      console.error('[IPC] Failed to get database status:', error)
      return { success: false, error: error.message }
    }
  })

  // ============ Toast History Handlers ============

  // Get all toast history
  ipcMain.handle('toast-history:getAll', async () => {
    try {
      const history = await puffinState.getToastHistory()
      return { success: true, ...history }
    } catch (error) {
      console.error('[IPC] Failed to get toast history:', error)
      return { success: false, error: error.message }
    }
  })

  // Add a toast to history
  ipcMain.handle('toast-history:add', async (event, toast) => {
    try {
      const added = await puffinState.addToast(toast)
      return { success: true, toast: added }
    } catch (error) {
      console.error('[IPC] Failed to add toast:', error)
      return { success: false, error: error.message }
    }
  })

  // Delete a toast from history
  ipcMain.handle('toast-history:delete', async (event, toastId) => {
    try {
      const deleted = await puffinState.deleteToast(toastId)
      return { success: true, deleted }
    } catch (error) {
      console.error('[IPC] Failed to delete toast:', error)
      return { success: false, error: error.message }
    }
  })

  // Delete toasts before a given timestamp
  ipcMain.handle('toast-history:deleteBefore', async (event, timestamp) => {
    try {
      const deletedCount = await puffinState.deleteToastsBefore(timestamp)
      return { success: true, deletedCount }
    } catch (error) {
      console.error('[IPC] Failed to delete toasts:', error)
      return { success: false, error: error.message }
    }
  })

  // Clear all toast history
  ipcMain.handle('toast-history:clear', async () => {
    try {
      const clearedCount = await puffinState.clearToastHistory()
      return { success: true, clearedCount }
    } catch (error) {
      console.error('[IPC] Failed to clear toast history:', error)
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

  // Check if a CLI process is currently running
  ipcMain.handle('claude:isRunning', () => {
    return claudeService.isProcessRunning()
  })

  // Submit prompt to Claude CLI
  ipcMain.on('claude:submit', async (event, data) => {
    // Additional guard at IPC layer - log and reject if already running
    if (claudeService.isProcessRunning()) {
      console.error('[IPC-GUARD] Rejected submit: CLI process already running')
      event.sender.send('claude:error', {
        message: 'A Claude CLI process is already running. Please wait for it to complete.',
        code: 'PROCESS_ALREADY_RUNNING'
      })
      return
    }

    try {
      // Get branch info for code modification permissions
      const state = puffinState.getState()
      const branchId = data.branchId
      const branch = state.history?.branches?.[branchId]
      const codeModificationAllowed = branch?.codeModificationAllowed !== false

      console.log('[IPC-GUARD] Starting CLI process for branch:', branchId)

      // Ensure we're using the correct project path
      const submitData = {
        ...data,
        projectPath: projectPath,
        codeModificationAllowed
      }

      // Safe send helper — renderer frame may be disposed during long CLI sessions
      const safeSend = (channel, data) => {
        try {
          event.sender.send(channel, data)
        } catch (err) {
          // Frame disposed — renderer crashed or reloaded. Log once and carry on.
          if (!safeSend._warned) {
            safeSend._warned = true
            console.warn('[IPC-GUARD] Renderer frame disposed, suppressing further send errors')
          }
        }
      }

      await claudeService.submit(
        submitData,
        // On chunk received (streaming output)
        (chunk) => {
          safeSend('claude:response', chunk)
        },
        // On complete
        (response) => {
          safeSend('claude:complete', response)
        },
        // On raw JSON line (for CLI Output view)
        (jsonLine) => {
          safeSend('claude:raw', jsonLine)
        },
        // On full prompt built (for debug view)
        (fullPrompt) => {
          safeSend('claude:fullPrompt', fullPrompt)
        },
        // On question from Claude (AskUserQuestion tool)
        (questionData) => {
          safeSend('claude:question', {
            toolUseId: questionData.toolUseId,
            questions: questionData.questions
          })
        }
      )
    } catch (error) {
      console.error('[IPC-ERROR] claude:submit failed:', error)
      console.error('[IPC-ERROR] Error stack:', error.stack)
      try {
        event.sender.send('claude:error', { message: error.message })
      } catch { /* frame already gone */ }
    }
  })

  // Cancel current request
  ipcMain.on('claude:cancel', () => {
    claudeService.cancel()
  })

  // Answer a question from Claude (AskUserQuestion tool response)
  ipcMain.handle('claude:answer', async (event, { toolUseId, answers }) => {
    console.log('[IPC] claude:answer received, toolUseId:', toolUseId)
    return claudeService.sendAnswer(toolUseId, answers)
  })

  // Derive user stories from a prompt
  ipcMain.on('claude:deriveStories', async (event, data) => {
    console.log('[IPC] claude:deriveStories received')
    console.log('[IPC] prompt length:', data?.prompt?.length || 0)
    console.log('[IPC] conversationContext length:', data?.conversationContext?.length || 0)
    console.log('[IPC] projectPath:', projectPath)

    // Guard against double-spawn - reject if CLI is already running
    if (claudeService.isProcessRunning()) {
      console.error('[IPC-GUARD] Rejected deriveStories: CLI process already running')
      event.sender.send('claude:storyDerivationError', {
        error: 'A Claude CLI process is already running. Please wait for it to complete.',
        code: 'PROCESS_ALREADY_RUNNING',
        canRetry: true
      })
      return
    }

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
        data.conversationContext,  // Pass conversation context
        data.model  // Pass selected model
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
        data.project,
        data.model
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

  // Select a markdown file from the project's docs directory
  ipcMain.handle('file:selectMarkdown', async (event, options = {}) => {
    try {
      if (!projectPath) {
        return { success: false, error: 'No project is open' }
      }

      // Default to project root; prefer docs/ subdirectory if it exists
      let defaultDir = projectPath
      const docsDir = path.join(projectPath, 'docs')
      try {
        const stat = await fs.promises.stat(docsDir)
        if (stat.isDirectory()) {
          defaultDir = docsDir
        }
      } catch {
        // docs/ doesn't exist — fall back to project root
      }

      const result = await dialog.showOpenDialog({
        title: options.title || 'Select Markdown Document',
        defaultPath: defaultDir,
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] }
        ],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, filePath: null, relativePath: null }
      }

      const selectedPath = result.filePaths[0]

      // Validate the selected file is within the project directory
      const normalizedSelected = path.resolve(selectedPath)
      const normalizedRoot = path.resolve(projectPath)
      if (!normalizedSelected.startsWith(normalizedRoot)) {
        return { success: false, error: 'Selected file must be within the project directory' }
      }

      // Return both absolute and relative paths
      const relativePath = path.relative(projectPath, normalizedSelected).replace(/\\/g, '/')

      return {
        success: true,
        filePath: normalizedSelected,
        relativePath
      }
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
      // Clean up Windows reserved files before staging
      cleanupWindowsReservedFiles()

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
      // Clean up Windows reserved files before commit
      cleanupWindowsReservedFiles()

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

  // Check for active Git hooks (security warning)
  ipcMain.handle('git:checkActiveHooks', async () => {
    try {
      const result = await gitService.checkForActiveGitHooks()
      return { success: true, ...result }
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

  // Markdown parsing (moved from preload to main process for sandbox compatibility)
  ipcMain.handle('markdown:parse', async (event, content, options = {}) => {
    try {
      const html = marked.parse(content, options)
      return { success: true, html }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('markdown:parseInline', async (event, content, options = {}) => {
    try {
      const html = marked.parseInline(content, options)
      return { success: true, html }
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
 * @param {BrowserWindow} mainWindow - Main window for sending events to renderer
 */
function setupPluginManagerHandlers(ipcMain, pluginManager, mainWindow) {
  /**
   * Notify renderer of plugin lifecycle events
   * @param {string} channel - IPC channel name
   * @param {Object} data - Event data
   */
  function notifyRenderer(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
    }
  }

  // Forward plugin lifecycle events to renderer
  pluginManager.on('plugin:activated', (data) => {
    console.log(`[IPC] Forwarding plugin:activated for ${data.name}`)
    notifyRenderer('plugin:activated', { name: data.name })
  })

  pluginManager.on('plugin:deactivated', (data) => {
    console.log(`[IPC] Forwarding plugin:deactivated for ${data.name}`)
    notifyRenderer('plugin:deactivated', { name: data.name })
  })

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

/**
 * View registry IPC handlers
 * @param {IpcMain} ipcMain
 * @param {ViewRegistry} viewRegistry
 * @param {BrowserWindow} mainWindow - Main window for sending events to renderer
 */
function setupViewRegistryHandlers(ipcMain, viewRegistry, mainWindow) {
  /**
   * Notify renderer of view registration events
   * @param {string} channel - IPC channel name
   * @param {Object} data - Event data
   */
  function notifyRenderer(channel, data) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data)
    }
  }

  // Forward registry events to renderer
  viewRegistry.on('view:registered', (data) => {
    console.log(`[IPC] Forwarding view:registered event for ${data.view.id}`)
    notifyRenderer('plugin:view-registered', data)
  })

  viewRegistry.on('view:unregistered', (data) => {
    console.log(`[IPC] Forwarding view:unregistered event for ${data.viewId}`)
    notifyRenderer('plugin:view-unregistered', data)
  })

  viewRegistry.on('views:cleared', (data) => {
    console.log(`[IPC] Forwarding views:cleared event for plugin ${data.pluginName}`)
    notifyRenderer('plugin:views-cleared', data)
  })

  // Register a view from a plugin
  ipcMain.handle('plugin:register-view', async (event, viewConfig) => {
    try {
      // Extract plugin name from sender or config
      const pluginName = viewConfig.pluginName
      if (!pluginName) {
        return { success: false, error: 'pluginName is required' }
      }

      const result = viewRegistry.registerView(pluginName, viewConfig)
      return result
    } catch (error) {
      console.error('[IPC] plugin:register-view error:', error)
      return { success: false, error: error.message }
    }
  })

  // Unregister a view
  ipcMain.handle('plugin:unregister-view', async (event, viewId) => {
    try {
      const result = viewRegistry.unregisterView(viewId)
      return result
    } catch (error) {
      console.error('[IPC] plugin:unregister-view error:', error)
      return { success: false, error: error.message }
    }
  })

  // Unregister all views from a plugin
  ipcMain.handle('plugin:unregister-plugin-views', async (event, pluginName) => {
    try {
      const result = viewRegistry.unregisterPluginViews(pluginName)
      return { success: true, ...result }
    } catch (error) {
      console.error('[IPC] plugin:unregister-plugin-views error:', error)
      return { success: false, error: error.message }
    }
  })

  // Get sidebar views (most common query)
  ipcMain.handle('plugin:get-sidebar-views', async () => {
    try {
      const views = viewRegistry.getSidebarViews()
      return { success: true, views }
    } catch (error) {
      console.error('[IPC] plugin:get-sidebar-views error:', error)
      return { success: false, error: error.message }
    }
  })

  // Get views by location
  ipcMain.handle('plugin:get-views-by-location', async (event, location) => {
    try {
      const views = viewRegistry.getViewsByLocation(location)
      return { success: true, views }
    } catch (error) {
      console.error('[IPC] plugin:get-views-by-location error:', error)
      return { success: false, error: error.message }
    }
  })

  // Get all registered views
  ipcMain.handle('plugin:get-all-views', async () => {
    try {
      const views = viewRegistry.getAllViews()
      return { success: true, views }
    } catch (error) {
      console.error('[IPC] plugin:get-all-views error:', error)
      return { success: false, error: error.message }
    }
  })

  // Get views from a specific plugin
  ipcMain.handle('plugin:get-plugin-views', async (event, pluginName) => {
    try {
      const views = viewRegistry.getPluginViews(pluginName)
      return { success: true, views }
    } catch (error) {
      console.error('[IPC] plugin:get-plugin-views error:', error)
      return { success: false, error: error.message }
    }
  })

  // Get a specific view by ID
  ipcMain.handle('plugin:get-view', async (event, viewId) => {
    try {
      const view = viewRegistry.getView(viewId)
      if (!view) {
        return { success: false, error: `View not found: ${viewId}` }
      }
      return { success: true, view }
    } catch (error) {
      console.error('[IPC] plugin:get-view error:', error)
      return { success: false, error: error.message }
    }
  })

  // Get view registry summary
  ipcMain.handle('plugin:get-view-summary', async () => {
    try {
      const summary = viewRegistry.getSummary()
      return { success: true, summary }
    } catch (error) {
      console.error('[IPC] plugin:get-view-summary error:', error)
      return { success: false, error: error.message }
    }
  })
}

/**
 * Plugin style and renderer IPC handlers
 * @param {IpcMain} ipcMain
 * @param {PluginManager} pluginManager
 */
function setupPluginStyleHandlers(ipcMain, pluginManager) {
  // Get renderer configuration for a plugin (for dynamic component loading)
  ipcMain.handle('plugin:get-renderer-config', async (event, pluginName) => {
    try {
      const loader = pluginManager.loader
      const plugin = loader.getPlugin(pluginName)

      if (!plugin) {
        return { success: false, error: `Plugin not found: ${pluginName}` }
      }

      const rendererConfig = plugin.manifest?.renderer
      if (!rendererConfig || !rendererConfig.entry) {
        return {
          success: true,
          hasRenderer: false,
          pluginName,
          pluginDir: plugin.directory
        }
      }

      // Return renderer configuration for dynamic loading
      return {
        success: true,
        hasRenderer: true,
        pluginName,
        pluginDir: plugin.directory,
        entry: rendererConfig.entry,
        components: rendererConfig.components || [],
        preload: rendererConfig.preload || false,
        sandbox: rendererConfig.sandbox !== false // default true
      }
    } catch (error) {
      console.error('[IPC] plugin:get-renderer-config error:', error)
      return { success: false, error: error.message }
    }
  })

  // Get style paths for a plugin
  ipcMain.handle('plugin:get-style-paths', async (event, pluginName) => {
    try {
      const loader = pluginManager.getLoader()
      const plugin = loader.getPlugin(pluginName)

      if (!plugin) {
        return { success: false, error: `Plugin not found: ${pluginName}` }
      }

      // Get CSS paths from manifest renderer section
      const styles = plugin.manifest?.renderer?.styles || []
      const pluginDir = plugin.directory

      console.log(`[IPC] plugin:get-style-paths for ${pluginName}:`, styles)

      return {
        success: true,
        styles,
        pluginDir
      }
    } catch (error) {
      console.error('[IPC] plugin:get-style-paths error:', error)
      return { success: false, error: error.message }
    }
  })

  // Get all active plugins with styles
  ipcMain.handle('plugin:get-all-style-paths', async () => {
    try {
      const activePluginNames = pluginManager.getActivePlugins()
      const result = []

      for (const pluginName of activePluginNames) {
        // Get plugin from the loader via manager
        const plugin = pluginManager.loader.getPlugin(pluginName)
        if (!plugin) continue

        const styles = plugin.manifest?.renderer?.styles || []
        if (styles.length > 0) {
          result.push({
            pluginName,
            styles,
            pluginDir: plugin.directory
          })
        }
      }

      console.log(`[IPC] plugin:get-all-style-paths: ${result.length} plugins with styles`)

      return { success: true, plugins: result }
    } catch (error) {
      console.error('[IPC] plugin:get-all-style-paths error:', error)
      return { success: false, error: error.message }
    }
  })
}

/**
 * Image attachment handlers
 * Manages temp image files for prompt attachments
 */
function setupImageHandlers(ipcMain) {
  // Initialize temp image service when state is initialized
  ipcMain.handle('image:init', async () => {
    try {
      if (!puffinState?.puffinPath) {
        return { success: false, error: 'Project not initialized' }
      }

      tempImageService = getTempImageService(puffinState.puffinPath)

      // Cleanup old temp files on init (older than 24 hours)
      await tempImageService.cleanupOldFiles(24)

      return { success: true }
    } catch (error) {
      console.error('[IPC:image:init] Error:', error)
      return { success: false, error: error.message }
    }
  })

  // Save an image from buffer data
  ipcMain.handle('image:save', async (event, { buffer, extension, originalName }) => {
    try {
      if (!tempImageService) {
        // Try to initialize if not already
        if (puffinState?.puffinPath) {
          tempImageService = getTempImageService(puffinState.puffinPath)
        } else {
          return { success: false, error: 'Image service not initialized' }
        }
      }

      // Convert array back to Buffer (IPC serialization)
      const imageBuffer = Buffer.from(buffer)

      // Validate file size (security: prevent disk exhaustion)
      if (imageBuffer.length > MAX_IMAGE_SIZE) {
        const sizeMB = (imageBuffer.length / (1024 * 1024)).toFixed(2)
        return {
          success: false,
          error: `Image too large (${sizeMB}MB). Maximum size is 50MB.`
        }
      }

      const result = await tempImageService.saveImage(imageBuffer, extension, originalName)

      return {
        success: true,
        id: result.id,
        filePath: result.filePath,
        fileName: result.fileName,
        originalName: result.originalName
      }
    } catch (error) {
      console.error('[IPC:image:save] Error:', error)
      return { success: false, error: error.message }
    }
  })

  // Delete a single image
  ipcMain.handle('image:delete', async (event, { filePath }) => {
    try {
      if (!tempImageService) {
        return { success: false, error: 'Image service not initialized' }
      }

      const deleted = await tempImageService.deleteImage(filePath)
      return { success: deleted }
    } catch (error) {
      console.error('[IPC:image:delete] Error:', error)
      return { success: false, error: error.message }
    }
  })

  // Delete multiple images (called after prompt submission)
  ipcMain.handle('image:deleteMultiple', async (event, { filePaths }) => {
    try {
      if (!tempImageService) {
        return { success: false, error: 'Image service not initialized' }
      }

      const result = await tempImageService.deleteImages(filePaths)
      return { success: true, ...result }
    } catch (error) {
      console.error('[IPC:image:deleteMultiple] Error:', error)
      return { success: false, error: error.message }
    }
  })

  // Clear all temp images
  ipcMain.handle('image:clearAll', async () => {
    try {
      if (!tempImageService) {
        return { success: true, deleted: 0 }
      }

      const result = await tempImageService.clearAll()
      return { success: true, ...result }
    } catch (error) {
      console.error('[IPC:image:clearAll] Error:', error)
      return { success: false, error: error.message }
    }
  })

  // List all temp images
  ipcMain.handle('image:list', async () => {
    try {
      if (!tempImageService) {
        return { success: true, images: [] }
      }

      const images = await tempImageService.listImages()
      return { success: true, images }
    } catch (error) {
      console.error('[IPC:image:list] Error:', error)
      return { success: false, error: error.message }
    }
  })

  // Get supported image extensions
  ipcMain.handle('image:getSupportedExtensions', async () => {
    const { SUPPORTED_IMAGE_EXTENSIONS } = require('./services')
    return { success: true, extensions: SUPPORTED_IMAGE_EXTENSIONS }
  })
}

/**
 * Get the current PuffinState instance
 * Used by services that need lazy access to state
 * @returns {PuffinState|null}
 */
function getPuffinState() {
  return puffinState
}

/**
 * Set the plugin manager on the Claude service
 * Called after plugin manager is initialized to enable plugin-based branch focus
 * @param {PluginManager} pluginManager - The plugin manager instance
 */
function setClaudeServicePluginManager(pluginManager) {
  if (claudeService) {
    claudeService.setPluginManager(pluginManager)
  }
}

/**
 * Get the Claude service instance
 * @returns {ClaudeService|null}
 */
function getClaudeService() {
  return claudeService
}

module.exports = {
  setupIpcHandlers,
  setupPluginHandlers,
  setupPluginManagerHandlers,
  setupViewRegistryHandlers,
  setupPluginStyleHandlers,
  getPuffinState,
  getClaudeService,
  setClaudeServicePluginManager
}
