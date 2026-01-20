# Architecture Decision Records (ADRs) - Puffin Project

This document contains architecture decision records extracted from the Puffin project history.

---

## Core Architecture

### ADR-001: SAM Pattern for State Management
**Status:** Accepted (Core)

**Context:** Puffin needed a predictable, debuggable state management system for an Electron-based GUI application managing complex, multi-turn conversations with Claude.

**Decision:** Adopt the SAM (State-Action-Model) pattern as the canonical state architecture:
- **State** - Pure representation of current state
- **Actions** - Pure functions proposing state changes
- **Model** - Acceptors that validate/enforce business rules on proposals
- **State Computers** - Compute derived state from model

**Rationale:**
- Unidirectional data flow (User Intent → Action → Model → State → View) prevents circular dependencies
- Functional decomposition enables testing
- Time-travel debugging support built-in
- Clear separation between representation (State), proposals (Actions), and validation (Model)

**Consequences:**
- All state changes flow through SAM loop: View → Action → Acceptor → State update → Computed state
- Async operations must use promises within action proposals
- Plugin state extensions use same acceptor/computer pattern
- Logging configured with `[SAM]` prefixes for debugging

---

### ADR-002: Dual Claude Strategy (3CLI + Direct API)
**Status:** Accepted

**Context:** Puffin needs both agentic code generation (file reading, tool use, building) and lightweight ancillary assistance (questions, research) without distracting the main conversation.

**Decision:** Use 3CLI (Claude Code CLI) as primary builder, with optional direct Claude API for secondary tasks.

**Rationale:**
- 3CLI is the source of truth for building; Puffin orchestrates it rather than replacing it
- Direct API keeps ancillary work from cluttering the main conversation history
- Separation maintains clear responsibilities and prevents context bloat
- 3CLI features (tool use, bash, git) don't apply to lightweight queries

**Consequences:**
- Must manage two separate Claude interfaces
- Requires clear protocol for which tasks use which interface
- Allows more context tokens for main conversation

---

### ADR-003: Directory-Based Workflow (`.puffin/` Directory)
**Status:** Accepted

**Context:** Puffin needs to persist application state (history, configuration, sprints) somewhere accessible but separated from project code.

**Decision:** Create a `.puffin/` directory in each project root as the single source of truth for all Puffin state.

**Rationale:**
- State is tied to a specific project, not global or user-level
- Directory-in-project pattern allows team collaboration (state can be committed to version control if desired)
- Clear boundary between project code and Puffin metadata
- Automatic persistence without explicit save/load UI

**Consequences:**
- `.puffin/` should typically be `.gitignore`d (personal state, not shared)
- Project changes require project reload to pick up new structure
- All file I/O must be proxied through IPC for Electron security

---

## Data Persistence

### ADR-004: Multi-Database Isolation (Per-Project SQLite)
**Status:** Accepted

**Context:** Puffin supports multiple projects simultaneously, each with its own user stories, sprints, and history. The original JSON file-based storage lacked schema versioning and query capability.

**Decision:** Migrate to SQLite with a per-project database model: each project gets its own `.puffin/puffin.db` file.

**Rationale:**
- No shared global database avoids complex multi-tenant logic
- Single-file SQLite database is portable and requires no server
- Each project has complete data isolation
- Schema versioning via migrations supports future extensions
- JSON files retained as backup alongside SQLite

**Consequences:**
- Increased complexity in database initialization on project load
- Each project database must be independently migrated
- Requires repository pattern abstraction layer for all data access
- Better scalability and query performance for large sprint histories

---

### ADR-005: Atomic Transactions for Data Consistency
**Status:** Accepted

**Context:** SQLite operations across related entities (sprints, stories, sprint_history) needed to maintain consistency without partial failures.

**Decision:** Use `immediateTransaction()` wrapper from BaseRepository:
- All multi-step operations within single transaction
- Read data inside transaction (not before) to prevent TOCTOU
- Validate foreign keys before inserts

**Rationale:** SQLite transactions ensure all-or-nothing semantics; prevents race conditions between read and write; provides consistency guarantees for master-detail relationships.

**Consequences:**
- Longer transactions increase lock duration (mitigated by WAL mode)
- All repository methods must be transaction-aware
- Simplifies error recovery (rollback automatic)

---

### ADR-006: Project-Level Plugin Data Storage
**Status:** Accepted

**Context:** Plugins and core app need to persist data across sessions without cross-project interference.

**Decision:** Store plugin data in `.puffin/plugins/[pluginName]/` directory structure; core app data in `.puffin/` root; never store project-specific data in localStorage.

**Rationale:**
- Project-level storage prevents interference when Puffin switches between projects
- localStorage scoped to browser profile causes cross-project pollution
- Explicit filesystem structure easy to backup/migrate

**Consequences:**
- Requires file system permissions
- Data format must be explicitly versioned
- Cleaning up old data requires manual intervention

---

## Plugin System

### ADR-007: Plugin System Architecture (Microkernel Pattern)
**Status:** Accepted (Phase 1 Implemented)

