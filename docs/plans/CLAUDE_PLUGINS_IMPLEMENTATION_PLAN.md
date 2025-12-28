# Claude Code Plugins Implementation Plan

## Executive Summary

This plan covers the implementation of a **Claude Code Plugin Management System** for Puffin. The system will enable users to install, manage, and assign Claude Code skill plugins (like the frontend-design skill) to specific branches for context injection.

**Key Discovery:** Puffin already has a comprehensive internal plugin system (`src/main/plugins/`) for extending Puffin's own functionality. The user stories described here are for a *different* use case: managing **Claude Code plugins/skills** that get injected into Claude's context via CLAUDE.md.

---

## Architecture Analysis

### Current State

```
Existing Puffin Plugin System (for Puffin extensions):
src/main/plugins/
├── plugin-manager.js       # Lifecycle management
├── plugin-loader.js        # Discovery & loading
├── plugin-registry.js      # Registration
├── manifest-validator.js   # Validation
└── view-registry.js        # UI contributions

This is for EXTENDING PUFFIN - NOT for Claude Code skills.
```

### Proposed Claude Code Plugins Architecture

```
.puffin/
├── config.json              # Add: plugins config section
├── plugins/                 # NEW: Claude Code plugins directory
│   ├── frontend-design/
│   │   ├── manifest.json    # Plugin metadata
│   │   └── skill.md         # Skill content (injected into CLAUDE.md)
│   └── testing-patterns/
│       ├── manifest.json
│       └── skill.md
└── ...existing files...

.claude/
├── CLAUDE.md               # Modified: includes active plugin skills
└── CLAUDE_base.md          # Modified: includes active plugin skills
```

### Relationship to Existing Systems

| Component | Existing | New/Modified |
|-----------|----------|--------------|
| Plugin Storage | N/A | `.puffin/plugins/` directory |
| Config | `.puffin/config.json` | Add `claudePlugins` section |
| Branch Config | `history.json` branches | Add `assignedPlugins` array |
| CLAUDE.md Generation | `claude-md-generator.js` | Add plugin skill injection |
| State Management | `puffin-state.js` | Add plugin CRUD methods |
| IPC Handlers | `ipc-handlers.js` | Add plugin management handlers |
| UI | Config tab in `index.html` | Add Plugins section |

---

## Implementation Order

### Recommended Sequence

```
Story 1: Plugin Directory Structure
    ↓
Story 2: Plugin Management UI
    ↓
Story 3: Add Plugin from URL/Path
    ↓
Story 4: Plugin-to-Branch Assignment
```

**Rationale:**
1. **Story 1** establishes the foundational data structures and storage
2. **Story 2** provides UI to view what's stored (depends on Story 1)
3. **Story 3** adds the ability to install new plugins (depends on Stories 1 & 2)
4. **Story 4** connects plugins to branches and CLAUDE.md (depends on all above)

---

## Story 1: Plugin Directory Structure Creation

### Technical Approach

**Scope:** Backend only (main process)

**Key Decisions:**
- Store plugins in `.puffin/plugins/` (project-local, version-controlled)
- Use `manifest.json` for metadata (similar to existing puffin-plugin.json)
- Store skill content in `skill.md` (markdown format for Claude injection)

### Manifest Schema

```json
{
  "name": "frontend-design",
  "version": "1.0.0",
  "displayName": "Frontend Design Skill",
  "description": "Distinctive, production-grade frontend interfaces",
  "author": "Anthropic",
  "source": "https://github.com/anthropics/claude-code/...",
  "skillFile": "skill.md",
  "tags": ["ui", "frontend", "design"],
  "createdAt": "2025-01-15T...",
  "enabled": true
}
```

### Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/main/puffin-state.js` | Modify | Add plugin directory initialization, CRUD methods |
| `src/main/ipc-handlers.js` | Modify | Add IPC handlers for plugin operations |
| `src/main/preload.js` | Modify | Expose plugin APIs to renderer |
| `src/main/plugins/claude-plugin-validator.js` | Create | Validate Claude plugin manifests |

### Implementation Details

**puffin-state.js additions:**
```javascript
// Constants
const CLAUDE_PLUGINS_DIR = 'plugins'

// In open() method
await this.ensureDirectory(path.join(this.puffinPath, CLAUDE_PLUGINS_DIR))

// New methods
async getClaudePlugins() { }
async addClaudePlugin(pluginData) { }
async updateClaudePlugin(pluginName, updates) { }
async deleteClaudePlugin(pluginName) { }
async getClaudePluginContent(pluginName) { }
```

### Default Plugin: frontend-design

When a project is first initialized (or when upgrading), Puffin should install the frontend-design plugin automatically:

**manifest.json:**
```json
{
  "name": "frontend-design",
  "version": "1.0.0",
  "displayName": "Frontend Design Skill",
  "description": "Create distinctive, production-grade frontend interfaces that avoid generic 'AI slop' aesthetics",
  "author": "Anthropic",
  "source": "bundled",
  "skillFile": "skill.md",
  "tags": ["ui", "frontend", "design", "css"],
  "enabled": true,
  "isDefault": true
}
```

