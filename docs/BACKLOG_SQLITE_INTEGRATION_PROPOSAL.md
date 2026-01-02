# Backlog SQLite Integration Proposal

## Executive Summary

This proposal outlines the work needed to **fully connect** Puffin's backlog (user stories + sprint management) to the SQLite database. The SQLite infrastructure is already implemented and partially integrated. This phase focuses on completing the integration and eliminating the remaining data loss vulnerabilities.

---

## Current State Analysis

### What's Already Done

| Component | Status | Notes |
|-----------|--------|-------|
| SQLite database (`better-sqlite3`) | **Complete** | Initialized in `.puffin/puffin.db` |
| Migration system | **Complete** | Schema versioned, migrations run on startup |
| `UserStoryRepository` | **Complete** | Full CRUD, archive/restore, search, bulk operations |
| `SprintRepository` | **Complete** | Full CRUD, story relationships, progress tracking |
| Dual-write (SQLite + JSON) | **Partial** | Some methods write to both, some only JSON |
| `puffin-state.js` integration | **Partial** | Uses repositories when `useSqlite=true` |
| Renderer persistence | **Not Integrated** | Still uses IPC → in-memory → JSON pattern |

### Current Data Flow (Problematic Areas)

```
Renderer (SAM Model)
    │
    ▼
StatePersistence.persist()
    │
    ├──► window.puffin.state.addUserStory()
    ├──► window.puffin.state.updateUserStory()
    ├──► window.puffin.state.updateActiveSprint()
    └──► window.puffin.state.archiveSprintToHistory()
    │
    ▼
IPC Handlers (ipc-handlers.js)
    │
    ▼
PuffinState Methods
    │
    ├──► SQLite Repository (if useSqlite=true)  ✓
    ├──► In-memory cache update                  ✓
    └──► JSON backup write                       ⚠️ (async, can fail silently)
```

### Identified Data Loss Vulnerabilities

| Vulnerability | Location | Severity | Root Cause |
|---------------|----------|----------|------------|
| **Race conditions during sprint clear** | `state-persistence.js:183-262` | **HIGH** | 5+ async operations without transaction |
| **Empty array protection bypassed** | `state-persistence.js:244-247` | **MEDIUM** | Protects against empty, not partial loss |
| **In-memory cache desync** | `puffin-state.js` various | **MEDIUM** | SQLite write success, cache update fails |
| **Sprint stories not in junction table** | `puffin-state.js:2097` | **LOW** | Creates sprint but may fail to link stories |
| **JSON backup async failure** | All save methods | **LOW** | Silent failure on JSON write |

---

## Proposed Architecture

### Target Data Flow

```
Renderer (SAM Model)
    │
    ▼
StatePersistence.persist()
    │
    ▼
IPC Handler (single call per action)
    │
    ▼
PuffinState Method
    │
    ▼
SQLite Transaction (atomic)
    ├──► Repository operations
    ├──► In-memory cache update (inside transaction)
    └──► Return result
    │
    ▼ (on success)
JSON Backup (non-blocking, fire-and-forget)
```

### Key Architectural Changes

1. **SQLite as Single Source of Truth**
   - All reads come from SQLite
   - In-memory cache is populated from SQLite on load
   - JSON backup is non-critical (for debugging/recovery only)

2. **Transaction Boundaries**
   - Sprint creation: Create sprint + link stories in single transaction
   - Sprint archive: Archive sprint + update story statuses in single transaction
   - Story status updates: Update story + notify sprint in single transaction

3. **Simplified Renderer Persistence**
   - One IPC call per logical operation
   - No multi-step orchestration in renderer
   - Backend handles all related updates atomically

---

## User Stories for Implementation

### Story 1: Complete SQLite Read Integration
**As a** developer
**I want** all backlog reads to come from SQLite
**So that** the data source is consistent and reliable

**Acceptance Criteria:**
1. `loadUserStories()` always reads from SQLite (removes JSON fallback as primary)
2. `loadActiveSprint()` always reads from SQLite
3. `loadSprintHistory()` always reads from SQLite
4. `getArchivedStories()` always reads from SQLite
5. In-memory cache is populated from SQLite results
6. JSON files are only used for initial migration (first run) and backup

**Technical Notes:**
- Modify `puffin-state.js` load methods to prioritize SQLite
- Remove conditional `if (this.useSqlite)` checks where possible
- Add proper error handling with user-facing notifications

---

### Story 2: Transactional Sprint Operations
**As a** developer
**I want** sprint creation and archival to be atomic transactions
**So that** partial failures don't leave data in inconsistent states

