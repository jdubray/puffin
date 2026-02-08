# RLM Document Plugin - Detailed Design

## Executive Summary

This document outlines the design for refactoring the current RLM (Recursive Language Model) implementation from a Claude Code skill/agent into a full Puffin plugin. The goal is to create a flexible document analysis tool that:

1. **Points to any large document** and enables RLM-style iterative analysis
2. **Manages sessions per document** with persistent state
3. **Integrates with Puffin's UI** for document selection and results display
4. **Lays groundwork** for future codebase exploration capabilities

### Why RLM Over RAG?

| Approach | Best For | Why |
|----------|----------|-----|
| **RAG** | Local answers | Semantic similarity works when relevance is localized |
| **REPL Loop** | Iterative inspection | Allows verification and exploration |
| **REPL + Recursion** | Deep dependencies | Handles cross-references, contracts, large codebases |

RLM treats documents as **navigable structures** rather than token streams, enabling analysis of artifacts with high information density and non-local dependencies.

---

## Current Implementation Analysis

### Existing Components

| Component | Location | Purpose |
|-----------|----------|--------|
| RLM Skill | `.claude/skills/rlm/SKILL.md` | Workflow definition for Claude Code |
| RLM Sub-Agent | `.claude/agents/rlm-subcall.md` | Lightweight chunk analyzer (Haiku model) |
| REPL Script | `.claude/skills/rlm/scripts/rlm_repl.py` | Stateful Python environment |
| State Storage | `.claude/rlm_state/` | Pickle files and chunk outputs |

### Current REPL Capabilities

```python
# Injected variables
context = {"path": str, "loaded_at": str, "content": str}
content = context["content"]  # Alias
buffers = []  # Intermediate results

# Helper functions
peek(start, end)           # View content ranges
grep(pattern, ...)         # Regex search with context
chunk_indices(size, overlap)  # Calculate boundaries
write_chunks(...)          # Materialize to files
add_buffer(text)           # Store intermediate results
```

### Gaps to Address

| Current State | Plugin Requirement |
|---------------|--------------------|
| CLI-driven | UI-integrated document picker |
| Single document in `.claude/` | Multi-document, project-level storage |
| Manual chunk management | Automated session lifecycle |
| State in pickle files | Structured JSON storage |
| No configuration UI | Settings panel for chunk parameters |

---

## Plugin Architecture

### File Structure

```
plugins/
└── rlm-document-plugin/
    ├── index.js                    # Main process entry point
    ├── package.json                # NPM metadata
    ├── puffin-plugin.json          # Plugin manifest
    ├── README.md                   # Documentation
    ├── lib/
    │   ├── repl-manager.js         # REPL process management
    │   ├── session-store.js        # Session persistence
    │   └── chunk-strategy.js       # Chunking algorithms
    ├── scripts/
    │   └── rlm_repl.py             # Python REPL (migrated)
    ├── renderer/
    │   ├── components/
    │   │   ├── index.js            # Component exports
    │   │   ├── RlmDocumentView.js  # Main plugin view
    │   │   ├── DocumentPicker.js   # File selection UI
    │   │   ├── QueryPanel.js       # Query input/history
    │   │   ├── ResultsTree.js      # Evidence tree display
    │   │   └── ChunkInspector.js   # Chunk preview/navigation
    │   └── styles/
    │       └── rlm-document.css
    └── config/
        └── default-config.json
```

### Plugin Manifest (puffin-plugin.json)

