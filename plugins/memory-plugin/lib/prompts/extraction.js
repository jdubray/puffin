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
 * Maximum character budget for the transcript portion of the prompt.
 * Claude CLI input has practical limits; exceeding ~100k chars risks exit code 1.
 * We cap per-turn content and the overall transcript to stay within bounds.
 */
const MAX_TRANSCRIPT_CHARS = 80000
const MAX_TURN_CHARS = 2000

/**
 * Format an array of prompt/response pairs into a readable transcript.
 * Truncates individual turns and the overall transcript to stay within
 * CLI input limits.
 * @param {Array<{ content: string, response: { content: string } }>} prompts
 * @returns {string} Formatted conversation transcript
 */
function formatTranscript(prompts) {
  const turns = prompts.map((p, i) => {
    let userText = p.content || ''
    let assistantText = (p.response && p.response.content) || ''

    // Truncate individual turn content to avoid single massive turns
    if (userText.length > MAX_TURN_CHARS) {
      userText = userText.slice(0, MAX_TURN_CHARS) + '\n[...truncated]'
    }
    if (assistantText.length > MAX_TURN_CHARS) {
      assistantText = assistantText.slice(0, MAX_TURN_CHARS) + '\n[...truncated]'
    }

    return `--- Turn ${i + 1} ---\nUser: ${userText}\n\nAssistant: ${assistantText}`
  })

  // Build transcript within the character budget
  let transcript = ''
  for (const turn of turns) {
    if (transcript.length + turn.length > MAX_TRANSCRIPT_CHARS) {
      transcript += `\n\n[...${turns.length - turns.indexOf(turn)} remaining turns truncated for length]`
      break
    }
    transcript += (transcript ? '\n\n' : '') + turn
  }

  return transcript
}

/**
 * Build the extraction prompt for a branch conversation
 * @param {Array<{ content: string, response: { content: string } }>} prompts - Conversation turns
 * @param {string} branchId - Branch identifier for context
 * @returns {string} Complete prompt to send to the LLM
 */
function buildExtractionPrompt(prompts, branchId) {
  const transcript = formatTranscript(prompts)

  return `You are a JSON-only knowledge extraction engine. You MUST respond with raw JSON and nothing else. No markdown, no explanation, no apologies, no preamble.

Branch: "${branchId}"

Analyze the conversation transcript below and extract ONLY domain-level knowledge that applies across the entire codebase. Do NOT extract feature-specific implementation details.

Extract into these sections:
- "${SECTIONS.FACTS}": Cross-cutting technical facts, constraints, glossary terms
- "${SECTIONS.ARCHITECTURAL_DECISIONS}": Design choices and trade-offs spanning multiple components
- "${SECTIONS.CONVENTIONS}": Coding standards, naming patterns, structural rules
- "${SECTIONS.BUG_PATTERNS}": Recurring issues and root causes affecting multiple areas

REJECT knowledge that is feature-specific, transient, trivially obvious, or opinion without project-wide impact.
ACCEPT knowledge that applies broadly, affects architecture, or represents project-wide decisions/constraints.

If nothing worth extracting, respond: {"extractions": []}

Otherwise respond with ONLY this JSON (no other text):
{"extractions": [{"section": "<${Object.values(SECTIONS).join('|')}>", "content": "<concise statement>", "confidence": <0.0-1.0>, "source_turns": [<turn numbers>]}]}

IMPORTANT: Your entire response must be parseable by JSON.parse(). Do not wrap in markdown fences. Do not include any text before or after the JSON.

## Conversation Transcript

${transcript}`
}

module.exports = {
  buildExtractionPrompt,
  formatTranscript
}
