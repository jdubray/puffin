/**
 * ToastHistoryComponent - Toast notification history display
 *
 * Provides:
 * - List view of toast notifications
 * - 24-hour focus with older toasts section
 * - Type-based indicators (success, error, warning, info)
 * - Individual and bulk delete capabilities
 * - Copy to clipboard functionality
 */

/**
 * Toast type configuration
 */
const TOAST_TYPES = {
  success: { icon: '✓', color: '#28a745', label: 'Success' },
  error: { icon: '✗', color: '#dc3545', label: 'Error' },
  warning: { icon: '⚠', color: '#ffc107', label: 'Warning' },
  info: { icon: 'ℹ', color: '#17a2b8', label: 'Info' }
}

/**
 * 24 hours in milliseconds
 */
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

export class ToastHistoryComponent {
  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} options - Component options
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}

    // State
    this.toasts = []
    this.loading = true
    this.error = null

    // Track event listeners for cleanup (prevents memory leaks on re-render)
    this.boundListeners = []
    // Track active timeouts for cleanup (copy feedback, error banners, etc.)
    this.activeTimeouts = []
  }

  /**
   * Initialize the component
   */
  async init() {
    console.log('[ToastHistoryComponent] init() called')

    this.container.className = 'toast-history-container'
    this.render()
    await this.loadToasts()

    console.log('[ToastHistoryComponent] init() complete')
  }

  /**
   * Load toast history from core API
   */
  async loadToasts() {
    this.loading = true
    this.error = null
    this.render()

    try {
      const result = await window.puffin.toastHistory.getAll()
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to load notifications')
      }
      this.toasts = result.toasts || []
      this.loading = false
      this.render()
    } catch (err) {
      console.error('[ToastHistoryComponent] Failed to load toasts:', err)
      this.error = err.message || 'Failed to load notifications'
      this.loading = false
      this.render()
    }
  }

  /**
   * Filter toasts into recent (24h) and older
   * @returns {Object} { recent: Toast[], older: Toast[] }
   */
  filterToasts() {
    const cutoff = Date.now() - TWENTY_FOUR_HOURS
    const recent = []
    const older = []

    // Sort by timestamp descending (most recent first)
    const sorted = [...this.toasts].sort((a, b) => b.timestamp - a.timestamp)

    for (const toast of sorted) {
      if (toast.timestamp >= cutoff) {
        recent.push(toast)
      } else {
        older.push(toast)
      }
    }

    return { recent, older }
  }

  /**
   * Render the component
   */
  render() {
    // Clean up existing listeners before re-rendering to prevent memory leaks
    this.cleanupListeners()

    if (this.loading) {
      this.container.innerHTML = `
        <div class="toast-history-view">
          <div class="toast-history-header">
            <h2 class="toast-history-title">🔔 Notifications</h2>
          </div>
          <div class="toast-history-loading">
            <div class="loading-spinner"></div>
            <span>Loading notifications...</span>
          </div>
        </div>
      `
      return
    }

    if (this.error) {
      this.container.innerHTML = `
        <div class="toast-history-view">
          <div class="toast-history-header">
            <h2 class="toast-history-title">🔔 Notifications</h2>
            <button class="toast-history-refresh-btn" title="Retry">↻</button>
          </div>
          <div class="toast-history-error">
            <span class="error-icon">⚠</span>
            <span>${this.escapeHtml(this.error)}</span>
          </div>
        </div>
      `
      this.bindRefreshEvent()
      return
    }

    const { recent, older } = this.filterToasts()

    this.container.innerHTML = `
      <div class="toast-history-view">
        <div class="toast-history-header">
          <h2 class="toast-history-title">🔔 Notifications</h2>
          <button class="toast-history-refresh-btn" title="Refresh">↻</button>
        </div>

        <div class="toast-history-content">
          ${this.renderRecentSection(recent)}
          ${this.renderOlderSection(older)}
          ${recent.length === 0 && older.length === 0 ? this.renderEmptyState() : ''}
        </div>
      </div>
    `

    this.bindEvents()
  }

  /**
   * Render the recent (last 24 hours) section
   * @param {Array} toasts - Recent toasts
   * @returns {string} HTML string
   */
  renderRecentSection(toasts) {
    if (toasts.length === 0) {
      return ''
    }

    return `
      <div class="toast-history-section">
        <div class="toast-history-section-header">
          <span class="section-title">Last 24 Hours</span>
          <span class="section-count">(${toasts.length})</span>
        </div>
        <div class="toast-history-list" role="list">
          ${toasts.map(toast => this.renderToastItem(toast, false)).join('')}
        </div>
      </div>
    `
  }

  /**
   * Render the older toasts section
   * @param {Array} toasts - Older toasts
   * @returns {string} HTML string
   */
  renderOlderSection(toasts) {
    if (toasts.length === 0) {
      return ''
    }

    return `
      <div class="toast-history-section toast-history-section-older">
        <div class="toast-history-section-header">
          <span class="section-title">Older</span>
          <span class="section-count">(${toasts.length})</span>
          <button class="delete-all-btn" data-action="delete-all-old" title="Delete all old notifications">
            🗑 Delete All
          </button>
        </div>
        <div class="toast-history-list toast-history-list-older" role="list">
          ${toasts.map(toast => this.renderToastItem(toast, true)).join('')}
        </div>
      </div>
    `
  }

  /**
   * Render a single toast item
   * @param {Object} toast - Toast object
   * @param {boolean} isOld - Whether toast is older than 24h
   * @returns {string} HTML string
   */
  renderToastItem(toast, isOld) {
    const typeConfig = TOAST_TYPES[toast.type] || TOAST_TYPES.info
    const timeStr = this.formatTime(toast.timestamp)
    const safeId = this.escapeHtml(toast.id)

    return `
      <div class="toast-history-item ${isOld ? 'toast-history-item-old' : ''}"
           role="listitem"
           data-toast-id="${safeId}">
        <div class="toast-item-icon" style="color: ${typeConfig.color}" aria-label="${typeConfig.label}">
          ${typeConfig.icon}
        </div>
        <div class="toast-item-content">
          <div class="toast-item-time">${timeStr}</div>
          <div class="toast-item-message">${this.escapeHtml(toast.message)}</div>
        </div>
        <div class="toast-item-actions">
          <button class="toast-action-btn copy-btn"
                  data-action="copy"
                  data-toast-id="${safeId}"
                  title="Copy to clipboard"
                  aria-label="Copy notification">
            📋
          </button>
          ${isOld ? `
            <button class="toast-action-btn delete-btn"
                    data-action="delete"
                    data-toast-id="${safeId}"
                    title="Delete notification"
                    aria-label="Delete notification">
              🗑
            </button>
          ` : ''}
        </div>
      </div>
    `
  }

  /**
   * Render empty state
   * @returns {string} HTML string
   */
  renderEmptyState() {
    return `
      <div class="toast-history-empty">
        <div class="empty-icon">🔔</div>
        <div class="empty-title">No notifications</div>
        <div class="empty-message">Notifications will appear here as they occur</div>
      </div>
    `
  }

  /**
   * Format timestamp to readable time string
   * @param {number} timestamp - Unix timestamp (ms)
   * @returns {string} Formatted time string
   */
  formatTime(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString('default', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    }

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = date.toDateString() === yesterday.toDateString()

    if (isYesterday) {
      return `Yesterday ${date.toLocaleTimeString('default', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })}`
    }

    return date.toLocaleDateString('default', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string}
   */
  escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Clean up all tracked event listeners
   * Called before re-rendering to prevent memory leaks
   */
  cleanupListeners() {
    this.boundListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler)
    })
    this.boundListeners = []
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    this.bindRefreshEvent()

    // Copy button events - track each listener
    this.container.querySelectorAll('[data-action="copy"]').forEach(btn => {
      const handler = (e) => this.handleCopy(e)
      btn.addEventListener('click', handler)
      this.boundListeners.push({ element: btn, event: 'click', handler })
    })

    // Delete button events - track each listener
    this.container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      const handler = (e) => this.handleDelete(e)
      btn.addEventListener('click', handler)
      this.boundListeners.push({ element: btn, event: 'click', handler })
    })

    // Delete all old button - track listener
    const deleteAllBtn = this.container.querySelector('[data-action="delete-all-old"]')
    if (deleteAllBtn) {
      const handler = () => this.handleDeleteAllOld()
      deleteAllBtn.addEventListener('click', handler)
      this.boundListeners.push({ element: deleteAllBtn, event: 'click', handler })
    }
  }

  /**
   * Bind refresh button event
   */
  bindRefreshEvent() {
    const refreshBtn = this.container.querySelector('.toast-history-refresh-btn')
    if (refreshBtn) {
      const handler = () => this.loadToasts()
      refreshBtn.addEventListener('click', handler)
      this.boundListeners.push({ element: refreshBtn, event: 'click', handler })
    }
  }

  /**
   * Handle copy button click
   * @param {Event} e - Click event
   */
  async handleCopy(e) {
    const toastId = e.target.dataset.toastId
    const toast = this.toasts.find(t => t.id === toastId)
    if (!toast) return

    const typeLabel = (toast.type || 'info').toUpperCase()
    const timestamp = new Date(toast.timestamp).toLocaleString()
    const text = `[${typeLabel}] ${timestamp}\n${toast.message}`

    try {
      await navigator.clipboard.writeText(text)
      this.showCopyFeedback(e.target)
    } catch (err) {
      console.error('[ToastHistoryComponent] Failed to copy:', err)
    }
  }

  /**
   * Show copy feedback on button
   * @param {HTMLElement} btn - Button element
   */
  showCopyFeedback(btn) {
    const originalText = btn.innerHTML
    btn.innerHTML = '✓'
    btn.classList.add('copied')

    // Track timeout for cleanup on component destruction
    const timeoutId = setTimeout(() => {
      btn.innerHTML = originalText
      btn.classList.remove('copied')
      // Remove from tracking array after execution
      this.activeTimeouts = this.activeTimeouts.filter(id => id !== timeoutId)
    }, 2000)

    this.activeTimeouts.push(timeoutId)
  }

  /**
   * Handle delete button click
   * @param {Event} e - Click event
   */
  async handleDelete(e) {
    const toastId = e.target.dataset.toastId
    if (!toastId) return

    try {
      const result = await window.puffin.toastHistory.delete(toastId)
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to delete notification')
      }
      // Remove from local state and re-render
      this.toasts = this.toasts.filter(t => t.id !== toastId)
      this.render()
    } catch (err) {
      console.error('[ToastHistoryComponent] Failed to delete toast:', err)
      this.showActionError(err.message || 'Failed to delete notification')
    }
  }

  /**
   * Handle delete all old toasts
   */
  async handleDeleteAllOld() {
    const { older } = this.filterToasts()
    if (older.length === 0) return

    // Show confirmation
    const confirmed = await this.showDeleteConfirmation(older.length)
    if (!confirmed) return

    try {
      const cutoff = Date.now() - TWENTY_FOUR_HOURS
      const result = await window.puffin.toastHistory.deleteBefore(cutoff)
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to delete old notifications')
      }
      // Remove from local state and re-render
      this.toasts = this.toasts.filter(t => t.timestamp >= cutoff)
      this.render()
    } catch (err) {
      console.error('[ToastHistoryComponent] Failed to delete old toasts:', err)
      this.showActionError(err.message || 'Failed to delete old notifications')
    }
  }

  /**
   * Show action error inline in the component
   * Displays a temporary error banner that auto-dismisses
   * @param {string} message - Error message to display
   */
  showActionError(message) {
    // Remove any existing error banner
    const existingBanner = this.container.querySelector('.toast-history-action-error')
    if (existingBanner) {
      existingBanner.remove()
    }

    // Create error banner element
    const banner = document.createElement('div')
    banner.className = 'toast-history-action-error'
    banner.setAttribute('role', 'alert')
    banner.setAttribute('aria-live', 'polite')
    banner.innerHTML = `
      <span class="error-icon" aria-hidden="true">⚠</span>
      <span class="error-message">${this.escapeHtml(message)}</span>
      <button class="error-dismiss-btn" title="Dismiss" aria-label="Dismiss error">×</button>
    `

    // Insert at top of content area
    const content = this.container.querySelector('.toast-history-content')
    if (content) {
      content.insertBefore(banner, content.firstChild)
    } else {
      // Fallback: insert after header
      const header = this.container.querySelector('.toast-history-header')
      if (header) {
        header.insertAdjacentElement('afterend', banner)
      }
    }

    // Bind dismiss button
    const dismissBtn = banner.querySelector('.error-dismiss-btn')
    if (dismissBtn) {
      const dismissHandler = () => banner.remove()
      dismissBtn.addEventListener('click', dismissHandler)
      this.boundListeners.push({ element: dismissBtn, event: 'click', handler: dismissHandler })
    }

    // Auto-dismiss after 5 seconds
    const timeoutId = setTimeout(() => {
      if (banner.parentElement) {
        banner.remove()
      }
    }, 5000)
    this.activeTimeouts.push(timeoutId)
  }

  /**
   * Show delete confirmation dialog
   * @param {number} count - Number of items to delete
   * @returns {Promise<boolean>} User confirmed
   */
  async showDeleteConfirmation(count) {
    return new Promise(resolve => {
      // Try using ModalManager if available
      if (window.ModalManager) {
        window.ModalManager.show({
          title: 'Delete Old Notifications',
          content: `
            <p>Delete ${count} notification${count > 1 ? 's' : ''} older than 24 hours?</p>
            <p class="text-muted">This action cannot be undone.</p>
          `,
          buttons: [
            { label: 'Delete All', primary: true, danger: true, action: () => resolve(true) },
            { label: 'Cancel', action: () => resolve(false) }
          ]
        })
      } else {
        // Fallback to browser confirm
        resolve(window.confirm(`Delete ${count} notification${count > 1 ? 's' : ''} older than 24 hours?`))
      }
    })
  }

  /**
   * Refresh the component
   */
  async refresh() {
    await this.loadToasts()
  }

  /**
   * Destroy the component
   */
  destroy() {
    // Clear all tracked timeouts to prevent callbacks after destruction
    this.activeTimeouts.forEach(id => clearTimeout(id))
    this.activeTimeouts = []

    // Remove all tracked event listeners
    this.cleanupListeners()

    // Clear DOM
    this.container.innerHTML = ''
  }
}

export default ToastHistoryComponent
