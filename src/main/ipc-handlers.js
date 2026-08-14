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
const os = require('os')
const { PuffinState } = require('./puffin-state')
const { ClaudeService } = require('./claude-service')
const VibeService = require('./vibe-service')
const { DeveloperProfileManager } = require('./developer-profile')
const { GitService } = require('./git-service')
const { scaffoldCommands } = require('./command-scaffolder')
const documentEditService = require('./document-edit-service')
const { PolygraphService } = require('./polygraph-service')
const { GlmClient } = require('./glm-client')
const { setupGlmSessionIntegration } = require('./glm-integration')
const { BoardRuntime } = require('./board-runtime')

// Polygraph workbench — engine access for any project built with Polygraph
const polygraphService = new PolygraphService()

// GLM — the spec-oriented backbone (always-on local server, solo mode)
const glmClient = new GlmClient()

// One live GLM subscription at a time (the Specs view's active workspace)
let glmSubscription = null

// Verified kanban backend — Puffin-managed polyrun child (cards = instances)
const boardRuntime = new BoardRuntime({
  polygraphDirResolver: () => polygraphService.resolvePolygraphDir()
})
const { getTempImageService } = require('./services')
const { initializeMetricsService, getMetricsService } = require('./metrics-service')
const websiteServer = require('./website-server')
const speechService = require('./speech-service')
const puppeteerMcpService = require('./puppeteer-mcp-service')

let puffinState = null
let claudeService = null
let vibeService = null
let developerProfile = null
let gitService = null
let tempImageService = null
let projectPath = null
// Lazy reference to pluginManager — set by setupPluginManagerHandlers once loaded
let pluginManagerRef = null
// Lazy reference to pluginLoader — set by setupPluginHandlers once loaded
let pluginLoaderRef = null

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
 * Setup all IPC handlers.
 * Safe to call before a project is selected (pass '' for initialProjectPath).
 * Services are created immediately so handlers are available; call setIpcProjectPath()
 * when a real project path becomes known.
 *
 * @param {IpcMain} ipcMain - Electron IPC main process
 * @param {string} initialProjectPath - The project directory path (may be empty string)
 */
function setupIpcHandlers(ipcMain, initialProjectPath) {
  projectPath = initialProjectPath
  puffinState = new PuffinState()
  claudeService = new ClaudeService()
  vibeService = new VibeService()
  developerProfile = new DeveloperProfileManager()
  gitService = new GitService()

  // Set Claude CLI working directory to the project path
  claudeService.setProjectPath(projectPath)
  
  // Set Vibe CLI working directory to the project path
  vibeService.setProjectPath(projectPath)

  // Set Git service project path
  gitService.setProjectPath(projectPath)

  // Register plugin query handlers early so the renderer can call them before any
  // project loads (welcome screen and plugin-component-loader call these at startup).
  // The *Ref variables are null until the real setup functions run; return safe empty
  // defaults so callers get a valid response shape rather than an IPC error.

  ipcMain.handle('plugins:isFirstRun', async () => {
    try {
      if (!pluginManagerRef) return { success: true, isFirstRun: false }
      const isFirstRun = pluginManagerRef.getStateStore().isFirstRun()
      return { success: true, isFirstRun }
    } catch (error) {
      return { success: false, error: error.message, isFirstRun: false }
    }
  })

  ipcMain.handle('plugins:list', async () => {
    try {
      if (!pluginLoaderRef) return { success: true, plugins: [] }
      const plugins = pluginLoaderRef.getAllPlugins().map(p => p.toJSON())
      return { success: true, plugins }
    } catch (error) {
      return { success: false, error: error.message, plugins: [] }
    }
  })

  ipcMain.handle('plugins:listActive', async () => {
    try {
      if (!pluginManagerRef) return { success: true, plugins: [] }
      const activeNames = pluginManagerRef.getActivePlugins()
      return { success: true, plugins: activeNames }
    } catch (error) {
      return { success: false, error: error.message, plugins: [] }
    }
  })

  // State handlers
  setupStateHandlers(ipcMain)

  // Metrics handlers
  setupMetricsHandlers(ipcMain)

  // Claude handlers
  setupClaudeHandlers(ipcMain)

  // Vibe handlers
  setupVibeHandlers(ipcMain)

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

  // Puppeteer Visual Loop handlers (Website Edition)
  setupPuppeteerHandlers(ipcMain)
}

/**
 * Update the project path on all services after a project is selected.
 * Call this instead of setupIpcHandlers() when the project is known at runtime.
 *
 * @param {string} newProjectPath - Absolute path to the project directory
 */
function setIpcProjectPath(newProjectPath) {
  projectPath = newProjectPath
  if (claudeService) claudeService.setProjectPath(newProjectPath)
  if (gitService) gitService.setProjectPath(newProjectPath)
  if (boardRuntime) boardRuntime.setProjectPath(newProjectPath)
  if (polygraphService) {
    polygraphService.setProjectPath(newProjectPath)
    // Config is not loaded yet at project-switch time; state:init applies
    // the configured engines path once the config is read.
    polygraphService.setConfiguredDir(puffinState?.config?.polygraphDir)
  }
  // Propagate existing config so agentCmd is correct from the first submission
  if (claudeService && puffinState) {
    try {
      const config = puffinState.getCurrentConfig?.()
      if (config) claudeService.setAgentConfig(config)
    } catch { /* state not yet loaded */ }
  }
}

/**
 * State-related IPC handlers (replaces project handlers)
 */
