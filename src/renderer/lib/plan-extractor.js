/**
 * plan-extractor - Turns a markdown plan into steps the board can hold.
 *
 * Deterministic, no model call. The Plan Review panel is where a human fixes
 * whatever these rules get wrong. Rules follow docs/PLAN_TO_BOARD_SPEC.md §5.
 */

const STEPS_HEADING = /^(steps?|plan|implementation( plan| steps)?|tasks?|work|changes|delivery( steps)?|approach)\b/i
const NON_STEP_HEADING = /^(context|background|summary|overview|goal|goals|purpose|verification|verify|testing|tests|risks?|open questions?|notes?|assumptions?|out of scope|non-goals|prerequisites?)\b/i
const CRITERIA_HEADING = /^(verify|verification|test|tests|testing|done when|acceptance)\b/i
const DEP_PATTERNS = [
  /\b(?:after|requires|depends on|once|following|needs)\s+steps?\s+#?(\d+(?:\s*(?:,|and)\s*#?\d+)*)/gi,
  /\bstep\s+#?(\d+)\s+(?:must|should|has to)\s+(?:be\s+)?(?:done|complete|finished)/gi
]
const CHECKBOX = /^\s*[-*+]\s*\[[ xX]\]\s*(.+)$/
const BULLET = /^\s*[-*+]\s+(.+)$/
const ORDERED = /^\s*(\d+)[.)]\s+(.+)$/
const FILE_REF = /`([^`\n]*[\w-]+\.[a-z0-9]{1,6})`/g

/**
 * Strip markdown emphasis from a heading/title.
 * @param {string} s
 * @returns {string}
 */
function clean(s) {
  return String(s || '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Split markdown into `{ level, title, lines }` sections by ATX headings.
 * The text before the first heading is a section with `level: 0`.
 * @param {string[]} lines
 * @returns {Object[]}
 */
function sections(lines) {
  const out = [{ level: 0, title: '', lines: [] }]
  let inFence = false
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence
    const h = !inFence && line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (h) out.push({ level: h[1].length, title: clean(h[2]), rawTitle: h[2], lines: [] })
    else out[out.length - 1].lines.push(line)
  }
  return out
}

/**
 * Parse an ordered list at the top level of `lines` into items with their indented continuation.
 * @param {string[]} lines
 * @returns {{ title: string, lines: string[] }[]}
 */
function orderedItems(lines) {
  const items = []
  let current = null
  let inFence = false
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence
    const m = !inFence && line.match(ORDERED)
    if (m && (line.search(/\S/) <= 3)) {
      current = { title: clean(m[2]), rawTitle: m[2], lines: [] }
      items.push(current)
    } else if (current) {
      if (line.trim() === '' || /^\s{2,}/.test(line) || /^\t/.test(line) || inFence) current.lines.push(line.replace(/^ {2,4}|^\t/, ''))
      else if (items.length && !line.match(ORDERED)) current.lines.push(line) // wrapped prose
    }
  }
  return items
}

/**
 * Acceptance criteria inside a step body: checkboxes, and bullets under a verify/test sub-heading.
 * @param {string[]} lines
 * @returns {{ criteria: string[], rest: string[] }}
 */
function criteriaFrom(lines) {
  const criteria = []
  const rest = []
  let underCriteria = false
  for (const line of lines) {
    const h = line.match(/^\s*(?:#{1,6}\s+|\*\*)?([A-Za-z ]+?)(?:\*\*)?:?\s*$/)
    if (h && CRITERIA_HEADING.test(h[1].trim()) && line.trim().length < 40) { underCriteria = true; continue }
    if (/^\s*#{1,6}\s+/.test(line)) underCriteria = false
    const cb = line.match(CHECKBOX)
    if (cb) { criteria.push(clean(cb[1])); continue }
    if (underCriteria) {
      const b = line.match(BULLET)
      if (b) { criteria.push(clean(b[1])); continue }
      if (line.trim() === '') continue
    }
    rest.push(line)
  }
  return { criteria, rest }
}

/**
 * "after step 2", "requires steps 1 and 3" → zero-based indices.
 * @param {string} text
 * @returns {number[]}
 */
function dependenciesFrom(text) {
  const found = new Set()
  for (const re of DEP_PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text))) {
      for (const n of m[1].match(/\d+/g) || []) found.add(parseInt(n, 10) - 1)
    }
  }
  return [...found].filter(i => i >= 0).sort((a, b) => a - b)
}

/**
 * A step whose first non-empty line is `/skill …`.
 * @param {string[]} lines
 * @param {string} title
 * @returns {string|null} The invocation line
 */
function skillFrom(lines, title) {
  const first = [title, ...lines].map(l => String(l || '').trim()).find(Boolean) || ''
  const m = first.match(/^(\/[a-z0-9][\w:-]*(?:\s.*)?)$/i)
  return m ? m[1].trim() : null
}

/**
 * Backticked file paths mentioned in a step.
 * @param {string} text
 * @returns {string[]}
 */
function filesFrom(text) {
  const files = new Set()
  let m
  FILE_REF.lastIndex = 0
  while ((m = FILE_REF.exec(text))) {
    const f = m[1].trim()
    if (/[/\\.]/.test(f) && !/\s/.test(f)) files.add(f)
  }
  return [...files]
}

/**
 * Attach whole-plan verification bullets to the steps they name, else to the last step.
 * @param {string[]} bullets
 * @param {Object[]} steps
 */
function distributeVerification(bullets, steps) {
  if (!steps.length) return
  for (const raw of bullets) {
    const text = clean(raw)
    if (!text) continue
    let target = null
    const stepRef = text.match(/\bstep\s+#?(\d+)\b/i)
    if (stepRef) target = steps[parseInt(stepRef[1], 10) - 1] || null
    if (!target) {
      const lower = text.toLowerCase()
      target = steps.find(s => s.title && s.title.length > 6 && lower.includes(s.title.toLowerCase())) || null
    }
    ;(target || steps[steps.length - 1]).acceptanceCriteria.push(text)
  }
}

/**
 * Extract the board-shaped plan from markdown.
 *
 * @param {string} markdown
 * @returns {{ title: string, context: string, steps: Object[], verification: string, warnings: string[] }}
 *   step: `{ title, body, acceptanceCriteria: string[], dependsOn: number[], skill: string|null, files: string[], include: true }`
 */
export function extractPlan(markdown) {
  const text = String(markdown || '').replace(/\r\n/g, '\n')
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '')
  const lines = body.split('\n')
  const secs = sections(lines)
  const warnings = []

  const h1 = secs.find(s => s.level === 1)
  const title = h1?.title || (lines.map(l => l.trim()).find(Boolean) || 'Untitled plan').replace(/^#+\s*/, '')

  const contextSec = secs.find(s => s.level > 0 && /^(context|background|summary|overview|purpose|goal)/i.test(s.title))
  const context = (contextSec ? contextSec.lines : (h1 ? [] : secs[0].lines)).join('\n').trim()

  const verificationSec = secs.find(s => s.level > 0 && /^(verification|verify|testing|tests)\b/i.test(s.title))
  const verification = verificationSec ? verificationSec.lines.join('\n').trim() : ''

  let rawSteps = []

  // Rule 1: an ordered list under a Steps/Plan/Tasks heading
  const stepsSec = secs.find(s => s.level > 0 && STEPS_HEADING.test(s.title))
  if (stepsSec) {
    const items = orderedItems(stepsSec.lines)
    if (items.length) rawSteps = items
    else {
      // Bulleted list under the steps heading
      const bullets = stepsSec.lines.filter(l => BULLET.test(l) && !CHECKBOX.test(l) && l.search(/\S/) === 0)
      if (bullets.length >= 2) rawSteps = bullets.map(l => ({ title: clean(l.match(BULLET)[1]), rawTitle: l.match(BULLET)[1], lines: [] }))
    }
    // Sub-headings under the steps heading (### Step 1 …)
    if (!rawSteps.length) {
      const idx = secs.indexOf(stepsSec)
      const subs = []
      for (let i = idx + 1; i < secs.length && secs[i].level > stepsSec.level; i++) subs.push(secs[i])
      if (subs.length) rawSteps = subs.map(s => ({ title: s.title.replace(/^step\s+\d+[:.)-]?\s*/i, ''), rawTitle: s.rawTitle, lines: s.lines }))
    }
  }

  // Rule 2: every level-2/3 heading that is not a known non-step section
  if (!rawSteps.length) {
    const candidates = secs.filter(s => (s.level === 2 || s.level === 3) && !NON_STEP_HEADING.test(s.title))
    const level = candidates.some(s => s.level === 2) ? 2 : 3
    const heads = candidates.filter(s => s.level === level)
    if (heads.length) rawSteps = heads.map(s => ({ title: s.title.replace(/^(?:step\s+)?\d+[:.)-]?\s*/i, ''), rawTitle: s.rawTitle, lines: s.lines }))
  }

  // Rule 3: a top-level ordered list anywhere
  if (!rawSteps.length) {
    const items = orderedItems(lines)
    if (items.length) rawSteps = items
  }

  if (!rawSteps.length) {
    warnings.push('No steps could be extracted; the whole plan is one step. Split it in the review panel.')
    rawSteps = [{ title, lines: lines.filter(l => !/^#\s/.test(l)) }]
  }

  const steps = rawSteps.map((raw, i) => {
    const { criteria, rest } = criteriaFrom(raw.lines)
    const bodyText = rest.join('\n').trim()
    const all = `${raw.rawTitle || raw.title}\n${bodyText}`
    return {
      index: i,
      title: raw.title || `Step ${i + 1}`,
      body: bodyText,
      acceptanceCriteria: criteria,
      dependsOn: dependenciesFrom(all).filter(d => d < i),
      skill: skillFrom(raw.lines, raw.title),
      files: filesFrom(all),
      include: true
    }
  })

  if (verification) {
    const bullets = verification.split('\n').map(l => (l.match(BULLET) || l.match(ORDERED))?.[l.match(BULLET) ? 1 : 2]).filter(Boolean)
    distributeVerification(bullets.length ? bullets : [verification], steps)
  }

  return { title: clean(title), context, steps, verification, warnings }
}

/**
 * The plan file Claude wrote during a plan-mode session, from the activity tracker's files.
 * @param {{ path: string, action: string }[]} filesModified
 * @returns {string|null} Absolute path of the newest write under a `.claude/plans` (or `plan`) dir
 */
export function planFileFromActivity(filesModified) {
  const hits = (filesModified || [])
    .filter(f => f && typeof f.path === 'string' && /[\\/]\.claude[\\/]plans?[\\/][^\\/]+\.md$/i.test(f.path))
  if (!hits.length) return null
  return hits[hits.length - 1].path
}

export default extractPlan
