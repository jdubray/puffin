# CRE Process: End-to-End Sprint Lifecycle

This document describes the Central Reasoning Engine (CRE) process from start to finish, covering every phase of the sprint lifecycle, the components involved, and the data flowing between them.

---

## Process Flow Diagram

```
                         SPRINT LIFECYCLE
                         ================

  [1] SPRINT CREATION
       User selects stories --> CREATE_SPRINT action
       |
       v
  [2] PLANNING PHASE
       START_SPRINT_PLANNING --> cre:generate-plan
       |                         |
       |                    Ambiguity Analysis (AI)
       |                         |
       |                    Questions returned
       |                         |
       |                    User answers questions
       |                         |
       v                    cre:submit-answers
  [3] PLAN GENERATION           |
       CRE_PLAN_READY <---- Plan generated (AI)
       |
       User reviews plan
       |
       +--[refine]--> cre:refine-plan --> updated plan --> back to review
       |
       v
  [4] PLAN APPROVAL
       APPROVE_PLAN_WITH_CRE --> cre:approve-plan
       |
       +---> cre:generate-assertions (per story, AI)
       +---> cre:generate-ris (per story, AI)
       |
       v
       CRE_PLANNING_COMPLETE
       |
       v
  [5] SPRINT EXECUTION
       Stories implemented one at a time
       |
       UPDATE_SPRINT_STORY_STATUS (per story)
       |
       v
  [6] SPRINT CLOSURE
       All stories completed
       |
       showCodeReviewConfirmation() --> Assertion stats
       |
       showSprintCloseModal() --> Git commit (optional)
       |
       CLEAR_SPRINT_WITH_DETAILS --> Archive to sprint_history
```

---

## Phase 1: Sprint Creation

### What Happens

The user selects one or more stories from the backlog and creates a sprint. The system bundles these stories into a sprint object, updates their statuses, and prepares for planning.

### Components Involved

| Component | File | Role |
|-----------|------|------|
| User Stories UI | `src/renderer/components/user-stories/user-stories.js` | Story selection and "Create Sprint" button |
| SAM Actions | `src/renderer/sam/actions.js` | `createSprint(stories)` dispatches `CREATE_SPRINT` |
| SAM Model | `src/renderer/sam/model.js` | `createSprintAcceptor` builds the sprint object |
| State Persistence | `src/renderer/lib/state-persistence.js` | Intercepts action, persists to DB |
| Sprint Service | `src/main/services/sprint-service.js` | Backend persistence via atomic transactions |
| Sprint Repository | `src/main/database/repositories/sprint-repository.js` | Direct DB operations |

### Data Flow

1. User selects stories in the backlog UI and clicks **Create Sprint**
2. `CREATE_SPRINT` action dispatched with the story array
3. `createSprintAcceptor` runs in the SAM model:
   - Deduplicates stories by ID
   - Generates a sprint ID (`Date.now().toString(36) + random`)
   - Sets all selected stories to `status: 'in-progress'` in both sprint and backlog
   - Creates the sprint object with `status: 'created'`
   - Auto-generates a sprint title from story titles
   - Initializes empty `storyProgress` and `branchAssignments`
4. State persistence intercepts the action and calls:
   - `window.puffin.state.updateActiveSprint(sprint)` -- persists sprint to DB
   - `syncStoryStatus()` -- updates story statuses in the DB atomically
5. UI switches to the prompt view with the sprint active

### State Transition

```
No Active Sprint  -->  Sprint Created (status: 'created')
Selected Stories:  pending --> in-progress
```

---

## Phase 2: Planning Phase (Ambiguity Analysis)

### What Happens

The user initiates CRE planning. The system loads sprint stories, sends them to the AI for ambiguity analysis, and returns clarifying questions for the user to answer before plan generation.

### Components Involved

