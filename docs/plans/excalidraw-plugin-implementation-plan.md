# Excalidraw Plugin Implementation Plan

## Executive Summary

This plan details the implementation of an Excalidraw-based sketching plugin to replace Puffin's basic Designer plugin. The new plugin will provide advanced hand-drawn style diagramming capabilities while maintaining full compatibility with Puffin's plugin architecture.

**Key Benefits**:
- Rich element types (shapes, arrows, frames, freedraw) vs. 6 basic elements
- Advanced hand-drawn styling via Rough.js
- Export to PNG, SVG, and JSON (vs. JSON only)
- Industry-standard Excalidraw format (.excalidraw files)
- Active open-source community and maintenance

---

## 1. Architectural Analysis

### 1.1 Designer Plugin Architecture Review

**Current Designer Plugin Structure** (baseline for comparison):

```
plugins/designer-plugin/
├── index.js                           # Entry point with activate/deactivate lifecycle
├── puffin-plugin.json                 # Manifest with view/command registration
├── designer-storage.js                # Persistence layer (400 lines)
└── renderer/
    ├── components/
    │   ├── DesignerView.js            # Main view component (800+ lines)
    │   └── index.js                   # Component exports
    └── styles/
        └── designer-view.css          # Component styling
```

**Key Patterns Observed**:

1. **Plugin Entry Point** (`index.js`):
   - Exports object with `activate()` and `deactivate()` methods
   - Initializes storage layer with `context.projectPath`
   - Registers IPC handlers via `context.registerIpcHandler(channelName, handler)`
   - Registers programmatic actions via `context.registerAction(actionName, method)`
   - IPC handlers are thin wrappers that throw errors (PluginContext wraps in try-catch)

2. **Storage Layer** (`designer-storage.js`):
   - Manages file I/O for `.puffin/gui-definitions/` directory
   - Enforces name uniqueness via `DuplicateNameError`
   - Sanitizes filenames: `name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()`
   - Validates filenames to prevent path traversal
   - Returns structured objects: `{ filename, design }` or `{ success: true, data: ... }`

3. **View Component** (`DesignerView.js`):
   - ES6 class with `constructor(element, options)`
   - Lifecycle methods: `init()`, `onActivate()`, `onDeactivate()`, `destroy()`
   - State properties: `this.elements`, `this.selectedElement`, `this.definitions`, `this.loading`, `this.error`
   - Renders HTML via `innerHTML` (vanilla JS, no JSX)
   - Uses `window.puffin.plugins.invoke(pluginName, handlerName, args)` for IPC

4. **Manifest** (`puffin-plugin.json`):
   - `extensionPoints.ipcHandlers`: array of channel names (prefixed with `designer:`)
   - `contributes.views`: array with `id`, `name`, `location: "nav"`, `icon`, `order`, `component`
   - `renderer.components`: array with `name`, `export`, `type: "class"`, `description`

**IPC Handler Naming Convention**: `pluginPrefix:actionName` (e.g., `designer:saveDesign`)

**Storage Directory Convention**: `.puffin/{feature-name}/` (e.g., `.puffin/gui-definitions/`)

---

### 1.2 Excalidraw Integration Requirements

**Excalidraw Dependencies**:
```json
{
  "@excalidraw/excalidraw": "^0.17.0",
  "react": "^18.2.0",      // Already in Puffin
  "react-dom": "^18.2.0"   // Already in Puffin
}
```

**Excalidraw API Surface** (relevant to plugin):

```javascript
// React component import
import { Excalidraw } from "@excalidraw/excalidraw"

// API reference obtained via ref callback
<Excalidraw
  ref={(api) => setExcalidrawAPI(api)}
  initialData={{ elements: [], appState: {} }}
  onChange={(elements, appState, files) => handleChange(elements, appState, files)}
  theme={theme}
/>

// API methods
excalidrawAPI.updateScene({ elements, appState, collaborators })
excalidrawAPI.resetScene()
excalidrawAPI.scrollToContent()
excalidrawAPI.getSceneElements() // Returns elements array
excalidrawAPI.getAppState() // Returns appState object
excalidrawAPI.getFiles() // Returns files object (for embedded images)

// Export utilities (importable separately)
import { exportToCanvas, exportToSvg, exportToBlob } from "@excalidraw/excalidraw"
```

