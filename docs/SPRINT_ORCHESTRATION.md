# Sprint Orchestration Workflow

This document describes the complete workflow for automated sprint orchestration in Puffin.

**Last Updated:** 2026-02-08
**Status:** ✅ Verified against codebase

## Overview

The Sprint Orchestration system automates the implementation of user stories during a sprint. It handles:
1. **Implementation Phase** - Executing user stories in order
2. **Code Review Phase** - Automated code review after all stories complete
3. **Bug Fix Phase** - Fixing issues found in code review

## Architecture Overview

**Key Files:**
- `src/renderer/app.js` - Orchestration control flow and UI handlers
- `src/renderer/sam/model.js` - SAM acceptors (orchestrationStoryCompletedAcceptor, updateSprintStoryStatusAcceptor, etc.)
- `src/renderer/lib/state-persistence.js` - Async persistence layer and Claude CLI submission
- `src/main/claude-service.js` - Claude CLI process management

**Key Concepts:**
- **OrchestrationStatus**: IDLE, PENDING, RUNNING, PAUSED, STOPPED, COMPLETE
- **OrchestrationPhase**: IMPLEMENTATION, REVIEW, BUGFIX, COMPLETE
- **SAM Pattern**: Actions → Acceptors → State Representation → Persistence

## Detailed Workflow

### Phase 1: Starting Orchestration

```
User clicks "Start Implementation" (automated mode)
    ↓
app.js: startAutomatedImplementation()
    ↓
Intent: START_AUTOMATED_IMPLEMENTATION
    ↓
Model: startAutomatedImplementationAcceptor (sam/model.js:2418)
    - Sets orchestration.status = 'running'
    - Sets orchestration.storyOrder (from plan)
    - Sets orchestration.phase = 'implementation'
    ↓
app.js: checkOrchestrationProgress() (scheduled after 500ms)
```

### Phase 2: Story Implementation Loop

```
app.js: checkOrchestrationProgress() (line 5119)
    ↓
[ORCHESTRATION] Check orchestration status = RUNNING? (line 5135)
    ↓
[ORCHESTRATION] Check Claude CLI isRunning? (line 5142)
    ↓
[ORCHESTRATION] Find next story (not in completedStories) (line 5164)
    ↓
If no more stories → handleAllStoriesCompleted() (line 5169)
    ↓
Intent: orchestrationStoryStarted(nextStoryId) (line 5193)
    ↓
Intent: startSprintStoryImplementation(nextStoryId, branchType) (line 5199)
    ↓
state-persistence.js: START_SPRINT_STORY_IMPLEMENTATION handler (line 652)
    - Checks _pendingStoryImplementation flag (line 659)
    - NOTE: No isRunning() check here (intentional, see line 666-668 comment)
    - Builds prompt and submits to Claude (line 695)
    ↓
Claude implements the story
    ↓
Event: claude-response-complete
    ↓
app.js: SAM render callback detects completion (line 1740)
    ↓
app.js: handleOrchestrationCompletion(response) (line 1746)
```

### Phase 3: Story Completion Flow (CRITICAL PATH)

This is the core logic that marks stories complete and advances to the next story.

