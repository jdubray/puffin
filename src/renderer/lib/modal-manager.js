/**
 * Modal Manager
 *
 * Handles rendering and management of modal dialogs.
 * Extracted from app.js for better separation of concerns.
 */

export class ModalManager {
  constructor(intents, showToast, showCodeReviewConfirmation = null) {
    this.intents = intents
    this.showToast = showToast
    this.showCodeReviewConfirmation = showCodeReviewConfirmation
    this._currentModalRender = null
    // Transient state for pre-generated commit message
    this._pendingCommitMessage = null
    this._commitMessageGenerating = false
    // Transient state for commit option
    this._sprintCommitEnabled = true // Default checked
    this._gitStatus = null // Cached git status { isRepo, hasChanges, branch, isMainBranch }
    this._gitStatusLoading = false
    // Transient state for editable commit message
    this._userEditedCommitMessage = null // User's edited message (persists across toggle)
    this._hasUserEditedMessage = false // Track if user has manually edited
    // Callback to update commit message area when pre-generation completes
    this._commitMessageUpdateCallback = null
    // Callback to re-render git section when status check completes
    this._gitStatusUpdateCallback = null
  }

  /**
   * Check git status for sprint close modal.
   * Call this before showing the sprint-close modal to pre-fetch git state.
   *
   * @returns {Promise<Object>} Git status info
   */
  async preCheckGitStatus() {
    this._gitStatusLoading = true
    this._gitStatus = null

    try {
      // Check if git is available and this is a repo
      const [availableResult, repoResult] = await Promise.all([
        window.puffin.git.isAvailable(),
        window.puffin.git.isRepository()
      ])

      const isAvailable = availableResult.success && availableResult.available
      const isRepo = repoResult.success && repoResult.isRepo

      if (!isAvailable || !isRepo) {
        this._gitStatus = {
          isRepo: false,
          hasChanges: false,
          branch: null,
          isMainBranch: false
        }
        return this._gitStatus
      }

      // Get full status
      const statusResult = await window.puffin.git.getStatus()

      if (!statusResult.success) {
        this._gitStatus = {
          isRepo: true,
          hasChanges: false,
          branch: null,
          isMainBranch: false,
          error: statusResult.error
        }
        return this._gitStatus
      }

      const status = statusResult.status
      const branch = status.branch || ''
      const isMainBranch = /^(main|master)$/i.test(branch)

      // Check if there are any changes
      const hasChanges = status.hasUncommittedChanges ||
        (status.files?.staged?.length > 0) ||
        (status.files?.unstaged?.length > 0) ||
        (status.files?.untracked?.length > 0)

      this._gitStatus = {
        isRepo: true,
        hasChanges,
        branch,
        isMainBranch,
        stagedCount: status.files?.staged?.length || 0,
        unstagedCount: status.files?.unstaged?.length || 0,
        untrackedCount: status.files?.untracked?.length || 0
      }

      return this._gitStatus
    } catch (error) {
      console.error('[ModalManager] Git status check failed:', error)
      this._gitStatus = {
        isRepo: false,
        hasChanges: false,
        branch: null,
        isMainBranch: false,
        error: error.message
      }
      return this._gitStatus
    } finally {
      this._gitStatusLoading = false
      // Trigger callback to update git section UI when loading completes
      if (this._gitStatusUpdateCallback) {
        this._gitStatusUpdateCallback()
      }
    }
  }

  /**
   * Generate a commit message for a sprint before the close modal opens.
   * Call this before showing the sprint-close modal to pre-generate the message.
   *
   * @param {Object} sprint - The sprint to generate a message for
   * @param {Object[]} userStories - Full user story data for status lookup
   * @returns {Promise<string>} The generated commit message
   */
  async preGenerateSprintCommitMessage(sprint, userStories = []) {
    if (!sprint) return ''

    this._commitMessageGenerating = true
    this._pendingCommitMessage = null

    try {
      // Yield to allow the modal to render with loading state first
      await new Promise(resolve => setTimeout(resolve, 0))

      const message = this.generateSprintCommitMessage(sprint, userStories)
      this._pendingCommitMessage = message
      return message
    } finally {
      this._commitMessageGenerating = false
      // Trigger re-render of commit message area if callback is registered
      if (this._commitMessageUpdateCallback) {
        this._commitMessageUpdateCallback()
      }
    }
  }

  /**
   * Generate a conventional commit message summarizing sprint completion.
   *
   * @param {Object} sprint - The sprint to generate a message for
   * @param {Object[]} userStories - Full user story data for status lookup
   * @returns {string} The generated commit message
   */
  generateSprintCommitMessage(sprint, userStories = []) {
    if (!sprint) return ''

    const storyCount = sprint.stories?.length || 0
    const storyProgress = sprint.storyProgress || {}

    // Count completed stories - check multiple sources
    const completedStories = []
    const incompleteStories = []

    for (const sprintStory of sprint.stories || []) {
      const progress = storyProgress[sprintStory.id]
      const backlogStory = userStories.find(s => s.id === sprintStory.id)

      const isCompleted =
        progress?.status === 'completed' ||
        backlogStory?.status === 'completed' ||
        sprintStory.status === 'completed'

      if (isCompleted) {
        completedStories.push(sprintStory.title || backlogStory?.title || 'Untitled')
      } else {
        incompleteStories.push(sprintStory.title || backlogStory?.title || 'Untitled')
      }
    }

    const completedCount = completedStories.length

    // Determine primary scope based on story titles
    let scope = 'sprint'
    const allTitles = completedStories.join(' ').toLowerCase()
    if (allTitles.includes('ui') || allTitles.includes('component') || allTitles.includes('display')) {
      scope = 'ui'
    } else if (allTitles.includes('api') || allTitles.includes('backend') || allTitles.includes('handler')) {
      scope = 'backend'
    } else if (allTitles.includes('test') || allTitles.includes('spec')) {
      scope = 'test'
    } else if (allTitles.includes('fix') || allTitles.includes('bug')) {
      scope = 'fix'
    }

    // Build commit message
    const completionRatio = storyCount > 0 ? `${completedCount}/${storyCount}` : '0'
    const statusWord = completedCount === storyCount ? 'complete' : 'close'

    // Subject line
    let subject = `feat(${scope}): ${statusWord} sprint with ${completionRatio} stories`
    if (sprint.title) {
      subject = `feat(${scope}): ${statusWord} "${sprint.title}" (${completionRatio} stories)`
    }

    // Build body with story details
    const bodyLines = []

    if (completedStories.length > 0) {
      bodyLines.push('Completed:')
      completedStories.forEach(title => {
        bodyLines.push(`- ${title}`)
      })
    }

    if (incompleteStories.length > 0) {
      if (bodyLines.length > 0) bodyLines.push('')
      bodyLines.push('Not completed:')
      incompleteStories.forEach(title => {
        bodyLines.push(`- ${title}`)
      })
    }

    // Combine subject and body
    if (bodyLines.length > 0) {
      return `${subject}\n\n${bodyLines.join('\n')}`
    }

    return subject
  }

  /**
   * Execute a git commit for the sprint close.
   * Stages all changes and commits with the provided message.
   *
   * @param {string} message - The commit message
   * @returns {Promise<Object>} Result with success, hash, or error
   */
  async executeSprintCommit(message) {
    if (!message || !message.trim()) {
      return { success: false, error: 'No commit message provided' }
    }

    try {
      // Check if git is available
      if (!window.puffin?.git) {
        return { success: false, error: 'Git integration not available' }
      }

      // Stage all changes (using '.' to stage everything including untracked)
      console.log('[MODAL] Staging all changes for sprint commit...')
      const stageResult = await window.puffin.git.stageFiles(['.'])
      if (!stageResult?.success && stageResult?.error) {
        console.warn('[MODAL] Stage files result:', stageResult)
        // Continue anyway - files might already be staged
      }

      // Execute the commit
      console.log('[MODAL] Executing sprint commit...')
      const commitResult = await window.puffin.git.commit(message.trim())

      if (commitResult?.success) {
        console.log('[MODAL] Sprint commit successful:', commitResult.hash)
        return {
          success: true,
          hash: commitResult.hash || commitResult.commitHash
        }
      } else {
        const errorMsg = commitResult?.error || 'Commit failed'
        console.error('[MODAL] Sprint commit failed:', errorMsg)
        return { success: false, error: errorMsg }
      }
    } catch (error) {
      console.error('[MODAL] Sprint commit error:', error)
      return { success: false, error: error.message || 'Unknown error during commit' }
    }
  }

  /**
   * Update modal visibility and render content
   * @param {Object} state - Current app state
   */
  update(state) {
    const container = document.getElementById('modal-container')
    if (container) {
      container.classList.toggle('hidden', !state.ui.hasModal)

      if (state.ui.hasModal && state.ui.modal) {
        const modalType = state.ui.modal.type
        this._currentModalRender = modalType
        this.renderContent(state.ui.modal, modalType, state)
      }
    }
  }

  /**
   * Render modal content based on type
   * @param {Object} modal - Modal configuration
   * @param {string} renderToken - Token to detect stale renders
   * @param {Object} state - Current app state
   */
  async renderContent(modal, renderToken, state) {
    const modalTitle = document.getElementById('modal-title')
    const modalContent = document.getElementById('modal-content')
    const modalActions = document.getElementById('modal-actions')

    // Helper to check if this render is still current
    const isStale = () => renderToken && this._currentModalRender !== renderToken

    // Skip clearing content for modals handled by their own components
    // These components subscribe to state changes and manage their own rendering
    const componentManagedModals = ['user-story-review', 'add-branch', 'add-plugin', 'branch-settings', 'plugin-assignment']
    if (componentManagedModals.includes(modal.type)) {
      // Handled by their respective components which manage their own rendering
      return
    }

    // Immediately clear old content to prevent stale event handlers
    modalTitle.textContent = 'Loading...'
    modalContent.innerHTML = ''
    modalActions.innerHTML = ''

    switch (modal.type) {
      case 'handoff-review':
        this.renderHandoffReview(modalTitle, modalContent, modalActions, modal.data, state)
        break
      case 'profile-view':
        await this.renderProfileView(modalTitle, modalContent, modalActions, isStale)
        break
      case 'profile-create':
        await this.renderProfileCreate(modalTitle, modalContent, modalActions, isStale)
        break
      case 'profile-edit':
        await this.renderProfileEdit(modalTitle, modalContent, modalActions, isStale)
        break
      case 'sprint-close':
        this.renderSprintClose(modalTitle, modalContent, modalActions, modal.data, state)
        break
      case 'claude-config-view':
        await this.renderClaudeConfigView(modalTitle, modalContent, modalActions, isStale)
        break
      case 'story-detail':
        this.renderStoryDetail(modalTitle, modalContent, modalActions, modal.data)
        break
      case 'add-user-story':
        this.renderAddUserStory(modalTitle, modalContent, modalActions, modal.data)
        break
      case 'edit-user-story':
        this.renderEditUserStory(modalTitle, modalContent, modalActions, modal.data)
        break
      case 'sprint-stories':
        this.renderSprintStories(modalTitle, modalContent, modalActions, modal.data)
        break
      case 'assertion-failures':
        this.renderAssertionFailures(modalTitle, modalContent, modalActions, modal.data)
        break
      case 'ris-view':
        this.renderRisView(modalTitle, modalContent, modalActions, modal.data)
        break
      case 'completion-summary-view':
        this.renderCompletionSummaryView(modalTitle, modalContent, modalActions, modal.data)
        break
      case 'plan-review':
        this.renderPlanReview(modalTitle, modalContent, modalActions, modal.data)
        break
      case 'alert':
        this.renderAlert(modalTitle, modalContent, modalActions, modal.data)
        break
      case 'implementation-mode-selection':
        this.renderImplementationModeSelection(modalTitle, modalContent, modalActions, modal.data)
        break
      case 'orchestration-plan':
        this.renderOrchestrationPlan(modalTitle, modalContent, modalActions, modal.data, state)
        break
      case 'claude-question':
        this.renderClaudeQuestion(modalTitle, modalContent, modalActions, modal.data)
        break
      default:
        console.warn('Unknown modal type:', modal.type)
        // Provide a way to close unknown modals
        modalTitle.textContent = 'Unknown Modal'
        modalContent.innerHTML = `<p>Modal type "${modal.type}" is not recognized.</p>`
        modalActions.innerHTML = `<button class="btn secondary" id="modal-cancel-btn">Close</button>`
        document.getElementById('modal-cancel-btn')?.addEventListener('click', () => {
          this.intents.hideModal()
        })
    }
  }

  /**
   * Check if a sprint has any progress (completed or in-progress stories)
   * @param {Object} sprint - Sprint object with storyProgress
   * @returns {boolean} True if any story is completed or in-progress
   */
  hasAnySprintProgress(sprint) {
    const storyProgress = sprint?.storyProgress || {}
    return Object.values(storyProgress).some(p =>
      p.status === 'completed' || p.status === 'in-progress'
    )
  }

