---

## Branch Focus: Backend

You are working on the **backend thread**. Focus on:
- API design and implementation
- Data persistence and database operations
- Business logic and validation
- Error handling and logging
- Security and authentication

## Key Backend Files

| Purpose | Location |
|---------|----------|
| Main entry | `src/main/main.js` |
| IPC handlers | `src/main/ipc-handlers.js` |
| State management | `src/main/puffin-state.js` |
| Claude service | `src/main/claude-service.js` |
| Plugin loader | `src/main/plugin-loader.js` |

## IPC Handler Pattern

```javascript
ipcMain.handle('namespace:action', async (event, args) => {
  try {
    // Validate input
    // Perform operation
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
```

## Branch Memory (auto-extracted)

### Conventions

- Plugin naming convention: *-plugin directories with puffin-plugin.json manifest. IPC channels prefixed with plugin-name (e.g., 'plugin-name:handler'). All plugin registrations use qualified names: ${pluginName}:${featureName}. Plugin lifecycle states tracked via enums: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED.
- Puffin sprint system stores state in .puffin/active-sprint.json with story-level branch tracking (ui, backend, fullstack). Sprint limited to max 4 stories to prevent token limit exceeding during execution. Sprint progress calculated by counting completed branches. Git operations history persisted to .puffin/git-operations.json for auditability.

### Architectural Decisions

- Plugin system uses convention-based discovery from ~/.puffin/plugins/ directory with manifest-driven validation via JSON Schema (ajv). Plugins export activate(context)/deactivate() lifecycle hooks. Extension points (actions, acceptors, components, IPC handlers) are registered through PluginContext with plugin-name-scoped naming to avoid conflicts.

### Bug Patterns

- Plugin-to-plugin communication broken when using this.registry.emit() instead of this.registry.emitPluginEvent() - causes wrong event routing. IPC method exposure requires both handler registration and preload.js binding - missing either layer causes 'not a function' errors. Response property naming inconsistency between API layers (response.content vs response.response) breaks consumers.
