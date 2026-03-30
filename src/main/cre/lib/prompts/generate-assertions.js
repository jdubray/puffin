'use strict';

/**
 * @module prompts/generate-assertions
 * DERIVE operation — creates testable inspection assertions from a RIS document.
 *
 * Generates assertions that can be automatically verified against the
 * codebase after implementation to confirm completeness. Assertions are
 * derived from the RIS (Refined Implementation Specification) which contains
 * detailed technical context including file paths, function names, and
 * integration points.
 */

/**
 * Builds the generate-assertions prompt.
 *
 * @param {Object} params
 * @param {Object} params.story - The user story with acceptance criteria.
 * @param {string} [params.risMarkdown] - RIS markdown content (detailed implementation spec).
 * @param {Object} [params.planItem] - Legacy: plan item (used as fallback if no RIS).
 * @param {string} [params.codeModelContext] - Structured code model context.
 * @param {string} [params.codingStandard] - Coding standard text.
 * @param {boolean} [params.includeToolGuidance] - Ignored (kept for API compat).
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildPrompt({ story, risMarkdown = '', planItem = null, codeModelContext = '', codingStandard = '' }) {
  const ac = (story.acceptanceCriteria || []).map((c, i) => `  ${i + 1}. ${c}`).join('\n');

  const standardBlock = codingStandard
    ? `\nCODING STANDARDS:\n${codingStandard}\n`
    : '';

  const contextBlock = codeModelContext
    ? `\nCODEBASE CONTEXT:\n${codeModelContext}\n`
    : '';

  // System prompt: role + most important framing up front
  const system = `You are generating inspection assertions that will be automatically evaluated against a codebase after a developer implements a feature.

Your assertions will be run as automated checks — like a test suite — to verify the implementation is complete and correct. Every assertion must be precise enough to pass a mechanical check.

KEY PRINCIPLE: Generate assertions you are HIGHLY CONFIDENT will pass after a correct implementation. Prefer simpler, more reliable assertion types over complex ones. A small set of reliable assertions is far better than many fragile ones.`;

  let task;

  if (risMarkdown) {
    // RIS-based path — the full RIS is the primary source of truth
    task = `Generate inspection assertions for this user story by reading the Refined Implementation Specification (RIS) below.

The RIS was written by a senior developer to guide the implementation. It names the exact files, functions, and integration points that will be created. Extract your assertions DIRECTLY from the RIS text.
${contextBlock}${standardBlock}
--- BEGIN STORY ---
Title: ${story.title}
Acceptance Criteria:
${ac || '  (none specified)'}
--- END STORY ---

--- BEGIN RIS (Refined Implementation Specification) ---
${risMarkdown}
--- END RIS ---

EXTRACTION INSTRUCTIONS:
Step 1 — Scan the RIS for EVERY file path mentioned (e.g. "src/main/foo.js") → one "file_exists" assertion per file
Step 2 — Scan for EVERY function or method name that must exist → one "function_signature" assertion per name
Step 3 — For each acceptance criterion above, add ONE "file_contains" assertion that verifies a critical literal string that would only appear if that criterion is implemented (e.g. an IPC handler name, a config key, a specific method call)
Step 4 — Stop at 8 assertions total. Prefer file_exists and function_signature; only add file_contains when the literal string is unambiguous.

AVOID:
- Do NOT generate assertions for paths you are guessing — only use paths stated in the RIS
- Do NOT use pattern_match (regex is too fragile)
- Do NOT use import_exists or export_exists (complex JSON shapes, high false-negative rate)
- Do NOT use file_contains with partial or ambiguous strings

Story title for reference: ${story.title}`;

  } else if (planItem) {
    // Legacy plan-based path
    task = `Generate inspection assertions for the following user story and plan item.
${contextBlock}${standardBlock}
--- BEGIN STORY ---
Title: ${story.title} [${story.id}]
Description: ${story.description || ''}
Acceptance Criteria:
${ac || '  (none specified)'}
--- END STORY ---

--- BEGIN PLAN ITEM ---
Approach: ${planItem.approach || ''}
Files to create: ${(planItem.filesCreated || []).join(', ') || 'none'}
Files to modify: ${(planItem.filesModified || []).join(', ') || 'none'}
--- END PLAN ITEM ---

For each file listed above, generate a "file_exists" assertion.
For the most important function or method in each file, generate a "function_signature" assertion.
Limit to 5 assertions total. Prefer file_exists and function_signature.`;

  } else {
    // Minimal story-only fallback
    task = `Generate inspection assertions for the following user story.
${contextBlock}${standardBlock}
--- BEGIN STORY ---
Title: ${story.title} [${story.id}]
Description: ${story.description || ''}
Acceptance Criteria:
${ac || '  (none specified)'}
--- END STORY ---

Based on the story title and acceptance criteria, generate 3-5 assertions that verify the most critical aspects. Use file_exists and function_signature types where possible.`;
  }

  const constraints = `OUTPUT FORMAT — respond with ONLY a valid JSON object, no markdown fences, no explanation:
{
  "assertions": [
    {
      "id": "IA001",
      "criterion": "<paste the acceptance criterion text this assertion verifies, or 'general'>",
      "type": "<assertion type — see below>",
      "target": "<file path relative to project root, e.g. src/main/foo.js>",
      "message": "<specific human-readable description, e.g. 'getUserById function must be defined in user-service.js'>",
      "assertion": { /* type-specific fields — see below */ }
    }
  ]
}

SUPPORTED ASSERTION TYPES (use only these):

"file_exists" — verifies a file or directory exists at the given path
  assertion: { "type": "file" }
  OR
  assertion: { "type": "directory" }

"function_signature" — verifies a function or method with this name is defined in the target file
  assertion: { "function_name": "<exact function/method name as it appears in the source code>" }

"file_contains" — verifies the target file contains an exact literal string
  assertion: { "match": "literal", "content": "<exact string that appears in the file>" }
  Use ONLY when you are certain of the exact string (e.g. ipcMain.handle('channel:name') or a specific constant value).

RULES:
- Generate between 3 and 8 assertions (3 minimum, 8 maximum)
- Each assertion ID must be unique (IA001, IA002, ...)
- All file paths must be relative to the project root (e.g. "src/main/foo.js" not "/absolute/path/foo.js")
- For function_signature: use the exact function/method name as written in source (camelCase, snake_case, etc.)
- For file_contains literal: prefer IPC channel names, exported class names, or config keys — NOT partial variable names
- Do NOT invent file paths — only assert files explicitly named in the RIS or plan
- The "criterion" field should quote the relevant acceptance criterion verbatim if possible

CONFIDENCE CHECK before submitting:
✓ Are all file paths taken directly from the RIS/plan (not invented)?
✓ Are all function names taken directly from the RIS/plan?
✓ For file_contains: is the content string specific enough to avoid false positives?
✓ Have I avoided import_exists, export_exists, and pattern_match?
✓ Is the count between 3 and 8?`;

  return { system, task, constraints };
}

module.exports = { buildPrompt };
