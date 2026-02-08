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
