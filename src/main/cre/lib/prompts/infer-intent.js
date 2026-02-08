'use strict';

/**
 * @module prompts/infer-intent
 * GROUND operation — generates PROSE descriptions from source code.
 *
 * Analyzes source code artifacts and produces human-readable intent
 * descriptions for the code model's PROSE fields (summary, intent, behavior).
 */

/**
 * Builds the infer-intent prompt.
 *
 * @param {Object} params
 * @param {string} params.sourceCode - The source code to analyze.
 * @param {string} params.filePath - Path of the source file.
 * @param {string} [params.artifactType] - Type hint: "module", "function", "flow".
 * @param {Object} [params.existingArtifact] - Existing code model entry to update.
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildPrompt({ sourceCode, filePath, artifactType = 'module', existingArtifact = null }) {
  const system = `You are analyzing source code to infer developer intent. You operate using the GROUND principle: establish accurate, foundational descriptions of what code does and why.

Your output populates the PROSE fields of a code model (h-DSL). Be precise and concise.`;

  const existingBlock = existingArtifact
    ? `\nEXISTING CODE MODEL ENTRY:\n${JSON.stringify(existingArtifact, null, 2)}\nUpdate stale fields while preserving accurate ones.\n`
    : '';

  const task = `Analyze the following source code and produce PROSE descriptions for the code model.

FILE: ${filePath}
ARTIFACT TYPE: ${artifactType}
${existingBlock}
SOURCE CODE:
${sourceCode}

Infer:
- summary: one-sentence description of what this code does
- intent: why this code exists (its purpose in the system)
- For functions: behavior (preconditions, postconditions, error conditions)
- exports: list of exported identifiers
- tags: categorization tags`;

  const constraints = `OUTPUT FORMAT — respond with ONLY a valid JSON object:
{
  "summary": "<one-sentence PROSE description>",
  "intent": "<why this code exists>",
  "exports": ["<exported identifier>"],
  "tags": ["<category tag>"],
  "behavior": {
    "pre": "<preconditions, or null if not a function>",
    "post": "<postconditions, or null>",
    "err": "<error conditions, or null>"
  },
  "kind": "module" | "file" | "config"
}

RULES:
- summary must be a single sentence
- intent should describe purpose, not mechanics
- tags should be lowercase, hyphenated (e.g. "error-handling", "data-model")
- behavior fields are only relevant for function-type artifacts
- Do NOT use markdown code blocks — output raw JSON only`;

  return { system, task, constraints };
}

module.exports = { buildPrompt };
