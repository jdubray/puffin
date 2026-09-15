# Plan → Board → Implement — Functional Specification

**Status:** Implemented in 4.2.0 — 2026-09-15. Deviations from the draft are in §13.
**Target:** Puffin 4.2
**Builds on:** the Prompt window, the Task board (`user_stories`, To Do / Doing / Done), Quick Code Review (`Review Task`), `PromptEditor.submitExternal()` (4.1), the Architecture tab (4.1, for Phase 2 hooks)

---

## 1. Purpose

Claude Code's planning has become good enough to trust: plan mode explores the codebase read-only, writes a structured plan, and asks for approval before touching anything; skills (`/archlens`, `/code-review`, project skills) package repeatable work. Today none of that reaches Puffin's task board — plans live in `~/.claude/plans/*.md`, get approved in the terminal, and the board is filled by hand.

This feature closes the loop **inside the Prompt window**:

1. **Plan** — ask Claude to plan (plan mode), review the plan in Puffin, edit it, approve it.
2. **Board** — an approved plan becomes tasks on the board, in order, with acceptance criteria and links back to the plan and the conversation.
3. **Implement** — from a card (or from the plan), launch the implementation of one task or of the whole plan, step by step, each step reviewed with the existing *Review Task* pass before the card reaches *Done*.

Puffin remains the orchestration and tracking layer: Claude Code plans and builds; Puffin holds the plan, the tasks, their state, and the evidence of what happened.

### 1.1 What Claude Code provides (and what Puffin adds)

| Capability | Provided by Claude Code | Puffin's role |
|---|---|---|
| Read-only exploration and a written plan | `--permission-mode plan`; the model ends with `ExitPlanMode` carrying the plan | Run it from the Prompt window, capture the plan, show it for review |
| Approval gate | `ExitPlanMode` blocks until the host approves | Puffin **is** the host: the approval happens in a Puffin panel, not in a terminal |
| Plan files | `~/.claude/plans/<slug>.md` | Import existing ones; keep the approved copy with the project |
| Skills | `/skill-name` in a prompt | Let a plan step name a skill; pass it through unchanged |
| Implementation | The normal interactive session, session resume | Compose the prompt from the task + plan, track the run, review, advance the card |
| Code review | `/code-review`, Puffin's Quick Code Review convention | Reuse *Review Task* as the gate before *Done* |

---

## 2. Concepts

- **Plan** — a markdown document produced by a planning session (or imported), with a title, context, ordered **steps**, and a verification section. Stored with the project as `docs/plans/<slug>.md` once approved, plus a row in the database that links it to the tasks it produced.
- **Step** — one unit of the plan: a heading or numbered item with a body. On approval every step becomes a **task** unless the user unchecks it.
- **Task** — a card on the board (`user_stories` today; the UI already says *Task*). New fields: `plan_id`, `plan_step` (order), `depends_on` (task ids), `acceptance_criteria` (already exists), `thread_id` (the conversation that implements it), `skill` (optional `/name` the step invokes), `run_state`.
- **Implementation run** — one Claude session launched for one task, in the workspace the plan was made in, as a new thread whose prompt carries the plan context and the task. A run ends with the task *implemented*, *reviewed*, or *failed*.
- **Plan run** — implementing every task of a plan in order, one session at a time, stopping at the first failure or when a task is blocked by a dependency.

---

## 2.1 Relation to the 3.x sprint

Puffin 3.x had sprints: a selection of backlog stories, a CRE-generated implementation plan, a RIS per story, inspection assertions, and an orchestration engine that ran the sprint story by story. 4.0 removed all of it. The **plan** is the 4.x replacement, and *Implement* / *Run plan* are the sprint runner rebuilt on Claude's own planning:

