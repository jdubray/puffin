/**
 * Document Scanner
 *
 * Scans the docs/ directory and builds a hierarchical tree structure.
 * Provides file content reading with security validation.
 */

const fs = require('fs').promises
const path = require('path')

/**
 * Supported document file extensions
 */
const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml']

/**
 * Supported image file extensions
 */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp']

/**
 * Check if a file extension is an image type
 * @param {string} ext - File extension including dot
 * @returns {boolean}
 */
function isImageExtension(ext) {
  return IMAGE_EXTENSIONS.includes(ext.toLowerCase())
}

/**
 * DocumentScanner - Handles directory scanning and file reading
 */
class DocumentScanner {
  /**
   * @param {string} projectPath - Root project directory
   * @param {Object} logger - Logger instance
   */
  constructor(projectPath, logger) {
    this.projectPath = projectPath
    this.logger = logger || console
    this.docsPath = path.join(projectPath, 'docs')
  }

  /**
   * Get the docs directory path
   * @returns {string}
   */
  getDocsPath() {
    return this.docsPath
  }

  /**
   * Check if docs directory exists
   * @returns {Promise<boolean>}
   */
  async docsDirectoryExists() {
    try {
      const stats = await fs.stat(this.docsPath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * Scan the docs directory and build a tree structure
   * @returns {Promise<Object>} Tree structure with root node
   */
  async scanDirectory() {
    const exists = await this.docsDirectoryExists()

    if (!exists) {
      this.logger.warn('docs/ directory does not exist')
      return {
        root: null,
        exists: false,
        path: this.docsPath
      }
    }

    try {
      const tree = await this.buildTree(this.docsPath, 'docs')
      return {
        root: tree,
        exists: true,
        path: this.docsPath
      }
    } catch (err) {
      this.logger.error(`Failed to scan docs directory: ${err.message}`)
      throw err
    }
  }

  /**
   * Recursively build the directory tree
   * @param {string} dirPath - Current directory path
   * @param {string} name - Display name for this node
   * @returns {Promise<Object>} Tree node
   * @private
   */
  async buildTree(dirPath, name) {
    const stats = await fs.stat(dirPath)

    if (!stats.isDirectory()) {
      // File node
      const ext = path.extname(name).toLowerCase()
      const isImage = isImageExtension(ext)
      return {
        name,
        path: dirPath,
        relativePath: path.relative(this.projectPath, dirPath),
        type: 'file',
        extension: ext,
        isSupported: SUPPORTED_EXTENSIONS.includes(ext) || isImage,
        isImage,
        size: stats.size,
        modified: stats.mtime.toISOString()
      }
    }

    // Directory node
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    // Sort: directories first, then files, alphabetically within each group
    const sortedEntries = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    // Build children recursively
    const children = []
    for (const entry of sortedEntries) {
      // Skip hidden files and directories
      if (entry.name.startsWith('.')) continue

      const childPath = path.join(dirPath, entry.name)
      try {
        const childNode = await this.buildTree(childPath, entry.name)
        children.push(childNode)
      } catch (err) {
        this.logger.warn(`Skipping ${entry.name}: ${err.message}`)
      }
    }

    return {
      name,
      path: dirPath,
      relativePath: path.relative(this.projectPath, dirPath),
      type: 'directory',
      isEmpty: children.length === 0,
      children,
      expanded: name === 'docs' // Root is expanded by default
    }
  }

  /**
   * Validate that a path is within the docs directory (security)
   * @param {string} filePath - Path to validate
   * @returns {boolean}
   * @private
   */
  isPathSafe(filePath) {
    const resolvedPath = path.resolve(filePath)
    const resolvedDocs = path.resolve(this.docsPath)
    return resolvedPath.startsWith(resolvedDocs)
  }

  /**
   * Get the content of a file
   * @param {string} filePath - Absolute or relative path to file
   * @returns {Promise<Object>} File content and metadata
   */
  async getFileContent(filePath) {
    // Resolve the path
    let resolvedPath = filePath
    if (!path.isAbsolute(filePath)) {
      resolvedPath = path.join(this.projectPath, filePath)
    }

    // Security: Validate path is within docs directory
    if (!this.isPathSafe(resolvedPath)) {
      throw new Error('Access denied: Path is outside docs directory')
    }

    try {
      const stats = await fs.stat(resolvedPath)

      if (stats.isDirectory()) {
        throw new Error('Cannot read directory as file')
      }

      const ext = path.extname(resolvedPath).toLowerCase()
      const isImage = isImageExtension(ext)

      // For images, return path info without reading content
      if (isImage) {
        // Check file size (limit to 10MB for images)
        const MAX_IMAGE_SIZE = 10 * 1024 * 1024
        if (stats.size > MAX_IMAGE_SIZE) {
          throw new Error(`Image too large: ${stats.size} bytes (max ${MAX_IMAGE_SIZE})`)
        }

        return {
          content: null,
          path: resolvedPath,
          relativePath: path.relative(this.projectPath, resolvedPath),
          name: path.basename(resolvedPath),
          extension: ext,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          isMarkdown: false,
          isImage: true
        }
      }

      // Check file size (limit to 1MB for text files)
      const MAX_FILE_SIZE = 1024 * 1024
      if (stats.size > MAX_FILE_SIZE) {
        throw new Error(`File too large: ${stats.size} bytes (max ${MAX_FILE_SIZE})`)
      }

      const content = await fs.readFile(resolvedPath, 'utf-8')

      return {
        content,
        path: resolvedPath,
        relativePath: path.relative(this.projectPath, resolvedPath),
        name: path.basename(resolvedPath),
        extension: ext,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        isMarkdown: ext === '.md',
        isImage: false
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`)
      }
      throw err
    }
  }

  /**
   * Get directory statistics
   * @returns {Promise<Object>} Stats about the docs directory
   */
  async getStats() {
    const result = await this.scanDirectory()

    if (!result.exists) {
      return {
        exists: false,
        totalFiles: 0,
        totalDirectories: 0,
        supportedFiles: 0
      }
    }

    let totalFiles = 0
    let totalDirectories = 0
    let supportedFiles = 0

    const countNodes = (node) => {
      if (node.type === 'file') {
        totalFiles++
        if (node.isSupported) supportedFiles++
      } else if (node.type === 'directory') {
        totalDirectories++
        if (node.children) {
          node.children.forEach(countNodes)
        }
      }
    }

    countNodes(result.root)

    return {
      exists: true,
      totalFiles,
      totalDirectories: totalDirectories - 1, // Exclude root
      supportedFiles
    }
  }
}

module.exports = { DocumentScanner, SUPPORTED_EXTENSIONS, IMAGE_EXTENSIONS, isImageExtension }
