/**
 * anthropic-api-client - Minimal, cost-controlled client for the Anthropic
 * Messages API, used for document-editing prompts.
 *
 * As of 4.0 Puffin is a documentation manager. The interactive Claude Code CLI
 * remains the default prompt path; this module is the alternative "api" provider
 * for one-shot document edits where pay-per-token cost must be bounded:
 *   - defaults to the cheapest model (Haiku 4.5)
 *   - sends NO tools (so the model can't explore / run up cost)
 *   - caps max_tokens
 *   - never streams (single request/response)
 *
 * Uses the global fetch (Node 18+/Electron main) so no SDK dependency or
 * native rebuild is required. `fetchImpl` is injectable for testing.
 */

const DEFAULT_MODEL = 'claude-haiku-4-5'
const DEFAULT_MAX_TOKENS = 4096
const MAX_TOKENS_CEILING = 8192
const API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_TIMEOUT_MS = 60000

/**
 * Resolve the API key from an explicit value or the ANTHROPIC_API_KEY env var.
 * @param {string} [explicit]
 * @returns {string|null}
 */
function resolveApiKey(explicit) {
  const key = (explicit && String(explicit).trim()) || process.env.ANTHROPIC_API_KEY
  return key ? String(key).trim() : null
}

/**
 * Send a single message to the Anthropic Messages API.
 *
 * @param {Object} opts
 * @param {string} opts.prompt - The user message text (required).
 * @param {string} [opts.system] - Optional system prompt.
 * @param {string} [opts.model] - Model id (default Haiku 4.5).
 * @param {number} [opts.maxTokens] - Output cap (clamped to MAX_TOKENS_CEILING).
 * @param {string} [opts.apiKey] - Overrides ANTHROPIC_API_KEY env var.
 * @param {number} [opts.timeoutMs] - Request timeout (default 60s).
 * @param {AbortSignal} [opts.signal] - Optional external abort signal.
 * @param {Function} [opts.fetchImpl] - Injectable fetch (default global fetch).
 * @returns {Promise<{success:boolean, response?:string, usage?:object, model?:string, error?:string, status?:number}>}
 */
async function sendMessage(opts = {}) {
  const {
    prompt,
    system,
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    apiKey,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    fetchImpl
  } = opts

  if (!prompt || !String(prompt).trim()) {
    return { success: false, error: 'Prompt is required' }
  }

  const key = resolveApiKey(apiKey)
  if (!key) {
    return { success: false, error: 'No Anthropic API key. Set ANTHROPIC_API_KEY or add one in settings.' }
  }

  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null)
  if (!doFetch) {
    return { success: false, error: 'fetch is not available in this runtime' }
  }

  // Bound output cost. No `tools`, `thinking`, or `effort` — Haiku rejects effort
  // and tool-free keeps the call one-shot and cheap.
  const body = {
    model,
    max_tokens: Math.max(1, Math.min(Number(maxTokens) || DEFAULT_MAX_TOKENS, MAX_TOKENS_CEILING)),
    messages: [{ role: 'user', content: String(prompt) }]
  }
  if (system && String(system).trim()) {
    body.system = String(system)
  }

  // Honor an external abort signal; otherwise enforce our own timeout.
  const controller = signal ? null : new AbortController()
  const effectiveSignal = signal || controller?.signal
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const res = await doFetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: effectiveSignal
    })

    if (!res.ok) {
      let message = `Anthropic API error (HTTP ${res.status})`
      try {
        const errBody = await res.json()
        if (errBody?.error?.message) message = errBody.error.message
      } catch {
        // Non-JSON error body — keep the generic message
      }
      return { success: false, error: message, status: res.status }
    }

    const data = await res.json()
    const text = Array.isArray(data?.content)
      ? data.content.filter(b => b?.type === 'text').map(b => b.text).join('')
      : ''
    return { success: true, response: text, usage: data?.usage || null, model: data?.model || model }
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { success: false, error: `Request timed out after ${timeoutMs}ms` }
    }
    return { success: false, error: err?.message || String(err) }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

module.exports = {
  sendMessage,
  resolveApiKey,
  DEFAULT_MODEL,
  DEFAULT_MAX_TOKENS,
  MAX_TOKENS_CEILING,
  API_URL
}
