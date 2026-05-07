# Code Review: Preload Bridge Completeness Review

**Date:** 2026-04-24

## Summary
Audited all `ipcMain.handle()`/`ipcMain.on()` registrations across `src/main/` (main.js, ipc-handlers.js, cre/index.js, plugins/plugin-context.js) and cross-referenced them against channels exposed via `contextBridge.exposeInMainWorld('puffin', ...)` in `src/main/preload.js`. Also scanned `src/renderer/` for direct `ipcRenderer` or `require('electron')` usage. Found 8 orphaned main-process IPC handlers for the "Claude Agents" subsystem that have no matching preload exposure — they are dead code from the renderer's perspective. No preload-exposed channels are missing a main-process handler, and no renderer file bypasses the preload bridge.

## Findings

- **[IMPORTANT]** ORPHANED_HANDLER src/main/ipc-handlers.js:1277 — `state:getClaudeAgents` is registered via `ipcMain.handle` but not exposed in `preload.js`; renderer cannot invoke it. Confidence: 95.
- **[IMPORTANT]** ORPHANED_HANDLER src/main/ipc-handlers.js:1287 — `state:getClaudeAgent` is registered but has no `window.puffin.*` exposure in preload. Confidence: 95.
- **[IMPORTANT]** ORPHANED_HANDLER src/main/ipc-handlers.js:1300 — `state:assignAgentToBranch` is registered but absent from preload. Confidence: 95.
- **[IMPORTANT]** ORPHANED_HANDLER src/main/ipc-handlers.js:1318 — `state:unassignAgentFromBranch` is registered but absent from preload. Confidence: 95.
- **[IMPORTANT]** ORPHANED_HANDLER src/main/ipc-handlers.js:1336 — `state:getBranchAgents` is registered but absent from preload. Confidence: 95.
- **[IMPORTANT]** ORPHANED_HANDLER src/main/ipc-handlers.js:1346 — `state:getBranchAgentContent` is registered but absent from preload (note: used internally in main via direct `puffinState.getBranchAgentContent(...)` calls — the IPC registration itself is dead). Confidence: 95.
- **[IMPORTANT]** ORPHANED_HANDLER src/main/ipc-handlers.js:1356 — `state:installAgent` is registered but absent from preload. Confidence: 95.
- **[IMPORTANT]** ORPHANED_HANDLER src/main/ipc-handlers.js:1366 — `state:uninstallAgent` is registered but absent from preload. Confidence: 95.