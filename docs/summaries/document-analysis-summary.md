# Document Analysis Plugin — Technical Summary

This document describes the RLM Document Plugin: its architecture, module structure, end-to-end lifecycle from document selection to analysis output, how documents are chunked and processed, how results are aggregated and presented, integration points with Puffin core, and configuration options.

## 1. Overview

The **RLM Document Plugin** (`rlm-document-plugin`) implements the Recursive Language Model pattern for document analysis. It allows users to load a document, pose natural-language questions about its content, and receive evidence-backed answers through an iterative chunk-analysis loop.

The core idea: instead of sending an entire document to an LLM, the document is split into chunks. A sub-LLM (Claude Code in `--print` mode) analyzes each chunk independently, findings are aggregated, and the process iterates with refined queries until convergence. A final synthesis step combines all findings into a coherent answer.

The plugin consists of three layers:
1. **Python REPL** (`rlm_repl.py`) — Stateful document access: chunking, keyword search, peek, buffers.
2. **Node.js main process** (`index.js` + `lib/`) — Session management, orchestration, Claude Code CLI delegation, IPC handlers.
3. **Renderer components** (`renderer/`) — UI: document picker, query panel, results tree, chunk inspector, export controls.

## 2. Plugin Architecture and Module Structure

### Manifest (`puffin-plugin.json`)

The plugin registers with Puffin via its manifest:
- **View**: "Document Analysis" in the nav bar (order 250, icon 📑)
- **IPC Handlers**: 23 registered channels (see Section 6)
- **Renderer Entry**: `renderer/components/index.js` exporting `RLMDocumentView`
- **Styles**: 8 CSS files for each sub-component
- **Activation**: `onStartup` — plugin loads when Puffin starts

### Module Map

| Module | Purpose |
|--------|---------|
| `index.js` | Plugin entry point — `activate()` / `deactivate()`, Python detection, REPL/orchestrator initialization, 23 IPC handler registrations |
| `lib/config.js` | All configuration constants (SESSION, CHUNKING, QUERY, SUB_AGENT, EXPORT, FILE_LIMITS, STORAGE, REPL) |
| `lib/session-store.js` | `SessionStore` — CRUD for sessions, query results, buffers; atomic writes; 30-day auto-cleanup |
| `lib/session-state.js` | `SessionStateMachine` — In-memory state machine per session with query history and finding aggregation |
| `lib/schemas.js` | Factory functions and validation for sessions, queries, evidence, chunks, buffers |
| `lib/validators.js` | Input validation: path traversal prevention, session ID format, chunk config, grep patterns, file size limits |
| `lib/chunk-strategy.js` | Three chunking algorithms: character, line, semantic |
| `lib/rlm-orchestrator.js` | `RlmOrchestrator` — Coordinates the iterative RLM query loop |
| `lib/claude-code-client.js` | `ClaudeCodeClient` — Spawns Claude Code CLI for sub-LLM queries; response caching; batch processing |
| `lib/repl-manager.js` | `ReplManager` — Spawns/manages Python REPL processes; JSON-RPC communication; concurrency control via `Semaphore` |
| `lib/result-aggregator.js` | `ResultAggregator` — Deduplicates findings, detects convergence, groups by key terms, ranks by confidence |
| `lib/semaphore.js` | `Semaphore` — Counting semaphore for async concurrency control |
| `lib/python-detector.js` | Cross-platform Python detection (win32/darwin/linux candidates, version check ≥3.7, result caching) |
| `lib/exporters.js` | Export to JSON or Markdown format |
| `scripts/rlm_repl.py` | Python REPL: JSON-RPC server providing `init`, `peek`, `grep`, `get_chunks`, `get_chunk`, `query`, `eval`, `add_buffer`, `get_buffers`, `shutdown` |
| `renderer/components/RLMDocumentView.js` | Main orchestrating panel (flexbox layout) |
| `renderer/components/SessionStatusDisplay.js` | Session state and REPL connection indicator |
| `renderer/components/DocumentPicker.js` | File selection with drag-drop and recent files |
| `renderer/components/QueryPanel.js` | Query input with type selector (peek, grep, query) |
| `renderer/components/ResultsTree.js` | Collapsible tree view of query results |
| `renderer/components/ChunkInspector.js` | Detail view with syntax highlighting |
| `renderer/components/ExportControls.js` | Export format selection and download |
| `renderer/components/Toast.js` | Plugin-scoped toast notifications |

