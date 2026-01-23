/**
 * RLMDocumentView - Main container component for the RLM Document Plugin UI
 * Vanilla JavaScript implementation (no JSX)
 *
 * Layout Structure (Fixed Flexbox):
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ [Session Status Display]                                              │
 * ├────────────────────────┬─────────────────────────────────────────────┤
 * │ Document Picker        │              Results Tree                    │
 * │ ──────────────────     │                                              │
 * │ Query Panel            │                                              │
 * │ [Export Controls]      │                                              │
 * ├────────────────────────┴─────────────────────────────────────────────┤
 * │                    Chunk Inspector                                    │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Key Features:
 * - Fixed flexbox layout (resizable panes deferred to future iteration)
 * - Centralized state management with unidirectional data flow
 * - Session persistence via context.storage (project-scoped)
 * - Automatic last-session restoration on activation
 *
 * Lifecycle:
 * - constructor(element, options): Initialize instance
 * - init(): Build DOM, attach event handlers
 * - onActivate(context): Restore last session, start polling
 * - onDeactivate(context): Save state, stop polling
 * - onDestroy(context): Final cleanup, remove all listeners
 *
 * @module rlm-document-plugin/renderer/RLMDocumentView
 */

import { SessionStatusDisplay } from './SessionStatusDisplay.js'
import { DocumentPicker } from './DocumentPicker.js'
import { QueryPanel } from './QueryPanel.js'
import { ResultsTree } from './ResultsTree.js'
import { ChunkInspector } from './ChunkInspector.js'
import { ExportControls } from './ExportControls.js'

export class RLMDocumentView {
  /**
   * Plugin component name for registration
   * @type {string}
   */
  static componentName = 'RLMDocumentView'

  /**
   * @param {HTMLElement} element - Container element provided by Puffin
   * @param {Object} options - Component options from plugin loader
   * @param {string} options.viewId - Unique view identifier
   * @param {Object} options.view - View configuration from manifest
   * @param {string} options.pluginName - Plugin name ('rlm-document-plugin')
   * @param {Object} options.context - Plugin context with storage, logging, events APIs
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}
    this.viewId = options.viewId || 'rlm-document-view'
    this.pluginName = options.pluginName || 'rlm-document-plugin'

    // State management
    this.state = {
      // Session state
      session: null,
      replConnected: false,

      // Document state
      document: null,

      // Query state
      query: {
        text: '',
        type: 'query', // 'query' | 'peek' | 'grep'
        loading: false,
        error: null
      },

      // Results state
      results: {
        items: [],
        sortBy: 'relevance', // 'relevance' | 'position'
        filter: ''
      },

      // Selected chunk for inspector
      selectedChunk: null,

      // UI state
      initialized: false,
      loading: true,
      error: null
    }

    // Event listener references for cleanup
    this._eventListeners = []
    this._ipcListeners = []

    // Polling interval reference
    this._sessionPollInterval = null

    // Bound method references for event handlers
    this._boundHandlers = {}

    // Child component instances
    this._components = {
      sessionStatus: null,
      documentPicker: null,
      queryPanel: null,
      resultsTree: null,
      chunkInspector: null,
      exportControls: null
    }

    // Log initialization
    this._log('debug', 'Constructor called', { viewId: this.viewId })
  }

  /**
   * Initialize the component - called after construction
   * Builds DOM structure and attaches event handlers
   */
  async init() {
    this._log('info', 'Initializing RLM Document View')

    try {
      // Set container class
      this.container.className = 'rlm-document-view'

      // Render initial loading state
      this._renderLoadingState()

      // Mark as initialized
      this.state.initialized = true
      this.state.loading = false

      // Render the main view structure
      this._render()

      this._log('info', 'Initialization complete')
    } catch (error) {
      this._log('error', 'Initialization failed', { error: error.message })
      this.state.error = error.message
      this._renderErrorState(error.message)
    }
  }

