# Puffin 4.0 — Functional Specification

**Version:** 0.1 (draft)  
**Date:** 2026-04-11  
**Status:** Proposal — Specifications Branch  

---

## 1. Vision

Puffin 4.0 applies the lessons of production agent harness design to become a **leaner, more transparent orchestration layer** between the developer and Claude Code. The guiding insight from modern harness research: *the right amount of harness is the minimum that produces the desired behavior — and that amount decreases as models improve.*

Three pillars drive 4.0:

1. **Thin Harness** — Remove infrastructure that no longer earns its complexity. Trust the model to do what models now do well.
2. **Code Review as a First-Class Discipline** — Systematic, multi-stage review becomes the primary quality gate, not an afterthought bolted onto sprint close.
3. **Workflow Clarity** — Rethink the UX from first principles around the mental model of a developer's actual workday.

---

## 2. What Gets Removed

### 2.1 h-DSL Engine

**Current state:** A full code-model pipeline (DISCOVER → DERIVE → POPULATE → EMIT → ANNOTATE) that builds a typed instance graph and exposes 9 MCP tools (`hdsl_*`) to Claude for codebase navigation.

**Why it should go:**  
The article's core finding is that "Vercel removed 80% of tools from v0 and got better results." The h-DSL engine was built when models couldn't reliably navigate codebases on their own. Modern Claude can read, grep, and explore with native tools at least as well — without the maintenance overhead of a schema pipeline, an MCP server process, and the silent failure modes documented in the Gotchas log (e.g., "assertion generation explores codebase instead of answering").

The `disableTools: true` workaround applied to assertion generation is a signal: the engine was actively getting in the way.

**Replacement:** Claude's native file tools (Read, Grep, Glob, Bash) serve as the code model. Context management strategy (see §5) ensures relevant files reach the model without pre-computing a graph.

**Consequence:** `h-dsl-engine/`, `hdsl-tool-server.js`, all `mcp__hdsl__*` references, and the `cre:update-model` / `cre:query-model` IPC channels are decommissioned.

### 2.2 RIS (Requirement Impact Summary) Generation

**Current state:** A separate AI-generation step between plan approval and assertion generation, intended to map stories to impacted code regions.

**Why it should go:** With h-DSL gone, RIS has no structured code model to reference. The three-step CRE flow (approve → RIS → assertions) collapses to two (approve → assertions), simplifying the orchestration and eliminating the "RIS button disappears on restart" class of bugs.

**Replacement:** Assertion generation prompts will include enough story + plan context for Claude to reason about impact directly.

### 2.3 Vibe Service

**Current state:** `vibe-service.js` — ambient mood/status feature.

**Why it should go:** Low utility relative to complexity. Removes one more IPC surface and one more service to keep synchronized with model/state changes.

### 2.4 Metrics Service

**Current state:** Batched SQLite writes tracking token counts, costs, durations per component.

**Decision point (not a firm removal):** The metrics service is useful for understanding cost and debugging. However, its 17-column schema and per-component instrumentation adds significant coupling. 4.0 should either:
- Slim it to 3 columns (timestamp, operation, cost_usd) with a JSON blob for everything else, or  
- Remove it and instrument via Claude Code's own usage reporting

This is deferred to implementation planning.

---

## 3. What Gets Restructured: CRE → Review Engine

The Central Reasoning Engine is renamed and refocused. In 4.0 it becomes the **Review Engine (RE)** — responsible solely for code quality assessment, not for planning.

### 3.1 Separation of Concerns

| Concern | 3.x Owner | 4.0 Owner |
|---|---|---|
| Sprint planning | CRE (plan-generator) | Claude Code directly (no intermediary) |
| Assertion generation | CRE (assertion-generator) | RE |
| Assertion evaluation | CRE (verify-assertions) | RE |
| Code model queries | CRE + h-DSL | Removed |
| RIS generation | CRE (ris-generator) | Removed |

