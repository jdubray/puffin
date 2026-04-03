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
      'Press **Send** — Claude responds in the thread below.',
      'Keep the conversation going until your requirements feel clear.',
    ],
  },
  'derive-stories': {
    title: 'How to derive user stories',
    steps: [
      'Make sure you have at least one conversation thread with Claude.',
      'Click the **Derive Stories** button in the Prompt tab toolbar or Backlog tab.',
      'Review the AI-generated stories — edit titles or descriptions inline.',
      'Remove stories you don\'t need, then click **Add to Backlog**.',
    ],
  },
  'create-sprint': {
    title: 'How to create a sprint',
    steps: [
      'Go to the **Backlog** tab.',
      'Select the stories you want to include using the checkboxes.',
      'Click **Create Sprint** and give it a descriptive title.',
      'The sprint will appear in the Sprint panel, ready for planning.',
    ],
  },
  'approve-plan': {
    title: 'How to generate and approve an implementation plan',
    steps: [
      'Open the Sprint panel on the right side.',
      'Click **Generate Plan** (or **Generate CRE Plan** for structured planning with assertions).',
      'Review the plan — use **Iterate** to ask Claude to refine it.',
      'When satisfied, click **Approve Plan**.',
      'Choose **Automated** or **Human-Controlled** implementation mode.',
    ],
  },
  'run-sprint': {
    title: 'How to run a sprint',
    steps: [
      'Make sure your sprint plan is approved.',
      'In the Sprint panel, click **Start Sprint** (automated) or click **Start** on each story individually.',
      'In Automated mode, Claude implements all stories sequentially.',
      'In Human-Controlled mode, click **Start** per story to implement one at a time.',
      'Monitor progress via the story status badges in the Sprint panel.',
    ],
  },
  'run-assertions': {
    title: 'How to run inspection assertions',
    steps: [
      'After all sprint stories are complete, open the Sprint panel.',
      'Click **Run Assertions** — Puffin evaluates each story\'s assertion set against the codebase.',
      'Review results: green = passed, red = failed.',
      'Click on any failure to see details and fix the issue before proceeding.',
    ],
  },
  'code-review': {
    title: 'How to run a code review',
    steps: [
      'From the Sprint panel, click **Close Sprint**.',
      'Puffin automatically triggers the **Code Review** phase.',
      'Claude reviews all changes and produces a list of findings.',
      'For each finding, click **Fix** to have Claude address it automatically.',
      'When all findings are resolved, complete the bug fix phase to proceed.',
    ],
  },
  'commit': {
    title: 'How to commit your changes',
    steps: [
      'After code review is complete, click **Commit Changes** in the Sprint close flow.',
      'Puffin auto-generates a commit message from your session.',
      'Review and edit the message if needed, then click **Commit**.',
      'Optionally use **Merge Branch** to merge back into your main branch.',
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
  const sprint    = state.activeSprint
  const progress  = state.sprintProgress
  const onMain    = _isOnMainBranch(gitStatus)
  const hasFiles  = gitStatus?.success && gitStatus?.status?.hasUncommittedChanges
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
  if (!hasThreads && stories.length === 0 && !sprint) {
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
  if (hasThreads && stories.length === 0 && !sprint) {
    cards.push({
      id: 'derive-stories',
      priority: 10,
      icon: '📋',
      title: 'Derive user stories',
      description: 'Turn your conversation into structured user stories. Claude will parse the thread and propose a backlog.',
      actionLabel: 'Derive Stories',
      howId: 'derive-stories',
      badgeLabel: 'Phase 3',
      badgeClass: 'badge-phase',
    })
    return _sort(cards)
  }

  // --- Phase 4a: has stories, no sprint ----------------------------------------
  if (stories.length > 0 && !sprint) {
    const count = stories.length
    cards.push({
      id: 'create-sprint',
      priority: 20,
      icon: '🏃',
      title: 'Create a sprint',
      description: `You have ${count} stor${count === 1 ? 'y' : 'ies'} in the backlog. Group them into a sprint to start planning implementation.`,
      actionLabel: 'Create Sprint',
      howId: 'create-sprint',
      badgeLabel: 'Phase 4',
      badgeClass: 'badge-phase',
    })
    return _sort(cards)
  }

  // --- Sprint-based states -----------------------------------------------------
  if (sprint) {
    const status    = sprint.status || ''
    const sprintPct = progress?.storyPercentage ?? 0
    const allDone   = sprintPct === 100
    const reviewActive = sprint.codeReview?.status === 'in_progress'
    const bugfixActive = sprint.bugFix?.status === 'in_progress'

    // Phase 4b: plan not yet approved
    if (status === 'created' || status === 'planning' || status === 'pending') {
      cards.push({
        id: 'approve-plan',
        priority: 25,
        icon: '🗺️',
        title: 'Generate & approve the plan',
        description: `Review and approve the implementation plan for "${sprint.title || 'your sprint'}" before implementation begins.`,
        actionLabel: 'Review Plan',
        howId: 'approve-plan',
        badgeLabel: 'Phase 4',
        badgeClass: 'badge-phase',
      })
      return _sort(cards)
    }

    // Phase 5a: approved, not yet started
    if (status === 'approved') {
      cards.push({
        id: 'run-sprint',
        priority: 30,
        icon: '⚙️',
        title: 'Start the sprint',
        description: `"${sprint.title || 'Your sprint'}" is approved and ready. Start implementation — automated or story-by-story.`,
        actionLabel: 'Start Sprint',
        howId: 'run-sprint',
        badgeLabel: 'Phase 5',
        badgeClass: 'badge-phase',
      })
      return _sort(cards)
    }

    // Phase 7: review / bug-fix active
    if (reviewActive || bugfixActive) {
      cards.push({
        id: 'complete-review',
        priority: 45,
        icon: '🔍',
        title: 'Complete the code review',
        description: 'Review findings are ready. Fix the issues and complete the review phase before committing.',
        actionLabel: 'View Review',
        howId: 'code-review',
        badgeLabel: 'Phase 7',
        badgeClass: 'badge-phase',
      })
      return _sort(cards)
    }

    // Phase 5b: implementation in progress
    if (status === 'in_progress' || status === 'active') {
      if (allDone) {
        // Phase 6: all stories complete → verify
        cards.push({
          id: 'run-assertions',
          priority: 35,
          icon: '🧪',
          title: 'Run inspection assertions',
          description: 'All stories are complete. Verify the implementation against the acceptance criteria.',
          actionLabel: 'Run Assertions',
          howId: 'run-assertions',
          badgeLabel: 'Phase 6',
          badgeClass: 'badge-phase',
        })
        cards.push({
          id: 'code-review',
          priority: 40,
          icon: '🔍',
          title: 'Close sprint & run code review',
          description: 'Trigger the automated code review — Claude reviews all changes and surfaces findings.',
          actionLabel: 'Close Sprint',
          howId: 'code-review',
          badgeLabel: 'Phase 7',
          badgeClass: 'badge-phase',
        })
      } else {
        const pending = progress?.pendingCount ?? '?'
        cards.push({
          id: 'continue-sprint',
          priority: 30,
          icon: '▶️',
          title: 'Continue implementing',
          description: `Sprint is ${sprintPct}% complete — ${pending} stor${pending === 1 ? 'y' : 'ies'} remaining.`,
          actionLabel: 'View Sprint',
          howId: 'run-sprint',
          badgeLabel: 'Phase 5',
          badgeClass: 'badge-phase',
        })
      }
      return _sort(cards)
    }

    // Phase 9 / 10: sprint completed
    if (status === 'completed') {
      if (hasFiles) {
        cards.push({
          id: 'commit',
          priority: 50,
          icon: '💾',
          title: 'Commit your changes',
          description: 'The sprint is complete and code review is done. Commit your work to version control.',
          actionLabel: 'Commit',
          howId: 'commit',
          badgeLabel: 'Phase 9',
          badgeClass: 'badge-phase',
        })
      } else {
        cards.push({
          id: 'next-sprint',
          priority: 60,
          icon: '🔄',
          title: 'Plan your next sprint',
          description: 'Sprint is done and committed. Head back to discovery or decompose new features into stories.',
          actionLabel: 'Go to Backlog',
          howId: 'derive-stories',
          badgeLabel: 'Phase 10',
          badgeClass: 'badge-phase',
        })
      }
      return _sort(cards)
    }
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
