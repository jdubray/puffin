# RIS-01: Hook Activity Panel

**Target**: Puffin 4.0
**Dependencies**: none (this is the foundation for RIS-02, RIS-03, RIS-06, RIS-07)
**Delivery**: core change (`claude-service.js`, new `hook-bridge` module, migration 010) + `hook-activity-plugin`
**Estimated effort**: 2 sprints

---

## 1. Motivation

Claude Code defines 27 hook events (`PreToolUse`, `PostToolUse`, `SessionStart`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `FileChanged`, `PermissionDenied`, `TaskCreated`, `TaskCompleted`, `InstructionsLoaded`, etc.). Only 5 are safety-related; the other 22 describe the agent's full lifecycle. Puffin currently spawns `claude --print --output-format stream-json` without passing any hook configuration, so every lifecycle event is discarded. The paper's central finding is that ~1.6% of Claude Code is decision logic and 98.4% is operational harness — this spec wires Puffin into the harness, which makes RIS-02, RIS-03, RIS-06, and RIS-07 possible. Integration point: the hook surface.

## 2. User-facing behavior

- A new "Activity" top-level tab (between Prompt and Backlog) renders a timeline of hook events for the current branch.
- Events are organized in 8 lanes: **Session**, **Tools**, **Subagents**, **Compaction**, **Permissions**, **Tasks**, **Files**, **User interaction**.
- Each event is a clickable dot on the timeline; clicking opens a detail pane with the full JSON payload, the correlated prompt ID, and the raw timestamp.
- Lane filters let the user hide lanes they don't care about. Filter state persists per-branch.
- A live indicator (pulsing dot) shows when events are arriving in real time.
- A query box supports `event_type:PreToolUse tool:Bash` syntax for filtering historical events.

## 3. Architectural decisions

1. **Hook delivery via localhost HTTP.** Puffin runs an HTTP server on `127.0.0.1` (random port allocated at startup, persisted to `.puffin/config.json` as `hookBridgePort`). The server only accepts connections from loopback. Each hook registration is a shell command that POSTs the event payload as JSON to `http://127.0.0.1:<port>/hook/<event_type>?cid=<correlation_id>`.
2. **Per-submission correlation.** Before each `claude:submit`, Puffin generates a UUIDv4 correlation ID, writes a transient `.claude/settings.local.json` merged from the project's existing settings plus hook bindings with that correlation ID embedded, and includes the correlation ID in the prompt context. Hook events arriving at the bridge are stamped with the correlation ID and linked back to the Puffin prompt ID.
3. **Event persistence is unconditional.** All hook events are written to `hook_events` (migration 010), regardless of plugin activation state, so historical data is always available. The plugin only renders; it does not gate capture.
4. **Graceful degradation when the hook bridge fails.** If the bridge can't bind (port collision, firewall), Puffin spawns Claude anyway, logs a warning, and the Activity tab shows an "Activity capture unavailable" banner. Core functionality is preserved.
5. **Cross-platform shell invocation.** The hook command is `node <puffin-resources>/hook-forwarder.js <url>` on all platforms. The forwarder reads stdin, POSTs it, and exits. This avoids `curl` availability issues on Windows and shell quoting divergence.

## 4. Data model

### Migration 010: `010_hook_events.js`

```sql
CREATE TABLE hook_events (
  id            TEXT PRIMARY KEY,
  correlation_id TEXT NOT NULL,
  session_id    TEXT,
  branch_id     TEXT,
  prompt_id     TEXT,
  event_type    TEXT NOT NULL,
  tool_name     TEXT,
  payload       TEXT NOT NULL,
  received_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_hook_events_correlation ON hook_events(correlation_id);
CREATE INDEX idx_hook_events_branch ON hook_events(branch_id, received_at DESC);
CREATE INDEX idx_hook_events_type ON hook_events(event_type);
CREATE INDEX idx_hook_events_prompt ON hook_events(prompt_id);
```

## 5. Main-process work

### Files created

- `src/main/hook-bridge/server.js` — `HookBridgeServer` class. Methods: `start()`, `stop()`, `registerHandler(eventType, fn)`, `getPort()`. Uses Node `http` only (no Express).
- `src/main/hook-bridge/settings-generator.js` — `generateHookSettings(basePath, correlationId, port)` merges project `.claude/settings.json` with Puffin hook bindings and writes to `.claude/settings.local.json`. Returns the resolved settings path for `--settings`.
- `src/main/hook-bridge/forwarder.js` — tiny standalone Node script packaged with Puffin (placed in `extraResources/hook-forwarder.js`). Reads stdin, POSTs to the URL passed as argv[2], exits 0 on success.
- `src/main/database/migrations/010_hook_events.js`.
- `src/main/database/repositories/hook-events-repository.js` — `insert(event)`, `queryByBranch(branchId, opts)`, `queryByCorrelation(correlationId)`, `countByType(branchId, window)`.

### Files modified

- `src/main/claude-service.js`:
  - Constructor accepts a `hookBridge` reference.
  - `buildArgs(data)`: before returning, call `generateHookSettings(this.projectPath, data.correlationId, this.hookBridge.getPort())`, then push `--settings <resolvedPath>`. Verify Claude CLI supports `--settings`; if not, fall back to writing `.claude/settings.local.json` which Claude reads automatically.
  - New method `submit()`: generate `correlationId = uuidv4()`, add to `data`, pass through.
- `src/main/ipc-handlers.js`:
  - New `setupHookHandlers(ipcMain, hookBridge, db)`: registers `hook:events:query`, `hook:events:stream:subscribe`, `hook:events:stream:unsubscribe`.
  - In `setupIpcHandlers()`, instantiate `HookBridgeServer`, call `.start()`, register forwarder that writes to `hook_events` and emits `webContents.send('claude:hookEvent', event)`.
