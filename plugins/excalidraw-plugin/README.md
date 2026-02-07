# Excalidraw Plugin (Sketcher)

Excalidraw-based sketching and diagramming plugin for Puffin. Create hand-drawn style wireframes, architecture diagrams, and design sketches stored as `.excalidraw` files.

## Features

- Create, save, load, and delete Excalidraw designs
- Inline rename with Enter/Escape keyboard support
- Export designs as JSON (`.excalidraw` format), PNG, or SVG
- Import `.excalidraw` and `.json` files
- Thumbnail previews in the sidebar
- Light/dark theme toggle
- Keyboard shortcuts: Ctrl+S (save), Ctrl+N (new), Ctrl+E (export)
- Persistent storage in `.puffin/excalidraw-designs/`

## Installation

This plugin is bundled with Puffin and loads automatically on startup.

## Usage

1. Click the **Sketcher** (✏️) tab in the navigation bar
2. Use the toolbar buttons to create, save, clear, import, or export designs
3. Browse saved designs in the right sidebar
4. Click the Load button to open a design, Rename to edit its name, or Delete to remove it
5. Toggle between light and dark themes with the theme button

## File Structure

```
excalidraw-plugin/
  index.js                          # Plugin entry point (activation, IPC handlers)
  excalidraw-storage.js             # Storage layer (file I/O, validation)
  puffin-plugin.json                # Plugin manifest
  README.md                         # This file
  renderer/
    components/
      ExcalidrawView.js             # Main view component (vanilla JS ES6 class)
      index.js                      # Component exports
    styles/
      excalidraw-view.css           # View styles (toolbar, sidebar, modals)
```

## Storage

Designs are stored in `.puffin/excalidraw-designs/` relative to the project root. Each design consists of two files:

| File | Purpose |
|------|---------|
| `{name}.excalidraw` | Scene data (elements, appState, files) in Excalidraw format |
| `{name}.meta.json` | Metadata (id, name, description, elementCount, timestamps, thumbnail) |

## IPC Channels

All channels are invoked via `window.puffin.plugins.invoke('excalidraw-plugin', handler, args)`:

| Handler | Description | Arguments | Returns |
|---------|-------------|-----------|---------|
| `saveDesign` | Save a new design | `{ name, sceneData, metadata }` | `{ filename, design }` |
| `loadDesign` | Load a design by filename | `string` (filename) | `{ scene, meta }` |
| `listDesigns` | List all saved designs | None | `Array<{ filename, id, name, description, elementCount, metadata, thumbnailData }>` |
| `updateDesign` | Update an existing design | `{ filename, updates }` | `{ scene, meta }` |
| `deleteDesign` | Delete a design | `string` (filename) | `boolean` |
| `renameDesign` | Rename a design | `{ oldFilename, newName }` | `{ oldFilename, newFilename, design }` |
| `checkNameUnique` | Check if name is available | `{ name, excludeFilename? }` | `boolean` |
| `exportDesign` | Export as JSON string | `string` (filename) | `string` (JSON) |
| `importDesign` | Import from JSON string | `{ jsonContent, newName? }` | `{ filename, design }` |

## Programmatic Actions

Four actions are registered for use via `pluginManager.invokeAction()`:

| Action | Description | Arguments |
|--------|-------------|-----------|
| `saveDesign` | Save a new design | `{ name, sceneData, metadata }` |
| `loadDesign` | Load a design | `string` (filename) |
| `listDesigns` | List all designs | None |
| `deleteDesign` | Delete a design | `string` (filename) |

## API Examples

### Renderer (via IPC)

