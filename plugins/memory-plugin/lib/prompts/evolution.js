/**
 * Branch Memory Evolution Prompt
 *
 * Builds the LLM prompt that integrates newly extracted items into an existing
 * branch memory file. Detects conflicts, merges compatible facts, deduplicates,
 * and rewrites the branch summary.
 *
 * @module prompts/evolution
 */

const { SECTIONS } = require('../branch-template.js')

/**
 * Build the evolution prompt that merges new extractions into existing memory
 * @param {Object} existingSections - Current memory sections (from branch-template.parse())
 * @param {Array<{ section: string, content: string, confidence: number }>} newExtractions - New items from extraction prompt
 * @param {string} branchId - Branch identifier for context
 * @returns {string} Complete prompt to send to the LLM
 */
function buildEvolutionPrompt(existingSections, newExtractions, branchId) {
  const existingFormatted = formatExistingSections(existingSections)
  const newFormatted = formatNewExtractions(newExtractions)

  return `You are a knowledge evolution engine for the "${branchId}" branch memory of a software project.

Your job is to merge NEW extractions into the EXISTING memory. You must:

1. **Detect conflicts**: If a new item contradicts an existing item, keep the newer one and mark the old one as superseded.
2. **Merge compatible items**: If a new item refines or extends an existing item, combine them into a single, more complete statement.
3. **Deduplicate**: If a new item is already captured by an existing item, discard the new one.
4. **Preserve valid knowledge**: Do not remove existing items unless they are contradicted or subsumed.

## Existing Memory

${existingFormatted}

## New Extractions

${newFormatted}

## Output Format

Respond with ONLY valid JSON matching this schema (no markdown, no explanation):

\`\`\`
{
  "sections": {
    "${SECTIONS.FACTS}": ["<merged item 1>", "<merged item 2>"],
    "${SECTIONS.ARCHITECTURAL_DECISIONS}": ["<merged item 1>"],
    "${SECTIONS.CONVENTIONS}": ["<merged item 1>"],
    "${SECTIONS.BUG_PATTERNS}": ["<merged item 1>"]
  },
  "changes": [
    {
      "action": "<added | updated | removed | kept>",
      "section": "<section id>",
      "item": "<the item text>",
      "reason": "<brief explanation>"
    }
  ]
}
\`\`\`

The "sections" object is the complete merged result for each section. The "changes" array documents what you did and why (for audit purposes).

If no changes are needed, return the existing items unchanged with an empty "changes" array.`
}

/**
 * Format existing sections for the prompt
 * @param {Object} sections - Map of section ID to string array
 * @returns {string}
 */
function formatExistingSections(sections) {
  if (!sections || Object.keys(sections).length === 0) {
    return '_No existing memory._'
  }

  return Object.values(SECTIONS).map(sectionId => {
    const items = sections[sectionId] || []
    const itemsList = items.length > 0
      ? items.map(item => `- ${item}`).join('\n')
      : '_Empty_'
    return `### ${sectionId}\n${itemsList}`
  }).join('\n\n')
}

/**
 * Format new extractions for the prompt
 * @param {Array<{ section: string, content: string, confidence: number }>} extractions
 * @returns {string}
 */
function formatNewExtractions(extractions) {
  if (!extractions || extractions.length === 0) {
    return '_No new extractions._'
  }

  return extractions.map((e, i) =>
    `${i + 1}. [${e.section}] (confidence: ${e.confidence}) ${e.content}`
  ).join('\n')
}

module.exports = {
  buildEvolutionPrompt,
  formatExistingSections,
  formatNewExtractions
}
