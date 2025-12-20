# Implementation Plan: Branch Buttons per User Story

## Story Overview

**As a user**, I want to see implementation branch buttons below each user story header so that I can start focused implementation work on specific areas.

---

## Architecture Analysis

### Current State

The sprint header system is already implemented with:
- Sprint header container (`#sprint-header`) in `index.html:315-330`
- Story card rendering in `app.js:761-770` via `updateSprintHeader()`
- Status tracking with states: `created` → `planning` → `planned`
- CSS styling in `components.css:370-487`

The application has 6 predefined branch types used throughout:
- **specifications** - Requirements and specs
- **architecture** - System design
- **ui** - User interface work
- **backend** - Server/data logic
- **deployment** - DevOps/CI/CD
- **tmp** - Temporary/experimental

### Gap to Fill

After plan approval (status: `planned`), story cards need to expand to show implementation branch buttons. Currently, story cards only show title and description.

---

## Implementation Approach

### Design Decision: Contextual Branch Buttons

Rather than showing all 6 branches for every story, we'll show contextually relevant branches based on the story's nature. The default set will be:
- **UI** - Frontend implementation
- **Backend** - Server/API implementation
- **Full Stack** - Combined implementation (uses current active branch)

This keeps the UI clean while covering the primary implementation patterns. Users can always use the main branch tabs for other work.

### Visual Design

```
┌──────────────────────────────────────────────────────────┐
│ Sprint                           [Ready for Implementation]  ×  │
├──────────────────────────────────────────────────────────┤
│ ┌─ Story 1: Add user authentication ─────────────────┐   │
│ │ As a user, I want to log in securely...            │   │
│ │                                                     │   │
│ │ ┌─────────┐  ┌──────────┐  ┌────────────┐          │   │
│ │ │   UI    │  │ Backend  │  │ Full Stack │          │   │
│ │ └─────────┘  └──────────┘  └────────────┘          │   │
│ └─────────────────────────────────────────────────────┘   │
│                                                           │
│ ┌─ Story 2: Password reset flow ─────────────────────┐   │
│ │ As a user, I want to reset my password...          │   │
│ │                                                     │   │
│ │ ┌─────────┐  ┌──────────┐  ┌────────────┐          │   │
│ │ │   UI    │  │ Backend  │  │ Full Stack │          │   │
│ │ └─────────┘  └──────────┘  └────────────┘          │   │
│ └─────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## File Changes

### 1. `src/renderer/app.js` (Primary Changes)

**Location**: `updateSprintHeader()` method (lines 740-812)

**Changes**:
- Modify story card HTML template to include branch buttons
- Conditionally render branch buttons only when `sprint.status === 'planned'`
- Add click handlers for branch buttons
- Pass story context (id, title) when button is clicked

**New Code Structure**:
```javascript
// In updateSprintHeader() - lines 764-769
storiesContainer.innerHTML = sprint.stories.map(story => `
  <div class="sprint-story-card" data-story-id="${story.id}">
    <div class="story-header">
      <h4>${this.escapeHtml(story.title)}</h4>
    </div>
    <p>${this.escapeHtml(story.description || '')}</p>
    ${sprint.status === 'planned' ? this.renderStoryBranchButtons(story) : ''}
  </div>
`).join('')
```

**New Method**:
```javascript
renderStoryBranchButtons(story) {
  const branches = [
    { id: 'ui', label: 'UI', icon: '🎨' },
    { id: 'backend', label: 'Backend', icon: '⚙️' },
    { id: 'fullstack', label: 'Full Stack', icon: '🔗' }
  ]
  return `
    <div class="story-branch-buttons">
      ${branches.map(branch => `
        <button class="story-branch-btn"
                data-story-id="${story.id}"
                data-branch="${branch.id}"
                title="Start ${branch.label} implementation for this story">
          <span class="branch-icon">${branch.icon}</span>
          <span class="branch-label">${branch.label}</span>
        </button>
      `).join('')}
    </div>
  `
}
```

**Event Binding** (add to existing bound section):
```javascript
// Add click handlers for story branch buttons
sprintHeader.addEventListener('click', (e) => {
  const branchBtn = e.target.closest('.story-branch-btn')
  if (branchBtn) {
    const storyId = branchBtn.dataset.storyId
    const branchType = branchBtn.dataset.branch
    this.intents.startStoryImplementation(storyId, branchType)
  }
})
```

---

### 2. `src/renderer/styles/components.css` (Styling)

**Location**: After `.sprint-story-card p` (line 467)

**New Styles**:
```css
/* Story Branch Buttons */
.story-branch-buttons {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color);
}

.story-branch-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.story-branch-btn:hover {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
  transform: translateY(-1px);
}

.story-branch-btn:active {
  transform: translateY(0);
}

.story-branch-btn .branch-icon {
  font-size: 0.875rem;
}

.story-branch-btn .branch-label {
  font-weight: 500;
}

