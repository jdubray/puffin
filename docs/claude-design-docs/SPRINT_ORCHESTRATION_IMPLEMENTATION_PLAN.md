I'll analyze the codebase to understand the current architecture and create a comprehensive implementation plan for these sprint execution stories.Excellent! Now I have a comprehensive understanding of the sprint execution architecture. Let me create a detailed implementation plan for these four user stories.

---

# Sprint Execution Features - Implementation Plan

## 1. Architecture Analysis

### Shared Components and Dependencies

These four stories are closely interconnected and share several concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                    SPRINT EXECUTION CONTROLLER                  │
│                    (New: sprintExecutionService)                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Iteration       │  │ Auto-Continue   │  │ Stuck           │ │
│  │ Counter         │  │ Timer           │  │ Detector        │ │
│  │ (Story 1)       │  │ (Story 2)       │  │ (Story 3)       │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                ▼                                │
│                    ┌─────────────────────┐                     │
│                    │ Sprint Execution    │                     │
│                    │ State Machine       │                     │
│                    └─────────────────────┘                     │
├─────────────────────────────────────────────────────────────────┤
│                    VALIDATION LAYER                             │
│                    ┌─────────────────────┐                     │
│                    │ Story Limit         │                     │
│                    │ Validator           │                     │
│                    │ (Story 4)           │                     │
│                    └─────────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

**Shared State Properties (to add to model):**
```javascript
sprintExecution: {
  maxIterations: 10,           // Story 1: default max
  currentIteration: 0,         // Story 1: counter
  autoContinueDelay: 20000,    // Story 2: 20 seconds
  autoContinueTimerId: null,   // Story 2: active timer
  autoContinueRemaining: 0,    // Story 2: countdown display
  iterationHistory: [],        // Story 3: for similarity detection
  stuckThreshold: 3,           // Story 3: consecutive similar limit
  isStuck: false,              // Story 3: stuck state flag
  stuckAlert: null             // Story 3: alert data for UI
}
```

---

## 2. Implementation Order

### Recommended Order: Story 4 → Story 1 → Story 2 → Story 3

| Order | Story | Rationale |
|-------|-------|-----------|
| **1st** | Story 4: Sprint Story Limit | Foundation - prevents invalid sprints from ever being created. Partially implemented but needs UI feedback. Lowest risk, quick win. |
| **2nd** | Story 1: Max Iterations | Core counter infrastructure needed by Stories 2 & 3. Must know iteration count before timing or detection. |
| **3rd** | Story 2: Auto-Continue Delay | Builds on iteration counter. Timer management is prerequisite for stuck detection (determines when to check). |
| **4th** | Story 3: Stuck Detection | Most complex. Requires iteration tracking (Story 1) and hooks into continue flow (Story 2). |

### Dependency Graph:
```
Story 4 (Limit)
    │
    └─► Story 1 (Max Iterations)
            │
            └─► Story 2 (Auto-Continue Delay)
                    │
                    └─► Story 3 (Stuck Detection)
```

---

## 3. Technical Approach Per Story

### Story 4: Sprint Story Limit Enforcement

**Current State:** Validation exists in `createSprintAcceptor` (model.js:1798-1811) with `MAX_SPRINT_STORIES = 4`. However, the error is stored but not prominently displayed to users.

**Technical Approach:**
1. Add prominent error banner in UI when `sprintError` is set
2. Add validation to the "Start Sprint" button (disable if > 4 selected)
3. Show live counter: "3 of 4 stories selected"
4. Clear error state when user deselects stories

**Key Decision:** Prevent rather than reject - disable UI affordances before user can submit invalid sprint.

### Story 1: Default Maximum Iterations Configuration

**Technical Approach:**
1. Add `maxIterations` to sprint model with default of 10
2. Add iteration counter (`currentIteration`) that increments on each Claude response
3. Display counter in sprint header: "Iteration 3 of 10"
4. Add configuration UI (optional override via settings or sprint config)
5. Check limit before each auto-continue; stop and notify when reached

