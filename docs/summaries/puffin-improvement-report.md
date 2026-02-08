# Puffin Improvement Report

## Part 1: Missing Features Assessment

Puffin is remarkably complete for its mission. After auditing all 7 views, 170+ IPC handlers, 22 modal types, the plugin system, CRE, sprint orchestration, and Git integration, I found **no critical missing features**. The core loop (configure → plan stories → sprint → implement → review → commit) is fully covered.

However, there are a few **capability gaps** that surface during extended use:

### 1.1 No Theme Selector in the UI
Four themes exist in `themes.css` (Dark, Light, Puffin, High Contrast) but there's no UI to switch between them. The `data-theme` attribute is never set from the renderer. This is a polish gap—the infrastructure is built, the UI isn't.

### 1.2 No Cost Dashboard
Thread stats show per-thread cost, but there's no aggregate view. Over time, users lose track of total spend. A simple cost summary (per sprint, per day, running total) would add accountability. The data already exists in prompt history.

### 1.3 No Story Dependency Tracking
Stories can't express "blocked by" relationships. During sprint planning with 4 stories, implementation order matters but depends on CRE to figure it out with no input from the user. A lightweight dependency graph (story A blocks story B) would improve planning accuracy.

### 1.4 No Notification/Alert History
Toasts appear and vanish. The `toast-history.json` exists but there's no UI to review past notifications. During automated sprints, important warnings may be missed while the user is away.

---

## Part 2: Automated Sprint Process Improvements

The orchestration loop is solid—process lock, stuck detection, auto-continue with [Complete] keyword, max 5 continuations, max 40 turns. Here are refinements:

### 2.1 No Visibility into "Why" a Story Completed
The orchestration marks a story complete when it sees `[Complete]` or after 5 continuations. But it doesn't capture *what was accomplished*. The completion event (`ORCHESTRATION_STORY_COMPLETED`) stores only `storyId` and `sessionId`.

**Suggestion:** Capture a completion summary—files modified, tests passing/failing, acceptance criteria matched—and display it on the sprint panel card. This turns the sprint review from "it says complete" to "here's what was done."

### 2.2 Stuck Detection is Coarse
The current system hashes entire outputs and compares. Three identical hashes triggers the alert. Problems:
- Hash-based comparison misses *near-identical* outputs (same error, different timestamps)
- Threshold of 3 is fixed—no way to tune it
- User options (Continue / Modify / Stop / Dismiss) don't carry context into the next prompt

**Suggestion:** Add a "stuck reason" summary alongside the hash. When the user selects "Modify Approach," auto-populate the prompt with the stuck summary as context. Consider making the threshold configurable in settings.

### 2.3 No Sprint Pause/Resume Persistence
If Puffin closes during an automated sprint, the orchestration state is lost. Sprint status resets from `planning` to `created` on restart (known gotcha in MEMORY.md). But for `implementing` status, the orchestration object (which tracks `completedStories`, `currentStoryId`, `storyOrder`) lives only in renderer memory.

**Suggestion:** Persist the orchestration object alongside the sprint in SQLite. On restart, detect an interrupted sprint and offer to resume from the last completed story.

### 2.4 No Per-Story Time Tracking
`currentStoryStartedAt` is set but never persisted or displayed. Sprint history doesn't record how long each story took to implement.

**Suggestion:** Track start/end timestamps per story. Display them in the sprint close modal and sprint history tiles. This data is invaluable for estimating future sprints.

### 2.5 No Assertion Evaluation Post-Implementation
The CRE generates inspection assertions during planning, but there's no automatic trigger to *evaluate* them after a story's `[Complete]`. The user must manually go to the backlog and click evaluate.

**Suggestion:** Auto-evaluate assertions when a story completes in the orchestration loop. Show pass/fail count on the sprint panel card. If assertions fail, offer the user a choice: continue to next story, or fix failures first.

### 2.6 Code Review Phase is Underdeveloped
The `transitionToCodeReview()` function exists but the code review workflow is minimal. After all stories complete, it creates a review prompt but doesn't structure the review around specific acceptance criteria or assertion results.

**Suggestion:** Feed assertion results into the code review prompt. Structure the review as "verify these specific claims" rather than "review everything."

---

## Part 3: UX Improvements

This is the meatiest section. The underlying architecture is solid (SAM, CSS custom properties, component system), but the visual coherence and interaction design need a unification pass.

