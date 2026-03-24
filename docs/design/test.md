# Puffin Nightly Code Review Specification

## Overview

This specification defines automated and manual code review criteria for Puffin, an Electron-based GUI application managing Claude Code CLI (3CLI) workflows. Code reviews run nightly against all uncommitted changes and recent commits.

## 1. IPC Communication & Message Passing

### Criteria
- All IPC handlers registered in `setupIpcHandlers()` before window creation
- Handler naming follows `namespace:actionName` pattern (e.g., `toast-history:getAll`, `state:saveGuiDefinition`)
- All responses use standardized envelope: `{ success: boolean, data?: any, error?: string }`
- All handlers check `result.success` before using `result.data` (missing checks = silent failures)
- Error responses always include descriptive error messages
- Renderer never directly accesses main process state; always goes through IPC
- Fire-and-forget patterns use `ipcMain.on()` + `send()`, not `handle()`
- Request-response patterns use `ipcMain.handle()`, not on/send

### Red Flags
- Response envelopes missing `success` field
- Handlers returning raw data without envelope
- `result.data` accessed without null check
- IPC handler logic running after `createWindow()` (initialization race)
- Case mismatches in channel names between main and renderer

## 2. SAM State Management & Action Persistence

### Criteria
- All state mutations dispatched through SAM actions, never direct mutations
- Acceptors enforce business rules and prevent invalid state transitions
- Async handlers use guard flags (e.g., `isProcessing`) to prevent re-entry
- Pending flags cleared ONLY via model actions, never on transient state copy
- All action types needing DB persistence registered in BOTH:
  - `persistActions` whitelist array (state-persistence.js line 117-141)
  - Persistence handler condition block (state-persistence.js line 160+)
- Sprint status auto-reset from 'planning' to 'created' in INITIALIZE acceptor
- New story IDs use `uuidv4()`, never AI-generated sequential IDs
- `activeImplementationStory` cleared when story status becomes 'completed'

### Red Flags
- Direct mutations like `this.state.property = value` in handlers
- Missing from `persistActions` whitelist but present in handler condition
- Pending flags not cleared, leaving UI in loading state indefinitely
- Re-entry conditions on async operations without guard flags
- Assertion IDs colliding due to AI-generated sequential numbering

## 3. Security: XSS, Injection & Path Traversal

### Criteria
- All user-provided text rendered in DOM escaped with `escapeHtml()` or `escapeAttr()`
- No `innerHTML` assignments without sanitization
- File paths normalized with `path.resolve()` then validated with `.startsWith()` against base directory
- Temp file operations validate paths are within temp directory with path separator check
- IPC inputs validated/sanitized before use in file ops or DB queries
- No command injection via `spawn()` — use array args, never shell-interpolated strings
- Windows `shell: true` spawning detects native `.exe` and skips shell wrapper when possible
- Tool disabling for untrusted AI responses (e.g., assertion generation with `disableTools: true`)
- No shell escaping workarounds (`--no-verify`, `--no-gpg-sign`)

### Red Flags
- String concatenation in file paths without `path.resolve()`
- `.startsWith()` checks without normalized `path.resolve()` first
- `innerHTML` assignment from user input
- Missing `escapeHtml()` on text content or `escapeAttr()` on attributes
- Process spawning with `shell: true` and string interpolation in args
- Tools enabled for AI-generated code review/assertion content

## 4. Database Integrity & Migrations

### Criteria
- All foreign keys include `ON DELETE CASCADE` or explicit cleanup before delete
- Migrations checked: schema additions, constraint changes, data transformations
- Unique constraints enforced (e.g., `inspection_assertions.id` must be globally unique)
- Transaction handling for multi-step operations (e.g., archive story + delete summaries)
- Database reads after writes to verify persistence (especially after CRE operations)
- Async DB reads in `loadUserStories()` sync in-memory sprint stories with fresh DB data
- Migration order preserved and never manually reversed
- Completion summaries auto-logged in `showToast()`, not at call sites

### Red Flags
- Foreign key constraints without cascade or manual cleanup
- Duplicate ID generation causing UNIQUE constraint violations
- State not refreshed from DB after write operations
- Implicit reliance on auto-persistence without explicit DB calls
- Missing FOREIGN KEY CASCADE on `completion_summaries.story_id`

## 5. Plugin Architecture & Storage Delegation

### Criteria
- Plugins never implement duplicate file I/O — delegate to core IPC handlers
- All shared services (e.g., toast history) centralized in single implementation
- Plugin lifecycle: registration in plugins/ → ipcMain handler setup → storage via core IPC
- Plugin data persisted through core `state:` IPC handlers, not custom file operations
- Modal types registered in `componentManagedModals` list in modal-manager.js
- Unregistered modals show 'Loading...' and never render
- Plugin cleanup on unload: remove IPC listeners, clear state, cancel pending operations

### Red Flags
- Duplicate storage implementations in plugins and core
- Plugin directly writing to puffin state without IPC
- Modals added without registration in modal-manager.js
- Missing plugin lifecycle: registration without teardown
- Plugin data not synced when parent state updates

## 6. Error Handling & Promise Chains

### Criteria
- All promises have `.catch()` or try/await/catch block
- Unhandled rejections logged before returning graceful error to user
- Error-prone operations (IPC, file I/O, API calls) wrapped in try/catch
- Async handlers clear pending flags on error, not just success path
- Claude CLI process errors logged with full stderr output
- Graceful degradation when optional services fail (e.g., metrics non-fatal)
- Error messages user-friendly; avoid stack traces in UI

