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
    this.deriveStoriesCheckbox = null
    this.deriveUserStories = false
    this.modelSelect = null
    this.defaultModel = 'sonnet' // Will be updated from project config
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
    this.deriveStoriesCheckbox = document.getElementById('derive-stories-checkbox')
    this.modelSelect = document.getElementById('thread-model')

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

    // Derive user stories checkbox
    this.deriveStoriesCheckbox.addEventListener('change', () => {
      this.deriveUserStories = this.deriveStoriesCheckbox.checked
    })

    // Model selector - track when user manually changes it
    if (this.modelSelect) {
      this.modelSelect.addEventListener('change', () => {
        this.modelSelect.dataset.userChanged = 'true'
      })
    }

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
      // Update default model from config if changed
      if (state.config?.defaultModel && state.config.defaultModel !== this.defaultModel) {
        this.defaultModel = state.config.defaultModel
        // Update the select if user hasn't manually changed it
        if (this.modelSelect && !this.modelSelect.dataset.userChanged) {
          this.modelSelect.value = this.defaultModel
        }
      }
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

    // Calculate context window boundaries
    const contextWindowSize = 5
    const activePromptId = historyState.activePromptId
    let endIndex = prompts.length
    if (activePromptId) {
      const activeIdx = prompts.findIndex(p => p.id === activePromptId)
      if (activeIdx !== -1) endIndex = activeIdx + 1
    }
    const startIndex = Math.max(0, endIndex - contextWindowSize)

    let html = ''

    // Show context indicator if there are prompts outside the window
    if (startIndex > 0) {
      html += `<div class="context-indicator">
        <span class="context-divider"></span>
        <span class="context-label">${startIndex} earlier message${startIndex > 1 ? 's' : ''} not in context</span>
        <span class="context-divider"></span>
      </div>`
    }

    // Show conversation history
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i]
      const isInContext = i >= startIndex && i < endIndex
      const isActive = prompt.id === activePromptId

      html += `<div class="conversation-turn${isInContext ? ' in-context' : ' out-of-context'}${isActive ? ' active-prompt' : ''}" data-prompt-id="${prompt.id}">
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

      // Add context window start indicator
      if (i === startIndex - 1 && startIndex > 0) {
        html += `<div class="context-indicator context-start">
          <span class="context-divider"></span>
          <span class="context-label">Context window starts here (${endIndex - startIndex} messages)</span>
          <span class="context-divider"></span>
        </div>`
      }
    }

    // Show streaming response
    if (promptState.isProcessing && promptState.streamingResponse) {
      html += `<div class="conversation-turn streaming in-context">
        <div class="assistant-message">
          <strong>Claude:</strong>
          <div class="response-text">${this.formatResponse(promptState.streamingResponse)}<span class="streaming-cursor"></span></div>
        </div>
      </div>`
    }

    responseContent.innerHTML = html

    // Add click handlers for selecting prompts (to start sub-threads)
    responseContent.querySelectorAll('.conversation-turn[data-prompt-id]').forEach(turn => {
      turn.addEventListener('click', () => {
        const promptId = turn.dataset.promptId
        if (promptId && window.puffinApp?.intents?.selectPrompt) {
          window.puffinApp.intents.selectPrompt(promptId)
        }
      })
    })

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

    // Check if we should derive user stories first
    if (this.deriveUserStories) {
      this.deriveStories(content, state)
      return
    }

    // If branch is empty, behave the same as "Send as New Thread"
    if (state.history.isEmpty) {
      this.submitAsNewThread()
      return
    }

    // Get parentId: find the last prompt in the thread containing the active prompt.
    // This ensures "Send" continues from the end of the thread, not from the selected turn.
    let parentId = null
    if (state.history.activePromptId) {
      // Check if activePromptId belongs to the current branch
      const rawBranch = state.history.raw?.branches?.[state.history.activeBranch]
      if (rawBranch?.prompts) {
        const isInCurrentBranch = rawBranch.prompts.some(
          p => p.id === state.history.activePromptId
        )
        if (isInCurrentBranch) {
          // Find the last prompt in this thread lineage
          parentId = this.findLastPromptInThread(state.history.activePromptId, rawBranch.prompts)
        }
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

      // Get relevant user stories for this branch
      const userStories = this.getRelevantUserStories(state)

      // When resuming a session, Claude CLI already has the conversation history
      // server-side. We only need to send our context (project, stories, GUI).
      // Sending duplicate history would be redundant and consume tokens.
      const isResumingSession = !!sessionId

      console.log('[CONTEXT-DEBUG] Submit mode:', isResumingSession ? 'RESUME session' : 'NEW conversation')

      window.puffin.claude.submit({
        prompt: content,
        branchId: state.history.activeBranch,
        sessionId: sessionId,
        // Only send project context for new conversations or when it's changed
        // For resumed sessions, Claude already has the context
        project: !isResumingSession && state.config ? {
          name: state.config.name,
          description: state.config.description,
          assumptions: state.config.assumptions,
          technicalArchitecture: state.config.technicalArchitecture,
          dataModel: state.config.dataModel,
          options: state.config.options,
          architecture: state.architecture
        } : null,
        // User stories are always relevant - they may have been updated
        userStories: userStories,
        guiDescription: guiDescription,
        model: this.modelSelect?.value || this.defaultModel || 'sonnet'
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

    // Check if we should derive user stories first
    if (this.deriveUserStories) {
      this.deriveStories(content, state)
      return
    }

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

      // Get relevant user stories for this branch
      const userStories = this.getRelevantUserStories(state)

      console.log('[CONTEXT-DEBUG] Submit mode: NEW thread (fresh conversation)')

      window.puffin.claude.submit({
        prompt: content,
        branchId: state.history.activeBranch,
        sessionId: null, // No session resume - fresh conversation
        // New thread gets full project context
        project: state.config ? {
          name: state.config.name,
          description: state.config.description,
          assumptions: state.config.assumptions,
          technicalArchitecture: state.config.technicalArchitecture,
          dataModel: state.config.dataModel,
          options: state.config.options,
          architecture: state.architecture
        } : null,
        userStories: userStories,
        guiDescription: guiDescription,
        model: this.modelSelect?.value || this.defaultModel || 'sonnet'
      })

      // Reset userChanged flag after submitting a new thread
      if (this.modelSelect) {
        delete this.modelSelect.dataset.userChanged
      }
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
   * Returns the last N prompts leading up to the active prompt position,
   * including full response content for each.
   */
  buildHistoryContext(state) {
    const activeBranch = state.history.branches.find(b => b.id === state.history.activeBranch)
    if (!activeBranch) return []

    // Get raw prompts from the branch (these have full response content)
    const rawBranch = state.history.raw?.branches?.[state.history.activeBranch]
    if (!rawBranch || !rawBranch.prompts) return []

    // Find the position of the active prompt (or use end of list)
    const activePromptId = state.history.activePromptId
    let endIndex = rawBranch.prompts.length

    if (activePromptId) {
      const activeIndex = rawBranch.prompts.findIndex(p => p.id === activePromptId)
      if (activeIndex !== -1) {
        endIndex = activeIndex + 1 // Include the active prompt
      }
    }

    // Get the context window: last 5 prompts up to (and including) the active prompt
    const contextWindowSize = 5
    const startIndex = Math.max(0, endIndex - contextWindowSize)

    const contextPrompts = rawBranch.prompts
      .slice(startIndex, endIndex)
      .map(p => ({
        content: p.content,
        response: p.response ? {
          content: p.response.content || null
        } : null
      }))
      .filter(p => p.content)

    console.log('[CONTEXT-DEBUG] Building history context:', {
      branchId: state.history.activeBranch,
      activePromptId,
      totalPrompts: rawBranch.prompts.length,
      contextWindow: `${startIndex}-${endIndex}`,
      promptsIncluded: contextPrompts.length,
      withResponses: contextPrompts.filter(p => p.response?.content).length
    })

    return contextPrompts
  }

  /**
   * Find the last prompt in the thread lineage starting from the given promptId.
   * Traverses down through children until reaching a leaf (prompt with no children).
   * This is used when pressing "Send" to continue from the end of the thread,
   * regardless of which turn the user has selected.
   */
  findLastPromptInThread(promptId, prompts) {
    if (!promptId || !prompts || prompts.length === 0) return promptId

    // Build a map of children for each prompt
    const childrenMap = new Map()
    prompts.forEach(p => {
      if (p.parentId) {
        if (!childrenMap.has(p.parentId)) {
          childrenMap.set(p.parentId, [])
        }
        childrenMap.get(p.parentId).push(p)
      }
    })

    // Traverse down from the given prompt to find the last descendant
    let lastPromptId = promptId
    while (childrenMap.has(lastPromptId)) {
      const children = childrenMap.get(lastPromptId)
      // If multiple branches, take the most recent one by timestamp
      children.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      lastPromptId = children[0].id
    }

    console.log('[THREAD-DEBUG] findLastPromptInThread:', { from: promptId, to: lastPromptId })
    return lastPromptId
  }

  /**
   * Get the session ID from the active prompt to resume conversation.
   * This ensures we resume from the correct point in the thread.
   * Now uses findLastPromptInThread to get the session from the thread's last prompt.
   */
  getLastSessionId(state) {
    const rawBranch = state.history.raw?.branches?.[state.history.activeBranch]
    if (!rawBranch || !rawBranch.prompts || rawBranch.prompts.length === 0) return null

    // Collect all sessions that have hit "Prompt is too long" - these are dead sessions
    const deadSessions = new Set()
    for (const prompt of rawBranch.prompts) {
      if (prompt.response?.content === 'Prompt is too long' && prompt.response?.sessionId) {
        deadSessions.add(prompt.response.sessionId)
      }
    }

    if (deadSessions.size > 0) {
      console.log('[CONTEXT-DEBUG] Found dead sessions (hit context limit):', deadSessions.size)
    }

    // If there's an active prompt, find the last prompt in that thread
    const activePromptId = state.history.activePromptId
    if (activePromptId) {
      const lastPromptId = this.findLastPromptInThread(activePromptId, rawBranch.prompts)
      const lastPrompt = rawBranch.prompts.find(p => p.id === lastPromptId)
      if (lastPrompt?.response?.sessionId) {
        // Skip if this session is dead
        if (deadSessions.has(lastPrompt.response.sessionId)) {
          console.log('[CONTEXT-DEBUG] Thread last prompt session is dead - looking for alternative')
        } else {
          console.log('[CONTEXT-DEBUG] Using session from thread last prompt:', lastPromptId)
          return lastPrompt.response.sessionId
        }
      }
    }

    // Fallback: find the last prompt with a sessionId that isn't dead
    for (let i = rawBranch.prompts.length - 1; i >= 0; i--) {
      const prompt = rawBranch.prompts[i]
      if (prompt.response?.sessionId && !deadSessions.has(prompt.response.sessionId)) {
        console.log('[CONTEXT-DEBUG] Using session from last valid prompt:', prompt.id)
        return prompt.response.sessionId
      }
    }

    console.log('[CONTEXT-DEBUG] No valid sessions found - starting fresh conversation')
    return null
  }

  /**
   * Get user stories relevant to the current branch.
   * Only includes stories that are actively being worked on to avoid context bloat.
   * Excludes completed stories.
   * Limited to 10 stories max to prevent "Prompt is too long" errors.
   */
  getRelevantUserStories(state) {
    const userStories = state.userStories || []
    if (userStories.length === 0) return null

    const branchId = state.history.activeBranch

    // Only include stories that are actively being worked on
    // Exclude completed stories - they don't need to be in context
    const relevantStories = userStories.filter(story => {
      // Never include completed stories
      if (story.status === 'completed') return false
      // Include if story is actively in progress
      if (story.status === 'in-progress') return true
      // Include if story is for this specific branch AND has a linked thread (being worked on)
      if (story.branchId === branchId && story.threadId) return true
      return false
    })

    // Limit to 10 most recent stories to prevent context bloat
    const limitedStories = relevantStories.slice(-10)

    if (limitedStories.length === 0) return null

    console.log('[CONTEXT-DEBUG] Including user stories:', {
      branchId,
      totalStories: userStories.length,
      relevantStories: relevantStories.length,
      limited: limitedStories.length
    })

    return limitedStories
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
   * Derive user stories from the prompt before implementation
   */
  async deriveStories(content, state) {
    console.log('[DERIVE-STORIES] Starting story derivation')
    console.log('[DERIVE-STORIES] Content:', content?.substring(0, 100))
    console.log('[DERIVE-STORIES] window.puffin:', !!window.puffin)
    console.log('[DERIVE-STORIES] window.puffin.claude.deriveStories:', !!window.puffin?.claude?.deriveStories)

    // Dispatch action to show derivation is in progress
    this.intents.deriveUserStories({
      branchId: state.history.activeBranch,
      content: content
    })

    // Reset the checkbox
    this.deriveUserStories = false
    this.deriveStoriesCheckbox.checked = false

    // Call the IPC to derive stories
    if (window.puffin && window.puffin.claude.deriveStories) {
      console.log('[DERIVE-STORIES] Calling IPC deriveStories...')
      window.puffin.claude.deriveStories({
        prompt: content,
        branchId: state.history.activeBranch,
        project: state.config ? {
          name: state.config.name,
          description: state.config.description
        } : null
      })
      console.log('[DERIVE-STORIES] IPC call sent')
    } else {
      console.error('[DERIVE-STORIES] IPC not available!')
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    // Remove event listeners if needed
  }
}
