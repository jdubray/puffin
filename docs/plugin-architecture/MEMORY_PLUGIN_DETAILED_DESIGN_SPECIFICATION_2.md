# Memory Plugin Detailed Design Specification

**Version:** 0.2.0 (Detailed Design)
**Status:** Ready for Implementation
**Derived from:** MEMORY_PLUGIN_SPECIFICATION.md v0.1.0

---

## Overview

This document provides the detailed design and implementation guidance for the Memory Plugin, translating the high-level specification into concrete implementation steps.

### Key Architectural Alignment

This revision aligns the detailed design with the specification's **two-layer branch-memory architecture**:

| Layer | Purpose | Storage |
|-------|---------|---------|
| **Layer 1: Branch Threads** | Raw data / source of truth | Existing Puffin branch conversations (read in-place) |
| **Layer 2: Branch Memory Files** | Extracted facts + evolving summary | `~/.puffin/memory/branches/{branchId}.md` |

**Removed from previous design:** Separate resource layer (JSON copies of threads), separate item files per category, knowledge graph index, embedding vectors. These are deferred to future versions per the spec's "Out of Scope for v1" section.

### Memory Scope

> The Memory Plugin serves a "central reasoning engine" that maintains the Code Model of the solution. Memory domain knowledge includes **only** concerns that need to be known and enforced across the entire solution:
> - Architectural decisions affecting multiple components
> - Cross-cutting concerns (error handling, state management patterns)
> - Technical constraints that apply solution-wide
> - Code style and conventions enforced everywhere
> - Critical bug patterns and their solutions
> - Key design assumptions and trade-offs
>
> **Out of scope:** Feature-specific business rules, story-level context, individual feature implementation details.

---

## Step 1: Define Data Models and Schemas

### 1.1 Branch Memory File Format

Each branch has a single markdown file at `~/.puffin/memory/branches/{branchId}.md` that contains both extracted items and an evolving narrative summary. The LLM rewrites this file when integrating new information.

**File naming convention:** `{branchId}.md` (e.g., `feature-auth.md`, `plugin-development.md`)

**Template Structure:**
```markdown
# Branch Memory: {branchId}

**Last Updated:** 2024-01-19T08:45:00Z
**Last Extraction:** 2024-01-19T00:15:30Z
**Thread Count:** 3

## Summary

High-level narrative summary (2-3 paragraphs) synthesizing all domain-level knowledge extracted from this branch's conversations. Written by LLM, updated each time new items are integrated.

## Coding Preferences

- **Async pattern**: User prefers async/await over Promise.then() chains (confidence: 0.95, source: thread_xyz789, extracted: 2024-01-19)
- **Functional style**: Strongly favors functional programming patterns for data transformations (confidence: 0.88, source: thread_abc123, extracted: 2024-01-15)

## Architectural Decisions

- **SAM Pattern**: Adopted State-Action-Model pattern for state management. Rationale: explicit control states map well to FSM-driven UI. Trade-off: more boilerplate than simpler solutions (confidence: 0.92, source: thread_xyz789, extracted: 2024-01-19)

## Project Conventions

- **Naming**: Variables use camelCase, constants use UPPER_SNAKE_CASE across all JavaScript files (confidence: 0.95, source: thread_def456, extracted: 2024-01-10)

## Bug Patterns

- **Race conditions in async state updates**: Fix with explicit locking mechanisms. Occurred 2 times (confidence: 0.85, source: thread_xyz789, extracted: 2024-01-19)

## Implementation Notes

- **Component refactoring**: Composition over inheritance reduces coupling and improves reusability (confidence: 0.88, source: thread_abc123, extracted: 2024-01-15)

## Contradictions and Conflicts

[Any conflicting memories detected during integration, with timestamps and source references]
```

**Key design decisions:**
- Single markdown file per branch — simple, human-readable, editable
- LLM rewrites the entire file on each integration (not append-only)
- Inline metadata (confidence, source, date) enables retrieval scoring without separate index files
- No separate resource/item/category layers — the branch memory file IS the extracted knowledge
- Conflicts tracked inline within the branch file

**Validation:**
- File must be valid markdown
- Must contain at least Summary and one category section
- Confidence values must be 0.0-1.0
- Timestamps must be valid ISO 8601
- Source thread references should correspond to real branch threads

### 1.2 Storage Directory Structure

```
~/.puffin/memory/
├── branches/
│   ├── feature-auth.md
│   ├── plugin-development.md
│   ├── bugfix-race-condition.md
│   └── ...
├── config.json                  # Runtime config overrides
└── maintenance-log.json         # Last maintenance timestamps
```

**No subdirectories for items, resources, categories, or graph indexes.** The branch memory files contain all extracted knowledge.

### 1.3 Maintenance Log Schema

Tracks when maintenance was last performed. Used to implement the spec's "check if at least one week has elapsed" trigger.

**File:** `~/.puffin/memory/maintenance-log.json`

```json
{
  "lastThreadProcessed": {
    "branchId": "feature-auth",
    "timestamp": "2024-01-19T00:15:30Z"
  },
  "lastWeeklyConsolidation": "2024-01-13T02:00:00Z",
  "lastMonthlyReindex": "2024-01-01T01:00:00Z"
}
```

### 1.4 Conflict Record (Inline)

