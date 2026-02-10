/**
 * Markdown Exporter Utility
 * Generates GitHub-flavored markdown tables from stats data
 */

const {
  formatCost,
  formatDuration,
  formatWeekShort,
  formatNumber,
  formatTokens,
  formatPercentChange,
  formatComponentName,
  renderSparkline,
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

/**
 * Generate a complete metrics report in Markdown from aggregated metrics data.
 *
 * @param {Object} data - Metrics data object
 * @param {Object} [data.summary] - Output from getMetricsSummary()
 * @param {Object} [data.componentBreakdown] - Output from getComponentBreakdown()
 * @param {Array}  [data.dailyTrends] - Output from getDailyTrends().days
 * @param {Array}  [data.weeklyNormalized] - Output from getWeeklyNormalized().weeks
 * @param {Object} [options]
 * @param {string} [options.title] - Report title
 * @returns {string} Markdown content
 */
function generateMetricsReport(data = {}, options = {}) {
  const { title = 'Metrics Report' } = options
  const lines = []
  let hasSections = false

  lines.push(`# ${escapeMarkdown(title)}`)
  lines.push('')
  lines.push(`*Generated on ${new Date().toISOString().split('T')[0]}*`)
  lines.push('')

  // ── Summary section ──────────────────────────────────────────
  const summary = data.summary
  if (summary && summary.current) {
    hasSections = true
    lines.push('## Summary')
    lines.push('')
    lines.push(`**Period**: ${summary.periodDays || 30} days`)
    lines.push('')

    const cur = summary.current
    const cmp = summary.comparison || {}
    const ps = summary.perStory || {}

    const fmtOps = formatPercentChange(cmp.operations)
    const fmtTokens = formatPercentChange(cmp.totalTokens)
    const fmtCost = formatPercentChange(cmp.totalCost)

    lines.push(`| Metric | Current | vs Previous |`)
    lines.push(`|--------|--------:|------------:|`)
    lines.push(`| Operations | ${formatNumber(cur.operations)} | ${escapeMarkdown(fmtOps.text)} |`)
    lines.push(`| Tokens | ${formatTokens(cur.totalTokens)} | ${escapeMarkdown(fmtTokens.text)} |`)
    lines.push(`| Cost | ${formatCost(cur.totalCost)} | ${escapeMarkdown(fmtCost.text)} |`)
    lines.push(`| Avg Duration | ${formatDuration(cur.avgDuration)} | ${escapeMarkdown(fmtCost.text)} |`)
    lines.push('')

    if (ps.storyCount != null) {
      lines.push(`### Per-Story Normalization (${ps.storyCount} stories)`)
      lines.push('')
      lines.push(`- Tokens/story: ${formatTokens(ps.avgTokensPerStory)}`)
      lines.push(`- Cost/story: ${formatCost(ps.avgCostPerStory)}`)
      lines.push(`- Duration/story: ${formatDuration(ps.avgDurationPerStory)}`)
      lines.push('')
    }
  }

  // ── Component breakdown ──────────────────────────────────────
  const breakdown = data.componentBreakdown
  if (breakdown && breakdown.components && breakdown.components.length > 0) {
    hasSections = true
    lines.push('## Component Breakdown')
    lines.push('')
    lines.push('| Component | Ops | Tokens | Cost | % Cost |')
    lines.push('|-----------|----:|-------:|-----:|-------:|')
    for (const c of breakdown.components) {
      lines.push(
        `| ${escapeMarkdown(formatComponentName(c.component))} | ${c.operations} | ${formatTokens(c.totalTokens)} | ${formatCost(c.totalCost)} | ${c.pctOfCost}% |`
      )
    }
    lines.push('')
  }

  // ── Daily trends ─────────────────────────────────────────────
  const dailyTrends = data.dailyTrends
  if (Array.isArray(dailyTrends) && dailyTrends.length > 0) {
    hasSections = true
    const opsValues = dailyTrends.map(d => d.operations || 0)
    const costValues = dailyTrends.map(d => d.totalCost || 0)

    lines.push('## Daily Trends')
    lines.push('')
    lines.push(`Operations: ${renderSparkline(opsValues)}`)
    lines.push(`Cost:       ${renderSparkline(costValues)}`)
    lines.push('')
    lines.push('| Date | Ops | Tokens | Cost |')
    lines.push('|------|----:|-------:|-----:|')
    for (const d of dailyTrends) {
      if (d.operations === 0) continue // skip empty days for brevity
      lines.push(`| ${d.date} | ${d.operations} | ${formatTokens(d.totalTokens)} | ${formatCost(d.totalCost)} |`)
    }
    lines.push('')
  }

  // ── Weekly normalized ────────────────────────────────────────
  const weeklyNormalized = data.weeklyNormalized
  if (Array.isArray(weeklyNormalized) && weeklyNormalized.length > 0) {
    hasSections = true
    lines.push('## Weekly Normalized')
    lines.push('')
    lines.push('| Week | Stories | Cost/Story | Tokens/Story | Dur/Op |')
    lines.push('|------|--------:|-----------:|-------------:|-------:|')
    for (const w of weeklyNormalized) {
      lines.push(
        `| ${escapeMarkdown(w.week)} | ${w.storyCount} | ${formatCost(w.costPerStory)} | ${formatTokens(w.tokensPerStory)} | ${formatDuration(w.durationPerOp)} |`
      )
    }
    lines.push('')
  }

  if (!hasSections) {
    lines.push('No metrics data available.')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Convert an array of objects to CSV format.
 *
 * @param {Array<Object>} rows - Data rows
 * @param {Object} [options]
 * @param {Array<string>} [options.columns] - Column names to include (default: all keys from first row)
 * @param {string} [options.delimiter=','] - Field delimiter
 * @returns {string} CSV string
 */
function generateCSV(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return ''
  }

  const delimiter = options.delimiter || ','
  const columns = options.columns || Object.keys(rows[0])

  const escapeCSVField = (value) => {
    if (value == null) return ''
    const str = String(value)
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const headerLine = columns.map(escapeCSVField).join(delimiter)
  const dataLines = rows.map(row =>
    columns.map(col => escapeCSVField(row[col])).join(delimiter)
  )

  return [headerLine, ...dataLines].join('\n')
}

module.exports = {
  generateMarkdown,
  generateMetricsReport,
  generateCSV,
  generateDefaultFilename,
  escapeMarkdown,
  computeTotals
}
