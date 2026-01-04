# Implementation Plan: Sprint/User Story Persistence Refactoring

## Executive Summary

This plan addresses 10 user stories focused on fixing sprint/user story persistence issues and integrating inspection assertions into the sprint workflow. The stories are interdependent and should be implemented in a specific order to minimize rework and ensure data integrity.

---

## Architecture Analysis

### Shared Components Across Stories

| Component | Used By Stories | Purpose |
|-----------|-----------------|---------|
| `sprint-repository.js` | 1, 2, 3, 4, 6, 7 | Sprint CRUD with transaction support |
| `user-story-repository.js` | 1, 5, 6, 7, 8 | Story CRUD with assertion integration |
| `puffin-state.js` | 2, 3, 4, 5, 7 | State orchestration layer |
| `ipc-handlers.js` | 2, 3, 4, 5, 8, 9, 10 | Renderer-Main communication |
| `state-persistence.js` | 4, 5, 7 | Action-based persistence routing |
| `model.js` (SAM) | 2, 3, 5 | UI state model and acceptors |
| Database migrations | 1 | Schema management |
| Inspection assertions system | 8, 9, 10 | Assertion generation/evaluation |

### Key Dependencies

```
Story 1 (Database Reset)
    └── Story 2, 3, 4, 5, 6 (depend on clean schema)

Story 7 (Transaction Layer)
    └── Story 4 (depends on proper transactions)
    └── Story 5 (depends on proper transactions)

Story 8, 9, 10 (Assertion features)
    └── Depend on Story 5 (story status sync)
    └── Depend on Story 7 (transaction handling)
```

---

## Recommended Implementation Order

### Phase 1: Foundation (Stories 1, 7)
| Order | Story | Rationale |
|-------|-------|-----------|
| 1 | **Story 1: Database Reset** | Must start with clean schema; enables all other work |
| 2 | **Story 7: Transaction Layer** | Foundation for atomic operations in subsequent stories |

### Phase 2: Sprint Lifecycle (Stories 2, 3, 4)
| Order | Story | Rationale |
|-------|-------|-----------|
| 3 | **Story 2: Atomic Sprint Creation** | Fix creation before closure |
| 4 | **Story 3: Single Active Sprint** | Enforce constraint before testing closure |
| 5 | **Story 4: Atomic Sprint Closure** | Requires transaction layer from Story 7 |

### Phase 3: Data Integrity (Stories 5, 6)
| Order | Story | Rationale |
|-------|-------|-----------|
| 6 | **Story 5: Story Status Sync** | Critical for UI consistency |
| 7 | **Story 6: Reference Validation** | Prevents orphaned data |

### Phase 4: Assertions Integration (Stories 8, 9, 10)
| Order | Story | Rationale |
|-------|-------|-----------|
| 8 | **Story 8: Assertion Sprint Integration** | Foundation for assertion UI work |
| 9 | **Story 10: Auto-Generation** | Enables assertions to exist for Story 9 |
| 10 | **Story 9: Failure Reporting UI** | Final UI polish |

---

## Story-by-Story Technical Approach

---

### Story 1: Clean Database Reset for Sprint/Story Persistence

**Complexity: Medium**

#### Technical Approach
Create a new migration (006) that:
1. Drops and recreates `sprints`, `sprint_stories`, `sprint_history` tables with proper constraints
2. Preserves `user_stories` structure but clears sprint-related data
3. Preserves inspection assertions schema (already correct in migration 005)
4. Adds database constraints for single active sprint

#### Key Technical Decisions
- **Migration vs Reset Script**: Use a migration for production-safe schema updates, plus a separate reset script for development
- **Data Preservation**: Keep `story_generations` and `implementation_journeys` tables intact
- **Constraint Strategy**: Add CHECK constraints and triggers in SQLite for enforcement

#### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/main/database/migrations/006_reset_sprint_schema.js` | Create | New migration for schema cleanup |
| `src/main/database/migrations/index.js` | Modify | Register migration 006 |
| `scripts/reset-database.js` | Create | Dev script for clean reset |

#### Implementation Details

