'use strict';

/**
 * @module prompts/generate-plan
 * FOLLOW operation — produces an ordered implementation plan from user stories.
 *
 * Takes user stories, clarification answers, and code model context
 * to generate a dependency-ordered plan with file-level granularity.
 */

// Code Model tool guidance block for planning prompts
const CODE_MODEL_TOOLS_BLOCK = `
CODE MODEL TOOLS AVAILABLE:
You have access to h-DSL Code Model tools to analyze the codebase structure:
- hdsl_search: Find modules by pattern, tag, or semantic description
- hdsl_peek: Get artifact summary (exports, dependencies, purpose) without reading full file
- hdsl_deps: List incoming/outgoing dependencies for any module
- hdsl_trace: Follow dependency chains to understand impact radius
- hdsl_impact: Analyze which files would be affected by changes to a module
- hdsl_stats: Get codebase overview and structure

USE THESE TOOLS FOR PLANNING:
- Before specifying files to modify, use hdsl_deps to understand what else depends on them
- Use hdsl_impact to assess risk when modifying shared modules
- Use hdsl_search to find existing patterns that new code should follow
- Use hdsl_trace to map out the dependency graph for complex changes
`;

/**
 * Builds the generate-plan prompt.
 *
 * @param {Object} params
 * @param {Array<Object>} params.stories - User stories.
 * @param {Array<Object>} [params.answers] - Answers to ambiguity questions.
 * @param {string} [params.codeModelContext] - Structured code model context.
 * @param {Object} [params.config] - CRE config (maxPlanIterations, etc.).
 * @param {boolean} [params.includeToolGuidance] - Whether to include Code Model tool guidance (default: true).
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildPrompt({ stories, answers = [], codeModelContext = '', config = {}, includeToolGuidance = true }) {
  const toolsBlock = includeToolGuidance ? CODE_MODEL_TOOLS_BLOCK : '';

  const system = `You are an expert software architect creating implementation plans. You operate using the FOLLOW principle: track connections and dependencies to produce a coherent, ordered plan.

You produce plans that a developer can execute story-by-story with clear file targets and acceptance verification.
${toolsBlock}`;

  const storiesBlock = stories.map(s => {
    const ac = (s.acceptanceCriteria || []).map((c, i) => `  ${i + 1}. ${c}`).join('\n');
    return `Story: ${s.title} [${s.id}]\nDescription: ${s.description}\nAcceptance Criteria:\n${ac}`;
  }).join('\n\n---\n\n');

  const answersBlock = answers.length > 0
    ? `\nCLARIFICATION ANSWERS:\n${answers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')}\n`
    : '';

  const contextBlock = codeModelContext
    ? `\nCODEBASE CONTEXT:\n${codeModelContext}\n`
    : '';

  const task = `Generate an ordered implementation plan for the following user stories.
${contextBlock}${answersBlock}
--- BEGIN USER STORIES ---
${storiesBlock}
--- END USER STORIES ---

Produce a plan where each item maps to a user story and specifies:
- Implementation order based on dependencies
- Files to create or modify
- Key technical decisions
- Dependencies on other plan items`;

  const constraints = `OUTPUT FORMAT — respond with ONLY a valid JSON object:
{
  "planItems": [
    {
      "order": 1,
      "storyId": "<story id>",
      "title": "<short title>",
      "approach": "<technical approach summary>",
      "filesCreated": ["<path>"],
      "filesModified": ["<path>"],
      "dependencies": ["<storyId of dependency>"],
      "complexity": "low" | "medium" | "high",
      "notes": "<implementation notes>"
    }
  ],
  "sharedComponents": [
    {
      "path": "<file path>",
      "purpose": "<why shared>",
      "usedBy": ["<storyId>"]
    }
  ],
  "risks": ["<risk description>"]
}

RULES:
- Order items so dependencies come before dependents
- Detect and report circular dependencies as risks
- Use relative paths from project root
- Each story must appear exactly once in planItems
- Do NOT use markdown code blocks — output raw JSON only`;

  return { system, task, constraints };
}

module.exports = { buildPrompt };
