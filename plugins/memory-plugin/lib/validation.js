/**
 * Response Validation
 *
 * Validates LLM extraction and evolution responses before storage.
 * Catches malformed JSON, out-of-range confidence values, empty content,
 * and invalid section identifiers.
 *
 * @module validation
 */

const { SECTIONS } = require('./branch-template.js')

const VALID_SECTIONS = new Set(Object.values(SECTIONS))

/**
 * Validate an extraction response from the LLM
 * @param {Object|string} response - Parsed object or raw JSON string
 * @returns {{ valid: boolean, data: Object|null, errors: string[] }}
 */
function validateExtractionResponse(response) {
  const errors = []
  let data = response

  // Parse if string
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (e) {
      return { valid: false, data: null, errors: [`Invalid JSON: ${e.message}`] }
    }
  }

  if (!data || typeof data !== 'object') {
    return { valid: false, data: null, errors: ['Response must be an object'] }
  }

  if (!Array.isArray(data.extractions)) {
    return { valid: false, data: null, errors: ['Missing or invalid "extractions" array'] }
  }

  // Validate each extraction item
  data.extractions.forEach((item, i) => {
    const prefix = `extractions[${i}]`

    if (!item || typeof item !== 'object') {
      errors.push(`${prefix}: must be an object`)
      return
    }

    if (typeof item.content !== 'string' || item.content.trim().length === 0) {
      errors.push(`${prefix}.content: must be a non-empty string`)
    }

    if (!VALID_SECTIONS.has(item.section)) {
      errors.push(`${prefix}.section: "${item.section}" is not a valid section (expected: ${[...VALID_SECTIONS].join(', ')})`)
    }

    if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) {
      errors.push(`${prefix}.confidence: must be a number between 0.0 and 1.0`)
    }
  })

  return { valid: errors.length === 0, data, errors }
}

/**
 * Validate an evolution response from the LLM
 * @param {Object|string} response - Parsed object or raw JSON string
 * @returns {{ valid: boolean, data: Object|null, errors: string[] }}
 */
function validateEvolutionResponse(response) {
  const errors = []
  let data = response

  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (e) {
      return { valid: false, data: null, errors: [`Invalid JSON: ${e.message}`] }
    }
  }

  if (!data || typeof data !== 'object') {
    return { valid: false, data: null, errors: ['Response must be an object'] }
  }

  // Validate sections
  if (!data.sections || typeof data.sections !== 'object') {
    errors.push('Missing or invalid "sections" object')
  } else {
    for (const sectionId of VALID_SECTIONS) {
      const items = data.sections[sectionId]
      if (!Array.isArray(items)) {
        errors.push(`sections["${sectionId}"]: must be an array`)
        continue
      }
      items.forEach((item, i) => {
        if (typeof item !== 'string' || item.trim().length === 0) {
          errors.push(`sections["${sectionId}"][${i}]: must be a non-empty string`)
        }
      })
    }
  }

  // Validate changes array (optional but must be valid if present)
  if (data.changes !== undefined) {
    if (!Array.isArray(data.changes)) {
      errors.push('"changes" must be an array')
    } else {
      const validActions = new Set(['added', 'updated', 'removed', 'kept'])
      data.changes.forEach((c, i) => {
        if (!c || typeof c !== 'object') {
          errors.push(`changes[${i}]: must be an object`)
          return
        }
        if (!validActions.has(c.action)) {
          errors.push(`changes[${i}].action: "${c.action}" is not valid (expected: ${[...validActions].join(', ')})`)
        }
      })
    }
  }

  return { valid: errors.length === 0, data, errors }
}

/**
 * Attempt to extract valid JSON from a raw LLM response that may contain
 * markdown fences or surrounding text
 * @param {string} raw - Raw LLM output
 * @returns {string} Cleaned JSON string
 */
function extractJson(raw) {
  if (!raw || typeof raw !== 'string') return ''

  // Try to find JSON in code fences
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) return fenceMatch[1].trim()

  // Try to find a JSON object directly
  const braceMatch = raw.match(/\{[\s\S]*\}/)
  if (braceMatch) return braceMatch[0].trim()

  return raw.trim()
}

module.exports = {
  VALID_SECTIONS,
  validateExtractionResponse,
  validateEvolutionResponse,
  extractJson
}
