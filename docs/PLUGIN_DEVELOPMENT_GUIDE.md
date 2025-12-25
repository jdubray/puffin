I'll create a comprehensive Plugin Development Guide specification. Since this is documentation, I can produce it in this specifications thread.

---

# Puffin Plugin Development Guide

## Specification Document

---

## 1. Overview

Puffin plugins extend the application's functionality through a well-defined API. Plugins can:

- Register **actions** (SAM pattern commands)
- Register **acceptors** (model state handlers)
- Register **reactors** (side-effect handlers)
- Register **UI components**
- Handle **IPC messages** from the renderer
- Communicate with **other plugins** via events
- Persist **plugin-specific data**

---

## 2. Plugin Structure

### Directory Layout

```
~/.puffin/plugins/
└── my-plugin/
    ├── puffin-plugin.json    # Required: Plugin manifest
    ├── index.js              # Required: Entry point (or as specified in manifest)
    ├── package.json          # Optional: For npm dependencies
    └── src/                   # Optional: Additional source files
        └── ...
```

### Minimal Plugin Example

**puffin-plugin.json**
```json
{
  "name": "hello-world",
  "version": "1.0.0",
  "displayName": "Hello World Plugin",
  "description": "A simple example plugin",
  "main": "index.js"
}
```

**index.js**
```javascript
module.exports = {
  async activate(context) {
    context.log.info('Hello World plugin activated!')
    
    // Register an action
    context.registerAction('sayHello', (payload) => {
      return { message: `Hello, ${payload.name || 'World'}!` }
    })
  },
  
  async deactivate() {
    // Cleanup resources if needed
  }
}
```

---

## 3. Plugin Manifest Reference

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Unique identifier (lowercase, alphanumeric, hyphens) | `"my-plugin"` |
| `version` | string | Semantic version | `"1.0.0"` |
| `displayName` | string | Human-readable name (max 50 chars) | `"My Plugin"` |
| `description` | string | Brief description (max 500 chars) | `"Does something useful"` |
| `main` | string | Entry point path relative to plugin directory | `"index.js"` |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `author` | string \| object | Author name or `{ name, email, url }` |
| `license` | string | SPDX license identifier |
| `repository` | string \| object | Repository URL or `{ type, url }` |
| `homepage` | string | Documentation URL |
| `keywords` | string[] | Search keywords (max 20) |
| `engines` | object | Version requirements: `{ puffin: ">=2.0.0" }` |
| `dependencies` | object | Other plugin dependencies |
| `private` | boolean | Prevent registry publication |

### Extension Points Declaration

```json
{
  "extensionPoints": {
    "actions": ["myAction", "anotherAction"],
    "acceptors": ["myAcceptor"],
    "reactors": ["myReactor"],
    "components": ["my-component"],
    "ipcHandlers": ["getData", "saveData"]
  }
}
```

### Contributions (UI Integration)

```json
{
  "contributions": {
    "commands": [
      {
        "id": "myPlugin.doSomething",
        "title": "Do Something",
        "category": "My Plugin",
        "icon": "play"
      }
    ],
    "menus": [
      {
        "location": "tools",
        "command": "myPlugin.doSomething"
      }
    ],
    "configuration": {
      "apiEndpoint": {
        "type": "string",
        "default": "https://api.example.com",
        "description": "API endpoint URL"
      }
    }
  }
}
```

### Activation Events

```json
{
  "activationEvents": [
    "onStartup",
    "onCommand:myPlugin.doSomething",
    "onView:myView"
  ]
}
```

---

## 4. Plugin Context API

When your plugin's `activate()` function is called, it receives a `PluginContext` object with the following APIs:

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `pluginName` | string | Your plugin's name |
| `pluginDirectory` | string | Absolute path to plugin directory |
| `log` | Logger | Namespaced logger instance |
| `storage` | Storage | Plugin-scoped storage interface |

### Registration Methods

#### `registerAction(name, handler)`

Register a SAM action that can be dispatched.

```javascript
context.registerAction('createItem', async (payload) => {
  const { title, description } = payload
  // Process the action
  return { id: 123, title, description }
})
```

- **name**: Action identifier (will be namespaced as `pluginName:name`)
- **handler**: `(payload: any) => any | Promise<any>`

#### `registerAcceptor(name, handler)`

Register a model acceptor for state mutations.

