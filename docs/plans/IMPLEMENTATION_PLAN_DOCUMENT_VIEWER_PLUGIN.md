# Implementation Plan: Document Viewer Plugin

## Overview

This plan covers the implementation of a Document Viewer plugin for Puffin that provides hierarchical navigation and preview of markdown files in the `docs/` directory.

### User Stories Covered

1. **Document Directory Tree Display** - Hierarchical tree view of docs/ directory
2. **Document File Listing Within Directories** - Markdown files listed within directories
3. **Document Selection and Preview** - Click to view rendered markdown
4. **Split Panel Layout for Document Viewer** - Navigation left, preview right
5. **Document Viewer Plugin Registration** - Plugin system integration

---

## Architecture Analysis

### Component Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                    Document Viewer Plugin                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐         ┌──────────────────────────────┐ │
│  │  Plugin Manifest │         │        Main Process          │ │
│  │ puffin-plugin.json│        │        index.js              │ │
│  └────────┬─────────┘         │  ┌────────────────────────┐  │ │
│           │                   │  │  DocumentScanner       │  │ │
│           │                   │  │  - scanDirectory()     │  │ │
│           │                   │  │  - buildTree()         │  │ │
│           │                   │  └────────────────────────┘  │ │
│           │                   │  ┌────────────────────────┐  │ │
│           │                   │  │  IPC Handlers          │  │ │
│           │                   │  │  - getDocumentTree     │  │ │
│           │                   │  │  - readDocument        │  │ │
│           │                   │  └────────────────────────┘  │ │
│           │                   └──────────────────────────────┘ │
│           │                                                    │
│           ▼                                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    Renderer Process                      │  │
│  │  ┌───────────────────────────────────────────────────┐  │  │
│  │  │          DocumentViewerComponent                   │  │  │
│  │  │  ┌─────────────────┐  ┌────────────────────────┐  │  │  │
│  │  │  │  DocumentTree   │  │  MarkdownPreview       │  │  │  │
│  │  │  │  - renderTree() │  │  - renderMarkdown()    │  │  │  │
│  │  │  │  - handleClick()│  │  - sanitizeHtml()      │  │  │  │
│  │  │  │  - expandNode() │  │  - highlightCode()     │  │  │  │
│  │  │  └─────────────────┘  └────────────────────────┘  │  │  │
│  │  └───────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Shared Components & Dependencies

| Component | Depends On | Used By |
|-----------|-----------|---------|
| DocumentScanner | Node.js fs module | IPC Handlers |
| IPC Handlers | DocumentScanner, Plugin Context | DocumentViewerComponent |
| DocumentTree | IPC Handlers | DocumentViewerComponent |
| MarkdownPreview | Marked.js or custom renderer | DocumentViewerComponent |

### Data Flow

```
1. Plugin Activation
   └─> DocumentScanner initializes
       └─> Ready to respond to IPC requests

2. View Opened
   └─> DocumentViewerComponent.init()
       └─> Calls getDocumentTree via IPC
           └─> DocumentScanner.scanDirectory()
               └─> Returns tree structure
                   └─> DocumentTree.renderTree()

3. File Selected
   └─> DocumentTree.handleClick(file)
       └─> Calls readDocument via IPC
           └─> fs.readFile()
               └─> Returns content
                   └─> MarkdownPreview.renderMarkdown()
```

---

## Implementation Order

### Recommended Sequence

```
Story 5 → Story 1 → Story 2 → Story 4 → Story 3
```

| Order | Story | Rationale |
|-------|-------|-----------|
| 1 | **Story 5: Plugin Registration** | Foundation - must exist before any UI can be displayed |
| 2 | **Story 1: Directory Tree Display** | Core navigation - provides the primary interaction model |
| 3 | **Story 2: File Listing** | Natural extension of tree - files within directories |
| 4 | **Story 4: Split Panel Layout** | Layout must exist before preview can be displayed |
| 5 | **Story 3: Selection and Preview** | Final feature - requires all other components to be in place |

### Rationale

1. **Plugin Registration First**: Without the plugin infrastructure, there's no way to display or test any UI components. This creates the container for all other work.