**Acceptance Criteria:**
1. `createSprint()` creates sprint + links stories in single transaction
2. `archiveSprintToHistory()` archives sprint + updates story statuses atomically
3. Transaction rollback on any failure
4. In-memory cache only updated after transaction commits
5. IPC returns clear success/failure with error details

**Technical Notes:**
- Use `SprintRepository.transaction()` wrapper
- Create new method `createSprintWithStories(sprint, storyIds)` in repository
- Create new method `archiveSprintWithStoryUpdates(sprintId, storyUpdates)` in repository

---

### Story 3: Simplify Renderer State Persistence
**As a** developer
**I want** `StatePersistence.persist()` to make single IPC calls
**So that** the renderer doesn't orchestrate complex multi-step operations

**Acceptance Criteria:**
1. `CLEAR_SPRINT` action triggers single `archiveSprintComplete()` IPC call
2. Backend handles: archive sprint, update completed stories, reset pending stories
3. Frontend receives updated state in response (not via separate refresh calls)
4. Remove `_sprintToArchive`, `_completedStoryIdsToSync`, `_resetToPendingStoryIds` workarounds
5. Reduce sprint clear from 5+ async operations to 1

**Technical Notes:**
- Create new IPC handler `state:archiveSprintComplete` that does all work atomically
- Return `{ success, archivedSprint, updatedStories, sprintHistory }` in response
- Update `state-persistence.js` to use new handler

---

### Story 4: Story Status Synchronization
**As a** developer
**I want** story status changes to be synchronized between sprints and backlog
**So that** completing a story in a sprint reflects in the backlog immediately

**Acceptance Criteria:**
1. Marking all branches complete on a story updates story status to `completed`
2. Story status change is written to SQLite in same transaction as sprint progress
3. Backlog UI reflects status change without manual refresh
4. Archiving a story removes it from active sprint (if any)
5. Status changes are idempotent (can be replayed safely)

**Technical Notes:**
- Add `storyId` field to sprint progress update IPC response
- Repository method `updateStoryProgressWithStatusSync()`
- Use SQLite triggers or repository logic for cascading updates

---

### Story 5: Data Integrity Verification
**As a** developer
**I want** a verification system to detect and report data inconsistencies
**So that** potential issues are caught before they cause data loss

**Acceptance Criteria:**
1. Startup verification checks SQLite vs JSON consistency
2. Log warnings for mismatched story counts
3. Log warnings for orphaned sprint-story relationships
4. Provide CLI or debug command to run full integrity check
5. Automatic recovery: prefer SQLite data when inconsistency detected

**Technical Notes:**
- Create `IntegrityChecker` class in database module
- Run lightweight check on startup (counts only)
- Full check available via debug menu/command
- Recovery strategy: SQLite is authoritative, JSON is backup

---

### Story 6: Remove In-Memory Cache Dependency
**As a** developer
**I want** operations to work directly with SQLite without relying on in-memory cache
**So that** cache desync cannot cause data loss

**Acceptance Criteria:**
1. `addUserStory()` reads back from SQLite after create (already done)
2. `updateUserStory()` reads back from SQLite after update (already done)
3. Sprint operations read back from SQLite after modification
4. In-memory cache is optional optimization, not required for correctness
5. Cache refresh can be triggered without data loss risk

**Technical Notes:**
- Most repository methods already return the updated entity
- Ensure all IPC handlers return the persisted data, not cached data
- Add `refreshCache()` method for explicit cache synchronization

---

## Implementation Order

```
Story 1 ──────────────────────────────────────►
(SQLite Reads)                                  |
    │                                           |
    ▼                                           |
Story 5 ──────────────────────────────────────►|
(Integrity Check)                               |
    │                                           |
    ▼                                           |
Story 2 ─────────────────────────────►         |
(Transactional Sprints)                |        |
    │                                  |        |
    ▼                                  ▼        ▼
Story 4 ─────────────────►        Story 3 ─────►
(Status Sync)             |       (Simple Persist)
    │                     |            │
    ▼                     ▼            ▼
Story 6 ──────────────────────────────►
(Remove Cache Dependency)
```

### Rationale

1. **Story 1 (SQLite Reads)** - Foundation: ensure we're reading from the right place
2. **Story 5 (Integrity Check)** - Safety net before making more changes
3. **Story 2 (Transactional Sprints)** - Core reliability improvement
4. **Story 4 (Status Sync)** - Depends on transactional foundation
5. **Story 3 (Simple Persist)** - Simplifies renderer after backend is solid
6. **Story 6 (Remove Cache)** - Final cleanup after all else is stable

---

## Risk Assessment

### High Risk
| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing functionality | Users lose current sprints/stories | Extensive testing, staged rollout |
| Transaction deadlocks | App freezes | Use short transactions, timeout handling |
| Migration from partial state | Data corruption | Full backup before upgrade |

