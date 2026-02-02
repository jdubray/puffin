# Expanding the h-DSL Engine CLI

**Status:** First Pass / Draft
**Current CLI:** `hdsl-bootstrap.js` — single-command bootstrap tool
**Goal:** Evolve from a one-shot bootstrap into an interactive query tool that Claude Code (and humans) can use to navigate the Code Model.

---

## 1. Research: How Claude Tools Explore Code

Claude Code has five primary exploration tools:

| Tool | Input | Returns | Limitation |
|------|-------|---------|------------|
| **Glob** | Glob pattern, optional dir | File paths sorted by mtime | Names only, no content |
| **Grep** | Regex, optional glob/type filter | File paths, matching lines, or counts | Text-level, no semantic understanding |
| **Read** | Absolute file path, optional offset/limit | File contents with line numbers (max 2000 lines) | One file at a time, no cross-file view |
| **Bash** | Shell command | stdout/stderr | Stateless between calls |
| **Task(Explore)** | Natural language question | Synthesized answer | Multiple rounds of Glob+Grep+Read internally |

### What Claude Needs But Doesn't Have

1. **Dependency graphs** — Claude must Grep for `require`/`import` and manually trace chains. An h-DSL CLI could return the dependency subgraph instantly.
2. **Semantic search** — Grep finds text, not meaning. The Code Model has `summary` and `intent` prose fields that enable semantic lookup.
3. **Artifact metadata** — To decide *which* file to Read, Claude needs summaries, tags, sizes, and export lists. Currently it must Read each file to discover this.
4. **Cross-file flows** — Understanding multi-step processes (e.g., app startup) requires reading many files. The Code Model has pre-traced `flows`.
5. **Scoped context** — For RIS generation and planning, Claude needs "everything relevant to X" — a task-oriented query the Code Model is designed to answer.

### Optimal Output Formats for Claude

- **JSON** for structured data (artifact records, dependency lists) — Claude parses this natively
- **YAML** for human-readable summaries with mixed structure+prose
- **Markdown** for annotation files (already implemented via `--annotate`)
- **Compact one-line-per-result** for piping into other tools

---

## 2. Current State: The h-DSL Instance (`.puffin/cre/`)

The bootstrap tool already produces:

```
.puffin/cre/
├── schema.json          # Element types: module, function, class, test, dependency, flow, config
├── instance.json        # All artifacts, dependencies, flows with prose
├── memo.json            # Cached navigation results
├── plans/               # Sprint plan documents
│   └── {sprintId}.json
└── annotations/         # Per-file .an.md annotation files
    ├── src/main/*.an.md
    ├── src/renderer/*.an.md
    ├── h-dsl-engine/*.an.md
    └── tests/*.an.md
```

### Instance Structure

Each artifact in `instance.json` contains:

```json
{
  "type": "module|test|config",
  "path": "src/main/main.js",
  "kind": "module",
  "summary": "One-sentence description (PROSE)",
  "intent": "Paragraph describing purpose and design (PROSE)",
  "exports": ["symbolA", "symbolB"],
  "tags": ["core", "lifecycle"],
  "size": 500,
  "children": [
    {
      "name": "functionName",
      "kind": "function",
      "signature": "async functionName(param) → ReturnType",
      "line": 42,
      "endLine": 67,
      "params": ["param"],
      "summary": "...",
      "intent": "..."
    }
  ]
}
```

Dependencies are stored as a flat array of `{ from, to, kind, weight, intent }` relations.

Flows are stored as named objects with ordered steps and tags.

---

## 3. Proposed CLI Expansion

### 3.1 Command Structure

Transition from single-command to subcommand architecture:

```bash
hdsl <command> [options]
```

