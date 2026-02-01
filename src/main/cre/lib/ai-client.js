'use strict';

/**
 * @module cre/lib/ai-client
 * Shared AI client for CRE components.
 *
 * Assembles prompt parts ({system, task, constraints}) into a single string,
 * sends via claudeService.sendPrompt(), and parses JSON responses.
 * All CRE AI integration points route through this module.
 */

/** Default model for complex reasoning tasks (plan generation, RIS, refinement). */
const MODEL_COMPLEX = 'sonnet';

/** Default model for structured extraction tasks (ambiguity analysis, assertions, intent). */
const MODEL_EXTRACT = 'haiku';

/** Default timeout for complex AI calls (ms). */
const TIMEOUT_COMPLEX = 120000;

/** Default timeout for extraction AI calls (ms). */
const TIMEOUT_EXTRACT = 60000;

/**
 * Assemble a CRE prompt from its parts into a single string.
 *
 * @param {{ system: string, task: string, constraints: string }} parts
 * @returns {string}
 */
function assemblePrompt(parts) {
  const { system, task, constraints } = parts;
  return `${system}\n\n${task}\n\n${constraints}`;
}

/**
 * Parse a JSON response from the AI, handling common formatting issues.
 *
 * Tries in order:
 *   1. Direct JSON.parse of trimmed text
 *   2. Extract from markdown code fences (```json ... ```)
 *   3. Extract first top-level { ... } block
 *
 * @param {string} text - Raw AI response text.
 * @returns {Object|null} Parsed JSON object, or null if unparseable.
 */
function parseJsonResponse(text) {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trim();

  // 1. Direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // 2. Extract from markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }

  // 3. Extract first top-level { ... } block (greedy)
  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try {
      return JSON.parse(trimmed.slice(braceStart, braceEnd + 1));
    } catch {
      // continue
    }
  }

  return null;
}

/**
 * Send a CRE prompt to the AI via claudeService and parse the JSON response.
 *
 * @param {Object} claudeService - The claude-service instance.
 * @param {{ system: string, task: string, constraints: string }} promptParts - Prompt template output.
 * @param {Object} [options]
 * @param {string} [options.model] - Model to use (default: MODEL_EXTRACT).
 * @param {number} [options.timeout] - Timeout in ms (default: TIMEOUT_EXTRACT).
 * @param {string} [options.label] - Label for logging.
 * @returns {Promise<{ success: boolean, data: Object|null, error: string|null, raw: string|null }>}
 */
async function sendCrePrompt(claudeService, promptParts, options = {}) {
  const {
    model = MODEL_EXTRACT,
    timeout = TIMEOUT_EXTRACT,
    label = 'cre-prompt'
  } = options;

  if (!claudeService) {
    console.warn(`[CRE-AI] No claudeService available for ${label}, returning empty result`);
    return { success: false, data: null, error: 'claudeService not available', raw: null };
  }

  const prompt = assemblePrompt(promptParts);

  try {
    console.log(`[CRE-AI] Sending ${label} (model: ${model}, timeout: ${timeout}ms)`);

    const result = await claudeService.sendPrompt(prompt, {
      model,
      maxTurns: 1,
      timeout
    });

    if (!result.success) {
      console.warn(`[CRE-AI] ${label} failed:`, result.error);
      return { success: false, data: null, error: result.error || 'AI call failed', raw: null };
    }

    const parsed = parseJsonResponse(result.response);
    if (!parsed) {
      console.warn(`[CRE-AI] ${label}: could not parse JSON from response (${(result.response || '').length} chars)`);
      return {
        success: false,
        data: null,
        error: 'Failed to parse JSON from AI response',
        raw: result.response
      };
    }

    console.log(`[CRE-AI] ${label} succeeded`);
    return { success: true, data: parsed, error: null, raw: result.response };
  } catch (err) {
    console.error(`[CRE-AI] ${label} error:`, err.message);
    return { success: false, data: null, error: err.message, raw: null };
  }
}

module.exports = {
  assemblePrompt,
  parseJsonResponse,
  sendCrePrompt,
  MODEL_COMPLEX,
  MODEL_EXTRACT,
  TIMEOUT_COMPLEX,
  TIMEOUT_EXTRACT
};
