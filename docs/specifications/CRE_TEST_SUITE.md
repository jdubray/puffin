## 11. Evaluation Test Suite: Code Model vs Standard Tools

To measure the value of the h-DSL Code Model over raw Claude tools (Grep, Glob, Read, Bash), we propose a series of comparative tests. Each test poses the same question twice — once answered using only standard tools, once using the Code Model — and measures **accuracy**, **tool calls required**, and **context tokens consumed**.

### 11.1 Test Design

Each test case follows this structure:

```yaml
test:
  name: string           # Descriptive test name
  question: string       # The query to answer
  ground_truth: object   # Known-correct answer (manually verified)
  
  baseline:              # Standard tools only (Grep, Glob, Read)
    method: description of how Claude would solve this
    metrics:
      tool_calls: number
      tokens_consumed: number
      accuracy: 0.0-1.0  # vs ground truth
      
  code_model:            # h-DSL queries only
    method: description of hdsl commands used
    metrics:
      tool_calls: number
      tokens_consumed: number
      accuracy: 0.0-1.0
```

### 11.2 Test Categories

#### Category A: Dependency Tracing

Tests that require understanding what depends on what.

| # | Question | Baseline Approach | Code Model Approach |
|---|----------|-------------------|---------------------|
| A1 | "What files directly import `plugin-loader.js`?" | Grep for `require.*plugin-loader` and `import.*plugin-loader` across all files | `hdsl deps src/main/plugin-loader.js --direction incoming --kind imports` |
| A2 | "What is the full transitive dependency tree of `main.js` (2 levels)?" | Grep imports in main.js, then grep imports in each result — requires N+1 tool calls | `hdsl trace src/main/main.js --depth 2 --direction forward` |
| A3 | "Which modules are orphans (nothing imports them)?" | Glob all JS files, then Grep for each filename across the codebase — O(N) calls | `hdsl stats` (orphans field) |
| A4 | "If I change `ipc-handlers.js`, what else might break?" | Grep for imports of that file, then recursively check callers — manual graph walk | `hdsl trace src/main/ipc-handlers.js --direction backward --depth 2` |

**Expected advantage:** Dependency tracing is where the Code Model should show the largest gains — O(1) queries vs O(N) grep chains.

#### Category B: Semantic Search

Tests that require understanding *meaning*, not just text.

| # | Question | Baseline Approach | Code Model Approach |
|---|----------|-------------------|---------------------|
| B1 | "Which modules handle persistence?" | Grep for `sqlite`, `database`, `save`, `persist`, `store` — multiple queries, high false-positive rate | `hdsl search --tag persistence` or `hdsl search --prose "persistence"` |
| B2 | "What is responsible for the plugin lifecycle?" | Grep for `plugin` + `lifecycle`, `activate`, `deactivate` — requires reading files to confirm | `hdsl search --tag lifecycle --tag plugins` |
| B3 | "Find the module that manages application state" | Grep for `state`, `store`, `puffin-state` — ambiguous term, many false matches | `hdsl search --prose "application state"` |
| B4 | "Which functions handle error recovery?" | Grep for `catch`, `error`, `recover`, `retry` — extremely noisy | `hdsl search --kind function --prose "error recovery"` |

**Expected advantage:** Prose-indexed search should reduce false positives significantly. Standard grep matches text, not intent.

#### Category C: Artifact Discovery

Tests about understanding what exists in the codebase before diving in.

| # | Question | Baseline Approach | Code Model Approach |
|---|----------|-------------------|---------------------|
| C1 | "Give me a summary of `plugin-loader.js` without reading the whole file" | Must Read the file (up to 2000 lines) and summarize | `hdsl peek src/main/plugin-loader.js` |
| C2 | "What does the codebase look like — how many modules, tests, configs?" | Glob for patterns (`*.test.js`, `*.config.*`), count results, read samples | `hdsl stats` |
| C3 | "What symbols does `claude-service.js` export?" | Read the file, scan for `module.exports` or `export` | `hdsl peek src/main/claude-service.js` (exports field) |
| C4 | "List all modules tagged as 'core'" | No equivalent — tags don't exist in source | `hdsl search --tag core` |

**Expected advantage:** Pre-computed metadata avoids file reads entirely. Tags have no baseline equivalent.

