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
    this.cancelBtn = null
    this.includeGuiBtn = null
    this.includeGui = false
  }

  /**
   * Initialize the component
   */
  init() {
    this.textarea = document.getElementById('prompt-input')
    this.submitBtn = document.getElementById('submit-prompt-btn')
    this.cancelBtn = document.getElementById('cancel-prompt-btn')
    this.includeGuiBtn = document.getElementById('include-gui-btn')

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

    // Cancel button
    this.cancelBtn.addEventListener('click', () => {
      this.cancel()
    })

    // Include GUI toggle
    this.includeGuiBtn.addEventListener('click', () => {
      this.toggleIncludeGui()
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

    // Build submission data
    const data = {
      branchId: state.history.activeBranch,
      parentId: state.history.activePromptId,
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
      if (this.includeGui && state.designer.hasElements) {
        guiDescription = this.buildGuiDescription(state.designer.elements)
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
   * Cancel the current request
   */
  cancel() {
    this.intents.cancelPrompt()
    if (window.puffin) {
      window.puffin.claude.cancel()
    }
  }

  /**
   * Toggle include GUI in prompt
   */
  toggleIncludeGui() {
    this.includeGui = !this.includeGui
    this.includeGuiBtn.classList.toggle('active', this.includeGui)
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
