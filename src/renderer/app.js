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

// Components
import { ProjectFormComponent } from './components/project-form/project-form.js'
import { HistoryTreeComponent } from './components/history-tree/history-tree.js'
import { PromptEditorComponent } from './components/prompt-editor/prompt-editor.js'
import { ResponseViewerComponent } from './components/response-viewer/response-viewer.js'
import { GuiDesignerComponent } from './components/gui-designer/gui-designer.js'
import { ArchitectureComponent } from './components/architecture/architecture.js'
import { DebuggerComponent } from './components/debugger/debugger.js'
import { CliOutputComponent } from './components/cli-output/cli-output.js'
import { UserStoriesComponent } from './components/user-stories/user-stories.js'
import { UserStoryReviewModalComponent } from './components/user-story-review-modal/user-story-review-modal.js'
import { DeveloperProfileComponent } from './components/developer-profile/developer-profile.js'
import { StoryGenerationsComponent } from './components/story-generations/story-generations.js'
import { GitPanelComponent } from './components/git-panel/git-panel.js'

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

    // Toast container reference
    this.toastContainer = null
  }

  /**
   * Show a toast notification
   * @param {Object} options - Toast options
   * @param {string} options.type - 'error' | 'success' | 'warning' | 'info'
   * @param {string} options.title - Toast title
   * @param {string} options.message - Toast message
   * @param {number} options.duration - Duration in ms (default: 5000, 0 = persistent)
   */
  showToast({ type = 'info', title, message, duration = 5000 }) {
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

    return toast
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
   * Initialize the application
   */
  async init() {
    console.log('Puffin initializing...')

    // Clean up any leftover overlays from previous sessions
    this.cleanupLeftoverOverlays()

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
      window.puffin.app.onReady(async (data) => {
        console.log('Electron app ready, project path:', data?.projectPath)

        this.projectPath = data?.projectPath

        // Check if Claude CLI is available
        const claudeStatus = await window.puffin.claude.check()
        if (claudeStatus.available) {
          console.log('Claude CLI available:', claudeStatus.version)
        } else {
          console.warn('Claude CLI not found. Please install it: npm install -g @anthropic-ai/claude-code')
          this.showToast('Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code', 'warning')
        }

        // Initialize app with project path
        const projectName = this.projectPath ? this.projectPath.split(/[/\\]/).pop() : 'Unknown'
        this.intents.initializeApp(this.projectPath, projectName)

        // Load state from .puffin/ directory
        await this.loadState()
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
   * Initialize managers with dependencies
   */
  initManagers() {
    this.modalManager = new ModalManager(this.intents, this.showToast.bind(this))
    this.statePersistence = new StatePersistence(
      () => this.state,
      this.intents,
      this.showToast.bind(this)
    )
    this.activityTracker = new ActivityTracker(this.intents, () => this.state)
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
   * Initialize SAM instance with components
   */
  initSAM() {
    // Define action names in order - must match the actions array below
    const actionNames = [
      'initializeApp', 'loadState', 'appError', 'recover',
      'updateConfig', 'updateOptions',
      'startCompose', 'updatePromptContent', 'submitPrompt',
      'receiveResponseChunk', 'completeResponse', 'responseError', 'cancelPrompt',
      'rerunPrompt', 'clearRerunRequest',
      'selectBranch', 'createBranch', 'deleteBranch', 'selectPrompt',
      'toggleThreadExpanded', 'markThreadComplete', 'unmarkThreadComplete',
      'addGuiElement', 'updateGuiElement', 'deleteGuiElement',
      'moveGuiElement', 'resizeGuiElement', 'selectGuiElement',
      'clearGuiCanvas', 'exportGuiDescription',
      'saveGuiDefinition', 'loadGuiDefinition', 'listGuiDefinitions',
      'deleteGuiDefinition', 'showSaveGuiDefinitionDialog',
      'updateArchitecture', 'reviewArchitecture',
      'addUserStory', 'updateUserStory', 'deleteUserStory', 'loadUserStories',
      'deriveUserStories', 'receiveDerivedStories', 'markStoryReady', 'unmarkStoryReady',
      'updateDerivedStory', 'deleteDerivedStory', 'requestStoryChanges',
      'addStoriesToBacklog', 'cancelStoryReview', 'storyDerivationError', 'startStoryImplementation',
      // Implementation journey actions
      'createImplementationJourney', 'addImplementationInput', 'updateImplementationJourney', 'completeImplementationJourney',
      'switchView', 'toggleSidebar', 'showModal', 'hideModal',
      'toolStart', 'toolEnd', 'clearActivity',
      'loadDeveloperProfile', 'loadGithubRepositories', 'loadGithubActivity',
      // Handoff actions
      'showHandoffReview', 'updateHandoffSummary', 'completeHandoff', 'cancelHandoff', 'deleteHandoff',
      // Sprint actions
      'createSprint', 'startSprintPlanning', 'approvePlan', 'clearSprint', 'clearPendingSprintPlanning',
      'startSprintStoryImplementation', 'clearPendingStoryImplementation', 'completeStoryBranch',
      'updateSprintStoryStatus', 'clearSprintError', 'toggleCriteriaCompletion',
      // Stuck detection actions
      'recordIterationOutput', 'resolveStuckState', 'resetStuckDetection'
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

          // Branch/History actions
          ['SELECT_BRANCH', actions.selectBranch],
          ['CREATE_BRANCH', actions.createBranch],
          ['DELETE_BRANCH', actions.deleteBranch],
          ['SELECT_PROMPT', actions.selectPrompt],

          // Thread expansion/collapse actions
          ['TOGGLE_THREAD_EXPANDED', actions.toggleThreadExpanded],
          ['MARK_THREAD_COMPLETE', actions.markThreadComplete],
          ['UNMARK_THREAD_COMPLETE', actions.unmarkThreadComplete],

          // GUI Designer actions
          ['ADD_GUI_ELEMENT', actions.addGuiElement],
          ['UPDATE_GUI_ELEMENT', actions.updateGuiElement],
          ['DELETE_GUI_ELEMENT', actions.deleteGuiElement],
          ['MOVE_GUI_ELEMENT', actions.moveGuiElement],
          ['RESIZE_GUI_ELEMENT', actions.resizeGuiElement],
          ['SELECT_GUI_ELEMENT', actions.selectGuiElement],
          ['CLEAR_GUI_CANVAS', actions.clearGuiCanvas],
          ['EXPORT_GUI_DESCRIPTION', actions.exportGuiDescription],

          // GUI Definition actions
          ['SAVE_GUI_DEFINITION', actions.saveGuiDefinition],
          ['LOAD_GUI_DEFINITION', actions.loadGuiDefinition],
          ['LIST_GUI_DEFINITIONS', actions.listGuiDefinitions],
          ['DELETE_GUI_DEFINITION', actions.deleteGuiDefinition],
          ['SHOW_SAVE_GUI_DEFINITION_DIALOG', actions.showSaveGuiDefinitionDialog],

          // Architecture actions
          ['UPDATE_ARCHITECTURE', actions.updateArchitecture],
          ['REVIEW_ARCHITECTURE', actions.reviewArchitecture],

          // User Story actions
          ['ADD_USER_STORY', actions.addUserStory],
          ['UPDATE_USER_STORY', actions.updateUserStory],
          ['DELETE_USER_STORY', actions.deleteUserStory],
          ['LOAD_USER_STORIES', actions.loadUserStories],

          // Story derivation actions
          ['DERIVE_USER_STORIES', actions.deriveUserStories],
          ['RECEIVE_DERIVED_STORIES', actions.receiveDerivedStories],
          ['MARK_STORY_READY', actions.markStoryReady],
          ['UNMARK_STORY_READY', actions.unmarkStoryReady],
          ['UPDATE_DERIVED_STORY', actions.updateDerivedStory],
          ['DELETE_DERIVED_STORY', actions.deleteDerivedStory],
          ['REQUEST_STORY_CHANGES', actions.requestStoryChanges],
          ['ADD_STORIES_TO_BACKLOG', actions.addStoriesToBacklog],
          ['CANCEL_STORY_REVIEW', actions.cancelStoryReview],
          ['STORY_DERIVATION_ERROR', actions.storyDerivationError],
          ['START_STORY_IMPLEMENTATION', actions.startStoryImplementation],

          // Implementation journey actions
          ['CREATE_IMPLEMENTATION_JOURNEY', actions.createImplementationJourney],
          ['ADD_IMPLEMENTATION_INPUT', actions.addImplementationInput],
          ['UPDATE_IMPLEMENTATION_JOURNEY', actions.updateImplementationJourney],
          ['COMPLETE_IMPLEMENTATION_JOURNEY', actions.completeImplementationJourney],

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

          // Sprint actions
          ['CREATE_SPRINT', actions.createSprint],
          ['START_SPRINT_PLANNING', actions.startSprintPlanning],
          ['APPROVE_PLAN', actions.approvePlan],
          ['CLEAR_SPRINT', actions.clearSprint],
          ['CLEAR_PENDING_SPRINT_PLANNING', actions.clearPendingSprintPlanning],
          ['START_SPRINT_STORY_IMPLEMENTATION', actions.startSprintStoryImplementation],
          ['CLEAR_PENDING_STORY_IMPLEMENTATION', actions.clearPendingStoryImplementation],
          ['COMPLETE_STORY_BRANCH', actions.completeStoryBranch],
          ['UPDATE_SPRINT_STORY_STATUS', actions.updateSprintStoryStatus],
          ['CLEAR_SPRINT_ERROR', actions.clearSprintError],
          ['TOGGLE_CRITERIA_COMPLETION', actions.toggleCriteriaCompletion],
          // Stuck detection actions
          ['RECORD_ITERATION_OUTPUT', actions.recordIterationOutput],
          ['RESOLVE_STUCK_STATE', actions.resolveStuckState],
          ['RESET_STUCK_DETECTION', actions.resetStuckDetection]
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
        samDebugger.recordAction(actionType, actionInfo, model, this.state)

        console.log('[SAM-RENDER] actionType:', actionType, 'model.__actionName:', model?.__actionName)

        this.lastAction = null
        render(this.state, previousState)

        // Auto-persist state changes to .puffin/
        if (this.statePersistence) {
          this.statePersistence.persist(actionType)
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
      guiDesigner: new GuiDesignerComponent(this.intents),
      architecture: new ArchitectureComponent(this.intents),
      debugger: new DebuggerComponent(this.intents),
      cliOutput: new CliOutputComponent(this.intents),
      userStories: new UserStoriesComponent(this.intents),
      userStoryReviewModal: new UserStoryReviewModalComponent(this.intents),
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

    // Listen for state changes
    document.addEventListener('puffin-state-change', (e) => {
      this.onStateChange(e.detail)
    })

    // Sidebar resizer
    this.setupSidebarResize()

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleKeyDown(e)
    })

    // Profile menu IPC handlers
    this.setupProfileMenuHandlers()

    // Handoff panel event handlers
    this.setupHandoffPanelHandlers()
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
   * Clear the generated handoff summary
   */
  clearHandoffSummary() {
    this.resetHandoffPanel()
    // Also clear from localStorage
    localStorage.removeItem('puffin-handoff-summary')
    this.showToast('Handoff summary cleared', 'info')
  }

  /**
   * Restore handoff summary from localStorage
   */
  restoreHandoffSummary() {
    try {
      const saved = localStorage.getItem('puffin-handoff-summary')
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
      localStorage.removeItem('puffin-handoff-summary')
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

    // Response streaming
    const unsubResponse = window.puffin.claude.onResponse((chunk) => {
      this.intents.receiveResponseChunk(chunk)
      this.components.cliOutput.setProcessing(true)
    })
    this.claudeListeners.push(unsubResponse)

    // Response complete
    const unsubComplete = window.puffin.claude.onComplete((response) => {
      console.log('[SAM-DEBUG] app.js onComplete received')
      console.log('[SAM-DEBUG] response.content length:', response?.content?.length || 0)

      const filesModified = this.activityTracker.getFilesModified()
      console.log('[SAM-DEBUG] filesModified at completion:', filesModified.length, 'files')

      try {
        this.intents.completeResponse(response, filesModified)
      } catch (err) {
        console.error('[SAM-ERROR] completeResponse failed:', err)
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

      // Show error toast to user
      const errorMessage = error?.message || String(error) || 'An unknown error occurred'
      this.showToast({
        type: 'error',
        title: 'Claude Error',
        message: errorMessage,
        duration: 8000 // Show errors longer
      })
    })
    this.claudeListeners.push(unsubError)

    // Story derivation - stories derived
    const unsubStoriesDerived = window.puffin.claude.onStoriesDerived((data) => {
      console.log('[STORY-DERIVATION] Stories derived event received')
      console.log('[STORY-DERIVATION] data:', data)
      console.log('[STORY-DERIVATION] data.stories:', data?.stories)
      console.log('[STORY-DERIVATION] data.stories length:', data?.stories?.length || 0)
      console.log('[STORY-DERIVATION] data.originalPrompt:', data?.originalPrompt?.substring(0, 100))
      this.intents.receiveDerivedStories(data.stories, data.originalPrompt)
    })
    this.claudeListeners.push(unsubStoriesDerived)

    // Story derivation - error
    const unsubStoryError = window.puffin.claude.onStoryDerivationError((error) => {
      console.error('Story derivation error:', error)
      this.intents.storyDerivationError(error)

      let message = 'Failed to derive stories'
      if (error.error) {
        message = error.error
      }
      if (error.suggestion) {
        message += '\n\n' + error.suggestion
      }

      // Show error toast to user
      this.showToast({
        type: 'error',
        title: 'Story Derivation Failed',
        message: message,
        duration: 8000
      })

      if (error.rawResponse) {
        console.log('[STORY-DERIVATION] Raw response that failed to parse:', error.rawResponse)
      }
    })
    this.claudeListeners.push(unsubStoryError)

    // Story derivation - progress (for debugging)
    const unsubProgress = window.puffin.claude.onDerivationProgress((data) => {
      console.log('[DERIVATION-PROGRESS]', data.message)
    })
    this.claudeListeners.push(unsubProgress)
  }

  /**
   * Handle state changes
   */
  onStateChange({ state, changed }) {
    this.updateNavigation(state)
    this.updateSidebar(state)
    this.updateViews(state)
    this.modalManager.update(state)
    this.updateHeader(state)
    this.updateSprintHeader(state)
    this.updateMetadataPanel(state)
    this.handleSprintError(state)
    this.handleStuckDetection(state)

    if (state.rerunRequest) {
      this.handleRerunRequest(state.rerunRequest, state)
    }

    // Handle pending sprint planning - submit to Claude
    if (state._pendingSprintPlanning) {
      this.handleSprintPlanning(state._pendingSprintPlanning, state)
    }
  }

  /**
   * Handle sprint error display
   */
  handleSprintError(state) {
    const error = state.sprintError

    // Track shown errors to avoid duplicates
    if (!this._lastSprintErrorTimestamp) {
      this._lastSprintErrorTimestamp = null
    }

    if (error && error.timestamp !== this._lastSprintErrorTimestamp) {
      this._lastSprintErrorTimestamp = error.timestamp

      // Show appropriate error message based on type
      if (error.type === 'STORY_LIMIT_EXCEEDED') {
        this.showToast({
          type: 'error',
          title: 'Too Many Stories Selected',
          message: `${error.message} You selected ${error.details?.selected} stories (max: ${error.details?.maximum}). Please reduce your selection.`,
          duration: 8000
        })
      } else {
        // Generic sprint error
        this.showToast({
          type: 'error',
          title: 'Sprint Error',
          message: error.message,
          duration: 6000
        })
      }

      // Clear the error after showing
      this.intents.clearSprintError()
    }
  }

  /**
   * Handle stuck detection alert
   */
  handleStuckDetection(state) {
    const stuckState = state.stuckDetection

    // Track shown alerts to avoid duplicates
    if (!this._lastStuckAlertTimestamp) {
      this._lastStuckAlertTimestamp = null
    }

    // Remove alert if not stuck anymore
    if (!stuckState?.isStuck) {
      const existingAlert = document.getElementById('stuck-alert')
      if (existingAlert) {
        existingAlert.remove()
      }
      this._lastStuckAlertTimestamp = null
      return
    }

    if (stuckState.timestamp !== this._lastStuckAlertTimestamp) {
      this._lastStuckAlertTimestamp = stuckState.timestamp
      this.showStuckAlert(stuckState)
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
    document.querySelectorAll('.nav-btn').forEach(btn => {
      const view = btn.dataset.view
      btn.classList.toggle('active', view === state.ui.currentView)
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
    const views = ['config', 'prompt', 'designer', 'user-stories', 'architecture', 'cli-output', 'git', 'profile']
    views.forEach(viewName => {
      const view = document.getElementById(`${viewName}-view`)
      if (view) {
        view.classList.toggle('active', state.ui.currentView === viewName)
      }
    })
  }

  /**
   * Update header indicators
   */
  updateHeader(state) {
    const projectName = document.getElementById('project-name')
    if (projectName) {
      projectName.textContent = state.projectName || ''
      projectName.title = state.projectPath || ''
    }
  }

  /**
   * Update sprint context panel (left swimlane) visibility and content
   */
  updateSprintHeader(state) {
    const sprintContextPanel = document.getElementById('sprint-context-panel')
    if (!sprintContextPanel) return

    const sprint = state.activeSprint
    const statusBadge = document.getElementById('sprint-status-badge')
    const closeBtn = document.getElementById('sprint-close-btn')
    const progressSection = document.getElementById('sprint-progress-section')
    const storiesContainer = document.getElementById('sprint-stories')
    const planBtn = document.getElementById('sprint-plan-btn')
    const approveBtn = document.getElementById('sprint-approve-btn')

    // No active sprint - show empty state
    if (!sprint) {
      if (statusBadge) {
        statusBadge.textContent = 'No Sprint'
        statusBadge.className = 'sprint-status-badge'
      }
      if (closeBtn) closeBtn.classList.add('hidden')
      if (progressSection) progressSection.classList.add('hidden')
      if (planBtn) planBtn.classList.add('hidden')
      if (approveBtn) approveBtn.classList.add('hidden')
      if (storiesContainer) {
        storiesContainer.innerHTML = `
          <div class="sprint-empty-state">
            <p class="text-muted">No active sprint</p>
            <p class="text-small">Select stories from the Backlog to start a sprint</p>
          </div>
        `
      }
      return
    }

    // Active sprint - update status badge
    if (statusBadge) {
      statusBadge.textContent = this.formatSprintStatus(sprint.status)
      statusBadge.className = 'sprint-status-badge ' + sprint.status
    }

    // Show close button
    if (closeBtn) closeBtn.classList.remove('hidden')

    // Render story cards and update progress
    const sprintProgress = state.sprintProgress
    const backlogStories = state.userStories || []
    if (storiesContainer && sprint.stories) {
      const showBranchButtons = sprint.status === 'planned' || sprint.status === 'implementing'
      const storyProgress = sprint.storyProgress || {}
      const storiesWithProgress = sprintProgress?.stories || []

      // Calculate story-based progress using backlog as source of truth
      const completedStoryCount = sprint.stories.filter(sprintStory => {
        const backlogStory = backlogStories.find(bs => bs.id === sprintStory.id)
        return backlogStory?.status === 'completed'
      }).length
      const totalStoryCount = sprint.stories.length
      const storyCompletionPercent = totalStoryCount > 0 ? Math.round((completedStoryCount / totalStoryCount) * 100) : 0

      // Capture which criteria sections are currently expanded before re-rendering
      const expandedSections = new Set()
      storiesContainer.querySelectorAll('.story-criteria-section.expanded').forEach(section => {
        const storyId = section.dataset.storyId
        if (storyId) expandedSections.add(storyId)
      })

      storiesContainer.innerHTML = sprint.stories.map(story => {
        const computedStory = storiesWithProgress.find(s => s.id === story.id)
        const progress = storyProgress[story.id]
        // Look up status from backlog (source of truth) first
        const backlogStory = backlogStories.find(bs => bs.id === story.id)
        const storyStatus = backlogStory?.status === 'completed' ? 'completed' :
                           (story.status === 'completed' ? 'completed' :
                           (computedStory?.status || progress?.status || 'pending'))
        const storyStatusClass = storyStatus === 'completed' ? 'story-completed' : storyStatus === 'in_progress' ? 'story-in-progress' : ''
        const isCompleted = storyStatus === 'completed'

        // Get acceptance criteria with completion state
        const criteriaList = computedStory?.acceptanceCriteria || []
        const totalCriteria = criteriaList.length
        const completedCriteria = criteriaList.filter(c => c.checked).length
        const criteriaPercentage = totalCriteria > 0 ? Math.round((completedCriteria / totalCriteria) * 100) : 0

        // Check if this section was expanded before re-render
        const isExpanded = expandedSections.has(story.id)

        return `
          <div class="sprint-story-card ${storyStatusClass}" data-story-id="${story.id}">
            <div class="story-header-with-indicator">
              <button class="story-complete-btn ${isCompleted ? 'completed' : ''}"
                      data-story-id="${story.id}"
                      title="${isCompleted ? 'Mark as incomplete' : 'Mark as complete'}">
                <span class="complete-icon">${isCompleted ? '✓' : '○'}</span>
              </button>
              <h4>${this.escapeHtml(story.title)}</h4>
            </div>
            <p>${this.escapeHtml(story.description || '')}</p>
            ${totalCriteria > 0 ? `
              <div class="story-criteria-section${isExpanded ? ' expanded' : ''}" data-story-id="${story.id}">
                <button class="criteria-toggle-btn" data-story-id="${story.id}" title="Toggle acceptance criteria">
                  <span class="criteria-toggle-icon">▶</span>
                  <span class="criteria-label">Acceptance Criteria</span>
                  <span class="criteria-count">${completedCriteria}/${totalCriteria}</span>
                </button>
                <ul class="criteria-checklist${isExpanded ? ' expanded' : ''}">
                  ${criteriaList.map(c => `
                    <li class="criteria-item ${c.checked ? 'checked' : ''}">
                      <label class="criteria-checkbox-label">
                        <input type="checkbox"
                               class="criteria-checkbox"
                               data-story-id="${story.id}"
                               data-criteria-index="${c.index}"
                               ${c.checked ? 'checked' : ''}>
                        <span class="criteria-text">${this.escapeHtml(c.text)}</span>
                      </label>
                    </li>
                  `).join('')}
                </ul>
              </div>
            ` : ''}
            ${showBranchButtons ? this.renderStoryBranchButtons(story, progress) : ''}
          </div>
        `
      }).join('')

      // Update progress section with story-based completion
      if (progressSection) {
        if (totalStoryCount > 0) {
          progressSection.classList.remove('hidden')
          const progressPercent = document.getElementById('sprint-progress-percent')
          const progressFill = document.getElementById('sprint-progress-fill')
          if (progressPercent) {
            progressPercent.textContent = `${completedStoryCount}/${totalStoryCount} (${storyCompletionPercent}%)`
          }
          if (progressFill) {
            progressFill.style.width = `${storyCompletionPercent}%`
          }
        } else {
          progressSection.classList.add('hidden')
        }
      }

    }

    // Update action buttons based on status
    if (planBtn && approveBtn) {
      planBtn.classList.toggle('hidden', sprint.status !== 'created')
      approveBtn.classList.toggle('hidden', sprint.status !== 'planning')
    }

    // Bind event handlers (only once)
    if (!sprintContextPanel.dataset.bound) {
      sprintContextPanel.dataset.bound = 'true'

      // Close button
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          if (confirm('Close this sprint? You can create a new one from the Backlog.')) {
            this.intents.clearSprint()
          }
        })
      }

      // Plan button
      if (planBtn) {
        planBtn.addEventListener('click', () => {
          this.intents.startSprintPlanning()
        })
      }

      // Approve button
      if (approveBtn) {
        approveBtn.addEventListener('click', () => {
          this.intents.approvePlan()
          this.showToast('Plan approved! Ready for implementation.', 'success')
        })
      }

      // Story branch button clicks (event delegation)
      sprintContextPanel.addEventListener('click', (e) => {
        const branchBtn = e.target.closest('.story-branch-btn')
        if (branchBtn) {
          const storyId = branchBtn.dataset.storyId
          const branchType = branchBtn.dataset.branch
          const storyTitle = branchBtn.dataset.storyTitle
          console.log('[SPRINT] Starting implementation:', { storyId, branchType, storyTitle })
          this.intents.startSprintStoryImplementation(storyId, branchType)
          this.showToast(`Starting ${branchType} implementation for "${storyTitle}"`, 'info')
          return
        }

        // Story completion button clicks (event delegation)
        const completeBtn = e.target.closest('.story-complete-btn')
        if (completeBtn) {
          const storyId = completeBtn.dataset.storyId
          const isCurrentlyCompleted = completeBtn.classList.contains('completed')
          const newStatus = isCurrentlyCompleted ? 'pending' : 'completed'

          console.log('[SPRINT] Toggling story completion:', { storyId, newStatus })

          // Update the user story status (syncs to backlog)
          this.intents.updateUserStory(storyId, { status: newStatus })

          // Also update the sprint's copy of the story
          this.intents.updateSprintStoryStatus(storyId, newStatus)

          const storyCard = completeBtn.closest('.sprint-story-card')
          const storyTitle = storyCard?.querySelector('h4')?.textContent || 'Story'
          this.showToast(
            newStatus === 'completed'
              ? `"${storyTitle}" marked as complete`
              : `"${storyTitle}" marked as incomplete`,
            newStatus === 'completed' ? 'success' : 'info'
          )
        }
      })

      // Acceptance criteria checkbox changes (event delegation)
      sprintContextPanel.addEventListener('change', (e) => {
        const checkbox = e.target.closest('.criteria-checkbox')
        if (checkbox) {
          const storyId = checkbox.dataset.storyId
          const criteriaIndex = parseInt(checkbox.dataset.criteriaIndex, 10)
          const checked = checkbox.checked

          console.log('[SPRINT] Toggling criteria:', { storyId, criteriaIndex, checked })

          // Dispatch action to toggle criteria completion
          this.intents.toggleCriteriaCompletion(storyId, criteriaIndex, checked)
        }
      })

      // Criteria toggle button clicks (expand/collapse)
      sprintContextPanel.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.criteria-toggle-btn')
        if (toggleBtn) {
          const section = toggleBtn.closest('.story-criteria-section')
          const checklist = section?.querySelector('.criteria-checklist')
          if (section && checklist) {
            section.classList.toggle('expanded')
            checklist.classList.toggle('expanded')
            checklist.classList.remove('collapsed')
          }
        }
      })
    }
  }

  /**
   * Render story status indicator icon
   */
  renderStoryStatusIndicator(status, isBlocked) {
    if (isBlocked) {
      return '<span class="story-status-indicator status-blocked" title="Blocked">!</span>'
    }
    switch (status) {
      case 'completed':
        return '<span class="story-status-indicator status-completed" title="Completed">✓</span>'
      case 'in_progress':
        return '<span class="story-status-indicator status-in-progress" title="In Progress">●</span>'
      default:
        return '<span class="story-status-indicator status-pending" title="Pending">○</span>'
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
    const modelEl = document.getElementById('stat-model')
    const createdEl = document.getElementById('stat-created')
    const handoffSection = document.getElementById('handoff-section')
    const handoffDisplay = document.getElementById('handoff-display')

    // Get current thread/branch info
    const activeBranch = state.history?.activeBranch
    const activePromptId = state.history?.activePromptId
    const branch = activeBranch ? state.history?.raw?.branches?.[activeBranch] : null
    const prompts = branch?.prompts || []
    const thread = prompts.find(p => p.id === activePromptId)

    // Aggregate statistics across all prompts in the branch
    let totalTurns = 0
    let totalCost = 0
    let totalDuration = 0
    let hasCostData = false
    let hasDurationData = false

    console.log('[STATS] Branch:', activeBranch, 'Prompts:', prompts.length)

    prompts.forEach(prompt => {
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

    console.log('[STATS] Totals - turns:', totalTurns, 'cost:', totalCost, 'duration:', totalDuration)

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

    // Update model (from current thread)
    if (modelEl) {
      const model = thread?.model || state.settings?.defaultModel || '-'
      modelEl.textContent = model.charAt(0).toUpperCase() + model.slice(1)
    }

    // Update created date (from first prompt in branch)
    if (createdEl) {
      const firstPrompt = prompts[0]
      if (firstPrompt?.createdAt) {
        const date = new Date(firstPrompt.createdAt)
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

    // Update handoff context section (incoming handoff)
    if (handoffSection && handoffDisplay) {
      const handoffContext = thread?.handoffContext
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
    const prompts = branch?.prompts || []

    if (prompts.length === 0) {
      this.showToast('No thread content to generate handoff from', 'warning')
      return
    }

    // Show loading state
    generateBtn.disabled = true
    generateBtn.innerHTML = '<span class="handoff-icon">⏳</span><span class="handoff-text">Generating...</span>'

    try {
      // Build conversation context from all prompts in the thread
      const conversationContext = this.buildConversationContext(prompts, activeBranch)

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
        model: 'haiku',
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
        sourceThreadName: this.getThreadTitle(prompts),
        sourceBranch: activeBranch,
        createdAt: Date.now()
      }

      // Persist to localStorage so it survives navigation
      localStorage.setItem('puffin-handoff-summary', JSON.stringify(this.generatedHandoffSummary))

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
          lines.push(`Files modified: ${prompt.response.filesModified.slice(0, 10).join(', ')}`)
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
    if (prompts.length === 0) return 'Unknown Thread'
    const firstPrompt = prompts[0]
    if (firstPrompt.title) return firstPrompt.title
    if (firstPrompt.content) {
      return firstPrompt.content.substring(0, 50) + (firstPrompt.content.length > 50 ? '...' : '')
    }
    return 'Thread'
  }

  /**
   * Render branch buttons for handoff destination
   */
  renderHandoffBranchButtons(container, currentBranch) {
    if (!container) return

    const branches = [
      { id: 'specifications', name: 'Specifications', icon: '📋' },
      { id: 'architecture', name: 'Architecture', icon: '🏗️' },
      { id: 'ui', name: 'UI', icon: '🎨' },
      { id: 'backend', name: 'Backend', icon: '⚙️' },
      { id: 'deployment', name: 'Deployment', icon: '🚀' },
      { id: 'tmp', name: 'Tmp', icon: '📝' }
    ]

    // Filter out current branch
    const availableBranches = branches.filter(b => b.id !== currentBranch)

    container.innerHTML = availableBranches.map(branch => `
      <button class="handoff-branch-btn" data-branch="${branch.id}" data-branch-name="${branch.name}">
        <span class="branch-icon">${branch.icon}</span>
        <span class="branch-name">${branch.name}</span>
      </button>
    `).join('')
  }

  /**
   * Simple markdown renderer for handoff summaries
   */
  renderMarkdown(text) {
    if (!text) return ''

    return text
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

    // Switch to the target branch
    this.intents.selectBranch(branchId)

    // Dispatch handoff-received event for the prompt editor to handle
    const event = new CustomEvent('handoff-received', {
      detail: {
        branchId,
        branchName,
        summary: this.generatedHandoffSummary.summary,
        sourceThreadName: this.generatedHandoffSummary.sourceThreadName,
        sourceBranch: this.generatedHandoffSummary.sourceBranch
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
   * Calculate sprint progress statistics
   */
  calculateSprintProgress(stories, storyProgress) {
    let completed = 0
    let total = 0

    stories.forEach(story => {
      const progress = storyProgress[story.id]
      if (progress?.branches) {
        Object.values(progress.branches).forEach(branch => {
          total++
          if (branch.status === 'completed') {
            completed++
          }
        })
      }
    })

    // If no branches started yet, show potential total (3 branches per story)
    if (total === 0) {
      total = stories.length * 3
    }

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    return { completed, total, percentage }
  }

  /**
   * Format sprint status for display
   */
  formatSprintStatus(status) {
    const statusMap = {
      'created': 'Created',
      'planning': 'Planning',
      'planned': 'Ready for Implementation',
      'implementing': 'Implementing'
    }
    return statusMap[status] || status
  }

  /**
   * Render branch buttons for a story card
   */
  renderStoryBranchButtons(story, storyProgress) {
    const branches = [
      { id: 'ui', label: 'UI', icon: '🎨' },
      { id: 'backend', label: 'Backend', icon: '⚙️' },
      { id: 'fullstack', label: 'Full Stack', icon: '🔗' }
    ]

    const escapedTitle = this.escapeHtml(story.title).replace(/"/g, '&quot;')
    const branchProgress = storyProgress?.branches || {}

    return `
      <div class="story-branch-buttons">
        ${branches.map(branch => {
          const progress = branchProgress[branch.id]
          const status = progress?.status || 'pending'
          const statusClass = status === 'completed' ? 'completed' : status === 'in_progress' ? 'in-progress' : ''
          const statusIcon = status === 'completed' ? '✓' : status === 'in_progress' ? '◐' : ''
          const titleText = status === 'completed'
            ? `${branch.label} implementation completed`
            : status === 'in_progress'
            ? `${branch.label} implementation in progress`
            : `Start ${branch.label} implementation for this story`

          return `
            <button class="story-branch-btn ${statusClass}"
                    data-story-id="${story.id}"
                    data-branch="${branch.id}"
                    data-story-title="${escapedTitle}"
                    title="${titleText}">
              <span class="branch-icon">${branch.icon}</span>
              <span class="branch-label">${branch.label}</span>
              ${statusIcon ? `<span class="branch-status-icon">${statusIcon}</span>` : ''}
            </button>
          `
        }).join('')}
      </div>
    `
  }

  /**
   * Handle sprint planning - submit planning prompt to Claude
   */
  handleSprintPlanning(planningData, state) {
    console.log('[SPRINT] Starting sprint planning:', planningData)

    // Clear the pending flag immediately to prevent re-submission
    this.intents.clearPendingSprintPlanning()

    const { promptContent, branchId } = planningData

    // Submit the planning prompt to Claude
    if (window.puffin?.claude) {
      window.puffin.claude.submit({
        prompt: promptContent,
        branchId,
        sessionId: null, // New session for sprint planning
        project: state.config ? {
          name: state.config.name,
          description: state.config.description
        } : null
      })
    }
  }

  /**
   * Handle rerun request from state
   */
  handleRerunRequest(rerunRequest, state) {
    this.intents.clearRerunRequest()

    const { branchId, content } = rerunRequest
    console.log('Rerunning prompt:', { branchId, contentPreview: content.substring(0, 100) })

    this.intents.submitPrompt({
      branchId,
      content,
      parentId: null
    })

    const branch = state.history.raw?.branches?.[branchId]

    // Collect all dead sessions (hit context limit)
    const deadSessions = new Set()
    if (branch?.prompts) {
      for (const prompt of branch.prompts) {
        if (prompt.response?.content === 'Prompt is too long' && prompt.response?.sessionId) {
          deadSessions.add(prompt.response.sessionId)
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
   * Show a toast notification
   */
  showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container')
    if (!container) return

    const toast = document.createElement('div')
    toast.className = `toast ${type}`
    toast.textContent = message

    toast.addEventListener('click', () => toast.remove())
    toast.style.cursor = 'pointer'
    toast.title = 'Click to dismiss'

    container.appendChild(toast)

    setTimeout(() => {
      toast.remove()
    }, duration)
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