```javascript
// Save a new design
const result = await window.puffin.plugins.invoke('excalidraw-plugin', 'saveDesign', {
  name: 'Login Screen',
  sceneData: {
    elements: [{ id: '1', type: 'rectangle', x: 10, y: 20, width: 200, height: 100 }],
    appState: { theme: 'dark' },
    files: {}
  },
  metadata: {
    description: 'Login page wireframe',
    thumbnailData: 'data:image/png;base64,...'
  }
})
// result: { filename: 'login_screen.excalidraw', design: { id, name, ... } }

// Load a design
const { scene, meta } = await window.puffin.plugins.invoke(
  'excalidraw-plugin', 'loadDesign', 'login_screen.excalidraw'
)

// List all designs
const designs = await window.puffin.plugins.invoke('excalidraw-plugin', 'listDesigns')
// designs: [{ filename, id, name, description, elementCount, metadata, thumbnailData }, ...]

// Update a design
const updated = await window.puffin.plugins.invoke('excalidraw-plugin', 'updateDesign', {
  filename: 'login_screen.excalidraw',
  updates: {
    sceneData: { elements: [...], appState: {}, files: {} },
    description: 'Updated wireframe'
  }
})

// Rename a design
const renamed = await window.puffin.plugins.invoke('excalidraw-plugin', 'renameDesign', {
  oldFilename: 'login_screen.excalidraw',
  newName: 'Login Page v2'
})
// renamed: { oldFilename: 'login_screen.excalidraw', newFilename: 'login_page_v2.excalidraw', design: {...} }

// Delete a design
await window.puffin.plugins.invoke('excalidraw-plugin', 'deleteDesign', 'login_screen.excalidraw')

// Export a design as JSON
const json = await window.puffin.plugins.invoke('excalidraw-plugin', 'exportDesign', 'login_screen.excalidraw')

// Import a design from JSON
const imported = await window.puffin.plugins.invoke('excalidraw-plugin', 'importDesign', {
  jsonContent: json,
  newName: 'Imported Login'
})

// Check name uniqueness
const isUnique = await window.puffin.plugins.invoke('excalidraw-plugin', 'checkNameUnique', {
  name: 'My Design',
  excludeFilename: 'my_design.excalidraw'  // optional, for rename checks
})
```

### Main process (via PluginManager actions)

```javascript
// Save
const result = await pluginManager.invokeAction('excalidraw-plugin', 'saveDesign', {
  name: 'Architecture Diagram',
  sceneData: { elements: [...], appState: {}, files: {} },
  metadata: { description: 'System overview' }
})

// List
const designs = await pluginManager.invokeAction('excalidraw-plugin', 'listDesigns')

// Load
const { scene, meta } = await pluginManager.invokeAction(
  'excalidraw-plugin', 'loadDesign', 'architecture_diagram.excalidraw'
)

// Delete
await pluginManager.invokeAction('excalidraw-plugin', 'deleteDesign', 'old_design.excalidraw')
```

## Data Model

### Scene File (`.excalidraw`)

```json
{
  "type": "excalidraw",
  "version": 2,
  "source": "puffin-excalidraw-plugin",
  "elements": [],
  "appState": { "theme": "dark" },
  "files": {}
}
```

### Metadata File (`.meta.json`)

```json
{
  "id": "lq1abc123def456",
  "name": "My Design",
  "description": "Optional description",
  "elementCount": 5,
  "createdAt": "2025-01-15T10:30:00.000Z",
  "lastModified": "2025-01-15T11:00:00.000Z",
  "version": "1.0",
  "thumbnailData": "data:image/png;base64,..."
}
```

## Error Handling

| Error | Code | When |
|-------|------|------|
| `DuplicateNameError` | `DUPLICATE_NAME` | Saving or renaming to an existing name |
| `Error: Design not found` | — | Loading, updating, or deleting a non-existent design |
| `Error: path traversal not allowed` | — | Filename contains `..`, `/`, or `\` |
| `Error: must be a .excalidraw file` | — | Filename has wrong extension |

## Testing

```bash
node --test tests/plugins/excalidraw-plugin.test.js
```

Tests cover:
- Storage layer: save, load, list, update, delete, rename, export, import, validation
- Plugin activation: context validation, handler/action registration, directory creation
- IPC handlers: all 9 handlers exercised end-to-end
- View component: structure verification, accessibility, keyboard shortcuts
- Integration workflows: save-load round-trip, export-import, rename-load, delete-list

## License

MIT
