/**
 * DocumentMerger - Applies structured changes to documents
 *
 * Parses Claude's JSON-based change format and applies changes
 * programmatically to preserve the full document content.
 *
 * JSON Format:
 * {
 *   "type": "changes",
 *   "summary": ["change 1", "change 2"],
 *   "changes": [
 *     { "op": "replace", "find": "text", "content": "new text" },
 *     { "op": "insert_after", "find": "anchor", "content": "new text" },
 *     { "op": "insert_before", "find": "anchor", "content": "new text" },
 *     { "op": "delete", "find": "text to remove" }
 *   ]
 * }
 */

export class DocumentMerger {
  constructor() {
    // Valid operation types
    this.VALID_OPS = ['replace', 'insert_after', 'insert_before', 'delete']

    // Legacy markers (for backwards compatibility)
    this.LEGACY_CHANGE_START = '<<<CHANGE>>>'
    this.LEGACY_CHANGE_END = '<<<END_CHANGE>>>'
  }

  /**
   * Parse structured changes from Claude's response
   * Supports both JSON format (preferred) and legacy markdown format
   * @param {string} response - Raw response text from Claude
   * @returns {Object} Parsed result with changes array and summary
   */
  parseChanges(response) {
    if (!response || typeof response !== 'string') {
      return { changes: [], summary: '', questions: [], parseErrors: ['Empty response'] }
    }

    // Try JSON format first (preferred)
    const jsonResult = this.parseJsonFormat(response)
    if (jsonResult.success) {
      return jsonResult.data
    }

    // Fall back to legacy markdown format
    if (this.hasLegacyFormat(response)) {
      console.log('[DocumentMerger] Falling back to legacy markdown format')
      return this.parseLegacyFormat(response)
    }

    // No recognized format
    return {
      changes: [],
      summary: '',
      questions: [],
      parseErrors: ['No valid JSON or legacy change format found in response']
    }
  }

  /**
   * Parse JSON format from response
   * @param {string} response - Raw response text
   * @returns {Object} { success: boolean, data?: ParsedResult }
   */
  parseJsonFormat(response) {
    // Extract JSON from code block
    const jsonMatch = response.match(/```json\s*\n([\s\S]*?)\n```/)
    if (!jsonMatch) {
      return { success: false }
    }

    let jsonStr = jsonMatch[1].trim()

    try {
      const parsed = JSON.parse(jsonStr)

      // Handle questions format
      if (parsed.type === 'questions') {
        return {
          success: true,
          data: {
            changes: [],
            summary: '',
            questions: (parsed.questions || []).map((q, i) => ({
              id: `q-${Date.now()}-${i}`,
              question: q,
              answered: false
            })),
            parseErrors: []
          }
        }
      }

      // Handle changes format
      if (parsed.type === 'changes') {
        const changes = []
        const parseErrors = []

        for (const change of (parsed.changes || [])) {
          const op = (change.op || '').toLowerCase()
          if (!this.VALID_OPS.includes(op)) {
            parseErrors.push(`Invalid operation type: ${change.op}`)
            continue
          }

          if (!change.find) {
            parseErrors.push('Change missing required "find" field')
            continue
          }

          if (op !== 'delete' && !change.content) {
            parseErrors.push(`${op} operation missing required "content" field`)
            continue
          }

          changes.push({
            type: op.toUpperCase(),
            find: change.find,
            content: change.content || null
          })
        }

        // Build summary string from array
        const summaryArray = parsed.summary || []
        const summaryStr = Array.isArray(summaryArray)
          ? summaryArray.map(s => `- ${s}`).join('\n')
          : String(summaryArray)

        return {
          success: true,
          data: {
            changes,
            summary: summaryStr,
            questions: [],
            parseErrors
          }
        }
      }

      // Unknown type
      return {
        success: false
      }
    } catch (e) {
      console.warn('[DocumentMerger] JSON parse error:', e.message)
      // Try to extract more context about the error
      return {
        success: false,
        error: `JSON parse error: ${e.message}`
      }
    }
  }

  /**
   * Check if response contains legacy markdown format
   * @param {string} response - Response text
   * @returns {boolean}
   */
  hasLegacyFormat(response) {
    return response.includes(this.LEGACY_CHANGE_START) && response.includes(this.LEGACY_CHANGE_END)
  }

