# RIS-06: Permission Audit View

**Target**: Puffin 4.0
**Dependencies**: RIS-01 (hook bridge, for `PreToolUse` / `PermissionDenied` / `SessionStart` events)
**Delivery**: plugin-only (`permission-audit-plugin`)
**Estimated effort**: 1.5 sprints

---

## 1. Motivation

Claude Code has seven permission modes, a deny-first rule engine, an ML classifier (behind `TRANSCRIPT_CLASSIFIER`), and optional shell sandboxing. The current user-facing surface is a terminal dialog per prompt. The paper cites Anthropic's internal data: users approve 93% of permission prompts, confirming that approval fatigue makes interactive confirmation behaviorally unreliable as a sole safety mechanism. The paper also documents a pre-trust initialization vulnerability class (CVE-2025-59536 and CVE-2026-21852): hooks and MCP servers loaded *before* the trust dialog fires, creating a privileged window outside the permission pipeline. Puffin today has no view into any of this. This spec gives the user a single screen that answers: what mode am I in, what rules are active, what did the classifier decide on my recent tool calls, what got denied and why, and — critically — what loaded before the trust gate. Integration point: the hook surface (already captured by RIS-01) plus the `.claude/settings.json` file on disk.

## 2. User-facing behavior

- A new "Permissions" sidebar item opens an audit view with four panels:
  1. **Mode** — shows the currently active permission mode, with a selector to switch (`plan` / `default` / `acceptEdits` / `dontAsk` / `bypassPermissions`; `auto` if the classifier feature flag is on). Changes persist to project settings.
  2. **Rules** — a searchable table of all active rules (allow / deny / ask) with columns: rule text, origin (managed policy / user settings / project settings / local / plugin), scope (session / project / user), last matched (if tracked). Click a row to edit. New rules are added via a modal.
  3. **Recent decisions** — a chronological log of the last 500 `PreToolUse` events, each row showing: tool, input summary, decision (allowed / denied / asked), decider (rule / classifier / hook / user), reason. Filterable by decision type.
  4. **Pre-trust loads** — list of everything that loaded during session init *before* the permission pipeline was fully engaged: plugins, MCP servers, and `.claude/settings.json` rule sources. Rendered chronologically with "trust dialog fired here" divider. Any item above the divider is highlighted amber.
- A "Copy rule set as JSON" action exports the current rule set for sharing or version-control.
- A banner at the top summarizes posture: `auto-approve rate: 42% (last 7 days) | denied this week: 3 | classifier overrides: 7`. These are the metrics the paper identifies as governance-relevant.

## 3. Architectural decisions

1. **Rules are read from files, not the DB.** Puffin does not duplicate `.claude/settings.json`. The plugin reads all four permission-source files (managed, user, project, local) on activation and on `fs.watch` events, parses the rule sets, and shows the resolved merged view. When the user edits a rule, Puffin writes back to the appropriate source file (scoped to whichever file currently owns that rule, or to project settings if it is new).
2. **Decisions come from hook events.** RIS-01 already captures `PreToolUse` and `PermissionDenied`. The audit view queries `hook_events` with type filters; no new persistence.
3. **Pre-trust load order is captured from `SessionStart`.** The `SessionStart` hook event's payload lists loaded plugins, MCP servers, and settings sources in load order. If the payload does not include this (CLI version dependent), the plugin falls back to reading `.claude/` directory listings and flagging it as inferred.
4. **Mode changes are structurally safe.** Switching from `bypassPermissions` to `plan` takes effect on the next submit, never retroactively. The UI is explicit about this to avoid a false sense of retroactive safety.
5. **Rule editing uses a schema-validated form.** Rules are expressed as `tool-name` with optional `Bash(prefix:...)` / `McpResource(server:...)` style matchers. The form validates matcher syntax before allowing save; unknown tool names produce a warning.
6. **No classifier decision capture if classifier disabled.** If `TRANSCRIPT_CLASSIFIER` is not active, the "decider" column shows "rule" or "user" only. The UI does not fabricate classifier data.

## 4. Data model

No schema changes. Reads from `hook_events` (RIS-01) and filesystem `.claude/settings*.json`.

## 5. Main-process work

### Files created

- `src/main/services/permission-sources.js` — `readAllSources()` returns `{ managed, user, project, local, merged }`. Each source is an object with `path`, `rules`, `mode`, `priority`.
- `src/main/services/permission-writer.js` — `addRule(rule, scope)`, `removeRule(ruleId)`, `updateMode(mode)`. Writes back to the correct file for the given scope.
- `src/main/services/pre-trust-capture.js` — parses `SessionStart` hook payloads to extract load-order, or falls back to filesystem inspection.

### Files modified

- `src/main/ipc-handlers.js`: new `setupPermissionHandlers(ipcMain)`:
  - `permission:sources` (invoke) — returns parsed rule sets by source
  - `permission:decisions` (invoke) — returns recent PreToolUse + PermissionDenied events
  - `permission:addRule`, `permission:updateRule`, `permission:removeRule` (invoke)
  - `permission:setMode` (invoke)
  - `permission:preTrustLoads` (invoke)
  - `permission:metrics` (invoke) — auto-approve rate, deny count, classifier overrides
- `src/main/preload.js`: expose `puffin.permissions.*`.

### New IPC channels

As listed.

## 6. Renderer work

### Plugin manifest — `plugins/permission-audit-plugin/puffin-plugin.json`

```json
{
  "name": "permission-audit",
  "version": "1.0.0",
  "displayName": "Permissions",
  "description": "Audit permission mode, rules, decisions, and pre-trust loads",
  "main": "index.js",
  "extensionPoints": {
    "components": ["permission-audit", "rule-editor", "decision-log", "pre-trust-loads"]
  },
  "contributions": {
    "menus": {
      "sidebar": [{ "id": "permissions", "label": "Permissions", "icon": "🔐", "component": "permission-audit" }]
    }
  },
  "activationEvents": ["onStartup"]
}
```

