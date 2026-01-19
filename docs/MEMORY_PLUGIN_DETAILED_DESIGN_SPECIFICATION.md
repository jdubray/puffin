# Memory Plugin Detailed Design Specification

**Version:** 0.1.0 (Detailed Design)  
**Status:** Ready for Implementation  
**Derived from:** MEMORY_PLUGIN_SPECIFICATION.md Appendix B

---

## Overview

This document provides the detailed design and implementation guidance for the Memory Plugin, translating the high-level specification from the MEMORY_PLUGIN_SPECIFICATION into concrete implementation steps with specific deliverables, data models, and validation criteria.

---

## Step 1: Define Data Models and Schemas

### 1.1 Resource Schema
/@puffin: I missed that detail in the plugin specification, but do we need to 
Defines the JSON structure for raw conversation resources stored at `~/.puffin/memory/<user-id>/resources/`.

**File naming convention:** `resource_<timestamp>_<branchId>.json`

**Schema:**
```json
{
  "id": "resource_1705612800_feature-branch-1",
  "timestamp": "2024-01-19T00:00:00Z",
  "branchId": "feature-branch-1",
  "sessionId": "session_abc123def",
  "conversationText": "Full conversation text from branch thread...",
  "metadata": {
    "threadId": "thread_xyz789",
    "userId": "user_jjdub",
    "tags": ["feature", "refactoring"],
    "threadDuration": 3600,
    "messageCount": 15
  }
}
```

**Key design decisions:**
- Immutable storage: Resources are write-once, never modified
- Timestamp-based ID ensures chronological ordering
- Full conversation text enables future replay and audit
- Metadata supports extensibility without schema versioning

**Validation:**
- `id` must be unique across all resources
- `timestamp` must be valid ISO 8601 format
- `conversationText` must not be empty
- File must be valid JSON

### 1.2 Item Schema

Defines the structure for extracted memory items stored at `~/.puffin/memory/<user-id>/items/`.

**File organization:** Items organized by category in subdirectories (`items/coding_preferences/`, `items/architectural_decisions/`, etc.)

**File naming convention:** `item_<id>.json`

**Schema:**
```json
{
  "id": "item_20240119_cp_001",
  "category": "coding_preferences",
  "content": "User prefers async/await pattern over Promise.then() chains",
  "sourceResourceId": "resource_1705612800_feature-branch-1",
  "extractedAt": "2024-01-19T00:15:30Z",
  "lastAccessed": "2024-01-19T08:30:00Z",
  "accessCount": 5,
  "confidence": 0.95,
  "metadata": {
    "branchId": "feature-branch-1",
    "sessionId": "session_abc123def",
    "tags": ["javascript", "async"],
    "source_line_range": "120-135",
    "related_items": ["item_20240115_cp_002"]
  }
}
```

**Key design decisions:**
- One file per item enables atomic updates and concurrent reads
- `lastAccessed` and `accessCount` track usage for intelligent prioritization
- `confidence` (0.0-1.0) enables relevance filtering and conflict detection
- `source_line_range` provides precise audit trail to original conversation
- `related_items` enables knowledge graph construction

**Validation:**
- `id` must be unique and follow naming convention
- `category` must be one of the configured extraction categories
- `confidence` must be between 0.0 and 1.0
- `sourceResourceId` must reference an existing resource
- `extractedAt` must be valid ISO 8601 format and not in the future

### 1.3 Category Summary Format

Defines the markdown template for category files stored at `~/.puffin/memory/<user-id>/categories/`.

**File naming convention:** `<category_name>.md` (e.g., `coding_preferences.md`, `architectural_decisions.md`)

**Template Structure:**
```markdown
# [Category Name]

**Last Updated:** 2024-01-19T08:45:00Z  
**Item Count:** 12  
**Confidence Range:** 0.85-0.98  
**Last Review:** User review at 2024-01-15T14:20:00Z

## Summary

High-level narrative summary (2-3 sentences) of the core insights in this category.

## Key Facts

### Fact 1: [Concise Title]

**Statement:** [Clear, actionable memory]

**Evidence:** Referenced in 3 sessions, consistently mentioned  
**Confidence:** 0.95  
**Last Updated:** 2024-01-19T00:15:30Z  
**Source:** [linked item IDs]

### Fact 2: [Another Fact]

[Similar structure as Fact 1]

## Contradictions and Conflicts

[Document any conflicting memories with source information, timestamps, and resolution status]

## Usage Notes

[Context-specific guidance for interpreting facts in this category]
```

**Key design decisions:**
- Human-readable markdown for easy review and manual editing
- Metadata headers enable quick assessment without reading full content
- Explicitly track contradictions for conflict resolution workflow
- Markdown enables version control and diffing

**Validation:**
- File must be valid markdown
- Must contain at least one "Key Facts" section
- Each fact must reference at least one source item
- Referenced item IDs must exist
- ISO 8601 timestamps must be valid

### 1.4 Conflict Record Schema

Defines structure for tracking contradictory memories that require resolution.

**File location:** `~/.puffin/memory/<user-id>/conflicts.json`

**Schema:**
```json
{
  "conflicts": [
    {
      "id": "conflict_20240119_001",
      "createdAt": "2024-01-19T08:45:00Z",
      "status": "unresolved",
      "category": "coding_preferences",
      "items": [
        {
          "itemId": "item_20240119_cp_001",
          "content": "Prefer async/await",
          "confidence": 0.95,
          "extractedAt": "2024-01-19T00:15:30Z"
        },
        {
          "itemId": "item_20240110_cp_003",
          "content": "Prefer Promise.then() chains",
          "confidence": 0.85,
          "extractedAt": "2024-01-10T12:30:00Z"
        }
      ],
      "resolution": {
        "status": "pending_user_review",
        "decision": null,
        "reasoningNotes": null,
        "resolvedAt": null
      }
    }
  ]
}
```

