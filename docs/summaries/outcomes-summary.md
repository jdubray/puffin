# Outcome Lifecycle Plugin — Technical Summary

This document describes the Outcome Lifecycle Plugin's architecture, data flow, and implementation details. It covers how outcomes are created, tracked, persisted, and displayed throughout the sprint lifecycle.

## 1. What Is an Outcome?

An **outcome** is a high-level goal that one or more user stories contribute to. Outcomes are derived from the "so that …" clause of user story descriptions (e.g., *"As a developer, I want X **so that** Y"* → outcome = Y). Multiple stories can map to the same outcome, and a single story can contribute to multiple outcomes.

## 2. How Outcomes Are Created

Outcomes are created through two paths:

### Automatic Extraction (Bootstrap)

On first activation — or when `resetAndReprocess` is called — the plugin bootstraps outcomes from the existing story backlog:

1. **`index.js:_scheduleBootstrap()`** retries until `context.getService('stories')` is available, then calls `storyService.getAll()` (with retry logic: up to 8 attempts, delays escalating from 2 s to 20 s).
2. For each story, **`outcome-parser.js:extractOutcome()`** applies the regex `/\bso\s+that\s+(.+)/is` to the story description.
3. If a match is found, the extracted text is trimmed and used as both the outcome title and description.
4. The plugin creates a lifecycle entry via `lifecycle-repository.js:create()` and maps the originating story to it.

### Manual Creation

Users can create outcomes manually through the UI sidebar's "New Outcome" button, which calls the `createLifecycle` IPC handler. Manual outcomes start with status `not_started` and no story mappings.

### IPC Handler

```
outcome-lifecycle:createLifecycle  →  lifecycle-repository.create({ title, description })
```

Each lifecycle receives a UUID (`crypto.randomUUID()`), initial status `not_started`, empty `storyMappings[]` and `dependencies[]` arrays, and `createdAt`/`updatedAt` timestamps.

## 3. Status Model and Transitions

The plugin uses **three** statuses, defined in `lifecycle-repository.js:VALID_STATUSES`:

| Status | Icon | Meaning |
|--------|------|---------|
| `not_started` | ○ | No mapped stories have begun, or no stories are mapped |
| `in_progress` | ◑ | At least one mapped story is in progress or partially completed |
| `achieved` | ● | All mapped stories are completed |

### Status Computation

Status is **derived, not manually set**. The pure function `status-engine.js:computeStatus(storyStatuses)` implements:

```
if (no stories OR all statuses are pending)  →  'not_started'
if (all statuses are completed)              →  'achieved'
otherwise                                    →  'in_progress'
```

The function uses **exact string matching** — no normalization is applied:
- A story counts as **completed** only if its status is exactly `'completed'`
- A story counts as **active** if its status is in `ACTIVE_STATUSES = ['in-progress', 'completed']`
- All other status strings (e.g. `'done'`, `'implementing'`, `'in_progress'`, `'pending'`) fall through to inactive, meaning they count as "not started"

### When Status Updates Happen

