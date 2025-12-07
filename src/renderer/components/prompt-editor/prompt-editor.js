/**
 * Prompt Editor Component
 *
 * Handles prompt input and submission to Claude.
 */

export class PromptEditorComponent {
  constructor(intents) {
    this.intents = intents
    this.textarea = null
    this.submitBtn = null
    this.newThreadBtn = null
    this.cancelBtn = null
    this.includeGuiBtn = null
    this.includeGuiDropdown = null
    this.includeGuiMenu = null
    this.includeGui = false
    this.selectedGuiDefinition = null
  }

  /**
   * Initialize the component
   */
  init() {
    this.textarea = document.getElementById('prompt-input')
    this.submitBtn = document.getElementById('submit-prompt-btn')
    this.newThreadBtn = document.getElementById('new-thread-btn')
    this.cancelBtn = document.getElementById('cancel-prompt-btn')
    this.includeGuiBtn = document.getElementById('include-gui-btn')
    this.includeGuiDropdown = document.getElementById('include-gui-dropdown')
    this.includeGuiMenu = document.getElementById('include-gui-menu')

    this.bindEvents()
    this.subscribeToState()
  }

  /**
   * Bind DOM events
   */
  bindEvents() {
    // Prompt input changes
    this.textarea.addEventListener('input', () => {
      this.intents.updatePromptContent(this.textarea.value)
    })

    // Submit button
    this.submitBtn.addEventListener('click', () => {
      this.submit()
    })

    // New thread button
    this.newThreadBtn.addEventListener('click', () => {
      this.submitAsNewThread()
    })

    // Cancel button
    this.cancelBtn.addEventListener('click', () => {
      this.cancel()
    })

    // Include GUI dropdown
    this.includeGuiBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.toggleDropdown()
    })

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.includeGuiDropdown.contains(e.target)) {
        this.closeDropdown()
      }
    })

    // Branch tab clicks
    document.querySelectorAll('.branch-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const branchId = e.target.dataset.branch
        if (branchId) {
          this.intents.selectBranch(branchId)
        }
      })
    })

    // Keyboard shortcuts
    this.textarea.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Enter to submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        this.submit()
      }
    })
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      const { state } = e.detail
      this.render(state.prompt, state.history)
    })
  }

  /**
   * Render component based on state
   */
  render(promptState, historyState) {
    // Update textarea
    if (this.textarea.value !== promptState.content) {
      this.textarea.value = promptState.content
    }

    // Update button states
    this.submitBtn.disabled = !promptState.canSubmit
    this.cancelBtn.classList.toggle('hidden', !promptState.canCancel)

    // Show loading state
    const btnText = this.submitBtn.querySelector('.btn-text')
    const btnLoading = this.submitBtn.querySelector('.btn-loading')
    if (promptState.isProcessing) {
      btnText.classList.add('hidden')
      btnLoading.classList.remove('hidden')
    } else {
      btnText.classList.remove('hidden')
      btnLoading.classList.add('hidden')
    }

    // Disable textarea during processing
    this.textarea.disabled = promptState.isProcessing

    // Update include GUI button state
    this.includeGuiBtn.classList.toggle('active', this.includeGui)

    // Update branch tabs
    this.updateBranchTabs(historyState)

    // Update response area with conversation history
    this.updateResponseArea(historyState, promptState)
  }

  /**
   * Update branch tabs to show active state
   */
  updateBranchTabs(historyState) {
    document.querySelectorAll('.branch-tab').forEach(tab => {
      const branchId = tab.dataset.branch
      tab.classList.toggle('active', branchId === historyState.activeBranch)

      // Update badge with prompt count
      const branch = historyState.branches.find(b => b.id === branchId)
      let badge = tab.querySelector('.badge')
      if (branch && branch.promptCount > 0) {
        if (!badge) {
          badge = document.createElement('span')
          badge.className = 'badge'
          tab.appendChild(badge)
        }
        badge.textContent = branch.promptCount
      } else if (badge) {
        badge.remove()
      }
    })
  }

  /**
   * Update response area with conversation history
   */
  updateResponseArea(historyState, promptState) {
    const responseContent = document.getElementById('response-content')
    if (!responseContent) return

    // Build conversation view
    const prompts = historyState.promptTree || []

    if (prompts.length === 0 && !promptState.isProcessing) {
      responseContent.innerHTML = '<p class="placeholder">Start a conversation in the ' +
        this.getBranchDisplayName(historyState.activeBranch) + ' thread...</p>'
      return
    }

    let html = ''

    // Show conversation history
    for (const prompt of prompts) {
      html += `<div class="conversation-turn">
        <div class="user-message">
          <strong>You:</strong>
          <p>${this.escapeHtml(prompt.content)}</p>
        </div>`

      if (prompt.hasResponse && prompt.response) {
        html += `<div class="assistant-message">
          <strong>Claude:</strong>
          <div class="response-text">${this.formatResponse(prompt.response.content)}</div>
        </div>`
      }
      html += '</div>'
    }

    // Show streaming response
    if (promptState.isProcessing && promptState.streamingResponse) {
      html += `<div class="conversation-turn streaming">
        <div class="assistant-message">
          <strong>Claude:</strong>
          <div class="response-text">${this.formatResponse(promptState.streamingResponse)}<span class="streaming-cursor"></span></div>
        </div>
      </div>`
    }

    responseContent.innerHTML = html

    // Auto-scroll to bottom
    const responseArea = document.querySelector('.response-area')
    if (responseArea) {
      responseArea.scrollTop = responseArea.scrollHeight
    }
  }

  /**
   * Get display name for branch
   */
  getBranchDisplayName(branchId) {
    const names = {
      specifications: 'Specifications',
      architecture: 'Architecture',
      ui: 'UI',
      backend: 'Backend',
      deployment: 'Deployment'
    }
    return names[branchId] || branchId
  }

  /**
   * Format response content (basic markdown-like formatting)
   */
  formatResponse(content) {
    if (!content) return ''
    return this.escapeHtml(content)
      .replace(/\n/g, '<br>')
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
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
   * Submit the prompt
   */
  async submit() {
    const content = this.textarea.value.trim()
    if (!content) return

    // Get current state from window
    const state = window.puffinApp?.state
    if (!state) return

    // Get parentId only if the active prompt is in the current branch
    let parentId = null
    if (state.history.activePromptId) {
      // Check if activePromptId belongs to the current branch's prompt tree
      const isInCurrentBranch = state.history.promptTree?.some(
        p => p.id === state.history.activePromptId
      )
      if (isInCurrentBranch) {
        parentId = state.history.activePromptId
      }
    }

    // Build submission data
    const data = {
      branchId: state.history.activeBranch,
      parentId: parentId,
      content: content
    }

    // Submit to SAM
    this.intents.submitPrompt(data)

    // Submit to Claude via IPC
    if (window.puffin) {
      // Build history context from the branch
      const branch = state.history.branches.find(b => b.id === state.history.activeBranch)
      const history = this.buildHistoryContext(state)

      // Get session ID to resume conversation (if continuing in same branch)
      const sessionId = this.getLastSessionId(state)

      // Get GUI description if included
      let guiDescription = null
      if (this.includeGui) {
        if (this.selectedGuiDefinition) {
          // Use the selected saved definition
          guiDescription = this.buildGuiDescription(this.selectedGuiDefinition.elements)
        } else if (state.designer.hasElements) {
          // Fallback to current designer elements
          guiDescription = this.buildGuiDescription(state.designer.elements)
        }
      }

      window.puffin.claude.submit({
        prompt: content,
        branchId: state.history.activeBranch,
        sessionId: sessionId, // Resume previous session for conversation continuity
        project: state.config ? {
          name: state.config.name,
          description: state.config.description,
          assumptions: state.config.assumptions,
          technicalArchitecture: state.config.technicalArchitecture,
          dataModel: state.config.dataModel,
          options: state.config.options,
          architecture: state.architecture
        } : null,
        history: history,
        guiDescription: guiDescription,
        model: 'claude-sonnet-4-20250514'
      })
    }
  }

  /**
   * Submit the prompt as a new thread (no parent, no session resume)
   */
  async submitAsNewThread() {
    const content = this.textarea.value.trim()
    if (!content) return

    // Get current state from window
    const state = window.puffinApp?.state
    if (!state) return

    // Build submission data with no parent (new thread)
    const data = {
      branchId: state.history.activeBranch,
      parentId: null, // Always null for new thread
      content: content
    }

    // Submit to SAM
    this.intents.submitPrompt(data)

    // Submit to Claude via IPC - no session resume for new thread
    if (window.puffin) {
      // Get GUI description if included
      let guiDescription = null
      if (this.includeGui) {
        if (this.selectedGuiDefinition) {
          guiDescription = this.buildGuiDescription(this.selectedGuiDefinition.elements)
        } else if (state.designer.hasElements) {
          guiDescription = this.buildGuiDescription(state.designer.elements)
        }
      }

      window.puffin.claude.submit({
        prompt: content,
        branchId: state.history.activeBranch,
        sessionId: null, // No session resume - fresh conversation
        project: state.config ? {
          name: state.config.name,
          description: state.config.description,
          assumptions: state.config.assumptions,
          technicalArchitecture: state.config.technicalArchitecture,
          dataModel: state.config.dataModel,
          options: state.config.options,
          architecture: state.architecture
        } : null,
        history: [], // No history for new thread
        guiDescription: guiDescription,
        model: 'claude-sonnet-4-20250514'
      })
    }
  }

  /**
   * Cancel the current request
   */
  cancel() {
    this.intents.cancelPrompt()
    if (window.puffin) {
      window.puffin.claude.cancel()
    }
  }

  /**
   * Toggle the Include GUI dropdown
   */
  async toggleDropdown() {
    const isOpen = this.includeGuiDropdown.classList.contains('open')
    if (isOpen) {
      this.closeDropdown()
    } else {
      await this.openDropdown()
    }
  }

  /**
   * Open the dropdown and populate with options
   */
  async openDropdown() {
    // Fetch saved definitions
    let definitions = []
    try {
      const result = await window.puffin.state.listGuiDefinitions()
      if (result.success) {
        definitions = result.definitions || []
      }
    } catch (error) {
      console.error('Failed to load GUI definitions:', error)
    }

    // Check if current designer has elements
    const state = window.puffinApp?.state
    const hasCurrentDesign = state?.designer?.hasElements

    // Build menu HTML
    let menuHtml = ''

    // Clear selection option (if something is selected)
    if (this.includeGui) {
      menuHtml += `<div class="dropdown-item clear-selection" data-action="clear">
        <span class="item-icon">✕</span>
        <span class="item-label">Clear Selection</span>
      </div>
      <div class="dropdown-divider"></div>`
    }

    // Current design option
    if (hasCurrentDesign) {
      const isSelected = this.includeGui && !this.selectedGuiDefinition?.filename
      menuHtml += `<div class="dropdown-item ${isSelected ? 'selected' : ''}" data-action="current">
        <span class="item-icon">📐</span>
        <span class="item-label">Use Current Design</span>
        <span class="item-meta">${state.designer.elementCount} elements</span>
      </div>`
    }

    // Saved definitions
    if (definitions.length > 0) {
      if (hasCurrentDesign) {
        menuHtml += '<div class="dropdown-divider"></div>'
      }
      definitions.forEach(def => {
        const isSelected = this.selectedGuiDefinition?.filename === def.filename
        menuHtml += `<div class="dropdown-item ${isSelected ? 'selected' : ''}" data-action="load" data-filename="${this.escapeHtml(def.filename)}">
          <span class="item-icon">📋</span>
          <span class="item-label">${this.escapeHtml(def.name)}</span>
        </div>`
      })
    }

    // Empty state
    if (!hasCurrentDesign && definitions.length === 0) {
      menuHtml = `<div class="dropdown-item disabled">
        <span class="item-label">No designs available</span>
      </div>`
    }

    this.includeGuiMenu.innerHTML = menuHtml
    this.includeGuiDropdown.classList.add('open')

    // Bind click events
    this.includeGuiMenu.querySelectorAll('.dropdown-item:not(.disabled)').forEach(item => {
      item.addEventListener('click', (e) => this.handleDropdownSelect(e, item))
    })
  }

  /**
   * Close the dropdown
   */
  closeDropdown() {
    this.includeGuiDropdown.classList.remove('open')
  }

  /**
   * Handle dropdown item selection
   */
  async handleDropdownSelect(e, item) {
    e.stopPropagation()
    const action = item.dataset.action

    switch (action) {
      case 'clear':
        this.clearGuiSelection()
        break
      case 'current':
        const state = window.puffinApp?.state
        this.setSelectedGuiDefinition({
          elements: state.designer.flatElements
        })
        break
      case 'load':
        const filename = item.dataset.filename
        try {
          const result = await window.puffin.state.loadGuiDefinition(filename)
          if (result.success) {
            this.setSelectedGuiDefinition({
              ...result.definition,
              filename: filename
            })
          }
        } catch (error) {
          console.error('Failed to load definition:', error)
        }
        break
    }

    this.closeDropdown()
  }

  /**
   * Set the selected GUI definition for inclusion in prompts
   */
  setSelectedGuiDefinition(definition) {
    this.selectedGuiDefinition = definition
    this.includeGui = true
    this.includeGuiBtn.classList.add('active')
    this.updateButtonLabel()
  }

  /**
   * Clear GUI selection
   */
  clearGuiSelection() {
    this.includeGui = false
    this.selectedGuiDefinition = null
    this.includeGuiBtn.classList.remove('active')
    this.updateButtonLabel()
  }

  /**
   * Update button label to show selection
   */
  updateButtonLabel() {
    if (this.includeGui && this.selectedGuiDefinition) {
      const name = this.selectedGuiDefinition.name || 'Current Design'
      this.includeGuiBtn.textContent = `GUI: ${name} ▾`
    } else {
      this.includeGuiBtn.textContent = 'Include GUI ▾'
    }
  }

  /**
   * Build history context for Claude
   */
  buildHistoryContext(state) {
    // Get prompts from active branch up to the active prompt
    const activeBranch = state.history.branches.find(b => b.id === state.history.activeBranch)
    if (!activeBranch) return []

    // For now, include last few prompts for context
    // Could be enhanced to follow the tree path to activePromptId
    const prompts = state.history.promptTree
      .slice(-5) // Last 5 prompts for context
      .map(p => ({
        content: p.content,
        response: p.hasResponse ? {
          content: state.history.selectedPrompt?.id === p.id
            ? state.history.selectedPrompt.response?.content
            : null
        } : null
      }))
      .filter(p => p.content)

    return prompts
  }

  /**
   * Get the session ID from the last prompt in the branch to resume conversation
   */
  getLastSessionId(state) {
    const promptTree = state.history.promptTree || []
    if (promptTree.length === 0) return null

    // Find the last prompt that has a response with a sessionId
    for (let i = promptTree.length - 1; i >= 0; i--) {
      const prompt = promptTree[i]
      if (prompt.response?.sessionId) {
        return prompt.response.sessionId
      }
    }
    return null
  }

  /**
   * Build GUI description from elements
   */
  buildGuiDescription(elements) {
    if (!elements || elements.length === 0) return null

    const lines = ['## UI Layout\n']

    const describeElement = (element, indent = 0) => {
      const prefix = '  '.repeat(indent)
      let desc = `${prefix}- **${element.type}**`

      if (element.properties) {
        const props = element.properties
        if (props.label) desc += `: "${props.label}"`
        if (props.placeholder) desc += ` (placeholder: "${props.placeholder}")`

        const dims = []
        if (props.width) dims.push(`${props.width}px wide`)
        if (props.height) dims.push(`${props.height}px tall`)
        if (dims.length) desc += ` [${dims.join(', ')}]`
      }

      lines.push(desc)

      if (element.children && element.children.length > 0) {
        element.children.forEach(child => describeElement(child, indent + 1))
      }
    }

    elements.forEach(el => describeElement(el))

    return lines.join('\n')
  }

  /**
   * Cleanup
   */
  destroy() {
    // Remove event listeners if needed
  }
}