```json
{
  "name": "rlm-document-plugin",
  "version": "1.0.0",
  "displayName": "RLM Document Analyzer",
  "description": "Recursive Language Model analysis for large documents with iterative exploration and evidence extraction",
  "main": "index.js",
  
  "extensionPoints": {
    "actions": [
      "rlm:analyze-document",
      "rlm:query-context"
    ],
    "ipcHandlers": [
      "rlm-document:init-session",
      "rlm-document:close-session",
      "rlm-document:list-sessions",
      "rlm-document:query",
      "rlm-document:peek",
      "rlm-document:grep",
      "rlm-document:get-chunks",
      "rlm-document:export-results",
      "rlm-document:get-config",
      "rlm-document:set-config"
    ],
    "components": ["rlm-document-view"]
  },
  
  "contributes": {
    "views": [{
      "id": "rlm-document-view",
      "name": "Document Analyzer",
      "location": "nav",
      "icon": "🔍",
      "order": 350,
      "component": "RlmDocumentView"
    }],
    "configuration": {
      "title": "RLM Document Settings",
      "properties": {
        "rlm.defaultChunkSize": {
          "type": "number",
          "default": 4000,
          "description": "Default chunk size in characters"
        },
        "rlm.defaultOverlap": {
          "type": "number",
          "default": 200,
          "description": "Default overlap between chunks"
        },
        "rlm.maxConcurrentQueries": {
          "type": "number",
          "default": 3,
          "description": "Maximum parallel chunk queries"
        },
        "rlm.subAgentModel": {
          "type": "string",
          "default": "haiku",
          "enum": ["haiku", "sonnet"],
          "description": "Model for sub-agent chunk analysis"
        }
      }
    }
  },
  
  "activationEvents": ["onStartup"],
  
  "renderer": {
    "entry": "renderer/components/index.js",
    "components": [
      "RlmDocumentView",
      "DocumentPicker",
      "QueryPanel",
      "ResultsTree",
      "ChunkInspector"
    ],
    "styles": ["renderer/styles/rlm-document.css"]
  }
}
```

---

## Main Process Implementation

### Plugin Entry Point (index.js)

```javascript
const ReplManager = require('./lib/repl-manager')
const SessionStore = require('./lib/session-store')
const path = require('path')
const fs = require('fs').promises

const Plugin = {
  context: null,
  replManager: null,
  sessionStore: null,
  
  async activate(context) {
    this.context = context
    
    // Initialize session store (project-level storage)
    const storageDir = path.join(context.projectPath, '.puffin', 'rlm-sessions')
    this.sessionStore = new SessionStore(storageDir)
    await this.sessionStore.initialize()
    
    // Initialize REPL manager
    const scriptPath = path.join(__dirname, 'scripts', 'rlm_repl.py')
    this.replManager = new ReplManager(scriptPath, this.sessionStore)
    
    // Register IPC handlers
    this.registerHandlers(context)
    
    context.log.info('[rlm-document-plugin] Activated')
  },
  
  async deactivate() {
    // Cleanup all REPL processes
    if (this.replManager) {
      await this.replManager.closeAll()
    }
    this.context.log.info('[rlm-document-plugin] Deactivated')
  },
  
  registerHandlers(context) {
    // Session management
    context.registerIpcHandler('rlm-document:init-session', 
      this.initSession.bind(this))
    context.registerIpcHandler('rlm-document:close-session', 
      this.closeSession.bind(this))
    context.registerIpcHandler('rlm-document:list-sessions', 
      this.listSessions.bind(this))
    
    // Document operations
    context.registerIpcHandler('rlm-document:query', 
      this.executeQuery.bind(this))
    context.registerIpcHandler('rlm-document:peek', 
      this.peekContent.bind(this))
    context.registerIpcHandler('rlm-document:grep', 
      this.grepContent.bind(this))
    context.registerIpcHandler('rlm-document:get-chunks', 
      this.getChunks.bind(this))
    
    // Results
    context.registerIpcHandler('rlm-document:export-results', 
      this.exportResults.bind(this))
    
    // Configuration
    context.registerIpcHandler('rlm-document:get-config', 
      this.getConfig.bind(this))
    context.registerIpcHandler('rlm-document:set-config', 
      this.setConfig.bind(this))
  },
  
  // Handler implementations...
}

module.exports = Plugin
```

### Session Management

