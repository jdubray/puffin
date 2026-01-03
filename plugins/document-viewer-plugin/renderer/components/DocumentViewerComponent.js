/**
 * DocumentViewerComponent - Document tree browser with preview
 *
 * Provides:
 * - Hierarchical tree view of docs/ directory
 * - Expandable/collapsible directory nodes
 * - File selection and preview
 * - Auto-refresh on open
 */

/**
 * File type icons mapping
 */
const FILE_ICONS = {
  '.md': '📄',
  '.txt': '📝',
  '.json': '📋',
  '.yaml': '⚙️',
  '.yml': '⚙️',
  '.png': '🖼️',
  '.jpg': '🖼️',
  '.jpeg': '🖼️',
  '.gif': '🖼️',
  '.svg': '🖼️',
  '.webp': '🖼️',
  '.ico': '🖼️',
  '.bmp': '🖼️',
  'default': '📎'
}

/**
 * Image file extensions
 */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp']

/**
 * Get icon for a file based on extension
 * @param {string} extension - File extension including dot
 * @returns {string} Emoji icon
 */
function getFileIcon(extension) {
  return FILE_ICONS[extension] || FILE_ICONS.default
}

export class DocumentViewerComponent {
  /**
   * @param {HTMLElement} element - Container element
   * @param {Object} options - Component options
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options
    this.context = options.context || {}

    // State
    this.tree = null
    this.loading = true
    this.error = null
    this.selectedFile = null
    this.selectedContent = null
    this.expandedNodes = new Set(['docs']) // Track expanded directories

    // Drag and drop state
    this.draggedNode = null
    this.dragOverNode = null
    this.isDragging = false

    // Bind methods
    this.handleNodeClick = this.handleNodeClick.bind(this)
    this.handleToggleExpand = this.handleToggleExpand.bind(this)
    this.handleRefresh = this.handleRefresh.bind(this)
    this.handleDragStart = this.handleDragStart.bind(this)
    this.handleDragEnd = this.handleDragEnd.bind(this)
    this.handleDragOver = this.handleDragOver.bind(this)
    this.handleDragLeave = this.handleDragLeave.bind(this)
    this.handleDrop = this.handleDrop.bind(this)
  }

  /**
   * Initialize the component
   */
  async init() {
    console.log('[DocumentViewerComponent] init() called')

    this.container.className = 'document-viewer-container'
    this.render()
    await this.loadTree()

    console.log('[DocumentViewerComponent] init() complete')
  }

  /**
   * Load the document tree
   */
  async loadTree() {
    this.loading = true
    this.error = null
    this.render()

    try {
      const result = await window.puffin.plugins.invoke('document-viewer-plugin', 'scanDirectory')

      if (!result.exists) {
        this.tree = null
        this.error = 'docs/ directory not found'
      } else {
        this.tree = result.root
      }

      this.loading = false
      this.render()
    } catch (err) {
      console.error('[DocumentViewerComponent] Failed to load tree:', err)
      this.error = err.message || 'Failed to load documents'
      this.loading = false
      this.render()
    }
  }

  /**
   * Handle refresh button click
   */
  async handleRefresh() {
    await this.loadTree()
  }

  // ==================== Drag and Drop Handlers ====================

  /**
   * Handle drag start
   * @param {Object} node - Node being dragged
   * @param {DragEvent} event - Drag event
   */
  handleDragStart(node, event) {
    // Stop propagation to prevent parent nodes from also starting drag
    event.stopPropagation()

    this.draggedNode = node
    this.isDragging = true

    // Set drag data
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', node.relativePath)
    event.dataTransfer.setData('application/x-puffin-doc', JSON.stringify({
      relativePath: node.relativePath,
      name: node.name,
      type: node.type
    }))

    // Add dragging class to the element
    event.target.classList.add('dragging')

    // Create a custom drag image
    const dragImage = document.createElement('div')
    dragImage.className = 'drag-preview'
    dragImage.textContent = `${node.type === 'directory' ? '📁' : '📄'} ${node.name}`
    dragImage.style.cssText = `
      position: absolute;
      top: -1000px;
      left: -1000px;
      padding: 4px 8px;
      background: var(--bg-secondary, #2d2d2d);
      border: 1px solid var(--accent-primary, #4a9eff);
      border-radius: 4px;
      font-size: 12px;
      color: var(--text-primary, #fff);
      white-space: nowrap;
    `
    document.body.appendChild(dragImage)
    event.dataTransfer.setDragImage(dragImage, 0, 0)

    // Remove the drag image element after a short delay
    setTimeout(() => dragImage.remove(), 0)

    console.log('[DocumentViewer] Drag started:', node.relativePath)
  }

