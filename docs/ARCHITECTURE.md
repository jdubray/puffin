# Puffin Architecture Document

*Generated from h-DSL Code Model Analysis*

---

## Executive Summary

Puffin is an **Electron-based orchestration layer** on top of Claude Code CLI. It provides GUI-driven project management, prompt composition, and AI-assisted development workflows. The architecture follows a **clear process separation** (main/renderer) with **unidirectional data flow** (SAM pattern) and an **extensible plugin system**.

### Code Model Statistics

| Metric | Value |
|--------|-------|
| Total Artifacts | 302 |
| Source Modules | 242 |
| Test Modules | 60 |
| Dependencies | 239 |
| Detected Flows | 9 |
| Element Types | 8 |
| Total Size | ~4.18 MB |

---

## Overview

Puffin is an Electron-based GUI application that serves as a **management layer** on top of the Claude Code CLI (3CLI). Its primary purpose is to:

1. **Track and organize** 3CLI outputs and conversations
2. **Provide context** to 3CLI through project configuration and history
3. **Visualize** the development process (prompts, responses, branches)
4. **Communicate UI designs** via the GUI designer

**Important**: 3CLI remains in control of building the project. Puffin is an orchestration and tracking tool, not a replacement for the CLI's capabilities.

---

## Architectural Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     Renderer Process                            │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  Components  │  │  SAM Pattern │  │  Plugin Components    │  │
│  │  (UI Views)  │──│  (State Mgmt)│──│  (Designer, Calendar) │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ IPC Bridge (preload.js)
┌────────────────────────────┴────────────────────────────────────┐
│                      Main Process                               │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ IPC Handlers │  │ Puffin State │  │  Plugin Manager       │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │Claude Service│  │   Database   │  │ Central Reasoning     │  │
│  │  (CLI Spawn) │  │   (SQLite)   │  │ Engine (CRE)          │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Subprocess
┌────────────────────────────┴────────────────────────────────────┐
│                   External Services                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Claude Code  │  │  h-DSL MCP   │  │  File System          │  │
│  │     CLI      │  │    Server    │  │  (.puffin/ directory) │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Subsystems

### 1. State Management (SAM Pattern)

**Location**: `src/renderer/sam/`

The SAM (State-Action-Model) pattern provides predictable, unidirectional data flow:

| Component | File | Purpose |
|-----------|------|---------|  
| **Actions** | `actions.js` | Pure functions creating typed proposals |
| **Model** | `model.js` | 50+ acceptors validating and applying proposals |
| **State** | `state.js` | Computes derived view state from model |
| **Instance** | `instance.js` | Creates SAM instance with FSM integration |
| **Debugger** | `debugger.js` | Time-travel debugging with history snapshots |

**Data Flow**:
```
User Intent → Action (proposal) → Model (acceptors) → State (computed) → Render
```

**Key Exports from model.js**:
- `initialModel` - State shape definition
- 40+ acceptors: `submitPromptAcceptor`, `completeResponseAcceptor`, `selectBranchAcceptor`, etc.

### 2. Plugin Architecture

**Location**: `src/main/plugins/`

A microkernel-style plugin system enabling extensibility:

| Component | Responsibility |
|-----------|----------------|
| **PluginManager** | Orchestrates full lifecycle (activate/deactivate/enable/disable) |
| **PluginLoader** | Discovers plugins from `~/.puffin/plugins/`, validates manifests |
| **PluginRegistry** | Central registry for actions, acceptors, reactors, components, IPC |
| **PluginContext** | Sandboxed API surface provided to each plugin |
| **PluginStateStore** | Persists enabled/disabled state to JSON |
| **ViewRegistry** | Manages plugin view contributions |

**Plugin Lifecycle**:
```
Discovery → Manifest Validation → Load → Activate → Running ↔ Disable/Enable → Deactivate
```

**IPC Channel Convention**: `plugin:<plugin-name>:<channel>`

### 3. Central Reasoning Engine (CRE)

**Location**: `src/main/cre/`

The CRE provides AI-assisted development orchestration:

