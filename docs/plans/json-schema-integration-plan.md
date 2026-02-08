# JSON Schema Integration Plan for Puffin

## Problem Statement

Puffin currently uses **fragile, multi-strategy JSON extraction** to parse structured data from Claude CLI responses. There are **6 distinct code paths** that spawn CLI processes expecting JSON output, each implementing their own extraction heuristics:

1. **extractStoriesFromResponse** — 4-strategy cascade (bracket matching, full parse, code block regex, simple regex)
2. **generateSprintAssertions** — code block regex → raw `{ }` match → `JSON.parse`
3. **CRE ai-client.parseJsonResponse** — 3-strategy cascade (direct parse, code fence extraction, brace extraction)
4. **deriveStories** — uses `extractStoriesFromResponse` after streaming text accumulation
5. **modifyStories** — uses `extractStoriesFromResponse` after streaming text accumulation
6. **generateTitle** — plain text extraction (no JSON, but still fragile)

**The `--json-schema` CLI flag** instructs Claude to validate its response against a JSON Schema before returning it. If the output doesn't match the schema, Claude retries automatically. This eliminates all extraction heuristics.

---

## Current JSON Extraction Audit

### Path 1: `extractStoriesFromResponse()` (claude-service.js:960-1034)

**Used by:** `deriveStories()`, `modifyStories()`
**Spawn method:** Direct `spawn('claude', ...)` with `--print --output-format stream-json`
**Extraction logic:**
```
Strategy 1: findJsonArray() — custom bracket-matching parser
Strategy 2: JSON.parse(entire response)
Strategy 3: Regex for ```json code blocks
Strategy 4: Regex for first [...] pattern
```
**Failure mode:** Returns `{ success: false, error: '...' }` if all 4 strategies fail.
**Also checks:** 6 clarification regex patterns to detect non-JSON responses.

**Assessment:** This is the most brittle path. The 4-strategy cascade exists because Claude sometimes wraps JSON in markdown, sometimes doesn't. `--json-schema` eliminates this entirely.

---

### Path 2: `generateSprintAssertions()` (claude-service.js:1910-2090)

**Used by:** Non-CRE assertion generation (backlog → generate assertions)
**Spawn method:** Direct `spawn('claude', ...)` with `--print --output-format stream-json --max-turns 40`
**Extraction logic:**
```
1. Accumulate resultText from streaming chunks
2. Try regex for ```json code blocks
3. Fallback: regex for first { ... } pattern
4. JSON.parse the result
5. Validate: must be object (not array)
6. Count assertions per story ID key
```
**Expected shape:** `{ [storyId]: [ { type, target, message, ... }, ... ] }`

**Assessment:** High-value migration target. The 40-turn allowance means Claude could respond with tool-use JSON mixed with the final assertion JSON, making extraction especially fragile.

---

### Path 3: CRE `sendCrePrompt()` via `ai-client.js:parseJsonResponse()` (ai-client.js:46-80)

