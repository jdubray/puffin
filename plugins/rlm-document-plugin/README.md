# RLM Document Plugin

Recursive Language Model (RLM) analysis for large documents with iterative exploration, evidence extraction, and AI-powered synthesis.

## Credits

This plugin is inspired by and based on the **RLM (Recursive Language Model)** concept by [John Adeojo](https://github.com/brainqub3). The original Claude Code RLM skill can be found at:

**[https://github.com/brainqub3/claude_code_RLM](https://github.com/brainqub3/claude_code_RLM)**

The RLM approach enables analysis of documents that exceed LLM context windows by:
1. Chunking the document into manageable pieces
2. Using a "sub-LLM" to analyze each chunk against the user's query
3. Aggregating findings across chunks
4. Synthesizing a coherent answer from the extracted evidence

## Overview

The RLM Document Plugin provides a complete GUI for document analysis within Puffin, featuring:

- **Large document support**: Analyze documents that exceed context windows through intelligent chunking
- **AI-powered analysis**: Uses Claude Code CLI as the sub-LLM for chunk analysis
- **Iterative exploration**: Automatic refinement of queries across multiple iterations
- **Synthesis**: Combines extracted findings into coherent, well-structured answers
- **Interactive UI**: Full renderer interface with document picker, query panel, results tree, and chunk inspector
- **Session management**: Persistent sessions with automatic cleanup
- **Multiple export formats**: JSON and Markdown export of analysis results

## Quick Start

1. **Select a Document**: Click "Select Document" and choose a file to analyze (supports .txt, .md, .json, .js, .py, etc.)

2. **Enter a Query**: Type your question in the query panel (e.g., "Summarize the main concepts in this document")

3. **Run RLM Query**: Click the "RLM Query" button to start the analysis

4. **View Results**:
   - **Summary panel**: Shows the synthesized answer at the top
   - **Results tree**: Lists individual findings with source chunk references
   - **Chunk inspector**: Click any result to view the full chunk content

## Architecture

### How RLM Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Query                                │
│              "Summarize the BOLT methodology"                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    1. Keyword Search (REPL)                      │
│         Find chunks containing relevant keywords                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               2. Chunk Analysis (Claude Code CLI)                │
│   For each relevant chunk:                                       │
│   - Extract key findings                                         │
│   - Assess relevance and confidence                             │
│   - Suggest follow-up queries                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    3. Result Aggregation                         │
│   - Deduplicate findings                                         │
│   - Rank by confidence                                           │
│   - Check for convergence                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               4. Synthesis (Claude Code CLI)                     │
│   Combine all findings into a coherent answer                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Final Output                                │
│   - Synthesized summary with key points                          │
│   - Individual findings with source references                   │
│   - Full chunk content available for inspection                  │
└─────────────────────────────────────────────────────────────────┘
```

### Plugin Structure

```
rlm-document-plugin/
├── index.js                      # Main plugin entry point
├── puffin-plugin.json            # Plugin manifest
├── lib/
│   ├── repl-manager.js           # Python REPL process lifecycle
│   ├── rlm-orchestrator.js       # RLM query loop orchestration
│   ├── claude-code-client.js     # Claude Code CLI integration
│   ├── result-aggregator.js      # Finding aggregation & deduplication
│   ├── session-state.js          # Session state machine
│   ├── session-store.js          # Session persistence
│   ├── chunk-strategy.js         # Document chunking algorithms
│   ├── exporters.js              # JSON/Markdown export
│   ├── validators.js             # Input validation
│   ├── schemas.js                # Data structure definitions
│   ├── semaphore.js              # Concurrency control
│   ├── python-detector.js        # Cross-platform Python detection
│   └── config.js                 # Configuration constants
├── scripts/
│   └── rlm_repl.py               # Python REPL implementation
└── renderer/
    ├── index.js                  # Renderer entry point
    ├── components/
    │   ├── RLMDocumentView.js    # Main view container
    │   ├── DocumentPicker.js     # File selection component
    │   ├── QueryPanel.js         # Query input & controls
    │   ├── ResultsTree.js        # Results display tree
    │   ├── ChunkInspector.js     # Chunk content viewer
    │   ├── SessionStatusDisplay.js # Session status bar
    │   └── ExportControls.js     # Export functionality
    └── styles/
        ├── rlm-document.css      # Main layout styles
        ├── query-panel.css       # Query panel styles
        ├── results-tree.css      # Results tree styles
        └── chunk-inspector.css   # Chunk inspector styles
```

## Requirements

### Python

The plugin requires **Python 3.7+** to be installed and available in the system PATH.

**Supported Python executables** (by platform):
- **Windows**: `python`, `python3`, `py`
- **macOS/Linux**: `python3`, `python`

The plugin automatically detects and validates Python on activation.

### Claude Code CLI

The plugin uses the Claude Code CLI (`claude`) for AI-powered analysis. Ensure:
1. Claude Code is installed
2. The `claude` command is available in your PATH
3. You have an active Claude Code subscription

## Configuration

Configure the plugin via `rlm.*` settings in Puffin's configuration:

| Setting | Default | Description |
|---------|---------|-------------|
| `rlm.defaultChunkSize` | 4000 | Default chunk size in characters |
| `rlm.defaultOverlap` | 200 | Default overlap between chunks |
| `rlm.maxConcurrentQueries` | 5 | Maximum parallel chunk analyses |
| `rlm.subAgentModel` | "haiku" | Model for sub-LLM (haiku for speed, sonnet for quality) |
| `rlm.maxIterations` | 3 | Maximum RLM iterations before stopping |
| `rlm.sessionRetentionDays` | 30 | Days to retain inactive sessions |

## UI Components

### Document Picker
- Select files from the project directory
- Displays file name and path
- Shows document statistics after loading

### Query Panel
- Text input for natural language queries
- Query type selector:
  - **RLM Query**: Full iterative analysis with synthesis
  - **Quick Query**: Single-pass keyword search
  - **Peek**: View specific character ranges
  - **Grep**: Pattern search with regex support
- Progress indicator with phase tracking

### Results Panel
- **Summary**: Synthesized answer with key points and confidence level
- **Results Tree**: Collapsible list of individual findings
  - Sort by relevance or position
  - Filter by text search
  - Expand to see excerpts
  - Click "View Chunk" to inspect source

### Chunk Inspector
- Full content view of selected chunk
- Syntax highlighting (when Prism.js available)
- Navigation between chunks (prev/next)
- Copy to clipboard
- Context view (show surrounding chunks)

### Export Controls
- Export to JSON or Markdown
- Includes synthesis, findings, and metadata

## IPC Handlers

The plugin exposes the following IPC handlers:

### Session Management
- `initSession` - Initialize session for a document
- `closeSession` - Close session and cleanup
- `getSession` - Get session status
- `listSessions` - List all project sessions

### RLM Queries
- `executeRlmQuery` - Full RLM analysis with synthesis
- `query` - Simple keyword search
- `peek` - View content range
- `grep` - Pattern search

### Chunk Operations
- `getChunks` - Get all chunk metadata
- `getChunk` - Get specific chunk content

### Export
- `exportResults` - Export to JSON/Markdown
- `getExportFormats` - List available formats

## Chunking Strategies

1. **Character-based** (default): Fixed-size chunks with overlap
2. **Line-based**: Splits on line boundaries
3. **Semantic**: Splits on natural break points (paragraphs, sections)

## Troubleshooting

### Python Not Found
**Symptom**: "Python REPL is not available"

**Solution**:
1. Install Python 3.7+
2. Ensure Python is in system PATH
3. Restart Puffin

### Claude Code Not Found
**Symptom**: "Claude Code CLI not found"

**Solution**:
1. Install Claude Code
2. Ensure `claude` command is in PATH
3. Verify with `claude --version` in terminal

### No Results Found
**Symptom**: Query returns 0 findings

**Possible causes**:
- Document doesn't contain relevant content
- Keywords don't match document terminology
- Try rephrasing the query with different terms

### Synthesis Not Appearing
**Symptom**: Individual findings shown but no summary

**Solution**:
- Ensure findings were extracted (need at least 1)
- Check server logs for synthesis errors
- Verify Claude Code CLI is working

## Development

### Testing

```bash
npm test -- tests/plugins/rlm-*.test.js
```

### Extending

1. **Add chunking strategies**: Implement in `lib/chunk-strategy.js`
2. **Add export formats**: Implement in `lib/exporters.js`
3. **Add REPL methods**: Add to `scripts/rlm_repl.py` and `lib/repl-manager.js`
4. **Add UI components**: Add to `renderer/components/`

## License

MIT

## Acknowledgments

- **John Adeojo** ([@brainqub3](https://github.com/brainqub3)) - Original RLM concept and Claude Code skill
- **Anthropic** - Claude AI and Claude Code CLI
