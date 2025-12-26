# Design Document Feature - Implementation Plan

## Overview

This plan covers the implementation of a design document inclusion feature for Puffin, allowing users to select markdown files from the `docs/` directory and include them in their conversation context with Claude.

---

## Architecture Analysis

### Story Dependencies

```
Story 1: Directory Scanning
    ↓ (provides document list)
Story 2: Dropdown Selection
    ↓ (enables selection)
Story 3: Content Inclusion
```

All three stories share a common data flow and build upon each other sequentially.

### Shared Components

1. **IPC Channel** - Communication between main/renderer for file operations
2. **State Management** - Track selected document and content in SAM model
3. **UI Component** - Dropdown in prompt editor (similar to existing GUI dropdown)

### Key Design Decisions

1. **Scan `docs/` directory in project root** (not `.puffin/`)
   - Design documents are project artifacts, not Puffin state
   - Should be version-controlled with the project
   - Accessible to developers outside of Puffin

2. **File watching vs. on-demand refresh**
   - Recommend: On-demand refresh when dropdown opens (simpler, less overhead)
   - File watching adds complexity for minimal benefit

3. **Content inclusion approach**
   - Include full document content in prompt context
   - Prefix with clear header for Claude to understand the context

---

## Implementation Order

**Recommended sequence: Story 1 → Story 2 → Story 3**

This order ensures each story provides the foundation for the next:
1. Scanning provides the data
2. Dropdown provides the selection UI
3. Content inclusion completes the feature

---

## Story 1: Design Document Directory Scanning

### Complexity: **Low**

### Technical Approach

Add IPC handlers and main process methods to scan the `docs/` directory for markdown files.

### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/main/puffin-state.js` | Modify | Add `listDesignDocuments()` and `loadDesignDocument()` methods |
| `src/main/ipc-handlers.js` | Modify | Add `state:listDesignDocuments` and `state:loadDesignDocument` handlers |
| `src/main/preload.js` | Modify | Expose new IPC methods to renderer |

### Implementation Details

#### 1. PuffinState Methods (`src/main/puffin-state.js`)

```javascript
/**
 * List markdown files in the docs/ directory
 * @returns {Promise<Array<{filename: string, name: string, path: string}>>}
 */
async listDesignDocuments() {
  // Use projectPath (not puffinPath) since docs/ is in project root
  const docsDir = path.join(this.projectPath, 'docs')

  try {
    // Check if directory exists
    await fs.access(docsDir)

    const files = await fs.readdir(docsDir)
    const mdFiles = files.filter(f => f.endsWith('.md'))

    return mdFiles.map(filename => ({
      filename,
      name: filename.replace(/\.md$/i, ''),
      path: path.join(docsDir, filename)
    }))
  } catch (error) {
    // Directory doesn't exist or isn't accessible - return empty array
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

/**
 * Load content of a design document
 * @param {string} filename - The filename to load
 * @returns {Promise<string>} - The document content
 */
async loadDesignDocument(filename) {
  const docsDir = path.join(this.projectPath, 'docs')
  const filePath = path.join(docsDir, filename)

  // Security: Ensure the resolved path is within docs/
  const resolvedPath = path.resolve(filePath)
  const resolvedDocsDir = path.resolve(docsDir)
  if (!resolvedPath.startsWith(resolvedDocsDir)) {
    throw new Error('Invalid file path')
  }

  return await fs.readFile(filePath, 'utf-8')
}
```

#### 2. IPC Handlers (`src/main/ipc-handlers.js`)

```javascript
// In setupStateHandlers():

ipcMain.handle('state:listDesignDocuments', async () => {
  try {
    const documents = await puffinState.listDesignDocuments()
    return { success: true, documents }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('state:loadDesignDocument', async (event, filename) => {
  try {
    const content = await puffinState.loadDesignDocument(filename)
    return { success: true, content, filename }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
```

#### 3. Preload API (`src/main/preload.js`)

```javascript
// In state object:
listDesignDocuments: () => ipcRenderer.invoke('state:listDesignDocuments'),
loadDesignDocument: (filename) => ipcRenderer.invoke('state:loadDesignDocument', filename),
```

### Edge Cases Handled

