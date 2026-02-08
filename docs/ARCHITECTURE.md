# Puffin Architecture Document

**Version**: 3.0.0
**Last Updated**: 2026-02-08
*Generated from h-DSL Code Model Analysis*

---

## Executive Summary

Puffin is an **Electron-based orchestration layer** on top of Claude Code CLI with a **Central Reasoning Engine (CRE)** for deterministic implementation planning. It provides GUI-driven project management, automated sprint orchestration, and AI-assisted development workflows. The architecture follows **clear process separation** (main/renderer) with **unidirectional data flow** (SAM pattern), **SQLite persistence**, and an **extensible plugin system**.

**v3.0.0 Major Additions**:
- Central Reasoning Engine (CRE) for two-stage planning (Plan → RIS)
- SQLite database replacing JSON files (13 tables, 9 migrations)
- h-DSL Code Model with MCP integration
- Automated sprint orchestration with multi-turn implementation
- Inspection assertions for automated verification
- Branch memory system with automated knowledge extraction
- 5 official plugins (Excalidraw, Memory, h-DSL Viewer, Outcome Lifecycle, RLM Document)

### Code Model Statistics (v3.0.0)

| Metric | Value |
|--------|-------|
| Total Artifacts | 302 |
| Source Modules | 242 |
| Test Modules | 60 |
| Dependencies | 239 |
| Detected Flows | 9 |
| Element Types | 8 |
| Total Size | ~4.18 MB |
| Database Tables | 13 |
| Schema Migrations | 9 |
| Plugin Count | 12+ |

---

## Overview

Puffin is an Electron-based GUI application that serves as a **management and reasoning layer** on top of the Claude Code CLI (3CLI). Its primary purpose is to:

1. **Transform user stories** into deterministic implementation specifications via CRE
2. **Orchestrate automated implementation** with multi-turn continuation and stuck detection
3. **Track and organize** 3CLI outputs, conversations, and completion metrics
4. **Provide rich context** to 3CLI through project configuration, branch memory, and h-DSL Code Model
5. **Visualize** the development process (prompts, responses, branches, diagrams, code model)
6. **Persist state** to SQLite database for robust data management
7. **Extend capabilities** via plugin system (Excalidraw, Memory, h-DSL Viewer, etc.)

**Important**: 3CLI remains in control of building the project. Puffin provides:
- **CRE**: Deterministic planning and Ready-to-Implement Specifications (RIS)
- **Orchestration**: Automated multi-turn implementation with monitoring
- **Verification**: Inspection assertions for automated testing
- **Persistence**: SQLite database for all transactional data
- **Extensibility**: Plugin architecture for new capabilities

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
| **Actions** | `actions.js` | Pure functions creating typed proposals (145 actions in v3.0.0) |
| **Model** | `model.js` | Acceptors validating and applying proposals (142 acceptors in v3.0.0) |
| **State** | `state.js` | Computes derived view state from model |
| **Instance** | `instance.js` | Creates SAM instance with FSM integration |
| **Debugger** | `debugger.js` | Time-travel debugging with history snapshots |
| **State Persistence** | `state-persistence.js` | Auto-persists SAM actions to database |

**Data Flow**:
```
User Intent → Action (proposal) → Model (acceptors) → State (computed) → Render
                                         ↓
                                  State Persistence → Database
```

**Key Exports from model.js (v3.0.0)**:
- `initialModel` - State shape definition
- 142 acceptors including:
  - Sprint Management: `createSprintAcceptor`, `updateSprintAcceptor`, `closeSprintAcceptor`
  - CRE Integration: `startPlanGenerationAcceptor`, `approvePlanAcceptor`, `generateRisAcceptor`
  - Orchestration: `startSprintStoryImplementationAcceptor`, `handleOrchestrationContinuationAcceptor`
  - Assertions: `updateSprintStoryAssertionsAcceptor`, `evaluateAssertionsAcceptor`
  - GitHub Integration: `setGitHubConfigAcceptor`, `syncGitHubIssuesAcceptor`

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

