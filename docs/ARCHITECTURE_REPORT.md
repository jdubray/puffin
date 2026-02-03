# Puffin Architecture Report

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

## Architectural Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     Renderer Process                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Components  │  │  SAM Pattern │  │  Plugin Components    │ │
│  │  (UI Views)  │──│  (State Mgmt)│──│  (Designer, Calendar) │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ IPC Bridge (preload.js)
┌────────────────────────────┴────────────────────────────────────┐
│                      Main Process                                │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ IPC Handlers │  │ Puffin State │  │  Plugin Manager       │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │Claude Service│  │   Database   │  │ Central Reasoning     │ │
│  │  (CLI Spawn) │  │   (SQLite)   │  │ Engine (CRE)          │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ Subprocess
┌────────────────────────────┴────────────────────────────────────┐
│                   External Services                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ Claude Code  │  │  h-DSL MCP   │  │  File System          │ │
│  │     CLI      │  │    Server    │  │  (.puffin/ directory) │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
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

## Recommendations

### Strengths
1. **Clear separation of concerns** - Main/renderer/plugin boundaries well-defined
2. **Predictable state management** - SAM pattern prevents state divergence
3. **Extensible plugin system** - Microkernel enables third-party extensions
4. **Comprehensive test coverage** - 60 test files covering critical paths
5. **Code Model integration** - h-DSL provides structured codebase understanding

### Areas for Enhancement
1. **Kind Classification** - All artifacts currently `kind: module`; could differentiate (service, component, utility, config)
2. **Dependency Types** - Only `imports` tracked; could add `calls`, `extends` for richer analysis
3. **Flow Detection** - 9 flows auto-detected; could enhance with manual annotations
4. **Cross-Process State** - Consider shared state protocol between main/renderer

---

*Report generated from h-DSL Code Model instance dated 2026-02-01*
