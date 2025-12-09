/**
 * User Stories Component
 *
 * Manages user stories extracted from specification prompts.
 * Stories can be manually added or auto-extracted from specifications branch.
 */

export class UserStoriesComponent {
  constructor(intents) {
    this.intents = intents
    this.container = null
    this.filterBtns = null
    this.addBtn = null
    this.listContainer = null
    this.branchSelect = null
    this.currentFilter = 'all'
    this.currentBranch = 'all' // Filter by branch
    this.stories = []
    this.branches = {}
    this.selectedStoryIds = new Set() // Track selected stories for batch operations
  }

  /**
   * Initialize the component
   */
  init() {
    this.container = document.getElementById('user-stories-view')
    this.listContainer = document.getElementById('user-stories-list')
    this.addBtn = document.getElementById('add-story-btn')
    this.filterBtns = this.container.querySelectorAll('.filter-btn')

    this.bindEvents()
    this.subscribeToState()
  }

  /**
   * Bind DOM events
   */
  bindEvents() {
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
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      const { state } = e.detail
      this.stories = state.userStories || []
      this.branches = state.history?.raw?.branches || {}
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
   * Get filtered stories (by status and branch)
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

    return filtered
  }

  /**
   * Render the stories list
   */
  render() {
    // Render branch filter dropdown
    this.renderBranchFilter()

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

    this.listContainer.innerHTML = filtered.map(story => this.renderStoryCard(story)).join('')

    // Bind card events
    this.bindCardEvents()
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
   * Render a single story card
   */
  renderStoryCard(story) {
    const statusClass = story.status.replace('-', '')
    const criteriaCount = story.acceptanceCriteria?.length || 0
    const isSelected = this.selectedStoryIds.has(story.id)
    const canImplement = story.status === 'pending' // Only pending stories can be started
    const canComplete = story.status === 'in-progress' // Only in-progress stories can be completed

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
            <button class="story-action-btn edit-btn" title="Edit story">✎</button>
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
        <button class="btn primary start-implementation-btn">Start Implementation</button>
      </div>
    `

    // Bind action bar events
    actionBar.querySelector('.clear-selection-btn').addEventListener('click', () => {
      this.clearSelection()
    })

    actionBar.querySelector('.start-implementation-btn').addEventListener('click', () => {
      this.startImplementation()
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
   * Start implementation for selected stories
   */
  startImplementation() {
    const selectedStories = this.stories.filter(s => this.selectedStoryIds.has(s.id))

    if (selectedStories.length === 0) {
      return
    }

    // Call intent to start implementation
    this.intents.startStoryImplementation(selectedStories)

    // Clear selection after starting
    this.selectedStoryIds.clear()
    this.updateActionBar()
  }

  /**
   * Cycle through status values
   */
  cycleStatus(storyId) {
    const story = this.stories.find(s => s.id === storyId)
    if (!story) return

    const statusOrder = ['pending', 'in-progress', 'completed']
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
      'completed': 'Completed'
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
