# Changelog

All notable changes to Puffin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.11.1] - 2026-01-11

### Added

- **Agent Support**: Per-branch agent assignment system
  - Agents stored in `.puffin/agents/` (Puffin-managed, not auto-discovered by Claude)
  - Install/uninstall agents via IPC
  - Assign agents to specific branches for explicit control
  - Agent content injected into branch-specific CLAUDE.md files

- **Coding Standards Configuration**: Language-specific coding standards
  - Templates for JavaScript, Python, Java, C, C++
  - Configurable per-project coding conventions

- **Sprint Plan Context**: Previous plan preserved during iteration
  - Plan context maintained when iterating on sprint planning
  - Better continuity in planning workflow

### Changed

- **Sprint Implementation**: Toast warning when approved plan is missing
  - Notifies user if sprint.promptId is not found
  - Helps diagnose missing plan context issues

### Fixed

- **User Story Deletion**: Stories now persist after deletion
  - DELETE_USER_STORY was only updating in-memory model
  - Now correctly calls IPC to persist to SQLite database

## [2.9.0] - 2026-01-02

### Added

- **Claude Config Plugin**: Branch focus management with edit capability
  - Configure and edit focus areas per branch
  - Branch context automatically included in prompts

- **Designer Plugin**: GUI Designer refactored as standalone plugin
  - Decoupled from core application
  - Full plugin lifecycle management

- **GitHub Plugin**: Plugin validation and installation system
  - Install plugins from GitHub repositories
  - Manifest validation and security checks

- **Document Viewers**: Markdown and image viewer plugins
  - View markdown files with proper rendering
  - Image preview support in document panel

- **SQLite Integration**: Persistent database layer
  - Database schema for improved data management
  - Migration from JSON-based storage

- **RICE FACT Framework**: Enhanced implementation prompts
  - Structured guidance for sprint implementation
  - Better context for Claude during development

- **Branch Drag-and-Drop**: History tree UX improvements
  - Reorder branches via drag-and-drop
  - Improved branch navigation

### Changed

- **Architecture Tab Removed**: Now reads directly from architecture file
  - Simplified UI with fewer tabs
  - Direct file access for architecture documentation

- **Auto-Continue Removed**: Cleaned up sprint execution UI
  - Removed automatic continuation feature
  - Simplified sprint workflow

- **Sprint History Panel**: Aligned with swimlane design system
  - Consistent visual language across panels
  - Better integration with conversation view

### Fixed

- **User Story Persistence**: Multi-layer protection against data loss
  - Prevents story data loss during sprint archive
  - UI refresh after archive operations

- **Continue Button**: Implemented using SAM next-action pattern
  - Reliable continuation of conversations
  - Proper state management

- **CLI Instance Management**: Prevent multiple CLI instances from spawning
  - Single instance enforcement
  - Resource cleanup on termination

- **Fullstack Branch Mapping**: Branch button now maps to dedicated fullstack branch
  - Correct branch targeting for fullstack implementation

### Documentation

- Added database schema documentation
- Reorganized design docs with UI/UX guidelines
- Added `/puffin-sync` section for CLI session syncing
- Documentation restructured into categorical subdirectories

## [2.5.0] - 2025-12-25

### Added

- **Plugin Architecture**: Extensible plugin system for adding new functionality
  - Plugin manifest schema with validation
  - Plugin loader and lifecycle management
  - Sidebar view integration for plugin UIs
  - Style injection for plugin CSS
  - IPC handler registration for plugin-to-main communication
  - Renderer component loading for dynamic plugin UIs
  - Plugin contribution parsing for menus, commands, and views

- **Stats Plugin**: Reference implementation demonstrating the plugin architecture
  - Session statistics tracking (turns, cost, duration)
  - Chart visualization with tooltips
  - Markdown export functionality
  - Custom notification system

- **Debug Mode**: View the complete prompt sent to Claude CLI
  - Enable in Config tab under Developer Settings
  - Shows full prompt with all context (project info, branch context, handoff, user stories)
  - Debug tab appears in navigation when enabled
  - Copy and clear functionality for prompt inspection

- **Handoff Summary Improvements**: Better context preservation between threads
  - Linear thread path extraction for accurate summaries
  - Only current thread content included, not entire branch

### Fixed

- **Config Persistence**: All config fields now properly saved and loaded
  - Added missing fields: `defaultModel`, `uxStyle`, `sprintExecution`, `debugMode`
  - Form populates only after config is fully loaded from disk

- **Debug Checkbox**: Checkbox now stays checked when clicked
  - Form no longer re-renders on every state change

- **Handoff Summary Error**: Fixed `prompts is not defined` error when generating summaries

- **Prompt Textarea Blocked**: Fixed issue where textarea was blocked on app startup
  - Clears in-progress state when loading saved state

### Changed

- **Max Turns Default**: Changed from 10 to 40 for longer Claude sessions
- **Continuation Warning**: Shows amber/red warning when max turns reached

## [2.2.0] - 2025-12-25

### Added

- **Archived Stories Separation**: Archived stories now stored in separate `archived-stories.json` file
  - Keeps active stories file lean and focused
  - Automatic migration of existing archived stories on startup
  - New API methods: `getArchivedStories()` and `restoreArchivedStory()`
  - State includes `archivedStoriesCount` for UI display

### Changed

- **Backlog Default Filter**: Changed from 'in-progress' to 'pending' so new stories are visible immediately
- **Auto-Continue Timer**: High-contrast amber styling with pulse animation for better visibility
  - Distinct background and border visible on all themes
  - Larger glowing countdown value

