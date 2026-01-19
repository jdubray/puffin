/**
 * SyntaxValidator
 *
 * Regex-based syntax validation for document files.
 * Supports markdown (.md), JSON (.json), and HTML (.html) validation.
 * Used to verify Claude's output and provide feedback on syntax errors.
 */

export class SyntaxValidator {
  /**
   * Validate document content based on file extension
   * @param {string} content - Document content to validate
   * @param {string} extension - File extension including dot (e.g., '.md')
   * @returns {Object} Validation result { valid: boolean, errors: Array<{message, line?, column?}> }
   */
  validate(content, extension) {
    if (!content || typeof content !== 'string') {
      return { valid: true, errors: [] }
    }

    const ext = (extension || '').toLowerCase()

    switch (ext) {
      case '.md':
      case '.markdown':
        return this.validateMarkdown(content)
      case '.json':
        return this.validateJson(content)
      case '.html':
      case '.htm':
        return this.validateHtml(content)
      case '.xml':
        return this.validateXml(content)
      default:
        // No validation for unsupported file types
        return { valid: true, errors: [] }
    }
  }

  /**
   * Validate markdown syntax
   * Checks for common markdown issues:
   * - Unclosed code blocks
   * - Broken link syntax
   * - Unclosed inline code
   * - Malformed headers
   * @param {string} content - Markdown content
   * @returns {Object} Validation result
   */
  validateMarkdown(content) {
    const errors = []
    const lines = content.split('\n')

    // Check for unclosed fenced code blocks
    const fencedCodeBlockPattern = /^(`{3,}|~{3,})/
    let inCodeBlock = false
    let codeBlockFence = null
    let codeBlockStartLine = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const match = line.match(fencedCodeBlockPattern)

      if (match) {
        const fence = match[1]
        if (!inCodeBlock) {
          // Starting a code block
          inCodeBlock = true
          codeBlockFence = fence.charAt(0)
          codeBlockStartLine = i + 1
        } else if (line.startsWith(codeBlockFence)) {
          // Closing a code block (must use same fence character)
          inCodeBlock = false
          codeBlockFence = null
        }
      }
    }

    if (inCodeBlock) {
      errors.push({
        message: `Unclosed code block starting at line ${codeBlockStartLine}`,
        line: codeBlockStartLine,
        type: 'unclosed-code-block'
      })
    }

    // Check for broken link syntax [text](url)
    // Look for unclosed brackets or parentheses in link patterns
    // Must skip lines inside fenced code blocks
    const brokenLinkPattern = /\[([^\]]*)\]\([^)]*$/gm
    let linkCheckInCodeBlock = false
    let linkCheckFenceChar = null

    let lineNum = 0
    for (const line of lines) {
      lineNum++
      const fenceMatch = line.match(fencedCodeBlockPattern)

      // Track code block state
      if (fenceMatch) {
        const fenceChar = fenceMatch[1].charAt(0)
        if (!linkCheckInCodeBlock) {
          linkCheckInCodeBlock = true
          linkCheckFenceChar = fenceChar
        } else if (line.trim().startsWith(linkCheckFenceChar.repeat(3))) {
          linkCheckInCodeBlock = false
          linkCheckFenceChar = null
        }
        continue
      }

      // Skip lines inside code blocks
      if (linkCheckInCodeBlock) continue

      // Check for links that start but don't close the parenthesis
      if (brokenLinkPattern.test(line)) {
        errors.push({
          message: `Broken link syntax at line ${lineNum}: missing closing parenthesis`,
          line: lineNum,
          type: 'broken-link'
        })
      }
      brokenLinkPattern.lastIndex = 0 // Reset regex state

      // Check for unclosed square brackets in links
      const openBrackets = (line.match(/\[(?![^\]]*\])/g) || []).length

      // Only report if there's a standalone [ that's likely meant to be a link
      if (openBrackets > 0 && line.includes('](')) {
        // This line has link-like syntax with unclosed brackets
        const partialLink = line.match(/\[[^\]]*$/)
        if (partialLink) {
          errors.push({
            message: `Unclosed link bracket at line ${lineNum}`,
            line: lineNum,
            type: 'unclosed-bracket'
          })
        }
      }
    }

    // Check for unclosed inline code (odd number of backticks outside code blocks)
    // This is a simple heuristic - doesn't handle all edge cases
    // We need to track which lines are inside fenced code blocks
    let insideCodeBlock = false
    let currentFenceChar = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const fenceMatch = line.match(fencedCodeBlockPattern)

      // Check if this line is a fence delimiter
      if (fenceMatch) {
        const fenceChar = fenceMatch[1].charAt(0)
        if (!insideCodeBlock) {
          // Starting a code block
          insideCodeBlock = true
          currentFenceChar = fenceChar
        } else if (line.trim().startsWith(currentFenceChar.repeat(3))) {
          // Closing a code block (same fence type)
          insideCodeBlock = false
          currentFenceChar = null
        }
        continue // Skip fence lines themselves
      }

      // Skip lines inside fenced code blocks
      if (insideCodeBlock) continue

      // Count single backticks (not triple) - use simpler regex for better compatibility
      // Match backticks that are NOT part of triple backticks
      const lineWithoutTripleBackticks = line.replace(/```+/g, '')
      const singleBacktickCount = (lineWithoutTripleBackticks.match(/`/g) || []).length

      if (singleBacktickCount % 2 !== 0) {
        // Check if this might be intentional (e.g., in a sentence about backticks)
        if (!line.includes('```')) {
          errors.push({
            message: `Possible unclosed inline code at line ${i + 1}`,
            line: i + 1,
            type: 'unclosed-inline-code'
          })
        }
      }
    }

