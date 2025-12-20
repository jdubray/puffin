/**
 * Response Viewer Component
 *
 * Displays Claude's responses with markdown rendering and streaming support.
 */

export class ResponseViewerComponent {
  constructor(intents) {
    this.intents = intents
    this.container = null
    this.markedLoaded = false
  }

  /**
   * Initialize the component
   */
  init() {
    this.container = document.getElementById('response-content')
    this.subscribeToState()
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      const { state } = e.detail
      this.render(state.prompt, state.history, state.storyDerivation, state.activity)
    })
  }

  /**
   * Render component based on state
   */
  render(promptState, historyState, storyDerivationState, activityState) {
    // Store activity state for use in rendering
    this.activityState = activityState

    // Priority: story derivation error > streaming response > selected prompt response > placeholder
    if (storyDerivationState?.error) {
      this.renderStoryDerivationError(storyDerivationState.error, historyState.selectedPrompt)
    } else if (promptState.hasStreamingResponse) {
      this.renderStreaming(promptState.streamingResponse, activityState)
    } else if (historyState.selectedPrompt?.response) {
      this.renderResponse(historyState.selectedPrompt)
    } else if (historyState.selectedPrompt) {
      this.renderPromptOnly(historyState.selectedPrompt)
    } else {
      this.renderPlaceholder()
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
        <div class="prompt-content">${this.escapeHtml(prompt.content)}</div>
      </div>
      <div class="response-display">
        <div class="response-label">Claude</div>
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
        <div class="prompt-content">${this.escapeHtml(prompt.content)}</div>
      </div>
      <div class="response-display pending">
        <div class="response-label">Claude</div>
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
   * Render story derivation error
   */
  renderStoryDerivationError(error, prompt) {
    const promptHtml = prompt ? `
      <div class="prompt-display">
        <div class="prompt-label">You</div>
        <div class="prompt-content">${this.escapeHtml(prompt.content)}</div>
      </div>
    ` : ''

    // Also show the response if it exists (Claude's response before error)
    const responseHtml = prompt?.response?.content ? `
      <div class="response-display">
        <div class="response-label">Claude</div>
        <div class="response-message">${this.parseMarkdown(prompt.response.content)}</div>
      </div>
    ` : ''

    this.container.innerHTML = `
      ${promptHtml}
      ${responseHtml}
      <div class="error-display">
        <div class="error-icon">⚠️</div>
        <div class="error-content">
          <div class="error-title">Story Derivation Failed</div>
          <div class="error-message">${this.escapeHtml(error)}</div>
          <div class="error-hint">
            Try submitting the prompt again without "Derive User Stories" enabled,
            or rephrase your request to be more specific about the features you want.
          </div>
        </div>
      </div>
    `
  }

  /**
   * Parse markdown to HTML
   * Uses a simple parser if marked.js isn't loaded
   */
  parseMarkdown(content) {
    if (!content) return ''

    // Try to use marked if available
    if (window.marked) {
      return window.marked.parse(content)
    }

    // Simple markdown parsing fallback
    return this.simpleMarkdown(content)
  }

  /**
   * Simple markdown parser for basic formatting
   */
  simpleMarkdown(text) {
    // Escape HTML first
    let html = this.escapeHtml(text)

    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="language-${lang}">${code}</code></pre>`
    })

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

    // Tables - parse markdown tables into HTML
    html = this.parseMarkdownTables(html)

    // Headers
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>')
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>')
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>')

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')

    // Lists
    html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
    html = html.replace(/(<li>.*<\/li>)\n(?=<li>)/g, '$1')
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')

    // Numbered lists
    html = html.replace(/^\s*\d+\.\s+(.*)$/gm, '<li>$1</li>')

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')

    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>')
    html = `<p>${html}</p>`

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '')
    html = html.replace(/<p>(<h[1-6]>)/g, '$1')
    html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1')
    html = html.replace(/<p>(<pre>)/g, '$1')
    html = html.replace(/(<\/pre>)<\/p>/g, '$1')
    html = html.replace(/<p>(<ul>)/g, '$1')
    html = html.replace(/(<\/ul>)<\/p>/g, '$1')
    html = html.replace(/<p>(<div class="table-wrapper">)/g, '$1')
    html = html.replace(/(<\/table><\/div>)<\/p>/g, '$1')

    return html
  }

  /**
   * Parse markdown tables into HTML tables
   */
  parseMarkdownTables(text) {
    const lines = text.split('\n')
    const result = []
    let inTable = false
    let tableRows = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      // Check if this looks like a table row (starts and ends with |, or has | separators)
      const isTableRow = line.startsWith('|') && line.endsWith('|')
      const isSeparatorRow = /^\|[\s\-:|\s]+\|$/.test(line)

      if (isTableRow || isSeparatorRow) {
        if (!inTable) {
          inTable = true
          tableRows = []
        }
        tableRows.push(line)
      } else {
        // If we were in a table, process it
        if (inTable && tableRows.length >= 2) {
          result.push(this.renderTable(tableRows))
        } else if (inTable) {
          // Not enough rows for a table, just add them back
          result.push(...tableRows)
        }
        inTable = false
        tableRows = []
        result.push(lines[i])
      }
    }

    // Handle table at end of text
    if (inTable && tableRows.length >= 2) {
      result.push(this.renderTable(tableRows))
    } else if (inTable) {
      result.push(...tableRows)
    }

    return result.join('\n')
  }

  /**
   * Render table rows into HTML table
   */
  renderTable(rows) {
    if (rows.length < 2) return rows.join('\n')

    // Parse cells from each row
    const parseCells = (row) => {
      return row
        .split('|')
        .slice(1, -1) // Remove empty first and last elements from split
        .map(cell => cell.trim())
    }

    const headerCells = parseCells(rows[0])

    // Check if second row is a separator (contains only -, :, |, and spaces)
    const isSeparator = /^[\s\-:|]+$/.test(rows[1].replace(/\|/g, ''))

    let bodyStartIndex = isSeparator ? 2 : 1

    // Build table HTML
    let tableHtml = '<div class="table-wrapper"><table>\n<thead>\n<tr>'

    for (const cell of headerCells) {
      tableHtml += `<th>${cell}</th>`
    }
    tableHtml += '</tr>\n</thead>\n<tbody>\n'

    for (let i = bodyStartIndex; i < rows.length; i++) {
      const cells = parseCells(rows[i])
      tableHtml += '<tr>'
      for (const cell of cells) {
        tableHtml += `<td>${cell}</td>`
      }
      tableHtml += '</tr>\n'
    }

    tableHtml += '</tbody>\n</table></div>'
    return tableHtml
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

    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.handleCopyMarkdown())
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.handleSaveMarkdown())
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
