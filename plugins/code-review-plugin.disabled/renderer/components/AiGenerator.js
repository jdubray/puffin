/**
 * Generates acceptance criteria, RIS, assertions, and sort order via Claude CLI.
 * Runs in the renderer process — uses window.puffin.claude.
 * disableTools: true on all calls (structured output, no exploration needed).
 */
export class AiGenerator {
  constructor(pluginContext) {
    this._context = pluginContext
  }

  /**
   * Refine acceptance criteria for a story.
   * @param {object} story
   * @returns {Promise<string[]>}
   */
  async generateAc(story) {
    const acText = Array.isArray(story.acceptanceCriteria)
      ? story.acceptanceCriteria.join('\n')
      : (story.acceptanceCriteria || '')

    const prompt = `You are reviewing a static-analysis code review story for a Puffin (Electron) project.

Story title: ${story.title}
Description: ${story.description}

Current acceptance criteria:
${acText}

Task: Refine these acceptance criteria. Keep what is good, improve clarity, and add any missing criteria that a thorough code review of an Electron/Node.js project should check. Return ONLY a JSON array of strings, one criterion per element. No markdown, no explanation.

Example output:
["Review detects X without Y", "Review flags Z", "Findings written to docs/X-YYYY-MM-DD.md"]`

    const result = await this._sendPrompt(prompt)
    try {
      const parsed = JSON.parse(this._extractJson(result))
      if (Array.isArray(parsed)) return parsed
    } catch { /* fall through */ }
    return result.split('\n').map(l => l.replace(/^[-"'\s]+|[-"'\s]+$/g, '')).filter(Boolean)
  }

  /**
   * Generate a RIS (Requirements Implementation Specification) for a story.
   * @param {object} story
   * @returns {Promise<string>}
   */
  async generateRis(story) {
    const ac = Array.isArray(story.acceptanceCriteria)
      ? story.acceptanceCriteria.map(c => `- ${c}`).join('\n')
      : (story.acceptanceCriteria || '')

    const prompt = `You are writing a Requirements Implementation Specification (RIS) for a static-analysis code review service in a Puffin (Electron/Node.js) project.

Story: ${story.title}
Description: ${story.description}

Acceptance Criteria:
${ac}

Write a concise RIS in markdown. Include:
1. **Scope** — which directories/files the service analyses
2. **Class** — the service class name and its public methods with signatures
3. **Key implementation notes** — regex patterns, confidence scores, heuristics for each rule
4. **IPC channel** — the channel name following the pattern review:run<Name>

Be specific and actionable. Use code blocks for class/method signatures.`

    return this._sendPrompt(prompt)
  }

  /**
   * Generate implementation assertions for a story.
   * @param {object} story
   * @returns {Promise<object[]>}
   */
  async generateAssertions(story) {
    const ac = Array.isArray(story.acceptanceCriteria)
      ? story.acceptanceCriteria.map(c => `- ${c}`).join('\n')
      : (story.acceptanceCriteria || '')

    const prompt = `Generate implementation assertions for this code review story.

Story: ${story.title}
Service class: ${story.reviewServiceClass || '(unknown)'}
RIS:
${story.ris || '(not yet generated)'}

Acceptance Criteria:
${ac}

Return ONLY a JSON array of assertion objects. Each object must have:
- "type": one of "file_exists", "export_exists", "function_signature", "file_contains", "pattern_match"
- "target": the specific file path, class name, method name, or pattern to check
- "detail": a one-sentence description of what this assertion verifies

Generate 7-10 assertions covering: file existence, class export, key method signatures, IPC handler registration, and at least one pattern assertion.

Example:
[
  {"type":"file_exists","target":"src/main/review/database-integrity-review.js","detail":"Analyser module exists"},
  {"type":"export_exists","target":"DatabaseIntegrityReview","detail":"Class exported from module"}
]`

    const result = await this._sendPrompt(prompt)
    try {
      const parsed = JSON.parse(this._extractJson(result))
      if (Array.isArray(parsed)) {
        return parsed.map(a => ({ ...a, id: crypto.randomUUID(), status: 'pending' }))
      }
    } catch { /* fall through */ }
    return []
  }

  /**
   * Ask Claude to sort stories into optimal execution order.
   * Summary/aggregate stories are placed last; foundational stories first.
   * @param {object[]} stories
   * @returns {Promise<string[]>} ordered array of story IDs
   */
  async sortStories(stories) {
    if (stories.length <= 1) return stories.map(s => s.id)

    const list = stories.map((s, i) =>
      `${i + 1}. ID="${s.id}" | ${s.title}${s.description ? ` — ${s.description.slice(0, 150)}` : ''}`
    ).join('\n')

    const prompt = `You are ordering code review stories for sequential execution in a Puffin project review run.

Stories:
${list}

Ordering rules (apply in priority order):
1. Stories that generate a summary, aggregate findings, or produce a master/overview report → run LAST
2. Stories that analyze specific subsystems or rules → run first
3. Within the same tier, preserve the original order

Return ONLY a JSON array of the ID strings in execution order. Do not include any other text.
Example: ["id-a", "id-b", "id-c"]`

    const result = await this._sendPrompt(prompt)
    try {
      const parsed = JSON.parse(this._extractJson(result))
      if (Array.isArray(parsed)) {
        const validIds = new Set(stories.map(s => s.id))
        const filtered = parsed.filter(id => validIds.has(id))
        // Return sorted list; append any IDs not returned by Claude at the end
        const missing = stories.map(s => s.id).filter(id => !filtered.includes(id))
        return [...filtered, ...missing]
      }
    } catch { /* fall through */ }
    return stories.map(s => s.id)
  }

  async _sendPrompt(prompt) {
    if (!window.puffin?.claude?.sendPrompt) {
      throw new Error('Claude service not available')
    }
    const result = await window.puffin.claude.sendPrompt(prompt, {
      disableTools: true,
      maxTurns: 1
    })
    if (!result.success) throw new Error(result.error || 'Claude returned no response')
    return result.response || ''
  }

  /**
   * Extract raw JSON from a response that may be wrapped in markdown code fences.
   */
  _extractJson(text) {
    const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (fenced) return fenced[1].trim()
    const arr = text.match(/(\[[\s\S]*\])/)
    if (arr) return arr[1]
    const obj = text.match(/(\{[\s\S]*\})/)
    if (obj) return obj[1]
    return text.trim()
  }
}
