'use strict';

/**
 * @module prompts/generate-ris
 * FOLLOW operation — produces a RIS (Refined Implementation Specification)
 * markdown document for a single user story.
 */

// Code Model tool guidance block — this is CRITICAL for RIS because it tells the
// implementing agent (Claude Code) how to use the Code Model tools during implementation.
const CODE_MODEL_TOOLS_BLOCK = `
CODE MODEL TOOLS AVAILABLE TO THE IMPLEMENTING AGENT:
The coding agent executing this RIS has access to h-DSL Code Model tools via MCP:
- hdsl_search: Find existing modules, patterns, or conventions by keyword or semantic query
- hdsl_peek: Get a module's summary, exports, and purpose without reading the full file
- hdsl_deps: List what a module imports and what imports it
- hdsl_trace: Follow dependency chains from any starting module
- hdsl_impact: Analyze which files would be affected by changes
- hdsl_stats: Get codebase structure overview
- hdsl_patterns: Discover naming conventions and architectural patterns
- hdsl_path: Find the shortest path between two modules in the dependency graph
- hdsl_freshness: Check if Code Model is stale and optionally trigger incremental update

THE RIS SHOULD INSTRUCT THE AGENT TO USE THESE TOOLS:
1. Before creating new files, use hdsl_search to check if similar functionality exists
2. Before modifying shared modules, use hdsl_impact to understand ripple effects
3. When integrating with existing code, use hdsl_peek to understand module interfaces
4. When following patterns, use hdsl_patterns to discover conventions
5. Prefer Code Model tools over raw Grep/Glob for codebase navigation — they're faster and more accurate

IMPORTANT — CODE MODEL FRESHNESS:
During debugging or when fixing issues after the initial implementation:
- Run hdsl_freshness with autoUpdate: true to refresh the Code Model with recent changes
- This ensures hdsl_impact and hdsl_deps reflect the latest code state
- If you've made significant changes and Code Model results seem stale, refresh first
`;

// Instructions template for how to write tool usage guidance in the RIS
const RIS_TOOL_INSTRUCTIONS_TEMPLATE = `
## Codebase Navigation
Before implementing, use the Code Model tools to understand the codebase:
- Run \`hdsl_search\` with relevant keywords to find existing patterns
- Run \`hdsl_peek\` on files you need to integrate with
- Run \`hdsl_impact\` before modifying any file used by other modules

Prefer Code Model queries over Grep/Glob for:
- Finding where a pattern is used: hdsl_search instead of grep
- Understanding module relationships: hdsl_deps instead of reading imports
- Assessing change risk: hdsl_impact instead of manual tracing

### During Debugging
If fixing issues or making adjustments after the initial implementation:
1. Run \`hdsl_freshness\` with \`autoUpdate: true\` to refresh the Code Model
2. Then use hdsl_impact to assess how your fixes affect other modules
3. This ensures accurate dependency information after code changes
`;