| Component | Responsibility |
|-----------|----------------|
| **index.js** | Entry point, wires components, exposes 10 IPC channels |
| **PlanGenerator** | State machine for sprint plan creation (IDLE→ANALYZING→GENERATING→APPROVED) |
| **AssertionGenerator** | Creates and verifies inspection assertions (file_exists, function_exists, etc.) |
| **RISGenerator** | Generates Ready-to-Implement Specification documents |
| **Introspector** | Post-implementation analysis via git diffs and AI inference |
| **SchemaManager** | Loads/validates/extends h-DSL schema with additive-only enforcement |
| **CodeModel** | In-memory h-DSL instance with PEEK/FOCUS/TRACE/FILTER navigation |

**CRE Workflow**:
```
Stories → Plan Generation → Approval → RIS Generation → Implementation → Introspection → Model Update
```

### 4. h-DSL Engine

**Location**: `h-dsl-engine/`

A five-phase pipeline for building the Code Model:

| Phase | Module | Purpose |
|-------|--------|---------|  
| **1. DISCOVER** | `discoverer.js` | Walks project, parses ASTs, builds term frequency |
| **2. DERIVE** | `schema-deriver.js` | Identifies patterns, derives initial schema |
| **3. POPULATE** | `populator.js` | Creates artifacts, AI prose summaries, dependencies |
| **4. EMIT** | `emitter.js` | Validates consistency, writes schema.json + instance.json |
| **5. ANNOTATE** | `annotation-emitter.js` | Generates .an.md markdown annotations |

**MCP Server** (`hdsl-tool-server.js`): Exposes Code Model via JSON-RPC:
- `hdsl_stats`, `hdsl_peek`, `hdsl_search`, `hdsl_deps`, `hdsl_trace`, `hdsl_impact`, `hdsl_patterns`, `hdsl_path`, `hdsl_freshness`

### 5. Data Persistence

**Locations**: `src/main/puffin-state.js`, `src/main/database/`

| Layer | Storage | Purpose |
|-------|---------|---------|  
| **File-Based** | `.puffin/` directory | Config, history, GUI definitions, architecture |
| **SQLite** | `.puffin/puffin.db` | Sprints, user stories, assertions (per-project) |
| **Global** | `~/.puffin/` | Developer profiles, plugin state |

**Database Repositories**:
- `SprintRepository` - Sprint CRUD with JSON field serialization
- `UserStoryRepository` - Story management with camelCase/snake_case conversion
- `MigrationRunner` - Schema versioning and migration execution

---

## Claude Strategy

- **Purpose**: Building the project
- **When**: Main development prompts, code generation, file operations
- **How**: Spawned as subprocess with `--print --output-format stream-json`
- **Capabilities**: Full tool use, file read/write, bash, git, etc.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Platform | Electron 33+ |
| Frontend | Vanilla JavaScript (ES6+ modules) |
| State Management | SAM pattern with FSM integration |
| Database | SQLite (better-sqlite3) with WAL mode |
| Markdown | marked library |
| CLI Integration | Claude Code subprocess |
| Code Analysis | acorn AST parser with regex fallback |
| MCP Protocol | JSON-RPC 2.0 over stdio |

---

## Project Structure