| Command | Purpose | Primary Consumer |
|---------|---------|------------------|
| `bootstrap` | (existing) Full scan and populate | Human, one-time |
| `query` | Find artifacts by natural language task description | Claude (Task/Explore) |
| `peek` | Get summary of a specific artifact | Claude (Read alternative) |
| `focus` | Get full artifact details including children | Claude (Read alternative) |
| `trace` | Follow dependency chains | Claude (dependency tracing) |
| `search` | Search artifacts by tag, kind, name pattern, or prose | Claude (Grep alternative) |
| `deps` | List dependencies to/from an artifact | Claude (Grep alternative) |
| `stats` | Codebase statistics and coverage | Human, Claude |
| `diff` | Compare current code to model, find drift | Human, CI |
| `serve` | Start HTTP/stdio server for programmatic access | Claude MCP, Puffin UI |

### 3.2 Command Details

#### `hdsl peek <path>`

Return artifact summary without loading children or dependencies.

```bash
hdsl peek src/main/plugin-loader.js
hdsl peek src/main/plugin-loader.js --format json
```

**Output (default YAML):**
```yaml
path: src/main/plugin-loader.js
kind: module
summary: Discovers and loads plugins from the plugins directory
tags: [core, plugins, lifecycle]
exports: [loadPlugins, validatePlugin]
size: 1200
dep_count: 5
```

**Output (JSON):** The raw artifact object from `instance.json`.

#### `hdsl focus <path>`

Return full artifact with children, dependencies, and related flows.

```bash
hdsl focus src/main/plugin-loader.js
hdsl focus src/main/plugin-loader.js --include deps,flows,children
```

#### `hdsl trace <path> [options]`

Follow dependency chains from a starting artifact.

```bash
hdsl trace src/main/main.js --direction forward --kind imports --depth 2
hdsl trace src/main/plugin-loader.js --direction backward --depth 1
hdsl trace src/main/main.js --direction both --kind calls --format json
```

**Options:**
- `--direction forward|backward|both` (default: `forward`)
- `--kind imports|calls|extends|implements|configures|tests|all` (default: `all`)
- `--depth <n>` (default: `1`)
- `--format json|yaml|tree` (default: `tree`)

**Output (tree):**
```
src/main/main.js
├── imports → src/main/plugin-loader.js [critical]
│   ├── imports → src/main/plugin-manager.js [critical]
│   └── imports → src/shared/constants.js [normal]
├── imports → src/main/ipc-handlers.js [critical]
└── imports → src/main/claude-service.js [normal]
```

#### `hdsl search [options]`

