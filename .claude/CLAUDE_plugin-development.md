# Plugin Development Context

You are working on **plugin development** for Puffin. This context provides guidelines and architecture patterns to ensure plugins are robust, maintainable, and follow established conventions.

## Plugin Architecture Overview

Puffin uses a lightweight, convention-based plugin system that supports both **Electron main process** and **renderer process** plugins. Plugins extend Puffin's functionality without modifying core code.

### Key Principles

1. **Convention over Configuration**: Plugins follow naming and structure conventions
2. **Isolation**: Each plugin operates independently with clear boundaries
3. **Lifecycle Management**: Plugins have explicit initialization and cleanup phases
4. **Error Resilience**: Plugin failures should not crash the application
5. **Minimal Dependencies**: Plugins should minimize coupling to core code

## Plugin Types

### Main Process Plugins
- Located in `plugins/*-plugin/main.js`
- Run in Electron's main process (Node.js environment)
- Access to file system, OS APIs, and IPC
- Examples: file watchers, system integration, background tasks

### Renderer Process Plugins
- Located in `plugins/*-plugin/renderer.js`
- Run in the browser context
- Access to DOM, UI components, and renderer IPC
- Examples: UI components, modal dialogs, visual extensions

## Plugin Structure

```
plugins/
└── my-feature-plugin/
    ├── main.js          # Main process code (optional)
    ├── renderer.js      # Renderer process code (optional)
    ├── package.json     # Plugin metadata
    └── README.md        # Plugin documentation
```

### Required Exports

**Main Process (`main.js`)**:
```javascript
module.exports = {
  name: 'my-feature-plugin',
  
  // Initialize plugin
  async initialize(context) {
    // context: { ipcMain, app, mainWindow, config, pluginDir }
  },
  
  // Cleanup on shutdown
  async cleanup() {
    // Release resources, clear timers, etc.
  }
};
```

**Renderer Process (`renderer.js`)**:
```javascript
module.exports = {
  name: 'my-feature-plugin',
  
  // Initialize plugin
  async initialize(context) {
    // context: { ipcRenderer, document, window, config, pluginDir }
  },
  
  // Cleanup on shutdown
  async cleanup() {
    // Remove event listeners, clear state, etc.
  }
};
```

## Plugin Loading System

Plugins are loaded by:
1. **Main process**: `src/main/plugin-loader.js`
2. **Renderer process**: `src/renderer/plugin-loader.js`

Both loaders:
- Scan `plugins/` directory for `*-plugin` folders
- Load and validate plugin modules
- Call `initialize()` with context
- Handle errors gracefully (log and continue)
- Track loaded plugins for cleanup

## IPC Communication Pattern

Plugins use IPC channels prefixed with their name:

**Main Process**:
```javascript
ipcMain.handle('my-feature:get-data', async (event, args) => {
  return { data: 'value' };
});
```

**Renderer Process**:
```javascript
const result = await window.api.invoke('my-feature:get-data', args);
```

**Security**: All IPC handlers must validate input and sanitize output.

## Context Injection

### Main Process Context
```javascript
{
  ipcMain,           // Electron IPC main
  app,               // Electron app instance
  mainWindow,        // BrowserWindow instance
  config,            // Application configuration
  pluginDir          // Absolute path to plugin directory
}
```

### Renderer Process Context
```javascript
{
  ipcRenderer,       // Electron IPC renderer (via preload)
  document,          // DOM document
  window,            // Window object
  config,            // Application configuration
  pluginDir          // Relative path to plugin directory
}
```

## Error Handling

### Plugin-Level Errors
- Wrap async operations in try-catch
- Log errors with plugin name prefix
- Return safe defaults on error
- Never throw unhandled exceptions

**Example**:
```javascript
async initialize(context) {
  try {
    await this.setup(context);
  } catch (error) {
    console.error('[my-feature-plugin] Initialization failed:', error);
    // Continue with degraded functionality
  }
}
```

### Loader-Level Errors
- Plugin load failures are logged but don't stop other plugins
- Missing exports are reported clearly
- Invalid plugins are skipped

## Testing Plugins

### Unit Tests
- Place in `tests/plugins/`
- Name: `<plugin-name>.test.js`
- Mock Electron APIs (ipcMain, ipcRenderer)
- Test initialization, cleanup, and core functionality

**Example**:
```javascript
// tests/plugins/my-feature.test.js
const plugin = require('../../plugins/my-feature-plugin/main.js');

describe('my-feature-plugin', () => {
  it('should initialize without errors', async () => {
    const context = { ipcMain: mockIpcMain, ... };
    await expect(plugin.initialize(context)).resolves.not.toThrow();
  });
});
```

### Integration Tests
- Test IPC communication between main and renderer
- Verify UI integration if applicable
- Test error scenarios

## UI Integration Patterns

### Modal Dialogs
Use the centralized `ModalManager`:

