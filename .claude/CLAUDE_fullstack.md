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

<!-- puffin:generated-end -->
