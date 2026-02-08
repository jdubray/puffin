/**
 * h-DSL Viewer Plugin — Entry Point
 *
 * Provides read access to h-DSL schema, code model instance, and
 * annotation files produced by the h-DSL Engine. Integrates into
 * Puffin's plugin system with standard lifecycle hooks and IPC
 * channels for the renderer's visualizer component.
 *
 * IPC Channels (auto-prefixed as plugin:hdsl-viewer-plugin:*):
 *   getSchema      — return the current h-DSL schema
 *   getInstance    — return the current code model instance
 *   getAnnotations — list all available .an.md annotation files
 *   getAnnotation  — return a single annotation file's content
 */

'use strict'

const fs = require('fs').promises
const path = require('path')

/**
 * Resolve the CRE data directory for the current project.
 * @param {string} projectPath - Absolute project root.
 * @returns {string}
 */
function creDir(projectPath) {
  return path.join(projectPath, '.puffin', 'cre')
}

const HdslViewerPlugin = {
  /** @type {Object|null} Plugin context provided by Puffin. */
  context: null,

  /** @type {string|null} Resolved path to .puffin/cre/ directory. */
  _creDir: null,

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Activate the plugin — called by Puffin's plugin loader.
   * @param {Object} context - Plugin context (logger, services, IPC, storage).
   */
  async activate(context) {
    this.context = context
    const logger = context.log || console

    this._creDir = creDir(context.projectPath)

    // Register IPC handlers for renderer communication
    context.registerIpcHandler('getSchema', this.getSchema.bind(this))
    context.registerIpcHandler('getInstance', this.getInstance.bind(this))
    context.registerIpcHandler('getAnnotations', this.getAnnotations.bind(this))
    context.registerIpcHandler('getAnnotation', this.getAnnotation.bind(this))

    // Register actions for programmatic access from other plugins
    context.registerAction('getSchema', this.getSchema.bind(this))
    context.registerAction('getInstance', this.getInstance.bind(this))
    context.registerAction('getAnnotations', this.getAnnotations.bind(this))

    logger.info('h-DSL Viewer plugin activated')
  },

  /**
   * Deactivate the plugin — called on shutdown or plugin unload.
   * Context cleanup is handled automatically by Puffin's plugin system.
   */
  async deactivate() {
    const logger = this.context ? this.context.log : console
    this._creDir = null
    logger.info('h-DSL Viewer plugin deactivated')
  },

  // ---------------------------------------------------------------------------
  // IPC Handlers
  // ---------------------------------------------------------------------------

  /**
   * Return the h-DSL schema for the current project.
   * @returns {Promise<Object>} Parsed schema.json contents.
   */
  async getSchema() {
    const schemaPath = path.join(this._creDir, 'schema.json')
    return this._readJson(schemaPath, 'schema')
  },

  /**
   * Return the h-DSL code model instance for the current project.
   * @returns {Promise<Object>} Parsed instance.json contents.
   */
  async getInstance() {
    const instancePath = path.join(this._creDir, 'instance.json')
    return this._readJson(instancePath, 'instance')
  },

  /**
   * List all .an.md annotation files in the annotations directory.
   * @returns {Promise<Array<{path: string, name: string}>>}
   */
  async getAnnotations() {
    const annDir = path.join(this._creDir, 'annotations')
    try {
      const files = await this._walkDir(annDir, '.an.md')
      return files.map(abs => ({
        path: path.relative(annDir, abs).replace(/\\/g, '/'),
        name: path.basename(abs)
      }))
    } catch (err) {
      if (err.code === 'ENOENT') {
        return []
      }
      throw err
    }
  },

  /**
   * Return the content of a single annotation file.
   * @param {Object} args
   * @param {string} args.filePath - Relative path within annotations/.
   * @returns {Promise<{path: string, content: string}>}
   */
  async getAnnotation(args) {
    const { filePath } = args || {}
    if (!filePath) {
      throw new Error('filePath is required')
    }

    const annDir = path.join(this._creDir, 'annotations')
    const resolved = path.resolve(annDir, filePath)

    // Path traversal guard
    if (!resolved.startsWith(path.resolve(annDir))) {
      throw new Error('filePath must be within the annotations directory')
    }

    const content = await fs.readFile(resolved, 'utf-8')
    return { path: filePath, content }
  },

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Read and parse a JSON file, with a descriptive error on failure.
   * @param {string} filePath - Absolute path to JSON file.
   * @param {string} label - Human label for error messages.
   * @returns {Promise<Object>}
   */
  async _readJson(filePath, label) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(raw)
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(
          `No ${label} file found. Run the h-DSL Engine bootstrap first: ` +
          `node h-dsl-engine/hdsl-bootstrap.js --project . --annotate`
        )
      }
      throw new Error(`Failed to read ${label}: ${err.message}`)
    }
  },

  /**
   * Recursively walk a directory and collect files matching an extension.
   * @param {string} dir - Absolute directory path.
   * @param {string} ext - File extension to match (e.g. '.an.md').
   * @returns {Promise<string[]>} Absolute paths.
   */
  async _walkDir(dir, ext) {
    const results = []
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...await this._walkDir(full, ext))
      } else if (entry.name.endsWith(ext)) {
        results.push(full)
      }
    }

    return results
  }
}

module.exports = HdslViewerPlugin
