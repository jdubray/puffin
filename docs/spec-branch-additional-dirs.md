# Specification: Per-Branch Additional Directories (`--add-dir`)

**Version:** 1.0
**Date:** 2026-03-30
**Status:** Draft

---

## 1. Problem Statement

Claude Code's `--add-dir <path>` flag lets a session span multiple project directories
simultaneously. Today Puffin has no way to configure this per branch — every session
is locked to the single project root. Developers who work across sibling repositories
(e.g. a shared API spec, a component library, or a reference implementation) must
manually copy context into prompts.

This feature adds a branch-level setting that:
1. Registers up to 5 additional directories for a branch.
2. Marks each directory as read/write or **read-only**.
3. Automatically passes `--add-dir` to the Claude CLI when starting a session on that branch.
4. Injects a read-only constraint into every prompt when a directory is restricted.

---

## 2. Functional Requirements

### 2.1 Branch Settings UI

- A new **"Additional Directories"** section is added to the existing Branch Settings
  modal (currently in `src/renderer/components/history-tree/history-tree.js:673–730`).
- The section allows adding 1–5 directory entries. Attempts to add a 6th are blocked
  with a validation message.
- Each entry has:
  - **Path** — free-text input. Absolute paths preferred; relative paths are resolved
    from the project root at runtime.
  - **Label** *(optional)* — a short human name shown in the UI (e.g. "API Spec",
    "Design System"). Defaults to the directory's basename.
  - **Read-Only toggle** — checkbox. When checked, Claude is instructed not to
    create, modify, or delete files in this directory.
- Entries can be removed individually (×  button per row).
- Save/Cancel follow the existing modal pattern (delegating to
  `this.intents.updateBranchSettings(branchId, settings)`).

### 2.2 CLI Integration

When a branch has `additionalDirs` configured and the user submits a prompt:

- For **each** directory, `--add-dir <resolvedPath>` is appended to the Claude CLI
  args (in `buildArgs()`, `src/main/claude-service.js`).
- This applies to `submit()` (interactive sessions). One-shot `sendPrompt()` calls
  (CRE, deriveStories, etc.) are **excluded** — they run in a headless context
  unrelated to branch navigation.
- Relative paths are resolved against the active project root at call time.

### 2.3 Read-Only Constraint Injection

For every directory marked read-only, a **constraint block** is injected into the
branch's CLAUDE.md (generated section, above the `<!-- puffin:generated-end -->`
sentinel). This ensures the constraint is always visible to Claude regardless of
how the session is started.

Example injected block (one per read-only directory):

```
## Read-Only Directory Constraint

The directory `/path/to/design-system` is available for **reference only**.

**You MUST NOT:**
- Create, edit, or delete any file within `/path/to/design-system`
- Use Write, Edit, or Bash commands that target this path

You MAY read any file in this directory using Read, Grep, or Glob.
```

The constraints are regenerated whenever:
- Branch settings are saved (re-generate `CLAUDE_{branch}.md`).
- A branch is activated (`activateBranch()`) — so the active `CLAUDE.md` is always
  up to date.

### 2.4 Validation

| Rule | Error |
|---|---|
| Max 5 directories per branch | "Maximum of 5 additional directories allowed" |
| Empty path field on save | "Path is required for each directory entry" |
| Duplicate path within same branch | "This directory has already been added" |
| Path identical to project root | "Cannot add the project's own root directory" |

Path existence is **not** validated at configuration time — the directory may not
exist on all machines (e.g. a team member cloning the repo without the sibling
project checked out). The CLI will surface the error naturally.

---

## 3. Data Model

### 3.1 Branch object extension

**File:** `.puffin/history.json` — `branches[id]`

```json
{
  "id": "backend",
  "name": "Backend",
  "icon": "server",
  "codeModificationAllowed": true,
  "assignedPlugins": [],
  "additionalDirs": [
    {
      "path": "../api-spec",
      "label": "API Spec",
      "readOnly": true
    },
    {
      "path": "/home/user/shared-utils",
      "label": "Shared Utils",
      "readOnly": false
    }
  ]
}
```

**Schema:**

| Field | Type | Required | Default |
|---|---|---|---|
| `path` | `string` | yes | — |
| `label` | `string` | no | basename of path |
| `readOnly` | `boolean` | yes | `false` |

