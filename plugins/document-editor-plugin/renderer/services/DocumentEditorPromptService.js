/**
 * DocumentEditorPromptService
 *
 * Service for managing AI prompts in the Document Editor plugin.
 * Provides a harness that constrains Claude to document-only editing.
 */

/**
 * Extension to language name mapping for syntax blocks
 */
const EXTENSION_TO_LANGUAGE_NAME = {
  '.md': 'markdown',
  '.json': 'json',
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.jsx': 'javascript',
  '.tsx': 'typescript',
  '.css': 'css',
  '.scss': 'scss',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.sql': 'sql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.txt': 'text'
}

/**
 * Get language name for an extension
 * @param {string} extension - File extension including dot
 * @returns {string} Language name for code blocks
 */
function getLanguageName(extension) {
  if (!extension) return 'text'
  return EXTENSION_TO_LANGUAGE_NAME[extension.toLowerCase()] || 'text'
}

export class DocumentEditorPromptService {
  /**
   * @param {Object} options - Service options
   * @param {string} options.pluginName - Plugin name for IPC calls
   */
  constructor(options = {}) {
    this.pluginName = options.pluginName || 'document-editor-plugin'
    this.config = null
    this.configLoaded = false
  }

  /**
   * Load harness configuration
   * @returns {Promise<Object>} Harness configuration
   */
  async loadConfig() {
    if (this.configLoaded && this.config) {
      return this.config
    }

    try {
      const result = await window.puffin.plugins.invoke(
        this.pluginName,
        'getHarnessConfig',
        {}
      )

      if (result.error) {
        console.error('[DocumentEditorPromptService] Failed to load config:', result.error)
        // Return default config on error
        this.config = this.getDefaultConfig()
      } else {
        this.config = result.config
      }

      this.configLoaded = true
      return this.config
    } catch (error) {
      console.error('[DocumentEditorPromptService] Config load error:', error)
      this.config = this.getDefaultConfig()
      this.configLoaded = true
      return this.config
    }
  }

  /**
   * Get default configuration (fallback)
   * @returns {Object} Default harness configuration
   */
  getDefaultConfig() {
    return {
      systemPromptTemplate: this.getDefaultSystemPrompt(),
      validationEnabled: true,
      validationInstructions: '',
      summaryFormat: 'concise',
      summaryInstructions: '',
      defaultModel: 'haiku',
      allowContextFiles: true,
      maxContextFiles: 5,
      contextFileTemplate: '### Context File: {filename}\n```{language}\n{content}\n```\n',
      thinkingBudgets: {
        none: null,
        think: 0.25,
        'think-hard': 0.50
      },
      models: {
        haiku: { id: 'haiku', displayName: 'Haiku (Fast)' },
        sonnet: { id: 'sonnet', displayName: 'Sonnet' },
        opus: { id: 'opus', displayName: 'Opus' }
      }
    }
  }

  /**
   * Get default system prompt
   * @returns {string} Default system prompt template
   */
  getDefaultSystemPrompt() {
    return `## Document Editor Mode

You are editing a single document: \`{filename}\`
File type: {extension}

### STRICT RULES:
1. You may ONLY modify the content of this document
2. You may READ any project file for context but CANNOT write to other files
3. Before completing, validate the document syntax ({extension} format)
4. Provide a CONCISE CHANGE SUMMARY (bulleted list of what you changed)
5. If requirements are unclear, ASK CLARIFYING QUESTIONS
6. Do NOT provide verbose explanations - focus on the changes

### Current Document Content:
\`\`\`{language}
{content}
\`\`\`

{contextFilesSection}

### User's Request:
{userPrompt}`
  }

