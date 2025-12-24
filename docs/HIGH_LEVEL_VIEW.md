# Puffin High-Level View

Puffin is an orchestration layer for Claude Code that transforms how developers interact with AI-assisted development. Rather than ad-hoc prompting, Puffin provides a structured workflow from specification to deployment.

## What is Puffin?

Puffin is an Electron-based GUI application that serves as a **management layer** on top of Claude Code CLI. It doesn't replace Claude Code—it orchestrates and tracks its outputs while providing rich context for each interaction.

**Key Principles:**
- Claude Code remains in control of building the project
- Puffin tracks, organizes, and provides context
- All state is persisted in the `.puffin/` directory
- Dynamic context is generated based on the active branch

## The Puffin Workflow

<img src="workflows/end-to-end workflow.png" alt="End-to-End Workflow" width="50%">

Puffin implements a structured development pipeline:

```
SPECIFY → DERIVE STORIES → PLAN → IMPLEMENT → DEPLOY
```

Each phase has dedicated tooling and context management to ensure Claude Code receives the right information at the right time.

---

## Phase 1: Specification & Requirements

<img src="workflows/phase 1 specify and derive.png" alt="Phase 1: Specify and Derive" width="50%">

The **Specifications branch** is a planning-only space where you:
- Describe features and requirements in natural language
- Discuss requirements with Claude for clarification
- Establish project scope and constraints

**Important:** The Specifications branch does NOT allow code changes. It's reserved for planning, documentation, and user story generation.

### Key Actions:
- Write requirements or feature descriptions
- Claude analyzes and asks clarifying questions
- Responses are saved to conversation history

---

## Phase 2: User Story Derivation

<img src="workflows/phase 2 user story derivation.jpg" alt="Phase 2: User Story Derivation" width="50%">

From your specifications, Puffin can derive structured user stories:

1. **Check "Derive User Stories"** when submitting a prompt
2. **Claude analyzes** the specification and generates stories
3. **Review in modal** - edit, accept, or request changes
4. **Add to backlog** - stories are persisted to `user-stories.json`

Each user story includes:
- **Title**: Brief descriptive name
- **Description**: "As a [role], I want [feature] so that [benefit]"
- **Acceptance Criteria**: Testable conditions for completion
- **Status**: pending → in-progress → completed → archived

---

## Phase 3: Sprint Planning

<img src="workflows/phase 3 sprint creation and planning.png" alt="Phase 3: Sprint Creation and Planning" width="50%">

Sprints provide focused implementation cycles:

1. **Select stories** from the backlog (maximum 4 per sprint)
2. **Create sprint** - validates story count to avoid token limits
3. **Request plan** - Claude generates an implementation plan covering:
   - Technical approach per story
   - File changes required
   - Dependencies and risks
   - Implementation sequence
4. **Review and approve** - plan becomes the implementation roadmap

### Why 4 Stories Maximum?
To ensure Claude Code has enough context without exceeding token limits, and to keep sprints focused and manageable.

---

## Phase 4: Implementation

<img src="workflows/phase 4 implementation workflow.png" alt="Phase 4: Implementation Workflow" width="50%">

Once a plan is approved, implement stories with full context:

1. **Select a story** from the sprint panel
2. **Choose implementation branch**: UI, Backend, or Fullstack
3. **Claude implements** with:
   - The approved plan
   - Story acceptance criteria
   - Branch-specific context (design tokens for UI, data models for backend)
   - Project architecture

### Auto-Continue System
Puffin includes an auto-continue feature for long implementations:
- Detects when Claude's response is incomplete
- Waits 20 seconds (with countdown)
- Automatically sends continuation prompt
- Stops when `[Complete]` is detected or max iterations reached
- **Stuck detection**: Alerts if output becomes repetitive

### Acceptance Criteria Tracking
Check off criteria as you verify each requirement is met. The story is marked complete when all criteria are satisfied.

---

## Phase 5: Handoff Between Branches

<img src="workflows/phase 5 handoff between branches.png" alt="Phase 5: Handoff Between Branches" width="50%">

Context handoff ensures continuity when moving between branches:

1. **Complete work** on current branch (e.g., UI)
2. **Click "Handoff Ready"** to initiate handoff
3. **Review summary** - Claude generates a context summary
4. **Complete handoff** - summary is attached to the target branch
5. **New thread** receives the handoff context automatically

