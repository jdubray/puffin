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
- Plugin extension points use qualified namespacing: ${pluginName}:${name} for actions/acceptors/components, plugin:${pluginName}:${channel} for IPC handlers. This prevents conflicts across multiple plugins.
- Plugin lifecycle states tracked via PluginLifecycleState enum: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition includes timestamp tracking. Plugin must export activate() and deactivate() functions in main entry point.
- Plugin state persists to ~/.puffin/plugin-state.json tracking enabled/disabled status with timestamps. Plugin configurations stored separately. Orphaned plugin states cleaned up automatically. State store used by PluginManager during initialization to restore enabled plugins.
- Plugin manifest validation provides developer-friendly error messages including: field name that failed, the invalid value received, suggestion for how to fix error. Validation errors captured in Plugin object and included in getErrors() results.
- View locations standardized enum: sidebar, panel, statusbar, toolbar, editor. View contributions filtered by location and merged across plugins during plugin discovery phase. Plugin can query views via getViewsByLocation() and hasViews() helpers.
- IPC handler naming follows 'feature:action' pattern (e.g., 'git:createBranch', 'file:saveMarkdown', 'metrics:query'). Plugin extensions use qualified naming: actions/acceptors/components registered as ${pluginName}:${extensionName}. All IPC methods exposed through window.puffin namespace via preload.js bridge.
- SAM actions dispatch model changes which flow through acceptors to update state. State changes that require persistence must be whitelisted in state-persistence.js persistActions array. Pending flags on model must be cleared via action dispatch, not mutated directly. Sprint state includes status field tracking lifecycle: 'created' | 'planning' | 'implementing' | 'completed'.
- Git operations: All Git API calls return {success, data/error} format. Validation happens before execution. Failed operations emit detailed error messages. Branch names validated against Git naming conventions. Operations logged to .puffin/git-operations.json for history tracking.
- Plugin manifest declarations: name (lowercase), version (semver), displayName, description, main (entry point file path). Extension points: actions, acceptors, reactors, components, ipcHandlers. Optional: author, license, repository, keywords, engines. All validated against JSON Schema Draft-07.
- Claude integration: 'sendPrompt' returns {success, response} for simple prompt-response interactions. Uses Haiku model by default for cost efficiency. CLI integration with --print, --output-format=stream-json requires --verbose flag. Tool restriction via disableTools option to prevent model exploration when structured output needed.
- Plugin lifecycle states: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each transition tracked with timestamps (activatedAt, deactivatedAt). Errors captured in activationError property. Plugins persist enabled/disabled state to ~/.puffin/plugin-state.json across restarts.
