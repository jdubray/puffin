# h-DSL Viewer Plugin

---

# Part 1 — Plugin Specification

## 1. Overview

The h-DSL Viewer Plugin provides a visual interface for exploring the h-DSL Code Model produced by the CRE bootstrap engine. It exposes three views:

1. **Schema Viewer** — Displays the h-DSL schema (`schema.json`): element types, their fields, h-M3 type annotations, and the extension log.
2. **Code Model Browser** — Navigates the h-DSL instance (`instance.json`): artifacts, dependencies, and flows with search and filtering.
3. **Annotation Browser** — Navigates `.an.md` annotation files in `cre/annotations/`, rendering markdown with prettified YAML metadata sections.

All three views read from `.puffin/cre/` and are read-only.

## 2. Goals

- G1: Let the user understand the h-DSL schema and how it maps to h-M3 primitives.
- G2: Let the user browse the code model — search artifacts by path, tag, kind; inspect children, dependencies.
- G3: Let the user navigate annotation files in a tree (mirroring the docs/ viewer UX), with markdown rendering and YAML sections prettified as tables.
- G4: Reuse existing patterns from `document-viewer-plugin` for tree navigation and markdown rendering.

## 3. Functional Requirements

### 3.1 Schema Viewer

| ID | Requirement |
|----|-------------|
| SV-01 | Display all element types defined in `schema.json` as an accordion or card list. |
| SV-02 | For each element type, show its `m3Type`, required/optional fields, field types, and enums. |
| SV-03 | Display the extension log as a timeline or table (timestamp, added types, rationale). |
| SV-04 | Show schema version and m3 version in a header. |

### 3.2 Code Model Browser

| ID | Requirement |
|----|-------------|
| CM-01 | Load `instance.json` and present artifacts in a searchable, filterable list or tree grouped by directory. |
| CM-02 | Support filtering by `kind` (module, file, test, config), by `tags`, and by free-text search on path/summary. |
| CM-03 | Selecting an artifact shows its full detail: summary, intent, exports, tags, size, children (functions/classes with signatures and line numbers). |
| CM-04 | Display dependencies where the selected artifact is `from` or `to`, with kind and weight. |
| CM-05 | Display flows that reference the selected artifact. |
| CM-06 | Show instance metadata: schemaVersion, lastUpdated, total artifact count. |

### 3.3 Annotation Browser

| ID | Requirement |
|----|-------------|
| AN-01 | Scan `cre/annotations/` recursively and present a navigable directory tree (same UX as docs/ viewer). |
| AN-02 | Selecting a `.an.md` file renders it as markdown. |
| AN-03 | Detect YAML fenced blocks and inline YAML sections (e.g., `Artifact Summary`, `Hotspots`, `Understanding`). Render them as formatted tables instead of raw text. |
| AN-04 | The blockquote header (Source, Kind, h-M3 Artifact Type) should render as a styled metadata card. |
| AN-05 | The "Structure" table (if present) renders as a proper HTML table with column headers. |
| AN-06 | Support expand/collapse for directory nodes. |
| AN-07 | Show a confidence badge from the `understanding.confidence` value when present. |

### 3.4 General

| ID | Requirement |
|----|-------------|
| GN-01 | The plugin registers a single nav-level view with sub-tabs for Schema, Code Model, and Annotations. |
| GN-02 | All data is read-only. No write operations. |
| GN-03 | Files are read from `.puffin/cre/` relative to `projectPath`. |
| GN-04 | Graceful handling when files are missing or malformed (show empty state or error message). |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NF-01 | `instance.json` can be >1 MB. Parse once on activation, cache in memory, reload on explicit refresh. |
| NF-02 | Annotation tree scan should be async and non-blocking. |
| NF-03 | YAML parsing in renderer uses a lightweight parser (e.g., `js-yaml` or simple regex-based extraction for known patterns). |
| NF-04 | Plugin must not crash Puffin if CRE data is absent or corrupt. |

---

# Part 2 — Plugin Detailed Design

## 1. Plugin Identity

```
Name:         hdsl-viewer-plugin
Display Name: h-DSL Viewer
Version:      1.0.0
Location:     nav
Icon:         🔬
Order:        60
```

## 2. Directory Structure

```
plugins/hdsl-viewer-plugin/
├── puffin-plugin.json              # Manifest
├── index.js                        # Backend: activate/deactivate, IPC handlers
├── hdsl-scanner.js                 # Backend: reads schema, instance, annotation tree
├── renderer/
│   ├── components/
│   │   └── HdslViewerComponent.js  # Main component (tab container)
│   │   └── SchemaView.js           # Schema viewer sub-component
│   │   └── CodeModelView.js        # Code model browser sub-component
│   │   └── AnnotationView.js       # Annotation browser sub-component
│   │   └── YamlTable.js            # YAML-to-table renderer utility
│   └── styles/
│       └── hdsl-viewer.css         # Styles
```

