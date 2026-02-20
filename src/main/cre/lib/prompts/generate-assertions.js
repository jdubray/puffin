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
    ? `You are generating inspection assertions to PREDICT what artifacts will be created when Claude implements a feature following a Refined Implementation Specification (RIS).

CRITICAL CONTEXT:
- The code does NOT exist yet
- Claude will implement the feature following the RIS instructions
- Your job is to PREDICT what files, functions, and integrations Claude will most likely create
- These assertions will be evaluated AFTER implementation to verify completeness

The RIS is a detailed implementation guide that Claude will follow. It contains:
- Exact file paths and function names to implement
- Data structures and API contracts
- Integration points and error handling requirements
- Step-by-step implementation instructions

Your task: Extract the most verifiable, concrete artifacts mentioned in the RIS that Claude will create during implementation.

Think of this as: "Given this RIS, what files/functions/exports will Claude DEFINITELY create?"
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
    task = `Generate inspection assertions to predict what Claude will implement following this Refined Implementation Specification (RIS).
${contextBlock}${standardBlock}
--- BEGIN RIS (Refined Implementation Specification) ---
${risMarkdown}
--- END RIS ---

TASK: Read the RIS carefully and generate 5-8 assertions predicting what artifacts Claude will create.

EXTRACTION STRATEGY:
1. For EVERY file path mentioned → generate "file_exists" assertion
2. For EVERY function/method name specified → generate "function_signature" assertion
3. For EVERY export mentioned → generate "export_exists" assertion
4. For EVERY import/integration described → generate "import_exists" assertion
5. For CRITICAL implementation patterns → generate "file_contains" assertion

EXAMPLE EXTRACTION:

Given RIS excerpt:
"""
Create file src/main/user-service.js with class UserService that exports methods
getUserById(id) and createUser(data). Import the database module:
const db = require('./database').
Add IPC handler 'user:get' in src/main/ipc-handlers.js.
"""

Generate these assertions:
{
  "assertions": [
    {
      "id": "IA001",
      "criterion": "general",
      "type": "file_exists",
      "target": "src/main/user-service.js",
      "message": "User service implementation file must exist",
      "assertion": { "type": "file" }
    },
    {
      "id": "IA002",
      "criterion": "general",
      "type": "export_exists",
      "target": "src/main/user-service.js",
      "message": "UserService class must be exported",
      "assertion": { "exports": [{ "name": "UserService", "type": "class" }] }
    },
    {
      "id": "IA003",
      "criterion": "general",
      "type": "function_signature",
      "target": "src/main/user-service.js",
      "message": "getUserById method must be implemented",
      "assertion": { "function_name": "getUserById" }
    },
    {
      "id": "IA004",
      "criterion": "general",
      "type": "function_signature",
      "target": "src/main/user-service.js",
      "message": "createUser method must be implemented",
      "assertion": { "function_name": "createUser" }
    },
    {
      "id": "IA005",
      "criterion": "general",
      "type": "import_exists",
      "target": "src/main/user-service.js",
      "message": "Database module must be imported",
      "assertion": { "imports": [{ "module": "./database", "names": ["db"] }] }
    },
    {
      "id": "IA006",
      "criterion": "general",
      "type": "file_contains",
      "target": "src/main/ipc-handlers.js",
      "message": "IPC handler for user:get must be registered",
      "assertion": { "match": "literal", "content": "ipcMain.handle('user:get'" }
    }
  ]
}

IMPORTANT REMINDERS:
- Generate EXACTLY 5-8 assertions (not fewer)
- Extract file paths, function names, and exports DIRECTLY from the RIS text
- Be LITERAL — if RIS says "src/main/foo.js", use exactly that path
- Focus on HIGH-CONFIDENCE predictions (what Claude will DEFINITELY create)
- Avoid vague assertions — be specific about file paths and identifiers
- Remember: the code doesn't exist yet, you're predicting what WILL be created

Story context for reference only:
Title: ${story.title}
Acceptance Criteria: ${story.acceptanceCriteria?.length || 0} criteria defined`;
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

RULES FOR HIGH-QUALITY ASSERTIONS:
- Generate EXACTLY 5-8 assertions per story (never fewer than 5)
- Extract paths/names LITERALLY from the RIS text — if RIS says "src/main/foo.js", use exactly that
- Use relative paths from project root (e.g. "src/main/foo.js", NOT absolute paths)
- Each assertion ID must be unique within this response
- Focus on HIGH-CONFIDENCE predictions (artifacts Claude will DEFINITELY create based on RIS)
- Prioritize core implementation files and key functions over helper/utility code
- The "message" field should be specific and actionable (e.g., "FooService class must be exported" NOT "Service must exist")
- Keep regex patterns SIMPLE — prefer "file_contains" or "function_signature" over "pattern_match"
- For function checks, ALWAYS use "function_signature" type (not "function_exists")
- For class methods, use the method name in "function_name" field
- Do NOT use markdown code blocks — output raw JSON only

QUALITY CHECKLIST (before submitting your response):
✓ Did I extract file paths directly from RIS text?
✓ Did I generate assertions for ALL key functions mentioned in RIS?
✓ Did I generate assertions for ALL exports mentioned in RIS?
✓ Did I generate 5-8 assertions (not fewer)?
✓ Are all paths relative to project root?
✓ Are all assertion types valid and data shapes correct?

  return { system, task, constraints };
}

module.exports = { buildPrompt };
