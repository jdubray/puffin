Now I have a comprehensive understanding. Let me create the detailed proposal with options.

---

# Designer Plugin Refactoring Proposal

## Executive Summary

Refactor the current GUI Designer from a built-in component into an extensible plugin that other developers can enhance or replace with more sophisticated GUI designers. The plugin must maintain the current integration pattern where the prompt view can access the library of GUI designs.

---

## Current Architecture Analysis

### What Exists Today

| Component | Location | Purpose |
|-----------|----------|---------|
| `gui-designer.js` | `src/renderer/components/gui-designer/` | Visual canvas editor with drag-and-drop |
| State functions | `src/main/puffin-state.js:533-626` | `saveGuiDefinition()`, `loadGuiDefinition()`, `listGuiDefinitions()`, `deleteGuiDefinition()` |
| SAM State | `src/renderer/sam/state.js:307-341` | `computeDesignerState()` - transforms `guiElements` to tree |
| SAM Model | `src/renderer/sam/model.js` | `guiElements`, `selectedGuiElement` state |
| Prompt Integration | `src/renderer/components/prompt-editor/` | "Include GUI" dropdown accessing designs |
| Storage | `.puffin/gui-designs/*.json` | Persisted design files |

### UI Issue Identified

The `.palette-item` buttons use `background: var(--bg-primary)` with no explicit text color. In dark themes:
- `--bg-primary`: `#1a1a2e` (dark blue)
- Default text/icons: inherit from parent (also dark)

**Result**: Dark icons on dark background = poor visibility

---

## Proposed Refactoring Options

### Option A: Service-Based Plugin (Recommended)

**Philosophy**: The plugin provides the **Designer View** and registers as a **GUI Definition Service** that other parts of the app can consume.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Plugin Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│  plugins/designer-plugin/                                        │
│  ├── puffin-plugin.json          # Manifest with view + service │
│  ├── index.js                    # Main entry, activates service│
│  ├── src/                                                        │
│  │   ├── gui-definition-service.js  # CRUD for designs         │
│  │   └── design-storage.js          # File I/O operations      │
│  └── renderer/                                                   │
│      ├── components/                                             │
│      │   └── designer-view.js       # The visual designer      │
│      └── index.js                   # Component exports         │
└─────────────────────────────────────────────────────────────────┘
```

**Integration Pattern**:
1. Plugin registers a `gui-definitions` service via `context.registerService()`
2. The app's existing prompt editor queries this service for available designs
3. Plugin manages its own storage in `.puffin/gui-designs/` (or plugin-data dir)
4. SAM model gains `guiDefinitions` state populated by the service

**Key Changes**:

| Area | Change |
|------|--------|
| **Plugin Manifest** | Declares `view` (Designer nav tab) + `service` contribution |
| **Main Process** | Plugin registers IPC handlers for design CRUD |
| **Renderer** | Plugin provides `DesignerViewComponent` |
| **SAM Model** | Add `guiDefinitions: []` populated on load |
| **Prompt Editor** | Query `guiDefinitions` from state instead of direct IPC |
| **Built-in Code** | Remove `gui-designer/` component, move to plugin |

**Pros**:
- Clean separation - plugin fully owns the designer domain
- Service pattern allows future replacement with different designers
- Other plugins could contribute additional GUI design capabilities
- Follows existing plugin patterns (Stats plugin)

**Cons**:
- Requires adding "service" contribution type to plugin system (minor enhancement)
- Slightly more complex initial setup

---

### Option B: State Injection Plugin

**Philosophy**: The plugin directly injects state into the SAM model at activation time, maintaining current patterns.

```
┌─────────────────────────────────────────────────────────────────┐
│                    State Injection Pattern                       │
├─────────────────────────────────────────────────────────────────┤
│  plugins/designer-plugin/                                        │
│  ├── puffin-plugin.json          # Manifest with view only      │
│  ├── index.js                    # Activate: inject state       │
│  └── renderer/                                                   │
│      └── components/                                             │
│          └── designer-view.js    # Full designer component      │
└─────────────────────────────────────────────────────────────────┘
```

**Integration Pattern**:
1. On `activate()`, plugin calls IPC to load all GUI definitions
2. Plugin dispatches action to populate `model.guiDefinitions`
3. Plugin registers IPC handlers that forward to puffin-state functions
4. Prompt editor reads from `state.guiDefinitions` (no change to access pattern)

**Key Changes**:

| Area | Change |
|------|--------|
| **Plugin Manifest** | Declares `view` only |
| **Activation** | Loads definitions and pushes to SAM model |
| **IPC** | Plugin re-exposes same handlers, delegating to core |
| **SAM Model** | Add `guiDefinitions: []` (injected by plugin) |
| **Prompt Editor** | Minor change to read from injected state |
| **Built-in Code** | Keep puffin-state CRUD methods, remove component only |

**Pros**:
- Simpler implementation - no new plugin contribution types
- Reuses existing puffin-state storage layer
- Minimal changes to existing architecture

**Cons**:
- Less clean separation (storage still in core, UI in plugin)
- Harder for alternative designers to fully replace (storage coupled)
- Plugin must "know" about SAM model structure

---

### Option C: Hybrid with Extension Points

**Philosophy**: Core provides a minimal "GUI Definitions Registry" that plugins contribute to. Multiple designers could coexist.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Extension Point Pattern                       │
├─────────────────────────────────────────────────────────────────┤
│  Core App                                                        │
│  └── GuiDefinitionRegistry (minimal, extensible)                │
│       ├── registerProvider(providerId, methods)                 │
│       ├── listDefinitions() → aggregates all providers          │
│       └── loadDefinition(id) → routes to correct provider       │
│                                                                  │
│  plugins/designer-plugin/                                        │
│  └── Registers as a "gui-definition-provider"                   │
│                                                                  │
│  plugins/figma-import-plugin/ (future)                          │
│  └── Could also register as provider                            │
└─────────────────────────────────────────────────────────────────┘
```

