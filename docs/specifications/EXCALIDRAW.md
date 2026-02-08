# Excalidraw Plugin Specification & Design

## 1. Overview

**Plugin Name**: Excalidraw Sketcher  
**Type**: GUI Design & Diagramming Tool  
**Purpose**: Provide an alternative to the basic Designer plugin by integrating Excalidraw, an open-source hand-drawn style diagramming tool with advanced features

**Key Advantages over Designer**:
- **Rich element types**: Shapes, arrows, lines, text, images, frames with hand-drawn styling
- **Advanced features**: Collaboration-ready JSON format, complex diagram support, better UX for wireframing
- **Extensive APIs**: Programmatic control via imperative excalidrawAPI
- **Export capabilities**: PNG, SVG, and JSON formats
- **Active maintenance**: Well-maintained open-source project with regular updates

---

## 2. Functional Requirements

### 2.1 Core Features

**User Stories**:

1. **As a designer, I want to draw sketches using hand-drawn styling so that my wireframes have a friendly, informal appearance**
   - Acceptance Criteria:
     - Shapes (rectangle, ellipse, diamond, line, arrow, freedraw) render with hand-drawn styling via Rough.js
     - Styling appears consistent with Excalidraw's default aesthetic

2. **As a designer, I want to use frames to organize complex diagrams so that I can structure large designs hierarchically**
   - Acceptance Criteria:
     - Frame tool available in toolbar
     - Frames can be nested
     - Frames can be used to create reusable design components

3. **As a user, I want to save and load diagrams with full fidelity so that I can persist design work**
   - Acceptance Criteria:
     - Diagrams saved as .excalidraw JSON files in `.puffin/excalidraw-designs/`
     - Load preserves all properties: colors, text, sizing, positioning
     - Metadata (name, description, creation date) stored alongside diagram

4. **As a developer, I want to export diagrams as PNG, SVG, and JSON so that I can integrate designs into documentation**
   - Acceptance Criteria:
     - Export to PNG (raster image)
     - Export to SVG (vector format)
     - Export as JSON (scene data for reimport)
     - Clipboard support for quick sharing

5. **As a designer, I want to customize colors, fonts, and canvas background so that I can match brand guidelines**
   - Acceptance Criteria:
     - Dark/light theme toggle
     - Color palette customization
     - Font selection from available options
     - Background color configuration

### 2.2 Integration Points (Parity with Designer Plugin)

The plugin must provide equivalent functionality to the Designer plugin:

| Feature | Designer Plugin | Excalidraw Plugin |
|---------|-----------------|-------------------|
| Save design | ✓ saveDesign | ✓ saveDesign |
| Load design | ✓ loadDesign | ✓ loadDesign |
| List designs | ✓ listDesigns | ✓ listDesigns |
| Update design | ✓ updateDesign | ✓ updateDesign |
| Delete design | ✓ deleteDesign | ✓ deleteDesign |
| Rename design | ✓ renameDesign | ✓ renameDesign |
| Check uniqueness | ✓ checkNameUnique | ✓ checkNameUnique |
| Export | ✓ exportDesign (JSON) | ✓ exportDesign (JSON/PNG/SVG) |
| Import | ✓ importDesign | ✓ importDesign |
| UI View | ✓ DesignerView | ✓ ExcalidrawView |
| IPC Handlers | ✓ designer:* | ✓ excalidraw:* |
| Storage | ✓ /.puffin/gui-definitions/ | ✓ /.puffin/excalidraw-designs/ |

---

## 3. Technical Architecture

### 3.1 Plugin Structure

```
plugins/excalidraw-plugin/
├── index.js                           # Entry point & plugin lifecycle
├── puffin-plugin.json                 # Manifest with view registration
├── excalidraw-storage.js              # File I/O & persistence layer
├── renderer/
│   ├── components/
│   │   ├── ExcalidrawView.js          # Main view container (lifecycle hooks)
│   │   ├── ExcalidrawEditor.js        # Excalidraw component wrapper
│   │   └── index.js                   # Component exports
│   └── styles/
│       └── excalidraw-view.css        # View-specific styling
└── tests/
    ├── excalidraw-storage.test.js
    └── excalidraw-view.test.js
```

### 3.2 Data Model

**Design Metadata** (stored in `.puffin/excalidraw-designs/designs-index.json`):
```json
{
  "designs": [
    {
      "id": "design-uuid",
      "filename": "wireframe-login.excalidraw",
      "name": "Login Wireframe",
      "description": "Mobile login form design",
      "createdAt": "2025-02-06T10:30:00Z",
      "updatedAt": "2025-02-06T10:30:00Z",
      "thumbnailData": "base64-encoded-png"  // 128x128 preview
    }
  ]
}
```