Planning in 4.0 is a direct prompt-and-response conversation with Claude, not a structured generation pipeline. The plan artifact is a markdown document, not a JSON schema.

### 3.2 Review Engine Responsibilities

The RE owns one well-defined pipeline:

```
Story (completed) → Assertion Generation → Assertion Evaluation → Review Report
```

Each stage is explicit, auditable, and independently retryable.

**Stage 1 — Assertion Generation**
- Input: story description + acceptance criteria + git diff since story was started
- Output: typed assertion set (FILE_EXISTS, FUNCTION_SIGNATURE, PATTERN_MATCH, TEST_PASSES, CUSTOM)
- Claude is given the diff and story context; no pre-computed code model
- `disableTools: true` (confirmed effective, carries forward)

**Stage 2 — Assertion Evaluation**
- Each assertion runs against the current working tree
- Results: PASS / FAIL / SKIP / ERROR with evidence snippet
- Deterministic assertions (FILE_EXISTS, PATTERN_MATCH) run locally; CUSTOM assertions optionally delegate to Claude

**Stage 3 — Review Report**
- LLM-as-judge pass: Claude receives the diff + assertion results + story criteria
- Produces: summary, risk level (LOW / MEDIUM / HIGH), blocking issues, suggestions
- This is the "verification loop" that the article identifies as a 2–3x quality multiplier

### 3.3 Review Triggers

Code review is triggered at three points, not just at sprint close:

| Trigger | Scope | Blocking? |
|---|---|---|
| Story completion | Single story | No (advisory) |
| Sprint close | All sprint stories | Yes (must acknowledge) |
| Manual request | Any story, any time | No |

This makes code review a continuous discipline rather than a sprint-end ceremony.

---

## 4. Sprint & Backlog: Simplified Workflow

### 4.1 Current Pain Points (UX)

Based on the accumulated Gotchas and the stated complaint that "it's hard to use," the following friction points are identified:

1. **Too many modals** — Sprint close, code review confirmation, commit, plan approval, RIS status, assertion status — each as a separate modal interruption
2. **Opaque state** — Users cannot tell what phase a story is in without opening a modal
3. **Silent failures** — Many bugs in the Gotchas log involve data not appearing because a background step silently failed
4. **Parallel paths** — Two assertion generation paths (CRE and non-CRE), two persistence paths (state-persistence chain and direct DB write), producing subtle inconsistencies
5. **Sprint-centric tunnel vision** — The UI focuses on the active sprint; the backlog, history, and code review artifacts are buried

### 4.2 Workflow Model for 4.0

The 4.0 workflow replaces the sprint-centric model with a **story-centric model**. Stories are the primary unit; sprints are groupings, not gates.

**Story lifecycle:**

```
DRAFT → READY → IN PROGRESS → REVIEW → DONE → ARCHIVED
```

- **DRAFT**: Story exists, acceptance criteria incomplete
- **READY**: Story has criteria, is ready for implementation
- **IN PROGRESS**: Claude is actively implementing
- **REVIEW**: Implementation complete, Review Engine running or has run
- **DONE**: Review acknowledged (pass or waived), story closed
- **ARCHIVED**: Historical record

Sprint is a lightweight label applied to a set of stories. Sprint "close" is replaced by a **sprint summary** that aggregates already-completed story reviews — it no longer blocks on generating them.

### 4.3 Collapsed Modal Surfaces

| 3.x Modal | 4.0 Replacement |
|---|---|
| Plan approval modal | Inline plan panel within story view |
| RIS status modal | Removed (RIS removed) |
| Assertion status during CRE | Progress indicator in story card |
| Code review confirmation modal | Story review panel (persistent, not a dialog) |
| Sprint close modal | Sprint summary view (navigable, not blocking) |
| Commit modal | Preserved (git is a natural interruption point) |

The principle: **modals are for decisions, not information**. If the user only needs to see something, it belongs in a panel.

---

## 5. Context Management Strategy

