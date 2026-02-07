/**
 * ExcalidrawView - Main view component for the Excalidraw Sketcher plugin
 *
 * Vanilla JavaScript ES6 class with lifecycle methods following the DesignerView pattern.
 * Provides save/load/export/import workflows with toolbar, canvas area, and sidebar.
 *
 * The Excalidraw React component integration (Story 2) will mount into the canvas
 * container. Until then, the canvas area shows a placeholder with basic drawing info.
 */
export class ExcalidrawView {
  /**
   * @param {HTMLElement} element - Container element provided by plugin view system
   * @param {Object} options - View options from PluginViewContainer
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}

    // Scene state (synced with Excalidraw when integrated)
    this.elements = []
    this.appState = {}
    this.files = {}
    this.selectedElement = null

    // UI state
    this.definitions = []
    this.loading = true
    this.error = null
    this.currentFilename = null
    this.theme = 'dark'

    // Excalidraw API reference (set by Story 2 React integration)
    this.excalidrawAPI = null

    // Element refs
    this.canvasContainer = null
    this.sidebarList = null

    // Bound keyboard handler for cleanup
    this._keyboardHandler = this._handleKeyboard.bind(this)

    // Track open modals/notifications for cleanup on destroy
    this._activeOverlays = new Set()

    // Track current notification to dismiss before showing a new one
    this._activeNotification = null
  }

  /**
   * Initialize the component
   */
  async init() {
    this.container.className = 'excalidraw-view'
    this.render()
    document.addEventListener('keydown', this._keyboardHandler)

    // Load Excalidraw React component
    try {
      await this._loadAndMountExcalidraw()
    } catch (error) {
      console.error('[ExcalidrawView] Failed to load Excalidraw:', error)
      this.error = `Failed to load Excalidraw: ${error.message}`
      this.render() // Re-render to show error
    }

    await this.loadDefinitions()
  }

  /**
   * Main render method — builds toolbar, canvas, and sidebar
   */
  render() {
    if (!this.container) return

    this.container.innerHTML = `
      <div class="excalidraw-layout">
        <!-- Toolbar -->
        <div class="excalidraw-toolbar" role="toolbar" aria-label="Design toolbar">
          <div class="toolbar-left">
            <button id="excalidraw-new-btn" class="excalidraw-btn small" title="New Design (Ctrl+N)" aria-label="New Design">New</button>
            <button id="excalidraw-save-btn" class="excalidraw-btn small" title="Save Design (Ctrl+S)" aria-label="Save Design">Save</button>
            <button id="excalidraw-clear-btn" class="excalidraw-btn small" title="Clear Canvas" aria-label="Clear Canvas">Clear</button>
          </div>
          <div class="toolbar-right">
            <button id="excalidraw-import-btn" class="excalidraw-btn small" title="Import .excalidraw file" aria-label="Import Design">Import</button>
            <button id="excalidraw-export-btn" class="excalidraw-btn small primary" title="Export Design (Ctrl+E)" aria-label="Export Design">Export</button>
            <button id="excalidraw-theme-btn" class="excalidraw-btn small icon-btn" title="Toggle Theme" aria-label="Toggle light/dark theme">
              ${this.theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <!-- Main area: Canvas + Sidebar -->
        <div class="excalidraw-main">
          <div class="excalidraw-canvas-container" id="excalidraw-canvas">
            <!-- Excalidraw React component will be mounted here -->
            <div class="excalidraw-loading">
              <div class="placeholder-icon">✏️</div>
              <p>Loading Excalidraw canvas...</p>
            </div>
          </div>
          <div class="excalidraw-sidebar" role="complementary" aria-label="Saved designs sidebar">
            <h3 class="sidebar-title">Saved Designs</h3>
            <div class="sidebar-designs-list" id="excalidraw-designs-list" role="list" aria-label="Saved designs list">
              ${this.loading ? this._renderLoadingState() : this.renderDesignsList()}
            </div>
          </div>
        </div>
      </div>
      <input type="file" id="excalidraw-file-input" accept=".excalidraw,.json" style="display:none" aria-hidden="true">
    `

    this.canvasContainer = this.container.querySelector('#excalidraw-canvas')
    this.sidebarList = this.container.querySelector('#excalidraw-designs-list')

    this.attachEventListeners()
  }

  /**
   * Attach toolbar and sidebar event listeners
   */
  attachEventListeners() {
    this.container.querySelector('#excalidraw-new-btn')?.addEventListener('click', () => {
      this.newDesign()
    })

    this.container.querySelector('#excalidraw-save-btn')?.addEventListener('click', () => {
      this.showSaveDialog()
    })

    this.container.querySelector('#excalidraw-clear-btn')?.addEventListener('click', () => {
      this.clearCanvas()
    })

    this.container.querySelector('#excalidraw-export-btn')?.addEventListener('click', () => {
      this.showExportDialog()
    })

    this.container.querySelector('#excalidraw-import-btn')?.addEventListener('click', () => {
      this.triggerImport()
    })

    this.container.querySelector('#excalidraw-theme-btn')?.addEventListener('click', () => {
      this.toggleTheme()
    })

    // Hidden file input for import
    this.container.querySelector('#excalidraw-file-input')?.addEventListener('change', (e) => {
      this.handleFileImport(e)
    })
  }

