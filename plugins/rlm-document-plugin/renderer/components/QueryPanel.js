/**
 * QueryPanel - Query input and configuration component for RLM Document Plugin
 *
 * Provides:
 * - Text input field for entering queries
 * - Query type dropdown (query, peek, grep)
 * - Chunk strategy display (informational)
 * - Submit button with loading state
 * - Error display for failed queries
 *
 * The component is disabled when no active session exists.
 * Query results are emitted via context.events for the parent to handle.
 *
 * IPC Mapping:
 * - query: rlm:query { sessionId, query }
 * - peek: rlm:peek { sessionId, start, end }
 * - grep: rlm:grep { sessionId, pattern, maxMatches, contextLines }
 *
 * @module rlm-document-plugin/renderer/QueryPanel
 */

export class QueryPanel {
  /**
   * Component name for registration
   * @type {string}
   */
  static componentName = 'QueryPanel'

  /**
   * Query type configurations with placeholder text and labels
   * @type {Object}
   */
  static QUERY_TYPES = {
    query: {
      label: 'Semantic Query',
      placeholder: 'Ask a question about the document...',
      description: 'Natural language search across document chunks'
    },
    peek: {
      label: 'Peek',
      placeholder: 'Enter line range (e.g., 1-50 or 100-150)...',
      description: 'View specific line ranges from the document'
    },
    grep: {
      label: 'Grep',
      placeholder: 'Enter regex pattern to search...',
      description: 'Pattern-based search with regex support'
    }
  }

  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} options - Component options
   * @param {Object} options.context - Plugin context with events API
   * @param {Function} options.onQuerySubmit - Callback when query is submitted
   * @param {Object} options.session - Current session (null if no session)
   * @param {Object} options.chunkStrategy - Current chunk strategy config
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}
    this.onQuerySubmit = options.onQuerySubmit || (() => {})

    // State
    this.state = {
      queryType: 'query',
      queryText: '',
      loading: false,
      error: null,
      session: options.session || null,
      chunkStrategy: options.chunkStrategy || null
    }

    // Event listener tracking for cleanup
    this._eventListeners = []

    // DOM element references
    this._elements = {
      typeSelect: null,
      queryInput: null,
      submitBtn: null,
      errorDisplay: null,
      strategyDisplay: null
    }

    // Bound handlers
    this._handleTypeChange = this._handleTypeChange.bind(this)
    this._handleInputChange = this._handleInputChange.bind(this)
    this._handleSubmit = this._handleSubmit.bind(this)
    this._handleKeyDown = this._handleKeyDown.bind(this)
  }

  /**
   * Initialize the component
   */
  async init() {
    this.container.className = 'query-panel'
    this._render()
  }

  /**
   * Update the component with new state
   * @param {Object} updates - State updates
   * @param {Object} updates.session - Current session
   * @param {Object} updates.chunkStrategy - Chunk strategy config
   * @param {boolean} updates.loading - Loading state
   * @param {string|null} updates.error - Error message
   */
  update(updates = {}) {
    let needsRender = false

    if ('session' in updates && updates.session !== this.state.session) {
      this.state.session = updates.session
      needsRender = true
    }

    if ('chunkStrategy' in updates && updates.chunkStrategy !== this.state.chunkStrategy) {
      this.state.chunkStrategy = updates.chunkStrategy
      needsRender = true
    }

    if ('loading' in updates && updates.loading !== this.state.loading) {
      this.state.loading = updates.loading
      this._updateLoadingState()
    }

    if ('error' in updates) {
      this.state.error = updates.error
      this._updateErrorDisplay()
    }

    if (needsRender) {
      this._updateDisabledState()
      this._updateStrategyDisplay()
    }
  }

  /**
   * Clear the query input and error state
   */
  clear() {
    this.state.queryText = ''
    this.state.error = null
    if (this._elements.queryInput) {
      this._elements.queryInput.value = ''
    }
    this._updateErrorDisplay()
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
   * Render the query panel
   * @private
   */
  _render() {
    this._removeAllEventListeners()

    const isDisabled = !this.state.session
    const queryType = QueryPanel.QUERY_TYPES[this.state.queryType]

    this.container.innerHTML = `
      <div class="query-panel-content">
        <!-- Query Type Selector -->
        <div class="query-type-row">
          <label for="query-type-select" class="query-label">Query Type</label>
          <select id="query-type-select"
                  class="query-type-select"
                  ${isDisabled ? 'disabled' : ''}
                  aria-describedby="query-type-description">
            ${Object.entries(QueryPanel.QUERY_TYPES).map(([value, config]) => `
              <option value="${value}" ${value === this.state.queryType ? 'selected' : ''}>
                ${this._escapeHtml(config.label)}
              </option>
            `).join('')}
          </select>
          <span id="query-type-description" class="query-type-description">
            ${this._escapeHtml(queryType.description)}
          </span>
        </div>

        <!-- Chunk Strategy Display (informational) -->
        <div class="chunk-strategy-row" aria-live="polite">
          <span class="strategy-label">Chunk Strategy:</span>
          <span class="strategy-value">${this._getStrategyDisplay()}</span>
        </div>

        <!-- Query Input -->
        <div class="query-input-row">
          <label for="query-input" class="visually-hidden">Query Input</label>
          <textarea id="query-input"
                    class="query-input"
                    placeholder="${this._escapeHtml(queryType.placeholder)}"
                    ${isDisabled ? 'disabled' : ''}
                    rows="4"
                    aria-describedby="query-error">${this._escapeHtml(this.state.queryText)}</textarea>
        </div>

        <!-- Error Display -->
        <div id="query-error" class="query-error ${this.state.error ? 'visible' : ''}" role="alert">
          ${this.state.error ? `
            <span class="error-icon" aria-hidden="true">⚠️</span>
            <span class="error-message">${this._escapeHtml(this.state.error)}</span>
          ` : ''}
        </div>

        <!-- Submit Button -->
        <div class="query-actions-row">
          <button type="button"
                  class="query-submit-btn ${this.state.loading ? 'loading' : ''}"
                  ${isDisabled || this.state.loading ? 'disabled' : ''}
                  aria-busy="${this.state.loading}">
            ${this.state.loading ? `
              <span class="spinner" aria-hidden="true"></span>
              <span class="btn-text">Processing...</span>
            ` : `
              <span class="btn-icon" aria-hidden="true">🔍</span>
              <span class="btn-text">Run Query</span>
            `}
          </button>
        </div>

        <!-- Disabled State Overlay -->
        ${isDisabled ? `
          <div class="query-panel-disabled-overlay" aria-hidden="true">
            <p>Select a document to enable queries</p>
          </div>
        ` : ''}
      </div>
    `

    // Cache element references
    this._elements.typeSelect = this.container.querySelector('.query-type-select')
    this._elements.queryInput = this.container.querySelector('.query-input')
    this._elements.submitBtn = this.container.querySelector('.query-submit-btn')
    this._elements.errorDisplay = this.container.querySelector('.query-error')
    this._elements.strategyDisplay = this.container.querySelector('.strategy-value')
    this._elements.typeDescription = this.container.querySelector('.query-type-description')

    // Attach event handlers
    this._attachEventHandlers()
  }

  /**
   * Attach event handlers to rendered elements
   * @private
   */
  _attachEventHandlers() {
    if (this._elements.typeSelect) {
      this._addEventListener(this._elements.typeSelect, 'change', this._handleTypeChange)
    }

    if (this._elements.queryInput) {
      this._addEventListener(this._elements.queryInput, 'input', this._handleInputChange)
      this._addEventListener(this._elements.queryInput, 'keydown', this._handleKeyDown)
    }

    if (this._elements.submitBtn) {
      this._addEventListener(this._elements.submitBtn, 'click', this._handleSubmit)
    }
  }

  // ============================================================================
  // STATE UPDATES
  // ============================================================================

  /**
   * Update the loading state UI without full re-render
   * @private
   */
  _updateLoadingState() {
    const btn = this._elements.submitBtn
    if (!btn) return

    const isDisabled = !this.state.session || this.state.loading

    if (this.state.loading) {
      btn.classList.add('loading')
      btn.setAttribute('aria-busy', 'true')
      btn.disabled = true
      btn.innerHTML = `
        <span class="spinner" aria-hidden="true"></span>
        <span class="btn-text">Processing...</span>
      `
    } else {
      btn.classList.remove('loading')
      btn.setAttribute('aria-busy', 'false')
      btn.disabled = isDisabled
      btn.innerHTML = `
        <span class="btn-icon" aria-hidden="true">🔍</span>
        <span class="btn-text">Run Query</span>
      `
    }

    // Also update input state during loading
    if (this._elements.queryInput) {
      this._elements.queryInput.disabled = isDisabled
    }
    if (this._elements.typeSelect) {
      this._elements.typeSelect.disabled = isDisabled
    }
  }

  /**
   * Update the error display without full re-render
   * @private
   */
  _updateErrorDisplay() {
    const errorEl = this._elements.errorDisplay
    if (!errorEl) return

    if (this.state.error) {
      errorEl.classList.add('visible')
      errorEl.innerHTML = `
        <span class="error-icon" aria-hidden="true">⚠️</span>
        <span class="error-message">${this._escapeHtml(this.state.error)}</span>
      `
    } else {
      errorEl.classList.remove('visible')
      errorEl.innerHTML = ''
    }
  }

  /**
   * Update the disabled state of controls
   * @private
   */
  _updateDisabledState() {
    const isDisabled = !this.state.session

    if (this._elements.typeSelect) {
      this._elements.typeSelect.disabled = isDisabled
    }
    if (this._elements.queryInput) {
      this._elements.queryInput.disabled = isDisabled
    }
    if (this._elements.submitBtn) {
      this._elements.submitBtn.disabled = isDisabled || this.state.loading
    }

    // Show/hide disabled overlay
    const overlay = this.container.querySelector('.query-panel-disabled-overlay')
    if (overlay) {
      overlay.style.display = isDisabled ? 'flex' : 'none'
    }
  }

  /**
   * Update the chunk strategy display
   * @private
   */
  _updateStrategyDisplay() {
    if (this._elements.strategyDisplay) {
      this._elements.strategyDisplay.textContent = this._getStrategyDisplay()
    }
  }

  /**
   * Get the chunk strategy display text
   * @returns {string}
   * @private
   */
  _getStrategyDisplay() {
    if (!this.state.chunkStrategy) {
      return 'Default (Fixed)'
    }

    const { type, chunkSize, overlap } = this.state.chunkStrategy
    const typeName = type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Fixed'

    if (chunkSize && overlap) {
      return `${typeName} (${chunkSize} chars, ${overlap} overlap)`
    }
    return typeName
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle query type change
   * @param {Event} event
   * @private
   */
  _handleTypeChange(event) {
    const newType = event.target.value
    if (newType !== this.state.queryType) {
      this.state.queryType = newType

      // Update placeholder text
      const queryType = QueryPanel.QUERY_TYPES[newType]
      if (this._elements.queryInput && queryType) {
        this._elements.queryInput.placeholder = queryType.placeholder
      }

      // Update description
      if (this._elements.typeDescription && queryType) {
        this._elements.typeDescription.textContent = queryType.description
      }

      // Clear error when changing type
      this.state.error = null
      this._updateErrorDisplay()

      // Emit type change event
      if (this.context.events?.emit) {
        this.context.events.emit('query:type-changed', { type: newType })
      }
    }
  }

  /**
   * Handle query input change
   * @param {Event} event
   * @private
   */
  _handleInputChange(event) {
    this.state.queryText = event.target.value

    // Clear error when typing
    if (this.state.error) {
      this.state.error = null
      this._updateErrorDisplay()
    }
  }

  /**
   * Handle keyboard events
   * @param {KeyboardEvent} event
   * @private
   */
  _handleKeyDown(event) {
    // Note: Per developer clarification, no Ctrl+Enter shortcut
    // But we handle Escape to clear input
    if (event.key === 'Escape') {
      this.clear()
      event.preventDefault()
    }
  }

  /**
   * Handle submit button click
   * @param {Event} event
   * @private
   */
  async _handleSubmit(event) {
    event.preventDefault()

    if (!this.state.session || this.state.loading) {
      return
    }

    const queryText = this.state.queryText.trim()
    if (!queryText) {
      this.state.error = 'Please enter a query'
      this._updateErrorDisplay()
      return
    }

    // Validate query based on type
    const validationError = this._validateQuery(queryText, this.state.queryType)
    if (validationError) {
      this.state.error = validationError
      this._updateErrorDisplay()
      return
    }

    // Build query parameters
    const queryParams = this._buildQueryParams(queryText, this.state.queryType)

    // Emit query submit event
    if (this.context.events?.emit) {
      this.context.events.emit('query:submit', {
        type: this.state.queryType,
        text: queryText,
        params: queryParams,
        sessionId: this.state.session.id
      })
    }

    // Call the callback
    this.onQuerySubmit({
      type: this.state.queryType,
      text: queryText,
      params: queryParams,
      sessionId: this.state.session.id
    })
  }

  /**
   * Validate query based on type
   * @param {string} queryText
   * @param {string} queryType
   * @returns {string|null} Error message or null if valid
   * @private
   */
  _validateQuery(queryText, queryType) {
    switch (queryType) {
      case 'peek': {
        // Expect format like "1-50" or "100-150"
        const peekMatch = queryText.match(/^(\d+)\s*[-–]\s*(\d+)$/)
        if (!peekMatch) {
          return 'Peek requires a line range in format "start-end" (e.g., "1-50")'
        }
        const start = parseInt(peekMatch[1], 10)
        const end = parseInt(peekMatch[2], 10)
        if (start >= end) {
          return 'Start line must be less than end line'
        }
        if (start < 1) {
          return 'Start line must be at least 1'
        }
        break
      }

      case 'grep': {
        // Validate regex pattern
        try {
          new RegExp(queryText)
        } catch (e) {
          return `Invalid regex pattern: ${e.message}`
        }
        break
      }

      case 'query':
      default:
        // Semantic query - just needs some text
        if (queryText.length < 3) {
          return 'Query must be at least 3 characters long'
        }
        break
    }

    return null
  }

  /**
   * Build query parameters based on type
   * @param {string} queryText
   * @param {string} queryType
   * @returns {Object}
   * @private
   */
  _buildQueryParams(queryText, queryType) {
    const sessionId = this.state.session?.id

    switch (queryType) {
      case 'peek': {
        const match = queryText.match(/^(\d+)\s*[-–]\s*(\d+)$/)
        return {
          sessionId,
          start: parseInt(match[1], 10),
          end: parseInt(match[2], 10)
        }
      }

      case 'grep':
        return {
          sessionId,
          pattern: queryText,
          maxMatches: 100,
          contextLines: 2
        }

      case 'query':
      default:
        return {
          sessionId,
          query: queryText
        }
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

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
export default QueryPanel