```javascript
// 006_reset_sprint_schema.js structure
function up(db) {
  // 1. Backup existing user_stories data
  db.exec('CREATE TEMP TABLE temp_stories AS SELECT * FROM user_stories')

  // 2. Drop dependent tables (order matters for FK)
  db.exec('DROP TABLE IF EXISTS sprint_stories')
  db.exec('DROP TABLE IF EXISTS sprints')
  db.exec('DROP TABLE IF EXISTS sprint_history')

  // 3. Recreate sprints with NOT NULL title
  db.exec(`
    CREATE TABLE sprints (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'created'
        CHECK(status IN ('created','planning','plan-review','in-progress','completed','closed')),
      plan TEXT,
      story_progress TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      plan_approved_at TEXT,
      completed_at TEXT,
      closed_at TEXT
    )
  `)

  // 4. Add single-active-sprint trigger
  db.exec(`
    CREATE TRIGGER enforce_single_active_sprint
    BEFORE INSERT ON sprints
    BEGIN
      SELECT RAISE(ABORT, 'Only one active sprint allowed')
      WHERE EXISTS (SELECT 1 FROM sprints WHERE closed_at IS NULL);
    END
  `)

  // 5. Recreate sprint_stories with cascading FK
  db.exec(`
    CREATE TABLE sprint_stories (
      sprint_id TEXT NOT NULL,
      story_id TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (sprint_id, story_id),
      FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE CASCADE,
      FOREIGN KEY (story_id) REFERENCES user_stories(id) ON DELETE CASCADE
    )
  `)

  // 6. Recreate sprint_history
  db.exec(`
    CREATE TABLE sprint_history (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      plan TEXT,
      story_progress TEXT,
      story_ids TEXT,
      stories TEXT,
      prompt_id TEXT,
      created_at TEXT NOT NULL,
      closed_at TEXT NOT NULL
    )
  `)

  // 7. Restore user_stories, reset sprint-related status
  db.exec(`
    UPDATE user_stories
    SET status = CASE
      WHEN status = 'in_sprint' THEN 'pending'
      ELSE status
    END
  `)
}
```

#### Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | High | Backup before migration; use temp table approach |
| Trigger performance overhead | Low | SQLite triggers are fast for simple checks |

---

### Story 2: Atomic Sprint Creation with Title Persistence

**Complexity: Low**

#### Technical Approach
Modify sprint creation flow to:
1. Capture title at creation time (can be auto-generated or user-provided)
2. Include title in the same INSERT transaction as sprint and relationships
3. Update SAM model to include title field from the start

#### Key Technical Decisions
- **Default Title**: Auto-generate as "Sprint - {first story title}" if not provided
- **Title Mutability**: Allow title editing after creation (but before close)
- **UI Flow**: Show title input in sprint creation modal

#### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/sam/model.js` | Modify | Add title to `createSprintAcceptor` |
| `src/main/database/repositories/sprint-repository.js` | Modify | Require title in `create()` |
| `src/main/puffin-state.js` | Modify | Pass title through `saveActiveSprint()` |
| `src/renderer/lib/state-persistence.js` | Modify | Include title in CREATE_SPRINT action |

#### Implementation Details

```javascript
// model.js - createSprintAcceptor modification
model.activeSprint = {
  id: sprintId,
  title: action.title || `Sprint - ${sprintStories[0]?.title || 'Untitled'}`,
  description: action.description || '',
  stories: sprintStories,
  status: 'created',
  storyProgress: {},
  promptId: null,
  plan: null,
  createdAt: timestamp
}

// sprint-repository.js - create() modification
create(sprint, storyIds = []) {
  if (!sprint.title || sprint.title.trim() === '') {
    throw new Error('Sprint title is required')
  }
  // ... existing transaction logic
}
```

---

### Story 3: Single Active Sprint Enforcement

**Complexity: Low**

#### Technical Approach
1. Database-level: SQLite trigger (from Story 1) prevents insert if active sprint exists
2. Repository-level: Explicit check before create with clear error message
3. UI-level: Disable "Create Sprint" button when active sprint exists
4. State-level: Clear error display when attempting duplicate sprint

#### Key Technical Decisions
- **Error Handling**: Repository throws specific error type `ActiveSprintExistsError`
- **UI Feedback**: Toast notification explaining user must close current sprint
- **Check Location**: Both repository (for API safety) and UI (for UX)

#### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/main/database/repositories/sprint-repository.js` | Modify | Add active sprint check in `create()` |
| `src/shared/errors.js` | Create | Define `ActiveSprintExistsError` class |
| `src/main/ipc-handlers.js` | Modify | Handle error type in response |
| `src/renderer/components/backlog/backlog.js` | Modify | Disable button when sprint active |
| `src/renderer/sam/model.js` | Modify | Add error state for sprint creation failure |