**Context:** Puffin needed to become extensible beyond its core features without increasing coupling or making the monolith harder to maintain.

**Decision:** Adopt a plugin architecture using a Microkernel pattern with:
- **PluginContext API** - provides actions, acceptors, components, IPC handlers, storage, and UI registration
- **PluginLoader** - discovers and loads plugins from `.puffin/plugins/` directory
- **Plugin lifecycle** - activate/deactivate hooks with manifest-based metadata
- **Extension points** - SAM pattern integration, UI components, IPC handlers, sidebar items, modals

**Rationale:** Enables external plugins without modifying core code; follows existing patterns in VS Code and Eclipse IDE; supports gradual extraction of existing features into plugins.

**Consequences:**
- Adds abstraction layer with PluginContext and PluginRegistry
- Requires plugins to follow contract (manifest.json, activate/deactivate methods)
- Phase-based rollout: Phase 1 (core), Phase 2 (feature extraction), Phase 3 (marketplace)

---

### ADR-008: Plugin View Registration via IPC
**Status:** Accepted

**Context:** Plugins need to register UI views but plugin code runs in renderer process while view registry must be in main process.

**Decision:** Use IPC handlers (`plugin:register-view`, `plugin:unregister-view`) with ViewRegistry class in main process; push registration events back to renderer.

**Rationale:** Main process as single source of truth prevents race conditions; event-driven updates allow multiple renderers to stay in sync; IPC provides security boundary.

**Consequences:**
- Requires serialization of view objects
- Async communication adds latency
- IPC channel names must be carefully versioned

---

### ADR-009: Plugin Event Broadcasting
**Status:** Accepted

**Context:** Plugins need to emit events that external systems listen to (e.g., Claude Config Plugin updates branch focus).

**Decision:** Two-level event emission:
1. Plugin calls `context.emit('event-name', data)` within plugin context
2. PluginRegistry forwards to EventEmitter: `registry.emitPluginEvent('plugin-event', event)`
3. External listeners subscribe: `registry.on('plugin-event', handler)`

**Rationale:** Decouples plugin from listeners; allows multiple listeners; prevents tight coupling between plugin and service layers.

**Consequences:**
- PluginRegistry extends EventEmitter
- Events not namespaced by plugin (future improvement)
- Requires careful listener cleanup

---

### ADR-010: Plugin Stylesheet Injection Strategy
**Status:** Accepted

**Context:** Plugins provide CSS that must be loaded into the document but need isolation.

**Decision:** Create `StyleInjector` class that creates `<link>` elements with `data-plugin` attributes; register styles in plugin manifest under `renderer.styles`; cleanup on disable by removing matching elements.

**Rationale:** DOM-based injection allows graceful fallback; `data-plugin` attribute enables efficient cleanup; manifest-based registration keeps style list with metadata.

**Consequences:**
- CSS naming collisions possible (mitigated by convention)
- Style loading is asynchronous
- Plugin developers responsible for CSS scoping

---

## User Interface

### ADR-011: Component-Based UI with Modal Manager
**Status:** Accepted

**Context:** Multiple UI components needed modal dialogs for forms, avoiding duplication.

**Decision:** Centralized **ModalManager** that:
- Registers modal types with render functions
- Handles open/close lifecycle
- Manages stack for nested modals
- Coordinates with state via SAM intents

**Rationale:** Single responsibility for modal lifecycle; reusable across components; decouples trigger logic from display logic.

**Consequences:**
- 982+ lines in modal-manager.js for all modal definitions
- Modal state separate from page state
- Requires careful event binding to avoid memory leaks

---

### ADR-012: Animation Transitions with Accessibility
**Status:** Accepted

**Context:** User story view switches between layouts; needed smooth transitions without motion-sensitive issues.

**Decision:** CSS transitions with accessibility:
- 250ms duration
- `requestAnimationFrame` coordination
- `@media (prefers-reduced-motion: reduce)` for accessibility
- Staggered card animations for visual flow

**Rationale:** Smooth animations improve UX perception; respects accessibility needs; RAF ensures no jank.

**Consequences:**
- ~80 lines CSS + ~30 lines JS
- Total transition ~375ms
- No performance impact (animations purely CSS)

---

### ADR-013: Contextual Branch Buttons (Per-Story)
**Status:** Accepted

**Context:** After sprint plan approval, developers need quick branch access without UI clutter.

**Decision:** Show contextually relevant branch buttons (UI, Backend, Full Stack) below each story, hidden until sprint status is `planned`.

**Rationale:**
- Reduces UI clutter by showing only relevant branches
- Dynamically showing based on sprint status prevents confusion
- Improves workflow: plan sprint → see branches → click to start

**Consequences:**
- Requires dynamic button rendering based on sprint status
- Full Stack button reuses active branch
- Main branch tabs still needed for other types

---

## Document Editor

### ADR-014: JSON Change Format for Document Editor
**Status:** Accepted

**Context:** The Document Editor Plugin used markdown `<<<CHANGE>>>` blocks for edits. This format was error-prone and difficult to parse.

**Decision:** Switch to structured JSON format with legacy markdown fallback:
```json
{
  "changes": [
    {"op": "replace", "find": "...", "content": "..."}
  ]
}
```