### Medium Risk
| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance regression | Slower UI | Profile critical paths, optimize queries |
| JSON backup desync | Recovery harder | Log warnings, periodic sync check |

### Low Risk
| Risk | Impact | Mitigation |
|------|--------|------------|
| SQLite file corruption | Data loss | WAL mode, periodic backup copy |

---

## Technical Specifications

### New IPC Handlers

#### `state:archiveSprintComplete`

**Request:**
```javascript
{
  sprintId: string,
  completedStoryIds: string[],   // Stories to mark as completed
  resetToPendingIds: string[]    // Stories to reset to pending
}
```

**Response:**
```javascript
{
  success: boolean,
  archivedSprint: Sprint | null,
  updatedStories: Story[],
  sprintHistory: Sprint[],
  error?: string
}
```

**Implementation:**
```javascript
// Pseudo-code
async archiveSprintComplete(sprintId, completedIds, resetIds) {
  return database.transaction(() => {
    // 1. Archive sprint
    const archived = sprintRepo.archive(sprintId)

    // 2. Update completed stories
    for (const id of completedIds) {
      storyRepo.updateStatus(id, 'completed')
    }

    // 3. Reset pending stories
    for (const id of resetIds) {
      storyRepo.updateStatus(id, 'pending')
    }

    // 4. Get updated state
    return {
      archivedSprint: archived,
      updatedStories: storyRepo.findByIds([...completedIds, ...resetIds]),
      sprintHistory: sprintRepo.findArchived({ limit: 50 })
    }
  })
}
```

### Database Schema Additions

None required - existing schema is sufficient.

### Files to Modify

| File | Changes |
|------|---------|
| `src/main/puffin-state.js` | Add transactional methods, simplify load methods |
| `src/main/ipc-handlers.js` | Add `archiveSprintComplete` handler |
| `src/main/database/repositories/sprint-repository.js` | Add `archiveWithStoryUpdates()` |
| `src/renderer/lib/state-persistence.js` | Simplify sprint clear logic |
| `src/main/database/integrity-checker.js` | **New file** - integrity verification |

### Files to Create

| File | Purpose |
|------|---------|
| `src/main/database/integrity-checker.js` | Data integrity verification |
| `tests/database/integrity-checker.test.js` | Tests for integrity checker |
| `tests/database/transactional-operations.test.js` | Tests for atomic operations |

---

## Complexity Assessment

| Story | Complexity | Effort | Risk |
|-------|------------|--------|------|
| Story 1: SQLite Reads | **Low** | 2-3 hours | Low |
| Story 2: Transactional Sprints | **Medium** | 4-6 hours | Medium |
| Story 3: Simplify Persist | **Medium** | 3-4 hours | Low |
| Story 4: Status Sync | **Medium** | 3-4 hours | Medium |
| Story 5: Integrity Check | **Low** | 2-3 hours | Low |
| Story 6: Remove Cache | **Low** | 2-3 hours | Low |
| **Total** | | **16-23 hours** | |

---

## Success Criteria

1. **Zero data loss** during sprint operations (archive, clear, create)
2. **Single source of truth** - SQLite is authoritative, JSON is backup
3. **Atomic operations** - No partial state from failed operations
4. **Simplified renderer** - One IPC call per user action
5. **Verified integrity** - Startup check confirms data consistency
6. **Comprehensive tests** - All transactional operations have test coverage

---

## Migration Strategy

### Pre-Migration
1. Backup `.puffin/` directory
2. Export current stories/sprints to JSON (already done by dual-write)

### Migration
1. Deploy code changes
2. On first startup, integrity checker runs
3. If inconsistencies found, prefer SQLite data
4. Log all recovery actions

### Rollback Plan
1. Keep JSON files permanently
2. If issues discovered, can revert to JSON-only mode
3. `useSqlite = false` flag disables SQLite entirely

---

## Open Questions

1. **Notification Strategy**: Should data integrity issues show toast notifications to users?
2. **Backup Frequency**: Should we copy `.db` file periodically (e.g., daily)?
3. **Debug UI**: Should there be a UI panel showing database health/stats?

---

## Appendix: Current Code References

### User Story Operations
- `puffin-state.js:298-492` - CRUD operations with SQLite integration
- `user-story-repository.js` - Complete repository implementation

### Sprint Operations
- `puffin-state.js:2056-2400` - Sprint load/save/archive/progress
- `sprint-repository.js` - Complete repository implementation

### Renderer Persistence
- `state-persistence.js:158-278` - Sprint action handling (problematic area)
- `state-persistence.js:244-261` - Safety checks (need enhancement)

---

*This proposal is ready for review. Please confirm the approach or request modifications before implementation begins.*
