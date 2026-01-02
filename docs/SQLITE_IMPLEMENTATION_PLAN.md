# SQLite Integration Implementation Plan

## Executive Summary

This plan covers the implementation of SQLite persistence for Puffin, replacing the current JSON file-based storage with a structured database. The work spans 4 user stories that together provide a robust, versioned data layer for user stories, sprints, and project data.

---

## Design Decisions (Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **JSON File Retention** | Keep permanently | JSON files remain as backup alongside SQLite |
| **Platform Support** | Standard platforms | No special ARM64 or platform-specific requirements |
| **Sprint History Retention** | Indefinite | All sprint history retained forever (no purging) |
| **Multi-Project Isolation** | Per-project database | Each project has its own `.puffin/puffin.db` |

---

## Current Architecture Analysis

### Existing Persistence Layer
The current system uses JSON files stored in `.puffin/`:
- `user-stories.json` - User story data
- `active-sprint.json` - Current sprint
- `sprint-history.json` - Archived sprints
- `story-generations.json` - Story generation tracking
- `config.json` - Project configuration
- `history.json` - Prompt history

### Key Files Affected
- `src/main/puffin-state.js` - Core state manager (2400+ lines)
- `src/main/ipc-handlers.js` - IPC bridge for state operations
- `src/renderer/lib/state-persistence.js` - Renderer-side persistence logic

### Current Data Access Pattern
```
Renderer → IPC → puffin-state.js → fs.readFile/writeFile → JSON files
```

### Target Data Access Pattern
```
Renderer → IPC → Repository Layer → SQLite Database
```

---

## Architecture Design

### New File Structure
```
src/main/
├── database/
│   ├── index.js                 # Database initialization & exports
│   ├── connection.js            # Connection pool manager
│   ├── migrations/
│   │   ├── runner.js            # Migration execution engine
│   │   ├── 001_initial_schema.js
│   │   └── 002_indexes.js
│   └── repositories/
│       ├── base-repository.js   # Shared repository logic
│       ├── user-story-repository.js
│       └── sprint-repository.js
```

### Database Location
- Path: `.puffin/puffin.db` (per-project, not global)
- JSON files kept permanently as backup alongside SQLite
- SQLite chosen for: single-file simplicity, no server, good Electron support

### Multi-Project Architecture
Each project opened in Puffin has its own isolated database:
```
ProjectA/.puffin/puffin.db   ← Separate database
ProjectB/.puffin/puffin.db   ← Separate database
ProjectC/.puffin/puffin.db   ← Separate database
```
- Database is created/opened when `PuffinState.open(projectPath)` is called
- No shared global database - complete project isolation
- Switching projects closes current database and opens new one

---

## Story Dependency Analysis

```
Story 4: Database Migration System
    ↓ (provides schema versioning)
Story 1: SQLite Database Integration
    ↓ (provides database + connection)
Story 2: User Story SQLite Repository
Story 3: Sprint SQLite Repository
    (can run in parallel after Story 1)
```

**Recommended Implementation Order:**
1. **Story 4** - Migration System (foundation for schema management)
2. **Story 1** - SQLite Integration (database setup, JSON migration)
3. **Story 2 & 3** - Repositories (can be done in parallel)

---

## Detailed Implementation Plan

### Story 4: Database Migration System

**Complexity: Medium**

#### Technical Approach
- Create a migration runner that tracks schema versions
- Store migration state in a `_migrations` table
- Migrations are JavaScript files with `up()` and `down()` methods
- Run automatically on application startup

#### Key Files to Create
| File | Purpose |
|------|---------|
| `src/main/database/migrations/runner.js` | Migration execution engine |
| `src/main/database/migrations/001_initial_schema.js` | Initial tables |

#### Implementation Steps
1. Create migration runner class
   - Read `_migrations` table for current version
   - Discover migration files in order
   - Execute pending migrations in transaction
   - Record successful migrations

2. Create initial schema migration
   - Define `_migrations` tracking table
   - Define `user_stories` table
   - Define `sprints` table
   - Define `sprint_stories` junction table

3. Implement rollback capability
   - Each migration has `down()` method
   - Rollback on failure within transaction
   - Log errors for debugging

