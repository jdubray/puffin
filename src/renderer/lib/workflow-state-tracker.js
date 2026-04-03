/**
 * WorkflowStateTracker
 *
 * Derives a concise workflow summary string and current phase from the SAM model state.
 * Pure functions — no storage, no side effects. Regenerated fresh on every call.
 *
 * Used as context for the next-best-action AI prompt so it has accurate
 * knowledge of what the user has done and where they currently are.
 */

// ---------------------------------------------------------------------------
// Phase detection
// ---------------------------------------------------------------------------

/**
 * Deterministically detect which Puffin workflow phase the user is currently in.
 * Returns a phase descriptor without any AI call.
 *
 * Phases:
 *  0  Bootstrap       — project not configured
 *  1  Discovery       — exploring, no stories yet
 *  2  Design          — has threads + design work, no stories
 *  3  Decompose       — has threads, ready to derive stories
 *  4  Sprint Planning — has stories, sprint being planned
 *  5  Implement       — sprint approved or vibe coding in progress
 *  6  Verify          — all sprint stories done, assertions pending
 *  7  Review & Fix    — code review / bug fix phase
 *  9  Commit & Ship   — work done, uncommitted changes remain
 *  10 Iterate         — sprint complete, nothing pending
 *
 * @param {object} state
 * @param {object|null} gitStatusResult
 * @returns {{ id: number, label: string, description: string }}
 */
export function detectWorkflowPhase(state, gitStatusResult = null) {
  if (!state?.projectName && !state?.config?.projectPath) {
    return { id: 0, label: 'Bootstrap', description: 'No project configured yet.' }
  }

  const branches    = state.history?.raw?.branches || {}
  const hasThreads  = Object.values(branches).some(b => b?.prompts?.length > 0)
  const stories     = state.userStories || []
  const hasStories  = stories.length > 0
  const sprint      = state.activeSprint
  const progress    = state.sprintProgress
  const sprintDone  = progress?.storyPercentage === 100
  const hasModFiles = state.activity?.hasModifiedFiles || false
  const uncommitted = gitStatusResult?.success && gitStatusResult.status?.hasUncommittedChanges

  // Active sprint states
  if (sprint) {
    const status = sprint.status || ''
    // Planning / approval pending
    if (status === 'planning' || status === 'pending' || status === 'created') {
      return { id: 4, label: 'Sprint Planning', description: 'Sprint created — plan needs review and approval before implementation.' }
    }
    // Code review / bug fix in progress
    const reviewActive = sprint.codeReview?.status === 'in_progress' || sprint.bugFix?.status === 'in_progress'
    if (reviewActive) {
      return { id: 7, label: 'Review & Fix', description: 'Code review or bug fix phase is active.' }
    }
    // All stories complete — move to verify/review
    if (sprintDone && (status === 'in_progress' || status === 'active')) {
      return { id: 6, label: 'Verify', description: 'All sprint stories are complete — run assertions and close the sprint for code review.' }
    }
    // Sprint implementation in progress
    if (status === 'in_progress' || status === 'active') {
      return { id: 5, label: 'Implement', description: 'Sprint is running — implement stories.' }
    }
    // Sprint completed
    if (status === 'completed') {
      if (uncommitted) {
        return { id: 9, label: 'Commit & Ship', description: 'Sprint complete — uncommitted changes are waiting to be committed.' }
      }
      return { id: 10, label: 'Iterate', description: 'Sprint complete and committed — ready to plan the next sprint or explore new features.' }
    }
  }

  // No active sprint
  if (hasStories) {
    return { id: 4, label: 'Sprint Planning', description: 'Backlog has stories — create a sprint and plan implementation.' }
  }

  if (hasThreads) {
    // Active vibe coding (modified files, no sprint)
    if (hasModFiles || uncommitted) {
      return { id: 5, label: 'Vibe Coding', description: 'Actively coding via prompts — files have been modified.' }
    }
    return { id: 3, label: 'Decompose', description: 'Conversation threads exist — derive user stories or continue speccing.' }
  }

  return { id: 1, label: 'Discovery', description: 'No threads or stories yet — start by describing what you want to build.' }
}

/**
 * Build a workflow summary from the rendered SAM state and an optional
 * live git status fetched from the main process.
 *
 * @param {object} state - Rendered state from computeState()
 * @param {object|null} gitStatusResult - Result of window.puffin.git.getStatus(), or null
 * @returns {string} Multi-line workflow summary
 */
export function buildWorkflowSummary(state, gitStatusResult = null) {
  const sections = []

  sections.push(_projectSection(state))
  sections.push(_branchSection(state))
  sections.push(_sprintSection(state))
  sections.push(_backlogSection(state))
  sections.push(_assertionsSection(state))
  sections.push(_pendingOpsSection(state))
  sections.push(_activitySection(state))
  sections.push(_gitSection(gitStatusResult))

  return sections.filter(Boolean).join('\n\n')
}

/**
 * Convenience async wrapper that fetches git status, builds the summary, and
 * detects the current workflow phase.
 * Falls back gracefully if the git IPC bridge is unavailable.
 *
 * @param {object} state - Rendered state from computeState()
 * @returns {Promise<{ summary: string, phase: { id: number, label: string, description: string } }>}
 */
export async function fetchWorkflowContext(state) {
  let gitStatusResult = null
  try {
    if (window.puffin?.git?.getStatus) {
      gitStatusResult = await window.puffin.git.getStatus()
    }
  } catch {
    // git not available — summary proceeds without it
  }
  const summary = buildWorkflowSummary(state, gitStatusResult)
  const phase   = detectWorkflowPhase(state, gitStatusResult)
  return { summary, phase }
}

/**
 * Legacy single-value wrapper kept for any callers that only need the summary string.
 * @param {object} state
 * @returns {Promise<string>}
 */
