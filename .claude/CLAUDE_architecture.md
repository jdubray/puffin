---

## Branch Focus: Architecture

You are working on the **architecture thread**. Focus on:
- System design and component structure
- Data flow and state management
- API contracts and interfaces
- Technology choices and trade-offs
- Scalability and maintainability

### Current Architecture

# Puffin Architecture

## Overview

Puffin is an **Electron-based GUI management layer** that sits on top of the Claude Code CLI. It functions as an orchestration and tracking tool, not a replacement for CLI capabilities. The application uses a **clear separation between main and renderer processes** with unidirectional data flow via the **SAM (State-Action-Model) pattern**.

**Key Architectural Principles:**
- Directory-based workflow (creates `.puffin/` directory within target projects)
- All state persisted automatically without explicit save/load
- IPC bridge for secure main-renderer communication
- Two FSMs control application flow (App FSM and Prompt FSM)
- Unidirectional data flow: User Intent → Action → Model → State → View

---

## Process Structure

### Main Process (`src/main/`)

The Electron main process handles system operations and subprocess management.

| File | Responsibility |
|------|----------------|
| `main.js` | Window creation, lifecycle, menu setup, single-instance lock |
| `preload.js` | Secure IPC bridge via `contextBridge`, exposes `window.puffin` API |
| `ipc-handlers.js` | Central IPC request handlers for state, Claude, file, and profile operations |
| `claude-service.js` | Spawns Claude Code CLI subprocess, manages streaming JSON responses |
| `puffin-state.js` | Manages `.puffin/` directory structure and file I/O |
| `developer-profile.js` | Developer profile and GitHub OAuth Device Flow |
| `claude-md-generator.js` | Generates branch-specific CLAUDE.md files for CLI context |

### Renderer Process (`src/renderer/`)

Browser runtime for UI with SAM-based state management.

| Directory/File | Responsibility |
|----------------|----------------|
| `app.js` | Main application bootstrap, SAM initialization, event handling |
| `sam/` | SAM pattern implementation (model, state, actions, instance) |
| `lib/` | Support libraries (sam-pattern, sam-fsm, state-persistence, modal-manager) |
| `components/` | UI components (prompt-editor, history-tree, gui-designer, etc.) |
| `styles/` | CSS stylesheets |

### Shared Code (`src/shared/`)

| File | Contents |
|------|----------|
| `constants.js` | Branch types, FSM states, IPC channels, element types |
| `models.js` | Claude model definitions (Opus, Sonnet, Haiku) |
| `validators.js` | Input validation for prompts, branches, profiles |
| `formatters.js` | ID generation, text truncation, tree flattening |

---

## Data Flow (SAM Pattern)

```
User Intent (click, input)
    ↓
Action (pure function → proposal)
    ↓
Model (acceptor validates & mutates)
    ↓
State (compute view representation)
    ↓
Render (update DOM)
    ↓
[View feeds back user intent]
```

### SAM Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Actions** | `sam/actions.js` | Pure functions that create proposals |
| **Model** | `sam/model.js` | 50+ acceptors that validate and apply proposals |
| **State** | `sam/state.js` | Computes derived/control states for rendering |
| **Instance** | `sam/instance.js` | Creates SAM instance with FSMs |

### Flow Example - Submitting a Prompt

1. User clicks "Submit" button
2. `submitPrompt` action creates proposal
3. `submitPromptAcceptor` validates and adds prompt to history
4. State computes `canSubmit: false, isProcessing: true`
5. Render disables button, shows loading indicator
6. IPC sends to main process → Claude Service spawns CLI
7. CLI streams JSON responses → `receiveResponseChunk` action accumulates
8. `completeResponse` action attaches response to prompt
9. `StatePersistence` saves to `.puffin/history.json`

---

## IPC Communication

### Architecture

Preload script exposes `window.puffin` namespace with grouped APIs:

```javascript
window.puffin = {
  state: { init, get, updateConfig, updateHistory, ... },
  claude: { submit, check, onResponse, onComplete, ... },
  file: { import, export },
  profile: { create, update, delete, ... },
  github: { authenticate, fetchProfile, ... },
  app: { quit, reload, ... }
}
```

### Patterns

| Pattern | Use Case | Example |
|---------|----------|---------|
| `invoke` | Request-response | `await window.puffin.state.init()` |
| `send/on` | Events, streaming | `window.puffin.claude.onResponse(callback)` |

### IPC Channels

- `state:*` - State management (init, get, updateConfig, updateHistory, etc.)
- `claude:*` - CLI operations (submit, response, complete, error)
- `file:*` - Import/export operations
- `profile:*` - Developer profile management
- `github:*` - GitHub OAuth integration

---

## State Management

### Model Shape

