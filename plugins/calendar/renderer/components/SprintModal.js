/**
 * SprintModal Component
 *
 * Modal dialog displaying user stories for a selected sprint.
 * Shows story title, description, and completion status.
 */

class SprintModal {
  /**
   * Create a SprintModal
   * @param {Object} options - Configuration options
   * @param {Object} options.sprint - Sprint data to display
   * @param {Function} options.onClose - Callback when modal is closed
   * @param {HTMLElement} options.container - Container to render into (default: document.body)
   */
  constructor(options = {}) {
    this.sprint = options.sprint || {}
    this.onClose = options.onClose || null
    this.container = options.container || document.body
    this.element = null
    this.boundHandleKeyDown = this.handleKeyDown.bind(this)
    this.boundHandleBackdropClick = this.handleBackdropClick.bind(this)

    this.render()
    this.bindEvents()
  }

  /**
   * Render the modal
   */
  render() {
    // Create modal element
    this.element = document.createElement('div')
    this.element.className = 'modal-overlay sprint-modal-overlay'
    this.element.setAttribute('role', 'dialog')
    this.element.setAttribute('aria-modal', 'true')
    this.element.setAttribute('aria-labelledby', 'sprint-modal-title')

    const sprintName = this.escapeHtml(this.sprint.title || this.sprint.name || this.sprint.id || 'Sprint Details')
    const stories = this.sprint.userStories || this.sprint.stories || []
    const statusLabel = this.getStatusLabel(this.sprint.status)

    this.element.innerHTML = `
      <div class="modal-backdrop" data-action="close"></div>
      <div class="modal sprint-modal" role="document">
        <div class="modal-header sprint-modal-header">
          <div class="sprint-modal-title-section">
            <h3 id="sprint-modal-title">${sprintName}</h3>
            <span class="sprint-modal-status ${this.getStatusClass(this.sprint.status)}">${statusLabel}</span>
          </div>
          <button class="modal-close-btn" data-action="close" aria-label="Close modal" title="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-content sprint-modal-content">
          ${this.renderSprintInfo()}
          <div class="sprint-modal-stories-section">
            <h4 class="sprint-modal-section-title">
              User Stories
              <span class="sprint-modal-story-count">(${stories.length})</span>
            </h4>
            <div class="sprint-modal-stories-list" role="list" aria-label="User stories">
              ${stories.length > 0 ? this.renderStories(stories) : this.renderEmptyState()}
            </div>
          </div>
        </div>
        <div class="modal-footer sprint-modal-footer">
          <button class="btn btn-secondary" data-action="close">Close</button>
        </div>
      </div>
    `

    this.container.appendChild(this.element)

    // Focus the close button for accessibility
    const closeBtn = this.element.querySelector('.modal-close-btn')
    if (closeBtn) {
      setTimeout(() => closeBtn.focus(), 0)
    }
  }

  /**
   * Render sprint info section
   * @returns {string} HTML string
   */
  renderSprintInfo() {
    const dateStr = this.sprint.date ? this.formatDate(this.sprint.date) : null
    const description = this.sprint.description

    if (!dateStr && !description) return ''

    return `
      <div class="sprint-modal-info">
        ${dateStr ? `
          <div class="sprint-modal-info-item">
            <span class="sprint-modal-info-label">Date:</span>
            <span class="sprint-modal-info-value">${dateStr}</span>
          </div>
        ` : ''}
        ${description ? `
          <div class="sprint-modal-info-item sprint-modal-description">
            <span class="sprint-modal-info-label">Description:</span>
            <span class="sprint-modal-info-value">${this.escapeHtml(description)}</span>
          </div>
        ` : ''}
      </div>
    `
  }

  /**
   * Render user stories list
   * @param {Array} stories - Array of user stories
   * @returns {string} HTML string
   */
  renderStories(stories) {
    // Sort: incomplete first, then completed
    const sortedStories = [...stories].sort((a, b) => {
      const aCompleted = this.isStoryCompleted(a)
      const bCompleted = this.isStoryCompleted(b)
      if (aCompleted === bCompleted) return 0
      return aCompleted ? 1 : -1
    })

    return sortedStories.map((story, index) => this.renderStoryItem(story, index)).join('')
  }

