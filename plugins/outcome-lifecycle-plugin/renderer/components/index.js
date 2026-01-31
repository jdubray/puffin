/**
 * Outcome Lifecycle Plugin - Renderer Entry Point
 *
 * Provides IPC wrapper API and a two-pane view for browsing
 * and managing outcome lifecycles.
 *
 * Note: Renderer files use ES modules (import/export); main-process files use CommonJS.
 *
 * @module outcome-lifecycle-plugin/renderer
 */

import { DAGRenderer } from './dag-renderer.js'

const PLUGIN_NAME = 'outcome-lifecycle-plugin'

/* ==========================================================================
   Status Configuration
   ========================================================================== */

const STATUS_CONFIG = {
  not_started: { label: 'Not Started', icon: '○', cssClass: 'status-not-started' },
  in_progress: { label: 'In Progress', icon: '◑', cssClass: 'status-in-progress' },
  achieved:    { label: 'Achieved',    icon: '●', cssClass: 'status-achieved' }
}

const VALID_STATUSES = Object.keys(STATUS_CONFIG)

/* ==========================================================================
   IPC Wrapper API
   ========================================================================== */

/**
 * IPC wrapper API for outcome lifecycle operations
 */
const OutcomeLifecycleAPI = {
  async createLifecycle(title, description) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'createLifecycle', { title, description })
  },
  async getLifecycle(id) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'getLifecycle', { id })
  },
  async updateLifecycle(id, fields) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'updateLifecycle', { id, ...fields })
  },
  async deleteLifecycle(id) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'deleteLifecycle', { id })
  },
  async listLifecycles() {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'listLifecycles')
  },
  async mapStory(lifecycleId, storyId) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'mapStory', { lifecycleId, storyId })
  },
  async unmapStory(lifecycleId, storyId) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'unmapStory', { lifecycleId, storyId })
  },
  async getStoriesForLifecycle(lifecycleId) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'getStoriesForLifecycle', { lifecycleId })
  },
  async getLifecyclesForStory(storyId) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'getLifecyclesForStory', { storyId })
  },
  async getDag() {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'getDag')
  },
  async addDependency(fromId, toId) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'addDependency', { fromId, toId })
  },
  async removeDependency(fromId, toId) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'removeDependency', { fromId, toId })
  }
}

/* ==========================================================================
   OutcomeLifecycleView
   ========================================================================== */

/**
 * OutcomeLifecycleView - Two-pane outcome lifecycle browser
 *
 * Left sidebar: lifecycle list with status indicators, create button
 * Right detail: selected lifecycle details, story mappings, dependencies
 */
class OutcomeLifecycleView {
  /**
   * @param {HTMLElement} element - Container element
   * @param {object} [options] - Configuration options
   */
  constructor(element, options = {}) {
    this.container = element
    this.options = options

    /** @type {Array} */
    this._lifecycles = []
    /** @type {string|null} */
    this._selectedId = null
    /** @type {object|null} */
    this._selectedLifecycle = null
    /** @type {Array} */
    this._selectedStories = []
    /** @type {boolean} */
    this._loading = false
    /** @type {boolean} */
    this._showCreateForm = false

    // DOM refs
    this._sidebarList = null
    this._detailPane = null
    this._createFormEl = null

    // DAG visualization
    /** @type {DAGRenderer|null} */
    this._dagRenderer = null
    /** @type {boolean} */
    this._dagVisible = false

    // Bound handlers for cleanup
    this._boundKeyHandler = this._handleKeyDown.bind(this)
    this._eventListeners = []
  }

  /**
   * Initialize the view
   */
  async init() {
    this.container.className = 'olc-view'
    this._render()
    this._attachEventHandlers()
    await this._loadLifecycles()
  }

  /* ---------- Rendering ---------- */

