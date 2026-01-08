/**
 * NoteEditor Component
 *
 * Modal for creating and editing post-it notes.
 * Includes text input, color picker, character counter, and delete confirmation.
 */

const MAX_NOTE_LENGTH = 500
const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'orange', 'purple']

const COLOR_LABELS = {
  yellow: 'Yellow',
  pink: 'Pink',
  blue: 'Blue',
  green: 'Green',
  orange: 'Orange',
  purple: 'Purple'
}

class NoteEditor {
  /**
   * Create a NoteEditor
   * @param {Object} options - Configuration options
   * @param {Object} options.note - Existing note to edit (null for new)
   * @param {string} options.dateStr - Date string (YYYY-MM-DD)
   * @param {Function} options.onSave - Callback when note is saved
   * @param {Function} options.onDelete - Callback when note is deleted
   * @param {Function} options.onCopy - Callback when note is copied
   * @param {Function} options.onClose - Callback when editor is closed
   * @param {HTMLElement} options.container - Container element (defaults to body)
   */
  constructor(options = {}) {
    this.note = options.note || null
    this.dateStr = options.dateStr || ''
    this.onSave = options.onSave || null
    this.onDelete = options.onDelete || null
    this.onCopy = options.onCopy || null
    this.onClose = options.onClose || null
    this.container = options.container || document.body

    this.isEditing = !!this.note
    this.selectedColor = this.note?.color || 'yellow'
    this.showDeleteConfirm = false

    this.element = null
    this.textArea = null
    this.charCounter = null
    this.boundHandleKeyDown = this.handleKeyDown.bind(this)

    this.render()
    this.bindEvents()
  }

