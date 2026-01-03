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
    this.selectedGuiDefinitions = [] // Array of selected GUI definitions (multi-select)
    this.useCurrentDesign = false // Track if current design is selected
    this.deriveStoriesCheckbox = null
    this.deriveUserStories = false
    this.modelSelect = null
    this.defaultModel = 'optus' // Will be updated from project config
    // Input type tracking (US-3)
    this.inputTypeGroup = null
    this.inputTypeSelect = null
    this.currentImplementationJourneyIds = [] // Active journey IDs for current thread
    // Handoff button
    this.handoffReadyBtn = null
    // Current handoff context (to be injected in next prompt)
    this.pendingHandoff = null
    // Design documents dropdown
    this.includeDocsBtn = null
    this.includeDocsDropdown = null
    this.includeDocsMenu = null
    this.includeDocs = false
    this.selectedDocuments = [] // Array of selected document filenames
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
    // Input type tracking (US-3)
    this.inputTypeGroup = document.getElementById('input-type-group')
    this.inputTypeSelect = document.getElementById('input-type')
    // Handoff button
    this.handoffReadyBtn = document.getElementById('handoff-ready-btn')
    // Design documents dropdown
    this.includeDocsBtn = document.getElementById('include-docs-btn')
    this.includeDocsDropdown = document.getElementById('include-docs-dropdown')
    this.includeDocsMenu = document.getElementById('include-docs-menu')

    this.bindEvents()
    this.subscribeToState()
  }

  /**
   * Bind DOM events
   */
  bindEvents() {
    // Note: We intentionally don't track every keystroke through SAM.
    // The textarea value is read directly when submitting to avoid
    // performance issues from dispatching actions on every input event.

    // Update submit button state locally when user types
    this.textarea.addEventListener('input', () => {
      const hasContent = this.textarea.value.trim().length > 0
      this.submitBtn.disabled = !hasContent
    })

    // Submit button
    this.submitBtn.addEventListener('click', () => {
      this.submit()
    })

    // New thread button - clears and starts fresh
    this.newThreadBtn.addEventListener('click', () => {
      this.createNewThread()
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

    // Include Docs dropdown
    if (this.includeDocsBtn) {
      this.includeDocsBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.toggleDocsDropdown()
      })
    }

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

    // Handoff Ready button
    if (this.handoffReadyBtn) {
      this.handoffReadyBtn.addEventListener('click', () => {
        console.log('[HANDOFF] Handoff Ready button clicked')
        this.openHandoffReview()
      })
    }

    // Listen for handoff received event
    document.addEventListener('handoff-received', (e) => {
      console.log('[HANDOFF] Handoff received:', e.detail)
      this.handleHandoffReceived(e.detail)
    })

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.includeGuiDropdown.contains(e.target)) {
        this.closeDropdown()
      }
      if (this.includeDocsDropdown && !this.includeDocsDropdown.contains(e.target)) {
        this.closeDocsDropdown()
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
    this.wasProcessing = false

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

      // Clear textarea when processing completes (response received)
      if (this.wasProcessing && !state.prompt.isProcessing) {
        this.textarea.value = ''
        this.submitBtn.disabled = true
      }
      this.wasProcessing = state.prompt.isProcessing

      this.render(state.prompt, state.history, state.storyGenerations, state.storyDerivation)
    })
  }

  /**
   * Render component based on state
   */
  render(promptState, historyState, storyGenerations, storyDerivation) {
    // DEBUG: Track textarea disabled state
    const wasDisabled = this.textarea.disabled

    // Note: We don't sync textarea value from SAM state.
    // The textarea is the source of truth for its own content.
    // This avoids performance issues from tracking every keystroke.

    // Check if story derivation is in progress
    const isDerivingStories = storyDerivation?.status === 'deriving'
    const isProcessing = promptState.isProcessing || isDerivingStories

    // Update button states - canSubmit is based on local textarea content
    const hasContent = this.textarea.value.trim().length > 0
    this.submitBtn.disabled = isProcessing || !hasContent
    this.cancelBtn.classList.toggle('hidden', !promptState.canCancel)

    // Show loading state
    const btnText = this.submitBtn.querySelector('.btn-text')
    const btnLoading = this.submitBtn.querySelector('.btn-loading')
    if (isProcessing) {
      btnText.classList.add('hidden')
      btnLoading.classList.remove('hidden')
    } else {
      btnText.classList.remove('hidden')
      btnLoading.classList.add('hidden')
    }

    // Note: Derivation status is now shown in the modal with a prominent loading state
    // The inline status bar is no longer needed since the modal opens immediately
    // this.updateDerivationStatus(isDerivingStories)

    // Disable textarea during processing
    this.textarea.disabled = isProcessing

    // DEBUG: Log when textarea disabled state changes
    if (wasDisabled !== this.textarea.disabled) {
      console.log('[PROMPT-EDITOR-DEBUG] Textarea disabled state changed:', {
        wasDisabled,
        nowDisabled: this.textarea.disabled,
        isProcessing,
        isDerivingStories,
        promptStateKeys: Object.keys(promptState),
        stack: new Error().stack.split('\n').slice(1, 5).join('\n')
      })
    }

    // DEBUG: Warn if textarea is disabled but no processing is happening
    if (this.textarea.disabled && !isProcessing) {
      console.warn('[PROMPT-EDITOR-DEBUG] ANOMALY: Textarea disabled but isProcessing=false!', {
        promptState,
        isDerivingStories,
        textareaDisabled: this.textarea.disabled
      })
    }

    // Update include GUI button state
    this.includeGuiBtn.classList.toggle('active', this.includeGui)

    // Update branch tabs
    this.updateBranchTabs(historyState)

    // Update response area with conversation history
    this.updateResponseArea(historyState, promptState)

    // Show/hide input type dropdown based on implementation thread context (US-3)
    this.updateInputTypeVisibility(historyState, storyGenerations)
  }

  /**
   * Show input type dropdown only when in an implementation thread
   */
  updateInputTypeVisibility(historyState, storyGenerations) {
    if (!this.inputTypeGroup) return

    // Check if current active prompt is part of an implementation thread
    const activePromptId = historyState.activePromptId
    const activeBranch = historyState.activeBranch
    const rawBranch = historyState.raw?.branches?.[activeBranch]

    let isImplementationThread = false
    this.currentImplementationJourneyIds = []

    if (activePromptId && rawBranch?.prompts) {
      // Find the active prompt and check if it or any parent has storyIds
      const storyIds = this.findStoryIdsForPromptId(activePromptId, rawBranch.prompts)
      if (storyIds && storyIds.length > 0) {
        isImplementationThread = true

        // Find active journeys for these stories
        if (storyGenerations?.implementation_journeys) {
          this.currentImplementationJourneyIds = storyGenerations.implementation_journeys
            .filter(j => storyIds.includes(j.story_id) && j.status === 'pending')
            .map(j => j.id)
        }
      }
    }

    // Toggle visibility
    this.inputTypeGroup.classList.toggle('hidden', !isImplementationThread)
  }

  /**
   * Find storyIds for a prompt by traversing parent chain (client-side version)
   */
  findStoryIdsForPromptId(promptId, prompts) {
    const prompt = prompts.find(p => p.id === promptId)
    if (!prompt) return null

    // Check if this prompt has storyIds directly
    if (prompt.storyIds && prompt.storyIds.length > 0) {
      return prompt.storyIds
    }
    // If it has a parent, traverse up the chain
    if (prompt.parentId) {
      return this.findStoryIdsForPromptId(prompt.parentId, prompts)
    }
    return null
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
          <div class="prompt-text">${this.formatMarkdown(prompt.content)}</div>
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
   * Format markdown content for display
   * Renders common markdown syntax to HTML
   */
  formatMarkdown(content) {
    if (!content) return ''

    // Use marked.js if available for full markdown support
    if (window.marked) {
      try {
        return window.marked.parse(content)
      } catch (e) {
        console.warn('Marked.js parsing failed, falling back to basic formatting:', e)
      }
    }

    // Comprehensive markdown parsing fallback
    let html = this.escapeHtml(content)

    // Code blocks (must be before inline code)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="language-${lang}">${code}</code></pre>`
    })

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

    // Horizontal rules (---, ***, ___)
    html = html.replace(/^[-*_]{3,}\s*$/gm, '<hr>')

    // Headers (must be before bold/italic to avoid conflicts)
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>')
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>')
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>')

    // Bold (using non-greedy match)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')

    // Unordered lists
    html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')

    // Numbered lists
    html = html.replace(/^\s*\d+\.\s+(.*)$/gm, '<li>$1</li>')

    // Wrap consecutive list items in ul/ol
    html = html.replace(/(<li>.*<\/li>)\n(?=<li>)/g, '$1')
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')

    // Double newlines become paragraph breaks
    html = html.replace(/\n\n/g, '</p><p>')

    // Single newlines become line breaks
    html = html.replace(/\n/g, '<br>')

    // Wrap in paragraph
    html = `<p>${html}</p>`

    // Clean up empty paragraphs and fix block element wrapping
    html = html.replace(/<p>\s*<\/p>/g, '')
    html = html.replace(/<p>(<h[1-6]>)/g, '$1')
    html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1')
    html = html.replace(/<p>(<pre>)/g, '$1')
    html = html.replace(/(<\/pre>)<\/p>/g, '$1')
    html = html.replace(/<p>(<ul>)/g, '$1')
    html = html.replace(/(<\/ul>)<\/p>/g, '$1')
    html = html.replace(/<p>(<hr>)/g, '$1')
    html = html.replace(/(<hr>)<\/p>/g, '$1')
    html = html.replace(/<p><br>/g, '<p>')
    html = html.replace(/<br><\/p>/g, '</p>')

    // Clean up breaks around block elements
    html = html.replace(/<\/h([1-6])><br>/g, '</h$1>')
    html = html.replace(/<br><h([1-6])>/g, '<h$1>')
    html = html.replace(/<\/ul><br>/g, '</ul>')
    html = html.replace(/<br><ul>/g, '<ul>')
    html = html.replace(/<\/pre><br>/g, '</pre>')
    html = html.replace(/<br><pre>/g, '<pre>')
    html = html.replace(/<hr><br>/g, '<hr>')
    html = html.replace(/<br><hr>/g, '<hr>')

    return html
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

    // CRITICAL: Check if a CLI process is already running
    if (window.puffin?.claude?.isRunning) {
      const isRunning = await window.puffin.claude.isRunning()
      if (isRunning) {
        console.error('[PROMPT-EDITOR] Cannot submit: CLI process already running')
        window.puffinApp?.showToast?.({
          type: 'error',
          title: 'Process Already Running',
          message: 'A Claude process is already running. Please wait for it to complete.',
          duration: 5000
        })
        return
      }
    }

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

    // Record input type for implementation tracking (US-3)
    if (this.currentImplementationJourneyIds.length > 0 && this.inputTypeSelect) {
      const inputType = this.inputTypeSelect.value || 'technical'
      const contentSummary = content.substring(0, 200) + (content.length > 200 ? '...' : '')

      // Get current turn count (will be incremented when response arrives)
      const journeys = state.storyGenerations?.implementation_journeys || []

      this.currentImplementationJourneyIds.forEach(journeyId => {
        const journey = journeys.find(j => j.id === journeyId)
        const turnNumber = (journey?.turn_count || 0) + 1 // Next turn number

        this.intents.addImplementationInput(journeyId, {
          turn_number: turnNumber,
          type: inputType,
          content_summary: contentSummary
        })
      })

      // Reset to default
      this.inputTypeSelect.value = 'technical'
    }

    // Submit to Claude via IPC
    if (window.puffin) {
      // Get handoff context if present - must check BEFORE determining session
      const handoffContext = this.pendingHandoff ? {
        summary: this.pendingHandoff.summary,
        sourceThreadName: this.pendingHandoff.sourceThreadName,
        sourceBranch: this.pendingHandoff.sourceBranch
      } : null

      // Get session ID to resume conversation (if continuing in same branch)
      // IMPORTANT: If there's a pending handoff, always start a NEW conversation
      // to ensure the handoff context is included in the prompt
      const sessionId = handoffContext ? null : this.getLastSessionId(state)

      if (handoffContext) {
        console.log('[CONTEXT-DEBUG] Handoff present - forcing NEW conversation to include handoff context')
      }

      // Get GUI description if included (supports multiple definitions)
      const guiDescription = this.buildCombinedGuiDescription(state)

      // Get design documents content if any selected
      const docsContent = await this.getSelectedDocumentsContent()

      // Get relevant user stories for this branch
      const userStories = this.getRelevantUserStories(state)

      // When resuming a session, Claude CLI already has the conversation history
      // server-side. We only need to send our context (project, stories, GUI).
      // Sending duplicate history would be redundant and consume tokens.
      const isResumingSession = !!sessionId

      console.log('[CONTEXT-DEBUG] Submit mode:', isResumingSession ? 'RESUME session' : 'NEW conversation')

      if (handoffContext) {
        console.log('[CONTEXT-DEBUG] Including handoff context from:', handoffContext.sourceBranch)
      }

      // Append design documents to prompt if selected
      const finalPrompt = docsContent ? content + docsContent : content

      const selectedModel = this.modelSelect?.value || this.defaultModel || 'sonnet'

      window.puffin.claude.submit({
        prompt: finalPrompt,
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
        // Handoff context from another thread
        handoffContext: handoffContext,
        model: selectedModel,
        maxTurns: 40 // Max turns per request
      })

      // Note: Debug prompt is now captured via onFullPrompt callback from main process
      // This ensures we get the complete prompt with all context

      // Clear pending handoff after submission
      if (this.pendingHandoff) {
        this.clearPendingHandoff()
      }
    }
  }

  /**
   * Create a new thread - clears the prompt and starts fresh
   */
  createNewThread() {
    // Clear the textarea
    this.textarea.value = ''

    // Clear any pending handoff context
    this.pendingHandoff = null

    // Disable submit button until user types
    this.submitBtn.disabled = true

    // Remove handoff banner if present
    this.hideHandoffBanner()

    // Focus the textarea
    this.textarea.focus()

    // Trigger SAM action to clear active prompt selection
    this.intents.selectPrompt(null)
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

    // CRITICAL: Check if a CLI process is already running
    if (window.puffin?.claude?.isRunning) {
      const isRunning = await window.puffin.claude.isRunning()
      if (isRunning) {
        console.error('[PROMPT-EDITOR] Cannot submit new thread: CLI process already running')
        window.puffinApp?.showToast?.({
          type: 'error',
          title: 'Process Already Running',
          message: 'A Claude process is already running. Please wait for it to complete.',
          duration: 5000
        })
        return
      }
    }

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
      // Get GUI description if included (supports multiple definitions)
      const guiDescription = this.buildCombinedGuiDescription(state)

      // Get relevant user stories for this branch
      const userStories = this.getRelevantUserStories(state)

      console.log('[CONTEXT-DEBUG] Submit mode: NEW thread (fresh conversation)')

      const selectedModel = this.modelSelect?.value || this.defaultModel || 'sonnet'

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
        model: selectedModel,
        maxTurns: 40 // Max turns per request
      })

      // Note: Debug prompt is now captured via onFullPrompt callback from main process
      // This ensures we get the complete prompt with all context

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
   * Open the dropdown and populate with options (multi-select)
   * Reads GUI definitions directly from .puffin/gui-definitions/ on each click
   */
  async openDropdown() {
    // Close docs dropdown if open
    this.closeDocsDropdown()

    // Show loading state immediately
    this.includeGuiMenu.innerHTML = `<div class="dropdown-item disabled">
      <span class="item-icon">⏳</span>
      <span class="item-label">Loading designs...</span>
    </div>`
    this.includeGuiDropdown.classList.add('open')

    // Read GUI definitions directly from filesystem
    let definitions = []
    try {
      const result = await window.puffin.state.listGuiDesigns()
      definitions = result?.designs || []
    } catch (err) {
      console.error('[PromptEditor] Failed to list GUI designs:', err)
    }

    // Build menu HTML
    let menuHtml = ''

    if (definitions.length > 0) {
      definitions.forEach(def => {
        const isSelected = this.selectedGuiDefinitions.some(d => d.filename === def.filename)
        menuHtml += `<div class="dropdown-item ${isSelected ? 'selected' : ''}" data-action="toggle" data-filename="${this.escapeHtml(def.filename)}" data-name="${this.escapeHtml(def.name)}">
          <span class="item-checkbox">${isSelected ? '☑' : '☐'}</span>
          <span class="item-label">${this.escapeHtml(def.name)}</span>
        </div>`
      })
    } else {
      menuHtml = `<div class="dropdown-item disabled">No designs found</div>`
    }

    this.includeGuiMenu.innerHTML = menuHtml

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
   * Handle dropdown item selection (multi-select)
   */
  async handleDropdownSelect(e, item) {
    e.stopPropagation()
    const action = item.dataset.action

    switch (action) {
      case 'clear':
        this.clearGuiSelection()
        this.closeDropdown()
        break
      case 'toggle-current':
        this.toggleCurrentDesign()
        // Re-render dropdown to show updated checkboxes
        await this.openDropdown()
        break
      case 'toggle':
        const filename = item.dataset.filename
        const name = item.dataset.name
        await this.toggleGuiDefinitionSelection(filename, name)
        // Re-render dropdown to show updated checkboxes
        await this.openDropdown()
        break
    }
  }

  /**
   * Toggle current design selection
   */
  toggleCurrentDesign() {
    this.useCurrentDesign = !this.useCurrentDesign
    this.updateGuiSelectionState()
  }

  /**
   * Toggle a GUI definition's selection state
   */
  async toggleGuiDefinitionSelection(filename, name) {
    const index = this.selectedGuiDefinitions.findIndex(d => d.filename === filename)
    if (index === -1) {
      // Load full definition (with elements) from .puffin/gui-definitions/
      try {
        const result = await window.puffin.state.loadGuiDesign(filename)
        const definition = result?.design
        if (definition) {
          this.selectedGuiDefinitions.push({
            ...definition,
            filename: filename,
            name: name || definition.name
          })
        }
      } catch (error) {
        console.error('Failed to load definition:', error)
      }
    } else {
      // Remove from selection
      this.selectedGuiDefinitions.splice(index, 1)
    }
    this.updateGuiSelectionState()
  }

  /**
   * Update the overall GUI selection state based on current selections
   */
  updateGuiSelectionState() {
    this.includeGui = this.useCurrentDesign || this.selectedGuiDefinitions.length > 0
    if (this.includeGui) {
      this.includeGuiBtn.classList.add('active')
    } else {
      this.includeGuiBtn.classList.remove('active')
    }
    this.updateButtonLabel()
  }

  /**
   * Clear all GUI selections
   */
  clearGuiSelection() {
    this.includeGui = false
    this.useCurrentDesign = false
    this.selectedGuiDefinitions = []
    this.includeGuiBtn.classList.remove('active')
    this.updateButtonLabel()
  }

  /**
   * Update button label to show selection count
   */
  updateButtonLabel() {
    const count = this.selectedGuiDefinitions.length + (this.useCurrentDesign ? 1 : 0)
    if (count > 0) {
      this.includeGuiBtn.textContent = `GUI (${count}) ▾`
    } else {
      this.includeGuiBtn.textContent = 'Include GUI ▾'
    }
  }

  // ============ Design Documents Dropdown ============

  /**
   * Toggle the Include Docs dropdown
   */
  async toggleDocsDropdown() {
    if (!this.includeDocsDropdown) return
    const isOpen = this.includeDocsDropdown.classList.contains('open')
    if (isOpen) {
      this.closeDocsDropdown()
    } else {
      await this.openDocsDropdown()
    }
  }

  /**
   * Open the docs dropdown and populate with documents from docs/
   */
  async openDocsDropdown() {
    // Close GUI dropdown if open
    this.closeDropdown()

    // Fetch design documents
    let documents = []
    try {
      const result = await window.puffin.state.getDesignDocuments()
      if (result.success) {
        documents = result.documents || []
      }
    } catch (error) {
      console.error('Failed to load design documents:', error)
    }

    // Build menu HTML
    let menuHtml = ''

    // Clear selection option (if something is selected)
    if (this.selectedDocuments.length > 0) {
      menuHtml += `<div class="dropdown-item clear-selection" data-action="clear">
        <span class="item-icon">✕</span>
        <span class="item-label">Clear Selection</span>
      </div>
      <div class="dropdown-divider"></div>`
    }

    // Document list
    if (documents.length > 0) {
      documents.forEach(doc => {
        const isSelected = this.selectedDocuments.includes(doc.filename)
        const displayName = doc.name || doc.filename.replace(/\.md$/, '')
        menuHtml += `<div class="dropdown-item ${isSelected ? 'selected' : ''}" data-action="toggle" data-filename="${this.escapeHtml(doc.filename)}">
          <span class="item-checkbox">${isSelected ? '☑' : '☐'}</span>
          <span class="item-label">${this.escapeHtml(displayName)}</span>
        </div>`
      })
    } else {
      menuHtml = `<div class="dropdown-item disabled">
        <span class="item-label">No documents in docs/</span>
      </div>`
    }

    this.includeDocsMenu.innerHTML = menuHtml
    this.includeDocsDropdown.classList.add('open')

    // Bind click events
    this.includeDocsMenu.querySelectorAll('.dropdown-item:not(.disabled)').forEach(item => {
      item.addEventListener('click', (e) => this.handleDocsDropdownSelect(e, item))
    })
  }

  /**
   * Close the docs dropdown
   */
  closeDocsDropdown() {
    if (this.includeDocsDropdown) {
      this.includeDocsDropdown.classList.remove('open')
    }
  }

  /**
   * Handle docs dropdown item selection
   */
  async handleDocsDropdownSelect(e, item) {
    e.stopPropagation()
    const action = item.dataset.action

    switch (action) {
      case 'clear':
        this.clearDocsSelection()
        this.closeDocsDropdown()
        break
      case 'toggle':
        const filename = item.dataset.filename
        this.toggleDocumentSelection(filename)
        // Re-render dropdown to show updated checkboxes
        await this.openDocsDropdown()
        break
    }
  }

  /**
   * Toggle a document's selection state
   */
  toggleDocumentSelection(filename) {
    const index = this.selectedDocuments.indexOf(filename)
    if (index === -1) {
      this.selectedDocuments.push(filename)
    } else {
      this.selectedDocuments.splice(index, 1)
    }
    this.includeDocs = this.selectedDocuments.length > 0
    this.updateDocsButtonLabel()
  }

  /**
   * Clear all document selections
   */
  clearDocsSelection() {
    this.selectedDocuments = []
    this.includeDocs = false
    this.updateDocsButtonLabel()
  }

  /**
   * Update the docs button label to show selection count
   */
  updateDocsButtonLabel() {
    if (!this.includeDocsBtn) return
    if (this.selectedDocuments.length > 0) {
      this.includeDocsBtn.textContent = `Docs (${this.selectedDocuments.length}) ▾`
      this.includeDocsBtn.classList.add('active')
    } else {
      this.includeDocsBtn.textContent = 'Include Docs ▾'
      this.includeDocsBtn.classList.remove('active')
    }
  }

  /**
   * Get the content of selected documents for inclusion in prompt
   * @returns {Promise<string>} Combined document content
   */
  async getSelectedDocumentsContent() {
    if (this.selectedDocuments.length === 0) return ''

    const contents = []
    for (const filename of this.selectedDocuments) {
      try {
        const result = await window.puffin.state.loadDesignDocument(filename)
        if (result.success && result.document) {
          const displayName = result.document.name || filename.replace(/\.md$/, '')
          contents.push(`## ${displayName}\n\n${result.document.content}`)
        }
      } catch (error) {
        console.error(`Failed to load document ${filename}:`, error)
      }
    }

    if (contents.length === 0) return ''
    return `\n\n---\n# Included Design Documents\n\n${contents.join('\n\n---\n\n')}\n---\n`
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
   * Build GUI description from elements for a single definition
   * @param {Array} elements - GUI elements
   * @param {string} [name] - Optional name for the design
   * @returns {string} Formatted description
   */
  buildGuiDescription(elements, name = null) {
    if (!elements || elements.length === 0) return null

    const lines = []
    if (name) {
      lines.push(`### ${name}\n`)
    } else {
      lines.push('## UI Layout\n')
    }

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
   * Build combined GUI description from all selected definitions
   * Combines current design and saved definitions into a single context
   * @param {Object} state - Current app state
   * @returns {string|null} Combined GUI description or null if nothing selected
   */
  buildCombinedGuiDescription(state) {
    if (!this.includeGui) return null

    const descriptions = []

    // Add current design if selected
    if (this.useCurrentDesign && state?.designer?.hasElements) {
      const currentDesc = this.buildGuiDescription(
        state.designer.flatElements || state.designer.elements,
        'Current Design'
      )
      if (currentDesc) {
        descriptions.push(currentDesc)
      }
    }

    // Add saved definitions
    for (const definition of this.selectedGuiDefinitions) {
      if (definition.elements && definition.elements.length > 0) {
        const defDesc = this.buildGuiDescription(
          definition.elements,
          definition.name || definition.filename
        )
        if (defDesc) {
          descriptions.push(defDesc)
        }
      }
    }

    if (descriptions.length === 0) return null

    // Combine with header
    if (descriptions.length === 1) {
      return descriptions[0]
    }

    return `## GUI Designs\n\nThe following UI designs should guide your implementation:\n\n${descriptions.join('\n\n---\n\n')}`
  }

  /**
   * Derive user stories from the prompt before implementation
   */
  async deriveStories(content, state) {
    console.log('[DERIVE-STORIES] Starting story derivation')
    console.log('[DERIVE-STORIES] Content:', content?.substring(0, 100))
    console.log('[DERIVE-STORIES] window.puffin:', !!window.puffin)
    console.log('[DERIVE-STORIES] window.puffin.claude.deriveStories:', !!window.puffin?.claude?.deriveStories)

    // Guard: Check if a CLI process is already running
    if (window.puffin?.claude?.isRunning) {
      const isRunning = await window.puffin.claude.isRunning()
      if (isRunning) {
        console.error('[DERIVE-STORIES] Cannot derive: CLI process already running')
        window.puffinApp?.showToast?.({
          type: 'error',
          title: 'Process Already Running',
          message: 'A Claude process is already running. Please wait for it to complete.',
          duration: 5000
        })
        return
      }
    }

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

      // Include recent conversation context so Claude understands references like "Phase 1"
      let conversationContext = ''
      const activeBranch = state.history.activeBranch
      const branchData = state.history.raw?.branches?.[activeBranch]
      if (branchData?.prompts?.length > 0) {
        // Get the last few prompts/responses for context (limit to avoid token overflow)
        const recentPrompts = branchData.prompts.slice(-3)
        const contextParts = []
        for (const p of recentPrompts) {
          if (p.content) {
            contextParts.push(`User: ${p.content.substring(0, 500)}${p.content.length > 500 ? '...' : ''}`)
          }
          if (p.response?.content) {
            // Limit response content to avoid token overflow
            const responsePreview = p.response.content.substring(0, 2000)
            contextParts.push(`Assistant: ${responsePreview}${p.response.content.length > 2000 ? '...' : ''}`)
          }
        }
        if (contextParts.length > 0) {
          conversationContext = contextParts.join('\n\n')
          console.log('[DERIVE-STORIES] Including conversation context:', conversationContext.length, 'chars')
        }
      }

      window.puffin.claude.deriveStories({
        prompt: content,
        branchId: state.history.activeBranch,
        conversationContext: conversationContext,
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
   * Update the derivation status indicator
   */
  updateDerivationStatus(isDerivingStories) {
    let statusEl = document.getElementById('derivation-status')

    if (isDerivingStories) {
      // Create status element if it doesn't exist
      if (!statusEl) {
        statusEl = document.createElement('div')
        statusEl.id = 'derivation-status'
        statusEl.className = 'derivation-status'
        statusEl.innerHTML = `
          <div class="derivation-status-content">
            <span class="spinner"></span>
            <div class="status-text-container">
              <span class="status-text-primary">Deriving user stories from your prompt...</span>
              <span class="status-text-secondary">Claude is analyzing your requirements. This may take a moment.</span>
            </div>
          </div>
        `
        // Insert above the prompt area (the textarea container)
        const promptArea = document.querySelector('.prompt-area')
        if (promptArea) {
          promptArea.parentNode.insertBefore(statusEl, promptArea)
        } else {
          // Fallback: insert at the top of the response area
          const responseArea = document.querySelector('.response-area')
          if (responseArea) {
            responseArea.parentNode.insertBefore(statusEl, responseArea.nextSibling)
          }
        }
      }
      statusEl.classList.add('visible')
    } else {
      // Hide and remove the status element
      if (statusEl) {
        statusEl.classList.remove('visible')
        // Remove after animation
        setTimeout(() => {
          if (statusEl && !statusEl.classList.contains('visible')) {
            statusEl.remove()
          }
        }, 300)
      }
    }
  }

  /**
   * Handle received handoff context
   */
  handleHandoffReceived(handoffData) {
    console.log('[HANDOFF] handleHandoffReceived called:', handoffData)

    // Store the pending handoff
    this.pendingHandoff = handoffData

    // Clear any selected prompt (to show empty prompt view)
    console.log('[HANDOFF] Calling selectPrompt(null)')
    this.intents.selectPrompt(null)

    // Clear the textarea
    this.textarea.value = ''
    this.submitBtn.disabled = true

    // Show the handoff banner above the prompt
    console.log('[HANDOFF] Calling showHandoffBanner')
    this.showHandoffBanner(handoffData)
  }

  /**
   * Show handoff context banner above the prompt input
   */
  showHandoffBanner(handoffData) {
    console.log('[HANDOFF] showHandoffBanner called with data:', handoffData)

    // Remove existing banner if any
    this.hideHandoffBanner()

    // Create the banner element
    const banner = document.createElement('div')
    banner.id = 'handoff-context-banner'
    banner.className = 'handoff-context-banner'
    banner.innerHTML = `
      <div class="handoff-banner-header">
        <span class="handoff-banner-icon">🤝</span>
        <span class="handoff-banner-title">Handoff Context Ready</span>
        <button class="handoff-banner-dismiss" title="Dismiss handoff context">&times;</button>
      </div>
      <div class="handoff-banner-info">
        <span>From: <strong>${this.escapeHtml(handoffData.sourceThreadName)}</strong></span>
        <span class="handoff-banner-separator">•</span>
        <span>Branch: <strong>${this.escapeHtml(handoffData.sourceBranch)}</strong></span>
      </div>
      <div class="handoff-banner-summary">
        <pre>${this.escapeHtml(handoffData.summary)}</pre>
      </div>
      <div class="handoff-banner-hint">
        This context will be automatically included in your next prompt.
      </div>
    `

    // Find the prompt area and insert banner before it
    const promptArea = document.querySelector('.prompt-area')
    if (promptArea) {
      console.log('[HANDOFF] Found prompt area, inserting banner before it')
      promptArea.parentNode.insertBefore(banner, promptArea)
    } else {
      console.warn('[HANDOFF] Could not find .prompt-area container')
    }

    // Add dismiss button handler
    const dismissBtn = banner.querySelector('.handoff-banner-dismiss')
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        this.clearPendingHandoff()
      })
    }
  }

  /**
   * Hide the handoff banner
   */
  hideHandoffBanner() {
    const existingBanner = document.getElementById('handoff-context-banner')
    if (existingBanner) {
      existingBanner.remove()
    }
  }

  /**
   * Clear the pending handoff
   */
  clearPendingHandoff() {
    this.pendingHandoff = null
    this.hideHandoffBanner()
  }

  /**
   * Escape HTML for safe rendering
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
   * Open the handoff review modal
   */
  openHandoffReview() {
    console.log('[HANDOFF] Opening handoff review modal')

    // Get current state
    const state = window.puffinApp?.state
    if (!state) {
      console.warn('[HANDOFF] No state available')
      return
    }

    // Dispatch the action to show the handoff review modal
    if (this.intents.showHandoffReview) {
      this.intents.showHandoffReview()
    } else {
      console.error('[HANDOFF] showHandoffReview intent not found')
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    // Remove event listeners if needed
  }
}
