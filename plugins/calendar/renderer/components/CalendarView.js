/**
 * CalendarView Component
 *
 * Main calendar view supporting both week and month views with toggle control.
 * Integrates ViewToggle, WeekView, MonthView, NavigationControls, and SprintPanel.
 */

import { NoteEditor } from './NoteEditor.js'
import { SprintPanel } from './SprintPanel.js'
import { SprintModal } from './SprintModal.js'

const VIEW_TYPES = {
  WEEK: 'week',
  MONTH: 'month'
}

class CalendarView {
  /**
   * Create a CalendarView
   * @param {HTMLElement} container - Container element
   * @param {Object} options - Configuration options
   * @param {string} options.initialView - Initial view type ('week' or 'month')
   * @param {Function} options.onDaySelect - Callback when day is clicked
   * @param {Function} options.onSprintClick - Callback when sprint is clicked
   * @param {Function} options.onNoteAdd - Callback when note is added
   * @param {Function} options.onNoteEdit - Callback when note is edited
   * @param {Function} options.onNoteDelete - Callback when note is deleted
   * @param {boolean} options.showSprintPanel - Whether to show sprint panel (default: true)
   */
  constructor(container, options = {}) {
    this.container = container
    this.options = options
    this.currentDate = new Date()
    this.currentView = options.initialView || VIEW_TYPES.MONTH
    this.activityData = {}
    this.notesData = {}
    this.selectedDate = null
    this.currentNoteEditor = null

    // Component references
    this.viewToggle = null
    this.weekView = null
    this.monthView = null
    this.navControls = null
    this.sprintPanel = null

    // Container references
    this.toggleContainer = null
    this.navContainer = null
    this.viewContainer = null
    this.panelContainer = null

    this.render()
    this.loadActivityData()
  }

  /**
   * Render the calendar structure
   */
  render() {
    const showPanel = this.options.showSprintPanel !== false

    this.container.innerHTML = `
      <div class="calendar-layout ${showPanel ? 'calendar-layout-with-panel' : ''}">
        ${showPanel ? '<div class="calendar-panel-container"></div>' : ''}
        <div class="calendar-main">
          <div class="calendar-container">
            <div class="calendar-header">
              <div class="calendar-toggle-container"></div>
              <div class="calendar-nav-container"></div>
            </div>
            <div class="calendar-view-container"></div>
          </div>
        </div>
      </div>
    `

    this.toggleContainer = this.container.querySelector('.calendar-toggle-container')
    this.navContainer = this.container.querySelector('.calendar-nav-container')
    this.viewContainer = this.container.querySelector('.calendar-view-container')
    this.panelContainer = this.container.querySelector('.calendar-panel-container')

    this.initializeComponents()
  }

  /**
   * Initialize all sub-components
   */
  initializeComponents() {
    // Initialize sprint panel (if enabled)
    this.initSprintPanel()

    // Initialize view toggle
    this.initViewToggle()

    // Initialize navigation controls
    this.initNavControls()

    // Initialize the current view
    this.initCurrentView()
  }

  /**
   * Initialize sprint panel
   */
  initSprintPanel() {
    if (!this.panelContainer) return

    // Check if SprintPanel is available
    if (typeof SprintPanel !== 'undefined') {
      this.sprintPanel = new SprintPanel(this.panelContainer, {
        selectedDate: this.selectedDate,
        onSprintClick: (sprint) => this.handleSprintClick(sprint),
        getSprintsForDate: (dateStr) => this.getSprintsForDate(dateStr)
      })
    } else {
      // Fallback: render inline panel
      this.renderInlineSprintPanel()
    }
  }

  /**
   * Render inline sprint panel if SprintPanel component not available
   */
  renderInlineSprintPanel() {
    this.panelContainer.innerHTML = `
      <div class="sprint-panel" role="complementary" aria-label="Sprint history panel">
        <div class="sprint-panel-header">
          <h3 class="sprint-panel-title">Sprints</h3>
          <span class="sprint-panel-date" aria-live="polite"></span>
        </div>
        <div class="sprint-panel-content" role="list" aria-label="Sprint list">
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
        </div>
      </div>
    `
  }

  /**
   * Get sprints for a specific date
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   * @returns {Promise<Array>} Sprints for the date
   */
  async getSprintsForDate(dateStr) {
    try {
      // Try plugin IPC invoke API (preferred)
      if (window.puffin?.plugins?.invoke) {
        const result = await window.puffin.plugins.invoke('calendar', 'getSprintsForDate', { dateStr })
        return result || []
      }

      // Try legacy electronAPI
      if (window.electronAPI?.getSprintsForDate) {
        return await window.electronAPI.getSprintsForDate(dateStr)
      }

      // Fallback: filter from activity data
      const activity = this.activityData[dateStr]
      return activity?.sprints || []
    } catch (error) {
      console.error('[CalendarView] Failed to get sprints for date:', error)
      return []
    }
  }