**IPC Channels (v3.0.0)**:
- `cre:generate-plan` - Generate implementation plan for sprint
- `cre:refine-plan` - Refine plan based on user feedback
- `cre:approve-plan` - Mark plan as approved
- `cre:generate-ris` - Generate RIS documents for stories
- `cre:generate-assertions` - Generate inspection assertions
- `cre:evaluate-assertions` - Evaluate assertions against codebase
- `cre:get-ris` - Retrieve RIS for story
- `cre:list-ris-story-ids` - List stories with RIS available
- `cre:introspect` - Update Code Model after implementation
- `cre:get-code-model-stats` - Retrieve Code Model statistics

### 3.1 Sprint Orchestration System

**Location**: `src/renderer/app.js` (lines 5000-6200+)

The orchestration system automates multi-turn implementation:

| Component | Responsibility |
|-----------|----------------|
| **startSprintStoryImplementation** | Initiates orchestration with RIS and context |
| **handleOrchestrationContinuation** | Manages auto-continuation loop with 20s countdown |
| **handleOrchestrationCompletion** | Processes completion, generates summary, updates Code Model |
| **stuckDetectionSystem** | Compares last 200 chars of output to detect infinite loops |
| **cancelImplementation** | Kills CLI process with confirmation if files modified |

**Orchestration Flow**:
```
1. Load RIS from database
2. Build orchestration prompt (RIS + assertions + criteria + context)
3. Start Claude CLI with bidirectional streaming
4. Monitor output for [Complete] marker
5. Auto-continue if incomplete (20s countdown, max turns)
6. Detect stuck state (repetitive output)
7. Generate completion summary on finish
8. Trigger CRE introspection to update Code Model
9. Mark story complete in database
```

**Key Features**:
- **File Tracking**: Monitors file operations during implementation
- **Cancel Protection**: Confirmation dialog if files were modified
- **Session Resume**: Continue from checkpoint using `--resume <sessionId>`
- **Metrics Collection**: Turn count, cost, duration, files modified
- **Test Status Detection**: Parses output for test results

### 3.2 Branch Memory System

**Location**: `plugins/memory-plugin/`

Automated knowledge extraction and injection per branch:

| Component | Responsibility |
|-----------|----------------|
| **MemoryManager** | Orchestrates extraction, merging, and storage |
| **HistoryService Adapter** | Bridges to conversation history |
| **LLM Extraction** | Analyzes conversation history to extract knowledge |
| **Template System** | Structured format with Facts, Decisions, Conventions, Bug Patterns |
| **CLAUDE.md Injection** | Auto-includes memory in branch-specific context files |

**Memory File Structure** (`.puffin/memory/branches/<branch>.md`):
```markdown
# Branch Memory: <branch-name>
Last Updated: <timestamp>

## Facts
- Technical facts about the codebase

## Architectural Decisions
- Key design decisions made

## Conventions
- Coding patterns and conventions

## Bug Patterns
- Known issues and gotchas
```

**Automated Maintenance**:
- Background memorization of unmemoized branches on startup (up to 20 branches)
- Exponential backoff retry logic for history service availability
- Deduplication and conflict resolution when merging new knowledge

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

**v3.0.0 Major Change**: Migrated from JSON files to SQLite database for all transactional data.

| Layer | Storage | Purpose |
|-------|---------|---------|
| **SQLite Database** | `.puffin/puffin.db` | **Primary storage** - 13 tables for sprints, stories, plans, RIS, assertions, completions |
| **File-Based** | `.puffin/` directory | Config, history, architecture, plugin data |
| **CRE Storage** | `.puffin/cre/` | h-DSL schema, instance, navigation memo, plan files |
| **Plugin Storage** | `.puffin/<plugin>/` | Plugin-specific data (excalidraw-designs, memory/branches, etc.) |
| **Global** | `~/.puffin/` | Developer profiles, plugin state |

**Database Schema (v3.0.0 - 9 migrations applied)**:

**Core Tables**:
- `user_stories` - Active backlog with inspection assertions and completion summaries
- `archived_stories` - Soft-deleted stories
- `sprints` - Active sprint (only one allowed, enforced by trigger)
- `sprint_stories` - Many-to-many junction table
- `sprint_history` - Archived sprints with denormalized story data
- `story_generations` - AI story generation history
- `implementation_journeys` - Story implementation tracking

**CRE Tables**:
- `plans` - Implementation plans (1:1 with sprints)
- `ris` - Ready-to-Implement Specifications per story
- `inspection_assertions` - Normalized assertion storage