**Pros**:
- Maximum extensibility - multiple design sources
- Clean abstraction for future growth
- Figma imports, AI-generated UIs, etc. could all contribute

**Cons**:
- Most complex to implement
- Over-engineered for current needs
- Requires defining stable provider interface upfront

---

## Recommendation: Option A (Service-Based Plugin)

Option A provides the right balance of:
1. **Clean separation** - Designer is fully encapsulated
2. **Extensibility** - Service pattern is replaceable
3. **Consistency** - Follows existing plugin patterns
4. **Simplicity** - Single service, single view

---

## Detailed Implementation Plan (Option A)

### Phase 1: Plugin Structure & Manifest

**Create plugin manifest** at `plugins/designer-plugin/puffin-plugin.json`:

```json
{
  "name": "designer-plugin",
  "version": "1.0.0",
  "displayName": "GUI Designer",
  "description": "Visual GUI design tool for creating UI mockups to include in prompts",
  "main": "index.js",
  "contributes": {
    "views": [
      {
        "id": "designer-view",
        "name": "Designer",
        "location": "nav",
        "icon": "🎨",
        "order": 40,
        "component": "DesignerViewComponent"
      }
    ],
    "services": [
      {
        "id": "gui-definitions",
        "description": "Provides CRUD operations for GUI design definitions"
      }
    ]
  },
  "renderer": {
    "entry": "renderer/index.js",
    "components": [
      {
        "name": "DesignerViewComponent",
        "export": "DesignerViewComponent",
        "type": "class"
      }
    ]
  }
}
```

### Phase 2: Main Process Entry Point

**Create** `plugins/designer-plugin/index.js`:

```javascript
const GuiDefinitionService = require('./src/gui-definition-service')

const Plugin = {
  async activate(context) {
    this.context = context
    this.service = new GuiDefinitionService(context)
    
    // Register service for other parts of the app
    context.registerService('gui-definitions', this.service)
    
    // Register IPC handlers for renderer access
    context.registerIpcHandler('designer:listDefinitions', 
      () => this.service.listDefinitions())
    context.registerIpcHandler('designer:loadDefinition', 
      (filename) => this.service.loadDefinition(filename))
    context.registerIpcHandler('designer:saveDefinition', 
      (name, description, elements) => this.service.saveDefinition(name, description, elements))
    context.registerIpcHandler('designer:deleteDefinition', 
      (filename) => this.service.deleteDefinition(filename))
    
    // Populate initial definitions to SAM model
    const definitions = await this.service.listDefinitions()
    context.dispatchAction('setGuiDefinitions', { definitions })
    
    context.log('info', 'GUI Designer plugin activated')
  },
  
  async deactivate() {
    this.context.log('info', 'GUI Designer plugin deactivated')
  }
}

module.exports = Plugin
```

### Phase 3: GUI Definition Service

**Create** `plugins/designer-plugin/src/gui-definition-service.js`:

Move the logic from `puffin-state.js:533-626` into this service class with proper encapsulation.

### Phase 4: Renderer Component

**Create** `plugins/designer-plugin/renderer/components/designer-view.js`:

