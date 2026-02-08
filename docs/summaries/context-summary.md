# Context Plugin (claude-config-plugin) — Technical Summary

This document describes how Puffin's Context Plugin manages CLAUDE.md configuration files — the primary mechanism for providing project-specific instructions and context to Claude Code CLI.

## 1. Overview

The Context Plugin (internally `claude-config-plugin`, display name "Claude Context") manages a set of `CLAUDE_{branch}.md` files in the project's `.claude/` directory. Each file provides branch-specific context, instructions, and constraints that are injected into Claude Code CLI conversations. The plugin handles reading, writing, section management, branch focus resolution, file watching, and AI-assisted content generation.

**Key Capabilities:**
- **Multi-file context management**: 11 default branch contexts (specifications, architecture, ui, backend, fullstack, deployment, bug-fixes, code-reviews, improvements, plugin-development, tmp) plus custom contexts
- **Branch focus system**: Each branch has a "focus" — role-specific instructions prepended to every prompt sent to Claude on that branch
- **Section-level editing**: Parse, list, add, update, and remove individual markdown sections within context files
- **Natural language updates**: Users can describe changes in plain English; the plugin interprets intent and generates diffs for review
- **AI-assisted generation**: Uses Claude (via `sendPrompt`) to generate or rewrite entire context files from natural language descriptions
- **File watching**: Real-time change detection with debounced notifications when context files are modified externally
- **CLAUDE.md assembly**: Works with `ClaudeMdGenerator` to combine base context + branch context into the active `CLAUDE.md` file that Claude Code reads

**File count**: 10 source files (1 manifest, 1 entry point, 3 service modules, 2 renderer entries, 1 renderer component, 1 CSS stylesheet). No test files.

## 2. Plugin Manifest and Configuration

The plugin is defined in `plugins/claude-config-plugin/puffin-plugin.json`:

| Option | Value | Description |
|--------|-------|-------------|
| Name | `claude-config-plugin` | Internal plugin identifier |
| Display Name | `Claude Context` | Shown in nav and UI |
| Activation | `onStartup` | Loads immediately when Puffin starts |
| Nav icon | `📄` | Navigation icon |
| Nav order | `60` | Position in left navigation |
| Renderer component | `ClaudeConfigView` | Main UI component (class-based) |
| Stylesheet | `renderer/styles/claude-config-view.css` | 1284-line CSS file |

### Registered Extension Points

- **9 IPC handlers**: `getConfig`, `getConfigWithContext`, `updateConfig`, `getMetadata`, `listContextFiles`, `selectContext`, `listSections`, `getSection`, `updateSection`, `proposeChange`, `applyProposedChange`, `getBranchFocus` (12 total registered in code — the manifest lists 9, but `index.js` registers 12)
- **10 actions**: `getConfig`, `getConfigWithContext`, `updateConfig`, `getMetadata`, `listContextFiles`, `selectContext`, `listSections`, `proposeChange`, `applyProposedChange`, `getBranchFocus`
- **3 commands**: `viewConfig`, `editConfig`, `proposeChange`

### Hard-Coded Configuration

The plugin has no user-configurable settings panel. All values are hard-coded:

| Setting | Value | Location |
|---------|-------|----------|
| Read cache max age | 5000ms | `claude-config.js` `readConfig()` |
| File watcher debounce | 100ms | `claude-config.js` `watchConfig()` |
| Branch memory max chars | 4000 | `claude-md-generator.js` |
| Branch memory sections | Conventions, Architectural Decisions, Bug Patterns | `claude-md-generator.js` |
| AI generation model | `sonnet` | `ClaudeConfigView.js` `sendPrompt()` |
| AI generation timeout | 90000ms | `ClaudeConfigView.js` `sendPrompt()` |
| AI generation max turns | 5 | `ClaudeConfigView.js` `sendPrompt()` |

## 3. End-to-End Lifecycle

### 3.1 Startup and Initialization

