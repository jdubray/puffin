# Puffin SQLite Database Schema

This document details the SQLite database schema used by Puffin for persistent storage. The database file is stored at `.puffin/puffin.db` within each project directory.

**Schema Version**: v3.0.0 (9 migrations applied)

## Technology

- **Engine**: SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **Node.js Requirement**: v20 LTS (for native module support)
- **Migrations**: Managed via numbered migration files in `src/main/database/migrations/`

---

## Tables Overview

| Table | Purpose |
|-------|---------|
| `user_stories` | Active user stories in the backlog |
| `archived_stories` | Soft-deleted/archived user stories |
| `sprints` | Active sprint data |
| `sprint_stories` | Junction table linking sprints to stories |
| `sprint_history` | Archived/closed sprints |
| `story_generations` | Tracks AI-generated story batches |
| `implementation_journeys` | Tracks story implementation progress |
| `plans` | CRE implementation plans linked to sprints |
| `ris` | Refined Implementation Specifications per story |
| `inspection_assertions` | CRE-generated verification assertions |
| `completion_summaries` | Story completion data and metrics |
| `_json_migration` | Tracks migration from legacy JSON files |
| `_migrations` | Schema migration version tracking |

---

## Entity Relationship Diagram

```
┌─────────────────────┐     ┌─────────────────────┐
│    user_stories     │     │   archived_stories  │
├─────────────────────┤     ├─────────────────────┤
│ id (PK)             │     │ id (PK)             │
│ branch_id           │     │ branch_id           │
│ title               │     │ title               │
│ description         │     │ description         │
│ acceptance_criteria │     │ acceptance_criteria │
│ inspection_assert'ns│     │ inspection_assert'ns│
│ assertion_results   │     │ assertion_results   │
│ completion_summary  │     │ completion_summary  │
│ status              │     │ status              │
│ implemented_on      │     │ implemented_on      │
│ source_prompt_id    │     │ source_prompt_id    │
│ created_at          │     │ created_at          │
│ updated_at          │     │ updated_at          │
│ archived_at         │     │ archived_at         │
└──────────┬──────────┘     └─────────────────────┘
           │
           │ 1:N                    ┌─────────────────────┐
           ▼                        │completion_summaries │
┌─────────────────────┐             ├─────────────────────┤
│   sprint_stories    │             │ id (PK)             │
├─────────────────────┤             │ story_id (FK)       │
│ sprint_id (PK, FK)  │             │ session_id          │
│ story_id (PK, FK)   │             │ summary             │
│ added_at            │             │ files_modified      │
└──────────┬──────────┘             │ tests_status        │
           │                        │ criteria_matched    │
           │ N:1                    │ turns               │
           ▼                        │ cost                │
┌─────────────────────┐             │ duration            │
│       sprints       │             │ created_at          │
├─────────────────────┤             └─────────────────────┘
│ id (PK)             │
│ title               │             ┌─────────────────────┐
│ description         │             │  story_generations  │
│ status              │             ├─────────────────────┤
│ plan                │             │ id (PK)             │
│ story_progress      │             │ user_prompt         │
│ prompt_id           │             │ project_context     │
│ created_at          │             │ generated_stories   │
│ plan_approved_at    │             │ model_used          │
│ completed_at        │             │ created_at          │
│ closed_at           │             └─────────────────────┘
└──────────┬──────────┘
           │                        ┌─────────────────────┐
           │ 1:1                    │ implementation_     │
           ▼                        │     journeys        │
┌─────────────────────┐             ├─────────────────────┤
│       plans         │             │ id (PK)             │
├─────────────────────┤             │ story_id (FK)       │
│ id (PK)             │             │ prompt_id           │
│ sprint_id (FK)      │─┐           │ turn_count          │
│ status              │ │           │ inputs              │
│ file_path           │ │           │ status              │
│ iteration           │ │           │ outcome_notes       │
│ created_at          │ │           │ started_at          │
│ updated_at          │ │           │ completed_at        │
│ approved_at         │ │           └─────────────────────┘
└──────────┬──────────┘ │
           │            │
           │ 1:N        │
           ▼            │
┌─────────────────────┐ │
│        ris          │ │
├─────────────────────┤ │
│ id (PK)             │ │
│ plan_id (FK)        │─┘
│ sprint_id (FK)      │
│ story_id (FK)       │
│ branch              │
│ status              │
│ content             │
│ code_model_version  │
│ created_at          │
│ updated_at          │
└──────────┬──────────┘
           │
           │ Same plan_id
           │
┌──────────▼──────────┐
│ inspection_         │
│   assertions        │
├─────────────────────┤
│ id (PK)             │
│ plan_id (FK)        │
│ story_id (FK)       │
│ type                │
│ target              │
│ message             │
│ assertion_data      │
│ result              │
│ verified_at         │
│ created_at          │
└─────────────────────┘

           ┌─────────────────────┐
           │   sprint_history    │  (Archive)
           ├─────────────────────┤
           │ id (PK)             │
           │ title               │
           │ description         │
           │ status              │
           │ plan                │
           │ story_progress      │
           │ story_ids           │
           │ stories             │
           │ prompt_id           │
           │ created_at          │
           │ plan_approved_at    │
           │ completed_at        │
           │ closed_at           │
           └─────────────────────┘
```

