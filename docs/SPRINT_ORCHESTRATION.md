# Sprint Orchestration Workflow

This document describes the complete workflow for automated sprint orchestration in Puffin.

## Overview

The Sprint Orchestration system automates the implementation of user stories during a sprint. It handles:
1. **Implementation Phase** - Executing user stories in order
2. **Code Review Phase** - Automated code review after all stories complete
3. **Bug Fix Phase** - Fixing issues found in code review

## Detailed Workflow

### Phase 1: Starting Orchestration

```
User clicks "Start Implementation" (automated mode)
    ↓
app.js: startAutomatedImplementation()
    ↓
Intent: START_AUTOMATED_IMPLEMENTATION
    ↓
Model: startAutomatedImplementationAcceptor
    - Sets orchestration.status = 'running'
    - Sets orchestration.storyOrder (from plan)
    - Sets orchestration.phase = 'implementation'
    ↓
app.js: checkOrchestrationProgress()
```

### Phase 2: Story Implementation Loop

```
app.js: checkOrchestrationProgress()
    ↓
[ORCH-TRACE] Check orchestration status = RUNNING?
    ↓
[ORCH-TRACE] Check Claude CLI isRunning?
    ↓
[ORCH-TRACE] Find next story (not in completedStories)
    ↓
If no more stories → handleAllStoriesCompleted()
    ↓
Intent: ORCHESTRATION_STORY_STARTED
    ↓
Intent: START_SPRINT_STORY_IMPLEMENTATION
    ↓
state-persistence.js: Submits to Claude
    ↓
Claude implements the story
    ↓
Event: claude-response-complete
    ↓
app.js: handleOrchestrationCompletion(response)
```

### Phase 3: Story Completion Flow (CRITICAL PATH)

This is where the current issue appears to be. The expected flow:

```
app.js: handleOrchestrationCompletion(response)
    ↓
[ORCH-TRACE-1] ====== STORY COMPLETION FLOW START ======
    ↓
STEP 1: this.intents.orchestrationStoryCompleted(storyId, sessionId)
    ↓
[MODEL-TRACE-C1] orchestrationStoryCompletedAcceptor ENTER
    - Adds storyId to orchestration.completedStories
    - Updates storySessions tracking
    - Clears currentStoryId
[MODEL-TRACE-C5] orchestrationStoryCompletedAcceptor EXIT
    ↓
STEP 2: this.intents.updateSprintStoryStatus(storyId, 'completed')
    ↓
[MODEL-TRACE-A1] updateSprintStoryStatusAcceptor ENTER
    - Updates sprint.stories[storyId].status = 'completed'
    - Updates sprint.storyProgress[storyId].status = 'completed'
    - Checks if all stories completed
[MODEL-TRACE-A8] updateSprintStoryStatusAcceptor EXIT
    ↓
[PERSIST-TRACE-2] UPDATE_SPRINT_STORY_STATUS handler
    - Calls syncStoryStatus(storyId, 'completed')
    - Triggers assertion evaluation
[PERSIST-TRACE-2] UPDATE_SPRINT_STORY_STATUS handler END
    ↓
STEP 3: this.autoCompleteAcceptanceCriteria(storyId)
    ↓
[ORCH-TRACE-4.1] autoCompleteAcceptanceCriteria called
    - Finds story in sprint.stories
    - Gets acceptanceCriteria array
    - For each criterion:
        - this.intents.toggleCriteriaCompletion(storyId, index, true)
            ↓
        [MODEL-TRACE-B1] toggleCriteriaCompletionAcceptor ENTER
            - Updates criteriaProgress[index].checked = true
            - Checks if all criteria are now checked
            - If all checked → auto-completes story
        [MODEL-TRACE-B8] toggleCriteriaCompletionAcceptor EXIT
            ↓
        [PERSIST-TRACE-3] TOGGLE_CRITERIA_COMPLETION handler
            - Calls updateActiveSprint()
            - Calls syncStoryStatus() if needed
[ORCH-TRACE-4.6] Criteria completion loop finished
    ↓
STEP 4: this.evaluateStoryAssertions(storyId)
    - Gets story assertions
    - Calls window.puffin.state.evaluateStoryAssertions()
    - Shows toast with results
    ↓
[ORCH-TRACE-6] ====== STORY COMPLETION FLOW END ======
    ↓
setTimeout(checkOrchestrationProgress, 1000)
    ↓
(Loop back to Phase 2)
```

### Phase 4: All Stories Completed

```
app.js: handleAllStoriesCompleted()
    ↓
Intent: START_CODE_REVIEW
    ↓
app.js: startAutomatedCodeReview()
    ↓
(Code review phase begins)
```

## Trace Points Reference