  /**
   * Lifecycle: Called when view becomes active (navigated to)
   * Restores last session if available
   * @param {Object} context - Updated plugin context
   */
  async onActivate(context) {
    this._log('info', 'View activated')

    // Update context reference
    if (context) {
      this.context = context
    }

    // Attempt to restore last session
    await this._restoreLastSession()

    // Start session polling if we have an active session
    if (this.state.session) {
      this._startSessionPolling()
    }
  }

  /**
   * Lifecycle: Called when view becomes inactive (navigated away)
   * Saves state and stops polling
   * @param {Object} context - Plugin context
   */
  async onDeactivate(context) {
    this._log('info', 'View deactivated')

    // Stop session polling
    this._stopSessionPolling()

    // Save current session ID for restoration
    if (this.state.session?.id) {
      await this._saveLastSessionId(this.state.session.id)
    }
  }

  /**
   * Lifecycle: Called when component is being destroyed
   * Performs final cleanup
   * @param {Object} context - Plugin context
   */
  async onDestroy(context) {
    this._log('info', 'Destroying RLM Document View')

    // Stop polling
    this._stopSessionPolling()

    // Destroy child components
    this._destroyChildComponents()

    // Remove all event listeners
    this._removeAllEventListeners()

    // Clear container
    if (this.container) {
      this.container.innerHTML = ''
      this.container.className = ''
    }

    // Clear state
    this.state = null

    this._log('info', 'Destruction complete')
  }

  // ============================================================================
  // RENDERING METHODS
  // ============================================================================

  /**
   * Render loading state
   * @private
   */
  _renderLoadingState() {
    this.container.innerHTML = `
      <div class="rlm-loading-state" role="status" aria-busy="true">
        <div class="rlm-spinner"></div>
        <p>Initializing RLM Document Analyzer...</p>
      </div>
    `
  }

  /**
   * Render error state
   * @param {string} message - Error message to display
   * @private
   */
  _renderErrorState(message) {
    this.container.innerHTML = `
      <div class="rlm-error-state" role="alert">
        <span class="rlm-error-icon" aria-hidden="true">⚠️</span>
        <h3>Error</h3>
        <p>${this._escapeHtml(message)}</p>
        <button class="rlm-retry-btn" type="button">Retry</button>
      </div>
    `

    // Attach retry handler
    const retryBtn = this.container.querySelector('.rlm-retry-btn')
    if (retryBtn) {
      this._addEventListener(retryBtn, 'click', () => {
        this.state.error = null
        this.state.loading = true
        this.init()
      })
    }
  }

  /**
   * Main render method - builds the complete view structure
   * @private
   */
  _render() {
    // Destroy existing child components
    this._destroyChildComponents()

    // Clear container
    this.container.innerHTML = ''

    // Build main structure
    const html = `
      <div class="rlm-document-view-container">
        <!-- Session Status Bar - rendered by SessionStatusDisplay component -->
        <div class="rlm-session-status-container"></div>

        <!-- Main Content Area -->
        <main class="rlm-main-content">
          <!-- Left Panel: Document Picker + Query Panel -->
          <aside class="rlm-left-panel">
            <section class="rlm-document-picker-section" aria-labelledby="document-picker-heading">
              <h2 id="document-picker-heading" class="rlm-section-heading">Document</h2>
              <div class="rlm-document-picker-container">
                <!-- DocumentPicker component will be rendered here -->
              </div>
            </section>

            <section class="rlm-query-section" aria-labelledby="query-heading">
              <h2 id="query-heading" class="rlm-section-heading">Query</h2>
              <div class="rlm-query-panel-container">
                <!-- QueryPanel component will be rendered here -->
              </div>
            </section>

            <section class="rlm-export-section" aria-labelledby="export-heading">
              <h2 id="export-heading" class="rlm-section-heading">Export</h2>
              <div class="rlm-export-controls-container">
                <!-- ExportControls component will be rendered here -->
              </div>
            </section>
          </aside>

          <!-- Right Panel: Results Tree -->
          <section class="rlm-right-panel" aria-labelledby="results-heading">
            <h2 id="results-heading" class="rlm-section-heading">Results</h2>
            <div class="rlm-results-tree-container">
              <!-- ResultsTree component will be rendered here -->
            </div>
          </section>
        </main>

        <!-- Bottom Panel: Chunk Inspector -->
        <footer class="rlm-chunk-inspector-section" aria-labelledby="inspector-heading">
          <h2 id="inspector-heading" class="rlm-section-heading">Chunk Inspector</h2>
          <div class="rlm-chunk-inspector-container">
            <!-- ChunkInspector component will be rendered here -->
          </div>
        </footer>
      </div>
    `

    this.container.innerHTML = html

    // Initialize child components
    this._initChildComponents()

    // Attach event handlers
    this._attachEventHandlers()
  }

