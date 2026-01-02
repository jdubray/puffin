/**
 * Change Proposer for CLAUDE.md
 *
 * Interprets natural language requests and generates proposed changes
 * to CLAUDE.md content. Provides diff preview before applying changes.
 */

const { parseSections, getSection, updateSection, addSection, removeSection, generateDiff } = require('./section-parser')

/**
 * Intent types for CLAUDE.md changes
 */
const ChangeIntent = {
  UPDATE_SECTION: 'update-section',
  ADD_SECTION: 'add-section',
  REMOVE_SECTION: 'remove-section',
  ADD_CONTENT: 'add-content',
  REPLACE_CONTENT: 'replace-content',
  UNKNOWN: 'unknown'
}

/**
 * Keywords that indicate specific intents
 */
const INTENT_KEYWORDS = {
  update: ['update', 'change', 'modify', 'edit', 'set', 'make'],
  add: ['add', 'include', 'insert', 'append', 'create', 'new'],
  remove: ['remove', 'delete', 'clear', 'drop', 'exclude'],
  section: ['section', 'heading', 'part', 'block']
}

/**
 * Common section name mappings for fuzzy matching
 */
const SECTION_ALIASES = {
  'coding preferences': ['coding style', 'code style', 'preferences', 'coding', 'style guide'],
  'project overview': ['overview', 'project', 'about', 'description'],
  'branch focus': ['branch', 'focus', 'current work', 'working on'],
  'file access restrictions': ['file access', 'restrictions', 'access', 'permissions'],
  'completed user stories': ['completed stories', 'done stories', 'finished', 'completed']
}

/**
 * Parse a natural language request to determine intent and target
 * @param {string} prompt - User's natural language request
 * @param {string} content - Current CLAUDE.md content
 * @returns {{intent: string, target: string|null, extractedContent: string|null, confidence: number}}
 */
function parseIntent(prompt, content) {
  const lowerPrompt = prompt.toLowerCase()
  const sections = parseSections(content)
  const sectionNames = sections.map(s => s.name.toLowerCase())

  let intent = ChangeIntent.UNKNOWN
  let target = null
  let extractedContent = null
  let confidence = 0

  // Detect intent from keywords
  if (INTENT_KEYWORDS.remove.some(k => lowerPrompt.includes(k))) {
    intent = ChangeIntent.REMOVE_SECTION
    confidence = 0.7
  } else if (INTENT_KEYWORDS.add.some(k => lowerPrompt.includes(k))) {
    if (INTENT_KEYWORDS.section.some(k => lowerPrompt.includes(k))) {
      intent = ChangeIntent.ADD_SECTION
    } else {
      intent = ChangeIntent.ADD_CONTENT
    }
    confidence = 0.7
  } else if (INTENT_KEYWORDS.update.some(k => lowerPrompt.includes(k))) {
    intent = ChangeIntent.UPDATE_SECTION
    confidence = 0.7
  }

  // Try to find target section
  for (const sectionName of sectionNames) {
    if (lowerPrompt.includes(sectionName.toLowerCase())) {
      target = sectionName
      confidence += 0.2
      break
    }
  }

  // Try aliases if no direct match
  if (!target) {
    for (const [canonical, aliases] of Object.entries(SECTION_ALIASES)) {
      if (aliases.some(alias => lowerPrompt.includes(alias))) {
        // Find actual section that matches
        const match = sections.find(s =>
          s.name.toLowerCase().includes(canonical) ||
          aliases.some(a => s.name.toLowerCase().includes(a))
        )
        if (match) {
          target = match.name
          confidence += 0.1
          break
        }
      }
    }
  }

  // Extract content if quoted
  const quotedMatch = prompt.match(/"([^"]+)"/) || prompt.match(/'([^']+)'/)
  if (quotedMatch) {
    extractedContent = quotedMatch[1]
    confidence += 0.1
  }

  return { intent, target, extractedContent, confidence }
}

/**
 * Generate a proposed change based on the interpreted intent
 * @param {string} prompt - User's natural language request
 * @param {string} currentContent - Current CLAUDE.md content
 * @returns {{
 *   success: boolean,
 *   proposedContent: string|null,
 *   diff: Array|null,
 *   summary: string,
 *   intent: string,
 *   requiresConfirmation: boolean
 * }}
 */