1. **Missing `docs/` directory** - Returns empty array, no error
2. **Empty `docs/` directory** - Returns empty array
3. **Non-markdown files** - Filtered out
4. **Path traversal attempts** - Blocked by path validation

### Acceptance Criteria Verification

| Criteria | Implementation |
|----------|----------------|
| Scans docs/ on project load | Scan happens on-demand when dropdown opens (better UX) |
| Detects markdown (.md) files | Filter with `.endsWith('.md')` |
| Updates when new files added | Fresh scan each time dropdown opens |
| Handles missing docs/ gracefully | Returns empty array on ENOENT |

---

## Story 2: Design Document Dropdown Selection

### Complexity: **Medium**

### Technical Approach

Add a dropdown UI component following the existing "Include GUI" pattern in the prompt editor.

### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/index.html` | Modify | Add dropdown HTML structure |
| `src/renderer/components/prompt-editor/prompt-editor.js` | Modify | Add dropdown logic and event handlers |
| `src/renderer/styles/components.css` | Modify | Add/reuse dropdown styles |

### Implementation Details

#### 1. HTML Structure (`src/renderer/index.html`)

Add after the existing `include-gui-dropdown` div (around line 408):

```html
<div class="dropdown" id="include-doc-dropdown">
  <button id="include-doc-btn" class="btn secondary" title="Include Design Document">
    Include Doc ▾
  </button>
  <div class="dropdown-menu" id="include-doc-menu">
    <!-- Populated dynamically -->
  </div>
</div>
```

#### 2. Component Logic (`src/renderer/components/prompt-editor/prompt-editor.js`)

Add properties to constructor:
```javascript
// Design document dropdown
this.includeDocBtn = null
this.includeDocDropdown = null
this.includeDocMenu = null
this.selectedDesignDoc = null  // { filename, name, content }
```

Add to `init()`:
```javascript
this.includeDocBtn = document.getElementById('include-doc-btn')
this.includeDocDropdown = document.getElementById('include-doc-dropdown')
this.includeDocMenu = document.getElementById('include-doc-menu')
```

Add to `bindEvents()`:
```javascript
// Design document dropdown
this.includeDocBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  this.toggleDocDropdown()
})

// Close doc dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!this.includeDocDropdown.contains(e.target)) {
    this.closeDocDropdown()
  }
})
```

Add dropdown methods:
```javascript
/**
 * Toggle design document dropdown
 */
async toggleDocDropdown() {
  const isOpen = this.includeDocDropdown.querySelector('.dropdown-menu').classList.contains('open')
  if (isOpen) {
    this.closeDocDropdown()
  } else {
    await this.openDocDropdown()
  }
}

/**
 * Open design document dropdown and populate with documents
 */
async openDocDropdown() {
  const menu = this.includeDocMenu
  menu.innerHTML = '<div class="dropdown-item disabled">Loading...</div>'
  menu.classList.add('open')

  try {
    const result = await window.puffin.state.listDesignDocuments()

    if (!result.success) {
      menu.innerHTML = '<div class="dropdown-item disabled">Error loading documents</div>'
      return
    }

    const documents = result.documents || []

    if (documents.length === 0) {
      menu.innerHTML = '<div class="dropdown-item disabled">No documents in docs/</div>'
      return
    }

    let menuHtml = ''

    // Add "Clear selection" option if a document is selected
    if (this.selectedDesignDoc) {
      menuHtml += `<div class="dropdown-item" data-action="clear">
        <span class="item-icon">✕</span>
        <span class="item-label">Clear Selection</span>
      </div>
      <div class="dropdown-divider"></div>`
    }

    // Add document options
    documents.forEach(doc => {
      const isSelected = this.selectedDesignDoc?.filename === doc.filename
      const selectedClass = isSelected ? ' selected' : ''
      menuHtml += `<div class="dropdown-item${selectedClass}" data-action="select" data-filename="${doc.filename}">
        <span class="item-icon">${isSelected ? '✓' : '📄'}</span>
        <span class="item-label">${doc.name}</span>
      </div>`
    })

    menu.innerHTML = menuHtml

    // Bind click handlers
    menu.querySelectorAll('.dropdown-item:not(.disabled)').forEach(item => {
      item.addEventListener('click', (e) => this.handleDocDropdownSelect(e, item))
    })

  } catch (error) {
    console.error('Failed to load design documents:', error)
    menu.innerHTML = '<div class="dropdown-item disabled">Error loading documents</div>'
  }
}

/**
 * Handle design document dropdown selection
 */
async handleDocDropdownSelect(e, item) {
  e.stopPropagation()
  const action = item.dataset.action

  if (action === 'clear') {
    this.selectedDesignDoc = null
    this.updateDocButtonState()
    this.closeDocDropdown()
    return
  }

  if (action === 'select') {
    const filename = item.dataset.filename

    try {
      const result = await window.puffin.state.loadDesignDocument(filename)
      if (result.success) {
        this.selectedDesignDoc = {
          filename: result.filename,
          name: filename.replace(/\.md$/i, ''),
          content: result.content
        }
        this.updateDocButtonState()
      }
    } catch (error) {
      console.error('Failed to load design document:', error)
    }
  }

  this.closeDocDropdown()
}

/**
 * Update the Include Doc button to show selection state
 */
updateDocButtonState() {
  if (this.selectedDesignDoc) {
    this.includeDocBtn.textContent = `📄 ${this.selectedDesignDoc.name}`
    this.includeDocBtn.classList.add('active')
    this.includeDocBtn.title = `Selected: ${this.selectedDesignDoc.filename}\nClick to change or clear`
  } else {
    this.includeDocBtn.textContent = 'Include Doc ▾'
    this.includeDocBtn.classList.remove('active')
    this.includeDocBtn.title = 'Include Design Document'
  }
}

/**
 * Close design document dropdown
 */
closeDocDropdown() {
  this.includeDocMenu.classList.remove('open')
}
```