**Used by:** `plan-generator.js` (3 calls), `assertion-generator.js` (1 call), `ris-generator.js` (1 call)
**Spawn method:** Delegates to `claudeService.sendPrompt()` → `spawn('claude', ...)` with `--print --output-format stream-json --max-turns 1`
**Extraction logic:**
```
1. Direct JSON.parse of trimmed text
2. Extract from ```json code fences
3. Extract first top-level { ... } block (using indexOf/lastIndexOf — greedy, not balanced)
```
**Expected shapes vary by caller:**
- **analyzeAmbiguities:** `{ questions: [...] }`
- **generatePlan:** `{ planItems: [...], sharedComponents: [...], risks: [...] }`
- **refinePlan:** `{ planItems: [...], sharedComponents: [...], risks: [...] }`
- **generateAssertions:** `{ assertions: [...] }`
- **generateRIS:** (markdown output, not JSON — uses `sendCrePrompt` but ignores parse result)

**Assessment:** The central choke point. 5 callers all route through `sendCrePrompt()` → `parseJsonResponse()`. Migrating `sendPrompt()` to support `--json-schema` fixes all 5 at once.

---

### Path 4: `generateTitle()` (claude-service.js:1524-1550)

**Used by:** Title generation for threads/sprints
**Spawn method:** Direct `spawn('claude', ...)` with `--print --max-turns 1 --model haiku`
**Extraction:** Raw stdout text (no JSON parsing). Just takes the text output directly.

**Assessment:** Does NOT need `--json-schema` — it's plain text output. However, could optionally use a schema like `{ "title": "string" }` for consistency, preventing Claude from adding explanatory text around the title.

---

### Path 5: `deriveStories()` (claude-service.js:1200-1420)

**Used by:** "Derive User Stories" checkbox on prompt submit
**Spawn method:** Direct `spawn('claude', ...)` with `--print --output-format stream-json --max-turns 1`
**Extraction:** Accumulates streaming text, then calls `extractStoriesFromResponse()` (Path 1).

**Assessment:** Covered by fixing Path 1. But could independently benefit from `--json-schema` since it would guarantee the array structure.

---

### Path 6: `modifyStories()` (claude-service.js:1420+)

**Used by:** Story modification after user review
**Spawn method:** Similar to `deriveStories()`
**Extraction:** Uses `extractStoriesFromResponse()` (Path 1).

**Assessment:** Same as Path 5 — covered by fixing Path 1.

---

## How `--json-schema` Works

The `--json-schema` CLI flag:
1. Takes a JSON Schema string as its argument
2. Internally registers the schema as a **custom tool** named `StructuredOutput` with the Anthropic API
3. Claude emits a `tool_use` content block calling `StructuredOutput` with the structured data as its `input`
4. The CLI processes the tool result cycle internally
5. **Only works with `--print` mode** (non-interactive)
6. **Requires `--max-turns >= 2`** — the StructuredOutput tool-use consumes a turn (see below)

### StructuredOutput Tool-Use Pattern (validated 2026-02-05)

When `--json-schema` is used, the **response is NOT plain text**. Instead, the message flow is:

```
1. assistant message  → text block (preamble noise, e.g. "I'll use StructuredOutput...")
                      → tool_use block { name: "StructuredOutput", input: { ...your data... } }
2. user message       → tool_result (auto-generated by CLI)
3. result message     → session completion
```

The structured data lives in the `tool_use` content block:
```json
{
  "type": "assistant",
  "message": {
    "content": [
      {
        "type": "text",
        "text": "I need to use the StructuredOutput tool to return..."
      },
      {
        "type": "tool_use",
        "id": "toolu_01CQDWVWXo68QYZc5LGo5pLH",
        "name": "StructuredOutput",
        "input": {
          "colors": [{"name": "blue"}, {"name": "orange"}]
        }
      }
    ]
  }
}
```

**Key extraction insight:** Current Puffin code looks for `json.type === 'result' && json.result` or accumulates text content blocks. Neither captures the structured data. The extraction code must:
1. Look for `assistant` message content blocks where `type === "tool_use"` and `name === "StructuredOutput"`
2. Read the `input` field — this is the schema-validated JSON data
3. Ignore `text` content blocks (preamble noise)

### `--max-turns` Requirement

**CRITICAL:** `--max-turns` must be **>= 2** when using `--json-schema`.

The StructuredOutput tool-use cycle consumes turns:
- Turn 1: Claude generates the `tool_use` block
- Turn 2: CLI auto-submits the `tool_result`, Claude acknowledges

With `--max-turns 1`, the CLI terminates after the tool_use with `"subtype": "error_max_turns"` and **no `.result` field** in the result message. The data is still present in the `tool_use` content block of the assistant message, but the session ends in an error state.

**Impact on Puffin:**
- `sendPrompt()` currently defaults to `maxTurns: 1` for CRE callers
- `deriveStories()` uses `maxTurns: 1`
- These MUST be changed to `maxTurns: 2` (or higher) when `--json-schema` is active

### Root-Level Object Constraint

**CRITICAL CONSTRAINT (validated 2026-02-05):** The root-level `type` of the schema **must be `"object"`**. The Anthropic API requires `input_schema.type` to be `"object"` for tool definitions. Schemas with root-level `"type": "array"` or `"type": "string"` will be rejected with:
```
API Error: 400 {"type":"error","error":{"type":"invalid_request_error",
"message":"tools.17.custom.input_schema.type: Input should be 'object'"}}
```

**Workaround:** Wrap any non-object root types in an object envelope:
```json
// INVALID — root is array:
{ "type": "array", "items": { ... } }