| 3.x sprint | 4.2 plan |
|---|---|
| Sprint = selected backlog stories | Plan = an approved Claude plan whose steps become tasks |
| CRE generates the implementation plan | Claude Code plan mode; the human approves in the Plan Review panel |
| RIS per story | Step body + acceptance criteria + plan context in the task prompt (§6.2); no separate artifact |
| Inspection assertions + code review modal | The Review Task pass as the gate before *Done*, with a bounded fix loop |
| Implement one story | **Implement** on a card (§4.5) |
| Run the sprint (dedicated orchestration engine) | **Run plan** (§4.6): the per-task path repeated in `plan_step` order, one session at a time, stop on first failure |
| Sprint close, completion summary | Plan group progress; each card keeps its thread, review, files touched, commit range |

Design rule: **there is one implementation path, the card's.** *Run plan* is a queue over it, not a second engine with its own state — the 3.x orchestrator's separate state was the source of most of its bugs.

## 3. Scope

### In scope (4.2)

- A **Plan** mode in the Prompt window (toggle next to Model / Thinking Budget), backed by `--permission-mode plan`.
- Capturing the plan at `ExitPlanMode`, a **Plan Review** panel (rendered plan, editable step list, per-step include/exclude, acceptance criteria, dependencies), approve / reject / revise.
- **Send to board**: approved plan → tasks, plan saved under `docs/plans/`, plan record in the DB, link from tasks to plan and from the plan to its source prompt.
- **Import a plan** from `~/.claude/plans/*.md` or any `docs/plans/*.md` into the same review panel.
- **Implement** from a card and from the plan panel: composes the prompt, starts a new thread in the plan's workspace, moves the card to *Doing*, tracks the run, runs *Review Task* on completion, moves to *Done* or shows the issues; **Implement next** / **Run plan** for sequential execution with stop-on-failure.
- Board changes: plan grouping, step numbers, dependency badges, run state badges, *Implement* / *Review* / *Reopen* actions on cards, a *Plans* filter.
- Skills in steps: a step whose body starts with `/skill …` is launched as that skill prompt.

### Out of scope (later)

- Parallel runs (Puffin runs one Claude session at a time by design).
- Editing the plan prose in a rich editor (the Editor tab opens the markdown file).
- Automatic architecture refresh after a run (Phase 2 of the Architecture tab; §9 leaves the hook).
- Sprint-style estimates, burndown, or time tracking — deliberately not returning from 3.x.

---

## 4. User flows

### 4.1 Plan from the Prompt window

1. The user selects **Plan** in the Prompt window's option bar (a segmented control: *Build* | *Plan*). The submit button reads **Plan**. A hint under the editor says *Claude will explore read-only and propose a plan for your approval. Nothing is written.*
2. The user writes the request as usual ("Add an Architecture-aware code review that runs archlens review on the changed files…") and submits. Puffin starts the session with `--permission-mode plan`. The CLI Output tab streams as usual; the response viewer shows the exploration.
3. When Claude calls `ExitPlanMode`, Puffin **does not** auto-approve. It opens the **Plan Review** panel (§4.3) with the plan text. The session stays alive, waiting.
4. The user chooses:
   - **Approve & send to board** — Puffin answers the approval, the session ends (plan mode sessions end after approval; nothing is implemented in that session), the plan is saved and tasks are created (§4.4).
   - **Approve only** — same, but no tasks are created; the plan is saved under `docs/plans/` for later import.
   - **Revise** — the user types feedback in the panel; Puffin answers *rejected* with that feedback and the session continues planning; the panel updates on the next `ExitPlanMode`.
   - **Discard** — rejects and cancels the session. Nothing is saved.
5. The prompt and Claude's reply (the plan) are recorded in history like any other turn, so the conversation that led to the plan is navigable from the plan later.

If the model finishes the plan session **without** calling `ExitPlanMode` (it can, when it decides the task is trivial or wrote the plan as plain text), Puffin still offers **Treat reply as plan** on the response, which opens the same panel with the reply text (§5 extraction rules apply).

### 4.2 Import an existing plan

