/**
 * User Stories Component
 *
 * Manages user stories extracted from specification prompts.
 * Stories can be manually added or auto-extracted from specifications branch.
 * Includes sprint history panel for viewing past sprints.
 */

// Search configuration
const SEARCH_MIN_CHARS = 3
const SEARCH_DEBOUNCE_MS = 150

// LocalStorage key for panel collapse state
const SPRINT_PANEL_COLLAPSED_KEY = 'puffin-sprint-panel-collapsed'

export class UserStoriesComponent {
  constructor(intents) {
    this.intents = intents
    this.container = null
    this.filterBtns = null
    this.addBtn = null
    this.listContainer = null
    this.branchSelect = null
    this.searchInput = null
    this.currentFilter = 'pending'
    this.currentBranch = 'all' // Filter by branch
    this.searchQuery = ''
    this.searchDebounceTimer = null
    this.stories = []
    this.branches = {}
    this.selectedStoryIds = new Set() // Track selected stories for batch operations

    // Sprint history panel state
    this.sprintHistoryPanel = null
    this.sprintTilesList = null
    this.sprintPanelCollapseBtn = null
    this.sprintHistory = []
    this.isPanelCollapsed = false

    // Sprint filter state
    this.selectedSprintFilter = null // Sprint ID or null for "all stories"
  }

  /**
   * Initialize the component
   */
  init() {
    this.container = document.getElementById('user-stories-view')
    this.listContainer = document.getElementById('user-stories-list')
    this.addBtn = document.getElementById('add-story-btn')
    this.filterBtns = this.container.querySelectorAll('.filter-btn')
    this.searchInput = document.getElementById('story-search-input')

    // Sprint history panel elements
    this.sprintHistoryPanel = document.getElementById('sprint-history-panel')
    this.sprintTilesList = document.getElementById('sprint-tiles-list')
    this.sprintPanelCollapseBtn = document.getElementById('sprint-panel-collapse-btn')

    // Restore panel collapse state from localStorage
    this.isPanelCollapsed = localStorage.getItem(SPRINT_PANEL_COLLAPSED_KEY) === 'true'
    if (this.isPanelCollapsed) {
      this.sprintHistoryPanel?.classList.add('collapsed')
      this.sprintPanelCollapseBtn?.setAttribute('aria-expanded', 'false')
    }

    this.bindEvents()
    this.subscribeToState()

    // Load sprint history on init
    this.loadSprintHistory()
  }

  /**
   * Load sprint history from backend
   */
  async loadSprintHistory() {
    if (!window.puffin?.state?.getSprintHistory) {
      console.log('[UserStories] Sprint history API not available')
      return
    }

    try {
      const result = await window.puffin.state.getSprintHistory()
      if (result.success && result.sprints) {
        this.sprintHistory = result.sprints
        this.intents.loadSprintHistory(result.sprints)
        this.renderSprintHistory()
      }
    } catch (error) {
      console.error('[UserStories] Failed to load sprint history:', error)
    }
  }

