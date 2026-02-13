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

// Code Model tool guidance for assertions
const CODE_MODEL_TOOLS_BLOCK = `
CODE MODEL TOOLS AVAILABLE:
You can use h-DSL Code Model tools to inform assertion generation:
- hdsl_peek: Check what exports a module should have based on existing patterns
- hdsl_deps: Verify expected integration points
- hdsl_search: Find similar modules to base assertions on existing patterns

Use these to generate more accurate assertions that match codebase conventions.
`;

/**
 * Builds the generate-assertions prompt.
 *
 * @param {Object} params
 * @param {Object} params.story - The user story with acceptance criteria.
 * @param {string} [params.risMarkdown] - RIS markdown content (detailed implementation spec).
 * @param {Object} [params.planItem] - Legacy: plan item (used as fallback if no RIS).
 * @param {string} [params.codeModelContext] - Structured code model context.
 * @param {string} [params.codingStandard] - Coding standard text.
 * @param {boolean} [params.includeToolGuidance] - Whether to include Code Model tool guidance (default: true).
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildPrompt({ story, risMarkdown = '', planItem = null, codeModelContext = '', codingStandard = '', includeToolGuidance = true }) {
  const toolsBlock = includeToolGuidance ? CODE_MODEL_TOOLS_BLOCK : '';

  const system = risMarkdown
    ? `You are generating inspection assertions for a user story implementation. You operate using the DERIVE principle: generate new verifiable knowledge from the RIS (Refined Implementation Specification) and acceptance criteria.

Assertions will be automatically evaluated against the codebase to verify implementation completeness.

The RIS contains detailed technical specifications including:
- Exact file paths and function names to implement
- Data structures and API contracts
- Integration points and error handling requirements
- Step-by-step implementation instructions

Extract the most critical, verifiable requirements from the RIS to create precise assertions.
${toolsBlock}`
    : `You are generating inspection assertions for a user story implementation. You operate using the DERIVE principle: generate new verifiable knowledge from the plan and acceptance criteria.

Assertions will be automatically evaluated against the codebase to verify implementation completeness.
${toolsBlock}`;

  const ac = (story.acceptanceCriteria || []).map((c, i) => `  ${i + 1}. ${c}`).join('\n');

  const standardBlock = codingStandard
    ? `\nCODING STANDARDS:\n${codingStandard}\n`
    : '';

  const contextBlock = codeModelContext
    ? `\nCODEBASE CONTEXT:\n${codeModelContext}\n`
    : '';

  let task;
  if (risMarkdown) {
    // RIS-based assertion generation (preferred path)
    task = `Generate inspection assertions for the following user story based on its Refined Implementation Specification (RIS).
${contextBlock}${standardBlock}
--- BEGIN STORY ---
Title: ${story.title} [${story.id}]
Description: ${story.description}
Acceptance Criteria:
${ac}
--- END STORY ---

--- BEGIN RIS (Refined Implementation Specification) ---
${risMarkdown}
--- END RIS ---

Generate 5-8 assertions that verify the most critical aspects of this implementation.

IMPORTANT: Extract concrete, verifiable assertions from the RIS content. For each file, function, class, or integration point mentioned in the RIS:
1. Create a "file_exists" assertion for any new files/directories mentioned
2. Create "function_signature" assertions for key functions specified in the RIS (use function_name field)
3. Create "export_exists" assertions for modules that should export specific identifiers (use exports array with name and type fields)
4. Create "file_contains" or "import_exists" assertions for integration patterns (prefer these over pattern_match)
5. Only use "pattern_match" for truly regex-specific checks — keep patterns short and simple

Focus on:
- EVERY file/directory creation mentioned in RIS → file_exists
- EVERY key function name specified in RIS → function_signature
- EVERY export mentioned in RIS → export_exists
- Import statements and module dependencies → import_exists
- Specific text content that must appear → file_contains
- Critical acceptance criteria from the story

The RIS contains specific implementation details - use them to generate precise, targeted assertions.`;
  } else if (planItem) {
    // Legacy plan-based assertion generation (fallback)
    task = `Generate inspection assertions for the following plan item.
${contextBlock}${standardBlock}
--- BEGIN STORY ---
Title: ${story.title} [${story.id}]
Description: ${story.description}
Acceptance Criteria:
${ac}
--- END STORY ---

--- BEGIN PLAN ITEM ---
Approach: ${planItem.approach}
Files to create: ${(planItem.filesCreated || []).join(', ') || 'none'}
Files to modify: ${(planItem.filesModified || []).join(', ') || 'none'}
--- END PLAN ITEM ---

Generate 2-5 assertions that verify the most critical aspects of this implementation.`;
  } else {
    // Minimal fallback — story-only
    task = `Generate inspection assertions for the following user story.
${contextBlock}${standardBlock}
--- BEGIN STORY ---
Title: ${story.title} [${story.id}]
Description: ${story.description}
Acceptance Criteria:
${ac}
--- END STORY ---

Generate 2-5 assertions that verify the most critical aspects of this implementation.`;
  }

  const constraints = `OUTPUT FORMAT — respond with ONLY a valid JSON object:
{
  "assertions": [
    {
      "id": "<unique id, e.g. IA001>",
      "criterion": "<which acceptance criterion this verifies>",
      "type": "<one of the types below>",
      "target": "<file path relative to project root>",
      "message": "<human-readable description of what this verifies>",
      "assertion": { /* type-specific data — see below */ }
    }
  ]
}

ASSERTION TYPES and their "assertion" data shapes (MUST match exactly):

1. "file_exists" — Check a file or directory exists
   assertion: { "type": "file" }  OR  { "type": "directory" }

2. "function_signature" — Check a function is defined in a file
   assertion: { "function_name": "<name>" }

3. "export_exists" — Check that a module exports specific identifiers
   assertion: { "exports": [{ "name": "<identifier>", "type": "function"|"class"|"const" }] }

4. "pattern_match" — Check for a regex pattern in a file
   assertion: { "pattern": "<simple regex>", "operator": "present"|"absent" }

5. "import_exists" — Check that a file imports specific modules
   assertion: { "imports": [{ "module": "<module name or path>", "names": ["<imported name>"] }] }

6. "file_contains" — Check that a file contains specific text (literal match)
   assertion: { "match": "literal", "content": "<exact text to find>" }

RULES:
- Generate 5-8 assertions per story based on RIS content, or 2-5 if no RIS available
- Use relative paths from project root (e.g. "src/main/foo.js", NOT absolute paths)
- Each assertion ID must be unique
- The criterion field should reference the specific acceptance criterion number (or "general" if not tied to specific AC)
- Use the "message" field for human-readable description text
- Keep regex patterns SIMPLE — avoid complex regex. Prefer "file_contains" or "function_signature" over "pattern_match" when possible
- For function checks, ALWAYS use "function_signature" type (not "function_exists")
- Do NOT use markdown code blocks — output raw JSON only`;

  return { system, task, constraints };
}

module.exports = { buildPrompt };
