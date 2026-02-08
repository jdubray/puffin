# Excalidraw Plugin - Executive Summary

## Overview

This document provides a high-level summary of the Excalidraw plugin implementation plan. For detailed technical specifications, see [excalidraw-plugin-implementation-plan.md](./excalidraw-plugin-implementation-plan.md).

---

## Why Replace Designer Plugin?

**Current Designer Plugin Limitations**:
- Only 6 basic element types (container, text, input, button, image, list)
- Block styling only (no hand-drawn aesthetic)
- Export limited to JSON format
- Custom file format (not industry-standard)
- Limited extensibility

**Excalidraw Advantages**:
- **10+ element types**: rectangles, ellipses, diamonds, arrows, lines, frames, freedraw, text, images
- **Hand-drawn styling**: Professional yet approachable via Rough.js
- **Multiple export formats**: PNG, SVG, and JSON
- **Industry-standard format**: `.excalidraw` files work with Excalidraw web app
- **Active community**: Well-maintained open-source project
- **Advanced features**: Collaboration-ready, frames for hierarchical designs

---

## User Stories (5 Total)

### Story 1: Plugin Foundation & Storage Layer
**Effort**: 3 days
**Value**: High (enables all other work)

Implement storage layer (`excalidraw-storage.js`) with CRUD operations for `.excalidraw` files in `.puffin/excalidraw-designs/`. Includes plugin entry point (`index.js`) with IPC handler registration and lifecycle management.

**Key Deliverables**:
- Storage directory: `.puffin/excalidraw-designs/`
- 9 IPC handlers: save, load, list, update, delete, rename, checkNameUnique, export, import
- Unit tests (>80% coverage)

---

### Story 2: Excalidraw React Component Integration
**Effort**: 4 days
**Value**: High (core feature)

Embed Excalidraw React component within Puffin's vanilla JS view system. Create `ExcalidrawView` (main view) and `ExcalidrawEditor` (React wrapper) components.

**Key Deliverables**:
- React component mounted via `ReactDOM.render()`
- Lifecycle methods: `init()`, `onActivate()`, `onDeactivate()`, `destroy()`
- Theme toggle (light/dark)
- Full Excalidraw toolset functional

---

### Story 3: Save/Load/Export Workflows
**Effort**: 4 days
**Value**: High (core feature)

Implement end-to-end workflows for persisting designs and exporting in multiple formats.

**Key Deliverables**:
- Save modal with name/description fields
- Load from sidebar list
- Export to PNG, SVG, JSON (using Excalidraw utilities)
- Import .excalidraw files
- Thumbnail generation (128x128 previews)

---

### Story 4: Design List Management & UI Polish
**Effort**: 3 days
**Value**: Medium (UX enhancement)

Build sidebar with design list, rename/delete capabilities, and UI refinements.

**Key Deliverables**:
- Thumbnail previews in sidebar
- Inline rename functionality
- Delete with confirmation
- Keyboard shortcuts (Ctrl+S, Ctrl+N, Ctrl+E)
- Responsive layout

---

### Story 5: Testing & Documentation
**Effort**: 3 days
**Value**: High (quality assurance)

Comprehensive test suite and developer documentation.

**Key Deliverables**:
- Unit tests: storage layer (17+ test cases)
- Component tests: view lifecycle, toolbar interactions
- Integration tests: save→load→export flows
- README with API examples and usage guide

---

## Technical Architecture

### File Storage Pattern

**Two-file approach**:
1. **`.excalidraw`** — Scene data (standard format)
   ```json
   {
     "type": "excalidraw",
     "version": 2,
     "elements": [...],
     "appState": {...},
     "files": {...}
   }
   ```

2. **`.meta.json`** — Metadata + thumbnail
   ```json
   {
     "id": "uuid",
     "filename": "design.excalidraw",
     "name": "Design Name",
     "description": "...",
     "createdAt": "ISO-8601",
     "thumbnailData": "base64-png"
   }
   ```

**Rationale**: Separation allows lightweight list operations (read metadata only) and maintains compatibility with standard Excalidraw tools.

---

### React Integration Strategy

**Hybrid approach**:
- **View component** (`ExcalidrawView.js`): ES6 class, manages lifecycle and state
- **React component** (`ExcalidrawEditor.js`): Stateless presentation, wraps Excalidraw

**Why not full React?**
- Puffin view components are ES6 classes, not React components
- Maintains consistency with existing plugins (Designer, Document Viewer)
- Excalidraw only exports React component (no vanilla JS version)

**Implementation**:
```javascript
// In ExcalidrawView.init()
const reactElement = React.createElement(ExcalidrawEditor, {
  initialData: { elements: [], appState: {} },
  theme: 'light',
  onChange: (elements, appState) => this.handleChange(elements, appState),
  onAPIReady: (api) => this.excalidrawAPI = api
})
ReactDOM.render(reactElement, this.canvasContainer)
```

---

### IPC Handler Contract

**Pattern** (same as Designer plugin):
```javascript
// Handler throws errors, PluginContext wraps in try-catch
async handleSaveDesign({ name, sceneData, metadata }) {
  // Validation
  if (!name) throw new Error('Design name is required')

  // Business logic
  return this.storage.saveDesign(name, sceneData, metadata)

  // PluginContext automatically returns { success: true, data: result }
  // or { success: false, error: error.message }
}
```

**Registered as**: `excalidraw:saveDesign` (prefix + action name)

---

## Dependencies

```json
{
  "@excalidraw/excalidraw": "^0.17.0",
  "react": "^18.2.0",      // Already in Puffin
  "react-dom": "^18.2.0"   // Already in Puffin
}
```