Per the spec, conflicts are handled by the LLM during branch memory evolution — the LLM overwrites outdated facts and maintains narrative coherence. Conflicts that cannot be auto-resolved are documented in the "Contradictions and Conflicts" section of each branch memory file.

No separate `conflicts.json` file is needed. If cross-branch conflicts are detected during retrieval, they are surfaced in the retrieval response.

---

## Step 2: Design the LLM Extraction Prompts

### 2.1 Main Extraction Prompt Template

Used to extract structured memory items from a branch thread conversation. Includes scope filtering per the spec's domain knowledge requirements.

**Prompt:**
```
You are a memory extraction specialist for a development tool. Analyze the following development conversation and extract key decisions, preferences, and insights that apply ACROSS THE ENTIRE SOLUTION.

## Scope Filter

ONLY extract knowledge that is relevant to the central reasoning engine — concerns that need to be known and enforced across the entire codebase:
- Architectural decisions affecting multiple components
- Cross-cutting concerns (error handling, state management patterns)
- Technical constraints that apply solution-wide
- Code style and conventions enforced everywhere
- Critical bug patterns and their solutions
- Key design assumptions and trade-offs

DO NOT extract:
- Business rules specific to individual features
- Feature-specific implementation details
- Story-level context and requirements
- User story acceptance criteria

## Conversation

[CONVERSATION_TEXT]

## Extraction Task

Identify and extract domain-level memories in these categories:

### Coding Preferences
Solution-wide coding style, library choices, patterns, and best practices.

### Architectural Decisions
Design choices, trade-offs, and architectural patterns that affect multiple components.

### Project Conventions
Naming conventions, file organization, tooling preferences enforced everywhere.

### Bug Patterns
Recurring issues and their fixes that apply broadly.

### Implementation Notes
Cross-cutting lessons learned and guidance for future work.

## Response Format

Return ONLY valid JSON (no markdown, no explanations):

```json
{
  "coding_preferences": [
    {
      "content": "[Clear, actionable statement]",
      "confidence": 0.85,
      "context": "[Why this matters or how it was mentioned]"
    }
  ],
  "architectural_decisions": [
    {
      "content": "[Decision statement]",
      "rationale": "[Why was this chosen]",
      "trade_offs": "[What was given up]",
      "confidence": 0.90
    }
  ],
  "project_conventions": [
    {
      "content": "[Convention description]",
      "scope": "[Where does this apply]",
      "confidence": 0.95
    }
  ],
  "bug_patterns": [
    {
      "pattern": "[Pattern description]",
      "fix": "[How to prevent/fix]",
      "occurrences": 2,
      "confidence": 0.85
    }
  ],
  "implementation_notes": [
    {
      "topic": "[Topic area]",
      "approach": "[Recommended approach]",
      "lessons_learned": "[Key insights]",
      "confidence": 0.88
    }
  ]
}
```

## Quality Guidelines

1. **Confidence Scoring**: Only include items with confidence >= 0.75
2. **Specificity**: Memories should be specific and actionable, not generic advice
3. **Source Attribution**: Each memory must clearly relate to something stated in the conversation
4. **No Speculation**: Only extract what is directly supported by the conversation
5. **De-duplication**: Avoid extracting the same memory multiple times
6. **Scope**: Only extract solution-wide concerns, not feature-specific details
```

### 2.2 Branch Memory Evolution Prompt Template

Used when integrating new extracted items into an existing branch memory file. The LLM rewrites the entire branch memory file.

**Prompt:**
```
You are a knowledge synthesis specialist. Your task is to integrate new memory items into an existing branch memory file, producing an updated version.

## Existing Branch Memory File

[CURRENT_BRANCH_MEMORY_CONTENT]

## New Items to Integrate

[NEW_ITEMS_JSON]

## Integration Task

1. **Detect Conflicts**: Identify new items that contradict existing facts
   - If the new item clearly supersedes the old: overwrite the old fact
   - If ambiguous: document both in the "Contradictions and Conflicts" section

2. **Integrate New Facts**: Add non-contradictory items to the appropriate category sections
   - Merge related items into single entries
   - Update confidence scores when facts are reinforced
   - Include source thread reference and extraction date

3. **Rewrite Summary**: Update the narrative summary to reflect the current state of knowledge
   - Maintain coherence and readability
   - Highlight significant new insights

4. **Maintain Format**: Preserve the branch memory file structure:
   - Summary section
   - Category sections (Coding Preferences, Architectural Decisions, etc.)
   - Contradictions section

## Response Format

Return ONLY the complete updated branch memory file in markdown format. Include ALL existing facts plus new integrations.

## Constraints

- Overwrite outdated facts with newer, higher-confidence information
- Document genuinely ambiguous conflicts in "Contradictions and Conflicts"
- Preserve inline metadata (confidence, source, date) for each fact
- Update the "Last Updated" timestamp in the header
- Keep the file readable and concise — this is a living document, not a log
```

### 2.3 Edge Case Fallback Prompts

**For empty conversations (no extractable content):**
```
You are analyzing a development conversation. If this conversation contains meaningful development decisions, preferences, or insights that apply across the entire solution, extract them. If the conversation is primarily procedural, feature-specific, or administrative with no cross-cutting knowledge content, respond with:

{"no_content_to_extract": true}
```

