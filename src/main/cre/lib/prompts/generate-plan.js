'use strict';

/**
 * @module prompts/generate-plan
 * FOLLOW operation — produces an ordered implementation plan from user stories.
 *
 * Takes user stories, clarification answers, and code model context
 * to generate a dependency-ordered plan with file-level granularity.
 */

/**
 * Builds the generate-plan prompt.
 *
 * @param {Object} params
 * @param {Array<Object>} params.stories - User stories.
 * @param {Array<Object>} [params.answers] - Answers to ambiguity questions.
 * @param {string} [params.codeModelContext] - Structured code model context.
 * @param {Object} [params.config] - CRE config (maxPlanIterations, etc.).
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildPrompt({ stories, answers = [], codeModelContext = '', config = {} }) {
  const system = `You are an expert software architect creating implementation plans. You operate using the FOLLOW principle: track connections and dependencies to produce a coherent, ordered plan.

You produce plans that a developer can execute story-by-story with clear file targets and acceptance verification.`;

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
USER STORIES:
${storiesBlock}

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
