/**
 * Document Editor Plugin - Entry Point
 * Text document editor with syntax highlighting and AI assistance
 */

const fs = require('fs').promises
const path = require('path')

/**
 * Supported file extensions for the document editor
 */
const SUPPORTED_EXTENSIONS = [
  '.md', '.txt', '.js', '.ts', '.jsx', '.tsx',
  '.html', '.css', '.scss', '.json', '.yaml', '.yml',
  '.xml', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h',
  '.sh', '.bash', '.zsh', '.ps1', '.bat', '.sql', '.graphql'
]

/**
 * File type filters for open/save dialogs
 */
const FILE_FILTERS = [
  { name: 'Text Files', extensions: ['txt', 'md'] },
  { name: 'JavaScript/TypeScript', extensions: ['js', 'ts', 'jsx', 'tsx'] },
  { name: 'Web Files', extensions: ['html', 'css', 'scss', 'json'] },
  { name: 'Config Files', extensions: ['yaml', 'yml', 'xml'] },
  { name: 'Programming', extensions: ['py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h'] },
  { name: 'Shell Scripts', extensions: ['sh', 'bash', 'zsh', 'ps1', 'bat'] },
  { name: 'Data Files', extensions: ['sql', 'graphql'] },
  { name: 'All Files', extensions: ['*'] }
]

/**
 * Maximum number of recent files to track
 */
const MAX_RECENT_FILES = 10

/**
 * Maximum number of concurrent file watchers
 */
const MAX_FILE_WATCHERS = 20

/**
 * Validate that a file path is within allowed directories
 * Prevents path traversal attacks by ensuring paths are within safe boundaries
 * @param {string} filePath - Path to validate
 * @param {string[]} allowedBasePaths - Array of allowed base directories
 * @returns {Object} Validation result with isValid boolean and error message if invalid
 */
function validateFilePath(filePath, allowedBasePaths = []) {
  if (!filePath || typeof filePath !== 'string') {
    return { isValid: false, error: 'Invalid file path' }
  }

  // Resolve to absolute path to normalize .. and . segments
  const resolvedPath = path.resolve(filePath)

  // Check for null bytes (common path traversal technique)
  if (filePath.includes('\0') || resolvedPath.includes('\0')) {
    return { isValid: false, error: 'Invalid characters in file path' }
  }

  // If no allowed paths specified, reject (fail-safe)
  if (!allowedBasePaths || allowedBasePaths.length === 0) {
    return { isValid: false, error: 'No allowed directories configured' }
  }

  // Check if resolved path starts with any allowed base path
  const isWithinAllowed = allowedBasePaths.some(basePath => {
    const resolvedBase = path.resolve(basePath)
    // Ensure proper directory boundary check (prevent /home/user matching /home/username)
    return resolvedPath === resolvedBase || resolvedPath.startsWith(resolvedBase + path.sep)
  })

  if (!isWithinAllowed) {
    return { isValid: false, error: 'File path is outside allowed directories' }
  }

  return { isValid: true, resolvedPath }
}