| Component | File | Role |
|-----------|------|------|
| SAM Actions | `src/renderer/sam/actions.js` | `startSprintPlanning()` dispatches `START_SPRINT_PLANNING` |
| SAM Model | `src/renderer/sam/model.js` | `startSprintPlanningAcceptor` sets pending flag |
| CRE IPC Handler | `src/main/cre/index.js` | `cre:generate-plan` handler |
| Plan Generator | `src/main/cre/plan-generator.js` | `analyzeSprint()` state machine method |
| AI Client | `src/main/cre/lib/ai-client.js` | `sendCrePrompt()` sends prompt to Claude CLI |
| Ambiguity Prompt | `src/main/cre/lib/prompts/analyze-ambiguities.js` | Builds the analysis prompt |
| Ambiguity Schema | `src/main/schemas/cre-ambiguities.schema.json` | JSON Schema for structured output |
| Claude Service | `src/main/claude-service.js` | `sendPrompt()` spawns Claude CLI process |
| Preload Bridge | `src/main/preload.js` | `window.puffin.cre.generatePlan()` |

### Data Flow

1. User clicks **Plan Sprint** in the sprint action bar
2. `START_SPRINT_PLANNING` action dispatched
3. `startSprintPlanningAcceptor` sets:
   - `sprint.status = 'planning'`
   - `model._pendingCrePlanning = true` (renderer trigger flag)
4. Renderer detects the pending flag and calls `window.puffin.cre.generatePlan(sprintId, stories)`
5. Main process `cre:generate-plan` handler:
   - Acquires the **process lock** (prevents concurrent CLI access)
   - Calls `PlanGenerator.analyzeSprint(sprintId, stories, codeModelSummary)`
6. `analyzeSprint()` transitions the state machine: `IDLE --> ANALYZING`
   - Creates or reuses a plan record in the `plans` DB table
   - Builds an ambiguity analysis prompt via `analyzeAmbiguities.buildPrompt()`
   - Calls `sendCrePrompt()` with `jsonSchema: AMBIGUITY_SCHEMA`
7. `sendCrePrompt()` assembles the prompt and calls `claudeService.sendPrompt()`:
   - Passes `--json-schema` flag with the ambiguity schema
   - Sets `maxTurns: 2` (required for StructuredOutput tool-use cycle)
   - Claude CLI returns a `StructuredOutput` tool_use block with validated JSON
8. AI returns `{ questions: [...], summary: "..." }` -- each question has `storyId`, `question`, `reason`, `suggestions`, `priority`
9. State machine transitions: `ANALYZING --> QUESTIONS_PENDING`
10. Questions returned to the renderer for display

### State Transition

```
PlanGenerator: IDLE --> ANALYZING --> QUESTIONS_PENDING
Sprint:        created --> planning
```

---

## Phase 3: Plan Generation

### What Happens

After the user answers clarifying questions (or skips them), the CRE generates an ordered implementation plan with plan items, shared components, and risks.

### Components Involved

| Component | File | Role |
|-----------|------|------|
| CRE IPC Handler | `src/main/cre/index.js` | `cre:submit-answers` handler |
| Plan Generator | `src/main/cre/plan-generator.js` | `generatePlan()` method |
| Plan Prompt | `src/main/cre/lib/prompts/generate-plan.js` | Builds the plan generation prompt |
| Plan Schema | `src/main/schemas/cre-plan.schema.json` | JSON Schema for structured plan output |
| CRE Storage | `src/main/cre/lib/storage.js` | Writes plan JSON to `.puffin/cre/plans/` |
| SAM Actions | `src/renderer/sam/actions.js` | `CRE_PLAN_READY` dispatched on success |

### Data Flow

1. User answers questions in the UI and submits
2. `cre:submit-answers` IPC handler receives answers
3. `PlanGenerator.generatePlan(sprintId, stories, answers, codeModelContext)`:
   - Transitions: `QUESTIONS_PENDING --> GENERATING`
   - Records Q&A in `clarificationHistory`
   - Builds prompt via `generatePlan.buildPrompt()` (includes stories, answers, code model context)
   - Calls `sendCrePrompt()` with `jsonSchema: PLAN_SCHEMA`
4. AI returns structured plan: `{ planItems: [...], sharedComponents: [...], risks: [...] }`
   - Each `planItem` has: `order`, `storyId`, `title`, `approach`, `filesCreated`, `filesModified`, `dependencies`, `complexity`, `notes`
5. Plan saved to `.puffin/cre/plans/{sprintId}.json`
6. DB row updated: `plans.status = 'review_pending'`, `iteration = 1`
7. State machine transitions: `GENERATING --> REVIEW_PENDING`
8. `CRE_PLAN_READY` action dispatched to renderer with plan data
9. `crePlanReadyAcceptor` stores:
   - `sprint.crePlan = plan`
   - `sprint.crePlanId = planId`
   - `sprint.status = 'planned'`
   - `sprint.implementationOrder = [storyIds in plan order]`