The skill.md content should be sourced from the existing design document at `docs/claude-design-docs/CLAUDE_PLUGINS_INTEGRATION.md` (lines 209-290).

### Complexity: LOW

---

## Story 2: Plugin Management UI in Config Tab

### Technical Approach

**Scope:** Frontend (renderer) + Backend (IPC)

**Key Decisions:**
- Add "Plugins" section to existing Config tab (not a new tab)
- Use card-based layout consistent with existing UI patterns
- Toggle switches for enable/disable (consistent with other config toggles)

### UI Design

```
┌─────────────────────────────────────────────────────────────┐
│ Project Configuration                                        │
├─────────────────────────────────────────────────────────────┤
│ ... existing sections ...                                    │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Claude Code Plugins                         [+ Add Plugin]│ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ 🎨 Frontend Design Skill               [Toggle] [🗑️] │ │ │
│ │ │ Distinctive, production-grade frontend interfaces    │ │ │
│ │ │ v1.0.0 • Anthropic • Enabled                        │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ 🧪 Testing Patterns                    [Toggle] [🗑️] │ │ │
│ │ │ TDD and BDD patterns for quality code               │ │ │
│ │ │ v1.0.0 • Custom • Disabled                          │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ │                                                         │ │
│ │ [No plugins installed. Click "Add Plugin" to get started]│ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/renderer/index.html` | Modify | Add Plugins section HTML in config-view |
| `src/renderer/app.js` | Modify | Add plugin UI event handlers |
| `src/renderer/styles/app.css` | Modify | Add plugin card styles |
| `src/renderer/sam/actions.js` | Modify | Add plugin-related actions |
| `src/renderer/sam/model.js` | Modify | Add plugin state acceptors |

### Complexity: MEDIUM

---

## Story 3: Add Plugin from URL or Local Path

### Technical Approach

**Scope:** Full-stack

