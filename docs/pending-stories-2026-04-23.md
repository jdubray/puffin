# Pending Stories — 2026-04-23 (Reviewed)

Extracted from `.puffin/puffin.db`. All 8 stories have status **pending**.  
These stories form the **Nightly Code Review** sprint.

**Reviewed and improved:** RIS regenerated from scratch; implementation assertions added for all 8 stories.

---

## Shared Architecture

All 8 review services follow the same structural pattern:

```
src/main/review/
  <name>-review.js       ← static analyser class
  review-runner.js       ← orchestrates all reviewers (Story 3)
  review-reporter.js     ← markdown output helper (Story 3)
```

**Finding schema** (output of every `run()` call):
```js
{
  rule: String,          // e.g. 'DB_NO_CASCADE'
  description: String,   // human-readable explanation
  file: String,          // relative path
  line: Number,          // 1-based
  confidence: Number,    // 0–100
  severity: 'critical' | 'important' | 'info'
}
```

**IPC envelope** (all review channels):
```js
// request:  review:run<Name>  { projectPath }
// response: { success: true, findings: Finding[], reportPath: String }
//           { success: false, error: String }
```

**Confidence thresholds:**
- `>= 90` → **critical** (definitely wrong, must fix)
- `80–89` → **important** (likely wrong, should fix)
- `< 80` → **info** (possible issue, needs human judgement)

---

## Story 1 — Database Integrity Review

**ID:** `140af3da-86be-4c9b-b632-af7fa7d18a98`  
**Status:** pending

### Description
As a developer, I want the nightly review to audit database operations so that data loss and constraint violation bugs are detected automatically.

### Acceptance Criteria (improved)
- Review scans all migration files for foreign keys missing `ON DELETE CASCADE` or an explicit `ON DELETE RESTRICT`/cleanup comment
- Review detects `DELETE FROM` statements in repository files that lack a prior `DELETE FROM` on dependent tables (no cascade)
- Review flags multi-step DB operations (multiple `db.run`/`db.prepare` calls in one function) that are not wrapped in a transaction
- Review detects repository methods that write to the DB but do not subsequently reload in-memory state or call a refresh IPC handler
- Review checks that `INSERT` operations into tables with a `UNIQUE` constraint do not reuse caller-supplied IDs (must generate with `uuidv4()`)
- Every finding includes: rule ID, file path, line number, confidence score
- Findings written to `docs/database-YYYY-MM-DD.md`

> **Improvement note:** Removed references to specific past bugs (`completion_summaries.story_id`, `inspection_assertions.id`) — those are historical examples, not rules. Rules are now general patterns that would have caught those bugs.

### RIS

**Scope:** `src/main/database/migrations/*.js`, `src/main/database/repositories/*.js`, `src/main/services/*.js`

**Class:** `DatabaseIntegrityReview`

```
constructor(projectPath)
  → resolves migration and repository directories

run() → Finding[]
  → runForeignKeyCascadeCheck()      scans migration CREATE TABLE statements
  → runOrphanDeleteCheck()           scans repository delete() methods
  → runTransactionCheck()            scans service/repo functions for multi-step writes
  → runStateRefreshCheck()           scans IPC handlers for post-write refresh calls
  → runUniqueConstraintIdCheck()     scans INSERT helpers for caller-supplied ID reuse

generateReport(findings, date) → String
  → writes docs/database-YYYY-MM-DD.md, returns path
```

**Key implementation notes:**
- Parse migration files with regex: `REFERENCES \w+ \(\w+\)` without trailing `ON DELETE` clause → `DB_FK_NO_CASCADE`
- Detect paired `DELETE FROM tbl` in repository files: if `DELETE FROM user_stories` exists but no `DELETE FROM completion_summaries` or `completion_summaries` has no CASCADE in schema → `DB_ORPHAN_DELETE`
- Transaction check: function body has `>= 2` calls to `db.run(` / `db.prepare(` / `stmt.run(` with no `db.transaction(` wrapper → `DB_NO_TRANSACTION`
- State refresh check: IPC handler body has `db.run(` / `stmt.run(` but no subsequent `loadUserStories(` / `ipcRenderer.send(` / `win.webContents.send(` → `DB_NO_REFRESH` (confidence 80, since pattern is broad)
- UUID check: `INSERT` helper that reads `id` from the caller argument without calling `uuidv4()` → `DB_REUSED_ID` (confidence 90)

**IPC channel:** `review:runDatabaseIntegrity`  
**Registered in:** `src/main/ipc-handlers.js` (or `src/main/review/ipc-review-handlers.js` if extracted)

### Implementation Assertions (8)

| # | Type | Target | Detail |
|---|------|--------|--------|
| 1 | `file_exists` | `src/main/review/database-integrity-review.js` | Analyser module exists |
| 2 | `export_exists` | `DatabaseIntegrityReview` | Default or named export |
| 3 | `function_signature` | `run` | `run()` returns an array of findings |
| 4 | `function_signature` | `runForeignKeyCascadeCheck` | FK cascade rule implemented |
| 5 | `function_signature` | `runTransactionCheck` | Multi-step transaction rule implemented |
| 6 | `function_signature` | `generateReport` | Writes markdown and returns file path |
| 7 | `file_contains` | `src/main/ipc-handlers.js` | String `review:runDatabaseIntegrity` present |
| 8 | `pattern_match` | `src/main/review/database-integrity-review.js` | JSDoc on all public methods (`/** @`) |

---

## Story 2 — SAM State Management Review

**ID:** `322562ed-ab61-4a3a-ac78-c2ae5b611d81`  
**Status:** pending