---

## Table Definitions

### user_stories

Stores active user stories in the backlog.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique story identifier (UUID) |
| `branch_id` | TEXT | | Branch where story originated |
| `title` | TEXT | NOT NULL | Story title/summary |
| `description` | TEXT | DEFAULT '' | Detailed description |
| `acceptance_criteria` | TEXT | DEFAULT '[]' | JSON array of criteria strings |
| `inspection_assertions` | TEXT | DEFAULT '[]' | JSON array of assertion definitions (see Inspection Assertions) |
| `assertion_results` | TEXT | DEFAULT NULL | JSON object with evaluation results (null when unevaluated) |
| `completion_summary` | TEXT | DEFAULT NULL | JSON object with story completion data (see Completion Summary) |
| `status` | TEXT | NOT NULL DEFAULT 'pending' | Story status (see Status Values) |
| `implemented_on` | TEXT | DEFAULT '[]' | JSON array of branch names where implemented |
| `source_prompt_id` | TEXT | | ID of prompt that generated this story |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO timestamp |
| `updated_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO timestamp |
| `archived_at` | TEXT | | ISO timestamp when archived (null if active) |

**Indexes:**
- `idx_user_stories_status` on `status`
- `idx_user_stories_created` on `created_at DESC`
- `idx_user_stories_branch` on `branch_id`

**Status Values:**
| Status | Description |
|--------|-------------|
| `pending` | In backlog, ready for implementation |
| `in-progress` | Currently being worked on |
| `completed` | Implementation finished |
| `archived` | Moved to archived_stories table |

---

### archived_stories

Stores soft-deleted/archived user stories. Same schema as `user_stories` for easy restoration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Original story identifier |
| `branch_id` | TEXT | | Branch where story originated |
| `title` | TEXT | NOT NULL | Story title |
| `description` | TEXT | DEFAULT '' | Detailed description |
| `acceptance_criteria` | TEXT | DEFAULT '[]' | JSON array of criteria |
| `inspection_assertions` | TEXT | DEFAULT '[]' | JSON array of assertion definitions |
| `assertion_results` | TEXT | DEFAULT NULL | JSON object with evaluation results |
| `completion_summary` | TEXT | DEFAULT NULL | JSON object with story completion data |
| `status` | TEXT | NOT NULL DEFAULT 'archived' | Always 'archived' |
| `implemented_on` | TEXT | DEFAULT '[]' | JSON array of branch names |
| `source_prompt_id` | TEXT | | ID of source prompt |
| `created_at` | TEXT | NOT NULL | Original creation timestamp |
| `updated_at` | TEXT | NOT NULL | Last update timestamp |
| `archived_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | When archived |

---

### sprints

