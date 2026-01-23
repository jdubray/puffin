/**
 * DocumentPicker - File selection component for RLM document analysis
 *
 * Provides:
 * - Native file dialog via IPC (show-file-dialog)
 * - Drag-and-drop file selection
 * - File type filtering (text, code, markdown)
 * - File size validation against plugin limits
 * - Recent documents list (stored in context.storage)
 * - Selected document display with path and size info
 *
 * Emits:
 * - 'document:selected' - When a valid document is selected
 *
 * @module rlm-document-plugin/renderer/DocumentPicker
 */

// File size limits (same as backend config)
const FILE_LIMITS = {
  WARN_SIZE: 10 * 1024 * 1024,  // 10MB warning threshold
  MAX_SIZE: 50 * 1024 * 1024    // 50MB maximum
}

// Supported file extensions for document analysis
const SUPPORTED_EXTENSIONS = [
  '.md', '.txt', '.rst', '.asciidoc',
  '.json', '.yaml', '.yml', '.xml', '.toml',
  '.js', '.ts', '.jsx', '.tsx',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h',
  '.html', '.css', '.scss',
  '.sql', '.graphql',
  '.sh', '.bash', '.zsh', '.ps1', '.bat',
  '.log', '.csv'
]

// File type categories for filtering
const FILE_TYPE_FILTERS = {
  all: { name: 'All Supported', extensions: SUPPORTED_EXTENSIONS },
  text: { name: 'Text Files', extensions: ['.md', '.txt', '.rst', '.asciidoc', '.log'] },
  code: { name: 'Code Files', extensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h'] },
  data: { name: 'Data Files', extensions: ['.json', '.yaml', '.yml', '.xml', '.toml', '.csv', '.sql', '.graphql'] },
  markup: { name: 'Markup Files', extensions: ['.html', '.css', '.scss'] }
}

// Maximum recent documents to store
const MAX_RECENT_DOCUMENTS = 10

export class DocumentPicker {
  /**
   * Component name for registration
   * @type {string}
   */
  static componentName = 'DocumentPicker'

  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} options - Component options
   * @param {Object} options.context - Plugin context with storage, events, ipc
   * @param {Function} options.onDocumentSelected - Callback when document is selected
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}
    this.onDocumentSelected = options.onDocumentSelected || (() => {})

    // State
    this.state = {
      selectedDocument: null,  // { path, name, size, type }
      recentDocuments: [],
      isDragOver: false,
      isLoading: false,
      error: null,
      filter: 'all'
    }

    // Event listener tracking for cleanup
    this._eventListeners = []

    // Bound handlers
    this._handleBrowseClick = this._handleBrowseClick.bind(this)
    this._handleDragOver = this._handleDragOver.bind(this)
    this._handleDragLeave = this._handleDragLeave.bind(this)
    this._handleDrop = this._handleDrop.bind(this)
    this._handleRecentClick = this._handleRecentClick.bind(this)
    this._handleFilterChange = this._handleFilterChange.bind(this)
    this._handleClearSelection = this._handleClearSelection.bind(this)
  }

  /**
   * Initialize the component
   */
  async init() {
    this.container.className = 'rlm-document-picker'

    // Load recent documents from storage
    await this._loadRecentDocuments()

    // Render initial state
    this._render()
  }

  /**
   * Get the currently selected document
   * @returns {Object|null} Selected document info
   */
  getSelectedDocument() {
    return this.state.selectedDocument
  }

  /**
   * Clear the current selection
   */
  clearSelection() {
    this.state.selectedDocument = null
    this.state.error = null
    this._render()
  }

  /**
   * Update the component (called by parent)
   * @param {Object} state - Partial state to update
   */
  update(state = {}) {
    if (state.selectedDocument !== undefined) {
      this.state.selectedDocument = state.selectedDocument
    }
    this._render()
  }

  /**
   * Lifecycle: Called when component is being destroyed
   */
  async onDestroy() {
    this._removeAllEventListeners()
    if (this.container) {
      this.container.innerHTML = ''
    }
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  /**
   * Render the document picker
   * @private
   */
  _render() {
    this._removeAllEventListeners()

    const { selectedDocument, recentDocuments, isDragOver, isLoading, error, filter } = this.state

    this.container.innerHTML = `
      <div class="document-picker-content">
        ${this._renderHeader()}
        ${this._renderDropZone(isDragOver, isLoading)}
        ${error ? this._renderError(error) : ''}
        ${selectedDocument ? this._renderSelectedDocument(selectedDocument) : ''}
        ${!selectedDocument && recentDocuments.length > 0 ? this._renderRecentDocuments(recentDocuments) : ''}
      </div>
    `

    this._attachEventListeners()
  }

  /**
   * Render header with filter
   * @private
   */
  _renderHeader() {
    return `
      <div class="document-picker-header">
        <h3 class="picker-title">Select Document</h3>
        <div class="filter-group">
          <label for="file-type-filter" class="filter-label">Filter:</label>
          <select id="file-type-filter" class="filter-select">
            ${Object.entries(FILE_TYPE_FILTERS).map(([key, { name }]) => `
              <option value="${key}" ${this.state.filter === key ? 'selected' : ''}>
                ${this._escapeHtml(name)}
              </option>
            `).join('')}
          </select>
        </div>
      </div>
    `
  }

  /**
   * Render drag-drop zone
   * @private
   */
  _renderDropZone(isDragOver, isLoading) {
    const dropZoneClass = `drop-zone ${isDragOver ? 'drag-over' : ''} ${isLoading ? 'loading' : ''}`

    return `
      <div class="${dropZoneClass}"
           role="button"
           tabindex="0"
           aria-label="Drop file here or click to browse">
        <div class="drop-zone-content">
          ${isLoading ? `
            <div class="loading-spinner" aria-hidden="true"></div>
            <p class="drop-zone-text">Loading...</p>
          ` : `
            <span class="drop-zone-icon" aria-hidden="true">📁</span>
            <p class="drop-zone-text">
              Drag and drop a file here<br>
              <span class="drop-zone-subtext">or</span>
            </p>
            <button class="browse-btn" type="button">
              Browse Files
            </button>
          `}
        </div>
      </div>
    `
  }

  /**
   * Render error message
   * @private
   */
  _renderError(error) {
    return `
      <div class="picker-error" role="alert">
        <span class="error-icon" aria-hidden="true">⚠️</span>
        <span class="error-message">${this._escapeHtml(error)}</span>
      </div>
    `
  }

  /**
   * Render selected document info
   * @private
   */
  _renderSelectedDocument(doc) {
    const sizeDisplay = this._formatFileSize(doc.size)
    const sizeClass = doc.size > FILE_LIMITS.WARN_SIZE ? 'size-warning' : ''

    return `
      <div class="selected-document">
        <div class="selected-header">
          <span class="selected-label">Selected:</span>
          <button class="clear-selection-btn"
                  type="button"
                  title="Clear selection"
                  aria-label="Clear selection">
            ✕
          </button>
        </div>
        <div class="document-info">
          <span class="document-icon" aria-hidden="true">${this._getFileIcon(doc.type)}</span>
          <div class="document-details">
            <span class="document-name" title="${this._escapeHtml(doc.path)}">
              ${this._escapeHtml(doc.name)}
            </span>
            <span class="document-meta">
              <span class="document-type">${this._escapeHtml(doc.type || 'Unknown')}</span>
              <span class="document-size ${sizeClass}">${sizeDisplay}</span>
            </span>
          </div>
        </div>
        <div class="document-path" title="${this._escapeHtml(doc.path)}">
          ${this._escapeHtml(doc.path)}
        </div>
        ${doc.size > FILE_LIMITS.WARN_SIZE ? `
          <div class="size-warning-message">
            <span class="warning-icon" aria-hidden="true">⚠️</span>
            Large file - analysis may take longer
          </div>
        ` : ''}
      </div>
    `
  }

  /**
   * Render recent documents list
   * @private
   */
  _renderRecentDocuments(documents) {
    return `
      <div class="recent-documents">
        <h4 class="recent-title">Recent Documents</h4>
        <ul class="recent-list" role="listbox" aria-label="Recent documents">
          ${documents.map((doc, index) => `
            <li class="recent-item"
                role="option"
                tabindex="0"
                data-index="${index}"
                data-path="${this._escapeHtml(doc.path)}"
                title="${this._escapeHtml(doc.path)}">
              <span class="recent-icon" aria-hidden="true">${this._getFileIcon(doc.type)}</span>
              <span class="recent-name">${this._escapeHtml(doc.name)}</span>
              <span class="recent-size">${this._formatFileSize(doc.size)}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  /**
   * Attach event listeners
   * @private
   */
  _attachEventListeners() {
    // Browse button
    const browseBtn = this.container.querySelector('.browse-btn')
    if (browseBtn) {
      this._addEventListener(browseBtn, 'click', this._handleBrowseClick)
    }

    // Drop zone
    const dropZone = this.container.querySelector('.drop-zone')
    if (dropZone) {
      this._addEventListener(dropZone, 'dragover', this._handleDragOver)
      this._addEventListener(dropZone, 'dragleave', this._handleDragLeave)
      this._addEventListener(dropZone, 'drop', this._handleDrop)
      this._addEventListener(dropZone, 'click', this._handleBrowseClick)
      this._addEventListener(dropZone, 'keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          this._handleBrowseClick(e)
        }
      })
    }

    // Recent items
    const recentItems = this.container.querySelectorAll('.recent-item')
    recentItems.forEach(item => {
      this._addEventListener(item, 'click', this._handleRecentClick)
      this._addEventListener(item, 'keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          this._handleRecentClick(e)
        }
      })
    })

    // Filter select
    const filterSelect = this.container.querySelector('#file-type-filter')
    if (filterSelect) {
      this._addEventListener(filterSelect, 'change', this._handleFilterChange)
    }

    // Clear selection button
    const clearBtn = this.container.querySelector('.clear-selection-btn')
    if (clearBtn) {
      this._addEventListener(clearBtn, 'click', this._handleClearSelection)
    }
  }

  /**
   * Handle browse button click - open native file dialog
   * @private
   */
  async _handleBrowseClick(event) {
    event.preventDefault()
    event.stopPropagation()

    if (this.state.isLoading) return

    this.state.isLoading = true
    this.state.error = null
    this._render()

    try {
      // Call IPC to show native file dialog
      const result = await this._invokeIpc('show-file-dialog', {
        filter: this.state.filter
      })

      if (result.error) {
        throw new Error(result.error)
      }

      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        const filePath = result.filePaths[0]
        await this._selectFile(filePath)
      }
    } catch (error) {
      this.state.error = error.message || 'Failed to open file dialog'
      this.context.log?.error?.('[DocumentPicker] Browse error:', error)
    } finally {
      this.state.isLoading = false
      this._render()
    }
  }

  /**
   * Handle dragover event
   * @private
   */
  _handleDragOver(event) {
    event.preventDefault()
    event.stopPropagation()

    if (!this.state.isDragOver) {
      this.state.isDragOver = true
      this._render()
    }
  }

  /**
   * Handle dragleave event
   * @private
   */
  _handleDragLeave(event) {
    event.preventDefault()
    event.stopPropagation()

    // Only handle if leaving the drop zone entirely
    const dropZone = this.container.querySelector('.drop-zone')
    if (dropZone && !dropZone.contains(event.relatedTarget)) {
      this.state.isDragOver = false
      this._render()
    }
  }

  /**
   * Handle drop event
   * @private
   */
  async _handleDrop(event) {
    event.preventDefault()
    event.stopPropagation()

    this.state.isDragOver = false
    this.state.error = null

    const files = event.dataTransfer?.files
    if (!files || files.length === 0) {
      this.state.error = 'No file dropped'
      this._render()
      return
    }

    if (files.length > 1) {
      this.state.error = 'Please drop only one file at a time'
      this._render()
      return
    }

    const file = files[0]

    // Get file path - in Electron, files have a path property
    const filePath = file.path
    if (!filePath) {
      this.state.error = 'Could not read file path'
      this._render()
      return
    }

    this.state.isLoading = true
    this._render()

    try {
      await this._selectFile(filePath, file.size)
    } catch (error) {
      this.state.error = error.message
    } finally {
      this.state.isLoading = false
      this._render()
    }
  }

  /**
   * Handle recent document click
   * @private
   */
  async _handleRecentClick(event) {
    event.preventDefault()

    const item = event.target.closest('.recent-item')
    if (!item) return

    const path = item.dataset.path
    if (!path) return

    this.state.isLoading = true
    this.state.error = null
    this._render()

    try {
      await this._selectFile(path)
    } catch (error) {
      this.state.error = error.message
    } finally {
      this.state.isLoading = false
      this._render()
    }
  }

  /**
   * Handle filter change
   * @private
   */
  _handleFilterChange(event) {
    this.state.filter = event.target.value
  }

  /**
   * Handle clear selection
   * @private
   */
  _handleClearSelection(event) {
    event.preventDefault()
    event.stopPropagation()
    this.clearSelection()
  }

  // ============================================================================
  // FILE SELECTION
  // ============================================================================

  /**
   * Select a file and validate it
   * @param {string} filePath - Path to the file
   * @param {number} knownSize - Known file size (optional, for drag-drop)
   * @private
   */
  async _selectFile(filePath, knownSize = null) {
    // Extract file info
    const name = this._getFileName(filePath)
    const ext = this._getFileExtension(filePath)
    const type = this._getFileType(ext)

    // Validate extension
    if (!this._isExtensionSupported(ext)) {
      throw new Error(`Unsupported file type: ${ext || 'unknown'}. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`)
    }

    // Get file size via IPC if not known
    let size = knownSize
    if (size === null) {
      try {
        const statResult = await this._invokeIpc('get-file-stat', { path: filePath })
        if (statResult.error) {
          throw new Error(statResult.error)
        }
        size = statResult.size
      } catch (error) {
        // If we can't get file stat, try to proceed anyway - backend will validate
        size = 0
        this.context.log?.warn?.('[DocumentPicker] Could not get file size:', error.message)
      }
    }

    // Validate file size
    if (size > FILE_LIMITS.MAX_SIZE) {
      throw new Error(`File too large (${this._formatFileSize(size)}). Maximum: ${this._formatFileSize(FILE_LIMITS.MAX_SIZE)}`)
    }

    // Create document info
    const documentInfo = {
      path: filePath,
      name,
      size,
      type,
      extension: ext
    }

    // Update state
    this.state.selectedDocument = documentInfo
    this.state.error = null

    // Add to recent documents
    await this._addToRecentDocuments(documentInfo)

    // Emit event via context.events
    if (this.context.events?.emit) {
      this.context.events.emit('document:selected', documentInfo)
    }

    // Call callback
    this.onDocumentSelected(documentInfo)

    this._render()
  }

  // ============================================================================
  // RECENT DOCUMENTS
  // ============================================================================

  /**
   * Load recent documents from storage
   * @private
   */
  async _loadRecentDocuments() {
    try {
      if (this.context.storage?.get) {
        const recent = await this.context.storage.get('recentDocuments')
        if (Array.isArray(recent)) {
          this.state.recentDocuments = recent.slice(0, MAX_RECENT_DOCUMENTS)
        }
      }
    } catch (error) {
      this.context.log?.warn?.('[DocumentPicker] Could not load recent documents:', error.message)
    }
  }

  /**
   * Add a document to recent documents list
   * @param {Object} doc - Document info
   * @private
   */
  async _addToRecentDocuments(doc) {
    try {
      // Remove if already exists
      const filtered = this.state.recentDocuments.filter(d => d.path !== doc.path)

      // Add to beginning
      const updated = [
        { path: doc.path, name: doc.name, size: doc.size, type: doc.type },
        ...filtered
      ].slice(0, MAX_RECENT_DOCUMENTS)

      this.state.recentDocuments = updated

      // Save to storage
      if (this.context.storage?.set) {
        await this.context.storage.set('recentDocuments', updated)
      }
    } catch (error) {
      this.context.log?.warn?.('[DocumentPicker] Could not save recent documents:', error.message)
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Invoke an IPC handler
   * @param {string} channel - IPC channel (without plugin prefix)
   * @param {Object} args - Arguments to pass
   * @returns {Promise<Object>} Response
   * @private
   */
  async _invokeIpc(channel, args = {}) {
    // The context should provide an ipc method
    if (this.context.ipc) {
      return this.context.ipc(channel, args)
    }

    // Fallback: try window.puffin.ipc if available
    if (typeof window !== 'undefined' && window.puffin?.ipc) {
      return window.puffin.ipc(`rlm-document-plugin:${channel}`, args)
    }

    throw new Error('IPC not available')
  }

  /**
   * Get file name from path
   * @private
   */
  _getFileName(filePath) {
    if (!filePath) return 'Unknown'
    const parts = filePath.split(/[/\\]/)
    return parts[parts.length - 1] || 'Unknown'
  }

  /**
   * Get file extension from path
   * @private
   */
  _getFileExtension(filePath) {
    if (!filePath) return ''
    const name = this._getFileName(filePath)
    const dotIndex = name.lastIndexOf('.')
    return dotIndex > 0 ? name.substring(dotIndex).toLowerCase() : ''
  }

  /**
   * Get file type description from extension
   * @private
   */
  _getFileType(extension) {
    const typeMap = {
      '.md': 'Markdown',
      '.txt': 'Text',
      '.json': 'JSON',
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
      '.jsx': 'JSX',
      '.tsx': 'TSX',
      '.py': 'Python',
      '.rb': 'Ruby',
      '.go': 'Go',
      '.rs': 'Rust',
      '.java': 'Java',
      '.c': 'C',
      '.cpp': 'C++',
      '.h': 'Header',
      '.html': 'HTML',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.yaml': 'YAML',
      '.yml': 'YAML',
      '.xml': 'XML',
      '.toml': 'TOML',
      '.sql': 'SQL',
      '.graphql': 'GraphQL',
      '.sh': 'Shell',
      '.bash': 'Bash',
      '.log': 'Log',
      '.csv': 'CSV'
    }
    return typeMap[extension] || extension.replace('.', '').toUpperCase() || 'Unknown'
  }

  /**
   * Check if extension is supported
   * @private
   */
  _isExtensionSupported(extension) {
    if (!extension) return false
    const ext = extension.toLowerCase()
    return SUPPORTED_EXTENSIONS.includes(ext)
  }

  /**
   * Get icon for file type
   * @private
   */
  _getFileIcon(type) {
    const iconMap = {
      'Markdown': '📝',
      'Text': '📄',
      'JSON': '🔧',
      'JavaScript': '📜',
      'TypeScript': '📘',
      'Python': '🐍',
      'HTML': '🌐',
      'CSS': '🎨',
      'YAML': '⚙️',
      'SQL': '🗃️',
      'Log': '📋'
    }
    return iconMap[type] || '📄'
  }

  /**
   * Format file size for display
   * @private
   */
  _formatFileSize(bytes) {
    if (bytes === 0 || bytes === undefined || bytes === null) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  /**
   * Add event listener with tracking
   * @private
   */
  _addEventListener(element, event, handler) {
    element.addEventListener(event, handler)
    this._eventListeners.push({ element, event, handler })
  }

  /**
   * Remove all tracked event listeners
   * @private
   */
  _removeAllEventListeners() {
    for (const { element, event, handler } of this._eventListeners) {
      element.removeEventListener(event, handler)
    }
    this._eventListeners = []
  }

  /**
   * Escape HTML to prevent XSS
   * @private
   */
  _escapeHtml(str) {
    if (!str) return ''
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }
}

// Default export for ES module compatibility
export default DocumentPicker