- **Prompt window ▸ Plan ▸ Import…** lists `~/.claude/plans/*.md` (newest first, with the first heading as title) and `docs/plans/*.md`. Picking one opens the Plan Review panel in import mode (no live session; *Revise* becomes *Open in Editor*).
- Drag-and-drop of a `.md` file onto the prompt editor while in Plan mode does the same.

### 4.3 Plan Review panel

A panel that slides over the response viewer (like the handoff review). Two columns:

**Left — the plan as written.** Rendered markdown, read-only here; *Open in Editor* opens the file for edits (after save) and re-extracts on save.

**Right — what the board will get.**
- Plan title (editable, defaults to the first heading) and target **workspace** (defaults to the current one).
- Ordered **step list**, one row per extracted step (§5): checkbox (include), step number, title, a collapsible body, an **acceptance criteria** list (editable; pre-filled from a *Verification* / *Tests* section or from checkbox items inside the step), **depends on** (multi-select of earlier steps; pre-filled when a step says "after step N" / "requires …"), and a **skill** field when the step invokes one.
- Steps can be reordered by drag, merged (select two → *Merge*), or split (a step with sub-bullets → *Split into N*).
- Summary line: *7 steps → 7 tasks in workspace Backend; 2 excluded.*

Buttons: **Approve & send to board** (primary), **Approve only**, **Revise…**, **Discard**. In import mode: **Send to board**, **Open in Editor**, **Close**.

### 4.4 What "send to board" does

1. Saves the plan as `docs/plans/<yyyy-mm-dd>-<slug>.md` (front matter: `puffin_plan_id`, `source_prompt_id`, `workspace`, `created`), or updates it in place when importing from `docs/plans/`. Plans imported from `~/.claude/plans/` are copied, never modified in place.
2. Creates a `plans` row and one task per included step, status *To Do*, `plan_step` = position, `depends_on` from the panel, `acceptance_criteria`, `skill`, `branch_id` = chosen workspace, `source_prompt_id` = the planning prompt.
3. Switches to the **Backlog** tab with the new plan's group expanded and a toast *Plan "…" added: 7 tasks.*

### 4.5 Implement a task

From a card's **Implement** button (also from the plan group header: *Implement next*), or from the Plan Review panel right after approval (*Send to board & implement first*).

Pre-conditions (button disabled with the reason otherwise): no Claude session running; the task is *To Do* (or *Doing* with `run_state = failed`, for a retry); every task it depends on is *Done*.

