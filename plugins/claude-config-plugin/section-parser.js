/**
 * Section Parser for CLAUDE.md files
 *
 * Parses markdown content into sections based on headings.
 * Supports section-level operations while preserving formatting.
 */

/**
 * Standard sections commonly found in CLAUDE.md files
 */
const STANDARD_SECTIONS = [
  'Project Context',
  'Project Overview',
  'File Access Restrictions',
  'Coding Preferences',
  'Completed User Stories',
  'Branch Focus'
]

/**
 * Parse markdown content into sections
 * @param {string} content - Markdown content
 * @returns {Array<{name: string, level: number, startLine: number, endLine: number, content: string}>}
 */
function parseSections(content) {
  if (!content) return []

  const lines = content.split('\n')
  const sections = []
  let currentSection = null

  // Regex for markdown headings (## or ###)
  const headingRegex = /^(#{1,6})\s+(.+)$/

  lines.forEach((line, index) => {
    const match = line.match(headingRegex)

    if (match) {
      // Close previous section
      if (currentSection) {
        currentSection.endLine = index - 1
        currentSection.content = lines.slice(currentSection.startLine, index).join('\n')
        sections.push(currentSection)
      }

      // Start new section
      currentSection = {
        name: match[2].trim(),
        level: match[1].length,
        startLine: index,
        endLine: null,
        content: ''
      }
    }
  })

  // Close final section
  if (currentSection) {
    currentSection.endLine = lines.length - 1
    currentSection.content = lines.slice(currentSection.startLine).join('\n')
    sections.push(currentSection)
  }

  return sections
}

/**
 * Get a specific section by name
 * @param {string} content - Full markdown content
 * @param {string} sectionName - Name of section to find
 * @returns {{name: string, level: number, startLine: number, endLine: number, content: string}|null}
 */
function getSection(content, sectionName) {
  const sections = parseSections(content)
  const normalizedName = sectionName.toLowerCase().trim()

  return sections.find(s => s.name.toLowerCase().trim() === normalizedName) || null
}

/**
 * Update a section's content
 * @param {string} content - Full markdown content
 * @param {string} sectionName - Name of section to update
 * @param {string} newSectionContent - New content for the section (including heading)
 * @returns {{content: string, updated: boolean}}
 */
function updateSection(content, sectionName, newSectionContent) {
  const section = getSection(content, sectionName)

  if (!section) {
    return { content, updated: false }
  }

  const lines = content.split('\n')
  const before = lines.slice(0, section.startLine)
  const after = lines.slice(section.endLine + 1)

  const newContent = [...before, newSectionContent, ...after].join('\n')

  return { content: newContent, updated: true }
}

/**
 * Add a new section after a specified section
 * @param {string} content - Full markdown content
 * @param {string} newSectionName - Name for the new section
 * @param {string} newSectionContent - Content for the new section
 * @param {string} [afterSection] - Insert after this section (or at end if not specified)
 * @param {number} [level=2] - Heading level for new section
 * @returns {{content: string, added: boolean}}
 */
function addSection(content, newSectionName, newSectionContent, afterSection = null, level = 2) {
  const heading = '#'.repeat(level) + ' ' + newSectionName
  const fullSection = `${heading}\n\n${newSectionContent}`

  if (!afterSection) {
    // Add at end
    const newContent = content.trimEnd() + '\n\n---\n\n' + fullSection + '\n'
    return { content: newContent, added: true }
  }

  const section = getSection(content, afterSection)
  if (!section) {
    // Fallback to end
    const newContent = content.trimEnd() + '\n\n---\n\n' + fullSection + '\n'
    return { content: newContent, added: true }
  }

  const lines = content.split('\n')
  const before = lines.slice(0, section.endLine + 1)
  const after = lines.slice(section.endLine + 1)

  const newContent = [...before, '', '---', '', fullSection, ...after].join('\n')
  return { content: newContent, added: true }
}

/**
 * Remove a section from the content
 * @param {string} content - Full markdown content
 * @param {string} sectionName - Name of section to remove
 * @returns {{content: string, removed: boolean}}
 */
function removeSection(content, sectionName) {
  const section = getSection(content, sectionName)

  if (!section) {
    return { content, removed: false }
  }

  const lines = content.split('\n')
  const before = lines.slice(0, section.startLine)
  const after = lines.slice(section.endLine + 1)

  // Remove any leading separator if present
  while (before.length > 0 && (before[before.length - 1].trim() === '---' || before[before.length - 1].trim() === '')) {
    before.pop()
  }

  const newContent = [...before, '', ...after].join('\n')
  return { content: newContent.replace(/\n{3,}/g, '\n\n'), removed: true }
}

/**
 * List all sections with summary info
 * @param {string} content - Full markdown content
 * @returns {Array<{name: string, level: number, lineCount: number, isStandard: boolean}>}
 */
function listSections(content) {
  const sections = parseSections(content)

  return sections.map(s => ({
    name: s.name,
    level: s.level,
    lineCount: s.endLine - s.startLine + 1,
    isStandard: STANDARD_SECTIONS.some(std =>
      std.toLowerCase() === s.name.toLowerCase() ||
      s.name.toLowerCase().includes(std.toLowerCase())
    )
  }))
}

/**
 * Generate a diff between two content versions
 * @param {string} original - Original content
 * @param {string} modified - Modified content
 * @returns {Array<{type: 'add'|'remove'|'unchanged', line: string, lineNum: number}>}
 */
function generateDiff(original, modified) {
  const originalLines = original.split('\n')
  const modifiedLines = modified.split('\n')
  const diff = []

  // Simple line-by-line diff (not optimal but sufficient for review)
  const maxLines = Math.max(originalLines.length, modifiedLines.length)

  let origIdx = 0
  let modIdx = 0

  while (origIdx < originalLines.length || modIdx < modifiedLines.length) {
    const origLine = originalLines[origIdx]
    const modLine = modifiedLines[modIdx]

    if (origLine === modLine) {
      diff.push({ type: 'unchanged', line: origLine, lineNum: modIdx + 1 })
      origIdx++
      modIdx++
    } else if (origLine === undefined) {
      diff.push({ type: 'add', line: modLine, lineNum: modIdx + 1 })
      modIdx++
    } else if (modLine === undefined) {
      diff.push({ type: 'remove', line: origLine, lineNum: origIdx + 1 })
      origIdx++
    } else {
      // Lines differ - show as remove then add
      diff.push({ type: 'remove', line: origLine, lineNum: origIdx + 1 })
      diff.push({ type: 'add', line: modLine, lineNum: modIdx + 1 })
      origIdx++
      modIdx++
    }
  }

  return diff
}

/**
 * Format diff for display
 * @param {Array} diff - Diff array from generateDiff
 * @returns {string} Formatted diff string
 */
function formatDiff(diff) {
  return diff.map(d => {
    const prefix = d.type === 'add' ? '+ ' : d.type === 'remove' ? '- ' : '  '
    return prefix + d.line
  }).join('\n')
}

module.exports = {
  STANDARD_SECTIONS,
  parseSections,
  getSection,
  updateSection,
  addSection,
  removeSection,
  listSections,
  generateDiff,
  formatDiff
}
