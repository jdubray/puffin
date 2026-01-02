/**
 * Claude Config Service
 *
 * Handles reading and writing CLAUDE.md configuration files.
 * Uses a fixed set of context branches in .claude/ directory.
 */

const fs = require('fs').promises
const path = require('path')
const { getDefaultBranchFocus, getCustomBranchFallback } = require('./branch-defaults')

/**
 * Fixed list of context branches
 * These are the standard branches used in the project
 */
const CONTEXT_BRANCHES = [
  'specifications',
  'architecture',
  'ui',
  'backend',
  'deployment',
  'bug-fixes',
  'code-reviews',
  'improvements',
  'plugin-development',
  'tmp',
  'fullstack'
]

/**
 * Source types for CLAUDE.md content
 */
const ConfigSource = {
  CONTEXT_FILE: 'context-file',
  NEW_FILE: 'new-file',
  NOT_FOUND: 'not-found'
}

/**
 * Extract context name from filename
 * e.g., "CLAUDE_ui.md" -> "ui", "CLAUDE_architecture.md" -> "architecture"
 * @param {string} filename - The filename
 * @returns {string|null} Context name or null
 */
function extractContextName(filename) {
  const match = filename.match(/^CLAUDE_(.+)\.md$/i)
  return match ? match[1] : null
}

/**
 * Format context name for display
 * e.g., "ui" -> "UI", "bug-fixes" -> "Bug Fixes"
 * @param {string} contextName - Raw context name
 * @returns {string} Formatted display name
 */