**Excalidraw Scene Data** (stored in `.puffin/excalidraw-designs/{filename}.excalidraw`):
Follows standard Excalidraw JSON schema with `elements`, `appState`, and `files` keys.

### 3.3 Module Responsibilities

**index.js - Plugin Entry Point**:
- Lifecycle hooks: `activate()`, `deactivate()`
- Register IPC handlers via `context.registerIpcHandler()`
- Register programmatic actions via `context.registerAction()`
- Initialize storage layer

**excalidraw-storage.js - Persistence Layer**:
- `saveDesign(name, sceneData, metadata)` → writes .excalidraw file + index
- `loadDesign(filename)` → reads .excalidraw file
- `listDesigns()` → returns array of design metadata
- `updateDesign(filename, updates)` → merge updates into existing design
- `deleteDesign(filename)` → remove .excalidraw file + index entry
- `renameDesign(oldFilename, newName)` → update filename and index
- `exportDesign(filename, format)` → export as PNG/SVG/JSON blob
- `importDesign(blob, newName)` → create new design from uploaded file
- `ensureDesignsDirectory()` → create storage paths if missing

**ExcalidrawView.js - View Component**:
- React component with lifecycle hooks: `init()`, `onActivate()`, `onDeactivate()`, `destroy()`
- Manages component state: `elements`, `appState`, `selectedElement`, `loading`, `error`
- Renders toolbar with element palette and action buttons
- Manages event listeners and cleanup
- Displays saved designs list in sidebar

**ExcalidrawEditor.js - Excalidraw Wrapper**:
- Wraps `@excalidraw/excalidraw` React component
- Bridges Excalidraw API to plugin IPC
- Handles `onChange` callbacks to sync state
- Manages theme switching (light/dark)

### 3.4 IPC Handler Contract

All handlers follow request-response pattern with error wrapping:

```javascript
// Handler signature
async handler(args) {
  try {
    const result = await coreMethod(args)
    return { success: true, data: result }
  } catch (error) {
    throw new Error(error.message)  // PluginContext wrapper handles response
  }
}
```

**IPC Handlers** (registered as `excalidraw:{action}`):
- `excalidraw:saveDesign` → Save current sketch
- `excalidraw:loadDesign` → Load saved sketch
- `excalidraw:listDesigns` → Get list of saved sketches
- `excalidraw:updateDesign` → Update existing sketch
- `excalidraw:deleteDesign` → Delete sketch file
- `excalidraw:renameDesign` → Rename sketch
- `excalidraw:checkNameUnique` → Validate name uniqueness
- `excalidraw:exportDesign` → Export sketch (PNG/SVG/JSON)
- `excalidraw:importDesign` → Import sketch from file
- `excalidraw:getThumbnail` → Get preview image for design

### 3.5 State Management Pattern

**View State** (in-memory, ExcalidrawView.js):
```javascript
this.elements = []              // Current elements on canvas
this.appState = {}              // Canvas settings (theme, grid, etc.)
this.selectedElement = null     // Currently selected element ID
this.definitions = []           // Cached list of saved designs
this.loading = false            // Loading indicator
this.error = null               // Error message
this.excalidrawAPI = null       // Reference to Excalidraw API
```

**Persistence Flow**:
1. User modifies canvas (Excalidraw `onChange` fires)
2. View component captures `sceneData` from excalidrawAPI
3. User clicks "Save" → IPC call to `excalidraw:saveDesign`
4. Storage layer writes to disk + updates index
5. View refreshes definitions list

---

## 4. Detailed Design

### 4.1 View Layout

**ExcalidrawView Component Structure**:
```
┌─────────────────────────────────────────────────┐
│              Toolbar (fixed top)                │
│  [New] [Save] [Clear] [Export] [Theme]         │
│  Element Palette: □ ○ ◇ → ─ ✎ T 🖼️ ⬚         │
├──────────────────┬──────────────────────────────┤
│                  │                              │
│  Excalidraw      │   Saved Designs (sidebar)   │
│  Canvas (main)   │   ┌──────────────────────┐  │
│  100% x 100%     │   │ Design 1     [↓] [🗑] │  │
│  [elements]      │   │ Design 2     [↓] [🗑] │  │
│                  │   │ Design 3     [↓] [🗑] │  │
│                  │   └──────────────────────┘  │
│                  │                              │
└──────────────────┴──────────────────────────────┘
```

**Toolbar**:
- **Element Palette**: Quick-add buttons for common shapes (container, rectangle, circle, diamond, arrow, line, text, image, frame)
- **Actions**: New, Save, Clear Canvas, Export Design
- **Theme Toggle**: Light/Dark theme switcher

**Canvas Area**:
- Full Excalidraw editor with all built-in tools
- Hand-drawn styling applied to all elements
- Grid visible/toggleable

**Sidebar**:
- "Saved Designs" section with list of previously saved sketches
- Load button (📂) to reload design
- Delete button (🗑) to remove design