  _render() {
    if (!this.container) return

    this.container.innerHTML = `
      <div class="olc-sidebar" role="navigation" aria-label="Lifecycle list">
        <div class="olc-sidebar-header">
          <h2 class="olc-sidebar-title">Outcomes</h2>
          <button class="olc-btn olc-dag-toggle" aria-label="Toggle dependency graph" title="Dependency Graph"><span class="olc-dag-toggle-icon">⊞</span></button>
          <button class="olc-btn olc-btn-create" aria-label="Create new lifecycle" title="New Lifecycle">+</button>
        </div>
        <div class="olc-create-form olc-hidden" aria-hidden="true">
          <input class="olc-input olc-create-title" type="text" placeholder="Title" aria-label="Lifecycle title" />
          <textarea class="olc-input olc-create-desc" placeholder="Description (optional)" rows="2" aria-label="Lifecycle description"></textarea>
          <div class="olc-create-actions">
            <button class="olc-btn olc-btn-primary olc-create-submit">Create</button>
            <button class="olc-btn olc-create-cancel">Cancel</button>
          </div>
        </div>
        <ul class="olc-list" role="listbox" aria-label="Lifecycles" tabindex="0"></ul>
      </div>
      <div class="olc-detail" role="main" aria-label="Lifecycle details">
        <div class="olc-detail-empty">
          <p>Select a lifecycle to view details</p>
        </div>
        <div class="olc-dag-section olc-hidden" aria-hidden="true">
          <div class="olc-dag-host"></div>
        </div>
      </div>
    `

    this._sidebarList = this.container.querySelector('.olc-list')
    this._detailPane = this.container.querySelector('.olc-detail')
    this._createFormEl = this.container.querySelector('.olc-create-form')
  }

  _renderSidebar() {
    if (!this._sidebarList) return

    if (this._loading) {
      this._sidebarList.innerHTML = '<li class="olc-list-loading">Loading…</li>'
      return
    }

    if (this._lifecycles.length === 0) {
      this._sidebarList.innerHTML = '<li class="olc-list-empty">No lifecycles yet</li>'
      return
    }

    this._sidebarList.innerHTML = this._lifecycles.map(lc => {
      const cfg = STATUS_CONFIG[lc.status] || STATUS_CONFIG.not_started
      const selected = lc.id === this._selectedId
      return `<li class="olc-list-item ${selected ? 'olc-list-item-selected' : ''}"
                  role="option" aria-selected="${selected}"
                  data-id="${lc.id}" tabindex="-1">
        <span class="olc-status-icon ${cfg.cssClass}" title="${cfg.label}">${cfg.icon}</span>
        <span class="olc-list-item-title">${this._escapeHtml(lc.title)}</span>
      </li>`
    }).join('')
  }

