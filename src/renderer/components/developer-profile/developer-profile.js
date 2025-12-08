/**
 * Developer Profile Component
 *
 * Manages developer profile with GitHub integration:
 * - Profile creation and editing
 * - GitHub OAuth authentication
 * - Repository and activity display
 * - Profile import/export
 */

export class DeveloperProfileComponent {
  constructor(intents) {
    this.intents = intents
    this.container = null
    this.isAuthenticating = false
    this.authPollController = null
  }

  /**
   * Initialize the component
   */
  init() {
    this.container = document.getElementById('profile-view')

    if (!this.container) {
      console.error('Profile view container not found')
      return
    }

    this.render()
    this.subscribeToState()
    this.loadProfile()
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      const { state } = e.detail
      if (state.developerProfile) {
        this.updateUI(state.developerProfile)
      }
    })
  }

  /**
   * Load initial profile data
   */
  async loadProfile() {
    try {
      const result = await window.puffin.profile.get()
      if (result.success && result.profile) {
        this.intents.loadDeveloperProfile(result.profile)
      }

      // Check GitHub connection status
      const githubResult = await window.puffin.github.isConnected()
      if (githubResult.success && githubResult.connected) {
        // Refresh GitHub profile if connected
        await this.refreshGithubData()
      }
    } catch (error) {
      console.error('Failed to load profile:', error)
    }
  }

  /**
   * Refresh GitHub data
   */
  async refreshGithubData() {
    try {
      const [reposResult, activityResult] = await Promise.all([
        window.puffin.github.getRepositories(),
        window.puffin.github.getActivity(10)
      ])

      if (reposResult.success) {
        this.intents.loadGithubRepositories(reposResult.repositories)
      }

      if (activityResult.success) {
        this.intents.loadGithubActivity(activityResult.events)
      }
    } catch (error) {
      console.error('Failed to refresh GitHub data:', error)
    }
  }

  /**
   * Render the component
   */
  render() {
    this.container.innerHTML = `
      <div class="developer-profile">
        <div class="profile-header">
          <h2>Developer Profile</h2>
          <div class="profile-actions">
            <button id="profile-export-btn" class="btn btn-secondary" title="Export Profile">
              Export
            </button>
            <button id="profile-import-btn" class="btn btn-secondary" title="Import Profile">
              Import
            </button>
          </div>
        </div>

        <div class="profile-content">
          <!-- Profile Card -->
          <div class="profile-card" id="profile-card">
            <div class="profile-avatar-section">
              <div class="profile-avatar" id="profile-avatar">
                <span class="avatar-placeholder">?</span>
              </div>
              <div class="profile-identity">
                <h3 id="profile-name">No Profile</h3>
                <p id="profile-email" class="profile-email"></p>
              </div>
            </div>
            <p id="profile-bio" class="profile-bio"></p>
            <div class="profile-meta" id="profile-meta"></div>
          </div>

          <!-- GitHub Connection -->
          <div class="github-section" id="github-section">
            <div class="section-header">
              <h3>GitHub Integration</h3>
            </div>
            <div class="github-content" id="github-content">
              <!-- Populated dynamically -->
            </div>
          </div>

          <!-- Profile Form -->
          <div class="profile-form-section" id="profile-form-section">
            <div class="section-header">
              <h3 id="profile-form-title">Create Profile</h3>
            </div>
            <form id="profile-form" class="profile-form">
              <div class="form-group">
                <label for="profile-name-input">Name *</label>
                <input type="text" id="profile-name-input" name="name" required
                       placeholder="Your name">
              </div>

              <div class="form-group">
                <label for="profile-email-input">Email</label>
                <input type="email" id="profile-email-input" name="email"
                       placeholder="your.email@example.com">
              </div>

              <div class="form-group">
                <label for="profile-bio-input">Bio</label>
                <textarea id="profile-bio-input" name="bio" rows="3"
                          placeholder="A brief description about yourself"></textarea>
              </div>

              <div class="form-group">
                <label for="profile-coding-style">Preferred Coding Style *</label>
                <select id="profile-coding-style" name="preferredCodingStyle" required>
                  <option value="FUNCTIONAL">Functional</option>
                  <option value="OOP">Object-Oriented</option>
                  <option value="HYBRID" selected>Hybrid</option>
                  <option value="PROCEDURAL">Procedural</option>
                </select>
              </div>

              <fieldset class="preferences-fieldset">
                <legend>Coding Preferences</legend>

                <div class="form-row">
                  <div class="form-group">
                    <label for="pref-testing">Testing Approach</label>
                    <select id="pref-testing" name="testingApproach">
                      <option value="TDD">TDD</option>
                      <option value="BDD">BDD</option>
                      <option value="INTEGRATION">Integration</option>
                      <option value="MINIMAL">Minimal</option>
                      <option value="NONE">None</option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label for="pref-docs">Documentation Level</label>
                    <select id="pref-docs" name="documentationLevel">
                      <option value="MINIMAL">Minimal</option>
                      <option value="STANDARD" selected>Standard</option>
                      <option value="COMPREHENSIVE">Comprehensive</option>
                    </select>
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label for="pref-errors">Error Handling</label>
                    <select id="pref-errors" name="errorHandling">
                      <option value="EXCEPTIONS" selected>Exceptions</option>
                      <option value="RESULT_TYPES">Result Types</option>
                      <option value="ERROR_CODES">Error Codes</option>
                      <option value="CALLBACKS">Callbacks</option>
                    </select>
                  </div>

                  <div class="form-group">
                    <label for="pref-naming">Naming Convention</label>
                    <select id="pref-naming" name="naming">
                      <option value="CAMEL" selected>camelCase</option>
                      <option value="SNAKE">snake_case</option>
                      <option value="PASCAL">PascalCase</option>
                      <option value="KEBAB">kebab-case</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              <div class="form-actions">
                <button type="submit" id="profile-submit-btn" class="btn btn-primary">
                  Create Profile
                </button>
                <button type="button" id="profile-delete-btn" class="btn btn-danger" style="display: none;">
                  Delete Profile
                </button>
              </div>
            </form>
          </div>

          <!-- GitHub Activity -->
          <div class="github-activity-section" id="github-activity-section" style="display: none;">
            <div class="section-header">
              <h3>Recent Activity</h3>
              <button id="refresh-activity-btn" class="btn btn-small btn-secondary">
                Refresh
              </button>
            </div>
            <div class="activity-list" id="activity-list">
              <!-- Populated dynamically -->
            </div>
          </div>

          <!-- GitHub Repositories -->
          <div class="github-repos-section" id="github-repos-section" style="display: none;">
            <div class="section-header">
              <h3>Repositories</h3>
            </div>
            <div class="repos-list" id="repos-list">
              <!-- Populated dynamically -->
            </div>
          </div>
        </div>
      </div>
    `

    this.bindEvents()
  }

  /**
   * Bind DOM events
   */
  bindEvents() {
    // Profile form submission
    const form = document.getElementById('profile-form')
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        this.handleSubmit()
      })
    }

    // Delete profile
    const deleteBtn = document.getElementById('profile-delete-btn')
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.handleDelete())
    }

    // Export profile
    const exportBtn = document.getElementById('profile-export-btn')
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.handleExport())
    }

    // Import profile
    const importBtn = document.getElementById('profile-import-btn')
    if (importBtn) {
      importBtn.addEventListener('click', () => this.handleImport())
    }

    // Refresh activity
    const refreshBtn = document.getElementById('refresh-activity-btn')
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refreshGithubData())
    }
  }

  /**
   * Update UI based on state
   * @param {Object} profileState - Developer profile state
   */
  updateUI(profileState) {
    this.updateProfileCard(profileState)
    this.updateGithubSection(profileState)
    this.updateForm(profileState)
    this.updateActivitySection(profileState)
    this.updateReposSection(profileState)
  }

  /**
   * Update profile card display
   */
  updateProfileCard(profileState) {
    const profile = profileState.profile || {}
    const hasProfile = profile.id || profile.name

    // Avatar
    const avatarEl = document.getElementById('profile-avatar')
    if (avatarEl) {
      if (profile.avatarUrl) {
        avatarEl.innerHTML = `<img src="${profile.avatarUrl}" alt="Avatar">`
      } else if (profile.name) {
        avatarEl.innerHTML = `<span class="avatar-placeholder">${profile.name.charAt(0).toUpperCase()}</span>`
      } else {
        avatarEl.innerHTML = `<span class="avatar-placeholder">?</span>`
      }
    }

    // Name
    const nameEl = document.getElementById('profile-name')
    if (nameEl) {
      nameEl.textContent = profile.name || 'No Profile'
    }

    // Email
    const emailEl = document.getElementById('profile-email')
    if (emailEl) {
      emailEl.textContent = profile.email || ''
    }

    // Bio
    const bioEl = document.getElementById('profile-bio')
    if (bioEl) {
      bioEl.textContent = profile.bio || ''
    }

    // Meta info
    const metaEl = document.getElementById('profile-meta')
    if (metaEl && hasProfile) {
      const metaItems = []
      if (profile.company) metaItems.push(`<span class="meta-item">🏢 ${profile.company}</span>`)
      if (profile.location) metaItems.push(`<span class="meta-item">📍 ${profile.location}</span>`)
      metaEl.innerHTML = metaItems.join('')
    }
  }

  /**
   * Update GitHub section
   */
  updateGithubSection(profileState) {
    const contentEl = document.getElementById('github-content')
    if (!contentEl) return

    if (profileState.isAuthenticating) {
      contentEl.innerHTML = `
        <div class="github-auth-pending">
          <div class="spinner"></div>
          <p>Waiting for GitHub authorization...</p>
          <p class="auth-hint">Complete the authorization in your browser</p>
          <button id="cancel-auth-btn" class="btn btn-secondary">Cancel</button>
        </div>
      `
      document.getElementById('cancel-auth-btn')?.addEventListener('click', () => {
        this.cancelGithubAuth()
      })
      return
    }

    if (profileState.isAuthenticated) {
      const github = profileState.profile || {}
      contentEl.innerHTML = `
        <div class="github-connected">
          <div class="github-user">
            <img src="${github.avatarUrl || ''}" alt="GitHub Avatar" class="github-avatar">
            <div class="github-user-info">
              <strong>${github.name || github.login || 'GitHub User'}</strong>
              <a href="${github.htmlUrl || '#'}" target="_blank" class="github-username">@${github.login || ''}</a>
            </div>
          </div>
          <div class="github-stats">
            <span class="stat"><strong>${github.publicRepos || 0}</strong> repos</span>
            <span class="stat"><strong>${github.followers || 0}</strong> followers</span>
            <span class="stat"><strong>${github.following || 0}</strong> following</span>
          </div>
          <div class="github-actions">
            <button id="refresh-github-btn" class="btn btn-secondary btn-small">Refresh</button>
            <button id="disconnect-github-btn" class="btn btn-danger btn-small">Disconnect</button>
          </div>
        </div>
      `

      document.getElementById('refresh-github-btn')?.addEventListener('click', () => {
        this.handleRefreshGithub()
      })
      document.getElementById('disconnect-github-btn')?.addEventListener('click', () => {
        this.handleDisconnectGithub()
      })

      // Show activity and repos sections
      document.getElementById('github-activity-section').style.display = 'block'
      document.getElementById('github-repos-section').style.display = 'block'
    } else {
      contentEl.innerHTML = `
        <div class="github-not-connected">
          <p>Connect your GitHub account to sync your profile and see your activity.</p>
          <button id="connect-github-btn" class="btn btn-primary github-btn">
            <svg class="github-icon" viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            Connect GitHub
          </button>
        </div>
      `

      document.getElementById('connect-github-btn')?.addEventListener('click', () => {
        this.handleConnectGithub()
      })

      // Hide activity and repos sections
      document.getElementById('github-activity-section').style.display = 'none'
      document.getElementById('github-repos-section').style.display = 'none'
    }

    if (profileState.authError) {
      const errorDiv = document.createElement('div')
      errorDiv.className = 'github-error'
      errorDiv.textContent = profileState.authError
      contentEl.appendChild(errorDiv)
    }
  }

  /**
   * Update form based on profile state
   */
  updateForm(profileState) {
    const profile = profileState.profile || {}
    const hasProfile = profile.id || profile.name

    // Update form title
    const titleEl = document.getElementById('profile-form-title')
    if (titleEl) {
      titleEl.textContent = hasProfile ? 'Edit Profile' : 'Create Profile'
    }

    // Update submit button text
    const submitBtn = document.getElementById('profile-submit-btn')
    if (submitBtn) {
      submitBtn.textContent = hasProfile ? 'Save Changes' : 'Create Profile'
    }

    // Show/hide delete button
    const deleteBtn = document.getElementById('profile-delete-btn')
    if (deleteBtn) {
      deleteBtn.style.display = hasProfile ? 'inline-block' : 'none'
    }

    // Populate form fields (only if not currently editing)
    if (!document.activeElement?.closest('#profile-form')) {
      document.getElementById('profile-name-input').value = profile.name || ''
      document.getElementById('profile-email-input').value = profile.email || ''
      document.getElementById('profile-bio-input').value = profile.bio || ''
      document.getElementById('profile-coding-style').value = profile.preferredCodingStyle || 'HYBRID'

      if (profile.preferences) {
        document.getElementById('pref-testing').value = profile.preferences.testingApproach || 'TDD'
        document.getElementById('pref-docs').value = profile.preferences.documentationLevel || 'STANDARD'
        document.getElementById('pref-errors').value = profile.preferences.errorHandling || 'EXCEPTIONS'
        document.getElementById('pref-naming').value = profile.preferences.codeStyle?.naming || 'CAMEL'
      }
    }
  }

  /**
   * Update activity section
   */
  updateActivitySection(profileState) {
    const listEl = document.getElementById('activity-list')
    if (!listEl) return

    const events = profileState.recentActivity || []

    if (events.length === 0) {
      listEl.innerHTML = '<p class="empty-message">No recent activity</p>'
      return
    }

    listEl.innerHTML = events.map(event => this.renderActivityEvent(event)).join('')
  }

  /**
   * Render a single activity event
   */
  renderActivityEvent(event) {
    const typeIcons = {
      PushEvent: '📤',
      PullRequestEvent: '🔀',
      IssuesEvent: '🐛',
      CreateEvent: '✨',
      DeleteEvent: '🗑️',
      ForkEvent: '🍴',
      WatchEvent: '⭐',
      IssueCommentEvent: '💬',
      PullRequestReviewEvent: '👀',
      PullRequestReviewCommentEvent: '💬'
    }

    const icon = typeIcons[event.type] || '📋'
    const time = this.formatTimeAgo(new Date(event.createdAt))
    const action = this.formatEventAction(event)

    return `
      <div class="activity-item">
        <span class="activity-icon">${icon}</span>
        <div class="activity-details">
          <span class="activity-action">${action}</span>
          <span class="activity-repo">${event.repo || ''}</span>
          <span class="activity-time">${time}</span>
        </div>
      </div>
    `
  }

  /**
   * Format event action description
   */
  formatEventAction(event) {
    switch (event.type) {
      case 'PushEvent':
        return `Pushed ${event.payload?.commits || 0} commit(s)`
      case 'PullRequestEvent':
        return `${event.payload?.action || 'Updated'} pull request`
      case 'IssuesEvent':
        return `${event.payload?.action || 'Updated'} issue`
      case 'CreateEvent':
        return `Created ${event.payload?.refType || 'ref'}`
      case 'ForkEvent':
        return 'Forked repository'
      case 'WatchEvent':
        return 'Starred repository'
      default:
        return event.type.replace('Event', '')
    }
  }

  /**
   * Update repositories section
   */
  updateReposSection(profileState) {
    const listEl = document.getElementById('repos-list')
    if (!listEl) return

    const repos = profileState.repositories || []

    if (repos.length === 0) {
      listEl.innerHTML = '<p class="empty-message">No repositories</p>'
      return
    }

    listEl.innerHTML = repos.slice(0, 10).map(repo => `
      <div class="repo-item">
        <div class="repo-header">
          <a href="${repo.htmlUrl}" target="_blank" class="repo-name">${repo.name}</a>
          ${repo.private ? '<span class="repo-private">Private</span>' : ''}
        </div>
        <p class="repo-description">${repo.description || ''}</p>
        <div class="repo-meta">
          ${repo.language ? `<span class="repo-language">${repo.language}</span>` : ''}
          <span class="repo-stars">⭐ ${repo.stargazersCount || 0}</span>
          <span class="repo-forks">🔀 ${repo.forksCount || 0}</span>
        </div>
      </div>
    `).join('')
  }

  /**
   * Format time ago
   */
  formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000)

    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return date.toLocaleDateString()
  }

  /**
   * Handle form submission
   */
  async handleSubmit() {
    const form = document.getElementById('profile-form')
    const formData = new FormData(form)

    const profileData = {
      name: formData.get('name'),
      email: formData.get('email'),
      bio: formData.get('bio'),
      preferredCodingStyle: formData.get('preferredCodingStyle'),
      preferences: {
        programmingStyle: formData.get('preferredCodingStyle'),
        testingApproach: formData.get('testingApproach'),
        documentationLevel: formData.get('documentationLevel'),
        errorHandling: formData.get('errorHandling'),
        codeStyle: {
          naming: formData.get('naming'),
          comments: 'JSDoc'
        }
      }
    }

    try {
      // Check if profile exists
      const existsResult = await window.puffin.profile.exists()

      let result
      if (existsResult.success && existsResult.exists) {
        result = await window.puffin.profile.update(profileData)
      } else {
        result = await window.puffin.profile.create(profileData)
      }

      if (result.success) {
        this.intents.loadDeveloperProfile(result.profile)
      } else {
        console.error('Failed to save profile:', result.error || result.errors)
        alert('Failed to save profile: ' + (result.error || JSON.stringify(result.errors)))
      }
    } catch (error) {
      console.error('Error saving profile:', error)
      alert('Error saving profile: ' + error.message)
    }
  }

  /**
   * Handle profile deletion
   */
  async handleDelete() {
    if (!confirm('Are you sure you want to delete your profile? This cannot be undone.')) {
      return
    }

    try {
      const result = await window.puffin.profile.delete()
      if (result.success) {
        this.intents.githubLogout()
        this.loadProfile()
      } else {
        alert('Failed to delete profile: ' + result.error)
      }
    } catch (error) {
      console.error('Error deleting profile:', error)
      alert('Error deleting profile: ' + error.message)
    }
  }

  /**
   * Handle profile export
   */
  async handleExport() {
    try {
      const result = await window.puffin.profile.export()
      if (result.success) {
        console.log('Profile exported to:', result.filePath)
      } else if (result.error !== 'Export cancelled') {
        alert('Failed to export profile: ' + result.error)
      }
    } catch (error) {
      console.error('Error exporting profile:', error)
      alert('Error exporting profile: ' + error.message)
    }
  }

  /**
   * Handle profile import
   */
  async handleImport() {
    try {
      let result = await window.puffin.profile.import({ overwrite: false })

      if (!result.success && result.requiresOverwrite) {
        if (confirm('A profile already exists. Do you want to replace it?')) {
          result = await window.puffin.profile.import({ overwrite: true })
        } else {
          return
        }
      }

      if (result.success) {
        this.intents.present({
          type: 'LOAD_DEVELOPER_PROFILE',
          payload: { profile: result.profile }
        })
      } else if (result.error !== 'Import cancelled') {
        alert('Failed to import profile: ' + result.error)
      }
    } catch (error) {
      console.error('Error importing profile:', error)
      alert('Error importing profile: ' + error.message)
    }
  }

  /**
   * Handle GitHub connection
   */
  async handleConnectGithub() {
    try {
      this.intents.present({ type: 'START_GITHUB_AUTH', payload: {} })

      // Start device flow
      const startResult = await window.puffin.github.startAuth()
      if (!startResult.success) {
        throw new Error(startResult.error)
      }

      // Open browser for user to authorize
      await window.puffin.github.openAuth(startResult.verificationUri)

      // Show user code for manual entry if needed
      alert(`Enter this code on GitHub: ${startResult.userCode}\n\nA browser window has been opened for you.`)

      // Poll for token
      const pollResult = await window.puffin.github.pollToken(
        startResult.deviceCode,
        startResult.interval,
        startResult.expiresIn
      )

      if (pollResult.success) {
        this.intents.present({
          type: 'GITHUB_AUTH_SUCCESS',
          payload: { profile: pollResult.profile.github }
        })
        // Refresh GitHub data
        await this.refreshGithubData()
      } else {
        throw new Error(pollResult.error)
      }
    } catch (error) {
      console.error('GitHub auth error:', error)
      this.intents.present({
        type: 'GITHUB_AUTH_ERROR',
        payload: { error: error.message }
      })
    }
  }

  /**
   * Cancel GitHub authentication
   */
  cancelGithubAuth() {
    this.intents.present({
      type: 'GITHUB_AUTH_ERROR',
      payload: { error: 'Authentication cancelled' }
    })
  }

  /**
   * Handle GitHub disconnect
   */
  async handleDisconnectGithub() {
    if (!confirm('Are you sure you want to disconnect your GitHub account?')) {
      return
    }

    try {
      const result = await window.puffin.github.disconnect()
      if (result.success) {
        this.intents.present({ type: 'GITHUB_LOGOUT', payload: {} })
      } else {
        alert('Failed to disconnect GitHub: ' + result.error)
      }
    } catch (error) {
      console.error('Error disconnecting GitHub:', error)
      alert('Error disconnecting GitHub: ' + error.message)
    }
  }

  /**
   * Handle GitHub refresh
   */
  async handleRefreshGithub() {
    try {
      const result = await window.puffin.github.refreshProfile()
      if (result.success) {
        this.intents.present({
          type: 'GITHUB_AUTH_SUCCESS',
          payload: { profile: result.profile.github }
        })
        await this.refreshGithubData()
      } else {
        alert('Failed to refresh GitHub profile: ' + result.error)
      }
    } catch (error) {
      console.error('Error refreshing GitHub:', error)
      alert('Error refreshing GitHub: ' + error.message)
    }
  }
}