Search the Code Model (not source files — that's what Grep is for).

```bash
hdsl search --tag core,lifecycle
hdsl search --kind function --name "*activate*"
hdsl search --prose "plugin" --format json
hdsl search --exports "loadPlugins"
```

**Options:**
- `--tag <tags>` — Filter by tags (comma-separated, AND logic)
- `--kind <kind>` — Filter by artifact kind
- `--name <pattern>` — Glob pattern against artifact path or name
- `--prose <text>` — Substring search in summary and intent fields
- `--exports <symbol>` — Find artifacts exporting a symbol
- `--has-children` — Only artifacts with children
- `--format json|yaml|paths|table` (default: `table`)

#### `hdsl deps <path>`

List all dependencies involving an artifact.

```bash
hdsl deps src/main/plugin-loader.js
hdsl deps src/main/plugin-loader.js --direction incoming --kind imports
```

**Options:**
- `--direction incoming|outgoing|both` (default: `both`)
- `--kind <kind>` — Filter by dependency kind
- `--weight critical|normal|weak` — Filter by weight
- `--format json|yaml|table` (default: `table`)

#### `hdsl query <task>`

Natural language query against the Code Model. Implements the h-DSL ORIENT → FILTER → EXPLORE protocol.

```bash
hdsl query "How does plugin activation work?"
hdsl query "What files handle IPC?" --max-results 10
hdsl query "Where are user stories persisted?" --format json
```

This is the most AI-intensive command. It uses the Code Model's prose fields + dependency graph + flows to find relevant artifacts for a task. Could be implemented as:
- Pure local search (tag/prose matching + dependency expansion) for v1
- AI-assisted relevance ranking for v2

#### `hdsl stats`

Codebase statistics from the Code Model.

```bash
hdsl stats
hdsl stats --format json
```

**Output:**
```
Artifacts: 89 (47 modules, 12 tests, 8 configs, 22 other)
Dependencies: 203 (45 critical, 120 normal, 38 weak)
Flows: 4
Prose coverage: 92%
Top tags: core(23), lifecycle(15), plugins(12), ipc(9)
Most connected: src/main/main.js (14 deps)
Orphans: 3 artifacts with no dependencies
```

#### `hdsl diff [options]`

Compare the Code Model against the actual codebase to detect drift.

```bash
hdsl diff
hdsl diff --since HEAD~5
hdsl diff --format json
```

**Output:**
```
New files not in model: 3
  src/main/new-feature.js
  src/renderer/components/new-widget.js
  tests/new-feature.test.js
Deleted files still in model: 1
  src/main/old-handler.js
Modified files (size drift >20%): 2
  src/main/ipc-handlers.js (model: 800 lines, actual: 1200 lines)
```

#### `hdsl serve [options]`

Start a lightweight server for programmatic access (future: MCP integration).

```bash
hdsl serve --port 3100
hdsl serve --stdio  # For Claude MCP tool protocol
```

### 3.3 Global Options

Available on all commands:

- `--project <path>` — Project root (default: cwd)
- `--model <path>` — Path to instance.json (default: `<project>/.puffin/cre/instance.json`)
- `--format json|yaml|table|tree|paths` — Output format
- `--quiet` — Suppress non-data output

---

## 4. Implementation Approach

### Phase 1: Core Query Commands

Add `peek`, `focus`, `search`, `deps`, `stats` — these are pure reads against `instance.json` with no AI needed.

### Phase 2: Graph Traversal

Add `trace` and `diff` — requires building an in-memory dependency graph and walking it.

### Phase 3: Semantic Query

Add `query` with local prose matching first, then optionally AI-ranked results.

### Phase 4: Server Mode

Add `serve` with stdio transport for MCP tool integration.

### Refactoring Required

The current `hdsl-bootstrap.js` uses a single `Command` with `.action(run)`. To support subcommands:

1. Rename the existing bootstrap action to a `bootstrap` subcommand
2. Add a shared `loadModel(opts)` function that reads `instance.json` + `schema.json`
3. Each new command gets its own module in `lib/commands/`
4. Move to:

```
h-dsl-engine/
├── hdsl.js                  # New entry point with subcommands
├── hdsl-bootstrap.js        # Keep for backward compat, delegates to hdsl bootstrap
├── lib/
│   ├── commands/
│   │   ├── bootstrap.js     # Existing pipeline, extracted
│   │   ├── peek.js
│   │   ├── focus.js
│   │   ├── search.js
│   │   ├── trace.js
│   │   ├── deps.js
│   │   ├── stats.js
│   │   ├── diff.js
│   │   ├── query.js
│   │   └── serve.js
│   ├── model-loader.js      # Shared instance.json loading + indexing
│   ├── graph.js             # In-memory dependency graph
│   ├── formatters.js        # json, yaml, table, tree, paths output
│   ├── discoverer.js        # (existing)
│   ├── schema-deriver.js    # (existing)
│   ├── populator.js         # (existing)
│   ├── emitter.js           # (existing)
│   ├── annotation-emitter.js # (existing)
│   ├── ai-client.js         # (existing)
│   ├── ast-utils.js         # (existing)
│   ├── config.js            # (existing)
│   └── hdsl-types.js        # (existing)
└── package.json
```

---

## 5. Example: Claude Using the Expanded CLI

Scenario: Claude needs to implement a feature touching the plugin system.

```bash
# Step 1: Find relevant artifacts (replaces multiple Grep calls)
$ hdsl search --tag plugins --format json
[{"path":"src/main/plugin-loader.js","summary":"..."},
 {"path":"src/main/plugin-manager.js","summary":"..."},
 ...]

# Step 2: Understand dependencies (replaces manual import tracing)
$ hdsl trace src/main/plugin-loader.js --direction both --depth 2 --format json
{"root":"src/main/plugin-loader.js","forward":[...],"backward":[...]}

# Step 3: Get full context for the file it needs to modify
$ hdsl focus src/main/plugin-loader.js --format json
{"path":"...","children":[...],"deps":[...],"flows":[...]}

# Step 4: Check if the change would affect a known flow
$ hdsl search --kind flow --prose "plugin" --format json
[{"name":"plugin-activation","steps":[...]}]
```

This replaces ~10-15 individual Glob/Grep/Read calls with 4 targeted queries.

---

## 6. Decisions and Deferrals

| Item | Decision |
|------|----------|
| Backward compatibility (`hdsl-bootstrap.js`) | **Removed.** The old entry point is deleted. Use `hdsl bootstrap` instead. |
| Caching/indexing for large models | **Deferred.** Current instance has ~100 artifacts; in-memory loading is sufficient. Revisit if instance exceeds ~1000 artifacts. |
| `--watch` mode for `diff` | **Deferred.** CI integration via `hdsl diff` is batch-only for now. |

---

## 7. JSON Output Schemas

All commands that support `--format json` return objects conforming to these schemas.

### 7.1 `hdsl peek` Response

```json
{
  "path": "src/main/plugin-loader.js",
  "kind": "module",
  "summary": "Discovers and loads plugins from the plugins directory",
  "tags": ["core", "plugins", "lifecycle"],
  "exports": ["loadPlugins", "validatePlugin"],
  "size": 1200,
  "depCount": 5
}
```

**Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | yes | Artifact path |
| `kind` | string | yes | `module \| function \| class \| test \| config \| flow` |
| `summary` | string | yes | One-sentence description |
| `tags` | string[] | yes | Classification tags |
| `exports` | string[] | no | Exported symbols (modules only) |
| `size` | number | no | Line count |
| `depCount` | number | yes | Total dependency count (incoming + outgoing) |

### 7.2 `hdsl focus` Response

```json
{
  "path": "src/main/plugin-loader.js",
  "kind": "module",
  "summary": "Discovers and loads plugins from the plugins directory",
  "intent": "Scans the plugins directory, validates each plugin manifest...",
  "tags": ["core", "plugins", "lifecycle"],
  "exports": ["loadPlugins", "validatePlugin"],
  "size": 1200,
  "children": [
    {
      "name": "loadPlugins",
      "kind": "function",
      "signature": "async loadPlugins(pluginsDir) → Plugin[]",
      "line": 15,
      "endLine": 48,
      "params": ["pluginsDir"],
      "summary": "Scans directory and returns validated plugin objects",
      "intent": "..."
    }
  ],
  "dependencies": [
    { "from": "src/main/plugin-loader.js", "to": "src/main/plugin-manager.js", "kind": "imports", "weight": "critical", "intent": "..." }
  ],
  "flows": [
    { "name": "plugin-activation", "summary": "Plugin discovery through activation" }
  ]
}
```

**Schema:** Extends `peek` with:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intent` | string | no | Multi-sentence purpose description |
| `children` | Child[] | no | Nested functions/classes |
| `dependencies` | Dependency[] | yes | All deps involving this artifact |
| `flows` | FlowRef[] | no | Flows that reference this artifact |

**Child schema:**

| Field | Type | Required |
|-------|------|----------|
| `name` | string | yes |
| `kind` | string | yes |
| `signature` | string | no |
| `line` | number | no |
| `endLine` | number | no |
| `params` | string[] | no |
| `summary` | string | yes |
| `intent` | string | no |

### 7.3 `hdsl trace` Response

```json
{
  "root": "src/main/main.js",
  "direction": "forward",
  "kind": "imports",
  "depth": 2,
  "nodes": [
    { "path": "src/main/main.js", "depth": 0 },
    { "path": "src/main/plugin-loader.js", "depth": 1, "edgeKind": "imports", "edgeWeight": "critical" },
    { "path": "src/main/plugin-manager.js", "depth": 2, "edgeKind": "imports", "edgeWeight": "critical" },
    { "path": "src/shared/constants.js", "depth": 2, "edgeKind": "imports", "edgeWeight": "normal" }
  ],
  "edges": [
    { "from": "src/main/main.js", "to": "src/main/plugin-loader.js", "kind": "imports", "weight": "critical" },
    { "from": "src/main/plugin-loader.js", "to": "src/main/plugin-manager.js", "kind": "imports", "weight": "critical" },
    { "from": "src/main/plugin-loader.js", "to": "src/shared/constants.js", "kind": "imports", "weight": "normal" }
  ]
}
```

**Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `root` | string | Starting artifact path |
| `direction` | string | `forward \| backward \| both` |
| `kind` | string | Dependency kind filter applied |
| `depth` | number | Max depth traversed |
| `nodes` | TraceNode[] | All artifacts in the subgraph |
| `edges` | Dependency[] | All edges in the subgraph |

**TraceNode:** `{ path, depth, edgeKind?, edgeWeight? }` — `edgeKind`/`edgeWeight` describe the edge from parent to this node (absent for root).

### 7.4 `hdsl search` Response

```json
{
  "query": { "tag": ["core", "lifecycle"], "kind": null, "name": null, "prose": null },
  "results": [
    { "path": "src/main/plugin-loader.js", "kind": "module", "summary": "...", "tags": ["core", "plugins", "lifecycle"], "matchReason": "tags: core, lifecycle" },
    { "path": "src/main/main.js", "kind": "module", "summary": "...", "tags": ["core", "lifecycle", "entry-point"], "matchReason": "tags: core, lifecycle" }
  ],
  "totalResults": 2
}
```

**Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `query` | object | Echo of the filter criteria applied |
| `results` | SearchResult[] | Matching artifacts |
| `totalResults` | number | Count |

**SearchResult:** `{ path, kind, summary, tags, matchReason }` — `matchReason` is a human-readable string explaining why this artifact matched.

### 7.5 `hdsl deps` Response

```json
{
  "artifact": "src/main/plugin-loader.js",
  "incoming": [
    { "from": "src/main/main.js", "kind": "imports", "weight": "critical", "intent": "..." }
  ],
  "outgoing": [
    { "to": "src/main/plugin-manager.js", "kind": "imports", "weight": "critical", "intent": "..." }
  ],
  "totalIncoming": 1,
  "totalOutgoing": 1
}
```

### 7.6 `hdsl stats` Response

```json
{
  "artifacts": {
    "total": 89,
    "byKind": { "module": 47, "test": 12, "config": 8, "function": 22 }
  },
  "dependencies": {
    "total": 203,
    "byWeight": { "critical": 45, "normal": 120, "weak": 38 }
  },
  "flows": 4,
  "proseCoverage": 0.92,
  "topTags": [
    { "tag": "core", "count": 23 },
    { "tag": "lifecycle", "count": 15 },
    { "tag": "plugins", "count": 12 }
  ],
  "mostConnected": [
    { "path": "src/main/main.js", "depCount": 14 }
  ],
  "orphans": [
    { "path": "src/utils/unused.js" }
  ]
}
```

### 7.7 `hdsl diff` Response

```json
{
  "newFiles": ["src/main/new-feature.js", "tests/new-feature.test.js"],
  "deletedFiles": ["src/main/old-handler.js"],
  "driftedFiles": [
    { "path": "src/main/ipc-handlers.js", "modelSize": 800, "actualSize": 1200, "driftPercent": 50 }
  ],
  "summary": { "new": 2, "deleted": 1, "drifted": 1 }
}
```

### 7.8 `hdsl query` Response

```json
{
  "task": "How does plugin activation work?",
  "mode": "local",
  "results": [
    { "path": "src/main/plugin-loader.js", "kind": "module", "summary": "...", "relevance": 0.9 },
    { "path": "src/main/plugin-manager.js", "kind": "module", "summary": "...", "relevance": 0.85 }
  ],
  "flows": [
    { "name": "plugin-activation", "summary": "Plugin discovery through activation" }
  ],
  "totalResults": 2
}
```

---

## 8. Query Modes

`hdsl query` supports two modes, selected via `--mode local|ai` (default: `local`).

### 8.1 Local Mode (`--mode local`)

Pure in-process matching against the Code Model. No AI calls.

**Algorithm:**

1. **Tokenize** the task string into keywords (strip stop words).
2. **Score each artifact** by matching keywords against:
   - `tags` — exact match scores 1.0 per tag
   - `summary` — substring match scores 0.7
   - `intent` — substring match scores 0.5
   - `exports` — exact match scores 0.8
   - `path` segments — substring match scores 0.3
3. **Expand via dependencies** — artifacts connected to high-scoring hits receive a bonus (0.3 × parent score, decaying per hop, max 2 hops).
4. **Match flows** — score flow names and step intents against keywords.
5. **Rank** by total score, return top N (default 10, configurable via `--max-results`).

**Characteristics:** Fast (<100ms), deterministic, no external dependencies. Good for keyword-oriented queries.

### 8.2 AI-Assisted Mode (`--mode ai`)

Uses Claude to interpret the task and assess artifact relevance.

**Algorithm:**

1. **Pre-filter** using local mode to select top 30 candidate artifacts (avoids sending the entire model to AI).
2. **Send to Claude** with a structured prompt:
   ```
   Task: {task}
   Candidates: {array of { path, kind, summary, tags } for top 30}
   Flows: {all flow summaries}
   
   Rank the candidates by relevance to the task. Return a JSON array of
   { path, relevance (0-1), reason } for the top 10 most relevant.
   Include any flows that are relevant.
   ```
3. **Parse response** and return structured results.

**Characteristics:** Higher quality for natural-language and intent-based queries. Requires Claude CLI access. Latency depends on AI response time.

**CLI usage:**

```bash
hdsl query "How does plugin activation work?"              # local mode (default)
hdsl query "How does plugin activation work?" --mode ai     # AI-assisted
hdsl query "What handles IPC?" --mode local --max-results 5
```

---

## 9. MCP Serve Protocol

`hdsl serve --stdio` exposes the CLI commands as an MCP (Model Context Protocol) tool server over stdin/stdout using JSON-RPC 2.0.

### 9.1 Transport

- **stdio**: Reads JSON-RPC messages from stdin (one per line), writes responses to stdout (one per line). This is the standard MCP stdio transport.
- `hdsl serve --port <n>` is reserved for future HTTP/SSE transport but not implemented in Phase 4.

### 9.2 MCP Tool Definitions

The server advertises the following tools via the `tools/list` method:

```json
{
  "tools": [
    {
      "name": "hdsl_peek",
      "description": "Get a summary of a code artifact (module, function, class) without loading full details.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string", "description": "Artifact path (e.g. src/main/plugin-loader.js)" }
        },
        "required": ["path"]
      }
    },
    {
      "name": "hdsl_focus",
      "description": "Get full artifact details including children, dependencies, and related flows.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "include": { "type": "array", "items": { "type": "string", "enum": ["deps", "flows", "children"] }, "description": "Sections to include (default: all)" }
        },
        "required": ["path"]
      }
    },
    {
      "name": "hdsl_trace",
      "description": "Follow dependency chains from a starting artifact.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "direction": { "type": "string", "enum": ["forward", "backward", "both"], "default": "forward" },
          "kind": { "type": "string", "enum": ["imports", "calls", "extends", "implements", "configures", "tests", "all"], "default": "all" },
          "depth": { "type": "number", "default": 1 }
        },
        "required": ["path"]
      }
    },
    {
      "name": "hdsl_search",
      "description": "Search the Code Model by tag, kind, name pattern, prose content, or exported symbols.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "tag": { "type": "array", "items": { "type": "string" }, "description": "Filter by tags (AND logic)" },
          "kind": { "type": "string" },
          "name": { "type": "string", "description": "Glob pattern against artifact path or name" },
          "prose": { "type": "string", "description": "Substring search in summary and intent" },
          "exports": { "type": "string", "description": "Find artifacts exporting this symbol" },
          "hasChildren": { "type": "boolean" }
        }
      }
    },
    {
      "name": "hdsl_deps",
      "description": "List all dependencies involving an artifact.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "direction": { "type": "string", "enum": ["incoming", "outgoing", "both"], "default": "both" },
          "kind": { "type": "string" },
          "weight": { "type": "string", "enum": ["critical", "normal", "weak"] }
        },
        "required": ["path"]
      }
    },
    {
      "name": "hdsl_query",
      "description": "Natural language query against the Code Model. Returns relevant artifacts and flows.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "task": { "type": "string", "description": "Natural language task or question" },
          "mode": { "type": "string", "enum": ["local", "ai"], "default": "local" },
          "maxResults": { "type": "number", "default": 10 }
        },
        "required": ["task"]
      }
    },
    {
      "name": "hdsl_stats",
      "description": "Codebase statistics from the Code Model.",
      "inputSchema": { "type": "object", "properties": {} }
    },
    {
      "name": "hdsl_diff",
      "description": "Compare the Code Model against the actual codebase to detect drift.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "since": { "type": "string", "description": "Git ref to compare from (e.g. HEAD~5)" }
        }
      }
    }
  ]
}
```

### 9.3 Example MCP Exchange

```
→ {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{}}}
← {"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"hdsl","version":"0.1.0"},"capabilities":{"tools":{}}}}

→ {"jsonrpc":"2.0","id":2,"method":"tools/list"}
← {"jsonrpc":"2.0","id":2,"result":{"tools":[...]}}

→ {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"hdsl_peek","arguments":{"path":"src/main/plugin-loader.js"}}}
← {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\"path\":\"src/main/plugin-loader.js\",\"kind\":\"module\",...}"}]}}
```

### 9.4 Server Lifecycle

- The server loads `instance.json` and `schema.json` into memory on startup.
- All tool calls are synchronous reads against the in-memory model (except `hdsl_query --mode ai` which spawns a Claude CLI subprocess).
- The server exits when stdin closes or on `SIGTERM`.

---

## 10. Revised File Structure

With backward compatibility removed, the entry point is `hdsl.js` only:

```
h-dsl-engine/
├── hdsl.js                  # Single entry point with subcommands
├── lib/
│   ├── commands/
│   │   ├── bootstrap.js     # Full scan and populate
│   │   ├── peek.js
│   │   ├── focus.js
│   │   ├── search.js
│   │   ├── trace.js
│   │   ├── deps.js
│   │   ├── stats.js
│   │   ├── diff.js
│   │   ├── query.js
│   │   └── serve.js
│   ├── model-loader.js      # Shared instance.json loading + indexing
│   ├── graph.js             # In-memory dependency graph
│   ├── formatters.js        # json, yaml, table, tree, paths output
│   ├── query-engine.js      # Local scoring + AI-assisted ranking
│   ├── mcp-server.js        # MCP stdio JSON-RPC server
│   ├── discoverer.js        # (existing)
│   ├── schema-deriver.js    # (existing)
│   ├── populator.js         # (existing)
│   ├── emitter.js           # (existing)
│   ├── annotation-emitter.js # (existing)
│   ├── ai-client.js         # (existing)
│   ├── ast-utils.js         # (existing)
│   ├── config.js            # (existing)
│   └── hdsl-types.js        # (existing)
└── package.json
```

`hdsl-bootstrap.js` is deleted. Users run `hdsl bootstrap` instead.