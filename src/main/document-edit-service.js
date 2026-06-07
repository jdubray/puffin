/**
 * document-edit-service - Routes a document-editing prompt to the configured
 * provider. Puffin 4.0 keeps prompting only for cost-controlled document edits.
 *
 * Providers (config.promptProvider, default 'cli'):
 *   - 'api': direct Anthropic Messages API (pay-per-token, cheap model, no tools)
 *   - 'cli': the existing Claude Code CLI one-shot path (uses the user's CLI auth)
 *
 * Both return { success, response, error }.
 */

const apiClient = require('./anthropic-api-client')

const SYSTEM_PROMPT =
  'You are a precise document editor. Apply the requested change and return ONLY the full revised document text — no commentary, no explanations, no code fences.'

/**
 * Build the editing prompt from an instruction and the current document text.
 *
 * The formatting guardrail is embedded directly in the prompt rather than passed
 * as a separate system prompt, because the CLI one-shot path (sendPrompt) does
 * not apply a system prompt — embedding it here keeps both providers' output
 * format identical.
 *
 * @param {string} instruction
 * @param {string} content
 * @returns {string}
 */
function buildEditPrompt(instruction, content) {
  return [
    SYSTEM_PROMPT,
    '',
    '## Instruction',
    instruction || '(no instruction provided)',
    '',
    '## Document',
    content || '(empty document)'
  ].join('\n')
}

/**
 * Edit a document via the configured provider.
 *
 * @param {Object} args
 * @param {string} args.instruction - What change to make.
 * @param {string} args.content - The current document text.
 * @param {string} [args.provider] - Override the configured provider ('api'|'cli').
 * @param {Object} [args.config] - Project config (reads promptProvider + anthropic.*).
 * @param {Object} [args.claudeService] - ClaudeService instance (for the 'cli' provider).
 * @returns {Promise<{success:boolean, response?:string, error?:string, provider:string}>}
 */
async function editDocument(args = {}) {
  const { instruction, content, provider, config = {}, claudeService } = args

  if (!instruction || !String(instruction).trim()) {
    return { success: false, error: 'An editing instruction is required', provider: 'none' }
  }

  const chosen = provider || config.promptProvider || 'cli'
  const prompt = buildEditPrompt(instruction, content)

  if (chosen === 'api') {
    const a = config.anthropic || {}
    const result = await apiClient.sendMessage({
      prompt,
      model: a.model,
      maxTokens: a.maxTokens,
      apiKey: a.apiKey
    })
    // Treat an empty body (e.g. a refusal) as a soft failure rather than
    // silently returning an empty document.
    if (result.success && !String(result.response || '').trim()) {
      return { success: false, error: 'The model returned an empty response', provider: 'api' }
    }
    return { ...result, provider: 'api' }
  }

  // Default: CLI one-shot. disableTools + allowConcurrent keep it cheap and
  // isolated from any interactive session. (The formatting guardrail is baked
  // into the prompt — sendPrompt does not apply a system prompt.)
  if (!claudeService || typeof claudeService.sendPrompt !== 'function') {
    return { success: false, error: 'CLI provider is unavailable', provider: 'cli' }
  }
  const result = await claudeService.sendPrompt(prompt, {
    allowConcurrent: true,
    disableTools: true
  })
  return { ...result, provider: 'cli' }
}

module.exports = { editDocument, buildEditPrompt, SYSTEM_PROMPT }