**Bundle Size Impact**: ~2MB (Excalidraw + dependencies)
**Mitigation**: Lazy-load plugin on view activation

---

## Deployment Strategy

### Direct Replacement
- Excalidraw plugin replaces Designer plugin immediately
- Nav bar: order 50 (Designer's position), icon ✏️
- Storage: `.puffin/excalidraw-designs/`
- No migration needed (Designer had minimal usage)

### Designer Plugin Removal
Post-deployment cleanup:
1. Remove `plugins/designer-plugin/` directory
2. Optional: Archive `.puffin/gui-definitions/` (no active use)
3. Update documentation

**Rationale**: Clean cutover is simpler than coexistence since Designer plugin wasn't actively used.

---

## Implementation Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | Foundation | Storage layer, plugin entry, IPC handlers, tests |
| **Week 2** | Core UI | React integration, view component, canvas rendering |
| **Week 3** | Features | Save/load/export, design list sidebar, CRUD ops |
| **Week 4** | Polish | UI refinements, comprehensive testing, documentation |

**Total Effort**: 17 days (3.4 weeks)

---

## Success Criteria (MVP)

✅ Excalidraw editor renders with all built-in tools
✅ Save/Load/Delete workflows functional
✅ Export to PNG, SVG, JSON working
✅ Designs persist to `.puffin/excalidraw-designs/`
✅ Thumbnail previews in sidebar
✅ Dark/Light theme toggle
✅ Unit tests >80% coverage
✅ Integration tests for save→load→export
✅ Error handling with user-friendly messages
✅ README with API examples
✅ Clean deployment, Designer plugin removed

---

## Risks & Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Bundle size increases load time** | Medium | Lazy-load plugin on view activation |
| **Excalidraw API breaking changes** | Medium | Pin to `^0.17.0`, test before upgrades |
| **Performance with large diagrams** | Medium | Pagination in sidebar, warn on >100 elements |
| **Export utilities fail in Electron** | Medium | Thorough testing, fallback to JSON-only |
| **Memory leaks from React** | Medium | Ensure `unmountComponentAtNode()` in destroy() |

---

## Future Enhancements (Post-MVP)

1. **Collaboration**: Integrate Excalidraw+ for real-time co-editing
2. **Script Automation**: Enable ExcalidrawAutomate for batch operations
3. **Templates Library**: Pre-built flowcharts, ERDs, wireframes
4. **AI Integration**: Generate design descriptions for Claude prompts
5. **Mermaid Support**: Import Mermaid diagrams, convert to Excalidraw
6. **Version Control**: Track design revisions, show diffs
7. **Annotations**: Add review comments to designs
8. **Export to Code**: Generate HTML/CSS from wireframes (advanced)

---

## Key Design Decisions

### 1. Two-File Storage Pattern
**Decision**: Separate `.excalidraw` (scene) and `.meta.json` (metadata) files
**Rationale**: Maintains compatibility with standard Excalidraw tools, enables lightweight list operations

### 2. Hybrid React Integration
**Decision**: ES6 view class wraps React component
**Rationale**: Maintains consistency with Puffin architecture, no core changes required

### 3. Thumbnail Generation on Save
**Decision**: Generate 128x128 PNG on every save, store as base64
**Rationale**: Fast sidebar rendering, no on-demand caching complexity

### 4. Export in Renderer Process
**Decision**: Use Excalidraw's `exportToCanvas`/`exportToSvg` in renderer
**Rationale**: Canvas API not available in main process, consistent with Excalidraw's own export

### 5. Direct Replacement
**Decision**: Replace Designer plugin immediately, no coexistence
**Rationale**: Designer had minimal usage, clean cutover avoids complexity

---

## Open Questions

1. **Plugin Naming**: "Excalidraw Sketcher" or "Excalidraw Designer"?
   - **Recommendation**: "Excalidraw Sketcher" (avoids confusion)

2. **Icon Choice**: ✏️ (pencil) or 🖊️ (pen)?
   - **Recommendation**: ✏️ (matches hand-drawn aesthetic)

3. **Sidebar Resizable**: Fixed 300px or drag-to-resize?
   - **Recommendation**: Fixed for MVP, add resize handle in v1.1

4. **Designer Removal Timeline**: When to remove after deployment?
   - **Recommendation**: Remove immediately (no active usage to preserve)

---

## File Structure

```
plugins/excalidraw-plugin/
├── index.js                           # Entry point (~200 lines)
├── puffin-plugin.json                 # Manifest
├── excalidraw-storage.js              # Persistence (~500 lines)
├── package.json                       # Dependencies
├── README.md                          # Documentation
├── renderer/
│   ├── components/
│   │   ├── ExcalidrawView.js          # Main view (~800 lines)
│   │   ├── ExcalidrawEditor.js        # React wrapper (~150 lines)
│   │   └── index.js                   # Exports
│   └── styles/
│       └── excalidraw-view.css        # Styling (~200 lines)
└── tests/
    ├── excalidraw-storage.test.js     # Storage tests (~400 lines)
    ├── excalidraw-view.test.js        # View tests (~300 lines)
    └── integration.test.js            # E2E tests (~200 lines)
```

**Total LOC**: ~2,500 (plugin) + ~900 (tests) = ~3,400 lines

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Approve user stories** and acceptance criteria
3. **Set up plugin directory** structure
4. **Begin Story 1** (Foundation & Storage Layer)
5. **Iterate weekly** with demo sessions

---

**Document Status**: Draft v1.0
**Planning Phase**: Complete
**Implementation Phase**: Ready to begin
**Target Completion**: 4 weeks from start date