### Red Flags
- Floating promises without catch
- Pending flags only cleared on success path
- Missing try/catch around IPC or file operations
- Stack traces exposed to user in toast messages
- Unhandled promise rejections in background tasks

## 7. Memory Management & Event Listener Cleanup

### Criteria
- Event listeners registered in `init()` / constructor removed in `destroy()` / cleanup
- Timers (`setTimeout`, `setInterval`) cleared in component teardown
- Circular references avoided (e.g., component → service → component)
- Metrics service singleton cleared via `shutdownMetricsService()`
- No memory leaks from cached promises or memoized values
- Event delegation preferred over individual listeners where applicable
- WeakMap used for private metadata on objects

### Red Flags
- Event listeners added without corresponding removal
- Timers set but not cleared
- Components holding references to destroyed components
- Cached data never invalidated
- Singleton services never reset

## 8. Claude Service Integration & Metrics

### Criteria
- Five CLI callers: `submit()` (interactive), `sendPrompt()`, `deriveStories()`, `generateTitle()`, `generateInspectionAssertions()`
- Bidirectional streaming: `--input-format stream-json --output-format stream-json`
- Tool exploration disabled for untrusted content (assertion generation, refinement without codebase context)
- Process tree killed on cancel: `taskkill /pid /T /F` on Windows, SIGTERM on Unix
- Metrics recorded: component, operation, event_type, token counts, cost, duration
- MetricsService batches writes (50 events or 5min flush)
- `metricsComponent`/`metricsOperation` passed through call chain to `sendPrompt()`
- h-DSL tool server timing logged to stderr: `[HDSL-METRICS] tool=X duration=Yms`

### Red Flags
- Tools enabled in one-shot CLI calls (no MCP servers)
- Process not fully killed on Windows (shell wrapper remains)
- Metrics recording missing in instrumented paths
- Tool result mismatch with response format (e.g., tool JSON vs sendPrompt() { success, response })
- Batch metrics writes not flushed on shutdown

## 9. UI Components & State Synchronization

### Criteria
- Modal width overrides use `.modal:has(.classname)` CSS pattern
- Component state synchronized from model after DB refresh
- Empty array checks use `.length > 0`, not truthiness ([] is truthy)
- Assertion lookup order: DB first, then fallback to in-memory sprint stories
- Code review stats recalculated from fresh DB fetch, not stale in-memory data
- RIS availability checked via `cre:list-ris-story-ids` IPC querying `ris` DB table
- User story status 'completed' (not 'implemented') per naming convention
- Toast records: id (unique), timestamp, message, type, optional metadata

### Red Flags
- Modal width hardcoded in component styles
- Component state not refreshed after DB updates
- Truthiness checks on potentially empty arrays
- Assertion counts showing 0/0/0/0 (indicates stale/missing data)
- RIS badges disappearing on restart (indicating ephemeral in-memory storage)

## 10. File Operations & Resource Limits

### Criteria
- Temp file operations use `path.resolve()` + `.startsWith()` validation
- File size limits enforced as module-level constants: `MAX_IMAGE_SIZE` (50MB), `MAX_NOTES_PER_DAY` (5)
- Limits enforced at backend (defense-in-depth), not just frontend
- Excalidraw bundle rebuilt after entry point changes (`npm run build:excalidraw`)
- Excalidraw `collaborators` Map stripped before JSON serialization
- Excalidraw `boundElements` never set manually (let framework compute)
- Excalidraw `containerId` preserved on text elements for label binding
- Diagram response parsing excludes internal Excalidraw properties

### Red Flags
- File paths not validated before use
- Resource limits enforced only in UI (frontend)
- Excalidraw state mutated with internal properties
- Missing `containerId` in text elements
- Bundle out of sync after code changes

## 11. Performance & Code Quality

### Criteria
- No N+1 database queries (e.g., loop loading stories individually)
- Unnecessary re-renders minimized (use keys in loops, memoization for expensive calcs)
- Bundle size monitored; code splitting used for large plugins
- Assertion validation with ID collision detection (always use `uuidv4()`, ignore AI IDs)
- Completion summary fallback: `result.response || result.content || ''`
- Assertion type normalization: `.toUpperCase()` to match evaluator map keys
- Code duplication eliminated (consolidate duplicate toast history, state persistence)
- No pre-mature abstractions; keep related logic together

### Red Flags
- Loop executing IPC/DB calls per item
- Component renders on every parent update (missing key or memo)
- Bundle size growing without justification
- Assertion types mismatched (lowercase vs UPPERCASE)
- Empty results due to fallback logic checking `.content` instead of `.response`

---

## Automated Review Output Format

Nightly automated reviews generate documents in `docs/` directory:

```
docs/ipc-2026-03-24.md
docs/sam-2026-03-24.md
docs/security-2026-03-24.md
docs/database-2026-03-24.md
docs/plugins-2026-03-24.md
docs/errors-2026-03-24.md
docs/memory-2026-03-24.md
docs/claude-service-2026-03-24.md
docs/ui-components-2026-03-24.md
docs/file-operations-2026-03-24.md
docs/performance-2026-03-24.md
```

Each document includes:
- Issues found (organized by confidence score >= 80)
- File locations and line numbers
- Guideline references
- Suggested fixes
- Summary statistics (critical/important/info counts)