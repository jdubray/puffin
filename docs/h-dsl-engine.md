# h-DSL Bootstrap Utility

**Purpose:** A standalone terminal tool that scans an existing project and produces a populated h-DSL schema and Code Model (instance), ready for consumption by Puffin's Central Reasoning Engine.

---

## 1. Specification

### 1.1 What It Is

A Node.js CLI tool invoked once per project. It reads the project's source code, derives an h-DSL schema, and populates a Code Model instance. Both are written to the project's `.puffin/cre/` directory.

### 1.2 Invocation

```bash
node hdsl-bootstrap.js --project /path/to/project [--exclude "pattern1,pattern2"] [--verbose]
```

| Flag | Default | Description |
|---|---|---|
| `--project` | (required) | Root directory of the target project |
| `--exclude` | `node_modules,dist,.git,coverage` | Comma-separated glob patterns to skip |
| `--verbose` | `false` | Print progress and decisions to stdout |

### 1.3 Output

```
{project}/.puffin/cre/
├── schema.json      # Derived h-DSL schema
└── instance.json    # Populated Code Model
```

If `.puffin/cre/` does not exist, it is created. If `schema.json` or `instance.json` already exist, they are overwritten (this is a bootstrap tool, not an incremental updater — the CRE's Introspector handles incremental updates).

### 1.4 Goals of the Code Model

- **Self-contained specification**: the Code Model should theoretically contain enough information to recode the project from scratch.
- **Navigation aid**: support understanding the codebase structure, locating relevant code, and planning changes.

### 1.5 Design Principles

- **Schema emerges from the code.** The tool does not start with a fixed schema. It scans the code, identifies recurring structural patterns (terms), and derives a schema that fits the project.
- **Iterative discovery.** The schema and instance are built in passes — early passes establish the skeleton, later passes refine and extend.
- **Prose fills the gaps.** Not every piece of code maps to a structured element. The h-DSL balances structure (for well-known artifacts like modules, functions, dependencies) with prose (for intent, rationale, patterns, and anything that would require over-complex structure).
- **Every schema element maps to an h-M3 primitive.** TERM, PROSE, SLOT, RELATION, STATE, TRANSITION, OUTCOME, or ALIGNMENT.
- **AI-assisted.** The tool uses Claude (via claude-service or direct CLI) to infer intent, summarize modules, and identify patterns that pure static analysis cannot capture.

### 1.6 Functional Requirements

| ID | Requirement |
|---|---|
| BR-01 | The tool SHALL scan all source files in the project (respecting exclude patterns). |
| BR-02 | The tool SHALL identify recurring terms: module names, exported symbols, file naming conventions, directory structure patterns. |
| BR-03 | The tool SHALL derive a schema from discovered terms, where each element type maps to one h-M3 primitive. |
| BR-04 | The tool SHALL populate a Code Model instance conforming to the derived schema. |
| BR-05 | The tool SHALL use AI to generate prose summaries and intent descriptions for artifacts. |
| BR-06 | The tool SHALL discover dependencies between artifacts (imports, calls, extends). |
| BR-07 | The tool SHALL identify flows (multi-step processes) where detectable from code structure. |
| BR-08 | The tool SHALL write `schema.json` and `instance.json` to `.puffin/cre/`. |
| BR-09 | The tool SHALL complete in a single run without requiring user interaction. |
| BR-10 | When new structural patterns are discovered during instance population, the tool SHALL extend the schema before continuing. |

### 1.7 Non-Functional Requirements

| ID | Requirement |
|---|---|
| BNR-01 | The tool is standalone — it does not require Puffin to be running. |
| BNR-02 | The tool requires Node.js and access to Claude CLI (for AI operations). |
| BNR-03 | The tool should handle projects up to ~500 source files without excessive runtime. |
| BNR-04 | Failures in AI calls should degrade gracefully — the artifact is recorded with a minimal summary rather than skipped entirely. |

---

## 2. Detailed Design

### 2.1 Architecture

The tool runs as a single-process pipeline with four sequential phases:

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│  Phase 1   │───→│  Phase 2   │───→│  Phase 3   │───→│  Phase 4   │
│  DISCOVER  │    │  DERIVE    │    │  POPULATE  │    │  EMIT      │
│            │    │  SCHEMA    │    │  INSTANCE  │    │            │
│ Scan files │    │ Identify   │    │ Build code │    │ Write JSON │
│ Parse ASTs │    │ patterns → │    │ model,     │    │ files      │
│ Collect    │    │ create     │    │ extend     │    │            │
│ raw terms  │    │ schema v1  │    │ schema as  │    │            │
│            │    │            │    │ needed     │    │            │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
```

### 2.2 Phase 1: DISCOVER

**Goal:** Collect raw structural information from the codebase.

**Input:** Project root path, exclude patterns.

**Process:**

1. **Walk the file tree.** Enumerate all source files (`.js`, `.ts`, `.jsx`, `.tsx`, `.json`, `.html`, `.css`, `.md`, etc.). Record directory structure.
2. **Parse source files.** For JS/TS files, use a lightweight AST parser (e.g., `@babel/parser` or `acorn`) to extract:
   - Module-level exports (named, default)
   - Class declarations and their methods
   - Function declarations
   - Import statements (what is imported, from where)
   - Top-level constants and configuration objects
3. **Collect raw terms.** Build a frequency table of:
   - Directory names and their nesting patterns
   - File naming conventions (kebab-case, camelCase, index files)
   - Exported symbol names
   - Import sources (which modules are most imported)
   - Recurring patterns in class/function names (e.g., `*Manager`, `*Plugin`, `*Handler`)

**Output:** A `DiscoveryResult` object:

```javascript
/**
 * @typedef {Object} DiscoveryResult
 * @property {FileInfo[]} files - All discovered source files
 * @property {Map<string, number>} termFrequency - Symbol/name → occurrence count
 * @property {ImportGraph} importGraph - File → imported files mapping
 * @property {DirectoryTree} dirTree - Nested directory structure
 * @property {RawArtifact[]} rawArtifacts - Parsed exports, classes, functions per file
 */
```

### 2.3 Phase 2: DERIVE SCHEMA

**Goal:** From raw terms and patterns, derive the initial h-DSL schema.

**Process:**

1. **Identify element archetypes.** Group raw artifacts by structural similarity:
   - Files that export a single class → `class` element type
   - Files that export functions → `module` element type
   - Config/JSON files → `config` element type
   - Test files → `test` element type
   - Files with naming patterns like `*-handler`, `*-plugin` → potential domain-specific types

2. **AI-assisted pattern recognition.** Send a summary of the top-N most frequent terms and structural patterns to Claude with the prompt:
   > "Given these recurring terms and patterns from a codebase, identify the key structural concepts. For each concept, suggest a schema element type name and whether it maps to SLOT or RELATION in h-M3."

3. **Build schema v1.** Start with the base element types from Puffin's CRE schema (module, function, dependency, flow) and extend with project-specific types discovered above. Each element type gets:
   - A name
   - An h-M3 type annotation (SLOT for artifacts, RELATION for connections)
   - A set of fields, each annotated as TERM (structured) or PROSE (natural language)

4. **Keep it simple.** The schema should have 4–8 element types maximum. Over-specialization is avoided — prose fields absorb what structure cannot.

**Output:** `schema.json` (draft v1)

```javascript
/**
 * Schema v1 structure (extends base CRE schema)
 * {
 *   version: "1.0.0",
 *   m3Version: "2.0",
 *   elementTypes: { ... },
 *   extensionLog: []
 * }
 */
```

### 2.4 Phase 3: POPULATE INSTANCE

**Goal:** Walk the codebase again, this time creating Code Model entries conforming to the schema. Extend the schema when needed.

**Process:**

This phase operates in batches to manage AI call volume:

1. **Batch by directory.** Group files by top-level directory (e.g., `src/main/`, `src/renderer/`, `tests/`). Each directory becomes a processing unit.

2. **For each batch:**

   a. **Create artifact entries.** For each file, create a Code Model artifact with structured fields (path, kind, exports, tags) filled from the discovery data.

   b. **AI-generate prose fields.** Send file contents (or summaries for large files) to Claude:
   > "Summarize this module in one sentence (summary). Then describe its purpose, responsibilities, and key design decisions in a short paragraph (intent)."

   c. **Record dependencies.** From the import graph, create dependency entries (RELATION) between artifacts.

   d. **Detect schema gaps.** If the batch contains artifacts that don't fit existing element types (e.g., a middleware chain, a state machine, a DSL definition), propose a schema extension:
      - Log the gap
      - Create a `SchemaExtension` with the new element type
      - Append to schema
      - Continue populating with the extended schema

   e. **Detect flows.** Look for multi-step processes: event handler chains, middleware pipelines, lifecycle hooks. Create flow entries with ordered steps.

3. **Cross-reference pass.** After all batches, resolve cross-batch dependencies and ensure all `from`/`to` references in dependencies point to existing artifacts.

4. **Prose coverage pass.** For artifacts with only structured data (no summary/intent), generate prose. For areas of the codebase that resist structured modeling (complex conditionals, framework glue, configuration logic), create prose-heavy entries that describe behavior narratively.

**Schema Extension During Population:**

```javascript
// When a new pattern is found that doesn't fit existing types:
const extension = {
  name: "middleware",
  m3Type: "SLOT",
  fields: {
    path: { m3Type: "TERM", required: true },
    order: { m3Type: "TERM", required: false },
    summary: { m3Type: "PROSE", required: true },
    appliesTo: { m3Type: "TERM", array: true }
  },
  rationale: "Project uses Express-style middleware chain pattern in 12 files"
};
schema.extensionLog.push({ timestamp: new Date(), extension });
schema.elementTypes[extension.name] = extension;
```

**Output:** `instance.json` (populated), `schema.json` (potentially extended)

### 2.5 Phase 4: EMIT

**Goal:** Write final outputs to disk.

**Process:**

1. Validate `instance.json` against `schema.json` — every artifact must reference a known element type, every dependency must reference existing artifacts.
2. Compute summary statistics (artifact count by type, dependency count, prose coverage percentage).
3. Write `schema.json` and `instance.json` to `.puffin/cre/`.
4. Print summary to stdout.

**Console Output Example:**

```
h-DSL Bootstrap Complete
========================
Project: /path/to/project
Files scanned: 147
Schema element types: 6 (module, function, class, dependency, flow, config)
Schema extensions: 1 (middleware)
Artifacts: 89
Dependencies: 203
Flows: 4
Prose coverage: 92%
Output: /path/to/project/.puffin/cre/schema.json
         /path/to/project/.puffin/cre/instance.json
```

### 2.6 Module Structure

```
tools/hdsl-bootstrap/
├── hdsl-bootstrap.js        # CLI entry point (argument parsing, phase orchestration)
├── lib/
│   ├── discoverer.js        # Phase 1: file walking, AST parsing, term collection
│   ├── schema-deriver.js    # Phase 2: pattern analysis, schema generation
│   ├── populator.js         # Phase 3: instance building, AI prose, schema extension
│   ├── emitter.js           # Phase 4: validation, writing, summary
│   ├── ai-client.js         # Wrapper for Claude CLI invocation
│   ├── ast-utils.js         # AST parsing helpers (exports, imports, classes)
│   └── hdsl-types.js        # Shared type definitions (copied from Puffin CRE)
└── package.json             # Minimal dependencies (acorn, glob, commander)
```

### 2.7 AI Integration

The bootstrap tool makes AI calls at three points:

| Call | Phase | h-M3 Operation | Input | Output |
|---|---|---|---|---|
| Pattern recognition | 2 (DERIVE) | DERIVE | Term frequency table, structural patterns | Suggested element types |
| Prose generation | 3 (POPULATE) | GROUND | File contents or summary | Summary + intent strings |
| Schema gap analysis | 3 (POPULATE) | DERIVE | Artifacts that don't fit schema | Schema extension proposals |

**AI Client:**

The tool invokes Claude through the CLI directly (not through Puffin's claude-service, since Puffin may not be running):

```javascript
const { execSync } = require('child_process');

async function aiQuery(systemPrompt, userPrompt) {
  // Use claude CLI directly
  const result = execSync(
    `claude -p "${escaped(userPrompt)}" --system "${escaped(systemPrompt)}"`,
    { maxBuffer: 1024 * 1024, encoding: 'utf-8' }
  );
  return result.trim();
}
```

For batched prose generation, files are grouped to minimize the number of AI calls — e.g., sending 5–10 small files per call with instructions to return a JSON array of summaries.

### 2.8 Balancing Structure and Prose

The Code Model uses a tiered approach:

| Tier | What | Representation | Example |
|---|---|---|---|
| **Tier 1: Structured** | Well-known artifacts | Full schema fields (TERM) | Module path, exports, function signatures |
| **Tier 2: Hybrid** | Artifacts with behavioral nuance | Schema fields + prose (TERM + PROSE) | A class with a `summary` field (TERM: name, path) and an `intent` field (PROSE: design rationale) |
| **Tier 3: Prose-dominant** | Complex or cross-cutting concerns | Minimal structure + rich prose | Framework glue code described as a narrative with only `path` and `tags` as structured fields |

The goal is ~30% pure structure, ~50% hybrid, ~20% prose-dominant. This ensures navigability (structure) without forcing every line of code into a rigid model (prose absorbs complexity).

### 2.9 Instance JSON Structure

```json
{
  "schemaVersion": "1.0.0",
  "bootstrapDate": "2026-02-01T00:00:00Z",
  "projectRoot": "/path/to/project",
  "stats": {
    "filesScanned": 147,
    "artifactCount": 89,
    "dependencyCount": 203,
    "flowCount": 4,
    "proseCoverage": 0.92
  },
  "artifacts": {
    "src/main/index.js": {
      "type": "module",
      "path": "src/main/index.js",
      "kind": "file",
      "summary": "Application entry point, initializes Electron and plugin system",
      "intent": "Bootstraps the main process: creates the BrowserWindow, registers IPC handlers, loads plugins, and manages the application lifecycle. Uses a sequential initialization pattern to ensure dependencies are ready before dependent systems start.",
      "exports": ["app"],
      "tags": ["core", "entry-point", "lifecycle"]
    }
  },
  "dependencies": [
    {
      "from": "src/main/index.js",
      "to": "src/main/plugin-loader.js",
      "kind": "imports",
      "weight": "critical",
      "intent": "Entry point loads and initializes the plugin system at startup"
    }
  ],
  "flows": {
    "app-startup": {
      "name": "app-startup",
      "summary": "Application initialization from launch to ready state",
      "steps": [
        { "order": 1, "artifact": "src/main/index.js", "intent": "Create BrowserWindow and register core IPC" },
        { "order": 2, "artifact": "src/main/plugin-loader.js", "intent": "Discover and validate plugins" },
        { "order": 3, "artifact": "src/main/plugin-manager.js", "intent": "Activate plugins in dependency order" }
      ],
      "tags": ["lifecycle", "startup"]
    }
  }
}
```

### 2.10 Error Handling

| Failure | Behavior |
|---|---|
| File cannot be parsed (syntax error) | Log warning, record artifact with path and `summary: "Parse error — manual review needed"` |
| AI call fails | Retry once. If still fails, record artifact with structured fields only, `summary: "AI summary unavailable"` |
| AI returns malformed output | Use structured fields only, log warning |
| Project has no recognizable source files | Exit with error message |
| `.puffin/cre/` cannot be created | Exit with error message |

### 2.11 Dependencies

```json
{
  "name": "hdsl-bootstrap",
  "version": "0.1.0",
  "dependencies": {
    "acorn": "^8.0.0",
    "acorn-walk": "^8.0.0",
    "glob": "^10.0.0",
    "commander": "^12.0.0"
  }
}
```

No Puffin runtime dependency. The tool copies `hdsl-types.js` from Puffin's CRE to maintain type compatibility.