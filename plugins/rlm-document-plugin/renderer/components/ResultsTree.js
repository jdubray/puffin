/**
 * ResultsTree - Interactive tree display for RLM query results
 *
 * Displays query results in a collapsible tree format with:
 * - Chunk metadata (index, line range, relevance/confidence score)
 * - Click to select and view chunk content
 * - Sort by relevance or position
 * - Filter results by text search
 * - Keyboard navigation (arrow keys, Enter to select)
 * - Empty state messaging
 *
 * Result Item Structure (from backend):
 * {
 *   chunkIndex: 0,
 *   chunkId: "chunk_0",
 *   point: "Brief finding",
 *   excerpt: "Full quote from chunk",
 *   confidence: "high",  // high/medium/low
 *   lineRange: [10, 15]
 * }
 *
 * @module rlm-document-plugin/renderer/ResultsTree
 */

export class ResultsTree {
  /**
   * Component name for registration
   * @type {string}
   */
  static componentName = 'ResultsTree'

  /**
   * Sort options configuration
   * @type {Object}
   */
  static SORT_OPTIONS = {
    relevance: {
      label: 'Relevance',
      compareFn: (a, b) => {
        const confidenceOrder = { high: 3, medium: 2, low: 1 }
        const aScore = confidenceOrder[a.confidence] || 0
        const bScore = confidenceOrder[b.confidence] || 0
        return bScore - aScore
      }
    },
    position: {
      label: 'Position',
      compareFn: (a, b) => {
        const aStart = a.lineRange?.[0] ?? a.chunkIndex ?? 0
        const bStart = b.lineRange?.[0] ?? b.chunkIndex ?? 0
        return aStart - bStart
      }
    }
  }