Maximum array length: **5**.

### 3.2 Default value

New branches initialize with `additionalDirs: []`. Existing branches loaded from
`history.json` without the field default to `[]` via spread/fallback in the state
initializer (`puffin-state.js:292–299`).

---

## 4. Technical Design

### 4.1 State layer (`sam/model.js`)

- Add `additionalDirs: []` to the branch initial state shape (lines ~70–84).
- Extend the `UPDATE_BRANCH_SETTINGS` acceptor (lines ~712–732) to merge
  `settings.additionalDirs` onto `branch.additionalDirs` when present.

### 4.2 Actions (`sam/actions.js`)

No new action required. `updateBranchSettings` already accepts an arbitrary
`settings` object; `additionalDirs` is passed through as part of it.

### 4.3 Persistence (`ipc-handlers.js`)

No change required. `state:updateHistory` already serializes the full `history`
object to `.puffin/history.json`.

### 4.4 CLI args (`src/main/claude-service.js`)

**In `buildArgs(data)`** (lines ~765–815), after the existing `--permission-mode`
block:

```javascript
// Additional directories (per-branch --add-dir support)
const additionalDirs = data.additionalDirs || []
for (const dir of additionalDirs) {
  const resolvedPath = path.isAbsolute(dir.path)
    ? dir.path
    : path.resolve(data.projectPath || this.projectPath, dir.path)
  args.push('--add-dir', resolvedPath)
}
```

`data.additionalDirs` is supplied by the call site (`submit()`). The `submit()`
method already receives a data object built from the current branch; the caller
needs to include `additionalDirs` from the active branch config.

**In `submit()` call site** (`src/renderer/app.js` or wherever `submit()` is
invoked), retrieve `additionalDirs` from the active branch:

```javascript
const activeBranch = this.state.history.branches[this.state.history.activeBranch]
const additionalDirs = activeBranch?.additionalDirs || []
// ... pass to claudeService.submit({ ..., additionalDirs })
```

### 4.5 CLAUDE.md constraint injection (`src/main/claude-md-generator.js`)

**New helper method** `_buildAdditionalDirConstraints(additionalDirs)`:

```javascript
_buildAdditionalDirConstraints(additionalDirs = []) {
  const readOnlyDirs = additionalDirs.filter(d => d.readOnly)
  if (readOnlyDirs.length === 0) return ''

  const blocks = readOnlyDirs.map(dir => {
    const label = dir.label || path.basename(dir.path)
    return [
      `## Read-Only Directory: ${label}`,
      '',
      `The directory \`${dir.path}\` is available for **reference only**.`,
      '',
      '**You MUST NOT:**',
      `- Create, edit, or delete any file within \`${dir.path}\``,
      `- Use Write, Edit, or Bash commands that target this path`,
      '',
      'You MAY read any file in this directory using Read, Grep, or Glob.',
    ].join('\n')
  })
  return blocks.join('\n\n')
}
```

**In `generateBranch(branch, state, ...)`**, after the branch-specific content is
assembled and before the skill/agent content is appended:

```javascript
const branchConfig = state.history?.branches?.[branch] || {}
const dirConstraints = this._buildAdditionalDirConstraints(branchConfig.additionalDirs)
if (dirConstraints) content += '\n\n' + dirConstraints + '\n'
```

This places the read-only constraints **inside** the generated section (above the
sentinel), so they are regenerated on every branch switch and cannot be accidentally
removed by the user.

### 4.6 Branch settings modal (`src/renderer/components/history-tree/history-tree.js`)

The `renderBranchSettingsModal(branch)` method needs a new section appended to the
form (after the existing "Assigned Plugins" fieldset):

```html
<fieldset class="branch-setting-group">
  <legend>Additional Directories</legend>
  <p class="branch-setting-hint">
    These directories are made available to Claude via --add-dir.
    Read-only directories may be referenced but not modified.
  </p>
  <div id="additional-dirs-list">
    <!-- dir rows rendered here -->
  </div>
  <button type="button" id="add-dir-btn" class="btn-secondary btn-sm">
    + Add Directory
  </button>
