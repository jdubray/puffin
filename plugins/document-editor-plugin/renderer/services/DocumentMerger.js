/**
 * DocumentMerger - Applies structured changes to documents
 *
 * Parses Claude's structured change format and applies changes
 * programmatically to preserve the full document content.
 */

export class DocumentMerger {
  constructor() {
    // Change block markers
    this.CHANGE_START = '<<<CHANGE>>>'
    this.CHANGE_END = '<<<END_CHANGE>>>'

    // Valid change types
    this.VALID_TYPES = ['REPLACE', 'INSERT_AFTER', 'INSERT_BEFORE', 'DELETE']
  }

  /**
   * Parse structured changes from Claude's response
   * @param {string} response - Raw response text from Claude
   * @returns {Object} Parsed result with changes array and summary
   */
  parseChanges(response) {
    if (!response || typeof response !== 'string') {
      return { changes: [], summary: '', questions: [], parseErrors: ['Empty response'] }
    }

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
        // Parse individual questions (look for numbered or bulleted items)
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
      const parsed = this.parseChangeBlock(blockContent)

      if (parsed.error) {
        result.parseErrors.push(parsed.error)
      } else {
        result.changes.push(parsed)
      }
    }

    return result
  }

  /**
   * Parse a single change block
   * @param {string} blockContent - Content of a single change block
   * @returns {Object} Parsed change object or error
   */
  parseChangeBlock(blockContent) {
    // Extract TYPE
    const typeMatch = blockContent.match(/^TYPE:\s*(\w+)/im)
    if (!typeMatch) {
      return { error: 'Missing TYPE in change block' }
    }

    const type = typeMatch[1].toUpperCase()
    if (!this.VALID_TYPES.includes(type)) {
      return { error: `Invalid change type: ${type}` }
    }

    // Extract FIND content (between FIND: and CONTENT: or end)
    const findMatch = blockContent.match(/FIND:\s*\n```[^\n]*\n([\s\S]*?)\n```/i)
    if (!findMatch) {
      return { error: 'Missing or malformed FIND section in change block' }
    }
    const findText = findMatch[1]

    // Extract CONTENT (optional for DELETE)
    let contentText = null
    const contentMatch = blockContent.match(/CONTENT:\s*\n```[^\n]*\n([\s\S]*?)\n```/i)
    if (contentMatch) {
      contentText = contentMatch[1]
    } else if (type !== 'DELETE') {
      return { error: `Missing CONTENT section for ${type} operation` }
    }

    return {
      type,
      find: findText,
      content: contentText
    }
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
        // Found in normalized version - need to find actual position in original
        // This is approximate - find the best match using line-by-line search
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
          // Found a matching line - expand to find full context
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

    // Find first line
    const firstLine = findLines[0]
    let searchStart = 0

    while (searchStart < content.length) {
      const lineIndex = content.indexOf(firstLine, searchStart)
      if (lineIndex === -1) break

      // Try to match subsequent lines
      let matchStart = lineIndex
      let matchEnd = lineIndex + firstLine.length
      let allLinesMatched = true

      // Find the actual start of this line in content
      let actualStart = lineIndex
      while (actualStart > 0 && content[actualStart - 1] !== '\n') {
        actualStart--
      }

      // Try to match all lines
      const contentFromMatch = content.substring(actualStart)
      const contentLines = contentFromMatch.split('\n')

      for (let i = 0; i < findLines.length && i < contentLines.length; i++) {
        if (!contentLines[i].trim().includes(findLines[i]) &&
            contentLines[i].trim() !== findLines[i]) {
          // Allow partial matches if most of the line matches
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
        // Calculate the actual text to match
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

    // Find the start of the line in content
    let lineStart = lineIndex
    while (lineStart > 0 && content[lineStart - 1] !== '\n') {
      lineStart--
    }

    // Go back to find potential start of the match
    let matchStart = lineStart
    for (let i = 0; i < foundLineIdx; i++) {
      // Go back one line
      if (matchStart > 0) {
        matchStart--
        while (matchStart > 0 && content[matchStart - 1] !== '\n') {
          matchStart--
        }
      }
    }

    // Find the end by counting forward
    let matchEnd = lineStart
    const remainingLines = findLines.length - foundLineIdx
    for (let i = 0; i < remainingLines; i++) {
      // Find end of current line
      while (matchEnd < content.length && content[matchEnd] !== '\n') {
        matchEnd++
      }
      if (matchEnd < content.length) matchEnd++ // Skip newline
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

    // Simple character-based similarity
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

    switch (type) {
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
   * Check if response contains structured changes
   * @param {string} response - Response text to check
   * @returns {boolean} True if response uses structured change format
   */
  hasStructuredChanges(response) {
    if (!response) return false
    return response.includes(this.CHANGE_START) && response.includes(this.CHANGE_END)
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
