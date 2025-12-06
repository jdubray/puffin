/**
 * Architecture Component
 *
 * Manages the architecture document with Claude review integration.
 */

export class ArchitectureComponent {
  constructor(intents) {
    this.intents = intents
    this.textarea = null
    this.infoText = null
    this.reviewBtn = null
    this.saveTimeout = null
  }

  /**
   * Initialize the component
   */
  init() {
    this.textarea = document.getElementById('architecture-content')
    this.infoText = document.getElementById('architecture-info')
    this.reviewBtn = document.getElementById('review-architecture-btn')

    this.bindEvents()
    this.subscribeToState()
  }

  /**
   * Bind DOM events
   */
  bindEvents() {
    // Content changes with debounced save
    this.textarea.addEventListener('input', () => {
      this.handleContentChange()
    })

    // Review with Claude
    this.reviewBtn.addEventListener('click', () => {
      this.reviewWithClaude()
    })
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      const { state } = e.detail
      this.render(state.architecture)
    })
  }

  /**
   * Render component based on state
   */
  render(archState) {
    // Only update textarea if content differs (avoid cursor jump)
    if (this.textarea.value !== archState.content) {
      const cursorPos = this.textarea.selectionStart
      this.textarea.value = archState.content
      this.textarea.selectionStart = cursorPos
      this.textarea.selectionEnd = cursorPos
    }

    // Update info text
    const info = []
    if (archState.wordCount > 0) {
      info.push(`${archState.wordCount} words`)
    }
    info.push(`v${archState.version}`)
    if (archState.lastReviewAt) {
      info.push(`Last reviewed: ${this.formatDate(archState.lastReviewAt)}`)
    }
    this.infoText.textContent = info.join(' • ')
  }

  /**
   * Handle content changes
   */
  handleContentChange() {
    // Debounce updates
    clearTimeout(this.saveTimeout)
    this.saveTimeout = setTimeout(() => {
      this.intents.updateArchitecture(this.textarea.value)
    }, 500)
  }

  /**
   * Review architecture with Claude
   */
  async reviewWithClaude() {
    const content = this.textarea.value.trim()
    if (!content) {
      alert('Please add some architecture content to review.')
      return
    }

    const state = window.puffinApp?.state
    if (!state?.project.exists) {
      alert('Please create or open a project first.')
      return
    }

    // Mark as reviewing
    this.intents.reviewArchitecture()

    // Build review prompt
    const reviewPrompt = this.buildReviewPrompt(content, state.config)

    // Switch to prompt view and submit
    this.intents.switchView('prompt')
    this.intents.selectBranch('architecture')

    // Set prompt content
    this.intents.startCompose('architecture')
    this.intents.updatePromptContent(reviewPrompt)

    // Auto-submit if Claude is available
    if (window.puffin) {
      // Let the user review the prompt first
      // They can click Send to submit
    }
  }

  /**
   * Build architecture review prompt
   */
  buildReviewPrompt(content, config) {
    return `Please review the following architecture document for the "${config.name || 'this'}" project.

Consider:
1. **Completeness**: Are all major components documented?
2. **Clarity**: Is the architecture easy to understand?
3. **Consistency**: Does it align with the project's technical requirements?
4. **Best Practices**: Does it follow good architectural patterns?
5. **Potential Issues**: Are there any red flags or missing considerations?

## Current Architecture Document

${content}

---

Please provide:
- A summary of your assessment
- Specific suggestions for improvement
- Any questions that need clarification
- Recommended additions if anything important is missing`
  }

  /**
   * Format date
   */
  formatDate(timestamp) {
    const date = new Date(timestamp)
    return date.toLocaleDateString()
  }

  /**
   * Insert template
   */
  insertTemplate() {
    const template = `# Architecture Document

## Overview
[Describe the overall system architecture and its goals]

## Components

### Frontend
[Describe the frontend architecture]

### Backend
[Describe the backend architecture]

### Database
[Describe the database schema and data storage]

## Data Flow
[Explain how data flows through the system]

## APIs

### External APIs
[List external APIs consumed]

### Internal APIs
[Document internal API endpoints]

## Security Considerations
[Document security measures and considerations]

## Scalability
[Describe how the system can scale]

## Deployment
[Describe the deployment architecture]

## Future Considerations
[Note planned improvements or areas for future development]
`

    if (!this.textarea.value.trim() ||
        confirm('Replace current content with template?')) {
      this.intents.updateArchitecture(template)
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    clearTimeout(this.saveTimeout)
  }
}