**Excalidraw Data Model**:

```typescript
// .excalidraw file schema
{
  "type": "excalidraw",
  "version": 2,
  "source": "https://excalidraw.com",
  "elements": [
    {
      "type": "rectangle" | "ellipse" | "diamond" | "arrow" | "line" | "freedraw" | "text" | "image" | "frame",
      "id": "string",
      "x": number,
      "y": number,
      "width": number,
      "height": number,
      "angle": number,
      "strokeColor": "string",
      "backgroundColor": "string",
      "fillStyle": "hachure" | "cross-hatch" | "solid",
      "strokeWidth": number,
      "roughness": number,
      "opacity": number,
      "text": "string",  // for text elements
      "fontSize": number,
      "fontFamily": number,
      "// ... more properties"
    }
  ],
  "appState": {
    "theme": "light" | "dark",
    "viewBackgroundColor": "string",
    "currentItemStrokeColor": "string",
    "currentItemBackgroundColor": "string",
    "gridSize": number,
    "// ... more app settings"
  },
  "files": {
    "fileId": {
      "id": "string",
      "dataURL": "base64-encoded-image",
      "mimeType": "string",
      "created": number
    }
  }
}
```

**Key Difference from Designer**:
- Designer stores `{ elements: [...], metadata: {...} }` (flat array of simple elements)
- Excalidraw stores `{ elements: [...], appState: {...}, files: {...} }` (richer scene graph)

---

## 2. User Stories

### Story 1: Plugin Foundation & Storage Layer

**Title:** Implement Excalidraw plugin storage and lifecycle infrastructure

**Description:** As a developer, I want the Excalidraw plugin to have a robust storage layer and lifecycle management so that it integrates seamlessly with Puffin's plugin architecture.

**Acceptance Criteria:**
1. `plugins/excalidraw-plugin/` directory structure created with:
   - `index.js` (entry point)
   - `puffin-plugin.json` (manifest)
   - `excalidraw-storage.js` (persistence layer)
   - `renderer/components/` and `renderer/styles/` directories
2. `excalidraw-storage.js` implements all CRUD operations:
   - `saveDesign(name, sceneData, metadata)` → writes `.excalidraw` file to `.puffin/excalidraw-designs/`
   - `loadDesign(filename)` → reads and parses `.excalidraw` file
   - `listDesigns()` → returns array of `{ filename, name, description, metadata, thumbnailData }`
   - `updateDesign(filename, updates)` → merges updates and writes
   - `deleteDesign(filename)` → removes file
   - `renameDesign(oldFilename, newName)` → updates file and metadata
   - `isNameUnique(name, excludeFilename)` → validates uniqueness
   - `ensureDesignsDirectory()` → creates storage paths if missing
