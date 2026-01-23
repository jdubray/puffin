# RLM Document Plugin

Recursive Language Model analysis for large documents with iterative exploration and evidence extraction.

## Overview

The RLM Document Plugin provides session-based document analysis through a Python REPL interface, enabling:

- **Large document support**: Analyze documents that exceed context windows through intelligent chunking
- **Iterative exploration**: Use `peek`, `grep`, and `query` to scout and analyze documents
- **Session management**: Persistent sessions with automatic 30-day cleanup
- **Concurrency control**: Safe parallel execution with configurable limits
- **Multiple export formats**: JSON and Markdown export of analysis results
- **Evidence tracking**: Collect and organize findings with source references

## Architecture

### Plugin Structure

```
rlm-document-plugin/
├── index.js                  # Main plugin entry point
├── lib/
│   ├── repl-manager.js      # Python REPL process lifecycle
│   ├── session-store.js     # Session persistence and CRUD
│   ├── chunk-strategy.js    # Chunking algorithms
│   ├── validators.js        # Input validation utilities
│   ├── exporters.js         # JSON/Markdown export
│   ├── schemas.js           # Data structure definitions
│   ├── semaphore.js         # Concurrency control
│   ├── python-detector.js   # Cross-platform Python detection
│   └── config.js            # Configuration constants
├── scripts/
│   └── rlm_repl.py          # Python REPL implementation
└── puffin-plugin.json       # Plugin manifest
```

### Storage Layout

```
project-root/
└── .puffin/
    └── rlm-sessions/
        ├── index.json                # Session index
        └── {sessionId}/
            ├── metadata.json         # Session metadata
            ├── query-results/        # Query results per ID
            ├── buffers.json          # Intermediate buffers
            └── chunks/               # Materialized chunks (optional)
```

## Configuration

Configure the plugin via `rlm.*` settings in Puffin's configuration:

| Setting | Default | Description |
|---------|---------|-------------|
| `rlm.defaultChunkSize` | 4000 | Default chunk size in characters |
| `rlm.defaultOverlap` | 200 | Default overlap between chunks in characters |
| `rlm.maxConcurrentQueries` | 3 | Maximum parallel chunk queries |
| `rlm.subAgentModel` | "haiku" | Model for sub-agent chunk analysis |
| `rlm.sessionRetentionDays` | 30 | Days to retain inactive sessions before auto-cleanup |
| `rlm.maxSessionsPerProject` | 50 | Maximum number of sessions per project |
| `rlm.queryTimeoutMs` | 60000 | Timeout for individual chunk queries (ms) |

## IPC Handlers

The plugin exposes the following IPC handlers (prefixed with `rlm:`):

### Session Management

- **`init-session`** - Initialize a new RLM session for a document
  ```javascript
  {
    documentPath: "path/to/file.md",      // Relative path
    chunkSize: 4000,                       // Optional override
    chunkOverlap: 200                      // Optional override
  }
  ```
  Returns: `{ session, repl }` or `{ error }`

- **`close-session`** - Close a session and clean up REPL process
  ```javascript
  { sessionId: "ses_abc123" }
  ```
  Returns: `{ success: true }` or `{ error }`

- **`delete-session`** - Delete session and persisted data
  ```javascript
  { sessionId: "ses_abc123" }
  ```
  Returns: `{ success: true }` or `{ error }`

- **`list-sessions`** - List all sessions for the project
  ```javascript
  { includeMetadata: true, state: "active" }  // Optional filters
  ```
  Returns: `{ sessions: [...] }`

- **`get-session`** - Get session metadata and status
  ```javascript
  { sessionId: "ses_abc123", touch: true }  // touch updates lastAccessedAt
  ```
  Returns: `{ session, replStatus }` or `{ error }`

### Query Results

