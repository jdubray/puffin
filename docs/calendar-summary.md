# Calendar Plugin — Technical Summary

This document describes Puffin's Calendar Plugin: its purpose, architecture, lifecycle, data flow, notes CRUD system, sprint/branch integration, and configuration.

## 1. Overview

The Calendar Plugin provides a visual calendar interface within Puffin that shows development activity by date. It aggregates three data sources — sprints, git branches, and user-created notes — into day cells rendered in week or month views. Users can browse activity history, inspect sprint details, and maintain per-day sticky notes for tracking context.

**Key Capabilities:**
- **Week and month views** with navigation (previous/next/today)
- **Sprint activity overlay**: Archived and active sprints displayed on their creation or close dates
- **Git branch indicators**: Color-coded branch pills showing branch activity per day
- **Post-it notes**: Full CRUD with drag-and-drop, copy-paste, 6 color options
- **Sprint detail panel**: Side panel listing sprints for a selected date, with modal for full sprint/story details

**File count**: 22 source files (1 manifest, 1 entry point, 4 services, 14 renderer files (13 components + index.js), 1 utility module, 1 CSS stylesheet). No test files exist for this plugin.

## 2. Plugin Manifest and Configuration

The plugin is defined in `plugins/calendar/puffin-plugin.json`:

```json
{
  "name": "calendar",
  "displayName": "Calendar",
  "version": "1.0.0",
  "description": "Calendar view for tracking sprints, stories, and development activity",
  "author": "Puffin",
  "main": "index.js",
  "renderer": {
    "components": {
      "CalendarViewComponent": { "class": "CalendarViewComponent" },
      "DayCellComponent": { "class": "DayCellComponent" }
    },
    "entry": "renderer/components/index.js",
    "styles": ["calendar.css"]
  },
  "views": [{
    "id": "calendar-view",
    "name": "Calendar",
    "icon": "📅",
    "component": "CalendarViewComponent",
    "location": "navigation",
    "order": 60
  }],
  "activationEvents": ["onStartup"]
}
```

### Configuration Options

| Option | Value | Description |
|--------|-------|-------------|
| Navigation order | `60` | Calendar appears at position 60 in the left nav |
| Activation | `onStartup` | Plugin loads immediately when Puffin starts |
| Icon | `📅` | Nav icon for the Calendar view |
| Styles | `calendar.css` | Single 2939-line stylesheet using CSS Grid, CSS custom properties, and dark theme variables |

The plugin has no user-configurable settings or preferences panel. All behavior is hard-coded:
- Sprint cache TTL: 5 seconds (main process)
- Git data cache TTL: 30 seconds (renderer)
- Sprint data cache TTL: 30 seconds (renderer)
- Notes storage cache TTL: 10 seconds (renderer)
- Maximum notes per day: 10
- Maximum note text length: 500 characters
- Note colors: yellow, pink, blue, green, orange, purple
- Maximum visible branch pills per day cell: 3 (overflow shows "+N" pill)

## 3. Plugin Lifecycle

### Activation

The plugin activates on startup. The `activate(context)` function in `plugins/calendar/index.js` performs these steps:

```
1. STORE CONTEXT    Save the plugin context object (provides storage, IPC registration, logging)

2. REGISTER IPC     Register 9 IPC handlers via context.registerIpcHandler():
                    - getMonthData, getDayActivity, getSprintsForDate, getSprintHistory
                    - createNote, updateNote, deleteNote, moveNote, getNotesForRange

3. REGISTER ACTIONS Register 3 actions via context.registerAction():
                    - getMonthData, getDayActivity, getSprintsForDate

4. MARK ACTIVE      Set plugin.active = true
```

Database access is **lazy-loaded** — the `database` module (`src/main/database`) is only `require()`'d on the first IPC call that needs sprint data, not at activation time. This avoids slowing down startup.

### Deactivation

The `deactivate()` function clears the stored context reference and sets `plugin.active = false`. No explicit IPC handler unregistration or resource cleanup occurs — the plugin system handles handler teardown.

### Renderer Initialization

When the user navigates to the Calendar view, the plugin system instantiates `CalendarViewComponent` (exported from `renderer/components/index.js`). This wrapper class:

