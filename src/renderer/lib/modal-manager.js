/**
 * Modal Manager
 *
 * Handles rendering and management of modal dialogs.
 * Extracted from app.js for better separation of concerns.
 */

export class ModalManager {
  constructor(intents, showToast) {
    this.intents = intents
    this.showToast = showToast
    this._currentModalRender = null
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
      default:
        console.log('Unknown modal type:', modal.type)
    }
  }

  /**
   * Render sprint close modal - prompts for title and description
   */
  renderSprintClose(title, content, actions, data, state) {
    title.textContent = 'Close Sprint'

    const sprint = data?.sprint || state.activeSprint
    const storyCount = sprint?.stories?.length || 0
    const completedCount = Object.values(sprint?.storyProgress || {})
      .filter(p => p.status === 'completed').length

    // Generate default title from date
    const now = new Date()
    const defaultTitle = `Sprint ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

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
      </div>
    `

    actions.innerHTML = `
      <button class="btn secondary" id="sprint-close-cancel-btn">Cancel</button>
      <button class="btn primary" id="sprint-close-confirm-btn">Close Sprint</button>
    `

    // Event listeners
    document.getElementById('sprint-close-cancel-btn').addEventListener('click', () => {
      this.intents.hideModal()
    })

    document.getElementById('sprint-close-confirm-btn').addEventListener('click', () => {
      const titleInput = document.getElementById('sprint-close-title')
      const descriptionInput = document.getElementById('sprint-close-description')

      const sprintTitle = titleInput?.value?.trim()
      const sprintDescription = descriptionInput?.value?.trim() || ''

      if (!sprintTitle) {
        titleInput?.focus()
        this.showToast('Please enter a sprint title', 'error')
        return
      }

      // Call clearSprint with title and description
      this.intents.clearSprintWithDetails(sprintTitle, sprintDescription)
      this.intents.hideModal()
      this.showToast('Sprint closed successfully', 'success')
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
}