**Key Decision:** Store in sprint object (not global config) so different sprints can have different limits if overridden.

### Story 2: Auto-Continue Delay Configuration

**Technical Approach:**
1. Add countdown timer state to model (`autoContinueRemaining`)
2. Create countdown display component in sprint execution UI
3. Implement timer management:
   - Start 20s timer when Claude response completes
   - Decrement countdown every second (for UI)
   - On expire: auto-trigger next iteration
4. Add "Continue Now" button (clears timer, triggers immediately)
5. Add "Cancel" button (clears timer, stays paused)
6. Timer cleanup on component unmount / sprint cancel

**Key Decision:** Use `setInterval` for countdown display, single `setTimeout` for actual trigger. Store timer IDs for cleanup.

### Story 3: Stuck Detection Threshold

**Technical Approach:**
1. Maintain rolling history of last N iteration outputs (N >= 3)
2. Implement similarity comparison algorithm:
   - Option A: Simple string similarity (Levenshtein distance ratio)
   - Option B: Content hash comparison with tolerance
   - Option C: Key phrase extraction and overlap
3. After each iteration, compare to previous 2:
   - If all 3 are "similar" (>80% match), trigger stuck alert
4. Display alert modal with options:
   - "Continue Anyway" - dismisses alert, continues
   - "Modify Approach" - opens prompt input to provide new direction
   - "Stop Execution" - halts sprint with current state
5. Reset similarity tracker when output significantly differs or user intervenes

**Key Decision:** Use normalized content comparison (strip whitespace, lowercase) with Levenshtein ratio. Threshold of 0.85 similarity to flag as "stuck".

---

## 4. File Changes

### Story 4: Sprint Story Limit Enforcement

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/sam/model.js` | Modify | Enhance error state with `canCreateSprint` computed |
| `src/renderer/user-stories.js` | Modify | Add validation UI, live counter, disable button |
| `src/renderer/app.css` | Modify | Style for error banner, disabled state |

### Story 1: Default Maximum Iterations Configuration

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/sam/model.js` | Modify | Add `sprintExecution` state, iteration counter acceptors |
| `src/renderer/sam/actions.js` | Modify | Add `incrementIteration`, `resetIterations`, `setMaxIterations` |
| `src/renderer/app.js` | Modify | Display iteration counter in sprint header |
| `src/main/claude-service.js` | Modify | Ensure `--max-turns` uses sprint's maxIterations |

### Story 2: Auto-Continue Delay Configuration

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/sam/model.js` | Modify | Add timer state properties |
| `src/renderer/sam/actions.js` | Modify | Add `startAutoContinueTimer`, `cancelAutoContinue`, `triggerContinueNow` |
| `src/renderer/app.js` | Modify | Add countdown display component, Continue/Cancel buttons |
| `src/renderer/app.css` | Modify | Countdown timer styling |

### Story 3: Stuck Detection Threshold

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/sam/model.js` | Modify | Add `iterationHistory`, `isStuck`, `stuckAlert` state |
| `src/renderer/sam/actions.js` | Modify | Add `recordIteration`, `checkStuck`, `dismissStuckAlert`, `modifyApproach` |
| `src/renderer/utils/similarity.js` | **Create** | String similarity utilities (Levenshtein, normalize) |
| `src/renderer/components/stuck-alert.js` | **Create** | Modal component for stuck detection |
| `src/renderer/app.js` | Modify | Integrate stuck alert modal |
| `src/renderer/app.css` | Modify | Stuck alert modal styling |