### Description
As a developer, I want the nightly review to audit SAM pattern compliance so that state corruption and persistence bugs are detected early.

### Acceptance Criteria (improved)
- Review detects direct mutation of `this.state.*` inside SAM action handlers (should dispatch, not mutate)
- Review verifies that every string appearing in `persistActions` whitelist also appears in the handler condition block, and vice versa (bidirectional sync check)
- Review checks that async IPC handlers guarded by a `pending` or `isLoading` flag clear that flag on ALL exit paths (normal return AND catch block)
- Review flags `setInterval`/`setTimeout` bodies that dispatch SAM actions without verifying the app is still in a valid state (no guard)
- Review detects ID fields in objects passed to `INSERT` that use caller-supplied values (not `uuidv4()`) where uniqueness is assumed
- Every finding includes: rule ID, file path, line number, confidence score
- Findings written to `docs/sam-YYYY-MM-DD.md`

> **Improvement note:** Removed `inspection_assertions.id` as a named example (that specific bug is fixed). The UUID rule is now a general policy. Added bidirectional whitelist sync (the gotcha was only checking one direction). Added timer-dispatch guard.

### RIS

**Scope:** `src/renderer/sam/*.js`, `src/renderer/lib/state-persistence.js`, `src/renderer/app.js`, `src/main/ipc-handlers.js`

**Class:** `SamStateReview`

```
constructor(projectPath)
run() → Finding[]
  → runDirectMutationCheck()         scans action handlers for this.state.* = 
  → runPersistActionsWhitelistSync() cross-references whitelist ↔ handler block
  → runPendingFlagCheck()            scans async handlers for flag clear in catch
  → runTimerDispatchGuardCheck()     scans setInterval/setTimeout for unguarded dispatch
  → runUniqueIdGenerationCheck()     scans SAM actions that create entities
generateReport(findings, date) → String
```

**Key implementation notes:**
- `runDirectMutationCheck`: regex `this\.state\.\w+ =` inside functions also containing `dispatch(` or action handler signatures → `SAM_DIRECT_MUTATION` (confidence 95)
- `runPersistActionsWhitelistSync`: parse `persistActions` array literal from `state-persistence.js`; parse case strings in the handler switch block; diff both sets → `SAM_WHITELIST_MISSING` or `SAM_HANDLER_MISSING` (confidence 90)
- `runPendingFlagCheck`: find async functions setting `this._isPending = true` or similar; verify a matching `= false` or `= null` exists inside a `catch` block in the same function → `SAM_FLAG_NOT_CLEARED` (confidence 85)
- `runUniqueIdGenerationCheck`: find `{ id: ` or `id: payload` in action creators that write to DB tables with UNIQUE constraint on id column → `SAM_REUSED_ID` (confidence 90)

**IPC channel:** `review:runSamState`  
**Registered in:** `src/main/ipc-handlers.js`

### Implementation Assertions (8)

| # | Type | Target | Detail |
|---|------|--------|--------|
| 1 | `file_exists` | `src/main/review/sam-state-review.js` | Analyser module exists |
| 2 | `export_exists` | `SamStateReview` | Default or named export |
| 3 | `function_signature` | `run` | `run()` returns array of findings |
| 4 | `function_signature` | `runDirectMutationCheck` | Direct mutation rule implemented |
| 5 | `function_signature` | `runPersistActionsWhitelistSync` | Bidirectional whitelist sync implemented |
| 6 | `function_signature` | `runPendingFlagCheck` | Flag-not-cleared rule implemented |
| 7 | `function_signature` | `generateReport` | Writes markdown, returns path |
| 8 | `file_contains` | `src/main/ipc-handlers.js` | String `review:runSamState` present |

---

## Story 3 — Aggregate and Publish Nightly Review Report

**ID:** `4bcc363b-fb34-49cf-884f-e562745018ec`  
**Status:** pending

### Description
As a developer, I want a consolidated summary report from all nightly review stories so that I can see overall code health at a glance after each nightly run.

### Acceptance Criteria (improved)
- `ReviewRunner` executes all enabled review services in parallel and collects their `Finding[]` arrays
- Summary report written to `docs/review-summary-YYYY-MM-DD.md` containing: total finding counts by severity, per-area breakdown (clean vs findings), and relative links to each area report
- Critical issues (confidence ≥ 90) are listed individually in the summary with file + line
- A Puffin toast notification fires when the run completes: "Nightly review complete — N critical, M important issues found"
- Sprint is marked complete only if zero critical findings exist across all areas; otherwise sprint remains open with a note in the summary
- `ReviewRunner` exposes a dry-run mode (`{ dryRun: true }`) that returns findings without writing files (for testing)

> **Improvement note:** "Sprint auto-marked complete" was too aggressive. Now: sprint completion is gated on zero criticals, so a bad night doesn't silently close a broken sprint.

### RIS

**Scope:** Orchestrates all other review services; new files: `src/main/review/review-runner.js`, `src/main/review/review-reporter.js`

**Classes:**

`ReviewRunner`
```
constructor(projectPath, options = {})
  options: { dryRun: Boolean, enabledReviews: String[] }

run() → { findings: Map<String, Finding[]>, summaryPath: String }
  → runs all enabled reviewers in parallel (Promise.all)
  → calls ReviewReporter.writeSummary()
  → calls ReviewReporter.writeAreaReports()
  → emits toast via IPC if not dryRun
  → evaluates sprint completion gate
```

`ReviewReporter`
```
writeSummary(allFindings, date) → String        (path)
writeAreaReport(area, findings, date) → String  (path)
buildToastMessage(allFindings) → String
```

