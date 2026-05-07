# Code Review Plugin — Technical Specification

**Version:** 1.0.0  
**Date:** 2026-04-23  
**Depends on:** Functional Spec v1.0.0, Plugin Architecture (PLUGIN_DEVELOPMENT_GUIDE.md)

---

## 1. Plugin Identity

```json
{
  "name": "code-review-plugin",
  "displayName": "Code Review",
  "version": "1.0.0"
}
```

**Nav tab label:** "Code Review"  
**Nav tab order:** After "Docs"

---

## 2. File Structure

```
plugins/code-review-plugin/
├── puffin-plugin.json
├── index.js                          ← main-process entry (IPC + lifecycle)
├── package.json
├── lib/
│   ├── story-repository.js           ← CRUD for review stories (JSON file)
│   ├── run-repository.js             ← CRUD for run records
│   ├── review-runner.js              ← orchestrates review service classes
│   ├── finding-parser.js             ← parses review markdown → action items
│   └── ai-generator.js              ← AC / RIS / assertion generation via Claude
└── renderer/
    ├── index.js                      ← exports CodeReviewView
    ├── components/
    │   ├── CodeReviewView.js         ← root 2-panel layout
    │   ├── StoryListPanel.js         ← left panel
    │   ├── CenterPanel.js            ← dynamic center dispatcher
    │   ├── StoryEditor.js            ← edit title / description / AC
    │   ├── RisEditor.js              ← edit / regenerate RIS
    │   ├── AssertionsEditor.js       ← edit / regenerate assertions table
    │   └── ReviewViewer.js           ← view doc + triage action items
    └── styles/
        └── code-review.css
```

---

## 3. Manifest (`puffin-plugin.json`)

```json
{
  "name": "code-review-plugin",
  "version": "1.0.0",
  "displayName": "Code Review",
  "description": "Manage and run nightly static-analysis code reviews with story-based configuration",
  "main": "index.js",
  "activationEvents": ["onStartup"],
  "contributes": {
    "views": [
      {
        "id": "code-review-view",
        "name": "Code Review",
        "location": "nav",
        "order": 5,
        "viewType": "CodeReviewView"
      }
    ]
  },
  "extensionPoints": {
    "ipcHandlers": [
      "code-review:listStories",
      "code-review:saveStory",
      "code-review:deleteStory",
      "code-review:runStories",
      "code-review:getRunStatus",
      "code-review:getReviewDoc",
      "code-review:listBranches",
      "code-review:generateAc",
      "code-review:generateRis",
      "code-review:generateAssertions"
    ]
  },
  "renderer": {
    "entry": "renderer/index.js",
    "components": [
      {
        "name": "CodeReviewView",
        "export": "CodeReviewView",
        "type": "class"
      }
    ],
    "styles": ["renderer/styles/code-review.css"]
  }
}
```

---

## 4. Main Process (`index.js`)

```javascript
// Lifecycle: init → onActivate → onDeactivate → destroy
class CodeReviewPlugin {
  init(pluginContext)       // store context, register IPC handlers
  onActivate()             // no-op (stateless)
  onDeactivate()           // no-op
  destroy()                // remove IPC handlers
}
```

IPC handlers are registered with prefix `code-review:` and all return `{ success, data?, error? }`.

### 4.1 IPC Handler Summary

| Channel | Input | Output |
|---------|-------|--------|
| `code-review:listStories` | `{}` | `{ stories: Story[] }` |
| `code-review:saveStory` | `{ story: Story }` | `{ story: Story }` |
| `code-review:deleteStory` | `{ storyId: string }` | `{}` |
| `code-review:runStories` | `{ storyIds: string[], projectPath: string }` | `{ runId: string }` (async; progress via events) |
| `code-review:getRunStatus` | `{ runId: string }` | `{ run: Run }` |
| `code-review:getReviewDoc` | `{ storyId: string, runId?: string }` | `{ markdown: string, findingCount: number }` |
| `code-review:listBranches` | `{}` | `{ branches: string[], current: string }` |
| `code-review:generateAc` | `{ storyId: string }` | `{ ac: string[] }` |
| `code-review:generateRis` | `{ storyId: string }` | `{ ris: string }` |
| `code-review:generateAssertions` | `{ storyId: string }` | `{ assertions: Assertion[] }` |

### 4.2 Progress Events (main → renderer)

```javascript
// Emitted during a run via webContents.send()
'code-review:storyProgress'  { runId, storyId, status, findingCount? }
'code-review:runComplete'    { runId, totalCritical, totalImportant }
```