export async function fetchWorkflowSummary(state) {
  const { summary } = await fetchWorkflowContext(state)
  return summary
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function _projectSection(state) {
  if (!state.projectName) return null
  return `## Project: ${state.projectName}`
}

function _branchSection(state) {
  const activeBranch = state.history?.activeBranch
  if (!activeBranch) return null

  const rawBranches = state.history?.raw?.branches || {}
  const branch = rawBranches[activeBranch]
  const prompts = branch?.prompts || []
  const promptCount = prompts.length

  let line = `**Active Puffin branch:** ${activeBranch}`
  if (promptCount > 0) {
    line += ` — ${promptCount} thread${promptCount !== 1 ? 's' : ''}`
    const last = prompts[prompts.length - 1]
    if (last?.timestamp) {
      line += `, last activity ${_relativeTime(last.timestamp)}`
    }
  } else {
    line += ' — no threads yet'
  }

  const selectedPrompt = state.history?.selectedPrompt
  if (selectedPrompt?.content) {
    const preview = selectedPrompt.content.slice(0, 100)
    const ellipsis = selectedPrompt.content.length > 100 ? '…' : ''
    line += `\n**Selected thread:** "${preview}${ellipsis}"`
  }

  return line
}

function _sprintSection(state) {
  const sprint = state.activeSprint
  const progress = state.sprintProgress

  if (!sprint) return '**Sprint:** none active'

  const status = sprint.status || 'unknown'
  const pct = progress ? `${progress.storyPercentage}%` : null
  const header = `**Sprint:** ${sprint.title || 'Untitled'} [${status}${pct ? ' · ' + pct + ' done' : ''}]`

  const storyLines = []
  const stories = progress?.stories || []
  for (const s of stories) {
    const icon = s.status === 'completed' ? '✓' : s.status === 'in_progress' ? '→' : '○'
    let line = `  ${icon} ${s.title}`
    if (s.status === 'in_progress') {
      const parts = []
      if (s.criteriaPercentage != null) parts.push(`${s.criteriaPercentage}% criteria`)
      if (s.branchPercentage != null) parts.push(`${s.branchPercentage}% branches`)
      if (parts.length) line += ` (${parts.join(', ')})`
    }
    storyLines.push(line)
  }

  const activeImpl = state.activeImplementationStory
  const implLine = activeImpl
    ? `  Currently implementing: "${activeImpl.title}"`
    : null

  return [header, ...storyLines, implLine].filter(Boolean).join('\n')
}

function _backlogSection(state) {
  const stories = state.userStories || []
  if (stories.length === 0) return '**Backlog:** empty'

  const pending = stories.filter(s => s.status === 'pending').length
  const inProgress = stories.filter(
    s => s.status === 'in-progress' || s.status === 'in_progress'
  ).length
  const completed = stories.filter(s => s.status === 'completed').length

  return `**Backlog:** ${stories.length} stories — ${pending} pending, ${inProgress} in-progress, ${completed} completed`
}

function _assertionsSection(state) {
  const stories = state.userStories || []
  const withAssertions = stories.filter(s => s.inspectionAssertions?.length > 0)

  if (withAssertions.length === 0) return null

  const lines = [`**Inspection assertions** on ${withAssertions.length} story/stories:`]
  const display = withAssertions.slice(0, 5)
  for (const s of display) {
    lines.push(`  • ${s.title}: ${s.inspectionAssertions.length} assertion(s)`)
  }
  if (withAssertions.length > 5) {
    lines.push(`  … and ${withAssertions.length - 5} more`)
  }
  return lines.join('\n')
}

function _pendingOpsSection(state) {
  const ops = []
  if (state._pendingCrePlanning) ops.push('CRE planning')
  if (state._pendingCreIteration) ops.push('CRE plan iteration')
  if (state._pendingCreApproval) ops.push('CRE plan approval')
  if (state._pendingStoryImplementation) ops.push('story implementation')
  if (state._pendingSprintPlanning) ops.push('sprint planning')
  if (state.app?.isProcessing) ops.push('Claude response in flight')

  return ops.length > 0 ? `**Pending:** ${ops.join(', ')}` : null
}

function _activitySection(state) {
  const activity = state.activity
  if (!activity || activity.status === 'idle') return null

  let line = `**Claude status:** ${activity.status}`
  if (activity.currentToolName) line += ` (using tool: ${activity.currentToolName})`
  if (activity.hasModifiedFiles) {
    line += `\n**Files modified this session:** ${activity.modifiedFileCount}`
  }
  return line
}

function _gitSection(gitStatusResult) {
  if (!gitStatusResult?.success) return null

  const s = gitStatusResult.status
  const lines = [`**Git branch:** ${s.branch || 'unknown'}`]

  if (s.hasUncommittedChanges) {
    const stagedCount = s.files?.staged?.length || 0
    const unstagedCount = s.files?.unstaged?.length || 0
    const untrackedCount = s.files?.untracked?.length || 0
    const parts = []
    if (stagedCount > 0) parts.push(`${stagedCount} staged`)
    if (unstagedCount > 0) parts.push(`${unstagedCount} unstaged`)
    if (untrackedCount > 0) parts.push(`${untrackedCount} untracked`)
    lines.push(`**Uncommitted changes:** ${parts.join(', ')}`)
  } else {
    lines.push('**Working tree:** clean')
  }

  if (s.hasRemote && (s.ahead > 0 || s.behind > 0)) {
    lines.push(`**Ahead/behind origin:** +${s.ahead} / -${s.behind}`)
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} iso - ISO 8601 timestamp
 * @returns {string} Human-readable relative time
 */
function _relativeTime(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const mins = Math.floor(ms / 60_000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