#### Implementation Details

```javascript
// sprint-repository.js
create(sprint, storyIds = []) {
  return this.immediateTransaction(() => {
    // Check for existing active sprint
    const existing = this.getDb().prepare(
      'SELECT id, title FROM sprints WHERE closed_at IS NULL'
    ).get()

    if (existing) {
      throw new ActiveSprintExistsError(
        `Cannot create sprint: "${existing.title}" is already active. Close it first.`
      )
    }

    // ... rest of creation logic
  })
}
```

---

### Story 4: Atomic Sprint Closure with Story Status Update

**Complexity: High**

#### Technical Approach
Create a new method `closeAndArchive()` that performs all operations in a single transaction:
1. Read sprint and stories (within transaction)
2. Determine final status for each story
3. Update `user_stories` table
4. Insert into `sprint_history` with denormalized story data
5. Delete from `sprints` table
6. Return success with summary

#### Key Technical Decisions
- **Story Status Logic**:
  - `storyProgress[id].status === 'completed'` → `user_stories.status = 'completed'`
  - Otherwise → `user_stories.status = 'pending'`
- **Assertion Preservation**: Copy assertion results to archived story data
- **Rollback Strategy**: Entire operation fails if any step fails

#### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/main/database/repositories/sprint-repository.js` | Modify | Add `closeAndArchive()` method |
| `src/main/puffin-state.js` | Modify | Replace multi-step close with single method call |
| `src/renderer/lib/state-persistence.js` | Modify | Simplify `CLEAR_SPRINT_WITH_DETAILS` handling |
| `src/main/ipc-handlers.js` | Modify | Add `sprint:closeAndArchive` IPC handler |

#### Implementation Details

```javascript
// sprint-repository.js
closeAndArchive(sprintId, title, description, userStoryRepo) {
  return this.immediateTransaction(() => {
    // 1. Read sprint with stories
    const sprint = this.findById(sprintId)
    if (!sprint) throw new Error(`Sprint ${sprintId} not found`)

    const stories = this.getStories(sprintId)
    const storyProgress = sprint.storyProgress || {}

    // 2. Update each story's status
    const storyUpdates = []
    for (const story of stories) {
      const progress = storyProgress[story.id] || {}
      const newStatus = progress.status === 'completed' ? 'completed' : 'pending'

      this.getDb().prepare(`
        UPDATE user_stories
        SET status = ?, updated_at = ?
        WHERE id = ?
      `).run(newStatus, this.now(), story.id)

      storyUpdates.push({ id: story.id, oldStatus: story.status, newStatus })
    }

    // 3. Archive sprint with inline story data
    const archiveData = {
      ...sprint,
      title: title || sprint.title,
      description: description || sprint.description,
      storyIds: stories.map(s => s.id),
      stories: stories.map(s => ({
        ...s,
        finalStatus: storyProgress[s.id]?.status || 'incomplete',
        assertionResults: s.assertionResults
      })),
      closedAt: this.now()
    }

    this.getDb().prepare(`
      INSERT INTO sprint_history
      (id, title, description, status, plan, story_progress, story_ids, stories, prompt_id, created_at, closed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      archiveData.id,
      archiveData.title,
      archiveData.description,
      'closed',
      archiveData.plan,
      JSON.stringify(archiveData.storyProgress),
      JSON.stringify(archiveData.storyIds),
      JSON.stringify(archiveData.stories),
      archiveData.promptId,
      archiveData.createdAt,
      archiveData.closedAt
    )

    // 4. Delete from active sprints
    this.getDb().prepare('DELETE FROM sprints WHERE id = ?').run(sprintId)

    return {
      success: true,
      archivedSprintId: sprintId,
      storyUpdates,
      closedAt: archiveData.closedAt
    }
  })
}
```

---

### Story 5: User Story Status Synchronization

**Complexity: High**

#### Technical Approach
Implement bidirectional sync:
1. **Backlog → Sprint**: When story status changes in backlog, update `sprint.storyProgress`
2. **Sprint → Backlog**: When story marked complete in sprint, update `user_stories.status`
3. **Reload Consistency**: Load stories from database as source of truth

#### Key Technical Decisions
- **Single Source of Truth**: `user_stories.status` is canonical; `storyProgress` is derived
- **Sync Timing**: Immediate sync on any status change
- **Cache Invalidation**: Clear all caches after sync to force fresh reads

#### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/main/database/repositories/user-story-repository.js` | Modify | Add sprint sync in `updateStatus()` |
| `src/main/database/repositories/sprint-repository.js` | Modify | Fix TOCTOU in `syncStoryStatus()` |
| `src/main/puffin-state.js` | Modify | Ensure consistent cache invalidation |
| `src/renderer/lib/state-persistence.js` | Modify | Remove safety check that drops stories |