**IPC channel:** `review:runAll`  
**Registered in:** `src/main/ipc-handlers.js`  
**Toast IPC:** `win.webContents.send('toast:show', { message, type: 'info' })` on completion

### Implementation Assertions (9)

| # | Type | Target | Detail |
|---|------|--------|--------|
| 1 | `file_exists` | `src/main/review/review-runner.js` | Orchestrator module exists |
| 2 | `file_exists` | `src/main/review/review-reporter.js` | Reporter module exists |
| 3 | `export_exists` | `ReviewRunner` | Default or named export |
| 4 | `export_exists` | `ReviewReporter` | Default or named export |
| 5 | `function_signature` | `run` | `run()` on ReviewRunner returns findings map + summary path |
| 6 | `function_signature` | `writeSummary` | Writes consolidated markdown |
| 7 | `function_signature` | `buildToastMessage` | Formats toast message string |
| 8 | `file_contains` | `src/main/ipc-handlers.js` | String `review:runAll` present |
| 9 | `pattern_match` | `src/main/review/review-runner.js` | `Promise.all` used for parallel execution |

---

## Story 4 — Security Review

**ID:** `5175256a-03b0-408a-8d37-a4376e3a4cad`  
**Status:** pending

### Description
As a developer, I want the nightly review to audit XSS, injection, and path traversal vulnerabilities so that security issues are caught before they reach production.

### Acceptance Criteria (improved)
- Review detects `innerHTML =` or `innerHTML +=` without a preceding `escapeHtml(` or `escapeAttr(` call on the same value
- Review flags file path construction using string concatenation (`+` or template literals with variables) not wrapped in `path.resolve()` or `path.join()`
- Review detects `spawn(` or `exec(` calls with `shell: true` where the command string includes a variable (injection risk)
- Review checks IPC handler bodies for direct use of `event.sender`, user-supplied args, or `payload.*` in file operations or DB queries without prior validation
- Review flags AI response content passed directly to `updateScene()`, `innerHTML`, or `eval()` without sanitization
- Every finding includes rule ID, file, line, confidence
- Findings written to `docs/security-YYYY-MM-DD.md`

> **Improvement note:** Added `eval()` detection. Reframed "tools enabled for untrusted AI content" as a concrete pattern (AI content → DOM/eval) rather than a vague process flag.

### RIS

**Scope:** `src/renderer/**/*.js`, `src/main/**/*.js`, `plugins/**/*.js`

**Class:** `SecurityReview`

```
constructor(projectPath)
run() → Finding[]
  → runXssCheck()                 innerHTML without sanitization
  → runPathTraversalCheck()       string concatenation in file paths
  → runShellInjectionCheck()      spawn/exec with shell:true + variable args
  → runIpcInputValidationCheck()  IPC args used in file/DB ops without validation
  → runAiContentSanitizationCheck() AI output → DOM/eval without sanitize step
generateReport(findings, date) → String
```

**Key implementation notes:**
- `runXssCheck`: grep `\.innerHTML\s*[+]?=` then scan surrounding lines (±3) for `escapeHtml(` or `escapeAttr(`; if absent → `SEC_XSS_UNSAFE_INNERHTML` (confidence 92)
- `runPathTraversalCheck`: grep `['"\`].*\/.*['"\`]\s*\+\s*\w` or template literals with `${` in path context; if no `path\.resolve\(` or `path\.join\(` wrapping → `SEC_PATH_TRAVERSAL` (confidence 85)
- `runShellInjectionCheck`: grep `shell:\s*true` with `spawn\(` or `exec\(`; check if first arg contains `$\{` or string concat → `SEC_SHELL_INJECTION` (confidence 95)
- `runIpcInputValidationCheck`: parse `ipcMain.handle(` bodies; flag direct `args.` or `payload.` passed to `db.run(`, `fs.readFile(`, `fs.writeFile(` with no validation guard → `SEC_IPC_UNVALIDATED` (confidence 80)

**IPC channel:** `review:runSecurity`

### Implementation Assertions (9)

| # | Type | Target | Detail |
|---|------|--------|--------|
| 1 | `file_exists` | `src/main/review/security-review.js` | Analyser module exists |
| 2 | `export_exists` | `SecurityReview` | Default or named export |
| 3 | `function_signature` | `run` | Returns array of findings |
| 4 | `function_signature` | `runXssCheck` | XSS / innerHTML rule implemented |
| 5 | `function_signature` | `runPathTraversalCheck` | Path traversal rule implemented |
| 6 | `function_signature` | `runShellInjectionCheck` | Shell injection rule implemented |
| 7 | `function_signature` | `runIpcInputValidationCheck` | IPC validation rule implemented |
| 8 | `function_signature` | `generateReport` | Writes markdown, returns path |
| 9 | `file_contains` | `src/main/ipc-handlers.js` | String `review:runSecurity` present |

---

## Story 5 — Claude Service Integration Review

**ID:** `578f291c-610d-4836-8d85-f109c1a67ebc`  
**Status:** pending

### Description
As a developer, I want the nightly review to audit Claude CLI integration so that process management and metrics instrumentation gaps are detected automatically.

### Acceptance Criteria (improved)
- Review checks that every call site of `process.kill(` or `proc.kill(` is paired with a Windows `taskkill /T /F` path (platform-aware kill)
- Review detects `spawn(` calls using `--print` or `maxTurns: 1` (one-shot mode) that still pass `--allowedTools` or do not pass `--disallowedTools` (tools are useless in one-shot, can cause wrong output format)
- Review verifies that every `sendPrompt(` call site passes `metricsComponent` and `metricsOperation` options (no silent metrics gaps)
- Review checks that `MetricsService` shutdown (`shutdownMetricsService(`) is called in the app's `before-quit` or `will-quit` handler
- Review flags `result.content` access on objects returned by `sendPrompt()` — should be `result.response`
- Every finding includes rule ID, file, line, confidence
- Findings written to `docs/claude-service-YYYY-MM-DD.md`

