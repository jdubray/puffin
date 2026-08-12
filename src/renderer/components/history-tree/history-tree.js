/**
 * History Tree Component
 *
 * Displays the hierarchical prompt/task history for the single implicit
 * prompt stream. Allows navigation through prompt history (chronological
 * root threads, expandable chains) and search.
 */

export class HistoryTreeComponent {
  constructor(intents) {
    this.intents = intents
    this.historyTree = null
    this.searchInput = null
    this.searchClearBtn = null
    this.refreshBtn = null
    this.debounceTimer = null
  }

  /**
   * Initialize the component
   */
  init() {
    this.historyTree = document.getElementById('history-tree')
    this.searchInput = document.getElementById('thread-search-input')
    this.searchClearBtn = document.getElementById('thread-search-clear')
    this.refreshBtn = document.getElementById('thread-refresh-btn')

    this.bindEvents()
    this.subscribeToState()
    this.subscribeToSync()
  }

  /**
   * Bind DOM events
   */
  bindEvents() {
    // Search input with debounce
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.handleSearchInput(e.target.value)
      })

      // Clear search on Escape key
      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.clearSearch()
        }
      })
    }

    // Clear search button
    if (this.searchClearBtn) {
      this.searchClearBtn.addEventListener('click', () => {
        this.clearSearch()
      })
    }

    // Refresh button - process sync inbox
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => {
        this.handleRefresh()
      })
    }
  }

  /**
   * Handle refresh button click - process sync inbox and reload state
   */
  async handleRefresh() {
    if (this.refreshBtn) {
      this.refreshBtn.classList.add('spinning')
      this.refreshBtn.disabled = true
    }

    try {
      // Process any pending sync inbox items, then reload state
      await window.puffin.state.processSyncInbox()
      await this.reloadState()
    } catch (error) {
      console.error('[HISTORY-TREE] Refresh failed:', error)
    } finally {
      if (this.refreshBtn) {
        this.refreshBtn.classList.remove('spinning')
        this.refreshBtn.disabled = false
      }
    }
  }

  /**
   * Reload full state from main and push it into the model.
   * Does NOT process the sync inbox — used when main has already processed it.
   */
  async reloadState() {
    const result = await window.puffin.state.init()
    if (result.success) {
      this.intents.loadState(result.state)
    }
  }

  /**
   * Subscribe to auto-sync events. When the main-process file watcher detects
   * and processes new /puffin-sync entries, reload state so they appear without
   * a manual refresh or app restart.
   */
  subscribeToSync() {
    if (!window.puffin?.state?.onSyncInboxProcessed) return

    this._unsubscribeSync = window.puffin.state.onSyncInboxProcessed(async () => {
      // Brief spin feedback on the refresh button, mirroring a manual refresh
      if (this.refreshBtn) this.refreshBtn.classList.add('spinning')
      try {
        await this.reloadState()
      } catch (error) {
        console.error('[HISTORY-TREE] Auto-sync refresh failed:', error)
      } finally {
        if (this.refreshBtn) this.refreshBtn.classList.remove('spinning')
      }
    })
  }

  /**
   * Handle search input with debounce
   * @param {string} value - Search query
   */
  handleSearchInput(value) {
    // Clear previous timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    // Debounce: wait 150ms before updating state
    this.debounceTimer = setTimeout(() => {
      this.intents.updateThreadSearchQuery(value)
    }, 150)

    // Update clear button visibility
    this.updateClearButtonVisibility(value)
  }

  /**
   * Clear the search input and state
   */
  clearSearch() {
    if (this.searchInput) {
      this.searchInput.value = ''
    }
    this.intents.updateThreadSearchQuery('')
    this.updateClearButtonVisibility('')
  }

  /**
   * Update the visibility of the clear button
   * @param {string} value - Current search value
   */
  updateClearButtonVisibility(value) {
    if (this.searchClearBtn) {
      this.searchClearBtn.classList.toggle('visible', value.length > 0)
    }
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      const { state } = e.detail
      this.render(state.history)
    })
  }

  /**
   * Render component based on state
   */
  render(historyState) {
    const searchQuery = historyState.threadSearchQuery || ''
    this.renderHistory(historyState.promptTree, historyState.activePromptId, searchQuery)

    // Sync search input with state (in case of external state changes)
    if (this.searchInput && this.searchInput.value !== searchQuery) {
      this.searchInput.value = searchQuery
      this.updateClearButtonVisibility(searchQuery)
    }
  }

  /**
   * Render history tree
   * @param {Array} promptTree - Array of prompts to render
   * @param {string} activePromptId - Currently selected prompt ID
   * @param {string} searchQuery - Search query to filter threads
   */
  renderHistory(promptTree, activePromptId, searchQuery = '') {
    if (!promptTree || promptTree.length === 0) {
      this.historyTree.innerHTML = `
        <div class="history-empty">
          No prompts yet. Start a conversation!
        </div>
      `
      return
    }

    // Filter prompts if search query is present
    const filteredTree = searchQuery
      ? this.filterPromptTree(promptTree, searchQuery)
      : promptTree

    // Show no results message if search returned nothing
    if (searchQuery && filteredTree.length === 0) {
      this.historyTree.innerHTML = `
        <div class="history-empty history-no-results">
          <span class="no-results-icon">🔍</span>
          <span>No tasks match "${this.escapeHtml(searchQuery)}"</span>
        </div>
      `
      return
    }

    this.historyTree.innerHTML = ''

    filteredTree.forEach(prompt => {
      const item = document.createElement('div')

      // Build class list based on prompt type and state
      let classes = ['history-item']
      if (prompt.isSelected) classes.push('selected')
      if (prompt.isStoryThread) classes.push('story-thread')
      if (prompt.isDerivation) classes.push('derivation')
      if (prompt.hasChildren) classes.push('has-children')
      if (prompt.isExpanded) classes.push('expanded')
      if (prompt.isComplete) classes.push('complete')

      item.className = classes.join(' ')
      item.style.setProperty('--depth', prompt.depth)
      item.dataset.promptId = prompt.id

      // Help-mode tooltip for threads
      if (prompt.isStoryThread) {
        item.dataset.help = `Story task: "${prompt.storyTitle || prompt.preview}" — a conversation dedicated to implementing a user story. Status: ${prompt.storyStatus || 'unknown'}. Click to view.`
      } else if (prompt.isDerivation) {
        item.dataset.help = `Derivation task — Claude analysed your conversation and generated user stories from it. Click to view.`
      } else {
        item.dataset.help = `Task: "${prompt.preview}" — a single conversation with Claude. Click to view, right-click for options.`
      }

      // Build the expand/collapse indicator for items with children
      const expandIndicator = prompt.hasChildren
        ? `<span class="expand-indicator">${prompt.isExpanded ? '▼' : '▶'}</span>`
        : `<span class="expand-indicator-spacer"></span>`

      // Complete indicator for completed threads
      const completeIndicator = prompt.isComplete ? `<span class="complete-indicator" title="Completed">✓</span>` : ''

      // Different rendering for story threads vs regular prompts
      if (prompt.isStoryThread) {
        const statusClass = this.getStoryStatusClass(prompt.storyStatus)
        const statusIcon = this.getStoryStatusIcon(prompt.storyStatus)
        item.innerHTML = `
          ${expandIndicator}
          <span class="status-dot ${statusClass}" title="${prompt.storyStatus}">${statusIcon}</span>
          <span class="preview story-title">${this.escapeHtml(prompt.storyTitle || prompt.preview)}</span>
          ${completeIndicator}
        `
      } else if (prompt.isDerivation) {
        item.innerHTML = `
          ${expandIndicator}
          <span class="status derivation-marker">📋</span>
          <span class="preview">${this.escapeHtml(prompt.preview)}</span>
          ${completeIndicator}
        `
      } else {
        item.innerHTML = `
          ${expandIndicator}
          <span class="status ${prompt.hasResponse ? 'has-response' : ''}"></span>
          <span class="preview">${this.escapeHtml(prompt.preview)}</span>
          ${completeIndicator}
          <button class="history-rerun-btn" title="Rerun this prompt">↻</button>
        `
      }

      // Click on expand indicator to toggle expansion
      const expandBtn = item.querySelector('.expand-indicator')
      if (expandBtn && prompt.hasChildren) {
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          // If collapsed, expand all the way to the end for top-level threads
          if (!prompt.isExpanded && prompt.depth === 0) {
            this.intents.expandThreadToEnd(prompt.id)
          } else {
            this.intents.toggleThreadExpanded(prompt.id)
          }
        })
      }

      // Click on item to select (and expand if collapsed with children)
      item.addEventListener('click', (e) => {
        // Don't select if clicking the rerun button or expand indicator
        if (e.target.classList.contains('history-rerun-btn')) return
        if (e.target.classList.contains('expand-indicator')) return

        // If has children and collapsed, expand it
        if (prompt.hasChildren && !prompt.isExpanded) {
          // For top-level threads (depth 0), expand all the way to the end
          // For nested items, just toggle the immediate children
          if (prompt.depth === 0) {
            this.intents.expandThreadToEnd(prompt.id)
          } else {
            this.intents.toggleThreadExpanded(prompt.id)
          }
        }
        this.intents.selectPrompt(prompt.id)
        this.intents.switchView('prompt')
      })

      // Rerun button click (only for regular prompts)
      const rerunBtn = item.querySelector('.history-rerun-btn')
      if (rerunBtn) {
        rerunBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          this.intents.rerunPrompt(prompt.id)
        })
      }

      // Right-click to show context menu (including mark complete option)
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        this.showPromptContextMenu(e, prompt)
      })

      this.historyTree.appendChild(item)
    })
  }

  /**
   * Get CSS class for story status
   */
  getStoryStatusClass(status) {
    const statusClasses = {
      'pending': 'status-pending',
      'planning': 'status-planning',
      'planned': 'status-planned',
      'in-progress': 'status-implementing',  // Treat in-progress same as implementing
      'implementing': 'status-implementing',
      'completed': 'status-completed',
      'failed': 'status-failed'
    }
    return statusClasses[status] || 'status-pending'
  }

  /**
   * Get icon for story status
   */
  getStoryStatusIcon(status) {
    const statusIcons = {
      'pending': '🟡',
      'planning': '🔵',
      'planned': '🟠',
      'in-progress': '🔵',  // Treat in-progress same as implementing
      'implementing': '🔵',
      'completed': '🟢',
      'failed': '🔴'
    }
    return statusIcons[status] || '🟡'
  }

  /**
   * Show prompt context menu
   */
  showPromptContextMenu(e, prompt) {
    // Remove any existing context menu
    const existingMenu = document.querySelector('.history-context-menu')
    if (existingMenu) {
      existingMenu.remove()
    }

    // Create context menu
    const menu = document.createElement('div')
    menu.className = 'history-context-menu'
    menu.style.left = `${e.clientX}px`
    menu.style.top = `${e.clientY}px`

    // Build menu items
    const menuItems = []

    // Reply option
    menuItems.push({
      label: 'Reply to this prompt',
      action: () => this.intents.selectPrompt(prompt.id)
    })

    // Mark complete/uncomplete option
    if (prompt.isComplete) {
      menuItems.push({
        label: 'Mark as in progress',
        action: () => this.intents.unmarkThreadComplete(prompt.id)
      })
    } else {
      menuItems.push({
        label: 'Mark as complete',
        action: () => this.intents.markThreadComplete(prompt.id)
      })
    }

    // Toggle expansion for items with children
    if (prompt.hasChildren) {
      menuItems.push({
        label: prompt.isExpanded ? 'Collapse task' : 'Expand task',
        action: () => this.intents.toggleThreadExpanded(prompt.id)
      })
    }

    // Render menu items
    menu.innerHTML = menuItems.map(item =>
      `<div class="context-menu-item">${item.label}</div>`
    ).join('')

    // Add click handlers
    const menuItemEls = menu.querySelectorAll('.context-menu-item')
    menuItemEls.forEach((el, i) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        menuItems[i].action()
        menu.remove()
      })
    })

    // Add to document
    document.body.appendChild(menu)

    // Close on click outside
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove()
        document.removeEventListener('click', closeHandler)
      }
    }
    setTimeout(() => document.addEventListener('click', closeHandler), 0)
  }

  /**
   * Filter prompt tree based on search query
   * Matches against prompt preview text and story titles (case-insensitive)
   * @param {Array} promptTree - Array of prompts to filter
   * @param {string} query - Search query
   * @returns {Array} Filtered array of prompts
   */
  filterPromptTree(promptTree, query) {
    const normalizedQuery = query.toLowerCase().trim()

    if (!normalizedQuery) {
      return promptTree
    }

    return promptTree.filter(prompt => {
      // Check preview text
      const preview = (prompt.preview || '').toLowerCase()
      if (preview.includes(normalizedQuery)) {
        return true
      }

      // Check story title for story threads
      if (prompt.storyTitle) {
        const storyTitle = prompt.storyTitle.toLowerCase()
        if (storyTitle.includes(normalizedQuery)) {
          return true
        }
      }

      // Check content if available
      if (prompt.content) {
        const content = prompt.content.toLowerCase()
        if (content.includes(normalizedQuery)) {
          return true
        }
      }

      return false
    })
  }

  /**
   * Escape HTML
   */
  escapeHtml(str) {
    if (!str) return ''
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  /**
   * Cleanup
   */
  destroy() {
    // Remove event listeners if needed
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
  }
}