  /**
   * Initialize child components
   * @private
   */
  _initChildComponents() {
    // Initialize SessionStatusDisplay
    const statusContainer = this.container.querySelector('.rlm-session-status-container')
    if (statusContainer) {
      this._components.sessionStatus = new SessionStatusDisplay(statusContainer, {
        context: this.context,
        onCloseSession: () => this._handleCloseSession()
      })
      this._components.sessionStatus.init()
      this._components.sessionStatus.update({
        session: this.state.session,
        replConnected: this.state.replConnected
      })
    }

    // Initialize DocumentPicker
    const pickerContainer = this.container.querySelector('.rlm-document-picker-container')
    if (pickerContainer) {
      this._components.documentPicker = new DocumentPicker(pickerContainer, {
        context: this.context,
        onDocumentSelected: (document) => this._handleDocumentSelected(document)
      })
      this._components.documentPicker.init()

      // Update with current document if exists
      if (this.state.document) {
        this._components.documentPicker.update({ selectedDocument: this.state.document })
      }
    }

    // Initialize QueryPanel
    const queryContainer = this.container.querySelector('.rlm-query-panel-container')
    if (queryContainer) {
      this._components.queryPanel = new QueryPanel(queryContainer, {
        context: this.context,
        session: this.state.session,
        chunkStrategy: this.state.session?.chunkStrategy || null,
        onQuerySubmit: (query) => this._handleQuerySubmit(query)
      })
      this._components.queryPanel.init()
    }

    // Initialize ResultsTree
    const resultsContainer = this.container.querySelector('.rlm-results-tree-container')
    if (resultsContainer) {
      this._components.resultsTree = new ResultsTree(resultsContainer, {
        context: this.context,
        results: this.state.results.items,
        onResultSelect: (result) => this._handleResultSelect(result)
      })
      this._components.resultsTree.init()
    }

    // Initialize ChunkInspector
    const inspectorContainer = this.container.querySelector('.rlm-chunk-inspector-container')
    if (inspectorContainer) {
      this._components.chunkInspector = new ChunkInspector(inspectorContainer, {
        context: this.context,
        session: this.state.session,
        chunk: this.state.selectedChunk,
        allChunks: this.state.results.items,
        onChunkNavigate: (chunk) => this._handleChunkNavigate(chunk)
      })
      this._components.chunkInspector.init()
    }

    // Initialize ExportControls
    const exportContainer = this.container.querySelector('.rlm-export-controls-container')
    if (exportContainer) {
      this._components.exportControls = new ExportControls(exportContainer, {
        context: this.context,
        session: this.state.session,
        results: this.state.results.items,
        onExportComplete: (result) => this._handleExportComplete(result)
      })
      this._components.exportControls.init()
    }
  }

  /**
   * Destroy all child components
   * @private
   */
  _destroyChildComponents() {
    if (this._components.sessionStatus) {
      this._components.sessionStatus.onDestroy()
      this._components.sessionStatus = null
    }
    if (this._components.documentPicker) {
      this._components.documentPicker.onDestroy()
      this._components.documentPicker = null
    }
    if (this._components.queryPanel) {
      this._components.queryPanel.onDestroy()
      this._components.queryPanel = null
    }
    if (this._components.resultsTree) {
      this._components.resultsTree.onDestroy()
      this._components.resultsTree = null
    }
    if (this._components.chunkInspector) {
      this._components.chunkInspector.onDestroy()
      this._components.chunkInspector = null
    }
    if (this._components.exportControls) {
      this._components.exportControls.onDestroy()
      this._components.exportControls = null
    }
  }