</fieldset>
```

Each directory row:
```html
<div class="additional-dir-row" data-index="0">
  <input type="text" class="dir-path" placeholder="/path/to/project" value="../api-spec">
  <input type="text" class="dir-label" placeholder="Label (optional)" value="API Spec">
  <label class="dir-readonly">
    <input type="checkbox" class="dir-readonly-toggle" checked>
    Read-only
  </label>
  <button type="button" class="dir-remove-btn" aria-label="Remove">×</button>
</div>
```

**`saveBranchSettings(branchId)`** collects the rows:

```javascript
const additionalDirs = Array.from(
  document.querySelectorAll('.additional-dir-row')
).map(row => ({
  path: row.querySelector('.dir-path').value.trim(),
  label: row.querySelector('.dir-label').value.trim() || undefined,
  readOnly: row.querySelector('.dir-readonly-toggle').checked
})).filter(d => d.path.length > 0)

this.intents.updateBranchSettings(branchId, {
  name, icon, codeModificationAllowed, assignedPlugins, additionalDirs
})
```

---

## 5. Data Flow

```
User saves Branch Settings (additionalDirs: [{path, label, readOnly}])
  │
  ├─► SAM: UPDATE_BRANCH_SETTINGS acceptor merges additionalDirs onto branch
  │       object in model.history.branches[id]
  │
  ├─► state:updateHistory IPC → puffinState.saveHistory()
  │       → .puffin/history.json persisted
  │
  └─► state:regenerateBranchFiles IPC (existing) → claudeMdGenerator.generateBranch()
          → _buildAdditionalDirConstraints() injects read-only blocks into CLAUDE_{branch}.md
          → activateBranch() combines base + branch → CLAUDE.md updated

User submits a prompt (submit())
  │
  ├─► app.js retrieves activeBranch.additionalDirs from model state
  │
  ├─► claudeService.submit({ ..., additionalDirs })
  │
  └─► buildArgs(): --add-dir <resolvedPath> appended for each entry
          → claude CLI receives all configured directories in scope
          → read-only constraint already present in CLAUDE.md (injected above)
```

---

## 6. Edge Cases

| Scenario | Handling |
|---|---|
| Branch has no `additionalDirs` | `[]` default — `buildArgs` emits no `--add-dir` flags; no constraints in CLAUDE.md |
| `--add-dir` flag not supported by installed Claude Code version | CLI exits with error; surfaced normally via existing error handling in `submit()` |
| Directory does not exist at prompt time | Claude CLI surfaces the error; Puffin does not pre-validate |
| Path contains spaces | `args.push('--add-dir', resolvedPath)` passes as a single element — Node.js `spawn` handles quoting correctly without `shell: true` |
| Relative path, project root not set | Resolved against `process.cwd()` as last resort (same fallback used elsewhere) |
| Branch switched while modal is open | Settings saved to the branch the modal was opened for (`branchId` captured at open time) |
| Read-only dir + branch with `codeModificationAllowed: false` | Both constraints present in CLAUDE.md — redundant but harmless |

---

## 7. Out of Scope

- **Per-directory tool restrictions** beyond the read-only prompt constraint.
  Enforcing this at the tool-call level would require Claude Code SDK integration
  not currently available.
- **Directory browsing / file picker UI** — free-text path entry only for v1.
- **Syncing `additionalDirs` across team members** — paths are stored verbatim; teams
  must coordinate path conventions (relative paths recommended for portability).
- **`sendPrompt()` / CRE one-shot calls** — these are headless and branch-independent.

---

## 8. Acceptance Criteria

1. Branch Settings modal displays an "Additional Directories" section with add/remove
   controls; changes persist to `.puffin/history.json` via `updateBranchSettings`.
2. Saving a branch with read-only directories regenerates `CLAUDE_{branch}.md`
   with a constraint block per restricted path.
3. When a prompt is submitted on a branch with `additionalDirs`, the Claude CLI is
   invoked with one `--add-dir <path>` arg per configured directory.
4. Relative paths are resolved against the active project root before being passed
   to the CLI.
5. Adding a 6th directory is blocked with a validation message.
6. Removing all additional directories and saving produces no `--add-dir` args and
   no constraint blocks in CLAUDE.md.
7. Branches without `additionalDirs` (legacy `history.json` entries) behave
   identically to before this feature.