  // ============ React Component Integration ============

  /**
   * Load Excalidraw React component and mount it to the canvas container
   * @private
   */
  async _loadAndMountExcalidraw() {
    // Load ExcalidrawEditor via dynamic import (ES module)
    let ExcalidrawEditor
    if (window.ExcalidrawEditor) {
      ExcalidrawEditor = window.ExcalidrawEditor
    } else {
      const module = await import('./ExcalidrawEditor.js')
      ExcalidrawEditor = module.ExcalidrawEditor
      // Cache for next time
      window.ExcalidrawEditor = ExcalidrawEditor
    }
    await ExcalidrawEditor.loadExcalidraw()

    // Create React element
    const reactElement = ExcalidrawEditor.createReactElement({
      initialData: {
        elements: this.elements,
        appState: { theme: this.theme, ...this.appState },
        files: this.files
      },
      theme: this.theme,
      onChange: (elements, appState, files) => this._handleExcalidrawChange(elements, appState, files),
      onAPIReady: (api) => this._handleExcalidrawAPIReady(api)
    })

    // Mount React component into canvas container
    window.ReactDOM.render(reactElement, this.canvasContainer)
    console.log('[ExcalidrawView] Excalidraw component mounted')
  }

  /**
   * Handle changes from Excalidraw component
   * @param {Array} elements - Excalidraw elements
   * @param {Object} appState - Excalidraw app state
   * @param {Object} files - Embedded files
   * @private
   */
  _handleExcalidrawChange(elements, appState, files) {
    this.elements = elements
    this.appState = appState
    this.files = files

    // Update placeholder info if visible
    this.updateCanvasPlaceholder()
  }

  /**
   * Handle Excalidraw API ready
   * @param {Object} api - Excalidraw API reference
   * @private
   */
  _handleExcalidrawAPIReady(api) {
    this.excalidrawAPI = api
    console.log('[ExcalidrawView] Excalidraw API ready, API object:', api)
    console.log('[ExcalidrawView] API methods:', api ? Object.keys(api) : 'none')
  }

  // ============ Overlay Tracking ============

  /**
   * Append an overlay element to document.body and track it for cleanup.
   * Modals use document.body so position:fixed works correctly regardless
   * of container transforms or overflow settings.
   * @param {HTMLElement} el - Modal or notification element
   * @private
   */
  _trackOverlay(el) {
    this._activeOverlays.add(el)
    document.body.appendChild(el)
  }

  /**
   * Remove a tracked overlay element from the DOM
   * @param {HTMLElement} el - Modal or notification element
   * @private
   */
  _removeOverlay(el) {
    this._activeOverlays.delete(el)
    el.remove()
  }

  // ============ Keyboard Shortcuts (AC6) ============

  /**
   * Handle keyboard shortcuts
   * @param {KeyboardEvent} e
   * @private
   */
  _handleKeyboard(e) {
    // Only handle when this view is active and no modal is open
    if (!this.container || document.querySelector('.excalidraw-modal-overlay')) return

    const isCtrl = e.ctrlKey || e.metaKey

    if (isCtrl && e.key === 's') {
      e.preventDefault()
      this.showSaveDialog()
    } else if (isCtrl && e.key === 'n') {
      e.preventDefault()
      this.newDesign()
    } else if (isCtrl && e.key === 'e') {
      e.preventDefault()
      this.showExportDialog()
    }
  }

  // ============ Design List Management ============

  /**
   * Load saved designs from storage via IPC
   */
  async loadDefinitions() {
    this.loading = true
    this.error = null
    this.updateDesignsList()
    try {
      const definitions = await window.puffin.plugins.invoke('excalidraw-plugin', 'listDesigns')
      this.definitions = this._sortDefinitions(definitions || [])
      this.loading = false
      this.updateDesignsList()
    } catch (err) {
      console.error('[ExcalidrawView] Failed to load definitions:', err)
      this.error = err.message
      this.loading = false
      this.updateDesignsList()
    }
  }

  /**
   * Sort definitions by lastModified descending (most recent first)
   * @param {Array} definitions
   * @returns {Array}
   * @private
   */
  _sortDefinitions(definitions) {
    return definitions.slice().sort((a, b) => {
      const aTime = a.metadata?.lastModified || ''
      const bTime = b.metadata?.lastModified || ''
      return bTime.localeCompare(aTime)
    })
  }

  /**
   * Update sidebar designs list — full re-render (use for data changes)
   */
  updateDesignsList() {
    if (!this.sidebarList) return

    if (this.loading) {
      this.sidebarList.innerHTML = this._renderLoadingState()
    } else if (this.error) {
      this.sidebarList.innerHTML = this._renderErrorState()
    } else {
      this.sidebarList.innerHTML = this.renderDesignsList()
    }
    this.attachDesignItemEvents()
    this._lazyLoadThumbnails()
  }