2. **Tree Navigation Before Preview**: Users need to navigate to files before they can preview them. Building navigation first allows testing the file discovery system independently.

3. **Layout Before Preview**: The split panel layout defines where the preview will appear. Creating this structure before the preview component ensures proper containment.

4. **Preview Last**: This is the most complex rendering component and depends on all others being in place.

---

## Technical Approach by Story

### Story 5: Document Viewer Plugin Registration

**Objective**: Create plugin foundation and register with Puffin

**Key Technical Decisions**:
- Plugin location: `~/.puffin/plugins/document-viewer-plugin/` (user plugins directory)
- View location: `nav` (top navigation tabs alongside Designer, Context)
- Component type: Class-based (following existing patterns)

**Files to Create**:

```
~/.puffin/plugins/document-viewer-plugin/
├── puffin-plugin.json
├── index.js
└── renderer/
    └── components/
        └── index.js
        └── DocumentViewerComponent.js
```

**Manifest Structure**:
```json
{
  "name": "document-viewer-plugin",
  "version": "1.0.0",
  "displayName": "Documents",
  "description": "Browse and preview documentation from docs/ directory",
  "main": "index.js",
  "contributes": {
    "views": [{
      "id": "document-viewer",
      "name": "Documents",
      "location": "nav",
      "icon": "📄",
      "order": 65,
      "component": "DocumentViewerComponent"
    }]
  },
  "renderer": {
    "entry": "renderer/components/index.js",
    "components": [{
      "name": "DocumentViewerComponent",
      "export": "DocumentViewerComponent",
      "type": "class"
    }]
  }
}
```

**Main Process Entry** (`index.js`):
- Export `activate(context)` and `deactivate()` functions
- Store plugin context reference
- Log activation status

**Acceptance Criteria Mapping**:
| AC | Implementation |
|----|----------------|
| Plugin registered with manager | Manifest in plugins directory, auto-discovered |
| Appears in plugin/view selector | `contributes.views` with location "nav" |
| Loads without errors | Minimal component with error handling |
| State preserved when switching | Component lifecycle with `onActivate`/`onDeactivate` |
| Follows plugin architecture | Class-based component, context usage |

---

### Story 1: Document Directory Tree Display

**Objective**: Display hierarchical directory structure from docs/

**Key Technical Decisions**:
- Scan docs/ directory recursively on plugin activation
- Cache tree structure in memory (refresh on view activation)
- Use recursive DOM rendering for tree nodes
- Track expanded/collapsed state in component

**Data Structure**:
```javascript
// Document tree node
{
  name: "docs",
  path: "/full/path/to/docs",
  type: "directory",
  isRoot: true,
  isEmpty: false,
  children: [
    {
      name: "claude-design-docs",
      path: "/full/path/to/docs/claude-design-docs",
      type: "directory",
      isEmpty: false,
      children: [...]
    },
    {
      name: "README.md",
      path: "/full/path/to/docs/README.md",
      type: "file",
      extension: ".md"
    }
  ]
}
```

**IPC Handler** (`getDocumentTree`):
```javascript
async function getDocumentTree() {
  const docsPath = path.join(context.projectPath, 'docs')
  return scanDirectory(docsPath, true)
}

async function scanDirectory(dirPath, isRoot = false) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const children = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      children.push(await scanDirectory(path.join(dirPath, entry.name)))
    } else if (entry.name.endsWith('.md')) {
      children.push({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        type: 'file',
        extension: '.md'
      })
    }
  }

  // Sort: directories first, then files, both alphabetically
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return {
    name: path.basename(dirPath),
    path: dirPath,
    type: 'directory',
    isRoot,
    isEmpty: children.length === 0,
    children
  }
}
```

