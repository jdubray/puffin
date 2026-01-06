Now I have a complete picture. Let me create the comprehensive refactoring plan.

---

# Sprint/User Story Persistence Refactoring Plan

## Executive Summary

After thorough analysis, I've identified **16 distinct issues** across the sprint/user story persistence layer. The bugs stem from:

1. **Non-atomic operations** - Sprint archive and story status updates are performed separately
2. **State synchronization gaps** - UI state and database get out of sync
3. **Missing validation** - Story IDs not validated when creating sprints
4. **Race conditions** - TOCTOU bugs in repository methods
5. **Data loss scenarios** - Deleted stories leave orphaned references

---

## Workflow Requirements (Per Your Description)

| Step | Current State | Issues |
|------|---------------|--------|
| 1. Create user stories from specs → pending status in backlog | Works | Stories sometimes disappear on reload |
| 2. Add user stories to sprint | Works | Sprint sometimes saves without title |
| 3. Save sprint (only one active at a time) | Partially works | Title not persisted on CREATE_SPRINT |
| 4. Close sprint → stories return to backlog with correct status | Partially works | Non-atomic: crash mid-close = corrupt state |

---

## Root Cause Analysis

### Issue 1: Sprint Title Never Saved on Creation

**Location:** `src/renderer/sam/model.js:1885-1893`

```javascript
// model.activeSprint is created WITHOUT title
model.activeSprint = {
  id: sprintId,
  stories: sprintStories,
  status: 'created',
  storyProgress: {},
  promptId: null,
  plan: null,
  createdAt: timestamp
  // NO TITLE FIELD!
}
```

**Problem:** Sprint is created without `title` field. Title is only added when *closing* the sprint via `CLEAR_SPRINT_WITH_DETAILS`. Until then, sprint displays show "Sprint {shortId}" fallback.

---

### Issue 2: Sprint Closure Is Non-Atomic (CRITICAL)

**Location:** `src/renderer/lib/state-persistence.js:307-389`

**Sequence of operations:**
1. Archive sprint to history (line 316)
2. Update completed stories to `completed` status (lines 333-343)
3. Update incomplete stories to `pending` status (lines 348-358)
4. Refresh user stories from database (lines 363-388)

**Problem:** If crash/error occurs between steps 1 and 2, the sprint is archived but stories have wrong status. The operations should be in a single transaction.

---

### Issue 3: TOCTOU Bug in syncStoryStatus

**Location:** `src/main/database/repositories/sprint-repository.js:486-567`

```javascript
// Line 490 - READ outside transaction
const sprint = this.findById(sprintId)

// Lines 501-567 - Transaction starts HERE
return this.immediateTransaction(() => {
  const storyProgress = sprint.storyProgress || {}  // Uses stale data
  // ...
})
```

**Problem:** Sprint is read before transaction starts. Another process could modify it between read and transaction.

---

### Issue 4: User Stories Disappear on Reload

**Root Causes:**
1. Safety check at lines 371-373 refuses to load when story count drops
2. But console logs show the data IS correct in database
3. The `loadUserStories` intent may have bugs in SAM model

**Location:** `src/renderer/lib/state-persistence.js:371-382`

---

### Issue 5: Stories in Sprint Can Reference Deleted Stories

**Location:** `src/main/database/migrations/001_initial_schema.js:84-85`

```sql
FOREIGN KEY (story_id) REFERENCES user_stories(id) ON DELETE CASCADE
```

**Problem:** When a story is deleted, the junction table row is removed, but `sprint.storyProgress[deletedStoryId]` remains, creating orphaned references.

---

### Issue 6: No Validation of Story IDs at Sprint Creation

**Location:** `src/main/database/repositories/sprint-repository.js:171-172`

```javascript
if (storyIds.length > 0) {
  this._addStoriesToSprint(row.id, storyIds)  // Uses INSERT OR IGNORE
}
```

**Problem:** `INSERT OR IGNORE` silently skips non-existent story IDs. Sprint appears to have stories but queries return fewer.

---

