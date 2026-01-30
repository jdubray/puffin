/**
 * Memory Plugin - Renderer Entry Point
 *
 * Provides IPC wrapper API for invoking memory operations from the renderer.
 * UI components can use MemoryAPI to trigger memorization, read branch memory,
 * and manage maintenance without knowing IPC channel details.
 *
 * @module memory-plugin/renderer
 */

const CHANNEL = 'memory-plugin'

/**
 * IPC wrapper API for memory operations
 */
const MemoryAPI = {
  /**
   * Trigger knowledge extraction for a branch
   * @param {string} branchId
   * @returns {Promise<Object>} Result with status, extractions count, etc.
   */
  async memorize(branchId) {
    return window.api.invoke(`${CHANNEL}:memorize`, { branchId })
  },

  /**
   * Get the memory file for a branch
   * @param {string} branchId
   * @returns {Promise<Object>} { success, exists, data, raw }
   */
  async getBranchMemory(branchId) {
    return window.api.invoke(`${CHANNEL}:get-branch-memory`, { branchId })
  },

  /**
   * Delete a branch's memory file
   * @param {string} branchId
   * @returns {Promise<Object>} { success, deleted }
   */
  async clearBranchMemory(branchId) {
    return window.api.invoke(`${CHANNEL}:clear-branch-memory`, { branchId })
  },

  /**
   * List all branches that have memory files
   * @returns {Promise<Object>} { success, branches: string[] }
   */
  async listBranches() {
    return window.api.invoke(`${CHANNEL}:list-branches`)
  },

  /**
   * Run maintenance (weekly, monthly, or full)
   * @param {'weekly'|'monthly'|'full'} type
   * @returns {Promise<Object>} { success, ran, skipped }
   */
  async runMaintenance(type) {
    return window.api.invoke(`${CHANNEL}:run-maintenance`, { type })
  }
}

/**
 * MemoryView - Placeholder view component
 * Will be expanded in future sprints with a full UI for browsing/managing branch memory.
 */
class MemoryView {
  constructor(container) {
    this.container = container
    this.element = null
  }

  render() {
    this.element = document.createElement('div')
    this.element.className = 'memory-plugin-view'
    this.element.innerHTML = '<p>Memory Plugin — use MemoryAPI from other components.</p>'
    this.container.appendChild(this.element)
  }

  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
    }
    this.element = null
  }
}

export { MemoryAPI, MemoryView }
export default MemoryView
