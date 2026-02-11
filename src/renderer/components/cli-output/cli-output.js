/**
 * CLI Output Component
 *
 * Displays raw 3CLI interactions including:
 * - Live streaming output
 * - Parsed message history
 * - Raw JSON for debugging
 */

/**
 * Tool emoji mapping for different tool types
 */
const TOOL_EMOJIS = {
  // File reading operations
  Read: '📖',

  // File editing operations
  Edit: '✏️',

  // File writing operations
  Write: '📝',

  // Search operations
  Grep: '🔍',
  Glob: '🔍',

  // Command execution
  Bash: '💻',

  // Web operations
  WebFetch: '🌐',
  WebSearch: '🔎',

  // Task/Agent operations
  Task: '🤖',

  // Notebook operations
  NotebookEdit: '📓',

  // Todo operations
  TodoWrite: '📋',

  // Other specialized tools
  Skill: '🎯',
  SlashCommand: '⚡',
  EnterPlanMode: '📋',
  ExitPlanMode: '✅',

  // Default fallback
  default: '⚙️'
}

/** Maximum stored messages/raw lines before oldest are dropped */
const MAX_MESSAGES = 500
/** Maximum stream buffer size in characters before trimming */
const MAX_STREAM_BUFFER_CHARS = 500000

export class CliOutputComponent {
  constructor(intents) {
    this.intents = intents
    this.messages = []
    this.rawMessages = []
    this.streamBuffer = ''
    this.activeTab = 'stream'
    this.autoScroll = true
    this.showSystem = false
    this.currentSession = null
    this.totalCost = 0
    this.totalTurns = 0
    this.activeTools = new Map() // Track active tools by ID
    this.modifiedFiles = new Set() // Track files modified during session
  }

  /**
   * Get emoji for a tool name
   * @param {string} toolName - The name of the tool
   * @returns {string} The corresponding emoji
   */
  getToolEmoji(toolName) {
    return TOOL_EMOJIS[toolName] || TOOL_EMOJIS.default
  }

  /**
   * Initialize the component
   */
  init() {
    this.bindEvents()
  }

