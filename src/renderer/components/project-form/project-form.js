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

// Debounce delay for input changes (ms)
const INPUT_DEBOUNCE_DELAY = 500

// Default coding standard templates for each language
const CODING_STANDARD_DEFAULTS = {
  javascript: `# JavaScript/TypeScript Coding Standards

When reviewing or generating JavaScript/TypeScript code, follow these rules:

## File Naming
- **Source files:** Use kebab-case (e.g., \`user-service.js\`, \`api-client.ts\`)
- **Component files:** Use kebab-case (e.g., \`user-profile.js\`, \`data-table.tsx\`)
- **Test files:** Use \`.test.js\` or \`.spec.js\` suffix (e.g., \`user-service.test.js\`)

## Variable Naming
- **Variables:** camelCase (e.g., \`userName\`, \`isActive\`, \`totalCount\`)
- **Constants:** UPPER_SNAKE_CASE for true constants (e.g., \`MAX_RETRIES\`, \`API_BASE_URL\`)
- **Boolean variables:** Prefix with \`is\`, \`has\`, \`can\`, \`should\` (e.g., \`isLoading\`, \`hasError\`)

## Function Naming
- **Functions:** camelCase (e.g., \`calculateTotal()\`, \`fetchUserData()\`)
- **Event handlers:** Prefix with \`handle\` or \`on\` (e.g., \`handleClick\`, \`onSubmit\`)

## Class/Constructor Naming
- **Classes:** PascalCase (e.g., \`UserService\`, \`DataProcessor\`, \`ApiClient\`)
- **Interfaces (TS):** PascalCase (e.g., \`IUserService\` or \`UserService\`)

## Private Members
- **Private fields:** Prefix with underscore (e.g., \`_privateData\`, \`_internalState\`)`,

  python: `# Python Coding Standards (PEP 8)

When reviewing or generating Python code, follow these rules:

## File Naming
- **Source files:** Use snake_case (e.g., \`user_service.py\`, \`api_client.py\`)
- **Package directories:** Use snake_case (e.g., \`data_processing/\`, \`utils/\`)
- **Test files:** Use \`test_\` prefix (e.g., \`test_user_service.py\`)

## Variable Naming
- **Variables:** snake_case (e.g., \`user_name\`, \`is_active\`, \`total_count\`)
- **Constants:** UPPER_SNAKE_CASE (e.g., \`MAX_RETRIES\`, \`API_BASE_URL\`)
- **Protected variables:** Single underscore prefix (e.g., \`_internal_data\`)
- **Private variables:** Double underscore prefix (e.g., \`__private_data\`)

## Function Naming
- **Functions:** snake_case (e.g., \`calculate_total()\`, \`fetch_user_data()\`)
- **Private functions:** Prefix with underscore (e.g., \`_validate_input()\`)

## Class Naming
- **Classes:** PascalCase (e.g., \`UserService\`, \`DataProcessor\`, \`ApiClient\`)
- **Exception classes:** PascalCase with \`Error\` suffix (e.g., \`ValidationError\`)`,

  java: `# Java Coding Standards

When reviewing or generating Java code, follow these rules:

## File Naming
- **Source files:** PascalCase matching the public class name (e.g., \`UserService.java\`)
- **One public class per file:** File name must match the public class name exactly
- **Test files:** Class name with \`Test\` suffix (e.g., \`UserServiceTest.java\`)

## Package Naming
- **Packages:** All lowercase, dot-separated (e.g., \`com.example.service\`)

## Variable Naming
- **Local variables:** camelCase (e.g., \`userName\`, \`isActive\`, \`totalCount\`)
- **Constants:** UPPER_SNAKE_CASE with \`static final\` (e.g., \`MAX_RETRIES\`)
- **Boolean variables:** Prefix with \`is\`, \`has\`, \`can\` (e.g., \`isEnabled\`)

## Method Naming
- **Methods:** camelCase (e.g., \`calculateTotal()\`, \`getUserById()\`)
- **Getters:** \`get\` prefix (e.g., \`getName()\`, \`getId()\`)
- **Setters:** \`set\` prefix (e.g., \`setName()\`, \`setId()\`)
- **Boolean getters:** \`is\` or \`has\` prefix (e.g., \`isActive()\`)

## Class/Interface Naming
- **Classes:** PascalCase (e.g., \`UserService\`, \`OrderProcessor\`)
- **Interfaces:** PascalCase (e.g., \`Comparable\`, \`UserRepository\`)`,

  c: `# C Coding Standards

When reviewing or generating C code, follow these rules:

## File Naming
- **Source files:** snake_case with \`.c\` extension (e.g., \`user_service.c\`)
- **Header files:** snake_case with \`.h\` extension (e.g., \`user_service.h\`)

## Header Guards
- **Format:** UPPER_SNAKE_CASE with \`_H\` suffix
\`\`\`c
#ifndef USER_SERVICE_H
#define USER_SERVICE_H
// content
#endif
\`\`\`

## Variable Naming
- **Local variables:** snake_case (e.g., \`user_count\`, \`buffer_size\`)
- **Global variables:** snake_case with \`g_\` prefix (e.g., \`g_config\`)
- **Static variables:** snake_case with \`s_\` prefix (e.g., \`s_initialized\`)

## Constant/Macro Naming
- **Macros:** UPPER_SNAKE_CASE (e.g., \`MAX_BUFFER_SIZE\`)
- **Enum values:** UPPER_SNAKE_CASE (e.g., \`STATUS_OK\`)

## Function Naming
- **Functions:** snake_case (e.g., \`calculate_total()\`, \`parse_input()\`)
- **Module prefix:** Use module name prefix (e.g., \`user_create()\`, \`user_destroy()\`)

## Type Naming
- **Structs:** snake_case with \`_t\` suffix (e.g., \`user_data_t\`)
- **Typedefs:** snake_case with \`_t\` suffix (e.g., \`callback_fn_t\`)`,

  cpp: `# C++ Coding Standards

When reviewing or generating C++ code, follow these rules:

## File Naming
- **Source files:** snake_case or PascalCase with \`.cpp\` extension
- **Header files:** Same base name with \`.h\` or \`.hpp\` extension
- **Be consistent** within a project

## Header Guards
- **Prefer \`#pragma once\`** for modern compilers

## Namespace Naming
- **Namespaces:** all_lowercase or snake_case (e.g., \`myproject\`)
- **Avoid \`using namespace\` in headers**

## Variable Naming
- **Local variables:** snake_case or camelCase (e.g., \`user_count\` or \`userCount\`)
- **Member variables:** Prefix with \`m_\` or suffix with \`_\` (e.g., \`m_data\` or \`data_\`)
- **Constants:** UPPER_SNAKE_CASE or kPascalCase (e.g., \`MAX_SIZE\` or \`kMaxSize\`)

## Function/Method Naming
- **Functions:** snake_case or camelCase (e.g., \`calculate_total()\` or \`calculateTotal()\`)
- **Getters/Setters:** \`get\`/\`set\` prefix or just property name

## Class/Type Naming
- **Classes:** PascalCase (e.g., \`UserService\`, \`DataProcessor\`)
- **Interfaces:** PascalCase with optional \`I\` prefix (e.g., \`ISerializable\`)
- **Template parameters:** Single letter or PascalCase (e.g., \`T\`, \`Container\`)`
}

