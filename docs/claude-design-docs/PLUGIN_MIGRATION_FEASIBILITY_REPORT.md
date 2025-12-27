# Plugin Migration Feasibility Report

## Executive Summary

This report evaluates each Puffin feature for potential migration to the plugin architecture. Features are scored on **Relevance** (how well-suited for plugin), **Difficulty** (migration complexity), and key challenges are identified.

---

## Plugin Architecture Capabilities (Reference)

Before evaluating features, here's what the plugin system supports:

| Capability | Status |
|------------|--------|
| SAM Actions/Acceptors/Reactors | ✅ Supported |
| IPC Handlers | ✅ Supported |
| UI Views (sidebar, nav, panel, toolbar, statusbar, editor) | ✅ Supported |
| Plugin-scoped Storage | ✅ Supported |
| Service Injection (e.g., HistoryService) | ✅ Supported |
| Plugin-to-Plugin Communication | ✅ Supported |
| Component Lifecycle Hooks | ✅ Supported |
| CSS Style Injection | ✅ Supported |
| Core State Modification | ❌ Not Supported |
| Direct Filesystem Access | ❌ Limited to plugin directory |
| Custom Modal Types | ❌ Not yet supported |
| Custom View Locations | ❌ Fixed locations only |

---

## Feature Evaluation Matrix

| Feature | Relevance | Difficulty | Recommendation |
|---------|-----------|------------|----------------|
| Git Operations | ⭐⭐⭐⭐⭐ | 🔶 Medium | **Strong Candidate** |
| GUI Designer | ⭐⭐⭐⭐⭐ | 🔶 Medium | **Strong Candidate** |
| Developer Profile | ⭐⭐⭐⭐⭐ | 🟢 Low | **Excellent Candidate** |
| Stats/Analytics | ⭐⭐⭐⭐⭐ | 🟢 Low | **Already a Plugin** |
| Architecture Docs | ⭐⭐⭐⭐ | 🟢 Low | **Good Candidate** |
| Design Documents | ⭐⭐⭐⭐ | 🟢 Low | **Good Candidate** |
| Handoff System | ⭐⭐⭐ | 🔶 Medium | **Possible** |
| User Stories | ⭐⭐ | 🔴 High | **Challenging** |
| Sprint Management | ⭐⭐ | 🔴 High | **Challenging** |
| Conversation/History | ⭐ | 🔴 Very High | **Core - Keep** |
| Claude CLI Integration | ⭐ | 🔴 Very High | **Core - Keep** |
| Project Configuration | ⭐ | 🔴 Very High | **Core - Keep** |

---

## Detailed Feature Analysis

### 1. Git Operations

**Relevance: ⭐⭐⭐⭐⭐ (Excellent)**

| Factor | Assessment |
|--------|------------|
| Coupling | Highly decoupled - no model state, all via IPC |
| Self-contained | Yes - independent service with own UI panel |
| Optional | Yes - Puffin works without Git |
| User benefit | Users who don't use Git don't need this loaded |

**Difficulty: 🔶 Medium**

| Aspect | Effort |
|--------|--------|
| Main process service | Move `git-service.js` to plugin |
| IPC handlers | Register 20+ handlers via plugin context |
| UI Component | Port `git-panel.js` to plugin view |
| Storage | Use `.puffin/git-operations.json` or plugin storage |

**Key Challenges:**
1. **IPC Handler Volume**: 20+ IPC handlers need registration
2. **Settings Integration**: Git settings currently in project config
3. **Branch Sync**: Puffin branches should sync with Git branches
4. **View Location**: Needs sidebar or dedicated tab location

**Migration Path:**
```
1. Extract git-service.js → plugin main entry
2. Register IPC handlers via context.registerIpcHandler()
3. Port git-panel.js → plugin renderer component
4. Move git-operations.json → plugin storage
5. Add settings contribution to project config
```

---

### 2. GUI Designer

**Relevance: ⭐⭐⭐⭐⭐ (Excellent)**

| Factor | Assessment |
|--------|------------|
| Coupling | Completely isolated - own state (`guiElements`) |
| Self-contained | Yes - canvas, palette, property panel all internal |
| Optional | Yes - many users don't use visual design |
| User benefit | Only loaded when needed |

**Difficulty: 🔶 Medium**

| Aspect | Effort |
|--------|--------|
| State migration | Move `guiElements` to plugin-scoped storage |
| UI Component | Large component, but self-contained |
| IPC handlers | 8 handlers for save/load/export |
| Canvas logic | Already isolated, just needs porting |

**Key Challenges:**
1. **State Ownership**: Currently in core SAM model - needs extraction
2. **Export to Prompt**: Must integrate with prompt composition
3. **Large UI Component**: ~1500 lines of canvas/interaction code
4. **Modal Dialogs**: Save/Load/Export modals need modal system support

**Migration Path:**
```
1. Create plugin with sidebar + editor view
2. Move guiElements state to plugin storage
3. Register export action for prompt integration
4. Port canvas rendering and drag-drop logic
5. Implement save/load via plugin IPC handlers
```

---

### 3. Developer Profile & GitHub Integration

