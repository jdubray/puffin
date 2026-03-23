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

- IPC handlers follow service:operation naming format (e.g., state:syncStoryStatus, git:createBranch). Plugin IPC handlers use plugin:${pluginName}:${channel} pattern. All IPC handlers return {success, error} format for error propagation.
- Custom error classes encode operation semantics with specific error codes (e.g., DuplicateNameError.code = 'DUPLICATE_NAME', ActiveSprintExistsError, InvalidStoryIdsError). Modal manager catches specific error types and dispatches to appropriate UI feedback (toast, modal, etc.).
- Story status follows consistent mappings: 'pending' (backlog) → 'in-progress' (in sprint) → 'completed' (archive). Sprint archive resets incomplete stories to 'pending' for reuse; completed stories remain 'completed'. All status updates occur atomically within transaction.
- Evaluator implementations follow base class pattern: BaseEvaluator with abstract evaluate() method. All assertion types (FILE_EXISTS, CLASS_STRUCTURE, FUNCTION_SIGNATURE, EXPORT_EXISTS, IMPORT_EXISTS, IPC_HANDLER_REGISTERED, CSS_SELECTOR_EXISTS, JSON_PROPERTY, PATTERN_MATCH, FUNCTION_SIGNATURE) have dedicated evaluator classes.
- Modal system uses type-based routing in modal-manager.js switch-case. Modal renderers return HTML strings. Modal state tracked in component instance. CSS width customization via .modal:has(.classname) selector pattern. Modals handle specific error types for UX feedback.
- Plugin architecture: manifest-driven with puffin-plugin.json (name, version, capabilities, activationEvents). Plugin class implements activate() and deactivate() lifecycle. Registers IPC handlers and SAM actions via PluginContext. Plugins discovered from ~/.puffin/plugins/, validated via JSON Schema, loaded with error isolation.
- Assertion generation uses heuristic pattern matching on acceptance criteria text. Generator deduplicates assertions. Generated assertions marked with criterion reference (AC1, AC2). Interactive editor UI allows review, edit, remove before save. Patterns support all 10 evaluator types.
- Story reference validation: pre-validate all story IDs exist via repository check before transaction starts. Reject invalid IDs with clear error listing which IDs are invalid. On story deletion, cleanup sprint_stories junction table and storyProgress JSON atomically. Load operations filter orphaned references via INNER JOIN.

### Architectural Decisions

- SQLite is the source of truth; in-memory cache is an optimization, not a requirement. Read accessors query SQLite first, update cache from successful reads, fallback to cache only if query fails. Cache invalidation via invalidateCache() forces next read to query database.
- All multi-step database operations use BaseRepository.immediateTransaction() for atomicity. Repository methods wrap CRUD operations in transactions; cache updates occur only after transaction commits. Transaction failure triggers automatic rollback with no partial state.
- Service layer (SprintService) wraps repository operations with pre-validation (fail-fast before transaction), error handling via custom error classes, and callbacks for cache invalidation. Separates repository concerns from business logic orchestration.
- Story creation with assertions: acceptor includes inspectionAssertions field. Assertions persisted to database alongside story in single write. Pre-save validation deduplicates and validates assertion structure. Enables assertion evaluation on story completion.

### Bug Patterns

- Empty arrays [] are truthy in JavaScript. Assertion and story lookups must use .length > 0 checks, not || fallback, to avoid skipping secondary sources when primary returns empty array. Affects code review display, sprint view, and story synchronization.

<!-- puffin:generated-end -->

