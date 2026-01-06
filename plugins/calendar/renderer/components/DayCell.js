/**
 * DayCell Component
 *
 * Individual day cell for the calendar grid.
 * Can be used standalone or within CalendarView.
 * Displays activity indicators, git branch pills, and note indicators.
 */

const NOTE_COLORS = {
  yellow: { bg: '#fff9c4', border: '#fbc02d' },
  pink: { bg: '#f8bbd9', border: '#ec407a' },
  blue: { bg: '#bbdefb', border: '#42a5f5' },
  green: { bg: '#c8e6c9', border: '#66bb6a' },
  orange: { bg: '#ffe0b2', border: '#ffa726' },
  purple: { bg: '#e1bee7', border: '#ab47bc' }
}

class DayCell {
  /**
   * Create a DayCell
   * @param {Object} dayData - Day data object
   * @param {Object} options - Configuration options
   * @param {Function} options.getBranchColor - Function to get branch color
   * @param {Function} options.onBranchClick - Callback when branch is clicked
   * @param {Function} options.onNoteClick - Callback when note is clicked
   * @param {Function} options.onAddNote - Callback when add note is clicked
   */
  constructor(dayData, options = {}) {
    this.dayData = dayData
    this.options = options
    this.element = null
    this.branchIndicator = null

    this.create()
  }

  /**
   * Create the DOM element
   */
  create() {
    this.element = document.createElement('div')
    this.element.className = 'calendar-day'

    this.update(this.dayData)
    this.bindEvents()
  }

  /**
   * Update the cell with new data
   * @param {Object} dayData - Day data object
   */
  update(dayData) {
    this.dayData = dayData
    const activity = dayData.activity || {}
    const hasBranches = activity.branches && activity.branches.length > 0
    const hasNotes = activity.notes && activity.notes.length > 0

    // Reset classes
    this.element.className = 'calendar-day'

    // Add conditional classes
    if (dayData.isToday) {
      this.element.classList.add('calendar-day-today')
    }
    if (dayData.isSelected) {
      this.element.classList.add('calendar-day-selected')
    }
    if (activity.hasActivity) {
      this.element.classList.add('calendar-day-has-activity')
    }
    if (hasBranches) {
      this.element.classList.add('calendar-day-has-branches')
    }
    if (hasNotes) {
      this.element.classList.add('calendar-day-has-notes')
    }
    if (dayData.isWeekend) {
      this.element.classList.add('calendar-day-weekend')
    }

    // Set data attribute for date
    if (dayData.date) {
      this.element.setAttribute('data-date', dayData.date)
    }

    // Render content with branch and note indicators
    this.element.innerHTML = `
      <div class="calendar-day-header">
        <span class="calendar-day-number">${dayData.dayOfMonth}</span>
        ${this.renderAddNoteButton()}
      </div>
      ${this.renderNoteIndicators()}
      ${this.renderBranchIndicators()}
      ${this.renderIndicators()}
    `

    // Bind event handlers
    this.bindBranchEvents()
    this.bindNoteEvents()
  }

  /**
   * Render add note button
   * @returns {string} HTML string
   */
  renderAddNoteButton() {
    return `
      <button class="calendar-day-add-note-btn"
              type="button"
              title="Add note"
              aria-label="Add note to this day">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    `
  }

  /**
   * Render note indicators
   * @returns {string} HTML string
   */
  renderNoteIndicators() {
    const activity = this.dayData.activity || {}
    const notes = activity.notes || []

    if (notes.length === 0) {
      return ''
    }

    const maxVisible = 3
    const visibleNotes = notes.slice(0, maxVisible)
    const overflowCount = notes.length - maxVisible

    let html = '<div class="postit-indicators" role="list" aria-label="Notes">'

    visibleNotes.forEach((note, index) => {
      const colorScheme = NOTE_COLORS[note.color] || NOTE_COLORS.yellow
      const truncatedText = note.text ? note.text.substring(0, 50) : ''

      html += `
        <div class="postit-indicator-dot"
             role="listitem"
             tabindex="0"
             data-note-index="${index}"
             data-note-id="${note.id}"
             title="${this.escapeAttr(truncatedText)}"
             style="background: ${colorScheme.bg}; border-color: ${colorScheme.border}">
        </div>
      `
    })

    if (overflowCount > 0) {
      html += `
        <div class="postit-indicator-overflow"
             role="listitem"
             title="${overflowCount} more note(s)">
          +${overflowCount}
        </div>
      `
    }

    html += '</div>'
    return html
  }

