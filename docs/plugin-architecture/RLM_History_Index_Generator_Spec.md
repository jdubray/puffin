# RLM History Index Generator - Implementation Specification

## Story Reference

**Story ID:** `62c23444-ad32-478a-8bfb-bb0186ebbb62`
**Title:** Implement History Index Generator
**Sprint:** RLM History Indexing System

---

## Overview

The History Index Generator is responsible for parsing Puffin's branch/thread history files and producing pre-computed index files that enable efficient RLM-based searches. It extracts semantic markers, generates summaries using the rlm-subcall agent, calculates content hashes for change detection, and supports incremental updates.

---

## Acceptance Criteria Mapping

| AC# | Requirement | Implementation Component |
|-----|-------------|-------------------------|
| 1 | Parse existing history JSON files from .claude/rlm_state/ | `HistoryParser` class |
| 2 | Extract @/ semantic markers with context | `MarkerExtractor` class |
| 3 | Generate summaries using rlm-subcall | `SummaryGenerator` class |
| 4 | Calculate content hashes | `HashCalculator` utility |
| 5 | Support incremental updates | `IncrementalUpdater` class |
| 6 | Output in defined schema format | `IndexSerializer` class |
| 7 | Log processing statistics | `ProcessingStats` class |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    INDEX GENERATION PIPELINE                         │
└─────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
     │   History    │     │   Marker     │     │   Content    │
     │   Parser     │────▶│  Extractor   │────▶│  Segmenter   │
     └──────────────┘     └──────────────┘     └──────────────┘
                                                      │
                                                      ▼
     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
     │    Index     │     │   Summary    │     │    Hash      │
     │  Serializer  │◀────│  Generator   │◀────│  Calculator  │
     └──────────────┘     └──────────────┘     └──────────────┘
           │                     │
           │                     ▼
           │              ┌──────────────┐
           │              │  rlm-subcall │
           │              │    Agent     │
           │              └──────────────┘
           ▼
     ┌──────────────┐
     │  .index.json │
     │    Output    │
     └──────────────┘
```

---

## Component Specifications

### 1. HistoryParser

**File:** `.claude/skills/rlm/lib/history-parser.js`

**Purpose:** Parse `.puffin/history.json` and extract structured prompt/response data.

**API:**

```typescript
interface ParsedPrompt {
  id: string;
  branchId: string;
  parentId: string | null;
  content: string;
  timestamp: number;
  response: {
    content: string;
    sessionId: string;
    cost: number;
    turns: number;
    duration: number;
    timestamp: number;
  } | null;
  children: string[];
  depth: number;  // Computed: distance from conversation root
}

interface ParsedHistory {
  branches: Map<string, ParsedPrompt[]>;
  totalPrompts: number;
  dateRange: { earliest: number; latest: number };
}

class HistoryParser {
  constructor(historyPath: string);

  // Parse entire history file
  async parse(): Promise<ParsedHistory>;

  // Parse single branch for incremental updates
  async parseBranch(branchId: string): Promise<ParsedPrompt[]>;

  // Stream-parse for very large files
  async *streamParse(): AsyncGenerator<ParsedPrompt>;
}
```

**Implementation Notes:**
- Use streaming JSON parser (e.g., `stream-json`) for files > 50MB
- Build prompt tree structure during parsing to compute `depth`
- Handle malformed entries gracefully with error logging

---

### 2. MarkerExtractor

**File:** `.claude/skills/rlm/lib/marker-extractor.js`

**Purpose:** Extract `@/` semantic markers from prompt and response content.

**Marker Syntax Reference:**

```
@/decision: <text>           - Architecture/design decision
@/todo: <text>               - Pending task
@/bug: <text>                - Bug report or fix
@/pattern: <text>            - Design pattern usage
@/api: <text>                - API definition or change
@/breaking: <text>           - Breaking change
@/perf: <text>               - Performance note
@/security: <text>           - Security consideration
@/ref: <text>                - Reference to external resource
```

**API:**

```typescript
interface ExtractedMarker {
  type: string;              // e.g., "decision", "todo", "bug"
  content: string;           // Marker text content
  sourcePromptId: string;    // ID of prompt containing marker
  sourceField: 'prompt' | 'response';
  lineNumber: number;        // Line within source text
  context: {                 // Surrounding text for context
    before: string;          // 2-3 lines before
    after: string;           // 2-3 lines after
  };
}

