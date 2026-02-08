/**
 * User Story Review Modal Component
 *
 * Displays derived stories for review and iteration before implementation.
 * Supports marking stories as ready, editing, deleting, and requesting changes.
 */

export class UserStoryReviewModalComponent {
  constructor(intents) {
    this.intents = intents
    this.feedbackText = ''
  }

  /**
   * Initialize the component
   */
  init() {
    this.subscribeToState()
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      const { state } = e.detail
      if (state.ui.modal?.type === 'user-story-review') {
        this.render(state.storyDerivation, state.ui.modal)
      }
    })
  }

  /**
   * Render the modal content
   */
  render(derivationState, modal) {
    console.log('[STORY-MODAL] Rendering modal')
    console.log('[STORY-MODAL] derivationState.status:', derivationState?.status)
    console.log('[STORY-MODAL] derivationState.isDeriving:', derivationState?.isDeriving)
    console.log('[STORY-MODAL] derivationState.isReviewing:', derivationState?.isReviewing)
    console.log('[STORY-MODAL] derivationState.pendingStories:', derivationState?.pendingStories?.length || 0)
    console.log('[STORY-MODAL] derivationState.pendingStories data:', derivationState?.pendingStories)

    const modalContainer = document.getElementById('modal-container')
    const modalEl = modalContainer.querySelector('.modal')
    const modalTitle = document.getElementById('modal-title')
    const modalContent = document.getElementById('modal-content')
    const modalActions = document.getElementById('modal-actions')

    // Add modal class
    modalEl.classList.add('story-review-modal')

    // Set title
    modalTitle.textContent = 'Review User Stories'

    // Build content
    modalContent.innerHTML = this.buildContent(derivationState)

    // Build actions
    modalActions.innerHTML = this.buildActions(derivationState)

    // Show the modal
    modalContainer.classList.remove('hidden')

    // Bind events after a brief delay to prevent race conditions with modal display
    // This ensures the modal is fully rendered before attaching event handlers
    setTimeout(() => {
      this.bindEvents(derivationState)
    }, 50)
  }

  /**
   * Build modal content HTML
   */
  buildContent(state) {
    let html = ''

    // Show prominent loading state when deriving
    if (state.isDeriving || state.isRequestingChanges) {
      const statusText = state.isDeriving
        ? 'Deriving user stories from your prompt...'
        : 'Updating stories based on your feedback...'
      const subText = state.isDeriving
        ? 'Claude is analyzing your requirements and creating user stories with acceptance criteria.'
        : 'Claude is refining the stories based on your feedback.'

      html += `
        <div class="story-derivation-loading">
          <div class="loading-spinner-large"></div>
          <div class="loading-text">
            <div class="loading-title">${statusText}</div>
            <div class="loading-subtitle">${subText}</div>
          </div>
        </div>
      `
    }

    // Original prompt preview
    if (state.originalPrompt) {
      html += `
        <div class="original-prompt-preview">
          <div class="prompt-label">Original Prompt</div>
          <div class="prompt-text">${this.escapeHtml(this.truncate(state.originalPrompt, 200))}</div>
        </div>
      `
    }

    // Story list
    if (state.pendingStories.length > 0) {
      html += '<div class="pending-story-list">'
      state.pendingStories.forEach(story => {
        html += this.buildStoryCard(story)
      })
      html += '</div>'
    } else if (!state.isDeriving && !state.isRequestingChanges) {
      html += '<p class="no-stories">No stories to review.</p>'
    }

    // Feedback section for requesting changes
    if (state.isReviewing && state.pendingStories.length > 0) {
      html += `
        <div class="story-review-feedback">
          <label for="story-feedback">Request Changes (optional)</label>
          <textarea id="story-feedback" placeholder="Describe any changes you'd like to the stories above..."></textarea>
        </div>
      `
    }

    return html
  }

  /**
   * Build a story card HTML
   */
  buildStoryCard(story) {
    const statusClass = story.status === 'ready' ? 'status-ready' : 'status-pending'
    const isReady = story.status === 'ready'

    let criteriaHtml = ''
    if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
      criteriaHtml = `
        <div class="pending-story-criteria">
          <h5>Acceptance Criteria</h5>
          <ul>
            ${story.acceptanceCriteria.map(c => `<li>${this.escapeHtml(c)}</li>`).join('')}
          </ul>
        </div>
      `
    }

    return `
      <div class="pending-story-item ${statusClass}" data-story-id="${story.id}">
        <div class="pending-story-header">
          <h4 class="pending-story-title">${this.escapeHtml(story.title)}</h4>
          <div class="pending-story-actions">
            <button class="story-action ${isReady ? 'ready' : ''}" data-action="toggle-ready" data-id="${story.id}">
              ${isReady ? '✓ Ready' : 'Mark Ready'}
            </button>
            <button class="story-action delete" data-action="delete" data-id="${story.id}">Delete</button>
          </div>
        </div>
        ${story.description ? `<p class="pending-story-description">${this.escapeHtml(story.description)}</p>` : ''}
        ${criteriaHtml}
      </div>
    `
  }

  /**
   * Build modal actions HTML
   */
  buildActions(state) {
    if (state.isDeriving || state.isRequestingChanges) {
      return `
        <button class="btn secondary" data-action="cancel">Cancel</button>
      `
    }

    const readyCount = state.readyCount
    const totalCount = state.storyCount
    const hasReady = readyCount > 0

    return `
      <div class="story-review-footer">
        <span class="story-review-summary">
          <strong>${readyCount}</strong> of ${totalCount} stories selected
        </span>
        <div class="btn-group">
          <button class="btn secondary" data-action="cancel">Cancel</button>
          <button class="btn secondary" data-action="request-changes" ${totalCount === 0 ? 'disabled' : ''}>
            Request Changes
          </button>
          <button class="btn primary" data-action="add-to-backlog" ${!hasReady ? 'disabled' : ''}>
            Add to Backlog (${readyCount})
          </button>
        </div>
      </div>
    `
  }

  /**
   * Bind event handlers
   */
  bindEvents(state) {
    const modalContent = document.getElementById('modal-content')
    const modalActions = document.getElementById('modal-actions')

    // Story action buttons
    modalContent.querySelectorAll('.story-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action
        const storyId = btn.dataset.id

        if (action === 'toggle-ready') {
          const story = state.pendingStories.find(s => s.id === storyId)
          if (story?.status === 'ready') {
            this.intents.unmarkStoryReady(storyId)
          } else {
            this.intents.markStoryReady(storyId)
          }
        } else if (action === 'delete') {
          this.intents.deleteDerivedStory(storyId)
        }
      })
    })

    // Modal action buttons
    modalActions.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action

        switch (action) {
          case 'cancel':
            this.intents.cancelStoryReview()
            break

          case 'request-changes':
            const feedback = document.getElementById('story-feedback')?.value || ''
            if (feedback.trim()) {
              this.intents.requestStoryChanges(feedback)
              // Trigger story modification via IPC
              this.triggerStoryModification(state.pendingStories, feedback, state.originalPrompt)
            }
            break

          case 'add-to-backlog':
            const readyStories = state.pendingStories
              .filter(s => s.status === 'ready')
            const readyIds = readyStories.map(s => s.id)
            // Add selected stories to backlog
            this.intents.addStoriesToBacklog(readyIds)
            break
        }
      })
    })

    // Close modal on backdrop click
    const modalBackdrop = document.querySelector('.modal-backdrop')
    if (modalBackdrop) {
      // Remove old listeners by cloning the element
      const newBackdrop = modalBackdrop.cloneNode(true)
      modalBackdrop.parentNode.replaceChild(newBackdrop, modalBackdrop)
      newBackdrop.addEventListener('click', (e) => {
        console.log('[STORY-MODAL] Backdrop clicked')
        e.stopPropagation()
        this.intents.cancelStoryReview()
      })
    }

    // Close button
    const closeBtn = document.querySelector('.modal-close')
    if (closeBtn) {
      // Remove old listeners by cloning the element
      const newCloseBtn = closeBtn.cloneNode(true)
      closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn)
      newCloseBtn.addEventListener('click', (e) => {
        console.log('[STORY-MODAL] Close button clicked')
        e.stopPropagation()
        this.intents.cancelStoryReview()
      })
    }
  }

  /**
   * Trigger story modification via IPC
   */
  triggerStoryModification(currentStories, feedback, originalPrompt) {
    if (!window.puffin || !window.puffin.claude.modifyStories) {
      console.error('IPC not available for story modification')
      return
    }

    const appState = window.puffinApp?.state
    const project = appState?.config ? {
      name: appState.config.name,
      description: appState.config.description
    } : null

    console.log('Triggering story modification:', {
      storyCount: currentStories.length,
      feedback: feedback.substring(0, 100)
    })

    window.puffin.claude.modifyStories({
      stories: currentStories.map(s => ({
        title: s.title,
        description: s.description,
        acceptanceCriteria: s.acceptanceCriteria
      })),
      feedback,
      originalPrompt,
      model: document.getElementById('thread-model')?.value || 'sonnet',
      project
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
   * Truncate string
   */
  truncate(str, length) {
    if (!str) return ''
    if (str.length <= length) return str
    return str.substring(0, length) + '...'
  }

  /**
   * Cleanup
   */
  destroy() {
    // Remove event listeners if needed
  }
}
