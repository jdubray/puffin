/**
 * Puffin - LLM Router
 *
 * Routes LLM requests to the appropriate provider based on the
 * model prefix (e.g. 'claude:sonnet' → ClaudeService, 'ollama:mistral-small' → OllamaService).
 *
 * The router is transparent: when no prefix is specified, requests
 * default to the Claude provider so all existing workflows continue
 * unchanged.
 *
 * @module llm-router
 */

/**
 * @typedef {import('./llm-provider').LLMProvider} LLMProvider
 * @typedef {import('./llm-provider').LLMModel} LLMModel
 */

class LLMRouter {
  constructor() {
    /** @type {Map<string, LLMProvider>} */
    this._providers = new Map()

    /** @type {string} */
    this._defaultProviderId = 'claude'

    /** @type {string|null} Provider ID of the currently active request */
    this._activeProviderId = null
  }

  /**
   * Register an LLM provider.
   * @param {LLMProvider} provider - Provider instance (must have providerId)
   */
  registerProvider(provider) {
    if (!provider?.providerId) {
      throw new Error('Provider must have a providerId')
    }
    this._providers.set(provider.providerId, provider)
  }

  /**
   * Get a registered provider by ID.
   * @param {string} id - Provider ID
   * @returns {LLMProvider|undefined}
   */
  getProvider(id) {
    return this._providers.get(id)
  }

  /**
   * Get the default provider (Claude).
   * @returns {LLMProvider}
   */
  getDefaultProvider() {
    return this._providers.get(this._defaultProviderId)
  }

  /**
   * Set the default provider ID.
   * @param {string} id - Provider ID to use as default
   */
  setDefaultProvider(id) {
    if (!this._providers.has(id)) {
      throw new Error(`Provider "${id}" is not registered`)
    }
    this._defaultProviderId = id
  }

  /**
   * Resolve which provider should handle a model string.
   *
   * Model format: "provider:model" (e.g. "ollama:mistral-small")
   * If no prefix, defaults to Claude provider.
   * Claude model names without prefix ('sonnet', 'haiku', 'opus') route to Claude.
   *
   * @param {string} [model] - Model identifier, possibly prefixed
   * @returns {{ provider: LLMProvider, model: string }} Resolved provider and clean model name
   */
  resolveProvider(model) {
    if (!model) {
      return { provider: this.getDefaultProvider(), model: model || '' }
    }

    const colonIndex = model.indexOf(':')
    if (colonIndex > 0) {
      const prefix = model.slice(0, colonIndex)
      const provider = this._providers.get(prefix)
      if (provider) {
        return { provider, model: model.slice(colonIndex + 1) }
      }
    }

    // No recognized prefix — route to default (Claude)
    return { provider: this.getDefaultProvider(), model }
  }

  /**
   * Submit an interactive prompt, routing to the correct provider.
   *
   * @param {Object} data - Submission data (prompt, model, branchId, etc.)
   * @param {Function} onChunk - Text chunk callback
   * @param {Function} onComplete - Completion callback
   * @param {Function} [onRaw] - Raw output callback
   * @param {Function} [onFullPrompt] - Full prompt callback
   * @param {Function} [onQuestion] - Question callback
   * @returns {Promise<Object>}
   */
  async submit(data, onChunk, onComplete, onRaw, onFullPrompt, onQuestion) {
    const { provider, model } = this.resolveProvider(data?.model)
    if (!provider) {
      const error = 'No LLM provider available for this model'
      onComplete?.({ content: '', error })
      return { content: '', error, exitCode: 1 }
    }

    // Pass cleaned model name (prefix stripped) to the provider
    const routedData = { ...data, model }
    const providerId = provider.providerId
    const providerName = provider.providerName

    // Wrap onRaw to inject provider context into messages that lack it
    const wrappedOnRaw = onRaw ? (jsonLine) => {
      try {
        const parsed = JSON.parse(jsonLine)
        if (!parsed.provider) {
          parsed.provider = providerId
          parsed.providerName = providerName
          parsed.model = parsed.model || model
          return onRaw(JSON.stringify(parsed))
        }
      } catch { /* not JSON, pass through */ }
      onRaw(jsonLine)
    } : undefined

    // Wrap onComplete to include provider context in response
    const wrappedOnComplete = onComplete ? (response) => {
      response.provider = providerId
      response.providerName = providerName
      response.model = model
      onComplete(response)
    } : undefined

    this._activeProviderId = providerId
    try {
      return await provider.submit(routedData, onChunk, wrappedOnComplete, wrappedOnRaw, onFullPrompt, onQuestion)
    } finally {
      this._activeProviderId = null
    }
  }

  /**
   * Send a one-shot prompt, routing to the correct provider.
   *
   * @param {string} prompt - The prompt text
   * @param {Object} [options] - Options including model
   * @returns {Promise<{success: boolean, response?: string, error?: string}>}
   */
  async sendPrompt(prompt, options = {}) {
    const { provider, model } = this.resolveProvider(options?.model)
    if (!provider) {
      return { success: false, error: 'No LLM provider available for this model' }
    }

    // Pass cleaned model name (prefix stripped) to the provider
    const routedOptions = { ...options, model }

    this._activeProviderId = provider.providerId
    try {
      return await provider.sendPrompt(prompt, routedOptions)
    } finally {
      this._activeProviderId = null
    }
  }

  /**
   * Cancel the currently active request.
   * Routes to the provider that is currently handling a request.
   */
  cancel() {
    if (this._activeProviderId) {
      const provider = this._providers.get(this._activeProviderId)
      provider?.cancel()
    } else {
      // Fallback: cancel the default provider
      this.getDefaultProvider()?.cancel()
    }
  }

  /**
   * Check if any provider has a running request.
   * @returns {boolean}
   */
  isProcessRunning() {
    for (const provider of this._providers.values()) {
      if (provider.isProcessRunning()) return true
    }
    return false
  }

  /**
   * Get all available models from all registered providers.
   * @returns {Promise<LLMModel[]>}
   */
  async getAvailableModels() {
    const allModels = []
    for (const provider of this._providers.values()) {
      try {
        const models = await provider.getAvailableModels()
        allModels.push(...models)
      } catch {
        // Provider failed to list models — skip
      }
    }
    return allModels
  }

  /**
   * Get list of registered provider IDs.
   * @returns {string[]}
   */
  getProviderIds() {
    return [...this._providers.keys()]
  }
}

module.exports = { LLMRouter }
