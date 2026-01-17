/**
 * ChangeTracker - Tracks document modifications for visual highlighting
 *
 * Uses line-level diffing to identify added, modified, and deleted lines.
 * Maintains a baseline content snapshot and computes changes against it.
 *
 * Change Types:
 * - 'added': New lines that weren't in the baseline
 * - 'modified': Lines that exist in both but have different content
 * - 'deleted': Lines that were in baseline but are now gone (shown as markers)
 */

export class ChangeTracker {
  constructor() {
    // Previous content snapshot (baseline)
    this.previousContent = null
    this.previousLines = []

    // Computed changes: Array of { type, lineNumber, oldLineNumber?, content? }
    this.changes = []

    // Whether highlighting is enabled
    this.highlightingEnabled = true

    // Map of line numbers to change types for quick lookup
    this.lineChangeMap = new Map()
  }

  /**
   * Record a baseline snapshot of the document content
   * @param {string} content - Document content to use as baseline
   */
  recordBaseline(content) {
    this.previousContent = content || ''
    this.previousLines = this.previousContent.split('\n')
    this.changes = []
    this.lineChangeMap.clear()
  }

  /**
   * Compute changes between baseline and new content
   * @param {string} newContent - New document content
   * @returns {Array} Array of change objects
   */
  computeChanges(newContent) {
    if (this.previousContent === null) {
      // No baseline set - record this as baseline and return no changes
      this.recordBaseline(newContent)
      return []
    }

    const oldLines = this.previousLines
    const newLines = (newContent || '').split('\n')

    // Compute the diff using LCS-based algorithm
    this.changes = this.computeLineDiff(oldLines, newLines)

    // Build the line change map for quick lookup
    this.buildLineChangeMap()

    return this.changes
  }

  /**
   * Compute line-level diff using a simplified LCS approach
   * @param {Array} oldLines - Array of old content lines
   * @param {Array} newLines - Array of new content lines
   * @returns {Array} Array of change objects with line numbers in NEW content
   */
  computeLineDiff(oldLines, newLines) {
    const changes = []

    // Build a map of line content to indices in old content
    const oldLineMap = new Map()
    oldLines.forEach((line, idx) => {
      if (!oldLineMap.has(line)) {
        oldLineMap.set(line, [])
      }
      oldLineMap.get(line).push(idx)
    })

    // Track which old lines have been matched
    const matchedOldLines = new Set()

    // First pass: identify exact matches and their positions
    const newLineMatches = new Array(newLines.length).fill(-1)

    newLines.forEach((line, newIdx) => {
      if (oldLineMap.has(line)) {
        const candidates = oldLineMap.get(line)
        // Find the first unmatched old line with this content
        for (const oldIdx of candidates) {
          if (!matchedOldLines.has(oldIdx)) {
            newLineMatches[newIdx] = oldIdx
            matchedOldLines.add(oldIdx)
            break
          }
        }
      }
    })

    // Second pass: identify changes based on matches
    newLines.forEach((line, newIdx) => {
      const lineNumber = newIdx + 1 // 1-indexed for display

      if (newLineMatches[newIdx] === -1) {
        // No exact match - this line is new or modified
        // Check if there's a similar line nearby in old content (fuzzy match)
        const similarOldIdx = this.findSimilarLine(line, oldLines, matchedOldLines, newIdx)

        if (similarOldIdx !== -1) {
          // Found a similar line - mark as modified
          changes.push({
            type: 'modified',
            lineNumber,
            oldLineNumber: similarOldIdx + 1,
            content: line,
            oldContent: oldLines[similarOldIdx]
          })
          matchedOldLines.add(similarOldIdx)
        } else {
          // No similar line - this is a new addition
          changes.push({
            type: 'added',
            lineNumber,
            content: line
          })
        }
      }
      // Matched lines are unchanged - no entry needed
    })

    // Third pass: identify deleted lines (old lines with no match)
    // We track these separately as they don't have line numbers in new content
    oldLines.forEach((line, oldIdx) => {
      if (!matchedOldLines.has(oldIdx) && line.trim() !== '') {
        // Find where this deletion would be in the new content
        // Use the position of the nearest matched line before it
        let insertPosition = 1
        for (let i = oldIdx - 1; i >= 0; i--) {
          if (matchedOldLines.has(i)) {
            // Find where this old line appears in new content
            const newIdx = newLineMatches.indexOf(i)
            if (newIdx !== -1) {
              insertPosition = newIdx + 2 // After the matched line
              break
            }
          }
        }

        changes.push({
          type: 'deleted',
          lineNumber: insertPosition, // Where the deletion marker should appear
          oldLineNumber: oldIdx + 1,
          oldContent: line
        })
      }
    })

    // Sort changes by line number
    changes.sort((a, b) => a.lineNumber - b.lineNumber)

    return changes
  }

