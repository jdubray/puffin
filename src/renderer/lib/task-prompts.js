/**
 * task-prompts - The prompts Puffin composes for planning, implementing,
 * reviewing and fixing a task. Pure functions; see docs/PLAN_TO_BOARD_SPEC.md §6.
 */

export const REVIEW_PASS_MARKER = '<!-- REVIEW: PASS -->'
export const REVIEW_ISSUES_MARKER = '<!-- REVIEW: ISSUES -->'

/**
 * Appended to a Plan-mode prompt so the plan extracts cleanly.
 * @param {{ name: string, description?: string }[]} [skills]
 * @returns {string}
 */
export function planningSuffix(skills = []) {
  const skillList = skills.length
    ? skills.map(s => `/${s.name}${s.description ? ` — ${s.description}` : ''}`).join('; ')
    : '(none found in this project)'
  return [
    '',
    '## Plan format (Puffin)',
    'Write the plan to your plan file (plan mode). Structure it as:',
    '- `# <title>`',
    '- `## Context` — why, in a few sentences',
    '- `## Steps` — an ordered list; each item is one independently implementable unit with a bold title,',
    '  the files it touches in backticks, and `- [ ]` checkboxes for what must be true when it is done.',
    '  Say "after step N" when an item depends on another. A step may be a skill invocation, written as',
    '  `/skill-name arguments` on its first line.',
    `  Available skills: ${skillList}.`,
    '- `## Verification` — how to check the whole change end-to-end.',
    'Keep steps small enough for one focused session each (a few files, one concern).',
    'Explore directly with Read, Grep and Glob in this turn — do not launch subagents or background',
    'work, because this session ends when your turn ends. Finish your reply with the full plan text.'
  ].join('\n')
}

/**
 * Feedback sent back into a plan-mode thread.
 * @param {string} feedback
 * @returns {string}
 */
export function revisePrompt(feedback) {
  return `Revise the plan with this feedback, keeping the same Puffin plan format and rewriting the plan file:\n\n${String(feedback || '').trim()}`
}

/**
 * Status glyph for a sibling step line.
 * @param {Object} task
 * @param {string} currentId
 * @returns {string}
 */
function glyph(task, currentId) {
  if (task.id === currentId) return '▶'
  if (task.status === 'completed') return '✓'
  if (task.status === 'in-progress') return '…'
  return '·'
}

/**
 * The prompt that implements one task.
 *
 * @param {Object} args
 * @param {Object} args.task - The story (`title, description, acceptanceCriteria, planStep, skill, runMeta`)
 * @param {Object|null} [args.plan] - `{ title, context }` (context = the plan's Context section)
 * @param {Object[]} [args.siblings] - All tasks of the plan, in `planStep` order
 * @param {string} [args.previousError] - For retries
 * @returns {string}
 */
export function implementationPrompt({ task, plan = null, siblings = [], previousError = '' }) {
  const total = siblings.length || 1
  const n = task.planStep || (siblings.findIndex(s => s.id === task.id) + 1) || 1
  const title = task.title || 'Untitled task'
  const criteria = (task.acceptanceCriteria || []).filter(Boolean)

  if (task.skill) {
    // A skill step is launched as that prompt; the task context follows
    return [
      task.skill,
      '',
      `(Task ${n} of ${total}${plan?.title ? ` from plan "${plan.title}"` : ''}: ${title}.`,
      criteria.length ? ` Done when: ${criteria.join('; ')}.` : '',
      ')'
    ].join('').replace(/\.\)$/, '.)')
  }

  const lines = [
    `# Task ${n} of ${total}${plan?.title ? ` from plan "${plan.title}"` : ''}: ${title}`,
    '',
    '## What to do',
    task.description || '(no details — use the title and the plan context)',
    '',
    '## Done when',
    ...(criteria.length ? criteria.map(c => `- ${c}`) : ['- The change described above is implemented and the relevant tests pass.'])
  ]

  if (plan?.context || siblings.length > 1) {
    lines.push('', '## Plan context')
    if (plan?.context) lines.push(plan.context, '')
    if (siblings.length > 1) {
      lines.push('Steps:')
      for (const s of siblings) {
        const files = (s.runMeta?.filesModified || []).slice(0, 6).join(', ')
        lines.push(`- ${glyph(s, task.id)} ${s.planStep || ''}. ${s.title}${s.status === 'completed' && files ? ` (touched: ${files})` : ''}`)
      }
    }
  }

  if (previousError) {
    lines.push('', '## Previous attempt', `Your previous attempt ended with: ${previousError}`)
  }

  lines.push(
    '',
    '## Rules',
    '- Implement only this task. Do not start the pending steps.',
    "- Run the project's tests relevant to what you changed.",
    '- Finish with a short summary: what changed, what you verified, anything the next step must know.'
  )
  return lines.join('\n')
}

