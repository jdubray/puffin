# RIS-07: MCP Console

**Target**: Puffin 4.0
**Dependencies**: RIS-01 (hook bridge, for `PreToolUse` events on `mcp__*` tools)
**Delivery**: plugin-only (`mcp-console-plugin`)
**Estimated effort**: 1.5 sprints

---

## 1. Motivation

The Model Context Protocol is the primary external tool integration path for Claude Code. The paper's Table 2 is explicit: MCP is the **highest-context-cost extension mechanism** — tool schemas occupy the model's context window directly, and a single verbose server can eat a meaningful fraction of available tokens before the user's first message. Puffin already ships an `.mcp.json` file in the repo root; Claude Code supports 8+ transports (stdio, SSE, HTTP, WebSocket, SDK, IDE variants). There is no view inside Puffin that answers: which MCP servers are connected right now, are they healthy, which tools do they expose, how many tokens does each server cost me, and what calls have recently been made against each? Hou et al.'s MCP attack-surface survey (cited in the paper's Section 13.2) catalogs tool poisoning, rug pulls, and cross-server shadowing — real risks that require an inspection surface. This spec provides that surface and makes MCP cost and health a first-class concern. Integration points: the `.mcp.json` file, Claude Code's MCP connection lifecycle (via RIS-01 hooks), and per-call telemetry (via `PreToolUse` events with `mcp__*` prefixes).

## 2. User-facing behavior

- A new "MCP" sidebar item opens a console with three panels:
  1. **Servers** — a table listing every configured server from `.mcp.json` (project, user, plugin, enterprise scopes all merged). Columns: name, transport, status (connected / disconnected / error), tool count, estimated context cost (tokens), last used, scope.
  2. **Tools** — a list of all tools across all servers, with server name, description, input schema size (tokens), and a count of recent invocations. Filterable by server, sortable by cost.
  3. **Recent activity** — a chronological log of recent `mcp__*` tool calls: server, tool, input summary, duration, result size.
- Clicking a server opens a detail view: full configuration JSON, health-probe result, tool list, outbound connections (for MCP clients), and a "disable temporarily" toggle that deny-rules the server without modifying `.mcp.json`.
- A "Total MCP cost" badge sums per-server context costs and shows fraction-of-window consumed.
- An editor surface allows adding, removing, and editing servers. Edits write back to `.mcp.json` with JSON-schema validation.
- A health-probe action against any server attempts a connect-and-list-tools cycle and reports latency, error, and tool count.

## 3. Architectural decisions

1. **`.mcp.json` is the source of truth.** Puffin reads from all MCP config scopes the CLI supports (project `.mcp.json`, user-level, any plugin-contributed configs) and shows the merged view. Edits via the UI write back to the scope the server was declared in; new servers default to project scope.
2. **Health probes are opt-in, not automatic.** Connecting to every configured server on plugin activation could be slow or trigger rate limits. A manual "probe" button per server is the default; a "probe all now" action exists for bulk use. Plugins that need auto-health may set an interval in plugin settings.
3. **Context cost is estimated, not measured.** Per-server cost = sum of tool-schema JSON sizes in characters, divided by 4 for tokens. Cheap and consistent. The UI labels it "estimated" to avoid implying precision.
4. **Tool calls are observed, not intercepted.** The console reads `hook_events` filtered by `event_type = 'PreToolUse' AND tool_name LIKE 'mcp__%'` (RIS-01 supplies this). Puffin does not route MCP calls itself.
5. **Transport diversity is abstracted.** The UI does not differentiate stdio vs. SSE vs. HTTP beyond labeling; the user cares about "does it work and what does it cost." Configuration edits preserve the transport-specific fields via a transport-aware schema.
6. **Editing never modifies a running CLI's connections.** The UI warns that server changes take effect on the next Claude submission. Restarting active connections mid-session is out of scope (and not possible without CLI cooperation).

## 4. Data model

No schema changes. All data sourced from `.mcp.json`, `hook_events`, and live health probes.

## 5. Main-process work

### Files created

- `src/main/services/mcp-config.js` — `readAllConfigs(projectPath)` returns merged MCP server configs with scope metadata. `writeConfig(scope, serverName, config)` writes back.
- `src/main/services/mcp-prober.js` — `probe(serverConfig)` attempts a connection and returns `{ status, latencyMs, toolCount, error? }`. Supports each transport in `.mcp.json`: stdio (spawn), HTTP/SSE (fetch with timeout), WebSocket.
- `src/main/services/mcp-cost-estimator.js` — `estimateServerCost(serverConfig, toolSchemas)` → tokens.

### Files modified

- `src/main/ipc-handlers.js`: new `setupMcpHandlers(ipcMain)`:
  - `mcp:list` (invoke) — returns merged server configs
  - `mcp:probe` (invoke) — probes one server
  - `mcp:probeAll` (invoke) — probes all servers
  - `mcp:addServer`, `mcp:updateServer`, `mcp:removeServer` (invoke)
  - `mcp:disableTemporarily` / `mcp:reEnable` (invoke) — adds/removes a deny rule for the server prefix
  - `mcp:recentCalls` (invoke) — queries hook_events for MCP tool calls
  - `mcp:totalCost` (invoke)
- `src/main/preload.js`: expose `puffin.mcp.*`.

### New IPC channels

As listed.

## 6. Renderer work

### Plugin manifest — `plugins/mcp-console-plugin/puffin-plugin.json`

```json
{
  "name": "mcp-console",
  "version": "1.0.0",
  "displayName": "MCP",
  "description": "Manage Model Context Protocol servers, tools, and telemetry",
  "main": "index.js",
  "extensionPoints": {
    "components": ["mcp-console", "mcp-server-detail", "mcp-server-editor"]
  },
  "contributions": {
    "menus": {
      "sidebar": [{ "id": "mcp", "label": "MCP", "icon": "🔌", "component": "mcp-console" }]
    }
  },
  "activationEvents": ["onStartup"]
}
```

### Files created

- `plugins/mcp-console-plugin/index.js`.
- `plugins/mcp-console-plugin/renderer/mcp-console.js` — top-level 3-panel layout.
- `plugins/mcp-console-plugin/renderer/server-table.js` — row per server with status, cost, actions.
- `plugins/mcp-console-plugin/renderer/server-detail.js` — modal detail view.
- `plugins/mcp-console-plugin/renderer/server-editor.js` — add/edit modal with JSON-schema-validated form.
- `plugins/mcp-console-plugin/renderer/tools-panel.js`.
- `plugins/mcp-console-plugin/renderer/activity-panel.js` — recent-calls feed.
- `plugins/mcp-console-plugin/renderer/cost-badge.js` — top-of-view total-cost indicator.
- `plugins/mcp-console-plugin/renderer/config-schema.js` — transport-aware schema definitions for validation.
- `plugins/mcp-console-plugin/renderer/styles.css`.

## 7. Inspection assertions

```json
[
  { "id": "IA1", "criterion": "AC1", "type": "FILE_EXISTS", "target": "src/main/services/mcp-config.js", "assertion": { "type": "file" }, "message": "MCP config service exists" },
  { "id": "IA2", "criterion": "AC1", "type": "EXPORT_EXISTS", "target": "src/main/services/mcp-config.js", "assertion": { "exports": [{ "name": "readAllConfigs", "type": "function" }, { "name": "writeConfig", "type": "function" }] }, "message": "MCP config service exposes read/write" },
  { "id": "IA3", "criterion": "AC2", "type": "FILE_EXISTS", "target": "src/main/services/mcp-prober.js", "assertion": { "type": "file" }, "message": "MCP prober exists" },
  { "id": "IA4", "criterion": "AC2", "type": "FUNCTION_SIGNATURE", "target": "src/main/services/mcp-prober.js", "assertion": { "functionName": "probe", "parameters": ["serverConfig"] }, "message": "probe() has correct signature" },
  { "id": "IA5", "criterion": "AC3", "type": "FILE_EXISTS", "target": "src/main/services/mcp-cost-estimator.js", "assertion": { "type": "file" }, "message": "Cost estimator exists" },
  { "id": "IA6", "criterion": "AC4", "type": "FILE_CONTAINS", "target": "src/main/preload.js", "assertion": { "pattern": "puffin.mcp" }, "message": "Preload exposes MCP API" },
  { "id": "IA7", "criterion": "AC5", "type": "JSON_PROPERTY", "target": "plugins/mcp-console-plugin/puffin-plugin.json", "assertion": { "path": "contributions.menus.sidebar[0].id", "value": "mcp" }, "message": "Plugin contributes MCP sidebar item" },
  { "id": "IA8", "criterion": "AC6", "type": "FILE_EXISTS", "target": "plugins/mcp-console-plugin/renderer/config-schema.js", "assertion": { "type": "file" }, "message": "Config schema module exists" }
]
```

## 8. Manual verification steps

1. Open MCP view on a project with the existing `.mcp.json`. Verify all configured servers appear in the Servers table.
2. Click "Probe" on one server. Verify status transitions through "probing" to "connected" or "error" with latency reported.
3. Click into a connected server. Verify the detail view lists its tools with descriptions and shows the full config JSON.
4. Verify the cost badge shows a non-zero token estimate and roughly matches (tool count × average schema size / 4).
5. Add a new server via the editor. Save. Verify `.mcp.json` is updated with the new entry.
6. Invoke an MCP tool via Claude (submit a prompt that uses one). Verify the activity panel logs the call within 5 seconds.
7. Click "disable temporarily" on a server. Submit a prompt. Verify the server's tools are not available to the model (deny rule applied).
8. Re-enable. Verify tools are available again on the next submit.
9. Edit an existing server's args. Save. Verify the warning about "takes effect on next submission" is shown, and submit to confirm the change applies.

## 9. Open questions

- Per-scope editing: if a server is defined at the user level but the user edits it from a specific project, does the edit go to user or project scope? Default: edits go to project scope (override), with a clear "you are overriding a user-level config" indicator. User-level edits require switching scope explicitly.
- Does Claude CLI expose an MCP health endpoint natively? If a `--mcp-status` or similar exists, prefer it over manual probes. Check before building the prober.
- Cost accuracy: 4-chars-per-token is a rough estimate. If users report misleading numbers, use `gpt-tokenizer` (same package RIS-02 may have adopted).
- Can we detect rug-pull behavior (server tool schema changes after connect)? Not for 4.0 — flag as a 4.1 security enhancement informed by Hou et al.'s taxonomy.
- Multi-transport support in the prober: stdio is easy; HTTP/SSE require real clients. If any transport is complex to probe, ship with a "probe not supported for this transport" status rather than a broken probe.

## 10. Milestones

- **M1** (week 1): `mcp-config.js` + IPC + basic Servers table (read-only).
- **M2** (week 2): Prober (stdio + HTTP first; SSE/WS after) + cost estimator + cost badge.
- **M3** (week 3): Editor + activity panel via hook_events + disable/re-enable + docs.
