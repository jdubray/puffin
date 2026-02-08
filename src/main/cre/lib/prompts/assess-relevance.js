'use strict';

/**
 * @module prompts/assess-relevance
 * JUDGE operation — ranks code model artifacts by relevance to a task.
 *
 * Used during the FILTER phase of context building to narrow down
 * which artifacts are most relevant to include in prompts.
 */

/**
 * Builds the assess-relevance prompt.
 *
 * @param {Object} params
 * @param {string} params.taskDescription - Description of the current task.
 * @param {Array<Object>} params.artifacts - Candidate artifacts with id, path, summary, tags.
 * @param {number} [params.maxResults] - Maximum number of artifacts to return.
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildPrompt({ taskDescription, artifacts, maxResults = 10 }) {
  const system = `You are evaluating code artifacts for relevance to a development task. You operate using the JUDGE principle: evaluate validity and relevance of each artifact against the task requirements.

Be strict — only mark artifacts as relevant if they would meaningfully inform or be affected by the task.`;

  const artifactsList = artifacts.map((a, i) =>
    `${i + 1}. [${a.id || a.path}] ${a.summary || 'no summary'} (tags: ${(a.tags || []).join(', ') || 'none'})`
  ).join('\n');

  const task = `Rank the following code artifacts by relevance to this task.

TASK:
${taskDescription}

CANDIDATE ARTIFACTS:
${artifactsList}

Evaluate each artifact and assign a relevance score. Return only the most relevant artifacts (up to ${maxResults}).`;

  const constraints = `OUTPUT FORMAT — respond with ONLY a valid JSON object:
{
  "ranked": [
    {
      "id": "<artifact id or path>",
      "score": <0.0 to 1.0>,
      "reason": "<why this is relevant>"
    }
  ],
  "excluded": <number of artifacts excluded as irrelevant>
}

RULES:
- Score 0.0 = completely irrelevant, 1.0 = directly affected by task
- Return at most ${maxResults} artifacts, sorted by score descending
- Only include artifacts with score >= 0.3
- Reasons should be concise (one sentence)
- Do NOT use markdown code blocks — output raw JSON only`;

  return { system, task, constraints };
}

module.exports = { buildPrompt };
