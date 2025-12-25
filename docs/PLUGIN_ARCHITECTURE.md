Now I have a comprehensive understanding of the current architecture. Let me create a detailed proposal for a Puffin Plugin System.

---

# Puffin Plugin System Proposal

## Executive Summary

**Yes, there is a significant opportunity** to create a plugin system for Puffin. The current SAM (State-Action-Model) architecture provides clean extension points that can be formalized into a plugin API. This would enable:

1. **Internal modularity** - Package existing features as plugins for better maintainability
2. **External extensibility** - Allow community developers to extend Puffin
3. **Marketplace potential** - Create an ecosystem similar to VS Code extensions

---

## Current Architecture Analysis

### Strengths for Plugin Support

| Aspect | Current Pattern | Plugin Opportunity |
|--------|-----------------|-------------------|
| **Actions** | Pure functions returning `{ type, payload }` | Easily composable - plugins can register new actions |
| **Acceptors** | Curried functions `model => proposal => {}` | Additive - plugins append to acceptors array |
| **State** | Centralized with event-driven rendering | Plugins subscribe to `puffin-state-change` |
| **Components** | Constructor injection of `intents` | Standard interface for plugin UI components |
| **IPC Handlers** | Domain-namespaced (`git:status`) | Plugins register new domains |
| **Services** | Isolated classes in main process | Plugins can provide new services |

### Current Registration Points

```
app.js (lines 252-412):
├── actionNames[] ──────► 80+ named actions
├── SAM({ actions, acceptors, reactors })
├── this.intents ──────► Action dispatchers
└── this.components ──► Component registry

model.js (lines 2614-2750):
└── export const acceptors = [...] ──► 60+ acceptors

ipc-handlers.js:
├── setupStateHandlers()
├── setupClaudeHandlers()
├── setupGitHandlers()
└── setupShellHandlers()
```

---

## Proposed Plugin Architecture

### Plugin Package Structure

```
puffin-plugin-example/
├── package.json           # NPM package manifest
├── plugin.json            # Puffin plugin manifest
├── src/
│   ├── index.js           # Plugin entry point
│   ├── actions.js         # Action definitions
│   ├── acceptors.js       # Model acceptors
│   ├── state.js           # State computers
│   ├── components/        # UI components
│   │   └── MyComponent.js
│   └── services/          # Main process services
│       └── MyService.js
└── README.md
```

### Plugin Manifest (`plugin.json`)

```json
{
  "id": "puffin-plugin-analytics",
  "name": "Analytics Dashboard",
  "version": "1.0.0",
  "description": "Track prompt usage and response metrics",
  "author": "Developer Name",
  "license": "MIT",
  
  "puffin": {
    "minVersion": "2.1.0",
    "maxVersion": "3.x"
  },
  
  "main": "src/index.js",
  
  "contributes": {
    "actions": ["trackPrompt", "generateReport"],
    "views": ["analytics-dashboard"],
    "menus": [
      { "location": "sidebar", "label": "Analytics", "icon": "📊" }
    ],
    "settings": [
      { "key": "analytics.enabled", "type": "boolean", "default": true }
    ]
  },
  
  "permissions": [
    "state:read",
    "state:write",
    "ipc:register",
    "fs:puffin-directory"
  ]
}
```

### Plugin Interface

```javascript
// src/index.js - Plugin Entry Point
export default class AnalyticsPlugin {
  
  /**
   * Plugin metadata
   */
  static metadata = {
    id: 'puffin-plugin-analytics',
    name: 'Analytics Dashboard',
    version: '1.0.0'
  }

  /**
   * Called when plugin is loaded
   * @param {PluginContext} context - Plugin utilities and hooks
   */
  async activate(context) {
    // Register actions
    context.registerActions(this.getActions())
    
    // Register acceptors
    context.registerAcceptors(this.getAcceptors())
    
    // Register state computers
    context.registerStateComputers(this.getStateComputers())
    
    // Register UI components
    context.registerComponent('analytics-dashboard', AnalyticsDashboard)
    
    // Register sidebar item
    context.registerSidebarItem({
      id: 'analytics',
      label: 'Analytics',
      icon: '📊',
      component: 'analytics-dashboard'
    })
    
    // Subscribe to state changes
    context.onStateChange((state, previousState) => {
      this.trackStateChanges(state, previousState)
    })
    
    // Store context for later use
    this.context = context
  }

  /**
   * Called when plugin is unloaded
   */
  async deactivate() {
    // Cleanup subscriptions, timers, etc.
  }

  /**
   * Return action factories
   */
  getActions() {
    return {
      trackPrompt: (promptId, metrics) => ({
        type: 'ANALYTICS_TRACK_PROMPT',
        payload: { promptId, metrics, timestamp: Date.now() }
      }),
      
      generateReport: (dateRange) => ({
        type: 'ANALYTICS_GENERATE_REPORT',
        payload: { dateRange }
      })
    }
  }

  /**
   * Return model acceptors
   */
  getAcceptors() {
    return [
      model => proposal => {
        if (proposal?.type === 'ANALYTICS_TRACK_PROMPT') {
          if (!model.analytics) model.analytics = { prompts: [] }
          model.analytics.prompts.push(proposal.payload)
        }
      }
    ]
  }

  /**
   * Return state computers
   */
  getStateComputers() {
    return {
      analytics: (model) => ({
        totalPrompts: model.analytics?.prompts?.length || 0,
        recentPrompts: (model.analytics?.prompts || []).slice(-10)
      })
    }
  }
}
```

