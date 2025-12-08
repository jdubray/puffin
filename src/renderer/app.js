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
  }

  /**
   * Initialize the application
   */
  async init() {
    console.log('Puffin initializing...')

    // Initialize SAM with FSMs
    this.initSAM()

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
      // Rerun prompt (after cancelPrompt, before branch actions)
      'rerunPrompt', 'clearRerunRequest',
      'selectBranch', 'createBranch', 'deleteBranch', 'selectPrompt',
      'addGuiElement', 'updateGuiElement', 'deleteGuiElement',
      'moveGuiElement', 'resizeGuiElement', 'selectGuiElement',
      'clearGuiCanvas', 'exportGuiDescription',
      'saveGuiDefinition', 'loadGuiDefinition', 'listGuiDefinitions',
      'deleteGuiDefinition', 'showSaveGuiDefinitionDialog',
      'updateArchitecture', 'reviewArchitecture',
      'addUserStory', 'updateUserStory', 'deleteUserStory', 'loadUserStories',
      // Story derivation actions
      'deriveUserStories', 'receiveDerivedStories', 'markStoryReady', 'unmarkStoryReady',
      'updateDerivedStory', 'deleteDerivedStory', 'requestStoryChanges',
      'implementStories', 'cancelStoryReview', 'storyDerivationError',
      'switchView', 'toggleSidebar', 'showModal', 'hideModal',
      // Activity tracking actions
      'toolStart', 'toolEnd', 'clearActivity',
      // Developer profile actions
      'loadDeveloperProfile', 'loadGithubRepositories', 'loadGithubActivity'
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

          // Config actions (no FSM needed)
          ['UPDATE_CONFIG', actions.updateConfig],
          ['UPDATE_OPTIONS', actions.updateOptions],

          // Prompt FSM actions (only for actions defined in promptFsm)
          promptFsm.addAction(actions.startCompose, 'START_COMPOSE'),
          ['UPDATE_PROMPT_CONTENT', actions.updatePromptContent], // Not in FSM
          promptFsm.addAction(actions.submitPrompt, 'SUBMIT_PROMPT'),
          promptFsm.addAction(actions.receiveResponseChunk, 'RECEIVE_RESPONSE_CHUNK'),
          promptFsm.addAction(actions.completeResponse, 'COMPLETE_RESPONSE'),
          promptFsm.addAction(actions.responseError, 'RESPONSE_ERROR'),
          promptFsm.addAction(actions.cancelPrompt, 'CANCEL_PROMPT'),

          // Rerun prompt actions
          ['RERUN_PROMPT', actions.rerunPrompt],
          ['CLEAR_RERUN_REQUEST', actions.clearRerunRequest],

          // Branch/History actions (no FSM needed)
          ['SELECT_BRANCH', actions.selectBranch],
          ['CREATE_BRANCH', actions.createBranch],
          ['DELETE_BRANCH', actions.deleteBranch],
          ['SELECT_PROMPT', actions.selectPrompt],

          // GUI Designer actions (no FSM needed)
          ['ADD_GUI_ELEMENT', actions.addGuiElement],
          ['UPDATE_GUI_ELEMENT', actions.updateGuiElement],
          ['DELETE_GUI_ELEMENT', actions.deleteGuiElement],
          ['MOVE_GUI_ELEMENT', actions.moveGuiElement],
          ['RESIZE_GUI_ELEMENT', actions.resizeGuiElement],
          ['SELECT_GUI_ELEMENT', actions.selectGuiElement],
          ['CLEAR_GUI_CANVAS', actions.clearGuiCanvas],
          ['EXPORT_GUI_DESCRIPTION', actions.exportGuiDescription],

          // GUI Definition actions (no FSM needed)
          ['SAVE_GUI_DEFINITION', actions.saveGuiDefinition],
          ['LOAD_GUI_DEFINITION', actions.loadGuiDefinition],
          ['LIST_GUI_DEFINITIONS', actions.listGuiDefinitions],
          ['DELETE_GUI_DEFINITION', actions.deleteGuiDefinition],
          ['SHOW_SAVE_GUI_DEFINITION_DIALOG', actions.showSaveGuiDefinitionDialog],

          // Architecture actions (no FSM needed)
          ['UPDATE_ARCHITECTURE', actions.updateArchitecture],
          ['REVIEW_ARCHITECTURE', actions.reviewArchitecture],

          // User Story actions (no FSM needed)
          ['ADD_USER_STORY', actions.addUserStory],
          ['UPDATE_USER_STORY', actions.updateUserStory],
          ['DELETE_USER_STORY', actions.deleteUserStory],
          ['LOAD_USER_STORIES', actions.loadUserStories],

          // Story derivation actions (no FSM needed)
          ['DERIVE_USER_STORIES', actions.deriveUserStories],
          ['RECEIVE_DERIVED_STORIES', actions.receiveDerivedStories],
          ['MARK_STORY_READY', actions.markStoryReady],
          ['UNMARK_STORY_READY', actions.unmarkStoryReady],
          ['UPDATE_DERIVED_STORY', actions.updateDerivedStory],
          ['DELETE_DERIVED_STORY', actions.deleteDerivedStory],
          ['REQUEST_STORY_CHANGES', actions.requestStoryChanges],
          ['IMPLEMENT_STORIES', actions.implementStories],
          ['CANCEL_STORY_REVIEW', actions.cancelStoryReview],
          ['STORY_DERIVATION_ERROR', actions.storyDerivationError],

          // UI Navigation actions (no FSM needed)
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
          ['LOAD_GITHUB_ACTIVITY', actions.loadGithubActivity]
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

        // Get action type - SAM pattern stores it on the model as __actionName
        // Also check proposal (which might be the model in some cases) and lastAction fallback
        const actionType = model?.__actionName || proposal?.__actionName || proposal?.type || this.lastAction?.type || 'UNKNOWN'

        // Record action in debugger
        const actionInfo = proposal || this.lastAction || { type: actionType }
        samDebugger.recordAction(actionType, actionInfo, model, this.state)

        console.log('[SAM-RENDER] actionType:', actionType, 'model.__actionName:', model?.__actionName)

        this.lastAction = null

        render(this.state, previousState)

        // Auto-persist state changes to .puffin/
        this.persistState(actionType)
      }
    })

    // Convert intents array to named object using our actionNames mapping
    this.intents = {}
    const intentsArray = samResult.intents || []
    actionNames.forEach((name, index) => {
      if (intentsArray[index]) {
        this.intents[name] = intentsArray[index]
      }
    })

    console.log('SAM initialized with intents:', Object.keys(this.intents))

    // Store intents globally for debugging
    window.__puffin_intents = this.intents

    // Wrap intents for debugging
    this.wrapIntentsForDebugging()
  }

  /**
   * Persist state changes to .puffin/ directory
   */
  async persistState(actionType) {
    if (!window.puffin) {
      console.log('Persist skipped: no window.puffin')
      return
    }

    // Normalize action type (handle both SCREAMING_SNAKE and potential variations)
    const normalizedType = actionType?.toUpperCase?.() || actionType

    // Only persist for certain action types
    const persistActions = [
      'UPDATE_CONFIG', 'UPDATE_OPTIONS',
      'SUBMIT_PROMPT', 'COMPLETE_RESPONSE',
      'SELECT_BRANCH', 'CREATE_BRANCH', 'DELETE_BRANCH',
      'UPDATE_ARCHITECTURE',
      'ADD_GUI_ELEMENT', 'UPDATE_GUI_ELEMENT', 'DELETE_GUI_ELEMENT',
      'MOVE_GUI_ELEMENT', 'RESIZE_GUI_ELEMENT', 'CLEAR_GUI_CANVAS',
      'ADD_USER_STORY', 'UPDATE_USER_STORY', 'DELETE_USER_STORY',
      'IMPLEMENT_STORIES' // Persist user stories when implementing
    ]

    if (!persistActions.includes(normalizedType)) {
      console.log('[PERSIST-DEBUG] Skipping persist for action:', actionType, '(normalized:', normalizedType, ')')
      return
    }

    try {
      // Persist based on what changed
      if (['UPDATE_CONFIG', 'UPDATE_OPTIONS'].includes(normalizedType)) {
        console.log('Persisting config:', this.state.config)
        const result = await window.puffin.state.updateConfig(this.state.config)
        console.log('Config persist result:', result)
      }

      if (['SUBMIT_PROMPT', 'COMPLETE_RESPONSE', 'SELECT_BRANCH', 'CREATE_BRANCH', 'DELETE_BRANCH'].includes(normalizedType)) {
        console.log('[PERSIST-DEBUG] Action:', normalizedType)

        // For COMPLETE_RESPONSE, verify the response is in the history before persisting
        if (normalizedType === 'COMPLETE_RESPONSE') {
          const activePrompt = this.state.history.selectedPrompt
          console.log('[PERSIST-DEBUG] selectedPrompt.id:', activePrompt?.id)
          console.log('[PERSIST-DEBUG] selectedPrompt.response:', activePrompt?.response ? 'EXISTS' : 'NULL')

          // Also check directly in raw history
          const activeBranch = this.state.history.activeBranch
          const branchData = this.state.history.raw?.branches?.[activeBranch]
          if (branchData) {
            const lastPrompt = branchData.prompts[branchData.prompts.length - 1]
            console.log('[PERSIST-DEBUG] Last prompt in branch:', lastPrompt?.id)
            console.log('[PERSIST-DEBUG] Last prompt response:', lastPrompt?.response ? 'EXISTS' : 'NULL')
            if (lastPrompt?.response) {
              console.log('[PERSIST-DEBUG] Last prompt response content length:', lastPrompt.response.content?.length || 0)
            }
          }
        }

        await window.puffin.state.updateHistory(this.state.history.raw)
        console.log('[PERSIST-DEBUG] History persisted successfully')

        // Auto-extract user stories from specifications branch responses
        if (normalizedType === 'COMPLETE_RESPONSE' && this.state.history.activeBranch === 'specifications') {
          await this.extractUserStoriesFromResponse()
        }
      }

      if (normalizedType === 'UPDATE_ARCHITECTURE') {
        await window.puffin.state.updateArchitecture(this.state.architecture.content)
      }

      // Persist user stories and history when implementing from derivation
      if (normalizedType === 'IMPLEMENT_STORIES') {
        // Persist history (we added a prompt entry)
        await window.puffin.state.updateHistory(this.state.history.raw)

        // The stories have been added to this.state.userStories via the acceptor
        // We need to persist each newly added story
        for (const story of this.state.userStories) {
          // Try to add - if it exists, this will be handled gracefully
          try {
            await window.puffin.state.addUserStory(story)
          } catch (e) {
            // Story might already exist, update instead
            await window.puffin.state.updateUserStory(story.id, story)
          }
        }
      }

      console.log('[PERSIST-DEBUG] State persisted for action:', normalizedType)
    } catch (error) {
      console.error('Failed to persist state:', error)
    }
  }

  /**
   * Wrap intents for debugging (adds logging)
   */
  wrapIntentsForDebugging() {
    this.lastAction = null
    const originalIntents = { ...this.intents }

    // Map intent names to action types (camelCase to SCREAMING_SNAKE_CASE)
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
      developerProfile: new DeveloperProfileComponent(this.intents)
    }

    // Initialize each component
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
  }

  /**
   * Setup profile menu IPC message handlers
   */
  setupProfileMenuHandlers() {
    if (!window.puffin?.menu) return

    // Listen for profile menu actions from Electron main process
    window.puffin.menu.onProfileView(() => this.handleProfileAction('view'))
    window.puffin.menu.onProfileCreate(() => this.handleProfileAction('create'))
    window.puffin.menu.onProfileEdit(() => this.handleProfileAction('edit'))
    window.puffin.menu.onProfileExport(() => this.handleProfileAction('export'))
    window.puffin.menu.onProfileImport(() => this.handleProfileAction('import'))
    window.puffin.menu.onProfileDelete(() => this.handleProfileAction('delete'))
  }

  /**
   * Handle profile menu actions
   * @param {string} action - The profile action to perform
   */
  async handleProfileAction(action) {
    console.log(`Profile action: ${action}`)

    switch (action) {
      case 'view':
        // Switch to profile view
        this.intents.switchView('profile')
        break

      case 'create':
        // Switch to profile view and trigger create
        this.intents.switchView('profile')
        // Let the profile component handle the creation through its form
        break

      case 'edit':
        // Switch to profile view (will show edit form if profile exists)
        this.intents.switchView('profile')
        break

      case 'export':
        // Delegate to profile component
        if (this.components.developerProfile) {
          await this.components.developerProfile.handleExport()
        }
        break

      case 'import':
        // Delegate to profile component
        if (this.components.developerProfile) {
          await this.components.developerProfile.handleImport()
        }
        break

      case 'delete':
        // Delegate to profile component
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
      const minWidth = 200
      const maxWidth = 500

      const newWidth = Math.max(minWidth, Math.min(width, maxWidth))
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

    // Profile menu actions
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
          // Reload state to reflect imported profile
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
      // Also process for activity tracking
      this.processRawMessageForActivity(jsonLine)
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
      console.log('[SAM-DEBUG] response:', response)
      console.log('[SAM-DEBUG] response.content length:', response?.content?.length || 0)
      console.log('[SAM-DEBUG] response.content preview:', response?.content?.substring(0, 200) || '(empty)')
      console.log('[SAM-DEBUG] response.content type:', typeof response?.content)
      // Pass the files modified from activity state before it gets cleared
      const filesModified = this.state?.activity?.filesModified || []
      console.log('[SAM-DEBUG] filesModified at completion:', filesModified.length, 'files')
      console.log('[SAM-DEBUG] filesModified data:', JSON.stringify(filesModified))
      this.intents.completeResponse(response, filesModified)
      // Now clear activity state after we've captured filesModified
      this.intents.clearActivity()
      this.components.cliOutput.setProcessing(false)
    })
    this.claudeListeners.push(unsubComplete)

    // Response error
    const unsubError = window.puffin.claude.onError((error) => {
      this.intents.responseError(error)
      this.components.cliOutput.setProcessing(false)
    })
    this.claudeListeners.push(unsubError)

    // Story derivation - stories derived
    const unsubStoriesDerived = window.puffin.claude.onStoriesDerived((data) => {
      console.log('Stories derived:', data)
      this.intents.receiveDerivedStories(data.stories, data.originalPrompt)
    })
    this.claudeListeners.push(unsubStoriesDerived)

    // Story derivation - error
    const unsubStoryError = window.puffin.claude.onStoryDerivationError((error) => {
      console.error('Story derivation error:', error)
      this.intents.storyDerivationError(error)
      this.showToast('Failed to derive stories: ' + error.error, 'error')
    })
    this.claudeListeners.push(unsubStoryError)
  }

  /**
   * Handle state changes
   */
  onStateChange({ state, changed }) {
    // Update navigation
    this.updateNavigation(state)

    // Update sidebar visibility
    this.updateSidebar(state)

    // Update views
    this.updateViews(state)

    // Update modal
    this.updateModal(state)

    // Update header indicators
    this.updateHeader(state)

    // Handle rerun request
    if (state.rerunRequest) {
      this.handleRerunRequest(state.rerunRequest, state)
    }
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
    const views = ['config', 'prompt', 'designer', 'user-stories', 'architecture', 'cli-output']
    views.forEach(viewName => {
      const view = document.getElementById(`${viewName}-view`)
      if (view) {
        view.classList.toggle('active', state.ui.currentView === viewName)
      }
    })
  }

  /**
   * Update modal
   */
  updateModal(state) {
    const container = document.getElementById('modal-container')
    if (container) {
      container.classList.toggle('hidden', !state.ui.hasModal)

      // Render modal content based on type
      if (state.ui.hasModal && state.ui.modal) {
        // Track current modal render to prevent stale async renders
        const modalType = state.ui.modal.type
        this._currentModalRender = modalType
        this.renderModalContent(state.ui.modal, modalType)
      }
    }
  }

  /**
   * Render modal content based on type
   */
  async renderModalContent(modal, renderToken) {
    const modalTitle = document.getElementById('modal-title')
    const modalContent = document.getElementById('modal-content')
    const modalActions = document.getElementById('modal-actions')

    // Immediately clear old content to prevent stale event handlers
    modalTitle.textContent = 'Loading...'
    modalContent.innerHTML = ''
    modalActions.innerHTML = ''

    // Helper to check if this render is still current
    const isStale = () => renderToken && this._currentModalRender !== renderToken

    switch (modal.type) {
      case 'save-gui-definition':
        this.renderSaveGuiDefinitionModal(modalTitle, modalContent, modalActions, modal.data)
        break
      case 'load-gui-definition':
        await this.renderLoadGuiDefinitionModal(modalTitle, modalContent, modalActions)
        break
      case 'gui-export':
        // Handled by gui-designer component
        break
      case 'user-story-review':
        // Handled by UserStoryReviewModalComponent which subscribes to state changes
        break
      case 'profile-view':
        await this.renderProfileViewModal(modalTitle, modalContent, modalActions, isStale)
        break
      case 'profile-create':
        await this.renderProfileCreateModal(modalTitle, modalContent, modalActions, isStale)
        break
      case 'profile-edit':
        await this.renderProfileEditModal(modalTitle, modalContent, modalActions, isStale)
        break
      default:
        console.log('Unknown modal type:', modal.type)
    }
  }

  /**
   * Render load GUI definition modal (for Designer view)
   */
  async renderLoadGuiDefinitionModal(title, content, actions) {
    title.textContent = 'Load GUI Definition'

    // Show loading state
    content.innerHTML = '<p>Loading definitions...</p>'

    // Fetch available definitions
    let definitions = []
    try {
      const result = await window.puffin.state.listGuiDefinitions()
      if (result.success) {
        definitions = result.definitions || []
      }
    } catch (error) {
      console.error('Failed to load GUI definitions:', error)
    }

    if (definitions.length === 0) {
      content.innerHTML = '<p class="no-definitions">No saved definitions yet. Create one by designing a layout and clicking Save.</p>'
      actions.innerHTML = '<button class="btn secondary" id="modal-cancel-btn">Close</button>'
      document.getElementById('modal-cancel-btn').addEventListener('click', () => {
        this.intents.hideModal()
      })
      return
    }

    content.innerHTML = `
      <div class="gui-definition-list">
        ${definitions.map(def => `
          <div class="gui-definition-item" data-filename="${this.escapeHtml(def.filename)}">
            <div class="definition-icon">📋</div>
            <div class="definition-info">
              <span class="definition-name">${this.escapeHtml(def.name)}</span>
              <span class="definition-meta">${def.description || `${def.elements?.length || 0} elements`}</span>
            </div>
            <button class="definition-delete" data-filename="${this.escapeHtml(def.filename)}" title="Delete">×</button>
          </div>
        `).join('')}
      </div>
    `

    actions.innerHTML = '<button class="btn secondary" id="modal-cancel-btn">Cancel</button>'

    document.getElementById('modal-cancel-btn').addEventListener('click', () => {
      this.intents.hideModal()
    })

    // Handle definition clicks - load into designer
    content.querySelectorAll('.gui-definition-item[data-filename]').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.classList.contains('definition-delete')) return

        const filename = item.dataset.filename
        try {
          const result = await window.puffin.state.loadGuiDefinition(filename)
          if (result.success) {
            // Load into designer via SAM action
            this.intents.loadGuiDefinition(filename, result.definition)
            this.intents.hideModal()
            this.showToast(`Loaded: ${result.definition.name}`, 'success')
          }
        } catch (error) {
          console.error('Failed to load definition:', error)
          this.showToast('Failed to load definition', 'error')
        }
      })
    })

    // Handle delete buttons
    content.querySelectorAll('.definition-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const filename = btn.dataset.filename
        if (confirm('Delete this GUI definition?')) {
          try {
            await window.puffin.state.deleteGuiDefinition(filename)
            this.showToast('Definition deleted', 'success')
            // Refresh the modal
            await this.renderLoadGuiDefinitionModal(title, content, actions)
          } catch (error) {
            console.error('Failed to delete definition:', error)
          }
        }
      })
    })
  }

  /**
   * Render save GUI definition modal
   */
  renderSaveGuiDefinitionModal(title, content, actions, data) {
    title.textContent = 'Save GUI Definition'

    content.innerHTML = `
      <div class="form-group">
        <label for="definition-name">Name</label>
        <input type="text" id="definition-name" placeholder="My UI Layout" required>
      </div>
      <div class="form-group">
        <label for="definition-description">Description (optional)</label>
        <textarea id="definition-description" rows="3" placeholder="Brief description of this UI layout..."></textarea>
      </div>
      <p class="form-hint">Saving ${data?.elements?.length || 0} elements from current design.</p>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn primary" id="save-definition-btn">Save Definition</button>
    `

    document.getElementById('modal-cancel-btn').addEventListener('click', () => {
      this.intents.hideModal()
    })

    document.getElementById('save-definition-btn').addEventListener('click', async () => {
      const name = document.getElementById('definition-name').value.trim()
      const description = document.getElementById('definition-description').value.trim()

      if (!name) {
        alert('Please enter a name for the definition')
        return
      }

      try {
        const elements = data?.elements || this.state.designer.flatElements || []
        const result = await window.puffin.state.saveGuiDefinition(name, description, elements)
        if (result.success) {
          this.showToast('GUI definition saved!', 'success')
          this.intents.hideModal()
        } else {
          throw new Error(result.error)
        }
      } catch (error) {
        console.error('Failed to save definition:', error)
        alert('Failed to save definition: ' + error.message)
      }
    })

    // Focus the name input
    setTimeout(() => {
      document.getElementById('definition-name')?.focus()
    }, 100)
  }

  /**
   * Render profile view modal
   */
  async renderProfileViewModal(title, content, actions, isStale = () => false) {
    title.textContent = 'Developer Profile'

    try {
      const result = await window.puffin.profile.get()

      // Check if this render is still current after async operation
      if (isStale()) {
        console.log('Profile view modal render cancelled - stale')
        return
      }
      if (!result.success || !result.profile) {
        content.innerHTML = `
          <div class="profile-empty">
            <p>No profile found. Create one to get started.</p>
          </div>
        `
        actions.innerHTML = `
          <button class="btn secondary" id="modal-cancel-btn">Close</button>
          <button class="btn primary" id="profile-create-btn">Create Profile</button>
        `
        document.getElementById('modal-cancel-btn').addEventListener('click', () => this.intents.hideModal())
        document.getElementById('profile-create-btn').addEventListener('click', () => {
          this.intents.showModal('profile-create', {})
        })
        return
      }

      const profile = result.profile
      content.innerHTML = `
        <div class="profile-view">
          <div class="profile-field">
            <label>Name</label>
            <div class="profile-value">${this.escapeHtml(profile.name || 'Not set')}</div>
          </div>
          <div class="profile-field">
            <label>Email</label>
            <div class="profile-value">${this.escapeHtml(profile.email || 'Not set')}</div>
          </div>
          <div class="profile-field">
            <label>GitHub</label>
            <div class="profile-value">${profile.github?.login ? `@${this.escapeHtml(profile.github.login)}` : 'Not connected'}</div>
          </div>
          ${profile.preferences ? `
            <div class="profile-field">
              <label>Programming Style</label>
              <div class="profile-value">${this.escapeHtml(profile.preferences.programmingStyle || 'Not set')}</div>
            </div>
            <div class="profile-field">
              <label>Testing Approach</label>
              <div class="profile-value">${this.escapeHtml(profile.preferences.testingApproach || 'Not set')}</div>
            </div>
          ` : ''}
        </div>
      `
      actions.innerHTML = `
        <button class="btn secondary" id="modal-cancel-btn">Close</button>
        <button class="btn primary" id="profile-edit-btn">Edit Profile</button>
      `
      document.getElementById('modal-cancel-btn').addEventListener('click', () => this.intents.hideModal())
      document.getElementById('profile-edit-btn').addEventListener('click', () => {
        // Directly show the edit modal - no need to hide first
        this.intents.showModal('profile-edit', {})
      })
    } catch (error) {
      content.innerHTML = `<p class="error">Failed to load profile: ${this.escapeHtml(error.message)}</p>`
      actions.innerHTML = '<button class="btn secondary" id="modal-cancel-btn">Close</button>'
      document.getElementById('modal-cancel-btn').addEventListener('click', () => this.intents.hideModal())
    }
  }

  /**
   * Render profile create modal
   */
  async renderProfileCreateModal(title, content, actions, isStale = () => false) {
    title.textContent = 'Create Developer Profile'

    // Get available options
    let options = {}
    try {
      const result = await window.puffin.profile.getOptions()
      if (result.success) {
        options = result.options
      }
    } catch (e) {
      console.error('Failed to get profile options:', e)
    }

    // Check if this render is still current after async operation
    if (isStale()) {
      console.log('Profile create modal render cancelled - stale')
      return
    }

    content.innerHTML = `
      <div class="profile-form">
        <div class="form-group">
          <label for="modal-profile-name">Name *</label>
          <input type="text" id="modal-profile-name" placeholder="Your name" required>
        </div>
        <div class="form-group">
          <label for="modal-profile-email">Email</label>
          <input type="email" id="modal-profile-email" placeholder="your@email.com">
        </div>
        <div class="form-group">
          <label for="modal-profile-programming-style">Programming Style</label>
          <select id="modal-profile-programming-style">
            <option value="">Select...</option>
            ${(options.programmingStyles || ['OOP', 'FP', 'HYBRID', 'TEMPORAL']).map(s =>
              `<option value="${s}">${s}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="modal-profile-testing-approach">Testing Approach</label>
          <select id="modal-profile-testing-approach">
            <option value="">Select...</option>
            ${(options.testingApproaches || ['TDD', 'BDD', 'INTEGRATION', 'MINIMAL']).map(s =>
              `<option value="${s}">${s}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn primary" id="modal-profile-save-btn">Create Profile</button>
    `

    const cancelBtn = document.getElementById('modal-cancel-btn')
    const saveBtn = document.getElementById('modal-profile-save-btn')

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.intents.hideModal())
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const nameInput = document.getElementById('modal-profile-name')
        const emailInput = document.getElementById('modal-profile-email')
        const styleSelect = document.getElementById('modal-profile-programming-style')
        const testingSelect = document.getElementById('modal-profile-testing-approach')

        if (!nameInput || !nameInput.value) {
          console.error('Profile form elements not found or invalid')
          return
        }

        const name = (nameInput.value || '').trim()
        const email = (emailInput?.value || '').trim()
        const programmingStyle = styleSelect?.value || ''
        const testingApproach = testingSelect?.value || ''

        if (!name) {
          alert('Name is required')
          return
        }

        try {
          const result = await window.puffin.profile.create({
            name,
            email,
            preferredCodingStyle: programmingStyle || 'HYBRID',
            preferences: {
              programmingStyle: programmingStyle || 'HYBRID',
              testingApproach: testingApproach || 'TDD'
            }
          })
          if (result.success) {
            this.showToast('Profile created!', 'success')
            this.intents.hideModal()
          } else {
            throw new Error(result.error || result.errors?.map(e => e.message).join(', '))
          }
        } catch (error) {
          alert('Failed to create profile: ' + error.message)
        }
      })
    }

    setTimeout(() => document.getElementById('modal-profile-name')?.focus(), 100)
  }

  /**
   * Render profile edit modal
   */
  async renderProfileEditModal(title, content, actions, isStale = () => false) {
    title.textContent = 'Edit Developer Profile'

    let profile = null
    let options = {}

    try {
      const [profileResult, optionsResult] = await Promise.all([
        window.puffin.profile.get(),
        window.puffin.profile.getOptions()
      ])
      if (profileResult.success) profile = profileResult.profile
      if (optionsResult.success) options = optionsResult.options
    } catch (e) {
      console.error('Failed to load profile data:', e)
    }

    // Check if this render is still current after async operation
    if (isStale()) {
      console.log('Profile edit modal render cancelled - stale')
      return
    }

    if (!profile) {
      content.innerHTML = '<p>No profile found. Please create one first.</p>'
      actions.innerHTML = '<button class="btn secondary" id="modal-cancel-btn">Close</button>'
      document.getElementById('modal-cancel-btn').addEventListener('click', () => this.intents.hideModal())
      return
    }

    content.innerHTML = `
      <div class="profile-form">
        <div class="form-group">
          <label for="modal-profile-name">Name *</label>
          <input type="text" id="modal-profile-name" value="${this.escapeHtml(profile.name || '')}" required>
        </div>
        <div class="form-group">
          <label for="modal-profile-email">Email</label>
          <input type="email" id="modal-profile-email" value="${this.escapeHtml(profile.email || '')}">
        </div>
        <div class="form-group">
          <label for="modal-profile-programming-style">Programming Style</label>
          <select id="modal-profile-programming-style">
            <option value="">Select...</option>
            ${(options.programmingStyles || ['OOP', 'FP', 'HYBRID', 'TEMPORAL']).map(s =>
              `<option value="${s}" ${profile.preferences?.programmingStyle === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="modal-profile-testing-approach">Testing Approach</label>
          <select id="modal-profile-testing-approach">
            <option value="">Select...</option>
            ${(options.testingApproaches || ['TDD', 'BDD', 'INTEGRATION', 'MINIMAL']).map(s =>
              `<option value="${s}" ${profile.preferences?.testingApproach === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
        </div>
      </div>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn primary" id="modal-profile-save-btn">Save Changes</button>
    `

    document.getElementById('modal-cancel-btn').addEventListener('click', () => this.intents.hideModal())
    document.getElementById('modal-profile-save-btn').addEventListener('click', async () => {
      const name = document.getElementById('modal-profile-name').value.trim()
      const email = document.getElementById('modal-profile-email').value.trim()
      const programmingStyle = document.getElementById('modal-profile-programming-style').value
      const testingApproach = document.getElementById('modal-profile-testing-approach').value

      if (!name) {
        alert('Name is required')
        return
      }

      try {
        const result = await window.puffin.profile.update({
          name,
          email,
          preferences: {
            programmingStyle,
            testingApproach
          }
        })
        if (result.success) {
          this.showToast('Profile updated!', 'success')
          this.intents.hideModal()
        } else {
          throw new Error(result.error)
        }
      } catch (error) {
        alert('Failed to update profile: ' + error.message)
      }
    })
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
   * Update header indicators
   */
  updateHeader(state) {
    // Project name (now shows directory name)
    const projectName = document.getElementById('project-name')
    if (projectName) {
      projectName.textContent = state.projectName || ''
      projectName.title = state.projectPath || ''
    }
  }

  /**
   * Handle rerun request from state
   */
  handleRerunRequest(rerunRequest, state) {
    // Clear the request immediately to prevent re-triggering
    this.intents.clearRerunRequest()

    const { branchId, content } = rerunRequest

    console.log('Rerunning prompt:', { branchId, contentPreview: content.substring(0, 100) })

    // Submit the prompt through SAM
    this.intents.submitPrompt({
      branchId,
      content,
      parentId: null
    })

    // Get session ID for conversation continuity
    const branch = state.history.raw?.branches?.[branchId]
    const lastPromptWithResponse = branch?.prompts
      ?.filter(p => p.response?.sessionId)
      ?.pop()
    const sessionId = lastPromptWithResponse?.response?.sessionId || null

    // Trigger the actual Claude CLI submission
    window.puffin.claude.submit({
      prompt: content,
      branchId,
      sessionId,
      project: state.config ? {
        name: state.config.name,
        description: state.config.description
      } : null
    })

    // Switch to prompt view to show the response
    this.intents.switchView('prompt')
  }

  /**
   * Process raw JSON message for activity tracking
   */
  processRawMessageForActivity(jsonLine) {
    try {
      const msg = JSON.parse(jsonLine)

      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_use') {
            // Tool started - extract file path from input if available
            console.log('[ACTIVITY-DEBUG] Tool start:', block.name, 'id:', block.id)
            console.log('[ACTIVITY-DEBUG] Tool input:', JSON.stringify(block.input)?.substring(0, 200))
            this.intents.toolStart(block.id, block.name, block.input)
          }
        }
      } else if (msg.type === 'user' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_result') {
            // Tool completed - extract any file path that was modified
            const toolInfo = this.state?.activity?.activeTools?.find(t => t.id === block.tool_use_id)
            const filePath = toolInfo ? this.extractFilePathFromToolInput(toolInfo.name, toolInfo.input) : null
            const action = toolInfo?.name === 'Write' || toolInfo?.name === 'Edit' ? 'write' :
                          toolInfo?.name === 'Read' ? 'read' : null
            console.log('[ACTIVITY-DEBUG] Tool end:', toolInfo?.name, 'id:', block.tool_use_id, 'filePath:', filePath, 'action:', action)
            this.intents.toolEnd(block.tool_use_id, filePath, action)
          }
        }
      } else if (msg.type === 'result') {
        // Response complete - clear activity
        // NOTE: Don't clear here! We need filesModified for the completion handler
        // The clearActivity will be called after completeResponse captures the data
        console.log('[ACTIVITY-DEBUG] Result received, NOT clearing activity yet (filesModified count:', this.state?.activity?.filesModified?.length || 0, ')')
      }
    } catch (e) {
      // Not valid JSON, ignore
    }
  }

  /**
   * Extract file path from tool input
   */
  extractFilePathFromToolInput(toolName, input) {
    if (!input) return null

    // Different tools have different input shapes
    if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
      return input.file_path || input.path || null
    }
    if (toolName === 'Bash') {
      return null // Bash doesn't have a specific file path
    }
    if (toolName === 'Grep' || toolName === 'Glob') {
      return input.path || null
    }
    return null
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyDown(e) {
    // Ctrl/Cmd + Enter = Submit prompt
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (this.state?.prompt.canSubmit) {
        this.components.promptEditor.submit()
      }
    }

    // Escape = Close modal
    if (e.key === 'Escape' && this.state?.ui.hasModal) {
      this.intents.hideModal()
    }
  }

  /**
   * Show a toast notification
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container')
    if (!container) return

    const toast = document.createElement('div')
    toast.className = `toast ${type}`
    toast.textContent = message

    container.appendChild(toast)

    setTimeout(() => {
      toast.remove()
    }, 3000)
  }

  /**
   * Extract user stories from the most recent specifications response
   * Uses heuristic-based extraction looking for common user story patterns
   */
  async extractUserStoriesFromResponse() {
    try {
      const specBranch = this.state.history.raw.branches.specifications
      if (!specBranch || !specBranch.prompts.length) return

      // Get the most recent prompt with a response
      const recentPrompt = [...specBranch.prompts].reverse().find(p => p.response)
      if (!recentPrompt || !recentPrompt.response?.content) return

      const content = recentPrompt.content + '\n' + recentPrompt.response.content
      const extractedStories = this.parseUserStories(content)

      if (extractedStories.length === 0) {
        console.log('No user stories found in specifications response')
        return
      }

      // Add each extracted story
      for (const story of extractedStories) {
        // Check if a similar story already exists (by title)
        const exists = this.state.userStories?.some(
          s => s.title.toLowerCase() === story.title.toLowerCase()
        )

        if (!exists) {
          await window.puffin.state.addUserStory({
            ...story,
            sourcePromptId: recentPrompt.id
          })
          console.log('Auto-extracted user story:', story.title)
        }
      }

      // Reload user stories to update state
      const result = await window.puffin.state.getUserStories()
      if (result.success) {
        this.intents.loadUserStories(result.stories)
      }

      if (extractedStories.length > 0) {
        this.showToast(`Extracted ${extractedStories.length} user ${extractedStories.length === 1 ? 'story' : 'stories'} from specifications`, 'success')
      }
    } catch (error) {
      console.error('Failed to extract user stories:', error)
    }
  }

  /**
   * Parse user stories from text content
   * Looks for common patterns like:
   * - "As a [user], I want [action] so that [benefit]"
   * - "User Story: [title]"
   * - Numbered/bulleted lists of features
   */
  parseUserStories(content) {
    const stories = []

    // Pattern 1: "As a [user], I want [action] so that [benefit]"
    const asAUserPattern = /as an? ([^,]+),?\s+i want\s+(.+?)\s+so that\s+(.+?)(?:\.|$)/gi
    let match
    while ((match = asAUserPattern.exec(content)) !== null) {
      const [, user, action, benefit] = match
      stories.push({
        title: `${action.trim()}`.substring(0, 100),
        description: `As a ${user.trim()}, I want ${action.trim()} so that ${benefit.trim()}.`,
        acceptanceCriteria: [],
        status: 'pending'
      })
    }

    // Pattern 2: "User Story:" or "Story:" headers
    const storyHeaderPattern = /(?:user\s+)?story[:\s]+([^\n]+)/gi
    while ((match = storyHeaderPattern.exec(content)) !== null) {
      const title = match[1].trim()
      if (title.length > 5 && !stories.some(s => s.title === title)) {
        stories.push({
          title: title.substring(0, 100),
          description: '',
          acceptanceCriteria: [],
          status: 'pending'
        })
      }
    }

    // Pattern 3: Feature descriptions with "should" or "must"
    const featurePattern = /(?:the\s+)?(?:system|app|application|user)\s+(?:should|must|can|will)\s+(?:be able to\s+)?([^.]{15,100})/gi
    while ((match = featurePattern.exec(content)) !== null) {
      const feature = match[1].trim()
      const title = feature.charAt(0).toUpperCase() + feature.slice(1)
      if (!stories.some(s => s.title.toLowerCase() === title.toLowerCase())) {
        stories.push({
          title: title.substring(0, 100),
          description: `The system should ${feature}.`,
          acceptanceCriteria: [],
          status: 'pending'
        })
      }
    }

    // Limit to avoid creating too many stories at once
    return stories.slice(0, 10)
  }

  /**
   * Cleanup
   */
  destroy() {
    // Unsubscribe Claude listeners
    this.claudeListeners.forEach(unsub => unsub())
    this.claudeListeners = []

    // Destroy components
    Object.values(this.components).forEach(component => {
      if (component.destroy) component.destroy()
    })
  }
}

// Initialize app on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.puffinApp = new PuffinApp()
  window.puffinApp.init()

  // Remove splash screen after animation completes (2s total: 1.5s delay + 0.5s fade)
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