1. Creates a `CalendarView` instance in the provided container
2. Dispatches a `calendar:sprint-click` CustomEvent when a sprint is clicked (for external listeners)

`CalendarView` initialization:
1. Creates all sub-components (ViewToggle, NavigationControls, WeekView, MonthView, SprintPanel)
2. Renders the layout (flex container with optional sprint panel)
3. Sets the initial view to month
4. Loads activity data for the current month via IPC

## 4. Architecture and Integration

### IPC Communication

The renderer communicates with the main process via the Puffin plugin invocation system:

```
Renderer                           Main Process
────────                           ────────────
window.puffin.plugins.invoke(      context.registerIpcHandler(
  'calendar',                        'handlerName',
  'handlerName',                     async (params) => { ... }
  params                           )
)
```

### IPC Handlers (9 total)

| Handler | Purpose |
|---------|---------|
| `getMonthData` | Build array of day objects for a year/month, each with sprint and note activity |
| `getDayActivity` | Get detailed activity (sprints, notes) for a specific date |
| `getSprintsForDate` | Get sprints whose creation or close date matches a given date |
| `getSprintHistory` | Get all archived sprints from the database |
| `createNote` | Create a new note on a specific date |
| `updateNote` | Update an existing note's text or color |
| `deleteNote` | Remove a note by ID from a specific date |
| `moveNote` | Atomically move a note from one date to another |
| `getNotesForRange` | Get all notes within a start/end date range |

### Registered Actions (3 total)

Actions provide an alternative invocation path via the plugin action system:

| Action | Maps To |
|--------|---------|
| `getMonthData` | Same as IPC handler |
| `getDayActivity` | Same as IPC handler |
| `getSprintsForDate` | Same as IPC handler |

### Data Sources

The Calendar Plugin reads from three data sources but owns none of them — it is purely a consumer:

**1. Sprint Database (main process)**

The plugin lazy-loads `src/main/database` and accesses the sprint repository:
- `sprintRepo.findArchived()` — all completed sprints
- `sprintRepo.findActive()` — the currently active sprint (if any)

Results are cached for 5 seconds to avoid repeated DB queries during rapid navigation.

**2. Git Operations File (renderer)**

The `git-data.js` service reads `.puffin/git-operations.json` (via `window.puffin.data.getGitOperations()`) containing timestamped records of git branch operations. Branches are grouped by date and color-coded by type.

**3. Plugin Storage (notes)**

Notes are persisted via `context.storage.get('notes')` / `context.storage.set('notes', data)`, which the plugin system maps to a file in the plugin's data directory. The storage format is a flat object keyed by date string:

```json
{
  "2025-01-15": [
    { "id": "note-1705312000000-a1b2c3", "text": "Sprint planning", "color": "yellow", "createdAt": "...", "updatedAt": "..." }
  ],
  "2025-01-16": [
    { "id": "note-1705398400000-d4e5f6", "text": "Bug triage", "color": "pink", "createdAt": "...", "updatedAt": "..." }
  ]
}
```

### Component Architecture (Renderer)

```
CalendarViewComponent (plugin entry wrapper)
└── CalendarView (main orchestrator, 2337 lines)
    ├── ViewToggle (week/month toggle)
    ├── NavigationControls (prev/next/today + title)
    ├── WeekView (7-day grid)
    │   └── DayCell × 7
    │       ├── BranchIndicator (branch pills)
    │       └── PostItNote (compact note indicators)
    ├── MonthView (6×7 grid, 42 cells)
    │   └── DayCell × 42
    │       ├── BranchIndicator
    │       └── PostItNote
    ├── SprintPanel (left sidebar, sprint list for selected day)
    │   └── SprintListItem × N
    ├── SprintModal (sprint detail overlay)
    ├── NoteEditor (note create/edit modal)
    └── Toast/ToastManager (notification system)
```

All 13 components are vanilla JavaScript classes with no framework dependency. They follow a consistent pattern:
- Constructor accepts config object with callbacks
- `render()` builds the DOM via `innerHTML` + event binding
- `destroy()` cleans up event listeners and DOM references
- Custom events dispatched for cross-component communication

