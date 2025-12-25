/**
 * Shared formatting utilities for the Stats Plugin
 */

/**
 * Format a cost value as currency
 * @param {number} cost - Cost in dollars
 * @returns {string} Formatted cost string
 */
function formatCost(cost) {
  if (typeof cost !== 'number' || isNaN(cost)) {
    return '$0.00'
  }
  return `$${cost.toFixed(2)}`
}

/**
 * Format duration from milliseconds to human-readable format
 * @param {number} durationMs - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "1h 30m" or "45m 30s")
 */
function formatDuration(durationMs) {
  if (typeof durationMs !== 'number' || isNaN(durationMs) || durationMs < 0) {
    return '0m'
  }

  const totalSeconds = Math.floor(durationMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }

  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  }

  return `${seconds}s`
}

/**
 * Format duration for table display (compact format)
 * @param {number} durationMs - Duration in milliseconds
 * @returns {string} Compact formatted duration
 */
function formatDurationCompact(durationMs) {
  if (typeof durationMs !== 'number' || isNaN(durationMs) || durationMs < 0) {
    return '0:00'
  }

  const totalSeconds = Math.floor(durationMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}`
  }

  return `0:${String(minutes).padStart(2, '0')}`
}

/**
 * Format a week label from ISO week string
 * @param {string} weekString - ISO week string (e.g., "2025-W52")
 * @returns {string} Formatted week label
 */
function formatWeekLabel(weekString) {
  if (!weekString || typeof weekString !== 'string') {
    return 'Unknown'
  }

  const match = weekString.match(/^(\d{4})-W(\d{2})$/)
  if (!match) {
    return weekString
  }

  const [, year, week] = match
  return `W${parseInt(week, 10)}, ${year}`
}

/**
 * Format a week label in short form
 * @param {string} weekString - ISO week string (e.g., "2025-W52")
 * @returns {string} Short week label (e.g., "W52")
 */
function formatWeekShort(weekString) {
  if (!weekString || typeof weekString !== 'string') {
    return '—'
  }

  const match = weekString.match(/^(\d{4})-W(\d{2})$/)
  if (!match) {
    return weekString
  }

  return `W${parseInt(match[2], 10)}`
}

/**
 * Format a number with thousands separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
  if (typeof num !== 'number' || isNaN(num)) {
    return '0'
  }
  return num.toLocaleString()
}

/**
 * Get the date range description for a set of weekly stats
 * @param {Array} weeklyStats - Array of weekly stat objects with 'week' property
 * @returns {string} Date range description
 */
function getDateRangeDescription(weeklyStats) {
  if (!Array.isArray(weeklyStats) || weeklyStats.length === 0) {
    return 'No data'
  }

  const firstWeek = weeklyStats[0]?.week
  const lastWeek = weeklyStats[weeklyStats.length - 1]?.week

  if (!firstWeek || !lastWeek) {
    return 'Unknown range'
  }

  const firstLabel = formatWeekLabel(firstWeek)
  const lastLabel = formatWeekLabel(lastWeek)

  return `${firstLabel} - ${lastLabel} (${weeklyStats.length} weeks)`
}

module.exports = {
  formatCost,
  formatDuration,
  formatDurationCompact,
  formatWeekLabel,
  formatWeekShort,
  formatNumber,
  getDateRangeDescription
}