  _renderDetail() {
    if (!this._detailPane) return
    const lc = this._selectedLifecycle

    if (!lc) {
      this._detailPane.innerHTML = '<div class="olc-detail-empty"><p>Select a lifecycle to view details</p></div>'
      return
    }

    const cfg = STATUS_CONFIG[lc.status] || STATUS_CONFIG.not_started
    const storiesHtml = this._selectedStories.length > 0
      ? `<ul class="olc-stories-list">${this._selectedStories.map(s =>
          `<li class="olc-story-item">
            <span class="olc-story-id">${this._escapeHtml(String(s.storyId || s))}</span>
            <button class="olc-btn olc-btn-icon olc-unmap-btn" data-story="${this._escapeHtml(String(s.storyId || s))}" aria-label="Unmap story" title="Unmap">×</button>
          </li>`).join('')}</ul>`
      : '<p class="olc-no-items">No stories mapped</p>'

    const depsHtml = (lc.dependencies && lc.dependencies.length > 0)
      ? `<ul class="olc-deps-list">${lc.dependencies.map(depId => {
          const dep = this._lifecycles.find(l => l.id === depId)
          const depLabel = dep ? dep.title : depId
          return `<li class="olc-dep-item">
            <span class="olc-dep-label">${this._escapeHtml(depLabel)}</span>
            <button class="olc-btn olc-btn-icon olc-remove-dep-btn" data-dep="${depId}" aria-label="Remove dependency" title="Remove">×</button>
          </li>`
        }).join('')}</ul>`
      : '<p class="olc-no-items">No dependencies</p>'

    const statusOptions = VALID_STATUSES.map(s => {
      const sc = STATUS_CONFIG[s]
      return `<option value="${s}" ${s === lc.status ? 'selected' : ''}>${sc.icon} ${sc.label}</option>`
    }).join('')

    this._detailPane.innerHTML = `
      <div class="olc-detail-header">
        <h2 class="olc-detail-title">${this._escapeHtml(lc.title)}</h2>
        <div class="olc-detail-actions">
          <button class="olc-btn olc-btn-danger olc-delete-btn" aria-label="Delete lifecycle" title="Delete">Delete</button>
        </div>
      </div>
      ${lc.description ? `<p class="olc-detail-desc">${this._escapeHtml(lc.description)}</p>` : ''}
      <div class="olc-detail-status">
        <label class="olc-label" for="olc-status-select">Status</label>
        <select id="olc-status-select" class="olc-select olc-status-select">${statusOptions}</select>
      </div>
      <div class="olc-detail-section">
        <h3 class="olc-section-title">Mapped Stories</h3>
        ${storiesHtml}
        <div class="olc-inline-form">
          <input class="olc-input olc-map-story-input" type="text" placeholder="Story ID" aria-label="Story ID to map" />
          <button class="olc-btn olc-btn-primary olc-map-story-btn">Map</button>
        </div>
      </div>
      <div class="olc-detail-section">
        <h3 class="olc-section-title">Dependencies</h3>
        ${depsHtml}
        <div class="olc-inline-form">
          <select class="olc-select olc-add-dep-select" aria-label="Select dependency">
            <option value="">Add dependency…</option>
            ${this._lifecycles
              .filter(l => l.id !== lc.id && !(lc.dependencies || []).includes(l.id))
              .map(l => `<option value="${l.id}">${this._escapeHtml(l.title)}</option>`)
              .join('')}
          </select>
          <button class="olc-btn olc-btn-primary olc-add-dep-btn">Add</button>
        </div>
      </div>
      <div class="olc-detail-meta">
        <span>Created: ${this._formatDate(lc.createdAt)}</span>
        <span>Updated: ${this._formatDate(lc.updatedAt)}</span>
      </div>
    `
  }

  /* ---------- Event Handling ---------- */

  _attachEventHandlers() {
    this.container.addEventListener('keydown', this._boundKeyHandler)
    this._eventListeners.push(['keydown', this._boundKeyHandler, this.container])

    this._boundClickHandler = (e) => {
      // DAG toggle
      if (e.target.closest('.olc-dag-toggle')) {
        this._toggleDag()
        return
      }
      // Create button
      if (e.target.closest('.olc-btn-create')) {
        this._toggleCreateForm(true)
        return
      }
      // Create form submit
      if (e.target.closest('.olc-create-submit')) {
        this._handleCreate()
        return
      }
      // Create form cancel
      if (e.target.closest('.olc-create-cancel')) {
        this._toggleCreateForm(false)
        return
      }
      // Sidebar list item
      const listItem = e.target.closest('.olc-list-item[data-id]')
      if (listItem) {
        this._selectLifecycle(listItem.dataset.id)
        return
      }
      // Delete
      if (e.target.closest('.olc-delete-btn')) {
        this._handleDelete()
        return
      }
      // Unmap story
      const unmapBtn = e.target.closest('.olc-unmap-btn')
      if (unmapBtn) {
        this._handleUnmapStory(unmapBtn.dataset.story)
        return
      }
      // Map story
      if (e.target.closest('.olc-map-story-btn')) {
        this._handleMapStory()
        return
      }
      // Remove dependency
      const removeDepBtn = e.target.closest('.olc-remove-dep-btn')
      if (removeDepBtn) {
        this._handleRemoveDependency(removeDepBtn.dataset.dep)
        return
      }
      // Add dependency
      if (e.target.closest('.olc-add-dep-btn')) {
        this._handleAddDependency()
        return
      }
    }
    this.container.addEventListener('click', this._boundClickHandler)
    this._eventListeners.push(['click', this._boundClickHandler, this.container])

    // Status change
    this._boundChangeHandler = (e) => {
      if (e.target.closest('.olc-status-select')) {
        this._handleStatusChange(e.target.value)
      }
    }
    this.container.addEventListener('change', this._boundChangeHandler)
    this._eventListeners.push(['change', this._boundChangeHandler, this.container])
  }