    // Check for malformed headers (# without space)
    // Must also skip lines inside code blocks
    let headerCheckInCodeBlock = false
    let headerCheckFenceChar = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const fenceMatch = line.match(fencedCodeBlockPattern)

      // Track code block state
      if (fenceMatch) {
        const fenceChar = fenceMatch[1].charAt(0)
        if (!headerCheckInCodeBlock) {
          headerCheckInCodeBlock = true
          headerCheckFenceChar = fenceChar
        } else if (line.trim().startsWith(headerCheckFenceChar.repeat(3))) {
          headerCheckInCodeBlock = false
          headerCheckFenceChar = null
        }
        continue
      }

      // Skip lines inside code blocks
      if (headerCheckInCodeBlock) continue

      // Headers should have space after # (unless it's a shebang line)
      if (/^#{1,6}[^#\s]/.test(line) && !line.startsWith('#!')) {
        errors.push({
          message: `Malformed header at line ${i + 1}: missing space after #`,
          line: i + 1,
          type: 'malformed-header'
        })
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      fileType: 'markdown'
    }
  }

  /**
   * Validate JSON syntax
   * Uses JSON.parse for accurate validation
   * @param {string} content - JSON content
   * @returns {Object} Validation result
   */
  validateJson(content) {
    const errors = []

    // Trim whitespace
    const trimmed = content.trim()

    // Empty content is technically invalid JSON but might be intentional
    if (!trimmed) {
      return {
        valid: true,
        errors: [],
        fileType: 'json',
        warning: 'File is empty'
      }
    }

    try {
      JSON.parse(trimmed)
      return {
        valid: true,
        errors: [],
        fileType: 'json'
      }
    } catch (e) {
      // Try to extract line number from error message
      let line = null
      let column = null

      // Parse error messages like "at position 123" or "at line 5 column 10"
      const posMatch = e.message.match(/position\s+(\d+)/i)
      const lineColMatch = e.message.match(/line\s+(\d+)\s+column\s+(\d+)/i)

      if (lineColMatch) {
        line = parseInt(lineColMatch[1], 10)
        column = parseInt(lineColMatch[2], 10)
      } else if (posMatch) {
        // Convert position to line number
        const position = parseInt(posMatch[1], 10)
        const beforeError = content.substring(0, position)
        line = (beforeError.match(/\n/g) || []).length + 1
        const lastNewline = beforeError.lastIndexOf('\n')
        column = position - lastNewline
      }

      errors.push({
        message: e.message,
        line,
        column,
        type: 'json-parse-error'
      })

      return {
        valid: false,
        errors,
        fileType: 'json'
      }
    }
  }

  /**
   * Validate HTML structure
   * Checks for:
   * - Unclosed tags
   * - Mismatched tags
   * - Invalid nesting
   * @param {string} content - HTML content
   * @returns {Object} Validation result
   */
  validateHtml(content) {
    const errors = []

    // Void elements (self-closing, don't need closing tags)
    const voidElements = new Set([
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr',
      // Also include some common self-closing patterns
      'command', 'keygen', 'menuitem'
    ])

    // Elements that can be implicitly closed (simplified - HTML5 allows more)
    const optionalClose = new Set(['li', 'dt', 'dd', 'p', 'tr', 'td', 'th'])

    // Parse tags from content
    // This regex captures: opening tags, closing tags, and self-closing tags
    const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)\s*[^>]*\/?>/g

    const stack = []
    let match

    // Track line numbers
    let currentPosition = 0
    const getLineNumber = (pos) => {
      return (content.substring(0, pos).match(/\n/g) || []).length + 1
    }

    while ((match = tagPattern.exec(content)) !== null) {
      const fullTag = match[0]
      const tagName = match[1].toLowerCase()
      const position = match.index
      const line = getLineNumber(position)

      // Skip void elements
      if (voidElements.has(tagName)) {
        continue
      }

      // Skip self-closing tags (ending with />)
      if (fullTag.endsWith('/>')) {
        continue
      }

      // Check if it's a closing tag
      if (fullTag.startsWith('</')) {
        // Look for matching opening tag
        let found = false
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === tagName) {
            // Found matching tag, remove it and everything after
            // (this handles optional closing tags)
            stack.splice(i)
            found = true
            break
          }
        }

        if (!found) {
          errors.push({
            message: `Unexpected closing tag </${tagName}> at line ${line}`,
            line,
            type: 'unexpected-closing-tag',
            tag: tagName
          })
        }
      } else {
        // Opening tag - push to stack
        stack.push({
          tag: tagName,
          line,
          position
        })
      }
    }

    // Check for unclosed tags (excluding optional-close elements for leniency)
    for (const item of stack) {
      if (!optionalClose.has(item.tag)) {
        errors.push({
          message: `Unclosed tag <${item.tag}> opened at line ${item.line}`,
          line: item.line,
          type: 'unclosed-tag',
          tag: item.tag
        })
      }
    }

    // Check for basic structure issues
    // Look for DOCTYPE declaration (optional but good practice)
    const hasDoctype = /<!DOCTYPE\s+html/i.test(content)
    const hasHtmlTag = /<html[\s>]/i.test(content)
    const hasHeadTag = /<head[\s>]/i.test(content)
    const hasBodyTag = /<body[\s>]/i.test(content)

    // Only add structure warnings for complete HTML documents
    if (hasHtmlTag) {
      if (!hasDoctype) {
        errors.push({
          message: 'Missing DOCTYPE declaration (recommended: <!DOCTYPE html>)',
          line: 1,
          type: 'missing-doctype',
          severity: 'warning'
        })
      }
      if (!hasHeadTag) {
        errors.push({
          message: 'Missing <head> element',
          type: 'missing-head',
          severity: 'warning'
        })
      }
      if (!hasBodyTag) {
        errors.push({
          message: 'Missing <body> element',
          type: 'missing-body',
          severity: 'warning'
        })
      }
    }

    return {
      valid: errors.filter(e => e.severity !== 'warning').length === 0,
      errors,
      fileType: 'html'
    }
  }

  /**
   * Validate XML structure (basic)
   * Similar to HTML but stricter
   * @param {string} content - XML content
   * @returns {Object} Validation result
   */
  validateXml(content) {
    const errors = []

    // Check for XML declaration
    const hasDeclaration = /^<\?xml\s+[^?]*\?>/i.test(content.trim())

    // Parse tags
    const tagPattern = /<\/?([a-zA-Z_][a-zA-Z0-9_.-]*)\s*[^>]*\/?>/g
    const stack = []
    let match

    const getLineNumber = (pos) => {
      return (content.substring(0, pos).match(/\n/g) || []).length + 1
    }

    while ((match = tagPattern.exec(content)) !== null) {
      const fullTag = match[0]
      const tagName = match[1]
      const position = match.index
      const line = getLineNumber(position)

      // Skip processing instructions and declarations
      if (fullTag.startsWith('<?') || fullTag.startsWith('<!')) {
        continue
      }

      // Skip self-closing tags
      if (fullTag.endsWith('/>')) {
        continue
      }

      // Check if closing tag
      if (fullTag.startsWith('</')) {
        if (stack.length === 0) {
          errors.push({
            message: `Unexpected closing tag </${tagName}> at line ${line}`,
            line,
            type: 'unexpected-closing-tag',
            tag: tagName
          })
        } else {
          const expected = stack.pop()
          if (expected.tag !== tagName) {
            errors.push({
              message: `Mismatched tag: expected </${expected.tag}> but found </${tagName}> at line ${line}`,
              line,
              type: 'mismatched-tag',
              expected: expected.tag,
              found: tagName
            })
          }
        }
      } else {
        // Opening tag
        stack.push({ tag: tagName, line })
      }
    }

    // Check for unclosed tags
    for (const item of stack) {
      errors.push({
        message: `Unclosed tag <${item.tag}> opened at line ${item.line}`,
        line: item.line,
        type: 'unclosed-tag',
        tag: item.tag
      })
    }

    return {
      valid: errors.length === 0,
      errors,
      fileType: 'xml'
    }
  }

  /**
   * Format validation errors as a human-readable string
   * @param {Object} result - Validation result from validate()
   * @returns {string} Formatted error message
   */
  formatErrors(result) {
    if (result.valid) {
      return 'No syntax errors found.'
    }

    const lines = [`Found ${result.errors.length} syntax error(s):`]

    for (const error of result.errors) {
      let msg = `- ${error.message}`
      if (error.line && !error.message.includes('line')) {
        msg += ` (line ${error.line})`
      }
      lines.push(msg)
    }

    return lines.join('\n')
  }

  /**
   * Get validation summary for AI response
   * @param {Object} result - Validation result from validate()
   * @returns {Object} Summary object for response parsing
   */
  getSummary(result) {
    return {
      valid: result.valid,
      errorCount: result.errors.length,
      fileType: result.fileType,
      errors: result.errors.map(e => ({
        message: e.message,
        line: e.line,
        type: e.type
      }))
    }
  }
}

export default SyntaxValidator