Stores active sprint data. Only one active sprint (where `closed_at IS NULL`) is allowed at a time.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique sprint identifier (UUID) |
| `title` | TEXT | NOT NULL DEFAULT '' | Sprint title (user-defined) |
| `description` | TEXT | DEFAULT '' | Sprint description/goals |
| `status` | TEXT | NOT NULL DEFAULT 'created', CHECK constraint | Sprint status (see Status Values) |
| `plan` | TEXT | | Implementation plan markdown |
| `story_progress` | TEXT | DEFAULT '{}' | JSON object tracking per-story progress |
| `prompt_id` | TEXT | | ID of associated prompt |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO timestamp |
| `plan_approved_at` | TEXT | | When plan was approved |
| `completed_at` | TEXT | | When all stories completed |
| `closed_at` | TEXT | | When sprint was closed/archived |

**Indexes:**
- `idx_sprints_status` on `status`
- `idx_sprints_closed` on `closed_at DESC`

**Triggers:**
- `enforce_single_active_sprint`: Prevents inserting a new sprint when an active sprint exists (`closed_at IS NULL`)

**Status Values:**
| Status | Description |
|--------|-------------|
| `created` | Sprint created, not yet started planning |
| `planning` | Plan being created |
| `plan-review` | Plan submitted for review |
| `in-progress` | Plan approved, work underway |
| `completed` | All stories completed |
| `closed` | Sprint archived to history |

**story_progress JSON Structure:**
```json
{
  "<story_id>": {
    "status": "completed|in-progress|pending",
    "completedAt": "ISO timestamp or null",
    "branches": {
      "<branch_type>": {
        "status": "completed|in_progress|pending",
        "startedAt": "ISO timestamp",
        "completedAt": "ISO timestamp"
      }
    }
  }
}
```

---

### sprint_stories

Junction table linking sprints to user stories (many-to-many relationship).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `sprint_id` | TEXT | NOT NULL, FK → sprints(id) | Sprint reference |
| `story_id` | TEXT | NOT NULL, FK → user_stories(id) | Story reference |
| `added_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | When story was added to sprint |

**Primary Key:** (`sprint_id`, `story_id`)

**Foreign Keys:**
- `sprint_id` → `sprints(id)` ON DELETE CASCADE
- `story_id` → `user_stories(id)` ON DELETE CASCADE

---

### sprint_history

Stores archived/closed sprints with denormalized story data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Original sprint identifier |
| `title` | TEXT | | Sprint title |
| `description` | TEXT | DEFAULT '' | Sprint description |
| `status` | TEXT | NOT NULL DEFAULT 'closed' | Always 'closed' |
| `plan` | TEXT | | Implementation plan |
| `story_progress` | TEXT | DEFAULT '{}' | JSON progress tracking |
| `story_ids` | TEXT | DEFAULT '[]' | JSON array of story IDs |
| `stories` | TEXT | DEFAULT '[]' | JSON array of full story objects (denormalized) |
| `prompt_id` | TEXT | | Associated prompt ID |
| `created_at` | TEXT | NOT NULL | Original creation time |
| `plan_approved_at` | TEXT | | Plan approval time |
| `completed_at` | TEXT | | Completion time |
| `closed_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | When archived |

**Indexes:**
- `idx_sprint_history_closed` on `closed_at DESC`

**Note:** The `stories` column (added in migration 003) stores full story objects inline, ensuring story data is preserved even if stories are deleted from `user_stories`.

---

### story_generations

Tracks batches of AI-generated stories from specifications.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Generation batch identifier |
| `user_prompt` | TEXT | | Original user prompt |
| `project_context` | TEXT | | Project context used for generation |
| `generated_stories` | TEXT | DEFAULT '[]' | JSON array of generated story objects |
| `model_used` | TEXT | DEFAULT 'sonnet' | Claude model used |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO timestamp |

---

### implementation_journeys

