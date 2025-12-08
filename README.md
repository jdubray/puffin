<p align="center">
  <img src="src/renderer/img/header.jpg" alt="Puffin for Claude Code" width="600">
</p>

# Puffin

A GUI for Claude Code to help you "clode" new projects.

## Overview

Puffin is an Electron-based application that provides a visual interface for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Anthropic's official CLI for Claude. Rather than replacing the terminal, Puffin wraps it—giving you full agentic capabilities (file read/write, bash execution, tool use) with a structured workflow for managing AI-assisted development projects.

**Key Features:**

- **Project Configuration**: Define your project's description, assumptions, technical architecture, and data model
- **Claude Guidance Options**: Set preferences for programming style (OOP, FP, Temporal Logic), testing approach, documentation level, and more
- **Branched Conversations**: Organize prompts into branches (Specifications, Architecture, UI, Backend, Deployment) with tree-based history navigation
- **GUI Designer**: Visual drag-and-drop interface for designing UI layouts that can be described to Claude
- **User Stories Management**: Full CRUD lifecycle for user stories with intelligent derivation from specifications using Claude
- **Story Derivation Workflow**: Extract user stories from project specifications, review and refine them, then generate implementation prompts
- **Real-time Activity Tracking**: Monitor Claude's tool execution in real-time, showing current tools, file operations, and processing status
- **Architecture Document**: Living documentation that evolves with Claude reviews
- **Intelligent Title Generation**: Automatic prompt title generation using Claude API with smart fallback mechanisms
- **CLI Output View**: Real-time streaming of Claude's raw JSON output for debugging and transparency

## How It Works

Puffin opens a project directory (like VS Code) and stores its state in a `.puffin/` folder within that directory. When you submit a prompt, Puffin spawns the Claude Code CLI as a subprocess, streams the response in real-time, and persists the conversation history.

```
Your Project/
├── .puffin/
│   ├── config.json      # Project configuration & Claude options
│   ├── history.json     # Branched conversation history
│   └── architecture.md  # Architecture document
├── src/
└── ...your project files
```

## Technology Stack

