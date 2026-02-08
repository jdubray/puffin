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