#### Schema: _migrations Table
```sql
CREATE TABLE _migrations (
  id INTEGER PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

### Story 1: SQLite Database Integration

**Complexity: High**

#### Technical Approach
- Use `better-sqlite3` for synchronous, fast SQLite access
- Implement connection pool for safe concurrent access
- Create database file in `.puffin/` on first run
- Migrate existing JSON data automatically

#### Key Files to Create/Modify
| File | Action | Purpose |
|------|--------|---------|
| `src/main/database/index.js` | Create | Main entry point |
| `src/main/database/connection.js` | Create | Connection management |
| `src/main/puffin-state.js` | Modify | Initialize database |
| `package.json` | Modify | Add better-sqlite3 |

#### Implementation Steps
1. Add `better-sqlite3` dependency
   - Note: Requires native compilation for Electron
   - May need electron-rebuild configuration

2. Create database connection manager
   ```javascript
   class DatabaseConnection {
     constructor(dbPath) { }
     open() { }
     close() { }
     transaction(fn) { }
   }
   ```

3. Integrate with PuffinState
   - Initialize database in `open()` method
   - Run migrations after connection
   - Migrate JSON data on first SQLite run

4. Create JSON migration utility
   - Detect if SQLite database is empty
   - Check for existing JSON files
   - Import data preserving IDs and timestamps
   - Mark migration as complete
   - **Keep JSON files permanently** (do not delete after migration)

#### Database Configuration
```javascript
const config = {
  filename: '.puffin/puffin.db',
  options: {
    verbose: process.env.DEBUG ? console.log : null,
    fileMustExist: false
  }
}
```

#### Connection Lifecycle (Multi-Project Support)
```javascript
class DatabaseConnection {
  constructor() {
    this.db = null
    this.dbPath = null
  }

  // Called when opening a project
  open(projectPath) {
    // Close existing connection if switching projects
    if (this.db) {
      this.close()
    }

    this.dbPath = path.join(projectPath, '.puffin', 'puffin.db')
    this.db = new Database(this.dbPath, options)
    this.db.pragma('journal_mode = WAL')  // Better concurrent access
    this.db.pragma('foreign_keys = ON')   // Enforce referential integrity
  }

  // Called when closing/switching projects
  close() {
    if (this.db) {
      this.db.close()
      this.db = null
      this.dbPath = null
    }
  }
}
```

---

### Story 2: User Story SQLite Repository

**Complexity: Medium**

#### Technical Approach
- Repository pattern for clean separation
- Parameterized queries for SQL injection prevention
- JSON column for acceptance criteria (SQLite supports JSON functions)
- Indexes on frequently queried columns

#### Key Files to Create
| File | Purpose |
|------|---------|
| `src/main/database/repositories/base-repository.js` | Shared CRUD logic |
| `src/main/database/repositories/user-story-repository.js` | Story operations |

#### Schema: user_stories Table
```sql
CREATE TABLE user_stories (
  id TEXT PRIMARY KEY,
  branch_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  acceptance_criteria TEXT, -- JSON array
  status TEXT NOT NULL DEFAULT 'pending',
  source_prompt_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

CREATE INDEX idx_user_stories_status ON user_stories(status);
CREATE INDEX idx_user_stories_sprint ON user_stories(sprint_id);
CREATE INDEX idx_user_stories_created ON user_stories(created_at DESC);
```

#### Repository Interface
```javascript
class UserStoryRepository {
  // CRUD
  create(story) { }
  findById(id) { }
  update(id, updates) { }
  delete(id) { }

  // Queries
  findByStatus(status) { }
  findBySprint(sprintId) { }
  findByDateRange(startDate, endDate) { }
  findPending() { }
  findArchived() { }

  // Batch operations
  updateMany(ids, updates) { }
  archiveOldCompleted(olderThanDays) { }
}
```

#### Implementation Steps
1. Create base repository with common methods
2. Implement user story repository
3. Add JSON handling for acceptance criteria
4. Create indexes for common queries
5. Update PuffinState to use repository
6. Update IPC handlers

---

### Story 3: Sprint SQLite Repository

**Complexity: Medium**

#### Technical Approach
- Foreign keys to user_stories table
- Junction table for many-to-many relationship
- Store plan and progress as JSON columns
- Support for sprint history queries

#### Key Files to Create/Modify
| File | Action | Purpose |
|------|--------|---------|
| `src/main/database/repositories/sprint-repository.js` | Create | Sprint operations |
| `src/main/puffin-state.js` | Modify | Use sprint repository |

#### Schema: sprints Table
```sql
CREATE TABLE sprints (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'planning',
  plan TEXT, -- JSON
  story_progress TEXT, -- JSON
  prompt_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  plan_approved_at TEXT,
  completed_at TEXT,
  closed_at TEXT
);

CREATE TABLE sprint_stories (
  sprint_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sprint_id, story_id),
  FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE CASCADE,
  FOREIGN KEY (story_id) REFERENCES user_stories(id) ON DELETE CASCADE
);

