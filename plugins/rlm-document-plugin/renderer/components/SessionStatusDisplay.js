/**
 * SessionStatusDisplay - Displays the current RLM session status
 *
 * Shows:
 * - Active session indicator (green/gray dot)
 * - Session ID (truncated)
 * - Document path/name
 * - Creation timestamp
 * - Python REPL connection status (connected/disconnected)
 * - Close session button
 *
 * The component receives session state from its parent (RLMDocumentView)
 * rather than polling directly, to avoid duplicate IPC calls.
 *
 * @module rlm-document-plugin/renderer/SessionStatusDisplay
 */

export class SessionStatusDisplay {
  /**
   * Component name for registration
   * @type {string}
   */
  static componentName = 'SessionStatusDisplay'

  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} options - Component options
   * @param {Object} options.context - Plugin context with events API
   * @param {Function} options.onCloseSession - Callback when close button clicked
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}
    this.onCloseSession = options.onCloseSession || (() => {})

    // State - receives updates from parent
    this.state = {
      session: null,
      replConnected: false
    }

    // Event listener tracking for cleanup
    this._eventListeners = []

    // Bound handlers
    this._handleCloseClick = this._handleCloseClick.bind(this)
    this._handleKeyDown = this._handleKeyDown.bind(this)
  }

  /**
   * Initialize the component
   */
  async init() {
    this.container.className = 'rlm-session-status-display'
    this.container.setAttribute('role', 'status')
    this.container.setAttribute('aria-live', 'polite')
    this._render()
  }

  /**
   * Update the component with new session state
   * Called by parent component when session state changes
   * @param {Object} sessionState - Session state object
   * @param {Object|null} sessionState.session - Current session or null
   * @param {boolean} sessionState.replConnected - REPL connection status
   */
  update(sessionState) {
    const prevSession = this.state.session
    const prevReplConnected = this.state.replConnected

    this.state.session = sessionState?.session || null
    this.state.replConnected = sessionState?.replConnected || false

    // Only re-render if state actually changed
    const sessionChanged = prevSession?.id !== this.state.session?.id
    const replChanged = prevReplConnected !== this.state.replConnected

    if (sessionChanged || replChanged) {
      this._render()
    }
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
   * Render the session status display
   * @private
   */
  _render() {
    // Clear existing listeners before re-rendering
    this._removeAllEventListeners()

    const { session, replConnected } = this.state

    if (!session) {
      this._renderNoSession()
    } else {
      this._renderActiveSession(session, replConnected)
    }
  }

  /**
   * Render the "no session" state
   * @private
   */
  _renderNoSession() {
    this.container.innerHTML = `
      <div class="session-status-content">
        <div class="session-indicator-group">
          <span class="session-indicator inactive"
                aria-hidden="true"
                title="No active session"></span>
          <span class="session-text">No active session</span>
        </div>
      </div>
    `
  }

  /**
   * Render the active session state
   * @param {Object} session - Session object
   * @param {boolean} replConnected - REPL connection status
   * @private
   */
  _renderActiveSession(session, replConnected) {
    const sessionId = session.id || 'unknown'
    const truncatedId = sessionId.length > 12
      ? `${sessionId.substring(0, 8)}...${sessionId.substring(sessionId.length - 4)}`
      : sessionId

    const documentName = this._getDocumentName(session.documentPath)
    const createdAt = this._formatTimestamp(session.createdAt)

    this.container.innerHTML = `
      <div class="session-status-content">
        <div class="session-indicator-group">
          <span class="session-indicator active"
                aria-hidden="true"
                title="Session active"></span>
          <span class="session-id" title="Session ID: ${this._escapeHtml(sessionId)}">
            ${this._escapeHtml(truncatedId)}
          </span>
        </div>

        <div class="session-document" title="Document: ${this._escapeHtml(session.documentPath || 'None')}">
          <span class="document-icon" aria-hidden="true">📄</span>
          <span class="document-name">${this._escapeHtml(documentName)}</span>
        </div>

        <div class="session-timestamp" title="Created: ${this._escapeHtml(createdAt)}">
          <span class="timestamp-icon" aria-hidden="true">🕐</span>
          <span class="timestamp-value">${this._escapeHtml(createdAt)}</span>
        </div>

        <div class="repl-status ${replConnected ? 'connected' : 'disconnected'}"
             title="Python REPL: ${replConnected ? 'Connected' : 'Disconnected'}"
             role="status"
             aria-label="Python REPL ${replConnected ? 'connected' : 'disconnected'}">
          <span class="repl-indicator" aria-hidden="true">${replConnected ? '🟢' : '🔴'}</span>
          <span class="repl-label">REPL</span>
        </div>
      </div>

      <div class="session-actions">
        <button class="close-session-btn"
                type="button"
                title="Close current session"
                aria-label="Close current session">
          <span class="btn-icon" aria-hidden="true">✕</span>
          <span class="btn-text">Close</span>
        </button>
      </div>
    `

    // Attach event handlers
    const closeBtn = this.container.querySelector('.close-session-btn')
    if (closeBtn) {
      this._addEventListener(closeBtn, 'click', this._handleCloseClick)
      this._addEventListener(closeBtn, 'keydown', this._handleKeyDown)
    }
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle close button click
   * @param {Event} event - Click event
   * @private
   */
  _handleCloseClick(event) {
    event.preventDefault()
    event.stopPropagation()

    // Emit event via context.events if available
    if (this.context.events?.emit) {
      this.context.events.emit('session:close-requested', {
        sessionId: this.state.session?.id
      })
    }

    // Also call the callback prop
    this.onCloseSession(this.state.session)
  }

  /**
   * Handle keyboard events for accessibility
   * @param {KeyboardEvent} event - Keyboard event
   * @private
   */
  _handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this._handleCloseClick(event)
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Extract document name from path
   * @param {string} documentPath - Full document path
   * @returns {string} Document name or placeholder
   * @private
   */
  _getDocumentName(documentPath) {
    if (!documentPath) return 'No document'
    // Handle both Unix and Windows paths
    const parts = documentPath.split(/[/\\]/)
    return parts[parts.length - 1] || 'Unknown'
  }

  /**
   * Format timestamp for display
   * @param {string|number|Date} timestamp - Timestamp to format
   * @returns {string} Formatted timestamp
   * @private
   */
  _formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown'

    try {
      const date = new Date(timestamp)
      if (isNaN(date.getTime())) return 'Invalid date'

      // Check if today
      const now = new Date()
      const isToday = date.toDateString() === now.toDateString()

      if (isToday) {
        // Show time only for today
        return date.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })
      } else {
        // Show date and time for other days
        return date.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      }
    } catch (e) {
      return 'Unknown'
    }
  }

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
export default SessionStatusDisplay