function proposeChange(prompt, currentContent) {
  const { intent, target, extractedContent, confidence } = parseIntent(prompt, currentContent)

  // Low confidence - need more guidance
  if (confidence < 0.5 && intent === ChangeIntent.UNKNOWN) {
    return {
      success: false,
      proposedContent: null,
      diff: null,
      summary: 'Could not understand the request. Please be more specific about what you want to change.',
      intent,
      requiresConfirmation: false,
      suggestions: [
        'Try: "Update the Coding Preferences section to use TypeScript"',
        'Try: "Add a new section called Testing Guidelines"',
        'Try: "Remove the Branch Focus section"'
      ]
    }
  }

  let proposedContent = currentContent
  let summary = ''

  switch (intent) {
    case ChangeIntent.UPDATE_SECTION:
      if (!target) {
        return {
          success: false,
          proposedContent: null,
          diff: null,
          summary: 'Please specify which section you want to update.',
          intent,
          requiresConfirmation: false
        }
      }

      if (!extractedContent) {
        // Return the current section for editing
        const section = getSection(currentContent, target)
        if (section) {
          return {
            success: true,
            proposedContent: null,
            diff: null,
            summary: `Ready to update "${target}" section. Please provide the new content.`,
            intent,
            requiresConfirmation: false,
            currentSectionContent: section.content,
            targetSection: target
          }
        }
      }

      // Generate update proposal
      const updateResult = updateSection(currentContent, target, `## ${target}\n\n${extractedContent}`)
      if (updateResult.updated) {
        proposedContent = updateResult.content
        summary = `Updated "${target}" section with new content.`
      } else {
        return {
          success: false,
          proposedContent: null,
          diff: null,
          summary: `Section "${target}" not found.`,
          intent,
          requiresConfirmation: false
        }
      }
      break

    case ChangeIntent.ADD_SECTION:
      const newSectionName = extractedContent || extractSectionName(prompt)
      if (!newSectionName) {
        return {
          success: false,
          proposedContent: null,
          diff: null,
          summary: 'Please specify a name for the new section.',
          intent,
          requiresConfirmation: false
        }
      }

      const addResult = addSection(currentContent, newSectionName, '[Add section content here]', target)
      proposedContent = addResult.content
      summary = `Added new section "${newSectionName}".`
      break

    case ChangeIntent.REMOVE_SECTION:
      if (!target) {
        return {
          success: false,
          proposedContent: null,
          diff: null,
          summary: 'Please specify which section you want to remove.',
          intent,
          requiresConfirmation: false
        }
      }

      const removeResult = removeSection(currentContent, target)
      if (removeResult.removed) {
        proposedContent = removeResult.content
        summary = `Removed "${target}" section.`
      } else {
        return {
          success: false,
          proposedContent: null,
          diff: null,
          summary: `Section "${target}" not found.`,
          intent,
          requiresConfirmation: false
        }
      }
      break

    case ChangeIntent.ADD_CONTENT:
      if (!target && !extractedContent) {
        return {
          success: false,
          proposedContent: null,
          diff: null,
          summary: 'Please specify what content to add and where.',
          intent,
          requiresConfirmation: false
        }
      }

      if (target && extractedContent) {
        const section = getSection(currentContent, target)
        if (section) {
          const newSectionContent = section.content + '\n\n' + extractedContent
          const appendResult = updateSection(currentContent, target, newSectionContent)
          proposedContent = appendResult.content
          summary = `Added content to "${target}" section.`
        }
      }
      break

    default:
      return {
        success: false,
        proposedContent: null,
        diff: null,
        summary: 'Could not determine the intended change.',
        intent,
        requiresConfirmation: false
      }
  }

  // Generate diff
  const diff = generateDiff(currentContent, proposedContent)

  return {
    success: true,
    proposedContent,
    diff,
    summary,
    intent,
    requiresConfirmation: true
  }
}

/**
 * Extract a section name from a prompt
 * @param {string} prompt - User prompt
 * @returns {string|null}
 */
function extractSectionName(prompt) {
  // Look for patterns like "called X", "named X", "section X"
  const patterns = [
    /(?:called|named|titled)\s+["']?([^"'\n]+)["']?/i,
    /section\s+["']?([^"'\n]+)["']?/i,
    /add\s+(?:a\s+)?["']?([^"'\n]+)["']?\s+section/i
  ]

  for (const pattern of patterns) {
    const match = prompt.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }

  return null
}

/**
 * Apply a proposed change to the content
 * @param {string} proposedContent - The proposed new content
 * @returns {{content: string, applied: boolean}}
 */
function applyChange(proposedContent) {
  if (!proposedContent) {
    return { content: null, applied: false }
  }
  return { content: proposedContent, applied: true }
}

module.exports = {
  ChangeIntent,
  parseIntent,
  proposeChange,
  applyChange,
  extractSectionName
}