#### 3. CSS Styles (`src/renderer/styles/components.css`)

The existing dropdown styles should apply. Add button active state if not present:

```css
/* Active state for dropdown button when item selected */
.dropdown .btn.active {
  background: var(--accent-primary);
  color: white;
  border-color: var(--accent-primary);
}

.dropdown .btn.active:hover {
  background: var(--accent-hover);
}
```

### Edge Cases Handled

1. **No documents available** - Shows "No documents in docs/" message
2. **Loading state** - Shows "Loading..." while fetching
3. **Error state** - Shows error message if fetch fails
4. **Selected state visibility** - Button shows selected document name
5. **Clear selection** - User can remove selection

### Acceptance Criteria Verification

| Criteria | Implementation |
|----------|----------------|
| Displays all markdown files | Populated from `listDesignDocuments()` |
| Shows readable format (no .md) | `filename.replace(/\.md$/i, '')` |
| Positioned consistently | Same structure as Include GUI dropdown |
| Updates dynamically | Fresh fetch each time dropdown opens |

---

## Story 3: Design Document Content Inclusion

### Complexity: **Medium**

### Technical Approach

Include the selected document content in the prompt context sent to Claude, with clear formatting so Claude understands it's reference material.

### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/components/prompt-editor/prompt-editor.js` | Modify | Pass design doc content with prompt submission |
| `src/main/claude-service.js` | Modify | Include design doc in `buildPrompt()` |

### Implementation Details

#### 1. Prompt Submission (`src/renderer/components/prompt-editor/prompt-editor.js`)

Modify the `submit()` method to include design document:

```javascript
async submit() {
  const content = this.textarea.value.trim()
  if (!content) return

  // Build prompt data including design document if selected
  const promptData = {
    content,
    branchId: this.getCurrentBranchId(),
    model: this.modelSelect?.value || this.defaultModel,
    deriveUserStories: this.deriveUserStories,
    // Existing GUI inclusion
    guiDescription: this.selectedGuiDefinition?.description || null,
    // New design document inclusion
    designDocument: this.selectedDesignDoc ? {
      filename: this.selectedDesignDoc.filename,
      name: this.selectedDesignDoc.name,
      content: this.selectedDesignDoc.content
    } : null
  }

  // ... rest of submit logic
  this.intents.submitPrompt(promptData)
}
```

#### 2. Prompt Building (`src/main/claude-service.js`)

Modify `buildPrompt()` to include design document content:

