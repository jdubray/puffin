/**
 * PromptTemplateView - Main container component for the Prompt Template Plugin UI
 * Vanilla JavaScript implementation (no JSX)
 *
 * Displays:
 * - Search input for filtering templates
 * - Card grid showing template previews
 * - Create/Edit modal for template management
 */
export class PromptTemplateView {
  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} options - Component options
   * @param {string} options.viewId - View ID
   * @param {Object} options.view - View configuration
   * @param {string} options.pluginName - Plugin name
   * @param {Object} options.context - Plugin context
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}

    // State
    this.templates = []
    this.filteredTemplates = []
    this.searchTerm = ''
    this.loading = true
    this.error = null

    // Debounce timer for search
    this.searchDebounceTimer = null

    // Modal state
    this.modalOpen = false
    this.editingTemplate = null // null for create, template object for edit
  }

  /**
   * Initialize the component
   */
  async init() {
    console.log('[PromptTemplateView] init() called')

    this.container.className = 'prompt-template-view'
    this.updateView()
    await this.fetchTemplates()

    console.log('[PromptTemplateView] init() complete')
  }

  /**
   * Update the view based on current state
   */
  updateView() {
    if (!this.container) return

    this.container.innerHTML = ''

    // Show loading state
    if (this.loading) {
      this.container.innerHTML = `
        <div class="prompt-template-loading">
          <div class="prompt-template-spinner"></div>
          <p>Loading templates...</p>
        </div>
      `
      return
    }

    // Show error state
    if (this.error) {
      this.container.innerHTML = `
        <div class="prompt-template-error">
          <span class="prompt-template-error-icon">⚠️</span>
          <h3>Error Loading Templates</h3>
          <p>${this.escapeHtml(this.error)}</p>
          <button class="prompt-template-retry-btn">Retry</button>
        </div>
      `

      this.container.querySelector('.prompt-template-retry-btn')?.addEventListener('click', () => {
        this.fetchTemplates()
      })
      return
    }

    // Render full view
    this.renderTemplatesView()
  }

  /**
   * Render the full templates view
   */
  renderTemplatesView() {
    this.container.innerHTML = `
      <div class="prompt-template-container">
        <div class="prompt-template-header">
          <h2>📝 Prompt Templates</h2>
          <div class="prompt-template-header-actions">
            <input
              type="search"
              class="prompt-template-search"
              placeholder="Search templates..."
              value="${this.escapeHtml(this.searchTerm)}"
            />
            <button class="prompt-template-btn prompt-template-btn-primary prompt-template-create-btn">
              + Create New
            </button>
          </div>
        </div>
        <div class="prompt-template-grid">
          ${this.renderCards()}
        </div>
      </div>
    `

    this.attachEventListeners()
  }

  /**
   * Render template cards or empty state
   */
  renderCards() {
    const templatesToShow = this.searchTerm ? this.filteredTemplates : this.templates

    if (this.templates.length === 0) {
      return `
        <div class="prompt-template-empty">
          <span class="prompt-template-empty-icon">📝</span>
          <h3>No Templates Yet</h3>
          <p>Create your first prompt template to get started.</p>
        </div>
      `
    }

    if (templatesToShow.length === 0) {
      return `
        <div class="prompt-template-empty">
          <span class="prompt-template-empty-icon">🔍</span>
          <h3>No Results Found</h3>
          <p>No templates match "${this.escapeHtml(this.searchTerm)}"</p>
        </div>
      `
    }

    return templatesToShow.map(template => this.renderCard(template)).join('')
  }

  /**
   * Render a single template card
   * @param {Object} template - Template object
   */
  renderCard(template) {
    const preview = this.getContentPreview(template.content)
    const lastEdited = this.formatRelativeTime(template.lastEdited)

    return `
      <div class="prompt-template-card" data-id="${this.escapeHtml(template.id)}">
        <div class="prompt-template-card-header">
          <h3 class="prompt-template-card-title">${this.escapeHtml(template.title)}</h3>
          <div class="prompt-template-card-actions">
            <button class="prompt-template-card-btn copy-btn" title="Copy to clipboard">📋</button>
            <button class="prompt-template-card-btn edit-btn" title="Edit template">✏️</button>
            <button class="prompt-template-card-btn delete-btn" title="Delete template">🗑️</button>
          </div>
        </div>
        <p class="prompt-template-card-preview">${this.escapeHtml(preview)}</p>
        <span class="prompt-template-card-date">${lastEdited}</span>
      </div>
    `
  }

  /**
   * Attach event listeners to rendered elements
   */
  attachEventListeners() {
    // Search input
    const searchInput = this.container.querySelector('.prompt-template-search')
    searchInput?.addEventListener('input', (e) => {
      this.handleSearch(e.target.value)
    })

    // Create button
    this.container.querySelector('.prompt-template-create-btn')?.addEventListener('click', () => {
      this.handleCreate()
    })

    // Card action buttons (using event delegation)
    this.container.querySelector('.prompt-template-grid')?.addEventListener('click', (e) => {
      const card = e.target.closest('.prompt-template-card')
      if (!card) return

      const templateId = card.dataset.id

      if (e.target.closest('.copy-btn')) {
        this.handleCopy(templateId)
      } else if (e.target.closest('.edit-btn')) {
        this.handleEdit(templateId)
      } else if (e.target.closest('.delete-btn')) {
        this.handleDelete(templateId)
      }
    })
  }

  /**
   * Handle search input with debounce
   * @param {string} term - Search term
   */
  handleSearch(term) {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer)
    }

    this.searchDebounceTimer = setTimeout(() => {
      this.searchTerm = term.trim()
      this.filterTemplates()
      this.updateView()
    }, 150)
  }

  /**
   * Filter templates based on search term
   */
  filterTemplates() {
    if (!this.searchTerm) {
      this.filteredTemplates = this.templates
      return
    }

    const lowerTerm = this.searchTerm.toLowerCase()
    this.filteredTemplates = this.templates.filter(template =>
      template.title.toLowerCase().includes(lowerTerm) ||
      template.content.toLowerCase().includes(lowerTerm)
    )
  }

  /**
   * Handle create new template
   */
  handleCreate() {
    console.log('[PromptTemplateView] Create new template')
    this.editingTemplate = null
    this.showModal()
  }

  /**
   * Handle copy template content to clipboard
   * @param {string} templateId - Template ID
   */
  async handleCopy(templateId) {
    console.log('[PromptTemplateView] Copy template:', templateId)

    // Find the template
    const template = this.templates.find(t => t.id === templateId)
    if (!template) {
      console.error('[PromptTemplateView] Template not found:', templateId)
      return
    }

    // Find the copy button for visual feedback
    const card = this.container.querySelector(`.prompt-template-card[data-id="${templateId}"]`)
    const copyBtn = card?.querySelector('.copy-btn')

    try {
      // Copy full content to clipboard
      await navigator.clipboard.writeText(template.content)
      console.log('[PromptTemplateView] Copied to clipboard:', template.title)

      // Visual feedback - change button to checkmark
      if (copyBtn) {
        const originalText = copyBtn.textContent
        copyBtn.textContent = '✓'
        copyBtn.classList.add('copied')
        copyBtn.setAttribute('aria-label', 'Copied!')

        // Reset after 1.5 seconds
        setTimeout(() => {
          copyBtn.textContent = originalText
          copyBtn.classList.remove('copied')
          copyBtn.setAttribute('aria-label', 'Copy to clipboard')
        }, 1500)
      }
    } catch (err) {
      console.error('[PromptTemplateView] Failed to copy to clipboard:', err)

      // Visual feedback for error
      if (copyBtn) {
        const originalText = copyBtn.textContent
        copyBtn.textContent = '✗'
        copyBtn.classList.add('copy-error')
        copyBtn.setAttribute('aria-label', 'Copy failed')

        // Reset after 1.5 seconds
        setTimeout(() => {
          copyBtn.textContent = originalText
          copyBtn.classList.remove('copy-error')
          copyBtn.setAttribute('aria-label', 'Copy to clipboard')
        }, 1500)
      }
    }
  }

  /**
   * Handle edit template
   * @param {string} templateId - Template ID
   */
  handleEdit(templateId) {
    console.log('[PromptTemplateView] Edit template:', templateId)
    const template = this.templates.find(t => t.id === templateId)
    if (!template) {
      console.error('[PromptTemplateView] Template not found:', templateId)
      return
    }
    this.editingTemplate = template
    this.showModal()
  }

  /**
   * Handle delete template
   * @param {string} templateId - Template ID
   */
  handleDelete(templateId) {
    console.log('[PromptTemplateView] Delete template:', templateId)

    // Find the template to get its title for the confirmation message
    const template = this.templates.find(t => t.id === templateId)
    if (!template) {
      console.error('[PromptTemplateView] Template not found:', templateId)
      return
    }

    // Show confirmation dialog
    this.showDeleteConfirmation(template)
  }

  /**
   * Show delete confirmation dialog
   * @param {Object} template - Template to delete
   */
  showDeleteConfirmation(template) {
    // Remove any existing confirmation dialog
    this.removeDeleteConfirmation()

    const overlay = document.createElement('div')
    overlay.className = 'prompt-template-modal-overlay prompt-template-delete-overlay'
    overlay.innerHTML = `
      <div class="prompt-template-modal prompt-template-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-desc">
        <div class="prompt-template-modal-header">
          <h3 id="delete-title">Delete Template?</h3>
          <button class="prompt-template-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="prompt-template-delete-content">
          <p id="delete-desc">Are you sure you want to delete "<strong>${this.escapeHtml(template.title)}</strong>"?</p>
          <p class="prompt-template-delete-warning">This action cannot be undone.</p>
        </div>
        <div class="prompt-template-delete-actions">
          <button type="button" class="prompt-template-btn prompt-template-btn-secondary cancel-delete-btn">
            Cancel
          </button>
          <button type="button" class="prompt-template-btn prompt-template-btn-danger confirm-delete-btn">
            Delete
          </button>
        </div>
      </div>
    `

    document.body.appendChild(overlay)

    // Attach event listeners
    this.attachDeleteConfirmationListeners(overlay, template)

    // Focus the cancel button for safety
    const cancelBtn = overlay.querySelector('.cancel-delete-btn')
    setTimeout(() => cancelBtn?.focus(), 100)
  }

  /**
   * Attach event listeners to delete confirmation dialog
   * @param {HTMLElement} overlay - Modal overlay element
   * @param {Object} template - Template to delete
   */
  attachDeleteConfirmationListeners(overlay, template) {
    // Close button
    overlay.querySelector('.prompt-template-modal-close')?.addEventListener('click', () => {
      this.removeDeleteConfirmation()
    })

    // Cancel button
    overlay.querySelector('.cancel-delete-btn')?.addEventListener('click', () => {
      this.removeDeleteConfirmation()
    })

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.removeDeleteConfirmation()
      }
    })

    // Escape key to close
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        this.removeDeleteConfirmation()
        document.removeEventListener('keydown', handleEscape)
      }
    }
    document.addEventListener('keydown', handleEscape)

    // Confirm delete button
    overlay.querySelector('.confirm-delete-btn')?.addEventListener('click', async () => {
      await this.confirmDelete(template.id, overlay)
    })
  }

  /**
   * Remove the delete confirmation dialog from DOM
   */
  removeDeleteConfirmation() {
    const overlay = document.querySelector('.prompt-template-delete-overlay')
    if (overlay) {
      overlay.remove()
    }
  }

  /**
   * Confirm and execute template deletion
   * @param {string} templateId - Template ID to delete
   * @param {HTMLElement} overlay - Modal overlay element
   */
  async confirmDelete(templateId, overlay) {
    // Disable buttons to prevent double-click
    const confirmBtn = overlay.querySelector('.confirm-delete-btn')
    const cancelBtn = overlay.querySelector('.cancel-delete-btn')

    if (confirmBtn) {
      confirmBtn.disabled = true
      confirmBtn.textContent = 'Deleting...'
    }
    if (cancelBtn) {
      cancelBtn.disabled = true
    }

    try {
      console.log('[PromptTemplateView] Deleting template:', templateId)

      // Delete via plugin IPC
      const result = await window.puffin.plugins.invoke(
        'prompt-template-plugin',
        'delete',
        templateId
      )

      console.log('[PromptTemplateView] Delete result:', result)

      // Close the confirmation dialog
      this.removeDeleteConfirmation()

      // Refresh the template list
      await this.fetchTemplates()

    } catch (err) {
      console.error('[PromptTemplateView] Failed to delete template:', err)

      // Re-enable buttons
      if (confirmBtn) {
        confirmBtn.disabled = false
        confirmBtn.textContent = 'Delete'
      }
      if (cancelBtn) {
        cancelBtn.disabled = false
      }

      // Show error in the dialog
      const content = overlay.querySelector('.prompt-template-delete-content')
      if (content) {
        const errorEl = document.createElement('p')
        errorEl.className = 'prompt-template-delete-error'
        errorEl.textContent = `Failed to delete: ${err.message || 'Unknown error'}`
        content.appendChild(errorEl)
      }
    }
  }

  // ========================================
  // MODAL METHODS
  // ========================================

  /**
   * Show the create/edit modal
   */
  showModal() {
    this.modalOpen = true
    this.renderModal()
  }

  /**
   * Hide the modal and discard changes
   */
  hideModal() {
    this.modalOpen = false
    this.editingTemplate = null
    this.removeModal()
  }

  /**
   * Remove the modal from DOM
   */
  removeModal() {
    const overlay = document.querySelector('.prompt-template-modal-overlay')
    if (overlay) {
      overlay.remove()
    }
  }

  /**
   * Render the modal overlay and form
   */
  renderModal() {
    // Remove existing modal if any
    this.removeModal()

    const isEditing = this.editingTemplate !== null
    const title = isEditing ? 'Edit Template' : 'Create New Template'
    const templateTitle = isEditing ? this.editingTemplate.title : ''
    const templateContent = isEditing ? this.editingTemplate.content : ''

    const overlay = document.createElement('div')
    overlay.className = 'prompt-template-modal-overlay'
    overlay.innerHTML = `
      <div class="prompt-template-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="prompt-template-modal-header">
          <h3 id="modal-title">${title}</h3>
          <button class="prompt-template-modal-close" aria-label="Close modal">&times;</button>
        </div>
        <form class="prompt-template-form" novalidate>
          <div class="prompt-template-form-group">
            <label for="template-title">Title <span class="required">*</span></label>
            <input
              type="text"
              id="template-title"
              name="title"
              class="prompt-template-input"
              placeholder="Enter template title..."
              value="${this.escapeHtml(templateTitle)}"
              required
              autocomplete="off"
            />
            <span class="prompt-template-error-msg" id="title-error"></span>
          </div>
          <div class="prompt-template-form-group">
            <label for="template-content">Content <span class="required">*</span></label>
            <textarea
              id="template-content"
              name="content"
              class="prompt-template-textarea"
              placeholder="Enter template content..."
              rows="10"
              required
            >${this.escapeHtml(templateContent)}</textarea>
            <span class="prompt-template-error-msg" id="content-error"></span>
          </div>
          <div class="prompt-template-form-actions">
            <button type="button" class="prompt-template-btn prompt-template-btn-secondary cancel-btn">
              Cancel
            </button>
            <button type="submit" class="prompt-template-btn prompt-template-btn-primary save-btn">
              ${isEditing ? 'Save Changes' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    `

    document.body.appendChild(overlay)

    // Attach modal event listeners
    this.attachModalEventListeners(overlay)

    // Focus the title input
    const titleInput = overlay.querySelector('#template-title')
    setTimeout(() => titleInput?.focus(), 100)
  }

  /**
   * Attach event listeners to modal elements
   * @param {HTMLElement} overlay - Modal overlay element
   */
  attachModalEventListeners(overlay) {
    // Close button
    overlay.querySelector('.prompt-template-modal-close')?.addEventListener('click', () => {
      this.hideModal()
    })

    // Cancel button
    overlay.querySelector('.cancel-btn')?.addEventListener('click', () => {
      this.hideModal()
    })

    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.hideModal()
      }
    })

    // Escape key to close
    const handleEscape = (e) => {
      if (e.key === 'Escape' && this.modalOpen) {
        this.hideModal()
        document.removeEventListener('keydown', handleEscape)
      }
    }
    document.addEventListener('keydown', handleEscape)

    // Form submission
    const form = overlay.querySelector('.prompt-template-form')
    form?.addEventListener('submit', async (e) => {
      e.preventDefault()
      await this.handleSave(form)
    })

    // Clear validation errors on input
    const titleInput = overlay.querySelector('#template-title')
    const contentInput = overlay.querySelector('#template-content')

    titleInput?.addEventListener('input', () => {
      this.clearFieldError('title')
    })

    contentInput?.addEventListener('input', () => {
      this.clearFieldError('content')
    })
  }

  /**
   * Validate form fields
   * @param {string} title - Template title
   * @param {string} content - Template content
   * @returns {boolean} True if valid
   */
  validateForm(title, content) {
    let isValid = true

    // Clear previous errors
    this.clearFieldError('title')
    this.clearFieldError('content')

    // Validate title
    if (!title.trim()) {
      this.showFieldError('title', 'Title is required')
      isValid = false
    }

    // Validate content
    if (!content.trim()) {
      this.showFieldError('content', 'Content is required')
      isValid = false
    }

    return isValid
  }

  /**
   * Show error message for a form field
   * @param {string} field - Field name ('title' or 'content')
   * @param {string} message - Error message
   */
  showFieldError(field, message) {
    const errorEl = document.querySelector(`#${field}-error`)
    const inputEl = document.querySelector(`#template-${field}`)
    if (errorEl) {
      errorEl.textContent = message
      errorEl.classList.add('visible')
    }
    if (inputEl) {
      inputEl.classList.add('error')
    }
  }

  /**
   * Clear error message for a form field
   * @param {string} field - Field name ('title' or 'content')
   */
  clearFieldError(field) {
    const errorEl = document.querySelector(`#${field}-error`)
    const inputEl = document.querySelector(`#template-${field}`)
    if (errorEl) {
      errorEl.textContent = ''
      errorEl.classList.remove('visible')
    }
    if (inputEl) {
      inputEl.classList.remove('error')
    }
  }

  /**
   * Handle form save (create or update)
   * @param {HTMLFormElement} form - The form element
   */
  async handleSave(form) {
    const formData = new FormData(form)
    const title = formData.get('title')?.toString() || ''
    const content = formData.get('content')?.toString() || ''

    // Validate
    if (!this.validateForm(title, content)) {
      return
    }

    // Disable save button to prevent double submission
    const saveBtn = form.querySelector('.save-btn')
    if (saveBtn) {
      saveBtn.disabled = true
      saveBtn.textContent = 'Saving...'
    }

    try {
      const templateData = {
        title: title.trim(),
        content: content.trim()
      }

      // If editing, include the ID
      if (this.editingTemplate) {
        templateData.id = this.editingTemplate.id
      }

      console.log('[PromptTemplateView] Saving template:', templateData)

      // Save via plugin IPC
      const savedTemplate = await window.puffin.plugins.invoke(
        'prompt-template-plugin',
        'save',
        templateData
      )

      console.log('[PromptTemplateView] Template saved:', savedTemplate)

      // Close modal
      this.hideModal()

      // Refresh the template list
      await this.fetchTemplates()

    } catch (err) {
      console.error('[PromptTemplateView] Failed to save template:', err)

      // Re-enable save button
      if (saveBtn) {
        saveBtn.disabled = false
        saveBtn.textContent = this.editingTemplate ? 'Save Changes' : 'Create Template'
      }

      // Show error in the form
      this.showFieldError('title', `Failed to save: ${err.message || 'Unknown error'}`)
    }
  }

  /**
   * Fetch templates from the plugin
   */
  async fetchTemplates() {
    console.log('[PromptTemplateView] fetchTemplates() called')
    this.loading = true
    this.error = null
    this.updateView()

    try {
      const result = await window.puffin.plugins.invoke('prompt-template-plugin', 'getAll', {})
      console.log('[PromptTemplateView] Templates result:', result)
      this.templates = result || []
      this.filterTemplates()
      this.loading = false
      this.updateView()
    } catch (err) {
      console.error('[PromptTemplateView] Failed to fetch templates:', err)
      this.error = err.message || 'Failed to fetch templates'
      this.loading = false
      this.updateView()
    }
  }

  /**
   * Get a preview of the content (first ~50 characters)
   * @param {string} content - Full content
   * @returns {string} Preview text
   */
  getContentPreview(content) {
    if (!content) return ''
    const maxLength = 50
    if (content.length <= maxLength) return content
    return content.substring(0, maxLength).trim() + '...'
  }

  /**
   * Format a date as relative time (e.g., "2 hours ago")
   * @param {string} dateString - ISO date string
   * @returns {string} Formatted relative time
   */
  formatRelativeTime(dateString) {
    if (!dateString) return ''

    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHr = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHr / 24)

    if (diffSec < 60) return 'Just now'
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`
    if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`
    if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`

    return date.toLocaleDateString()
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Lifecycle: Called when view is activated
   */
  onActivate() {
    console.log('[PromptTemplateView] onActivate()')
  }

  /**
   * Lifecycle: Called when view is deactivated
   */
  onDeactivate() {
    console.log('[PromptTemplateView] onDeactivate()')
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer)
    }
  }

  /**
   * Cleanup when component is destroyed
   */
  destroy() {
    console.log('[PromptTemplateView] destroy()')
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer)
    }
    if (this.container) {
      this.container.innerHTML = ''
      this.container = null
    }
  }
}

export default PromptTemplateView
