/**
 * Story Generations Component (Insights View)
 *
 * Displays history of how Claude decomposed prompts into stories,
 * user feedback on generated stories, and implementation journey outcomes.
 */

export class StoryGenerationsComponent {
  constructor(intents) {
    this.intents = intents
    this.container = null
    this.listContainer = null
    this.exportBtn = null
    this.filterSelect = null
    this.generations = []
    this.journeys = []
    this.currentFilter = 'all'
    this.expandedGenerations = new Set()
  }

  /**
   * Initialize the component
   */
  init() {
    // Now a subtab within Backlog view
    this.container = document.querySelector('#backlog-insights-tab .insights-container')
    if (!this.container) {
      console.log('[STORY-GENERATIONS] Container not found')
      return
    }
    this.listContainer = this.container.querySelector('.generations-list')
    this.exportBtn = this.container.querySelector('.export-btn')
    this.filterSelect = this.container.querySelector('.filter-select')

    this.bindEvents()
    this.subscribeToState()
  }

  /**
   * Bind DOM events
   */
  bindEvents() {
    if (this.exportBtn) {
      this.exportBtn.addEventListener('click', () => this.exportData())
    }
    if (this.filterSelect) {
      this.filterSelect.addEventListener('change', (e) => {
        this.currentFilter = e.target.value
        this.render()
      })
    }
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      const { state } = e.detail
      this.generations = state.storyGenerations?.generations || []
      this.journeys = state.storyGenerations?.implementation_journeys || []
      this.render()
    })
  }

  /**
   * Get filtered generations based on current filter
   */
  getFilteredGenerations() {
    if (this.currentFilter === 'all') {
      return this.generations
    }

    return this.generations.filter(gen => {
      const hasAction = gen.generated_stories.some(s => s.user_action === this.currentFilter)
      return hasAction
    })
  }

  /**
   * Render the generations list
   */
  render() {
    if (!this.listContainer) return

    const filtered = this.getFilteredGenerations()

    if (filtered.length === 0) {
      this.listContainer.innerHTML = `
        <div class="empty-state">
          <p>No story generations recorded yet.</p>
          <p class="hint">Use "Derive User Stories" when submitting prompts to track how Claude decomposes your requirements.</p>
        </div>
      `
      return
    }

    // Sort by timestamp descending (newest first)
    const sorted = [...filtered].sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    )

    const html = sorted.map(gen => this.renderGenerationCard(gen)).join('')
    this.listContainer.innerHTML = html

    this.bindCardEvents()
  }

  /**
   * Render a single generation card
   */
  renderGenerationCard(generation) {
    const isExpanded = this.expandedGenerations.has(generation.id)
    const promptPreview = this.truncateText(generation.user_prompt, 100)
    const storyCount = generation.generated_stories.length
    const acceptedCount = generation.generated_stories.filter(s => s.user_action === 'accepted').length
    const modifiedCount = generation.generated_stories.filter(s => s.user_action === 'modified').length
    const rejectedCount = generation.generated_stories.filter(s => s.user_action === 'rejected').length
    const pendingCount = generation.generated_stories.filter(s => s.user_action === 'pending').length

    // Find journeys for this generation's stories
    const storyIds = generation.generated_stories
      .filter(s => s.backlog_story_id)
      .map(s => s.backlog_story_id)
    const relatedJourneys = this.journeys.filter(j => storyIds.includes(j.story_id))

    return `
      <div class="generation-card ${isExpanded ? 'expanded' : ''}" data-generation-id="${generation.id}">
        <div class="generation-header" data-action="toggle">
          <div class="generation-info">
            <span class="generation-date">${this.formatDate(generation.timestamp)}</span>
            <span class="generation-model">${generation.model_used || 'unknown'}</span>
          </div>
          <p class="generation-prompt">${this.escapeHtml(promptPreview)}</p>
          <div class="generation-stats">
            <span class="stat-item" title="Total stories generated">📝 ${storyCount}</span>
            ${acceptedCount > 0 ? `<span class="stat-item accepted" title="Accepted">✓ ${acceptedCount}</span>` : ''}
            ${modifiedCount > 0 ? `<span class="stat-item modified" title="Modified">✎ ${modifiedCount}</span>` : ''}
            ${rejectedCount > 0 ? `<span class="stat-item rejected" title="Rejected">✕ ${rejectedCount}</span>` : ''}
            ${pendingCount > 0 ? `<span class="stat-item pending" title="Pending">? ${pendingCount}</span>` : ''}
          </div>
          <span class="expand-icon">${isExpanded ? '▼' : '▶'}</span>
        </div>

        ${isExpanded ? `
          <div class="generation-details">
            <h4>Generated Stories</h4>
            <div class="stories-detail-list">
              ${generation.generated_stories.map(story => this.renderStoryDetail(story, relatedJourneys)).join('')}
            </div>

            ${relatedJourneys.length > 0 ? `
              <h4>Implementation Journeys</h4>
              <div class="journeys-list">
                ${relatedJourneys.map(j => this.renderJourneyDetail(j, generation.generated_stories)).join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `
  }

  /**
   * Render story detail within expanded generation
   */
  renderStoryDetail(story, journeys) {
    const actionClass = story.user_action || 'pending'
    const actionLabel = this.formatAction(story.user_action)
    const journey = journeys.find(j => j.story_id === story.backlog_story_id)

    return `
      <div class="story-detail ${actionClass}">
        <div class="story-detail-header">
          <span class="story-action-badge ${actionClass}">${actionLabel}</span>
          <span class="story-detail-title">${this.escapeHtml(story.title)}</span>
        </div>
        ${story.modification_diff ? `
          <div class="story-modification">
            <span class="label">Changes:</span> ${this.escapeHtml(story.modification_diff)}
          </div>
        ` : ''}
        ${story.rejection_reason ? `
          <div class="story-rejection">
            <span class="label">Reason:</span> ${this.escapeHtml(story.rejection_reason)}
          </div>
        ` : ''}
        ${journey ? `
          <div class="story-journey-link">
            <span class="label">Implementation:</span>
            <span class="journey-status ${journey.status}">${journey.status}</span>
            <span class="journey-turns">${journey.turn_count} turns</span>
          </div>
        ` : ''}
      </div>
    `
  }

  /**
   * Render journey detail
   */
  renderJourneyDetail(journey, stories) {
    const story = stories.find(s => s.backlog_story_id === journey.story_id || s.id === journey.story_id)
    const storyTitle = story?.title || 'Unknown Story'
    const statusClass = journey.status || 'pending'

    // Summarize input types
    const inputSummary = this.summarizeInputs(journey.inputs || [])

    return `
      <div class="journey-detail ${statusClass}">
        <div class="journey-header">
          <span class="journey-status-badge ${statusClass}">${journey.status}</span>
          <span class="journey-story">${this.escapeHtml(storyTitle)}</span>
        </div>
        <div class="journey-stats">
          <span class="journey-turns">
            <strong>${journey.turn_count}</strong> turns
          </span>
          ${journey.started_at ? `
            <span class="journey-duration">
              ${this.formatDuration(journey.started_at, journey.completed_at)}
            </span>
          ` : ''}
        </div>
        ${inputSummary ? `
          <div class="journey-inputs">
            <span class="label">Input types:</span> ${inputSummary}
          </div>
        ` : ''}
        ${journey.outcome_notes ? `
          <div class="journey-notes">
            <span class="label">Notes:</span> ${this.escapeHtml(journey.outcome_notes)}
          </div>
        ` : ''}
      </div>
    `
  }

  /**
   * Summarize input types from journey
   */
  summarizeInputs(inputs) {
    if (!inputs || inputs.length === 0) return ''

    const counts = inputs.reduce((acc, input) => {
      const type = input.type || 'technical'
      acc[type] = (acc[type] || 0) + 1
      return acc
    }, {})

    return Object.entries(counts)
      .map(([type, count]) => `${type} (${count})`)
      .join(', ')
  }

  /**
   * Bind events for generation cards
   */
  bindCardEvents() {
    this.listContainer.querySelectorAll('.generation-header').forEach(header => {
      header.addEventListener('click', () => {
        const card = header.closest('.generation-card')
        const genId = card.dataset.generationId
        this.toggleExpand(genId)
      })
    })
  }

  /**
   * Toggle expansion of a generation card
   */
  toggleExpand(generationId) {
    if (this.expandedGenerations.has(generationId)) {
      this.expandedGenerations.delete(generationId)
    } else {
      this.expandedGenerations.add(generationId)
    }
    this.render()
  }

  /**
   * Export data as JSON
   */
  async exportData() {
    try {
      const result = await window.puffin.state.exportStoryGenerations()
      if (result.success) {
        this.showToast('Story generations exported successfully', 'success')
      } else {
        this.showToast('Export failed: ' + result.error, 'error')
      }
    } catch (error) {
      console.error('Export failed:', error)
      this.showToast('Export failed', 'error')
    }
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    // Use global toast if available
    if (window.puffinApp?.showToast) {
      window.puffinApp.showToast(message, type)
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`)
    }
  }

  /**
   * Format action label
   */
  formatAction(action) {
    const labels = {
      'accepted': 'Accepted',
      'modified': 'Modified',
      'rejected': 'Rejected',
      'pending': 'Pending',
      'user_added': 'User Added'
    }
    return labels[action] || action || 'Pending'
  }

  /**
   * Format date for display
   */
  formatDate(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  /**
   * Format duration between two timestamps
   */
  formatDuration(start, end) {
    if (!start) return ''
    const startDate = new Date(start)
    const endDate = end ? new Date(end) : new Date()
    const diffMs = endDate - startDate
    const diffMins = Math.round(diffMs / 60000)

    if (diffMins < 60) {
      return `${diffMins}m`
    }
    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    return `${hours}h ${mins}m`
  }

  /**
   * Truncate text to a maximum length
   */
  truncateText(text, maxLength) {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return ''
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
