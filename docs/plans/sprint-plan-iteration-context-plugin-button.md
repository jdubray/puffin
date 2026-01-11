# Implementation Plan: Sprint Plan Iteration Context & Plugin Button

## Executive Summary

This plan covers two independent user stories that share the sprint planning infrastructure:

1. **Story 1 (Context Preservation)** - Enhance the plan iteration flow to include full context (user stories + latest plan) across multiple iteration cycles
2. **Story 2 (Plugin Button)** - Add a fourth implementation button for plugin development

Both stories touch the SAM pattern architecture in `src/renderer/sam/model.js` but operate on different subsystems.

---

## Architecture Analysis

### Current System Overview

**Plan Iteration Flow:**
```
User selects stories → createSprint()
       ↓
User clicks "Plan" → startSprintPlanning()
       ↓
Model builds planning prompt (stories only)
       ↓
Claude responds → plan captured in model.activeSprint.plan
       ↓
User clicks "Iterate" → showPlanIterationModal()
       ↓
Modal extracts questions (lines ending with ?)
       ↓
User provides clarifications → iterateSprintPlan(clarifications)
       ↓
NEW prompt built with clarifications + stories (but NOT previous plan)
       ↓
Cycle repeats...
```

**Key Discovery - The Bug:**
The current `iterateSprintPlanAcceptor` in `src/renderer/sam/model.js` (lines 2259-2349) does NOT include the previous plan in the iteration prompt. It only includes:
- Developer clarifications
- User story descriptions

This means **context is lost** on each iteration - exactly what Story 1 needs to fix.

**Implementation Button Group:**
Located in `src/renderer/app.js` (lines 2987-3024), the `renderStoryBranchButtons()` method renders three hardcoded buttons:
```javascript
const branches = [
  { id: 'ui', label: 'UI', icon: '🎨' },
  { id: 'backend', label: 'Backend', icon: '⚙️' },
  { id: 'fullstack', label: 'Full Stack', icon: '🔗' }
]
```

Branch targeting is handled in `src/renderer/sam/model.js` (lines 2385-2390) with a direct mapping.

### Shared Dependencies

| Component | Story 1 | Story 2 |
|-----------|---------|---------|
| `src/renderer/sam/model.js` | ✓ Modify | ✓ Modify |
| `src/renderer/app.js` | ✓ Modify | ✓ Modify |
| `src/renderer/styles/components.css` | - | ✓ (if needed) |

The stories are **independent** and can be implemented in parallel. However, implementing Story 1 first is recommended as it establishes patterns for context handling that may inform future enhancements.

---

## Implementation Order

**Recommended: Story 1 → Story 2**

Rationale:
1. Story 1 fixes a functional bug (lost context) - higher priority
2. Story 2 is purely additive (new button) - lower risk
3. No technical dependencies between them, but Story 1 establishes context patterns

---

## Story 1: Preserve Previous Plan Context During Iteration

### Complexity: **Low-Medium**

The fix is straightforward - the infrastructure exists, we just need to include the plan in the iteration prompt.

### Technical Approach

