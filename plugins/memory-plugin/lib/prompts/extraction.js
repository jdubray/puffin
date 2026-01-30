/**
 * Main Extraction Prompt
 *
 * Builds the LLM prompt that analyzes branch thread conversations and extracts
 * domain-level knowledge: architectural decisions, cross-cutting concerns,
 * conventions, and bug patterns. Rejects feature-specific knowledge.
 *
 * @module prompts/extraction
 */

const { SECTIONS } = require('../branch-template.js')

/**
 * Format an array of prompt/response pairs into a readable transcript
 * @param {Array<{ content: string, response: { content: string } }>} prompts
 * @returns {string} Formatted conversation transcript
 */
function formatTranscript(prompts) {
  return prompts.map((p, i) => {
    const userText = p.content || ''
    const assistantText = (p.response && p.response.content) || ''
    return `--- Turn ${i + 1} ---\nUser: ${userText}\n\nAssistant: ${assistantText}`
  }).join('\n\n')
}

/**
 * Build the extraction prompt for a branch conversation
 * @param {Array<{ content: string, response: { content: string } }>} prompts - Conversation turns
 * @param {string} branchId - Branch identifier for context
 * @returns {string} Complete prompt to send to the LLM
 */
function buildExtractionPrompt(prompts, branchId) {
  const transcript = formatTranscript(prompts)

  return `You are a knowledge extraction engine for the "${branchId}" branch of a software project.

Analyze the following conversation transcript and extract ONLY domain-level knowledge that applies across the entire codebase. Do NOT extract feature-specific implementation details.

## What to Extract

1. **${SECTIONS.FACTS}**: Cross-cutting technical facts, assumptions, constraints, and glossary terms that affect the whole solution.
2. **${SECTIONS.ARCHITECTURAL_DECISIONS}**: Design choices, trade-offs, and rationale that span multiple components.
3. **${SECTIONS.CONVENTIONS}**: Coding standards, naming patterns, structural rules, and project-wide conventions.
4. **${SECTIONS.BUG_PATTERNS}**: Recurring issues, root causes, and fixes that could affect multiple areas.

## Scope Filter — IMPORTANT

REJECT any knowledge that is:
- Specific to a single feature, module, or component
- About transient implementation state (e.g. "we fixed bug X in file Y")
- Trivially obvious or already implied by the tech stack
- Opinion or preference without project-wide impact

ACCEPT only knowledge that:
- Needs to be known and enforced across the entire solution
- Affects architectural or cross-cutting concerns
- Represents a decision, constraint, or pattern that applies broadly

## Output Format

Respond with ONLY valid JSON matching this schema (no markdown, no explanation):

\`\`\`
{
  "extractions": [
    {
      "section": "<one of: ${Object.values(SECTIONS).join(', ')}>",
      "content": "<concise statement of the knowledge>",
      "confidence": <0.0 to 1.0>,
      "source_turns": [<turn numbers that support this extraction>]
    }
  ]
}
\`\`\`

If there is nothing worth extracting, return: {"extractions": []}

## Conversation Transcript

${transcript}`
}

module.exports = {
  buildExtractionPrompt,
  formatTranscript
}