  /**
   * Update only the active highlight in the sidebar without full re-render.
   * Used after load/new when the list data hasn't changed, only the selection.
   * @private
   */
  _updateActiveItem() {
    if (!this.sidebarList) return
    this.sidebarList.querySelectorAll('.sidebar-design-item').forEach(item => {
      const isActive = this.currentFilename === item.dataset.filename
      item.classList.toggle('active', isActive)
    })
  }

  /**
   * Render loading spinner state
   * @returns {string}
   * @private
   */
  _renderLoadingState() {
    return `
      <div class="sidebar-loading" role="status" aria-label="Loading designs">
        <div class="loading-spinner"></div>
        <p>Loading designs...</p>
      </div>
    `
  }

  /**
   * Render error state with retry button
   * @returns {string}
   * @private
   */
  _renderErrorState() {
    return `
      <div class="sidebar-error" role="alert">
        <span class="error-icon">⚠️</span>
        <p class="error-message">${this.escapeHtml(this.error)}</p>
        <button class="excalidraw-btn small retry-btn" aria-label="Retry loading designs">Retry</button>
      </div>
    `
  }

  /**
   * Render the sidebar designs list HTML with thumbnail previews
   * @returns {string}
   */
  renderDesignsList() {
    if (this.definitions.length === 0) {
      return `
        <div class="sidebar-empty-state">
          <span class="empty-icon">📝</span>
          <p>No designs yet.</p>
          <p>Create your first design!</p>
        </div>
      `
    }

    return this.definitions.map(def => {
      const isActive = this.currentFilename === def.filename
      const relTime = this._formatRelativeTime(def.metadata?.lastModified)
      const descTruncated = def.description && def.description.length > 40
        ? def.description.substring(0, 40) + '...'
        : (def.description || '')

      return `
      <div class="sidebar-design-item ${isActive ? 'active' : ''}" data-filename="${this.escapeHtml(def.filename)}" role="listitem" tabindex="0" aria-label="${this.escapeHtml(def.name)} design">
        <div class="design-thumbnail">
          ${def.thumbnailData
            ? `<img data-src="${def.thumbnailData}" alt="${this.escapeHtml(def.name)}" class="thumbnail-img thumbnail-lazy" aria-hidden="true">`
            : `<div class="thumbnail-placeholder" aria-hidden="true">✏️</div>`
          }
        </div>
        <div class="design-info">
          <span class="design-name" title="${this.escapeHtml(def.name)}">${this.escapeHtml(def.name)}</span>
          ${descTruncated ? `<span class="design-description" title="${this.escapeHtml(def.description)}">${this.escapeHtml(descTruncated)}</span>` : ''}
          <div class="design-meta-row">
            <span class="element-count-badge" aria-label="${def.elementCount || 0} elements">${def.elementCount || 0} el</span>
            ${relTime ? `<span class="design-timestamp" title="${def.metadata?.lastModified || ''}">${relTime}</span>` : ''}
          </div>
        </div>
        <div class="design-actions">
          <button class="design-action-btn design-load-btn" title="Load" aria-label="Load ${this.escapeHtml(def.name)}">📂</button>
          <button class="design-action-btn design-rename-btn" title="Rename" aria-label="Rename ${this.escapeHtml(def.name)}">✏️</button>
          <button class="design-action-btn design-delete-btn" title="Delete" aria-label="Delete ${this.escapeHtml(def.name)}">🗑️</button>
        </div>
      </div>
    `
    }).join('')
  }

  /**
   * Format ISO timestamp as relative time string
   * @param {string} isoTime - ISO 8601 timestamp
   * @returns {string}
   * @private
   */
  _formatRelativeTime(isoTime) {
    if (!isoTime) return ''
    const now = Date.now()
    const then = new Date(isoTime).getTime()
    const diffMs = now - then
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHrs = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHrs / 24)