/**
 * Review prompt scoped to a task (same markers as Quick Code Review).
 * @param {Object} task
 * @returns {string}
 */
export function reviewPrompt(task) {
  const criteria = (task.acceptanceCriteria || []).filter(Boolean)
  return [
    `Review the changes made for task ${task.planStep ? `${task.planStep} ` : ''}"${task.title}" in this conversation.`,
    '',
    'Check, in this order:',
    '1. Each "done when" criterion below is actually met (say which are not).',
    '2. Correctness bugs, missing error handling, and broken or missing tests in the files that changed.',
    '3. Anything the change touched that it should not have.',
    '',
    '## Done when',
    ...(criteria.length ? criteria.map(c => `- ${c}`) : ['- (no explicit criteria; judge against the task title)']),
    '',
    'Do not modify files. End your reply with exactly one of these markers on its own line:',
    `- \`${REVIEW_PASS_MARKER}\` if every criterion is met and no issue needs fixing`,
    `- \`${REVIEW_ISSUES_MARKER}\` if something must be fixed, listing each issue with file and line`
  ].join('\n')
}

/**
 * Fix prompt after a review found issues.
 * @param {Object} task
 * @param {number} [round]
 * @returns {string}
 */
export function fixPrompt(task, round = 1) {
  return [
    `Fix every issue listed in your review of task "${task.title}" (fix round ${round}).`,
    'For each issue: apply the minimal correct fix, run the relevant tests, and state what you changed.',
    'Do not fix anything not listed in the review.'
  ].join('\n')
}

/**
 * Read the review outcome from a reply.
 * @param {string} text
 * @returns {'pass'|'issues'|'unknown'}
 */
export function reviewOutcome(text) {
  const t = String(text || '')
  if (t.includes(REVIEW_ISSUES_MARKER)) return 'issues'
  if (t.includes(REVIEW_PASS_MARKER)) return 'pass'
  return 'unknown'
}

/**
 * A short excerpt of a review for the card.
 * @param {string} text
 * @param {number} [max]
 * @returns {string}
 */
export function reviewExcerpt(text, max = 600) {
  const t = String(text || '').replace(REVIEW_PASS_MARKER, '').replace(REVIEW_ISSUES_MARKER, '').trim()
  return t.length > max ? `${t.slice(0, max).trim()}…` : t
}

/**
 * Prompt prefilled for Re-plan.
 * @param {Object} args
 * @param {string} args.planFile - Project-relative path
 * @param {Object[]} args.tasks - Plan tasks
 * @returns {string}
 */
export function replanPrompt({ planFile, tasks }) {
  const done = tasks.filter(t => t.status === 'completed').map(t => `- ✓ ${t.title}`)
  const open = tasks.filter(t => t.status !== 'completed').map(t => `- ${t.status === 'in-progress' ? '…' : '·'} ${t.title}`)
  return [
    `Revise the plan in \`${planFile}\` given what has been done. Keep the Puffin plan format.`,
    '',
    'Done:',
    ...(done.length ? done : ['- (nothing yet)']),
    '',
    'Still open:',
    ...(open.length ? open : ['- (nothing)']),
    '',
    'Re-read the code as it is now, keep the done steps as they are, and rewrite the remaining steps.'
  ].join('\n')
}
