/**
 * ExportControls Component - Export functionality for RLM query results
 *
 * Provides export button with format selection for saving analysis results.
 * Supports JSON and Markdown export formats via IPC handlers.
 *
 * Features:
 * - Export button (disabled when no results)
 * - Format dropdown: JSON, Markdown
 * - Loading spinner during export
 * - Success/error toast notifications
 * - Opens/reveals exported file location
 *
 * @module rlm-document-plugin/renderer/ExportControls
 */

import { toastManager } from './Toast.js'

/**
 * Export format configuration
 * @type {Object}
 */
const EXPORT_FORMATS = {
  json: {
    id: 'json',
    label: 'JSON',
    extension: '.json',
    description: 'Structured JSON format for programmatic use'
  },
  markdown: {
    id: 'markdown',
    label: 'Markdown',
    extension: '.md',
    description: 'Human-readable Markdown for documentation'
  }
}

/**
 * ExportControls class component
 */
export class ExportControls {
  /**
   * Plugin component name for registration
   * @type {string}
   */
  static componentName = 'ExportControls'

  /**
   * @param {HTMLElement} element - Container element provided by parent
   * @param {Object} options - Component options
   * @param {Object} options.context - Plugin context with storage, logging, events APIs
   * @param {Object} options.session - Current session object
   * @param {Array} options.results - Current query results
   * @param {Function} options.onExportComplete - Callback when export completes
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}
    this.session = options.session || null
    this.results = options.results || []
    this.onExportComplete = options.onExportComplete || null

    // Component state
    this.state = {
      selectedFormat: 'json',
      exporting: false,
      formats: Object.values(EXPORT_FORMATS),
      error: null
    }

    // Event listener tracking for cleanup
    this._eventListeners = []

    // DOM element references
    this._elements = {
      formatSelect: null,
      exportBtn: null,
      spinner: null
    }

    this._log('debug', 'Constructor called')
  }

  /**
   * Initialize the component
   */
  async init() {
    this._log('info', 'Initializing ExportControls')

    try {
      // Fetch available export formats from backend (optional enhancement)
      await this._fetchExportFormats()

      // Render the component
      this._render()

      // Attach event handlers
      this._attachEventHandlers()

      this._log('info', 'Initialization complete')
    } catch (error) {
      this._log('error', 'Initialization failed', { error: error.message })
      this.state.error = error.message
    }
  }

  /**
   * Update component state
   * @param {Object} updates - State updates
   */
  update(updates = {}) {
    if (updates.session !== undefined) {
      this.session = updates.session
    }
    if (updates.results !== undefined) {
      this.results = updates.results
    }
    if (updates.selectedFormat !== undefined) {
      this.state.selectedFormat = updates.selectedFormat
    }

    // Update UI state
    this._updateButtonState()
  }

