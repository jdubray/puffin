# Outcome Lifecycle Plugin Specification

## Overview

The Outcome Lifecycle Plugin is responsible for tracking, visualizing, and managing the outcome lifecycle of solutions built with Puffin. Based on the BOLT methodology by Jean-Jacques Dubray, it models solutions as finite state machines where only desired states (outcomes) are represented.

### Core Concepts

**Outcome**: A desired state that represents measurable value progression in the solution.

**Lifecycle**: A directed graph of outcomes and their transitions, including re-entrant paths. It shows:
- What outcomes are available
- What preconditions must be met to reach each outcome
- The dependencies between outcomes
- Current progress toward target outcomes

**Solution**: A transition mechanism from a low-value initial state to a high-value desired state.

## Plugin Architecture

### Type: Main Process + Renderer Process

The plugin operates in two contexts:
- **Main Process**: Data persistence, lifecycle computation, database queries
- **Renderer Process**: UI visualization, outcome tracking display, lifecycle editing

### Plugin Location

```
plugins/outcome-lifecycle-plugin/
├── main.js                           # Main process logic
├── renderer.js                       # Renderer process UI
├── lib/
│   ├── lifecycle-engine.js           # Core lifecycle computation
│   ├── outcome-analyzer.js           # User story → outcome extraction
│   ├── lifecycle-database.js         # Persistence layer
│   └── lifecycle-validator.js        # Validation and consistency checks
├── config.json                       # Plugin configuration
├── package.json                      # Plugin metadata
└── README.md                         # Documentation
```

## Data Model

### Outcome Structure

```javascript
{
  id: "outcome-uuid",
  title: string,                      // e.g., "User can create projects"
  description: string,                // Detailed outcome description
  value: number,                      // Business value (1-10 scale)
  status: "pending" | "in-progress" | "achieved",
  prerequisites: string[],            // Array of outcome IDs that must be achieved first
  userStories: string[],              // Associated user story IDs
  metrics: {
    storiesCompleted: number,
    storiesTotal: number,
    progress: number                  // 0-100
  },
  createdAt: timestamp,
  updatedAt: timestamp,
  metadata: {                         // BOLT-specific metadata
    initialState: string,             // Description of starting state
    desiredState: string,             // Description of target state
    category: string                  // e.g., "feature", "capability", "experience"
  }
}
```

### Lifecycle Structure

```javascript
{
  id: "lifecycle-uuid",
  projectId: string,
  outcomes: Outcome[],
  transitions: [
    {
      from: "outcome-id",
      to: "outcome-id",
      type: "required" | "optional" | "parallel",
      description: string
    }
  ],
  currentOutcome: string,             // Current achieved outcome ID
  targetOutcomes: string[],           // Desired end states
  version: number,                    // Incremented with each update
  lastUpdatedBy: "user-story-trigger" | "manual",
  generatedAt: timestamp,
  metadata: {
    totalValue: number,
    achievedValue: number,
    overallProgress: number           // 0-100
  }
}
```

## Lifecycle Initialization

### Trigger: First Plugin Load

When no outcome lifecycle exists for a project:

1. **Query Database**: Retrieve all user stories for the project
2. **Extract Outcomes**: Run outcome analyzer on user stories
   - Parse "As a [user]...I want to [action]...so that [outcome]" format
   - Identify outcome candidates from story titles and descriptions
   - Extract value/priority indicators
3. **Build Graph**: Create initial outcome graph
   - Identify outcome dependencies from story relationships
   - Arrange outcomes by dependency order
   - Mark achievable outcomes in current sprint
4. **Persist**: Save lifecycle to database
5. **Validate**: Run consistency checks

### Outcome Extraction Algorithm

```
For each user story:
  1. Parse story title and description for outcome keywords
  2. Extract "so that" clause → primary outcome
  3. Identify prerequisite stories → prerequisite outcomes
  4. Assign business value from story points/priority
  5. Deduplicate outcomes across stories
  6. Build outcome object with metadata

Return: Set of unique outcomes with relationships
```

## Lifecycle Updates

### Trigger: User Story Completion

When user stories are marked as completed in a sprint:

1. **Listen to Event**: Main process listens for story completion event
2. **Update Outcomes**: Mark associated outcomes as "in-progress" or "achieved"
3. **Recalculate Progress**: Update outcome progress metrics
4. **Check Transitions**: Evaluate if new outcomes become available
5. **Detect New Opportunities**: Scan for newly unlocked outcomes
6. **Persist Changes**: Update lifecycle in database
7. **Notify Renderer**: Send IPC event to update UI

### Re-entrant Transitions

