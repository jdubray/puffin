# CRE Prompt Catalog

This document catalogs every prompt the CRE prepares and sends to the Claude Code CLI, covering the prompt content, response format, CLI flags, and data flow for each call.

---

## Prompt Pipeline Overview

All CRE prompts follow the same pipeline:

```
Caller Function
    |
    v
Prompt Builder (.buildPrompt())
    |  Returns { system, task, constraints }
    v
ai-client.js: sendCrePrompt()
    |  Assembles: system + "\n\n" + task + "\n\n" + constraints
    |  Sets CLI options: model, maxTurns, timeout, jsonSchema
    v
claude-service.js: sendPrompt()
    |  Spawns: claude --print --output-format stream-json --verbose
    |         --max-turns N --model M --permission-mode acceptEdits
    |         --disallowedTools AskUserQuestion
    |         [--json-schema <schema>]  (if jsonSchema provided)
    |         -  (stdin prompt)
    v
Claude CLI Process (stdout: stream-json)
    |  Outputs newline-delimited JSON messages
    |  Types: "assistant" (content blocks), "result" (final text)
    |  With --json-schema: emits StructuredOutput tool_use block
    v
sendPrompt() Response Handling
    |  Prefers structuredData (from StructuredOutput) when schema used
    |  Falls back to accumulated resultText
    |  Returns { success, response } (response is always a string)
    v
sendCrePrompt() Parse Layer
    |  With schema: JSON.parse(response) directly, fallback to heuristics
    |  Without schema: parseJsonResponse() heuristics (3-strategy chain)
    |  Returns { success, data, error, raw }
    v
Caller Function processes data
```

---

## Common CLI Flags (All Prompts)

Every `sendPrompt()` call uses these base flags:

| Flag | Value | Purpose |
|------|-------|---------|
| `--print` | *(present)* | One-shot mode (no interactive session) |
| `--output-format` | `stream-json` | Newline-delimited JSON output |
| `--verbose` | *(present)* | Include debug information |
| `--max-turns` | `1` or `2` | Max agentic turns (2 when `--json-schema` used) |
| `--model` | `haiku` or `sonnet` | Model selection |
| `--permission-mode` | `acceptEdits` | Auto-accept file edits |
| `--disallowedTools` | `AskUserQuestion` | Prevent AI from asking questions |
| `-` | *(last arg)* | Read prompt from stdin |

**Conditional flag:**

| Flag | Condition | Purpose |
|------|-----------|---------|
| `--json-schema` | When `jsonSchema` option provided | Enforce structured output via StructuredOutput tool_use |

---

## Prompt 1: Analyze Ambiguities

### Caller

| Field | Value |
|-------|-------|
| **Caller Function** | `PlanGenerator.analyzeSprint()` |
| **File** | `src/main/cre/plan-generator.js:171-184` |
| **Prompt Builder** | `analyze-ambiguities.js → buildPrompt()` |
| **CRE Principle** | GROUND — establish shared understanding |

### CLI Options

| Option | Value |
|--------|-------|
| Model | `haiku` (MODEL_EXTRACT) |
| Max Turns | `2` (bumped from 1 due to jsonSchema) |
| Timeout | `60,000 ms` (TIMEOUT_EXTRACT) |
| JSON Schema | `cre-ambiguities.schema.json` |
| Tool Guidance | `false` — excluded from prompt |

### System Prompt Summary

> You are an expert requirements analyst. Your task is to identify ambiguities, gaps, and implicit assumptions in user stories before implementation planning begins. You operate using the GROUND principle: establish a solid foundation of shared understanding before proceeding.

### Task Prompt Summary

Receives formatted user stories (title, ID, description, acceptance criteria) and optional codebase context summary. Asks the AI to analyze stories and identify ambiguities that need clarification, producing a clarifying question for each with story reference, rationale, suggestions, and priority.

### Prompt Inputs

| Input | Source | Description |
|-------|--------|-------------|
| `stories` | Sprint stories from DB | Array of `{ id, title, description, acceptanceCriteria }` |
| `codeModelSummary` | Code model query | Optional text summary of codebase context |
| `includeToolGuidance` | Hardcoded `false` | Tool block excluded (no MCP in one-shot mode) |

### Expected Response Format

