/**
 * Toast Component - Local notification system for RLM Document Plugin
 *
 * Displays temporary notification messages with auto-dismiss.
 * Supports success, error, warning, and info variants.
 *
 * @module rlm-document-plugin/renderer/Toast
 */

const TOAST_DURATION = 3000
const TOAST_ERROR_DURATION = 5000
const TOAST_ANIMATION_DURATION = 200

/**
 * Individual Toast notification
 */
class Toast {
  /**
   * Create a Toast
   * @param {Object} options - Configuration options
   * @param {string} options.message - Message to display
   * @param {string} options.type - Toast type: 'success', 'error', 'warning', 'info'
   * @param {number} options.duration - Duration in ms (default 3000)
   * @param {HTMLElement} options.container - Container element (default body)
   * @param {Function} options.onDismiss - Callback when toast is dismissed
   */
  constructor(options = {}) {
    this.message = options.message || ''
    this.type = options.type || 'info'
    this.duration = options.duration ?? (options.type === 'error' ? TOAST_ERROR_DURATION : TOAST_DURATION)
    this.container = options.container || document.body
    this.onDismiss = options.onDismiss || null

    this.element = null
    this.timeoutId = null

    this._create()
  }

  /**
   * Create the toast DOM element
   * @private
   */
  _create() {
    this.element = document.createElement('div')
    this.element.className = `rlm-toast rlm-toast-${this.type}`
    this.element.setAttribute('role', 'alert')
    this.element.setAttribute('aria-live', this.type === 'error' ? 'assertive' : 'polite')

    const icon = this._getIcon()

    this.element.innerHTML = `
      <div class="rlm-toast-icon" aria-hidden="true">
        ${icon}
      </div>
      <span class="rlm-toast-message">${this._escapeHtml(this.message)}</span>
      <button class="rlm-toast-close" type="button" aria-label="Dismiss notification">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `

    // Ensure toast container exists
    this._ensureToastContainer()
    const toastContainer = this.container.querySelector('.rlm-toast-container')
    toastContainer.appendChild(this.element)

    // Bind close button
    const closeBtn = this.element.querySelector('.rlm-toast-close')
    closeBtn.addEventListener('click', () => this.dismiss())

    // Keyboard support - Escape to dismiss
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.dismiss()
      }
    })

    // Auto-dismiss after duration
    if (this.duration > 0) {
      this.timeoutId = setTimeout(() => this.dismiss(), this.duration)
    }
  }

  /**
   * Ensure toast container exists in the DOM
   * @private
   */
  _ensureToastContainer() {
    let toastContainer = this.container.querySelector('.rlm-toast-container')
    if (!toastContainer) {
      toastContainer = document.createElement('div')
      toastContainer.className = 'rlm-toast-container'
      toastContainer.setAttribute('aria-label', 'Notifications')
      toastContainer.setAttribute('role', 'region')
      this.container.appendChild(toastContainer)
    }
  }

  /**
   * Get icon SVG for toast type
   * @returns {string} SVG HTML
   * @private
   */
  _getIcon() {
    const icons = {
      success: `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="9 12 12 15 16 10"/>
        </svg>
      `,
      error: `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      `,
      warning: `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      `,
      info: `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
      `
    }
    return icons[this.type] || icons.info
  }

  /**
   * Dismiss the toast with animation
   */
  dismiss() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }

    if (!this.element) return

    // Add exit animation class
    this.element.classList.add('rlm-toast-exit')

    setTimeout(() => {
      this._destroy()
      if (this.onDismiss) {
        this.onDismiss()
      }
    }, TOAST_ANIMATION_DURATION)
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped HTML
   * @private
   */
  _escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Remove toast element from DOM
   * @private
   */
  _destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
    }
    this.element = null
  }
}

/**
 * ToastManager - Manages toast notifications for the plugin
 */
class ToastManager {
  /**
   * Create a ToastManager
   * @param {HTMLElement} container - Optional container element
   */
  constructor(container = null) {
    this.container = container
    this.activeToasts = []
  }

  /**
   * Set the container for toasts
   * @param {HTMLElement} container - Container element
   */
  setContainer(container) {
    this.container = container
  }

  /**
   * Show a toast message
   * @param {string} message - Message to display
   * @param {string} type - Toast type: 'success', 'error', 'warning', 'info'
   * @param {Object} options - Additional options
   * @returns {Toast} The created toast instance
   */
  show(message, type = 'info', options = {}) {
    const toast = new Toast({
      message,
      type,
      container: this.container || document.body,
      onDismiss: () => {
        const index = this.activeToasts.indexOf(toast)
        if (index > -1) {
          this.activeToasts.splice(index, 1)
        }
      },
      ...options
    })

    this.activeToasts.push(toast)
    return toast
  }

  /**
   * Show a success toast
   * @param {string} message - Message to display
   * @param {Object} options - Additional options
   * @returns {Toast}
   */
  success(message, options = {}) {
    return this.show(message, 'success', options)
  }

  /**
   * Show an error toast
   * @param {string} message - Message to display
   * @param {Object} options - Additional options
   * @returns {Toast}
   */
  error(message, options = {}) {
    return this.show(message, 'error', { duration: TOAST_ERROR_DURATION, ...options })
  }

  /**
   * Show a warning toast
   * @param {string} message - Message to display
   * @param {Object} options - Additional options
   * @returns {Toast}
   */
  warning(message, options = {}) {
    return this.show(message, 'warning', options)
  }

  /**
   * Show an info toast
   * @param {string} message - Message to display
   * @param {Object} options - Additional options
   * @returns {Toast}
   */
  info(message, options = {}) {
    return this.show(message, 'info', options)
  }

  /**
   * Dismiss all active toasts
   */
  dismissAll() {
    // Copy array since dismiss modifies activeToasts
    const toasts = [...this.activeToasts]
    toasts.forEach(toast => toast.dismiss())
  }
}

// Create singleton instance for plugin-wide use
const toastManager = new ToastManager()

export { Toast, ToastManager, toastManager }
