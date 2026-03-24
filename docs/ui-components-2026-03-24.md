# UI Components Review — 2026-03-24

Automated nightly audit of UI component patterns across
`src/renderer/app.js`, `src/renderer/sam/model.js`, `src/renderer/sam/state.js`,
`src/renderer/lib/modal-manager.js`, `src/renderer/lib/state-persistence.js`,
`src/renderer/components/user-stories/user-stories.js`, and
`src/renderer/styles/components.css`.

---

## Summary

| Criterion | Result |
|---|---|
| Truthiness checks on empty arrays | COMPLIANT (prior bug fixed; pattern audited) |
| Modal width via `.modal:has()` pattern | **VIOLATION — 2 modals use `.modal.classname` compound selector** |
| Story status uses 'completed' not 'implemented' | COMPLIANT |
| Assertion counts use fresh DB data (not stale in-memory) | COMPLIANT (prior bug fixed) |
| RIS availability from DB not ephemeral risMap | COMPLIANT |

---

## Finding 1 — Truthiness Checks on Empty Arrays (AC1)

**Confidence: 92** | **Result: COMPLIANT**

JavaScript's truthiness rules treat `[]` as truthy. A `source1 || source2` expression
where `source1` returns an empty array `[]` will never fall through to `source2`,
silently producing stale-empty data even when `source2` has valid content.

All assertion lookups in the renderer have been audited and use explicit `.length > 0`
guards:

### app.js:2834–2838 (sprint view assertion stats)
```javascript
// Get inspection assertions — prefer whichever source has actual data.
// Empty arrays are truthy so we must check .length, not just truthiness.
const sprintAssertions = story.inspectionAssertions || []
const backlogAssertions = backlogStory?.inspectionAssertions || []
const assertions = sprintAssertions.length > 0 ? sprintAssertions
  : backlogAssertions.length > 0 ? backlogAssertions : []
```
Compliant. The comment is preserved as a guard-rail for future editors.

### app.js:744–746 (code review confirmation assertion stats)
```javascript
const bAssert = backlogStory?.inspectionAssertions || []
const sAssert = story.inspectionAssertions || []
const assertions = bAssert.length > 0 ? bAssert : sAssert.length > 0 ? sAssert : []
```
Compliant.

### app.js:5788–5790 (post-generation sync into sprint stories)
```javascript
if (freshStory?.inspectionAssertions?.length > 0 &&
    (!sprintStory.inspectionAssertions || sprintStory.inspectionAssertions.length === 0)) {
  sprintStory.inspectionAssertions = freshStory.inspectionAssertions
```
Compliant — explicit `.length > 0` on both sides.

### Single-source normalization (not a risk)
Multiple sites use `story.inspectionAssertions || []` as a simple undefined-to-empty
normalization with no fallback to an alternate data source:
`modal-manager.js:2147`, `modal-manager.js:2812`, `modal-manager.js:3790`,
`modal-manager.js:3828`, `user-stories.js:1842`. These are correct.

### State-persistence whitelist guards
`state-persistence.js:236` and `state-persistence.js:581` both gate their in-memory
refresh on `result.story?.inspectionAssertions?.length > 0`, so the auto-generated
assertion back-propagation path also avoids the truthy-array pitfall.

**Historical context:** Prior to the fix, `story.inspectionAssertions || backlogStory?.inspectionAssertions`
existed in two call sites. The `||` chain returned `[]` from the sprint story (empty
but truthy) and never fell through to the backlog story's DB-backed assertions,
causing 0/0/0/0 in the code review modal. Both sites have been corrected and the
comment in app.js:2833 serves as documentation.

---

## Finding 2 — Modal Width Using `.modal.classname` Instead of `.modal:has()` (AC2)

**Confidence: 95** | **Result: VIOLATION**

The established pattern for overriding modal dimensions is the CSS `:has()` selector:
```css
.modal:has(.sprint-stories-modal) {
  min-width: 600px;
  max-width: 800px;
}
```