1. The card moves to **Doing**, `run_state = running`, and shows a spinner and the thread it is running in.
2. Puffin composes the prompt (§6) and submits it through the Prompt window as a **new thread** in the task's workspace, named after the task, so the run is recorded in history and visible in the Prompt tab. The Prompt window shows a **Task chip** (*Implementing: 3. Add plan repository*) above the editor while the run lasts; the user can watch, add a message to the same thread, or cancel (Cancel = `run_state = cancelled`, card stays in *Doing*).
3. When the session completes, Puffin runs the existing **Review Task** pass automatically (the same prompt Quick Code Review sends, scoped to the task's thread), unless the user turned *Auto-review* off in the plan group.
   - `<!-- REVIEW: PASS -->` → card moves to **Done**, `run_state = reviewed`, the card records `implemented_on` (files modified, from the activity tracker) and the review summary.
   - `<!-- REVIEW: ISSUES -->` → card stays in *Doing*, `run_state = needs-fix`, the card shows *Issues found* with the review excerpt and a **Fix** button (= the existing *Fix all issues* prompt in the same thread). After a fix, review runs again (max 2 fix rounds, then the card says *Needs a human*).
   - Session error / cancelled / max turns → `run_state = failed` with the reason; **Retry** re-runs with the same prompt plus *"Your previous attempt ended with: …"*.
4. A completed task's card links to its thread (*Open conversation*), its review, and the files it touched.

### 4.6 Run a plan

**Run plan** on the plan group header implements tasks in `plan_step` order, one session each, applying §4.5 to each: the next task starts only when the previous card reached *Done*. It stops at the first `needs-fix` / `failed` / blocked task and says why; **Continue** resumes from there. A progress line on the group header: *3 of 7 done · running: 4. Wire IPC*. Between tasks Puffin waits for the previous session to be fully closed (the single-process guard) — there is no overlap.

Each task gets its **own thread** (a clean session) by default; the plan group has an option *Continue in one thread* for plans whose steps depend on shared conversational context. Either way the plan markdown is included in every task prompt so context does not depend on the thread.

### 4.7 Manual and mixed use

- Tasks created by hand (the existing *Add Task*) get the same **Implement** button; without a plan the prompt is just the task and its acceptance criteria.
- A task can be dragged between columns as today; dragging a *running* card is refused; dragging a card out of *Done* resets `run_state`.
- Reordering tasks inside a plan group changes `plan_step`; a dependency that would point forward is refused with a message.
- **Re-plan** on a plan group opens the Prompt window in Plan mode with the plan and the board state (done / open tasks) prefilled as context: *"Here is the plan and what has been done; revise the remaining steps."* On approval, tasks not yet started are replaced; started/done tasks are kept and re-linked.

### 4.8 Skills in plans

- A step whose body begins with `/name …` (a skill invocation) is launched **as that prompt** rather than the generic implementation prompt; the task card shows a *skill* badge. Example: `/archlens how does the plan reach the board?` as a documentation step, or `/code-review` as an explicit review step.
- The plan template Puffin suggests to Claude (§6.1) tells it that steps may be skills and lists the skills the project has (`.claude/skills`, installed plugins) so plans use them deliberately.

---

## 5. Plan extraction rules

Applied to the `ExitPlanMode` plan text, to a reply treated as a plan, and to imported files. Deterministic, no model call; the review panel is where a human fixes what the rules got wrong.

1. **Title** — the first `#` heading; else the first line; else the prompt's first sentence.
2. **Steps** — in order of preference: the items of the first ordered list under a heading matching `/^(steps|plan|implementation|tasks|work)/i`; else every `##`/`###` heading after *Context* / *Background* / *Summary* sections, excluding *Verification*, *Testing*, *Risks*, *Open questions*, *Notes*; else the top-level ordered list of the document. A step's **body** is everything until the next step.
3. **Acceptance criteria** — checkbox items (`- [ ]`) inside the step; lines under a *Verify* / *Test* / *Done when* sub-heading inside the step; plus, for the whole plan, a *Verification* / *Testing* section is split by bullet and attached to the last step unless a bullet names a step (*"step 3: …"*, *"after adding the repository, …"* → fuzzy match on step titles).
4. **Dependencies** — phrases in a step body: *after step N*, *requires step N*, *depends on N*, *once … (title of an earlier step) …*. Anything else is left for the panel.
5. **Skill** — a body whose first non-empty line starts with `/` followed by a known skill name.
6. **Files** — backticked paths in the body (`src/main/x.js`) are kept as *files mentioned* and shown on the card; not enforced.
7. A plan with **no extractable steps** opens the panel with a single step equal to the whole plan and a warning; the user can split it.

Puffin also suggests a plan shape to Claude (§6.1) so that extraction usually needs no manual fixing — but the rules must work on plans written without it (imports from `~/.claude/plans`).

---

## 6. Prompts

### 6.1 Planning prompt (Plan mode)

The user's text, followed by a Puffin-appended block:

```
## Plan format (Puffin)
End by calling ExitPlanMode with the plan. Structure it as:
- `# <title>`
- `## Context` — why, in a few sentences
- `## Steps` — an ordered list; each item is one independently implementable unit
  with a bold title, the files it touches in backticks, and `- [ ]` checkboxes for
  what must be true when it is done. Say "after step N" when an item depends on another.
  A step may be a skill invocation, written as `/skill-name arguments` on its first line.
  Available skills: <list>.
- `## Verification` — how to check the whole change end-to-end.
Keep steps small enough for one focused session each (a few files, one concern).
```

### 6.2 Implementation prompt (one task)

```
# Task <n> of <total> from plan "<title>": <task title>

## What to do
<step body>

## Done when
- <acceptance criterion>
- …

## Plan context
<the plan's Context section, and the titles of all steps with their status:
 ✓ done (with the files each touched), ▶ this one, · pending>

## Rules
- Implement only this task. Do not start the pending steps.
- Run the project's tests relevant to what you changed.
- Finish with a short summary: what changed, what you verified, anything the next step must know.
```

Plus Puffin's usual project context (coding preferences, workspace focus). For a **skill step** the prompt is the step's first line verbatim, followed by the *Done when* and *Plan context* sections.

### 6.3 Review and fix

Unchanged from Quick Code Review (`<!-- REVIEW: PASS -->` / `<!-- REVIEW: ISSUES -->` convention), scoped with *"Review the changes made for task <n>: <title>. Done when: …"* so the review checks the acceptance criteria, not only code quality.

---

## 7. Board changes

- **Plan groups.** In every column, cards that belong to a plan are grouped under a collapsible header *Plan: <title> · 3/7 done* with actions **Implement next**, **Run plan**, **Re-plan**, **Open plan** (Editor). A **Plans** filter lists plans; *Ungrouped* shows hand-made tasks.
- **Card.** Step number badge (`3/7`), dependency badge (*after 2*, red when the dependency is not done), skill badge, run-state badge (*running* spinner, *needs fix*, *failed*, *reviewed ✓*), thread link, files-touched count. Actions by state: *Implement* (To Do, unblocked), *Open conversation* / *Cancel* (running), *Fix* / *Mark done anyway* (needs-fix), *Retry* (failed), *Reopen* (Done).
- **Columns** keep their three states; `run_state` is a sub-state shown on the card, never a fourth column.
- **Blocked** tasks (dependency not done) render slightly dimmed in *To Do* with the reason on hover.

---

## 8. Rules and states

**Task `run_state`** (sub-state of the column):

```
idle ──Implement──▶ running ──session ok──▶ reviewing ──PASS──▶ reviewed (column: Done)
                      │                        │
                      │ error/cancel           └─ISSUES──▶ needs-fix ──Fix──▶ running (fix round +1)
                      ▼                                        │
                    failed ──Retry──▶ running                  └─ 2 rounds ──▶ needs-human
```

- Exactly one task can be `running` or `reviewing` at a time (Claude single-process guard). *Implement* buttons are disabled while any session runs, with *A session is running: <task or prompt>* as the reason.
- A task cannot be *Implemented* while a dependency is not *Done*; *Mark done anyway* on a dependency lifts the block.
- Closing Puffin during a run: on restart the card is `failed: Puffin closed` with *Retry*; the thread and any partial work remain.
- Deleting a plan deletes its *To Do* tasks and unlinks (keeps) *Doing* / *Done* tasks; the markdown file is left in `docs/plans/`.
- Plan mode sessions never write: if the CLI reports a write in plan mode (should not happen), Puffin flags the session in red and the plan is still offered for review.

---

## 9. Non-functional and edge cases

- The Plan Review panel opens within 1 s of `ExitPlanMode`; extraction handles plans up to ~200 steps.
- No model call is made by Puffin itself in this feature; every call is a user-launched Claude session (plan, implement, review, fix).
- Works with the `PUFFIN_AGENT_CMD` backend only if it supports `--permission-mode plan`; otherwise Plan mode falls back to a plain prompt with the §6.1 block and *Treat reply as plan* (the toggle says so).
- Import handles plans from other machines (no `puffin_plan_id`) and re-import of an already imported plan (offers *update tasks* vs *new plan*).
- Accessibility: the panel and card actions are keyboard reachable; run-state badges carry text, not only colour.
- **Phase 2 hook (Architecture tab):** when a task reaches *Done* in a project that has an arch-lens analysis, Puffin can run `archlens review --base <sha before the run>` and attach *components touched / boundary claims to re-check* to the card, with *Refresh architecture* as an action. Specified in `ARCHITECTURE_TAB_SPEC.md` §9; this spec only guarantees the task records the commit range of its run (`git rev-parse HEAD` before and after).

---

## 10. User stories and acceptance criteria

**US-1 Plan mode in the Prompt window**
As a developer, I want to ask Claude for a plan without it changing files, so that I can approve the approach before work starts.
- Given Plan is selected, when I submit, then the session runs with `--permission-mode plan` and no file in the project is modified.
- When Claude calls `ExitPlanMode`, then the Plan Review panel opens with the plan text within 1 s and the session waits.
- When I choose *Revise* with feedback, then the same session continues and the panel updates on the next plan.

**US-2 Plan review and approval**
As a developer, I want to see the tasks a plan will create and adjust them, so that the board reflects how I want the work cut.
- The panel lists every extracted step in order with include checkbox, acceptance criteria, dependencies and skill; I can reorder, merge, split, exclude.
- *Approve & send to board* creates exactly the included steps as *To Do* tasks in the chosen workspace, in order, and saves the plan under `docs/plans/`.
- *Discard* leaves no file and no task behind.

**US-3 Import a plan**
As a developer, I want to import a plan Claude wrote in the terminal, so that terminal planning also feeds the board.
- The import list shows `~/.claude/plans/*.md` and `docs/plans/*.md` with titles and dates; picking one opens the review panel; imported plans are copied into `docs/plans/`.

**US-4 Implement a task from the board**
As a developer, I want to launch the implementation of a task from its card, so that the plan drives the work.
- *Implement* is disabled while a session runs or a dependency is not done, and says why.
- Clicking it moves the card to *Doing*, starts a new thread named after the task in the task's workspace with the §6.2 prompt, and shows the task chip in the Prompt window.
- When the session ends, a Review Task pass runs; on PASS the card is *Done* with thread, files and review attached; on ISSUES the card shows the issues and *Fix*; after two failed fix rounds it says *Needs a human*.

**US-5 Run a plan**
As a developer, I want to run all remaining tasks of a plan in order, so that a well-cut plan executes without me clicking each card.
- Tasks run one at a time in `plan_step` order; the next starts only after the previous is *Done*.
- The run stops at the first failure / issues / blocked task with the reason; *Continue* resumes.
- Cancelling stops after the current session; the current card is *cancelled* and can be retried.

**US-6 Skills as steps**
As a developer, I want a plan step to invoke a skill, so that repeatable work (reviews, architecture updates) is part of the plan.
- A step starting with `/name` is launched as that prompt; the card shows a skill badge; the planning prompt lists the project's available skills.

**US-7 Traceability**
As a tech lead, I want every task to link to the plan, the planning conversation, the implementation thread, the review and the files touched, so that I can audit what was built and why.
- Each card exposes those links; the plan file's front matter carries the Puffin plan id and the source prompt id; the history tree shows plan and implementation threads under the workspace.

---

## 11. Technical notes (for the implementation plan)

- **Plan mode mechanics.** `claude-service.buildArgs` gains `permissionMode: 'plan'` (today it picks `acceptEdits` / `bypassPermissions`). In stream-json mode the `ExitPlanMode` tool call arrives as a `tool_use` block; with `--permission-prompts host` the approval is a permission request the host answers on stdin (the same channel Puffin already uses to answer `AskUserQuestion` with a `tool_result`). **To verify first:** the exact message shape for permission requests in `--print --input-format stream-json` on the installed CLI (2.1.x) — `control_request`/`control_response` vs `tool_result` — and whether `--permission-prompt-tool` is needed. Fallback if approval cannot be delivered headlessly: run plan sessions with `--disallowedTools ExitPlanMode`-free but treat the last assistant text as the plan (*Treat reply as plan* path), which needs no protocol support.
- **Storage.** New table `plans` (`id, title, file_path, workspace_id, source_prompt_id, status, created_at, approved_at`); `user_stories` gains `plan_id, plan_step, depends_on (JSON), skill, thread_id, run_state, run_meta (JSON: session ids, review excerpt, files, commit range, fix rounds)`. Migration `0xx_add_plans.js`; repositories extended. `docs/plans/` is the human-readable copy; the DB is the link table.
- **SAM.** New actions/acceptors: `openPlanReview`, `updatePlanDraft`, `approvePlan`, `implementTask`, `taskRunProgress`, `taskRunFinished`, `runPlan`, `stopPlanRun`; `state-persistence` whitelist entries for the new task fields (the whitelist must be extended in both places — see project memory).
- **Prompt window.** Segmented *Build | Plan* control in the option bar; task chip; Plan Review panel component (`components/plan-review/`); *Treat reply as plan* action on responses; import dialog. Implementation runs reuse `submitExternal(text, { newThread: true })` and the thread naming path; review reuses `_triggerCodeReview` / `_triggerFixAllIssues` with a task scope parameter.
- **Board.** `user-stories.js`: plan grouping, badges, actions; `Implement` calls the SAM action which the app handles (guards, prompt composition, submission). Run-plan is an app-level orchestrator kept deliberately small (a queue over the same per-task path), not a return of 3.x orchestration.
- **Skills list.** Read `.claude/skills/*/SKILL.md` names and installed plugin skills for the planning prompt; no execution by Puffin.
- **Tests.** Extraction rules (fixtures: a Puffin-shaped plan, a free-form `~/.claude/plans` file, a plan with no steps); run-state transitions; guards (running session, dependencies); prompt composition snapshots; migration; board rendering of groups/badges.

---

## 12. Open questions

1. **Headless approval protocol** (see §11) — the one thing to prototype before committing to the `ExitPlanMode` path. The *Treat reply as plan* fallback makes the feature viable either way.
2. Should a plan approved in Puffin also be written back to `~/.claude/plans/` so terminal sessions see it? Proposal: no; `docs/plans/` under git is the source of truth, and the terminal can be pointed at it.
3. Default for *Auto-review after implement*: on. Cost is one extra Sonnet/Haiku session per task; the model for review should be configurable (default the project's default model).
4. Whether *Run plan* should commit after each task (`git commit -m "<task title>"`) when the working tree was clean at start. Proposal: optional, off by default; when on, the card records the commit sha, which also gives Phase 2 its commit range for free.

---

## 13. Implementation notes (4.2.0)

- **No headless approval protocol.** In `--print` mode the CLI does not offer `ExitPlanMode`; the model writes the plan to `~/.claude/plans/<slug>.md` with the `Write` tool and ends its turn. Puffin therefore captures the plan from the session's file writes (the activity tracker) when the session completes, falling back to the reply text; *Revise* resumes the same thread in Plan mode. §4.1 step 3 ("the session stays alive, waiting") does not apply.
- **Subagents are disallowed in plan sessions** (`--disallowedTools Agent Task`) and the planning suffix says so: a headless session ends with its turn, so a background Explore agent never reports back (observed in testing).
- **Storage.** Migration `014_add_board_plans` (013 was taken by a 3.x branch on some machines); the table is `board_plans` because CRE's legacy `plans` table may still exist. Plan counts on the board are computed from the live tasks.
- **Runner.** `src/renderer/lib/task-runner.js` is the one implementation path; it waits for the CLI's single-process guard to clear before chaining review/fix/next sessions, and settles a tick after each intent because SAM applies them asynchronously. Auto-fix is off by default (the card shows *Fix*); `MAX_FIX_ROUNDS = 2`.
- **Settings** for auto-review / auto-fix are runner options and not yet exposed in the UI.
- **Verified live** on the Puffin repository: Plan mode → plan captured and extracted (2 steps, criteria, files) → approved to the board → *Run plan* implemented both tasks with a review pass each, in titled threads, in about seven minutes; import chooser and *As plan* also exercised.
