/**
 * RLM Document Plugin - Export Formats
 *
 * Provides export functionality for session results.
 * Supports JSON and Markdown formats.
 */

const { EXPORT } = require('./config')

/**
 * Export session data to JSON format
 * @param {Object} session - Session metadata
 * @param {Array} results - Query results array
 * @param {Object} options - Export options
 * @returns {Object} Export result with content
 */
function exportJson(session, results, options = {}) {
  const { pretty = true, includeContent = false } = options

  const exportData = {
    exportedAt: new Date().toISOString(),
    format: 'json',
    version: '1.0',
    session: {
      id: session.id,
      documentPath: session.documentPath,
      relativePath: session.relativePath,
      fileSize: session.fileSize,
      createdAt: session.createdAt,
      lastAccessedAt: session.lastAccessedAt,
      state: session.state,
      config: session.config,
      stats: session.stats
    },
    results: results.map(result => ({
      id: result.id,
      query: result.query,
      strategy: result.strategy,
      timestamp: result.timestamp,
      evidence: result.evidence?.map(ev => ({
        chunkIndex: ev.chunkIndex,
        chunkId: ev.chunkId,
        point: ev.point,
        excerpt: includeContent ? ev.excerpt : truncate(ev.excerpt, 200),
        confidence: ev.confidence,
        lineRange: ev.lineRange
      })) || [],
      synthesis: result.synthesis,
      tokensUsed: result.tokensUsed,
      chunksAnalyzed: result.chunksAnalyzed,
      status: result.status
    })),
    summary: {
      totalQueries: results.length,
      totalEvidence: results.reduce((sum, r) => sum + (r.evidence?.length || 0), 0),
      totalTokens: results.reduce((sum, r) => sum + (r.tokensUsed || 0), 0)
    }
  }

  const content = pretty
    ? JSON.stringify(exportData, null, 2)
    : JSON.stringify(exportData)

  return {
    content,
    mimeType: 'application/json',
    filename: `rlm-export-${session.id}.json`
  }
}

/**
 * Export session data to Markdown format
 * @param {Object} session - Session metadata
 * @param {Array} results - Query results array
 * @param {Object} options - Export options
 * @returns {Object} Export result with content
 */
