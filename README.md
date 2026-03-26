<p align="center">
  <img src="src/renderer/img/header.jpg" alt="Puffin for Claude Code" width="600">
</p>

# Puffin

**Version 3.0 - Central Reasoning Engine Edition**

A structured development environment for Claude Code that transforms AI coding from conversation into deterministic, traceable software engineering.

> **🚀 New in v3.0:** Central Reasoning Engine (CRE), Excalidraw AI Diagrams, Memory Plugin, and automated sprint orchestration with Code Model tracking.



## Why Puffin?

Claude Code is extraordinary out of the box. It can take you to production for projects in the 10k-100k LoC range. But as projects grow, maintaining context, traceability, and structured collaboration becomes critical.

**Puffin transforms AI coding from ad-hoc prompting into structured software engineering.**

### The Key Insight

Prompts alone create confusion. Claude responds much better to a **backlog-driven workflow with implementation plans**:

1. **Prompts → User Stories** - Specifications become structured, reviewable stories
2. **Stories → Sprint Planning** - CRE generates implementation plans with dependencies and sequencing
3. **Plans → Ready-to-Implement Specs (RIS)** - Deterministic specifications that any AI could implement
4. **RIS → Implementation** - Claude executes with full architectural context from the Code Model
5. **Code Review → Verification** - Assertions validate correctness, findings tracked for bug fixes

This structured approach, with **automated Code Model maintenance**, ensures traceability from requirements through implementation. You can charge ahead on complex projects without losing track of what was built, why, and how.

### What Makes v3.0 Different

| Traditional AI Coding | Puffin v3.0 |
|----------------------|-------------|
| Ad-hoc prompts | Structured user stories → Plans → RIS |
| Context lost over time | Code Model tracks codebase structure |
| Repeat architecture context | Memory Plugin auto-injects knowledge |
| Manual story-by-story | Automated sprint orchestration |
| Text-only planning | AI-generated diagrams from docs |
| Hope code matches requirements | Inspection assertions verify correctness |
| Implementation details in prompts | CRE generates deterministic RIS specs |

**Key Benefits:**
- **Deterministic Implementation** - Same RIS produces equivalent results across runs
- **Traceability** - Track from requirements → plan → RIS → implementation → verification
- **Knowledge Retention** - Architectural decisions preserved and auto-applied
- **Sprint Automation** - Let Claude orchestrate entire implementation cycles
- **Visual Documentation** - Generate diagrams directly from markdown docs

## Overview

Puffin is an Electron-based application that provides a visual interface for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Anthropic's official CLI for Claude. Rather than replacing the terminal, Puffin wraps it—giving you full agentic capabilities (file read/write, bash execution, tool use) with a structured workflow for managing cloding projects.

**Puffin's philosophy** is to provide a hierarchical view of the tasks being performed by Claude with traceability to architecture and user stories so that it becomes easier to work collaboratively with Claude and other cloders, rather than just being a passive tester.

You can't "prompt along" a coding agent, just like you can't "prompt along" a developer—there are good reasons why we came up with processes and methodologies to build complex solutions. Processes and methodologies for cloding are yet to be built, but they are coming. Puffin serves as a foundation for structured collaboration between humans and AI coding agents.


## ✨ Key Features

### 🧠 Central Reasoning Engine (CRE)
- **Implementation Plans** with dependency analysis and story sequencing
- **Ready-to-Implement Specifications (RIS)** - deterministic, AI-executable specs
- **Code Model (h-DSL)** tracking codebase structure with incremental updates
- **Inspection Assertions** for automated verification of implementation correctness
- **MCP Integration** for enhanced code exploration via Model Context Protocol

### 📐 Excalidraw AI Diagrams
- **Generate diagrams from docs** - Architecture, sequence, flowcharts, component diagrams
- **Professional hand-drawn aesthetic** with 10+ element types
- **Industry-standard format** - `.excalidraw` files compatible with Excalidraw web app
- **Multi-format export** - PNG, SVG, and JSON

