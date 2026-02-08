/**
 * ChunkInspector - Detail view for inspecting individual document chunks
 *
 * Displays:
 * - Full content of selected chunk with syntax highlighting (Prism.js)
 * - Chunk metadata (line range, token count, chunk strategy)
 * - Navigation controls (prev/next chunk)
 * - Context toggle to view surrounding chunks
 * - Copy-to-clipboard functionality
 *
 * Uses Prism.js for syntax highlighting, loaded dynamically.
 * Language detection based on file extension from document path.
 *
 * @module rlm-document-plugin/renderer/ChunkInspector
 */

// Prism.js instance (loaded dynamically)
let Prism = null

/**
 * Load Prism.js dynamically
 * @returns {Promise<Object|null>}
 */
async function loadPrism() {
  if (Prism) return Prism

  try {
    if (typeof window !== 'undefined' && window.require) {
      // Electron environment
      Prism = window.require('prismjs')
      // Load common language support
      try {
        window.require('prismjs/components/prism-javascript')
        window.require('prismjs/components/prism-typescript')
        window.require('prismjs/components/prism-python')
        window.require('prismjs/components/prism-json')
        window.require('prismjs/components/prism-markdown')
        window.require('prismjs/components/prism-css')
        window.require('prismjs/components/prism-markup')
      } catch (e) {
        // Languages may not be available, continue without them
      }
      return Prism
    }

    // ES module import fallback
    const module = await import('prismjs')
    Prism = module.default || module
    return Prism
  } catch (error) {
    console.warn('[ChunkInspector] Could not load Prism.js:', error.message)
    return null
  }
}

/**
 * Extension to Prism.js language mapping
 * @type {Object}
 */
const EXTENSION_TO_LANGUAGE = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  json: 'json',
  md: 'markdown',
  html: 'markup',
  htm: 'markup',
  xml: 'markup',
  css: 'css',
  scss: 'css',
  sass: 'css',
  txt: 'plaintext',
  log: 'plaintext',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'bash',
  bash: 'bash',
  sql: 'sql',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php'
}