**Relevance: ⭐⭐⭐⭐⭐ (Excellent)**

| Factor | Assessment |
|--------|------------|
| Coupling | Completely decoupled - global storage |
| Self-contained | Yes - own service, storage, UI |
| Optional | Yes - works without profile |
| User benefit | GitHub users get full integration, others skip |

**Difficulty: 🟢 Low**

| Aspect | Effort |
|--------|--------|
| Service | `developer-profile.js` is already isolated |
| Storage | Already uses `~/.config/puffin/` (global) |
| IPC handlers | 15 handlers, all self-contained |
| OAuth flow | Self-contained device flow |

**Key Challenges:**
1. **Global vs Plugin Storage**: Profile is global, not per-project
2. **OAuth Credentials**: Client ID management for GitHub
3. **Profile Sync**: Syncing preferences to project config
4. **Modal UI**: Profile view/edit modals

**Migration Path:**
```
1. Extract developer-profile.js → plugin main
2. Keep global storage location (~/.config/puffin/)
3. Register profile IPC handlers
4. Port profile UI to plugin sidebar view
5. Add preference sync to project config
```

---

### 4. Architecture Document Management

**Relevance: ⭐⭐⭐⭐ (Good)**

| Factor | Assessment |
|--------|------------|
| Coupling | Low - mostly document storage |
| Self-contained | Mostly - but included in prompts |
| Optional | Yes - not all projects need it |
| User benefit | Cleaner core for simple projects |

**Difficulty: 🟢 Low**

| Aspect | Effort |
|--------|--------|
| UI Component | Simple textarea with save |
| Storage | Already in `.puffin/architecture.md` |
| IPC handlers | 1-2 handlers |
| Integration | Needs hook into prompt context |

**Key Challenges:**
1. **Prompt Integration**: Architecture doc auto-included in prompts
2. **Branch Context**: Included specifically for `architecture` branch
3. **Word Count Stats**: Minor feature to port

**Migration Path:**
```
1. Create plugin with editor view
2. Use existing .puffin/architecture.md location
3. Register reactor to inject into prompt context
4. Port simple UI component
```

---

### 5. Design Documents Scanner

**Relevance: ⭐⭐⭐⭐ (Good)**

| Factor | Assessment |
|--------|------------|
| Coupling | Low - document discovery |
| Self-contained | Yes - scan + dropdown |
| Optional | Yes - not all projects have docs/ |
| User benefit | Only needed when docs exist |

**Difficulty: 🟢 Low**

| Aspect | Effort |
|--------|--------|
| Scanner | Simple directory scan |
| UI Component | Dropdown selector |
| Integration | Include in prompt context |
| Storage | Read-only from `docs/` |

**Key Challenges:**
1. **Filesystem Access**: Plugin needs access to project `docs/` directory
2. **Prompt Integration**: Selected doc included in prompt context
3. **File Watching**: Detect new documents added

**Migration Path:**
```
1. Create plugin with toolbar/nav view for dropdown
2. Use IPC to scan docs/ directory
3. Register action to include document in prompt
4. Add document selection state to plugin storage
```

---

### 6. Handoff System

**Relevance: ⭐⭐⭐ (Moderate)**

| Factor | Assessment |
|--------|------------|
| Coupling | Moderate - uses history, branches |
| Self-contained | Partially - context travels with prompts |
| Optional | Yes - not all workflows need handoffs |
| User benefit | Simplifies core for basic use |

**Difficulty: 🔶 Medium**

| Aspect | Effort |
|--------|--------|
| State | Currently in localStorage + branch context |
| UI Components | Button, review modal, summary display |
| History integration | Needs access to thread context |
| Branch creation | May need to create branches |

**Key Challenges:**
1. **History Dependency**: Needs HistoryService for thread context
2. **Branch Operations**: May trigger branch creation
3. **Modal System**: Requires handoff-review modal
4. **localStorage Migration**: Currently uses browser localStorage
5. **Prompt Injection**: Handoff context injected into next prompt

**Migration Path:**
```
1. Create plugin with sidebar view + modal
2. Use HistoryService for thread access
3. Register action for handoff context injection
4. Move localStorage to plugin storage
5. Implement review modal (requires modal system extension)
```

---

### 7. User Story Management

**Relevance: ⭐⭐ (Limited)**

| Factor | Assessment |
|--------|------------|
| Coupling | Moderate - linked to sprints, generations |
| Self-contained | No - tightly integrated with sprint workflow |
| Optional | No - central to Puffin's value proposition |
| User benefit | Limited - core feature |

**Difficulty: 🔴 High**

| Aspect | Effort |
|--------|--------|
| State | `userStories`, `storyDerivation`, `storyGenerations` |
| Dependencies | Sprint system, story derivation, Claude integration |
| UI Components | Backlog, review modal, filters, search |
| Persistence | Multiple JSON files in `.puffin/` |

**Key Challenges:**
1. **Sprint Coupling**: Stories selected for sprints, status synced back
2. **Story Derivation**: Claude extracts stories from prompts
3. **Generation Tracking**: Links stories to implementation journeys
4. **Multi-file Persistence**: Stories, generations, journeys
5. **Review Modal**: Complex multi-step review workflow

