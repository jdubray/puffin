/**
 * DocumentEditorView - Main container component for the Document Editor Plugin UI
 * Vanilla JavaScript implementation (no JSX)
 *
 * Layout Structure:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ [New] [Open] [Save]  │  filename.js  │  ● Saved  │ [Auto-save] │ <- Toolbar
 * ├─────────────────────────────────────────────────────────────────┤
 * │  1 │ const foo = 'bar';                                        │
 * │  2 │ function hello() {                                        │
 * │  3 │   console.log('world');                                   │ <- Editor (flex: 1)
 * │  4 │ }                                                         │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ Ask AI about this document...                            [Ask] │ <- Prompt
 * ├─────────────────────────────────────────────────────────────────┤
 * │ [▼ Collapse] Response area (collapsible, max-height limited)   │ <- Response
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Key Features:
 * - Document editor is ALWAYS visible (flex: 1, min-height enforced)
 * - Response area is collapsible and has max-height to prevent pushing editor off-screen
 * - Responsive layout adapts to smaller screens
 * - Syntax highlighting via highlight.js for code files
 */

/**
 * Extension to highlight.js language mapping
 * Maps file extensions to highlight.js language identifiers
 */
const EXTENSION_TO_LANGUAGE = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.jsx': 'javascript',
  '.tsx': 'typescript',
  '.html': 'xml',
  '.htm': 'xml',
  '.xml': 'xml',
  '.svg': 'xml',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'less',
  '.json': 'json',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.php': 'php',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'ini',
  '.ini': 'ini',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'bash',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.bat': 'dos',
  '.cmd': 'dos',
  '.txt': 'plaintext',
  '.log': 'plaintext',
  '.dockerfile': 'dockerfile',
  '.makefile': 'makefile',
  '.cmake': 'cmake',
  '.r': 'r',
  '.lua': 'lua',
  '.perl': 'perl',
  '.pl': 'perl',
  '.scala': 'scala',
  '.groovy': 'groovy',
  '.vue': 'xml',
  '.svelte': 'xml'
}

/**
 * Get highlight.js language for a file extension
 * @param {string} extension - File extension including dot (e.g., '.js')
 * @returns {string} Language identifier for highlight.js
 */
function getLanguageForExtension(extension) {
  if (!extension) return 'plaintext'
  const lang = EXTENSION_TO_LANGUAGE[extension.toLowerCase()]
  return lang || 'plaintext'
}

// Lazy-loaded highlight.js instance
let hljs = null

/**
 * Load highlight.js library dynamically
 * @returns {Promise<Object>} highlight.js instance
 */
async function loadHighlightJs() {
  if (hljs) return hljs

  try {
    // Try to load from node_modules via require (Electron with node integration)
    if (typeof window !== 'undefined' && window.require) {
      hljs = window.require('highlight.js')
      return hljs
    }

    // Fallback: try dynamic import
    const module = await import('highlight.js')
    hljs = module.default || module
    return hljs
  } catch (error) {
    console.warn('[DocumentEditorView] Could not load highlight.js:', error.message)
    return null
  }
}

