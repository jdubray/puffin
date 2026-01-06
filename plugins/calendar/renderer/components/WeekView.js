/**
 * WeekView Component
 *
 * Displays a single week row with 7 day cells.
 * Shows the week containing the current/selected date.
 */

class WeekView {
  /**
   * Create a WeekView
   * @param {HTMLElement} container - Container element
   * @param {Object} options - Configuration options
   * @param {Date} options.selectedDate - Currently selected date
   * @param {Function} options.onDaySelect - Callback when day is clicked
   * @param {Object} options.activityData - Activity data by date string
   */
  constructor(container, options = {}) {
    this.container = container
    this.selectedDate = options.selectedDate || new Date()
    this.onDaySelect = options.onDaySelect || null
    this.activityData = options.activityData || {}

    this.weekStart = this.getWeekStart(this.selectedDate)
    this.render()
  }

  /**
   * Get the start of the week (Sunday) for a given date
   * @param {Date} date - Reference date
   * @returns {Date} Sunday of that week
   */
  getWeekStart(date) {
    const d = new Date(date)
    const day = d.getDay()
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    return d
  }

  /**
   * Get array of dates for the current week
   * @returns {Date[]} Array of 7 dates
   */
  getWeekDates() {
    const dates = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(this.weekStart)
      date.setDate(this.weekStart.getDate() + i)
      dates.push(date)
    }
    return dates
  }

  /**
   * Format date as ISO string (YYYY-MM-DD)
   * @param {Date} date - Date to format
   * @returns {string} ISO date string
   */
  formatDateISO(date) {
    return date.toISOString().split('T')[0]
  }

  /**
   * Check if a date is today
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
   * Render the week view
   */
  render() {
    const weekDates = this.getWeekDates()
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    this.container.innerHTML = `
      <div class="week-view">
        <div class="week-header">
          ${dayNames.map(name => `<div class="week-day-name">${name}</div>`).join('')}
        </div>
        <div class="week-days">
          ${weekDates.map(date => this.renderDayCell(date)).join('')}
        </div>
      </div>
    `

    this.bindEvents()
  }

  /**
   * Render a single day cell
   * @param {Date} date - Date for the cell
   * @returns {string} HTML string
   */
  renderDayCell(date) {
    const dateStr = this.formatDateISO(date)
    const isToday = this.isToday(date)
    const activity = this.activityData[dateStr] || { hasActivity: false }

    let classes = 'week-day-cell'
    if (isToday) classes += ' week-day-today'
    if (activity.hasActivity) classes += ' week-day-has-activity'

    const dayNum = date.getDate()
    const monthShort = date.toLocaleString('default', { month: 'short' })

    // Show month name on first day or first of month
    const showMonth = date.getDate() === 1 || date.getDay() === 0

    return `
      <div class="${classes}" data-date="${dateStr}">
        <div class="week-day-date">
          ${showMonth ? `<span class="week-day-month">${monthShort}</span>` : ''}
          <span class="week-day-number">${dayNum}</span>
        </div>
        <div class="week-day-indicators">
          ${activity.sprintCount > 0 ? '<span class="calendar-indicator calendar-indicator-sprint"></span>' : ''}
          ${activity.storyCount > 0 ? '<span class="calendar-indicator calendar-indicator-story"></span>' : ''}
        </div>
      </div>
    `
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const dayCells = this.container.querySelectorAll('.week-day-cell')
    dayCells.forEach(cell => {
      cell.addEventListener('click', () => {
        const dateStr = cell.dataset.date
        const date = new Date(dateStr + 'T00:00:00')
        this.handleDayClick(date, dateStr)
      })
    })
  }

  /**
   * Handle day cell click
   * @param {Date} date - Clicked date
   * @param {string} dateStr - ISO date string
   */
  handleDayClick(date, dateStr) {
    const activity = this.activityData[dateStr] || { hasActivity: false }

    if (this.onDaySelect) {
      this.onDaySelect({
        date: dateStr,
        dayOfMonth: date.getDate(),
        dayOfWeek: date.getDay(),
        activity
      })
    }

    // Emit custom event
    const event = new CustomEvent('calendar:day-selected', {
      detail: { date: dateStr, activity },
      bubbles: true
    })
    this.container.dispatchEvent(event)
  }

  /**
   * Navigate to a specific week
   * @param {Date} date - Date within the target week
   */
  setWeek(date) {
    this.selectedDate = date
    this.weekStart = this.getWeekStart(date)
    this.render()
  }

  /**
   * Navigate to previous week
   */
  previousWeek() {
    const newDate = new Date(this.weekStart)
    newDate.setDate(newDate.getDate() - 7)
    this.setWeek(newDate)
  }

  /**
   * Navigate to next week
   */
  nextWeek() {
    const newDate = new Date(this.weekStart)
    newDate.setDate(newDate.getDate() + 7)
    this.setWeek(newDate)
  }

  /**
   * Update activity data
   * @param {Object} activityData - Activity data by date string
   */
  setActivityData(activityData) {
    this.activityData = activityData || {}
    this.render()
  }

  /**
   * Get the current week's date range
   * @returns {Object} Start and end dates
   */
  getDateRange() {
    const end = new Date(this.weekStart)
    end.setDate(end.getDate() + 6)
    return {
      start: new Date(this.weekStart),
      end
    }
  }

  /**
   * Get week title for display
   * @returns {string} Week title (e.g., "Jan 5 - 11, 2025")
   */
  getTitle() {
    const range = this.getDateRange()
    const startMonth = range.start.toLocaleString('default', { month: 'short' })
    const endMonth = range.end.toLocaleString('default', { month: 'short' })
    const startDay = range.start.getDate()
    const endDay = range.end.getDate()
    const year = range.end.getFullYear()

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}, ${year}`
    }
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`
  }

  /**
   * Destroy the component
   */
  destroy() {
    this.container.innerHTML = ''
  }
}

// Export for use by plugin system
export { WeekView }
