/**
 * Result Aggregator
 *
 * Aggregates findings from multiple chunk analyses into a coherent result set.
 * Handles deduplication, ranking, grouping, and convergence detection.
 */

/**
 * Default aggregation configuration
 */
const DEFAULT_CONFIG = {
  // Similarity threshold for deduplication (0-1)
  similarityThreshold: 0.7,

  // Minimum confidence to include in final results
  minConfidence: 'low',

  // Maximum findings to return
  maxFindings: 50,

  // Convergence detection settings
  convergence: {
    // Minimum iterations before checking convergence
    minIterations: 2,

    // Percentage of new findings that indicates non-convergence
    newFindingThreshold: 0.2,

    // Maximum iterations regardless of convergence
    maxIterations: 5
  }
}

/**
 * Confidence level ordering
 */
const CONFIDENCE_ORDER = {
  high: 3,
  medium: 2,
  low: 1
}

/**
 * ResultAggregator - Combines and ranks findings
 */
class ResultAggregator {
  /**
   * @param {Object} options - Aggregator options
   */
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options }

    // Tracking for convergence
    this._iterationFindings = []
    this._seenFindings = new Set()
  }

  /**
   * Add findings from a batch of chunk analyses
   * @param {Array<Object>} chunkResults - Results from queryBatch
   * @returns {Object} Aggregation summary
   */
  addBatch(chunkResults) {
    const iterationData = {
      iteration: this._iterationFindings.length + 1,
      timestamp: Date.now(),
      chunksAnalyzed: chunkResults.length,
      relevantChunks: 0,
      newFindings: 0,
      duplicateFindings: 0,
      findings: []
    }

    for (const result of chunkResults) {
      if (!result.success || !result.relevant) {
        continue
      }

      iterationData.relevantChunks++

      for (const finding of (result.findings || [])) {
        const normalized = this._normalizeFinding(finding, result)
        const hash = this._hashFinding(normalized)

        if (this._seenFindings.has(hash)) {
          iterationData.duplicateFindings++
        } else {
          this._seenFindings.add(hash)
          iterationData.newFindings++
          iterationData.findings.push(normalized)
        }
      }
    }

    this._iterationFindings.push(iterationData)

    return {
      iteration: iterationData.iteration,
      newFindings: iterationData.newFindings,
      totalFindings: this._seenFindings.size,
      converged: this.checkConvergence()
    }
  }

  /**
   * Check if the analysis has converged
   * @returns {boolean}
   */
  checkConvergence() {
    const { minIterations, newFindingThreshold, maxIterations } = this.config.convergence

    // Not enough iterations yet
    if (this._iterationFindings.length < minIterations) {
      return false
    }

    // Max iterations reached
    if (this._iterationFindings.length >= maxIterations) {
      return true
    }

    // Check if new findings are below threshold
    const lastIteration = this._iterationFindings[this._iterationFindings.length - 1]
    const totalFindings = this._seenFindings.size

    if (totalFindings === 0) {
      return true
    }

    const newFindingRatio = lastIteration.newFindings / totalFindings
    return newFindingRatio < newFindingThreshold
  }

  /**
   * Get aggregated and ranked findings
   * @param {Object} options - Aggregation options
   * @returns {Array<Object>} Ranked findings
   */
  getAggregatedFindings(options = {}) {
    const minConfidence = options.minConfidence || this.config.minConfidence
    const maxFindings = options.maxFindings || this.config.maxFindings

    // Collect all findings from all iterations
    const allFindings = []
    for (const iteration of this._iterationFindings) {
      allFindings.push(...iteration.findings)
    }

    // Filter by confidence
    const minConfidenceLevel = CONFIDENCE_ORDER[minConfidence] || 0
    const filtered = allFindings.filter(f =>
      (CONFIDENCE_ORDER[f.confidence] || 0) >= minConfidenceLevel
    )

    // Sort by confidence (high first), then by chunk order
    filtered.sort((a, b) => {
      const confDiff = (CONFIDENCE_ORDER[b.confidence] || 0) - (CONFIDENCE_ORDER[a.confidence] || 0)
      if (confDiff !== 0) return confDiff
      return (a.chunkIndex || 0) - (b.chunkIndex || 0)
    })

    // Limit results
    return filtered.slice(0, maxFindings)
  }

  /**
   * Get findings grouped by topic/theme
   * @returns {Object} Grouped findings
   */
  getGroupedFindings() {
    const findings = this.getAggregatedFindings()
    const groups = new Map()

    for (const finding of findings) {
      // Use key terms for grouping, or "General" if none
      const primaryTerm = (finding.keyTerms && finding.keyTerms[0])
        ? finding.keyTerms[0].toLowerCase()
        : 'general'

      if (!groups.has(primaryTerm)) {
        groups.set(primaryTerm, [])
      }
      groups.get(primaryTerm).push(finding)
    }

    // Convert to object and sort groups by size
    const result = {}
    const sortedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)

    for (const [term, items] of sortedGroups) {
      result[term] = items
    }

    return result
  }

  /**
   * Get suggested follow-up queries
   * @returns {Array<string>} Suggested queries
   */
  getSuggestedFollowups() {
    const suggestions = new Set()

    for (const iteration of this._iterationFindings) {
      for (const finding of iteration.findings) {
        if (finding.suggestedFollowup) {
          suggestions.add(finding.suggestedFollowup)
        }
      }
    }

    return [...suggestions].slice(0, 5)
  }

  /**
   * Get aggregation statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const totalChunksAnalyzed = this._iterationFindings.reduce(
      (sum, it) => sum + it.chunksAnalyzed, 0
    )
    const totalRelevantChunks = this._iterationFindings.reduce(
      (sum, it) => sum + it.relevantChunks, 0
    )

    const confidenceCounts = { high: 0, medium: 0, low: 0 }
    for (const iteration of this._iterationFindings) {
      for (const finding of iteration.findings) {
        if (confidenceCounts[finding.confidence] !== undefined) {
          confidenceCounts[finding.confidence]++
        }
      }
    }

    return {
      iterations: this._iterationFindings.length,
      totalChunksAnalyzed,
      totalRelevantChunks,
      totalFindings: this._seenFindings.size,
      confidenceDistribution: confidenceCounts,
      converged: this.checkConvergence()
    }
  }

  /**
   * Reset the aggregator for a new query
   */
  reset() {
    this._iterationFindings = []
    this._seenFindings.clear()
  }

  /**
   * Export results in a structured format
   * @returns {Object} Exportable result object
   */
  export() {
    return {
      summary: this.getStats(),
      findings: this.getAggregatedFindings(),
      groupedFindings: this.getGroupedFindings(),
      suggestedFollowups: this.getSuggestedFollowups(),
      iterations: this._iterationFindings.map(it => ({
        iteration: it.iteration,
        timestamp: it.timestamp,
        chunksAnalyzed: it.chunksAnalyzed,
        relevantChunks: it.relevantChunks,
        newFindings: it.newFindings
      }))
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Normalize a finding into a consistent format
   * @private
   */
  _normalizeFinding(finding, chunkResult) {
    // Handle string findings vs object findings
    const text = typeof finding === 'string' ? finding : (finding.text || finding.content || String(finding))

    return {
      text: text.trim(),
      confidence: chunkResult.confidence || 'medium',
      chunkIndex: chunkResult.chunkIndex,
      chunkId: chunkResult.chunkId,
      keyTerms: chunkResult.keyTerms || [],
      suggestedFollowup: chunkResult.suggestedFollowup,
      timestamp: Date.now()
    }
  }

  /**
   * Generate a hash for deduplication
   * @private
   */
  _hashFinding(finding) {
    // Simple hash based on normalized text
    const normalized = finding.text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    // Use first 100 chars for hashing (captures essence without exact match)
    return normalized.slice(0, 100)
  }

  /**
   * Calculate similarity between two findings (for future use)
   * @private
   */
  _calculateSimilarity(finding1, finding2) {
    const words1 = new Set(finding1.text.toLowerCase().split(/\s+/))
    const words2 = new Set(finding2.text.toLowerCase().split(/\s+/))

    const intersection = new Set([...words1].filter(x => words2.has(x)))
    const union = new Set([...words1, ...words2])

    return intersection.size / union.size
  }
}

module.exports = { ResultAggregator, CONFIDENCE_ORDER }
