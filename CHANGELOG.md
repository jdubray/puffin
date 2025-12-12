# Changelog

All notable changes to Puffin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-11

### Added

- **Dynamic CLAUDE.md Generation**: Auto-generates branch-specific context files in target project's `.claude/` directory
  - Base context includes project description, assumptions, coding preferences, and active user stories
  - Branch-specific context: UI branch gets design tokens/patterns, Architecture gets system docs, Backend gets API focus
  - Files regenerate automatically on state changes (config, stories, guidelines, architecture)
  - Branch switching swaps active CLAUDE.md content
- **User Story Branch Tracking**: Stories now track which branch they were derived from (`branchId`) and which branches have implemented them (`implementedOn[]`)
- **Branch-Aware Implementation**: Story implementation uses current active branch instead of hardcoded backend, with branch-specific context in prompts
- **Archived User Stories**: New `archived` status for completed stories
  - Auto-archives completed stories older than 2 weeks on project open
  - Manual archive/reopen buttons on story cards
  - Archived stories display in collapsible section
- **Reopen Story Action**: Completed and archived stories can be reopened (set back to pending)

### Fixed

- **Derive User Stories on New Thread**: Fixed bug where "Derive User Stories" checkbox was ignored when using "Send as New Thread"
- **Prompt Restoration on Error**: Original prompt is now restored to textarea when story derivation fails
- **Story Derivation Debugging**: Added detailed logging for Claude CLI response parsing to diagnose empty responses

### Changed

- Implementation prompts now include branch-specific context (UI guidelines, architecture docs, etc.)
- Session resumption uses correct branch's conversation history instead of always using backend branch

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
