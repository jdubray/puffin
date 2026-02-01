'use strict';

/**
 * @module prompts/refine-plan
 * FOLLOW operation — updates an existing plan based on developer feedback.
 */

/**
 * Builds the refine-plan prompt.
 *
 * @param {Object} params
 * @param {Object} params.plan - The current plan object.
 * @param {string} params.feedback - Developer feedback text.
 * @param {string} [params.codeModelContext] - Structured code model context.
 * @param {number} [params.iteration] - Current refinement iteration number.
 * @returns {{ system: string, task: string, constraints: string }}
 */
function buildPrompt({ plan, feedback, codeModelContext = '', iteration = 1 }) {
  const system = `You are an expert software architect refining an implementation plan based on developer feedback. You operate using the FOLLOW principle: preserve the valid parts of the existing plan while incorporating changes.

Be conservative — only change what the feedback requires. Do not reorganize or rearchitect unprompted.`;

  const contextBlock = codeModelContext
    ? `\nCODEBASE CONTEXT:\n${codeModelContext}\n`
    : '';

  const task = `Refine the following implementation plan based on developer feedback.
This is refinement iteration ${iteration}.
${contextBlock}
CURRENT PLAN:
${JSON.stringify(plan, null, 2)}

DEVELOPER FEEDBACK:
${feedback}

Apply the feedback to produce an updated plan. Preserve unchanged items as-is.`;

  const constraints = `OUTPUT FORMAT — respond with ONLY a valid JSON object matching the same schema as the input plan:
{
  "planItems": [...],
  "sharedComponents": [...],
  "risks": [...],
  "changelog": ["<description of each change made>"]
}

RULES:
- Include a changelog array describing what changed and why
- Preserve plan item order unless feedback explicitly requests reordering
- Maintain all existing fields; do not drop data
- Re-validate dependencies after changes
- Do NOT use markdown code blocks — output raw JSON only`;

  return { system, task, constraints };
}

module.exports = { buildPrompt };
