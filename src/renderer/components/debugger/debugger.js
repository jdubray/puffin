/**
 * SAM Debugger UI Component
 *
 * Provides a visual interface for:
 * - Viewing action history
 * - Inspecting state at each step
 * - Viewing control states
 * - Time travel navigation
 */

import { samDebugger } from '../../sam/debugger.js'

export class DebuggerComponent {
  constructor(intents) {
    this.intents = intents
    this.container = null
    this.isVisible = false
    this.selectedEntry = null
    this.unsubscribe = null
  }

  /**
   * Initialize the component
   */
  init() {
    this.createContainer()
    this.bindEvents()
    this.subscribeToDebugger()
  }

  /**
   * Create the debugger container
   */
  createContainer() {
    this.container = document.createElement('div')
    this.container.id = 'sam-debugger'
    this.container.className = 'sam-debugger hidden'
    this.container.innerHTML = this.getTemplate()
    document.body.appendChild(this.container)
  }

  /**
   * Get the component template
   */
  getTemplate() {
    return `
      <div class="debugger-header">
        <h3>SAM Debugger</h3>
        <div class="debugger-controls">
          <button id="debugger-step-back" class="debugger-btn" title="Step Back">◀</button>
          <button id="debugger-step-forward" class="debugger-btn" title="Step Forward">▶</button>
          <button id="debugger-resume" class="debugger-btn" title="Resume">⏵</button>
          <span id="debugger-position" class="debugger-position">0/0</span>
          <button id="debugger-clear" class="debugger-btn" title="Clear History">🗑</button>
          <button id="debugger-export" class="debugger-btn" title="Export">📤</button>
          <button id="debugger-close" class="debugger-btn close" title="Close">×</button>
        </div>
      </div>

      <div class="debugger-body">
        <div class="debugger-panel debugger-actions">
          <h4>Action History</h4>
          <ul id="debugger-action-list" class="action-list">
            <!-- Actions rendered dynamically -->
          </ul>
        </div>

        <div class="debugger-panel debugger-state">
          <div class="state-tabs">
            <button class="state-tab active" data-tab="control">Control States</button>
            <button class="state-tab" data-tab="model">Model</button>
            <button class="state-tab" data-tab="diff">Diff</button>
          </div>

          <div id="state-content-control" class="state-content active">
            <div id="control-states" class="control-states">
              <!-- Control states rendered dynamically -->
            </div>
          </div>

          <div id="state-content-model" class="state-content">
            <pre id="model-json" class="json-view"></pre>
          </div>

          <div id="state-content-diff" class="state-content">
            <div id="state-diff" class="diff-view">
              <!-- Diff rendered dynamically -->
            </div>
          </div>
        </div>
      </div>

      <div class="debugger-footer">
        <span id="debugger-status" class="debugger-status">Ready</span>
        <label class="time-travel-indicator">
          <input type="checkbox" id="time-travel-mode" disabled>
          Time Travel Mode
        </label>
      </div>
    `
  }

