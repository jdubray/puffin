# Memory Plugin Design Specification

**Version:** 0.1.0 (Draft)  
**Status:** Ready for Implementation  
**Plugin Name:** `memory-plugin`

/@puffin: make sure all the answers we discussed have been integrated in the specification @/

## 1. Overview

### 1.1 Purpose

The Memory Plugin is a Puffin plugin that automatically processes branch threads at regular intervals to extract, categorize, and memorize key decisions made during development sessions. It transforms ephemeral conversation history into structured, persistent knowledge that can be retrieved and used to provide context in future sessions.

### 1.2 Problem Statement

Development conversations in Puffin generate valuable knowledge:
- Architectural decisions and their rationale
- Bug fixes and root cause analyses
- Feature implementation approaches
- User preferences and project conventions

Without a memory system, this knowledge is lost when conversations end, leading to:
- Repeated discussions of the same topics
- Inconsistent decision-making
- Loss of institutional knowledge about the project

### 1.3 Goals

1. **Automatic Extraction**: Process branch threads without manual intervention
2. **Decision Focus**: Identify and prioritize key decisions over routine exchanges
3. **Structured Storage**: Organize memories in a hierarchical, queryable format
4. **Intelligent Retrieval**: Surface relevant memories based on current context
5. **Memory Maintenance**: Implement decay and consolidation to prevent knowledge rot

---

## 2. Architecture

### 2.1 Memory Architecture Model

Following the principles from the Memory Architecture reference, this plugin implements a **File-Based Memory** system with two layers:

> **Design Rationale: Memory Scope for Central Reasoning Engine**
> 
> The Memory Plugin serves a "central reasoning engine" that maintains the Code Model of the solution. Therefore, memory domain knowledge should only include concerns that need to be known and enforced **across the entire solution**, not at the feature or story level.
> 
> **In Scope for Domain Knowledge:**
> - Architectural decisions affecting multiple components
> - Cross-cutting concerns (error handling, state management patterns)
> - Technical constraints that apply solution-wide
> - Code style and conventions enforced everywhere
> - Critical bug patterns and their solutions
> - Key design assumptions and trade-offs
> 
> **Out of Scope (Feature/Story Level):**
> - Business rules specific to individual features
> - Feature-specific implementation details
> - Story-level context and requirements
> - User story acceptance criteria
> 
> This separation ensures the memory system provides essential context for any agent working on the codebase, without drowning in feature-specific minutiae.

#### Layer 1: Branch Threads (Raw Data - Source of Truth)
- Branch threads in Puffin are already immutable and timestamped
- These serve as the source of truth for all memory extraction
- No separate resource layer needed—extraction operates directly on existing branch conversations

#### Layer 2: Items & Branch Memory (Atomic Facts and Summaries)
- Discrete, extracted facts from branch conversations
- Examples: "User prefers async/await over promises", "Architecture decision: Use event-driven pattern"
- Extracted automatically via LLM from raw branch conversations
- Each branch has its own memory file: `~/.puffin/memory/branches/{branch}.md`
- Format: Markdown file containing extracted items and evolving summary, updated via LLM-driven synthesis
- Handles conflicts by overwriting outdated facts and maintaining narrative coherence


### 2.2 Write Path: Active Memorization

When processing a branch thread:

0. A thread should be processed once the developer "creates a new thread", the memorization process should run in the background
1. **Extraction**: Use LLM to extract atomic facts from the branch thread conversation
   - Prompt focuses on decisions, preferences, architectural choices
   - Returns structured JSON with extracted items
   - Structure: `{ "coding_preferences": [...], "architectural_decisions": [...], "bug_fixes": [...],... }`
2. **Branch Memory Evolution**: Load existing branch memory file, integrate new items via LLM
   - LLM rewrites summary to incorporate new information
   - Handles conflicts by overwriting outdated facts
   - Maintains narrative coherence and context
3. **Metadata**: Track extraction timestamp, confidence scores, and access counts

**Example Extraction Prompt:**
Given a branch thread conversation, identify and extract:
- **User Preferences**: Coding style, library choices, patterns favored
- **Architectural Decisions**: Design patterns adopted, trade-offs accepted
- **Project Conventions**: Naming conventions, file organization, tooling preferences
- **Bug Patterns**: Recurring issues and their fixes
- **Feature Implementation Notes**: Approaches tried, lessons learned

