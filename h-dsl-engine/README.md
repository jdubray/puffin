# h-DSL Engine

Scans an existing project and produces a populated **h-DSL schema** and **Code Model** (instance), typed by h-M3 primitives, for consumption by Puffin's Central Reasoning Engine. Also provides query, analysis, and navigation tools for exploring the Code Model.

## Quick Start

```bash
cd h-dsl-engine
npm install

# Bootstrap a project (build the Code Model)
node hdsl-bootstrap.js --project /path/to/your/project

# Query the Code Model
node hdsl-bootstrap.js explore --project /path/to/your/project --query stats
```

## Commands

The CLI uses Commander subcommands. `bootstrap` is the default command.

### bootstrap (default)

Scans a project and produces the h-DSL schema and Code Model.

```bash
node hdsl-bootstrap.js --project <path> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--project <path>` | **(required)** Root directory of the target project | -- |
| `--config <path>` | Path to config file | `<project>/.hdslrc.json` |
| `--exclude <patterns>` | Comma-separated glob patterns to skip | `node_modules,dist,.git,coverage` |
| `--include <patterns>` | Comma-separated glob patterns to include (e.g. `"*.js,*.ts"`) | all recognized |
| `--output <dir>` | Output directory for schema/instance JSON | `<project>/.puffin/cre` |
| `--annotate` | Generate `.an.md` annotation files for each source artifact | `false` |
| `--clean` | Delete existing schema/instance before running | `false` |
| `--verbose` | Print progress and decisions to stdout | `false` |

### explore

Query the low-level Code Model (artifacts, deps, flows, types, stats, search).

```bash
node hdsl-bootstrap.js explore --project <path> --query <type|json> [options]
```

| Flag | Description |
|------|-------------|
| `--query <json>` | Query type shorthand (`stats`, `artifact`, `deps`, `flow`, `type`, `search`) or JSON object |
| `--pattern <pat>` | Filter pattern (glob-like) |
| `--artifact <path>` | Artifact path (for deps queries) |
| `--direction <dir>` | `inbound`, `outbound`, or `both` |
| `--kind <kind>` | Filter by artifact or dependency kind |
| `--element-type <type>` | Filter by element type |
| `--limit <n>` | Max results (default 50) |
| `--pretty` | Pretty-print JSON output |

**Examples:**

```bash
# Codebase statistics
node hdsl-bootstrap.js explore --project . --query stats --pretty

# Find all modules matching a pattern
node hdsl-bootstrap.js explore --project . --query artifact --pattern "src/main/*"

# Get dependencies for a file
node hdsl-bootstrap.js explore --project . --query deps --artifact src/main/main.js

# Free-text search across summaries and intents
node hdsl-bootstrap.js explore --project . --query search --pattern "plugin"
```

### query

High-level code model queries returning subgraphs (entity, relation, structure, impact).

```bash
node hdsl-bootstrap.js query --project <path> --query '<json>' [--depth n] [--limit n] [--pretty]
```

**Examples:**

```bash
# Find entities by name pattern
node hdsl-bootstrap.js query --project . --query '{"type":"entity","name":"api*"}' --pretty

# Get structural overview
node hdsl-bootstrap.js query --project . --query '{"type":"structure"}' --pretty

# Transitive impact analysis
node hdsl-bootstrap.js query --project . --query '{"type":"impact","name":"src/utils.js"}' --pretty
```

### analyze

Impact analysis for proposed changes -- risk scoring, transitive dependency chains.

```bash
node hdsl-bootstrap.js analyze --project <path> --target <pattern> [--depth n] [--no-reverse] [--pretty]
```

**Example:**

```bash
node hdsl-bootstrap.js analyze --project . --target "src/main/ipc-handlers.js" --pretty
```

### patterns

Discover codebase patterns and conventions.

```bash
node hdsl-bootstrap.js patterns --project <path> [--category <cat>] [--area <pattern>] [--pretty]
```

Categories: `naming`, `organization`, `modules`, `architecture`, `similar`, `all` (default).

**Example:**

```bash
node hdsl-bootstrap.js patterns --project . --category architecture --pretty
```

### navigate

Graph navigation -- walk dependency chains, find shortest paths, list neighbors.

