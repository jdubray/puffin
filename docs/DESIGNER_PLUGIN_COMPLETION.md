---

# Designer Plugin Migration Plan

## Executive Summary

The Designer plugin migration is **partially complete**. The **storage/persistence layer** has been fully migrated to the plugin architecture. What remains is completing the migration by:

1. **Removing duplicate code** from the core application
2. **Routing all storage operations** through the plugin
3. **Optionally migrating the UI renderer** component to the plugin

---

## Current State Analysis

### What's Already in the Plugin
✅

| Component | Location | Status |
|-----------|----------|--------|
| Storage Service | `plugins/designer-plugin/designer-storage.js` | Complete |
| Plugin Entry | `plugins/designer-plugin/index.js` | Complete |
| Manifest | `plugins/designer-plugin/puffin-plugin.json` | Complete |
| IPC Handlers | 9 handlers registered | Complete |
| Name Uniqueness | `DuplicateNameError` class | Complete |
| Import/Export | JSON format | Complete |

### What's Still in Core App (Duplicated) ⚠️

| Component | Location | Notes |
|-----------|----------|-------|
| Storage Methods | `src/main/puffin-state.js:542-640` | Duplicate of plugin storage |
| IPC Handlers | `src/main/ipc-handlers.js:188-230` | Should route to plugin |
| Preload API | `src/main/preload.js:47-52` | Uses core, not plugin |
| UI Component | `src/renderer/components/gui-designer/` | Not migrated |
| Modal Rendering | `src/renderer/lib/modal-manager.js:186-451` | Uses core IPC |

---

## Migration Tasks

### Phase 1: Remove Duplicate Storage Code (Core → Plugin)

**Goal:** Eliminate duplicate storage implementation, route all calls through plugin.

#### Task 1.1: Redirect Core IPC Handlers to Plugin

**File:** `src/main/ipc-handlers.js`

**Current:** Lines 188-230 implement `state:saveGuiDefinition`, `state:listGuiDefinitions`, `state:loadGuiDefinition`, `state:updateGuiDefinition`, `state:deleteGuiDefinition`

**Change:** Redirect these handlers to invoke the designer plugin instead:

```javascript
// Instead of calling puffinState methods directly, invoke plugin
ipcMain.handle('state:saveGuiDefinition', async (event, { name, description, elements }) => {
  const pluginManager = getPluginManager()
  const result = await pluginManager.invokePluginAction('designer', 'saveDesign', { name, elements, description })
  return { success: true, ...result }
})
```

**Alternative:** Keep IPC handlers as-is but have them internally call the plugin. This maintains backward compatibility with existing renderer code.

#### Task 1.2: Remove Duplicate Methods from PuffinState

**File:** `src/main/puffin-state.js`

**Remove or Deprecate:**
- `saveGuiDefinition()` (lines 542-559)
- `listGuiDefinitions()` (lines 564-591)
- `loadGuiDefinition()` (lines 597-602)
- `updateGuiDefinition()` (lines 609-625)
- `deleteGuiDefinition()` (lines 627-640)

**Keep:** `GUI_DEFINITIONS_DIR` constant if needed for migration path.

#### Task 1.3: Update Modal Manager to Use Plugin API

**File:** `src/renderer/lib/modal-manager.js`

**Current:** Uses `window.puffin.state.saveGuiDefinition()`, `listGuiDefinitions()`, etc.

**Change to:** Use `window.puffin.plugins.invoke('designer', 'methodName')`:

```javascript
// Save
const result = await window.puffin.plugins.invoke('designer', 'saveDesign', { name, elements, description })

// List
const definitions = await window.puffin.plugins.invoke('designer', 'listDesigns')

// Load
const design = await window.puffin.plugins.invoke('designer', 'loadDesign', filename)

// Update
await window.puffin.plugins.invoke('designer', 'updateDesign', { filename, updates })

// Delete
await window.puffin.plugins.invoke('designer', 'deleteDesign', filename)
```

---

### Phase 2: Storage Location Migration

**Issue:** The plugin stores designs in `.puffin/plugins/designer/designs/` but the core app used `.puffin/gui-definitions/`.

#### Task 2.1: Migrate Existing Designs

**Option A: One-time migration script**
- On plugin activation, check for `.puffin/gui-definitions/`
- If exists, copy files to `.puffin/plugins/designer/designs/`
- Mark migration complete

**Option B: Symlink or alias**
- Plugin reads from both locations
- New saves go to plugin directory

**Recommended:** Option A with migration on first activation.

#### Task 2.2: Update Plugin to Handle Migration

**File:** `plugins/designer-plugin/index.js`

Add migration logic in `activate()`:

```javascript
async activate(context) {
  // ... existing code ...
  
  // Check for legacy designs
  await this.migrateFromLegacyLocation()
}

async migrateFromLegacyLocation() {
  const legacyDir = path.join(this.context.projectPath, '.puffin', 'gui-definitions')
  const newDir = this.storage.designsDir
  
  // Check if legacy directory exists
  if (await exists(legacyDir)) {
    const files = await fs.readdir(legacyDir)
    for (const file of files.filter(f => f.endsWith('.json'))) {
      // Copy to new location if not exists
      const src = path.join(legacyDir, file)
      const dest = path.join(newDir, file)
      if (!await exists(dest)) {
        await fs.copyFile(src, dest)
        this.context.log.info(`Migrated design: ${file}`)
      }
    }
  }
}
```

