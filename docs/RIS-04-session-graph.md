# RIS-04: Session Graph

**Target**: Puffin 4.0
**Dependencies**: none (nice-to-have with RIS-01 for live status)
**Delivery**: core change (`claude-service.js`, migration 011) + `session-graph-plugin`
**Estimated effort**: 2 sprints

---

## 1. Motivation

Claude Code supports three distinct session operations: **resume** (continue a prior session), **fork** (branch a new session from an existing one), and **rewind** (roll back filesystem state to a checkpoint via `--rewind-files`). The paper documents that these operations exist but that "interacting with any of this through a CLI is punishing" — resume is a flag, fork produces a new `sessionId`, rewind is file-history-based and effectively invisible. Puffin today shows conversation as a linear branched tree within a single session; it does not show the relationships *between* sessions. When a user forks a session to try a different approach, Puffin loses the connection. This spec makes every session a node in a DAG and makes resume/fork/rewind one-click. Integration point: Claude Code's append-only JSONL transcripts and session IDs that Puffin already receives but does not persist in a queryable form.

## 2. User-facing behavior

- A new top-level "Sessions" view renders a DAG of the current project's Claude Code sessions over time. Nodes are sessions; edges show resume (solid line), fork (branching line), rewind (dashed arrow to a prior node).
- Each node displays: creation time, turn count, branch ID (if tied to a Puffin branch), status (active / idle / closed).
- Hovering a node shows a summary tooltip: first user prompt, last assistant message, total cost.
- Clicking a node opens the full transcript in a side pane (reusing the sidechain-viewer from RIS-03 if available).
- Actions available on any node:
  - **Resume** — loads this session into a Puffin branch and sets `--resume <sessionId>` on the next submit.
  - **Fork** — creates a new child session seeded with the selected node's context.
  - **Rewind** — restores filesystem state to this session's last checkpoint (uses Claude Code's `--rewind-files`).
  - **Diff against** — select another node; pane shows a diff of the transcript messages and of modified files.
