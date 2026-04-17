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

---

## Fullstack Working Principles

### 1. Think Before Wiring
- Trace the full path before touching anything: user intent → SAM action → IPC call → main handler → service → persistence → event back → SAM acceptor → render.
- Identify which layer actually needs the change. Adding fields everywhere is the fullstack anti-pattern.

### 2. Simplicity First
- Use existing IPC channels when possible; don't invent a new one for a variant of an existing call.
- Let SAM acceptors own state mutation. Don't mutate `this.state.*` in handlers — it's a transient copy.
- Persistence should be declarative (whitelist in `state-persistence.js`), not ad-hoc.

### 3. Surgical Changes
- When a bug lives at one layer, fix it there. Don't propagate defensive checks up and down the stack.
- Keep preload `window.puffin.*` additions minimal — every surface is a contract.
- Don't rename actions, channels, or acceptor names unless the task is a rename.

### 4. Verify the Full Loop
- Test the round-trip: click in UI → state should change AND persist to `.puffin/`. Reload and confirm.
- Check both DevTools (renderer) AND terminal (main) logs. One-sided verification misses IPC mismatches.

<!-- puffin:generated-end -->
