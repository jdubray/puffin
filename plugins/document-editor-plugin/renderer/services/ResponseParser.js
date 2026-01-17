/**
 * ResponseParser - Parses Claude AI responses into structured data
 *
 * Extracts:
 * - Change summaries (bulleted lists of modifications)
 * - Questions that need user answers
 * - Validation errors
 * - Diff statistics
 */

export class ResponseParser {
  /**
   * Parse a raw Claude response into structured components
   * @param {string} rawResponse - Full response text from Claude
   * @param {string} previousContent - Document content before changes
   * @param {string} newContent - Document content after changes
   * @returns {Object} Parsed response with summary, questions, errors, and stats
   */
  parse(rawResponse, previousContent = '', newContent = '') {
    if (!rawResponse || typeof rawResponse !== 'string') {
      return {
        changeSummary: 'No response received.',
        questions: [],
        validationErrors: [],
        diffStats: { added: 0, modified: 0, deleted: 0 },
        fullResponse: rawResponse || ''
      }
    }

    return {
      changeSummary: this.extractChangeSummary(rawResponse),
      questions: this.extractQuestions(rawResponse),
      validationErrors: this.extractValidationErrors(rawResponse),
      diffStats: this.calculateDiffStats(previousContent, newContent),
      fullResponse: rawResponse
    }
  }

