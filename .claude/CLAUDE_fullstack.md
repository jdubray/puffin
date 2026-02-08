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
- Puffin uses a modular plugin architecture where each plugin follows the pattern: puffin-plugin.json manifest, main.js for IPC handlers and file I/O, and renderer.js/components for UI. Plugins register views, actions, and IPC channels through the manifest.
- Database operations use atomic transactions via immediateTransaction() wrapper to ensure data consistency. All multi-step database operations (sprint creation, story status updates, sprint closure) must complete within a single transaction or rollback completely.
- State management follows a SAM (Simple Application Model) pattern with Actions (intent creators), Acceptors (modify model state), and side effects via state-persistence layer. Changes flow: UI action → action creator → acceptor updates model → state-persistence calls IPC → main process updates database.
- Cache is treated as optimization, not requirement. All CRUD operations query SQLite first, populate cache from results, and work correctly even if cache is empty or stale. Cache invalidation happens after successful database commits.
- Inspection assertions are stored as JSON columns in the user_stories table. Each story contains inspection_assertions array (containing assertion definitions) and assertion_results (containing evaluation outcomes). Assertions are automatically generated when stories are created based on acceptance criteria patterns.
- All IPC communication from renderer to main process uses promise-based async/await pattern. Handlers are registered with context.registerIpcHandler() and invoked via window.puffin.* preload API which bridges to electron ipcRenderer.
- File operations are always async using fs.promises API. Plugin storage is project-scoped and located in .puffin/ directory. Writes use atomic pattern: write to temp file then rename to ensure no partial writes on failure.
- UI components use vanilla JavaScript class pattern with lifecycle methods: constructor(element, options), init(), onActivate(), onDeactivate(), onDestroy(). Parent component receives context via options.context containing storage, logging, and events API.
- Toast notifications follow two patterns: app-wide via window.puffin.state or local ToastManager class for plugin-scoped notifications. Toast data includes: id (UUID), timestamp (ISO 8601), message, type (success/error/info/warning), and optional source field.
- Error handling distinguishes between different error types: DatabaseError, RecordNotFoundError, TransactionError, ActiveSprintExistsError, InvalidStoryIdsError. Custom errors inherit from base Error class and include code property for programmatic handling.
- Git operations are available via window.puffin.git preload API with methods: stageFiles(), commit(message), getStatus(). Git integration is optional - operations fail gracefully if not in git repository or if git unavailable.
- Modal dialogs use ModalManager from renderer/lib/modal-manager.js with standardized API: ModalManager.show({title, content, buttons}) where buttons are {label, action, primary, danger} objects. Modals support confirmation workflows with optional inline error messages.
- No time estimates should ever be given for task completion - focus on what needs to be done and the work required, not how long it will take. Avoid phrases like 'quick fix', 'will take X minutes', or similar time predictions.
- SAM action payload structure: actions include inspectionAssertions field when persisting user stories. Model acceptors copy payload fields directly. State-persistence layer intercepts UPDATE_USER_STORY and related actions to trigger IPC handlers.
- IPC handler naming: state:ACTION_NAME for state mutations, cre:ACTION_NAME for CRE plugin calls, plugins.invoke() for plugin-specific handlers. Preload bridge exposes methods at window.puffin.* with snake_case channel names.