**Resolution statuses:**
- `unresolved` - Conflict detected, awaiting user review
- `pending_user_review` - Presented to user, awaiting decision
- `accepted_newer` - User chose the more recent item
- `accepted_higher_confidence` - User chose higher confidence item
- `kept_both_with_context` - User resolved by keeping both with contextual distinction
- `marked_outdated` - User marked older item as no longer valid
- `auto_resolved` - System resolved based on configuration

---

## Step 2: Design the LLM Extraction Prompts

### 2.1 Main Extraction Prompt Template

Used to extract structured memory items from raw conversation text.

**Prompt:**
```
You are a memory extraction specialist. Analyze the following development conversation and extract key decisions, preferences, and insights.

## Conversation

[CONVERSATION_TEXT]

## Extraction Task

Identify and extract memories in these categories:

### Coding Preferences
User preferences about coding style, library choices, patterns, and best practices. Examples:
- "User prefers async/await over Promise.then()"
- "Strongly favors functional programming patterns"
- "Dislikes verbose type annotations"

### Architectural Decisions
Important design choices, trade-offs accepted, and architectural patterns. Examples:
- "Chose event-driven architecture for state management"
- "Using dependency injection to reduce coupling"
- "Trade-off: Chose simplicity over extensibility"

### Project Conventions
Naming conventions, file organization, tooling preferences, and project-specific standards. Examples:
- "Variables use camelCase, constants use UPPER_SNAKE_CASE"
- "Components organized by feature, not by type"
- "All async operations wrapped in try/catch"

### Bug Patterns
Recurring issues, root causes identified, and fixes applied. Examples:
- "Race conditions common in async state updates"
- "Pattern: Off-by-one errors in array indexing"
- "Fix: Always validate API response structure before access"

### Implementation Notes
Lessons learned, approaches tried, and guidance for future work. Examples:
- "Component refactoring using composition reduces coupling"
- "Attempted validation library X, switched to Y due to performance"
- "CSS modules provide better scoping than BEM"

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
```

**Implementation notes:**
- Confidence threshold of 0.75 filters low-quality extractions
- Prompt emphasizes specificity and avoiding generic advice
- Clear category definitions reduce ambiguity
- JSON-only response enables deterministic parsing

### 2.2 Category Evolution Prompt Template

Used when integrating new extracted items into existing category summaries.

**Prompt:**
```
You are a knowledge synthesis specialist. Your task is to integrate new memory items into an existing category summary, handling contradictions and maintaining coherence.

## Existing Category Summary

[CURRENT_CATEGORY_CONTENT]

## New Items to Integrate

[NEW_ITEMS_JSON]

## Integration Task

1. **Assess Contradictions**: Identify any new items that contradict existing facts
   - Note the specific contradictions
   - Include confidence scores from both old and new items
   - Flag items that may represent evolution of thinking (old → new)

2. **Update Core Facts**: Integrate non-contradictory items into "Key Facts" section
   - Merge related items into single facts
   - Update confidence scores based on repetition
   - Add new source item references

3. **Handle Conflicts**: Document contradictions in "Contradictions and Conflicts" section
   - Present both viewpoints with evidence
   - Include timestamps to show recency
   - Do NOT delete older items; preserve full history

4. **Maintain Narrative**: Rewrite summary to reflect current state of knowledge
   - Keep narrative coherent and actionable
   - Highlight significant shifts or refinements in understanding
   - Use clear language for non-technical audiences

## Response Format

Return ONLY the updated category content in markdown format. Preserve the structure defined in Step 1.3.

## Constraints

- Do NOT delete any facts, even outdated ones
- DO document contradictions explicitly
- DO update confidence scores based on reinforcement
- DO preserve source item references for audit trails
- DO flag time-sensitive information with expiration windows
```

**Implementation notes:**
- Explicitly handles contradictions without data loss
- Supports incremental knowledge refinement
- Maintains audit trail through source references
- Emphasizes narrative coherence for human consumption

### 2.3 Edge Case Fallback Prompts

**For empty conversations (no extractable content):**
```
You are analyzing a development conversation. If this conversation contains meaningful development decisions, preferences, or insights, extract them using the standard format. If the conversation is primarily procedural or administrative with no substantive knowledge content, respond with:

{"no_content_to_extract": true}
```

**For unclear or ambiguous content:**
```
You are analyzing unclear development content. For items you're unsure about, include them but lower the confidence score to reflect uncertainty. Items with confidence below 0.75 will be filtered by downstream processing. Only omit items if they're completely unrelated to development.
```

### 2.4 Response Validation Schema

**Validation rules for LLM responses:**

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
- If LLM fails: Return error, preserve previous category state

---

## Step 3: Implement Core Memory Manager

### 3.1 File System Layer

**Responsibilities:**
- Create and manage directory structure
- Ensure atomic write operations
- Handle concurrent access safely
- Manage file permissions

**Implementation:**

```javascript
class FileSystemLayer {
  constructor(basePath) {
    this.basePath = basePath; // ~/.puffin/memory/<user-id>
    this.initialized = false;
  }

  async initialize() {
    // Create base directory structure
    const dirs = [
      'resources',
      'items',
      'items/coding_preferences',
      'items/architectural_decisions',
      'items/project_conventions',
      'items/bug_patterns',
      'items/implementation_notes',
      'categories'
    ];
    
    for (const dir of dirs) {
      await fs.mkdir(path.join(this.basePath, dir), { recursive: true });
    }
    
    this.initialized = true;
  }

  async writeFile(relativePath, content) {
    // Atomic write: write to temp file, then rename
    const fullPath = path.join(this.basePath, relativePath);
    const tempPath = fullPath + '.tmp';
    
    await fs.writeFile(tempPath, content);
    await fs.rename(tempPath, fullPath);
  }

  async readFile(relativePath) {
    const fullPath = path.join(this.basePath, relativePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  async fileExists(relativePath) {
    try {
      await fs.access(path.join(this.basePath, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(relativePath) {
    const fullPath = path.join(this.basePath, relativePath);
    return await fs.readdir(fullPath);
  }
}
```