Return as JSON:
```json
{
  "coding_preferences": [
    {
      "content": "User prefers async/await pattern",
      "confidence": 0.95,
      "context": "Mentioned in discussion about Promise handling"
    }
  ],
  "architectural_decisions": [
    {
      "content": "Adopt event-driven pattern for state management",
      "rationale": "Decouples components and improves testability",
      "trade_offs": "Requires careful event sequencing to prevent race conditions",
      "confidence": 0.90
    }
  ],
  "project_conventions": [
    {
      "content": "Use camelCase for variable names",
      "scope": "JavaScript files",
      "confidence": 0.95
    }
  ],
  "bug_patterns": [
    {
      "pattern": "Race conditions in async state updates",
      "fix": "Use explicit locking mechanisms",
      "occurrences": 2,
      "confidence": 0.85
    }
  ],
  "implementation_notes": [
    {
      "topic": "Component refactoring",
      "approach": "Use composition over inheritance",
      "lessons_learned": "Reduces coupling and improves reusability",
      "confidence": 0.88
    }
  ]
}
```

### 2.3 Read Path: Intelligent Retrieval

The memory system uses tiered retrieval to minimize token consumption while providing relevant context:

1. **Query Synthesis**: Transform user query into a search-optimized form
   - Filter out noise and convert to semantic keywords
   - Identify query intent (asking for a decision, preference, or pattern)

2. **Branch Selection**: Use LLM to identify relevant branch memory files
   - Load branch memory files likely to contain answers
   - Skip branches that don't match query intent

3. **Sufficiency Check**: Determine if branch memory summaries are enough
   - If summaries answer the query comprehensively → Return them
   - If insufficient or ambiguous → Proceed to more detailed search within branch memories
   - Perform explicit content-based assessment rather than assuming coverage

5. **Conflict Detection and Resolution**: Address contradictions across memory sources
   - Identify similar memories from different sources that contradict each other
   - Highlight conflicting entries with source information and extraction timestamps
   - Present conflicts to user for manual resolution when confidence is split
   - Flag outdated memories that conflict with newer, higher-confidence facts

6. **Relevance Filtering**: Apply multi-factor scoring with flexible thresholds
   - Rank results by recency, relevance, and access frequency
   - Apply adaptive relevance thresholds based on task context (default: 0.7, adjustable 0.5–0.9)
   - Prioritize frequently-accessed memories that remain valid
   - Support domain-specific threshold customization for different memory categories

7. **Temporal Constraints**: Validate facts against temporal validity windows
   - Identify and flag memories with explicit expiration dates
   - Invalidate outdated facts superseded by newer information
   - Support validity windows (e.g., "valid until Dec 2025") for time-sensitive facts
   - Exclude memories outside their valid temporal range from results

8. **Context Assembly**: Select memories that fit within token budget
   - Sort by final score (relevance × time decay × confidence)
   - Pack top-scoring memories until token limit reached
   - Include timestamp, confidence, and validity window metadata
   - Ensure conflict information is surfaced when relevant

**Temporal Decay:**
Since this is a development tool for developers, there is no time-based temporal decay. Facts are valid indefinitely until explicitly superseded by newer information.


### 2.4 Memory Maintenance

To prevent knowledge rot and maintain system health, the plugin implements scheduled maintenance tasks:

#### Thread Processing
- Review conversations from the last known thread (before the user pressed the create new thread button, or created a new sprint)
- Identify and merge redundant or contradictory memories
- Promote frequently-accessed items to higher priority
- Remove low-confidence duplicates

#### Weekly Maintenance (When the developer opens Puffin, check if at least one week has elapsed since last consolidation)
- Consolidate and refactor branch memory files for clarity
- Identify infrequently-accessed items and assess their continued relevance
- Merge redundant or superseded memories
- Update branch summaries based on consolidated items

#### Future Enhancement: Advanced Memory Evolution (Out of Scope for v1)

The following sophisticated memory evolution mechanisms are planned for future releases:

**Updating Enhancements:**
- **Conflict resolution strategy**: Explicit handling when new information contradicts existing memories
- **Temporal validity windows**: Support time-bounded facts with explicit expiration

**Forgetting Enhancements:**
- **Frequency-based forgetting**: LRU-style pruning for rarely accessed memories
- **Importance-driven forgetting**: Consider semantic value, not just recency
- **Soft forgetting**: Gradual decay weights rather than hard deletion

---

## 3. Plugin Implementation

### 3.1 Plugin Structure

```
plugins/memory-plugin/
├── main.js                 # Main process initialization and IPC handlers
├── renderer.js             # Renderer process UI integration
├── config/
│   └── default-config.json # Default configuration
├── lib/
│   ├── memory-manager.js   # Core memory operations
│   ├── llm-extractor.js    # LLM-based extraction logic
│   ├── retriever.js        # Tiered retrieval system
│   └── maintenance.js      # Scheduled maintenance tasks
└── README.md               # Plugin documentation
```

