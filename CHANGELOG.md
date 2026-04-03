# Changelog

All notable changes to Puffin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.11.1] - 2026-04-03

### Added

- **Quick Question Button (`/btw`)**: A **💬 Quick Q** button in the prompt editor toolbar opens the ephemeral `/btw` side-panel directly, without typing the `/btw` prefix. Answers use the current session context, never enter conversation history, and the panel can be dismissed or cleared independently.

### Fixed

- **Test Suite — 38 pre-existing failures resolved (2573/2573 passing)**:
  - `designer-storage.test.js`: Correct plugin path (`.disabled` suffix); rewrote all assertions from Jest (`jest.fn()`, `expect().toBe()`) to `node:assert`; corrected two wrong expectations about `sanitizeFilename` (hyphens are preserved; `'Login-Form'` does not collide with `'Login Form'`).
  - `outcome-lifecycle/renderer.test.mjs`: Fixed import depth (`../../../../` → `../../../`, which escaped the project root); corrected truncation assertion (SVG `aria-label` and `<title>` intentionally carry the full title for accessibility — assertion now checks for the `…` ellipsis in the rendered text node).
  - `puffin-state.test.js`: Injected an in-memory database mock (`createDatabaseMock()`) so tests run under the system Node.js without `better-sqlite3` (compiled against Electron's ABI); updated subdirectory names (`gui-designs` → `gui-definitions`); updated GUI method calls to current API (`saveGuiDesign`, `loadGuiDesign`, `listGuiDesigns`).

## [3.11.0] - 2026-04-03

### Added

- **Help Mode Toggle**: A `?` button in the header activates Help Mode. When on, every element annotated with `[data-help]` swaps its tooltip to show descriptive contextual help text. A `MutationObserver` (`HelpModeController`) handles elements injected after activation (plugin buttons, dynamically rendered story cards) so the mode works across the entire UI without requiring re-activation. Original tooltip values are restored exactly on deactivation.
- **Tooltip Engine**: New lightweight fixed-position tooltip renderer (`tooltip-engine.js`) that handles both `[data-tooltip]` and `[data-help-active]` attributes. Uses `position:fixed` so tooltips are never clipped by `overflow:hidden` ancestors — works in sidebars, plugin views, and modals. Activated via event delegation on document capture so it covers all current and future DOM elements including plugin-injected ones.
- **Workflow State Tracker**: Pure-function module (`workflow-state-tracker.js`) that derives a concise multi-section workflow summary and detects the current workflow phase (0=Bootstrap through 10=Iterate) from SAM state and live git status. Used as structured context injected into AI prompts so Claude has accurate knowledge of what the user has done and where they are in the process. `fetchWorkflowContext()` convenience wrapper fetches git status and returns both the summary and phase descriptor in one async call.
- **Action Card Engine**: Deterministic engine (`action-card-engine.js`) that produces a prioritised list of "next best action" cards based on workflow state, git status, and activity log — no AI calls. Each card includes a title, description, CTA label, phase badge, and a `howId` key that maps to step-by-step how-to instructions (`HOW_CONTENT`). Cards cover the full Puffin workflow: Configure → Branch → Explore → Derive Stories → Sprint → Plan → Implement → Verify → Review → Commit → Iterate, plus "no git repo" and "on main branch" reminders.
- **Activity Log**: Persistent per-project journal of significant user actions (`activity-log.js`), stored in `localStorage` (rolling 200 entries), keyed by a hash of the project path. Tracks 23 event types across all workflow phases (prompt sent, stories derived, plan approved, assertions run, sprint closed, committed, etc.). Entries carry phase ID, human-readable label, icon, and optional detail. Provides grouped-by-phase, recent-N, and since-last-commit views for consumption by the Action Card Engine and workflow context builder.
- **Vibe Service — Mistral Vibe CLI Integration** (`vibe-service.js`): Puffin can now drive [Mistral's Vibe CLI](https://github.com/mistralai/vibe) as an alternative agent backend. Spawns `vibe -p <prompt> --output streaming` in programmatic mode, parses newline-delimited JSON output chunk-by-chunk, and forwards text deltas to the renderer. Injects `MISTRAL_API_KEY` from project config and forces `PYTHONUNBUFFERED=1` / UTF-8 for clean streaming on all platforms. Tool-call permissions (`bash`, `write_file`, `search_replace`) are auto-set to `always` so the agent doesn't stall waiting for interactive approval. Cancel uses `taskkill /T /F` on Windows. Augments `PATH` on macOS to find `~/.local/bin` installs.

## [3.10.0] - 2026-03-30

### Added

- **Co-Development Branches — Per-Branch Additional Directories**: Each branch can now be configured with up to 5 extra directories that Claude CLI will have access to via `--add-dir`. Added in Branch Settings (gear icon on any branch). Each entry has an optional label, and a **Read-Only** toggle that injects a CLAUDE.md constraint block instructing Claude not to modify files in that directory. Enables workflows like a UI branch reading a shared design-system, a Backend branch reading an API spec repo, or a Fullstack branch spanning multiple sibling repositories — without giving Claude write access to reference codebases.

### Fixed

- **CI Builds — macOS / Linux / Windows All Platforms**: Replaced the 128×128 source icon (too small for macOS ICNS generation) with a programmatically generated 1024×1024 PNG (`scripts/generate-icon.js`, pure Node.js, no external dependencies). Removed `hardenedRuntime: true` and `entitlements` from the electron-builder macOS config — these require a valid Apple Developer signing identity and were silently failing in unsigned CI builds. Added `identity: null` to explicitly skip code signing. Added `fail-fast: false` to the release matrix so a single-platform failure no longer cancels the other platform builds.
- **Plugin IPC Handlers Available Before Project Load**: `plugins:list` and `plugins:listActive` IPC handlers are now registered early in `setupIpcHandlers()` (before any project is opened) via module-level `pluginLoaderRef` / `pluginManagerRef` references. This fixes the welcome screen and plugin-component-loader failing to enumerate plugins at startup.
- **SAM Package Renamed**: Updated dependency from `sam-fsm`/`sam-pattern` to the scoped `@cognitive-fab/sam-fsm`/`@cognitive-fab/sam-pattern` packages following the upstream package rename.

## [3.7.6] - 2026-03-25

### Added

- **Voice Input — Speech-to-Text**: A microphone button in the prompt editor lets users dictate prompts using the browser's `MediaRecorder` API. Recorded audio is sent to an OpenAI-compatible Whisper endpoint (`SpeechService` in `src/main/speech-service.js`) and the transcription is inserted into the prompt textarea. API key, endpoint URL, and model are configurable in Project Settings → Voice Input. Defaults to `gpt-4o-mini-transcribe` on OpenAI's transcription API but supports any OpenAI-compatible provider (e.g. Azure, local Whisper). No additional npm dependencies — multipart form-data is built manually using Node.js built-ins.
- **Website Edition — Visual Feedback Loop (Puppeteer)**: A camera toggle button in the Website URL panel enables an automated visual feedback loop for Website Edition projects. When active, each submitted prompt is augmented with instructions for Claude to use a Puppeteer MCP server to screenshot the running preview server (`localhost:5000`), compare the output against the stated goal, and self-correct — up to 3 attempts per prompt — without the user manually pasting screenshots. `PuppeteerMcpService` (`src/main/puppeteer-mcp-service.js`) writes a `.puffin/mcp-puppeteer.json` config file on first enable and passes `--mcp-config` to the Claude CLI on every submit while the loop is active. Toggle is ephemeral (per-session, not persisted). Requires `@modelcontextprotocol/server-puppeteer` resolvable via `npx`.
- **`/btw` Quick Question Panel**: Type `/btw <question>` in the prompt editor to open an ephemeral side-question panel. The question is answered using the current session's context via a one-shot call (no tools, no file access) and displayed inline — it is never added to conversation history. Useful for quick clarifications without interrupting the main thread. The panel can also be dismissed or cleared independently.
- **CLAUDE.md Rewrite**: A **Rewrite** button in the Config tab asks Claude to condense the current context file (CLAUDE.md) by 30–50% while preserving all rules, conventions, and architectural decisions. Large context files (100KB+) slow down every prompt by bloating the context window; this one-click operation reduces size without data loss. The rewritten content is shown as a reviewable diff before saving.
- **Pluggable Agent Backend (`PUFFIN_AGENT_CMD`)**: Set the `PUFFIN_AGENT_CMD` environment variable to replace the Claude Code CLI subprocess with any compatible agent. All seven spawn sites (`submit`, `isAvailable`, `getVersion`, `generateTitle`, `sendPrompt`, `deriveStories`, `generateInspectionAssertions`) now use the configured command. Falls back to `claude` when the variable is not set — no breaking change for existing users. Primary use case: [DeepAgents](https://docs.langchain.com/oss/python/deepagents/overview), LangChain's LangGraph-based framework for running local LLMs via Ollama.
- **Dynamic Model Discovery (Ollama)**: When `PUFFIN_AGENT_CMD` is set, both model dropdowns (thread and settings) are populated at startup from Ollama's `/api/tags` API instead of showing hardcoded Claude model names. The selected model is persisted to `localStorage`. Without `PUFFIN_AGENT_CMD`, the dropdowns show the standard Claude Opus / Sonnet / Haiku options as before.

### Fixed

- **macOS — "App is Damaged" (Gatekeeper)**: macOS 14 Sonoma and later may refuse to open Puffin with *"Puffin is damaged and can't be opened"* due to a Gatekeeper quarantine flag on downloaded files. README now documents the fix: `xattr -cr /Applications/Puffin.app` clears the flag and only needs to be run once.
- **Metrics Service — Shutdown Race Condition**: Prepared statements (`insertStmt`, `insertPromptStmt`) are now nulled out before the batch timer is stopped during shutdown. This prevents a concurrent timer callback from executing a statement against a closing database connection, which previously caused unhandled `EventEmitter` errors on app quit. A default `error` event handler is also registered to suppress any remaining non-fatal flush errors.
- **Puppeteer Visual Loop — Permission Mode**: The Claude CLI is now invoked with `--permission-mode bypassPermissions` (instead of `acceptEdits`) when a Puppeteer MCP config is active. This prevents permission prompts from stalling the automated feedback loop mid-run.
- **Response Viewer — Scroll Position on Load**: The response area now scrolls to the top when the loading spinner appears, so the spinner is immediately visible regardless of where the user had scrolled previously.

## [3.2.5] - 2026-03-08

### Added

- **Website Edition**: Puffin is now available as a web-based edition, accessible directly from a browser without installing the desktop application.
- **Website Edition — Preview Server**: A built-in static HTTP server (`website-server.js`) serves the project's `dist/` folder on a configurable port (default 5000). Managed automatically via `webserver:start/stop/status/siteMap/openUrl` IPC handlers and `window.puffin.webserver.*` preload bridge. The server starts when the Website Edition flag is enabled and stops on app quit.
- **Installation Packages Include Plugins**: The Windows, macOS, and Linux installation packages now bundle the built-in plugins (stats, memory, outcomes, Excalidraw), so plugins are available immediately after install without a separate setup step.
- **Sprint Rerun**: Archived sprints in the Sprint History panel now have a ↻ Rerun button. Clicking it restores the sprint's stories to `pending`, creates a new active sprint with `planApprovedAt` already set (skipping planning), and reopens the implementation mode selection modal. Existing RIS data is reloaded from the DB so implementation context is preserved. Stuck active sprints with no recorded progress are automatically cleared to avoid blocking the rerun.
- **Tools — snip Integration**: New "Tools" section in project settings with a snip toggle. When enabled, Puffin writes a `PreToolUse` hook into `{projectPath}/.claude/settings.json` so Claude Code pipes Bash output through [snip](https://github.com/edouard-claude/snip) before it reaches the context window, reducing token usage by up to 99% on verbose commands (test runs, git log, etc.). Opt-in by design — the toggle is off by default even if snip is installed. Shows an amber warning with install instructions if snip is not found on PATH.
- **Config Tab — Auto-sync `.claude/` skills and agents**: Opening the Config tab now scans `.claude/skills/*/SKILL.md` and `.claude/agents/*.md` and registers any skills/agents not already in Puffin's plugin list. This makes skills and agents installed directly via Claude Code (outside of Puffin) automatically visible and manageable in the UI.
- **Docs — Installation Guide**: README now includes step-by-step installation instructions for Windows, macOS, and Linux covering Node.js, Claude Code CLI, authentication, and Puffin binary installation, with platform-specific troubleshooting tips.
- **Docs — Prompt Repetition**: Added `docs/PROMPT-REPETITION.md` documenting the CRE prompt-repetition technique based on arxiv 2512.14982, including implementation details and configuration.
- **Scripts — Fix Stuck Sprint**: Added `scripts/fix-stuck-sprint.js` and `scripts/fix-stuck-sprint.py` utility scripts to reset sprints stuck in `planning` or `in-progress` state via direct DB manipulation, useful for recovery without UI access.

### Changed

- **Memory Plugin — Native Claude Memory Reader**: Refactored memory plugin to read Claude Code's native `/memory` entries stored in `.claude/CLAUDE_{branch}.md` files, replacing the previous LLM-powered extraction approach. Simplified IPC handlers to `memory-plugin:list-branches`, `memory-plugin:get-branch-memory`, and `memory-plugin:clear-branch-memory`.
- **Plugin Loader — Packaged Build Detection**: Plugin directory resolution now uses `app.isPackaged` (Electron's official flag) instead of `NODE_ENV !== 'production'`. In packaged builds, built-in plugins are resolved from `app.getAppPath()/plugins` inside the ASAR; in development they remain at the repo root `/plugins`.

### Fixed

- **Sprint View — Empty Stories State**: Sprint view no longer crashes when a sprint has zero linked stories. An empty-state message is shown instead.
- **Build Implementation Prompt — Plain-text Plan Fallback**: `buildStoryImplementationPrompt` now includes a second fallback that surfaces the plain-text `sprint.plan` field (used by rerun sprints) when no structured CRE plan response exists.
- **Local Claude Code Plugin Installation**: Installing a plugin from a local path no longer throws "Local plugin installation not yet supported". Puffin now reads `.claude-plugin/plugin.json` and `skills/{name}/SKILL.md` directly from the filesystem.
- **API Prefill Error (Sonnet 4.6)**: Puffin now handles the `"This model does not support assistant message prefill"` error from `claude-sonnet-4-6`. When `--resume` loads a session whose last message is an assistant turn, the retry logic detects this error and re-submits without `--resume`, starting a fresh session transparently.
- **sendPrompt is_error Handling**: `ClaudeService.sendPrompt()` was returning `{ success: true, response: "API Error: 400 ..." }` when the CLI reported `is_error: true`. It now returns `{ success: false, error: "..." }`, preventing silent JSON parse failures in CRE callers.
- **AskUserQuestion Timeout**: When Claude uses `AskUserQuestion`, the CLI requires a tool result within seconds or it injects an error and rephrases the question as plain text. Puffin now auto-answers with first-option defaults after 25 seconds, ensuring the tool result always arrives in time. The modal shows a countdown bar and pre-selects the first option for each question so users can answer quickly. The timer is cancelled if the user answers manually.
- **Plan File Relocation**: Claude Code now writes sprint plans to `~/.claude/plan/<project-slug>.md` instead of returning them as response text. The `onComplete` handler now falls back to reading the most-recently-modified plan file from `~/.claude/plan/` (touched within the last 10 minutes) when response content is empty. Found plan content is passed to `setSprintPlan` for display in the thread and saved as a timestamped copy in `docs/plans/` inside the project.

## [3.1.2] - 2026-02-25

### Fixed

- **CRE — Handler/Init State Separation**: Split the single `initialized` flag in `src/main/cre/index.js` into two distinct flags: `handlersRegistered` (IPC handlers registered) and `initialized` (ctx + generators ready). Previously, a single flag meant handlers could appear registered before generators were actually constructed, or a failed `initialize()` would leave the module permanently marked as initialized with null generators. The `initialized` flag is now set only after all generators are successfully constructed, allowing safe retry on failure.
- **CRE — Null Generator Guards**: All 11 CRE IPC handlers now guard against `!ctx` or the relevant null generator (`planGenerator`, `risGenerator`, `assertionGenerator`, `codeModel`) and return `{ success: false, error: 'CRE not initialized — open a project first.' }` instead of throwing an uncaught `TypeError` when invoked before a project is opened.
- **CRE — Idempotent Handler Registration**: `registerHandlers()` is now a no-op if called more than once (via `handlersRegistered` guard), preventing duplicate `ipcMain.handle` registrations when `initialize()` is called multiple times across project switches. `registerHandlers` is also exported so `setupIpcHandlers()` in `main.js` can register handlers at startup before any project is opened.

## [3.1.0] - 2026-02-20

### Added

- **Welcome Screen**: New startup screen shown when no project is open. Displays a recent-projects list (up to 10 entries, stored in `~/.puffin/recent-projects.json`) and an "Open Folder…" button. Previously Puffin always required a project path on the command line.
- **Recent Projects**: `src/main/recent-projects.js` manages the recent-projects list — projects are recorded on open, surfaced on the welcome screen, and removable with an ×  button.
- **Response Waiting Overlay**: A spinner and rotating witty phrase (18 phrases) is shown in the response area between prompt submit and the arrival of the first streaming chunk, so the UI is never blank while Claude is thinking.
- **CRE — Prompt Repetition**: Each AI prompt sent through the CRE (`sendCrePrompt`) is optionally repeated before dispatch, giving every token bidirectional attention over the full context. Based on [arxiv 2512.14982](https://arxiv.org/abs/2512.14982). Default on; togglable per-project in Settings → CRE. Config key: `cre.promptRepetition`.
- **CRE — Live Config Propagation**: Saving project settings now immediately calls `cre.updateConfig()` so changes (e.g. prompt repetition) take effect without restarting.

### Changed

- **Rate Limit Events**: "Allowed" rate-limit checks now emit only a subtle `⏱️` icon instead of a full message. Only actual rate-limit events (status ≠ `allowed`) display the type and reset countdown.
- **App Startup Refactor**: Startup flow extracted into `initializeProject()` so the welcome-screen path and the CLI-arg path share the same initialization logic.

### Fixed

- **generate-assertions.js**: Missing closing backtick in `constraints` template literal caused `return` statement and closing brace to be parsed as string content, producing empty prompts.

## [3.0.4] - 2026-02-19

### Fixed

- **Startup crash on auto-archive**: Project failed to load on every restart with "FOREIGN KEY constraint failed" when any completed story (>2 weeks old) had a completion summary. Root cause: `completion_summaries.story_id` FK references `user_stories.id` without `ON DELETE CASCADE`. Both `archive()` and `delete()` in `user-story-repository.js` now explicitly delete from `completion_summaries` before removing the parent story row.

### Added

- **Stats Plugin — Story Metrics**: New story-level metrics view with cost, token, and duration tracking per user story. Pre-aggregated `story_metrics` and `prompt_metrics` tables (migration 011) with auto-maintained trigger for zero-latency aggregation.
- **Stats Plugin — Component Breakdown**: Treemap and chart visualizations for cognitive architecture component usage (Claude Service, CRE, h-DSL, Memory Plugin, Outcomes Plugin).
- **CRE — Expanded Assertion Types**: Additional assertion patterns for function signatures including class methods, object methods, and ES module exports (`function_signature`, `export_exists` improvements).
- **CRE — IPC Handler Early Registration**: Handlers registered before full initialization so callers receive proper errors instead of "no handler registered" during startup race conditions.
- **Session — Rate Limit Events**: `rate_limit_event` stream messages now surfaced in the response viewer with human-readable status, rate limit type, and reset countdown.
- **UI — Clear Prompt Button**: Dedicated X button to clear the textarea without starting a new thread. New thread button no longer clears the prompt text, preserving typed content across thread resets.
- **UI — Emoji Line Breaks**: Response viewer post-processes rendered markdown to add line breaks after emojis followed by capital letters, preventing run-on text in AI responses.

### Changed

- **Stats Plugin**: Improved security (parameterized queries throughout), data consistency fixes for component metrics, enhanced UI styling.

## [3.0.0] - 2026-02-08

### Added

- **Central Reasoning Engine (CRE)**: Core component for transforming user stories into deterministic implementation instructions
  - **Implementation Plans**: Generate ordered plans specifying story implementation sequence, branch strategy, and dependencies
  - **Ready-to-Implement Specifications (RIS)**: Concise, directive specifications that tell Claude exactly what to implement
  - **Code Model**: Hybrid DSL (h-DSL) instance tracking codebase structure, updated as feedback loop after each implementation
  - **Inspection Assertions**: Testable assertions for each plan item to verify implementation correctness
  - **Plan Iteration**: Support for user review, questions, and plan refinement before approval
  - **Two-Stage Planning**: Plan generation followed by RIS generation replaces single planning phase
  - **h-DSL Schema Management**: Evolving schema where every element maps to h-M3 primitives (TERM, PROSE, SLOT, RELATION, STATE, TRANSITION, OUTCOME, ALIGNMENT)
  - **CRE Introspector**: Examines code changes post-implementation and updates Code Model
  - **MCP Integration**: h-DSL engine accessible via Model Context Protocol for Claude CLI
  - **Explore Mode**: Enhanced code exploration using h-DSL tools for architectural understanding

- **Excalidraw Plugin**: Professional diagramming tool with AI-powered diagram generation
  - **Visual Editor**: Hand-drawn aesthetic with 10+ element types (rectangles, ellipses, diamonds, arrows, lines, frames, freedraw, text, images)
  - **AI Diagram Generation**: Generate diagrams from markdown documentation using Claude
    - Architecture diagrams (boxes, arrows, labels)
    - Sequence diagrams (lifelines, messages)
    - Flowcharts (decision nodes, flow arrows)
    - Component diagrams
  - **Document-to-Diagram Pipeline**: Select markdown files from docs directory, specify diagram type, Claude generates Excalidraw elements
  - **Multiple Export Formats**: PNG, SVG, and JSON export capabilities
  - **Industry-Standard Format**: `.excalidraw` files compatible with Excalidraw web app
  - **Storage Layer**: CRUD operations for designs in `.puffin/excalidraw-designs/`
  - **Thumbnail Previews**: 128x128 thumbnail generation for design list
  - **Theme Support**: Light/dark theme toggle
  - **Keyboard Shortcuts**: Ctrl+S (save), Ctrl+N (new), Ctrl+E (export)

- **Memory Plugin**: Automated extraction and injection of domain knowledge from conversations
  - **Branch Memory Files**: Categorized knowledge in `.puffin/memory/branches/` with four sections: Facts, Architectural Decisions, Conventions, Bug Patterns
  - **LLM-Powered Extraction**: Analyzes conversation histories to extract cross-cutting technical knowledge
  - **Automatic Maintenance**: Background memorization of unmemoized branches on startup (up to 20 branches per run)
  - **Memory Evolution**: Merges new knowledge into existing memory, deduplicates, resolves conflicts
  - **CLAUDE.md Injection**: Branch memory automatically injected into branch-specific context files
  - **Manual Triggers**: IPC handler for user-initiated memorization
  - **Fallback Detection**: Skips branches with insufficient substantive content
  - **Retry Logic**: Exponential backoff for history service availability

- **Outcome Lifecycle Plugin**: Track and manage development outcomes across sprint phases
  - **Outcome States**: Planned, In-Progress, Completed, Failed, Cancelled
  - **Sprint Phase Integration**: Outcomes linked to planning, implementation, code review, and bug fix phases
  - **Outcome Persistence**: SQLite storage with full CRUD operations
  - **Status Tracking**: Real-time progress monitoring in Sprint panel
  - **Statistics**: Cost, duration, and outcome metrics for sprint completion summaries

- **h-DSL Viewer Plugin**: Visualize code model structure and dependencies
  - **Graph Viewport**: Interactive visualization of h-DSL Code Model
  - **Annotation Loading**: Display h-M3 primitive mappings for schema elements
  - **Dependency Tracing**: Follow import and call relationships through codebase
  - **Architecture Navigation**: Browse module structure and artifact relationships

- **Bidirectional Streaming**: Enhanced Claude CLI integration for interactive question support
  - **Stream-JSON Format**: `--input-format stream-json --output-format stream-json`
  - **Tool Suppression**: `--disallowedTools AskUserQuestion` for automated workflows
  - **Session Resume**: Continue conversations via `--resume <sessionId>`
  - **Structured Output**: JSON schema support for deterministic AI responses

- **Branch Memory System**: Project-specific knowledge extraction and context preservation
  - **Template System**: `branch-template.js` for parsing and generating branch memory files
  - **CLAUDE.md Integration**: Branch memory automatically included in branch-specific context
  - **Sanitized Filenames**: Handles special characters in branch names
  - **Timestamp Tracking**: Last updated timestamps for memory freshness

- **Enhanced Sprint Implementation**:
  - **Derive User Stories Button**: Dedicated button in prompt area for story derivation workflow
  - **Completion Summary**: Capture and display summary on story completion with AI-generated descriptions
  - **Orchestration Improvements**: Better handling of story status transitions and active story tracking

- **Documentation & Summaries**: Comprehensive plugin documentation
  - **Calendar Plugin**: Event scheduling and reminder system documentation
  - **GitHub Plugin**: GitHub integration capabilities summary
  - **Memory Plugin**: Lifecycle and technical architecture documentation
  - **CRE Process**: End-to-end Central Reasoning Engine workflow documentation
  - **Excalidraw Plugin**: Implementation plan and user guide

- **JSON Schema Integration**: Structured output support for CRE operations
  - **Schema Files**: Dedicated schemas for plans, RIS, assertions, and other CRE outputs
  - **Validation**: Structured validation of AI-generated outputs
  - **Deterministic Responses**: Consistent output format across automated workflows

- **RLM Document Plugin**: Full implementation of Recursive Language Model document processing
  - **Document Picker**: Select and load documents for RLM processing with file browser integration
  - **Query Panel**: Execute RLM queries with streaming results and progress indicators
  - **Chunk Inspector**: Visualize how documents are chunked for processing
  - **Results Tree**: Hierarchical view of aggregated RLM query results
  - **Session State Management**: Track RLM sessions with persistence across restarts
  - **Export Controls**: Export processed results in multiple formats

- **Claude Code Integration**: Direct integration with Claude Code CLI for RLM orchestration
  - **Claude Code Client**: Manages communication with Claude Code subprocess
  - **RLM Orchestrator**: Coordinates chunking, querying, and result aggregation
  - **Result Aggregator**: Combines results from multiple chunk queries
  - **Session State**: Tracks query progress and maintains session context

- **RLM Backend Libraries**:
  - `chunk-strategy.js`: Smart document chunking with configurable strategies
  - `claude-code-client.js`: Claude Code CLI subprocess management
  - `rlm-orchestrator.js`: Query orchestration and workflow management
  - `result-aggregator.js`: Multi-chunk result combination
  - `session-state.js`: Persistent session tracking
  - `session-store.js`: SQLite-backed session storage
  - `validators.js`: Input validation for RLM operations
  - `schemas.js`: Data schemas for RLM structures
  - `semaphore.js`: Concurrency control for parallel queries
  - `exporters.js`: Result export in JSON, Markdown, and text formats
  - `repl-manager.js`: Python REPL management for RLM scripts
  - `python-detector.js`: Python environment detection
  - `config.js`: RLM plugin configuration management

- **RLM UI Components**:
  - `RLMDocumentView.js`: Main view orchestrating all RLM components
  - `DocumentPicker.js`: File selection with recent files and favorites
  - `QueryPanel.js`: Query input with streaming response display
  - `ChunkInspector.js`: Visual chunk boundary inspection
  - `ResultsTree.js`: Collapsible tree view of aggregated results
  - `ExportControls.js`: Export format selection and download
  - `SessionStatusDisplay.js`: Real-time session progress tracking
  - `Toast.js`: Notification system for RLM operations

- **RLM Python Scripts**: `rlm_repl.py` for local RLM processing via Python REPL

- **Claude Code Skill**: `/rlm` skill for running RLM-style loops directly in Claude Code
  - Persistent Python REPL for state management
  - Sub-agent integration via `rlm-subcall` for chunk queries

- **Comprehensive Test Suite**: 8 new test files covering all RLM components
  - `rlm-chunk-strategy.test.js`
  - `rlm-exporters.test.js`
  - `rlm-plugin-integration.test.js`
  - `rlm-repl-integration.test.js`
  - `rlm-schemas.test.js`
  - `rlm-semaphore.test.js`
  - `rlm-session-store.test.js`
  - `rlm-validators.test.js`

### Changed

- **Planning Workflow**: Two-stage process (Plan → RIS) replaces single planning phase
- **Sprint Execution**: CRE generates implementation plans with inspection assertions before implementation begins
- **Code Model Maintenance**: Incremental updates after each implementation cycle via CRE Introspector
- **Claude Context**: Enhanced with branch memory, h-DSL Code Model snippets, and RIS specifications
- **Document Editor Plugin**: Refactored to use project-level storage instead of global storage
- **Plugin Architecture**: Enhanced IPC channels for RLM-specific operations and CRE integration
- **Designer Plugin**: Deprecated in favor of Excalidraw plugin (moved to `designer-plugin.disabled/`)
- **Git Panel**: Enhanced branch switching and cross-branch merge workflows

### Fixed

- **Renderer Crash**: Resolved multiple crashes caused by state synchronization issues between main and renderer processes
- **CRE Assertion Persistence**: Fixed dual-storage sync issues between `inspection_assertions` table and `user_stories.inspection_assertions` column
- **Excalidraw Scene Serialization**: Fixed `collaborators` Map→object conversion breaking Excalidraw's internal operations
- **Excalidraw Infinite Render Loop**: Fixed `boundElements` manual assignment causing stack overflow
- **Git Panel Branch Return**: Fixed cross-branch merge to return to original branch after completion
- **Story Status Persistence**: Orchestration story now properly clears "IMPLEMENTING" status on completion
- **Completion Summary Generation**: Fixed empty summaries by correctly accessing Claude response structure
- **Process Cleanup**: Windows process tree termination now uses `taskkill` to properly stop CLI subprocesses
- **JSON CLI Arguments**: Fixed shell:true breaking JSON schema arguments on Windows (cmd.exe quote mangling)
- **Tool Exploration in Structured Output**: Fixed assertion generation burning all turns on codebase exploration instead of producing JSON
- **User Story Persistence**: DELETE and UPDATE operations now correctly persist to database

### Documentation

- **Central Reasoning Engine**: Complete CRE specification (`CENTRAL_REASONING_ENGINE.md`)
- **CRE Detailed Design**: Technical architecture and implementation guide (`CRE_DETAILED_DESIGN.md`)
- **CRE Test Suite**: Comprehensive test scenarios and validation criteria (`CRE_TEST_SUITE.md`)
- **h-DSL Engine**: Hybrid DSL code model bootstrap utility specification (`h-dsl-engine.md`)
- **h-DSL Research**: h-DSL and h-M3 v2 theoretical foundations (`h-DSL.md`, `h-m3-v2.md`)
- **Excalidraw Plugin**: Implementation plan and user guide (`excalidraw-plugin-implementation-plan.md`, `excalidraw-plugin-summary.md`, `EXCALIDRAW.md`)
- **Plugin Summaries**: Calendar, GitHub, Memory, and Outcomes plugin documentation
- **Architecture Report**: Comprehensive architecture analysis and recommendations (`ARCHITECTURE_REPORT.md`)
- **3CLI Features**: Claude Code CLI feature catalog (`3CLI_FEATURES.md`)
- **Branch Memory**: Template system and injection mechanics documentation
- **RLM Plugin Architecture Design**: Comprehensive design document in `docs/plans/`
- **RLM Routing Specification**: Document routing strategies for multi-file RLM
- **RLM Plugin Review**: Analysis and recommendations for RLM implementation
- **RLM History Index Generator Spec**: Specification for history indexing
- **Architecture Decision Records**: ADRs for key architectural choices
- **Memory Plugin Architecture**: Reorganized memory plugin design specs into `docs/plugin-architecture/`
- **User Manual Updates**: Added RLM, CRE, Excalidraw, and Memory plugin documentation sections

### Technical

- **MCP Configuration**: Added `.mcp.json` for Model Context Protocol server integration
- **h-DSL Configuration**: Added `.hdslrc.json` for h-DSL engine settings
- **Process Lock Management**: All CLI-spawning functions now use process locks to prevent concurrent execution
- **Windows Process Tree Termination**: Platform-specific process cleanup using `taskkill /T /F`
- **Excalidraw React Bundle**: Pre-built esbuild bundle with React components embedded in vanilla JS app
- **Empty MCP Config**: Dynamic creation of tool-restricted MCP configuration for structured output workflows
- **State Persistence Enhancements**: Extended `persistActions` whitelist for new SAM action types
- **Database Schema Evolution**: New tables for `inspection_assertions`, `ris`, and memory storage

### Breaking Changes

- **Designer Plugin Deprecated**: GUI Designer functionality replaced by Excalidraw plugin. Existing designs must be manually recreated in Excalidraw (no migration path from JSON to `.excalidraw` format)
- **Planning Workflow**: Two-stage planning (Plan → RIS) changes user workflow. Old single-stage plans are not automatically migrated
- **Claude Context Structure**: CLAUDE.md files now include CRE Code Model snippets and branch memory. Third-party tools depending on previous structure may need updates

### Credits

- [RLM Skill](https://github.com/brainqub3/claude_code_RLM) by John Adeojo

## [2.14.0] - 2026-01-18

### Added

- **Inline Prompt Markers**: Embed Claude instructions directly within documents using the `/@puffin: ... @/` syntax
  - **Universal marker format**: Works across all file types regardless of programming language
  - **Visual highlighting**: Markers displayed with yellow gradient background, dashed border, and 🐧 icon
  - **Multiline support**: Instructions can span multiple lines for complex prompts
  - **Holistic processing**: Claude reads all markers and processes them as a cohesive whole
  - **Insert Marker button**: 🐧 toolbar button to insert marker at cursor position
  - **Context menu integration**: Right-click to insert marker or wrap selected text
  - **Keyboard shortcut**: Ctrl+M (Cmd+M on Mac) for quick marker insertion
  - **Selection wrapping**: Selected text automatically becomes the marker content
  - **Clean Markers button**: 🧹 toolbar button to remove all markers from document
  - **Confirmation dialog**: Prevents accidental marker deletion with count display
  - **Auto-save integration**: Changes trigger auto-save when markers are cleaned
  - **Toast notifications**: Feedback when markers are inserted or cleaned

- **MarkerUtils service**: Utility functions for marker detection and manipulation
  - `findAllMarkers()`: Extract all markers with positions and content
  - `createMarker()`: Generate properly formatted marker syntax
  - `removeAllMarkers()`: Strip all markers from content
  - `countMarkers()`: Optimized marker counting
  - `highlightMarkersInHtml()`: Apply visual highlighting with XSS protection

### Changed

- **Document Editor toolbar**: Added Insert Marker and Clean Markers buttons to toolbar-left section
- **Syntax highlighting**: Marker highlighting now applied on top of language-specific highlighting

### Security

- **XSS protection**: Marker content is escaped before HTML insertion to prevent script injection

## [2.13.0] - 2026-01-17

### Added

- **Document Editor Plugin**: New plugin for editing text files with syntax highlighting and AI assistance
  - Edit text files directly within Puffin (supports .md, .txt, .js, .ts, .html, .css, .json, .py, and 20+ file types)
  - Syntax highlighting powered by highlight.js with support for 190+ languages
  - Line numbers synchronized with editor scrolling
  - Auto-save with configurable 1.5-second debounce (toggle on/off)
  - Visual save indicator (saved/unsaved/saving states)
  - External file change detection with reload prompts
  - Recent files tracking for quick access
  - Native file dialogs for create/open operations
  - Prompt input area for future AI assistance integration (stubbed)
  - Document Editor tab added to navigation bar (📝 icon)

## [2.12.1] - 2026-01-17

### Added

- **Prompt Template Plugin**: New plugin for managing reusable prompt templates
  - Create, edit, and delete prompt templates
  - Search templates by title or content
  - Copy template content to clipboard with one click
  - Templates stored in `.puffin/prompt-templates.json` (project-specific)
  - Default templates for common use cases (code review, bug fixes, etc.)
  - Templates tab added to navigation bar (📝 icon)

## [2.12.0] - 2026-01-17

### Added

- **Automated Sprint Implementation**: Let Claude orchestrate entire sprints autonomously
  - **Implementation Mode Selection**: After plan approval, choose between automated (Claude orchestrates everything) or human-controlled (manual story-by-story)
  - **Intelligent Story Ordering**: Claude analyzes dependencies and determines optimal implementation sequence
  - **Branch Assignment**: Each story automatically assigned to appropriate branch (UI, Backend, Fullstack, Plugin)
  - **Orchestration Plan Review**: Preview the complete implementation plan before Claude starts
  - **Sequential Sessions**: Each story implemented in a separate, clean Claude session
  - **Acceptance Criteria Validation**: Automatic verification after each story implementation
  - **Code Review Phase**: Automated code review identifies issues after all stories complete
  - **Bug Fix Sessions**: Sequential sessions to address each finding from code review
  - **Sprint Completion Summary**: Statistics showing costs, durations, and outcomes
  - **Graceful Interruption**: Pause or stop automated implementation at any point

- **Orchestration Controls**: New UI components for managing automated sprints
  - Pause/Resume buttons for temporary interruption
  - Stop button to switch to human-controlled mode
  - Real-time progress tracking in Sprint panel
  - Phase indicators (Implementation → Review → Bug Fix → Complete)

- **Code Review Integration**: Automated quality checks during sprint execution
  - Findings logged with file location and description
  - Severity levels: Critical, Warning, Info
  - Findings queued for bug fix phase

- **Bug Fix Workflow**: Structured approach to addressing code review findings
  - Each finding gets its own implementation session
  - Status tracking: Pending, Fixing, Fixed, Won't Fix
  - Progress visible in Sprint panel

### Changed

- **Plan Approval Flow**: Now shows implementation mode selection modal instead of immediately starting
- **Sprint Panel**: Enhanced to show orchestration status and controls during automated execution
- **Sprint Close**: Summary now includes automation statistics when applicable

### Fixed

- **Generated Claude.md**: Added to `.gitignore` as it's dynamically generated per branch

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
