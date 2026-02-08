/**
 * Synthesis Response Validation
 *
 * Validates and extracts JSON from Claude's synthesis response.
 * Ensures the synthesized graph meets structural requirements.
 *
 * @module synthesis-validation
 */

const VALID_STATUSES = ['not_started', 'in_progress', 'achieved']

/**
 * Extract JSON from raw Claude response text.
 * Handles markdown fences, preamble text, and trailing text.
 *
 * @param {string} rawText - Raw Claude CLI output
 * @returns {Object|null} Parsed JSON or null if extraction failed
 */
function extractJson(rawText) {
  if (!rawText || typeof rawText !== 'string') return null

  let text = rawText.trim()

  // Strip markdown fences if present
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) {
    text = fenceMatch[1].trim()
  }

  // Try parsing as-is first
  try {
    return JSON.parse(text)
  } catch (_) {
    // Fall through
  }

  // Try to find JSON object boundaries
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1))
    } catch (_) {
      // Fall through
    }
  }

  return null
}

/**
 * Validate a synthesis response against structural requirements.
 *
 * @param {Object} json - Parsed synthesis response
 * @param {number} lifecycleCount - Total number of granular outcomes
 * @returns {{ valid: boolean, data: Object|null, errors: string[] }}
 */
function validateSynthesis(json, lifecycleCount) {
  const errors = []

  if (!json || typeof json !== 'object') {
    return { valid: false, data: null, errors: ['Response is not a JSON object'] }
  }

  // Validate nodes
  if (!Array.isArray(json.nodes)) {
    errors.push('Missing or invalid "nodes" array')
  } else {
    if (json.nodes.length < 4 || json.nodes.length > 20) {
      errors.push(`Expected 4-20 nodes, got ${json.nodes.length}`)
    }

    const nodeIds = new Set()
    const allAggregates = new Set()

    for (let i = 0; i < json.nodes.length; i++) {
      const node = json.nodes[i]
      const prefix = `nodes[${i}]`

      if (!node.id || typeof node.id !== 'string') {
        errors.push(`${prefix}: missing or invalid "id"`)
      } else if (nodeIds.has(node.id)) {
        errors.push(`${prefix}: duplicate id "${node.id}"`)
      } else {
        nodeIds.add(node.id)
      }

      if (!node.label || typeof node.label !== 'string') {
        errors.push(`${prefix}: missing or invalid "label"`)
      } else if (node.label.length > 40) {
        errors.push(`${prefix}: label too long (${node.label.length} chars, max 40)`)
      }

      if (!VALID_STATUSES.includes(node.status)) {
        errors.push(`${prefix}: invalid status "${node.status}"`)
      }

      if (!Array.isArray(node.aggregates) || node.aggregates.length === 0) {
        errors.push(`${prefix}: missing or empty "aggregates" array`)
      } else {
        for (const idx of node.aggregates) {
          if (typeof idx !== 'number' || idx < 1 || idx > lifecycleCount) {
            errors.push(`${prefix}: aggregate index ${idx} out of range [1, ${lifecycleCount}]`)
          } else {
            allAggregates.add(idx)
          }
        }
      }
    }

    // Validate edges
    if (!Array.isArray(json.edges)) {
      errors.push('Missing or invalid "edges" array')
    } else {
      for (let i = 0; i < json.edges.length; i++) {
        const edge = json.edges[i]
        const prefix = `edges[${i}]`

        if (!edge.from || typeof edge.from !== 'string') {
          errors.push(`${prefix}: missing or invalid "from"`)
        } else if (!nodeIds.has(edge.from)) {
          errors.push(`${prefix}: "from" references unknown node "${edge.from}"`)
        }

        if (!edge.to || typeof edge.to !== 'string') {
          errors.push(`${prefix}: missing or invalid "to"`)
        } else if (!nodeIds.has(edge.to)) {
          errors.push(`${prefix}: "to" references unknown node "${edge.to}"`)
        }

        if (edge.from && edge.to && edge.from === edge.to) {
          errors.push(`${prefix}: self-loop on "${edge.from}"`)
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, data: null, errors }
  }

  return { valid: true, data: json, errors: [] }
}

module.exports = { extractJson, validateSynthesis }
