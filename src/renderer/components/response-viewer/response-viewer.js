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
      this.render(state.prompt, state.history)
    })
  }

  /**
   * Render component based on state
   */
  render(promptState, historyState) {
    console.log('[SAM-DEBUG] ResponseViewer.render called')
    console.log('[SAM-DEBUG] promptState.hasStreamingResponse:', promptState.hasStreamingResponse)
    console.log('[SAM-DEBUG] historyState.selectedPrompt:', historyState.selectedPrompt ? 'exists' : 'null')
    if (historyState.selectedPrompt) {
      console.log('[SAM-DEBUG] historyState.selectedPrompt.response:', historyState.selectedPrompt.response ? 'exists' : 'null')
      if (historyState.selectedPrompt.response) {
        console.log('[SAM-DEBUG] response.content length:', historyState.selectedPrompt.response.content?.length || 0)
        console.log('[SAM-DEBUG] response.content preview:', historyState.selectedPrompt.response.content?.substring(0, 100) || '(empty)')
      }
    }

    // Priority: streaming response > selected prompt response > placeholder
    if (promptState.hasStreamingResponse) {
      console.log('[SAM-DEBUG] -> Rendering streaming response')
      this.renderStreaming(promptState.streamingResponse)
    } else if (historyState.selectedPrompt?.response) {
      console.log('[SAM-DEBUG] -> Rendering completed response')
      this.renderResponse(historyState.selectedPrompt)
    } else if (historyState.selectedPrompt) {
      console.log('[SAM-DEBUG] -> Rendering prompt only (no response yet)')
      this.renderPromptOnly(historyState.selectedPrompt)
    } else {
      console.log('[SAM-DEBUG] -> Rendering placeholder')
      this.renderPlaceholder()
    }
  }

  /**
   * Render streaming response
   */
  renderStreaming(content) {
    const html = this.parseMarkdown(content)
    this.container.innerHTML = `
      <div class="response-message streaming">
        ${html}
        <span class="streaming-cursor"></span>
      </div>
    `
    this.scrollToBottom()
  }

  /**
   * Render complete response
   */
  renderResponse(prompt) {
    console.log('[SAM-DEBUG] renderResponse called')
    console.log('[SAM-DEBUG] prompt.id:', prompt.id)
    console.log('[SAM-DEBUG] prompt.content length:', prompt.content?.length || 0)
    console.log('[SAM-DEBUG] prompt.response:', prompt.response ? 'exists' : 'null')
    console.log('[SAM-DEBUG] prompt.response.content:', prompt.response?.content || '(undefined/null)')
    console.log('[SAM-DEBUG] prompt.response.content length:', prompt.response?.content?.length || 0)
    console.log('[SAM-DEBUG] prompt.response.content type:', typeof prompt.response?.content)

    const html = this.parseMarkdown(prompt.response.content)
    console.log('[SAM-DEBUG] parseMarkdown result length:', html?.length || 0)
    console.log('[SAM-DEBUG] parseMarkdown result preview:', html?.substring(0, 100) || '(empty)')

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

    this.container.innerHTML = `
      <div class="prompt-display">
        <div class="prompt-label">You</div>
        <div class="prompt-content">${this.escapeHtml(prompt.content)}</div>
      </div>
      <div class="response-display">
        <div class="response-label">Claude</div>
        <div class="response-message">${html}</div>
        <div class="response-meta">
          ${metaParts.join(' • ')}
        </div>
      </div>
    `
    console.log('[SAM-DEBUG] renderResponse finished rendering')
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

    return html
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
   * Cleanup
   */
  destroy() {
    // Remove event listeners if needed
  }
}
