---

## Branch Focus: Fullstack

You are working on the **fullstack thread**. Focus on:
- End-to-end feature implementation
- Main process + renderer coordination
- IPC communication patterns
- State management across processes

## IPC Patterns

### Request-Response (invoke/handle)
```javascript
// Main process
ipcMain.handle('channel:action', async (event, args) => {
  return result
})

// Renderer
const result = await window.puffin.channel.action(args)
```

### Events (send/on)
```javascript
// Main process
mainWindow.webContents.send('channel:event', data)

// Renderer
window.puffin.channel.onEvent(callback)
```

## Key Integration Points

| Purpose | File |
|---------|------|
| IPC handlers | `src/main/ipc-handlers.js` |
| Preload bridge | `src/main/preload.js` |
| SAM actions | `src/renderer/sam/actions.js` |
| SAM model | `src/renderer/sam/model.js` |

## Branch Memory (auto-extracted)

### Conventions

- Custom error classes follow naming pattern {Condition}Error with code property and context fields (e.g., DuplicateNameError has code:'DUPLICATE_NAME', duplicateName, existingFilename). Used for specific error cases like InvalidStoryIdsError, ActiveSprintExistsError.
- IPC handlers wrap repository/service calls with try-catch, returning {success: boolean, data/result/designs: any, error: string?}. Errors are logged and returned with user-friendly messages. Renderer layer handles error responses by checking success flag.
- Repository methods document transaction behavior in JSDoc. Multi-step operations note that they use transactions and will rollback on failure. Custom error types are documented in method signatures.
- Test files use .test.js suffix and mirror source directory structure. Tests document acceptance criteria and transaction behavior. Test organization follows: setup, execution, assertion pattern with descriptive test names.
- Preload bridge exposes IPC handlers as 'window.puffin.*' namespaced APIs with convenience methods. Plugin APIs exposed as 'window.puffin.plugins.{pluginName}.{handler}' or via 'window.puffin.plugins.invoke()'.
- Modal types routed by string in switch-case in modal-manager.js. CSS width overrides use '.modal:has(.classname)' pattern. JSDoc describes data flow in render methods.

### Architectural Decisions

- Service layer (e.g., SprintService) wraps repository operations with transaction handling, validation, and callbacks. Repository methods perform validation before transactions (fail-fast approach). Callbacks trigger cache invalidation and UI updates after successful commits.
- Cache invalidation happens via invalidateCache(types) after successful database commits, not during writes. Cache lazy-loads from SQLite on next read. Service layer callbacks trigger invalidation. This separates data consistency from performance optimization.
- Assertion data (inspectionAssertions, assertionResults) preserved through sprint lifecycle via database columns. Assertions included in sprint archive operations. Assertion evaluation triggered when story marked complete, with results stored in user_stories table.
- Read accessors (getUserStories, getActiveSprint) query SQLite first as source of truth, update cache on success, fall back to cache only if SQLite fails. Empty cache does not cause operation failure.
- All multi-step database operations use 'immediateTransaction()' for atomicity. Transactions acquire write locks immediately, preventing SQLITE_BUSY errors. Repository methods throw on failure; automatic rollback on exception.
- Assertion evaluation and generation triggered during story lifecycle: auto-generation on story creation from criteria, auto-evaluation on story completion. Results persisted to database and synchronized through sprint archive.

### Bug Patterns
- Stale in-memory cache causes data inconsistency. If cache is not invalidated after database writes, subsequent reads return outdated data. Solution: invalidateCache() after transaction commits, forcing next read to query SQLite.
- Partial failures in multi-step operations leave data in inconsistent state. Without transactions, if step 2 of 3 fails, step 1 changes persist. Solution: wrap all related operations in immediateTransaction() which rolls back all on any failure.
- Foreign key constraints without ON DELETE CASCADE or explicit cleanup in delete() methods cause orphaned references. When stories deleted, they remain in sprint_stories table. Solution: explicitly DELETE from junction tables or include CASCADE in migration. Also needed in story deletion to clean sprint references.
- Empty array [] is truthy in JavaScript. Status lookups using fallback pattern (a || b) return [] and never check fallback. Solution: use .length > 0 checks or ensure arrays are populated before persisting.