interface MarkerConfig {
  patterns: Array<{
    type: string;
    regex: RegExp;
    priority: number;        // For importance scoring
  }>;
  contextLines: number;      // Lines of context to capture
}

class MarkerExtractor {
  constructor(config: MarkerConfig);

  // Extract markers from single text
  extract(text: string, sourceInfo: { promptId: string; field: string }): ExtractedMarker[];

  // Extract from all prompts in parsed history
  extractFromHistory(history: ParsedHistory): Map<string, ExtractedMarker[]>;

  // Get default marker configurations from Settings
  static getDefaultConfig(): MarkerConfig;
}
```

**Default Marker Patterns:**

```javascript
const DEFAULT_MARKER_PATTERNS = [
  { type: 'decision', regex: /@\/decision:\s*(.+?)(?:\n|$)/gi, priority: 10 },
  { type: 'breaking', regex: /@\/breaking:\s*(.+?)(?:\n|$)/gi, priority: 10 },
  { type: 'security', regex: /@\/security:\s*(.+?)(?:\n|$)/gi, priority: 9 },
  { type: 'bug',      regex: /@\/bug:\s*(.+?)(?:\n|$)/gi, priority: 8 },
  { type: 'api',      regex: /@\/api:\s*(.+?)(?:\n|$)/gi, priority: 7 },
  { type: 'pattern',  regex: /@\/pattern:\s*(.+?)(?:\n|$)/gi, priority: 6 },
  { type: 'perf',     regex: /@\/perf:\s*(.+?)(?:\n|$)/gi, priority: 5 },
  { type: 'todo',     regex: /@\/todo:\s*(.+?)(?:\n|$)/gi, priority: 4 },
  { type: 'ref',      regex: /@\/ref:\s*(.+?)(?:\n|$)/gi, priority: 3 },
];
```

---

### 3. ContentSegmenter

**File:** `.claude/skills/rlm/lib/content-segmenter.js`

**Purpose:** Divide history into manageable segments for LLM processing.

**API:**

```typescript
interface Segment {
  id: string;
  promptIds: string[];       // Prompts included in this segment
  tokenCount: number;        // Estimated tokens
  startTimestamp: number;
  endTimestamp: number;
  branchId: string;
}

interface SegmentationConfig {
  maxTokensPerSegment: number;  // Default: 50000
  segmentOverlap: number;       // Tokens of overlap for context continuity
  preferNaturalBoundaries: boolean;  // Break at conversation roots
}

class ContentSegmenter {
  constructor(config: SegmentationConfig);

  // Segment parsed history
  segment(history: ParsedHistory): Segment[];

  // Get content for a specific segment
  getSegmentContent(segment: Segment, history: ParsedHistory): string;
}
```

**Segmentation Strategy:**
1. Group prompts by branch
2. Within branch, group by conversation tree (parentId: null as boundary)
3. If conversation exceeds maxTokens, split at turn boundaries
4. Apply overlap for context continuity between segments

---

### 4. SummaryGenerator

**File:** `.claude/skills/rlm/lib/summary-generator.js`

**Purpose:** Generate summaries and importance scores using rlm-subcall agent.

**API:**

```typescript
interface SegmentSummary {
  segmentId: string;
  summary: string;           // 2-3 sentence summary
  topics: string[];          // Extracted topics
  importanceScore: number;   // 0.0 to 1.0
  keyEntities: string[];     // Files, functions, concepts mentioned
}

interface SummaryPromptTemplate {
  summaryPrompt: string;
  topicPrompt: string;
  importancePrompt: string;
}

class SummaryGenerator {
  constructor(promptTemplates: SummaryPromptTemplate);

  // Generate summary for single segment
  async generateSummary(segmentContent: string, segmentId: string): Promise<SegmentSummary>;

  // Batch generate summaries (with parallelization)
  async generateBatch(segments: Array<{ id: string; content: string }>): Promise<SegmentSummary[]>;

