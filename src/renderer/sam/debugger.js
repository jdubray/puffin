/**
 * Puffin SAM Debugger
 *
 * Provides debugging capabilities for the SAM pattern:
 * - Action history with timestamps
 * - State snapshots
 * - Control state visualization
 * - Time travel (restore previous states)
 */

/**
 * SAM Debugger class
 * Wraps SAM actions to log and enable time travel
 */
export class SAMDebugger {
  constructor() {
    this.history = []
    this.maxHistory = 100
    this.currentIndex = -1
    this.isTimeTraveling = false
    this.listeners = new Set()
    this.enabled = true
  }

  /**
   * Record an action and its resulting state
   * @param {string} actionType - The action type
   * @param {Object} proposal - The action proposal/payload
   * @param {Object} modelSnapshot - Snapshot of the model after the action
   * @param {Object} stateSnapshot - Snapshot of the computed state
   */
  recordAction(actionType, proposal, modelSnapshot, stateSnapshot) {
    if (!this.enabled || this.isTimeTraveling) return

    // Create a lightweight model snapshot — exclude large transient fields
    // to prevent OOM from cloning accumulated streaming content and full history
    const liteModel = this.lightweightClone(modelSnapshot)
    const liteState = this.lightweightClone(stateSnapshot)

    const entry = {
      id: this.history.length,
      timestamp: Date.now(),
      actionType,
      proposal: this.deepClone(proposal),
      model: liteModel,
      state: liteState,
      controlStates: this.extractControlStates(modelSnapshot)
    }

    // If we're not at the end of history, truncate future
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1)
    }

    this.history.push(entry)
    this.currentIndex = this.history.length - 1

    // Trim history if too long
    if (this.history.length > this.maxHistory) {
      this.history.shift()
      this.currentIndex--
    }

    this.notifyListeners()
  }

  /**
   * Extract control states from the model
   * @param {Object} model
   * @returns {Object}
   */
  extractControlStates(model) {
    return {
      appState: model.appState || 'UNKNOWN',
      projectState: model.projectState || 'UNKNOWN',
      promptState: model.promptState || 'UNKNOWN',
      // Derived control state flags
      flags: {
        isInitialized: model.initialized,
        hasProject: !!model.project,
        hasUnsavedChanges: model.hasUnsavedChanges,
        isProcessing: !!model.pendingPromptId,
        hasError: !!model.appError
      }
    }
  }

  /**
   * Get the current history
   * @returns {Array}
   */
  getHistory() {
    return this.history
  }

  /**
   * Get current entry
   * @returns {Object|null}
   */
  getCurrentEntry() {
    return this.history[this.currentIndex] || null
  }

  /**
   * Get entry at specific index
   * @param {number} index
   * @returns {Object|null}
   */
  getEntry(index) {
    return this.history[index] || null
  }

  /**
   * Time travel to a specific point in history
   * @param {number} index - History index to travel to
   * @returns {Object|null} - The model state at that point
   */
  travelTo(index) {
    if (index < 0 || index >= this.history.length) {
      return null
    }

    this.currentIndex = index
    this.isTimeTraveling = true
    this.notifyListeners()

    return this.history[index].model
  }

  /**
   * Resume from current point (exit time travel mode)
   */
  resume() {
    this.isTimeTraveling = false
    this.currentIndex = this.history.length - 1
    this.notifyListeners()
  }

  /**
   * Step back one action
   * @returns {Object|null}
   */
  stepBack() {
    if (this.currentIndex > 0) {
      return this.travelTo(this.currentIndex - 1)
    }
    return null
  }

  /**
   * Step forward one action
   * @returns {Object|null}
   */
  stepForward() {
    if (this.currentIndex < this.history.length - 1) {
      return this.travelTo(this.currentIndex + 1)
    }
    return null
  }

  /**
   * Clear history
   */
  clear() {
    this.history = []
    this.currentIndex = -1
    this.isTimeTraveling = false
    this.notifyListeners()
  }

  /**
   * Subscribe to debugger updates
   * @param {Function} listener
   * @returns {Function} unsubscribe function
   */
  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Notify all listeners of changes
   */
  notifyListeners() {
    const data = {
      history: this.history,
      currentIndex: this.currentIndex,
      isTimeTraveling: this.isTimeTraveling,
      currentEntry: this.getCurrentEntry()
    }
    this.listeners.forEach(listener => listener(data))
  }

  /**
   * Enable/disable the debugger
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled
  }

  /**
   * Export history as JSON
   * @returns {string}
   */
  exportHistory() {
    return JSON.stringify({
      exportedAt: Date.now(),
      history: this.history
    }, null, 2)
  }

  /**
   * Import history from JSON
   * @param {string} json
   */
  importHistory(json) {
    try {
      const data = JSON.parse(json)
      this.history = data.history || []
      this.currentIndex = this.history.length - 1
      this.notifyListeners()
    } catch (e) {
      console.error('Failed to import history:', e)
    }
  }

  /**
   * Create a lightweight clone of a model/state snapshot.
   * Truncates large string fields and omits heavy nested data
   * (e.g. full branch prompt arrays, streaming content) to prevent OOM.
   * @private
   */
  lightweightClone(obj) {
    const MAX_STRING_LEN = 500
    const HEAVY_KEYS = new Set(['prompts', 'rawMessages', 'messages', 'streamBuffer'])

    const trimmed = this._liteClone(obj, MAX_STRING_LEN, HEAVY_KEYS, 0)
    return trimmed
  }

  /** @private */
  _liteClone(value, maxStr, heavyKeys, depth) {
    if (value === null || value === undefined) return value
    if (typeof value === 'number' || typeof value === 'boolean') return value
    if (typeof value === 'string') {
      return value.length > maxStr ? value.slice(0, maxStr) + `...[${value.length} chars]` : value
    }
    // Prevent excessively deep cloning
    if (depth > 6) return '[depth limit]'

    if (Array.isArray(value)) {
      // For large arrays, just record length
      if (value.length > 20) {
        return `[Array(${value.length})]`
      }
      return value.map(item => this._liteClone(item, maxStr, heavyKeys, depth + 1))
    }

    if (typeof value === 'object') {
      const out = {}
      for (const key of Object.keys(value)) {
        if (heavyKeys.has(key)) {
          const v = value[key]
          out[key] = Array.isArray(v) ? `[Array(${v.length})]` : `[${typeof v}]`
        } else {
          out[key] = this._liteClone(value[key], maxStr, heavyKeys, depth + 1)
        }
      }
      return out
    }

    return String(value)
  }

  /**
   * Deep clone an object (handles circular references)
   * @private
   */
  deepClone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj))
    } catch (e) {
      // Handle circular references
      return this.safeClone(obj)
    }
  }

  /**
   * Safe clone that handles circular references
   * @private
   */
  safeClone(obj, seen = new WeakMap()) {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    if (seen.has(obj)) {
      return '[Circular]'
    }

    seen.set(obj, true)

    if (Array.isArray(obj)) {
      return obj.map(item => this.safeClone(item, seen))
    }

    const cloned = {}
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.safeClone(obj[key], seen)
      }
    }
    return cloned
  }

  /**
   * Get a diff between two states
   * @param {number} fromIndex
   * @param {number} toIndex
   * @returns {Object}
   */
  getDiff(fromIndex, toIndex) {
    const from = this.history[fromIndex]
    const to = this.history[toIndex]

    if (!from || !to) return null

    return {
      action: to.actionType,
      changes: this.computeDiff(from.model, to.model)
    }
  }

  /**
   * Compute differences between two objects
   * @private
   */
  computeDiff(obj1, obj2, path = '') {
    const changes = []

    const keys = new Set([
      ...Object.keys(obj1 || {}),
      ...Object.keys(obj2 || {})
    ])

    for (const key of keys) {
      const fullPath = path ? `${path}.${key}` : key
      const val1 = obj1?.[key]
      const val2 = obj2?.[key]

      if (val1 === val2) continue

      if (typeof val1 === 'object' && typeof val2 === 'object' &&
          val1 !== null && val2 !== null && !Array.isArray(val1)) {
        changes.push(...this.computeDiff(val1, val2, fullPath))
      } else {
        changes.push({
          path: fullPath,
          from: val1,
          to: val2
        })
      }
    }

    return changes
  }
}

// Singleton instance
export const samDebugger = new SAMDebugger()

// Expose globally for console access
if (typeof window !== 'undefined') {
  window.__SAM_DEBUGGER__ = samDebugger
}
