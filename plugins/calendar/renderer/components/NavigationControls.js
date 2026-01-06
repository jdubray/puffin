/**
 * NavigationControls Component
 *
 * Provides previous/next navigation and "Today" button.
 * Works with both week and month views.
 */

class NavigationControls {
  /**
   * Create NavigationControls
   * @param {HTMLElement} container - Container element
   * @param {Object} options - Configuration options
   * @param {string} options.title - Initial title to display
   * @param {Function} options.onPrevious - Callback for previous button
   * @param {Function} options.onNext - Callback for next button
   * @param {Function} options.onToday - Callback for today button
   */
  constructor(container, options = {}) {
    this.container = container
    this.title = options.title || ''
    this.onPrevious = options.onPrevious || null
    this.onNext = options.onNext || null
    this.onToday = options.onToday || null

    this.render()
  }

  /**
   * Render the navigation controls
   */
  render() {
    this.container.innerHTML = `
      <div class="calendar-nav">
        <button class="calendar-nav-btn calendar-prev-btn" title="Previous" aria-label="Previous">
          ‹
        </button>
        <h2 class="calendar-nav-title">${this.escapeHtml(this.title)}</h2>
        <button class="calendar-nav-btn calendar-next-btn" title="Next" aria-label="Next">
          ›
        </button>
        <button class="calendar-today-btn" title="Go to today">
          Today
        </button>
      </div>
    `

    this.bindEvents()
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const prevBtn = this.container.querySelector('.calendar-prev-btn')
    const nextBtn = this.container.querySelector('.calendar-next-btn')
    const todayBtn = this.container.querySelector('.calendar-today-btn')

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.onPrevious) this.onPrevious()
      })
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.onNext) this.onNext()
      })
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        if (this.onToday) this.onToday()
      })
    }
  }

  /**
   * Update the displayed title
   * @param {string} title - New title
   */
  setTitle(title) {
    this.title = title
    const titleEl = this.container.querySelector('.calendar-nav-title')
    if (titleEl) {
      titleEl.textContent = title
    }
  }

  /**
   * Destroy the component
   */
  destroy() {
    this.container.innerHTML = ''
  }
}

// Export for use by plugin system
export { NavigationControls }