  /**
   * Check if response contains structured changes (JSON or legacy)
   * @param {string} response - Response text to check
   * @returns {boolean} True if response uses structured change format
   */
  hasStructuredChanges(response) {
    if (!response) return false

    // Check for JSON format
    const jsonMatch = response.match(/```json\s*\n[\s\S]*?"type"\s*:\s*"changes"[\s\S]*?\n```/)
    if (jsonMatch) return true

    // Check for legacy format
    return this.hasLegacyFormat(response)
  }

  /**
   * Parse legacy markdown format (backwards compatibility)
   * @param {string} response - Raw response text
   * @returns {Object} Parsed result
   */
  parseLegacyFormat(response) {
    const result = {
      changes: [],
      summary: '',
      questions: [],
      parseErrors: []
    }

    // Extract summary
    const summaryMatch = response.match(/##\s*Summary\s*\n([\s\S]*?)(?=##|<<<CHANGE>>>|$)/i)
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim()
    }

    // Extract questions
    const questionsMatch = response.match(/##\s*Questions[^\n]*\n([\s\S]*?)(?=##|<<<CHANGE>>>|$)/i)
    if (questionsMatch) {
      const questionsText = questionsMatch[1].trim()
      if (questionsText && !questionsText.includes('[Only include')) {
        const questionLines = questionsText.split('\n')
          .map(l => l.replace(/^[-*\d.)\s]+/, '').trim())
          .filter(l => l.length > 0 && l.endsWith('?'))
        result.questions = questionLines.map((q, i) => ({
          id: `q-${Date.now()}-${i}`,
          question: q,
          answered: false
        }))
      }
    }

    // Extract and parse change blocks
    const changeBlockRegex = /<<<CHANGE>>>([\s\S]*?)<<<END_CHANGE>>>/g
    let match

    while ((match = changeBlockRegex.exec(response)) !== null) {
      const blockContent = match[1].trim()
      const parsed = this.parseLegacyChangeBlock(blockContent)

      if (parsed.error) {
        result.parseErrors.push(parsed.error)
      } else {
        result.changes.push(parsed)
      }
    }

    return result
  }

  /**
   * Parse a single legacy change block
   * @param {string} blockContent - Content of a single change block
   * @returns {Object} Parsed change object or error
   */
  parseLegacyChangeBlock(blockContent) {
    // Extract TYPE
    const typeMatch = blockContent.match(/^TYPE:\s*(\w+)/im)
    if (!typeMatch) {
      return { error: 'Missing TYPE in change block' }
    }

    const type = typeMatch[1].toUpperCase()
    const validTypes = ['REPLACE', 'INSERT_AFTER', 'INSERT_BEFORE', 'DELETE']
    if (!validTypes.includes(type)) {
      return { error: `Invalid change type: ${type}` }
    }

    // Extract FIND content - handles nested code blocks
    const findText = this.extractCodeBlockContent(blockContent, 'FIND')
    if (findText === null) {
      return { error: 'Missing or malformed FIND section in change block' }
    }

    // Extract CONTENT (optional for DELETE) - handles nested code blocks
    let contentText = null
    if (type !== 'DELETE') {
      contentText = this.extractCodeBlockContent(blockContent, 'CONTENT')
      if (contentText === null) {
        return { error: `Missing CONTENT section for ${type} operation` }
      }
    } else {
      contentText = this.extractCodeBlockContent(blockContent, 'CONTENT')
    }

    return {
      type,
      find: findText,
      content: contentText
    }
  }