### Issue 7: Backlog Status Not Synced When Story Updated Directly

**Scenario:**
1. Story is in active sprint with status `in-progress`
2. User marks story complete in backlog view (not sprint view)
3. Sprint still shows story as incomplete
4. Sprint closure may reset the story to `pending`

**Problem:** No bidirectional sync between `user_stories.status` and `sprint.storyProgress[id].status`.

---

## Recommended Architecture Changes

### Change 1: Introduce SprintService Layer

Create a service that orchestrates sprint operations atomically:

```
┌─────────────────────────────────────────────────────────────┐
│                      SprintService                           │
├─────────────────────────────────────────────────────────────┤
│  createSprint(stories, title?)                               │
│  closeSprint(sprintId, title, description)                   │
│  addStoryToSprint(sprintId, storyId)                         │
│  removeStoryFromSprint(sprintId, storyId)                    │
│  updateStoryStatus(sprintId, storyId, status)                │
│  archiveSprint(sprintId)  // moves to history atomically     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Atomic Transactions                       │
├─────────────────────────────────────────────────────────────┤
│  All operations use immediateTransaction()                   │
│  Story status updates happen WITHIN sprint operations        │
│  No separate calls to update stories after sprint changes    │
└─────────────────────────────────────────────────────────────┘
```

---

### Change 2: Atomic Sprint Close Operation

New method in `sprint-repository.js`:

```javascript
/**
 * Close a sprint atomically:
 * 1. Update all story statuses based on progress
 * 2. Archive sprint to history with inline stories
 * 3. Delete from active sprints
 * 
 * All in ONE transaction - no partial state possible.
 */
closeAndArchive(sprintId, title, description, userStoryRepo) {
  return this.immediateTransaction(() => {
    // 1. Read current sprint WITH lock
    const sprint = this.findById(sprintId)
    if (!sprint) throw new Error('Sprint not found')
    
    // 2. Update story statuses in user_stories table
    for (const story of sprint.stories) {
      const progress = sprint.storyProgress[story.id]
      const newStatus = progress?.status === 'completed' ? 'completed' : 'pending'
      userStoryRepo.updateStatus(story.id, newStatus)  // Direct SQL, no separate call
    }
    
    // 3. Archive sprint with inline story data
    this.archive(sprintId, sprint.stories, { title, description })
    
    return { success: true, archivedStoryCount: sprint.stories.length }
  })
}
```

---

### Change 3: Add Title Field to Sprint Creation

Modify `createSprintAcceptor` in `model.js`:

```javascript
model.activeSprint = {
  id: sprintId,
  title: null,  // Added - will be set on close or can be edited
  description: '',  // Added
  stories: sprintStories,
  status: 'created',
  storyProgress: {},
  promptId: null,
  plan: null,
  createdAt: timestamp
}
```

---

### Change 4: Validate Story IDs Before Sprint Creation

Modify `create()` in `sprint-repository.js`:

```javascript
create(sprint, storyIds = []) {
  return this.immediateTransaction(() => {
    // Validate all story IDs exist
    const validIds = []
    const invalidIds = []
    for (const id of storyIds) {
      const exists = this.getDb().prepare(
        'SELECT 1 FROM user_stories WHERE id = ?'
      ).get(id)
      if (exists) {
        validIds.push(id)
      } else {
        invalidIds.push(id)
      }
    }
    
    if (invalidIds.length > 0) {
      throw new Error(`Invalid story IDs: ${invalidIds.join(', ')}`)
    }
    
    // ... rest of create logic
  })
}
```

---

### Change 5: Bidirectional Status Sync

When story status changes in backlog, sync to active sprint:

```javascript
// In user-story-repository.js
updateStatus(storyId, status) {
  return this.immediateTransaction(() => {
    // Update user_stories
    this.getDb().prepare(
      'UPDATE user_stories SET status = ?, updated_at = ? WHERE id = ?'
    ).run(status, this.now(), storyId)
    
    // Also update active sprint if story is in one
    const activeSprintRow = this.getDb().prepare(`
      SELECT s.id, s.story_progress 
      FROM sprints s
      JOIN sprint_stories ss ON s.id = ss.sprint_id
      WHERE ss.story_id = ? AND s.closed_at IS NULL
    `).get(storyId)
    
    if (activeSprintRow) {
      const progress = JSON.parse(activeSprintRow.story_progress || '{}')
      progress[storyId] = progress[storyId] || {}
      progress[storyId].status = status
      
      this.getDb().prepare(
        'UPDATE sprints SET story_progress = ? WHERE id = ?'
      ).run(JSON.stringify(progress), activeSprintRow.id)
    }
  })
}
```

---

## Refactoring Plan (Ordered by Priority)

### Phase 1: Critical Fixes (Data Loss Prevention)

| # | Change | Files | Complexity |
|---|--------|-------|------------|
| 1.1 | Make sprint close atomic | `sprint-repository.js` | High |
| 1.2 | Fix TOCTOU in syncStoryStatus | `sprint-repository.js` | Medium |
| 1.3 | Validate story IDs at creation | `sprint-repository.js` | Medium |

### Phase 2: Data Integrity Improvements

| # | Change | Files | Complexity |
|---|--------|-------|------------|
| 2.1 | Add title field to sprint creation | `model.js`, `sprint-repository.js` | Low |
| 2.2 | Clean orphaned storyProgress on story delete | `user-story-repository.js` | Medium |
| 2.3 | Bidirectional status sync | `user-story-repository.js`, `sprint-repository.js` | High |

### Phase 3: Architecture Refactoring

| # | Change | Files | Complexity |
|---|--------|-------|------------|
| 3.1 | Create SprintService layer | New file: `sprint-service.js` | High |
| 3.2 | Consolidate IPC handlers to use service | `ipc-handlers.js` | Medium |
| 3.3 | Simplify state-persistence.js | `state-persistence.js` | Medium |

### Phase 4: UI Consistency

| # | Change | Files | Complexity |
|---|--------|-------|------------|
| 4.1 | Fix user stories disappearing on reload | `state-persistence.js`, `model.js` | Medium |
| 4.2 | Add loading states during persistence | `user-stories.js` | Low |
| 4.3 | Add error recovery for failed operations | `state-persistence.js` | Medium |

---

## Database Schema Changes Required

### New Migration: 006_add_sprint_title_default.js

```javascript
function up(db) {
  // No schema change needed - title column already exists
  // But we should update any sprints with null title to have a generated one
  db.exec(`
    UPDATE sprints 
    SET title = 'Sprint ' || substr(id, 1, 6) 
    WHERE title IS NULL
  `)
  
  db.exec(`
    UPDATE sprint_history 
    SET title = 'Sprint ' || substr(id, 1, 6) 
    WHERE title IS NULL
  `)
}
```

---

## Testing Strategy

Each fix should include:

1. **Unit tests** for repository methods
2. **Integration tests** for IPC handlers
3. **E2E tests** for the complete workflow:
   - Create stories → Create sprint → Close sprint → Verify backlog status

**Critical test cases:**
- Crash during sprint close (simulate with process kill)
- Delete story while in active sprint
- Close sprint with all stories completed
- Close sprint with mix of completed/incomplete stories
- Close sprint with stories that were never started

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration breaks existing data | High | Backup database before running migration |
| Atomic transactions lock database | Medium | Use WAL mode, keep transactions short |
| UI shows stale data after operation | Medium | Emit refresh events after all operations |
| Rollback fails after partial commit | Low | Already using immediateTransaction |

---

## Summary

The sprint/user story persistence bugs are fixable through:

1. **Making sprint close atomic** - single transaction updates stories AND archives sprint
2. **Adding validation** - verify story IDs exist before creating sprints
3. **Fixing race conditions** - read data inside transactions, not before
4. **Bidirectional sync** - story status changes flow to sprint and vice versa
5. **Service layer** - centralize sprint operations to prevent scattered state updates

Implementation should happen in the backend/fullstack branch, following the phase order above.