/**
 * Debounce utility function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(fn, delay) {
  let timeoutId
  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), delay)
  }
}

export class ProjectFormComponent {
  constructor(intents) {
    this.intents = intents
    this.form = null
    this.assumptionsList = null
    this.assumptions = []
    this.pluginsList = null
    this.plugins = []
    this._initialized = false // Track if form has been populated

    // Create debounced version of config update to prevent excessive updates during typing
    this._debouncedUpdateConfig = debounce(() => {
      const formData = this.getFormData()
      this.intents.updateConfig(formData)
    }, INPUT_DEBOUNCE_DELAY)
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

    // CRE Manual Refresh button
    const creRefreshBtn = document.getElementById('cre-manual-refresh-btn')
    if (creRefreshBtn) {
      creRefreshBtn.addEventListener('click', () => {
        this.handleCreManualRefresh()
      })
    }

    // Ollama enable/disable toggle
    const ollamaToggle = document.getElementById('ollama-enabled')
    if (ollamaToggle) {
      ollamaToggle.addEventListener('change', () => {
        this._updateOllamaFieldsVisibility()
        this.handleInputChange()
      })
    }

    // Ollama Test Connection button
    const testOllamaBtn = document.getElementById('test-ollama-btn')
    if (testOllamaBtn) {
      testOllamaBtn.addEventListener('click', () => {
        this.handleTestOllamaConnection()
      })
    }

    // Color input synchronization (color picker <-> text input)
    this.bindColorInputs()

    // Coding standard language dropdown - populates textarea with defaults
    const codingStandardSelect = document.getElementById('coding-standard-language')
    if (codingStandardSelect) {
      codingStandardSelect.addEventListener('change', () => {
        this.handleCodingStandardLanguageChange()
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
   * Handle coding standard language dropdown change
   * Populates the textarea with the default template for the selected language
   */
  handleCodingStandardLanguageChange() {
    const language = this.getElementValue('coding-standard-language', 'none')
    const textarea = document.getElementById('coding-standard-content')

    if (textarea && language !== 'none' && CODING_STANDARD_DEFAULTS[language]) {
      textarea.value = CODING_STANDARD_DEFAULTS[language]
    } else if (textarea && language === 'none') {
      // Clear textarea when "None" is selected
      textarea.value = ''
    }

    this.handleInputChange()
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

      // Reload plugins now that the backend state is ready
      // This ensures plugins are displayed after the state is loaded
      this.loadPlugins()
    }
  }

  /**
   * Re-initialize the form (called when view is re-activated)
   */
  reinitialize() {
    // Reset initialization flag so form repopulates on next render
    this._initialized = false
    // Clear form reference to force rebinding on next init()
    this.form = null
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

    // Default model — handle both legacy ('sonnet') and new ('claude:sonnet') formats
    const defaultModel = document.getElementById('default-model')
    if (defaultModel) {
      const modelValue = config.defaultModel || 'claude:sonnet'
      defaultModel.value = modelValue
      // If value didn't match (legacy format), try mapping
      if (defaultModel.value !== modelValue) {
        const legacyMap = { opus: 'claude:opus', sonnet: 'claude:sonnet', haiku: 'claude:haiku',
          'claude:opus-4.6': 'claude:opus', 'claude:sonnet-4.5': 'claude:sonnet', 'claude:haiku-4.5': 'claude:haiku' }
        defaultModel.value = legacyMap[modelValue] || 'claude:sonnet'
      }
    }

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

    // Coding Standard
    const codingStandard = config.codingStandard || {}
    const codingLangSelect = document.getElementById('coding-standard-language')
    const codingContentTextarea = document.getElementById('coding-standard-content')
    if (codingLangSelect) codingLangSelect.value = codingStandard.language || 'none'
    if (codingContentTextarea) codingContentTextarea.value = codingStandard.content || ''

    // Assumptions
    this.assumptions = config.assumptions || []
    this.renderAssumptions()

    // Debug Mode
    const debugCheckbox = document.getElementById('debug-mode-checkbox')
    if (debugCheckbox) debugCheckbox.checked = config.debugMode || false

    // CRE Settings
    const creConfig = config.cre || {}
    const sprintEndConfig = creConfig.sprintEnd || {}
    const creAutoRefresh = document.getElementById('cre-sprint-auto-refresh')
    const creFullRebuild = document.getElementById('cre-sprint-full-rebuild')
    if (creAutoRefresh) creAutoRefresh.checked = sprintEndConfig.autoRefresh || false
    if (creFullRebuild) creFullRebuild.checked = sprintEndConfig.fullRebuild || false

    // Ollama Settings
    const ollamaConfig = config.ollama || {}
    console.log('[PROJECT-FORM] Loading Ollama config:', JSON.stringify(ollamaConfig, null, 2))

    const ollamaEnabled = document.getElementById('ollama-enabled')
    const ollamaSshHost = document.getElementById('ollama-ssh-host')
    const ollamaSshPort = document.getElementById('ollama-ssh-port')
    const ollamaSshKey = document.getElementById('ollama-ssh-key')

    if (ollamaEnabled) ollamaEnabled.checked = ollamaConfig.enabled || false
    if (ollamaSshHost) {
      const hostValue = ollamaConfig.ssh?.host
        ? `${ollamaConfig.ssh.user || ''}@${ollamaConfig.ssh.host}`
        : ''
      console.log('[PROJECT-FORM] Setting SSH Host field to:', hostValue)
      ollamaSshHost.value = hostValue
    }
    if (ollamaSshPort) {
      console.log('[PROJECT-FORM] Setting SSH Port field to:', ollamaConfig.ssh?.port || 22)
      ollamaSshPort.value = ollamaConfig.ssh?.port || 22
    }
    if (ollamaSshKey) {
      const keyPath = ollamaConfig.ssh?.privateKeyPath || '~/.ssh/id_rsa'
      console.log('[PROJECT-FORM] Setting SSH Key field to:', keyPath)
      ollamaSshKey.value = keyPath
    }

    // Toggle field visibility based on enabled state
    this._updateOllamaFieldsVisibility()
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

    console.log('[CONFIG] Form data collected:', JSON.stringify({
      ollama: formData.ollama,
      defaultModel: formData.defaultModel
    }, null, 2))

    // Update config (auto-persisted to .puffin/config.json)
    this.intents.updateConfig(formData)

    this.showSuccess('Configuration saved')
  }

  /**
   * Safely get a form element's value with null check
   * @param {string} id - Element ID
   * @param {string} defaultValue - Default value if element is missing
   * @returns {string} The element value or default
   */
  getElementValue(id, defaultValue = '') {
    const element = document.getElementById(id)
    if (!element) {
      console.warn(`[ProjectForm] Missing form element: ${id}`)
      return defaultValue
    }
    return element.value?.trim?.() ?? element.value ?? defaultValue
  }

  /**
   * Safely get a checkbox element's checked state
   * @param {string} id - Element ID
   * @param {boolean} defaultValue - Default value if element is missing
   * @returns {boolean} The checkbox state or default
   */
  getCheckboxValue(id, defaultValue = false) {
    const element = document.getElementById(id)
    return element?.checked ?? defaultValue
  }

  /**
   * Get form data as object
   * Uses safe accessors to handle missing elements gracefully
   */
  getFormData() {
    return {
      name: this.getElementValue('project-name-input'),
      description: this.getElementValue('project-description'),
      assumptions: this.assumptions.filter(a => a.trim()),
      technicalArchitecture: this.getElementValue('technical-architecture'),
      dataModel: this.getElementValue('data-model'),
      defaultModel: this.getElementValue('default-model', 'claude:sonnet'),
      options: {
        programmingStyle: this.getElementValue('programming-style', 'hybrid'),
        testingApproach: this.getElementValue('testing-approach', 'bdd'),
        documentationLevel: this.getElementValue('documentation-level', 'standard'),
        errorHandling: this.getElementValue('error-handling', 'exceptions'),
        codeStyle: {
          naming: this.getElementValue('naming-convention', 'camelCase'),
          comments: this.getElementValue('comment-style', 'jsdoc')
        }
      },
      uxStyle: {
        alignment: this.getElementValue('ux-alignment', 'left'),
        fontFamily: this.getElementValue('ux-font-family', 'system-ui'),
        fontSize: this.getElementValue('ux-font-size', '16px'),
        baselineCss: this.getElementValue('ux-baseline-css'),
        colorPalette: {
          primary: this.getElementValue('ux-color-primary', '#007bff'),
          secondary: this.getElementValue('ux-color-secondary', '#6c757d'),
          accent: this.getElementValue('ux-color-accent', '#28a745'),
          background: this.getElementValue('ux-color-background', '#ffffff'),
          text: this.getElementValue('ux-color-text', '#212529'),
          error: this.getElementValue('ux-color-error', '#dc3545')
        }
      },
      codingStandard: {
        language: this.getElementValue('coding-standard-language', 'none'),
        content: this.getElementValue('coding-standard-content', '')
      },
      debugMode: this.getCheckboxValue('debug-mode-checkbox'),
      cre: {
        sprintEnd: {
          autoRefresh: this.getCheckboxValue('cre-sprint-auto-refresh'),
          fullRebuild: this.getCheckboxValue('cre-sprint-full-rebuild')
        }
      },
      ollama: this._getOllamaFormData()
    }
  }

  /**
   * Parse the Ollama SSH host field (user@host format) and build config
   * @returns {Object} Ollama config for persistence
   * @private
   */
  _getOllamaFormData() {
    const enabled = this.getCheckboxValue('ollama-enabled')
    const hostField = this.getElementValue('ollama-ssh-host')
    const port = parseInt(this.getElementValue('ollama-ssh-port', '22')) || 22
    const privateKeyPath = this.getElementValue('ollama-ssh-key', '~/.ssh/id_rsa')

    // Parse user@host format
    let user = ''
    let host = ''
    if (hostField.includes('@')) {
      const parts = hostField.split('@')
      user = parts[0]
      host = parts.slice(1).join('@') // Handle edge case of @ in host
    } else {
      host = hostField
    }

    return {
      enabled,
      ssh: { host, user, port, privateKeyPath }
    }
  }

  /**
   * Handle input changes (auto-update config)
   * Uses debouncing to prevent excessive updates during rapid typing
   */
  handleInputChange() {
    this._debouncedUpdateConfig()
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
   * Handle CRE Manual Refresh button click
   * Triggers Code Model refresh via cre:refresh-model IPC
   */
  async handleCreManualRefresh() {
    const btn = document.getElementById('cre-manual-refresh-btn')
    const originalText = btn?.textContent

    try {
      // Update button to show progress
      if (btn) {
        btn.disabled = true
        btn.textContent = 'Refreshing...'
      }

      // Check if CRE API is available
      if (!window.puffin?.cre?.refreshModel) {
        this.showError('CRE API not available. Make sure the project is loaded.')
        return
      }

      // Get current setting for full rebuild
      const fullRebuild = this.getCheckboxValue('cre-sprint-full-rebuild')

      // Call the refresh API
      const result = await window.puffin.cre.refreshModel({ forceRebuild: fullRebuild })

      if (result.success) {
        const source = result.data?.source || 'unknown'
        const updated = result.data?.updated
        if (updated) {
          this.showSuccess(`Code Model refreshed (${source})`)
        } else {
          this.showSuccess('Code Model is already up-to-date')
        }
      } else {
        this.showError(result.error || 'Failed to refresh Code Model')
      }
    } catch (error) {
      this.showError(`Error refreshing Code Model: ${error.message}`)
    } finally {
      // Restore button
      if (btn) {
        btn.disabled = false
        btn.textContent = originalText
      }
    }
  }

  /**
   * Handle Test Connection button for Ollama SSH
   * Spawns SSH to verify connectivity and lists available models
   */
  async handleTestOllamaConnection() {
    console.log('[PROJECT-FORM] ===== TEST CONNECTION CLICKED =====')

    const btn = document.getElementById('test-ollama-btn')
    const resultDiv = document.getElementById('ollama-test-result')
    const originalText = btn?.textContent

    try {
      if (btn) {
        btn.disabled = true
        btn.textContent = 'Testing...'
      }
      if (resultDiv) {
        resultDiv.style.display = 'none'
        resultDiv.className = 'ollama-test-result'
      }

      // Build config from current form fields
      const ollamaData = this._getOllamaFormData()
      console.log('[PROJECT-FORM] Form data for test:', JSON.stringify(ollamaData, null, 2))

      const sshConfig = {
        host: ollamaData.ssh.host,
        user: ollamaData.ssh.user,
        port: ollamaData.ssh.port,
        privateKeyPath: ollamaData.ssh.privateKeyPath
      }
      console.log('[PROJECT-FORM] SSH config for test:', JSON.stringify(sshConfig, null, 2))

      if (!sshConfig.host || !sshConfig.user) {
        this._showOllamaTestResult(resultDiv, false, 'Enter SSH host in user@host format')
        return
      }

      console.log('[PROJECT-FORM] Calling window.puffin.llm.testConnection...')
      const result = await window.puffin.llm.testConnection(sshConfig)
      console.log('[PROJECT-FORM] Test connection result:', JSON.stringify(result, null, 2))

      if (result.success) {
        const modelList = result.models?.length > 0
          ? result.models.join(', ')
          : 'No models installed'
        this._showOllamaTestResult(resultDiv, true, `Connected. Available models: ${modelList}`)
      } else {
        this._showOllamaTestResult(resultDiv, false, result.error || 'Connection failed')
      }
    } catch (error) {
      this._showOllamaTestResult(resultDiv, false, `Error: ${error.message}`)
    } finally {
      if (btn) {
        btn.disabled = false
        btn.textContent = originalText
      }
    }
  }

  /**
   * Show test connection result in the result div
   * @param {HTMLElement|null} el - The result element
   * @param {boolean} success - Whether the test succeeded
   * @param {string} message - Message to display
   * @private
   */
  _showOllamaTestResult(el, success, message) {
    if (!el) return
    el.style.display = 'block'
    el.className = `ollama-test-result ${success ? 'success' : 'error'}`
    el.textContent = message
  }

  /**
   * Toggle visibility of Ollama config fields based on enabled checkbox
   * @private
   */
  _updateOllamaFieldsVisibility() {
    const enabled = this.getCheckboxValue('ollama-enabled')
    const fields = document.getElementById('ollama-config-fields')
    if (fields) {
      fields.style.display = enabled ? '' : 'none'
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
   * Validate plugin icon for safe DOM insertion.
   * Accepts: emoji characters, short text labels (1-4 chars like "JS", "TS")
   * Rejects: HTML, scripts, long strings
   * @param {string} icon - The icon to validate
   * @returns {string} Safe icon or default fallback
   */
  validatePluginIcon(icon) {
    const DEFAULT_ICON = '🔧'

    if (!icon || typeof icon !== 'string') {
      return DEFAULT_ICON
    }

    // Trim and limit length (max 8 chars to allow emoji sequences or short text)
    const trimmed = icon.trim()
    if (trimmed.length === 0 || trimmed.length > 8) {
      return DEFAULT_ICON
    }

    // Check for dangerous characters (HTML/script injection)
    if (/<|>|&|javascript:|data:|on\w+=/i.test(trimmed)) {
      console.warn(`[ProjectForm] SECURITY: Rejected unsafe plugin icon: ${icon}`)
      return DEFAULT_ICON
    }

    // Allow emoji pattern (Unicode emoji ranges) or alphanumeric text (1-4 chars)
    const isEmoji = /^[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}]+$/u.test(trimmed)
    const isShortText = /^[A-Za-z0-9]{1,4}$/.test(trimmed)

    if (isEmoji || isShortText) {
      return trimmed
    }

    return DEFAULT_ICON
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

      // Validate icon for security (prevents XSS via malicious icon content)
      const icon = this.validatePluginIcon(plugin.icon)
      const version = plugin.version || '1.0.0'
      const description = plugin.description || 'No description available'

      // Build structure - icon uses textContent for extra safety
      const iconDiv = document.createElement('div')
      iconDiv.className = 'plugin-item-icon'
      iconDiv.textContent = icon

      // Rest of item uses innerHTML with escaped content
      const contentWrapper = document.createElement('div')
      contentWrapper.className = 'plugin-item-wrapper'
      contentWrapper.innerHTML = `
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

      item.appendChild(iconDiv)
      // Append children from wrapper to item
      while (contentWrapper.firstChild) {
        item.appendChild(contentWrapper.firstChild)
      }

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
        // Validate icon for security before display
        const validatedIcon = this.validatePluginIcon(result.manifest.icon)
        preview.innerHTML = `
          <div class="plugin-preview-info">
            <span class="plugin-preview-name">${this.escapeHtml(validatedIcon)} ${this.escapeHtml(result.manifest.name)}</span>
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
