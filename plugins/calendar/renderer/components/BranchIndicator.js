/**
 * BranchIndicator Component
 *
 * Displays git branch indicators as colored pills on calendar days.
 * Shows up to 3 branches with overflow indicator for additional branches.
 */

const MAX_VISIBLE_BRANCHES = 3

class BranchIndicator {
  /**
   * Create a BranchIndicator
   * @param {Object} options - Configuration options
   * @param {Array} options.branches - Array of branch info objects
   * @param {Function} options.onBranchClick - Callback when branch is clicked
   * @param {Function} options.getBranchColor - Function to get branch color
   */
  constructor(options = {}) {
    this.branches = options.branches || []
    this.onBranchClick = options.onBranchClick || null
    this.getBranchColor = options.getBranchColor || this.defaultGetBranchColor.bind(this)
    this.element = null

    this.create()
  }

  /**
   * Default branch color function
   * @param {string} branchName - Branch name
   * @returns {string} HSL color string
   */
  defaultGetBranchColor(branchName) {
    if (!branchName) return 'hsl(0, 0%, 50%)'

    let hash = 0
    for (let i = 0; i < branchName.length; i++) {
      hash = branchName.charCodeAt(i) + ((hash << 5) - hash)
      hash = hash & hash
    }

    const hue = Math.abs(hash % 360)

    if (branchName === 'main' || branchName === 'master') {
      return 'hsl(220, 70%, 55%)'
    }
    if (branchName.startsWith('feature/')) {
      return `hsl(${(hue % 60) + 120}, 65%, 50%)`
    }
    if (branchName.startsWith('bugfix/') || branchName.startsWith('fix/')) {
      return `hsl(${(hue % 30) + 0}, 70%, 55%)`
    }

    return `hsl(${hue}, 60%, 50%)`
  }

  /**
   * Create the DOM element
   */
  create() {
    this.element = document.createElement('div')
    this.element.className = 'branch-indicators'
    this.element.setAttribute('role', 'list')
    this.element.setAttribute('aria-label', 'Git branches')

    this.render()
  }

  /**
   * Render branch indicators
   */
  render() {
    if (!this.branches || this.branches.length === 0) {
      this.element.innerHTML = ''
      this.element.style.display = 'none'
      return
    }

    this.element.style.display = ''

    const visibleBranches = this.branches.slice(0, MAX_VISIBLE_BRANCHES)
    const overflowCount = this.branches.length - MAX_VISIBLE_BRANCHES

    let html = ''

    visibleBranches.forEach((branch, index) => {
      const name = branch.name || branch
      const displayName = branch.abbreviatedName || this.abbreviateName(name)
      const color = branch.color || this.getBranchColor(name)
      const operationCount = branch.operationCount || 0

      html += `
        <div class="branch-pill"
             role="listitem"
             tabindex="0"
             data-branch-index="${index}"
             data-branch-name="${this.escapeAttr(name)}"
             title="${this.escapeAttr(name)}${operationCount > 0 ? ` (${operationCount} operations)` : ''}"
             style="--branch-color: ${color}">
          <span class="branch-pill-text">${this.escapeHtml(displayName)}</span>
        </div>
      `
    })

    if (overflowCount > 0) {
      const overflowBranches = this.branches.slice(MAX_VISIBLE_BRANCHES)
        .map(b => b.name || b)
        .join(', ')

      html += `
        <div class="branch-pill branch-pill-overflow"
             role="listitem"
             tabindex="0"
             data-overflow="true"
             title="${this.escapeAttr(overflowBranches)}">
          <span class="branch-pill-text">+${overflowCount}</span>
        </div>
      `
    }

    this.element.innerHTML = html
    this.bindEvents()
  }

  /**
   * Abbreviate branch name for display
   * @param {string} name - Full branch name
   * @param {number} maxLength - Maximum length
   * @returns {string} Abbreviated name
   */
  abbreviateName(name, maxLength = 10) {
    if (!name) return ''
    if (name.length <= maxLength) return name

    const prefixMatch = name.match(/^([a-z]+)\/(.+)$/i)
    if (prefixMatch) {
      const prefix = prefixMatch[1]
      const rest = prefixMatch[2]
      const shortPrefix = prefix.charAt(0).toLowerCase() + '/'
      const remaining = maxLength - shortPrefix.length - 1

      if (rest.length <= remaining) {
        return shortPrefix + rest
      }
      return shortPrefix + rest.substring(0, remaining) + '…'
    }

    return name.substring(0, maxLength - 1) + '…'
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    this.element.querySelectorAll('.branch-pill').forEach(pill => {
      pill.addEventListener('click', (e) => this.handleClick(e, pill))
      pill.addEventListener('keydown', (e) => this.handleKeyDown(e, pill))
    })
  }

  /**
   * Handle click on branch pill
   * @param {Event} e - Click event
   * @param {HTMLElement} pill - Clicked pill element
   */
  handleClick(e, pill) {
    e.stopPropagation()

    const isOverflow = pill.dataset.overflow === 'true'

    if (isOverflow) {
      // Show overflow popover or expanded list
      this.showOverflowPopover(pill)
      return
    }

    const branchIndex = parseInt(pill.dataset.branchIndex, 10)
    const branch = this.branches[branchIndex]

    if (this.onBranchClick && branch) {
      this.onBranchClick(branch, e)
    }

    // Dispatch custom event
    const event = new CustomEvent('branch:click', {
      detail: { branch, isOverflow },
      bubbles: true
    })
    this.element.dispatchEvent(event)
  }