**Key design decisions:**
- Atomic writes via temp file + rename prevent corruption
- `async/await` enables non-blocking I/O
- Recursive directory creation handles first-run setup
- Error handling delegates to callers for flexibility

### 3.2 Write Path Implementation

**Responsibilities:**
- Accept conversation text and metadata
- Ingest as immutable resource
- Call LLM for extraction
- Batch and store extracted items
- Evolve category summaries
- Track metadata (timestamps, confidence, etc.)

**Implementation:**

```javascript
class MemoryWriter {
  constructor(fsLayer, llmExtractor) {
    this.fs = fsLayer;
    this.llm = llmExtractor;
  }

  async memorize(conversationText, branchId, sessionId) {
    try {
      // Step 1: Ingest as resource (immutable)
      const resourceId = await this.ingestResource(
        conversationText,
        branchId,
        sessionId
      );

      // Step 2: Extract items via LLM
      const extractedItems = await this.llm.extract(conversationText);

      // Step 3: Batch and store items
      const itemsByCategory = this.batchByCategory(extractedItems);
      const storedItemIds = [];
      
      for (const [category, items] of Object.entries(itemsByCategory)) {
        for (const item of items) {
          const itemId = await this.storeItem(
            category,
            item,
            resourceId
          );
          storedItemIds.push(itemId);
        }
      }

      // Step 4: Evolve category summaries
      const updatedCategories = [];
      for (const category of Object.keys(itemsByCategory)) {
        await this.evolveCategorySummary(category, storedItemIds);
        updatedCategories.push(category);
      }

      return {
        resourceId,
        itemsExtracted: storedItemIds.length,
        categoriesUpdated: updatedCategories
      };
    } catch (error) {
      return {
        error: true,
        code: 'MEMORIZATION_FAILED',
        message: error.message
      };
    }
  }

  async ingestResource(conversationText, branchId, sessionId) {
    const resourceId = `resource_${Date.now()}_${branchId}`;
    const resource = {
      id: resourceId,
      timestamp: new Date().toISOString(),
      branchId,
      sessionId,
      conversationText,
      metadata: {
        messageCount: (conversationText.match(/\n/g) || []).length,
        bytesSize: conversationText.length
      }
    };

    await this.fs.writeFile(
      `resources/${resourceId}.json`,
      JSON.stringify(resource, null, 2)
    );

    return resourceId;
  }

  batchByCategory(extractedItems) {
    const batched = {};
    
    for (const [category, items] of Object.entries(extractedItems)) {
      batched[category] = items.filter(item => item.confidence >= 0.75);
    }
    
    return batched;
  }

  async storeItem(category, itemData, sourceResourceId) {
    const itemId = `item_${Date.now()}_${category.substring(0, 2)}_${Math.random().toString(36).substr(2, 9)}`;
    const item = {
      id: itemId,
      category,
      content: itemData.content,
      sourceResourceId,
      extractedAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      accessCount: 0,
      confidence: itemData.confidence,
      metadata: {
        tags: itemData.tags || [],
        related_items: []
      }
    };

    const filePath = `items/${category}/${itemId}.json`;
    await this.fs.writeFile(filePath, JSON.stringify(item, null, 2));

    return itemId;
  }

  async evolveCategorySummary(category, newItemIds) {
    const categoryFile = `categories/${category}.md`;
    const exists = await this.fs.fileExists(categoryFile);
    
    let currentContent = exists ? await this.fs.readFile(categoryFile) : '';
    
    // Load new items
    const categoryPath = `items/${category}`;
    const itemFiles = await this.fs.listFiles(categoryPath);
    const items = [];
    
    for (const file of itemFiles.filter(f => f.endsWith('.json'))) {
      const content = await this.fs.readFile(`${categoryPath}/${file}`);
      items.push(JSON.parse(content));
    }

    // Use LLM to integrate new items into summary
    const updatedContent = await this.llm.evolveSummary(
      currentContent,
      items,
      category
    );

    await this.fs.writeFile(categoryFile, updatedContent);
  }
}
```

**Validation:**
- Resource IDs must be unique
- All items must reference valid resource IDs
- Category names must match configured categories
- All files must be valid JSON/Markdown

### 3.3 Read Path Implementation

**Responsibilities:**
- Accept search query
- Synthesize query into search keywords
- Select relevant categories
- Check if summaries are sufficient
- Fall back to hierarchical search if needed
- Assemble results within token budget
- Detect and surface conflicts

**Implementation:**

