/**
 * DocumentEditorView - Main container component for the Document Editor Plugin UI
 * Vanilla JavaScript implementation (no JSX)
 *
 * Layout Structure:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ [New] [Open] [Save]  │  filename.js  │  ● Saved  │ [Auto-save] │ <- Toolbar
 * ├─────────────────────────────────────────────────────────────────┤
 * │  1 │ const foo = 'bar';                                        │
 * │  2 │ function hello() {                                        │
 * │  3 │   console.log('world');                                   │ <- Editor (flex: 1)
 * │  4 │ }                                                         │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ Ask AI about this document...                            [Ask] │ <- Prompt
 * ├─────────────────────────────────────────────────────────────────┤
 * │ [▼ Collapse] Response area (collapsible, max-height limited)   │ <- Response
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Key Features:
 * - Document editor is ALWAYS visible (flex: 1, min-height enforced)
 * - Response area is collapsible and has max-height to prevent pushing editor off-screen
 * - Responsive layout adapts to smaller screens
 * - Syntax highlighting via highlight.js for code files
 */

/**
 * Extension to highlight.js language mapping
 * Maps file extensions to highlight.js language identifiers
 */
const EXTENSION_TO_LANGUAGE = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.jsx': 'javascript',
  '.tsx': 'typescript',
  '.html': 'xml',
  '.htm': 'xml',
  '.xml': 'xml',
  '.svg': 'xml',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'scss',
  '.less': 'less',
  '.json': 'json',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.php': 'php',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'ini',
  '.ini': 'ini',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'bash',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.bat': 'dos',
  '.cmd': 'dos',
  '.txt': 'plaintext',
  '.log': 'plaintext',
  '.dockerfile': 'dockerfile',
  '.makefile': 'makefile',
  '.cmake': 'cmake',
  '.r': 'r',
  '.lua': 'lua',
  '.perl': 'perl',
  '.pl': 'perl',
  '.scala': 'scala',
  '.groovy': 'groovy',
  '.vue': 'xml',
  '.svelte': 'xml'
}

/**
 * Get highlight.js language for a file extension
 * @param {string} extension - File extension including dot (e.g., '.js')
 * @returns {string} Language identifier for highlight.js
 */
function getLanguageForExtension(extension) {
  if (!extension) return 'plaintext'
  const lang = EXTENSION_TO_LANGUAGE[extension.toLowerCase()]
  return lang || 'plaintext'
}

// Lazy-loaded highlight.js instance
let hljs = null

/**
 * Load highlight.js library dynamically
 * @returns {Promise<Object>} highlight.js instance
 */
async function loadHighlightJs() {
  if (hljs) return hljs

  try {
    // Try to load from node_modules via require (Electron with node integration)
    if (typeof window !== 'undefined' && window.require) {
      hljs = window.require('highlight.js')
      return hljs
    }

    // Fallback: try dynamic import
    const module = await import('highlight.js')
    hljs = module.default || module
    return hljs
  } catch (error) {
    console.warn('[DocumentEditorView] Could not load highlight.js:', error.message)
    return null
  }
}

// Import services
import { DocumentEditorPromptService, ResponseParser, SessionManager, ChangeTracker, SyntaxValidator, DocumentMerger } from '../services/index.js'