#### Implementation Details

```javascript
// user-story-repository.js
updateStatus(storyId, status) {
  return this.immediateTransaction(() => {
    // 1. Update user_stories
    const result = this.getDb().prepare(`
      UPDATE user_stories
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(status, this.now(), storyId)

    if (result.changes === 0) {
      throw new Error(`Story ${storyId} not found`)
    }

    // 2. Sync to active sprint if story is in one
    const sprintRow = this.getDb().prepare(`
      SELECT s.id, s.story_progress
      FROM sprints s
      JOIN sprint_stories ss ON s.id = ss.sprint_id
      WHERE ss.story_id = ? AND s.closed_at IS NULL
    `).get(storyId)

    if (sprintRow) {
      const progress = JSON.parse(sprintRow.story_progress || '{}')
      progress[storyId] = progress[storyId] || {}
      progress[storyId].status = status

      this.getDb().prepare(`
        UPDATE sprints SET story_progress = ? WHERE id = ?
      `).run(JSON.stringify(progress), sprintRow.id)
    }

    return { storyId, status, sprintSynced: !!sprintRow }
  })
}

// state-persistence.js - Remove the safety check
// DELETE lines 371-382 that prevent loading when story count drops
```

---

### Story 6: Sprint Story Reference Validation

**Complexity: Medium**

#### Technical Approach
1. **Creation Validation**: Verify all story IDs exist before creating sprint
2. **Orphan Cleanup**: On story delete, remove from any active sprint
3. **Load Filtering**: When loading sprint, filter out non-existent story references
4. **Cascade Delete**: Already handled by FK constraints (from Story 1)

#### Key Technical Decisions
- **Validation Timing**: Validate before transaction starts (fail fast)
- **Error Granularity**: Report which specific IDs are invalid
- **Orphan Handling**: Log warning but don't fail; filter silently

#### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/main/database/repositories/sprint-repository.js` | Modify | Add validation in `create()` |
| `src/main/database/repositories/user-story-repository.js` | Modify | Clean sprint refs on delete |
| `src/main/puffin-state.js` | Modify | Add orphan filtering on sprint load |

#### Implementation Details

```javascript
// sprint-repository.js - create() with validation
create(sprint, storyIds = []) {
  // Validate BEFORE starting transaction (fail fast)
  if (storyIds.length > 0) {
    const placeholders = storyIds.map(() => '?').join(',')
    const existingIds = this.getDb().prepare(`
      SELECT id FROM user_stories WHERE id IN (${placeholders})
    `).all(...storyIds).map(r => r.id)

    const missingIds = storyIds.filter(id => !existingIds.includes(id))
    if (missingIds.length > 0) {
      throw new Error(`Invalid story IDs: ${missingIds.join(', ')}`)
    }
  }

  return this.immediateTransaction(() => {
    // ... create logic
  })
}

// user-story-repository.js - cleanOrphanRefs on delete
deleteById(storyId) {
  return this.immediateTransaction(() => {
    // Sprint cleanup is handled by CASCADE, but clean storyProgress JSON
    const sprintRow = this.getDb().prepare(`
      SELECT id, story_progress FROM sprints WHERE closed_at IS NULL
    `).get()

    if (sprintRow) {
      const progress = JSON.parse(sprintRow.story_progress || '{}')
      if (progress[storyId]) {
        delete progress[storyId]
        this.getDb().prepare(`
          UPDATE sprints SET story_progress = ? WHERE id = ?
        `).run(JSON.stringify(progress), sprintRow.id)
      }
    }

    // Delete the story
    return this.getDb().prepare('DELETE FROM user_stories WHERE id = ?').run(storyId)
  })
}
```

---

### Story 7: State Persistence Layer Refactoring

**Complexity: High**

