/**
 * User Stories Component (Kanban Task Board)
 *
 * Lean Kanban task board for documentation tasks.
 * Three columns: To Do (pending), Doing (in-progress), Done (completed).
 * Supports drag-and-drop, a responsive list view, card rendering,
 * status changes, and basic story CRUD (add/edit/delete/archive/restore).
 */

// Search configuration
const SEARCH_MIN_CHARS = 3
const SEARCH_DEBOUNCE_MS = 150
const RESIZE_DEBOUNCE_MS = 150

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
    // Drag and drop state
    this.draggedStoryId = null
    this.draggedStoryStatus = null
    // View transition state
    this.isTransitioning = false
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
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

    this.bindEvents()
    this.subscribeToState()
    this.setupResizeObserver()

    // Set initial view based on current container width
    this.updateViewForWidth()
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
      this.plans = state.plans || []
      this.taskRun = state.taskRun || null
      this.planRun = state.planRun || null

      // Debug logging for story count changes
      if (this.stories.length !== previousCount) {
        console.log('[USER-STORIES-COMPONENT] Story count changed:', previousCount, '->', this.stories.length, 'action:', actionType)
        if (this.stories.length === 0 && previousCount > 0) {
          console.error('[USER-STORIES-COMPONENT] WARNING: All stories disappeared! Action:', actionType)
          console.error('[USER-STORIES-COMPONENT] state.userStories:', state.userStories)
        }
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
   * Get filtered stories (by status, branch, and search query)
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
            <h3>To Do <span class="story-count">${pendingStories.length}</span></h3>
          </div>
          <div class="kanban-swimlane-content">
            ${pendingStories.length > 0
              ? this.renderGroupedCards(pendingStories)
              : '<p class="placeholder">Nothing to do</p>'}
          </div>
        </div>
        <div class="kanban-swimlane in-progress">
          <div class="kanban-swimlane-header">
            <h3>Doing <span class="story-count">${inProgressStories.length}</span></h3>
          </div>
          <div class="kanban-swimlane-content">
            ${inProgressStories.length > 0
              ? this.renderGroupedCards(inProgressStories)
              : '<p class="placeholder">Nothing in progress</p>'}
          </div>
        </div>
        <div class="kanban-swimlane completed">
          <div class="kanban-swimlane-header">
            <h3>Done <span class="story-count">${completedStories.length}</span></h3>
          </div>
          <div class="kanban-swimlane-content">
            ${completedStories.length > 0
              ? this.renderGroupedCards(completedStories)
              : '<p class="placeholder">Nothing done yet</p>'}
          </div>
        </div>
      </div>
      ${archivedStories.length > 0 ? `
        <div class="archived-stories-section">
          <button class="archived-stories-toggle" aria-expanded="false">
            <span class="toggle-icon">▶</span>
            Archived Tasks (${archivedStories.length})
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
      const branchText = this.currentBranch !== 'all' ? ` in "${this.currentBranch}" workspace` : ''
      this.listContainer.innerHTML = `
        <p class="placeholder">
          ${this.currentFilter === 'all'
            ? `No tasks${branchText} yet. Click "+ Add Task" to create one.`
            : `No ${this.currentFilter} tasks${branchText}.`}
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
      html += this.renderGroupedCards(activeStories)
    } else if (archivedStories.length > 0) {
      html += '<p class="placeholder">No active tasks. All tasks are archived.</p>'
    }

    // Render archived stories in collapsible section
    if (archivedStories.length > 0) {
      html += `
        <div class="archived-stories-section">
          <button class="archived-stories-toggle" aria-expanded="false">
            <span class="toggle-icon">▶</span>
            Archived Tasks (${archivedStories.length})
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
      <label class="branch-filter-label">Workspace:</label>
      <select class="branch-filter-select" id="story-branch-filter">
        <option value="all" ${this.currentBranch === 'all' ? 'selected' : ''}>All Workspaces</option>
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
  /**
   * Cards grouped by plan (plan groups first, in plan order; then ungrouped cards).
   * @param {Object[]} stories - Stories of one column
   * @returns {string}
   */
  renderGroupedCards(stories) {
    const byPlan = new Map()
    const loose = []
    for (const story of stories) {
      if (story.planId) {
        if (!byPlan.has(story.planId)) byPlan.set(story.planId, [])
        byPlan.get(story.planId).push(story)
      } else {
        loose.push(story)
      }
    }
    const groups = [...byPlan.entries()].map(([planId, cards]) => {
      const plan = (this.plans || []).find(p => p.id === planId)
      cards.sort((a, b) => (a.planStep || 0) - (b.planStep || 0))
      return this.renderPlanGroup(planId, plan, cards)
    })
    return groups.join('') + loose.map(story => this.renderStoryCard(story)).join('')
  }

  /**
   * A collapsible plan group inside a column.
   */
  renderPlanGroup(planId, plan, cards) {
    const title = plan?.title || 'Plan'
    // Counts come from the live board, not the plan record (which is loaded once)
    const all = (this.stories || []).filter(s => s.planId === planId)
    const total = all.length || cards.length
    const done = all.filter(s => s.status === 'completed').length
    const isRunning = this.planRun && this.planRun.planId === planId && !this.planRun.stopped
    const stoppedReason = this.planRun && this.planRun.planId === planId && this.planRun.stopped ? this.planRun.reason : null
    const hasPending = (this.stories || []).some(s => s.planId === planId && s.status !== 'completed')
    return `
      <details class="plan-group" open data-plan-id="${this.escapeHtml(planId)}">
        <summary class="plan-group-header">
          <span class="plan-group-title" title="${this.escapeHtml(title)}">📋 ${this.escapeHtml(title)}</span>
          <span class="plan-group-progress">${done}/${total} done</span>
          <span class="plan-group-actions">
            ${hasPending && !isRunning ? `<button class="plan-group-btn" data-plan-action="implement-next" title="Implement the next unblocked task" data-help="Implement the next task of this plan that is not blocked.">▶ Next</button>` : ''}
            ${hasPending && !isRunning ? `<button class="plan-group-btn" data-plan-action="${stoppedReason ? 'continue-plan' : 'run-plan'}" title="Run every remaining task in order" data-help="Run every remaining task of this plan in order, one session at a time; stops at the first task that does not reach Done.">${stoppedReason ? '⏵ Continue' : '⏵⏵ Run plan'}</button>` : ''}
            ${isRunning ? `<button class="plan-group-btn" data-plan-action="stop-plan" title="Stop after the current task" data-help="Let the current task finish, then stop the plan run.">■ Stop</button>` : ''}
            <button class="plan-group-btn" data-plan-action="replan" title="Revise the plan with Claude" data-help="Open the Prompt tab in Plan mode with this plan and the board state prefilled; the approved plan replaces the open tasks.">↻ Re-plan</button>
            ${plan?.filePath ? `<button class="plan-group-btn" data-plan-action="open-plan" title="Open the plan file" data-help="Open the plan markdown in the Editor tab.">📄</button>` : ''}
          </span>
        </summary>
        ${stoppedReason ? `<div class="plan-group-note">Stopped: ${this.escapeHtml(stoppedReason)}</div>` : ''}
        ${cards.map(story => this.renderStoryCard(story)).join('')}
      </details>`
  }

  /**
   * Badges and actions that describe a task's place in its plan and its run state.
   */
  renderTaskBadges(story) {
    const badges = []
    if (story.planStep) {
      const plan = (this.plans || []).find(p => p.id === story.planId)
      const total = (this.stories || []).filter(s => s.planId === story.planId).length || plan?.total
      badges.push(`<span class="task-badge task-badge-step" title="Step ${story.planStep} of the plan">${story.planStep}${total ? `/${total}` : ''}</span>`)
    }
    const blockers = (story.dependsOn || []).map(id => (this.stories || []).find(s => s.id === id)).filter(Boolean)
    if (blockers.length) {
      const unmet = blockers.filter(b => b.status !== 'completed')
      badges.push(`<span class="task-badge task-badge-dep ${unmet.length ? 'blocked' : ''}" title="${this.escapeHtml(unmet.length ? `Waiting on: ${unmet.map(b => b.title).join(', ')}` : 'Dependencies done')}">after ${blockers.map(b => b.planStep || '?').join(', ')}</span>`)
    }
    if (story.skill) badges.push(`<span class="task-badge task-badge-skill" title="${this.escapeHtml(story.skill)}">skill</span>`)
    const run = story.runState || 'idle'
    const runLabels = { running: '● running', reviewing: '● reviewing', fixing: '● fixing', 'needs-fix': '⚠ needs fix', 'needs-human': '⚠ needs a human', failed: '✕ failed', cancelled: '✕ cancelled', reviewed: '✓ reviewed' }
    if (runLabels[run]) {
      const detail = story.runMeta?.lastError || story.runMeta?.reviewExcerpt || ''
      badges.push(`<span class="task-badge task-badge-run run-${run}" title="${this.escapeHtml(detail.slice(0, 300))}">${runLabels[run]}</span>`)
    }
    return badges.length ? `<div class="task-badges">${badges.join('')}</div>` : ''
  }

  /**
   * Plan → Board → Implement actions for a card, by state.
   */
  renderTaskActions(story) {
    const run = story.runState || 'idle'
    const busy = !!this.taskRun
    const isThis = this.taskRun?.storyId === story.id
    const unmet = (story.dependsOn || []).map(id => (this.stories || []).find(s => s.id === id)).filter(b => b && b.status !== 'completed')
    const btn = (action, label, help, disabled = false, title = '') =>
      `<button class="task-action-btn" data-task-action="${action}" ${disabled ? 'disabled' : ''} title="${this.escapeHtml(title || help)}" data-help="${this.escapeHtml(help)}">${label}</button>`
    const out = []
    if (story.status === 'pending' && ['idle', 'failed', 'cancelled'].includes(run)) {
      const why = busy ? 'A task is already running' : unmet.length ? `Waiting on: ${unmet.map(b => b.title).join(', ')}` : ''
      out.push(btn('implement', '▶ Implement', 'Start a new conversation that implements this task; the card moves to Doing and is reviewed when the session ends.', !!why, why))
    }
    if (story.status === 'in-progress') {
      if (isThis) out.push(btn('open-thread', '💬 Open conversation', 'Show the conversation implementing this task.'))
      else if (run === 'needs-fix') {
        out.push(btn('fix', '🔧 Fix', 'Ask Claude to fix the issues the review found, in the same conversation.', busy))
        out.push(btn('done-anyway', '✓ Done anyway', 'Accept the task despite the review issues.'))
        out.push(btn('open-thread', '💬', 'Show the conversation implementing this task.'))
      } else if (run === 'needs-human') {
        out.push(btn('done-anyway', '✓ Done anyway', 'Accept the task; two fix rounds did not satisfy the review.'))
        out.push(btn('open-thread', '💬', 'Show the conversation implementing this task.'))
      } else if (run === 'failed' || run === 'cancelled') {
        out.push(btn('retry', '↻ Retry', 'Run the task again with the previous error included in the prompt.', busy))
        if (story.threadId) out.push(btn('open-thread', '💬', 'Show the conversation implementing this task.'))
      } else if (story.threadId) {
        out.push(btn('open-thread', '💬', 'Show the conversation implementing this task.'))
      }
    }
    if (story.status === 'completed' && story.threadId) {
      out.push(btn('open-thread', '💬', 'Show the conversation that implemented this task.'))
    }
    return out.length ? `<div class="task-actions">${out.join('')}</div>` : ''
  }

  renderStoryCard(story) {
    const statusClass = story.status.replace('-', '')
    const canImplement = story.status === 'pending'
    const canComplete = story.status === 'in-progress' // Only in-progress stories can be completed
    const canReopen = story.status === 'completed' || story.status === 'archived' // Completed/archived stories can be reopened
    const canArchive = story.status !== 'archived' // Any non-archived story can be archived
    const isArchived = story.status === 'archived'
    const isKanban = this.currentView === VIEW_MODES.KANBAN
    const isRunningNow = this.taskRun?.storyId === story.id
    const isDraggable = isKanban && !isArchived && !isRunningNow && this.isDragDropSupported()
    const showFallbackDropdown = isKanban && !isArchived && !this.isDragDropSupported()

    return `
      <div class="story-card ${statusClass}${isDraggable ? ' draggable' : ''}"
           data-story-id="${story.id}"
           data-story-status="${story.status}"
           ${isDraggable ? 'draggable="true"' : ''}>
        <div class="story-header">
          <div class="story-header-left">
            ${isDraggable ? `
              <span class="drag-handle" title="Drag to change status" aria-label="Drag handle">⋮⋮</span>
            ` : ''}
            <span class="story-status ${statusClass}">${this.formatStatus(story.status)}</span>
            ${showFallbackDropdown ? this.renderStatusDropdown(story) : ''}
          </div>
          <div class="story-card-actions">
            <button class="story-action-btn expand-btn" title="View full details" aria-label="Expand task">⤢</button>
            ${canComplete ? `<button class="story-action-btn complete-btn" title="Mark as completed">✓</button>` : ''}
            ${canArchive ? `<button class="story-action-btn archive-btn" title="Archive task">⌫</button>` : ''}
            ${canReopen ? `<button class="story-action-btn reopen-btn" title="Reopen task">↺</button>` : ''}
            ${!isArchived ? `<button class="story-action-btn edit-btn" title="Edit task">✎</button>` : ''}
            <button class="story-action-btn delete-btn" title="Delete task">×</button>
          </div>
        </div>
        <h4 class="story-title">${this.escapeHtml(story.title)}</h4>
        ${this.renderTaskBadges(story)}
        ${story.description ? `<p class="story-description">${this.escapeHtml(story.description)}</p>` : ''}
        ${this.renderTaskActions(story)}
        <div class="story-footer">
          <span class="story-date">${this.formatDate(story.createdAt)}</span>
          ${story.branchId ? `<span class="story-branch">${this.formatBranchName(story.branchId)}</span>` : ''}
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
      <select class="status-dropdown" data-story-id="${story.id}" aria-label="Change task status">
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
    // Plan → Board → Implement: card actions
    this.listContainer.querySelectorAll('.task-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const card = e.target.closest('.story-card')
        if (!card || btn.disabled) return
        this.intents.requestTaskRun(card.dataset.storyId, { action: btn.dataset.taskAction })
      })
    })

    // Plan group actions
    this.listContainer.querySelectorAll('.plan-group-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const group = e.target.closest('.plan-group')
        const planId = group?.dataset.planId
        if (!planId) return
        const action = btn.dataset.planAction
        if (action === 'implement-next') {
          const next = (this.stories || [])
            .filter(s => s.planId === planId && s.status === 'pending')
            .sort((a, b) => (a.planStep || 0) - (b.planStep || 0))
            .find(s => !(s.dependsOn || []).some(id => (this.stories || []).find(d => d.id === id)?.status !== 'completed'))
          if (next) this.intents.requestTaskRun(next.id, { action: 'implement' })
          else window.puffinApp?.showToast?.({ type: 'info', title: 'Plan', message: 'No unblocked task to implement.' })
        } else if (action === 'open-plan') {
          const plan = (this.plans || []).find(p => p.id === planId)
          if (plan?.filePath) window.puffinApp?.openPathInEditor?.(plan.filePath)
        } else {
          this.intents.requestTaskRun(planId, { action })
        }
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

    // Archive button (mark story as archived)
    this.listContainer.querySelectorAll('.archive-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.story-card')
        const storyId = card.dataset.storyId
        this.archiveStory(storyId)
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
   * Archive a story (moves to archived status)
   */
  archiveStory(storyId) {
    this.intents.updateUserStory(storyId, { status: 'archived' })
  }

  /**
   * Delete a story
   */
  deleteStory(storyId) {
    if (confirm('Are you sure you want to delete this task?')) {
      this.intents.deleteUserStory(storyId)
    }
  }

  /**
   * Format status for display
   */
  formatStatus(status) {
    const statusMap = {
      'pending': 'To Do',
      'in-progress': 'Doing',
      'completed': 'Done',
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
  }
}