```javascript
{
  // Application
  initialized: boolean,
  projectPath: string,
  projectName: string,
  appError: { message, timestamp } | null,

  // Configuration
  config: {
    name, description, assumptions,
    technicalArchitecture, dataModel,
    defaultModel, options, uxStyle
  },

  // Prompt/History
  currentPrompt: { content, branchId },
  pendingPromptId: string | null,
  streamingResponse: string,
  history: {
    branches: { [branchId]: { id, name, prompts } },
    activeBranch: string,
    activePromptId: string | null,
    expandedThreads: {}
  },

  // Features
  guiElements: [],
  architecture: { content, updatedAt },
  userStories: [],
  storyDerivation: { status, pendingStories, ... },
  uiGuidelines: { guidelines, designTokens, componentPatterns },

  // UI State
  currentView: string,
  sidebarVisible: boolean,
  modal: { type, data } | null,

  // Activity Tracking
  activity: {
    currentTool: { name, input } | null,
    activeTools: [],
    filesModified: [],
    status: 'idle' | 'thinking' | 'tool-use' | 'complete'
  }
}
```

### FSM States

**App FSM:**
```
INITIALIZING → LOADING → READY ↔ PROMPTING ↔ PROCESSING
                                              ↓
                                            ERROR → READY
```

**Prompt FSM:**
```
IDLE → COMPOSING → SUBMITTED → AWAITING → COMPLETED/FAILED
  ↑                                              │
  └──────────────────────────────────────────────┘
```

---

## Key Services

### Claude Service (`claude-service.js`)

- Spawns Claude CLI with project directory as cwd
- Writes prompt to stdin, reads JSON from stdout
- Manages session IDs for multi-turn conversations
- Tracks tool execution and file modifications
- Emits streaming chunks and completion events

### State Persistence (`lib/state-persistence.js`)

- Subscribes to SAM state changes
- Selective persistence based on action type
- Debounces rapid updates
- Calls IPC handlers to save to `.puffin/` files

### PuffinState (`puffin-state.js`)

- Manages `.puffin/` directory structure
- Loads/saves config, history, architecture, stories, guidelines
- Auto-creates directories and files
- Partial updates via object spreading

### CLAUDE.md Generator (`claude-md-generator.js`)

- Generates branch-specific context files
- Injects design tokens for UI branch
- Includes architecture for backend/architecture branches
- Regenerates on config/branch changes

---

## Component Architecture

Components follow a consistent pattern:

```javascript
class Component {
  constructor(intents) {
    this.intents = intents  // SAM action dispatchers
  }

  init() {
    this.bindEvents()       // DOM event listeners
    this.subscribeToState() // State change subscription
  }

  bindEvents() {
    element.addEventListener('click', () => {
      this.intents.someAction(data)
    })
  }

  subscribeToState() {
    document.addEventListener('puffin-state-change', (e) => {
      this.render(e.detail.state)
    })
  }

  render(state) {
    // Update DOM based on state
  }
}
```

### UI Components

| Component | Purpose |
|-----------|---------|
| `prompt-editor` | Prompt input, model selection, GUI inclusion |
| `response-viewer` | Claude response display with markdown |
| `history-tree` | Branch selector, prompt thread navigation |
| `gui-designer` | Visual drag-and-drop UI mockup editor |
| `architecture` | Architecture document editor |
| `user-stories` | Story management and backlog |
| `project-form` | Project configuration form |
| `cli-output` | Raw Claude CLI JSON output |
| `debugger` | SAM state/action debugger overlay |

---

## File Structure

```
puffin/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── main.js              # Entry point
│   │   ├── preload.js           # IPC bridge
│   │   ├── ipc-handlers.js      # Request handlers
│   │   ├── claude-service.js    # CLI management
│   │   ├── puffin-state.js      # State persistence
│   │   ├── developer-profile.js # Profile management
│   │   └── claude-md-generator.js
│   │
│   ├── renderer/                # Electron renderer
│   │   ├── app.js               # Bootstrap
│   │   ├── sam/                 # SAM pattern
│   │   │   ├── instance.js
│   │   │   ├── model.js         # 50+ acceptors
│   │   │   ├── state.js
│   │   │   └── actions.js
│   │   ├── lib/                 # Support libraries
│   │   ├── components/          # UI components
│   │   └── styles/              # CSS
│   │
│   └── shared/                  # Shared code
│       ├── constants.js
│       ├── models.js
│       ├── validators.js
│       └── formatters.js
│
└── .puffin/                     # Per-project state
    ├── config.json
    ├── history.json
    ├── architecture.md
    ├── user-stories.json
    ├── ui-guidelines.json
    ├── gui-definitions/
    └── stylesheets/
```

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Platform | Electron 33+ |
| Frontend | Vanilla JavaScript (ES6+ modules) |
| State Management | sam-pattern, sam-fsm |
| Markdown | marked |
| CLI Integration | Claude Code (subprocess) |
| Storage | File-based JSON in `.puffin/` |
| Security | contextBridge, nodeIntegration: false, sandbox: true |

---

## Design Patterns

1. **SAM Pattern** - Unidirectional data flow with acceptors
2. **FSM Lifecycle** - Explicit state machines for app and prompt states
3. **Component-Based UI** - Self-contained components with state subscriptions
4. **IPC for Security** - Context isolation between processes
5. **Directory-Based State** - Single source of truth in `.puffin/`
6. **Selective Persistence** - Only persist on relevant action types
7. **Streaming I/O** - Real-time Claude CLI output via events
8. **Activity Tracking** - Tool execution monitoring from CLI messages

---

*Last updated: v1.1.0*