```javascript
class MemoryReader {
  constructor(fsLayer, llmRetriever) {
    this.fs = fsLayer;
    this.llm = llmRetriever;
  }

  async retrieve(query, maxResults = 5) {
    try {
      // Step 1: Query synthesis
      const synthesizedQuery = await this.llm.synthesizeQuery(query);

      // Step 2: Category selection
      const relevantCategories = await this.selectCategories(synthesizedQuery);

      // Step 3: Load category summaries
      const summaries = [];
      for (const category of relevantCategories) {
        const content = await this.loadCategorySummary(category);
        summaries.push({ category, content });
      }

      // Step 4: Sufficiency check
      const isSufficient = await this.llm.checkSufficiency(
        query,
        summaries
      );

      if (isSufficient) {
        // Return summaries
        return this.assembleResults(summaries, maxResults);
      }

      // Step 5: Hierarchical search fallback
      const items = await this.searchItems(synthesizedQuery, relevantCategories);
      const results = [...summaries];
      results.push(...items.slice(0, maxResults - summaries.length));

      return this.assembleResults(results, maxResults);
    } catch (error) {
      return {
        error: true,
        code: 'RETRIEVAL_FAILED',
        message: error.message
      };
    }
  }

  async selectCategories(query) {
    const availableCategories = [
      'coding_preferences',
      'architectural_decisions',
      'project_conventions',
      'bug_patterns',
      'implementation_notes'
    ];

    const selected = await this.llm.selectCategories(query, availableCategories);
    return selected;
  }

  async loadCategorySummary(category) {
    const exists = await this.fs.fileExists(`categories/${category}.md`);
    if (!exists) return null;
    
    return await this.fs.readFile(`categories/${category}.md`);
  }

  async searchItems(query, categories) {
    const items = [];
    
    for (const category of categories) {
      const categoryPath = `items/${category}`;
      const files = await this.fs.listFiles(categoryPath);
      
      for (const file of files.filter(f => f.endsWith('.json'))) {
        const content = await this.fs.readFile(`items/${category}/${file}`);
        const item = JSON.parse(content);
        items.push(item);
      }
    }

    // Score items for relevance
    const scored = await this.llm.scoreItems(query, items);
    scored.sort((a, b) => b.score - a.score);
    
    return scored;
  }

  async detectConflicts(results) {
    // Load conflict file if exists
    const conflictFile = 'conflicts.json';
    const exists = await this.fs.fileExists(conflictFile);
    
    if (!exists) return [];
    
    const content = await this.fs.readFile(conflictFile);
    const conflicts = JSON.parse(content);
    
    // Filter to conflicts affecting current results
    return conflicts.conflicts.filter(conflict => {
      return conflict.items.some(item => 
        results.some(r => r.id === item.itemId)
      );
    });
  }

  assembleResults(results, maxResults) {
    return {
      memories: results.slice(0, maxResults),
      totalCount: results.length,
      retrievalTime: Date.now()
    };
  }
}
```

**Validation:**
- Query must be non-empty string
- Categories returned by LLM must be valid
- All retrieved items must exist and be valid JSON
- Results must be sorted by relevance

---

## Step 4: Implement Retrieval System

### 4.1 Temporal Decay Calculator

Implements the decay formula: `final_score = relevance_score × time_decay_factor`

Where: `time_decay_factor = 1.0 / (1.0 + (age_in_days / half_life_days))`

```javascript
class TemporalDecay {
  constructor(halfLifeDays = 30) {
    this.halfLifeDays = halfLifeDays;
  }

  calculateDecayFactor(timestampISO) {
    const created = new Date(timestampISO);
    const now = new Date();
    const ageMs = now.getTime() - created.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    return 1.0 / (1.0 + (ageDays / this.halfLifeDays));
  }

  applyDecay(relevanceScore, timestampISO) {
    const decayFactor = this.calculateDecayFactor(timestampISO);
    return relevanceScore * decayFactor;
  }
}
```

**Validation:**
- `halfLifeDays` must be positive number
- Timestamp must be valid ISO 8601
- Decay factor must be between 0.0 and 1.0
- Recent items (age 0 days) must have decay factor of 1.0

### 4.2 Relevance Scoring

Multi-factor scoring algorithm combining relevance, recency, frequency, and confidence.

```javascript
class RelevanceScorer {
  constructor(config = {}) {
    this.relevanceWeight = config.relevanceWeight || 0.5;
    this.confidenceWeight = config.confidenceWeight || 0.3;
    this.frequencyWeight = config.frequencyWeight || 0.1;
    this.recencyWeight = config.recencyWeight || 0.1;
    this.relevanceThreshold = config.relevanceThreshold || 0.7;
    this.decay = new TemporalDecay(config.halfLifeDays || 30);
  }

  async scoreItem(item, query, llm) {
    // LLM evaluates semantic relevance
    const relevanceScore = await llm.scoreRelevance(item.content, query);
    
    // Confidence is explicitly stored
    const confidenceScore = item.confidence;
    
    // Access frequency (normalized to 0-1)
    const maxAccessCount = 100; // Configurable
    const frequencyScore = Math.min(item.accessCount / maxAccessCount, 1.0);
    
    // Temporal decay
    const recencyScore = this.decay.calculateDecayFactor(item.extractedAt);
    
    // Combined score
    const finalScore = (
      relevanceScore * this.relevanceWeight +
      confidenceScore * this.confidenceWeight +
      frequencyScore * this.frequencyWeight +
      recencyScore * this.recencyWeight
    );
    
    return {
      itemId: item.id,
      finalScore,
      components: {
        relevance: relevanceScore,
        confidence: confidenceScore,
        frequency: frequencyScore,
        recency: recencyScore
      }
    };
  }

  async filterByThreshold(scores) {
    return scores.filter(s => s.finalScore >= this.relevanceThreshold);
  }
}
```

**Validation:**
- All weights must sum to 1.0
- Relevance threshold must be 0.0-1.0
- All component scores must be 0.0-1.0
- Final score must be 0.0-1.0

### 4.3 Conflict Detection

Identifies contradictory memories and surfaces them to user.

```javascript
class ConflictDetector {
  async detectConflicts(memories, llm) {
    const conflicts = [];
    
    // Group by category
    const byCategory = {};
    for (const memory of memories) {
      if (!byCategory[memory.category]) {
        byCategory[memory.category] = [];
      }
      byCategory[memory.category].push(memory);
    }
    
    // Check each category for contradictions
    for (const [category, items] of Object.entries(byCategory)) {
      if (items.length < 2) continue;
      
      // LLM identifies contradictions
      const contradictions = await llm.findContradictions(items);
      conflicts.push(...contradictions);
    }
    
    return conflicts;
  }

  formatConflictReport(conflict) {
    return {
      id: conflict.id,
      category: conflict.category,
      items: conflict.items.map(item => ({
        itemId: item.itemId,
        content: item.content,
        confidence: item.confidence,
        extractedAt: item.extractedAt,
        age: this.calculateAge(item.extractedAt)
      })),
      status: conflict.resolution.status,
      notes: conflict.resolution.reasoningNotes
    };
  }

  calculateAge(timestamp) {
    const now = new Date();
    const created = new Date(timestamp);
    const days = (now - created) / (1000 * 60 * 60 * 24);
    
    if (days < 1) return 'today';
    if (days < 7) return `${Math.floor(days)} days ago`;
    if (days < 30) return `${Math.floor(days/7)} weeks ago`;
    return `${Math.floor(days/30)} months ago`;
  }
}
```

