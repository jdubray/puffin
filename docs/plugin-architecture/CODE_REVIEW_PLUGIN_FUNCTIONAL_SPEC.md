# Code Review Plugin — Functional Specification

**Version:** 1.0.0  
**Date:** 2026-04-23  
**Status:** Approved for implementation

---

## 1. Purpose

The Code Review Plugin provides a self-contained GUI for managing and running Puffin's nightly static-analysis code reviews. It replaces the manual process of invoking individual review services and reading raw markdown output with a structured workflow: define → run → triage → fix.

---

## 2. Layout

The plugin occupies a full-width nav tab labelled **"Code Review"**. It is divided into two panels:

```
┌────────────────────────┬─────────────────────────────────────────┐
│  LEFT PANEL            │  CENTER PANEL                           │
│  Story List            │  Dynamic — context-sensitive view       │
│  (fixed width ~320px)  │  (fills remaining width)                │
│                        │                                         │
│  [☐ Select All]       │  (default: placeholder / last review)   │
│  [▶ Start Code Review] │                                         │
│  ────────────────────  │                                         │
│  ☐ Story 1 Title       │                                         │
│    [Edit][RIS][Assert] │                                         │
│    [Review]            │                                         │
│  ────────────────────  │                                         │
│  ☐ Story 2 Title       │                                         │
│    [Edit][RIS][Assert] │                                         │
│    [Review] (disabled) │                                         │
│  ────────────────────  │                                         │
│  [+ New Story]         │                                         │
└────────────────────────┴─────────────────────────────────────────┘
```

---

## 3. Left Panel — Story List

### 3.1 Header controls

| Control | Behaviour |
|---------|-----------|
| **[☐ Select All]** | Toggles all checkboxes on/off. Label changes to "[☑ Deselect All]" when all selected. |
| **[▶ Start Code Review]** | Disabled until ≥ 1 story is checked. Triggers a review run for all checked stories. Becomes **[⏸ Running…]** with a spinner while running; reverts on completion. |

### 3.2 Story row

Each story row contains:

- **Checkbox** — include/exclude from the next run
- **Title** — story title, truncated with ellipsis if too long; hovering shows full title in tooltip
- **Status badge** — `pending` / `running` / `complete` / `error`
- **Four action buttons:**
  - **[Edit]** — open story title + acceptance criteria editor in center panel
  - **[RIS]** — open RIS editor in center panel
  - **[Assert]** — open assertion list editor in center panel
  - **[Review]** — disabled (greyed) until a review has been run for this story; when enabled opens the latest review document in center panel
- **[Delete]** (icon button, far right) — confirmation dialog before deleting

### 3.3 Add story

**[+ New Story]** button at the bottom of the list. Opens the story editor in center panel pre-populated with a blank template.

---

## 4. Center Panel — Modes

The center panel switches between four modes depending on which button was clicked.

### 4.1 Story Editor (Edit mode)

Fields:
- **Title** (text input)
- **Description** (textarea — "As a developer, I want … so that …")
- **Acceptance Criteria** (textarea — one criterion per line, prefixed with `- `)

Toolbar:
- **[Save]** — saves immediately; then triggers AI regeneration pipeline:
  1. Regenerate acceptance criteria from description + current AC (AI refines, does not blank it)
  2. Regenerate RIS from title + refined AC
  3. Regenerate implementation assertions from RIS + AC
  - Progress shown inline: `Refining AC… → Generating RIS… → Generating Assertions…`
- **[Cancel]** — discards unsaved changes, returns center panel to neutral state

### 4.2 RIS Editor

Displays the RIS (Requirements Implementation Specification) as an editable markdown textarea.

Toolbar:
- **[Regenerate]** — re-runs AI RIS generation from current story title + AC, overwrites content
- **[Save]** — persists current content without regenerating
- **[Cancel]**

### 4.3 Assertions Editor

Displays the list of implementation assertions in a structured table:

| # | Type | Target | Description | Status |
|---|------|--------|-------------|--------|
| 1 | `file_exists` | `src/main/review/foo.js` | Analyser exists | pending |
| 2 | `export_exists` | `FooReview` | Class exported | pending |