  /**
   * Lifecycle: Called when component is being destroyed
   */
  onDestroy() {
    this._log('debug', 'Destroying ExportControls')

    // Remove all event listeners
    this._removeAllEventListeners()

    // Clear container
    if (this.container) {
      this.container.innerHTML = ''
    }

    // Clear references
    this._elements = {}
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  /**
   * Render the component
   * @private
   */
  _render() {
    const hasResults = this.results && this.results.length > 0
    const hasSession = this.session && this.session.id

    this.container.innerHTML = `
      <div class="rlm-export-controls" role="group" aria-label="Export controls">
        <div class="rlm-export-format-group">
          <label for="rlm-export-format" class="rlm-export-format-label">
            Format
          </label>
          <select
            id="rlm-export-format"
            class="rlm-export-format-select"
            aria-describedby="rlm-export-format-desc"
            ${!hasResults || !hasSession ? 'disabled' : ''}
          >
            ${this.state.formats.map(format => `
              <option
                value="${format.id}"
                ${format.id === this.state.selectedFormat ? 'selected' : ''}
              >
                ${format.label}
              </option>
            `).join('')}
          </select>
          <span id="rlm-export-format-desc" class="visually-hidden">
            Select the export file format
          </span>
        </div>

        <button
          type="button"
          class="rlm-export-btn ${this.state.exporting ? 'rlm-export-btn-loading' : ''}"
          ${!hasResults || !hasSession || this.state.exporting ? 'disabled' : ''}
          aria-busy="${this.state.exporting}"
          aria-describedby="rlm-export-btn-desc"
        >
          <span class="rlm-export-btn-icon" aria-hidden="true">
            ${this.state.exporting ? this._getSpinnerSvg() : this._getExportIconSvg()}
          </span>
          <span class="rlm-export-btn-text">
            ${this.state.exporting ? 'Exporting...' : 'Export Results'}
          </span>
        </button>
        <span id="rlm-export-btn-desc" class="visually-hidden">
          ${!hasResults
            ? 'Export is disabled because there are no results to export'
            : !hasSession
              ? 'Export is disabled because no session is active'
              : 'Export query results to the selected format'}
        </span>

        ${!hasResults ? `
          <p class="rlm-export-hint">Run a query to enable export</p>
        ` : ''}
      </div>
    `

    // Store element references
    this._elements.formatSelect = this.container.querySelector('.rlm-export-format-select')
    this._elements.exportBtn = this.container.querySelector('.rlm-export-btn')
  }

  /**
   * Update button state without full re-render
   * @private
   */
  _updateButtonState() {
    if (!this._elements.exportBtn || !this._elements.formatSelect) return

    const hasResults = this.results && this.results.length > 0
    const hasSession = this.session && this.session.id
    const canExport = hasResults && hasSession && !this.state.exporting

    // Update button
    this._elements.exportBtn.disabled = !canExport
    this._elements.exportBtn.setAttribute('aria-busy', this.state.exporting.toString())

    if (this.state.exporting) {
      this._elements.exportBtn.classList.add('rlm-export-btn-loading')
      this._elements.exportBtn.querySelector('.rlm-export-btn-icon').innerHTML = this._getSpinnerSvg()
      this._elements.exportBtn.querySelector('.rlm-export-btn-text').textContent = 'Exporting...'
    } else {
      this._elements.exportBtn.classList.remove('rlm-export-btn-loading')
      this._elements.exportBtn.querySelector('.rlm-export-btn-icon').innerHTML = this._getExportIconSvg()
      this._elements.exportBtn.querySelector('.rlm-export-btn-text').textContent = 'Export Results'
    }

    // Update select
    this._elements.formatSelect.disabled = !canExport

    // Update hint visibility
    const hint = this.container.querySelector('.rlm-export-hint')
    if (hint) {
      hint.style.display = hasResults ? 'none' : 'block'
    }
  }

  /**
   * Get export icon SVG
   * @returns {string} SVG HTML
   * @private
   */
  _getExportIconSvg() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `
  }

  /**
   * Get spinner SVG for loading state
   * @returns {string} SVG HTML
   * @private
   */
  _getSpinnerSvg() {
    return `
      <svg class="rlm-export-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="32">
          <animate attributeName="stroke-dashoffset" values="32;0" dur="1s" repeatCount="indefinite"/>
        </circle>
      </svg>
    `
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Attach event handlers
   * @private
   */
  _attachEventHandlers() {
    // Format select change
    if (this._elements.formatSelect) {
      this._addEventListener(this._elements.formatSelect, 'change', (e) => {
        this.state.selectedFormat = e.target.value
        this._log('debug', 'Format changed', { format: this.state.selectedFormat })
      })
    }

    // Export button click
    if (this._elements.exportBtn) {
      this._addEventListener(this._elements.exportBtn, 'click', () => {
        this._handleExport()
      })
    }

    // Keyboard shortcut: Ctrl+Shift+E for quick export
    this._addEventListener(document, 'keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        if (!this._elements.exportBtn?.disabled) {
          this._handleExport()
        }
      }
    })
  }

  /**
   * Handle export button click
   * @private
   */
  async _handleExport() {
    if (this.state.exporting) return
    if (!this.results || this.results.length === 0) {
      toastManager.warning('No results to export')
      return
    }
    if (!this.session?.id) {
      toastManager.warning('No active session')
      return
    }

    this._log('info', 'Starting export', { format: this.state.selectedFormat })

    this.state.exporting = true
    this._updateButtonState()

    try {
      // Call export IPC handler
      const result = await this._callIpc('rlm:export-results', {
        sessionId: this.session.id,
        format: this.state.selectedFormat,
        results: this.results
      })

      if (result?.success) {
        const formatLabel = EXPORT_FORMATS[this.state.selectedFormat]?.label || this.state.selectedFormat
        toastManager.success(`Results exported as ${formatLabel}`)

        // Try to reveal the exported file
        if (result.filePath) {
          this._revealExportedFile(result.filePath)
        }

        // Emit event
        if (this.context.events?.emit) {
          this.context.events.emit('export:complete', {
            format: this.state.selectedFormat,
            filePath: result.filePath
          })
        }

        // Call callback
        if (this.onExportComplete) {
          this.onExportComplete({
            format: this.state.selectedFormat,
            filePath: result.filePath
          })
        }

        this._log('info', 'Export completed', { filePath: result.filePath })
      } else {
        throw new Error(result?.error || 'Export failed')
      }
    } catch (error) {
      this._log('error', 'Export failed', { error: error.message })
      toastManager.error(`Export failed: ${error.message}`)
    } finally {
      this.state.exporting = false
      this._updateButtonState()
    }
  }

  /**
   * Reveal exported file in file explorer
   * @param {string} filePath - Path to the exported file
   * @private
   */
  async _revealExportedFile(filePath) {
    try {
      // Use shell.showItemInFolder via IPC if available
      await this._callIpc('rlm:reveal-file', { filePath })
      this._log('debug', 'Revealed file in explorer', { filePath })
    } catch (error) {
      this._log('warn', 'Could not reveal file', { error: error.message })
      // Non-critical error, don't show to user
    }
  }

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  /**
   * Fetch available export formats from backend
   * @private
   */
  async _fetchExportFormats() {
    try {
      const result = await this._callIpc('rlm:get-export-formats')
      if (result?.formats && Array.isArray(result.formats)) {
        this.state.formats = result.formats
        this._log('debug', 'Fetched export formats', { count: result.formats.length })
      }
    } catch (error) {
      // Use default formats if fetch fails
      this._log('warn', 'Could not fetch export formats, using defaults', { error: error.message })
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Add event listener with tracking for cleanup
   * @param {HTMLElement|Document} element - Element to attach listener to
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
   * Log message using plugin context or console
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @private
   */
  _log(level, message, data = {}) {
    const prefix = '[ExportControls]'
    const logFn = this.context.log?.[level] || console[level] || console.log
    logFn(`${prefix} ${message}`, data)
  }
}

export default ExportControls