### 4.4 Token Budget Manager

Packs results to fit within token budget.

```javascript
class TokenBudgetManager {
  constructor(maxTokens = 2000, tokenRatio = 0.25) {
    this.maxTokens = maxTokens;
    this.tokenRatio = tokenRatio; // ~1 token per 4 chars
  }

  estimateTokens(text) {
    return Math.ceil(text.length * this.tokenRatio);
  }

  assembleContext(memories, conflicts) {
    let context = '';
    let usedTokens = 0;
    const includedMemories = [];
    
    // First, add conflict information
    for (const conflict of conflicts) {
      const conflictText = this.formatConflict(conflict);
      const tokens = this.estimateTokens(conflictText);
      
      if (usedTokens + tokens <= this.maxTokens) {
        context += conflictText + '\n\n';
        usedTokens += tokens;
      }
    }
    
    // Then, add memories sorted by score
    const sorted = [...memories].sort((a, b) => (b.score || 0) - (a.score || 0));
    
    for (const memory of sorted) {
      const memoryText = this.formatMemory(memory);
      const tokens = this.estimateTokens(memoryText);
      
      if (usedTokens + tokens <= this.maxTokens) {
        context += memoryText + '\n\n';
        usedTokens += tokens;
        includedMemories.push(memory.id);
      }
    }
    
    return {
      context,
      usedTokens,
      includedMemories,
      capacityRemaining: this.maxTokens - usedTokens
    };
  }

  formatMemory(memory) {
    return `**${memory.category}** (confidence: ${(memory.confidence * 100).toFixed(0)}%)\n${memory.content}`;
  }

  formatConflict(conflict) {
    return `⚠️ **CONFLICTING MEMORY** in ${conflict.category}\n${conflict.items.map(i => `- ${i.content} (${i.extractedAt})`).join('\n')}`;
  }
}
```

---

## Step 5: Design IPC Interface

### 5.1 IPC Handler Mapping

Each IPC channel maps to a handler function with input validation and error handling.

**Handler registry:**

```javascript
class IPCRegistry {
  constructor(memoryManager) {
    this.manager = memoryManager;
    this.handlers = {
      'memory:memorize': this.handleMemorize.bind(this),
      'memory:retrieve': this.handleRetrieve.bind(this),
      'memory:get-category': this.handleGetCategory.bind(this),
      'memory:get-stats': this.handleGetStats.bind(this),
      'memory:get-status': this.handleGetStatus.bind(this),
      'memory:clear-category': this.handleClearCategory.bind(this),
      'memory:run-maintenance': this.handleRunMaintenance.bind(this),
      'memory:resolve-conflict': this.handleResolveConflict.bind(this)
    };
  }

  register(ipcMain) {
    for (const [channel, handler] of Object.entries(this.handlers)) {
      ipcMain.handle(channel, handler);
    }
  }

  async handleMemorize(event, request) {
    const validation = this.validateMemorizeRequest(request);
    if (!validation.valid) return this.errorResponse('INVALID_INPUT', validation.error);
    
    return await this.manager.write.memorize(
      request.conversationText,
      request.branchId,
      request.sessionId
    );
  }

  async handleRetrieve(event, request) {
    const validation = this.validateRetrieveRequest(request);
    if (!validation.valid) return this.errorResponse('INVALID_INPUT', validation.error);
    
    return await this.manager.read.retrieve(
      request.query,
      request.maxResults || 5
    );
  }

  validateMemorizeRequest(request) {
    if (!request.conversationText || typeof request.conversationText !== 'string') {
      return { valid: false, error: 'conversationText must be non-empty string' };
    }
    if (!request.branchId || typeof request.branchId !== 'string') {
      return { valid: false, error: 'branchId must be non-empty string' };
    }
    if (!request.sessionId || typeof request.sessionId !== 'string') {
      return { valid: false, error: 'sessionId must be non-empty string' };
    }
    return { valid: true };
  }

  validateRetrieveRequest(request) {
    if (!request.query || typeof request.query !== 'string') {
      return { valid: false, error: 'query must be non-empty string' };
    }
    return { valid: true };
  }

  errorResponse(code, message) {
    return {
      error: true,
      code,
      message
    };
  }
}
```

### 5.2 Input Validation Schemas

JSON Schema definitions for each IPC endpoint.

```javascript
const validationSchemas = {
  memorizeRequest: {
    type: 'object',
    required: ['conversationText', 'branchId', 'sessionId'],
    properties: {
      conversationText: { type: 'string', minLength: 1 },
      branchId: { type: 'string', minLength: 1 },
      sessionId: { type: 'string', minLength: 1 }
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
  
  getCategoryRequest: {
    type: 'object',
    required: ['category'],
    properties: {
      category: {
        type: 'string',
        enum: ['coding_preferences', 'architectural_decisions', 'project_conventions', 'bug_patterns', 'implementation_notes']
      }
    }
  },
  
  clearCategoryRequest: {
    type: 'object',
    required: ['category'],
    properties: {
      category: {
        type: 'string',
        enum: ['coding_preferences', 'architectural_decisions', 'project_conventions', 'bug_patterns', 'implementation_notes']
      }
    }
  },
  
  runMaintenanceRequest: {
    type: 'object',
    required: ['type'],
    properties: {
      type: {
        type: 'string',
        enum: ['nightly', 'weekly', 'monthly', 'full']
      }
    }
  }
};
```

### 5.3 Error Handling and Response Formatting

Consistent error responses and success responses.

