/**
 * Puffin - LLM Provider Interface
 *
 * Defines the contract that all LLM providers must implement.
 * Providers include Claude (via CLI subprocess) and Ollama (via SSH).
 *
 * @module llm-provider
 */

/**
 * @typedef {Object} LLMProviderInfo
 * @property {string} id - Unique provider identifier (e.g. 'claude', 'ollama')
 * @property {string} name - Display name (e.g. 'Claude Code', 'Ollama')
 */

/**
 * @typedef {Object} LLMModel
 * @property {string} id - Prefixed model identifier (e.g. 'claude:sonnet', 'ollama:mistral-small')
 * @property {string} name - Display name
 * @property {string} provider - Provider ID
 */

/**
 * Abstract base class for LLM providers.
 *
 * All providers must implement these methods to be compatible with the
 * LLMRouter. The interface matches the existing ClaudeService public API
 * so that swapping providers requires zero changes to callers.
 */
class LLMProvider {
  /**
   * @param {LLMProviderInfo} info - Provider identification
   */
  constructor(info) {
    if (new.target === LLMProvider) {
      throw new Error('LLMProvider is abstract and cannot be instantiated directly')
    }
    this.providerId = info.id
    this.providerName = info.name
  }

  /**
   * Submit an interactive prompt with streaming callbacks.
   * This is the primary interactive path used by the prompt editor.
   *
   * @param {Object} data - Submission data (prompt, branchId, model, sessionId, etc.)
   * @param {Function} onChunk - Called with each text chunk: (text: string) => void
   * @param {Function} onComplete - Called when complete: (response: Object) => void
   * @param {Function} [onRaw] - Called with raw JSON lines: (json: string) => void
   * @param {Function} [onFullPrompt] - Called with built prompt: (prompt: string) => void
   * @param {Function} [onQuestion] - Called for interactive questions: (data: Object) => void
   * @returns {Promise<Object>} Completion result
   */
  async submit(data, onChunk, onComplete, onRaw, onFullPrompt, onQuestion) {
    throw new Error(`${this.constructor.name} must implement submit()`)
  }

  /**
   * Send a one-shot prompt (non-streaming). Used by automated callers
   * like CRE plan generation, story derivation summaries, commit messages.
   *
   * @param {string} prompt - The prompt text
   * @param {Object} [options] - Options (model, maxTurns, timeout, jsonSchema, etc.)
   * @returns {Promise<{success: boolean, response?: string, error?: string}>}
   */
  async sendPrompt(prompt, options = {}) {
    throw new Error(`${this.constructor.name} must implement sendPrompt()`)
  }

  /**
   * Cancel the currently running request.
   */
  cancel() {
    throw new Error(`${this.constructor.name} must implement cancel()`)
  }

  /**
   * Check if a request is currently running.
   * @returns {boolean}
   */
  isProcessRunning() {
    throw new Error(`${this.constructor.name} must implement isProcessRunning()`)
  }

  /**
   * Get models available from this provider.
   * @returns {Promise<LLMModel[]>}
   */
  async getAvailableModels() {
    throw new Error(`${this.constructor.name} must implement getAvailableModels()`)
  }
}

module.exports = { LLMProvider }