` marker; those additions are preserved across branch switches and regenerations.

## Project Overview

**Project:** puffin

Puffin is an Electron-based GUI application that serves as a **management layer** on top of the Claude Code CLI (3CLI). Its primary purpose is to:

1. **Track and organize** 3CLI outputs and conversations
2. **Provide context** to 3CLI through project configuration and history
3. **Visualize** the development process (prompts, responses, branches)
4. **Communicate UI designs** via the GUI designer

**Important**: 3CLI remains in control of building the project. Puffin is an orchestration and tracking tool, not a replacement for the CLI's capabilities.

## File Access Restrictions

**IMPORTANT: You must ONLY access files within this project directory.**

You are NOT allowed to:
- Read, write, or modify files outside this project
- Access parent directories or sibling projects
- Reference or use files from other projects on the system
- Execute commands that affect files outside the project root

All file operations must be scoped to this project directory and its subdirectories.

## Coding Preferences

- **Programming Style:** Hybrid (OOP + FP)
- **Testing Approach:** Behavior-Driven Development
- **Documentation Level:** Standard
- **Error Handling:** Exceptions
- **Naming Convention:** camelCase
- **Comment Style:** JSDoc

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

- IPC handlers follow service:operation naming format (e.g., state:syncStoryStatus, git:createBranch). Plugin IPC handlers use plugin:${pluginName}:${channel} pattern. All IPC handlers return {success, error} format for error propagation.
- Custom error classes encode operation semantics with specific error codes (e.g., DuplicateNameError.code = 'DUPLICATE_NAME', ActiveSprintExistsError, InvalidStoryIdsError). Modal manager catches specific error types and dispatches to appropriate UI feedback (toast, modal, etc.).
- Story status follows consistent mappings: 'pending' (backlog) → 'in-progress' (in sprint) → 'completed' (archive). Sprint archive resets incomplete stories to 'pending' for reuse; completed stories remain 'completed'. All status updates occur atomically within transaction.
- Evaluator implementations follow base class pattern: BaseEvaluator with abstract evaluate() method. All assertion types (FILE_EXISTS, CLASS_STRUCTURE, FUNCTION_SIGNATURE, EXPORT_EXISTS, IMPORT_EXISTS, IPC_HANDLER_REGISTERED, CSS_SELECTOR_EXISTS, JSON_PROPERTY, PATTERN_MATCH, FUNCTION_SIGNATURE) have dedicated evaluator classes.
- Modal system uses type-based routing in modal-manager.js switch-case. Modal renderers return HTML strings. Modal state tracked in component instance. CSS width customization via .modal:has(.classname) selector pattern. Modals handle specific error types for UX feedback.
- Plugin architecture: manifest-driven with puffin-plugin.json (name, version, capabilities, activationEvents). Plugin class implements activate() and deactivate() lifecycle. Registers IPC handlers and SAM actions via PluginContext. Plugins discovered from ~/.puffin/plugins/, validated via JSON Schema, loaded with error isolation.
- Assertion generation uses heuristic pattern matching on acceptance criteria text. Generator deduplicates assertions. Generated assertions marked with criterion reference (AC1, AC2). Interactive editor UI allows review, edit, remove before save. Patterns support all 10 evaluator types.
- Story reference validation: pre-validate all story IDs exist via repository check before transaction starts. Reject invalid IDs with clear error listing which IDs are invalid. On story deletion, cleanup sprint_stories junction table and storyProgress JSON atomically. Load operations filter orphaned references via INNER JOIN.

### Architectural Decisions

- SQLite is the source of truth; in-memory cache is an optimization, not a requirement. Read accessors query SQLite first, update cache from successful reads, fallback to cache only if query fails. Cache invalidation via invalidateCache() forces next read to query database.
- All multi-step database operations use BaseRepository.immediateTransaction() for atomicity. Repository methods wrap CRUD operations in transactions; cache updates occur only after transaction commits. Transaction failure triggers automatic rollback with no partial state.
- Service layer (SprintService) wraps repository operations with pre-validation (fail-fast before transaction), error handling via custom error classes, and callbacks for cache invalidation. Separates repository concerns from business logic orchestration.
- Story creation with assertions: acceptor includes inspectionAssertions field. Assertions persisted to database alongside story in single write. Pre-save validation deduplicates and validates assertion structure. Enables assertion evaluation on story completion.

### Bug Patterns

- Empty arrays [] are truthy in JavaScript. Assertion and story lookups must use .length > 0 checks, not || fallback, to avoid skipping secondary sources when primary returns empty array. Affects code review display, sprint view, and story synchronization.

<!-- puffin:generated-end -->

` marker; those additions are preserved across branch switches and regenerations.

## Project Overview

**Project:** puffin

Puffin is an Electron-based GUI application that serves as a **management layer** on top of the Claude Code CLI (3CLI). Its primary purpose is to:

1. **Track and organize** 3CLI outputs and conversations
2. **Provide context** to 3CLI through project configuration and history
3. **Visualize** the development process (prompts, responses, branches)
4. **Communicate UI designs** via the GUI designer

