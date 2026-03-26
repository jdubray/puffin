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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

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

- Plugin extension namespacing uses qualified format ${pluginName}:${extensionName} for actions, acceptors, reactors, components. IPC handlers follow plugin:${pluginName}:${channel} pattern. All registrations automatically prefixed to avoid namespace conflicts across plugins. Plugin state persists to ~/.puffin/plugin-state.json with enable/disable timestamps. Manifests validated against JSON Schema Draft-07 using ajv library. IPC handler naming convention: service:operation format (git:createBranch, claude:sendPrompt, plugins:enable).
- Manifest validation error messages formatted to include field name, invalid value, validation keyword, and developer suggestion. Invalid plugins logged with descriptive errors but don't prevent app startup or other plugins loading. View contributions declared in manifest with schema: id, name, location (sidebar|panel|statusbar|toolbar|editor), optional icon/order/when.
- PluginContext provides sandboxed API for plugins including: registerAction, registerAcceptor, registerReactor, registerComponent, registerIpcHandler for extensions, callAction for cross-plugin action invocation, getService for accessing shared services, context.storage for plugin-scoped file persistence, subscribe/emit for plugin-to-plugin events, log with plugin name prefix, _cleanup for teardown. All registrations track plugin name for batch cleanup on deactivation. All renderer↔main process communication flows through window.puffin.* preload bridge namespace (window.puffin.git.*, window.puffin.claude.*, window.puffin.plugins.*, etc.). Preload script in src/main/preload.js exposes all IPC handlers to renderer.
- Plugin loader emits lifecycle events: plugin:discovered, plugin:validated, plugin:validation-failed, plugin:loaded, plugin:load-failed, plugin:activation-failed, plugin:deactivation-failed.
- State persistence uses whitelist-based action filtering. New SAM action types MUST be added to BOTH persistActions array AND handler condition block. Missing from either location causes silent failure.
- Component event delegation uses bindEvents() during init, remove in destroy(). Data attributes (data-action, data-id) enable declarative event routing instead of direct element references, supporting dynamic content.
- Git service methods provide promise-based API: getRepositoryStatus(), createBranch(), stagePath(), commitChanges(), mergeIntoBranch(), getCommitHistory(), getFileDiff(). IPC handlers expose via 'git:*' namespace. Preload API uses window.puffin.git.* namespace.
- Plugin lifecycle state uses enumeration pattern with values: INACTIVE, ACTIVATING, ACTIVE, DEACTIVATING, ACTIVATION_FAILED. Each state transition sets timestamp for debugging and auditing.
- Sprint progress state structure: storyProgress array containing { storyId, branches: { ui, backend, fullstack, ... each with status/completedAt }, status, completedAt }. Stuck detection state: { isStuck, consecutiveCount, threshold: 3, recentOutputs: [{ hash, summary, timestamp }], lastAction, timestamp }. Sprint error state: { type, message, details, timestamp }.

### Architectural Decisions
- Plugin system architecture uses manifest-driven configuration with discovery, validation, lifecycle hooks (activate/deactivate), and extension registration. Plugins are scanned from ~/.puffin/plugins/ on startup, validated against JSON schema, dependency-resolved via topological sort, and loaded with proper error isolation. Uses layered architecture: Manifest Schema → Plugin Loader with discovery/validation → Lifecycle Management. Each layer depends on the previous. Plugins validated against JSON Schema Draft-07 using ajv+ajv-formats, dependency-resolved via topological sort (Kahn's algorithm), loaded with error isolation (try-catch wrapping prevents crashes).

<!-- puffin:generated-end -->