- **`get-query-results`** - Get query results for a session
  ```javascript
  { sessionId: "ses_abc123", queryId: "qry_xyz" }  // queryId optional
  ```
  Returns: `{ result }` or `{ results: [...] }` or `{ error }`

### Document Operations

- **`query`** - Execute a query against a document
  ```javascript
  { sessionId: "ses_abc123", query: "What is the main topic?" }
  ```
  Returns: `{ result: { query, keywords, relevantChunks, ... } }` or `{ error }`

- **`peek`** - View content at a specific character range
  ```javascript
  { sessionId: "ses_abc123", start: 0, end: 500 }
  ```
  Returns: `{ result: { content, startIndex, endIndex } }` or `{ error }`

- **`grep`** - Search for patterns in the document
  ```javascript
  { sessionId: "ses_abc123", pattern: "\\bfunction\\b", maxMatches: 10, contextLines: 2 }
  ```
  Returns: `{ result: { matches, totalMatches, ... } }` or `{ error }`

- **`get-chunks`** - Get chunk information for session
  ```javascript
  { sessionId: "ses_abc123", includeContent: false }
  ```
  Returns: `{ result: { chunks: [...], totalChunks, ... } }` or `{ error }`

- **`get-chunk`** - Get a specific chunk by index
  ```javascript
  { sessionId: "ses_abc123", index: 0 }
  ```
  Returns: `{ result: { index, content, metadata, ... } }` or `{ error }`

### Buffer Operations

- **`add-buffer`** - Add content to session buffer for intermediate results
  ```javascript
  { sessionId: "ses_abc123", content: "text", label: "extraction" }
  ```
  Returns: `{ result: { bufferId, label, ... } }` or `{ error }`

- **`get-buffers`** - Get all buffers for a session
  ```javascript
  { sessionId: "ses_abc123" }
  ```
  Returns: `{ result: { bufferCount, buffers: [...] } }` or `{ error }`

### Export & Configuration

- **`export-results`** - Export session results to JSON or Markdown
  ```javascript
  {
    sessionId: "ses_abc123",
    format: "json",                  // "json" or "markdown"
    exportOptions: { includeBuffers: true }
  }
  ```
  Returns: `{ export: { format, content, mimeType, filename }, session }` or `{ error }`

- **`get-export-formats`** - Get available export formats
  ```javascript
  {}
  ```
  Returns: `{ formats: ["json", "markdown"] }`

- **`get-config`** - Get plugin configuration and status
  ```javascript
  {}
  ```
  Returns: `{ config, pythonAvailable, pythonPath }`

- **`get-storage-stats`** - Get storage usage statistics
  ```javascript
  {}
  ```
  Returns: `{ stats: { sessionCount, totalSize, ... } }`

- **`get-repl-stats`** - Get REPL manager statistics
  ```javascript
  {}
  ```
  Returns: `{ stats: { activeReplCount, totalQueriesRun, ... } }` or `{ error }`

## Python Requirements

The plugin requires Python 3.7+ to be installed and available in the system PATH.

**Supported Python executables** (by platform):
- **Windows**: `python`, `python3`, `py`
- **macOS/Linux**: `python3`, `python`

The plugin automatically detects and validates Python on activation.

## Chunking Strategies

The plugin supports three chunking strategies:

1. **Character-based** (default): Splits document into fixed-size chunks with configurable overlap
   - Best for: Most documents
   - Configurable: size (default 4000), overlap (default 200)

2. **Line-based**: Splits on line boundaries
   - Best for: Code files, structured text
   - Preserves semantic units when lines are meaningful

3. **Semantic**: Splits on natural break points (paragraphs, sections)
   - Best for: Prose, documentation
   - Requires content analysis

## Session Lifecycle

### States

```
Pending → Active → Closed ↘
                    ↓
                  Expired (30+ days)
```

### Automatic Cleanup

Sessions are automatically cleaned up after 30 days of inactivity (last access time). Cleanup runs:
- Once on plugin activation
- Daily (24-hour interval)