### 3.1 Information Architecture: Too Many Tabs, Unclear Hierarchy

**Problem:** The header nav has 5-7 tabs (Config, Prompt, Backlog, CLI Output, Git, Debug, plus plugin tabs). These represent different *levels* of concern:
- **Primary workflow:** Prompt (where you spend 80% of time)
- **Supporting:** Backlog, Git (frequent but secondary)
- **Configuration:** Config (rarely changed)
- **Diagnostic:** CLI Output, Debug (developer tools)

Mixing all of these at the same level creates a flat, disorienting navigation.

**Suggestion:** Group into tiers:
- **Primary:** Prompt and Backlog stay as main tabs
- **Secondary:** Git moves to sidebar (it already has branch display in header-right)
- **Settings:** Config becomes a settings panel (gear icon → slide-out or modal)
- **Developer Tools:** CLI Output and Debug merge into a bottom panel (like Chrome DevTools) that slides up when needed, rather than being full-view tabs

### 3.2 The Prompt View is Overloaded

**Problem:** The prompt view's tri-column swimlane layout tries to do too much simultaneously:
- **Left:** Sprint context (stories, progress, orchestration controls, completion summary, code review panel)
- **Middle:** Branch tabs, response viewer, prompt input, model/thinking options, iteration counter, include GUI/Docs dropdowns
- **Right:** Thread stats, incoming handoff, handoff generation, branch buttons

This creates cognitive overload. When there's no active sprint, the left panel is mostly empty ("No active sprint"). The right panel's handoff section is only relevant when handing off between branches.

**Suggestion:**
- **Left panel:** Contextual. Show sprint context when a sprint is active. When no sprint, show a quick-start: recent threads, pinned stories, or a "Start Sprint" prompt. Never show an empty state.
- **Middle:** Clean up the prompt options. The model selector, thinking budget, and derive-stories checkbox could live in a collapsible "Advanced" section below the textarea. Keep the primary interaction to: type prompt, click send.
- **Right panel:** Make it collapsible/hidden by default. Thread stats and handoffs are reference information, not primary workflow.

### 3.3 The Prompt Actions Row is Cluttered

**Problem:** Below the prompt textarea, you have: "Create New Thread" | "Cancel" | "Send" | "Include GUI" dropdown | "Include Docs" dropdown. Five buttons in a row, some contextually hidden. The Include buttons have dropdown menus that open dynamically.

**Suggestion:**
- "Send" should be the only primary (filled) button. Everything else is secondary or an icon.
- "Create New Thread" could be a keyboard shortcut hint (Ctrl+N) or a smaller link, not a full button competing for attention with Send.
- "Include GUI" and "Include Docs" could be attachment icons (paperclip metaphor) in the textarea itself, like how chat apps handle attachments.
- Model and Thinking Budget selectors could be small chips/pills inside or adjacent to the textarea, not full `<select>` elements.

### 3.4 Inconsistent Panel Layouts Across Views

**Problem:** Each view has a different layout pattern:
- Prompt: 3-column swimlane
- Backlog: 3-column with left sidebar + main + reserved (empty) right panel
- CLI Output: Full-width with header/body/footer
- Git: Full-width dynamically rendered
- Config: Full-width scrolling form
- Debug: Full-width with header + content

The backlog view even has a "Reserved Panel" placeholder for the right column that's permanently empty. The inconsistency makes the app feel like separate tools glued together.

**Suggestion:** Establish 2-3 canonical layout patterns and reuse them:
- **Primary layout:** Left sidebar (collapsible) + Main content
- **Dashboard layout:** Cards/tiles grid for overview screens
- **Editor layout:** Content area + properties panel (right)

### 3.5 Sprint Lifecycle Visibility is Fragmented

**Problem:** Sprint-related information is scattered across multiple views:
- Sprint context panel → Prompt view (left swimlane)
- Sprint history → Backlog view (left panel)
- Sprint stories → Backlog view (main area)
- Sprint close modal → Modal overlay
- Sprint assertion results → Backlog view (per-story)
- Sprint stats → Not collected at sprint level

There's no single place to see "what's my current sprint's overall status?"