  /**
   * Render individual story item
   * @param {Object} story - Story data
   * @param {number} index - Item index
   * @returns {string} HTML string
   */
  renderStoryItem(story, index) {
    const isCompleted = this.isStoryCompleted(story)
    const title = this.escapeHtml(story.title || `Story ${index + 1}`)
    const description = story.description ? this.escapeHtml(story.description) : null
    const statusIcon = isCompleted
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>'

    return `
      <div class="sprint-story-item ${isCompleted ? 'sprint-story-completed' : 'sprint-story-incomplete'}"
           role="listitem"
           tabindex="0"
           aria-label="${title}, ${isCompleted ? 'completed' : 'incomplete'}">
        <div class="sprint-story-status" aria-hidden="true">
          ${statusIcon}
        </div>
        <div class="sprint-story-content">
          <div class="sprint-story-title">${title}</div>
          ${description ? `<div class="sprint-story-description">${description}</div>` : ''}
        </div>
        <div class="sprint-story-badge ${isCompleted ? 'badge-completed' : 'badge-pending'}">
          ${isCompleted ? 'Completed' : 'Pending'}
        </div>
      </div>
    `
  }

  /**
   * Render empty state when no stories
   * @returns {string} HTML string
   */
  renderEmptyState() {
    return `
      <div class="sprint-modal-empty" role="status">
        <div class="sprint-modal-empty-icon" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
        </div>
        <p class="sprint-modal-empty-text">No user stories in this sprint</p>
      </div>
    `
  }

  /**
   * Check if a story is completed
   * @param {Object} story - Story object
   * @returns {boolean}
   */
  isStoryCompleted(story) {
    return story.status === 'completed' ||
           story.completed === true ||
           story.isCompleted === true
  }

  /**
   * Get CSS class for sprint status
   * @param {string} status - Sprint status
   * @returns {string} CSS class
   */
  getStatusClass(status) {
    const statusMap = {
      active: 'status-active',
      completed: 'status-completed',
      closed: 'status-completed',
      cancelled: 'status-cancelled'
    }
    return statusMap[status?.toLowerCase()] || 'status-default'
  }

  /**
   * Get display label for sprint status
   * @param {string} status - Sprint status
   * @returns {string} Display label
   */
  getStatusLabel(status) {
    const labelMap = {
      active: 'Active',
      completed: 'Completed',
      closed: 'Closed',
      cancelled: 'Cancelled'
    }
    return labelMap[status?.toLowerCase()] || 'Unknown'
  }

  /**
   * Format date for display
   * @param {string|Date} date - Date to format
   * @returns {string} Formatted date
   */
  formatDate(date) {
    try {
      const d = typeof date === 'string' ? new Date(date) : date
      return d.toLocaleDateString('default', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    } catch {
      return String(date)
    }
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
   * Bind event listeners
   */
  bindEvents() {
    // Click handlers for close actions
    this.element.querySelectorAll('[data-action="close"]').forEach(el => {
      el.addEventListener('click', () => this.close())
    })

    // Keyboard handler for Escape
    document.addEventListener('keydown', this.boundHandleKeyDown)

    // Trap focus within modal
    this.setupFocusTrap()
  }

  /**
   * Handle keydown events
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      this.close()
    }
  }

  /**
   * Handle backdrop click
   * @param {MouseEvent} e - Mouse event
   */
  handleBackdropClick(e) {
    if (e.target.classList.contains('modal-backdrop')) {
      this.close()
    }
  }

  /**
   * Setup focus trap within modal
   */
  setupFocusTrap() {
    const modal = this.element.querySelector('.sprint-modal')
    if (!modal) return

    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )

    if (focusableElements.length === 0) return

    const firstFocusable = focusableElements[0]
    const lastFocusable = focusableElements[focusableElements.length - 1]

    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault()
          lastFocusable.focus()
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault()
          firstFocusable.focus()
        }
      }
    })
  }

  /**
   * Close the modal
   */
  close() {
    // Remove event listeners
    document.removeEventListener('keydown', this.boundHandleKeyDown)

    // Animate out
    this.element.classList.add('modal-closing')

    // Remove after animation
    setTimeout(() => {
      if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element)
      }

      if (this.onClose) {
        this.onClose()
      }
    }, 150)
  }

  /**
   * Destroy the modal
   */
  destroy() {
    document.removeEventListener('keydown', this.boundHandleKeyDown)
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
    }
  }

  /**
   * Static method to show a sprint modal
   * @param {Object} sprint - Sprint data
   * @param {Object} options - Additional options
   * @returns {SprintModal} Modal instance
   */
  static show(sprint, options = {}) {
    return new SprintModal({
      sprint,
      ...options
    })
  }
}

// Export for use by plugin system
export { SprintModal }
