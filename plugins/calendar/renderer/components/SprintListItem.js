/**
 * SprintListItem Component
 *
 * Individual sprint item for display in the sprint panel.
 * Can be used standalone or within SprintPanel.
 */

class SprintListItem {
  /**
   * Create a SprintListItem
   * @param {HTMLElement} container - Container element
   * @param {Object} options - Configuration options
   * @param {Object} options.sprint - Sprint data object
   * @param {number} options.index - Item index
   * @param {Function} options.onClick - Click callback
   */
  constructor(container, options = {}) {
    this.container = container
    this.sprint = options.sprint || {}
    this.index = options.index || 0
    this.onClick = options.onClick || null

    this.render()
  }

  /**
   * Render the sprint item
   */
  render() {
    const statusClass = this.getStatusClass(this.sprint.status)
    const statusLabel = this.getStatusLabel(this.sprint.status)
    const sprintId = this.sprint.id || `sprint-${this.index}`
    const sprintName = this.escapeHtml(this.sprint.title || this.sprint.name || this.sprint.id || `Sprint ${this.index + 1}`)
    const storyCount = this.sprint.userStories?.length || 0
    const dateStr = this.sprint.date ? this.formatDate(this.sprint.date) : ''

    this.container.innerHTML = `
      <div class="sprint-list-item ${statusClass}"
           role="listitem"
           tabindex="0"
           data-sprint-id="${sprintId}"
           aria-label="${sprintName}, ${statusLabel}${storyCount > 0 ? `, ${storyCount} stories` : ''}">
        <div class="sprint-item-status" aria-hidden="true">
          <span class="sprint-status-indicator"></span>
        </div>
        <div class="sprint-item-content">
          <div class="sprint-item-header">
            <span class="sprint-item-name">${sprintName}</span>
            ${dateStr ? `<span class="sprint-item-date">${dateStr}</span>` : ''}
          </div>
          <div class="sprint-item-meta">
            <span class="sprint-item-status-label">${statusLabel}</span>
            ${storyCount > 0 ? `
              <span class="sprint-item-divider" aria-hidden="true">·</span>
              <span class="sprint-item-stories">${storyCount} ${storyCount === 1 ? 'story' : 'stories'}</span>
            ` : ''}
          </div>
          ${this.sprint.description ? `
            <div class="sprint-item-description">${this.escapeHtml(this.truncate(this.sprint.description, 80))}</div>
          ` : ''}
        </div>
        <div class="sprint-item-chevron" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </div>
    `

    this.bindEvents()
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const item = this.container.querySelector('.sprint-list-item')
    if (!item) return

    item.addEventListener('click', () => this.handleClick())
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        this.handleClick()
      }
    })
  }

  /**
   * Handle click event
   */
  handleClick() {
    if (this.onClick) {
      this.onClick(this.sprint, this.index)
    }

    const event = new CustomEvent('sprintitem:click', {
      detail: { sprint: this.sprint, index: this.index },
      bubbles: true
    })
    this.container.dispatchEvent(event)
  }

  /**
   * Get CSS class for sprint status
   * @param {string} status - Sprint status
   * @returns {string} CSS class
   */
  getStatusClass(status) {
    const statusMap = {
      active: 'sprint-status-active',
      completed: 'sprint-status-completed',
      closed: 'sprint-status-completed',
      cancelled: 'sprint-status-cancelled',
      pending: 'sprint-status-pending'
    }
    return statusMap[status?.toLowerCase()] || 'sprint-status-default'
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
      cancelled: 'Cancelled',
      pending: 'Pending'
    }
    return labelMap[status?.toLowerCase()] || 'Unknown'
  }

  /**
   * Format date for display
   * @param {string} dateStr - Date string
   * @returns {string} Formatted date
   */
  formatDate(dateStr) {
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('default', {
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  /**
   * Truncate text to specified length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text
    return text.substring(0, maxLength).trim() + '...'
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
   * Update sprint data
   * @param {Object} sprint - New sprint data
   */
  setSprint(sprint) {
    this.sprint = sprint || {}
    this.render()
  }

  /**
   * Destroy the component
   */
  destroy() {
    this.container.innerHTML = ''
  }
}

// Export for use by plugin system
export { SprintListItem }