```
1. PUFFIN STARTS
   └── Plugin system loads claude-config-plugin (onStartup activation)

2. ACTIVATE
   ├── Store context (projectPath, logger, storage, IPC registration, events)
   ├── Create ClaudeConfig service instance with project path
   ├── Register 12 IPC handlers
   ├── Register 10 actions
   └── Set up file watcher on selected context file (debounced 100ms)

3. CLAUDE.MD GENERATION (in ipc-handlers.js, state:initialize)
   ├── ClaudeMdGenerator.initialize(projectPath) — creates .claude/ directory
   ├── ClaudeMdGenerator.generateBase(state) — writes CLAUDE_base.md from config
   ├── ClaudeMdGenerator.generateBranch() — writes CLAUDE_{branch}.md for each of 9 branches
   │   └── Appends branch memory (Conventions, Architectural Decisions, Bug Patterns)
   │   └── Appends skill/agent content if assigned
   └── ClaudeMdGenerator.activateBranch(activeBranch) — combines base + branch → CLAUDE.md
```

### 3.2 User Opens Context View

```
1. User clicks "Context" (📄) in left nav
2. Plugin system instantiates ClaudeConfigView in the view container
3. ClaudeConfigView.init():
   ├── Renders initial loading state
   └── loadConfig():
       ├── IPC: getConfigWithContext → reads selected context file + lists all context files
       ├── IPC: listSections → parses markdown headings into section list
       ├── IPC: getBranchFocus → resolves branch focus (file → default → fallback)
       └── Renders full UI: context selector, branch focus card, sections sidebar, content editor
```

### 3.3 User Switches Branch Context

```
1. User selects different branch from dropdown (e.g., "UI" → "Backend")
2. ClaudeConfigView.selectContext(contextName):
   ├── IPC: selectContext → sets _selectedContext, reads that file
   ├── IPC: listSections → re-parses for new file
   └── Re-renders with new content

NOTE: selectContext() does NOT reload branch focus — unlike loadConfig(),
it skips the getBranchFocus IPC call. The Branch Focus card retains
stale data from the previous branch until the user clicks Refresh
(which triggers loadConfig() and reloads branch focus).
```

### 3.4 User Edits and Saves Content

```
1. User edits content in the inline textarea
2. User clicks "Save" (or Ctrl+S)
3. ClaudeConfigView.saveInlineContent():
   ├── IPC: applyProposedChange(content) → writes to CLAUDE_{branch}.md
   ├── syncToActiveCLAUDEmd():
   │   └── IPC: state:activateBranch(selectedContext)
   │       └── ClaudeMdGenerator.activateBranch() → re-combines base + branch → CLAUDE.md
   └── Reload config and sections
```

### 3.5 Branch Focus Injection into Prompts

```
1. User sends a prompt via Puffin UI
2. ClaudeService.submit(data):
   ├── getBranchContext(branchId):
   │   ├── Try: plugin action claude-config:getBranchFocus
   │   │   └── ClaudeConfig.getBranchFocus(branchId):
   │   │       ├── Read CLAUDE_{branch}.md
   │   │       ├── Extract "## Branch Focus" section via regex
   │   │       ├── If found → return { focus, source: 'file' }
   │   │       ├── If empty/missing → getDefaultBranchFocus(branchId) → { source: 'default' }
   │   │       └── If no default → getCustomBranchFallback(branchId) → { source: 'fallback' }
   │   └── Fallback: built-in BRANCH_FOCUS_DEFAULTS (if plugin unavailable)
   └── Prepend branch focus to prompt text before sending to CLI
```

### 3.6 Real-Time Context Updates (Mid-Conversation)

```
1. User edits context file while a CLI session is active
2. Plugin emits 'branch-focus-updated' event via context.emit()
3. ClaudeService receives event via plugin registry subscription:
   ├── Stores as _pendingContextUpdate
   └── On next prompt submission:
       ├── Fetches updated branch context
       ├── Wraps in <context-update> XML tags
       └── Prepends to prompt: "Branch focus instructions have been updated..."
```

### 3.7 Deactivation