/* Planned status story card enhancement */
.sprint-story-card.has-buttons {
  padding-bottom: 0.75rem;
}
```

---

### 3. `src/renderer/sam/actions.js` (New Action)

**Location**: After `clearPendingSprintPlanning` action (line 916)

**New Action**:
```javascript
// Start implementation for a specific story and branch
export const startStoryImplementation = (storyId, branchType) => ({
  type: 'START_STORY_IMPLEMENTATION',
  payload: {
    storyId,
    branchType,
    timestamp: Date.now()
  }
})
```

---

### 4. `src/renderer/sam/model.js` (New Acceptor)

**Location**: After `APPROVE_PLAN` acceptor (around line 1918)

**New Acceptor**:
```javascript
// Start implementation for a specific story branch
case 'START_STORY_IMPLEMENTATION': {
  const { storyId, branchType } = proposal.payload
  const sprint = model.activeSprint

  if (!sprint || sprint.status !== 'planned') {
    console.warn('[SPRINT] Cannot start implementation - sprint not in planned state')
    return
  }

  const story = sprint.stories.find(s => s.id === storyId)
  if (!story) {
    console.warn('[SPRINT] Story not found:', storyId)
    return
  }

  // Map branch type to actual branch
  const branchMap = {
    'ui': 'ui',
    'backend': 'backend',
    'fullstack': model.history.activeBranch || 'backend'
  }
  const targetBranch = branchMap[branchType] || branchType

  // Update sprint status
  model.activeSprint.status = 'implementing'

  // Build implementation prompt context
  const implementationPrompt = buildImplementationPrompt(story, branchType, sprint)

  // Store pending implementation for IPC
  model._pendingStoryImplementation = {
    storyId,
    branchType,
    branchId: targetBranch,
    promptContent: implementationPrompt,
    story
  }

  break
}
```

**Helper Function** (add near other prompt builders):
```javascript
function buildImplementationPrompt(story, branchType, sprint) {
  const branchDescriptions = {
    'ui': 'UI/UX thread (frontend implementation)',
    'backend': 'Backend thread (API/data/logic implementation)',
    'fullstack': 'Full Stack implementation'
  }

  return `## Implementation Request

[${branchDescriptions[branchType] || branchType}]

### User Story
**${story.title}**

${story.description}

### Acceptance Criteria
${story.acceptanceCriteria?.map((c, i) => `${i + 1}. ${c}`).join('\n') || 'No specific criteria defined.'}

### Sprint Context
This is part of an approved sprint plan. Please implement this story following the established patterns in the codebase.

---

Please proceed with the implementation.`
}
```

---

### 5. `src/renderer/sam/state.js` (State Exposure)

**Location**: Check if `_pendingStoryImplementation` needs to be exposed

Add to state computation if needed:
```javascript
pendingStoryImplementation: model._pendingStoryImplementation || null
```

---

### 6. `src/renderer/lib/state-persistence.js` or `app.js` (IPC Handler)

**Location**: Where other pending operations are handled

**Add handler for pending implementation**:
```javascript
// Check for pending story implementation
if (state.pendingStoryImplementation) {
  const impl = state.pendingStoryImplementation

  // Switch to target branch
  this.intents.selectBranch(impl.branchId)

  // Submit the implementation prompt
  if (window.puffin?.claude) {
    window.puffin.claude.submit({
      content: impl.promptContent,
      branchId: impl.branchId,
      model: 'opus'
    })
  }

  // Clear the pending flag
  this.intents.clearPendingStoryImplementation()
}
```

---

## Implementation Order

1. **CSS Styling** (`components.css`) - Add button styles first so we can visually test
2. **Action** (`actions.js`) - Add the new action creator
3. **Acceptor** (`model.js`) - Add state mutation logic
4. **Render** (`app.js`) - Update `updateSprintHeader()` to render buttons and bind events
5. **IPC Integration** - Connect button clicks to actual Claude submission

---

## Complexity Assessment

**Overall: Medium**

| Aspect | Complexity | Notes |
|--------|------------|-------|
| UI Rendering | Low | Simple HTML template extension |
| Styling | Low | Following existing patterns |
| State Management | Medium | New action/acceptor following SAM pattern |
| Event Handling | Low | Standard click handlers |
| IPC Integration | Medium | Must coordinate with existing flow |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Button overflow on small screens | Medium | Low | Use flex-wrap and responsive sizing |
| Click handler conflicts | Low | Medium | Use event delegation on parent |
| Branch selection race condition | Low | Medium | Clear pending flag after submission |
| Story context loss | Low | High | Include full story data in action payload |

---

## Testing Checklist

- [ ] Create sprint with 2-3 stories
- [ ] Click "Plan" and let Claude generate a plan
- [ ] Click "Approve Plan" - verify buttons appear
- [ ] Verify buttons only show when status is "planned"
- [ ] Click each branch button type (UI, Backend, Full Stack)
- [ ] Verify correct branch is selected after click
- [ ] Verify implementation prompt contains story context
- [ ] Test with stories that have acceptance criteria
- [ ] Test responsive behavior (narrow window)

---

## Future Enhancements (Out of Scope)

These are mentioned in related user stories but not implemented in this plan:

1. **Branch progress tracking** - Mark branches as started/completed
2. **Branch-specific icons** based on story content
3. **Disable buttons for completed branches**
4. **Custom branch types** per project

---

## Ready for Implementation

This plan covers all acceptance criteria:

1. ✅ Each user story header displays branch buttons (UI, Backend, etc.)
2. ✅ Branch buttons appear after the sprint plan is approved
3. ✅ Buttons are contextually relevant (UI, Backend, Full Stack)
4. ✅ Branch buttons are visually associated with their parent user story
5. ✅ User can identify which story each branch button belongs to

**Estimated files to modify**: 5 files
**Estimated lines of code**: ~150 lines