#### Technical Approach
Create a new `SprintService` class that:
1. Wraps all sprint operations in consistent transaction handling
2. Provides clear API for all sprint lifecycle operations
3. Handles cache invalidation automatically
4. Emits events for UI updates

#### Key Technical Decisions
- **Service Location**: `src/main/services/sprint-service.js`
- **Repository Injection**: Accept repositories as constructor args for testability
- **Error Wrapping**: Convert all repository errors to service-level errors with context
- **Event Emission**: Use existing IPC event system for UI notifications

#### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/main/services/sprint-service.js` | Create | New service layer |
| `src/main/services/index.js` | Create | Service exports |
| `src/main/puffin-state.js` | Modify | Use SprintService instead of direct repo calls |
| `src/main/ipc-handlers.js` | Modify | Simplify to delegate to service |
| `src/renderer/lib/state-persistence.js` | Modify | Reduce complexity; delegate to IPC |

#### Implementation Details

```javascript
// src/main/services/sprint-service.js
class SprintService {
  constructor({ sprintRepo, userStoryRepo, eventEmitter }) {
    this.sprintRepo = sprintRepo
    this.userStoryRepo = userStoryRepo
    this.eventEmitter = eventEmitter
  }

  /**
   * Create a new sprint with stories
   * @throws {ActiveSprintExistsError} if sprint already active
   * @throws {InvalidStoryIdsError} if any story IDs don't exist
   */
  async createSprint(title, storyIds, options = {}) {
    const result = this.sprintRepo.create({
      id: generateId(),
      title,
      description: options.description || '',
      status: 'created',
      storyProgress: {},
      createdAt: new Date().toISOString()
    }, storyIds)

    // Update story statuses to 'in_sprint'
    for (const storyId of storyIds) {
      this.userStoryRepo.updateStatus(storyId, 'in_sprint')
    }

    this.eventEmitter.emit('sprint-created', result)
    return result
  }

  /**
   * Close sprint atomically, updating all story statuses
   */
  async closeSprint(sprintId, { title, description } = {}) {
    const result = this.sprintRepo.closeAndArchive(
      sprintId,
      title,
      description,
      this.userStoryRepo
    )

    this.eventEmitter.emit('sprint-closed', result)
    return result
  }

  /**
   * Update story status with bidirectional sync
   */
  async updateStoryStatus(storyId, status) {
    const result = this.userStoryRepo.updateStatus(storyId, status)
    this.eventEmitter.emit('story-status-changed', result)
    return result
  }

  // ... additional methods
}
```

---

### Story 8: Inspection Assertions Integration with Sprint Workflow

**Complexity: Medium**

#### Technical Approach
Ensure assertions flow correctly through sprint lifecycle:
1. **Add to Sprint**: Preserve existing assertions
2. **During Sprint**: Assertions can be evaluated, results saved
3. **Sprint Close**: Assertion results archived with story in `sprint_history`
4. **Reload**: Results loaded from database

#### Key Technical Decisions
- **Archive Strategy**: Denormalize assertion results into `sprint_history.stories` JSON
- **Result Preservation**: Never delete assertion results; append new evaluations
- **Sprint vs Backlog Display**: Same assertion UI in both views

#### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/main/database/repositories/sprint-repository.js` | Modify | Include assertions in archive |
| `src/main/puffin-state.js` | Modify | Load assertions with sprint stories |
| `src/renderer/components/sprint/sprint-story-card.js` | Modify | Display assertion summary |

#### Implementation Details

```javascript
// In closeAndArchive() - include assertion data
stories: stories.map(s => ({
  ...s,
  finalStatus: storyProgress[s.id]?.status || 'incomplete',
  inspectionAssertions: s.inspectionAssertions,
  assertionResults: s.assertionResults  // Already evaluated results
}))

// In sprint story card rendering
function renderAssertionSummary(story) {
  if (!story.assertionResults) {
    return { text: 'Not verified', class: 'pending' }
  }
  const { passed, total } = story.assertionResults.summary
  if (passed === total) {
    return { text: `${passed}/${total} passed`, class: 'success' }
  }
  return { text: `${passed}/${total} passed`, class: 'warning' }
}
```

---

### Story 9: Inspection Assertion Failure Reporting UI

**Complexity: Medium**

#### Technical Approach
Create a modal component for detailed failure display:
1. **Trigger**: "View Details" button on failed assertions
2. **Modal Content**: Assertion type, expected value, actual result, suggestions
3. **Actions**: Waive (mark as acceptable), Defer (create follow-up task), Re-run