### 3.2 Main Process (`main.js`)

The main process plugin:
- Initializes the memory storage system
- Registers IPC handlers for memory operations
- Schedules maintenance tasks (cron jobs)
- Manages file system access to memory directories

**Key Responsibilities:**
- Create memory directories on first run
- Load configuration from `config/default-config.json`
- Set up scheduled tasks (nightly, weekly, monthly)
- Handle all file I/O operations
- Validate IPC inputs before processing

### 3.3 Renderer Process (`renderer.js`)

The renderer process plugin:
- Provides UI indicators for memory system status
- Displays memory statistics (total items, categories, last update)
- Allows manual memory review and editing
- Shows retrieval confidence scores in tooltips
- Implements conflict visualization highlighting contradictory memories for user resolution
  - Displays side-by-side comparison of conflicting facts with source, timestamp, and confidence metadata
  - Provides user interface for manual conflict resolution (accept newer, keep both, mark as resolved)
  - Color-codes conflicting entries to improve visual discoverability
  
### 3.4 Configuration

**File:** `plugins/memory-plugin/config/default-config.json`

```json
{
  "enabled": true,
  "storage": {
    "basePath": "~/.puffin/memory/branches",
    "branchMemoryTemplate": "{branchId}.md"
  },
  "extraction": {
    "enabled": true,
    "minConfidence": 0.75,
    "categories": [
      "coding_preferences",
      "architectural_decisions",
      "project_conventions",
      "bug_patterns",
      "implementation_notes"
    ]
  },
  "retrieval": {
    "maxTokens": 2000,
    "relevanceThreshold": 0.7,
  },
  "maintenance": {
    "nightly": {
      "enabled": true,
      "schedule": "0 3 * * *",
      "description": "Daily consolidation"
    },
    "weekly": {
      "enabled": true,
      "schedule": "0 2 * * 1",
      "description": "Weekly summarization"
    },
    "monthly": {
      "enabled": true,
      "schedule": "0 1 1 * *",
      "description": "Monthly re-indexing"
    }
  }
}
```

---

## 4. API Specification

### 4.1 IPC Channels

All IPC channels are prefixed with `memory:` to maintain plugin namespace isolation.

#### Memory Operations

**`memory:memorize`**
- Direction: Renderer → Main
- Request: `{ conversationText: string, branchId: string, sessionId: string }`
- Response: `{ resourceId: string, itemsExtracted: number, categoriesUpdated: string[] }`
- Purpose: Trigger memory extraction from a conversation

**`memory:retrieve`**
- Direction: Renderer → Main
- Request: `{ query: string, maxResults?: number }`
- Response: `{ memories: Memory[], totalTokens: number, retrievalTime: number }`
- Purpose: Retrieve relevant memories for a query

**`memory:get-branch-memory`**
- Direction: Renderer → Main
- Request: `{ branch: string }`
- Response: `{ branch: string, content: string, lastUpdated: string, itemCount: number }`
- Purpose: Load a specific branch's memory file

#### Statistics and Monitoring

**`memory:get-stats`**
- Direction: Renderer → Main
- Request: `{}`
- Response: `{ totalItems: number, totalCategories: number, totalResources: number, lastMemorized: string, nextMaintenance: string }`
- Purpose: Get system-wide memory statistics

**`memory:get-status`**
- Direction: Renderer → Main
- Request: `{}`
- Response: `{ status: 'ready'|'processing'|'error', lastError?: string, maintenanceInProgress: boolean }`
- Purpose: Check plugin health and operational status

#### Administrative

**`memory:clear-branch-memory`**
- Direction: Renderer → Main
- Request: `{ branch: string }`
- Response: `{ success: boolean, itemsDeleted: number }`
- Purpose: Clear all memories in a branch (careful operation)

**`memory:run-maintenance`**
- Direction: Renderer → Main
- Request: `{ type: 'nightly'|'weekly'|'monthly'|'full' }`
- Response: `{ success: boolean, duration: number, results: object }`
- Purpose: Manually trigger maintenance tasks

### 4.2 Memory Object Structure

```typescript
interface Memory {
  id: string;                    // Unique memory identifier
  category: string;              // Category classification
  content: string;               // Memory text
  sourceResourceId: string;      // Link to original resource
  extractedAt: string;           // ISO timestamp of extraction
  lastAccessed: string;          // ISO timestamp of last retrieval
  accessCount: number;           // Number of times retrieved
  confidence: number;            // Confidence score 0.0-1.0
  metadata: {
    branchId?: string;
    sessionId?: string;
    tags?: string[];
  };
}
```

