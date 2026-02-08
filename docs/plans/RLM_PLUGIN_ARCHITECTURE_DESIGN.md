# RLM Plugin Architecture Design

## Option 3: Hybrid JS Orchestration + Python Worker

### Design Constraint

**No API Key Required**: Puffin is a GUI frontend for Claude Code subscribers. All LLM calls
must delegate to Claude Code CLI rather than calling the Anthropic API directly. This means:
- Users don't need to manage API keys
- Usage is covered by their Claude Code subscription
- The orchestrator invokes Claude Code as a subprocess for sub-LLM queries

### Overview

This design separates concerns between JavaScript (orchestration, state management, Claude Code delegation) and Python (document processing, chunking, search). The Puffin plugin becomes the central orchestrator for RLM sessions, while the Python REPL remains a stateless document processing worker.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PUFFIN APPLICATION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  RENDERER PROCESS                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  RLM Plugin UI (RLMDocumentView)                                    │   │
│  │  ├── DocumentPicker                                                 │   │
│  │  ├── QueryPanel                                                     │   │
│  │  ├── ResultsTree                                                    │   │
│  │  ├── ChunkInspector                                                 │   │
│  │  └── SessionStatusDisplay                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │ IPC                                          │
├──────────────────────────────┼──────────────────────────────────────────────┤
│  MAIN PROCESS                │                                              │
│  ┌───────────────────────────▼─────────────────────────────────────────┐   │
│  │  RLM Plugin Backend (index.js)                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  RLM Orchestrator (NEW)                                     │   │   │
│  │  │  ├── Session State Machine                                  │   │   │
│  │  │  ├── Query Loop Controller                                  │   │   │
│  │  │  ├── Result Aggregator                                      │   │   │
│  │  │  └── Claude Code Client (subprocess)                        │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                      │   │
│  │  ┌───────────────────────────▼─────────────────────────────────┐   │   │
│  │  │  Document Processor (Python REPL Manager)                   │   │   │
│  │  │  ├── Chunking Engine                                        │   │   │
│  │  │  ├── Search/Grep                                            │   │   │
│  │  │  ├── Peek/Range Access                                      │   │   │
│  │  │  └── Buffer Management                                      │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │ Child Process (stdio)                        │
├──────────────────────────────┼──────────────────────────────────────────────┤
│  PYTHON SUBPROCESS           │        CLAUDE CODE CLI                       │
│  ┌───────────────────────────▼──────┐  ┌────────────────────────────────┐  │
│  │  rlm_repl.py (Document Worker)   │  │  claude (Sub-LLM queries)      │  │
│  │  ├── JSON-RPC Protocol           │  │  ├── --print mode              │  │
│  │  ├── Document Loading            │  │  ├── Haiku model (fast/cheap)  │  │
│  │  ├── Character Chunking          │  │  └── JSON output parsing       │  │
│  │  ├── Regex Search                                                   │   │
│  │  └── Content Extraction                                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                               │
                               │ HTTPS (Optional)
                               ▼
                    ┌─────────────────────┐
                    │   Anthropic API     │
                    │   (Sub-LLM calls)   │
                    └─────────────────────┘
```

---

## Component Responsibilities

### 1. RLM Orchestrator (NEW - JavaScript)

The orchestrator is the brain of the RLM system, managing the iterative query loop.

**Location:** `plugins/rlm-document-plugin/lib/rlm-orchestrator.js`

```javascript
/**
 * RLM Orchestrator - Manages the recursive document analysis loop
 *
 * Responsibilities:
 * - Maintain session state machine
 * - Control the query/refine/aggregate loop
 * - Coordinate between UI, document processor, and LLM
 * - Manage result history and convergence detection
 */
class RlmOrchestrator {
  constructor(options) {
    this.replManager = options.replManager
    this.llmClient = options.llmClient
    this.config = options.config
    this.sessions = new Map()
  }