---

### Phase 3: Update Renderer Integration

#### Task 3.1: Update App.js Plugin Sync

**File:** `src/renderer/app.js`

**Current:** `syncGuiDefinitionsFromPlugin()` already uses plugin API
✅

**Verify:** Ensure this is called on:
- App initialization
- Plugin activation
- After save/update/delete operations

#### Task 3.2: Update GUI Designer Component to Use Plugin

**File:** `src/renderer/components/gui-designer/gui-designer.js`

**Current:** Uses `window.puffin.state.*` methods in:
- `showSaveDialog()` → modal manager handles this
- `showLoadDialog()` → modal manager handles this

**No changes needed** if modal manager is updated (Task 1.3).

---

### Phase 4: (Optional) Migrate UI Component to Plugin

This is **optional** as the plugin system is primarily for business logic.

#### Task 4.1: Create Renderer Component in Plugin

**New Files:**
```
plugins/designer-plugin/
├── renderer/
│   ├── index.js           # Component exports
│   ├── DesignerView.js    # Main canvas component
│   ├── Palette.js         # Element palette
│   ├── PropertyPanel.js   # Property editor
│   └── styles/
│       └── designer.css   # Component styles
```

#### Task 4.2: Update Plugin Manifest

```json
{
  "renderer": {
    "entry": "renderer/index.js",
    "components": [
      {
        "name": "DesignerView",
        "export": "default",
        "type": "class"
      }
    ],
    "styles": ["renderer/styles/designer.css"]
  },
  "contributes": {
    "views": [
      {
        "id": "designer",
        "name": "GUI Designer",
        "location": "nav",
        "icon": "🎨",
        "component": "DesignerView"
      }
    ]
  }
}
```

#### Task 4.3: Remove Core GUI Designer Component

**After plugin UI is working:**
- Remove `src/renderer/components/gui-designer/`
- Remove `#designer-view` from HTML
- Remove Designer nav button from core
- Let plugin contribute the view

---

## Implementation Order

### Recommended Sequence

```
Phase 1 (Required - Remove Duplication)
├── 1.1 Redirect IPC handlers to plugin
├── 1.2 Remove duplicate PuffinState methods
└── 1.3 Update Modal Manager to use plugin API

Phase 2 (Required - Storage Migration)
├── 2.1 Add migration logic to plugin
└── 2.2 Test migration with existing designs

Phase 3 (Required - Integration)
├── 3.1 Verify app sync works correctly
└── 3.2 Test full workflow (save/load/update/delete)

Phase 4 (Optional - UI Migration)
├── 4.1 Create renderer component
├── 4.2 Update manifest with view contribution
└── 4.3 Remove core component
```

---

## Files to Modify

### Core Application Changes

| File | Change Type | Effort |
|------|-------------|--------|
| `src/main/ipc-handlers.js` | Redirect to plugin | Low |
| `src/main/puffin-state.js` | Remove methods | Low |
| `src/renderer/lib/modal-manager.js` | Use plugin API | Medium |
| `src/main/preload.js` | Update API (optional) | Low |

### Plugin Changes

| File | Change Type | Effort |
|------|-------------|--------|
| `plugins/designer-plugin/index.js` | Add migration | Low |
| `plugins/designer-plugin/puffin-plugin.json` | Add view (Phase 4) | Low |
| `plugins/designer-plugin/renderer/*` | New files (Phase 4) | High |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | High | Backup designs before migration, don't delete legacy dir |
| Plugin not activated | Medium | Graceful fallback, log warnings |
| Breaking existing workflows | Medium | Keep backward-compatible IPC handlers |
| Modal manager complexity | Low | Modal manager already handles plugin integration |

---

## Testing Checklist

### Phase 1-2 Tests
- [ ] Save new design → goes to plugin storage
- [ ] List designs → reads from plugin storage
- [ ] Load design → loads from plugin storage
- [ ] Update design name → updates in plugin storage
- [ ] Delete design → removes from plugin storage
- [ ] Duplicate name detection works

### Phase 3 Tests
- [ ] Designs sync to SAM state on app load
- [ ] Designs sync after save/update/delete
- [ ] Prompt editor dropdown shows designs
- [ ] Multi-select works in prompt editor

### Migration Tests
- [ ] Legacy designs in `.puffin/gui-definitions/` are migrated
- [ ] Migration runs only once
- [ ] No duplicate designs after migration

---

## Conclusion

The Designer plugin migration is **90% complete** for the storage layer. The remaining work is:

1. **Critical:** Remove duplicate code and route through plugin (~2-3 hours)
2. **Important:** Storage location migration (~1 hour)
3. **Optional:** UI component migration to plugin (~4-6 hours)

The recommended approach is to complete Phases 1-3 first, which eliminates code duplication while preserving the existing UI. Phase 4 (UI migration) can be done later if a fully self-contained plugin is desired.