```
puffin/
├── package.json
├── h-dsl-engine/                # Code Model engine
│   ├── hdsl-bootstrap.js        # Entry point
│   ├── hdsl-tool-server.js      # MCP server
│   └── lib/
│       ├── discoverer.js        # Phase 1: Discovery
│       ├── schema-deriver.js    # Phase 2: Schema derivation
│       ├── populator.js         # Phase 3: Population
│       ├── emitter.js           # Phase 4: Emission
│       └── annotation-emitter.js # Phase 5: Annotation
│
├── src/
│   ├── main/                    # Electron main process
│   │   ├── main.js              # Entry point
│   │   ├── preload.js           # Preload script for IPC
│   │   ├── ipc-handlers.js      # IPC channel handlers
│   │   ├── puffin-state.js      # File-based state management
│   │   ├── claude-service.js    # 3CLI subprocess management
│   │   ├── cre/                 # Central Reasoning Engine
│   │   │   ├── index.js         # CRE entry point
│   │   │   ├── lib/
│   │   │   │   ├── cre-orchestrator.js
│   │   │   │   ├── plan-generator.js
│   │   │   │   ├── assertion-generator.js
│   │   │   │   └── ris-generator.js
│   │   │   └── prompts/         # AI prompt templates
│   │   ├── database/            # SQLite persistence
│   │   │   ├── index.js
│   │   │   ├── connection.js
│   │   │   ├── repositories/
│   │   │   └── migrations/
│   │   └── plugins/             # Plugin system
│   │       ├── plugin-manager.js
│   │       ├── plugin-loader.js
│   │       ├── plugin-registry.js
│   │       ├── plugin-context.js
│   │       └── view-registry.js
│   │
│   ├── renderer/                # Electron renderer process
│   │   ├── index.html           # Main HTML entry
│   │   ├── app.js               # Application bootstrap
│   │   ├── styles/
│   │   │   ├── main.css         # Core styles
│   │   │   ├── components.css   # Component-specific styles
│   │   │   ├── themes.css       # Theme definitions
│   │   │   └── debugger.css     # SAM debugger styles
│   │   │
│   │   ├── sam/                 # SAM Pattern implementation
│   │   │   ├── instance.js      # SAM instance + FSMs
│   │   │   ├── actions.js       # Action definitions
│   │   │   ├── model.js         # Model/acceptors
│   │   │   ├── state.js         # State representation
│   │   │   └── debugger.js      # Time-travel debugger
│   │   │
│   │   └── components/          # UI Components
│   │       ├── project-form/    # Project configuration
│   │       ├── prompt-editor/   # Prompt input
│   │       ├── history-tree/    # Hierarchical history
│   │       ├── response-viewer/ # Response display
│   │       ├── gui-designer/    # Visual UI designer
│   │       ├── architecture/    # Architecture doc editor
│   │       └── debugger/        # SAM debugger UI
│   │
│   └── shared/                  # Shared utilities
│       ├── constants.js
│       ├── validators.js
│       ├── formatters.js
│       └── hdsl-types/          # h-DSL type definitions
│
├── tests/                       # Test files (mirrors src/)
└── .puffin/                     # Project state directory
    ├── config.json
    ├── history.json
    ├── puffin.db                # SQLite database
    └── plugins/                 # Plugin data
```

---

## Key Data Flows

### Flow 1: Main Process Initialization
```
main.js → ipc-handlers.js → puffin-state.js → database/index.js → connection.js
```
Entry point creates window, registers IPC handlers, initializes state and database.

### Flow 2: Renderer Bootstrap
```
app.js → sam/instance.js → sam-pattern.js
```
Application bootstrap creates SAM instance with FSM state machines.

### Flow 3: CRE Pipeline
```
cre/index.js → cre-storage.js → hdsl-types.js
```
CRE entry point initializes storage and type definitions.

### Flow 4: h-DSL Annotation
```
annotation-emitter.test.js → annotation-emitter.js → hdsl-types.js
```
Test and implementation for generating annotation files.

---

## 3CLI Integration

### Spawning the CLI

```javascript
spawn('claude', [
  '--print',                    // Non-interactive mode
  '--output-format', 'stream-json',  // Structured output
  '--max-turns', '40',          // Limit agentic loops
  '--prompt', prompt
], {
  cwd: projectPath,             // Run in target project directory
  shell: true
})
```

### Streaming JSON Messages

The CLI outputs JSON lines that Puffin parses:

| Message Type | Content |
|-------------|--------|
| `assistant` | Claude's text responses and tool use |
| `user` | Tool results |
| `system` | System messages |
| `result` | Final result with metadata (cost, turns, session_id) |

### Session Continuity

Use `--resume <sessionId>` to continue conversations, maintaining context across prompts.
| `user` | Tool results |
| `system` | System messages |
| `result` | Final result with metadata (cost, turns, session_id) |

### Session Continuity

Use `--resume <sessionId>` to continue conversations, maintaining context across prompts.

---

## SAM Pattern Architecture

### Why SAM?

SAM (State-Action-Model) provides:
- **Predictable state mutations** through well-defined steps
- **Time-travel debugging** for development
- **Clear control states** that enable/disable actions
- **Separation of concerns** between actions, model, and view

### Data Flow

```
User Intent → Action → Model (Acceptors) → State → View
                ↑                            │
                └────── Control States ──────┘
```

### Finite State Machines

Three FSMs control application flow:

