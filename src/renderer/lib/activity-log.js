/**
 * ActivityLog
 *
 * Persistent, per-project journal of significant user actions.
 * Written in plain English, grouped by workflow phase.
 *
 * Storage: localStorage, keyed by a hash of the project path.
 * Capacity: 200 entries rolling.
 */

const MAX_ENTRIES = 200

// ---------------------------------------------------------------------------
// Event catalogue — all possible event types
// ---------------------------------------------------------------------------

export const ActivityEventType = {
  PROJECT_OPENED:          'project_opened',
  CONFIG_SET:              'config_set',
  BRANCH_CREATED:          'branch_created',
  PROMPT_SENT:             'prompt_sent',
  DOC_ATTACHED:            'doc_attached',
  SPEC_SAVED:              'spec_saved',
  STORIES_DERIVED:         'stories_derived',
  STORIES_ADDED:           'stories_added',
  SPRINT_CREATED:          'sprint_created',
  PLAN_GENERATED:          'plan_generated',
  PLAN_ITERATED:           'plan_iterated',
  PLAN_APPROVED:           'plan_approved',
  STORY_STARTED:           'story_started',
  STORY_COMPLETED:         'story_completed',
  SPRINT_ALL_DONE:         'sprint_all_done',
  ASSERTIONS_GENERATED:    'assertions_generated',
  ASSERTIONS_PASSED:       'assertions_passed',
  ASSERTIONS_FAILED:       'assertions_failed',
  CODE_REVIEW_STARTED:     'code_review_started',
  BUG_FIX_STARTED:         'bug_fix_started',
  BUG_FIX_COMPLETED:       'bug_fix_completed',
  SPRINT_CLOSED:           'sprint_closed',
  COMMITTED:               'committed',
  BTW_ASKED:               'btw_asked',
}

// Phase labels matching the process map
const PHASE_LABELS = {
  0: 'Bootstrap',
  1: 'Discovery',
  2: 'Design',
  3: 'Decompose',
  4: 'Sprint Planning',
  5: 'Implement',
  6: 'Verify',
  7: 'Review & Fix',
  8: 'Document',
  9: 'Commit & Ship',
  10: 'Iterate',
}