```javascript
context.registerAcceptor('itemAcceptor', (model) => (proposal) => {
  if (proposal.type === 'ADD_ITEM') {
    model.items.push(proposal.item)
  }
})
```

- **handler**: `(model) => (proposal) => void`

#### `registerReactor(name, handler)`

Register a reactor for side effects.

```javascript
context.registerReactor('itemReactor', (model) => {
  if (model.items.length > 100) {
    console.warn('Item limit approaching!')
  }
})
```

- **handler**: `(model) => void`

#### `registerComponent(name, component)`

Register a UI component.

```javascript
context.registerComponent('item-list', {
  render: (props) => { /* ... */ }
})
```

#### `registerIpcHandler(channel, handler)`

Register an IPC handler for renderer communication.

```javascript
context.registerIpcHandler('fetchItems', async (filters) => {
  const items = await db.query(filters)
  return items
})
```

- Channel becomes `plugin:pluginName:channel`
- Handler receives args (without event object)
- Return value is wrapped: `{ success: true, data: result }`
- Errors are caught and returned as: `{ success: false, error: message }`

**Calling from renderer:**
```javascript
const result = await window.puffin.ipc.invoke('plugin:my-plugin:fetchItems', { limit: 10 })
```

### Storage API

Access via `context.storage` or `context.getStorage()`:

```javascript
// Store data
await context.storage.set('settings', { theme: 'dark' })

// Retrieve data
const settings = await context.storage.get('settings')
// Returns: { theme: 'dark' } or undefined

// Delete data
await context.storage.delete('settings')

// List all keys
const keys = await context.storage.keys()
// Returns: ['settings', 'cache', ...]

// Clear all data
await context.storage.clear()

// Get storage directory path
const storagePath = context.storage.path
// Returns: ~/.puffin/plugin-data/my-plugin/
```

Data is stored as JSON files in `~/.puffin/plugin-data/{pluginName}/`.

### Logging API

Access via `context.log` or `context.getLogger()`:

```javascript
context.log.debug('Detailed debug info')
context.log.info('General information')
context.log.warn('Warning message')
context.log.error('Error occurred', errorDetails)
```

All logs are prefixed with `[Plugin:pluginName]`.

### Plugin Communication

#### Subscribe to Events

```javascript
const unsubscribe = context.subscribe('other-plugin:dataUpdated', (event) => {
  console.log('Data updated by:', event.source)
  console.log('New data:', event.data)
})

// Later, to stop listening:
unsubscribe()
```

#### Emit Events

```javascript
context.emit('dataUpdated', { items: newItems })
// Other plugins subscribed to 'my-plugin:dataUpdated' will receive this
```

#### Call Other Plugin Actions

```javascript
const result = await context.callAction('other-plugin:processData', { input: data })
```

### Utility Methods

```javascript
// Get plugin directory
const dir = context.getPluginDirectory()

// Get a shared service
const gitService = context.getService('git')

// Get registration summary
const summary = context.getRegistrationSummary()
// Returns: { actions: 2, acceptors: 1, reactors: 0, components: 1, ipcHandlers: 3 }
```

---

## 5. Plugin Lifecycle

### States

```
┌──────────────┐
│  discovered  │  Plugin found in directory
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  validated   │  Manifest validated successfully
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   loaded     │  Module require() succeeded
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  activating  │  activate() being called
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   active     │  Plugin running
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ deactivating │  deactivate() being called
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  inactive    │  Plugin stopped
└──────────────┘
```

### Activation

```javascript
module.exports = {
  async activate(context) {
    // 1. Initialize resources
    this.db = await Database.connect()
    
    // 2. Register extensions
    context.registerAction('query', this.handleQuery.bind(this))
    context.registerIpcHandler('search', this.handleSearch.bind(this))
    
    // 3. Subscribe to events
    this.unsubscribe = context.subscribe('app:ready', this.onAppReady.bind(this))
    
    // 4. Load persisted state
    this.settings = await context.storage.get('settings') || {}
    
    context.log.info('Plugin activated')
  }
}
```

### Deactivation

```javascript
module.exports = {
  async deactivate() {
    // 1. Save state
    await this.context.storage.set('settings', this.settings)
    
    // 2. Close connections
    await this.db.disconnect()
    
    // 3. Cancel pending operations
    this.pendingRequests.forEach(r => r.cancel())
    
    // Note: IPC handlers and registry entries are cleaned up automatically
    console.log('Plugin deactivated')
  }
}
```