  /**
   * Confidence level styling configuration
   * @type {Object}
   */
  static CONFIDENCE_LEVELS = {
    high: { label: 'High', icon: '🟢', className: 'confidence-high' },
    medium: { label: 'Medium', icon: '🟡', className: 'confidence-medium' },
    low: { label: 'Low', icon: '🔴', className: 'confidence-low' }
  }

  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} options - Component options
   * @param {Object} options.context - Plugin context with events API
   * @param {Function} options.onResultSelect - Callback when result is selected
   * @param {Array} options.results - Initial results array
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}
    this.onResultSelect = options.onResultSelect || (() => {})

    // State
    this.state = {
      results: options.results || [],
      sortBy: 'relevance',
      filterText: '',
      selectedIndex: -1,
      expandedItems: new Set()
    }

    // Event listener tracking for cleanup
    this._eventListeners = []

    // DOM element references
    this._elements = {
      sortSelect: null,
      filterInput: null,
      resultsList: null,
      emptyState: null,
      resultCount: null
    }

    // Bound handlers
    this._handleSortChange = this._handleSortChange.bind(this)
    this._handleFilterChange = this._handleFilterChange.bind(this)
    this._handleResultClick = this._handleResultClick.bind(this)
    this._handleKeyDown = this._handleKeyDown.bind(this)
    this._handleToggleExpand = this._handleToggleExpand.bind(this)
  }

  /**
   * Initialize the component
   */
  async init() {
    this.container.className = 'results-tree'
    this.container.setAttribute('role', 'region')
    this.container.setAttribute('aria-label', 'Query Results')
    this._render()
  }

  /**
   * Update the component with new results
   * @param {Object} updates - State updates
   * @param {Array} updates.results - New results array
   * @param {string} updates.sortBy - Sort method
   * @param {string} updates.filterText - Filter text
   */
  update(updates = {}) {
    let needsRender = false

    if ('results' in updates) {
      this.state.results = updates.results || []
      this.state.selectedIndex = -1
      this.state.expandedItems.clear()
      needsRender = true
    }

    if ('sortBy' in updates && updates.sortBy !== this.state.sortBy) {
      this.state.sortBy = updates.sortBy
      needsRender = true
    }

    if ('filterText' in updates && updates.filterText !== this.state.filterText) {
      this.state.filterText = updates.filterText
      needsRender = true
    }

    if (needsRender) {
      this._renderResultsList()
      this._updateResultCount()
    }
  }

  /**
   * Clear all results
   */
  clear() {
    this.state.results = []
    this.state.selectedIndex = -1
    this.state.filterText = ''
    this.state.expandedItems.clear()
    this._renderResultsList()
    this._updateResultCount()
  }

  /**
   * Get currently selected result
   * @returns {Object|null}
   */
  getSelectedResult() {
    const filtered = this._getFilteredResults()
    return filtered[this.state.selectedIndex] || null
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
   * Render the complete results tree component
   * @private
   */
  _render() {
    this._removeAllEventListeners()

    this.container.innerHTML = `
      <div class="results-tree-content">
        <!-- Controls Row -->
        <div class="results-controls">
          <div class="results-filter-group">
            <label for="results-filter" class="visually-hidden">Filter results</label>
            <input type="text"
                   id="results-filter"
                   class="results-filter-input"
                   placeholder="Filter results..."
                   value="${this._escapeHtml(this.state.filterText)}"
                   aria-describedby="results-count">
          </div>

          <div class="results-sort-group">
            <label for="results-sort" class="visually-hidden">Sort by</label>
            <select id="results-sort" class="results-sort-select">
              ${Object.entries(ResultsTree.SORT_OPTIONS).map(([value, config]) => `
                <option value="${value}" ${value === this.state.sortBy ? 'selected' : ''}>
                  ${this._escapeHtml(config.label)}
                </option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Result Count -->
        <div id="results-count" class="results-count" aria-live="polite">
          <span class="count-text"></span>
        </div>

        <!-- Results List -->
        <div class="results-list-container">
          <ul class="results-list"
              role="listbox"
              aria-label="Query results"
              tabindex="0">
            <!-- Results rendered here -->
          </ul>

          <!-- Empty State -->
          <div class="results-empty-state" role="status">
            <span class="empty-icon" aria-hidden="true">📋</span>
            <p class="empty-message">Run a query to see results</p>
          </div>
        </div>
      </div>
    `

    // Cache element references
    this._elements.sortSelect = this.container.querySelector('.results-sort-select')
    this._elements.filterInput = this.container.querySelector('.results-filter-input')
    this._elements.resultsList = this.container.querySelector('.results-list')
    this._elements.emptyState = this.container.querySelector('.results-empty-state')
    this._elements.resultCount = this.container.querySelector('.results-count .count-text')

    // Attach event handlers
    this._attachEventHandlers()

    // Initial render of results
    this._renderResultsList()
    this._updateResultCount()
  }

  /**
   * Render just the results list (for updates)
   * @private
   */
  _renderResultsList() {
    const list = this._elements.resultsList
    const emptyState = this._elements.emptyState
    if (!list || !emptyState) return

    const filteredResults = this._getFilteredResults()
    const sortedResults = this._getSortedResults(filteredResults)

    if (sortedResults.length === 0) {
      list.innerHTML = ''
      list.style.display = 'none'
      emptyState.style.display = 'flex'

      // Update empty message based on context
      const emptyMessage = emptyState.querySelector('.empty-message')
      if (emptyMessage) {
        if (this.state.results.length === 0) {
          emptyMessage.textContent = 'Run a query to see results'
        } else {
          emptyMessage.textContent = 'No results match your filter'
        }
      }
      return
    }

    list.style.display = 'block'
    emptyState.style.display = 'none'

    list.innerHTML = sortedResults.map((result, index) =>
      this._renderResultItem(result, index)
    ).join('')

    // Attach click handlers to result items
    this._attachResultItemHandlers()
  }

  /**
   * Render a single result item
   * @param {Object} result - Result data
   * @param {number} index - Index in filtered list
   * @returns {string} HTML string
   * @private
   */
  _renderResultItem(result, index) {
    const isSelected = index === this.state.selectedIndex
    const isExpanded = this.state.expandedItems.has(result.chunkId || index)
    const confidence = ResultsTree.CONFIDENCE_LEVELS[result.confidence] || ResultsTree.CONFIDENCE_LEVELS.medium

    const lineRange = result.lineRange
      ? `Lines ${result.lineRange[0]}-${result.lineRange[1]}`
      : `Chunk ${result.chunkIndex ?? index}`

    const point = result.point || 'No summary available'
    const excerpt = result.excerpt || ''

    return `
      <li class="result-item ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}"
          role="option"
          aria-selected="${isSelected}"
          data-index="${index}"
          data-chunk-id="${this._escapeHtml(result.chunkId || `chunk_${index}`)}"
          tabindex="${isSelected ? '0' : '-1'}">

        <div class="result-header" data-action="select">
          <button class="result-expand-btn"
                  type="button"
                  aria-expanded="${isExpanded}"
                  aria-label="${isExpanded ? 'Collapse' : 'Expand'} result details"
                  data-action="toggle">
            <span class="expand-icon" aria-hidden="true">${isExpanded ? '▼' : '▶'}</span>
          </button>

          <div class="result-meta">
            <span class="result-location">${this._escapeHtml(lineRange)}</span>
            <span class="result-confidence ${confidence.className}"
                  title="Confidence: ${confidence.label}">
              <span class="confidence-icon" aria-hidden="true">${confidence.icon}</span>
              <span class="confidence-label">${confidence.label}</span>
            </span>
          </div>

          <div class="result-summary" title="${this._escapeHtml(point)}">
            ${this._escapeHtml(this._truncate(point, 80))}
          </div>
        </div>

        <div class="result-details" ${isExpanded ? '' : 'hidden'}>
          ${excerpt ? `
            <div class="result-excerpt">
              <span class="excerpt-label">Excerpt:</span>
              <blockquote class="excerpt-text">${this._escapeHtml(excerpt)}</blockquote>
            </div>
          ` : ''}

          <div class="result-actions">
            <button class="result-view-btn"
                    type="button"
                    data-action="view"
                    title="View full chunk content">
              View Chunk
            </button>
          </div>
        </div>
      </li>
    `
  }

  /**
   * Update the result count display
   * @private
   */
  _updateResultCount() {
    if (!this._elements.resultCount) return

    const filtered = this._getFilteredResults()
    const total = this.state.results.length

    if (total === 0) {
      this._elements.resultCount.textContent = 'No results'
    } else if (filtered.length === total) {
      this._elements.resultCount.textContent = `${total} result${total !== 1 ? 's' : ''}`
    } else {
      this._elements.resultCount.textContent = `${filtered.length} of ${total} result${total !== 1 ? 's' : ''}`
    }
  }

  /**
   * Attach event handlers to rendered elements
   * @private
   */
  _attachEventHandlers() {
    if (this._elements.sortSelect) {
      this._addEventListener(this._elements.sortSelect, 'change', this._handleSortChange)
    }

    if (this._elements.filterInput) {
      this._addEventListener(this._elements.filterInput, 'input', this._handleFilterChange)
    }

    if (this._elements.resultsList) {
      this._addEventListener(this._elements.resultsList, 'keydown', this._handleKeyDown)
    }
  }

  /**
   * Attach click handlers to result items
   * @private
   */
  _attachResultItemHandlers() {
    const items = this.container.querySelectorAll('.result-item')
    items.forEach(item => {
      this._addEventListener(item, 'click', this._handleResultClick)
    })
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle sort dropdown change
   * @param {Event} event
   * @private
   */
  _handleSortChange(event) {
    const newSort = event.target.value
    if (newSort !== this.state.sortBy) {
      this.state.sortBy = newSort
      this._renderResultsList()

      // Emit sort change event
      if (this.context.events?.emit) {
        this.context.events.emit('results:sort-changed', { sortBy: newSort })
      }
    }
  }

  /**
   * Handle filter input change
   * @param {Event} event
   * @private
   */
  _handleFilterChange(event) {
    this.state.filterText = event.target.value
    this.state.selectedIndex = -1
    this._renderResultsList()
    this._updateResultCount()

    // Emit filter change event
    if (this.context.events?.emit) {
      this.context.events.emit('results:filter-changed', { filterText: this.state.filterText })
    }
  }

  /**
   * Handle click on result item
   * @param {Event} event
   * @private
   */
  _handleResultClick(event) {
    const item = event.target.closest('.result-item')
    if (!item) return

    const action = event.target.closest('[data-action]')?.dataset.action
    const index = parseInt(item.dataset.index, 10)

    if (action === 'toggle') {
      this._handleToggleExpand(item)
      event.stopPropagation()
      return
    }

    if (action === 'view' || action === 'select') {
      this._selectResult(index)
    }
  }

  /**
   * Handle expand/collapse toggle
   * @param {HTMLElement} item
   * @private
   */
  _handleToggleExpand(item) {
    const chunkId = item.dataset.chunkId
    const isExpanded = this.state.expandedItems.has(chunkId)

    if (isExpanded) {
      this.state.expandedItems.delete(chunkId)
      item.classList.remove('expanded')
    } else {
      this.state.expandedItems.add(chunkId)
      item.classList.add('expanded')
    }

    // Update expand button and details visibility
    const expandBtn = item.querySelector('.result-expand-btn')
    const expandIcon = item.querySelector('.expand-icon')
    const details = item.querySelector('.result-details')

    if (expandBtn) {
      expandBtn.setAttribute('aria-expanded', !isExpanded)
    }
    if (expandIcon) {
      expandIcon.textContent = isExpanded ? '▶' : '▼'
    }
    if (details) {
      details.hidden = isExpanded
    }
  }

  /**
   * Handle keyboard navigation
   * @param {KeyboardEvent} event
   * @private
   */
  _handleKeyDown(event) {
    const filtered = this._getFilteredResults()
    if (filtered.length === 0) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        this._navigateResults(1)
        break

      case 'ArrowUp':
        event.preventDefault()
        this._navigateResults(-1)
        break

      case 'Enter':
      case ' ':
        event.preventDefault()
        if (this.state.selectedIndex >= 0) {
          const result = filtered[this.state.selectedIndex]
          this._emitResultSelected(result)
        }
        break

      case 'ArrowRight':
        // Expand current item
        if (this.state.selectedIndex >= 0) {
          const item = this._elements.resultsList.querySelector(`[data-index="${this.state.selectedIndex}"]`)
          if (item && !this.state.expandedItems.has(item.dataset.chunkId)) {
            this._handleToggleExpand(item)
          }
        }
        break

      case 'ArrowLeft':
        // Collapse current item
        if (this.state.selectedIndex >= 0) {
          const item = this._elements.resultsList.querySelector(`[data-index="${this.state.selectedIndex}"]`)
          if (item && this.state.expandedItems.has(item.dataset.chunkId)) {
            this._handleToggleExpand(item)
          }
        }
        break

      case 'Home':
        event.preventDefault()
        this._selectResult(0)
        break

      case 'End':
        event.preventDefault()
        this._selectResult(filtered.length - 1)
        break
    }
  }

  /**
   * Navigate through results by offset
   * @param {number} offset - Direction (+1 or -1)
   * @private
   */
  _navigateResults(offset) {
    const filtered = this._getFilteredResults()
    if (filtered.length === 0) return

    let newIndex = this.state.selectedIndex + offset
    if (newIndex < 0) newIndex = filtered.length - 1
    if (newIndex >= filtered.length) newIndex = 0

    this._selectResult(newIndex)
  }

  /**
   * Select a result by index
   * @param {number} index
   * @private
   */
  _selectResult(index) {
    const filtered = this._getFilteredResults()
    if (index < 0 || index >= filtered.length) return

    // Update selection state
    const prevIndex = this.state.selectedIndex
    this.state.selectedIndex = index

    // Update UI
    const prevItem = this._elements.resultsList?.querySelector(`[data-index="${prevIndex}"]`)
    const newItem = this._elements.resultsList?.querySelector(`[data-index="${index}"]`)

    if (prevItem) {
      prevItem.classList.remove('selected')
      prevItem.setAttribute('aria-selected', 'false')
      prevItem.tabIndex = -1
    }

    if (newItem) {
      newItem.classList.add('selected')
      newItem.setAttribute('aria-selected', 'true')
      newItem.tabIndex = 0
      newItem.focus()
      newItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }

    // Emit selection event
    const result = filtered[index]
    this._emitResultSelected(result)
  }

  /**
   * Emit result selected event
   * @param {Object} result
   * @private
   */
  _emitResultSelected(result) {
    // Call callback
    this.onResultSelect(result)

    // Emit event
    if (this.context.events?.emit) {
      this.context.events.emit('result:selected', { result })
    }
  }

  // ============================================================================
  // DATA PROCESSING
  // ============================================================================

  /**
   * Get filtered results based on filter text
   * @returns {Array}
   * @private
   */
  _getFilteredResults() {
    const filterText = this.state.filterText.toLowerCase().trim()
    if (!filterText) return this.state.results

    return this.state.results.filter(result => {
      const point = (result.point || '').toLowerCase()
      const excerpt = (result.excerpt || '').toLowerCase()
      const chunkId = (result.chunkId || '').toLowerCase()

      return point.includes(filterText) ||
             excerpt.includes(filterText) ||
             chunkId.includes(filterText)
    })
  }

  /**
   * Get sorted results
   * @param {Array} results - Results to sort
   * @returns {Array}
   * @private
   */
  _getSortedResults(results) {
    const sortConfig = ResultsTree.SORT_OPTIONS[this.state.sortBy]
    if (!sortConfig) return results

    return [...results].sort(sortConfig.compareFn)
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

  /**
   * Truncate string to max length
   * @param {string} str
   * @param {number} maxLength
   * @returns {string}
   * @private
   */
  _truncate(str, maxLength) {
    if (!str || str.length <= maxLength) return str
    return str.substring(0, maxLength - 3) + '...'
  }
}

// Default export for ES module compatibility
export default ResultsTree