  // Update single segment summary (for incremental updates)
  async regenerateSummary(segmentId: string, newContent: string): Promise<SegmentSummary>;
}
```

**Prompt Templates:**

```javascript
const SUMMARY_PROMPT_TEMPLATE = `
Given the following conversation segment from a software development project:

<segment>
{content}
</segment>

Provide a JSON response with:
1. "summary": A 2-3 sentence summary of the main topics and outcomes
2. "topics": Array of 3-7 topic tags (e.g., "authentication", "refactoring", "bug-fix")
3. "keyEntities": Array of specific files, functions, or concepts mentioned
4. "importanceScore": A score from 0.0 to 1.0 based on:
   - 1.0: Critical architectural decisions, security issues, breaking changes
   - 0.7-0.9: Important features, significant bugs, design patterns
   - 0.4-0.6: Standard development work, minor fixes
   - 0.1-0.3: Routine queries, documentation, formatting

Respond ONLY with valid JSON.
`;
```

**rlm-subcall Integration:**

```javascript
// Uses the existing rlm-subcall agent
const subcallAgent = require('../../agents/rlm_subcall');

async function callSubcall(context, query) {
  return await subcallAgent.query({
    context: context,
    query: query,
    maxTokens: 1000
  });
}
```

---

### 5. HashCalculator

**File:** `.claude/skills/rlm/lib/hash-calculator.js`

**Purpose:** Calculate content hashes for change detection and cache invalidation.

**API:**

```typescript
interface ContentHash {
  promptId: string;
  hash: string;              // SHA-256 hash
  lastModified: number;      // Timestamp when hash was calculated
}

class HashCalculator {
  // Calculate hash for single prompt
  static hashPrompt(prompt: ParsedPrompt): string;

  // Calculate hash for segment
  static hashSegment(segment: Segment, history: ParsedHistory): string;

  // Calculate hash for entire branch
  static hashBranch(branchId: string, prompts: ParsedPrompt[]): string;

  // Compare hashes to detect changes
  static detectChanges(
    oldHashes: Map<string, string>,
    newHashes: Map<string, string>
  ): { added: string[]; modified: string[]; removed: string[] };
}
```

**Hash Algorithm:**
- Use SHA-256 for content hashing
- Include prompt ID, content, and response content in hash input
- Normalize whitespace before hashing for stability

---

### 6. IncrementalUpdater

**File:** `.claude/skills/rlm/lib/incremental-updater.js`

**Purpose:** Update index incrementally without full regeneration.

**API:**

```typescript
interface UpdatePlan {
  segmentsToAdd: string[];
  segmentsToUpdate: string[];
  segmentsToRemove: string[];
  estimatedCost: number;     // Estimated LLM calls
}

class IncrementalUpdater {
  constructor(existingIndex: HistoryIndex);

  // Analyze changes and plan update
  planUpdate(currentHistory: ParsedHistory): UpdatePlan;

  // Execute planned updates
  async executeUpdate(plan: UpdatePlan, history: ParsedHistory): Promise<HistoryIndex>;

  // Determine if full reindex is more efficient
  shouldFullReindex(plan: UpdatePlan): boolean;
}
```

**Incremental Update Logic:**
1. Compare prompt hashes between existing index and current history
2. Identify added, modified, and removed prompts
3. Determine affected segments
4. If >50% of segments affected, recommend full reindex
5. Otherwise, regenerate only affected segment summaries

---

### 7. IndexSerializer

**File:** `.claude/skills/rlm/lib/index-serializer.js`

**Purpose:** Serialize index to JSON and write to disk.

**API:**

```typescript
interface HistoryIndex {
  version: string;           // Schema version
  generatedAt: string;       // ISO 8601 timestamp
  historyFile: string;       // Source history file path
  contentHash: string;       // Hash of entire history for quick change detection

  segments: Array<{
    id: string;
    promptIds: string[];
    summary: string;
    topics: string[];
    importanceScore: number;
    keyEntities: string[];
    tokenCount: number;
    hash: string;
  }>;

  markers: Array<{
    type: string;
    content: string;
    promptId: string;
    sourceField: 'prompt' | 'response';
    importance: number;
  }>;

  topicIndex: Record<string, string[]>;  // topic -> segmentIds

  statistics: {
    totalPrompts: number;
    totalSegments: number;
    totalMarkers: number;
    processingTimeMs: number;
    llmCallCount: number;
  };
}

class IndexSerializer {
  // Serialize index to JSON string
  static serialize(index: HistoryIndex): string;