  /**
   * Execute an RLM query with iterative refinement
   */
  async executeQuery(sessionId, query, options = {}) {
    const session = this.sessions.get(sessionId)
    const maxIterations = options.maxIterations || 3

    // Initialize query state
    const queryState = {
      originalQuery: query,
      currentQuery: query,
      iteration: 0,
      chunks: [],
      findings: [],
      converged: false
    }

    while (!queryState.converged && queryState.iteration < maxIterations) {
      queryState.iteration++

      // Step 1: Get relevant chunks from document processor
      const searchResults = await this.replManager.executeQuery(
        sessionId,
        queryState.currentQuery
      )

      // Step 2: For each chunk, call sub-LLM to extract findings
      const chunkFindings = await this.processChunksWithLLM(
        searchResults.relevantChunks,
        queryState.currentQuery,
        session
      )

      // Step 3: Aggregate and check for convergence
      queryState.findings.push(...chunkFindings)
      queryState.converged = this.checkConvergence(queryState)

      // Step 4: Refine query if not converged
      if (!queryState.converged) {
        queryState.currentQuery = await this.refineQuery(queryState)
      }
    }

    // Final aggregation
    return this.aggregateFindings(queryState)
  }
}
```

### 2. Claude Code Client (NEW - JavaScript)

Delegates LLM queries to Claude Code CLI. This leverages the user's existing Claude Code
subscription - no API key management required.

**Location:** `plugins/rlm-document-plugin/lib/claude-code-client.js`

```javascript
const { spawn } = require('child_process')

/**
 * Claude Code Client
 *
 * Invokes Claude Code CLI as a subprocess for sub-LLM queries.
 * Uses --print mode for non-interactive, single-response queries.
 *
 * Benefits:
 * - No API key required (uses Claude Code subscription)
 * - Consistent with user's existing Claude Code setup
 * - Can specify model (haiku for speed/cost)
 */
class ClaudeCodeClient {
  constructor(options = {}) {
    this.claudePath = options.claudePath || 'claude'  // Assumes claude is in PATH
    this.model = options.model || 'haiku'  // Use haiku for sub-LLM (fast/cheap)
    this.timeout = options.timeout || 30000  // 30s timeout per query
    this.maxConcurrent = options.maxConcurrent || 3
    this._activeQueries = 0
  }

  /**
   * Query Claude Code with a chunk of context
   * @param {string} context - Document chunk content
   * @param {string} question - Analysis question
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Parsed findings
   */
  async query(context, question, options = {}) {
    const prompt = this.buildPrompt(context, question)

    // Wait if at concurrency limit
    while (this._activeQueries >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    this._activeQueries++
    try {
      const response = await this.invokeClaudeCode(prompt, options)
      return this.parseResponse(response)
    } finally {
      this._activeQueries--
    }
  }

  /**
   * Invoke Claude Code CLI
   */
  async invokeClaudeCode(prompt, options = {}) {
    return new Promise((resolve, reject) => {
      const args = [
        '--print',           // Non-interactive, single response
        '--model', this.model,
        '--max-tokens', String(options.maxTokens || 1024)
      ]

      // Add prompt via stdin to avoid shell escaping issues
      const proc = spawn(this.claudePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.timeout
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', data => { stdout += data.toString() })
      proc.stderr.on('data', data => { stderr += data.toString() })

      proc.on('close', code => {
        if (code === 0) {
          resolve(stdout.trim())
        } else {
          reject(new Error(`Claude Code exited with code ${code}: ${stderr}`))
        }
      })

      proc.on('error', reject)

      // Send prompt via stdin
      proc.stdin.write(prompt)
      proc.stdin.end()
    })
  }

  /**
   * Build the sub-LLM prompt
   */
  buildPrompt(context, question) {
    return `You are analyzing a document chunk as part of an RLM (Recursive Language Model) analysis.

<document_chunk>
${context}
</document_chunk>

<analysis_question>
${question}
</analysis_question>

Analyze this chunk and respond with a JSON object:
{
  "relevant": true or false,
  "findings": ["concise finding 1", "concise finding 2"],
  "confidence": "high", "medium", or "low",
  "keyTerms": ["important", "terms", "found"],
  "suggestedFollowup": "optional refined query if more context needed"
}

Only include findings that directly answer the question. Be concise.`
  }

  /**
   * Parse Claude's response into structured findings
   */
  parseResponse(response) {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0])
      } catch (e) {
        // Fall through to text parsing
      }
    }

    // Fallback: treat entire response as a finding
    return {
      relevant: true,
      findings: [response.trim()],
      confidence: 'medium',
      keyTerms: [],
      suggestedFollowup: null
    }
  }

  /**
   * Batch query multiple chunks (with concurrency control)
   */
  async queryBatch(chunks, question, options = {}) {
    const results = await Promise.all(
      chunks.map(chunk => this.query(chunk.content, question, options))
    )
    return results.map((result, i) => ({
      chunkIndex: chunks[i].index,
      chunkId: chunks[i].id,
      ...result
    }))
  }
}

module.exports = { ClaudeCodeClient }
```

### Alternative: Mock Client for Testing

```javascript
/**
 * Mock client for testing without Claude Code
 */
