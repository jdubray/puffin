/**
 * Available models for Puffin (local LLM / deepagents mode)
 *
 * Models are fetched dynamically from Ollama at startup via the
 * `claude:getModels` IPC handler (src/main/ipc-handlers.js).
 * This file is reference documentation only — it is not imported at runtime.
 *
 * Model IDs use the `ollama:<name>` format understood by init_chat_model()
 * in the deepagents CLI shim. The active model is controlled by:
 *   - DEEPAGENTS_MODEL env var (default shown below)
 *   - User selection in the UI (persisted to localStorage as 'puffin-default-model')
 */

// Example model list (actual list comes from Ollama /api/tags at runtime)
export const LOCAL_MODELS_EXAMPLE = [
  {
    id: 'ollama:qwen2.5:14b-instruct-q5_K_M',
    name: 'qwen2.5:14b-instruct-q5_K_M',
    description: '~9GB',
    tier: 'default'
  }
]

// Fallback used when Ollama is unreachable (mirrors DEEPAGENTS_MODEL env var default)
export const DEFAULT_MODEL = 'ollama:qwen2.5:14b-instruct-q5_K_M'
