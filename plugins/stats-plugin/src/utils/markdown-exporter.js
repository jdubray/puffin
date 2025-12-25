/**
 * Markdown Exporter Utility
 * Generates GitHub-flavored markdown tables from stats data
 */

const {
  formatCost,
  formatDuration,
  formatWeekShort,
  formatNumber,
  getDateRangeDescription
} = require('./formatters')

/**
 * Escape special markdown characters in cell content
 * @param {string} text - Cell text to escape
 * @returns {string} Escaped text
 */
function escapeMarkdown(text) {
  if (typeof text !== 'string') {
    return String(text)
  }
  // Escape pipe characters and newlines
  return text
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
}

/**
 * Compute totals from weekly stats
 * @param {Array} weeklyStats - Array of weekly stat objects
 * @returns {Object} Totals object
 */
function computeTotals(weeklyStats) {
  if (!Array.isArray(weeklyStats) || weeklyStats.length === 0) {
    return { turns: 0, cost: 0, duration: 0 }
  }

  return weeklyStats.reduce(
    (totals, week) => ({
      turns: totals.turns + (week.turns || 0),
      cost: totals.cost + (week.cost || 0),
      duration: totals.duration + (week.duration || 0)
    }),
    { turns: 0, cost: 0, duration: 0 }
  )
}

/**
 * Generate markdown content from stats data
 * @param {Array} weeklyStats - Array of weekly stat objects
 * @param {Object} options - Export options
 * @param {string} options.title - Report title
 * @param {boolean} options.includeTotals - Whether to include totals row
 * @returns {string} Markdown content
 */
function generateMarkdown(weeklyStats, options = {}) {
  const {
    title = 'Stats Report',
    includeTotals = true
  } = options

  if (!Array.isArray(weeklyStats) || weeklyStats.length === 0) {
    return `# ${title}\n\nNo data available.\n`
  }

  const lines = []

  // Title
  lines.push(`# ${escapeMarkdown(title)}`)
  lines.push('')

  // Date range
  const dateRange = getDateRangeDescription(weeklyStats)
  lines.push(`**Period**: ${escapeMarkdown(dateRange)}`)
  lines.push('')

  // Generated timestamp
  const generatedAt = new Date().toISOString().split('T')[0]
  lines.push(`*Generated on ${generatedAt}*`)
  lines.push('')

  // Table header
  lines.push('| Week | Turns | Cost | Duration |')
  lines.push('|------|------:|-----:|---------:|')

  // Data rows
  for (const week of weeklyStats) {
    const weekLabel = escapeMarkdown(formatWeekShort(week.week))
    const turns = escapeMarkdown(formatNumber(week.turns))
    const cost = escapeMarkdown(formatCost(week.cost))
    const duration = escapeMarkdown(formatDuration(week.duration))

    lines.push(`| ${weekLabel} | ${turns} | ${cost} | ${duration} |`)
  }

  // Totals row
  if (includeTotals) {
    const totals = computeTotals(weeklyStats)
    const totalTurns = escapeMarkdown(formatNumber(totals.turns))
    const totalCost = escapeMarkdown(formatCost(totals.cost))
    const totalDuration = escapeMarkdown(formatDuration(totals.duration))

    lines.push(`| **Total** | **${totalTurns}** | **${totalCost}** | **${totalDuration}** |`)
  }

  lines.push('')

  return lines.join('\n')
}

/**
 * Generate a default filename for the export
 * @returns {string} Suggested filename
 */
function generateDefaultFilename() {
  const date = new Date().toISOString().split('T')[0]
  return `stats-report-${date}.md`
}

module.exports = {
  generateMarkdown,
  generateDefaultFilename,
  escapeMarkdown,
  computeTotals
}