// VALID — array wrapped in object:
{ "type": "object", "required": ["items"], "properties": { "items": { "type": "array", ... } } }
```

### Streaming Compatibility (validated 2026-02-05)

`--json-schema` works with `--output-format stream-json`. The streaming transport envelopes (`{"type":"system",...}`, `{"type":"assistant",...}`) emit normally. The `tool_use` content block appears inside the standard assistant message envelope.

This means:
- The streaming accumulation loop must be updated to detect `tool_use` blocks, not just `text` blocks
- Claude may emit preamble text before the `tool_use` — this text should be ignored
- The `result` message does **NOT** contain the structured data in its `.result` field — data is only in the `tool_use.input`
- **All schemas must have `"type": "object"` at root** — arrays must be wrapped
- **`maxTurns` must be >= 2** for schema calls to complete without error

---

## Proposed JSON Schemas

### Schema 1: User Stories Array

**Used by:** `deriveStories()`, `modifyStories()`

> **Note:** Root type must be `"object"` (API constraint). The array is wrapped in a `stories` property. Callers must unwrap: `response.stories` instead of `response` directly.

```json
{
  "type": "object",
  "required": ["stories"],
  "properties": {
    "stories": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["title", "description", "acceptanceCriteria"],
        "properties": {
          "title": {
            "type": "string",
            "description": "Brief descriptive title for the user story"
          },
          "description": {
            "type": "string",
            "description": "User story in format: As a [role], I want [feature] so that [benefit]"
          },
          "acceptanceCriteria": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1,
            "description": "Testable conditions for story completion"
          }
        },
        "additionalProperties": false
      },
      "minItems": 1
    }
  },
  "additionalProperties": false
}
```

---

### Schema 2: Sprint Assertions Map

**Used by:** `generateSprintAssertions()` (non-CRE path)

```json
{
  "type": "object",
  "description": "Map of story IDs to assertion arrays",
  "additionalProperties": {
    "type": "array",
    "items": {
      "type": "object",
      "required": ["type", "target", "message"],
      "properties": {
        "type": {
          "type": "string",
          "enum": ["FILE_EXISTS", "FILE_CONTAINS", "FUNCTION_SIGNATURE", "EXPORT_EXISTS", "IMPORT_EXISTS", "PATTERN_MATCH", "CLASS_STRUCTURE", "JSON_PROPERTY", "IPC_HANDLER_REGISTERED", "CSS_SELECTOR_EXISTS"]
        },
        "target": {
          "type": "string",
          "description": "File path or code element being asserted"
        },
        "message": {
          "type": "string",
          "description": "Human-readable description of what is being verified"
        },
        "expected": {
          "type": "string",
          "description": "Expected value or pattern"
        },
        "property": {
          "type": "string",
          "description": "Property path for JSON_PROPERTY assertions"
        },
        "selector": {
          "type": "string",
          "description": "CSS selector for CSS_SELECTOR_EXISTS assertions"
        }
      },
      "additionalProperties": false
    }
  }
}
```

---

### Schema 3: CRE Ambiguity Analysis

**Used by:** `plan-generator.js → analyzeSprint()`

```json
{
  "type": "object",
  "required": ["questions"],
  "properties": {
    "questions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["question", "context", "impact"],
        "properties": {
          "question": { "type": "string" },
          "context": { "type": "string" },
          "impact": {
            "type": "string",
            "enum": ["low", "medium", "high"]
          }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

---

### Schema 4: CRE Plan Generation

**Used by:** `plan-generator.js → generatePlan()`, `refinePlan()`

```json
{
  "type": "object",
  "required": ["planItems"],
  "properties": {
    "planItems": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["storyId", "title", "approach"],
        "properties": {
          "storyId": { "type": "string" },
          "title": { "type": "string" },
          "approach": { "type": "string" },
          "filesCreated": {
            "type": "array",
            "items": { "type": "string" }
          },
          "filesModified": {
            "type": "array",
            "items": { "type": "string" }
          },
          "dependencies": {
            "type": "array",
            "items": { "type": "string" }
          },
          "complexity": {
            "type": "string",
            "enum": ["low", "medium", "high"]
          },
          "order": { "type": "integer" }
        },
        "additionalProperties": false
      }
    },
    "sharedComponents": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "description": { "type": "string" },
          "usedBy": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      }
    },
    "risks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "description": { "type": "string" },
          "impact": { "type": "string" },
          "mitigation": { "type": "string" }
        }
      }
    },
    "implementationOrder": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Story IDs in recommended implementation order"
    }
  },
  "additionalProperties": false
}
```

---

### Schema 5: CRE Assertion Generation

**Used by:** `assertion-generator.js → generate()`

```json
{
  "type": "object",
  "required": ["assertions"],
  "properties": {
    "assertions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "target", "message"],
        "properties": {
          "type": {
            "type": "string",
            "enum": ["FILE_EXISTS", "FILE_CONTAINS", "FUNCTION_SIGNATURE", "EXPORT_EXISTS", "IMPORT_EXISTS", "PATTERN_MATCH", "CLASS_STRUCTURE", "JSON_PROPERTY", "IPC_HANDLER_REGISTERED", "CSS_SELECTOR_EXISTS"]
          },
          "target": { "type": "string" },
          "message": { "type": "string" },
          "expected": { "type": "string" },
          "property": { "type": "string" },
          "selector": { "type": "string" }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

---

### Schema 6: Title Generation (Optional)

**Used by:** `generateTitle()`

```json
{
  "type": "object",
  "required": ["title"],
  "properties": {
    "title": {
      "type": "string",
      "minLength": 2,
      "maxLength": 50,
      "description": "Concise 2-5 word title"
    }
  },
  "additionalProperties": false
}
```

---

## Implementation Architecture

### Key Insight: Two CLI Spawn Patterns

Puffin has **two distinct patterns** for spawning CLI processes:

**Pattern A: `sendPrompt()` (centralized)**
- Used by all CRE callers via `ai-client.js → sendCrePrompt()`
- Already structured with an `options` parameter
- Easiest to add `--json-schema` support: add `options.jsonSchema` → append `--json-schema` to args

**Pattern B: Direct `spawn()` (independent)**
- Used by `deriveStories()`, `modifyStories()`, `generateSprintAssertions()`, `generateTitle()`
- Each builds its own arg list independently
- Would need individual modification, OR refactor to use `sendPrompt()`

### Recommended Approach

1. **Add `jsonSchema` option to `sendPrompt()`** — append `--json-schema` to args AND auto-set `maxTurns >= 2`
2. **Update response extraction in `sendPrompt()`** — scan for `tool_use` blocks with `name === "StructuredOutput"`, extract `.input` as the parsed data
3. **Migrate direct-spawn callers to `sendPrompt()`** — optional but reduces code duplication
4. **Store schemas as files** in `src/main/schemas/`
5. **Simplify all extraction code** — when `--json-schema` is used, the `tool_use.input` is already a parsed object (no `JSON.parse()` needed on the extracted block)

### Compatibility Consideration

`--json-schema` only works with `--print` mode. All 6 paths already use `--print`. No conflicts.

However, `--json-schema` behavior with `--output-format stream-json` needs verification. The streaming format wraps responses in `{ "type": "assistant", "message": { "content": [...] } }` envelopes — the schema validation happens on Claude's raw output before streaming wraps it. The accumulated `resultText` (extracted from streaming envelopes) should be clean JSON. We should validate this assumption before removing fallback extraction.

### Rollout Strategy

**Phase 1:** Add `--json-schema` support to `sendPrompt()` with fallback
- When `jsonSchema` option is provided:
  - Append `--json-schema <schema>` to CLI args
  - Override `maxTurns` to `Math.max(maxTurns, 2)` (StructuredOutput needs >= 2 turns)
  - In the streaming accumulation loop, scan for `tool_use` blocks where `name === "StructuredOutput"`
  - Extract `.input` from that block as the parsed response data
  - Return `{ success: true, response: JSON.stringify(toolUseInput) }` to maintain backward compatibility with existing callers that call `JSON.parse()` on the response
- If no `tool_use` StructuredOutput block found, fall back to existing `parseJsonResponse()` heuristics
- Log when fallback is triggered (indicates schema wasn't used or tool_use wasn't emitted)

**Phase 2:** Migrate direct-spawn callers
- `deriveStories()` → use schema 1 (unwrap `response.stories`)
- `modifyStories()` → use schema 1 (unwrap `response.stories`)
- `generateSprintAssertions()` → use schema 2
- `generateTitle()` → optionally use schema 6

**Phase 3:** Remove fallback extraction code
- After confirming schema enforcement works reliably across all paths
- Delete `extractStoriesFromResponse()` and its 4 strategies
- Delete `parseJsonResponse()` multi-strategy code in ai-client.js
- Delete bracket-matching, code-fence regex, brace-finding logic

---

## User Stories

### Story 1: Add JSON Schema Support to sendPrompt()

**Title:** Add --json-schema flag support to sendPrompt()

**Description:** As a developer, I want `sendPrompt()` to accept a JSON Schema option and pass it to the Claude CLI via `--json-schema` so that all CRE callers automatically get validated, structured JSON responses without fragile extraction heuristics.

**Acceptance Criteria:**
1. `sendPrompt()` accepts an optional `jsonSchema` parameter in its options object
2. When `jsonSchema` is provided, `--json-schema` flag is appended to the CLI args with the schema as a JSON string
3. When `jsonSchema` is provided, `maxTurns` is automatically set to `Math.max(maxTurns, 2)` — the StructuredOutput tool-use cycle requires at least 2 turns
4. The streaming accumulation loop detects `tool_use` content blocks where `name === "StructuredOutput"` and extracts the `.input` field as the structured response data
5. Text content blocks in the assistant message are ignored when a StructuredOutput tool_use is found (Claude emits preamble noise)
6. The extracted `tool_use.input` is serialized back to JSON string and returned as `response` (maintaining backward compatibility with callers that call `JSON.parse()`)
7. If no StructuredOutput tool_use block is found, falls back to existing text accumulation and `parseJsonResponse()` heuristics; a log warning is emitted
8. All 5 existing CRE callers (`analyzeAmbiguities`, `generatePlan`, `refinePlan`, `generate` assertions, `generateRIS`) continue to work without changes (backward compatible)
9. Unit test confirms: (a) `--json-schema` arg included in spawn args, (b) `maxTurns` forced to >= 2, (c) StructuredOutput tool_use extraction works

---

### Story 2: Define and Store JSON Schemas for All Structured Output Types

**Title:** Create JSON Schema definitions for Puffin's structured outputs

**Description:** As a developer, I want predefined JSON Schemas for each type of structured data Puffin requests from Claude so that the schemas can be passed to `--json-schema` and shared across code paths.

**Acceptance Criteria:**
1. Schema file created for user stories array (used by deriveStories, modifyStories)
2. Schema file created for sprint assertions map (used by generateSprintAssertions)
3. Schema file created for CRE ambiguity analysis response
4. Schema file created for CRE plan generation response
5. Schema file created for CRE assertion generation response
6. All schemas are valid JSON Schema draft-07 or later
7. Schemas are stored in a dedicated directory (`src/main/schemas/`) and can be `require()`'d
8. Each schema matches the expected output structure currently documented in prompts

---

### Story 3: Wire CRE Callers to Use JSON Schemas

**Title:** Pass JSON Schemas from CRE callers through sendCrePrompt()

**Description:** As a developer, I want the CRE's `sendCrePrompt()` function to accept and forward a JSON Schema to `sendPrompt()` so that plan generation, assertion generation, and ambiguity analysis produce validated JSON automatically.

**Acceptance Criteria:**
1. `sendCrePrompt()` accepts an optional `jsonSchema` parameter in its options
2. `plan-generator.js` passes the plan schema on `generatePlan()` and `refinePlan()` calls
3. `plan-generator.js` passes the ambiguity schema on `analyzeSprint()` call
4. `assertion-generator.js` passes the assertion schema on `generate()` call
5. When schema is provided and response parses directly, `parseJsonResponse()` fallback is skipped
6. Existing behavior preserved when no schema is provided (backward compatible)

---

### Story 4: Migrate Direct-Spawn Callers to Use JSON Schemas

**Title:** Add --json-schema to direct CLI spawners (deriveStories, generateSprintAssertions)

**Description:** As a developer, I want the direct-spawn callers (`deriveStories()`, `modifyStories()`, `generateSprintAssertions()`) to use `--json-schema` so that all JSON extraction code paths benefit from schema validation.

**Acceptance Criteria:**
1. `deriveStories()` passes the user stories schema to its `spawn('claude', ...)` args and sets `maxTurns >= 2`
2. `modifyStories()` passes the user stories schema to its `spawn('claude', ...)` args and sets `maxTurns >= 2`
3. `generateSprintAssertions()` passes the assertions map schema to its spawn args (already uses `maxTurns: 40`, no change needed)
4. Each caller's streaming loop scans for `StructuredOutput` tool_use blocks and extracts `.input`; falls back to existing extraction if no tool_use found
5. `extractStoriesFromResponse()` still exists as fallback but is marked as deprecated with a log warning when triggered
6. Callers using Schema 1 unwrap `response.stories` to get the array (object envelope)
7. Title generation (`generateTitle()`) optionally uses the title schema (non-blocking if this path is deferred)

---

## Risk Assessment

| Risk | Impact | Status | Mitigation |
|------|--------|--------|------------|
| `--json-schema` doesn't work with `--output-format stream-json` | High | **RESOLVED** — streaming confirmed compatible (2026-02-05) | N/A |
| Root-level schema must be `"object"` type | Medium | **RESOLVED** — Schema 1 updated to wrap array in object | All schemas reviewed; only Schema 1 needed wrapping |
| Data comes in `tool_use.input`, not `result.result` | High | **RESOLVED** — extraction must scan for `StructuredOutput` tool_use blocks (2026-02-05) | Update `sendPrompt()` streaming loop to detect tool_use blocks |
| `--max-turns 1` causes error with `--json-schema` | High | **RESOLVED** — `maxTurns` must be >= 2 when schema is active (2026-02-05) | Auto-set `maxTurns = Math.max(maxTurns, 2)` when `jsonSchema` is provided |
| Claude emits preamble text before tool_use | Low | **RESOLVED** — text blocks in assistant message are noise (2026-02-05) | Only extract from `tool_use` blocks, ignore `text` blocks |
| Schema too strict — Claude can't match it and retries indefinitely | Medium | Open | Keep schemas permissive (use `additionalProperties: false` but allow optional fields); monitor for timeout increases |
| Schema validation adds latency | Low | Open | Claude validates before streaming; expect minimal overhead |
| RIS generator uses JSON but actually needs markdown | Low | Open | RIS path already doesn't use parseJsonResponse for the actual content; leave as-is |
| Existing prompts ask Claude to wrap JSON in code blocks | Medium | Open | Update prompt text to remove "wrap in ```json" instructions when schema is provided |
| `deriveStories`/`modifyStories` callers expect raw array | Low | Open | Must unwrap `response.stories` when using Schema 1 (object wrapper) |

---

## Files Affected

### New Files
| File | Description |
|------|-------------|
| `src/main/schemas/user-stories.schema.json` | User stories array schema |
| `src/main/schemas/sprint-assertions.schema.json` | Sprint assertions map schema |
| `src/main/schemas/cre-ambiguities.schema.json` | Ambiguity analysis schema |
| `src/main/schemas/cre-plan.schema.json` | Plan generation schema |
| `src/main/schemas/cre-assertions.schema.json` | CRE assertion generation schema |
| `src/main/schemas/title.schema.json` | Title generation schema (optional) |

### Modified Files
| File | Changes |
|------|---------|
| `src/main/claude-service.js` | Add `jsonSchema` to `sendPrompt()` args; add schema to `deriveStories()`, `modifyStories()`, `generateSprintAssertions()` |
| `src/main/cre/lib/ai-client.js` | Add `jsonSchema` passthrough in `sendCrePrompt()` |
| `src/main/cre/plan-generator.js` | Pass schemas to `sendCrePrompt()` calls (3 call sites) |
| `src/main/cre/assertion-generator.js` | Pass schema to `sendCrePrompt()` call (1 call site) |

### Files Unchanged But Deprecated
| File | Note |
|------|------|
| `extractStoriesFromResponse()` in claude-service.js | Kept as fallback, marked deprecated |
| `parseJsonResponse()` in ai-client.js | Kept as fallback, marked deprecated |

---

## Implementation Order

```
Story 2 (Define Schemas)
    │
    ├──────────────────┐
    ▼                  ▼
Story 1 (sendPrompt)  Story 4 (Direct spawners)
    │
    ▼
Story 3 (CRE wiring)
```

**Recommended:** Story 2 → Story 1 → Story 3 → Story 4

Story 2 is pure data (no logic changes). Story 1 is the foundational API change. Story 3 wires CRE through it. Story 4 handles the independent spawners.

---

## Summary

| Metric | Current | After Migration |
|--------|---------|-----------------|
| JSON extraction strategies | 4 (stories) + 3 (CRE) + 3 (assertions) = **10** | **1** (`tool_use.input` extraction) |
| Lines of extraction code | ~150 | ~15 (tool_use scan + fallback) or **~5** (Phase 3) |
| Failure modes | Silent wrong extraction, partial JSON, regex mismatch | Schema validation error (explicit), missing tool_use block (logged) |
| Code paths needing individual maintenance | **6** | **1** (`sendPrompt`) |
| Max turns overhead | N/A | +1 turn per call (StructuredOutput tool cycle) |