  /**
   * Render the editor modal
   */
  render() {
    this.element = document.createElement('div')
    this.element.className = 'note-editor-overlay'
    this.element.setAttribute('role', 'dialog')
    this.element.setAttribute('aria-modal', 'true')
    this.element.setAttribute('aria-labelledby', 'note-editor-title')

    const title = this.isEditing ? 'Edit Note' : 'Add Note'
    const dateDisplay = this.formatDateDisplay(this.dateStr)
    const noteText = this.note?.text || ''
    const charCount = noteText.length

    this.element.innerHTML = `
      <div class="note-editor-backdrop" aria-hidden="true"></div>
      <div class="note-editor-modal">
        <div class="note-editor-header">
          <div class="note-editor-title-section">
            <h3 id="note-editor-title">${title}</h3>
            <span class="note-editor-date">${this.escapeHtml(dateDisplay)}</span>
          </div>
          <button class="note-editor-close-btn"
                  type="button"
                  aria-label="Close"
                  title="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="note-editor-content">
          <div class="note-editor-color-section">
            <label class="note-editor-label">Color</label>
            <div class="note-editor-colors" role="radiogroup" aria-label="Note color">
              ${NOTE_COLORS.map(color => `
                <button type="button"
                        class="note-editor-color-btn ${color === this.selectedColor ? 'selected' : ''}"
                        data-color="${color}"
                        role="radio"
                        aria-checked="${color === this.selectedColor}"
                        aria-label="${COLOR_LABELS[color]}"
                        title="${COLOR_LABELS[color]}">
                  <span class="note-editor-color-swatch" style="--swatch-color: var(--postit-${color}-bg, ${this.getColorValue(color)})"></span>
                  ${color === this.selectedColor ? '<svg class="note-editor-color-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="note-editor-text-section">
            <label class="note-editor-label" for="note-editor-textarea">Note</label>
            <textarea id="note-editor-textarea"
                      class="note-editor-textarea"
                      placeholder="Write your note here..."
                      maxlength="${MAX_NOTE_LENGTH}"
                      rows="6"
                      aria-describedby="note-editor-counter">${this.escapeHtml(noteText)}</textarea>
            <div class="note-editor-counter" id="note-editor-counter">
              <span class="note-editor-char-count ${charCount > MAX_NOTE_LENGTH * 0.9 ? 'warning' : ''}">${charCount}</span>
              <span class="note-editor-char-max">/ ${MAX_NOTE_LENGTH}</span>
            </div>
          </div>

          ${this.isEditing ? `
            <div class="note-editor-actions-section">
              <button type="button"
                      class="note-editor-copy-btn"
                      title="Copy note (Ctrl+C)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy note
              </button>
            </div>
            <div class="note-editor-delete-section">
              <button type="button"
                      class="note-editor-delete-btn"
                      aria-expanded="false">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Delete note
              </button>
              <div class="note-editor-delete-confirm" role="alert" style="display: none;">
                <span>Delete this note?</span>
                <button type="button" class="note-editor-confirm-yes">Yes, delete</button>
                <button type="button" class="note-editor-confirm-no">Cancel</button>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="note-editor-footer">
          <button type="button" class="note-editor-btn note-editor-cancel-btn">
            Cancel
          </button>
          <button type="button" class="note-editor-btn note-editor-save-btn">
            ${this.isEditing ? 'Save changes' : 'Add note'}
          </button>
        </div>
      </div>
    `

    this.container.appendChild(this.element)

    // Store references
    this.textArea = this.element.querySelector('.note-editor-textarea')
    this.charCounter = this.element.querySelector('.note-editor-char-count')

    // Focus the textarea
    setTimeout(() => {
      this.textArea.focus()
      // Move cursor to end
      this.textArea.setSelectionRange(this.textArea.value.length, this.textArea.value.length)
    }, 50)

    // Setup focus trap
    this.setupFocusTrap()
  }

  /**
   * Get CSS color value for a color name
   * @param {string} color - Color name
   * @returns {string} CSS color value
   */
  getColorValue(color) {
    const colors = {
      yellow: '#fff9c4',
      pink: '#f8bbd9',
      blue: '#bbdefb',
      green: '#c8e6c9',
      orange: '#ffe0b2',
      purple: '#e1bee7'
    }
    return colors[color] || colors.yellow
  }

  /**
   * Format date for display
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   * @returns {string}
   */
  formatDateDisplay(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('default', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Close button
    const closeBtn = this.element.querySelector('.note-editor-close-btn')
    closeBtn.addEventListener('click', () => this.close())

    // Backdrop click
    const backdrop = this.element.querySelector('.note-editor-backdrop')
    backdrop.addEventListener('click', () => this.close())

    // Cancel button
    const cancelBtn = this.element.querySelector('.note-editor-cancel-btn')
    cancelBtn.addEventListener('click', () => this.close())

    // Save button
    const saveBtn = this.element.querySelector('.note-editor-save-btn')
    saveBtn.addEventListener('click', () => this.save())

    // Text area input
    this.textArea.addEventListener('input', () => this.updateCharCount())

    // Color buttons
    this.element.querySelectorAll('.note-editor-color-btn').forEach(btn => {
      btn.addEventListener('click', () => this.selectColor(btn.dataset.color))
    })

    // Delete and copy section (if editing)
    if (this.isEditing) {
      const deleteBtn = this.element.querySelector('.note-editor-delete-btn')
      const confirmYes = this.element.querySelector('.note-editor-confirm-yes')
      const confirmNo = this.element.querySelector('.note-editor-confirm-no')
      const copyBtn = this.element.querySelector('.note-editor-copy-btn')

      deleteBtn.addEventListener('click', () => this.toggleDeleteConfirm(true))
      confirmYes.addEventListener('click', () => this.confirmDelete())
      confirmNo.addEventListener('click', () => this.toggleDeleteConfirm(false))

      if (copyBtn) {
        copyBtn.addEventListener('click', () => this.copyNote())
      }
    }

    // Keyboard handling
    document.addEventListener('keydown', this.boundHandleKeyDown)
  }

  /**
   * Handle keyboard events
   * @param {KeyboardEvent} e - Keyboard event
   */
  handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (this.showDeleteConfirm) {
        this.toggleDeleteConfirm(false)
      } else {
        this.close()
      }
    }

    // Cmd/Ctrl + Enter to save
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      this.save()
    }
  }

  /**
   * Update character counter
   */
  updateCharCount() {
    const count = this.textArea.value.length
    this.charCounter.textContent = count

    if (count > MAX_NOTE_LENGTH * 0.9) {
      this.charCounter.classList.add('warning')
    } else {
      this.charCounter.classList.remove('warning')
    }

    if (count >= MAX_NOTE_LENGTH) {
      this.charCounter.classList.add('limit')
    } else {
      this.charCounter.classList.remove('limit')
    }
  }

  /**
   * Select a color
   * @param {string} color - Color name
   */
  selectColor(color) {
    this.selectedColor = color

    // Update UI
    this.element.querySelectorAll('.note-editor-color-btn').forEach(btn => {
      const isSelected = btn.dataset.color === color
      btn.classList.toggle('selected', isSelected)
      btn.setAttribute('aria-checked', isSelected)

      // Update check mark
      const existingCheck = btn.querySelector('.note-editor-color-check')
      if (isSelected && !existingCheck) {
        btn.insertAdjacentHTML('beforeend', '<svg class="note-editor-color-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>')
      } else if (!isSelected && existingCheck) {
        existingCheck.remove()
      }
    })
  }