This targets the `.modal` wrapper element *when it contains* a child with the specified
class. It does not require the specific class to be placed directly on the `.modal`
wrapper element.

Two modals use the older compound-class selector instead:

### 2a. Story Review Modal — `components.css:9169`
```css
.modal.story-review-modal {
  min-width: 600px;
  max-width: 800px;
}
```

### 2b. Handoff Review Modal — `components.css:9964`
```css
.modal.handoff-modal {
  min-width: 550px;
  max-width: 700px;
}
```

**Why this matters:** `.modal.story-review-modal` matches only when the `.modal`
wrapper element *itself* carries both classes. In `modal-manager.js`, modals are
rendered as `<div class="modal-overlay"><div class="modal">...</div></div>` — the
specific content class (e.g. `story-review-modal`) is on an *inner* element, not the
`.modal` div. If that is the case, `.modal.story-review-modal` never matches and the
width override silently has no effect, falling back to the base `min-width: 400px;
max-width: 600px` defaults.

**Verification needed:** Confirm whether `modal-manager.js` adds `story-review-modal`
and `handoff-modal` classes to the outer `.modal` wrapper or to an inner content div.
If they are on inner elements, both modals are currently rendering at 400–600px
instead of their intended widths.

**Compliant modals (8 total) for reference:**

| Modal | Selector |
|---|---|
| Sprint Stories | `.modal:has(.sprint-stories-modal)` |
| Sprint Create | `.modal:has(.sprint-create-modal)` |
| Sprint Branch Create | `.modal:has(.sprint-branch-create-modal)` |
| Plan Review | `.modal:has(.plan-review-container)` |
| RIS Viewer | `.modal:has(.ris-viewer)` |
| Claude Question | `.modal:has(.claude-question-modal)` |
| Completion Summary | `.modal:has(.completion-summary-viewer)` |
| Sprint Schedule | `.modal:has(.sprint-schedule-modal)` |

**Fix:**
```css
/* components.css:9169 */
.modal:has(.story-review-modal) {
  min-width: 600px;
  max-width: 800px;
}

/* components.css:9964 */
.modal:has(.handoff-modal) {
  min-width: 550px;
  max-width: 700px;
}
```

---

## Finding 3 — Story Status Uses 'completed' Consistently (AC3)

**Confidence: 98** | **Result: COMPLIANT**

All story status transitions and comparisons in the renderer use the canonical
`'completed'` value:

- `sam/model.js`: 22 occurrences of `status = 'completed'` or `status === 'completed'`
- `sam/state.js`: `storyStatus = 'completed'` at line 471
- `state-persistence.js`: `{ status: 'completed' }` passed to `updateUserStory()`
- `user-stories.js`: `{ status: 'completed' }` at line 1592; status filter at line 1047

The word `implemented` appears only in non-status contexts:
- `model.js:1261`: `implementedOn: []` — a property name tracking branch names, not
  a status value
- `actions.js:950`: JSDoc comment `@param {string} storyId - The ID of the story being implemented`
- `sam/state.js:69`: Comment: `// Active Implementation Story`
- `model.js:3808`: Prompt string: `'This is the UI implementation thread...'`

No code path sets `story.status = 'implemented'` or compares `story.status === 'implemented'`.

---

## Finding 4 — Assertion Counts and Stale In-Memory Data (AC4)

**Confidence: 93** | **Result: COMPLIANT (fix in place)**

The code review modal's assertion stats pipeline now correctly fetches fresh data from
the database before computing the 0/0/0/0 statistics:

### `showCodeReviewConfirmation()` pipeline (app.js:620–653)

**Step 1 — Sync assertion stores** (`app.js:621–623`):
```javascript
if (sprintStoryIds.length > 0 && window.puffin?.state?.syncAssertionsFromCreTable) {
  await window.puffin.state.syncAssertionsFromCreTable(sprintStoryIds)
}
```
Reconciles `inspection_assertions` table with `user_stories.inspection_assertions` JSON
column for all sprint stories, closing the dual-store gap.