  /**
   * Extract content from a labeled code block, handling nested code blocks
   * @param {string} blockContent - The full change block content
   * @param {string} label - The label to look for (e.g., 'FIND' or 'CONTENT')
   * @returns {string|null} The extracted content or null if not found
   */
  extractCodeBlockContent(blockContent, label) {
    // Find the label position
    const labelRegex = new RegExp(`${label}:\\s*\\n\`\`\`[^\\n]*\\n`, 'i')
    const labelMatch = blockContent.match(labelRegex)
    if (!labelMatch) {
      return null
    }

    const contentStart = labelMatch.index + labelMatch[0].length

    // Find next section label or end
    const nextLabel = label === 'FIND' ? blockContent.indexOf('CONTENT:', contentStart) : -1
    const searchEnd = nextLabel !== -1 ? nextLabel : blockContent.length

    // Look for ``` that's on its own line before the next section
    const searchArea = blockContent.substring(contentStart, searchEnd)
    const lines = searchArea.split('\n')
    let charCount = 0
    let contentEnd = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim() === '```') {
        contentEnd = charCount
        break
      }
      charCount += line.length + 1
    }

    if (contentEnd === -1) {
      return null
    }

    let content = searchArea.substring(0, contentEnd)
    if (content.endsWith('\n')) {
      content = content.slice(0, -1)
    }

    return content
  }

  /**
   * Apply parsed changes to the original document
   * @param {string} originalContent - Original document content
   * @param {Array} changes - Array of parsed change objects
   * @returns {Object} Result with updated content and applied/failed changes
   */
  applyChanges(originalContent, changes) {
    if (!originalContent) {
      return {
        content: originalContent,
        applied: [],
        failed: changes.map(c => ({ change: c, error: 'No original content' }))
      }
    }

    if (!changes || changes.length === 0) {
      return { content: originalContent, applied: [], failed: [] }
    }

    let content = originalContent
    const applied = []
    const failed = []

    for (const change of changes) {
      try {
        const result = this.applySingleChange(content, change)
        if (result.success) {
          content = result.content
          applied.push(change)
        } else {
          failed.push({ change, error: result.error })
        }
      } catch (error) {
        failed.push({ change, error: error.message })
      }
    }

    return { content, applied, failed }
  }

  /**
   * Apply a single change to the document
   * @param {string} content - Current document content
   * @param {Object} change - Change object with type, find, content
   * @returns {Object} Result with success, content, and optional error
   */
  applySingleChange(content, change) {
    const { type, find, content: newContent } = change

    // Strategy 1: Exact match
    let index = content.indexOf(find)
    let matchedText = find

    // Strategy 2: Try trimmed match
    if (index === -1) {
      const trimmedFind = find.trim()
      index = content.indexOf(trimmedFind)
      if (index !== -1) {
        matchedText = trimmedFind
      }
    }

    // Strategy 3: Try normalized whitespace match (collapse multiple spaces/newlines)
    if (index === -1) {
      const normalizedFind = find.replace(/\s+/g, ' ').trim()
      const normalizedContent = content.replace(/\s+/g, ' ')
      const normalizedIndex = normalizedContent.indexOf(normalizedFind)

      if (normalizedIndex !== -1) {
        const result = this.findBestMatch(content, find)
        if (result) {
          index = result.index
          matchedText = result.text
        }
      }
    }

    // Strategy 4: Line-by-line fuzzy match for multi-line finds
    if (index === -1 && find.includes('\n')) {
      const result = this.findBestMatch(content, find)
      if (result) {
        index = result.index
        matchedText = result.text
      }
    }

    // Strategy 5: Try finding a key substring (first non-empty line that's unique)
    if (index === -1) {
      const lines = find.split('\n').map(l => l.trim()).filter(l => l.length > 10)
      for (const line of lines) {
        const lineIndex = content.indexOf(line)
        if (lineIndex !== -1) {
          const result = this.expandMatchFromLine(content, find, lineIndex, line)
          if (result) {
            index = result.index
            matchedText = result.text
            break
          }
        }
      }
    }

    if (index === -1) {
      return {
        success: false,
        error: `Could not find target text in document: "${find.substring(0, 80)}..."`
      }
    }

    return this.applyChangeAtIndex(content, index, matchedText, type, newContent)
  }

  /**
   * Find the best match for a multi-line find string in content
   * @private
   */
  findBestMatch(content, find) {
    const findLines = find.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (findLines.length === 0) return null

    const firstLine = findLines[0]
    let searchStart = 0

    while (searchStart < content.length) {
      const lineIndex = content.indexOf(firstLine, searchStart)
      if (lineIndex === -1) break

      let actualStart = lineIndex
      while (actualStart > 0 && content[actualStart - 1] !== '\n') {
        actualStart--
      }

      const contentFromMatch = content.substring(actualStart)
      const contentLines = contentFromMatch.split('\n')
      let allLinesMatched = true

      for (let i = 0; i < findLines.length && i < contentLines.length; i++) {
        if (!contentLines[i].trim().includes(findLines[i]) &&
            contentLines[i].trim() !== findLines[i]) {
          if (findLines[i].length > 20) {
            const similarity = this.calculateSimilarity(contentLines[i].trim(), findLines[i])
            if (similarity < 0.8) {
              allLinesMatched = false
              break
            }
          } else {
            allLinesMatched = false
            break
          }
        }
      }

      if (allLinesMatched) {
        let endLineIndex = 0
        for (let i = 0; i < findLines.length && i < contentLines.length; i++) {
          endLineIndex = i
        }
        const matchedLines = contentLines.slice(0, endLineIndex + 1)
        const matchedText = matchedLines.join('\n')

        return {
          index: actualStart,
          text: matchedText
        }
      }

      searchStart = lineIndex + 1
    }

    return null
  }

  /**
   * Expand a match from a found line to include surrounding context
   * @private
   */
  expandMatchFromLine(content, find, lineIndex, foundLine) {
    const findLines = find.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    const foundLineIdx = findLines.findIndex(l => l === foundLine || l.includes(foundLine) || foundLine.includes(l))

    if (foundLineIdx === -1) return null

    let lineStart = lineIndex
    while (lineStart > 0 && content[lineStart - 1] !== '\n') {
      lineStart--
    }

    let matchStart = lineStart
    for (let i = 0; i < foundLineIdx; i++) {
      if (matchStart > 0) {
        matchStart--
        while (matchStart > 0 && content[matchStart - 1] !== '\n') {
          matchStart--
        }
      }
    }

    let matchEnd = lineStart
    const remainingLines = findLines.length - foundLineIdx
    for (let i = 0; i < remainingLines; i++) {
      while (matchEnd < content.length && content[matchEnd] !== '\n') {
        matchEnd++
      }
      if (matchEnd < content.length) matchEnd++
    }

    const matchedText = content.substring(matchStart, matchEnd).replace(/\n$/, '')
    return {
      index: matchStart,
      text: matchedText
    }
  }

  /**
   * Calculate similarity between two strings (0-1)
   * @private
   */
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1

    if (longer.length === 0) return 1.0

    let matches = 0
    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i])) matches++
    }

    return matches / longer.length
  }

  /**
   * Apply change at a specific index
   * @private
   */
  applyChangeAtIndex(content, index, findText, type, newContent) {
    const before = content.substring(0, index)
    const after = content.substring(index + findText.length)

    // Normalize type to uppercase for comparison
    const normalizedType = type.toUpperCase()

    switch (normalizedType) {
      case 'REPLACE':
        return { success: true, content: before + newContent + after }

      case 'INSERT_AFTER':
        return { success: true, content: before + findText + newContent + after }

      case 'INSERT_BEFORE':
        return { success: true, content: before + newContent + findText + after }

      case 'DELETE':
        return { success: true, content: before + after }

      default:
        return { success: false, error: `Unknown change type: ${type}` }
    }
  }

  /**
   * Attempt to extract a complete document from response (fallback for old format)
   * @param {string} response - Response text
   * @returns {string|null} Extracted document content or null
   */
  extractUpdatedDocument(response) {
    if (!response || typeof response !== 'string') {
      return null
    }

    // Pattern 1: Look for "## Updated Document" section with code block
    const updatedDocPattern = /##\s*Updated\s*Document\s*\n```[\w]*\n([\s\S]*?)\n```/i
    const match = response.match(updatedDocPattern)
    if (match && match[1]) {
      return match[1]
    }

    // Pattern 2: Alternative format - "### Updated Document" (h3)
    const altPattern = /###\s*Updated\s*Document\s*\n```[\w]*\n([\s\S]*?)\n```/i
    const altMatch = response.match(altPattern)
    if (altMatch && altMatch[1]) {
      return altMatch[1]
    }

    return null
  }
}

export default DocumentMerger