export class DocumentEditorView {
  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} options - Component options
   * @param {string} options.viewId - View ID
   * @param {Object} options.view - View configuration
   * @param {string} options.pluginName - Plugin name
   * @param {Object} options.context - Plugin context
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}

    // State
    this.state = {
      currentFile: null,
      content: '',
      extension: null,
      isModified: false,
      autoSaveEnabled: true,
      loading: true,
      error: null,
      responseCollapsed: false,
      responseContent: '',
      // AI prompt state
      selectedModel: 'haiku',
      thinkingBudget: 'none',
      contextFiles: [],           // Array of { type: 'gui'|'doc', path, name, content }
      isSubmitting: false,
      promptText: '',
      // Response handling state (Story 2)
      responseHistory: [],        // Array of parsed response objects
      currentResponse: null,      // Most recent response being displayed
      pendingQuestions: [],       // Questions awaiting answers
      showResponseModal: false,   // Whether to show the response modal
      sessionLoaded: false,       // Whether session has been loaded
      contentBeforeSubmit: '',    // Content snapshot for diff calculation
      // Change tracking state (Story 3)
      highlightChangesEnabled: true,  // Whether change highlights are visible
      hasTrackedChanges: false,       // Whether there are changes to highlight
      // Search state
      searchText: '',
      searchMatches: [],          // Array of { line, startIndex, endIndex }
      currentMatchIndex: -1,      // Current match index for navigation
      // Undo state
      undoStack: [],              // Stack of previous document states
      maxUndoStates: 20,          // Maximum undo history
      // Question answers state (persists across re-renders)
      pendingAnswers: {}          // Map of questionId -> answer text
    }

    // Auto-save timer
    this.autoSaveTimeout = null
    this.AUTOSAVE_DELAY = 1500 // 1.5 seconds

    // Highlight.js instance (loaded lazily)
    this.hljs = null
    this.hljsLoading = false

    // Syntax highlighting debounce timer (for performance with large files)
    this.highlightTimeout = null
    this.HIGHLIGHT_DELAY = 100 // 100ms debounce for highlighting

    // Bound methods for event listeners (needed for cleanup)
    this._boundKeyDown = this.handleGlobalKeyDown.bind(this)

    // Track event listeners for cleanup
    this.boundListeners = []

    // Initialize prompt service
    this.promptService = new DocumentEditorPromptService({
      pluginName: 'document-editor-plugin'
    })

    // Initialize response parser and session manager (Story 2)
    this.responseParser = new ResponseParser()
    this.sessionManager = new SessionManager({
      pluginName: 'document-editor-plugin'
    })

    // Initialize change tracker (Story 3)
    this.changeTracker = new ChangeTracker()

    // Initialize syntax validator (Story 5)
    this.syntaxValidator = new SyntaxValidator()

    // Initialize document merger for structured change application
    this.documentMerger = new DocumentMerger()
  }

  /**
   * Initialize the component
   */
  async init() {
    console.log('[DocumentEditorView] init() called')

    this.container.className = 'document-editor-view'
    this.state.loading = false
    this.render()

    // Add global keyboard shortcuts
    document.addEventListener('keydown', this._boundKeyDown)

    // Load highlight.js in background
    this.loadHighlighter()

    console.log('[DocumentEditorView] init() complete')
  }

  /**
   * Load highlight.js library
   */
  async loadHighlighter() {
    if (this.hljs || this.hljsLoading) return

    this.hljsLoading = true
    try {
      this.hljs = await loadHighlightJs()
      if (this.hljs) {
        console.log('[DocumentEditorView] highlight.js loaded successfully')
        // Re-apply highlighting if content is already loaded
        if (this.state.content) {
          this.updateHighlighting()
        }
      }
    } catch (error) {
      console.warn('[DocumentEditorView] Failed to load highlight.js:', error)
    } finally {
      this.hljsLoading = false
    }
  }

  /**
   * Render the view
   */
  render() {
    if (!this.container) return

    const hasFile = !!this.state.currentFile
    const responseCollapsed = this.state.responseCollapsed

    this.container.innerHTML = `
      <div class="document-editor-wrapper">
        <!-- Toolbar: File actions, filename, save indicator, auto-save toggle -->
        <div class="document-editor-toolbar" role="toolbar" aria-label="Document actions">
          <div class="document-editor-toolbar-left">
            <button class="document-editor-btn" data-action="new" title="New document (Ctrl+N)" aria-label="Create new document">
              <span class="document-editor-btn-icon" aria-hidden="true">📄</span>
              <span class="document-editor-btn-text">New</span>
            </button>
            <button class="document-editor-btn" data-action="open" title="Open file (Ctrl+O)" aria-label="Open existing file">
              <span class="document-editor-btn-icon" aria-hidden="true">📂</span>
              <span class="document-editor-btn-text">Open</span>
            </button>
            <button class="document-editor-btn" data-action="save" title="Save file (Ctrl+S)" aria-label="Save current file" ${!hasFile ? 'disabled' : ''}>
              <span class="document-editor-btn-icon" aria-hidden="true">💾</span>
              <span class="document-editor-btn-text">Save</span>
            </button>
            <button class="document-editor-btn" data-action="undo" title="Undo last AI edit" aria-label="Undo last AI change" ${!hasFile || this.state.undoStack.length === 0 ? 'disabled' : ''}>
              <span class="document-editor-btn-icon" aria-hidden="true">↩️</span>
              <span class="document-editor-btn-text">Undo AI</span>
            </button>
          </div>
          <div class="document-editor-toolbar-center">
            <span class="document-editor-filename" title="${this.escapeHtml(this.state.currentFile || '')}">
              ${hasFile ? this.getDisplayFilename() : 'No file open'}
            </span>
          </div>
          <div class="document-editor-toolbar-right">
            ${this.state.hasTrackedChanges ? `
            <div class="document-editor-highlight-controls">
              <label class="document-editor-highlight-toggle" title="Show/hide change highlights">
                <input type="checkbox" ${this.state.highlightChangesEnabled ? 'checked' : ''}>
                <span>Changes</span>
              </label>
              <button class="document-editor-btn document-editor-clear-highlights-btn" title="Clear all highlights">
                <span class="document-editor-btn-icon">✕</span>
              </button>
            </div>
            ` : ''}
            <span class="document-editor-save-indicator"></span>
            <label class="document-editor-autosave-toggle" title="Automatically save changes">
              <input type="checkbox" ${this.state.autoSaveEnabled ? 'checked' : ''}>
              <span>Auto-save</span>
            </label>
          </div>
        </div>

        <!-- Search bar -->
        <div class="document-editor-search-bar">
          <div class="document-editor-search-input-wrapper">
            <span class="document-editor-search-icon">🔍</span>
            <input type="text"
                   class="document-editor-search-input"
                   placeholder="Search in document... (Ctrl+F)"
                   value="${this.escapeHtml(this.state.searchText)}"
                   ${!hasFile ? 'disabled' : ''}>
            ${this.state.searchMatches.length > 0 ? `
              <span class="document-editor-search-count">
                ${this.state.currentMatchIndex + 1} / ${this.state.searchMatches.length}
              </span>
            ` : ''}
          </div>
          <button class="document-editor-btn document-editor-search-btn" data-action="search-prev" title="Previous match (Shift+Enter)" ${!hasFile || this.state.searchMatches.length === 0 ? 'disabled' : ''}>
            <span>▲</span>
          </button>
          <button class="document-editor-btn document-editor-search-btn" data-action="search-next" title="Next match (Enter)" ${!hasFile || this.state.searchMatches.length === 0 ? 'disabled' : ''}>
            <span>▼</span>
          </button>
          <button class="document-editor-btn document-editor-search-btn" data-action="search-clear" title="Clear search" ${!hasFile || !this.state.searchText ? 'disabled' : ''}>
            <span>✕</span>
          </button>
        </div>

        <!-- Main content area: Editor (left) + Response panel (right) -->
        <div class="document-editor-content-area">
          <!-- Editor side -->
          <div class="document-editor-main">
            ${this.renderMainContent()}
          </div>

          <!-- Response panel (right side) -->
          <div class="document-editor-response-panel ${responseCollapsed ? 'collapsed' : ''}">
            <div class="document-editor-response-header">
              <button class="document-editor-response-toggle" data-action="toggle-response" title="Toggle response panel" aria-label="Toggle AI response panel" aria-expanded="${!responseCollapsed}">
                <span class="document-editor-toggle-icon" aria-hidden="true">${responseCollapsed ? '◀' : '▶'}</span>
                <span>AI Response</span>
              </button>
            </div>
            <div class="document-editor-response-content">
              ${this.renderResponseContent()}
            </div>
          </div>
        </div>

        <!-- AI Prompt area: Controls, Input, and Send button -->
        <div class="document-editor-prompt-area">
          <!-- Prompt Controls Row -->
          <div class="document-editor-prompt-controls">
            <select class="document-editor-model-selector" ${!hasFile || this.state.isSubmitting ? 'disabled' : ''} title="Select AI model">
              <option value="haiku" ${this.state.selectedModel === 'haiku' ? 'selected' : ''}>Haiku (Fast)</option>
              <option value="sonnet" ${this.state.selectedModel === 'sonnet' ? 'selected' : ''}>Sonnet</option>
              <option value="opus" ${this.state.selectedModel === 'opus' ? 'selected' : ''}>Opus</option>
            </select>
            <select class="document-editor-thinking-selector" ${!hasFile || this.state.isSubmitting ? 'disabled' : ''} title="Extended thinking budget">
              <option value="none" ${this.state.thinkingBudget === 'none' ? 'selected' : ''}>No Thinking</option>
              <option value="think" ${this.state.thinkingBudget === 'think' ? 'selected' : ''}>Think (25%)</option>
              <option value="think-hard" ${this.state.thinkingBudget === 'think-hard' ? 'selected' : ''}>Think Hard (50%)</option>
            </select>
            <div class="document-editor-context-controls">
              <button class="document-editor-btn document-editor-add-context-btn" ${!hasFile || this.state.isSubmitting ? 'disabled' : ''} title="Add context file">
                <span class="document-editor-btn-icon">+</span>
                <span class="document-editor-btn-text">Context</span>
              </button>
            </div>
          </div>
          <!-- Context File Chips -->
          ${this.state.contextFiles.length > 0 ? `
          <div class="document-editor-context-chips">
            ${this.state.contextFiles.map((file, index) => `
              <span class="document-editor-context-chip" data-index="${index}" title="${this.escapeHtml(file.path)}">
                <span class="document-editor-chip-icon">${file.type === 'gui' ? '🎨' : '📄'}</span>
                <span class="document-editor-chip-name">${this.escapeHtml(file.name)}</span>
                <button class="document-editor-chip-remove" data-index="${index}" title="Remove context file" ${this.state.isSubmitting ? 'disabled' : ''}>×</button>
              </span>
            `).join('')}
          </div>
          ` : ''}
          <!-- Prompt Input Row -->
          <div class="document-editor-prompt-input-row">
            <textarea
              class="document-editor-prompt-input"
              placeholder="Describe changes to make... (Ctrl+Enter to send)"
              rows="6"
              ${!hasFile || this.state.isSubmitting ? 'disabled' : ''}
            >${this.escapeHtml(this.state.promptText)}</textarea>
            <button class="document-editor-btn document-editor-btn-primary document-editor-prompt-btn ${this.state.isSubmitting ? 'submitting' : ''}"
                    aria-label="Send prompt to Claude"
                    ${!hasFile || this.state.isSubmitting ? 'disabled' : ''}>
              ${this.state.isSubmitting ? `
                <span class="document-editor-btn-spinner"></span>
                <span>Sending...</span>
              ` : `
                <span class="document-editor-btn-icon">🚀</span>
                <span class="document-editor-btn-text">Send</span>
              `}
            </button>
          </div>
        </div>
      </div>
      ${this.renderResponseModal()}
    `

    this.attachEventListeners()
    this.updateSaveIndicator()

    // Focus the textarea if a file is open
    if (hasFile) {
      const textarea = this.container.querySelector('.document-editor-textarea')
      if (textarea) {
        // Restore content to textarea
        textarea.value = this.state.content
        this.updateLineNumbers()
        this.updateHighlighting()
      }
    }
  }

  /**
   * Render main content area (empty state or editor)
   */
  renderMainContent() {
    if (!this.state.currentFile) {
      return `
        <div class="document-editor-empty-state">
          <div class="document-editor-empty-icon">📝</div>
          <h3>No Document Open</h3>
          <p>Create a new document or open an existing file to get started.</p>
          <div class="document-editor-empty-actions">
            <button class="document-editor-btn document-editor-btn-primary" data-action="new" aria-label="Create new document">
              <span class="document-editor-btn-icon" aria-hidden="true">📄</span>
              New Document
            </button>
            <button class="document-editor-btn" data-action="open" aria-label="Open existing file">
              <span class="document-editor-btn-icon" aria-hidden="true">📂</span>
              Open File
            </button>
          </div>
          <div class="document-editor-empty-hint">
            <p>Keyboard shortcuts: <kbd>Ctrl+N</kbd> New, <kbd>Ctrl+O</kbd> Open, <kbd>Ctrl+S</kbd> Save</p>
          </div>
        </div>
      `
    }

    // Editor area - will be enhanced in Story 3 with syntax highlighting
    return `
      <div class="document-editor-editor-area">
        <div class="document-editor-line-numbers"></div>
        <div class="document-editor-code-wrapper">
          <pre class="document-editor-highlight-layer"><code></code></pre>
          <textarea class="document-editor-textarea" spellcheck="false" placeholder="Start typing..."></textarea>
        </div>
      </div>
    `
  }

  /**
   * Render AI response content area with summaries, questions, and history
   */
  renderResponseContent() {
    // Show placeholder if no responses and not submitting
    if (!this.state.currentResponse && this.state.responseHistory.length === 0 && !this.state.isSubmitting) {
      return `
        <div class="document-editor-response-placeholder">
          AI responses will appear here. Ask a question about your document to get started.
        </div>
      `
    }

    // Show loading state
    if (this.state.isSubmitting && !this.state.currentResponse) {
      return `
        <div class="document-editor-response-loading">
          <span class="document-editor-response-spinner"></span>
          <span>Processing your request...</span>
        </div>
      `
    }

    const parts = []

    // Current response (most recent)
    if (this.state.currentResponse) {
      parts.push(this.renderSingleResponse(this.state.currentResponse, true))
    }

    // Response history (older responses)
    if (this.state.responseHistory.length > 0) {
      const historyResponses = this.state.currentResponse
        ? this.state.responseHistory.filter(r => r.id !== this.state.currentResponse.id)
        : this.state.responseHistory

      if (historyResponses.length > 0) {
        parts.push(`
          <div class="document-editor-response-history">
            <div class="document-editor-history-header">
              <span class="document-editor-history-title">Previous Responses (${historyResponses.length})</span>
            </div>
            <div class="document-editor-history-list">
              ${historyResponses.map(response => this.renderSingleResponse(response, false)).join('')}
            </div>
          </div>
        `)
      }
    }

    return parts.join('') || `
      <div class="document-editor-response-placeholder">
        AI responses will appear here. Ask a question about your document to get started.
      </div>
    `
  }

  /**
   * Render a single response entry
   * @param {Object} response - Parsed response object
   * @param {boolean} isCurrent - Whether this is the current (most recent) response
   * @returns {string} HTML for the response
   */
  renderSingleResponse(response, isCurrent) {
    const collapsed = response.collapsed && !isCurrent
    const timeStr = this.formatTimestamp(response.timestamp)
    const hasQuestions = response.questions && response.questions.length > 0
    const unansweredCount = hasQuestions
      ? response.questions.filter(q => !q.answered).length
      : 0

    return `
      <div class="document-editor-response-entry ${isCurrent ? 'current' : 'history'} ${collapsed ? 'collapsed' : ''}" data-response-id="${response.id}">
        <div class="document-editor-response-entry-header">
          <button class="document-editor-response-collapse-btn" data-response-id="${response.id}" title="${collapsed ? 'Expand' : 'Collapse'}">
            <span class="document-editor-collapse-icon">${collapsed ? '▶' : '▼'}</span>
          </button>
          <span class="document-editor-response-prompt" title="${this.escapeHtml(response.prompt)}">
            ${this.escapeHtml(this.truncateText(response.prompt, 50))}
          </span>
          <span class="document-editor-response-time">${timeStr}</span>
          ${unansweredCount > 0 ? `<span class="document-editor-response-badge">${unansweredCount} question${unansweredCount > 1 ? 's' : ''}</span>` : ''}
        </div>
        <div class="document-editor-response-entry-content ${collapsed ? 'hidden' : ''}">
          ${this.renderChangeSummary(response)}
          ${this.renderValidationErrors(response)}
          ${hasQuestions ? this.renderQuestions(response) : ''}
          ${this.renderDiffStats(response.diffStats)}
        </div>
      </div>
    `
  }

  /**
   * Render validation errors section
   * @param {Object} response - Response object
   * @returns {string} HTML for validation errors
   */
  renderValidationErrors(response) {
    if (!response.validationErrors || response.validationErrors.length === 0) {
      return ''
    }

    const errorItems = response.validationErrors.map(error => {
      const lineInfo = error.line ? ` (line ${error.line})` : ''
      const sourceInfo = error.source === 'client-validation' ? ' [client]' : ''
      const severityClass = error.severity === 'warning'
        ? 'document-editor-validation-warning'
        : 'document-editor-validation-error'
      const icon = error.severity === 'warning' ? '⚠️' : '❌'

      return `
        <li class="${severityClass}">
          <span class="document-editor-validation-icon">${icon}</span>
          <span class="document-editor-validation-message">${this.escapeHtml(error.message)}${lineInfo}${sourceInfo}</span>
        </li>
      `
    }).join('')

    return `
      <div class="document-editor-validation-errors">
        <div class="document-editor-validation-label">Validation Issues:</div>
        <ul class="document-editor-validation-list">
          ${errorItems}
        </ul>
      </div>
    `
  }

  /**
   * Render change summary section
   * @param {Object} response - Response object
   * @returns {string} HTML for summary
   */
  renderChangeSummary(response) {
    if (!response.summary) return ''

    return `
      <div class="document-editor-change-summary">
        <div class="document-editor-summary-label">Changes Made:</div>
        <div class="document-editor-summary-content">${this.formatSummary(response.summary)}</div>
      </div>
    `
  }

  /**
   * Format summary text with bullet points
   * @param {string} summary - Raw summary text
   * @returns {string} Formatted HTML
   */
  formatSummary(summary) {
    if (!summary) return ''

    // Convert bullet points to HTML list
    const lines = summary.split('\n').filter(l => l.trim())
    const hasBullets = lines.some(l => /^[-*]\s/.test(l.trim()))

    if (hasBullets) {
      const items = lines
        .filter(l => /^[-*]\s/.test(l.trim()))
        .map(l => `<li>${this.escapeHtml(l.replace(/^[-*]\s+/, '').trim())}</li>`)
        .join('')
      return `<ul class="document-editor-summary-list">${items}</ul>`
    }

    // Plain text
    return `<p>${this.escapeHtml(summary)}</p>`
  }

  /**
   * Render questions section with answer inputs
   * @param {Object} response - Response object
   * @returns {string} HTML for questions
   */
  renderQuestions(response) {
    if (!response.questions || response.questions.length === 0) return ''

    const unansweredQuestions = response.questions.filter(q => !q.answered)
    const hasUnanswered = unansweredQuestions.length > 0

    const questionsHtml = response.questions.map(q => {
      // Get persisted answer value from state
      const pendingAnswer = this.state.pendingAnswers[q.id] || ''

      return `
        <div class="document-editor-question ${q.answered ? 'answered' : ''}" data-question-id="${q.id}" data-response-id="${response.id}">
          <div class="document-editor-question-text">
            <span class="document-editor-question-icon">${q.answered ? '✓' : '?'}</span>
            ${this.escapeHtml(q.question)}
          </div>
          ${q.answered ? `
            <div class="document-editor-question-answer">
              <span class="document-editor-answer-label">Your answer:</span>
              ${this.escapeHtml(q.answer)}
            </div>
          ` : `
            <div class="document-editor-question-input-row">
              <input
                type="text"
                class="document-editor-question-input"
                placeholder="Type your answer..."
                value="${this.escapeHtml(pendingAnswer)}"
                data-question-id="${q.id}"
                data-response-id="${response.id}"
                ${this.state.isSubmitting ? 'disabled' : ''}
              >
            </div>
          `}
        </div>
      `
    }).join('')

    // Single submit button for all answers
    const submitButton = hasUnanswered ? `
      <button
        class="document-editor-btn document-editor-btn-primary document-editor-submit-all-answers-btn"
        data-response-id="${response.id}"
        ${this.state.isSubmitting ? 'disabled' : ''}
      >
        Submit All Answers
      </button>
    ` : ''

    return `
      <div class="document-editor-questions-section">
        <div class="document-editor-questions-label">Questions from Claude:</div>
        ${questionsHtml}
        ${submitButton}
      </div>
    `
  }

  /**
   * Render the response modal (shows Claude's response including questions)
   * @returns {string} HTML for the modal
   */
  renderResponseModal() {
    if (!this.state.showResponseModal || !this.state.currentResponse) return ''

    const response = this.state.currentResponse
    const questions = response.questions || []
    const unanswered = questions.filter(q => !q.answered)
    const hasQuestions = unanswered.length > 0
    const hasValidationErrors = response.validationErrors && response.validationErrors.length > 0
    const documentApplied = response.documentApplied

    // Determine modal title and icon
    let titleIcon = '✅'
    let titleText = 'Changes Applied'
    if (hasQuestions) {
      titleIcon = '❓'
      titleText = 'Claude has questions'
    } else if (hasValidationErrors && !documentApplied) {
      titleIcon = '⚠️'
      titleText = 'Issues Found'
    } else if (!documentApplied) {
      titleIcon = 'ℹ️'
      titleText = 'Response from Claude'
    }

    // Build summary section
    const summaryHtml = response.summary ? `
      <div class="document-editor-modal-section">
        <div class="document-editor-modal-section-label">Summary</div>
        <div class="document-editor-modal-section-content">${this.formatSummary(response.summary)}</div>
      </div>
    ` : ''

    // Build questions section
    const answeredCount = questions.filter(q => q.answered).length
    const questionsHtml = questions.length > 0 ? `
      <div class="document-editor-modal-section">
        <div class="document-editor-modal-section-label ${hasQuestions ? 'warning' : ''}">
          ${hasQuestions ? `Questions (${answeredCount}/${questions.length} answered)` : 'Questions (all answered)'}
        </div>
        ${hasQuestions ? `
          <div class="document-editor-modal-hint">
            Answer all questions to continue. Claude will then make the requested changes.
          </div>
        ` : ''}
        ${questions.map(q => `
          <div class="document-editor-modal-question ${q.answered ? 'answered' : ''}" data-question-id="${q.id}">
            <div class="document-editor-modal-question-text">
              <span class="document-editor-modal-question-icon">${q.answered ? '✓' : '?'}</span>
              <span>${this.escapeHtml(q.question)}</span>
            </div>
            ${q.answered ? `
              <div class="document-editor-modal-question-answer">
                Your answer: ${this.escapeHtml(q.answer)}
              </div>
            ` : `
              <div class="document-editor-modal-input-row">
                <input
                  type="text"
                  class="document-editor-modal-question-input"
                  placeholder="Type your answer and press Enter..."
                  data-question-id="${q.id}"
                  data-response-id="${response.id}"
                >
                <button
                  class="document-editor-btn document-editor-btn-primary document-editor-modal-reply-btn"
                  data-question-id="${q.id}"
                  data-response-id="${response.id}"
                >
                  Reply
                </button>
              </div>
            `}
          </div>
        `).join('')}
      </div>
    ` : ''

    // Build validation errors section
    const errorsHtml = hasValidationErrors ? `
      <div class="document-editor-modal-section">
        <div class="document-editor-modal-section-label error">Validation Issues</div>
        <ul class="document-editor-modal-errors">
          ${response.validationErrors.map(e => `
            <li class="document-editor-modal-error-item ${e.severity || 'error'}">
              <span class="document-editor-modal-error-icon">${e.severity === 'warning' ? '⚠️' : '❌'}</span>
              <span>${this.escapeHtml(e.message)}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    ` : ''

    // Build stats section
    const statsHtml = documentApplied && response.diffStats ? `
      <div class="document-editor-modal-stats">
        ${response.diffStats.added > 0 ? `<span class="stat-added">+${response.diffStats.added}</span>` : ''}
        ${response.diffStats.modified > 0 ? `<span class="stat-modified">~${response.diffStats.modified}</span>` : ''}
        ${response.diffStats.deleted > 0 ? `<span class="stat-deleted">-${response.diffStats.deleted}</span>` : ''}
        <span class="stat-label">lines changed</span>
      </div>
    ` : ''

    return `
      <div class="document-editor-questions-modal-overlay" data-action="close-response-modal">
        <div class="document-editor-questions-modal" onclick="event.stopPropagation()">
          <div class="document-editor-questions-modal-header">
            <div class="document-editor-questions-modal-title">
              <span class="document-editor-questions-modal-title-icon">${titleIcon}</span>
              <span>${titleText}</span>
            </div>
            <button class="document-editor-questions-modal-close" data-action="close-response-modal" title="Close">×</button>
          </div>
          <div class="document-editor-questions-modal-body">
            ${statsHtml}
            ${summaryHtml}
            ${questionsHtml}
            ${errorsHtml}
          </div>
          <div class="document-editor-questions-modal-footer">
            <button class="document-editor-btn ${hasQuestions ? '' : 'document-editor-btn-primary'}" data-action="close-response-modal">
              ${hasQuestions ? 'Close (answer later)' : 'OK'}
            </button>
          </div>
        </div>
      </div>
    `
  }

  /**
   * Render diff statistics
   * @param {Object} diffStats - Diff statistics object
   * @returns {string} HTML for stats
   */
  renderDiffStats(diffStats) {
    if (!diffStats) return ''

    const { added, modified, deleted } = diffStats
    if (added === 0 && modified === 0 && deleted === 0) return ''

    const parts = []
    if (added > 0) parts.push(`<span class="document-editor-stat-added">+${added}</span>`)
    if (modified > 0) parts.push(`<span class="document-editor-stat-modified">~${modified}</span>`)
    if (deleted > 0) parts.push(`<span class="document-editor-stat-deleted">-${deleted}</span>`)

    return `
      <div class="document-editor-diff-stats">
        ${parts.join(' ')}
        <span class="document-editor-stat-label">lines</span>
      </div>
    `
  }

  /**
   * Format a timestamp for display
   * @param {string} timestamp - ISO timestamp
   * @returns {string} Formatted time string
   */
  formatTimestamp(timestamp) {
    if (!timestamp) return ''

    try {
      const date = new Date(timestamp)
      const now = new Date()
      const diffMs = now - date
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)

      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffHours < 24) return `${diffHours}h ago`

      return date.toLocaleDateString()
    } catch {
      return ''
    }
  }

  /**
   * Truncate text to a maximum length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  /**
   * Get display filename from full path
   * @returns {string} Filename with extension
   */
  getDisplayFilename() {
    if (!this.state.currentFile) return 'Untitled'
    const filename = this.state.currentFile.split(/[/\\]/).pop()
    return filename || 'Untitled'
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * Add and track an event listener for later cleanup
   * @param {Element} element - DOM element
   * @param {string} event - Event type
   * @param {Function} handler - Event handler
   */
  addTrackedListener(element, event, handler) {
    if (!element) return
    element.addEventListener(event, handler)
    this.boundListeners.push({ element, event, handler })
  }

  /**
   * Remove all tracked event listeners
   */
  cleanupListeners() {
    for (const { element, event, handler } of this.boundListeners) {
      try {
        element.removeEventListener(event, handler)
      } catch {
        // Element may have been removed from DOM, ignore
      }
    }
    this.boundListeners = []
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Clean up any existing listeners first
    this.cleanupListeners()

    // Action buttons (toolbar and empty state)
    this.container.querySelectorAll('[data-action]').forEach(btn => {
      const handler = (e) => {
        e.preventDefault()
        const action = e.currentTarget.dataset.action
        this.handleAction(action)
      }
      this.addTrackedListener(btn, 'click', handler)
    })

    // Auto-save toggle
    const autoSaveCheckbox = this.container.querySelector('.document-editor-autosave-toggle input')
    if (autoSaveCheckbox) {
      const handler = (e) => this.toggleAutoSave(e.target.checked)
      this.addTrackedListener(autoSaveCheckbox, 'change', handler)
    }

    // Editor textarea (if present)
    const textarea = this.container.querySelector('.document-editor-textarea')
    if (textarea) {
      const inputHandler = this.handleInput.bind(this)
      const scrollHandler = this.syncScroll.bind(this)
      const keydownHandler = this.handleKeyDown.bind(this)
      this.addTrackedListener(textarea, 'input', inputHandler)
      this.addTrackedListener(textarea, 'scroll', scrollHandler)
      this.addTrackedListener(textarea, 'keydown', keydownHandler)
    }

    // AI prompt input - Ctrl+Enter (or Cmd+Enter on Mac) to submit
    const promptInput = this.container.querySelector('.document-editor-prompt-input')
    if (promptInput) {
      const keyHandler = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          this.handleAskAI()
        }
      }
      const inputHandler = (e) => {
        this.state.promptText = e.target.value
      }
      this.addTrackedListener(promptInput, 'keydown', keyHandler)
      this.addTrackedListener(promptInput, 'input', inputHandler)
    }

    // AI Send button
    const askBtn = this.container.querySelector('.document-editor-prompt-btn')
    if (askBtn) {
      const handler = () => this.handleAskAI()
      this.addTrackedListener(askBtn, 'click', handler)
    }

    // Model selector
    const modelSelector = this.container.querySelector('.document-editor-model-selector')
    if (modelSelector) {
      const handler = (e) => {
        this.state.selectedModel = e.target.value
        console.log('[DocumentEditorView] Model changed:', this.state.selectedModel)
      }
      this.addTrackedListener(modelSelector, 'change', handler)
    }

    // Thinking budget selector
    const thinkingSelector = this.container.querySelector('.document-editor-thinking-selector')
    if (thinkingSelector) {
      const handler = (e) => {
        this.state.thinkingBudget = e.target.value
        console.log('[DocumentEditorView] Thinking budget changed:', this.state.thinkingBudget)
      }
      this.addTrackedListener(thinkingSelector, 'change', handler)
    }

    // Add context file button
    const addContextBtn = this.container.querySelector('.document-editor-add-context-btn')
    if (addContextBtn) {
      const handler = () => this.handleAddContextFile()
      this.addTrackedListener(addContextBtn, 'click', handler)
    }

    // Remove context file buttons
    this.container.querySelectorAll('.document-editor-chip-remove').forEach(btn => {
      const handler = (e) => {
        e.stopPropagation()
        const index = parseInt(e.currentTarget.dataset.index, 10)
        this.handleRemoveContextFile(index)
      }
      this.addTrackedListener(btn, 'click', handler)
    })

    // Highlight changes toggle (Story 3)
    const highlightToggle = this.container.querySelector('.document-editor-highlight-toggle input')
    if (highlightToggle) {
      const handler = (e) => this.toggleHighlightChanges(e.target.checked)
      this.addTrackedListener(highlightToggle, 'change', handler)
    }

    // Clear highlights button (Story 3)
    const clearHighlightsBtn = this.container.querySelector('.document-editor-clear-highlights-btn')
    if (clearHighlightsBtn) {
      const handler = () => this.clearHighlights()
      this.addTrackedListener(clearHighlightsBtn, 'click', handler)
    }

    // Search input
    const searchInput = this.container.querySelector('.document-editor-search-input')
    if (searchInput) {
      const inputHandler = (e) => this.handleSearchInput(e.target.value)
      const keyHandler = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          if (e.shiftKey) {
            this.searchPrev()
          } else {
            this.searchNext()
          }
        } else if (e.key === 'Escape') {
          this.clearSearch()
        }
      }
      this.addTrackedListener(searchInput, 'input', inputHandler)
      this.addTrackedListener(searchInput, 'keydown', keyHandler)
    }

    // Attach question and modal listeners
    this.attachQuestionListeners()
  }

  /**
   * Handle global keyboard shortcuts
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleGlobalKeyDown(e) {
    // Only handle if this view is active/visible
    if (!this.container || !this.container.offsetParent) return

    const isMod = e.ctrlKey || e.metaKey

    if (isMod && e.key === 'n') {
      e.preventDefault()
      this.handleNew()
    } else if (isMod && e.key === 'o') {
      e.preventDefault()
      this.handleOpen()
    } else if (isMod && e.key === 's') {
      e.preventDefault()
      this.handleSave()
    } else if (isMod && e.key === 'f') {
      e.preventDefault()
      this.focusSearch()
    }
  }

  /**
   * Focus the search input
   */
  focusSearch() {
    const searchInput = this.container.querySelector('.document-editor-search-input')
    if (searchInput) {
      searchInput.focus()
      searchInput.select()
    }
  }

  /**
   * Handle search input change
   * @param {string} text - Search text
   */
  handleSearchInput(text) {
    this.state.searchText = text

    if (!text) {
      this.state.searchMatches = []
      this.state.currentMatchIndex = -1
      this.updateHighlighting()
      this.updateSearchUI()
      return
    }

    // Find all matches
    const content = this.state.content || ''
    const lines = content.split('\n')
    const matches = []
    const searchLower = text.toLowerCase()

    lines.forEach((line, lineIndex) => {
      const lineLower = line.toLowerCase()
      let startIndex = 0
      while (true) {
        const index = lineLower.indexOf(searchLower, startIndex)
        if (index === -1) break
        matches.push({
          line: lineIndex,
          startIndex: index,
          endIndex: index + text.length
        })
        startIndex = index + 1
      }
    })

    this.state.searchMatches = matches
    this.state.currentMatchIndex = matches.length > 0 ? 0 : -1

    this.updateLineNumbers()
    this.updateSearchUI()

    // Scroll to first match
    if (matches.length > 0) {
      this.scrollToMatch(0)
    }
  }

  /**
   * Go to next search match
   */
  searchNext() {
    if (this.state.searchMatches.length === 0) return

    this.state.currentMatchIndex = (this.state.currentMatchIndex + 1) % this.state.searchMatches.length
    this.updateSearchUI()
    this.scrollToMatch(this.state.currentMatchIndex)
    this.updateLineNumbers()
  }

  /**
   * Go to previous search match
   */
  searchPrev() {
    if (this.state.searchMatches.length === 0) return

    this.state.currentMatchIndex = this.state.currentMatchIndex <= 0
      ? this.state.searchMatches.length - 1
      : this.state.currentMatchIndex - 1
    this.updateSearchUI()
    this.scrollToMatch(this.state.currentMatchIndex)
    this.updateLineNumbers()
  }

  /**
   * Clear search
   */
  clearSearch() {
    this.state.searchText = ''
    this.state.searchMatches = []
    this.state.currentMatchIndex = -1

    const searchInput = this.container.querySelector('.document-editor-search-input')
    if (searchInput) {
      searchInput.value = ''
    }

    this.updateLineNumbers()
    this.updateSearchUI()
  }

  /**
   * Update search UI (count display, button states)
   */
  updateSearchUI() {
    const countEl = this.container.querySelector('.document-editor-search-count')
    if (countEl) {
      if (this.state.searchMatches.length > 0) {
        countEl.textContent = `${this.state.currentMatchIndex + 1} / ${this.state.searchMatches.length}`
        countEl.style.display = ''
      } else {
        countEl.style.display = 'none'
      }
    }

    // Update button states
    const prevBtn = this.container.querySelector('[data-action="search-prev"]')
    const nextBtn = this.container.querySelector('[data-action="search-next"]')
    const clearBtn = this.container.querySelector('[data-action="search-clear"]')

    if (prevBtn) prevBtn.disabled = this.state.searchMatches.length === 0
    if (nextBtn) nextBtn.disabled = this.state.searchMatches.length === 0
    if (clearBtn) clearBtn.disabled = !this.state.searchText
  }

  /**
   * Scroll to a specific match
   * @param {number} matchIndex - Index of match to scroll to
   */
  scrollToMatch(matchIndex) {
    const match = this.state.searchMatches[matchIndex]
    if (!match) return

    const textarea = this.container.querySelector('.document-editor-textarea')
    if (!textarea) return

    // Calculate approximate scroll position based on line number
    const lineHeight = 21 // Matches CSS line-height
    const targetY = match.line * lineHeight

    textarea.scrollTop = Math.max(0, targetY - textarea.clientHeight / 2)
  }

  /**
   * Handle AI prompt submission
   */
  async handleAskAI() {
    const promptInput = this.container.querySelector('.document-editor-prompt-input')
    const prompt = this.state.promptText?.trim() || promptInput?.value?.trim()

    if (!prompt || !this.state.currentFile || this.state.isSubmitting) return

    console.log('[DocumentEditorView] Submitting AI prompt:', {
      prompt,
      model: this.state.selectedModel,
      thinkingBudget: this.state.thinkingBudget,
      contextFiles: this.state.contextFiles.length
    })

    // Store content before submission for diff calculation
    this.state.contentBeforeSubmit = this.state.content

    // Record baseline for change tracking (Story 3)
    this.changeTracker.recordBaseline(this.state.content)

    // Set submitting state and update UI
    this.state.isSubmitting = true
    this.state.promptText = ''
    this.updatePromptUI()

    // Ensure response area is expanded
    if (this.state.responseCollapsed) {
      this.toggleResponseArea()
    }

    // Update response content to show loading state
    this.updateResponseContent()

    try {
      // Submit via the prompt service
      const result = await this.promptService.submit({
        filename: this.getDisplayFilename(),
        filePath: this.state.currentFile,
        extension: this.state.extension,
        content: this.state.content,
        userPrompt: prompt,
        model: this.state.selectedModel,
        thinkingBudget: this.state.thinkingBudget,
        contextFiles: this.state.contextFiles.map(f => ({
          name: f.name,
          path: f.path,
          extension: f.extension,
          content: f.content
        })),
        branchId: 'plugin',
        sessionId: null
      })

      // Process the response using ResponseParser
      await this.processAIResponse(result, prompt)

    } catch (error) {
      console.error('[DocumentEditorView] AI submission error:', error)

      // Create an error response entry
      const errorResponse = {
        id: this.generateResponseId(),
        timestamp: new Date().toISOString(),
        prompt,
        summary: `Error: ${error.message}`,
        questions: [],
        fullResponse: error.message,
        diffStats: { added: 0, modified: 0, deleted: 0 },
        model: this.state.selectedModel,
        collapsed: false
      }

      this.state.currentResponse = errorResponse
      this.updateResponseContent()
    } finally {
      this.state.isSubmitting = false
      this.updatePromptUI()
    }
  }

  /**
   * Process AI response and update state
   * Claude responds with either:
   * - Questions (## Questions section) - displayed in modal for user to answer
   * - Structured changes (<<<CHANGE>>> blocks) - preferred, applies diffs
   * - Full document (## Updated Document section) - fallback, replaces entire document
   *
   * @param {Object} result - Raw result from promptService.submit()
   * @param {string} prompt - Original user prompt
   */
  async processAIResponse(result, prompt) {
    const rawResponse = result?.response || result?.text || result?.content || ''
    console.log('[DocumentEditorView] Processing AI response, length:', rawResponse.length)

    // Parse response for questions and updated document
    const questions = this.extractQuestions(rawResponse)
    const summary = this.extractSummary(rawResponse)

    let documentApplied = false
    let validationErrors = []
    let appliedChanges = []
    let failedChanges = []

    // Response type: QUESTIONS - Claude needs clarification
    if (questions.length > 0) {
      console.log('[DocumentEditorView] Claude asked', questions.length, 'question(s)')
      // Don't apply any document changes when there are questions
    }
    // Response type: STRUCTURED CHANGES - preferred format using DocumentMerger
    else if (this.documentMerger.hasStructuredChanges(rawResponse)) {
      console.log('[DocumentEditorView] Found structured changes, using DocumentMerger')

      const parsed = this.documentMerger.parseChanges(rawResponse)

      if (parsed.parseErrors.length > 0) {
        console.warn('[DocumentEditorView] Parse errors:', parsed.parseErrors)
        validationErrors = parsed.parseErrors.map(e => ({
          id: this.generateResponseId(),
          message: e,
          severity: 'warning'
        }))
      }

      if (parsed.changes.length > 0) {
        // Push current state to undo stack before applying changes
        this.pushUndoState()

        // Apply changes to the document
        const mergeResult = this.documentMerger.applyChanges(this.state.content, parsed.changes)
        appliedChanges = mergeResult.applied
        failedChanges = mergeResult.failed

        if (appliedChanges.length > 0) {
          // Validate the result
          const validation = this.syntaxValidator.validate(mergeResult.content, this.state.extension)

          if (validation.valid) {
            this.state.content = mergeResult.content
            this.state.isModified = true
            documentApplied = true

            // Update textarea
            const textarea = this.container.querySelector('.document-editor-textarea')
            if (textarea) {
              textarea.value = mergeResult.content
            }

            // Update display
            this.updateHighlighting()
            this.updateLineNumbers()

            console.log('[DocumentEditorView] Applied', appliedChanges.length, 'changes via DocumentMerger')
          } else {
            console.warn('[DocumentEditorView] Validation failed after merge:', validation.errors)
            validationErrors = validation.errors.map(e => ({
              id: this.generateResponseId(),
              message: e.message,
              severity: 'error',
              line: e.line
            }))
          }
        }

        if (failedChanges.length > 0) {
          console.warn('[DocumentEditorView] Failed changes:', failedChanges)
          validationErrors.push(...failedChanges.map(f => ({
            id: this.generateResponseId(),
            message: `Failed to apply change: ${f.error}`,
            severity: 'warning'
          })))
        }
      }
    }
    // Response type: FULL DOCUMENT UPDATE - fallback format
    else {
      const updatedContent = this.extractUpdatedDocument(rawResponse)

      if (updatedContent !== null) {
        // Safety check: warn if document shrinks significantly
        const originalLines = this.state.content.split('\n').length
        const newLines = updatedContent.split('\n').length
        const shrinkagePercent = ((originalLines - newLines) / originalLines) * 100

        if (shrinkagePercent > 50 && originalLines > 20) {
          console.warn('[DocumentEditorView] WARNING: Document would shrink by', shrinkagePercent.toFixed(0), '% - possible truncation')
          validationErrors.push({
            id: this.generateResponseId(),
            message: `Document shrinks by ${shrinkagePercent.toFixed(0)}% (${originalLines} -> ${newLines} lines). This may indicate truncation. Undo if unintended.`,
            severity: 'warning'
          })
        }

        // Validate before applying
        const validation = this.syntaxValidator.validate(updatedContent, this.state.extension)

        if (validation.valid) {
          // Push current state to undo stack before applying changes
          this.pushUndoState()

          // Apply the complete updated document
          this.state.content = updatedContent
          this.state.isModified = true
          documentApplied = true

          // Update textarea
          const textarea = this.container.querySelector('.document-editor-textarea')
          if (textarea) {
            textarea.value = updatedContent
          }

          // Update display
          this.updateHighlighting()
          this.updateLineNumbers()

          console.log('[DocumentEditorView] Applied updated document (full replacement)')
        } else {
          console.warn('[DocumentEditorView] Validation failed:', validation.errors)
          validationErrors.push(...validation.errors.map(e => ({
            id: this.generateResponseId(),
            message: e.message,
            severity: 'error',
            line: e.line
          })))
        }
      } else {
        console.log('[DocumentEditorView] No questions or document update found in response')
      }
    }

    // Calculate diff stats if document was applied
    let diffStats = { added: 0, modified: 0, deleted: 0 }
    if (documentApplied) {
      const beforeLines = (this.state.contentBeforeSubmit || '').split('\n').length
      const afterLines = this.state.content.split('\n').length
      diffStats = {
        added: Math.max(0, afterLines - beforeLines),
        deleted: Math.max(0, beforeLines - afterLines),
        modified: appliedChanges.length > 0 ? appliedChanges.length : 1
      }
    }

    // Generate summary for structured changes
    let effectiveSummary = summary
    if (!effectiveSummary && appliedChanges.length > 0) {
      effectiveSummary = `Applied ${appliedChanges.length} change(s) to document`
    }

    // Create response entry
    const responseEntry = {
      id: this.generateResponseId(),
      timestamp: new Date().toISOString(),
      prompt,
      summary: effectiveSummary || (documentApplied ? 'Document updated' : (questions.length > 0 ? 'Clarification needed' : 'No changes')),
      questions,
      fullResponse: rawResponse,
      diffStats,
      validationErrors,
      appliedChanges: appliedChanges.length,
      failedChanges: failedChanges.length,
      model: this.state.selectedModel,
      collapsed: false,
      documentApplied
    }

    // Update state
    this.state.currentResponse = responseEntry
    this.state.pendingQuestions = questions.filter(q => !q.answered)
    // Response shown in bottom panel, not modal

    // Add to history
    if (this.sessionManager.isLoaded()) {
      await this.sessionManager.addResponse(responseEntry)
      this.state.responseHistory = this.sessionManager.getResponses()
    } else {
      this.state.responseHistory.unshift(responseEntry)
      if (this.state.responseHistory.length > 50) {
        this.state.responseHistory = this.state.responseHistory.slice(0, 50)
      }
    }

    console.log('[DocumentEditorView] Response processed:', {
      hasQuestions: questions.length > 0,
      documentApplied,
      summary: summary?.substring(0, 50)
    })

    // Track changes for highlighting
    if (documentApplied) {
      this.computeAndTrackChanges()
    }

    // Render to show modal
    this.render()

    // Auto-save if enabled
    if (documentApplied && this.state.autoSaveEnabled && this.state.currentFile) {
      this.scheduleAutoSave()
    }
  }

  /**
   * Extract questions from Claude's response
   * Looks for ## Questions section with numbered items
   * @param {string} response - Raw response text
   * @returns {Array} Array of question objects
   */
  extractQuestions(response) {
    if (!response) return []

    const questions = []
    const questionsMatch = response.match(/##\s*Questions?\s*\n([\s\S]*?)(?=##|$)/i)

    if (questionsMatch) {
      const questionsText = questionsMatch[1].trim()
      // Parse numbered or bulleted questions
      const lines = questionsText.split('\n')
        .map(l => l.replace(/^[\d\-*.)]+\s*/, '').trim())
        .filter(l => l.length > 0 && l.endsWith('?'))

      lines.forEach((q, i) => {
        questions.push({
          id: `q-${Date.now()}-${i}`,
          question: q,
          answered: false,
          answer: null
        })
      })
    }

    return questions
  }

  /**
   * Extract summary from Claude's response
   * @param {string} response - Raw response text
   * @returns {string|null} Summary text or null
   */
  extractSummary(response) {
    if (!response) return null

    const summaryMatch = response.match(/##\s*Summary\s*\n([\s\S]*?)(?=##|$)/i)
    if (summaryMatch) {
      return summaryMatch[1].trim()
    }
    return null
  }

  /**
   * Extract updated document content from Claude's response
   * Looks for the ## Updated Document section with a code block
   * @param {string} response - Raw response text from Claude
   * @returns {string|null} Extracted document content, or null if not found
   */
  extractUpdatedDocument(response) {
    if (!response || typeof response !== 'string') {
      return null
    }

    // Pattern 1: Look for "## Updated Document" section with code block
    // Matches: ## Updated Document\n```language\ncontent\n```
    const updatedDocPattern = /##\s*Updated\s*Document\s*\n```[\w]*\n([\s\S]*?)\n```/i
    const match = response.match(updatedDocPattern)
    if (match && match[1]) {
      return match[1]
    }

    // Pattern 2: Alternative format - "### Updated Document" (h3)
    const altPattern = /###\s*Updated\s*Document\s*\n```[\w]*\n([\s\S]*?)\n```/i
    const altMatch = response.match(altPattern)
    if (altMatch && altMatch[1]) {
      return altMatch[1]
    }

    // Pattern 3: Look for "Here is the updated document:" or similar
    const inlinePattern = /(?:here is|here's) the updated (?:document|file|content):\s*\n```[\w]*\n([\s\S]*?)\n```/i
    const inlineMatch = response.match(inlinePattern)
    if (inlineMatch && inlineMatch[1]) {
      return inlineMatch[1]
    }

    return null
  }

  /**
   * Compute changes between baseline and current content (Story 3)
   * Updates change tracker and state for highlighting
   */
  computeAndTrackChanges() {
    // Compute changes from baseline
    const changes = this.changeTracker.computeChanges(this.state.content)

    // Update state
    this.state.hasTrackedChanges = changes.length > 0

    if (this.state.hasTrackedChanges) {
      const stats = this.changeTracker.getStats()
      console.log('[DocumentEditorView] Changes detected:', stats)

      // Re-render to show highlight controls in toolbar
      this.render()
    } else {
      // Just update line numbers (no full re-render needed)
      this.updateLineNumbers()
    }
  }

  /**
   * Generate a unique response ID
   * @returns {string} UUID-like string
   */
  generateResponseId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  /**
   * Attach event listeners for question inputs and reply buttons
   */
  attachQuestionListeners() {
    // Question inputs - store values in state for persistence
    this.container.querySelectorAll('.document-editor-question-input').forEach(input => {
      // Input handler to persist values
      const inputHandler = (e) => {
        const questionId = e.currentTarget.dataset.questionId
        this.state.pendingAnswers[questionId] = e.currentTarget.value
      }
      this.addTrackedListener(input, 'input', inputHandler)

      // Keydown handler - Enter submits all answers
      const keyHandler = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          const responseId = e.currentTarget.dataset.responseId
          this.handleSubmitAllAnswers(responseId)
        }
      }
      this.addTrackedListener(input, 'keydown', keyHandler)
    })

    // Submit all answers button
    this.container.querySelectorAll('.document-editor-submit-all-answers-btn').forEach(btn => {
      const handler = () => {
        const responseId = btn.dataset.responseId
        this.handleSubmitAllAnswers(responseId)
      }
      this.addTrackedListener(btn, 'click', handler)
    })

    // Response collapse buttons
    this.container.querySelectorAll('.document-editor-response-collapse-btn').forEach(btn => {
      const handler = (e) => {
        const responseId = e.currentTarget.dataset.responseId
        this.handleResponseCollapse(responseId)
      }
      this.addTrackedListener(btn, 'click', handler)
    })

    // Questions modal event listeners
    this.attachModalListeners()
  }

  /**
   * Attach event listeners for the response modal
   */
  attachModalListeners() {
    // Close modal buttons and overlay
    this.container.querySelectorAll('[data-action="close-response-modal"]').forEach(el => {
      const handler = () => this.closeResponseModal()
      this.addTrackedListener(el, 'click', handler)
    })

    // Modal question inputs - Enter key to submit
    this.container.querySelectorAll('.document-editor-modal-question-input').forEach(input => {
      const keyHandler = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          const questionId = e.currentTarget.dataset.questionId
          const responseId = e.currentTarget.dataset.responseId
          this.handleModalQuestionReply(responseId, questionId)
        }
      }
      this.addTrackedListener(input, 'keydown', keyHandler)
    })

    // Modal reply buttons
    this.container.querySelectorAll('.document-editor-modal-reply-btn').forEach(btn => {
      const handler = () => {
        const questionId = btn.dataset.questionId
        const responseId = btn.dataset.responseId
        this.handleModalQuestionReply(responseId, questionId)
      }
      this.addTrackedListener(btn, 'click', handler)
    })

    // Focus the first input in the modal
    if (this.state.showResponseModal) {
      const firstInput = this.container.querySelector('.document-editor-modal-question-input')
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100)
      }
    }
  }

  /**
   * Close the response modal
   */
  closeResponseModal() {
    this.state.showResponseModal = false
    this.render()
  }

  /**
   * Handle answering a question from the modal
   * When all questions are answered, submits answers to Claude
   * @param {string} responseId - Response ID containing the question
   * @param {string} questionId - Question ID to answer
   */
  async handleModalQuestionReply(responseId, questionId) {
    const input = this.container.querySelector(
      `.document-editor-modal-question-input[data-question-id="${questionId}"]`
    )
    if (!input) return

    const answer = input.value.trim()
    if (!answer) return

    console.log('[DocumentEditorView] Answering question from modal:', { responseId, questionId, answer })

    // Mark this question as answered
    if (this.state.currentResponse?.id === responseId) {
      const question = this.state.currentResponse.questions?.find(q => q.id === questionId)
      if (question) {
        question.answer = answer
        question.answered = true
        question.answeredAt = new Date().toISOString()
      }
    }

    // Update session manager
    if (this.sessionManager.isLoaded()) {
      await this.sessionManager.answerQuestion(responseId, questionId, answer)
      this.state.responseHistory = this.sessionManager.getResponses()
    }

    // Update pending questions
    this.state.pendingQuestions = this.state.pendingQuestions.filter(q => q.id !== questionId)

    // Check if all questions are now answered
    const unanswered = this.state.currentResponse?.questions?.filter(q => !q.answered) || []

    if (unanswered.length === 0) {
      // All questions answered - submit to Claude with the answers
      await this.submitQuestionAnswers()
    } else {
      // Still have unanswered questions - just re-render to show updated state
      this.render()
    }
  }

  /**
   * Submit all answered questions to Claude as a follow-up
   * Formats the Q&A and sends to Claude to continue the task
   */
  async submitQuestionAnswers() {
    if (!this.state.currentResponse?.questions) return

    const questions = this.state.currentResponse.questions
    const originalPrompt = this.state.currentResponse.prompt

    // Format the answers as a follow-up prompt
    const answersText = questions
      .map(q => `Q: ${q.question}\nA: ${q.answer}`)
      .join('\n\n')

    const followUpPrompt = `Here are my answers to your questions:\n\n${answersText}\n\nPlease proceed with the original request: ${originalPrompt}`

    console.log('[DocumentEditorView] Submitting answers to Claude')

    // Close modal and show loading state
    this.state.showResponseModal = false
    this.state.isSubmitting = true
    this.state.contentBeforeSubmit = this.state.content

    // Record baseline for change tracking
    this.changeTracker.recordBaseline(this.state.content)

    this.render()

    try {
      // Submit the follow-up to Claude
      const result = await this.promptService.submit({
        filename: this.getDisplayFilename(),
        filePath: this.state.currentFile,
        extension: this.state.extension,
        content: this.state.content,
        userPrompt: followUpPrompt,
        model: this.state.selectedModel,
        thinkingBudget: this.state.thinkingBudget,
        contextFiles: this.state.contextFiles.map(f => ({
          name: f.name,
          path: f.path,
          extension: f.extension,
          content: f.content
        })),
        branchId: 'plugin',
        sessionId: null
      })

      // Process the response
      await this.processAIResponse(result, followUpPrompt)

    } catch (error) {
      console.error('[DocumentEditorView] Error submitting answers:', error)

      // Show error in modal
      this.state.currentResponse = {
        id: this.generateResponseId(),
        timestamp: new Date().toISOString(),
        prompt: followUpPrompt,
        summary: `Error: ${error.message}`,
        questions: [],
        fullResponse: error.message,
        diffStats: { added: 0, modified: 0, deleted: 0 },
        validationErrors: [],
        model: this.state.selectedModel,
        collapsed: false,
        documentApplied: false
      }
      this.state.showResponseModal = true
      this.render()
    } finally {
      this.state.isSubmitting = false
      this.updatePromptUI()
    }
  }

  /**
   * Handle answering a question
   * @param {string} responseId - Response ID containing the question
   * @param {string} questionId - Question ID to answer
   */
  async handleQuestionReply(responseId, questionId) {
    const input = this.container.querySelector(
      `.document-editor-question-input[data-question-id="${questionId}"]`
    )
    if (!input) return

    const answer = input.value.trim()
    if (!answer) return

    console.log('[DocumentEditorView] Answering question:', { responseId, questionId, answer })

    // Update session manager
    if (this.sessionManager.isLoaded()) {
      await this.sessionManager.answerQuestion(responseId, questionId, answer)
      this.state.responseHistory = this.sessionManager.getResponses()
    }

    // Update current response if it matches
    if (this.state.currentResponse?.id === responseId) {
      const question = this.state.currentResponse.questions?.find(q => q.id === questionId)
      if (question) {
        question.answer = answer
        question.answered = true
        question.answeredAt = new Date().toISOString()
      }
    }

    // Update response in history
    const historyResponse = this.state.responseHistory.find(r => r.id === responseId)
    if (historyResponse) {
      const question = historyResponse.questions?.find(q => q.id === questionId)
      if (question) {
        question.answer = answer
        question.answered = true
        question.answeredAt = new Date().toISOString()
      }
    }

    // Update pending questions
    this.state.pendingQuestions = this.state.pendingQuestions.filter(q => q.id !== questionId)

    // Re-render response content
    this.updateResponseContent()
    this.attachQuestionListeners()
  }

  /**
   * Handle submitting all answers at once
   * @param {string} responseId - Response ID containing the questions
   */
  async handleSubmitAllAnswers(responseId) {
    // Find the response
    const response = this.state.currentResponse?.id === responseId
      ? this.state.currentResponse
      : this.state.responseHistory.find(r => r.id === responseId)

    if (!response || !response.questions) return

    // Get unanswered questions
    const unansweredQuestions = response.questions.filter(q => !q.answered)
    if (unansweredQuestions.length === 0) return

    // Collect answers from pending state
    const answeredQuestions = []
    for (const q of unansweredQuestions) {
      const answer = (this.state.pendingAnswers[q.id] || '').trim()
      if (answer) {
        answeredQuestions.push({ question: q, answer })
      }
    }

    // Check if we have any answers to submit
    if (answeredQuestions.length === 0) {
      console.warn('[DocumentEditorView] No answers provided')
      return
    }

    console.log('[DocumentEditorView] Submitting all answers:', answeredQuestions.length)

    // Mark questions as answered
    for (const { question, answer } of answeredQuestions) {
      question.answer = answer
      question.answered = true
      question.answeredAt = new Date().toISOString()

      // Update session manager
      if (this.sessionManager.isLoaded()) {
        await this.sessionManager.answerQuestion(responseId, question.id, answer)
      }

      // Remove from pending
      delete this.state.pendingAnswers[question.id]
    }

    // Update state
    this.state.responseHistory = this.sessionManager.getResponses()
    this.state.pendingQuestions = this.state.pendingQuestions.filter(
      q => !answeredQuestions.some(aq => aq.question.id === q.id)
    )

    // Build follow-up prompt with all answers
    const answersText = answeredQuestions.map(
      ({ question, answer }) => `Q: ${question.question}\nA: ${answer}`
    ).join('\n\n')

    const followUpPrompt = `Here are my answers to your questions:\n\n${answersText}\n\nPlease proceed with the document changes based on these answers.`

    // Re-render to show answered state
    this.updateResponseContent()
    this.attachQuestionListeners()

    // Submit follow-up prompt to Claude
    this.state.promptText = followUpPrompt
    await this.handleAskAI()
  }

  /**
   * Handle collapsing/expanding a response entry
   * @param {string} responseId - Response ID to toggle
   */
  handleResponseCollapse(responseId) {
    // Toggle in session manager
    if (this.sessionManager.isLoaded()) {
      this.sessionManager.toggleResponseCollapsed(responseId)
    }

    // Toggle in current response
    if (this.state.currentResponse?.id === responseId) {
      this.state.currentResponse.collapsed = !this.state.currentResponse.collapsed
    }

    // Toggle in history
    const historyResponse = this.state.responseHistory.find(r => r.id === responseId)
    if (historyResponse) {
      historyResponse.collapsed = !historyResponse.collapsed
    }

    // Re-render
    this.updateResponseContent()
    this.attachQuestionListeners()
  }

  /**
   * Load session when a file is opened
   */
  async loadSessionForCurrentFile() {
    if (!this.state.currentFile) return

    try {
      const session = await this.sessionManager.loadSession(this.state.currentFile)
      this.state.sessionLoaded = true
      this.state.responseHistory = this.sessionManager.getResponses()

      // Set current response to most recent if available
      if (this.state.responseHistory.length > 0) {
        this.state.currentResponse = this.state.responseHistory[0]
      }

      // Update pending questions
      const unanswered = this.sessionManager.getUnansweredQuestions()
      this.state.pendingQuestions = unanswered.map(u => u.question)

      console.log('[DocumentEditorView] Loaded session with', this.state.responseHistory.length, 'responses')
    } catch (error) {
      console.error('[DocumentEditorView] Error loading session:', error)
      this.state.sessionLoaded = true
      this.state.responseHistory = []
    }
  }

  /**
   * Update prompt UI elements without full re-render
   */
  updatePromptUI() {
    const promptInput = this.container.querySelector('.document-editor-prompt-input')
    const sendBtn = this.container.querySelector('.document-editor-prompt-btn')
    const modelSelector = this.container.querySelector('.document-editor-model-selector')
    const thinkingSelector = this.container.querySelector('.document-editor-thinking-selector')
    const addContextBtn = this.container.querySelector('.document-editor-add-context-btn')

    const hasFile = !!this.state.currentFile
    const disabled = !hasFile || this.state.isSubmitting

    if (promptInput) {
      promptInput.disabled = disabled
      promptInput.value = this.state.promptText
    }

    if (sendBtn) {
      sendBtn.disabled = disabled
      sendBtn.classList.toggle('submitting', this.state.isSubmitting)
      if (this.state.isSubmitting) {
        sendBtn.innerHTML = `
          <span class="document-editor-btn-spinner"></span>
          <span>Sending...</span>
        `
      } else {
        sendBtn.innerHTML = `
          <span class="document-editor-btn-icon">🚀</span>
          <span class="document-editor-btn-text">Send</span>
        `
      }
    }

    if (modelSelector) modelSelector.disabled = disabled
    if (thinkingSelector) thinkingSelector.disabled = disabled
    if (addContextBtn) addContextBtn.disabled = disabled

    // Update context chip remove buttons
    this.container.querySelectorAll('.document-editor-chip-remove').forEach(btn => {
      btn.disabled = this.state.isSubmitting
    })
  }

  /**
   * Update response content without full re-render
   */
  updateResponseContent() {
    const responseContent = this.container.querySelector('.document-editor-response-content')
    if (responseContent) {
      responseContent.innerHTML = this.renderResponseContent()
    }
  }

  /**
   * Handle adding a context file
   */
  async handleAddContextFile() {
    if (this.state.isSubmitting) return

    // Check max context files limit
    const maxFiles = 5
    if (this.state.contextFiles.length >= maxFiles) {
      alert(`Maximum ${maxFiles} context files allowed.`)
      return
    }

    try {
      // Use the open file dialog
      const result = await window.puffin.plugins.invoke(
        'document-editor-plugin',
        'openFile',
        {}
      )

      if (result.canceled || result.error) {
        return
      }

      // Check if file is already added
      if (this.state.contextFiles.some(f => f.path === result.path)) {
        alert('This file is already added as context.')
        return
      }

      // Determine file type (gui files typically end in .gui.json or similar)
      const filename = result.path.split(/[/\\]/).pop()
      const isGuiFile = filename.includes('.gui.') || filename.endsWith('.gui')
      const extension = result.path.match(/\.[^.]+$/)?.[0] || ''

      // Add to context files
      this.state.contextFiles.push({
        type: isGuiFile ? 'gui' : 'doc',
        path: result.path,
        name: filename,
        extension,
        content: result.content
      })

      console.log('[DocumentEditorView] Context file added:', filename)

      // Re-render to show the new chip
      this.render()
    } catch (error) {
      console.error('[DocumentEditorView] Add context file error:', error)
      alert('Failed to add context file: ' + error.message)
    }
  }

  /**
   * Handle removing a context file
   * @param {number} index - Index of file to remove
   */
  handleRemoveContextFile(index) {
    if (this.state.isSubmitting) return

    if (index >= 0 && index < this.state.contextFiles.length) {
      const removed = this.state.contextFiles.splice(index, 1)[0]
      console.log('[DocumentEditorView] Context file removed:', removed.name)

      // Re-render to update chips
      this.render()
    }
  }

  /**
   * Toggle change highlighting visibility (Story 3)
   * @param {boolean} enabled - Whether highlighting should be visible
   */
  toggleHighlightChanges(enabled) {
    this.state.highlightChangesEnabled = enabled
    this.changeTracker.setHighlightingEnabled(enabled)
    console.log('[DocumentEditorView] Highlight changes:', enabled ? 'enabled' : 'disabled')

    // Update line numbers and highlight layer
    this.updateLineNumbers()
    this.updateHighlightLayer()
  }

  /**
   * Clear all change highlights (Story 3)
   */
  clearHighlights() {
    this.changeTracker.clearHighlights()
    this.state.hasTrackedChanges = false
    console.log('[DocumentEditorView] Change highlights cleared')

    // Re-render to hide the highlight controls
    this.render()
  }

  /**
   * Update the highlight layer to show change highlighting (Story 3)
   */
  updateHighlightLayer() {
    const highlightLayer = this.container.querySelector('.document-editor-highlight-layer code')
    if (!highlightLayer) return

    // Re-apply syntax highlighting which will include change classes
    this.updateHighlighting()
  }

  /**
   * Handle toolbar actions
   * @param {string} action - Action name
   */
  async handleAction(action) {
    console.log('[DocumentEditorView] Action:', action)

    switch (action) {
      case 'new':
        await this.handleNew()
        break
      case 'open':
        await this.handleOpen()
        break
      case 'save':
        await this.handleSave()
        break
      case 'toggle-response':
        this.toggleResponseArea()
        break
      case 'search-next':
        this.searchNext()
        break
      case 'search-prev':
        this.searchPrev()
        break
      case 'search-clear':
        this.clearSearch()
        break
      case 'undo':
        this.handleUndo()
        break
    }
  }

  /**
   * Toggle response panel collapsed/expanded
   */
  toggleResponseArea() {
    this.state.responseCollapsed = !this.state.responseCollapsed

    const responsePanel = this.container.querySelector('.document-editor-response-panel')
    const toggleIcon = this.container.querySelector('.document-editor-toggle-icon')

    if (responsePanel) {
      responsePanel.classList.toggle('collapsed', this.state.responseCollapsed)
    }
    if (toggleIcon) {
      toggleIcon.textContent = this.state.responseCollapsed ? '◀' : '▶'
    }
  }

  /**
   * Handle new document
   */
  async handleNew() {
    // Check for unsaved changes
    if (this.state.isModified && this.state.currentFile) {
      const confirmed = confirm('You have unsaved changes. Create new document anyway?')
      if (!confirmed) return
    }

    try {
      const result = await window.puffin.plugins.invoke(
        'document-editor-plugin',
        'createFile',
        { defaultName: 'untitled.txt' }
      )

      if (result.canceled) {
        return
      }

      if (result.error) {
        console.error('[DocumentEditorView] Create file error:', result.error)
        alert('Failed to create file: ' + result.error)
        return
      }

      // Unwatch previous file if any
      if (this.state.currentFile) {
        await this.unwatchCurrentFile()
      }

      // Update state with new file
      this.state.currentFile = result.path
      this.state.content = result.content || ''
      this.state.extension = result.extension
      this.state.isModified = false

      // Reset response state for new document
      this.state.currentResponse = null
      this.state.responseHistory = []
      this.state.pendingQuestions = []
      this.state.sessionLoaded = false

      // Reset change tracking state (Story 3)
      this.changeTracker.clearHighlights()
      this.changeTracker.recordBaseline(result.content || '')
      this.state.hasTrackedChanges = false

      // Start watching for external changes
      await this.watchCurrentFile()

      // Load session for this file
      await this.loadSessionForCurrentFile()

      // Re-render to show editor
      this.render()
    } catch (error) {
      console.error('[DocumentEditorView] New document error:', error)
      alert('Failed to create file: ' + error.message)
    }
  }

  /**
   * Handle open file
   */
  async handleOpen() {
    // Check for unsaved changes
    if (this.state.isModified && this.state.currentFile) {
      const confirmed = confirm('You have unsaved changes. Open another file anyway?')
      if (!confirmed) return
    }

    try {
      const result = await window.puffin.plugins.invoke(
        'document-editor-plugin',
        'openFile',
        {}
      )

      if (result.canceled) {
        return
      }

      if (result.error) {
        console.error('[DocumentEditorView] Open file error:', result.error)
        alert('Failed to open file: ' + result.error)
        return
      }

      // Unwatch previous file if any
      if (this.state.currentFile) {
        await this.unwatchCurrentFile()
      }

      // Update state with opened file
      this.state.currentFile = result.path
      this.state.content = result.content
      this.state.extension = result.extension
      this.state.isModified = false

      // Reset response state for new document
      this.state.currentResponse = null
      this.state.responseHistory = []
      this.state.pendingQuestions = []
      this.state.sessionLoaded = false

      // Reset change tracking state (Story 3)
      this.changeTracker.clearHighlights()
      this.changeTracker.recordBaseline(result.content)
      this.state.hasTrackedChanges = false

      // Start watching for external changes
      await this.watchCurrentFile()

      // Load session for this file
      await this.loadSessionForCurrentFile()

      // Re-render to show editor with content
      this.render()
    } catch (error) {
      console.error('[DocumentEditorView] Open file error:', error)
      alert('Failed to open file: ' + error.message)
    }
  }

  /**
   * Handle save file
   */
  async handleSave() {
    if (!this.state.currentFile) return

    await this.saveFile()
  }

  /**
   * Watch current file for external changes
   */
  async watchCurrentFile() {
    if (!this.state.currentFile) return

    try {
      await window.puffin.plugins.invoke(
        'document-editor-plugin',
        'watchFile',
        { filePath: this.state.currentFile }
      )
    } catch (error) {
      console.error('[DocumentEditorView] Watch file error:', error)
    }
  }

  /**
   * Unwatch current file
   */
  async unwatchCurrentFile() {
    if (!this.state.currentFile) return

    try {
      await window.puffin.plugins.invoke(
        'document-editor-plugin',
        'unwatchFile',
        { filePath: this.state.currentFile }
      )
    } catch (error) {
      console.error('[DocumentEditorView] Unwatch file error:', error)
    }
  }

  /**
   * Handle editor input
   * @param {Event} e - Input event
   */
  handleInput(e) {
    this.state.content = e.target.value
    this.state.isModified = true
    // Debounce highlighting for performance with large files
    this.scheduleHighlighting()
    this.updateLineNumbers()
    this.updateSaveIndicator()

    if (this.state.autoSaveEnabled && this.state.currentFile) {
      this.scheduleAutoSave()
    }
  }

  /**
   * Schedule debounced syntax highlighting
   * Prevents performance issues with large files by batching highlight updates
   */
  scheduleHighlighting() {
    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout)
    }
    this.highlightTimeout = setTimeout(() => {
      this.highlightTimeout = null
      this.updateHighlighting()
    }, this.HIGHLIGHT_DELAY)
  }

  /**
   * Handle keydown in editor
   * @param {KeyboardEvent} e - Keydown event
   */
  handleKeyDown(e) {
    // Tab key inserts spaces
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.target
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const spaces = '  ' // 2 spaces
      textarea.value = this.state.content.substring(0, start) + spaces + this.state.content.substring(end)
      textarea.selectionStart = textarea.selectionEnd = start + spaces.length
      this.handleInput({ target: textarea })
    }
  }

  /**
   * Sanitize highlight.js output to ensure it only contains safe elements
   * This provides defense-in-depth against potential hljs vulnerabilities
   * @param {string} html - HTML output from highlight.js
   * @returns {string} Sanitized HTML with only safe span elements
   */
  sanitizeHighlightOutput(html) {
    if (!html) return ''

    // Create a temporary container to parse the HTML
    const temp = document.createElement('div')
    temp.innerHTML = html

    // Recursively sanitize the content
    const sanitizeNode = (node) => {
      const result = []
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          // Text nodes are safe, but escape any HTML entities
          result.push(this.escapeHtml(child.textContent))
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          // Only allow span elements with hljs-* classes
          if (child.tagName === 'SPAN') {
            const className = child.className || ''
            // Only keep hljs-* class names for security
            const safeClasses = className.split(/\s+/)
              .filter(c => c.startsWith('hljs-') || c === 'hljs')
              .join(' ')
            const innerContent = sanitizeNode(child)
            if (safeClasses) {
              result.push(`<span class="${safeClasses}">${innerContent}</span>`)
            } else {
              result.push(innerContent)
            }
          } else {
            // For non-span elements, just include their text content (escaped)
            result.push(this.escapeHtml(child.textContent))
          }
        }
      }
      return result.join('')
    }

    return sanitizeNode(temp)
  }

  /**
   * Update syntax highlighting
   * Uses highlight.js to apply language-specific syntax highlighting
   */
  updateHighlighting() {
    const highlightCode = this.container.querySelector('.document-editor-highlight-layer code')
    if (!highlightCode) return

    const content = this.state.content || ''

    // If highlight.js is not loaded, show plain text
    if (!this.hljs) {
      highlightCode.textContent = content + '\n'
      highlightCode.className = ''
      return
    }

    // Get the language based on file extension
    const language = getLanguageForExtension(this.state.extension)

    try {
      // Attempt to highlight with specific language
      if (language && language !== 'plaintext') {
        const result = this.hljs.highlight(content, {
          language,
          ignoreIllegals: true
        })
        // Sanitize hljs output to only allow safe span elements with hljs-* classes
        const sanitizedHtml = this.sanitizeHighlightOutput(result.value)
        highlightCode.innerHTML = sanitizedHtml + '\n'
        highlightCode.className = `hljs language-${language}`
      } else {
        // Plain text - no highlighting needed
        highlightCode.textContent = content + '\n'
        highlightCode.className = 'hljs'
      }
    } catch (error) {
      // Fallback to plain text on error
      console.warn('[DocumentEditorView] Highlighting failed:', error.message)
      highlightCode.textContent = content + '\n'
      highlightCode.className = 'hljs'
    }
  }

  /**
   * Update line numbers with optional change markers and search highlights
   */
  updateLineNumbers() {
    const lineNumbers = this.container.querySelector('.document-editor-line-numbers')
    if (!lineNumbers) return

    const lines = (this.state.content || '').split('\n').length
    const showChanges = this.state.highlightChangesEnabled && this.changeTracker.hasChanges()

    // Build set of lines with search matches
    const searchMatchLines = new Set()
    const currentMatchLine = this.state.searchMatches[this.state.currentMatchIndex]?.line
    this.state.searchMatches.forEach(m => searchMatchLines.add(m.line))

    lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => {
      const lineNum = i + 1
      const lineIndex = i

      // Change tracking
      const changeType = showChanges ? this.changeTracker.getChangeForLine(lineNum) : null
      const changeClass = changeType ? ` change-${changeType}` : ''

      // Search highlighting
      const hasMatch = searchMatchLines.has(lineIndex)
      const isCurrentMatch = lineIndex === currentMatchLine
      const searchClass = isCurrentMatch ? ' search-current' : (hasMatch ? ' search-match' : '')

      return `<div class="document-editor-line-number${changeClass}${searchClass}">${lineNum}</div>`
    }).join('')
  }

  /**
   * Sync scroll between textarea and highlight layer
   */
  syncScroll() {
    const textarea = this.container.querySelector('.document-editor-textarea')
    const pre = this.container.querySelector('.document-editor-highlight-layer')
    const lineNumbers = this.container.querySelector('.document-editor-line-numbers')

    if (textarea && pre) {
      pre.scrollTop = textarea.scrollTop
      pre.scrollLeft = textarea.scrollLeft
    }
    if (textarea && lineNumbers) {
      lineNumbers.scrollTop = textarea.scrollTop
    }
  }

  /**
   * Schedule auto-save with debounce
   */
  scheduleAutoSave() {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout)
    }

    this.autoSaveTimeout = setTimeout(() => {
      this.saveFile()
    }, this.AUTOSAVE_DELAY)
  }

  /**
   * Save file to disk
   */
  async saveFile() {
    if (!this.state.currentFile || !this.state.isModified) return

    this.updateSaveIndicator('saving')

    try {
      const result = await window.puffin.plugins.invoke(
        'document-editor-plugin',
        'saveFile',
        {
          path: this.state.currentFile,
          content: this.state.content
        }
      )

      if (result.success) {
        this.state.isModified = false
        this.updateSaveIndicator('saved')
      } else {
        console.error('[DocumentEditorView] Save error:', result.error)
        this.updateSaveIndicator('error')
      }
    } catch (error) {
      console.error('[DocumentEditorView] Save file error:', error)
      this.updateSaveIndicator('error')
    }
  }

  /**
   * Toggle auto-save
   * @param {boolean} enabled - Whether auto-save is enabled
   */
  toggleAutoSave(enabled) {
    this.state.autoSaveEnabled = enabled
    console.log('[DocumentEditorView] Auto-save:', enabled ? 'enabled' : 'disabled')

    if (enabled && this.state.isModified && this.state.currentFile) {
      this.scheduleAutoSave()
    }
  }

  /**
   * Update save indicator UI
   * @param {string} status - Optional status override
   */
  updateSaveIndicator(status) {
    const indicator = this.container.querySelector('.document-editor-save-indicator')
    const saveBtn = this.container.querySelector('[data-action="save"]')

    if (!indicator) return

    const displayStatus = status || (this.state.isModified ? 'unsaved' : 'saved')

    switch (displayStatus) {
      case 'saved':
        indicator.innerHTML = '<span class="document-editor-indicator-dot saved"></span> Saved'
        if (saveBtn) saveBtn.disabled = true
        break
      case 'unsaved':
        indicator.innerHTML = '<span class="document-editor-indicator-dot unsaved"></span> Unsaved'
        if (saveBtn) saveBtn.disabled = false
        break
      case 'saving':
        indicator.innerHTML = '<span class="document-editor-indicator-spinner"></span> Saving...'
        if (saveBtn) saveBtn.disabled = true
        break
      case 'error':
        indicator.innerHTML = '<span class="document-editor-indicator-dot error"></span> Save failed'
        if (saveBtn) saveBtn.disabled = false
        break
      default:
        indicator.innerHTML = ''
    }
  }

  /**
   * Update filename display
   */
  updateFilename() {
    const filenameEl = this.container.querySelector('.document-editor-filename')
    if (filenameEl) {
      if (this.state.currentFile) {
        const filename = this.state.currentFile.split(/[/\\]/).pop()
        filenameEl.textContent = filename
        filenameEl.title = this.state.currentFile
      } else {
        filenameEl.textContent = 'No file open'
        filenameEl.title = ''
      }
    }
  }

  /**
   * Lifecycle: Called when view is activated
   */
  onActivate() {
    console.log('[DocumentEditorView] onActivate()')
  }

  /**
   * Push current document state onto the undo stack
   * Called before AI makes changes to enable reverting
   */
  pushUndoState() {
    const state = {
      content: this.state.content,
      timestamp: new Date().toISOString()
    }

    // Add to stack
    this.state.undoStack.push(state)

    // Trim stack if over max size
    if (this.state.undoStack.length > this.state.maxUndoStates) {
      this.state.undoStack.shift()
    }

    console.log('[DocumentEditorView] Pushed undo state, stack size:', this.state.undoStack.length)
  }

  /**
   * Handle undo action
   * If text is selected, restore only that portion from previous state
   * If no selection, restore the entire document
   */
  handleUndo() {
    if (this.state.undoStack.length === 0) {
      console.log('[DocumentEditorView] Undo stack is empty')
      return
    }

    const textarea = this.container.querySelector('.document-editor-textarea')
    if (!textarea) return

    // Get selection range
    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd
    const hasSelection = selectionStart !== selectionEnd

    // Pop the last state
    const previousState = this.state.undoStack.pop()

    if (hasSelection) {
      // Selection-aware undo: restore only the selected portion
      const previousContent = previousState.content
      const currentContent = this.state.content

      // Calculate line ranges for the selection
      const currentLines = currentContent.split('\n')
      const previousLines = previousContent.split('\n')

      // Find line number for selection start
      let charCount = 0
      let startLine = 0
      for (let i = 0; i < currentLines.length; i++) {
        if (charCount + currentLines[i].length >= selectionStart) {
          startLine = i
          break
        }
        charCount += currentLines[i].length + 1 // +1 for newline
      }

      // Find line number for selection end
      charCount = 0
      let endLine = 0
      for (let i = 0; i < currentLines.length; i++) {
        if (charCount + currentLines[i].length >= selectionEnd) {
          endLine = i
          break
        }
        charCount += currentLines[i].length + 1
      }

      // Check if we can restore these lines from previous state
      if (startLine < previousLines.length && endLine < previousLines.length) {
        // Replace the selected lines with previous version
        const beforeSelection = currentLines.slice(0, startLine)
        const afterSelection = currentLines.slice(endLine + 1)
        const restoredLines = previousLines.slice(startLine, endLine + 1)

        const newContent = [
          ...beforeSelection,
          ...restoredLines,
          ...afterSelection
        ].join('\n')

        this.state.content = newContent
        textarea.value = newContent

        console.log('[DocumentEditorView] Restored lines', startLine, 'to', endLine, 'from previous state')
      } else {
        // Selection extends beyond previous content, fall back to full restore
        this.state.content = previousContent
        textarea.value = previousContent
        console.log('[DocumentEditorView] Selection extends beyond previous content, full restore')
      }
    } else {
      // No selection: restore entire document
      this.state.content = previousState.content
      textarea.value = previousState.content
      console.log('[DocumentEditorView] Restored entire document from previous state')
    }

    // Mark as modified and update display
    this.state.isModified = true
    this.updateHighlighting()
    this.updateLineNumbers()
    this.updateSaveIndicator()

    // Update undo button state
    this.render()
  }

  /**
   * Lifecycle: Called when view is deactivated
   */
  onDeactivate() {
    console.log('[DocumentEditorView] onDeactivate()')
  }

  /**
   * Cleanup when component is destroyed
   */
  async destroy() {
    console.log('[DocumentEditorView] destroy()')

    // Remove global keyboard listener
    document.removeEventListener('keydown', this._boundKeyDown)

    // Clean up all tracked event listeners
    this.cleanupListeners()

    // Clear auto-save timer
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout)
    }

    // Clear highlighting debounce timer
    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout)
    }

    // Save any pending changes
    if (this.state.isModified && this.state.currentFile) {
      await this.saveFile()
    }

    // Unwatch current file
    if (this.state.currentFile) {
      await this.unwatchCurrentFile()
    }

    if (this.container) {
      this.container.innerHTML = ''
      this.container = null
    }
  }
}

export default DocumentEditorView