function setupStateHandlers(ipcMain) {
  // Initialize/load state from .puffin/ directory
  ipcMain.handle('state:init', async () => {
    try {
      const state = await puffinState.open(projectPath)

      // Apply the configured Polygraph engines path now that config is loaded
      polygraphService.setConfiguredDir(state?.config?.polygraphDir)

      // Wire spawned sessions to GLM: project-scoped glm MCP config +
      // /glm-* slash commands (non-fatal when no GLM checkout is found)
      try {
        const glmSetup = setupGlmSessionIntegration({
          projectPath,
          configuredDir: state?.config?.glmDir,
          workspace: state?.config?.glmWorkspaceId
        })
        claudeService.setGlmMcpConfigPath(glmSetup.mcpConfigPath)
        if (glmSetup.mcpConfigPath || glmSetup.glmDir) {
          console.log(`[GLM-INTEGRATION] Sessions wired: mcp=${glmSetup.transport || 'none'}, ${glmSetup.commands.length} /glm-* commands`)
        }
      } catch (glmErr) {
        console.warn('[IPC] GLM session integration failed (non-fatal):', glmErr.message)
      }

      // Initialize MetricsService after database is ready
      try {
        initializeMetricsService(puffinState.database)
        console.log('[METRICS] Service initialized successfully')
      } catch (metricsErr) {
        console.error('[METRICS] Initialization failed (non-fatal):', metricsErr.message)
      }

      // Install Puffin's bundled slash commands (e.g. /puffin-sync) into the
      // project's .claude/. Puffin no longer generates or swaps CLAUDE.md — the
      // project's CLAUDE.md is left entirely under the user's control.
      try {
        await scaffoldCommands(require('path').join(projectPath, '.claude'))
      } catch (scaffoldErr) {
        console.warn('[IPC] Command scaffolding failed (non-fatal):', scaffoldErr.message)
      }

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

      // Propagate agent config to ClaudeService so provider/deepagentsCmd take effect immediately
      claudeService.setAgentConfig(config)

      // Polygraph engines path takes effect immediately as well
      polygraphService.setConfiguredDir(config.polygraphDir)

      // Sync snip PreToolUse hook into .claude/settings.json
      if (projectPath) {
        try {
          await updateSnipHook(projectPath, !!config.tools?.snip?.enabled)
        } catch (snipErr) {
          console.warn('[IPC] Could not update snip hook:', snipErr.message)
        }
      }

      return { success: true, config }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Document editing via the configured prompt provider (api | cli).
  // The one prompt path Puffin keeps in 4.0 — cost-controlled and tool-free.
  ipcMain.handle('ai:editDocument', async (event, { instruction, content, prompt, provider } = {}) => {
    try {
      const config = puffinState?.getState?.()?.config || {}
      return await documentEditService.editDocument({
        instruction,
        content,
        prompt,
        provider,
        config,
        claudeService
      })
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ===== Polygraph workbench =====
  // Engine access for any project built with Polygraph. All answers come
  // from the engines (sibling checkout / POLYGRAPH_DIR) — never re-derived.

  ipcMain.handle('polygraph:status', async () => {
    try {
      return { success: true, ...polygraphService.getStatus() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:discover', async () => {
    try {
      return { success: true, machines: polygraphService.discoverMachines() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:check', async (event, { machineDir, maxStates } = {}) => {
    try {
      if (!machineDir) return { success: false, error: 'machineDir is required' }
      return await polygraphService.checkMachine(machineDir, { maxStates })
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:checkAll', async () => {
    try {
      return { success: true, results: await polygraphService.checkAll() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:renderDiagrams', async (event, { machineDir, diagram, theme } = {}) => {
    try {
      if (!machineDir) return { success: false, error: 'machineDir is required' }
      return await polygraphService.renderDiagrams(machineDir, { diagram, theme })
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:nvHarvest', async (event, { machineDir } = {}) => {
    try {
      if (!machineDir) return { success: false, error: 'machineDir is required' }
      return await polygraphService.harvestInvariants(machineDir)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:nvQuestions', async (event, { machineDir, all } = {}) => {
    try {
      if (!machineDir) return { success: false, error: 'machineDir is required' }
      return await polygraphService.getQuestions(machineDir, { all })
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:nvRecord', async (event, { machineDir, ...params } = {}) => {
    try {
      if (!machineDir) return { success: false, error: 'machineDir is required' }
      return await polygraphService.recordDisposition(machineDir, params)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:nvReport', async (event, { machineDir } = {}) => {
    try {
      if (!machineDir) return { success: false, error: 'machineDir is required' }
      return await polygraphService.getElicitationReport(machineDir)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:evolution', async (event, { machineDir, ref, snapshotsPath } = {}) => {
    try {
      if (!machineDir) return { success: false, error: 'machineDir is required' }
      return await polygraphService.evolutionGate(machineDir, { ref, snapshotsPath })
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:scaffoldMigration', async (event, { machineDir, ref } = {}) => {
    try {
      if (!machineDir) return { success: false, error: 'machineDir is required' }
      return await polygraphService.scaffoldMigration(machineDir, { ref })
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:traces', async (event, { machineDir } = {}) => {
    try {
      if (!machineDir) return { success: false, error: 'machineDir is required' }
      return polygraphService.getTraces(machineDir)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:validateCorpus', async (event, { machineDir } = {}) => {
    try {
      if (!machineDir) return { success: false, error: 'machineDir is required' }
      return await polygraphService.validateCorpus(machineDir)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:replay', async (event, { machineDir } = {}) => {
    try {
      if (!machineDir) return { success: false, error: 'machineDir is required' }
      return await polygraphService.replayTraces(machineDir)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('polygraph:readDiagram', async (event, { svgPath } = {}) => {
    try {
      if (!svgPath) return { success: false, error: 'svgPath is required' }
      return polygraphService.readDiagram(svgPath)
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ===== Verified kanban board (polyrun-backed cards) =====

  ipcMain.handle('board:status', async () => {
    try {
      return { success: true, ...boardRuntime.getStatus() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('board:start', async () => {
    try {
      return await boardRuntime.start()
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('board:createCard', async (event, { instanceId } = {}) => {
    try {
      if (!instanceId) return { success: false, error: 'instanceId is required' }
      return { success: true, ...(await boardRuntime.createCard(instanceId)) }
    } catch (error) {
      return { success: false, error: error.message, status: error.status }
    }
  })

  ipcMain.handle('board:listCards', async () => {
    try {
      return { success: true, ...(await boardRuntime.listCards()) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('board:dispatch', async (event, { instanceId, action, data, actionId } = {}) => {
    try {
      if (!instanceId || !action) return { success: false, error: 'instanceId and action are required' }
      const result = await boardRuntime.dispatch(instanceId, action, data, actionId)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error.message, status: error.status }
    }
  })

  ipcMain.handle('board:getCard', async (event, { instanceId } = {}) => {
    try {
      if (!instanceId) return { success: false, error: 'instanceId is required' }
      return { success: true, ...(await boardRuntime.getCard(instanceId)) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('board:journal', async (event, { instanceId } = {}) => {
    try {
      if (!instanceId) return { success: false, error: 'instanceId is required' }
      return { success: true, ...(await boardRuntime.getJournal(instanceId)) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ===== GLM (spec-oriented development) =====

  ipcMain.handle('glm:status', async () => {
    try {
      return { success: true, ...(await glmClient.getStatus()) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('glm:workspaces', async () => {
    try {
      return { success: true, workspaces: await glmClient.listWorkspaces() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // The project↔sekkei binding: one project, one sekkei. Stored in the
  // project config (Puffin's half) and as the workspace's sourceDir (GLM's
  // half), so either side can recognize the pairing.
  ipcMain.handle('glm:getBinding', async () => {
    try {
      const config = puffinState?.getState?.()?.config || {}
      const workspaces = await glmClient.listWorkspaces()

      // Bound explicitly?
      let bound = config.glmWorkspaceId
        ? workspaces.find(w => w.id === config.glmWorkspaceId)
        : null

      // Not bound (or stale): adopt a workspace whose sourceDir IS this
      // project — the pairing GLM already records.
      let autoDetected = false
      if (!bound && projectPath) {
        for (const workspace of workspaces) {
          const detail = await glmClient.getSummary(workspace.id).catch(() => null)
          const sourceDir = detail?.workspace?.sourceDir
          if (sourceDir && path.resolve(sourceDir) === path.resolve(projectPath)) {
            bound = workspace
            autoDetected = true
            break
          }
        }
        if (bound) {
          await puffinState.updateConfig({ glmWorkspaceId: bound.id, glmWorkspaceSlug: bound.slug })
        }
      }

      return {
        success: true,
        binding: bound ? { workspaceId: bound.id, slug: bound.slug, name: bound.name, autoDetected } : null,
        stale: !!(config.glmWorkspaceId && !bound),
        workspaces
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('glm:bindWorkspace', async (event, { workspaceId, create, slug, name } = {}) => {
    try {
      if (!projectPath) return { success: false, error: 'No project open' }

      let workspace
      if (create) {
        if (!slug) return { success: false, error: 'slug is required' }
        const created = await glmClient.createWorkspace({ slug, name })
        workspace = created.workspace || created
      } else {
        if (!workspaceId) return { success: false, error: 'workspaceId is required' }
        workspace = (await glmClient.listWorkspaces()).find(w => w.id === workspaceId)
        if (!workspace) return { success: false, error: 'workspace not found' }
      }

      // GLM's half: the workspace governs this project's code
      await glmClient.setSourceDir(workspace.id, projectPath).catch(err => {
        console.warn('[GLM] Could not set sourceDir (non-fatal):', err.message)
      })
      // Puffin's half: the project remembers its sekkei
      await puffinState.updateConfig({
        glmWorkspaceId: workspace.id,
        glmWorkspaceSlug: workspace.slug
      })

      // Re-point spawned sessions at the newly bound sekkei — the MCP endpoint
      // takes its default workspace from the URL, so the config is stale now.
      try {
        const rewired = setupGlmSessionIntegration({
          projectPath,
          configuredDir: puffinState.config?.glmDir,
          workspace: workspace.id
        })
        claudeService.setGlmMcpConfigPath(rewired.mcpConfigPath)
      } catch (rewireErr) {
        console.warn('[GLM] Could not re-point the MCP config (non-fatal):', rewireErr.message)
      }

      return {
        success: true,
        binding: { workspaceId: workspace.id, slug: workspace.slug, name: workspace.name }
      }
    } catch (error) {
      return { success: false, error: error.message, status: error.status }
    }
  })

  ipcMain.handle('glm:summary', async (event, { workspaceId } = {}) => {
    try {
      if (!workspaceId) return { success: false, error: 'workspaceId is required' }
      return { success: true, summary: await glmClient.getSummary(workspaceId) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('glm:nodes', async (event, { workspaceId } = {}) => {
    try {
      if (!workspaceId) return { success: false, error: 'workspaceId is required' }
      return { success: true, nodes: await glmClient.listNodes(workspaceId) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('glm:node', async (event, { workspaceId, glmId } = {}) => {
    try {
      if (!workspaceId || !glmId) return { success: false, error: 'workspaceId and glmId are required' }
      return { success: true, node: await glmClient.getNode(workspaceId, glmId) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('glm:scrs', async (event, { workspaceId } = {}) => {
    try {
      if (!workspaceId) return { success: false, error: 'workspaceId is required' }
      return { success: true, scrs: await glmClient.listScrs(workspaceId) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('glm:verify', async (event, { workspaceId } = {}) => {
    try {
      if (!workspaceId) return { success: false, error: 'workspaceId is required' }
      return { success: true, result: await glmClient.verify(workspaceId) }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('glm:createScr', async (event, { workspaceId, ...body } = {}) => {
    try {
      if (!workspaceId) return { success: false, error: 'workspaceId is required' }
      return { success: true, scr: (await glmClient.createScr(workspaceId, body))?.scr }
    } catch (error) {
      return { success: false, error: error.message, status: error.status }
    }
  })

  ipcMain.handle('glm:scrStatus', async (event, { workspaceId, scrId, event: scrEvent, reason } = {}) => {
    try {
      if (!workspaceId || !scrId || !scrEvent) {
        return { success: false, error: 'workspaceId, scrId, and event are required' }
      }
      return { success: true, ...(await glmClient.scrStatus(workspaceId, scrId, scrEvent, reason)) }
    } catch (error) {
      return { success: false, error: error.message, status: error.status }
    }
  })

  ipcMain.handle('glm:updateNode', async (event, { workspaceId, glmId, input } = {}) => {
    try {
      if (!workspaceId || !glmId || !input) {
        return { success: false, error: 'workspaceId, glmId, and input are required' }
      }
      return { success: true, node: (await glmClient.updateNode(workspaceId, glmId, input))?.node }
    } catch (error) {
      return { success: false, error: error.message, status: error.status }
    }
  })

  ipcMain.handle('glm:lock', async (event, { workspaceId, glmId, op } = {}) => {
    try {
      if (!workspaceId || !glmId) return { success: false, error: 'workspaceId and glmId are required' }
      if (op === 'release') await glmClient.releaseLock(workspaceId, glmId)
      else if (op === 'heartbeat') await glmClient.heartbeatLock(workspaceId, glmId)
      else await glmClient.acquireLock(workspaceId, glmId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message, status: error.status }
    }
  })

  // Live workspace events: one subscription (the Specs view's workspace),
  // forwarded to the renderer as 'glm:event' / 'glm:socket-status'.
  ipcMain.handle('glm:subscribe', async (event, { workspaceId } = {}) => {
    try {
      if (!workspaceId) return { success: false, error: 'workspaceId is required' }
      if (glmSubscription) {
        glmSubscription.close()
        glmSubscription = null
      }
      const sender = event.sender
      glmSubscription = glmClient.subscribe(workspaceId, {
        onEvent: (evt) => {
          if (!sender.isDestroyed()) sender.send('glm:event', { workspaceId, event: evt })
        },
        onStatus: (status) => {
          if (!sender.isDestroyed()) sender.send('glm:socket-status', { workspaceId, status })
        }
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('glm:unsubscribe', async () => {
    if (glmSubscription) {
      glmSubscription.close()
      glmSubscription = null
    }
    return { success: true }
  })

  // Check whether snip is installed on PATH
  ipcMain.handle('tools:checkSnip', async () => {
    try {
      const { execSync } = require('child_process')
      const cmd = process.platform === 'win32' ? 'where snip' : 'which snip'
      const result = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
      return { installed: true, path: result.split('\n')[0].trim() }
    } catch {
      return { installed: false }
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
      console.log('[IPC] deleteUserStory called with storyId:', storyId)
      const deleted = await puffinState.deleteUserStory(storyId)
      console.log('[IPC] deleteUserStory result:', deleted ? 'deleted successfully' : 'story not found')

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

      return { success: true, story }
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

  // Sync skills and agents from .claude/skills/ and .claude/agents/ into Puffin's plugin list
  ipcMain.handle('state:syncClaudeDirectory', async () => {
    try {
      const result = await puffinState.syncClaudeDirectoryPlugins()
      return { success: true, ...result }
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
 * Metrics IPC handlers
 */
function setupMetricsHandlers(ipcMain) {
  // Query metrics events with filters
  ipcMain.handle('metrics:query', async (event, filters) => {
    try {
      const metricsService = getMetricsService()
      if (!metricsService) {
        return { success: false, error: 'Metrics service not initialized' }
      }

      const events = metricsService.queryEvents(filters)
      return { success: true, events }
    } catch (error) {
      console.error('[METRICS] Query error:', error)
      return { success: false, error: error.message }
    }
  })

  // Get aggregated stats for a component
  ipcMain.handle('metrics:componentStats', async (event, component, options) => {
    try {
      const metricsService = getMetricsService()
      if (!metricsService) {
        return { success: false, error: 'Metrics service not initialized' }
      }

      const stats = metricsService.getComponentStats(component, options)
      return { success: true, stats }
    } catch (error) {
      console.error('[METRICS] Component stats error:', error)
      return { success: false, error: error.message }
    }
  })

  // Get metrics for a specific story (uses pre-aggregated story_metrics table)
  ipcMain.handle('metrics:storyMetrics', async (event, storyId) => {
    try {
      const metricsService = getMetricsService()
      if (!metricsService) {
        return { success: false, error: 'Metrics service not initialized' }
      }

      // Get pre-aggregated story metrics (fast!)
      const storyMetrics = metricsService.getStoryMetrics({ story_id: storyId })
      const story = storyMetrics.length > 0 ? storyMetrics[0] : null

      // Also get individual prompts for drill-down capability
      const prompts = metricsService.queryEvents({
        story_id: storyId,
        event_type: 'complete'
      })

      return {
        success: true,
        metrics: {
          story: story ? {
            storyId: story.id,
            storyTitle: story.story_title,
            totalOperations: story.total_operations,
            totalCost: story.total_cost_usd,
            totalTokens: story.total_tokens,
            totalDuration: story.total_duration_ms,
            avgDuration: story.total_operations > 0
              ? Math.round(story.total_duration_ms / story.total_operations)
              : 0,
            firstOperationAt: story.first_operation_at,
            lastOperationAt: story.last_operation_at,
            status: story.status
          } : null,
          prompts // Individual operations for drill-down
        }
      }
    } catch (error) {
      console.error('[METRICS] Story metrics error:', error)
      return { success: false, error: error.message }
    }
  })

  // Flush pending metrics to database
  ipcMain.handle('metrics:flush', async () => {
    try {
      const metricsService = getMetricsService()
      if (!metricsService) {
        return { success: false, error: 'Metrics service not initialized' }
      }

      metricsService._flushBatch()
      return { success: true }
    } catch (error) {
      console.error('[METRICS] Flush error:', error)
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
    try {
      const available = await claudeService.isAvailable()
      const version = available ? await claudeService.getVersion() : null
      return { available, version }
    } catch (error) {
      console.error('[IPC] claude:check error:', error.message)
      return { available: false, version: null }
    }
  })

  // Check if a CLI process is currently running
  ipcMain.handle('claude:isRunning', () => {
    try {
      return claudeService.isProcessRunning()
    } catch (error) {
      console.error('[IPC] claude:isRunning error:', error.message)
      return false
    }
  })

  // Submit prompt to Claude CLI
  ipcMain.on('claude:submit', async (event, data) => {
    // IPC-level provider redirect: if config says 'vibe', route there instead of Claude.
    // This catches cases where the renderer routing logic fails to redirect.
    const defaultProvider = puffinState.config?.defaultProvider || 'claude'
    console.log('[IPC-GUARD] claude:submit called | config.defaultProvider:', defaultProvider)
    if (defaultProvider === 'vibe') {
      console.log('[IPC-GUARD] Redirecting claude:submit → vibe (config.defaultProvider=vibe)')
      const config = puffinState.config || {}
      const enriched = {
        ...data,
        apiKey: config.mistralApiKey,
        model: config.vibeModel || 'devstral-2'
      }
      if (vibeService.isProcessRunning()) {
        event.sender.send('claude:error', { message: 'A Vibe process is already running' })
        return
      }
      // Fire vibe results back on claude:* channels so renderer listeners work regardless of routing path
      vibeService.submit(
        enriched,
        (chunk) => {
          try { event.sender.send('claude:response', chunk) } catch { /* frame gone */ }
        },
        (response) => {
          try {
            event.sender.send('claude:complete', {
              content: response.content,
              turns: 1,
              exitCode: response.exitCode ?? 0,
              sessionId: null,
              filesModified: []
            })
          } catch { /* frame gone */ }
        }
      ).catch((err) => {
        try { event.sender.send('claude:error', { message: err.message }) } catch { /* frame gone */ }
      })
      return
    }

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
      console.log('[IPC-GUARD] Starting CLI process')

      // Ensure we're using the correct project path
      const submitData = {
        ...data,
        projectPath: projectPath
      }

      // Puppeteer Visual Loop: inject MCP config + prompt suffix when active
      if (data.puppeteerLoop && projectPath) {
        const configPath = puppeteerMcpService.getConfigPath(projectPath)
        if (fs.existsSync(configPath)) {
          submitData.mcpConfigPath = configPath
          const port = data.puppeteerPort || 5000
          submitData.prompt = (submitData.prompt || '') + `\n\n---\n[VISUAL FEEDBACK LOOP ACTIVE]\n\nAfter making any code changes:\n1. Use puppeteer_navigate to open http://localhost:${port}/ (or the relevant page path).\n2. Use puppeteer_screenshot to capture the rendered output.\n3. Compare the screenshot against the stated goal above.\n4. If there are visual discrepancies (layout, colour, text, alignment), fix them and screenshot again.\n5. Repeat until the output matches the intent, or you have made 3 correction attempts.\n\nFocus only on what is visible in the screenshot.`
        } else {
          console.warn('[Puppeteer] Visual loop requested but MCP config not found — call puppeteer:setup first')
        }
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

      // Puppeteer Visual Loop state (scoped to this submit call)
      let puppeteerScreenshotCount = 0
      let puppeteerAwaitingVerdict = false // screenshot tool_use seen, waiting for tool_result
      let puppeteerVerdictReady = false    // tool_result received, next assistant text = verdict

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

          // Puppeteer Visual Loop: track screenshot count and verdict
          if (data.puppeteerLoop) {
            try {
              const json = JSON.parse(jsonLine)
              if (json.type === 'assistant' && json.message?.content) {
                for (const block of json.message.content) {
                  if (block.type === 'tool_use' && block.name?.includes('puppeteer_screenshot')) {
                    puppeteerScreenshotCount++
                    safeSend('claude:puppeteer-screenshot', { count: puppeteerScreenshotCount })
                    puppeteerAwaitingVerdict = true
                  }
                }
                // If a screenshot tool result was received on the previous turn,
                // the text in this assistant message is Claude's visual verdict.
                if (puppeteerVerdictReady) {
                  const verdict = json.message.content
                    .filter(b => b.type === 'text')
                    .map(b => b.text)
                    .join('')
                  if (verdict.length > 0) {
                    safeSend('claude:puppeteer-verdict', { verdict })
                    puppeteerVerdictReady = false
                  }
                }
              }
              // The tool_result for a screenshot arrives in a 'user' message;
              // the *next* assistant message after that contains the verdict.
              if (json.type === 'user' && puppeteerAwaitingVerdict && json.message?.content) {
                const hasScreenshotResult = json.message.content.some(b =>
                  b.type === 'tool_result' && Array.isArray(b.content) &&
                  b.content.some(c => c.tool_name?.includes('puppeteer_screenshot'))
                )
                if (hasScreenshotResult) {
                  puppeteerVerdictReady = true
                  puppeteerAwaitingVerdict = false
                }
              }
            } catch { /* non-JSON lines ignored */ }
          }
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
        },
        // On rate limit event (status !== 'allowed')
        (rateLimitData) => {
          safeSend('claude:rateLimited', rateLimitData)
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
    try {
      console.log('[IPC] claude:answer received, toolUseId:', toolUseId)
      return claudeService.sendAnswer(toolUseId, answers)
    } catch (error) {
      console.error('[IPC] claude:answer error:', error.message)
      return { success: false, error: error.message }
    }
  })

  // /btw ephemeral side question — one-shot, no tools, answered from existing session context.
  // The exchange is NOT shown in Puffin's conversation view; the answer is displayed ephemerally.
  ipcMain.handle('claude:btw-ask', async (event, { question, sessionId }) => {
    try {
      if (!question?.trim()) return { success: false, error: 'Empty question' }
      if (!projectPath) return { success: false, error: 'No project open' }

      // Prefix the question so Claude knows this is a side query and should reply briefly.
      const prompt = `[btw — side question, answer briefly without using any tools]\n\n${question.trim()}`

      const result = await claudeService.sendPrompt(prompt, {
        projectPath,
        sessionId: sessionId || null, // resume session for context
        disableTools: true,           // no file access — answers from context only
        maxTurns: 1,
        model: null,                  // inherits default model
        allowConcurrent: true         // safe: one-shot --print, no tools, separate proc
      })
      return result
    } catch (error) {
      console.error('[IPC] claude:btw-ask error:', error.message)
      return { success: false, error: error.message }
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

  ipcMain.handle('claude:getModels', async () => {
    const config = puffinState?.getCurrentConfig?.() || {}

    if (config.defaultProvider === 'local') {
      const ollamaHost = config.ollamaHost?.trim() || 'http://localhost:11434'
      const defaultModel = config.ollamaModel?.trim() || 'qwen3:8b'
      try {
        const resp = await fetch(`${ollamaHost}/api/tags`)
        const data = await resp.json()
        const models = (data.models || []).map(m => ({
          id: m.name,
          name: m.name,
          description: `${(m.size / 1e9).toFixed(1)}GB`
        }))
        return { models: models.length ? models : [{ id: defaultModel, name: defaultModel, description: 'default' }], default: defaultModel }
      } catch {
        return { models: [{ id: defaultModel, name: defaultModel, description: 'default' }], default: defaultModel }
      }
    }

    // Claude 5 family, by CLI alias (stable across point releases — the
    // claude CLI resolves fable/opus/sonnet/haiku to the current models)
    return {
      models: [
        { id: 'fable', name: 'Claude Fable 5', description: 'Most intelligent' },
        { id: 'opus', name: 'Claude Opus', description: 'Most capable' },
        { id: 'sonnet', name: 'Claude Sonnet', description: 'Balanced' },
        { id: 'haiku', name: 'Claude Haiku', description: 'Fast' }
      ],
      default: 'sonnet'
    }
  })
}

/**
 * Vibe service IPC handlers
 */
function setupVibeHandlers(ipcMain) {
  ipcMain.handle('vibe:check', async () => {
    try {
      const available = await vibeService.isAvailable()
      return { available }
    } catch (error) {
      console.error('Vibe availability check failed:', error)
      return { available: false, error: error.message }
    }
  })

  ipcMain.handle('vibe:isRunning', () => {
    try {
      return vibeService.isProcessRunning()
    } catch (error) {
      console.error('Vibe isRunning check failed:', error)
      return false
    }
  })

  ipcMain.on('vibe:submit', async (event, data) => {
    // Additional guard at IPC layer - log and reject if already running
    if (vibeService.isProcessRunning()) {
      console.error('[VIBE-GUARD] Attempted to submit while process is running')
      event.sender.send('vibe:error', { error: 'A Vibe process is already running' })
      return
    }

    // Inject API key and model from project config so the renderer does not
    // need to handle credentials directly.
    const config = puffinState?.getCurrentConfig?.() || {}
    const enrichedData = {
      ...data,
      apiKey: config.mistralApiKey?.trim() || data.apiKey,
      model: config.vibeModel?.trim() || data.model
    }

    try {
      await vibeService.submit(
        enrichedData,
        (chunk) => {
          event.sender.send('vibe:chunk', chunk)
        },
        (response) => {
          event.sender.send('vibe:complete', response)
        }
      )
    } catch (error) {
      console.error('Vibe submit failed:', error)
      event.sender.send('vibe:error', { error: error.message })
    }
  })

  ipcMain.on('vibe:cancel', () => {
    vibeService.cancel()
  })

  ipcMain.handle('vibe:answer', async (event, { toolUseId, answers }) => {
    try {
      console.log('[VIBE-ANSWER] Received answer for tool_use_id:', toolUseId)
      const success = vibeService.sendAnswer(toolUseId, answers)
      return { success }
    } catch (error) {
      console.error('Vibe answer failed:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('vibe:getModels', async () => {
    return {
      models: [
        { id: 'devstral-2', name: 'Devstral (latest)', description: 'Latest coding model — alias: devstral-2' },
        { id: 'devstral-small', name: 'Devstral Small', description: 'Faster, lighter coding model — alias: devstral-small' },
        { id: 'mistral-large-latest', name: 'Mistral Large', description: 'Most capable general model' }
      ],
      default: 'devstral-2'
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
      if (typeof url !== 'string') {
        return { success: false, error: 'URL must be a string' }
      }
      let parsed
      try {
        parsed = new URL(url)
      } catch {
        return { success: false, error: 'Invalid URL' }
      }
      // Restrict to safe remote schemes; block file:, javascript:, data:, etc.
      const allowedProtocols = new Set(['http:', 'https:', 'mailto:'])
      if (!allowedProtocols.has(parsed.protocol)) {
        return { success: false, error: `Protocol not allowed: ${parsed.protocol}` }
      }
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
  // Update the module-level ref so the early-registered plugins:list handler
  // (in setupIpcHandlers) now has access to the real pluginLoader.
  pluginLoaderRef = pluginLoader

  // Note: plugins:list is registered early in setupIpcHandlers via pluginLoaderRef.

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
  // Update the module-level reference so the early-registered plugins:isFirstRun
  // handler (in setupIpcHandlers) can access the now-ready pluginManager.
  pluginManagerRef = pluginManager

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

  // Note: plugins:listActive is registered early in setupIpcHandlers via pluginManagerRef.

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

  // Complete first-run setup: disable user-unchecked plugins, mark setup done
  // Note: plugins:isFirstRun is registered early in setupIpcHandlers (uses pluginManagerRef)
  ipcMain.handle('plugins:completeSetup', async (event, { disabledPlugins = [] } = {}) => {
    try {
      if (!pluginManagerRef) return { success: false, error: 'Plugin manager not ready' }
      for (const name of disabledPlugins) {
        await pluginManagerRef.disablePlugin(name)
      }
      await pluginManagerRef.getStateStore().markSetupComplete()
      return { success: true }
    } catch (error) {
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
      const loader = pluginManager.loader
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
    try {
      const { SUPPORTED_IMAGE_EXTENSIONS } = require('./services')
      return { success: true, extensions: SUPPORTED_IMAGE_EXTENSIONS }
    } catch (error) {
      console.error('[IPC] image:getSupportedExtensions error:', error.message)
      return { success: false, error: error.message, extensions: [] }
    }
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

/**
 * Get the Vibe service instance
 * @returns {VibeService|null}
 */
function getVibeService() {
  return vibeService
}

/**
 * Add or remove the snip PreToolUse hook from {projectPath}/.claude/settings.json.
 *
 * Merges cleanly with any existing content — only touches the snip entry inside
 * hooks.PreToolUse, leaving everything else (permissions, MCP servers, etc.) intact.
 *
 * @param {string} dir - Project root path
 * @param {boolean} enabled - Whether to add (true) or remove (false) the hook
 */
async function updateSnipHook(dir, enabled) {
  const settingsPath = path.join(dir, '.claude', 'settings.json')

  // Read existing settings or start fresh
  let settings = {}
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8')
    settings = JSON.parse(raw)
  } catch {
    // File may not exist yet — that's fine
  }

  // Ensure hooks structure exists
  if (!settings.hooks) settings.hooks = {}
  if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = []

  const SNIP_MATCHER = 'Bash'
  const SNIP_COMMAND = 'snip'

  // Remove any existing snip entry (identified by command === 'snip')
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(entry =>
    !(entry.matcher === SNIP_MATCHER &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some(h => h.type === 'command' && h.command === SNIP_COMMAND))
  )

  if (enabled) {
    settings.hooks.PreToolUse.push({
      matcher: SNIP_MATCHER,
      hooks: [{ type: 'command', command: SNIP_COMMAND }]
    })
    console.log('[SNIP] PreToolUse hook added to', settingsPath)
  } else {
    console.log('[SNIP] PreToolUse hook removed from', settingsPath)
  }

  // Clean up empty PreToolUse array to keep settings tidy
  if (settings.hooks.PreToolUse.length === 0) {
    delete settings.hooks.PreToolUse
  }
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks
  }

  // Ensure .claude/ directory exists
  const claudeDir = path.join(dir, '.claude')
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true })

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8')
}

/**
 * Register plan-file IPC handlers.
 *
 * Claude Code (≥ v1.x) writes plans to ~/.claude/plan/<project-slug>.md instead of
 * returning them as response text.  These handlers let the renderer:
 *   1. Discover the plan file written during the current planning session.
 *   2. Copy it into docs/plans/ inside the project for version control.
 *
 * @param {IpcMain} ipcMain
 */
function setupPlanHandlers(ipcMain) {
  /**
   * Find the most recently modified .md file in ~/.claude/plan/ that was
   * touched within the last 10 minutes.  Returns null when nothing is found.
   */
  ipcMain.handle('plan:readLatest', async () => {
    try {
      const planDir = path.join(os.homedir(), '.claude', 'plan')
      if (!fs.existsSync(planDir)) return null

      const entries = fs.readdirSync(planDir)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const full = path.join(planDir, f)
          const stat = fs.statSync(full)
          return { filename: f, filePath: full, mtimeMs: stat.mtimeMs }
        })
        .filter(e => Date.now() - e.mtimeMs < 10 * 60 * 1000) // within 10 min
        .sort((a, b) => b.mtimeMs - a.mtimeMs)

      if (entries.length === 0) return null

      const best = entries[0]
      const content = fs.readFileSync(best.filePath, 'utf8')
      console.log(`[PLAN] Found plan file: ${best.filename} (${content.length} chars)`)
      return { filename: best.filename, filePath: best.filePath, content }
    } catch (err) {
      console.error('[PLAN] readLatest error:', err.message)
      return null
    }
  })

  /**
   * Write plan content to docs/plans/<filename> inside the current project.
   * Creates the directory if it doesn't exist.
   */
  ipcMain.handle('plan:saveToDocs', async (event, { filename, content }) => {
    try {
      if (!projectPath) return { success: false, error: 'No project path set' }
      if (!filename || typeof filename !== 'string') {
        return { success: false, error: 'Invalid filename' }
      }
      // Reject any path separators or traversal sequences; only allow a bare filename.
      if (/[\\/]/.test(filename) || filename.includes('..') || path.isAbsolute(filename)) {
        return { success: false, error: 'Filename must not contain path separators' }
      }
      const docsDir = path.join(projectPath, 'docs', 'plans')
      if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true })
      const dest = path.resolve(docsDir, filename)
      const resolvedDocsDir = path.resolve(docsDir)
      if (dest !== resolvedDocsDir && !dest.startsWith(resolvedDocsDir + path.sep)) {
        return { success: false, error: 'Resolved path escapes plans directory' }
      }
      fs.writeFileSync(dest, content, 'utf8')
      console.log(`[PLAN] Saved plan to ${dest}`)
      return { success: true, filePath: dest }
    } catch (err) {
      console.error('[PLAN] saveToDocs error:', err.message)
      return { success: false, error: err.message }
    }
  })
}

/**
 * Register IPC handlers for the Website Edition static server.
 * Safe to call at startup — handlers return errors until a project is initialized.
 * @param {Electron.IpcMain} ipcMain
 */
function setupWebserverHandlers(ipcMain) {
  const server = websiteServer.getInstance()

  ipcMain.handle('webserver:start', async (event, { port, servePath } = {}) => {
    try {
      if (!projectPath) return { success: false, error: 'No project open' }
      const usePort = port || 5000
      const useServePath = servePath ?? 'dist'
      const result = await server.start(projectPath, usePort, useServePath)
      console.log(`[WebServer] Started on port ${result.port}, serving ${projectPath}/${useServePath}`)
      return { success: true, ...result }
    } catch (err) {
      console.error('[WebServer] Start failed:', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('webserver:openUrl', async (event, url) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('webserver:stop', async () => {
    try {
      await server.stop()
      console.log('[WebServer] Stopped')
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('webserver:status', () => {
    try {
      return {
        success: true,
        running: server.isRunning(),
        port: server.getPort(),
        url: server.getUrl()
      }
    } catch (error) {
      console.error('[IPC] webserver:status error:', error.message)
      return { success: false, error: error.message, running: false }
    }
  })

  // Build a site map by parsing index.html links (two levels deep).
  ipcMain.handle('webserver:siteMap', () => {
    try {
      if (!projectPath) return { success: false, error: 'No project open', pages: [] }
      const result = server.buildSiteMap(projectPath)
      return { success: true, ...result }
    } catch (err) {
      return { success: false, error: err.message, pages: [] }
    }
  })
}

/**
 * Register IPC handlers for the Puppeteer Visual Feedback Loop (Website Edition).
 * Manages the project-scoped MCP config that Claude reads via --mcp-config.
 * @param {Electron.IpcMain} ipcMain
 */
function setupPuppeteerHandlers(ipcMain) {
  // Write .puffin/mcp-puppeteer.json so the loop can be activated
  ipcMain.handle('puppeteer:setup', async (event, { projectPath: reqPath } = {}) => {
    try {
      const resolvedPath = reqPath || projectPath
      if (!resolvedPath) return { success: false, error: 'No project open' }
      const { configPath } = puppeteerMcpService.setup(resolvedPath)
      return { success: true, configPath }
    } catch (err) {
      console.error('[Puppeteer] Setup failed:', err.message)
      return { success: false, error: err.message }
    }
  })

  // Check whether the MCP config file exists (fast, no subprocess)
  ipcMain.handle('puppeteer:check', (event, { projectPath: reqPath } = {}) => {
    try {
      const resolvedPath = reqPath || projectPath
      if (!resolvedPath) return { success: true, configured: false }
      const configured = puppeteerMcpService.isSetup(resolvedPath)
      return { success: true, configured }
    } catch (err) {
      return { success: false, configured: false, error: err.message }
    }
  })
}

/**
 * Register IPC handlers for speech-to-text (Whisper API).
 * @param {Electron.IpcMain} ipcMain
 */
function setupSpeechHandlers(ipcMain) {
  const service = speechService.getInstance()

  /**
   * Transcribe audio — expects { audioData: number[] } (Uint8Array serialised as plain array).
   * Reads speechApiKey and speechApiUrl from the loaded project config.
   */
  ipcMain.handle('speech:transcribe', async (event, { audioData } = {}) => {
    try {
      if (!audioData?.length) return { success: false, error: 'No audio data received' }

      const config = puffinState ? puffinState.getState()?.config : null
      const apiKey = config?.speechApiKey?.trim()
      const apiUrl = config?.speechApiUrl?.trim() || undefined
      const model = config?.speechModel?.trim() || undefined

      if (!apiKey) {
        return { success: false, error: 'No Speech API key. Add it in Project Settings → Voice Input.' }
      }

      const buffer = Buffer.from(audioData)
      const text = await service.transcribe(buffer, apiKey, apiUrl, model)
      console.log(`[Speech] Transcribed ${buffer.length} bytes → "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`)
      return { success: true, text }
    } catch (err) {
      console.error('[Speech] Transcription error:', err.message)
      return { success: false, error: err.message }
    }
  })
}

module.exports = {
  setupIpcHandlers,
  setupPlanHandlers,
  setIpcProjectPath,
  setupPluginHandlers,
  setupPluginManagerHandlers,
  setupViewRegistryHandlers,
  setupPluginStyleHandlers,
  setupWebserverHandlers,
  setupSpeechHandlers,
  getPuffinState,
  getClaudeService,
  getVibeService,
  setClaudeServicePluginManager,
  setupVibeHandlers,
  getMetricsService,
  stopBoardRuntime: () => boardRuntime.stop()
}