## 3. End-to-End Lifecycle

### 3.1 Plugin Activation

On startup, `activate(context)` performs:

1. **Detect Python** — `detectPython()` tests platform-specific candidates (`python`/`python3`/`py`) in order, checking `--version` output for ≥3.7. Caches the result. If no Python found, plugin enters degraded mode (REPL features unavailable).
2. **Initialize SessionStore** — Creates `.puffin/rlm-sessions/` directory and `sessions.json` index.
3. **Create ReplManager** — Configured with detected Python path and `scripts/rlm_repl.py` script path.
4. **Create ClaudeCodeClient** — Configured with model (default `haiku`), timeout, concurrency limits.
5. **Create RlmOrchestrator** — Wired to ReplManager and ClaudeCodeClient.
6. **Register 23 IPC handlers** — All exposed via `context.registerIpcHandler()`.
7. **Schedule session cleanup** — Runs `cleanupExpiredSessions()` immediately on activation, then schedules daily cleanup (every 24 hours) for ongoing session expiry. Removes closed sessions older than 30 days.

### 3.2 Document Selection → Session Creation

```
User clicks "Document Analysis" nav item
  → RLMDocumentView activates
  → DocumentPicker renders (drag-drop zone + file dialog button + recent files list)

User selects a file
  → Renderer calls window.puffin.rlm.initSession({ documentPath, config })
  → IPC: rlm:initSession handler in index.js
    1. Validates path (must be within project, no traversal)
    2. Stats the file (checks existence, gets size)
    3. Validates file size (warn at 10MB, reject at 50MB)
    4. Creates session via SessionStore.createSession()
       → Generates session ID: ses_<timestamp36><random_hex>
       → Creates directory: .puffin/rlm-sessions/sessions/<sessionId>/
       → Creates subdirectories: results/, chunks/
       → Saves metadata.json and buffers.json
       → Updates sessions.json index
    5. Starts REPL initialization in background (does NOT block response)
       → ReplManager.initRepl(sessionId, documentPath, config)
       → Spawns Python process with rlm_repl.py
       → Sends JSON-RPC "init" command with documentPath, chunkSize, chunkOverlap
       → Python REPL reads file, computes chunks, returns contentLength + chunkCount
  → Returns session metadata to renderer
  → SessionStatusDisplay shows state: INITIALIZING → READY
```

### 3.3 Query Execution (RLM Loop)

```
User types a question in QueryPanel, clicks "Ask"
  → Renderer calls window.puffin.rlm.executeRlmQuery({ sessionId, query })
  → IPC: rlm:executeRlmQuery handler
    1. Ensures REPL is initialized for this session
    2. Initializes orchestrator session state
    3. Calls orchestrator.executeQuery(sessionId, query)
```

**The RLM Orchestrator Loop** (`rlm-orchestrator.js`):

```
For each iteration (max 3 by default):
  1. SEARCH — Send query to Python REPL
     → REPL keyword-scores all chunks, returns top 10 by relevance
  2. FETCH — Get full content of matched chunks
     → For each chunk, call REPL.get_chunk(index) if content not cached
  3. ANALYZE — Send chunks to Claude Code CLI in parallel
     → ClaudeCodeClient.queryBatch(chunks, question)
     → Each chunk spawned as: claude --print --model haiku --disallowedTools AskUserQuestion
     → Prompt: "Extract relevant information from this chunk" → expects JSON response
     → Concurrency limited by Semaphore (max 3 from config, client max 5)
     → Responses cached by MD5(context + question + model), TTL 1 hour
  4. AGGREGATE — Add batch results to ResultAggregator
     → Deduplicates via hash of first 100 chars (normalized lowercase, stripped punctuation)
     → Tracks findings per iteration
  5. CONVERGE? — Check if new findings ratio < 20% (after min 2 iterations)
     → If converged or max iterations reached: break
     → If not: collect suggestedFollowup queries from findings, refine query, repeat

After loop:
  6. SYNTHESIZE — Send all findings + original query to Claude Code
     → Prompt: "Synthesize these findings into a coherent answer"
     → Returns { answer, keyPoints, confidence }
  7. STORE — Save query result to session store
     → Results saved as JSON files in results/ subdirectory
     → Session stats updated (queriesRun++, evidenceCollected += count)
```