const DocumentEditorPlugin = {
  name: 'document-editor-plugin',
  context: null,
  recentFiles: [],
  fileWatchers: new Map(),
  recentFilesPath: null,
  allowedBasePaths: [],
  harnessConfig: null,

  /**
   * Activate the plugin
   * @param {Object} context - Plugin context provided by Puffin
   */
  async activate(context) {
    this.context = context

    // Initialize recent files storage path in plugin-specific subdirectory
    const { app } = require('electron')
    const userDataPath = app.getPath('userData')
    const pluginDataPath = path.join(userDataPath, 'puffin-plugins', 'document-editor')

    // Ensure plugin data directory exists
    await fs.mkdir(pluginDataPath, { recursive: true })

    this.recentFilesPath = path.join(pluginDataPath, 'recent-files.json')

    // Initialize allowed base paths for file operations
    // Allow user's home directory and the current working directory (project root)
    const os = require('os')
    this.allowedBasePaths = [
      os.homedir(),
      process.cwd()
    ]

    // Also allow userData path for plugin's own files
    this.allowedBasePaths.push(userDataPath)

    // Load recent files from storage
    await this.loadRecentFiles()

    // Register IPC handlers for renderer communication
    context.registerIpcHandler('createFile', this.createFile.bind(this))
    context.registerIpcHandler('openFile', this.openFile.bind(this))
    context.registerIpcHandler('readFile', this.readFile.bind(this))
    context.registerIpcHandler('saveFile', this.saveFile.bind(this))
    context.registerIpcHandler('getRecentFiles', this.getRecentFiles.bind(this))
    context.registerIpcHandler('addRecentFile', this.addRecentFile.bind(this))
    context.registerIpcHandler('watchFile', this.watchFile.bind(this))
    context.registerIpcHandler('unwatchFile', this.unwatchFile.bind(this))
    context.registerIpcHandler('getHarnessConfig', this.getHarnessConfig.bind(this))
    context.registerIpcHandler('loadSession', this.loadSession.bind(this))
    context.registerIpcHandler('saveSession', this.saveSession.bind(this))

    context.log.info('Document Editor plugin activated')
  },

  /**
   * Deactivate the plugin (cleanup)
   */
  async deactivate() {
    // Close all file watchers
    for (const [filePath, watcher] of this.fileWatchers) {
      try {
        watcher.close()
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    this.fileWatchers.clear()

    this.context.log.info('Document Editor plugin deactivated')
    this.context = null
  },

  /**
   * Load recent files from storage
   */
  async loadRecentFiles() {
    try {
      const data = await fs.readFile(this.recentFilesPath, 'utf-8')
      this.recentFiles = JSON.parse(data)
    } catch (error) {
      // File doesn't exist or is invalid, start with empty array
      this.recentFiles = []
    }
  },

  /**
   * Save recent files to storage using atomic write pattern
   * Writes to a temp file first, then renames to prevent corruption
   */
  async saveRecentFiles() {
    const tempPath = `${this.recentFilesPath}.tmp`
    try {
      // Write to temp file first
      await fs.writeFile(tempPath, JSON.stringify(this.recentFiles, null, 2), 'utf-8')
      // Atomic rename to target path
      await fs.rename(tempPath, this.recentFilesPath)
    } catch (error) {
      this.context.log.error('Failed to save recent files:', error.message)
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
    }
  },

  /**
   * Check if a file extension is supported
   * @param {string} filePath - Path to file
   * @returns {boolean} True if supported
   */
  isExtensionSupported(filePath) {
    const ext = path.extname(filePath).toLowerCase()
    return SUPPORTED_EXTENSIONS.includes(ext) || ext === ''
  },

  /**
   * Get file extension from path
   * @param {string} filePath - Path to file
   * @returns {string} File extension including dot
   */
  getExtension(filePath) {
    return path.extname(filePath).toLowerCase()
  },

  /**
   * Create a new file via save dialog
   * @param {Object} options - Options including defaultName
   * @returns {Promise<Object>} Created file info or canceled status
   */
  async createFile(options = {}) {
    const { dialog } = require('electron')

    try {
      const result = await dialog.showSaveDialog({
        title: 'Create New Document',
        defaultPath: options.defaultName || 'untitled.txt',
        filters: FILE_FILTERS,
        properties: ['showOverwriteConfirmation', 'createDirectory']
      })

      if (result.canceled || !result.filePath) {
        return { canceled: true }
      }

      const filePath = result.filePath
      const extension = this.getExtension(filePath)

      // Create empty file
      await fs.writeFile(filePath, '', 'utf-8')

      // Add to recent files
      await this.addRecentFile({ path: filePath })

      return {
        path: filePath,
        content: '',
        extension
      }
    } catch (error) {
      this.context.log.error('Failed to create file:', error.message)
      return { error: error.message }
    }
  },

  /**
   * Open a file via dialog
   * @returns {Promise<Object>} File info or canceled status
   */
  async openFile() {
    const { dialog } = require('electron')

    try {
      const result = await dialog.showOpenDialog({
        title: 'Open Document',
        filters: FILE_FILTERS,
        properties: ['openFile']
      })

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { canceled: true }
      }

      const filePath = result.filePaths[0]

      // Validate file extension
      if (!this.isExtensionSupported(filePath)) {
        return {
          error: `Unsupported file type: ${this.getExtension(filePath)}`
        }
      }

      // Read file content
      const content = await fs.readFile(filePath, 'utf-8')
      const extension = this.getExtension(filePath)

      // Add to recent files
      await this.addRecentFile({ path: filePath })

      return {
        path: filePath,
        content,
        extension
      }
    } catch (error) {
      this.context.log.error('Failed to open file:', error.message)
      return { error: error.message }
    }
  },

  /**
   * Read a file by path
   * @param {Object} options - Options including path
   * @returns {Promise<Object>} File content and metadata
   */
  async readFile(options = {}) {
    const { path: filePath } = options

    if (!filePath) {
      return { error: 'File path is required' }
    }

    // Validate path is within allowed directories (prevent path traversal)
    const pathValidation = validateFilePath(filePath, this.allowedBasePaths)
    if (!pathValidation.isValid) {
      this.context.log.warn(`Blocked file read attempt: ${filePath} - ${pathValidation.error}`)
      return { error: pathValidation.error }
    }

    try {
      // Validate file extension
      if (!this.isExtensionSupported(filePath)) {
        return {
          error: `Unsupported file type: ${this.getExtension(filePath)}`
        }
      }

      // Check if file exists
      try {
        await fs.access(pathValidation.resolvedPath)
      } catch {
        return { error: 'File not found' }
      }

      // Read file content
      const content = await fs.readFile(pathValidation.resolvedPath, 'utf-8')
      const extension = this.getExtension(pathValidation.resolvedPath)

      return {
        content,
        extension
      }
    } catch (error) {
      this.context.log.error('Failed to read file:', error.message)
      return { error: error.message }
    }
  },

  /**
   * Save content to a file
   * @param {Object} options - Options including path and content
   * @returns {Promise<Object>} Save result
   */
  async saveFile(options = {}) {
    const { path: filePath, content } = options

    if (!filePath) {
      return { success: false, error: 'File path is required' }
    }

    if (content === undefined || content === null) {
      return { success: false, error: 'Content is required' }
    }

    // Validate path is within allowed directories (prevent path traversal)
    const pathValidation = validateFilePath(filePath, this.allowedBasePaths)
    if (!pathValidation.isValid) {
      this.context.log.warn(`Blocked file write attempt: ${filePath} - ${pathValidation.error}`)
      return { success: false, error: pathValidation.error }
    }

    try {
      await fs.writeFile(pathValidation.resolvedPath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      this.context.log.error('Failed to save file:', error.message)
      return { success: false, error: error.message }
    }
  },

  /**
   * Get recent files list
   * @returns {Promise<Array>} Array of recent file entries
   */
  async getRecentFiles() {
    // Filter out files that no longer exist
    const validFiles = []
    for (const file of this.recentFiles) {
      try {
        await fs.access(file.path)
        validFiles.push(file)
      } catch {
        // File no longer exists, skip it
      }
    }

    // Update if any files were removed
    if (validFiles.length !== this.recentFiles.length) {
      this.recentFiles = validFiles
      await this.saveRecentFiles()
    }

    return this.recentFiles
  },

  /**
   * Add a file to recent files list
   * @param {Object} options - Options including path
   * @returns {Promise<Object>} Result
   */
  async addRecentFile(options = {}) {
    const { path: filePath } = options

    if (!filePath) {
      return { success: false, error: 'File path is required' }
    }

    try {
      // Remove existing entry for this file (if any)
      this.recentFiles = this.recentFiles.filter(f => f.path !== filePath)

      // Add to beginning of list
      const entry = {
        path: filePath,
        displayName: path.basename(filePath),
        lastOpened: new Date().toISOString()
      }
      this.recentFiles.unshift(entry)

      // Trim to max size
      if (this.recentFiles.length > MAX_RECENT_FILES) {
        this.recentFiles = this.recentFiles.slice(0, MAX_RECENT_FILES)
      }

      // Save to storage
      await this.saveRecentFiles()

      return { success: true }
    } catch (error) {
      this.context.log.error('Failed to add recent file:', error.message)
      return { success: false, error: error.message }
    }
  },

  /**
   * Start watching a file for external changes
   * @param {Object} options - Options including filePath
   * @returns {Promise<Object>} Result
   */
  async watchFile(options = {}) {
    const { filePath } = options
    const fsSync = require('fs')

    if (!filePath) {
      return { success: false, error: 'File path is required' }
    }

    // Validate path is within allowed directories (prevent watching sensitive system files)
    const pathValidation = validateFilePath(filePath, this.allowedBasePaths)
    if (!pathValidation.isValid) {
      this.context.log.warn(`Blocked file watch attempt: ${filePath} - ${pathValidation.error}`)
      return { success: false, error: pathValidation.error }
    }

    // Don't watch if already watching
    if (this.fileWatchers.has(pathValidation.resolvedPath)) {
      return { success: true }
    }

    // Prevent resource exhaustion by limiting concurrent watchers
    if (this.fileWatchers.size >= MAX_FILE_WATCHERS) {
      this.context.log.warn(`Maximum file watchers limit reached (${MAX_FILE_WATCHERS})`)
      return { success: false, error: 'Maximum number of file watchers reached' }
    }

    try {
      // Create file watcher
      const watcher = fsSync.watch(pathValidation.resolvedPath, { persistent: false }, (eventType) => {
        if (eventType === 'change') {
          // Send event to renderer via main window
          if (this.context.mainWindow && !this.context.mainWindow.isDestroyed()) {
            this.context.mainWindow.webContents.send('document-editor:file-changed', { filePath: pathValidation.resolvedPath })
          }
        }
      })

      // Handle watcher errors
      watcher.on('error', (error) => {
        this.context.log.error(`File watcher error for ${pathValidation.resolvedPath}:`, error.message)
        this.fileWatchers.delete(pathValidation.resolvedPath)
      })

      this.fileWatchers.set(pathValidation.resolvedPath, watcher)
      return { success: true }
    } catch (error) {
      this.context.log.error('Failed to watch file:', error.message)
      return { success: false, error: error.message }
    }
  },

  /**
   * Stop watching a file
   * @param {Object} options - Options including filePath
   * @returns {Promise<Object>} Result
   */
  async unwatchFile(options = {}) {
    const { filePath } = options

    if (!filePath) {
      return { success: false, error: 'File path is required' }
    }

    // Resolve path to match how it was stored in watchFile
    const resolvedPath = path.resolve(filePath)

    const watcher = this.fileWatchers.get(resolvedPath)
    if (watcher) {
      try {
        watcher.close()
      } catch (error) {
        // Ignore errors during close
      }
      this.fileWatchers.delete(resolvedPath)
    }

    return { success: true }
  },

  /**
   * Get the prompt harness configuration
   * Loads from config/prompt-harness.json and caches it
   * @returns {Promise<Object>} Harness configuration
   */
  async getHarnessConfig() {
    // Return cached config if available
    if (this.harnessConfig) {
      return { config: this.harnessConfig }
    }

    try {
      // Load config from plugin's config directory
      const configPath = path.join(__dirname, 'config', 'prompt-harness.json')
      const configData = await fs.readFile(configPath, 'utf-8')
      this.harnessConfig = JSON.parse(configData)

      this.context.log.info('Loaded prompt harness configuration')
      return { config: this.harnessConfig }
    } catch (error) {
      this.context.log.error('Failed to load harness config:', error.message)
      return { error: error.message }
    }
  },

  /**
   * Get the sessions directory path
   * @returns {Promise<string>} Path to sessions directory
   */
  async getSessionsDir() {
    const { app } = require('electron')
    const userDataPath = app.getPath('userData')
    const sessionsDir = path.join(userDataPath, 'puffin-plugins', 'document-editor', 'sessions')

    // Ensure directory exists
    await fs.mkdir(sessionsDir, { recursive: true })

    return sessionsDir
  },

  /**
   * Load a session for a document
   * @param {Object} options - Options including documentPath and sessionHash
   * @returns {Promise<Object>} Session data or error
   */
  async loadSession(options = {}) {
    const { documentPath, sessionHash } = options

    if (!sessionHash) {
      return { error: 'Session hash is required' }
    }

    try {
      const sessionsDir = await this.getSessionsDir()
      const sessionPath = path.join(sessionsDir, `${sessionHash}.json`)

      // Check if session file exists
      try {
        await fs.access(sessionPath)
      } catch {
        // Session doesn't exist yet
        return { error: 'Session not found' }
      }

      // Read and parse session
      const sessionData = await fs.readFile(sessionPath, 'utf-8')
      const session = JSON.parse(sessionData)

      // Verify session is for the correct document (if path provided)
      if (documentPath && session.documentPath !== documentPath) {
        this.context.log.warn(`Session hash collision: expected ${documentPath}, got ${session.documentPath}`)
        // Return empty error to create new session
        return { error: 'Session document mismatch' }
      }

      this.context.log.info(`Loaded session for ${documentPath || sessionHash}`)
      return { session }
    } catch (error) {
      this.context.log.error('Failed to load session:', error.message)
      return { error: error.message }
    }
  },

  /**
   * Save a session for a document
   * Uses atomic write pattern (write to temp, then rename)
   * @param {Object} options - Options including documentPath, sessionHash, and session data
   * @returns {Promise<Object>} Success status or error
   */
  async saveSession(options = {}) {
    const { sessionHash, session } = options

    if (!sessionHash) {
      return { success: false, error: 'Session hash is required' }
    }

    if (!session) {
      return { success: false, error: 'Session data is required' }
    }

    try {
      const sessionsDir = await this.getSessionsDir()
      const sessionPath = path.join(sessionsDir, `${sessionHash}.json`)
      const tempPath = `${sessionPath}.tmp`

      // Write to temp file first (atomic write pattern)
      await fs.writeFile(tempPath, JSON.stringify(session, null, 2), 'utf-8')

      // Rename to final path
      await fs.rename(tempPath, sessionPath)

      this.context.log.info(`Saved session for ${session.documentPath || sessionHash}`)
      return { success: true }
    } catch (error) {
      this.context.log.error('Failed to save session:', error.message)

      // Clean up temp file if it exists
      try {
        const sessionsDir = await this.getSessionsDir()
        const tempPath = path.join(sessionsDir, `${sessionHash}.json.tmp`)
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }

      return { success: false, error: error.message }
    }
  }
}

module.exports = DocumentEditorPlugin