**Key Decisions:**
- Support GitHub URLs (raw content URLs or repo URLs)
- Support local file paths (directory or single .md file)
- Validate plugin structure before adding
- Copy content to `.puffin/plugins/` (don't symlink)

### Plugin Sources

**GitHub URL Patterns:**
```
https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design
https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skill.md
```

**Local Path Patterns:**
```
C:\Users\jjdub\plugins\my-custom-skill\
./plugins/my-skill.md
```

### Add Plugin Modal

```
┌─────────────────────────────────────────────────────────────┐
│ Add Claude Code Plugin                                   [×] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Source Type:  ○ GitHub URL  ○ Local Path                    │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ https://github.com/anthropics/claude-code/plugins/...   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                    [Browse]  │
│                                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ⓘ Plugin must contain:                                  │ │
│ │   • manifest.json with name, version, description        │ │
│ │   • skill.md with the skill content                     │ │
│ │   OR                                                     │
│ │   • A single .md file (manifest auto-generated)         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│                              [Cancel]  [Validate & Add]      │
└─────────────────────────────────────────────────────────────┘
```

### Validation Steps

1. **Parse source** (URL or path)
2. **Fetch/read content**
3. **Validate structure** (manifest.json + skill.md OR single .md)
4. **Check for duplicates** (by name)
5. **Copy to .puffin/plugins/{name}/**
6. **Return success/failure with message**

### Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/main/plugins/claude-plugin-loader.js` | Create | GitHub fetch, local file reading |
| `src/main/plugins/claude-plugin-validator.js` | Modify | Add URL/path parsing, validation |
| `src/main/ipc-handlers.js` | Modify | Add plugin:install handler |
| `src/renderer/lib/modal-manager.js` | Modify | Add AddPluginModal |
| `src/renderer/index.html` | Modify | Add modal HTML template |

### Complexity: HIGH

**Risk:** Network requests to GitHub may fail or be rate-limited. Consider:
- Retry logic with exponential backoff
- Clear error messages for network failures
- Offline mode (local paths only)

---

## Story 4: Plugin-to-Branch Assignment

### Technical Approach

**Scope:** Full-stack with CLAUDE.md integration

**Key Decisions:**
- Store assignments in branch configuration (`history.json`)
- Multi-select dropdown in branch header/settings
- Inject plugin skills into CLAUDE.md when branch is active

### Data Model Changes

**history.json branch structure:**
```json
{
  "branches": {
    "ui": {
      "id": "ui",
      "name": "UI",
      "prompts": [...],
      "codeModificationAllowed": true,
      "assignedPlugins": ["frontend-design", "accessibility"]  // NEW
    }
  }
}
```

**config.json plugin settings:**
```json
{
  "claudePlugins": {
    "globallyEnabled": true,
    "defaultAssignments": {
      "ui": ["frontend-design"],
      "backend": [],
      "specifications": []
    }
  }
}
```

### Branch Header UI

```
┌─────────────────────────────────────────────────────────────┐
│ UI Branch                                            [gear] │
├─────────────────────────────────────────────────────────────┤
│ Plugins: [Frontend Design ×] [Accessibility ×] [+ Add]     │
└─────────────────────────────────────────────────────────────┘
```

### CLAUDE.md Injection

**Modify `claude-md-generator.js` to:**
1. Get active branch's assigned plugins
2. Load each plugin's `skill.md` content
3. Inject after branch focus section:

```markdown
## Branch Focus: UI/UX
...existing content...

---

## Active Skills

### Frontend Design Skill

[Content from frontend-design/skill.md]

---
```

### Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `src/main/puffin-state.js` | Modify | Add branch plugin assignment methods |
| `src/main/claude-md-generator.js` | Modify | Add plugin skill injection |
| `src/renderer/components/prompt-editor/prompt-editor.js` | Modify | Add plugin dropdown to branch header |
| `src/renderer/sam/actions.js` | Modify | Add branch plugin assignment actions |
| `src/renderer/sam/model.js` | Modify | Add acceptors for plugin assignments |

### Complexity: MEDIUM-HIGH

**Risk:** CLAUDE.md size could grow large with many plugins. Consider:
- Limit of 3-5 plugins per branch
- Token count warning in UI
- Option to preview generated CLAUDE.md

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| GitHub API rate limiting | Medium | Medium | Use raw.githubusercontent.com, implement caching |
| Large plugin files | Low | Medium | Add file size limit (50KB), warn on large skills |
| CLAUDE.md token overflow | Medium | High | Add token counter, limit plugin assignments |
| Plugin naming conflicts | Low | Low | Validate unique names on install |

### Integration Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Conflict with existing plugin system | Low | High | Clear naming distinction (Claude plugins vs Puffin plugins) |
| Branch history migration | Low | Medium | Handle missing `assignedPlugins` gracefully |
| UI layout conflicts in Config | Low | Low | Place below existing sections |

---

## Complexity Summary

| Story | Complexity | Estimated Effort |
|-------|------------|------------------|
| Story 1: Directory Structure | LOW | Small |
| Story 2: Management UI | MEDIUM | Medium |
| Story 3: Add from URL/Path | HIGH | Large |
| Story 4: Branch Assignment | MEDIUM-HIGH | Medium-Large |

**Total Estimated Effort:** Large (recommend 2-3 implementation sessions)

---

## Implementation Checklist

### Story 1: Plugin Directory Structure
- [ ] Add CLAUDE_PLUGINS_DIR constant to puffin-state.js
- [ ] Create plugins directory in open() method
- [ ] Implement getClaudePlugins() method
- [ ] Implement addClaudePlugin() method
- [ ] Implement updateClaudePlugin() method
- [ ] Implement deleteClaudePlugin() method
- [ ] Implement getClaudePluginContent() method
- [ ] Add IPC handlers for all CRUD operations
- [ ] Expose APIs in preload.js
- [ ] Create bundled frontend-design plugin files (manifest.json + skill.md)
- [ ] Implement installDefaultPlugins() method for first-time setup
- [ ] Call installDefaultPlugins() during project initialization

### Story 2: Plugin Management UI
- [ ] Add Plugins section HTML to config-view
- [ ] Add plugin card component styles
- [ ] Implement plugin list rendering
- [ ] Implement enable/disable toggle
- [ ] Implement delete confirmation
- [ ] Add empty state message
- [ ] Add "Add Plugin" button
- [ ] Add SAM actions for plugin state

### Story 3: Add Plugin from URL/Path
- [ ] Create claude-plugin-loader.js module
- [ ] Implement GitHub URL parsing
- [ ] Implement GitHub content fetching
- [ ] Implement local path reading
- [ ] Create claude-plugin-validator.js
- [ ] Implement manifest validation
- [ ] Implement duplicate detection
- [ ] Create Add Plugin modal HTML
- [ ] Implement modal JavaScript
- [ ] Add IPC handler for plugin:install
- [ ] Add error handling and user feedback

### Story 4: Branch Assignment
- [ ] Add assignedPlugins to branch schema
- [ ] Implement getbranchPlugins() method
- [ ] Implement assignPluginToBranch() method
- [ ] Implement removePluginFromBranch() method
- [ ] Add plugin dropdown to branch header UI
- [ ] Modify claude-md-generator.js for injection
- [ ] Implement activateBranch plugin loading
- [ ] Add token count estimation
- [ ] Add preview capability

---

## Design Decisions (Confirmed)

1. **Plugin scope:** Project-local only (`.puffin/plugins/`). No global plugin directory.

2. **UI location:** Config tab - developers won't need many plugins, so a dedicated tab is unnecessary.

3. **Default plugins:** Yes - Puffin will ship with the **frontend-design** skill plugin as a default. This will be automatically installed when a new project is initialized.

4. **Version updates:** Manual re-import (out of scope for initial implementation).

5. **Plugin sharing:** Not in scope for initial implementation.