### Shared Infrastructure

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/sam/model.js` | Modify | Add `sprintExecution` object to `initialModel` |
| `src/renderer/sam/actions.js` | Modify | Add execution control actions |

---

## 5. Risk Assessment

| Story | Risk Level | Risk | Mitigation |
|-------|------------|------|------------|
| **Story 4** | 🟢 Low | UI state sync if validation races with rapid clicks | Debounce selection, immediate state updates |
| **Story 1** | 🟢 Low | Iteration count mismatch between UI and Claude | Single source of truth in model, increment in response handler |
| **Story 2** | 🟡 Medium | Timer leaks if component unmounts mid-countdown | Cleanup timers in unmount/cleanup phase, store timer IDs |
| **Story 2** | 🟡 Medium | Race condition if user clicks "Continue Now" as timer fires | Mutex pattern: clear timer before action, check flag |
| **Story 3** | 🟡 Medium | False positives in similarity detection | Tune threshold (start at 85%), allow user to adjust |
| **Story 3** | 🟡 Medium | Performance with large outputs in history | Limit stored content to first 2000 chars, keep only 3 items |
| **Story 3** | 🟢 Low | Stuck detection triggers too early | Require exactly 3 consecutive (not just any 3) |

---

## 6. Estimated Complexity

| Story | Complexity | Rationale |
|-------|------------|-----------|
| **Story 4: Sprint Story Limit** | 🟢 **Low** | Validation already exists. Only needs UI feedback and button state. ~1-2 hours. |
| **Story 1: Max Iterations** | 🟢 **Low** | Simple counter increment on response. Display in header. Default value. ~2-3 hours. |
| **Story 2: Auto-Continue Delay** | 🟡 **Medium** | Timer management, countdown UI, multiple user actions. Edge cases with cleanup. ~4-6 hours. |
| **Story 3: Stuck Detection** | 🟡 **Medium** | Similarity algorithm, rolling history, modal UI, multiple user actions. ~6-8 hours. |

**Total Estimated Effort:** 13-19 hours of implementation

---

## 7. Detailed Implementation Steps

### Story 4: Sprint Story Limit Enforcement (Low - ~2 hours)

1. **Enhance selection counter** (`user-stories.js`)
   - Add `selectedCount` state display in header
   - Format: "Selected: 3 / 4 max"
   - Style changes when at or over limit

2. **Disable "Start Sprint" button** (`user-stories.js`)
   - Add `disabled` attribute when `selectedCount > 4`
   - Show tooltip: "Maximum 4 stories per sprint"

3. **Add validation error banner** (`user-stories.js`)
   - When `sprintError?.type === 'STORY_LIMIT_EXCEEDED'`
   - Red banner with clear message
   - Auto-dismiss when user deselects below limit

### Story 1: Default Maximum Iterations Configuration (Low - ~3 hours)

1. **Add sprintExecution state** (`model.js`)
   ```javascript
   sprintExecution: {
     maxIterations: 10,
     currentIteration: 0
   }
   ```

2. **Create incrementIteration action** (`actions.js`)
   - Called in `completeResponseAcceptor` when sprint active
   - Increments `currentIteration`
   - Checks if `currentIteration >= maxIterations`

3. **Display in sprint header** (`app.js`)
   - "Iteration 3 / 10"
   - Warning style when approaching limit (8+)
   - Stop indicator when max reached

4. **Integrate with Claude service** (`claude-service.js`)
   - Pass `maxIterations` from sprint to `--max-turns` arg

### Story 2: Auto-Continue Delay Configuration (Medium - ~5 hours)

1. **Add timer state** (`model.js`)
   ```javascript
   autoContinue: {
     delayMs: 20000,
     remaining: 0,
     isActive: false
   }
   ```

2. **Create timer management actions** (`actions.js`)
   - `startAutoContinueCountdown()` - starts 20s timer
   - `tickCountdown()` - decrements remaining
   - `triggerContinueNow()` - immediate continue
   - `cancelAutoContinue()` - cancel timer

3. **Build countdown UI** (`app.js`)
   - Circular progress or countdown display
   - "Continuing in 15s..."
   - "Continue Now" button
   - "Cancel" button

4. **Wire into execution flow**
   - After `completeResponse`: if sprint active AND iterations remaining → `startAutoContinueCountdown()`
   - On timer expire: submit continuation prompt
   - On "Continue Now": clear timer, submit immediately
   - On "Cancel": clear timer, pause execution

### Story 3: Stuck Detection Threshold (Medium - ~7 hours)

1. **Create similarity utilities** (`utils/similarity.js`)
   ```javascript
   export function normalizeContent(text) { ... }
   export function levenshteinRatio(a, b) { ... }
   export function areSimilar(a, b, threshold = 0.85) { ... }
   ```

2. **Add iteration history state** (`model.js`)
   ```javascript
   stuckDetection: {
     iterationHistory: [],  // Last 3 normalized outputs
     threshold: 3,
     isStuck: false,
     stuckAlert: null  // { iteration, options }
   }
   ```

3. **Create detection actions** (`actions.js`)
   - `recordIteration(content)` - add to history, trim to 3
   - `checkForStuck()` - compare last 3, set `isStuck` if similar
   - `dismissStuckAlert(action)` - handle user choice
   - `resetStuckDetection()` - clear on significant change

4. **Build stuck alert modal** (`components/stuck-alert.js`)
   - "Execution appears stuck"
   - "The last 3 iterations produced similar output"
   - Buttons: "Continue Anyway", "Modify Approach", "Stop"

5. **Wire into execution flow**
   - In `completeResponseAcceptor`: call `recordIteration()`, then `checkForStuck()`
   - If stuck detected: show modal BEFORE auto-continue
   - "Continue Anyway": dismiss, continue execution
   - "Modify Approach": open prompt input, user provides new direction
   - "Stop": halt sprint, preserve state

---

## 8. Acceptance Criteria Verification Matrix

| Story | Criterion | Implementation |
|-------|-----------|----------------|
| **S4-1** | System validates story count when sprint is created | `createSprintAcceptor` validation (exists) |
| **S4-2** | Sprints with more than 4 stories are rejected | MAX_SPRINT_STORIES constant check (exists) |
| **S4-3** | Clear error message indicates token limit restriction | Error banner in UI (new) |
| **S4-4** | User is prompted to reduce story count before proceeding | Disabled button + message (new) |
| **S4-5** | Validation occurs before any sprint execution begins | Validation in acceptor, before status change (exists) |
| **S1-1** | New sprints default to 10 maximum iterations | `sprintExecution.maxIterations = 10` (new) |
| **S1-2** | The default value is applied when no custom value is specified | Initialized in model (new) |
| **S1-3** | The maximum iterations value is visible in sprint configuration | Sprint header display (new) |
| **S1-4** | User can override the default if needed | Config UI field (optional, stretch) |
| **S2-1** | System waits 20 seconds between automatic continuation prompts | Timer with 20000ms delay (new) |
| **S2-2** | The delay countdown is visible to the user | Countdown UI component (new) |
| **S2-3** | User can manually trigger continuation before delay expires | "Continue Now" button (new) |
| **S2-4** | User can cancel the auto-continue during the delay period | "Cancel" button (new) |
| **S3-1** | System tracks iteration outputs for similarity | `iterationHistory` array (new) |
| **S3-2** | Alert is triggered after 3 consecutive similar iterations | `checkForStuck()` logic (new) |
| **S3-3** | User is notified when stuck state is detected | Stuck alert modal (new) |
| **S3-4** | User can choose to continue, modify approach, or stop execution | Modal buttons with handlers (new) |
| **S3-5** | Stuck detection resets when output changes significantly | `resetStuckDetection()` on dissimilar output (new) |

---

## Summary

This implementation plan covers four interconnected stories that add robustness to sprint execution:

1. **Story 4 (Low)**: Complete the existing validation with proper UI feedback
2. **Story 1 (Low)**: Add iteration tracking and display with sensible defaults
3. **Story 2 (Medium)**: Implement timed auto-continue with user controls
4. **Story 3 (Medium)**: Add intelligent stuck detection with user intervention options

The recommended implementation order (4 → 1 → 2 → 3) builds complexity incrementally, with each story providing infrastructure for the next. Total estimated effort is 13-19 hours, with no high-risk items identified.