/**
 * Excalidraw Plugin - Entry Point
 *
 * Provides Excalidraw-based sketching and diagramming capabilities.
 * Designs are stored in .puffin/excalidraw-designs/ as .excalidraw files.
 */

const path = require('path')
const fs = require('fs').promises
const { ExcalidrawStorage } = require('./excalidraw-storage')
const { buildDiagramPrompt, getDiagramTypes, DiagramType } = require('./diagram-prompt-builder')

const ExcalidrawPlugin = {
  context: null,
  storage: null,

  /**
   * Activate the plugin — initializes storage and registers IPC handlers/actions
   * @param {Object} context - Plugin context from PluginManager
   * @param {string} context.projectPath - Absolute path to the project root
   * @param {Object} context.log - Logger instance { info, debug, warn, error }
   * @param {Function} context.registerIpcHandler - Register an IPC handler
   * @param {Function} context.registerAction - Register a programmatic action
   * @returns {Promise<void>}
   * @throws {Error} If projectPath is not provided in context
   */
  async activate(context) {
    this.context = context

    const projectPath = context.projectPath
    if (!projectPath) {
      throw new Error('Excalidraw plugin requires projectPath in context')
    }

    const designsDir = path.join(projectPath, '.puffin', 'excalidraw-designs')
    this.storage = new ExcalidrawStorage(designsDir, context.log)

    await this.storage.ensureDesignsDirectory()

    // Register IPC handlers for renderer communication
    context.registerIpcHandler('saveDesign', this.handleSaveDesign.bind(this))
    context.registerIpcHandler('loadDesign', this.handleLoadDesign.bind(this))
    context.registerIpcHandler('listDesigns', this.handleListDesigns.bind(this))
    context.registerIpcHandler('updateDesign', this.handleUpdateDesign.bind(this))
    context.registerIpcHandler('deleteDesign', this.handleDeleteDesign.bind(this))
    context.registerIpcHandler('renameDesign', this.handleRenameDesign.bind(this))
    context.registerIpcHandler('checkNameUnique', this.handleCheckNameUnique.bind(this))
    context.registerIpcHandler('exportDesign', this.handleExportDesign.bind(this))
    context.registerIpcHandler('importDesign', this.handleImportDesign.bind(this))
    context.registerIpcHandler('buildDiagramPrompt', this.handleBuildDiagramPrompt.bind(this))
    context.registerIpcHandler('getDiagramTypes', this.handleGetDiagramTypes.bind(this))
    context.registerIpcHandler('generateDiagram', this.handleGenerateDiagram.bind(this))
    context.registerIpcHandler('listMarkdownFiles', this.handleListMarkdownFiles.bind(this))

    // Register actions for programmatic access
    context.registerAction('saveDesign', this.saveDesign.bind(this))
    context.registerAction('loadDesign', this.loadDesign.bind(this))
    context.registerAction('listDesigns', this.listDesigns.bind(this))
    context.registerAction('deleteDesign', this.deleteDesign.bind(this))

    context.log.info('Excalidraw plugin activated')
    context.log.debug(`Designs directory: ${this.storage.designsDir}`)
  },

  /**
   * Deactivate the plugin — cleans up storage reference
   * @returns {Promise<void>}
   */
  async deactivate() {
    if (!this.context) return
    this.storage = null
    this.context.log.info('Excalidraw plugin deactivated')
    this.context = null
  },

  // ============ Core API Methods ============

  /**
   * Save a new design
   * @param {Object} options - Save options
   * @param {string} options.name - Design name
   * @param {Object} options.sceneData - Excalidraw scene data { elements, appState, files }
   * @param {Object} [options.metadata] - Optional metadata { description, thumbnailData }
   * @returns {Promise<{filename: string, design: Object}>} Saved filename and design metadata
   * @throws {Error} If name is empty or sceneData is invalid
   * @throws {DuplicateNameError} If a design with the same name already exists
   */
  async saveDesign(options) {
    const { name, sceneData, metadata } = options
    return this.storage.saveDesign(name, sceneData, metadata)
  },

  /**
   * Load a design by filename
   * @param {string} filename - Design filename (e.g., 'my_design.excalidraw')
   * @returns {Promise<{scene: Object, meta: Object}>} Scene data and metadata
   * @throws {Error} If design is not found or filename is invalid
   */
  async loadDesign(filename) {
    return this.storage.loadDesign(filename)
  },

  /**
   * List all saved designs with metadata
   * @returns {Promise<Array<{filename: string, id: string, name: string, description: string, elementCount: number, metadata: Object, thumbnailData: string|null}>>}
   */
  async listDesigns() {
    return this.storage.listDesigns()
  },

  /**
   * Update an existing design
   * @param {string} filename - Design filename
   * @param {Object} updates - Partial updates { sceneData?, name?, description?, thumbnailData? }
   * @returns {Promise<{scene: Object, meta: Object}>} Updated scene and metadata
   * @throws {Error} If design is not found
   */
  async updateDesign(filename, updates) {
    return this.storage.updateDesign(filename, updates)
  },

  /**
   * Delete a design (removes both .excalidraw and .meta.json files)
   * @param {string} filename - Design filename
   * @returns {Promise<boolean>} True if deleted successfully
   * @throws {Error} If design is not found
   */
  async deleteDesign(filename) {
    return this.storage.deleteDesign(filename)
  },

  /**
   * Rename a design (changes name, filename, and both files)
   * @param {string} oldFilename - Current filename
   * @param {string} newName - New design name
   * @returns {Promise<{oldFilename: string, newFilename: string, design: Object}>}
   * @throws {Error} If design is not found or new name is empty
   * @throws {DuplicateNameError} If new name conflicts with an existing design
   */
  async renameDesign(oldFilename, newName) {
    return this.storage.renameDesign(oldFilename, newName)
  },

  /**
   * Check if a design name is unique
   * @param {string} name - Name to check
   * @param {string} [excludeFilename] - Filename to exclude from check (for rename)
   * @returns {Promise<boolean>} True if name is available
   */
  async checkNameUnique(name, excludeFilename) {
    return this.storage.isNameUnique(name, excludeFilename)
  },

  /**
   * Export a design as a portable JSON string
   * @param {string} filename - Design filename
   * @returns {Promise<string>} JSON string containing scene data and ppiMetadata
   * @throws {Error} If design is not found
   */
  async exportDesign(filename) {
    return this.storage.exportDesign(filename)
  },

  /**
   * Import a design from JSON string
   * @param {string} jsonContent - JSON string of Excalidraw data
   * @param {string} [newName] - Optional new name (overrides embedded name)
   * @returns {Promise<{filename: string, design: Object}>} Imported filename and metadata
   * @throws {DuplicateNameError} If name conflicts with an existing design
   */
  async importDesign(jsonContent, newName) {
    return this.storage.importDesign(jsonContent, newName)
  },

  // ============ IPC Handlers ============

  async handleSaveDesign(options) {
    return this.saveDesign(options)
  },

  async handleLoadDesign(filename) {
    return this.loadDesign(filename)
  },

  async handleListDesigns() {
    return this.listDesigns()
  },

  async handleUpdateDesign({ filename, updates }) {
    return this.updateDesign(filename, updates)
  },

  async handleDeleteDesign(filename) {
    return this.deleteDesign(filename)
  },

  async handleRenameDesign({ oldFilename, newName }) {
    return this.renameDesign(oldFilename, newName)
  },

  async handleCheckNameUnique({ name, excludeFilename }) {
    return this.checkNameUnique(name, excludeFilename)
  },

  async handleExportDesign(filename) {
    return this.exportDesign(filename)
  },

  async handleImportDesign({ jsonContent, newName }) {
    return this.importDesign(jsonContent, newName)
  },

  // ============ Diagram Prompt Builder Handlers ============

  /**
   * Build a diagram generation prompt for a given type and description.
   * @param {Object} params
   * @param {string} params.diagramType - "architecture"|"sequence"|"flowchart"|"component"
   * @param {string} params.description - What the diagram should show
   * @param {string[]} [params.components] - Components/participants/steps
   * @param {string} [params.style] - "clean"|"sketch"
   * @returns {{ system: string, task: string, constraints: string }}
   */
  handleBuildDiagramPrompt({ diagramType, description, components, style }) {
    if (!diagramType || !description) {
      throw new Error('diagramType and description are required')
    }
    return buildDiagramPrompt({ diagramType, description, components, style })
  },

  /**
   * Returns metadata about all supported diagram types.
   * @returns {Array<{type: string, label: string, description: string, icon: string}>}
   */
  handleGetDiagramTypes() {
    return getDiagramTypes()
  },

  // ============ JSON Extraction Utility ============

  /**
   * Extract a JSON object from Claude's response text.
   * Handles: raw JSON, markdown-fenced JSON (```json ... ```), and JSON embedded in text.
   * @param {string} text - Raw response text
   * @param {Object} log - Logger instance
   * @returns {Object|null} Parsed JSON object, or null if extraction fails
   */
  _extractJson(text, log) {
    if (!text || typeof text !== 'string') return null

    const trimmed = text.trim()

    // 1. Try direct parse (response is pure JSON)
    try {
      const obj = JSON.parse(trimmed)
      if (obj && typeof obj === 'object') {
        log.info('[_extractJson] Direct JSON parse succeeded')
        return obj
      }
    } catch { /* not pure JSON */ }

    // 2. Try extracting from markdown code fence: ```json ... ``` or ``` ... ```
    const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
    if (fenceMatch) {
      try {
        const obj = JSON.parse(fenceMatch[1].trim())
        if (obj && typeof obj === 'object') {
          log.info('[_extractJson] Extracted JSON from markdown fence')
          return obj
        }
      } catch { /* fence content wasn't valid JSON */ }
    }

    // 3. Try finding the outermost { ... } containing "elements"
    const firstBrace = trimmed.indexOf('{')
    const lastBrace = trimmed.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = trimmed.substring(firstBrace, lastBrace + 1)
      try {
        const obj = JSON.parse(candidate)
        if (obj && typeof obj === 'object' && obj.elements) {
          log.info('[_extractJson] Extracted JSON from brace boundaries')
          return obj
        }
      } catch { /* not valid JSON between braces */ }
    }

    log.error('[_extractJson] All extraction methods failed')
    return null
  },

  // ============ Markdown File Listing ============

  /**
   * Recursively list markdown files in the project directory.
   * Returns file metadata for display in the document selection modal.
   *
   * @param {Object} [params]
   * @param {string} [params.subdir] - Subdirectory to scan (default: scans common doc locations)
   * @returns {Promise<Array<{relativePath: string, name: string, dir: string, size: number, modifiedAt: string}>>}
   */
  async handleListMarkdownFiles(params = {}) {
    const projectRoot = this.context.projectPath
    const log = this.context.log
    const results = []

    /**
     * Recursively scan a directory for .md files
     * @param {string} dir - Absolute directory path
     * @param {string} relativeBase - Relative path from project root
     */
    const scanDir = async (dir, relativeBase) => {
      let entries
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return // Directory doesn't exist or not readable
      }

      for (const entry of entries) {
        // Skip hidden dirs, node_modules, .git, .puffin
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

        const fullPath = path.join(dir, entry.name)
        const relativePath = path.join(relativeBase, entry.name)

        if (entry.isDirectory()) {
          // When scanning root (relativeBase === ''), skip common doc dirs since they're scanned explicitly
          const isRootScan = relativeBase === '' || relativeBase === '.'
          const isCommonDocDir = ['docs', 'doc', 'documentation'].includes(entry.name)
          if (isRootScan && isCommonDocDir) continue

          await scanDir(fullPath, relativePath)
        } else if (entry.isFile() && /\.(md|markdown|mdx)$/i.test(entry.name)) {
          try {
            const stat = await fs.stat(fullPath)
            results.push({
              relativePath: relativePath.replace(/\\/g, '/'),
              name: entry.name,
              dir: relativeBase.replace(/\\/g, '/') || '.',
              size: stat.size,
              modifiedAt: stat.mtime.toISOString()
            })
          } catch {
            // Skip files we can't stat
          }
        }
      }
    }

    if (params.subdir) {
      // Scan a specific subdirectory
      const targetDir = path.join(projectRoot, params.subdir)
      const normalizedTarget = path.resolve(targetDir)
      const normalizedRoot = path.resolve(projectRoot)
      if (!normalizedTarget.startsWith(normalizedRoot)) {
        throw new Error('subdir must be within the project directory')
      }
      await scanDir(targetDir, params.subdir)
    } else {
      // Scan common doc directories + project root .md files
      const dirsToScan = ['docs', 'doc', 'documentation']
      for (const dir of dirsToScan) {
        await scanDir(path.join(projectRoot, dir), dir)
      }
      // Also scan root-level .md files (README.md, CHANGELOG.md, etc.)
      await scanDir(projectRoot, '')
    }

    log.debug(`[listMarkdownFiles] Found ${results.length} markdown files`)

    // Sort: directories first (docs/), then alphabetically by path
    results.sort((a, b) => a.relativePath.localeCompare(b.relativePath))

    return results
  },

  // ============ Doc-to-Diagram Generation Handler ============

  /**
   * Read a markdown document and generate Excalidraw elements via Claude.
   *
   * @param {Object} params
   * @param {string} params.docPath - Path to the markdown file (relative to project root or absolute)
   * @param {string} params.diagramType - One of "architecture"|"sequence"|"flowchart"|"component"
   * @param {string} [params.customPrompt] - Optional additional instructions to append
   * @returns {Promise<{success: boolean, elements: Array|null, appState: Object|null, error: string|null}>}
   */
  async handleGenerateDiagram({ docPath, diagramType, customPrompt }) {
    const log = this.context.log

    // Validate required params
    if (!docPath) {
      throw new Error('docPath is required')
    }
    if (!diagramType) {
      throw new Error('diagramType is required')
    }

    // Validate diagram type (optional — if not provided, AI auto-detects from document)
    const validTypes = Object.values(DiagramType)
    if (diagramType && !validTypes.includes(diagramType)) {
      throw new Error(`Invalid diagramType "${diagramType}". Supported: ${validTypes.join(', ')}, or omit for auto-detection`)
    }

    // Resolve doc path (relative to project root or absolute)
    const projectRoot = this.context.projectPath
    const resolvedPath = path.isAbsolute(docPath)
      ? docPath
      : path.join(projectRoot, docPath)

    // Validate the resolved path stays within the project
    const normalizedPath = path.resolve(resolvedPath)
    const normalizedRoot = path.resolve(projectRoot)
    if (!normalizedPath.startsWith(normalizedRoot)) {
      throw new Error('docPath must be within the project directory')
    }

    // Read the markdown file
    log.info(`[generateDiagram] Reading document: ${normalizedPath}`)
    let docContent
    try {
      docContent = await fs.readFile(normalizedPath, 'utf-8')
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`Document not found: ${docPath}`)
      }
      throw new Error(`Failed to read document: ${err.message}`)
    }

    if (!docContent.trim()) {
      throw new Error(`Document is empty: ${docPath}`)
    }

    // Enforce size limit to prevent token exhaustion and reduce prompt injection surface
    const MAX_DOC_SIZE = 50 * 1024 // 50 KB
    if (docContent.length > MAX_DOC_SIZE) {
      log.warn(`[generateDiagram] Document too large (${(docContent.length / 1024).toFixed(1)} KB), truncating to ${MAX_DOC_SIZE / 1024} KB`)
      docContent = docContent.substring(0, MAX_DOC_SIZE) + '\n\n[... document truncated due to size ...]'
    }

    // Get claudeService from plugin context services
    const claudeService = this.context.getService('claudeService')
    if (!claudeService) {
      throw new Error('Claude service is not available')
    }

    // Build the diagram prompt — document content is wrapped between clear delimiters
    // to reduce prompt injection risk from document contents
    const description = `Generate a diagram based on the following markdown document.

CRITICAL INSTRUCTION: If there is already one or more ASCII diagrams in the document, replicate the diagram exactly as shown. Do NOT add any new boxes, arrows, labels, legends, or any other artifacts that are not present in the ASCII diagram itself. Only convert what is explicitly shown in the ASCII art — nothing more.

--- BEGIN DOCUMENT ---
${docContent}
--- END DOCUMENT ---`
      + (customPrompt ? `\n\nADDITIONAL INSTRUCTIONS:\n${customPrompt}` : '')

    // If no diagram type specified, use generic architecture prompt (most flexible)
    const effectiveDiagramType = diagramType || DiagramType.ARCHITECTURE
    const promptParts = buildDiagramPrompt({ diagramType: effectiveDiagramType, description })
    const fullPrompt = `${promptParts.system}\n\n${promptParts.task}\n\n${promptParts.constraints}`

    // Call Claude to generate the diagram
    // NOTE: We intentionally do NOT use --json-schema here because:
    // 1. The schema string is too large for Windows CLI args (cmd.exe mangles quotes)
    // 2. It causes intermittent "unexpected response format" errors
    // 3. The prompt already instructs Claude to output only JSON
    // Instead, we use maxTurns: 1 + disableTools and parse the raw text response.
    log.info(`[generateDiagram] Sending ${diagramType} diagram request to Claude (timeout: 120s)`)
    const startTime = Date.now()
    let result
    try {
      result = await claudeService.sendPrompt(fullPrompt, {
        model: 'sonnet',
        maxTurns: 1,
        timeout: 120000,
        disableTools: true
      })
    } catch (err) {
      const elapsedSec = (Date.now() - startTime) / 1000
      const elapsedStr = elapsedSec.toFixed(1)
      log.error(`[generateDiagram] Claude API error after ${elapsedStr}s: ${err.message}`)

      // Classify timeout vs other errors
      const msg = err.message || ''
      if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('timed out') || elapsedSec >= 115) {
        throw new Error(`Generation timed out after ${elapsedStr}s — the document may be too large or complex`)
      }
      throw new Error(`Diagram generation failed: ${err.message}`)
    }

    const elapsedStr = ((Date.now() - startTime) / 1000).toFixed(1)
    log.info(`[generateDiagram] Claude responded in ${elapsedStr}s`)

    if (!result.success) {
      log.error(`[generateDiagram] Claude returned error after ${elapsedStr}s: ${result.error}`)
      throw new Error(`Diagram generation failed: ${result.error}`)
    }

    // Parse the response — may be raw JSON, or text with embedded JSON (markdown fences, etc.)
    let parsed
    const responseStr = typeof result.response === 'string' ? result.response : JSON.stringify(result.response)
    log.info(`[generateDiagram] Raw response length: ${responseStr.length} chars`)
    log.info(`[generateDiagram] Raw response preview (first 300 chars): ${responseStr.substring(0, 300)}`)

    if (typeof result.response === 'object' && result.response !== null) {
      // Already parsed (e.g. from StructuredOutput)
      parsed = result.response
    } else {
      parsed = this._extractJson(result.response, log)
    }

    if (!parsed) {
      const preview = responseStr.substring(0, 300)
      log.error(`[generateDiagram] Could not extract JSON from response: ${preview}`)
      console.error('[generateDiagram] Could not extract JSON. Preview:', preview)
      throw new Error('Claude returned an unexpected response format. Try again — results may vary.')
    }

    const elements = parsed.elements || []
    const appState = parsed.appState || { viewBackgroundColor: '#ffffff' }

    log.info(`[generateDiagram] Generated ${elements.length} elements for ${diagramType} diagram`)

    return {
      success: true,
      elements,
      appState,
      error: null
    }
  }
}

module.exports = ExcalidrawPlugin
