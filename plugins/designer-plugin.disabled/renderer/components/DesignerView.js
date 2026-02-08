/**
 * DesignerView - Main container component for the Designer Plugin UI
 * Vanilla JavaScript implementation (no JSX)
 *
 * Visual interface for designing UI layouts that can be
 * described to Claude for implementation guidance.
 */
export class DesignerView {
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
    this.elements = []
    this.selectedElement = null
    this.definitions = []
    this.loading = true
    this.error = null

    // Drag/resize state
    this.dragState = null
    this.resizeState = null
    this.gridSize = 20

    // Element refs
    this.canvas = null
    this.propertyPanel = null
  }

  /**
   * Initialize the component
   */
  async init() {
    console.log('[DesignerView] init() called, container:', this.container)

    this.container.className = 'designer-view'
    this.render()
    // Load definitions after initial render (updates just the list, not full re-render)
    this.definitions = []
    await this.loadDefinitions()
    console.log('[DesignerView] init() complete')
  }

  /**
   * Main render method
   */
  render() {
    if (!this.container) return

    this.container.innerHTML = `
      <div class="designer-layout">
        <!-- Toolbar at top -->
        <div class="designer-toolbar">
          <div class="element-palette">
            <button class="palette-item" data-type="container" title="Container">
              <span class="icon">□</span>
            </button>
            <button class="palette-item" data-type="text" title="Text">
              <span class="icon">T</span>
            </button>
            <button class="palette-item" data-type="input" title="Input">
              <span class="icon">⎕</span>
            </button>
            <button class="palette-item" data-type="button" title="Button">
              <span class="icon">▢</span>
            </button>
            <button class="palette-item" data-type="image" title="Image">
              <span class="icon">🖼</span>
            </button>
            <button class="palette-item" data-type="list" title="List">
              <span class="icon">≡</span>
            </button>
          </div>
          <div class="toolbar-actions">
            <button id="new-design-btn" class="btn small" title="New Design">New</button>
            <button id="save-design-btn" class="btn small" title="Save Design">Save</button>
            <button id="clear-canvas-btn" class="btn small" title="Clear Canvas">Clear</button>
            <button id="export-design-btn" class="btn small primary" title="Export Description">Export</button>
          </div>
        </div>

        <!-- Main area: Canvas + Properties -->
        <div class="designer-main">
          <div class="designer-canvas" id="designer-canvas">
            <!-- Elements rendered here -->
          </div>
          <div class="property-panel" id="property-panel">
            <h3>Properties</h3>
            <div id="property-content">
              <p class="placeholder">Select an element to edit properties</p>
            </div>
            ${this.renderSavedDesigns()}
          </div>
        </div>
      </div>
    `

    this.canvas = this.container.querySelector('#designer-canvas')
    this.propertyPanel = this.container.querySelector('#property-content')

    this.attachEventListeners()
    this.renderCanvas()
  }

  /**
   * Render saved designs section in property panel
   */
  renderSavedDesigns() {
    return `
      <div class="saved-designs-section">
        <h3>Saved Designs</h3>
        <div class="saved-designs-list" id="saved-designs-list">
          ${this.loading ? '<p class="placeholder">Loading...</p>' : this.renderDefinitionsList()}
        </div>
      </div>
    `
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Palette items
    this.container.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('click', () => {
        const type = item.dataset.type
        this.addElement(type)
      })
    })

    // Toolbar buttons
    this.container.querySelector('#new-design-btn')?.addEventListener('click', () => {
      this.newDesign()
    })

    this.container.querySelector('#save-design-btn')?.addEventListener('click', () => {
      this.showSaveDialog()
    })

    this.container.querySelector('#clear-canvas-btn')?.addEventListener('click', () => {
      if (confirm('Clear all elements?')) {
        this.elements = []
        this.selectedElement = null
        this.renderCanvas()
        this.renderPropertyPanel()
      }
    })

    this.container.querySelector('#export-design-btn')?.addEventListener('click', () => {
      this.exportDescription()
    })

    // Canvas click to deselect
    this.canvas?.addEventListener('click', (e) => {
      if (e.target === this.canvas || e.target.classList.contains('canvas-grid')) {
        this.selectedElement = null
        this.renderCanvas()
        this.renderPropertyPanel()
      }
    })

    // Mouse events for drag/resize
    this.canvas?.addEventListener('mousedown', (e) => this.handleMouseDown(e))
    this.mouseMoveHandler = (e) => this.handleMouseMove(e)
    this.mouseUpHandler = (e) => this.handleMouseUp(e)
    document.addEventListener('mousemove', this.mouseMoveHandler)
    document.addEventListener('mouseup', this.mouseUpHandler)

    // Keyboard events
    this.keydownHandler = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeTag = document.activeElement.tagName
        const isTextInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA'
        if (this.selectedElement && !isTextInput) {
          e.preventDefault()
          this.deleteElement(this.selectedElement)
        }
      }
    }
    document.addEventListener('keydown', this.keydownHandler)
  }

  /**
   * Load saved definitions
   */
  async loadDefinitions() {
    this.loading = true
    try {
      const definitions = await window.puffin.plugins.invoke('designer-plugin', 'listDesigns')
      this.definitions = definitions || []
      this.loading = false
      this.updateSavedDesignsList()
    } catch (err) {
      console.error('[DesignerView] Failed to load definitions:', err)
      this.error = err.message
      this.loading = false
      this.updateSavedDesignsList()
    }
  }

  /**
   * Update the saved designs list in the property panel
   */
  updateSavedDesignsList() {
    const list = this.container.querySelector('#saved-designs-list')
    if (list) {
      list.innerHTML = this.loading ? '<p class="placeholder">Loading...</p>' : this.renderDefinitionsList()
      this.attachSavedDesignEvents()
    }
  }

  /**
   * Attach click events to saved design items
   */
  attachSavedDesignEvents() {
    this.container.querySelectorAll('.saved-design-item').forEach(item => {
      const filename = item.dataset.filename

      // Load button
      item.querySelector('.design-load-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation()
        await this.loadDesignByFilename(filename)
      })

      // Delete button
      item.querySelector('.design-delete-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (confirm('Delete this design?')) {
          await this.deleteDesignByFilename(filename)
        }
      })
    })
  }

  /**
   * Load a design by filename
   */
  async loadDesignByFilename(filename) {
    try {
      const design = await window.puffin.plugins.invoke('designer-plugin', 'loadDesign', filename)
      this.elements = design.elements || []
      this.selectedElement = null
      this.renderCanvas()
      this.renderPropertyPanel()
      this.showNotification('Design loaded!', 'success')
    } catch (err) {
      console.error('[DesignerView] Failed to load:', err)
      this.showNotification(`Load failed: ${err.message}`, 'error')
    }
  }

  /**
   * Delete a design by filename
   */
  async deleteDesignByFilename(filename) {
    try {
      await window.puffin.plugins.invoke('designer-plugin', 'deleteDesign', filename)
      this.showNotification('Design deleted!', 'success')
      await this.loadDefinitions()
    } catch (err) {
      console.error('[DesignerView] Failed to delete:', err)
      this.showNotification(`Delete failed: ${err.message}`, 'error')
    }
  }

  /**
   * Render saved definitions list
   */
  renderDefinitionsList() {
    if (this.definitions.length === 0) {
      return '<p class="placeholder">No saved designs</p>'
    }

    return this.definitions.map(def => `
      <div class="saved-design-item" data-filename="${this.escapeHtml(def.filename)}">
        <span class="design-name">${this.escapeHtml(def.name)}</span>
        <button class="design-load-btn" title="Load">📂</button>
        <button class="design-delete-btn" title="Delete">🗑️</button>
      </div>
    `).join('')
  }

  /**
   * Render canvas with elements
   */
  renderCanvas() {
    if (!this.canvas) return

    // Clear existing elements (but keep grid)
    this.canvas.querySelectorAll('.gui-element').forEach(el => el.remove())

    // Render each element
    this.elements.forEach(element => {
      this.renderElement(element, this.canvas)
    })
  }

  /**
   * Render a single element
   */
  renderElement(element, parent) {
    const el = document.createElement('div')
    const isSelected = this.selectedElement === element.id
    el.className = `gui-element type-${element.type} ${isSelected ? 'selected' : ''}`
    el.dataset.id = element.id

    const props = element.properties || {}
    el.style.left = `${props.x || 0}px`
    el.style.top = `${props.y || 0}px`
    el.style.width = `${props.width || 100}px`
    el.style.height = `${props.height || 50}px`

    // Element content based on type
    el.innerHTML = this.getElementContent(element)

    // Add resize handles if selected
    if (isSelected) {
      el.innerHTML += `
        <div class="resize-handle nw"></div>
        <div class="resize-handle ne"></div>
        <div class="resize-handle sw"></div>
        <div class="resize-handle se"></div>
      `
    }

    parent.appendChild(el)
  }

  /**
   * Get element content based on type
   */
  getElementContent(element) {
    const props = element.properties || {}
    const label = props.label || element.type

    switch (element.type) {
      case 'container':
        return `<span class="label">${this.escapeHtml(label)}</span>`
      case 'text':
        return `<span class="text-content">${this.escapeHtml(props.text || 'Text')}</span>`
      case 'input':
        return `<span class="input-placeholder">${this.escapeHtml(props.placeholder || 'Input...')}</span>`
      case 'button':
        return `<span class="button-label">${this.escapeHtml(props.label || 'Button')}</span>`
      case 'image':
        return `<span class="image-placeholder">🖼️ Image</span>`
      case 'list':
        return `<span class="list-placeholder">≡ List</span>`
      default:
        return `<span class="label">${this.escapeHtml(label)}</span>`
    }
  }

  /**
   * Render property panel
   */
  renderPropertyPanel() {
    if (!this.propertyPanel) return

    const element = this.elements.find(el => el.id === this.selectedElement)

    if (!element) {
      this.propertyPanel.innerHTML = '<p class="placeholder">Select an element to edit properties</p>'
      return
    }

    const props = element.properties || {}

    this.propertyPanel.innerHTML = `
      <div class="property-group">
        <label>Type</label>
        <span class="property-value">${element.type}</span>
      </div>

      <div class="property-group">
        <label for="prop-label">Label</label>
        <input type="text" id="prop-label" value="${this.escapeHtml(props.label || '')}"
               placeholder="Element label">
      </div>

      ${element.type === 'input' ? `
        <div class="property-group">
          <label for="prop-placeholder">Placeholder</label>
          <input type="text" id="prop-placeholder" value="${this.escapeHtml(props.placeholder || '')}"
                 placeholder="Input placeholder">
        </div>
      ` : ''}

      ${element.type === 'text' ? `
        <div class="property-group">
          <label for="prop-text">Text Content</label>
          <textarea id="prop-text" rows="3">${this.escapeHtml(props.text || '')}</textarea>
        </div>
      ` : ''}

      <div class="property-group">
        <label>Position</label>
        <div class="property-row">
          <input type="number" id="prop-x" value="${props.x || 0}" style="width: 70px">
          <span>x</span>
          <input type="number" id="prop-y" value="${props.y || 0}" style="width: 70px">
        </div>
      </div>

      <div class="property-group">
        <label>Size</label>
        <div class="property-row">
          <input type="number" id="prop-width" value="${props.width || 100}" style="width: 70px">
          <span>x</span>
          <input type="number" id="prop-height" value="${props.height || 50}" style="width: 70px">
        </div>
      </div>

      <button id="delete-element-btn" class="btn danger" style="width: 100%; margin-top: 1rem;">
        Delete Element
      </button>
    `

    // Bind property change events
    this.bindPropertyEvents(element.id)
  }

  /**
   * Bind property panel events
   */
  bindPropertyEvents(elementId) {
    const element = this.elements.find(el => el.id === elementId)
    if (!element) return

    // Bind individual input changes to preserve other values
    const labelInput = document.getElementById('prop-label')
    const placeholderInput = document.getElementById('prop-placeholder')
    const textInput = document.getElementById('prop-text')
    const xInput = document.getElementById('prop-x')
    const yInput = document.getElementById('prop-y')
    const widthInput = document.getElementById('prop-width')
    const heightInput = document.getElementById('prop-height')

    labelInput?.addEventListener('change', () => {
      element.properties.label = labelInput.value
      this.renderCanvas()
    })

    placeholderInput?.addEventListener('change', () => {
      element.properties.placeholder = placeholderInput.value
      this.renderCanvas()
    })

    textInput?.addEventListener('change', () => {
      element.properties.text = textInput.value
      this.renderCanvas()
    })

    xInput?.addEventListener('change', () => {
      element.properties.x = parseInt(xInput.value) || element.properties.x
      this.renderCanvas()
    })

    yInput?.addEventListener('change', () => {
      element.properties.y = parseInt(yInput.value) || element.properties.y
      this.renderCanvas()
    })

    widthInput?.addEventListener('change', () => {
      element.properties.width = parseInt(widthInput.value) || element.properties.width
      this.renderCanvas()
    })

    heightInput?.addEventListener('change', () => {
      element.properties.height = parseInt(heightInput.value) || element.properties.height
      this.renderCanvas()
    })

    // Delete button
    document.getElementById('delete-element-btn')?.addEventListener('click', () => {
      this.deleteElement(elementId)
    })
  }

  /**
   * Add a new element to the canvas
   */
  addElement(type) {
    const defaultSizes = {
      container: { width: 200, height: 150 },
      text: { width: 150, height: 30 },
      input: { width: 200, height: 40 },
      button: { width: 100, height: 40 },
      image: { width: 150, height: 100 },
      list: { width: 200, height: 120 }
    }

    const size = defaultSizes[type] || { width: 100, height: 50 }
    const id = `el-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const element = {
      id,
      type,
      properties: {
        x: 50 + Math.random() * 100,
        y: 50 + Math.random() * 100,
        width: size.width,
        height: size.height,
        label: type.charAt(0).toUpperCase() + type.slice(1)
      }
    }

    this.elements.push(element)
    this.selectedElement = id
    this.renderCanvas()
    this.renderPropertyPanel()
  }

  /**
   * Delete an element
   */
  deleteElement(elementId) {
    this.elements = this.elements.filter(el => el.id !== elementId)
    if (this.selectedElement === elementId) {
      this.selectedElement = null
    }
    this.renderCanvas()
    this.renderPropertyPanel()
  }

  /**
   * Handle mouse down for drag/resize
   */
  handleMouseDown(e) {
    const domElement = e.target.closest('.gui-element')
    if (!domElement) return

    const id = domElement.dataset.id
    const dataElement = this.elements.find(el => el.id === id)
    if (!dataElement) return

    // Read current values from data model BEFORE re-rendering
    // (re-rendering removes the DOM element, making offsetLeft/offsetTop return 0)
    const props = dataElement.properties || {}
    const currentX = props.x || 0
    const currentY = props.y || 0
    const currentWidth = props.width || 100
    const currentHeight = props.height || 50

    this.selectedElement = id
    this.renderCanvas()
    this.renderPropertyPanel()

    // Check if clicking on resize handle
    if (e.target.classList.contains('resize-handle')) {
      this.resizeState = {
        id,
        handle: e.target.className.split(' ')[1],
        startX: e.clientX,
        startY: e.clientY,
        startWidth: currentWidth,
        startHeight: currentHeight,
        startLeft: currentX,
        startTop: currentY
      }
    } else {
      // Start dragging
      this.dragState = {
        id,
        startX: e.clientX - currentX,
        startY: e.clientY - currentY
      }
    }

    e.preventDefault()
  }

  /**
   * Handle mouse move for drag/resize
   */
  handleMouseMove(e) {
    if (this.dragState) {
      const element = this.elements.find(el => el.id === this.dragState.id)
      if (!element) return

      let x = e.clientX - this.dragState.startX
      let y = e.clientY - this.dragState.startY

      // Snap to grid
      x = Math.round(x / this.gridSize) * this.gridSize
      y = Math.round(y / this.gridSize) * this.gridSize

      element.properties.x = x
      element.properties.y = y
      this.renderCanvas()
    }

    if (this.resizeState) {
      const element = this.elements.find(el => el.id === this.resizeState.id)
      if (!element) return

      const deltaX = e.clientX - this.resizeState.startX
      const deltaY = e.clientY - this.resizeState.startY

      let width = this.resizeState.startWidth
      let height = this.resizeState.startHeight
      let x = this.resizeState.startLeft
      let y = this.resizeState.startTop

      const handle = this.resizeState.handle

      if (handle.includes('e')) {
        width = Math.max(40, this.resizeState.startWidth + deltaX)
      }
      if (handle.includes('w')) {
        width = Math.max(40, this.resizeState.startWidth - deltaX)
        x = this.resizeState.startLeft + deltaX
      }
      if (handle.includes('s')) {
        height = Math.max(20, this.resizeState.startHeight + deltaY)
      }
      if (handle.includes('n')) {
        height = Math.max(20, this.resizeState.startHeight - deltaY)
        y = this.resizeState.startTop + deltaY
      }

      // Snap to grid
      width = Math.round(width / this.gridSize) * this.gridSize
      height = Math.round(height / this.gridSize) * this.gridSize
      x = Math.round(x / this.gridSize) * this.gridSize
      y = Math.round(y / this.gridSize) * this.gridSize

      element.properties.width = width
      element.properties.height = height
      element.properties.x = x
      element.properties.y = y
      this.renderCanvas()
    }
  }

  /**
   * Handle mouse up
   */
  handleMouseUp(e) {
    this.dragState = null
    this.resizeState = null
  }

  /**
   * Start a new design (clears canvas without confirmation if empty)
   */
  newDesign() {
    if (this.elements.length > 0) {
      if (!confirm('Start a new design? Unsaved changes will be lost.')) {
        return
      }
    }
    this.elements = []
    this.selectedElement = null
    this.renderCanvas()
    this.renderPropertyPanel()
    this.showNotification('New design started', 'info')
  }

  /**
   * Show save dialog modal
   */
  showSaveDialog() {
    if (this.elements.length === 0) {
      this.showNotification('No elements to save', 'error')
      return
    }

    // Create modal overlay
    const modal = document.createElement('div')
    modal.className = 'designer-modal-overlay'
    modal.innerHTML = `
      <div class="designer-modal">
        <h3>Save Design</h3>
        <div class="modal-field">
          <label for="design-name">Name</label>
          <input type="text" id="design-name" placeholder="Enter design name">
        </div>
        <div class="modal-field">
          <label for="design-description">Description</label>
          <textarea id="design-description" rows="3" placeholder="Optional description"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn small" id="modal-cancel">Cancel</button>
          <button class="btn small primary" id="modal-save">Save</button>
        </div>
      </div>
    `

    document.body.appendChild(modal)

    const nameInput = modal.querySelector('#design-name')
    const descInput = modal.querySelector('#design-description')
    nameInput.focus()

    const closeModal = () => modal.remove()

    modal.querySelector('#modal-cancel').addEventListener('click', closeModal)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal()
    })

    modal.querySelector('#modal-save').addEventListener('click', async () => {
      const name = nameInput.value.trim()
      if (!name) {
        this.showNotification('Please enter a name', 'error')
        return
      }

      try {
        await window.puffin.plugins.invoke('designer-plugin', 'saveDesign', {
          name,
          elements: this.elements,
          description: descInput.value.trim()
        })
        closeModal()
        this.showNotification('Design saved!', 'success')
        await this.loadDefinitions()
      } catch (err) {
        console.error('[DesignerView] Failed to save:', err)
        this.showNotification(`Save failed: ${err.message}`, 'error')
      }
    })

    // Enter key to save
    nameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') modal.querySelector('#modal-save').click()
    })
  }

  /**
   * Export GUI description
   */
  exportDescription() {
    if (this.elements.length === 0) {
      this.showNotification('No elements to export', 'error')
      return
    }

    const description = this.buildDescription(this.elements)

    // Copy to clipboard
    navigator.clipboard.writeText(description).then(() => {
      this.showNotification('Description copied to clipboard!', 'success')
    }).catch(() => {
      // Fallback: show in alert
      alert(description)
    })
  }

  /**
   * Build text description of GUI layout
   */
  buildDescription(elements) {
    const lines = ['# UI Layout Description\n']

    const describe = (element, indent = 0) => {
      const prefix = '  '.repeat(indent)
      const props = element.properties || {}
      let desc = `${prefix}- **${element.type.toUpperCase()}**`

      if (props.label && props.label !== element.type) {
        desc += `: "${props.label}"`
      }

      if (element.type === 'input' && props.placeholder) {
        desc += ` (placeholder: "${props.placeholder}")`
      }

      if (element.type === 'text' && props.text) {
        desc += `: "${props.text}"`
      }

      desc += ` [${props.width || 100}x${props.height || 50}px at (${props.x || 0}, ${props.y || 0})]`

      lines.push(desc)

      if (element.children && element.children.length > 0) {
        element.children.forEach(child => describe(child, indent + 1))
      }
    }

    elements.forEach(el => describe(el))

    return lines.join('\n')
  }

  /**
   * Show notification toast
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div')
    notification.className = `designer-notification designer-notification-${type}`
    notification.innerHTML = `
      <span class="notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
      <span class="notification-message">${this.escapeHtml(message)}</span>
    `

    document.body.appendChild(notification)

    // Animate in
    requestAnimationFrame(() => {
      notification.classList.add('show')
    })

    // Auto-remove after 3 seconds
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
    this.loadDefinitions()
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
    if (this.mouseMoveHandler) {
      document.removeEventListener('mousemove', this.mouseMoveHandler)
    }
    if (this.mouseUpHandler) {
      document.removeEventListener('mouseup', this.mouseUpHandler)
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler)
    }
    if (this.container) {
      this.container.innerHTML = ''
      this.container = null
    }
  }
}

// Export as default for compatibility
export default DesignerView