### Renderer Services (3 total)

| Service | Factory | Cache TTL | Purpose |
|---------|---------|-----------|---------|
| `git-data.js` | `createGitDataService()` | 30s | Git branch data by date with color coding |
| `sprint-data.js` | `createSprintDataService()` | 30s | Sprint data filtering and date matching |
| `notes-storage.js` | `createNotesStorageService()` | 10s | Notes CRUD with validation |

Each service is created via a factory function, maintaining its own cache instance. The shorter notes cache (10s vs 30s) ensures note changes appear quickly after mutations.

## 5. Notes CRUD System

### Data Model

```javascript
{
  id: 'note-{timestamp}-{random9alphanum}', // Unique identifier
  text: 'Note content',                   // Max 500 characters
  color: 'yellow',                        // One of 6 preset colors
  createdAt: '2025-01-15T10:30:00.000Z', // ISO 8601
  updatedAt: '2025-01-15T10:30:00.000Z'  // ISO 8601, updated on edit
}
```

**Color palette**: `yellow`, `pink`, `blue`, `green`, `orange`, `purple`. Each color has defined background, border, and text color values in `PostItNote.js`.

### Create

1. User clicks "+" on a day cell or uses the add-note button
2. `NoteEditor` modal opens with empty text, default color (yellow), and the target date
3. User types text (max 500 chars, live counter), picks a color, clicks Save (or Cmd/Ctrl+Enter)
4. Renderer calls `window.puffin.plugins.invoke('calendar', 'createNote', { date, text, color })`
5. Main process `createNote` handler:
   - Validates text (non-empty, ≤500 chars) and color (must be in allowed set)
   - Loads existing notes for the date from storage
   - Checks limit (max 10 per day)
   - Generates ID: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
   - Appends note to date's array, saves via `context.storage.set('notes', allNotes)`
   - Returns `{ success: true, note }` with the created note object
6. CalendarView receives response, dispatches `calendar:note-created` event, shows success toast

### Read

Notes are read in two ways:
- **Bulk**: `getNotesForRange(startDate, endDate)` returns all notes within a date range, used when loading month/week data
- **Per-day**: `getMonthData(year, month)` includes note counts per day; `getDayActivity(date)` includes full note objects for one date
- **Renderer cache**: `notes-storage.js` caches fetched notes for 10 seconds to reduce IPC calls during view updates

### Update

1. User clicks a note or its edit button
2. `NoteEditor` modal opens pre-populated with the note's current text and color
3. User modifies text/color, clicks Save
4. Renderer calls `invoke('calendar', 'updateNote', { date, noteId, text, color })`
5. Main process `updateNote` handler:
   - Finds the note by ID in the date's array
   - Updates `text`, `color`, and `updatedAt` timestamp
   - Saves all notes back to storage
   - Returns `{ success: true, note }` with the updated note
6. CalendarView dispatches `calendar:note-updated` event, shows toast

### Delete

1. User clicks delete button in the NoteEditor
2. A confirmation prompt appears within the editor ("Are you sure?")
3. On confirm, renderer calls `invoke('calendar', 'deleteNote', { date, noteId })`
4. Main process `deleteNote` handler:
   - Finds and splices the note from the date's array
   - If the date's array is now empty, removes the date key entirely
   - Saves all notes, returns `{ success: true }`
5. CalendarView dispatches `calendar:note-deleted` event, shows toast

### Move (Drag-and-Drop)

1. User drags a note from one day cell to another
2. Drag data format: `application/x-puffin-note` containing JSON `{ noteId, sourceDate, noteData }`
3. CalendarView validates: not same day, target day has < 10 notes
4. Renderer calls `invoke('calendar', 'moveNote', { noteId, sourceDate, targetDate })`
5. Main process `moveNote` handler:
   - Finds the note in sourceDate's array
   - Splices it from sourceDate, pushes it to targetDate
   - If sourceDate is now empty, cleans up the key
   - Single `saveAllNotes()` call (atomic operation)
   - Returns `{ success: true, note }` with updated note
6. CalendarView dispatches `calendar:note-moved` event, refreshes affected day cells

### Copy-Paste

