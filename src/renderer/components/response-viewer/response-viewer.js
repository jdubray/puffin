/**
 * Response Viewer Component
 *
 * Displays Claude's responses with markdown rendering and streaming support.
 */

import { renderMarkdown } from '../../lib/markdown.js'

const WAITING_PHRASES = [
  'Consulting the weights\u2026',
  'Counting attention heads\u2026',
  'Parsing your intent\u2026',
  'Warming up the transformer\u2026',
  'Thinking very hard\u2026',
  'Negotiating with entropy\u2026',
  'Finding the best next token\u2026',
  'Asking 175 billion parameters\u2026',
  'Converting tokens to insight\u2026',
  'Summoning the oracle\u2026',
  'Aligning values\u2026',
  'Pondering the imponderables\u2026',
  'Burning through context\u2026',
  'Converting coffee to code\u2026',
  'Defying the null hypothesis\u2026',
  'Reading the embedding space\u2026',
  'Consulting the attention maps\u2026',
  'Decoding the latent space\u2026',
]

export class ResponseViewerComponent {
  constructor(intents) {
    this.intents = intents
    this.container = null
    this.areaContainer = null
    this.markedLoaded = false
    this._phraseTimer = null
    this.agentLabel = 'Claude'
  }

  /**
   * Initialize the component
   */
  init() {
    this.container = document.getElementById('response-content')
    this.areaContainer = document.getElementById('response-area')
    this.subscribeToState()
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      const { state } = e.detail
      const provider = state.config?.defaultProvider || 'claude'
      this.agentLabel = provider === 'vibe' ? 'Vibe' : provider === 'local' ? 'Local LLM' : 'Claude'
      this.render(state.prompt, state.history, state.activity)
    })
  }

  /**
   * Render component based on state
   */
  render(promptState, historyState, activityState) {
    // Store activity state for use in rendering
    this.activityState = activityState
    // Store history state for continuation button
    this.historyState = historyState

    // Priority: waiting > streaming > selected prompt response > placeholder
    if (promptState.isProcessing && !promptState.hasStreamingResponse) {
      // Submitted but no response yet — show waiting overlay
      this.renderWaiting()
    } else if (promptState.hasStreamingResponse) {
      this._clearWaiting()
      this.renderStreaming(promptState.streamingResponse, activityState)
    } else if (historyState.selectedPrompt?.response) {
      this._clearWaiting()
      this.renderResponse(historyState.selectedPrompt)
    } else if (historyState.selectedPrompt) {
      this._clearWaiting()
      this.renderPromptOnly(historyState.selectedPrompt)
    } else {
      this._clearWaiting()
      this.renderPlaceholder()
    }
  }

  /**
   * Render the waiting overlay (shown between submit and first chunk)
   */
  renderWaiting() {
    // Already showing — don't re-render and interrupt the phrase cycler
    if (this.areaContainer?.querySelector('.response-waiting')) return

    // Clear any previous response content so nothing shows through the overlay
    if (this.container) this.container.innerHTML = ''

    this._stopPhraseCycler()

    const startIdx = Math.floor(Math.random() * WAITING_PHRASES.length)
    const overlay = document.createElement('div')
    overlay.className = 'response-waiting'
    overlay.innerHTML = `
      <div class="response-waiting-spinner"></div>
      <p class="response-waiting-phrase">${WAITING_PHRASES[startIdx]}</p>
    `
    this.areaContainer.appendChild(overlay)

    this.areaContainer.scrollTop = 0

    // Tiny delay so the first phrase is visible before cycling starts
    setTimeout(() => this._startPhraseCycler(startIdx), 100)
  }

  /**
   * Remove the waiting overlay and stop phrase cycling
   * @private
   */
  _clearWaiting() {
    this._stopPhraseCycler()
    const overlay = this.areaContainer?.querySelector('.response-waiting')
    if (overlay) overlay.remove()
  }

  /**
   * Cycle through witty waiting phrases
   * @private
   */
  _startPhraseCycler(startIdx = 0) {
    this._stopPhraseCycler()
    let idx = startIdx

    this._phraseTimer = setInterval(() => {
      const el = this.areaContainer?.querySelector('.response-waiting-phrase')
      if (!el) { this._stopPhraseCycler(); return }

      idx = (idx + 1) % WAITING_PHRASES.length
      el.classList.add('fade-out')
      setTimeout(() => {
        const el2 = this.areaContainer?.querySelector('.response-waiting-phrase')
        if (el2) {
          el2.textContent = WAITING_PHRASES[idx]
          el2.classList.remove('fade-out')
        }
      }, 250)
    }, 2800)
  }

  /**
   * @private
   */
  _stopPhraseCycler() {
    if (this._phraseTimer) {
      clearInterval(this._phraseTimer)
      this._phraseTimer = null
    }
  }

  /**
   * Render streaming response
   */
  renderStreaming(content, activityState) {
    const html = this.parseMarkdown(content)
    const activityPanelHtml = this.renderActivityPanel(activityState)

    this.container.innerHTML = `
      ${activityPanelHtml}
      <div class="response-message streaming">
        ${html}
        <span class="streaming-cursor"></span>
      </div>
    `
    this.scrollToBottom()
  }

  /**
   * Render activity panel showing current tool and modified files
   */
  renderActivityPanel(activityState) {
    if (!activityState) return ''

    const { currentTool, activeTools, filesModified, status } = activityState

    // Don't show if idle with no files
    if (status === 'idle' && (!filesModified || filesModified.length === 0)) {
      return ''
    }

    let toolHtml = ''
    if (currentTool) {
      const emoji = this.getToolEmoji(currentTool.name)
      toolHtml = `
        <div class="activity-current-tool">
          <span class="tool-indicator">${emoji}</span>
          <span class="tool-name">${this.escapeHtml(currentTool.name)}</span>
          ${currentTool.input?.file_path ? `<span class="tool-file">${this.escapeHtml(this.shortenPath(currentTool.input.file_path))}</span>` : ''}
        </div>
      `
    } else if (status === 'thinking' || (activeTools && activeTools.length === 0 && status !== 'idle')) {
      toolHtml = `
        <div class="activity-current-tool thinking">
          <span class="tool-indicator">💭</span>
          <span class="tool-name">Thinking...</span>
        </div>
      `
    }

    let filesHtml = ''
    if (filesModified && filesModified.length > 0) {
      const fileItems = filesModified.map(f => {
        const actionIcon = f.action === 'write' ? '✏️' : f.action === 'read' ? '📖' : '📄'
        return `<li>${actionIcon} ${this.escapeHtml(this.shortenPath(f.path))}</li>`
      }).join('')
      filesHtml = `
        <div class="activity-files">
          <div class="activity-files-label">Files touched:</div>
          <ul class="activity-files-list">${fileItems}</ul>
        </div>
      `
    }

    if (!toolHtml && !filesHtml) return ''

    return `
      <div class="activity-panel">
        ${toolHtml}
        ${filesHtml}
      </div>
    `
  }

  /**
   * Get emoji for tool name
   */
  getToolEmoji(toolName) {
    const emojis = {
      Read: '📖',
      Edit: '✏️',
      Write: '📝',
      Grep: '🔍',
      Glob: '🔍',
      Bash: '💻',
      WebFetch: '🌐',
      WebSearch: '🔎',
      Task: '🤖',
      NotebookEdit: '📓',
      TodoWrite: '📋'
    }
    return emojis[toolName] || '⚙️'
  }

  /**
   * Shorten file path for display
   */
  shortenPath(filePath) {
    if (!filePath) return ''
    // Show last 2-3 path segments
    const parts = filePath.split(/[/\\]/)
    if (parts.length <= 3) return filePath
    return '...' + parts.slice(-3).join('/')
  }

  /**
   * Render complete response
   */
  renderResponse(prompt) {
    const html = this.parseMarkdown(prompt.response.content)
    const response = prompt.response

    // Build metadata string
    const metaParts = [this.formatDate(response.timestamp)]
    if (response.turns) {
      metaParts.push(`${response.turns} turns`)
    }
    if (response.cost) {
      metaParts.push(`$${response.cost.toFixed(4)}`)
    }
    if (response.duration) {
      metaParts.push(`${(response.duration / 1000).toFixed(1)}s`)
    }

    // Check if max turns was reached and continuation is needed
    const maxTurns = 100 // Default max turns per request
    const continuationRequired = response.turns && response.turns >= maxTurns
    if (continuationRequired) {
      metaParts.push('<button class="continuation-btn" data-action="continue" title="Click to continue implementation">⚠️ Continue</button>')
    }

    // Show files modified if available (from response data)
    let filesModifiedHtml = ''
    const filesModified = response.filesModified || []
    if (filesModified.length > 0) {
      const fileItems = filesModified.map(f => {
        const actionIcon = f.action === 'write' ? '✏️' : f.action === 'read' ? '📖' : '📄'
        return `<li>${actionIcon} ${this.escapeHtml(this.shortenPath(f.path))}</li>`
      }).join('')
      filesModifiedHtml = `
        <div class="response-files-modified">
          <div class="files-label">${filesModified.length} file${filesModified.length !== 1 ? 's' : ''} modified:</div>
          <ul class="files-list">${fileItems}</ul>
        </div>
      `
    }

    this.container.innerHTML = `
      <div class="prompt-display">
        <div class="prompt-label">You</div>
        <div class="prompt-content">${this.parseMarkdown(prompt.content)}</div>
      </div>
      <div class="response-display">
        <div class="response-label">${this.agentLabel}</div>
        <div class="response-message">${html}</div>
        <div class="response-actions">
          <button class="response-action-btn" data-action="copy-md" title="Copy markdown to clipboard">
            <span class="btn-icon">📋</span>
            <span class="btn-text">Copy MD</span>
          </button>
          <button class="response-action-btn" data-action="save-md" title="Save markdown to file">
            <span class="btn-icon">💾</span>
            <span class="btn-text">Save MD</span>
          </button>
        </div>
        ${filesModifiedHtml}
        <div class="response-meta">
          ${metaParts.join(' • ')}
        </div>
      </div>
    `

    // Store the raw markdown content for later access
    this.currentMarkdown = prompt.response.content

    // Attach event listeners to the action buttons
    this.attachActionListeners()
  }

  /**
   * Render prompt without response
   */
  renderPromptOnly(prompt) {
    this.container.innerHTML = `
      <div class="prompt-display">
        <div class="prompt-label">You</div>
        <div class="prompt-content">${this.parseMarkdown(prompt.content)}</div>
      </div>
      <div class="response-display pending">
        <div class="response-label">${this.agentLabel}</div>
        <p class="placeholder">Awaiting response...</p>
      </div>
    `
  }

  /**
   * Render placeholder
   */
  renderPlaceholder() {
    this.container.innerHTML = `
      <p class="placeholder">Claude's responses will appear here...</p>
    `
  }

  /**
   * Parse markdown to HTML.
   *
   * Delegates to lib/markdown so this pane and the Sekkei reply pane render
   * replies identically; kept as a method because callers use this.parseMarkdown().
   *
   * @param {string} content - Raw markdown
   * @returns {string} HTML
   */
  parseMarkdown(content) {
    return renderMarkdown(content)
  }

  /**
   * Scroll to bottom of container
   */
  scrollToBottom() {
    const responseArea = this.container.closest('.response-area')
    if (responseArea) {
      responseArea.scrollTop = responseArea.scrollHeight
    }
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
   * Format date
   */
  formatDate(timestamp) {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  /**
   * Attach event listeners to response action buttons
   */
  attachActionListeners() {
    const copyBtn = this.container.querySelector('[data-action="copy-md"]')
    const saveBtn = this.container.querySelector('[data-action="save-md"]')
    const continueBtn = this.container.querySelector('[data-action="continue"]')

    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.handleCopyMarkdown())
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.handleSaveMarkdown())
    }

    if (continueBtn) {
      continueBtn.addEventListener('click', () => this.handleContinue())
    }
  }

  /**
   * Handle copy markdown to clipboard
   */
  async handleCopyMarkdown() {
    if (!this.currentMarkdown) return

    try {
      await navigator.clipboard.writeText(this.currentMarkdown)
      this.showToast('Markdown copied to clipboard', 'success')
    } catch (err) {
      console.error('Failed to copy markdown:', err)
      this.showToast('Failed to copy markdown', 'error')
    }
  }

  /**
   * Handle save markdown to file
   */
  async handleSaveMarkdown() {
    if (!this.currentMarkdown) return

    try {
      // Use the Puffin file API to save the markdown
      const result = await window.puffin.file.saveMarkdown(this.currentMarkdown)

      if (result.success) {
        this.showToast(`Markdown saved to ${result.filePath}`, 'success')
      } else if (result.canceled) {
        // User canceled, no message needed
      } else {
        this.showToast('Failed to save markdown', 'error')
      }
    } catch (err) {
      console.error('Failed to save markdown:', err)
      this.showToast('Failed to save markdown', 'error')
    }
  }

  /**
   * Handle continue button click - triggers continuation via SAM next-action
   */
  handleContinue() {
    if (!this.historyState || !this.intents) {
      console.error('[RESPONSE-VIEWER] Cannot continue: missing state or intents')
      return
    }

    const activeBranch = this.historyState.activeBranch
    const selectedPrompt = this.historyState.selectedPrompt

    const promptContent = 'Complete the implementation, when complete reply with [Complete]'

    // Use SAM action to request continue - the next-action will handle submission
    this.intents.requestContinue(activeBranch, promptContent, selectedPrompt?.id || null)

    this.showToast('Continuation prompt sent', 'success')
  }

  /**
   * Show a toast notification
   */
  showToast(message, type = 'info') {
    const event = new CustomEvent('show-toast', {
      detail: { message, type }
    })
    document.dispatchEvent(event)
  }

  /**
   * Cleanup
   */
  destroy() {
    // Remove event listeners if needed
  }
}
