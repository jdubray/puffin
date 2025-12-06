/**
 * Project Form Component
 *
 * Handles the project configuration form including:
 * - Project name and description
 * - Assumptions list
 * - Technical architecture
 * - Data model
 * - Claude guidance options
 *
 * Now uses config state from .puffin/config.json
 */

export class ProjectFormComponent {
  constructor(intents) {
    this.intents = intents
    this.form = null
    this.assumptionsList = null
    this.assumptions = []
  }

  /**
   * Initialize the component
   */
  init() {
    this.form = document.getElementById('config-form')
    this.assumptionsList = document.getElementById('assumptions-list')

    if (!this.form) {
      console.error('Config form not found')
      return
    }

    this.bindEvents()
    this.subscribeToState()
  }

  /**
   * Bind DOM events
   */
  bindEvents() {
    // Form submit
    this.form.addEventListener('submit', (e) => {
      e.preventDefault()
      this.handleSubmit()
    })

    // Add assumption button
    const addBtn = document.getElementById('add-assumption-btn')
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.addAssumption()
      })
    }

    // Input changes trigger config update
    const inputs = this.form.querySelectorAll('input, textarea, select')
    inputs.forEach(input => {
      input.addEventListener('change', () => {
        this.handleInputChange()
      })
    })
  }

  /**
   * Subscribe to state changes
   */
  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      const { state } = e.detail
      this.render(state)
    })
  }

  /**
   * Render component based on state
   */
  render(state) {
    if (!this.form) return

    // Populate form with config data
    this.populateForm(state.config)
  }

  /**
   * Populate form with config data
   */
  populateForm(config) {
    if (!config) return

    const nameInput = document.getElementById('project-name-input')
    const descInput = document.getElementById('project-description')
    const techArchInput = document.getElementById('technical-architecture')
    const dataModelInput = document.getElementById('data-model')

    if (nameInput) nameInput.value = config.name || ''
    if (descInput) descInput.value = config.description || ''
    if (techArchInput) techArchInput.value = config.technicalArchitecture || ''
    if (dataModelInput) dataModelInput.value = config.dataModel || ''

    // Options
    const options = config.options || {}
    const progStyle = document.getElementById('programming-style')
    const testApproach = document.getElementById('testing-approach')
    const docLevel = document.getElementById('documentation-level')
    const errHandling = document.getElementById('error-handling')
    const namingConv = document.getElementById('naming-convention')
    const commentStyle = document.getElementById('comment-style')

    if (progStyle) progStyle.value = options.programmingStyle || 'HYBRID'
    if (testApproach) testApproach.value = options.testingApproach || 'TDD'
    if (docLevel) docLevel.value = options.documentationLevel || 'STANDARD'
    if (errHandling) errHandling.value = options.errorHandling || 'EXCEPTIONS'

    if (options.codeStyle) {
      if (namingConv) namingConv.value = options.codeStyle.naming || 'CAMEL'
      if (commentStyle) commentStyle.value = options.codeStyle.comments || 'JSDoc'
    }

    // Assumptions
    this.assumptions = config.assumptions || []
    this.renderAssumptions()
  }

  /**
   * Handle form submission
   */
  handleSubmit() {
    const formData = this.getFormData()

    // Update config (auto-persisted to .puffin/config.json)
    this.intents.updateConfig(formData)

    this.showSuccess('Configuration saved')
  }

  /**
   * Get form data as object
   */
  getFormData() {
    return {
      name: document.getElementById('project-name-input').value.trim(),
      description: document.getElementById('project-description').value.trim(),
      assumptions: this.assumptions.filter(a => a.trim()),
      technicalArchitecture: document.getElementById('technical-architecture').value.trim(),
      dataModel: document.getElementById('data-model').value.trim(),
      options: {
        programmingStyle: document.getElementById('programming-style').value,
        testingApproach: document.getElementById('testing-approach').value,
        documentationLevel: document.getElementById('documentation-level').value,
        errorHandling: document.getElementById('error-handling').value,
        codeStyle: {
          naming: document.getElementById('naming-convention').value,
          comments: document.getElementById('comment-style').value
        }
      }
    }
  }

  /**
   * Handle input changes (auto-update config)
   */
  handleInputChange() {
    const formData = this.getFormData()
    this.intents.updateConfig(formData)
  }

  /**
   * Add a new assumption input
   */
  addAssumption(value = '') {
    this.assumptions.push(value)
    this.renderAssumptions()

    // Focus the new input
    const inputs = this.assumptionsList.querySelectorAll('input')
    if (inputs.length > 0) {
      inputs[inputs.length - 1].focus()
    }
  }

  /**
   * Remove an assumption
   */
  removeAssumption(index) {
    this.assumptions.splice(index, 1)
    this.renderAssumptions()
    this.handleInputChange()
  }

  /**
   * Update assumption value
   */
  updateAssumption(index, value) {
    this.assumptions[index] = value
  }

  /**
   * Render assumptions list
   */
  renderAssumptions() {
    this.assumptionsList.innerHTML = ''

    this.assumptions.forEach((assumption, index) => {
      const item = document.createElement('div')
      item.className = 'list-item'
      item.innerHTML = `
        <input type="text" value="${this.escapeHtml(assumption)}"
               placeholder="Enter assumption..."
               data-index="${index}">
        <button type="button" class="remove-btn" data-index="${index}">×</button>
      `
      this.assumptionsList.appendChild(item)
    })

    // Bind events for new inputs
    this.assumptionsList.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index)
        this.updateAssumption(index, e.target.value)
      })

      input.addEventListener('blur', () => {
        this.handleInputChange()
      })
    })

    this.assumptionsList.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index)
        this.removeAssumption(index)
      })
    })
  }

  /**
   * Show error message
   */
  showError(message) {
    const container = document.getElementById('toast-container')
    if (!container) return
    const toast = document.createElement('div')
    toast.className = 'toast error'
    toast.textContent = message
    container.appendChild(toast)
    setTimeout(() => toast.remove(), 3000)
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    const container = document.getElementById('toast-container')
    if (!container) return
    const toast = document.createElement('div')
    toast.className = 'toast success'
    toast.textContent = message
    container.appendChild(toast)
    setTimeout(() => toast.remove(), 3000)
  }

  /**
   * Escape HTML to prevent XSS
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
   * Format date for display
   */
  formatDate(timestamp) {
    const date = new Date(timestamp)
    return date.toLocaleDateString()
  }

  /**
   * Cleanup
   */
  destroy() {
    // Remove event listeners if needed
  }
}