```javascript
class ResponseFormatter {
  static success(data) {
    return {
      success: true,
      data,
      timestamp: new Date().toISOString()
    };
  }

  static error(code, message, context = null) {
    return {
      error: true,
      code,
      message,
      context,
      timestamp: new Date().toISOString()
    };
  }
}
```

**Error codes:**
- `INVALID_INPUT` - Validation failed
- `NOT_FOUND` - Category or memory not found
- `EXTRACTION_FAILED` - LLM extraction error
- `RETRIEVAL_FAILED` - Search failed
- `STORAGE_ERROR` - File I/O error
- `MAINTENANCE_FAILED` - Maintenance task failed
- `INTERNAL_ERROR` - Unexpected error

### 5.4 Integration Tests

Test each IPC endpoint with valid and invalid inputs.

```javascript
describe('IPC Handlers', () => {
  describe('memory:memorize', () => {
    test('should extract and store memories from conversation', async () => {
      const response = await ipcMain.invoke('memory:memorize', {
        conversationText: 'Discussed using async/await...',
        branchId: 'feature-1',
        sessionId: 'session-1'
      });
      
      expect(response.resourceId).toBeDefined();
      expect(response.itemsExtracted).toBeGreaterThan(0);
      expect(response.categoriesUpdated).toBeInstanceOf(Array);
    });

    test('should reject invalid inputs', async () => {
      const response = await ipcMain.invoke('memory:memorize', {
        conversationText: '',
        branchId: 'feature-1',
        sessionId: 'session-1'
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
});
```

---

## Step 6: Implement Maintenance Tasks

### 6.1 Scheduler Setup

Uses `node-cron` or similar for scheduling maintenance.

```javascript
const cron = require('node-cron');

class MaintenanceScheduler {
  constructor(maintenanceManager, config) {
    this.manager = maintenanceManager;
    this.config = config;
    this.jobs = {};
  }

  start() {
    if (this.config.maintenance.nightly.enabled) {
      this.jobs.nightly = cron.schedule(
        this.config.maintenance.nightly.schedule,
        () => this.manager.runNightly()
      );
    }

    if (this.config.maintenance.weekly.enabled) {
      this.jobs.weekly = cron.schedule(
        this.config.maintenance.weekly.schedule,
        () => this.manager.runWeekly()
      );
    }

    if (this.config.maintenance.monthly.enabled) {
      this.jobs.monthly = cron.schedule(
        this.config.maintenance.monthly.schedule,
        () => this.manager.runMonthly()
      );
    }
  }

  stop() {
    for (const job of Object.values(this.jobs)) {
      job.stop();
    }
  }
}
```

### 6.2 Nightly Consolidation

Reviews conversations from past 24 hours, identifies redundancies.

```javascript
class NightlyConsolidation {
  async run(fsLayer, llm) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const resources = await this.getResourcesSince(fsLayer, oneDayAgo);
    
    const duplicates = [];
    const contradictions = [];
    
    for (let i = 0; i < resources.length; i++) {
      for (let j = i + 1; j < resources.length; j++) {
        const isDuplicate = await llm.areDuplicate(resources[i], resources[j]);
        if (isDuplicate) {
          duplicates.push([resources[i].id, resources[j].id]);
        }
        
        const contradiction = await llm.findContradiction(resources[i], resources[j]);
        if (contradiction) {
          contradictions.push(contradiction);
        }
      }
    }
    
    // Merge duplicates (keep higher confidence)
    for (const [id1, id2] of duplicates) {
      await this.mergeDuplicates(fsLayer, id1, id2);
    }
    
    // Record contradictions
    await this.recordContradictions(fsLayer, contradictions);
    
    return {
      resourcesProcessed: resources.length,
      duplicatesMerged: duplicates.length,
      contradictionsFound: contradictions.length
    };
  }
}
```

### 6.3 Weekly Summarization

Compresses older memories, archives infrequent items.

```javascript
class WeeklySummarization {
  async run(fsLayer, llm) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Find items older than 30 days
    const oldItems = await this.getItemsOlderThan(fsLayer, thirtyDaysAgo);
    
    // Group by category
    const byCategory = {};
    for (const item of oldItems) {
      if (!byCategory[item.category]) {
        byCategory[item.category] = [];
      }
      byCategory[item.category].push(item);
    }
    
    // Compress each category
    for (const [category, items] of Object.entries(byCategory)) {
      const compressed = await llm.compressItems(items);
      await this.storeCompressed(fsLayer, category, compressed);
    }
    
    // Archive infrequent items
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const infrequent = await this.getInfrequentItems(fsLayer, ninetyDaysAgo);
    await this.archiveItems(fsLayer, infrequent);
    
    return {
      itemsCompressed: oldItems.length,
      itemsArchived: infrequent.length
    };
  }
}
```

### 6.4 Monthly Re-indexing

Re-generates embeddings, re-weights relationships (placeholder for future).

```javascript
class MonthlyReIndexing {
  async run(fsLayer, llm) {
    // Future: Regenerate embeddings with latest model
    // For v1: Just update access timestamps and validate integrity
    
    const allItems = await this.getAllItems(fsLayer);
    let validItems = 0;
    let invalidItems = 0;
    
    for (const item of allItems) {
      try {
        await this.validateItem(item);
        validItems++;
      } catch (error) {
        invalidItems++;
        await this.markInvalid(fsLayer, item.id);
      }
    }
    
    return {
      itemsValidated: validItems,
      itemsInvalid: invalidItems
    };
  }
}
```

---

## Step 7: Build Renderer UI Components

### 7.1 Status Indicator Component

Displays memory system health in UI.

