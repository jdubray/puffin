/**
 * ClaudeConfigView - Main component for viewing and editing CLAUDE.md
 *
 * Provides:
 * - View of current CLAUDE.md content with branch context
 * - Natural language prompt input for proposing changes
 * - Diff preview and review before applying changes
 * - Direct section management (add, edit, remove sections)
 */

/** Standard sections recognized by CLAUDE.md */
const STANDARD_SECTIONS = [
  'Project Context',
  'Project Overview',
  'File Access Restrictions',
  'Coding Preferences',
  'Completed User Stories',
  'Branch Focus'
]

/**
 * Format context name for display
 * e.g., "ui" -> "UI", "bug-fixes" -> "Bug Fixes"
 */
function formatContextName(contextName) {
  if (!contextName) return ''
  return contextName
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export class ClaudeConfigView {
  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} options - Component options
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}

    // State
    this.content = ''
    this.contextFiles = [] // Available context files
    this.selectedContext = null // Currently selected context
    this.contextName = null
    this.source = null
    this.filePath = null
    this.isNew = false
    this.sections = []
    this.loading = true
    this.error = null

    // Proposal state
    this.proposalPrompt = ''
    this.proposal = null
    this.showingDiff = false
    this.isProcessingPrompt = false

    // Section management state
    this.selectedSection = null
    this.editingSection = null
    this.showSectionModal = false
    this.sectionModalMode = 'add' // 'add' | 'edit' | 'delete'
    this.newSectionName = ''
    this.newSectionContent = ''
    this.insertAfterSection = null
  }

  /**
   * Initialize the component
   */
  async init() {
    console.log('[ClaudeConfigView] init() called')

    this.container.className = 'claude-config-view'
    this.render()
    await this.loadConfig()

    console.log('[ClaudeConfigView] init() complete')
  }

  /**
   * Load the CLAUDE.md configuration
   */
  async loadConfig() {
    this.loading = true
    this.error = null
    this.render()

    try {
      const result = await window.puffin.plugins.invoke('claude-config-plugin', 'getConfigWithContext')
      this.content = result.content || ''
      this.contextFiles = result.contextFiles || []
      this.selectedContext = result.selectedContext
      this.contextName = result.contextName
      this.source = result.source
      this.filePath = result.path
      this.isNew = result.isNew || false
      this.exists = result.exists

      // Load sections
      const sections = await window.puffin.plugins.invoke('claude-config-plugin', 'listSections')
      this.sections = sections || []

      this.loading = false
      this.render()
    } catch (err) {
      console.error('[ClaudeConfigView] Failed to load config:', err)
      this.error = err.message
      this.loading = false
      this.render()
    }
  }

  /**
   * Main render method
   */
  render() {
    if (!this.container) return

    this.container.innerHTML = `
      <div class="config-layout">
        <!-- Header -->
        <div class="config-header">
          <div class="config-title">
            <h2>Context Files</h2>
            ${this.renderContextSelector()}
          </div>
          <div class="config-actions">
            <button id="add-section-btn" class="btn small" title="Add new section" aria-label="Add new section">+ Section</button>
            <button id="refresh-config-btn" class="btn small" title="Refresh configuration" aria-label="Refresh">Refresh</button>
          </div>
        </div>

        <!-- Source indicator -->
        ${this.renderSourceIndicator()}

        <!-- Main content area -->
        <div class="config-main">
          ${this.loading ? this.renderLoading() :
            this.error ? this.renderError() :
            this.showingDiff ? this.renderDiffView() :
            this.renderContentView()}
        </div>

        <!-- Prompt input area -->
        ${!this.showingDiff ? this.renderPromptInput() : ''}

        <!-- Section Modal -->
        ${this.showSectionModal ? this.renderSectionModal() : ''}
      </div>
    `

    this.attachEventListeners()
  }

  /**
   * Render context file selector dropdown
   */
  renderContextSelector() {
    if (this.loading || this.contextFiles.length === 0) {
      return ''
    }

    return `
      <select id="context-selector" class="context-selector" aria-label="Select context file">
        ${this.contextFiles.map(file => `
          <option value="${this.escapeHtml(file.name)}" ${this.selectedContext === file.name ? 'selected' : ''}>
            ${this.escapeHtml(file.displayName)}
          </option>
        `).join('')}
      </select>
    `
  }

  /**
   * Render source indicator with branch mapping info
   */
  renderSourceIndicator() {
    if (this.loading) return ''

    // Get the relative path for display
    const displayPath = this.filePath ? this.getRelativePath(this.filePath) : ''

    let sourceText, sourceIcon, sourceClass

    switch (this.source) {
      case 'context-file':
        sourceText = displayPath
        sourceIcon = '📄'
        sourceClass = 'source-context'
        break
      case 'new-file':
        sourceText = `New file: ${displayPath}`
        sourceIcon = '✨'
        sourceClass = 'source-new'
        break
      default:
        sourceText = 'No context files found'
        sourceIcon = '⚠️'
        sourceClass = 'source-none'
    }

    // Show the branch mapping explanation
    const mappingInfo = this.selectedContext
      ? `When "${formatContextName(this.selectedContext)}" is active, CLAUDE.md = CLAUDE_base.md + CLAUDE_${this.selectedContext}.md`
      : ''

    return `
      <div class="source-indicator ${sourceClass}">
        <span class="source-icon">${sourceIcon}</span>
        <span class="source-text">${sourceText}</span>
        ${mappingInfo ? `<span class="mapping-info" title="${mappingInfo}">→ CLAUDE.md</span>` : ''}
      </div>
    `
  }

  /**
   * Get relative path from absolute path
   */
  getRelativePath(fullPath) {
    if (!fullPath) return ''
    // Extract just the .claude/CLAUDE_xxx.md portion
    const match = fullPath.match(/\.claude[/\\]CLAUDE[^/\\]*\.md$/i)
    return match ? match[0].replace(/\\/g, '/') : fullPath.split(/[/\\]/).slice(-2).join('/')
  }

  /**
   * Handle context selection change
   */
  async selectContext(contextName) {
    if (contextName === this.selectedContext) return

    this.loading = true
    this.render()

    try {
      const result = await window.puffin.plugins.invoke('claude-config-plugin', 'selectContext', { contextName })
      this.content = result.content || ''
      this.selectedContext = contextName
      this.contextName = result.contextName
      this.source = result.source
      this.filePath = result.path
      this.isNew = result.isNew || false
      this.exists = result.exists

      // Reload sections for new context
      const sections = await window.puffin.plugins.invoke('claude-config-plugin', 'listSections')
      this.sections = sections || []

      this.loading = false
      this.render()
    } catch (err) {
      console.error('[ClaudeConfigView] Failed to select context:', err)
      this.error = err.message
      this.loading = false
      this.render()
    }
  }

  /**
   * Render loading state
   */
  renderLoading() {
    return `
      <div class="config-loading">
        <div class="spinner"></div>
        <p>Loading configuration...</p>
      </div>
    `
  }

  /**
   * Render error state
   */
  renderError() {
    return `
      <div class="config-error">
        <span class="error-icon">⚠️</span>
        <p>Failed to load configuration: ${this.escapeHtml(this.error)}</p>
        <button id="retry-load-btn" class="btn small">Retry</button>
      </div>
    `
  }

  /**
   * Render main content view
   */
  renderContentView() {
    // Handle empty file state - show direct editor
    if (!this.content || this.content.trim() === '') {
      const contextDisplay = this.selectedContext ? formatContextName(this.selectedContext) : 'this context'
      return `
        <div class="config-empty-editor">
          <div class="empty-header">
            <div class="empty-icon">📝</div>
            <h3>Write ${contextDisplay} Context</h3>
            <p>This context file is empty. Write the content directly below:</p>
          </div>
          <div class="direct-editor">
            <textarea
              id="direct-content-editor"
              class="content-textarea"
              placeholder="# ${contextDisplay} Context

Write your context instructions here...

## Focus Areas

- Area 1
- Area 2

## Guidelines

Add guidelines for this branch..."
              rows="20"
            ></textarea>
            <div class="editor-actions">
              <button id="save-direct-content-btn" class="btn primary">Save Content</button>
              <button id="generate-template-btn" class="btn secondary">Generate Template</button>
            </div>
          </div>
        </div>
      `
    }

    return `
      <div class="config-content">
        <!-- Sections sidebar -->
        <div class="sections-sidebar" role="navigation" aria-label="Document sections">
          <div class="sections-header">
            <h3>Sections</h3>
            <span class="section-count">${this.sections.length} total</span>
          </div>
          <ul class="sections-list" role="listbox" aria-label="Document sections">
            ${this.sections.map((s, idx) => `
              <li class="section-item ${s.isStandard ? 'standard' : 'custom'} ${this.selectedSection === s.name ? 'selected' : ''}"
                  data-section="${this.escapeHtml(s.name)}"
                  role="option"
                  aria-selected="${this.selectedSection === s.name}"
                  tabindex="${idx === 0 ? '0' : '-1'}">
                <div class="section-info">
                  <span class="section-name" title="${this.escapeHtml(s.name)}">${this.escapeHtml(s.name)}</span>
                  <span class="section-meta">
                    <span class="section-lines">${s.lineCount} lines</span>
                    ${s.isStandard ? '<span class="section-badge standard-badge" title="Standard section">STD</span>' : ''}
                  </span>
                </div>
                <div class="section-actions" role="group" aria-label="Section actions">
                  <button class="section-action-btn edit-section-btn"
                          data-section="${this.escapeHtml(s.name)}"
                          title="Edit section"
                          aria-label="Edit ${this.escapeHtml(s.name)}">
                    <span aria-hidden="true">✎</span>
                  </button>
                  <button class="section-action-btn delete-section-btn ${s.isStandard ? 'warn' : ''}"
                          data-section="${this.escapeHtml(s.name)}"
                          title="${s.isStandard ? 'Remove standard section (caution)' : 'Remove section'}"
                          aria-label="Remove ${this.escapeHtml(s.name)}">
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              </li>
            `).join('')}
          </ul>
          ${this.sections.length === 0 ? '<p class="no-sections">No sections found</p>' : ''}
        </div>

        <!-- Content viewer/editor -->
        <div class="content-viewer" role="region" aria-label="Configuration content">
          <div class="content-editor-header">
            <span class="editor-label">Edit directly or use prompts below</span>
            <div class="editor-actions-inline">
              <button id="save-inline-btn" class="btn small primary" title="Save changes (Ctrl+S)">Save</button>
              <button id="revert-inline-btn" class="btn small secondary" title="Revert changes">Revert</button>
            </div>
          </div>
          <textarea
            id="content-editor"
            class="content-editor-textarea"
            spellcheck="false"
            aria-label="Edit context file content"
          >${this.escapeHtml(this.content)}</textarea>
        </div>
      </div>
    `
  }

  /**
   * Render diff view for proposal review
   */
  renderDiffView() {
    if (!this.proposal) return ''

    const { summary, diff, proposedContent } = this.proposal

    return `
      <div class="diff-view">
        <div class="diff-header">
          <h3>Proposed Changes</h3>
          <p class="diff-summary">${this.escapeHtml(summary)}</p>
        </div>

        <div class="diff-content">
          ${diff ? diff.map(d => `
            <div class="diff-line diff-${d.type}">
              <span class="line-indicator">${d.type === 'add' ? '+' : d.type === 'remove' ? '-' : ' '}</span>
              <span class="line-content">${this.escapeHtml(d.line)}</span>
            </div>
          `).join('') : '<p>No changes to show</p>'}
        </div>

        <div class="diff-actions">
          <button id="cancel-proposal-btn" class="btn secondary">Cancel</button>
          <button id="apply-proposal-btn" class="btn primary">Apply Changes</button>
        </div>
      </div>
    `
  }

  /**
   * Render prompt input area for AI-assisted editing
   */
  renderPromptInput() {
    const contextDisplay = this.selectedContext ? formatContextName(this.selectedContext) : 'Context'
    const isProcessing = this.isProcessingPrompt || false

    return `
      <div class="prompt-input-area">
        <div class="prompt-header">
          <h3>Ask Claude to Write ${contextDisplay}</h3>
          <p class="prompt-hint">Describe what you want in the context file. Claude will generate or update it based on best practices.</p>
        </div>
        <div class="prompt-form">
          <textarea
            id="claude-prompt-input"
            class="prompt-textarea"
            placeholder="e.g., Write a context file for a React component library focused on accessibility. Include sections for coding standards, component patterns, and testing requirements..."
            rows="3"
            aria-label="Prompt for Claude to write context file"
            ${isProcessing ? 'disabled' : ''}
          >${this.escapeHtml(this.proposalPrompt)}</textarea>
          <button id="send-prompt-btn" class="btn primary" ${isProcessing ? 'disabled' : ''}>
            ${isProcessing ? 'Processing...' : 'Generate'}
          </button>
        </div>
        <div class="prompt-suggestions">
          <p>Quick prompts:</p>
          <div class="quick-prompts">
            <button class="quick-prompt-btn" data-prompt="Write a context file for this branch focusing on the current feature work">Feature focus</button>
            <button class="quick-prompt-btn" data-prompt="Add a section about coding standards and best practices for this project">Coding standards</button>
            <button class="quick-prompt-btn" data-prompt="Add testing guidelines and requirements for this codebase">Testing guidelines</button>
            <button class="quick-prompt-btn" data-prompt="Document the key files and their purposes in this context">Key files</button>
          </div>
        </div>
      </div>
    `
  }

  /**
   * Render section management modal
   */
  renderSectionModal() {
    const isEdit = this.sectionModalMode === 'edit'
    const isDelete = this.sectionModalMode === 'delete'
    const isAdd = this.sectionModalMode === 'add'

    const title = isEdit ? `Edit Section: ${this.editingSection}` :
                  isDelete ? `Remove Section: ${this.editingSection}` :
                  'Add New Section'

    const section = this.sections.find(s => s.name === this.editingSection)
    const isStandard = section?.isStandard || false

    return `
      <div class="section-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="section-modal">
          <div class="modal-header">
            <h3 id="modal-title">${this.escapeHtml(title)}</h3>
            <button class="modal-close-btn" aria-label="Close modal" title="Close">×</button>
          </div>

          <div class="modal-body">
            ${isDelete ? this.renderDeleteConfirmation(isStandard) :
              isEdit ? this.renderEditForm() :
              this.renderAddForm()}
          </div>

          <div class="modal-footer">
            <button id="modal-cancel-btn" class="btn secondary">Cancel</button>
            ${isDelete ?
              `<button id="modal-confirm-btn" class="btn danger">Remove Section</button>` :
              `<button id="modal-confirm-btn" class="btn primary">${isEdit ? 'Save Changes' : 'Add Section'}</button>`
            }
          </div>
        </div>
      </div>
    `
  }

  /**
   * Render delete confirmation content
   */
  renderDeleteConfirmation(isStandard) {
    return `
      <div class="delete-confirmation">
        ${isStandard ? `
          <div class="warning-banner" role="alert">
            <span class="warning-icon" aria-hidden="true">⚠️</span>
            <p><strong>Warning:</strong> This is a standard CLAUDE.md section. Removing it may affect how Claude Code interprets your project context.</p>
          </div>
        ` : ''}
        <p>Are you sure you want to remove the <strong>"${this.escapeHtml(this.editingSection)}"</strong> section?</p>
        <p class="delete-note">This action will remove the section and its content from your CLAUDE.md file. The change can be undone with git.</p>
      </div>
    `
  }

  /**
   * Render edit section form
   */
  renderEditForm() {
    return `
      <div class="edit-form">
        <div class="form-group">
          <label for="edit-section-content">Section Content</label>
          <p class="form-hint">Edit the full section including heading and content (Markdown format)</p>
          <textarea
            id="edit-section-content"
            class="section-content-textarea"
            rows="15"
            placeholder="## Section Name&#10;&#10;Section content goes here..."
            aria-describedby="edit-hint"
          >${this.escapeHtml(this.newSectionContent)}</textarea>
          <p id="edit-hint" class="form-hint">Use Markdown formatting. The first line should be a heading (## Section Name).</p>
        </div>
      </div>
    `
  }

  /**
   * Render add section form
   */
  renderAddForm() {
    return `
      <div class="add-form">
        <div class="form-group">
          <label for="new-section-name">Section Name</label>
          <div class="section-name-input-wrapper">
            <input
              type="text"
              id="new-section-name"
              class="section-name-input"
              value="${this.escapeHtml(this.newSectionName)}"
              placeholder="e.g., Testing Guidelines"
              list="standard-sections-list"
              autocomplete="off"
              aria-describedby="name-hint"
            />
            <datalist id="standard-sections-list">
              ${STANDARD_SECTIONS
                .filter(s => !this.sections.some(existing => existing.name.toLowerCase() === s.toLowerCase()))
                .map(s => `<option value="${this.escapeHtml(s)}">`).join('')}
            </datalist>
          </div>
          <p id="name-hint" class="form-hint">Choose a standard section or create a custom one</p>
        </div>

        <div class="form-group">
          <label for="new-section-content">Section Content</label>
          <textarea
            id="new-section-content"
            class="section-content-textarea"
            rows="10"
            placeholder="Enter the section content..."
            aria-describedby="content-hint"
          >${this.escapeHtml(this.newSectionContent)}</textarea>
          <p id="content-hint" class="form-hint">Content will be added under the heading. Use Markdown formatting.</p>
        </div>

        <div class="form-group">
          <label for="insert-after-select">Insert After</label>
          <select id="insert-after-select" class="insert-select" aria-describedby="position-hint">
            <option value="">-- At end of file --</option>
            ${this.sections.map(s => `
              <option value="${this.escapeHtml(s.name)}" ${this.insertAfterSection === s.name ? 'selected' : ''}>
                ${this.escapeHtml(s.name)}
              </option>
            `).join('')}
          </select>
          <p id="position-hint" class="form-hint">Choose where to insert the new section</p>
        </div>
      </div>
    `
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Context selector
    this.container.querySelector('#context-selector')?.addEventListener('change', (e) => {
      this.selectContext(e.target.value)
    })

    // Refresh button
    this.container.querySelector('#refresh-config-btn')?.addEventListener('click', () => {
      this.loadConfig()
    })

    // Retry button
    this.container.querySelector('#retry-load-btn')?.addEventListener('click', () => {
      this.loadConfig()
    })

    // Direct content editor (for empty files)
    this.container.querySelector('#save-direct-content-btn')?.addEventListener('click', () => {
      this.saveDirectContent()
    })

    this.container.querySelector('#generate-template-btn')?.addEventListener('click', () => {
      this.generateTemplate()
    })

    // Create default button
    this.container.querySelector('#create-default-btn')?.addEventListener('click', () => {
      this.createDefaultConfig()
    })

    // Add section button
    this.container.querySelector('#add-section-btn')?.addEventListener('click', () => {
      this.openAddSectionModal()
    })

    // Section item clicks (for scrolling to section)
    this.container.querySelectorAll('.section-item .section-info').forEach(info => {
      info.addEventListener('click', (e) => {
        const sectionItem = e.target.closest('.section-item')
        const sectionName = sectionItem?.dataset.section
        if (sectionName) {
          this.selectSection(sectionName)
          this.scrollToSection(sectionName)
        }
      })
    })

    // Edit section buttons
    this.container.querySelectorAll('.edit-section-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const sectionName = btn.dataset.section
        this.openEditSectionModal(sectionName)
      })
    })

    // Delete section buttons
    this.container.querySelectorAll('.delete-section-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const sectionName = btn.dataset.section
        this.openDeleteSectionModal(sectionName)
      })
    })

    // Section list keyboard navigation
    const sectionsList = this.container.querySelector('.sections-list')
    if (sectionsList) {
      sectionsList.addEventListener('keydown', (e) => {
        this.handleSectionListKeydown(e)
      })
    }

    // Prompt input - send button
    this.container.querySelector('#send-prompt-btn')?.addEventListener('click', () => {
      this.sendPrompt()
    })

    // Prompt input - track changes
    const promptInput = this.container.querySelector('#claude-prompt-input')
    if (promptInput) {
      promptInput.addEventListener('input', (e) => {
        this.proposalPrompt = e.target.value
      })
      // Enter + Ctrl/Cmd to send
      promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          this.sendPrompt()
        }
      })
    }

    // Quick prompt buttons
    this.container.querySelectorAll('.quick-prompt-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const prompt = e.target.dataset.prompt
        if (prompt) {
          this.proposalPrompt = prompt
          const textarea = this.container.querySelector('#claude-prompt-input')
          if (textarea) textarea.value = prompt
          this.sendPrompt()
        }
      })
    })

    // Inline content editor
    const contentEditor = this.container.querySelector('#content-editor')
    if (contentEditor) {
      contentEditor.addEventListener('keydown', (e) => {
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          this.saveInlineContent()
        }
      })
    }

    // Save inline button
    this.container.querySelector('#save-inline-btn')?.addEventListener('click', () => {
      this.saveInlineContent()
    })

    // Revert inline button
    this.container.querySelector('#revert-inline-btn')?.addEventListener('click', () => {
      this.revertInlineContent()
    })

    // Diff view buttons
    this.container.querySelector('#cancel-proposal-btn')?.addEventListener('click', () => {
      this.cancelProposal()
    })

    this.container.querySelector('#apply-proposal-btn')?.addEventListener('click', () => {
      this.applyProposal()
    })

    // Modal event listeners
    this.attachModalEventListeners()
  }

  /**
   * Attach modal-specific event listeners
   */
  attachModalEventListeners() {
    if (!this.showSectionModal) return

    // Modal close button
    this.container.querySelector('.modal-close-btn')?.addEventListener('click', () => {
      this.closeSectionModal()
    })

    // Modal cancel button
    this.container.querySelector('#modal-cancel-btn')?.addEventListener('click', () => {
      this.closeSectionModal()
    })

    // Modal confirm button
    this.container.querySelector('#modal-confirm-btn')?.addEventListener('click', () => {
      this.confirmModalAction()
    })

    // Modal overlay click (close on outside click)
    this.container.querySelector('.section-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('section-modal-overlay')) {
        this.closeSectionModal()
      }
    })

    // Form input listeners
    const nameInput = this.container.querySelector('#new-section-name')
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        this.newSectionName = e.target.value
      })
    }

    const contentTextarea = this.container.querySelector('#new-section-content') ||
                           this.container.querySelector('#edit-section-content')
    if (contentTextarea) {
      contentTextarea.addEventListener('input', (e) => {
        this.newSectionContent = e.target.value
      })
    }

    const insertSelect = this.container.querySelector('#insert-after-select')
    if (insertSelect) {
      insertSelect.addEventListener('change', (e) => {
        this.insertAfterSection = e.target.value || null
      })
    }

    // Escape key to close modal
    document.addEventListener('keydown', this.handleModalKeydown.bind(this), { once: true })

    // Focus first input in modal
    requestAnimationFrame(() => {
      const firstInput = this.container.querySelector('.section-modal input, .section-modal textarea')
      firstInput?.focus()
    })
  }

  /**
   * Handle keyboard events in modal
   */
  handleModalKeydown(e) {
    if (!this.showSectionModal) return

    if (e.key === 'Escape') {
      e.preventDefault()
      this.closeSectionModal()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      this.confirmModalAction()
    }
  }

  /**
   * Handle keyboard navigation in sections list
   */
  handleSectionListKeydown(e) {
    const items = Array.from(this.container.querySelectorAll('.section-item'))
    const currentIndex = items.findIndex(item => item === document.activeElement)

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (currentIndex < items.length - 1) {
          items[currentIndex + 1].focus()
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (currentIndex > 0) {
          items[currentIndex - 1].focus()
        }
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        const sectionName = items[currentIndex]?.dataset.section
        if (sectionName) {
          this.selectSection(sectionName)
          this.scrollToSection(sectionName)
        }
        break
      case 'e':
        e.preventDefault()
        const editSection = items[currentIndex]?.dataset.section
        if (editSection) {
          this.openEditSectionModal(editSection)
        }
        break
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        const deleteSection = items[currentIndex]?.dataset.section
        if (deleteSection) {
          this.openDeleteSectionModal(deleteSection)
        }
        break
    }
  }

  /**
   * Select a section
   */
  selectSection(sectionName) {
    this.selectedSection = sectionName
    // Update visual selection without full re-render
    this.container.querySelectorAll('.section-item').forEach(item => {
      const isSelected = item.dataset.section === sectionName
      item.classList.toggle('selected', isSelected)
      item.setAttribute('aria-selected', isSelected.toString())
    })
  }

  /**
   * Scroll to a section in the content viewer
   */
  scrollToSection(sectionName) {
    const section = this.sections.find(s => s.name === sectionName)
    if (!section) return

    // Find the heading in the content and scroll to it
    const viewer = this.container.querySelector('.content-viewer')
    const content = this.container.querySelector('.markdown-content')
    if (!viewer || !content) return

    // Create a temporary element to find the section
    const lines = this.content.split('\n')
    let targetLine = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(sectionName)) {
        targetLine = i
        break
      }
    }

    // Approximate scroll position
    const lineHeight = 20 // Approximate
    viewer.scrollTop = targetLine * lineHeight
  }

  // ==================== Section Modal Methods ====================

  /**
   * Open add section modal
   */
  openAddSectionModal() {
    this.sectionModalMode = 'add'
    this.editingSection = null
    this.newSectionName = ''
    this.newSectionContent = ''
    this.insertAfterSection = null
    this.showSectionModal = true
    this.render()
  }

  /**
   * Open edit section modal
   */
  async openEditSectionModal(sectionName) {
    try {
      const sectionData = await window.puffin.plugins.invoke('claude-config-plugin', 'getSection', { sectionName })
      if (!sectionData) {
        this.showNotification(`Section "${sectionName}" not found`, 'error')
        return
      }

      this.sectionModalMode = 'edit'
      this.editingSection = sectionName
      this.newSectionContent = sectionData.content || ''
      this.showSectionModal = true
      this.render()
    } catch (err) {
      console.error('[ClaudeConfigView] Failed to load section:', err)
      this.showNotification(`Failed to load section: ${err.message}`, 'error')
    }
  }

  /**
   * Open delete section modal
   */
  openDeleteSectionModal(sectionName) {
    this.sectionModalMode = 'delete'
    this.editingSection = sectionName
    this.showSectionModal = true
    this.render()
  }

  /**
   * Close section modal
   */
  closeSectionModal() {
    this.showSectionModal = false
    this.editingSection = null
    this.newSectionName = ''
    this.newSectionContent = ''
    this.insertAfterSection = null
    this.render()
  }

  /**
   * Confirm modal action based on mode
   */
  async confirmModalAction() {
    switch (this.sectionModalMode) {
      case 'add':
        await this.addSection()
        break
      case 'edit':
        await this.updateSection()
        break
      case 'delete':
        await this.removeSection()
        break
    }
  }

  /**
   * Add a new section
   */
  async addSection() {
    const name = this.newSectionName.trim()
    if (!name) {
      this.showNotification('Please enter a section name', 'error')
      return
    }

    // Check for duplicate section names
    if (this.sections.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      this.showNotification(`A section named "${name}" already exists`, 'error')
      return
    }

    try {
      const result = await window.puffin.plugins.invoke('claude-config-plugin', 'proposeChange', {
        prompt: `Add a section called "${name}" with content: "${this.newSectionContent || '[Add content here]'}"${this.insertAfterSection ? ` after the "${this.insertAfterSection}" section` : ''}`
      })

      if (result.success && result.proposedContent) {
        // Apply the change directly since user initiated via modal
        const applyResult = await window.puffin.plugins.invoke(
          'claude-config-plugin',
          'applyProposedChange',
          { proposedContent: result.proposedContent }
        )

        if (applyResult.applied) {
          this.showNotification(`Section "${name}" added successfully!`, 'success')
          this.closeSectionModal()
          await this.loadConfig()
        } else {
          this.showNotification('Failed to add section', 'error')
        }
      } else {
        this.showNotification(result.summary || 'Failed to add section', 'error')
      }
    } catch (err) {
      console.error('[ClaudeConfigView] Failed to add section:', err)
      this.showNotification(`Failed to add section: ${err.message}`, 'error')
    }
  }

  /**
   * Update an existing section
   */
  async updateSection() {
    if (!this.editingSection) return

    const content = this.newSectionContent.trim()
    if (!content) {
      this.showNotification('Section content cannot be empty', 'error')
      return
    }

    try {
      const result = await window.puffin.plugins.invoke(
        'claude-config-plugin',
        'updateSection',
        { sectionName: this.editingSection, content }
      )

      if (result.updated) {
        this.showNotification(`Section "${this.editingSection}" updated successfully!`, 'success')
        this.closeSectionModal()
        await this.loadConfig()
      } else {
        this.showNotification('Failed to update section', 'error')
      }
    } catch (err) {
      console.error('[ClaudeConfigView] Failed to update section:', err)
      this.showNotification(`Failed to update section: ${err.message}`, 'error')
    }
  }

  /**
   * Remove a section
   */
  async removeSection() {
    if (!this.editingSection) return

    try {
      const result = await window.puffin.plugins.invoke('claude-config-plugin', 'proposeChange', {
        prompt: `Remove the "${this.editingSection}" section`
      })

      if (result.success && result.proposedContent) {
        const applyResult = await window.puffin.plugins.invoke(
          'claude-config-plugin',
          'applyProposedChange',
          { proposedContent: result.proposedContent }
        )

        if (applyResult.applied) {
          this.showNotification(`Section "${this.editingSection}" removed`, 'success')
          this.closeSectionModal()
          this.selectedSection = null
          await this.loadConfig()
        } else {
          this.showNotification('Failed to remove section', 'error')
        }
      } else {
        this.showNotification(result.summary || 'Failed to remove section', 'error')
      }
    } catch (err) {
      console.error('[ClaudeConfigView] Failed to remove section:', err)
      this.showNotification(`Failed to remove section: ${err.message}`, 'error')
    }
  }

  /**
   * Create a default CLAUDE.md configuration
   */
  async createDefaultConfig() {
    const defaultContent = `# Project Context

This file is auto-generated by Puffin to provide context to Claude Code.

## Project Overview

**Project:** ${this.context.projectName || 'My Project'}

Add a description of your project here.

## Coding Preferences

- **Programming Style:** Hybrid (OOP + FP)
- **Testing Approach:** Behavior-Driven Development
- **Documentation Level:** Standard
- **Error Handling:** Exceptions
- **Naming Convention:** camelCase
- **Comment Style:** JSDoc

## File Access Restrictions

**IMPORTANT: You must ONLY access files within this project directory.**

You are NOT allowed to:
- Read, write, or modify files outside this project
- Access parent directories or sibling projects
- Reference or use files from other projects on the system
- Execute commands that affect files outside the project root

All file operations must be scoped to this project directory and its subdirectories.
`

    try {
      const result = await window.puffin.plugins.invoke(
        'claude-config-plugin',
        'applyProposedChange',
        { proposedContent: defaultContent }
      )

      if (result.applied) {
        this.showNotification('Default CLAUDE.md created successfully!', 'success')
        await this.loadConfig()
      } else {
        this.showNotification('Failed to create configuration', 'error')
      }
    } catch (err) {
      console.error('[ClaudeConfigView] Failed to create default config:', err)
      this.showNotification(`Failed to create configuration: ${err.message}`, 'error')
    }
  }

  /**
   * Save content directly from the empty file editor
   */
  async saveDirectContent() {
    const textarea = this.container.querySelector('#direct-content-editor')
    const content = textarea?.value?.trim()

    if (!content) {
      this.showNotification('Please enter some content before saving', 'error')
      return
    }

    try {
      const result = await window.puffin.plugins.invoke(
        'claude-config-plugin',
        'applyProposedChange',
        { proposedContent: content }
      )

      if (result.applied) {
        this.showNotification('Content saved successfully!', 'success')
        await this.loadConfig()
      } else {
        this.showNotification('Failed to save content', 'error')
      }
    } catch (err) {
      console.error('[ClaudeConfigView] Failed to save direct content:', err)
      this.showNotification(`Failed to save: ${err.message}`, 'error')
    }
  }

  /**
   * Generate a template for the current context
   */
  generateTemplate() {
    const contextDisplay = this.selectedContext ? formatContextName(this.selectedContext) : 'Default'
    const template = `# ${contextDisplay} Context

This file provides context to Claude Code for ${contextDisplay.toLowerCase()} work.

## Overview

[Describe the focus and purpose of this branch/context]

## Focus Areas

- [Primary focus area]
- [Secondary focus area]
- [Additional concerns]

## Guidelines

[Add specific guidelines, conventions, or instructions for this context]

## Key Files

- \`path/to/important/file\` - Description
- \`path/to/another/file\` - Description

---

*Edit this template to provide context for Claude Code.*
`

    const textarea = this.container.querySelector('#direct-content-editor')
    if (textarea) {
      textarea.value = template
      this.showNotification('Template generated! Edit and save when ready.', 'info')
    }
  }

  /**
   * Save the full content from the direct editor
   */
  async saveFullContent() {
    const textarea = this.container.querySelector('#full-content-editor')
    const newContent = textarea?.value || ''

    try {
      const result = await window.puffin.plugins.invoke(
        'claude-config-plugin',
        'applyProposedChange',
        { proposedContent: newContent }
      )

      if (result.applied) {
        this.content = newContent
        this.showNotification('Changes saved successfully!', 'success')
        // Reload to update sections
        await this.loadConfig()
      } else {
        this.showNotification('Failed to save changes', 'error')
      }
    } catch (err) {
      console.error('[ClaudeConfigView] Failed to save content:', err)
      this.showNotification(`Failed to save: ${err.message}`, 'error')
    }
  }

  /**
   * Revert content to last saved state (legacy)
   */
  revertContent() {
    const textarea = this.container.querySelector('#full-content-editor')
    if (textarea) {
      textarea.value = this.content
      this.showNotification('Reverted to last saved version', 'info')
    }
  }

  /**
   * Save content from the inline editor
   */
  async saveInlineContent() {
    const textarea = this.container.querySelector('#content-editor')
    const newContent = textarea?.value || ''

    try {
      const result = await window.puffin.plugins.invoke(
        'claude-config-plugin',
        'applyProposedChange',
        { proposedContent: newContent }
      )

      if (result.applied) {
        this.content = newContent
        this.showNotification('Changes saved successfully!', 'success')

        // Trigger activateBranch to update CLAUDE.md if this is the active branch
        await this.syncToActiveCLAUDEmd()

        // Reload to update sections sidebar
        await this.loadConfig()
      } else {
        this.showNotification('Failed to save changes', 'error')
      }
    } catch (err) {
      console.error('[ClaudeConfigView] Failed to save inline content:', err)
      this.showNotification(`Failed to save: ${err.message}`, 'error')
    }
  }

  /**
   * Sync the current branch file to CLAUDE.md via Puffin Core
   * This ensures changes are reflected in the active CLAUDE.md file
   */
  async syncToActiveCLAUDEmd() {
    if (!this.selectedContext) return

    try {
      // Call Puffin Core's activateBranch to regenerate CLAUDE.md
      await window.puffin.state.activateBranch(this.selectedContext)
      console.log(`[ClaudeConfigView] Synced ${this.selectedContext} to CLAUDE.md`)
    } catch (err) {
      // Non-fatal - the file was saved, just not synced to CLAUDE.md
      console.warn('[ClaudeConfigView] Could not sync to CLAUDE.md:', err.message)
    }
  }

  /**
   * Revert content in the inline editor
   */
  revertInlineContent() {
    const textarea = this.container.querySelector('#content-editor')
    if (textarea) {
      textarea.value = this.content
      this.showNotification('Reverted to last saved version', 'info')
    }
  }

  /**
   * Send prompt to Claude to generate/update the context file
   */
  async sendPrompt() {
    const prompt = this.proposalPrompt?.trim()
    if (!prompt) {
      this.showNotification('Please enter a prompt', 'error')
      return
    }

    this.isProcessingPrompt = true
    this.render()

    try {
      // Build a richer prompt that includes context about what we want
      const contextDisplay = this.selectedContext ? formatContextName(this.selectedContext) : 'default'
      const hasExistingContent = this.content && this.content.trim().length > 0

      // Build system-style prompt for Claude to generate CLAUDE.md content
      // IMPORTANT: Tell Claude NOT to use tools - just generate content directly
      const fullPrompt = `You are helping write a CLAUDE.md context file for Claude Code.

IMPORTANT: Do NOT use any tools. Do NOT read files. Do NOT search the codebase.
Generate the content DIRECTLY based on the user's request and your knowledge of best practices.

CLAUDE.md files provide project-specific instructions and context to Claude Code.
They typically include:
- Project overview and description
- Coding preferences (style, testing approach, documentation level)
- Focus areas for the current branch/context
- Key files and their purposes
- Guidelines and constraints

${hasExistingContent
  ? `CURRENT CONTENT (modify based on the request below):
\`\`\`markdown
${this.content}
\`\`\`

USER REQUEST: ${prompt}

Update the above content based on the user's request. Output ONLY the updated markdown content, no explanations or preamble.`
  : `CONTEXT NAME: ${contextDisplay}

USER REQUEST: ${prompt}

Generate a CLAUDE.md context file based on this request. Output ONLY the markdown content, no explanations or preamble. Start directly with the markdown heading.`}`

      // Use Puffin's core Claude service via IPC
      // Allow multiple turns in case Claude needs them, but the prompt discourages tool use
      const result = await window.puffin.claude.sendPrompt(fullPrompt, {
        model: 'sonnet',  // Use Sonnet for better quality generation
        maxTurns: 5,      // Allow a few turns in case needed
        timeout: 90000    // 90 seconds for generation tasks
      })

      if (result.success && result.response) {
        // Clean up the response - remove any markdown code block wrappers if present
        let generatedContent = result.response.trim()
        if (generatedContent.startsWith('```markdown')) {
          generatedContent = generatedContent.slice('```markdown'.length)
        } else if (generatedContent.startsWith('```')) {
          generatedContent = generatedContent.slice(3)
        }
        if (generatedContent.endsWith('```')) {
          generatedContent = generatedContent.slice(0, -3)
        }
        generatedContent = generatedContent.trim()

        // Create a proposal with diff
        this.proposal = {
          success: true,
          summary: `Generated ${hasExistingContent ? 'updated' : 'new'} content for ${contextDisplay}`,
          proposedContent: generatedContent,
          diff: this.generateSimpleDiff(this.content || '', generatedContent)
        }
        this.showingDiff = true
        this.isProcessingPrompt = false
        this.render()
      } else {
        this.showNotification(result.error || 'Failed to generate content', 'error')
        this.isProcessingPrompt = false
        this.render()
      }
    } catch (err) {
      console.error('[ClaudeConfigView] Failed to send prompt:', err)
      this.showNotification(`Failed to generate: ${err.message}`, 'error')
      this.isProcessingPrompt = false
      this.render()
    }
  }

  /**
   * Generate a simple line-by-line diff for display
   */
  generateSimpleDiff(oldContent, newContent) {
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')
    const diff = []

    // Simple diff: show all removed lines, then all added lines
    // For a real implementation, use a proper diff algorithm
    const maxLen = Math.max(oldLines.length, newLines.length)

    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i]
      const newLine = newLines[i]

      if (oldLine === undefined) {
        // New line added
        diff.push({ type: 'add', line: newLine })
      } else if (newLine === undefined) {
        // Line removed
        diff.push({ type: 'remove', line: oldLine })
      } else if (oldLine !== newLine) {
        // Line changed
        diff.push({ type: 'remove', line: oldLine })
        diff.push({ type: 'add', line: newLine })
      } else {
        // Line unchanged
        diff.push({ type: 'unchanged', line: oldLine })
      }
    }

    return diff
  }

  /**
   * Cancel the current proposal
   */
  cancelProposal() {
    this.proposal = null
    this.showingDiff = false
    this.render()
  }

  /**
   * Apply the proposed change
   */
  async applyProposal() {
    if (!this.proposal?.proposedContent) {
      this.showNotification('No proposal to apply', 'error')
      return
    }

    try {
      const result = await window.puffin.plugins.invoke(
        'claude-config-plugin',
        'applyProposedChange',
        { proposedContent: this.proposal.proposedContent }
      )

      if (result.applied) {
        this.showNotification('Changes applied successfully!', 'success')
        this.proposal = null
        this.proposalPrompt = ''
        this.showingDiff = false

        // Sync to CLAUDE.md
        await this.syncToActiveCLAUDEmd()

        await this.loadConfig()
      } else {
        this.showNotification('Failed to apply changes', 'error')
      }
    } catch (err) {
      console.error('[ClaudeConfigView] Failed to apply change:', err)
      this.showNotification(`Failed to apply change: ${err.message}`, 'error')
    }
  }

  /**
   * Show a notification toast
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div')
    notification.className = `config-notification config-notification-${type}`
    notification.innerHTML = `
      <span class="notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
      <span class="notification-message">${this.escapeHtml(message)}</span>
    `

    document.body.appendChild(notification)

    requestAnimationFrame(() => {
      notification.classList.add('show')
    })

    setTimeout(() => {
      notification.classList.remove('show')
      setTimeout(() => notification.remove(), 300)
    }, 3000)
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
   * Lifecycle: Called when view is activated
   */
  onActivate() {
    this.loadConfig()
  }

  /**
   * Lifecycle: Called when view is deactivated
   */
  onDeactivate() {
    // Nothing specific needed
  }

  /**
   * Cleanup when component is destroyed
   */
  destroy() {
    if (this.container) {
      this.container.innerHTML = ''
      this.container = null
    }
  }
}

export default ClaudeConfigView