### 4.2 Component Lifecycle

**Initialization** (`init()`):
1. Render container HTML (toolbar, canvas, sidebar)
2. Load Excalidraw component into canvas container
3. Load saved designs list via IPC
4. Attach event listeners

**Activation** (`onActivate()`):
1. Refresh designs list from disk (in case modified externally)
2. Restore user's last selected design (from localStorage)
3. Focus Excalidraw canvas

**Deactivation** (`onDeactivate()`):
1. Save current sketch state to temporary location
2. Pause IPC handlers
3. Remove focus from canvas

**Destruction** (`destroy()`):
1. Remove all event listeners (mousedown, keydown, resize, etc.)
2. Clear Excalidraw component
3. Null out container reference
4. Release excalidrawAPI reference

### 4.3 Key Workflows

**Save Workflow**:
```
User clicks "Save" button
  ↓
ShowSaveDialog() modal appears
  ↓
User enters name + description
  ↓
GetSceneData() from excalidrawAPI
  ↓
ipcRenderer.invoke('excalidraw:saveDesign', {name, sceneData, metadata})
  ↓
Storage.saveDesign() writes .excalidraw file + updates index
  ↓
UI refreshes designs list
  ↓
ShowNotification('Design saved!')
```

**Load Workflow**:
```
User clicks load button (📂) on design item
  ↓
ipcRenderer.invoke('excalidraw:loadDesign', filename)
  ↓
Storage.loadDesign() reads .excalidraw file
  ↓
excalidrawAPI.updateScene({elements, appState})
  ↓
Canvas re-renders with loaded elements
  ↓
ShowNotification('Design loaded!')
```

**Export Workflow**:
```
User clicks "Export" button
  ↓
User selects format (PNG/SVG/JSON)
  ↓
ipcRenderer.invoke('excalidraw:exportDesign', {filename, format})
  ↓
Storage.exportDesign() uses Excalidraw utils to convert
  ↓
Blob returned to renderer
  ↓
Trigger download or copy to clipboard
```

### 4.4 Error Handling

**Error Boundaries**:
- Try-catch in all async IPC handlers
- Validation in storage layer (name uniqueness, file exists, JSON validity)
- UI error state with toast notifications

**User Feedback**:
```javascript
this.showNotification(message, type)
// type: 'success' | 'error' | 'info'
// Auto-dismisses after 3 seconds with fade animation
```

**Recovery Strategies**:
- Corrupted .excalidraw file → user prompted to delete or retry import
- Missing storage directory → auto-created on plugin activation
- Concurrent edits → last write wins (simple strategy for MVP)

---

## 5. Integration with Puffin Plugin System

### 5.1 Manifest (puffin-plugin.json)

```json
{
  "name": "excalidraw-plugin",
  "version": "1.0.0",
  "displayName": "Excalidraw Sketcher",
  "description": "Advanced hand-drawn style diagramming tool",
  "keywords": ["sketching", "wireframing", "diagramming", "ui-design"],
  "extensionPoints": {
    "actions": ["saveDesign", "loadDesign", "listDesigns", "deleteDesign"],
    "ipcHandlers": [
      "excalidraw:saveDesign",
      "excalidraw:loadDesign",
      "excalidraw:listDesigns",
      "excalidraw:updateDesign",
      "excalidraw:deleteDesign",
      "excalidraw:renameDesign",
      "excalidraw:exportDesign",
      "excalidraw:importDesign"
    ]
  },
  "contributes": {
    "views": [
      {
        "id": "excalidraw-view",
        "name": "Excalidraw Sketcher",
        "location": "nav",
        "icon": "✏️",
        "order": 51,
        "component": "ExcalidrawView"
      }
    ],
    "commands": [
      {
        "id": "excalidraw.showEditor",
        "title": "Show Excalidraw Sketcher",
        "category": "Sketcher"
      }
    ]
  },
  "activationEvents": ["onStartup"],
  "renderer": {
    "entry": "renderer/components/index.js",
    "components": [
      {
        "name": "ExcalidrawView",
        "export": "ExcalidrawView",
        "type": "class",
        "description": "Main Excalidraw editor view"
      }
    ],
    "styles": ["renderer/styles/excalidraw-view.css"]
  }
}
```

### 5.2 Plugin Context Usage

**In index.js**:
```javascript
async activate(context) {
  this.context = context
  
  // Initialize storage with project path
  const designsDir = path.join(context.projectPath, '.puffin', 'excalidraw-designs')
  this.storage = new ExcalidrawStorage(designsDir, context.log)
  
  // Register IPC handlers (main process)
  context.registerIpcHandler('saveDesign', this.handleSaveDesign.bind(this))
  context.registerIpcHandler('loadDesign', this.handleLoadDesign.bind(this))
  // ... more handlers
  
  // Register actions (for programmatic access)
  context.registerAction('saveDesign', this.saveDesign.bind(this))
  // ... more actions
  
  context.log.info('Excalidraw plugin activated')
}
```

