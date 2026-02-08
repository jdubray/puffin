/**
 * @module ai-client
 * Wrapper for Claude CLI invocation — standalone, no Puffin dependency.
 *
 * Invokes Claude through the CLI directly. Degrades gracefully when
 * the CLI is unavailable (BNR-04).
 */

'use strict';

const { execFileSync } = require('child_process');

/**
 * Send a prompt to Claude via the CLI and parse the JSON response.
 *
 * @param {string} systemPrompt - System instruction.
 * @param {string} userPrompt - User prompt content.
 * @param {Object} [opts]
 * @param {Function} [opts.log] - Logging function.
 * @returns {{ success: boolean, data: *|null, error: string|null }}
 */
function aiQuery(systemPrompt, userPrompt, opts = {}) {
  const log = opts.log || (() => {});

  try {
    const args = ['-p', userPrompt, '--output-format', 'json'];
    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }

    log('  AI query...');
    const raw = execFileSync('claude', args, {
      maxBuffer: 2 * 1024 * 1024,
      encoding: 'utf-8',
      timeout: 120_000,
      windowsHide: true
    });

    // Claude JSON output wraps the response in a result field
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Response may be plain text — wrap it
      return { success: true, data: raw.trim(), error: null };
    }

    // Extract the text content from Claude's JSON output format
    const text = parsed.result || parsed.content || parsed;
    if (typeof text === 'string') {
      // Try to parse the text as JSON (the AI was asked for JSON output)
      try {
        return { success: true, data: JSON.parse(text), error: null };
      } catch {
        return { success: true, data: text, error: null };
      }
    }
    return { success: true, data: text, error: null };
  } catch (err) {
    log(`  AI query failed: ${err.message}`);
    return { success: false, data: null, error: err.message };
  }
}

/**
 * Send a batched prompt (multiple items) to Claude.
 * Used for prose generation across multiple files.
 *
 * @param {string} systemPrompt
 * @param {Array<{ path: string, content: string }>} items
 * @param {Object} [opts]
 * @returns {{ success: boolean, data: Array|null, error: string|null }}
 */
function aiBatchQuery(systemPrompt, items, opts = {}) {
  const itemList = items.map((item, i) =>
    `--- File ${i + 1}: ${item.path} ---\n${item.content.slice(0, 2000)}\n`
  ).join('\n');

  const userPrompt = `Analyze the following ${items.length} files and return a JSON array with one entry per file.\n\n${itemList}\n\nReturn ONLY valid JSON — no markdown, no code blocks.`;

  return aiQuery(systemPrompt, userPrompt, opts);
}

module.exports = { aiQuery, aiBatchQuery };