Tracks the implementation lifecycle of individual stories.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Journey identifier |
| `story_id` | TEXT | NOT NULL, FK → user_stories(id) | Story being implemented |
| `prompt_id` | TEXT | | Associated prompt ID |
| `turn_count` | INTEGER | DEFAULT 0 | Number of conversation turns |
| `inputs` | TEXT | DEFAULT '[]' | JSON array of input prompts |
| `status` | TEXT | DEFAULT 'pending' | Journey status |
| `outcome_notes` | TEXT | | Notes about implementation outcome |
| `started_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | Start timestamp |
| `completed_at` | TEXT | | Completion timestamp |

**Indexes:**
- `idx_implementation_journeys_story` on `story_id`
- `idx_implementation_journeys_status` on `status`

**Foreign Keys:**
- `story_id` → `user_stories(id)` ON DELETE CASCADE

---

### plans

Stores CRE (Code Review Engine) implementation plans. Each sprint has one plan (1:1 relationship).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique plan identifier (UUID) |
| `sprint_id` | TEXT | NOT NULL, UNIQUE | Sprint this plan belongs to |
| `status` | TEXT | NOT NULL DEFAULT 'draft' | Plan status (see Status Values) |
| `file_path` | TEXT | NOT NULL | Markdown file path (.puffin/plans/*.md) |
| `iteration` | INTEGER | NOT NULL DEFAULT 0 | Plan refinement iteration count |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO timestamp |
| `updated_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO timestamp |
| `approved_at` | TEXT | DEFAULT NULL | When plan was approved by user |

**Indexes:**
- `idx_plans_sprint_id` (UNIQUE) on `sprint_id`

**Status Values:**
| Status | Description |
|--------|-------------|
| `draft` | Plan generated, awaiting review |
| `approved` | User approved plan, ready for implementation |
| `in-progress` | Implementation underway |
| `completed` | All stories implemented |

---

### ris

Stores RIS (Refined Implementation Specification) documents generated by CRE. One RIS per story per plan.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique RIS identifier (UUID) |
| `plan_id` | TEXT | NOT NULL, FK → plans(id) | Plan this RIS belongs to |
| `sprint_id` | TEXT | FK → sprints(id) | Sprint context |
| `story_id` | TEXT | NOT NULL, FK → user_stories(id) | Story this RIS implements |
| `branch` | TEXT | | Git branch name (if branch-specific) |
| `status` | TEXT | NOT NULL DEFAULT 'generated' | RIS status |
| `content` | TEXT | NOT NULL DEFAULT '' | Markdown content of RIS document |
| `code_model_version` | TEXT | | h-DSL code model version used |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO timestamp |
| `updated_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO timestamp |

**Indexes:**
- `idx_ris_plan_id` on `plan_id`
- `idx_ris_sprint_id` on `sprint_id`
- `idx_ris_story_id` on `story_id`

**Foreign Keys:**
- `plan_id` → `plans(id)` (implicit from migration 007)
- `sprint_id` → `sprints(id)` (optional, nullable)
- `story_id` → `user_stories(id)` (implicit from migration 007)

---

### inspection_assertions

Stores CRE-generated inspection assertions for verifying story implementations. These are separate from the denormalized assertions in `user_stories.inspection_assertions` column.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique assertion identifier (UUID) |
| `plan_id` | TEXT | NOT NULL, FK → plans(id) | Plan this assertion belongs to |
| `story_id` | TEXT | NOT NULL, FK → user_stories(id) | Story being verified |
| `type` | TEXT | NOT NULL | Assertion type (FILE_EXISTS, PATTERN_MATCH, etc.) |
| `target` | TEXT | NOT NULL | Target file/path/selector for assertion |
| `message` | TEXT | NOT NULL DEFAULT '' | Human-readable assertion description |
| `assertion_data` | TEXT | NOT NULL DEFAULT '{}' | JSON object with type-specific assertion data |
| `result` | TEXT | DEFAULT NULL | Evaluation result ('passed', 'failed', 'error', or null if unevaluated) |
| `verified_at` | TEXT | DEFAULT NULL | ISO timestamp when assertion was verified |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO timestamp |

**Indexes:**
- `idx_assertions_plan_id` on `plan_id`
- `idx_assertions_story_id` on `story_id`

**Foreign Keys:**
- `plan_id` → `plans(id)` (implicit from migration 007)
- `story_id` → `user_stories(id)` (implicit from migration 007)

**Note**: The CRE system stores assertions in TWO places:
1. This `inspection_assertions` table (normalized, CRE-managed)
2. `user_stories.inspection_assertions` JSON column (denormalized, UI reads from here)

The two stores are synchronized during assertion generation and evaluation.

---

### completion_summaries

Stores structured completion data for implemented user stories, capturing metrics and outcomes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique summary identifier (UUID) |
| `story_id` | TEXT | NOT NULL, FK → user_stories(id) | Story this summary belongs to |
| `session_id` | TEXT | | Claude CLI session ID |
| `summary` | TEXT | NOT NULL DEFAULT '' | AI-generated completion summary |
| `files_modified` | TEXT | NOT NULL DEFAULT '[]' | JSON array of file paths modified |
| `tests_status` | TEXT | NOT NULL DEFAULT 'unknown' | Test run status ('passed', 'failed', 'skipped', 'unknown') |
| `criteria_matched` | TEXT | NOT NULL DEFAULT '[]' | JSON array of acceptance criteria IDs matched |
| `turns` | INTEGER | DEFAULT 0 | Number of conversation turns |
| `cost` | REAL | DEFAULT 0 | API cost in dollars |
| `duration` | INTEGER | DEFAULT 0 | Implementation duration in milliseconds |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO timestamp |

**Indexes:**
- `idx_completion_summaries_story_id` on `story_id`

**Foreign Keys:**
- `story_id` → `user_stories(id)` ON DELETE CASCADE (implicit from migration 009)

**Note**: This data is also denormalized in `user_stories.completion_summary` JSON column for quick access without joins.

---

### _json_migration

Internal table tracking migration from legacy JSON files to SQLite.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Migration record ID |
| `file_type` | TEXT | NOT NULL UNIQUE | Type of file migrated |
| `migrated_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | Migration timestamp |
| `record_count` | INTEGER | DEFAULT 0 | Number of records migrated |