**For unclear or ambiguous content:**
```
You are analyzing unclear development content. For items you're unsure about, include them but lower the confidence score. Items with confidence below 0.75 will be filtered. Only omit items if they're completely unrelated to solution-wide development concerns.
```

### 2.4 Response Validation Schema

```javascript
const responseSchema = {
  coding_preferences: 'array of {content, confidence, context}',
  architectural_decisions: 'array of {content, rationale, trade_offs, confidence}',
  project_conventions: 'array of {content, scope, confidence}',
  bug_patterns: 'array of {pattern, fix, occurrences, confidence}',
  implementation_notes: 'array of {topic, approach, lessons_learned, confidence}'
};

validationRules = [
  'All confidence values must be 0.0-1.0',
  'All content fields must be non-empty strings',
  'All arrays must contain at least 0 items',
  'No extra fields allowed in response',
  'If "no_content_to_extract": true, response must contain only this field'
];
```

**Fallback handling:**
- If response is invalid JSON: Log error, return empty extraction
- If no items meet confidence threshold: Return empty extraction (valid state)
- If LLM fails: Return error, preserve existing branch memory file unchanged

---

## Step 3: Implement Core Memory Manager

### 3.1 File System Layer

**Responsibilities:**
- Create and manage branch memory directory
- Ensure atomic write operations
- Handle concurrent access safely

**Implementation:**

```javascript
class FileSystemLayer {
  constructor(basePath) {
    this.basePath = basePath; // ~/.puffin/memory
    this.branchesDir = path.join(basePath, 'branches');
    this.initialized = false;
  }

  async initialize() {
    await fs.mkdir(this.branchesDir, { recursive: true });
    this.initialized = true;
  }

  async writeBranchMemory(branchId, content) {
    const fullPath = path.join(this.branchesDir, `${branchId}.md`);
    const tempPath = fullPath + '.tmp';
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, fullPath);
  }

  async readBranchMemory(branchId) {
    const fullPath = path.join(this.branchesDir, `${branchId}.md`);
    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async listBranchMemories() {
    const files = await fs.readdir(this.branchesDir);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  }

  async deleteBranchMemory(branchId) {
    const fullPath = path.join(this.branchesDir, `${branchId}.md`);
    await fs.unlink(fullPath);
  }

  async readMaintenanceLog() {
    const logPath = path.join(this.basePath, 'maintenance-log.json');
    try {
      const content = await fs.readFile(logPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  async writeMaintenanceLog(log) {
    const logPath = path.join(this.basePath, 'maintenance-log.json');
    const tempPath = logPath + '.tmp';
    await fs.writeFile(tempPath, JSON.stringify(log, null, 2), 'utf-8');
    await fs.rename(tempPath, logPath);
  }
}
```

### 3.2 Write Path Implementation

Per the spec: "A thread should be processed once the developer creates a new thread; the memorization process should run in the background."

**Responsibilities:**
- Read branch thread conversation from Puffin (in-place, no copy)
- Call LLM for extraction (filtering for domain-level scope)
- Load existing branch memory file
- Call LLM to integrate new items into branch memory (evolution)
- Write updated branch memory file

**Implementation:**

```javascript
class MemoryWriter {
  constructor(fsLayer, llmExtractor) {
    this.fs = fsLayer;
    this.llm = llmExtractor;
  }

  /**
   * Memorize a branch thread conversation.
   * Called when the developer creates a new thread (background).
   * @param {string} conversationText - The thread conversation text
   * @param {string} branchId - Branch identifier
   * @returns {Object} Result with itemsExtracted count and categoriesUpdated
   */
  async memorize(conversationText, branchId) {
    try {
      // Step 1: Extract items via LLM (scope-filtered)
      const extractedItems = await this.llm.extract(conversationText);

      // Handle empty extraction
      if (extractedItems.no_content_to_extract) {
        return {
          itemsExtracted: 0,
          categoriesUpdated: []
        };
      }

      // Step 2: Filter by confidence threshold
      const filteredItems = this.filterByConfidence(extractedItems);
      const itemCount = Object.values(filteredItems)
        .reduce((sum, arr) => sum + arr.length, 0);

      if (itemCount === 0) {
        return { itemsExtracted: 0, categoriesUpdated: [] };
      }

      // Step 3: Load existing branch memory (may be null for first extraction)
      const existingMemory = await this.fs.readBranchMemory(branchId);

      // Step 4: Evolve branch memory via LLM
      const updatedMemory = await this.llm.evolveBranchMemory(
        existingMemory,
        filteredItems,
        branchId
      );

      // Step 5: Write updated branch memory file
      await this.fs.writeBranchMemory(branchId, updatedMemory);

      // Step 6: Update maintenance log
      const log = await this.fs.readMaintenanceLog();
      log.lastThreadProcessed = {
        branchId,
        timestamp: new Date().toISOString()
      };
      await this.fs.writeMaintenanceLog(log);

      const categoriesUpdated = Object.keys(filteredItems)
        .filter(k => filteredItems[k].length > 0);

      return {
        itemsExtracted: itemCount,
        categoriesUpdated
      };
    } catch (error) {
      return {
        error: true,
        code: 'MEMORIZATION_FAILED',
        message: error.message
      };
    }
  }

  filterByConfidence(extractedItems) {
    const filtered = {};
    for (const [category, items] of Object.entries(extractedItems)) {
      if (Array.isArray(items)) {
        filtered[category] = items.filter(item => item.confidence >= 0.75);
      }
    }
    return filtered;
  }
}
```