## 3. Manifest (`puffin-plugin.json`)

```json
{
  "name": "hdsl-viewer-plugin",
  "version": "1.0.0",
  "displayName": "h-DSL Viewer",
  "description": "Visualize the h-DSL schema, code model, and source annotations produced by the CRE bootstrap engine.",
  "main": "index.js",
  "extensionPoints": {
    "actions": ["getSchema", "getInstance", "getAnnotationTree", "getAnnotationContent"],
    "components": ["hdsl-viewer-view"],
    "ipcHandlers": [
      "hdsl-viewer:getSchema",
      "hdsl-viewer:getInstance",
      "hdsl-viewer:getAnnotationTree",
      "hdsl-viewer:getAnnotationContent"
    ]
  },
  "contributes": {
    "views": [
      {
        "id": "hdsl-viewer-view",
        "name": "h-DSL",
        "location": "nav",
        "icon": "🔬",
        "order": 60,
        "component": "HdslViewerComponent"
      }
    ]
  },
  "renderer": {
    "entry": "renderer/components/HdslViewerComponent.js",
    "components": [
      {
        "name": "HdslViewerComponent",
        "export": "HdslViewerComponent",
        "type": "class",
        "description": "h-DSL schema, code model, and annotation viewer"
      }
    ],
    "styles": ["renderer/styles/hdsl-viewer.css"],
    "sandbox": true
  }
}
```

## 4. Backend Design (`index.js` + `hdsl-scanner.js`)

### 4.1 IPC Handlers

| Handler | Input | Output | Description |
|---------|-------|--------|-------------|
| `hdsl-viewer:getSchema` | — | `{ schema, error? }` | Reads and returns `.puffin/cre/schema.json` |
| `hdsl-viewer:getInstance` | `{ filter? }` | `{ instance, stats, error? }` | Reads `instance.json`, optionally filters artifacts. Returns stats (counts by kind/tag). |
| `hdsl-viewer:getAnnotationTree` | — | `{ tree, error? }` | Scans `cre/annotations/` recursively, returns tree structure. |
| `hdsl-viewer:getAnnotationContent` | `{ path }` | `{ content, error? }` | Reads a single `.an.md` file. Path validated to be within `cre/annotations/`. |

### 4.2 `hdsl-scanner.js` — Key Functions

```javascript
/**
 * Read and parse the h-DSL schema.
 * @param {string} projectRoot
 * @returns {Object} Parsed schema.json
 */
async function loadSchema(projectRoot) { /* ... */ }

/**
 * Read and parse the h-DSL instance. Caches result.
 * @param {string} projectRoot
 * @returns {{ artifacts: Object, dependencies: Array, flows: Object, stats: Object }}
 */
async function loadInstance(projectRoot) { /* ... */ }

/**
 * Recursively scan annotations directory and build tree.
 * @param {string} projectRoot
 * @returns {TreeNode[]}
 */
async function scanAnnotations(projectRoot) { /* ... */ }

/**
 * Read a single annotation file with path validation.
 * @param {string} projectRoot
 * @param {string} relativePath
 * @returns {string} File content
 */
async function readAnnotation(projectRoot, relativePath) { /* ... */ }
```

**TreeNode structure** (same shape as document-viewer-plugin):

```javascript
{
  name: "src",
  path: "cre/annotations/src",
  type: "directory",
  children: [
    {
      name: "main",
      path: "cre/annotations/src/main",
      type: "directory",
      children: [
        {
          name: "puffin-state.js.an.md",
          path: "cre/annotations/src/main/puffin-state.js.an.md",
          type: "file",
          extension: ".an.md"
        }
      ]
    }
  ]
}
```

### 4.3 Instance Caching

`instance.json` is large (~1.2 MB). The scanner loads it once and caches in memory. A `refresh` action reloads from disk. The cache is keyed by `lastUpdated` from the file.

### 4.4 Instance Stats

When loading the instance, compute summary stats returned alongside data:

```javascript
{
  totalArtifacts: 142,
  byKind: { module: 80, test: 45, config: 5, flow: 12 },
  byTag: { core: 30, plugin: 25, persistence: 18, ... },
  dependencyCount: 210,
  flowCount: 8
}
```

## 5. Renderer Design

### 5.1 `HdslViewerComponent.js` — Main Container

A tabbed container with three tabs: **Schema**, **Code Model**, **Annotations**.