Status recomputation is triggered by:
1. **Story status change events** — the plugin subscribes to `story:status-changed` in `index.js` and runs `_recomputeStatuses()` for all affected lifecycles.
2. **Story mapping changes** — mapping or unmapping a story triggers recomputation for that lifecycle.
3. **Synthesis** — the synthesis engine recomputes statuses from actual data (never trusting Claude's output).

## 4. Updates During Sprint Execution

When a sprint is running and story statuses change:

1. The main process emits `story:status-changed` events (from `app.js` via plugin event bus).
2. `index.js` receives the event and queues a recomputation via a serialized promise chain (`_eventQueue`) to prevent race conditions.
3. For each lifecycle that maps to the changed story, `computeStatus()` re-derives the status from all mapped story statuses.
4. If the status changed, the lifecycle is updated in the repository and persisted to disk.

The serialized promise chain ensures that rapid-fire status changes (e.g., multiple stories completing in quick succession) are processed sequentially, preventing data corruption.

## 5. Persistence Layer

### Primary Storage

- **Location**: `.puffin/outcome-lifecycles/lifecycles.json`
- **Format**: `{ version: 1, lifecycles: [...] }`
- **Write strategy**: Atomic writes via temporary file (`.tmp` suffix) + rename to prevent corruption on crash
- **Implementation**: `storage.js` — `load()` reads and JSON-parses, `save(data)` writes atomically

### Data Shape (per lifecycle)

```json
{
  "id": "uuid",
  "title": "Outcome title",
  "description": "Detailed description",
  "status": "not_started | in_progress | achieved",
  "storyMappings": ["story-id-1", "story-id-2"],
  "dependencies": ["other-lifecycle-id"],
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

### Synthesized Graph Cache

The synthesis engine maintains a separate cache for the AI-generated dependency graph:
- Cached on the `SynthesisEngine` instance (`_cachedResult`)
- Invalidated when the lifecycle count changes (simple heuristic)
- Not persisted to disk — regenerated on demand

## 6. UI Display

The renderer component (`renderer/components/index.js`) implements `OutcomeLifecycleView`, a two-pane layout:

### Sidebar (Left Pane)
- **Lifecycle list**: Each item shows status icon (○/◑/●), title, and mapped story count
- **"New Outcome" button**: Creates a lifecycle with default title
- **Selection**: Click selects, keyboard ↑/↓ navigates, Enter selects
- **Empty state**: Prompt to create first outcome or run bootstrap

### Detail Pane (Right Pane)
- **Header**: Editable title (contenteditable), status dropdown (not_started/in_progress/achieved)
- **Description**: Editable text area
- **Mapped Stories section**: Lists stories mapped to this outcome with status badges, plus "Map Story" button to add mappings
- **Dependencies section**: Lists other outcomes this one depends on, plus "Add Dependency" button
- **Delete button**: Removes lifecycle with referential integrity (cleans up from other lifecycles' dependency arrays)

### DAG Visualization
- **Toggle button**: "Show DAG" / "Hide DAG" switches between list and graph view
- **Rendering**: Uses the serialized DAG from `dag-engine.js` — nodes positioned by topological layer (x) and index (y)
- **Node display**: Colored by status (gray=not_started, blue=in_progress, green=achieved)
- **Edges**: SVG lines connecting dependent outcomes

### Security
- All user-supplied text is escaped via `_escapeHtml()` before DOM insertion to prevent XSS

## 7. End-to-End Flow

A complete outcome lifecycle from creation to completion:

```
1. CREATION
   Plugin activates → bootstrapFromStories() extracts "so that" clauses
   → Creates lifecycle entries with status 'not_started'
   → Maps originating stories to each lifecycle

2. PLANNING
   User views outcomes in sidebar → sees all 'not_started' (○)
   User can manually create outcomes, edit titles, add descriptions
   User maps additional stories or adds inter-outcome dependencies

3. SPRINT EXECUTION
   Story implementation begins → story:status-changed fires
   → Plugin recomputes: some stories in-progress → lifecycle becomes 'in_progress' (◑)

4. PROGRESS TRACKING
   More stories complete → status stays 'in_progress'
   User can view DAG to see dependency relationships
   Synthesis engine can generate high-level flow graph via Claude

5. ACHIEVEMENT
   All mapped stories reach 'completed'/'done'
   → computeStatus() returns 'achieved' (●)
   → Lifecycle persisted with final status

6. PERSISTENCE
   Every status change writes atomically to lifecycles.json
   Data survives app restarts — plugin reloads from file on next activation
```

## 8. Relationship Between Outcomes and User Stories

The outcome-story relationship is **many-to-many**:

- One outcome can have multiple mapped stories (`lifecycle.storyMappings[]`)
- One story can contribute to multiple outcomes (a story ID can appear in multiple lifecycles' `storyMappings`)

### Story Mapping Operations

| Operation | IPC Handler | Effect |
|-----------|-------------|--------|
| Map story | `outcome-lifecycle:mapStory` | Adds story ID to lifecycle's `storyMappings[]`, recomputes status |
| Unmap story | `outcome-lifecycle:unmapStory` | Removes story ID from `storyMappings[]`, recomputes status |
| List stories for outcome | `outcome-lifecycle:getStoriesForLifecycle` | Returns `storyMappings[]` array |
| List outcomes for story | `outcome-lifecycle:getLifecyclesForStory` | Filters all lifecycles where `storyMappings` includes the story ID |

### Bidirectional Lookup

- **Outcome → Stories**: Direct array access on `lifecycle.storyMappings`
- **Stories → Outcomes**: `lifecycle-repository.js:getLifecyclesForStory(storyId)` scans all lifecycles and filters those whose `storyMappings` includes the given story ID (linear scan, adequate for expected data volumes)

### Referential Integrity

When a lifecycle is deleted:
1. Its ID is removed from all other lifecycles' `dependencies[]` arrays
2. Story mappings are simply discarded (stories are not affected)

When stories are deleted externally, orphaned story IDs remain in `storyMappings[]` — the plugin tolerates missing stories gracefully during status computation (they're simply skipped).

## Appendix: IPC Handler Reference

| Handler | Method | Purpose |
|---------|--------|---------|
| `createLifecycle` | POST | Create new lifecycle |
| `getLifecycle` | GET | Fetch single lifecycle by ID |
| `updateLifecycle` | PATCH | Update title, description, or status |
| `deleteLifecycle` | DELETE | Remove lifecycle + clean dependencies |
| `listLifecycles` | GET | List all, optionally filter by status |
| `mapStory` | POST | Add story mapping |
| `unmapStory` | DELETE | Remove story mapping |
| `getStoriesForLifecycle` | GET | List mapped story IDs |
| `getLifecyclesForStory` | GET | List lifecycles for a story |
| `getDag` | GET | Get serialized dependency graph |
| `addDependency` | POST | Add outcome→outcome dependency |
| `removeDependency` | DELETE | Remove outcome→outcome dependency |
| `getSynthesizedDag` | GET | Get AI-synthesized flow graph (cached) |
| `resynthesizeDag` | POST | Force re-synthesis via Claude |
| `resetAndReprocess` | POST | Wipe all data, re-extract from stories |

## Appendix: File Map

| File | Purpose |
|------|---------|
| `puffin-plugin.json` | Plugin manifest — declares IPC handlers, renderer component, nav view |
| `index.js` | Entry point — activate/deactivate, bootstrap, event subscriptions |
| `lib/ipc-handlers.js` | 15 IPC handler implementations |
| `lib/lifecycle-repository.js` | CRUD operations, story mappings, filtering |
| `lib/status-engine.js` | Pure status derivation function |
| `lib/storage.js` | File-based JSON persistence with atomic writes |
| `lib/outcome-parser.js` | "so that" clause extraction via regex |
| `lib/dag-engine.js` | Dependency graph — Kahn's algorithm, serialization, layout |
| `lib/synthesis-engine.js` | Claude-powered synthesis pipeline with caching |
| `renderer/components/index.js` | Two-pane UI — sidebar, detail view, DAG visualization |