---

### _migrations

Internal table tracking schema migration versions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `version` | INTEGER | PRIMARY KEY | Migration version number |
| `applied_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | When migration was applied |

---

## Migrations

Migrations are stored in `src/main/database/migrations/` and applied in order:

| Version | File | Description |
|---------|------|-------------|
| 001 | `001_initial_schema.js` | Creates all initial tables and indexes |
| 002 | `002_fix_implemented_status.js` | Fixes status naming: 'implemented' → 'completed' |
| 003 | `003_add_sprint_history_stories.js` | Adds `stories` column to `sprint_history` for denormalized storage |
| 004 | `004_add_sprint_title_description.js` | Adds `title` and `description` columns to `sprints` and `sprint_history` |
| 005 | `005_add_inspection_assertions.js` | Adds `inspection_assertions` and `assertion_results` columns to `user_stories` and `archived_stories` |
| 006 | `006_reset_sprint_schema.js` | Clean reset of sprint tables with status CHECK constraints and single-active-sprint trigger |
| 007 | `007_cre_tables.js` | Creates CRE tables: `cre_plans`, `cre_ris`, `cre_inspection_assertions` |
| 008 | `008_cre_schema_rename.js` | Renames CRE tables (removes `cre_` prefix), adds columns to `ris`, creates UNIQUE index on `plans.sprint_id` |
| 009 | `009_add_completion_summary.js` | Creates `completion_summaries` table and adds `completion_summary` JSON column to `user_stories` and `archived_stories` |

---

## JSON Field Conventions

Several columns store JSON-encoded data:

| Table | Column | JSON Type | Example |
|-------|--------|-----------|---------|
| user_stories | acceptance_criteria | Array | `["User can login", "Password is validated"]` |
| user_stories | inspection_assertions | Array | `[{id: "IA1", type: "FILE_EXISTS", ...}]` |
| user_stories | assertion_results | Object | `{evaluatedAt: "...", summary: {...}, results: [...]}` |
| user_stories | completion_summary | Object | `{summary: "...", filesModified: [...], testsStatus: "passed"}` |
| user_stories | implemented_on | Array | `["ui", "backend"]` |
| sprints | story_progress | Object | `{"story-1": {"status": "completed"}}` |
| sprint_history | story_ids | Array | `["story-1", "story-2"]` |
| sprint_history | stories | Array | `[{id: "story-1", title: "..."}]` |
| story_generations | generated_stories | Array | `[{title: "...", description: "..."}]` |
| implementation_journeys | inputs | Array | `["prompt 1", "prompt 2"]` |
| inspection_assertions | assertion_data | Object | `{type: "file", pattern: "*.js", exports: [...]}` |
| completion_summaries | files_modified | Array | `["src/app.js", "src/util.js"]` |
| completion_summaries | criteria_matched | Array | `["AC1", "AC2"]` |

---

## Inspection Assertions Schema

Inspection assertions provide declarative verification for user story implementations. See `docs/INSPECTION_ASSERTIONS_METAMODEL.md` for full specification.

### inspection_assertions Column

Stores an array of assertion definitions:

```json
[
  {
    "id": "IA1",
    "criterion": "AC1",
    "type": "FILE_EXISTS",
    "target": "src/components/Feature.js",
    "assertion": { "type": "file" },
    "message": "Feature component file exists"
  },
  {
    "id": "IA2",
    "criterion": "AC2",
    "type": "EXPORT_EXISTS",
    "target": "src/components/Feature.js",
    "assertion": {
      "exports": [
        { "name": "FeatureComponent", "type": "class" }
      ]
    },
    "message": "FeatureComponent class is exported"
  }
]
```

**Assertion Types:**
| Type | Purpose |
|------|---------|
| `FILE_EXISTS` | Verify file or directory exists |
| `FILE_CONTAINS` | Verify file contains specific content |
| `JSON_PROPERTY` | Verify JSON file has expected properties |
| `EXPORT_EXISTS` | Verify JS/TS module exports |
| `CLASS_STRUCTURE` | Verify class methods and properties |
| `FUNCTION_SIGNATURE` | Verify function parameters and modifiers |
| `IMPORT_EXISTS` | Verify module imports |
| `IPC_HANDLER_REGISTERED` | Verify IPC handler registration (Puffin-specific) |
| `CSS_SELECTOR_EXISTS` | Verify CSS selectors defined |
| `PATTERN_MATCH` | Generic pattern matching |

### assertion_results Column

Stores evaluation results (null when unevaluated):

```json
{
  "evaluatedAt": "2024-01-15T10:30:00Z",
  "summary": {
    "total": 5,
    "passed": 4,
    "failed": 1,
    "undecided": 0
  },
  "results": [
    {
      "assertionId": "IA1",
      "status": "passed",
      "message": "Feature component file exists",
      "details": null
    },
    {
      "assertionId": "IA2",
      "status": "failed",
      "message": "FeatureComponent class is exported",
      "details": {
        "expected": "Export 'FeatureComponent' of type 'class'",
        "actual": "Export not found",
        "file": "src/components/Feature.js",
        "suggestion": "Add 'export class FeatureComponent { ... }' to the file"
      }
    }
  ]
}
```

**Result Status Values:**
| Status | Description |
|--------|-------------|
| `passed` | Assertion condition was met |
| `failed` | Assertion condition was not met |
| `error` | Evaluation could not complete (e.g., file unreadable) |

---

## Completion Summary Schema

Story completion data is stored in two places:
1. `completion_summaries` table (normalized, full history)
2. `user_stories.completion_summary` JSON column (denormalized, quick access)

### completion_summary Column

The denormalized JSON structure stored in `user_stories.completion_summary`:

```json
{
  "summary": "Implemented user authentication with JWT tokens and bcrypt password hashing",
  "filesModified": [
    "src/auth/auth-service.js",
    "src/routes/auth.js",
    "tests/auth.test.js"
  ],
  "testsStatus": "passed",
  "criteriaMatched": ["AC1", "AC2", "AC3"],
  "turns": 12,
  "cost": 0.45,
  "duration": 180000,
  "sessionId": "session_abc123",
  "completedAt": "2024-01-15T14:30:00Z"
}
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `summary` | string | AI-generated natural language summary of what was implemented |
| `filesModified` | array | List of file paths that were created, modified, or deleted |
| `testsStatus` | string | Status of test runs: 'passed', 'failed', 'skipped', 'unknown' |
| `criteriaMatched` | array | IDs of acceptance criteria that were addressed |
| `turns` | integer | Number of conversation turns in the implementation session |
| `cost` | number | API cost in USD |
| `duration` | integer | Implementation duration in milliseconds |
| `sessionId` | string | Claude CLI session ID for this implementation |
| `completedAt` | string | ISO timestamp when story was marked complete |