**Renderer Component** (tree rendering):
```javascript
renderTreeNode(node, depth = 0) {
  const isExpanded = this.expandedNodes.has(node.path)
  const indent = depth * 16

  let html = `
    <div class="tree-node ${node.type}"
         data-path="${node.path}"
         data-type="${node.type}"
         style="padding-left: ${indent}px">
      <span class="node-toggle">${node.type === 'directory' ? (isExpanded ? '▼' : '▶') : ''}</span>
      <span class="node-icon">${node.type === 'directory' ? '📁' : '📄'}</span>
      <span class="node-name ${node.isEmpty ? 'empty' : ''}">${node.name}</span>
    </div>
  `

  if (node.type === 'directory' && isExpanded && node.children) {
    html += node.children.map(child => this.renderTreeNode(child, depth + 1)).join('')
  }

  return html
}
```

**CSS Considerations**:
```css
.tree-node.directory.empty .node-name {
  color: #888;
  font-style: italic;
}
```

**Acceptance Criteria Mapping**:
| AC | Implementation |
|----|----------------|
| docs/ as root node | `isRoot: true` in tree structure, special rendering |
| Subdirectories expandable/collapsible | `expandedNodes` Set, toggle on click |
| Hierarchy accurately represented | Recursive `scanDirectory()` with nested children |
| Empty directories distinguished | `isEmpty` flag, CSS styling |
| Auto-refresh on open | `onActivate()` triggers tree reload |

---

### Story 2: Document File Listing Within Directories

**Objective**: Display markdown files within each directory

**Key Technical Decisions**:
- Filter for `.md` extension during scan
- Files appear as leaf nodes in tree
- Alphabetical sorting within each directory
- Visual distinction via icon and CSS

**Implementation Notes**:
- File filtering already included in Story 1's `scanDirectory()`
- Additional CSS for file nodes
- File icon distinct from folder icon

**File Node Styling**:
```css
.tree-node.file .node-icon {
  color: #4a90d9;  /* Blue for markdown files */
}

.tree-node.file:hover {
  background-color: rgba(74, 144, 217, 0.1);
  cursor: pointer;
}

.tree-node.file.selected {
  background-color: rgba(74, 144, 217, 0.2);
}
```

**Acceptance Criteria Mapping**:
| AC | Implementation |
|----|----------------|
| .md files listed under parent | `type: 'file'` nodes as children in tree |
| Filename displayed (no path) | `node.name` from `path.basename()` |
| Visually distinguished | Different icon, CSS classes |
| Alphabetically sorted | `children.sort()` in `scanDirectory()` |
| Non-markdown excluded | Filter `entry.name.endsWith('.md')` |

---

### Story 4: Split Panel Layout for Document Viewer

**Objective**: Create two-panel layout for navigation and preview

**Key Technical Decisions**:
- CSS Flexbox for split layout
- Fixed proportions: 30% nav, 70% preview
- Responsive behavior on window resize
- Empty state for preview panel

**Layout HTML Structure**:
```html
<div class="document-viewer">
  <div class="doc-nav-panel">
    <div class="nav-header">
      <h3>Documents</h3>
      <button class="refresh-btn" title="Refresh">↻</button>
    </div>
    <div class="tree-container">
      <!-- DocumentTree renders here -->
    </div>
  </div>
  <div class="doc-preview-panel">
    <div class="preview-header">
      <span class="preview-path">No file selected</span>
    </div>
    <div class="preview-content">
      <div class="empty-state">
        <span class="empty-icon">📄</span>
        <p>Select a document from the tree to preview</p>
      </div>
    </div>
  </div>
</div>
```

**CSS Layout**:
```css
.document-viewer {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.doc-nav-panel {
  flex: 0 0 30%;
  min-width: 200px;
  max-width: 400px;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.nav-header {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tree-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.doc-preview-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-header {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}

.empty-state .empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}
```

**Acceptance Criteria Mapping**:
| AC | Implementation |
|----|----------------|
| Split into left/right panels | Flexbox layout with two children |
| Left ~30% width | `flex: 0 0 30%` with min/max constraints |
| Right ~70% width | `flex: 1` takes remaining space |
| Responsive on resize | Flexbox automatically adjusts |
| Empty state when no selection | Conditional rendering in `preview-content` |

---

### Story 3: Document Selection and Preview

**Objective**: Display rendered markdown when file is selected

