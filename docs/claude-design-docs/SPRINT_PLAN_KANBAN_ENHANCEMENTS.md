# Sprint Implementation Plan: Kanban View Enhancements

## Executive Summary

This plan covers three interconnected user stories that enhance the Backlog/User Stories view with drag-and-drop functionality, modal editing, and smooth view transitions. These stories share common infrastructure needs and should be implemented in a specific order to maximize code reuse and minimize refactoring.

---

## Architecture Analysis

### Current State

The existing `UserStoriesComponent` (803 lines) in `src/renderer/components/user-stories/user-stories.js` provides:

- **Dual view modes**: List view and Kanban view (auto-switches at 1200px width)
- **Status cycling**: Click-to-cycle through pending → in-progress → completed → archived
- **Card rendering**: `renderStoryCard()` generates story cards with action buttons
- **Event binding**: `bindCardEvents()` attaches click handlers post-render

The `ModalManager` (982 lines) in `src/renderer/lib/modal-manager.js` already supports:

- User story modals: `add-user-story` and `edit-user-story` types
- Standard modal patterns: backdrop, close button, keyboard handling
- Form rendering with validation

### Shared Components Identified

1. **Story Card Component** - Currently inline in `renderStoryCard()`, needs extraction for:
   - Drag handle/drag state styling
   - Expand button addition
   - Consistent behavior across views

2. **View Container** - The `#user-stories-list` container needs:
   - CSS class changes for transition animations
   - Data attributes for current view mode

3. **State Updates** - Story status changes via `intents.updateUserStory()`:
   - Already persists to storage
   - Triggers re-render via state change event

### Dependencies Between Stories

```
Story 3: Animated Transitions
         ↓
Story 1: Drag-and-Drop ←→ Story 2: Modal Editing
         ↓                        ↓
    [Shared: Story Card Styling & Events]
```

---

## Recommended Implementation Order

### Order: 3 → 2 → 1

| Order | Story | Rationale |
|-------|-------|-----------|
| **1st** | Story 3: Animated Transitions | Establishes CSS infrastructure and view-switching patterns that other stories build upon |
| **2nd** | Story 2: Modal Editing | Adds card interaction patterns (click to expand) before drag complicates click handling |
| **3rd** | Story 1: Drag-and-Drop | Most complex; builds on stable card styling and clean view transitions |

**Reasoning:**
- Animated transitions provide the CSS groundwork (transforms, transitions) reused by drag-and-drop
- Modal editing establishes click zones on cards before drag handlers could interfere
- Drag-and-drop is the most complex feature and benefits from stable foundations

---

## Story 3: Animated View Transitions

### Complexity: **Low**

### Technical Approach

Use CSS transitions with JavaScript-coordinated view switching. The existing `autoResponsive` system already toggles between views; we add animation timing.

**Key Decision: CSS-Only vs JavaScript Animation**
- **Recommendation**: CSS transitions with `requestAnimationFrame` coordination
- CSS handles the heavy lifting (GPU-accelerated transforms)
- JavaScript manages class toggling and timing

### Implementation Steps

1. **Add transition CSS classes** to `components.css`:
   ```css
   .user-stories-list {
     transition: opacity 0.25s ease-out;
   }

   .user-stories-list.view-transitioning {
     opacity: 0;
   }

   .story-card {
     transition: transform 0.25s ease-out, opacity 0.25s ease-out;
   }

   /* Respect reduced motion preference */
   @media (prefers-reduced-motion: reduce) {
     .user-stories-list,
     .story-card {
       transition: none;
     }
   }
   ```

2. **Modify view switching logic** in `user-stories.js`:
   ```javascript
   async switchView(newView) {
     const container = this.container;
     const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

     if (prefersReducedMotion) {
       this.currentView = newView;
       this.render();
       return;
     }

     // Fade out
     container.classList.add('view-transitioning');

     // Wait for transition
     await new Promise(r => setTimeout(r, 250));

     // Switch view and render
     this.currentView = newView;
     this.render();

     // Fade in (remove class triggers reverse transition)
     requestAnimationFrame(() => {
       container.classList.remove('view-transitioning');
     });
   }
   ```

3. **Update `updateViewForWidth()`** to use new async method

### Files Modified

| File | Changes |
|------|---------|
| `src/renderer/styles/components.css` | Add transition classes, reduced-motion query |
| `src/renderer/components/user-stories/user-stories.js` | Async view switching with animation timing |

### Risks

- **Low Risk**: CSS transitions are well-supported
- **Mitigation**: Reduced-motion media query handles accessibility

### Acceptance Criteria Verification

| Criteria | Implementation |
|----------|---------------|
| Fade/slide animations | CSS `opacity` and `transform` transitions |
| 200-300ms duration | 250ms chosen (middle ground) |
| Cards animate to positions | CSS transitions on `.story-card` |
| Reduced-motion respected | `@media (prefers-reduced-motion)` query |
| No jank/flickering | `requestAnimationFrame` for class changes |