```
app.js: handleOrchestrationCompletion(response) (line 5339)
    ↓
[ORCHESTRATION] Verify orchestration.status === RUNNING (line 5370)
    ↓
[ORCHESTRATION] Check current phase (line 5376)
    - If REVIEW → handleCodeReviewCompletion() (line 5379)
    - If BUGFIX → handleBugFixCompletion() (line 5384)
    - Otherwise → continue with IMPLEMENTATION phase
    ↓
[ORCHESTRATION] Get currentStoryId from orchestration (line 5390)
    ↓
CHECK: Did we hit max turns (40)? (line 5409)
    ├─ YES → Auto-continue flow
    │   ├─ Increment continuationCount (line 5411)
    │   ├─ If continuationCount > 5 → Force complete with fallback (line 5414)
    │   │   ├─ orchestrationStoryCompleted() (line 5420)
    │   │   ├─ updateSprintStoryStatus('completed') (line 5421)
    │   │   ├─ clearActiveImplementationStory() (line 5422)
    │   │   ├─ autoCompleteAcceptanceCriteria() (line 5423)
    │   │   ├─ evaluateStoryAssertions() (line 5424)
    │   │   └─ Schedule next story check (line 5432)
    │   └─ Otherwise → Submit continuation prompt (line 5449)
    │       └─ Return (wait for next completion)
    │
    └─ NO → Normal completion flow
        ↓
Reset continuationCount = 0 (line 5464)
        ↓
[ORCH-TRACE-1] ====== STORY COMPLETION FLOW START ====== (line 5467)
        ↓
STEP 0: Generate completion summary (line 5474)
    - Calls generateCompletionSummary(storyId, sessionId, response)
    - Uses AI to summarize what was accomplished
    - Returns structured summary object
        ↓
STEP 1: this.intents.orchestrationStoryCompleted(storyId, sessionId, summary) (line 5478)
    ↓
    [MODEL-TRACE-C1] orchestrationStoryCompletedAcceptor ENTER (model.js:2508)
        - Adds storyId to orchestration.completedStories (line 2524)
        - Updates storySessions tracking with completion summary (line 2535)
        - Clears currentStoryId if matches (line 2544)
    [MODEL-TRACE-C5] orchestrationStoryCompletedAcceptor EXIT (line 2550)
        ↓
STEP 2: this.intents.updateSprintStoryStatus(storyId, 'completed') (line 5482)
    ↓
    [MODEL-TRACE-A1] updateSprintStoryStatusAcceptor ENTER (model.js:3220)
        - Updates sprint.stories[].status = 'completed' (line 3246)
        - Updates sprint.storyProgress[].status = 'completed' (line 3282)
        - Sets completedAt timestamp (line 3249)
        - CLEARS activeImplementationStory if matches (line 3254-3257)
        - Checks if all stories completed (line 3286)
    [MODEL-TRACE-A8] updateSprintStoryStatusAcceptor EXIT (line 3312)
        ↓
    [PERSIST-TRACE-2] UPDATE_SPRINT_STORY_STATUS handler (persistence.js:636)
        - Finds story in state.userStories (line 639)
        - Calls window.puffin.state.updateUserStory() to persist to DB (line 642)
        - Triggers assertion evaluation (if applicable)
    [PERSIST-TRACE-2] UPDATE_SPRINT_STORY_STATUS handler END
        ↓
STEP 2b: this.intents.clearActiveImplementationStory() (line 5487)
    - Explicit call for defense-in-depth (also cleared in acceptor)
    - Ensures "Implementing..." badge disappears immediately
        ↓
STEP 3: this.autoCompleteAcceptanceCriteria(storyId) (line 5489)
    ↓
    [ORCH-TRACE-4.1] autoCompleteAcceptanceCriteria called (app.js)
        - Finds story in sprint.stories
        - Gets acceptanceCriteria array
        - For each criterion:
            ↓
            this.intents.toggleCriteriaCompletion(storyId, index, true)
                ↓
            [MODEL-TRACE-B1] toggleCriteriaCompletionAcceptor ENTER (model.js)
                - Updates criteriaProgress[index].checked = true
                - Checks if all criteria are now checked
                - If all checked → auto-completes story
            [MODEL-TRACE-B8] toggleCriteriaCompletionAcceptor EXIT
                ↓
            [PERSIST-TRACE-3] TOGGLE_CRITERIA_COMPLETION handler (persistence.js)
                - Calls updateActiveSprint()
                - Calls syncStoryStatus() if needed
    [ORCH-TRACE-4.6] Criteria completion loop finished
        ↓
STEP 4: this.evaluateStoryAssertions(storyId) (line 5491)
    - Gets story assertions from state
    - Calls window.puffin.state.evaluateStoryAssertions()
    - Shows toast with results (pass/fail counts)
        ↓
STEP 5: Persist completion summary (line 5495)
    - Calls updateUserStory(storyId, { completionSummary })
    - Calls storeCompletionSummary(storyId, summary)
        ↓
[ORCH-TRACE-6] ====== STORY COMPLETION FLOW END ====== (line 5500)
        ↓
setTimeout(() => checkOrchestrationProgress(), 1000) (line 5502)
        ↓
(Loop back to Phase 2)
```