### Manual Management

Users can explicitly close or delete sessions via IPC handlers.

## Error Handling

All handlers return error objects with the following structure:

```javascript
{ error: "Human-readable error message" }
```

Common error scenarios:
- **Invalid paths**: Files outside project directory (path traversal prevention)
- **Missing sessions**: Session ID not found
- **REPL unavailable**: Python not installed or REPL process crashed
- **File not found**: Document file doesn't exist
- **Invalid input**: Validation failures (invalid patterns, ranges, etc.)

## Query Method Implementation

⚠️ **Note**: The `query` method currently uses keyword-based matching as a placeholder. Full LLM integration is pending and will:
- Accept model configuration
- Support custom prompts
- Provide evidence with confidence scores
- Track token usage

Current placeholder returns:
```javascript
{
  query: "user query",
  keywords: ["extracted", "keywords"],
  relevantChunks: [
    { chunkIndex: 0, score: 2, preview: "..." }
  ],
  totalChunks: 15,
  note: "Full LLM integration pending..."
}
```

## Testing

Test files are located in `tests/plugins/`:

- `rlm-schemas.test.js` - Data structure validation
- `rlm-semaphore.test.js` - Concurrency control
- `rlm-validators.test.js` - Input validation

Run tests with:
```bash
npm test -- tests/plugins/rlm-*.test.js
```

## Development

### Adding Tests

For test examples, see existing test files. Key patterns:
- Mock context objects
- Verify error handling
- Test edge cases (empty files, invalid paths, etc.)

### Extending Functionality

The plugin is designed for extensibility:

1. **Add new chunking strategies**: Implement in `lib/chunk-strategy.js`
2. **Add export formats**: Implement in `lib/exporters.js`
3. **Add REPL methods**: Add to `scripts/rlm_repl.py` and `lib/repl-manager.js`
4. **Add validators**: Add to `lib/validators.js` for new input types

## Limitations & Known Issues

1. **Query method**: Placeholder implementation (pending LLM integration)
2. **No UI components**: Renderer UI can be added as a separate renderer plugin
3. **No manual cleanup trigger**: Sessions clean up automatically but no manual trigger exposed
4. **File size limits**:
   - Warning at 10MB
   - Hard limit at 50MB
5. **Concurrency**: Max 3 concurrent queries (configurable but not exposed to UI)

## Future Enhancements

### Phase 2: Renderer UI

- Document picker component
- Query panel with history
- Results tree view
- Chunk inspector/navigator

### Phase 3: Advanced Features

- Query history persistence
- Evidence export with citations
- Configuration UI for chunk parameters
- Session sharing between users

### Phase 4: Codebase Exploration

- Code indexer for project files
- Symbol resolution (functions, classes, imports)
- Dependency graph visualization
- Semantic chunking for code files

## Troubleshooting

### Python Not Found

**Symptom**: "Python REPL is not available"

**Solution**:
1. Ensure Python 3.7+ is installed
2. Check Python is in system PATH
3. Restart Puffin after installing Python

### Sessions Not Persisting

**Symptom**: Sessions lost after Puffin restart

**Solution**: Check `.puffin/rlm-sessions/` directory exists and is writable

### Queries Timing Out

**Symptom**: Query returns timeout error

**Solution**:
1. Increase `rlm.queryTimeoutMs` (default 60000ms)
2. Reduce `rlm.maxConcurrentQueries` to reduce system load
3. Check system resources (CPU, memory)

### Document Too Large

**Symptom**: "File exceeds maximum size"

**Solution**:
1. Split the document into smaller files
2. Use chunking to focus analysis on relevant sections

## API Reference

For detailed API documentation, see comments in:
- `lib/repl-manager.js` - REPL communication protocol
- `lib/session-store.js` - Storage and persistence
- `scripts/rlm_repl.py` - Python REPL JSON-RPC methods

## License

MIT