#### App FSM
```
INITIALIZING → PROJECT_SELECTION → PROJECT_LOADED → PROMPTING → PROCESSING → RESPONSE_READY
                       ↑__________________|_______________|_______________|  
```

#### Project FSM
```
EMPTY → CONFIGURED → SAVED → MODIFIED → SAVED
              ↑__________________________|  
```

#### Prompt FSM
```
IDLE → COMPOSING → SUBMITTED → AWAITING_RESPONSE → COMPLETED
           ↑_______________________________|____________|
```

### SAM Debugger

The built-in debugger provides:
- **Action History**: Every action with timestamp and payload
- **State Snapshots**: Model state at each step
- **Control States**: Visual display of FSM states and flags
- **Time Travel**: Navigate to any previous state
- **Diff View**: See what changed between states

Access: `Ctrl+Shift+D` or click debugger icon in header

---

## Schema Structure (h-DSL)

The Code Model uses an h-M3 v2 schema with these element types:

| Type | m3Type | Purpose |
|------|--------|---------|  
| **module** | SLOT | Source files with path, kind, summary, intent, exports, children |
| **function** | SLOT | Functions with signature, pre/post conditions, behavior |
| **dependency** | RELATION | Import relationships (from → to with kind and weight) |
| **flow** | SLOT | Multi-step data flows with ordered artifact steps |
| **plugin** | SLOT | Plugin definitions with hooks and descriptions |
| **evaluator** | SLOT | Validation/assessment logic definitions |
| **registration** | RELATION | Plugin-to-host connections |
| **test** | SLOT | Test files with kind (unit/integration/e2e) |

**Dependency Kinds**: `imports`, `calls`, `extends`, `implements`, `configures`, `tests`

---

## Data Models

### Project Configuration

```javascript
{
  id: "uuid",
  name: "Project Name",

  // Context for 3CLI
  description: "What this project does...",
  assumptions: ["assumption 1", "assumption 2"],
  technicalArchitecture: "Architecture decisions...",
  dataModel: "Data model specification...",

  // 3CLI Guidance
  options: {
    programmingStyle: "OOP" | "FP" | "Temporal Logic" | "Hybrid",
    testingApproach: "TDD" | "BDD" | "Integration First",
    documentationLevel: "Minimal" | "Standard" | "Comprehensive",
    errorHandling: "Exceptions" | "Result Types" | "Either Monad",
    codeStyle: { naming: "camelCase", comments: "JSDoc" }
  },

  // Living documentation
  architecture: {
    content: "markdown content",
    version: 1
  },

  // Conversation history
  history: {
    branches: { ... },
    activeBranch: "architecture",
    activePromptId: "uuid"
  }
}
```

### Prompt History (Hierarchical)

Organized by branches (Architecture, UI, Backend, Server, Custom):

```javascript
{
  branches: {
    "architecture": {
      id: "architecture",
      name: "Architecture",
      prompts: [
        {
          id: "uuid",
          parentId: null,           // For branching conversations
          content: "User prompt",
          timestamp: "ISO",
          response: {
            content: "3CLI response",
            sessionId: "abc123",    // For --resume
            cost: 0.0042,
            turns: 3,
            duration: 2340
          },
          children: ["uuid1"]       // Child prompts
        }
      ]
    }
  }
}
```

---

## Component Responsibilities

| Component | Role |
|-----------|------|
| **Project Form** | Configure project context sent to 3CLI |
| **History Tree** | Navigate prompt history, select branch |
| **Prompt Editor** | Compose prompts, include GUI designs |
| **Response Viewer** | Display 3CLI output with metadata |
| **GUI Designer** | Visual UI design → text description for 3CLI |
| **Architecture** | Maintain project architecture docs |
| **Debugger** | Debug SAM state, time travel |

---

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|--------|
| `project:*` | Renderer ↔ Main | CRUD operations for projects |
| `claude:submit` | Renderer → Main | Send prompt to 3CLI |
| `claude:response` | Main → Renderer | Stream 3CLI output |
| `claude:complete` | Main → Renderer | 3CLI finished |
| `claude:check` | Renderer → Main | Verify 3CLI is installed |
| `file:*` | Renderer ↔ Main | Import/export operations |
| `plugin:*` | Renderer ↔ Main | Plugin lifecycle and communication |
| `cre:*` | Renderer ↔ Main | Central Reasoning Engine operations |

