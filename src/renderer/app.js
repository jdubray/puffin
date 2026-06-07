/**
 * Puffin - Application Bootstrap
 *
 * Main entry point for the renderer process.
 * Initializes SAM and wires up all components.
 *
 * Directory-based workflow: Puffin opens a directory and reads/writes .puffin/
 */

import { SAM, appFsm, promptFsm } from './sam/instance.js'
import { initialModel, acceptors } from './sam/model.js'
import { computeState, render } from './sam/state.js'
import * as actions from './sam/actions.js'
import { samDebugger } from './sam/debugger.js'

// Extracted modules
import { ModalManager } from './lib/modal-manager.js'
import { StatePersistence } from './lib/state-persistence.js'
import { ActivityTracker } from './lib/activity-tracker.js'
import { computeSimilarityHash, generateOutputSummary } from './lib/similarity-hash.js'
import { HelpModeController } from './lib/help-mode-controller.js'
import { fetchWorkflowContext } from './lib/workflow-state-tracker.js'
import { ActivityLog, ActivityEventType } from './lib/activity-log.js'
import { computeActionCards, HOW_CONTENT } from './lib/action-card-engine.js'
import { initTooltipEngine } from './lib/tooltip-engine.js'

// Components
import { ProjectFormComponent } from './components/project-form/project-form.js'
import { HistoryTreeComponent } from './components/history-tree/history-tree.js'
import { PromptEditorComponent } from './components/prompt-editor/prompt-editor.js'
import { ResponseViewerComponent } from './components/response-viewer/response-viewer.js'
import { DebuggerComponent } from './components/debugger/debugger.js'
import { CliOutputComponent } from './components/cli-output/cli-output.js'
import { UserStoriesComponent } from './components/user-stories/user-stories.js'
import { DeveloperProfileComponent } from './components/developer-profile/developer-profile.js'
import { StoryGenerationsComponent } from './components/story-generations/story-generations.js'
import { GitPanelComponent } from './components/git-panel/git-panel.js'

// Plugin system
import { FirstRunSetup } from './components/first-run-setup/first-run-setup.js'
import { PluginManager } from './components/plugin-manager/plugin-manager.js'
import { sidebarViewManager } from './plugins/sidebar-view-manager.js'
import { pluginViewContainer } from './plugins/plugin-view-container.js'
import { styleInjector } from './plugins/style-injector.js'
import { pluginComponentLoader } from './plugins/plugin-component-loader.js'

/**
 * Display limit constants for UI rendering
 */
const DISPLAY_LIMITS = {
  /** Maximum incidents to show in summary panel */
  INCIDENTS_SUMMARY: 5,
  /** Maximum incidents to show in code review panel */
  INCIDENTS_CODE_REVIEW: 3,
  /** Maximum characters for truncated descriptions */
  DESCRIPTION_LENGTH: 80,
  /** Maximum files to show in response summary */
  FILES_MODIFIED: 10
}

// Default model for quick one-shot calls (handoff, story summary).
// Set by loadModels() once the backend responds; defaults to 'haiku' for
// standard Claude Code and is overridden with the Ollama default for deepagents.
let _fastModel = 'haiku'

/**
 * Main application class
 */
class PuffinApp {
  constructor() {
    this.intents = null
    this.state = null
    this.components = {}
    this.claudeListeners = []
    this.projectPath = null

    // Managers (initialized after intents are created)
    this.modalManager = null
    this.statePersistence = null
    this.activityTracker = null

    // Plugin system managers
    this.sidebarViewManager = sidebarViewManager
    this.pluginViewContainer = pluginViewContainer
    this.styleInjector = styleInjector
    this.pluginComponentLoader = pluginComponentLoader

    // Toast container reference
    this.toastContainer = null

    // Website Edition server management flags
    this._webserverStarting = false
    this._webserverRunning = false
    this._webserverPort = null
    this._websiteUrlPanelBound = false
  }