**Key Technical Decisions**:
- Use simple custom markdown renderer (avoid heavy dependencies)
- Support: headers, paragraphs, lists, code blocks, links, emphasis
- Sanitize HTML to prevent XSS
- Scroll position resets on new selection

**IPC Handler** (`readDocument`):
```javascript
async function readDocument(filePath) {
  // Validate path is within docs/ directory (security)
  const docsPath = path.join(context.projectPath, 'docs')
  const normalizedPath = path.normalize(filePath)

  if (!normalizedPath.startsWith(docsPath)) {
    throw new Error('Access denied: File outside docs directory')
  }

  const content = await fs.readFile(normalizedPath, 'utf-8')
  const stats = await fs.stat(normalizedPath)

  return {
    content,
    filename: path.basename(normalizedPath),
    relativePath: path.relative(docsPath, normalizedPath),
    size: stats.size,
    modified: stats.mtime
  }
}
```

**Simple Markdown Renderer**:
```javascript
renderMarkdown(content) {
  // Escape HTML first
  let html = this.escapeHtml(content)

  // Headers
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>')

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g,
    '<pre><code class="language-$1">$2</code></pre>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Bold and italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>')

  // Lists
  html = html.replace(/^\s*[-*] (.*$)/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // Numbered lists
  html = html.replace(/^\s*\d+\. (.*$)/gm, '<li>$1</li>')

  // Paragraphs (remaining text blocks)
  html = html.replace(/\n\n([^<].*)/g, '\n\n<p>$1</p>')

  // Line breaks
  html = html.replace(/\n/g, '<br>')

  return html
}

escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
```

**Preview Panel CSS**:
```css
.preview-content h1 { font-size: 1.8em; margin: 0.5em 0; }
.preview-content h2 { font-size: 1.5em; margin: 0.5em 0; }
.preview-content h3 { font-size: 1.2em; margin: 0.5em 0; }

.preview-content pre {
  background: var(--bg-code);
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
}

.preview-content code {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.9em;
}

.preview-content ul, .preview-content ol {
  padding-left: 24px;
}

.preview-content a {
  color: var(--link-color);
}
```

**Selection Handling**:
```javascript
async handleFileSelect(filePath) {
  // Update selection state
  this.selectedFile = filePath
  this.updateTreeSelection()

  // Load and render content
  try {
    const doc = await window.puffin.plugins.invoke(
      'document-viewer-plugin',
      'readDocument',
      filePath
    )

    this.renderPreview(doc)
  } catch (error) {
    this.renderError(error.message)
  }
}

renderPreview(doc) {
  const header = this.container.querySelector('.preview-path')
  const content = this.container.querySelector('.preview-content')

  header.textContent = doc.relativePath
  content.innerHTML = this.renderMarkdown(doc.content)
  content.scrollTop = 0
}
```

**Acceptance Criteria Mapping**:
| AC | Implementation |
|----|----------------|
| Clicking selects and highlights | `selectedFile` state, CSS `.selected` class |
| Content in preview panel | `renderPreview()` populates `.preview-content` |
| Proper markdown formatting | Custom `renderMarkdown()` with HTML rendering |
| File path as header | `doc.relativePath` in `.preview-path` |
| Large files scroll | `overflow-y: auto` on `.preview-content` |

---

## File Changes Summary

### Files to Create

| File | Purpose |
|------|---------|
| `~/.puffin/plugins/document-viewer-plugin/puffin-plugin.json` | Plugin manifest |
| `~/.puffin/plugins/document-viewer-plugin/index.js` | Main process entry, IPC handlers |
| `~/.puffin/plugins/document-viewer-plugin/document-scanner.js` | Directory scanning logic |
| `~/.puffin/plugins/document-viewer-plugin/renderer/components/index.js` | Component exports |
| `~/.puffin/plugins/document-viewer-plugin/renderer/components/DocumentViewerComponent.js` | Main view component |
| `~/.puffin/plugins/document-viewer-plugin/renderer/styles/document-viewer.css` | Component styles |

### Files to Modify

None. This is a new plugin using Puffin's existing plugin infrastructure.

### Existing Files to Reference