    if (diffSec < 60) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHrs < 24) return `${diffHrs}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    return new Date(isoTime).toLocaleDateString()
  }

  /**
   * Lazy-load thumbnail images — replace data-src with src
   * @private
   */
  _lazyLoadThumbnails() {
    requestAnimationFrame(() => {
      this.container?.querySelectorAll('.thumbnail-lazy').forEach(img => {
        const src = img.dataset.src
        if (src) {
          img.src = src
          img.classList.remove('thumbnail-lazy')
        }
      })
    })
  }

  /**
   * Attach click events to sidebar design items
   */
  attachDesignItemEvents() {
    // Retry button in error state
    this.container.querySelector('.retry-btn')?.addEventListener('click', () => {
      this.loadDefinitions()
    })

    this.container.querySelectorAll('.sidebar-design-item').forEach(item => {
      const filename = item.dataset.filename

      item.querySelector('.design-load-btn')?.addEventListener('click', (e) => {
        e.stopPropagation()
        this.loadDesignByFilename(filename)
      })

      item.querySelector('.design-rename-btn')?.addEventListener('click', (e) => {
        e.stopPropagation()
        this._startInlineRename(item, filename)
      })

      item.querySelector('.design-delete-btn')?.addEventListener('click', (e) => {
        e.stopPropagation()
        this._showDeleteConfirmation(filename)
      })

      // Enter key on focused item loads it
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          this.loadDesignByFilename(filename)
        }
      })
    })
  }

  // ============ Inline Rename Workflow (AC3) ============

  /**
   * Start inline rename on a design item
   * @param {HTMLElement} item - The sidebar-design-item element
   * @param {string} filename - Design filename
   * @private
   */
  _startInlineRename(item, filename) {
    const nameSpan = item.querySelector('.design-name')
    if (!nameSpan) return

    const originalName = nameSpan.textContent
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'inline-rename-input'
    input.value = originalName
    input.setAttribute('aria-label', 'New design name')

    nameSpan.replaceWith(input)
    input.focus()
    input.select()

    let committed = false

    const commitRename = async () => {
      if (committed) return
      committed = true

      const newName = input.value.trim()
      if (!newName || newName === originalName) {
        this._revertInlineRename(input, originalName)
        return
      }

      try {
        await window.puffin.plugins.invoke('excalidraw-plugin', 'renameDesign', {
          oldFilename: filename,
          newName
        })
        this.showNotification(`Renamed to "${newName}"`, 'success')
        await this.loadDefinitions()
      } catch (err) {
        console.error('[ExcalidrawView] Rename failed:', err)
        if (err.code === 'DUPLICATE_NAME' || err.message?.includes('already exists')) {
          this.showNotification(`A design named "${newName}" already exists`, 'error')
        } else {
          this.showNotification(`Rename failed: ${err.message}`, 'error')
        }
        this._revertInlineRename(input, originalName)
      }
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitRename()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        committed = true
        this._revertInlineRename(input, originalName)
      }
    })

    input.addEventListener('blur', () => {
      commitRename()
    })
  }

  /**
   * Revert inline rename back to span
   * @param {HTMLInputElement} input
   * @param {string} originalName
   * @private
   */
  _revertInlineRename(input, originalName) {
    if (!input.parentNode) return
    const span = document.createElement('span')
    span.className = 'design-name'
    span.title = originalName
    span.textContent = originalName
    input.replaceWith(span)
  }

  // ============ Delete Confirmation Modal (AC4) ============

  /**
   * Show delete confirmation modal
   * @param {string} filename
   * @private
   */
  _showDeleteConfirmation(filename) {
    const def = this.definitions.find(d => d.filename === filename)
    const designName = def?.name || filename

    const modal = document.createElement('div')
    modal.className = 'excalidraw-modal-overlay'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', 'Delete design confirmation')
    modal.innerHTML = `
      <div class="excalidraw-modal delete-confirm-modal">
        <h3>Delete Design</h3>
        <p class="delete-confirm-message">Delete design <strong>${this.escapeHtml(designName)}</strong>? This cannot be undone.</p>
        <div class="modal-actions">
          <button id="excalidraw-delete-cancel" class="excalidraw-btn small" aria-label="Cancel deletion">Cancel</button>
          <button id="excalidraw-delete-confirm" class="excalidraw-btn small danger" aria-label="Confirm deletion">Delete</button>
        </div>
      </div>
    `

    this._trackOverlay(modal)

    const cancelBtn = modal.querySelector('#excalidraw-delete-cancel')
    const confirmBtn = modal.querySelector('#excalidraw-delete-confirm')
    confirmBtn.focus()

    const closeModal = () => this._removeOverlay(modal)

    // Focus trap (AC8)
    this._trapFocus(modal)

    cancelBtn.addEventListener('click', closeModal)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal()
    })
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal()
    })

    confirmBtn.addEventListener('click', async () => {
      closeModal()
      await this._deleteWithAnimation(filename)
    })
  }

  /**
   * Delete a design with fade-out animation on the sidebar item
   * @param {string} filename
   * @private
   */
  async _deleteWithAnimation(filename) {
    // Animate the sidebar item out
    const item = this.container?.querySelector(`.sidebar-design-item[data-filename="${filename}"]`)
    if (item) {
      item.classList.add('fade-out')
      await new Promise(r => setTimeout(r, 300))
    }

    await this.deleteDesignByFilename(filename)
  }

  // ============ Focus Trap (AC8) ============

  /**
   * Trap focus within a modal dialog
   * @param {HTMLElement} modal
   * @private
   */
  _trapFocus(modal) {
    const focusable = modal.querySelectorAll('button, input, textarea, [tabindex]:not([tabindex="-1"])')
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    })
  }

  // ============ Save Workflow ============

  /**
   * Show save dialog modal with name and description fields
   */
  showSaveDialog() {
    const modal = document.createElement('div')
    modal.className = 'excalidraw-modal-overlay'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', 'Save design')
    modal.innerHTML = `
      <div class="excalidraw-modal">
        <h3>Save Design</h3>
        <div class="modal-field">
          <label for="excalidraw-design-name">Name</label>
          <input type="text" id="excalidraw-design-name" placeholder="Enter design name"
                 value="${this.currentFilename ? this.escapeHtml(this.definitions.find(d => d.filename === this.currentFilename)?.name || '') : ''}"
                 aria-required="true">
        </div>
        <div class="modal-field">
          <label for="excalidraw-design-desc">Description (optional)</label>
          <textarea id="excalidraw-design-desc" rows="3" placeholder="Brief description"></textarea>
        </div>
        <div class="modal-actions">
          <button id="excalidraw-modal-cancel" class="excalidraw-btn small" aria-label="Cancel save">Cancel</button>
          <button id="excalidraw-modal-save" class="excalidraw-btn small primary" aria-label="Save design">Save</button>
        </div>
      </div>
    `

    this._trackOverlay(modal)

    const nameInput = modal.querySelector('#excalidraw-design-name')
    const descInput = modal.querySelector('#excalidraw-design-desc')
    nameInput.focus()

    const closeModal = () => this._removeOverlay(modal)

    this._trapFocus(modal)

    modal.querySelector('#excalidraw-modal-cancel').addEventListener('click', closeModal)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal()
    })
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal()
    })

    modal.querySelector('#excalidraw-modal-save').addEventListener('click', async () => {
      const name = nameInput.value.trim()
      if (!name) {
        this.showNotification('Please enter a design name', 'error')
        return
      }

      try {
        const sceneData = this.getSceneData()
        const thumbnailData = await this.generateThumbnail()

        if (this.currentFilename) {
          // Update existing design
          await window.puffin.plugins.invoke('excalidraw-plugin', 'updateDesign', {
            filename: this.currentFilename,
            updates: {
              sceneData,
              name,
              description: descInput.value.trim(),
              thumbnailData
            }
          })
          this.showNotification('Design updated!', 'success')
        } else {
          // Save as new
          const result = await window.puffin.plugins.invoke('excalidraw-plugin', 'saveDesign', {
            name,
            sceneData,
            metadata: {
              description: descInput.value.trim(),
              thumbnailData
            }
          })
          this.currentFilename = result.filename
          this.showNotification('Design saved!', 'success')
        }

        closeModal()
        await this.loadDefinitions()
      } catch (err) {
        console.error('[ExcalidrawView] Failed to save:', err)
        if (err.code === 'DUPLICATE_NAME' || err.message?.includes('already exists')) {
          this.showNotification(`A design named "${nameInput.value.trim()}" already exists`, 'error')
        } else {
          this.showNotification(`Save failed: ${err.message}`, 'error')
        }
      }
    })

    nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') modal.querySelector('#excalidraw-modal-save').click()
    })
  }

  /**
   * Get current scene data from Excalidraw API or internal state
   * @returns {Object} { elements, appState, files }
   */
  getSceneData() {
    console.log('[ExcalidrawView] getSceneData called, excalidrawAPI:', !!this.excalidrawAPI)
    if (this.excalidrawAPI) {
      const elements = this.excalidrawAPI.getSceneElements() || []
      const rawAppState = this.excalidrawAPI.getAppState() || {}
      console.log('[ExcalidrawView] Got scene elements from API:', elements.length, 'elements')

      // Strip non-serializable and problematic properties from appState
      // collaborators is a Map at runtime but becomes plain object after JSON serialization,
      // causing "collaborators.forEach is not a function" errors
      const { collaborators, ...appState } = rawAppState

      return {
        elements,
        appState,
        files: this.excalidrawAPI.getFiles() || {}
      }
    }
    console.warn('[ExcalidrawView] excalidrawAPI not available, using fallback internal state')

    // Also strip collaborators from fallback state
    const { collaborators, ...appState } = this.appState || {}
    return {
      elements: this.elements,
      appState,
      files: this.files
    }
  }

  /**
   * Generate thumbnail from current scene.
   * Returns base64-encoded PNG data URL or null if Excalidraw is not yet integrated.
   * @returns {Promise<string|null>}
   */
  async generateThumbnail() {
    if (this.excalidrawAPI && typeof window.ExcalidrawUtils?.exportToCanvas === 'function') {
      try {
        const canvas = await window.ExcalidrawUtils.exportToCanvas({
          elements: this.excalidrawAPI.getSceneElements(),
          appState: this.excalidrawAPI.getAppState(),
          files: this.excalidrawAPI.getFiles(),
          maxWidthOrHeight: 128
        })
        return canvas.toDataURL('image/png')
      } catch (err) {
        console.warn('[ExcalidrawView] Thumbnail generation failed:', err)
      }
    }
    return null
  }

  // ============ Load Workflow ============

  /**
   * Load a design by filename from storage
   * @param {string} filename - Design filename
   */
  async loadDesignByFilename(filename) {
    try {
      const result = await window.puffin.plugins.invoke('excalidraw-plugin', 'loadDesign', filename)
      const { scene, meta } = result

      console.log('[ExcalidrawView] Loaded scene data:', {
        elementsCount: scene.elements?.length,
        hasAppState: !!scene.appState,
        filesType: typeof scene.files,
        filesValue: scene.files,
        filesIsArray: Array.isArray(scene.files)
      })

      this.elements = scene.elements || []
      // Strip collaborators from loaded appState to prevent "forEach is not a function" error
      // (collaborators is a Map at runtime but becomes plain object after JSON serialization)
      const { collaborators, ...cleanAppState } = scene.appState || {}
      this.appState = cleanAppState
      // Ensure files is an object, not an array or other type
      this.files = (scene.files && typeof scene.files === 'object' && !Array.isArray(scene.files)) ? scene.files : {}
      this.currentFilename = filename

      console.log('[ExcalidrawView] Prepared data for updateScene:', {
        elementsCount: this.elements.length,
        filesType: typeof this.files,
        filesKeys: Object.keys(this.files),
        strippedCollaborators: !!collaborators
      })

      // Update Excalidraw canvas if API is available
      if (this.excalidrawAPI) {
        const sceneData = {
          elements: this.elements,
          appState: this.appState
        }
        // Only include files if non-empty (Excalidraw expects files to be omitted rather than {})
        if (this.files && Object.keys(this.files).length > 0) {
          sceneData.files = this.files
        }
        console.log('[ExcalidrawView] Calling updateScene with:', {
          elementsCount: sceneData.elements.length,
          hasFiles: 'files' in sceneData,
          filesKeys: sceneData.files ? Object.keys(sceneData.files) : []
        })
        try {
          this.excalidrawAPI.updateScene(sceneData)
          console.log('[ExcalidrawView] updateScene completed successfully')
        } catch (updateError) {
          console.error('[ExcalidrawView] updateScene failed:', updateError)
          throw updateError
        }
        try {
          this.excalidrawAPI.scrollToContent()
          console.log('[ExcalidrawView] scrollToContent completed successfully')
        } catch (scrollError) {
          console.error('[ExcalidrawView] scrollToContent failed:', scrollError)
          throw scrollError
        }
      }

      this.updateCanvasPlaceholder()
      this._updateActiveItem()
      this.showNotification(`Loaded: ${meta.name}`, 'success')
    } catch (err) {
      console.error('[ExcalidrawView] Failed to load:', err)
      if (err.message?.includes('not found')) {
        this.showNotification('Design not found — it may have been deleted', 'error')
      } else {
        this.showNotification(`Load failed: ${err.message}`, 'error')
      }
    }
  }

  // ============ Export Workflow ============

  /**
   * Show export format selection dialog
   */
  showExportDialog() {
    if (!this.currentFilename && this.elements.length === 0) {
      this.showNotification('No design to export — save first or load a design', 'error')
      return
    }

    const modal = document.createElement('div')
    modal.className = 'excalidraw-modal-overlay'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', 'Export design')
    modal.innerHTML = `
      <div class="excalidraw-modal">
        <h3>Export Design</h3>
        <div class="export-options" role="group" aria-label="Export format options">
          <button class="export-option-btn" data-format="json" aria-label="Export as JSON">
            <span class="export-icon">{ }</span>
            <span class="export-label">JSON</span>
            <span class="export-desc">.excalidraw format</span>
          </button>
          <button class="export-option-btn" data-format="png" aria-label="Export as PNG">
            <span class="export-icon">🖼️</span>
            <span class="export-label">PNG</span>
            <span class="export-desc">Raster image</span>
          </button>
          <button class="export-option-btn" data-format="svg" aria-label="Export as SVG">
            <span class="export-icon">📐</span>
            <span class="export-label">SVG</span>
            <span class="export-desc">Vector image</span>
          </button>
        </div>
        <div class="modal-actions">
          <button id="excalidraw-export-cancel" class="excalidraw-btn small" aria-label="Cancel export">Cancel</button>
        </div>
      </div>
    `

    this._trackOverlay(modal)

    const closeModal = () => this._removeOverlay(modal)

    this._trapFocus(modal)

    modal.querySelector('#excalidraw-export-cancel').addEventListener('click', closeModal)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal()
    })
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal()
    })

    modal.querySelectorAll('.export-option-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const format = btn.dataset.format
        closeModal()
        await this.exportDesign(format)
      })
    })
  }

  /**
   * Export design in the selected format
   * @param {string} format - 'json' | 'png' | 'svg'
   */
  async exportDesign(format) {
    try {
      if (format === 'json') {
        let jsonContent
        if (this.currentFilename) {
          jsonContent = await window.puffin.plugins.invoke('excalidraw-plugin', 'exportDesign', this.currentFilename)
        } else {
          const sceneData = this.getSceneData()
          jsonContent = JSON.stringify({
            type: 'excalidraw',
            version: 2,
            source: 'puffin-excalidraw-plugin',
            ...sceneData
          }, null, 2)
        }

        await navigator.clipboard.writeText(jsonContent)
        this.showNotification('JSON copied to clipboard!', 'success')

      } else if (format === 'png' || format === 'svg') {
        if (!this.excalidrawAPI) {
          this.showNotification(`${format.toUpperCase()} export requires Excalidraw integration`, 'error')
          return
        }
        this.showNotification(`${format.toUpperCase()} export not yet available`, 'error')
      }
    } catch (err) {
      console.error('[ExcalidrawView] Export failed:', err)
      this.showNotification(`Export failed: ${err.message}`, 'error')
    }
  }

  // ============ Import Workflow ============

  /**
   * Trigger the file picker for import
   */
  triggerImport() {
    const fileInput = this.container.querySelector('#excalidraw-file-input')
    if (fileInput) {
      fileInput.value = ''
      fileInput.click()
    }
  }

  /**
   * Handle file selection from the file picker
   * @param {Event} e - Change event from file input
   */
  async handleFileImport(e) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const jsonContent = await this.readFileAsText(file)

      // Validate JSON
      let parsed
      try {
        parsed = JSON.parse(jsonContent)
      } catch (parseErr) {
        this.showNotification('Invalid file: malformed JSON', 'error')
        return
      }

      // Validate Excalidraw schema
      if (!parsed.elements || !Array.isArray(parsed.elements)) {
        this.showNotification('Invalid file: not a valid Excalidraw file', 'error')
        return
      }

      const suggestedName = parsed.ppiMetadata?.name || parsed.name || file.name.replace(/\.(excalidraw|json)$/, '')
      this.showImportNameDialog(jsonContent, suggestedName)
    } catch (err) {
      console.error('[ExcalidrawView] Import failed:', err)
      this.showNotification(`Import failed: ${err.message}`, 'error')
    }
  }

  /**
   * Show dialog to name the imported design
   * @param {string} jsonContent - Raw JSON content
   * @param {string} suggestedName - Suggested name from file
   */
  showImportNameDialog(jsonContent, suggestedName) {
    const modal = document.createElement('div')
    modal.className = 'excalidraw-modal-overlay'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    modal.setAttribute('aria-label', 'Import design')
    modal.innerHTML = `
      <div class="excalidraw-modal">
        <h3>Import Design</h3>
        <div class="modal-field">
          <label for="excalidraw-import-name">Design Name</label>
          <input type="text" id="excalidraw-import-name" placeholder="Enter design name"
                 value="${this.escapeHtml(suggestedName)}" aria-required="true">
        </div>
        <div class="modal-actions">
          <button id="excalidraw-import-cancel" class="excalidraw-btn small" aria-label="Cancel import">Cancel</button>
          <button id="excalidraw-import-confirm" class="excalidraw-btn small primary" aria-label="Confirm import">Import</button>
        </div>
      </div>
    `

    this._trackOverlay(modal)

    const nameInput = modal.querySelector('#excalidraw-import-name')
    nameInput.focus()
    nameInput.select()

    const closeModal = () => this._removeOverlay(modal)

    this._trapFocus(modal)

    modal.querySelector('#excalidraw-import-cancel').addEventListener('click', closeModal)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal()
    })
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal()
    })

    modal.querySelector('#excalidraw-import-confirm').addEventListener('click', async () => {
      const name = nameInput.value.trim()
      if (!name) {
        this.showNotification('Please enter a name for the imported design', 'error')
        return
      }

      try {
        const result = await window.puffin.plugins.invoke('excalidraw-plugin', 'importDesign', {
          jsonContent,
          newName: name
        })
        closeModal()
        this.showNotification(`Imported: ${result.design.name}`, 'success')
        await this.loadDefinitions()
        await this.loadDesignByFilename(result.filename)
      } catch (err) {
        console.error('[ExcalidrawView] Import failed:', err)
        if (err.code === 'DUPLICATE_NAME' || err.message?.includes('already exists')) {
          this.showNotification(`A design named "${name}" already exists`, 'error')
        } else {
          this.showNotification(`Import failed: ${err.message}`, 'error')
        }
      }
    })

    nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') modal.querySelector('#excalidraw-import-confirm').click()
    })
  }

  /**
   * Read a File object as text
   * @param {File} file - File to read
   * @returns {Promise<string>}
   */
  readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  // ============ Toolbar Actions ============

  /**
   * Start a new design (clears canvas)
   */
  newDesign() {
    if (this.elements.length > 0) {
      if (!confirm('Start a new design? Unsaved changes will be lost.')) {
        return
      }
    }

    this.elements = []
    this.appState = {}
    this.files = {}
    this.currentFilename = null
    this.selectedElement = null

    if (this.excalidrawAPI) {
      this.excalidrawAPI.resetScene()
    }

    this.updateCanvasPlaceholder()
    this._updateActiveItem()
    this.showNotification('New design started', 'info')
  }

  /**
   * Clear the canvas
   */
  clearCanvas() {
    if (this.elements.length === 0) {
      this.showNotification('Canvas is already empty', 'info')
      return
    }

    if (!confirm('Clear all elements?')) {
      return
    }

    this.elements = []
    this.appState = { ...this.appState }
    this.files = {}
    this.selectedElement = null

    if (this.excalidrawAPI) {
      this.excalidrawAPI.resetScene()
    }

    this.updateCanvasPlaceholder()
    this.showNotification('Canvas cleared', 'info')
  }

  /**
   * Toggle between light and dark themes
   */
  toggleTheme() {
    console.log('[ExcalidrawView] toggleTheme called, current theme:', this.theme, 'excalidrawAPI:', !!this.excalidrawAPI)
    this.theme = this.theme === 'dark' ? 'light' : 'dark'
    this.appState = { ...this.appState, theme: this.theme }

    const themeBtn = this.container.querySelector('#excalidraw-theme-btn')
    if (themeBtn) {
      themeBtn.innerHTML = this.theme === 'dark' ? '☀️' : '🌙'
      themeBtn.title = `Switch to ${this.theme === 'dark' ? 'light' : 'dark'} theme`
    }

    if (this.excalidrawAPI) {
      console.log('[ExcalidrawView] Updating Excalidraw scene with theme:', this.theme)
      this.excalidrawAPI.updateScene({
        appState: { theme: this.theme }
      })
    } else {
      console.warn('[ExcalidrawView] excalidrawAPI not available, cannot update theme')
    }

    const canvasEl = this.container.querySelector('.excalidraw-canvas-container')
    if (canvasEl) {
      canvasEl.classList.toggle('theme-light', this.theme === 'light')
      canvasEl.classList.toggle('theme-dark', this.theme === 'dark')
    }
  }

  // ============ Delete ============

  /**
   * Delete a design by filename
   * @param {string} filename - Design filename
   */
  async deleteDesignByFilename(filename) {
    try {
      await window.puffin.plugins.invoke('excalidraw-plugin', 'deleteDesign', filename)

      if (this.currentFilename === filename) {
        this.currentFilename = null
      }

      this.showNotification('Design deleted', 'success')
      await this.loadDefinitions()
    } catch (err) {
      console.error('[ExcalidrawView] Failed to delete:', err)
      if (err.message?.includes('not found')) {
        this.showNotification('Design not found — it may have already been deleted', 'error')
      } else {
        this.showNotification(`Delete failed: ${err.message}`, 'error')
      }
    }
  }

  // ============ Canvas Placeholder ============

  /**
   * Update the canvas placeholder with current element count
   */
  updateCanvasPlaceholder() {
    const placeholder = this.container.querySelector('.placeholder-info')
    if (placeholder) {
      placeholder.textContent = `${this.elements.length} elements in scene`
    }
  }

  // ============ Notifications ============

  /**
   * Show notification toast (auto-dismisses after 3 seconds)
   * @param {string} message - Notification message
   * @param {string} type - 'success' | 'error' | 'info'
   */
  showNotification(message, type = 'info') {
    // Dismiss previous notification immediately to prevent stacking
    if (this._activeNotification) {
      this._removeOverlay(this._activeNotification)
      this._activeNotification = null
    }

    const notification = document.createElement('div')
    notification.className = `excalidraw-notification excalidraw-notification-${type}`
    notification.setAttribute('role', 'status')
    notification.setAttribute('aria-live', 'polite')
    notification.innerHTML = `
      <span class="notification-icon" aria-hidden="true">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
      <span class="notification-message">${this.escapeHtml(message)}</span>
    `

    this._activeNotification = notification
    this._trackOverlay(notification)

    requestAnimationFrame(() => {
      notification.classList.add('show')
    })

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      if (this._activeNotification === notification) {
        notification.classList.remove('show')
        setTimeout(() => {
          if (this._activeNotification === notification) {
            this._activeNotification = null
          }
          this._removeOverlay(notification)
        }, 300)
      }
    }, 3000)
  }

  // ============ Utilities ============

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string}
   */
  escapeHtml(str) {
    if (!str) return ''
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // ============ Lifecycle ============

  /**
   * Called when view becomes active
   */
  onActivate() {
    this.loadDefinitions()
  }

  /**
   * Called when view becomes inactive
   */
  onDeactivate() {
    // Preserve state
  }

  /**
   * Destroy the view and clean up resources
   */
  destroy() {
    document.removeEventListener('keydown', this._keyboardHandler)

    // Remove any open modals or notifications appended to document.body
    for (const el of this._activeOverlays) {
      el.remove()
    }
    this._activeOverlays.clear()

    // Unmount React component
    if (this.canvasContainer && window.ReactDOM) {
      try {
        window.ReactDOM.unmountComponentAtNode(this.canvasContainer)
        console.log('[ExcalidrawView] React component unmounted')
      } catch (error) {
        console.error('[ExcalidrawView] Failed to unmount React component:', error)
      }
    }

    if (this.excalidrawAPI) {
      this.excalidrawAPI = null
    }

    if (this.container) {
      this.container.innerHTML = ''
      this.container = null
    }

    this.elements = []
    this.appState = {}
    this.files = {}
    this.definitions = []
    this.canvasContainer = null
    this.sidebarList = null
  }
}

// Default export for ES module
export default ExcalidrawView