- A search box finds sessions by prompt text or file path touched.
- A safety banner above rewind confirms: "Rewind restores filesystem state. Session-scoped permissions will NOT be restored. Claude will ask again for any tool approvals." (Mirrors the paper's explicit safety decision.)

## 3. Architectural decisions

1. **Sessions are a first-class Puffin entity.** A new `sessions` table (migration 011) records every session Puffin observes, with its Claude session ID, parent session ID (for forks), operation type, branch association, and timestamps. This is orthogonal to the existing `sprints` and `user_stories` tables.
2. **Discovery is observational.** Puffin does not manage sessions — Claude CLI does. Puffin records sessions by observing the CLI's behavior: when a submit completes, capture `result.session_id` from the stream-json `result` event (already present in `claude-service.js` via `resultData.session_id` in the completion path). Insert a `sessions` row if new.
3. **Fork semantics are explicit.** Puffin-initiated forks write a `session_links` row with `operation = 'fork'` at fork time. CLI-initiated forks (user typed a command manually) are detected post-hoc when a new session ID appears without a matching Puffin-initiated fork; these are tagged `operation = 'observed'`.
4. **Rewind uses Claude's own mechanism.** Puffin does not duplicate file-history checkpointing. The rewind action invokes `claude --rewind-files <session-id> <checkpoint-ref>` via the existing spawn infrastructure; result is a new session linked to the rewound one.
5. **DAG layout is computed at render time.** No graph data is persisted beyond the edge list. The plugin runs a topological layout (column = time, row = branch discipline) using an existing small-graph layout library or a 100-line custom algorithm.
6. **Session-scoped permissions are never restored.** This is enforced in `claude-service.js`: when resuming via UI action, the permission-rule merge skips any session-scoped rules from the prior session. Explicit, visible, non-bypassable.

## 4. Data model

### Migration 011: `011_sessions.js`

```sql
CREATE TABLE sessions (
  id                  TEXT PRIMARY KEY,            -- Puffin-generated UUID
  claude_session_id   TEXT NOT NULL UNIQUE,        -- from stream-json result event
  parent_session_id   TEXT,                        -- Claude session ID of the parent (if fork/resume/rewind)
  branch_id           TEXT,                        -- Puffin branch association (nullable)
  operation_type      TEXT NOT NULL,               -- 'root' | 'resume' | 'fork' | 'rewind' | 'observed'
  first_prompt        TEXT,                        -- First user message (truncated to 500 chars)
  last_message_at     TEXT,                        -- ISO timestamp of most recent message
  turn_count          INTEGER DEFAULT 0,
  total_cost_usd      REAL DEFAULT 0,
  status              TEXT DEFAULT 'active',       -- 'active' | 'idle' | 'closed'
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_claude_id ON sessions(claude_session_id);
CREATE INDEX idx_sessions_parent ON sessions(parent_session_id);
CREATE INDEX idx_sessions_branch ON sessions(branch_id);
CREATE INDEX idx_sessions_created ON sessions(created_at DESC);

CREATE TABLE session_links (
  id                  TEXT PRIMARY KEY,
  from_session_id     TEXT NOT NULL,               -- Claude session ID
  to_session_id       TEXT NOT NULL,               -- Claude session ID
  link_type           TEXT NOT NULL,               -- 'resume' | 'fork' | 'rewind'
  checkpoint_ref      TEXT,                        -- only for rewind
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_session_links_from ON session_links(from_session_id);
CREATE INDEX idx_session_links_to ON session_links(to_session_id);
```

## 5. Main-process work

### Files created

- `src/main/database/migrations/011_sessions.js`.
- `src/main/database/repositories/sessions-repository.js` — CRUD + `findByClaudeSessionId`, `findChildren(parentId)`, `findOrphans()`, `updateTurnCount(id, delta)`, `updateCost(id, delta)`.
- `src/main/services/session-tracker.js` — `recordObservation(claudeSessionId, context)`, `recordFork(fromId, toId)`, `recordResume(sessionId)`, `recordRewind(fromId, toId, checkpoint)`.

### Files modified

- `src/main/claude-service.js`:
  - In the stream handler where `resultData.session_id` is extracted on completion, call `sessionTracker.recordObservation(resultData.session_id, { branchId, promptId, firstPrompt, cost })`.
  - `buildArgs(data)`: if `data.resumeFromSessionId`, push `--resume <id>` (already does this). Additionally, call `sessionTracker.recordResume(data.resumeFromSessionId, newClaudeSessionId)` in the completion handler.
  - New method `forkSession(sessionId, seedPrompt)`: spawns a new CLI invocation seeded from the given session, records the fork.
  - New method `rewindFiles(sessionId, checkpointRef)`: invokes Claude with `--rewind-files`, records the rewind.
- `src/main/ipc-handlers.js`: new `setupSessionHandlers(ipcMain)` with:
  - `session:list` (invoke) — returns DAG nodes and edges for current project
  - `session:get` (invoke) — full detail for one session
  - `session:resume` (invoke) — resumes into current branch
  - `session:fork` (invoke) — forks and switches to new session
  - `session:rewind` (invoke) — rewinds filesystem
  - `session:diff` (invoke) — returns transcript diff between two sessions
- `src/main/preload.js`: expose `puffin.sessions.*` namespace.

### New IPC channels

As listed above: `session:list`, `session:get`, `session:resume`, `session:fork`, `session:rewind`, `session:diff`.

## 6. Renderer work

### Plugin manifest — `plugins/session-graph-plugin/puffin-plugin.json`

```json
{
  "name": "session-graph",
  "version": "1.0.0",
  "displayName": "Sessions",
  "description": "Visualize session DAG with resume, fork, and rewind operations",
  "main": "index.js",
  "extensionPoints": {
    "components": ["session-graph", "session-detail", "session-diff"]
  },
  "contributions": {
    "menus": {
      "topNav": [{ "id": "sessions", "label": "Sessions", "icon": "🌲", "component": "session-graph" }]
    }
  },
  "activationEvents": ["onStartup"]
}
```

### Files created

- `plugins/session-graph-plugin/index.js`.
- `plugins/session-graph-plugin/renderer/session-graph.js` — main DAG view.
- `plugins/session-graph-plugin/renderer/session-detail.js` — side-pane transcript.
- `plugins/session-graph-plugin/renderer/session-diff.js` — diff view (transcript messages + file changes).
- `plugins/session-graph-plugin/renderer/dag-layout.js` — pure function `layoutDag(nodes, edges) → { nodes: [{id, x, y}], edges: [{from, to, path}] }`.
- `plugins/session-graph-plugin/renderer/rewind-banner.js` — safety-warning component shown before rewind actions.
- `plugins/session-graph-plugin/renderer/styles.css`.

## 7. Inspection assertions

```json
[
  { "id": "IA1", "criterion": "AC1", "type": "FILE_EXISTS", "target": "src/main/database/migrations/011_sessions.js", "assertion": { "type": "file" }, "message": "Migration 011 exists" },
  { "id": "IA2", "criterion": "AC1", "type": "FILE_CONTAINS", "target": "src/main/database/migrations/011_sessions.js", "assertion": { "pattern": "CREATE TABLE sessions" }, "message": "Migration creates sessions table" },
  { "id": "IA3", "criterion": "AC1", "type": "FILE_CONTAINS", "target": "src/main/database/migrations/011_sessions.js", "assertion": { "pattern": "CREATE TABLE session_links" }, "message": "Migration creates session_links table" },
  { "id": "IA4", "criterion": "AC2", "type": "FILE_EXISTS", "target": "src/main/services/session-tracker.js", "assertion": { "type": "file" }, "message": "Session tracker service exists" },
  { "id": "IA5", "criterion": "AC2", "type": "EXPORT_EXISTS", "target": "src/main/services/session-tracker.js", "assertion": { "exports": [{ "name": "recordObservation", "type": "function" }, { "name": "recordFork", "type": "function" }, { "name": "recordRewind", "type": "function" }] }, "message": "Session tracker exports required functions" },
  { "id": "IA6", "criterion": "AC3", "type": "FILE_CONTAINS", "target": "src/main/claude-service.js", "assertion": { "pattern": "sessionTracker.recordObservation" }, "message": "Claude service records session observations" },
  { "id": "IA7", "criterion": "AC4", "type": "FILE_CONTAINS", "target": "src/main/preload.js", "assertion": { "pattern": "puffin.sessions" }, "message": "Preload exposes sessions API" },
  { "id": "IA8", "criterion": "AC5", "type": "FUNCTION_SIGNATURE", "target": "plugins/session-graph-plugin/renderer/dag-layout.js", "assertion": { "functionName": "layoutDag", "parameters": ["nodes", "edges"] }, "message": "DAG layout function has correct signature" },
  { "id": "IA9", "criterion": "AC6", "type": "FILE_EXISTS", "target": "plugins/session-graph-plugin/renderer/rewind-banner.js", "assertion": { "type": "file" }, "message": "Rewind safety banner component exists" }
]
```

## 8. Manual verification steps

1. Start a fresh project. Submit 3 prompts. Observe: 3 turns inside a single session, one node in the graph.
2. Kill and restart Puffin. Submit 2 more prompts. Observe: `sessionTracker` picks up the new session; graph shows 2 nodes (old, new) with no link between them (separate sessions, no resume).
3. In the graph, right-click the first node → Resume. Submit a prompt. Observe: a new node appears with a solid line from the resumed node.
4. In the graph, right-click → Fork. Submit a prompt. Observe: new node with a branching line.
5. Select two nodes → Diff. Observe: side pane shows message differences and file differences.
6. In the graph, right-click → Rewind. Verify the safety banner appears. Approve. Observe: new node with dashed arrow to the rewound target.
7. After rewind, attempt a tool use that was previously approved. Verify Puffin prompts for permission (confirms session-scoped permissions did not carry over).

## 9. Open questions

- Does the Claude CLI reliably emit `session_id` in the final `result` event, or is it only in `system.init`? Verify against the current stream-json schema.
- For CLI-initiated operations (user runs `claude --resume` in terminal outside Puffin), how does Puffin know? One option: `fs.watch` the Claude projects directory on startup and retroactively populate `sessions` for any session files Puffin has not yet recorded. Defer this enhancement to 4.1 if it complicates the core.
- `--rewind-files` syntax: confirm checkpoint-ref format (hash? index? timestamp?).
- Do we surface archived projects' sessions cross-project, or strictly per-project? For 4.0, per-project only.
- Graph layout at scale: 500+ nodes is plausible for long-running projects. Virtualized rendering is out of scope for 4.0; pagination (last 50 sessions) is acceptable initially.

## 10. Milestones

- **M1** (week 1): Migration + repository + `session-tracker` service + unit tests.
- **M2** (week 2): Wire into `claude-service.js` completion path; manual test that session rows appear.
- **M3** (week 3): IPC + preload + minimal graph view (list, then linear visualization).
- **M4** (week 4): Full DAG layout + fork/resume/rewind actions + diff + rewind safety banner + docs.
