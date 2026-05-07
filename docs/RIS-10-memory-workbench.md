# RIS-10: Memory Workbench

**Target**: Puffin 4.0
**Dependencies**: existing Memory Plugin (integrates with, does not replace)
**Delivery**: plugin-only (`memory-workbench-plugin`)
**Estimated effort**: 1.5 sprints

---

## 1. Motivation

The paper's Section 7.2 documents Claude Code's CLAUDE.md hierarchy as four levels — **managed** (OS-level policy), **user** (`~/.claude/CLAUDE.md`), **project** (`CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md`), and **local** (`CLAUDE.local.md`). Files load in reverse-priority order so later-loaded files receive more model attention; unconditional rules from `.claude/rules/` load eagerly for root-to-CWD directories but *lazily* for nested directories below CWD, meaning the model's instruction set can change mid-conversation. The `@include` directive supports transitive inclusion with four syntax variants. This is genuinely hard to reason about by reading files. A user edits one CLAUDE.md and cannot easily predict what the model will actually see on the next turn. Puffin's existing Memory Plugin captures *outputs* of agent conversations; what is missing is a **presentation layer** showing what the agent receives as *inputs* — the resolved, concatenated, conflict-annotated view of all instructions that will actually enter the prompt. This spec provides that view. Integration point: the four-level CLAUDE.md file hierarchy on disk.

## 2. User-facing behavior

- A new "Memory Workbench" sidebar item opens a three-pane layout:
  1. **Source tree** — a file tree grouped by level (Managed / User / Project / Local / Nested rules), showing every CLAUDE.md and referenced file. Each file shows its path, last-modified time, and whether it is currently loaded (eager) or deferred (lazy).
  2. **Resolved view** — the single concatenated text the model will actually see for the current branch/CWD, in load order, with source-file indicators in the margin (like a git blame). @include directives are resolved inline; circular references are flagged.
  3. **Conflicts & analysis** — a panel listing detected conflicts (same topic stated differently at different levels), duplications (same rule stated twice), and load-order anomalies (e.g., a user-level rule that will always be overridden by a project-level rule).
- A toggle switches the resolved view between "what the model sees now" and "what the model will see after the next CLAUDE.md file is lazy-loaded" (if the user is about to `cd` into a directory with its own rules).
- A "Promote to CLAUDE.md" button integrates with the existing Memory Plugin: captured memories can be promoted to a chosen CLAUDE.md file (user, project, local) with a preview of the final text before writing.
- A "Lint" action runs rule-level analysis: rules that contradict (e.g., "use 2-space indentation" at project level + "use 4-space indentation" at local level), rules written ambiguously, rules so specific they will rarely match.
- A "Diff what Claude sees" action compares the resolved view between two branches or two timestamps, useful for understanding why behavior changed after a CLAUDE.md edit.

## 3. Architectural decisions

1. **Workbench reads files; it does not cache or duplicate.** On activation, the plugin scans the four levels using platform-specific paths; `fs.watch` handles live updates. No database tables.
2. **@include resolution is fully transitive.** The resolver tracks visited paths to prevent cycles, preserves @include origin in the resolved view so the user can trace any line back to its source, and correctly handles all four syntax variants (`@path`, `@./relative`, `@~/home`, `@/absolute`).
3. **Lazy-load detection is CWD-aware.** The resolver reads the current branch's working directory (Puffin knows this via the active branch's `additionalDirs` config) and applies the "eager for root-to-CWD, lazy for below-CWD" rule exactly as the paper documents.
4. **Conflict detection is textual-first, semantic-optional.** The default conflict detector is string-level: it groups rules by topic keywords (simple n-gram matching) and flags duplicates or near-duplicates. A "deep analysis" mode runs a Haiku call to detect semantic conflicts (e.g., "prefer functional style" vs. "use class-based components"). Deep mode is opt-in because it costs tokens.
5. **Integrates with Memory Plugin, does not replace it.** The Memory Plugin continues to capture memories from conversations. Memory Workbench provides the surface between captured memory and the CLAUDE.md files the model reads. Promotion is always a user-initiated action, never automatic.
6. **Edits respect level ownership.** The resolved view is read-only; to edit, the user clicks a line and jumps to the source file in the editor. This prevents accidental cross-level edits and keeps the workbench's model of the filesystem accurate.

