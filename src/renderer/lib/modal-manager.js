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
      const message = this.generateSprintCommitMessage(sprint, userStories)
      this._pendingCommitMessage = message
      return message
    } finally {
      this._commitMessageGenerating = false
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
   * Render sprint close modal - prompts for title and description
   */
  renderSprintClose(title, content, actions, data, state) {
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