> **Improvement note:** Reframed process-kill check as a platform-pairing check (not just Windows), to future-proof for non-Windows. Made metrics gap check concrete (call-site inspection). Added `result.content` vs `result.response` confusion detection.

### RIS

**Scope:** `src/main/claude-service.js`, `src/main/cre/*.js`, `src/main/main.js`, `src/main/metrics-service.js`

**Class:** `ClaudeServiceReview`

```
constructor(projectPath)
run() → Finding[]
  → runProcessKillCheck()          kill calls without platform branching
  → runOneShotToolsCheck()         one-shot spawns with tools enabled
  → runMetricsInstrumentationCheck() sendPrompt call sites missing metrics opts
  → runMetricsShutdownCheck()      shutdownMetricsService in quit handler
  → runResultFieldCheck()          result.content instead of result.response
generateReport(findings, date) → String
```

**Key implementation notes:**
- `runProcessKillCheck`: grep `\.kill\('SIGTERM'\)` or `process.kill(`; if no adjacent `taskkill` branch → `CLI_KILL_NO_PLATFORM` (confidence 90)
- `runOneShotToolsCheck`: grep `--print` or `maxTurns.*1` in spawn args builder; if `--allowedTools` also present with no `--disallowedTools` → `CLI_ONESHOT_TOOLS_ENABLED` (confidence 88)
- `runMetricsInstrumentationCheck`: grep `sendPrompt(` call sites; parse options object; if `metricsComponent` key absent → `CLI_METRICS_GAP` (confidence 85)
- `runResultFieldCheck`: grep `result\.content` in files that call `sendPrompt(`; if found → `CLI_WRONG_RESULT_FIELD` (confidence 95)

**IPC channel:** `review:runClaudeService`

### Implementation Assertions (8)

| # | Type | Target | Detail |
|---|------|--------|--------|
| 1 | `file_exists` | `src/main/review/claude-service-review.js` | Analyser module exists |
| 2 | `export_exists` | `ClaudeServiceReview` | Default or named export |
| 3 | `function_signature` | `run` | Returns array of findings |
| 4 | `function_signature` | `runProcessKillCheck` | Platform-aware kill rule |
| 5 | `function_signature` | `runOneShotToolsCheck` | One-shot tools rule |
| 6 | `function_signature` | `runMetricsInstrumentationCheck` | Metrics gap rule |
| 7 | `function_signature` | `generateReport` | Writes markdown, returns path |
| 8 | `file_contains` | `src/main/ipc-handlers.js` | String `review:runClaudeService` present |

---

## Story 6 — IPC Communication Review

**ID:** `8a2736c1-dc5d-4d4f-8373-9767881b4a3b`  
**Status:** pending

### Description
As a developer, I want the nightly review to audit IPC handler patterns so that communication bugs and silent failures are caught automatically.

### Acceptance Criteria (improved)
- Review checks all `ipcMain.handle(` channel names match `namespace:actionName` pattern (colon-separated, both parts non-empty, no spaces)
- Review verifies all `ipcMain.handle(` return values are `{ success: Boolean, ... }` objects (not raw values or undefined)
- Review flags renderer-side `invoke(` call sites that access `result.data` or `result.error` without first checking `result.success`
- Review detects `ipcMain.handle(` registrations that occur inside `createWindow()` or after the `BrowserWindow` construction line (must be before)
- Review checks that fire-and-forget notifications use `ipcMain.on(` + `webContents.send(`, not `ipcMain.handle(` (wrong primitive)
- Every finding includes rule ID, file, line, confidence
- Findings written to `docs/ipc-YYYY-MM-DD.md`

> **Improvement note:** Made the "handler timing" check more concrete (relative to `createWindow(` call position). Added fire-and-forget primitive check. Dropped the global "confidence ≥ 80 only" filter — all findings are reported; callers can filter.

### RIS

**Scope:** `src/main/ipc-handlers.js`, `src/main/main.js`, `src/renderer/app.js`, `plugins/**/index.js`

**Class:** `IpcCommunicationReview`

```
constructor(projectPath)
run() → Finding[]
  → runNamingConventionCheck()     channel name format
  → runEnvelopeCheck()             return value shape
  → runSuccessGuardCheck()         renderer invoke without success check
  → runRegistrationTimingCheck()   handlers registered after createWindow
  → runPrimitiveCheck()            fire-and-forget using handle instead of on
generateReport(findings, date) → String
```

**Key implementation notes:**
- `runNamingConventionCheck`: grep all `ipcMain.handle\('([^']+)'` captures; validate regex `^\w+:\w+$`; non-matching → `IPC_BAD_NAME` (confidence 95)
- `runEnvelopeCheck`: parse `ipcMain.handle(` body; if `return` statement is not an object literal with `success` key → `IPC_NO_ENVELOPE` (confidence 85). Heuristic: look for `return {` followed by `success` within 3 lines.
- `runSuccessGuardCheck`: grep `await.*invoke\(` in renderer files; parse following lines for `.data` or `.error` access; if no `if.*\.success` guard in preceding 5 lines → `IPC_NO_SUCCESS_GUARD` (confidence 82)
- `runRegistrationTimingCheck`: in `main.js`, find line numbers of `ipcMain.handle(` calls and `createWindow(` call; handlers after createWindow line → `IPC_LATE_REGISTRATION` (confidence 95)

**IPC channel:** `review:runIpcCommunication`