```
┌──────────────────────────────────────────────────┐
│  [Schema]  [Code Model]  [Annotations]    🔄     │
├──────────────────────────────────────────────────┤
│                                                  │
│         (active sub-view renders here)           │
│                                                  │
└──────────────────────────────────────────────────┘
```

State:
```javascript
{
  activeTab: "schema" | "codemodel" | "annotations",
  schema: null,
  instance: null,
  annotationTree: null
}
```

Data is loaded lazily — each tab fetches its data on first activation.

### 5.2 `SchemaView.js`

Renders `schema.json` content.

**Layout:**

```
┌──────────────────────────────────────────────────┐
│  h-DSL Schema v1.0.0  |  h-M3 v2.0              │
├──────────────────────────────────────────────────┤
│                                                  │
│  ▼ module (SLOT)                                 │
│    ┌──────────────────────────────────────────┐  │
│    │ Field       │ M3 Type │ Required │ Enum  │  │
│    ├─────────────┼─────────┼──────────┼───────┤  │
│    │ path        │ TERM    │ ✓        │       │  │
│    │ kind        │ TERM    │ ✓        │ mod…  │  │
│    │ summary     │ PROSE   │ ✓        │       │  │
│    │ intent      │ PROSE   │          │       │  │
│    │ exports     │ TERM[]  │          │       │  │
│    │ tags        │ TERM[]  │          │       │  │
│    └──────────────────────────────────────────┘  │
│                                                  │
│  ▶ function (SLOT)                               │
│  ▶ dependency (RELATION)                         │
│  ▶ flow (SLOT)                                   │
│  ▶ plugin (SLOT)                                 │
│  ...                                             │
│                                                  │
│  ── Extension Log ──                             │
│  │ 2026-02-01 │ +evaluator │ "Evaluators..."  │  │
│  │ 2026-02-01 │ +test      │ "Test specs..."  │  │
│  └────────────────────────────────────────────── │
└──────────────────────────────────────────────────┘
```

Each element type is an expandable accordion. Fields render as a table. The extension log renders as a reverse-chronological table.

### 5.3 `CodeModelView.js`

Browses `instance.json`.

**Layout:**

```
┌─────────────────────────┬────────────────────────┐
│  🔍 [search........]    │  src/main/plugins/     │
│  Kind: [All ▼]          │  index.js              │
│  Tag:  [All ▼]          │                        │
│                         │  Kind: module           │
│  ▼ src/                 │  Tags: core, plugins    │
│    ▼ main/              │  Size: 1200 bytes       │
│      ▶ plugins/         │                        │
│      ▶ cre/             │  Summary:              │
│      puffin-state.js    │  Plugin system entry   │
│    ▼ renderer/          │  point and manager.    │
│      app.js             │                        │
│  ▼ tests/               │  Intent:               │
│    validators.test.js   │  Provides isolated...  │
│                         │                        │
│                         │  ── Children ──        │
│                         │  loadPlugins() :42     │
│                         │  validatePlugin() :88  │
│                         │                        │
│                         │  ── Dependencies ──    │
│                         │  → plugin-manager (calls)│
│                         │  ← main.js (calls)     │
└─────────────────────────┴────────────────────────┘
```

Left panel: tree of artifacts grouped by directory path, with search/filter controls.
Right panel: detail view for the selected artifact.

### 5.4 `AnnotationView.js`

Navigates `.an.md` files. Same split-pane layout as the document-viewer-plugin.

**Layout:**

```
┌─────────────────────────┬────────────────────────┐
│  ▼ src/                 │  ┌────────────────────┐│
│    ▼ main/              │  │ puffin-state.js    ││
│      puffin-state.js ●  │  │ Kind: module       ││
│      plugin-loader.js   │  │ h-M3: SLOT         ││
│    ▼ renderer/          │  │ Confidence: 85%    ││
│      app.js             │  └────────────────────┘│
│  ▼ plugins/             │                        │
│    ▼ calendar/          │  ## Intent             │
│      index.js           │  Single source of...   │
│  ▼ h-dsl-engine/        │                        │
│    hdsl-bootstrap.js    │  ## Structure          │
│                         │  ┌────┬───────┬──────┐ │
│                         │  │ #  │Section│Lines │ │
│                         │  ├────┼───────┼──────┤ │
│                         │  │ 1  │Import │1-17  │ │
│                         │  │ 2  │CLI    │19-34 │ │
│                         │  └────┴───────┴──────┘ │
│                         │                        │
│                         │  ## Artifact Summary   │
│                         │  ┌──────────┬─────────┐│
│                         │  │path      │src/...  ││
│                         │  │kind      │module   ││
│                         │  │tags      │core,... ││
│                         │  └──────────┴─────────┘│
│                         │                        │
│                         │  ## Understanding      │
│                         │  ┌──────────┬─────────┐│
│                         │  │confidence│0.85     ││
│                         │  │key finds │Pure...  ││
│                         │  │gaps      │File...  ││
│                         │  └──────────┴─────────┘│
└─────────────────────────┴────────────────────────┘
```