function exportMarkdown(session, results, options = {}) {
  const { includeMetadata = true, maxExcerptLength = 500 } = options

  const lines = []

  // Title
  lines.push(`# RLM Session Export`)
  lines.push('')

  // Session info
  if (includeMetadata) {
    lines.push(`## Session Information`)
    lines.push('')
    lines.push(`| Property | Value |`)
    lines.push(`|----------|-------|`)
    lines.push(`| **Session ID** | \`${session.id}\` |`)
    lines.push(`| **Document** | ${session.relativePath || session.documentPath} |`)
    lines.push(`| **File Size** | ${formatBytes(session.fileSize)} |`)
    lines.push(`| **Created** | ${formatDate(session.createdAt)} |`)
    lines.push(`| **Last Accessed** | ${formatDate(session.lastAccessedAt)} |`)
    lines.push(`| **State** | ${session.state} |`)
    lines.push(`| **Chunk Size** | ${session.config?.chunkSize || 'default'} |`)
    lines.push(`| **Total Chunks** | ${session.stats?.totalChunks || 'N/A'} |`)
    lines.push(`| **Queries Run** | ${session.stats?.queriesRun || results.length} |`)
    lines.push('')
  }

  // Summary
  lines.push(`## Summary`)
  lines.push('')
  lines.push(`- **Total Queries:** ${results.length}`)
  lines.push(`- **Total Evidence Found:** ${results.reduce((sum, r) => sum + (r.evidence?.length || 0), 0)}`)
  lines.push(`- **Total Tokens Used:** ${results.reduce((sum, r) => sum + (r.tokensUsed || 0), 0)}`)
  lines.push('')

  // Results
  if (results.length > 0) {
    lines.push(`## Query Results`)
    lines.push('')

    results.forEach((result, index) => {
      lines.push(`### Query ${index + 1}: ${escapeMarkdown(result.query)}`)
      lines.push('')
      lines.push(`*Executed: ${formatDate(result.timestamp)}*`)
      lines.push('')

      // Synthesis (answer)
      if (result.synthesis) {
        lines.push(`#### Answer`)
        lines.push('')
        lines.push(result.synthesis)
        lines.push('')
      }

      // Evidence
      if (result.evidence && result.evidence.length > 0) {
        lines.push(`#### Evidence (${result.evidence.length} items)`)
        lines.push('')

        result.evidence.forEach((ev, evIndex) => {
          const confidence = ev.confidence ? ` [${ev.confidence}]` : ''
          const lineInfo = ev.lineRange ? ` (lines ${ev.lineRange[0]}-${ev.lineRange[1]})` : ''

          lines.push(`**${evIndex + 1}. Chunk ${ev.chunkIndex}${confidence}${lineInfo}**`)
          lines.push('')

          if (ev.point) {
            lines.push(`> ${ev.point}`)
            lines.push('')
          }

          if (ev.excerpt) {
            const excerpt = truncate(ev.excerpt, maxExcerptLength)
            lines.push('```')
            lines.push(excerpt)
            lines.push('```')
            lines.push('')
          }
        })
      } else {
        lines.push(`*No evidence collected for this query.*`)
        lines.push('')
      }

      // Metrics
      if (result.tokensUsed || result.chunksAnalyzed) {
        lines.push(`> Metrics: ${result.chunksAnalyzed || 0} chunks analyzed, ${result.tokensUsed || 0} tokens used`)
        lines.push('')
      }

      lines.push('---')
      lines.push('')
    })
  } else {
    lines.push(`*No queries have been executed in this session.*`)
    lines.push('')
  }

  // Footer
  lines.push('')
  lines.push(`---`)
  lines.push(`*Exported from Puffin RLM Document Analyzer on ${formatDate(new Date().toISOString())}*`)

  const content = lines.join('\n')

  return {
    content,
    mimeType: 'text/markdown',
    filename: `rlm-export-${session.id}.md`
  }
}

/**
 * Export session data in the specified format
 * @param {Object} session - Session metadata
 * @param {Array} results - Query results array
 * @param {string} format - Export format ('json' or 'markdown')
 * @param {Object} options - Format-specific options
 * @returns {Object} Export result
 */
function exportSession(session, results, format, options = {}) {
  const normalizedFormat = (format || EXPORT.DEFAULT_FORMAT).toLowerCase().trim()

  switch (normalizedFormat) {
    case 'json':
      return exportJson(session, results, options)

    case 'markdown':
    case 'md':
      return exportMarkdown(session, results, options)

    default:
      throw new Error(`Unsupported export format: ${format}. Supported: ${EXPORT.FORMATS.join(', ')}`)
  }
}

/**
 * Get available export formats
 * @returns {Array} Array of format descriptors
 */
function getExportFormats() {
  return [
    {
      id: 'json',
      name: 'JSON',
      extension: '.json',
      mimeType: 'application/json',
      description: 'Full structured data export'
    },
    {
      id: 'markdown',
      name: 'Markdown',
      extension: '.md',
      mimeType: 'text/markdown',
      description: 'Human-readable document export'
    }
  ]
}

// ==================== Helper Functions ====================

/**
 * Truncate a string to specified length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated string
 */
function truncate(str, maxLength) {
  if (!str || str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Format ISO date to readable string
 * @param {string} isoDate - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(isoDate) {
  if (!isoDate) return 'N/A'
  try {
    const date = new Date(isoDate)
    return date.toLocaleString()
  } catch {
    return isoDate
  }
}

/**
 * Escape special Markdown characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeMarkdown(text) {
  if (!text) return ''
  // Escape markdown special characters that could break formatting
  return text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\n/g, ' ')
}

module.exports = {
  exportJson,
  exportMarkdown,
  exportSession,
  getExportFormats,
  truncate,
  formatBytes,
  formatDate,
  escapeMarkdown
}