1. User focuses a note and presses Ctrl/Cmd+C — CalendarView stores the note in a clipboard variable
2. User selects a target date and presses Ctrl/Cmd+V
3. A new note is created on the target date with the same text and color (new ID and timestamps)
4. CalendarView dispatches `calendar:note-pasted` event

## 6. Sprint and Branch Integration

### Sprint Data Flow

```
Main Process                              Renderer
────────────                              ────────
database.sprintRepo.findArchived()  →     sprint-data.js service (30s cache)
database.sprintRepo.findActive()    →     ↓
        ↓                                 getSprintsForDate(dateStr) matches:
   Sprint cache (5s TTL)                  - sprint.closedAt for archived sprints
        ↓                                 - sprint.createdAt for active sprint
   IPC: getMonthData / getSprintsForDate  ↓
        ↓                                 SprintPanel shows sprint list
   Returns sprint counts per day          SprintModal shows sprint detail
```

Sprint date matching uses `getSprintDateStr()` which checks, in order: `sprint.date`, `sprint.startDate`, `sprint.createdAt`, `sprint.created`. Archived sprints match by `closedAt` date. The active sprint matches by its creation date.

### Git Branch Data Flow

```
.puffin/git-operations.json  →  git-data.js service (30s cache)
                                 ↓
                                 getBranchesForDate(dateStr)
                                 - Groups operations by branch name
                                 - Counts operations per branch
                                 - Assigns colors via getBranchColor()
                                 ↓
                                 BranchIndicator renders colored pills
                                 - Max 3 visible, "+N" overflow
                                 - Overflow popover on click
```

**Branch color scheme**:

| Branch Pattern | Color |
|---------------|-------|
| `main`, `master` | Blue (`#4a9eff`) |
| `feature/*` | Green-ish (HSL hue ~120) |
| `bugfix/*`, `fix/*` | Red-ish (HSL hue ~0) |
| `hotfix/*` | Orange (HSL hue ~30) |
| `release/*` | Purple-ish (HSL hue ~270) |
| Other | Hash-based HSL color |

Branch names are abbreviated for display: `feature/user-auth` becomes `f/user-auth…`.

### Sprint Panel and Modal

When a user clicks a day cell:
1. `SprintPanel` (left sidebar) fetches sprints for that date via IPC
2. Sprints are displayed as `SprintListItem` components showing: name, status badge, story count, optional description (truncated to 80 chars)
3. Clicking a sprint item opens `SprintModal` showing full sprint details:
   - Sprint name, status, date
   - Story list sorted with incomplete stories first
   - Each story shows completion icon and status badge
   - Focus trap for accessibility (Tab wraps within modal)
   - Closes via Escape, backdrop click, or close button

## 7. Custom Events

The Calendar Plugin uses CustomEvents extensively for cross-component and external communication:

| Event | Source | Detail |
|-------|--------|--------|
| `calendar:view-changed` | ViewToggle | `{ view }` |
| `calendar:day-selected` | WeekView, MonthView | `{ date, activity }` |
| `calendar:sprint-selected` | SprintPanel | `{ sprint }` |
| `calendar:sprint-click` | CalendarViewComponent | `{ sprint }` |
| `calendar:branch-selected` | CalendarView | `{ branch }` |
| `calendar:note-created` | CalendarView | `{ note, date }` |
| `calendar:note-updated` | CalendarView | `{ note, date }` |
| `calendar:note-deleted` | CalendarView | `{ noteId, date }` |
| `calendar:note-moved` | CalendarView | `{ note, sourceDate, targetDate }` |
| `calendar:note-copied` | CalendarView | `{ note }` |
| `calendar:note-pasted` | CalendarView | `{ note, date }` |
| `calendar:note-drag-start` | CalendarView | `{ note }` |
| `calendar:notes-overflow-clicked` | CalendarView | `{ date }` |
| `daycell:click` | DayCell | `{ date, activity }` |
| `daycell:note-click` | DayCell | `{ note, date }` |
| `daycell:add-note` | DayCell | `{ date }` |
| `daycell:note-drag-start` | DayCell | `{ note, date }` |
| `daycell:note-drag-end` | DayCell | — |
| `daycell:note-drop` | DayCell | `{ noteId, sourceDate, targetDate }` |
| `daycell:overflow-click` | DayCell | `{ date, type }` |
| `branch:click` | DayCell | `{ branch }` |
| `postit:click` | PostItNote | `{ note }` |
| `postit:edit` | PostItNote | `{ note }` |
| `postit:delete` | PostItNote | `{ note }` |
| `sprintitem:click` | SprintListItem | `{ sprint, index }` |

