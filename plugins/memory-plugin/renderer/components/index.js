/**
 * Memory Plugin - Renderer Entry Point
 *
 * Provides a branch memory browser UI and IPC wrapper API.
 *
 * @module memory-plugin/renderer
 */

const PLUGIN_NAME = 'memory-plugin'

/**
 * IPC wrapper API for memory operations
 * Uses window.puffin.plugins.invoke(pluginName, action, args)
 * which maps to channel: plugin:{pluginName}:{action}
 */
const MemoryAPI = {
  async memorize(branchId) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'memorize', { branchId })
  },
  async getBranchMemory(branchId) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'get-branch-memory', { branchId })
  },
  async clearBranchMemory(branchId) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'clear-branch-memory', { branchId })
  },
  async listBranches() {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'list-branches')
  },
  async runMaintenance(type) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'run-maintenance', { type })
  }
}

/**
 * MemoryView - Branch memory browser
 *
 * Lists all memorized branches in a sidebar, displays selected branch
 * memory content in a detail pane.
 */
class MemoryView {
  constructor(element, options = {}) {
    this.container = element
    this.options = options

    // State
    this.branches = []
    this.selectedBranch = null
    this.branchContent = null
    this.loading = true
    this.error = null
    this.detailLoading = false
  }

  async init() {
    this.container.className = 'memory-plugin-view'
    this.injectStyles()
    this.render()
    await this.fetchBranches()
  }

  async fetchBranches() {
    this.loading = true
    this.error = null
    this.render()

    try {
      const result = await MemoryAPI.listBranches()
      if (!result.success) throw new Error(result.error || 'Failed to list branches')
      this.branches = (result.branches || []).sort()
    } catch (err) {
      this.error = err.message
    }

    this.loading = false
    this.render()
  }

  async selectBranch(branchId) {
    this.selectedBranch = branchId
    this.branchContent = null
    this.detailLoading = true
    this.render()

    try {
      const result = await MemoryAPI.getBranchMemory(branchId)
      // Bridge returns result.data: { parsed, raw } for existing branches,
      // or the full response object { exists: false, ... } for missing ones.
      if (!result || result.exists === false) {
        this.branchContent = null
      } else {
        this.branchContent = result.raw || JSON.stringify(result.parsed, null, 2) || 'Empty memory file'
      }
    } catch (err) {
      this.branchContent = `Error: ${err.message}`
    }

    this.detailLoading = false
    this.render()
  }

  render() {
    if (!this.container) return
    this.container.innerHTML = ''

    if (this.loading) {
      this.container.innerHTML = `
        <div class="mem-loading">
          <p>Loading branch memories...</p>
        </div>`
      return
    }

    if (this.error) {
      this.container.innerHTML = `
        <div class="mem-error">
          <p>${this.escapeHtml(this.error)}</p>
          <button class="mem-btn mem-retry-btn">Retry</button>
        </div>`
      this.container.querySelector('.mem-retry-btn')
        ?.addEventListener('click', () => this.fetchBranches())
      return
    }

    // Main layout: sidebar + detail
    const wrapper = document.createElement('div')
    wrapper.className = 'mem-layout'

    // Sidebar
    const sidebar = document.createElement('div')
    sidebar.className = 'mem-sidebar'

    const header = document.createElement('div')
    header.className = 'mem-sidebar-header'
    header.innerHTML = `
      <h3>Branch Memories</h3>
      <span class="mem-count">${this.branches.length}</span>`
    sidebar.appendChild(header)

    if (this.branches.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'mem-empty'
      empty.textContent = 'No memorized branches yet.'
      sidebar.appendChild(empty)
    } else {
      const list = document.createElement('ul')
      list.className = 'mem-branch-list'
      for (const branch of this.branches) {
        const li = document.createElement('li')
        li.className = 'mem-branch-item' + (branch === this.selectedBranch ? ' mem-selected' : '')
        li.textContent = branch
        li.addEventListener('click', () => this.selectBranch(branch))
        list.appendChild(li)
      }
      sidebar.appendChild(list)
    }

    const refreshBtn = document.createElement('button')
    refreshBtn.className = 'mem-btn mem-refresh-btn'
    refreshBtn.textContent = 'Refresh'
    refreshBtn.addEventListener('click', () => this.fetchBranches())
    sidebar.appendChild(refreshBtn)

    wrapper.appendChild(sidebar)

    // Detail pane
    const detail = document.createElement('div')
    detail.className = 'mem-detail'

    if (!this.selectedBranch) {
      detail.innerHTML = '<p class="mem-placeholder">Select a branch to view its memory.</p>'
    } else if (this.detailLoading) {
      detail.innerHTML = '<p class="mem-placeholder">Loading...</p>'
    } else if (this.branchContent === null) {
      detail.innerHTML = `<p class="mem-placeholder">No memory file for "${this.escapeHtml(this.selectedBranch)}".</p>`
    } else {
      const pre = document.createElement('pre')
      pre.className = 'mem-content'
      pre.textContent = this.branchContent
      detail.appendChild(pre)
    }

    wrapper.appendChild(detail)
    this.container.appendChild(wrapper)
  }