  /**
   * Handle keyboard events
   * @param {KeyboardEvent} e - Keyboard event
   * @param {HTMLElement} pill - Focus element
   */
  handleKeyDown(e, pill) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      this.handleClick(e, pill)
    }
  }

  /**
   * Show overflow popover with all branches
   * @param {HTMLElement} trigger - Trigger element
   */
  showOverflowPopover(trigger) {
    // Remove existing popover
    const existing = document.querySelector('.branch-overflow-popover')
    if (existing) {
      existing.remove()
    }

    const popover = document.createElement('div')
    popover.className = 'branch-overflow-popover'
    popover.setAttribute('role', 'listbox')
    popover.setAttribute('aria-label', 'Additional branches')

    const overflowBranches = this.branches.slice(MAX_VISIBLE_BRANCHES)

    popover.innerHTML = overflowBranches.map((branch, index) => {
      const name = branch.name || branch
      const color = branch.color || this.getBranchColor(name)
      const operationCount = branch.operationCount || 0

      return `
        <div class="branch-popover-item"
             role="option"
             tabindex="0"
             data-branch-index="${index + MAX_VISIBLE_BRANCHES}"
             data-branch-name="${this.escapeAttr(name)}">
          <span class="branch-popover-color" style="background: ${color}"></span>
          <span class="branch-popover-name">${this.escapeHtml(name)}</span>
          ${operationCount > 0 ? `<span class="branch-popover-count">${operationCount}</span>` : ''}
        </div>
      `
    }).join('')

    // Position popover
    document.body.appendChild(popover)
    const triggerRect = trigger.getBoundingClientRect()
    const popoverRect = popover.getBoundingClientRect()

    let left = triggerRect.left
    let top = triggerRect.bottom + 4

    // Adjust if going off screen
    if (left + popoverRect.width > window.innerWidth) {
      left = window.innerWidth - popoverRect.width - 8
    }
    if (top + popoverRect.height > window.innerHeight) {
      top = triggerRect.top - popoverRect.height - 4
    }

    popover.style.left = `${left}px`
    popover.style.top = `${top}px`

    // Bind popover events
    popover.querySelectorAll('.branch-popover-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const branchIndex = parseInt(item.dataset.branchIndex, 10)
        const branch = this.branches[branchIndex]

        if (this.onBranchClick && branch) {
          this.onBranchClick(branch, e)
        }

        popover.remove()
      })
    })

    // Close on outside click
    const closeHandler = (e) => {
      if (!popover.contains(e.target) && !trigger.contains(e.target)) {
        popover.remove()
        document.removeEventListener('click', closeHandler)
      }
    }
    setTimeout(() => document.addEventListener('click', closeHandler), 0)

    // Close on escape
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        popover.remove()
        document.removeEventListener('keydown', escHandler)
        trigger.focus()
      }
    }
    document.addEventListener('keydown', escHandler)
  }

  /**
   * Update branches
   * @param {Array} branches - New branches array
   */
  setBranches(branches) {
    this.branches = branches || []
    this.render()
  }

  /**
   * Get the DOM element
   * @returns {HTMLElement}
   */
  getElement() {
    return this.element
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
   * Escape attribute value
   * @param {string} text - Text to escape
   * @returns {string}
   */
  escapeAttr(text) {
    if (!text) return ''
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  /**
   * Destroy the component
   */
  destroy() {
    // Remove any popovers
    const popover = document.querySelector('.branch-overflow-popover')
    if (popover) {
      popover.remove()
    }

    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
    }
    this.element = null
  }
}

/**
 * Static method to create branch indicators HTML string
 * Useful for inline rendering without component instance
 * @param {Array} branches - Array of branch info
 * @param {Object} options - Options
 * @returns {string} HTML string
 */
BranchIndicator.renderInline = function(branches, options = {}) {
  if (!branches || branches.length === 0) {
    return ''
  }

  const maxVisible = options.maxVisible || MAX_VISIBLE_BRANCHES
  const getBranchColor = options.getBranchColor || BranchIndicator.prototype.defaultGetBranchColor

  const visibleBranches = branches.slice(0, maxVisible)
  const overflowCount = branches.length - maxVisible

  let html = '<div class="branch-indicators" role="list" aria-label="Git branches">'

  visibleBranches.forEach((branch) => {
    const name = branch.name || branch
    const displayName = branch.abbreviatedName || name.substring(0, 8)
    const color = branch.color || getBranchColor(name)

    html += `
      <div class="branch-pill"
           role="listitem"
           title="${name}"
           style="--branch-color: ${color}">
        <span class="branch-pill-text">${displayName}</span>
      </div>
    `
  })

  if (overflowCount > 0) {
    html += `
      <div class="branch-pill branch-pill-overflow"
           role="listitem"
           title="${branches.slice(maxVisible).map(b => b.name || b).join(', ')}">
        <span class="branch-pill-text">+${overflowCount}</span>
      </div>
    `
  }

  html += '</div>'
  return html
}

// Export for use by plugin system
export { BranchIndicator }
