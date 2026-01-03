# SQLite Phase 2: Complete Read Integration & Transaction Safety

## Executive Summary

This implementation plan covers four user stories that complete the SQLite integration by:
1. Making SQLite the **sole source of truth** for reads (eliminating JSON fallbacks)
2. Adding **transactional safety** for sprint operations
3. Ensuring **automatic status synchronization** between sprint and backlog views
4. Removing the **cache-as-requirement** pattern to make it purely an optimization

---

## Architecture Analysis

### Current State

The codebase has a mature SQLite implementation with:
- **Dual-write**: All writes go to SQLite first, then JSON backup
- **Read fallback**: Reads try SQLite, fall back to JSON on error
- **In-memory cache**: `this.userStories`, `this.archivedStories`, `this.activeSprint`, `this.sprintHistory`
- **Existing transactions**: Repository layer uses `transaction()` wrapper

### Key Observations

| Aspect | Current Implementation | Target State |
|--------|----------------------|--------------|
| **User Story Reads** | SQLite first, JSON fallback | SQLite only (no fallback) |
| **Sprint Reads** | SQLite first, JSON fallback | SQLite only (no fallback) |
| **Sprint History Reads** | JSON primary (`loadSprintHistory`) | SQLite only |
| **Sprint Create** | No explicit transaction | Atomic transaction |
| **Sprint Archive** | Uses transaction | Verify atomicity |
| **Story Completion Sync** | Manual (separate operations) | Automatic in same transaction |
| **Cache Dependency** | Some operations rely on cache | Cache as optimization only |

### Shared Dependencies

All four stories share these components:
- `src/main/puffin-state.js` - Main state manager
- `src/main/database/repositories/sprint-repository.js` - Sprint data access
- `src/main/database/repositories/user-story-repository.js` - Story data access
- `src/main/database/connection.js` - Transaction handling

---

## Implementation Order

```
Story 4: Remove In-Memory Cache Dependency
    |
    v (establishes foundation for direct DB access)
Story 1: Complete SQLite Read Integration
    |
    v (SQLite is now the only read source)
Story 2: Transactional Sprint Operations
    |
    v (sprint operations are atomic)
Story 3: Story Status Synchronization
    (sync happens within sprint transactions)
```

### Rationale for Order

1. **Story 4 first**: Decoupling cache dependency makes the other stories simpler - operations don't need to worry about cache state
2. **Story 1 second**: Once cache isn't a requirement, we can safely remove JSON fallbacks
3. **Story 2 third**: With SQLite as sole source, transactions are meaningful
4. **Story 3 last**: Builds on transactional infrastructure from Story 2

---

## Story 4: Remove In-Memory Cache Dependency

### Complexity: Medium

### Current Problem

Several operations assume cache contains valid data:
- `getUserStories()` returns `this.userStories` directly
- `getArchivedSprint()` falls back to `this.sprintHistory.sprints`
- Write operations update cache after DB write
- If cache becomes stale, operations may return incorrect data

### Technical Approach

**Principle**: Cache is a *performance optimization*, not a *correctness requirement*.

1. **Read-through caching**: All reads go to SQLite first, update cache on read
2. **Cache invalidation on write**: Clear/update cache after writes
3. **Graceful degradation**: If cache is stale, operation still succeeds via DB
4. **Remove cache-first patterns**: No operation should fail because cache is empty

### Key Changes

| Method | Current | Target |
|--------|---------|--------|
| `getUserStories()` | Returns `this.userStories` | Query SQLite, update cache, return |
| `getArchivedSprint()` | Cache fallback | SQLite only |
| `loadUserStories()` | Populates cache on open | Lazy-load on first access |
| Error handling | Cache assumed valid | Handle cache miss gracefully |

### Files to Modify

| File | Changes |
|------|---------|
| `src/main/puffin-state.js` | Refactor getter methods to query DB, update cache |
| (No new files needed) | |

### Implementation Steps

1. **Add SQLite-first getters**
   - `getUserStories()`: Query `database.userStories.findAll()`, cache result
   - `getArchivedStories()`: Query `database.userStories.findArchived()`, cache result
   - `getActiveSprint()`: Query `database.sprints.findActive()`, cache result

2. **Add cache invalidation helpers**
   ```javascript
   _invalidateUserStoriesCache() {
     this.userStories = null
     this.archivedStories = null
   }

   _invalidateSprintCache() {
     this.activeSprint = null
     this.sprintHistory = null
   }
   ```