```javascript
// MemoryStatusIndicator.js
class MemoryStatusIndicator {
  render() {
    const { status, lastError, maintenanceInProgress } = this.state;
    
    return `
      <div class="memory-status">
        <span class="status-dot ${status}"></span>
        <span class="status-text">
          ${this.getStatusText(status)}
        </span>
        ${maintenanceInProgress ? '<span class="maintenance-badge">Maintenance</span>' : ''}
        ${lastError ? `<span class="error-tooltip" title="${lastError}">⚠️</span>` : ''}
      </div>
    `;
  }

  getStatusText(status) {
    const statusMap = {
      'ready': 'Memory System Ready',
      'processing': 'Processing...',
      'error': 'Error'
    };
    return statusMap[status] || 'Unknown';
  }
}
```

### 7.2 Statistics Dashboard

Visualizes memory metrics.

```javascript
// MemoryStatsDashboard.js
class MemoryStatsDashboard {
  render() {
    const { totalItems, totalCategories, totalResources, lastMemorized, nextMaintenance } = this.stats;
    
    return `
      <div class="memory-dashboard">
        <div class="stat-card">
          <h3>Total Memories</h3>
          <p class="stat-value">${totalItems}</p>
        </div>
        <div class="stat-card">
          <h3>Categories</h3>
          <p class="stat-value">${totalCategories}</p>
        </div>
        <div class="stat-card">
          <h3>Conversations Processed</h3>
          <p class="stat-value">${totalResources}</p>
        </div>
        <div class="stat-card">
          <h3>Last Updated</h3>
          <p class="stat-value">${this.formatTime(lastMemorized)}</p>
        </div>
        <div class="stat-card">
          <h3>Next Maintenance</h3>
          <p class="stat-value">${this.formatTime(nextMaintenance)}</p>
        </div>
      </div>
    `;
  }

  formatTime(isoTime) {
    const date = new Date(isoTime);
    return date.toLocaleString();
  }
}
```

### 7.3 Conflict Resolution UI

Displays contradictory memories side-by-side.

```javascript
// ConflictResolutionPanel.js
class ConflictResolutionPanel {
  render(conflict) {
    return `
      <div class="conflict-panel">
        <div class="conflict-header">
          <h3>⚠️ Conflicting Memory in ${conflict.category}</h3>
          <span class="conflict-id">${conflict.id}</span>
        </div>
        
        <div class="conflict-items">
          ${conflict.items.map((item, i) => `
            <div class="conflict-item ${i === 0 ? 'older' : 'newer'}">
              <div class="item-meta">
                <span class="confidence">Confidence: ${(item.confidence * 100).toFixed(0)}%</span>
                <span class="date">${item.extractedAt}</span>
                <span class="age">${this.getAge(item.extractedAt)}</span>
              </div>
              <p class="content">${item.content}</p>
            </div>
          `).join('')}
        </div>
        
        <div class="resolution-actions">
          <button onclick="this.resolveWith(0)">Keep Older</button>
          <button onclick="this.resolveWith(1)">Keep Newer</button>
          <button onclick="this.resolveKeepBoth()">Keep Both (with context)</button>
          <button onclick="this.resolveMarkOutdated(0)">Mark Older as Outdated</button>
        </div>
      </div>
    `;
  }

  getAge(timestamp) {
    const ms = Date.now() - new Date(timestamp);
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
  }

  async resolveWith(index) {
    const decision = index === 0 ? 'accepted_older' : 'accepted_newer';
    await ipcRenderer.invoke('memory:resolve-conflict', {
      conflictId: this.conflict.id,
      decision,
      userNotes: ''
    });
  }
}
```

### 7.4 Manual Review Interface

Allows browsing and editing memories.

