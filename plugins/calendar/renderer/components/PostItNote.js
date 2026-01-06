/**
 * PostItNote Component
 *
 * Displays a post-it note with handwriting-style font.
 * Supports view, edit, and delete actions.
 */

const NOTE_COLORS = {
  yellow: { bg: '#fff9c4', border: '#fbc02d', text: '#5d4037' },
  pink: { bg: '#f8bbd9', border: '#ec407a', text: '#880e4f' },
  blue: { bg: '#bbdefb', border: '#42a5f5', text: '#0d47a1' },
  green: { bg: '#c8e6c9', border: '#66bb6a', text: '#1b5e20' },
  orange: { bg: '#ffe0b2', border: '#ffa726', text: '#e65100' },
  purple: { bg: '#e1bee7', border: '#ab47bc', text: '#4a148c' }
}

class PostItNote {
  /**
   * Create a PostItNote
   * @param {Object} note - Note data object
   * @param {Object} options - Configuration options
   * @param {Function} options.onEdit - Callback when edit is clicked
   * @param {Function} options.onDelete - Callback when delete is clicked
   * @param {boolean} options.compact - Render in compact mode (indicator only)
   */
  constructor(note, options = {}) {
    this.note = note
    this.options = options
    this.element = null

    this.create()
  }

  /**
   * Create the DOM element
   */
  create() {
    this.element = document.createElement('div')
    this.element.className = 'postit-note'

    this.render()
    this.bindEvents()
  }

  /**
   * Render the note content
   */
  render() {
    const colorScheme = NOTE_COLORS[this.note.color] || NOTE_COLORS.yellow

    this.element.style.setProperty('--postit-bg', colorScheme.bg)
    this.element.style.setProperty('--postit-border', colorScheme.border)
    this.element.style.setProperty('--postit-text', colorScheme.text)
    this.element.setAttribute('data-note-id', this.note.id)
    this.element.setAttribute('data-color', this.note.color || 'yellow')

    if (this.options.compact) {
      this.renderCompact()
    } else {
      this.renderFull()
    }
  }

  /**
   * Render compact indicator view
   */
  renderCompact() {
    this.element.classList.add('postit-note-compact')
    this.element.setAttribute('role', 'button')
    this.element.setAttribute('tabindex', '0')
    this.element.setAttribute('aria-label', `Note: ${this.truncateText(this.note.text, 50)}`)
    this.element.setAttribute('title', this.note.text)

    this.element.innerHTML = `
      <div class="postit-indicator" aria-hidden="true"></div>
    `
  }