```
1. Plugin deactivate() called:
   ├── Stop file watcher (if active)
   └── Clear config and context references
```

## 4. Context Gathering, Storage, and Delivery

### 4.1 Storage Structure

All context is stored as markdown files in the project's `.claude/` directory:

```
.claude/
├── CLAUDE.md                    ← Active file (auto-generated, read by Claude Code CLI)
├── CLAUDE_base.md               ← Shared project context (auto-generated from config)
├── CLAUDE_specifications.md     ← Branch: Specifications (no-code planning)
├── CLAUDE_architecture.md       ← Branch: Architecture
├── CLAUDE_ui.md                 ← Branch: UI/UX
├── CLAUDE_backend.md            ← Branch: Backend
├── CLAUDE_fullstack.md          ← Branch: Full Stack
├── CLAUDE_deployment.md         ← Branch: Deployment
├── CLAUDE_bug-fixes.md          ← Branch: Bug Fixes
├── CLAUDE_code-reviews.md       ← Branch: Code Reviews
├── CLAUDE_improvements.md       ← Branch: Improvements
├── CLAUDE_plugin-development.md ← Branch: Plugin Development
├── CLAUDE_tmp.md                ← Branch: Temporary/Scratch
└── CLAUDE_{custom}.md           ← Any custom context files
```

### 4.2 CLAUDE.md Assembly

The active `CLAUDE.md` file is a concatenation of two parts:

```
CLAUDE.md = CLAUDE_base.md + CLAUDE_{activeBranch}.md
```

**CLAUDE_base.md** is auto-generated from Puffin state (`ClaudeMdGenerator.generateBase()`) and includes:
- Project Context heading
- Project Overview (name, description)
- File Access Restrictions (always included)
- Assumptions (from config)
- Coding Preferences (style, testing, naming, etc.)
- Coding Standards (user-customizable content)

**CLAUDE_{branch}.md** contains:
- Branch Focus section (role instructions, constraints, focus areas)
- Branch-specific content (e.g., IPC patterns for fullstack, review checklist for code-reviews)
- Branch memory (auto-extracted Conventions, Architectural Decisions, Bug Patterns from `.puffin/memory/branches/{branch}.md`)
- Assigned skill/agent content (if any)

### 4.3 Branch Focus Resolution Order

When resolving the branch focus for a given branch, the system follows this fallback chain:

```
1. FILE   → Read CLAUDE_{branch}.md, extract "## Branch Focus" section
2. FILE   → If no section, check if file has any non-template custom content
3. DEFAULT → BRANCH_FOCUS_DEFAULTS[branchId] (11 built-in defaults in branch-defaults.js)
4. FALLBACK → getCustomBranchFallback() generates generic focus text
             (with code restrictions if codeModificationAllowed=false)
```

### 4.4 Delivery to Claude Code CLI

Context reaches Claude Code CLI through two channels:

**Channel 1: CLAUDE.md file (passive)**
Claude Code CLI natively reads `.claude/CLAUDE.md` at session start. Puffin keeps this file current by regenerating it when:
- A branch is activated (`state:activateBranch`)
- Config is updated (`state:updateConfig`)
- User stories change (CRUD operations)
- UI guidelines change
- Branch skill/agent assignments change

**Channel 2: Branch focus prepend (active)**
`ClaudeService.submit()` actively prepends the branch focus text to every prompt sent via the interactive CLI session. This ensures Claude receives the focus instructions even if the CLAUDE.md file hasn't been re-read.

## 5. Integration with Puffin Components

### 5.1 ClaudeMdGenerator (src/main/claude-md-generator.js)

The `ClaudeMdGenerator` class handles the assembly and file writing of all CLAUDE.md files. It is instantiated in `ipc-handlers.js` and called whenever state changes affect context:

| Trigger | Generator Method | What Changes |
|---------|-----------------|--------------|
| App initialize | `generateAll()` | All files regenerated |
| Config update | `updateBase()` | CLAUDE_base.md + reactivate branch |
| User story CRUD | `updateBase()` | CLAUDE_base.md + reactivate branch |
| Branch activate | `activateBranch()` | CLAUDE.md = base + branch |
| UI guidelines change | `updateBranch('ui', ...)` | CLAUDE_ui.md |
| Branch skill assign | `updateBranch(id, ...)` | CLAUDE_{branch}.md |
| Branch agent assign | `updateBranch(id, ...)` | CLAUDE_{branch}.md |

### 5.2 ClaudeService (src/main/claude-service.js)

The Claude service subscribes to the plugin's `branch-focus-updated` event via the plugin registry. It uses the plugin's `getBranchFocus` action to resolve context for each prompt. Integration points:

- `setPluginManager()` — subscribes to `branch-focus-updated` events
- `getBranchContext()` — calls `claude-config:getBranchFocus` action
- `submit()` — prepends branch focus to user prompts
- `handleBranchFocusUpdate()` — queues updates for mid-conversation injection

### 5.3 Memory Plugin

The `ClaudeMdGenerator` optionally imports `branch-template.js` from the memory plugin to extract branch memory content. Three sections are prioritized for inclusion:
1. Conventions
2. Architectural Decisions
3. Bug Patterns

Content is capped at 4000 characters total, with priority-ordered truncation.

### 5.4 Preload Bridge (src/main/preload.js)

The plugin's IPC handlers are accessible in the renderer via two paths:

**Plugin invocation path** (used by ClaudeConfigView):
```javascript
window.puffin.plugins.invoke('claude-config-plugin', 'handlerName', params)
```

**Direct preload bridge** (shorthand for common operations):
```javascript
window.puffin.plugins.claudeConfig.getConfig(options)
window.puffin.plugins.claudeConfig.getConfigWithContext(options)
window.puffin.plugins.claudeConfig.updateConfig(content, options)
window.puffin.plugins.claudeConfig.getMetadata()
```

**Branch activation** (via core Puffin state, not the plugin):
```javascript
window.puffin.state.activateBranch(branchId)
```

### 5.5 SAM State / Renderer

The renderer's `app.js` calls `activateBranch` when the user switches branches, which triggers `ClaudeMdGenerator.activateBranch()` via the `state:activateBranch` IPC handler.

## 6. Section Management

### 6.1 Section Parser (section-parser.js)

The section parser operates on markdown content, splitting it into sections by heading (`#`, `##`, `###`, etc.):

| Function | Purpose |
|----------|---------|
| `parseSections(content)` | Split markdown into array of `{name, level, startLine, endLine, content}` |
| `getSection(content, name)` | Find a section by name (case-insensitive) |
| `updateSection(content, name, newContent)` | Replace a section's content |
| `addSection(content, name, body, afterSection, level)` | Insert a new section |
| `removeSection(content, name)` | Delete a section and its content |
| `listSections(content)` | List sections with metadata (lineCount, isStandard) |
| `generateDiff(original, modified)` | Line-by-line diff for review |
| `formatDiff(diff)` | Format diff for display (`+`/`-`/` ` prefixes) |

**Standard sections** (recognized with badges in the UI):
- Project Context, Project Overview, File Access Restrictions, Coding Preferences, Completed User Stories, Branch Focus

### 6.2 Change Proposer (change-proposer.js)

The change proposer interprets natural language requests to generate proposed modifications. It uses keyword matching (not AI) to determine intent:

| Intent | Trigger Keywords | Example |
|--------|-----------------|---------|
| `UPDATE_SECTION` | update, change, modify, edit, set | "Update the Coding Preferences to use TypeScript" |
| `ADD_SECTION` | add + section | "Add a section called Testing Guidelines" |
| `ADD_CONTENT` | add (without section) | "Add TypeScript to the coding preferences" |
| `REMOVE_SECTION` | remove, delete, clear | "Remove the Branch Focus section" |

Section name matching supports aliases (e.g., "coding style" → "Coding Preferences", "focus" → "Branch Focus"). Low-confidence interpretations return suggestions instead of proposals.

## 7. Branch Focus Defaults

