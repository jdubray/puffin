# Sprint Implementation Plan: Progress Tracking per Story

Let me first explore the codebase to understand the existing architecture and identify relevant components.Excellent! Now I have a comprehensive understanding of the existing architecture. Let me create a detailed implementation plan for the Sprint Progress Tracking per Story feature.

---

# Implementation Plan: Sprint Progress Tracking per Story

## Executive Summary

This story adds visual progress indicators to each user story within a sprint, showing branch completion status, overall progress, and identifying blocked work. The existing architecture already has the **data layer** for tracking progress (`storyProgress` in sprint model, `computeSprintProgress()` in state), but the **UI layer** lacks visual representation of this data.

---

## 1. Architecture Analysis

### Current State
| Layer | Status | Notes |
|-------|--------|-------|
| **Data Model** | ✅ Complete | `storyProgress` object tracks branches per story |
| **State Computation** | ✅ Complete | `computeSprintProgress()` returns full progress data |
| **Persistence** | ✅ Complete | `updateSprintStoryProgress()` saves to disk |
| **UI Rendering** | ❌ Missing | Branch buttons exist but don't show status |
| **Progress Indicators** | ❌ Missing | No visual progress bars or status badges |

### Key Insight
The heavy lifting is already done in `src/renderer/sam/state.js:400-502`. The `computeSprintProgress()` function returns:
- Per-story: `status`, `isBlocked`, `completedBranches`, `inProgressBranches`, `branchPercentage`
- Per-branch: `status`, `isStarted`, `isCompleted`, `isInProgress`
- Overall: `storyPercentage`, `branchPercentage`, `hasBlockedWork`

**The implementation focuses on consuming this data in the UI.**

---

## 2. Technical Approach

### 2.1 Story Header Status Badge

Add a status badge next to each story title in the sprint header:

```
┌─────────────────────────────────────────────────────┐
│ 📋 User Authentication                    [In Progress] │
│ "As a user, I want to log in..."                      │
│                                                       │
│ [🎨 UI ✓] [⚙️ Backend ●] [🔗 Full Stack ○]           │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━○○○○○○ 33%                  │
└─────────────────────────────────────────────────────┘
```

**Status values:**
- `Pending` (gray) - No work started
- `In Progress` (blue) - At least one branch started
- `Blocked` (orange) - Branch stalled 2+ hours
- `Completed` (green) - All branches complete

### 2.2 Branch Button States

Enhance branch buttons to show their completion state:

| State | Visual | Icon |
|-------|--------|------|
| Not Started | Default styling | ○ (empty circle) |
| In Progress | Pulsing border | ● (filled circle) |
| Completed | Green background | ✓ (checkmark) |

### 2.3 Progress Bar

Add a compact progress bar under each story card showing branch completion percentage.

### 2.4 Overall Sprint Progress

Add a summary bar at the top of sprint header:

```
Sprint Progress: ████████░░ 80% (4/5 stories)
```

---

## 3. Implementation Order

| Order | Task | Rationale |
|-------|------|-----------|
| 1 | Add CSS styles for progress indicators | Foundation for all visual elements |
| 2 | Update `renderStoryBranchButtons()` to show branch status | Core visual feedback |
| 3 | Add story status badge to each card | Per-story status visibility |
| 4 | Add progress bar component per story | Quantitative progress view |
| 5 | Add overall sprint progress bar | High-level sprint visibility |
| 6 | Add blocked indicator styling | Edge case handling |

---

## 4. File Changes

### Files to Modify

| File | Changes | Lines Affected |
|------|---------|----------------|
| `src/renderer/app.js` | Update `updateSprintHeader()` and `renderStoryBranchButtons()` | ~755-883 |
| `src/renderer/index.html` | Add sprint progress bar container | ~315-330 |
| `src/renderer/styles.css` | Add progress indicator styles | New section |

### No New Files Required
All changes fit within existing components.

---

## 5. Detailed Implementation

### 5.1 CSS Styles (src/renderer/styles.css)

```css
/* Sprint Progress Tracking Styles */

/* Story status badges */
.story-status-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
}
.story-status-badge.pending { background: #6b7280; color: white; }
.story-status-badge.in-progress { background: #3b82f6; color: white; }
.story-status-badge.blocked { background: #f97316; color: white; }
.story-status-badge.completed { background: #22c55e; color: white; }

/* Branch button states */
.story-branch-btn.not-started { opacity: 0.7; }
.story-branch-btn.in-progress { 
  border: 2px solid #3b82f6;
  animation: pulse 2s infinite;
}
.story-branch-btn.completed {
  background: #22c55e;
  color: white;
}

/* Progress bars */
.story-progress-bar {
  height: 4px;
  background: #374151;
  border-radius: 2px;
  overflow: hidden;
  margin-top: 8px;
}
.story-progress-bar-fill {
  height: 100%;
  background: #3b82f6;
  transition: width 0.3s ease;
}
.story-progress-bar-fill.complete { background: #22c55e; }

/* Overall sprint progress */
.sprint-overall-progress {
  padding: 8px 12px;
  background: #1f2937;
  border-radius: 6px;
  margin-bottom: 12px;
}

/* Blocked indicator */
.blocked-indicator {
  color: #f97316;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}
```

### 5.2 Update renderStoryBranchButtons() (src/renderer/app.js)

**Current implementation** (lines 860-883) doesn't receive progress data.