### 4.3 Error Handling

All IPC handlers return structured error responses:

```typescript
interface ErrorResponse {
  error: true;
  code: string;                  // Error code: EXTRACTION_FAILED, RETRIEVAL_FAILED, etc.
  message: string;               // Human-readable error description
  context?: any;                 // Additional debugging context
}
```

---

## 5. Integration with Puffin

### 5.1 Branch Thread Processing

When a branch completes or at regular intervals:
1. Memory plugin receives branch thread conversation
2. Extracts and stores memories automatically
3. Updates category summaries
4. Makes memories available for future retrieval

### 5.2 Context Injection for Claude Code

When Claude Code initializes for a new task:
1. Current context (user message, branch) triggers memory retrieval
2. Relevant memories are injected into system prompt
3. Claude has access to historical decisions and conventions
4. Improves consistency and reduces repeated discussions

### 5.3 UI Integration

The memory plugin renders:
- Status indicator showing memory system health
- Quick access to category summaries
- Search interface for manual memory lookup
- Statistics dashboard (memory growth, access patterns)



---

**Document Status:** Ready for Detailed Design

---

## Appendix A: Implementation Readiness Checklist

- [x] Three-layer architecture defined (Resources, Items, Categories)
- [x] Write path with LLM extraction specified
- [x] Read path with tiered retrieval defined
- [x] Conflict detection and resolution mechanisms included
- [x] Temporal decay formula provided
- [x] Plugin structure outlined
- [x] IPC API channels specified
- [x] Configuration schema documented
- [x] Error handling patterns defined
- [x] Maintenance schedules specified
- [x] Detailed design steps documented

---

## Appendix B: Detailed Design Steps

The following steps outline the recommended approach for moving from this specification to detailed design and implementation.

### Step 1: Define Data Models and Schemas

1. **Branch Memory Format**: Define the markdown structure for branch-specific memory files
   - Required fields: `branchId`, `lastUpdated`, `extractedItems`
   - Sections: metadata, coding preferences, architectural decisions, bug patterns, implementation notes
   - Support for versioning and extraction history

### Step 2: Design the LLM Extraction Prompts

1. Create the extraction prompt template based on Section 2.2
2. Define the expected JSON response schema with validation rules
3. Design fallback prompts for handling edge cases (empty conversations, unclear content)
4. Create the category evolution prompt for integrating new items into existing summaries

### Step 3: Implement Core Memory Manager

1. **File System Layer**
   - Directory creation and management for branch memory files
   - Atomic file write operations
   - File locking for concurrent access

2. **Write Path Implementation**
   - Extract facts from branch thread conversations
   - Update branch-specific memory file with new items
   - Branch memory evolution logic via LLM

3. **Read Path Implementation**
   - Query synthesis function
   - Branch selection via LLM
   - Sufficiency checking logic
   - Load and parse branch memory files

### Step 4: Implement Retrieval System

1. **Temporal Decay Calculator**: Implement the decay formula from Section 2.3
2. **Relevance Scoring**: Design the multi-factor scoring algorithm
3. **Conflict Detection**: Implement logic to identify contradictory memories
4. **Token Budget Manager**: Context assembly with size limits

### Step 5: Design IPC Interface

1. Map each IPC channel to its handler function
2. Define input validation schemas for each channel
3. Implement error handling and response formatting
4. Create integration tests for each IPC endpoint

### Step 6: Implement Maintenance Tasks

1. **Scheduler Setup**: Configure cron-style scheduling for maintenance
2. **Nightly Consolidation**: Implement redundancy detection and merging
3. **Weekly Summarization**: Implement compression and archival logic
4. **Monthly Re-indexing**: Placeholder for future embedding support

### Step 7: Build Renderer UI Components

1. **Status Indicator**: Memory system health display
2. **Statistics Dashboard**: Memory metrics visualization
3. **Conflict Resolution UI**: Side-by-side comparison interface
4. **Manual Review Interface**: Memory browsing and editing

### Step 8: Integration Testing

1. End-to-end tests for memorization workflow
2. Retrieval accuracy tests with sample queries
3. Conflict detection and resolution tests
4. Maintenance task verification
5. Performance benchmarks for large memory stores

### Step 9: Documentation

1. Plugin README with installation instructions
2. API documentation for IPC channels
3. Configuration reference guide
4. Troubleshooting guide