## 4. Data model

No schema changes.

## 5. Main-process work

### Files created

- `src/main/services/claude-md-discovery.js` — `discoverAll(projectPath, branchCwd)` returns all CLAUDE.md and `.claude/rules/*.md` files from the four levels. Platform-aware (Linux: `/etc/claude-code/`, macOS: `/Library/Application Support/ClaudeCode/`, Windows: `%PROGRAMDATA%\ClaudeCode\`).
- `src/main/services/claude-md-resolver.js` — `resolve(files, opts)` returns the resolved text with source annotations, handles @include cycles, and preserves load order. Pure function over a list of files.
- `src/main/services/claude-md-linter.js` — `lint(resolved, opts)` returns `{ conflicts, duplicates, anomalies }`. Textual by default, semantic-via-Haiku if `opts.deep`.
- `src/main/services/claude-md-promoter.js` — `promote(memoryEntry, targetFilePath, position)` writes to a CLAUDE.md file at a chosen position (append / prepend / under a specific heading).

### Files modified

- `src/main/ipc-handlers.js`: new `setupMemoryWorkbenchHandlers(ipcMain)`:
  - `memoryWorkbench:discover` (invoke) — returns file tree
  - `memoryWorkbench:resolve` (invoke) — returns resolved view with source annotations
  - `memoryWorkbench:lint` (invoke) — returns conflict/duplicate analysis
  - `memoryWorkbench:promote` (invoke) — writes captured memory to a CLAUDE.md
  - `memoryWorkbench:diff` (invoke) — diffs two resolved views
  - `memoryWorkbench:openSource` (invoke) — opens a specific source file in the editor plugin
- `src/main/preload.js`: expose `puffin.memoryWorkbench.*`.

### New IPC channels

As listed.

## 6. Renderer work

### Plugin manifest — `plugins/memory-workbench-plugin/puffin-plugin.json`

```json
{
  "name": "memory-workbench",
  "version": "1.0.0",
  "displayName": "Memory Workbench",
  "description": "Inspect and edit the CLAUDE.md hierarchy the model actually sees",
  "main": "index.js",
  "dependencies": { "memory-plugin": ">=1.0.0" },
  "extensionPoints": {
    "components": ["memory-workbench", "resolved-view", "conflict-panel"]
  },
  "contributions": {
    "menus": {
      "sidebar": [{ "id": "memory-workbench", "label": "Memory Workbench", "icon": "🧾", "component": "memory-workbench" }]
    }
  },
  "activationEvents": ["onStartup"]
}
```

### Files created

- `plugins/memory-workbench-plugin/index.js`.
- `plugins/memory-workbench-plugin/renderer/memory-workbench.js` — top-level three-pane layout.
- `plugins/memory-workbench-plugin/renderer/source-tree.js` — left pane.
- `plugins/memory-workbench-plugin/renderer/resolved-view.js` — center pane with source-annotated lines.
- `plugins/memory-workbench-plugin/renderer/conflict-panel.js` — right pane.
- `plugins/memory-workbench-plugin/renderer/promote-modal.js` — modal for promoting memories.
- `plugins/memory-workbench-plugin/renderer/diff-view.js` — resolved-view diff.
- `plugins/memory-workbench-plugin/renderer/styles.css`.

## 7. Inspection assertions

```json
[
  { "id": "IA1", "criterion": "AC1", "type": "FILE_EXISTS", "target": "src/main/services/claude-md-discovery.js", "assertion": { "type": "file" }, "message": "Discovery service exists" },
  { "id": "IA2", "criterion": "AC1", "type": "FUNCTION_SIGNATURE", "target": "src/main/services/claude-md-discovery.js", "assertion": { "functionName": "discoverAll", "parameters": ["projectPath", "branchCwd"] }, "message": "discoverAll has correct signature" },
  { "id": "IA3", "criterion": "AC2", "type": "FILE_EXISTS", "target": "src/main/services/claude-md-resolver.js", "assertion": { "type": "file" }, "message": "Resolver service exists" },
  { "id": "IA4", "criterion": "AC2", "type": "EXPORT_EXISTS", "target": "src/main/services/claude-md-resolver.js", "assertion": { "exports": [{ "name": "resolve", "type": "function" }] }, "message": "resolve is exported" },
  { "id": "IA5", "criterion": "AC3", "type": "FILE_EXISTS", "target": "src/main/services/claude-md-linter.js", "assertion": { "type": "file" }, "message": "Linter service exists" },
  { "id": "IA6", "criterion": "AC4", "type": "FILE_EXISTS", "target": "src/main/services/claude-md-promoter.js", "assertion": { "type": "file" }, "message": "Promoter service exists" },
  { "id": "IA7", "criterion": "AC4", "type": "FUNCTION_SIGNATURE", "target": "src/main/services/claude-md-promoter.js", "assertion": { "functionName": "promote", "parameters": ["memoryEntry", "targetFilePath", "position"] }, "message": "promote has correct signature" },
  { "id": "IA8", "criterion": "AC5", "type": "FILE_CONTAINS", "target": "src/main/preload.js", "assertion": { "pattern": "puffin.memoryWorkbench" }, "message": "Preload exposes memoryWorkbench API" },
  { "id": "IA9", "criterion": "AC6", "type": "JSON_PROPERTY", "target": "plugins/memory-workbench-plugin/puffin-plugin.json", "assertion": { "path": "dependencies.memory-plugin", "exists": true }, "message": "Plugin declares memory-plugin dependency" }
]
```

## 8. Manual verification steps

1. Create a project with: a user `~/.claude/CLAUDE.md` containing `Prefer TypeScript.`, a project `CLAUDE.md` containing `Prefer JavaScript.`, and a project `.claude/rules/style.md` containing `Use 2-space indentation.`.
2. Open Memory Workbench. Verify the source tree shows all three files grouped by level.
3. Click any file to highlight it. Verify the resolved view jumps to the relevant section.
4. Verify the resolved view shows load order: user → project → rules (later files override).
5. Verify the conflict panel flags "Prefer TypeScript" vs. "Prefer JavaScript" as a conflict.
6. Add an @include in project CLAUDE.md referencing `./extra-rules.md`. Create that file with a rule. Verify the resolved view inlines the included content with a source annotation linking to `extra-rules.md`.
7. Create a circular include (A includes B, B includes A). Verify the linter flags it and the resolver does not infinite-loop.
8. Open a captured memory in the Memory Plugin. Click "Promote to CLAUDE.md". Verify the modal previews the result and writes to the chosen file on confirm.
9. Edit a CLAUDE.md externally. Verify `fs.watch` picks up the change and the resolved view updates within 2 seconds.
10. Run Lint with deep analysis enabled on a project with known stylistic contradictions. Verify the Haiku call returns semantic conflicts distinct from textual duplicates.

## 9. Open questions

- Managed-policy paths differ across platforms and may be protected. Puffin's plugin should read them if accessible and silently note "not accessible" otherwise (without failing the whole workbench). Windows especially may require elevation.
- Does the CWD for lazy-load detection come from the active Puffin branch's working directory or Claude Code's internal notion of CWD (which can diverge via `--add-dir`)? Resolve by anchoring to the active branch's `additionalDirs` config plus the project root.
- Promotion conflicts: if the target CLAUDE.md already contains a contradictory rule, should the promoter auto-edit or require manual resolution? Default: require manual resolution. Surface the conflict in the modal and let the user edit before writing.
- Semantic lint via Haiku can cost real money over time. Make the "deep analysis" toggle persistent but require explicit re-enable per session so it does not run silently.
- Diff view across timestamps requires git history of CLAUDE.md files; if files are `.gitignore`d (CLAUDE.local.md specifically is), the diff falls back to Puffin's own periodic snapshots. Is periodic snapshotting in scope for 4.0? Defer; for 4.0, diff only supports branch-vs-branch and current-vs-commit.

## 10. Milestones

- **M1** (week 1): Discovery + resolver (synchronous, no @include) + basic resolved view rendering.
- **M2** (week 2): @include resolution + circular detection + source-annotated margin view.
- **M3** (week 3): Linter (textual) + conflict panel + Memory Plugin promotion integration + docs.
- **M4** (optional, week 3–4 if time allows): Deep analysis via Haiku + diff view.
