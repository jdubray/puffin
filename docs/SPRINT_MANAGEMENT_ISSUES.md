---

# Sprint Functionality Bug Report

## Summary

I've identified **two critical bugs** that are breaking the Sprint Management feature. The issues are related to the recently added "Sprint History" feature in the backlog view.

---

## Critical Bug #1: Missing State Properties in `state.js`

**Location:** `src/renderer/sam/state.js` (lines 18-113)

**Problem:** The computed state does NOT include `sprintHistory` or `selectedSprintFilter`, but the `user-stories.js` component expects them.

**Evidence:**
- `user-stories.js:308` accesses `state.sprintHistory`
- `user-stories.js:315` accesses `state.selectedSprintFilter`
- `state.js` has NO reference to either property

**Impact:** The sprint history panel and sprint filtering in the backlog view will always show empty/null values because the state is never passed through the SAM pattern's state computation layer.

**Fix Required:** Add these two lines to `computeState()` in `state.js`:
```javascript
// In computeState() return object:
sprintHistory: model.sprintHistory || [],
selectedSprintFilter: model.selectedSprintFilter || null,
```

---

## Critical Bug #2: Missing `sprintHistory` in Backend `getState()`

**Location:** `src/main/puffin-state.js:154-169`

**Problem:** The `getState()` method does NOT include `sprintHistory` in its return object, so even though sprint history is loaded from disk, it's never sent to the renderer.

**Evidence:**
```javascript
// puffin-state.js:154-169
getState() {
  return {
    projectPath: this.projectPath,
    projectName: path.basename(this.projectPath),
    config: this.config,
    history: this.history,
    architecture: this.architecture,
    userStories: this.userStories,
    archivedStoriesCount: this.archivedStories?.length || 0,
    activeSprint: this.activeSprint,  // ✓ 
included
    storyGenerations: this.storyGenerations,
    uiGuidelines: this.uiGuidelines,
    gitOperations: this.gitOperations,
    claudePlugins: this.claudePlugins
    // ❌ 
sprintHistory is NOT included!
  }
}
```

**Fix Required:** Add `sprintHistory` to the return object:
```javascript
sprintHistory: this.sprintHistory?.sprints || [],
```

---

## Additional Issue: Model `loadStateAcceptor` Doesn't Load Sprint History

**Location:** `src/renderer/sam/model.js:283-314`

**Problem:** Even if the backend sends `sprintHistory`, the `loadStateAcceptor` doesn't assign it to the model.

**Evidence:**
```javascript
// model.js:283-314 - loadStateAcceptor
model.projectPath = state.projectPath
model.projectName = state.projectName
model.config = state.config
model.history = state.history
model.architecture = state.architecture
model.userStories = state.userStories || []
model.activeSprint = state.activeSprint || null  // ✓ 
activeSprint is loaded
model.storyGenerations = state.storyGenerations || model.storyGenerations
model.uiGuidelines = state.uiGuidelines || model.uiGuidelines
// ❌ 
sprintHistory is NOT loaded!
```

**Fix Required:** Add this line:
```javascript
model.sprintHistory = state.sprintHistory || []
```

---

## Root Cause Summary

The Sprint History feature was added to `user-stories.js` with:
1. UI components for displaying past sprints
2. Actions (`loadSprintHistory`, `setSprintFilter`, `clearSprintFilter`)
3. Acceptors in `model.js`
4. IPC handlers for loading/archiving sprints

**But the data flow was incomplete:**

```
Backend (puffin-state.js)
    ↓ getState() - ❌ 
Missing sprintHistory
Renderer (loadStateAcceptor)
    ↓ model assignment - ❌ 
Missing sprintHistory
State (computeState)
    ↓ state computation - ❌ 
Missing sprintHistory, selectedSprintFilter
Component (user-stories.js)
    ↓ subscribeToState - Always gets undefined/empty
```

---

## Workaround Currently in Use

The `user-stories.js` component has a workaround at lines 76-91 that loads sprint history directly via IPC on initialization:

```javascript
async loadSprintHistory() {
  if (!window.puffin?.state?.getSprintHistory) {
    return
  }
  const result = await window.puffin.state.getSprintHistory()
  if (result.success && result.sprints) {
    this.sprintHistory = result.sprints
    this.intents.loadSprintHistory(result.sprints)
    this.renderSprintHistory()
  }
}
```

This means sprint history **does work** on initial load, but the state doesn't flow through SAM properly, which could cause issues with:
- State synchronization after sprint close/archive
- Reactivity when sprints are modified
- Other components needing access to sprint history

---

## Recommended Fixes (Priority Order)

### Fix 1: Add to `puffin-state.js:getState()`
```javascript
sprintHistory: this.sprintHistory?.sprints || [],
```

### Fix 2: Add to `model.js:loadStateAcceptor`
```javascript
model.sprintHistory = state.sprintHistory || []
```

### Fix 3: Add to `state.js:computeState()`
```javascript
sprintHistory: model.sprintHistory || [],
selectedSprintFilter: model.selectedSprintFilter || null,
```

---

## Other Potential Issues Found (Lower Priority)

1. **Missing `_userStoriesUpdated` flag** in `completeStoryBranchAcceptor` (model.js:2359-2363) - Story status updates may not persist properly.

2. **Story status sync between sprint and backlog** - Multiple acceptors update status in different locations without consistent synchronization.

3. **Timestamp extraction missing** in `startSprintStoryImplementationAcceptor` (model.js:2210) - Uses `Date.now()` inline instead of extracting from payload.

These are less critical than the state flow issues but should be addressed for robustness.