# Implementation Plan: Plugin Context Injection in CLAUDE.md

## Story Overview

**Story**: Plugin Context Injection in CLAUDE.md
**Description**: As a user, I want assigned plugin content to be automatically included in CLAUDE.md when working on a branch so that Claude receives the plugin's guidance context

**Acceptance Criteria**:
1. CLAUDE.md generation checks for plugins assigned to the current branch
2. Assigned plugin markdown content is appended to CLAUDE.md under a 'Skills' section
3. Multiple plugins are concatenated in the order they were assigned
4. Plugin content is only included when at least one plugin is assigned

---

## Architecture Analysis

### Current State

The system has two separate but related subsystems:

1. **CLAUDE.md Generation** (`src/main/claude-md-generator.js`)
   - Maintains branch-specific files: `CLAUDE_base.md`, `CLAUDE_{branch}.md`
   - Combines base + branch content into active `CLAUDE.md` via `activateBranch()`
   - Has no awareness of the plugin system

2. **Plugin Assignment System** (`src/main/puffin-state.js`)
   - Tracks plugins assigned to branches via `branch.assignedPlugins[]`
   - Has `getBranchSkillContent(branchId)` that returns combined skill markdown
   - Already formats content as `# Assigned Skills\n\n## {plugin.name}\n\n{content}`

### Gap

The `ClaudeMdGenerator` class operates independently without access to `PuffinState`. When `activateBranch()` is called, it only reads static files from disk - it doesn't query for assigned plugins.

### Solution Approach

**Option A: Inject at Generation Time** (Selected)
- Modify `generateBranch()` to accept plugin content as a parameter
- Pass plugin skill content when generating branch files
- Regenerate CLAUDE.md when plugins are assigned/unassigned

**Option B: Inject at Activation Time**
- Modify `activateBranch()` to append skill content dynamically
- Would require reading plugin content on every branch switch
- More complex as `activateBranch()` would need PuffinState access

**Decision**: Option A is cleaner - generate the content into the branch file, then activation just combines files as before.

---

## Implementation Order

1. **Step 1**: Modify `ClaudeMdGenerator.generateBranch()` to accept and include plugin skill content
2. **Step 2**: Update IPC handlers to pass skill content when generating branch files
3. **Step 3**: Trigger CLAUDE.md regeneration when plugins are assigned/unassigned
4. **Step 4**: Test end-to-end flow

---

## Technical Approach

### Step 1: Update ClaudeMdGenerator

**File**: `src/main/claude-md-generator.js`

Modify `generateBranch()` to accept an optional `skillContent` parameter:

```javascript
async generateBranch(branch, state, skillContent = '') {
  let content = ''

  switch (branch) {
    // ... existing cases
  }

  // Append skills section if plugins are assigned
  if (skillContent) {
    content += '\n' + skillContent
  }

  await fs.writeFile(...)
}
```

The `skillContent` will already be formatted by `PuffinState.getBranchSkillContent()` as:
```markdown
# Assigned Skills

## Plugin Name

{plugin skill content}

---

## Another Plugin

{another plugin content}
```

### Step 2: Update IPC Handlers

**File**: `src/main/ipc-handlers.js`

When `generateAll()` or `updateBranch()` is called, fetch skill content for each branch:

```javascript
// In generateAll flow
for (const branch of branches) {
  const skillContent = puffinState.getBranchSkillContent(branch)
  await claudeMdGenerator.generateBranch(branch, state, skillContent)
}
```

### Step 3: Regenerate on Plugin Assignment

**File**: `src/main/ipc-handlers.js`

After plugin assignment/unassignment, regenerate the affected branch:

```javascript
ipcMain.handle('state:assignPluginToBranch', async (event, { pluginId, branchId }) => {
  const branch = await puffinState.assignPluginToBranch(pluginId, branchId)

  // Regenerate branch CLAUDE.md with updated skills
  const state = puffinState.getState()
  const skillContent = puffinState.getBranchSkillContent(branchId)
  await claudeMdGenerator.generateBranch(branchId, state, skillContent)

  // If this is the active branch, reactivate to update CLAUDE.md
  if (branchId === state.activeBranch) {
    await claudeMdGenerator.activateBranch(branchId)
  }

  return { success: true, branch }
})
```

Same pattern for `unassignPluginFromBranch`.

---

## File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/main/claude-md-generator.js` | Modify | Add `skillContent` parameter to `generateBranch()` and append to output |
| `src/main/ipc-handlers.js` | Modify | Pass skill content to generator; regenerate on assign/unassign |

---

## Risk Assessment

### Low Risk
- **Backward Compatibility**: Adding an optional parameter with default value maintains existing behavior
- **Formatting**: `getBranchSkillContent()` already exists and formats correctly

### Medium Risk
- **Branch ID Mismatch**: The `branches` array in `generateAll()` uses hardcoded names (`ui`, `backend`, etc.) but plugin assignments use branch IDs which may differ
  - **Mitigation**: Use the same branch identifier consistently; may need to normalize branch names

### Edge Cases to Handle
1. **No plugins assigned**: `skillContent` will be empty string, no section added (AC#4)
2. **Plugin uninstalled**: Already handled by `removePluginFromAllBranches()` in PuffinState
3. **Invalid plugin ID in assignment array**: `getBranchPlugins()` filters nulls

---

## Estimated Complexity

**Rating: Low**

- Uses existing infrastructure (`getBranchSkillContent()` is already implemented)
- Minimal code changes (< 50 lines modified)
- Clear integration points
- No new dependencies or architectural changes

---

## Test Plan

1. **Unit Tests**
   - `generateBranch()` with empty skill content produces original output
   - `generateBranch()` with skill content appends Skills section

2. **Integration Tests**
   - Assign plugin to branch → verify CLAUDE.md contains Skills section
   - Unassign plugin → verify Skills section removed
   - Multiple plugins → verify all appear in order
   - Switch branches → verify correct skills for each branch

3. **Manual Verification**
   - Install a plugin with test skill content
   - Assign to `ui` branch
   - Check `.claude/CLAUDE_ui.md` contains Skills section
   - Activate `ui` branch
   - Check `.claude/CLAUDE.md` contains Skills section
   - Unassign plugin
   - Verify Skills section removed from both files
