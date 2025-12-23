# Thread Statistics Improvement - Implementation Plan

## Overview

This plan covers improvements to the thread statistics display in the right swimlane metadata panel. The goal is to show accurate per-thread statistics instead of branch-level aggregates, and add defect tracking.

---

## User Stories

### Story 1: Per-Thread Statistics Aggregation
**As a user**, I want thread statistics (turns, cost, duration) to reflect only the current thread so that I can accurately track resource usage per conversation.

### Story 2: Thread Creation Date Display
**As a user**, I want to see when the current thread was created so that I can track conversation history.

### Story 3: Thread Defect Count Tracking
**As a user**, I want to track the number of defect-reporting prompts per thread so that I can measure how many corrections were needed during development.

### Story 4: Remove Model Display from Thread Stats
**As a user**, I want the statistics panel to focus on actionable metrics.

---

## Architecture Analysis

### Current Problem

The `updateMetadataPanel()` method in `src/renderer/app.js` (lines 1748-1864) aggregates statistics across **all prompts in the branch**:

```javascript
// Current (WRONG) - iterates ALL branch prompts
prompts.forEach(prompt => {
  if (prompt.response) {
    totalTurns += prompt.response.turns
    // ...
  }
})
```

### Thread Structure

Threads are implicit parent-child hierarchies within a branch:

```
Branch: specifications
├── Thread A: prompt1 → prompt2 (parentId=prompt1) → prompt3 (parentId=prompt2)
├── Thread B: prompt4 → prompt5 (parentId=prompt4)
└── Thread C: prompt6 (standalone)
```

To get per-thread stats, we must:
1. Find the thread root (walk up via `parentId` until null)
2. Collect all descendants (walk down via `children` array)
3. Aggregate only those prompts

---

## Implementation Order

**Recommended sequence:** Story 4 → Story 1 → Story 2 → Story 3

1. **Remove Model** - Quick cleanup, reduces noise
2. **Per-Thread Stats** - Core fix, requires thread traversal algorithm
3. **Created Date** - Simple extraction from thread root
4. **Defect Count** - New feature, builds on thread collection

---

## Story 4: Remove Model Display

### Complexity: **Low**

### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/index.html` | Modify | Remove Model stat-item div |
| `src/renderer/app.js` | Modify | Remove modelEl references |

### Implementation

#### 1. HTML (`src/renderer/index.html`)

Remove lines 460-463:
```html
<!-- DELETE THIS -->
<div class="stat-item">
  <span class="stat-label">Model</span>
  <span id="stat-model" class="stat-value">-</span>
</div>
```

#### 2. JavaScript (`src/renderer/app.js`)

Remove from `updateMetadataPanel()`:
```javascript
// DELETE: const modelEl = document.getElementById('stat-model')

// DELETE: lines 1826-1829
// if (modelEl) {
//   const model = thread?.model || state.settings?.defaultModel || '-'
//   modelEl.textContent = model.charAt(0).toUpperCase() + model.slice(1)
// }
```

---

## Story 1: Per-Thread Statistics Aggregation

### Complexity: **Medium**

### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/app.js` | Modify | Add thread traversal, fix aggregation |

### Implementation

#### Add Thread Collection Helper

Add new method to the App class:

```javascript
/**
 * Collect all prompts belonging to a thread
 * @param {string} promptId - Any prompt ID in the thread
 * @param {Array} allPrompts - All prompts in the branch
 * @returns {Array} - All prompts in the thread (root to leaves)
 */
collectThreadPrompts(promptId, allPrompts) {
  if (!promptId || !allPrompts || allPrompts.length === 0) {
    return []
  }

  // Build lookup map for efficiency
  const promptMap = new Map()
  allPrompts.forEach(p => promptMap.set(p.id, p))

  // Find the starting prompt
  let current = promptMap.get(promptId)
  if (!current) return []

  // Walk up to find thread root
  while (current.parentId) {
    const parent = promptMap.get(current.parentId)
    if (!parent) break
    current = parent
  }
  const root = current

  // Collect all descendants using BFS
  const threadPrompts = []
  const queue = [root]

  while (queue.length > 0) {
    const prompt = queue.shift()
    threadPrompts.push(prompt)

    // Add children to queue
    if (prompt.children && prompt.children.length > 0) {
      prompt.children.forEach(childId => {
        const child = promptMap.get(childId)
        if (child) queue.push(child)
      })
    }
  }

  return threadPrompts
}
```

#### Modify `updateMetadataPanel()`

Replace the aggregation logic:

```javascript
updateMetadataPanel(state) {
  // Update thread statistics
  const turnsEl = document.getElementById('stat-turns')
  const costEl = document.getElementById('stat-cost')
  const durationEl = document.getElementById('stat-duration')
  const createdEl = document.getElementById('stat-created')
  const defectsEl = document.getElementById('stat-defects')  // NEW

  // Get current thread/branch info
  const activeBranch = state.history?.activeBranch
  const activePromptId = state.history?.activePromptId
  const branch = activeBranch ? state.history?.raw?.branches?.[activeBranch] : null
  const allPrompts = branch?.prompts || []

  // CHANGED: Get only prompts in the current thread
  const threadPrompts = this.collectThreadPrompts(activePromptId, allPrompts)

  // Aggregate statistics across thread prompts only
  let totalTurns = 0
  let totalCost = 0
  let totalDuration = 0
  let hasCostData = false
  let hasDurationData = false

  console.log('[STATS] Thread prompts:', threadPrompts.length, 'of', allPrompts.length, 'total')

  threadPrompts.forEach(prompt => {
    if (prompt.response) {
      if (prompt.response.turns) {
        totalTurns += prompt.response.turns
      }
      if (prompt.response.cost !== undefined && prompt.response.cost !== null) {
        totalCost += prompt.response.cost
        hasCostData = true
      }
      if (prompt.response.duration !== undefined && prompt.response.duration !== null) {
        totalDuration += prompt.response.duration
        hasDurationData = true
      }
    }
  })

  // ... rest of display logic unchanged
}
```

