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
      'selectBranch', 'createBranch', 'deleteBranch', 'selectPrompt',
      'addGuiElement', 'updateGuiElement', 'deleteGuiElement',
      'moveGuiElement', 'resizeGuiElement', 'selectGuiElement',
      'clearGuiCanvas', 'exportGuiDescription',
      'updateArchitecture', 'reviewArchitecture',
      'switchView', 'toggleSidebar', 'showModal', 'hideModal'
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

          // Architecture actions (no FSM needed)
          ['UPDATE_ARCHITECTURE', actions.updateArchitecture],
          ['REVIEW_ARCHITECTURE', actions.reviewArchitecture],

          // UI Navigation actions (no FSM needed)
          ['SWITCH_VIEW', actions.switchView],
          ['TOGGLE_SIDEBAR', actions.toggleSidebar],
          ['SHOW_MODAL', actions.showModal],
          ['HIDE_MODAL', actions.hideModal]
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

        // Get action type - prefer proposal.type if available
        const actionType = proposal?.type || this.lastAction?.type || 'UNKNOWN'

        // Record action in debugger
        const actionInfo = proposal || this.lastAction || { type: actionType }
        samDebugger.recordAction(actionType, actionInfo, model, this.state)

        console.log('SAM render - actionType:', actionType, 'proposal:', proposal)

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

    // Only persist for certain action types
    const persistActions = [
      'UPDATE_CONFIG', 'UPDATE_OPTIONS',
      'SUBMIT_PROMPT', 'COMPLETE_RESPONSE',
      'SELECT_BRANCH', 'CREATE_BRANCH', 'DELETE_BRANCH',
      'UPDATE_ARCHITECTURE',
      'ADD_GUI_ELEMENT', 'UPDATE_GUI_ELEMENT', 'DELETE_GUI_ELEMENT',
      'MOVE_GUI_ELEMENT', 'RESIZE_GUI_ELEMENT', 'CLEAR_GUI_CANVAS'
    ]

    if (!persistActions.includes(actionType)) return

    try {
      // Persist based on what changed
      if (['UPDATE_CONFIG', 'UPDATE_OPTIONS'].includes(actionType)) {
        console.log('Persisting config:', this.state.config)
        const result = await window.puffin.state.updateConfig(this.state.config)
        console.log('Config persist result:', result)
      }

      if (['SUBMIT_PROMPT', 'COMPLETE_RESPONSE', 'SELECT_BRANCH', 'CREATE_BRANCH', 'DELETE_BRANCH'].includes(actionType)) {
        await window.puffin.state.updateHistory(this.state.history.raw)
      }

      if (actionType === 'UPDATE_ARCHITECTURE') {
        await window.puffin.state.updateArchitecture(this.state.architecture.content)
      }

      console.log('State persisted for action:', actionType)
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
      cliOutput: new CliOutputComponent(this.intents)
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

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleKeyDown(e)
    })
  }

  /**
   * Setup Claude API event listeners
   */
  setupClaudeListeners() {
    if (!window.puffin) return

    // Raw message streaming (for CLI Output view)
    const unsubRaw = window.puffin.claude.onRawMessage((jsonLine) => {
      this.components.cliOutput.handleRawMessage(jsonLine)
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
      this.intents.completeResponse(response)
      this.components.cliOutput.setProcessing(false)
    })
    this.claudeListeners.push(unsubComplete)

    // Response error
    const unsubError = window.puffin.claude.onError((error) => {
      this.intents.responseError(error)
      this.components.cliOutput.setProcessing(false)
    })
    this.claudeListeners.push(unsubError)
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
    const views = ['config', 'prompt', 'designer', 'architecture', 'cli-output']
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
    }
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