- `src/main/preload.js`: expose `puffin.hooks.query(filters)`, `puffin.hooks.onEvent(cb)`.

### New IPC channels

- `hook:events:query` (invoke) — returns `{ success, events }` for a given branch/correlation filter.
- `claude:hookEvent` (push) — fired for every event; renderer plugins filter client-side.

## 6. Renderer work

### Plugin manifest — `plugins/hook-activity-plugin/puffin-plugin.json`

```json
{
  "name": "hook-activity",
  "version": "1.0.0",
  "displayName": "Activity",
  "description": "Timeline of Claude Code hook events across 27 lifecycle event types",
  "main": "index.js",
  "extensionPoints": {
    "components": ["activity-timeline"],
    "ipcHandlers": []
  },
  "contributions": {
    "menus": {
      "topNav": [{ "id": "activity", "label": "Activity", "icon": "📡", "component": "activity-timeline" }]
    }
  },
  "activationEvents": ["onStartup"]
}
```

### Files created

- `plugins/hook-activity-plugin/index.js` — activates, calls `context.subscribe('claude:hookEvent', ...)` via the exposed preload API, forwards to registered component.
- `plugins/hook-activity-plugin/renderer/activity-timeline.js` — component rendering the 8-lane timeline. Uses existing SAM pattern. Local state: `{ events, lanesVisible, query, selectedEventId }`.
- `plugins/hook-activity-plugin/renderer/event-detail.js` — modal for inspecting a selected event.
- `plugins/hook-activity-plugin/renderer/lane-config.js` — maps 27 event types → 8 lane names.
- `plugins/hook-activity-plugin/renderer/activity-timeline.css`.

## 7. Inspection assertions

```json
[
  { "id": "IA1", "criterion": "AC1", "type": "FILE_EXISTS", "target": "src/main/hook-bridge/server.js", "assertion": { "type": "file" }, "message": "HookBridgeServer module exists" },
  { "id": "IA2", "criterion": "AC1", "type": "CLASS_STRUCTURE", "target": "src/main/hook-bridge/server.js", "assertion": { "className": "HookBridgeServer", "methods": ["start", "stop", "registerHandler", "getPort"] }, "message": "HookBridgeServer exposes required methods" },
  { "id": "IA3", "criterion": "AC2", "type": "FILE_EXISTS", "target": "src/main/database/migrations/010_hook_events.js", "assertion": { "type": "file" }, "message": "Migration 010 exists" },
  { "id": "IA4", "criterion": "AC2", "type": "FILE_CONTAINS", "target": "src/main/database/migrations/010_hook_events.js", "assertion": { "pattern": "CREATE TABLE hook_events" }, "message": "Migration creates hook_events table" },
  { "id": "IA5", "criterion": "AC3", "type": "FILE_CONTAINS", "target": "src/main/claude-service.js", "assertion": { "pattern": "generateHookSettings" }, "message": "claude-service invokes hook settings generator" },
  { "id": "IA6", "criterion": "AC3", "type": "IMPORT_EXISTS", "target": "src/main/claude-service.js", "assertion": { "module": "./hook-bridge/settings-generator" }, "message": "claude-service imports settings generator" },
  { "id": "IA7", "criterion": "AC4", "type": "FILE_EXISTS", "target": "plugins/hook-activity-plugin/puffin-plugin.json", "assertion": { "type": "file" }, "message": "Plugin manifest exists" },
  { "id": "IA8", "criterion": "AC4", "type": "JSON_PROPERTY", "target": "plugins/hook-activity-plugin/puffin-plugin.json", "assertion": { "path": "contributions.menus.topNav[0].id", "value": "activity" }, "message": "Plugin contributes Activity top nav item" },
  { "id": "IA9", "criterion": "AC5", "type": "FILE_CONTAINS", "target": "src/main/preload.js", "assertion": { "pattern": "puffin.hooks" }, "message": "preload exposes hooks API" }
]
```

## 8. Manual verification steps

1. Fresh install, open a project, submit a prompt that runs `Bash` and reads 2 files.
2. Open Activity tab. Verify at least 8 events appear: `SessionStart`, `PreToolUse` (×3), `PostToolUse` (×3), `SessionEnd` (or equivalent).
3. Click a `PreToolUse` event. Detail pane shows `tool_name: "Bash"` and the command invoked.
4. Filter by `event_type:PreToolUse`. Only tool-use events remain.
5. Kill Puffin mid-turn. Restart. Activity tab shows the historical events from the killed turn (persistence works).
6. Manually occupy the bridge port, restart Puffin. Banner shows "Activity capture unavailable"; Claude submissions still succeed.

## 9. Open questions

- Does `claude --settings <path>` exist in the current CLI, or must we rely on `.claude/settings.local.json` discovery? Requires CLI check.
- Should correlation_id also be written into the prompt as an invisible marker, so `Bash`-executed sub-commands can report back? (Deferred; not needed for 4.0.)
- Per-plugin hook subscriptions (rather than every plugin receiving every event): defer to 4.1 if volume becomes a problem.
- Does `hook-forwarder.js` need signing on macOS? Electron notarization covers it if it ships inside the resources bundle.

## 10. Milestones

- **M1** (week 1): `HookBridgeServer` + migration 010 + manual curl test of event insertion.
- **M2** (week 2): `settings-generator` + wire into `claude-service.buildArgs()`; verify one PreToolUse arrives end-to-end.
- **M3** (week 3): IPC channels + preload exposure + a minimum-viable activity-timeline component (one lane, no filters).
- **M4** (week 4): 8-lane UI + filters + query + event detail pane + docs.