CREATE INDEX idx_sprints_status ON sprints(status);
CREATE INDEX idx_sprints_closed ON sprints(closed_at DESC);
```

#### Repository Interface
```javascript
class SprintRepository {
  // CRUD
  create(sprint) { }
  findById(id) { }
  update(id, updates) { }

  // Sprint-Story relationships
  addStory(sprintId, storyId) { }
  removeStory(sprintId, storyId) { }
  getSprintStories(sprintId) { }

  // Queries
  findActive() { }  // Non-closed sprints
  findArchived(options) { }  // Closed sprints with pagination
  getSprintHistory(options) { }  // All history (no purging, paginated)

  // Progress tracking
  updateProgress(sprintId, storyId, progress) { }
  getProgress(sprintId) { }
}
```

#### Implementation Steps
1. Create sprint repository
2. Implement story relationship management
3. Handle progress tracking with JSON column
4. Support sprint archiving
5. Update PuffinState sprint methods
6. Update IPC handlers

---

## Risk Assessment

### High Risk
| Risk | Mitigation |
|------|------------|
| Native module compilation | Use electron-rebuild, test on all platforms |
| Data loss during migration | JSON files kept permanently as backup |
| Concurrent access issues | Use WAL mode, proper transactions |

### Medium Risk
| Risk | Mitigation |
|------|------------|
| Performance regression | Index common queries, benchmark vs JSON |
| Schema evolution | Migration system handles changes |
| Breaking changes | Version IPC handlers, gradual rollout |

### Low Risk
| Risk | Mitigation |
|------|------------|
| SQLite file corruption | JSON backup always available, WAL mode |
| Large sprint history | Pagination for history queries (no purging) |

---

## Testing Strategy

### Unit Tests
- Repository CRUD operations
- Migration runner logic
- JSON migration utility
- Query filter logic

### Integration Tests
- Full migration from JSON to SQLite
- IPC handler → Repository flow
- Concurrent access scenarios

### Test Files to Create
```
tests/database/
├── connection.test.js
├── migration-runner.test.js
├── user-story-repository.test.js
└── sprint-repository.test.js
```

---

## Complexity Summary

| Story | Complexity | LOC Estimate | Dependencies |
|-------|------------|--------------|--------------|
| Story 4: Migration System | Medium | ~200 | None |
| Story 1: SQLite Integration | High | ~400 | Story 4 |
| Story 2: User Story Repository | Medium | ~250 | Story 1 |
| Story 3: Sprint Repository | Medium | ~300 | Story 1 |
| **Total** | | **~1150** | |

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Add better-sqlite3 to package.json
- [ ] Configure electron-rebuild
- [ ] Create database/index.js entry point
- [ ] Create connection manager
- [ ] Create migration runner
- [ ] Create initial schema migration

### Phase 2: Migration
- [ ] Implement JSON → SQLite migration utility
- [ ] Test migration with sample data
- [ ] Add rollback capability
- [ ] Integrate with PuffinState.open()

### Phase 3: Repositories
- [ ] Create base repository class
- [ ] Implement UserStoryRepository
- [ ] Implement SprintRepository
- [ ] Update PuffinState to use repositories
- [ ] Update IPC handlers

### Phase 4: Verification
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Performance benchmarks
- [ ] Cross-platform testing

---

## Dual-Write Strategy (JSON + SQLite)

To ensure maximum data safety and enable rollback, the system will implement **dual-write**:

### Write Operations
1. Write to SQLite first (primary)
2. Write to JSON file second (backup)
3. Both operations in same logical transaction where possible

### Read Operations
1. Read from SQLite (primary source of truth)
2. JSON files only used for:
   - Initial migration to SQLite
   - Emergency recovery if SQLite corrupted
   - Manual inspection/debugging

### Benefits
- Zero risk of data loss during transition
- Easy rollback if issues discovered
- Human-readable backup always available
- Gradual confidence building in SQLite layer

### Future Consideration
After SQLite has been stable for several releases, JSON writes could be made optional or removed. This is a future decision - for now, always dual-write.