  /**
   * Bind event handlers
   */
  bindEvents() {
    // Navigation controls
    document.getElementById('debugger-step-back').addEventListener('click', () => {
      samDebugger.stepBack()
    })

    document.getElementById('debugger-step-forward').addEventListener('click', () => {
      samDebugger.stepForward()
    })

    document.getElementById('debugger-resume').addEventListener('click', () => {
      samDebugger.resume()
    })

    document.getElementById('debugger-clear').addEventListener('click', () => {
      if (confirm('Clear all action history?')) {
        samDebugger.clear()
      }
    })

    document.getElementById('debugger-export').addEventListener('click', () => {
      this.exportHistory()
    })

    document.getElementById('debugger-close').addEventListener('click', () => {
      this.hide()
    })

    // Tab switching
    this.container.querySelectorAll('.state-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab)
      })
    })

    // Keyboard shortcut to toggle debugger
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Shift + D
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        this.toggle()
      }
    })
  }

  /**
   * Subscribe to debugger updates
   */
  subscribeToDebugger() {
    this.unsubscribe = samDebugger.subscribe((data) => {
      this.render(data)
    })
  }

  /**
   * Render the debugger state
   */
  render(data) {
    this.renderActionList(data.history, data.currentIndex)
    this.renderPosition(data.currentIndex, data.history.length)
    this.renderTimeTravelIndicator(data.isTimeTraveling)

    if (data.currentEntry) {
      this.renderControlStates(data.currentEntry.controlStates)
      this.renderModelState(data.currentEntry.model)

      // Render diff if not first entry
      if (data.currentIndex > 0) {
        const prevEntry = samDebugger.getEntry(data.currentIndex - 1)
        this.renderDiff(prevEntry, data.currentEntry)
      } else {
        this.renderDiff(null, data.currentEntry)
      }
    }
  }

  /**
   * Render action list
   */
  renderActionList(history, currentIndex) {
    const list = document.getElementById('debugger-action-list')

    list.innerHTML = history.map((entry, index) => `
      <li class="action-item ${index === currentIndex ? 'current' : ''} ${index > currentIndex ? 'future' : ''}"
          data-index="${index}">
        <span class="action-index">${index}</span>
        <span class="action-type">${entry.actionType}</span>
        <span class="action-time">${this.formatTime(entry.timestamp)}</span>
      </li>
    `).join('')

    // Add click handlers
    list.querySelectorAll('.action-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index)
        samDebugger.travelTo(index)
      })
    })

    // Scroll current item into view
    const currentItem = list.querySelector('.current')
    if (currentItem) {
      currentItem.scrollIntoView({ block: 'nearest' })
    }
  }

  /**
   * Render position indicator
   */
  renderPosition(current, total) {
    document.getElementById('debugger-position').textContent =
      `${current + 1}/${total}`
  }

  /**
   * Render time travel indicator
   */
  renderTimeTravelIndicator(isTimeTraveling) {
    const checkbox = document.getElementById('time-travel-mode')
    checkbox.checked = isTimeTraveling

    const status = document.getElementById('debugger-status')
    status.textContent = isTimeTraveling ? '⏪ Time Traveling' : 'Ready'
    status.className = `debugger-status ${isTimeTraveling ? 'time-traveling' : ''}`
  }

  /**
   * Render control states
   */
  renderControlStates(controlStates) {
    const container = document.getElementById('control-states')

    const stateClass = (value) => {
      const positive = ['SAVED', 'COMPLETED', 'PROJECT_LOADED', 'RESPONSE_READY']
      const negative = ['ERROR', 'FAILED']
      const active = ['PROCESSING', 'COMPOSING', 'PROMPTING', 'AWAITING_RESPONSE']

      if (positive.includes(value)) return 'positive'
      if (negative.includes(value)) return 'negative'
      if (active.includes(value)) return 'active'
      return ''
    }

    container.innerHTML = `
      <div class="control-state-group">
        <h5>FSM States</h5>
        <div class="state-badges">
          <div class="state-badge ${stateClass(controlStates.appState)}">
            <span class="state-label">App</span>
            <span class="state-value">${controlStates.appState}</span>
          </div>
          <div class="state-badge ${stateClass(controlStates.projectState)}">
            <span class="state-label">Project</span>
            <span class="state-value">${controlStates.projectState}</span>
          </div>
          <div class="state-badge ${stateClass(controlStates.promptState)}">
            <span class="state-label">Prompt</span>
            <span class="state-value">${controlStates.promptState}</span>
          </div>
        </div>
      </div>

      <div class="control-state-group">
        <h5>Flags</h5>
        <div class="state-flags">
          ${Object.entries(controlStates.flags).map(([key, value]) => `
            <div class="state-flag ${value ? 'on' : 'off'}">
              <span class="flag-indicator">${value ? '●' : '○'}</span>
              <span class="flag-name">${this.formatFlagName(key)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `
  }

  /**
   * Render model state as JSON
   */
  renderModelState(model) {
    const pre = document.getElementById('model-json')
    pre.textContent = JSON.stringify(model, null, 2)
  }

  /**
   * Render diff between states
   */
  renderDiff(prevEntry, currentEntry) {
    const container = document.getElementById('state-diff')

    if (!prevEntry) {
      container.innerHTML = '<p class="diff-empty">Initial state - no previous state to compare</p>'
      return
    }

    const changes = samDebugger.computeDiff(prevEntry.model, currentEntry.model, '')

    if (changes.length === 0) {
      container.innerHTML = '<p class="diff-empty">No changes</p>'
      return
    }

    container.innerHTML = `
      <div class="diff-header">
        <span class="diff-action">Action: ${currentEntry.actionType}</span>
        <span class="diff-count">${changes.length} change(s)</span>
      </div>
      <ul class="diff-list">
        ${changes.map(change => `
          <li class="diff-item">
            <span class="diff-path">${change.path}</span>
            <span class="diff-values">
              <span class="diff-from">${this.formatValue(change.from)}</span>
              <span class="diff-arrow">→</span>
              <span class="diff-to">${this.formatValue(change.to)}</span>
            </span>
          </li>
        `).join('')}
      </ul>
    `
  }

  /**
   * Switch between tabs
   */
  switchTab(tabName) {
    // Update tab buttons
    this.container.querySelectorAll('.state-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName)
    })

    // Update tab content
    this.container.querySelectorAll('.state-content').forEach(content => {
      content.classList.toggle('active', content.id === `state-content-${tabName}`)
    })
  }

  /**
   * Export history
   */
  exportHistory() {
    const json = samDebugger.exportHistory()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `puffin-debug-${Date.now()}.json`
    a.click()

    URL.revokeObjectURL(url)
  }

  /**
   * Show the debugger
   */
  show() {
    this.isVisible = true
    this.container.classList.remove('hidden')

    // Trigger initial render
    samDebugger.notifyListeners()
  }

  /**
   * Hide the debugger
   */
  hide() {
    this.isVisible = false
    this.container.classList.add('hidden')
  }

  /**
   * Toggle visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide()
    } else {
      this.show()
    }
  }

  /**
   * Format timestamp
   */
  formatTime(timestamp) {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }) + '.' + String(date.getMilliseconds()).padStart(3, '0')
  }

  /**
   * Format flag name for display
   */
  formatFlagName(name) {
    return name
      .replace(/^is/, '')
      .replace(/^has/, '')
      .replace(/([A-Z])/g, ' $1')
      .trim()
  }

  /**
   * Format value for display
   */
  formatValue(value) {
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'
    if (typeof value === 'string') return `"${value}"`
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe()
    }
    if (this.container) {
      this.container.remove()
    }
  }
}