| File | Reference For |
|------|---------------|
| `plugins/designer-plugin/puffin-plugin.json` | Manifest structure |
| `plugins/designer-plugin/index.js` | IPC handler patterns |
| `plugins/designer-plugin/renderer/components/DesignerView.js` | Component lifecycle |
| `src/main/plugins/plugin-context.js` | Available context methods |

---

## Risk Assessment

### High Risk

| Risk | Mitigation |
|------|------------|
| **Markdown rendering security** | Escape HTML before processing, avoid `innerHTML` with raw content |
| **Path traversal attacks** | Validate all file paths start with docs/ directory |

### Medium Risk

| Risk | Mitigation |
|------|------------|
| **Large file performance** | Consider lazy loading or virtualization for very large trees |
| **Complex markdown features** | Document limitations, consider adding marked.js if needed |
| **Deep directory nesting** | Set reasonable maximum depth (e.g., 10 levels) |

### Low Risk

| Risk | Mitigation |
|------|------------|
| **Plugin discovery timing** | Plugin manager handles this; follow existing patterns |
| **CSS conflicts** | Use namespaced class names (`.doc-viewer-*`) |

---

## Complexity Estimates

| Story | Complexity | Rationale |
|-------|------------|-----------|
| **Story 5: Plugin Registration** | Low | Boilerplate following existing patterns |
| **Story 1: Directory Tree** | Medium | Recursive scanning, expand/collapse state management |
| **Story 2: File Listing** | Low | Extension of tree logic, mainly filtering |
| **Story 4: Split Layout** | Low | Standard CSS flexbox layout |
| **Story 3: Selection & Preview** | Medium | Markdown rendering, state management, scrolling |

**Total Estimated Complexity**: Medium

---

## Implementation Checklist

### Story 5: Plugin Registration
- [ ] Create plugin directory structure
- [ ] Write `puffin-plugin.json` manifest
- [ ] Create minimal `index.js` with activate/deactivate
- [ ] Create minimal `DocumentViewerComponent.js`
- [ ] Verify plugin appears in navigation
- [ ] Test plugin loads without errors

### Story 1: Directory Tree Display
- [ ] Implement `scanDirectory()` in main process
- [ ] Register `getDocumentTree` IPC handler
- [ ] Implement tree rendering in component
- [ ] Add expand/collapse functionality
- [ ] Style root node distinctly
- [ ] Style empty directories
- [ ] Add refresh on activation

### Story 2: File Listing
- [ ] Verify .md file filtering works
- [ ] Add file-specific icons
- [ ] Verify alphabetical sorting
- [ ] Add hover states for files

### Story 4: Split Panel Layout
- [ ] Create flexbox container
- [ ] Implement nav panel (30%)
- [ ] Implement preview panel (70%)
- [ ] Add responsive constraints
- [ ] Create empty state UI

### Story 3: Selection & Preview
- [ ] Implement `readDocument` IPC handler
- [ ] Add path validation security
- [ ] Implement file selection state
- [ ] Create markdown renderer
- [ ] Wire up click handler to preview
- [ ] Test with various markdown files

---

## Testing Considerations

### Manual Testing Scenarios

1. **Empty docs/ directory** - Should show tree with root only
2. **Deeply nested directories** - Should render correctly, scrollable
3. **Large markdown files** - Should load without freezing
4. **Special characters in filenames** - Should display correctly
5. **Rapid file switching** - Should not cause race conditions
6. **Plugin switching** - State should persist correctly

### Edge Cases to Handle

- docs/ directory doesn't exist
- File deleted while viewing
- Permission denied on file read
- Malformed markdown content
- Unicode in file content
- Binary files accidentally included

---

## Notes for Implementation Team

1. **Start Simple**: Get the basic plugin registration working first before adding features

2. **Test Incrementally**: Each story should result in a testable increment

3. **Follow Existing Patterns**: The designer-plugin is the best reference for patterns

4. **Security First**: Always validate paths and escape content

5. **Performance Conscious**: Don't load all file contents on initial scan

6. **User Experience**: Provide loading states and error messages

---

*Document generated for sprint planning. Implementation should happen in appropriate feature branches.*