- **Platform**: Electron 33+
- **Frontend**: Vanilla JavaScript (ES6+ modules)
- **State Management**: SAM Pattern ([sam-pattern](https://www.npmjs.com/package/sam-pattern) + [sam-fsm](https://github.com/jdubray/sam-fsm))
- **AI Integration**: Claude Code CLI (spawned as subprocess with JSON streaming)
- **Markdown**: [marked](https://www.npmjs.com/package/marked) for rendering responses

## Getting Started

### Prerequisites

- Node.js 18+
- Claude Code CLI installed globally: `npm install -g @anthropic-ai/claude-code`
- Active Claude Code subscription or API access

### Installation

```bash
# Clone the repository
git clone https://github.com/jdubray/puffin.git
cd puffin

# Install dependencies
npm install

# Verify Claude CLI is installed
claude --version

# Start the application
npm start
```

On launch, Puffin will prompt you to select a project directory. You can also pass a directory as an argument:

```bash
npm start /path/to/your/project
```

### Development

```bash
# Run with DevTools enabled
npm run dev

# Run tests
npm test

# Package for distribution
npm run package
```

## Project Structure

```
puffin/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.js        # Entry point, window creation
│   │   ├── preload.js     # Secure IPC bridge
│   │   ├── ipc-handlers.js
│   │   ├── puffin-state.js # .puffin/ directory management
│   │   └── claude-service.js # Claude CLI subprocess
│   │
│   ├── renderer/          # Electron renderer process
│   │   ├── index.html
│   │   ├── app.js         # Application bootstrap
│   │   ├── img/           # Logo and splash screen
│   │   ├── styles/        # CSS (main, components, themes, debugger)
│   │   ├── sam/           # SAM pattern (model, state, actions, instance)
│   │   ├── lib/           # SAM libraries (sam-pattern, sam-fsm)
│   │   └── components/    # UI components
│   │       ├── project-form/
│   │       ├── prompt-editor/
│   │       ├── response-viewer/
│   │       ├── history-tree/
│   │       ├── gui-designer/
│   │       ├── architecture/
│   │       ├── cli-output/
│   │       └── debugger/
│   │
│   └── shared/            # Shared utilities (validators, formatters, constants)
│
├── projects/              # Example projects (optional)
└── tests/
```

## SAM Pattern Architecture

Puffin uses the SAM (State-Action-Model) pattern for predictable state management:

```
User Intent → Action → Model → State → View → User Intent...
```

Two FSMs control application flow:
- **App FSM**: Application lifecycle (uninitialized → initializing → ready → error)
- **Prompt FSM**: Prompt lifecycle (idle → composing → submitted → streaming → completed/error)

The SAM Debugger (toggle with the magnifying glass icon or Ctrl+Shift+D) provides real-time visibility into state transitions.

## Views

### Config View
Configure your project with guidance options for Claude:
- Programming style: OOP, FP, Temporal Logic, Hybrid
- Testing approach: TDD, BDD, Integration First
- Documentation level: Minimal, Standard, Comprehensive
- Error handling: Exceptions, Result Types, Either Monad
- Naming convention: camelCase, snake_case, PascalCase
- Comment style: JSDoc, Inline, Minimal

### Prompt View
The main interaction area with:
- Branch tabs for organizing conversations by topic
- Response area with markdown rendering
- Prompt input with "Include GUI" option to attach your GUI design

### Designer View
Visual GUI designer with:
- Element palette: Container, Text, Input, Button, Image, List
- Drag-and-drop canvas with grid snapping
- Property inspector for selected elements
- Export to Claude-readable description

### User Stories View
Comprehensive user story management interface with:
- Full CRUD operations for user stories (create, edit, delete)
- Status tracking from pending to completed
- Story derivation from specifications using Claude
- Interactive review workflow for derived stories
- Implementation prompt generation for approved stories

### Architecture View
Markdown editor for documenting your system architecture, with "Review with Claude" for AI feedback.

### CLI Output View
Real-time streaming of Claude Code's output:
- Live Stream tab: Raw text output as it streams
- Messages tab: Parsed message blocks
- Raw JSON tab: Full JSON output for debugging

## Latest Features

### User Stories Management
Comprehensive user story lifecycle management with intelligent Claude integration:
- **CRUD Operations**: Create, read, update, and delete user stories with full persistence
- **Status Tracking**: Monitor story progress from pending → ready → implementing → completed
- **Source Linking**: Connect stories to their originating prompts for full traceability

### Story Derivation Workflow
Advanced workflow for extracting and implementing user stories:
1. **Derive**: Submit specifications to Claude for automatic user story extraction
2. **Review**: Interactive review interface to refine, edit, or discard proposed stories
3. **Implement**: Generate targeted implementation prompts for approved stories
4. **Iterate**: Request changes and refinements from Claude based on feedback

### Real-time Activity Tracking
Enhanced transparency during prompt execution:
- **Tool Monitoring**: Real-time display of active Claude tools (Read, Write, Bash, etc.)
- **File Operations**: Track which files are being read, written, or edited
- **Status Indicators**: Visual feedback showing thinking, tool-use, and completion states
- **Concurrent Support**: Monitor multiple simultaneous tool executions

### Intelligent Title Generation
Automatic prompt title generation with fallback mechanisms:
- **Claude Integration**: Uses Claude API for contextual title generation
- **Smart Fallbacks**: NLP-based extraction when Claude is unavailable
- **Action Detection**: Identifies key action words (implement, create, fix) for meaningful titles

## License

MIT

## Credits

- [SAM Pattern](https://sam.js.org/) by Jean-Jacques Dubray
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by Anthropic
- [Electron](https://www.electronjs.org/)