  /**
   * Render full note view
   */
  renderFull() {
    this.element.classList.add('postit-note-full')
    this.element.setAttribute('role', 'article')
    this.element.setAttribute('aria-label', 'Post-it note')

    const escapedText = this.escapeHtml(this.note.text)
    const createdDate = this.formatDate(this.note.createdAt)
    const updatedDate = this.note.updatedAt !== this.note.createdAt
      ? this.formatDate(this.note.updatedAt)
      : null

    this.element.innerHTML = `
      <div class="postit-header">
        <div class="postit-fold" aria-hidden="true"></div>
        <div class="postit-actions">
          <button class="postit-action-btn postit-edit-btn"
                  type="button"
                  title="Edit note"
                  aria-label="Edit note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="postit-action-btn postit-delete-btn"
                  type="button"
                  title="Delete note"
                  aria-label="Delete note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="postit-content">
        <p class="postit-text">${escapedText}</p>
      </div>
      <div class="postit-footer">
        <span class="postit-date" title="${updatedDate ? 'Updated: ' + updatedDate : 'Created: ' + createdDate}">
          ${updatedDate ? 'Updated ' + updatedDate : createdDate}
        </span>
      </div>
    `
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    if (this.options.compact) {
      // Compact mode: click opens editor
      this.element.addEventListener('click', (e) => this.handleCompactClick(e))
      this.element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          this.handleCompactClick(e)
        }
      })
    } else {
      // Full mode: edit and delete buttons
      const editBtn = this.element.querySelector('.postit-edit-btn')
      const deleteBtn = this.element.querySelector('.postit-delete-btn')

      if (editBtn) {
        editBtn.addEventListener('click', (e) => this.handleEditClick(e))
      }
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => this.handleDeleteClick(e))
      }
    }
  }

  /**
   * Handle compact mode click
   * @param {Event} e - Click event
   */
  handleCompactClick(e) {
    e.stopPropagation()

    if (this.options.onEdit) {
      this.options.onEdit(this.note)
    }

    this.dispatchEvent('postit:click', { note: this.note })
  }

  /**
   * Handle edit button click
   * @param {Event} e - Click event
   */
  handleEditClick(e) {
    e.stopPropagation()

    if (this.options.onEdit) {
      this.options.onEdit(this.note)
    }

    this.dispatchEvent('postit:edit', { note: this.note })
  }

  /**
   * Handle delete button click
   * @param {Event} e - Click event
   */
  handleDeleteClick(e) {
    e.stopPropagation()

    if (this.options.onDelete) {
      this.options.onDelete(this.note)
    }

    this.dispatchEvent('postit:delete', { note: this.note })
  }

  /**
   * Dispatch custom event
   * @param {string} eventName - Event name
   * @param {Object} detail - Event detail
   */
  dispatchEvent(eventName, detail) {
    const event = new CustomEvent(eventName, {
      detail,
      bubbles: true
    })
    this.element.dispatchEvent(event)
  }

  /**
   * Update note data
   * @param {Object} note - New note data
   */
  setNote(note) {
    this.note = note
    this.render()
    this.bindEvents()
  }

  /**
   * Truncate text with ellipsis
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string}
   */
  truncateText(text, maxLength) {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength - 1) + '…'
  }

  /**
   * Format date for display
   * @param {string} dateStr - ISO date string
   * @returns {string}
   */
  formatDate(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString('default', { hour: 'numeric', minute: '2-digit' })
    }
    if (diffDays === 1) {
      return 'Yesterday'
    }
    if (diffDays < 7) {
      return date.toLocaleDateString('default', { weekday: 'short' })
    }
    return date.toLocaleDateString('default', { month: 'short', day: 'numeric' })
  }

  /**
   * Escape HTML for safe display
   * @param {string} text - Text to escape
   * @returns {string}
   */
  escapeHtml(text) {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML.replace(/\n/g, '<br>')
  }

  /**
   * Get the DOM element
   * @returns {HTMLElement}
   */
  getElement() {
    return this.element
  }

  /**
   * Destroy the component
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
    }
    this.element = null
  }
}

/**
 * Render note indicators for a day cell
 * @param {Array} notes - Array of notes
 * @param {Object} options - Options
 * @returns {string} HTML string
 */
PostItNote.renderIndicators = function(notes, options = {}) {
  if (!notes || notes.length === 0) {
    return ''
  }

  const maxVisible = options.maxVisible || 3
  const visibleNotes = notes.slice(0, maxVisible)
  const overflowCount = notes.length - maxVisible

  let html = '<div class="postit-indicators" role="list" aria-label="Notes">'

  visibleNotes.forEach((note, index) => {
    const colorScheme = NOTE_COLORS[note.color] || NOTE_COLORS.yellow
    html += `
      <div class="postit-indicator-dot"
           role="listitem"
           tabindex="0"
           data-note-index="${index}"
           data-note-id="${note.id}"
           title="${note.text.substring(0, 100)}"
           style="background: ${colorScheme.bg}; border-color: ${colorScheme.border}">
      </div>
    `
  })

  if (overflowCount > 0) {
    html += `
      <div class="postit-indicator-overflow"
           role="listitem"
           title="${overflowCount} more note(s)">
        +${overflowCount}
      </div>
    `
  }

  html += '</div>'
  return html
}

// Export color constants
PostItNote.NOTE_COLORS = NOTE_COLORS

// Export for use by plugin system
export { PostItNote }