```javascript
// MemoryBrowser.js
class MemoryBrowser {
  render() {
    return `
      <div class="memory-browser">
        <div class="category-selector">
          ${this.categories.map(cat => `
            <button onclick="this.loadCategory('${cat}')">${cat}</button>
          `).join('')}
        </div>
        
        <div class="memory-list">
          ${this.currentItems.map(item => `
            <div class="memory-item">
              <p class="content">${item.content}</p>
              <div class="metadata">
                <span>Confidence: ${(item.confidence * 100).toFixed(0)}%</span>
                <span>Accessed: ${item.accessCount} times</span>
                <span>Last: ${this.getAge(item.lastAccessed)}</span>
              </div>
              <div class="actions">
                <button onclick="this.editItem('${item.id}')">Edit</button>
                <button onclick="this.deleteItem('${item.id}')">Delete</button>
              </div>
            </div>
          `).join('')}
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
  test('should successfully memorize a conversation and retrieve memories', async () => {
    // 1. Memorize
    const conversationText = `
      User: We should use async/await for all async operations.
      Claude: Good idea. Let's refactor promises to async/await.
      User: Also, let's adopt event-driven architecture.
    `;
    
    const memorizeResponse = await ipcRenderer.invoke('memory:memorize', {
      conversationText,
      branchId: 'test-branch',
      sessionId: 'test-session'
    });
    
    expect(memorizeResponse.resourceId).toBeDefined();
    expect(memorizeResponse.itemsExtracted).toBeGreaterThan(0);
    
    // 2. Retrieve
    const retrieveResponse = await ipcRenderer.invoke('memory:retrieve', {
      query: 'what async pattern do we use?'
    });
    
    expect(retrieveResponse.memories).toBeInstanceOf(Array);
    expect(retrieveResponse.memories.some(m => m.content.includes('async/await'))).toBe(true);
  });
});
```

### 8.2 Retrieval Accuracy Tests

```javascript
describe('Retrieval Accuracy', () => {
  test('should retrieve relevant memories for specific queries', async () => {
    // Setup: Create test memories
    const queries = [
      { query: 'async pattern', expectedCategory: 'coding_preferences' },
      { query: 'architecture decision', expectedCategory: 'architectural_decisions' },
      { query: 'naming convention', expectedCategory: 'project_conventions' }
    ];
    
    for (const test of queries) {
      const response = await ipcRenderer.invoke('memory:retrieve', {
        query: test.query
      });
      
      expect(response.memories.length).toBeGreaterThan(0);
      expect(response.memories.some(m => m.category === test.expectedCategory)).toBe(true);
    }
  });
});
```

### 8.3 Conflict Detection Tests

```javascript
describe('Conflict Detection', () => {
  test('should detect and report contradictory memories', async () => {
    // Memorize conflicting preferences
    await ipcRenderer.invoke('memory:memorize', {
      conversationText: 'We prefer async/await',
      branchId: 'session-1',
      sessionId: 'session-1'
    });
    
    await ipcRenderer.invoke('memory:memorize', {
      conversationText: 'Actually, Promise.then() is better for us',
      branchId: 'session-2',
      sessionId: 'session-2'
    });
    
    // Retrieve should surface conflict
    const response = await ipcRenderer.invoke('memory:retrieve', {
      query: 'async pattern'
    });
    
    expect(response.conflicts).toBeDefined();
    expect(response.conflicts.length).toBeGreaterThan(0);
  });
});
```

### 8.4 Maintenance Task Verification

```javascript
describe('Maintenance Tasks', () => {
  test('should run nightly consolidation successfully', async () => {
    const response = await ipcRenderer.invoke('memory:run-maintenance', {
      type: 'nightly'
    });
    
    expect(response.success).toBe(true);
    expect(response.duration).toBeGreaterThan(0);
    expect(response.results.duplicatesMerged).toBeDefined();
  });
  
  test('should run weekly summarization', async () => {
    const response = await ipcRenderer.invoke('memory:run-maintenance', {
      type: 'weekly'
    });
    
    expect(response.success).toBe(true);
    expect(response.results.itemsCompressed).toBeDefined();
  });
});
```

### 8.5 Performance Benchmarks

```javascript
describe('Performance Benchmarks', () => {
  test('retrieval should complete in <500ms for typical query', async () => {
    const start = Date.now();
    
    await ipcRenderer.invoke('memory:retrieve', {
      query: 'async pattern',
      maxResults: 5
    });
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
  });
  
  test('memorization should handle 1MB conversations', async () => {
    const largeConversation = 'test'.repeat(256000); // ~1MB
    
    const start = Date.now();
    
    const response = await ipcRenderer.invoke('memory:memorize', {
      conversationText: largeConversation,
      branchId: 'large-test',
      sessionId: 'large-session'
    });
    
    const duration = Date.now() - start;
    expect(response.error).not.toBeDefined();
    expect(duration).toBeLessThan(5000); // Should complete in <5s
  });
});
```

---

## Step 9: Documentation

### 9.1 Plugin README

**File:** `plugins/memory-plugin/README.md`

```markdown
# Memory Plugin

Automatically extracts and memorizes key decisions from development conversations.

## Installation

1. Copy the plugin directory to `plugins/memory-plugin/`
2. Restart Puffin
3. Plugin will initialize memory storage on first run

## Configuration

Edit `plugins/memory-plugin/config/default-config.json` to customize:

- Storage location
- Extraction confidence threshold
- Retrieval relevance threshold
- Maintenance schedules

## Usage

### Manual Memory Extraction

Right-click on a branch thread → "Save to Memory"

### Memory Retrieval

Type `/memory: <query>` in Claude Code to retrieve relevant memories.

### Memory Review

Open Memory Dashboard from Puffin menu to:
- Browse category summaries
- Resolve conflicting memories
- View statistics

## Troubleshooting

If memories aren't being extracted:
1. Check DevTools console for errors
2. Verify `~/.puffin/memory/<user-id>` directory exists
3. Check file permissions
4. Review memory plugin logs
```

### 9.2 API Documentation

**File:** `plugins/memory-plugin/API.md`

Provide complete IPC channel reference with examples.

### 9.3 Configuration Reference Guide

**File:** `plugins/memory-plugin/CONFIGURATION.md`

Document all configuration options with defaults and impact.

### 9.4 Troubleshooting Guide

**File:** `plugins/memory-plugin/TROUBLESHOOTING.md`

Common issues and solutions.

---

## Implementation Checklist

Use this checklist when implementing each step:

### Step 1: Data Models
- [ ] Resource schema defined and documented
- [ ] Item schema defined and documented
- [ ] Category summary template created
- [ ] Conflict record schema defined
- [ ] All schemas validated as JSON/Markdown

### Step 2: LLM Prompts
- [ ] Main extraction prompt finalized
- [ ] Category evolution prompt created
- [ ] Edge case prompts defined
- [ ] Response validation schema implemented
- [ ] Fallback handling designed

### Step 3: Core Memory Manager
- [ ] FileSystemLayer implemented and tested
- [ ] MemoryWriter with write path complete
- [ ] MemoryReader with read path complete
- [ ] All file operations atomic and safe

### Step 4: Retrieval System
- [ ] TemporalDecay calculator implemented
- [ ] RelevanceScorer with multi-factor scoring
- [ ] ConflictDetector functional
- [ ] TokenBudgetManager assembles results properly

### Step 5: IPC Interface
- [ ] All IPC channels registered
- [ ] Input validation schemas complete
- [ ] Error handling consistent
- [ ] Response formatting standardized
- [ ] Integration tests passing

### Step 6: Maintenance Tasks
- [ ] Scheduler configured and tested
- [ ] Nightly consolidation working
- [ ] Weekly summarization functional
- [ ] Monthly re-indexing placeholder complete

### Step 7: Renderer UI
- [ ] Status indicator component renders
- [ ] Statistics dashboard displays metrics
- [ ] Conflict resolution UI interactive
- [ ] Manual review interface functional

### Step 8: Integration Testing
- [ ] E2E workflows tested
- [ ] Retrieval accuracy verified
- [ ] Conflict detection working
- [ ] Maintenance tasks validated
- [ ] Performance benchmarks acceptable

### Step 9: Documentation
- [ ] README with installation instructions complete
- [ ] API documentation comprehensive
- [ ] Configuration reference detailed
- [ ] Troubleshooting guide created