```json
{
  "questions": [
    {
      "storyId": "<story id>",
      "question": "<clarifying question>",
      "reason": "<why this matters>",
      "suggestions": ["<option 1>", "<option 2>"],
      "priority": "high | medium | low"
    }
  ],
  "summary": "<brief summary of overall ambiguity level>"
}
```

### Response Parsing

JSON Schema validated via `--json-schema` (StructuredOutput tool_use block). Direct `JSON.parse` attempted first; falls back to `parseJsonResponse()` heuristics only if StructuredOutput not found.

---

## Prompt 2: Generate Plan

### Caller

| Field | Value |
|-------|-------|
| **Caller Function** | `PlanGenerator.generatePlan()` |
| **File** | `src/main/cre/plan-generator.js:242-258` |
| **Prompt Builder** | `generate-plan.js → buildPrompt()` |
| **CRE Principle** | FOLLOW — track connections and dependencies |

### CLI Options

| Option | Value |
|--------|-------|
| Model | `sonnet` (MODEL_COMPLEX) |
| Max Turns | `2` (bumped from 1 due to jsonSchema) |
| Timeout | `120,000 ms` (TIMEOUT_COMPLEX) |
| JSON Schema | `cre-plan.schema.json` |
| Tool Guidance | `false` — excluded from prompt |

### System Prompt Summary

> You are an expert software architect creating implementation plans. You operate using the FOLLOW principle: track connections and dependencies to produce a coherent, ordered plan. You produce plans that a developer can execute story-by-story with clear file targets and acceptance verification.

### Task Prompt Summary

Receives formatted user stories, optional clarification Q&A answers, and codebase context. Asks the AI to generate a dependency-ordered implementation plan where each item maps to a story and specifies files, approach, and dependencies.

### Prompt Inputs

| Input | Source | Description |
|-------|--------|-------------|
| `stories` | Sprint stories | Array of `{ id, title, description, acceptanceCriteria }` |
| `answers` | User's ambiguity answers | Array of `{ question, answer }` from Q&A phase |
| `codeModelContext` | Code model query | Optional structured codebase context |
| `includeToolGuidance` | Hardcoded `false` | Tool block excluded |

### Expected Response Format

```json
{
  "planItems": [
    {
      "order": 1,
      "storyId": "<story id>",
      "title": "<short title>",
      "approach": "<technical approach summary>",
      "filesCreated": ["<path>"],
      "filesModified": ["<path>"],
      "dependencies": ["<storyId>"],
      "complexity": "low | medium | high",
      "notes": "<implementation notes>"
    }
  ],
  "sharedComponents": [
    { "path": "<file>", "purpose": "<why>", "usedBy": ["<storyId>"] }
  ],
  "risks": ["<risk description>"]
}
```

### Response Parsing

JSON Schema validated via `--json-schema`. Direct `JSON.parse` first, heuristic fallback if needed.

---

## Prompt 3: Refine Plan

### Caller

| Field | Value |
|-------|-------|
| **Caller Function** | `PlanGenerator.refinePlan()` |
| **File** | `src/main/cre/plan-generator.js:339-353` |
| **Prompt Builder** | `refine-plan.js → buildPrompt()` |
| **CRE Principle** | FOLLOW — preserve valid parts while incorporating changes |

### CLI Options

| Option | Value |
|--------|-------|
| Model | `sonnet` (MODEL_COMPLEX) |
| Max Turns | `2` (bumped from 1 due to jsonSchema) |
| Timeout | `120,000 ms` (TIMEOUT_COMPLEX) |
| JSON Schema | `cre-plan.schema.json` (same as generatePlan) |
| Tool Guidance | `false` — excluded from prompt |

### System Prompt Summary

> You are an expert software architect refining an implementation plan based on developer feedback. You operate using the FOLLOW principle: preserve the valid parts of the existing plan while incorporating changes. Be conservative — only change what the feedback requires. Do not reorganize or rearchitect unprompted.

### Task Prompt Summary

Receives the current plan (full JSON), the developer's feedback text, optional codebase context, and the current iteration number. Asks the AI to apply feedback and produce an updated plan preserving unchanged items.

### Prompt Inputs