### Implementation Assertions (9)

| # | Type | Target | Detail |
|---|------|--------|--------|
| 1 | `file_exists` | `src/main/review/ipc-communication-review.js` | Analyser module exists |
| 2 | `export_exists` | `IpcCommunicationReview` | Default or named export |
| 3 | `function_signature` | `run` | Returns array of findings |
| 4 | `function_signature` | `runNamingConventionCheck` | Channel naming rule |
| 5 | `function_signature` | `runEnvelopeCheck` | Response envelope rule |
| 6 | `function_signature` | `runSuccessGuardCheck` | Renderer success-guard rule |
| 7 | `function_signature` | `runRegistrationTimingCheck` | Handler timing rule |
| 8 | `function_signature` | `generateReport` | Writes markdown, returns path |
| 9 | `file_contains` | `src/main/ipc-handlers.js` | String `review:runIpcCommunication` present |

---

## Story 7 — Memory Management Review

**ID:** `bb038e8d-c838-491e-9192-1dc14213024b`  
**Status:** pending

### Description
As a developer, I want the nightly review to audit event listener and timer lifecycle so that memory leaks in plugins and host services are caught before they degrade performance.

### Acceptance Criteria (improved)
- Review detects `addEventListener(` or `ipcMain.on(` / `ipcRenderer.on(` calls inside `init()` or `onActivate()` methods that have no matching `removeEventListener(` or `ipcMain.removeListener(` in the corresponding `destroy()` / `onDeactivate()` method
- Review flags `setInterval(` or `setTimeout(` calls that store the handle in `this.*` but whose `destroy()`/`onDeactivate()` does not call `clearInterval(`/`clearTimeout(` on that same handle
- Review checks that `MetricsService` shutdown (`shutdownMetricsService()`) is called during app quit (cross-check with Story 5 but scoped to memory angle)
- Review detects plugin files where `destroy()` method is absent entirely (plugin lifecycle contract violation)
- Review flags module-level variables (declared outside any class/function) that accumulate references (arrays/maps that grow) with no clear/reset path
- Every finding includes rule ID, file, line, confidence
- Findings written to `docs/memory-YYYY-MM-DD.md`

> **Improvement note:** Made listener-pairing check more precise (init ↔ destroy symmetry). Added "destroy() missing entirely" check (catches the whole class of plugin leaks). Added module-level accumulator detection.

### RIS

**Scope:** `src/main/**/*.js`, `plugins/**/*.js`, `src/renderer/**/*.js`

**Class:** `MemoryManagementReview`

```
constructor(projectPath)
run() → Finding[]
  → runListenerLifecycleCheck()     init/onActivate ↔ destroy/onDeactivate pairing
  → runTimerLifecycleCheck()        setInterval/setTimeout ↔ clear pairing
  → runMetricsShutdownCheck()       shutdownMetricsService in quit handler
  → runDestroyPresenceCheck()       plugin classes without destroy()
  → runModuleLevelAccumulatorCheck() top-level arrays/maps that grow
generateReport(findings, date) → String
```

**Key implementation notes:**
- `runListenerLifecycleCheck`: for each class, collect `addEventListener(` / `ipcMain.on(` inside `init` body; collect `removeEventListener(` / `removeListener(` inside `destroy` body; diff → `MEM_LISTENER_LEAK` (confidence 88)
- `runTimerLifecycleCheck`: grep `this\.\w+ = setInterval\(` or `setTimeout(`; check `destroy` or `onDeactivate` for `clearInterval\(this\.\w+\)` / `clearTimeout(`; missing → `MEM_TIMER_LEAK` (confidence 90)
- `runDestroyPresenceCheck`: for every class in `plugins/` with `init(` or `onActivate(` method, check if `destroy(` method exists; absent → `MEM_NO_DESTROY` (confidence 95)
- `runModuleLevelAccumulatorCheck`: grep module-level `const \w+ = \[\]` or `= new Map(` outside class/function scope; if no `clear(` or `.length = 0` anywhere in file → `MEM_MODULE_ACCUMULATOR` (confidence 75, info only)

**IPC channel:** `review:runMemoryManagement`

### Implementation Assertions (9)

| # | Type | Target | Detail |
|---|------|--------|--------|
| 1 | `file_exists` | `src/main/review/memory-management-review.js` | Analyser module exists |
| 2 | `export_exists` | `MemoryManagementReview` | Default or named export |
| 3 | `function_signature` | `run` | Returns array of findings |
| 4 | `function_signature` | `runListenerLifecycleCheck` | Listener pairing rule |
| 5 | `function_signature` | `runTimerLifecycleCheck` | Timer pairing rule |
| 6 | `function_signature` | `runDestroyPresenceCheck` | Plugin destroy-presence rule |
| 7 | `function_signature` | `generateReport` | Writes markdown, returns path |
| 8 | `file_contains` | `src/main/ipc-handlers.js` | String `review:runMemoryManagement` present |
| 9 | `pattern_match` | `src/main/review/memory-management-review.js` | Uses symmetric pairing logic (init ↔ destroy) |

---

## Story 8 — UI Components Review

**ID:** `c854f39e-a51e-4b16-b847-946464255acb`  
**Status:** pending

### Description
As a developer, I want the nightly review to audit UI component patterns so that state synchronization bugs and display errors are caught automatically.