```javascript
async initSession({ documentPath, options = {} }) {
  // Validate path is within project
  const absolutePath = path.resolve(this.context.projectPath, documentPath)
  if (!absolutePath.startsWith(this.context.projectPath)) {
    throw new Error('Document must be within project directory')
  }
  
  // Check file exists and is readable
  await fs.access(absolutePath, fs.constants.R_OK)
  const stats = await fs.stat(absolutePath)
  
  // Create session
  const session = await this.sessionStore.createSession({
    documentPath: absolutePath,
    relativePath: documentPath,
    fileSize: stats.size,
    config: {
      chunkSize: options.chunkSize || this.config.defaultChunkSize,
      overlap: options.overlap || this.config.defaultOverlap
    }
  })
  
  // Initialize REPL for this session
  await this.replManager.initRepl(session.id, absolutePath)
  
  return session
}

async closeSession({ sessionId }) {
  await this.replManager.closeRepl(sessionId)
  await this.sessionStore.closeSession(sessionId)
  return { success: true }
}

async listSessions() {
  return this.sessionStore.listSessions()
}
```

### REPL Manager (lib/repl-manager.js)

```javascript
const { spawn } = require('child_process')
const path = require('path')

class ReplManager {
  constructor(scriptPath, sessionStore) {
    this.scriptPath = scriptPath
    this.sessionStore = sessionStore
    this.processes = new Map()  // sessionId -> { process, state }
  }
  
  async initRepl(sessionId, documentPath) {
    // Spawn Python process
    const proc = spawn('python', [this.scriptPath], {
      cwd: path.dirname(documentPath),
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    // Send init command
    await this.sendCommand(proc, `init ${documentPath}`)
    
    this.processes.set(sessionId, {
      process: proc,
      documentPath,
      state: 'ready'
    })
    
    return { status: 'initialized' }
  }
  
  async executeCode(sessionId, code) {
    const session = this.processes.get(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    
    return this.sendCommand(session.process, `exec -c "${code}"`)
  }
  
  async peek(sessionId, start, end) {
    return this.executeCode(sessionId, `peek(${start}, ${end})`)
  }
  
  async grep(sessionId, pattern, options = {}) {
    const { maxMatches = 10, window = 100 } = options
    return this.executeCode(sessionId, 
      `grep(r"${pattern}", max_matches=${maxMatches}, window=${window})`
    )
  }
  
  async closeRepl(sessionId) {
    const session = this.processes.get(sessionId)
    if (session) {
      session.process.kill()
      this.processes.delete(sessionId)
    }
  }
  
  async closeAll() {
    for (const sessionId of this.processes.keys()) {
      await this.closeRepl(sessionId)
    }
  }
}

module.exports = ReplManager
```

---

## Storage Schema

### Project-Level Storage Structure

```
project-root/
└── .puffin/
    └── rlm-sessions/
        ├── sessions.json           # Session index
        └── sessions/
            └── {sessionId}/
                ├── metadata.json   # Session metadata
                ├── chunks/         # Materialized chunks
                ├── results/        # Query results
                └── buffers.json    # Intermediate buffers
```

### Session Metadata (metadata.json)

```json
{
  "id": "ses_abc123",
  "documentPath": "/absolute/path/to/document.md",
  "relativePath": "docs/large-document.md",
  "fileSize": 524288,
  "createdAt": "2026-01-22T10:30:00Z",
  "lastAccessedAt": "2026-01-22T11:45:00Z",
  "config": {
    "chunkSize": 4000,
    "overlap": 200
  },
  "stats": {
    "totalChunks": 15,
    "queriesRun": 8,
    "evidenceCollected": 23
  },
  "state": "active"
}
```

### Query Results (results/{queryId}.json)

```json
{
  "id": "qry_xyz789",
  "sessionId": "ses_abc123",
  "query": "What are the indemnification clauses?",
  "timestamp": "2026-01-22T11:00:00Z",
  "strategy": "recursive",
  "evidence": [
    {
      "chunkId": "chunk_003",
      "findings": [
        {
          "point": "Section 8.1 defines general indemnification",
          "evidence": "The Seller shall indemnify...",
          "confidence": "high",
          "lineRange": [1245, 1267]
        }
      ],
      "suggestedNext": ["Check Section 8.2 for exceptions"]
    }
  ],
  "synthesis": "The document contains three indemnification clauses...",
  "tokensUsed": 12450
}
```

---

## Renderer Components

### Main View (RlmDocumentView.js)