The `branch-defaults.js` module defines default focus instructions for 11 branches. Key constraints by branch:

| Branch | Code Allowed | Key Constraint |
|--------|-------------|----------------|
| specifications | No | Planning only — no code changes, no builds, no tests |
| architecture | Yes | System design focus — document decisions and rationale |
| ui | Yes | UI/UX focus — accessibility, responsiveness |
| backend | Yes | Server-side focus — APIs, data, security |
| fullstack | Yes | End-to-end — IPC patterns, cross-process state |
| deployment | Yes | CI/CD, infrastructure, packaging |
| bug-fixes | Yes | Root cause analysis, regression tests |
| code-reviews | Yes | Quality, security, test coverage |
| improvements | Yes | Performance, refactoring, tech debt |
| plugin-development | Yes | Plugin architecture, IPC handlers, testing |
| tmp | Yes | Scratch space — always output results in response text |

Custom branches without defaults get a generic focus text. Non-code branches (custom, with `codeModificationAllowed=false`) get a documentation-only restriction.

## 8. Renderer UI (ClaudeConfigView)

The `ClaudeConfigView` component (1771 lines) provides the full editing interface:

**Layout:**
- Header: "Context Files" title + branch selector dropdown + Add Section / Refresh buttons
- Source indicator: Shows file path and branch-to-CLAUDE.md mapping
- Branch Focus card: View/edit the branch focus with source badge (from file / default / generated)
- Main content: Sections sidebar (navigation) + content editor (textarea) with inline Save/Revert
- Prompt area: Natural language input for AI-assisted generation with quick prompts
- Section modal: Add/edit/delete sections with form inputs

**Key Features:**
- Context file selector dropdown for switching between branches
- Branch focus inline editor with Ctrl+S save, Escape cancel
- Section sidebar with keyboard navigation (Arrow keys, Enter, E to edit, Delete to remove)
- Direct content editing with Ctrl+S save
- AI-powered content generation via `sendPrompt` (uses Sonnet model, strips markdown wrappers from response)
- Diff preview before applying AI-generated or proposed changes
- Template generation for empty context files
- Toast notifications for save/error feedback
- Syncs changes to active CLAUDE.md via `activateBranch` after every save

## 9. Events Emitted

| Event | Emitter | When | Data |
|-------|---------|------|------|
| `claude-config:changed` | Plugin (via context.emit) | File watcher detects change | `{ eventType, filePath }` |
| `branch-focus-updated` | Plugin (via context.emit) | `updateConfig()` or `updateSectionContent()` modifies Branch Focus section | `{ branchId, content, path, source }` |

## Appendix: File Map

| File | Lines | Purpose |
|------|-------|---------|
| `plugins/claude-config-plugin/puffin-plugin.json` | 86 | Plugin manifest — view, commands, IPC handlers, actions |
| `plugins/claude-config-plugin/index.js` | 312 | Entry point — 12 IPC handlers, 10 actions, lifecycle, file watcher |
| `plugins/claude-config-plugin/claude-config.js` | 589 | Core service — ClaudeConfig class, file I/O, caching, branch focus resolution |
| `plugins/claude-config-plugin/section-parser.js` | 247 | Section parsing, CRUD, diff generation |
| `plugins/claude-config-plugin/branch-defaults.js` | 227 | 11 default branch focus templates + fallback generators |
| `plugins/claude-config-plugin/change-proposer.js` | 329 | Natural language intent parsing + change proposal generation |
| `plugins/claude-config-plugin/renderer/index.js` | 33 | Renderer entry — registers view with plugin system |
| `plugins/claude-config-plugin/renderer/components/index.js` | 7 | Component barrel export |
| `plugins/claude-config-plugin/renderer/components/ClaudeConfigView.js` | 1771 | Main UI — context selector, branch focus editor, sections, AI prompts, diff |
| `plugins/claude-config-plugin/renderer/styles/claude-config-view.css` | 1284 | All component styles |
| `src/main/claude-md-generator.js` | 905 | CLAUDE.md assembly — base + branch concatenation, branch memory injection |