  // Parse index from JSON string
  static deserialize(json: string): HistoryIndex;

  // Write index to file atomically
  static async writeIndex(index: HistoryIndex, outputPath: string): Promise<void>;

  // Read existing index
  static async readIndex(indexPath: string): Promise<HistoryIndex | null>;

  // Validate index against schema
  static validate(index: HistoryIndex): { valid: boolean; errors: string[] };
}
```

---

### 8. ProcessingStats

**File:** `.claude/skills/rlm/lib/processing-stats.js`

**Purpose:** Track and log processing statistics.

**API:**

```typescript
interface ProcessingStatistics {
  startTime: number;
  endTime: number;
  duration: number;

  promptsProcessed: number;
  segmentsGenerated: number;
  markersExtracted: number;

  llmCalls: {
    count: number;
    totalTokens: number;
    estimatedCost: number;
  };

  incrementalStats?: {
    segmentsSkipped: number;
    segmentsUpdated: number;
    segmentsAdded: number;
  };

  errors: Array<{
    phase: string;
    message: string;
    promptId?: string;
  }>;
}

class ProcessingStats {
  constructor();

  // Record events
  recordPromptProcessed(): void;
  recordSegmentGenerated(): void;
  recordMarkerExtracted(type: string): void;
  recordLLMCall(tokens: number): void;
  recordError(phase: string, error: Error, promptId?: string): void;

  // Finalize and get statistics
  finalize(): ProcessingStatistics;

  // Log summary to console/file
  logSummary(logger: Logger): void;
}
```

**Log Output Format:**

```
[RLM Index Generator] Processing Complete
─────────────────────────────────────────
  Duration:           45.2s
  Prompts Processed:  1,234
  Segments Generated: 48
  Markers Extracted:  156
    - decision: 23
    - bug: 45
    - todo: 67
    - other: 21

  LLM Calls:          52
  Estimated Cost:     $0.42

  Incremental Stats:
    - Skipped:  35 segments (unchanged)
    - Updated:  8 segments
    - Added:    5 segments

  Errors: 0
─────────────────────────────────────────
```

---

## Main Entry Point

**File:** `.claude/skills/rlm/lib/index-generator.js`

```typescript
interface GeneratorOptions {
  historyPath: string;
  outputPath: string;
  incremental: boolean;
  existingIndexPath?: string;
  markerConfig?: MarkerConfig;
  segmentConfig?: SegmentationConfig;
  logger?: Logger;
}

class IndexGenerator {
  constructor(options: GeneratorOptions);

  // Run full generation pipeline
  async generate(): Promise<{
    index: HistoryIndex;
    stats: ProcessingStatistics;
  }>;

  // Run with progress callback
  async generateWithProgress(
    onProgress: (phase: string, progress: number) => void
  ): Promise<{ index: HistoryIndex; stats: ProcessingStatistics }>;
}

// CLI entry point
async function main() {
  const options = parseCliArgs();
  const generator = new IndexGenerator(options);
  const { index, stats } = await generator.generate();
  stats.logSummary(console);
}
```

---

## File Structure

```
.claude/skills/rlm/
├── lib/
│   ├── index-generator.js      # Main entry point
│   ├── history-parser.js       # Parse history.json
│   ├── marker-extractor.js     # Extract @/ markers
│   ├── content-segmenter.js    # Divide into segments
│   ├── summary-generator.js    # LLM-based summarization
│   ├── hash-calculator.js      # Content hashing
│   ├── incremental-updater.js  # Incremental update logic
│   ├── index-serializer.js     # JSON serialization
│   └── processing-stats.js     # Statistics tracking
├── schemas/
│   ├── history-index.schema.json   # JSON Schema
│   └── marker-config.schema.json   # Marker config schema
├── config/
│   └── default-markers.json    # Default marker patterns
└── tests/
    ├── history-parser.test.js
    ├── marker-extractor.test.js
    ├── content-segmenter.test.js
    ├── summary-generator.test.js
    ├── integration.test.js
    └── fixtures/
        └── sample-history.json