### Plan Refinement (Optional Loop)

If the user requests changes to the plan:

1. User enters feedback and clicks **Iterate**
2. `cre:refine-plan` IPC handler receives feedback
3. `PlanGenerator.refinePlan(planId, feedback, codeModelContext)`:
   - Transitions: `REVIEW_PENDING --> GENERATING`
   - Reads current plan from storage
   - Builds refinement prompt (includes current plan, feedback, full clarification history)
   - Calls `sendCrePrompt()` with `jsonSchema: PLAN_SCHEMA`
4. AI returns updated plan (may include `changelog` and `questions` for follow-ups)
5. Merges AI refinements into existing plan, increments iteration
6. Saves updated plan and transitions back: `GENERATING --> REVIEW_PENDING`
7. Updated plan sent to renderer for another review cycle

### State Transition

```
PlanGenerator: QUESTIONS_PENDING --> GENERATING --> REVIEW_PENDING
               (optional loop: REVIEW_PENDING --> GENERATING --> REVIEW_PENDING)
Sprint:        planning --> planned
```

---

## Phase 4: Plan Approval and Assertion Generation

### What Happens

The user approves the plan. The CRE then generates inspection assertions for each story (testable conditions to verify implementation) and Ready-to-Implement Specifications (RIS) providing detailed implementation guidance.

### Components Involved

| Component | File | Role |
|-----------|------|------|
| SAM Actions | `src/renderer/sam/actions.js` | `approvePlanWithCre()` dispatches `APPROVE_PLAN_WITH_CRE` |
| SAM Model | `src/renderer/sam/model.js` | Sets `_pendingCreApproval` flag |
| CRE IPC Handlers | `src/main/cre/index.js` | `cre:approve-plan`, `cre:generate-assertions`, `cre:generate-ris` |
| Plan Generator | `src/main/cre/plan-generator.js` | `approvePlan()` transitions to APPROVED |
| Assertion Generator | `src/main/cre/assertion-generator.js` | `generate()` creates assertions per story |
| Assertion Prompt | `src/main/cre/lib/prompts/generate-assertions.js` | Builds assertion prompt |
| Assertion Schema | `src/main/schemas/cre-assertions.schema.json` | JSON Schema for assertion output |
| RIS Generator | `src/main/cre/ris-generator.js` | `generateRIS()` creates implementation specs |
| RIS Prompt | `src/main/cre/lib/prompts/generate-ris.js` | Builds RIS prompt |
| Code Model | `src/main/cre/code-model.js` | Provides codebase context for RIS |

### Data Flow

1. User clicks **Approve** in the plan review UI
2. `APPROVE_PLAN_WITH_CRE` action dispatched
3. `approvePlanWithCreAcceptor` sets `model._pendingCreApproval = true`
4. Renderer detects flag and calls `window.puffin.cre.approvePlan(planId)`

**Plan Approval:**
5. `cre:approve-plan` handler calls `PlanGenerator.approvePlan(planId)`:
   - Transitions: `REVIEW_PENDING --> APPROVED`
   - Updates plan: `status = 'approved'`, `approvedAt` timestamp
   - Saves approved plan to storage and DB
   - Generates assertion prompt templates for each plan item
   - Transitions: `APPROVED --> IDLE` (resets for next session)

**Assertion Generation (per story):**
6. For each story, renderer calls `window.puffin.cre.generateAssertions()`
7. `cre:generate-assertions` handler calls `AssertionGenerator.generate()`:
   - Builds prompt from plan item and story context
   - Calls `sendCrePrompt()` with `jsonSchema: ASSERTION_SCHEMA`
   - AI returns `{ assertions: [{ id, type, target, message, assertion }] }`
   - Assertion types (lowercase): `file_exists`, `function_exists`, `export_exists`, `pattern_match`
   - Each assertion validated and stored in `inspection_assertions` DB table
   - Also persisted to `user_stories.inspection_assertions` JSON column (for UI access)

**RIS Generation (per story):**
8. For each story, renderer calls `window.puffin.cre.generateRis()`
9. `cre:generate-ris` handler calls `RISGenerator.generateRIS()`:
   - Loads story, plan item, branch memory, code model context, and assertions
   - Sends to AI for RIS generation (returns markdown, no JSON schema)
   - Falls back to local template if AI unavailable
   - Stores in `ris` DB table with `status: 'generated'`