### 3.3 Read Path Implementation

Per the spec's tiered retrieval:
1. Query synthesis
2. Branch selection (LLM identifies relevant branch memory files)
3. Sufficiency check (do branch summaries answer the query?)
4. Conflict detection
5. Relevance filtering
6. Context assembly within token budget

**No temporal decay** — per the spec: "Facts are valid indefinitely until explicitly superseded."

**Implementation:**

```javascript
class MemoryReader {
  constructor(fsLayer, llmRetriever, config = {}) {
    this.fs = fsLayer;
    this.llm = llmRetriever;
    this.maxTokens = config.maxTokens || 2000;
    this.relevanceThreshold = config.relevanceThreshold || 0.7;
  }

  async retrieve(query, maxResults = 5) {
    try {
      // Step 1: Query synthesis
      const synthesizedQuery = await this.llm.synthesizeQuery(query);

      // Step 2: Branch selection
      const allBranches = await this.fs.listBranchMemories();
      const relevantBranches = await this.llm.selectRelevantBranches(
        synthesizedQuery,
        allBranches
      );

      // Step 3: Load branch memory files
      const branchMemories = [];
      for (const branchId of relevantBranches) {
        const content = await this.fs.readBranchMemory(branchId);
        if (content) {
          branchMemories.push({ branchId, content });
        }
      }

      // Step 4: Sufficiency check
      const sufficiencyResult = await this.llm.checkSufficiency(
        query,
        branchMemories
      );

      let results;
      if (sufficiencyResult.sufficient) {
        // Branch summaries are enough
        results = sufficiencyResult.relevantExtracts;
      } else {
        // Need deeper search within branch memories
        results = await this.llm.deepSearch(
          query,
          branchMemories
        );
      }

      // Step 5: Conflict detection across branches
      const conflicts = await this.llm.detectCrossBranchConflicts(results);

      // Step 6: Assemble within token budget
      return this.assembleResults(results, conflicts, maxResults);
    } catch (error) {
      return {
        error: true,
        code: 'RETRIEVAL_FAILED',
        message: error.message
      };
    }
  }

  assembleResults(results, conflicts, maxResults) {
    // Score by relevance × confidence (no temporal decay)
    const sorted = results
      .filter(r => (r.relevance || 0) >= this.relevanceThreshold)
      .sort((a, b) => {
        const scoreA = (a.relevance || 0) * (a.confidence || 1);
        const scoreB = (b.relevance || 0) * (b.confidence || 1);
        return scoreB - scoreA;
      });

    // Pack within token budget
    let usedTokens = 0;
    const included = [];

    for (const item of sorted) {
      const tokens = Math.ceil(item.content.length * 0.25);
      if (usedTokens + tokens > this.maxTokens) break;
      included.push(item);
      usedTokens += tokens;
    }

    return {
      memories: included.slice(0, maxResults),
      conflicts,
      totalTokens: usedTokens,
      retrievalTime: Date.now()
    };
  }
}
```

---

## Step 4: Implement Retrieval System

### 4.1 Relevance Scoring (No Temporal Decay)

Per the spec: "There is no time-based temporal decay. Facts are valid indefinitely until explicitly superseded by newer information."

The scoring model uses three factors: relevance, confidence, and access frequency.

```javascript
class RelevanceScorer {
  constructor(config = {}) {
    this.relevanceWeight = config.relevanceWeight || 0.6;
    this.confidenceWeight = config.confidenceWeight || 0.3;
    this.frequencyWeight = config.frequencyWeight || 0.1;
    this.relevanceThreshold = config.relevanceThreshold || 0.7;
  }

  /**
   * Score a memory item against a query.
   * No temporal decay — facts are valid indefinitely.
   */
  async scoreItem(item, query, llm) {
    const relevanceScore = await llm.scoreRelevance(item.content, query);
    const confidenceScore = item.confidence || 1.0;
    const frequencyScore = Math.min((item.accessCount || 0) / 100, 1.0);

    const finalScore = (
      relevanceScore * this.relevanceWeight +
      confidenceScore * this.confidenceWeight +
      frequencyScore * this.frequencyWeight
    );

    return {
      content: item.content,
      finalScore,
      components: {
        relevance: relevanceScore,
        confidence: confidenceScore,
        frequency: frequencyScore
      }
    };
  }

  filterByThreshold(scores) {
    return scores.filter(s => s.finalScore >= this.relevanceThreshold);
  }
}
```

### 4.2 Conflict Detection

Identifies contradictory memories across branch memory files during retrieval.

```javascript
class ConflictDetector {
  /**
   * Detect conflicts across branch memories.
   * Since conflicts within a single branch are handled by the evolution LLM,
   * this focuses on cross-branch contradictions.
   */
  async detectCrossBranchConflicts(results, llm) {
    if (results.length < 2) return [];

    // Group by category
    const byCategory = {};
    for (const result of results) {
      const cat = result.category || 'unknown';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(result);
    }

    const conflicts = [];
    for (const [category, items] of Object.entries(byCategory)) {
      if (items.length < 2) continue;

      // LLM identifies contradictions
      const found = await llm.findContradictions(items);
      conflicts.push(...found);
    }

    return conflicts;
  }
}
```

