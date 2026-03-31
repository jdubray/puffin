/**
 * WorkflowStateTracker
 *
 * Derives a concise workflow summary string from the current SAM model state.
 * Pure function — no storage, no side effects. Regenerated fresh on every call.
 *
 * Used as context for the next-best-action AI prompt so it has accurate
 * knowledge of what the user has done and where they currently are.
 */

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
 * Convenience async wrapper that fetches git status and builds the summary.
 * Falls back gracefully if the git IPC bridge is unavailable.
 *
 * @param {object} state - Rendered state from computeState()
 * @returns {Promise<string>}
 */
export async function fetchWorkflowSummary(state) {
  let gitStatusResult = null
  try {
    if (window.puffin?.git?.getStatus) {
      gitStatusResult = await window.puffin.git.getStatus()
    }
  } catch {
    // git not available — summary proceeds without it
  }
  return buildWorkflowSummary(state, gitStatusResult)
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
