# Changelog

All notable changes to Puffin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-12-08

### Added

- **Project Management**: Open directories and store state in `.puffin/` folder
- **Branched Conversations**: Organize prompts into 6 branches (Specifications, Architecture, UI, Backend, Deployment, Tmp)
- **Claude Code Integration**: Spawn CLI as subprocess with real-time JSON streaming
- **Response Viewer**: Markdown rendering with syntax highlighting
- **History Tree**: Navigate conversation history with tree visualization
- **GUI Designer**: Visual drag-and-drop interface for designing UI layouts
- **User Stories Management**: Full CRUD lifecycle with derivation from specifications
- **Story Derivation Workflow**: Extract, review, and implement user stories using Claude
- **Architecture Document**: Living markdown documentation with Claude review
- **Developer Profile**: Persistent profile across projects with GitHub OAuth integration
- **Real-time Activity Tracking**: Monitor Claude's tool execution (Read, Write, Bash, etc.)
- **CLI Output View**: Raw JSON streaming output for debugging
- **SAM Debugger**: Toggle state inspection panel (Ctrl+Shift+D)
- **UI Guidelines System**: Design tokens, component patterns, and stylesheet management
- **Claude.md Generation**: Export project configuration for Claude Code context

### Security

- Electron security hardened: `contextIsolation`, `nodeIntegration: false`, `sandbox: true`
- Path traversal protection on file operations
- GitHub OAuth using Device Flow (no client secret required)
- Credentials encrypted with Electron's safeStorage

### Technical

- SAM (State-Action-Model) pattern for predictable state management
- Dual FSM architecture (App FSM + Prompt FSM)
- Auto-persistence to `.puffin/` directory
- Cross-platform support (macOS, Windows, Linux)