```javascript
const ModalManager = require('./lib/modal-manager.js');

ModalManager.show({
  title: 'My Feature',
  content: '<p>Content here</p>',
  buttons: [
    { label: 'OK', primary: true, action: () => { /* handle */ } },
    { label: 'Cancel', action: () => { /* handle */ } }
  ]
});
```

### DOM Manipulation
- Use `document.querySelector()` for element selection
- Attach event listeners in `initialize()`
- Remove listeners in `cleanup()`
- Namespace CSS classes: `.my-feature-*`

### State Management
- Store plugin state in closure or module-level variables
- Persist state via IPC to main process if needed
- Clean up state in `cleanup()`

## Configuration

### Plugin-Specific Config
Store in `plugins/<plugin-name>/config.json`:

```json
{
  "enabled": true,
  "options": {
    "feature1": true,
    "timeout": 5000
  }
}
```

Access via context:
```javascript
async initialize(context) {
  const config = require(path.join(context.pluginDir, 'config.json'));
  this.timeout = config.options.timeout;
}
```

## Common Patterns

### File System Access (Main Process)
```javascript
const fs = require('fs').promises;
const path = require('path');

async initialize(context) {
  const filePath = path.join(context.pluginDir, 'data.json');
  const data = await fs.readFile(filePath, 'utf-8');
}
```

### Timer Management
```javascript
initialize(context) {
  this.timerId = setInterval(() => {
    // periodic task
  }, 1000);
}

cleanup() {
  if (this.timerId) clearInterval(this.timerId);
}
```

### Event Subscriptions
```javascript
initialize(context) {
  this.handler = (event, data) => { /* handle */ };
  context.ipcMain.on('some-event', this.handler);
}

cleanup() {
  if (this.handler) {
    context.ipcMain.removeListener('some-event', this.handler);
  }
}
```

## Documentation Requirements

Each plugin must include:

### README.md
- Purpose and functionality
- Installation (if any special steps)
- Configuration options
- IPC channels exposed
- Known limitations

### Inline Comments
- JSDoc for public methods
- Explain complex logic
- Document IPC contracts

## Security Considerations

1. **Input Validation**: Validate all IPC inputs
2. **Path Traversal**: Use `path.resolve()` and validate paths
3. **Command Injection**: Never execute shell commands from user input
4. **XSS Prevention**: Sanitize any HTML content injected into DOM
5. **Principle of Least Privilege**: Request minimum permissions needed

## Plugin Checklist

Before committing a new plugin:

- [ ] `package.json` with name, version, description
- [ ] Proper exports (name, initialize, cleanup)
- [ ] Error handling in initialize and cleanup
- [ ] IPC channels prefixed with plugin name
- [ ] Event listeners removed in cleanup
- [ ] Timers/intervals cleared in cleanup
- [ ] README.md documentation
- [ ] Unit tests in `tests/plugins/`
- [ ] No hardcoded paths (use context.pluginDir)
- [ ] Input validation on all IPC handlers

## Debugging

### Main Process
```javascript
async initialize(context) {
  console.log('[my-feature-plugin] Initializing with context:', context);
  // Use Chrome DevTools for main process debugging
}
```

### Renderer Process
- Open DevTools: View → Toggle Developer Tools
- Console logs appear in DevTools
- Use breakpoints for step debugging

### Common Issues
- **Plugin not loading**: Check naming convention (`*-plugin`)
- **IPC not working**: Verify channel names match exactly
- **Memory leaks**: Ensure cleanup() removes all listeners
- **State not persisting**: Main process should handle persistence

## Example Plugin Templates

### Minimal Main Process Plugin
```javascript
// plugins/example-plugin/main.js
module.exports = {
  name: 'example-plugin',
  
  async initialize(context) {
    console.log('[example-plugin] Initialized');
    
    context.ipcMain.handle('example:ping', async () => {
      return { status: 'pong' };
    });
  },
  
  async cleanup() {
    console.log('[example-plugin] Cleaned up');
  }
};
```

### Minimal Renderer Process Plugin
```javascript
// plugins/example-plugin/renderer.js
module.exports = {
  name: 'example-plugin',
  
  async initialize(context) {
    console.log('[example-plugin] Renderer initialized');
    
    const button = document.createElement('button');
    button.textContent = 'Test Plugin';
    button.addEventListener('click', async () => {
      const result = await window.api.invoke('example:ping');
      console.log(result);
    });
    document.body.appendChild(button);
  },
  
  async cleanup() {
    // Remove UI elements if needed
  }
};
```

## Resources

- Plugin loader: `src/main/plugin-loader.js`, `src/renderer/plugin-loader.js`
- Modal system: `src/renderer/lib/modal-manager.js`
- IPC preload: `src/main/preload.js`
- Example plugin: `plugins/claude-config-plugin/`

---

**Remember**: Plugins should enhance Puffin without compromising stability. When in doubt, favor simplicity and robustness over complexity.