### Acceptance Criteria (improved)
- Review detects truthy array checks (`if (arr)` or `arr ||`) where `arr` could be an empty array `[]` — should use `arr.length > 0` or `arr?.length`
- Review flags CSS rules that set `width` directly on `.modal` or a modal wrapper class in a component stylesheet (should use `.modal:has(.component-class)` pattern in `components.css`)
- Review checks that all story status comparisons use `=== 'completed'` not `=== 'implemented'` (wrong string literal)
- Review detects `sprint.risMap` access (in-memory ephemeral) used for feature visibility decisions — should use DB query result
- Review flags assertion count displays that read from `sprint.stories[].inspectionAssertions` without a DB fallback when the array is empty
- Every finding includes rule ID, file, line, confidence
- Findings written to `docs/ui-components-YYYY-MM-DD.md`

> **Improvement note:** Made the `risMap` check concrete (not just "ephemeral" but specifically: using `risMap` to conditionally show UI). Made the assertion count check concrete (empty array without DB fallback). Removed vague "detect 0/0/0/0" — replaced with the root-cause pattern.

### RIS

**Scope:** `src/renderer/**/*.js`, `src/renderer/**/*.css`, `plugins/**/renderer/**/*.js`

**Class:** `UiComponentsReview`

```
constructor(projectPath)
run() → Finding[]
  → runTruthyArrayCheck()           if(arr) where arr could be []
  → runModalWidthCheck()            width on .modal in component CSS
  → runStatusStringCheck()          'implemented' used instead of 'completed'
  → runRisMapVisibilityCheck()      sprint.risMap used for UI visibility
  → runAssertionCountFallbackCheck() assertion count without DB fallback
generateReport(findings, date) → String
```

**Key implementation notes:**
- `runTruthyArrayCheck`: grep `if\s*\(\s*\w+\s*\)` in renderer files; cross-ref variable declaration to see if it's typed as array or initialized as `[]`; also grep `\|\|\s*\[\]` patterns on the same variable → `UI_TRUTHY_ARRAY` (confidence 80)
- `runModalWidthCheck`: grep component CSS files for `.modal\s*{` with `width:` rule; or grep for inline `style="width:` on modal elements → `UI_MODAL_WIDTH_HARDCODED` (confidence 90)
- `runStatusStringCheck`: grep all `=== 'implemented'` or `=== "implemented"` → `UI_WRONG_STATUS_STRING` (confidence 98)
- `runRisMapVisibilityCheck`: grep `risMap\[` or `sprint\.risMap` used in conditional render logic → `UI_RISMAP_EPHEMERAL` (confidence 85)
- `runAssertionCountFallbackCheck`: grep `inspectionAssertions` array access used in count/display without adjacent DB fetch or `.length > 0` guard → `UI_ASSERTION_STALE_COUNT` (confidence 78)

**IPC channel:** `review:runUiComponents`

### Implementation Assertions (9)

| # | Type | Target | Detail |
|---|------|--------|--------|
| 1 | `file_exists` | `src/main/review/ui-components-review.js` | Analyser module exists |
| 2 | `export_exists` | `UiComponentsReview` | Default or named export |
| 3 | `function_signature` | `run` | Returns array of findings |
| 4 | `function_signature` | `runTruthyArrayCheck` | Truthy array rule |
| 5 | `function_signature` | `runStatusStringCheck` | Wrong status string rule |
| 6 | `function_signature` | `runRisMapVisibilityCheck` | Ephemeral risMap rule |
| 7 | `function_signature` | `runAssertionCountFallbackCheck` | Stale assertion count rule |
| 8 | `function_signature` | `generateReport` | Writes markdown, returns path |
| 9 | `file_contains` | `src/main/ipc-handlers.js` | String `review:runUiComponents` present |

---

## Summary

| # | Story | Class | IPC Channel | Assertions |
|---|-------|-------|-------------|-----------|
| 1 | Database Integrity Review | `DatabaseIntegrityReview` | `review:runDatabaseIntegrity` | 8 |
| 2 | SAM State Management Review | `SamStateReview` | `review:runSamState` | 8 |
| 3 | Aggregate & Publish Report | `ReviewRunner` + `ReviewReporter` | `review:runAll` | 9 |
| 4 | Security Review | `SecurityReview` | `review:runSecurity` | 9 |
| 5 | Claude Service Integration Review | `ClaudeServiceReview` | `review:runClaudeService` | 8 |
| 6 | IPC Communication Review | `IpcCommunicationReview` | `review:runIpcCommunication` | 9 |
| 7 | Memory Management Review | `MemoryManagementReview` | `review:runMemoryManagement` | 9 |
| 8 | UI Components Review | `UiComponentsReview` | `review:runUiComponents` | 9 |
| 9 | Error Handling Review | `ErrorHandlingReview` | `review:runErrorHandling` | 9 |
| 10 | Preload Bridge Completeness Review | `PreloadBridgeReview` | `review:runPreloadBridge` | 8 |
| 11 | Plugin Manifest & Sandbox Review | `PluginContractReview` | `review:runPluginContract` | 9 |

**Total assertions:** 97 across all 11 stories.

All review services live under `src/main/review/`. Story 3 (`ReviewRunner`) depends on Stories 1, 2, 4–11 being implemented first.

---

## Story 9 — Error Handling Review

**Status:** pending

### Description
As a developer, I want the nightly review to audit error handling patterns so that unhandled promise rejections, swallowed errors, and async anti-patterns are caught before they cause silent failures in production.

### Acceptance Criteria
- Review detects `async` functions (including `ipcMain.handle` bodies) that have no top-level `try-catch` block
- Review flags `.then(` calls with no corresponding `.catch(` on the same promise chain (unhandled rejection)
- Review detects `catch` blocks whose body is empty or contains only a comment — error swallowed silently
- Review flags `await` expressions used inside `.forEach(` callbacks (awaits are no-ops inside forEach; use `for...of` or `Promise.all`)
- Review detects `Promise.all(` calls with no `.catch(` or `try-catch` wrapping (one rejection kills the batch)
- Every finding includes rule ID, file, line, confidence
- Findings written to `docs/error-handling-YYYY-MM-DD.md`

