const { v4: uuidv4 } = require('uuid')

const SEVERITY_PATTERNS = [
  { re: /\*\*\[critical\]\*\*/i, severity: 'critical' },
  { re: /\[critical\]/i, severity: 'critical' },
  { re: /\*\*\[important\]\*\*/i, severity: 'important' },
  { re: /\[important\]/i, severity: 'important' },
  { re: /\*\*\[info\]\*\*/i, severity: 'info' },
  { re: /\[info\]/i, severity: 'info' }
]

// Matches: RULE_ID  path/to/file.js:42
const LOCATION_RE = /([A-Z_]{3,30})\s+([^\s:]+\.js)(?::(\d+))?/

class FindingParser {
  /**
   * Parse a review markdown document into structured action items.
   * @param {string} markdown
   * @returns {ActionItem[]}
   */
  parse(markdown) {
    const lines = markdown.split('\n')
    const items = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('-') && !trimmed.startsWith('*')) continue

      const severityMatch = SEVERITY_PATTERNS.find(p => p.re.test(trimmed))
      if (!severityMatch) continue

      const locationMatch = LOCATION_RE.exec(trimmed)
      const rule = locationMatch ? locationMatch[1] : 'UNKNOWN'
      const file = locationMatch ? locationMatch[2] : ''
      const lineNum = locationMatch && locationMatch[3] ? parseInt(locationMatch[3], 10) : null

      // Strip markdown formatting for description
      const description = trimmed
        .replace(/^[-*]\s+/, '')
        .replace(/\*\*\[.*?\]\*\*/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/`[^`]+`/g, m => m)
        .trim()

      items.push({
        id: uuidv4(),
        rule,
        severity: severityMatch.severity,
        file,
        line: lineNum,
        description,
        rawText: trimmed
      })
    }

    return items
  }
}

module.exports = { FindingParser }
