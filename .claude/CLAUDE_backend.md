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

---

## Backend Working Principles

### 1. Think Before Handling
- Locate the IPC contract: channel name, args shape, return shape. Read the handler + its renderer caller.
- Map the data path: IPC → service → storage. Know what each layer owns before editing.

### 2. Simplicity First
- Don't add parameters "for future flexibility." Add them when a caller needs them.
- Reuse existing services (`claude-service`, `puffin-state`, `metrics-service`) instead of introducing parallel ones.
- Pick one response pattern per handler (`{ success, data }` or throw) and stick with it.

### 3. Surgical Changes
- Edit the specific handler, not the whole file. Leave neighbor handlers untouched.
- Don't rename channels or reshape return payloads unless the task requires it — renderer callers break silently.

### 4. Validate at Boundaries, Trust Inside
- Validate IPC inputs and external data at the edge.
- Trust internal service-to-service calls; don't re-validate at every layer.
- Verify end-to-end: dispatch from renderer, land in handler, persist to DB, re-read. Check logs in both processes.

<!-- puffin:generated-end -->