### Phase 4: All Stories Completed

```
app.js: handleAllStoriesCompleted() (called from checkOrchestrationProgress)
    ↓
Intent: UPDATE_ORCHESTRATION_PHASE → 'review'
    ↓
Modal: Show code review confirmation dialog
    ↓
User chooses:
    ├─ "Start Code Review" → startAutomatedCodeReview()
    │   └─ Begins automated code review phase
    │
    └─ "Review Manually" → orchestration.status = 'complete'
        └─ Waits for user to close sprint
```

## Trace Points Reference

| Trace ID | Location | Description |
|----------|----------|-------------|
| `[ORCHESTRATION]` | app.js:checkOrchestrationProgress | General orchestration flow logs |
| `[ORCH-TRACE-1]` | app.js:5467 | Story completion flow start marker |
| `[ORCH-TRACE-2]` | app.js:5478 | orchestrationStoryCompleted call |
| `[ORCH-TRACE-3]` | app.js:5482 | updateSprintStoryStatus call |
| `[ORCH-TRACE-3b]` | app.js:5487 | clearActiveImplementationStory call |
| `[ORCH-TRACE-4.x]` | app.js:autoCompleteAcceptanceCriteria | Criteria completion sub-steps |
| `[ORCH-TRACE-5]` | app.js:5491 | evaluateStoryAssertions call |
| `[ORCH-TRACE-6]` | app.js:5500 | Story completion flow end marker |
| `[MODEL-TRACE-A1-A8]` | model.js:3218-3312 | updateSprintStoryStatusAcceptor |
| `[MODEL-TRACE-B1-B8]` | model.js | toggleCriteriaCompletionAcceptor |
| `[MODEL-TRACE-C1-C5]` | model.js:2508-2550 | orchestrationStoryCompletedAcceptor |
| `[PERSIST-TRACE-1]` | state-persistence.js | Sprint action persistence start |
| `[PERSIST-TRACE-2]` | state-persistence.js:636 | UPDATE_SPRINT_STORY_STATUS handler |
| `[PERSIST-TRACE-3]` | state-persistence.js | TOGGLE_CRITERIA_COMPLETION handler |
| `[ORCHESTRATION-PERSIST]` | state-persistence.js:660 | Story implementation submission |

## Key Implementation Details

### activeImplementationStory Clearing Strategy

**Problem:** The "Implementing..." badge persisted through code review and bugfix phases.

**Solution (Defense-in-Depth):**
1. **Primary:** updateSprintStoryStatusAcceptor clears activeImplementationStory when status becomes 'completed' (model.js:3254-3257)
2. **Secondary:** handleOrchestrationCompletion explicitly calls clearActiveImplementationStory() (app.js:5487)
3. **Tertiary:** Both normal completion and max-continuations paths include the clear call

### Continuation Logic (Max Turns Handling)

