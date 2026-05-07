# RIS-03: Subagent Tree Viewer

**Target**: Puffin 4.0
**Dependencies**: RIS-01 (hook bridge, for live `SubagentStart` / `SubagentStop` events)
**Delivery**: plugin-only (`subagent-tree-plugin`)
**Estimated effort**: 1.5 sprints

---

## 1. Motivation

When Claude Code delegates to a subagent (Explore, Plan, general-purpose, or a custom agent type), it writes the subagent's full transcript to a separate `.jsonl` sidechain file and returns only a summary back to the parent. The paper is explicit about the design: sidechains exist "for debugging and auditing" but do not inflate the parent's context. Through the CLI, these sidechains are effectively unreadable — they live at `~/.claude/projects/<project>/<session-id>.jsonl` and are identified by `isSidechain: true` entries. When a Puffin sprint uses a subagent, the user sees a single emoji (🤖) in the stream and a final summary; the intermediate reasoning, tool calls, and file reads that produced that summary are hidden. This spec surfaces the sidechain transcripts as an inspectable tree. Integration point: Claude Code's append-only transcripts on disk, anchored by `SubagentStart` / `SubagentStop` hook events.

## 2. User-facing behavior

- When a turn involves subagent delegation, the Response viewer renders a collapsed subagent card inline where the 🤖 emoji would normally appear. The card shows: subagent type, duration, token cost, final-summary first line.
- Clicking the card expands a tree view showing: parent → subagent(s) → sub-subagents (transitive). Depth is capped at 5 (matching Claude Code's recommended nesting ceiling).
- Each node in the tree shows: agent type, status (running / completed / failed), turn count, tool-call count.
- Clicking any node opens a right-side pane displaying the full sidechain transcript, formatted with tool-call emojis and expandable tool-result blocks.
- A "show parent context gap" affordance reveals what the parent summary said vs. what the subagent actually did — useful for catching summary drift.
- Subagent transcripts are searchable via a query box: `agent:Explore tool:Grep pattern:authentication` returns matching sidechains from the current project's history.

## 3. Architectural decisions

1. **Read sidechains directly from disk.** Claude Code owns the transcript format (`.jsonl` lines with `isSidechain: true`, `parentUuid`, `sessionId`, etc.). Puffin does not duplicate this storage — it reads the files on demand. This respects the "append-only durable state" principle the paper identifies as recurring.
2. **Anchor live updates to hook events.** RIS-01's `SubagentStart` / `SubagentStop` hook events carry the sidechain session ID. When Puffin receives these, it opens a `fs.watch` on the sidechain file so the tree updates live as the subagent works.
3. **Cross-platform path discovery.** The Claude Code projects directory is `~/.claude/projects/` on macOS/Linux and `%USERPROFILE%\.claude\projects\` on Windows. The plugin normalizes via `os.homedir()` and `path.join()`. If the directory layout differs in future CLI versions, a single constant in `claude-paths.js` is the only change needed.
4. **No database persistence.** Sidechain transcripts are already durable on disk. Puffin indexes them in-memory at project-load time (a single pass listing filenames + first/last lines) for fast search. Re-index on file-system events.
5. **Depth and breadth limits.** The tree renderer caps visible depth at 5 and breadth at 50 children per node. Over-limit nodes render as "…and N more (click to expand)" to prevent pathological renders when an agent team spawns many workers.

## 4. Data model

No schema changes. An in-memory cache keyed by `sessionId` → `{ path, index, lastModified }` lives in the plugin.

## 5. Main-process work

### Files created

- `src/main/services/sidechain-reader.js` — `readSidechain(path)`, `watchSidechain(path, cb)`, `listProjectSidechains(projectPath)`. Parses JSONL line-by-line (streaming, never loads the whole file).
- `src/main/services/claude-paths.js` — `getClaudeProjectsDir()`, `resolveSessionPath(projectPath, sessionId)`.

### Files modified

- `src/main/ipc-handlers.js`:
  - New `setupSubagentHandlers(ipcMain)` with channels:
    - `subagent:list` — returns `{ tree }` for a given branch/prompt
    - `subagent:read` — returns the full transcript for a given session ID
    - `subagent:search` — returns matching sidechains for a query string
- `src/main/preload.js`: expose `puffin.subagents.list()`, `.read()`, `.search()`, `.onUpdate()`.

### New IPC channels

- `subagent:list` (invoke)
- `subagent:read` (invoke)
- `subagent:search` (invoke)
- `subagent:update` (push, fires on `fs.watch` events)

## 6. Renderer work

### Plugin manifest — `plugins/subagent-tree-plugin/puffin-plugin.json`

```json
{
  "name": "subagent-tree",
  "version": "1.0.0",
  "displayName": "Subagent Tree",
  "description": "Inspect subagent delegation trees and sidechain transcripts",
  "main": "index.js",
  "extensionPoints": {
    "components": ["subagent-card", "subagent-tree", "sidechain-viewer"]
  },
  "contributions": {
    "renderOverrides": {
      "responseViewer.toolEmoji": { "Task": "subagent-card" }
    },
    "menus": {
      "sidebar": [{ "id": "subagent-search", "label": "Subagents", "icon": "🤖", "component": "subagent-tree" }]
    }
  },
  "activationEvents": ["onStartup"]
}
```

### Files created

- `plugins/subagent-tree-plugin/index.js` — activates, wires the `renderOverrides.responseViewer.toolEmoji` hook if Puffin exposes it; otherwise registers a component that the response viewer can opt into.
- `plugins/subagent-tree-plugin/renderer/subagent-card.js` — inline card replacing the 🤖 emoji.
- `plugins/subagent-tree-plugin/renderer/subagent-tree.js` — tree component with expand/collapse, depth-capped rendering.
- `plugins/subagent-tree-plugin/renderer/sidechain-viewer.js` — right-side transcript pane with tool-call emojis and syntax highlighting.
- `plugins/subagent-tree-plugin/renderer/subagent-search.js` — top-level search view.
- `plugins/subagent-tree-plugin/renderer/tree-layout.js` — pure function `buildTree(sidechainEntries)` → hierarchy from `parentUuid` links.
- `plugins/subagent-tree-plugin/renderer/styles.css`.

## 7. Inspection assertions

```json
[
  { "id": "IA1", "criterion": "AC1", "type": "FILE_EXISTS", "target": "src/main/services/sidechain-reader.js", "assertion": { "type": "file" }, "message": "Sidechain reader service exists" },
  { "id": "IA2", "criterion": "AC1", "type": "EXPORT_EXISTS", "target": "src/main/services/sidechain-reader.js", "assertion": { "exports": [{ "name": "readSidechain", "type": "function" }, { "name": "watchSidechain", "type": "function" }, { "name": "listProjectSidechains", "type": "function" }] }, "message": "Sidechain reader exports required functions" },
  { "id": "IA3", "criterion": "AC2", "type": "FILE_EXISTS", "target": "src/main/services/claude-paths.js", "assertion": { "type": "file" }, "message": "Claude paths helper exists" },
  { "id": "IA4", "criterion": "AC2", "type": "FUNCTION_SIGNATURE", "target": "src/main/services/claude-paths.js", "assertion": { "functionName": "getClaudeProjectsDir", "parameters": [] }, "message": "getClaudeProjectsDir is exported" },
  { "id": "IA5", "criterion": "AC3", "type": "FILE_CONTAINS", "target": "src/main/preload.js", "assertion": { "pattern": "puffin.subagents" }, "message": "Preload exposes subagents API" },
  { "id": "IA6", "criterion": "AC4", "type": "FILE_EXISTS", "target": "plugins/subagent-tree-plugin/renderer/tree-layout.js", "assertion": { "type": "file" }, "message": "Tree layout helper exists" },
  { "id": "IA7", "criterion": "AC4", "type": "FUNCTION_SIGNATURE", "target": "plugins/subagent-tree-plugin/renderer/tree-layout.js", "assertion": { "functionName": "buildTree", "parameters": ["sidechainEntries"] }, "message": "buildTree takes a list of sidechain entries" },
  { "id": "IA8", "criterion": "AC5", "type": "JSON_PROPERTY", "target": "plugins/subagent-tree-plugin/puffin-plugin.json", "assertion": { "path": "extensionPoints.components", "contains": "subagent-tree" }, "message": "Plugin declares subagent-tree component" }
]
```

## 8. Manual verification steps

1. Submit a prompt that invokes the `Task` tool (e.g., "use Explore to find all authentication-related files, then Plan the refactor").
2. Wait for the turn to complete. Verify the Response viewer shows a subagent card (not just a 🤖 emoji) with the subagent type and duration.
3. Click the card. Verify a tree appears showing `main → Explore` (and `→ Plan` if both fired).
4. Click `Explore`. Right pane shows the full Explore transcript with individual tool calls.
5. Find a line in the Explore transcript that the parent's summary did not mention. Verify the "show parent context gap" affordance surfaces this as a delta.
6. Open Subagents sidebar. Search for `agent:Explore`. Verify historical Explore runs from prior prompts are listed and openable.
7. Run a subagent. While it's in progress, verify the tree updates live (new tool calls appear without manual refresh).

## 9. Open questions

- Does the response viewer have a render-override extension point today, or do we need to add one? If not, spec a thin addition to `components/response-viewer/` in a sub-task.
- Sidechain filename format — confirmed as `<session-id>.jsonl`? Verify before coding the path resolver.
- How does Puffin handle projects whose Claude-Code path differs from the project's own working directory (e.g., a worktree)? The `claude-paths.js` helper needs to accept an explicit project root, not infer from CWD.
- Depth-5 cap is arbitrary; Puffin may want to let users override per-project in config. Defer to 4.1.

## 10. Milestones

- **M1** (week 1): `sidechain-reader.js` + IPC handlers + a manual test that lists and reads an existing sidechain file.
- **M2** (week 2): Tree component + basic rendering (no live update, no search).
- **M3** (week 2–3): Live updates via `fs.watch` + `SubagentStart`/`SubagentStop` hook correlation.
- **M4** (week 3): Inline subagent card + parent-context-gap view + search + docs.