---

## Plugin Context API

```javascript
/**
 * PluginContext - provided to plugins during activation
 */
class PluginContext {
  constructor(pluginId, app) {
    this.pluginId = pluginId
    this.app = app
  }

  // ═══════════════════════════════════════════════════════
  // SAM REGISTRATION
  // ═══════════════════════════════════════════════════════

  /**
   * Register new actions
   * @param {Object} actions - { actionName: actionFactory }
   */
  registerActions(actions) {}

  /**
   * Register new acceptors
   * @param {Array} acceptors - [acceptorFn, ...]
   */
  registerAcceptors(acceptors) {}

  /**
   * Register state computers (extend computed state)
   * @param {Object} computers - { statePath: computeFn }
   */
  registerStateComputers(computers) {}

  // ═══════════════════════════════════════════════════════
  // UI REGISTRATION
  // ═══════════════════════════════════════════════════════

  /**
   * Register a UI component
   * @param {string} id - Component identifier
   * @param {Class} component - Component class
   */
  registerComponent(id, component) {}

  /**
   * Add item to sidebar navigation
   */
  registerSidebarItem(config) {}

  /**
   * Add menu items
   */
  registerMenuItem(location, config) {}

  /**
   * Register a modal type
   */
  registerModal(id, renderFn) {}

  // ═══════════════════════════════════════════════════════
  // STATE & EVENTS
  // ═══════════════════════════════════════════════════════

  /**
   * Subscribe to state changes
   * @param {Function} callback - (state, previousState) => void
   * @returns {Function} unsubscribe
   */
  onStateChange(callback) {}

  /**
   * Get current state (read-only)
   */
  getState() {}

  /**
   * Dispatch an action
   * @param {string} actionName
   * @param {...any} args
   */
  dispatch(actionName, ...args) {}

  // ═══════════════════════════════════════════════════════
  // IPC (Main Process)
  // ═══════════════════════════════════════════════════════

  /**
   * Register IPC handlers (main process only)
   * @param {string} domain - Handler domain prefix
   * @param {Object} handlers - { action: handlerFn }
   */
  registerIpcHandlers(domain, handlers) {}

  /**
   * Call main process handler
   * @param {string} channel - e.g., 'git:status'
   * @param {...any} args
   */
  async invoke(channel, ...args) {}

  // ═══════════════════════════════════════════════════════
  // STORAGE
  // ═══════════════════════════════════════════════════════

  /**
   * Plugin-scoped storage in .puffin/plugins/{pluginId}/
   */
  storage = {
    async get(key) {},
    async set(key, value) {},
    async delete(key) {},
    async getAll() {}
  }

  // ═══════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {}

  /**
   * Log with plugin prefix
   */
  log(message, level = 'info') {}

  /**
   * Access to shared utilities
   */
  utils = {
    generateId: () => {},
    escapeHtml: (str) => {},
    formatDate: (timestamp) => {}
  }
}
```

---

## Plugin Loader Implementation

### Renderer Process (`src/renderer/lib/plugin-loader.js`)

```javascript
export class PluginLoader {
  constructor(app) {
    this.app = app
    this.plugins = new Map()
    this.contexts = new Map()
  }

  /**
   * Load all plugins from .puffin/plugins/
   */
  async loadPlugins() {
    const pluginDirs = await this.discoverPlugins()
    
    for (const dir of pluginDirs) {
      try {
        await this.loadPlugin(dir)
      } catch (error) {
        console.error(`Failed to load plugin from ${dir}:`, error)
      }
    }
  }

  /**
   * Load a single plugin
   */
  async loadPlugin(pluginPath) {
    // Read manifest
    const manifest = await this.readManifest(pluginPath)
    
    // Validate compatibility
    this.validateCompatibility(manifest)
    
    // Create context
    const context = new PluginContext(manifest.id, this.app)
    
    // Load plugin module
    const PluginClass = await import(path.join(pluginPath, manifest.main))
    const plugin = new PluginClass.default()
    
    // Activate
    await plugin.activate(context)
    
    // Store references
    this.plugins.set(manifest.id, plugin)
    this.contexts.set(manifest.id, context)
    
    console.log(`Loaded plugin: ${manifest.name} v${manifest.version}`)
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId)
    if (plugin?.deactivate) {
      await plugin.deactivate()
    }
    this.plugins.delete(pluginId)
    this.contexts.delete(pluginId)
  }
}
```

