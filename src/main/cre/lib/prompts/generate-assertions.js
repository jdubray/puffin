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

Generate 3-6 assertions that verify the most critical aspects of this implementation.
Focus on:
- File/directory existence mentioned in RIS
- Key functions and exports specified in RIS
- Integration patterns described in RIS
- Critical acceptance criteria from the story`;
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
      "type": "file_exists" | "function_exists" | "export_exists" | "pattern_match",
      "target": "<file path relative to project root>",
      "message": "<human-readable description>",
      "assertion": {
        // For file_exists: { "kind": "file" | "directory" }
        // For function_exists: { "name": "<function name>" }
        // For export_exists: { "exports": [{ "name": "<identifier>", "kind": "function" | "class" | "const" }] }
        // For pattern_match: { "pattern": "<regex>", "operator": "present" | "absent" }
      }
    }
  ]
}

RULES:
- Generate 2-5 assertions per story, focusing on critical verifications
- Use relative paths from project root
- Each assertion ID must be unique
- The criterion field should reference the specific acceptance criterion number
- Do NOT use markdown code blocks — output raw JSON only`;

  return { system, task, constraints };
}

module.exports = { buildPrompt };