function formatContextName(contextName) {
  if (!contextName) return ''
  return contextName
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * ClaudeConfig - Manages CLAUDE.md file operations
 */
class ClaudeConfig {
  /**
   * @param {string} projectPath - Path to the project root
   * @param {Object} logger - Logger instance for diagnostics
   */
  constructor(projectPath, logger) {
    this.projectPath = projectPath
    this.logger = logger || console
    this._cachedContent = null
    this._cachedPath = null
    this._cachedContext = null
    this._cacheTime = null
    this._selectedContext = null // Currently selected context file
  }

  /**
   * Get the .claude directory path
   * @returns {string} Path to .claude directory
   */
  getClaudeDir() {
    return path.join(this.projectPath, '.claude')
  }

  /**
   * Get the path for a specific context file
   * @param {string} contextName - Context name (e.g., "ui", "architecture")
   * @returns {string} Full path to the context file
   */
  getContextFilePath(contextName) {
    return path.join(this.getClaudeDir(), `CLAUDE_${contextName}.md`)
  }

  /**
   * List all context files based on fixed branch list
   * Creates empty files for any missing contexts
   * @returns {Promise<Array<{name: string, displayName: string, path: string, exists: boolean}>>}
   */
  async listContextFiles() {
    const claudeDir = this.getClaudeDir()

    // Ensure .claude directory exists
    try {
      await fs.mkdir(claudeDir, { recursive: true })
    } catch (err) {
      if (err.code !== 'EEXIST') {
        this.logger.error(`Failed to create .claude directory: ${err.message}`)
      }
    }

    const files = []

    for (const contextName of CONTEXT_BRANCHES) {
      const filename = `CLAUDE_${contextName}.md`
      const filePath = path.join(claudeDir, filename)
      let exists = false

      try {
        await fs.access(filePath)
        exists = true
      } catch {
        // File doesn't exist - create empty file
        try {
          await fs.writeFile(filePath, '', 'utf-8')
          this.logger.info(`Created empty context file: ${filename}`)
          exists = true
        } catch (writeErr) {
          this.logger.error(`Failed to create ${filename}: ${writeErr.message}`)
        }
      }

      files.push({
        name: contextName,
        displayName: formatContextName(contextName),
        path: filePath,
        filename,
        exists
      })
    }

    this.logger.debug(`Context files ready: ${files.length} branches`)
    return files
  }

  /**
   * Set the currently selected context
   * @param {string} contextName - Context name to select
   */
  setSelectedContext(contextName) {
    this._selectedContext = contextName
    this.invalidateCache()
  }

  /**
   * Get the currently selected context
   * @returns {string|null}
   */
  getSelectedContext() {
    return this._selectedContext
  }

  /**
   * Find the config file for the selected context
   * @returns {Promise<{path: string|null, source: string, contextName: string|null}>}
   */
  async findConfigFile() {
    // If a context is selected, use that
    if (this._selectedContext) {
      const contextPath = this.getContextFilePath(this._selectedContext)
      // File should always exist since listContextFiles creates missing ones
      return {
        path: contextPath,
        source: ConfigSource.CONTEXT_FILE,
        contextName: this._selectedContext
      }
    }

    // No context selected - ensure files exist and default to first
    const files = await this.listContextFiles()
    if (files.length > 0) {
      // Default to first file (specifications)
      const defaultFile = files[0]
      this._selectedContext = defaultFile.name
      return {
        path: defaultFile.path,
        source: ConfigSource.CONTEXT_FILE,
        contextName: defaultFile.name
      }
    }

    return { path: null, source: ConfigSource.NOT_FOUND, contextName: null }
  }

  /**
   * Get the path where a new context file should be created
   * @param {string} contextName - Context name for the new file
   * @returns {string} Path for new file
   */
  getDefaultConfigPath(contextName) {
    return this.getContextFilePath(contextName || 'default')
  }

  /**
   * Generate default content for a new context file
   * @param {string} contextName - The context name (e.g., "ui", "architecture")
   * @returns {string} Default content for new file
   */
  generateDefaultContent(contextName) {
    const displayName = formatContextName(contextName) || 'Default'
    return `# Context: ${displayName}

This file contains context for Claude Code specific to ${displayName} work.

## Overview

Add your context-specific instructions, guidelines, and information here.

## Focus Areas

- Define what this context focuses on
- List key concerns and priorities
- Include any context-specific conventions

---

*This file was auto-generated. Edit it to provide context for Claude Code.*
`
  }

  /**
   * Read the CLAUDE.md content for the selected context
   * @param {Object} [options] - Read options
   * @param {boolean} [options.useCache=false] - Use cached content if available
   * @param {number} [options.cacheMaxAge=5000] - Max age of cache in ms
   * @param {string} [options.contextName] - Specific context to read (overrides selected)
   * @returns {Promise<{content: string, path: string, exists: boolean, source: string, contextName: string|null}>}
   */
  async readConfig(options = {}) {
    const { useCache = false, cacheMaxAge = 5000, contextName } = options

    // If specific context requested, select it
    if (contextName && contextName !== this._selectedContext) {
      this.setSelectedContext(contextName)
    }

    // Check cache validity
    if (useCache && this._cachedContent !== null && this._cacheTime) {
      const age = Date.now() - this._cacheTime
      if (age < cacheMaxAge && this._cachedContext === this._selectedContext) {
        return {
          content: this._cachedContent,
          path: this._cachedPath,
          exists: true,
          cached: true,
          source: ConfigSource.CONTEXT_FILE,
          contextName: this._cachedContext
        }
      }
    }

    const { path: configPath, source, contextName: foundContext } = await this.findConfigFile()

    if (!configPath || source === ConfigSource.NOT_FOUND) {
      return {
        content: '',
        path: null,
        exists: false,
        cached: false,
        source: ConfigSource.NOT_FOUND,
        contextName: null
      }
    }

    try {
      const content = await fs.readFile(configPath, 'utf-8')

      // Update cache
      this._cachedContent = content
      this._cachedPath = configPath
      this._cachedContext = foundContext
      this._cacheTime = Date.now()

      return {
        content,
        path: configPath,
        exists: true,
        cached: false,
        source,
        contextName: foundContext,
        isEmpty: content.trim() === ''
      }
    } catch (err) {
      this.logger.error(`Failed to read context file: ${err.message}`)
      throw err
    }
  }

  /**
   * Write content to the selected context file
   * @param {string} content - New content to write
   * @param {Object} [options] - Write options
   * @param {string} [options.path] - Specific path to write to
   * @param {string} [options.contextName] - Context to write to (creates if needed)
   * @param {boolean} [options.createDir=true] - Create parent directory if needed
   * @returns {Promise<{path: string, created: boolean}>}
   */
  async writeConfig(content, options = {}) {
    const { createDir = true, contextName } = options
    let targetPath = options.path

    if (!targetPath) {
      if (contextName) {
        targetPath = this.getContextFilePath(contextName)
        this._selectedContext = contextName
      } else {
        const { path: existingPath, contextName: foundContext } = await this.findConfigFile()
        targetPath = existingPath || this.getDefaultConfigPath(this._selectedContext)
        this._cachedContext = foundContext
      }
    }

    // Ensure parent directory exists
    if (createDir) {
      const dir = path.dirname(targetPath)
      await fs.mkdir(dir, { recursive: true })
    }

    const existed = await this.fileExists(targetPath)

    await fs.writeFile(targetPath, content, 'utf-8')
    this.logger.info(`Wrote context file to: ${targetPath}`)

    // Update cache
    this._cachedContent = content
    this._cachedPath = targetPath
    this._cacheTime = Date.now()

    return {
      path: targetPath,
      created: !existed
    }
  }

  /**
   * Check if a file exists
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>}
   * @private
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get metadata about the selected context file
   * @returns {Promise<Object>} File metadata including stats
   */
  async getConfigMetadata() {
    const { path: configPath, source, contextName } = await this.findConfigFile()

    if (!configPath || source === ConfigSource.NOT_FOUND) {
      return {
        exists: false,
        path: null,
        size: 0,
        lastModified: null,
        source,
        contextName
      }
    }

    // For NEW_FILE source, file doesn't exist yet
    if (source === ConfigSource.NEW_FILE) {
      return {
        exists: false,
        path: configPath,
        size: 0,
        lastModified: null,
        source,
        contextName,
        willCreate: true
      }
    }

    try {
      const stats = await fs.stat(configPath)
      return {
        exists: true,
        path: configPath,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        relativePath: path.relative(this.projectPath, configPath),
        source,
        contextName
      }
    } catch (err) {
      this.logger.error(`Failed to get context file metadata: ${err.message}`)
      throw err
    }
  }

  /**
   * Invalidate the cached content
   */
  invalidateCache() {
    this._cachedContent = null
    this._cachedPath = null
    this._cachedContext = null
    this._cacheTime = null
    this.logger.debug('Cache invalidated')
  }

  /**
   * Get config with full context including available files list
   * @param {Object} [options] - Read options
   * @returns {Promise<Object>} Config with context list
   */
  async getConfigWithContext(options = {}) {
    const [configResult, contextFiles] = await Promise.all([
      this.readConfig(options),
      this.listContextFiles()
    ])

    return {
      ...configResult,
      contextFiles,
      selectedContext: this._selectedContext
    }
  }

  /**
   * Get the branch focus content for a specific branch
   * Reads from CLAUDE_{branch}.md file, extracts Branch Focus section,
   * or falls back to defaults if empty/missing
   *
   * @param {string} branchId - The branch identifier (e.g., "ui", "specifications")
   * @param {Object} [options] - Options
   * @param {boolean} [options.codeModificationAllowed=true] - For custom branches without defaults
   * @returns {Promise<{focus: string|null, source: 'file'|'default'|'fallback', branchId: string}>}
   */
  async getBranchFocus(branchId, options = {}) {
    const { codeModificationAllowed = true } = options

    if (!branchId) {
      return { focus: null, source: 'none', branchId: null }
    }

    try {
      // Read the branch-specific context file
      const configResult = await this.readConfig({ contextName: branchId })

      if (configResult.exists && configResult.content && !configResult.isEmpty) {
        // Extract the "Branch Focus" section if it exists
        const branchFocusMatch = configResult.content.match(
          /## Branch Focus[:\s]*[^\n]*\n([\s\S]*?)(?=\n## |\n---|\n# |$)/i
        )

        if (branchFocusMatch) {
          const focusContent = branchFocusMatch[0].trim()
          if (focusContent) {
            return {
              focus: focusContent,
              source: 'file',
              branchId,
              path: configResult.path
            }
          }
        }

        // File exists but no Branch Focus section - check for any content
        // that looks like focus instructions (for backwards compatibility)
        const content = configResult.content.trim()
        if (content && !content.startsWith('# Context:')) {
          // Has custom content that's not just the template header
          return {
            focus: content,
            source: 'file',
            branchId,
            path: configResult.path
          }
        }
      }

      // File empty or no focus section - try default
      const defaultFocus = getDefaultBranchFocus(branchId)
      if (defaultFocus) {
        return {
          focus: defaultFocus,
          source: 'default',
          branchId
        }
      }

      // No default - use custom branch fallback
      const fallbackFocus = getCustomBranchFallback(branchId, codeModificationAllowed)
      return {
        focus: fallbackFocus,
        source: 'fallback',
        branchId
      }
    } catch (err) {
      this.logger.warn(`Error reading branch focus for ${branchId}: ${err.message}`)

      // On error, fall back to defaults
      const defaultFocus = getDefaultBranchFocus(branchId)
      if (defaultFocus) {
        return {
          focus: defaultFocus,
          source: 'default',
          branchId
        }
      }

      return {
        focus: getCustomBranchFallback(branchId, codeModificationAllowed),
        source: 'fallback',
        branchId
      }
    }
  }

  /**
   * Watch the CLAUDE.md file for changes
   * @param {Function} callback - Called when file changes
   * @returns {Promise<Function>} Unwatch function
   */
  async watchConfig(callback) {
    const { path: configPath, source } = await this.findConfigFile()

    // Don't watch if no file exists yet (NEW_FILE or NOT_FOUND)
    if (!configPath || source === ConfigSource.NOT_FOUND || source === ConfigSource.NEW_FILE) {
      this.logger.debug('No existing CLAUDE.md to watch')
      return () => {}
    }

    const { watch } = require('fs')
    let debounceTimer = null

    const watcher = watch(configPath, (eventType) => {
      // Debounce rapid changes
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        this.invalidateCache()
        callback(eventType, configPath)
      }, 100)
    })

    this.logger.debug(`Watching context file at: ${configPath}`)

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      watcher.close()
      this.logger.debug('Stopped watching context file')
    }
  }
}

module.exports = { ClaudeConfig, ConfigSource, extractContextName, formatContextName }