**Completion Tracking**:
- `completion_summaries` - Story completion metrics (files, cost, duration, tests)

**Internal Tables**:
- `_json_migration` - Legacy migration tracking
- `_migrations` - Schema version tracking

**Database Repositories**:
- `SprintRepository` - Sprint CRUD with atomic transactions
- `UserStoryRepository` - Story management with assertion sync
- `CompletionSummaryRepository` - Completion data management
- `BaseRepository` - Common functionality (transactions, JSON helpers)
- `MigrationRunner` - Schema versioning and migration execution

**Note**: CRE tables (`plans`, `ris`, `inspection_assertions`) are accessed directly via database connection in `src/main/cre/` modules rather than through repositories.

---

## Claude Strategy

- **Purpose**: Building the project
- **When**: Main development prompts, code generation, file operations
- **How**: Spawned as subprocess with `--print --output-format stream-json`
- **Capabilities**: Full tool use, file read/write, bash, git, etc.

---

## Technology Stack (v3.0.0)

| Layer | Technology |
|-------|------------|
| Platform | Electron 33+ |
| Frontend | Vanilla JavaScript (ES6+ modules) |
| State Management | SAM pattern with FSM integration (142 acceptors, 145 actions) |
| Database | SQLite (better-sqlite3) with WAL mode, atomic transactions |
| Database Schema | 13 tables, 9 migrations applied |
| Persistence | Hybrid: SQLite for transactional data, JSON for config/history |
| Markdown | marked library |
| CLI Integration | Claude Code subprocess with bidirectional streaming (stream-JSON) |
| Code Analysis | acorn AST parser with regex fallback |
| MCP Protocol | JSON-RPC 2.0 over stdio |
| Plugin System | Microkernel architecture with 12+ official plugins |
| Diagram Editor | Excalidraw (bundled React, esbuild) |
| RLM Integration | Python REPL subprocess for 2M+ token contexts |

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

## IPC Channels (v3.0.0)

| Channel | Direction | Purpose |
|---------|-----------|--------|
| `project:*` | Renderer ↔ Main | CRUD operations for projects |
| `claude:submit` | Renderer → Main | Send prompt to 3CLI with bidirectional streaming |
| `claude:response` | Main → Renderer | Stream 3CLI output (text, tool use, results) |
| `claude:complete` | Main → Renderer | 3CLI finished with metadata (cost, turns, session_id) |
| `claude:check` | Renderer → Main | Verify 3CLI is installed |
| `claude:cancel` | Renderer → Main | Kill CLI process (tree kill on Windows) |
| `file:*` | Renderer ↔ Main | Import/export operations |
| `plugin:*` | Renderer ↔ Main | Plugin lifecycle and communication |
| `cre:*` | Renderer ↔ Main | Central Reasoning Engine operations (10+ channels) |
| `state:*` | Renderer ↔ Main | Database CRUD operations (sprints, stories, assertions) |
| `git:*` | Renderer ↔ Main | Git operations (stage, commit, push, status, checkActiveHooks) |
| `github:*` | Renderer ↔ Main | GitHub integration (OAuth, issues, PRs) |

**New in v3.0.0**:
- `state:createSprint`, `state:updateSprint`, `state:closeSprint`
- `state:loadUserStories`, `state:saveUserStory`, `state:deleteUserStory`
- `state:generateSprintAssertions`, `state:evaluateAssertions`
- `state:syncAssertionsFromCreTable` (reconcile dual assertion stores)
- `cre:generate-plan`, `cre:refine-plan`, `cre:approve-plan`
- `cre:generate-ris`, `cre:generate-assertions`, `cre:evaluate-assertions`
- `cre:introspect`, `cre:get-code-model-stats`
- `git:checkActiveHooks` (security feature for detecting Git hooks)

---

## Security Architecture (v3.0.0)

### Electron Security (Hardened)
- **Context Isolation**: `contextIsolation: true` - `contextBridge` exposes limited `window.puffin` API
- **Sandbox Mode**: `sandbox: true` - Renderer runs in sandboxed environment
- **Node Integration Disabled**: `nodeIntegration: false` - No direct Node.js access from renderer
- **Verified in Security Assessment**: All three settings confirmed enabled

