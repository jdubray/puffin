/**
 * History Tree Component
 *
 * Displays hierarchical prompt history organized by branches.
 * Allows navigation through prompt history and branch management.
 */

export class HistoryTreeComponent {
  constructor(intents) {
    this.intents = intents
    this.branchList = null
    this.historyTree = null
  }

  /**
   * Initialize the component
   */
  init() {
    this.branchList = document.getElementById('branch-list')
    this.historyTree = document.getElementById('history-tree')

    this.bindEvents()
    this.subscribeToState()
  }

  /**
   * Bind DOM events
   */
  bindEvents() {
    // Add branch button
    document.getElementById('add-branch-btn').addEventListener('click', () => {
      this.showAddBranchDialog()
    })
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
    this.renderBranches(historyState.branches, historyState.activeBranch)
    this.renderHistory(historyState.promptTree, historyState.activePromptId)
  }

  /**
   * Render branch list
   */
  renderBranches(branches, activeBranch) {
    this.branchList.innerHTML = ''

    branches.forEach(branch => {
      const item = document.createElement('li')
      item.className = `branch-item ${branch.isActive ? 'active' : ''}`
      item.dataset.branchId = branch.id
      item.innerHTML = `
        <span class="icon">${this.getBranchIcon(branch.icon)}</span>
        <span class="name">${this.escapeHtml(branch.name)}</span>
        <span class="count">${branch.promptCount}</span>
      `

      item.addEventListener('click', () => {
        this.intents.selectBranch(branch.id)
      })

      // Context menu for custom branches
      if (!['specifications','architecture', 'ui', 'backend', 'deployment'].includes(branch.id)) {
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault()
          this.showBranchContextMenu(e, branch)
        })
      }

      this.branchList.appendChild(item)
    })
  }

  /**
   * Render history tree
   */
  renderHistory(promptTree, activePromptId) {
    if (!promptTree || promptTree.length === 0) {
      this.historyTree.innerHTML = `
        <div class="history-empty">
          No prompts yet. Start a conversation!
        </div>
      `
      return
    }

    this.historyTree.innerHTML = ''

    promptTree.forEach(prompt => {
      const item = document.createElement('div')

      // Build class list based on prompt type
      let classes = ['history-item']
      if (prompt.isSelected) classes.push('selected')
      if (prompt.isStoryThread) classes.push('story-thread')
      if (prompt.isDerivation) classes.push('derivation')

      item.className = classes.join(' ')
      item.style.setProperty('--depth', prompt.depth)
      item.dataset.promptId = prompt.id

      // Different rendering for story threads vs regular prompts
      if (prompt.isStoryThread) {
        const statusClass = this.getStoryStatusClass(prompt.storyStatus)
        const statusIcon = this.getStoryStatusIcon(prompt.storyStatus)
        item.innerHTML = `
          <span class="status-dot ${statusClass}" title="${prompt.storyStatus}">${statusIcon}</span>
          <span class="preview story-title">${this.escapeHtml(prompt.storyTitle || prompt.preview)}</span>
        `
      } else if (prompt.isDerivation) {
        item.innerHTML = `
          <span class="status derivation-marker">📋</span>
          <span class="preview">${this.escapeHtml(prompt.preview)}</span>
        `
      } else {
        item.innerHTML = `
          <span class="status ${prompt.hasResponse ? 'has-response' : ''}"></span>
          <span class="preview">${this.escapeHtml(prompt.preview)}</span>
          <button class="history-rerun-btn" title="Rerun this prompt">↻</button>
        `
      }

      // Click on item to select
      item.addEventListener('click', (e) => {
        // Don't select if clicking the rerun button
        if (e.target.classList.contains('history-rerun-btn')) return
        this.intents.selectPrompt(prompt.id)
      })

      // Rerun button click (only for regular prompts)
      const rerunBtn = item.querySelector('.history-rerun-btn')
      if (rerunBtn) {
        rerunBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          this.intents.rerunPrompt(prompt.id)
        })
      }

      // Right-click to add child prompt
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
      'implementing': '🔵',
      'completed': '🟢',
      'failed': '🔴'
    }
    return statusIcons[status] || '🟡'
  }

  /**
   * Get icon for branch type
   */
  getBranchIcon(icon) {
    const icons = {
      building: '🏗️',
      layout: '🎨',
      server: '⚙️',
      cloud: '☁️',
      folder: '📁',
      code: '💻',
      test: '🧪',
      docs: '📄'
    }
    return icons[icon] || '📁'
  }

  /**
   * Show add branch dialog
   */
  showAddBranchDialog() {
    this.intents.showModal('add-branch', {})
    this.renderAddBranchModal()
  }

  /**
   * Render add branch modal
   */
  renderAddBranchModal() {
    const modalContent = document.getElementById('modal-content')
    const modalTitle = document.getElementById('modal-title')
    const modalActions = document.getElementById('modal-actions')

    modalTitle.textContent = 'Add Branch'

    modalContent.innerHTML = `
      <div class="form-group">
        <label for="branch-name-input">Branch Name</label>
        <input type="text" id="branch-name-input" placeholder="e.g., Testing, Database, API...">
      </div>
      <div class="form-group">
        <label for="branch-icon-select">Icon</label>
        <select id="branch-icon-select">
          <option value="folder">📁 Folder</option>
          <option value="code">💻 Code</option>
          <option value="test">🧪 Testing</option>
          <option value="docs">📄 Docs</option>
          <option value="cloud">☁️ Cloud</option>
          <option value="server">⚙️ Server</option>
        </select>
      </div>
    `

    modalActions.innerHTML = `
      <button class="btn secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn primary" id="modal-confirm-btn">Add Branch</button>
    `

    document.getElementById('modal-cancel-btn').addEventListener('click', () => {
      this.intents.hideModal()
    })

    document.getElementById('modal-confirm-btn').addEventListener('click', () => {
      const name = document.getElementById('branch-name-input').value.trim()
      const icon = document.getElementById('branch-icon-select').value

      if (name) {
        const id = name.toLowerCase().replace(/\s+/g, '-')
        this.intents.createBranch({ id, name, icon })
        this.intents.hideModal()
      }
    })

    // Focus input
    document.getElementById('branch-name-input').focus()
  }

  /**
   * Show branch context menu
   */
  showBranchContextMenu(e, branch) {
    // Simple confirm dialog for delete
    if (confirm(`Delete branch "${branch.name}"? This will delete all prompts in this branch.`)) {
      this.intents.deleteBranch(branch.id)
    }
  }

  /**
   * Show prompt context menu
   */
  showPromptContextMenu(e, prompt) {
    // For now, selecting a prompt to reply to it
    this.intents.selectPrompt(prompt.id)

    // Show a small menu or just set the prompt as parent for next submission
    // This could be expanded to a proper context menu
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
  }
}
