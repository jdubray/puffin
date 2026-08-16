/**
 * Markdown rendering for assistant replies.
 *
 * Lifted out of response-viewer so the Prompt and Sekkei panes render the same
 * text the same way — two copies of a parser is the drift we keep paying down.
 * Covers what a reply actually uses: headings, bold/italic, code, lists, links,
 * tables.
 *
 * Everything is escaped before any markup is applied: replies are model output,
 * so raw HTML in them is never trusted. The output is inserted with innerHTML
 * in a renderer that holds the preload bridge, so the rule is that no HTML
 * reaches the DOM which this file did not construct itself.
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
 * URL schemes a link in a reply may use.
 *
 * Everything else — `javascript:`, `data:`, `vbscript:`, `file:` — is refused.
 * This pane runs in the renderer, which holds the `window.puffin` preload
 * bridge, so a clickable `javascript:` URL is code execution with IPC access,
 * and replies are model output: a poisoned document or sekkei node the session
 * read is enough to get one emitted. Relative and fragment links are fine.
 * @private
 */
const SAFE_URL_RE = /^(?:https?:\/\/|mailto:|#|\/|\.{1,2}\/)/i

/**
 * Whether a link target is safe to make clickable.
 *
 * The value arrives HTML-escaped, and entities are decoded before the scheme
 * is inspected so `java&#115;cript:` can't slip past. Control characters are
 * stripped for the same reason — browsers ignore them inside a scheme.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isSafeUrl(url) {
  if (!url) return false
  const decoded = String(url)
    .replace(/&amp;/gi, '&')
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)))
    // Control characters and whitespace: browsers ignore them inside a scheme
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0020]/g, '')
  return SAFE_URL_RE.test(decoded)
}

/**
 * Render markdown to HTML.
 *
 * Output goes to innerHTML in the renderer, which holds the window.puffin
 * preload bridge, and the input is model output. So safety here is structural,
 * not filtered: simpleMarkdown escapes the entire reply before it applies any
 * markup, and link targets are scheme-checked. There is no HTML in the output
 * that this file did not put there.
 *
 * There is deliberately no marked.js branch. marked does not sanitize, so its
 * output would reach innerHTML unfiltered; the regex scrubber that briefly
 * guarded it was bypassable and offered false assurance. To use marked (or any
 * parser that passes raw HTML through), add DOMPurify as a real dependency and
 * sanitize here — do not reintroduce a hand-rolled filter.
 *
 * @param {string} content - Raw markdown (assistant output)
 * @returns {string} HTML
 */
export function renderMarkdown(content) {
  if (!content) return ''
  return addLineBreaksAfterEmojis(simpleMarkdown(content))
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

  // Lists. Items are wrapped as a RUN, not one at a time: wrapping each item
  // separately turned a three-item list into three <ul>s, which renders with a
  // gap between every bullet.
  html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
  html = html.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, run => `<ul>${run.replace(/\n/g, '')}</ul>`)

  // Numbered lists, converted after the bullets are safely inside their <ul>
  // so the run matcher above cannot claim them. They used to become <li> and
  // were never wrapped at all — bare items with no list around them.
  html = html.replace(/^\s*\d+\.\s+(.*)$/gm, '<oli>$1</oli>')
  html = html.replace(/(?:<oli>[\s\S]*?<\/oli>\n?)+/g, run =>
    `<ol>${run.replace(/\n/g, '').replace(/<oli>/g, '<li>').replace(/<\/oli>/g, '</li>')}</ol>`)

  // Links — only schemes on the allowlist become clickable. A refused target
  // still shows its URL as text, so nothing is silently swallowed.
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) =>
    isSafeUrl(url)
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : `${label} (${url})`)

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>')
  html = `<p>${html}</p>`

  // Clean up empty and mis-wrapped paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '')
  html = html.replace(/<p>(<h[1-6]>)/g, '$1')
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1')
  html = html.replace(/<p>(<pre>)/g, '$1')
  html = html.replace(/(<\/pre>)<\/p>/g, '$1')
  html = html.replace(/<p>(<[uo]l>)/g, '$1')
  html = html.replace(/(<\/[uo]l>)<\/p>/g, '$1')
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