---

## Story 2: Story Card Expansion and Modal Editing

### Complexity: **Medium**

### Technical Approach

Extend the existing `edit-user-story` modal with full field support and add an expand trigger to story cards. The `ModalManager` already has form rendering infrastructure.

**Key Decisions:**

1. **Click target**: Entire card vs dedicated expand button
   - **Recommendation**: Dedicated expand button (prevents conflicts with status clicks and future drag)

2. **Modal vs Inline expansion**
   - **Recommendation**: Modal (per acceptance criteria, consistent UX across views)

### Implementation Steps

1. **Add expand button to story cards** in `renderStoryCard()`:
   ```javascript
   <button class="story-expand-btn" title="View details" data-story-id="${story.id}">
     <span class="expand-icon">⤢</span>
   </button>
   ```

2. **Enhance edit modal rendering** in `modal-manager.js`:
   - Current `edit-user-story` modal exists but may need field additions
   - Ensure all fields are editable:
     - Title (text input)
     - Description (textarea)
     - Status (dropdown select)
     - Acceptance Criteria (dynamic list with add/remove)

3. **Add modal content for story details**:
   ```javascript
   renderEditUserStory(modal, state) {
     const story = state.userStories.find(s => s.id === modal.data.storyId);
     return `
       <form id="edit-story-form">
         <div class="form-group">
           <label>Title</label>
           <input type="text" name="title" value="${escapeHtml(story.title)}" required>
         </div>
         <div class="form-group">
           <label>Description</label>
           <textarea name="description" rows="4">${escapeHtml(story.description)}</textarea>
         </div>
         <div class="form-group">
           <label>Status</label>
           <select name="status">
             <option value="pending" ${story.status === 'pending' ? 'selected' : ''}>Pending</option>
             <option value="in-progress" ${story.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
             <option value="completed" ${story.status === 'completed' ? 'selected' : ''}>Completed</option>
           </select>
         </div>
         <div class="form-group">
           <label>Acceptance Criteria</label>
           <div id="criteria-list">
             ${story.acceptanceCriteria.map((c, i) => `
               <div class="criteria-item">
                 <input type="text" name="criteria[]" value="${escapeHtml(c)}">
                 <button type="button" class="remove-criteria" data-index="${i}">×</button>
               </div>
             `).join('')}
           </div>
           <button type="button" id="add-criteria-btn">+ Add Criterion</button>
         </div>
       </form>
     `;
   }
   ```

4. **Bind modal events**:
   - Save button: Gather form data, call `intents.updateUserStory()`, close modal
   - Cancel button: Close modal via `intents.hideModal()`
   - Escape key: Already handled by ModalManager
   - Add/Remove criteria: Dynamic list management

5. **Bind expand button in `bindCardEvents()`**:
   ```javascript
   container.querySelectorAll('.story-expand-btn').forEach(btn => {
     btn.addEventListener('click', (e) => {
       e.stopPropagation();
       const storyId = btn.dataset.storyId;
       this.intents.showModal('edit-user-story', { storyId });
     });
   });
   ```

### Files Modified

| File | Changes |
|------|---------|
| `src/renderer/components/user-stories/user-stories.js` | Add expand button to cards, bind click handler |
| `src/renderer/lib/modal-manager.js` | Enhanced `renderEditUserStory()` with all fields |
| `src/renderer/styles/components.css` | Expand button styling, criteria list styling |

### Risks

- **Medium Risk**: Acceptance criteria editing (dynamic list) adds complexity
- **Mitigation**: Start with simple list, iterate on UX

### Acceptance Criteria Verification

| Criteria | Implementation |
|----------|---------------|
| Click card opens modal | Expand button on each card |
| Modal shows all fields | Title, description, status, acceptance criteria |
| All fields editable | Form inputs for each field |
| Save persists changes | `intents.updateUserStory()` call |
| Cancel closes without saving | `intents.hideModal()` only |
| Keyboard accessible (Escape) | ModalManager already handles |
| Works in both views | Same `renderStoryCard()` used in both |

---

## Story 1: Drag-and-Drop Status Changes

### Complexity: **High**

### Technical Approach

Use the native HTML5 Drag and Drop API for broad compatibility. Implement drag handles on cards and drop zones on swimlanes.

**Key Decisions:**

1. **Native DnD vs Library (e.g., SortableJS)**
   - **Recommendation**: Native HTML5 DnD API
   - Pros: No dependencies, smaller bundle, sufficient for status changes
   - Cons: More verbose code, browser quirks
   - SortableJS alternative if native proves problematic

2. **Drag handle vs full card draggable**
   - **Recommendation**: Drag handle icon for clarity and to avoid conflicts with other interactions

3. **Archived stories**
   - **Decision**: Archived stories are excluded from drag-and-drop
   - They remain in the collapsible archived section below the kanban swimlanes
   - No "Archived" swimlane will be added

4. **Reordering within swimlanes**
   - **Decision**: Out of scope for this sprint
   - Focus solely on status changes between columns
   - Card order within a column follows existing sort (creation date)

5. **Fallback mechanism**
   - Per acceptance criteria: Status dropdown when DnD unavailable
   - Detection: Check for `draggable` support
   - Note: This is a desktop application, so touch fallback is not required

### Implementation Steps

1. **Add drag handle to story cards**:
   ```javascript
   <div class="story-card" draggable="true" data-story-id="${story.id}">
     <span class="drag-handle" title="Drag to change status">⋮⋮</span>
     <!-- existing card content -->
   </div>
   ```

2. **Style drag states** in CSS:
   ```css
   .story-card[draggable="true"] {
     cursor: grab;
   }

   .story-card.dragging {
     opacity: 0.5;
     cursor: grabbing;
   }

   .kanban-swimlane.drag-over {
     background: var(--bg-secondary);
     outline: 2px dashed var(--accent-color);
   }

   .drag-handle {
     cursor: grab;
     color: var(--text-muted);
     padding: 0.25rem;
   }
   ```

3. **Implement drag event handlers** in `user-stories.js`:
   ```javascript
   bindDragEvents() {
     // Only bind in kanban view
     if (this.currentView !== 'KANBAN') return;

     const cards = this.container.querySelectorAll('.story-card[draggable]');
     const swimlanes = this.container.querySelectorAll('.kanban-swimlane');

     cards.forEach(card => {
       card.addEventListener('dragstart', this.handleDragStart.bind(this));
       card.addEventListener('dragend', this.handleDragEnd.bind(this));
     });

     swimlanes.forEach(lane => {
       lane.addEventListener('dragover', this.handleDragOver.bind(this));
       lane.addEventListener('dragleave', this.handleDragLeave.bind(this));
       lane.addEventListener('drop', this.handleDrop.bind(this));
     });
   }

   handleDragStart(e) {
     const card = e.target.closest('.story-card');
     card.classList.add('dragging');
     e.dataTransfer.effectAllowed = 'move';
     e.dataTransfer.setData('text/plain', card.dataset.storyId);

     // Create ghost image
     const ghost = card.cloneNode(true);
     ghost.style.opacity = '0.8';
     document.body.appendChild(ghost);
     e.dataTransfer.setDragImage(ghost, 20, 20);
     setTimeout(() => document.body.removeChild(ghost), 0);
   }

   handleDragOver(e) {
     e.preventDefault();
     e.dataTransfer.dropEffect = 'move';
     e.currentTarget.classList.add('drag-over');
   }

   handleDragLeave(e) {
     e.currentTarget.classList.remove('drag-over');
   }

   handleDrop(e) {
     e.preventDefault();
     const lane = e.currentTarget;
     lane.classList.remove('drag-over');

     const storyId = e.dataTransfer.getData('text/plain');
     const newStatus = lane.dataset.status; // 'pending', 'in-progress', 'completed'

     // Update via intent (persists immediately)
     this.intents.updateUserStory(storyId, { status: newStatus });
   }

   handleDragEnd(e) {
     e.target.classList.remove('dragging');
     this.container.querySelectorAll('.drag-over').forEach(el => {
       el.classList.remove('drag-over');
     });
   }
   ```

4. **Add data-status attributes to swimlanes**:
   ```javascript
   renderKanbanView() {
     return `
       <div class="kanban-container">
         <div class="kanban-swimlane" data-status="pending">
           <h3>Pending</h3>
           ${this.renderSwimlanCards('pending')}
         </div>
         <div class="kanban-swimlane" data-status="in-progress">
           <h3>In Progress</h3>
           ${this.renderSwimlaneCards('in-progress')}
         </div>
         <div class="kanban-swimlane" data-status="completed">
           <h3>Completed</h3>
           ${this.renderSwimlaneCards('completed')}
         </div>
       </div>
     `;
   }
   ```

5. **Implement fallback dropdown** (for rare cases where DnD is unavailable):
   ```javascript
   // Detect DnD support (desktop app, so no touch detection needed)
   const hasDragSupport = 'draggable' in document.createElement('div');

   // In renderStoryCard():
   if (!hasDragSupport) {
     return `
       <select class="status-dropdown" data-story-id="${story.id}">
         <option value="pending" ${story.status === 'pending' ? 'selected' : ''}>Pending</option>
         <!-- ... -->
       </select>
     `;
   }
   ```

6. **Exclude archived stories from drag**:
   ```javascript
   // In renderStoryCard(), only add draggable for non-archived stories
   const isDraggable = story.status !== 'archived';

   <div class="story-card" ${isDraggable ? 'draggable="true"' : ''} data-story-id="${story.id}">
   ```

7. **Bind fallback dropdown events**:
   ```javascript
   container.querySelectorAll('.status-dropdown').forEach(select => {
     select.addEventListener('change', (e) => {
       const storyId = select.dataset.storyId;
       const newStatus = e.target.value;
       this.intents.updateUserStory(storyId, { status: newStatus });
     });
   });
   ```

### Files Modified

| File | Changes |
|------|---------|
| `src/renderer/components/user-stories/user-stories.js` | Drag handlers, swimlane data attributes, fallback logic |
| `src/renderer/styles/components.css` | Drag handle, dragging state, drop zone highlighting |

### Risks

- **Medium Risk**: Browser inconsistencies with HTML5 DnD in Electron
  - **Mitigation**: Electron uses Chromium, so behavior is consistent; test thoroughly

- **Low Risk**: Interaction with expand button clicks
  - **Mitigation**: `e.stopPropagation()` on expand button, drag only from handle

### Acceptance Criteria Verification

| Criteria | Implementation |
|----------|---------------|
| Cards are draggable | `draggable="true"` attribute, drag handle |
| Drop updates status | `handleDrop()` calls `intents.updateUserStory()` |
| Visual feedback for drop targets | `.drag-over` class with outline styling |
| Ghost/preview shown | `setDragImage()` with cloned card |
| Persists immediately | `updateUserStory()` triggers persistence |
| Fallback dropdown | Conditional render when DnD unsupported |

---

## File Change Summary

| File | Story 3 | Story 2 | Story 1 |
|------|---------|---------|---------|
| `src/renderer/components/user-stories/user-stories.js` | ✓ | ✓ | ✓ |
| `src/renderer/lib/modal-manager.js` | | ✓ | |
| `src/renderer/styles/components.css` | ✓ | ✓ | ✓ |

**Estimated Lines of Code:**
- Story 3: ~50 lines (CSS) + ~30 lines (JS)
- Story 2: ~80 lines (modal template) + ~50 lines (event handlers) + ~40 lines (CSS)
- Story 1: ~120 lines (drag handlers) + ~60 lines (CSS) + ~30 lines (fallback)

---

## Risk Assessment Summary

| Story | Risk Level | Primary Concerns | Mitigations |
|-------|------------|------------------|-------------|
| Story 3 | Low | Reduced motion accessibility | Media query implementation |
| Story 2 | Medium | Dynamic criteria list complexity | Iterative development |
| Story 1 | Medium | Electron DnD quirks | Chromium consistency, thorough testing |

---

## Testing Recommendations

### Story 3: Animated Transitions
- Test view switching at various widths
- Verify reduced-motion preference is respected
- Check for visual jank/flickering

### Story 2: Modal Editing
- Edit each field type and verify persistence
- Test keyboard navigation (Tab, Escape)
- Add/remove acceptance criteria
- Test from both view modes

### Story 1: Drag-and-Drop
- Drag between all swimlane combinations (pending ↔ in-progress ↔ completed)
- Verify immediate persistence (refresh page after drop)
- Verify archived stories are NOT draggable
- Test with screen reader
- Drag and cancel (drop outside valid target)
- Verify card reappears in original position on failed drop

---

## Implementation Checklist

### Phase 1: Story 3 - Animated Transitions
- [ ] Add CSS transition classes to `components.css`
- [ ] Add reduced-motion media query
- [ ] Modify `updateViewForWidth()` for async transitions
- [ ] Test transitions in both directions
- [ ] Verify no flickering/jank

### Phase 2: Story 2 - Modal Editing
- [ ] Add expand button to `renderStoryCard()`
- [ ] Enhance `renderEditUserStory()` in ModalManager
- [ ] Add criteria list management (add/remove)
- [ ] Bind expand button click handler
- [ ] Style modal form elements
- [ ] Test save/cancel flows

### Phase 3: Story 1 - Drag-and-Drop
- [ ] Add drag handle to non-archived cards only
- [ ] Add `data-status` to swimlanes
- [ ] Implement all drag event handlers
- [ ] Exclude archived stories from drag operations
- [ ] Style drag states and drop zones
- [ ] Add DnD support detection
- [ ] Implement fallback dropdown (for edge cases)
- [ ] Test in Electron environment

---

## Resolved Design Decisions

The following questions have been clarified and are now part of the implementation spec:

| Question | Decision |
|----------|----------|
| **Archived stories in drag-and-drop** | Excluded from DnD; remain in collapsed section below swimlanes |
| **Reordering within swimlanes** | Out of scope; cards maintain existing sort order within columns |
| **Touch/tablet support** | Not required; Puffin is a desktop application |

---

*Plan generated for sprint planning review. Implementation should proceed in the order specified above (3 → 2 → 1) after approval.*
