/**
 * Maintenance Log Schema
 *
 * Tracks processing timestamps so startup maintenance knows what work is pending.
 * Stored at {projectRoot}/.puffin/memory/maintenance-log.json
 *
 * @module maintenance-log
 */

/**
 * Create a new maintenance log with default values
 * @returns {Object} Fresh maintenance log
 */
function createDefault() {
  return {
    version: 1,
    lastThreadProcessed: null,
    lastWeeklyConsolidation: null,
    lastMonthlyReindex: null
  }
}

/**
 * Validate a maintenance log object
 * @param {Object} log - Object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate(log) {
  const errors = []

  if (!log || typeof log !== 'object') {
    return { valid: false, errors: ['Maintenance log must be an object'] }
  }

  if (typeof log.version !== 'number') {
    errors.push('version must be a number')
  }

  for (const field of ['lastThreadProcessed', 'lastWeeklyConsolidation', 'lastMonthlyReindex']) {
    const val = log[field]
    if (val !== null && typeof val !== 'string') {
      errors.push(`${field} must be a string (ISO timestamp) or null`)
    } else if (typeof val === 'string' && isNaN(Date.parse(val))) {
      errors.push(`${field} is not a valid ISO timestamp`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Serialize a maintenance log to JSON string
 * @param {Object} log
 * @returns {string}
 */
function serialize(log) {
  return JSON.stringify(log, null, 2)
}

/**
 * Deserialize a JSON string to a maintenance log, with fallback to defaults
 * @param {string} json - Raw JSON string
 * @returns {Object} Parsed and validated maintenance log
 */
function deserialize(json) {
  try {
    const parsed = JSON.parse(json)
    const result = validate(parsed)
    if (result.valid) return parsed
    // Return defaults if invalid
    console.warn('[maintenance-log] Invalid log, using defaults:', result.errors)
    return createDefault()
  } catch (err) {
    console.warn('[maintenance-log] Failed to parse JSON, using defaults:', err.message)
    return createDefault()
  }
}

/**
 * Update a timestamp field to now
 * @param {Object} log - Maintenance log to update
 * @param {'lastThreadProcessed'|'lastWeeklyConsolidation'|'lastMonthlyReindex'} field
 * @returns {Object} Updated log (mutates and returns the same object)
 */
function touch(log, field) {
  if (!['lastThreadProcessed', 'lastWeeklyConsolidation', 'lastMonthlyReindex'].includes(field)) {
    throw new Error(`Unknown maintenance log field: ${field}`)
  }
  log[field] = new Date().toISOString()
  return log
}

/**
 * Check if a maintenance task is due based on its interval
 * @param {Object} log - Maintenance log
 * @param {'lastThreadProcessed'|'lastWeeklyConsolidation'|'lastMonthlyReindex'} field
 * @param {number} intervalMs - Interval in milliseconds
 * @returns {boolean} True if the task is due (never run or interval elapsed)
 */
function isDue(log, field, intervalMs) {
  const timestamp = log[field]
  if (!timestamp) return true
  const elapsed = Date.now() - new Date(timestamp).getTime()
  return elapsed >= intervalMs
}

module.exports = {
  createDefault,
  validate,
  serialize,
  deserialize,
  touch,
  isDue
}