  /**
   * Show a toast notification
   * Supports two call signatures:
   *   showToast({ type, title, message, duration }) - full options object
   *   showToast(message, type, duration) - simple string message
   *
   * @param {Object|string} optionsOrMessage - Toast options object or message string
   * @param {string} typeArg - Type when using string signature: 'error' | 'success' | 'warning' | 'info'
   * @param {number} durationArg - Duration when using string signature
   */
  showToast(optionsOrMessage, typeArg = 'info', durationArg = 3000) {
    // Handle both signatures: object { type, title, message, duration } or string (message, type, duration)
    let type, title, message, duration
    if (typeof optionsOrMessage === 'string') {
      // String signature: showToast(message, type, duration)
      type = typeArg
      title = optionsOrMessage
      message = null
      duration = durationArg
    } else if (typeof optionsOrMessage === 'object' && optionsOrMessage !== null) {
      // Object signature: showToast({ type, title, message, duration })
      type = optionsOrMessage.type || 'info'
      // If no title but message provided, use message as title (backwards compat)
      title = optionsOrMessage.title || optionsOrMessage.message || ''
      message = optionsOrMessage.title ? optionsOrMessage.message : null
      duration = optionsOrMessage.duration !== undefined ? optionsOrMessage.duration : 5000
    } else {
      console.warn('[TOAST] Invalid showToast argument:', optionsOrMessage)
      return
    }

    // Log errors and warnings to console for debugging
    if (type === 'error') {
      console.error('[Toast Error]', title, message || '')
    } else if (type === 'warning') {
      console.warn('[Toast Warning]', title, message || '')
    }

    if (!this.toastContainer) {
      this.toastContainer = document.getElementById('toast-container')
    }

    if (!this.toastContainer) {
      console.warn('[TOAST] Toast container not found')
      return
    }

    const icons = {
      error: '⚠️',
      success: '✓',
      warning: '⚡',
      info: 'ℹ️'
    }

    const toast = document.createElement('div')
    toast.className = `toast toast-${type}`
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <div class="toast-content">
        <div class="toast-title">${this.escapeHtml(title)}</div>
        ${message ? `<div class="toast-message">${this.escapeHtml(message)}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Close">×</button>
    `

    // Close button handler
    const closeBtn = toast.querySelector('.toast-close')
    closeBtn.addEventListener('click', () => this.removeToast(toast))

    // Add to container
    this.toastContainer.appendChild(toast)

    // Auto-remove after duration (if not persistent)
    if (duration > 0) {
      setTimeout(() => this.removeToast(toast), duration)
    }

    // Persist toast to history (non-blocking)
    // This intercepts all toast creation and logs to storage automatically
    this.persistToastToHistory(type, title, message)

    return toast
  }

  /**
   * Persist a toast to history storage
   * Non-blocking - failures don't affect toast display
   * @param {string} type - Toast type (error, success, warning, info)
   * @param {string} title - Toast title/message
   * @param {string|null} message - Optional detailed message
   * @private
   */
  persistToastToHistory(type, title, message) {
    // Guard: Check if preload API is available
    if (!window.puffin?.toastHistory?.add) {
      return
    }

    // Combine title and message for storage
    const fullMessage = message ? `${title}: ${message}` : title

    window.puffin.toastHistory.add({
      message: fullMessage,
      type: type,
      source: 'app'
    }).catch(err => {
      // Log but don't disrupt toast display
      console.warn('[TOAST] Failed to persist toast to history:', err.message)
    })
  }

  /**
   * Remove a toast with animation
   * @param {HTMLElement} toast - Toast element to remove
   */
  removeToast(toast) {
    if (!toast || !toast.parentNode) return

    toast.classList.add('toast-hiding')
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast)
      }
    }, 300) // Match animation duration
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    if (!str) return ''
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  /**
   * Clean up any leftover overlay elements from previous sessions
   * This prevents stuck overlays from blocking the UI
   */
  cleanupLeftoverOverlays() {
    // Remove any stuck-alert overlays
    const stuckAlert = document.getElementById('stuck-alert')
    if (stuckAlert) {
      console.log('[CLEANUP] Removing leftover stuck-alert overlay')
      stuckAlert.remove()
    }

    // Clear any leftover toasts
    const toastContainer = document.getElementById('toast-container')
    if (toastContainer) {
      toastContainer.innerHTML = ''
    }
  }

  /**
   * Fetch available models from Ollama and populate both model dropdowns.
   * Falls back gracefully if Ollama is unreachable.
   */
  async loadModels() {
    if (!window.puffin?.claude?.getModels) return
    try {
      const { models, default: defaultModel } = await window.puffin.claude.getModels()
      _fastModel = defaultModel

      const saved = localStorage.getItem('puffin-default-model')
      const selectedId = (saved && models.find(m => m.id === saved)) ? saved : defaultModel

      const esc = (s) => this.escapeHtml(String(s ?? ''))
      const optionsHtml = models.map(m =>
        `<option value="${esc(m.id)}"${m.id === selectedId ? ' selected' : ''}>${esc(m.name)} — ${esc(m.description)}</option>`
      ).join('\n')

      for (const id of ['thread-model', 'default-model']) {
        const el = document.getElementById(id)
        if (el) el.innerHTML = optionsHtml
      }

      // Persist selection when settings dropdown changes
      const settingsEl = document.getElementById('default-model')
      if (settingsEl) {
        settingsEl.addEventListener('change', () => {
          localStorage.setItem('puffin-default-model', settingsEl.value)
          const threadEl = document.getElementById('thread-model')
          if (threadEl) threadEl.value = settingsEl.value
          _fastModel = settingsEl.value
        })
      }
    } catch (err) {
      console.warn('[loadModels] Failed to fetch models:', err)
    }
  }

  /**
   * Initialize the application
   */
  async init() {
    console.log('Puffin initializing...')

    // Clean up any leftover overlays from previous sessions
    this.cleanupLeftoverOverlays()

    // Populate model dropdowns from Ollama
    this.loadModels()

    // Initialize SAM with FSMs
    this.initSAM()

    // Initialize managers
    this.initManagers()

    // Initialize UI components
    this.initComponents()

    // Setup event listeners
    this.setupEventListeners()

    // Setup Claude API listeners
    this.setupClaudeListeners()

    // Setup menu event listeners (Electron menu actions)
    this.setupMenuListeners()

    // Wait for app ready signal with project path
    if (window.puffin) {
      // Run first-run plugin setup if needed (before showing welcome or loading project)
      await this._maybeShowFirstRunSetup()

      // Pull initial state — renderer controls timing so there's no race condition
      // with did-finish-load. The old onReady push is kept in main as a fallback
      // but we no longer depend on it.
      const data = await window.puffin.app.getInitialState()
      console.log('Electron app ready, project path:', data?.projectPath)

      if (data?.openPluginsManager) {
        const mgr = new PluginManager()
        await mgr.show()
      }

      if (data?.projectPath) {
        await this._startWithProject(data.projectPath)
      } else {
        this._showWelcomeScreen(data?.recentProjects || [])
      }

      // Listen for project selected from welcome screen
      window.puffin.app.onProjectReady(async (data) => {
        console.log('Project selected:', data?.projectPath)
        this._hideWelcomeScreen()
        await this._startWithProject(data.projectPath)
      })
    } else {
      // Development mode without Electron
      console.log('Running in development mode')
      setTimeout(() => {
        this.intents.initializeApp('/dev/test-project', 'test-project')
      }, 100)
    }
  }

  /**
   * Show the first-run plugin picker if this is the user's first launch.
   * Awaits user confirmation before resolving, so the rest of init() is blocked
   * until the user has made their plugin selections.
   */
  async _maybeShowFirstRunSetup() {
    try {
      const result = await window.puffin.plugins.isFirstRun()
      if (!result?.isFirstRun) return
      const setup = new FirstRunSetup()
      await setup.show()
    } catch (err) {
      console.warn('[FirstRunSetup] Skipped due to error:', err)
    }
  }

  /**
   * Show the welcome screen with the given recent projects list.
   * @param {Array} recentProjects
   */
  _showWelcomeScreen(recentProjects) {
    const screen = document.getElementById('welcome-screen')
    if (!screen) return

    screen.classList.remove('hidden')

    // Render recent projects list
    const list = document.getElementById('welcome-recent-list')
    const noRecent = document.getElementById('welcome-no-recent')

    list.innerHTML = ''

    if (recentProjects.length === 0) {
      noRecent.classList.remove('hidden')
    } else {
      noRecent.classList.add('hidden')
      recentProjects.forEach(project => {
        const li = document.createElement('li')
        li.className = 'welcome-recent-item'
        li.title = project.path

        li.innerHTML = `
          <div class="welcome-recent-info">
            <span class="welcome-recent-name">${this._escapeHtml(project.name)}</span>
            <span class="welcome-recent-path">${this._escapeHtml(project.path)}</span>
          </div>
          <button class="welcome-recent-remove" title="Remove from list" data-path="${this._escapeHtml(project.path)}">✕</button>
        `

        // Open project on row click
        li.addEventListener('click', async (e) => {
          if (e.target.closest('.welcome-recent-remove')) return
          await this._openProjectFromWelcome(project.path)
        })

        // Remove from list button
        li.querySelector('.welcome-recent-remove').addEventListener('click', async (e) => {
          e.stopPropagation()
          await window.puffin.app.removeRecentProject(project.path)
          li.remove()
          if (list.children.length === 0) {
            noRecent.classList.remove('hidden')
          }
        })

        list.appendChild(li)
      })
    }

    // Open folder button
    const openBtn = document.getElementById('welcome-open-btn')
    if (openBtn) {
      openBtn.addEventListener('click', async () => {
        await this._browseForProjectFromWelcome()
      })
    }
  }

  /**
   * Hide the welcome screen.
   */
  _hideWelcomeScreen() {
    const screen = document.getElementById('welcome-screen')
    if (screen) screen.classList.add('hidden')
  }

  /**
   * Open a project path from the welcome screen.
   * @param {string} projectPath
   */
  async _openProjectFromWelcome(projectPath) {
    this._setWelcomeLoading(true)
    const result = await window.puffin.app.openProject(projectPath)
    if (!result.success) {
      this._setWelcomeLoading(false)
      console.error('Failed to open project:', result.error)
      // Show error inline in welcome screen
      const noRecent = document.getElementById('welcome-no-recent')
      if (noRecent) {
        noRecent.textContent = `Could not open project: ${result.error}`
        noRecent.classList.remove('hidden')
      }
    }
    // On success, main process sends app:projectReady → _hideWelcomeScreen + _startWithProject
  }

  /**
   * Browse for a project from the welcome screen.
   */
  async _browseForProjectFromWelcome() {
    const result = await window.puffin.app.browseForProject()
    if (result.canceled) return
    if (!result.success) {
      console.error('Failed to browse for project:', result.error)
    }
    // On success, main process sends app:projectReady
  }

  /**
   * Show/hide a loading spinner on the welcome screen.
   * @param {boolean} loading
   */
  _setWelcomeLoading(loading) {
    const openBtn = document.getElementById('welcome-open-btn')
    if (!openBtn) return
    openBtn.disabled = loading
    openBtn.textContent = loading ? 'Opening...' : '📂  Open Folder...'
  }

  /**
   * Escape HTML special characters.
   * @param {string} str
   * @returns {string}
   */
  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  /**
   * Complete app initialization for a selected project.
   * Extracted so it can be called from both the direct-arg path and welcome screen.
   * @param {string} projectPath
   */
  async _startWithProject(projectPath) {
    this.projectPath = projectPath

    // Check if Claude CLI is available
    const claudeStatus = await window.puffin.claude.check()
    if (claudeStatus.available) {
      console.log('Claude CLI available:', claudeStatus.version)
    } else {
      console.warn('Claude CLI check returned unavailable. If claude --version works in terminal, this is a false negative.')
    }

    // Initialize app with project path
    const projectName = this.projectPath ? this.projectPath.split(/[/\\]/).pop() : 'Unknown'
    this.intents.initializeApp(this.projectPath, projectName)

    // Security: Check for active Git hooks and warn user
    await this.checkGitHooksSecurity()

    // Load state from .puffin/ directory
    await this.loadState()

    // Redirect to Config on first open of an empty project
    this._checkNewProjectOnboarding()

    // Initialize plugin styles (load before views to prevent flash of unstyled content)
    await this.initPluginStyles()

    // Initialize plugin component loader (loads renderer components for active plugins)
    await this.initPluginComponentLoader()

    // Initialize plugin sidebar view manager
    await this.initPluginSidebarManager()

    // Refresh git panel now that the project is open and IPC handlers are registered.
    // The git panel initializes at startup (before project selection), so its first
    // refreshGitState() call finds no git IPC handlers registered → hides the indicator.
    // We must re-run it here after the project is fully initialized.
    if (this.components?.gitPanel?.refreshGitState) {
      this.components.gitPanel.refreshGitState().catch(() => {})
    }

    // Initialize activity log for this project
    this.activityLog.init(this.projectPath)
    this.activityLog.record(ActivityEventType.PROJECT_OPENED, { name: projectName })
  }

  /**
   * Initialize managers with dependencies
   */
  initManagers() {
    this.modalManager = new ModalManager(
      this.intents,
      this.showToast.bind(this)
    )
    this.statePersistence = new StatePersistence(
      () => this.state,
      this.intents,
      this.showToast.bind(this)
    )
    this.activityTracker = new ActivityTracker(this.intents, () => this.state)
    this.helpModeController = new HelpModeController()
    this.activityLog = new ActivityLog()

    // Global fixed-position tooltip engine (reads data-tooltip + data-help-active)
    initTooltipEngine()

    // Expose HOW_CONTENT so modal-manager can access it without a circular import
    window._puffinGuideHowContent = { HOW_CONTENT }

    // Initialize plugin view container
    this.pluginViewContainer.init()

    // Initialize style injector
    this.styleInjector.init()
  }

  /**
   * Build a fresh workflow context (summary + detected phase + action cards) from the current state.
   * Intended to be called on each next-best-action button click.
   * @returns {Promise<{ summary: string, phase: object, actionCards: ActionCard[], activityLog: ActivityLog }>}
   */
  async getWorkflowSummary() {
    const { summary, phase } = await fetchWorkflowContext(this.state)
    let gitStatus = null
    let isRepo    = true // assume true unless we learn otherwise
    try {
      if (window.puffin?.git?.getStatus)      gitStatus = await window.puffin.git.getStatus()
      if (window.puffin?.git?.isRepository) {
        const repoCheck = await window.puffin.git.isRepository()
        isRepo = repoCheck?.isRepo !== false
      }
    } catch { /* ignore */ }
    const actionCards = computeActionCards(this.state, gitStatus, this.activityLog, isRepo)

    // Build branch/thread history for the journey timeline
    const rawBranches = this.state?.history?.raw?.branches || {}
    const branchOrder = this.state?.history?.branches || []
    const branchHistory = branchOrder
      .map(b => {
        const allPrompts = rawBranches[b.id]?.prompts || []
        // Build prompt map for ancestor traversal
        const promptMap = {}
        for (const p of allPrompts) promptMap[p.id] = p
        // For each prompt, find its root ancestor
        const rootOf = {}
        for (const p of allPrompts) {
          let cur = p
          while (cur.parentId && promptMap[cur.parentId]) cur = promptMap[cur.parentId]
          rootOf[p.id] = cur.id
        }
        // Compute lastActivityAt = max response.timestamp in each thread's subtree
        // (response.timestamp is set by completeResponse action when Claude finishes)
        const lastActivityAt = {}
        for (const p of allPrompts) {
          const rootId = rootOf[p.id]
          const ts = p.response?.timestamp || p.timestamp || 0
          if (!lastActivityAt[rootId] || ts > lastActivityAt[rootId]) lastActivityAt[rootId] = ts
        }
        return {
          id: b.id,
          name: b.name,
          threads: allPrompts
            .filter(p => !p.parentId)
            .map(p => ({
              id:                p.id,
              content:           p.content   || '',
              type:              p.type      || 'prompt',
              title:             p.title     || '',
              createdAt:         p.timestamp || null,
              responseTimestamp: p.response?.timestamp || null,
              lastActivityAt:    lastActivityAt[p.id] || p.timestamp || null,
              hasResponse:       !!p.response,
            }))
        }
      })
      .filter(b => b.threads.length > 0)

    return { summary, phase, actionCards, activityLog: this.activityLog, branchHistory }
  }

  /**
   * Returns true if the user has any prior activity — prompts sent or stories
   * created. Used to determine the what's-next button label.
   * @param {object} state
   * @returns {boolean}
   */
  _hasAnyActivity(state) {
    if (!state) return false
    const branches = state.history?.raw?.branches || {}
    const hasPrompts = Object.values(branches).some(b => b?.prompts?.length > 0)
    const hasStories = (state.userStories?.length || 0) > 0
    return hasPrompts || hasStories
  }

  /**
   * Check for active Git hooks and warn user (security measure)
   * Based on IDEsaster vulnerability research recommendations
   */
  async checkGitHooksSecurity() {
    if (!window.puffin?.git) return

    try {
      const result = await window.puffin.git.checkActiveHooks()
      if (result.success && result.hasActiveHooks && result.hooks.length > 0) {
        const hookList = result.hooks.join(', ')
        console.warn('[Security] Active Git hooks detected:', hookList)

        this.showToast({
          type: 'warning',
          title: `Active Git hooks detected: ${hookList}`,
          message: 'These scripts run automatically during Git operations. Review .git/hooks/ if you did not create them.',
          duration: 15000
        })
      }
    } catch (error) {
      console.error('[Security] Error checking Git hooks:', error)
      // Silent fail - this is a non-critical security check
    }
  }

  /**
   * Load state from .puffin/ directory
   */
  async loadState() {
    if (!window.puffin) return

    try {
      const result = await window.puffin.state.init()
      if (result.success) {
        console.log('State loaded from .puffin/', result.state)
        this.intents.loadState(result.state)
      } else {
        console.error('Failed to load state:', result.error)
        this.showToast('Failed to load project state: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Error loading state:', error)
      this.showToast('Error loading project state', 'error')
    }
  }

  /**
   * Initialize the plugin sidebar view manager
   * Sets up listeners for plugin views and integrates with built-in nav
   */
  async initPluginSidebarManager() {
    try {
      await this.sidebarViewManager.init({
        onViewActivate: (viewId, view) => {
          console.log('[PuffinApp] Plugin view activated:', viewId)
          // Deactivate built-in nav buttons when plugin view is active
          document.querySelectorAll('#main-nav .nav-btn').forEach(btn => {
            btn.classList.remove('active')
          })
        }
      })

      // Integrate with built-in nav - when a built-in view is clicked,
      // deactivate any active plugin view
      // Exclude plugin nav buttons since they have their own click handlers
      document.querySelectorAll('#main-nav .nav-btn:not(.plugin-nav-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
          this.sidebarViewManager.showBuiltInView()
        })
      })

      console.log('[PuffinApp] Plugin sidebar manager initialized')
    } catch (error) {
      console.error('[PuffinApp] Failed to initialize plugin sidebar manager:', error)
    }
  }

  /**
   * Initialize plugin style management
   * Loads existing plugin styles and subscribes to plugin lifecycle events
   */
  async initPluginStyles() {
    if (!window.puffin || !window.puffin.plugins) {
      console.warn('[PuffinApp] puffin.plugins API not available for style injection')
      return
    }

    try {
      // Load styles for all currently active plugins
      const result = await window.puffin.plugins.getAllStylePaths()
      if (result.success && result.plugins) {
        for (const pluginInfo of result.plugins) {
          await this.styleInjector.injectPluginStyles(
            pluginInfo.pluginName,
            pluginInfo.styles,
            pluginInfo.pluginDir
          )
        }
        console.log(`[PuffinApp] Loaded styles for ${result.plugins.length} plugins`)
      }

      // Subscribe to plugin activated events to load styles
      window.puffin.plugins.onPluginActivated(async (data) => {
        console.log('[PuffinApp] Plugin activated, loading styles:', data.name)
        const styleResult = await window.puffin.plugins.getStylePaths(data.name)
        if (styleResult.success && styleResult.styles.length > 0) {
          await this.styleInjector.injectPluginStyles(
            data.name,
            styleResult.styles,
            styleResult.pluginDir
          )
        }
      })

      // Subscribe to plugin deactivated events to remove styles
      window.puffin.plugins.onPluginDeactivated((data) => {
        console.log('[PuffinApp] Plugin deactivated, removing styles:', data.name)
        this.styleInjector.removePluginStyles(data.name)
      })

      console.log('[PuffinApp] Plugin style management initialized')
    } catch (error) {
      console.error('[PuffinApp] Failed to initialize plugin styles:', error)
    }
  }

  /**
   * Initialize plugin component loader
   * Loads renderer components for active plugins and subscribes to lifecycle events
   */
  async initPluginComponentLoader() {
    try {
      await this.pluginComponentLoader.init()
      console.log('[PuffinApp] Plugin component loader initialized')
    } catch (error) {
      console.error('[PuffinApp] Failed to initialize plugin component loader:', error)
    }
  }

  /**
   * Initialize SAM instance with components
   */
  initSAM() {
    // Define action names in order - must match the actions array below
    const actionNames = [
      'initializeApp', 'loadState', 'appError', 'recover',
      'updateConfig', 'updateOptions',
      'startCompose', 'updatePromptContent', 'submitPrompt',
      'receiveResponseChunk', 'completeResponse', 'responseError', 'cancelPrompt',
      'rerunPrompt', 'clearRerunRequest', 'setPendingPromptId',
      'requestContinue', 'clearContinueRequest',
      'selectBranch', 'createBranch', 'deleteBranch', 'reorderBranches', 'updateBranchSettings', 'selectPrompt', 'clearPromptSelection',
      'toggleThreadExpanded', 'expandThreadToEnd', 'updateThreadSearchQuery', 'markThreadComplete', 'unmarkThreadComplete',
      'addUserStory', 'updateUserStory', 'deleteUserStory', 'loadUserStories',
      'switchView', 'toggleSidebar', 'showModal', 'hideModal',
      'toolStart', 'toolEnd', 'clearActivity',
      'loadDeveloperProfile', 'loadGithubRepositories', 'loadGithubActivity',
      // Handoff actions
      'showHandoffReview', 'updateHandoffSummary', 'completeHandoff', 'cancelHandoff', 'deleteHandoff',
      'setBranchHandoffContext', 'clearBranchHandoffContext',
      // Stuck detection actions
      'recordIterationOutput', 'resolveStuckState', 'resetStuckDetection',
      // Debug actions
      'storeDebugPrompt', 'clearDebugPrompt', 'setDebugMode',
      // Synthetic CRE prompt entries
      'addSyntheticPrompt',
      // Website Edition — Puppeteer Visual Loop
      'setPuppeteerLoop'
    ]

    const samResult = SAM({
      initialState: {
        ...appFsm.initialState(initialModel),
        ...promptFsm.initialState({})
      },
      component: {
        actions: [
          // App FSM actions
          appFsm.addAction(actions.initializeApp, 'INITIALIZE_APP'),
          appFsm.addAction(actions.loadState, 'LOAD_STATE'),
          appFsm.addAction(actions.appError, 'APP_ERROR'),
          appFsm.addAction(actions.recover, 'RECOVER'),

          // Config actions
          ['UPDATE_CONFIG', actions.updateConfig],
          ['UPDATE_OPTIONS', actions.updateOptions],

          // Prompt FSM actions
          promptFsm.addAction(actions.startCompose, 'START_COMPOSE'),
          ['UPDATE_PROMPT_CONTENT', actions.updatePromptContent],
          promptFsm.addAction(actions.submitPrompt, 'SUBMIT_PROMPT'),
          promptFsm.addAction(actions.receiveResponseChunk, 'RECEIVE_RESPONSE_CHUNK'),
          promptFsm.addAction(actions.completeResponse, 'COMPLETE_RESPONSE'),
          promptFsm.addAction(actions.responseError, 'RESPONSE_ERROR'),
          promptFsm.addAction(actions.cancelPrompt, 'CANCEL_PROMPT'),

          // Rerun prompt actions
          ['RERUN_PROMPT', actions.rerunPrompt],
          ['CLEAR_RERUN_REQUEST', actions.clearRerunRequest],
          ['SET_PENDING_PROMPT_ID', actions.setPendingPromptId],

          // Continue prompt actions
          ['REQUEST_CONTINUE', actions.requestContinue],
          ['CLEAR_CONTINUE_REQUEST', actions.clearContinueRequest],

          // Branch/History actions
          ['SELECT_BRANCH', actions.selectBranch],
          ['CREATE_BRANCH', actions.createBranch],
          ['DELETE_BRANCH', actions.deleteBranch],
          ['REORDER_BRANCHES', actions.reorderBranches],
          ['UPDATE_BRANCH_SETTINGS', actions.updateBranchSettings],
          ['SELECT_PROMPT', actions.selectPrompt],
          ['CLEAR_PROMPT_SELECTION', actions.clearPromptSelection],

          // Thread expansion/collapse actions
          ['TOGGLE_THREAD_EXPANDED', actions.toggleThreadExpanded],
          ['EXPAND_THREAD_TO_END', actions.expandThreadToEnd],
          ['UPDATE_THREAD_SEARCH_QUERY', actions.updateThreadSearchQuery],
          ['MARK_THREAD_COMPLETE', actions.markThreadComplete],
          ['UNMARK_THREAD_COMPLETE', actions.unmarkThreadComplete],

          // User Story actions
          ['ADD_USER_STORY', actions.addUserStory],
          ['UPDATE_USER_STORY', actions.updateUserStory],
          ['DELETE_USER_STORY', actions.deleteUserStory],
          ['LOAD_USER_STORIES', actions.loadUserStories],

          // UI Navigation actions
          ['SWITCH_VIEW', actions.switchView],
          ['TOGGLE_SIDEBAR', actions.toggleSidebar],
          ['SHOW_MODAL', actions.showModal],
          ['HIDE_MODAL', actions.hideModal],

          // Activity tracking actions
          ['TOOL_START', actions.toolStart],
          ['TOOL_END', actions.toolEnd],
          ['CLEAR_ACTIVITY', actions.clearActivity],

          // Developer profile actions
          ['LOAD_DEVELOPER_PROFILE', actions.loadDeveloperProfile],
          ['LOAD_GITHUB_REPOSITORIES', actions.loadGithubRepositories],
          ['LOAD_GITHUB_ACTIVITY', actions.loadGithubActivity],

          // Handoff actions
          ['SHOW_HANDOFF_REVIEW', actions.showHandoffReview],
          ['UPDATE_HANDOFF_SUMMARY', actions.updateHandoffSummary],
          ['COMPLETE_HANDOFF', actions.completeHandoff],
          ['CANCEL_HANDOFF', actions.cancelHandoff],
          ['DELETE_HANDOFF', actions.deleteHandoff],
          ['SET_BRANCH_HANDOFF_CONTEXT', actions.setBranchHandoffContext],
          ['CLEAR_BRANCH_HANDOFF_CONTEXT', actions.clearBranchHandoffContext],

          // Stuck detection actions
          ['RECORD_ITERATION_OUTPUT', actions.recordIterationOutput],
          ['RESOLVE_STUCK_STATE', actions.resolveStuckState],
          ['RESET_STUCK_DETECTION', actions.resetStuckDetection],
          // Debug actions
          ['STORE_DEBUG_PROMPT', actions.storeDebugPrompt],
          ['CLEAR_DEBUG_PROMPT', actions.clearDebugPrompt],
          ['SET_DEBUG_MODE', actions.setDebugMode],
          // Synthetic CRE prompt entries
          ['ADD_SYNTHETIC_PROMPT', actions.addSyntheticPrompt],
          // Website Edition — Puppeteer Visual Loop
          ['SET_PUPPETEER_LOOP', actions.setPuppeteerLoop]
        ],
        acceptors: [
          ...appFsm.acceptors,
          ...promptFsm.acceptors,
          ...acceptors
        ],
        reactors: [
          ...appFsm.stateMachine,
          ...promptFsm.stateMachine
        ]
      },
      render: (model, proposal) => {
        const previousState = this.state
        this.state = computeState(model)

        const actionType = model?.__actionName || proposal?.__actionName || proposal?.type || this.lastAction?.type || 'UNKNOWN'
        const actionInfo = proposal || this.lastAction || { type: actionType }

        // Skip debugger recording for high-frequency streaming actions to avoid
        // deep-cloning the entire model (including growing streamingResponse) on every chunk.
        // This prevents OOM crashes during long CLI sessions.
        const skipDebuggerActions = new Set(['RECEIVE_RESPONSE_CHUNK', 'RECEIVE_RAW_MESSAGE'])
        if (!skipDebuggerActions.has(actionType)) {
          samDebugger.recordAction(actionType, actionInfo, model, this.state)
        }

        console.log('[SAM-RENDER] actionType:', actionType, 'model.__actionName:', model?.__actionName)

        this.lastAction = null
        render(this.state, previousState, actionType)

        // Auto-persist state changes to .puffin/
        if (this.statePersistence) {
          this.statePersistence.persist(actionType, actionInfo)
        }
      }
    })

    // Convert intents array to named object
    this.intents = {}
    const intentsArray = samResult.intents || []
    actionNames.forEach((name, index) => {
      if (intentsArray[index]) {
        this.intents[name] = intentsArray[index]
      }
    })

    console.log('SAM initialized with intents:', Object.keys(this.intents))
    window.__puffin_intents = this.intents

    this.wrapIntentsForDebugging()
  }

  /**
   * Wrap intents for debugging (adds logging)
   */
  wrapIntentsForDebugging() {
    this.lastAction = null
    const originalIntents = { ...this.intents }

    const toActionType = (name) => {
      return name.replace(/([A-Z])/g, '_$1').toUpperCase()
    }

    Object.keys(originalIntents).forEach(key => {
      if (typeof originalIntents[key] === 'function') {
        const original = originalIntents[key]
        this.intents[key] = (...args) => {
          this.lastAction = { type: toActionType(key), args }
          return original.apply(this.intents, args)
        }
      }
    })
  }

  /**
   * Initialize UI components
   */
  initComponents() {
    this.components = {
      projectForm: new ProjectFormComponent(this.intents),
      historyTree: new HistoryTreeComponent(this.intents),
      promptEditor: new PromptEditorComponent(this.intents),
      responseViewer: new ResponseViewerComponent(this.intents),
      debugger: new DebuggerComponent(this.intents),
      cliOutput: new CliOutputComponent(this.intents),
      userStories: new UserStoriesComponent(this.intents),
      developerProfile: new DeveloperProfileComponent(this.intents),
      storyGenerations: new StoryGenerationsComponent(this.intents),
      gitPanel: new GitPanelComponent(this.intents)
    }

    Object.values(this.components).forEach(component => {
      if (component.init) component.init()
    })
  }

  /**
   * Setup global event listeners
   */
  setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.target.dataset.view
        this.intents.switchView(view)
      })
    })

    // Sidebar toggle
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
      this.intents.toggleSidebar()
    })

    // Modal backdrop click
    document.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      this.intents.hideModal()
    })

    // Modal close button
    document.querySelector('.modal-close')?.addEventListener('click', () => {
      this.intents.hideModal()
    })

    // Debugger toggle
    document.getElementById('debugger-toggle')?.addEventListener('click', () => {
      this.components.debugger.toggle()
    })

    // Next-action advisor (header button)
    document.getElementById('next-action-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('next-action-btn')
      if (btn) { btn.disabled = true; btn.textContent = '…' }
      try {
        const { summary: workflowSummary, phase: currentPhase, actionCards, activityLog, branchHistory } = await this.getWorkflowSummary()
        this.intents.showModal('next-action', { workflowSummary, currentPhase, actionCards, activityLog, branchHistory })
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Next Action' }
      }
    })

    // What's next button (prompt toolbar — visible in help mode only)
    document.getElementById('whats-next-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('whats-next-btn')
      if (btn) { btn.disabled = true; btn.textContent = '…' }
      try {
        const { summary: workflowSummary, phase: currentPhase, actionCards, activityLog, branchHistory } = await this.getWorkflowSummary()
        this.intents.showModal('next-action', { workflowSummary, currentPhase, actionCards, activityLog, branchHistory })
      } finally {
        if (btn) {
          btn.disabled = false
          btn.textContent = this._hasAnyActivity(this.state)
            ? "What should I do next?"
            : "How can I get started?"
        }
      }
    })

    // Help mode toggle
    document.getElementById('help-mode-toggle')?.addEventListener('click', () => {
      const current = this.state?.config?.helpMode || false
      this.intents.updateConfig({ helpMode: !current })
    })

    // CLAUDE.md viewer button
    document.getElementById('view-claude-config-btn')?.addEventListener('click', () => {
      this.intents.showModal('claude-config-view', {})
    })

    // Listen for state changes
    document.addEventListener('puffin-state-change', (e) => {
      this.onStateChange(e.detail)
    })

    // Sidebar resizer
    this.setupSidebarResize()

    // Prompt area resizer
    this.setupPromptResize()

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleKeyDown(e)
    })

    // Profile menu IPC handlers
    this.setupProfileMenuHandlers()

    // Handoff panel event handlers
    this.setupHandoffPanelHandlers()

    // Debug view handlers
    this.setupDebugViewHandlers()
  }

  /**
   * Setup debug view event handlers
   */
  setupDebugViewHandlers() {
    const copyBtn = document.getElementById('debug-copy-btn')
    const clearBtn = document.getElementById('debug-clear-btn')

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const promptContent = document.getElementById('debug-prompt-content')
        if (promptContent && promptContent.textContent) {
          try {
            await navigator.clipboard.writeText(promptContent.textContent)
            this.showToast('Prompt copied to clipboard', 'success')
          } catch (err) {
            this.showToast('Failed to copy to clipboard', 'error')
          }
        }
      })
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.intents.clearDebugPrompt()
        const promptContent = document.getElementById('debug-prompt-content')
        const timestampEl = document.getElementById('debug-timestamp')
        const branchEl = document.getElementById('debug-branch')
        const modelEl = document.getElementById('debug-model')

        if (promptContent) promptContent.textContent = 'Submit a prompt to see what Puffin sends to Claude CLI...'
        if (timestampEl) timestampEl.textContent = 'No prompt submitted yet'
        if (branchEl) branchEl.textContent = ''
        if (modelEl) modelEl.textContent = ''
      })
    }
  }

  /**
   * Setup handoff panel event handlers
   */
  setupHandoffPanelHandlers() {
    const generateBtn = document.getElementById('generate-handoff-btn')
    const regenerateBtn = document.getElementById('handoff-regenerate-btn')
    const clearBtn = document.getElementById('handoff-clear-btn')
    const branchGrid = document.getElementById('handoff-branch-grid')

    // Generate handoff button
    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        this.generateHandoffSummary()
      })
    }

    // Regenerate button
    if (regenerateBtn) {
      regenerateBtn.addEventListener('click', () => {
        this.generateHandoffSummary()
      })
    }

    // Clear button
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearHandoffSummary()
      })
    }

    // Branch button clicks (event delegation)
    if (branchGrid) {
      branchGrid.addEventListener('click', (e) => {
        const branchBtn = e.target.closest('.handoff-branch-btn')
        if (branchBtn) {
          const branchId = branchBtn.dataset.branch
          const branchName = branchBtn.dataset.branchName
          this.sendHandoffToBranch(branchId, branchName)
        }
      })
    }

    // Restore any persisted handoff summary on load
    this.restoreHandoffSummary()
  }

  /**
   * Get project-specific localStorage key for handoff summary
   */
  getHandoffStorageKey() {
    // Use project path to make the key unique per project
    const projectId = this.projectPath ? btoa(this.projectPath).slice(0, 20) : 'default'
    return `puffin-handoff-summary-${projectId}`
  }

  /**
   * Clear the generated handoff summary
   */
  clearHandoffSummary() {
    this.resetHandoffPanel()
    // Also clear from localStorage (project-specific)
    localStorage.removeItem(this.getHandoffStorageKey())
    this.showToast('Handoff summary cleared', 'info')
  }

  /**
   * Restore handoff summary from localStorage
   */
  restoreHandoffSummary() {
    try {
      const storageKey = this.getHandoffStorageKey()
      const saved = localStorage.getItem(storageKey)
      if (!saved) return

      const data = JSON.parse(saved)
      if (!data || !data.summary) return

      this.generatedHandoffSummary = data

      // Restore the UI
      const generateBtn = document.getElementById('generate-handoff-btn')
      const generatedSection = document.getElementById('handoff-generated-section')
      const summaryDisplay = document.getElementById('handoff-generated-summary')
      const branchGrid = document.getElementById('handoff-branch-grid')

      if (generateBtn && generatedSection && summaryDisplay) {
        summaryDisplay.innerHTML = `<div class="handoff-summary-content">${this.renderMarkdown(data.summary)}</div>`
        this.renderHandoffBranchButtons(branchGrid, data.sourceBranch)
        generatedSection.classList.remove('hidden')
        generateBtn.style.display = 'none'
        console.log('[HANDOFF] Restored saved handoff summary from', data.sourceBranch)
      }
    } catch (error) {
      console.error('[HANDOFF] Error restoring handoff summary:', error)
      localStorage.removeItem(this.getHandoffStorageKey())
    }
  }

  /**
   * Setup profile menu IPC message handlers
   */
  setupProfileMenuHandlers() {
    if (!window.puffin?.menu) return

    window.puffin.menu.onProfileView(() => this.handleProfileAction('view'))
    window.puffin.menu.onProfileCreate(() => this.handleProfileAction('create'))
    window.puffin.menu.onProfileEdit(() => this.handleProfileAction('edit'))
    window.puffin.menu.onProfileExport(() => this.handleProfileAction('export'))
    window.puffin.menu.onProfileImport(() => this.handleProfileAction('import'))
    window.puffin.menu.onProfileDelete(() => this.handleProfileAction('delete'))
  }

  /**
   * Handle profile menu actions
   */
  async handleProfileAction(action) {
    console.log(`Profile action: ${action}`)

    switch (action) {
      case 'view':
        this.intents.switchView('profile')
        break
      case 'create':
      case 'edit':
        this.intents.switchView('profile')
        break
      case 'export':
        if (this.components.developerProfile) {
          await this.components.developerProfile.handleExport()
        }
        break
      case 'import':
        if (this.components.developerProfile) {
          await this.components.developerProfile.handleImport()
        }
        break
      case 'delete':
        if (this.components.developerProfile) {
          await this.components.developerProfile.handleDelete()
        }
        break
      default:
        console.warn(`Unknown profile action: ${action}`)
    }
  }

  /**
   * Setup sidebar resize functionality
   */
  setupSidebarResize() {
    const sidebar = document.getElementById('sidebar')
    const resizer = document.getElementById('sidebar-resizer')

    if (!sidebar || !resizer) return

    let isResizing = false
    let startX = 0
    let startWidth = 0

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true
      startX = e.clientX
      startWidth = sidebar.offsetWidth

      resizer.classList.add('resizing')
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
      e.preventDefault()
    })

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return

      const width = startWidth + (e.clientX - startX)
      const newWidth = Math.max(200, Math.min(width, 500))
      sidebar.style.width = `${newWidth}px`
      e.preventDefault()
    })

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false
        resizer.classList.remove('resizing')
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    })
  }

  /**
   * Setup prompt area resize functionality
   */
  setupPromptResize() {
    const promptArea = document.getElementById('prompt-area')
    const separator = document.getElementById('prompt-separator')

    if (!promptArea || !separator) return

    let isResizing = false
    let startY = 0
    let startHeight = 0

    separator.addEventListener('mousedown', (e) => {
      isResizing = true
      startY = e.clientY
      startHeight = promptArea.offsetHeight

      separator.classList.add('resizing')
      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
      e.preventDefault()
    })

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return

      // Calculate new height (dragging down increases height, up decreases)
      const deltaY = startY - e.clientY
      const newHeight = startHeight + deltaY

      // Set min/max height constraints
      const minHeight = 150  // Minimum prompt area height
      const maxHeight = window.innerHeight * 0.7  // Max 70% of viewport
      const constrainedHeight = Math.max(minHeight, Math.min(newHeight, maxHeight))

      promptArea.style.height = `${constrainedHeight}px`
      e.preventDefault()
    })

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false
        separator.classList.remove('resizing')
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    })
  }

  /**
   * Setup menu event listeners (for Electron menu actions)
   */
  setupMenuListeners() {
    if (!window.puffin?.menu) return

    window.puffin.menu.onProfileView(() => {
      console.log('Menu: Profile View')
      this.intents.showModal('profile-view', {})
    })

    window.puffin.menu.onProfileCreate(() => {
      console.log('Menu: Profile Create')
      this.intents.showModal('profile-create', {})
    })

    window.puffin.menu.onProfileEdit(() => {
      console.log('Menu: Profile Edit')
      this.intents.showModal('profile-edit', {})
    })

    window.puffin.menu.onProfileExport(async () => {
      console.log('Menu: Profile Export')
      try {
        const result = await window.puffin.profile.export()
        if (result.success) {
          this.showToast('Profile exported successfully', 'success')
        } else if (result.error) {
          this.showToast('Export failed: ' + result.error, 'error')
        }
      } catch (error) {
        this.showToast('Export failed: ' + error.message, 'error')
      }
    })

    window.puffin.menu.onProfileImport(async () => {
      console.log('Menu: Profile Import')
      try {
        const result = await window.puffin.profile.import()
        if (result.success) {
          this.showToast('Profile imported successfully', 'success')
          await this.loadState()
        } else if (result.error) {
          this.showToast('Import failed: ' + result.error, 'error')
        }
      } catch (error) {
        this.showToast('Import failed: ' + error.message, 'error')
      }
    })

    window.puffin.menu.onProfileDelete(async () => {
      console.log('Menu: Profile Delete')
      if (confirm('Are you sure you want to delete your profile? This cannot be undone.')) {
        try {
          const result = await window.puffin.profile.delete()
          if (result.success) {
            this.showToast('Profile deleted', 'success')
          } else {
            this.showToast('Delete failed: ' + result.error, 'error')
          }
        } catch (error) {
          this.showToast('Delete failed: ' + error.message, 'error')
        }
      }
    })

    if (window.puffin.menu.onManagePlugins) {
      window.puffin.menu.onManagePlugins(() => {
        const mgr = new PluginManager()
        mgr.show()
      })
    }
  }

  /**
   * Setup Claude API event listeners
   */
  setupClaudeListeners() {
    if (!window.puffin) return

    // Raw message streaming (for CLI Output view and activity tracking)
    const unsubRaw = window.puffin.claude.onRawMessage((jsonLine) => {
      this.components.cliOutput.handleRawMessage(jsonLine)
      this.activityTracker.processMessage(jsonLine)
    })
    this.claudeListeners.push(unsubRaw)

    // Full prompt (for Debug view) - captures the complete prompt with all context
    const unsubFullPrompt = window.puffin.claude.onFullPrompt((fullPrompt) => {
      console.log('[DEBUG-PROMPT] Received full prompt from main process, length:', fullPrompt?.length)
      if (this.state?.config?.debugMode && this.intents?.storeDebugPrompt) {
        this.intents.storeDebugPrompt({
          content: fullPrompt,
          branch: this.state?.history?.activeBranch || 'unknown',
          model: 'default',
          sessionId: null
        })
      }
    })
    this.claudeListeners.push(unsubFullPrompt)

    // Response streaming
    const unsubResponse = window.puffin.claude.onResponse((chunk) => {
      this.intents.receiveResponseChunk(chunk)
      this.components.cliOutput.setProcessing(true)
    })
    this.claudeListeners.push(unsubResponse)

    // Response complete
    const unsubComplete = window.puffin.claude.onComplete(async (response) => {
      console.log('[SAM-DEBUG] app.js onComplete received:', {
        contentLength: response?.content?.length || 0,
        turns: response?.turns,
        exitCode: response?.exitCode,
        sessionId: response?.sessionId
      })

      // Detect auth failure responses that come back as successful completions
      // (Claude CLI exits 0 but content is "Not logged in · Please run /login")
      // Only match Claude CLI-specific auth error strings, not broad keywords like "token" or "OAuth"
      // that would false-positive on normal coding responses. Auth errors are also short messages
      // (< 300 chars); real responses mentioning auth topics will be much longer.
      const responseText = response?.content || ''
      const isAuthResponse = responseText.length < 300 && /not logged in|please run \/login/i.test(responseText)
      if (isAuthResponse) {
        console.warn('[AUTH] Auth failure detected in response content — showing re-login modal')
        // Treat as an error: revert the pending prompt to idle state
        this.intents.responseError({ message: responseText })
        this.components.cliOutput.setProcessing(false)

        const activeBranch = this.state?.history?.activeBranch
        const rawPrompts   = this.state?.history?.raw?.branches?.[activeBranch]?.prompts || []
        const failedPrompt = [...rawPrompts].reverse().find(p => !p.response)
        const ipcPayload   = this.components.promptEditor?._lastClaudePayload || null

        this._authRetry = failedPrompt && ipcPayload
          ? { promptId: failedPrompt.id, ipcPayload }
          : null

        this.intents.showModal('auth-expired', {
          errorMessage: responseText,
          onContinue: () => {
            this.intents.hideModal()
            if (this._authRetry) {
              const { promptId, ipcPayload: payload } = this._authRetry
              this._authRetry = null
              this.intents.setPendingPromptId(promptId)
              window.puffin.claude.submit(payload)
            }
          }
        })
        return
      }

      // Reset screenshot badge after session ends; verdict label stays until next toggle
      if (this.state?.puppeteerLoop) {
        this._updateScreenshotBadge(0)
      }

      const filesModified = this.activityTracker.getFilesModified()
      console.log('[SAM-DEBUG] filesModified at completion:', filesModified.length, 'files')

      try {
        this.intents.completeResponse(response, filesModified)
      } catch (err) {
        console.error('[SAM-ERROR] completeResponse failed:', err)
      }

      // Refresh Website Edition URL panel after each response (new/modified files may have appeared)
      if (this.state?.config?.websiteEdition) {
        this._refreshWebsiteUrlPanel().catch(() => {})
      }

      // Reset stuck detection when response completes successfully
      try {
        this.intents.resetStuckDetection()
      } catch (err) {
        console.error('[SAM-ERROR] resetStuckDetection failed:', err)
      }

      // Always clear activity and processing state, even if completeResponse fails
      try {
        this.intents.clearActivity()
      } catch (err) {
        console.error('[SAM-ERROR] clearActivity failed:', err)
      }

      this.components.cliOutput.setProcessing(false)
    })
    this.claudeListeners.push(unsubComplete)

    // Response error
    const unsubError = window.puffin.claude.onError((error) => {
      console.error('[CLAUDE-ERROR] Response error received:', error)
      console.error('[CLAUDE-ERROR] Error message:', error?.message || error)
      this.intents.responseError(error)
      this.components.cliOutput.setProcessing(false)

      const errorMessage = error?.message || String(error) || 'An unknown error occurred'

      // Detect OAuth/authentication errors and offer a re-login flow
      const isAuthError = /authentication_error|OAuth token|oauth token|token.*expired|Failed to authenticate/i.test(errorMessage)
      if (isAuthError) {
        // Find the failed prompt so we can restore pendingPromptId on retry
        const activeBranch = this.state?.history?.activeBranch
        const rawPrompts   = this.state?.history?.raw?.branches?.[activeBranch]?.prompts || []
        const failedPrompt = [...rawPrompts].reverse().find(p => !p.response)
        const ipcPayload   = this.components.promptEditor?._lastClaudePayload || null

        this._authRetry = failedPrompt && ipcPayload
          ? { promptId: failedPrompt.id, ipcPayload }
          : null

        this.intents.showModal('auth-expired', {
          errorMessage,
          onContinue: () => {
            this.intents.hideModal()
            if (this._authRetry) {
              const { promptId, ipcPayload: payload } = this._authRetry
              this._authRetry = null
              this.intents.setPendingPromptId(promptId)
              window.puffin.claude.submit(payload)
            }
          }
        })
        return
      }

      // Generic error toast
      this.showToast({
        type: 'error',
        title: 'Claude Error',
        message: errorMessage,
        duration: 8000
      })
    })
    this.claudeListeners.push(unsubError)

    // Main process unhandled errors — show as toast instead of crashing
    if (window.puffin.mainErrors) {
      const unsubMainError = window.puffin.mainErrors.onError((data) => {
        console.error('[MAIN-ERROR]', data.context, data.message)
        this.showToast({
          type: 'error',
          title: 'Background Error',
          message: data.message || 'An unexpected error occurred',
          duration: 8000
        })
      })
      this.claudeListeners.push(unsubMainError)
    }

    // Claude asking a question (AskUserQuestion tool)
    const unsubQuestion = window.puffin.claude.onQuestion((data) => {
      console.log('[CLAUDE-QUESTION] Question received:', data.toolUseId, data.questions?.length, 'questions')
      this.intents.showModal('claude-question', {
        toolUseId: data.toolUseId,
        questions: data.questions,
        autoAnswerDelayMs: data.autoAnswerDelayMs
      })
    })
    this.claudeListeners.push(unsubQuestion)

    // Rate limit event during active CLI session
    const unsubRateLimit = window.puffin.claude.onRateLimited((data) => {
      console.log('[RATE-LIMIT] Rate limited event received:', data)
      this._handleRateLimitEvent(data)
    })
    this.claudeListeners.push(unsubRateLimit)

    // Bind the /btw panel on first Claude init (idempotent)
    this._bindBtwPanel()
  }

  /**
   * Handle state changes
   */
  onStateChange({ state, changed }) {
    // Track significant workflow events in the activity log
    this._trackActivityLogEvents(state)
    this._prevState = state

    // Apply help mode body class and swap tooltips
    const helpModeEnabled = state.config?.helpMode || false
    document.body.classList.toggle('help-mode', helpModeEnabled)
    this.helpModeController?.setEnabled(helpModeEnabled)
    // Update help mode toggle button label
    const helpBtn = document.getElementById('help-mode-toggle')
    if (helpBtn) {
      helpBtn.textContent = helpModeEnabled ? 'Help ON' : '? Help'
      helpBtn.classList.toggle('active', helpModeEnabled)
    }

    // Update what's-next button label based on activity
    const whatsNextBtn = document.getElementById('whats-next-btn')
    if (whatsNextBtn) {
      const hasActivity = this._hasAnyActivity(state)
      whatsNextBtn.textContent = hasActivity ? "What should I do next?" : "How can I get started?"
    }

    // Apply edition-specific UI gating
    this.applyWebsiteEdition(state)

    // Update debug tab visibility based on config
    this.updateDebugTabVisibility(state)

    // Update debug view content
    this.updateDebugView(state)

    // Check if currentView changed - if so, deactivate any active plugin view
    // This handles cases like branch selection triggering a view switch
    const currentView = state.ui.currentView
    if (this._lastCurrentView !== currentView) {
      if (this.sidebarViewManager.hasActivePluginView()) {
        this.sidebarViewManager.showBuiltInView()
      }

      // Reinitialize project form when switching to config view
      // This ensures form fields are repopulated with latest config values
      if (currentView === 'config' && this.components.projectForm) {
        this.components.projectForm.reinitialize()
        this.components.projectForm.init()
      }

      this._lastCurrentView = currentView
    }

    this.updateNavigation(state)
    this.updateSidebar(state)
    this.updateViews(state)
    this.modalManager.update(state)
    this.updateHeader(state)
    this.updateMetadataPanel(state)
    this.handleStuckDetection(state)

    // Handle rerun request - use guard to prevent re-entry since handler is async
    if (state.rerunRequest && !this._handlingRerunRequest) {
      this._handlingRerunRequest = true
      this.handleRerunRequest(state.rerunRequest, state)
        .finally(() => {
          this._handlingRerunRequest = false
        })
    }

    // Handle continue request - submit continuation prompt to Claude
    // Use guard to prevent re-entry since handler is async
    if (state.continueRequest && !this._handlingContinueRequest) {
      this._handlingContinueRequest = true
      this.handleContinueRequest(state.continueRequest, state)
        .finally(() => {
          this._handlingContinueRequest = false
        })
    }

  }

  /**
   * Handle a rate limit event from the Claude CLI.
   * Updates the header widget so the user can see when tokens reset.
   *
   * @param {{ resetsAt: number|null, rateLimitType: string|null, status: string|null, overageStatus: string|null, overageResetsAt: number|null, isUsingOverage: boolean }} data
   */
  _handleRateLimitEvent(data) {
    // Always update the header widget
    this._updateRateLimitWidget(data)
  }

  /**
   * Updates the rate-limit header widget with current rate limit info.
   * Shows reset time in green, overage in red, and an emoji if overage is allowed.
   *
   * @param {{ resetsAt: number|null, status: string|null, overageStatus: string|null, isUsingOverage: boolean }} data
   */
  _updateRateLimitWidget(data) {
    const widget = document.getElementById('rate-limit-widget')
    if (!widget) return

    if (!data || !data.resetsAt) {
      widget.classList.add('hidden')
      return
    }

    const resetDate = new Date(data.resetsAt * 1000)
    const diffMs = resetDate - Date.now()

    let resetText
    if (diffMs <= 0) {
      resetText = 'reset'
    } else if (diffMs < 24 * 60 * 60 * 1000) {
      const hrs = Math.floor(diffMs / 3600000)
      const mins = Math.ceil((diffMs % 3600000) / 60000)
      resetText = hrs > 0 ? `resets in ${hrs}h ${mins}m` : `resets in ${mins}m`
    } else {
      const day = resetDate.toLocaleDateString(undefined, { weekday: 'short' })
      const time = resetDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      resetText = `resets ${day} at ${time}`
    }

    let html = `<span class="rate-limit-resets">${resetText}</span>`

    if (data.isUsingOverage) {
      html += ` <span class="rate-limit-overage">overage</span>`
    }

    if (data.overageStatus === 'allowed') {
      html += ` <span class="rate-limit-allowed">✅</span>`
    }

    widget.innerHTML = html
    widget.classList.remove('hidden')
  }

  /**
   * Handle stuck detection alert
   * Stub method - stuck detection is not used since the user controls
   * continuation explicitly via the Continue button.
   */
  handleStuckDetection(state) {
    // Remove any existing stuck alert
    const existingAlert = document.getElementById('stuck-alert')
    if (existingAlert) {
      existingAlert.remove()
    }
  }

  /**
   * Show stuck detection alert with action options
   */
  showStuckAlert(stuckState) {
    // Create a modal-like alert for stuck detection
    const existingAlert = document.getElementById('stuck-alert')
    if (existingAlert) {
      existingAlert.remove()
    }

    const alert = document.createElement('div')
    alert.id = 'stuck-alert'
    alert.className = 'stuck-alert'
    alert.innerHTML = `
      <div class="stuck-alert-content">
        <div class="stuck-alert-icon">⚠️</div>
        <div class="stuck-alert-body">
          <h4>Execution Appears Stuck</h4>
          <p>The last ${stuckState.consecutiveCount} iterations produced similar outputs. This may indicate the task is stuck in a loop.</p>
          <div class="stuck-alert-actions">
            <button class="btn primary" data-action="continue">Continue Anyway</button>
            <button class="btn secondary" data-action="modify">Modify Approach</button>
            <button class="btn danger" data-action="stop">Stop Execution</button>
          </div>
        </div>
        <button class="stuck-alert-close" aria-label="Close">×</button>
      </div>
    `

    // Add event handlers
    alert.querySelector('[data-action="continue"]').addEventListener('click', () => {
      this.intents.resolveStuckState('continue')
      alert.remove()
    })

    alert.querySelector('[data-action="modify"]').addEventListener('click', () => {
      this.intents.resolveStuckState('modify')
      alert.remove()
      // Focus the prompt input so user can modify
      const promptInput = document.getElementById('prompt-input')
      if (promptInput) {
        promptInput.focus()
        promptInput.placeholder = 'Enter a modified approach or additional instructions...'
      }
    })

    alert.querySelector('[data-action="stop"]').addEventListener('click', () => {
      this.intents.resolveStuckState('stop')
      alert.remove()
    })

    alert.querySelector('.stuck-alert-close').addEventListener('click', () => {
      this.intents.resolveStuckState('dismiss')
      alert.remove()
    })

    document.body.appendChild(alert)
  }

  /**
   * Update navigation state
   */
  updateNavigation(state) {
    // Don't highlight built-in nav buttons if a plugin view is active
    const pluginViewActive = this.sidebarViewManager?.hasActivePluginView()

    // Detect unconfigured project to pulse the Config button
    const hasProject = !!(state.projectPath || state.projectName)
    const hasThreads = Object.values(state.history?.raw?.branches || {}).some(b => b?.prompts?.length > 0)
    const hasStories = (state.userStories || []).length > 0
    const isUnconfigured = state.initialized && !hasProject && !hasThreads && !hasStories

    // Only update built-in nav buttons (not plugin nav buttons which manage their own state)
    document.querySelectorAll('.nav-btn:not(.plugin-nav-btn)').forEach(btn => {
      const view = btn.dataset.view
      // If a plugin view is active, don't mark any built-in nav as active
      btn.classList.toggle('active', !pluginViewActive && view === state.ui.currentView)
      // Pulse Config button when project needs setup
      if (view === 'config') {
        btn.classList.toggle('needs-setup', isUnconfigured && state.ui.currentView !== 'config')
      }
    })
  }

  /**
   * Update sidebar visibility
   */
  updateSidebar(state) {
    const sidebar = document.getElementById('sidebar')
    if (sidebar) {
      sidebar.classList.toggle('hidden', !state.ui.sidebarVisible)
    }
  }

  /**
   * Update view visibility
   */
  updateViews(state) {
    // Core views - plugins may contribute additional views (e.g., designer-plugin)
    const views = ['config', 'prompt', 'user-stories', 'cli-output', 'git', 'profile', 'debug']
    const hasActivePluginView = this.sidebarViewManager.hasActivePluginView()
    const currentView = state.ui.currentView

    // Check if currentView is a built-in view
    const isBuiltInView = views.includes(currentView)

    // If a plugin view is active but we're switching to a built-in view,
    // deactivate the plugin view first
    if (hasActivePluginView && isBuiltInView) {
      this.sidebarViewManager.showBuiltInView()
      // Continue to show the built-in view below
    } else if (hasActivePluginView) {
      // Plugin view is active and currentView is not a built-in view
      // Keep built-in views hidden and don't interfere
      views.forEach(viewName => {
        const view = document.getElementById(`${viewName}-view`)
        if (view) {
          view.classList.remove('active')
        }
      })
      return
    }

    // Show the appropriate built-in view
    views.forEach(viewName => {
      const view = document.getElementById(`${viewName}-view`)
      if (view) {
        view.classList.toggle('active', currentView === viewName)
      }
    })
  }

  /**
   * Update header indicators
   */
  updateHeader(state) {
    // Update app title with project name from config
    const appTitle = document.getElementById('app-title')
    if (appTitle) {
      appTitle.textContent = state.config?.name || 'Puffin'
    }
  }

  /**
   * Update the right swimlane metadata panel with thread stats and handoff info
   */
  updateMetadataPanel(state) {
    // Update thread statistics
    const turnsEl = document.getElementById('stat-turns')
    const costEl = document.getElementById('stat-cost')
    const durationEl = document.getElementById('stat-duration')
    const createdEl = document.getElementById('stat-created')
    const defectsEl = document.getElementById('stat-defects')
    const handoffSection = document.getElementById('handoff-section')
    const handoffDisplay = document.getElementById('handoff-display')

    // Get current thread/branch info
    const activeBranch = state.history?.activeBranch
    const activePromptId = state.history?.activePromptId
    const branch = activeBranch ? state.history?.raw?.branches?.[activeBranch] : null
    const allPrompts = branch?.prompts || []

    // Get only prompts in the current thread (using thread traversal)
    const threadPrompts = this.collectThreadPrompts(activePromptId, allPrompts)
    const threadRoot = threadPrompts.length > 0 ? threadPrompts[0] : null

    // Aggregate statistics across prompts in the current thread only
    let totalTurns = 0
    let totalCost = 0
    let totalDuration = 0
    let hasCostData = false
    let hasDurationData = false

    threadPrompts.forEach(prompt => {
      if (prompt.response) {
        // Turns
        if (prompt.response.turns) {
          totalTurns += prompt.response.turns
        }
        // Cost
        if (prompt.response.cost !== undefined && prompt.response.cost !== null) {
          totalCost += prompt.response.cost
          hasCostData = true
        }
        // Duration
        if (prompt.response.duration !== undefined && prompt.response.duration !== null) {
          totalDuration += prompt.response.duration
          hasDurationData = true
        }
      }
    })

    // Update turns count
    if (turnsEl) {
      turnsEl.textContent = totalTurns.toString()
    }

    // Update cost
    if (costEl) {
      if (hasCostData) {
        costEl.textContent = `$${totalCost.toFixed(4)}`
      } else {
        costEl.textContent = '-'
      }
    }

    // Update duration (in hours and minutes)
    if (durationEl) {
      if (hasDurationData) {
        const totalMinutes = Math.floor(totalDuration / 60000)
        const hours = Math.floor(totalMinutes / 60)
        const minutes = totalMinutes % 60
        if (hours > 0) {
          durationEl.textContent = `${hours}h ${minutes}m`
        } else {
          durationEl.textContent = `${minutes}m`
        }
      } else {
        durationEl.textContent = '-'
      }
    }

    // Update created date (from thread root, not branch first prompt)
    if (createdEl) {
      const createdAt = threadRoot?.createdAt || threadRoot?.timestamp
      if (createdAt) {
        const date = new Date(createdAt)
        createdEl.textContent = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      } else {
        createdEl.textContent = '-'
      }
    }

    // Update defect count
    if (defectsEl) {
      const defectCount = this.countThreadDefects(threadPrompts)
      defectsEl.textContent = defectCount.toString()
    }

    // Update handoff context section (incoming handoff)
    const activePrompt = allPrompts.find(p => p.id === activePromptId)
    if (handoffSection && handoffDisplay) {
      const handoffContext = activePrompt?.handoffContext
      if (handoffContext) {
        handoffSection.classList.remove('hidden')
        handoffDisplay.innerHTML = `
          <div class="handoff-source">
            <span class="text-small text-muted">From: ${this.escapeHtml(handoffContext.sourceThreadName || 'Unknown')}</span>
          </div>
          <pre>${this.escapeHtml(handoffContext.summary || '')}</pre>
        `
      } else {
        handoffSection.classList.add('hidden')
        handoffDisplay.innerHTML = ''
      }
    }

  }

  /**
   * Apply or remove the website-edition class on <body> based on config.
   * This drives all CSS gating for the Website Edition flag.
   * Also starts/stops the preview server and binds the URL panel.
   */
  applyWebsiteEdition(state) {
    const enabled = state.config?.websiteEdition || false
    const port = state.config?.websitePort || 5000
    const servePath = state.config?.websiteServePath ?? 'dist'
    document.body.classList.toggle('website-edition', enabled)

    // If a gated view is currently active, redirect to prompt view
    if (enabled) {
      const gatedViews = ['user-stories', 'cli-output']
      const currentView = state.ui?.currentView
      if (gatedViews.includes(currentView)) {
        this.intents.switchView('prompt')
      }
    }

    // Manage preview server and URL panel.
    // Guard: only start the server after config has loaded from disk (createdAt is set).
    // Without this, the initial empty state triggers a start on the wrong port (default),
    // which blocks the real start when the loaded config arrives.
    const configLoaded = !!state.config?.createdAt
    if (enabled && configLoaded && window.puffin?.webserver) {
      this._ensureWebserverRunning(port, servePath)
      this._bindWebsiteUrlPanel()
    } else if (!enabled && window.puffin?.webserver) {
      this._stopWebserverIfRunning()
    }

    // Keep the directory input in sync with the saved config value
    const dirInput = document.getElementById('website-serve-dir-input')
    if (dirInput && document.activeElement !== dirInput) {
      dirInput.value = servePath
    }

    // Sync visual loop button and status label with model
    const loopBtn = document.getElementById('puppeteer-loop-btn')
    if (loopBtn) {
      loopBtn.classList.toggle('active', !!state.puppeteerLoop)
    }
    this._updatePuppeteerLoopStatus(!!state.puppeteerLoop)
  }

  /**
   * On the very first open of a brand-new empty project, navigate to Config
   * and show a welcome toast. Uses a per-project localStorage flag so the
   * redirect fires exactly once and never again — even if the user hasn't
   * set a project name yet.
   */
  _checkNewProjectOnboarding() {
    const flagKey = `puffin-onboarded-${this._projectPathHash()}`

    // Already seen — never redirect again for this project
    if (localStorage.getItem(flagKey)) return

    // Mark as seen immediately so restarts don't redirect
    localStorage.setItem(flagKey, '1')

    const s = this.state
    if (!s) return

    const hasName    = !!(s.config?.name?.trim())
    const hasThreads = Object.values(s.history?.raw?.branches || {}).some(b => b?.prompts?.length > 0)
    const hasStories = (s.userStories || []).length > 0

    // Only redirect if the project is genuinely empty
    if (!hasName && !hasThreads && !hasStories) {
      this.intents.switchView('config')
      setTimeout(() => {
        this.showToast('Welcome! Fill in your project details to get started.', 'info', 5000)
      }, 300)
    }
  }

  /**
   * Fast numeric hash of the project path — used for localStorage keys.
   * @returns {number}
   */
  _projectPathHash() {
    const path = this.projectPath || ''
    let h = 0
    for (let i = 0; i < path.length; i++) h = (h * 31 + path.charCodeAt(i)) >>> 0
    return h
  }

  /**
   * Compare current state against previous state and record notable workflow
   * events to the activity log.
   * @param {object} state - Current rendered state
   */
  _trackActivityLogEvents(state) {
    if (!this.activityLog || !this.activityLog._key) return

    const prev = this._prevState || {}
    const log  = this.activityLog

    // Prompt sent: processing flips to true
    const wasProcessing = prev.app?.isProcessing || false
    const isProcessing  = state.app?.isProcessing  || false
    if (!wasProcessing && isProcessing) {
      log.record(ActivityEventType.PROMPT_SENT)
    }

    // Stories added to backlog
    const prevCount = (prev.userStories || []).length
    const currCount = (state.userStories || []).length
    if (currCount > prevCount) {
      log.record(ActivityEventType.STORIES_ADDED, { count: currCount - prevCount })
    }

    // Story completed (kanban user stories)
    for (const cs of (state.userStories || [])) {
      if (cs.status === 'completed') {
        const ps = (prev.userStories || []).find(s => s.id === cs.id)
        if (ps && ps.status !== 'completed') {
          log.record(ActivityEventType.STORY_COMPLETED, { title: cs.title })
        }
      }
    }

    // Assertions generated (any story that newly has inspection assertions)
    for (const cs of (state.userStories || [])) {
      if ((cs.inspectionAssertions || []).length > 0) {
        const ps = (prev.userStories || []).find(s => s.id === cs.id)
        if (!ps || (ps.inspectionAssertions || []).length === 0) {
          log.record(ActivityEventType.ASSERTIONS_GENERATED)
          break // record once per batch
        }
      }
    }
  }


  /**
   * Start the preview server if not already running on the correct port/path.
   * @param {number} port
   * @param {string} servePath
   */
  _ensureWebserverRunning(port, servePath = 'dist') {
    if (this._webserverStarting) return
    // Skip the async status check if we already confirmed the server is running on this port
    if (this._webserverPort === port && this._webserverRunning) return
    this._webserverStarting = true
    window.puffin.webserver.status().then(status => {
      if (status.running && status.port === port) {
        this._webserverStarting = false
        this._webserverRunning = true
        this._webserverPort = port
        this._updateWebserverStatusBadge(status)
        this._refreshWebsiteUrlPanel()
        return
      }
      return window.puffin.webserver.start(port, servePath)
    }).then(result => {
      if (result) {
        if (result.success) {
          console.log(`[WebServer] Preview server started at ${result.url}`)
          this._webserverRunning = true
          this._webserverPort = result.port
          this._updateWebserverStatusBadge({ running: true, port: result.port, url: result.url })
          this._refreshWebsiteUrlPanel()
        } else {
          console.warn('[WebServer] Failed to start:', result.error)
          this._webserverRunning = false
          this._updateWebserverStatusBadge({ running: false })
        }
      }
      this._webserverStarting = false
    }).catch(err => {
      console.error('[WebServer] Error:', err)
      this._webserverStarting = false
      this._webserverRunning = false
    })
  }

  /**
   * Stop the preview server if it is running.
   */
  _stopWebserverIfRunning() {
    window.puffin.webserver.status().then(status => {
      if (status.running) {
        return window.puffin.webserver.stop()
      }
    }).then(() => {
      this._webserverRunning = false
      this._webserverPort = null
      this._updateWebserverStatusBadge({ running: false })
    }).catch(() => {})
  }

  /**
   * Update the server status badge in the URL panel.
   * @param {{ running: boolean, port?: number, url?: string }} status
   */
  _updateWebserverStatusBadge(status) {
    const badge = document.getElementById('website-server-status')
    if (!badge) return
    if (status.running) {
      badge.textContent = `localhost:${status.port}`
      badge.className = 'website-server-status running'
    } else {
      badge.textContent = 'stopped'
      badge.className = 'website-server-status stopped'
    }
  }

  /**
   * Bind the refresh and visual-loop toggle buttons in the URL panel (idempotent).
   */
  _bindWebsiteUrlPanel() {
    if (this._websiteUrlPanelBound) return
    this._websiteUrlPanelBound = true

    const refreshBtn = document.getElementById('website-url-refresh-btn')
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this._refreshWebsiteUrlPanel())
    }

    const dirInput = document.getElementById('website-serve-dir-input')
    if (dirInput) {
      dirInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this._onServeDirChange(dirInput.value.trim()) }
      })
      dirInput.addEventListener('blur', () => this._onServeDirChange(dirInput.value.trim()))
    }

    const loopBtn = document.getElementById('puppeteer-loop-btn')
    if (loopBtn) {
      loopBtn.addEventListener('click', () => this._togglePuppeteerLoop())
    }

    // Subscribe to screenshot count and verdict events from main process
    if (window.puffin?.puppeteer?.onScreenshot) {
      window.puffin.puppeteer.onScreenshot(({ count }) => {
        this._updateScreenshotBadge(count)
      })
    }
    if (window.puffin?.puppeteer?.onVerdict) {
      window.puffin.puppeteer.onVerdict(({ verdict }) => {
        this._updatePuppeteerVerdict(verdict)
      })
    }
  }

  /**
   * Handle a change to the serve directory input in the URL panel.
   * Persists the new value to config and restarts the preview server.
   * @param {string} newDir - New serve path (empty string means project root)
   */
  _onServeDirChange(newDir) {
    // Strip leading slashes (prevents path.join resolving to filesystem root on Windows).
    // Treat '.' or '/' alone as "project root" (empty string).
    let sanitized = newDir.replace(/^[/\\]+/, '')
    if (sanitized === '.') sanitized = ''

    // Reflect sanitized value back into the input
    const dirInput = document.getElementById('website-serve-dir-input')
    if (dirInput) dirInput.value = sanitized

    const current = this.state?.config?.websiteServePath ?? 'dist'
    if (sanitized === current) return

    const port = this.state?.config?.websitePort || 5000
    this.intents.updateConfig({ websiteServePath: sanitized })
    // Force a restart by clearing the running cache for this port/path combination
    this._webserverRunning = false
    this._ensureWebserverRunning(port, sanitized)
  }

  /**
   * Toggle the Puppeteer Visual Feedback Loop on or off.
   * On first enable: writes the MCP config file to .puffin/mcp-puppeteer.json.
   */
  async _togglePuppeteerLoop() {
    const enabled = !this.state?.puppeteerLoop

    if (enabled && !this._puppeteerConfigured) {
      const projectPath = this.state?.projectPath
      if (!projectPath) return

      const result = await window.puffin.puppeteer.setup(projectPath)
      if (!result.success) {
        this.showToast({ type: 'error', title: 'Puppeteer setup failed', message: result.error })
        return
      }
      this._puppeteerConfigured = true
    }

    this.intents.setPuppeteerLoop(enabled)

    // Immediate button feedback (SAM render will also sync on next tick)
    const btn = document.getElementById('puppeteer-loop-btn')
    if (btn) btn.classList.toggle('active', enabled)

    // Update the inline status label
    this._updatePuppeteerLoopStatus(enabled)

    // Toast so the user always knows what state they're in
    if (enabled) {
      this.showToast({
        type: 'success',
        title: 'Visual Loop ON',
        message: 'Claude will screenshot localhost after each change.',
        duration: 3000
      })
    } else {
      this.showToast({
        type: 'info',
        title: 'Visual Loop OFF',
        duration: 2000
      })
    }
  }

  /**
   * Bind the /btw quick-question panel (idempotent).
   * The panel opens when the user types /btw <question> in the prompt and submits,
   * or can be shown directly for an ephemeral side question.
   */
  _bindBtwPanel() {
    if (this._btwPanelBound) return
    this._btwPanelBound = true

    const dismissBtn = document.getElementById('btw-panel-dismiss')
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => this._closeBtwPanel())
    }

    const submitBtn = document.getElementById('btw-submit')
    const input = document.getElementById('btw-input')
    if (submitBtn) submitBtn.addEventListener('click', () => this._submitBtwQuestion())
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          this._submitBtwQuestion()
        }
        if (e.key === 'Escape') this._closeBtwPanel()
      })
    }
  }

  /** Open the /btw panel and focus the input. */
  _openBtwPanel() {
    const panel = document.getElementById('btw-panel')
    const answer = document.getElementById('btw-answer')
    if (!panel) return
    if (answer) answer.style.display = 'none'
    panel.style.display = ''
    document.getElementById('btw-input')?.focus()
  }

  /** Close and reset the /btw panel. */
  _closeBtwPanel() {
    const panel = document.getElementById('btw-panel')
    const input = document.getElementById('btw-input')
    const answer = document.getElementById('btw-answer')
    if (panel) panel.style.display = 'none'
    if (input) input.value = ''
    if (answer) { answer.textContent = ''; answer.style.display = 'none' }
  }

  /**
   * Submit the /btw question: make an ephemeral one-shot call using the current
   * session's context. The answer is shown in the panel, never added to history.
   */
  async _submitBtwQuestion() {
    const input = document.getElementById('btw-input')
    const answer = document.getElementById('btw-answer')
    const submitBtn = document.getElementById('btw-submit')
    if (!input || !answer) return

    const question = input.value.trim()
    if (!question) return

    // Reuse the prompt-editor's session ID logic so the question has conversation context
    const sessionId = this.components?.promptEditor?.getLastSessionId?.(this.state) || null

    // Show loading state
    input.disabled = true
    if (submitBtn) submitBtn.disabled = true
    answer.textContent = '...'
    answer.style.display = ''

    try {
      const result = await window.puffin.claude.btwAsk({ question, sessionId })
      if (result.success && result.response) {
        answer.textContent = result.response
        this.activityLog?.record(ActivityEventType.BTW_ASKED)
      } else {
        answer.textContent = result.error || 'No answer received.'
      }
    } catch (err) {
      answer.textContent = `Error: ${err.message}`
    } finally {
      input.disabled = false
      if (submitBtn) submitBtn.disabled = false
    }
  }

  /**
   * Update the inline Visual Loop status label inside the website URL panel header.
   * @param {boolean} enabled
   */
  _updatePuppeteerLoopStatus(enabled) {
    const label = document.getElementById('puppeteer-loop-status')
    if (!label) return
    label.textContent = enabled ? 'Visual Loop ON' : ''
    label.classList.toggle('active', enabled)
    if (!enabled) {
      this._updateScreenshotBadge(0)
    }
  }

  /**
   * Update the screenshot count badge on the camera button.
   * @param {number} count - 0 hides the badge
   */
  _updateScreenshotBadge(count) {
    const badge = document.getElementById('puppeteer-screenshot-badge')
    if (!badge) return
    if (count > 0) {
      badge.textContent = count
      badge.style.display = ''
    } else {
      badge.style.display = 'none'
    }
  }

  /**
   * Show Claude's visual verdict (after screenshot analysis) in the status label.
   * Truncates to one line and prefixes with a sentiment emoji.
   * @param {string} verdict
   */
  _updatePuppeteerVerdict(verdict) {
    const label = document.getElementById('puppeteer-loop-status')
    if (!label) return
    const lower = verdict.toLowerCase()
    const isOk = /\b(good|looks good|clean|success|perfect|correct|nicely|well|aligned|working)\b/.test(lower)
    const isWarn = /\b(fix|issue|wrong|incorrect|doesn't|misalign|problem|off|bad|broken|error)\b/.test(lower)
    const prefix = isOk ? '✅ ' : isWarn ? '⚠️ ' : '📸 '
    // Keep only the first sentence and cap at 55 chars
    const firstSentence = verdict.split(/[.!?\n]/)[0].trim()
    const display = firstSentence.length > 55 ? firstSentence.slice(0, 52) + '…' : firstSentence
    label.textContent = prefix + display
    label.classList.add('active')
  }

  /**
   * Refresh the Website Edition URL panel with a site map (two-level link tree).
   * Reads the project's index.html → extracts navigation links → follows one level deeper.
   */
  async _refreshWebsiteUrlPanel() {
    const list = document.getElementById('website-url-list')
    if (!list || !window.puffin?.webserver) return

    try {
      const result = await window.puffin.webserver.siteMap()

      if (!result.success || !result.pages?.length) {
        list.innerHTML = '<p class="website-url-empty">No pages found.<br>Build the site first, or add an index.html.</p>'
        return
      }

      const safeUrl = (url) => url.replace(/"/g, '%22')

      list.innerHTML = result.pages.map(page => {
        let html = `<button class="website-url-item" data-url="${safeUrl(page.url)}" title="Open in browser">` +
          `<span class="website-url-item-path">${page.label}</span>` +
          `</button>`

        if (page.children?.length > 0) {
          html += '<div class="website-url-children">'
          html += page.children.map(child =>
            `<button class="website-url-item website-url-child" data-url="${safeUrl(child.url)}" title="Open in browser">` +
            `<span class="website-url-item-path">${child.label}</span>` +
            `</button>`
          ).join('')
          html += '</div>'
        }

        return html
      }).join('')

      // Bind click handlers to open URLs in the system browser
      list.querySelectorAll('[data-url]').forEach(btn => {
        btn.addEventListener('click', () => {
          const url = btn.getAttribute('data-url')
          if (url && window.puffin?.webserver) window.puffin.webserver.openUrl(url)
        })
      })
    } catch (err) {
      console.error('[WebsitePanel] Site map failed:', err)
    }
  }

  /**
   * Update debug tab visibility based on config.debugMode
   */
  updateDebugTabVisibility(state) {
    const debugNavBtn = document.getElementById('debug-nav-btn')
    if (!debugNavBtn) return

    const debugEnabled = state.config?.debugMode || false
    if (debugEnabled) {
      debugNavBtn.classList.remove('hidden')
    } else {
      debugNavBtn.classList.add('hidden')
      // If debug view is active and debug mode is disabled, switch to prompt view
      if (state.ui?.currentView === 'debug') {
        this.intents.switchView('prompt')
      }
    }
  }

  /**
   * Update debug view with last submitted prompt
   */
  updateDebugView(state) {
    const promptContent = document.getElementById('debug-prompt-content')
    const timestampEl = document.getElementById('debug-timestamp')
    const branchEl = document.getElementById('debug-branch')
    const modelEl = document.getElementById('debug-model')

    if (!promptContent) return

    const lastPrompt = state.debug?.lastPrompt
    if (lastPrompt) {
      promptContent.textContent = lastPrompt.content || ''

      if (timestampEl) {
        const date = new Date(lastPrompt.timestamp)
        timestampEl.textContent = date.toLocaleString()
      }
      if (branchEl) {
        branchEl.textContent = `Branch: ${lastPrompt.branch || 'unknown'}`
      }
      if (modelEl) {
        modelEl.textContent = `Model: ${lastPrompt.model || 'default'}`
      }
    }
  }

  /**
   * Collect all prompts in the thread containing the given prompt ID.
   * Walks up to find the root, then collects all descendants via BFS.
   *
   * @param {string} promptId - The active prompt ID
   * @param {Array} allPrompts - All prompts in the branch
   * @returns {Array} Prompts in the thread, ordered from root to leaves
   */
  collectThreadPrompts(promptId, allPrompts) {
    if (!promptId || !allPrompts || allPrompts.length === 0) {
      return []
    }

    // Build lookup maps
    const promptMap = new Map()
    allPrompts.forEach(p => promptMap.set(p.id, p))

    // Find the starting prompt
    const startPrompt = promptMap.get(promptId)
    if (!startPrompt) {
      return []
    }

    // Walk up to find the thread root
    let root = startPrompt
    while (root.parentId && promptMap.has(root.parentId)) {
      root = promptMap.get(root.parentId)
    }

    // BFS to collect all prompts in the thread from root
    const threadPrompts = []
    const queue = [root]
    const visited = new Set()

    while (queue.length > 0) {
      const prompt = queue.shift()
      if (visited.has(prompt.id)) continue
      visited.add(prompt.id)
      threadPrompts.push(prompt)

      // Find children (prompts with parentId === prompt.id)
      const children = allPrompts.filter(p => p.parentId === prompt.id)
      queue.push(...children)
    }

    return threadPrompts
  }

  /**
   * Get the linear path from root to a specific prompt.
   * Unlike collectThreadPrompts which gets all descendants, this returns only
   * the direct ancestor chain - useful for handoff summaries where we want
   * just the current conversation thread, not sibling branches.
   *
   * @param {string} promptId - The target prompt ID
   * @param {Array} allPrompts - All prompts in the branch
   * @returns {Array} Prompts in the linear path from root to target, ordered root-first
   */
  getLinearThreadPath(promptId, allPrompts) {
    if (!promptId || !allPrompts || allPrompts.length === 0) {
      return []
    }

    // Build lookup map
    const promptMap = new Map()
    allPrompts.forEach(p => promptMap.set(p.id, p))

    // Find the target prompt
    const targetPrompt = promptMap.get(promptId)
    if (!targetPrompt) {
      return []
    }

    // Walk backwards from target to root, collecting the chain
    const chain = []
    let current = targetPrompt
    while (current) {
      chain.unshift(current) // Add to front to maintain root-first order
      if (current.parentId && promptMap.has(current.parentId)) {
        current = promptMap.get(current.parentId)
      } else {
        break // Reached root
      }
    }

    return chain
  }

  /**
   * Count defects mentioned in thread prompts.
   * Scans user prompt content for defect-related keywords.
   *
   * @param {Array} threadPrompts - Prompts in the thread
   * @returns {number} Count of prompts containing defect keywords
   */
  countThreadDefects(threadPrompts) {
    const defectKeywords = [
      'bug', 'defect', 'broken', 'error', 'issue', 'problem',
      'wrong', 'incorrect', "doesn't work", 'not working',
      'failed', 'failing', 'fix', 'crash', 'regression'
    ]

    // Create regex pattern (case insensitive, word boundaries)
    const pattern = new RegExp(`\\b(${defectKeywords.join('|')})\\b`, 'i')

    let defectCount = 0
    threadPrompts.forEach(prompt => {
      const content = prompt.content || ''
      if (pattern.test(content)) {
        defectCount++
      }
    })

    return defectCount
  }

  /**
   * Generate handoff summary using Claude AI
   * Collects all turns from the current thread and sends to Claude for summarization
   */
  async generateHandoffSummary() {
    const generateBtn = document.getElementById('generate-handoff-btn')
    const generatedSection = document.getElementById('handoff-generated-section')
    const summaryDisplay = document.getElementById('handoff-generated-summary')
    const branchGrid = document.getElementById('handoff-branch-grid')

    if (!generateBtn || !generatedSection || !summaryDisplay) {
      console.error('[HANDOFF] Missing required DOM elements')
      return
    }

    // Get current thread context
    const activeBranch = this.state?.history?.activeBranch
    const activePromptId = this.state?.history?.activePromptId
    const branch = activeBranch ? this.state?.history?.raw?.branches?.[activeBranch] : null
    const allPrompts = branch?.prompts || []

    if (allPrompts.length === 0) {
      this.showToast('No task content to generate handoff from', 'warning')
      return
    }

    // Get only the current thread (linear path from root to active prompt)
    const threadPrompts = this.getLinearThreadPath(activePromptId, allPrompts)

    if (threadPrompts.length === 0) {
      this.showToast('No active task selected', 'warning')
      return
    }

    console.log(`[HANDOFF] Using ${threadPrompts.length} prompts from current thread (out of ${allPrompts.length} total in branch)`)

    // Show loading state
    generateBtn.disabled = true
    generateBtn.innerHTML = '<span class="handoff-icon">⏳</span><span class="handoff-text">Generating...</span>'

    try {
      // Build conversation context from the current thread only
      const conversationContext = this.buildConversationContext(threadPrompts, activeBranch)

      // Create the prompt for Claude
      const handoffPrompt = `You are helping create a handoff summary for a development thread. The goal is to summarize what was accomplished and provide context for another developer to continue the work in a different branch.

Here is the conversation from the "${activeBranch}" branch:

${conversationContext}

---

Please create a concise handoff summary with these sections:

1. **What Was Accomplished** - Brief summary of the main work done (2-3 sentences)
2. **Key Changes** - List the most important files modified or created (if mentioned)
3. **Current State** - Where the work left off, any pending items
4. **Recommendations** - What the next developer should focus on or be aware of

Keep it concise but informative. Use markdown formatting.`

      console.log('[HANDOFF] Sending prompt to Claude for summary generation')

      // Call Claude API
      const response = await window.puffin.claude.sendPrompt(handoffPrompt, {
        model: _fastModel,
        maxTurns: 1
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to generate summary')
      }

      console.log('[HANDOFF] Received summary from Claude')

      // Store the generated summary for later use
      this.generatedHandoffSummary = {
        summary: response.response,
        sourceThreadId: activePromptId,
        sourceThreadName: this.getThreadTitle(threadPrompts),
        sourceBranch: activeBranch,
        createdAt: Date.now()
      }

      // Persist to localStorage so it survives navigation (project-specific key)
      localStorage.setItem(this.getHandoffStorageKey(), JSON.stringify(this.generatedHandoffSummary))

      // Display the generated summary
      summaryDisplay.innerHTML = `<div class="handoff-summary-content">${this.renderMarkdown(response.response)}</div>`

      // Render branch buttons (exclude current branch)
      this.renderHandoffBranchButtons(branchGrid, activeBranch)

      // Show the generated section
      generatedSection.classList.remove('hidden')

      // Hide the generate button
      generateBtn.style.display = 'none'

      this.showToast('Handoff summary generated!', 'success')

    } catch (error) {
      console.error('[HANDOFF] Error generating summary:', error)
      this.showToast(`Failed to generate summary: ${error.message}`, 'error')
    } finally {
      // Reset button state
      generateBtn.disabled = false
      generateBtn.innerHTML = '<span class="handoff-icon">✨</span><span class="handoff-text">Generate Handoff</span>'
    }
  }

  /**
   * Build conversation context from prompts for handoff summary
   */
  buildConversationContext(prompts, branchName) {
    const lines = []

    prompts.forEach((prompt, index) => {
      // Add user prompt
      if (prompt.content) {
        lines.push(`### Turn ${index + 1} - User Request:`)
        lines.push(prompt.content.substring(0, 2000)) // Limit each turn to prevent token overflow
        lines.push('')
      }

      // Add assistant response
      if (prompt.response?.content) {
        lines.push(`### Turn ${index + 1} - Assistant Response:`)
        lines.push(prompt.response.content.substring(0, 2000)) // Limit response too
        lines.push('')

        // Note files modified
        if (prompt.response.filesModified?.length > 0) {
          lines.push(`Files modified: ${prompt.response.filesModified.slice(0, DISPLAY_LIMITS.FILES_MODIFIED).join(', ')}`)
          lines.push('')
        }
      }
    })

    // Limit total context to prevent token overflow
    const fullContext = lines.join('\n')
    if (fullContext.length > 15000) {
      return fullContext.substring(0, 15000) + '\n\n[... context truncated for length ...]'
    }

    return fullContext
  }

  /**
   * Get a title for the thread from prompts
   */
  getThreadTitle(prompts) {
    if (prompts.length === 0) return 'Unknown Task'
    const firstPrompt = prompts[0]
    if (firstPrompt.title) return firstPrompt.title
    if (firstPrompt.content) {
      return firstPrompt.content.substring(0, 50) + (firstPrompt.content.length > 50 ? '...' : '')
    }
    return 'Task'
  }

  /**
   * Render branch buttons for handoff destination
   */
  renderHandoffBranchButtons(container, currentBranch) {
    if (!container) return

    // Get branches dynamically from state
    const branches = this.state?.history?.branches || []

    // Default icons for known branches
    const defaultIcons = {
      specifications: '📋',
      architecture: '🏗️',
      ui: '🪟',
      backend: '⚙️',
      deployment: '🚀',
      tmp: '📝',
      improvements: '✨',
      fullstack: '🔄',
      bugfixes: '🐛',
      'bug-fixes': '🐛'
    }

    // Filter out current branch
    const availableBranches = branches.filter(b => b.id !== currentBranch)

    container.innerHTML = availableBranches.map(branch => {
      const icon = defaultIcons[branch.id] || branch.icon || '📁'
      return `
        <button class="handoff-branch-btn" data-branch="${branch.id}" data-branch-name="${branch.name}">
          <span class="branch-icon">${icon}</span>
          <span class="branch-name">${branch.name}</span>
        </button>
      `
    }).join('')
  }

  /**
   * Simple markdown renderer for handoff summaries
   */
  renderMarkdown(text) {
    if (!text) return ''

    return text
      // Escape HTML first to prevent XSS — AI-generated content may contain raw tags
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headers
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Unordered lists
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      // Ordered lists
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      // Paragraphs (simple - just preserve line breaks)
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(.+)$/gm, '<p>$1</p>')
      // Clean up empty paragraphs
      .replace(/<p><\/p>/g, '')
      .replace(/<p>(<h[234]>)/g, '$1')
      .replace(/(<\/h[234]>)<\/p>/g, '$1')
      .replace(/<p>(<ul>)/g, '$1')
      .replace(/(<\/ul>)<\/p>/g, '$1')
      .replace(/<p>(<pre>)/g, '$1')
      .replace(/(<\/pre>)<\/p>/g, '$1')
  }

  /**
   * Send handoff to a branch - create new thread with handoff context
   */
  sendHandoffToBranch(branchId, branchName) {
    if (!this.generatedHandoffSummary) {
      this.showToast('No handoff summary generated', 'warning')
      return
    }

    console.log('[HANDOFF] Sending to branch:', branchId, branchName)

    const handoffContext = {
      summary: this.generatedHandoffSummary.summary,
      sourceThreadName: this.generatedHandoffSummary.sourceThreadName,
      sourceBranch: this.generatedHandoffSummary.sourceBranch,
      createdAt: Date.now()
    }

    // Store handoff context in the target branch state (persisted)
    this.intents.setBranchHandoffContext(branchId, handoffContext)

    // Switch to the target branch
    this.intents.selectBranch(branchId)

    // Dispatch handoff-received event for the prompt editor UI to handle
    const event = new CustomEvent('handoff-received', {
      detail: {
        branchId,
        branchName,
        ...handoffContext
      }
    })
    document.dispatchEvent(event)

    // Reset the handoff panel UI
    this.resetHandoffPanel()

    this.showToast(`Handoff sent to ${branchName} branch!`, 'success')
  }

  /**
   * Reset the handoff panel to initial state
   */
  resetHandoffPanel() {
    const generateBtn = document.getElementById('generate-handoff-btn')
    const generatedSection = document.getElementById('handoff-generated-section')

    if (generateBtn) {
      generateBtn.style.display = ''
    }
    if (generatedSection) {
      generatedSection.classList.add('hidden')
    }

    // Clear stored summary
    this.generatedHandoffSummary = null
  }

  /**
   * Track iteration output for stuck detection
   * Called after each Claude response completes
   *
   * @param {Object} response - The response object from Claude
   * @param {string[]} filesModified - Array of file paths modified
   * @param {string[]} toolsUsed - Array of tool names used
   */
  trackIterationForStuckDetection(response, filesModified, toolsUsed) {
    // Build response object for hashing
    const responseData = {
      content: response?.content || '',
      filesModified: filesModified || [],
      toolsUsed: toolsUsed || []
    }

    // Compute hash and summary
    const hash = computeSimilarityHash(responseData)
    const summary = generateOutputSummary(responseData)

    console.log('[STUCK-DETECTION] Recording iteration:', { hash, summary })

    // Record in state
    this.intents.recordIterationOutput(hash, summary)
  }

  /**
   * Handle rerun request from state
   */
  async handleRerunRequest(rerunRequest, state) {
    this.intents.clearRerunRequest()

    const { branchId, content } = rerunRequest
    console.log('Rerunning prompt:', { branchId, contentPreview: content.substring(0, 100) })

    // Check if a CLI process is already running
    const isRunning = await window.puffin.claude.isRunning()
    if (isRunning) {
      console.error('[RERUN] Cannot rerun: CLI process already running')
      this.showToast({
        type: 'error',
        title: 'Process Already Running',
        message: 'A Claude process is already running. Please wait for it to complete.',
        duration: 5000
      })
      return
    }

    this.intents.submitPrompt({
      branchId,
      content,
      parentId: null
    })

    const branch = state.history.raw?.branches?.[branchId]

    // Collect dead sessions: context limit errors and 0-turn error responses
    const deadSessions = new Set()
    if (branch?.prompts) {
      for (const prompt of branch.prompts) {
        if (prompt.response?.sessionId) {
          if (prompt.response.content === 'Prompt is too long') {
            deadSessions.add(prompt.response.sessionId)
          } else if (prompt.response.turns === 0 && (!prompt.response.content || prompt.response.content.length === 0)) {
            deadSessions.add(prompt.response.sessionId)
          }
        }
      }
    }

    // Find the last prompt with a valid (non-dead) session
    const lastPromptWithResponse = branch?.prompts
      ?.filter(p => p.response?.sessionId && !deadSessions.has(p.response.sessionId))
      ?.pop()
    const sessionId = lastPromptWithResponse?.response?.sessionId || null

    console.log('Rerun session lookup:', {
      foundSession: !!sessionId,
      deadSessions: deadSessions.size,
      sessionId: sessionId?.substring(0, 20)
    })

    window.puffin.claude.submit({
      prompt: content,
      branchId,
      sessionId,
      project: state.config ? {
        name: state.config.name,
        description: state.config.description
      } : null
    })

    this.intents.switchView('prompt')
  }

  /**
   * Handle continue request from state (next-action pattern)
   */
  async handleContinueRequest(continueRequest, state) {
    // Clear the request immediately to prevent re-execution
    this.intents.clearContinueRequest()

    const { branchId, content, parentId } = continueRequest
    console.log('[CONTINUE] Processing continue request:', { branchId, contentPreview: content.substring(0, 50) })

    // Check if a CLI process is already running
    const isRunning = await window.puffin.claude.isRunning()
    if (isRunning) {
      console.error('[CONTINUE] Cannot continue: CLI process already running')
      this.showToast({
        type: 'error',
        title: 'Process Already Running',
        message: 'A Claude process is already running. Please wait for it to complete.',
        duration: 5000
      })
      return
    }

    // Submit to SAM to add the prompt to history
    this.intents.submitPrompt({
      branchId,
      content,
      parentId
    })

    // Get the branch to find session ID
    const branch = state.history.raw?.branches?.[branchId]

    // Collect dead sessions: context limit errors and 0-turn error responses
    const deadSessions = new Set()
    if (branch?.prompts) {
      for (const prompt of branch.prompts) {
        if (prompt.response?.sessionId) {
          if (prompt.response.content === 'Prompt is too long') {
            deadSessions.add(prompt.response.sessionId)
          } else if (prompt.response.turns === 0 && (!prompt.response.content || prompt.response.content.length === 0)) {
            deadSessions.add(prompt.response.sessionId)
          }
        }
      }
    }

    // Find the last prompt with a valid (non-dead) session
    const lastPromptWithResponse = branch?.prompts
      ?.filter(p => p.response?.sessionId && !deadSessions.has(p.response.sessionId))
      ?.pop()
    const sessionId = lastPromptWithResponse?.response?.sessionId || null

    console.log('[CONTINUE] Session lookup:', {
      foundSession: !!sessionId,
      deadSessions: deadSessions.size,
      sessionId: sessionId?.substring(0, 20)
    })

    // Submit to Claude via IPC
    window.puffin.claude.submit({
      prompt: content,
      branchId,
      sessionId,
      project: state.config ? {
        name: state.config.name,
        description: state.config.description
      } : null
    })

    this.intents.switchView('prompt')
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (this.state?.prompt.canSubmit) {
        this.components.promptEditor.submit()
      }
    }

    if (e.key === 'Escape' && this.state?.ui.hasModal) {
      this.intents.hideModal()
    }
  }


  /**
   * Escape HTML for safe rendering
   */
  escapeHtml(str) {
    if (!str) return ''
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  /**
   * Cleanup
   */
  destroy() {
    this.claudeListeners.forEach(unsub => unsub())
    this.claudeListeners = []

    Object.values(this.components).forEach(component => {
      if (component.destroy) component.destroy()
    })
  }
}

// Initialize app on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.puffinApp = new PuffinApp()
  window.puffinApp.init()

  const splashScreen = document.getElementById('splash-screen')
  if (splashScreen) {
    setTimeout(() => {
      splashScreen.remove()
    }, 2000)
  }
})

// Handle unload
window.addEventListener('beforeunload', () => {
  if (window.puffinApp) {
    window.puffinApp.destroy()
  }
})
