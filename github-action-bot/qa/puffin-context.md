# Puffin - AI-Powered Development Orchestration

## What is Puffin?

Puffin is an Electron-based GUI application that serves as a **management layer** on top of the Claude Code CLI. It helps developers:

1. **Track and organize** Claude Code outputs and conversations
2. **Provide context** to Claude Code through project configuration and history
3. **Visualize** the development process (prompts, responses, branches)
4. **Manage sprints** with user stories and acceptance criteria

**Important**: Claude Code CLI remains in control of building the project. Puffin is an orchestration and tracking tool, not a replacement for the CLI's capabilities.

## Key Features

### Branched Conversations
Organize your Claude conversations into focused branches:
- **Specifications**: Requirements and planning (no code changes allowed)
- **Architecture**: System design and documentation
- **UI**: Frontend implementation with design tokens
- **Backend**: API and data layer implementation
- **Fullstack**: End-to-end features
- **Bug Fixes**: Debugging and fixes
- **Code Reviews**: Quality checks
- **Improvements**: Refactoring and optimization

### Sprint Management
- Create sprints from user stories in your backlog
- Track acceptance criteria completion
- Visual progress indicators
- Sprint close with optional git commit

### Automated Sprint Implementation (v2.12.0)
Let Claude orchestrate entire sprints autonomously:
- Choose between automated or human-controlled mode
- Intelligent story ordering based on dependencies
- Automatic branch assignment (UI, Backend, Fullstack, Plugin)
- Sequential session-based implementation
- Automated acceptance criteria validation
- Code review phase after implementation
- Bug fix sessions for issues found
- Completion summary with statistics
- Graceful pause/stop controls

### User Stories & Backlog
- AI-powered story derivation from prompts
- Acceptance criteria tracking
- Story status management (pending, in-progress, completed, archived)
- Filter and search capabilities

### GUI Designer
- Visual drag-and-drop interface builder
- Save and load UI definitions
- Include designs in prompts for Claude

### Plugin System
Built-in plugins:
- **Stats**: Session statistics and cost tracking
- **Calendar**: Development activity timeline with post-it notes
- **Toast History**: Notification history viewer
- **Prompt Templates**: Reusable prompt management
- **Claude Config**: Branch context configuration

### Git Integration
- Branch management and switching
- Commit with AI-generated messages
- Pull request creation
- Diff viewing and staging

## Technical Stack

- **Platform**: Electron 33+
- **Frontend**: Vanilla JavaScript (ES6+ modules)
- **State Management**: SAM Pattern (State-Action-Model)
- **AI Integration**: Claude Code CLI (spawned as subprocess with JSON streaming)
- **Database**: SQLite via better-sqlite3
- **Markdown**: marked for rendering responses

## How Puffin Works with Claude Code

1. User enters a prompt in Puffin
2. Puffin builds context (project info, branch focus, user stories, history)
3. Puffin spawns Claude Code CLI with the enhanced prompt
4. Claude Code executes and streams responses back
5. Puffin captures, displays, and persists the conversation
6. User can continue, branch, or start new threads

## Project Structure

```
puffin/
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.js     # App entry point
│   │   ├── preload.js  # IPC bridge
│   │   ├── ipc-handlers.js
│   │   ├── claude-service.js
│   │   └── puffin-state.js
│   └── renderer/       # Frontend
│       ├── app.js      # Main app
│       ├── sam/        # State management
│       └── components/ # UI components
├── plugins/            # Plugin implementations
├── docs/               # Documentation
└── .puffin/            # Project-specific data (per-project)
```

## Installation & Usage

```bash
# Clone the repository
git clone https://github.com/jdubray/puffin.git

# Install dependencies
npm install

# Run in development mode
npm run dev -- /path/to/your/project

# Or run normally
npm start -- /path/to/your/project
```

## Requirements

- Node.js 18+
- Claude Code CLI installed and authenticated
- Git (for version control features)

## Configuration

Puffin stores project-specific data in `.puffin/` directory:
- `config.json`: Project settings
- `history.json`: Conversation history
- `architecture.md`: Architecture documentation
- `user-stories.json`: Backlog and stories
- `puffin.db`: SQLite database

## Common Questions

**Q: Does Puffin replace Claude Code?**
A: No, Puffin orchestrates Claude Code. It enhances the workflow with context management, conversation tracking, and sprint planning.

**Q: Can I use Puffin with other AI assistants?**
A: Currently Puffin is designed specifically for Claude Code CLI. Support for other assistants is not planned.

**Q: Is my data sent anywhere?**
A: Puffin stores all data locally in your project's `.puffin/` directory. The only external communication is with the Claude API through Claude Code CLI.

**Q: How do I switch between projects?**
A: Pass a different project path when starting Puffin: `npm start -- /path/to/project`

**Q: Can multiple people use Puffin on the same project?**
A: Yes, the `.puffin/` directory can be committed to git for shared context, though real-time collaboration is not supported.
