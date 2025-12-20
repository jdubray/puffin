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
        this.intents.switchView('prompt')
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
          this.intents.toggleThreadExpanded(prompt.id)
        })
      }

      // Click on item to select (and expand if collapsed with children)
      item.addEventListener('click', (e) => {
        // Don't select if clicking the rerun button or expand indicator
        if (e.target.classList.contains('history-rerun-btn')) return
        if (e.target.classList.contains('expand-indicator')) return

        // If has children and collapsed, expand it. Otherwise select.
        if (prompt.hasChildren && !prompt.isExpanded) {
          this.intents.toggleThreadExpanded(prompt.id)
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
        label: prompt.isExpanded ? 'Collapse thread' : 'Expand thread',
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