3. **Update write operations to invalidate cache**
   - After `addUserStory()`, `updateUserStory()`, `deleteUserStory()`
   - After `saveActiveSprint()`, `archiveSprintToHistory()`

4. **Remove cache-assumed patterns**
   - Find all `this.userStories.find()` calls and replace with repository queries
   - Find all direct cache array manipulations

### Acceptance Criteria Verification

| Criteria | How Verified |
|----------|--------------|
| CRUD works with empty cache | Unit test: clear cache, perform operation, verify success |
| Cache failures don't cause operation failures | Test: mock cache error, verify operation completes |
| Cache populated from SQLite reads | Test: verify cache updated after SQLite query |
| App functions after cache invalidation | Integration test: invalidate, then use app |

---

## Story 1: Complete SQLite Read Integration

### Complexity: Medium

### Current Problem

Read operations have JSON fallbacks that create inconsistency risk:
```javascript
// Current pattern in loadActiveSprint()
if (this.useSqlite && this.database.isInitialized()) {
  try {
    return this.database.sprints.findActive()  // SQLite
  } catch (error) {
    // Fall through to JSON
  }
}
return JSON.parse(await fs.readFile(...))  // JSON fallback
```

If SQLite has newer data but JSON has stale data, a fallback would return wrong state.

### Technical Approach

**Principle**: SQLite is the single source of truth. JSON is backup only (for disaster recovery).

1. **Remove all JSON fallback reads**
2. **Fail fast on SQLite errors** (surface problems immediately)
3. **Keep JSON writes** for backup purposes
4. **Add startup integrity check** to verify SQLite matches JSON

### Key Changes

| Method | Current | Target |
|--------|---------|--------|
| `loadUserStories()` | SQLite then JSON | SQLite only |
| `loadArchivedStories()` | SQLite then JSON | SQLite only |
| `loadActiveSprint()` | SQLite then JSON | SQLite only |
| `loadSprintHistory()` | JSON primary | SQLite only |
| `getSprintHistory()` | SQLite with JSON fallback | SQLite only |
| `getArchivedSprint()` | SQLite with cache fallback | SQLite only |

### Files to Modify

| File | Changes |
|------|---------|
| `src/main/puffin-state.js` | Remove JSON fallback logic from all load methods |

### Implementation Steps

1. **Simplify `loadUserStories()`**
   ```javascript
   async loadUserStories() {
     if (!this.database.isInitialized()) {
       throw new Error('Database not initialized')
     }
     return this.database.userStories.findAll()
   }
   ```

2. **Simplify `loadArchivedStories()`**
   ```javascript
   async loadArchivedStories() {
     if (!this.database.isInitialized()) {
       throw new Error('Database not initialized')
     }
     return this.database.userStories.findArchived()
   }
   ```

3. **Simplify `loadActiveSprint()`**
   ```javascript
   async loadActiveSprint() {
     if (!this.database.isInitialized()) {
       throw new Error('Database not initialized')
     }
     return this.database.sprints.findActive()
   }
   ```

4. **Convert `loadSprintHistory()` to SQLite**
   ```javascript
   async loadSprintHistory() {
     if (!this.database.isInitialized()) {
       throw new Error('Database not initialized')
     }
     const sprints = this.database.sprints.findArchived()
     return {
       sprints,
       createdAt: new Date().toISOString(),
       updatedAt: new Date().toISOString()
     }
   }
   ```

5. **Remove `_loadUserStoriesFromJson()` usage**
   - Keep method for potential manual recovery
   - Remove from normal load path

6. **Add database initialization guard**
   - Ensure `open()` throws if database fails to initialize
   - Remove `this.useSqlite = false` fallback logic

### Acceptance Criteria Verification

| Criteria | How Verified |
|----------|--------------|
| All story reads from SQLite | Code review: no `_loadUserStoriesFromJson()` calls in normal path |
| All sprint reads from SQLite | Code review: no JSON.parse for sprint files in load path |
| JSON used only as backup | Grep for JSON reads, verify only in recovery/backup methods |
| App loads correctly with SQLite | Integration test: fresh project, open, verify data |

---

## Story 2: Transactional Sprint Operations

### Complexity: Medium

### Current Problem

Sprint creation and archive are partially transactional:
- `SprintRepository.create()` wraps insert + story relations in transaction
- `SprintRepository.archive()` wraps history insert + deletes in transaction
- But `PuffinState` methods do multiple operations that aren't atomic:

```javascript
// Current createSprint() pattern (not shown but inferred)
// 1. Create sprint in DB
// 2. Update in-memory cache
// 3. Backup to JSON
// If step 2 or 3 fails, step 1 is already committed
```

### Technical Approach

**Principle**: All related database operations in a single transaction; cache/JSON updates outside.

1. **Wrap related DB operations in `immediateTransaction()`**
2. **Separate concerns**: DB transaction first, then cache, then JSON backup
3. **Rollback on DB failure** (natural with transaction)
4. **Log but don't fail on JSON backup failure** (it's just backup)

### Key Changes

| Operation | Current | Target |
|-----------|---------|--------|
| Sprint Creation | Partial transaction | Full transaction for all DB ops |
| Sprint Archive | Partial transaction | Full transaction including story status updates |
| Story-Sprint linking | Separate inserts | Part of create transaction |

### Files to Modify

| File | Changes |
|------|---------|
| `src/main/database/repositories/sprint-repository.js` | Verify transactions are comprehensive |
| `src/main/puffin-state.js` | Ensure calling code handles transaction failures |

### Implementation Steps

1. **Audit `SprintRepository.create()`**
   - Verify it wraps all operations in transaction
   - Currently does: insert sprint + add story relationships ✓

2. **Audit `SprintRepository.archive()`**
   - Currently wraps: insert history + delete relationships + delete sprint ✓
   - Need to add: update story statuses in same transaction

3. **Add transaction wrapper to `PuffinState.archiveSprintToHistory()`**
   ```javascript
   async archiveSprintToHistory(sprint) {
     const archived = this.database.sprints.archive(sprint.id)
     // Cache and JSON updates happen after transaction commits
     if (archived) {
       this._invalidateSprintCache()
       await this._saveSprintHistoryToJson()
     }
     return archived
   }
   ```

4. **Add rollback handling**
   - Repository already rolls back on error (via `transaction()`)
   - PuffinState should not catch and swallow transaction errors

5. **Create composite transaction for sprint + stories**
   ```javascript
   // In SprintRepository
   archiveWithStorySync(id, storyStatusUpdates) {
     return this.immediateTransaction(() => {
       // 1. Archive sprint
       const archived = this._archiveSprint(id)
       // 2. Update story statuses
       for (const [storyId, status] of storyStatusUpdates) {
         this._updateStoryStatus(storyId, status)
       }
       return archived
     })
   }
   ```

### Acceptance Criteria Verification

| Criteria | How Verified |
|----------|--------------|
| Sprint creation in single transaction | Code review: all ops in `transaction()` block |
| Sprint archive in single transaction | Code review: all ops in `transaction()` block |
| Failed ops roll back completely | Test: force error mid-transaction, verify no partial state |
| Successful ops commit atomically | Test: verify all-or-nothing behavior |

---

## Story 3: Story Status Synchronization

### Complexity: Low-Medium

### Current Problem

When a story is marked complete in sprint view, the backlog status update is a separate operation:
```javascript
// Current flow (inferred)
1. Update sprint.storyProgress[storyId].status = 'completed'
2. saveActiveSprint()  // Writes sprint to DB
3. (Separate) updateUserStory(storyId, { status: 'completed' })  // Writes story to DB
```

If step 3 fails, sprint shows complete but backlog shows in-progress.

### Technical Approach

**Principle**: Story status changes during sprint work happen in the same transaction.

1. **Extend `updateStoryProgress` to include user_stories table update**
2. **Use transaction to ensure atomicity**
3. **Emit events for UI refresh** (so views update without manual refresh)

### Key Changes

| Operation | Current | Target |
|-----------|---------|--------|
| Mark story complete | Updates sprint only | Updates sprint + user_stories atomically |
| Mark story incomplete | Updates sprint only | Updates sprint + user_stories atomically |
| UI refresh | Manual | Automatic (event-driven) |

### Files to Modify

| File | Changes |
|------|---------|
| `src/main/database/repositories/sprint-repository.js` | Add user story update to progress methods |
| `src/main/puffin-state.js` | Call new method, emit refresh event |
| `src/main/ipc-handlers.js` | Add event emission for story sync |

### Implementation Steps