```bash
node hdsl-bootstrap.js navigate --project <path> --op <walk|path|neighbors> [options]
```

| Flag | Description |
|------|-------------|
| `--op <op>` | Operation: `walk`, `path`, or `neighbors` |
| `--start <pattern>` | Starting entity (for walk) |
| `--entity <pattern>` | Entity to inspect (for neighbors) |
| `--from <pattern>` | Source entity (for path) |
| `--to <pattern>` | Target entity (for path) |
| `--direction <dir>` | `outgoing`, `incoming`, or `both` |
| `--rel <types>` | Comma-separated relationship types to follow |
| `--depth <n>` | Max traversal depth (default 3) |

**Examples:**

```bash
# Walk import chain from entry point
node hdsl-bootstrap.js navigate --project . --op walk --start "src/main/main.js" --rel import --depth 2

# Find path between two files
node hdsl-bootstrap.js navigate --project . --op path --from "src/main/main.js" --to "src/renderer/app.js"

# List neighbors of a module
node hdsl-bootstrap.js navigate --project . --op neighbors --entity "src/main/ipc-handlers.js"
```

### freshness

Check if the Code Model is up-to-date relative to git history.

```bash
node hdsl-bootstrap.js freshness --project <path> [--auto-update] [--force-refresh] [--verbose] [--pretty]
```

**Example:**

```bash
node hdsl-bootstrap.js freshness --project . --auto-update --pretty
```

## MCP Tool Server

The engine can run as an MCP (Model Context Protocol) tool server, exposing 9 tools for Claude Code to invoke during planning and implementation.

### Setup

Create `.mcp.json` in the **project root** directory:

```json
{
  "mcpServers": {
    "hdsl": {
      "command": "node",
      "args": ["h-dsl-engine/hdsl-tool-server.js", "--project", "."]
    }
  }
}
```

Claude Code reads this file on startup and spawns the server as a child process communicating via JSON-RPC 2.0 over stdio.

### Available Tools

| Tool | Description |
|------|-------------|
| `hdsl_stats` | Codebase statistics -- artifact counts, dependency counts, type breakdowns |
| `hdsl_peek` | Get summary of a specific artifact by path |
| `hdsl_search` | Search by pattern, type, kind, or free-text across summaries |
| `hdsl_deps` | List dependencies for an artifact (incoming/outgoing), grouped by kind |
| `hdsl_trace` | BFS traversal from a starting artifact, filtered by relationship type |
| `hdsl_impact` | Analyze change impact -- affected files, risk scores, dependency chains |
| `hdsl_patterns` | Discover naming, organization, module, and architecture patterns |
| `hdsl_path` | Find shortest path between two entities in the dependency graph |
| `hdsl_freshness` | Check model freshness vs git; optionally trigger incremental update |

### Manual Testing

Test the MCP protocol directly:

```bash
# Initialize
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{}}}' | node h-dsl-engine/hdsl-tool-server.js --project .

# List tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node h-dsl-engine/hdsl-tool-server.js --project .

# Call a tool
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"hdsl_stats","arguments":{}}}' | node h-dsl-engine/hdsl-tool-server.js --project .
```

## Pipeline

The bootstrap engine runs a 5-phase pipeline:

1. **DISCOVER** -- Scans files, parses source with Acorn (regex fallback for JSX/TS), extracts functions, classes, exports, imports, and dependencies.
2. **DERIVE** -- Builds an h-DSL schema from discovered patterns and term frequency.
3. **POPULATE** -- Creates the Code Model instance: artifacts with children (functions/classes), dependencies, heuristic prose summaries, and AI-powered descriptions when available.
4. **EMIT** -- Validates and writes `schema.json` and `instance.json` to the output directory.
5. **ANNOTATE** *(optional)* -- Generates `.an.md` annotation files. Test/spec directories get a single aggregated `_directory.an.md` instead of per-file annotations.

## Output

All output goes to `<project>/.puffin/cre/` by default:

```
.puffin/cre/
  schema.json       # h-DSL schema with element types
  instance.json     # Code Model: artifacts, dependencies, flows
  annotations/      # (if --annotate) .an.md files per source artifact
```

## File Structure