---

## 5. Data Models

### Story

```javascript
{
  id: string,               // uuidv4
  title: string,
  description: string,      // "As a developer, I want..."
  acceptanceCriteria: string[], // one AC per entry
  ris: string,              // markdown
  assertions: Assertion[],
  reviewServiceClass: string, // e.g. 'DatabaseIntegrityReview' (nullable)
  lastRunId: string | null,
  createdAt: string,        // ISO
  updatedAt: string         // ISO
}
```

### Assertion

```javascript
{
  id: string,
  type: 'file_exists' | 'export_exists' | 'function_signature' | 'file_contains' | 'pattern_match',
  target: string,
  detail: string,
  status: 'pending' | 'passed' | 'failed'
}
```

### Run

```javascript
{
  id: string,               // uuidv4
  startedAt: string,        // ISO
  completedAt: string | null,
  storyIds: string[],
  status: 'running' | 'complete' | 'error',
  results: {
    [storyId]: {
      status: 'running' | 'complete' | 'error',
      reportPath: string | null,
      findingCount: { critical: number, important: number, info: number }
    }
  }
}
```

---

## 6. Library Modules

### `lib/story-repository.js`

Persists stories to `.puffin/plugins/code-review-plugin/stories.json`.

```javascript
class StoryRepository {
  constructor(storagePath)
  async load() → Story[]
  async save(stories) → void
  async findById(id) → Story | null
  async upsert(story) → Story        // sets updatedAt = now, id = uuidv4 if new
  async delete(id) → void
  async seed(defaultStories) → void  // called on first load if file absent
}
```

### `lib/run-repository.js`

Persists run records to `.puffin/plugins/code-review-plugin/runs.json`.

```javascript
class RunRepository {
  constructor(storagePath)
  async createRun(storyIds) → Run
  async updateRun(runId, updates) → Run
  async getLatestRunForStory(storyId) → Run | null
  async listRuns() → Run[]
}
```

### `lib/review-runner.js`

Dynamically requires and invokes review service classes from `src/main/review/`.

```javascript
class ReviewRunner {
  constructor(projectPath, outputDir, win)
  async run(stories) → void
    // For each story:
    //   1. Require src/main/review/<serviceFile>.js
    //   2. Instantiate service class
    //   3. Call service.run() → findings
    //   4. Call service.generateReport(findings) → reportPath
    //   5. Emit code-review:storyProgress via win.webContents.send()
    
  _resolveServiceFile(reviewServiceClass) → string | null
  _computeOutputPath(storyId, runId) → string
}
```

**Fallback:** If `reviewServiceClass` is null or the file doesn't exist, the runner writes a stub report: `# Review: {title}\n\n_Review service not yet implemented._`

### `lib/finding-parser.js`

Parses a review markdown document into structured action items.

```javascript
class FindingParser {
  parse(markdown) → ActionItem[]
}

// ActionItem shape:
{
  id: string,               // derived from rule ID + line
  rule: string,             // e.g. 'ERR_ASYNC_NO_TRY'
  severity: 'critical' | 'important' | 'info',
  file: string,
  line: number | null,
  description: string,
  rawText: string
}
```

**Parsing strategy:** Scan for lines matching `- \*\*\[critical\]\*\*` or `- \[important\]` patterns that review services emit. Each bullet becomes one `ActionItem`. Falls back to section-heading grouping if no tagged bullets found.

### `lib/ai-generator.js`

Calls Claude via `window.puffin.claude` (renderer-side) using structured prompts.

**Note:** This module runs in the renderer (not main), as it drives the streaming UI. It is imported by `StoryEditor.js`.

```javascript
class AiGenerator {
  constructor(pluginContext)
  
  async generateAc(story) → string[]
    // Prompt: refine the acceptance criteria for this story
    // Model: claude-sonnet-4-6, disableTools: true
    // Returns: array of AC strings

  async generateRis(story) → string
    // Prompt: generate RIS from title + AC
    // Returns: markdown string

  async generateAssertions(story) → Assertion[]
    // Prompt: generate implementation assertions from RIS + AC
    // Returns: array of Assertion objects
    // Must use structured output (JSON schema)
}
```

---

## 7. Renderer Components

### `CodeReviewView.js`

Root component. Creates a `<div class="cr-layout">` with two children: `StoryListPanel` and `CenterPanel`.