// Human-readable templates for each event type
const EVENT_TEMPLATES = {
  [ActivityEventType.PROJECT_OPENED]:       { phase: 0, icon: '📁', label: (d) => `Opened project${d?.name ? ` "${d.name}"` : ''}` },
  [ActivityEventType.CONFIG_SET]:           { phase: 0, icon: '⚙️', label: () => 'Configured project path' },
  [ActivityEventType.BRANCH_CREATED]:       { phase: 0, icon: '🌿', label: (d) => `Created branch${d?.name ? ` "${d.name}"` : ''}` },
  [ActivityEventType.PROMPT_SENT]:          { phase: 1, icon: '💬', label: (d) => d?.first ? 'Started exploring with Claude' : 'Sent prompt to Claude' },
  [ActivityEventType.DOC_ATTACHED]:         { phase: 1, icon: '📎', label: () => 'Attached document to prompt' },
  [ActivityEventType.SPEC_SAVED]:           { phase: 1, icon: '📄', label: (d) => `Saved spec${d?.filename ? ` "${d.filename}"` : ' to docs/'}` },
  [ActivityEventType.STORIES_DERIVED]:      { phase: 3, icon: '📋', label: (d) => `Derived ${d?.count ?? '?'} user stories` },
  [ActivityEventType.STORIES_ADDED]:        { phase: 3, icon: '✅', label: (d) => `Added ${d?.count ?? '?'} stories to backlog` },
  [ActivityEventType.SPRINT_CREATED]:       { phase: 4, icon: '🏃', label: (d) => `Created sprint${d?.title ? ` "${d.title}"` : ''}` },
  [ActivityEventType.PLAN_GENERATED]:       { phase: 4, icon: '🗺️', label: () => 'Generated implementation plan' },
  [ActivityEventType.PLAN_ITERATED]:        { phase: 4, icon: '🔄', label: () => 'Iterated on plan' },
  [ActivityEventType.PLAN_APPROVED]:        { phase: 4, icon: '✅', label: () => 'Approved implementation plan' },
  [ActivityEventType.STORY_STARTED]:        { phase: 5, icon: '⚙️', label: (d) => `Started implementing${d?.title ? `: ${d.title}` : ''}` },
  [ActivityEventType.STORY_COMPLETED]:      { phase: 5, icon: '✔️', label: (d) => `Completed${d?.title ? `: ${d.title}` : ' a story'}` },
  [ActivityEventType.SPRINT_ALL_DONE]:      { phase: 5, icon: '🏁', label: () => 'All sprint stories complete' },
  [ActivityEventType.ASSERTIONS_GENERATED]: { phase: 6, icon: '🧪', label: () => 'Generated inspection assertions' },
  [ActivityEventType.ASSERTIONS_PASSED]:    { phase: 6, icon: '✅', label: (d) => `Assertions passed${d?.title ? ` for: ${d.title}` : ''}` },
  [ActivityEventType.ASSERTIONS_FAILED]:    { phase: 6, icon: '❌', label: (d) => `Assertion failures${d?.title ? ` on: ${d.title}` : ''}` },
  [ActivityEventType.CODE_REVIEW_STARTED]:  { phase: 7, icon: '🔍', label: () => 'Ran code review' },
  [ActivityEventType.BUG_FIX_STARTED]:      { phase: 7, icon: '🐛', label: () => 'Started bug fix phase' },
  [ActivityEventType.BUG_FIX_COMPLETED]:    { phase: 7, icon: '🐛', label: () => 'Bug fix phase complete' },
  [ActivityEventType.SPRINT_CLOSED]:        { phase: 9, icon: '🏆', label: (d) => `Closed sprint${d?.title ? ` "${d.title}"` : ''}` },
  [ActivityEventType.COMMITTED]:            { phase: 9, icon: '💾', label: (d) => `Committed changes${d?.message ? `: ${d.message.slice(0, 60)}` : ''}` },
  [ActivityEventType.BTW_ASKED]:            { phase: 1, icon: '🤔', label: () => 'Asked a quick question' },
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

function storageKey(projectPath) {
  if (!projectPath) return 'puffin-activity-default'
  // Simple hash: sum of char codes % 1e9
  let h = 0
  for (let i = 0; i < projectPath.length; i++) h = (h * 31 + projectPath.charCodeAt(i)) >>> 0
  return `puffin-activity-${h}`
}

// ---------------------------------------------------------------------------
// ActivityLog class
// ---------------------------------------------------------------------------

export class ActivityLog {
  constructor() {
    this._entries = []
    this._key = null
    this._lastPromptTs = 0
  }

  /**
   * Initialise for a given project. Loads persisted entries.
   * @param {string} projectPath
   */
  init(projectPath) {
    this._key = storageKey(projectPath)
    try {
      const raw = localStorage.getItem(this._key)
      this._entries = raw ? JSON.parse(raw) : []
    } catch {
      this._entries = []
    }
  }

  /**
   * Record a new activity event.
   * @param {string} type - ActivityEventType constant
   * @param {object} [data] - optional detail data for label interpolation
   */
  record(type, data = {}) {
    const template = EVENT_TEMPLATES[type]
    if (!template) return

    // Deduplicate prompt_sent: ignore if last prompt was < 5s ago
    if (type === ActivityEventType.PROMPT_SENT) {
      const now = Date.now()
      if (now - this._lastPromptTs < 5000) return
      this._lastPromptTs = now
      data = { ...data, first: this._entries.filter(e => e.type === ActivityEventType.PROMPT_SENT).length === 0 }
    }

    const entry = {
      ts: Date.now(),
      type,
      phase: template.phase,
      phaseLabel: PHASE_LABELS[template.phase] || `Phase ${template.phase}`,
      icon: template.icon,
      label: template.label(data),
      detail: data?.detail || null,
    }

    this._entries.push(entry)

    // Rolling cap
    if (this._entries.length > MAX_ENTRIES) {
      this._entries = this._entries.slice(-MAX_ENTRIES)
    }

    this._persist()
  }

  /** @returns {object[]} All entries, oldest first */
  getAll() {
    return [...this._entries]
  }

  /** @returns {object[]} Most recent N entries */
  getRecent(n = 20) {
    return this._entries.slice(-n)
  }

  /** @returns {object[]} All entries for a specific phase id */
  getForPhase(phaseId) {
    return this._entries.filter(e => e.phase === phaseId)
  }

  /**
   * Entries grouped by phase, in phase order.
   * @returns {Array<{ phase: number, label: string, entries: object[] }>}
   */
  getGroupedByPhase() {
    const groups = {}
    for (const entry of this._entries) {
      if (!groups[entry.phase]) {
        groups[entry.phase] = { phase: entry.phase, label: entry.phaseLabel, entries: [] }
      }
      groups[entry.phase].entries.push(entry)
    }
    return Object.values(groups).sort((a, b) => a.phase - b.phase)
  }

  /**
   * True if any entry label contains the substring (case-insensitive).
   * @param {string} substring
   */
  hasEventType(substring) {
    const lc = substring.toLowerCase()
    return this._entries.some(e => e.label.toLowerCase().includes(lc) || e.type === substring)
  }

  /**
   * Most recent entry whose label or type matches substring.
   * @param {string} substring
   */
  lastEventOfType(substring) {
    const lc = substring.toLowerCase()
    for (let i = this._entries.length - 1; i >= 0; i--) {
      const e = this._entries[i]
      if (e.label.toLowerCase().includes(lc) || e.type === substring) return e
    }
    return null
  }

  /**
   * Count prompt-sent events since the last commit event.
   * @returns {number}
   */
  countSinceLastCommit() {
    let count = 0
    for (let i = this._entries.length - 1; i >= 0; i--) {
      if (this._entries[i].type === ActivityEventType.COMMITTED) break
      if (this._entries[i].type === ActivityEventType.PROMPT_SENT) count++
    }
    return count
  }

  /** True if no entries have been recorded yet */
  get isEmpty() {
    return this._entries.length === 0
  }

  /** Clear all entries */
  clear() {
    this._entries = []
    this._persist()
  }

  _persist() {
    if (!this._key) return
    try {
      localStorage.setItem(this._key, JSON.stringify(this._entries))
    } catch {
      // quota exceeded — silently fail
    }
  }
}