When a story hits the 40-turn limit:
1. Increment continuationCount (tracks how many times we've continued)
2. If continuationCount ≤ 5: Submit "Please continue..." prompt to same session
3. If continuationCount > 5: Force complete with fallback summary to avoid infinite loops

### state-persistence.js Intentional Design

**Line 666-668 Comment:**
```javascript
// Note: We don't check isRunning() here because checkOrchestrationProgress
// already performs this check before calling startSprintStoryImplementation.
// Adding a redundant async check here causes race conditions.
```

This is **intentional** - the isRunning() check was removed to avoid race conditions. The check happens earlier in the flow at checkOrchestrationProgress (line 5142).

### Completion Summary Generation

**New Feature (Added after initial document):**

STEP 0 in handleOrchestrationCompletion now generates an AI-powered completion summary:
- Analyzes session context and response content
- Produces structured summary: { title, summary, highlights[], nextSteps[], issues[] }
- Persisted to both user story and completion_summaries table
- Displayed in story cards and sprint review

## Debugging Checklist

When debugging orchestration issues, check these log patterns:

### Story Not Marked Complete
1. ✅ Check if `[ORCH-TRACE-1]` appears - confirms completion flow started
2. ✅ Check if `[MODEL-TRACE-A1]` appears - confirms status update intent reached model
3. ✅ Check `[MODEL-TRACE-A3]` for "Sprint story lookup" - is the story found?
4. ✅ Check `[PERSIST-TRACE-2]` for "syncStoryStatus result" - did persistence succeed?

### "Implementing..." Badge Persists After Completion
1. ✅ Check `[MODEL-TRACE-A3]` for "Clearing activeImplementationStory"
2. ✅ Check `[ORCH-TRACE-3b]` for explicit clearActiveImplementationStory call
3. ✅ Verify both acceptor AND explicit clear are executed

### Acceptance Criteria Not Checked
1. ✅ Check if `[ORCH-TRACE-4.1]` appears - confirms criteria completion started
2. ✅ Check `[ORCH-TRACE-4.3]` for "criteriaCount" - does story have criteria?
3. ✅ Check `[MODEL-TRACE-B1]` for each criterion - are toggles being called?
4. ✅ Check `[PERSIST-TRACE-3]` - is persistence handler triggered?

### Assertions Not Evaluated
1. ✅ Check if `[ORCH-TRACE-5]` appears
2. ✅ Check if `[PERSIST-TRACE-2]` shows "Triggering assertion evaluation"

### Second Story Not Starting
1. ✅ Check `checkOrchestrationProgress` logs after 1000ms delay
2. ✅ Check `orchestration.completedStories` array - is first story in it?
3. ✅ Check `orchestration.status` - is it still 'running'?
4. ✅ Check `isRunning()` result - is CLI still busy?

### Max Turns / Infinite Continuations
1. ✅ Check for "Max turns reached, auto-continuing..." logs
2. ✅ Check continuationCount in logs - is it incrementing?
3. ✅ After 5 continuations, should see "Max continuations reached, marking story as complete"
4. ✅ Check if fallbackSummary is generated and persisted

## Known Design Considerations

### 1. State Synchronization
The SAM model updates state synchronously, but persistence is async. The code handles this by:
- Using intents for all state changes (never mutating `this.state` directly in handlers)
- Persistence layer reads from fresh state after SAM render cycle completes
- Multiple intents are called sequentially to ensure proper order

### 2. Acceptor Chaining
Multiple intents are called in sequence during completion:
1. orchestrationStoryCompleted (tracking)
2. updateSprintStoryStatus (status change)
3. clearActiveImplementationStory (UI cleanup)
4. autoCompleteAcceptanceCriteria (criteria marking)

Each acceptor must complete before the next intent reads state. This works because:
- SAM processes proposals synchronously
- State mutations happen immediately
- Only persistence is async (happens after all acceptors run)

### 3. Story vs StoryProgress Dual Storage
Status is stored in two places and must be kept consistent:
- `sprint.stories[].status` - For sprint view rendering
- `sprint.storyProgress[].status` - For progress tracking

updateSprintStoryStatusAcceptor updates BOTH (model.js:3246 and 3282).

### 4. Acceptance Criteria Format Handling
Criteria may be strings or objects with `.description`:
- Legacy format: `['criterion 1', 'criterion 2']`
- New format: `[{ description: 'criterion 1' }, { description: 'criterion 2' }]`

autoCompleteAcceptanceCriteria handles both formats by checking for `.description` property.

---

## Document History

- **2026-02-08**: Major update to reflect current implementation
  - Added STEP 0 (completion summary generation)
  - Added STEP 2b (explicit clearActiveImplementationStory)
  - Updated trace point line numbers
  - Added continuation logic documentation
  - Clarified intentional design decisions
  - Updated file paths to use full `src/renderer/sam/model.js` format
  - Added activeImplementationStory clearing strategy section

- **Previous**: Original documentation based on code analysis during orchestration debugging