  /**
   * Handle drag end
   * @param {Object} node - Node that was being dragged
   * @param {DragEvent} event - Drag event
   */
  handleDragEnd(node, event) {
    // Stop propagation to prevent parent nodes from also receiving event
    event.stopPropagation()

    this.draggedNode = null
    this.dragOverNode = null
    this.isDragging = false

    // Remove dragging class
    event.target.classList.remove('dragging')

    // Remove any drag-over highlights
    this.container.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over')
    })

    console.log('[DocumentViewer] Drag ended')
  }

  /**
   * Handle drag over (entering a potential drop target)
   * @param {Object} node - Directory node being dragged over
   * @param {DragEvent} event - Drag event
   */
  handleDragOver(node, event) {
    event.preventDefault()
    event.stopPropagation()

    if (!this.draggedNode) return

    // Normalize paths for comparison (handle Windows backslashes)
    const draggedPath = this.normalizePath(this.draggedNode.relativePath)
    const nodePath = this.normalizePath(node.relativePath)

    // Can't drop on self or into a subdirectory of self
    if (draggedPath === nodePath) return
    if (nodePath.startsWith(draggedPath + '/')) return

    // Can't drop into current parent directory (would be a no-op)
    const currentParent = this.getParentPath(this.draggedNode.relativePath)
    if (currentParent === nodePath) return

    event.dataTransfer.dropEffect = 'move'

    // Update drag-over state and visual
    if (this.dragOverNode?.relativePath !== node.relativePath) {
      // Remove previous drag-over highlight
      this.container.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over')
      })

      this.dragOverNode = node

      // Add drag-over highlight to current target
      const targetEl = this.container.querySelector(`[data-path="${node.relativePath}"]`)
      if (targetEl) {
        targetEl.classList.add('drag-over')
      }
    }
  }

  /**
   * Handle drag leave
   * @param {Object} node - Directory node being left
   * @param {DragEvent} event - Drag event
   */
  handleDragLeave(node, event) {
    event.preventDefault()
    event.stopPropagation()

    // Only clear if we're actually leaving this node (not entering a child)
    const relatedTarget = event.relatedTarget
    const nodeEl = this.container.querySelector(`[data-path="${node.relativePath}"]`)

    if (nodeEl && relatedTarget && !nodeEl.contains(relatedTarget)) {
      nodeEl.classList.remove('drag-over')
      if (this.dragOverNode?.relativePath === node.relativePath) {
        this.dragOverNode = null
      }
    }
  }

  /**
   * Handle drop
   * @param {Object} targetNode - Directory node receiving the drop
   * @param {DragEvent} event - Drop event
   */
  async handleDrop(targetNode, event) {
    event.preventDefault()
    event.stopPropagation()

    // Clear drag-over state
    this.container.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over')
    })

    if (!this.draggedNode) {
      console.warn('[DocumentViewer] Drop with no dragged node')
      return
    }

    const sourceNode = this.draggedNode
    this.draggedNode = null
    this.dragOverNode = null
    this.isDragging = false

    // Normalize paths for comparison (handle Windows backslashes)
    const sourcePath = this.normalizePath(sourceNode.relativePath)
    const targetPath = this.normalizePath(targetNode.relativePath)

    // Validate drop
    if (sourcePath === targetPath) {
      console.log('[DocumentViewer] Cannot drop on self')
      return
    }
    if (targetPath.startsWith(sourcePath + '/')) {
      this.showNotification('Cannot move a folder into itself', 'error')
      return
    }

    // Check if already in this directory
    const currentParent = this.getParentPath(sourceNode.relativePath)
    if (currentParent === targetPath) {
      console.log('[DocumentViewer] Already in target directory')
      return
    }

    console.log('[DocumentViewer] Moving:', sourceNode.relativePath, '->', targetNode.relativePath)

    try {
      const result = await window.puffin.plugins.invoke(
        'document-viewer-plugin',
        'moveItem',
        {
          sourcePath: sourceNode.relativePath,
          targetDir: targetNode.relativePath
        }
      )

      if (result.success) {
        // Check if it was a no-op (already in target location)
        if (result.message && result.message.includes('already in')) {
          this.showNotification(result.message, 'info')
        } else {
          this.showNotification(`Moved "${sourceNode.name}" to "${targetNode.name}"`, 'success')

          // Refresh the tree to show updated structure
          await this.loadTree()

          // Expand the target directory to show the moved item
          this.expandedNodes.add(targetNode.relativePath)
          this.render()
        }
      } else {
        this.showNotification('Failed to move item', 'error')
      }
    } catch (err) {
      console.error('[DocumentViewer] Move failed:', err)
      this.showNotification(`Move failed: ${err.message}`, 'error')
    }
  }

  /**
   * Show a notification toast
   * @param {string} message - Notification message
   * @param {string} type - 'success', 'error', or 'info'
   */
  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div')
    notification.className = `doc-notification doc-notification-${type}`
    notification.innerHTML = `
      <span class="notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
      <span class="notification-message">${this.escapeHtml(message)}</span>
    `

    document.body.appendChild(notification)

    // Animate in
    requestAnimationFrame(() => {
      notification.classList.add('show')
    })

    // Remove after delay
    setTimeout(() => {
      notification.classList.remove('show')
      setTimeout(() => notification.remove(), 300)
    }, 3000)
  }

  /**
   * Handle node click (select file or toggle directory)
   * @param {Object} node - Tree node that was clicked
   * @param {Event} event - Click event
   */
  async handleNodeClick(node, event) {
    event.stopPropagation()

    if (node.type === 'directory') {
      this.handleToggleExpand(node, event)
    } else if (node.type === 'file') {
      await this.selectFile(node)
    }
  }

  /**
   * Handle expand/collapse toggle with accordion behavior
   * When opening a folder, closes sibling folders at the same level
   * @param {Object} node - Directory node
   * @param {Event} event - Click event
   */
  handleToggleExpand(node, event) {
    event.stopPropagation()

    const nodeId = node.relativePath || node.name
    if (this.expandedNodes.has(nodeId)) {
      // Collapsing - just remove this node
      this.expandedNodes.delete(nodeId)
    } else {
      // Expanding - close sibling folders first (accordion behavior)
      const siblingIds = this.getSiblingDirectoryIds(node)
      for (const siblingId of siblingIds) {
        this.expandedNodes.delete(siblingId)
        // Also collapse any children of the sibling
        this.collapseDescendants(siblingId)
      }
      this.expandedNodes.add(nodeId)
    }

    this.render()
  }

  /**
   * Get IDs of sibling directories (same parent)
   * @param {Object} node - Directory node
   * @returns {string[]} Array of sibling directory IDs
   */
  getSiblingDirectoryIds(node) {
    const nodeId = node.relativePath || node.name
    const parentPath = this.getParentPath(nodeId)
    const siblings = []

    // Find the parent node and get its directory children
    const parentNode = parentPath ? this.findNodeByPath(parentPath) : this.tree

    if (parentNode && parentNode.children) {
      for (const child of parentNode.children) {
        if (child.type === 'directory') {
          const childId = child.relativePath || child.name
          if (childId !== nodeId) {
            siblings.push(childId)
          }
        }
      }
    }

    return siblings
  }

  /**
   * Get parent path from a node path
   * @param {string} nodePath - Node path
   * @returns {string|null} Parent path or null if root
   */
  getParentPath(nodePath) {
    if (!nodePath) return null
    // Handle both forward and back slashes (Windows/Unix)
    const normalizedPath = nodePath.replace(/\\/g, '/')
    if (!normalizedPath.includes('/')) return null
    const parts = normalizedPath.split('/')
    parts.pop()
    return parts.join('/')
  }

  /**
   * Normalize a path for comparison (handles Windows backslashes)
   * @param {string} nodePath - Path to normalize
   * @returns {string} Normalized path with forward slashes
   */
  normalizePath(nodePath) {
    if (!nodePath) return ''
    return nodePath.replace(/\\/g, '/')
  }

  /**
   * Collapse all descendants of a node
   * @param {string} nodeId - Node ID to collapse descendants of
   */
  collapseDescendants(nodeId) {
    // Remove any expanded nodes that are children of this node
    for (const expandedId of [...this.expandedNodes]) {
      if (expandedId.startsWith(nodeId + '/')) {
        this.expandedNodes.delete(expandedId)
      }
    }
  }

  /**
   * Select a file and load its content
   * @param {Object} node - File node
   */
  async selectFile(node) {
    if (!node.isSupported) {
      this.selectedFile = node
      this.selectedContent = null
      this.error = `Unsupported file type: ${node.extension}`
      this.render()
      return
    }

    this.selectedFile = node
    this.selectedContent = null
    this.error = null
    this.render()

    try {
      const result = await window.puffin.plugins.invoke(
        'document-viewer-plugin',
        'getFileContent',
        { filePath: node.relativePath }
      )

      this.selectedContent = result
      this.render()
    } catch (err) {
      console.error('[DocumentViewerComponent] Failed to load file:', err)
      this.error = err.message || 'Failed to load file'
      this.render()
    }
  }

  /**
   * Render the component
   */
  render() {
    this.container.innerHTML = `
      <div class="document-viewer">
        <div class="document-viewer-header">
          <h2>Documentation</h2>
          <button class="refresh-btn" title="Refresh tree" aria-label="Refresh document tree">
            🔄
          </button>
        </div>

        <div class="document-viewer-content">
          ${this.renderTreePanel()}
          ${this.renderPreviewPanel()}
        </div>
      </div>
    `

    this.bindEvents()
  }

  /**
   * Render the tree panel
   * @returns {string} HTML string
   */
  renderTreePanel() {
    if (this.loading) {
      return `
        <div class="tree-panel">
          <div class="tree-loading">
            <span class="loading-spinner">⏳</span>
            <span>Loading documents...</span>
          </div>
        </div>
      `
    }

    if (this.error && !this.tree) {
      return `
        <div class="tree-panel">
          <div class="tree-error">
            <span class="error-icon">⚠️</span>
            <span>${this.escapeHtml(this.error)}</span>
          </div>
        </div>
      `
    }

    if (!this.tree) {
      return `
        <div class="tree-panel">
          <div class="tree-empty">
            <span class="empty-icon">📂</span>
            <p>No docs/ directory found</p>
            <p class="hint">Create a docs/ folder in your project to see documentation here.</p>
          </div>
        </div>
      `
    }

    return `
      <div class="tree-panel">
        <div class="tree-view" role="tree" aria-label="Document tree">
          ${this.renderTreeNode(this.tree, 0)}
        </div>
      </div>
    `
  }

  /**
   * Render a tree node recursively
   * @param {Object} node - Tree node
   * @param {number} depth - Nesting depth
   * @returns {string} HTML string
   */
  renderTreeNode(node, depth) {
    const nodeId = node.relativePath || node.name
    const isExpanded = this.expandedNodes.has(nodeId)
    const isSelected = this.selectedFile?.relativePath === node.relativePath
    const indent = depth * 16
    const isRoot = node.name === 'docs' && depth === 0
    const isDraggedOver = this.dragOverNode?.relativePath === node.relativePath

    if (node.type === 'directory') {
      const hasChildren = node.children && node.children.length > 0
      const expandIcon = hasChildren ? (isExpanded ? '▼' : '▶') : '•'

      return `
        <div class="tree-node directory ${isExpanded ? 'expanded' : ''} ${node.isEmpty ? 'empty' : ''} ${isDraggedOver ? 'drag-over' : ''}"
             role="treeitem"
             aria-expanded="${isExpanded}"
             data-path="${this.escapeHtml(node.relativePath)}"
             data-type="directory"
             draggable="${!isRoot}"
             data-draggable="${!isRoot}">
          <div class="tree-node-content" style="padding-left: ${indent}px">
            <span class="tree-expand-icon" aria-hidden="true">${expandIcon}</span>
            <span class="tree-node-icon" aria-hidden="true">📁</span>
            <span class="tree-node-name">${this.escapeHtml(node.name)}</span>
            ${node.isEmpty ? '<span class="tree-node-badge empty-badge">empty</span>' : ''}
          </div>
          ${isExpanded && hasChildren ? `
            <div class="tree-children" role="group">
              ${node.children.map(child => this.renderTreeNode(child, depth + 1)).join('')}
            </div>
          ` : ''}
        </div>
      `
    }

    // File node
    const icon = getFileIcon(node.extension)
    const isSupported = node.isSupported

    return `
      <div class="tree-node file ${isSelected ? 'selected' : ''} ${!isSupported ? 'unsupported' : ''}"
           role="treeitem"
           aria-selected="${isSelected}"
           data-path="${this.escapeHtml(node.relativePath)}"
           data-type="file"
           draggable="true"
           data-draggable="true">
        <div class="tree-node-content" style="padding-left: ${indent}px">
          <span class="tree-expand-icon" aria-hidden="true"></span>
          <span class="tree-node-icon" aria-hidden="true">${icon}</span>
          <span class="tree-node-name">${this.escapeHtml(node.name)}</span>
        </div>
      </div>
    `
  }

  /**
   * Render the preview panel
   * @returns {string} HTML string
   */
  renderPreviewPanel() {
    if (!this.selectedFile) {
      return `
        <div class="preview-panel">
          <div class="preview-empty">
            <span class="empty-icon">📖</span>
            <p>Select a document to preview</p>
          </div>
        </div>
      `
    }

    if (this.error) {
      return `
        <div class="preview-panel">
          <div class="preview-header">
            <span class="preview-filename">${this.escapeHtml(this.selectedFile.name)}</span>
          </div>
          <div class="preview-error">
            <span class="error-icon">⚠️</span>
            <span>${this.escapeHtml(this.error)}</span>
          </div>
        </div>
      `
    }

    if (!this.selectedContent) {
      return `
        <div class="preview-panel">
          <div class="preview-header">
            <span class="preview-filename">${this.escapeHtml(this.selectedFile.name)}</span>
          </div>
          <div class="preview-loading">
            <span class="loading-spinner">⏳</span>
            <span>Loading content...</span>
          </div>
        </div>
      `
    }

    const content = this.selectedContent
    const formattedDate = new Date(content.modified).toLocaleString()
    const formattedSize = this.formatFileSize(content.size)

    // Determine content type for rendering
    let previewClass = 'plaintext'
    let previewContent = ''

    if (content.isImage) {
      previewClass = 'image'
      previewContent = this.renderImage(content)
    } else if (content.isMarkdown) {
      previewClass = 'markdown'
      previewContent = this.renderMarkdown(content.content)
    } else {
      previewContent = this.renderPlaintext(content.content)
    }

    return `
      <div class="preview-panel">
        <div class="preview-header">
          <span class="preview-filename">${this.escapeHtml(content.name)}</span>
          <span class="preview-meta">${formattedSize} • ${formattedDate}</span>
        </div>
        <div class="preview-content ${previewClass}">
          ${previewContent}
        </div>
      </div>
    `
  }

  /**
   * Render markdown content using marked.js (async via IPC)
   * Falls back to plaintext rendering with preserved whitespace if marked is unavailable
   * @param {string} content - Markdown content
   * @returns {string} HTML string (initially fallback, updates async)
   */
  renderMarkdown(content) {
    // Generate a unique ID for this markdown container
    const containerId = `markdown-${Date.now()}`

    // Schedule async markdown parsing after render
    if (window.puffin?.marked?.parse) {
      setTimeout(async () => {
        try {
          const html = await window.puffin.marked.parse(content)
          const container = document.getElementById(containerId)
          if (container) {
            container.innerHTML = html
            container.classList.remove('markdown-fallback')
          }
        } catch (err) {
          console.warn('[DocumentViewer] Marked.js parsing failed:', err)
          // Keep the fallback content on error
        }
      }, 0)
    }

    // Return fallback immediately (will be replaced async if marked succeeds)
    return `<div class="markdown-body markdown-fallback" id="${containerId}"><pre class="markdown-pre">${this.escapeHtml(content)}</pre></div>`
  }

  /**
   * Render image content
   * @param {Object} content - File content object with path info
   * @returns {string} HTML string
   */
  renderImage(content) {
    // Use file:// protocol for local images
    const imageSrc = `file://${content.path.replace(/\\/g, '/')}`

    return `
      <div class="image-viewer">
        <div class="image-container">
          <img
            src="${this.escapeHtml(imageSrc)}"
            alt="${this.escapeHtml(content.name)}"
            loading="lazy"
            onclick="this.classList.toggle('zoomed')"
            title="Click to zoom"
          />
        </div>
        <div class="image-info">
          <span class="image-dimensions" id="image-dimensions-${this.escapeHtml(content.name)}"></span>
        </div>
      </div>
    `
  }

  /**
   * Render plaintext content
   * @param {string} content - Plain text content
   * @returns {string} HTML string
   */
  renderPlaintext(content) {
    return `<pre class="plaintext-content">${this.escapeHtml(content)}</pre>`
  }

  /**
   * Escape HTML special characters
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
   * Format file size for display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted size
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /**
   * Bind event handlers
   */
  bindEvents() {
    // Refresh button
    const refreshBtn = this.container.querySelector('.refresh-btn')
    if (refreshBtn) {
      refreshBtn.addEventListener('click', this.handleRefresh)
    }

    // Tree node clicks and drag-drop
    const treeNodes = this.container.querySelectorAll('.tree-node')
    treeNodes.forEach(nodeEl => {
      const path = nodeEl.dataset.path
      const type = nodeEl.dataset.type
      const node = this.findNodeByPath(path)

      if (node) {
        nodeEl.addEventListener('click', (e) => this.handleNodeClick(node, e))

        // Keyboard navigation
        nodeEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            this.handleNodeClick(node, e)
          }
        })

        // Make focusable
        nodeEl.setAttribute('tabindex', '0')

        // Drag and drop events
        if (nodeEl.dataset.draggable === 'true') {
          nodeEl.addEventListener('dragstart', (e) => this.handleDragStart(node, e))
          nodeEl.addEventListener('dragend', (e) => this.handleDragEnd(node, e))
        }

        // All directories (including root) can be drop targets
        if (type === 'directory') {
          nodeEl.addEventListener('dragover', (e) => this.handleDragOver(node, e))
          nodeEl.addEventListener('dragleave', (e) => this.handleDragLeave(node, e))
          nodeEl.addEventListener('drop', (e) => this.handleDrop(node, e))
        }
      }
    })
  }

  /**
   * Find a node by its relative path
   * @param {string} path - Relative path to find
   * @returns {Object|null} Node or null
   */
  findNodeByPath(path) {
    if (!this.tree) return null

    const search = (node) => {
      if (node.relativePath === path) return node
      if (node.children) {
        for (const child of node.children) {
          const found = search(child)
          if (found) return found
        }
      }
      return null
    }

    return search(this.tree)
  }

  /**
   * Lifecycle hook: Called when the view is activated (clicked in sidebar)
   * Refreshes the document tree to pick up any new files created by Claude
   */
  async onActivate() {
    console.log('[DocumentViewerComponent] onActivate() - refreshing document tree')
    await this.loadTree()
  }

  /**
   * Lifecycle hook: Called when the view is deactivated
   */
  onDeactivate() {
    console.log('[DocumentViewerComponent] onDeactivate()')
    // No cleanup needed currently
  }

  /**
   * Cleanup when component is destroyed
   */
  destroy() {
    // No cleanup needed currently
    console.log('[DocumentViewerComponent] destroy() called')
  }
}

export default DocumentViewerComponent