### RIS

**Scope:** `src/main/**/*.js`, `src/renderer/**/*.js`, `plugins/**/*.js`

**Class:** `ErrorHandlingReview`

```
constructor(projectPath)
run() → Finding[]
  → runAsyncNoCatchCheck()         async functions / ipcMain.handle without try-catch
  → runUnhandledThenCheck()        .then() chains without .catch()
  → runSwallowedCatchCheck()       catch blocks with empty or comment-only body
  → runAwaitInForEachCheck()       await inside .forEach() callback
  → runPromiseAllNoCatchCheck()    Promise.all without catch
generateReport(findings, date) → String
```

**Key implementation notes:**
- `runAsyncNoCatchCheck`: grep `async.*\(` or `ipcMain\.handle\(`; parse function body; if no `try\s*{` at top level → `ERR_ASYNC_NO_TRY` (confidence 88). Exclude one-liner arrow functions (body is a single expression, no chance of side effects).
- `runUnhandledThenCheck`: grep `\.then\(` and track the chain; if no `.catch(` follows before a `;` or line break that ends the chain → `ERR_UNHANDLED_THEN` (confidence 85). Heuristic: scan up to 5 lines after `.then(` for `.catch(`.
- `runSwallowedCatchCheck`: grep `catch\s*\(` and parse body; if body is `{}`, `{ }`, or contains only `//` comment lines → `ERR_SWALLOWED_CATCH` (confidence 95).
- `runAwaitInForEachCheck`: grep `\.forEach\s*\(` and parse callback body for `await ` keyword → `ERR_AWAIT_IN_FOREACH` (confidence 98). This is always wrong.
- `runPromiseAllNoCatchCheck`: grep `Promise\.all\s*\(` and scan ±5 lines for `.catch(` or surrounding `try {` → `ERR_PROMISE_ALL_NO_CATCH` (confidence 87).

**IPC channel:** `review:runErrorHandling`  
**Registered in:** `src/main/ipc-handlers.js`

### Implementation Assertions (9)

| # | Type | Target | Detail |
|---|------|--------|--------|
| 1 | `file_exists` | `src/main/review/error-handling-review.js` | Analyser module exists |
| 2 | `export_exists` | `ErrorHandlingReview` | Default or named export |
| 3 | `function_signature` | `run` | Returns array of findings |
| 4 | `function_signature` | `runAsyncNoCatchCheck` | Async no try-catch rule |
| 5 | `function_signature` | `runSwallowedCatchCheck` | Empty catch rule |
| 6 | `function_signature` | `runAwaitInForEachCheck` | await-in-forEach rule |
| 7 | `function_signature` | `runPromiseAllNoCatchCheck` | Promise.all no-catch rule |
| 8 | `function_signature` | `generateReport` | Writes markdown, returns path |
| 9 | `file_contains` | `src/main/ipc-handlers.js` | String `review:runErrorHandling` present |

---

## Story 10 — Preload Bridge Completeness Review

**Status:** pending

### Description
As a developer, I want the nightly review to audit the preload bridge so that orphaned IPC handlers and missing preload exposures are detected before they cause silent `invoke()` failures in the renderer.

### Acceptance Criteria
- Review collects all `ipcMain.handle('channel:name'` registrations across all main-process files and plugin index files
- Review collects all channels exposed via `contextBridge.exposeInMainWorld` in `preload.js` (by parsing the nested object structure to extract leaf channel names)
- Review flags any `ipcMain.handle` channel with no matching preload exposure → orphaned handler (renderer can never call it)
- Review flags any preload-exposed channel name with no matching `ipcMain.handle` registration → missing handler (renderer calls will silently fail or hang)
- Review detects `ipcRenderer.invoke(` or `ipcRenderer.on(` used directly in renderer files outside of `preload.js` (bypasses context isolation)
- Every finding includes rule ID, file, line, confidence
- Findings written to `docs/preload-bridge-YYYY-MM-DD.md`

### RIS

**Scope:** `src/main/preload.js`, `src/main/ipc-handlers.js`, `src/main/main.js`, `plugins/**/index.js`, `src/renderer/**/*.js`

**Class:** `PreloadBridgeReview`

```
constructor(projectPath)
run() → Finding[]
  → collectMainHandlers() → Set<String>   all ipcMain.handle channel names
  → collectPreloadChannels() → Set<String> all channels in contextBridge exposure
  → runOrphanedHandlerCheck()   in main but not in preload
  → runMissingHandlerCheck()    in preload but not in main
  → runDirectIpcRendererCheck() ipcRenderer used outside preload.js
generateReport(findings, date) → String
```

**Key implementation notes:**
- `collectMainHandlers`: grep all JS files under `src/main/` and `plugins/` for `ipcMain\.handle\(\s*['"]([^'"]+)['"]`; capture group 1 is the channel name. Build a `Set`.
- `collectPreloadChannels`: parse `preload.js` for the `contextBridge.exposeInMainWorld` call; recursively walk the object tree; leaf values that are arrow functions calling `ipcRenderer.invoke('channel')` or `ipcRenderer.send('channel')` — extract the channel string. Build a `Set`.
- `runOrphanedHandlerCheck`: `mainHandlers - preloadChannels` → `BRIDGE_ORPHANED_HANDLER` (confidence 90). Exclude internal system channels like `state:*` that are legitimately not user-facing if documented as such.
- `runMissingHandlerCheck`: `preloadChannels - mainHandlers` → `BRIDGE_MISSING_HANDLER` (confidence 95). These will silently fail at runtime.
- `runDirectIpcRendererCheck`: grep `ipcRenderer\.invoke\(` or `ipcRenderer\.on\(` in `src/renderer/**/*.js` excluding `preload.js` → `BRIDGE_DIRECT_IPC` (confidence 98). Always a context isolation violation.