  _handleKeyDown(e) {
    // Keyboard navigation in sidebar list
    if (!this._sidebarList || !this._sidebarList.contains(document.activeElement) && document.activeElement !== this._sidebarList) return

    const items = Array.from(this._sidebarList.querySelectorAll('.olc-list-item[data-id]'))
    if (items.length === 0) return

    const currentIdx = items.findIndex(el => el.dataset.id === this._selectedId)

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const next = Math.min(currentIdx + 1, items.length - 1)
        this._selectLifecycle(items[next].dataset.id)
        items[next].focus()
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const prev = Math.max(currentIdx - 1, 0)
        this._selectLifecycle(items[prev].dataset.id)
        items[prev].focus()
        break
      }
      case 'Home': {
        e.preventDefault()
        this._selectLifecycle(items[0].dataset.id)
        items[0].focus()
        break
      }
      case 'End': {
        e.preventDefault()
        const last = items.length - 1
        this._selectLifecycle(items[last].dataset.id)
        items[last].focus()
        break
      }
      case 'Enter': {
        e.preventDefault()
        if (currentIdx >= 0) this._selectLifecycle(items[currentIdx].dataset.id)
        break
      }
    }
  }

  /* ---------- Data Operations ---------- */

  async _loadLifecycles() {
    this._loading = true
    this._renderSidebar()
    try {
      const result = await OutcomeLifecycleAPI.listLifecycles()
      this._lifecycles = result.lifecycles || result || []
    } catch (err) {
      console.error('[outcome-lifecycle-plugin] Failed to load lifecycles:', err)
      this._lifecycles = []
    }
    this._loading = false
    this._renderSidebar()
  }

  async _selectLifecycle(id) {
    if (this._selectedId === id) return
    this._selectedId = id
    this._renderSidebar()

    try {
      const result = await OutcomeLifecycleAPI.getLifecycle(id)
      this._selectedLifecycle = result.lifecycle || result
      const storiesResult = await OutcomeLifecycleAPI.getStoriesForLifecycle(id)
      this._selectedStories = storiesResult.stories || storiesResult || []
    } catch (err) {
      console.error('[outcome-lifecycle-plugin] Failed to load lifecycle details:', err)
      this._selectedLifecycle = this._lifecycles.find(l => l.id === id) || null
      this._selectedStories = []
    }

    this._renderDetail()
  }

  async _handleCreate() {
    const titleInput = this.container.querySelector('.olc-create-title')
    const descInput = this.container.querySelector('.olc-create-desc')
    const title = titleInput?.value?.trim()
    if (!title) {
      titleInput?.focus()
      return
    }
    const description = descInput?.value?.trim() || ''

    try {
      await OutcomeLifecycleAPI.createLifecycle(title, description)
      this._toggleCreateForm(false)
      await this._loadLifecycles()
    } catch (err) {
      console.error('[outcome-lifecycle-plugin] Failed to create lifecycle:', err)
    }
  }

  async _handleDelete() {
    if (!this._selectedId) return
    try {
      await OutcomeLifecycleAPI.deleteLifecycle(this._selectedId)
      this._selectedId = null
      this._selectedLifecycle = null
      this._selectedStories = []
      await this._loadLifecycles()
      this._renderDetail()
    } catch (err) {
      console.error('[outcome-lifecycle-plugin] Failed to delete lifecycle:', err)
    }
  }

  async _handleStatusChange(status) {
    if (!this._selectedId || !VALID_STATUSES.includes(status)) return
    try {
      await OutcomeLifecycleAPI.updateLifecycle(this._selectedId, { status })
      this._selectedLifecycle.status = status
      await this._loadLifecycles()
      this._renderSidebar()
    } catch (err) {
      console.error('[outcome-lifecycle-plugin] Failed to update status:', err)
    }
  }

  async _handleMapStory() {
    const input = this.container.querySelector('.olc-map-story-input')
    const storyId = input?.value?.trim()
    if (!storyId || !this._selectedId) return
    try {
      await OutcomeLifecycleAPI.mapStory(this._selectedId, storyId)
      input.value = ''
      await this._selectLifecycle(this._selectedId)
    } catch (err) {
      console.error('[outcome-lifecycle-plugin] Failed to map story:', err)
    }
  }

  async _handleUnmapStory(storyId) {
    if (!this._selectedId) return
    try {
      await OutcomeLifecycleAPI.unmapStory(this._selectedId, storyId)
      // Force re-select to re-render
      const id = this._selectedId
      this._selectedId = null
      await this._selectLifecycle(id)
    } catch (err) {
      console.error('[outcome-lifecycle-plugin] Failed to unmap story:', err)
    }
  }

  async _handleAddDependency() {
    const select = this.container.querySelector('.olc-add-dep-select')
    const depId = select?.value
    if (!depId || !this._selectedId) return
    try {
      await OutcomeLifecycleAPI.addDependency(this._selectedId, depId)
      const id = this._selectedId
      this._selectedId = null
      await this._loadLifecycles()
      await this._selectLifecycle(id)
      if (this._dagVisible && this._dagRenderer) await this._dagRenderer.refresh()
    } catch (err) {
      console.error('[outcome-lifecycle-plugin] Failed to add dependency:', err)
    }
  }

  async _handleRemoveDependency(depId) {
    if (!this._selectedId) return
    try {
      await OutcomeLifecycleAPI.removeDependency(this._selectedId, depId)
      const id = this._selectedId
      this._selectedId = null
      await this._loadLifecycles()
      await this._selectLifecycle(id)
      if (this._dagVisible && this._dagRenderer) await this._dagRenderer.refresh()
    } catch (err) {
      console.error('[outcome-lifecycle-plugin] Failed to remove dependency:', err)
    }
  }

  /* ---------- DAG Visualization ---------- */

  async _toggleDag() {
    this._dagVisible = !this._dagVisible
    const section = this.container.querySelector('.olc-dag-section')
    if (!section) return

    section.classList.toggle('olc-hidden', !this._dagVisible)
    section.setAttribute('aria-hidden', String(!this._dagVisible))

    if (this._dagVisible) {
      const host = section.querySelector('.olc-dag-host')
      if (!this._dagRenderer) {
        this._dagRenderer = new DAGRenderer(host, {
          onNodeClick: (id) => this._selectLifecycle(id)
        })
      }
      await this._dagRenderer.render()
    }
  }

  /* ---------- UI Helpers ---------- */

  _toggleCreateForm(show) {
    this._showCreateForm = show
    if (this._createFormEl) {
      this._createFormEl.classList.toggle('olc-hidden', !show)
      this._createFormEl.setAttribute('aria-hidden', String(!show))
      if (show) {
        const titleInput = this._createFormEl.querySelector('.olc-create-title')
        if (titleInput) {
          titleInput.value = ''
          titleInput.focus()
        }
        const descInput = this._createFormEl.querySelector('.olc-create-desc')
        if (descInput) descInput.value = ''
      }
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  _formatDate(dateStr) {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return dateStr
    }
  }

  /* ---------- Lifecycle ---------- */

  onActivate() {
    this._loadLifecycles()
  }

  onDeactivate() {}

  destroy() {
    if (this._dagRenderer) {
      this._dagRenderer.destroy()
      this._dagRenderer = null
    }
    for (const [event, handler, target] of this._eventListeners) {
      (target || this.container).removeEventListener(event, handler)
    }
    this._eventListeners = []
    if (this.container) this.container.innerHTML = ''
  }
}

export { OutcomeLifecycleAPI, OutcomeLifecycleView, DAGRenderer }
export default OutcomeLifecycleView