---

## 6. Best Practices

### Error Handling

```javascript
context.registerAction('riskyOperation', async (payload) => {
  try {
    return await performOperation(payload)
  } catch (error) {
    context.log.error('Operation failed:', error.message)
    throw error  // Let the system handle it
  }
})
```

### Async Initialization

```javascript
async activate(context) {
  // Don't block activation with long operations
  this.initPromise = this.initializeAsync()
  
  context.registerAction('getData', async () => {
    await this.initPromise  // Wait only when needed
    return this.data
  })
}
```

### Cleanup Resources

```javascript
async activate(context) {
  this.intervals = []
  this.intervals.push(setInterval(this.poll, 5000))
}

async deactivate() {
  this.intervals.forEach(clearInterval)
}
```

### Namespace Your Events

```javascript
// Good: Clearly namespaced
context.emit('cacheCleared', { timestamp: Date.now() })

// The event will be emitted as 'my-plugin:cacheCleared'
```

### Validate Input

```javascript
context.registerAction('updateSettings', (payload) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be an object')
  }
  if (payload.timeout && typeof payload.timeout !== 'number') {
    throw new Error('timeout must be a number')
  }
  // ... proceed
})
```

---

## 7. Common Patterns

### Singleton Plugin Class

```javascript
class MyPlugin {
  async activate(context) {
    this.context = context
    this.context.registerAction('doWork', this.doWork.bind(this))
  }
  
  async doWork(payload) {
    this.context.log.info('Doing work...')
    return { success: true }
  }
  
  async deactivate() {
    // Cleanup
  }
}

module.exports = new MyPlugin()
```

### Factory Pattern

```javascript
module.exports = {
  activate(context) {
    const handler = createHandler(context)
    context.registerAction('handle', handler)
  },
  deactivate() {}
}

function createHandler(context) {
  return async (payload) => {
    context.log.info('Handling:', payload)
    return processPayload(payload)
  }
}
```

### Event-Driven Communication

```javascript
// Plugin A
context.emit('userLoggedIn', { userId: 123 })

// Plugin B
context.subscribe('plugin-a:userLoggedIn', ({ data }) => {
  console.log('User logged in:', data.userId)
  loadUserPreferences(data.userId)
})
```

---

## 8. Testing Plugins

### Unit Testing

```javascript
const { PluginContext } = require('puffin/testing')

describe('MyPlugin', () => {
  let context
  let plugin
  
  beforeEach(() => {
    context = new PluginContext('test-plugin', '/tmp/test')
    plugin = require('./index')
  })
  
  it('should register actions on activate', async () => {
    await plugin.activate(context)
    
    expect(context.getRegistrationSummary().actions).toBe(1)
  })
  
  it('should handle action correctly', async () => {
    await plugin.activate(context)
    
    const action = context.registry.getAction('test-plugin:myAction')
    const result = await action({ input: 'test' })
    
    expect(result.output).toBe('processed: test')
  })
})
```

### Integration Testing

```javascript
const { PluginLoader, PluginManager } = require('puffin/plugins')

describe('Plugin Integration', () => {
  let manager
  
  beforeAll(async () => {
    const loader = new PluginLoader('/path/to/test/plugins')
    await loader.loadPlugins()
    
    manager = new PluginManager({ loader })
    await manager.initialize()
  })
  
  afterAll(async () => {
    await manager.shutdown()
  })
  
  it('should activate and respond to IPC', async () => {
    const info = await manager.getPluginInfo('my-plugin')
    expect(info.isActive).toBe(true)
  })
})
```

---

## 9. Debugging

### Enable Debug Logging

Plugins can use the provided logger which automatically namespaces output:

```javascript
context.log.debug('Detailed debug info')  // Only shown in debug mode
context.log.info('Important info')
context.log.warn('Warning')
context.log.error('Error', error)
```

### Check Plugin State

From the Puffin UI or via IPC:

