# Outcome Lifecycle Plugin — Design Document

## 1. Overview

The Outcome Lifecycle Plugin tracks solution progress using the BOLT methodology: modeling solutions as finite state machines where only desired states (outcomes) are represented. It extracts outcomes from user stories, builds a directed dependency graph, and updates progress as stories are completed.

## 2. Plugin Structure

```
plugins/outcome-lifecycle-plugin/
├── puffin-plugin.json
├── index.js                          # Main process entry (activate/deactivate)
├── renderer/
│   ├── components/
│   │   └── index.js                  # Renderer entry + OutcomeLifecycleView
│   └── styles/
│       └── outcome-lifecycle.css     # Scoped styles
└── lib/
    ├── lifecycle-engine.js           # Graph computation, dependency resolution
    ├── outcome-analyzer.js           # User story → outcome extraction
    ├── lifecycle-database.js         # SQLite persistence via better-sqlite3
    └── lifecycle-validator.js        # Graph validation, cycle detection
```

## 3. Integration with Puffin Internals

### 3.1 Plugin Loader Integration

The plugin follows the established pattern: `puffin-plugin.json` manifest with `main: "index.js"`, `activate(context)` / `deactivate()` exports.

**Context API used:**
- `context.registerIpcHandler(channel, handler)` — auto-namespaces to `plugin:outcome-lifecycle-plugin:<channel>`
- `context.registerAction(name, handler)` — for programmatic inter-plugin access
- `context.emit(event, data)` — for broadcasting lifecycle changes
- `context.log` — structured logging
- `context.projectPath` — project root for DB access

### 3.2 Database Access

Uses the existing singleton: `const { database } = require('../../src/main/database')`.

The `lifecycles` and `outcome_story_mappings` tables are created by `lifecycle-database.js` on first activation (migration-style `CREATE TABLE IF NOT EXISTS`). No schema changes to existing tables.

```javascript
// lifecycle-database.js
class LifecycleDatabase {
  constructor(connection) {
    this.db = connection
    this.ensureTables()
  }

  ensureTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lifecycles (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        lifecycle_data TEXT NOT NULL,  -- JSON blob
        version INTEGER NOT NULL DEFAULT 1,
        last_updated TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_lifecycle_project ON lifecycles(project_id);

      CREATE TABLE IF NOT EXISTS outcome_story_mappings (
        outcome_id TEXT NOT NULL,
        user_story_id TEXT NOT NULL,
        lifecycle_id TEXT NOT NULL,
        PRIMARY KEY (outcome_id, user_story_id),
        FOREIGN KEY (lifecycle_id) REFERENCES lifecycles(id) ON DELETE CASCADE
      );
    `)
  }
}
```

### 3.3 Story Completion Events

The plugin hooks into story status changes via the existing `SprintService.onStoryStatusChanged` callback pattern. During `activate()`, it registers a listener through the plugin context's event system or by subscribing to the IPC channel `state:syncStoryStatus` results.

**Preferred approach:** Register an action listener via `context.on('story:status-changed', handler)` if the plugin event bus supports it, or poll/intercept via IPC.

**Fallback approach:** The plugin registers its own IPC handler that the renderer calls after a story status change, passing the updated story IDs.

## 4. Component Design

### 4.1 `lifecycle-engine.js` — Core Graph Logic

Responsible for:
- Building the outcome dependency graph (adjacency list)
- Topological sort for dependency ordering
- Cycle detection (Kahn's algorithm or DFS-based)
- Computing available outcomes given current achieved set
- Calculating progress metrics (achieved value / total value)
- Handling re-entrant transitions (outcome variants)

```javascript
class LifecycleEngine {
  /**
   * Build outcome graph from outcomes and transitions.
   * @param {Outcome[]} outcomes
   * @param {Transition[]} transitions
   * @returns {{ adjacency: Map, inDegree: Map, topOrder: string[] }}
   */
  buildGraph(outcomes, transitions) { ... }

  /**
   * Return outcome IDs whose prerequisites are all achieved.
   * @param {Outcome[]} outcomes
   * @param {Set<string>} achievedIds
   * @returns {string[]}
   */
  getAvailableOutcomes(outcomes, achievedIds) { ... }

  /**
   * Recalculate all metrics after a status change.
   * @param {Lifecycle} lifecycle
   * @returns {Lifecycle} updated lifecycle with new metrics
   */
  recalculate(lifecycle) { ... }

  /**
   * Detect cycles in the dependency graph.
   * @returns {string[][]} array of cycle paths, empty if acyclic
   */
  detectCycles(outcomes, transitions) { ... }
}
```

### 4.2 `outcome-analyzer.js` — Story-to-Outcome Extraction

Parses user stories from `database.userStories` and extracts outcomes.

**Algorithm:**
1. Query all stories for the project via `database.userStories.findAll()`
2. For each story, parse the "so that [outcome]" clause from description
3. Extract outcome title from story title (strip "As a...I want to..." prefix)
4. Map story `branchId` and prerequisite relationships to outcome dependencies
5. Deduplicate by fuzzy-matching outcome titles
6. Assign business value from story priority or a default

```javascript
class OutcomeAnalyzer {
  /**
   * Extract outcomes from user stories.
   * @param {UserStory[]} stories
   * @returns {{ outcomes: Outcome[], transitions: Transition[] }}
   */
  analyze(stories) { ... }