**Changes needed:**
1. Accept `storyProgress` parameter
2. Determine branch state from progress data
3. Apply appropriate CSS class and icon

```javascript
renderStoryBranchButtons(story, storyProgress) {
  const branches = [
    { type: 'ui', icon: '🎨', label: 'UI' },
    { type: 'backend', icon: '⚙️', label: 'Backend' },
    { type: 'fullstack', icon: '🔗', label: 'Full Stack' }
  ]
  
  return branches.map(branch => {
    const branchData = storyProgress?.branches?.[branch.type]
    const stateClass = branchData?.isCompleted ? 'completed' 
                     : branchData?.isInProgress ? 'in-progress' 
                     : 'not-started'
    const stateIcon = branchData?.isCompleted ? '✓' 
                    : branchData?.isInProgress ? '●' 
                    : '○'
    
    return `<button class="story-branch-btn ${stateClass}" ...>
      <span class="branch-icon">${branch.icon}</span>
      <span class="branch-label">${branch.label}</span>
      <span class="branch-state">${stateIcon}</span>
    </button>`
  }).join('')
}
```

### 5.3 Update updateSprintHeader() (src/renderer/app.js)

**Changes needed:**
1. Call `computeSprintProgress()` to get progress data
2. Pass story progress to `renderStoryBranchButtons()`
3. Render story status badge
4. Render story progress bar
5. Render overall sprint progress

```javascript
updateSprintHeader() {
  const sprint = this.state.representation.activeSprint
  if (!sprint) { /* hide header */ return }
  
  // Get computed progress data
  const progress = this.state.representation.sprintProgress
  
  // Render overall progress bar
  const overallProgressHtml = `
    <div class="sprint-overall-progress">
      <div>Sprint: ${progress.completedStories}/${progress.totalStories} stories</div>
      <div class="story-progress-bar">
        <div class="story-progress-bar-fill ${progress.isComplete ? 'complete' : ''}" 
             style="width: ${progress.storyPercentage}%"></div>
      </div>
    </div>
  `
  
  // Render each story with progress
  const storiesHtml = progress.stories.map(story => {
    const statusClass = story.isBlocked ? 'blocked' 
                      : story.status
    return `
      <div class="sprint-story-card" data-story-id="${story.id}">
        <div class="story-header-row">
          <h4>${story.title}</h4>
          <span class="story-status-badge ${statusClass}">${story.status}</span>
        </div>
        <p>${story.description}</p>
        ${showBranchButtons ? this.renderStoryBranchButtons(story, story) : ''}
        <div class="story-progress-bar">
          <div class="story-progress-bar-fill" 
               style="width: ${story.branchPercentage}%"></div>
        </div>
        ${story.isBlocked ? '<div class="blocked-indicator">⚠️ Blocked</div>' : ''}
      </div>
    `
  }).join('')
  
  // Update DOM...
}
```

### 5.4 Ensure sprintProgress is in State Representation

In `src/renderer/sam/state.js`, verify `computeSprintProgress()` result is exposed in state representation (it already is, based on the exploration).

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Progress data not updating in real-time | Low | Medium | Ensure `present()` is called after branch state changes |
| Blocked detection false positives | Medium | Low | Make 2-hour threshold configurable |
| CSS conflicts with existing styles | Low | Low | Use scoped class names with `sprint-` prefix |
| Performance with many stories | Low | Low | Max 4 stories per sprint already enforced |

---

## 7. Acceptance Criteria Mapping

| Criteria | Implementation |
|----------|----------------|
| Each user story header shows implementation status | Story status badge (pending/in-progress/blocked/completed) |
| Branch buttons indicate whether they have been started | Branch button states with icons (○ / ● / ✓) |
| Completed branches are visually marked as done | Green background + checkmark icon |
| Overall sprint progress is visible | Sprint-level progress bar with story count |
| User can identify blocked or incomplete work at a glance | Blocked indicator (⚠️) + orange styling |

---

## 8. Complexity Assessment

**Overall Complexity: Low-Medium**

| Aspect | Rating | Justification |
|--------|--------|---------------|
| Data layer | None | Already complete |
| State computation | None | Already complete |
| UI implementation | Low | Template changes in existing function |
| CSS styling | Low | Standard progress indicator patterns |
| Testing | Low | Visual verification sufficient |

**Estimated LOC:** ~100-150 lines total
- CSS: ~50 lines
- JavaScript: ~50-100 lines (mostly template modifications)

---

## 9. Dependencies

- **Prerequisite:** None - can be implemented independently
- **Blocks:** None - other stories don't depend on this
- **Shared with:** "Start Implementation from Branch Button" story uses same branch buttons

---

## 10. Implementation Checklist

- [ ] Add CSS styles for all progress indicator states
- [ ] Update `renderStoryBranchButtons()` to accept and display branch status
- [ ] Add story status badge rendering in `updateSprintHeader()`
- [ ] Add story-level progress bar
- [ ] Add overall sprint progress bar
- [ ] Add blocked indicator styling and icon
- [ ] Test with sprints in various states (no progress, partial, complete, blocked)
- [ ] Verify progress updates after branch completion

---

## Summary

This is a **UI-focused story** where the backend/state work is already complete. The implementation adds visual polish to consume existing data. The changes are isolated to:
1. CSS styles (~50 lines)
2. Template updates in `app.js` (~50-100 lines)

No new files, no API changes, no data model changes. Low risk, straightforward implementation.