### 4.3 Token Budget Manager

Packs results to fit within token budget.

```javascript
class TokenBudgetManager {
  constructor(maxTokens = 2000) {
    this.maxTokens = maxTokens;
  }

  estimateTokens(text) {
    return Math.ceil(text.length * 0.25);
  }

  assembleContext(memories, conflicts) {
    let context = '';
    let usedTokens = 0;
    const included = [];

    // Add conflict warnings first
    for (const conflict of conflicts) {
      const text = `**CONFLICT** in ${conflict.category}: ${conflict.description}\n`;
      const tokens = this.estimateTokens(text);
      if (usedTokens + tokens <= this.maxTokens) {
        context += text + '\n';
        usedTokens += tokens;
      }
    }

    // Add memories sorted by score
    const sorted = [...memories].sort((a, b) => (b.score || 0) - (a.score || 0));
    for (const memory of sorted) {
      const text = `**${memory.category}** (confidence: ${Math.round((memory.confidence || 1) * 100)}%)\n${memory.content}`;
      const tokens = this.estimateTokens(text);
      if (usedTokens + tokens <= this.maxTokens) {
        context += text + '\n\n';
        usedTokens += tokens;
        included.push(memory);
      }
    }

    return { context, usedTokens, included, capacityRemaining: this.maxTokens - usedTokens };
  }
}
```

---

## Step 5: Design IPC Interface

### 5.1 IPC Handler Mapping

Aligned with the spec's API (Section 4.1). Key change: `memory:memorize` no longer returns a `resourceId` (no resource layer).

```javascript
class IPCRegistry {
  constructor(memoryManager) {
    this.manager = memoryManager;
    this.handlers = {
      'memory:memorize': this.handleMemorize.bind(this),
      'memory:retrieve': this.handleRetrieve.bind(this),
      'memory:get-branch-memory': this.handleGetBranchMemory.bind(this),
      'memory:get-stats': this.handleGetStats.bind(this),
      'memory:get-status': this.handleGetStatus.bind(this),
      'memory:clear-branch-memory': this.handleClearBranchMemory.bind(this),
      'memory:run-maintenance': this.handleRunMaintenance.bind(this)
    };
  }

  register(ipcMain) {
    for (const [channel, handler] of Object.entries(this.handlers)) {
      ipcMain.handle(channel, async (event, request) => {
        try {
          return await handler(request);
        } catch (error) {
          console.error(`[memory-plugin] ${channel} failed:`, error);
          return ResponseFormatter.error('INTERNAL_ERROR', error.message);
        }
      });
    }
  }

  async handleMemorize(request) {
    const validation = this.validateMemorizeRequest(request);
    if (!validation.valid) return ResponseFormatter.error('INVALID_INPUT', validation.error);

    return await this.manager.write.memorize(
      request.conversationText,
      request.branchId
    );
  }

  async handleRetrieve(request) {
    const validation = this.validateRetrieveRequest(request);
    if (!validation.valid) return ResponseFormatter.error('INVALID_INPUT', validation.error);

    return await this.manager.read.retrieve(
      request.query,
      request.maxResults || 5
    );
  }

  async handleGetBranchMemory(request) {
    if (!request.branch || typeof request.branch !== 'string') {
      return ResponseFormatter.error('INVALID_INPUT', 'branch must be non-empty string');
    }

    const content = await this.manager.fs.readBranchMemory(request.branch);
    if (!content) {
      return ResponseFormatter.error('NOT_FOUND', `No memory file for branch: ${request.branch}`);
    }

    return {
      branch: request.branch,
      content,
      lastUpdated: this.extractLastUpdated(content),
      itemCount: this.countItems(content)
    };
  }

  async handleGetStats() {
    const branches = await this.manager.fs.listBranchMemories();
    const log = await this.manager.fs.readMaintenanceLog();

    return {
      totalBranches: branches.length,
      totalCategories: 5,
      lastMemorized: log.lastThreadProcessed?.timestamp || null,
      nextMaintenance: this.calculateNextMaintenance(log)
    };
  }

  async handleGetStatus() {
    return {
      status: this.manager.isProcessing ? 'processing' : 'ready',
      lastError: this.manager.lastError || null,
      maintenanceInProgress: this.manager.maintenanceInProgress || false
    };
  }

  async handleClearBranchMemory(request) {
    if (!request.branch || typeof request.branch !== 'string') {
      return ResponseFormatter.error('INVALID_INPUT', 'branch must be non-empty string');
    }

    await this.manager.fs.deleteBranchMemory(request.branch);
    return { success: true };
  }

  async handleRunMaintenance(request) {
    if (!request.type || !['weekly', 'monthly', 'full'].includes(request.type)) {
      return ResponseFormatter.error('INVALID_INPUT', 'type must be weekly, monthly, or full');
    }

    const start = Date.now();
    const results = await this.manager.maintenance.run(request.type);
    return {
      success: true,
      duration: Date.now() - start,
      results
    };
  }

  validateMemorizeRequest(request) {
    if (!request.conversationText || typeof request.conversationText !== 'string') {
      return { valid: false, error: 'conversationText must be non-empty string' };
    }
    if (!request.branchId || typeof request.branchId !== 'string') {
      return { valid: false, error: 'branchId must be non-empty string' };
    }
    return { valid: true };
  }

  validateRetrieveRequest(request) {
    if (!request.query || typeof request.query !== 'string') {
      return { valid: false, error: 'query must be non-empty string' };
    }
    return { valid: true };
  }

  extractLastUpdated(content) {
    const match = content.match(/\*\*Last Updated:\*\*\s*(\S+)/);
    return match ? match[1] : null;
  }

  countItems(content) {
    // Count bullet points in category sections
    return (content.match(/^- \*\*/gm) || []).length;
  }

  calculateNextMaintenance(log) {
    const lastWeekly = log.lastWeeklyConsolidation
      ? new Date(log.lastWeeklyConsolidation)
      : new Date(0);
    const nextWeekly = new Date(lastWeekly.getTime() + 7 * 24 * 60 * 60 * 1000);
    return nextWeekly.toISOString();
  }
}
```