  /**
   * Parse a single story into an outcome candidate.
   * @param {UserStory} story
   * @returns {OutcomeCandidate}
   */
  parseStory(story) { ... }

  /**
   * Deduplicate similar outcomes by title similarity.
   * @param {OutcomeCandidate[]} candidates
   * @returns {Outcome[]}
   */
  deduplicate(candidates) { ... }
}
```

No LLM is used for extraction — this is deterministic parsing. If the story format is non-standard, the analyzer falls back to using the story title as the outcome title with default metadata.

### 4.3 `lifecycle-validator.js` — Consistency Checks

```javascript
class LifecycleValidator {
  /**
   * Validate a lifecycle for consistency.
   * @param {Lifecycle} lifecycle
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  validate(lifecycle) { ... }
}
```

Rules enforced:
- Every outcome has a non-empty title and description
- All prerequisite IDs reference existing outcomes
- No circular dependencies (delegates to `LifecycleEngine.detectCycles()`)
- Value scores in [1, 10]
- Progress values in [0, 100]
- At least one outcome in the graph
- Target outcomes exist in the outcome set

### 4.4 `lifecycle-database.js` — Persistence

```javascript
class LifecycleDatabase {
  getLifecycle(projectId) { ... }          // Returns parsed Lifecycle or null
  saveLifecycle(lifecycle) { ... }         // Upsert with version increment
  deleteLifecycle(projectId) { ... }
  getOutcomeMappings(lifecycleId) { ... }
  saveOutcomeMappings(lifecycleId, mappings) { ... }
}
```

The `lifecycle_data` column stores the full `Lifecycle` object as JSON. The `outcome_story_mappings` table enables efficient lookup of "which stories map to which outcomes" without parsing the JSON blob.

## 5. IPC Handlers

All handlers are auto-namespaced by `context.registerIpcHandler()` to `plugin:outcome-lifecycle-plugin:<name>`.

| Handler | Input | Output | Description |
|---------|-------|--------|-------------|
| `getLifecycle` | `{ projectId }` | `Lifecycle \| null` | Get current lifecycle |
| `initialize` | `{ projectId }` | `Lifecycle` | Build lifecycle from stories |
| `updateOutcomes` | `{ projectId, userStoryIds }` | `Lifecycle` | Update after story completion |
| `getOutcomeDetails` | `{ outcomeId }` | `Outcome` | Single outcome with full detail |
| `listAvailableOutcomes` | `{ projectId }` | `Outcome[]` | Outcomes unlocked by current state |
| `runMaintenance` | `{ projectId }` | `void` | Re-validate and clean up |

All handlers return the standard `{ success, data/error }` envelope (provided by `PluginContext` wrapper).

## 6. Renderer Components

### 6.1 `OutcomeLifecycleView`

Main view component registered in the nav sidebar. Contains:

- **Graph visualization**: Renders outcomes as nodes, transitions as edges. Uses a simple canvas/SVG-based DAG layout (no external graph library required — outcomes are typically <50 nodes). Achieved nodes are highlighted green, in-progress yellow, pending gray.
- **Details panel**: Clicking a node shows outcome details, associated stories, progress bar, prerequisites.
- **Summary bar**: Overall progress percentage, achieved/total counts, next available outcomes.

### 6.2 Renderer Entry

```javascript
// renderer/components/index.js
export default {
  init(context) {
    context.registerView('outcome-lifecycle', OutcomeLifecycleView)
  },
  components: { OutcomeLifecycleView }
}
```

### 6.3 IPC from Renderer

```javascript
const result = await window.api.invoke(
  'plugin:outcome-lifecycle-plugin:getLifecycle',
  { projectId }
)
// result.success → result.data is the Lifecycle object
```

## 7. Lifecycle Flow

### 7.1 Initialization (first load)

```
activate(context)
  → lifecycleDb.getLifecycle(projectId)
  → if null:
      → database.userStories.findAll()
      → outcomeAnalyzer.analyze(stories)
      → lifecycleEngine.buildGraph(outcomes, transitions)
      → lifecycleValidator.validate(lifecycle)
      → lifecycleDb.saveLifecycle(lifecycle)
      → context.emit('outcome-lifecycle:initialized', lifecycle)
```

### 7.2 Story Completion Update

```
onStoryStatusChanged({ storyId, status: 'completed' })
  → lifecycleDb.getLifecycle(projectId)
  → find outcomes mapped to storyId
  → update outcome metrics (storiesCompleted++)
  → if all stories for outcome completed → status = 'achieved'
  → lifecycleEngine.recalculate(lifecycle)
  → lifecycleValidator.validate(lifecycle)
  → lifecycleDb.saveLifecycle(lifecycle)
  → notify renderer via IPC event
```

### 7.3 Re-entrant Transitions

When an outcome is achieved but has "evolved" variants (e.g., v1 → v2), the engine creates a new outcome node linked to the original via a `type: "evolution"` transition. The original remains achieved; the variant starts as pending.

## 8. Data Model (Final)

### Outcome

```javascript
{
  id: "uuid",
  title: string,
  description: string,
  value: number,                      // 1-10
  status: "pending" | "in-progress" | "achieved",
  prerequisites: string[],            // outcome IDs
  userStories: string[],              // story IDs
  metrics: {
    storiesCompleted: number,
    storiesTotal: number,
    progress: number                  // 0-100
  },
  createdAt: string,                  // ISO timestamp
  updatedAt: string,
  metadata: {
    initialState: string,
    desiredState: string,
    category: "feature" | "capability" | "experience"
  }
}
```

### Lifecycle

```javascript
{
  id: "uuid",
  projectId: string,
  outcomes: Outcome[],
  transitions: Transition[],
  currentOutcome: string | null,
  targetOutcomes: string[],
  version: number,
  lastUpdatedBy: "initialization" | "story-completion" | "manual",
  generatedAt: string,
  metadata: {
    totalValue: number,
    achievedValue: number,
    overallProgress: number           // 0-100
  }
}
```

### Transition

```javascript
{
  from: string,                       // outcome ID (null for entry points)
  to: string,                         // outcome ID
  type: "required" | "optional" | "parallel" | "evolution",
  description: string
}
```

## 9. puffin-plugin.json

```json
{
  "name": "outcome-lifecycle-plugin",
  "version": "1.0.0",
  "displayName": "Outcome Lifecycle",
  "description": "BOLT-based outcome tracking and lifecycle visualization",
  "main": "index.js",
  "author": "Puffin",
  "license": "MIT",
  "renderer": {
    "entry": "renderer/components/index.js",
    "components": [
      {
        "name": "OutcomeLifecycleView",
        "export": "OutcomeLifecycleView",
        "type": "class"
      }
    ],
    "styles": ["renderer/styles/outcome-lifecycle.css"]
  },
  "extensionPoints": {
    "actions": ["getLifecycle", "updateOutcomes", "initialize"],
    "ipcHandlers": [
      "getLifecycle",
      "initialize",
      "updateOutcomes",
      "getOutcomeDetails",
      "listAvailableOutcomes",
      "runMaintenance"
    ],
    "components": ["OutcomeLifecycleView"]
  },
  "contributes": {
    "views": [
      {
        "id": "outcome-lifecycle-view",
        "name": "Outcomes",
        "location": "nav",
        "icon": "🎯",
        "order": 300,
        "component": "OutcomeLifecycleView"
      }
    ]
  },
  "activationEvents": ["onStartup"]
}
```

## 10. Error Handling

| Scenario | Handling |
|----------|----------|
| No user stories exist | Create empty lifecycle with placeholder initial outcome |
| Story format non-standard | Fall back to story title as outcome title |
| Circular dependencies detected | Log warning, remove weakest edge, alert user |
| DB write failure | Retry once, then cache in memory and retry on next operation |
| Outcome analyzer finds no outcomes | Create single "Project Complete" target outcome |
| Invalid prerequisite references | Remove broken references, log warning |

## 11. Testing Strategy

**Unit tests** (`tests/plugins/outcome-lifecycle/`):
- `outcome-analyzer.test.js` — parsing various story formats, deduplication
- `lifecycle-engine.test.js` — graph building, cycle detection, available outcomes, progress calc
- `lifecycle-validator.test.js` — all validation rules
- `lifecycle-database.test.js` — CRUD operations with in-memory SQLite

**Integration tests:**
- Initialize lifecycle from sample stories → verify graph structure
- Simulate story completion → verify outcome status transitions
- IPC round-trip: renderer invoke → main handler → DB → response

## 12. Implementation Order

1. `lifecycle-validator.js` — standalone, no deps
2. `outcome-analyzer.js` — needs story format knowledge, no runtime deps
3. `lifecycle-engine.js` — graph algorithms, depends on data model only
4. `lifecycle-database.js` — depends on `better-sqlite3` connection pattern
5. `index.js` + `puffin-plugin.json` — wires everything together
6. `renderer/components/index.js` — UI, depends on IPC being available

## 13. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Story format varies widely | Medium | Fallback parsing; accept partial extraction |
| Graph layout for large outcome sets | Low | Cap at 50 outcomes per config; simple layered DAG |
| Story completion event availability | Medium | If no event bus, use polling or IPC interception |
| DB migration on existing projects | Low | `CREATE TABLE IF NOT EXISTS`; no schema conflicts |
| Re-entrant transitions complexity | Medium | Start with simple variant linking; defer full evolution tracking |
