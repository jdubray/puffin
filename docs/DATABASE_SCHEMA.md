# Puffin SQLite Database Schema

This document details the SQLite database schema used by Puffin for persistent storage. The database file is stored at `.puffin/puffin.db` within each project directory.

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
│ status              │     │ status              │
│ implemented_on      │     │ implemented_on      │
│ source_prompt_id    │     │ source_prompt_id    │
│ created_at          │     │ created_at          │
│ updated_at          │     │ updated_at          │
│ archived_at         │     │ archived_at         │
└──────────┬──────────┘     └─────────────────────┘
           │
           │ 1:N
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│   sprint_stories    │────▶│       sprints       │
├─────────────────────┤     ├─────────────────────┤
│ sprint_id (PK, FK)  │     │ id (PK)             │
│ story_id (PK, FK)   │     │ title               │
│ added_at            │     │ description         │
└─────────────────────┘     │ status              │
                            │ plan                │
                            │ story_progress      │
                            │ prompt_id           │
                            │ created_at          │
                            │ plan_approved_at    │
                            │ completed_at        │
                            │ closed_at           │
                            └─────────────────────┘
                                      │
                                      │ archive
                                      ▼
                            ┌─────────────────────┐
                            │   sprint_history    │
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

┌─────────────────────┐     ┌─────────────────────┐
│ implementation_     │     │  story_generations  │
│     journeys        │     ├─────────────────────┤
├─────────────────────┤     │ id (PK)             │
│ id (PK)             │     │ user_prompt         │
│ story_id (FK)       │     │ project_context     │
│ prompt_id           │     │ generated_stories   │
│ turn_count          │     │ model_used          │
│ inputs              │     │ created_at          │
│ status              │     └─────────────────────┘
│ outcome_notes       │
│ started_at          │
│ completed_at        │
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
| `status` | TEXT | NOT NULL DEFAULT 'archived' | Always 'archived' |
| `implemented_on` | TEXT | DEFAULT '[]' | JSON array of branch names |
| `source_prompt_id` | TEXT | | ID of source prompt |
| `created_at` | TEXT | NOT NULL | Original creation timestamp |
| `updated_at` | TEXT | NOT NULL | Last update timestamp |
| `archived_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | When archived |

---

### sprints

Stores active sprint data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique sprint identifier (UUID) |
| `title` | TEXT | | Sprint title (user-defined) |
| `description` | TEXT | DEFAULT '' | Sprint description/goals |
| `status` | TEXT | NOT NULL DEFAULT 'planning' | Sprint status (see Status Values) |
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

**Status Values:**
| Status | Description |
|--------|-------------|
| `planning` | Initial state, plan being created |
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

---

## JSON Field Conventions

Several columns store JSON-encoded data:

| Table | Column | JSON Type | Example |
|-------|--------|-----------|---------|
| user_stories | acceptance_criteria | Array | `["User can login", "Password is validated"]` |
| user_stories | implemented_on | Array | `["ui", "backend"]` |
| sprints | story_progress | Object | `{"story-1": {"status": "completed"}}` |
| sprint_history | story_ids | Array | `["story-1", "story-2"]` |
| sprint_history | stories | Array | `[{id: "story-1", title: "..."}]` |
| story_generations | generated_stories | Array | `[{title: "...", description: "..."}]` |
| implementation_journeys | inputs | Array | `["prompt 1", "prompt 2"]` |

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
| `BaseRepository` | - | Common functionality (transactions, JSON helpers) |

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