### Edge Cases

- **No thread selected** (`activePromptId` is null): Returns empty array, stats show 0/-
- **Single prompt thread**: Works correctly, shows that prompt's stats
- **Orphaned prompts** (parentId points to deleted prompt): Treated as thread root

---

## Story 2: Thread Creation Date Display

### Complexity: **Low**

### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/app.js` | Modify | Get created date from thread root |

### Implementation

Modify the created date section in `updateMetadataPanel()`:

```javascript
// Update created date (from thread root, not first branch prompt)
if (createdEl) {
  // Find thread root (first prompt in threadPrompts after collection)
  const threadRoot = threadPrompts.length > 0 ? threadPrompts[0] : null

  if (threadRoot?.createdAt || threadRoot?.timestamp) {
    const timestamp = threadRoot.createdAt || threadRoot.timestamp
    const date = new Date(timestamp)
    createdEl.textContent = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } else {
    createdEl.textContent = '-'
  }
}
```

**Note:** The `collectThreadPrompts()` method returns prompts with root first (BFS order), so `threadPrompts[0]` is the thread root.

---

## Story 3: Thread Defect Count Tracking

### Complexity: **Low**

### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/renderer/index.html` | Modify | Add Defects stat-item |
| `src/renderer/app.js` | Modify | Add defect counting logic |

### Implementation

#### 1. HTML (`src/renderer/index.html`)

Add after the Created stat-item (around line 465):

```html
<div class="stat-item">
  <span class="stat-label">Defects</span>
  <span id="stat-defects" class="stat-value">0</span>
</div>
```

#### 2. Defect Detection Helper

Add new method to App class:

```javascript
/**
 * Count defect-reporting prompts in a thread
 * A defect prompt is a user prompt containing defect-related keywords
 * @param {Array} threadPrompts - Prompts in the thread
 * @returns {number} - Count of defect-reporting prompts
 */
countThreadDefects(threadPrompts) {
  const defectKeywords = [
    'bug', 'defect', 'broken', 'error', 'issue', 'problem',
    'wrong', 'incorrect', "doesn't work", 'not working',
    'failed', 'failing', 'fix'
  ]

  // Create regex pattern (case-insensitive, word boundaries)
  const pattern = new RegExp(
    '\\b(' + defectKeywords.join('|').replace(/'/g, "'?") + ')\\b',
    'i'
  )

  let defectCount = 0

  threadPrompts.forEach(prompt => {
    // Check user prompt content (not Claude's response)
    const content = prompt.content || ''
    if (pattern.test(content)) {
      defectCount++
    }
  })

  return defectCount
}
```

#### 3. Add to `updateMetadataPanel()`

```javascript
// Count and display defects
if (defectsEl) {
  const defectCount = this.countThreadDefects(threadPrompts)
  defectsEl.textContent = defectCount.toString()
}
```

### Defect Keywords

The following keywords trigger a defect count (case-insensitive, word boundary):
- bug, defect, broken, error, issue, problem
- wrong, incorrect
- doesn't work, not working
- failed, failing, fix

**Note:** Each prompt counts as max 1 defect, regardless of how many keywords it contains.

---

## Updated HTML Structure

After implementation, the stats section in `index.html` will be:

```html
<div class="metadata-section">
  <h4 class="metadata-section-title">Thread Stats</h4>
  <div class="stats-grid">
    <div class="stat-item">
      <span class="stat-label">Turns</span>
      <span id="stat-turns" class="stat-value">0</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Cost</span>
      <span id="stat-cost" class="stat-value">-</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Duration</span>
      <span id="stat-duration" class="stat-value">-</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Created</span>
      <span id="stat-created" class="stat-value">-</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Defects</span>
      <span id="stat-defects" class="stat-value">0</span>
    </div>
  </div>
</div>
```

---

## Testing Checklist

### Story 1: Per-Thread Stats
- [ ] Stats reflect only current thread (not entire branch)
- [ ] Switching threads updates stats correctly
- [ ] New thread shows 0 turns, -, - for cost/duration
- [ ] Thread with multiple prompts shows cumulative stats
- [ ] Works when no thread selected (shows defaults)

### Story 2: Created Date
- [ ] Shows thread root creation timestamp
- [ ] Format is readable (e.g., "Dec 23, 2:30 PM")
- [ ] Shows "-" when no thread selected
- [ ] Works with both `createdAt` and `timestamp` fields

### Story 3: Defect Count
- [ ] Counts prompts with defect keywords
- [ ] Case-insensitive matching works
- [ ] Each prompt counts as max 1
- [ ] Shows 0 for threads with no defect prompts
- [ ] "fix the bug and error" in one prompt = 1 defect

### Story 4: Remove Model
- [ ] Model stat row removed from UI
- [ ] No JavaScript errors from missing element

---

## Summary

| Story | Complexity | Files Modified | LOC Change |
|-------|------------|----------------|------------|
| Story 4: Remove Model | Low | index.html, app.js | -10 |
| Story 1: Per-Thread Stats | Medium | app.js | +40 |
| Story 2: Created Date | Low | app.js | +5 (modify) |
| Story 3: Defect Count | Low | index.html, app.js | +30 |

**Total estimated change: ~65 lines**

The implementation follows existing patterns in `app.js` and reuses the thread collection logic across multiple features.
