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
function buildPrompt({ planItem, story, assertions = [], codeModelContext = '', projectConfig = {}, maxLength = 5000 }) {
  const system = `You are generating a Refined Implementation Specification (RIS) document. You operate using the FOLLOW principle: track the plan, story, and codebase context to produce a precise, actionable implementation guide.

The RIS will be passed directly to a coding agent (3CLI) as its implementation instructions.`;

  const ac = (story.acceptanceCriteria || []).map((c, i) => `  ${i + 1}. ${c}`).join('\n');

  const assertionsBlock = assertions.length > 0
    ? `\nINSPECTION ASSERTIONS:\n${assertions.map(a => `- [${a.type}] ${a.message} (${a.target})`).join('\n')}\n`
    : '';

  const contextBlock = codeModelContext
    ? `\nCODEBASE CONTEXT:\n${codeModelContext}\n`
    : '';

  const task = `Generate a RIS document for the following story and plan item.
${contextBlock}
STORY: ${story.title} [${story.id}]
Description: ${story.description}
Acceptance Criteria:
${ac}

PLAN ITEM:
Order: ${planItem.order}
Approach: ${planItem.approach}
Files to create: ${(planItem.filesCreated || []).join(', ') || 'none'}
Files to modify: ${(planItem.filesModified || []).join(', ') || 'none'}
Dependencies: ${(planItem.dependencies || []).join(', ') || 'none'}
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
The markdown field must contain these sections:
1. ## Context — branch, dependencies, code model version
2. ## Objective — what this implementation achieves
3. ## Instructions — step-by-step implementation guide
4. ## Conventions — coding standards and patterns to follow
5. ## Assertions — checkbox list of inspection assertions

RULES:
- Keep total markdown under ${maxLength} characters
- Instructions should be specific and actionable
- Reference exact file paths and function names
- Assertions rendered as markdown checkboxes: - [ ] description
- Do NOT use markdown code blocks in the JSON — output raw JSON only`;

  return { system, task, constraints };
}

module.exports = { buildPrompt };