```
h-dsl-engine/
  hdsl-bootstrap.js          # CLI entry point (Commander subcommands)
  hdsl-tool-server.js        # MCP stdio tool server (JSON-RPC 2.0)
  lib/
    discoverer.js             # Phase 1: file walking, AST parsing
    schema-deriver.js         # Phase 2: pattern analysis, schema generation
    populator.js              # Phase 3: instance building, AI prose
    emitter.js                # Phase 4: validation, writing
    annotation-emitter.js     # Phase 5: .an.md generation
    explorer.js               # Low-level model queries (artifact, deps, flow, search, stats)
    query-interface.js         # High-level subgraph queries (entity, relation, structure, impact)
    impact-analyzer.js         # Change impact analysis with risk scoring
    pattern-discovery.js       # Convention and pattern detection
    graph-navigator.js         # Graph traversal (walk, path, neighbors)
    freshness.js               # Git-based model freshness checking and incremental update
    ai-client.js               # Claude CLI wrapper
    ast-utils.js               # AST parsing helpers
    config.js                  # Configuration resolution
    hdsl-types.js              # Shared type definitions
  package.json
```

## Configuration

Create a `.hdslrc.json` in your project root to set defaults:

```json
{
  "exclude": ["node_modules", "dist", ".git", "coverage", "vendor"],
  "include": ["*.js", "*.ts"],
  "verbose": true
}
```

CLI flags override config file values, which override built-in defaults.

## Tests

```bash
# Unit tests
node --test tests/

# Evaluation suite only
node --test tests/evaluation/
```

### Evaluation Test Suite

The `tests/evaluation/` directory contains a comparative test suite that measures the value of the h-DSL Code Model over standard tools (Grep, Glob, Read). Both sides execute **real operations** — the baseline performs actual file system grep/glob/read calls, and the Code Model runs actual queries against the loaded instance.json. Results, timing, and accuracy are compared against manually verified ground truth.

**18 test cases across 5 categories:**

| Category | Tests | What it measures |
|----------|-------|------------------|
| **A: Dependency Tracing** | A1--A4 | Graph queries vs grep chains (importers, transitive deps, orphans, impact) |
| **B: Semantic Search** | B1--B4 | Prose-indexed search vs keyword grep (persistence, lifecycle, state, errors) |
| **C: Artifact Discovery** | C1--C4 | Pre-computed metadata vs file reads (summaries, stats, exports, tags) |
| **D: Cross-File Flows** | D1--D3 | Pre-traced flows vs manual reconstruction (startup, plugin activation, IPC) |
| **E: Change Planning** | E1--E3 | Combined semantic + graph vs multi-step grep (IPC channels, plugin conventions, refactoring) |

**Latest results (against Puffin's own codebase, 302 artifacts):**

```
Total baseline time:     385.9ms  (4095 fs ops)
Total Code Model time:    10.1ms  (21 query ops)
Overall time speedup:     38.3x
```

| Category | Time Speedup | Accuracy |
|----------|-------------|----------|
| A: Dependency Tracing | 3.6--92.7x | F1 0.88--1.0, both sides match ground truth |
| B: Semantic Search | 59.8--113x | Both find expected modules; baseline 88 noisy matches vs model 23 |
| C: Artifact Discovery | 3.7--69.5x | 56.8x token reduction on file summaries |
| D: Cross-File Flows | 2.6--13.3x | F1 1.0 on startup sequence |
| E: Change Planning | 1.0--28.1x | Model finds 16 targets + 18 affected files vs baseline's 1 grep match |

Ground truth is in `tests/evaluation/ground-truth.json`. To update it after rebootstrapping, re-verify the expected values against the current instance.json.

#### Debug Mode

Set `HDSL_EVAL_DEBUG=1` to see step-by-step interactions for each test — the question, baseline approach, Code Model query with parameters, raw results, ground truth comparison, and final verdict:

```bash
# Linux / macOS
HDSL_EVAL_DEBUG=1 node --test tests/evaluation/

# Windows (cmd)
set HDSL_EVAL_DEBUG=1 && node --test tests/evaluation/

# Windows (PowerShell)
$env:HDSL_EVAL_DEBUG="1"; node --test tests/evaluation/
```