  /**
   * Attach event handlers to rendered elements
   * @private
   */
  _attachEventHandlers() {
    // Listen for session close events from child components
    if (this.context.events?.on) {
      this.context.events.on('session:close-requested', () => this._handleCloseSession())
    }

    // Listen for document selection events
    if (this.context.events?.on) {
      this.context.events.on('document:selected', (data) => this._handleDocumentSelected(data))
    }
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Restore last session from storage
   * @private
   */
  async _restoreLastSession() {
    try {
      const lastSessionId = await this._getStorageValue('lastSessionId')
      if (!lastSessionId) {
        this._log('debug', 'No last session to restore')
        return
      }

      this._log('info', 'Attempting to restore session', { sessionId: lastSessionId })

      // Try to get the session via IPC
      const result = await this._callIpc('rlm:get-session', { sessionId: lastSessionId })

      if (result?.session && result.session.state === 'active') {
        this.state.session = result.session
        this.state.replConnected = result.replStatus?.connected || false

        // If session has a document, restore that too
        if (result.session.documentPath) {
          this.state.document = {
            path: result.session.documentPath,
            name: result.session.documentPath.split(/[/\\]/).pop()
          }
        }

        this._log('info', 'Session restored successfully')
        this._render()
      } else {
        this._log('info', 'Last session no longer active, clearing')
        await this._clearStorageValue('lastSessionId')
      }
    } catch (error) {
      this._log('warn', 'Failed to restore last session', { error: error.message })
    }
  }

  /**
   * Save last session ID to storage
   * @param {string} sessionId - Session ID to save
   * @private
   */
  async _saveLastSessionId(sessionId) {
    try {
      await this._setStorageValue('lastSessionId', sessionId)
    } catch (error) {
      this._log('warn', 'Failed to save last session ID', { error: error.message })
    }
  }

  /**
   * Start polling for session status updates
   * @private
   */
  _startSessionPolling() {
    if (this._sessionPollInterval) return

    this._sessionPollInterval = setInterval(async () => {
      await this._pollSessionStatus()
    }, 5000) // Poll every 5 seconds
  }

  /**
   * Stop session status polling
   * @private
   */
  _stopSessionPolling() {
    if (this._sessionPollInterval) {
      clearInterval(this._sessionPollInterval)
      this._sessionPollInterval = null
    }
  }

  /**
   * Poll for session status updates
   * @private
   */
  async _pollSessionStatus() {
    if (!this.state.session?.id) return

    try {
      const result = await this._callIpc('rlm:get-session', { sessionId: this.state.session.id })
      if (result?.replStatus) {
        const wasConnected = this.state.replConnected
        this.state.replConnected = result.replStatus.connected

        // Re-render status if connection state changed
        if (wasConnected !== this.state.replConnected) {
          this._updateSessionStatus()
        }
      }
    } catch (error) {
      this._log('warn', 'Session poll failed', { error: error.message })
    }
  }

  /**
   * Update just the session status display without full re-render
   * @private
   */
  _updateSessionStatus() {
    // Update the SessionStatusDisplay component
    if (this._components.sessionStatus) {
      this._components.sessionStatus.update({
        session: this.state.session,
        replConnected: this.state.replConnected
      })
    }
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle close session button click
   * @private
   */
  async _handleCloseSession() {
    if (!this.state.session?.id) return

    try {
      this._log('info', 'Closing session', { sessionId: this.state.session.id })

      await this._callIpc('rlm:close-session', { sessionId: this.state.session.id })
      await this._clearStorageValue('lastSessionId')

      // Reset state
      this.state.session = null
      this.state.replConnected = false
      this.state.document = null
      this.state.results = { items: [], sortBy: 'relevance', filter: '' }
      this.state.selectedChunk = null

      this._stopSessionPolling()
      this._render()

      this._log('info', 'Session closed')
    } catch (error) {
      this._log('error', 'Failed to close session', { error: error.message })
    }
  }

  /**
   * Handle document selection from DocumentPicker
   * @param {Object} document - Selected document details
   * @param {string} document.path - Full file path
   * @param {string} document.name - File name
   * @param {number} document.size - File size in bytes
   * @param {string} document.type - File type/extension
   * @private
   */
  async _handleDocumentSelected(document) {
    this._log('info', 'Document selected', { path: document?.path, name: document?.name })

    if (!document?.path) {
      this._log('warn', 'Invalid document selection')
      return
    }

    // Update document state
    this.state.document = document

    try {
      // Initialize a new session for this document
      this._log('info', 'Initializing RLM session for document')

      const result = await this._callIpc('rlm:init-session', {
        documentPath: document.path
      })

      if (result?.session) {
        this.state.session = result.session
        this.state.replConnected = result.replStatus?.connected || false

        // Save session ID for restoration
        await this._saveLastSessionId(result.session.id)

        // Start session polling
        this._startSessionPolling()

        // Update components with new session
        this._updateSessionStatus()

        // Update QueryPanel with session info
        if (this._components.queryPanel) {
          this._components.queryPanel.update({
            session: this.state.session,
            chunkStrategy: this.state.session.chunkStrategy
          })
        }

        // Emit event for other interested components
        if (this.context.events?.emit) {
          this.context.events.emit('session:started', {
            session: this.state.session,
            document: this.state.document
          })
        }

        this._log('info', 'Session initialized successfully', { sessionId: result.session.id })
      } else {
        throw new Error('Failed to create session')
      }
    } catch (error) {
      this._log('error', 'Failed to initialize session', { error: error.message })

      // Clear document state on failure
      this.state.document = null

      // Show error in UI
      if (this._components.documentPicker) {
        this._components.documentPicker.update({ error: error.message })
      }
    }
  }

  /**
   * Handle query submission from QueryPanel
   * @param {Object} query - Query details
   * @param {string} query.type - Query type (query, peek, grep)
   * @param {string} query.text - Query text
   * @param {Object} query.params - IPC parameters
   * @param {string} query.sessionId - Session ID
   * @private
   */
  async _handleQuerySubmit(query) {
    this._log('info', 'Query submitted', { type: query.type, text: query.text })

    // Update query state
    this.state.query = {
      text: query.text,
      type: query.type,
      loading: true,
      error: null
    }

    // Update QueryPanel loading state
    if (this._components.queryPanel) {
      this._components.queryPanel.update({ loading: true, error: null })
    }

    try {
      // Determine the IPC channel based on query type
      const ipcChannel = this._getQueryIpcChannel(query.type)

      // Execute the query
      const result = await this._callIpc(ipcChannel, query.params)

      // Update results state
      this.state.results = {
        items: result?.results || result?.chunks || result?.matches || [],
        sortBy: 'relevance',
        filter: ''
      }

      // Clear query loading state
      this.state.query.loading = false

      // Update QueryPanel
      if (this._components.queryPanel) {
        this._components.queryPanel.update({ loading: false })
      }

      // Update ResultsTree with new results
      if (this._components.resultsTree) {
        this._components.resultsTree.update({ results: this.state.results.items })
      }

      // Update ExportControls with new results
      if (this._components.exportControls) {
        this._components.exportControls.update({
          session: this.state.session,
          results: this.state.results.items
        })
      }

      // Emit results event for other components
      if (this.context.events?.emit) {
        this.context.events.emit('query:results', {
          type: query.type,
          results: this.state.results.items
        })
      }

      this._log('info', 'Query completed', { resultCount: this.state.results.items.length })

    } catch (error) {
      this._log('error', 'Query failed', { error: error.message })

      // Update error state
      this.state.query.loading = false
      this.state.query.error = error.message

      // Update QueryPanel with error
      if (this._components.queryPanel) {
        this._components.queryPanel.update({
          loading: false,
          error: error.message || 'Query failed'
        })
      }
    }
  }

  /**
   * Handle result selection from ResultsTree
   * @param {Object} result - Selected result data
   * @private
   */
  _handleResultSelect(result) {
    this._log('debug', 'Result selected', { chunkId: result?.chunkId, chunkIndex: result?.chunkIndex })

    // Update selected chunk state
    this.state.selectedChunk = result

    // Update ChunkInspector with selected chunk
    if (this._components.chunkInspector) {
      this._components.chunkInspector.update({
        chunk: result,
        allChunks: this.state.results.items
      })
    }

    // Emit event for other interested components
    if (this.context.events?.emit) {
      this.context.events.emit('chunk:selected', { result })
    }
  }

  /**
   * Handle chunk navigation from ChunkInspector
   * @param {Object} chunk - Navigated chunk data
   * @private
   */
  _handleChunkNavigate(chunk) {
    this._log('debug', 'Chunk navigate', { chunkId: chunk?.chunkId, chunkIndex: chunk?.chunkIndex })

    // Update selected chunk state
    this.state.selectedChunk = chunk

    // Update ResultsTree selection to match
    if (this._components.resultsTree) {
      this._components.resultsTree.update({ selectedResult: chunk })
    }

    // Emit event for other interested components
    if (this.context.events?.emit) {
      this.context.events.emit('chunk:selected', { result: chunk })
    }
  }

  /**
   * Handle export completion from ExportControls
   * @param {Object} result - Export result data
   * @param {string} result.format - Export format used
   * @param {string} result.filePath - Path to exported file
   * @private
   */
  _handleExportComplete(result) {
    this._log('info', 'Export completed', { format: result?.format, filePath: result?.filePath })

    // Emit event for other interested components
    if (this.context.events?.emit) {
      this.context.events.emit('export:complete', result)
    }
  }

  /**
   * Get the IPC channel for a query type
   * @param {string} queryType - Query type
   * @returns {string} IPC channel name
   * @private
   */
  _getQueryIpcChannel(queryType) {
    const channels = {
      query: 'rlm:query',
      peek: 'rlm:peek',
      grep: 'rlm:grep'
    }
    return channels[queryType] || 'rlm:query'
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Add event listener with tracking for cleanup
   * @param {HTMLElement} element - Element to attach listener to
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
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
   * Call IPC handler
   * @param {string} channel - IPC channel name
   * @param {Object} data - Data to send
   * @returns {Promise<any>} IPC response
   * @private
   */
  async _callIpc(channel, data = {}) {
    if (window.puffinAPI?.invoke) {
      return window.puffinAPI.invoke(channel, data)
    }
    throw new Error('IPC not available')
  }

  /**
   * Get value from plugin storage
   * @param {string} key - Storage key
   * @returns {Promise<any>} Stored value
   * @private
   */
  async _getStorageValue(key) {
    if (this.context.storage?.get) {
      return this.context.storage.get(key)
    }
    return null
  }

  /**
   * Set value in plugin storage
   * @param {string} key - Storage key
   * @param {any} value - Value to store
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async _setStorageValue(key, value) {
    if (this.context.storage?.set) {
      return this.context.storage.set(key, value)
    }
    return false
  }

  /**
   * Clear value from plugin storage
   * @param {string} key - Storage key
   * @returns {Promise<boolean>} Success status
   * @private
   */
  async _clearStorageValue(key) {
    if (this.context.storage?.delete) {
      return this.context.storage.delete(key)
    }
    return false
  }

  /**
   * Log message using plugin context or console
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @private
   */
  _log(level, message, data = {}) {
    const prefix = '[RLMDocumentView]'
    const logFn = this.context.log?.[level] || console[level] || console.log
    logFn(`${prefix} ${message}`, data)
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
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
export default RLMDocumentView