3. Storage layer validates:
   - Filename format (must be `.excalidraw`)
   - Path traversal prevention (no `..`, `/`, `\`)
   - Name uniqueness (throws `DuplicateNameError`)
   - JSON schema compliance (has `type`, `version`, `elements` keys)
4. `index.js` implements plugin lifecycle:
   - `activate(context)` initializes storage, registers IPC handlers and actions
   - `deactivate()` cleans up resources
   - All 9 IPC handlers registered: `excalidraw:saveDesign`, `excalidraw:loadDesign`, `excalidraw:listDesigns`, `excalidraw:updateDesign`, `excalidraw:deleteDesign`, `excalidraw:renameDesign`, `excalidraw:checkNameUnique`, `excalidraw:exportDesign`, `excalidraw:importDesign`
5. `puffin-plugin.json` manifest complete with:
   - `extensionPoints.ipcHandlers` listing all 9 handlers
   - `extensionPoints.actions` listing 4 programmatic actions
   - `contributes.views` defining view registration (id: `excalidraw-view`, location: `nav`, order: 51)
   - `renderer` section with component exports and styles
6. Unit tests for storage layer (>80% coverage):
   - File creation/deletion
   - Name uniqueness validation
   - Path traversal prevention
   - Filename sanitization
   - Error handling (ENOENT, EEXIST, malformed JSON)

**Technical Notes:**
- Use same patterns as `designer-storage.js`: filename sanitization, validation, DuplicateNameError
- Storage directory: `.puffin/excalidraw-designs/` (parallel to `.puffin/gui-definitions/`)
- File extension: `.excalidraw` (not `.json`) — aligns with Excalidraw convention
- IPC handler error handling: throw errors (PluginContext wraps in try-catch)
- Thumbnail generation deferred to Story 3 (use placeholder for MVP)

---

### Story 2: Excalidraw React Component Integration

**Title:** Integrate Excalidraw React component into Puffin renderer

**Description:** As a developer, I want to embed the Excalidraw React component within Puffin's view system so that users can draw diagrams with the full Excalidraw feature set.

**Acceptance Criteria:**
1. `renderer/components/ExcalidrawEditor.js` created as React wrapper:
   - Imports `Excalidraw` from `@excalidraw/excalidraw`
   - Accepts props: `initialData`, `theme`, `onChange`, `onExport`
   - Uses `ref` callback to capture `excalidrawAPI` reference
   - Forwards API reference to parent via callback prop
   - Handles `onChange` events to sync state with parent
2. `renderer/components/ExcalidrawView.js` created as main view component:
   - ES6 class with lifecycle methods: `init()`, `onActivate()`, `onDeactivate()`, `destroy()`
   - State properties:
     - `this.elements = []` — current scene elements
     - `this.appState = {}` — Excalidraw app state (theme, colors, etc.)
     - `this.files = {}` — embedded image files
     - `this.selectedElement = null` — currently selected element ID
     - `this.definitions = []` — cached list of saved designs
     - `this.loading = false` — loading indicator
     - `this.error = null` — error message
     - `this.excalidrawAPI = null` — reference to Excalidraw API
   - Renders layout:
     - Toolbar at top (New, Save, Clear, Export buttons + theme toggle)
     - Excalidraw canvas in main area (100% width/height)
     - Saved designs sidebar on right (list with load/delete buttons)
   - Uses React.createElement to render `ExcalidrawEditor` (no JSX, vanilla JS context)
   - Attaches event listeners for toolbar actions
3. `init()` lifecycle:
   - Renders container HTML structure
   - Mounts React component into canvas container via `ReactDOM.render()`
   - Loads saved designs list via IPC `excalidraw:listDesigns`
   - Attaches toolbar event listeners
4. `destroy()` lifecycle:
   - Unmounts React component via `ReactDOM.unmountComponentAtNode()`
   - Removes event listeners
   - Nulls out API reference
   - Clears state
5. Theme switching functional:
   - Toggle button switches between `light` and `dark` themes
   - Theme persists to `appState` and saved with designs
   - CSS variable overrides for Puffin integration (if needed)
6. Excalidraw component renders with all built-in tools:
   - Element palette (shapes, arrows, lines, freedraw, text, image, frame)
   - Hand-drawn styling applied automatically
   - Grid visible and toggleable
   - Zoom/pan controls functional

**Technical Notes:**
- Puffin already uses React 18 — no additional React installation needed
- Use `React.createElement()` in vanilla JS context (DesignerView pattern)
- Mount point: `<div id="excalidraw-canvas"></div>` within view container
- Excalidraw CSS auto-loaded via npm package (verify no conflicts)
- State management: view component is source of truth, React component is presentation layer
- IPC calls use `window.puffin.plugins.invoke('excalidraw-plugin', handlerName, args)`

---

### Story 3: Save/Load/Export Workflows

**Title:** Implement design save, load, and export functionality

**Description:** As a user, I want to save my Excalidraw diagrams, reload them later, and export them in multiple formats so that I can persist and share my work.

**Acceptance Criteria:**

**Save Workflow**:
1. "Save" button click triggers modal dialog with fields:
   - Design name (required, validates uniqueness)
   - Description (optional)
2. User enters name and clicks "Save" → IPC call to `excalidraw:saveDesign` with:
   ```javascript
   {
     name: "Login Wireframe",
     sceneData: {
       elements: excalidrawAPI.getSceneElements(),
       appState: excalidrawAPI.getAppState(),
       files: excalidrawAPI.getFiles()
     },
     metadata: {
       description: "Mobile login form",
       elementCount: elements.length
     }
   }
   ```
3. Storage layer writes `.excalidraw` file with schema:
   ```json
   {
     "type": "excalidraw",
     "version": 2,
     "source": "puffin-excalidraw-plugin",
     "elements": [...],
     "appState": {...},
     "files": {...}
   }
   ```
4. Separate metadata file written: `{filename}.meta.json`:
   ```json
   {
     "id": "design-uuid",
     "filename": "login_wireframe.excalidraw",
     "name": "Login Wireframe",
     "description": "Mobile login form",
     "createdAt": "ISO-8601",
     "updatedAt": "ISO-8601",
     "elementCount": 12,
     "thumbnailData": "base64-png"
   }
   ```
5. UI refreshes saved designs list
6. Success notification displayed: "Design saved!"

**Load Workflow**:
1. User clicks load button (📂) next to design in sidebar
2. IPC call to `excalidraw:loadDesign` with `filename`
3. Storage layer reads `.excalidraw` file and parses JSON
4. View calls `excalidrawAPI.updateScene({ elements, appState, collaborators: [] })`
5. Canvas re-renders with loaded elements
6. Success notification: "Design loaded!"

**Export Workflow**:
1. "Export" button click triggers format selection modal:
   - PNG (raster image)
   - SVG (vector format)
   - JSON (scene data for reimport)
2. User selects format → IPC call to `excalidraw:exportDesign` with `{ filename, format }`
3. Storage layer uses Excalidraw export utilities:
   ```javascript
   import { exportToCanvas, exportToSvg, exportToBlob } from "@excalidraw/excalidraw"

   // PNG export
   const canvas = await exportToCanvas({ elements, appState, files })
   const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))

   // SVG export
   const svg = await exportToSvg({ elements, appState, files })
   const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' })

   // JSON export (just stringify the .excalidraw file)
   const json = JSON.stringify({ type: "excalidraw", version: 2, elements, appState, files })
   const blob = new Blob([json], { type: 'application/json' })
   ```
4. Blob returned to renderer
5. Trigger download via `<a>` tag with `download` attribute
6. Success notification: "Exported as {format}!"

**Import Workflow**:
1. "Import" button triggers file picker (`.excalidraw` files)
2. User selects file → read via FileReader API
3. IPC call to `excalidraw:importDesign` with `{ jsonContent, newName }`
4. Storage validates JSON schema (has `elements`, `appState` keys)
5. Prompts for new name if `newName` not provided
6. Saves as new design (assigns new ID)
7. UI refreshes designs list
8. Success notification: "Design imported!"

**Thumbnail Generation** (for sidebar previews):
1. On save, generate 128x128 PNG thumbnail:
   ```javascript
   const canvas = await exportToCanvas({
     elements,
     appState: { ...appState, exportBackground: false },
     files,
     maxWidthOrHeight: 128
   })
   const thumbnailDataURL = canvas.toDataURL('image/png')
   ```
2. Store in `{filename}.meta.json` as `thumbnailData: "data:image/png;base64,..."`
3. Sidebar renders `<img src={thumbnailData}>` next to design name

**Error Handling**:
- Duplicate name → show error modal: "A design named '{name}' already exists"
- File not found → show error: "Design not found: {filename}"
- Malformed JSON → show error: "Invalid .excalidraw file"
- Export failure → show error: "Failed to export: {reason}"
- All errors displayed via toast notifications (3-second auto-dismiss)

**Technical Notes:**
- Use modal pattern from existing Puffin components (check modal-manager.js)
- Export utilities may be async — handle promises correctly
- PNG export size limit: 4096x4096 (Excalidraw default)
- SVG export includes embedded fonts for portability
- JSON export preserves exact scene state (lossless round-trip)

---

### Story 4: Design List Management & UI Polish

**Title:** Implement design list sidebar with CRUD operations and UI refinements

**Description:** As a user, I want to see a list of my saved designs with preview thumbnails, rename/delete capabilities, and a polished UI so that I can manage my design library effectively.

**Acceptance Criteria:**

**Saved Designs Sidebar**:
1. Right sidebar displays list of saved designs with:
   - Thumbnail image (128x128 preview)
   - Design name (bold)
   - Description (truncated to 1 line, tooltip shows full text)
   - Element count badge (e.g., "12 elements")
   - Last modified timestamp (relative: "2 hours ago")
   - Action buttons: Load (📂), Rename (✏️), Delete (🗑)
2. List sorted by last modified (most recent first)
3. Empty state shown when no designs exist: "No designs yet. Create your first design!"
4. Hovering over design item highlights it (subtle background color change)

**Rename Workflow**:
1. User clicks rename button (✏️) → inline edit mode activates
2. Design name becomes editable `<input>` field
3. User edits name and presses Enter or clicks away → IPC call to `excalidraw:renameDesign`
4. Storage layer validates uniqueness, updates filename and metadata
5. UI refreshes list
6. Success notification: "Design renamed!"
7. Cancel on Escape key → reverts to original name

**Delete Workflow**:
1. User clicks delete button (🗑) → confirmation modal appears:
   "Delete design '{name}'? This cannot be undone."
2. User confirms → IPC call to `excalidraw:deleteDesign`
3. Storage layer deletes `.excalidraw` file and `.meta.json` file
4. UI removes item from list with fade-out animation
5. Success notification: "Design deleted!"

**UI Polish**:
1. Toolbar styled with Puffin theme colors (check `src/renderer/styles/themes.css`)
2. Element palette buttons show tooltips on hover
3. Canvas area fills available space (flex layout)
4. Sidebar has fixed width (300px) with scroll overflow
5. Loading state: spinner shown while designs list loads
6. Error state: error message displayed with retry button if list load fails
7. Responsive behavior: sidebar collapses to icon-only on narrow screens (<800px)
8. Keyboard shortcuts:
   - `Ctrl+S` → Save design
   - `Ctrl+N` → New design
   - `Ctrl+E` → Export design
   - `Delete` → Delete selected element (Excalidraw built-in)

**Performance Optimizations**:
1. Lazy-load thumbnails (render placeholders first, load images async)
2. Debounce `onChange` handler to avoid excessive state updates (250ms)
3. Virtualize design list if >50 items (use react-window or similar)
4. Cache loaded designs in memory (avoid re-parsing on every load)

**Accessibility**:
1. All buttons have `aria-label` attributes
2. Keyboard navigation functional (Tab through palette, Enter to activate)
3. Focus indicators visible for keyboard users
4. Modal dialogs trap focus (Tab cycles within modal)

**Technical Notes:**
- Use same modal system as Designer plugin (check DesignerView.js for patterns)
- Toast notifications via `window.puffin.showNotification(message, type)`
- Relative timestamps via existing Puffin utility (check for date formatter)
- Inline edit component can be custom or use contenteditable
- Debounce utility: check if Puffin has one, else implement simple version

---

### Story 5: Testing & Documentation

**Title:** Comprehensive testing and developer documentation

**Description:** As a developer, I want thorough test coverage and clear documentation so that the plugin is maintainable and extensible.

**Acceptance Criteria:**

**Unit Tests** (80%+ coverage):
1. **Storage Layer Tests** (`excalidraw-storage.test.js`):
   - ✓ `saveDesign()` creates `.excalidraw` file with correct schema
   - ✓ `saveDesign()` creates `.meta.json` with metadata
   - ✓ `saveDesign()` throws `DuplicateNameError` on name conflict
   - ✓ `loadDesign()` reads and parses valid `.excalidraw` file
   - ✓ `loadDesign()` throws error on ENOENT
   - ✓ `loadDesign()` throws error on malformed JSON
   - ✓ `listDesigns()` returns array of design metadata
   - ✓ `listDesigns()` returns empty array if directory doesn't exist
   - ✓ `updateDesign()` merges updates and preserves ID
   - ✓ `deleteDesign()` removes both `.excalidraw` and `.meta.json`
   - ✓ `renameDesign()` updates filename and design.name
   - ✓ `renameDesign()` throws error if new name conflicts
   - ✓ `isNameUnique()` returns true/false correctly
   - ✓ Filename sanitization converts spaces to underscores, lowercases
   - ✓ Filename validation rejects path traversal (`../`, `./`)
   - ✓ Filename validation rejects non-.excalidraw extensions
   - ✓ `ensureDesignsDirectory()` creates directory if missing

2. **View Component Tests** (`excalidraw-view.test.js`):
   - ✓ `init()` renders toolbar, canvas, and sidebar
   - ✓ `init()` loads designs list on mount
   - ✓ Palette button click adds element to canvas (via Excalidraw API)
   - ✓ "Save" button shows modal dialog
   - ✓ "Load" button calls `excalidrawAPI.updateScene()`
   - ✓ "Export" button triggers export modal
   - ✓ Theme toggle switches Excalidraw theme
   - ✓ `destroy()` unmounts React component and cleans up listeners
   - ✓ Error state displays error message when list load fails
   - ✓ Loading state shows spinner during async operations

3. **Integration Tests** (`integration.test.js`):
   - ✓ Save → Load → Canvas renders same elements
   - ✓ Export PNG → file size > 0, MIME type correct
   - ✓ Export SVG → valid XML, contains `<svg>` tag
   - ✓ Export JSON → JSON.parse succeeds, has `elements` key
   - ✓ Import .excalidraw → design added to list
   - ✓ Rename → filename changes, design loadable by new name
   - ✓ Delete → file removed from filesystem, list updates

**Documentation**:
1. **README.md** in plugin root:
   - Overview and feature list
   - Installation instructions (npm install)
   - Usage guide with screenshots
   - API reference for programmatic actions
   - IPC handler documentation
   - Troubleshooting section
   - License (MIT)

2. **API Examples**:
   ```javascript
   // Programmatic save from main process
   const result = await pluginManager.invokeAction('excalidraw:saveDesign', {
     name: "My Diagram",
     sceneData: { elements: [...], appState: {...}, files: {} },
     metadata: { description: "Flow diagram" }
   })

   // IPC call from renderer
   const designs = await window.puffin.plugins.invoke('excalidraw-plugin', 'listDesigns')
   ```

3. **Code Comments**:
   - JSDoc for all public methods (params, returns, throws)
   - Inline comments for complex logic (export utilities, thumbnail generation)
   - Architecture decision records (ADRs) for key design choices

**CI/CD Integration** (if applicable):
- Tests run on `npm test` command
- Pre-commit hook runs linter and tests
- GitHub Actions workflow (if Puffin uses it) runs tests on PR

---

## 3. Technical Design Decisions

### 3.1 File Storage Format

**Decision**: Use two-file pattern (`.excalidraw` + `.meta.json`) instead of single file.

**Rationale**:
- `.excalidraw` files are standard format — can be opened in Excalidraw web app
- Metadata (thumbnails, search indices) bloats the scene file
- Separation allows lightweight list operations (read `.meta.json` only, not full `.excalidraw`)
- Aligns with Excalidraw conventions

**Alternative Considered**: Single file with custom schema wrapping Excalidraw format
- Rejected: Breaks interoperability with standard Excalidraw tools

---

### 3.2 React Integration Strategy

**Decision**: Use React within vanilla JS view component via `React.createElement()` and `ReactDOM.render()`.

**Rationale**:
- Puffin view components are ES6 classes, not React components
- Excalidraw only exports React component (no vanilla JS version)
- Hybrid approach: view component manages lifecycle, React component handles canvas
- Designer plugin uses vanilla JS → maintain consistency

**Alternative Considered**: Convert entire view to React component
- Rejected: Would require Puffin core changes to support React view components

---

### 3.3 Export Implementation

**Decision**: Use Excalidraw's built-in export utilities (`exportToCanvas`, `exportToSvg`) in main process.

**Rationale**:
- Canvas API not available in main process → need to proxy through renderer
- Export utilities handle fonts, images, transparency correctly
- Consistent with Excalidraw's own export behavior

**Implementation**:
```javascript
// In renderer/components/ExcalidrawView.js
async exportAsFormat(format) {
  const elements = this.excalidrawAPI.getSceneElements()
  const appState = this.excalidrawAPI.getAppState()
  const files = this.excalidrawAPI.getFiles()

  if (format === 'png') {
    const canvas = await exportToCanvas({ elements, appState, files })
    canvas.toBlob(blob => {
      // Trigger download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${this.currentDesignName}.png`
      a.click()
    }, 'image/png')
  }
  // ... SVG and JSON similar
}
```

---

### 3.4 Thumbnail Generation

**Decision**: Generate thumbnails on save using Excalidraw's `exportToCanvas` with `maxWidthOrHeight: 128`.

**Rationale**:
- Fast preview loading in sidebar (don't re-render full scene)
- Small file size (<20KB per thumbnail)
- Base64 encoding allows embedding in `.meta.json`

**Alternative Considered**: Generate thumbnails on-demand
- Rejected: Slower sidebar rendering, more complex caching logic

---

### 3.5 State Management

**Decision**: View component (`ExcalidrawView`) holds state, React component (`ExcalidrawEditor`) is stateless presentation.

**Rationale**:
- View component is lifecycle owner (init/destroy)
- React component is ephemeral (unmounted on view deactivate)
- State persistence handled at view level (IPC calls)

**State Flow**:
```
User interaction → Excalidraw component → onChange callback
→ ExcalidrawView state update → IPC save call → Storage layer
```

---

## 4. Deployment Strategy

### 4.1 Direct Replacement

- Excalidraw plugin replaces Designer plugin
- Nav bar entry: order 50 (takes Designer's position), icon ✏️
- Storage directory: `.puffin/excalidraw-designs/`
- No migration needed (Designer plugin had minimal usage)

### 4.2 Designer Plugin Removal

**Post-deployment cleanup**:
1. Remove Designer plugin directory: `plugins/designer-plugin/`
2. Optional: Keep `.puffin/gui-definitions/` for archival purposes (no active use)
3. Update documentation to reference Excalidraw plugin only

**Rationale**: Since Designer plugin hasn't been used extensively, clean cutover is simpler than maintaining coexistence infrastructure.

---

## 5. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Excalidraw bundle size increases plugin load time** | Medium | High | Lazy-load plugin on view activation, not on app startup |
| **React version conflicts** | Low | Low | Puffin uses React 18, Excalidraw compatible with 17-18 |
| **Excalidraw API breaking changes** | Medium | Medium | Pin to specific version (`^0.17.0`), test before upgrades |
| **Performance degradation with large diagrams** | Medium | Medium | Implement pagination in sidebar, warn on >100 elements |
| **File system permissions issues** | Low | Low | Graceful error handling with user-friendly messages |
| **Thumbnail generation fails** | Low | Medium | Fallback to placeholder icon, retry on next save |
| **User confusion about new UI** | Low | Low | Clear documentation, intuitive Excalidraw interface |
| **Export utilities fail in Electron context** | Medium | Low | Test thoroughly, provide fallback to JSON-only export |
| **Memory leaks from React component** | Medium | Low | Ensure `ReactDOM.unmountComponentAtNode()` called in destroy() |

---

## 6. Implementation Timeline

### Week 1: Foundation
- **Days 1-2**: Set up plugin directory structure, create manifest
- **Days 3-4**: Implement storage layer with unit tests
- **Day 5**: Implement plugin entry point (index.js) with IPC handlers

**Deliverable**: Storage layer fully functional, all tests passing

### Week 2: Core UI
- **Days 1-2**: Create ExcalidrawEditor React wrapper
- **Days 3-4**: Create ExcalidrawView component with lifecycle
- **Day 5**: Integrate React component, test rendering

**Deliverable**: Excalidraw canvas renders, basic toolbar functional

### Week 3: Features
- **Days 1-2**: Implement save/load workflows
- **Days 3-4**: Implement export functionality (PNG/SVG/JSON)
- **Day 5**: Implement design list sidebar with CRUD operations

**Deliverable**: Full feature parity with Designer plugin + export enhancements

### Week 4: Polish & Testing
- **Days 1-2**: UI refinements (styling, animations, tooltips)
- **Days 3-4**: Comprehensive testing (unit + integration)
- **Day 5**: Documentation, README, final review

**Deliverable**: Production-ready plugin with 80%+ test coverage

---

## 7. Success Metrics

**Functional Completeness**:
- ✓ All 9 IPC handlers working
- ✓ Save/Load round-trip preserves elements
- ✓ Export to PNG/SVG/JSON functional
- ✓ Design list displays with thumbnails
- ✓ Rename/Delete workflows work
- ✓ Theme toggle works

**Quality Metrics**:
- ✓ 80%+ code coverage
- ✓ Zero critical bugs
- ✓ <100ms load time for designs list
- ✓ <500ms export time for typical diagrams (<50 elements)

**User Acceptance**:
- ✓ Clear documentation with examples
- ✓ Error messages user-friendly
- ✓ No data loss scenarios
- ✓ Compatible with standard .excalidraw files

---

## 8. Future Enhancements (Post-MVP)

1. **Collaboration**: Integrate Excalidraw+ cloud for real-time co-editing
2. **Script Automation**: Enable ExcalidrawAutomate for batch operations
3. **Templates Library**: Pre-built templates (flowcharts, ERDs, wireframes)
4. **AI Integration**: Generate design descriptions for Claude prompts
5. **Mermaid Support**: Import Mermaid diagrams and convert to Excalidraw
6. **Version Control**: Track design revisions, show diffs
7. **Annotations Layer**: Add review comments to designs
8. **Export to Code**: Generate HTML/CSS from UI wireframes (advanced)

---

## 9. Open Questions

1. **Plugin Naming**: "Excalidraw Sketcher" or "Excalidraw Designer"?
   - Recommendation: "Excalidraw Sketcher" (avoids confusion with Designer plugin)

2. **Icon Choice**: What icon for nav bar?
   - Recommendation: ✏️ (pencil) to match hand-drawn aesthetic

3. **Sidebar Width**: Fixed 300px or resizable?
   - Recommendation: Fixed for MVP, add resize handle in v1.1

4. **Automatic Thumbnails**: Generate on every save or on-demand?
   - Recommendation: On save (simpler, no caching logic needed)

5. **Designer Plugin Removal**: When to remove after deployment?
   - Recommendation: Remove immediately post-deployment (no active usage to preserve)

---

## 10. Appendix: File Structure Reference

```
plugins/excalidraw-plugin/
├── index.js                           # Entry point (activate/deactivate)
├── puffin-plugin.json                 # Manifest
├── excalidraw-storage.js              # Persistence layer (~500 lines)
├── package.json                       # Dependencies (@excalidraw/excalidraw)
├── README.md                          # Documentation
├── renderer/
│   ├── components/
│   │   ├── ExcalidrawView.js          # Main view (~800 lines)
│   │   ├── ExcalidrawEditor.js        # React wrapper (~150 lines)
│   │   └── index.js                   # Component exports
│   └── styles/
│       └── excalidraw-view.css        # View styling (~200 lines)
└── tests/
    ├── excalidraw-storage.test.js     # Storage tests (~400 lines)
    ├── excalidraw-view.test.js        # View tests (~300 lines)
    └── integration.test.js            # E2E tests (~200 lines)