### Input Validation
- **XSS Prevention**: Centralized `escapeHtml()` and `escapeAttr()` utilities
- **Path Traversal**: `isValidFilePath()` blocks `..` patterns
- **ReDoS Protection**: Assertion generator validates regex patterns
- **Path Normalization**: Windows backslash normalization in file selection handlers

### Context Sanitization (v3.0.0 Security Enhancement)
**Problem**: User content injected into prompts could be interpreted as instructions (prompt injection)

**Solution**: BEGIN/END delimiters wrap all user-provided content:
```
--- BEGIN USER STORIES ---
<user story content>
--- END USER STORIES ---
```

**Applied to**:
- `app.js`: `buildOrchestrationPrompt()`, `buildCodeReviewPrompt()`
- `claude-service.js`: `deriveStories()`, `modifyStories()`, context builders
- `generate-plan.js`, `generate-assertions.js`, `generate-ris.js`: All CRE prompts

**Benefit**: Clear boundaries prevent user content from being interpreted as system instructions

### Git Hook Awareness (v3.0.0 Security Feature)
**Risk**: Executable scripts in `.git/hooks/` run automatically on git operations

**Mitigation**:
1. `git-service.js`: `checkForActiveGitHooks()` detects executable hooks
2. `app.js`: `checkGitHooksSecurity()` shows 15-second warning toast on project open
3. User is alerted to review hooks if not authored by them

**Security Boundary**:
- **Puffin**: Orchestration layer, provides context, tracks state
- **Claude Code CLI**: Execution environment with file system access
- User content sanitized at boundary with delimiters

### Plugin Isolation
- **Scoped Context**: Each plugin gets isolated `PluginContext`
- **Namespaced Channels**: `plugin:<name>:<channel>` prevents collisions
- **Registry Tracking**: Per-plugin registration for cleanup on deactivation
- **File Storage Scoping**: Plugins write to `.puffin/<plugin-name>/` subdirectories

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

### Strengths (v3.0.0)
1. **Clear separation of concerns** - Main/renderer/plugin boundaries well-defined
2. **Predictable state management** - SAM pattern prevents state divergence (142 acceptors, 145 actions)
3. **Deterministic planning** - CRE two-stage planning (Plan → RIS) with testable assertions
4. **Robust persistence** - SQLite database with atomic transactions (13 tables, 9 migrations)
5. **Automated orchestration** - Multi-turn implementation with auto-continuation and stuck detection
6. **Extensible plugin system** - Microkernel enables third-party extensions (12+ official plugins)
7. **Comprehensive test coverage** - 60 test files covering critical paths
8. **Code Model integration** - h-DSL provides structured codebase understanding via MCP
9. **Security hardening** - Context sanitization, Git hook awareness, Electron sandbox
10. **Branch memory** - Automated knowledge extraction and injection

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

---

## Appendix B: v3.0.0 Architecture Evolution

### Major Architectural Changes

#### 1. Persistence Layer Transformation
**Before (v1.0.0-v2.x)**:
- All state stored in JSON files (`.puffin/*.json`)
- No transactions, potential for data loss
- File locking issues on Windows

**After (v3.0.0)**:
- SQLite database (`.puffin/puffin.db`) for all transactional data
- 13 tables with proper foreign keys and indexes
- Atomic transactions via `immediateTransaction()`
- 9 migrations applied for schema evolution
- JSON files retained only for config and history

#### 2. Central Reasoning Engine (CRE) Addition
**Impact**: Transforms Puffin from passive tracker to active reasoning system

**New Subsystem**:
- `src/main/cre/` - 20+ modules
- Two-stage planning: Plan (high-level) → RIS (directive specifications)
- h-DSL Code Model with MCP integration
- Inspection assertions for automated verification
- Post-implementation introspection

**Data Flow**:
```
Stories → CRE Plan → User Approval → CRE RIS → Orchestration → Implementation → CRE Introspection → Code Model Update
```

#### 3. Sprint Orchestration System
**Before**: Manual implementation with basic auto-continue

**After**:
- Automated multi-turn implementation loop
- 20-second countdown with visual feedback
- Stuck detection (repetitive output comparison)
- File operation tracking
- Cancel protection (confirmation if files modified)
- Session resume via `--resume <sessionId>`
- Completion summary generation with metrics
- CRE introspection trigger