**Current Problem:**
In `iterateSprintPlanAcceptor` (model.js lines 2259-2349), the iteration prompt template does NOT include `sprint.plan`. The prompt includes:
- `clarifications` (user's answers)
- `storyDescriptions` (user story details)

But it's **missing** the current plan text.

**Solution:**
1. Include `sprint.plan` in the iteration prompt before the clarifications section
2. Add iteration counter tracking
3. Optionally track iteration history for debugging

### File Changes

#### File 1: `src/renderer/sam/model.js`

**Location:** `iterateSprintPlanAcceptor` function (lines 2259-2349)

**Change 1:** Add plan context to iteration prompt (around line 2295)

Current prompt structure:
```javascript
const iterationPrompt = `## Sprint Plan Iteration Request
...
### Developer Clarifications:
${clarifications}
...
Please create an updated implementation plan for these user stories:
${storyDescriptions}
...`
```

New prompt structure:
```javascript
const iterationPrompt = `## Sprint Plan Iteration Request
...
### Developer Clarifications:
${clarifications}

Current iteration of the plan:

${sprint.plan}
...
Please create an updated implementation plan for these user stories:
${storyDescriptions}
...`
```

**Change 2:** Track iteration count

Add to sprint model initialization (or in the acceptor):
```javascript
// Track iteration count
const iterationCount = (sprint.iterationCount || 0) + 1
model.activeSprint.iterationCount = iterationCount
```

Optionally include in prompt header:
```javascript
const iterationPrompt = `## Sprint Plan Iteration Request (Iteration ${iterationCount})
...`
```

### Implementation Steps

1. **Read the current `iterateSprintPlanAcceptor` function** in `src/renderer/sam/model.js`
2. **Locate the prompt construction** (around line 2295-2312)
3. **Add `sprint.plan` inclusion** before the clarifications section
4. **Add iteration counter** - increment and store on `model.activeSprint.iterationCount`
5. **Test the flow:**
   - Create a sprint with stories
   - Generate initial plan
   - Click "Iterate" and provide clarifications
   - Verify the new prompt includes both the previous plan AND clarifications
   - Repeat iteration 2-3 times to verify context accumulates

### Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| 1. Includes original user stories | ✓ Already present via `storyDescriptions` |
| 2. Includes most recent generated plan | Add `sprint.plan` to prompt template |
| 3. Includes current iteration answers | ✓ Already present via `clarifications` |
| 4. Context preserved across iterations | Automatic - each iteration captures new plan |
| 5. No data loss through cycles | Test with 3+ iterations |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Prompt becomes very large | Low | Claude handles large prompts well; no limit requested |
| Plan formatting issues | Low | Use code fence or clear section headers |
| Iteration count off-by-one | Low | Initialize to 0, increment before use |

---

## Story 2: Add Plugin Implementation Button

### Complexity: **Low**

This is a pattern replication task - copying the existing button structure with new values.

### Technical Approach

Add a fourth button following the exact same pattern as UI/Backend/Fullstack:
- Icon: `📦` (package emoji - represents plugins/modules)
- ID: `plugin`
- Label: `Plugin`
- Target branch: `plugin` (will be created as "Plugin" display name)

### File Changes

#### File 1: `src/renderer/app.js`

**Location:** `renderStoryBranchButtons` method (lines 2987-3024)

**Change:** Add plugin to branches array

```javascript
// Current (line ~2988-2992):
const branches = [
  { id: 'ui', label: 'UI', icon: '🎨' },
  { id: 'backend', label: 'Backend', icon: '⚙️' },
  { id: 'fullstack', label: 'Full Stack', icon: '🔗' }
]

// Updated:
const branches = [
  { id: 'ui', label: 'UI', icon: '🎨' },
  { id: 'backend', label: 'Backend', icon: '⚙️' },
  { id: 'fullstack', label: 'Full Stack', icon: '🔗' },
  { id: 'plugin', label: 'Plugin', icon: '📦' }
]
```

#### File 2: `src/renderer/sam/model.js`

**Location:** `startSprintStoryImplementationAcceptor` function (lines 2368-2459)

**Change:** Add plugin to branch map (around line 2385-2390)

```javascript
// Current:
const branchMap = {
  'ui': 'ui',
  'backend': 'backend',
  'fullstack': 'fullstack'
}

// Updated:
const branchMap = {
  'ui': 'ui',
  'backend': 'backend',
  'fullstack': 'fullstack',
  'plugin': 'plugin'
}
```

The branch will automatically be created with display name "Plugin" by the existing logic (line 2431-2436):
```javascript
if (!model.history.branches[targetBranch]) {
  model.history.branches[targetBranch] = {
    id: targetBranch,
    name: targetBranch.charAt(0).toUpperCase() + targetBranch.slice(1),  // "Plugin"
    prompts: []
  }
}
```

#### File 3: `src/renderer/styles/components.css` (Optional - likely not needed)

The existing button styling is generic and will apply to the new button automatically. No CSS changes required unless we want a distinct color for the plugin button.

### Implementation Steps

1. **Add plugin button to `renderStoryBranchButtons`** in app.js
2. **Add plugin to branch map** in model.js
3. **Test the button:**
   - Verify button appears in sprint story cards
   - Verify hover/active states work correctly
   - Click button and verify implementation flow starts
   - Verify correct branch is created/targeted

### Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| 1. Plugin button appears alongside existing buttons | Add to `branches` array in `renderStoryBranchButtons` |
| 2. Clicking triggers plan generation | Existing click handler + action will handle |
| 3. Targets Plugin Development branch | Add to `branchMap` with value `'plugin'` |
| 4. Same visual styling | Automatic - uses `.story-branch-btn` class |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Button overflow on narrow screens | Very Low | Existing flex-wrap handles this |
| Inconsistent icon rendering | Very Low | Test emoji renders correctly |

---

## Combined Risk Assessment

| Risk | Story | Severity | Mitigation |
|------|-------|----------|------------|
| Prompt size growth | 1 | Low | No limit requested; monitor if issues arise |
| Context formatting | 1 | Low | Clear section headers in prompt template |
| Button layout changes | 2 | Very Low | Existing responsive CSS handles 4 buttons |
| Testing coverage | Both | Low | Manual testing through iteration cycles |

---

## Estimated Complexity Summary

| Story | Complexity | Estimated Changes | Rationale |
|-------|------------|-------------------|-----------|
| Story 1 | Low-Medium | ~20 lines in 1 file | Simple prompt template modification + counter |
| Story 2 | Low | ~5 lines in 2 files | Pattern replication - add to existing arrays |

---

## Open Questions

None remaining - all questions have been resolved through codebase exploration:

1. ✅ **Iteration state management:** Managed through SAM acceptors in model.js, sprint state stored on `model.activeSprint`
2. ✅ **Button group location:** `src/renderer/app.js` lines 2987-3024 in `renderStoryBranchButtons()`
3. ✅ **Branch targeting:** Hardcoded in `branchMap` object in model.js (lines 2385-2390)

---

## Testing Plan

### Story 1 Tests
1. Create sprint with 2+ user stories
2. Generate initial plan
3. Click "Iterate", provide clarifications
4. Verify new plan prompt shows in console/UI with:
   - Original user stories
   - Previous plan content
   - Current clarifications
5. Repeat iteration 3 times, verify no context loss
6. Check iteration counter increments correctly

### Story 2 Tests
1. Create sprint with user stories
2. Verify 4 buttons appear: UI, Backend, Full Stack, Plugin
3. Click Plugin button
4. Verify toast shows "Starting plugin implementation..."
5. Verify branch panel shows "Plugin" branch
6. Verify implementation prompt is generated
7. Test button states (pending, in-progress, completed)
