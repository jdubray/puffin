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
    if (modal.type === 'user-story-review') {
      // Handled by UserStoryReviewModalComponent which subscribes to state changes
      return
    }

    // Immediately clear old content to prevent stale event handlers
    modalTitle.textContent = 'Loading...'
    modalContent.innerHTML = ''
    modalActions.innerHTML = ''

    switch (modal.type) {
      case 'save-gui-definition':
        this.renderSaveGuiDefinition(modalTitle, modalContent, modalActions, modal.data, state)
        break
      case 'load-gui-definition':
        await this.renderLoadGuiDefinition(modalTitle, modalContent, modalActions)
        break
      case 'gui-export':
        // Handled by gui-designer component
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
      default:
        console.log('Unknown modal type:', modal.type)
    }
  }

  /**
   * Render load GUI definition modal
   */
  async renderLoadGuiDefinition(title, content, actions) {
    title.textContent = 'Load GUI Definition'
    content.innerHTML = '<p>Loading definitions...</p>'

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

    // Handle definition clicks
    content.querySelectorAll('.gui-definition-item[data-filename]').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.classList.contains('definition-delete')) return

        const filename = item.dataset.filename
        try {
          const result = await window.puffin.state.loadGuiDefinition(filename)
          if (result.success) {
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
            await this.renderLoadGuiDefinition(title, content, actions)
          } catch (error) {
            console.error('Failed to delete definition:', error)
            this.showToast('Failed to delete definition', 'error')
          }
        }
      })
    })
  }

  /**
   * Render save GUI definition modal
   */
  renderSaveGuiDefinition(title, content, actions, data, state) {
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
        const elements = data?.elements || state?.designer?.flatElements || []
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

    setTimeout(() => {
      document.getElementById('definition-name')?.focus()
    }, 100)
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
}