  /**
   * Render sprint close modal - prompts for title and description
   * Shows different UI for zero-progress sprints vs sprints with work done
   */
  renderSprintClose(title, content, actions, data, state) {
    const sprint = data?.sprint || state.activeSprint
    const storyCount = sprint?.stories?.length || 0
    const completedCount = Object.values(sprint?.storyProgress || {})
      .filter(p => p.status === 'completed').length
    const hasProgress = this.hasAnySprintProgress(sprint)

    // Show zero-progress UI if no stories completed AND no stories in-progress
    if (!hasProgress && storyCount > 0) {
      this.renderZeroProgressSprintClose(title, content, actions, sprint, storyCount)
      return
    }

    // Normal close flow for sprints with progress
    title.textContent = 'Close Sprint'
    const userStories = state.userStories || []

    // Generate default title from date
    const now = new Date()
    const defaultTitle = `Sprint ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

    // Get commit message - prefer user edits, then pre-generated, then generate now
    let commitMessage
    const isGenerating = this._commitMessageGenerating

    if (this._hasUserEditedMessage && this._userEditedCommitMessage !== null) {
      // Use user's edited message (persists across toggle)
      commitMessage = this._userEditedCommitMessage
    } else if (this._pendingCommitMessage) {
      // Use pre-generated message
      commitMessage = this._pendingCommitMessage
    } else if (!isGenerating) {
      // Generate synchronously if not pre-generated
      commitMessage = this.generateSprintCommitMessage(sprint, userStories)
    }

    // Get git status (pre-fetched or defaults)
    const gitStatus = this._gitStatus || { isRepo: false, hasChanges: false, branch: null, isMainBranch: false }
    const gitStatusLoading = this._gitStatusLoading
    const showGitSection = gitStatus.isRepo
    const canCommit = gitStatus.isRepo && gitStatus.hasChanges
    const commitEnabled = this._sprintCommitEnabled && canCommit

    // Build git commit section HTML
    let gitSectionHtml = ''
    if (gitStatusLoading) {
      gitSectionHtml = `
        <div class="form-group sprint-git-section">
          <div class="git-status-loading">
            <span class="commit-spinner"></span>
            Checking git status...
          </div>
        </div>
      `
    } else if (showGitSection) {
      const branchWarningHtml = gitStatus.isMainBranch ? `
        <span class="branch-warning-badge" title="You are on the ${gitStatus.branch} branch">
          <span class="warning-icon">⚠️</span>
          On ${gitStatus.branch}
        </span>
      ` : ''

      const noChangesHtml = !gitStatus.hasChanges ? `
        <span class="no-changes-badge">No changes to commit</span>
      ` : ''

      const changesSummary = gitStatus.hasChanges ? `
        <span class="changes-summary">
          ${gitStatus.stagedCount > 0 ? `${gitStatus.stagedCount} staged` : ''}
          ${gitStatus.stagedCount > 0 && (gitStatus.unstagedCount > 0 || gitStatus.untrackedCount > 0) ? ', ' : ''}
          ${gitStatus.unstagedCount > 0 ? `${gitStatus.unstagedCount} modified` : ''}
          ${gitStatus.unstagedCount > 0 && gitStatus.untrackedCount > 0 ? ', ' : ''}
          ${gitStatus.untrackedCount > 0 ? `${gitStatus.untrackedCount} untracked` : ''}
        </span>
      ` : ''

      gitSectionHtml = `
        <div class="form-group sprint-git-section">
          <div class="git-commit-header">
            <label class="checkbox-label ${!canCommit ? 'disabled' : ''}">
              <input type="checkbox"
                     id="sprint-commit-checkbox"
                     ${commitEnabled ? 'checked' : ''}
                     ${!canCommit ? 'disabled' : ''}>
              <span class="checkbox-text">Commit sprint changes</span>
            </label>
            ${branchWarningHtml}
            ${noChangesHtml}
            ${changesSummary}
          </div>

          <div class="commit-message-area ${!commitEnabled ? 'hidden' : ''}" id="commit-message-container">
            <div class="commit-message-header">
              <label for="sprint-commit-message">Commit message:</label>
              <button type="button" id="copy-commit-btn" class="btn-icon" title="Copy to clipboard">
                <span class="copy-icon">📋</span>
              </button>
            </div>
            <div class="commit-message-container">
              ${isGenerating ? `
                <div class="commit-generating">
                  <span class="commit-spinner"></span>
                  Generating commit message...
                </div>
              ` : `
                <textarea id="sprint-commit-message"
                          class="commit-message-input"
                          rows="6"
                          placeholder="Commit message...">${this.escapeHtml(commitMessage || '')}</textarea>
              `}
            </div>
          </div>
        </div>
      `
    }

    content.innerHTML = `
      <div class="sprint-close-content">
        <div class="sprint-close-summary">
          <span class="summary-stat">
            <strong>${completedCount}</strong> of <strong>${storyCount}</strong> stories completed
          </span>
        </div>

        <div class="form-group">
          <label for="sprint-close-title">Sprint Title <span class="required">*</span></label>
          <input type="text"
                 id="sprint-close-title"
                 class="sprint-close-input"
                 placeholder="e.g., Authentication Feature Sprint"
                 value="${this.escapeHtml(defaultTitle)}"
                 maxlength="100"
                 required>
          <small class="form-hint">A short, memorable name for this sprint</small>
        </div>

        <div class="form-group">
          <label for="sprint-close-description">Description <span class="optional">(optional)</span></label>
          <textarea id="sprint-close-description"
                    class="sprint-close-textarea"
                    placeholder="Brief summary of what was accomplished..."
                    rows="3"
                    maxlength="500"></textarea>
          <small class="form-hint">Optional notes about the sprint outcome</small>
        </div>

        ${gitSectionHtml}
      </div>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="sprint-close-cancel-btn">Cancel</button>
      <button class="btn primary" id="sprint-close-confirm-btn">Close Sprint</button>
    `

    // Commit message textarea - track user edits
    const commitMessageTextarea = document.getElementById('sprint-commit-message')
    if (commitMessageTextarea) {
      commitMessageTextarea.addEventListener('input', (e) => {
        // Mark that user has edited and save their changes
        this._hasUserEditedMessage = true
        this._userEditedCommitMessage = e.target.value
      })
    }

    // Register callback to update commit message area when pre-generation completes
    this._commitMessageUpdateCallback = () => {
      const container = document.getElementById('commit-message-container')
      if (!container) return

      // Only update if we have a pending message and user hasn't edited
      if (this._pendingCommitMessage && !this._hasUserEditedMessage) {
        const existingTextarea = document.getElementById('sprint-commit-message')
        if (existingTextarea) {
          // Textarea exists, just update value
          existingTextarea.value = this._pendingCommitMessage
        } else {
          // Replace loading spinner with textarea
          const messageContainer = container.querySelector('.commit-message-container')
          if (messageContainer) {
            messageContainer.innerHTML = `
              <textarea id="sprint-commit-message"
                        class="commit-message-input"
                        rows="6"
                        placeholder="Commit message...">${this.escapeHtml(this._pendingCommitMessage)}</textarea>
            `
            // Re-attach input listener
            const newTextarea = document.getElementById('sprint-commit-message')
            if (newTextarea) {
              newTextarea.addEventListener('input', (e) => {
                this._hasUserEditedMessage = true
                this._userEditedCommitMessage = e.target.value
              })
            }
          }
        }
      }
    }

    // Register callback to re-render git section when status check completes
    this._gitStatusUpdateCallback = () => {
      const gitSectionContainer = document.querySelector('.sprint-git-section')
      if (!gitSectionContainer) return

      // Re-render the entire git section with updated status
      const gitStatus = this._gitStatus || { isRepo: false, hasChanges: false, branch: null, isMainBranch: false }
      const showGitSection = gitStatus.isRepo
      const canCommit = gitStatus.isRepo && gitStatus.hasChanges
      const commitEnabled = this._sprintCommitEnabled && canCommit

      if (!showGitSection) {
        // Remove git section if not a repo
        gitSectionContainer.remove()
        return
      }

      // Use pre-generated message, user edits, or generate now
      let commitMessage = ''
      if (this._hasUserEditedMessage && this._userEditedCommitMessage !== null) {
        commitMessage = this._userEditedCommitMessage
      } else if (this._pendingCommitMessage) {
        commitMessage = this._pendingCommitMessage
      }

      const branchWarningHtml = gitStatus.isMainBranch ? `
        <span class="branch-warning-badge" title="You are on the ${gitStatus.branch} branch">
          <span class="warning-icon">⚠️</span>
          On ${gitStatus.branch}
        </span>
      ` : ''

      const noChangesHtml = !gitStatus.hasChanges ? `
        <span class="no-changes-badge">No changes to commit</span>
      ` : ''

      const changesSummary = gitStatus.hasChanges ? `
        <span class="changes-summary">
          ${gitStatus.stagedCount > 0 ? `${gitStatus.stagedCount} staged` : ''}
          ${gitStatus.stagedCount > 0 && (gitStatus.unstagedCount > 0 || gitStatus.untrackedCount > 0) ? ', ' : ''}
          ${gitStatus.unstagedCount > 0 ? `${gitStatus.unstagedCount} modified` : ''}
          ${gitStatus.unstagedCount > 0 && gitStatus.untrackedCount > 0 ? ', ' : ''}
          ${gitStatus.untrackedCount > 0 ? `${gitStatus.untrackedCount} untracked` : ''}
        </span>
      ` : ''

      const isGenerating = this._commitMessageGenerating

      gitSectionContainer.innerHTML = `
        <div class="git-commit-header">
          <label class="checkbox-label ${!canCommit ? 'disabled' : ''}">
            <input type="checkbox"
                   id="sprint-commit-checkbox"
                   ${commitEnabled ? 'checked' : ''}
                   ${!canCommit ? 'disabled' : ''}>
            <span class="checkbox-text">Commit sprint changes</span>
          </label>
          ${branchWarningHtml}
          ${noChangesHtml}
          ${changesSummary}
        </div>

        <div class="commit-message-area ${!commitEnabled ? 'hidden' : ''}" id="commit-message-container">
          <div class="commit-message-header">
            <label for="sprint-commit-message">Commit message:</label>
            <button type="button" id="copy-commit-btn" class="btn-icon" title="Copy to clipboard">
              <span class="copy-icon">📋</span>
            </button>
          </div>
          <div class="commit-message-container">
            ${isGenerating ? `
              <div class="commit-generating">
                <span class="commit-spinner"></span>
                Generating commit message...
              </div>
            ` : `
              <textarea id="sprint-commit-message"
                        class="commit-message-input"
                        rows="6"
                        placeholder="Commit message...">${this.escapeHtml(commitMessage || '')}</textarea>
            `}
          </div>
        </div>
      `

      // Re-attach event listeners after re-render
      const newCommitCheckbox = document.getElementById('sprint-commit-checkbox')
      const newCommitMessageContainer = document.getElementById('commit-message-container')
      if (newCommitCheckbox && newCommitMessageContainer) {
        newCommitCheckbox.addEventListener('change', (e) => {
          const messageTextarea = document.getElementById('sprint-commit-message')
          if (messageTextarea && messageTextarea.value) {
            this._userEditedCommitMessage = messageTextarea.value
            if (messageTextarea.value !== this._pendingCommitMessage) {
              this._hasUserEditedMessage = true
            }
          }
          this._sprintCommitEnabled = e.target.checked
          newCommitMessageContainer.classList.toggle('hidden', !e.target.checked)
        })
      }

      // Re-attach copy button handler
      document.getElementById('copy-commit-btn')?.addEventListener('click', () => {
        const messageEl = document.getElementById('sprint-commit-message')
        const message = messageEl?.value || messageEl?.textContent
        if (message) {
          navigator.clipboard.writeText(message).then(() => {
            this.showToast('Commit message copied to clipboard', 'success')
          }).catch(() => {
            this.showToast('Failed to copy to clipboard', 'error')
          })
        }
      })

      // Re-attach input listener for commit message
      const newTextarea = document.getElementById('sprint-commit-message')
      if (newTextarea) {
        newTextarea.addEventListener('input', (e) => {
          this._hasUserEditedMessage = true
          this._userEditedCommitMessage = e.target.value
        })
      }
    }

    // Commit checkbox toggle handler
    const commitCheckbox = document.getElementById('sprint-commit-checkbox')
    const commitMessageContainer = document.getElementById('commit-message-container')
    if (commitCheckbox && commitMessageContainer) {
      commitCheckbox.addEventListener('change', (e) => {
        // Save current message before toggling (preserves edits)
        const messageTextarea = document.getElementById('sprint-commit-message')
        if (messageTextarea && messageTextarea.value) {
          this._userEditedCommitMessage = messageTextarea.value
          // Only mark as user-edited if content differs from auto-generated
          if (messageTextarea.value !== this._pendingCommitMessage) {
            this._hasUserEditedMessage = true
          }
        }

        this._sprintCommitEnabled = e.target.checked
        commitMessageContainer.classList.toggle('hidden', !e.target.checked)
      })
    }

    // Copy button handler
    document.getElementById('copy-commit-btn')?.addEventListener('click', () => {
      const messageEl = document.getElementById('sprint-commit-message')
      const message = messageEl?.value || messageEl?.textContent
      if (message) {
        navigator.clipboard.writeText(message).then(() => {
          this.showToast('Commit message copied to clipboard', 'success')
        }).catch(() => {
          this.showToast('Failed to copy to clipboard', 'error')
        })
      }
    })

    // Event listeners
    document.getElementById('sprint-close-cancel-btn').addEventListener('click', () => {
      // Clear all transient state on cancel
      this._pendingCommitMessage = null
      this._userEditedCommitMessage = null
      this._hasUserEditedMessage = false
      this._commitMessageUpdateCallback = null
      this._gitStatusUpdateCallback = null
      this.intents.hideModal()
    })

    document.getElementById('sprint-close-confirm-btn').addEventListener('click', async () => {
      const titleInput = document.getElementById('sprint-close-title')
      const descriptionInput = document.getElementById('sprint-close-description')
      const confirmBtn = document.getElementById('sprint-close-confirm-btn')

      const sprintTitle = titleInput?.value?.trim()
      const sprintDescription = descriptionInput?.value?.trim() || ''

      if (!sprintTitle) {
        titleInput?.focus()
        this.showToast('Please enter a sprint title', 'error')
        return
      }

      // Check if commit is enabled
      const commitCheckbox = document.getElementById('sprint-commit-checkbox')
      const commitMessageTextarea = document.getElementById('sprint-commit-message')
      const shouldCommit = commitCheckbox?.checked && !commitCheckbox?.disabled
      const commitMessage = commitMessageTextarea?.value?.trim()

      // Save sprint reference before closing
      const closedSprint = { ...sprint, title: sprintTitle, description: sprintDescription }

      // Disable button and show loading state
      if (confirmBtn) {
        confirmBtn.disabled = true
        confirmBtn.textContent = shouldCommit ? 'Closing & Committing...' : 'Closing...'
      }

      try {
        // Clear all transient commit state
        this._pendingCommitMessage = null
        this._userEditedCommitMessage = null
        this._hasUserEditedMessage = false
        this._commitMessageUpdateCallback = null
        this._gitStatusUpdateCallback = null

        // Call clearSprint with title and description (archive sprint data)
        this.intents.clearSprintWithDetails(sprintTitle, sprintDescription)

        // Execute git commit if enabled
        if (shouldCommit && commitMessage) {
          const commitResult = await this.executeSprintCommit(commitMessage)

          if (commitResult.success) {
            this.intents.hideModal()
            this.showToast(`Sprint closed and committed: ${commitResult.hash?.substring(0, 7) || 'success'}`, 'success')
          } else {
            // Sprint was archived but commit failed
            this.intents.hideModal()
            this.showToast(`Sprint closed but commit failed: ${commitResult.error}`, 'warning')
            console.error('[MODAL] Sprint commit failed:', commitResult.error)
          }
        } else {
          // No commit requested
          this.intents.hideModal()
          this.showToast('Sprint closed successfully', 'success')
        }

        // Ask if user wants to trigger a code review after closing
        if (this.showCodeReviewConfirmation) {
          setTimeout(() => {
            this.showCodeReviewConfirmation(closedSprint)
          }, 500) // Small delay to let modal close
        }
      } catch (error) {
        // Handle unexpected errors
        console.error('[MODAL] Sprint close error:', error)
        this.intents.hideModal()
        this.showToast(`Sprint closed but an error occurred: ${error.message}`, 'warning')
      }
    })

    // Focus the title input
    setTimeout(() => {
      const titleInput = document.getElementById('sprint-close-title')
      if (titleInput) {
        titleInput.focus()
        titleInput.select()
      }
    }, 100)

    // Handle Enter key in title input
    document.getElementById('sprint-close-title')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        document.getElementById('sprint-close-confirm-btn')?.click()
      }
    })
  }

  /**
   * Render zero-progress sprint close modal
   * Shows alternative UI when sprint has no completed or in-progress stories
   * @param {HTMLElement} title - Modal title element
   * @param {HTMLElement} content - Modal content element
   * @param {HTMLElement} actions - Modal actions element
   * @param {Object} sprint - Sprint object
   * @param {number} storyCount - Number of stories in sprint
   */
  renderZeroProgressSprintClose(title, content, actions, sprint, storyCount) {
    title.textContent = 'Close Sprint'

    content.innerHTML = `
      <div class="sprint-close-content zero-progress">
        <div class="zero-progress-alert">
          <span class="zero-progress-icon" aria-hidden="true">⚠️</span>
          <span class="zero-progress-message">This sprint has no completed work</span>
        </div>

        <div class="sprint-close-summary">
          <span class="summary-stat">
            <strong>0</strong> of <strong>${storyCount}</strong> stories completed
          </span>
          <span class="summary-stat secondary">
            No implementation tasks started
          </span>
        </div>

        <div class="zero-progress-prompt">
          <p>What would you like to do with this sprint?</p>
        </div>
      </div>
    `

    // Three-button layout: [Keep Active (primary)] [Close Anyway] [Delete (danger)]
    actions.innerHTML = `
      <div class="zero-progress-actions">
        <button class="btn primary" id="zero-progress-keep-btn">
          Keep Active
        </button>
        <button class="btn secondary" id="zero-progress-close-btn">
          Close Anyway
        </button>
        <button class="btn danger" id="zero-progress-delete-btn">
          Delete
        </button>
      </div>
    `

    // Event listeners
    document.getElementById('zero-progress-keep-btn').addEventListener('click', () => {
      this.intents.hideModal()
      this.showToast('Sprint kept active', 'info')
    })

    document.getElementById('zero-progress-close-btn').addEventListener('click', () => {
      // Show the normal close modal with title/description form
      // Re-render with a flag to skip zero-progress check
      this._bypassZeroProgressCheck = true
      const titleEl = document.getElementById('modal-title')
      const contentEl = document.getElementById('modal-content')
      const actionsEl = document.getElementById('modal-actions')

      if (titleEl && contentEl && actionsEl) {
        // Get state from the current modal data
        const state = { activeSprint: sprint, userStories: [] }
        this.renderNormalSprintClose(titleEl, contentEl, actionsEl, { sprint }, state)
      }
      this._bypassZeroProgressCheck = false
    })

    document.getElementById('zero-progress-delete-btn').addEventListener('click', () => {
      // Show delete confirmation modal
      this.renderSprintDeleteConfirm(
        document.getElementById('modal-title'),
        document.getElementById('modal-content'),
        document.getElementById('modal-actions'),
        sprint,
        storyCount
      )
    })

    // Focus the primary button for keyboard accessibility
    setTimeout(() => {
      document.getElementById('zero-progress-keep-btn')?.focus()
    }, 100)
  }

  /**
   * Render the normal sprint close form (title, description, commit options)
   * Called when user clicks "Close Anyway" from zero-progress modal
   */
  renderNormalSprintClose(title, content, actions, data, state) {
    title.textContent = 'Close Sprint'

    const sprint = data?.sprint || state.activeSprint
    const userStories = state.userStories || []
    const storyCount = sprint?.stories?.length || 0
    const completedCount = Object.values(sprint?.storyProgress || {})
      .filter(p => p.status === 'completed').length

    // Generate default title from date
    const now = new Date()
    const defaultTitle = `Sprint ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

    // Get commit message - prefer user edits, then pre-generated, then generate now
    let commitMessage
    const isGenerating = this._commitMessageGenerating

    if (this._hasUserEditedMessage && this._userEditedCommitMessage !== null) {
      commitMessage = this._userEditedCommitMessage
    } else if (this._pendingCommitMessage) {
      commitMessage = this._pendingCommitMessage
    } else if (!isGenerating) {
      commitMessage = this.generateSprintCommitMessage(sprint, userStories)
    }

    // Get git status (pre-fetched or defaults)
    const gitStatus = this._gitStatus || { isRepo: false, hasChanges: false, branch: null, isMainBranch: false }
    const gitStatusLoading = this._gitStatusLoading
    const showGitSection = gitStatus.isRepo
    const canCommit = gitStatus.isRepo && gitStatus.hasChanges
    const commitEnabled = this._sprintCommitEnabled && canCommit

    // Build git commit section HTML (simplified for Close Anyway flow)
    let gitSectionHtml = ''
    if (gitStatusLoading) {
      gitSectionHtml = `
        <div class="form-group sprint-git-section">
          <div class="git-status-loading">
            <span class="commit-spinner"></span>
            Checking git status...
          </div>
        </div>
      `
    } else if (showGitSection) {
      const noChangesHtml = !gitStatus.hasChanges ? `
        <span class="no-changes-badge">No changes to commit</span>
      ` : ''

      gitSectionHtml = `
        <div class="form-group sprint-git-section">
          <div class="git-commit-header">
            <label class="checkbox-label ${!canCommit ? 'disabled' : ''}">
              <input type="checkbox"
                     id="sprint-commit-checkbox"
                     ${commitEnabled ? 'checked' : ''}
                     ${!canCommit ? 'disabled' : ''}>
              <span class="checkbox-text">Commit sprint changes</span>
            </label>
            ${noChangesHtml}
          </div>

          <div class="commit-message-area ${!commitEnabled ? 'hidden' : ''}" id="commit-message-container">
            <div class="commit-message-header">
              <label for="sprint-commit-message">Commit message:</label>
            </div>
            <div class="commit-message-container">
              ${isGenerating ? `
                <div class="commit-generating">
                  <span class="commit-spinner"></span>
                  Generating commit message...
                </div>
              ` : `
                <textarea id="sprint-commit-message"
                          class="commit-message-input"
                          rows="4"
                          placeholder="Commit message...">${this.escapeHtml(commitMessage || '')}</textarea>
              `}
            </div>
          </div>
        </div>
      `
    }

    content.innerHTML = `
      <div class="sprint-close-content">
        <div class="sprint-close-summary">
          <span class="summary-stat">
            <strong>${completedCount}</strong> of <strong>${storyCount}</strong> stories completed
          </span>
        </div>

        <div class="form-group">
          <label for="sprint-close-title">Sprint Title <span class="required">*</span></label>
          <input type="text"
                 id="sprint-close-title"
                 class="sprint-close-input"
                 placeholder="e.g., Authentication Feature Sprint"
                 value="${this.escapeHtml(defaultTitle)}"
                 maxlength="100"
                 required>
          <small class="form-hint">A short, memorable name for this sprint</small>
        </div>

        <div class="form-group">
          <label for="sprint-close-description">Description <span class="optional">(optional)</span></label>
          <textarea id="sprint-close-description"
                    class="sprint-close-textarea"
                    placeholder="Brief summary of what was accomplished..."
                    rows="3"
                    maxlength="500"></textarea>
        </div>

        ${gitSectionHtml}
      </div>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="sprint-close-cancel-btn">Cancel</button>
      <button class="btn primary" id="sprint-close-confirm-btn">Close Sprint</button>
    `

    // Simplified event handlers for Close Anyway flow
    const commitCheckbox = document.getElementById('sprint-commit-checkbox')
    const commitMessageContainer = document.getElementById('commit-message-container')
    if (commitCheckbox && commitMessageContainer) {
      commitCheckbox.addEventListener('change', (e) => {
        this._sprintCommitEnabled = e.target.checked
        commitMessageContainer.classList.toggle('hidden', !e.target.checked)
      })
    }

    document.getElementById('sprint-close-cancel-btn').addEventListener('click', () => {
      this._pendingCommitMessage = null
      this._userEditedCommitMessage = null
      this._hasUserEditedMessage = false
      this.intents.hideModal()
    })

    document.getElementById('sprint-close-confirm-btn').addEventListener('click', async () => {
      const titleInput = document.getElementById('sprint-close-title')
      const descriptionInput = document.getElementById('sprint-close-description')
      const confirmBtn = document.getElementById('sprint-close-confirm-btn')

      const sprintTitle = titleInput?.value?.trim()
      const sprintDescription = descriptionInput?.value?.trim() || ''

      if (!sprintTitle) {
        titleInput?.focus()
        this.showToast('Please enter a sprint title', 'error')
        return
      }

      const commitCheckbox = document.getElementById('sprint-commit-checkbox')
      const commitMessageTextarea = document.getElementById('sprint-commit-message')
      const shouldCommit = commitCheckbox?.checked && !commitCheckbox?.disabled
      const commitMessage = commitMessageTextarea?.value?.trim()

      const closedSprint = { ...sprint, title: sprintTitle, description: sprintDescription }

      if (confirmBtn) {
        confirmBtn.disabled = true
        confirmBtn.textContent = shouldCommit ? 'Closing & Committing...' : 'Closing...'
      }

      try {
        this._pendingCommitMessage = null
        this._userEditedCommitMessage = null
        this._hasUserEditedMessage = false

        this.intents.clearSprintWithDetails(sprintTitle, sprintDescription)

        if (shouldCommit && commitMessage) {
          const commitResult = await window.puffin.git.stageFiles(['.'])
          if (commitResult.success) {
            const result = await window.puffin.git.commit(commitMessage)
            if (result.success) {
              this.intents.hideModal()
              this.showToast('Sprint closed and changes committed', 'success')
            } else {
              this.intents.hideModal()
              this.showToast(`Sprint closed but commit failed: ${result.error}`, 'warning')
            }
          }
        } else {
          this.intents.hideModal()
          this.showToast('Sprint closed successfully', 'success')
        }

        // Ask if user wants to trigger a code review after closing
        if (this.showCodeReviewConfirmation) {
          setTimeout(() => {
            this.showCodeReviewConfirmation(closedSprint)
          }, 500) // Small delay to let modal close
        }
      } catch (error) {
        console.error('[MODAL] Sprint close error:', error)
        this.intents.hideModal()
        this.showToast(`Sprint closed but an error occurred: ${error.message}`, 'warning')
      }
    })

    // Focus the title input
    setTimeout(() => {
      document.getElementById('sprint-close-title')?.focus()
    }, 100)
  }