**In ExcalidrawView.js**:
```javascript
// IPC call from renderer
await window.puffin.plugins.invoke('excalidraw-plugin', 'saveDesign', {
  name, sceneData, metadata
})

// Or using registered actions (from main process)
await this.options.context.actions.invoke('excalidraw:saveDesign', args)
```

---

## 6. Dependency Management

### 6.1 npm Dependencies

**Production**:
- `@excalidraw/excalidraw` (^0.17.0+) - Main library
- `react` (^17.0.2 || ^18.2.0) - Already in Puffin
- `react-dom` (^17.0.2 || ^18.2.0) - Already in Puffin

**Development**:
- Test framework (Vitest, matching Excalidraw)
- Existing Puffin dev dependencies

### 6.2 Version Compatibility

- **Excalidraw version**: 0.17.0+ (supports latest API)
- **React requirement**: 17+ (Puffin already uses 18+)
- **Node.js**: 18+ (Excalidraw requirement)

---

## 7. Comparison: Designer Plugin vs. Excalidraw Plugin

| Aspect | Designer Plugin | Excalidraw Plugin |
|--------|-----------------|-------------------|
| **Element Types** | 6 basic (container, text, input, button, image, list) | 10+ (shapes, arrows, lines, frames, freedraw) |
| **Styling** | Block styling only | Hand-drawn appearance (Rough.js) |
| **Save Format** | Custom JSON | Standard Excalidraw JSON (.excalidraw) |
| **Export Formats** | JSON only | JSON, PNG, SVG |
| **Collaboration** | None | Built-in for Excalidraw cloud |
| **Extensibility** | Low | High (custom tools, scripts via ExcalidrawAutomate) |
| **Performance** | Lightweight | Heavier (full drawing engine) |
| **Learning Curve** | Minimal | Moderate (familiar to Excalidraw users) |
| **Use Case** | Simple wireframes | Complex diagrams, mockups, flowcharts |
| **Community** | Small | Large & active |

---

## 8. Implementation Plan

### Phase 1: Foundation (Week 1)
- Set up plugin directory structure
- Create puffin-plugin.json manifest
- Implement storage layer (excalidraw-storage.js)
- Write unit tests for storage

### Phase 2: Core UI (Week 2)
- Integrate Excalidraw component
- Build ExcalidrawView component with lifecycle hooks
- Implement toolbar and sidebar
- Connect IPC handlers

### Phase 3: Features (Week 3)
- Save/Load workflows
- Export functionality (PNG/SVG/JSON)
- Theme switching
- Design list management

### Phase 4: Polish (Week 4)
- Error handling and validation
- Performance optimization
- E2E testing
- Documentation

### Testing Strategy
- Unit tests: Storage layer (file I/O, JSON validation)
- Component tests: ExcalidrawView lifecycle, toolbar interactions
- Integration tests: Save→Load→Export workflows
- E2E tests: Full user scenarios

---

## 9. Risks & Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bundle size increase (Excalidraw ~2MB) | Medium | Lazy-load plugin, document in release notes |
| React version conflicts | Low | Excalidraw compatible with React 17-18 |
| File system permissions | Low | Graceful error handling + user permissions dialog |
| Performance with large diagrams | Medium | Implement pagination in designs list, lazy render |
| Breaking changes in Excalidraw API | Medium | Pin version, monitor changelog, test quarterly |
| User confusion: Designer vs. Excalidraw | Low | Clear UI labels, separate nav entries |

---

## 10. Future Enhancements

1. **Collaborative Editing**: Integrate with Excalidraw+ cloud for team collaboration
2. **Script Engine**: Enable ExcalidrawAutomate for automation workflows
3. **Templates Library**: Provide pre-built templates (flowcharts, wireframes, ERDs)
4. **AI Integration**: Auto-generate descriptions from diagrams for Claude integration
5. **Mermaid Support**: Convert Mermaid diagrams to Excalidraw format
6. **Version Control**: Track design revisions and diffs
7. **Annotations**: Add comments/reviews to designs (via custom layer)

---

## Acceptance Criteria for MVP

✓ Excalidraw editor fully functional within Puffin view  
✓ Save/Load/Delete workflows working  
✓ Export to PNG, SVG, JSON formats  
✓ Designs persisted to `.puffin/excalidraw-designs/`  
✓ IPC contract compatible with Designer plugin  
✓ Dark/Light theme toggle  
✓ Unit tests for storage layer (>80% coverage)  
✓ Error handling with user-friendly messages  
✓ Plugin manifest complete with all extension points  
✓ Documentation: README.md with API examples