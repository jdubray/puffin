/**
 * FileSystemLayer
 *
 * Centralized file system operations for branch memory files.
 * Handles reading, writing (atomically), listing, and deleting
 * branch memory markdown files.
 *
 * @module file-system-layer
 */

const fs = require('fs').promises
const path = require('path')
const branchTemplate = require('./branch-template.js')

/**
 * Sanitize a branch ID for use as a filename.
 * Replaces any character that is not alphanumeric, hyphen, or underscore.
 * @param {string} branchId
 * @returns {string} Safe filename (without extension)
 */
function sanitizeBranchId(branchId) {
  return branchId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

class FileSystemLayer {
  /**
   * @param {string} basePath - Absolute path to .puffin/memory/
   */
  constructor(basePath) {
    this.basePath = basePath
    this.branchesDir = path.join(basePath, 'branches')
  }

  /**
   * Get the file path for a branch memory file
   * @param {string} branchId
   * @returns {string}
   */
  branchPath(branchId) {
    return path.join(this.branchesDir, `${sanitizeBranchId(branchId)}.md`)
  }

  /**
   * Read and parse a branch memory file
   * @param {string} branchId
   * @returns {Promise<{ exists: boolean, parsed: Object|null, raw: string|null }>}
   */
  async readBranch(branchId) {
    const filePath = this.branchPath(branchId)
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      return { exists: true, parsed: branchTemplate.parse(raw), raw }
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { exists: false, parsed: null, raw: null }
      }
      throw err
    }
  }

  /**
   * Write a branch memory file atomically (write to .tmp then rename)
   * @param {string} branchId
   * @param {string} markdownContent - Full markdown content to write
   * @returns {Promise<void>}
   */
  async writeBranch(branchId, markdownContent) {
    const filePath = this.branchPath(branchId)
    const tmpPath = filePath + '.tmp'

    await fs.mkdir(this.branchesDir, { recursive: true })
    await fs.writeFile(tmpPath, markdownContent, 'utf-8')

    try {
      await fs.rename(tmpPath, filePath)
    } catch (err) {
      // Cleanup tmp on failure
      try { await fs.unlink(tmpPath) } catch (_) { /* ignore */ }
      throw err
    }
  }

  /**
   * Write a branch memory file using structured section data
   * @param {string} branchId
   * @param {Object} sections - Map of section ID to string array
   * @returns {Promise<void>}
   */
  async writeBranchSections(branchId, sections) {
    const markdown = branchTemplate.generate(branchId, {
      facts: sections.facts || sections['facts'] || [],
      architecturalDecisions: sections['architectural-decisions'] || [],
      conventions: sections.conventions || sections['conventions'] || [],
      bugPatterns: sections['bug-patterns'] || []
    })
    await this.writeBranch(branchId, markdown)
  }

  /**
   * List all branch memory files
   * @returns {Promise<string[]>} Array of branch IDs (derived from filenames)
   */
  async listBranches() {
    try {
      const files = await fs.readdir(this.branchesDir)
      return files
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace(/\.md$/, ''))
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  /**
   * Delete a branch memory file
   * @param {string} branchId
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteBranch(branchId) {
    try {
      await fs.unlink(this.branchPath(branchId))
      return true
    } catch (err) {
      if (err.code === 'ENOENT') return false
      throw err
    }
  }

  /**
   * Check if a branch memory file exists
   * @param {string} branchId
   * @returns {Promise<boolean>}
   */
  async branchExists(branchId) {
    try {
      await fs.access(this.branchPath(branchId))
      return true
    } catch {
      return false
    }
  }

  /**
   * Read a JSON file from the base memory directory
   * @param {string} filename - e.g. 'maintenance-log.json'
   * @returns {Promise<Object|null>} Parsed JSON or null if not found
   */
  async readJson(filename) {
    try {
      const raw = await fs.readFile(path.join(this.basePath, filename), 'utf-8')
      return JSON.parse(raw)
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }
  }

  /**
   * Write a JSON file atomically to the base memory directory
   * @param {string} filename
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async writeJson(filename, data) {
    const filePath = path.join(this.basePath, filename)
    const tmpPath = filePath + '.tmp'

    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8')

    try {
      await fs.rename(tmpPath, filePath)
    } catch (err) {
      try { await fs.unlink(tmpPath) } catch (_) { /* ignore */ }
      throw err
    }
  }
}

module.exports = { FileSystemLayer, sanitizeBranchId }