Controls:
- **[+ Add Assertion]** — appends a blank row for manual entry
- Per-row **[Delete]** icon
- **[Regenerate All]** — re-runs AI assertion generation from RIS + AC, replaces all assertions
- **[Save]** — persists current assertions
- **[Cancel]**

### 4.4 Review Viewer

Displays the latest review document for a story after a run has completed.

**Layout within the center panel:**

```
┌─ ACTION ITEMS ──────────────────────────────────────────────────┐
│  ☐ [critical] ERR_ASYNC_NO_TRY  src/main/foo.js:42             │
│  ☐ [important] DB_NO_CASCADE  migrations/001.js:17             │
│  ☑ [critical] SEC_XSS_UNSAFE  renderer/app.js:231              │
│  [Branch: main ▼]  [Fix Selected Items]                         │
└─────────────────────────────────────────────────────────────────┘

┌─ DOCUMENT ──────────────────────────────────────────────────────┐
│  Rendered markdown of the full review document                  │
│  (scrollable)                                                   │
└─────────────────────────────────────────────────────────────────┘
```

Action items are parsed from the review markdown (headings + bullet lists tagged with severity and rule ID). The user:
1. Checks one or more items
2. Selects a branch from the branch dropdown (populated from `git branch`)
3. Clicks **[Fix Selected Items]** — opens a Puffin prompt with the selected findings as context, targeting the chosen branch

---

## 5. Code Review Run Workflow

1. User checks stories → clicks **[Start Code Review]**
2. Plugin writes a run record to `.puffin/plugins/code-review-plugin/runs.json` with timestamp, selected story IDs, status: `running`
3. For each selected story (in parallel):
   - IPC call to `code-review:runStory { storyId, projectPath }`
   - Main process invokes the story's associated review service class (from `src/main/review/`)
   - Findings written to `docs/code-reviews/{YYYY-MM-DD_HH-mm-ss}/{storyId}.md`
4. Story rows update status in real-time via IPC events (`code-review:storyProgress`)
5. On all-complete, the [Review] button for each story becomes enabled
6. Run record updated to `status: complete`
7. Toast: "Code review complete — N critical, M important findings"

---

## 6. Storage

| Location | Contents |
|----------|----------|
| `.puffin/plugins/code-review-plugin/stories.json` | Array of story objects (id, title, description, ac, ris, assertions) |
| `.puffin/plugins/code-review-plugin/runs.json` | Array of run records (id, timestamp, storyIds, status) |
| `docs/code-reviews/{timestamp}/` | One markdown file per story per run |

The default 11 stories from `docs/pending-stories-2026-04-23.md` are seeded on first load if `stories.json` does not exist.

---

## 7. AI Regeneration Pipeline

When a story is saved, three AI calls run in sequence:

```
[User saves story]
       ↓
Step 1: Refine Acceptance Criteria
  Input:  title + description + current AC
  Output: refined AC (bullet list)
       ↓
Step 2: Generate RIS
  Input:  title + refined AC
  Output: RIS markdown (scope, class, methods, key notes)
       ↓
Step 3: Generate Assertions
  Input:  title + RIS + refined AC
  Output: array of { type, target, detail } assertion objects
       ↓
[Persist all three; update UI]
```

Each step uses `window.puffin.claude.submit()` (or a one-shot sendPrompt equivalent) with `disableTools: true` and a structured output schema. On failure, the existing content is retained and an error toast is shown.

---

## 8. Edge Cases & Constraints

- **No review services yet:** [Start Code Review] can still run, but the review service for each story will return a "not yet implemented" message. The review doc is still created with that message.
- **Story deleted while running:** The run continues; the story row is removed from the list but the output doc is still written.
- **Concurrent runs:** [Start Code Review] is disabled while a run is in progress.
- **Large review docs:** The review viewer paginates or virtualises the markdown if the doc exceeds 50KB.
- **Branch selection for Fix:** Defaults to the current git branch. User can change before clicking Fix.