  /**
   * Bind event handlers
   */
  bindEvents() {
    // Tab switching
    document.querySelectorAll('.cli-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab)
      })
    })

    // Auto-scroll toggle
    document.getElementById('cli-autoscroll')?.addEventListener('change', (e) => {
      this.autoScroll = e.target.checked
    })

    // Show system messages toggle
    document.getElementById('cli-show-system')?.addEventListener('change', (e) => {
      this.showSystem = e.target.checked
      this.renderMessages()
    })

    // Clear button
    document.getElementById('cli-clear-btn')?.addEventListener('click', () => {
      this.clear()
    })

    // Export button
    document.getElementById('cli-export-btn')?.addEventListener('click', () => {
      this.exportOutput()
    })
  }

  /**
   * Switch between tabs
   */
  switchTab(tabName) {
    this.activeTab = tabName

    // Update tab buttons
    document.querySelectorAll('.cli-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName)
    })

    // Update tab content
    document.querySelectorAll('.cli-content').forEach(content => {
      content.classList.toggle('active', content.id === `cli-${tabName}-content`)
    })
  }

  /**
   * Handle incoming raw message from 3CLI
   * Called for each JSON line from the CLI stream
   */
  handleRawMessage(jsonLine) {
    // Store raw message (cap to prevent unbounded growth)
    this.rawMessages.push({
      timestamp: Date.now(),
      raw: jsonLine
    })
    if (this.rawMessages.length > MAX_MESSAGES) {
      this.rawMessages = this.rawMessages.slice(-Math.floor(MAX_MESSAGES * 0.75))
    }

    // Try to parse JSON
    try {
      const parsed = JSON.parse(jsonLine)
      this.handleParsedMessage(parsed)
    } catch (e) {
      // Not valid JSON, treat as plain text
      this.appendToStream(jsonLine, 'text')
    }

    // Update raw view
    this.updateRawView()
  }

  /**
   * Handle parsed JSON message
   */
  handleParsedMessage(msg) {
    const message = {
      timestamp: Date.now(),
      type: msg.type,
      data: msg
    }

    this.messages.push(message)
    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.messages.slice(-Math.floor(MAX_MESSAGES * 0.75))
    }

    // Track active provider from messages
    if (msg.provider && !this._activeProvider) {
      this._activeProvider = { provider: msg.provider, model: msg.model }
    }

    switch (msg.type) {
      case 'assistant':
        this.handleAssistantMessage(msg)
        break

      case 'user':
        this.handleUserMessage(msg)
        break

      case 'system':
        this.handleSystemMessage(msg)
        break

      case 'result':
        this.handleResultMessage(msg)
        break

      case 'status':
        this.handleStatusMessage(msg)
        break

      default:
        this.appendToStream(`[${msg.type}] ${JSON.stringify(msg)}`, 'unknown')
    }

    this.renderMessages()
    this.updateStatus()
  }

  /**
   * Handle assistant message (Claude's response)
   */
  handleAssistantMessage(msg) {
    // Ollama sends flat assistant messages with provider/model/text fields
    if (msg.provider && msg.text !== undefined) {
      const prefix = this.formatProviderPrefix(msg.provider, msg.model)
      this.appendToStreamRaw(`${prefix}${this.escapeHtml(msg.text)}`, 'assistant-text')
      return
    }

    if (msg.message?.content) {
      // Build provider prefix from message metadata (injected by LLMRouter)
      const prefix = msg.provider ? this.formatProviderPrefix(msg.provider, msg.model) : ''

      for (const block of msg.message.content) {
        if (block.type === 'text') {
          if (prefix) {
            this.appendToStreamRaw(`${prefix}${this.escapeHtml(block.text)}`, 'assistant-text')
          } else {
            this.appendToStream(block.text, 'assistant-text')
          }
        } else if (block.type === 'tool_use') {
          // Track active tool (only store name — input is not needed here)
          this.activeTools.set(block.id, {
            name: block.name,
            timestamp: Date.now()
          })

          // Create emoji element with tooltip and animation
          const emoji = this.getToolEmoji(block.name)
          const toolElement = `<span class="tool-emoji active" data-tool-id="${block.id}" data-tool-name="${this.escapeHtml(block.name)}" title="${this.escapeHtml(block.name)}">${emoji}</span>`

          // Use raw append since we're inserting HTML
          this.appendToStreamRaw(toolElement, 'tool-use')
          if (block.input) {
            const inputStr = JSON.stringify(block.input, null, 2)
            this.appendToStream(`Input: ${inputStr}`, 'tool-input')
          }
        }
      }
    }
  }

  /**
   * Handle user message (tool results)
   */
  handleUserMessage(msg) {
    if (msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'tool_result') {
          // Remove active animation for completed tool
          let toolName = null
          if (this.activeTools.has(block.tool_use_id)) {
            toolName = this.activeTools.get(block.tool_use_id).name
            this.removeActiveToolAnimation(block.tool_use_id)
            this.activeTools.delete(block.tool_use_id)
          }

          // Track modified files for file operations
          if (!block.is_error && toolName) {
            this.extractAndTrackModifiedFiles(toolName, block.content)
          }

          const status = block.is_error ? '❌' : '✅'
          this.appendToStream(`\n${status} Tool Result (${block.tool_use_id}):`, 'tool-result-header')

          if (typeof block.content === 'string') {
            // Truncate long results for display
            const content = block.content.length > 500
              ? block.content.substring(0, 500) + '...[truncated]'
              : block.content
            this.appendToStream(content, block.is_error ? 'tool-error' : 'tool-result')
          } else if (Array.isArray(block.content)) {
            for (const item of block.content) {
              if (item.type === 'text') {
                const content = item.text.length > 500
                  ? item.text.substring(0, 500) + '...[truncated]'
                  : item.text
                this.appendToStream(content, block.is_error ? 'tool-error' : 'tool-result')
              }
            }
          }
        }
      }
    }
  }

  /**
   * Handle system message
   */
  handleSystemMessage(msg) {
    if (this.showSystem) {
      this.appendToStream(`[SYSTEM] ${msg.message || JSON.stringify(msg)}`, 'system')
    }
  }

  /**
   * Handle SSH/provider status message (e.g. Connecting, Connected, Response received)
   */
  handleStatusMessage(msg) {
    const prefix = this.formatProviderPrefix(msg.provider, msg.model)
    // Sanitize status for CSS class name to prevent XSS
    const safeStatus = (msg.status || 'info').replace(/[^a-z0-9-]/gi, '')
    this.appendToStreamRaw(`${prefix}<span class="status-text status-${safeStatus}">${this.escapeHtml(msg.message || msg.status)}</span>`, 'provider-status')
  }

  /**
   * Format a color-coded provider prefix for display.
   * @param {string} provider - Provider ID ('claude' or 'ollama')
   * @param {string} [model] - Model name to display alongside provider
   * @returns {string} HTML string with color-coded prefix
   */
  formatProviderPrefix(provider, model) {
    if (!provider) return ''
    // Sanitize provider for CSS class name to prevent XSS
    const safeProvider = provider.replace(/[^a-z0-9-]/gi, '')
    const displayName = provider === 'claude' ? 'Claude' : provider === 'ollama' ? 'Ollama' : provider
    const label = model ? `${displayName}: ${this.escapeHtml(model)}` : displayName
    return `<span class="provider-prefix provider-${safeProvider}">[${label}]</span> `
  }

  /**
   * Handle result message (final summary)
   */
  handleResultMessage(msg) {
    this.currentSession = msg.session_id
    this.totalCost += msg.cost_usd || 0
    this.totalTurns += msg.num_turns || 0

    this.appendToStream('\n' + '─'.repeat(50), 'divider')
    this.appendToStream(`✓ Completed`, 'result-header')
    this.appendToStream(`  Session: ${msg.session_id}`, 'result-info')
    this.appendToStream(`  Turns: ${msg.num_turns}`, 'result-info')
    this.appendToStream(`  Cost: $${(msg.cost_usd || 0).toFixed(4)}`, 'result-info')
    this.appendToStream(`  Duration: ${msg.duration_ms}ms`, 'result-info')

    // Display modified files if any
    if (this.modifiedFiles.size > 0) {
      this.appendToStream(`  Files modified: ${this.modifiedFiles.size}`, 'result-info')
      const sortedFiles = Array.from(this.modifiedFiles).sort()
      for (const filePath of sortedFiles) {
        this.appendToStream(`    📝 ${filePath}`, 'result-file')
      }
      // Clear the modified files for next session
      this.modifiedFiles.clear()
    }

    this.appendToStream('─'.repeat(50) + '\n', 'divider')

    this.updateSessionInfo()
    this.updateCostInfo()
  }

  /**
   * Append a provider-tagged error to the stream view (AC6).
   * @param {string} provider - Provider ID ('claude' or 'ollama')
   * @param {string} [model] - Model name
   * @param {string} message - Error message
   */
  appendProviderError(provider, model, message) {
    const prefix = this.formatProviderPrefix(provider, model)
    this.appendToStreamRaw(`${prefix}<span class="provider-error">${this.escapeHtml(message)}</span>`, 'provider-error-line')
  }

  /**
   * Append text to the stream view (HTML escaped)
   */
  appendToStream(text, className = '') {
    this.streamBuffer += `<div class="stream-line ${className}">${this.escapeHtml(text)}</div>`
    this._trimStreamBuffer()
    this.updateStreamView()
  }

  /**
   * Append raw HTML to the stream view (no escaping - use carefully)
   */
  appendToStreamRaw(html, className = '') {
    this.streamBuffer += `<div class="stream-line ${className}">${html}</div>`
    this._trimStreamBuffer()
    this.updateStreamView()
  }

  /**
   * Trim stream buffer if it exceeds the character limit.
   * Drops the oldest ~25% of content to avoid trimming on every append.
   * @private
   */
  _trimStreamBuffer() {
    if (this.streamBuffer.length > MAX_STREAM_BUFFER_CHARS) {
      // Find a div boundary near the 25% mark to cut cleanly
      const cutPoint = Math.floor(MAX_STREAM_BUFFER_CHARS * 0.25)
      const divIndex = this.streamBuffer.indexOf('</div>', cutPoint)
      if (divIndex !== -1) {
        this.streamBuffer = '<div class="stream-line system">[...earlier output trimmed]</div>' +
          this.streamBuffer.slice(divIndex + 6)
      }
    }
  }

  /**
   * Update the stream view
   */
  updateStreamView() {
    const container = document.querySelector('.cli-stream-output')
    if (!container) return

    container.innerHTML = this.streamBuffer || '<p class="cli-placeholder">3CLI output will appear here when you submit a prompt...</p>'

    if (this.autoScroll) {
      container.scrollTop = container.scrollHeight
    }
  }

  /**
   * Update the messages view
   */
  renderMessages() {
    const container = document.querySelector('.cli-messages-list')
    if (!container) return

    const filteredMessages = this.showSystem
      ? this.messages
      : this.messages.filter(m => m.type !== 'system')

    if (filteredMessages.length === 0) {
      container.innerHTML = '<p class="cli-placeholder">No messages yet...</p>'
      return
    }

    container.innerHTML = filteredMessages.map((msg, index) => `
      <div class="cli-message cli-message-${msg.type}">
        <div class="cli-message-header">
          <span class="cli-message-type">${this.getMessageIcon(msg.type)} ${msg.type}</span>
          <span class="cli-message-time">${this.formatTime(msg.timestamp)}</span>
          <button class="cli-message-expand" data-index="${index}">▼</button>
        </div>
        <div class="cli-message-preview">${this.getMessagePreview(msg)}</div>
        <pre class="cli-message-detail hidden">${this.escapeHtml(JSON.stringify(msg.data, null, 2))}</pre>
      </div>
    `).join('')

    // Add expand/collapse handlers
    container.querySelectorAll('.cli-message-expand').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const detail = e.target.closest('.cli-message').querySelector('.cli-message-detail')
        detail.classList.toggle('hidden')
        e.target.textContent = detail.classList.contains('hidden') ? '▼' : '▲'
      })
    })

    if (this.autoScroll) {
      container.scrollTop = container.scrollHeight
    }
  }

  /**
   * Update raw JSON view
   */
  updateRawView() {
    const pre = document.querySelector('.cli-raw-output')
    if (!pre) return

    pre.textContent = this.rawMessages
      .map(m => `[${this.formatTime(m.timestamp)}] ${m.raw}`)
      .join('\n')

    if (this.autoScroll) {
      pre.parentElement.scrollTop = pre.parentElement.scrollHeight
    }
  }

  /**
   * Update status indicator
   */
  updateStatus(status) {
    const statusEl = document.getElementById('cli-status')
    if (statusEl && status) {
      statusEl.textContent = status
      statusEl.className = `cli-status cli-status-${status.toLowerCase().replace(/\s/g, '-')}`
    }
  }

  /**
   * Set processing status
   * @param {boolean} isProcessing - Whether processing is active
   * @param {Object} [providerInfo] - Provider context
   * @param {string} [providerInfo.provider] - Provider ID ('claude' or 'ollama')
   * @param {string} [providerInfo.model] - Model name
   */
  setProcessing(isProcessing, providerInfo) {
    if (isProcessing && providerInfo?.provider) {
      this._activeProvider = providerInfo
    } else if (!isProcessing) {
      this._activeProvider = null
    }

    this.updateStatus(isProcessing ? 'Processing...' : 'Idle')

    const statusEl = document.getElementById('cli-status')
    if (statusEl) {
      statusEl.classList.toggle('processing', isProcessing)
    }
  }

  /**
   * Update session info
   */
  updateSessionInfo() {
    const sessionEl = document.getElementById('cli-session-info')
    if (sessionEl && this.currentSession) {
      sessionEl.textContent = `Session: ${this.currentSession.substring(0, 8)}...`
      sessionEl.title = this.currentSession
    }
  }

  /**
   * Update cost info
   */
  updateCostInfo() {
    const costEl = document.getElementById('cli-cost-info')
    if (costEl) {
      costEl.textContent = `Total: $${this.totalCost.toFixed(4)} | ${this.totalTurns} turns`
    }
  }

  /**
   * Clear all output
   */
  clear() {
    this.messages = []
    this.rawMessages = []
    this.streamBuffer = ''
    this.modifiedFiles.clear() // Clear modified files tracking

    this.updateStreamView()
    this.renderMessages()
    this.updateRawView()

    document.getElementById('cli-session-info').textContent = ''
  }

  /**
   * Export output to file
   */
  exportOutput() {
    const data = {
      exportedAt: new Date().toISOString(),
      session: this.currentSession,
      totalCost: this.totalCost,
      totalTurns: this.totalTurns,
      messages: this.messages,
      rawMessages: this.rawMessages
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `puffin-cli-output-${Date.now()}.json`
    a.click()

    URL.revokeObjectURL(url)
  }

  /**
   * Extract and track files that were modified by tool operations
   * @param {string} toolName - The name of the tool that was used
   * @param {*} toolResult - The result content from the tool
   */
  extractAndTrackModifiedFiles(toolName, toolResult) {
    // Extract file paths from successful tool operations
    const fileModifyingTools = ['Write', 'Edit', 'NotebookEdit']

    if (!fileModifyingTools.includes(toolName)) return

    let resultText = ''
    if (typeof toolResult === 'string') {
      resultText = toolResult
    } else if (Array.isArray(toolResult)) {
      resultText = toolResult
        .filter(item => item.type === 'text')
        .map(item => item.text)
        .join(' ')
    }

    // Extract file paths from common success messages
    const pathPatterns = [
      // "The file C:\path\to\file.js has been updated"
      /(?:file|updated?|written|modified|created?)\s+([A-Za-z]:[\\\/][\w\s\\\/.-]+\.\w+)/gi,
      // "C:\path\to\file.js has been"
      /^([A-Za-z]:[\\\/][\w\s\\\/.-]+\.\w+)\s+has\s+been/gi,
      // "/path/to/file.js" or "src/file.js" patterns
      /((?:[A-Za-z]:[\\\/])?(?:[\w.-]+[\\\/])*[\w.-]+\.\w+)/gi
    ]

    for (const pattern of pathPatterns) {
      let match
      while ((match = pattern.exec(resultText)) !== null) {
        const filePath = match[1].trim()
        // Filter out obvious false positives
        if (filePath.length > 5 && filePath.includes('.')) {
          this.modifiedFiles.add(filePath)
        }
      }
    }
  }

  /**
   * Remove active animation from completed tool
   * @param {string} toolUseId - The ID of the completed tool
   */
  removeActiveToolAnimation(toolUseId) {
    // Find all tool emoji elements in the current stream and remove active class
    // This is a simple implementation - in a more complex app you'd track DOM elements
    const container = document.querySelector('.cli-stream-output')
    if (container) {
      // Remove active class from all tool emojis since we don't track individual DOM elements
      // This is acceptable since tools typically complete quickly
      container.querySelectorAll('.tool-emoji.active').forEach(el => {
        el.classList.remove('active')
        el.classList.add('completed')
      })
    }
  }

  /**
   * Get icon for message type
   */
  getMessageIcon(type) {
    const icons = {
      assistant: '🤖',
      user: '👤',
      system: '⚙️',
      result: '✓'
    }
    return icons[type] || '📝'
  }

  /**
   * Get preview text for message
   */
  getMessagePreview(msg) {
    const data = msg.data

    if (msg.type === 'assistant' && data.message?.content) {
      for (const block of data.message.content) {
        if (block.type === 'text') {
          const text = block.text.substring(0, 100)
          return this.escapeHtml(text) + (block.text.length > 100 ? '...' : '')
        }
        if (block.type === 'tool_use') {
          return `${this.getToolEmoji(block.name)} ${block.name}`
        }
      }
    }

    if (msg.type === 'user' && data.message?.content) {
      for (const block of data.message.content) {
        if (block.type === 'tool_result') {
          const status = block.is_error ? '❌' : '✅'
          return `${status} Tool result`
        }
      }
    }

    if (msg.type === 'result') {
      return `Session: ${data.session_id?.substring(0, 8)}... | Cost: $${(data.cost_usd || 0).toFixed(4)}`
    }

    return JSON.stringify(data).substring(0, 80) + '...'
  }

  /**
   * Format timestamp
   */
  formatTime(timestamp) {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) + '.' + String(date.getMilliseconds()).padStart(3, '0')
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Cleanup
   */
  destroy() {
    // Nothing to cleanup currently
  }
}