**Completion:**
10. `CRE_PLANNING_COMPLETE` action dispatched with `risMap` and final plan
11. `crePlanningCompleteAcceptor` stores:
    - `sprint.risMap = { storyId: risMarkdown, ... }`
    - `sprint.planApprovedAt` timestamp
    - Clears all pending CRE flags

### State Transition

```
PlanGenerator: REVIEW_PENDING --> APPROVED --> IDLE
Sprint:        planned (with planApprovedAt set)
```

---

## Phase 5: Sprint Execution

### What Happens

Stories are implemented one at a time. The user (or automated mode) works through stories in the plan-defined order. Each story's progress and acceptance criteria completion are tracked.

### Components Involved

| Component | File | Role |
|-----------|------|------|
| App UI | `src/renderer/app.js` | Sprint view with story cards, progress bars |
| SAM Actions | `src/renderer/sam/actions.js` | Story status and criteria actions |
| SAM Model | `src/renderer/sam/model.js` | Story status acceptors |
| State Persistence | `src/renderer/lib/state-persistence.js` | Syncs story status to DB |
| Sprint Service | `src/main/services/sprint-service.js` | Atomic status sync |
| Claude Service | `src/main/claude-service.js` | Interactive CLI for implementation |

### Data Flow

**Starting a Story:**
1. User clicks **Implement** on a story card
2. `START_SPRINT_STORY_IMPLEMENTATION` action dispatched
3. `storyProgress[storyId]` initialized with `status: 'in-progress'`, `startedAt`
4. RIS injected into Claude CLI context (if available from `sprint.risMap`)
5. Branch-specific `CLAUDE.md` activated

**During Implementation:**
6. User works with Claude CLI through Puffin's prompt interface
7. Acceptance criteria can be toggled complete individually: `TOGGLE_CRITERIA_COMPLETION`
8. Story progress tracked in `sprint.storyProgress[storyId]`

**Completing a Story:**
9. Story marked complete: `UPDATE_SPRINT_STORY_STATUS(storyId, 'completed')`
10. `updateSprintStoryStatusAcceptor`:
    - Sets `storyProgress[storyId].status = 'completed'`
    - Records `completedAt` timestamp
    - Syncs status to backlog: `backlogStory.status = 'completed'`
    - Checks if all stories completed
11. State persistence intercepts and calls `state:syncStoryStatus`:
    - Atomic DB transaction updates both sprint progress and backlog
    - Triggers assertion evaluation for the completed story
    - Emits `story-status-synced` event
12. When all stories are completed: `sprint.status = 'completed'`

### State Transition

```
Story:   in-progress --> completed
Sprint:  planned --> implementing --> completed (when all stories done)
```

---

## Phase 6: Sprint Closure

### What Happens

After all stories are completed, the sprint enters the closure phase. This involves a code review checkpoint (with assertion evaluation), an optional git commit, and archival of the sprint to history.

### Components Involved

| Component | File | Role |
|-----------|------|------|
| App (Code Review) | `src/renderer/app.js` | `showCodeReviewConfirmation()`, `calculateSprintAssertionStats()` |
| Assertion Evaluator | `src/main/evaluators/assertion-evaluator.js` | Evaluates assertions against codebase |
| Modal Manager | `src/renderer/lib/modal-manager.js` | `renderSprintClose()` renders close modal |
| SAM Model | `src/renderer/sam/model.js` | `clearSprintAcceptor`, `clearSprintWithDetailsAcceptor` |
| State Persistence | `src/renderer/lib/state-persistence.js` | Archives sprint, optional git commit |
| Sprint Service | `src/main/services/sprint-service.js` | `closeAndArchive()` atomic archival |

### Data Flow

**Code Review Checkpoint:**
1. Sprint completion triggers `showCodeReviewConfirmation()`
2. Fresh story data fetched from DB (avoids stale in-memory state)
3. `calculateSprintAssertionStats()` computes:
   - Total assertions across all stories
   - Passed, failed, pending, not-evaluated counts
   - Prefers DB-sourced assertions over in-memory copies
4. Modal displays stats with recommendation:
   - All passed: "Proceed with confidence"
   - Failures present: "Review failures before closing"
   - Unevaluated: "Evaluate assertions first"