**Rationale:**
- JSON is machine-parseable without ambiguity
- Structured format captures metadata (line numbers, change type)
- Legacy fallback ensures graceful degradation

**Consequences:**
- DocumentMerger parses both JSON and markdown formats
- Response parsing more complex but more reliable
- Claude needs new format examples in prompts

---

### ADR-015: Inline Prompt Marker Syntax
**Status:** Accepted

**Context:** Users needed to embed Claude instructions directly in documents without a separate prompt interface.

**Decision:** Use symmetric marker syntax `/@puffin: instruction @/`:
- Opening: `/@puffin:`
- Closing: `@/`

**Rationale:**
- Symmetric pattern (`/@...@/`) is easy to spot
- `@/` rarely used in code, reducing false matches
- Universal format works in any text file

**Consequences:**
- Visual highlighting with yellow background and penguin icon
- Multiline support for complex instructions
- Clean markers button removes all markers when done

---

## Memory System (Proposed)

### ADR-016: File-Based Memory Architecture (3-Layer System)
**Status:** Proposed (Ready for Implementation)

**Context:** Puffin conversations generate valuable knowledge that's lost when conversations end, causing repeated discussions.

**Decision:** Implement a three-layer memory system:
- **Layer 1 (Resources)**: Raw branch conversations, immutable and timestamped
- **Layer 2 (Items)**: Extracted atomic facts with confidence scores
- **Layer 3 (Categories)**: Human-readable markdown summaries

**Rationale:**
- Immutable resources enable audit trails
- Atomic items with confidence scores support conflict detection
- Category summaries provide accessible knowledge representation
- Tiered retrieval minimizes token usage

**Consequences:**
- Requires LLM extraction pipeline for each conversation
- Memory management overhead (cleanup, conflict resolution)
- User must review contradictory memories
- Enables knowledge reuse across projects

---

## Security

### ADR-017: XSS Prevention Strategy
**Status:** Accepted

**Context:** User-provided content (branch names, story descriptions) could contain malicious scripts.

**Decision:** Create centralized `utils/escape.js` module with `escapeHtml()` and `escapeAttr()` functions; apply escaping at multiple layers.

**Rationale:** Centralization prevents duplication; enables code reuse; defensive escaping at multiple layers.

**Consequences:**
- Adds utility module
- Slight performance overhead (negligible)
- Requires thorough testing of edge cases

---

### ADR-018: Memory Leak Prevention in Event Listeners
**Status:** Accepted

**Context:** Long-running sessions accumulated event listeners causing memory leaks.

**Decision:** Add listener tracking with `boundListeners[]` and `documentListeners[]` arrays; implement cleanup methods called from `destroy()` and on re-render.

**Rationale:** Explicit tracking enables controlled cleanup; separate tracking for element vs document listeners allows targeted removal.

**Consequences:**
- Adds state tracking overhead
- Requires discipline to call cleanup at lifecycle points
- Testing needed for edge cases (rapid interactions)

---

## Sprint Execution

### ADR-019: Sprint Execution Control Flow
**Status:** Accepted

**Context:** Sprints need iteration limits, auto-continue timers, stuck detection, and story limits to prevent runaway execution.

**Decision:** Create unified `sprintExecution` state with four coordinated components:
1. **Iteration Counter**: Tracks current/max iterations
2. **Auto-Continue Timer**: Implements delay countdown
3. **Stuck Detection**: Compares response similarity (0.85 threshold)
4. **Story Limit Validator**: Prevents sprints with >4 stories

**Rationale:**
- All features share common state infrastructure
- Prevent rather than reject approach (disable UI before invalid state)
- Iteration history enables stuck detection

**Consequences:**
- Single sprintExecution state object manages all concerns
- Story limit enforced before sprint creation
- UI reflects live iteration counter and countdown

---

### ADR-020: Sprint/User Story Persistence Refactoring
**Status:** In Progress

**Context:** Sprint and user story persistence had critical bugs (non-atomic operations, TOCTOU bugs, orphaned references).

**Decision:** Three-phase refactoring:
1. **Phase 1** - Make sprint close atomic; validate story IDs; fix TOCTOU bugs
2. **Phase 2** - Add title field; implement bidirectional status sync
3. **Phase 3** - Create SprintService layer; consolidate IPC handlers

**Rationale:** Prevents data loss by ensuring atomic transactions; validates foreign keys; fixes race conditions.

**Consequences:**
- Database migration for existing null titles
- New SprintService abstraction
- All operations use `immediateTransaction()`

---

## Summary

The Puffin project architecture is built on these key principles:

1. **Predictability** - SAM pattern provides clear, traceable state management
2. **Isolation** - Per-project databases and storage prevent cross-project interference
3. **Modularity** - Plugin system enables extensibility without core changes
4. **Security** - XSS prevention, IPC boundaries, and careful event cleanup
5. **User Experience** - Animated transitions, contextual UI, accessibility support

These decisions have resulted in a maintainable, debuggable system suitable for complex multi-turn AI orchestration.