**Suggestion:** Create a Sprint Dashboard as the default content of the left panel when a sprint is active. It would show:
- Overall progress bar (existing)
- Stories with status indicators (existing, but enhance with assertion results)
- Time elapsed, estimated cost
- A mini-timeline of events (planning → approved → story 1 started → story 1 complete → ...)
- Orchestration controls moved here from the middle column

### 3.6 Sidebar Branches + Branch Tabs Are Redundant

**Problem:** The sidebar has a "Branches" section with clickable branch items. The prompt view's middle column also has branch tabs (Specifications, Architecture, UI, Backend, Deployment, Tmp). Both control the same thing—which branch is active. Having two controls for the same state is confusing.

**Suggestion:** Remove the branch tabs from the middle column. The sidebar branches are the canonical control. Use the freed space for the response area. If the sidebar is collapsed, show a small branch indicator/dropdown at the top of the middle column instead of full tabs.

### 3.7 Modal Overuse

**Problem:** 22 modal types is a lot. Modals interrupt flow. Key workflows that currently use modals:
- Sprint close → modal (captures title, description)
- Plan review → modal (shows plan text)
- Story detail → modal
- Add/edit story → modal
- Implementation mode selection → modal
- RIS viewer → modal
- Claude question → modal

Some of these work well as modals (alert, claude-question). Others (plan review, story detail, RIS) would be better as slide-out panels or inline expansions that don't block the rest of the UI.

**Suggestion:** Reserve modals for actions requiring user decisions (confirm/cancel). For content viewing (plan review, RIS, story detail, sprint stories), use a drawer/panel pattern that slides in from the right and can be dismissed without losing context.

### 3.8 Visual Design Polish

**Problem:** Several small visual issues that compound:
- Emoji-based icons (☰, 🔍, ✨, 🔌, ↻) mix with SVG icons (sprint history refresh). Inconsistent iconography.
- The `header.jpg` splash screen feels disconnected from the application's dark theme
- Form elements in Config view use default browser styling in some places
- Color palette in themes is good but some components have hardcoded colors

**Suggestion:**
- Adopt a single icon system (SVG sprite or a lightweight icon font like Lucide/Tabler). Replace all emoji icons.
- Audit components.css for hardcoded colors and replace with CSS custom properties.
- Add subtle transitions for view switches (crossfade rather than instant swap).

### 3.9 The Config View is a Mega-Form

**Problem:** Config is one long scrolling form with 7 fieldsets: project basics, Claude guidance, coding standards, UX style guidelines, developer settings, CRE settings, plugins. It's overwhelming and rarely needs to be changed in full.

**Suggestion:** Break into sections with a left-side settings navigation (like VS Code settings or Electron Fiddle):
- General (name, description, assumptions)
- Claude (model, style, testing, docs, naming)
- Coding Standards
- UX Guidelines
- CRE Settings
- Plugins
- Developer/Debug

Each section loads independently. The user sees one section at a time. Saves can be per-section or auto-save on blur.

### 3.10 Thread Tree Needs Better Wayfinding

**Problem:** The sidebar thread tree shows a flat hierarchy of threads by branch. With many threads, it's hard to find the one you want. The search helps but there's no other organization—no timestamps, no last-activity indicator, no thread status.

**Suggestion:**
- Show last activity time next to each thread (e.g., "2h ago")
- Visual indicator for threads with unread/new responses
- Group threads by date or sprint
- Allow pinning important threads to the top

---

## Summary: Prioritized Action Items

### Quick Wins (Low effort, high polish impact)
1. Add theme selector to Config or header
2. Replace emoji icons with consistent SVG icons
3. Make right metadata panel collapsible/hidden by default
4. Remove empty "Reserved Panel" from backlog view
5. Add last-activity timestamps to thread tree

### Medium Effort (Significant UX improvement)
6. Collapse prompt options into "Advanced" section
7. Turn Config into sectioned settings panel
8. Add sprint dashboard to left panel (consolidate sprint info)
9. Remove redundant branch tabs from prompt view middle column
10. Replace content-viewing modals with slide-out drawers
11. Auto-evaluate assertions on story completion in orchestration

### Larger Initiatives (Architectural UX changes)
12. Merge CLI Output + Debug into bottom DevTools panel
13. Persist orchestration state for sprint pause/resume across restarts
14. Add completion summaries to story cards in sprint
15. Track per-story timing and aggregate cost dashboard
16. Add story dependency tracking to backlog