**IPC channel:** `review:runPreloadBridge`  
**Registered in:** `src/main/ipc-handlers.js`

### Implementation Assertions (8)

| # | Type | Target | Detail |
|---|------|--------|--------|
| 1 | `file_exists` | `src/main/review/preload-bridge-review.js` | Analyser module exists |
| 2 | `export_exists` | `PreloadBridgeReview` | Default or named export |
| 3 | `function_signature` | `run` | Returns array of findings |
| 4 | `function_signature` | `collectMainHandlers` | Harvests all ipcMain.handle registrations |
| 5 | `function_signature` | `collectPreloadChannels` | Parses contextBridge exposure tree |
| 6 | `function_signature` | `runDirectIpcRendererCheck` | Direct ipcRenderer use rule |
| 7 | `function_signature` | `generateReport` | Writes markdown, returns path |
| 8 | `file_contains` | `src/main/ipc-handlers.js` | String `review:runPreloadBridge` present |

---

## Story 11 — Plugin Manifest & Sandbox Review

**Status:** pending

### Description
As a developer, I want the nightly review to audit plugin manifests and sandbox boundaries so that malformed plugins, IPC naming collisions, and sandbox violations are caught before they corrupt the host application.

### Acceptance Criteria
- Review scans all `plugins/*/puffin-plugin.json` files and flags any missing required fields: `name`, `version`, `main`, `contributes.views` (if views are registered), with each view requiring `id`, `location`, `viewType`, `order`
- Review checks that every `ipcMain.handle(` or `ipcMain.on(` inside a plugin file uses a channel name prefixed with `<plugin-name>:` (where `plugin-name` matches the manifest `name` field)
- Review detects plugin source files that `require(` or `import` paths starting with `../../src/main/` or `../../src/renderer/` (direct host source access; should use plugin context APIs instead)
- Review flags plugin directories that are missing `puffin-plugin.json`, `package.json`, or `index.js` (incomplete plugin structure)
- Review checks that plugin `name` fields in `puffin-plugin.json` are unique across all plugins (duplicate names cause registration collisions)
- Every finding includes rule ID, plugin name, file, line, confidence
- Findings written to `docs/plugin-contract-YYYY-MM-DD.md`

### RIS

**Scope:** `plugins/*/puffin-plugin.json`, `plugins/*/index.js`, `plugins/**/*.js`

**Class:** `PluginContractReview`

```
constructor(projectPath)
run() → Finding[]
  → loadPluginManifests() → PluginManifest[]  parse all puffin-plugin.json files
  → runManifestFieldCheck()       required fields present and valid
  → runIpcPrefixCheck()           IPC channels prefixed with plugin name
  → runSandboxViolationCheck()    require/import of host source paths
  → runStructureCheck()           required files present in plugin dir
  → runNameUniquenessCheck()      no duplicate plugin name values
generateReport(findings, date) → String
```

**Key implementation notes:**
- `loadPluginManifests`: glob `plugins/*/puffin-plugin.json`; parse each; build `{ pluginName, manifestPath, dir, manifest }` records. Skip `.disabled` directories.
- `runManifestFieldCheck`: for each manifest check `name`, `version`, `main` exist; if `contributes.views` array is present, each entry must have `id`, `location`, `viewType`, `order` → `PLG_MANIFEST_MISSING_FIELD` (confidence 98).
- `runIpcPrefixCheck`: for each plugin, grep `plugins/<name>/**/*.js` for `ipcMain\.handle\(\s*['"]([^'"]+)['"]`; if captured channel does not start with `<name>:` → `PLG_IPC_BAD_PREFIX` (confidence 95).
- `runSandboxViolationCheck`: grep plugin JS files for `require\(['"].*\/src\/main\/` or `require\(['"].*\/src\/renderer\/` or equivalent `import ... from '...src/main/` → `PLG_SANDBOX_VIOLATION` (confidence 98). Plugins must use `pluginContext.*` APIs.
- `runStructureCheck`: for each plugin dir, verify `puffin-plugin.json`, `package.json`, and `index.js` all exist → `PLG_MISSING_FILE` (confidence 98).
- `runNameUniquenessCheck`: collect all manifest `name` values; find duplicates → `PLG_DUPLICATE_NAME` (confidence 100).

**IPC channel:** `review:runPluginContract`  
**Registered in:** `src/main/ipc-handlers.js`

### Implementation Assertions (9)

| # | Type | Target | Detail |
|---|------|--------|--------|
| 1 | `file_exists` | `src/main/review/plugin-contract-review.js` | Analyser module exists |
| 2 | `export_exists` | `PluginContractReview` | Default or named export |
| 3 | `function_signature` | `run` | Returns array of findings |
| 4 | `function_signature` | `loadPluginManifests` | Parses all puffin-plugin.json files |
| 5 | `function_signature` | `runManifestFieldCheck` | Required manifest fields rule |
| 6 | `function_signature` | `runIpcPrefixCheck` | Plugin IPC naming prefix rule |
| 7 | `function_signature` | `runSandboxViolationCheck` | Host source import rule |
| 8 | `function_signature` | `generateReport` | Writes markdown, returns path |
| 9 | `file_contains` | `src/main/ipc-handlers.js` | String `review:runPluginContract` present |
