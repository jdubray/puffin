/**
 * Toast Component
 *
 * Displays temporary notification messages with auto-dismiss.
 * Supports success, error, warning, and info variants.
 */

const TOAST_DURATION = 2500
const TOAST_ANIMATION_DURATION = 200

class Toast {
  /**
   * Create a Toast
   * @param {Object} options - Configuration options
   * @param {string} options.message - Message to display
   * @param {string} options.type - Toast type: 'success', 'error', 'warning', 'info'
   * @param {number} options.duration - Duration in ms (default 2500)
   * @param {HTMLElement} options.container - Container element (default body)
   */
  constructor(options = {}) {
    this.message = options.message || ''
    this.type = options.type || 'info'
    this.duration = options.duration ?? TOAST_DURATION
    this.container = options.container || document.body

    this.element = null
    this.timeoutId = null

    this.create()
  }

  /**
   * Create the toast element
   */
  create() {
    this.element = document.createElement('div')
    this.element.className = `toast toast-${this.type}`
    this.element.setAttribute('role', 'alert')
    this.element.setAttribute('aria-live', 'polite')

    const icon = this.getIcon()

    this.element.innerHTML = `
      <div class="toast-icon" aria-hidden="true">
        ${icon}
      </div>
      <span class="toast-message">${this.escapeHtml(this.message)}</span>
      <button class="toast-close" type="button" aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `

    // Append to container
    this.ensureToastContainer()
    const toastContainer = this.container.querySelector('.toast-container')
    toastContainer.appendChild(this.element)

    // Bind close button
    const closeBtn = this.element.querySelector('.toast-close')
    closeBtn.addEventListener('click', () => this.dismiss())

    // Auto-dismiss
    if (this.duration > 0) {
      this.timeoutId = setTimeout(() => this.dismiss(), this.duration)
    }
  }

  /**
   * Ensure toast container exists
   */
  ensureToastContainer() {
    let toastContainer = this.container.querySelector('.toast-container')
    if (!toastContainer) {
      toastContainer = document.createElement('div')
      toastContainer.className = 'toast-container'
      toastContainer.setAttribute('aria-label', 'Notifications')
      this.container.appendChild(toastContainer)
    }
  }

  /**
   * Get icon SVG for toast type
   * @returns {string} SVG HTML
   */
  getIcon() {
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
   * Dismiss the toast
   */
  dismiss() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }

    if (!this.element) return

    // Add exit animation
    this.element.classList.add('toast-exit')

    setTimeout(() => {
      this.destroy()
    }, TOAST_ANIMATION_DURATION)
  }

  /**
   * Escape HTML for safe display
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
   * Destroy the toast element
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
    }
    this.element = null
  }
}

/**
 * ToastManager - Singleton for managing toasts
 */
class ToastManager {
  constructor() {
    this.container = null
  }

  /**
   * Set the container for toasts
   * @param {HTMLElement} container
   */
  setContainer(container) {
    this.container = container
  }

  /**
   * Show a toast message
   * @param {string} message - Message to display
   * @param {string} type - Toast type
   * @param {Object} options - Additional options
   * @returns {Toast}
   */
  show(message, type = 'info', options = {}) {
    return new Toast({
      message,
      type,
      container: this.container || document.body,
      ...options
    })
  }

  /**
   * Show success toast
   * @param {string} message
   * @param {Object} options
   * @returns {Toast}
   */
  success(message, options = {}) {
    return this.show(message, 'success', options)
  }

  /**
   * Show error toast
   * @param {string} message
   * @param {Object} options
   * @returns {Toast}
   */
  error(message, options = {}) {
    console.error('[Toast Error]', message)
    return this.show(message, 'error', options)
  }

  /**
   * Show warning toast
   * @param {string} message
   * @param {Object} options
   * @returns {Toast}
   */
  warning(message, options = {}) {
    console.warn('[Toast Warning]', message)
    return this.show(message, 'warning', options)
  }

  /**
   * Show info toast
   * @param {string} message
   * @param {Object} options
   * @returns {Toast}
   */
  info(message, options = {}) {
    return this.show(message, 'info', options)
  }
}

// Create singleton instance
const toastManager = new ToastManager()

// Export
export { Toast, ToastManager, toastManager }