### Handoff Contents:
- What was implemented
- Key decisions made
- Next steps for the receiving branch
- Any outstanding issues or dependencies

---

## Phase 6: Git Operations & Deployment

<img src="workflows/phase 6 operation and development.png" alt="Phase 6: Operation and Development" width="50%">

Puffin integrates with Git for version control:

### Repository Operations:
- **Branch management**: Create feature branches, checkout, merge
- **Staging**: Stage/unstage files, view diffs
- **Commit**: Claude can generate commit messages from staged changes
- **Push/Pull**: Sync with remote repositories

### Commit Message Generation:
Claude analyzes staged changes and generates conventional commit messages:
```
feat(auth): implement login form with validation

- Add email/password form fields
- Implement client-side validation
- Display error messages on invalid input
```

All git operations are logged to `.puffin/git-operations.json` for traceability.

---

## Dynamic CLAUDE.md Generation

<img src="workflows/Dynamic Claude.md generation.jpg" alt="Dynamic CLAUDE.md Generation" width="50%">

Puffin generates context files that Claude Code reads automatically:

### Base Context (All Branches):
- Project name and description
- Coding preferences (style, testing, naming conventions)
- Active user stories
- Architecture overview

### Branch-Specific Context:

| Branch | Additional Context |
|--------|-------------------|
| **Specifications** | User story templates, NO CODE CHANGES allowed |
| **Architecture** | System design, API contracts, data models |
| **UI** | Design tokens, component patterns, typography |
| **Backend** | Data models, API patterns, database schema |
| **Deployment** | Infrastructure notes, environment config |

When you switch branches, Puffin regenerates `CLAUDE.md` by combining base + branch content.

---

## Data Artifacts & Persistence

<img src="workflows/data_artificats and persistence.png" alt="Data Artifacts and Persistence" width="50%">

All Puffin state is stored in the `.puffin/` directory:

```
.puffin/
├── config.json           # Project settings, preferences
├── history.json          # Conversation branches & prompts
├── user-stories.json     # Backlog with acceptance criteria
├── story-generations.json # Derivation history, journeys
├── architecture.md       # System architecture document
├── ui-guidelines.json    # Design tokens, patterns
├── active-sprint.json    # Current sprint state
└── git-operations.json   # Git operation history
```

Target project context files:
```
target-project/.claude/
├── CLAUDE.md             # Active context (base + branch)
├── CLAUDE_base.md        # Shared project context
├── CLAUDE_specifications.md
├── CLAUDE_architecture.md
├── CLAUDE_ui.md
├── CLAUDE_backend.md
└── CLAUDE_deployment.md
```

---

## Quick Reference: The Complete Flow

<img src="workflows/tasks - high level view.png" alt="Tasks High Level View" width="50%">

| Step | Action | Outcome |
|------|--------|---------|
| 1 | Write specification | Requirements documented |
| 2 | Derive user stories | Backlog populated |
| 3 | Create sprint (≤4 stories) | Sprint initialized |
| 4 | Request plan | Implementation roadmap |
| 5 | Approve plan | Sprint ready for work |
| 6 | Implement story | Code changes made |
| 7 | Test & verify criteria | Story completed |
| 8 | Handoff context | Branch transition |
| 9 | Commit & push | Changes versioned |
| 10 | Merge to main | Feature integrated |

---

## Key Benefits

1. **Structured Workflow**: From idea to deployment with clear phases
2. **Context Persistence**: Never lose conversation history or decisions
3. **Branch-Specific Guidance**: Right context for the right task
4. **Sprint Management**: Focused, manageable implementation cycles
5. **Acceptance Criteria**: Clear definition of done
6. **Handoff Continuity**: Seamless branch transitions
7. **Git Integration**: Version control built into the workflow
8. **Planning-Only Zones**: Specifications branch prevents premature coding

---

## Getting Started

1. **Open a project** in Puffin
2. **Configure** project settings and preferences
3. **Start on Specifications** branch
4. **Write requirements** and derive user stories
5. **Create a sprint** with 1-4 stories
6. **Plan, implement, and iterate**
7. **Use handoffs** when switching branches
8. **Commit and push** when features are complete