### 3.4 Results Display

The orchestrator returns results to the renderer, which displays:
- **ResultsTree**: Collapsible tree view — queries at top level, evidence items as children
  - Each evidence item shows: chunk index, confidence badge (high/medium/low), finding text, excerpt
  - Items sorted by confidence (high → medium → low)
- **ChunkInspector**: When user clicks a chunk reference, shows full chunk content with syntax highlighting
- **Synthesis**: The coherent answer is displayed above the evidence tree

### 3.5 Session Close and Cleanup

```
User closes session (or navigates away)
  → rlm:closeSession IPC
    → SessionStore.closeSession() — sets state to 'closed'
    → ReplManager.closeRepl() — sends "shutdown" JSON-RPC, then kills Python process

Automatic cleanup (runs immediately on activation, then daily):
  → SessionStore.cleanupExpiredSessions(30)
  → Iterates all sessions, deletes those where:
    - state === 'closed' AND lastAccessedAt > 30 days ago
  → Removes session directory (metadata, results, chunks, buffers)
  → Updates sessions.json index
```

### 3.6 Plugin Deactivation

`deactivate()` performs:
1. Closes all REPL processes via `ReplManager.closeAll()`
2. Drains the semaphore (rejects queued requests)
3. Nulls out references (orchestrator, client, replManager, sessionStore)

## 4. How Documents Are Chunked and Processed

### 4.1 Chunking Strategies

Three strategies are available in `chunk-strategy.js`:

**Character Chunks** (`characterChunks`) — Default strategy:
- Splits document into fixed-size character windows with overlap
- Default: 4000 chars per chunk, 200 chars overlap
- Step size = chunkSize - overlap (3800 chars)
- Tiny final chunks (< chunkSize/4) are absorbed into the previous chunk
- Example: a 20,000 char document → ~5 chunks with 200-char overlapping boundaries

**Line Chunks** (`lineChunks`):
- Splits by complete lines (no mid-line breaks)
- Accumulates lines until `maxSize` is reached, then starts new chunk
- Default overlap: 5 lines carried from previous chunk
- Better for line-oriented formats (code, logs, CSV)

**Semantic Chunks** (`semanticChunks`):
- Detects natural boundaries: blank lines, markdown headers (`# ...`), horizontal rules (`---`)
- Uses `findBreakPoints()` to scan for boundaries
- Target size with ±20% tolerance
- Falls back to character chunking if no natural boundaries found
- Best for structured documents (markdown, RST, formatted text)

### 4.2 Python REPL Chunking

The Python REPL (`rlm_repl.py`) uses its own character chunking in `_compute_chunks()`:
- Same algorithm as the Node.js character chunking
- Step = chunkSize - overlap
- Absorbs tiny trailing chunks (< chunkSize/4) into previous
- Each chunk stores: `id` (`chunk_000`, `chunk_001`, ...), `index`, `start`, `end`, `length`, `lineStart`, `lineEnd`, `content`

### 4.3 REPL Query (Keyword Search)

When the orchestrator needs relevant chunks, it calls the Python REPL's `query` method:
1. Extracts keywords from query text (words > 2 chars, filtering stop words)
2. Scores each chunk by keyword frequency × length-based weight (longer keywords weighted higher)
3. Returns top 10 chunks sorted by score, with preview text

### 4.4 Additional REPL Operations

- **peek(start, end)** — View content by character range, returns content + line numbers
- **grep(pattern, maxMatches, contextLines)** — Regex search with context lines (case-insensitive, multiline)
- **get_chunks(includeContent)** — List all chunks (metadata only or with content)
- **get_chunk(index)** — Get single chunk by index
- **add_buffer(content, label)** / **get_buffers()** — Temporary named storage for extracted content
- **eval(code)** — Execute arbitrary Python in REPL context (disabled by default, requires `allowEval: true`)