**Step 2 — Fresh DB fetch** (`app.js:635–640`):
```javascript
const result = await window.puffin.state.getUserStories()
if (result.success && result.stories) {
  freshStories = result.stories
}
```

**Step 3 — Prefer fresh over in-memory** (`app.js:730–746`):
```javascript
calculateSprintAssertionStats(sprint, freshStories = null) {
  const backlogStories = freshStories || this.state?.userStories || []
  // ...
  const bAssert = backlogStory?.inspectionAssertions || []
  const sAssert = story.inspectionAssertions || []
  const assertions = bAssert.length > 0 ? bAssert : sAssert.length > 0 ? sAssert : []
```

**Historical context:** The original bug had two root causes: (1) stale in-memory
`inspectionAssertions` not refreshed after CRE generation, and (2) the truthy-array
issue (Finding 1) hiding DB data behind empty sprint-story arrays. Both are now fixed.

**Post-generation sprint story sync** (`app.js:5788–5792`): After CRE assertion
generation, sprint stories in-memory are explicitly updated from fresh DB data if their
own `inspectionAssertions` array is empty. This prevents the 0/0/0/0 case mid-sprint.

---

## Finding 5 — RIS Availability from DB Not Ephemeral risMap (AC5)

**Confidence: 96** | **Result: COMPLIANT**

`sprint.risMap` is ephemeral: it is only populated during the current session when
`crePlanningComplete` fires. On application restart, `model.activeSprint.risMap`
initializes to `{}`, causing RIS badges to disappear for all stories even though RIS
documents exist in the `ris` table.

Two complementary mechanisms prevent this:

### Mechanism 1 — Sprint init restores risMap from DB (app.js:1608–1623)
During the `INITIALIZE` acceptor path, the code fetches each story's RIS from the DB
and rebuilds `sprint.risMap`:
```javascript
const risMap = {}
for (const storyId of sprint.stories.map(s => s.id)) {
  const risResult = await window.puffin.cre.getRis({ storyId })
  if (risResult.success && risResult.data) {
    risMap[storyId] = { ...risResult.data, markdown: risResult.data.content }
  }
}
sprint.risMap = risMap
```

### Mechanism 2 — user-stories.js async DB fallback (user-stories.js:427–447)
The sprint view component populates `this.risAvailable` from in-memory `risMap` first,
then asynchronously calls `window.puffin.cre.listRisStoryIds()` to add any DB-backed
IDs not yet in memory:
```javascript
this.risAvailable = new Set(Object.keys(state.activeSprint?.risMap || {})
  .filter(id => { const ris = state.activeSprint.risMap[id]; return ris && !ris.error }))

if (window.puffin?.cre?.listRisStoryIds) {
  window.puffin.cre.listRisStoryIds().then(result => {
    if (result.success && result.storyIds?.length > 0) {
      for (const id of result.storyIds) {
        if (!this.risAvailable.has(id)) { this.risAvailable.add(id); changed = true }
      }
      if (changed) this.render()
    }
  })
}
```

The `?.length > 0` guard on the DB result is correct — avoids adding IDs from an empty
successful response. Errors are silently swallowed (`.catch(() => {})`) since RIS badge
display is non-critical.

---

## Prioritized Recommendations

### Medium Priority

1. **Migrate `.modal.story-review-modal` and `.modal.handoff-modal` to `:has()` pattern**
   (Finding 2):
   - `components.css:9169` → `.modal:has(.story-review-modal)`
   - `components.css:9964` → `.modal:has(.handoff-modal)`

   First verify in `modal-manager.js` whether these class names are applied to the
   outer `.modal` wrapper or to inner content elements. If inner (likely), the current
   selectors never match and these modals render at the default 400–600px size
   regardless of the override rules.

### No Action Required

2. All array truthiness checks comply with the `.length > 0` pattern (Finding 1).
3. Status vocabulary is consistent — `'completed'` used everywhere (Finding 3).
4. Assertion counts fetch fresh DB data before code review display (Finding 4).
5. RIS availability uses DB persistence layer, not session-only risMap (Finding 5).