5. User chooses to **Skip** or **Start Code Review**

**Assertion Evaluation:**
6. Triggered per-story when marked complete, or manually before close
7. `state:evaluateStoryAssertions` IPC handler runs `AssertionEvaluator`:
   - Normalizes assertion types to UPPERCASE (CRE generates lowercase)
   - 10 evaluator types: `FILE_EXISTS`, `FILE_CONTAINS`, `JSON_PROPERTY`, `EXPORT_EXISTS`, `CLASS_STRUCTURE`, `FUNCTION_SIGNATURE`, `IMPORT_EXISTS`, `IPC_HANDLER_REGISTERED`, `CSS_SELECTOR_EXISTS`, `PATTERN_MATCH`
   - Evaluates in parallel (concurrency limit: 5)
   - Results stored in `user_stories.assertion_results` JSON column
   - Progress events emitted: `assertion-evaluation-progress`, `assertion-evaluation-complete`

**Sprint Close Modal:**
8. `renderSprintClose()` renders the close modal:
   - Sprint title input (auto-generated from date)
   - Description textarea
   - Git commit section (if git repo detected):
     - Toggle checkbox for commit
     - Branch warning if on main/master
     - Changes summary (staged/modified/untracked)
     - Editable commit message textarea
9. User confirms closure

**Archival:**
10. `CLEAR_SPRINT_WITH_DETAILS` action dispatched with title, description, commit flag
11. `clearSprintWithDetailsAcceptor`:
    - Syncs completed stories to backlog (`status: 'completed'`)
    - Resets in-progress stories to `status: 'pending'`
    - Creates `_sprintToArchive` object with full sprint data, stories, and `closedAt` timestamp
12. State persistence intercepts and calls `state:archiveSprintToHistory`:
    - `SprintService.closeAndArchive()` runs an atomic transaction:
      - Archives to `sprint_history` table (inline story JSON)
      - Deletes from active `sprints` table
      - Updates all story statuses in DB
13. If git commit enabled:
    - Stages all changes
    - Commits with generated/edited message
14. `model.activeSprint = null` -- sprint fully closed

### State Transition

```
Sprint:            completed --> archived (in sprint_history table)
Completed Stories: remain 'completed' in backlog
In-progress Stories: reset to 'pending' in backlog
Active Sprint:     cleared (null)
```

---

## Key Architectural Patterns

### SAM (State-Action-Model)

All state changes flow through the SAM cycle:
```
User Action --> SAM Action --> Acceptor (model mutation) --> State Representation --> Render
                                  |
                          State Persistence (intercepts specific actions, syncs to DB)
```

Pending flags (e.g., `_pendingCrePlanning`, `_pendingCreApproval`) bridge async CRE operations: the acceptor sets the flag, the renderer detects it and calls the appropriate IPC method, and the completion action clears the flag.

### Process Lock

All CRE operations that invoke Claude CLI acquire a process lock (`withProcessLock()`) to prevent concurrent CLI access. Only one AI call can be in flight at a time.

### Dual Assertion Storage

Assertions are stored in two places:
- **`inspection_assertions` DB table**: CRE canonical storage (per plan/story)
- **`user_stories.inspection_assertions` JSON column**: UI reads from here

Both paths write to the `user_stories` column to keep the UI in sync.

### JSON Schema Structured Output

CRE callers pass JSON Schema files to `sendCrePrompt()`, which forwards them to `sendPrompt()` via the `--json-schema` CLI flag. This triggers a `StructuredOutput` tool-use cycle in Claude CLI, returning validated JSON instead of free-form text. The schemas are:

| Schema | File | Used By |
|--------|------|---------|
| Ambiguities | `src/main/schemas/cre-ambiguities.schema.json` | `analyzeSprint()` |
| Plan | `src/main/schemas/cre-plan.schema.json` | `generatePlan()`, `refinePlan()` |
| Assertions | `src/main/schemas/cre-assertions.schema.json` | `generate()` |
| *(none)* | | `generateRIS()` (outputs markdown) |

When the schema path is active, `sendCrePrompt()` tries direct `JSON.parse` first (skipping heuristic extraction). When no schema is provided (backward-compatible path), `parseJsonResponse()` uses a 3-strategy fallback: direct parse, markdown fence extraction, brace extraction.