```javascript
class CodeReviewView {
  constructor(container, pluginContext)
  init()                    // mount panels, load stories
  onActivate()              // refresh story list
  onDeactivate()
  destroy()

  _onStoryAction(action, story)   // dispatches to CenterPanel
  _onRunProgress(event, data)     // updates story row status badge
}
```

### `StoryListPanel.js`

Renders the left panel. Emits events to parent when buttons are clicked. Does not own story state — receives story array as prop and calls `onAction(type, story)`.

```javascript
class StoryListPanel {
  constructor(container, { onAction, onRunStart })
  render(stories, activeStoryId, runningStoryIds)
  _renderStoryRow(story, isActive, isRunning)
  _renderHeader(anyChecked, allChecked)
}
```

### `CenterPanel.js`

Dispatcher: holds the current mode (`'idle' | 'edit' | 'ris' | 'assertions' | 'review'`) and renders the appropriate sub-component.

```javascript
class CenterPanel {
  constructor(container, pluginContext)
  showIdle()
  showEditor(story)         // StoryEditor
  showRis(story)            // RisEditor
  showAssertions(story)     // AssertionsEditor
  showReview(story, runId)  // ReviewViewer
  destroy()
}
```

### `StoryEditor.js`

Form with title, description, and acceptance criteria textarea. On save:
1. Calls `code-review:saveStory` IPC
2. Shows progress bar while AI pipeline runs (3 steps)
3. On pipeline complete, refreshes story data from IPC and re-renders

### `RisEditor.js`

Markdown textarea. Toolbar: [Regenerate] → calls `code-review:generateRis`, [Save], [Cancel].

### `AssertionsEditor.js`

Table-based editor. Each row is editable inline. Toolbar: [+ Add], [Regenerate All], [Save], [Cancel].

### `ReviewViewer.js`

Split layout:
- Top third: `ActionItemsList` — scrollable checklist of findings
- Bottom two-thirds: rendered markdown (convert to HTML via `marked` or equivalent)

`ActionItemsList` emits `onFixRequest({ items, branch })` when Fix is clicked. The parent `CodeReviewView` handles this by constructing a prompt and calling `window.puffin.claude.submit()`.

---

## 8. CSS Architecture

Single file: `renderer/styles/code-review.css`

Key selectors:
```css
.cr-layout            /* flex row, full height */
.cr-left-panel        /* width: 320px, overflow-y: auto */
.cr-center-panel      /* flex: 1, overflow-y: auto */
.cr-story-row         /* flex, align-items: center, padding */
.cr-story-row.active  /* highlighted */
.cr-story-row.running /* pulsing border */
.cr-story-actions     /* flex, gap: 4px */
.cr-btn               /* base button style */
.cr-btn-primary       /* blue, Start Code Review */
.cr-btn-disabled      /* muted, pointer-events: none */
.cr-action-items      /* top section of ReviewViewer */
.cr-review-doc        /* bottom section, prose styles */
.cr-severity-critical /* red badge */
.cr-severity-important /* amber badge */
.cr-severity-info     /* grey badge */
```

---

## 9. Seeded Default Stories

On first plugin activation, if `stories.json` is absent, `StoryRepository.seed()` populates it with the 11 stories from `docs/pending-stories-2026-04-23.md`. Each story's `reviewServiceClass` is mapped:

| Story title | `reviewServiceClass` |
|-------------|----------------------|
| Database Integrity Review | `DatabaseIntegrityReview` |
| SAM State Management Review | `SamStateReview` |
| Aggregate and Publish Report | `ReviewRunner` |
| Security Review | `SecurityReview` |
| Claude Service Integration Review | `ClaudeServiceReview` |
| IPC Communication Review | `IpcCommunicationReview` |
| Memory Management Review | `MemoryManagementReview` |
| UI Components Review | `UiComponentsReview` |
| Error Handling Review | `ErrorHandlingReview` |
| Preload Bridge Completeness Review | `PreloadBridgeReview` |
| Plugin Manifest & Sandbox Review | `PluginContractReview` |

---

## 10. Dependencies

- `uuid` (already in project) — for ID generation  
- `marked` or equivalent — markdown → HTML rendering in `ReviewViewer`  
- No additional npm packages required for the main process

---

## 11. IPC Handler Registration Timing

Plugin registers all `code-review:*` handlers in `init()` (before `createWindow()` in Puffin's main.js). This follows the established Puffin pattern (see MEMORY.md: "IPC handler registration timing").
