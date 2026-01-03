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

  /**
   * Move a file or directory to a new location within the docs directory
   * @param {string} sourcePath - Relative or absolute path to source
   * @param {string} targetDir - Relative or absolute path to target directory
   * @returns {Promise<Object>} Result with oldPath, newPath, and success status
   */
  async moveItem(sourcePath, targetDir) {
    // Resolve paths
    let resolvedSource = sourcePath
    if (!path.isAbsolute(sourcePath)) {
      resolvedSource = path.join(this.projectPath, sourcePath)
    }

    let resolvedTarget = targetDir
    if (!path.isAbsolute(targetDir)) {
      resolvedTarget = path.join(this.projectPath, targetDir)
    }

    // Special case: 'docs' or 'docs/' means root docs directory
    if (targetDir === 'docs' || targetDir === 'docs/' || targetDir === '') {
      resolvedTarget = this.docsPath
    }

    // Security: Validate both paths are within docs directory
    if (!this.isPathSafe(resolvedSource)) {
      throw new Error('Access denied: Source path is outside docs directory')
    }
    if (!this.isPathSafe(resolvedTarget) && resolvedTarget !== this.docsPath) {
      throw new Error('Access denied: Target path is outside docs directory')
    }

    // Check source exists
    try {
      await fs.stat(resolvedSource)
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new Error(`Source not found: ${sourcePath}`)
      }
      throw err
    }

    // Get the item name
    const itemName = path.basename(resolvedSource)
    const newPath = path.join(resolvedTarget, itemName)

    // Check if already in target location
    if (path.normalize(resolvedSource) === path.normalize(newPath)) {
      return {
        success: true,
        oldPath: resolvedSource,
        newPath: newPath,
        relativePath: path.relative(this.projectPath, newPath),
        message: 'Item is already in the target location'
      }
    }

    // Check if target already exists
    try {
      await fs.stat(newPath)
      throw new Error(`Target already exists: ${path.basename(newPath)}`)
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err
      }
      // ENOENT is expected - target doesn't exist yet
    }

    // Ensure target directory exists
    await fs.mkdir(resolvedTarget, { recursive: true })

    // Move the item (rename works for both files and directories)
    await fs.rename(resolvedSource, newPath)

    this.logger.info(`Moved ${resolvedSource} to ${newPath}`)

    return {
      success: true,
      oldPath: resolvedSource,
      newPath: newPath,
      relativePath: path.relative(this.projectPath, newPath)
    }
  }

  /**
   * Get list of directories within docs for move targets
   * @returns {Promise<Array>} List of directories with path info
   */
  async listDirectories() {
    const directories = [
      {
        name: 'docs (root)',
        path: this.docsPath,
        relativePath: 'docs',
        isRoot: true
      }
    ]

    const exists = await this.docsDirectoryExists()
    if (!exists) {
      return directories
    }

    // Recursively find all directories
    const scanDirs = async (dirPath, parentRelative) => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const fullPath = path.join(dirPath, entry.name)
            const relativePath = path.join(parentRelative, entry.name)
            directories.push({
              name: entry.name,
              path: fullPath,
              relativePath: relativePath,
              isRoot: false
            })
            // Recurse into subdirectories
            await scanDirs(fullPath, relativePath)
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to scan directory ${dirPath}: ${err.message}`)
      }
    }

    await scanDirs(this.docsPath, 'docs')

    return directories
  }

  /**
   * Create a new directory within docs
   * @param {string} dirPath - Relative path for new directory
   * @returns {Promise<Object>} Result with path and created status
   */
  async createDirectory(dirPath) {
    let resolvedPath = dirPath
    if (!path.isAbsolute(dirPath)) {
      resolvedPath = path.join(this.projectPath, dirPath)
    }

    // Security: Validate path is within docs directory
    if (!this.isPathSafe(resolvedPath)) {
      throw new Error('Access denied: Path is outside docs directory')
    }

    try {
      await fs.mkdir(resolvedPath, { recursive: true })
      this.logger.info(`Created directory: ${resolvedPath}`)
      return {
        success: true,
        path: resolvedPath,
        relativePath: path.relative(this.projectPath, resolvedPath),
        created: true
      }
    } catch (err) {
      if (err.code === 'EEXIST') {
        return {
          success: true,
          path: resolvedPath,
          relativePath: path.relative(this.projectPath, resolvedPath),
          created: false
        }
      }
      throw err
    }
  }
}

module.exports = { DocumentScanner, SUPPORTED_EXTENSIONS, IMAGE_EXTENSIONS, isImageExtension }