```javascript
class RlmDocumentView {
  constructor(intents) {
    this.intents = intents
    this.currentSession = null
    this.element = null
  }
  
  render(state) {
    return `
      <div class="rlm-document-view">
        <div class="rlm-sidebar">
          ${this.renderSessionList(state.rlmSessions)}
          <button class="rlm-new-session" onclick="rlm.openDocumentPicker()">
            + New Document
          </button>
        </div>
        <div class="rlm-main">
          ${this.currentSession 
            ? this.renderActiveSession(this.currentSession)
            : this.renderEmptyState()
          }
        </div>
      </div>
    `
  }
  
  renderActiveSession(session) {
    return `
      <div class="rlm-session-header">
        <h2>${session.relativePath}</h2>
        <span class="rlm-file-size">${this.formatSize(session.fileSize)}</span>
      </div>
      <div class="rlm-query-panel">
        ${new QueryPanel(this.intents).render(session)}
      </div>
      <div class="rlm-results-panel">
        ${new ResultsTree(this.intents).render(session.results)}
      </div>
      <div class="rlm-chunk-inspector">
        ${new ChunkInspector(this.intents).render(session)}
      </div>
    `
  }
}
```

### Query Panel (QueryPanel.js)

```javascript
class QueryPanel {
  render(session) {
    return `
      <div class="rlm-query-input">
        <textarea 
          id="rlm-query" 
          placeholder="Ask a question about this document..."
          rows="3"
        ></textarea>
        <div class="rlm-query-options">
          <select id="rlm-strategy">
            <option value="single">Single Pass</option>
            <option value="recursive" selected>Recursive (Recommended)</option>
          </select>
          <button onclick="rlm.executeQuery()">Analyze</button>
        </div>
      </div>
      <div class="rlm-query-history">
        ${this.renderHistory(session.queryHistory)}
      </div>
    `
  }
}
```

---

## Integration with Claude Code Skill

The plugin will also expose a Claude Code skill interface for command-line usage:

### Updated Skill Definition

```markdown
# RLM Document Analysis Skill

Use this skill for analyzing large documents that exceed context windows.

## Invocation

Triggered via `/rlm` or when explicitly requested for document analysis.

## Workflow

1. **Document Selection**: Use `rlm-document:init-session` to initialize
2. **Exploration**: Use `peek` and `grep` to scout the document
3. **Chunking**: Automatically managed by the plugin
4. **Analysis**: Sub-agent queries via `rlm-document:query`
5. **Synthesis**: Combine evidence from chunk analysis
```

---

## Migration Path

### Phase 1: Plugin Infrastructure
1. Create plugin directory structure
2. Migrate `rlm_repl.py` to plugin scripts
3. Implement session management
4. Create basic IPC handlers

### Phase 2: UI Integration
1. Build document picker component
2. Create query panel
3. Implement results tree view
4. Add chunk inspector

### Phase 3: Enhanced Features
1. Query history persistence
2. Evidence export (Markdown, JSON)
3. Configuration UI
4. Session sharing

### Phase 4: Deprecate Old Implementation
1. Update skill to use plugin IPC
2. Remove `.claude/rlm_state/` usage
3. Document migration for existing users

---

## Future: Codebase Exploration

The plugin architecture supports future expansion to codebase analysis:

### Planned Extensions

| Feature | Description |
|---------|-------------|
| **Code Indexer** | Build navigable index from project files |
| **Symbol Resolution** | Track function/class definitions and references |
| **Dependency Graph** | Map file and module dependencies |
| **Semantic Chunking** | Chunk by functions/classes instead of characters |

### Metadata Schema (Future)

```json
{
  "type": "codebase",
  "language": "javascript",
  "entryPoints": ["src/main/index.js"],
  "includePatterns": ["src/**/*.js"],
  "excludePatterns": ["node_modules/**"],
  "symbolIndex": {
    "functions": {},
    "classes": {},
    "exports": {}
  }
}
```

---

## Summary

This design transforms the RLM skill from a CLI-only tool into a full Puffin plugin with:

- **Flexible document targeting** via session-based architecture
- **Project-level storage** for multi-document management
- **UI integration** for visual exploration and results
- **Preserved REPL capabilities** for power users
- **Future-ready architecture** for codebase exploration

The plugin follows Puffin's established patterns while introducing session management suited to RLM's stateful nature.

---

## Implementation Decisions

This section documents the decisions made during the design review for implementation.