1. **Add combined update method to `SprintRepository`**
   ```javascript
   updateStoryProgressWithSync(sprintId, storyId, branchType, progressUpdate, userStoryRepo) {
     return this.immediateTransaction(() => {
       // Update sprint progress
       const sprint = this.updateStoryProgress(sprintId, storyId, branchType, progressUpdate)

       // If story is now complete, update user_stories
       if (sprint.storyProgress[storyId]?.status === 'completed') {
         userStoryRepo.updateStatus(storyId, 'completed')
       }

       return sprint
     })
   }
   ```

2. **Update `PuffinState.updateSprintStoryProgress()`**
   ```javascript
   async updateSprintStoryProgress(storyId, branchType, progressUpdate) {
     const updated = this.database.sprints.updateStoryProgressWithSync(
       this.activeSprint.id,
       storyId,
       branchType,
       progressUpdate,
       this.database.userStories
     )

     // Invalidate caches
     this._invalidateSprintCache()
     this._invalidateUserStoriesCache()

     // Emit event for UI refresh
     this._emitStoryStatusChanged(storyId, updated.storyProgress[storyId]?.status)

     return { success: true, sprint: updated }
   }
   ```

3. **Add manual story completion method for sprint view**
   ```javascript
   async markSprintStoryComplete(storyId) {
     return this.database.connection.immediateTransaction(() => {
       // Mark in sprint
       const sprint = this.database.sprints.markStoryComplete(this.activeSprint.id, storyId)
       // Mark in backlog
       this.database.userStories.updateStatus(storyId, 'completed')
       return sprint
     })
   }
   ```

4. **Handle marking story incomplete**
   ```javascript
   async markSprintStoryIncomplete(storyId) {
     return this.database.connection.immediateTransaction(() => {
       // Mark in sprint
       const sprint = this.database.sprints.markStoryIncomplete(this.activeSprint.id, storyId)
       // Mark in backlog
       this.database.userStories.updateStatus(storyId, 'in-progress')
       return sprint
     })
   }
   ```

5. **Add IPC event emission**
   ```javascript
   _emitStoryStatusChanged(storyId, status) {
     if (this.mainWindow) {
       this.mainWindow.webContents.send('story-status-changed', { storyId, status })
     }
   }
   ```

### Acceptance Criteria Verification

| Criteria | How Verified |
|----------|--------------|
| Complete in sprint updates backlog | Test: mark complete, verify both views show complete |
| Incomplete in sprint updates backlog | Test: mark incomplete, verify both views show in-progress |
| No manual refresh required | Test: change status, verify UI updates automatically |
| Status changes are atomic | Test: force error, verify no inconsistent state |

---

## Risk Assessment

### High Risk
| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Comprehensive test coverage before changes |
| Data loss during transition | JSON backups always maintained |
| Performance regression | Benchmark read operations before/after |

### Medium Risk
| Risk | Mitigation |
|------|------------|
| Cache invalidation bugs | Aggressive invalidation (better to re-query than serve stale) |
| Transaction deadlocks | Use `immediateTransaction()` for write-heavy operations |
| Error handling gaps | Add try-catch with logging at PuffinState layer |

### Low Risk
| Risk | Mitigation |
|------|------------|
| JSON backup drift | Consider periodic JSON sync in background |
| Event delivery failures | UI should handle missing events gracefully |

---

## Testing Strategy

### Unit Tests (per story)

**Story 4: Cache Independence**
- Test: Clear cache, call `getUserStories()`, verify returns from DB
- Test: Corrupt cache, call operation, verify uses DB
- Test: Call `_invalidateUserStoriesCache()`, verify next read queries DB

**Story 1: SQLite-Only Reads**
- Test: Verify no JSON file reads in normal load path
- Test: Corrupt JSON, verify app still loads from SQLite
- Test: Database not initialized throws error (not silent fallback)

**Story 2: Transactional Operations**
- Test: Create sprint with stories, verify atomic
- Test: Force error in create, verify no partial data
- Test: Archive sprint, verify all related updates atomic

**Story 3: Status Synchronization**
- Test: Mark story complete in sprint, verify backlog updated
- Test: Mark story incomplete, verify both views sync
- Test: Force error mid-sync, verify rollback

### Integration Tests

1. **Full lifecycle test**
   - Create project
   - Add stories
   - Create sprint
   - Progress stories
   - Complete stories
   - Archive sprint
   - Verify all state consistent