---

## Data Flow

### Story Lifecycle

```
Create Story → user_stories (status: pending)
       ↓
Start Implementation → user_stories (status: in-progress)
       ↓
Complete → user_stories (status: completed)
       ↓
Archive → archived_stories (status: archived)
       ↓
Restore → user_stories (status: pending)
```

### Sprint Lifecycle

```
Create Sprint → sprints (status: planning)
       ↓         + sprint_stories relationships
Plan Approved → sprints (status: in-progress)
       ↓
All Stories Done → sprints (status: completed)
       ↓
Close Sprint → sprint_history
               - Delete from sprints
               - Delete from sprint_stories
               - Stories marked 'completed' in user_stories
```

---

## Repository Layer

The database is accessed through repository classes in `src/main/database/repositories/`:

| Repository | Table(s) | Purpose |
|------------|----------|---------|
| `UserStoryRepository` | user_stories, archived_stories | CRUD for user stories |
| `SprintRepository` | sprints, sprint_stories, sprint_history | CRUD for sprints |
| `CompletionSummaryRepository` | completion_summaries | CRUD for story completion data |
| `BaseRepository` | - | Common functionality (transactions, JSON helpers) |

**Note on CRE Tables**: The CRE tables (`plans`, `ris`, `inspection_assertions`) are accessed directly via the database connection in `src/main/cre/` modules rather than through repository classes. This is because CRE is implemented as an integrated subsystem with specialized query patterns.