/**
 * Builds the generate-ris prompt.
 *
 * @param {Object} params
 * @param {Object} params.planItem - The plan item for this story.
 * @param {Object} params.story - The user story.
 * @param {Array<Object>} [params.assertions] - Inspection assertions for this story.
 * @param {string} [params.codeModelContext] - Structured code model context.
 * @param {Object} [params.projectConfig] - Project config (branch, conventions, etc.).
 * @param {number} [params.maxLength] - Maximum RIS length in characters.
 * @param {boolean} [params.includeToolGuidance] - Whether to include Code Model tool guidance (default: true).
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildPrompt({ planItem, story, assertions = [], codeModelContext = '', projectConfig = {}, maxLength = 12000, includeToolGuidance = true }) {
  const toolsBlock = includeToolGuidance ? CODE_MODEL_TOOLS_BLOCK : '';

  const system = `You are generating a Refined Implementation Specification (RIS) document. The RIS is the SOLE instruction document given to a coding agent (Claude Code CLI) to implement a user story. The coding agent has NO other context — it relies entirely on the RIS for what to build, how to build it, and how to verify it.

Your RIS must be a complete, detailed, unambiguous implementation guide. Think of it as a senior developer writing step-by-step instructions for a capable but context-less implementor. Every file, every function, every data flow must be spelled out.
${toolsBlock}`;

  const ac = (story.acceptanceCriteria || []).map((c, i) => `  ${i + 1}. ${c}`).join('\n');

  const assertionsBlock = assertions.length > 0
    ? `\nINSPECTION ASSERTIONS (must be satisfied):\n${assertions.map(a => `- [${a.type}] ${a.message} (target: ${a.target})`).join('\n')}\n`
    : '';

  const contextBlock = codeModelContext
    ? `\nCODEBASE CONTEXT (existing code the agent can reference):\n${codeModelContext}\n`
    : '';

  const filesCreated = (planItem.filesCreated || []).join(', ') || 'none';
  const filesModified = (planItem.filesModified || []).join(', ') || 'none';
  const dependencies = (planItem.dependencies || []).join(', ') || 'none';

  const task = `Generate a detailed RIS document for the following story and plan item.
${contextBlock}
STORY: ${story.title} [${story.id}]
Description: ${story.description}
Acceptance Criteria:
${ac}

PLAN ITEM:
Order: ${planItem.order}
Approach: ${planItem.approach}
Files to create: ${filesCreated}
Files to modify: ${filesModified}
Dependencies: ${dependencies}
${assertionsBlock}
PROJECT CONFIG:
Branch: ${projectConfig.branch || 'unknown'}
Coding style: ${projectConfig.codingStyle || 'camelCase/JSDoc'}`;

  const constraints = `OUTPUT FORMAT — respond with ONLY a valid JSON object:
{
  "markdown": "<the full RIS markdown document>",
  "sections": {
    "context": "<context section content>",
    "objective": "<objective section content>",
    "navigation": "<codebase navigation tool guidance>",
    "instructions": "<instructions section content>",
    "conventions": "<conventions section content>",
    "assertions": "<assertions checklist content>"
  }
}

RIS MARKDOWN STRUCTURE:
The "markdown" field must contain ALL of these sections, in order:

## Context
- Branch: <branch name>
- Dependencies: <list of story dependencies that must be completed first>
- Code model version / relevant existing files

## Objective
A clear, 2-3 sentence statement of what this implementation achieves and why it matters. Reference the user story title and key acceptance criteria.

## Acceptance Criteria
Reproduce ALL acceptance criteria from the user story verbatim as a numbered list. The coding agent needs these to verify completeness.

## Codebase Navigation
INCLUDE THIS SECTION to tell the implementing agent how to use Code Model tools:
- Before creating new files, run \`hdsl_search\` with relevant keywords to find existing patterns
- Before modifying shared modules, run \`hdsl_impact\` to understand ripple effects
- When integrating with existing code, run \`hdsl_peek\` to understand module interfaces
- Prefer Code Model queries (hdsl_*) over Grep/Glob for faster, more accurate navigation

Include specific tool invocations relevant to this story, e.g.:
- "Run hdsl_search pattern='authentication' to see how auth is handled elsewhere"
- "Run hdsl_deps path='src/main/plugin-manager.js' before modifying plugin registration"

## Implementation Instructions
This is the MOST IMPORTANT section. Provide exhaustive, step-by-step instructions:

For EACH file to create or modify:
1. **File path** — exact path relative to project root
2. **Purpose** — what this file does and why
3. **Exports / public API** — function signatures, class methods, parameters and return types
4. **Internal logic** — describe the algorithm, data flow, error handling. Be specific about:
   - What functions to implement and what they do
   - What parameters they accept and what they return
   - How they interact with other modules (imports, calls, events)
   - Edge cases and error conditions to handle
5. **Integration** — how this file connects to existing code (imports, registrations, event wiring)

For modifications to existing files, specify:
- Exactly what to add, change, or remove
- Where in the file the changes go (after which function, in which section)

Include data structures, state shapes, and IPC contracts where relevant.

## Conventions
- Naming conventions, coding patterns to follow
- Reference existing patterns in the codebase that should be matched
- Testing expectations (if any)

## Inspection Assertions
Render each assertion as a markdown checkbox:
- [ ] assertion description (type: X, target: path/to/file)

QUALITY RULES:
- Be DETAILED and SPECIFIC — the coding agent cannot ask follow-up questions
- Include ALL acceptance criteria — do not summarize or skip any
- Reference exact file paths, function names, class names, and module exports
- Describe data structures with field names and types
- Include error handling requirements
- Keep total markdown under ${maxLength} characters
- Assertions rendered as markdown checkboxes: - [ ] description
- Do NOT use markdown code blocks in the JSON — output raw JSON only`;

  return { system, task, constraints };
}

module.exports = { buildPrompt };