**Important**: 3CLI remains in control of building the project. Puffin is an orchestration and tracking tool, not a replacement for the CLI's capabilities.

## File Access Restrictions

**IMPORTANT: You must ONLY access files within this project directory.**

You are NOT allowed to:
- Read, write, or modify files outside this project
- Access parent directories or sibling projects
- Reference or use files from other projects on the system
- Execute commands that affect files outside the project root

All file operations must be scoped to this project directory and its subdirectories.

## Coding Preferences

- **Programming Style:** Hybrid (OOP + FP)
- **Testing Approach:** Behavior-Driven Development
- **Documentation Level:** Standard
- **Error Handling:** Exceptions
- **Naming Convention:** camelCase
- **Comment Style:** JSDoc

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

- IPC handlers follow service:operation naming format (e.g., state:syncStoryStatus, git:createBranch). Plugin IPC handlers use plugin:${pluginName}:${channel} pattern. All IPC handlers return {success, error} format for error propagation.
- Custom error classes encode operation semantics with specific error codes (e.g., DuplicateNameError.code = 'DUPLICATE_NAME', ActiveSprintExistsError, InvalidStoryIdsError). Modal manager catches specific error types and dispatches to appropriate UI feedback (toast, modal, etc.).
- Story status follows consistent mappings: 'pending' (backlog) → 'in-progress' (in sprint) → 'completed' (archive). Sprint archive resets incomplete stories to 'pending' for reuse; completed stories remain 'completed'. All status updates occur atomically within transaction.
- Evaluator implementations follow base class pattern: BaseEvaluator with abstract evaluate() method. All assertion types (FILE_EXISTS, CLASS_STRUCTURE, FUNCTION_SIGNATURE, EXPORT_EXISTS, IMPORT_EXISTS, IPC_HANDLER_REGISTERED, CSS_SELECTOR_EXISTS, JSON_PROPERTY, PATTERN_MATCH, FUNCTION_SIGNATURE) have dedicated evaluator classes.
- Modal system uses type-based routing in modal-manager.js switch-case. Modal renderers return HTML strings. Modal state tracked in component instance. CSS width customization via .modal:has(.classname) selector pattern. Modals handle specific error types for UX feedback.
- Plugin architecture: manifest-driven with puffin-plugin.json (name, version, capabilities, activationEvents). Plugin class implements activate() and deactivate() lifecycle. Registers IPC handlers and SAM actions via PluginContext. Plugins discovered from ~/.puffin/plugins/, validated via JSON Schema, loaded with error isolation.
- Assertion generation uses heuristic pattern matching on acceptance criteria text. Generator deduplicates assertions. Generated assertions marked with criterion reference (AC1, AC2). Interactive editor UI allows review, edit, remove before save. Patterns support all 10 evaluator types.
- Story reference validation: pre-validate all story IDs exist via repository check before transaction starts. Reject invalid IDs with clear error listing which IDs are invalid. On story deletion, cleanup sprint_stories junction table and storyProgress JSON atomically. Load operations filter orphaned references via INNER JOIN.

### Architectural Decisions

- SQLite is the source of truth; in-memory cache is an optimization, not a requirement. Read accessors query SQLite first, update cache from successful reads, fallback to cache only if query fails. Cache invalidation via invalidateCache() forces next read to query database.
- All multi-step database operations use BaseRepository.immediateTransaction() for atomicity. Repository methods wrap CRUD operations in transactions; cache updates occur only after transaction commits. Transaction failure triggers automatic rollback with no partial state.
- Service layer (SprintService) wraps repository operations with pre-validation (fail-fast before transaction), error handling via custom error classes, and callbacks for cache invalidation. Separates repository concerns from business logic orchestration.
- Story creation with assertions: acceptor includes inspectionAssertions field. Assertions persisted to database alongside story in single write. Pre-save validation deduplicates and validates assertion structure. Enables assertion evaluation on story completion.

### Bug Patterns

- Empty arrays [] are truthy in JavaScript. Assertion and story lookups must use .length > 0 checks, not || fallback, to avoid skipping secondary sources when primary returns empty array. Affects code review display, sprint view, and story synchronization.

<!-- puffin:generated-end -->