  /**
   * Extract change summary from response
   * Looks for common patterns like "## Changes Made", "### Summary:", etc.
   * @param {string} response - Full response text
   * @returns {string} Extracted summary or fallback
   */
  extractChangeSummary(response) {
    if (!response) return 'Changes applied.'

    // Pattern 1: Look for "## Changes Made", "## Changes", "### Changes:"
    const changesSectionPattern = /##?\s*(?:Changes?\s*(?:Made|Summary)?|Summary):?\s*\n([\s\S]*?)(?=\n##|$)/i
    const changesSectionMatch = response.match(changesSectionPattern)
    if (changesSectionMatch) {
      const extracted = changesSectionMatch[1].trim()
      if (extracted) return this.cleanSummary(extracted)
    }

    // Pattern 2: Look for "I made the following changes:" or similar intro phrases
    const introPattern = /(?:I (?:made|applied|implemented)|Here (?:are|is) (?:the|a))(?: following)? changes?:?\s*\n([\s\S]*?)(?=\n\n[A-Z]|\n##|$)/i
    const introMatch = response.match(introPattern)
    if (introMatch) {
      const extracted = introMatch[1].trim()
      if (extracted) return this.cleanSummary(extracted)
    }

    // Pattern 3: Extract all bullet points from the response
    const bullets = response.match(/^[-*]\s+.+$/gm)
    if (bullets && bullets.length > 0) {
      // Filter out bullets that look like questions or code examples
      const summaryBullets = bullets.filter(bullet => {
        const trimmed = bullet.trim()
        // Skip if it ends with ? (likely a question)
        if (trimmed.endsWith('?')) return false
        // Skip if it looks like code (contains common code patterns)
        if (/[{}();=]/.test(trimmed) && trimmed.length < 50) return false
        return true
      })
      if (summaryBullets.length > 0) {
        return summaryBullets.slice(0, 10).join('\n') // Limit to 10 bullets
      }
    }

    // Fallback: Take first paragraph that looks like a summary
    const paragraphs = response.split(/\n\n+/)
    for (const para of paragraphs) {
      const trimmed = para.trim()
      // Skip code blocks
      if (trimmed.startsWith('```')) continue
      // Skip if too short or too long
      if (trimmed.length < 20 || trimmed.length > 500) continue
      // Skip if it looks like a question
      if (trimmed.endsWith('?')) continue
      // Skip headers
      if (trimmed.startsWith('#')) continue
      // This looks like a reasonable summary
      return trimmed
    }

    return 'Changes applied.'
  }

  /**
   * Clean up extracted summary text
   * @param {string} summary - Raw summary text
   * @returns {string} Cleaned summary
   */
  cleanSummary(summary) {
    // Remove leading/trailing whitespace from each line
    const lines = summary.split('\n').map(line => line.trim())

    // Filter out empty lines and lines that are just dashes
    const cleaned = lines.filter(line => {
      if (!line) return false
      if (line === '-' || line === '*') return false
      return true
    })

    // Limit to reasonable length (first 10 lines or 500 chars)
    let result = cleaned.slice(0, 10).join('\n')
    if (result.length > 500) {
      result = result.substring(0, 500) + '...'
    }

    return result || 'Changes applied.'
  }

  /**
   * Extract questions from response that need user answers
   * @param {string} response - Full response text
   * @returns {Array} Array of question objects with id and question text
   */
  extractQuestions(response) {
    if (!response) return []

    const questions = []
    const seenQuestions = new Set()

    // Pattern 1: Look for explicit question sections
    const questionSectionPattern = /(?:##?\s*Questions?|I (?:have|need)(?: a few)? questions?):?\s*\n([\s\S]*?)(?=\n##|$)/i
    const sectionMatch = response.match(questionSectionPattern)
    if (sectionMatch) {
      const questionText = sectionMatch[1]
      // Extract numbered or bulleted items from this section
      const items = questionText.match(/(?:^\d+\.\s*|^[-*]\s*)(.+\?)/gm)
      if (items) {
        items.forEach(item => {
          const cleaned = item.replace(/^[\d.*-]+\s*/, '').trim()
          if (cleaned && !seenQuestions.has(cleaned.toLowerCase())) {
            seenQuestions.add(cleaned.toLowerCase())
            questions.push({
              id: this.generateId(),
              question: cleaned,
              answered: false,
              answer: ''
            })
          }
        })
      }
    }

    // Pattern 2: Look for standalone questions (sentences ending with ?)
    // Skip questions that are likely rhetorical or in code/examples
    const lines = response.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()

      // Skip code blocks, comments, and examples
      if (trimmed.startsWith('```') || trimmed.startsWith('//') || trimmed.startsWith('#')) continue
      if (trimmed.startsWith('<!--') || trimmed.startsWith('/*')) continue

      // Skip lines that look like code
      if (/[{}();=><]/.test(trimmed) && !trimmed.includes('?')) continue

      // Look for questions
      if (trimmed.endsWith('?') && trimmed.length > 10 && trimmed.length < 300) {
        // Extract just the question (might be at end of a longer line)
        const questionMatch = trimmed.match(/([A-Z][^.!?]*\?)$/i)
        if (questionMatch) {
          const question = questionMatch[1].trim()

          // Skip common rhetorical patterns
          if (/^(What|Why|How) about$/i.test(question)) continue
          if (/^Is that$/i.test(question)) continue

          // Skip if we've seen this question
          if (seenQuestions.has(question.toLowerCase())) continue

          seenQuestions.add(question.toLowerCase())
          questions.push({
            id: this.generateId(),
            question,
            answered: false,
            answer: ''
          })
        }
      }
    }

    // Limit to reasonable number of questions
    return questions.slice(0, 5)
  }

  /**
   * Extract validation errors from response
   * @param {string} response - Full response text
   * @returns {Array} Array of error objects
   */
  extractValidationErrors(response) {
    if (!response) return []

    const errors = []

    // Look for error/warning sections
    const errorPatterns = [
      /(?:##?\s*)?(?:Errors?|Warnings?|Issues?|Problems?):?\s*\n([\s\S]*?)(?=\n##|$)/i,
      /(?:I (?:found|noticed|detected))(?: the following)?(?: errors?| issues?| problems?):?\s*\n([\s\S]*?)(?=\n\n[A-Z]|\n##|$)/i
    ]

    for (const pattern of errorPatterns) {
      const match = response.match(pattern)
      if (match) {
        const errorText = match[1]
        const items = errorText.match(/(?:^\d+\.\s*|^[-*]\s*)(.+)/gm)
        if (items) {
          items.forEach(item => {
            const cleaned = item.replace(/^[\d.*-]+\s*/, '').trim()
            if (cleaned) {
              errors.push({
                id: this.generateId(),
                message: cleaned,
                severity: this.determineSeverity(cleaned)
              })
            }
          })
        }
        break
      }
    }

    // Also look for inline validation messages
    const validationPattern = /\b(syntax error|invalid|malformed|missing|unclosed|unexpected)\b[^.]*\./gi
    let inlineMatch
    while ((inlineMatch = validationPattern.exec(response)) !== null) {
      const message = inlineMatch[0].trim()
      // Avoid duplicates
      if (!errors.some(e => e.message === message)) {
        errors.push({
          id: this.generateId(),
          message,
          severity: 'error'
        })
      }
    }

    return errors.slice(0, 10) // Limit to 10 errors
  }

  /**
   * Determine error severity from message content
   * @param {string} message - Error message
   * @returns {string} 'error', 'warning', or 'info'
   */
  determineSeverity(message) {
    const lower = message.toLowerCase()
    if (/\b(error|invalid|malformed|syntax error|failed)\b/.test(lower)) {
      return 'error'
    }
    if (/\b(warning|caution|note|consider)\b/.test(lower)) {
      return 'warning'
    }
    return 'info'
  }

  /**
   * Calculate diff statistics between old and new content
   * Uses simple line-based comparison
   * @param {string} previousContent - Content before changes
   * @param {string} newContent - Content after changes
   * @returns {Object} Stats with added, modified, deleted counts
   */
  calculateDiffStats(previousContent, newContent) {
    if (!previousContent && !newContent) {
      return { added: 0, modified: 0, deleted: 0 }
    }

    if (!previousContent) {
      // New document - all lines are added
      const newLines = (newContent || '').split('\n').filter(l => l.trim())
      return { added: newLines.length, modified: 0, deleted: 0 }
    }

    if (!newContent) {
      // Document deleted - all lines removed
      const oldLines = previousContent.split('\n').filter(l => l.trim())
      return { added: 0, modified: 0, deleted: oldLines.length }
    }

    const oldLines = previousContent.split('\n')
    const newLines = newContent.split('\n')

    // Create a Set of old lines for fast lookup
    const oldLineSet = new Set(oldLines)
    const newLineSet = new Set(newLines)

    let added = 0
    let deleted = 0

    // Count lines that are only in new content
    for (const line of newLines) {
      if (!oldLineSet.has(line)) {
        added++
      }
    }

    // Count lines that are only in old content
    for (const line of oldLines) {
      if (!newLineSet.has(line)) {
        deleted++
      }
    }

    // Estimate modified as the overlap between added and deleted
    // (simplified heuristic - a proper diff would be more accurate)
    const modified = Math.min(added, deleted)
    const netAdded = added - modified
    const netDeleted = deleted - modified

    return {
      added: netAdded,
      modified,
      deleted: netDeleted
    }
  }

  /**
   * Generate a unique ID for questions and errors
   * @returns {string} UUID-like string
   */
  generateId() {
    // Simple UUID v4 generation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  /**
   * Format a parsed response for display
   * @param {Object} parsed - Parsed response object
   * @returns {string} Formatted string for display
   */
  formatForDisplay(parsed) {
    const parts = []

    // Change summary
    if (parsed.changeSummary) {
      parts.push(parsed.changeSummary)
    }

    // Diff stats
    if (parsed.diffStats) {
      const { added, modified, deleted } = parsed.diffStats
      if (added > 0 || modified > 0 || deleted > 0) {
        const statParts = []
        if (added > 0) statParts.push(`+${added} added`)
        if (modified > 0) statParts.push(`~${modified} modified`)
        if (deleted > 0) statParts.push(`-${deleted} deleted`)
        parts.push(`\n[${statParts.join(', ')}]`)
      }
    }

    // Validation errors
    if (parsed.validationErrors && parsed.validationErrors.length > 0) {
      parts.push('\n⚠️ Validation Issues:')
      parsed.validationErrors.forEach(err => {
        const icon = err.severity === 'error' ? '❌' : err.severity === 'warning' ? '⚠️' : 'ℹ️'
        parts.push(`${icon} ${err.message}`)
      })
    }

    return parts.join('\n')
  }
}

export default ResponseParser
