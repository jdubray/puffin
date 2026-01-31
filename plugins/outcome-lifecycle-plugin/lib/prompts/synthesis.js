/**
 * Outcome Flow Synthesis Prompt
 *
 * Builds a prompt that asks Claude to synthesize a high-level outcome
 * flow diagram from granular lifecycle outcomes. The result is a
 * state-machine-like graph where nodes are business-value outcomes
 * and edges are temporal flow transitions.
 *
 * @module prompts/synthesis
 */

/**
 * Build the synthesis prompt for Claude.
 *
 * @param {Array<{title: string, status: string, storyMappings: string[]}>} lifecycles
 * @returns {string} Prompt text
 */
function buildSynthesisPrompt(lifecycles) {
  const outcomeList = lifecycles.map((lc, idx) =>
    `${idx + 1}. [${lc.status}] ${lc.title}`
  ).join('\n')

  const statusCounts = {
    not_started: lifecycles.filter(lc => lc.status === 'not_started').length,
    in_progress: lifecycles.filter(lc => lc.status === 'in_progress').length,
    achieved: lifecycles.filter(lc => lc.status === 'achieved').length
  }

  return `You are a business outcome synthesis engine. Respond with ONLY raw JSON. No markdown fences, no explanation, no preamble.

## What You Are Doing

You are analyzing granular outcomes extracted from a software project's user stories. Your job is to synthesize them into a HIGH-LEVEL outcome flow diagram — a state-machine-like graph that shows where business value is created.

## Critical Rules About Outcomes

1. **Outcomes express BUSINESS VALUE, not technical details.** "Users can authenticate" is an outcome. "Data saved to SQLite" is NOT — that's an implementation detail.
2. **Outcomes describe the happy path.** No error handling, no exceptions. Only the value-creating path.
3. **Outcomes are what could NOT be done without this project.** Each outcome represents a new capability that exists because the project was built.
4. **Iterative loops are OK when more iterations create more value.** For example, "Sprint Delivered" can loop back to "Sprint Planned" because each iteration delivers new value.
5. **This is NOT a workflow.** A workflow shows process steps. An outcome flow shows VALUE STATES — states where new business value has been created. A complete workflow eventually reaches an outcome.
6. **Node labels must be SHORT (2-5 words).** They need to fit in a diagram. Think: "Specs Validated", "Sprint Delivered", "Knowledge Preserved".

## About This Project

Puffin is an Electron GUI that orchestrates the Claude Code CLI for software development. Its core value chain:
- Specifications are prompted, collaboratively refined, reviewed, and detail-designed
- Ready specs produce user stories, assembled into sprints
- Sprints are planned, approved, implemented, reviewed, tested, and committed
- User stories yield outcome lifecycles
- Sprint results are memorized as project knowledge
- GUI aspects of specs can be visually designed

## Granular Outcomes to Synthesize (${lifecycles.length} total)

Status: ${statusCounts.achieved} achieved, ${statusCounts.in_progress} in progress, ${statusCounts.not_started} not started

${outcomeList}

## Output Format

Produce a JSON object with this exact structure:

{
  "nodes": [
    {
      "id": "short-kebab-id",
      "label": "Short Label",
      "description": "One sentence describing the business value this outcome represents",
      "aggregates": [1, 5, 12],
      "status": "achieved"
    }
  ],
  "edges": [
    {
      "from": "source-node-id",
      "to": "target-node-id",
      "label": ""
    }
  ]
}

CONSTRAINTS:
- Create 8-15 nodes. Each one is a distinct business value state.
- Node labels: 2-5 words max. Short enough for a diagram box.
- Every granular outcome (1-${lifecycles.length}) must appear in exactly one node's aggregates array.
- Status: "achieved" if ALL aggregated outcomes are achieved; "in_progress" if ANY are in_progress or mixed; "not_started" if ALL are not_started.
- Edges represent temporal flow: "from this outcome state, you can reach this outcome state".
- Edges MAY form loops when iterative value creation makes sense (e.g., sprint cycle).
- No self-loops. Every node must be reachable from at least one other node OR be a starting state.
- Edge "label" is optional — leave empty string if transition is obvious.

Your ENTIRE response must be parseable by JSON.parse(). No other text.`
}

module.exports = { buildSynthesisPrompt }