---

## Security Architecture

### IPC Security
- **Context Isolation**: `contextBridge` exposes limited `window.puffin` API
- **Sandbox Mode**: Renderer runs in sandboxed environment
- **Node Integration Disabled**: No direct Node.js access from renderer

### Input Validation
- **XSS Prevention**: Centralized `escapeHtml()` and `escapeAttr()` utilities
- **Path Traversal**: `isValidFilePath()` blocks `..` patterns
- **ReDoS Protection**: Assertion generator validates regex patterns

### Plugin Isolation
- **Scoped Context**: Each plugin gets isolated `PluginContext`
- **Namespaced Channels**: `plugin:<name>:<channel>` prevents collisions
- **Registry Tracking**: Per-plugin registration for cleanup on deactivation

---

## Test Coverage

| Category | Test Files | Focus Areas |
|----------|------------|-------------|
| **Plugins** | 28 | Lifecycle, registry, context, loader, validators |
| **CRE** | 8 | Orchestrator, prompts, assertions, storage |
| **Database** | 4 | Repositories, migrations, connections |
| **h-DSL Engine** | 2 | Config, annotation emitter |
| **Evaluators** | 2 | Assertion evaluation |
| **Core** | 4 | Validators, state, profiles |

**Test Pattern**: Files in `tests/` mirror `src/` structure with `.test.js` suffix.

---

## Dependency Analysis

### High-Fanout Modules (Most Imported)
Based on incoming dependency count:

1. **SAM Components** - Core state management imported by all UI
2. **Plugin Infrastructure** - PluginContext, PluginRegistry used by all plugins
3. **Shared Validators** - Used across main and renderer
4. **Database Repositories** - Used by services and CRE

### Import Density
- **239 total import dependencies** across 302 artifacts
- **Average**: 0.79 dependencies per artifact (loosely coupled)
- **Primary relationship type**: `imports` (100% of tracked dependencies)

---

## Architectural Patterns

### 1. SAM (State-Action-Model)
Unidirectional data flow with acceptor-based validation and FSM lifecycle control.

### 2. Microkernel Plugin System
Core provides minimal services; plugins extend via registry-based registration.

### 3. Repository Pattern
Database access abstracted through repository classes with transaction support.

### 4. State Machine Orchestration
FSMs control app and prompt lifecycles, CRE plan generation phases.

### 5. IPC Bridge
Secure main-renderer communication via preload script and typed channels.

### 6. Directory-Based State
Project state persisted to `.puffin/` for portability and version control.
| `claude:complete` | Main → Renderer | 3CLI finished |
| `claude:check` | Renderer → Main | Verify 3CLI is installed |
| `file:*` | Renderer ↔ Main | Import/export operations |

---

## Key Architecture Decisions

The following decisions shape the Puffin architecture (see ARCHITECTURE_DECISION_RECORDS.md for full details):

| ADR | Decision | Rationale |
|-----|----------|-----------|
| **ADR-001** | SAM Pattern for State | Predictable unidirectional flow, time-travel debugging |
| **ADR-002** | Dual Claude Strategy | 3CLI for building, API for ancillary tasks |
| **ADR-003** | Directory-Based Workflow | `.puffin/` per-project state for portability |
| **ADR-004** | Multi-Database Isolation | Per-project SQLite for data isolation |
| **ADR-007** | Microkernel Plugin System | Extensibility without core coupling |
| **ADR-016** | File-Based Memory Architecture | 3-layer system for knowledge retention |
| **ADR-021** | RLM Context Management | REPL-based external environment for 2M+ tokens |

---

### Strengths
1. **Clear separation of concerns** - Main/renderer/plugin boundaries well-defined
2. **Predictable state management** - SAM pattern prevents state divergence
3. **Extensible plugin system** - Microkernel enables third-party extensions
4. **Comprehensive test coverage** - 60 test files covering critical paths
5. **Code Model integration** - h-DSL provides structured codebase understanding

---

## Appendix A: Deployed Plugins

Puffin ships with 12 plugins organized into four categories based on their role in the development workflow.

---

### Category 1: Core Development Workflow (Critical)

These plugins are essential for day-to-day development operations.

