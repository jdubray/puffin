'use strict';

/**
 * @module prompts/generate-assertions
 * DERIVE operation — creates testable inspection assertions for a plan item.
 *
 * Generates assertions that can be automatically verified against the
 * codebase after implementation to confirm completeness.
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
 * @param {Object} params.planItem - A single plan item with storyId, approach, files.
 * @param {Object} params.story - The user story with acceptance criteria.
 * @param {string} [params.codeModelContext] - Structured code model context.
 * @param {string} [params.codingStandard] - Coding standard text.
 * @param {boolean} [params.includeToolGuidance] - Whether to include Code Model tool guidance (default: true).
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildPrompt({ planItem, story, codeModelContext = '', codingStandard = '', includeToolGuidance = true }) {
  const toolsBlock = includeToolGuidance ? CODE_MODEL_TOOLS_BLOCK : '';

  const system = `You are generating inspection assertions for a user story implementation. You operate using the DERIVE principle: generate new verifiable knowledge from the plan and acceptance criteria.

Assertions will be automatically evaluated against the codebase to verify implementation completeness.
${toolsBlock}`;

  const ac = (story.acceptanceCriteria || []).map((c, i) => `  ${i + 1}. ${c}`).join('\n');

  const standardBlock = codingStandard
    ? `\nCODING STANDARDS:\n${codingStandard}\n`
    : '';

  const contextBlock = codeModelContext
    ? `\nCODEBASE CONTEXT:\n${codeModelContext}\n`
    : '';

  const task = `Generate inspection assertions for the following plan item.
${contextBlock}${standardBlock}
STORY: ${story.title} [${story.id}]
Description: ${story.description}
Acceptance Criteria:
${ac}

PLAN ITEM:
Approach: ${planItem.approach}
Files to create: ${(planItem.filesCreated || []).join(', ') || 'none'}
Files to modify: ${(planItem.filesModified || []).join(', ') || 'none'}

Generate 2-5 assertions that verify the most critical aspects of this implementation.`;

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