## 5. How Analysis Results Are Aggregated and Presented

### 5.1 Result Aggregator (`result-aggregator.js`)

The `ResultAggregator` collects findings across iterations:

**Deduplication**:
- Hashes first 100 chars of each finding (normalized: lowercase, stripped of punctuation and whitespace)
- Duplicate findings are silently dropped

**Convergence Detection**:
- Minimum 2 iterations before convergence can trigger
- Converged when: `newFindings / totalFindings < 0.2` (less than 20% new information)
- Hard cap at 5 iterations regardless
- Maximum 50 total findings

**Ranking**:
- Primary sort: confidence level (high=3 > medium=2 > low=1)
- Secondary sort: chunk order (earlier chunks ranked higher)

**Grouping**:
- Findings grouped by their first key term
- Each group becomes a collapsible section in the UI

**Follow-up Suggestions**:
- Collects `suggestedFollowup` strings from findings (max 5 unique)
- Used by orchestrator for query refinement between iterations

### 5.2 Synthesis

After the analysis loop, the orchestrator calls `_synthesizeFindings()`:
1. Formats all findings into a numbered list
2. Sends to Claude Code with prompt: "Synthesize these findings into a coherent answer"
3. Expected JSON response: `{ answer, keyPoints, confidence }`
4. The synthesis becomes the primary answer displayed to the user

### 5.3 Query Result Storage

Each query result is persisted as a JSON file in the session's `results/` directory:
```
.puffin/rlm-sessions/sessions/<sessionId>/results/<queryId>.json
```

Schema (`createQueryResult`):
```json
{
  "id": "qry_<timestamp36><random>",
  "sessionId": "ses_...",
  "query": "user's question",
  "strategy": "recursive",
  "timestamp": "ISO 8601",
  "evidence": [
    {
      "chunkId": "chunk_003",
      "chunkIndex": 3,
      "point": "key finding text",
      "excerpt": "relevant excerpt from chunk",
      "confidence": "high",
      "lineRange": [45, 67]
    }
  ],
  "synthesis": "coherent answer text",
  "tokensUsed": 0,
  "chunksAnalyzed": 10,
  "executionTimeMs": 0,
  "status": "completed"
}
```

### 5.4 Export

Two export formats via `exporters.js`:

**JSON Export** (`exportJson`):
- Full structured data: session metadata, all query results with evidence, summary stats
- Option: `pretty` (indented) or compact
- Option: `includeContent` (full excerpts vs. truncated to 200 chars)

**Markdown Export** (`exportMarkdown`):
- Human-readable document with session info table, summary stats, and per-query sections
- Each query shows: answer/synthesis, evidence items with confidence badges and excerpts in code blocks, metrics
- Option: `includeMetadata` (session info table)

## 6. Integration Points with Puffin Core

### 6.1 IPC Handlers (23 total)

All registered via `context.registerIpcHandler()` and exposed through the preload bridge:

| Channel | Purpose |
|---------|---------|
| `rlm:initSession` | Create session + start REPL for a document |
| `rlm:closeSession` | Close a session and stop its REPL |
| `rlm:listSessions` | List all sessions (optional state filter) |
| `rlm:getSession` | Get session by ID (touches lastAccessedAt) |
| `rlm:deleteSession` | Delete session and all its data |
| `rlm:getQueryResults` | Get all query results for a session |
| `rlm:query` | Execute a direct REPL query (keyword search only, no LLM) |
| `rlm:peek` | View content by character range |
| `rlm:grep` | Regex search with context lines |
| `rlm:getChunks` | List chunks (metadata or with content) |
| `rlm:getChunk` | Get single chunk by index |
| `rlm:addBuffer` | Add content to session buffer |
| `rlm:getBuffers` | Get all buffers for a session |
| `rlm:exportResults` | Export session results (JSON or Markdown) |
| `rlm:getExportFormats` | Get available export format descriptors |
| `rlm:getConfig` | Get plugin configuration |
| `rlm:getStorageStats` | Get storage statistics (session counts, query counts) |
| `rlm:getReplStats` | Get REPL manager stats (active sessions, pending requests) |
| `rlm:showFileDialog` | Open native Electron file dialog with extension filters |
| `rlm:getFileStat` | Get file metadata (size, existence) for a document path |
| `rlm:executeRlmQuery` | Execute full RLM analysis loop (search → analyze → synthesize) |
| `rlm:getOrchestratorStatus` | Get orchestrator status for a session |
| `rlm:configureOrchestrator` | Update orchestrator configuration at runtime |

