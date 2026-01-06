/**
 * Date Utilities Service
 *
 * Helper functions for date calculations and formatting
 * used by the calendar plugin.
 */

/**
 * Get the number of days in a month
 * @param {number} year - The year
 * @param {number} month - The month (0-11)
 * @returns {number} Number of days in the month
 */
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * Get the day of week for the first day of a month
 * @param {number} year - The year
 * @param {number} month - The month (0-11)
 * @returns {number} Day of week (0-6, Sunday=0)
 */
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

/**
 * Format a date as ISO string (YYYY-MM-DD)
 * @param {Date} date - Date object
 * @returns {string} ISO date string
 */
function formatDateISO(date) {
  return date.toISOString().split('T')[0]
}

/**
 * Format a date for display
 * @param {Date} date - Date object
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
function formatDate(date, options = {}) {
  const defaultOptions = { year: 'numeric', month: 'long', day: 'numeric' }
  return date.toLocaleDateString('default', { ...defaultOptions, ...options })
}

/**
 * Get month name
 * @param {number} month - Month index (0-11)
 * @param {string} format - 'long' or 'short'
 * @returns {string} Month name
 */
function getMonthName(month, format = 'long') {
  const date = new Date(2000, month, 1)
  return date.toLocaleString('default', { month: format })
}

/**
 * Get day name
 * @param {number} day - Day of week (0-6)
 * @param {string} format - 'long', 'short', or 'narrow'
 * @returns {string} Day name
 */
function getDayName(day, format = 'short') {
  const date = new Date(2000, 0, 2 + day) // Jan 2, 2000 was a Sunday
  return date.toLocaleString('default', { weekday: format })
}

/**
 * Check if a date is today
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is today
 */
function isToday(date) {
  const today = new Date()
  const checkDate = typeof date === 'string' ? new Date(date) : date
  return (
    checkDate.getFullYear() === today.getFullYear() &&
    checkDate.getMonth() === today.getMonth() &&
    checkDate.getDate() === today.getDate()
  )
}

/**
 * Check if a date is a weekend
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is Saturday or Sunday
 */
function isWeekend(date) {
  const checkDate = typeof date === 'string' ? new Date(date) : date
  const day = checkDate.getDay()
  return day === 0 || day === 6
}

/**
 * Get the start of a day (midnight)
 * @param {Date} date - Date object
 * @returns {Date} Date at midnight
 */
function startOfDay(date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

/**
 * Get the end of a day (23:59:59.999)
 * @param {Date} date - Date object
 * @returns {Date} Date at end of day
 */
function endOfDay(date) {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

/**
 * Add days to a date
 * @param {Date} date - Starting date
 * @param {number} days - Number of days to add
 * @returns {Date} New date
 */
function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Add months to a date
 * @param {Date} date - Starting date
 * @param {number} months - Number of months to add
 * @returns {Date} New date
 */
function addMonths(date, months) {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

/**
 * Get date range for a month
 * @param {number} year - The year
 * @param {number} month - The month (0-11)
 * @returns {Object} Object with start and end dates
 */
function getMonthDateRange(year, month) {
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0)
  }
}

/**
 * Parse a date string safely
 * @param {string} dateString - Date string to parse
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseDate(dateString) {
  if (!dateString) return null
  const date = new Date(dateString)
  return isNaN(date.getTime()) ? null : date
}

/**
 * Check if two dates are the same day
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {boolean} True if same day
 */
function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

/**
 * Get week number of the year
 * @param {Date} date - Date to check
 * @returns {number} Week number (1-53)
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

/**
 * Get the start of the week (Sunday) for a given date
 * @param {Date} date - Reference date
 * @returns {Date} Sunday of that week at midnight
 */
function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Get the end of the week (Saturday) for a given date
 * @param {Date} date - Reference date
 * @returns {Date} Saturday of that week at end of day
 */
function getWeekEnd(date) {
  const d = getWeekStart(date)
  d.setDate(d.getDate() + 6)
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * Get array of dates for a week containing the given date
 * @param {Date} date - Reference date
 * @returns {Date[]} Array of 7 dates (Sunday to Saturday)
 */
function getWeekDates(date) {
  const start = getWeekStart(date)
  const dates = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    dates.push(d)
  }
  return dates
}

/**
 * Get localized day names
 * @param {string} format - 'long', 'short', or 'narrow'
 * @param {string} locale - Locale string (default: user's locale)
 * @returns {string[]} Array of day names starting with Sunday
 */
function getLocalizedDayNames(format = 'short', locale = 'default') {
  const names = []
  // Jan 2, 2000 was a Sunday
  for (let i = 0; i < 7; i++) {
    const date = new Date(2000, 0, 2 + i)
    names.push(date.toLocaleString(locale, { weekday: format }))
  }
  return names
}

/**
 * Get localized month names
 * @param {string} format - 'long', 'short', or 'narrow'
 * @param {string} locale - Locale string (default: user's locale)
 * @returns {string[]} Array of month names (Jan-Dec)
 */
function getLocalizedMonthNames(format = 'long', locale = 'default') {
  const names = []
  for (let i = 0; i < 12; i++) {
    const date = new Date(2000, i, 1)
    names.push(date.toLocaleString(locale, { month: format }))
  }
  return names
}

/**
 * Format a week range for display
 * @param {Date} weekStart - Start of the week
 * @param {string} locale - Locale string (default: user's locale)
 * @returns {string} Formatted range (e.g., "Jan 5 - 11, 2025")
 */
function formatWeekRange(weekStart, locale = 'default') {
  const start = new Date(weekStart)
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)

  const startMonth = start.toLocaleString(locale, { month: 'short' })
  const endMonth = end.toLocaleString(locale, { month: 'short' })
  const startDay = start.getDate()
  const endDay = end.getDate()
  const year = end.getFullYear()

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`
}

/**
 * Format a month for display
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @param {string} locale - Locale string (default: user's locale)
 * @returns {string} Formatted month (e.g., "January 2025")
 */
function formatMonthYear(year, month, locale = 'default') {
  const date = new Date(year, month, 1)
  return date.toLocaleString(locale, { month: 'long', year: 'numeric' })
}

module.exports = {
  getDaysInMonth,
  getFirstDayOfMonth,
  formatDateISO,
  formatDate,
  getMonthName,
  getDayName,
  isToday,
  isWeekend,
  startOfDay,
  endOfDay,
  addDays,
  addMonths,
  getMonthDateRange,
  parseDate,
  isSameDay,
  getWeekNumber,
  getWeekStart,
  getWeekEnd,
  getWeekDates,
  getLocalizedDayNames,
  getLocalizedMonthNames,
  formatWeekRange,
  formatMonthYear
}
