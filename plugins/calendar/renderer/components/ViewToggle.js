/**
 * ViewToggle Component
 *
 * Segmented toggle control for switching between week and month views.
 * Emits events when view changes.
 */

const VIEW_TYPES = {
  WEEK: 'week',
  MONTH: 'month'
}

class ViewToggle {
  /**
   * Create a ViewToggle
   * @param {HTMLElement} container - Container element
   * @param {Object} options - Configuration options
   * @param {string} options.initialView - Initial view type ('week' or 'month')
   * @param {Function} options.onChange - Callback when view changes
   */
  constructor(container, options = {}) {
    this.container = container
    this.currentView = options.initialView || VIEW_TYPES.MONTH
    this.onChange = options.onChange || null

    this.render()
  }

  /**
   * Render the toggle control
   */
  render() {
    this.container.innerHTML = `
      <div class="view-toggle">
        <button class="view-toggle-btn ${this.currentView === VIEW_TYPES.WEEK ? 'active' : ''}"
                data-view="${VIEW_TYPES.WEEK}">
          Week
        </button>
        <button class="view-toggle-btn ${this.currentView === VIEW_TYPES.MONTH ? 'active' : ''}"
                data-view="${VIEW_TYPES.MONTH}">
          Month
        </button>
      </div>
    `

    this.bindEvents()
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    const buttons = this.container.querySelectorAll('.view-toggle-btn')
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view
        if (view !== this.currentView) {
          this.setView(view)
        }
      })
    })
  }

  /**
   * Set the current view
   * @param {string} view - View type ('week' or 'month')
   */
  setView(view) {
    if (view !== VIEW_TYPES.WEEK && view !== VIEW_TYPES.MONTH) {
      console.warn(`[ViewToggle] Invalid view type: ${view}`)
      return
    }

    this.currentView = view
    this.updateActiveState()

    if (this.onChange) {
      this.onChange(view)
    }

    // Emit custom event
    const event = new CustomEvent('calendar:view-changed', {
      detail: { view },
      bubbles: true
    })
    this.container.dispatchEvent(event)
  }

  /**
   * Update the active button state
   */
  updateActiveState() {
    const buttons = this.container.querySelectorAll('.view-toggle-btn')
    buttons.forEach(btn => {
      if (btn.dataset.view === this.currentView) {
        btn.classList.add('active')
      } else {
        btn.classList.remove('active')
      }
    })
  }

  /**
   * Get current view type
   * @returns {string} Current view type
   */
  getView() {
    return this.currentView
  }

  /**
   * Destroy the component
   */
  destroy() {
    this.container.innerHTML = ''
  }
}

// Export for use by plugin system
export { ViewToggle, VIEW_TYPES }
