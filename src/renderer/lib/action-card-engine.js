/**
 * ActionCardEngine
 *
 * Produces a prioritised list of action cards by analysing the current workflow
 * state, git status, and activity log. No AI calls — fully deterministic.
 *
 * Each card describes a concrete next step the user can take in Puffin,
 * together with a "how-to" key that maps to step-by-step instructions.
 */

// ---------------------------------------------------------------------------
// How-to content
// ---------------------------------------------------------------------------

/**
 * Step-by-step instructions for each action type.
 * Keyed by howId — referenced from ActionCard.howId.
 */
export const HOW_CONTENT = {
  'config-project': {
    title: 'How to configure your project',
    steps: [
      'Click the **Config** tab in the top navigation bar.',
      'Set your **Project Path** — the root directory of the code you\'re working on.',
      'Choose your preferred **Claude Model** (Sonnet is recommended for most work).',
      'Click **Save** to persist your settings.',
    ],
  },
  'create-branch': {
    title: 'How to create a git branch',
    steps: [
      'Click the **branch pill** in the top header (shows current branch name).',
      'Select **Create new branch** from the dropdown.',
      'Enter a descriptive name (e.g. `feature/my-feature`).',
      'Click **Create** — Puffin switches to the new branch immediately.',
    ],
  },
  'vibe-prompt': {
    title: 'How to start exploring with Claude',
    steps: [
      'Go to the **Prompt** tab (default view).',
      'Type your idea, question, or requirement in the text area.',
      'Optionally attach a doc with **Include Docs** or a design with **Include GUI**.',
      'Press **Send** — Claude responds in the task below.',
      'Keep the conversation going until your requirements feel clear.',
    ],
  },
  'add-story': {
    title: 'How to add a task to the backlog',
    steps: [
      'Open the **Backlog** tab.',
      'Click **+ Add Story** and give it a title and short description.',
      'Drag the card between **To Do / Doing / Done** as you make progress.',
    ],
  },
  'work-backlog': {
    title: 'How to work through your backlog',
    steps: [
      'Open the **Backlog** tab to see your Kanban board.',
      'Drag stories between columns (Backlog → In Progress → Done) as you work.',
      'Click a story to open it and discuss the work with Claude in the Prompt tab.',
      'Update each story\'s status on the board to track progress.',
    ],
  },
  'git-init': {
    title: 'How to initialise a git repository',
    steps: [
      '⚠️ This must be done **outside Puffin** in your terminal.',
      'Open a terminal and navigate to your project directory:',
      '`cd /path/to/your/project`',
      'Run: `git init`',
      'Optionally create a first commit: `git add . && git commit -m "Initial commit"`',
      'Return to Puffin — the Git panel will now detect the repository.',
    ],
  },
}

// ---------------------------------------------------------------------------
// Card computation
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ActionCard
 * @property {string}  id           - Unique card identifier
 * @property {number}  priority     - Sort order (ascending = shown first)
 * @property {string}  icon         - Emoji icon
 * @property {string}  title        - Short card title
 * @property {string}  description  - One or two sentence description
 * @property {string}  actionLabel  - Label for the primary CTA button
 * @property {string}  howId        - Key into HOW_CONTENT
 * @property {string}  [badgeLabel] - Short label for the phase badge
 * @property {string}  [badgeClass] - CSS class for badge styling
 */

/**
 * Compute a prioritised list of action cards from the current workflow state.
 *
 * @param {object} state                  - SAM rendered state
 * @param {object|null} gitStatus         - Result of window.puffin.git.getStatus()
 * @param {import('./activity-log').ActivityLog|null} activityLog
 * @param {boolean} isRepo                - Whether the project directory is a git repo
 * @returns {ActionCard[]} Sorted ascending by priority (highest priority = lowest number)
 */
