# Puffin Architecture Document

## Overview

Puffin is an Electron-based GUI application that serves as a **management layer** on top of the Claude Code CLI (3CLI). Its primary purpose is to:

1. **Track and organize** 3CLI outputs and conversations
2. **Provide context** to 3CLI through project configuration and history
3. **Visualize** the development process (prompts, responses, branches)
4. **Communicate UI designs** via the GUI designer

**Important**: 3CLI remains in control of building the project. Puffin is an orchestration and tracking tool, not a replacement for the CLI's capabilities.

## Architecture Philosophy

```
┌─────────────────────────────────────────────────────────────────┐
│                         PUFFIN (GUI)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Project   │  │   History   │  │      GUI Designer       │ │
│  │   Config    │  │    Tree     │  │   (UI Communication)    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Architecture│  │    SAM      │  │       Debugger          │ │
│  │   Document  │  │   State     │  │   (Time Travel Debug)   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ spawns & manages
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      3CLI (Claude Code CLI)                     │
│                                                                 │
│  • Full agentic capabilities (read, write, bash, git, etc.)    │
│  • Project building and code generation                         │
│  • Multi-turn reasoning and tool use                           │
│  • THE BUILDER - remains in control                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ builds
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     TARGET PROJECT                              │
│                  (Your actual codebase)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Dual Claude Strategy

Puffin uses two modes of interaction with Claude:

### 1. Primary: 3CLI (Claude Code CLI)
- **Purpose**: Building the project
- **When**: Main development prompts, code generation, file operations
- **How**: Spawned as subprocess with `--print --output-format stream-json`
- **Capabilities**: Full tool use, file read/write, bash, git, etc.

### 2. Secondary: Claude API (Direct)
- **Purpose**: Ancillary tasks that shouldn't distract 3CLI
- **When**:
  - Quick questions about the architecture
  - Independent problem solving
  - Research that doesn't need file access
  - Reviewing/summarizing without modifying
- **How**: Direct API calls (optional, not yet implemented)
- **Capabilities**: Text-only, no tool use

This separation keeps the main 3CLI conversation focused on building while allowing side conversations for exploration.

## Core Technologies

- **Platform**: Electron
- **Frontend**: Vanilla JavaScript (ES6+)
- **State Management**: SAM Pattern (sam-pattern + sam-fsm)
- **Styling**: CSS3 with CSS Custom Properties for theming
- **CLI Integration**: Node.js child_process (spawn)

## Project Structure

```
puffin/
├── package.json
├── src/
│   ├── main/                    # Electron main process
│   │   ├── main.js              # Entry point
│   │   ├── preload.js           # Preload script for IPC
│   │   ├── ipc-handlers.js      # IPC channel handlers
│   │   ├── project-manager.js   # Project file operations
│   │   └── claude-service.js    # 3CLI subprocess management
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
│       └── formatters.js
│
├── projects/                    # Project storage
└── tests/
```

## 3CLI Integration

### Spawning the CLI

```javascript
spawn('claude', [
  '--print',                    // Non-interactive mode
  '--output-format', 'stream-json',  // Structured output
  '--max-turns', '10',          // Limit agentic loops
  '--prompt', prompt
], {
  cwd: projectPath,             // Run in target project directory
  shell: true
})
```

### Streaming JSON Messages

The CLI outputs JSON lines that Puffin parses:

| Message Type | Content |
|-------------|---------|
| `assistant` | Claude's text responses and tool use |
| `user` | Tool results |
| `system` | System messages |
| `result` | Final result with metadata (cost, turns, session_id) |

### Session Continuity

Use `--resume <sessionId>` to continue conversations, maintaining context across prompts.

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

Access: `Ctrl+Shift+D` or click 🔍 in header

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

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `project:*` | Renderer ↔ Main | CRUD operations for projects |
| `claude:submit` | Renderer → Main | Send prompt to 3CLI |
| `claude:response` | Main → Renderer | Stream 3CLI output |
| `claude:complete` | Main → Renderer | 3CLI finished |
| `claude:check` | Renderer → Main | Verify 3CLI is installed |
| `file:*` | Renderer ↔ Main | Import/export operations |

## Future Considerations

- **API Integration**: Add direct Claude API for ancillary queries
- **Multi-session**: Run multiple 3CLI sessions in parallel
- **Project Templates**: Pre-configured project setups
- **Plugin System**: Custom components and integrations
- **Diff Viewer**: Show file changes made by 3CLI
- **Cost Tracking**: Aggregate API costs across sessions