### Files created

- `plugins/permission-audit-plugin/index.js`.
- `plugins/permission-audit-plugin/renderer/permission-audit.js` — top-level 4-panel layout.
- `plugins/permission-audit-plugin/renderer/mode-selector.js` — dropdown for mode switching.
- `plugins/permission-audit-plugin/renderer/rule-table.js` — searchable/filterable rule listing.
- `plugins/permission-audit-plugin/renderer/rule-editor.js` — modal form for add/edit.
- `plugins/permission-audit-plugin/renderer/decision-log.js` — chronological decision feed.
- `plugins/permission-audit-plugin/renderer/pre-trust-loads.js` — pre-trust listing with trust-divider.
- `plugins/permission-audit-plugin/renderer/metrics-banner.js` — top-of-view summary.
- `plugins/permission-audit-plugin/renderer/matcher-validator.js` — pure function validating rule matcher syntax.
- `plugins/permission-audit-plugin/renderer/styles.css`.

## 7. Inspection assertions

```json
[
  { "id": "IA1", "criterion": "AC1", "type": "FILE_EXISTS", "target": "src/main/services/permission-sources.js", "assertion": { "type": "file" }, "message": "Permission sources service exists" },
  { "id": "IA2", "criterion": "AC1", "type": "EXPORT_EXISTS", "target": "src/main/services/permission-sources.js", "assertion": { "exports": [{ "name": "readAllSources", "type": "function" }] }, "message": "readAllSources is exported" },
  { "id": "IA3", "criterion": "AC2", "type": "FILE_EXISTS", "target": "src/main/services/permission-writer.js", "assertion": { "type": "file" }, "message": "Permission writer service exists" },
  { "id": "IA4", "criterion": "AC2", "type": "EXPORT_EXISTS", "target": "src/main/services/permission-writer.js", "assertion": { "exports": [{ "name": "addRule", "type": "function" }, { "name": "removeRule", "type": "function" }, { "name": "updateMode", "type": "function" }] }, "message": "Permission writer exposes add/remove/updateMode" },
  { "id": "IA5", "criterion": "AC3", "type": "FILE_EXISTS", "target": "src/main/services/pre-trust-capture.js", "assertion": { "type": "file" }, "message": "Pre-trust capture service exists" },
  { "id": "IA6", "criterion": "AC4", "type": "FILE_CONTAINS", "target": "src/main/preload.js", "assertion": { "pattern": "puffin.permissions" }, "message": "Preload exposes permissions API" },
  { "id": "IA7", "criterion": "AC5", "type": "FILE_EXISTS", "target": "plugins/permission-audit-plugin/renderer/matcher-validator.js", "assertion": { "type": "file" }, "message": "Matcher validator exists" },
  { "id": "IA8", "criterion": "AC5", "type": "FUNCTION_SIGNATURE", "target": "plugins/permission-audit-plugin/renderer/matcher-validator.js", "assertion": { "functionName": "validateMatcher", "parameters": ["matcherString"] }, "message": "validateMatcher has correct signature" },
  { "id": "IA9", "criterion": "AC6", "type": "JSON_PROPERTY", "target": "plugins/permission-audit-plugin/puffin-plugin.json", "assertion": { "path": "contributions.menus.sidebar[0].id", "value": "permissions" }, "message": "Plugin contributes Permissions sidebar item" }
]
```

## 8. Manual verification steps

1. Open the Permissions view on a fresh project. Verify the Mode panel shows `acceptEdits` (Puffin's default per `claude-service.js`).
2. Verify the Rules panel lists rules from at least one source (project `.claude/settings.json` or user-level).
3. Add a new deny rule: `Bash(prefix:rm -rf)`. Verify it writes to `.claude/settings.json` and appears in the table immediately.
4. Submit a prompt that would trigger that rule. Verify the Decision Log shows a denial with decider = `rule`.
5. Switch mode to `plan`. Submit a prompt. Verify the behavior matches plan mode (agent proposes before executing) and the submission is tagged with the new mode in the decision log.
6. Open Pre-trust Loads. Verify the list shows installed plugins and MCP servers in load order, with a trust-divider marker.
7. Intentionally install a plugin that loads a shell command at init time. Verify that plugin appears *above* the divider and is highlighted amber.
8. Check metrics banner: after a week of use, auto-approve rate should be a realistic number.

## 9. Open questions

- Do `SessionStart` hook payloads actually include plugin/MCP load order? If not, how far can `pre-trust-capture.js` go with filesystem inspection alone? Needs empirical check after RIS-01 ships.
- Classifier decisions: is there a hook event for classifier verdicts, or is it only visible via the `--debug` stream? If the latter, either parse debug lines or ship without that column until the CLI exposes it.
- "Last matched" for rules: not trackable without cross-referencing every decision with every rule on read. Acceptable to render as `—` in 4.0.
- `bypassPermissions` mode: Puffin currently forces this when Puppeteer loop is active (`claude-service.js` line 805). The UI should clearly indicate when a mode is being auto-set and explain why.
- Should Puffin refuse to allow a user to add a rule that conflicts with a managed-policy deny? Default: warn but permit, since managed denies take precedence anyway. Make the warning explicit.

## 10. Milestones

- **M1** (week 1): `permission-sources.js` + `permission-writer.js` + IPC + manual test via preload.
- **M2** (week 2): Mode / Rules / Decisions panels rendered (basic functionality).
- **M3** (week 3): Pre-trust loads + metrics banner + rule editor modal + matcher validator + docs.