export function computeActionCards(state, gitStatus = null, activityLog = null, isRepo = true) {
  const cards = []

  // --- Phase 0: project not configured ----------------------------------------
  // Use the same guard as detectWorkflowPhase: top-level projectPath OR projectName
  if (!state?.projectPath && !state?.projectName) {
    cards.push({
      id: 'config-project',
      priority: 0,
      icon: '⚙️',
      title: 'Configure your project',
      description: 'Set the project path so Puffin knows where your code lives.',
      actionLabel: 'Open Config',
      howId: 'config-project',
      badgeLabel: 'Required',
      badgeClass: 'badge-required',
    })
    return cards
  }

  const stories   = state.userStories || []
  const onMain    = _isOnMainBranch(gitStatus)
  const hasThreads = _hasThreads(state)

  // --- No git repository -------------------------------------------------------
  if (!isRepo) {
    cards.push({
      id: 'git-init',
      priority: 1,
      icon: '🗄️',
      title: 'Initialise a git repository',
      description: 'This project directory has no git repo. Run "git init" in your terminal to enable version control, branches, and commit history.',
      actionLabel: 'See instructions',
      howId: 'git-init',
      badgeLabel: 'No git',
      badgeClass: 'badge-required',
    })
  }

  // --- Branch reminder (setup, not blocking) -----------------------------------
  if (onMain) {
    cards.push({
      id: 'create-branch',
      priority: 2,
      icon: '🌿',
      title: 'Create a working branch',
      description: 'You\'re on the main branch. Create a feature branch to keep your work isolated and easy to review.',
      actionLabel: 'Create Branch',
      howId: 'create-branch',
      badgeLabel: 'Setup',
      badgeClass: 'badge-setup',
    })
  }

  // --- Phase 1: no threads, no stories -----------------------------------------
  if (!hasThreads && stories.length === 0) {
    cards.push({
      id: 'vibe-prompt',
      priority: 5,
      icon: '💬',
      title: 'Start exploring with Claude',
      description: 'Describe what you want to build. Use the Prompt tab to have a freeform conversation with Claude.',
      actionLabel: 'Go to Prompt',
      howId: 'vibe-prompt',
      badgeLabel: 'Phase 1',
      badgeClass: 'badge-phase',
    })
    return _sort(cards)
  }

  // --- Phase 3: has threads, no stories ----------------------------------------
  if (hasThreads && stories.length === 0) {
    cards.push({
      id: 'add-story',
      priority: 10,
      icon: '📋',
      title: 'Capture tasks in the backlog',
      description: 'Add the follow-ups from your conversation to the Kanban backlog so you can track them as To Do / Doing / Done.',
      actionLabel: 'Open Backlog',
      howId: 'add-story',
      badgeLabel: 'Phase 3',
      badgeClass: 'badge-phase',
    })
    return _sort(cards)
  }

  // --- Has stories: work the Kanban backlog ------------------------------------
  if (stories.length > 0) {
    const count = stories.length
    cards.push({
      id: 'work-backlog',
      priority: 20,
      icon: '📋',
      title: 'Work on your backlog',
      description: `You have ${count} stor${count === 1 ? 'y' : 'ies'} in the backlog. Open the Kanban board to pick one up and move it across the board as you make progress.`,
      actionLabel: 'Go to Backlog',
      howId: 'work-backlog',
      badgeLabel: 'Backlog',
      badgeClass: 'badge-phase',
    })
    return _sort(cards)
  }

  // --- Always-available: ask Claude a question ---------------------------------
  cards.push({
    id: 'vibe-code',
    priority: 80,
    icon: '💬',
    title: 'Ask Claude a question',
    description: 'Send a quick prompt, explore an idea, or ask Claude to make a small change — anytime.',
    actionLabel: 'Go to Prompt',
    howId: 'vibe-prompt',
    badgeLabel: 'Anytime',
    badgeClass: 'badge-anytime',
  })

  return _sort(cards)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _sort(cards) {
  return cards.sort((a, b) => a.priority - b.priority)
}

function _hasThreads(state) {
  const branches = state.history?.raw?.branches || {}
  return Object.values(branches).some(b => b?.prompts?.length > 0)
}

function _isOnMainBranch(gitStatus) {
  if (!gitStatus?.success) return false
  const branch = gitStatus?.status?.branch || ''
  return branch === 'main' || branch === 'master'
}