### Fixed

- **Story Preservation**: Unselected stories are now preserved when adding selected stories to backlog
  - Previously clicking "Add Selected" cleared ALL pending stories, losing unselected ones
  - Modal now stays open with remaining stories for continued review

- **Story Persistence**: User stories now properly persist on all state changes
  - Fixed `action.payload` access in persistence layer (was undefined)
  - Added persistence for CREATE_SPRINT (syncs in-progress status)
  - Added persistence for UPDATE_SPRINT_STORY_STATUS
  - Added persistence for TOGGLE_CRITERIA_COMPLETION

## [2.0.0] - 2025-12-22

### Added

- **Sprint Management**: Organize user stories into focused implementation sprints
  - Select multiple stories from backlog to create a sprint
  - Sprint context panel shows stories with completion status
  - Track progress with visual progress bars
  - Mark stories and acceptance criteria as complete
  - Expandable acceptance criteria checklists with inline progress indicators

- **Handoff Summary**: Pass context between threads and branches
  - Generate handoff summaries to share context with new threads
  - Handoff context automatically included in new conversations
  - Track handoff chain history across multiple threads
  - View handoff information in thread metadata panel

- **Enhanced Git Integration**: Improved merge and branch workflow
  - Merge branches with conflict detection and guidance
  - Post-merge workflow prompts for branch cleanup
  - Line ending normalization via `.gitattributes` for cross-platform compatibility
  - Improved uncommitted changes detection during merge operations

- **Toast Notifications**: User-visible error and status messages
  - Error notifications for Claude CLI failures
  - Success/warning/info notification types
  - Auto-dismiss with manual close option

- **Response Formatting**: Improved Claude response display
  - Tool emojis (📖✏️📋) now displayed with proper line breaks
  - Better separation between tool indicators and text content

### Changed

- Sprint stories now sync completion status with backlog (single source of truth)
- Model selection improved with per-thread and project-level defaults
- Prompt completion detection triggers on result message (not process close)

### Fixed

- Stuck-alert overlay blocking all input when not properly dismissed
- Backspace in GUI Designer textarea deleting entire control instead of character
- Duplicate user story detection when adding to backlog or sprint
- Multiple SAM action registration issues resolved
- State synchronization between CLI Output and Prompt View

### Technical

- ~57,000 lines of code across 94 files
- Added cleanupLeftoverOverlays() for robust initialization
- Post-processing of response content for consistent formatting

## [1.2.0] - 2025-12-19

### Added

- **Git Panel**: Full Git integration with branch management and commit workflow
  - View current branch, uncommitted changes, and ahead/behind status
  - Stage/unstage files with diff preview
  - Create commits with AI-generated messages via Claude API
  - View commit history with file changes
  - Create and switch branches
  - GitHub PR creation support
- **Story Generation Tracking**: Experience Memory system for tracking prompt-to-story decomposition
  - Captures how Claude decomposes user prompts into user stories
  - Records user feedback (accepted/modified/rejected) for each generated story
  - Tracks implementation journeys with turn counts and outcomes
  - Insights view as subtab within Backlog for viewing generation history
- **AI Commit Messages**: Generate commit messages using Claude based on staged changes
- **Markdown Rendering**: Response viewer now renders markdown with proper formatting

### Changed

- Claude context files now include branch-specific focus areas
- Prompt editor optimized for better keystroke handling
- Modal manager extended with new modal types for Git operations

### Documentation

- **SPEC_story_generation_tracking.md**: Full specification for Experience Memory system
- **Security Assessments**: Added security review documentation
- **Presentation Updates**: Updated presentation materials in English and French
- **Memory Research**: Added research document on AI agent memory patterns

## [1.1.0] - 2025-12-15

### Added

- **Model Selection**: Choose which Claude model to use for conversations
  - **Project Default**: Set default model in Config view (persisted to `.puffin/config.json`)
  - **Per-Thread Override**: Select a different model in the prompt area before submitting
  - Available models:
    - `opus` - Claude Opus 4.5, most capable, best for complex architectural tasks
    - `sonnet` - Claude Sonnet, balanced performance and speed (default)
    - `haiku` - Claude Haiku, fast and lightweight for quick questions
  - Previously hardcoded to `claude-sonnet-4-20250514`, now uses model aliases for latest versions

### Changed

- Model selector syncs with project default but remembers manual overrides within a session
- New threads reset to project default model

### Fixed

- **Thread Continuation**: "Send" button now correctly continues from the last turn of the thread
  - Previously, selecting an earlier turn and pressing "Send" would create a branch from that turn
  - Now "Send" always continues from the end of the thread, regardless of which turn is selected
  - Use "Send as New Thread" to intentionally start a fresh conversation

## [1.0.1] - 2025-12-12

### Added

- **Acceptance Criteria Verification**: Implementation prompts now require explicit verification of each acceptance criterion
  - Criteria displayed as numbered list for clear reference
  - Claude must report status for each criterion: ✅ (done), ⚠️ (partial), ❌ (blocked)
  - Ensures nothing is overlooked during implementation

### Documentation

- **PROMPT_TEMPLATES.md**: New documentation cataloging all prompt templates used by Puffin
  - Story derivation and modification prompts
  - Architecture review prompt
  - Story implementation prompt with verification requirements
  - Branch context prompts (Specifications, Architecture, UI, Backend, Deployment, Tmp)
  - Dynamic implementation contexts (UI tokens, architecture docs, backend guidance)

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