  /**
   * Bind note-related event listeners
   */
  bindNoteEvents() {
    // Add note button
    const addNoteBtn = this.element.querySelector('.calendar-day-add-note-btn')
    if (addNoteBtn) {
      addNoteBtn.addEventListener('click', (e) => this.handleAddNoteClick(e))
    }

    // Note indicator dots
    const noteDots = this.element.querySelectorAll('.postit-indicator-dot')
    noteDots.forEach(dot => {
      dot.addEventListener('click', (e) => this.handleNoteClick(e, dot))
      dot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          this.handleNoteClick(e, dot)
        }
      })
    })
  }

  /**
   * Handle add note button click
   * @param {Event} e - Click event
   */
  handleAddNoteClick(e) {
    e.stopPropagation()

    if (this.options.onAddNote) {
      this.options.onAddNote(this.dayData)
    }

    this.element.dispatchEvent(new CustomEvent('daycell:add-note', {
      detail: { dayData: this.dayData },
      bubbles: true
    }))
  }

  /**
   * Handle note indicator click
   * @param {Event} e - Click event
   * @param {HTMLElement} dot - Clicked dot element
   */
  handleNoteClick(e, dot) {
    e.stopPropagation()

    const noteIndex = parseInt(dot.dataset.noteIndex, 10)
    const noteId = dot.dataset.noteId
    const activity = this.dayData.activity || {}
    const notes = activity.notes || []
    const note = notes[noteIndex]

    if (this.options.onNoteClick && note) {
      this.options.onNoteClick(note, this.dayData)
    }

    this.element.dispatchEvent(new CustomEvent('daycell:note-click', {
      detail: { note, noteId, dayData: this.dayData },
      bubbles: true
    }))
  }

  /**
   * Bind click events to branch pills
   */
  bindBranchEvents() {
    const pills = this.element.querySelectorAll('.branch-pill')
    pills.forEach(pill => {
      pill.addEventListener('click', (e) => this.handleBranchClick(e, pill))
      pill.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          this.handleBranchClick(e, pill)
        }
      })
    })
  }

  /**
   * Handle branch pill click
   * @param {Event} e - Click event
   * @param {HTMLElement} pill - Clicked pill element
   */
  handleBranchClick(e, pill) {
    e.stopPropagation() // Prevent day cell click

    const branchName = pill.dataset.branchName
    const isOverflow = pill.dataset.overflow === 'true'

    if (this.options.onBranchClick && !isOverflow) {
      const activity = this.dayData.activity || {}
      const branches = activity.branches || []
      const branchIndex = parseInt(pill.dataset.branchIndex, 10)
      const branch = branches[branchIndex]
      this.options.onBranchClick(branch, e)
    }

    // Dispatch custom event
    const event = new CustomEvent('branch:click', {
      detail: {
        branchName,
        isOverflow,
        dayData: this.dayData
      },
      bubbles: true
    })
    this.element.dispatchEvent(event)
  }

  /**
   * Render activity indicators
   * @returns {string} HTML string for indicators
   */
  renderIndicators() {
    const activity = this.dayData.activity || {}
    const indicators = []

    if (activity.sprintCount > 0) {
      indicators.push(
        `<span class="calendar-indicator calendar-indicator-sprint" title="${activity.sprintCount} sprint(s)"></span>`
      )
    }

    if (activity.storyCount > 0) {
      indicators.push(
        `<span class="calendar-indicator calendar-indicator-story" title="${activity.storyCount} story/stories"></span>`
      )
    }

    // Add branch count indicator (small dot)
    if (activity.branchCount > 0) {
      indicators.push(
        `<span class="calendar-indicator calendar-indicator-branch" title="${activity.branchCount} branch(es)"></span>`
      )
    }

    if (indicators.length === 0) {
      return '<div class="calendar-day-indicators"></div>'
    }

    return `<div class="calendar-day-indicators">${indicators.join('')}</div>`
  }

  /**
   * Render branch indicators (pills)
   * @returns {string} HTML string for branch pills
   */
  renderBranchIndicators() {
    const activity = this.dayData.activity || {}
    const branches = activity.branches || []

    if (branches.length === 0) {
      return ''
    }

    const maxVisible = 3
    const visibleBranches = branches.slice(0, maxVisible)
    const overflowCount = branches.length - maxVisible

    let html = '<div class="branch-indicators" role="list" aria-label="Git branches">'

    visibleBranches.forEach((branch, index) => {
      const name = typeof branch === 'string' ? branch : (branch.name || '')
      const displayName = this.abbreviateBranchName(name, 10)
      const color = this.getBranchColor(name)

      html += `
        <div class="branch-pill"
             role="listitem"
             tabindex="0"
             data-branch-index="${index}"
             data-branch-name="${this.escapeAttr(name)}"
             title="${this.escapeAttr(name)}"
             style="--branch-color: ${color}">
          <span class="branch-pill-text">${this.escapeHtml(displayName)}</span>
        </div>
      `
    })

    if (overflowCount > 0) {
      const overflowNames = branches.slice(maxVisible)
        .map(b => typeof b === 'string' ? b : b.name)
        .join(', ')

      html += `
        <div class="branch-pill branch-pill-overflow"
             role="listitem"
             tabindex="0"
             data-overflow="true"
             title="${this.escapeAttr(overflowNames)}">
          <span class="branch-pill-text">+${overflowCount}</span>
        </div>
      `
    }

    html += '</div>'
    return html
  }

  /**
   * Abbreviate branch name for display
   * @param {string} name - Full branch name
   * @param {number} maxLength - Maximum length
   * @returns {string} Abbreviated name
   */
  abbreviateBranchName(name, maxLength = 10) {
    if (!name) return ''
    if (name.length <= maxLength) return name

    const prefixMatch = name.match(/^([a-z]+)\/(.+)$/i)
    if (prefixMatch) {
      const prefix = prefixMatch[1]
      const rest = prefixMatch[2]
      const shortPrefix = prefix.charAt(0).toLowerCase() + '/'
      const remaining = maxLength - shortPrefix.length - 1

      if (rest.length <= remaining) {
        return shortPrefix + rest
      }
      return shortPrefix + rest.substring(0, remaining) + '…'
    }

    return name.substring(0, maxLength - 1) + '…'
  }

  /**
   * Get color for branch name
   * @param {string} branchName - Branch name
   * @returns {string} HSL color string
   */
  getBranchColor(branchName) {
    // Use custom color function if provided
    if (this.options.getBranchColor) {
      return this.options.getBranchColor(branchName)
    }

    if (!branchName) return 'hsl(0, 0%, 50%)'

    let hash = 0
    for (let i = 0; i < branchName.length; i++) {
      hash = branchName.charCodeAt(i) + ((hash << 5) - hash)
      hash = hash & hash
    }

    const hue = Math.abs(hash % 360)

    if (branchName === 'main' || branchName === 'master') {
      return 'hsl(220, 70%, 55%)'
    }
    if (branchName.startsWith('feature/')) {
      return `hsl(${(hue % 60) + 120}, 65%, 50%)`
    }
    if (branchName.startsWith('bugfix/') || branchName.startsWith('fix/')) {
      return `hsl(${(hue % 30) + 0}, 70%, 55%)`
    }
    if (branchName.startsWith('hotfix/')) {
      return 'hsl(15, 80%, 50%)'
    }
    if (branchName.startsWith('release/')) {
      return `hsl(${(hue % 40) + 260}, 60%, 55%)`
    }

    return `hsl(${hue}, 60%, 50%)`
  }

  /**
   * Escape HTML for safe display
   * @param {string} text - Text to escape
   * @returns {string}
   */
  escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Escape attribute value
   * @param {string} text - Text to escape
   * @returns {string}
   */
  escapeAttr(text) {
    if (!text) return ''
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    this.element.addEventListener('click', (e) => this.handleClick(e))
    this.element.addEventListener('mouseenter', (e) => this.handleMouseEnter(e))
    this.element.addEventListener('mouseleave', (e) => this.handleMouseLeave(e))
  }

  /**
   * Handle click event
   * @param {Event} e - Click event
   */
  handleClick(e) {
    if (this.options.onClick) {
      this.options.onClick(this.dayData, e)
    }

    // Dispatch custom event
    const event = new CustomEvent('daycell:click', {
      detail: this.dayData,
      bubbles: true
    })
    this.element.dispatchEvent(event)
  }

  /**
   * Handle mouse enter event
   * @param {Event} e - Mouse event
   */
  handleMouseEnter(e) {
    if (this.options.onHover) {
      this.options.onHover(this.dayData, true, e)
    }
  }

  /**
   * Handle mouse leave event
   * @param {Event} e - Mouse event
   */
  handleMouseLeave(e) {
    if (this.options.onHover) {
      this.options.onHover(this.dayData, false, e)
    }
  }

  /**
   * Set selected state
   * @param {boolean} selected - Whether the cell is selected
   */
  setSelected(selected) {
    this.dayData.isSelected = selected
    this.element.classList.toggle('calendar-day-selected', selected)
  }

  /**
   * Get the DOM element
   * @returns {HTMLElement}
   */
  getElement() {
    return this.element
  }

  /**
   * Destroy the component
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
    }
    this.element = null
  }
}

// Export for use by plugin system
export { DayCell }