  /**
   * Find a similar line in old content using fuzzy matching
   * @param {string} newLine - The new line to match
   * @param {Array} oldLines - Array of old content lines
   * @param {Set} matchedOldLines - Set of already matched old line indices
   * @param {number} newIdx - Index of the new line (for proximity weighting)
   * @returns {number} Index of similar line or -1 if not found
   */
  findSimilarLine(newLine, oldLines, matchedOldLines, newIdx) {
    const trimmedNew = newLine.trim()
    if (trimmedNew === '') return -1

    let bestMatch = -1
    let bestScore = 0
    const minSimilarity = 0.6 // 60% similarity threshold

    oldLines.forEach((oldLine, oldIdx) => {
      if (matchedOldLines.has(oldIdx)) return
      if (oldLine.trim() === '') return

      const similarity = this.calculateSimilarity(trimmedNew, oldLine.trim())

      // Weight by proximity (prefer nearby lines)
      const distance = Math.abs(newIdx - oldIdx)
      const proximityBonus = Math.max(0, 0.1 - distance * 0.01)
      const score = similarity + proximityBonus

      if (similarity >= minSimilarity && score > bestScore) {
        bestScore = score
        bestMatch = oldIdx
      }
    })

    return bestMatch
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {number} Similarity score between 0 and 1
   */
  calculateSimilarity(a, b) {
    if (a === b) return 1
    if (a.length === 0 || b.length === 0) return 0

    // Quick check: if lengths differ significantly, low similarity
    const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length)
    if (lenRatio < 0.5) return lenRatio * 0.5

    // Use simplified Levenshtein for performance
    const maxLen = Math.max(a.length, b.length)
    if (maxLen > 200) {
      // For long lines, use character overlap ratio
      const aChars = new Set(a.split(''))
      const bChars = new Set(b.split(''))
      const intersection = [...aChars].filter(c => bChars.has(c)).length
      const union = new Set([...aChars, ...bChars]).size
      return intersection / union
    }

    const distance = this.levenshteinDistance(a, b)
    return 1 - distance / maxLen
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {number} Edit distance
   */
  levenshteinDistance(a, b) {
    const m = a.length
    const n = b.length

    // Use single array optimization
    const prev = new Array(n + 1)
    const curr = new Array(n + 1)

    for (let j = 0; j <= n; j++) prev[j] = j

    for (let i = 1; i <= m; i++) {
      curr[0] = i
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        curr[j] = Math.min(
          prev[j] + 1,      // deletion
          curr[j - 1] + 1,  // insertion
          prev[j - 1] + cost // substitution
        )
      }
      // Swap arrays
      for (let j = 0; j <= n; j++) prev[j] = curr[j]
    }

    return prev[n]
  }

  /**
   * Build a map of line numbers to change types for quick lookup
   */
  buildLineChangeMap() {
    this.lineChangeMap.clear()

    for (const change of this.changes) {
      if (change.type !== 'deleted') {
        this.lineChangeMap.set(change.lineNumber, change.type)
      }
    }
  }

  /**
   * Get the change type for a specific line number
   * @param {number} lineNumber - 1-indexed line number
   * @returns {string|null} Change type ('added', 'modified', 'deleted') or null
   */
  getChangeForLine(lineNumber) {
    if (!this.highlightingEnabled) return null
    return this.lineChangeMap.get(lineNumber) || null
  }

  /**
   * Get all changes of a specific type
   * @param {string} type - Change type ('added', 'modified', 'deleted')
   * @returns {Array} Array of changes of that type
   */
  getChangesByType(type) {
    return this.changes.filter(c => c.type === type)
  }

  /**
   * Get change statistics
   * @returns {Object} Object with added, modified, deleted counts
   */
  getStats() {
    const stats = { added: 0, modified: 0, deleted: 0 }
    for (const change of this.changes) {
      stats[change.type]++
    }
    return stats
  }

  /**
   * Get all changes as an array
   * @returns {Array} All tracked changes
   */
  getAllChanges() {
    if (!this.highlightingEnabled) return []
    return [...this.changes]
  }

  /**
   * Check if a line range has any changes
   * @param {number} startLine - Start line number (1-indexed)
   * @param {number} endLine - End line number (1-indexed)
   * @returns {boolean} Whether any lines in the range have changes
   */
  hasChangesInRange(startLine, endLine) {
    if (!this.highlightingEnabled) return false

    for (let line = startLine; line <= endLine; line++) {
      if (this.lineChangeMap.has(line)) return true
    }
    return false
  }

  /**
   * Clear all tracked changes and reset highlights
   */
  clearHighlights() {
    this.changes = []
    this.lineChangeMap.clear()
  }

  /**
   * Toggle highlighting visibility
   * @param {boolean} enabled - Whether highlighting should be visible
   */
  setHighlightingEnabled(enabled) {
    this.highlightingEnabled = enabled
  }

  /**
   * Check if highlighting is enabled
   * @returns {boolean} Whether highlighting is enabled
   */
  isHighlightingEnabled() {
    return this.highlightingEnabled
  }

  /**
   * Check if there are any tracked changes
   * @returns {boolean} Whether there are changes to display
   */
  hasChanges() {
    return this.changes.length > 0
  }

  /**
   * Update baseline to current content (accept all changes)
   * @param {string} currentContent - Current document content
   */
  acceptChanges(currentContent) {
    this.recordBaseline(currentContent)
  }
}

export default ChangeTracker