| Input | Source | Description |
|-------|--------|-------------|
| `plan` | Current plan from CRE storage | Full plan object serialized as JSON |
| `feedback` | User text input | Developer's feedback/change request |
| `codeModelContext` | Code model query | Optional structured codebase context |
| `iteration` | Plan counter | Current refinement iteration number |
| `includeToolGuidance` | Hardcoded `false` | Tool block excluded |

### Expected Response Format

Same as Generate Plan, plus optional refinement fields:

```json
{
  "planItems": [...],
  "sharedComponents": [...],
  "risks": [...],
  "changelog": "<description of changes made>",
  "questions": [
    {
      "storyId": "<id>",
      "question": "<follow-up question>",
      "reason": "<why this matters>"
    }
  ]
}
```

### Response Parsing

JSON Schema validated via `--json-schema`. The `changelog` and `questions` fields are defined as optional in `cre-plan.schema.json` so they are preserved when present.

> **Note:** The prompt template (`refine-plan.js:62`) shows `changelog` as an array of strings, but the JSON Schema (`cre-plan.schema.json`) defines it as `type: string`. Since `--json-schema` enforcement takes precedence, the AI returns a string at runtime.

---

## Prompt 4: Generate Assertions

### Caller

| Field | Value |
|-------|-------|
| **Caller Function** | `AssertionGenerator.generate()` |
| **File** | `src/main/cre/assertion-generator.js:111-128` |
| **Prompt Builder** | `generate-assertions.js → buildPrompt()` |
| **CRE Principle** | DERIVE — generate verifiable knowledge from plan |

### CLI Options

| Option | Value |
|--------|-------|
| Model | `haiku` (MODEL_EXTRACT) |
| Max Turns | `2` (bumped from 1 due to jsonSchema) |
| Timeout | `60,000 ms` (TIMEOUT_EXTRACT) |
| JSON Schema | `cre-assertions.schema.json` |
| Tool Guidance | `false` — excluded from prompt |

### System Prompt Summary

> You are generating inspection assertions for a user story implementation. You operate using the DERIVE principle: generate new verifiable knowledge from the plan and acceptance criteria. Assertions will be automatically evaluated against the codebase to verify implementation completeness.

### Task Prompt Summary

Receives a single story (title, ID, description, acceptance criteria) and its plan item (approach, files to create/modify). Optionally receives codebase context and coding standard text. Asks the AI to generate 2-5 testable assertions that verify critical implementation aspects.

### Prompt Inputs

| Input | Source | Description |
|-------|--------|-------------|
| `planItem` | Plan item for this story | `{ approach, filesCreated, filesModified }` |
| `story` | The user story | `{ id, title, description, acceptanceCriteria }` |
| `codeModelContext` | Code model query | Optional structured codebase context |
| `codingStandard` | Project config | Optional coding standard text |
| `includeToolGuidance` | Hardcoded `false` | Tool block excluded |

### Expected Response Format

```json
{
  "assertions": [
    {
      "id": "IA001",
      "criterion": "<which AC this verifies>",
      "type": "file_exists | function_exists | export_exists | pattern_match",
      "target": "<file path relative to project root>",
      "message": "<human-readable description>",
      "assertion": {
        // file_exists:     { "kind": "file | directory" }
        // function_exists: { "name": "<function name>" }
        // export_exists:   { "exports": [{ "name": "<id>", "kind": "function | class | const" }] }
        // pattern_match:   { "pattern": "<regex>", "operator": "present | absent" }
      }
    }
  ]
}
```

### Response Parsing

JSON Schema validated via `--json-schema`. Direct `JSON.parse` first, heuristic fallback if needed.

---

## Prompt 5: Generate RIS

### Caller

| Field | Value |
|-------|-------|
| **Caller Function** | `RISGenerator.generateRIS()` |
| **File** | `src/main/cre/ris-generator.js:95-110` |
| **Prompt Builder** | `generate-ris.js → buildPrompt()` |
| **CRE Principle** | FOLLOW — produce implementation guidance from plan |

### CLI Options

| Option | Value |
|--------|-------|
| Model | `sonnet` (MODEL_COMPLEX) |
| Max Turns | `1` (no jsonSchema) |
| Timeout | `120,000 ms` (TIMEOUT_COMPLEX) |
| JSON Schema | **None** — plain text extraction |
| Tool Guidance | `false` — excluded from prompt |

### System Prompt Summary