Migrate `src/renderer/components/gui-designer/gui-designer.js` with modifications:
- Update IPC calls to use plugin-namespaced handlers
- Ensure component follows plugin lifecycle (init, onActivate, onDeactivate, onDestroy)

### Phase 5: SAM Model Updates

**Add to `initialModel`**:
```javascript
guiDefinitions: [], // Populated by designer plugin on activation
```

**Add acceptor**:
```javascript
export function setGuiDefinitionsAcceptor(model, proposal) {
  if (proposal.guiDefinitions !== undefined) {
    model.guiDefinitions = proposal.guiDefinitions
    return true
  }
  return false
}
```

### Phase 6: Prompt Editor Update

Update `prompt-editor.js` to read from `state.guiDefinitions` instead of making direct IPC calls to `state:listGuiDefinitions`.

### Phase 7: Remove Built-in Designer

After plugin is functional:
1. Delete `src/renderer/components/gui-designer/`
2. Remove Designer nav tab from `index.html`
3. Remove GUI definition methods from `puffin-state.js`
4. Remove `computeDesignerState` from `state.js` (if no longer needed)

---

## Button Color Fix

**Issue**: `.palette-item` has dark background with no explicit text/icon color.

**Fix** (to be included in the migrated CSS):

```css
.palette-item {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);  /* Lighter than bg-primary */
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
  color: var(--text-primary);  /* ADD: Explicit text color */
}

.palette-item:hover {
  background: var(--bg-hover);  /* ADD: Background change on hover */
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}

.palette-item .icon {
  font-size: 1.25rem;
  color: inherit;  /* ADD: Inherit from parent */
}
```

**Visual Result**:
- Normal: Light gray icons on medium-dark background
- Hover: Accent-colored icons with accent border

---

## Files to Create/Modify

### New Files (Plugin)

| File | Purpose |
|------|---------|
| `plugins/designer-plugin/puffin-plugin.json` | Plugin manifest |
| `plugins/designer-plugin/index.js` | Main entry point |
| `plugins/designer-plugin/src/gui-definition-service.js` | Design CRUD operations |
| `plugins/designer-plugin/renderer/index.js` | Component exports |
| `plugins/designer-plugin/renderer/components/designer-view.js` | Visual designer |
| `plugins/designer-plugin/renderer/styles/designer.css` | Component styles (with button fix) |

### Modified Files (Core)

| File | Change |
|------|--------|
| `src/renderer/sam/model.js` | Add `guiDefinitions: []` to initialModel |
| `src/renderer/sam/model.js` | Add `setGuiDefinitionsAcceptor` |
| `src/renderer/sam/actions.js` | Add `setGuiDefinitions` action |
| `src/renderer/components/prompt-editor/prompt-editor.js` | Read from `state.guiDefinitions` |
| `src/main/plugins/plugin-context.js` | Add `registerService()` method (if not exists) |
| `src/main/plugins/plugin-registry.js` | Add service tracking |

### Removed Files (After Migration)

| File | Reason |
|------|--------|
| `src/renderer/components/gui-designer/gui-designer.js` | Moved to plugin |
| `src/main/puffin-state.js:533-626` | GUI definition methods moved to plugin |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Plugin fails to load | Medium | Add graceful fallback in prompt editor if no definitions available |
| State sync issues | Low | Use same SAM patterns; definitions refreshed on plugin activation |
| Breaking existing designs | Low | Storage format unchanged; file location unchanged |
| Performance | Low | Definition list is typically small (<50 items) |

---

## Complexity Rating

| Phase | Complexity | Estimate |
|-------|------------|----------|
| Plugin structure | Low | Boilerplate from Stats plugin |
| Service migration | Medium | Move + adapt existing code |
| Renderer component | Medium | Adapt lifecycle hooks |
| SAM integration | Low | Simple state addition |
| Prompt editor update | Low | Minor change to data source |
| Cleanup | Low | File deletion |

**Overall**: Medium complexity

---

## Summary of Options

| Aspect | Option A (Service) | Option B (State Injection) | Option C (Extension Points) |
|--------|-------------------|---------------------------|----------------------------|
| Separation | ★★★★★ | ★★★☆☆ | ★★★★★ |
| Simplicity | ★★★★☆ | ★★★★★ | ★★☆☆☆ |
| Extensibility | ★★★★☆ | ★★★☆☆ | ★★★★★ |
| Implementation Effort | Medium | Low | High |
| Future-proof | Good | Fair | Excellent |

**Recommendation**: **Option A** provides the best balance for enabling other developers to build sophisticated GUI designers while maintaining clean architecture.

---

Would you like me to elaborate on any aspect of this proposal or proceed with a different option?