```javascript
buildPrompt(data) {
  let prompt = data.prompt
  const isResumingSession = !!data.sessionId

  // Branch context
  if (data.branchId) {
    const branchContext = this.getBranchContext(data.branchId)
    if (branchContext) {
      prompt = branchContext + '\n\n' + prompt
    }
  }

  // Design document - include for all conversations (it's specific reference material)
  if (data.designDocument && data.designDocument.content) {
    const docSection = `## Reference Document: ${data.designDocument.name}

The following design document has been included for reference:

---
${data.designDocument.content}
---

`
    prompt = docSection + prompt
  }

  // GUI description if provided
  if (data.guiDescription) {
    prompt += '\n\n## UI Layout Reference\n' + data.guiDescription
  }

  // ... rest of existing logic
  return prompt
}
```

#### 3. Visual Indicator in Prompt Area

Add indicator showing which document is included (in `render()` method):

```javascript
// Update render to show included document indicator
render(promptState, historyState, storyGenerations) {
  // ... existing render logic

  // Show indicator of included document
  const docIndicator = document.getElementById('included-doc-indicator')
  if (docIndicator) {
    if (this.selectedDesignDoc) {
      docIndicator.textContent = `📄 ${this.selectedDesignDoc.name} included`
      docIndicator.classList.remove('hidden')
    } else {
      docIndicator.classList.add('hidden')
    }
  }
}
```

Add HTML for indicator (in `index.html`, near prompt options):

```html
<span id="included-doc-indicator" class="included-doc-indicator hidden"></span>
```

Add CSS for indicator:

```css
.included-doc-indicator {
  font-size: 0.75rem;
  color: var(--accent-primary);
  padding: 0.25rem 0.5rem;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
}
```

### Edge Cases Handled

1. **Large documents** - No size limit imposed (Claude handles context limits)
2. **Document cleared mid-session** - Only affects next prompt
3. **Session resume** - Document is included fresh in new prompts

### Acceptance Criteria Verification

| Criteria | Implementation |
|----------|----------------|
| Content loaded on selection | Loaded in `handleDocDropdownSelect()` |
| Content included in context | Added in `buildPrompt()` with clear header |
| User can see which doc included | Button shows name + indicator element |
| User can remove document | "Clear Selection" option in dropdown |

---

## Risk Assessment

### Low Risk
- **IPC implementation** - Following established patterns from GUI definitions
- **CSS styling** - Reusing existing dropdown styles

### Medium Risk
- **Context size** - Large documents may impact token limits
  - *Mitigation*: Document size is visible; users can choose what to include
- **Prompt structure** - Document content must be clearly delineated
  - *Mitigation*: Use markdown separators and clear headers

### Low Concern (Not Risks)
- **File watching** - Not implementing; on-demand refresh is sufficient
- **Multiple document selection** - Future enhancement if needed; single selection for MVP

---

## Testing Checklist

### Story 1: Directory Scanning
- [ ] Empty `docs/` directory returns empty array
- [ ] Missing `docs/` directory returns empty array (no error)
- [ ] Mixed file types only returns `.md` files
- [ ] Path traversal attempts are blocked
- [ ] Files with spaces in names work correctly

### Story 2: Dropdown Selection
- [ ] Dropdown opens and shows loading state
- [ ] Document list populates correctly
- [ ] Selecting a document loads content
- [ ] Selected document shows in button
- [ ] Clear selection works
- [ ] Dropdown closes when clicking outside

### Story 3: Content Inclusion
- [ ] Document content appears in prompt to Claude
- [ ] Document header is clear and readable
- [ ] Clearing document removes from next prompt
- [ ] Indicator shows included document
- [ ] Works with existing GUI inclusion

---

## Summary

| Story | Complexity | Key Files | Estimated LOC |
|-------|------------|-----------|---------------|
| Story 1: Directory Scanning | Low | puffin-state.js, ipc-handlers.js, preload.js | ~50 |
| Story 2: Dropdown Selection | Medium | prompt-editor.js, index.html, components.css | ~150 |
| Story 3: Content Inclusion | Medium | prompt-editor.js, claude-service.js | ~50 |

**Total estimated new code: ~250 lines**

The implementation follows established Puffin patterns for IPC, UI components, and state management. The feature builds naturally on the existing "Include GUI" functionality, reducing implementation risk.
