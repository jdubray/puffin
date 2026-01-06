/**
 * SprintPanel Component
 *
 * Left panel displaying sprints for the selected calendar day.
 * Shows sprint list with status indicators and empty state.
 */

class SprintPanel {
  /**
   * Create a SprintPanel
   * @param {HTMLElement} container - Container element
   * @param {Object} options - Configuration options
   * @param {string} options.selectedDate - Initially selected date (YYYY-MM-DD)
   * @param {Function} options.onSprintClick - Callback when sprint is clicked
   * @param {Function} options.getSprintsForDate - Function to fetch sprints for a date
   */
  constructor(container, options = {}) {
    this.container = container
    this.selectedDate = options.selectedDate || null
    this.onSprintClick = options.onSprintClick || null
    this.getSprintsForDate = options.getSprintsForDate || null
    this.sprints = []

    this.render()
  }

  /**
   * Render the panel structure
   */
  render() {
    this.container.innerHTML = `
      <div class="sprint-panel" role="complementary" aria-label="Sprint history panel">
        <div class="sprint-panel-header">
          <h3 class="sprint-panel-title">Sprints</h3>
          <span class="sprint-panel-date" aria-live="polite"></span>
        </div>
        <div class="sprint-panel-content" role="list" aria-label="Sprint list">
          ${this.renderContent()}
        </div>
      </div>
    `

    this.updateDateDisplay()
    this.bindEvents()
  }

  /**
   * Render panel content based on state
   * @returns {string} HTML string
   */
  renderContent() {
    if (!this.selectedDate) {
      return this.renderNoSelection()
    }

    if (this.sprints.length === 0) {
      return this.renderEmptyState()
    }

    return this.renderSprintList()
  }

  /**
   * Render no selection state
   * @returns {string} HTML string
   */
  renderNoSelection() {
    return `
      <div class="sprint-panel-empty" role="status">
        <div class="sprint-panel-empty-icon" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <p class="sprint-panel-empty-text">Select a day to view sprints</p>
        <p class="sprint-panel-empty-hint">Click on any day in the calendar</p>
      </div>
    `
  }

  /**
   * Render empty state when no sprints for date
   * @returns {string} HTML string
   */
  renderEmptyState() {
    return `
      <div class="sprint-panel-empty" role="status">
        <div class="sprint-panel-empty-icon" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <p class="sprint-panel-empty-text">No sprints on this day</p>
        <p class="sprint-panel-empty-hint">Try selecting a different date</p>
      </div>
    `
  }

  /**
   * Render sprint list
   * @returns {string} HTML string
   */
  renderSprintList() {
    return this.sprints.map((sprint, index) => this.renderSprintItem(sprint, index)).join('')
  }

  /**
   * Render individual sprint item
   * @param {Object} sprint - Sprint data
   * @param {number} index - Item index for keyboard navigation
   * @returns {string} HTML string
   */
  renderSprintItem(sprint, index) {
    const statusClass = this.getStatusClass(sprint.status)
    const statusLabel = this.getStatusLabel(sprint.status)
    const sprintId = sprint.id || `sprint-${index}`
    const sprintName = this.escapeHtml(sprint.title || sprint.name || sprint.id || `Sprint ${index + 1}`)
    const storyCount = sprint.userStories?.length || 0

    return `
      <div class="sprint-list-item ${statusClass}"
           role="listitem"
           tabindex="0"
           data-sprint-id="${sprintId}"
           data-sprint-index="${index}"
           aria-label="${sprintName}, ${statusLabel}, ${storyCount} stories">
        <div class="sprint-item-status" aria-hidden="true">
          <span class="sprint-status-indicator"></span>
        </div>
        <div class="sprint-item-content">
          <div class="sprint-item-name">${sprintName}</div>
          <div class="sprint-item-meta">
            <span class="sprint-item-status-label">${statusLabel}</span>
            ${storyCount > 0 ? `<span class="sprint-item-stories">${storyCount} ${storyCount === 1 ? 'story' : 'stories'}</span>` : ''}
          </div>
        </div>
        <div class="sprint-item-chevron" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </div>
    `
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
      cancelled: 'sprint-status-cancelled'
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
      cancelled: 'Cancelled'
    }
    return labelMap[status?.toLowerCase()] || 'Unknown'
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
   * Update the date display in header
   */
  updateDateDisplay() {
    const dateEl = this.container.querySelector('.sprint-panel-date')
    if (dateEl) {
      if (this.selectedDate) {
        const date = new Date(this.selectedDate + 'T00:00:00')
        dateEl.textContent = date.toLocaleDateString('default', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        })
      } else {
        dateEl.textContent = ''
      }
    }
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const items = this.container.querySelectorAll('.sprint-list-item')
    items.forEach(item => {
      // Click handler
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.sprintIndex, 10)
        this.handleSprintClick(index)
      })

      // Keyboard handler for accessibility
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          const index = parseInt(item.dataset.sprintIndex, 10)
          this.handleSprintClick(index)
        }
      })
    })
  }

  /**
   * Handle sprint item click
   * @param {number} index - Sprint index
   */
  handleSprintClick(index) {
    const sprint = this.sprints[index]
    if (!sprint) return

    if (this.onSprintClick) {
      this.onSprintClick(sprint)
    }

    // Emit custom event
    const event = new CustomEvent('calendar:sprint-selected', {
      detail: { sprint, date: this.selectedDate },
      bubbles: true
    })
    this.container.dispatchEvent(event)
  }

  /**
   * Set the selected date and load sprints
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   */
  async setSelectedDate(dateStr) {
    this.selectedDate = dateStr

    // Add selection highlight to calendar
    this.updateCalendarSelection(dateStr)

    // Load sprints for this date
    if (this.getSprintsForDate) {
      try {
        this.sprints = await this.getSprintsForDate(dateStr)
      } catch (error) {
        console.error('[SprintPanel] Failed to load sprints:', error)
        this.sprints = []
      }
    } else {
      this.sprints = []
    }

    this.updateContent()
  }

  /**
   * Update calendar day selection highlight
   * @param {string} dateStr - Selected date
   */
  updateCalendarSelection(dateStr) {
    // Remove existing selection
    document.querySelectorAll('.week-day-selected, .month-day-selected').forEach(el => {
      el.classList.remove('week-day-selected', 'month-day-selected')
    })

    // Add selection to new date
    if (dateStr) {
      const weekCell = document.querySelector(`.week-day-cell[data-date="${dateStr}"]`)
      const monthCell = document.querySelector(`.month-day[data-date="${dateStr}"]`)

      if (weekCell) weekCell.classList.add('week-day-selected')
      if (monthCell) monthCell.classList.add('month-day-selected')
    }
  }

  /**
   * Set sprints directly (without fetching)
   * @param {Array} sprints - Array of sprint objects
   */
  setSprints(sprints) {
    this.sprints = sprints || []
    this.updateContent()
  }

  /**
   * Update panel content
   */
  updateContent() {
    const contentEl = this.container.querySelector('.sprint-panel-content')
    if (contentEl) {
      contentEl.innerHTML = this.renderContent()
      this.bindEvents()
    }
    this.updateDateDisplay()
  }

  /**
   * Clear selection and reset panel
   */
  clearSelection() {
    this.selectedDate = null
    this.sprints = []
    this.updateCalendarSelection(null)
    this.updateContent()
  }

  /**
   * Get current selected date
   * @returns {string|null} Selected date string
   */
  getSelectedDate() {
    return this.selectedDate
  }

  /**
   * Destroy the component
   */
  destroy() {
    this.container.innerHTML = ''
  }
}

// Export for use by plugin system
export { SprintPanel }