### 5.5 `YamlTable.js` — YAML Prettification

A utility that detects and transforms YAML content within annotation markdown into HTML tables.

**Detection strategy:**

1. Fenced YAML code blocks (` ```yaml ... ``` `) — parse and render as key-value table.
2. Inline YAML-like sections (lines matching `key: value` patterns after a markdown heading) — detect contiguous YAML-like blocks and render as table.

**Rendering rules:**

| YAML Pattern | Rendered As |
|---|---|
| `key: "scalar value"` | Two-column table row: **key** | value |
| `key: [a, b, c]` | Row with comma-separated badge list |
| Nested object | Nested table or indented sub-rows |
| Array of objects (e.g., `steps`) | Multi-column table with one row per item |

**Implementation approach:**

```javascript
class YamlTable {
  /**
   * Process markdown content, replacing YAML sections with HTML tables.
   * @param {string} markdown - Raw annotation markdown
   * @returns {string} Markdown with YAML blocks replaced by HTML tables
   */
  static transform(markdown) {
    // 1. Find ```yaml ... ``` blocks
    // 2. Parse each with simple YAML parser
    // 3. Generate <table> HTML
    // 4. Replace the fenced block in the markdown string
    // 5. Detect inline YAML-like sections after known headings
    //    (Artifact Summary, Hotspots, Understanding)
    // 6. Parse and replace those too
  }

  /**
   * Render a parsed YAML object as an HTML table string.
   * @param {Object} data
   * @returns {string} HTML table
   */
  static renderAsTable(data) { /* ... */ }
}
```

### 5.6 Markdown Rendering

Use the same approach as `document-viewer-plugin`: `marked.js` for markdown-to-HTML. The pipeline is:

1. Raw `.an.md` content received from backend.
2. `YamlTable.transform(content)` — replace YAML sections with HTML tables.
3. Extract blockquote header → render as metadata card.
4. Extract `understanding.confidence` → render as badge.
5. Pass remaining markdown through `marked.js`.
6. Inject into preview panel.

## 6. Security

- Path validation: all file reads validated to be within `.puffin/cre/`.
- Read-only: no write handlers registered.
- File size guard: `instance.json` loaded with a 10 MB cap.

## 7. Error Handling

| Scenario | Behavior |
|----------|----------|
| `.puffin/cre/` missing | Show "No h-DSL data found. Run the bootstrap engine first." |
| `schema.json` malformed | Show error banner in Schema tab, other tabs unaffected. |
| `instance.json` too large / parse error | Show error banner in Code Model tab. |
| Annotation file unreadable | Show error in preview pane, tree remains navigable. |
| YAML parse failure in annotation | Fall back to rendering raw text (no table). |

## 8. Sequence: Annotation View Load

```
User clicks "Annotations" tab
  │
  ├─ HdslViewerComponent calls IPC: hdsl-viewer:getAnnotationTree
  │   └─ hdsl-scanner.scanAnnotations()
  │       └─ Recursive readdir of .puffin/cre/annotations/
  │       └─ Returns TreeNode[]
  │
  ├─ AnnotationView renders tree in left panel
  │
  ├─ User clicks a file node
  │   └─ IPC: hdsl-viewer:getAnnotationContent { path }
  │       └─ hdsl-scanner.readAnnotation()
  │       └─ Returns raw markdown string
  │
  └─ AnnotationView.renderPreview(content)
      ├─ YamlTable.transform(content)
      ├─ Extract metadata card from blockquote
      ├─ marked.js renders markdown → HTML
      └─ Inject into preview panel
```

## 9. Open Items for Iteration

- OI-01: Should the Code Model view support graph visualization of dependencies (e.g., a force-directed graph)? Deferred to v2.
- OI-02: Should clicking an artifact in Code Model cross-link to its annotation? Likely yes — add in next iteration.
- OI-03: YAML parser choice: bundle `js-yaml` or use regex-based lightweight parser? Decide during implementation.
- OI-04: Should the schema view support editing (for manual schema evolution)? Out of scope — read-only for now.
- OI-05: Should annotation confidence values aggregate into a project-level "model completeness" metric? Nice-to-have for v2.