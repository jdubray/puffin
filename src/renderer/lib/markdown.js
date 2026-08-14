/**
 * Markdown rendering for assistant replies.
 *
 * Lifted verbatim out of response-viewer so the Prompt and Sekkei panes render
 * the same text the same way — two copies of a parser is the drift we keep
 * paying down. Uses marked.js when the page has loaded it, and falls back to
 * the built-in parser (headings, bold/italic, code, lists, links, tables).
 *
 * Everything is escaped before any markup is applied: replies are model
 * output, so raw HTML in them is never trusted.
 *
 * @module lib/markdown
 */

/** Escape HTML entities. */
export function escapeHtml(str) {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Emoji unicode ranges — emoticons, pictographs, transport, dingbats, flags,
 * and the variation selector / ZWJ that build compound glyphs.
 * @private
 */
const EMOJI_RUN_RE = /([\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{FE0F}\u{200D}]+)(\s*)(?=[A-Z])/gu

/**
 * Break the line after a run of tool markers so prose doesn't run into them.
 * Markdown collapses the single newline the stream put there.
 */
export function addLineBreaksAfterEmojis(html) {
  if (!html) return html
  return html.replace(EMOJI_RUN_RE, (match, emoji) => `${emoji}<br>\n`)
}

/**
 * Render markdown to HTML.
 *
 * @param {string} content - Raw markdown (assistant output)
 * @returns {string} HTML
 */
export function renderMarkdown(content) {
  if (!content) return ''
  const html = (typeof window !== 'undefined' && window.marked)
    ? window.marked.parse(content)
    : simpleMarkdown(content)
  return addLineBreaksAfterEmojis(html)
}

/**
 * The fallback parser: enough markdown for an assistant reply, no dependency.
 *
 * @param {string} text - Raw markdown
 * @returns {string} HTML
 */
export function simpleMarkdown(text) {
  // Escape HTML first — everything below builds on trusted-safe text
  let html = escapeHtml(text)

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) =>
    `<pre><code class="language-${lang}">${code}</code></pre>`)

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Tables
  html = parseMarkdownTables(html)

  // Headers
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>')

  // Bold, then italic (order matters: ** would otherwise match as two *)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')

  // Lists
  html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>)\n(?=<li>)/g, '$1')
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')

  // Numbered lists
  html = html.replace(/^\s*\d+\.\s+(.*)$/gm, '<li>$1</li>')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>')
  html = `<p>${html}</p>`

  // Clean up empty and mis-wrapped paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '')
  html = html.replace(/<p>(<h[1-6]>)/g, '$1')
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1')
  html = html.replace(/<p>(<pre>)/g, '$1')
  html = html.replace(/(<\/pre>)<\/p>/g, '$1')
  html = html.replace(/<p>(<ul>)/g, '$1')
  html = html.replace(/(<\/ul>)<\/p>/g, '$1')
  html = html.replace(/<p>(<div class="table-wrapper">)/g, '$1')
  html = html.replace(/(<\/table><\/div>)<\/p>/g, '$1')

  return html
}

/**
 * Turn pipe-delimited blocks into HTML tables. Runs of 2+ table-shaped lines
 * become a table; anything shorter is passed through untouched.
 *
 * @param {string} text - Escaped text
 * @returns {string}
 */
export function parseMarkdownTables(text) {
  const lines = text.split('\n')
  const result = []
  let inTable = false
  let tableRows = []

  const flush = () => {
    if (inTable && tableRows.length >= 2) result.push(renderTable(tableRows))
    else if (inTable) result.push(...tableRows)
    inTable = false
    tableRows = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const isTableRow = line.startsWith('|') && line.endsWith('|')
    const isSeparatorRow = /^\|[\s\-:|\s]+\|$/.test(line)

    if (isTableRow || isSeparatorRow) {
      if (!inTable) { inTable = true; tableRows = [] }
      tableRows.push(line)
    } else {
      flush()
      result.push(lines[i])
    }
  }
  flush()

  return result.join('\n')
}

/**
 * Render collected table rows.
 *
 * @param {string[]} rows - Pipe-delimited lines
 * @returns {string} HTML
 */
export function renderTable(rows) {
  if (rows.length < 2) return rows.join('\n')

  const parseCells = row => row.split('|').slice(1, -1).map(cell => cell.trim())
  const headerCells = parseCells(rows[0])
  const isSeparator = /^[\s\-:|]+$/.test(rows[1].replace(/\|/g, ''))
  const bodyStartIndex = isSeparator ? 2 : 1

  let tableHtml = '<div class="table-wrapper"><table>\n<thead>\n<tr>'
  for (const cell of headerCells) tableHtml += `<th>${cell}</th>`
  tableHtml += '</tr>\n</thead>\n<tbody>\n'

  for (let i = bodyStartIndex; i < rows.length; i++) {
    tableHtml += '<tr>'
    for (const cell of parseCells(rows[i])) tableHtml += `<td>${cell}</td>`
    tableHtml += '</tr>\n'
  }

  tableHtml += '</tbody>\n</table></div>'
  return tableHtml
}
