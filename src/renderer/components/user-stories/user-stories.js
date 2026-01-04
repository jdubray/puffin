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
const RESIZE_DEBOUNCE_MS = 150

// LocalStorage key for panel collapse state
const SPRINT_PANEL_COLLAPSED_KEY = 'puffin-sprint-panel-collapsed'

// View modes for the backlog
const VIEW_MODES = {
  LIST: 'list',
  KANBAN: 'kanban'
}

// Responsive breakpoint - show kanban when container is at least this wide
const KANBAN_MIN_WIDTH = 1200

export class UserStoriesComponent {
  constructor(intents) {
    this.intents = intents
    this.container = null
    this.filterBtns = null
    this.addBtn = null
    this.listContainer = null
    this.branchSelect = null
    this.searchInput = null
    this.currentFilter = 'all'
    this.currentBranch = 'all' // Filter by branch
    this.currentView = VIEW_MODES.LIST // Will be set by responsive detection
    this.autoResponsive = true // Enable automatic view switching based on width
    this.searchQuery = ''
    this.searchDebounceTimer = null
    this.resizeDebounceTimer = null
    this.resizeObserver = null
    this.stories = []
    this.branches = {}
    this.selectedStoryIds = new Set() // Track selected stories for batch operations
    // Drag and drop state
    this.draggedStoryId = null
    this.draggedStoryStatus = null
    // View transition state
    this.isTransitioning = false
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Sprint history panel state
    this.sprintHistoryPanel = null
    this.sprintTilesList = null
    this.sprintPanelCollapseBtn = null
    this.sprintHistory = []
    this.isPanelCollapsed = false

    // Sprint filter state
    this.selectedSprintFilter = null // Sprint ID or null for "all stories"

    // Active sprint state (for single-sprint enforcement)
    this.hasActiveSprint = false
    this.activeSprintTitle = null

    // Assertion evaluation state
    this.evaluatingStories = new Set() // Story IDs currently being evaluated
    this.evaluationProgress = new Map() // Story ID -> { current, total }
    this.evaluationCleanups = [] // Cleanup functions for IPC listeners
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
    this.sprintRefreshBtn = document.getElementById('sprint-history-refresh-btn')

    // Restore panel collapse state from localStorage
    this.isPanelCollapsed = localStorage.getItem(SPRINT_PANEL_COLLAPSED_KEY) === 'true'
    if (this.isPanelCollapsed) {
      this.sprintHistoryPanel?.classList.add('collapsed')
      this.sprintPanelCollapseBtn?.setAttribute('aria-expanded', 'false')
    }

    this.bindEvents()
    this.subscribeToState()
    this.setupResizeObserver()
    this.setupAssertionEvaluationListeners()

    // Set initial view based on current container width
    this.updateViewForWidth()

    // Load sprint history on init
    this.loadSprintHistory()
  }

  /**
   * Set up IPC listeners for assertion evaluation progress and completion
   */
  setupAssertionEvaluationListeners() {
    if (!window.puffin?.state?.onAssertionEvaluationProgress || !window.puffin?.state?.onAssertionEvaluationComplete) {
      console.warn('[UserStories] Assertion evaluation IPC not available')
      return
    }

    // Listen for evaluation progress updates
    const progressCleanup = window.puffin.state.onAssertionEvaluationProgress((data) => {
      const { storyId, current, total, assertionId } = data
      this.evaluationProgress.set(storyId, { current, total, assertionId })
      this.updateAssertionProgressUI(storyId)
    })

    // Listen for evaluation completion
    const completeCleanup = window.puffin.state.onAssertionEvaluationComplete((data) => {
      const { storyId, results } = data
      this.evaluatingStories.delete(storyId)
      this.evaluationProgress.delete(storyId)
      // Re-render the story card with updated results
      this.refreshStoryCard(storyId)
    })

    this.evaluationCleanups.push(progressCleanup, completeCleanup)
  }

  /**
   * Update the assertion progress UI for a specific story
   * @param {string} storyId - The story ID to update
   */
  updateAssertionProgressUI(storyId) {
    const assertionsSection = this.listContainer?.querySelector(
      `.story-assertions[data-story-id="${storyId}"]`
    )
    if (!assertionsSection) return

    const progress = this.evaluationProgress.get(storyId)
    if (!progress) return

    const summaryEl = assertionsSection.querySelector('.assertions-summary')
    if (summaryEl) {
      summaryEl.className = 'assertions-summary assertions-evaluating'
      summaryEl.innerHTML = `
        <span class="eval-spinner"></span>
        Evaluating ${progress.current}/${progress.total}...
      `
    }

    // Highlight the currently evaluating assertion
    const items = assertionsSection.querySelectorAll('.assertion-item')
    items.forEach(item => {
      item.classList.remove('evaluating')
    })
    if (progress.assertionId) {
      const currentItem = assertionsSection.querySelector(
        `.assertion-item[data-assertion-id="${progress.assertionId}"]`
      )
      if (currentItem) {
        currentItem.classList.add('evaluating')
      }
    }
  }

  /**
   * Refresh a single story card after evaluation completes
   * @param {string} storyId - The story ID to refresh
   */
  async refreshStoryCard(storyId) {
    // Request updated story data and trigger re-render
    if (this.intents.refreshUserStory) {
      await this.intents.refreshUserStory(storyId)
    } else {
      // Fallback: trigger full re-render
      this.render(this.stories)
    }
  }