### 5.2 Input Validation Schemas

```javascript
const validationSchemas = {
  memorizeRequest: {
    type: 'object',
    required: ['conversationText', 'branchId'],
    properties: {
      conversationText: { type: 'string', minLength: 1 },
      branchId: { type: 'string', minLength: 1 }
    }
  },

  retrieveRequest: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', minLength: 1 },
      maxResults: { type: 'number', minimum: 1, maximum: 100 }
    }
  },

  getBranchMemoryRequest: {
    type: 'object',
    required: ['branch'],
    properties: {
      branch: { type: 'string', minLength: 1 }
    }
  },

  clearBranchMemoryRequest: {
    type: 'object',
    required: ['branch'],
    properties: {
      branch: { type: 'string', minLength: 1 }
    }
  },

  runMaintenanceRequest: {
    type: 'object',
    required: ['type'],
    properties: {
      type: { type: 'string', enum: ['weekly', 'monthly', 'full'] }
    }
  }
};
```

### 5.3 Error Handling and Response Formatting

```javascript
class ResponseFormatter {
  static success(data) {
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  static error(code, message, context = null) {
    return { error: true, code, message, context, timestamp: new Date().toISOString() };
  }
}
```

**Error codes:**
- `INVALID_INPUT` - Validation failed
- `NOT_FOUND` - Branch memory not found
- `EXTRACTION_FAILED` - LLM extraction error
- `RETRIEVAL_FAILED` - Search failed
- `STORAGE_ERROR` - File I/O error
- `MAINTENANCE_FAILED` - Maintenance task failed
- `INTERNAL_ERROR` - Unexpected error

### 5.4 Integration Tests

```javascript
describe('IPC Handlers', () => {
  describe('memory:memorize', () => {
    test('should extract and store memories from conversation', async () => {
      const response = await ipcMain.invoke('memory:memorize', {
        conversationText: 'Discussed using async/await for all async operations...',
        branchId: 'feature-1'
      });

      expect(response.itemsExtracted).toBeGreaterThan(0);
      expect(response.categoriesUpdated).toBeInstanceOf(Array);
    });

    test('should reject invalid inputs', async () => {
      const response = await ipcMain.invoke('memory:memorize', {
        conversationText: '',
        branchId: 'feature-1'
      });

      expect(response.error).toBe(true);
      expect(response.code).toBe('INVALID_INPUT');
    });
  });

  describe('memory:retrieve', () => {
    test('should retrieve relevant memories for query', async () => {
      const response = await ipcMain.invoke('memory:retrieve', {
        query: 'async/await pattern',
        maxResults: 5
      });

      expect(response.memories).toBeInstanceOf(Array);
      expect(response.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('memory:get-branch-memory', () => {
    test('should return branch memory content', async () => {
      const response = await ipcMain.invoke('memory:get-branch-memory', {
        branch: 'feature-1'
      });

      expect(response.branch).toBe('feature-1');
      expect(response.content).toBeDefined();
      expect(response.lastUpdated).toBeDefined();
    });
  });
});
```

---

## Step 6: Implement Maintenance Tasks

### 6.1 Maintenance Trigger

Per the spec: "When the developer opens Puffin, check if at least one week has elapsed since last consolidation."

**No cron scheduling.** Maintenance is triggered on app startup.