#### Category D: Cross-File Flow Understanding

Tests about multi-step processes spanning several files.

| # | Question | Baseline Approach | Code Model Approach |
|---|----------|-------------------|---------------------|
| D1 | "What is the app startup sequence?" | Read main.js, follow imports, read each, infer order — 5+ Read calls minimum | `hdsl search --kind flow --prose "startup"` |
| D2 | "How does a plugin go from discovery to activation?" | Read plugin-loader, plugin-manager, trace calls manually — 3+ Reads + Greps | `hdsl search --kind flow --prose "plugin activation"` |
| D3 | "What steps are involved in handling an IPC message?" | Grep for `ipcMain.handle`, read each handler, trace to renderer — 4+ calls | `hdsl search --kind flow --prose "IPC"` + `hdsl trace` on results |

**Expected advantage:** Pre-traced flows provide immediate answers. Baseline requires reconstructing the flow from scratch each time.

#### Category E: Change Planning

Tests simulating real implementation planning tasks.

| # | Question | Baseline Approach | Code Model Approach |
|---|----------|-------------------|---------------------|
| E1 | "I need to add a new IPC channel — what files do I need to touch?" | Grep for existing IPC patterns, Read results to understand convention, infer files | `hdsl search --prose "IPC"` + `hdsl deps` on results |
| E2 | "What's the convention for adding a new plugin?" | Read existing plugin files, compare patterns, Read plugin-loader for registration | `hdsl search --tag plugins` + `hdsl peek` on each result |
| E3 | "Which files would be affected if I refactor the database module?" | Grep for database imports, then trace downstream consumers | `hdsl trace src/main/database.js --direction backward --depth 3` |

**Expected advantage:** Planning queries combine dependency + semantic knowledge. The Code Model answers in 2-3 calls what baseline needs 8-12 for.

### 11.3 Metrics

| Metric | Definition | How Measured |
|--------|------------|--------------|
| **Tool calls** | Number of tool invocations to reach the answer | Count of Grep/Glob/Read/Bash calls (baseline) vs hdsl calls (Code Model) |
| **Tokens consumed** | Total tokens in tool outputs that Claude must process | Sum of response sizes from all tool calls |
| **Accuracy** | Correctness vs manually verified ground truth | F1 score for set-based answers (files, functions); exact match for single answers |
| **Completeness** | Did the answer include all relevant items? | Recall against ground truth |
| **False positives** | Irrelevant items included in the answer | Precision against ground truth |

### 11.4 Running the Tests

Tests can be run in two modes:

**Manual mode:** A human evaluator poses each question to Claude twice (once with only standard tools, once with hdsl tools available) and records the metrics.

**Automated mode (future):** A test harness that:
1. Loads the ground truth for each test
2. Invokes Claude via the CLI with a constrained tool set
3. Captures tool call counts and token usage
4. Compares the final answer to ground truth
5. Produces a summary report

### 11.5 Expected Outcomes

| Category | Expected Tool Call Reduction | Expected Accuracy Gain | Notes |
|----------|------------------------------|------------------------|-------|
| A: Dependency Tracing | 5-10x fewer calls | Higher (no missed transitive deps) | Strongest advantage — graph queries vs text search |
| B: Semantic Search | 2-4x fewer calls | Higher (fewer false positives) | Prose fields enable intent-based matching |
| C: Artifact Discovery | 3-5x fewer calls | Equivalent | Pre-computed metadata avoids file reads |
| D: Cross-File Flows | 3-8x fewer calls | Higher (pre-traced flows) | Flows have no baseline equivalent |
| E: Change Planning | 3-6x fewer calls | Higher (combined semantic + graph) | Compound queries show cumulative advantage |

### 11.6 Limitations and Fair Comparison Notes

- The Code Model requires an upfront bootstrap cost (scanning + AI summarization). Baseline tools have zero setup cost.
- The Code Model can become stale. Tests should note whether the model is current.
- Some questions are trivially answered by Grep (e.g., "find all files named `*.test.js`"). The test suite deliberately focuses on questions where semantic or structural understanding matters.
- The Code Model adds value proportional to codebase size. For very small projects (<20 files), standard tools may be sufficient.

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

