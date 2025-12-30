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
    this.searchInput = null
    this.searchClearBtn = null
    this.debounceTimer = null
  }

  /**
   * Initialize the component
   */
  init() {
    this.branchList = document.getElementById('branch-list')
    this.historyTree = document.getElementById('history-tree')
    this.searchInput = document.getElementById('thread-search-input')
    this.searchClearBtn = document.getElementById('thread-search-clear')

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
    this.renderBranches(historyState.branches, historyState.activeBranch)
    const searchQuery = historyState.threadSearchQuery || ''
    this.renderHistory(historyState.promptTree, historyState.activePromptId, searchQuery)

    // Sync search input with state (in case of external state changes)
    if (this.searchInput && this.searchInput.value !== searchQuery) {
      this.searchInput.value = searchQuery
      this.updateClearButtonVisibility(searchQuery)
    }
  }

  /**
   * Render branch list
   */
  renderBranches(branches, activeBranch) {
    this.branchList.innerHTML = ''

    branches.forEach((branch, index) => {
      const item = document.createElement('li')
      item.className = `branch-item ${branch.isActive ? 'active' : ''}`
      item.dataset.branchId = branch.id
      item.dataset.index = index
      item.draggable = true
      item.innerHTML = `
        <span class="drag-handle">⋮</span>
        <span class="icon">${this.getBranchIcon(branch.icon, branch.id)}</span>
        <span class="name">${this.escapeHtml(branch.name)}</span>
        <span class="count">${branch.promptCount}</span>
      `

      item.addEventListener('click', (e) => {
        // Don't trigger click when dragging
        if (e.target.classList.contains('drag-handle')) return
        this.intents.selectBranch(branch.id)
        // View switch is now handled in selectBranchAcceptor
      })

      // Drag and drop events
      item.addEventListener('dragstart', (e) => this.handleDragStart(e, branch.id, index))
      item.addEventListener('dragover', (e) => this.handleDragOver(e))
      item.addEventListener('dragenter', (e) => this.handleDragEnter(e))
      item.addEventListener('dragleave', (e) => this.handleDragLeave(e))
      item.addEventListener('drop', (e) => this.handleDrop(e))
      item.addEventListener('dragend', (e) => this.handleDragEnd(e))

      // Context menu for all branches (custom branches get full menu, built-in branches get limited menu)
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        this.showBranchContextMenu(e, branch)
      })

      this.branchList.appendChild(item)
    })
  }

  /**
   * Handle drag start
   */
  handleDragStart(e, branchId, index) {
    this.draggedBranchId = branchId
    this.draggedIndex = index
    e.target.classList.add('dragging')
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', branchId)
  }

  /**
   * Handle drag over
   */
  handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  /**
   * Handle drag enter
   */
  handleDragEnter(e) {
    e.preventDefault()
    const item = e.target.closest('.branch-item')
    if (item && item.dataset.branchId !== this.draggedBranchId) {
      item.classList.add('drag-over')
    }
  }

  /**
   * Handle drag leave
   */
  handleDragLeave(e) {
    const item = e.target.closest('.branch-item')
    if (item) {
      item.classList.remove('drag-over')
    }
  }

  /**
   * Handle drop
   */
  handleDrop(e) {
    e.preventDefault()
    const targetItem = e.target.closest('.branch-item')
    if (!targetItem) return

    const targetIndex = parseInt(targetItem.dataset.index, 10)
    const sourceIndex = this.draggedIndex

    if (sourceIndex !== targetIndex) {
      this.intents.reorderBranches(sourceIndex, targetIndex)
    }

    targetItem.classList.remove('drag-over')
  }

  /**
   * Handle drag end
   */
  handleDragEnd(e) {
    e.target.classList.remove('dragging')
    // Clean up any remaining drag-over classes
    this.branchList.querySelectorAll('.drag-over').forEach(item => {
      item.classList.remove('drag-over')
    })
    this.draggedBranchId = null
    this.draggedIndex = null
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
          <span>No threads match "${this.escapeHtml(searchQuery)}"</span>
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
   * Get icon for branch type or branch ID
   * @param {string} icon - Icon name or branch ID
   * @param {string} [branchId] - Optional branch ID for default branch icons
   */
  getBranchIcon(icon, branchId) {
    // Icon name to emoji mapping
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

    // Default icons for known branch IDs (matches handoff panel)
    const branchIcons = {
      specifications: '📋',
      architecture: '🏗️',
      ui: '🪟',
      backend: '⚙️',
      deployment: '🚀',
      tmp: '📝',
      improvements: '✨',
      fullstack: '🔄',
      bugfixes: '🐛',
      'bug-fixes': '🐛'
    }

    // First check if there's a specific icon for this branch ID
    if (branchId && branchIcons[branchId]) {
      return branchIcons[branchId]
    }

    // Then check icon name mapping
    if (icons[icon]) {
      return icons[icon]
    }

    // Fall back to folder
    return '📁'
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
      <div class="form-group checkbox-group">
        <label>
          <input type="checkbox" id="branch-code-allowed" checked>
          Allow code modifications
        </label>
        <span class="form-hint">When unchecked, this branch can only modify documentation files</span>
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
      const codeModificationAllowed = document.getElementById('branch-code-allowed').checked

      if (name) {
        const id = name.toLowerCase().replace(/\s+/g, '-')
        this.intents.createBranch({ id, name, icon, codeModificationAllowed })
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
    // Remove any existing context menu
    const existingMenu = document.querySelector('.branch-context-menu')
    if (existingMenu) {
      existingMenu.remove()
    }

    // Create context menu
    const menu = document.createElement('div')
    menu.className = 'branch-context-menu'
    menu.style.left = `${e.clientX}px`
    menu.style.top = `${e.clientY}px`

    // Built-in branches that cannot be deleted
    const builtInBranches = ['specifications', 'architecture', 'ui', 'backend', 'deployment', 'improvements', 'tmp']
    const isBuiltIn = builtInBranches.includes(branch.id)

    // Build menu items
    const menuItems = [
      {
        label: '⚙️ Settings',
        action: () => this.showBranchSettingsModal(branch)
      },
      {
        label: '🔌 Manage Plugins',
        action: () => this.showPluginAssignmentModal(branch)
      }
    ]

    // Only add delete option for custom branches
    if (!isBuiltIn) {
      menuItems.push({
        label: '🗑️ Delete Branch',
        action: () => {
          if (confirm(`Delete branch "${branch.name}"? This will delete all prompts in this branch.`)) {
            this.intents.deleteBranch(branch.id)
          }
        },
        className: 'danger'
      })
    }

    // Render menu items
    menu.innerHTML = menuItems.map(item =>
      `<button class="branch-context-menu-item ${item.className || ''}">${item.label}</button>`
    ).join('')

    // Add click handlers
    const menuItemEls = menu.querySelectorAll('.branch-context-menu-item')
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
   * Show branch settings modal
   */
  showBranchSettingsModal(branch) {
    this.intents.showModal('branch-settings', { branch })
    this.renderBranchSettingsModal(branch)
  }

  /**
   * Render branch settings modal
   */
  async renderBranchSettingsModal(branch) {
    const modalContent = document.getElementById('modal-content')
    const modalTitle = document.getElementById('modal-title')
    const modalActions = document.getElementById('modal-actions')

    modalTitle.textContent = `Branch Settings: ${branch.name}`

    // Load available plugins
    let availablePlugins = []
    try {
      if (window.puffin?.state?.getClaudePlugins) {
        const result = await window.puffin.state.getClaudePlugins()
        if (result.success) {
          availablePlugins = result.plugins || []
        }
      }
    } catch (error) {
      console.error('Failed to load plugins:', error)
    }

    // Get currently assigned plugins for this branch
    const assignedPlugins = branch.assignedPlugins || []

    modalContent.innerHTML = `
      <div class="branch-settings-modal">
        <div class="form-group">
          <label for="branch-settings-name">Branch Name</label>
          <input type="text" id="branch-settings-name" value="${this.escapeHtml(branch.name)}"
                 placeholder="Branch name">
        </div>

        <div class="form-group">
          <label for="branch-settings-icon">Icon</label>
          <select id="branch-settings-icon">
            <option value="folder" ${branch.icon === 'folder' ? 'selected' : ''}>📁 Folder</option>
            <option value="building" ${branch.icon === 'building' ? 'selected' : ''}>🏗️ Building</option>
            <option value="layout" ${branch.icon === 'layout' ? 'selected' : ''}>🎨 Layout</option>
            <option value="server" ${branch.icon === 'server' ? 'selected' : ''}>⚙️ Server</option>
            <option value="cloud" ${branch.icon === 'cloud' ? 'selected' : ''}>☁️ Cloud</option>
            <option value="code" ${branch.icon === 'code' ? 'selected' : ''}>💻 Code</option>
            <option value="test" ${branch.icon === 'test' ? 'selected' : ''}>🧪 Testing</option>
            <option value="docs" ${branch.icon === 'docs' ? 'selected' : ''}>📄 Docs</option>
          </select>
        </div>

        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" id="branch-settings-code-allowed"
                   ${branch.codeModificationAllowed !== false ? 'checked' : ''}>
            Allow code modifications
          </label>
          <small class="form-hint">When unchecked, this branch can only modify documentation files</small>
        </div>

        <fieldset class="branch-plugins-fieldset">
          <legend>Assigned Plugins</legend>
          <p class="fieldset-description">Select plugins to inject their context when working on this branch</p>

          <div id="branch-plugins-list" class="branch-plugins-list">
            ${availablePlugins.length === 0 ? `
              <div class="no-plugins-message">
                <span>No plugins available.</span>
                <a href="#" id="go-to-plugins-link">Add plugins in Config tab</a>
              </div>
            ` : availablePlugins.map(plugin => `
              <label class="plugin-checkbox-item">
                <input type="checkbox"
                       name="assigned-plugin"
                       value="${plugin.id}"
                       ${assignedPlugins.includes(plugin.id) ? 'checked' : ''}
                       ${plugin.enabled === false ? 'disabled' : ''}>
                <span class="plugin-checkbox-icon">${plugin.icon || '🔧'}</span>
                <span class="plugin-checkbox-content">
                  <span class="plugin-checkbox-name">${this.escapeHtml(plugin.name)}</span>
                  <span class="plugin-checkbox-desc">${this.escapeHtml(plugin.description || '')}</span>
                </span>
                ${plugin.enabled === false ? '<span class="plugin-disabled-badge">Disabled</span>' : ''}
              </label>
            `).join('')}
          </div>
        </fieldset>
      </div>
    `

    modalActions.innerHTML = `
      <button class="btn secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn primary" id="modal-confirm-btn">Save Settings</button>
    `

    // Bind go-to-plugins link if present
    const goToPluginsLink = document.getElementById('go-to-plugins-link')
    if (goToPluginsLink) {
      goToPluginsLink.addEventListener('click', (e) => {
        e.preventDefault()
        this.intents.hideModal()
        this.intents.switchView('config')
      })
    }

    // Bind modal buttons
    document.getElementById('modal-cancel-btn').addEventListener('click', () => {
      this.intents.hideModal()
    })

    document.getElementById('modal-confirm-btn').addEventListener('click', () => {
      this.saveBranchSettings(branch.id)
    })

    // Bind checkbox item toggle for visual feedback
    const pluginItems = document.querySelectorAll('.plugin-checkbox-item')
    pluginItems.forEach(item => {
      const checkbox = item.querySelector('input[type="checkbox"]')
      if (checkbox && !checkbox.disabled) {
        checkbox.addEventListener('change', () => {
          item.classList.toggle('selected', checkbox.checked)
        })
        // Set initial selected state
        if (checkbox.checked) {
          item.classList.add('selected')
        }
      }
    })

    // Focus name input
    document.getElementById('branch-settings-name').focus()
  }

  /**
   * Save branch settings from modal
   */
  saveBranchSettings(branchId) {
    const name = document.getElementById('branch-settings-name').value.trim()
    const icon = document.getElementById('branch-settings-icon').value
    const codeModificationAllowed = document.getElementById('branch-settings-code-allowed').checked

    // Get assigned plugins
    const pluginCheckboxes = document.querySelectorAll('input[name="assigned-plugin"]:checked')
    const assignedPlugins = Array.from(pluginCheckboxes).map(cb => cb.value)

    if (!name) {
      alert('Branch name is required')
      return
    }

    // Update branch settings
    this.intents.updateBranchSettings(branchId, {
      name,
      icon,
      codeModificationAllowed,
      assignedPlugins
    })

    this.intents.hideModal()
  }

  /**
   * Show plugin assignment modal for a branch
   */
  showPluginAssignmentModal(branch) {
    this.intents.showModal('plugin-assignment', { branch })
    this.renderPluginAssignmentModal(branch)
  }

  /**
   * Render plugin assignment modal with immediate toggle functionality
   */
  async renderPluginAssignmentModal(branch) {
    const modalContent = document.getElementById('modal-content')
    const modalTitle = document.getElementById('modal-title')
    const modalActions = document.getElementById('modal-actions')

    modalTitle.textContent = `Manage Plugins: ${branch.name}`

    // Show loading state initially
    modalContent.innerHTML = `
      <div class="plugin-assignment-modal">
        <p class="plugin-loading">Loading plugins...</p>
      </div>
    `

    // Load available plugins
    let availablePlugins = []
    try {
      if (window.puffin?.state?.getClaudePlugins) {
        const result = await window.puffin.state.getClaudePlugins()
        console.log('[PLUGIN-MODAL] getClaudePlugins result:', result)
        if (result.success) {
          availablePlugins = result.plugins || []
        } else {
          console.error('[PLUGIN-MODAL] getClaudePlugins failed:', result.error)
        }
      } else {
        console.error('[PLUGIN-MODAL] window.puffin.state.getClaudePlugins not available')
      }
    } catch (error) {
      console.error('Failed to load plugins:', error)
    }

    // Get currently assigned plugins for this branch
    let assignedPlugins = []
    try {
      if (window.puffin?.state?.getBranchPlugins) {
        const result = await window.puffin.state.getBranchPlugins(branch.id)
        if (result.success) {
          assignedPlugins = result.plugins || []
        }
      }
    } catch (error) {
      console.error('Failed to get branch plugins:', error)
      // Fallback to branch object
      assignedPlugins = branch.assignedPlugins || []
    }

    modalContent.innerHTML = `
      <div class="plugin-assignment-modal">
        <p class="plugin-assignment-description">
          Toggle plugins to assign or unassign them from this branch.
          Changes are saved immediately.
        </p>

        <div id="plugin-assignment-list" class="plugin-assignment-list">
          ${availablePlugins.length === 0 ? `
            <div class="no-plugins-message">
              <span>No plugins available.</span>
              <a href="#" id="go-to-plugins-link">Add plugins in Config tab</a>
            </div>
          ` : availablePlugins.map(plugin => {
            const isAssigned = assignedPlugins.includes(plugin.id)
            return `
              <div class="plugin-assignment-item ${isAssigned ? 'assigned' : ''} ${plugin.enabled === false ? 'disabled' : ''}"
                   data-plugin-id="${plugin.id}">
                <div class="plugin-assignment-toggle">
                  <button class="plugin-toggle-btn ${isAssigned ? 'active' : ''}"
                          data-plugin-id="${plugin.id}"
                          ${plugin.enabled === false ? 'disabled' : ''}
                          aria-pressed="${isAssigned}">
                    <span class="toggle-track">
                      <span class="toggle-thumb"></span>
                    </span>
                  </button>
                </div>
                <div class="plugin-assignment-info">
                  <span class="plugin-icon">${plugin.icon || '🔧'}</span>
                  <div class="plugin-details">
                    <span class="plugin-name">${this.escapeHtml(plugin.name)}</span>
                    <span class="plugin-description">${this.escapeHtml(plugin.description || '')}</span>
                  </div>
                </div>
                ${plugin.enabled === false ? '<span class="plugin-disabled-badge">Disabled</span>' : ''}
              </div>
            `
          }).join('')}
        </div>
      </div>
    `

    modalActions.innerHTML = `
      <button class="btn primary" id="modal-done-btn">Done</button>
    `

    // Bind go-to-plugins link if present
    const goToPluginsLink = document.getElementById('go-to-plugins-link')
    if (goToPluginsLink) {
      goToPluginsLink.addEventListener('click', (e) => {
        e.preventDefault()
        this.intents.hideModal()
        this.intents.switchView('config')
      })
    }

    // Bind toggle buttons for immediate assignment/unassignment
    const toggleBtns = document.querySelectorAll('.plugin-toggle-btn')
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault()
        const pluginId = btn.dataset.pluginId
        const isCurrentlyAssigned = btn.classList.contains('active')
        const itemEl = btn.closest('.plugin-assignment-item')

        // Update UI immediately for responsiveness
        btn.classList.toggle('active')
        btn.setAttribute('aria-pressed', !isCurrentlyAssigned)
        itemEl.classList.toggle('assigned')

        try {
          if (isCurrentlyAssigned) {
            // Unassign plugin
            await window.puffin.state.unassignPluginFromBranch(pluginId, branch.id)
          } else {
            // Assign plugin
            await window.puffin.state.assignPluginToBranch(pluginId, branch.id)
          }
        } catch (error) {
          console.error('Failed to toggle plugin assignment:', error)
          // Revert UI on error
          btn.classList.toggle('active')
          btn.setAttribute('aria-pressed', isCurrentlyAssigned)
          itemEl.classList.toggle('assigned')
        }
      })
    })

    // Bind done button
    document.getElementById('modal-done-btn').addEventListener('click', () => {
      this.intents.hideModal()
    })
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