| Trace ID | Location | Description |
|----------|----------|-------------|
| `[ORCH-TRACE-1]` | app.js:handleOrchestrationCompletion | Story completion flow start |
| `[ORCH-TRACE-2]` | app.js:handleOrchestrationCompletion | orchestrationStoryCompleted call |
| `[ORCH-TRACE-3]` | app.js:handleOrchestrationCompletion | updateSprintStoryStatus call |
| `[ORCH-TRACE-4.x]` | app.js:autoCompleteAcceptanceCriteria | Criteria completion sub-steps |
| `[ORCH-TRACE-5]` | app.js:handleOrchestrationCompletion | evaluateStoryAssertions call |
| `[ORCH-TRACE-6]` | app.js:handleOrchestrationCompletion | Story completion flow end |
| `[MODEL-TRACE-A1-A8]` | model.js:updateSprintStoryStatusAcceptor | Story status update |
| `[MODEL-TRACE-B1-B8]` | model.js:toggleCriteriaCompletionAcceptor | Criteria toggle |
| `[MODEL-TRACE-C1-C5]` | model.js:orchestrationStoryCompletedAcceptor | Orchestration tracking |
| `[PERSIST-TRACE-1]` | state-persistence.js | Sprint action persistence start |
| `[PERSIST-TRACE-2]` | state-persistence.js | UPDATE_SPRINT_STORY_STATUS handler |
| `[PERSIST-TRACE-3]` | state-persistence.js | TOGGLE_CRITERIA_COMPLETION handler |

## Debugging Checklist

When debugging orchestration issues, look for these console log patterns:

### Story Not Marked Complete
1. Check if `[ORCH-TRACE-1]` appears - confirms completion flow started
2. Check if `[MODEL-TRACE-A1]` appears - confirms status update intent reached model
3. Check `[MODEL-TRACE-A3]` for "Sprint story lookup" - is the story found?
4. Check `[PERSIST-TRACE-2]` for "syncStoryStatus result" - did persistence succeed?

### Acceptance Criteria Not Checked
1. Check if `[ORCH-TRACE-4.1]` appears - confirms criteria completion started
2. Check `[ORCH-TRACE-4.3]` for "criteriaCount" - does story have criteria?
3. Check `[MODEL-TRACE-B1]` for each criterion - are toggles being called?
4. Check `[PERSIST-TRACE-3]` - is persistence handler triggered?

### Assertions Not Evaluated
1. Check if `[ORCH-TRACE-5]` appears
2. Check if `[PERSIST-TRACE-2]` shows "Triggering assertion evaluation"

### Second Story Not Starting
1. Check `checkOrchestrationProgress` logs after 1000ms delay
2. Check `orchestration.completedStories` array - is first story in it?
3. Check `orchestration.status` - is it still 'running'?

## Known Issues to Investigate

1. **State Synchronization**: The SAM model updates state synchronously, but persistence is async. Check if intents.x() calls complete before `this.state` is read.

2. **Acceptor Chaining**: Multiple intents are called in sequence. Verify each acceptor completes before the next intent reads state.

3. **Story vs StoryProgress**: Status is stored in two places:
   - `sprint.stories[].status`
   - `sprint.storyProgress[].status`
   Both must be updated consistently.

4. **Acceptance Criteria Format**: The criteria may be strings or objects with `.description`. The code must handle both.

---

# Previous Code Review Report

(Preserved from earlier review)

## Overview

This commit (5810fb2) is titled as completing 2 simple test file creation stories, but it actually contains **significant additional changes** to the orchestration system, state persistence, and SAM model.

## Critical Issues (Confidence >= 90)

### 1. Commit Contains Unrelated/Undocumented Changes
**Confidence: 95**
**Location:** Commit 5810fb2

**Description:** The commit message claims to only create `docs/test1.md` and `docs/test2.md`, but actually includes 1,150+ lines of changes across 8 files.

### 2. Race Condition Risk in checkOrchestrationProgress
**Confidence: 92**
**Location:** `src/renderer/app.js` (checkOrchestrationProgress function)

**Description:** The function performs an async check but then immediately proceeds to call intents without a lock.

### 3. Removed isRunning Check Creates Double-Submission Risk
**Confidence: 90**
**Location:** `src/renderer/lib/state-persistence.js:627-633`

**Description:** A critical `isRunning()` check was removed.

## Important Issues (Confidence 80-89)

### 4. Hardcoded Magic Numbers
**Confidence: 85**

### 5. Instance Property Created in Method Without Initialization
**Confidence: 88**

### 6. Unsafe Optional Chaining Without Fallback
**Confidence: 82**

### 7. Acceptance Criteria Description Access Pattern
**Confidence: 84**

### 8. Error Swallowing in Async Operations
**Confidence: 81**
