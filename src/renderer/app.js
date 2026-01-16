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

// Components
import { ProjectFormComponent } from './components/project-form/project-form.js'
import { HistoryTreeComponent } from './components/history-tree/history-tree.js'
import { PromptEditorComponent } from './components/prompt-editor/prompt-editor.js'
import { ResponseViewerComponent } from './components/response-viewer/response-viewer.js'
import { DebuggerComponent } from './components/debugger/debugger.js'
import { CliOutputComponent } from './components/cli-output/cli-output.js'
import { UserStoriesComponent } from './components/user-stories/user-stories.js'
import { UserStoryReviewModalComponent } from './components/user-story-review-modal/user-story-review-modal.js'
import { DeveloperProfileComponent } from './components/developer-profile/developer-profile.js'
import { StoryGenerationsComponent } from './components/story-generations/story-generations.js'
import { GitPanelComponent } from './components/git-panel/git-panel.js'

// Plugin system
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
   * Show a modal for assertion generation progress
   */
  showAssertionGenerationModal() {
    // Remove any existing modal
    this.hideAssertionGenerationModal()

    const modal = document.createElement('div')
    modal.id = 'assertion-generation-modal'
    modal.className = 'assertion-generation-modal'
    modal.innerHTML = `
      <div class="assertion-generation-content">
        <div class="assertion-generation-spinner"></div>
        <h3>Generating Inspection Assertions</h3>
        <p class="assertion-generation-status">Analyzing stories and implementation plan...</p>
        <p class="assertion-generation-hint">Claude is creating testable assertions for each story based on the approved plan.</p>
      </div>
    `
    document.body.appendChild(modal)

    // Subscribe to progress updates
    if (window.puffin?.state?.onAssertionGenerationProgress) {
      this._assertionProgressUnsubscribe = window.puffin.state.onAssertionGenerationProgress((data) => {
        const statusEl = modal.querySelector('.assertion-generation-status')
        if (statusEl && data.message) {
          statusEl.textContent = data.message
        }
      })
    }
  }

  /**
   * Hide the assertion generation modal
   */
  hideAssertionGenerationModal() {
    // Unsubscribe from progress updates
    if (this._assertionProgressUnsubscribe) {
      this._assertionProgressUnsubscribe()
      this._assertionProgressUnsubscribe = null
    }

    const modal = document.getElementById('assertion-generation-modal')
    if (modal) {
      modal.remove()
    }
  }

  /**
   * Extract questions from a plan text
   * @param {string} planText - The plan text to extract questions from
   * @returns {string[]} Array of questions found in the plan
   */
  extractQuestionsFromPlan(planText) {
    if (!planText) return []

    const questions = []
    const lines = planText.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      // Skip empty lines and headers
      if (!trimmed || trimmed.startsWith('#')) continue

      // Look for lines ending with ? (questions)
      if (trimmed.endsWith('?')) {
        // Clean up markdown list markers and numbering
        let question = trimmed
          .replace(/^[-*•]\s*/, '')           // Remove bullet points
          .replace(/^\d+\.\s*/, '')           // Remove numbering
          .replace(/\*\*/g, '')               // Remove bold markers
          .trim()
        if (question.length > 10) {  // Skip very short questions
          questions.push(question)
        }
      }
    }

    return questions
  }

  /**
   * Show modal for iterating on the sprint plan with clarifying answers
   */
  showPlanIterationModal() {
    const sprint = this.state.activeSprint
    if (!sprint) {
      this.showToast('No active sprint', 'warning')
      return
    }

    // Remove any existing modal
    this.hidePlanIterationModal()

    // Extract questions from the plan to prepopulate the textarea
    const questions = this.extractQuestionsFromPlan(sprint.plan)
    let prepopulatedText = ''
    if (questions.length > 0) {
      prepopulatedText = questions.map((q, i) => `${i + 1}. ${q}\n   Answer: `).join('\n\n')
    }

    const modal = document.createElement('div')
    modal.id = 'plan-iteration-modal'
    modal.className = 'plan-iteration-modal modal-overlay'
    modal.innerHTML = `
      <div class="plan-iteration-content modal-content">
        <div class="modal-header">
          <h3>Iterate on Sprint Plan</h3>
          <button class="modal-close-btn" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <p class="plan-iteration-hint">
            ${questions.length > 0
              ? `Found ${questions.length} question${questions.length > 1 ? 's' : ''} in the plan. Fill in your answers below, or add additional clarifications.`
              : 'Review the current plan and provide clarifying answers or additional requirements.'}
          </p>
          <div class="form-group">
            <label for="plan-clarifications">Your clarifications and answers:</label>
            <textarea
              id="plan-clarifications"
              class="plan-clarifications-input"
              rows="8"
              placeholder="Enter your clarifying answers, additional requirements, or questions here...">${this.escapeHtml(prepopulatedText)}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn secondary plan-iteration-cancel">Cancel</button>
          <button class="btn primary plan-iteration-submit">Resubmit Plan</button>
        </div>
      </div>
    `
    document.body.appendChild(modal)

    // Event handlers
    const closeBtn = modal.querySelector('.modal-close-btn')
    const cancelBtn = modal.querySelector('.plan-iteration-cancel')
    const submitBtn = modal.querySelector('.plan-iteration-submit')
    const textarea = modal.querySelector('#plan-clarifications')

    const closeModal = () => this.hidePlanIterationModal()

    closeBtn.addEventListener('click', closeModal)
    cancelBtn.addEventListener('click', closeModal)

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal()
    })

    // Submit handler
    submitBtn.addEventListener('click', () => {
      const clarifications = textarea.value.trim()
      if (!clarifications) {
        this.showToast('Please enter your clarifications before submitting', 'warning')
        return
      }

      // Close modal and trigger plan iteration
      closeModal()
      this.intents.iterateSprintPlan(clarifications)
      this.showToast('Resubmitting plan with your clarifications...', 'info')
    })

    // Focus the textarea
    setTimeout(() => textarea.focus(), 100)
  }

  /**
   * Hide the plan iteration modal
   */
  hidePlanIterationModal() {
    const modal = document.getElementById('plan-iteration-modal')
    if (modal) {
      modal.remove()
    }
  }

  /**
   * Show confirmation dialog asking if user wants to start a code review
   * @param {Object} sprint - The approved sprint with stories and plan
   */
  showCodeReviewConfirmation(sprint) {
    // Calculate assertion statistics across all sprint stories
    const assertionStats = this.calculateSprintAssertionStats(sprint)
    const { total, passed, failed, pending, notEvaluated } = assertionStats

    // Determine recommendation based on assertion results
    let recommendationClass = 'neutral'
    let recommendationText = 'Code review recommended for quality assurance.'

    if (failed > 0) {
      recommendationClass = 'warning'
      recommendationText = 'Code review strongly recommended - some assertions failed.'
    } else if (notEvaluated > 0) {
      recommendationClass = 'caution'
      recommendationText = 'Some assertions have not been evaluated yet.'
    } else if (passed === total && total > 0) {
      recommendationClass = 'success'
      recommendationText = 'All assertions passed. Code review optional but recommended.'
    }

    const modal = document.createElement('div')
    modal.id = 'code-review-confirmation-modal'
    modal.className = 'code-review-confirmation-modal'
    modal.innerHTML = `
      <div class="code-review-confirmation-content">
        <h3>Start Code Review?</h3>

        <div class="assertion-stats-summary">
          <h4>Inspection Assertions</h4>
          <div class="assertion-stats-grid">
            <div class="stat-item stat-total">
              <span class="stat-value">${total}</span>
              <span class="stat-label">Total</span>
            </div>
            <div class="stat-item stat-passed">
              <span class="stat-value">${passed}</span>
              <span class="stat-label">Passed</span>
            </div>
            <div class="stat-item stat-failed">
              <span class="stat-value">${failed}</span>
              <span class="stat-label">Failed</span>
            </div>
            <div class="stat-item stat-pending">
              <span class="stat-value">${notEvaluated}</span>
              <span class="stat-label">Not Evaluated</span>
            </div>
          </div>
          <p class="recommendation ${recommendationClass}">${recommendationText}</p>
        </div>

        <p class="code-review-hint">Claude will review the implementation for common mistakes and best practices.</p>
        <div class="code-review-actions">
          <button class="btn secondary" data-action="skip">Skip</button>
          <button class="btn primary" data-action="review">Start Review</button>
        </div>
      </div>
    `
    document.body.appendChild(modal)

    // Handle button clicks
    modal.addEventListener('click', async (e) => {
      const action = e.target.dataset.action
      if (!action) return

      modal.remove()

      if (action === 'review') {
        await this.startSprintCodeReview(sprint)
      }
    })
  }

  /**
   * Calculate assertion statistics across all stories in a sprint
   * @param {Object} sprint - The sprint with stories
   * @returns {Object} Stats: { total, passed, failed, pending, notEvaluated }
   */
  calculateSprintAssertionStats(sprint) {
    const stories = sprint.stories || []
    const backlogStories = this.state?.userStories || []

    let total = 0
    let passed = 0
    let failed = 0
    let pending = 0
    let notEvaluated = 0

    stories.forEach(story => {
      // Get assertions from sprint story or backlog
      const backlogStory = backlogStories.find(s => s.id === story.id)
      const assertions = story.inspectionAssertions || backlogStory?.inspectionAssertions || []
      const results = story.assertionResults || backlogStory?.assertionResults

      total += assertions.length

      if (!results || !results.results) {
        // No evaluation results - all are "not evaluated"
        notEvaluated += assertions.length
      } else {
        // Count by status from results
        const resultMap = new Map()
        results.results.forEach(r => resultMap.set(r.assertionId, r.status))

        assertions.forEach(assertion => {
          const status = resultMap.get(assertion.id)
          if (status === 'passed') {
            passed++
          } else if (status === 'failed' || status === 'error') {
            failed++
          } else {
            pending++
          }
        })
      }
    })

    return { total, passed, failed, pending, notEvaluated }
  }

  /**
   * Start a code review for the sprint on the Code Reviews branch
   * @param {Object} sprint - The sprint with stories and plan
   */
  async startSprintCodeReview(sprint) {
    const stories = sprint.stories || []
    const plan = sprint.plan || ''

    // Build the code review prompt
    const storyContext = stories.map((s, i) => {
      const criteria = (s.acceptanceCriteria || []).map((c, j) => `   ${j + 1}. ${c}`).join('\n')
      return `### Story ${i + 1}: ${s.title}
${s.description}
${criteria ? `\n**Acceptance Criteria:**\n${criteria}` : ''}`
    }).join('\n\n')

    const reviewPrompt = `## Code Review Request: Sprint Implementation

Please conduct a thorough code review of the implementation for the following user stories. Focus on identifying common implementation mistakes, potential bugs, and areas for improvement.

${storyContext}

---

**Implementation Plan Reference:**
${plan}

---

**Review Focus Areas:**

1. **Logic Errors**: Look for off-by-one errors, incorrect conditionals, missing edge cases
2. **Error Handling**: Check for proper error handling and graceful degradation
3. **Security**: Identify potential security vulnerabilities (XSS, injection, etc.)
4. **Performance**: Flag any obvious performance issues or inefficiencies
5. **Code Quality**: Check for code duplication, unclear naming, missing comments
6. **Best Practices**: Verify adherence to project patterns and conventions
7. **Testing Gaps**: Identify areas that may need additional test coverage

Please provide specific file locations and line numbers where issues are found, along with recommended fixes.`

    // Submit to Code Reviews branch
    const branchId = 'code-reviews'

    // Ensure the branch exists
    if (!this.state.history?.raw?.branches?.[branchId]) {
      // Create the branch if it doesn't exist
      this.intents.createBranch({
        id: branchId,
        name: 'Code Reviews',
        description: 'Code review threads for sprint implementations'
      })
    }

    // Switch to the code reviews branch
    this.intents.selectBranch(branchId)

    // Submit the prompt to SAM (adds to history)
    this.intents.submitPrompt({
      branchId,
      content: reviewPrompt,
      parentId: null
    })

    // Switch view to prompt if not already there
    if (this.state.currentView !== 'prompt') {
      this.intents.switchView('prompt')
    }

    // Actually submit to Claude CLI
    if (window.puffin?.claude) {
      // Check if a CLI process is already running
      const isRunning = await window.puffin.claude.isRunning()
      if (isRunning) {
        console.error('[CODE-REVIEW] Cannot start review: CLI process already running')
        this.showToast({
          type: 'error',
          title: 'Process Already Running',
          message: 'Please wait for the current process to complete',
          duration: 5000
        })
        return
      }

      window.puffin.claude.submit({
        prompt: reviewPrompt,
        branchId,
        sessionId: null, // New session for code review
        project: this.state.config ? {
          name: this.state.config.name,
          description: this.state.config.description
        } : null
      })

      this.showToast('Code review started on Code Reviews branch', 'info')
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

        // Initialize plugin styles (load before views to prevent flash of unstyled content)
        await this.initPluginStyles()

        // Initialize plugin component loader (loads renderer components for active plugins)
        await this.initPluginComponentLoader()

        // Initialize plugin sidebar view manager
        await this.initPluginSidebarManager()
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
    this.modalManager = new ModalManager(
      this.intents,
      this.showToast.bind(this),
      this.showCodeReviewConfirmation.bind(this)
    )
    this.statePersistence = new StatePersistence(
      () => this.state,
      this.intents,
      this.showToast.bind(this)
    )
    this.activityTracker = new ActivityTracker(this.intents, () => this.state)

    // Initialize plugin view container
    this.pluginViewContainer.init()

    // Initialize style injector
    this.styleInjector.init()
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
      'rerunPrompt', 'clearRerunRequest',
      'requestContinue', 'clearContinueRequest',
      'selectBranch', 'createBranch', 'deleteBranch', 'reorderBranches', 'updateBranchSettings', 'selectPrompt',
      'toggleThreadExpanded', 'expandThreadToEnd', 'updateThreadSearchQuery', 'markThreadComplete', 'unmarkThreadComplete',
      'addUserStory', 'updateUserStory', 'deleteUserStory', 'loadUserStories', 'loadSprintHistory',
      'setSprintFilter', 'clearSprintFilter',
      'deriveUserStories', 'receiveDerivedStories', 'markStoryReady', 'unmarkStoryReady',
      'updateDerivedStory', 'deleteDerivedStory', 'requestStoryChanges',
      'addStoriesToBacklog', 'cancelStoryReview', 'storyDerivationError',
      // Implementation journey actions
      'createImplementationJourney', 'addImplementationInput', 'updateImplementationJourney', 'completeImplementationJourney',
      'switchView', 'toggleSidebar', 'showModal', 'hideModal',
      'toolStart', 'toolEnd', 'clearActivity',
      'loadDeveloperProfile', 'loadGithubRepositories', 'loadGithubActivity',
      // Handoff actions
      'showHandoffReview', 'updateHandoffSummary', 'completeHandoff', 'cancelHandoff', 'deleteHandoff',
      'setBranchHandoffContext', 'clearBranchHandoffContext',
      // Sprint actions
      'createSprint', 'startSprintPlanning', 'approvePlan', 'selectImplementationMode', 'startAutomatedImplementation', 'setSprintPlan', 'iterateSprintPlan',
      'clearSprint', 'clearSprintWithDetails', 'showSprintCloseModal', 'clearPendingSprintPlanning', 'deleteSprint',
      'startSprintStoryImplementation', 'clearPendingStoryImplementation', 'completeStoryBranch',
      'updateSprintStoryStatus', 'updateSprintStoryAssertions', 'clearSprintError', 'updateStoryAssertionResults', 'toggleCriteriaCompletion',
      // Acceptance criteria validation actions
      'updateCriteriaValidation', 'updateStoryCriteriaValidation', 'startCriteriaValidation', 'completeCriteriaValidation',
      // Orchestration actions
      'orchestrationStoryStarted', 'orchestrationStoryCompleted', 'updateOrchestrationPhase',
      'pauseOrchestration', 'resumeOrchestration', 'stopOrchestration',
      // Code review actions
      'startCodeReview', 'addCodeReviewFinding', 'setCodeReviewFindings', 'completeCodeReview', 'updateFindingStatus',
      // Bug fix phase actions
      'startBugFixPhase', 'startFixingFinding', 'completeFixingFinding', 'completeBugFixPhase',
      // Sprint completion statistics
      'setSprintCompletionStats', 'toggleSprintSummary',
      // Stuck detection actions
      'recordIterationOutput', 'resolveStuckState', 'resetStuckDetection',
      // Debug actions
      'storeDebugPrompt', 'clearDebugPrompt', 'setDebugMode',
      // Active implementation story
      'clearActiveImplementationStory'
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
          ['LOAD_SPRINT_HISTORY', actions.loadSprintHistory],
          ['SET_SPRINT_FILTER', actions.setSprintFilter],
          ['CLEAR_SPRINT_FILTER', actions.clearSprintFilter],

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
          ['SET_BRANCH_HANDOFF_CONTEXT', actions.setBranchHandoffContext],
          ['CLEAR_BRANCH_HANDOFF_CONTEXT', actions.clearBranchHandoffContext],

          // Sprint actions
          ['CREATE_SPRINT', actions.createSprint],
          ['START_SPRINT_PLANNING', actions.startSprintPlanning],
          ['APPROVE_PLAN', actions.approvePlan],
          ['SELECT_IMPLEMENTATION_MODE', actions.selectImplementationMode],
          ['START_AUTOMATED_IMPLEMENTATION', actions.startAutomatedImplementation],
          ['SET_SPRINT_PLAN', actions.setSprintPlan],
          ['ITERATE_SPRINT_PLAN', actions.iterateSprintPlan],
          ['CLEAR_SPRINT', actions.clearSprint],
          ['CLEAR_SPRINT_WITH_DETAILS', actions.clearSprintWithDetails],
          ['SHOW_SPRINT_CLOSE_MODAL', actions.showSprintCloseModal],
          ['CLEAR_PENDING_SPRINT_PLANNING', actions.clearPendingSprintPlanning],
          ['DELETE_SPRINT', actions.deleteSprint],
          ['START_SPRINT_STORY_IMPLEMENTATION', actions.startSprintStoryImplementation],
          ['CLEAR_PENDING_STORY_IMPLEMENTATION', actions.clearPendingStoryImplementation],
          ['COMPLETE_STORY_BRANCH', actions.completeStoryBranch],
          ['UPDATE_SPRINT_STORY_STATUS', actions.updateSprintStoryStatus],
          ['UPDATE_SPRINT_STORY_ASSERTIONS', actions.updateSprintStoryAssertions],
          ['CLEAR_SPRINT_ERROR', actions.clearSprintError],
          ['UPDATE_STORY_ASSERTION_RESULTS', actions.updateStoryAssertionResults],
          ['TOGGLE_CRITERIA_COMPLETION', actions.toggleCriteriaCompletion],
          // Acceptance criteria validation actions
          ['UPDATE_CRITERIA_VALIDATION', actions.updateCriteriaValidation],
          ['UPDATE_STORY_CRITERIA_VALIDATION', actions.updateStoryCriteriaValidation],
          ['START_CRITERIA_VALIDATION', actions.startCriteriaValidation],
          ['COMPLETE_CRITERIA_VALIDATION', actions.completeCriteriaValidation],
          // Stuck detection actions
          ['RECORD_ITERATION_OUTPUT', actions.recordIterationOutput],
          ['RESOLVE_STUCK_STATE', actions.resolveStuckState],
          ['RESET_STUCK_DETECTION', actions.resetStuckDetection],
          // Debug actions
          ['STORE_DEBUG_PROMPT', actions.storeDebugPrompt],
          ['CLEAR_DEBUG_PROMPT', actions.clearDebugPrompt],
          ['SET_DEBUG_MODE', actions.setDebugMode],
          // Active implementation story
          ['CLEAR_ACTIVE_IMPLEMENTATION_STORY', actions.clearActiveImplementationStory],
          // Orchestration actions
          ['ORCHESTRATION_STORY_STARTED', actions.orchestrationStoryStarted],
          ['ORCHESTRATION_STORY_COMPLETED', actions.orchestrationStoryCompleted],
          ['UPDATE_ORCHESTRATION_PHASE', actions.updateOrchestrationPhase],
          ['PAUSE_ORCHESTRATION', actions.pauseOrchestration],
          ['RESUME_ORCHESTRATION', actions.resumeOrchestration],
          ['STOP_ORCHESTRATION', actions.stopOrchestration],
          // Code review actions
          ['START_CODE_REVIEW', actions.startCodeReview],
          ['ADD_CODE_REVIEW_FINDING', actions.addCodeReviewFinding],
          ['SET_CODE_REVIEW_FINDINGS', actions.setCodeReviewFindings],
          ['COMPLETE_CODE_REVIEW', actions.completeCodeReview],
          ['UPDATE_FINDING_STATUS', actions.updateFindingStatus],
          // Bug fix phase actions
          ['START_BUG_FIX_PHASE', actions.startBugFixPhase],
          ['START_FIXING_FINDING', actions.startFixingFinding],
          ['COMPLETE_FIXING_FINDING', actions.completeFixingFinding],
          ['COMPLETE_BUG_FIX_PHASE', actions.completeBugFixPhase],
          // Sprint completion statistics actions
          ['SET_SPRINT_COMPLETION_STATS', actions.setSprintCompletionStats],
          ['TOGGLE_SPRINT_SUMMARY', actions.toggleSprintSummary]
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

    // Orchestration controls - using event delegation to prevent memory leaks
    this.setupOrchestrationDelegation()
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
   * Update the iteration counter display
   *
   * @param {number} current - Current iteration number
   * @param {number} max - Maximum iterations
   */
  updateIterationCounter(current, max) {
    const counterEl = document.getElementById('iteration-counter')
    const currentEl = document.getElementById('iteration-current')
    const maxEl = document.getElementById('iteration-max')

    if (counterEl && currentEl && maxEl) {
      currentEl.textContent = current
      maxEl.textContent = max
      counterEl.classList.remove('hidden')
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
    const unsubComplete = window.puffin.claude.onComplete((response) => {
      console.log('[SAM-DEBUG] app.js onComplete received:', {
        contentLength: response?.content?.length || 0,
        turns: response?.turns,
        exitCode: response?.exitCode,
        sessionId: response?.sessionId
      })

      const filesModified = this.activityTracker.getFilesModified()
      console.log('[SAM-DEBUG] filesModified at completion:', filesModified.length, 'files')

      try {
        this.intents.completeResponse(response, filesModified)
      } catch (err) {
        console.error('[SAM-ERROR] completeResponse failed:', err)
      }

      // Capture sprint plan content if we're in planning mode
      try {
        const currentState = this.state
        const sprintStatus = currentState?.activeSprint?.status
        const hasContent = !!response?.content
        console.log('[SPRINT] Plan capture check - status:', sprintStatus, 'hasContent:', hasContent, 'contentLength:', response?.content?.length || 0)

        if (sprintStatus === 'planning' && hasContent) {
          console.log('[SPRINT] Capturing plan content from Claude response, length:', response.content.length)
          this.intents.setSprintPlan(response.content)
        } else if (sprintStatus && sprintStatus !== 'planning') {
          console.log('[SPRINT] Skipping plan capture - sprint status is:', sprintStatus)
        }
      } catch (err) {
        console.error('[SAM-ERROR] setSprintPlan failed:', err)
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

    // Story status sync - automatic UI refresh when status changes atomically
    // This listener handles the event emitted after atomic sprint/backlog sync
    if (window.puffin.state.onStoryStatusSynced) {
      const unsubStatusSync = window.puffin.state.onStoryStatusSynced((data) => {
        console.log('[STATUS-SYNC] Story status synced:', data.storyId, '->', data.status)

        // Update the specific story in userStories via SAM action
        if (data.story) {
          this.intents.updateUserStory(data.storyId, data.story)
        }

        // Update sprint story status via SAM action (this updates model.activeSprint.storyProgress)
        if (data.sprint && this.state?.activeSprint) {
          this.intents.updateSprintStoryStatus(data.storyId, data.status)
        }

        // Show toast for user feedback
        const statusLabel = data.status === 'completed' ? 'complete' : 'in progress'
        const storyTitle = data.story?.title || 'Story'
        this.showToast({
          type: 'success',
          title: storyTitle,
          message: `Marked as ${statusLabel}`,
          duration: 2000
        })
      })
      this.claudeListeners.push(unsubStatusSync)
    }
  }

  /**
   * Handle state changes
   */
  onStateChange({ state, changed }) {
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
      this._lastCurrentView = currentView
    }

    this.updateNavigation(state)
    this.updateSidebar(state)
    this.updateViews(state)
    this.modalManager.update(state)
    this.updateHeader(state)
    this.updateSprintHeader(state)
    this.updateMetadataPanel(state)
    this.handleSprintError(state)
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

    // Handle pending sprint planning - submit to Claude
    // Use a guard to prevent re-entry since handleSprintPlanning is async
    if (state._pendingSprintPlanning && !this._handlingSprintPlanning) {
      this._handlingSprintPlanning = true
      this.handleSprintPlanning(state._pendingSprintPlanning, state)
        .finally(() => {
          this._handlingSprintPlanning = false
        })
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

    // Only update built-in nav buttons (not plugin nav buttons which manage their own state)
    document.querySelectorAll('.nav-btn:not(.plugin-nav-btn)').forEach(btn => {
      const view = btn.dataset.view
      // If a plugin view is active, don't mark any built-in nav as active
      btn.classList.toggle('active', !pluginViewActive && view === state.ui.currentView)
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
    const iterateBtn = document.getElementById('sprint-iterate-btn')
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
      if (iterateBtn) iterateBtn.classList.add('hidden')
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
      // Show branch buttons after plan is approved (status becomes 'in-progress' or 'implementing')
      const showBranchButtons = sprint.status === 'in-progress' || sprint.status === 'implementing'
      const storyProgress = sprint.storyProgress || {}
      const storiesWithProgress = sprintProgress?.stories || []

      // Calculate story-based progress - check multiple sources for completion
      const completedStoryCount = sprint.stories.filter(sprintStory => {
        const backlogStory = backlogStories.find(bs => bs.id === sprintStory.id)
        const progressStatus = storyProgress[sprintStory.id]?.status
        // Check all sources: backlog status, sprint story status, or progress status
        const isComplete = backlogStory?.status === 'completed' ||
                          sprintStory.status === 'completed' ||
                          progressStatus === 'completed'
        return isComplete
      }).length
      const totalStoryCount = sprint.stories.length
      const storyCompletionPercent = totalStoryCount > 0 ? Math.round((completedStoryCount / totalStoryCount) * 100) : 0

      // Capture which criteria sections are currently expanded before re-rendering
      const expandedSections = new Set()
      storiesContainer.querySelectorAll('.story-criteria-section.expanded').forEach(section => {
        const storyId = section.dataset.storyId
        if (storyId) expandedSections.add(storyId)
      })

      // Get the active implementation story ID for highlighting
      const activeImplementationStoryId = state.activeImplementationStory?.id

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

        // Check if this is the currently active implementation story
        const isActiveImplementation = story.id === activeImplementationStoryId
        const implementingClass = isActiveImplementation ? 'story-implementing' : ''

        // Get acceptance criteria with completion state and validation status
        const criteriaProgress = progress?.criteriaProgress || {}
        const criteriaList = computedStory?.acceptanceCriteria || []
        const totalCriteria = criteriaList.length
        const completedCriteria = criteriaList.filter(c => c.checked).length
        const criteriaPercentage = totalCriteria > 0 ? Math.round((completedCriteria / totalCriteria) * 100) : 0

        // Get validation status from story progress
        const storyValidationStatus = progress?.validationStatus || null
        const validationSummary = progress?.validationSummary || null
        const isValidating = storyValidationStatus === 'validating'
        const validationComplete = storyValidationStatus === 'completed'

        // Count validation results
        const passedCriteria = criteriaList.filter((c, idx) => criteriaProgress[idx]?.validationStatus === 'passed').length
        const failedCriteria = criteriaList.filter((c, idx) => criteriaProgress[idx]?.validationStatus === 'failed').length

        // Get inspection assertions (from sprint story or backlog story)
        const assertions = story.inspectionAssertions || backlogStory?.inspectionAssertions || []
        const assertionResults = story.assertionResults || backlogStory?.assertionResults
        const hasAssertions = assertions.length > 0

        // Check if this section was expanded before re-render
        const isExpanded = expandedSections.has(story.id)

        // Get branch assignment for this story (if available)
        const branchAssignment = sprint.branchAssignments?.[story.id]
        const branchBadge = branchAssignment ? this.renderBranchBadge(branchAssignment) : ''

        // Get orchestration state for this story (if in automated mode)
        const orchestration = sprint.orchestration
        const isOrchestrating = orchestration?.status === 'running' || orchestration?.status === 'paused'
        const storySession = orchestration?.storySessions?.[story.id]
        const isOrchestrationCurrent = orchestration?.currentStoryId === story.id
        const isOrchestrationCompleted = orchestration?.completedStories?.includes(story.id)
        const orchestrationOrder = sprint.implementationOrder?.indexOf(story.id)
        const hasOrchestrationOrder = orchestrationOrder !== undefined && orchestrationOrder !== -1

        // Session indicator for orchestration mode
        const sessionIndicator = this.renderSessionIndicator(storySession, isOrchestrationCurrent, isOrchestrationCompleted, hasOrchestrationOrder ? orchestrationOrder + 1 : null)

        // Combine orchestration and regular implementation states
        const isCurrentlyImplementing = isActiveImplementation || isOrchestrationCurrent
        const implementingClassFinal = isCurrentlyImplementing ? 'story-implementing' : ''
        const orchestrationClass = isOrchestrationCompleted ? 'orchestration-completed' : (isOrchestrationCurrent ? 'orchestration-current' : '')

        return `
          <div class="sprint-story-card ${storyStatusClass} ${implementingClassFinal} ${orchestrationClass}" data-story-id="${story.id}">
            ${sessionIndicator}
            <div class="story-header-with-indicator">
              <button class="story-complete-btn ${isCompleted ? 'completed' : ''}"
                      data-story-id="${story.id}"
                      title="${isCompleted ? 'Mark as incomplete' : 'Mark as complete'}">
                <span class="complete-icon">${isCompleted ? '✓' : '○'}</span>
              </button>
              <h4>${this.escapeHtml(story.title)}</h4>
              ${branchBadge}
              ${isCurrentlyImplementing ? '<span class="implementing-badge">Implementing...</span>' : ''}
            </div>
            <p>${this.escapeHtml(story.description || '')}</p>
            ${totalCriteria > 0 ? `
              <div class="story-criteria-section${isExpanded ? ' expanded' : ''}${isValidating ? ' validating' : ''}${validationComplete ? ' validation-complete' : ''}" data-story-id="${story.id}">
                <button class="criteria-toggle-btn" data-story-id="${story.id}" title="Toggle acceptance criteria">
                  <span class="criteria-toggle-icon">▶</span>
                  <span class="criteria-label">Acceptance Criteria</span>
                  ${isValidating ? `
                    <span class="criteria-validating-badge" title="Validating acceptance criteria...">
                      <span class="validating-spinner"></span>
                      <span class="validating-text">Validating...</span>
                    </span>
                  ` : validationComplete ? `
                    <span class="criteria-validation-summary ${failedCriteria > 0 ? 'has-failures' : 'all-passed'}" title="${passedCriteria} passed, ${failedCriteria} failed">
                      <span class="validation-passed">${passedCriteria} passed</span>
                      ${failedCriteria > 0 ? `<span class="validation-failed">${failedCriteria} failed</span>` : ''}
                    </span>
                  ` : `
                    <span class="criteria-count">${completedCriteria}/${totalCriteria}</span>
                  `}
                </button>
                <ul class="criteria-checklist${isExpanded ? ' expanded' : ''}">
                  ${criteriaList.map((c, idx) => {
                    const criteriaState = criteriaProgress[c.index] || {}
                    const validationStatus = criteriaState.validationStatus
                    const validationReason = criteriaState.validationReason
                    const statusClass = validationStatus === 'passed' ? 'validation-passed' :
                                        validationStatus === 'failed' ? 'validation-failed' : ''
                    return `
                    <li class="criteria-item ${c.checked ? 'checked' : ''} ${statusClass}"
                        ${validationReason ? `data-validation-reason="${this.escapeHtml(validationReason)}"` : ''}>
                      <label class="criteria-checkbox-label">
                        <input type="checkbox"
                               class="criteria-checkbox"
                               data-story-id="${story.id}"
                               data-criteria-index="${c.index}"
                               ${c.checked ? 'checked' : ''}>
                        <span class="criteria-text">${this.escapeHtml(c.text)}</span>
                        ${validationStatus ? `
                          <span class="criteria-validation-indicator ${validationStatus}"
                                title="${validationStatus === 'passed' ? 'Validated: Passed' : validationStatus === 'failed' ? 'Validated: Failed' + (validationReason ? ' - ' + this.escapeHtml(validationReason) : '') : 'Pending validation'}"
                                aria-label="Validation status: ${validationStatus}">
                            ${validationStatus === 'passed' ? '✓' : validationStatus === 'failed' ? '✗' : '○'}
                          </span>
                        ` : ''}
                      </label>
                      ${validationStatus === 'failed' && validationReason ? `
                        <div class="criteria-failure-reason" role="alert">
                          <span class="failure-icon">!</span>
                          <span class="failure-text">${this.escapeHtml(validationReason)}</span>
                        </div>
                      ` : ''}
                    </li>
                  `}).join('')}
                </ul>
              </div>
            ` : ''}
            ${hasAssertions ? this.renderSprintAssertions(story.id, assertions, assertionResults) : ''}
            ${showBranchButtons ? this.renderStoryBranchButtons(story, progress, branchAssignment) : ''}
            ${isActiveImplementation ? `
              <div class="cancel-implementation-section">
                <button class="cancel-implementation-btn" data-story-id="${story.id}" title="Cancel implementation">
                  <span class="cancel-icon">✕</span>
                  <span class="cancel-label">Cancel Implementation</span>
                </button>
              </div>
            ` : ''}
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

      // Render orchestration controls if in automated mode
      const orchestrationControlsContainer = document.getElementById('orchestration-controls-container')
      if (orchestrationControlsContainer) {
        const orchestration = sprint.orchestration
        if (orchestration && sprint.implementationMode === 'automated') {
          orchestrationControlsContainer.innerHTML = this.renderOrchestrationControls(orchestration)
          orchestrationControlsContainer.classList.remove('hidden')

          // Bind orchestration control buttons
          this.bindOrchestrationControls()
        } else {
          orchestrationControlsContainer.innerHTML = ''
          orchestrationControlsContainer.classList.add('hidden')
        }
      }

      // Render code review panel if in review phase or has code review data
      const codeReviewContainer = document.getElementById('code-review-container')
      if (codeReviewContainer) {
        const orchestration = sprint.orchestration
        const codeReview = sprint.codeReview
        const bugFix = sprint.bugFix
        const inReviewPhase = orchestration?.phase === 'review' || orchestration?.phase === 'bugfix'

        if (codeReview || inReviewPhase) {
          codeReviewContainer.innerHTML = this.renderCodeReviewPanel(codeReview, bugFix, orchestration?.phase)
          codeReviewContainer.classList.remove('hidden')

          // Bind code review panel event handlers
          this.bindCodeReviewPanel()
        } else {
          codeReviewContainer.innerHTML = ''
          codeReviewContainer.classList.add('hidden')
        }
      }

      // Render sprint completion summary if orchestration is complete or has stats
      const sprintSummaryContainer = document.getElementById('sprint-summary-container')
      if (sprintSummaryContainer) {
        const orchestration = sprint.orchestration
        const completionStats = sprint.completionStats
        const isComplete = orchestration?.status === 'complete' || orchestration?.phase === 'complete'

        if (completionStats || isComplete) {
          sprintSummaryContainer.innerHTML = this.renderSprintCompletionSummary(
            completionStats,
            sprint.summaryExpanded || false
          )
          sprintSummaryContainer.classList.remove('hidden')

          // Bind sprint summary toggle
          this.bindSprintSummaryToggle()
        } else {
          sprintSummaryContainer.innerHTML = ''
          sprintSummaryContainer.classList.add('hidden')
        }
      }

    }

    // Update action buttons based on status
    // Plan button: visible when sprint is 'created' (ready to plan)
    // Iterate/Approve buttons: visible only when sprint status is 'planned' AND plan not yet approved
    // Once planApprovedAt is set, implementation mode was selected - don't show approve again
    const hasStories = sprint.stories && sprint.stories.length > 0
    const canPlan = sprint.status === 'created'
    const canApprove = hasStories && sprint.status === 'planned' && !sprint.planApprovedAt
    // Show start implementation button when plan is approved but sprint not yet in-progress
    // This handles cases where:
    // - App was closed after approving but before selecting mode
    // - Sprint status is stuck at 'planning' but planApprovedAt was set
    const isNotStarted = sprint.status !== 'in-progress' && sprint.status !== 'completed' && sprint.status !== 'closed'
    const canStartImplementation = sprint.planApprovedAt && !sprint.implementationMode && isNotStarted

    console.log('[SPRINT-BUTTONS] status:', sprint.status, 'hasStories:', hasStories, 'canPlan:', canPlan, 'canApprove:', canApprove, 'planApprovedAt:', sprint.planApprovedAt, 'canStartImplementation:', canStartImplementation)

    if (planBtn) {
      planBtn.classList.toggle('hidden', !canPlan)
    }
    if (iterateBtn) {
      iterateBtn.classList.toggle('hidden', !canApprove)
    }
    if (approveBtn) {
      // Show approve button OR repurpose it as "Start Implementation" when plan is approved
      if (canStartImplementation) {
        approveBtn.textContent = 'Start Implementation'
        approveBtn.classList.remove('hidden')
      } else {
        approveBtn.textContent = 'Approve Plan'
        approveBtn.classList.toggle('hidden', !canApprove)
      }
    }

    // Bind event handlers (only once)
    if (!sprintContextPanel.dataset.bound) {
      sprintContextPanel.dataset.bound = 'true'

      // Close button - shows modal for title/description capture
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          const sprint = this.state.activeSprint
          const userStories = this.state.userStories || []

          // Pre-fetch git status and commit message asynchronously (non-blocking)
          // The modal will display the results when ready
          if (this.modalManager) {
            this.modalManager.preCheckGitStatus()
            this.modalManager.preGenerateSprintCommitMessage(sprint, userStories)
          }

          // Show modal immediately - data will be ready or loading
          this.intents.showModal('sprint-close', { sprint })
        })
      }

      // Plan button
      if (planBtn) {
        planBtn.addEventListener('click', () => {
          this.intents.startSprintPlanning()
        })
      }

      // Iterate button - shows modal to refine the plan with clarifications
      if (iterateBtn) {
        iterateBtn.addEventListener('click', () => {
          this.showPlanIterationModal()
        })
      }

      // Approve button (also handles "Start Implementation" after restart)
      if (approveBtn) {
        approveBtn.addEventListener('click', async () => {
          // Get the current sprint state before approving
          const sprint = this.state.activeSprint
          if (!sprint || !sprint.stories || sprint.stories.length === 0) {
            this.showToast('No stories in sprint to approve.', 'warning')
            return
          }

          // Check if this is a "Start Implementation" click (plan already approved after restart)
          if (sprint.planApprovedAt && !sprint.implementationMode) {
            console.log('[SPRINT] Start Implementation clicked - showing mode selection modal')
            this.intents.showModal({ type: 'implementation-mode-selection' })
            return
          }

          // Log plan state for debugging
          console.log('[SPRINT] Approve clicked - plan:', sprint.plan ? `${sprint.plan.length} chars` : 'null')

          // Warn if no plan exists (user can still proceed)
          if (!sprint.plan) {
            console.log('[SPRINT] No plan captured - assertions will be generated without implementation context')
          }

          // Approve the plan (updates status to in-progress)
          this.intents.approvePlan()

          // Show assertion generation modal
          this.showAssertionGenerationModal()

          try {
            // Generate assertions for all stories (plan is optional)
            const result = await window.puffin.state.generateSprintAssertions(
              sprint.stories,
              sprint.plan || ''  // Pass empty string if plan is null
            )

            this.hideAssertionGenerationModal()

            if (result.success) {
              // Update model state with new assertions via SAM actions
              for (const [storyId, assertions] of Object.entries(result.assertions)) {
                // Dispatch action to update model.activeSprint.stories (for sprint UI)
                this.intents.updateSprintStoryAssertions(storyId, assertions)
                // Dispatch action to update model.userStories (for backlog UI)
                this.intents.updateUserStory(storyId, { inspectionAssertions: assertions })
              }

              // Fallback: Refresh stories from database to ensure UI is in sync
              // This handles cases where the in-memory update might fail
              try {
                const storiesResult = await window.puffin.state.getUserStories()
                if (storiesResult.success && Array.isArray(storiesResult.stories) && storiesResult.stories.length > 0) {
                  console.log('[SPRINT] Refreshing stories from database after assertion generation:', storiesResult.stories.length, 'stories')
                  this.intents.loadUserStories(storiesResult.stories)
                }
              } catch (refreshError) {
                console.warn('[SPRINT] Failed to refresh stories from database:', refreshError)
              }

              this.showToast(
                `Plan approved! Generated ${result.totalAssertions} inspection assertions.`,
                'success'
              )

              // Note: Code review happens after sprint close, not here
            } else {
              this.showToast(
                `Plan approved, but assertion generation failed: ${result.error}`,
                'warning'
              )
            }
          } catch (error) {
            this.hideAssertionGenerationModal()
            console.error('[SPRINT] Assertion generation error:', error)
            this.showToast(
              `Plan approved, but assertion generation failed: ${error.message}`,
              'warning'
            )
          }
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
          return
        }

        // Cancel implementation button clicks (event delegation)
        const cancelBtn = e.target.closest('.cancel-implementation-btn')
        if (cancelBtn) {
          const storyId = cancelBtn.dataset.storyId
          const storyCard = cancelBtn.closest('.sprint-story-card')
          const storyTitle = storyCard?.querySelector('h4')?.textContent || 'Story'

          console.log('[SPRINT] Cancelling implementation:', { storyId, storyTitle })

          // Clear the active implementation story
          this.intents.clearActiveImplementationStory()

          this.showToast({
            type: 'info',
            title: 'Implementation Cancelled',
            message: `"${storyTitle}" implementation cancelled.`,
            duration: 4000
          })
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

      // Assertions toggle button clicks (expand/collapse)
      sprintContextPanel.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.assertions-toggle-btn')
        if (toggleBtn) {
          const section = toggleBtn.closest('.story-assertions-section')
          const list = section?.querySelector('.assertions-list')
          if (section && list) {
            section.classList.toggle('expanded')
            list.classList.toggle('expanded')
          }
        }
      })

      // Listen for assertion evaluation completion to update model and refresh UI
      if (window.puffin?.state?.onAssertionEvaluationComplete) {
        window.puffin.state.onAssertionEvaluationComplete((data) => {
          const { storyId, results } = data
          console.log('[SPRINT] Assertion evaluation complete for story:', storyId)
          // Update the model with assertion results (both backlog and sprint stories)
          // SAM render cycle will automatically refresh the sprint panel
          this.intents.updateStoryAssertionResults(storyId, results)
        })
      }

      // Listen for assertion evaluation progress to show spinner
      if (window.puffin?.state?.onAssertionEvaluationProgress) {
        window.puffin.state.onAssertionEvaluationProgress((data) => {
          const { storyId, current, total } = data
          const section = sprintContextPanel.querySelector(
            `.story-assertions-section[data-story-id="${storyId}"]`
          )
          if (section) {
            const summary = section.querySelector('.assertions-summary')
            if (summary) {
              summary.textContent = `Evaluating ${current}/${total}...`
              summary.classList.add('evaluating')
            }
          }
        })
      }
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
   * Render a branch assignment badge for a user story
   * @param {string} branch - Branch type: 'ui', 'backend', 'fullstack', 'plugin'
   * @returns {string} HTML for the branch badge
   */
  renderBranchBadge(branch) {
    const branchConfig = {
      ui: { label: 'UI', icon: '🎨', className: 'branch-ui' },
      backend: { label: 'Backend', icon: '⚙️', className: 'branch-backend' },
      fullstack: { label: 'Full Stack', icon: '🔗', className: 'branch-fullstack' },
      plugin: { label: 'Plugin', icon: '📦', className: 'branch-plugin' }
    }

    const config = branchConfig[branch?.toLowerCase()]
    if (!config) return ''

    return `<span class="branch-badge ${config.className}"
                  title="Assigned to ${config.label} branch"
                  aria-label="Branch: ${config.label}">
              <span class="branch-icon" aria-hidden="true">${config.icon}</span>
              <span class="branch-label">${config.label}</span>
            </span>`
  }

  /**
   * Render session indicator for orchestration mode
   * Shows the session boundary and status for a story in automated implementation
   * @param {Object} storySession - Session tracking data for this story
   * @param {boolean} isCurrent - Whether this is the currently executing story
   * @param {boolean} isCompleted - Whether this story's session has completed
   * @param {number|null} orderNumber - The order number in implementation sequence
   * @returns {string} HTML for the session indicator
   */
  renderSessionIndicator(storySession, isCurrent, isCompleted, orderNumber) {
    // Only show indicator if there's orchestration state
    if (!storySession && !isCurrent && !isCompleted && orderNumber === null) {
      return ''
    }

    let statusIcon = ''
    let statusText = ''
    let statusClass = ''

    if (isCompleted && storySession?.sessionId) {
      statusIcon = '✓'
      statusText = `Session completed`
      statusClass = 'session-completed'
    } else if (isCurrent) {
      statusIcon = '◐'
      statusText = 'Session in progress...'
      statusClass = 'session-active'
    } else if (orderNumber !== null) {
      statusIcon = orderNumber.toString()
      statusText = `Queued (step ${orderNumber})`
      statusClass = 'session-pending'
    } else {
      return ''
    }

    return `
      <div class="session-indicator ${statusClass}"
           role="status"
           aria-label="${statusText}">
        <span class="session-indicator-icon" aria-hidden="true">${statusIcon}</span>
        <span class="session-indicator-label">${statusText}</span>
      </div>
    `
  }

  /**
   * Render orchestration controls (pause/resume/stop) for the sprint panel
   * @param {Object} orchestration - Current orchestration state
   * @returns {string} HTML for orchestration controls
   */
  renderOrchestrationControls(orchestration) {
    if (!orchestration) return ''

    const status = orchestration.status
    const phase = orchestration.phase || 'implementation'
    const completedCount = orchestration.completedStories?.length || 0
    const totalCount = orchestration.storyOrder?.length || 0

    // Phase display
    const phaseLabels = {
      implementation: 'Implementing',
      review: 'Code Review',
      bugfix: 'Bug Fixes',
      complete: 'Complete'
    }
    const phaseLabel = phaseLabels[phase] || phase

    if (status === 'running') {
      return `
        <div class="orchestration-controls" role="group" aria-label="Orchestration controls">
          <div class="orchestration-status">
            <span class="orchestration-status-icon running" aria-hidden="true">●</span>
            <span class="orchestration-status-text">${phaseLabel}</span>
            <span class="orchestration-progress">${completedCount}/${totalCount}</span>
          </div>
          <div class="orchestration-buttons">
            <button class="btn-orchestration pause" id="orchestration-pause-btn"
                    title="Pause after current story completes"
                    aria-label="Pause orchestration">
              <span aria-hidden="true">⏸</span> Pause
            </button>
            <button class="btn-orchestration stop" id="orchestration-stop-btn"
                    title="Stop automation and preserve progress"
                    aria-label="Stop orchestration">
              <span aria-hidden="true">⏹</span> Stop
            </button>
          </div>
        </div>
      `
    } else if (status === 'paused') {
      return `
        <div class="orchestration-controls" role="group" aria-label="Orchestration controls">
          <div class="orchestration-status">
            <span class="orchestration-status-icon paused" aria-hidden="true">⏸</span>
            <span class="orchestration-status-text">Paused</span>
            <span class="orchestration-progress">${completedCount}/${totalCount}</span>
          </div>
          <div class="orchestration-buttons">
            <button class="btn-orchestration resume" id="orchestration-resume-btn"
                    title="Resume automated implementation"
                    aria-label="Resume orchestration">
              <span aria-hidden="true">▶</span> Resume
            </button>
            <button class="btn-orchestration stop" id="orchestration-stop-btn"
                    title="Stop automation and preserve progress"
                    aria-label="Stop orchestration">
              <span aria-hidden="true">⏹</span> Stop
            </button>
          </div>
        </div>
      `
    } else if (status === 'stopped') {
      return `
        <div class="orchestration-controls" role="group" aria-label="Orchestration controls">
          <div class="orchestration-status">
            <span class="orchestration-status-icon stopped" aria-hidden="true">⏹</span>
            <span class="orchestration-status-text">Stopped</span>
            <span class="orchestration-progress">${completedCount}/${totalCount} completed</span>
          </div>
          <p class="orchestration-notice">Continue manually or close sprint.</p>
        </div>
      `
    } else if (status === 'complete') {
      return `
        <div class="orchestration-controls completed" role="status" aria-label="Orchestration complete">
          <div class="orchestration-status">
            <span class="orchestration-status-icon complete" aria-hidden="true">✓</span>
            <span class="orchestration-status-text">Automation Complete</span>
            <span class="orchestration-progress">${completedCount}/${totalCount}</span>
          </div>
        </div>
      `
    }

    return ''
  }

  /**
   * Setup delegated event handlers for orchestration controls.
   * Uses event delegation on document to prevent memory leaks from re-renders.
   * Called once during init, not on every render.
   */
  setupOrchestrationDelegation() {
    // Orchestration control buttons (pause, resume, stop)
    document.addEventListener('click', (e) => {
      const target = e.target.closest('#orchestration-pause-btn')
      if (target) {
        this.intents.pauseOrchestration()
        return
      }
    })

    document.addEventListener('click', (e) => {
      const target = e.target.closest('#orchestration-resume-btn')
      if (target) {
        this.intents.resumeOrchestration()
        return
      }
    })

    document.addEventListener('click', (e) => {
      const target = e.target.closest('#orchestration-stop-btn')
      if (target) {
        this.intents.stopOrchestration()
        return
      }
    })

    // Sprint summary toggle button
    document.addEventListener('click', (e) => {
      const target = e.target.closest('#sprint-summary-toggle')
      if (target) {
        this.intents.toggleSprintSummary()
        return
      }
    })
  }

  /**
   * Bind event handlers for orchestration control buttons
   * @deprecated Use setupOrchestrationDelegation() instead - kept for backward compatibility
   */
  bindOrchestrationControls() {
    // No-op: Event delegation is now handled by setupOrchestrationDelegation()
    // This method is kept for backward compatibility but does nothing
  }

  /**
   * Render sprint completion summary with statistics
   * @param {Object} completionStats - Sprint completion statistics
   * @param {boolean} expanded - Whether the summary is expanded
   * @returns {string} HTML for completion summary
   */
  renderSprintCompletionSummary(completionStats, expanded = false) {
    if (!completionStats) return ''

    const {
      totalCost = 0,
      totalTurns = 0,
      totalSessions = 0,
      duration = {},
      acceptance = {},
      assertions = {},
      codeReview = {},
      incidents = [],
      overallStatus = 'unknown'
    } = completionStats

    // Format duration
    const durationMs = duration.totalMs || 0
    const durationMinutes = Math.floor(durationMs / 60000)
    const durationSeconds = Math.floor((durationMs % 60000) / 1000)
    const durationText = durationMinutes > 0
      ? `${durationMinutes}m ${durationSeconds}s`
      : `${durationSeconds}s`

    // Format cost
    const costText = totalCost > 0 ? `$${totalCost.toFixed(4)}` : '$0.00'

    // Calculate acceptance rate
    const acceptanceTotal = acceptance.total || 0
    const acceptancePassed = acceptance.passed || 0
    const acceptanceFailed = acceptance.failed || 0
    const acceptanceRate = acceptanceTotal > 0
      ? Math.round((acceptancePassed / acceptanceTotal) * 100)
      : 100

    // Calculate assertion rate
    const assertionsTotal = assertions.total || 0
    const assertionsPassed = assertions.passed || 0
    const assertionsFailed = assertions.failed || 0
    const assertionRate = assertionsTotal > 0
      ? Math.round((assertionsPassed / assertionsTotal) * 100)
      : 100

    // Status styling
    const statusConfig = {
      success: { icon: '✓', label: 'Success', class: 'success' },
      partial: { icon: '⚠', label: 'Partial', class: 'warning' },
      failed: { icon: '✗', label: 'Failed', class: 'error' },
      unknown: { icon: '?', label: 'Unknown', class: 'muted' }
    }
    const statusInfo = statusConfig[overallStatus] || statusConfig.unknown

    // Failed acceptance criteria list
    const failedCriteria = acceptance.failedList || []

    // Failed assertions list
    const failedAssertions = assertions.failedList || []

    return `
      <div class="sprint-completion-summary ${expanded ? 'expanded' : ''}"
           role="region" aria-label="Sprint completion summary">
        <button class="summary-header" id="sprint-summary-toggle"
                aria-expanded="${expanded}" aria-controls="sprint-summary-content"
                title="Click to ${expanded ? 'collapse' : 'expand'} summary">
          <div class="summary-status ${statusInfo.class}">
            <span class="summary-status-icon" aria-hidden="true">${statusInfo.icon}</span>
            <span class="summary-status-label">Sprint ${statusInfo.label}</span>
          </div>
          <div class="summary-quick-stats">
            <span class="quick-stat" title="Total cost">
              <span class="stat-icon" aria-hidden="true">💰</span>
              ${costText}
            </span>
            <span class="quick-stat" title="Total turns">
              <span class="stat-icon" aria-hidden="true">🔄</span>
              ${totalTurns}
            </span>
            <span class="quick-stat" title="Duration">
              <span class="stat-icon" aria-hidden="true">⏱</span>
              ${durationText}
            </span>
          </div>
          <span class="summary-toggle-icon" aria-hidden="true">${expanded ? '▼' : '▶'}</span>
        </button>

        <div id="sprint-summary-content" class="summary-content ${expanded ? '' : 'collapsed'}"
             role="group" aria-label="Detailed statistics">

          <!-- Statistics Grid -->
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-card-header">
                <span class="stat-card-icon" aria-hidden="true">💰</span>
                <span class="stat-card-title">Total Cost</span>
              </div>
              <div class="stat-card-value">${costText}</div>
              <div class="stat-card-detail">${totalSessions} sessions</div>
            </div>

            <div class="stat-card">
              <div class="stat-card-header">
                <span class="stat-card-icon" aria-hidden="true">🔄</span>
                <span class="stat-card-title">Total Turns</span>
              </div>
              <div class="stat-card-value">${totalTurns}</div>
              <div class="stat-card-detail">across all sessions</div>
            </div>

            <div class="stat-card">
              <div class="stat-card-header">
                <span class="stat-card-icon" aria-hidden="true">⏱</span>
                <span class="stat-card-title">Duration</span>
              </div>
              <div class="stat-card-value">${durationText}</div>
              <div class="stat-card-detail">total runtime</div>
            </div>

            <div class="stat-card ${acceptanceFailed > 0 ? 'has-failures' : ''}">
              <div class="stat-card-header">
                <span class="stat-card-icon" aria-hidden="true">✓</span>
                <span class="stat-card-title">Acceptance</span>
              </div>
              <div class="stat-card-value">${acceptanceRate}%</div>
              <div class="stat-card-detail">${acceptancePassed}/${acceptanceTotal} passed</div>
            </div>
          </div>

          ${acceptanceFailed > 0 ? `
            <!-- Failed Acceptance Criteria -->
            <div class="failures-section">
              <h4 class="failures-title">
                <span class="failures-icon" aria-hidden="true">⚠</span>
                Failed Acceptance Criteria (${acceptanceFailed})
              </h4>
              <ul class="failures-list" role="list">
                ${failedCriteria.map(item => `
                  <li class="failure-item">
                    <span class="failure-story">${this.escapeHtml(item.storyTitle || 'Unknown Story')}</span>
                    <span class="failure-criterion">${this.escapeHtml(item.criterion || item.description || 'Unknown criterion')}</span>
                    ${item.reason ? `<span class="failure-reason">${this.escapeHtml(item.reason)}</span>` : ''}
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          ${assertionsFailed > 0 ? `
            <!-- Failed Assertions -->
            <div class="failures-section">
              <h4 class="failures-title">
                <span class="failures-icon" aria-hidden="true">⚠</span>
                Failed Assertions (${assertionsFailed})
              </h4>
              <ul class="failures-list" role="list">
                ${failedAssertions.map(item => `
                  <li class="failure-item">
                    <span class="failure-story">${this.escapeHtml(item.storyTitle || 'Unknown Story')}</span>
                    <span class="failure-assertion">${this.escapeHtml(item.assertion || item.description || 'Unknown assertion')}</span>
                    ${item.expected !== undefined ? `
                      <span class="failure-expected">Expected: ${this.escapeHtml(String(item.expected))}</span>
                    ` : ''}
                    ${item.actual !== undefined ? `
                      <span class="failure-actual">Actual: ${this.escapeHtml(String(item.actual))}</span>
                    ` : ''}
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          ${codeReview.findingsCount > 0 ? `
            <!-- Code Review Summary -->
            <div class="code-review-summary-section">
              <h4 class="section-title">
                <span class="section-icon" aria-hidden="true">🔍</span>
                Code Review Results
              </h4>
              <div class="code-review-stats">
                <span class="review-stat">
                  <span class="review-stat-value">${codeReview.findingsCount}</span>
                  <span class="review-stat-label">findings</span>
                </span>
                <span class="review-stat">
                  <span class="review-stat-value">${codeReview.fixesAttempted || 0}</span>
                  <span class="review-stat-label">fixes attempted</span>
                </span>
              </div>
            </div>
          ` : ''}

          ${incidents.length > 0 ? `
            <!-- Incidents Summary -->
            <div class="incidents-summary-section">
              <h4 class="section-title">
                <span class="section-icon" aria-hidden="true">📋</span>
                Incidents (${incidents.length})
              </h4>
              <ul class="incidents-list" role="list">
                ${incidents.slice(0, DISPLAY_LIMITS.INCIDENTS_SUMMARY).map(incident => `
                  <li class="incident-item ${incident.type}">
                    <span class="incident-type">${this.formatIncidentType(incident.type)}</span>
                    <span class="incident-description">${this.escapeHtml(incident.description)}</span>
                  </li>
                `).join('')}
                ${incidents.length > DISPLAY_LIMITS.INCIDENTS_SUMMARY ? `
                  <li class="incidents-more">+${incidents.length - DISPLAY_LIMITS.INCIDENTS_SUMMARY} more incidents</li>
                ` : ''}
              </ul>
            </div>
          ` : ''}

        </div>
      </div>
    `
  }

  /**
   * Bind event handlers for sprint completion summary toggle
   * @deprecated Use setupOrchestrationDelegation() instead - kept for backward compatibility
   */
  bindSprintSummaryToggle() {
    // No-op: Event delegation is now handled by setupOrchestrationDelegation()
    // This method is kept for backward compatibility but does nothing
  }

  /**
   * Render code review results panel
   * @param {Object} codeReview - Code review state from sprint
   * @param {Object} bugFix - Bug fix state from sprint
   * @param {string} phase - Current orchestration phase
   * @returns {string} HTML for code review panel
   */
  renderCodeReviewPanel(codeReview, bugFix = null, phase = null) {
    if (!codeReview) return ''

    const status = codeReview.status
    const findings = codeReview.findings || []
    const incidents = codeReview.incidents || []

    // Bug fix phase info
    const inBugFixPhase = phase === 'bugfix'
    const currentFindingId = bugFix?.currentFindingId
    const completedFindings = bugFix?.completedFindings || []
    const bugFixStatus = bugFix?.status

    // Group findings by severity
    const findingsBySeverity = {
      critical: findings.filter(f => f.severity === 'critical'),
      high: findings.filter(f => f.severity === 'high'),
      medium: findings.filter(f => f.severity === 'medium'),
      low: findings.filter(f => f.severity === 'low')
    }

    const totalFindings = findings.length
    const pendingFindings = findings.filter(f => f.status === 'pending' || !f.status).length
    const fixingFindings = findings.filter(f => f.status === 'fixing').length
    const fixedFindings = findings.filter(f => f.status === 'fixed').length

    // Status indicator - adjust for bug fix phase
    let statusIcon, statusClass, statusLabel
    if (inBugFixPhase && bugFixStatus === 'in_progress') {
      statusIcon = '◐'
      statusClass = 'fixing'
      statusLabel = 'Fixing Bugs'
    } else if (bugFixStatus === 'completed') {
      statusIcon = '✓'
      statusClass = 'completed'
      statusLabel = 'Complete'
    } else if (status === 'in_progress') {
      statusIcon = '◐'
      statusClass = 'reviewing'
      statusLabel = 'Reviewing'
    } else if (status === 'completed') {
      statusIcon = '✓'
      statusClass = 'completed'
      statusLabel = 'Review Complete'
    } else {
      statusIcon = '○'
      statusClass = 'pending'
      statusLabel = 'Pending'
    }

    // Bug fix progress bar
    const bugFixProgress = inBugFixPhase || bugFixStatus ? this.renderBugFixProgress(bugFix, findings) : ''

    return `
      <div class="code-review-panel ${inBugFixPhase ? 'in-bugfix-phase' : ''}" role="region" aria-label="Code Review Results">
        <div class="code-review-header">
          <div class="code-review-title">
            <span class="code-review-icon ${statusClass}" aria-hidden="true">${statusIcon}</span>
            <h4>${inBugFixPhase ? 'Bug Fix Session' : 'Code Review'}</h4>
            ${status === 'in_progress' && !inBugFixPhase ? '<span class="reviewing-badge">Reviewing...</span>' : ''}
            ${inBugFixPhase && bugFixStatus === 'in_progress' ? '<span class="fixing-badge">Fixing...</span>' : ''}
          </div>
          ${totalFindings > 0 ? `
            <div class="code-review-summary">
              <span class="findings-count">${totalFindings} finding${totalFindings !== 1 ? 's' : ''}</span>
              ${fixedFindings > 0 ? `<span class="findings-fixed">${fixedFindings} fixed</span>` : ''}
              ${fixingFindings > 0 ? `<span class="findings-fixing">${fixingFindings} fixing</span>` : ''}
              ${pendingFindings > 0 && !inBugFixPhase ? `<span class="findings-pending">${pendingFindings} pending</span>` : ''}
            </div>
          ` : ''}
        </div>
        ${bugFixProgress}

        ${incidents.length > 0 ? `
          <div class="code-review-incidents">
            <div class="incidents-header">
              <span class="incidents-icon" aria-hidden="true">⚠</span>
              <span class="incidents-label">Implementation Incidents</span>
              <span class="incidents-count">${incidents.length}</span>
            </div>
            <ul class="incidents-list" role="list">
              ${incidents.slice(0, DISPLAY_LIMITS.INCIDENTS_CODE_REVIEW).map(incident => `
                <li class="incident-item" data-incident-id="${this.escapeHtml(incident.id || '')}">
                  <span class="incident-type ${this.escapeHtml(incident.type || '')}">${this.formatIncidentType(incident.type)}</span>
                  <span class="incident-description">${this.escapeHtml(incident.description)}</span>
                </li>
              `).join('')}
              ${incidents.length > DISPLAY_LIMITS.INCIDENTS_CODE_REVIEW ? `
                <li class="incidents-more">+${incidents.length - DISPLAY_LIMITS.INCIDENTS_CODE_REVIEW} more incidents</li>
              ` : ''}
            </ul>
          </div>
        ` : ''}

        ${totalFindings > 0 ? `
          <div class="code-review-findings">
            ${this.renderFindingsByCategory('Critical', findingsBySeverity.critical, 'critical', currentFindingId)}
            ${this.renderFindingsByCategory('High', findingsBySeverity.high, 'high', currentFindingId)}
            ${this.renderFindingsByCategory('Medium', findingsBySeverity.medium, 'medium', currentFindingId)}
            ${this.renderFindingsByCategory('Low', findingsBySeverity.low, 'low', currentFindingId)}
          </div>
        ` : status === 'completed' ? `
          <div class="code-review-no-findings">
            <span class="no-findings-icon" aria-hidden="true">✓</span>
            <span class="no-findings-text">No issues found during code review</span>
          </div>
        ` : ''}
      </div>
    `
  }

  /**
   * Render bug fix progress section
   * @param {Object} bugFix - Bug fix state
   * @param {Array} findings - All findings
   * @returns {string} HTML for bug fix progress
   */
  renderBugFixProgress(bugFix, findings) {
    if (!bugFix) return ''

    const status = bugFix.status
    const completedCount = bugFix.completedFindings?.length || 0
    const totalCount = findings.length
    const currentFindingId = bugFix.currentFindingId
    const currentFinding = currentFindingId ? findings.find(f => f.id === currentFindingId) : null
    const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

    // Get fix results summary
    const fixResults = bugFix.fixResults || {}
    const fixedCount = Object.values(fixResults).filter(r => r.result === 'fixed').length
    const partialCount = Object.values(fixResults).filter(r => r.result === 'partial').length
    const skippedCount = Object.values(fixResults).filter(r => r.result === 'skipped').length

    return `
      <div class="bugfix-progress-section" role="region" aria-label="Bug fix progress">
        <div class="bugfix-progress-header">
          <span class="bugfix-progress-label">Bug Fix Progress</span>
          <span class="bugfix-progress-stats">${completedCount}/${totalCount} (${progressPercent}%)</span>
        </div>
        <div class="bugfix-progress-bar" role="progressbar" aria-valuenow="${progressPercent}" aria-valuemin="0" aria-valuemax="100">
          <div class="bugfix-progress-fill" style="width: ${progressPercent}%"></div>
        </div>
        ${currentFinding ? `
          <div class="bugfix-current-fix">
            <span class="current-fix-label">Currently fixing:</span>
            <div class="current-fix-finding">
              <span class="current-fix-severity ${currentFinding.severity}">${currentFinding.severity}</span>
              <span class="current-fix-location">${this.escapeHtml(this.truncateLocation(currentFinding.location))}</span>
              <span class="current-fix-description">${this.escapeHtml(currentFinding.description?.slice(0, DISPLAY_LIMITS.DESCRIPTION_LENGTH) || '')}${currentFinding.description?.length > DISPLAY_LIMITS.DESCRIPTION_LENGTH ? '...' : ''}</span>
            </div>
          </div>
        ` : ''}
        ${status === 'completed' ? `
          <div class="bugfix-summary">
            <span class="bugfix-summary-item fixed">${fixedCount} fixed</span>
            ${partialCount > 0 ? `<span class="bugfix-summary-item partial">${partialCount} partial</span>` : ''}
            ${skippedCount > 0 ? `<span class="bugfix-summary-item skipped">${skippedCount} skipped</span>` : ''}
          </div>
        ` : ''}
      </div>
    `
  }

  /**
   * Render findings for a specific severity category
   * @param {string} label - Category label
   * @param {Array} findings - Findings in this category
   * @param {string} severity - Severity level
   * @param {string} currentFindingId - ID of finding currently being fixed
   * @returns {string} HTML for findings category
   */
  renderFindingsByCategory(label, findings, severity, currentFindingId = null) {
    if (!findings || findings.length === 0) return ''

    // Check if current finding is in this category
    const hasCurrentFinding = currentFindingId && findings.some(f => f.id === currentFindingId)

    return `
      <div class="findings-category ${severity} ${hasCurrentFinding ? 'has-current-fix' : ''}" role="group" aria-label="${label} severity findings">
        <button class="findings-category-header"
                aria-expanded="${hasCurrentFinding ? 'true' : 'false'}"
                aria-controls="findings-${severity}-list">
          <span class="category-severity-badge ${severity}">${label}</span>
          <span class="category-count">${findings.length}</span>
          ${hasCurrentFinding ? '<span class="category-fixing-badge">Fixing</span>' : ''}
          <span class="category-toggle" aria-hidden="true">${hasCurrentFinding ? '▼' : '▶'}</span>
        </button>
        <ul id="findings-${severity}-list" class="findings-list ${hasCurrentFinding ? '' : 'collapsed'}" role="list">
          ${findings.map(finding => this.renderFinding(finding, finding.id === currentFindingId)).join('')}
        </ul>
      </div>
    `
  }

  /**
   * Render a single finding item
   * @param {Object} finding - Finding object
   * @param {boolean} isCurrentFix - Whether this finding is currently being fixed
   * @returns {string} HTML for finding item
   */
  renderFinding(finding, isCurrentFix = false) {
    const statusIcon = finding.status === 'fixed' ? '✓' :
                       finding.status === 'fixing' ? '◐' :
                       finding.status === 'wont_fix' ? '✗' : '○'
    const statusClass = this.escapeHtml(finding.status || 'pending')
    const currentFixClass = isCurrentFix ? 'current-fix' : ''

    return `
      <li class="finding-item ${statusClass} ${currentFixClass}" data-finding-id="${this.escapeHtml(finding.id || '')}">
        <div class="finding-header">
          <span class="finding-status-icon ${statusClass}"
                title="${this.escapeHtml(finding.status || 'Pending')}"
                aria-label="Status: ${this.escapeHtml(finding.status || 'pending')}">
            ${statusIcon}
          </span>
          <span class="finding-location" title="${this.escapeHtml(finding.location)}">
            ${this.escapeHtml(this.truncateLocation(finding.location))}
          </span>
          ${isCurrentFix ? `
            <span class="current-fix-badge" title="Currently being fixed">
              <span class="fixing-pulse"></span>
              Fixing
            </span>
          ` : ''}
        </div>
        <div class="finding-description">
          ${this.escapeHtml(finding.description)}
        </div>
        ${finding.suggestedFix ? `
          <div class="finding-suggested-fix">
            <span class="suggested-fix-label">Suggested fix:</span>
            <span class="suggested-fix-text">${this.escapeHtml(finding.suggestedFix)}</span>
          </div>
        ` : ''}
      </li>
    `
  }

  /**
   * Format incident type for display
   * @param {string} type - Incident type
   * @returns {string} Formatted type label
   */
  formatIncidentType(type) {
    if (!type) return 'Unknown'

    const labels = {
      'acceptance_failure': 'Acceptance',
      'assertion_failure': 'Assertion',
      'session_error': 'Error'
    }
    return labels[type] || type
  }

  /**
   * Truncate file location for display
   * @param {string} location - Full file location
   * @returns {string} Truncated location
   */
  truncateLocation(location) {
    if (!location) return ''
    // Show only filename and line number
    const parts = location.split(/[/\\]/)
    return parts[parts.length - 1] || location
  }

  /**
   * Bind event handlers for code review panel
   */
  bindCodeReviewPanel() {
    const categoryHeaders = document.querySelectorAll('.findings-category-header')
    categoryHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const isExpanded = header.getAttribute('aria-expanded') === 'true'
        header.setAttribute('aria-expanded', !isExpanded)
        const listId = header.getAttribute('aria-controls')
        const list = document.getElementById(listId)
        if (list) {
          list.classList.toggle('collapsed', isExpanded)
        }
        const toggle = header.querySelector('.category-toggle')
        if (toggle) {
          toggle.textContent = isExpanded ? '▶' : '▼'
        }
      })

      // Keyboard support
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          header.click()
        }
      })
    })
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
      this.showToast('No thread content to generate handoff from', 'warning')
      return
    }

    // Get only the current thread (linear path from root to active prompt)
    const threadPrompts = this.getLinearThreadPath(activePromptId, allPrompts)

    if (threadPrompts.length === 0) {
      this.showToast('No active thread selected', 'warning')
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
      'planning': 'Planning...',
      'planned': 'Ready for Approval',
      'in-progress': 'In Progress',
      'implementing': 'Implementing'
    }
    return statusMap[status] || status
  }

  /**
   * Render branch buttons for a story card
   * @param {Object} story - The story object
   * @param {Object} storyProgress - Progress info for the story
   * @param {string} assignedBranch - Branch assigned during planning (optional)
   */
  renderStoryBranchButtons(story, storyProgress, assignedBranch = null) {
    const branches = [
      { id: 'ui', label: 'UI', icon: '🎨' },
      { id: 'backend', label: 'Backend', icon: '⚙️' },
      { id: 'fullstack', label: 'Full Stack', icon: '🔗' },
      { id: 'plugin', label: 'Plugin', icon: '📦' }
    ]

    const escapedTitle = this.escapeHtml(story.title).replace(/"/g, '&quot;')
    const branchProgress = storyProgress?.branches || {}
    const normalizedAssigned = assignedBranch?.toLowerCase()

    return `
      <div class="story-branch-buttons">
        ${branches.map(branch => {
          const progress = branchProgress[branch.id]
          const status = progress?.status || 'pending'
          const statusClass = status === 'completed' ? 'completed' : status === 'in_progress' ? 'in-progress' : ''
          const statusIcon = status === 'completed' ? '✓' : status === 'in_progress' ? '◐' : ''
          const isAssigned = normalizedAssigned === branch.id
          const assignedClass = isAssigned ? 'assigned' : ''
          const titleText = status === 'completed'
            ? `${branch.label} implementation completed`
            : status === 'in_progress'
            ? `${branch.label} implementation in progress`
            : isAssigned
            ? `Start ${branch.label} implementation (recommended)`
            : `Start ${branch.label} implementation for this story`

          return `
            <button class="story-branch-btn ${statusClass} ${assignedClass}"
                    data-story-id="${story.id}"
                    data-branch="${branch.id}"
                    data-story-title="${escapedTitle}"
                    ${isAssigned ? 'data-assigned="true"' : ''}
                    title="${titleText}"
                    ${isAssigned ? 'aria-label="' + branch.label + ' (recommended branch)"' : ''}>
              <span class="branch-icon">${branch.icon}</span>
              <span class="branch-label">${branch.label}</span>
              ${isAssigned ? '<span class="assigned-indicator" aria-hidden="true">★</span>' : ''}
              ${statusIcon ? `<span class="branch-status-icon">${statusIcon}</span>` : ''}
            </button>
          `
        }).join('')}
      </div>
    `
  }

  /**
   * Render inspection assertions section for a sprint story card
   * @param {string} storyId - The story ID
   * @param {Array} assertions - The inspection assertions array
   * @param {Object} results - The assertion evaluation results (optional)
   * @returns {string} HTML for the assertions section
   */
  renderSprintAssertions(storyId, assertions, results) {
    if (!assertions || assertions.length === 0) return ''

    const hasResults = results && results.summary
    let statusClass = 'assertions-pending'
    let summaryText = 'Not verified'
    let passedCount = 0
    let failedCount = 0

    // Build a map of assertion results by ID for quick lookup
    const resultMap = new Map()
    if (results && results.results) {
      results.results.forEach(r => resultMap.set(r.assertionId, r))
    }

    if (hasResults) {
      passedCount = results.summary.passed || 0
      failedCount = results.summary.failed || 0
      const total = results.summary.total || assertions.length

      if (failedCount > 0) {
        statusClass = 'assertions-failed'
        summaryText = `${passedCount}/${total} passed`
      } else if (passedCount === total) {
        statusClass = 'assertions-passed'
        summaryText = `${passedCount}/${total} passed`
      } else {
        summaryText = `${passedCount}/${total} verified`
      }
    }

    // Render individual assertions list
    const assertionsListHtml = assertions.map(assertion => {
      const result = resultMap.get(assertion.id)
      let itemStatusClass = 'assertion-pending'
      let itemIcon = '○'

      if (result) {
        if (result.status === 'passed') {
          itemStatusClass = 'assertion-passed'
          itemIcon = '✓'
        } else if (result.status === 'failed' || result.status === 'error') {
          itemStatusClass = 'assertion-failed'
          itemIcon = '✗'
        }
      }

      const typeLabel = this.formatAssertionType(assertion.type)
      const targetDisplay = assertion.target ? this.escapeHtml(assertion.target) : ''

      return `
        <li class="assertion-item ${itemStatusClass}">
          <span class="assertion-item-icon">${itemIcon}</span>
          <div class="assertion-item-content">
            <span class="assertion-item-type">${typeLabel}</span>
            ${targetDisplay ? `<span class="assertion-item-target" title="${targetDisplay}">${targetDisplay}</span>` : ''}
            <span class="assertion-item-message">${this.escapeHtml(assertion.message || '')}</span>
          </div>
        </li>
      `
    }).join('')

    return `
      <div class="story-assertions-section ${statusClass}" data-story-id="${storyId}">
        <button class="assertions-toggle-btn" data-story-id="${storyId}" title="Toggle assertions">
          <span class="assertions-toggle-icon">▶</span>
          <span class="assertions-icon">${hasResults ? (failedCount > 0 ? '!' : '✓') : '○'}</span>
          <span class="assertions-label">Assertions</span>
          <span class="assertions-summary">${summaryText}</span>
          <span class="assertions-total">(${assertions.length})</span>
        </button>
        <ul class="assertions-list">
          ${assertionsListHtml}
        </ul>
      </div>
    `
  }

  /**
   * Format assertion type for display
   * @param {string} type - The assertion type (e.g., FILE_EXISTS)
   * @returns {string} Formatted type label
   */
  formatAssertionType(type) {
    if (!type) return ''
    return type.split('_').map(word =>
      word.charAt(0) + word.slice(1).toLowerCase()
    ).join(' ')
  }

  /**
   * Handle sprint planning - submit planning prompt to Claude
   */
  async handleSprintPlanning(planningData, state) {
    console.log('[SPRINT] Starting sprint planning:', planningData)

    // Clear the pending flag immediately to prevent re-submission
    this.intents.clearPendingSprintPlanning()

    const { promptContent, branchId } = planningData

    // Submit the planning prompt to Claude
    if (window.puffin?.claude) {
      // Check if a CLI process is already running
      const isRunning = await window.puffin.claude.isRunning()
      if (isRunning) {
        console.error('[SPRINT] Cannot start planning: CLI process already running')
        this.showToast({
          type: 'error',
          title: 'Process Already Running',
          message: 'A Claude process is already running. Please wait for it to complete.',
          duration: 5000
        })
        return
      }

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

    // Collect dead sessions (hit context limit)
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