### 🧩 Memory & Context
- **Branch Memory Plugin** auto-extracts domain knowledge from conversations
- **Architectural Decisions** captured and injected into future sessions
- **Branch-specific context** with facts, conventions, and bug patterns
- **CLAUDE.md Generation** with Code Model snippets and memory context
- **CLAUDE.md Rewrite** — one-click AI condensation (30–50% size reduction) to keep context lean

### 💬 `/btw` Quick Questions
- Type `/btw <question>` in the prompt editor for an ephemeral side-answer
- Answered from existing session context — no tools, no file access
- Never added to conversation history; answer shown inline and dismissed when done

### 🔌 Pluggable Agent Backend
- Set `PUFFIN_AGENT_CMD` to replace the Claude Code CLI with any compatible subprocess
- Zero-config fallback to `claude` when the variable is not set
- **Local LLM support** via [deepagents](https://github.com/your-org/local-llm) + Ollama
- **Dynamic model discovery** — model dropdowns populate from Ollama `/api/tags` at startup

### 🚀 Sprint Orchestration
- **Automated Sprint Implementation** - Claude orchestrates entire sprints end-to-end
- **Sequential Story Implementation** with clean sessions per story
- **Automated Code Review** identifies issues, queues bug fixes
- **Acceptance Criteria Validation** after each implementation
- **Cost & Duration Tracking** with completion summaries

### 📚 Document Processing
- **RLM Plugin** for Recursive Language Model document analysis
- **Document Editor** with syntax highlighting, inline prompt markers, auto-save
- **Document Viewer** for markdown and images

### 🔧 Developer Tools
- **Branched Conversations** (Specifications, Architecture, UI, Backend, Deployment, Plugins)
- **Git Integration** with branch management, staging, commits, and merge operations
- **Real-time Activity Tracking** showing Claude's tool execution
- **CLI Output View** with live streaming and raw JSON debugging
- **SAM Debugger** for state management visualization

<p align="center">
  <br>
  <a href="https://youtu.be/RzgzaSNgs1w">
    <img src="https://img.youtube.com/vi/RzgzaSNgs1w/maxresdefault.jpg" alt="Introduction to Puffin" width="380">
  </a>
  <br>
  <em>Watch the introduction</em>
  <br>
  <br>
  <br>

</p>

## Have Questions?

Ask in our [Q&A Discussions](https://github.com/jdubray/puffin/discussions/categories/q-a) and get AI-powered answers! Our bot uses Claude to respond to questions about Puffin, its features, and how to use it.

## How It Works

Puffin opens a project directory (like VS Code) and stores its state in a `.puffin/` folder within that directory. When you submit a prompt, Puffin spawns the Claude Code CLI as a subprocess, streams the response in real-time, and persists the conversation history.

```
Your Project/
├── .puffin/
│   ├── config.json      # Project configuration & Claude options
│   ├── history.json     # Branched conversation history
│   ├── puffin.db        # SQLite database (user stories, sprints, etc.)
│   ├── architecture.md  # Architecture document
│   └── plugins/         # Claude Code plugins/skills
├── src/
└── ...your project files
```

## Technology Stack

- **Platform**: Electron 33+
- **Frontend**: Vanilla JavaScript (ES6+ modules)
- **State Management**: SAM Pattern ([sam-pattern](https://www.npmjs.com/package/sam-pattern) + [sam-fsm](https://github.com/jdubray/sam-fsm))
- **Database**: SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for persistent storage
- **AI Integration**: Claude Code CLI (spawned as subprocess with JSON streaming)
- **Markdown**: [marked](https://www.npmjs.com/package/marked) for rendering responses

## 🚀 Quick Start

### System Requirements

| Component | Requirement | Notes |
|-----------|-------------|-------|
| **Node.js** | v20 LTS | Required for SQLite native module support |
| **RAM** | 4GB minimum, 8GB+ recommended | CRE and Code Model operations are memory-intensive |
| **Disk Space** | 500MB for Puffin + project storage | Code Models and design files stored in `.puffin/` |
| **OS** | Windows 10+, macOS 10.13+, Linux | Cross-platform Electron support |
| **Claude CLI** | Latest version | Install: `npm install -g @anthropic-ai/claude-code` |
| **Claude Subscription** | Pro or API access | Required for all AI operations |

> **📖 First time using Puffin?** Check out the [User Manual](docs/USER_MANUAL.md) for a complete walkthrough of features, workflows, and best practices.

---

### Installing from a Pre-Built Binary

Download the latest release from the [Releases page](https://github.com/jdubray/puffin/releases) and follow the platform-specific instructions below.

#### Windows

**1. Install Node.js**

Download and run the **LTS installer** from [nodejs.org](https://nodejs.org). During installation, make sure the option to add Node.js to PATH is checked. After installation, **reboot your machine** — Puffin reads PATH from the system environment, and changes only take effect after a reboot.

Verify in a new PowerShell window:
```powershell
node --version   # v18 or later
npm --version
```

**2. Install Claude Code CLI**

Using the official PowerShell installer (run in a standard PowerShell window — Administrator not required):
```powershell
# See https://docs.anthropic.com/en/docs/claude-code for the official install command
```

Or using npm:
```powershell
npm install -g @anthropic-ai/claude-code
```

After installation, open a **new** PowerShell window and verify:
```powershell
claude --version
```

If `claude` is not found, try rebooting. The PowerShell installer adds to user PATH, which only propagates to GUI apps after a session restart.

**3. Authenticate**
```powershell
claude auth login
```

**4. Install Puffin**

Download `Puffin-Setup-*.exe` from the Releases page and run the installer. Launch Puffin from the Start menu or desktop shortcut.

> **Troubleshooting:** If Puffin opens but nothing works, open PowerShell and run `where claude`. If it is not found, Claude Code is not on your system PATH. Rebooting usually fixes this. If the issue persists, reinstall Claude Code via npm after confirming `node` is working.

---

#### macOS

**1. Install Node.js**

Using Homebrew (recommended):
```bash
brew install node
```
Or download the macOS installer from [nodejs.org](https://nodejs.org).

**2. Install Claude Code CLI**
```bash
npm install -g @anthropic-ai/claude-code
```

**3. Authenticate — required before first launch**

Open Terminal and run:
```bash
claude auth login
```

This opens a browser for login. **You must do this in Terminal before launching Puffin for the first time.** Puffin inherits the authentication automatically after that — you won't need to repeat it unless your session expires.

**4. Install Puffin**

Download `Puffin-*.dmg` from the Releases page, open it, and drag Puffin to Applications.

> **macOS security warning — required one-time setup:** Puffin is an open-source project and is not code-signed with an Apple Developer certificate. macOS Gatekeeper will block the app on first launch, typically showing *"Puffin is damaged and can't be opened."* This is expected. Run these commands in Terminal:
> ```bash
> pkill -f Puffin 2>/dev/null; true
> xattr -cr /Applications/Puffin.app
> open /Applications/Puffin.app
> ```
> - `pkill` ensures no previous Puffin process is holding the single-instance lock (a leftover process causes silent exits on re-launch)
> - `xattr` removes the quarantine flag macOS places on downloaded files
> - `open` launches the app — use this instead of double-clicking for the **first launch only**
>
> After the first launch, Puffin opens normally from Finder or Spotlight.

> **Troubleshooting:** If you see a `spawn claude ENOENT` error, Puffin cannot find the `claude` binary. Puffin automatically adds the most common install locations (`~/.local/bin`, `/usr/local/bin`, `/opt/homebrew/bin`) to its PATH, so this is usually only a problem if `claude` was installed to a non-standard location. If it still fails, create a symlink in a system location:
> ```bash
> sudo ln -s $(which claude) /usr/local/bin/claude
> ```

---

#### Linux

**1. Install Node.js 18+**

```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Fedora / RHEL
sudo dnf install nodejs npm
```

**2. Install Claude Code CLI**
```bash
npm install -g @anthropic-ai/claude-code
```

**3. Authenticate**
```bash
claude auth login
```

**4. Install Puffin**

Download `Puffin-*.AppImage` from the Releases page, make it executable, and run it:
```bash
chmod +x Puffin-*.AppImage
./Puffin-*.AppImage
```

---

### Step 1: Authenticate Claude CLI

Before using Puffin, install and authenticate Claude Code CLI in your terminal:

```bash
# Install Claude Code CLI (if not already installed)
npm install -g @anthropic-ai/claude-code

# Authenticate with your Claude account — required before first launch
claude auth login

# Verify authentication
claude --version
```

The browser will open for login. **You must complete this step in Terminal/PowerShell before launching Puffin.** Once authenticated, Puffin inherits the session automatically — you won't need to repeat it unless your session expires.

**Windows PowerShell users**: Optionally start Claude first to ensure full initialization:
```powershell
claude
npm start
```

### Step 2: Install Puffin

```bash
# Clone the repository
git clone https://github.com/jdubray/puffin.git
cd puffin

# Install dependencies
npm install

# Start the application
npm start
```

On first launch, Puffin prompts you to select a project directory. Alternatively, pass a path:

```bash
npm start /path/to/your/project
```

### Step 3: Configure Your Project

1. **Project Setup** - Define description, assumptions, technical architecture
2. **Coding Preferences** - Set style (OOP/FP), testing approach, documentation level
3. **Branch Focus** - Configure focus areas for different branches (UI, Backend, etc.)

### Step 4: Start Your First Sprint

1. **Write Specifications** - Describe what you want to build in the Specifications branch
2. **Derive User Stories** - Click "Derive User Stories" to extract structured stories
3. **Create Sprint** - Select stories from backlog and create a sprint
4. **Generate Plan** - CRE analyzes stories and produces an implementation plan
5. **Approve & Implement** - Review the plan, approve, and choose automated or manual implementation

> **📖 Need Help?** Read the [User Manual](docs/USER_MANUAL.md) for detailed workflows, plugin guides, and best practices.

### Development

```bash
# Run with DevTools enabled
npm run dev

# Run tests
npm test

# Run specific test suite
npm test -- tests/rlm-chunk-strategy.test.js

# Build Excalidraw bundle (after modifying excalidraw-bundle-entry.js)
npm run build:excalidraw
```

### Packaging & Distribution

```bash
# Package for current platform
npm run package

# Package for all platforms
npm run package:all

# Package for specific platforms
npm run package:win    # Windows
npm run package:mac    # macOS
npm run package:linux  # Linux
```

Packaged apps are output to `dist/` directory. Electron Builder handles code signing (requires certificates for macOS/Windows distribution).

## Using a Local LLM (deepagents / Ollama)

Set `PUFFIN_AGENT_CMD` to route all Claude CLI calls through a compatible agent subprocess:

```bash
export PUFFIN_AGENT_CMD="python /path/to/deepagents_cli.py"
export DEEPAGENTS_MODEL="ollama:qwen2.5:14b-instruct-q5_K_M"
export OLLAMA_HOST="http://192.168.10.55:11434"
npm start
```

When `PUFFIN_AGENT_CMD` is set, the model dropdowns are populated dynamically from Ollama's `/api/tags` API and the selection is persisted across sessions. Without it, the standard Claude Opus / Sonnet / Haiku options are shown and no env vars are required.

See the [deepagents](https://github.com/your-org/local-llm) repo for the CLI shim and required fixes (readline deadlock, stream-json format, async checkpointer).

---

## Project Structure

```
puffin/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.js        # Entry point, window creation
│   │   ├── preload.js     # Secure IPC bridge
│   │   ├── ipc-handlers.js
│   │   ├── puffin-state.js # .puffin/ directory management
│   │   ├── claude-service.js # Claude CLI subprocess
│   │   ├── database/      # SQLite database layer
│   │   │   ├── database-manager.js
│   │   │   ├── repositories/  # Data access layer
│   │   │   └── migrations/    # Schema migrations
│   │   └── plugins/       # Plugin system core
│   │
│   ├── renderer/          # Electron renderer process
│   │   ├── index.html
│   │   ├── app.js         # Application bootstrap
│   │   ├── img/           # Logo and splash screen
│   │   ├── styles/        # CSS (main, components, themes, debugger)
│   │   ├── sam/           # SAM pattern (model, state, actions, instance)
│   │   ├── lib/           # SAM libraries (sam-pattern, sam-fsm)
│   │   ├── plugins/       # Plugin renderer components
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
├── plugins/               # Built-in Puffin plugins
│   ├── stats-plugin/      # Usage statistics dashboard
│   ├── designer-plugin/   # GUI designer
│   ├── claude-config-plugin/ # CLAUDE.md context management
│   ├── document-viewer-plugin/ # Documentation browser
│   └── document-editor-plugin/ # Text file editor with syntax highlighting
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

### Backlog View
Comprehensive user story management interface with Kanban-style workflow:
- Full CRUD operations for user stories (create, edit, delete)
- Status tracking: Pending → In Progress → Completed → Archived
- Story derivation from specifications using Claude
- Interactive review workflow for derived stories
- **Batch selection**: Select multiple pending stories with checkboxes
- **Start Implementation**: Generate implementation prompts for selected stories with automatic planning
- **Acceptance Criteria Verification**: Claude must explicitly verify each numbered criterion (✅ done, ⚠️ partial, ❌ blocked)
- **Mark Complete**: One-click completion for in-progress stories
- **Auto-Archive**: Completed stories older than 2 weeks are automatically archived

### Architecture View
Markdown editor for documenting your system architecture, with "Review with Claude" for AI feedback.

### CLI Output View
Real-time streaming of Claude Code's output:
- Live Stream tab: Raw text output as it streams
- Messages tab: Parsed message blocks
- Raw JSON tab: Full JSON output for debugging

### Plugin Views

Puffin includes 12 built-in plugins that extend functionality:

**Core Plugins:**
- **Excalidraw Sketcher** 📐: AI-powered diagram generation from markdown docs (Architecture, Sequence, Flowchart, Component diagrams)
- **Document Editor** 📝: Collaborative Code/text editor with syntax highlighting (190+ languages), auto-save, inline prompt markers (`/@puffin: ... @/`)
- **RLM Document Analysis** 🔍: Recursive Language Model for analyzing large documents with chunking and aggregation
- **Context** 📄: CLAUDE.md configuration viewer/editor with branch focus management
- **Docs** 📁: Documentation browser for markdown and image files in your docs/ directory
- ~~**Designer**~~: Create simple GUI layouts to communicate UX requirements to Claude, this plugin is deprecated as we can now attach screen shots to a prompt to facilite the UX design

**Analysis & Visualization:**
- **Memory Plugin** 🧠: Auto-extracts domain knowledge from conversations (runs in background)
- **Outcome Lifecycle** 🎯: Track development outcomes across sprint phases
- **Code Model** 🗺️: Interactive Code Model visualization with dependency tracing and annotations
- **Prompt Templates** 📋: Create and reuse prompt templates for common tasks

**Utility Plugins:**
- **Stats** 📊: Usage statistics dashboard with weekly metrics, cost tracking, and markdown export
- **Calendar** 📅: Development activity timeline with sprints, git branches, and post-it notes
- **Toast History** 🔔: Notification history viewer with 24-hour tracking


## 🎉 What's New in v3.0.0

### Central Reasoning Engine (CRE)
The CRE transforms Puffin from a conversation tracker into a deterministic implementation system:

- **Two-Stage Planning**: Plans specify sequence and dependencies, RIS provides execution details
- **Code Model (h-DSL)**: Living representation of your codebase structure
- **Inspection Assertions**: Testable criteria validate each implementation
- **Plan Iteration**: Review, question, and refine plans before approval
- **CRE Introspector**: Automatically updates Code Model after each sprint

**Workflow**: Sprint → CRE generates Plan → User approves → CRE generates RIS → Claude implements → Introspector updates Code Model

### Excalidraw AI Diagram Generation
Generate professional diagrams from your documentation:

- **Doc-to-Diagram Pipeline**: Select markdown file, choose diagram type, Claude generates elements
- **Diagram Types**: Architecture, sequence, flowchart, component diagrams
- **Hand-Drawn Aesthetic**: Professional yet approachable via Rough.js rendering
- **Export Formats**: PNG, SVG, JSON
- **Editable Results**: Generated diagrams are fully editable in Excalidraw

### Memory Plugin
Stop repeating context - let Puffin remember architectural decisions:

- **Auto-Extraction**: Background analysis extracts domain knowledge from conversations
- **Categorized Storage**: Facts, Architectural Decisions, Conventions, Bug Patterns
- **Auto-Injection**: Branch memory automatically included in CLAUDE.md context
- **Memory Evolution**: New knowledge merges with existing, deduplicates, resolves conflicts

### Code Model Plugin
Visualize and explore your Code Model:

- **Interactive Graph**: Navigate modules, dependencies, and relationships
- **Annotations**: See which primitives (TERM, PROSE, RELATION, etc.) map to each element
- **Dependency Tracing**: Follow import chains and call relationships

### Previous Releases

#### Inline Prompt Markers (v2.14.0)
Embed Claude instructions directly in your documents with the new marker syntax:

```
/@puffin: your instructions here @/
```

- **Insert via toolbar, context menu, or Ctrl+M**
- **Visual highlighting** with yellow background and 🐧 icon
- **Multiline support** for complex instructions
- **Holistic processing** - Claude sees all markers and applies changes cohesively
- **Clean markers button** removes all markers when you're done

This workflow lets you annotate your code exactly where changes are needed, making it easier to communicate precise modifications to Claude.

### Automated Sprint Implementation (v2.12.0)
Let Claude orchestrate entire sprints autonomously:

- **Implementation Mode Selection**: After plan approval, choose between automated (Claude orchestrates everything) or human-controlled (manual story-by-story)
- **Intelligent Story Ordering**: Claude analyzes dependencies and determines optimal implementation sequence
- **Branch Assignment**: Each story is assigned to the appropriate branch (UI, Backend, Fullstack, Plugin)
- **Orchestration Plan Review**: See the complete implementation plan before Claude starts
- **Sequential Sessions**: Each story is implemented in a separate, clean session
- **Acceptance Criteria Validation**: Automatic verification after each story implementation
- **Code Review Phase**: Automated code review identifies issues after all stories complete
- **Bug Fix Sessions**: Sequential sessions to address each finding from code review
- **Completion Statistics**: Summary showing costs, durations, and outcomes
- **Graceful Interruption**: Pause or stop automated implementation at any point

### Backlog-Driven Workflow
The core of Puffin's approach to structured cloding:

```
Prompt → Derive Stories → Review → Backlog → Pull → Thread → Implement → Complete
```

- **Story Derivation**: Claude extracts user stories from your specifications
- **Review Interface**: Refine, edit, or discard proposed stories before committing
- **Backlog Management**: Stories queue up with status tracking (Pending → In Progress → Completed)
- **Implementation Threads**: Each story gets its own focused thread with full context
- **Completion Tracking**: Mark stories and threads complete for clear progress visibility

### Expandable Thread History
Navigate complex project histories with ease:
- **Collapsible Threads**: All threads start collapsed for a clean overview
- **Expand on Click**: Click to expand and see child prompts
- **Visual Indicators**: Arrows show expandable threads, checkmarks show completed ones
- **Context Menu**: Right-click to mark complete, expand/collapse, or reply
- **Strikethrough Styling**: Completed threads are visually distinct

### Real-time Activity Tracking
Enhanced transparency during prompt execution:
- **Tool Monitoring**: Real-time display of active Claude tools (Read, Write, Bash, etc.)
- **File Operations**: Track which files are being read, written, or edited
- **Status Indicators**: Visual feedback showing thinking, tool-use, and completion states
- **Concurrent Support**: Monitor multiple simultaneous tool executions

### Context Window Management
Keep Claude focused on what matters:
- **Visual Context Indicator**: See which prompts are in Claude's context window
- **Session Resumption**: Automatically resumes Claude sessions to maintain context
- **Smart History**: Only sends relevant context when resuming, not redundant history

### Git Integration
Puffin includes a comprehensive Git panel for repository management directly within the application:
- **Branch Management**: Create, switch, and delete branches with configurable prefixes (feature/, bugfix/, etc.)
- **Change Staging**: View modified files, stage/unstage individual files or all changes
- **Commit Workflow**: Write commit messages manually or generate them with Claude based on staged changes
- **Merge Operations**: Merge branches with conflict detection and resolution guidance
- **Operation History**: Track all Git operations performed through Puffin

**Cross-Platform Line Endings**: Puffin includes a `.gitattributes` file that automatically normalizes line endings (CRLF/LF) across different operating systems. This prevents phantom "modified" files when working in mixed environments like Windows with WSL. No additional configuration is required—Git will automatically handle line ending conversions on commit.

## 📚 Documentation & Resources

### Essential Reading
- **[User Manual](docs/USER_MANUAL.md)** - Complete guide to features, workflows, and best practices
- **[Central Reasoning Engine Specification](docs/CENTRAL_REASONING_ENGINE.md)** - CRE architecture and capabilities
- **[CRE Detailed Design](docs/CRE_DETAILED_DESIGN.md)** - Technical implementation guide
- **[h-DSL & h-M3 Research](docs/h-DSL.md)** - Hybrid DSL theoretical foundations
- **[Excalidraw Plugin Guide](docs/summaries/excalidraw-plugin-summary.md)** - AI diagram generation workflow

### Plugin Documentation
- **[Memory Plugin Lifecycle](docs/summaries/memory-summary.md)** - How branch memory extraction works
- **[RLM Document Plugin](docs/summaries/context-summary.md)** - Recursive Language Model document processing
- **[Outcome Lifecycle](docs/summaries/outcomes-summary.md)** - Sprint outcome tracking
- **[Calendar Plugin](docs/summaries/calendar-summary.md)** - Event scheduling and reminders
- **[GitHub Integration](docs/summaries/github-summary.md)** - Repository operations

### Architecture & Design
- **[Architecture Report](docs/ARCHITECTURE_REPORT.md)** - System architecture analysis
- **[3CLI Features Catalog](docs/reference/3CLI_FEATURES.md)** - Claude Code CLI capabilities
- **[Plugin Architecture](docs/plugin-architecture/)** - Building Puffin plugins

### Getting Help
- **[Q&A Discussions](https://github.com/jdubray/puffin/discussions/categories/q-a)** - Ask questions, get AI-powered answers
- **[Video Introduction](https://youtu.be/RzgzaSNgs1w)** - Watch the intro video
- **[Changelog](CHANGELOG.md)** - Full version history

## License

MIT

## 🙏 Credits & Acknowledgments

- **[RLM Skill](https://github.com/brainqub3/claude_code_RLM)** by John Adeojo - Recursive Language Model implementation
- **[SAM Pattern](https://sam.js.org/)** by Jean-Jacques Dubray - State-Action-Model architecture
- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** by Anthropic - AI coding assistant
- **[Excalidraw](https://excalidraw.com/)** - Hand-drawn diagram library
- **[Electron](https://www.electronjs.org/)** - Cross-platform desktop framework
- **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)** - Fast SQLite bindings
- **[marked](https://www.npmjs.com/package/marked)** - Markdown rendering

## 🌟 Contributing

Puffin is under active development. Contributions welcome! See [GitHub Issues](https://github.com/jdubray/puffin/issues) for planned features and known issues.

## 📄 License

MIT - See [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Built with ❤️ for the cloding community</strong><br>
  <em>Transforming AI coding from conversation into software engineering</em>
</p>