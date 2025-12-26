# Plugin System Implementation Plan

## Sprint Planning: Backend Thread

This document outlines the implementation plan for the plugin system backend stories.

---

## 1. Architecture Analysis

### How Stories Fit Together

The three stories form a layered architecture with clear dependencies:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Story 3: Plugin Lifecycle                    │
│     activate()/deactivate() hooks, PluginContext, state mgmt   │
├─────────────────────────────────────────────────────────────────┤
│                    Story 2: Plugin Loader                       │
│         Directory scanning, manifest validation, loading        │
├─────────────────────────────────────────────────────────────────┤
│                   Story 1: Manifest Schema                      │
│          JSON schema definition, validation utilities           │
└─────────────────────────────────────────────────────────────────┘
```

### Shared Components

| Component | Used By | Purpose |
|-----------|---------|---------|
| `PluginManifest` schema | Stories 1, 2, 3 | Defines plugin structure |
| `ManifestValidator` | Stories 1, 2 | Validates plugin.json files |
| `PluginContext` | Stories 2, 3 | Provides plugin API surface |
| Plugin events | Stories 2, 3 | Lifecycle notifications |
| Plugin state storage | Story 3 | Enabled/disabled persistence |

---

## 2. Implementation Order

### Recommended Order: Story 1 → Story 2 → Story 3

**Rationale:**
1. **Story 1 (Manifest Schema)** establishes the data contract - other stories depend on this
2. **Story 2 (Plugin Loader)** builds on the schema to discover and load plugins
3. **Story 3 (Lifecycle)** adds the final layer of runtime management

### Dependency Graph

```
Story 1: Manifest Schema
    │
    ├──► Story 2: Plugin Loader (depends on schema validation)
    │        │
    │        └──► Story 3: Lifecycle Management (depends on loader)
    │
    └──► Story 3: Lifecycle Management (PluginContext uses manifest types)
