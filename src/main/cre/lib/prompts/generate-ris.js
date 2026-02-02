'use strict';

/**
 * @module prompts/generate-ris
 * FOLLOW operation — produces a RIS (Refined Implementation Specification)
 * markdown document for a single user story.
 */

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
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildPrompt({ planItem, story, assertions = [], codeModelContext = '', projectConfig = {}, maxLength = 12000 }) {
  const system = `You are generating a Refined Implementation Specification (RIS) document. The RIS is the SOLE instruction document given to a coding agent (Claude Code CLI) to implement a user story. The coding agent has NO other context — it relies entirely on the RIS for what to build, how to build it, and how to verify it.

Your RIS must be a complete, detailed, unambiguous implementation guide. Think of it as a senior developer writing step-by-step instructions for a capable but context-less implementor. Every file, every function, every data flow must be spelled out.`;

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