  /**
   * Bind DOM events
   */
  bindEvents() {
    // Sprint history panel collapse toggle
    if (this.sprintPanelCollapseBtn) {
      this.sprintPanelCollapseBtn.addEventListener('click', () => {
        this.toggleSprintPanel()
      })
    }

    // Backlog/Insights tab switching
    this.container.querySelectorAll('.backlog-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab)
      })
    })

    // Filter buttons
    this.filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.setFilter(btn.dataset.status)
      })
    })

    // Add story button
    this.addBtn.addEventListener('click', () => {
      this.showAddStoryModal()
    })

    // Search input with debounce
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.handleSearchInput(e.target.value)
      })
    }
  }

  /**
   * Toggle sprint history panel collapse state
   */
  toggleSprintPanel() {
    this.isPanelCollapsed = !this.isPanelCollapsed
    localStorage.setItem(SPRINT_PANEL_COLLAPSED_KEY, this.isPanelCollapsed)

    if (this.isPanelCollapsed) {
      this.sprintHistoryPanel?.classList.add('collapsed')
      this.sprintPanelCollapseBtn?.setAttribute('aria-expanded', 'false')
      this.sprintPanelCollapseBtn?.setAttribute('title', 'Expand')
      this.sprintPanelCollapseBtn?.setAttribute('aria-label', 'Expand sprint history panel')
    } else {
      this.sprintHistoryPanel?.classList.remove('collapsed')
      this.sprintPanelCollapseBtn?.setAttribute('aria-expanded', 'true')
      this.sprintPanelCollapseBtn?.setAttribute('title', 'Collapse')
      this.sprintPanelCollapseBtn?.setAttribute('aria-label', 'Collapse sprint history panel')
    }
  }

  /**
   * Render sprint history tiles
   */
  renderSprintHistory() {
    if (!this.sprintTilesList) return

    if (this.sprintHistory.length === 0) {
      this.sprintTilesList.innerHTML = '<p class="placeholder">No past sprints yet.</p>'
      return
    }

    const tilesHtml = this.sprintHistory.map(sprint => this.renderSprintTile(sprint)).join('')
    this.sprintTilesList.innerHTML = tilesHtml

    // Bind tile click events
    this.bindSprintTileEvents()
  }

  /**
   * Render a single sprint tile
   * @param {Object} sprint - Sprint object
   */
  renderSprintTile(sprint) {
    const storyCount = sprint.storyIds?.length || 0
    const closedDate = sprint.closedAt ? this.formatDate(sprint.closedAt) : 'Unknown'
    const title = sprint.title || `Sprint ${sprint.id.substring(0, 6)}`
    const description = sprint.description || ''
    const statusClass = this.computeSprintCompletionStatus(sprint)
    const isSelected = this.selectedSprintFilter === sprint.id
    const selectedClass = isSelected ? 'selected' : ''
    const ariaPressed = isSelected ? 'true' : 'false'

    return `
      <div class="sprint-tile ${statusClass} ${selectedClass}" data-sprint-id="${sprint.id}" role="button" tabindex="0" aria-pressed="${ariaPressed}">
        <div class="sprint-tile-header">
          <span class="sprint-status-indicator" aria-label="${this.getStatusLabel(statusClass)}"></span>
          <span class="sprint-tile-title">${this.escapeHtml(title)}</span>
        </div>
        ${description ? `<p class="sprint-tile-description">${this.escapeHtml(description)}</p>` : ''}
        <div class="sprint-tile-footer">
          <span class="sprint-tile-stories">${storyCount} ${storyCount === 1 ? 'story' : 'stories'}</span>
          <span class="sprint-tile-date">${closedDate}</span>
        </div>
      </div>
    `
  }

  /**
   * Compute sprint completion status for color coding
   * @param {Object} sprint - Sprint object
   * @returns {string} Status class: 'completed', 'partial', or 'not-started'
   */
  computeSprintCompletionStatus(sprint) {
    const storyProgress = sprint.storyProgress || {}
    const storyIds = sprint.storyIds || []

    if (storyIds.length === 0) return 'not-started'

    const completedCount = storyIds.filter(id =>
      storyProgress[id]?.status === 'completed'
    ).length

    if (completedCount === storyIds.length) return 'completed'
    if (completedCount > 0) return 'partial'
    return 'not-started'
  }

  /**
   * Get human-readable status label
   * @param {string} statusClass - Status class
   * @returns {string} Status label
   */
  getStatusLabel(statusClass) {
    const labels = {
      'completed': 'Completed',
      'partial': 'Partially completed',
      'not-started': 'Not started'
    }
    return labels[statusClass] || 'Unknown'
  }

  /**
   * Bind click events for sprint tiles
   */
  bindSprintTileEvents() {
    this.sprintTilesList.querySelectorAll('.sprint-tile').forEach(tile => {
      // Click handler - toggle filter by sprint
      tile.addEventListener('click', () => {
        const sprintId = tile.dataset.sprintId

        // Toggle filter: if already selected, clear filter; otherwise set filter
        if (this.selectedSprintFilter === sprintId) {
          this.intents.clearSprintFilter()
        } else {
          this.intents.setSprintFilter(sprintId)
        }
      })

      // Keyboard handler for accessibility
      tile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          tile.click()
        }
      })
    })
  }

  /**
   * Handle search input with debouncing
   * @param {string} value - The search input value
   */
  handleSearchInput(value) {
    clearTimeout(this.searchDebounceTimer)
    this.searchDebounceTimer = setTimeout(() => {
      this.searchQuery = value
      this.render()
    }, SEARCH_DEBOUNCE_MS)
  }

  /**
   * Switch between Backlog and Insights tabs
   */
  switchTab(tabName) {
    // Update tab buttons
    this.container.querySelectorAll('.backlog-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName)
    })

    // Update tab content
    this.container.querySelectorAll('.backlog-tab-content').forEach(content => {
      const isActive = content.id === `backlog-${tabName}-tab`
      content.classList.toggle('active', isActive)
    })
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      const { state } = e.detail
      this.stories = state.userStories || []
      this.branches = state.history?.raw?.branches || {}

      // Update sprint history if it changed
      const newSprintHistory = state.sprintHistory || []
      if (JSON.stringify(newSprintHistory) !== JSON.stringify(this.sprintHistory)) {
        this.sprintHistory = newSprintHistory
        this.renderSprintHistory()
      }

      // Update sprint filter if it changed
      const newSprintFilter = state.selectedSprintFilter || null
      if (newSprintFilter !== this.selectedSprintFilter) {
        this.selectedSprintFilter = newSprintFilter
        this.renderSprintHistory() // Re-render to update selection state
      }

      this.render()
    })
  }

  /**
   * Set the current filter
   */
  setFilter(status) {
    this.currentFilter = status
    this.filterBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === status)
    })
    this.render()
  }

  /**
   * Set branch filter
   */
  setBranchFilter(branchId) {
    this.currentBranch = branchId
    this.render()
  }

  /**
   * Get filtered stories (by status, branch, sprint, and search query)
   */
  getFilteredStories() {
    let filtered = this.stories

    // Filter by sprint (if a sprint is selected)
    if (this.selectedSprintFilter) {
      const selectedSprint = this.sprintHistory.find(s => s.id === this.selectedSprintFilter)
      if (selectedSprint && selectedSprint.storyIds) {
        const sprintStoryIds = new Set(selectedSprint.storyIds)
        filtered = filtered.filter(s => sprintStoryIds.has(s.id))
      }
    }

    // Filter by branch
    if (this.currentBranch !== 'all') {
      filtered = filtered.filter(s => s.branchId === this.currentBranch)
    }

    // Filter by status
    if (this.currentFilter !== 'all') {
      filtered = filtered.filter(s => s.status === this.currentFilter)
    }

    // Filter by search query (minimum 3 characters)
    if (this.searchQuery.length >= SEARCH_MIN_CHARS) {
      const query = this.searchQuery.toLowerCase()
      filtered = filtered.filter(s =>
        s.title.toLowerCase().includes(query) ||
        (s.description && s.description.toLowerCase().includes(query))
      )
    }

    return filtered
  }

  /**
   * Render the stories list
   */
  render() {
    // Render branch filter dropdown
    this.renderBranchFilter()

    // Render sprint filter indicator
    this.renderSprintFilterIndicator()

    const filtered = this.getFilteredStories()

    if (filtered.length === 0) {
      const branchText = this.currentBranch !== 'all' ? ` in "${this.currentBranch}" branch` : ''
      const sprintText = this.selectedSprintFilter ? ' in selected sprint' : ''
      this.listContainer.innerHTML = `
        <p class="placeholder">
          ${this.currentFilter === 'all'
            ? `No user stories${branchText}${sprintText} yet. Use "Derive User Stories" checkbox when submitting a prompt, or click "+ Add Story".`
            : `No ${this.currentFilter} stories${branchText}${sprintText}.`}
        </p>
      `
      return
    }

    // Separate active and archived stories
    const activeStories = filtered.filter(s => s.status !== 'archived')
    const archivedStories = filtered.filter(s => s.status === 'archived')

    let html = ''

    // Render active stories
    if (activeStories.length > 0) {
      html += activeStories.map(story => this.renderStoryCard(story)).join('')
    } else if (archivedStories.length > 0) {
      html += '<p class="placeholder">No active stories. All stories are archived.</p>'
    }

    // Render archived stories in collapsible section
    if (archivedStories.length > 0) {
      html += `
        <div class="archived-stories-section">
          <button class="archived-stories-toggle" aria-expanded="false">
            <span class="toggle-icon">▶</span>
            Archived Stories (${archivedStories.length})
          </button>
          <div class="archived-stories-list collapsed">
            ${archivedStories.map(story => this.renderStoryCard(story)).join('')}
          </div>
        </div>
      `
    }

    this.listContainer.innerHTML = html

    // Bind card events
    this.bindCardEvents()

    // Bind archived section toggle
    this.bindArchivedToggle()
  }

  /**
   * Bind toggle event for archived stories section
   */
  bindArchivedToggle() {
    const toggle = this.listContainer.querySelector('.archived-stories-toggle')
    if (!toggle) return

    toggle.addEventListener('click', () => {
      const list = this.listContainer.querySelector('.archived-stories-list')
      const icon = toggle.querySelector('.toggle-icon')
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true'

      toggle.setAttribute('aria-expanded', !isExpanded)
      list.classList.toggle('collapsed', isExpanded)
      icon.textContent = isExpanded ? '▶' : '▼'
    })
  }

  /**
   * Render the branch filter dropdown
   */
  renderBranchFilter() {
    // Find or create branch filter container
    let branchFilterContainer = this.container.querySelector('.branch-filter-container')
    if (!branchFilterContainer) {
      const toolbar = this.container.querySelector('.user-stories-toolbar')
      if (toolbar) {
        branchFilterContainer = document.createElement('div')
        branchFilterContainer.className = 'branch-filter-container'
        toolbar.insertBefore(branchFilterContainer, toolbar.firstChild)
      } else {
        return
      }
    }

    // Get unique branches from stories
    const branchIds = [...new Set(this.stories.map(s => s.branchId).filter(Boolean))]

    branchFilterContainer.innerHTML = `
      <label class="branch-filter-label">Branch:</label>
      <select class="branch-filter-select" id="story-branch-filter">
        <option value="all" ${this.currentBranch === 'all' ? 'selected' : ''}>All Branches</option>
        ${branchIds.map(branchId => `
          <option value="${branchId}" ${this.currentBranch === branchId ? 'selected' : ''}>
            ${this.formatBranchName(branchId)}
          </option>
        `).join('')}
      </select>
    `

    // Bind change event
    const select = branchFilterContainer.querySelector('#story-branch-filter')
    select.addEventListener('change', (e) => {
      this.setBranchFilter(e.target.value)
    })
  }

  /**
   * Render sprint filter indicator bar
   * Shows when a sprint is selected, with clear button
   */
  renderSprintFilterIndicator() {
    // Find or create sprint filter indicator container
    let indicatorContainer = this.container.querySelector('.sprint-filter-indicator')

    // If no sprint is selected, remove indicator if it exists
    if (!this.selectedSprintFilter) {
      if (indicatorContainer) {
        indicatorContainer.remove()
      }
      return
    }

    // Get selected sprint details
    const selectedSprint = this.sprintHistory.find(s => s.id === this.selectedSprintFilter)
    if (!selectedSprint) {
      if (indicatorContainer) {
        indicatorContainer.remove()
      }
      return
    }

    const sprintTitle = selectedSprint.title || `Sprint ${selectedSprint.id.substring(0, 6)}`
    const storyCount = selectedSprint.storyIds?.length || 0

    // Create indicator if it doesn't exist
    if (!indicatorContainer) {
      indicatorContainer = document.createElement('div')
      indicatorContainer.className = 'sprint-filter-indicator'
      indicatorContainer.setAttribute('role', 'status')
      indicatorContainer.setAttribute('aria-live', 'polite')

      // Insert before the story list
      const storiesList = this.container.querySelector('#user-stories-list')
      if (storiesList) {
        storiesList.parentNode.insertBefore(indicatorContainer, storiesList)
      } else {
        return
      }
    }

    indicatorContainer.innerHTML = `
      <span class="sprint-filter-icon" aria-hidden="true">⚡</span>
      <span class="sprint-filter-text">
        Showing <strong>${storyCount}</strong> ${storyCount === 1 ? 'story' : 'stories'} from
        <strong>${this.escapeHtml(sprintTitle)}</strong>
      </span>
      <button class="sprint-filter-clear-btn" type="button" aria-label="Clear sprint filter">
        <span aria-hidden="true">×</span> Clear Filter
      </button>
    `

    // Bind clear button event
    const clearBtn = indicatorContainer.querySelector('.sprint-filter-clear-btn')
    clearBtn.addEventListener('click', () => {
      this.intents.clearSprintFilter()
    })
  }

  /**
   * Format branch name for display
   */
  formatBranchName(branchId) {
    const branch = this.branches[branchId]
    if (branch?.name) return branch.name
    // Capitalize first letter
    return branchId.charAt(0).toUpperCase() + branchId.slice(1)
  }

  /**
   * Render a single story card
   */
  renderStoryCard(story) {
    const statusClass = story.status.replace('-', '')
    const criteriaCount = story.acceptanceCriteria?.length || 0
    const isSelected = this.selectedStoryIds.has(story.id)
    const canImplement = story.status === 'pending' // Only pending stories can be started
    const canComplete = story.status === 'in-progress' // Only in-progress stories can be completed
    const canReopen = story.status === 'completed' || story.status === 'archived' // Completed/archived stories can be reopened
    const canArchive = story.status === 'completed' // Completed stories can be archived manually
    const isArchived = story.status === 'archived'

    return `
      <div class="story-card ${statusClass}${isSelected ? ' selected' : ''}" data-story-id="${story.id}">
        <div class="story-header">
          ${canImplement ? `
            <label class="story-checkbox-label">
              <input type="checkbox" class="story-checkbox" ${isSelected ? 'checked' : ''}>
            </label>
          ` : ''}
          <span class="story-status ${statusClass}">${this.formatStatus(story.status)}</span>
          <div class="story-actions">
            ${canComplete ? `<button class="story-action-btn complete-btn" title="Mark as completed">✓</button>` : ''}
            ${canArchive ? `<button class="story-action-btn archive-btn" title="Archive story">⌫</button>` : ''}
            ${canReopen ? `<button class="story-action-btn reopen-btn" title="Reopen story">↺</button>` : ''}
            ${!isArchived ? `<button class="story-action-btn edit-btn" title="Edit story">✎</button>` : ''}
            <button class="story-action-btn delete-btn" title="Delete story">×</button>
          </div>
        </div>
        <h4 class="story-title">${this.escapeHtml(story.title)}</h4>
        ${story.description ? `<p class="story-description">${this.escapeHtml(story.description)}</p>` : ''}
        ${criteriaCount > 0 ? `
          <div class="story-criteria">
            <span class="criteria-count">${criteriaCount} acceptance criteria</span>
            <ul class="criteria-list collapsed">
              ${story.acceptanceCriteria.map(c => `<li>${this.escapeHtml(c)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        <div class="story-footer">
          <span class="story-date">${this.formatDate(story.createdAt)}</span>
          ${story.branchId ? `<span class="story-branch">${this.formatBranchName(story.branchId)}</span>` : ''}
          ${story.sourcePromptId ? '<span class="story-source">Auto-extracted</span>' : ''}
        </div>
      </div>
    `
  }

  /**
   * Bind events for story cards
   */
  bindCardEvents() {
    // Checkbox selection
    this.listContainer.querySelectorAll('.story-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation()
        const card = e.target.closest('.story-card')
        const storyId = card.dataset.storyId
        this.toggleStorySelection(storyId, e.target.checked)
      })
    })

    // Status change on click
    this.listContainer.querySelectorAll('.story-status').forEach(statusEl => {
      statusEl.addEventListener('click', (e) => {
        const card = e.target.closest('.story-card')
        const storyId = card.dataset.storyId
        this.cycleStatus(storyId)
      })
    })

    // Edit button
    this.listContainer.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.story-card')
        const storyId = card.dataset.storyId
        this.showEditStoryModal(storyId)
      })
    })

    // Delete button
    this.listContainer.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.story-card')
        const storyId = card.dataset.storyId
        this.deleteStory(storyId)
      })
    })

    // Complete button (mark as completed)
    this.listContainer.querySelectorAll('.complete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.story-card')
        const storyId = card.dataset.storyId
        this.markStoryCompleted(storyId)
      })
    })

    // Reopen button (mark completed/archived story as pending)
    this.listContainer.querySelectorAll('.reopen-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.story-card')
        const storyId = card.dataset.storyId
        this.reopenStory(storyId)
      })
    })

    // Archive button (mark completed story as archived)
    this.listContainer.querySelectorAll('.archive-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.story-card')
        const storyId = card.dataset.storyId
        this.archiveStory(storyId)
      })
    })

    // Expand/collapse criteria
    this.listContainer.querySelectorAll('.story-criteria').forEach(criteria => {
      criteria.addEventListener('click', () => {
        const list = criteria.querySelector('.criteria-list')
        list.classList.toggle('collapsed')
      })
    })
  }

  /**
   * Toggle story selection for batch operations
   */
  toggleStorySelection(storyId, selected) {
    if (selected) {
      this.selectedStoryIds.add(storyId)
    } else {
      this.selectedStoryIds.delete(storyId)
    }
    this.updateActionBar()
    // Update card visual state
    const card = this.listContainer.querySelector(`[data-story-id="${storyId}"]`)
    if (card) {
      card.classList.toggle('selected', selected)
    }
  }

  /**
   * Update the action bar based on selection
   */
  updateActionBar() {
    let actionBar = this.container.querySelector('.backlog-action-bar')

    if (this.selectedStoryIds.size === 0) {
      // Remove action bar if no selection
      if (actionBar) {
        actionBar.remove()
      }
      return
    }

    // Create or update action bar
    if (!actionBar) {
      actionBar = document.createElement('div')
      actionBar.className = 'backlog-action-bar'
      const toolbar = this.container.querySelector('.user-stories-toolbar')
      toolbar.parentNode.insertBefore(actionBar, toolbar.nextSibling)
    }

    actionBar.innerHTML = `
      <span class="selection-count">${this.selectedStoryIds.size} ${this.selectedStoryIds.size === 1 ? 'story' : 'stories'} selected</span>
      <div class="action-buttons">
        <button class="btn secondary clear-selection-btn">Clear Selection</button>
        <button class="btn primary create-sprint-btn">Create Sprint</button>
      </div>
    `

    // Bind action bar events
    actionBar.querySelector('.clear-selection-btn').addEventListener('click', () => {
      this.clearSelection()
    })

    actionBar.querySelector('.create-sprint-btn').addEventListener('click', () => {
      this.createSprint()
    })
  }

  /**
   * Clear all selections
   */
  clearSelection() {
    this.selectedStoryIds.clear()
    this.render()
  }

  /**
   * Create a sprint from selected stories
   */
  createSprint() {
    const selectedStories = this.stories.filter(s => this.selectedStoryIds.has(s.id))

    if (selectedStories.length === 0) {
      return
    }

    // Call intent to create sprint - this will switch to prompt view with sprint header
    this.intents.createSprint(selectedStories)

    // Clear selection after creating sprint
    this.selectedStoryIds.clear()
    this.updateActionBar()
  }

  /**
   * Cycle through status values
   */
  cycleStatus(storyId) {
    const story = this.stories.find(s => s.id === storyId)
    if (!story) return

    const statusOrder = ['pending', 'in-progress', 'completed', 'archived']
    const currentIndex = statusOrder.indexOf(story.status)
    const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length]

    this.intents.updateUserStory(storyId, { status: nextStatus })
  }

  /**
   * Show add story modal
   */
  showAddStoryModal() {
    this.intents.showModal('add-user-story', {
      onSubmit: (data) => {
        this.intents.addUserStory({
          title: data.title,
          description: data.description,
          acceptanceCriteria: data.acceptanceCriteria,
          status: 'pending'
        })
      }
    })
  }

  /**
   * Show edit story modal
   */
  showEditStoryModal(storyId) {
    const story = this.stories.find(s => s.id === storyId)
    if (!story) return

    this.intents.showModal('edit-user-story', {
      story,
      onSubmit: (data) => {
        this.intents.updateUserStory(storyId, data)
      }
    })
  }

  /**
   * Mark a story as completed
   */
  markStoryCompleted(storyId) {
    this.intents.updateUserStory(storyId, { status: 'completed' })
  }

  /**
   * Reopen a completed/archived story (set back to pending)
   */
  reopenStory(storyId) {
    this.intents.updateUserStory(storyId, { status: 'pending' })
  }

  /**
   * Archive a completed story
   */
  archiveStory(storyId) {
    this.intents.updateUserStory(storyId, { status: 'archived' })
  }

  /**
   * Delete a story
   */
  deleteStory(storyId) {
    if (confirm('Are you sure you want to delete this story?')) {
      this.intents.deleteUserStory(storyId)
    }
  }

  /**
   * Format status for display
   */
  formatStatus(status) {
    const statusMap = {
      'pending': 'Pending',
      'in-progress': 'In Progress',
      'completed': 'Completed',
      'archived': 'Archived'
    }
    return statusMap[status] || status
  }

  /**
   * Format date for display
   */
  formatDate(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleDateString()
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Cleanup
   */
  destroy() {
    // No cleanup needed currently
  }
}