export class DocumentEditorView {
  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} options - Component options
   * @param {string} options.viewId - View ID
   * @param {Object} options.view - View configuration
   * @param {string} options.pluginName - Plugin name
   * @param {Object} options.context - Plugin context
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}

    // State
    this.state = {
      currentFile: null,
      content: '',
      extension: null,
      isModified: false,
      autoSaveEnabled: true,
      loading: true,
      error: null,
      responseCollapsed: false,
      responseContent: ''
    }

    // Auto-save timer
    this.autoSaveTimeout = null
    this.AUTOSAVE_DELAY = 1500 // 1.5 seconds

    // Highlight.js instance (loaded lazily)
    this.hljs = null
    this.hljsLoading = false

    // Syntax highlighting debounce timer (for performance with large files)
    this.highlightTimeout = null
    this.HIGHLIGHT_DELAY = 100 // 100ms debounce for highlighting

    // Bound methods for event listeners (needed for cleanup)
    this._boundKeyDown = this.handleGlobalKeyDown.bind(this)

    // Track event listeners for cleanup
    this.boundListeners = []
  }

  /**
   * Initialize the component
   */
  async init() {
    console.log('[DocumentEditorView] init() called')

    this.container.className = 'document-editor-view'
    this.state.loading = false
    this.render()

    // Add global keyboard shortcuts
    document.addEventListener('keydown', this._boundKeyDown)

    // Load highlight.js in background
    this.loadHighlighter()

    console.log('[DocumentEditorView] init() complete')
  }

  /**
   * Load highlight.js library
   */
  async loadHighlighter() {
    if (this.hljs || this.hljsLoading) return

    this.hljsLoading = true
    try {
      this.hljs = await loadHighlightJs()
      if (this.hljs) {
        console.log('[DocumentEditorView] highlight.js loaded successfully')
        // Re-apply highlighting if content is already loaded
        if (this.state.content) {
          this.updateHighlighting()
        }
      }
    } catch (error) {
      console.warn('[DocumentEditorView] Failed to load highlight.js:', error)
    } finally {
      this.hljsLoading = false
    }
  }

  /**
   * Render the view
   */
  render() {
    if (!this.container) return

    const hasFile = !!this.state.currentFile
    const responseCollapsed = this.state.responseCollapsed

    this.container.innerHTML = `
      <div class="document-editor-wrapper">
        <!-- Toolbar: File actions, filename, save indicator, auto-save toggle -->
        <div class="document-editor-toolbar" role="toolbar" aria-label="Document actions">
          <div class="document-editor-toolbar-left">
            <button class="document-editor-btn" data-action="new" title="New document (Ctrl+N)" aria-label="Create new document">
              <span class="document-editor-btn-icon" aria-hidden="true">📄</span>
              <span class="document-editor-btn-text">New</span>
            </button>
            <button class="document-editor-btn" data-action="open" title="Open file (Ctrl+O)" aria-label="Open existing file">
              <span class="document-editor-btn-icon" aria-hidden="true">📂</span>
              <span class="document-editor-btn-text">Open</span>
            </button>
            <button class="document-editor-btn" data-action="save" title="Save file (Ctrl+S)" aria-label="Save current file" ${!hasFile ? 'disabled' : ''}>
              <span class="document-editor-btn-icon" aria-hidden="true">💾</span>
              <span class="document-editor-btn-text">Save</span>
            </button>
          </div>
          <div class="document-editor-toolbar-center">
            <span class="document-editor-filename" title="${this.escapeHtml(this.state.currentFile || '')}">
              ${hasFile ? this.getDisplayFilename() : 'No file open'}
            </span>
          </div>
          <div class="document-editor-toolbar-right">
            <span class="document-editor-save-indicator"></span>
            <label class="document-editor-autosave-toggle" title="Automatically save changes">
              <input type="checkbox" ${this.state.autoSaveEnabled ? 'checked' : ''}>
              <span>Auto-save</span>
            </label>
          </div>
        </div>

        <!-- Main content: Editor or Empty state (always visible, flex: 1) -->
        <div class="document-editor-main">
          ${this.renderMainContent()}
        </div>

        <!-- AI Prompt area: Input and Ask button -->
        <div class="document-editor-prompt-area">
          <input
            type="text"
            class="document-editor-prompt-input"
            placeholder="Ask AI about this document..."
            ${!hasFile ? 'disabled' : ''}
          >
          <button class="document-editor-btn document-editor-prompt-btn" aria-label="Ask AI about document" ${!hasFile ? 'disabled' : ''}>
            Ask
          </button>
        </div>

        <!-- AI Response area: Collapsible with header -->
        <div class="document-editor-response-area ${responseCollapsed ? 'collapsed' : ''}">
          <div class="document-editor-response-header">
            <button class="document-editor-response-toggle" data-action="toggle-response" title="Toggle response area" aria-label="Toggle AI response panel" aria-expanded="${!responseCollapsed}">
              <span class="document-editor-toggle-icon" aria-hidden="true">${responseCollapsed ? '▶' : '▼'}</span>
              <span>AI Response</span>
            </button>
          </div>
          <div class="document-editor-response-content">
            ${this.renderResponseContent()}
          </div>
        </div>
      </div>
    `

    this.attachEventListeners()
    this.updateSaveIndicator()

    // Focus the textarea if a file is open
    if (hasFile) {
      const textarea = this.container.querySelector('.document-editor-textarea')
      if (textarea) {
        // Restore content to textarea
        textarea.value = this.state.content
        this.updateLineNumbers()
        this.updateHighlighting()
      }
    }
  }

  /**
   * Render main content area (empty state or editor)
   */
  renderMainContent() {
    if (!this.state.currentFile) {
      return `
        <div class="document-editor-empty-state">
          <div class="document-editor-empty-icon">📝</div>
          <h3>No Document Open</h3>
          <p>Create a new document or open an existing file to get started.</p>
          <div class="document-editor-empty-actions">
            <button class="document-editor-btn document-editor-btn-primary" data-action="new" aria-label="Create new document">
              <span class="document-editor-btn-icon" aria-hidden="true">📄</span>
              New Document
            </button>
            <button class="document-editor-btn" data-action="open" aria-label="Open existing file">
              <span class="document-editor-btn-icon" aria-hidden="true">📂</span>
              Open File
            </button>
          </div>
          <div class="document-editor-empty-hint">
            <p>Keyboard shortcuts: <kbd>Ctrl+N</kbd> New, <kbd>Ctrl+O</kbd> Open, <kbd>Ctrl+S</kbd> Save</p>
          </div>
        </div>
      `
    }

    // Editor area - will be enhanced in Story 3 with syntax highlighting
    return `
      <div class="document-editor-editor-area">
        <div class="document-editor-line-numbers"></div>
        <div class="document-editor-code-wrapper">
          <pre class="document-editor-highlight-layer"><code></code></pre>
          <textarea class="document-editor-textarea" spellcheck="false" placeholder="Start typing..."></textarea>
        </div>
      </div>
    `
  }

  /**
   * Render AI response content area
   */
  renderResponseContent() {
    if (!this.state.responseContent) {
      return `
        <div class="document-editor-response-placeholder">
          AI responses will appear here. Ask a question about your document to get started.
        </div>
      `
    }
    return `<div class="document-editor-response-text">${this.escapeHtml(this.state.responseContent)}</div>`
  }

  /**
   * Get display filename from full path
   * @returns {string} Filename with extension
   */
  getDisplayFilename() {
    if (!this.state.currentFile) return 'Untitled'
    const filename = this.state.currentFile.split(/[/\\]/).pop()
    return filename || 'Untitled'
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Add and track an event listener for later cleanup
   * @param {Element} element - DOM element
   * @param {string} event - Event type
   * @param {Function} handler - Event handler
   */
  addTrackedListener(element, event, handler) {
    if (!element) return
    element.addEventListener(event, handler)
    this.boundListeners.push({ element, event, handler })
  }

  /**
   * Remove all tracked event listeners
   */
  cleanupListeners() {
    for (const { element, event, handler } of this.boundListeners) {
      try {
        element.removeEventListener(event, handler)
      } catch {
        // Element may have been removed from DOM, ignore
      }
    }
    this.boundListeners = []
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Clean up any existing listeners first
    this.cleanupListeners()

    // Action buttons (toolbar and empty state)
    this.container.querySelectorAll('[data-action]').forEach(btn => {
      const handler = (e) => {
        e.preventDefault()
        const action = e.currentTarget.dataset.action
        this.handleAction(action)
      }
      this.addTrackedListener(btn, 'click', handler)
    })

    // Auto-save toggle
    const autoSaveCheckbox = this.container.querySelector('.document-editor-autosave-toggle input')
    if (autoSaveCheckbox) {
      const handler = (e) => this.toggleAutoSave(e.target.checked)
      this.addTrackedListener(autoSaveCheckbox, 'change', handler)
    }

    // Editor textarea (if present)
    const textarea = this.container.querySelector('.document-editor-textarea')
    if (textarea) {
      const inputHandler = this.handleInput.bind(this)
      const scrollHandler = this.syncScroll.bind(this)
      const keydownHandler = this.handleKeyDown.bind(this)
      this.addTrackedListener(textarea, 'input', inputHandler)
      this.addTrackedListener(textarea, 'scroll', scrollHandler)
      this.addTrackedListener(textarea, 'keydown', keydownHandler)
    }

    // AI prompt input - Enter key to submit
    const promptInput = this.container.querySelector('.document-editor-prompt-input')
    if (promptInput) {
      const handler = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          this.handleAskAI()
        }
      }
      this.addTrackedListener(promptInput, 'keydown', handler)
    }

    // AI Ask button
    const askBtn = this.container.querySelector('.document-editor-prompt-btn')
    if (askBtn) {
      const handler = () => this.handleAskAI()
      this.addTrackedListener(askBtn, 'click', handler)
    }
  }

  /**
   * Handle global keyboard shortcuts
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleGlobalKeyDown(e) {
    // Only handle if this view is active/visible
    if (!this.container || !this.container.offsetParent) return

    const isMod = e.ctrlKey || e.metaKey

    if (isMod && e.key === 'n') {
      e.preventDefault()
      this.handleNew()
    } else if (isMod && e.key === 'o') {
      e.preventDefault()
      this.handleOpen()
    } else if (isMod && e.key === 's') {
      e.preventDefault()
      this.handleSave()
    }
  }

  /**
   * Handle AI prompt submission
   */
  handleAskAI() {
    const promptInput = this.container.querySelector('.document-editor-prompt-input')
    const prompt = promptInput?.value?.trim()

    if (!prompt) return

    // Stub - will be implemented in future AI integration
    // Note: responseContent is escaped in renderResponseContent() before display
    // Using a structured format to clearly separate static text from user input
    console.log('[DocumentEditorView] Ask AI:', prompt)
    this.state.responseContent = `AI integration coming soon. Your question: "${prompt}"`
    promptInput.value = ''

    // Update just the response content, not the entire view
    const responseContent = this.container.querySelector('.document-editor-response-content')
    if (responseContent) {
      responseContent.innerHTML = this.renderResponseContent()
    }

    // Ensure response area is expanded
    if (this.state.responseCollapsed) {
      this.toggleResponseArea()
    }
  }

  /**
   * Handle toolbar actions
   * @param {string} action - Action name
   */
  async handleAction(action) {
    console.log('[DocumentEditorView] Action:', action)

    switch (action) {
      case 'new':
        await this.handleNew()
        break
      case 'open':
        await this.handleOpen()
        break
      case 'save':
        await this.handleSave()
        break
      case 'toggle-response':
        this.toggleResponseArea()
        break
    }
  }

  /**
   * Toggle response area collapsed/expanded
   */
  toggleResponseArea() {
    this.state.responseCollapsed = !this.state.responseCollapsed

    const responseArea = this.container.querySelector('.document-editor-response-area')
    const toggleIcon = this.container.querySelector('.document-editor-toggle-icon')

    if (responseArea) {
      responseArea.classList.toggle('collapsed', this.state.responseCollapsed)
    }
    if (toggleIcon) {
      toggleIcon.textContent = this.state.responseCollapsed ? '▶' : '▼'
    }
  }

  /**
   * Handle new document
   */
  async handleNew() {
    // Check for unsaved changes
    if (this.state.isModified && this.state.currentFile) {
      const confirmed = confirm('You have unsaved changes. Create new document anyway?')
      if (!confirmed) return
    }

    try {
      const result = await window.puffin.plugins.invoke(
        'document-editor-plugin',
        'createFile',
        { defaultName: 'untitled.txt' }
      )

      if (result.canceled) {
        return
      }

      if (result.error) {
        console.error('[DocumentEditorView] Create file error:', result.error)
        alert('Failed to create file: ' + result.error)
        return
      }

      // Unwatch previous file if any
      if (this.state.currentFile) {
        await this.unwatchCurrentFile()
      }

      // Update state with new file
      this.state.currentFile = result.path
      this.state.content = result.content || ''
      this.state.extension = result.extension
      this.state.isModified = false

      // Start watching for external changes
      await this.watchCurrentFile()

      // Re-render to show editor
      this.render()
    } catch (error) {
      console.error('[DocumentEditorView] New document error:', error)
      alert('Failed to create file: ' + error.message)
    }
  }

  /**
   * Handle open file
   */
  async handleOpen() {
    // Check for unsaved changes
    if (this.state.isModified && this.state.currentFile) {
      const confirmed = confirm('You have unsaved changes. Open another file anyway?')
      if (!confirmed) return
    }

    try {
      const result = await window.puffin.plugins.invoke(
        'document-editor-plugin',
        'openFile',
        {}
      )

      if (result.canceled) {
        return
      }

      if (result.error) {
        console.error('[DocumentEditorView] Open file error:', result.error)
        alert('Failed to open file: ' + result.error)
        return
      }

      // Unwatch previous file if any
      if (this.state.currentFile) {
        await this.unwatchCurrentFile()
      }

      // Update state with opened file
      this.state.currentFile = result.path
      this.state.content = result.content
      this.state.extension = result.extension
      this.state.isModified = false

      // Start watching for external changes
      await this.watchCurrentFile()

      // Re-render to show editor with content
      this.render()
    } catch (error) {
      console.error('[DocumentEditorView] Open file error:', error)
      alert('Failed to open file: ' + error.message)
    }
  }

  /**
   * Handle save file
   */
  async handleSave() {
    if (!this.state.currentFile) return

    await this.saveFile()
  }

  /**
   * Watch current file for external changes
   */
  async watchCurrentFile() {
    if (!this.state.currentFile) return

    try {
      await window.puffin.plugins.invoke(
        'document-editor-plugin',
        'watchFile',
        { filePath: this.state.currentFile }
      )
    } catch (error) {
      console.error('[DocumentEditorView] Watch file error:', error)
    }
  }

  /**
   * Unwatch current file
   */
  async unwatchCurrentFile() {
    if (!this.state.currentFile) return

    try {
      await window.puffin.plugins.invoke(
        'document-editor-plugin',
        'unwatchFile',
        { filePath: this.state.currentFile }
      )
    } catch (error) {
      console.error('[DocumentEditorView] Unwatch file error:', error)
    }
  }

  /**
   * Handle editor input
   * @param {Event} e - Input event
   */
  handleInput(e) {
    this.state.content = e.target.value
    this.state.isModified = true
    // Debounce highlighting for performance with large files
    this.scheduleHighlighting()
    this.updateLineNumbers()
    this.updateSaveIndicator()

    if (this.state.autoSaveEnabled && this.state.currentFile) {
      this.scheduleAutoSave()
    }
  }

  /**
   * Schedule debounced syntax highlighting
   * Prevents performance issues with large files by batching highlight updates
   */
  scheduleHighlighting() {
    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout)
    }
    this.highlightTimeout = setTimeout(() => {
      this.highlightTimeout = null
      this.updateHighlighting()
    }, this.HIGHLIGHT_DELAY)
  }

  /**
   * Handle keydown in editor
   * @param {KeyboardEvent} e - Keydown event
   */
  handleKeyDown(e) {
    // Tab key inserts spaces
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.target
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const spaces = '  ' // 2 spaces
      textarea.value = this.state.content.substring(0, start) + spaces + this.state.content.substring(end)
      textarea.selectionStart = textarea.selectionEnd = start + spaces.length
      this.handleInput({ target: textarea })
    }
  }

  /**
   * Sanitize highlight.js output to ensure it only contains safe elements
   * This provides defense-in-depth against potential hljs vulnerabilities
   * @param {string} html - HTML output from highlight.js
   * @returns {string} Sanitized HTML with only safe span elements
   */
  sanitizeHighlightOutput(html) {
    if (!html) return ''

    // Create a temporary container to parse the HTML
    const temp = document.createElement('div')
    temp.innerHTML = html

    // Recursively sanitize the content
    const sanitizeNode = (node) => {
      const result = []
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          // Text nodes are safe, but escape any HTML entities
          result.push(this.escapeHtml(child.textContent))
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          // Only allow span elements with hljs-* classes
          if (child.tagName === 'SPAN') {
            const className = child.className || ''
            // Only keep hljs-* class names for security
            const safeClasses = className.split(/\s+/)
              .filter(c => c.startsWith('hljs-') || c === 'hljs')
              .join(' ')
            const innerContent = sanitizeNode(child)
            if (safeClasses) {
              result.push(`<span class="${safeClasses}">${innerContent}</span>`)
            } else {
              result.push(innerContent)
            }
          } else {
            // For non-span elements, just include their text content (escaped)
            result.push(this.escapeHtml(child.textContent))
          }
        }
      }
      return result.join('')
    }

    return sanitizeNode(temp)
  }

  /**
   * Update syntax highlighting
   * Uses highlight.js to apply language-specific syntax highlighting
   */
  updateHighlighting() {
    const highlightCode = this.container.querySelector('.document-editor-highlight-layer code')
    if (!highlightCode) return

    const content = this.state.content || ''

    // If highlight.js is not loaded, show plain text
    if (!this.hljs) {
      highlightCode.textContent = content + '\n'
      highlightCode.className = ''
      return
    }

    // Get the language based on file extension
    const language = getLanguageForExtension(this.state.extension)

    try {
      // Attempt to highlight with specific language
      if (language && language !== 'plaintext') {
        const result = this.hljs.highlight(content, {
          language,
          ignoreIllegals: true
        })
        // Sanitize hljs output to only allow safe span elements with hljs-* classes
        const sanitizedHtml = this.sanitizeHighlightOutput(result.value)
        highlightCode.innerHTML = sanitizedHtml + '\n'
        highlightCode.className = `hljs language-${language}`
      } else {
        // Plain text - no highlighting needed
        highlightCode.textContent = content + '\n'
        highlightCode.className = 'hljs'
      }
    } catch (error) {
      // Fallback to plain text on error
      console.warn('[DocumentEditorView] Highlighting failed:', error.message)
      highlightCode.textContent = content + '\n'
      highlightCode.className = 'hljs'
    }
  }

  /**
   * Update line numbers
   */
  updateLineNumbers() {
    const lineNumbers = this.container.querySelector('.document-editor-line-numbers')
    if (!lineNumbers) return

    const lines = (this.state.content || '').split('\n').length
    lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) =>
      `<div class="document-editor-line-number">${i + 1}</div>`
    ).join('')
  }

  /**
   * Sync scroll between textarea and highlight layer
   */
  syncScroll() {
    const textarea = this.container.querySelector('.document-editor-textarea')
    const pre = this.container.querySelector('.document-editor-highlight-layer')
    const lineNumbers = this.container.querySelector('.document-editor-line-numbers')

    if (textarea && pre) {
      pre.scrollTop = textarea.scrollTop
      pre.scrollLeft = textarea.scrollLeft
    }
    if (textarea && lineNumbers) {
      lineNumbers.scrollTop = textarea.scrollTop
    }
  }

  /**
   * Schedule auto-save with debounce
   */
  scheduleAutoSave() {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout)
    }

    this.autoSaveTimeout = setTimeout(() => {
      this.saveFile()
    }, this.AUTOSAVE_DELAY)
  }

  /**
   * Save file to disk
   */
  async saveFile() {
    if (!this.state.currentFile || !this.state.isModified) return

    this.updateSaveIndicator('saving')

    try {
      const result = await window.puffin.plugins.invoke(
        'document-editor-plugin',
        'saveFile',
        {
          path: this.state.currentFile,
          content: this.state.content
        }
      )

      if (result.success) {
        this.state.isModified = false
        this.updateSaveIndicator('saved')
      } else {
        console.error('[DocumentEditorView] Save error:', result.error)
        this.updateSaveIndicator('error')
      }
    } catch (error) {
      console.error('[DocumentEditorView] Save file error:', error)
      this.updateSaveIndicator('error')
    }
  }

  /**
   * Toggle auto-save
   * @param {boolean} enabled - Whether auto-save is enabled
   */
  toggleAutoSave(enabled) {
    this.state.autoSaveEnabled = enabled
    console.log('[DocumentEditorView] Auto-save:', enabled ? 'enabled' : 'disabled')

    if (enabled && this.state.isModified && this.state.currentFile) {
      this.scheduleAutoSave()
    }
  }

  /**
   * Update save indicator UI
   * @param {string} status - Optional status override
   */
  updateSaveIndicator(status) {
    const indicator = this.container.querySelector('.document-editor-save-indicator')
    const saveBtn = this.container.querySelector('[data-action="save"]')

    if (!indicator) return

    const displayStatus = status || (this.state.isModified ? 'unsaved' : 'saved')

    switch (displayStatus) {
      case 'saved':
        indicator.innerHTML = '<span class="document-editor-indicator-dot saved"></span> Saved'
        if (saveBtn) saveBtn.disabled = true
        break
      case 'unsaved':
        indicator.innerHTML = '<span class="document-editor-indicator-dot unsaved"></span> Unsaved'
        if (saveBtn) saveBtn.disabled = false
        break
      case 'saving':
        indicator.innerHTML = '<span class="document-editor-indicator-spinner"></span> Saving...'
        if (saveBtn) saveBtn.disabled = true
        break
      case 'error':
        indicator.innerHTML = '<span class="document-editor-indicator-dot error"></span> Save failed'
        if (saveBtn) saveBtn.disabled = false
        break
      default:
        indicator.innerHTML = ''
    }
  }

  /**
   * Update filename display
   */
  updateFilename() {
    const filenameEl = this.container.querySelector('.document-editor-filename')
    if (filenameEl) {
      if (this.state.currentFile) {
        const filename = this.state.currentFile.split(/[/\\]/).pop()
        filenameEl.textContent = filename
        filenameEl.title = this.state.currentFile
      } else {
        filenameEl.textContent = 'No file open'
        filenameEl.title = ''
      }
    }
  }

  /**
   * Lifecycle: Called when view is activated
   */
  onActivate() {
    console.log('[DocumentEditorView] onActivate()')
  }

  /**
   * Lifecycle: Called when view is deactivated
   */
  onDeactivate() {
    console.log('[DocumentEditorView] onDeactivate()')
  }

  /**
   * Cleanup when component is destroyed
   */
  async destroy() {
    console.log('[DocumentEditorView] destroy()')

    // Remove global keyboard listener
    document.removeEventListener('keydown', this._boundKeyDown)

    // Clean up all tracked event listeners
    this.cleanupListeners()

    // Clear auto-save timer
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout)
    }

    // Clear highlighting debounce timer
    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout)
    }

    // Save any pending changes
    if (this.state.isModified && this.state.currentFile) {
      await this.saveFile()
    }

    // Unwatch current file
    if (this.state.currentFile) {
      await this.unwatchCurrentFile()
    }

    if (this.container) {
      this.container.innerHTML = ''
      this.container = null
    }
  }
}

export default DocumentEditorView