```javascript
class MaintenanceManager {
  constructor(fsLayer, llm) {
    this.fs = fsLayer;
    this.llm = llm;
  }

  /**
   * Check and run maintenance on plugin activation (app startup).
   * Per spec: trigger weekly maintenance when developer opens Puffin
   * if at least one week has elapsed.
   */
  async checkAndRun() {
    const log = await this.fs.readMaintenanceLog();

    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000;

    const lastWeekly = log.lastWeeklyConsolidation
      ? new Date(log.lastWeeklyConsolidation).getTime()
      : 0;

    const lastMonthly = log.lastMonthlyReindex
      ? new Date(log.lastMonthlyReindex).getTime()
      : 0;

    if (now - lastMonthly >= oneMonthMs) {
      await this.runMonthly();
      log.lastMonthlyReindex = new Date().toISOString();
    }

    if (now - lastWeekly >= oneWeekMs) {
      await this.runWeekly();
      log.lastWeeklyConsolidation = new Date().toISOString();
    }

    await this.fs.writeMaintenanceLog(log);
  }

  async run(type) {
    switch (type) {
      case 'weekly': return await this.runWeekly();
      case 'monthly': return await this.runMonthly();
      case 'full':
        const weekly = await this.runWeekly();
        const monthly = await this.runMonthly();
        return { weekly, monthly };
      default:
        throw new Error(`Unknown maintenance type: ${type}`);
    }
  }

  /**
   * Weekly consolidation per spec:
   * - Consolidate and refactor branch memory files for clarity
   * - Identify infrequently-accessed items and assess continued relevance
   * - Merge redundant or superseded memories
   * - Update branch summaries
   */
  async runWeekly() {
    const branches = await this.fs.listBranchMemories();
    let branchesConsolidated = 0;
    let memoriesRemoved = 0;

    for (const branchId of branches) {
      const content = await this.fs.readBranchMemory(branchId);
      if (!content) continue;

      const consolidated = await this.llm.consolidateBranchMemory(content);
      if (consolidated !== content) {
        await this.fs.writeBranchMemory(branchId, consolidated);
        branchesConsolidated++;
      }
    }

    return { branchesConsolidated, memoriesRemoved };
  }

  /**
   * Monthly maintenance:
   * - Validate integrity of all branch memory files
   * - Placeholder for future embedding re-indexing
   */
  async runMonthly() {
    const branches = await this.fs.listBranchMemories();
    let valid = 0;
    let invalid = 0;

    for (const branchId of branches) {
      const content = await this.fs.readBranchMemory(branchId);
      if (content && this.isValidBranchMemory(content)) {
        valid++;
      } else {
        invalid++;
      }
    }

    return { branchesValidated: valid, branchesInvalid: invalid };
  }

  isValidBranchMemory(content) {
    return content.includes('## Summary') && content.includes('**Last Updated:**');
  }
}
```

### 6.2 Thread Processing Trigger

Per the spec: "A thread should be processed once the developer creates a new thread."

```javascript
/**
 * In main.js activate():
 * Subscribe to thread creation events and trigger background memorization.
 */
async activate(context) {
  // Initialize storage
  await this.fs.initialize();

  // Register IPC handlers
  this.ipcRegistry.register(context.ipcMain);

  // Check for pending maintenance on startup
  await this.maintenance.checkAndRun();

  // Subscribe to new-thread events for automatic memorization
  context.on('thread:completed', async (threadId, branchId) => {
    // Run in background — don't block UI
    try {
      const conversationText = await this.getThreadConversation(threadId);
      await this.writer.memorize(conversationText, branchId);
    } catch (error) {
      console.error('[memory-plugin] Background memorization failed:', error);
    }
  });
}
```

---

## Step 7: Build Renderer UI Components

### 7.1 Status Indicator Component

```javascript
class MemoryStatusIndicator {
  render() {
    const { status, lastError, maintenanceInProgress } = this.state;

    return `
      <div class="memory-status">
        <span class="status-dot ${status}"></span>
        <span class="status-text">${this.getStatusText(status)}</span>
        ${maintenanceInProgress ? '<span class="maintenance-badge">Maintenance</span>' : ''}
        ${lastError ? `<span class="error-tooltip" title="${lastError}">!</span>` : ''}
      </div>
    `;
  }

  getStatusText(status) {
    return { ready: 'Memory System Ready', processing: 'Processing...', error: 'Error' }[status] || 'Unknown';
  }
}
```

### 7.2 Statistics Dashboard

```javascript
class MemoryStatsDashboard {
  render() {
    const { totalBranches, totalCategories, lastMemorized, nextMaintenance } = this.stats;

    return `
      <div class="memory-dashboard">
        <div class="stat-card"><h3>Branch Memories</h3><p>${totalBranches}</p></div>
        <div class="stat-card"><h3>Categories</h3><p>${totalCategories}</p></div>
        <div class="stat-card"><h3>Last Updated</h3><p>${this.formatTime(lastMemorized)}</p></div>
        <div class="stat-card"><h3>Next Maintenance</h3><p>${this.formatTime(nextMaintenance)}</p></div>
      </div>
    `;
  }

  formatTime(isoTime) {
    return isoTime ? new Date(isoTime).toLocaleString() : 'Never';
  }
}
```

### 7.3 Branch Memory Browser

Replaces the previous category-based browser. Users browse by branch.

```javascript
class BranchMemoryBrowser {
  render() {
    return `
      <div class="memory-browser">
        <div class="branch-selector">
          ${this.branches.map(b => `
            <button onclick="this.loadBranch('${b}')">${b}</button>
          `).join('')}
        </div>
        <div class="memory-content">
          ${this.currentContent ? this.renderMarkdown(this.currentContent) : '<p>Select a branch</p>'}
        </div>
      </div>
    `;
  }
}
```

### 7.4 Conflict Resolution UI

Per the spec, conflicts within a branch are handled by the LLM during evolution. Cross-branch conflicts are surfaced during retrieval and shown to the user.