  /**
   * Toggle delete confirmation
   * @param {boolean} show - Whether to show confirmation
   */
  toggleDeleteConfirm(show) {
    this.showDeleteConfirm = show
    const deleteBtn = this.element.querySelector('.note-editor-delete-btn')
    const confirmEl = this.element.querySelector('.note-editor-delete-confirm')

    deleteBtn.style.display = show ? 'none' : ''
    deleteBtn.setAttribute('aria-expanded', show)
    confirmEl.style.display = show ? 'flex' : 'none'

    if (show) {
      const cancelBtn = confirmEl.querySelector('.note-editor-confirm-no')
      cancelBtn.focus()
    }
  }

  /**
   * Confirm and execute delete
   */
  confirmDelete() {
    if (this.onDelete && this.note) {
      this.onDelete(this.note)
    }

    this.dispatchEvent('note:delete', { note: this.note, dateStr: this.dateStr })
    this.close()
  }

  /**
   * Copy the note to clipboard state
   * Copies the original saved note data, not unsaved form modifications
   */
  copyNote() {
    if (!this.note) return

    // Copy the original saved note data to avoid copying unsaved modifications
    // This ensures users can only copy content that actually exists in storage
    const noteData = {
      id: this.note.id,
      text: this.note.text,
      color: this.note.color || 'yellow'
    }

    // Visual feedback on the button
    const copyBtn = this.element.querySelector('.note-editor-copy-btn')
    if (copyBtn) {
      copyBtn.classList.add('copied')
      copyBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Copied!
      `
      setTimeout(() => {
        copyBtn.classList.remove('copied')
        copyBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          Copy note
        `
      }, 1500)
    }

    // Callback
    if (this.onCopy) {
      this.onCopy(noteData)
    }

    // Dispatch event
    this.dispatchEvent('note:copy', { note: noteData, dateStr: this.dateStr })
  }

  /**
   * Save the note
   */
  save() {
    const text = this.textArea.value.trim()

    if (!text) {
      this.showError('Please enter some text for your note.')
      this.textArea.focus()
      return
    }

    if (text.length > MAX_NOTE_LENGTH) {
      this.showError(`Note exceeds maximum length of ${MAX_NOTE_LENGTH} characters.`)
      return
    }

    const noteData = {
      text,
      color: this.selectedColor
    }

    if (this.isEditing) {
      noteData.id = this.note.id
    }

    if (this.onSave) {
      this.onSave(noteData, this.dateStr)
    }

    this.dispatchEvent('note:save', { note: noteData, dateStr: this.dateStr, isNew: !this.isEditing })
    this.close()
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    // Create or update error element
    let errorEl = this.element.querySelector('.note-editor-error')
    if (!errorEl) {
      errorEl = document.createElement('div')
      errorEl.className = 'note-editor-error'
      errorEl.setAttribute('role', 'alert')
      const content = this.element.querySelector('.note-editor-content')
      content.insertBefore(errorEl, content.firstChild)
    }
    errorEl.textContent = message
    errorEl.style.display = 'block'

    // Auto-hide after 3 seconds
    setTimeout(() => {
      errorEl.style.display = 'none'
    }, 3000)
  }

  /**
   * Setup focus trap within modal
   */
  setupFocusTrap() {
    const modal = this.element.querySelector('.note-editor-modal')
    const focusableEls = modal.querySelectorAll(
      'button, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const firstFocusable = focusableEls[0]
    const lastFocusable = focusableEls[focusableEls.length - 1]

    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault()
          lastFocusable.focus()
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault()
          firstFocusable.focus()
        }
      }
    })
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
   * Close the editor
   */
  close() {
    // Add closing animation
    this.element.classList.add('note-editor-closing')

    setTimeout(() => {
      document.removeEventListener('keydown', this.boundHandleKeyDown)

      if (this.onClose) {
        this.onClose()
      }

      this.destroy()
    }, 150)
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
    return div.innerHTML
  }

  /**
   * Destroy the component
   */
  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
    }
    this.element = null
    this.textArea = null
    this.charCounter = null
  }

  /**
   * Static method to show the editor
   * @param {Object} options - Editor options
   * @returns {NoteEditor} Editor instance
   */
  static show(options = {}) {
    return new NoteEditor(options)
  }
}

// Export for use by plugin system
export { NoteEditor, MAX_NOTE_LENGTH, NOTE_COLORS }