The article identifies context management as "where many agents fail silently." Puffin 4.0 adopts an explicit strategy aligned with production harness patterns.

### 5.1 Context Tiers

| Tier | What Goes Here | Mechanism |
|---|---|---|
| Always-loaded | Project overview, active story, acceptance criteria | CLAUDE.md + memory files |
| On-demand | Git diff for active story, referenced source files | Just-in-time via Read/Grep |
| Excluded | Full file tree, historical conversation, h-DSL instance graph | Not loaded |

### 5.2 Prompt Assembly Order

Following the priority stack pattern from production harnesses:

1. System prompt (Puffin's role, project context from CLAUDE.md)
2. Active story context (description, criteria, current status)
3. Relevant memory files (pulled by topic match)
4. Conversation history (summarized if approaching limit)
5. Current user message

### 5.3 Subagent Summaries

When Review Engine stages complete, they return compact summaries (target: <500 tokens) rather than raw outputs. The full assertion set and diff live in the DB; the summary enters the conversation context.

---

## 6. Memory Architecture (Carry Forward from 3.x)

Memory 2.0 (native `~/.claude/.../memory/` system) is retained and extended. The lean CLAUDE.md pattern is preserved.

### 6.1 New Memory Categories for 4.0

| Category | Content |
|---|---|
| `review-patterns.md` | Recurring issues found across code reviews — feeds future assertion generation |
| `story-templates.md` | Effective acceptance criteria formats for this project |
| `risk-register.md` | Known risky areas of the codebase flagged by past reviews |

### 6.2 Auto-Population

After each Review Engine run:
- HIGH-risk findings are summarized and appended to `risk-register.md`
- Recurring assertion failures (same pattern, multiple stories) are noted in `review-patterns.md`

This implements the "long-term memory" tier described in the article: knowledge that persists across sessions and improves future runs.

---

## 7. UX Design Principles for 4.0

### 7.1 Primary Layout: Three Panels, Not Modals

```
┌─────────────────┬──────────────────────────┬──────────────────┐
│  Story List     │   Active Story           │   Activity       │
│  (backlog +     │   - Description          │   - Claude       │
│   sprint)       │   - Criteria             │     conversation │
│                 │   - Plan (inline)        │   - Review       │
│  Status badges  │   - Review results       │     timeline     │
│  on each card   │   - Git diff             │                  │
└─────────────────┴──────────────────────────┴──────────────────┘
```

- Left panel: story navigation with inline status
- Center panel: the selected story's full lifecycle view
- Right panel: the running conversation and review activity

### 7.2 Progressive Disclosure

Each story card shows: title + status badge + risk indicator.  
Expanding a card shows: criteria + plan + assertion summary.  
Clicking "Review" shows: full assertion results + LLM judge report + diff.

No modals for any of the above.

### 7.3 Status Transparency

Every background operation (plan generation, assertion generation, evaluation) is visible as a progress state on the story card. No operation should complete or fail silently.

Status model for a story card:

```
[IN PROGRESS]  → [REVIEW: generating assertions...]  
              → [REVIEW: evaluating (3/7)...]  
              → [REVIEW: LOW RISK ✓]  
              → [DONE]
```

### 7.4 Keyboard-First Navigation

Given the developer audience, 4.0 should support keyboard navigation for common flows:
- `n` / `p` to move between stories
- `Enter` to open active story
- `r` to trigger review on current story
- `c` to open commit dialog
- `?` for help overlay

---

## 8. Harness Architecture for 4.0

Mapping Puffin's components to the 12-component harness model from the article:

| Harness Component | Puffin 4.0 Implementation |
|---|---|
| Orchestration Loop | `claude-service.js` (unchanged interface) |
| Tools | Native Claude tools only (no MCP servers) |
| Memory | Native `~/.claude/.../memory/` + CLAUDE.md |
| Context Management | Explicit tier strategy (§5); compaction on limit |
| Prompt Construction | Hierarchical assembly per §5.2 |
| Output Parsing | Native tool_calls; structured JSON for RE outputs |
| State Management | SAM pattern + SQLite (unchanged) |
| Error Handling | All RE stages return errors as observable story state |
| Guardrails | Preserved from 3.x; no regression |
| Verification Loops | Review Engine is the primary loop |
| Subagent Orchestration | Worktree-based (preserved) |
| *(removed)* | h-DSL MCP server, metrics instrumentation per-component |

**Design test (from article):** "If performance scales up with more powerful models without adding harness complexity, the design is sound." — The 4.0 harness should require zero changes when Claude 4.7 ships.

---

## 9. Feature Inventory

### 9.1 Features Carried Forward (unchanged)
- SAM pattern state management
- SQLite persistence
- Git integration (commit, branch, worktree support)
- Sprint grouping (lightweight labels)
- Claude conversation streaming
- Preload IPC bridge pattern

### 9.2 Features Carried Forward (simplified)
- CRE → Review Engine (scope narrowed, RIS removed)
- Modal system (fewer modals, same routing pattern)
- Memory system (extended with new categories)
- Metrics (slimmed schema or removed — TBD)

### 9.3 Features Removed
- h-DSL engine and all MCP tool infrastructure
- RIS generation
- Vibe service
- `cre:update-model`, `cre:query-model` IPC channels

### 9.4 Features Added (new in 4.0)
- Three-panel layout (replaces modal-heavy flow)
- Story-centric lifecycle (DRAFT → ARCHIVED)
- Continuous review triggers (per-story, not only sprint-close)
- LLM-as-judge review report (risk level + blocking issues)
- Auto-populated risk register and review patterns memory
- Keyboard navigation
- Progress visibility on story cards (no silent background ops)

---

## 10. User Stories

### US-001: Story-Centric View
**As a developer**, I want to see all my stories in a persistent left panel with status badges, **so that** I always know what is in progress and what needs attention without opening a modal.

**Acceptance Criteria:**
- [ ] Left panel lists all stories across active sprint and backlog
- [ ] Each card shows: title, status badge, risk indicator (if reviewed)
- [ ] Clicking a card opens it in the center panel without a modal
- [ ] Status badges update in real time as background operations complete

---

### US-002: Inline Plan
**As a developer**, I want to see the implementation plan for a story inside the story view, **so that** I don't need to open a separate plan approval modal.

**Acceptance Criteria:**
- [ ] Plan appears as an expandable section within the center story panel
- [ ] Plan can be approved or edited inline
- [ ] Approval triggers assertion generation with a visible progress indicator
- [ ] No standalone plan approval modal

---

### US-003: Continuous Code Review
**As a developer**, I want a code review to run automatically when I mark a story as complete, **so that** I get quality feedback immediately rather than waiting for sprint close.

**Acceptance Criteria:**
- [ ] Marking a story done triggers the Review Engine pipeline
- [ ] Story card shows progress through assertion generation → evaluation → judge report
- [ ] Review report shows: risk level, assertion pass/fail counts, blocking issues
- [ ] Review does not block story completion — it is advisory unless sprint close is attempted with HIGH-risk open items
- [ ] Review can be manually re-triggered at any time

---

### US-004: LLM Judge Review Report
**As a developer**, I want the code review to include an AI-generated assessment of the diff against acceptance criteria, **so that** I catch semantic issues that deterministic assertions miss.

**Acceptance Criteria:**
- [ ] Review Engine stage 3 sends: diff + assertion results + story criteria to Claude
- [ ] Output includes: summary paragraph, risk level (LOW/MEDIUM/HIGH), list of blocking issues, list of suggestions
- [ ] Report is stored in DB and viewable from the story view at any time
- [ ] Report token usage is bounded (max 8K context per review)

---

### US-005: Review Patterns Memory
**As a developer**, I want the system to learn from past code reviews across stories, **so that** assertion generation improves over time for this project.

**Acceptance Criteria:**
- [ ] After each review with HIGH risk items, findings are summarized into `risk-register.md`
- [ ] Assertion generation prompts include the current `risk-register.md` content
- [ ] Memory files can be viewed and edited from within Puffin
- [ ] No PII or session-specific content is written to memory files

---

### US-006: Silent Failure Elimination
**As a developer**, I want every background operation to have a visible status on the story card, **so that** I know immediately if something went wrong without needing to open a modal or check logs.

**Acceptance Criteria:**
- [ ] Each background operation (plan gen, assertion gen, evaluation, judge) has a named phase displayed on the story card
- [ ] Errors surface as an ERROR badge with a one-line message on the card
- [ ] Errors are retryable from the card (no need to restart sprint or story)
- [ ] No operation completes with a success state when it produced an empty result

---

### US-007: Remove h-DSL Dependency
**As a developer**, I want Puffin to start and operate correctly without the h-DSL MCP server running, **so that** setup is simpler and the system has fewer silent failure modes.

**Acceptance Criteria:**
- [ ] `h-dsl-engine/` is not required for any Puffin 4.0 operation
- [ ] No `hdsl_*` MCP tools are registered or invoked
- [ ] Assertion generation and code review function without a pre-computed code model
- [ ] Startup time decreases by at least 2 seconds (h-DSL server process elimination)

---

### US-008: Sprint Summary (Non-Blocking)
**As a developer**, I want to view a sprint summary that aggregates already-completed story reviews, **so that** closing a sprint is a lightweight archival action rather than a blocking ceremony.

**Acceptance Criteria:**
- [ ] Sprint summary is a navigable view, not a modal
- [ ] Summary shows: completed stories, each with its risk level and review status
- [ ] Sprint can be archived if all stories are in DONE or ARCHIVED state
- [ ] HIGH-risk stories with unacknowledged blocking issues require explicit acknowledgment before archive (not before completion)
- [ ] Sprint archive does not trigger new AI generation

---

### US-009: Keyboard Navigation
**As a developer**, I want to navigate stories and trigger common actions via keyboard shortcuts, **so that** I can operate Puffin without switching between keyboard and mouse.

**Acceptance Criteria:**
- [ ] `↑`/`↓` or `j`/`k` navigate the story list
- [ ] `Enter` opens the selected story in the center panel
- [ ] `r` triggers review on the current story
- [ ] `c` opens the commit dialog
- [ ] `?` shows a keyboard shortcut overlay
- [ ] All shortcuts are visible in the help overlay and configurable

---

### US-010: Single Assertion Persistence Path
**As a developer** (internal quality), I want assertions to be persisted through exactly one code path, **so that** the TWO-place assertion storage bug class cannot recur.

**Acceptance Criteria:**
- [ ] Assertions are stored in exactly one location: `user_stories.inspection_assertions` JSON column
- [ ] The `inspection_assertions` table is removed (or used as a write-through cache with the JSON column as source of truth)
- [ ] All reads of assertions go through one function
- [ ] No `syncAssertionsFromCreTable` reconciliation step exists in 4.0

---

## 11. Out of Scope for 4.0

The following are explicitly deferred:

- Multi-model support (non-Claude backends)
- Team/collaboration features (multi-user)
- CI/CD integration (running reviews in pipelines)
- Plugin marketplace
- Mobile or web-only interface

---

## 12. Open Questions

1. **Metrics service**: slim schema or remove? What decisions does metrics data actually inform today?
2. **Plan format**: structured JSON plan (3.x) vs. markdown narrative — which produces better Claude implementation behavior?
3. **Review blocking threshold**: should HIGH-risk findings block sprint archive, or only require acknowledgment?
4. **Three-panel layout**: does this work for smaller screens? What is the minimum supported window size?
5. **Assertion catalog**: with h-DSL gone, should CUSTOM assertions call a separate Claude process, or should all assertions be deterministic (FILE_EXISTS, PATTERN_MATCH, TEST_PASSES only)?

---

*End of Puffin 4.0 Functional Specification v0.1*