  /**
   * Render sprint delete confirmation modal
   * @param {HTMLElement} title - Modal title element
   * @param {HTMLElement} content - Modal content element
   * @param {HTMLElement} actions - Modal actions element
   * @param {Object} sprint - Sprint to delete
   * @param {number} storyCount - Number of stories in sprint
   */
  renderSprintDeleteConfirm(title, content, actions, sprint, storyCount) {
    title.textContent = 'Delete Sprint?'

    // Generate sprint name for display
    const now = new Date()
    const sprintName = sprint?.title ||
      `Sprint ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

    content.innerHTML = `
      <div class="sprint-delete-confirm-content">
        <div class="delete-warning-alert">
          <span class="warning-icon" aria-hidden="true">⚠️</span>
          <span class="warning-message">This action cannot be undone.</span>
        </div>

        <p class="delete-description">
          The sprint "<strong>${this.escapeHtml(sprintName)}</strong>" will be permanently deleted.
        </p>

        <ul class="delete-consequences">
          <li>
            <span class="consequence-icon">📋</span>
            <strong>${storyCount}</strong> user ${storyCount === 1 ? 'story' : 'stories'} will return to the pending story pool
          </li>
          <li>
            <span class="consequence-icon">📊</span>
            The sprint will <strong>NOT</strong> appear in your sprint history
          </li>
        </ul>
      </div>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="sprint-delete-cancel-btn">Cancel</button>
      <button class="btn danger" id="sprint-delete-confirm-btn">Delete Sprint</button>
    `

    // Event listeners
    document.getElementById('sprint-delete-cancel-btn').addEventListener('click', () => {
      // Go back to zero-progress modal
      const titleEl = document.getElementById('modal-title')
      const contentEl = document.getElementById('modal-content')
      const actionsEl = document.getElementById('modal-actions')

      if (titleEl && contentEl && actionsEl) {
        this.renderZeroProgressSprintClose(titleEl, contentEl, actionsEl, sprint, storyCount)
      }
    })

    document.getElementById('sprint-delete-confirm-btn').addEventListener('click', () => {
      // Trigger the delete sprint action
      this.intents.deleteSprint()
      this.intents.hideModal()
      this.showToast('Sprint deleted - stories returned to pending', 'info')
    })

    // Focus the cancel button for safety (user must explicitly click delete)
    setTimeout(() => {
      document.getElementById('sprint-delete-cancel-btn')?.focus()
    }, 100)
  }

  /**
   * Render handoff review modal - Step 1: Review summary
   */
  renderHandoffReview(title, content, actions, data, state) {
    title.textContent = 'Handoff Ready - Review Context'

    // Step 1: Show the summary for review
    content.innerHTML = `
      <div class="handoff-review-content">
        <div class="handoff-thread-info">
          <div class="handoff-field">
            <label>Source Thread:</label>
            <span>${this.escapeHtml(data.sourceThreadName)}</span>
          </div>
          <div class="handoff-field">
            <label>Branch:</label>
            <span>${this.escapeHtml(data.sourceBranch)}</span>
          </div>
        </div>

        <div class="handoff-summary-section">
          <label>Context Summary:</label>
          <div class="handoff-summary-preview">
            <pre>${this.escapeHtml(data.summary)}</pre>
          </div>
        </div>
      </div>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="handoff-cancel-btn">Cancel</button>
      <button class="btn primary" id="handoff-continue-btn">
        <span class="handoff-icon">🤝</span>
        Hand Off to New Thread
      </button>
    `

    // Event listeners
    document.getElementById('handoff-cancel-btn').addEventListener('click', () => {
      this.intents.cancelHandoff()
    })

    document.getElementById('handoff-continue-btn').addEventListener('click', () => {
      this.renderBranchSelection(title, content, actions, data, state)
    })
  }

  /**
   * Render branch selection - Step 2: Select target branch
   */
  renderBranchSelection(title, content, actions, data, state) {
    title.textContent = 'Select Target Branch'

    // Get available branches from state
    const branches = state.history?.branches || []

    content.innerHTML = `
      <div class="handoff-branch-selection">
        <p class="handoff-hint">Choose the branch where you want to start a new thread with this context:</p>
        <div class="branch-list">
          ${branches.length === 0 ? `
            <p class="no-branches">No branches available. Create a branch first.</p>
          ` : branches.map(branch => `
            <button class="branch-select-item" data-branch-id="${this.escapeHtml(branch.id)}">
              <span class="branch-name">${this.escapeHtml(branch.name)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="handoff-back-btn">Back</button>
    `

    // Event listeners
    document.getElementById('handoff-back-btn').addEventListener('click', () => {
      this.renderHandoffReview(title, content, actions, data, state)
    })

    // Handle branch selection
    content.querySelectorAll('.branch-select-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const branchId = btn.dataset.branchId
        const branchName = btn.querySelector('.branch-name')?.textContent || branchId
        this.handleBranchSelection(branchId, branchName, data)
      })
    })
  }

  /**
   * Handle branch selection for handoff
   */
  handleBranchSelection(branchId, branchName, handoffData) {
    console.log('[HANDOFF] Branch selected:', branchId, branchName)

    // 1. Close the modal first
    this.intents.cancelHandoff()

    // 2. Switch to the selected branch
    this.intents.selectBranch(branchId)

    // 3. Dispatch event to show handoff context in prompt area
    // The prompt editor will handle displaying the summary and clearing the view
    const event = new CustomEvent('handoff-received', {
      detail: {
        branchId,
        branchName,
        summary: handoffData.summary,
        sourceThreadName: handoffData.sourceThreadName,
        sourceBranch: handoffData.sourceBranch
      }
    })
    document.dispatchEvent(event)

    this.showToast(`Handoff received! Context ready for new thread in "${branchName}".`, 'success')
  }

  /**
   * Render profile view modal
   */
  async renderProfileView(title, content, actions, isStale = () => false) {
    title.textContent = 'Developer Profile'

    try {
      const result = await window.puffin.profile.get()

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
      const isGitHubConnected = profile.github?.login

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
            <div class="profile-value">
              ${isGitHubConnected ? `@${this.escapeHtml(profile.github.login)}` : 'Not connected'}
            </div>
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
        ${isGitHubConnected
          ? `<button class="btn secondary" id="configure-git-btn" title="Configure Git with GitHub identity">Configure Git</button>
             <button class="btn secondary" id="github-disconnect-btn">Disconnect GitHub</button>`
          : '<button class="btn secondary github-btn" id="github-connect-btn">Connect GitHub</button>'
        }
        <button class="btn primary" id="profile-edit-btn">Edit Profile</button>
      `
      document.getElementById('modal-cancel-btn').addEventListener('click', () => this.intents.hideModal())
      document.getElementById('profile-edit-btn').addEventListener('click', () => {
        this.intents.showModal('profile-edit', {})
      })

      // GitHub connection/disconnection handlers
      const githubConnectBtn = document.getElementById('github-connect-btn')
      if (githubConnectBtn) {
        githubConnectBtn.addEventListener('click', () => this.handleGitHubConnect())
      }

      const githubDisconnectBtn = document.getElementById('github-disconnect-btn')
      if (githubDisconnectBtn) {
        githubDisconnectBtn.addEventListener('click', () => this.handleGitHubDisconnect())
      }

      // Configure Git identity button
      const configureGitBtn = document.getElementById('configure-git-btn')
      if (configureGitBtn) {
        configureGitBtn.addEventListener('click', () => this.autoConfigureGitIdentity(profile))
      }
    } catch (error) {
      content.innerHTML = `<p class="error">Failed to load profile: ${this.escapeHtml(error.message)}</p>`
      actions.innerHTML = '<button class="btn secondary" id="modal-cancel-btn">Close</button>'
      document.getElementById('modal-cancel-btn').addEventListener('click', () => this.intents.hideModal())
    }
  }

  /**
   * Render profile create modal
   */
  async renderProfileCreate(title, content, actions, isStale = () => false) {
    title.textContent = 'Create Developer Profile'

    let options = {}
    try {
      const result = await window.puffin.profile.getOptions()
      if (result.success) {
        options = result.options
      }
    } catch (e) {
      console.error('Failed to get profile options:', e)
    }

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
  async renderProfileEdit(title, content, actions, isStale = () => false) {
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

    const isGitHubConnected = profile.github?.login

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
        <div class="form-group">
          <label>GitHub Connection</label>
          <div class="profile-value">
            ${isGitHubConnected
              ? `Connected as @${this.escapeHtml(profile.github.login)}`
              : 'Not connected'
            }
          </div>
        </div>
      </div>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="modal-cancel-btn">Cancel</button>
      ${isGitHubConnected
        ? '<button class="btn secondary" id="github-disconnect-btn">Disconnect GitHub</button>'
        : '<button class="btn secondary github-btn" id="github-connect-btn">Connect GitHub</button>'
      }
      <button class="btn primary" id="modal-profile-save-btn">Save Changes</button>
    `

    document.getElementById('modal-cancel-btn').addEventListener('click', () => this.intents.hideModal())

    // GitHub connection/disconnection handlers
    const githubConnectBtn = document.getElementById('github-connect-btn')
    if (githubConnectBtn) {
      githubConnectBtn.addEventListener('click', () => this.handleGitHubConnect())
    }

    const githubDisconnectBtn = document.getElementById('github-disconnect-btn')
    if (githubDisconnectBtn) {
      githubDisconnectBtn.addEventListener('click', () => this.handleGitHubDisconnect())
    }

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
   * Handle GitHub OAuth connection
   */
  async handleGitHubConnect() {
    // Show authentication method selection modal
    this.showGitHubAuthModal()
  }

  /**
   * Show GitHub authentication method selection
   */
  showGitHubAuthModal() {
    const modalTitle = document.getElementById('modal-title')
    const modalContent = document.getElementById('modal-content')
    const modalActions = document.getElementById('modal-actions')

    modalTitle.textContent = 'Connect to GitHub'

    modalContent.innerHTML = `
      <div class="github-auth-options">
        <div class="auth-method">
          <h4>Personal Access Token (Recommended)</h4>
          <p>Simple and secure. Generate a token from GitHub and paste it here.</p>
          <div class="form-group">
            <label for="github-pat-input">Personal Access Token</label>
            <input type="password" id="github-pat-input" placeholder="ghp_xxxxxxxxxxxx" class="github-pat-input">
            <small class="form-hint">
              Generate at: <a href="#" id="github-token-link">GitHub Settings → Developer settings → Personal access tokens</a>
              <br>Required scopes: <code>read:user</code>, <code>user:email</code>, <code>repo</code>
            </small>
          </div>
        </div>
        <div class="auth-divider">
          <span>OR</span>
        </div>
        <div class="auth-method">
          <h4>OAuth Device Flow</h4>
          <p>Opens a browser window for authorization (no token needed).</p>
          <button id="oauth-flow-btn" class="btn secondary">Start OAuth Flow</button>
        </div>
      </div>
    `

    modalActions.innerHTML = `
      <button class="btn secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn primary" id="connect-pat-btn">Connect with Token</button>
    `

    // Event listeners
    document.getElementById('modal-cancel-btn').addEventListener('click', () => {
      this.intents.showModal('profile-view', {})
    })

    document.getElementById('github-token-link').addEventListener('click', (e) => {
      e.preventDefault()
      window.puffin.github.openExternal('https://github.com/settings/tokens/new?scopes=read:user,user:email,repo&description=Puffin')
    })

    document.getElementById('connect-pat-btn').addEventListener('click', () => {
      this.handlePATConnect()
    })

    document.getElementById('oauth-flow-btn').addEventListener('click', () => {
      this.handleOAuthFlow()
    })
  }

  /**
   * Handle PAT (Personal Access Token) connection
   */
  async handlePATConnect() {
    const tokenInput = document.getElementById('github-pat-input')
    const token = tokenInput?.value?.trim()

    if (!token) {
      this.showToast('Please enter a Personal Access Token', 'error')
      return
    }

    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      this.showToast('Invalid token format. Token should start with ghp_ or github_pat_', 'error')
      return
    }

    try {
      const result = await window.puffin.github.connectWithPAT(token)

      if (result.success) {
        this.showToast('GitHub connected successfully!', 'success')
        // Auto-configure Git identity with GitHub profile info
        await this.autoConfigureGitIdentity(result.profile)
        this.intents.showModal('profile-view', {})
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('GitHub PAT connection error:', error)
      this.showToast('GitHub authentication failed: ' + error.message, 'error')
    }
  }

  /**
   * Auto-configure Git identity using GitHub profile
   */
  async autoConfigureGitIdentity(profile) {
    try {
      const github = profile?.github
      if (!github) return

      // Use GitHub profile name and email
      const name = github.name || github.login
      const email = github.email || `${github.login}@users.noreply.github.com`

      if (name && email) {
        // Configure globally so it works across all repos
        const result = await window.puffin.git.configureUserIdentity(name, email, true)
        if (result.success) {
          this.showToast(`Git configured: ${name} <${email}>`, 'success')
        }
      }
    } catch (error) {
      console.error('Failed to auto-configure Git identity:', error)
      // Don't show error toast - this is a convenience feature
    }
  }

  /**
   * Handle OAuth Device Flow connection
   */
  async handleOAuthFlow() {
    try {
      // Start device flow
      const startResult = await window.puffin.github.startAuth()
      if (!startResult.success) {
        throw new Error(startResult.error)
      }

      // Open browser for user to authorize
      await window.puffin.github.openAuth(startResult.verificationUri)

      // Show user code for manual entry
      this.showToast(`Opening GitHub authorization. Enter code: ${startResult.userCode}`, 'info')

      // Poll for token
      const pollResult = await window.puffin.github.pollToken(
        startResult.deviceCode,
        startResult.interval,
        startResult.expiresIn
      )

      if (pollResult.success) {
        this.showToast('GitHub connected successfully!', 'success')
        // Auto-configure Git identity with GitHub profile info
        await this.autoConfigureGitIdentity(pollResult.profile)
        this.intents.showModal('profile-view', {})
      } else {
        throw new Error(pollResult.error)
      }
    } catch (error) {
      console.error('GitHub auth error:', error)
      this.showToast('GitHub authentication failed: ' + error.message, 'error')
    }
  }

  /**
   * Handle GitHub disconnection
   */
  async handleGitHubDisconnect() {
    if (!confirm('Are you sure you want to disconnect your GitHub account?')) {
      return
    }

    try {
      const result = await window.puffin.github.disconnect()
      if (result.success) {
        this.showToast('GitHub disconnected successfully', 'success')
        // Refresh the current modal to show updated state
        this.intents.showModal('profile-view', {})
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('GitHub disconnect error:', error)
      this.showToast('Failed to disconnect GitHub: ' + error.message, 'error')
    }
  }

  /**
   * Render CLAUDE.md viewer modal
   */
  async renderClaudeConfigView(title, content, actions, isStale = () => false) {
    title.textContent = 'CLAUDE.md Configuration'
    content.innerHTML = '<p class="loading-text">Loading configuration...</p>'

    try {
      // Check if the claude-config plugin API is available
      if (!window.puffin?.plugins?.claudeConfig?.getConfigWithContext) {
        throw new Error('Claude Config plugin is not installed or not activated')
      }

      // Call the claude-config plugin via IPC
      const result = await window.puffin.plugins.claudeConfig.getConfigWithContext()

      if (isStale()) {
        console.log('Claude config view render cancelled - stale')
        return
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to load configuration')
      }

      const config = result.data
      const branchDisplay = config.branch || 'Not a Git repository'
      const sourceLabel = config.isBranchSpecific ? 'Branch-specific' : 'Project default'
      const sourceClass = config.isBranchSpecific ? 'branch-specific' : 'project-default'

      if (!config.exists) {
        content.innerHTML = `
          <div class="claude-config-view">
            <div class="claude-config-header">
              <div class="config-branch-info">
                <span class="branch-icon">⎇</span>
                <span class="branch-name">${this.escapeHtml(branchDisplay)}</span>
              </div>
            </div>
            <div class="claude-config-empty">
              <p>No CLAUDE.md file found in this project.</p>
              <p class="hint">CLAUDE.md files provide context to Claude Code about your project.</p>
            </div>
          </div>
        `
      } else {
        const renderedContent = this.renderMarkdown(config.content)

        content.innerHTML = `
          <div class="claude-config-view">
            <div class="claude-config-header">
              <div class="config-branch-info">
                <span class="branch-icon">⎇</span>
                <span class="branch-name">${this.escapeHtml(branchDisplay)}</span>
              </div>
              <div class="config-source ${sourceClass}">
                <span class="source-indicator"></span>
                <span class="source-label">${sourceLabel}</span>
              </div>
            </div>
            <div class="claude-config-content markdown-body">
              ${renderedContent}
            </div>
            <div class="claude-config-footer">
              <span class="config-path" title="${this.escapeHtml(config.path)}">
                ${this.escapeHtml(config.path.split(/[\\/]/).slice(-2).join('/'))}
              </span>
            </div>
          </div>
        `
      }

      actions.innerHTML = `
        <button class="btn secondary" id="modal-cancel-btn">Close</button>
      `

      document.getElementById('modal-cancel-btn').addEventListener('click', () => {
        this.intents.hideModal()
      })

    } catch (error) {
      console.error('Failed to load CLAUDE.md:', error)

      if (isStale()) return

      content.innerHTML = `
        <div class="claude-config-error">
          <p class="error-message">Failed to load CLAUDE.md configuration</p>
          <p class="error-detail">${this.escapeHtml(error.message)}</p>
        </div>
      `

      actions.innerHTML = `
        <button class="btn secondary" id="modal-cancel-btn">Close</button>
      `

      document.getElementById('modal-cancel-btn').addEventListener('click', () => {
        this.intents.hideModal()
      })
    }
  }

  /**
   * Simple markdown renderer for modal content
   * Reuses patterns from handoff summary rendering
   */
  renderMarkdown(text) {
    if (!text) return ''

    return text
      // Headers
      .replace(/^#### (.+)$/gm, '<h5>$1</h5>')
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Horizontal rules
      .replace(/^---+$/gm, '<hr>')
      // Unordered lists
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      // Ordered lists
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      // Paragraphs (simple - just preserve line breaks)
      .replace(/\n\n/g, '</p><p>')
      // Clean up
      .replace(/<p><\/p>/g, '')
      .replace(/<p>(<h[2345]>)/g, '$1')
      .replace(/(<\/h[2345]>)<\/p>/g, '$1')
      .replace(/<p>(<ul>)/g, '$1')
      .replace(/(<\/ul>)<\/p>/g, '$1')
      .replace(/<p>(<pre>)/g, '$1')
      .replace(/(<\/pre>)<\/p>/g, '$1')
      .replace(/<p>(<hr>)/g, '$1')
      .replace(/(<hr>)<\/p>/g, '$1')
  }

  /**
   * Render story detail modal - full view with all fields editable
   */
  renderStoryDetail(title, content, actions, data) {
    const story = data?.story
    if (!story) {
      title.textContent = 'Story Not Found'
      content.innerHTML = '<p>The requested story could not be found.</p>'
      actions.innerHTML = '<button class="btn secondary" id="modal-cancel-btn">Close</button>'
      document.getElementById('modal-cancel-btn')?.addEventListener('click', () => this.intents.hideModal())
      return
    }

    title.textContent = 'Story Details'

    const statuses = ['pending', 'in-progress', 'completed', 'archived']
    const criteriaHtml = (story.acceptanceCriteria || []).map((c, i) => `
      <div class="criteria-item" data-index="${i}">
        <input type="text" class="criteria-input" value="${this.escapeHtml(c)}" placeholder="Acceptance criterion">
        <button type="button" class="criteria-remove-btn" title="Remove criterion" aria-label="Remove criterion">×</button>
      </div>
    `).join('')

    content.innerHTML = `
      <form id="story-detail-form" class="story-detail-form">
        <div class="story-detail-ris-bar">
          <a href="#" class="story-ris-link story-detail-ris-link" data-story-id="${story.id}" title="View Refined Implementation Specification">View RIS</a>
        </div>
        <div class="form-group">
          <label for="story-title">Title <span class="required">*</span></label>
          <input type="text" id="story-title" class="form-input" value="${this.escapeHtml(story.title)}" required maxlength="200">
        </div>

        <div class="form-group">
          <label for="story-status">Status</label>
          <select id="story-status" class="form-select">
            ${statuses.map(s => `
              <option value="${s}" ${story.status === s ? 'selected' : ''}>
                ${this.formatStatus(s)}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="form-group">
          <label for="story-description">Description</label>
          <textarea id="story-description" class="form-textarea" rows="4" placeholder="As a [user], I want [feature] so that [benefit]...">${this.escapeHtml(story.description || '')}</textarea>
        </div>

        <div class="form-group">
          <label>Acceptance Criteria</label>
          <div id="criteria-list" class="criteria-list">
            ${criteriaHtml || '<p class="no-criteria">No acceptance criteria defined.</p>'}
          </div>
          <button type="button" id="add-criterion-btn" class="btn small secondary">+ Add Criterion</button>
        </div>

        <div class="form-group assertions-section">
          <label>
            Inspection Assertions
            <button type="button" id="generate-assertions-btn" class="btn small secondary" title="Generate assertions from criteria">
              Generate
            </button>
          </label>
          <p class="form-hint">Assertions verify implementation correctness when the story is marked complete.</p>
          <div id="assertions-list" class="assertions-editor-list">
            <p class="no-assertions">No assertions defined. Click "Generate" to auto-generate from acceptance criteria.</p>
          </div>
          <button type="button" id="add-assertion-btn" class="btn small secondary">+ Add Assertion</button>
        </div>

        ${story.completionSummary ? `
        <div class="form-group completion-summary-section">
          <label>Completion Summary</label>
          <div class="completion-summary">
            <p class="completion-summary-text">${this.escapeHtml(story.completionSummary.summary || '')}</p>
            ${story.completionSummary.filesModified?.length > 0 ? `
              <details class="completion-detail">
                <summary>Files modified (${story.completionSummary.filesModified.length})</summary>
                <ul class="completion-files">${story.completionSummary.filesModified.map(f => `<li>${this.escapeHtml(f)}</li>`).join('')}</ul>
              </details>
            ` : ''}
            ${story.completionSummary.criteriaStatus?.length > 0 ? `
              <details class="completion-detail">
                <summary>Acceptance criteria status</summary>
                <ul class="completion-criteria">${story.completionSummary.criteriaStatus.map(c => `<li class="${c.met ? 'met' : 'unmet'}">${c.met ? '&#10003;' : '&#10007;'} ${this.escapeHtml(c.criterion || '')}</li>`).join('')}</ul>
              </details>
            ` : ''}
            <div class="completion-stats">
              ${story.completionSummary.testStatus ? `<span class="completion-stat">Tests: ${this.escapeHtml(story.completionSummary.testStatus)}</span>` : ''}
              ${story.completionSummary.turns ? `<span class="completion-stat">Turns: ${story.completionSummary.turns}</span>` : ''}
              ${story.completionSummary.cost ? `<span class="completion-stat">Cost: $${story.completionSummary.cost.toFixed(4)}</span>` : ''}
              ${story.completionSummary.duration ? `<span class="completion-stat">Duration: ${Math.round(story.completionSummary.duration / 1000)}s</span>` : ''}
            </div>
          </div>
        </div>
        ` : ''}

        <div class="story-meta">
          <span class="meta-item">Created: ${this.formatDate(story.createdAt)}</span>
          ${story.branchId ? `<span class="meta-item">Branch: ${this.escapeHtml(story.branchId)}</span>` : ''}
          ${story.sourcePromptId ? '<span class="meta-item">Auto-extracted</span>' : ''}
        </div>
      </form>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="story-cancel-btn">Cancel</button>
      <button class="btn primary" id="story-save-btn">Save Changes</button>
    `

    // Initialize assertions from story data
    this.generatedAssertions = story.inspectionAssertions || []
    this.renderAssertionsList()

    this.bindStoryDetailEvents(data, story)
  }

  /**
   * Bind events for story detail modal
   */
  bindStoryDetailEvents(data, story) {
    // Cancel button
    document.getElementById('story-cancel-btn')?.addEventListener('click', () => {
      this.intents.hideModal()
    })

    // Save button
    document.getElementById('story-save-btn')?.addEventListener('click', () => {
      this.saveStoryDetail(data)
    })

    // RIS link
    document.querySelector('.story-detail-ris-link')?.addEventListener('click', (e) => {
      e.preventDefault()
      const storyId = e.target.dataset.storyId
      this.intents.hideModal()
      this.intents.showModal('ris-view', { storyId, storyTitle: story.title })
    })

    // Add criterion button
    document.getElementById('add-criterion-btn')?.addEventListener('click', () => {
      this.addCriterionField()
    })

    // Remove criterion buttons (use event delegation)
    document.getElementById('criteria-list')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('criteria-remove-btn')) {
        const item = e.target.closest('.criteria-item')
        if (item) {
          item.remove()
          this.updateCriteriaPlaceholder()
        }
      }
    })

    // Generate assertions button
    document.getElementById('generate-assertions-btn')?.addEventListener('click', () => {
      this.generateAssertionsFromForm()
    })

    // Add assertion button
    document.getElementById('add-assertion-btn')?.addEventListener('click', () => {
      this.addAssertionField()
    })

    // Remove assertion buttons
    document.getElementById('assertions-list')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('assertion-remove-btn')) {
        const item = e.target.closest('.assertion-editor-item')
        if (item) {
          const assertionId = item.dataset.assertionId
          this.generatedAssertions = this.generatedAssertions.filter(a => a.id !== assertionId)
          item.remove()
          this.updateAssertionsPlaceholder()
        }
      }
    })

    // Keyboard handler for Escape
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        this.intents.hideModal()
        document.removeEventListener('keydown', handleEscape)
      }
    }
    document.addEventListener('keydown', handleEscape)

    // Focus title input
    setTimeout(() => {
      document.getElementById('story-title')?.focus()
    }, 100)
  }

  /**
   * Add a new criterion input field
   */
  addCriterionField() {
    const list = document.getElementById('criteria-list')
    if (!list) return

    // Remove "no criteria" placeholder if present
    const placeholder = list.querySelector('.no-criteria')
    if (placeholder) placeholder.remove()

    const index = list.querySelectorAll('.criteria-item').length
    const newItem = document.createElement('div')
    newItem.className = 'criteria-item'
    newItem.dataset.index = index
    newItem.innerHTML = `
      <input type="text" class="criteria-input" value="" placeholder="Acceptance criterion">
      <button type="button" class="criteria-remove-btn" title="Remove criterion" aria-label="Remove criterion">×</button>
    `
    list.appendChild(newItem)

    // Add blur handler for auto-generation
    const input = newItem.querySelector('.criteria-input')
    input?.addEventListener('blur', () => {
      this.scheduleAutoGeneration()
    })

    // Focus the new input
    input?.focus()
  }

  /**
   * Schedule auto-generation of assertions (debounced)
   * Triggers generation after user finishes editing criteria
   */
  scheduleAutoGeneration() {
    // Clear any existing timer
    if (this.autoGenerateTimer) {
      clearTimeout(this.autoGenerateTimer)
    }

    // Debounce: wait 500ms after last blur before generating
    this.autoGenerateTimer = setTimeout(() => {
      this.autoGenerateAssertions()
    }, 500)
  }

  /**
   * Auto-generate assertions from current form values
   * Only generates if there are criteria and no assertions yet
   */
  async autoGenerateAssertions() {
    const criteriaInputs = document.querySelectorAll('#criteria-list .criteria-input')
    const criteria = Array.from(criteriaInputs)
      .map(input => input.value.trim())
      .filter(c => c.length > 0)

    // Only auto-generate if:
    // 1. There are acceptance criteria
    // 2. No assertions have been generated yet (user can still use Generate button)
    if (criteria.length === 0 || (this.generatedAssertions && this.generatedAssertions.length > 0)) {
      return
    }

    // Auto-generate
    await this.generateAssertionsFromForm()
  }

  /**
   * Update criteria placeholder if list is empty
   */
  updateCriteriaPlaceholder() {
    const list = document.getElementById('criteria-list')
    if (!list) return

    if (list.querySelectorAll('.criteria-item').length === 0) {
      list.innerHTML = '<p class="no-criteria">No acceptance criteria defined.</p>'
    }
  }

  /**
   * Save story detail from modal form
   */
  saveStoryDetail(data) {
    const titleInput = document.getElementById('story-title')
    const statusSelect = document.getElementById('story-status')
    const descriptionInput = document.getElementById('story-description')
    const criteriaInputs = document.querySelectorAll('#criteria-list .criteria-input')

    const newTitle = titleInput?.value?.trim()
    if (!newTitle) {
      titleInput?.focus()
      this.showToast('Title is required', 'error')
      return
    }

    const acceptanceCriteria = Array.from(criteriaInputs)
      .map(input => input.value.trim())
      .filter(c => c.length > 0)

    // Collect assertions from the editor
    const inspectionAssertions = this.collectAssertionsFromEditor()

    const updatedData = {
      title: newTitle,
      status: statusSelect?.value || 'pending',
      description: descriptionInput?.value?.trim() || '',
      acceptanceCriteria,
      inspectionAssertions
    }

    if (data?.onSubmit) {
      data.onSubmit(updatedData)
    }

    this.intents.hideModal()
    this.showToast('Story updated successfully', 'success')
  }

  /**
   * Render add user story modal
   */
  renderAddUserStory(title, content, actions, data) {
    title.textContent = 'Add User Story'

    content.innerHTML = `
      <form id="add-story-form" class="story-detail-form">
        <div class="form-group">
          <label for="story-title">Title <span class="required">*</span></label>
          <input type="text" id="story-title" class="form-input" placeholder="Brief descriptive title" required maxlength="200">
        </div>

        <div class="form-group">
          <label for="story-description">Description</label>
          <textarea id="story-description" class="form-textarea" rows="4" placeholder="As a [user], I want [feature] so that [benefit]..."></textarea>
        </div>

        <div class="form-group">
          <label>Acceptance Criteria</label>
          <div id="criteria-list" class="criteria-list">
            <p class="no-criteria">No acceptance criteria defined.</p>
          </div>
          <button type="button" id="add-criterion-btn" class="btn small secondary">+ Add Criterion</button>
        </div>

        <div class="form-group assertions-section">
          <label>
            Inspection Assertions
            <button type="button" id="generate-assertions-btn" class="btn small secondary" title="Generate assertions from criteria">
              Generate
            </button>
          </label>
          <p class="form-hint">Assertions verify implementation correctness when the story is marked complete.</p>
          <div id="assertions-list" class="assertions-editor-list">
            <p class="no-assertions">No assertions defined. Click "Generate" to auto-generate from acceptance criteria.</p>
          </div>
          <button type="button" id="add-assertion-btn" class="btn small secondary">+ Add Assertion</button>
        </div>
      </form>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="story-cancel-btn">Cancel</button>
      <button class="btn primary" id="story-save-btn">Add Story</button>
    `

    // Store generated assertions
    this.generatedAssertions = []

    this.bindAddStoryEvents(data)
  }

  /**
   * Bind events for add story modal
   */
  bindAddStoryEvents(data) {
    // Cancel button
    document.getElementById('story-cancel-btn')?.addEventListener('click', () => {
      this.intents.hideModal()
    })

    // Save button
    document.getElementById('story-save-btn')?.addEventListener('click', () => {
      this.saveNewStory(data)
    })

    // Add criterion button
    document.getElementById('add-criterion-btn')?.addEventListener('click', () => {
      this.addCriterionField()
    })

    // Remove criterion buttons
    document.getElementById('criteria-list')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('criteria-remove-btn')) {
        const item = e.target.closest('.criteria-item')
        if (item) {
          item.remove()
          this.updateCriteriaPlaceholder()
        }
      }
    })

    // Generate assertions button
    document.getElementById('generate-assertions-btn')?.addEventListener('click', () => {
      this.generateAssertionsFromForm()
    })

    // Add assertion button
    document.getElementById('add-assertion-btn')?.addEventListener('click', () => {
      this.addAssertionField()
    })

    // Remove assertion buttons
    document.getElementById('assertions-list')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('assertion-remove-btn')) {
        const item = e.target.closest('.assertion-editor-item')
        if (item) {
          const assertionId = item.dataset.assertionId
          this.generatedAssertions = this.generatedAssertions.filter(a => a.id !== assertionId)
          item.remove()
          this.updateAssertionsPlaceholder()
        }
      }
    })

    // Keyboard handler for Escape
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        this.intents.hideModal()
        document.removeEventListener('keydown', handleEscape)
      }
    }
    document.addEventListener('keydown', handleEscape)

    // Focus title input
    setTimeout(() => {
      document.getElementById('story-title')?.focus()
    }, 100)
  }

  /**
   * Save new story from add modal
   */
  saveNewStory(data) {
    const titleInput = document.getElementById('story-title')
    const descriptionInput = document.getElementById('story-description')
    const criteriaInputs = document.querySelectorAll('#criteria-list .criteria-input')

    const newTitle = titleInput?.value?.trim()
    if (!newTitle) {
      titleInput?.focus()
      this.showToast('Title is required', 'error')
      return
    }

    const acceptanceCriteria = Array.from(criteriaInputs)
      .map(input => input.value.trim())
      .filter(c => c.length > 0)

    // Collect assertions from the editor
    const inspectionAssertions = this.collectAssertionsFromEditor()

    const storyData = {
      title: newTitle,
      description: descriptionInput?.value?.trim() || '',
      acceptanceCriteria,
      inspectionAssertions
    }

    if (data?.onSubmit) {
      data.onSubmit(storyData)
    }

    this.intents.hideModal()
    this.showToast('Story added successfully', 'success')
  }

  /**
   * Collect assertions from the editor UI
   * @returns {Object[]} Array of assertion objects
   */
  collectAssertionsFromEditor() {
    const assertions = []
    const items = document.querySelectorAll('#assertions-list .assertion-editor-item')

    items.forEach(item => {
      const typeSelect = item.querySelector('.assertion-type-select')
      const targetInput = item.querySelector('.assertion-target-input')
      const messageInput = item.querySelector('.assertion-message-input')

      if (typeSelect && targetInput && messageInput) {
        assertions.push({
          id: item.dataset.assertionId || `IA${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          type: typeSelect.value,
          target: targetInput.value.trim(),
          message: messageInput.value.trim(),
          assertion: {},
          generated: item.dataset.generated === 'true'
        })
      }
    })

    return assertions.filter(a => a.target && a.message)
  }

  /**
   * Generate assertions from the current form values
   */
  async generateAssertionsFromForm() {
    const titleInput = document.getElementById('story-title')
    const descriptionInput = document.getElementById('story-description')
    const criteriaInputs = document.querySelectorAll('#criteria-list .criteria-input')

    const story = {
      title: titleInput?.value?.trim() || '',
      description: descriptionInput?.value?.trim() || '',
      acceptanceCriteria: Array.from(criteriaInputs)
        .map(input => input.value.trim())
        .filter(c => c.length > 0)
    }

    if (!story.title && story.acceptanceCriteria.length === 0) {
      this.showToast('Add a title or acceptance criteria first', 'warning')
      return
    }

    const generateBtn = document.getElementById('generate-assertions-btn')
    if (generateBtn) {
      generateBtn.disabled = true
      generateBtn.textContent = 'Generating...'
    }

    try {
      const result = await window.puffin.state.generateAssertions(story, { includeSuggestions: true })

      if (result.success) {
        // Merge with existing assertions (don't duplicate)
        const existingIds = new Set(this.generatedAssertions.map(a => a.id))
        const newAssertions = result.assertions.filter(a => !existingIds.has(a.id))
        this.generatedAssertions = [...this.generatedAssertions, ...newAssertions]

        // Render all assertions
        this.renderAssertionsList()

        const count = result.assertions.length
        this.showToast(`Generated ${count} assertion${count !== 1 ? 's' : ''}`, 'success')
      } else {
        this.showToast('Failed to generate assertions', 'error')
      }
    } catch (error) {
      console.error('[MODAL] Assertion generation error:', error)
      this.showToast('Failed to generate assertions', 'error')
    } finally {
      if (generateBtn) {
        generateBtn.disabled = false
        generateBtn.textContent = 'Generate'
      }
    }
  }

  /**
   * Render the assertions list in the editor
   */
  renderAssertionsList() {
    const list = document.getElementById('assertions-list')
    if (!list) return

    if (this.generatedAssertions.length === 0) {
      list.innerHTML = '<p class="no-assertions">No assertions defined. Click "Generate" to auto-generate from acceptance criteria.</p>'
      return
    }

    list.innerHTML = this.generatedAssertions.map(assertion => this.renderAssertionEditorItem(assertion)).join('')
  }

  /**
   * Render a single assertion editor item
   * @param {Object} assertion
   * @returns {string} HTML
   */
  renderAssertionEditorItem(assertion) {
    const types = [
      'FILE_EXISTS', 'FILE_CONTAINS', 'JSON_PROPERTY', 'EXPORT_EXISTS',
      'CLASS_STRUCTURE', 'FUNCTION_SIGNATURE', 'IMPORT_EXISTS',
      'IPC_HANDLER_REGISTERED', 'CSS_SELECTOR_EXISTS', 'PATTERN_MATCH'
    ]

    const typeOptions = types.map(t =>
      `<option value="${t}" ${assertion.type === t ? 'selected' : ''}>${this.formatAssertionType(t)}</option>`
    ).join('')

    return `
      <div class="assertion-editor-item" data-assertion-id="${assertion.id}" data-generated="${assertion.generated || false}">
        <div class="assertion-editor-row">
          <select class="assertion-type-select form-select" title="Assertion type">
            ${typeOptions}
          </select>
          <input type="text" class="assertion-target-input form-input" placeholder="Target path" value="${this.escapeHtml(assertion.target || '')}" title="Target file or pattern">
          <button type="button" class="assertion-remove-btn btn small danger" title="Remove assertion">×</button>
        </div>
        <input type="text" class="assertion-message-input form-input" placeholder="Description" value="${this.escapeHtml(assertion.message || '')}" title="What this assertion verifies">
        ${assertion.criterion ? `<span class="assertion-criterion-badge">${assertion.criterion}</span>` : ''}
      </div>
    `
  }

  /**
   * Format assertion type for display
   * @param {string} type
   * @returns {string}
   */
  formatAssertionType(type) {
    return type.split('_').map(word => word.charAt(0) + word.slice(1).toLowerCase()).join(' ')
  }

  /**
   * Add a blank assertion field
   */
  addAssertionField() {
    const newAssertion = {
      id: `IA${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      type: 'FILE_EXISTS',
      target: '',
      message: '',
      generated: false
    }
    this.generatedAssertions.push(newAssertion)
    this.renderAssertionsList()

    // Focus the new target input
    setTimeout(() => {
      const items = document.querySelectorAll('#assertions-list .assertion-editor-item')
      const lastItem = items[items.length - 1]
      lastItem?.querySelector('.assertion-target-input')?.focus()
    }, 50)
  }

  /**
   * Update assertions placeholder visibility
   */
  updateAssertionsPlaceholder() {
    const list = document.getElementById('assertions-list')
    if (!list) return

    const items = list.querySelectorAll('.assertion-editor-item')
    if (items.length === 0) {
      list.innerHTML = '<p class="no-assertions">No assertions defined. Click "Generate" to auto-generate from acceptance criteria.</p>'
    }
  }

  /**
   * Render edit user story modal (simpler version - just redirects to story-detail)
   */
  renderEditUserStory(title, content, actions, data) {
    // Reuse story detail modal for editing
    this.renderStoryDetail(title, content, actions, data)
    title.textContent = 'Edit Story'
  }

  /**
   * Render sprint stories modal - shows all stories from an archived sprint
   */
  renderSprintStories(title, content, actions, data) {
    const { sprint, stories } = data || {}

    if (!sprint) {
      title.textContent = 'Sprint Not Found'
      content.innerHTML = '<p>The requested sprint could not be found.</p>'
      actions.innerHTML = '<button class="btn secondary" id="modal-cancel-btn">Close</button>'
      document.getElementById('modal-cancel-btn')?.addEventListener('click', () => {
        this.intents.hideModal()
      })
      return
    }

    // Format sprint title - try closedAt, createdAt, or fallback to ID
    let sprintTitle = sprint.title
    if (!sprintTitle) {
      const dateStr = sprint.closedAt || sprint.createdAt
      if (dateStr) {
        const date = new Date(dateStr)
        if (!isNaN(date.getTime())) {
          sprintTitle = `Sprint ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        }
      }
    }
    if (!sprintTitle) {
      sprintTitle = `Archived Sprint`
    }

    // Format closed date
    let closedDate = ''
    if (sprint.closedAt) {
      const date = new Date(sprint.closedAt)
      if (!isNaN(date.getTime())) {
        closedDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      }
    }

    title.textContent = sprintTitle

    // Build stories list HTML - show helpful message for deleted stories
    const storiesHtml = stories && stories.length > 0
      ? stories.map(story => {
          const isDeleted = story.status === 'unknown' || story.title === '[Deleted Story]'
          if (isDeleted) {
            return `
              <div class="sprint-story-item deleted">
                <div class="sprint-story-header">
                  <span class="sprint-story-status-badge archived">Archived</span>
                  <h4 class="sprint-story-title text-muted">Story data unavailable</h4>
                </div>
                <p class="sprint-story-description text-muted">This story was part of the sprint but the original data is no longer available.</p>
              </div>
            `
          }

          // Render assertion status indicator if assertions exist
          const assertionStatusHtml = this.renderAssertionStatusBadge(story)

          return `
            <div class="sprint-story-item ${story.status || ''}">
              <div class="sprint-story-header">
                <span class="sprint-story-status-badge ${story.status || 'pending'}">${this.formatStatus(story.status || 'pending')}</span>
                ${assertionStatusHtml}
                <h4 class="sprint-story-title">${this.escapeHtml(story.title)}</h4>
              </div>
              ${story.description ? `<p class="sprint-story-description">${this.escapeHtml(story.description)}</p>` : ''}
              ${story.acceptanceCriteria && story.acceptanceCriteria.length > 0 ? `
                <div class="sprint-story-criteria">
                  <strong>Acceptance Criteria:</strong>
                  <ul>
                    ${story.acceptanceCriteria.map(c => `<li>${this.escapeHtml(typeof c === 'string' ? c : c.text || c.description || '')}</li>`).join('')}
                  </ul>
                </div>
              ` : ''}
              ${this.renderAssertionSummary(story)}
            </div>
          `
        }).join('')
      : '<p class="no-stories">No stories were recorded for this sprint.</p>'

    // Show story count summary
    const storyCount = stories?.length || 0
    const validStories = stories?.filter(s => s.status !== 'unknown' && s.title !== '[Deleted Story]').length || 0

    content.innerHTML = `
      <div class="sprint-stories-modal">
        <div class="sprint-meta">
          ${closedDate ? `<span class="sprint-date">Closed: ${closedDate}</span>` : ''}
          <span class="sprint-story-count">${storyCount} ${storyCount === 1 ? 'story' : 'stories'}</span>
        </div>
        <div class="sprint-stories-list">
          ${storiesHtml}
        </div>
      </div>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="modal-close-btn">Close</button>
    `

    document.getElementById('modal-close-btn')?.addEventListener('click', () => {
      this.intents.hideModal()
    })
  }

  /**
   * Render assertion failures modal - shows detailed failure report
   */
  renderAssertionFailures(title, content, actions, data) {
    const { story, results, onWaive, onDefer, onRerun, onClose } = data || {}

    if (!story || !results) {
      title.textContent = 'Error'
      content.innerHTML = '<p>No failure data available.</p>'
      actions.innerHTML = '<button class="btn secondary" id="modal-cancel-btn">Close</button>'
      document.getElementById('modal-cancel-btn')?.addEventListener('click', () => this.intents.hideModal())
      return
    }

    const { passed, failed, total } = results.summary || { passed: 0, failed: 0, total: 0 }
    const failedResults = (results.results || []).filter(r => r.status === 'failed' || r.status === 'error')
    const assertions = story.inspectionAssertions || []

    // Build assertion lookup map
    const assertionMap = new Map()
    assertions.forEach(a => assertionMap.set(a.id, a))

    title.textContent = `Assertion Failures: ${story.title}`

    // Generate failure items HTML
    const failuresHtml = failedResults.map(result => {
      const assertion = assertionMap.get(result.assertionId)
      if (!assertion) return ''

      const typeDisplay = assertion.type
        .split('_')
        .map(word => word.charAt(0) + word.slice(1).toLowerCase())
        .join(' ')

      const details = result.details || {}
      const hasExpected = details.expected !== undefined && details.expected !== null
      const hasActual = details.actual !== undefined && details.actual !== null
      const hasSuggestion = details.suggestion

      return `
        <div class="assertion-failure-item" data-assertion-id="${assertion.id}">
          <div class="failure-header">
            <span class="failure-status ${result.status}">${result.status === 'error' ? '!' : '✗'}</span>
            <span class="failure-type">${typeDisplay}</span>
            <span class="failure-target" title="${this.escapeHtml(assertion.target)}">${this.escapeHtml(assertion.target)}</span>
          </div>
          <div class="failure-message">${this.escapeHtml(assertion.message)}</div>

          ${hasExpected || hasActual || hasSuggestion ? `
            <div class="failure-details">
              ${hasExpected ? `
                <div class="failure-detail-row">
                  <span class="detail-label">Expected:</span>
                  <code class="detail-value expected">${this.escapeHtml(String(details.expected))}</code>
                </div>
              ` : ''}
              ${hasActual ? `
                <div class="failure-detail-row">
                  <span class="detail-label">Actual:</span>
                  <code class="detail-value actual">${this.escapeHtml(String(details.actual))}</code>
                </div>
              ` : ''}
              ${hasSuggestion ? `
                <div class="failure-detail-row suggestion">
                  <span class="detail-label">💡 Suggestion:</span>
                  <span class="detail-value">${this.escapeHtml(details.suggestion)}</span>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div class="failure-actions">
            <button class="btn small primary failure-rerun-btn"
                    data-assertion-id="${assertion.id}"
                    title="Re-run this assertion after fixing">
              ↻ Re-run
            </button>
            <button class="btn small secondary failure-waive-btn"
                    data-assertion-id="${assertion.id}"
                    title="Accept this failure and continue">
              Waive
            </button>
            <button class="btn small secondary failure-defer-btn"
                    data-assertion-id="${assertion.id}"
                    title="Defer to fix later">
              Defer
            </button>
          </div>
        </div>
      `
    }).join('')

    content.innerHTML = `
      <div class="assertion-failures-modal">
        <div class="failures-summary">
          <div class="summary-stats">
            <span class="stat passed">${passed} passed</span>
            <span class="stat failed">${failed} failed</span>
            <span class="stat total">of ${total} assertions</span>
          </div>
          <div class="summary-evaluated">
            Last evaluated: ${this.formatDateTime(results.evaluatedAt)}
          </div>
        </div>

        <div class="failures-list">
          ${failuresHtml || '<p class="no-failures">No failures to display.</p>'}
        </div>
      </div>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="failures-close-btn">Close</button>
      <button class="btn secondary" id="failures-waive-all-btn" title="Waive all failures and continue">Waive All</button>
      <button class="btn primary" id="failures-rerun-all-btn" title="Re-run all failed assertions">Re-run All</button>
    `

    // Bind event handlers
    this.bindAssertionFailureEvents(data, story, failedResults)
  }

  /**
   * Bind events for assertion failure modal
   */
  bindAssertionFailureEvents(data, story, failedResults) {
    const { onWaive, onDefer, onRerun, onClose } = data || {}

    // Close button
    document.getElementById('failures-close-btn')?.addEventListener('click', () => {
      if (onClose) onClose()
      this.intents.hideModal()
    })

    // Waive all button
    document.getElementById('failures-waive-all-btn')?.addEventListener('click', async () => {
      if (onWaive) {
        const waiveIds = failedResults.map(r => r.assertionId)
        for (const id of waiveIds) {
          await onWaive(story.id, id, 'Bulk waive from failure report')
        }
        this.showToast(`Waived ${waiveIds.length} assertion${waiveIds.length !== 1 ? 's' : ''}`, 'info')
        this.intents.hideModal()
      }
    })

    // Re-run all button
    document.getElementById('failures-rerun-all-btn')?.addEventListener('click', async () => {
      if (onRerun) {
        await onRerun(story.id)
        this.showToast('Re-running all assertions...', 'info')
        this.intents.hideModal()
      }
    })

    // Individual failure action buttons
    document.querySelectorAll('.failure-rerun-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const assertionId = btn.dataset.assertionId
        if (onRerun) {
          btn.disabled = true
          btn.innerHTML = '<span class="eval-spinner-small"></span>'
          await onRerun(story.id, assertionId)
          // Modal will be refreshed by parent component if needed
        }
      })
    })

    document.querySelectorAll('.failure-waive-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const assertionId = btn.dataset.assertionId
        // Show waive reason input
        this.showWaiveReasonPrompt(story.id, assertionId, onWaive, btn)
      })
    })

    document.querySelectorAll('.failure-defer-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const assertionId = btn.dataset.assertionId
        if (onDefer) {
          await onDefer(story.id, assertionId)
          // Remove item from list visually
          const item = btn.closest('.assertion-failure-item')
          if (item) {
            item.classList.add('deferred')
            item.innerHTML = '<div class="deferred-notice">Deferred to fix later</div>'
          }
          this.showToast('Assertion deferred', 'info')
        }
      })
    })

    // Keyboard handler for Escape
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (onClose) onClose()
        this.intents.hideModal()
        document.removeEventListener('keydown', handleEscape)
      }
    }
    document.addEventListener('keydown', handleEscape)
  }

  /**
   * Show inline waive reason prompt
   */
  showWaiveReasonPrompt(storyId, assertionId, onWaive, triggerBtn) {
    const item = triggerBtn.closest('.assertion-failure-item')
    if (!item) return

    // Check if prompt already exists
    if (item.querySelector('.waive-reason-prompt')) return

    const actionsDiv = item.querySelector('.failure-actions')
    const prompt = document.createElement('div')
    prompt.className = 'waive-reason-prompt'
    prompt.innerHTML = `
      <input type="text"
             class="waive-reason-input"
             placeholder="Reason for waiving (optional)"
             maxlength="200">
      <div class="waive-prompt-actions">
        <button class="btn small primary confirm-waive-btn">Confirm Waive</button>
        <button class="btn small secondary cancel-waive-btn">Cancel</button>
      </div>
    `

    actionsDiv.style.display = 'none'
    item.appendChild(prompt)

    const input = prompt.querySelector('.waive-reason-input')
    input.focus()

    prompt.querySelector('.confirm-waive-btn').addEventListener('click', async () => {
      const reason = input.value.trim() || 'No reason provided'
      if (onWaive) {
        await onWaive(storyId, assertionId, reason)
        item.classList.add('waived')
        item.innerHTML = `<div class="waived-notice">Waived: ${this.escapeHtml(reason)}</div>`
        this.showToast('Assertion waived', 'info')
      }
    })

    prompt.querySelector('.cancel-waive-btn').addEventListener('click', () => {
      prompt.remove()
      actionsDiv.style.display = ''
    })

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        prompt.querySelector('.confirm-waive-btn').click()
      } else if (e.key === 'Escape') {
        prompt.querySelector('.cancel-waive-btn').click()
      }
    })
  }

  /**
   * Render the RIS viewer modal
   * @param {HTMLElement} title - Modal title element
   * @param {HTMLElement} content - Modal content element
   * @param {HTMLElement} actions - Modal actions element
   * @param {Object} data - { storyId, storyTitle }
   */
  /**
   * Render the plan review modal with split-pane layout.
   * Left: plan content. Right: Q&A history.
   * @param {HTMLElement} title - Modal title element
   * @param {HTMLElement} content - Modal content element
   * @param {HTMLElement} actions - Modal actions element
   * @param {Object} data - { plan, stories, sprintId, readOnly }
   */
  renderPlanReview(title, content, actions, data) {
    const { plan: planData, stories, sprintId, readOnly } = data || {}

    // Normalise plan structure (may be nested under .plan)
    const plan = planData?.plan || planData || {}
    const planItems = plan.planItems || planData?.planItems || []
    const risks = plan.risks || planData?.risks || []
    const sharedComponents = plan.sharedComponents || planData?.sharedComponents || []
    const clarificationHistory = plan.clarificationHistory || planData?.clarificationHistory || []
    const planId = plan.id || planData?.id || ''

    title.textContent = readOnly ? 'Sprint Plan' : 'CRE Plan Review'

    // Build plan HTML (left pane)
    let planHtml = ''

    if (planItems.length > 0) {
      planHtml += '<h4 class="plan-review-heading">Implementation Order</h4>'
      planHtml += '<table class="plan-review-table"><thead><tr><th>#</th><th>Story</th><th>Branch</th><th>Approach</th></tr></thead><tbody>'
      planItems.forEach((item, i) => {
        const story = (stories || []).find(s => s.id === item.storyId)
        const storyTitle = story?.title || item.storyId || `Story ${i + 1}`
        const branch = item.branchType || 'fullstack'
        const approach = (item.approach || '').replace(/\n/g, ' ').slice(0, 100)
        planHtml += `<tr><td>${i + 1}</td><td>${this.escapeHtml(storyTitle)}</td><td>${this.escapeHtml(branch)}</td><td>${this.escapeHtml(approach)}${approach.length >= 100 ? '...' : ''}</td></tr>`
      })
      planHtml += '</tbody></table>'

      planHtml += '<h4 class="plan-review-heading">Story Details</h4>'
      planItems.forEach((item, i) => {
        const story = (stories || []).find(s => s.id === item.storyId)
        const storyTitle = story?.title || item.storyId || `Story ${i + 1}`
        planHtml += `<div class="plan-review-story">`
        planHtml += `<h5>${i + 1}. ${this.escapeHtml(storyTitle)}</h5>`
        if (item.approach) planHtml += `<p><strong>Approach:</strong> ${this.escapeHtml(item.approach)}</p>`
        if (item.filesCreated?.length > 0) planHtml += `<p><strong>Files to create:</strong> ${item.filesCreated.map(f => this.escapeHtml(f)).join(', ')}</p>`
        if (item.filesModified?.length > 0) planHtml += `<p><strong>Files to modify:</strong> ${item.filesModified.map(f => this.escapeHtml(f)).join(', ')}</p>`
        if (item.dependencies?.length > 0) planHtml += `<p><strong>Dependencies:</strong> ${item.dependencies.map(d => this.escapeHtml(d)).join(', ')}</p>`
        planHtml += '</div>'
      })
    } else {
      // Show a clear message when plan generation produced no items
      // (can happen if AI plan generation failed or returned empty result)
      planHtml += '<p class="plan-review-empty">Plan generation did not produce implementation items.</p>'
      planHtml += '<p class="plan-review-empty" style="opacity:0.7;font-size:0.85em;">This usually means the AI was unable to generate a structured plan. Try requesting changes with more specific instructions, or re-run planning.</p>'

      // Show stories list if available so the user knows what was requested
      const planStories = plan.stories || []
      if (planStories.length > 0) {
        planHtml += '<h4 class="plan-review-heading">Stories in this sprint</h4><ul>'
        planStories.forEach(s => {
          planHtml += `<li>${this.escapeHtml(s.title || s.id)}</li>`
        })
        planHtml += '</ul>'
      }
    }

    if (sharedComponents.length > 0) {
      planHtml += '<h4 class="plan-review-heading">Shared Components</h4><ul>'
      sharedComponents.forEach(c => {
        const name = typeof c === 'string' ? c : c.name || JSON.stringify(c)
        const desc = typeof c === 'object' && c.description ? `: ${c.description}` : ''
        planHtml += `<li><strong>${this.escapeHtml(name)}</strong>${this.escapeHtml(desc)}</li>`
      })
      planHtml += '</ul>'
    }

    if (risks.length > 0) {
      planHtml += '<h4 class="plan-review-heading">Risks</h4><ul>'
      risks.forEach(r => {
        const text = typeof r === 'string' ? r : `${r.description || r.risk || ''}${r.mitigation ? ' — Mitigation: ' + r.mitigation : ''}`
        planHtml += `<li>${this.escapeHtml(text)}</li>`
      })
      planHtml += '</ul>'
    }

    // Build Q&A HTML (right pane)
    let qaHtml = ''
    if (clarificationHistory.length > 0) {
      clarificationHistory.forEach((exchange, ei) => {
        const questions = exchange.questions || []
        const answers = exchange.answers || []
        if (ei > 0) qaHtml += '<hr class="plan-qa-divider">'
        if (clarificationHistory.length > 1) qaHtml += `<h5 class="plan-qa-round">Round ${ei + 1}</h5>`
        questions.forEach((q, qi) => {
          const qText = typeof q === 'string' ? q : (q.question || JSON.stringify(q))
          const aText = answers[qi] ? (typeof answers[qi] === 'string' ? answers[qi] : (answers[qi].answer || JSON.stringify(answers[qi]))) : '<em>No answer</em>'
          qaHtml += `<div class="plan-qa-item">`
          qaHtml += `<div class="plan-qa-question"><strong>Q${qi + 1}:</strong> ${this.escapeHtml(qText)}</div>`
          qaHtml += `<div class="plan-qa-answer"><strong>A:</strong> ${this.escapeHtml(aText)}</div>`
          qaHtml += `</div>`
        })
        if (exchange.feedback) {
          qaHtml += `<div class="plan-qa-feedback"><strong>Feedback:</strong> ${this.escapeHtml(exchange.feedback)}</div>`
        }
      })
    } else {
      qaHtml = '<p class="plan-qa-none">No clarifying questions were needed.</p>'
    }

    content.innerHTML = `
      <div class="plan-review-container">
        <div class="plan-review-left">
          ${planHtml}
        </div>
        <div class="plan-review-right">
          <h4 class="plan-review-heading">Questions & Answers</h4>
          ${qaHtml}
        </div>
      </div>
    `

    if (readOnly) {
      actions.innerHTML = '<button class="btn secondary" id="plan-review-close-btn">Close</button>'
      document.getElementById('plan-review-close-btn')?.addEventListener('click', () => this.intents.hideModal())
    } else {
      actions.innerHTML = `
        <button class="btn secondary" id="plan-review-changes-btn">Request Changes</button>
        <button class="btn primary" id="plan-review-approve-btn">Approve Plan</button>
      `
      document.getElementById('plan-review-approve-btn')?.addEventListener('click', () => {
        this.intents.hideModal()
        this.intents.approvePlanWithCre(planId)
      })

      document.getElementById('plan-review-changes-btn')?.addEventListener('click', () => {
        // Replace actions with feedback input
        actions.innerHTML = `
          <div class="plan-review-feedback-row">
            <input type="text" id="plan-review-feedback" class="form-input" placeholder="Describe what should change..." autofocus>
            <button class="btn primary" id="plan-review-send-btn">Send</button>
            <button class="btn secondary" id="plan-review-cancel-btn">Cancel</button>
          </div>
        `
        document.getElementById('plan-review-feedback')?.focus()
        document.getElementById('plan-review-send-btn')?.addEventListener('click', () => {
          const feedback = document.getElementById('plan-review-feedback')?.value?.trim()
          if (feedback) {
            this.intents.hideModal()
            this.intents.iterateSprintPlan(planId, feedback)
          }
        })
        document.getElementById('plan-review-feedback')?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            document.getElementById('plan-review-send-btn')?.click()
          }
        })
        document.getElementById('plan-review-cancel-btn')?.addEventListener('click', () => {
          // Restore original actions
          this.renderPlanReview(title, content, actions, data)
        })
      })
    }
  }

  renderRisView(title, content, actions, data) {
    const { storyId, storyTitle } = data || {}

    title.textContent = `RIS: ${storyTitle || 'Unknown Story'}`

    content.innerHTML = '<div class="ris-loading">Loading RIS...</div>'
    actions.innerHTML = '<button class="btn secondary" id="ris-close-btn">Close</button>'

    document.getElementById('ris-close-btn')?.addEventListener('click', () => this.intents.hideModal())

    // Fetch the RIS asynchronously
    window.puffin.cre.getRis({ storyId }).then(result => {
      if (!result.success || !result.data) {
        content.innerHTML = '<p class="ris-empty">No RIS found for this story.</p>'
        return
      }

      const ris = result.data
      const risContent = ris.content || ris.markdown || ''

      if (!risContent) {
        content.innerHTML = '<p class="ris-empty">RIS exists but has no content.</p>'
        return
      }

      // Render the RIS as formatted markdown
      content.innerHTML = `
        <div class="ris-viewer">
          <div class="ris-content-markdown">${this.renderMarkdown(risContent)}</div>
        </div>
      `
    }).catch(err => {
      console.error('[ModalManager] Failed to fetch RIS:', err)
      content.innerHTML = `<p class="ris-error">Failed to load RIS: ${this.escapeHtml(err.message)}</p>`
    })
  }

  /**
   * Render a completion summary viewer modal
   * @param {HTMLElement} title - Modal title element
   * @param {HTMLElement} content - Modal content element
   * @param {HTMLElement} actions - Modal actions element
   * @param {Object} data - { storyId, storyTitle }
   */
  renderCompletionSummaryView(title, content, actions, data) {
    const { storyId, storyTitle, completionSummary } = data || {}

    title.textContent = `Completion Summary: ${storyTitle || 'Unknown Story'}`
    actions.innerHTML = '<button class="btn secondary" id="summary-close-btn">Close</button>'
    document.getElementById('summary-close-btn')?.addEventListener('click', () => this.intents.hideModal())

    // Use in-memory data if available, otherwise fetch from DB
    if (completionSummary) {
      this._renderCompletionSummaryContent(content, completionSummary)
    } else {
      content.innerHTML = '<div class="summary-loading">Loading completion summary...</div>'
      window.puffin.state.getCompletionSummary(storyId).then(result => {
        if (!result.success || !result.completionSummary) {
          content.innerHTML = '<p class="summary-empty">No completion summary found for this story.</p>'
          return
        }
        this._renderCompletionSummaryContent(content, result.completionSummary)
      }).catch(err => {
        console.error('[ModalManager] Failed to fetch completion summary:', err)
        content.innerHTML = `<p class="summary-error">Failed to load summary: ${this.escapeHtml(err.message)}</p>`
      })
    }
  }

  /**
   * Render completion summary content into the modal content element.
   * @private
   * @param {HTMLElement} content - Modal content element
   * @param {Object} s - Completion summary data
   */
  _renderCompletionSummaryContent(content, s) {
    // Normalize field names (renderer uses criteriaStatus, DB uses criteriaMatched)
    const criteria = s.criteriaMatched || s.criteriaStatus || []
    const testStatus = s.testsStatus || s.testStatus || ''

    // Build markdown content for rendering
    const mdParts = []

    if (s.summary) {
      mdParts.push(this.escapeHtml(s.summary))
    }

    if (s.filesModified?.length > 0) {
      mdParts.push(`\n## Files Modified (${s.filesModified.length})`)
      mdParts.push(s.filesModified.map(f => `- \`${this.escapeHtml(f)}\``).join('\n'))
    }

    if (testStatus) {
      mdParts.push(`\n## Test Results`)
      mdParts.push(`Status: **${this.escapeHtml(testStatus)}**`)
    }

    const stats = []
    if (s.turns) stats.push(`**Turns:** ${s.turns}`)
    if (s.cost) stats.push(`**Cost:** $${Number(s.cost).toFixed(4)}`)
    if (s.duration) stats.push(`**Duration:** ${Math.round(s.duration / 1000)}s`)
    if (stats.length > 0) {
      mdParts.push(`\n## Session Stats`)
      mdParts.push(stats.join(' | '))
    }

    if (s.sessionId) {
      mdParts.push(`\n---\nSession: \`${this.escapeHtml(s.sessionId)}\``)
    }

    const markdownContent = mdParts.join('\n\n')

    const criteriaHtml = (criteria.length > 0) ? `
      <div class="completion-criteria-section">
        <h3>Acceptance Criteria</h3>
        <ul class="completion-criteria">${criteria.map(c => {
          const status = c.met === true ? 'met' : c.met === false ? 'unmet' : 'unknown'
          const icon = c.met === true ? '&#10003;' : c.met === false ? '&#10007;' : '&#63;'
          return `<li class="${status}"><span class="criteria-indicator">${icon}</span> ${this.escapeHtml(c.criterion || '')}</li>`
        }).join('')}</ul>
      </div>
    ` : ''

    content.innerHTML = `
      <div class="completion-summary-viewer">
        <div class="ris-content-markdown">${this.renderMarkdown(markdownContent)}</div>
        ${criteriaHtml}
      </div>
    `
  }

  /**
   * Render a Claude question modal (AskUserQuestion tool response)
   * @param {HTMLElement} title - Modal title element
   * @param {HTMLElement} content - Modal content element
   * @param {HTMLElement} actions - Modal actions element
   * @param {Object} data - { toolUseId, questions }
   */
  renderClaudeQuestion(title, content, actions, data) {
    const { toolUseId, questions } = data || {}

    title.textContent = 'Claude has a question'

    if (!questions || questions.length === 0) {
      content.innerHTML = '<p>No questions received.</p>'
      actions.innerHTML = '<button class="btn secondary" id="cq-close-btn">Dismiss</button>'
      document.getElementById('cq-close-btn')?.addEventListener('click', () => this.intents.hideModal())
      return
    }

    // Render each question with its options
    const questionsHtml = questions.map((q, qi) => {
      const optionsHtml = (q.options || []).map((opt, oi) => `
        <label class="cq-option">
          <input type="${q.multiSelect ? 'checkbox' : 'radio'}" name="cq-${qi}" value="${oi}" />
          <div class="cq-option-content">
            <span class="cq-option-label">${this.escapeHtml(opt.label)}</span>
            ${opt.description ? `<span class="cq-option-desc">${this.escapeHtml(opt.description)}</span>` : ''}
          </div>
        </label>
      `).join('')

      return `
        <div class="cq-question" data-index="${qi}">
          ${q.header ? `<span class="cq-header">${this.escapeHtml(q.header)}</span>` : ''}
          <p class="cq-text">${this.escapeHtml(q.question)}</p>
          <div class="cq-options">${optionsHtml}</div>
          <div class="cq-other">
            <label class="cq-option">
              <input type="${q.multiSelect ? 'checkbox' : 'radio'}" name="cq-${qi}" value="other" />
              <div class="cq-option-content">
                <span class="cq-option-label">Other</span>
              </div>
            </label>
            <input type="text" class="cq-other-input form-input" placeholder="Type your answer..." style="display:none" />
          </div>
        </div>
      `
    }).join('')

    content.innerHTML = `<div class="claude-question-modal">${questionsHtml}</div>`

    actions.innerHTML = `
      <button class="btn secondary" id="cq-skip-btn">Skip</button>
      <button class="btn primary" id="cq-submit-btn">Submit Answer</button>
    `

    // Show/hide "Other" text input when radio/checkbox selected
    content.querySelectorAll('.cq-other input[type="radio"], .cq-other input[type="checkbox"]').forEach(radio => {
      const otherInput = radio.closest('.cq-other').querySelector('.cq-other-input')
      const questionDiv = radio.closest('.cq-question')
      const name = radio.name

      // Listen on all inputs in this question group for the radio case
      questionDiv.querySelectorAll(`input[name="${name}"]`).forEach(input => {
        input.addEventListener('change', () => {
          otherInput.style.display = radio.checked ? 'block' : 'none'
          if (radio.checked) otherInput.focus()
        })
      })
    })

    // Submit handler
    document.getElementById('cq-submit-btn')?.addEventListener('click', () => {
      const answers = {}
      questions.forEach((q, qi) => {
        const selected = content.querySelectorAll(`input[name="cq-${qi}"]:checked`)
        const values = []
        selected.forEach(input => {
          if (input.value === 'other') {
            const otherInput = input.closest('.cq-other').querySelector('.cq-other-input')
            values.push(otherInput?.value || 'Other')
          } else {
            const optIndex = parseInt(input.value)
            values.push(q.options[optIndex]?.label || input.value)
          }
        })
        answers[qi] = values.join(', ') || 'No answer provided'
      })

      window.puffin.claude.answerQuestion({ toolUseId, answers })
      this.intents.hideModal()
    })

    // Skip handler — send empty answer so CLI continues with defaults
    document.getElementById('cq-skip-btn')?.addEventListener('click', () => {
      const answers = {}
      questions.forEach((q, qi) => {
        answers[qi] = 'Please proceed with your best judgment.'
      })
      window.puffin.claude.answerQuestion({ toolUseId, answers })
      this.intents.hideModal()
    })
  }

  /**
   * Render a generic alert modal
   * @param {HTMLElement} title - Modal title element
   * @param {HTMLElement} content - Modal content element
   * @param {HTMLElement} actions - Modal actions element
   * @param {Object} data - Alert data { title, message, confirmLabel }
   */
  renderAlert(title, content, actions, data) {
    const { title: alertTitle, message, confirmLabel } = data || {}

    title.textContent = alertTitle || 'Alert'

    content.innerHTML = `
      <div class="alert-modal-content">
        <p class="alert-message">${this.escapeHtml(message || 'An alert occurred.')}</p>
      </div>
    `

    actions.innerHTML = `
      <button class="btn primary" id="alert-confirm-btn">${this.escapeHtml(confirmLabel || 'OK')}</button>
    `

    document.getElementById('alert-confirm-btn')?.addEventListener('click', () => {
      this.intents.hideModal()
    })
  }

  /**
   * Render the implementation mode selection modal
   * Appears after plan approval to let user choose automated or human-controlled implementation
   * @param {HTMLElement} title - Modal title element
   * @param {HTMLElement} content - Modal content element
   * @param {HTMLElement} actions - Modal actions element
   * @param {Object} data - Modal data (unused, but follows pattern)
   */
  renderImplementationModeSelection(title, content, actions, data) {
    title.textContent = 'Choose Implementation Mode'

    content.innerHTML = `
      <div class="implementation-mode-selection">
        <p class="mode-selection-intro">
          Your sprint plan has been approved. How would you like to proceed with implementation?
        </p>

        <div class="mode-options">
          <button class="mode-option-btn" id="mode-automated" aria-describedby="automated-desc">
            <div class="mode-option-icon" aria-hidden="true">🤖</div>
            <div class="mode-option-content">
              <div class="mode-option-label">Automated</div>
              <div class="mode-option-description" id="automated-desc">
                Claude orchestrates the entire sprint, implementing stories sequentially with automatic code review and bug fixes.
              </div>
            </div>
          </button>

          <button class="mode-option-btn" id="mode-human" aria-describedby="human-desc">
            <div class="mode-option-icon" aria-hidden="true">👤</div>
            <div class="mode-option-content">
              <div class="mode-option-label">Human-Controlled</div>
              <div class="mode-option-description" id="human-desc">
                You manually select which stories to implement and control the pace. Traditional sprint workflow.
              </div>
            </div>
          </button>
        </div>
      </div>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="mode-cancel-btn">Cancel</button>
    `

    // Bind automated mode button
    // Note: Don't call hideModal() here - the acceptor shows orchestration-plan modal
    document.getElementById('mode-automated')?.addEventListener('click', () => {
      this.intents.selectImplementationMode('automated')
    })

    // Bind human-controlled mode button
    document.getElementById('mode-human')?.addEventListener('click', () => {
      this.intents.selectImplementationMode('human')
      this.intents.hideModal()
    })

    // Bind cancel button - reverts to planned state
    document.getElementById('mode-cancel-btn')?.addEventListener('click', () => {
      this.intents.hideModal()
    })
  }

  /**
   * Render orchestration plan modal
   * Shows the implementation order and branch assignments before automated execution begins
   * @param {HTMLElement} title - Modal title element
   * @param {HTMLElement} content - Modal content element
   * @param {HTMLElement} actions - Modal actions element
   * @param {Object} data - Modal data
   * @param {Object} state - Current application state
   */
  renderOrchestrationPlan(title, content, actions, data, state) {
    title.textContent = 'Orchestration Plan'

    const sprint = state?.activeSprint
    if (!sprint) {
      content.innerHTML = '<p class="text-muted">No active sprint found.</p>'
      actions.innerHTML = '<button class="btn secondary" id="orchestration-close-btn">Close</button>'
      document.getElementById('orchestration-close-btn')?.addEventListener('click', () => {
        this.intents.hideModal()
      })
      return
    }

    const stories = sprint.stories || []
    const implementationOrder = sprint.implementationOrder || stories.map(s => s.id)
    const branchAssignments = sprint.branchAssignments || {}

    // Build ordered story list based on implementation order
    const orderedStories = implementationOrder
      .map(id => stories.find(s => s.id === id))
      .filter(Boolean)

    // If some stories aren't in the order, append them at the end
    const remainingStories = stories.filter(s => !implementationOrder.includes(s.id))
    const allOrderedStories = [...orderedStories, ...remainingStories]

    // Calculate session estimates
    const storyCount = allOrderedStories.length
    const reviewSessions = 1  // One code review session
    const bugFixEstimate = 'TBD'  // Depends on review findings

    // Branch config for display
    const branchConfig = {
      ui: { label: 'UI', icon: '🎨', className: 'branch-ui' },
      backend: { label: 'Backend', icon: '⚙️', className: 'branch-backend' },
      fullstack: { label: 'Full Stack', icon: '🔗', className: 'branch-fullstack' },
      plugin: { label: 'Plugin', icon: '📦', className: 'branch-plugin' }
    }

    // Escape HTML helper
    const escapeHtml = (str) => {
      if (!str) return ''
      return str.replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char])
    }

    // Render story list
    const storyListHtml = allOrderedStories.map((story, index) => {
      const branch = branchAssignments[story.id]?.toLowerCase()
      const config = branchConfig[branch] || { label: 'Unassigned', icon: '❓', className: 'branch-unassigned' }

      return `
        <li class="orchestration-story-item" data-story-id="${story.id}">
          <span class="story-order-number" aria-label="Step ${index + 1}">${index + 1}</span>
          <span class="orchestration-branch-badge ${config.className}"
                title="${config.label} branch"
                aria-label="Branch: ${config.label}">
            <span class="branch-icon" aria-hidden="true">${config.icon}</span>
            <span class="branch-label">${config.label}</span>
          </span>
          <span class="story-title">${escapeHtml(story.title)}</span>
        </li>
      `
    }).join('')

    content.innerHTML = `
      <div class="orchestration-plan-content">
        <p class="orchestration-intro">
          Review the implementation plan below. Claude will execute stories in this order,
          followed by code review and bug fixes.
        </p>

        <div class="orchestration-section">
          <h4 class="orchestration-section-title">Implementation Order</h4>
          <ol class="orchestration-story-list" role="list" aria-label="Stories in implementation order">
            ${storyListHtml}
          </ol>
        </div>

        <div class="orchestration-session-estimate">
          <h4 class="orchestration-section-title">Estimated Sessions</h4>
          <div class="session-estimate-grid">
            <div class="estimate-item">
              <span class="estimate-count">${storyCount}</span>
              <span class="estimate-label">Implementation${storyCount !== 1 ? 's' : ''}</span>
            </div>
            <span class="estimate-separator" aria-hidden="true">+</span>
            <div class="estimate-item">
              <span class="estimate-count">${reviewSessions}</span>
              <span class="estimate-label">Code Review</span>
            </div>
            <span class="estimate-separator" aria-hidden="true">+</span>
            <div class="estimate-item">
              <span class="estimate-count estimate-tbd">${bugFixEstimate}</span>
              <span class="estimate-label">Bug Fixes</span>
            </div>
          </div>
        </div>

        <div class="orchestration-notice" role="note">
          <span class="notice-icon" aria-hidden="true">ℹ️</span>
          <span class="notice-text">
            Branch assignments are locked once automation begins.
            You can pause or stop at any time during execution.
          </span>
        </div>
      </div>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="orchestration-back-btn">Back</button>
      <button class="btn primary" id="orchestration-start-btn">
        <span class="btn-icon" aria-hidden="true">▶</span>
        Start Automated Implementation
      </button>
    `

    // Bind back button - return to mode selection
    document.getElementById('orchestration-back-btn')?.addEventListener('click', () => {
      this.intents.showModal({ type: 'implementation-mode-selection' })
    })

    // Bind start button - begin automated implementation
    document.getElementById('orchestration-start-btn')?.addEventListener('click', () => {
      this.intents.startAutomatedImplementation()
      this.intents.hideModal()
    })
  }

  /**
   * Format date/time for display
   */
  formatDateTime(timestamp) {
    if (!timestamp) return 'Unknown'
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  /**
   * Format status for display
   */
  formatStatus(status) {
    const statusMap = {
      'pending': 'Pending',
      'in-progress': 'In Progress',
      'completed': 'Completed',
      'archived': 'Archived'
    }
    return statusMap[status] || status
  }

  /**
   * Format date for display
   */
  formatDate(timestamp) {
    if (!timestamp) return 'Unknown'
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
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
   * Render assertion status badge for a story
   * Shows pass/fail status if assertions have been evaluated
   */
  renderAssertionStatusBadge(story) {
    const assertions = story.inspectionAssertions || []
    const results = story.assertionResults

    // No assertions defined
    if (assertions.length === 0) return ''

    // Not evaluated yet
    if (!results || !results.summary) {
      return `<span class="assertion-status-badge not-evaluated" title="${assertions.length} assertions not evaluated">
        <span class="assertion-icon">?</span>
      </span>`
    }

    const { passed, failed, total } = results.summary

    if (failed > 0) {
      return `<span class="assertion-status-badge failed" title="${failed} of ${total} assertions failed">
        <span class="assertion-icon">!</span>
      </span>`
    }

    if (passed === total) {
      return `<span class="assertion-status-badge passed" title="All ${total} assertions passed">
        <span class="assertion-icon">✓</span>
      </span>`
    }

    // Partial (some passed, none failed, but not all evaluated)
    return `<span class="assertion-status-badge partial" title="${passed} of ${total} assertions passed">
      <span class="assertion-icon">~</span>
    </span>`
  }

  /**
   * Render assertion summary for a story in sprint view
   * Shows compact summary of assertion results
   */
  renderAssertionSummary(story) {
    const assertions = story.inspectionAssertions || []
    const results = story.assertionResults

    // No assertions to show
    if (assertions.length === 0) return ''

    // Not evaluated
    if (!results || !results.summary) {
      return `
        <div class="sprint-story-assertions">
          <span class="assertions-label">${assertions.length} inspection assertion${assertions.length !== 1 ? 's' : ''}</span>
          <span class="assertions-status not-evaluated">Not evaluated</span>
        </div>
      `
    }

    const { passed, failed, total, undecided } = results.summary

    let statusClass = 'passed'
    let statusText = `${passed}/${total} passed`

    if (failed > 0) {
      statusClass = 'failed'
      statusText = `${failed} failed, ${passed} passed`
    } else if (undecided > 0) {
      statusClass = 'partial'
      statusText = `${passed} passed, ${undecided} undecided`
    }

    return `
      <div class="sprint-story-assertions">
        <span class="assertions-label">Assertions:</span>
        <span class="assertions-status ${statusClass}">${statusText}</span>
      </div>
    `
  }
}