Some outcomes may appear multiple times in the lifecycle:
- An outcome marked "achieved" may have variants or improved versions
- Iterative refinement: "User can create projects" → "User can create projects with templates"
- Handle via outcome versioning or variant outcomes

## IPC Channels

### Main Process Handlers

```javascript
ipcMain.handle('outcome-lifecycle:get-lifecycle', (event, projectId) => {
  // Returns current lifecycle for project
});

ipcMain.handle('outcome-lifecycle:update-outcomes', (event, { projectId, userStoryIds }) => {
  // Updates lifecycle based on completed stories
});

ipcMain.handle('outcome-lifecycle:initialize', (event, projectId) => {
  // Triggers initialization from existing stories
});

ipcMain.handle('outcome-lifecycle:get-outcome-details', (event, outcomeId) => {
  // Returns detailed information about an outcome
});

ipcMain.handle('outcome-lifecycle:list-available-outcomes', (event, projectId) => {
  // Returns outcomes available given current state
});
```

### Main Process Events

```javascript
ipcMain.on('outcome-lifecycle:lifecycle-updated', (event, lifecycle) => {
  // Emitted when lifecycle changes (send to renderer)
});
```

## Renderer Process

### UI Components

1. **Outcome Lifecycle Visualization**
   - Graph view of outcomes and transitions
   - Current position highlighting
   - Progress indicators
   - Interactive outcome details on click

2. **Outcome Details Panel**
   - Outcome title and description
   - Associated user stories
   - Progress bar (stories completed / total)
   - Prerequisites and dependent outcomes
   - Business value indicator

3. **Lifecycle Summary**
   - Overall progress to target outcomes
   - Number of available outcomes
   - Number of achieved outcomes
   - Suggested next steps

### IPC Invocations

```javascript
// On mount
const lifecycle = await window.api.invoke('outcome-lifecycle:get-lifecycle', projectId);

// Listen for updates
window.api.on('outcome-lifecycle:lifecycle-updated', (lifecycle) => {
  updateVisualization(lifecycle);
});

// Get outcome details
const details = await window.api.invoke('outcome-lifecycle:get-outcome-details', outcomeId);
```

## Database Schema

### Lifecycle Table

```sql
CREATE TABLE lifecycles (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  lifecycle_data JSON NOT NULL,
  version INTEGER NOT NULL,
  last_updated DATETIME,
  created_at DATETIME,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX idx_lifecycle_project ON lifecycles(project_id);
```

### Outcome Mapping Table

```sql
CREATE TABLE outcome_story_mappings (
  outcome_id TEXT NOT NULL,
  user_story_id TEXT NOT NULL,
  lifecycle_id TEXT NOT NULL,
  PRIMARY KEY (outcome_id, user_story_id),
  FOREIGN KEY (lifecycle_id) REFERENCES lifecycles(id)
);
```

## Error Handling

### Scenarios

1. **No user stories available**: Create empty lifecycle with initial state description
2. **Ambiguous outcomes**: Prompt user for clarification
3. **Circular dependencies**: Detect and alert user; suggest outcome reorganization
4. **Inconsistent story mappings**: Log warnings; validate consistency
5. **Database failures**: Graceful degradation; cache in memory

## Validation Rules

1. Every outcome must have a title and description
2. Prerequisites must exist as outcomes
3. No circular dependencies in outcome graph
4. Value scores must be positive integers
5. Progress cannot exceed 100%
6. Each outcome appears at least once in the graph

## Configuration

```json
{
  "enabled": true,
  "options": {
    "autoInitialize": true,
    "updateOnStoryCompletion": true,
    "maxOutcomesPerProject": 50,
    "valueScaleMin": 1,
    "valueScaleMax": 10,
    "extractionConfidenceThreshold": 0.7
  }
}
```

## Testing Strategy

### Unit Tests

- Outcome extraction from various user story formats
- Lifecycle graph construction and validation
- Dependency resolution and cycle detection
- Progress calculation accuracy

### Integration Tests

- Lifecycle initialization with sample projects
- Story completion triggering lifecycle updates
- IPC communication between main and renderer
- Database persistence and retrieval

## Future Enhancements

1. **Manual Outcome Editing**: Allow users to create/modify outcomes directly
2. **Outcome Templates**: Pre-built outcome patterns for common domains
3. **Timeline View**: Show outcomes as a timeline with estimated delivery dates
4. **Analytics**: Track outcome achievement rates, velocity predictions
5. **Export**: Export lifecycle as documentation or diagrams
6. **Multi-Path Lifecycle**: Support multiple valid paths to reach goals
7. **Outcome Impact Analysis**: Show how story completion affects multiple outcomes