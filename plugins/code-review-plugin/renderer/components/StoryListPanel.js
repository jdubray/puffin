export class StoryListPanel {
  constructor(container, { onAction, onRunStart, onSort }) {
    this._container = container
    this._onAction = onAction
    this._onRunStart = onRunStart
    this._onSort = onSort
    this._checked = new Set()
    this._isSorting = false
  }

  render(stories, activeStoryId, runningStoryIds, isRunning, branches = [], currentBranch = '', isSorting = false) {
    this._isSorting = isSorting
    this._stories = stories
    this._activeStoryId = activeStoryId
    this._runningStoryIds = runningStoryIds || new Set()
    this._isRunning = isRunning
    this._branches = branches
    this._currentBranch = currentBranch
    const allChecked = stories.length > 0 && stories.every(s => this._checked.has(s.id))
    const anyChecked = stories.some(s => this._checked.has(s.id))

    const branchOptions = branches.length > 0
      ? branches.map(b => `<option value="${this._esc(b.id)}" ${b.id === currentBranch ? 'selected' : ''}>${this._esc(b.name)}</option>`).join('')
      : ''
    const branchSelector = branches.length > 0
      ? `<select class="cr-branch-select cr-run-branch" title="Puffin branch context">${branchOptions}</select>`
      : ''

    this._container.innerHTML = `
      <div class="cr-list-header">
        <label class="cr-select-all">
          <input type="checkbox" class="cr-chk-all" ${allChecked ? 'checked' : ''}>
          ${allChecked ? 'Deselect All' : 'Select All'}
        </label>
        <div class="cr-run-controls">
          ${branchSelector}
          <button class="cr-btn cr-sort-btn ${isRunning || isSorting ? 'cr-btn-disabled' : ''}"
                  ${isRunning || isSorting ? 'disabled' : ''}
                  title="Let Claude auto-sort stories into optimal run order">
            ${isSorting ? '⟳ Sorting…' : '⇅ Sort'}
          </button>
          <button class="cr-btn cr-btn-primary cr-run-btn ${isRunning || !anyChecked ? 'cr-btn-disabled' : ''}"
                  ${isRunning || !anyChecked ? 'disabled' : ''}>
            ${isRunning ? '⏸ Running…' : '▶ Run'}
          </button>
        </div>
      </div>
      <div class="cr-story-list">
        ${stories.map(s => this._renderRow(s, activeStoryId, runningStoryIds, isRunning)).join('')}
      </div>
      <div class="cr-list-footer">
        <button class="cr-btn cr-new-btn">+ New Story</button>
      </div>
    `

    this._bindEvents(stories, isRunning)
  }

  _renderRow(story, activeStoryId, runningStoryIds, isRunning) {
    const isActive = story.id === activeStoryId
    const isRunning_ = runningStoryIds?.has(story.id)
    const hasReview = !!story.lastRunId
    const checked = this._checked.has(story.id)

    return `
      <div class="cr-story-row ${isActive ? 'active' : ''} ${isRunning_ ? 'running' : ''}"
           data-story-id="${story.id}">
        <label class="cr-row-check">
          <input type="checkbox" class="cr-chk-story" data-id="${story.id}" ${checked ? 'checked' : ''}>
        </label>
        <span class="cr-row-title" title="${this._esc(story.title)}">${this._esc(story.title)}</span>
        ${isRunning_ ? '<span class="cr-badge cr-badge-running">running</span>' : ''}
        <div class="cr-story-actions">
          <button class="cr-btn cr-act-btn" data-action="edit" data-id="${story.id}" title="Edit story">Edit</button>
          <button class="cr-btn cr-act-btn ${!story.ris?.trim() ? 'cr-btn-empty' : ''}" data-action="ris" data-id="${story.id}" title="${!story.ris?.trim() ? 'RIS not set' : 'Edit RIS'}">RIS</button>
          <button class="cr-btn cr-act-btn ${!story.assertions?.length ? 'cr-btn-empty' : ''}" data-action="assertions" data-id="${story.id}" title="${!story.assertions?.length ? 'No assertions' : 'Edit assertions'}">Assert</button>
          <button class="cr-btn cr-act-btn ${hasReview ? '' : 'cr-btn-disabled'}"
                  data-action="review" data-id="${story.id}"
                  ${hasReview ? '' : 'disabled'} title="View review">Review</button>
          <button class="cr-btn cr-del-btn" data-action="delete" data-id="${story.id}" title="Delete">✕</button>
        </div>
      </div>
    `
  }

  _bindEvents(stories, isRunning) {
    this._container.querySelector('.cr-chk-all')?.addEventListener('change', e => {
      if (e.target.checked) {
        stories.forEach(s => this._checked.add(s.id))
      } else {
        this._checked.clear()
      }
      this.render(stories, this._activeStoryId, this._runningStoryIds, this._isRunning)
    })

    this._container.querySelectorAll('.cr-chk-story').forEach(chk => {
      chk.addEventListener('change', e => {
        const id = e.target.dataset.id
        e.target.checked ? this._checked.add(id) : this._checked.delete(id)
        this.render(stories, this._activeStoryId, this._runningStoryIds, this._isRunning)
      })
    })

    this._container.querySelector('.cr-sort-btn')?.addEventListener('click', () => {
      if (!isRunning && !this._isSorting && this._onSort) this._onSort()
    })

    this._container.querySelector('.cr-run-btn')?.addEventListener('click', () => {
      if (!isRunning) {
        const branch = this._container.querySelector('.cr-run-branch')?.value || this._currentBranch
        // Pass checked IDs in story list order (not Set insertion order)
        const orderedIds = stories.filter(s => this._checked.has(s.id)).map(s => s.id)
        this._onRunStart(orderedIds, branch)
      }
    })

    this._container.querySelector('.cr-new-btn')?.addEventListener('click', () => {
      this._onAction('new', null)
    })

    this._container.querySelectorAll('.cr-act-btn, .cr-del-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        if (btn.disabled) return
        const { action, id } = btn.dataset
        const story = stories.find(s => s.id === id)
        if (story) this._onAction(action, story)
      })
    })
  }

  _esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}