.puffin/
└── excalidraw-designs/                # User designs storage
    ├── login_wireframe.excalidraw     # Scene data
    ├── login_wireframe.meta.json      # Metadata + thumbnail
    ├── dashboard.excalidraw
    └── dashboard.meta.json
```

**Total Estimated LOC**: ~2,500 lines (excluding tests)
**Total Test LOC**: ~900 lines
**Test Coverage Target**: 80%+

---

## Acceptance Criteria for MVP

The Excalidraw plugin MVP is complete when:

✅ **All 5 user stories accepted** (each story has specific AC in sections above)
✅ **Excalidraw editor fully functional** within Puffin view
✅ **Save/Load/Delete workflows** working end-to-end
✅ **Export to PNG, SVG, JSON** formats functional
✅ **Designs persisted** to `.puffin/excalidraw-designs/`
✅ **IPC contract** compatible with Designer plugin (same method signatures)
✅ **Dark/Light theme** toggle working
✅ **Unit tests** for storage layer (>80% coverage)
✅ **Integration tests** for save→load→export flows
✅ **Error handling** with user-friendly messages
✅ **Plugin manifest** complete with all extension points
✅ **Documentation**: README.md with API examples and usage guide
✅ **Clean deployment**: Plugin activated successfully, Designer plugin removed

---

**Document Status**: Draft v1.0
**Author**: Planning Agent
**Date**: 2026-02-06
**Review Status**: Pending stakeholder review