**Migration Path (if pursued):**
```
1. Would require exposing sprint system as service
2. Story derivation needs Claude service access
3. Complex state synchronization between plugin and core
4. Not recommended without significant architecture changes
```

---

### 8. Sprint Management

**Relevance: ⭐⭐ (Limited)**

| Factor | Assessment |
|--------|------------|
| Coupling | High - stories, history, Claude, branches |
| Self-contained | No - orchestrates multiple systems |
| Optional | No - core workflow feature |
| User benefit | Limited - would fragment experience |

**Difficulty: 🔴 High**

| Aspect | Effort |
|--------|--------|
| State | `activeSprint`, `activeImplementationStory`, `stuckDetection` |
| Dependencies | Stories, branches, Claude, auto-continue |
| UI Components | Progress panel, story cards, criteria checklists |
| Control flow | Complex state machine |

**Key Challenges:**
1. **Cross-cutting**: Touches stories, branches, Claude, history
2. **Auto-continue Logic**: Timer-based automation
3. **Stuck Detection**: Hashing response outputs
4. **Branch Creation**: Creates implementation branches
5. **State Machine**: planning → planned → implementing states

**Migration Path (if pursued):**
```
Not recommended - too tightly coupled to core
Would require exposing most of Puffin as services
```

---

### 9. Conversation & History Management

**Relevance: ⭐ (Core Feature)**

| Factor | Assessment |
|--------|------------|
| Coupling | Fundamental - everything depends on it |
| Self-contained | No - foundation for all features |
| Optional | No - Puffin's core purpose |
| User benefit | None - would break application |

**Difficulty: 🔴 Very High**

**Recommendation:** Keep as core. This IS Puffin.

---

### 10. Claude CLI Integration

**Relevance: ⭐ (Core Feature)**

| Factor | Assessment |
|--------|------------|
| Coupling | Fundamental - the execution engine |
| Self-contained | No - every feature uses Claude |
| Optional | No - Puffin's core purpose |
| User benefit | None - would break application |

**Difficulty: 🔴 Very High**

**Recommendation:** Keep as core. This IS the execution layer.

---

### 11. Project Configuration

**Relevance: ⭐ (Core Feature)**

| Factor | Assessment |
|--------|------------|
| Coupling | High - affects all prompts |
| Self-contained | No - project-wide settings |
| Optional | No - defines project context |
| User benefit | None - required for operation |

**Difficulty: 🔴 Very High**

**Recommendation:** Keep as core. Provides essential context.

---

## Recommended Migration Priority

### Phase 1: Quick Wins (Low Effort, High Value)

| Plugin | Effort | Value | Notes |
|--------|--------|-------|-------|
| **Developer Profile** | 1-2 days | High | Already isolated, global storage |
| **Architecture Docs** | 1 day | Medium | Simple editor + prompt injection |
| **Design Documents** | 1 day | Medium | Scanner + dropdown |

### Phase 2: Medium Effort

| Plugin | Effort | Value | Notes |
|--------|--------|-------|-------|
| **Git Operations** | 3-5 days | High | Many IPC handlers, but self-contained |
| **GUI Designer** | 3-5 days | High | Large component, but isolated |

### Phase 3: Requires Architecture Changes

| Plugin | Effort | Value | Notes |
|--------|--------|-------|-------|
| **Handoff System** | 5-7 days | Medium | Needs modal system + history access |
| **User Stories** | 10+ days | Low | Too coupled, not recommended |
| **Sprints** | 10+ days | Low | Too coupled, not recommended |

---

## Plugin Architecture Gaps

To fully support the recommended migrations, these plugin system enhancements may be needed:

| Gap | Affected Features | Enhancement Needed |
|-----|-------------------|-------------------|
| Custom modals | Handoff, GUI Designer | Modal contribution in manifest |
| Project file access | Design Docs, Architecture | Service for `.puffin/` and `docs/` access |
| Prompt context injection | Architecture, Design Docs, Handoff | Hook for adding prompt context |
| Settings contributions | Git, Developer Profile | Plugin settings in project config |
| Global storage | Developer Profile | Storage outside project scope |

---

## Conclusion

**Strong Plugin Candidates (Recommend Migration):**
1. **Developer Profile & GitHub** - Completely isolated, global scope
2. **Git Operations** - Highly decoupled, optional feature
3. **GUI Designer** - Self-contained, optional feature
4. **Architecture Docs** - Simple, low coupling
5. **Design Documents** - Simple scanner, low coupling

**Keep as Core:**
1. **Conversation/History** - Foundational
2. **Claude CLI Integration** - Foundational
3. **Project Configuration** - Essential context
4. **User Stories** - Too coupled (reconsider if sprint system refactored)
5. **Sprint Management** - Too coupled, orchestration role

**Estimated Total Migration Effort:**
- Phase 1 (Quick Wins): ~4 days
- Phase 2 (Medium): ~10 days
- Architecture Enhancements: ~5 days
- **Total: ~3 weeks for recommended migrations**