```

---

## 3. Technical Approach

### Story 1: Plugin Manifest Schema Definition

**Technical Decisions:**
- Use JSON Schema Draft-07 for validation (compatible with `ajv` library)
- Store schema in `src/main/plugins/manifest-schema.json` for easy updates
- Create `ManifestValidator` class wrapping `ajv` for validation
- Error messages should be developer-friendly with field paths

**Key Components:**

```javascript
// src/main/plugins/manifest-schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["name", "version", "displayName", "description", "main"],
  "properties": {
    "name": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "displayName": { "type": "string", "minLength": 1 },
    "description": { "type": "string" },
    "main": { "type": "string" },
    "author": { "type": "string" },
    "license": { "type": "string" },
    "repository": { "type": "string", "format": "uri" },
    "keywords": { "type": "array", "items": { "type": "string" } },
    "engines": {
      "type": "object",
      "properties": {
        "puffin": { "type": "string" }
      }
    },
    "extensionPoints": {
      "type": "object",
      "properties": {
        "actions": { "type": "array", "items": { "type": "string" } },
        "acceptors": { "type": "array", "items": { "type": "string" } },
        "reactors": { "type": "array", "items": { "type": "string" } },
        "components": { "type": "array", "items": { "type": "string" } },
        "ipcHandlers": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

```javascript
// src/main/plugins/manifest-validator.js
class ManifestValidator {
  validate(manifest) -> { valid: boolean, errors: ValidationError[] }
  validateFile(filepath) -> Promise<{ valid: boolean, errors: ValidationError[], manifest?: object }>
}
```

**File Changes:**
- `src/main/plugins/manifest-schema.json` (NEW) - JSON Schema definition
- `src/main/plugins/manifest-validator.js` (NEW) - Validation logic
- `docs/PLUGIN_MANIFEST.md` (NEW) - Developer documentation

---

### Story 2: Plugin Loader Service

**Technical Decisions:**
- Follow existing service pattern (see `PuffinState`, `GitService`)
- Scan `~/.puffin/plugins/` directory (cross-platform user directory)
- Use `os.homedir()` to get user home directory
- Emit events using Node.js `EventEmitter` pattern
- Load plugins in dependency order using topological sort
- Invalid plugins logged but don't block application startup

**Key Components:**

```javascript
// src/main/plugins/plugin-loader.js
class PluginLoader extends EventEmitter {
  constructor(validator)

  // Events: 'plugin:discovered', 'plugin:validated', 'plugin:validation-failed',
  //         'plugin:loaded', 'plugin:load-failed', 'plugins:complete'

  async discoverPlugins() -> Plugin[]
  async loadPlugins() -> LoadResult
  getPlugin(name) -> Plugin | null
  getLoadedPlugins() -> Plugin[]
}
```

**Directory Structure:**
```
~/.puffin/
└── plugins/
    ├── plugin-one/
    │   ├── puffin-plugin.json
    │   └── index.js
    └── plugin-two/
        ├── puffin-plugin.json
        └── src/
            └── main.js
```

**Dependency Resolution:**
- Manifest can declare `dependencies: { "other-plugin": "^1.0.0" }`
- Use Kahn's algorithm for topological sort
- Circular dependencies should be detected and reported as error

**File Changes:**
- `src/main/plugins/plugin-loader.js` (NEW) - Plugin discovery and loading
- `src/main/plugins/index.js` (NEW) - Module exports
- `src/main/ipc-handlers.js` (MODIFY) - Add plugin IPC handlers setup
- `src/main/main.js` (MODIFY) - Initialize PluginLoader on startup

---

### Story 3: Plugin Lifecycle Management

**Technical Decisions:**
- Plugin main exports must have `activate(context)` and `deactivate()` functions
- `PluginContext` provides safe, sandboxed API access
- Plugin state stored in `~/.puffin/plugin-state.json`
- Hot enable/disable without restart using dynamic require/unrequire
- Use `vm` module consideration for sandboxing (future enhancement)

**Key Components:**

```javascript
// src/main/plugins/plugin-context.js
class PluginContext {
  constructor(pluginName, services)

  // Registration APIs
  registerAction(name, handler)
  registerAcceptor(name, handler)
  registerReactor(name, handler)
  registerComponent(name, component)
  registerIpcHandler(channel, handler)

  // Utilities
  getLogger() -> PluginLogger
  getStorage() -> PluginStorage  // Scoped to plugin directory
  getConfig() -> object  // Plugin-specific config
}
```

```javascript
// src/main/plugins/plugin-manager.js
class PluginManager extends EventEmitter {
  constructor(loader, stateStore)

  // Events: 'plugin:activating', 'plugin:activated', 'plugin:deactivating',
  //         'plugin:deactivated', 'plugin:error'

  async activatePlugin(name) -> boolean
  async deactivatePlugin(name) -> boolean
  async enablePlugin(name) -> boolean   // Persist enabled state
  async disablePlugin(name) -> boolean  // Persist disabled state
  getPluginState(name) -> 'active' | 'inactive' | 'error'
  getAllPluginStates() -> Map<string, PluginState>
}
```

```javascript
// src/main/plugins/plugin-state-store.js
class PluginStateStore {
  constructor(statePath)

  async getState(pluginName) -> { enabled: boolean, config: object }
  async setState(pluginName, state)
  async getAllStates() -> Map<string, PluginState>
}
```

**Plugin Interface (for plugin developers):**

```javascript
// Example: ~/.puffin/plugins/my-plugin/index.js
module.exports = {
  async activate(context) {
    // Called when plugin loads
    context.registerAction('myAction', myActionHandler)
    context.registerIpcHandler('my-plugin:getData', async () => { ... })
  },

  async deactivate() {
    // Called on unload - cleanup resources
  }
}
```

**File Changes:**
- `src/main/plugins/plugin-context.js` (NEW) - Plugin API context
- `src/main/plugins/plugin-manager.js` (NEW) - Lifecycle management
- `src/main/plugins/plugin-state-store.js` (NEW) - State persistence
- `src/main/plugins/plugin-registry.js` (NEW) - Track registered handlers
- `src/main/ipc-handlers.js` (MODIFY) - Add plugin management IPC handlers

---

## 4. File Changes Summary

### New Files

| File | Story | Purpose |
|------|-------|---------|
| `src/main/plugins/manifest-schema.json` | 1 | JSON Schema for puffin-plugin.json |
| `src/main/plugins/manifest-validator.js` | 1 | Schema validation utilities |
| `src/main/plugins/plugin-loader.js` | 2 | Plugin discovery and loading |
| `src/main/plugins/plugin-context.js` | 3 | Plugin API surface |
| `src/main/plugins/plugin-manager.js` | 3 | Lifecycle orchestration |
| `src/main/plugins/plugin-state-store.js` | 3 | State persistence |
| `src/main/plugins/plugin-registry.js` | 3 | Handler registration tracking |
| `src/main/plugins/index.js` | 2, 3 | Module exports |
| `docs/PLUGIN_MANIFEST.md` | 1 | Developer documentation |
| `docs/PLUGIN_DEVELOPMENT.md` | 3 | Plugin development guide |

### Modified Files

| File | Story | Changes |
|------|-------|---------|
| `src/main/main.js` | 2, 3 | Initialize PluginLoader and PluginManager |
| `src/main/ipc-handlers.js` | 2, 3 | Add `setupPluginHandlers()` |
| `src/main/preload.js` | 2, 3 | Expose plugin IPC methods |
| `package.json` | 1 | Add `ajv` dependency for schema validation |

---

## 5. Risk Assessment

### High Risk

| Risk | Story | Mitigation |
|------|-------|------------|
| Plugin code crashes main process | 2, 3 | Wrap all plugin calls in try-catch, consider vm sandboxing |
| Malicious plugins | 3 | Document security model, consider signing in future |
| Memory leaks from plugins | 3 | Track registered handlers, force cleanup on deactivate |

### Medium Risk

| Risk | Story | Mitigation |
|------|-------|------------|
| Circular dependencies | 2 | Implement cycle detection in dependency resolver |
| Hot reload state loss | 3 | Document limitations, provide state migration hooks |
| Schema evolution | 1 | Version the schema, support migration paths |

### Low Risk

| Risk | Story | Mitigation |
|------|-------|------------|
| Plugin load order non-deterministic | 2 | Sort alphabetically when no dependencies |
| Missing plugin directory | 2 | Create directory on first access |
| Invalid plugin state file | 3 | Graceful fallback to default state |

---

## 6. Complexity Assessment

| Story | Complexity | Rationale |
|-------|------------|-----------|
| **Story 1: Manifest Schema** | **Low** | Well-defined problem, existing libraries (ajv) handle heavy lifting |
| **Story 2: Plugin Loader** | **Medium** | Directory scanning is straightforward; dependency resolution adds complexity |
| **Story 3: Lifecycle Management** | **High** | State management, hot reload, error handling, cleanup all add complexity |

---

## 7. Implementation Phases

### Phase 1: Foundation (Story 1)
**Estimated scope:** 1-2 sessions

1. Create `manifest-schema.json` with all required/optional fields
2. Implement `ManifestValidator` class with ajv
3. Write unit tests for schema validation
4. Create `docs/PLUGIN_MANIFEST.md` documentation

### Phase 2: Discovery (Story 2)
**Estimated scope:** 2-3 sessions

1. Create `PluginLoader` class with directory scanning
2. Implement manifest validation during discovery
3. Add dependency resolution with topological sort
4. Emit events for discovery lifecycle
5. Integrate with `main.js` startup
6. Add IPC handlers for plugin listing
7. Write unit/integration tests

### Phase 3: Lifecycle (Story 3)
**Estimated scope:** 3-4 sessions

1. Create `PluginContext` with registration APIs
2. Create `PluginStateStore` for persistence
3. Create `PluginManager` for lifecycle orchestration
4. Implement activate/deactivate flow
5. Implement enable/disable with persistence
6. Add IPC handlers for plugin management
7. Create `PluginRegistry` for handler tracking
8. Write comprehensive tests
9. Create `docs/PLUGIN_DEVELOPMENT.md`

---

## 8. API Design

### IPC Channels (new)

```javascript
// Plugin management channels
'plugins:list'          // Get all discovered plugins
'plugins:getState'      // Get plugin state (enabled/disabled/active)
'plugins:enable'        // Enable a plugin (persists)
'plugins:disable'       // Disable a plugin (persists)
'plugins:reload'        // Force reload a plugin
'plugins:getErrors'     // Get plugin load/validation errors
```

### Events (emitted by PluginManager)

```javascript
'plugin:discovered'     // { name, manifest }
'plugin:validated'      // { name, manifest }
'plugin:validation-failed' // { name, errors }
'plugin:loaded'         // { name }
'plugin:load-failed'    // { name, error }
'plugin:activating'     // { name }
'plugin:activated'      // { name }
'plugin:deactivating'   // { name }
'plugin:deactivated'    // { name }
'plugin:error'          // { name, error }
'plugins:complete'      // { loaded: [], failed: [] }
```

---

## 9. Testing Strategy

### Unit Tests

- `ManifestValidator`: Valid/invalid schema cases
- `PluginLoader`: Directory scanning, validation, dependency sorting
- `PluginManager`: Lifecycle state transitions
- `PluginStateStore`: Persistence read/write

### Integration Tests

- Full plugin lifecycle: discover → validate → load → activate → deactivate
- Error recovery: invalid plugin doesn't crash app
- Dependency ordering: plugins load in correct order
- Hot reload: disable → enable without restart

### Manual Testing

- Create sample plugin in `~/.puffin/plugins/`
- Verify discovery and activation
- Test enable/disable persistence across restarts

---

## 10. Open Questions

1. **Sandbox security**: Should we use `vm` module for plugin isolation?
   - Recommendation: Defer to future enhancement, document trust model

2. **Plugin communication**: Should plugins be able to communicate with each other?
   - Recommendation: Yes, via PluginContext.getPlugin() API

3. **Renderer-side plugins**: Should plugins be able to inject UI components?
   - Recommendation: Yes, but implement in separate UI story (out of scope)

4. **Plugin updates**: How should plugin updates be handled?
   - Recommendation: Manual for v1, consider auto-update in future

---

## 11. Success Criteria

### Story 1: Manifest Schema
- [ ] JSON Schema validates all required fields
- [ ] Schema validates extension points structure
- [ ] Validation errors include field path and helpful message
- [ ] Documentation is clear and includes examples

### Story 2: Plugin Loader
- [ ] Scans `~/.puffin/plugins/` on startup
- [ ] Validates each plugin's manifest
- [ ] Invalid plugins logged with clear error, don't crash app
- [ ] Plugins load in dependency order
- [ ] All specified events are emitted

### Story 3: Lifecycle Management
- [ ] Plugin main can export activate/deactivate
- [ ] PluginContext provides all registration methods
- [ ] Plugins can be enabled/disabled without restart
- [ ] Plugin state persists across application restarts
- [ ] Cleanup is called on deactivate

---

## Appendix A: Sample Plugin Manifest

```json
{
  "name": "puffin-analytics",
  "version": "1.0.0",
  "displayName": "Analytics Dashboard",
  "description": "Track prompt usage and response metrics",
  "main": "src/index.js",
  "author": "Developer Name",
  "license": "MIT",
  "repository": "https://github.com/user/puffin-analytics",
  "keywords": ["analytics", "metrics", "dashboard"],
  "engines": {
    "puffin": ">=2.0.0"
  },
  "extensionPoints": {
    "actions": ["trackPrompt", "generateReport"],
    "acceptors": ["analyticsAcceptor"],
    "components": ["analytics-dashboard"],
    "ipcHandlers": ["analytics:getData", "analytics:export"]
  }
}
```

## Appendix B: Sample Plugin Implementation

```javascript
// ~/.puffin/plugins/puffin-analytics/src/index.js

class AnalyticsPlugin {
  constructor() {
    this.data = []
  }

  async activate(context) {
    this.context = context
    this.logger = context.getLogger()
    this.storage = context.getStorage()

    // Load persisted data
    this.data = await this.storage.get('analyticsData') || []

    // Register IPC handler
    context.registerIpcHandler('analytics:getData', async () => {
      return { success: true, data: this.data }
    })

    // Register action
    context.registerAction('trackPrompt', (promptData) => {
      this.data.push({
        ...promptData,
        timestamp: Date.now()
      })
      this.storage.set('analyticsData', this.data)
    })

    this.logger.info('Analytics plugin activated')
  }

  async deactivate() {
    // Persist data before shutdown
    await this.storage.set('analyticsData', this.data)
    this.logger.info('Analytics plugin deactivated')
  }
}

module.exports = new AnalyticsPlugin()
```
