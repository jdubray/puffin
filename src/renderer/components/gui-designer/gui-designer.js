/**
 * GUI Designer Component
 *
 * Visual interface for designing UI layouts that can be
 * described to Claude for implementation guidance.
 */

export class GuiDesignerComponent {
  constructor(intents) {
    this.intents = intents
    this.canvas = null
    this.propertyPanel = null
    this.selectedElement = null
    this.dragState = null
    this.resizeState = null
    this.gridSize = 20
  }

  /**
   * Initialize the component
   */
  init() {
    this.canvas = document.getElementById('designer-canvas')
    this.propertyPanel = document.getElementById('property-content')

    this.bindEvents()
    this.subscribeToState()
  }

  /**
   * Bind DOM events
   */
  bindEvents() {
    // Palette items
    document.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('click', () => {
        const type = item.dataset.type
        this.addElement(type)
      })
    })

    // Save GUI definition
    document.getElementById('save-gui-btn').addEventListener('click', () => {
      this.showSaveDialog()
    })

    // Load GUI definition
    document.getElementById('load-gui-btn').addEventListener('click', () => {
      this.showLoadDialog()
    })

    // Clear canvas
    document.getElementById('clear-canvas-btn').addEventListener('click', () => {
      if (confirm('Clear all elements?')) {
        this.intents.clearGuiCanvas()
      }
    })

    // Export GUI
    document.getElementById('export-gui-btn').addEventListener('click', () => {
      this.exportDescription()
    })

    // Canvas click to deselect
    this.canvas.addEventListener('click', (e) => {
      if (e.target === this.canvas) {
        this.intents.selectGuiElement(null)
      }
    })

    // Mouse events for drag/resize
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e))
    document.addEventListener('mousemove', (e) => this.handleMouseMove(e))
    document.addEventListener('mouseup', (e) => this.handleMouseUp(e))

    // Keyboard events - only delete element when not in a text input
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeTag = document.activeElement.tagName
        const isTextInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA'
        if (this.selectedElement && !isTextInput) {
          e.preventDefault()
          this.intents.deleteGuiElement(this.selectedElement)
        }
      }
    })
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      const { state } = e.detail
      this.render(state.designer)
    })
  }

  /**
   * Render component based on state
   */
  render(designerState) {
    this.renderCanvas(designerState.elements)
    this.renderPropertyPanel(designerState.selectedElement)
    this.selectedElement = designerState.selectedElement?.id || null
  }

  /**
   * Render canvas with elements
   */
  renderCanvas(elements) {
    // Clear existing elements (but keep static content)
    this.canvas.querySelectorAll('.gui-element').forEach(el => el.remove())

    // Render each root element
    elements.forEach(element => {
      this.renderElement(element, this.canvas)
    })
  }

  /**
   * Render a single element and its children
   */
  renderElement(element, parent) {
    const el = document.createElement('div')
    el.className = `gui-element type-${element.type} ${element.isSelected ? 'selected' : ''}`
    el.dataset.id = element.id

    const props = element.properties || {}
    el.style.left = `${props.x || 0}px`
    el.style.top = `${props.y || 0}px`
    el.style.width = `${props.width || 100}px`
    el.style.height = `${props.height || 50}px`

    // Element content based on type
    el.innerHTML = this.getElementContent(element)

    // Add resize handles if selected
    if (element.isSelected) {
      el.innerHTML += `
        <div class="resize-handle nw"></div>
        <div class="resize-handle ne"></div>
        <div class="resize-handle sw"></div>
        <div class="resize-handle se"></div>
      `
    }

    parent.appendChild(el)

    // Render children
    if (element.children && element.children.length > 0) {
      element.children.forEach(child => {
        this.renderElement(child, el)
      })
    }
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
  renderPropertyPanel(element) {
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
          <span>×</span>
          <input type="number" id="prop-height" value="${props.height || 50}" style="width: 70px">
        </div>
      </div>

      <button id="delete-element-btn" class="btn small" style="width: 100%; margin-top: 1rem;">
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
    const updateProps = () => {
      const props = {
        label: document.getElementById('prop-label')?.value,
        placeholder: document.getElementById('prop-placeholder')?.value,
        text: document.getElementById('prop-text')?.value,
        x: parseInt(document.getElementById('prop-x')?.value) || 0,
        y: parseInt(document.getElementById('prop-y')?.value) || 0,
        width: parseInt(document.getElementById('prop-width')?.value) || 100,
        height: parseInt(document.getElementById('prop-height')?.value) || 50
      }

      // Remove undefined properties
      Object.keys(props).forEach(key => {
        if (props[key] === undefined) delete props[key]
      })

      this.intents.updateGuiElement(elementId, props)
    }

    // Add listeners to all inputs
    this.propertyPanel.querySelectorAll('input, textarea').forEach(input => {
      input.addEventListener('change', updateProps)
    })

    // Delete button
    document.getElementById('delete-element-btn')?.addEventListener('click', () => {
      this.intents.deleteGuiElement(elementId)
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

    this.intents.addGuiElement({
      type,
      properties: {
        x: 50 + Math.random() * 100,
        y: 50 + Math.random() * 100,
        width: size.width,
        height: size.height,
        label: type.charAt(0).toUpperCase() + type.slice(1)
      }
    })
  }

  /**
   * Handle mouse down for drag/resize
   */
  handleMouseDown(e) {
    const element = e.target.closest('.gui-element')
    if (!element) return

    const id = element.dataset.id
    this.intents.selectGuiElement(id)

    // Check if clicking on resize handle
    if (e.target.classList.contains('resize-handle')) {
      this.resizeState = {
        id,
        handle: e.target.className.split(' ')[1], // nw, ne, sw, se
        startX: e.clientX,
        startY: e.clientY,
        startWidth: element.offsetWidth,
        startHeight: element.offsetHeight,
        startLeft: element.offsetLeft,
        startTop: element.offsetTop
      }
    } else {
      // Start dragging
      this.dragState = {
        id,
        startX: e.clientX - element.offsetLeft,
        startY: e.clientY - element.offsetTop
      }
    }

    e.preventDefault()
  }

  /**
   * Handle mouse move for drag/resize
   */
  handleMouseMove(e) {
    if (this.dragState) {
      let x = e.clientX - this.dragState.startX
      let y = e.clientY - this.dragState.startY

      // Snap to grid
      x = Math.round(x / this.gridSize) * this.gridSize
      y = Math.round(y / this.gridSize) * this.gridSize

      this.intents.moveGuiElement(this.dragState.id, x, y)
    }

    if (this.resizeState) {
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

      this.intents.resizeGuiElement(this.resizeState.id, width, height)
      this.intents.moveGuiElement(this.resizeState.id, x, y)
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
   * Export GUI description
   */
  exportDescription() {
    const state = window.puffinApp?.state
    if (!state?.designer.hasElements) {
      alert('No elements to export')
      return
    }

    const description = this.buildDescription(state.designer.elements)

    // Show in modal
    this.intents.showModal('gui-export', { description })
    this.renderExportModal(description)
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

      desc += ` [${props.width || 100}×${props.height || 50}px at (${props.x || 0}, ${props.y || 0})]`

      lines.push(desc)

      if (element.children && element.children.length > 0) {
        element.children.forEach(child => describe(child, indent + 1))
      }
    }

    elements.forEach(el => describe(el))

    return lines.join('\n')
  }

  /**
   * Show save definition dialog
   */
  showSaveDialog() {
    const state = window.puffinApp?.state
    if (!state?.designer.hasElements) {
      alert('No elements to save')
      return
    }

    this.intents.showModal('save-gui-definition', {
      elements: state.designer.flatElements
    })
  }

  /**
   * Show load definition dialog
   */
  async showLoadDialog() {
    this.intents.showModal('load-gui-definition', {})
  }

  /**
   * Render export modal
   */
  renderExportModal(description) {
    const modalContent = document.getElementById('modal-content')
    const modalTitle = document.getElementById('modal-title')
    const modalActions = document.getElementById('modal-actions')

    modalTitle.textContent = 'GUI Description'

    modalContent.innerHTML = `
      <textarea id="export-content" style="width: 100%; height: 300px; font-family: monospace; font-size: 0.875rem;">${this.escapeHtml(description)}</textarea>
    `

    modalActions.innerHTML = `
      <button class="btn secondary" id="modal-cancel-btn">Close</button>
      <button class="btn primary" id="copy-export-btn">Copy to Clipboard</button>
    `

    document.getElementById('modal-cancel-btn').addEventListener('click', () => {
      this.intents.hideModal()
    })

    document.getElementById('copy-export-btn').addEventListener('click', () => {
      const textarea = document.getElementById('export-content')
      textarea.select()
      document.execCommand('copy')
      alert('Copied to clipboard!')
    })
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
   * Cleanup
   */
  destroy() {
    document.removeEventListener('mousemove', this.handleMouseMove)
    document.removeEventListener('mouseup', this.handleMouseUp)
  }
}