### Transaction Support

Repositories use `better-sqlite3`'s synchronous transactions:

- `transaction()` - Deferred transaction (default)
- `immediateTransaction()` - Acquires write lock immediately (used for critical operations)

---

## Performance Considerations

1. **Indexes**: Key queries are optimized with indexes on status, dates, and foreign keys
2. **Separate Archive Tables**: Archived data is stored separately to keep active tables small
3. **Denormalized History**: Sprint history stores inline story data to avoid joins on historical queries
4. **JSON Columns**: Flexible schema for nested data without additional tables

---

## Backup and Recovery

The SQLite database file (`.puffin/puffin.db`) can be:

1. **Backed up**: Copy the file while Puffin is closed
2. **Version controlled**: Commit with project (binary file)
3. **Recovered**: Replace file with backup copy

**Note**: The `puffin.db-wal` and `puffin.db-shm` files are temporary WAL mode files and should not be backed up separately.

---

## v3.0.0 Schema Evolution

The database schema has grown significantly from v1.0.0 to v3.0.0 to support advanced features:

### Initial Schema (Migrations 001-006)
- Core story and sprint management
- Soft-delete via `archived_stories`
- Sprint history with denormalized stories
- Inspection assertions in user_stories JSON column

### CRE Integration (Migrations 007-008)
- **plans**: Implementation plans with approval workflow
- **ris**: Refined Implementation Specifications per story
- **inspection_assertions**: Normalized assertion storage with evaluation results
- Unique constraint on `plans.sprint_id` (one plan per sprint)
- Multiple indexes for efficient CRE queries

### Completion Tracking (Migration 009)
- **completion_summaries**: Normalized completion data with metrics
- Denormalized `completion_summary` JSON column on `user_stories`
- Tracks files modified, tests status, criteria matched, cost, and duration

### Table Count Evolution
- **v1.0.0**: 8 tables (001-006 migrations)
- **v3.0.0**: 13 tables (001-009 migrations)
- **Schema versions**: 9 migrations applied

The schema follows a hybrid approach:
- **Normalized data** in dedicated tables for complex queries and history
- **Denormalized JSON columns** for quick UI access without joins
- **Archive tables** to keep active tables small and performant