### 6.2 Plugin Context API

The plugin uses Puffin's `context` object for:
- `context.registerIpcHandler(channel, handler)` — Registers IPC handlers (auto-cleaned on deactivate)
- `context.projectPath` — Project root directory (used for path validation and storage location)
- `context.log` — Logger instance

### 6.3 Renderer Component Architecture

Components follow Puffin's vanilla JS class pattern:

```
RLMDocumentView (main container)
  ├── SessionStatusDisplay  — State indicator (initializing/ready/querying/error/closed)
  ├── DocumentPicker        — File selection (drag-drop, dialog, recent files)
  ├── QueryPanel            — Query input (peek/grep/query type selector)
  ├── ResultsTree           — Collapsible tree view of results
  ├── ChunkInspector        — Chunk detail view with highlighting
  ├── ExportControls        — Format selection and download
  └── Toast/ToastManager    — Plugin-scoped notifications
```

Renderer communicates with main process exclusively through `window.puffin.rlm.*` preload bridge.

### 6.4 Storage

All plugin data is stored within the project at `.puffin/rlm-sessions/`:

```
.puffin/rlm-sessions/
├── sessions.json              ← Index file (lightweight references to all sessions)
└── sessions/
    └── <sessionId>/
        ├── metadata.json      ← Full session metadata (config, stats, timestamps)
        ├── buffers.json       ← Named content buffers
        ├── results/
        │   ├── <queryId>.json ← Individual query result with evidence
        │   └── ...
        └── chunks/            ← (reserved for future chunk caching)
```

All writes use atomic pattern: write to `.tmp` file, then `fs.rename()`.

## 7. Configuration Options and Supported Document Types

### 7.1 Configuration Constants (`config.js`)

| Category | Key | Default | Description |
|----------|-----|---------|-------------|
| SESSION | `RETENTION_DAYS` | 30 | Days before closed sessions are auto-deleted |
| SESSION | `MAX_PER_PROJECT` | 50 | Maximum sessions per project |
| SESSION | `ID_PREFIX` | `ses_` | Session ID prefix |
| CHUNKING | `DEFAULT_SIZE` | 4000 | Default chunk size in characters |
| CHUNKING | `DEFAULT_OVERLAP` | 200 | Default overlap between chunks |
| CHUNKING | `MIN_SIZE` | 500 | Minimum allowed chunk size |
| CHUNKING | `MAX_SIZE` | 10000 | Maximum allowed chunk size |
| QUERY | `MAX_CONCURRENT` | 3 | Maximum concurrent REPL queries |
| QUERY | `TIMEOUT_MS` | 60000 | Query timeout (60 seconds) |
| QUERY | `ID_PREFIX` | `qry_` | Query ID prefix |
| SUB_AGENT | `MODEL` | `haiku` | Claude model for chunk analysis |
| EXPORT | `FORMATS` | `['json', 'markdown']` | Available export formats |
| FILE_LIMITS | `WARN_SIZE` | 10,485,760 (10MB) | Warning threshold |
| FILE_LIMITS | `MAX_SIZE` | 52,428,800 (50MB) | Rejection threshold |
| REPL | `PROTOCOL_VERSION` | `2.0` | JSON-RPC version |
| REPL | `SPAWN_TIMEOUT` | 10000 | REPL startup timeout (10s) |
| REPL | `HEALTHCHECK_INTERVAL` | 30000 | Healthcheck interval (30s) |