| Plugin | Description | Integration |
|--------|-------------|-------------|
| **claude-config-plugin** | Manages `CLAUDE_{context}.md` configuration files in `.claude/` directory. Provides section editing, branch focus management, and file watching for live updates. | Registers 10+ IPC handlers (`getConfig`, `updateConfig`, `getBranchFocus`, etc.). Emits `branch-focus-updated` events consumed by ClaudeService. Uses `PluginContext.emit()` for cross-plugin communication. |
| **designer-plugin** | Provides GUI design definition storage in `.puffin/gui-definitions/`. Supports save, load, rename, import/export of visual designs. | Registers 9 IPC handlers and 4 actions. Initializes `DesignerStorage` with project-relative paths. Designs are referenced in prompt composition. |
| **prompt-template-plugin** | Manages reusable prompt templates with default templates for common tasks (code review, bug fix, feature implementation). | Registers 3 IPC handlers (`getAll`, `save`, `delete`). Uses atomic file writes to `.puffin/prompt-templates.json`. Seeds default templates on first load. |

---

### Category 2: Document & Knowledge Management

Plugins for browsing, editing, and persisting documentation and knowledge.

| Plugin | Description | Integration |
|--------|-------------|-------------|
| **document-editor-plugin** | Full-featured text editor with syntax highlighting, file watching, and AI assistance. Supports 30+ file extensions with path traversal protection. | Registers 12 IPC handlers including file operations (`readFile`, `saveFile`), session management, and editor state persistence. Uses `validateFilePath()` security layer. |
| **document-viewer-plugin** | Provides tree view navigation and markdown preview for documentation files in `docs/` directory. | Registers 7 IPC handlers (`scanDirectory`, `getFileContent`, `moveItem`, etc.). Initializes `DocumentScanner` service for file discovery. |
| **rlm-document-plugin** | Recursive Language Model analysis for large documents (2M+ tokens). Provides Python REPL integration, session-based chunking, and iterative query refinement. | Registers 20+ IPC handlers across session, query, chunk, and orchestrator operations. Manages `ReplManager` (Python subprocess), `SessionStore`, and `RlmOrchestrator`. Schedules daily session cleanup. |
| **memory-plugin** | Extracts and persists domain-level knowledge from branch conversations using LLM-powered extraction. Implements 3-layer memory architecture. | Uses `MemoryManager` with Claude CLI client. Creates `HistoryService` adapter for branch prompt access. Registers direct IPC handlers via `ipcMain`. Runs startup maintenance check. |

---

### Category 3: Analytics & Visualization

Plugins for tracking usage, visualizing data, and inspecting code models.

| Plugin | Description | Integration |
|--------|-------------|-------------|
| **stats-plugin** | Tracks and visualizes usage statistics (turns, cost, duration) across branches with weekly aggregation. Supports markdown export. | Registers 4 IPC handlers and 2 actions. Acquires `history` service via `context.getService('history')`. Falls back to mock data if service unavailable. |
| **calendar** | Visual calendar showing sprint and story activity by day with note management. | Registers 9 IPC handlers for month data, day activity, and CRUD notes. Lazy-loads database module from `src/main/database/`. Uses 5-second cache for sprint history. |
| **toast-history-plugin** | Provides view for displaying toast notification history. Minimal logic—delegates storage to core `puffin-state.js`. | View registration via `puffin-plugin.json` manifest. No IPC handlers—uses core `window.puffin.toastHistory` API. |


---

### Category 4: AI-Powered Analysis (Advanced)

Plugins leveraging Claude for complex analysis and orchestration tasks.

| Plugin | Description | Integration |
|--------|-------------|-------------|
| **hdsl-viewer-plugin** | Read-only access to h-DSL schema, code model instance, and `.an.md` annotation files produced by h-DSL Engine. | Registers 4 IPC handlers and 3 actions (`getSchema`, `getInstance`, `getAnnotations`). Reads from `.puffin/cre/` directory. Includes path traversal guard. |
| **outcome-lifecycle-plugin** | Tracks desired outcomes extracted from user stories through a dependency DAG. Computes lifecycle status from story completion. | Registers IPC handlers via `ipc-handlers.js`. Subscribes to `story:status-changed` events with serialized queue. Uses `ClaudeClient` for outcome synthesis. Bootstrap extracts from existing stories with retry backoff. |