#### 4. Assertion System (Dual Storage)
**Architecture**: Assertions stored in TWO places

1. **Normalized**: `inspection_assertions` table (CRE-managed)
   - Individual assertion records
   - Evaluation results tracked
   - Foreign keys to plans and stories

2. **Denormalized**: `user_stories.inspection_assertions` JSON column (UI-managed)
   - Quick access without joins
   - Synchronized during generation/evaluation

**Types**: FILE_EXISTS, PATTERN_MATCH, EXPORT_EXISTS, CLASS_STRUCTURE, FUNCTION_SIGNATURE, IPC_HANDLER_REGISTERED, CSS_SELECTOR_EXISTS, etc.

#### 5. Plugin System Maturation
**v1.0.0**: Basic plugin loading
**v3.0.0**: 12+ official plugins with clear categories

**Official Plugins**:
- **Excalidraw**: Professional diagramming with AI generation
- **Memory**: Automated branch knowledge extraction
- **h-DSL Viewer**: Code Model visualization
- **Outcome Lifecycle**: Sprint outcome tracking
- **RLM Document**: 2M+ token document processing
- **Calendar**, **Stats**, **Document Editor/Viewer**, etc.

#### 6. Branch Memory System
**New in v3.0.0**: Automated knowledge extraction per branch

**Flow**:
1. Background scan for unmemoized branches on startup
2. LLM extraction from conversation history
3. Structured storage in `.puffin/memory/branches/<branch>.md`
4. Auto-injection into branch-specific `CLAUDE.md` files
5. Deduplication and conflict resolution

**Format**: Facts, Architectural Decisions, Conventions, Bug Patterns

#### 7. Security Enhancements
**v3.0.0 Additions**:
- Context sanitization with BEGIN/END delimiters
- Git hook awareness with warning toasts
- Windows process tree termination (taskkill)
- Path separator normalization
- Security assessment documentation

#### 8. SAM Pattern Expansion
**Growth**:
- v1.0.0: ~40 acceptors, ~40 actions
- v3.0.0: 142 acceptors, 145 actions
- New categories: Sprint Management, CRE, Orchestration, GitHub, Assertions

**State Persistence Integration**:
- `state-persistence.js` intercepts SAM actions
- Auto-persists to database
- Whitelist of persistable actions

#### 9. Bidirectional Streaming
**Before**: One-way CLI output parsing
**After**: Stream-JSON format enables:
- Interactive questions (suppressed with `--disallowedTools AskUserQuestion`)
- Tool use visibility
- Session resume
- Structured output with JSON schema
- Real-time progress monitoring

#### 10. Completion Tracking
**New Table**: `completion_summaries`
**Denormalized Column**: `user_stories.completion_summary`

**Captured Metrics**:
- AI-generated summary
- Files modified
- Test status (passed/failed/skipped/unknown)
- Criteria matched
- Turn count, cost, duration
- Session ID

### Architecture Statistics Comparison

| Metric | v1.0.0 | v3.0.0 | Change |
|--------|--------|--------|--------|
| Database Tables | 8 | 13 | +62% |
| Schema Migrations | 6 | 9 | +50% |
| SAM Acceptors | ~40 | 142 | +255% |
| SAM Actions | ~40 | 145 | +262% |
| Official Plugins | 7 | 12+ | +71% |
| IPC Channel Categories | 5 | 9+ | +80% |
| Major Subsystems | 4 | 7 | +75% |

### Future Architectural Considerations

**Potential v4.0.0 Enhancements**:
1. **Distributed CRE**: Multi-agent planning with specialized sub-CREs
2. **Real-time Collaboration**: WebSocket-based multi-user support
3. **Cloud Sync**: Optional cloud storage for cross-device project state
4. **Plugin Marketplace**: Third-party plugin discovery and installation
5. **Advanced Analytics**: Cost optimization, productivity metrics, code quality trends
6. **Git Integration Depth**: PR creation, review workflows, merge strategies
7. **Test Runner Integration**: Native test execution and reporting
8. **CI/CD Pipeline**: Automated build, test, deploy orchestration

---

