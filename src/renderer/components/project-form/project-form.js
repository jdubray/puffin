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
    this.pluginsList = null
    this.plugins = []
    this._initialized = false // Track if form has been populated
  }

  /**
   * Initialize the component
   */
  init() {
    this.form = document.getElementById('config-form')
    this.assumptionsList = document.getElementById('assumptions-list')
    this.pluginsList = document.getElementById('plugins-list')

    if (!this.form) {
      console.error('Config form not found')
      return
    }

    this.bindEvents()
    this.subscribeToState()
    this.loadPlugins()
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

    // Generate Claude.md button
    const generateBtn = document.getElementById('generate-claude-md-btn')
    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        this.handleGenerateClaudeMd()
      })
    }

    // Add plugin button
    const addPluginBtn = document.getElementById('add-plugin-btn')
    if (addPluginBtn) {
      addPluginBtn.addEventListener('click', () => {
        this.showAddPluginModal()
      })
    }

    // Color input synchronization (color picker <-> text input)
    this.bindColorInputs()

    // Input changes trigger config update
    const inputs = this.form.querySelectorAll('input, textarea, select')
    inputs.forEach(input => {
      input.addEventListener('change', () => {
        this.handleInputChange()
      })
    })
  }

  /**
   * Bind color input synchronization
   */
  bindColorInputs() {
    const colorPairs = [
      ['ux-color-primary', 'ux-color-primary-text'],
      ['ux-color-secondary', 'ux-color-secondary-text'],
      ['ux-color-accent', 'ux-color-accent-text'],
      ['ux-color-background', 'ux-color-background-text'],
      ['ux-color-text', 'ux-color-text-text'],
      ['ux-color-error', 'ux-color-error-text']
    ]

    colorPairs.forEach(([colorId, textId]) => {
      const colorInput = document.getElementById(colorId)
      const textInput = document.getElementById(textId)

      if (colorInput && textInput) {
        colorInput.addEventListener('input', () => {
          textInput.value = colorInput.value
        })
        textInput.addEventListener('input', () => {
          if (/^#[0-9A-Fa-f]{6}$/.test(textInput.value)) {
            colorInput.value = textInput.value
          }
        })
      }
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

    // Only populate form when config has meaningful content
    // This ensures we get the loaded config, not just an empty initial state
    const hasLoadedConfig = state.config?.name || state.config?.description || state.config?.createdAt

    // Only populate form on initial load to prevent overwriting user changes
    if (!this._initialized && hasLoadedConfig) {
      console.log('[PROJECT-FORM] Populating form with config:', state.config)
      this.populateForm(state.config)
      this._initialized = true
    }
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

    // Default model
    const defaultModel = document.getElementById('default-model')
    if (defaultModel) defaultModel.value = config.defaultModel || 'sonnet'

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

    // UX Style
    const uxStyle = config.uxStyle || {}
    const uxAlignment = document.getElementById('ux-alignment')
    const uxFontFamily = document.getElementById('ux-font-family')
    const uxFontSize = document.getElementById('ux-font-size')
    const uxBaselineCss = document.getElementById('ux-baseline-css')

    if (uxAlignment) uxAlignment.value = uxStyle.alignment || 'left'
    if (uxFontFamily) uxFontFamily.value = uxStyle.fontFamily || 'system-ui, -apple-system, sans-serif'
    if (uxFontSize) uxFontSize.value = uxStyle.fontSize || '16px'
    if (uxBaselineCss) uxBaselineCss.value = uxStyle.baselineCss || ''

    // Color palette
    const colorPalette = uxStyle.colorPalette || {}
    this.setColorInput('ux-color-primary', colorPalette.primary || '#6c63ff')
    this.setColorInput('ux-color-secondary', colorPalette.secondary || '#16213e')
    this.setColorInput('ux-color-accent', colorPalette.accent || '#48bb78')
    this.setColorInput('ux-color-background', colorPalette.background || '#ffffff')
    this.setColorInput('ux-color-text', colorPalette.text || '#1a1a2e')
    this.setColorInput('ux-color-error', colorPalette.error || '#f56565')

    // Assumptions
    this.assumptions = config.assumptions || []
    this.renderAssumptions()

    // Debug Mode
    const debugCheckbox = document.getElementById('debug-mode-checkbox')
    if (debugCheckbox) debugCheckbox.checked = config.debugMode || false
  }

  /**
   * Set color input value (both color picker and text input)
   */
  setColorInput(baseId, value) {
    const colorInput = document.getElementById(baseId)
    const textInput = document.getElementById(`${baseId}-text`)
    if (colorInput) colorInput.value = value
    if (textInput) textInput.value = value
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
      defaultModel: document.getElementById('default-model').value,
      options: {
        programmingStyle: document.getElementById('programming-style').value,
        testingApproach: document.getElementById('testing-approach').value,
        documentationLevel: document.getElementById('documentation-level').value,
        errorHandling: document.getElementById('error-handling').value,
        codeStyle: {
          naming: document.getElementById('naming-convention').value,
          comments: document.getElementById('comment-style').value
        }
      },
      uxStyle: {
        alignment: document.getElementById('ux-alignment').value,
        fontFamily: document.getElementById('ux-font-family').value,
        fontSize: document.getElementById('ux-font-size').value,
        baselineCss: document.getElementById('ux-baseline-css').value.trim(),
        colorPalette: {
          primary: document.getElementById('ux-color-primary').value,
          secondary: document.getElementById('ux-color-secondary').value,
          accent: document.getElementById('ux-color-accent').value,
          background: document.getElementById('ux-color-background').value,
          text: document.getElementById('ux-color-text').value,
          error: document.getElementById('ux-color-error').value
        }
      },
      debugMode: document.getElementById('debug-mode-checkbox')?.checked || false
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
   * Handle Generate Claude.md button click
   */
  async handleGenerateClaudeMd() {
    try {
      // Save current config first
      const formData = this.getFormData()
      this.intents.updateConfig(formData)

      // Generate Claude.md via IPC
      const result = await window.puffin.state.generateClaudeMd()

      if (result.success) {
        this.showSuccess(`Claude.md generated at ${result.path}`)
      } else {
        this.showError(result.error || 'Failed to generate Claude.md')
      }
    } catch (error) {
      this.showError(`Error generating Claude.md: ${error.message}`)
    }
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

  // ========================================
  // Plugin Management Methods
  // ========================================

  /**
   * Load plugins from backend
   */
  async loadPlugins() {
    try {
      if (window.puffin?.state?.getClaudePlugins) {
        const result = await window.puffin.state.getClaudePlugins()
        if (result.success) {
          this.plugins = result.plugins || []
          this.renderPlugins()
        }
      } else {
        // Backend not ready yet, use empty list
        this.plugins = []
        this.renderPlugins()
      }
    } catch (error) {
      console.error('Failed to load plugins:', error)
      this.plugins = []
      this.renderPlugins()
    }
  }

  /**
   * Render plugins list
   */
  renderPlugins() {
    if (!this.pluginsList) return

    // Clear existing content
    this.pluginsList.innerHTML = ''

    if (this.plugins.length === 0) {
      // Show empty state
      this.pluginsList.innerHTML = `
        <div class="plugins-empty-state">
          <span class="empty-icon">🔌</span>
          <p>No plugins installed</p>
          <p class="empty-hint">Add plugins to extend Claude's capabilities</p>
        </div>
      `
      return
    }

    // Render each plugin
    this.plugins.forEach(plugin => {
      const item = document.createElement('div')
      item.className = `plugin-item ${plugin.enabled === false ? 'disabled' : ''}`
      item.dataset.pluginId = plugin.id

      const icon = plugin.icon || '🔧'
      const version = plugin.version || '1.0.0'
      const description = plugin.description || 'No description available'

      item.innerHTML = `
        <div class="plugin-item-icon">${icon}</div>
        <div class="plugin-item-content">
          <div class="plugin-item-header">
            <span class="plugin-item-name">${this.escapeHtml(plugin.name)}</span>
            <span class="plugin-item-version">v${this.escapeHtml(version)}</span>
          </div>
          <p class="plugin-item-description">${this.escapeHtml(description)}</p>
        </div>
        <div class="plugin-item-actions">
          <button class="plugin-toggle ${plugin.enabled !== false ? 'enabled' : ''}"
                  data-plugin-id="${plugin.id}"
                  title="${plugin.enabled !== false ? 'Disable plugin' : 'Enable plugin'}"
                  aria-label="${plugin.enabled !== false ? 'Disable plugin' : 'Enable plugin'}">
            <span class="plugin-toggle-knob"></span>
          </button>
          <button class="plugin-delete-btn"
                  data-plugin-id="${plugin.id}"
                  title="Remove plugin"
                  aria-label="Remove plugin">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/>
            </svg>
          </button>
        </div>
      `

      this.pluginsList.appendChild(item)
    })

    // Bind plugin action events
    this.bindPluginEvents()
  }

  /**
   * Bind events for plugin items
   */
  bindPluginEvents() {
    // Toggle buttons
    this.pluginsList.querySelectorAll('.plugin-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pluginId = e.currentTarget.dataset.pluginId
        this.togglePlugin(pluginId)
      })
    })

    // Delete buttons
    this.pluginsList.querySelectorAll('.plugin-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pluginId = e.currentTarget.dataset.pluginId
        this.confirmDeletePlugin(pluginId)
      })
    })
  }

  /**
   * Toggle plugin enabled/disabled state
   */
  async togglePlugin(pluginId) {
    const plugin = this.plugins.find(p => p.id === pluginId)
    if (!plugin) return

    const newEnabled = plugin.enabled === false ? true : false

    try {
      if (window.puffin?.state?.updateClaudePlugin) {
        const result = await window.puffin.state.updateClaudePlugin(pluginId, { enabled: newEnabled })
        if (result.success) {
          plugin.enabled = newEnabled
          this.renderPlugins()
          this.showSuccess(`Plugin ${newEnabled ? 'enabled' : 'disabled'}`)
        } else {
          this.showError(result.error || 'Failed to update plugin')
        }
      } else {
        // Mock for UI development
        plugin.enabled = newEnabled
        this.renderPlugins()
      }
    } catch (error) {
      this.showError(`Failed to update plugin: ${error.message}`)
    }
  }

  /**
   * Show confirmation dialog before deleting a plugin
   */
  confirmDeletePlugin(pluginId) {
    const plugin = this.plugins.find(p => p.id === pluginId)
    if (!plugin) return

    if (confirm(`Are you sure you want to remove "${plugin.name}"? This cannot be undone.`)) {
      this.deletePlugin(pluginId)
    }
  }

  /**
   * Delete a plugin
   */
  async deletePlugin(pluginId) {
    try {
      if (window.puffin?.state?.uninstallClaudePlugin) {
        const result = await window.puffin.state.uninstallClaudePlugin(pluginId)
        if (result.success) {
          this.plugins = this.plugins.filter(p => p.id !== pluginId)
          this.renderPlugins()
          this.showSuccess('Plugin removed')
        } else {
          this.showError(result.error || 'Failed to remove plugin')
        }
      } else {
        // Mock for UI development
        this.plugins = this.plugins.filter(p => p.id !== pluginId)
        this.renderPlugins()
      }
    } catch (error) {
      this.showError(`Failed to remove plugin: ${error.message}`)
    }
  }

  /**
   * Show the Add Plugin modal
   */
  showAddPluginModal() {
    this.intents.showModal('add-plugin', {})
    this.renderAddPluginModal()
  }

  /**
   * Render the Add Plugin modal content
   */
  renderAddPluginModal() {
    const modalContent = document.getElementById('modal-content')
    const modalTitle = document.getElementById('modal-title')
    const modalActions = document.getElementById('modal-actions')

    // Clear any existing validation timer
    if (this._pluginValidationTimer) {
      clearTimeout(this._pluginValidationTimer)
    }

    modalTitle.textContent = 'Add Plugin'

    modalContent.innerHTML = `
      <div class="add-plugin-modal-content">
        <div class="add-plugin-tabs" role="tablist" aria-label="Plugin source type">
          <button type="button" class="add-plugin-tab active" data-tab="url" role="tab" aria-selected="true" aria-controls="url-input-group">From URL</button>
          <button type="button" class="add-plugin-tab" data-tab="local" role="tab" aria-selected="false" aria-controls="local-input-group">Local Path</button>
        </div>

        <div class="add-plugin-form" id="add-plugin-form">
          <div class="form-group" id="url-input-group" role="tabpanel">
            <label for="plugin-url-input">GitHub URL or Raw URL</label>
            <input type="url" id="plugin-url-input" class="plugin-url-input"
                   placeholder="https://github.com/user/repo/tree/main/plugins/my-plugin"
                   aria-describedby="url-hint">
            <small id="url-hint" class="form-hint">
              Supported formats:
              <br>• GitHub repo: <code>https://github.com/user/repo/tree/main/path</code>
              <br>• Raw file: <code>https://raw.githubusercontent.com/...</code>
            </small>
          </div>

          <div class="form-group hidden" id="local-input-group" role="tabpanel">
            <label for="plugin-local-input">Local Directory Path</label>
            <div class="input-with-button">
              <input type="text" id="plugin-local-input" class="plugin-url-input"
                     placeholder="C:\\plugins\\my-plugin or /home/user/plugins/my-plugin"
                     aria-describedby="local-hint">
              <button type="button" id="browse-local-btn" class="btn secondary btn-browse" title="Browse for directory">
                📁
              </button>
            </div>
            <small id="local-hint" class="form-hint">
              Directory must contain a <code>manifest.json</code> file with plugin metadata
            </small>
          </div>

          <div id="plugin-preview-container" class="hidden">
            <label>Plugin Preview</label>
            <div class="plugin-preview" id="plugin-preview" role="status" aria-live="polite">
              <!-- Preview content will be rendered here -->
            </div>
          </div>
        </div>
      </div>
    `

    modalActions.innerHTML = `
      <button class="btn secondary" id="modal-cancel-btn">Cancel</button>
      <button class="btn primary" id="modal-confirm-btn" disabled>Add Plugin</button>
    `

    // Bind tab switching
    modalContent.querySelectorAll('.add-plugin-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchAddPluginTab(e.target.dataset.tab)
      })
    })

    // Bind input validation with debounce
    const urlInput = document.getElementById('plugin-url-input')
    const localInput = document.getElementById('plugin-local-input')

    urlInput.addEventListener('input', () => {
      this.debouncedValidatePluginInput(urlInput.value, 'url')
    })

    localInput.addEventListener('input', () => {
      this.debouncedValidatePluginInput(localInput.value, 'local')
    })

    // Keyboard support: Enter to submit when valid
    const handleKeydown = (e) => {
      if (e.key === 'Enter' && !document.getElementById('modal-confirm-btn').disabled) {
        e.preventDefault()
        this.handleAddPlugin()
      }
    }
    urlInput.addEventListener('keydown', handleKeydown)
    localInput.addEventListener('keydown', handleKeydown)

    // Browse button for local path
    document.getElementById('browse-local-btn').addEventListener('click', async () => {
      await this.browseForPluginDirectory()
    })

    // Bind modal buttons
    document.getElementById('modal-cancel-btn').addEventListener('click', () => {
      this.intents.hideModal()
    })

    document.getElementById('modal-confirm-btn').addEventListener('click', () => {
      this.handleAddPlugin()
    })

    // Focus input
    urlInput.focus()
  }

  /**
   * Browse for a local plugin directory
   */
  async browseForPluginDirectory() {
    try {
      if (window.puffin?.dialog?.selectDirectory) {
        const result = await window.puffin.dialog.selectDirectory({
          title: 'Select Plugin Directory',
          buttonLabel: 'Select'
        })
        if (result && result.path) {
          const localInput = document.getElementById('plugin-local-input')
          localInput.value = result.path
          this.debouncedValidatePluginInput(result.path, 'local')
        }
      } else {
        // Fallback: show hint that browse is not available
        this.showError('Directory browser not available. Please enter the path manually.')
      }
    } catch (error) {
      console.error('Failed to open directory browser:', error)
    }
  }

  /**
   * Debounced plugin input validation
   * @param {string} value - Input value
   * @param {string} type - 'url' or 'local'
   */
  debouncedValidatePluginInput(value, type) {
    // Clear previous timer
    if (this._pluginValidationTimer) {
      clearTimeout(this._pluginValidationTimer)
    }

    const previewContainer = document.getElementById('plugin-preview-container')
    const preview = document.getElementById('plugin-preview')
    const confirmBtn = document.getElementById('modal-confirm-btn')

    // Quick validation for empty input
    if (!value.trim()) {
      previewContainer.classList.add('hidden')
      confirmBtn.disabled = true
      this._pendingPlugin = null
      return
    }

    // Show pending state immediately
    previewContainer.classList.remove('hidden')
    preview.innerHTML = `
      <div class="plugin-preview-loading">
        <span class="loading-spinner">⏳</span>
        <span>Waiting to validate...</span>
      </div>
    `

    // Debounce: wait 500ms before actual validation
    this._pluginValidationTimer = setTimeout(() => {
      this.validatePluginInput(value, type)
    }, 500)
  }

  /**
   * Switch between URL and Local path tabs
   */
  switchAddPluginTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.add-plugin-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab)
    })

    // Show/hide input groups
    const urlGroup = document.getElementById('url-input-group')
    const localGroup = document.getElementById('local-input-group')

    if (tab === 'url') {
      urlGroup.classList.remove('hidden')
      localGroup.classList.add('hidden')
      document.getElementById('plugin-url-input').focus()
    } else {
      urlGroup.classList.add('hidden')
      localGroup.classList.remove('hidden')
      document.getElementById('plugin-local-input').focus()
    }

    // Reset preview
    document.getElementById('plugin-preview-container').classList.add('hidden')
    document.getElementById('modal-confirm-btn').disabled = true
  }

  /**
   * Validate plugin input and show preview
   */
  async validatePluginInput(value, type) {
    const confirmBtn = document.getElementById('modal-confirm-btn')
    const previewContainer = document.getElementById('plugin-preview-container')
    const preview = document.getElementById('plugin-preview')

    if (!value.trim()) {
      previewContainer.classList.add('hidden')
      confirmBtn.disabled = true
      return
    }

    // Show loading state
    previewContainer.classList.remove('hidden')
    preview.innerHTML = `
      <div class="plugin-preview-loading">
        <span>⏳</span>
        <span>Validating plugin...</span>
      </div>
    `

    try {
      let result
      if (window.puffin?.state?.validateClaudePlugin) {
        result = await window.puffin.state.validateClaudePlugin(value, type)
      } else {
        // Mock validation for UI development (fallback if API not available)
        console.warn('[PLUGIN] validateClaudePlugin not available, using mock')
        await new Promise(resolve => setTimeout(resolve, 500))
        result = {
          success: false,
          error: 'Plugin validation API not available'
        }
      }

      if (result.success && result.manifest) {
        preview.innerHTML = `
          <div class="plugin-preview-info">
            <span class="plugin-preview-name">${result.manifest.icon || '🔧'} ${this.escapeHtml(result.manifest.name)}</span>
            <span class="plugin-preview-desc">${this.escapeHtml(result.manifest.description || 'No description')}</span>
          </div>
        `
        confirmBtn.disabled = false
        // Store validated data for submission
        this._pendingPlugin = { source: value, type, manifest: result.manifest }
      } else {
        preview.innerHTML = `
          <div class="plugin-preview-error">
            ⚠️ ${result.error || 'Invalid plugin format'}
          </div>
        `
        confirmBtn.disabled = true
        this._pendingPlugin = null
      }
    } catch (error) {
      preview.innerHTML = `
        <div class="plugin-preview-error">
          ⚠️ ${error.message || 'Failed to validate plugin'}
        </div>
      `
      confirmBtn.disabled = true
      this._pendingPlugin = null
    }
  }

  /**
   * Handle adding a new plugin
   */
  async handleAddPlugin() {
    if (!this._pendingPlugin) return

    const { source, type } = this._pendingPlugin

    try {
      let result
      if (window.puffin?.state?.addClaudePlugin) {
        result = await window.puffin.state.addClaudePlugin(source, type)
      } else {
        // Fallback if API not available
        console.warn('[PLUGIN] addClaudePlugin not available')
        result = {
          success: false,
          error: 'Plugin installation API not available'
        }
      }

      if (result.success) {
        this.plugins.push(result.plugin)
        this.renderPlugins()
        this.intents.hideModal()
        this.showSuccess(`Plugin "${result.plugin.name}" added successfully`)
      } else {
        this.showError(result.error || 'Failed to add plugin')
      }
    } catch (error) {
      this.showError(`Failed to add plugin: ${error.message}`)
    }

    this._pendingPlugin = null
  }

  /**
   * Cleanup
   */
  destroy() {
    // Remove event listeners if needed
    this._initialized = false
  }
}
