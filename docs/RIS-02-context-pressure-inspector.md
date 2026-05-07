# RIS-02: Context Pressure Inspector

**Target**: Puffin 4.0
**Dependencies**: RIS-01 (hook bridge)
**Delivery**: plugin-only (`context-inspector-plugin`)
**Estimated effort**: 1 sprint

---

## 1. Motivation

Claude Code runs five compaction layers — budget reduction, snip, microcompact, context collapse, and auto-compact — on every turn. The paper notes that context collapse produces no user-visible output and that cache-aware microcompact decisions are opaque. When a conversation degrades or the model "forgets" something from 30 turns ago, the user has no way to tell which layer fired, what fraction of the window was recovered, or what was projected away. Bessemer's industry data puts 78% of AI failures in the "invisible" category; this spec takes one of those invisible failure modes — context pressure — and makes it observable. Integration point: the hook surface, specifically the `PreCompact`, `PostCompact`, `InstructionsLoaded`, and `SessionStart` events already captured by RIS-01.

## 2. User-facing behavior

- A new "Context" sub-view inside the existing Stats plugin (or a standalone sidebar view — see Open Questions) renders a stacked area chart per branch: x-axis = turn number, y-axis = tokens, three stacks (live context / compacted summary / projected away).
- A red vertical line marks each compaction event, annotated with the layer that fired (`auto-compact`, `micro-compact`, `context-collapse`, `snip`, `budget`).
- Clicking a compaction marker opens a detail pane showing:
  - Which layer fired and why (from the `PreCompact` payload's `reason` field when available).
  - Approximate tokens freed (from `PostCompact` minus `PreCompact`).
  - A diff-like view: sections of the transcript before vs. after, with removed content collapsed behind a "show what was projected away" affordance.
- A top-level indicator next to the branch tab turns amber when context usage exceeds 70% and red at 90%.
- A "force compaction now" button (calls through Claude's `/compact` slash command) lets the user pre-empt an auto-compact at a moment of their choosing.

## 3. Architectural decisions

1. **No new tables.** The plugin queries `hook_events` (written by RIS-01) with `WHERE event_type IN ('PreCompact', 'PostCompact', 'SessionStart', 'InstructionsLoaded') AND branch_id = ?`. All derived metrics are computed client-side.
2. **Token counting is approximate.** For cost reasons, we do not run a tokenizer. We count characters in `payload.messages` and divide by 4 (empirical ratio for English + code). This is sufficient for the pressure indicator; accuracy to the token is not a goal.
3. **Live vs. historical.** The chart is live-updating via the `claude:hookEvent` subscription (renderer-side, same mechanism RIS-01 exposes). The plugin maintains a 1-hour rolling window of recent events in renderer memory; older data is fetched from `hook_events` on demand.
4. **Force-compaction uses an existing CLI affordance.** `/compact` is a Claude Code slash command. Puffin sends it through the existing prompt submission pipeline rather than invoking a separate CLI mode.
5. **Cache-aware microcompact gets its own annotation.** The `PreCompact` payload includes `cache_deleted_input_tokens` when microcompact fires its cached path. The detail pane shows this distinctly so the user can tell "this compaction was cache-driven, not capacity-driven."

## 4. Data model

No schema changes. Derived views only.

## 5. Main-process work

None. RIS-01 already surfaces all required events. If the `/compact` send-through reveals that Claude CLI does not emit `PreCompact`/`PostCompact` hooks for slash-command-triggered compactions, file a follow-up and fall back to reading the next-turn's token counter for the delta.

## 6. Renderer work

### Plugin manifest — `plugins/context-inspector-plugin/puffin-plugin.json`

```json
{
  "name": "context-inspector",
  "version": "1.0.0",
  "displayName": "Context Inspector",
  "description": "Visualize context window usage and compaction events",
  "main": "index.js",
  "extensionPoints": {
    "components": ["context-pressure-chart", "compaction-detail"]
  },
  "contributions": {
    "menus": {
      "sidebar": [{ "id": "context-inspector", "label": "Context", "icon": "📊", "component": "context-pressure-chart" }]
    }
  },
  "activationEvents": ["onStartup"]
}
```

### Files created

- `plugins/context-inspector-plugin/index.js` — activates; subscribes to `claude:hookEvent`; maintains rolling buffer; exposes IPC to fetch historical events.
- `plugins/context-inspector-plugin/renderer/context-pressure-chart.js` — stacked area chart. Uses Chart.js (already available in the frontend lib bundle) or the existing SAM-integrated chart helper if one exists.
- `plugins/context-inspector-plugin/renderer/compaction-detail.js` — detail pane rendered as a modal. Displays before/after side-by-side using `marked` (already in package.json).
- `plugins/context-inspector-plugin/renderer/pressure-badge.js` — small component mounted in the branch tab showing %-of-capacity indicator.
- `plugins/context-inspector-plugin/renderer/token-estimator.js` — pure function `estimateTokens(text)` = `Math.ceil(text.length / 4)`.
- `plugins/context-inspector-plugin/renderer/layer-classifier.js` — maps a `PreCompact` event payload to one of five layer names by inspecting the `trigger` or `reason` field.
- `plugins/context-inspector-plugin/renderer/context-pressure-chart.css`.

## 7. Inspection assertions

```json
[
  { "id": "IA1", "criterion": "AC1", "type": "FILE_EXISTS", "target": "plugins/context-inspector-plugin/puffin-plugin.json", "assertion": { "type": "file" }, "message": "Plugin manifest exists" },
  { "id": "IA2", "criterion": "AC1", "type": "JSON_PROPERTY", "target": "plugins/context-inspector-plugin/puffin-plugin.json", "assertion": { "path": "name", "value": "context-inspector" }, "message": "Plugin name is context-inspector" },
  { "id": "IA3", "criterion": "AC2", "type": "FILE_EXISTS", "target": "plugins/context-inspector-plugin/renderer/context-pressure-chart.js", "assertion": { "type": "file" }, "message": "Chart component exists" },
  { "id": "IA4", "criterion": "AC2", "type": "EXPORT_EXISTS", "target": "plugins/context-inspector-plugin/renderer/context-pressure-chart.js", "assertion": { "exports": [{ "name": "ContextPressureChart", "type": "class" }] }, "message": "Chart component is exported" },
  { "id": "IA5", "criterion": "AC3", "type": "FUNCTION_SIGNATURE", "target": "plugins/context-inspector-plugin/renderer/token-estimator.js", "assertion": { "functionName": "estimateTokens", "parameters": ["text"] }, "message": "Token estimator is a pure function of text" },
  { "id": "IA6", "criterion": "AC4", "type": "FUNCTION_SIGNATURE", "target": "plugins/context-inspector-plugin/renderer/layer-classifier.js", "assertion": { "functionName": "classifyCompactionLayer", "parameters": ["preCompactPayload"] }, "message": "Layer classifier takes a PreCompact payload" },
  { "id": "IA7", "criterion": "AC5", "type": "FILE_CONTAINS", "target": "plugins/context-inspector-plugin/index.js", "assertion": { "pattern": "claude:hookEvent" }, "message": "Plugin subscribes to hook event stream" }
]
```

## 8. Manual verification steps

1. Submit a long-running multi-turn conversation (~30 turns, mix of Read/Bash/Edit tools).
2. Force an `auto-compact` by asking Claude to summarize 50+ files.
3. Open the Context view. Verify the stacked area chart shows a visible drop in live context at the compaction turn.
4. Verify a red marker annotates the compaction with the layer name (`auto-compact`).
5. Click the marker. Verify the detail pane shows a before/after diff and estimated tokens freed.
6. Verify the branch-tab pressure badge transitioned from green → amber → red as the conversation grew.
7. Click "force compaction now" mid-conversation. Verify a new compaction event appears in the chart within 10 seconds.

## 9. Open questions

- Where does this view belong: inside Stats (as a sub-tab), standalone top-level view, or as a floating side panel? Default assumption: standalone sidebar item. Reconsider if the sidebar gets too crowded.
- Does `PreCompact` payload reliably include a `reason` or `trigger` field identifying the layer? If not, the classifier falls back to inferring from `cache_deleted_input_tokens` (cached microcompact) vs. relative message count reduction (snip vs. auto-compact). Needs empirical check on a few sample events after RIS-01 ships.
- Should the "projected away" content be fully reconstructable (from append-only transcript + boundary metadata) or just "gone from view"? For 4.0, display-only is fine; full reconstruction slots into RIS-04.
- Token estimator accuracy: 4-chars-per-token is ~15% off for code-heavy conversations. If users report misleading pressure badges, swap in `gpt-tokenizer` NPM package (no runtime overhead for the chart).

## 10. Milestones

- **M1** (week 1): Plugin scaffold + subscription to hook events + raw event log rendered as a list (no chart yet).
- **M2** (week 2): Stacked area chart with live updates + pressure badge.
- **M3** (week 3): Compaction detail pane + layer classifier + force-compaction button + docs.