**Note**: The `puffin-plugin.json` manifest advertises `maxConcurrentQueries: 5` and `subAgentModel` as configurable, but the actual runtime defaults come from `config.js` which sets `MAX_CONCURRENT: 3` and `MODEL: 'haiku'`. The `ClaudeCodeClient` defaults to `maxConcurrent: 5`. This means REPL queries are limited to 3 concurrent, while Claude Code CLI queries are limited to 5 concurrent.

### 7.2 Orchestrator Configuration

The `RlmOrchestrator` has its own defaults:

| Key | Default | Description |
|-----|---------|-------------|
| `maxIterations` | 3 | Maximum RLM loop iterations |
| `chunksPerIteration` | 10 | Maximum chunks analyzed per iteration |
| `model` | `haiku` | Sub-LLM model |
| `maxConcurrent` | 5 | Maximum parallel Claude Code queries |

These can be updated at runtime via `rlm:configureOrchestrator` IPC.

### 7.3 Supported Document Types

Defined in `config.js` `SUPPORTED_EXTENSIONS`:

| Category | Extensions |
|----------|------------|
| Text/Docs | `.md`, `.txt`, `.rst`, `.adoc` |
| Data | `.json`, `.yaml`, `.yml`, `.toml`, `.xml`, `.csv` |
| Code | `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.rb`, `.java`, `.go`, `.rs`, `.c`, `.cpp`, `.h`, `.hpp`, `.cs`, `.swift`, `.kt`, `.php`, `.sh`, `.bash`, `.zsh`, `.ps1` |
| Web | `.html`, `.htm`, `.css`, `.scss`, `.less`, `.svg` |
| Config | `.ini`, `.cfg`, `.conf`, `.env`, `.properties` |
| Other | `.sql`, `.graphql`, `.proto`, `.tf`, `.log` |

The `rlm:showFileDialog` handler uses these extensions as native file dialog filters.

### 7.4 Security Considerations

- **Path traversal prevention**: `validateDocumentPath()` resolves paths and verifies they're within the project root (null byte check, `path.sep` boundary check)
- **Session ID validation**: Must match format `ses_[a-z0-9]+`, prevents directory traversal via session IDs
- **Python eval disabled by default**: `ReplManager.allowEval` defaults to `false`; the Python REPL's `eval` method executes with `__builtins__: {}` sandbox
- **Regex validation**: `validateGrepPattern()` tests pattern compilation before passing to Python REPL

## Appendix: File Map

| File | Lines | Purpose |
|------|-------|---------|
| `puffin-plugin.json` | 135 | Plugin manifest |
| `index.js` | 960 | Plugin entry point, IPC handler registration |
| `lib/config.js` | 173 | Configuration constants |
| `lib/session-store.js` | 554 | Session CRUD, query results, buffers, cleanup |
| `lib/session-state.js` | 386 | In-memory session state machine |
| `lib/schemas.js` | 416 | Data schemas and validation |
| `lib/validators.js` | 357 | Input validation utilities |
| `lib/chunk-strategy.js` | 352 | Three chunking algorithms |
| `lib/rlm-orchestrator.js` | 532 | RLM query loop orchestration |
| `lib/claude-code-client.js` | 501 | Claude Code CLI integration |
| `lib/repl-manager.js` | 497 | Python REPL lifecycle management |
| `lib/result-aggregator.js` | 328 | Finding aggregation and convergence |
| `lib/semaphore.js` | 143 | Concurrency control |
| `lib/python-detector.js` | 210 | Cross-platform Python detection |
| `lib/exporters.js` | 305 | JSON and Markdown export |
| `scripts/rlm_repl.py` | 457 | Python REPL (JSON-RPC server) |
| `renderer/components/index.js` | 37 | Renderer entry point |
| `renderer/components/RLMDocumentView.js` | — | Main view container |
| `renderer/components/DocumentPicker.js` | — | File selection |
| `renderer/components/QueryPanel.js` | — | Query input |
| `renderer/components/ResultsTree.js` | — | Results display |
| `renderer/components/ChunkInspector.js` | — | Chunk detail view |
| `renderer/components/SessionStatusDisplay.js` | — | Session status |
| `renderer/components/ExportControls.js` | — | Export UI |
| `renderer/components/Toast.js` | — | Toast notifications |