export class ChunkInspector {
  /**
   * Component name for registration
   * @type {string}
   */
  static componentName = 'ChunkInspector'

  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} options - Component options
   * @param {Object} options.context - Plugin context with events API
   * @param {Function} options.onChunkNavigate - Callback when navigating chunks
   * @param {Object} options.chunk - Initial chunk data
   * @param {Array} options.allChunks - All available chunks for navigation
   * @param {string} options.documentPath - Path to source document
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}
    this.onChunkNavigate = options.onChunkNavigate || (() => {})

    // State
    this.state = {
      chunk: options.chunk || null,
      allChunks: options.allChunks || [],
      currentIndex: -1,
      documentPath: options.documentPath || '',
      showContext: false,
      contextChunks: [],
      loading: false,
      copySuccess: false
    }

    // Prism.js loaded state
    this._prismLoaded = false

    // Event listener tracking for cleanup
    this._eventListeners = []

    // DOM element references
    this._elements = {
      content: null,
      metadata: null,
      prevBtn: null,
      nextBtn: null,
      copyBtn: null,
      contextToggle: null
    }

    // Bound handlers
    this._handlePrevClick = this._handlePrevClick.bind(this)
    this._handleNextClick = this._handleNextClick.bind(this)
    this._handleCopyClick = this._handleCopyClick.bind(this)
    this._handleContextToggle = this._handleContextToggle.bind(this)
    this._handleKeyDown = this._handleKeyDown.bind(this)
  }

  /**
   * Initialize the component
   */
  async init() {
    this.container.className = 'chunk-inspector'
    this.container.setAttribute('role', 'region')
    this.container.setAttribute('aria-label', 'Chunk Inspector')

    // Load Prism.js
    await this._loadPrism()

    // Calculate current index if chunk provided
    if (this.state.chunk && this.state.allChunks.length > 0) {
      this._updateCurrentIndex()
    }

    this._render()
  }

  /**
   * Update the component with new chunk data
   * @param {Object} updates - State updates
   * @param {Object} updates.chunk - New chunk to display
   * @param {Array} updates.allChunks - All available chunks
   * @param {string} updates.documentPath - Document path for language detection
   */
  update(updates = {}) {
    let needsRender = false

    if ('chunk' in updates) {
      this.state.chunk = updates.chunk
      this.state.showContext = false
      this.state.contextChunks = []
      needsRender = true
    }

    if ('allChunks' in updates) {
      this.state.allChunks = updates.allChunks || []
    }

    if ('documentPath' in updates) {
      this.state.documentPath = updates.documentPath || ''
      needsRender = true
    }

    if (needsRender) {
      this._updateCurrentIndex()
      this._render()
    }
  }

  /**
   * Clear the inspector
   */
  clear() {
    this.state.chunk = null
    this.state.allChunks = []
    this.state.currentIndex = -1
    this.state.showContext = false
    this.state.contextChunks = []
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
  // PRISM.JS LOADING
  // ============================================================================

  /**
   * Load Prism.js for syntax highlighting
   * @private
   */
  async _loadPrism() {
    if (this._prismLoaded) return

    try {
      await loadPrism()
      this._prismLoaded = true
    } catch (error) {
      console.warn('[ChunkInspector] Failed to load Prism.js:', error)
    }
  }

  /**
   * Detect language from file extension
   * @param {string} filePath - File path
   * @returns {string} Prism language identifier
   * @private
   */
  _detectLanguage(filePath) {
    if (!filePath) return 'plaintext'

    const ext = filePath.split('.').pop()?.toLowerCase()
    return EXTENSION_TO_LANGUAGE[ext] || 'plaintext'
  }

  /**
   * Highlight code with Prism.js
   * @param {string} code - Code to highlight
   * @param {string} language - Language identifier
   * @returns {string} Highlighted HTML
   * @private
   */
  _highlightCode(code, language) {
    if (!Prism || !code) return this._escapeHtml(code || '')

    try {
      const grammar = Prism.languages[language]
      if (grammar) {
        return Prism.highlight(code, grammar, language)
      }
    } catch (error) {
      console.warn('[ChunkInspector] Prism highlighting failed:', error)
    }

    return this._escapeHtml(code)
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  /**
   * Render the chunk inspector
   * @private
   */
  _render() {
    this._removeAllEventListeners()

    if (!this.state.chunk) {
      this._renderEmptyState()
      return
    }

    const chunk = this.state.chunk
    const language = this._detectLanguage(this.state.documentPath)
    const content = chunk.content || chunk.excerpt || chunk.text || ''
    const highlightedContent = this._highlightCode(content, language)

    const hasPrev = this.state.currentIndex > 0
    const hasNext = this.state.currentIndex < this.state.allChunks.length - 1
    const canNavigate = this.state.allChunks.length > 1

    this.container.innerHTML = `
      <div class="chunk-inspector-content">
        <!-- Header with metadata and controls -->
        <header class="chunk-inspector-header">
          <div class="chunk-metadata">
            <span class="chunk-id" title="Chunk ID">
              ${this._escapeHtml(chunk.chunkId || `Chunk ${chunk.chunkIndex ?? this.state.currentIndex}`)}
            </span>
            ${chunk.lineRange ? `
              <span class="chunk-lines" title="Line range">
                <span class="meta-icon" aria-hidden="true">📍</span>
                Lines ${chunk.lineRange[0]}-${chunk.lineRange[1]}
              </span>
            ` : ''}
            ${chunk.tokenCount !== undefined ? `
              <span class="chunk-tokens" title="Token count">
                <span class="meta-icon" aria-hidden="true">🔢</span>
                ${chunk.tokenCount} tokens
              </span>
            ` : ''}
            ${chunk.strategy ? `
              <span class="chunk-strategy" title="Chunking strategy">
                <span class="meta-icon" aria-hidden="true">⚙️</span>
                ${this._escapeHtml(chunk.strategy)}
              </span>
            ` : ''}
          </div>

          <div class="chunk-controls">
            <!-- Context Toggle -->
            <button class="chunk-context-toggle ${this.state.showContext ? 'active' : ''}"
                    type="button"
                    title="${this.state.showContext ? 'Hide context' : 'Show surrounding chunks'}"
                    aria-pressed="${this.state.showContext}">
              <span class="btn-icon" aria-hidden="true">📖</span>
              <span class="btn-text">Context</span>
            </button>

            <!-- Copy Button -->
            <button class="chunk-copy-btn ${this.state.copySuccess ? 'success' : ''}"
                    type="button"
                    title="Copy chunk content to clipboard"
                    aria-label="Copy chunk content">
              <span class="btn-icon" aria-hidden="true">${this.state.copySuccess ? '✓' : '📋'}</span>
              <span class="btn-text">${this.state.copySuccess ? 'Copied!' : 'Copy'}</span>
            </button>

            <!-- Navigation -->
            ${canNavigate ? `
              <div class="chunk-navigation" role="group" aria-label="Chunk navigation">
                <button class="chunk-nav-btn chunk-prev-btn"
                        type="button"
                        ${hasPrev ? '' : 'disabled'}
                        title="Previous chunk"
                        aria-label="Previous chunk">
                  <span aria-hidden="true">◀</span>
                </button>
                <span class="chunk-position">
                  ${this.state.currentIndex + 1} / ${this.state.allChunks.length}
                </span>
                <button class="chunk-nav-btn chunk-next-btn"
                        type="button"
                        ${hasNext ? '' : 'disabled'}
                        title="Next chunk"
                        aria-label="Next chunk">
                  <span aria-hidden="true">▶</span>
                </button>
              </div>
            ` : ''}
          </div>
        </header>

        <!-- Context chunks (before) -->
        ${this.state.showContext && this.state.contextChunks.length > 0 ? `
          <div class="chunk-context chunk-context-before">
            <div class="context-label">Previous chunk</div>
            <pre class="chunk-code context-code"><code class="language-${language}">${this._highlightCode(this.state.contextChunks[0]?.content || '', language)}</code></pre>
          </div>
        ` : ''}

        <!-- Main chunk content -->
        <div class="chunk-content-wrapper ${this.state.showContext ? 'with-context' : ''}">
          ${this.state.loading ? `
            <div class="chunk-loading" role="status">
              <span class="loading-spinner" aria-hidden="true"></span>
              <span>Loading chunk content...</span>
            </div>
          ` : `
            <pre class="chunk-code" tabindex="0"><code class="language-${language}">${highlightedContent}</code></pre>
          `}
        </div>

        <!-- Context chunks (after) -->
        ${this.state.showContext && this.state.contextChunks.length > 1 ? `
          <div class="chunk-context chunk-context-after">
            <div class="context-label">Next chunk</div>
            <pre class="chunk-code context-code"><code class="language-${language}">${this._highlightCode(this.state.contextChunks[1]?.content || '', language)}</code></pre>
          </div>
        ` : ''}

        <!-- Chunk point/finding if available -->
        ${chunk.point ? `
          <div class="chunk-finding">
            <span class="finding-label">Finding:</span>
            <span class="finding-text">${this._escapeHtml(chunk.point)}</span>
          </div>
        ` : ''}
      </div>
    `

    // Cache element references
    this._elements.content = this.container.querySelector('.chunk-code')
    this._elements.prevBtn = this.container.querySelector('.chunk-prev-btn')
    this._elements.nextBtn = this.container.querySelector('.chunk-next-btn')
    this._elements.copyBtn = this.container.querySelector('.chunk-copy-btn')
    this._elements.contextToggle = this.container.querySelector('.chunk-context-toggle')

    // Attach event handlers
    this._attachEventHandlers()
  }

  /**
   * Render empty state when no chunk is selected
   * @private
   */
  _renderEmptyState() {
    this.container.innerHTML = `
      <div class="chunk-inspector-empty">
        <span class="empty-icon" aria-hidden="true">🔍</span>
        <p class="empty-message">Select a result to inspect the chunk</p>
        <p class="empty-hint">Click on a result in the tree view above</p>
      </div>
    `
  }

  /**
   * Attach event handlers
   * @private
   */
  _attachEventHandlers() {
    if (this._elements.prevBtn) {
      this._addEventListener(this._elements.prevBtn, 'click', this._handlePrevClick)
    }

    if (this._elements.nextBtn) {
      this._addEventListener(this._elements.nextBtn, 'click', this._handleNextClick)
    }

    if (this._elements.copyBtn) {
      this._addEventListener(this._elements.copyBtn, 'click', this._handleCopyClick)
    }

    if (this._elements.contextToggle) {
      this._addEventListener(this._elements.contextToggle, 'click', this._handleContextToggle)
    }

    // Keyboard navigation
    this._addEventListener(this.container, 'keydown', this._handleKeyDown)
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle previous chunk button click
   * @private
   */
  _handlePrevClick() {
    if (this.state.currentIndex > 0) {
      this._navigateToChunk(this.state.currentIndex - 1)
    }
  }

  /**
   * Handle next chunk button click
   * @private
   */
  _handleNextClick() {
    if (this.state.currentIndex < this.state.allChunks.length - 1) {
      this._navigateToChunk(this.state.currentIndex + 1)
    }
  }

  /**
   * Navigate to a specific chunk index
   * @param {number} index
   * @private
   */
  _navigateToChunk(index) {
    if (index < 0 || index >= this.state.allChunks.length) return

    const chunk = this.state.allChunks[index]
    this.state.currentIndex = index
    this.state.chunk = chunk
    this.state.showContext = false
    this.state.contextChunks = []

    this._render()

    // Emit navigation event
    this.onChunkNavigate(chunk, index)

    if (this.context.events?.emit) {
      this.context.events.emit('chunk:navigated', { chunk, index })
    }
  }

  /**
   * Handle copy button click
   * @private
   */
  async _handleCopyClick() {
    const content = this.state.chunk?.content ||
                    this.state.chunk?.excerpt ||
                    this.state.chunk?.text || ''

    if (!content) return

    try {
      await navigator.clipboard.writeText(content)

      // Show success state
      this.state.copySuccess = true
      this._render()

      // Reset after delay
      setTimeout(() => {
        this.state.copySuccess = false
        this._render()
      }, 2000)

      // Emit event
      if (this.context.events?.emit) {
        this.context.events.emit('chunk:copied', {
          chunkId: this.state.chunk.chunkId,
          length: content.length
        })
      }
    } catch (error) {
      console.error('[ChunkInspector] Copy failed:', error)
    }
  }

  /**
   * Handle context toggle button click
   * @private
   */
  async _handleContextToggle() {
    this.state.showContext = !this.state.showContext

    if (this.state.showContext && this.state.contextChunks.length === 0) {
      await this._loadContextChunks()
    }

    this._render()
  }

  /**
   * Load surrounding chunks for context view
   * @private
   */
  async _loadContextChunks() {
    if (this.state.currentIndex < 0) return

    const prevIndex = this.state.currentIndex - 1
    const nextIndex = this.state.currentIndex + 1
    const contextChunks = []

    // Get previous chunk
    if (prevIndex >= 0 && this.state.allChunks[prevIndex]) {
      contextChunks.push(this.state.allChunks[prevIndex])
    } else {
      contextChunks.push(null)
    }

    // Get next chunk
    if (nextIndex < this.state.allChunks.length && this.state.allChunks[nextIndex]) {
      contextChunks.push(this.state.allChunks[nextIndex])
    } else {
      contextChunks.push(null)
    }

    this.state.contextChunks = contextChunks
  }

  /**
   * Handle keyboard navigation
   * @param {KeyboardEvent} event
   * @private
   */
  _handleKeyDown(event) {
    switch (event.key) {
      case 'ArrowLeft':
      case 'PageUp':
        if (this.state.currentIndex > 0) {
          event.preventDefault()
          this._handlePrevClick()
        }
        break

      case 'ArrowRight':
      case 'PageDown':
        if (this.state.currentIndex < this.state.allChunks.length - 1) {
          event.preventDefault()
          this._handleNextClick()
        }
        break

      case 'c':
        if (event.ctrlKey || event.metaKey) {
          // Let default copy work if text is selected
          const selection = window.getSelection()
          if (!selection || selection.toString().length === 0) {
            event.preventDefault()
            this._handleCopyClick()
          }
        }
        break

      case 'Home':
        if (this.state.allChunks.length > 0) {
          event.preventDefault()
          this._navigateToChunk(0)
        }
        break

      case 'End':
        if (this.state.allChunks.length > 0) {
          event.preventDefault()
          this._navigateToChunk(this.state.allChunks.length - 1)
        }
        break
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Update current index based on chunk in allChunks
   * @private
   */
  _updateCurrentIndex() {
    if (!this.state.chunk || this.state.allChunks.length === 0) {
      this.state.currentIndex = -1
      return
    }

    // Find by chunkId first, then by index
    const chunkId = this.state.chunk.chunkId
    let index = this.state.allChunks.findIndex(c => c.chunkId === chunkId)

    if (index === -1 && this.state.chunk.chunkIndex !== undefined) {
      index = this.state.allChunks.findIndex(c => c.chunkIndex === this.state.chunk.chunkIndex)
    }

    this.state.currentIndex = index >= 0 ? index : 0
  }

  /**
   * Add event listener with tracking for cleanup
   * @param {HTMLElement} element
   * @param {string} event
   * @param {Function} handler
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
   * @param {string} str
   * @returns {string}
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
export default ChunkInspector