## 8. Security

The plugin uses dedicated XSS prevention utilities from `plugins/calendar/utils/escape.js`:

- `escapeHtml(text)` — escapes `&`, `<`, `>` for element content
- `escapeAttr(text)` — escapes `&`, `"`, `'`, `<`, `>` for HTML attributes

These are imported by `BranchIndicator.js` and other components that render user-provided data (branch names, note text) into HTML. Components that use `textContent` assignment are inherently safe. The NoteEditor validates note length (≤500 chars) and color (must be in the allowed set) on both the renderer and main process sides.

## 9. Potential Improvements

1. **No user-configurable settings**: Cache TTLs, max notes per day, note length limit, and branch color mappings are all hard-coded. A settings panel would allow customization.
2. **No tests**: The plugin has no unit or integration tests.
3. **No date range pagination**: `getSprintHistory` fetches all archived sprints at once. For large histories, pagination would reduce memory and load time.
4. **Sprint date matching is fragile**: `getSprintDateStr()` falls through 4 different date fields. A canonical date field would simplify matching.
5. **Notes not synced across instances**: Notes use plugin-local storage. Multiple Puffin instances would have separate note stores.
6. **No search**: Notes cannot be searched by text content — only browsed by date.
7. **No recurring notes or templates**: Each note is manually created; no way to set up recurring reminders.

## Appendix: File Map

| File | Lines | Purpose |
|------|-------|---------|
| `plugins/calendar/puffin-plugin.json` | 42 | Plugin manifest — view registration, activation config |
| `plugins/calendar/index.js` | 484 | Main entry — 9 IPC handlers, 3 actions, sprint cache, notes CRUD |
| `plugins/calendar/calendar.css` | 2939 | All styles — CSS Grid layout, dark theme, animations |
| `plugins/calendar/utils/escape.js` | 42 | XSS prevention — escapeHtml, escapeAttr |
| `plugins/calendar/services/date-utils.js` | 324 | 23 date utility functions |
| `plugins/calendar/services/git-data.js` | 351 | Git branch data service with 30s cache |
| `plugins/calendar/services/sprint-data.js` | 282 | Sprint data service with 30s cache |
| `plugins/calendar/services/notes-storage.js` | 479 | Notes CRUD service with validation and 10s cache |
| `plugins/calendar/renderer/components/index.js` | 123 | Renderer entry — exports 13 components |
| `plugins/calendar/renderer/components/CalendarView.js` | 2336 | Main view — layout, data loading, note operations, drag-and-drop |
| `plugins/calendar/renderer/components/DayCell.js` | 702 | Day cell — activity indicators, branch pills, note indicators |
| `plugins/calendar/renderer/components/ViewToggle.js` | 120 | Week/month toggle control |
| `plugins/calendar/renderer/components/NavigationControls.js` | 109 | Prev/next/today navigation + title |
| `plugins/calendar/renderer/components/WeekView.js` | 246 | 7-day week grid |
| `plugins/calendar/renderer/components/MonthView.js` | 289 | 6×7 month grid with overflow handling |
| `plugins/calendar/renderer/components/SprintPanel.js` | 348 | Left sidebar — sprint list for selected date |
| `plugins/calendar/renderer/components/SprintListItem.js` | 194 | Sprint item — name, status, story count |
| `plugins/calendar/renderer/components/SprintModal.js` | 372 | Sprint detail modal with story list |
| `plugins/calendar/renderer/components/BranchIndicator.js` | 456 | Branch pills with color coding and overflow popover |
| `plugins/calendar/renderer/components/PostItNote.js` | 336 | Post-it note — compact and full modes |
| `plugins/calendar/renderer/components/NoteEditor.js` | 553 | Note create/edit modal with color picker |