  /**
   * Build the complete prompt with harness
   * @param {Object} options - Prompt options
   * @param {string} options.filename - Document filename
   * @param {string} options.extension - File extension
   * @param {string} options.content - Current document content
   * @param {string} options.userPrompt - User's editing request
   * @param {Array} options.contextFiles - Optional context files
   * @returns {Promise<string>} Complete prompt with harness
   */
  async buildPrompt(options) {
    const config = await this.loadConfig()
    const {
      filename,
      extension,
      content,
      userPrompt,
      contextFiles = []
    } = options

    const language = getLanguageName(extension)

    // Build context files section
    let contextFilesSection = ''
    if (config.allowContextFiles && contextFiles.length > 0) {
      const limitedFiles = contextFiles.slice(0, config.maxContextFiles)
      contextFilesSection = '### Context Files (Read-Only):\n\n'

      for (const file of limitedFiles) {
        const fileLanguage = getLanguageName(file.extension)
        contextFilesSection += config.contextFileTemplate
          .replace(/{filename}/g, file.name || file.path)
          .replace(/{language}/g, fileLanguage)
          .replace(/{content}/g, file.content)
        contextFilesSection += '\n'
      }
    }

    // Build the main prompt from template
    let prompt = config.systemPromptTemplate
      .replace(/{filename}/g, filename)
      .replace(/{extension}/g, extension)
      .replace(/{language}/g, language)
      .replace(/{content}/g, content)
      .replace(/{contextFilesSection}/g, contextFilesSection)
      .replace(/{userPrompt}/g, userPrompt)

    // Add validation instructions if enabled
    if (config.validationEnabled && config.validationInstructions) {
      prompt += '\n\n' + config.validationInstructions
    }

    // Add summary format instructions
    if (config.summaryInstructions) {
      prompt += '\n\n' + config.summaryInstructions
    }

    return prompt
  }

  /**
   * Submit a prompt to Claude with the document harness
   * @param {Object} options - Submission options
   * @param {string} options.filename - Document filename
   * @param {string} options.filePath - Full file path
   * @param {string} options.extension - File extension
   * @param {string} options.content - Current document content
   * @param {string} options.userPrompt - User's editing request
   * @param {string} options.model - Model to use (haiku/sonnet/opus)
   * @param {string} options.thinkingBudget - Thinking budget (none/think/think-hard)
   * @param {Array} options.contextFiles - Optional context files
   * @param {string} options.branchId - Branch ID for the request
   * @param {string} options.sessionId - Session ID (null for new session)
   * @returns {Promise<void>} Submits to Claude (response via events)
   */
  async submit(options) {
    const config = await this.loadConfig()
    const {
      filename,
      filePath,
      extension,
      content,
      userPrompt,
      model = config.defaultModel,
      thinkingBudget = 'none',
      contextFiles = [],
      branchId = 'plugin',
      sessionId = null
    } = options

    // Build the harnessed prompt
    const prompt = await this.buildPrompt({
      filename,
      extension,
      content,
      userPrompt,
      contextFiles
    })

    // Get thinking budget value
    const thinkingValue = config.thinkingBudgets[thinkingBudget] || null

    // Submit to Claude via the existing API
    // Note: The actual response handling is done via events (window.puffin.claude.onResponse)
    if (window.puffin?.claude?.submit) {
      window.puffin.claude.submit({
        prompt,
        branchId,
        sessionId,
        model,
        thinking: thinkingValue,
        metadata: {
          type: 'document-editor',
          filePath,
          filename,
          extension
        }
      })

      console.log('[DocumentEditorPromptService] Submitted prompt:', {
        model,
        thinkingBudget,
        filename,
        promptLength: prompt.length
      })
    } else {
      console.error('[DocumentEditorPromptService] Claude API not available')
      throw new Error('Claude API is not available')
    }
  }

  /**
   * Get available models from config
   * @returns {Promise<Array>} Array of model options
   */
  async getAvailableModels() {
    const config = await this.loadConfig()
    return Object.values(config.models)
  }

  /**
   * Get thinking budget options from config
   * @returns {Promise<Object>} Thinking budget options
   */
  async getThinkingBudgets() {
    const config = await this.loadConfig()
    return config.thinkingBudgets
  }

  /**
   * Get the default model from config
   * @returns {Promise<string>} Default model ID
   */
  async getDefaultModel() {
    const config = await this.loadConfig()
    return config.defaultModel
  }

  /**
   * Check if context files are allowed
   * @returns {Promise<boolean>} True if context files are allowed
   */
  async isContextFilesAllowed() {
    const config = await this.loadConfig()
    return config.allowContextFiles
  }

  /**
   * Get max context files allowed
   * @returns {Promise<number>} Max number of context files
   */
  async getMaxContextFiles() {
    const config = await this.loadConfig()
    return config.maxContextFiles
  }
}

export default DocumentEditorPromptService