  /**
   * Handle sprint click
   * @param {Object} sprint - Sprint data
   */
  handleSprintClick(sprint) {
    if (this.options.onSprintClick) {
      this.options.onSprintClick(sprint)
    }

    // Emit custom event
    const event = new CustomEvent('calendar:sprint-selected', {
      detail: { sprint, date: this.selectedDate },
      bubbles: true
    })
    this.container.dispatchEvent(event)
  }

  /**
   * Initialize view toggle component
   */
  initViewToggle() {
    // Check if ViewToggle is available
    if (typeof ViewToggle !== 'undefined') {
      this.viewToggle = new ViewToggle(this.toggleContainer, {
        initialView: this.currentView,
        onChange: (view) => this.handleViewChange(view)
      })
    } else {
      // Fallback: render inline toggle
      this.renderInlineToggle()
    }
  }

  /**
   * Render inline toggle if ViewToggle component not available
   */
  renderInlineToggle() {
    this.toggleContainer.innerHTML = `
      <div class="view-toggle">
        <button class="view-toggle-btn ${this.currentView === VIEW_TYPES.WEEK ? 'active' : ''}"
                data-view="${VIEW_TYPES.WEEK}">Week</button>
        <button class="view-toggle-btn ${this.currentView === VIEW_TYPES.MONTH ? 'active' : ''}"
                data-view="${VIEW_TYPES.MONTH}">Month</button>
      </div>
    `

    this.toggleContainer.querySelectorAll('.view-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view
        if (view !== this.currentView) {
          this.handleViewChange(view)
          this.updateToggleState()
        }
      })
    })
  }

  /**
   * Update toggle button active state
   */
  updateToggleState() {
    this.toggleContainer.querySelectorAll('.view-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === this.currentView)
    })
  }

  /**
   * Initialize navigation controls
   */
  initNavControls() {
    // Check if NavigationControls is available
    if (typeof NavigationControls !== 'undefined') {
      this.navControls = new NavigationControls(this.navContainer, {
        title: this.getTitle(),
        onPrevious: () => this.navigatePrevious(),
        onNext: () => this.navigateNext(),
        onToday: () => this.goToToday()
      })
    } else {
      // Fallback: render inline navigation
      this.renderInlineNav()
    }
  }

  /**
   * Render inline navigation if NavigationControls not available
   */
  renderInlineNav() {
    this.navContainer.innerHTML = `
      <div class="calendar-nav">
        <button class="calendar-nav-btn calendar-prev-btn" title="Previous">‹</button>
        <h2 class="calendar-nav-title">${this.escapeHtml(this.getTitle())}</h2>
        <button class="calendar-nav-btn calendar-next-btn" title="Next">›</button>
        <button class="calendar-today-btn" title="Go to today">Today</button>
      </div>
    `

    this.navContainer.querySelector('.calendar-prev-btn')
      .addEventListener('click', () => this.navigatePrevious())
    this.navContainer.querySelector('.calendar-next-btn')
      .addEventListener('click', () => this.navigateNext())
    this.navContainer.querySelector('.calendar-today-btn')
      .addEventListener('click', () => this.goToToday())
  }

  /**
   * Initialize the current view (week or month)
   */
  initCurrentView() {
    this.viewContainer.innerHTML = ''

    if (this.currentView === VIEW_TYPES.WEEK) {
      this.initWeekView()
    } else {
      this.initMonthView()
    }
  }

  /**
   * Initialize week view
   */
  initWeekView() {
    // Check if WeekView component is available
    if (typeof WeekView !== 'undefined') {
      this.weekView = new WeekView(this.viewContainer, {
        selectedDate: this.currentDate,
        onDaySelect: (dayData) => this.handleDaySelect(dayData),
        activityData: this.activityData
      })
    } else {
      // Fallback: render simple week view
      this.renderSimpleWeekView()
    }
  }

  /**
   * Initialize month view
   */
  initMonthView() {
    // Check if MonthView component is available
    if (typeof MonthView !== 'undefined') {
      this.monthView = new MonthView(this.viewContainer, {
        year: this.currentDate.getFullYear(),
        month: this.currentDate.getMonth(),
        onDaySelect: (dayData) => this.handleDaySelect(dayData),
        activityData: this.activityData
      })
    } else {
      // Fallback: render simple month view
      this.renderSimpleMonthView()
    }
  }

  /**
   * Render simple week view fallback
   */
  renderSimpleWeekView() {
    const weekStart = this.getWeekStart(this.currentDate)
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    let html = '<div class="week-view"><div class="week-header">'
    dayNames.forEach(name => {
      html += `<div class="week-day-name">${name}</div>`
    })
    html += '</div><div class="week-days">'

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + i)
      const dateStr = this.formatDateISO(date)
      const isToday = this.isToday(date)
      const activity = this.activityData[dateStr] || {}
      const hasBranches = activity.branches && activity.branches.length > 0
      const hasNotes = activity.notes && activity.notes.length > 0

      let classes = 'week-day-cell'
      if (isToday) classes += ' week-day-today'
      if (activity.hasActivity) classes += ' week-day-has-activity'
      if (hasBranches) classes += ' week-day-has-branches'
      if (hasNotes) classes += ' week-day-has-notes'

      html += `
        <div class="${classes}" data-date="${dateStr}">
          <div class="calendar-day-header">
            <span class="week-day-number">${date.getDate()}</span>
            ${this.renderAddNoteButton(dateStr)}
          </div>
          ${this.renderFullNotes(activity.notes || [], dateStr)}
          ${this.renderBranchPills(activity.branches || [])}
          ${this.renderActivityBadges(activity)}
        </div>
      `
    }

    html += '</div></div>'
    this.viewContainer.innerHTML = html
    this.bindDayClickEvents()
    this.bindBranchPillEvents()
    this.bindNoteEvents()
  }

  /**
   * Render simple month view fallback
   */
  renderSimpleMonthView() {
    const year = this.currentDate.getFullYear()
    const month = this.currentDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const firstDay = new Date(year, month, 1).getDay()
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    let html = '<div class="month-view"><div class="month-weekdays">'
    dayNames.forEach(name => {
      html += `<div class="month-weekday">${name}</div>`
    })
    html += '</div><div class="month-grid">'

    // Empty cells for days before first of month
    for (let i = 0; i < firstDay; i++) {
      html += '<div class="month-day month-day-other"></div>'
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      const dateStr = this.formatDateISO(date)
      const isToday = this.isToday(date)
      const activity = this.activityData[dateStr] || {}
      const hasBranches = activity.branches && activity.branches.length > 0
      const hasNotes = activity.notes && activity.notes.length > 0

      let classes = 'month-day'
      if (isToday) classes += ' month-day-today'
      if (activity.hasActivity) classes += ' month-day-has-activity'
      if (hasBranches) classes += ' month-day-has-branches'
      if (hasNotes) classes += ' month-day-has-notes'

      html += `
        <div class="${classes}" data-date="${dateStr}">
          <div class="calendar-day-header">
            <span class="month-day-number">${day}</span>
            ${this.renderAddNoteButton(dateStr)}
          </div>
          ${this.renderNoteIndicators(activity.notes || [], dateStr)}
          ${this.renderBranchPills(activity.branches || [])}
          <div class="month-day-indicators">
            ${activity.sprintCount > 0 ? '<span class="calendar-indicator calendar-indicator-sprint"></span>' : ''}
            ${activity.storyCount > 0 ? '<span class="calendar-indicator calendar-indicator-story"></span>' : ''}
            ${activity.branchCount > 0 ? '<span class="calendar-indicator calendar-indicator-branch" title="' + activity.branchCount + ' branch(es)"></span>' : ''}
          </div>
        </div>
      `
    }

    // Remaining empty cells
    const totalCells = firstDay + daysInMonth
    const remaining = 42 - totalCells
    for (let i = 0; i < remaining; i++) {
      html += '<div class="month-day month-day-other"></div>'
    }

    html += '</div></div>'
    this.viewContainer.innerHTML = html
    this.bindDayClickEvents()
    this.bindBranchPillEvents()
    this.bindNoteEvents()
  }

  /**
   * Render branch pills for a day cell
   * @param {Array} branches - Array of branch names or branch objects
   * @returns {string} HTML string
   */
  renderBranchPills(branches) {
    if (!branches || branches.length === 0) {
      return ''
    }

    const maxVisible = 3
    const visibleBranches = branches.slice(0, maxVisible)
    const overflowCount = branches.length - maxVisible

    let html = '<div class="branch-indicators" role="list" aria-label="Git branches">'

    visibleBranches.forEach((branch, index) => {
      const name = typeof branch === 'string' ? branch : (branch.name || '')
      const displayName = this.abbreviateBranchName(name, 8)
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
   * Bind click events to branch pills
   */
  bindBranchPillEvents() {
    const pills = this.viewContainer.querySelectorAll('.branch-pill')
    pills.forEach(pill => {
      pill.addEventListener('click', (e) => this.handleBranchPillClick(e, pill))
      pill.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          this.handleBranchPillClick(e, pill)
        }
      })
    })
  }

  /**
   * Handle branch pill click
   * @param {Event} e - Click event
   * @param {HTMLElement} pill - Clicked pill element
   */
  handleBranchPillClick(e, pill) {
    e.stopPropagation() // Prevent day cell click

    const branchName = pill.dataset.branchName
    const isOverflow = pill.dataset.overflow === 'true'

    // Dispatch custom event
    const event = new CustomEvent('calendar:branch-selected', {
      detail: {
        branchName,
        isOverflow
      },
      bubbles: true
    })
    this.container.dispatchEvent(event)
  }

  // ==========================================================================
  // Post-it Notes Methods
  // ==========================================================================

  /**
   * Note color constants
   */
  static NOTE_COLORS = {
    yellow: { bg: '#fff9c4', border: '#fbc02d' },
    pink: { bg: '#f8bbd9', border: '#ec407a' },
    blue: { bg: '#bbdefb', border: '#42a5f5' },
    green: { bg: '#c8e6c9', border: '#66bb6a' },
    orange: { bg: '#ffe0b2', border: '#ffa726' },
    purple: { bg: '#e1bee7', border: '#ab47bc' }
  }

  /**
   * Render add note button for a day cell
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   * @returns {string} HTML string
   */
  renderAddNoteButton(dateStr) {
    return `
      <button class="calendar-day-add-note-btn"
              type="button"
              title="Add note"
              aria-label="Add note to this day"
              data-date="${dateStr}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    `
  }

  /**
   * Render note indicators for a day cell
   * @param {Array} notes - Array of notes
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   * @returns {string} HTML string
   */
  renderNoteIndicators(notes, dateStr) {
    if (!notes || notes.length === 0) {
      return ''
    }

    const maxVisible = 3
    const visibleNotes = notes.slice(0, maxVisible)
    const overflowCount = notes.length - maxVisible

    let html = '<div class="postit-indicators" role="list" aria-label="Notes">'

    visibleNotes.forEach((note, index) => {
      const colorScheme = CalendarView.NOTE_COLORS[note.color] || CalendarView.NOTE_COLORS.yellow
      const truncatedText = note.text ? note.text.substring(0, 50) : ''

      html += `
        <div class="postit-indicator-dot"
             role="listitem"
             tabindex="0"
             data-note-index="${index}"
             data-note-id="${note.id}"
             data-date="${dateStr}"
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
   * Render full post-it notes for week view (more space available)
   * @param {Array} notes - Array of notes
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   * @returns {string} HTML string
   */
  renderFullNotes(notes, dateStr) {
    if (!notes || notes.length === 0) {
      return ''
    }

    const maxVisible = 2 // Show up to 2 full notes in week view
    const visibleNotes = notes.slice(0, maxVisible)
    const overflowCount = notes.length - maxVisible

    let html = '<div class="week-notes-container">'

    visibleNotes.forEach((note, index) => {
      const colorScheme = CalendarView.NOTE_COLORS[note.color] || CalendarView.NOTE_COLORS.yellow
      const truncatedText = note.text ? (note.text.length > 150 ? note.text.substring(0, 150) + '...' : note.text) : ''

      html += `
        <div class="week-postit-note"
             role="button"
             tabindex="0"
             data-note-index="${index}"
             data-note-id="${note.id}"
             data-date="${dateStr}"
             style="background: ${colorScheme.bg}; border-left: 3px solid ${colorScheme.border}">
          <span class="week-postit-text">${this.escapeHtml(truncatedText)}</span>
        </div>
      `
    })

    if (overflowCount > 0) {
      html += `
        <div class="week-notes-overflow" title="${overflowCount} more note(s)">
          +${overflowCount} more
        </div>
      `
    }

    html += '</div>'
    return html
  }

  /**
   * Render activity badges with labels (clearer than dots)
   * @param {Object} activity - Activity data for the day
   * @returns {string} HTML string
   */
  renderActivityBadges(activity) {
    const badges = []

    if (activity.sprintCount > 0) {
      badges.push(`<span class="activity-badge activity-badge-sprint" title="Sprint activity">
        <span class="activity-badge-icon">●</span>
        <span class="activity-badge-label">${activity.sprintCount} sprint${activity.sprintCount > 1 ? 's' : ''}</span>
      </span>`)
    }

    if (activity.storyCount > 0) {
      badges.push(`<span class="activity-badge activity-badge-story" title="Story activity">
        <span class="activity-badge-icon">●</span>
        <span class="activity-badge-label">${activity.storyCount} stor${activity.storyCount > 1 ? 'ies' : 'y'}</span>
      </span>`)
    }

    if (badges.length === 0) {
      return ''
    }

    return `<div class="activity-badges">${badges.join('')}</div>`
  }

  /**
   * Bind note-related event listeners
   */
  bindNoteEvents() {
    // Add note buttons
    const addNoteBtns = this.viewContainer.querySelectorAll('.calendar-day-add-note-btn')
    addNoteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => this.handleAddNoteClick(e, btn))
    })

    // Note indicator dots (month view)
    const noteDots = this.viewContainer.querySelectorAll('.postit-indicator-dot')
    noteDots.forEach(dot => {
      dot.addEventListener('click', (e) => this.handleNoteClick(e, dot))
      dot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          this.handleNoteClick(e, dot)
        }
      })
    })

    // Full post-it notes (week view)
    const weekNotes = this.viewContainer.querySelectorAll('.week-postit-note')
    weekNotes.forEach(note => {
      note.addEventListener('click', (e) => this.handleNoteClick(e, note))
      note.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          this.handleNoteClick(e, note)
        }
      })
    })
  }

  /**
   * Handle add note button click
   * @param {Event} e - Click event
   * @param {HTMLElement} btn - Clicked button element
   */
  handleAddNoteClick(e, btn) {
    e.stopPropagation() // Prevent day cell click

    const dateStr = btn.dataset.date
    this.openNoteEditor(dateStr, null)
  }

  /**
   * Handle note indicator click
   * @param {Event} e - Click event
   * @param {HTMLElement} dot - Clicked dot element
   */
  handleNoteClick(e, dot) {
    e.stopPropagation() // Prevent day cell click

    const dateStr = dot.dataset.date
    const noteId = dot.dataset.noteId
    const noteIndex = parseInt(dot.dataset.noteIndex, 10)

    // Find the note in activity data
    const activity = this.activityData[dateStr] || {}
    const notes = activity.notes || []
    const note = notes[noteIndex] || notes.find(n => n.id === noteId)

    if (note) {
      this.openNoteEditor(dateStr, note)
    }
  }

  /**
   * Open the note editor modal
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   * @param {Object|null} note - Existing note to edit, or null for new
   */
  openNoteEditor(dateStr, note) {
    // Close existing editor if open
    if (this.currentNoteEditor) {
      this.currentNoteEditor.close()
      this.currentNoteEditor = null
    }

    // Use the imported NoteEditor component
    this.currentNoteEditor = NoteEditor.show({
      note: note,
      dateStr: dateStr,
      onSave: (noteData, date) => this.handleNoteSave(noteData, date),
      onDelete: (deletedNote) => this.handleNoteDelete(deletedNote, dateStr),
      onClose: () => {
        this.currentNoteEditor = null
      }
    })
  }

  /**
   * Handle note save from editor
   * @param {Object} noteData - Note data (text, color, optionally id)
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   */
  async handleNoteSave(noteData, dateStr) {
    try {
      let result

      if (noteData.id) {
        // Update existing note via plugin invoke API
        if (window.puffin?.plugins?.invoke) {
          result = await window.puffin.plugins.invoke('calendar', 'updateNote', {
            dateStr,
            noteId: noteData.id,
            updates: { text: noteData.text, color: noteData.color }
          })
        }
      } else {
        // Create new note via plugin invoke API
        if (window.puffin?.plugins?.invoke) {
          result = await window.puffin.plugins.invoke('calendar', 'createNote', {
            dateStr,
            text: noteData.text,
            color: noteData.color
          })
        }
      }

      if (result?.success) {
        // Refresh to show updated notes
        await this.loadActivityData()

        // Callback
        if (this.options.onNoteAdd && !noteData.id) {
          this.options.onNoteAdd(result.note, dateStr)
        } else if (this.options.onNoteEdit && noteData.id) {
          this.options.onNoteEdit(result.note, dateStr)
        }

        // Dispatch event
        const eventName = noteData.id ? 'calendar:note-updated' : 'calendar:note-created'
        const event = new CustomEvent(eventName, {
          detail: { note: result.note, dateStr },
          bubbles: true
        })
        this.container.dispatchEvent(event)
      }
    } catch (error) {
      console.error('[CalendarView] Failed to save note:', error)
    }
  }

  /**
   * Handle note delete from editor
   * @param {Object} note - Note to delete
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   */
  async handleNoteDelete(note, dateStr) {
    try {
      let result

      // Delete note via plugin invoke API
      if (window.puffin?.plugins?.invoke) {
        result = await window.puffin.plugins.invoke('calendar', 'deleteNote', {
          dateStr,
          noteId: note.id
        })
      }

      if (result?.success) {
        // Refresh to show updated notes
        await this.loadActivityData()

        // Callback
        if (this.options.onNoteDelete) {
          this.options.onNoteDelete(note, dateStr)
        }

        // Dispatch event
        const event = new CustomEvent('calendar:note-deleted', {
          detail: { note, dateStr },
          bubbles: true
        })
        this.container.dispatchEvent(event)
      }
    } catch (error) {
      console.error('[CalendarView] Failed to delete note:', error)
    }
  }

  /**
   * Bind click events to day cells
   */
  bindDayClickEvents() {
    const cells = this.viewContainer.querySelectorAll('[data-date]')
    cells.forEach(cell => {
      cell.addEventListener('click', () => {
        const dateStr = cell.dataset.date
        const date = new Date(dateStr + 'T00:00:00')
        const activity = this.activityData[dateStr] || { hasActivity: false }

        this.handleDaySelect({
          date: dateStr,
          dayOfMonth: date.getDate(),
          dayOfWeek: date.getDay(),
          activity
        })
      })
    })
  }

  /**
   * Handle view change from toggle
   * @param {string} view - New view type
   */
  handleViewChange(view) {
    this.currentView = view
    this.initCurrentView()
    this.updateTitle()
  }

  /**
   * Handle day selection
   * @param {Object} dayData - Data for selected day
   */
  handleDaySelect(dayData) {
    this.selectedDate = dayData.date

    // Update day selection visual
    this.updateDaySelection(dayData.date)

    // Update sprint panel
    this.updateSprintPanel(dayData.date)

    if (this.options.onDaySelect) {
      this.options.onDaySelect(dayData)
    }

    // Emit custom event
    const event = new CustomEvent('calendar:day-selected', {
      detail: dayData,
      bubbles: true
    })
    this.container.dispatchEvent(event)
  }

  /**
   * Update day selection visual highlight
   * @param {string} dateStr - Selected date string
   */
  updateDaySelection(dateStr) {
    // Remove existing selection
    this.container.querySelectorAll('.week-day-selected, .month-day-selected').forEach(el => {
      el.classList.remove('week-day-selected', 'month-day-selected')
    })

    // Add selection to new date
    if (dateStr) {
      const weekCell = this.container.querySelector(`.week-day-cell[data-date="${dateStr}"]`)
      const monthCell = this.container.querySelector(`.month-day[data-date="${dateStr}"]`)

      if (weekCell) weekCell.classList.add('week-day-selected')
      if (monthCell) monthCell.classList.add('month-day-selected')
    }
  }

  /**
   * Update sprint panel with sprints for selected date
   * @param {string} dateStr - Selected date string
   */
  async updateSprintPanel(dateStr) {
    if (this.sprintPanel) {
      await this.sprintPanel.setSelectedDate(dateStr)
    } else if (this.panelContainer) {
      // Fallback: update inline panel
      await this.updateInlineSprintPanel(dateStr)
    }
  }

  /**
   * Update inline sprint panel (fallback)
   * @param {string} dateStr - Selected date string
   */
  async updateInlineSprintPanel(dateStr) {
    const contentEl = this.panelContainer.querySelector('.sprint-panel-content')
    const dateEl = this.panelContainer.querySelector('.sprint-panel-date')

    if (!contentEl) return

    // Update date display
    if (dateEl && dateStr) {
      const date = new Date(dateStr + 'T00:00:00')
      dateEl.textContent = date.toLocaleDateString('default', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      })
    }

    // Get sprints for date
    const sprints = await this.getSprintsForDate(dateStr)

    if (sprints.length === 0) {
      contentEl.innerHTML = `
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
      return
    }

    // Render sprint list
    contentEl.innerHTML = sprints.map((sprint, index) => {
      const statusClass = this.getSprintStatusClass(sprint.status)
      const statusLabel = this.getSprintStatusLabel(sprint.status)
      const sprintName = this.escapeHtml(sprint.title || sprint.name || sprint.id || `Sprint ${index + 1}`)
      const storyCount = sprint.userStories?.length || 0

      return `
        <div class="sprint-list-item ${statusClass}"
             role="listitem"
             tabindex="0"
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
    }).join('')

    // Bind click events
    contentEl.querySelectorAll('.sprint-list-item').forEach(item => {
      const index = parseInt(item.dataset.sprintIndex, 10)
      item.addEventListener('click', () => this.handleSprintClick(sprints[index]))
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          this.handleSprintClick(sprints[index])
        }
      })
    })
  }

  /**
   * Get CSS class for sprint status
   * @param {string} status - Sprint status
   * @returns {string} CSS class
   */
  getSprintStatusClass(status) {
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
  getSprintStatusLabel(status) {
    const labelMap = {
      active: 'Active',
      completed: 'Completed',
      closed: 'Closed',
      cancelled: 'Cancelled'
    }
    return labelMap[status?.toLowerCase()] || 'Unknown'
  }

  /**
   * Navigate to previous period (week or month)
   */
  navigatePrevious() {
    if (this.currentView === VIEW_TYPES.WEEK) {
      this.currentDate.setDate(this.currentDate.getDate() - 7)
      if (this.weekView) {
        this.weekView.previousWeek()
      } else {
        this.renderSimpleWeekView()
      }
    } else {
      this.currentDate.setMonth(this.currentDate.getMonth() - 1)
      if (this.monthView) {
        this.monthView.previousMonth()
      } else {
        this.renderSimpleMonthView()
      }
    }
    this.updateTitle()
    this.loadActivityData()
  }

  /**
   * Navigate to next period (week or month)
   */
  navigateNext() {
    if (this.currentView === VIEW_TYPES.WEEK) {
      this.currentDate.setDate(this.currentDate.getDate() + 7)
      if (this.weekView) {
        this.weekView.nextWeek()
      } else {
        this.renderSimpleWeekView()
      }
    } else {
      this.currentDate.setMonth(this.currentDate.getMonth() + 1)
      if (this.monthView) {
        this.monthView.nextMonth()
      } else {
        this.renderSimpleMonthView()
      }
    }
    this.updateTitle()
    this.loadActivityData()
  }

  /**
   * Navigate to today
   */
  goToToday() {
    this.currentDate = new Date()
    this.initCurrentView()
    this.updateTitle()
    this.loadActivityData()
  }

  /**
   * Update the navigation title
   */
  updateTitle() {
    const title = this.getTitle()
    if (this.navControls) {
      this.navControls.setTitle(title)
    } else {
      const titleEl = this.navContainer.querySelector('.calendar-nav-title')
      if (titleEl) {
        titleEl.textContent = title
      }
    }
  }

  /**
   * Get the current title based on view type
   * @returns {string}
   */
  getTitle() {
    if (this.currentView === VIEW_TYPES.WEEK) {
      const weekStart = this.getWeekStart(this.currentDate)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)

      const startMonth = weekStart.toLocaleString('default', { month: 'short' })
      const endMonth = weekEnd.toLocaleString('default', { month: 'short' })
      const startDay = weekStart.getDate()
      const endDay = weekEnd.getDate()
      const year = weekEnd.getFullYear()

      if (startMonth === endMonth) {
        return `${startMonth} ${startDay} - ${endDay}, ${year}`
      }
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`
    }

    return this.currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })
  }

  /**
   * Load activity data for the current view
   */
  async loadActivityData() {
    try {
      const range = this.getDateRange()
      const startDate = this.formatDateISO(range.start)
      const endDate = this.formatDateISO(range.end)

      // Load sprint activity data using plugin invoke API
      if (window.puffin?.plugins?.invoke) {
        // Build activity data for each day in range
        const activityData = {}
        const start = new Date(startDate)
        const end = new Date(endDate)

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = this.formatDateISO(d)
          try {
            const sprints = await window.puffin.plugins.invoke('calendar', 'getSprintsForDate', { dateStr })
            if (sprints && sprints.length > 0) {
              activityData[dateStr] = {
                hasActivity: true,
                sprintCount: sprints.length,
                storyCount: sprints.reduce((sum, s) => sum + (s.storyCount || s.stories?.length || 0), 0),
                sprints: sprints.map(s => ({
                  id: s.id,
                  title: s.title || 'Untitled Sprint',
                  status: s.status,
                  createdAt: s.createdAt,
                  closedAt: s.closedAt,
                  storyCount: s.storyCount || s.stories?.length || 0
                }))
              }
            }
          } catch (err) {
            console.debug(`[CalendarView] Failed to load sprints for ${dateStr}:`, err.message)
          }
        }
        this.activityData = activityData
      }

      // Load git branch data and merge with activity data
      await this.loadBranchData(startDate, endDate)

      // Load notes data and merge with activity data
      await this.loadNotesData(startDate, endDate)

      this.updateActivityDisplay()
    } catch (error) {
      console.error('[CalendarView] Failed to load activity data:', error)
    }
  }

  /**
   * Load notes data for the date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   */
  async loadNotesData(startDate, endDate) {
    try {
      let notesActivity = {}

      // Load notes via plugin invoke API
      if (window.puffin?.plugins?.invoke) {
        notesActivity = await window.puffin.plugins.invoke('calendar', 'getNotesForRange', {
          startDate,
          endDate
        }) || {}
      }

      this.notesData = notesActivity

      // Merge notes data into activity data
      Object.keys(notesActivity).forEach(dateStr => {
        if (!this.activityData[dateStr]) {
          this.activityData[dateStr] = {
            hasActivity: false,
            sprintCount: 0,
            storyCount: 0,
            sprints: []
          }
        }
        const noteData = notesActivity[dateStr]
        this.activityData[dateStr].notes = noteData.notes || []
        this.activityData[dateStr].noteCount = noteData.noteCount || 0
        if (noteData.noteCount > 0) {
          this.activityData[dateStr].hasActivity = true
        }
      })
    } catch (error) {
      console.error('[CalendarView] Failed to load notes data:', error)
    }
  }

  /**
   * Parse notes activity from notes data
   * @param {Object} notesData - Notes data keyed by date
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Object} Notes activity by date
   */
  parseNotesActivity(notesData, startDate, endDate) {
    if (!notesData || typeof notesData !== 'object') return {}

    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T23:59:59')
    const activity = {}

    Object.keys(notesData).forEach(dateStr => {
      const date = new Date(dateStr + 'T00:00:00')
      if (date >= start && date <= end) {
        const notes = notesData[dateStr] || []
        if (notes.length > 0) {
          activity[dateStr] = {
            noteCount: notes.length,
            notes: notes,
            colors: [...new Set(notes.map(n => n.color))]
          }
        }
      }
    })

    return activity
  }

  /**
   * Load git branch data for the date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   */
  async loadBranchData(startDate, endDate) {
    try {
      let branchActivity = {}

      // Try plugin API
      if (window.puffin?.plugins?.calendar?.getBranchActivityForRange) {
        branchActivity = await window.puffin.plugins.calendar.getBranchActivityForRange(startDate, endDate)
      }
      // Fallback: try IPC
      else if (window.electronAPI?.getBranchActivityForRange) {
        branchActivity = await window.electronAPI.getBranchActivityForRange(startDate, endDate)
      }
      // Fallback: try loading git operations directly
      else if (window.electronAPI?.getGitOperations) {
        const gitData = await window.electronAPI.getGitOperations()
        if (gitData?.operations) {
          branchActivity = this.parseBranchActivity(gitData.operations, startDate, endDate)
        }
      }

      // Merge branch data into activity data
      Object.keys(branchActivity).forEach(dateStr => {
        if (!this.activityData[dateStr]) {
          this.activityData[dateStr] = {
            hasActivity: false,
            sprintCount: 0,
            storyCount: 0,
            sprints: []
          }
        }
        const branchData = branchActivity[dateStr]
        this.activityData[dateStr].branches = branchData.branches || []
        this.activityData[dateStr].branchCount = branchData.branchCount || 0
        if (branchData.branchCount > 0) {
          this.activityData[dateStr].hasActivity = true
        }
      })
    } catch (error) {
      console.error('[CalendarView] Failed to load branch data:', error)
    }
  }

  /**
   * Parse branch activity from git operations
   * @param {Array} operations - Git operations array
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {Object} Branch activity by date
   */
  parseBranchActivity(operations, startDate, endDate) {
    if (!Array.isArray(operations)) return {}

    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T23:59:59')
    const activity = {}

    operations.forEach(op => {
      if (!op.timestamp) return

      const opDate = new Date(op.timestamp)
      if (opDate < start || opDate > end) return

      const dateStr = opDate.toISOString().split('T')[0]
      const branchName = this.extractBranchName(op)

      if (!branchName) return

      if (!activity[dateStr]) {
        activity[dateStr] = {
          branches: new Set(),
          branchCount: 0
        }
      }

      activity[dateStr].branches.add(branchName)
      activity[dateStr].branchCount = activity[dateStr].branches.size
    })

    // Convert Sets to Arrays
    Object.keys(activity).forEach(dateStr => {
      activity[dateStr].branches = Array.from(activity[dateStr].branches)
    })

    return activity
  }

  /**
   * Extract branch name from a git operation
   * @param {Object} operation - Git operation
   * @returns {string|null} Branch name
   */
  extractBranchName(operation) {
    if (!operation) return null

    if (operation.branch) {
      return operation.branch
    }

    if (operation.type === 'merge' && operation.sourceBranch) {
      return operation.sourceBranch
    }

    return null
  }

  /**
   * Update activity display in the current view
   */
  updateActivityDisplay() {
    if (this.currentView === VIEW_TYPES.WEEK) {
      if (this.weekView) {
        this.weekView.setActivityData(this.activityData)
      } else {
        // Re-render simple week view with updated data
        this.renderSimpleWeekView()
      }
    } else if (this.currentView === VIEW_TYPES.MONTH) {
      if (this.monthView) {
        this.monthView.setActivityData(this.activityData)
      } else {
        // Re-render simple month view with updated data
        this.renderSimpleMonthView()
      }
    }
  }

  /**
   * Get the date range for the current view
   * @returns {Object} Start and end dates
   */
  getDateRange() {
    if (this.currentView === VIEW_TYPES.WEEK) {
      const start = this.getWeekStart(this.currentDate)
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return { start, end }
    }

    // Month range
    const year = this.currentDate.getFullYear()
    const month = this.currentDate.getMonth()
    return {
      start: new Date(year, month, 1),
      end: new Date(year, month + 1, 0)
    }
  }

  // Utility methods

  /**
   * Get the start of the week (Sunday)
   * @param {Date} date - Reference date
   * @returns {Date}
   */
  getWeekStart(date) {
    const d = new Date(date)
    const day = d.getDay()
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    return d
  }

  /**
   * Format date as ISO string
   * @param {Date} date - Date to format
   * @returns {string}
   */
  formatDateISO(date) {
    return date.toISOString().split('T')[0]
  }

  /**
   * Check if date is today
   * @param {Date} date - Date to check
   * @returns {boolean}
   */
  isToday(date) {
    const today = new Date()
    return date.getFullYear() === today.getFullYear() &&
           date.getMonth() === today.getMonth() &&
           date.getDate() === today.getDate()
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string}
   */
  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Refresh the calendar
   */
  async refresh() {
    await this.loadActivityData()
  }

  /**
   * Destroy the component
   */
  destroy() {
    if (this.currentNoteEditor) {
      this.currentNoteEditor.close()
      this.currentNoteEditor = null
    }
    if (this.viewToggle && this.viewToggle.destroy) {
      this.viewToggle.destroy()
    }
    if (this.navControls && this.navControls.destroy) {
      this.navControls.destroy()
    }
    if (this.weekView && this.weekView.destroy) {
      this.weekView.destroy()
    }
    if (this.monthView && this.monthView.destroy) {
      this.monthView.destroy()
    }
    if (this.sprintPanel && this.sprintPanel.destroy) {
      this.sprintPanel.destroy()
    }
    this.container.innerHTML = ''
  }
}

// Export for use by plugin system
export { CalendarView, VIEW_TYPES }