class MockClaudeClient {
  async query(context, question) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100))

    // Simple keyword-based mock response
    const keywords = question.toLowerCase().split(/\s+/)
    const contextLower = context.toLowerCase()
    const matches = keywords.filter(k => k.length > 3 && contextLower.includes(k))

    return {
      relevant: matches.length > 0,
      findings: matches.length > 0
        ? [`Found ${matches.length} keyword matches: ${matches.join(', ')}`]
        : [],
      confidence: matches.length > 2 ? 'high' : matches.length > 0 ? 'medium' : 'low',
      keyTerms: matches,
      suggestedFollowup: null
    }
  }
}
```

### 3. Session State Machine (NEW - JavaScript)

Manages session lifecycle and state transitions.

**Location:** `plugins/rlm-document-plugin/lib/session-state.js`

```javascript
/**
 * Session States:
 *
 * INITIALIZING → READY → QUERYING → PROCESSING → READY
 *                  │                    │
 *                  └──── CLOSED ←───────┘
 */
const SessionState = {
  INITIALIZING: 'initializing',
  READY: 'ready',
  QUERYING: 'querying',
  PROCESSING: 'processing',
  CLOSED: 'closed',
  ERROR: 'error'
}

class SessionStateMachine {
  constructor(sessionId) {
    this.sessionId = sessionId
    this.state = SessionState.INITIALIZING
    this.history = []
    this.queryHistory = []
    this.findings = []
  }

  transition(newState, metadata = {}) {
    const oldState = this.state
    this.state = newState
    this.history.push({
      from: oldState,
      to: newState,
      timestamp: Date.now(),
      ...metadata
    })
    return this
  }

  canQuery() {
    return this.state === SessionState.READY
  }

  recordQuery(query, results) {
    this.queryHistory.push({
      query,
      results,
      timestamp: Date.now()
    })
  }

  addFindings(findings) {
    this.findings.push(...findings)
  }

  getAggregatedFindings() {
    // Deduplicate and rank findings
    return this.deduplicateFindings(this.findings)
  }
}
```

### 4. Document Processor (Existing - Python)

The Python REPL remains largely unchanged but becomes a stateless worker.

**Modifications to `rlm_repl.py`:**

```python
# Add semantic chunking option (future enhancement)
def method_init(self, params):
    """
    Enhanced init with chunking strategy selection
    """
    self.chunk_strategy = params.get("chunkStrategy", "character")

    if self.chunk_strategy == "semantic":
        self._compute_semantic_chunks()
    else:
        self._compute_character_chunks()

# Add batch operations for efficiency
def method_batch_peek(self, params):
    """
    Peek at multiple ranges in one call
    """
    ranges = params.get("ranges", [])
    results = []
    for r in ranges:
        results.append(self.method_peek(r))
    return {"results": results}
```

---

## Data Flow

### Query Execution Flow

```
User submits query
        │
        ▼
┌───────────────────┐
│  RLMDocumentView  │ (Renderer)
│  handleQuerySubmit│
└─────────┬─────────┘
          │ IPC: rlm:executeRlmQuery
          ▼
┌───────────────────┐
│   RLM Plugin      │ (Main Process)
│   Backend         │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐     ┌─────────────────┐
│  RLM Orchestrator │────▶│  Python REPL    │
│                   │     │  (get chunks)   │
│  for each chunk:  │     └─────────────────┘
│    │              │
│    ▼              │     ┌─────────────────┐
│  ┌────────────┐   │────▶│  LLM Client     │
│  │ Sub-LLM    │   │     │  (analyze)      │
│  │ Query      │   │     └─────────────────┘
│  └────────────┘   │
│    │              │
│    ▼              │
│  Aggregate        │
│  Check convergence│
│    │              │
└────┼──────────────┘
     │
     ▼
┌───────────────────┐
│  Results to UI    │
│  (streaming)      │
└───────────────────┘
```

### Streaming Results

```javascript
// In orchestrator - emit progress events
async executeQuery(sessionId, query, options) {
  const emitter = new EventEmitter()

  // Return emitter immediately for streaming
  setImmediate(async () => {
    for await (const chunk of this.iterateChunks(sessionId, query)) {
      emitter.emit('chunk:processing', { chunkIndex: chunk.index })

      const finding = await this.processChunkWithLLM(chunk)
      emitter.emit('finding', finding)
    }

    emitter.emit('complete', this.aggregateFindings())
  })

  return emitter
}
```

---

## IPC Interface

### New IPC Handlers

```javascript
// Plugin backend registers these handlers:

// Full RLM query with orchestration
'rlm:executeRlmQuery': async ({ sessionId, query, options }) => {
  return orchestrator.executeQuery(sessionId, query, options)
}