#### Key Technical Decisions
- **Modal Framework**: Use existing `modal-manager.js` pattern
- **Failure Details**: Leverage existing `assertionResults.results[].details` structure
- **Action Persistence**: Waived assertions stored in `assertion_results` with override flag

#### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/components/modals/assertion-failure-modal.js` | Create | New modal component |
| `src/renderer/components/user-stories/user-stories.js` | Modify | Add "View Details" button |
| `src/renderer/lib/modal-manager.js` | Modify | Register new modal type |
| `src/shared/inspection-assertions.js` | Modify | Add waiver/override schema |

#### Implementation Details

```javascript
// assertion-failure-modal.js
class AssertionFailureModal {
  constructor(story, failedAssertions) {
    this.story = story
    this.failures = failedAssertions
  }

  render() {
    return `
      <div class="modal assertion-failure-modal">
        <h2>Assertion Failures - ${this.story.title}</h2>
        <div class="failures-list">
          ${this.failures.map(f => this.renderFailure(f)).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" data-action="close">Close</button>
        </div>
      </div>
    `
  }

  renderFailure(failure) {
    const assertion = this.story.inspectionAssertions
      .find(a => a.id === failure.assertionId)
    return `
      <div class="failure-item">
        <div class="failure-header">
          <span class="type-badge">${formatType(assertion.type)}</span>
          <span class="target">${assertion.target}</span>
        </div>
        <div class="failure-message">${assertion.message}</div>
        <div class="failure-details">
          <div class="expected">
            <strong>Expected:</strong> ${formatExpected(assertion)}
          </div>
          <div class="actual">
            <strong>Actual:</strong> ${failure.details?.actual || 'Not found'}
          </div>
          ${failure.details?.suggestion ? `
            <div class="suggestion">
              <strong>Suggestion:</strong> ${failure.details.suggestion}
            </div>
          ` : ''}
        </div>
        <div class="failure-actions">
          <button data-action="waive" data-id="${failure.assertionId}">
            Waive (Accept)
          </button>
          <button data-action="defer" data-id="${failure.assertionId}">
            Defer
          </button>
          <button data-action="rerun" data-id="${failure.assertionId}">
            Re-run
          </button>
        </div>
      </div>
    `
  }
}
```

---

### Story 10: Automatic Inspection Assertion Generation

**Complexity: Medium**

#### Technical Approach
Hook into story creation to auto-generate assertions:
1. **Trigger**: After story is saved to database
2. **Generation**: Use existing `assertion-generator.js`
3. **Review UI**: Modal showing generated assertions with edit capability
4. **Persistence**: Save approved assertions with story

#### Key Technical Decisions
- **Generation Timing**: Async, after story creation completes
- **Review Required**: Always show review modal; don't auto-save
- **Edit Capability**: Allow add/remove/modify before saving
- **Suggestion Display**: Show "suggested" assertions separately

#### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/components/modals/assertion-review-modal.js` | Create | Review/edit generated assertions |
| `src/main/ipc-handlers.js` | Modify | Auto-trigger generation after story create |
| `src/renderer/components/user-stories/user-stories.js` | Modify | Show review modal after creation |
| `src/main/generators/assertion-generator.js` | Modify | Add confidence scores to generated assertions |

#### Implementation Details

```javascript
// ipc-handlers.js - after story creation
ipcMain.handle('state:createUserStory', async (event, storyData) => {
  const story = await puffinState.addUserStory(storyData)

  // Auto-generate assertions
  const generator = new AssertionGenerator({ projectRoot: puffinState.projectRoot })
  const { assertions, suggestions } = generator.generateAssertions(story)

  return {
    success: true,
    story,
    generatedAssertions: {
      assertions,  // High-confidence, auto-matched from criteria
      suggestions  // Lower-confidence, recommended additions
    }
  }
})

// assertion-review-modal.js
class AssertionReviewModal {
  constructor(story, generated) {
    this.story = story
    this.assertions = generated.assertions
    this.suggestions = generated.suggestions
    this.selected = new Set(generated.assertions.map(a => a.id))
  }

  render() {
    return `
      <div class="modal assertion-review-modal">
        <h2>Review Generated Assertions</h2>
        <p>The following assertions were generated from "${this.story.title}"</p>

        <h3>Matched Assertions (${this.assertions.length})</h3>
        <div class="assertions-list">
          ${this.assertions.map(a => this.renderAssertion(a, true)).join('')}
        </div>

        ${this.suggestions.length > 0 ? `
          <h3>Suggested Additions (${this.suggestions.length})</h3>
          <div class="assertions-list suggestions">
            ${this.suggestions.map(a => this.renderAssertion(a, false)).join('')}
          </div>
        ` : ''}

        <div class="modal-actions">
          <button class="btn-primary" data-action="save">
            Save Selected (${this.selected.size})
          </button>
          <button class="btn-secondary" data-action="skip">
            Skip for Now
          </button>
        </div>
      </div>
    `
  }
}
```

---

## Summary: File Change Matrix

| File | Stories Affected | Change Scope |
|------|------------------|--------------|
| `migrations/006_reset_sprint_schema.js` | 1, 3 | Create |
| `sprint-repository.js` | 1, 2, 3, 4, 6, 7, 8 | Major |
| `user-story-repository.js` | 5, 6, 7 | Moderate |
| `puffin-state.js` | 2, 3, 4, 5, 7, 8 | Major |
| `state-persistence.js` | 4, 5, 7 | Moderate |
| `ipc-handlers.js` | 2, 3, 4, 8, 9, 10 | Moderate |
| `model.js` (SAM) | 2, 3, 5 | Moderate |
| `services/sprint-service.js` | 7 | Create |
| `shared/errors.js` | 3, 6 | Create |
| `modals/assertion-failure-modal.js` | 9 | Create |
| `modals/assertion-review-modal.js` | 10 | Create |
| `user-stories.js` | 9, 10 | Moderate |

---

## Risk Assessment

| Story | Risk Level | Key Risks | Mitigation |
|-------|------------|-----------|------------|
| 1 | **High** | Data loss during migration | Backup DB first; use temp tables |
| 2 | Low | Breaking existing sprints | Migration backfills titles |
| 3 | Low | Edge cases in enforcement | Comprehensive trigger testing |
| 4 | **High** | Transaction deadlock | Short transactions; immediate mode |
| 5 | Medium | Sync race conditions | All syncs in transactions |
| 6 | Medium | Orphan detection accuracy | Extensive test coverage |
| 7 | **High** | Refactoring scope | Incremental migration |
| 8 | Low | Data format changes | Schema already supports |
| 9 | Low | UI complexity | Follow existing modal patterns |
| 10 | Medium | Generation accuracy | Confidence scores; manual review |

---

## Complexity Summary

| Story | Complexity | Effort Factors |
|-------|------------|----------------|
| 1: Database Reset | **Medium** | Schema design, migration safety |
| 2: Atomic Creation | **Low** | Simple field addition |
| 3: Single Sprint | **Low** | Constraint + UI check |
| 4: Atomic Closure | **High** | Complex transaction, many files |
| 5: Status Sync | **High** | Bidirectional sync, race handling |
| 6: Reference Validation | **Medium** | Validation + cleanup logic |
| 7: Transaction Layer | **High** | Service abstraction, refactoring |
| 8: Assertion Integration | **Medium** | Data flow through lifecycle |
| 9: Failure UI | **Medium** | New modal component |
| 10: Auto-Generation | **Medium** | Integration with creation flow |

---

## Testing Strategy

### Unit Tests Required
- `sprint-repository.test.js`: Transaction atomicity, constraint enforcement
- `user-story-repository.test.js`: Status sync, reference cleanup
- `sprint-service.test.js`: Full lifecycle operations
- `assertion-generator.test.js`: Pattern matching accuracy

### Integration Tests Required
- Sprint creation with invalid story IDs (expect rejection)
- Sprint closure with process interruption (expect consistent state)
- Story status changes synced bidirectionally
- Assertion generation and persistence through sprint lifecycle

### E2E Tests Required
- Full workflow: Create stories → Create sprint → Mark complete → Close sprint → Verify backlog
- Assertion workflow: Generate → Review → Save → Evaluate → View failures

---

## Recommended Next Steps

1. **Review this plan** and approve the implementation order
2. **Create feature branch**: `fix/sprint-persistence-refactoring`
3. **Implement Phase 1** (Stories 1, 7) first as foundation
4. **Implement Phases 2-4** in order, with testing after each phase
5. **Run full regression** before merging

This plan can be executed in a single implementation branch, or split into separate PRs per phase for easier review.
