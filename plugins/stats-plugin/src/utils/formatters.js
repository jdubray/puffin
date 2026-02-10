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
 * Format a token count with abbreviation (e.g. 1500 → "1.5k", 2500000 → "2.5M")
 * @param {number} tokens - Token count
 * @returns {string} Abbreviated token string
 */
function formatTokens(tokens) {
  if (tokens == null || typeof tokens !== 'number' || isNaN(tokens)) {
    return '0'
  }
  if (tokens < 0) {
    return '-' + formatTokens(-tokens)
  }
  if (tokens >= 1000000) {
    const val = tokens / 1000000
    return val % 1 === 0 ? `${val}M` : `${parseFloat(val.toFixed(1))}M`
  }
  if (tokens >= 1000) {
    const val = tokens / 1000
    return val % 1 === 0 ? `${val}k` : `${parseFloat(val.toFixed(1))}k`
  }
  return String(tokens)
}

/**
 * Format a percentage change with +/- prefix and optional color hint.
 * Returns an object with `text` (display string) and `direction` ('up'|'down'|'neutral').
 *
 * @param {number} pct - Percentage change value (e.g. 50 for +50%, -25 for -25%)
 * @returns {{ text: string, direction: string }}
 */
function formatPercentChange(pct) {
  if (pct == null || typeof pct !== 'number' || isNaN(pct)) {
    return { text: '—', direction: 'neutral' }
  }
  if (pct === 0) {
    return { text: '0%', direction: 'neutral' }
  }
  const sign = pct > 0 ? '+' : ''
  const rounded = parseFloat(pct.toFixed(1))
  return {
    text: `${sign}${rounded}%`,
    direction: pct > 0 ? 'up' : 'down'
  }
}

/**
 * Map of internal component identifiers to display-friendly names.
 */
const COMPONENT_DISPLAY_NAMES = {
  'claude-service': 'Claude Service',
  'cre-plan': 'CRE Plan Generator',
  'cre-ris': 'CRE RIS Generator',
  'cre-assertion': 'CRE Assertion Generator',
  'hdsl-engine': 'h-DSL Engine',
  'memory-plugin': 'Memory Plugin',
  'outcomes-plugin': 'Outcomes Plugin',
  'skills-system': 'Skills System'
}

/**
 * Format a component identifier to a display-friendly name.
 * @param {string} componentId - Internal component id (e.g. 'claude-service')
 * @returns {string} Display name
 */
function formatComponentName(componentId) {
  if (!componentId || typeof componentId !== 'string') {
    return 'Unknown'
  }
  return COMPONENT_DISPLAY_NAMES[componentId] || componentId
}

/**
 * Render a unicode sparkline from an array of numeric values.
 * Uses the unicode block characters ▁▂▃▄▅▆▇█ to represent values.
 *
 * @param {Array<number>} values - Data points
 * @param {Object} [options]
 * @param {number} [options.min] - Explicit minimum (default: data min)
 * @param {number} [options.max] - Explicit maximum (default: data max)
 * @returns {string} Unicode sparkline string
 */
function renderSparkline(values, options = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    return ''
  }

  const bars = '▁▂▃▄▅▆▇█'
  const nums = values.map(v => (typeof v === 'number' && !isNaN(v)) ? v : 0)

  const min = options.min != null ? options.min : Math.min(...nums)
  const max = options.max != null ? options.max : Math.max(...nums)
  const range = max - min

  return nums.map(v => {
    if (range === 0) return bars[0]
    const idx = Math.round(((v - min) / range) * (bars.length - 1))
    return bars[Math.min(Math.max(idx, 0), bars.length - 1)]
  }).join('')
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
  formatTokens,
  formatPercentChange,
  formatComponentName,
  renderSparkline,
  COMPONENT_DISPLAY_NAMES,
  getDateRangeDescription
}
