/**
 * Outcome Lifecycle Storage Layer
 *
 * File-based persistence for lifecycle data using atomic writes.
 * Stores all data in {projectRoot}/.puffin/outcome-lifecycles/lifecycles.json.
 *
 * Follows the memory-plugin pattern: .tmp write + rename for data safety.
 *
 * @module storage
 */

const fs = require('fs').promises
const path = require('path')

/** Storage directory relative to project root */
const STORAGE_DIR = path.join('.puffin', 'outcome-lifecycles')

/** Main data file */
const DATA_FILE = 'lifecycles.json'

/**
 * Default empty data structure
 * @returns {Object}
 */
function createDefaultData() {
  return {
    version: 1,
    lifecycles: []
  }
}

/**
 * Initialize the storage directory and default data file.
 * Safe to call multiple times — never overwrites existing files.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {Promise<{ basePath: string, created: string[] }>}
 */
async function initialize(projectRoot) {
  const basePath = path.join(projectRoot, STORAGE_DIR)
  const dataPath = path.join(basePath, DATA_FILE)
  const created = []

  await fs.mkdir(basePath, { recursive: true })

  if (!await fileExists(dataPath)) {
    await fs.writeFile(
      dataPath,
      JSON.stringify(createDefaultData(), null, 2),
      'utf-8'
    )
    created.push(DATA_FILE)
  }

  if (created.length > 0) {
    console.log('[outcome-lifecycle-plugin] Storage initialized, created:', created.join(', '))
  }

  return { basePath, created }
}

/**
 * Storage class for lifecycle data.
 *
 * Provides atomic read/write for the lifecycles.json data file.
 */
class Storage {
  /**
   * @param {string} basePath - Absolute path to .puffin/outcome-lifecycles/
   */
  constructor(basePath) {
    this.basePath = basePath
    this.dataPath = path.join(basePath, DATA_FILE)
  }

  /**
   * Load all lifecycle data from disk
   *
   * @returns {Promise<Object>} Parsed data or default structure if missing
   */
  async load() {
    try {
      const raw = await fs.readFile(this.dataPath, 'utf-8')
      const data = JSON.parse(raw)
      // Validate basic structure
      if (!data || !Array.isArray(data.lifecycles)) {
        console.warn('[outcome-lifecycle-plugin] Corrupted data file, using defaults')
        return createDefaultData()
      }
      return data
    } catch (err) {
      if (err.code === 'ENOENT') {
        return createDefaultData()
      }
      if (err instanceof SyntaxError) {
        console.error('[outcome-lifecycle-plugin] Malformed JSON in data file, using defaults:', err.message)
        return createDefaultData()
      }
      throw err
    }
  }

  /**
   * Save lifecycle data to disk atomically.
   * Writes to a .tmp file then renames to prevent corruption.
   *
   * @param {Object} data - Full data object to persist
   * @returns {Promise<void>}
   */
  async save(data) {
    const tmpPath = this.dataPath + '.tmp'

    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8')

    try {
      await fs.rename(tmpPath, this.dataPath)
    } catch (err) {
      try { await fs.unlink(tmpPath) } catch (_) { /* ignore cleanup failure */ }
      throw err
    }
  }
}

/**
 * Check if a file exists
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

module.exports = {
  Storage,
  initialize,
  createDefaultData,
  STORAGE_DIR,
  DATA_FILE
}