// Streaming RLM query
'rlm:executeRlmQueryStream': async ({ sessionId, query, options }) => {
  const emitter = orchestrator.executeQueryStream(sessionId, query, options)
  // Return stream ID, client subscribes via separate channel
  return { streamId: emitter.id }
}

// Get orchestrator status
'rlm:getOrchestratorStatus': async ({ sessionId }) => {
  return orchestrator.getSessionStatus(sessionId)
}

// Configure LLM client
'rlm:configureLlm': async ({ mode, apiKey, model }) => {
  return orchestrator.configureLlmClient({ mode, apiKey, model })
}
```

---

## Configuration

### Plugin Configuration Schema

```javascript
// In puffin-plugin.json
{
  "configuration": {
    "rlm.orchestrator.maxIterations": {
      "type": "number",
      "default": 3,
      "description": "Maximum query refinement iterations"
    },
    "rlm.orchestrator.convergenceThreshold": {
      "type": "number",
      "default": 0.8,
      "description": "Similarity threshold for convergence detection"
    },
    "rlm.llm.mode": {
      "type": "string",
      "enum": ["auto", "api", "cli", "mock"],
      "default": "auto",
      "description": "LLM client mode"
    },
    "rlm.llm.model": {
      "type": "string",
      "default": "claude-3-haiku-20240307",
      "description": "Model for sub-LLM queries"
    },
    "rlm.chunking.strategy": {
      "type": "string",
      "enum": ["character", "semantic", "hybrid"],
      "default": "character",
      "description": "Document chunking strategy"
    }
  }
}
```

---

## File Structure

```
plugins/rlm-document-plugin/
├── index.js                    # Plugin entry, IPC handlers
├── puffin-plugin.json          # Manifest with configuration
│
├── lib/
│   ├── rlm-orchestrator.js     # NEW: Query loop controller
│   ├── claude-code-client.js   # NEW: Claude Code CLI delegation
│   ├── session-state.js        # NEW: State machine
│   ├── result-aggregator.js    # NEW: Finding aggregation
│   ├── convergence.js          # NEW: Convergence detection
│   ├── repl-manager.js         # EXISTING: Python REPL manager
│   ├── session-manager.js      # EXISTING: Session lifecycle
│   └── config.js               # EXISTING: Configuration
│
├── scripts/
│   └── rlm_repl.py             # EXISTING: Python document worker
│
└── renderer/
    └── components/             # EXISTING: UI components
```

---

## Migration Path

### Phase 1: Foundation (Current Sprint)
- [x] Fix IPC communication
- [x] Fix result display
- [ ] Add result transformation layer

### Phase 2: Orchestrator MVP
- [ ] Create `rlm-orchestrator.js` skeleton
- [ ] Implement basic query loop (single iteration)
- [ ] Add mock LLM client for testing

### Phase 3: Claude Code Integration
- [ ] Implement Claude Code CLI client
- [ ] Add streaming support for progress feedback
- [ ] Implement convergence detection

### Phase 4: Advanced Features
- [ ] Multi-iteration refinement
- [ ] Query history and caching
- [ ] Semantic chunking option

---

## Open Questions

1. **Claude Code Availability**: How to handle when Claude Code is not installed/running?
   - Option A: Show error, require Claude Code
   - Option B: Fall back to keyword-only mode (current REPL behavior)
   - Option C: Prompt user to start Claude Code

2. **Model Selection**: Should users be able to choose the sub-LLM model?
   - Haiku is fastest/cheapest for sub-queries
   - Sonnet for higher quality analysis
   - Could be a plugin setting

3. **Concurrent Query Limits**: How many Claude Code subprocesses to run?
   - Too many = resource contention, rate limits
   - Too few = slow for large documents
   - Default: 3 concurrent, configurable

4. **Progress Feedback**: How to show progress during multi-chunk analysis?
   - Stream findings as they arrive
   - Show chunk processing count (e.g., "Analyzing 5/20 chunks...")
   - Estimated time remaining?

5. **Result Caching**: Should we cache sub-LLM responses?
   - Same chunk + same query = same result
   - Reduces API calls for repeated queries
   - Cache invalidation when document changes

---

## Benefits of This Architecture

1. **Separation of Concerns**: JS handles logic, Python handles text processing
2. **Testability**: Each component can be tested in isolation
3. **Flexibility**: Easy to swap LLM providers or add local models
4. **Performance**: Streaming results, parallel chunk processing
5. **User Control**: Configuration options for iteration limits, models
6. **Debugging**: Clear data flow, logging at each stage