  /**
   * Load sprint history from backend
   */
  async loadSprintHistory() {
    if (!window.puffin?.state?.getSprintHistory) {
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
   * Set up ResizeObserver for responsive layout switching
   */
  setupResizeObserver() {
    if (!this.container) return

    this.resizeObserver = new ResizeObserver((entries) => {
      // Debounce resize events for performance
      clearTimeout(this.resizeDebounceTimer)
      this.resizeDebounceTimer = setTimeout(() => {
        this.updateViewForWidth()
      }, RESIZE_DEBOUNCE_MS)
    })

    this.resizeObserver.observe(this.container)
  }

  /**
   * Update view mode based on container width
   */
  updateViewForWidth() {
    if (!this.container || !this.autoResponsive) return

    const containerWidth = this.container.offsetWidth
    const shouldBeKanban = containerWidth >= KANBAN_MIN_WIDTH
    const newView = shouldBeKanban ? VIEW_MODES.KANBAN : VIEW_MODES.LIST

    if (this.currentView !== newView) {
      this.transitionToView(newView)
    }
  }

  /**
   * Perform animated transition between views
   * @param {string} newView - The view mode to transition to
   */
  transitionToView(newView) {
    // Skip animation if already transitioning or user prefers reduced motion
    if (this.isTransitioning) return

    // For initial render or reduced motion, skip animation
    if (!this.listContainer.children.length || this.prefersReducedMotion) {
      this.currentView = newView
      this.render()
      this.pulseLayoutIndicator()
      return
    }

    this.isTransitioning = true

    // Phase 1: Fade out current view
    this.listContainer.classList.add('view-transitioning', 'view-fade-out')

    // Wait for fade out animation (125ms)
    requestAnimationFrame(() => {
      setTimeout(() => {
        // Phase 2: Switch view and render new content
        this.currentView = newView
        this.listContainer.classList.remove('view-fade-out')

        // Render the new view
        this.render()

        // Phase 3: Fade in new view
        requestAnimationFrame(() => {
          this.listContainer.classList.add('view-fade-in')
          this.pulseLayoutIndicator()

          // Clean up after animation completes (250ms for card animations)
          setTimeout(() => {
            this.listContainer.classList.remove('view-transitioning', 'view-fade-in')
            this.isTransitioning = false
          }, 250)
        })
      }, 125)
    })
  }

  /**
   * Pulse the layout indicator to draw attention to view change
   */
  pulseLayoutIndicator() {
    const indicator = this.container.querySelector('.layout-indicator')
    if (indicator) {
      indicator.classList.add('view-changed')
      setTimeout(() => {
        indicator.classList.remove('view-changed')
      }, 300)
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

    // Sprint history refresh button
    if (this.sprintRefreshBtn) {
      this.sprintRefreshBtn.addEventListener('click', () => {
        this.loadSprintHistory()
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
      const { state, actionType } = e.detail
      const previousCount = this.stories?.length || 0
      this.stories = state.userStories || []
      this.branches = state.history?.raw?.branches || {}

      // Debug logging for story count changes
      if (this.stories.length !== previousCount) {
        console.log('[USER-STORIES-COMPONENT] Story count changed:', previousCount, '->', this.stories.length, 'action:', actionType)
        if (this.stories.length === 0 && previousCount > 0) {
          console.error('[USER-STORIES-COMPONENT] WARNING: All stories disappeared! Action:', actionType)
          console.error('[USER-STORIES-COMPONENT] state.userStories:', state.userStories)
        }
      }

      // Debug logging for assertion updates
      if (actionType === 'UPDATE_USER_STORY') {
        const storiesWithAssertions = this.stories.filter(s => s.inspectionAssertions?.length > 0)
        console.log('[USER-STORIES-COMPONENT] After UPDATE_USER_STORY:', {
          totalStories: this.stories.length,
          storiesWithAssertions: storiesWithAssertions.length,
          assertionCounts: storiesWithAssertions.map(s => ({
            id: s.id.substring(0, 8),
            title: s.title.substring(0, 30),
            assertions: s.inspectionAssertions?.length || 0
          }))
        })
      }

      // Track active sprint state for single-sprint enforcement
      this.hasActiveSprint = !!state.activeSprint
      this.activeSprintTitle = state.activeSprint?.title || null

      // Reload sprint history after state is loaded (database is now ready)
      if (actionType === 'LOAD_STATE' && this.sprintHistory.length === 0) {
        this.loadSprintHistory()
      }

      // Reload sprint history when Backlog view comes into focus
      if (actionType === 'SWITCH_VIEW' && state.currentView === 'user-stories') {
        this.loadSprintHistory()
      }

      this.render()
    })
  }

  /**
   * Render sprint history tiles
   */
  renderSprintHistory() {
    if (!this.sprintTilesList) return

    if (this.sprintHistory.length === 0) {
      this.sprintTilesList.innerHTML = `
        <div class="sprint-empty-state">
          <p class="text-muted">No past sprints</p>
          <p class="text-small">Completed sprints will appear here</p>
        </div>
      `
      return
    }

    const tilesHtml = this.sprintHistory.map(sprint => this.renderSprintTile(sprint)).join('')
    this.sprintTilesList.innerHTML = tilesHtml

    // Bind tile click events
    this.bindSprintTileEvents()
  }

  /**
   * Render a single sprint tile (styled like sprint story cards)
   * @param {Object} sprint - Sprint object
   */
  renderSprintTile(sprint) {
    const storyCount = sprint.storyIds?.length || 0
    // Handle various date formats (timestamp, ISO string, or Date object)
    const closedDate = this.formatSprintDate(sprint.closedAt || sprint.createdAt)
    // Use title if available, otherwise use a short sprint ID
    const title = sprint.title || `Sprint ${sprint.id.substring(0, 6)}`
    const statusClass = this.computeSprintCompletionStatus(sprint)
    const isSelected = this.selectedSprintFilter === sprint.id
    const selectedClass = isSelected ? 'selected' : ''
    const ariaPressed = isSelected ? 'true' : 'false'

    // Map status to story card border class
    const borderClass = statusClass === 'completed' ? 'story-completed'
      : statusClass === 'partial' ? 'story-in-progress'
      : ''

    return `
      <div class="sprint-history-card ${borderClass} ${selectedClass}" data-sprint-id="${sprint.id}" role="button" tabindex="0" aria-pressed="${ariaPressed}">
        <div class="sprint-card-header">
          <h4>${this.escapeHtml(title)}</h4>
          ${closedDate ? `<span class="sprint-card-meta">${closedDate}</span>` : ''}
        </div>
        <div class="sprint-card-footer">
          <span class="sprint-card-count">${storyCount} ${storyCount === 1 ? 'story' : 'stories'}</span>
          <span class="sprint-card-status" aria-label="${this.getStatusLabel(statusClass)}">${this.getStatusLabel(statusClass)}</span>
        </div>
      </div>
    `
  }

  /**
   * Format sprint date for display, handling various input formats
   * @param {number|string|null} timestamp - Date value (timestamp, ISO string, or null)
   * @returns {string} Formatted date string
   */
  formatSprintDate(timestamp) {
    if (!timestamp) return ''

    // Handle numeric timestamps
    let date
    if (typeof timestamp === 'number') {
      date = new Date(timestamp)
    } else if (typeof timestamp === 'string') {
      // Try parsing as ISO string or other date format
      date = new Date(timestamp)
    } else {
      return ''
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return ''
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
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
   * Bind click events for sprint history cards
   */
  bindSprintTileEvents() {
    this.sprintTilesList.querySelectorAll('.sprint-history-card').forEach(tile => {
      // Click handler - show sprint stories in modal
      tile.addEventListener('click', async () => {
        const sprintId = tile.dataset.sprintId

        // Fetch archived sprint with resolved story data
        try {
          const result = await window.puffin.state.getArchivedSprint(sprintId)

          if (result.success && result.sprint) {
            const sprint = result.sprint
            // Show modal with sprint and its resolved stories
            this.intents.showModal('sprint-stories', {
              sprint,
              stories: sprint.stories || []
            })
          } else {
            console.warn('[USER-STORIES] Archived sprint not found:', sprintId, result.error)
          }
        } catch (error) {
          console.error('[USER-STORIES] Failed to load archived sprint:', error)
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
   * Get filtered stories (by sprint, status, branch, and search query)
   */
  getFilteredStories() {
    let filtered = this.stories

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
   * Render the stories list or kanban view
   */
  render() {
    // Set view mode data attribute for CSS-based visibility toggling
    this.container.dataset.viewMode = this.currentView

    // Render layout indicator and branch filter
    this.renderLayoutIndicator()
    this.renderBranchFilter()

    // Use kanban or list view based on current setting
    if (this.currentView === VIEW_MODES.KANBAN) {
      this.renderKanbanView()
    } else {
      this.renderListView()
    }
  }

  /**
   * Render a subtle indicator showing current layout mode
   * (Layout switches automatically based on window size)
   */
  renderLayoutIndicator() {
    let indicatorContainer = this.container.querySelector('.layout-indicator-container')
    if (!indicatorContainer) {
      const toolbar = this.container.querySelector('.user-stories-toolbar')
      if (toolbar) {
        indicatorContainer = document.createElement('div')
        indicatorContainer.className = 'layout-indicator-container'
        // Insert at the beginning of toolbar
        toolbar.insertBefore(indicatorContainer, toolbar.firstChild)
      } else {
        return
      }
    }

    const isKanban = this.currentView === VIEW_MODES.KANBAN
    indicatorContainer.innerHTML = `
      <span class="layout-indicator" title="Layout adjusts automatically based on window size">
        <span class="layout-icon">${isKanban ? '▦' : '☰'}</span>
        <span class="layout-label">${isKanban ? 'Kanban' : 'List'}</span>
      </span>
    `
  }

  /**
   * Render the kanban board view with three swimlanes
   */
  renderKanbanView() {
    // Get stories filtered by branch and search (but not status since kanban shows all statuses)
    let filtered = this.stories

    // Filter by branch
    if (this.currentBranch !== 'all') {
      filtered = filtered.filter(s => s.branchId === this.currentBranch)
    }

    // Filter by search query
    if (this.searchQuery.length >= SEARCH_MIN_CHARS) {
      const query = this.searchQuery.toLowerCase()
      filtered = filtered.filter(s =>
        s.title.toLowerCase().includes(query) ||
        (s.description && s.description.toLowerCase().includes(query))
      )
    }

    // Group stories by status (excluding archived from kanban)
    const pendingStories = filtered.filter(s => s.status === 'pending')
    const inProgressStories = filtered.filter(s => s.status === 'in-progress')
    const completedStories = filtered.filter(s => s.status === 'completed')
    const archivedStories = filtered.filter(s => s.status === 'archived')

    this.listContainer.innerHTML = `
      <div class="kanban-container">
        <div class="kanban-swimlane pending">
          <div class="kanban-swimlane-header">
            <h3>Pending <span class="story-count">${pendingStories.length}</span></h3>
          </div>
          <div class="kanban-swimlane-content">
            ${pendingStories.length > 0
              ? pendingStories.map(story => this.renderStoryCard(story)).join('')
              : '<p class="placeholder">No pending stories</p>'}
          </div>
        </div>
        <div class="kanban-swimlane in-progress">
          <div class="kanban-swimlane-header">
            <h3>In Progress <span class="story-count">${inProgressStories.length}</span></h3>
          </div>
          <div class="kanban-swimlane-content">
            ${inProgressStories.length > 0
              ? inProgressStories.map(story => this.renderStoryCard(story)).join('')
              : '<p class="placeholder">No stories in progress</p>'}
          </div>
        </div>
        <div class="kanban-swimlane completed">
          <div class="kanban-swimlane-header">
            <h3>Completed <span class="story-count">${completedStories.length}</span></h3>
          </div>
          <div class="kanban-swimlane-content">
            ${completedStories.length > 0
              ? completedStories.map(story => this.renderStoryCard(story)).join('')
              : '<p class="placeholder">No completed stories</p>'}
          </div>
        </div>
      </div>
      ${archivedStories.length > 0 ? `
        <div class="archived-stories-section">
          <button class="archived-stories-toggle" aria-expanded="false">
            <span class="toggle-icon">▶</span>
            Archived Stories (${archivedStories.length})
          </button>
          <div class="archived-stories-list collapsed">
            ${archivedStories.map(story => this.renderStoryCard(story)).join('')}
          </div>
        </div>
      ` : ''}
    `

    // Bind card events
    this.bindCardEvents()

    // Bind archived section toggle
    this.bindArchivedToggle()
  }

  /**
   * Render the traditional list view
   */
  renderListView() {
    const filtered = this.getFilteredStories()

    if (filtered.length === 0) {
      const branchText = this.currentBranch !== 'all' ? ` in "${this.currentBranch}" branch` : ''
      this.listContainer.innerHTML = `
        <p class="placeholder">
          ${this.currentFilter === 'all'
            ? `No user stories${branchText} yet. Use "Derive User Stories" checkbox when submitting a prompt, or click "+ Add Story".`
            : `No ${this.currentFilter} stories${branchText}.`}
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
   * Format branch name for display
   */
  formatBranchName(branchId) {
    const branch = this.branches[branchId]
    if (branch?.name) return branch.name
    // Capitalize first letter
    return branchId.charAt(0).toUpperCase() + branchId.slice(1)
  }

  /**
   * Check if drag-and-drop is supported
   */
  isDragDropSupported() {
    // Check for touch-only device or if drag and drop API is available
    const hasDragDrop = 'draggable' in document.createElement('div')
    const isTouchOnly = 'ontouchstart' in window && !window.matchMedia('(pointer: fine)').matches
    return hasDragDrop && !isTouchOnly
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
    const isKanban = this.currentView === VIEW_MODES.KANBAN
    const isDraggable = isKanban && !isArchived && this.isDragDropSupported()
    const showFallbackDropdown = isKanban && !isArchived && !this.isDragDropSupported()

    return `
      <div class="story-card ${statusClass}${isSelected ? ' selected' : ''}${isDraggable ? ' draggable' : ''}"
           data-story-id="${story.id}"
           data-story-status="${story.status}"
           ${isDraggable ? 'draggable="true"' : ''}>
        <div class="story-header">
          <div class="story-header-left">
            ${isDraggable ? `
              <span class="drag-handle" title="Drag to change status" aria-label="Drag handle">⋮⋮</span>
            ` : ''}
            ${canImplement ? `
              <label class="story-checkbox-label">
                <input type="checkbox" class="story-checkbox" ${isSelected ? 'checked' : ''}>
              </label>
            ` : ''}
            <span class="story-status ${statusClass}">${this.formatStatus(story.status)}</span>
            ${showFallbackDropdown ? this.renderStatusDropdown(story) : ''}
          </div>
          <div class="story-card-actions">
            <button class="story-action-btn expand-btn" title="View full details" aria-label="Expand story">⤢</button>
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
        ${this.renderInspectionAssertions(story)}
        <div class="story-footer">
          <span class="story-date">${this.formatDate(story.createdAt)}</span>
          ${story.branchId ? `<span class="story-branch">${this.formatBranchName(story.branchId)}</span>` : ''}
          ${story.sourcePromptId ? '<span class="story-source">Auto-extracted</span>' : ''}
        </div>
      </div>
    `
  }

  /**
   * Render a fallback status dropdown for touch devices or unsupported browsers
   */
  renderStatusDropdown(story) {
    const statuses = ['pending', 'in-progress', 'completed']
    return `
      <select class="status-dropdown" data-story-id="${story.id}" aria-label="Change story status">
        ${statuses.map(status => `
          <option value="${status}" ${story.status === status ? 'selected' : ''}>
            ${this.formatStatus(status)}
          </option>
        `).join('')}
      </select>
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

    // Expand button (opens full detail modal)
    this.listContainer.querySelectorAll('.expand-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const card = e.target.closest('.story-card')
        const storyId = card.dataset.storyId
        this.showStoryDetailModal(storyId)
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

    // Expand/collapse inspection assertions
    this.listContainer.querySelectorAll('.story-assertions').forEach(assertions => {
      assertions.addEventListener('click', (e) => {
        // Prevent toggling when clicking on buttons or interactive elements
        if (e.target.closest('.assertions-verify-btn') ||
            e.target.closest('.assertions-failures-btn') ||
            e.target.closest('.assertion-rerun-btn') ||
            e.target.closest('.assertion-target')) return
        const list = assertions.querySelector('.assertions-list')
        list.classList.toggle('collapsed')
      })
    })

    // Verify assertions button
    this.listContainer.querySelectorAll('.assertions-verify-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const storyId = btn.dataset.storyId
        this.evaluateStoryAssertions(storyId)
      })
    })

    // View assertion failures button
    this.listContainer.querySelectorAll('.assertions-failures-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const storyId = btn.dataset.storyId
        this.showAssertionFailures(storyId)
      })
    })

    // Re-run individual assertion button
    this.listContainer.querySelectorAll('.assertion-rerun-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const storyId = btn.dataset.storyId
        const assertionId = btn.dataset.assertionId
        this.evaluateSingleAssertion(storyId, assertionId)
      })
    })

    // Status dropdown change (fallback for touch devices)
    this.listContainer.querySelectorAll('.status-dropdown').forEach(dropdown => {
      dropdown.addEventListener('change', (e) => {
        e.stopPropagation()
        const storyId = dropdown.dataset.storyId
        const newStatus = dropdown.value
        this.intents.updateUserStory(storyId, { status: newStatus })
      })
    })

    // Drag and drop events (only in kanban view)
    if (this.currentView === VIEW_MODES.KANBAN) {
      this.bindDragDropEvents()
    }
  }

  /**
   * Bind drag and drop events for kanban view
   */
  bindDragDropEvents() {
    // Bind drag events to draggable cards
    this.listContainer.querySelectorAll('.story-card.draggable').forEach(card => {
      card.addEventListener('dragstart', (e) => this.handleDragStart(e))
      card.addEventListener('dragend', (e) => this.handleDragEnd(e))
    })

    // Bind drop events to swimlane content areas
    this.listContainer.querySelectorAll('.kanban-swimlane-content').forEach(swimlane => {
      swimlane.addEventListener('dragover', (e) => this.handleDragOver(e))
      swimlane.addEventListener('dragenter', (e) => this.handleDragEnter(e))
      swimlane.addEventListener('dragleave', (e) => this.handleDragLeave(e))
      swimlane.addEventListener('drop', (e) => this.handleDrop(e))
    })
  }

  /**
   * Handle drag start event
   */
  handleDragStart(e) {
    const card = e.target.closest('.story-card')
    if (!card) return

    // Store the story ID being dragged
    this.draggedStoryId = card.dataset.storyId
    this.draggedStoryStatus = card.dataset.storyStatus

    // Set drag data
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', card.dataset.storyId)

    // Add dragging class for visual feedback
    card.classList.add('dragging')

    // Highlight valid drop targets
    requestAnimationFrame(() => {
      this.listContainer.querySelectorAll('.kanban-swimlane').forEach(swimlane => {
        const swimlaneStatus = this.getSwimlaneStatus(swimlane)
        if (swimlaneStatus !== this.draggedStoryStatus) {
          swimlane.classList.add('drop-target')
        }
      })
    })
  }

  /**
   * Handle drag end event
   */
  handleDragEnd(e) {
    const card = e.target.closest('.story-card')
    if (card) {
      card.classList.remove('dragging')
    }

    // Remove all drag-related classes
    this.listContainer.querySelectorAll('.kanban-swimlane').forEach(swimlane => {
      swimlane.classList.remove('drop-target', 'drag-over')
    })

    // Clear drag state
    this.draggedStoryId = null
    this.draggedStoryStatus = null
  }

  /**
   * Handle drag over event (allows drop)
   */
  handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  /**
   * Handle drag enter event
   */
  handleDragEnter(e) {
    e.preventDefault()
    const swimlane = e.target.closest('.kanban-swimlane')
    if (swimlane && !swimlane.classList.contains('drag-over')) {
      const swimlaneStatus = this.getSwimlaneStatus(swimlane)
      if (swimlaneStatus !== this.draggedStoryStatus) {
        swimlane.classList.add('drag-over')
      }
    }
  }

  /**
   * Handle drag leave event
   */
  handleDragLeave(e) {
    const swimlane = e.target.closest('.kanban-swimlane')
    if (swimlane) {
      // Only remove if we're actually leaving the swimlane (not entering a child)
      const relatedTarget = e.relatedTarget
      if (!relatedTarget || !swimlane.contains(relatedTarget)) {
        swimlane.classList.remove('drag-over')
      }
    }
  }

  /**
   * Handle drop event
   */
  handleDrop(e) {
    e.preventDefault()

    const swimlane = e.target.closest('.kanban-swimlane')
    if (!swimlane) return

    const newStatus = this.getSwimlaneStatus(swimlane)
    const storyId = e.dataTransfer.getData('text/plain') || this.draggedStoryId

    if (!storyId || !newStatus) return

    // Only update if status actually changed
    if (newStatus !== this.draggedStoryStatus) {
      // Update the story status (persists immediately via intents)
      this.intents.updateUserStory(storyId, { status: newStatus })
    }

    // Clean up drag state
    swimlane.classList.remove('drag-over')
  }

  /**
   * Get the status associated with a swimlane element
   */
  getSwimlaneStatus(swimlane) {
    if (swimlane.classList.contains('pending')) return 'pending'
    if (swimlane.classList.contains('in-progress')) return 'in-progress'
    if (swimlane.classList.contains('completed')) return 'completed'
    return null
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

    // Determine if Create Sprint button should be disabled
    const sprintBtnDisabled = this.hasActiveSprint
    const sprintBtnTitle = sprintBtnDisabled
      ? `Cannot create: "${this.activeSprintTitle || 'Active sprint'}" is in progress. Close it first.`
      : 'Create a new sprint from selected stories'

    actionBar.innerHTML = `
      <span class="selection-count">${this.selectedStoryIds.size} ${this.selectedStoryIds.size === 1 ? 'story' : 'stories'} selected</span>
      <div class="action-buttons">
        <button class="btn secondary clear-selection-btn">Clear Selection</button>
        <button class="btn primary create-sprint-btn" ${sprintBtnDisabled ? 'disabled' : ''} title="${sprintBtnTitle}">Create Sprint</button>
      </div>
      ${sprintBtnDisabled ? `<span class="sprint-warning">Close active sprint to create a new one</span>` : ''}
    `

    // Bind action bar events
    actionBar.querySelector('.clear-selection-btn').addEventListener('click', () => {
      this.clearSelection()
    })

    const createSprintBtn = actionBar.querySelector('.create-sprint-btn')
    createSprintBtn.addEventListener('click', () => {
      if (!sprintBtnDisabled) {
        this.createSprint()
      }
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
  async createSprint() {
    const selectedStories = this.stories.filter(s => this.selectedStoryIds.has(s.id))

    if (selectedStories.length === 0) {
      return
    }

    // Double-check for active sprint (in case UI state is stale)
    if (this.hasActiveSprint) {
      this.showSprintExistsError()
      return
    }

    // Verify with backend before attempting to create
    try {
      const result = await window.puffin.state.hasActiveSprint()
      if (result.success && result.hasActive) {
        const title = result.activeSprint?.title || 'Active sprint'
        this.showSprintExistsError(title)
        return
      }
    } catch (error) {
      console.error('[USER-STORIES] Failed to check active sprint:', error)
      // Continue anyway - the backend will reject if there's a conflict
    }

    // Call intent to create sprint - this will switch to prompt view with sprint header
    this.intents.createSprint(selectedStories)

    // Clear selection after creating sprint
    this.selectedStoryIds.clear()
    this.updateActionBar()
  }

  /**
   * Show error when trying to create sprint while one exists
   * @param {string} [title] - Title of the existing sprint
   */
  showSprintExistsError(title = this.activeSprintTitle) {
    const sprintName = title || 'an active sprint'
    this.intents.showModal('alert', {
      title: 'Sprint Already Active',
      message: `Cannot create a new sprint because "${sprintName}" is already in progress.\n\nClose the current sprint before starting a new one.`,
      confirmLabel: 'OK'
    })
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
   * Show story detail modal with full information and editing capability
   */
  showStoryDetailModal(storyId) {
    const story = this.stories.find(s => s.id === storyId)
    if (!story) return

    this.intents.showModal('story-detail', {
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
   * Evaluate all assertions for a story
   * @param {string} storyId - The story ID to evaluate
   */
  async evaluateStoryAssertions(storyId) {
    if (this.evaluatingStories.has(storyId)) {
      console.warn('[UserStories] Already evaluating story:', storyId)
      return
    }

    if (!window.puffin?.state?.evaluateStoryAssertions) {
      console.error('[UserStories] Assertion evaluation API not available')
      return
    }

    // Mark as evaluating and update UI immediately
    this.evaluatingStories.add(storyId)
    const story = this.stories.find(s => s.id === storyId)
    if (story) {
      this.evaluationProgress.set(storyId, {
        current: 0,
        total: story.inspectionAssertions?.length || 0
      })
    }

    // Update the card to show evaluating state
    this.updateAssertionProgressUI(storyId)

    // Hide the verify button during evaluation
    const verifyBtn = this.listContainer?.querySelector(
      `.assertions-verify-btn[data-story-id="${storyId}"]`
    )
    if (verifyBtn) {
      verifyBtn.style.display = 'none'
    }

    try {
      const result = await window.puffin.state.evaluateStoryAssertions(storyId)
      if (!result.success) {
        console.error('[UserStories] Evaluation failed:', result.error)
        // Show error state
        this.showEvaluationError(storyId, result.error)
      }
      // Note: The completion event from IPC will handle refreshing the UI
    } catch (error) {
      console.error('[UserStories] Evaluation error:', error)
      this.showEvaluationError(storyId, error.message)
    }
  }

  /**
   * Evaluate a single assertion
   * @param {string} storyId - The story ID
   * @param {string} assertionId - The assertion ID to re-run
   */
  async evaluateSingleAssertion(storyId, assertionId) {
    if (!window.puffin?.state?.evaluateSingleAssertion) {
      console.error('[UserStories] Single assertion evaluation API not available')
      return
    }

    // Find and update the specific assertion item to show evaluating state
    const assertionItem = this.listContainer?.querySelector(
      `.assertion-item[data-assertion-id="${assertionId}"]`
    )
    if (assertionItem) {
      assertionItem.classList.add('evaluating')
      const rerunBtn = assertionItem.querySelector('.assertion-rerun-btn')
      if (rerunBtn) {
        rerunBtn.disabled = true
        rerunBtn.innerHTML = '<span class="eval-spinner-small"></span>'
      }
    }

    try {
      const result = await window.puffin.state.evaluateSingleAssertion(storyId, assertionId)
      if (result.success) {
        // Refresh the story card to show updated results
        await this.refreshStoryCard(storyId)
      } else {
        console.error('[UserStories] Single assertion evaluation failed:', result.error)
        // Reset the assertion item
        if (assertionItem) {
          assertionItem.classList.remove('evaluating')
          const rerunBtn = assertionItem.querySelector('.assertion-rerun-btn')
          if (rerunBtn) {
            rerunBtn.disabled = false
            rerunBtn.innerHTML = '↻'
          }
        }
      }
    } catch (error) {
      console.error('[UserStories] Single assertion error:', error)
      if (assertionItem) {
        assertionItem.classList.remove('evaluating')
      }
    }
  }

  /**
   * Show assertion failures modal for a story
   * @param {string} storyId - The story ID
   */
  showAssertionFailures(storyId) {
    const story = this.stories.find(s => s.id === storyId)
    if (!story || !story.assertionResults) {
      console.warn('[UserStories] No story or results found for:', storyId)
      return
    }

    this.intents.showModal('assertion-failures', {
      story,
      results: story.assertionResults,
      onWaive: (storyId, assertionId, reason) => this.waiveAssertion(storyId, assertionId, reason),
      onDefer: (storyId, assertionId) => this.deferAssertion(storyId, assertionId),
      onRerun: (storyId, assertionId) => {
        if (assertionId) {
          return this.evaluateSingleAssertion(storyId, assertionId)
        } else {
          return this.evaluateStoryAssertions(storyId)
        }
      },
      onClose: () => {
        // Refresh the story card when modal closes
        this.render(this.stories)
      }
    })
  }

  /**
   * Waive an assertion failure
   * @param {string} storyId - The story ID
   * @param {string} assertionId - The assertion ID
   * @param {string} reason - The reason for waiving
   */
  async waiveAssertion(storyId, assertionId, reason) {
    if (!window.api?.waiveAssertion) {
      // Store locally if API not available
      const story = this.stories.find(s => s.id === storyId)
      if (story) {
        if (!story.waivedAssertions) story.waivedAssertions = []
        story.waivedAssertions.push({
          assertionId,
          reason,
          waivedAt: new Date().toISOString()
        })
        // Update story through intents
        this.intents.updateUserStory(storyId, { waivedAssertions: story.waivedAssertions })
      }
      return
    }

    try {
      await window.api.waiveAssertion(storyId, assertionId, reason)
    } catch (error) {
      console.error('[UserStories] Failed to waive assertion:', error)
    }
  }

  /**
   * Defer an assertion to fix later
   * @param {string} storyId - The story ID
   * @param {string} assertionId - The assertion ID
   */
  async deferAssertion(storyId, assertionId) {
    if (!window.api?.deferAssertion) {
      // Store locally if API not available
      const story = this.stories.find(s => s.id === storyId)
      if (story) {
        if (!story.deferredAssertions) story.deferredAssertions = []
        story.deferredAssertions.push({
          assertionId,
          deferredAt: new Date().toISOString()
        })
        // Update story through intents
        this.intents.updateUserStory(storyId, { deferredAssertions: story.deferredAssertions })
      }
      return
    }

    try {
      await window.api.deferAssertion(storyId, assertionId)
    } catch (error) {
      console.error('[UserStories] Failed to defer assertion:', error)
    }
  }

  /**
   * Show evaluation error state on a story's assertions section
   * @param {string} storyId - The story ID
   * @param {string} errorMessage - The error message
   */
  showEvaluationError(storyId, errorMessage) {
    this.evaluatingStories.delete(storyId)
    this.evaluationProgress.delete(storyId)

    const assertionsSection = this.listContainer?.querySelector(
      `.story-assertions[data-story-id="${storyId}"]`
    )
    if (!assertionsSection) return

    const summaryEl = assertionsSection.querySelector('.assertions-summary')
    if (summaryEl) {
      summaryEl.className = 'assertions-summary assertions-error'
      summaryEl.innerHTML = `<span class="assertion-icon error">!</span> Error: ${errorMessage}`
    }

    // Re-show the verify button
    const verifyBtn = assertionsSection.querySelector('.assertions-verify-btn')
    if (verifyBtn) {
      verifyBtn.style.display = ''
    }
  }

  /**
   * Render inspection assertions section for a story card
   * @param {Object} story - The user story object
   * @returns {string} HTML for the assertions section
   */
  renderInspectionAssertions(story) {
    const assertions = story.inspectionAssertions || []
    if (assertions.length === 0) return ''

    const results = story.assertionResults
    const hasResults = results && results.results && results.results.length > 0
    const COLLAPSE_THRESHOLD = 3
    const isEvaluating = this.evaluatingStories?.has(story.id)

    // Build summary info
    let summaryHtml = ''
    let statusClass = 'assertions-pending'
    let hasFailures = false

    if (isEvaluating) {
      const progress = this.evaluationProgress?.get(story.id) || { current: 0, total: assertions.length }
      summaryHtml = `<span class="assertions-summary assertions-evaluating">
        <span class="eval-spinner"></span>
        Evaluating ${progress.current}/${progress.total}...
      </span>`
    } else if (hasResults) {
      const { passed, failed, total } = results.summary
      const allPassed = failed === 0 && passed === total
      hasFailures = failed > 0
      statusClass = allPassed ? 'assertions-passed' : 'assertions-failed'
      summaryHtml = `<span class="assertions-summary ${statusClass}">${passed}/${total} passed</span>`
    } else {
      summaryHtml = `<span class="assertions-summary assertions-pending">Not verified</span>`
    }

    // Determine if list should be collapsed by default
    const shouldCollapse = assertions.length > COLLAPSE_THRESHOLD

    // Show verify button when not currently evaluating
    const verifyButton = !isEvaluating ? `
      <button class="assertions-verify-btn"
              data-story-id="${story.id}"
              title="${hasResults ? 'Re-verify assertions' : 'Verify assertions'}"
              aria-label="${hasResults ? 'Re-verify assertions' : 'Verify assertions'}">
        ${hasResults ? '↻' : '▶'}
      </button>
    ` : ''

    // Show "View Failures" button when there are failures
    const viewFailuresButton = hasFailures ? `
      <button class="assertions-failures-btn"
              data-story-id="${story.id}"
              title="View failure details"
              aria-label="View failure details">
        View ${results.summary.failed} failure${results.summary.failed !== 1 ? 's' : ''}
      </button>
    ` : ''

    return `
      <div class="story-assertions ${statusClass}${hasFailures ? ' has-failures' : ''}" data-story-id="${story.id}">
        <div class="assertions-header">
          <span class="assertions-count">${assertions.length} inspection assertion${assertions.length !== 1 ? 's' : ''}</span>
          ${summaryHtml}
          ${viewFailuresButton}
          ${verifyButton}
        </div>
        <ul class="assertions-list ${shouldCollapse ? 'collapsed' : ''}">
          ${assertions.map(a => this.renderAssertionItem(a, results, story.id)).join('')}
        </ul>
      </div>
    `
  }

  /**
   * Render a single assertion item
   * @param {Object} assertion - The assertion object
   * @param {Object|null} results - Assertion results if available
   * @param {string} storyId - The parent story ID
   * @returns {string} HTML for the assertion item
   */
  renderAssertionItem(assertion, results, storyId) {
    // Find the result for this assertion if available
    let resultStatus = null
    let resultDetails = null
    if (results && results.results) {
      const result = results.results.find(r => r.assertionId === assertion.id)
      if (result) {
        resultStatus = result.status
        resultDetails = result.details
      }
    }

    // Format the type for display (e.g., FILE_EXISTS -> File Exists)
    const typeDisplay = assertion.type
      .split('_')
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ')

    // Determine status class and icon
    let statusClass = 'assertion-pending'
    let statusIcon = '<span class="assertion-icon pending">○</span>'
    let rerunButton = ''

    if (resultStatus === 'passed') {
      statusClass = 'assertion-passed'
      statusIcon = '<span class="assertion-icon passed">✓</span>'
    } else if (resultStatus === 'failed') {
      statusClass = 'assertion-failed'
      statusIcon = '<span class="assertion-icon failed">✗</span>'
      // Add re-run button for failed assertions
      rerunButton = `
        <button class="assertion-rerun-btn"
                data-story-id="${storyId}"
                data-assertion-id="${assertion.id}"
                title="Re-run this assertion"
                aria-label="Re-run assertion">↻</button>
      `
    } else if (resultStatus === 'error') {
      statusClass = 'assertion-error'
      statusIcon = '<span class="assertion-icon error">!</span>'
      rerunButton = `
        <button class="assertion-rerun-btn"
                data-story-id="${storyId}"
                data-assertion-id="${assertion.id}"
                title="Re-run this assertion"
                aria-label="Re-run assertion">↻</button>
      `
    }

    // Build failure details tooltip if available
    let detailsAttr = ''
    if (resultDetails && resultStatus === 'failed') {
      const expected = resultDetails.expected || ''
      const actual = resultDetails.actual || ''
      const suggestion = resultDetails.suggestion || ''
      const detailsText = [
        expected ? `Expected: ${expected}` : '',
        actual ? `Actual: ${actual}` : '',
        suggestion ? `Fix: ${suggestion}` : ''
      ].filter(Boolean).join(' | ')
      if (detailsText) {
        detailsAttr = `data-failure-details="${this.escapeHtml(detailsText)}"`
      }
    }

    return `
      <li class="assertion-item ${statusClass}" data-assertion-id="${assertion.id}" ${detailsAttr}>
        ${statusIcon}
        <span class="assertion-type">${typeDisplay}</span>
        <span class="assertion-message">${this.escapeHtml(assertion.message)}</span>
        <span class="assertion-target" title="${this.escapeHtml(assertion.target)}">${this.escapeHtml(this.truncatePath(assertion.target))}</span>
        ${rerunButton}
      </li>
    `
  }

  /**
   * Truncate a path for display, keeping the filename
   * @param {string} path - The file path
   * @returns {string} Truncated path
   */
  truncatePath(path) {
    if (!path || path.length <= 30) return path
    const parts = path.split(/[/\\]/)
    if (parts.length <= 2) return path
    return `.../${parts.slice(-2).join('/')}`
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
    // Handle various formats: number, numeric string (possibly with .0), or ISO string
    let date
    if (typeof timestamp === 'string' && /^\d+(\.\d+)?$/.test(timestamp)) {
      // Numeric string like "1767506718283.0" - parse as number
      date = new Date(parseFloat(timestamp))
    } else if (typeof timestamp === 'number') {
      date = new Date(timestamp)
    } else {
      // ISO string or other format
      date = new Date(timestamp)
    }
    if (isNaN(date.getTime())) return ''
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
    // Clean up ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    // Clear any pending timers
    clearTimeout(this.searchDebounceTimer)
    clearTimeout(this.resizeDebounceTimer)

    // Clean up assertion evaluation IPC listeners
    this.evaluationCleanups.forEach(cleanup => {
      if (typeof cleanup === 'function') {
        cleanup()
      }
    })
    this.evaluationCleanups = []
    this.evaluatingStories.clear()
    this.evaluationProgress.clear()
  }
}