```

---

## JSON Schema

**File:** `.claude/skills/rlm/schemas/history-index.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://puffin.dev/schemas/history-index.schema.json",
  "title": "RLM History Index",
  "description": "Pre-computed index for efficient RLM-based history searches",
  "type": "object",
  "required": ["version", "generatedAt", "historyFile", "contentHash", "segments", "markers", "topicIndex", "statistics"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$",
      "description": "Schema version (semver)"
    },
    "generatedAt": {
      "type": "string",
      "format": "date-time",
      "description": "Index generation timestamp"
    },
    "historyFile": {
      "type": "string",
      "description": "Path to source history file"
    },
    "contentHash": {
      "type": "string",
      "description": "SHA-256 hash of history content for change detection"
    },
    "segments": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "promptIds", "summary", "topics", "importanceScore", "tokenCount", "hash"],
        "properties": {
          "id": { "type": "string" },
          "promptIds": { "type": "array", "items": { "type": "string" } },
          "summary": { "type": "string", "maxLength": 1000 },
          "topics": { "type": "array", "items": { "type": "string" } },
          "importanceScore": { "type": "number", "minimum": 0, "maximum": 1 },
          "keyEntities": { "type": "array", "items": { "type": "string" } },
          "tokenCount": { "type": "integer", "minimum": 0 },
          "hash": { "type": "string" }
        }
      }
    },
    "markers": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "content", "promptId", "sourceField"],
        "properties": {
          "type": { "type": "string" },
          "content": { "type": "string" },
          "promptId": { "type": "string" },
          "sourceField": { "enum": ["prompt", "response"] },
          "importance": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    },
    "topicIndex": {
      "type": "object",
      "additionalProperties": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "statistics": {
      "type": "object",
      "required": ["totalPrompts", "totalSegments", "totalMarkers", "processingTimeMs", "llmCallCount"],
      "properties": {
        "totalPrompts": { "type": "integer", "minimum": 0 },
        "totalSegments": { "type": "integer", "minimum": 0 },
        "totalMarkers": { "type": "integer", "minimum": 0 },
        "processingTimeMs": { "type": "integer", "minimum": 0 },
        "llmCallCount": { "type": "integer", "minimum": 0 }
      }
    }
  }
}
```

---

## Error Handling

| Error Scenario | Handling Strategy |
|----------------|-------------------|
| History file not found | Log warning, return empty index |
| Malformed JSON in history | Skip malformed entries, continue processing |
| LLM call failure | Retry up to 3 times with exponential backoff |
| LLM returns invalid JSON | Use fallback extraction (regex-based) |
| Disk write failure | Write to temp file, log error, don't corrupt existing index |
| Process-level lock conflict | Wait up to 30s, then fail with descriptive error |

---

## Performance Considerations

1. **Parallel LLM Calls:** Process up to 4 segments in parallel
2. **Streaming Parser:** Use for history files > 50MB
3. **Incremental Updates:** Skip unchanged segments based on hash
4. **Caching:** Cache LLM responses for repeated content patterns
5. **Memory Management:** Process segments in batches to limit memory usage

---

## Testing Strategy

| Test Type | Coverage |
|-----------|----------|
| Unit Tests | Each component class |
| Integration Tests | Full pipeline with sample history |
| Performance Tests | Large history files (100K+ prompts) |
| Regression Tests | Index schema compatibility |

---

## Acceptance Criteria Verification

| AC# | Verification Method |
|-----|---------------------|
| 1 | Unit test: HistoryParser correctly parses sample-history.json |
| 2 | Unit test: MarkerExtractor extracts all @/ patterns with context |
| 3 | Integration test: SummaryGenerator produces valid summaries via rlm-subcall |
| 4 | Unit test: HashCalculator produces consistent hashes, detects changes |
| 5 | Integration test: IncrementalUpdater correctly updates partial index |
| 6 | Unit test: IndexSerializer output validates against JSON Schema |
| 7 | Integration test: ProcessingStats logs all expected statistics |

---

## Implementation Sequence

1. **HistoryParser** - Foundation for all other components
2. **HashCalculator** - Needed for change detection
3. **MarkerExtractor** - Independent of LLM components
4. **ContentSegmenter** - Required before summarization
5. **SummaryGenerator** - Depends on segmenter
6. **IncrementalUpdater** - Depends on hash and summary components
7. **IndexSerializer** - Final assembly
8. **ProcessingStats** - Cross-cutting, can be added incrementally
9. **IndexGenerator** - Main orchestrator, ties everything together
