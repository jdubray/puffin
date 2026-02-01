'use strict';

/**
 * @module prompts/analyze-ambiguities
 * GROUND operation — generates clarifying questions from user stories.
 *
 * Examines user stories for vague requirements, missing details,
 * implicit assumptions, and contradictions. Returns structured
 * questions the developer should answer before plan generation.
 */

/**
 * Builds the analyze-ambiguities prompt.
 *
 * @param {Object} params
 * @param {Array<Object>} params.stories - User stories with id, title, description, acceptanceCriteria.
 * @param {string} [params.codeModelSummary] - Optional code model context summary.
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildPrompt({ stories, codeModelSummary = '' }) {
  const system = `You are an expert requirements analyst. Your task is to identify ambiguities, gaps, and implicit assumptions in user stories before implementation planning begins.

You operate using the GROUND principle: establish a solid foundation of shared understanding before proceeding.`;

  const storiesBlock = stories.map(s => {
    const ac = (s.acceptanceCriteria || []).map((c, i) => `  ${i + 1}. ${c}`).join('\n');
    return `Story: ${s.title} [${s.id}]\nDescription: ${s.description}\nAcceptance Criteria:\n${ac}`;
  }).join('\n\n---\n\n');

  const contextBlock = codeModelSummary
    ? `\nEXISTING CODEBASE CONTEXT:\n${codeModelSummary}\n`
    : '';

  const task = `Analyze the following user stories and identify ambiguities that need clarification before implementation planning.
${contextBlock}
USER STORIES:
${storiesBlock}

For each ambiguity found, produce a clarifying question with:
- Which story it relates to
- What is ambiguous
- Why it matters for implementation
- Suggested options if applicable`;

  const constraints = `OUTPUT FORMAT — respond with ONLY a valid JSON object:
{
  "questions": [
    {
      "storyId": "<story id>",
      "question": "<clarifying question>",
      "reason": "<why this matters>",
      "suggestions": ["<option 1>", "<option 2>"],
      "priority": "high" | "medium" | "low"
    }
  ],
  "summary": "<brief summary of overall ambiguity level>"
}

RULES:
- Focus on implementation-relevant ambiguities, not cosmetic issues
- Prioritize questions that would change the technical approach
- If stories are clear, return an empty questions array
- Do NOT use markdown code blocks — output raw JSON only`;

  return { system, task, constraints };
}

module.exports = { buildPrompt };
