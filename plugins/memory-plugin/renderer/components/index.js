/**
 * Memory Plugin - Renderer Entry Point
 *
 * Displays the Claude Code memory sections stored in each
 * .claude/CLAUDE_{branch}.md file via the IPC bridge.
 *
 * @module memory-plugin/renderer
 */

const PLUGIN_NAME = 'memory-plugin'

/**
 * IPC wrapper — maps to channel: plugin:{pluginName}:{action}
 */
const MemoryAPI = {
  async listBranches() {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'list-branches')
  },
  async getBranchMemory(branchId) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'get-branch-memory', { branchId })
  },
  async clearBranchMemory(branchId) {
    return window.puffin.plugins.invoke(PLUGIN_NAME, 'clear-branch-memory', { branchId })
  }
}

/**
 * MemoryView - Claude Code memory browser
 *
 * Lists branches that have Claude Code /memory entries in the sidebar.
 * Clicking a branch shows the raw memory content in the detail pane.
 * A "Clear" button removes the entry from the branch file.
 */
class MemoryView {
  constructor(element, options = {}) {
    this.container = element
    this.options = options

    this.branches = []
    this.selectedBranch = null
    this.selectedContent = null
    this.loading = true
    this.detailLoading = false
    this.error = null
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
      this.branches = result.branches || []
    } catch (err) {
      this.error = err.message
    }

    this.loading = false
    this.render()
  }

  async selectBranch(branchId) {
    this.selectedBranch = branchId
    this.selectedContent = null
    this.detailLoading = true
    this.render()

    try {
      const result = await MemoryAPI.getBranchMemory(branchId)
      this.selectedContent = result.content || null
    } catch (err) {
      this.selectedContent = `Error: ${err.message}`
    }

    this.detailLoading = false
    this.render()
  }

  async clearBranch(branchId) {
    try {
      await MemoryAPI.clearBranchMemory(branchId)
      // Refresh — branch may disappear from list if it had no other content
      if (this.selectedBranch === branchId) {
        this.selectedBranch = null
        this.selectedContent = null
      }
      await this.fetchBranches()
    } catch (err) {
      this.error = `Clear failed: ${err.message}`
      this.render()
    }
  }

  render() {
    if (!this.container) return
    this.container.innerHTML = ''

    if (this.loading) {
      this.container.innerHTML = `<div class="mem-loading"><p>Loading Claude Code memories...</p></div>`
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

    const wrapper = document.createElement('div')
    wrapper.className = 'mem-layout'

    // ── Sidebar ──────────────────────────────────────────────────────────────
    const sidebar = document.createElement('div')
    sidebar.className = 'mem-sidebar'

    const header = document.createElement('div')
    header.className = 'mem-sidebar-header'
    header.innerHTML = `
      <h3>Claude Code Memory</h3>
      <span class="mem-count">${this.branches.length}</span>`
    sidebar.appendChild(header)

    if (this.branches.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'mem-empty'
      empty.textContent = 'No Claude Code memory entries yet. Use /memory in a session to add some.'
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

    // ── Detail pane ──────────────────────────────────────────────────────────
    const detail = document.createElement('div')
    detail.className = 'mem-detail'

    if (!this.selectedBranch) {
      detail.innerHTML = '<p class="mem-placeholder">Select a branch to view its Claude Code memory.</p>'
    } else if (this.detailLoading) {
      detail.innerHTML = '<p class="mem-placeholder">Loading...</p>'
    } else if (!this.selectedContent) {
      detail.innerHTML = `<p class="mem-placeholder">No Claude Code memory for "${this.escapeHtml(this.selectedBranch)}".</p>`
    } else {
      const toolbar = document.createElement('div')
      toolbar.className = 'mem-detail-toolbar'

      const branchLabel = document.createElement('span')
      branchLabel.className = 'mem-detail-branch'
      branchLabel.textContent = this.selectedBranch
      toolbar.appendChild(branchLabel)

      const clearBtn = document.createElement('button')
      clearBtn.className = 'mem-btn mem-clear-btn'
      clearBtn.textContent = 'Clear'
      clearBtn.title = 'Remove Claude Code memory for this branch'
      clearBtn.addEventListener('click', () => this.clearBranch(this.selectedBranch))
      toolbar.appendChild(clearBtn)

      detail.appendChild(toolbar)

      const pre = document.createElement('pre')
      pre.className = 'mem-content'
      pre.textContent = this.selectedContent
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
        width: 220px; min-width: 160px;
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
      .mem-empty {
        padding: 1rem; color: var(--muted-color, #888);
        font-size: 0.8rem; line-height: 1.4;
      }
      .mem-detail { flex: 1; overflow-y: auto; padding: 0; display: flex; flex-direction: column; }
      .mem-detail-toolbar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0.5rem 1rem;
        border-bottom: 1px solid var(--border-color, #333);
        background: var(--panel-bg, #1a1a1a);
      }
      .mem-detail-branch { font-size: 0.85rem; font-weight: 600; }
      .mem-placeholder { padding: 1rem; color: var(--muted-color, #888); }
      .mem-content {
        padding: 1rem;
        white-space: pre-wrap; word-wrap: break-word;
        font-size: 0.85rem; line-height: 1.5;
        font-family: var(--mono-font, 'Consolas', monospace);
        flex: 1;
      }
      .mem-btn {
        padding: 0.4rem 0.8rem; cursor: pointer; border: none;
        background: var(--btn-bg, #333); color: var(--btn-fg, #ccc);
        border-radius: 4px; font-size: 0.8rem;
      }
      .mem-btn:hover { background: var(--btn-hover-bg, #444); }
      .mem-clear-btn { background: var(--danger-btn-bg, #5a1a1a); color: var(--danger-btn-fg, #f88); }
      .mem-clear-btn:hover { background: var(--danger-btn-hover, #7a2a2a); }
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