```javascript
// Get plugin info
const info = await window.puffin.plugins.getInfo('my-plugin')
console.log(info)
// {
//   name: 'my-plugin',
//   version: '1.0.0',
//   isActive: true,
//   isEnabled: true,
//   registrations: { actions: 2, ... },
//   activationError: null
// }

// Get registry summary
const registry = await window.puffin.plugins.getRegistrySummary()
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Plugin not discovered | Missing/invalid manifest | Check `puffin-plugin.json` exists and is valid JSON |
| Validation failed | Schema mismatch | Check required fields: name, version, displayName, description, main |
| Load failed | Entry point error | Check `main` file exists and has no syntax errors |
| Activation failed | Error in activate() | Check logs for stack trace, wrap in try-catch |
| IPC not working | Wrong channel name | Use `plugin:pluginName:channel` format |

---

## 10. Publishing (Future)

> Note: Plugin marketplace is planned for a future release.

When available, plugins can be published to the Puffin plugin registry:

```bash
puffin plugin publish
```

Ensure your manifest includes:
- Valid `name` (unique in registry)
- `version` following semver
- `description`
- `author`
- `license`
- `repository`

---

## Appendix: Complete Example Plugin

### Analytics Plugin

**puffin-plugin.json**
```json
{
  "name": "puffin-analytics",
  "version": "1.0.0",
  "displayName": "Analytics Dashboard",
  "description": "Track prompt usage and response metrics",
  "main": "index.js",
  "author": {
    "name": "Developer",
    "email": "dev@example.com"
  },
  "license": "MIT",
  "keywords": ["analytics", "metrics", "dashboard"],
  "extensionPoints": {
    "actions": ["trackEvent", "getMetrics"],
    "ipcHandlers": ["getStats", "exportData"]
  },
  "contributions": {
    "commands": [
      {
        "id": "analytics.showDashboard",
        "title": "Show Analytics Dashboard",
        "category": "Analytics"
      }
    ]
  }
}
```

**index.js**
```javascript
class AnalyticsPlugin {
  constructor() {
    this.events = []
    this.context = null
  }

  async activate(context) {
    this.context = context
    
    // Load persisted data
    this.events = await context.storage.get('events') || []
    
    // Register actions
    context.registerAction('trackEvent', this.trackEvent.bind(this))
    context.registerAction('getMetrics', this.getMetrics.bind(this))
    
    // Register IPC handlers
    context.registerIpcHandler('getStats', this.getStats.bind(this))
    context.registerIpcHandler('exportData', this.exportData.bind(this))
    
    // Subscribe to app events
    this.unsubscribe = context.subscribe('prompt:completed', this.onPromptCompleted.bind(this))
    
    context.log.info(`Loaded ${this.events.length} historical events`)
  }

  async deactivate() {
    // Save data
    await this.context.storage.set('events', this.events)
    this.context.log.info('Analytics data saved')
  }

  trackEvent(payload) {
    const event = {
      ...payload,
      timestamp: Date.now()
    }
    this.events.push(event)
    
    // Emit for other plugins
    this.context.emit('eventTracked', event)
    
    return event
  }

  getMetrics() {
    const now = Date.now()
    const dayAgo = now - 24 * 60 * 60 * 1000
    
    const recentEvents = this.events.filter(e => e.timestamp > dayAgo)
    
    return {
      total: this.events.length,
      last24Hours: recentEvents.length,
      byType: this.groupBy(recentEvents, 'type')
    }
  }

  async getStats(filters = {}) {
    let events = this.events
    
    if (filters.startDate) {
      events = events.filter(e => e.timestamp >= filters.startDate)
    }
    if (filters.endDate) {
      events = events.filter(e => e.timestamp <= filters.endDate)
    }
    
    return {
      count: events.length,
      events: events.slice(-100)  // Last 100
    }
  }

  async exportData(format = 'json') {
    if (format === 'json') {
      return JSON.stringify(this.events, null, 2)
    }
    if (format === 'csv') {
      return this.toCSV(this.events)
    }
    throw new Error(`Unsupported format: ${format}`)
  }

  onPromptCompleted({ data }) {
    this.trackEvent({
      type: 'prompt',
      tokens: data.tokens,
      duration: data.duration
    })
  }

  groupBy(arr, key) {
    return arr.reduce((acc, item) => {
      const k = item[key] || 'unknown'
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})
  }

  toCSV(data) {
    if (data.length === 0) return ''
    const headers = Object.keys(data[0])
    const rows = data.map(row => headers.map(h => row[h]).join(','))
    return [headers.join(','), ...rows].join('\n')
  }
}

module.exports = new AnalyticsPlugin()
```

---

This specification document provides comprehensive guidance for plugin developers. Implementation of example plugins and the `PLUGIN_DEVELOPMENT.md` documentation file should occur in an appropriate implementation branch.