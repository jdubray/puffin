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

  return `You are a JSON-only knowledge evolution engine. You MUST respond with raw JSON and nothing else. No markdown, no explanation, no preamble.

Branch: "${branchId}"

Merge NEW extractions into EXISTING memory:
- Detect conflicts: keep newer, mark old as superseded
- Merge compatible: combine into single statement
- Deduplicate: discard if already captured
- Preserve valid: don't remove unless contradicted

## Existing Memory

${existingFormatted}

## New Extractions

${newFormatted}

Respond with ONLY this JSON (no other text):
{"sections": {"${SECTIONS.FACTS}": ["item1"], "${SECTIONS.ARCHITECTURAL_DECISIONS}": ["item1"], "${SECTIONS.CONVENTIONS}": ["item1"], "${SECTIONS.BUG_PATTERNS}": ["item1"]}, "changes": [{"action": "added|updated|removed|kept", "section": "id", "item": "text", "reason": "why"}]}

"sections" = complete merged result. "changes" = audit log. If no changes needed, return existing items with empty "changes" array.

IMPORTANT: Your entire response must be parseable by JSON.parse(). Do not wrap in markdown fences. Do not include any text before or after the JSON.`
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