### Main Process (`src/main/plugin-service.js`)

```javascript
export class PluginService {
  constructor(ipcMain) {
    this.ipcMain = ipcMain
    this.plugins = new Map()
  }

  /**
   * Register IPC handlers for a plugin
   */
  registerPluginHandlers(pluginId, domain, handlers) {
    for (const [action, handler] of Object.entries(handlers)) {
      const channel = `${domain}:${action}`
      this.ipcMain.handle(channel, async (event, ...args) => {
        try {
          const result = await handler(...args)
          return { success: true, data: result }
        } catch (error) {
          return { success: false, error: error.message }
        }
      })
    }
  }
}
```

---

## Example Plugins

### 1. Analytics Plugin

```javascript
// Tracks prompt usage, response times, token counts
// Provides dashboard with metrics and charts
// Persists analytics to .puffin/plugins/analytics/
```

### 2. Templates Plugin

```javascript
// Provides prompt templates library
// User can save/load/share templates
// Integrates with prompt editor
```

### 3. Collaboration Plugin

```javascript
// Real-time sharing of prompts/responses
// Team workspace features
// Conflict resolution
```

### 4. AI Model Switcher Plugin

```javascript
// Adds support for other AI models (GPT-4, Gemini)
// Model comparison features
// Fallback handling
```

### 5. Export Plugin

```javascript
// Export conversations to various formats
// PDF, Markdown, JSON exports
// Documentation generation
```

---

## Migration Strategy

### Phase 1: Core Plugin Infrastructure

1. Create `PluginContext` class
2. Create `PluginLoader` class
3. Create plugin discovery mechanism
4. Add plugin lifecycle hooks to `app.js`

### Phase 2: Extract Existing Features as Plugins

| Feature | Plugin Candidate | Priority |
|---------|------------------|----------|
| Git Integration | `puffin-plugin-git` | High |
| Developer Profile | `puffin-plugin-github` | Medium |
| Story Generations | `puffin-plugin-story-tracking` | Low |
| GUI Designer | `puffin-plugin-gui-designer` | Low |

### Phase 3: Plugin Marketplace

1. Plugin registry API
2. Plugin discovery UI
3. One-click installation
4. Update mechanism

---

## NPM Package Structure

```
@puffin/core           # Core plugin API and types
@puffin/plugin-cli     # CLI for scaffolding plugins
@puffin/plugin-test    # Testing utilities for plugins

# Official plugins
@puffin/plugin-git
@puffin/plugin-github
@puffin/plugin-templates
@puffin/plugin-analytics
```

### `@puffin/core` Package

```javascript
// Exports for plugin developers
export { PuffinPlugin } from './plugin-base'
export { PluginContext } from './context'
export { Component } from './component-base'
export { Action, Acceptor, StateComputer } from './sam-types'

// Type definitions
export interface PluginManifest { ... }
export interface PluginMetadata { ... }
export interface ContributionPoints { ... }
```

---

## Security Considerations

| Risk | Mitigation |
|------|------------|
| Malicious code execution | Sandboxed plugin contexts, permission system |
| State corruption | Validate acceptor outputs, plugin-scoped state |
| IPC abuse | Namespace IPC channels per plugin |
| File system access | Restrict to `.puffin/plugins/{id}/` |
| Resource exhaustion | Timeout plugin operations, memory limits |

---

## Recommendation

**Start with Phase 1** - Build the core plugin infrastructure without extracting existing features. This provides:

1. **Low risk** - Doesn't change existing functionality
2. **Immediate value** - Enables external plugins
3. **Validation** - Test the architecture before larger migration
4. **Momentum** - Ship v3 with plugin support as flagship feature

**Estimated Effort:**
- Phase 1: 2-3 sprints (core infrastructure)
- Phase 2: 4-6 sprints (feature extraction)
- Phase 3: 2-3 sprints (marketplace)

---

Would you like me to elaborate on any aspect of this proposal, or create detailed user stories for the plugin system implementation?