2. **Failure recovery test**
   - Simulate DB errors at various points
   - Verify app recovers gracefully
   - Verify no data corruption

### Test Files to Create/Modify

| File | Purpose |
|------|---------|
| `tests/database/cache-independence.test.js` | Story 4 tests |
| `tests/database/sqlite-only-reads.test.js` | Story 1 tests |
| `tests/database/sprint-transactions.test.js` | Story 2 tests |
| `tests/database/story-sync.test.js` | Story 3 tests |
| `tests/integration/sprint-lifecycle.test.js` | Full lifecycle |

---

## Complexity Summary

| Story | Complexity | Estimated Changes | Key Risk |
|-------|------------|-------------------|----------|
| Story 4: Cache Independence | Medium | ~150 lines | Cache invalidation bugs |
| Story 1: SQLite-Only Reads | Medium | ~100 lines | Breaking fallback safety |
| Story 2: Transactional Operations | Medium | ~75 lines | Transaction scope errors |
| Story 3: Status Synchronization | Low-Medium | ~100 lines | Event delivery |
| **Total** | | **~425 lines** | |

---

## Implementation Checklist

### Phase 1: Story 4 - Cache Independence
- [ ] Add `_invalidateUserStoriesCache()` method
- [ ] Add `_invalidateSprintCache()` method
- [ ] Refactor `getUserStories()` to query DB first
- [ ] Refactor `getArchivedStories()` to query DB first
- [ ] Update write operations to call invalidation helpers
- [ ] Add unit tests for cache independence
- [ ] Verify existing tests still pass

### Phase 2: Story 1 - SQLite-Only Reads
- [ ] Remove JSON fallback from `loadUserStories()`
- [ ] Remove JSON fallback from `loadArchivedStories()`
- [ ] Remove JSON fallback from `loadActiveSprint()`
- [ ] Convert `loadSprintHistory()` to SQLite
- [ ] Remove `this.useSqlite = false` fallback logic
- [ ] Add database initialization guard
- [ ] Add unit tests for SQLite-only reads
- [ ] Test with corrupted JSON to verify no fallback

### Phase 3: Story 2 - Transactional Operations
- [ ] Audit `SprintRepository.create()` transaction scope
- [ ] Audit `SprintRepository.archive()` transaction scope
- [ ] Add composite transaction method if needed
- [ ] Update `PuffinState` error handling
- [ ] Add unit tests for transaction atomicity
- [ ] Test rollback on failure

### Phase 4: Story 3 - Status Synchronization
- [ ] Add `updateStoryProgressWithSync()` to SprintRepository
- [ ] Update `PuffinState.updateSprintStoryProgress()` to use new method
- [ ] Add `markSprintStoryComplete()` method
- [ ] Add `markSprintStoryIncomplete()` method
- [ ] Add IPC event emission for UI refresh
- [ ] Add unit tests for synchronization
- [ ] Test complete workflow end-to-end

### Phase 5: Verification
- [ ] Run full test suite
- [ ] Manual testing of sprint workflow
- [ ] Performance benchmarks
- [ ] Code review

---

## Appendix: Current Code Locations

### puffin-state.js Key Methods

| Method | Line | Purpose |
|--------|------|---------|
| `loadUserStories()` | ~1752 | Load stories from SQLite or JSON |
| `loadArchivedStories()` | ~1830 | Load archived stories |
| `loadActiveSprint()` | ~2056 | Load active sprint |
| `loadSprintHistory()` | ~2135 | Load sprint history (JSON primary!) |
| `getUserStories()` | ~497 | Return cached stories |
| `addUserStory()` | ~298 | Create story with dual-write |
| `updateUserStory()` | ~359 | Update story with cache sync |
| `saveActiveSprint()` | ~2085 | Save sprint with dual-write |
| `archiveSprintToHistory()` | ~2165 | Archive sprint |
| `updateSprintStoryProgress()` | ~2270 | Update story progress in sprint |

### Repository Methods

| Method | File | Purpose |
|--------|------|---------|
| `SprintRepository.create()` | sprint-repository.js:116 | Create sprint with transaction |
| `SprintRepository.archive()` | sprint-repository.js:517 | Archive sprint with transaction |
| `SprintRepository.updateStoryProgress()` | sprint-repository.js:371 | Update story progress |
| `UserStoryRepository.update()` | user-story-repository.js | Update story fields |
| `UserStoryRepository.updateStatus()` | user-story-repository.js | Update story status |