### Session Management

| Decision | Value | Rationale |
|----------|-------|-----------|
| **Session Cleanup Policy** | 30 days auto-cleanup | Sessions older than 30 days are automatically purged to prevent storage bloat |
| **Max Sessions Per Project** | 50 | Reasonable limit to prevent excessive resource usage |
| **Session State Storage** | JSON (not pickle) | JSON provides human-readable persistence, easier debugging, and cross-platform compatibility |

### Concurrency Control

| Decision | Value | Rationale |
|----------|-------|-----------|
| **Max Concurrent Queries** | 3 | Prevents overwhelming the sub-agent model with parallel requests while allowing meaningful parallelism |
| **Semaphore Implementation** | Counting semaphore | Use a simple counting semaphore pattern in JavaScript to limit parallel chunk processing |
| **Query Timeout** | 60 seconds | Per-chunk query timeout to prevent hung processes |

### Python REPL Communication

| Decision | Value | Rationale |
|----------|-------|-----------|
| **Protocol** | JSON-RPC over stdin/stdout | Simple, debuggable, and well-supported protocol |
| **Command Format** | `{"jsonrpc": "2.0", "method": "...", "params": {...}, "id": n}` | Standard JSON-RPC 2.0 for extensibility |
| **Response Format** | `{"jsonrpc": "2.0", "result": {...}, "id": n}` or `{"jsonrpc": "2.0", "error": {...}, "id": n}` | Consistent error handling |

### Export Formats

| Format | Included | Rationale |
|--------|----------|-----------|
| **JSON** | Yes | Full fidelity export with all metadata |
| **Markdown** | Yes | Human-readable reports for sharing |
| **HTML** | No (deferred) | Added complexity; Markdown can be converted externally |
| **CSV** | No | Evidence structure doesn't map well to flat format |

### Configuration Defaults

```json
{
  "rlm.defaultChunkSize": 4000,
  "rlm.defaultOverlap": 200,
  "rlm.maxConcurrentQueries": 3,
  "rlm.subAgentModel": "haiku",
  "rlm.sessionRetentionDays": 30,
  "rlm.maxSessionsPerProject": 50,
  "rlm.queryTimeoutMs": 60000
}
```

### IPC Handler Naming Convention

All IPC handlers use the `rlm-document:` prefix for consistency with Puffin's plugin conventions:

| Handler | Purpose |
|---------|---------|
| `rlm-document:init-session` | Create new analysis session for document |
| `rlm-document:close-session` | Close session and cleanup REPL process |
| `rlm-document:list-sessions` | Get all sessions for current project |
| `rlm-document:query` | Execute RLM query against document |
| `rlm-document:peek` | View content range by character positions |
| `rlm-document:grep` | Search document with regex pattern |
| `rlm-document:get-chunks` | Retrieve chunk boundaries and metadata |
| `rlm-document:export-results` | Export query results to JSON/Markdown |
| `rlm-document:get-config` | Retrieve current configuration |
| `rlm-document:set-config` | Update configuration values |

### Error Handling Strategy

| Scenario | Behavior |
|----------|----------|
| **REPL process crash** | Auto-restart with last known state, notify user |
| **Query timeout** | Return partial results with timeout indicator |
| **File not found** | Return clear error, session marked as stale |
| **Invalid document path** | Reject with security error (path traversal protection) |

### Security Considerations

1. **Path Validation**: All document paths must resolve within project directory
2. **REPL Isolation**: Each session runs in isolated Python process
3. **No Shell Execution**: REPL commands are not passed through shell
4. **Input Sanitization**: Query strings are sanitized before REPL execution

### Open Questions (Deferred)

These items are noted for future consideration but not blocking implementation:

1. **Session Sharing**: How to share sessions between team members (Phase 3)
2. **Real-time Collaboration**: Multiple users analyzing same document (future)
3. **Offline Mode**: Caching strategy when AI service unavailable (future)
4. **Custom Chunking Strategies**: User-defined chunking algorithms (Phase 3)

---

## Review Changelog

| Date | Reviewer | Changes |
|------|----------|---------|
| 2026-01-22 | Claude | Initial implementation decisions documented |