```javascript
class ConflictResolutionPanel {
  render(conflict) {
    return `
      <div class="conflict-panel">
        <h3>Conflicting Memory in ${conflict.category}</h3>
        <div class="conflict-items">
          ${conflict.items.map((item, i) => `
            <div class="conflict-item">
              <div class="item-meta">
                <span>Branch: ${item.branchId}</span>
                <span>Confidence: ${Math.round(item.confidence * 100)}%</span>
              </div>
              <p>${item.content}</p>
            </div>
          `).join('')}
        </div>
        <div class="resolution-actions">
          <button onclick="this.resolveKeepNewer()">Keep Newer</button>
          <button onclick="this.resolveKeepBoth()">Keep Both</button>
          <button onclick="this.resolveMarkOutdated(0)">Mark Older as Outdated</button>
        </div>
      </div>
    `;
  }
}
```

---

## Step 8: Integration Testing

### 8.1 End-to-End Memorization Workflow

```javascript
describe('Memorization Workflow (E2E)', () => {
  test('should memorize and create branch memory file', async () => {
    const response = await ipcRenderer.invoke('memory:memorize', {
      conversationText: 'User: We should use async/await.\nClaude: Good idea.',
      branchId: 'test-branch'
    });

    expect(response.itemsExtracted).toBeGreaterThan(0);

    // Verify branch memory file was created
    const branchMemory = await ipcRenderer.invoke('memory:get-branch-memory', {
      branch: 'test-branch'
    });

    expect(branchMemory.content).toContain('async/await');
    expect(branchMemory.content).toContain('## Summary');
  });
});
```

### 8.2 Retrieval Tests

```javascript
describe('Retrieval', () => {
  test('should retrieve memories across branches', async () => {
    const response = await ipcRenderer.invoke('memory:retrieve', {
      query: 'what async pattern do we use?'
    });

    expect(response.memories).toBeInstanceOf(Array);
    expect(response.memories.length).toBeGreaterThan(0);
  });

  test('should detect cross-branch conflicts', async () => {
    // Memorize conflicting info in two branches
    await ipcRenderer.invoke('memory:memorize', {
      conversationText: 'We prefer async/await',
      branchId: 'branch-1'
    });

    await ipcRenderer.invoke('memory:memorize', {
      conversationText: 'Actually, Promise.then() chains are better',
      branchId: 'branch-2'
    });

    const response = await ipcRenderer.invoke('memory:retrieve', {
      query: 'async pattern'
    });

    expect(response.conflicts).toBeDefined();
  });
});
```

### 8.3 Maintenance Tests

```javascript
describe('Maintenance', () => {
  test('should run weekly consolidation', async () => {
    const response = await ipcRenderer.invoke('memory:run-maintenance', {
      type: 'weekly'
    });

    expect(response.success).toBe(true);
    expect(response.results.branchesConsolidated).toBeDefined();
  });
});
```

### 8.4 Performance Benchmarks

```javascript
describe('Performance', () => {
  test('retrieval should complete in <500ms', async () => {
    const start = Date.now();
    await ipcRenderer.invoke('memory:retrieve', { query: 'async pattern', maxResults: 5 });
    expect(Date.now() - start).toBeLessThan(500);
  });
});
```

---

## Step 9: Documentation

### 9.1 Plugin README

**File:** `plugins/memory-plugin/README.md`

- Purpose: Automatic extraction of domain-level knowledge from branch conversations
- Architecture: Two-layer (branch threads → branch memory files)
- Storage: `~/.puffin/memory/branches/{branchId}.md`
- Trigger: Automatic on new thread creation, background processing
- Maintenance: Weekly on app startup (if 7+ days elapsed)

### 9.2 API Documentation

**File:** `plugins/memory-plugin/API.md`

Complete IPC channel reference matching Section 5.1.

### 9.3 Configuration Reference

**File:** `plugins/memory-plugin/CONFIGURATION.md`

Document config options from the spec's Section 3.4.

---

## Implementation Checklist

### Step 1: Data Models
- [ ] Branch memory file template defined
- [ ] Storage directory structure created
- [ ] Maintenance log schema defined
- [ ] No separate resource/item/category files (confirmed removed)

### Step 2: LLM Prompts
- [ ] Main extraction prompt with scope filtering
- [ ] Branch memory evolution prompt
- [ ] Edge case prompts
- [ ] Response validation schema

### Step 3: Core Memory Manager
- [ ] FileSystemLayer with branch-level operations
- [ ] MemoryWriter using branch memory evolution
- [ ] MemoryReader with tiered retrieval
- [ ] No resource ingestion layer (confirmed removed)

### Step 4: Retrieval System
- [ ] RelevanceScorer without temporal decay
- [ ] ConflictDetector for cross-branch conflicts
- [ ] TokenBudgetManager

### Step 5: IPC Interface
- [ ] All IPC channels registered (branch-centric API)
- [ ] Input validation schemas
- [ ] Error handling consistent
- [ ] Integration tests passing

### Step 6: Maintenance Tasks
- [ ] Startup-triggered maintenance check (no cron)
- [ ] Weekly consolidation
- [ ] Monthly validation
- [ ] Thread completion event subscription

### Step 7: Renderer UI
- [ ] Status indicator
- [ ] Statistics dashboard (branch-centric)
- [ ] Branch memory browser
- [ ] Conflict resolution panel

### Step 8: Integration Testing
- [ ] E2E memorization workflow
- [ ] Cross-branch retrieval
- [ ] Conflict detection
- [ ] Performance benchmarks

### Step 9: Documentation
- [ ] README
- [ ] API documentation
- [ ] Configuration reference