> You are generating a Refined Implementation Specification (RIS) document. The RIS is the SOLE instruction document given to a coding agent (Claude Code CLI) to implement a user story. The coding agent has NO other context — it relies entirely on the RIS for what to build, how to build it, and how to verify it. Your RIS must be a complete, detailed, unambiguous implementation guide.

### Task Prompt Summary

Receives a story, its plan item (order, approach, files, dependencies), inspection assertions, codebase context from code model queries, and project config (branch). The prompt asks for a comprehensive RIS markdown document with sections for: Context, Objective, Acceptance Criteria, Codebase Navigation, Implementation Instructions, Conventions, and Inspection Assertions.

The constraints section is the longest of any prompt (~2000 chars) and includes detailed formatting rules for each RIS section, specifying that implementation instructions must include exact file paths, function signatures, data structures, error handling, and integration details.

### Prompt Inputs

| Input | Source | Description |
|-------|--------|-------------|
| `planItem` | Plan item for this story | `{ order, approach, filesCreated, filesModified, dependencies }` |
| `story` | The user story (parsed) | `{ id, title, description, acceptanceCriteria }` |
| `assertions` | `inspection_assertions` DB table | Array of assertions for this story |
| `codeModelContext` | `CodeModel.queryForTask()` | Structured codebase context (relevant artifacts, deps) |
| `projectConfig` | Runtime config | `{ branch }` |
| `includeToolGuidance` | Hardcoded `false` | Tool block excluded |

### Expected Response Format

```json
{
  "markdown": "<full RIS markdown document>",
  "sections": {
    "context": "<context section>",
    "objective": "<objective section>",
    "navigation": "<codebase navigation guidance>",
    "instructions": "<implementation instructions>",
    "conventions": "<conventions section>",
    "assertions": "<assertions checklist>"
  }
}
```

### Response Parsing

No JSON Schema. Uses `parseJsonResponse()` heuristic chain:
1. Direct `JSON.parse` of trimmed text
2. Extract from markdown code fences (` ```json ... ``` `)
3. Extract first top-level `{ ... }` block

---

## Summary Matrix

| # | Prompt | Caller | Builder | Model | Timeout | JSON Schema | Tool Guidance | Max Turns |
|---|--------|--------|---------|-------|---------|-------------|---------------|-----------|
| 1 | Analyze Ambiguities | `PlanGenerator.analyzeSprint()` | `analyze-ambiguities.js` | haiku | 60s | `cre-ambiguities.schema.json` | `false` | 2 |
| 2 | Generate Plan | `PlanGenerator.generatePlan()` | `generate-plan.js` | sonnet | 120s | `cre-plan.schema.json` | `false` | 2 |
| 3 | Refine Plan | `PlanGenerator.refinePlan()` | `refine-plan.js` | sonnet | 120s | `cre-plan.schema.json` | `false` | 2 |
| 4 | Generate Assertions | `AssertionGenerator.generate()` | `generate-assertions.js` | haiku | 60s | `cre-assertions.schema.json` | `false` | 2 |
| 5 | Generate RIS | `RISGenerator.generateRIS()` | `generate-ris.js` | sonnet | 120s | **None** | `false` | 1 |

### Key Notes

- **All prompts set `includeToolGuidance: false`** because `sendPrompt()` runs a one-shot CLI process (`--print`) with no MCP server connections. The `hdsl_*` tools referenced in the guidance blocks do not exist in that context. Including the guidance would cause the AI to attempt tool calls that fail silently.

- **4 of 5 prompts use JSON Schema validation** via the `--json-schema` CLI flag. The exception is RIS generation, which outputs markdown (wrapped in a JSON envelope) and uses heuristic text extraction instead.

- **Model selection follows complexity**: `haiku` (faster, cheaper) for extraction tasks (ambiguities, assertions) and `sonnet` (more capable) for complex reasoning tasks (plan generation, refinement, RIS).

- **Each prompt builder defines a `CODE_MODEL_TOOLS_BLOCK`** constant that is conditionally included. Currently all callers pass `includeToolGuidance: false`, making these blocks dormant. They exist for future use when CRE callers gain MCP tool access.

- **The prompt is assembled as a single string**: `system + "\n\n" + task + "\n\n" + constraints`, written to the CLI's stdin. There is no system/user message separation — the Claude CLI receives one flat text block.
