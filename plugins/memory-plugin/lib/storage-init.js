/**
 * Storage Directory Initialization
 *
 * Creates and manages the {projectRoot}/.puffin/memory/ directory structure
 * on first activation. Handles existing directories gracefully.
 *
 * @module storage-init
 */

const fs = require('fs').promises
const path = require('path')
const maintenanceLog = require('./schemas/maintenance-log.js')

/** Default plugin configuration */
const DEFAULT_CONFIG = {
  version: 1,
  enabled: true,
  autoMemorize: false,
  model: 'haiku',
  maxPromptsPerExtraction: 50
}

/**
 * Initialize the memory plugin storage directory structure
 * Creates directories and default files if they do not exist.
 * Safe to call multiple times — never overwrites existing files.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {Promise<{ basePath: string, created: string[] }>} Result with base path and list of created items
 */
async function initialize(projectRoot) {
  const basePath = path.join(projectRoot, '.puffin', 'memory')
  const branchesPath = path.join(basePath, 'branches')
  const configPath = path.join(basePath, 'config.json')
  const logPath = path.join(basePath, 'maintenance-log.json')

  const created = []

  // Create directories
  await fs.mkdir(basePath, { recursive: true })
  await fs.mkdir(branchesPath, { recursive: true })

  // Create config.json if missing
  if (!await fileExists(configPath)) {
    await fs.writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8')
    created.push('config.json')
  }

  // Create maintenance-log.json if missing
  if (!await fileExists(logPath)) {
    await fs.writeFile(logPath, maintenanceLog.serialize(maintenanceLog.createDefault()), 'utf-8')
    created.push('maintenance-log.json')
  }

  if (created.length > 0) {
    console.log('[memory-plugin] Storage initialized, created:', created.join(', '))
  }

  return { basePath, created }
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
  DEFAULT_CONFIG,
  initialize
}
