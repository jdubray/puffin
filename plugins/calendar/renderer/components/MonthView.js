/**
 * MonthView Component
 *
 * Displays a full month grid with 6 rows to accommodate any month layout.
 * Shows days from previous/next months to fill the grid.
 */

class MonthView {
  /**
   * Create a MonthView
   * @param {HTMLElement} container - Container element
   * @param {Object} options - Configuration options
   * @param {number} options.year - Year to display
   * @param {number} options.month - Month to display (0-11)
   * @param {Function} options.onDaySelect - Callback when day is clicked
   * @param {Object} options.activityData - Activity data by date string
   */
  constructor(container, options = {}) {
    this.container = container
    const now = new Date()
    this.year = options.year ?? now.getFullYear()
    this.month = options.month ?? now.getMonth()
    this.onDaySelect = options.onDaySelect || null
    this.activityData = options.activityData || {}

    this.render()
  }

  /**
   * Get the number of days in a month
   * @param {number} year - Year
   * @param {number} month - Month (0-11)
   * @returns {number}
   */
  getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate()
  }

  /**
   * Get the first day of the month (0-6, Sunday=0)
   * @param {number} year - Year
   * @param {number} month - Month (0-11)
   * @returns {number}
   */
  getFirstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay()
  }

  /**
   * Format date as ISO string (YYYY-MM-DD)
   * @param {number} year - Year
   * @param {number} month - Month (0-11)
   * @param {number} day - Day of month
   * @returns {string}
   */
  formatDateISO(year, month, day) {
    const m = String(month + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${year}-${m}-${d}`
  }

  /**
   * Check if a date is today
   * @param {number} year - Year
   * @param {number} month - Month (0-11)
   * @param {number} day - Day
   * @returns {boolean}
   */
  isToday(year, month, day) {
    const today = new Date()
    return today.getFullYear() === year &&
           today.getMonth() === month &&
           today.getDate() === day
  }

  /**
   * Generate calendar grid data
   * @returns {Object[]} Array of day data objects
   */
  generateCalendarGrid() {
    const days = []
    const daysInMonth = this.getDaysInMonth(this.year, this.month)
    const firstDay = this.getFirstDayOfMonth(this.year, this.month)

    // Previous month days to fill first row
    const prevMonth = this.month === 0 ? 11 : this.month - 1
    const prevYear = this.month === 0 ? this.year - 1 : this.year
    const daysInPrevMonth = this.getDaysInMonth(prevYear, prevMonth)

    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i
      days.push({
        year: prevYear,
        month: prevMonth,
        day,
        dateStr: this.formatDateISO(prevYear, prevMonth, day),
        isCurrentMonth: false,
        isToday: this.isToday(prevYear, prevMonth, day)
      })
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({
        year: this.year,
        month: this.month,
        day,
        dateStr: this.formatDateISO(this.year, this.month, day),
        isCurrentMonth: true,
        isToday: this.isToday(this.year, this.month, day)
      })
    }

    // Next month days to fill remaining cells (up to 42 total = 6 rows)
    const nextMonth = this.month === 11 ? 0 : this.month + 1
    const nextYear = this.month === 11 ? this.year + 1 : this.year
    const remainingCells = 42 - days.length

    for (let day = 1; day <= remainingCells; day++) {
      days.push({
        year: nextYear,
        month: nextMonth,
        day,
        dateStr: this.formatDateISO(nextYear, nextMonth, day),
        isCurrentMonth: false,
        isToday: this.isToday(nextYear, nextMonth, day)
      })
    }

    return days
  }

  /**
   * Render the month view
   */
  render() {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const gridDays = this.generateCalendarGrid()

    this.container.innerHTML = `
      <div class="month-view">
        <div class="month-weekdays">
          ${dayNames.map(name => `<div class="month-weekday">${name}</div>`).join('')}
        </div>
        <div class="month-grid">
          ${gridDays.map(dayData => this.renderDayCell(dayData)).join('')}
        </div>
      </div>
    `

    this.bindEvents()
  }

  /**
   * Render a single day cell
   * @param {Object} dayData - Day data object
   * @returns {string} HTML string
   */
  renderDayCell(dayData) {
    const activity = this.activityData[dayData.dateStr] || { hasActivity: false }

    let classes = 'month-day'
    if (!dayData.isCurrentMonth) classes += ' month-day-other'
    if (dayData.isToday) classes += ' month-day-today'
    if (activity.hasActivity) classes += ' month-day-has-activity'

    return `
      <div class="${classes}" data-date="${dayData.dateStr}">
        <span class="month-day-number">${dayData.day}</span>
        <div class="month-day-indicators">
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
    const dayCells = this.container.querySelectorAll('.month-day')
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
   * Set the displayed month
   * @param {number} year - Year
   * @param {number} month - Month (0-11)
   */
  setMonth(year, month) {
    this.year = year
    this.month = month
    this.render()
  }

  /**
   * Navigate to previous month
   */
  previousMonth() {
    if (this.month === 0) {
      this.setMonth(this.year - 1, 11)
    } else {
      this.setMonth(this.year, this.month - 1)
    }
  }

  /**
   * Navigate to next month
   */
  nextMonth() {
    if (this.month === 11) {
      this.setMonth(this.year + 1, 0)
    } else {
      this.setMonth(this.year, this.month + 1)
    }
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
   * Get the current month's date range
   * @returns {Object} Start and end dates
   */
  getDateRange() {
    return {
      start: new Date(this.year, this.month, 1),
      end: new Date(this.year, this.month + 1, 0)
    }
  }

  /**
   * Get month title for display
   * @returns {string} Month title (e.g., "January 2025")
   */
  getTitle() {
    const monthName = new Date(this.year, this.month, 1)
      .toLocaleString('default', { month: 'long' })
    return `${monthName} ${this.year}`
  }

  /**
   * Destroy the component
   */
  destroy() {
    this.container.innerHTML = ''
  }
}

// Export for use by plugin system
export { MonthView }
