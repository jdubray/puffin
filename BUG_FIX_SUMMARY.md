# Bug Fix Summary: Missing IPC Handlers

## Issue
The application was throwing errors on startup:
- `Error: No handler registered for 'plugin:get-all-style-paths'`
- `Error: No handler registered for 'plugin:get-sidebar-views'`

## Root Cause
The `setupViewRegistryHandlers()` and `setupPluginStyleHandlers()` functions were defined in `ipc-handlers.js` and exported, but were never called in `main.js`. This meant the IPC handlers they register were never set up, causing the renderer to fail when trying to communicate with the main process about plugins.

## Changes Made

### 1. Updated `src/main/main.js`
- **Line 12**: Added imports for `setupViewRegistryHandlers` and `setupPluginStyleHandlers`
  ```javascript
  const { setupIpcHandlers, setupPluginHandlers, setupPluginManagerHandlers,
          setupViewRegistryHandlers, setupPluginStyleHandlers, getPuffinState } = require('./ipc-handlers')
  ```

- **Lines 381-385**: Added function calls to register the missing IPC handlers
  ```javascript
  // Setup view registry IPC handlers
  setupViewRegistryHandlers(ipcMain, pluginManager.getViewRegistry(), mainWindow)

  // Setup plugin style handlers
  setupPluginStyleHandlers(ipcMain, pluginManager)
  ```

### 2. Updated `src/main/main.js` - PluginManager Handler Signature
- **Line 379**: Updated `setupPluginManagerHandlers` call to include `mainWindow` parameter
  ```javascript
  setupPluginManagerHandlers(ipcMain, pluginManager, mainWindow)
  ```

## Affected Components

### IPC Handlers Now Registered
1. **View Registry Handlers** (`setupViewRegistryHandlers`):
   - `plugin:get-sidebar-views`
   - `plugin:get-panel-views`
   - `plugin:get-statusbar-views`
   - `plugin:get-toolbar-views`
   - `plugin:get-views-by-location`

2. **Plugin Style Handlers** (`setupPluginStyleHandlers`):
   - `plugin:get-renderer-config`
   - `plugin:get-style-paths`
   - `plugin:get-all-style-paths`

## Verification
All handlers are now properly registered during plugin system initialization:
1. Plugin loader is initialized
2. Plugin manager is created with services (including HistoryService)
3. Event listeners are attached
4. **IPC handlers are registered** (this was missing before)
5. Plugins are activated

## Impact
- Plugins can now properly communicate with the main process
- Plugin views can be discovered and loaded
- Plugin styles can be injected into the renderer
- No more console errors on application startup

## Additional Improvements
The stats-plugin was also updated to use the newly available HistoryService:
- Gets real history data instead of mock data
- Computes weekly statistics from actual prompts
- Displays branch information from the project

## Testing Checklist
- [x] Application starts without IPC handler errors
- [x] HistoryService is available to plugins via `context.getService('history')`
- [x] Stats plugin can access real history data
- [x] Plugin views can be loaded and rendered
- [x] Plugin styles are properly injected

## Files Modified
1. `src/main/main.js` - Added missing handler registrations
2. `plugins/stats-plugin/index.js` - Updated to use HistoryService (user modified)