  escapeHtml(str) {
    const div = document.createElement('div')
    div.appendChild(document.createTextNode(str))
    return div.innerHTML
  }

  injectStyles() {
    if (document.getElementById('memory-plugin-styles')) return
    const style = document.createElement('style')
    style.id = 'memory-plugin-styles'
    style.textContent = `
      .memory-plugin-view { height: 100%; display: flex; flex-direction: column; }
      .mem-loading, .mem-error { padding: 2rem; text-align: center; }
      .mem-error { color: var(--error-color, #e74c3c); }
      .mem-layout { display: flex; height: 100%; overflow: hidden; }
      .mem-sidebar {
        width: 260px; min-width: 200px;
        border-right: 1px solid var(--border-color, #333);
        display: flex; flex-direction: column;
        overflow-y: auto;
      }
      .mem-sidebar-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--border-color, #333);
      }
      .mem-sidebar-header h3 { margin: 0; font-size: 0.9rem; }
      .mem-count {
        background: var(--badge-bg, #555); color: var(--badge-fg, #fff);
        border-radius: 10px; padding: 0.1rem 0.5rem; font-size: 0.75rem;
      }
      .mem-branch-list { list-style: none; margin: 0; padding: 0; flex: 1; overflow-y: auto; }
      .mem-branch-item {
        padding: 0.5rem 1rem; cursor: pointer; font-size: 0.85rem;
        border-bottom: 1px solid var(--border-color, #222);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .mem-branch-item:hover { background: var(--hover-bg, #2a2a2a); }
      .mem-branch-item.mem-selected { background: var(--active-bg, #1a3a5c); font-weight: 600; }
      .mem-empty { padding: 1rem; color: var(--muted-color, #888); font-size: 0.85rem; }
      .mem-detail { flex: 1; overflow-y: auto; padding: 1rem; }
      .mem-placeholder { color: var(--muted-color, #888); }
      .mem-content {
        white-space: pre-wrap; word-wrap: break-word;
        font-size: 0.85rem; line-height: 1.5;
        font-family: var(--mono-font, 'Consolas', monospace);
      }
      .mem-btn {
        padding: 0.4rem 0.8rem; cursor: pointer; border: none;
        background: var(--btn-bg, #333); color: var(--btn-fg, #ccc);
        border-radius: 4px; font-size: 0.8rem; margin: 0.5rem;
      }
      .mem-btn:hover { background: var(--btn-hover-bg, #444); }
      .mem-refresh-btn { align-self: center; margin: 0.75rem; }
    `
    document.head.appendChild(style)
  }

  onActivate() {}
  onDeactivate() {}

  destroy() {
    if (this.container) this.container.innerHTML = ''
  }
}

export { MemoryAPI, MemoryView }
export default MemoryView
