# Puffin SAM Model Documentation

## Overview

The SAM Model in Puffin represents the application's state and provides acceptors that validate and apply proposals from actions. The model follows immutability principles where acceptors modify the model directly, but only in response to valid action proposals.

**File**: `src/renderer/sam/model.js`
**Total Lines**: 1,032
**Total Acceptors**: 44 acceptors across 8 categories
**Pattern**: Curried functions: `model => proposal => { ... }`

## Model Structure

### Initial State Schema

The model maintains a comprehensive state structure organized into logical sections:

```javascript
{
  // Application lifecycle
  initialized: boolean,
  appError: null | { message: string, timestamp: number },
  projectPath: string | null,
  projectName: string | null,

  // Project configuration
  config: {
    name: string,
    description: string,
    assumptions: Array<string>,
    technicalArchitecture: string,
    dataModel: string,
    options: { ... }, // Claude guidance settings
    uxStyle: { ... }  // Design system settings
  },

  // Conversation state
  currentPrompt: { content: string, branchId: string | null },
  pendingPromptId: string | null,
  streamingResponse: string,

  // History management
  history: {
    branches: { [id]: { id, name, prompts: Array } },
    activeBranch: string,
    activePromptId: string | null
  },

  // Visual design
  guiElements: Array<GuiElement>,
  selectedGuiElement: string | null,

  // Documentation
  architecture: { content: string, updatedAt: number | null },
  userStories: Array<UserStory>,
  uiGuidelines: { ... },

  // Interface state
  currentView: string, // 'config' | 'prompt' | 'designer' | 'user-stories' | 'architecture' | 'cli-output'
  sidebarVisible: boolean,
  modal: ModalState | null,

  // Advanced workflows
  storyDerivation: {
    status: string, // 'idle' | 'deriving' | 'reviewing' | 'requesting-changes' | 'implementing'
    pendingStories: Array<DerivedStory>,
    originalPrompt: string | null,
    branchId: string | null,
    error: string | null
  },

  // Real-time activity tracking (NEW FEATURE)
  activity: {
    currentTool: null | { name: string, input?: object },
    activeTools: Array<{ id: string, name: string, startTime: number }>,
    filesModified: Array<{ path: string, action: string, timestamp: number }>,
    status: string // 'idle' | 'thinking' | 'tool-use' | 'complete'
  }
}
```

## Acceptor Categories

### 1. Application Acceptors (4 acceptors)

Handle application initialization and error states.

#### `initializeAcceptor`
- **Action**: `INITIALIZE_APP`
- **Purpose**: Set up application state with project information
- **Mutations**: `initialized = true`, `appError = null`, sets `projectPath/projectName`
- **Location**: `model.js:149-160`

#### `loadStateAcceptor`
- **Action**: `LOAD_STATE`
- **Purpose**: Restore state from .puffin/ directory persistence
- **Mutations**: Merges config, history, architecture, userStories, uiGuidelines
- **Side Effect**: Switches to 'prompt' view
- **Location**: `model.js:162-177`

#### `appErrorAcceptor`
- **Action**: `APP_ERROR`
- **Purpose**: Capture and display application errors
- **Mutations**: Sets `appError` with message and timestamp
- **Location**: `model.js:179-186`

#### `recoverAcceptor`
- **Action**: `RECOVER`
- **Purpose**: Clear error state
- **Mutations**: `appError = null`
- **Location**: `model.js:188-192`

### 2. Config Acceptors (2 acceptors)

Manage project configuration and options.

#### `updateConfigAcceptor`
- **Action**: `UPDATE_CONFIG`
- **Purpose**: Update project metadata
- **Mutations**: Merges updates into `config` object
- **Persistence**: Triggers save to `config.json`
- **Location**: `model.js:198-207`

#### `updateOptionsAcceptor`
- **Action**: `UPDATE_OPTIONS`
- **Purpose**: Update Claude guidance settings
- **Mutations**: Merges options into `config.options`
- **Persistence**: Triggers save to `config.json`
- **Location**: `model.js:208-220`

### 3. Prompt/History Acceptors (15 acceptors)

Core conversation management with branching support.

#### Key Acceptors:

**`submitPromptAcceptor`** (Lines 236-284)
- Validates prompt content and branch
- Generates unique prompt ID and adds to branch
- Sets `pendingPromptId` for response tracking
- Clears streaming state

**`completeResponseAcceptor`** (Lines 291-338)
- Finds pending prompt by ID
- Attaches response data (content, sessionId, cost, duration)
- Clears pending state
- Includes extensive debug logging for response content

**`selectBranchAcceptor`** (Lines 400-422)
- Validates branch exists
- Updates `activeBranch` and `activePromptId`
- Clears current prompt composition

**`rerunPromptAcceptor`** (Lines 357-393)
- Finds prompt by ID across all branches
- Sets special `rerunRequest` property for app.js to handle
- Includes branch context and original prompt data

### 4. GUI Designer Acceptors (7 acceptors)

Visual design canvas management.

#### `addGuiElementAcceptor`
- **Action**: `ADD_GUI_ELEMENT`
- **Purpose**: Add new design element to canvas
- **Mutations**: Pushes element with generated ID to `guiElements`
- **Features**: Supports hierarchical elements with `parentId`
- **Location**: `model.js:468-480`

#### `selectGuiElementAcceptor`
- **Action**: `SELECT_GUI_ELEMENT`
- **Purpose**: Mark element as selected for property editing
- **Mutations**: Sets `selectedGuiElement` to element ID
- **Location**: `model.js:519-524`

### 5. Architecture Acceptors (2 acceptors)

Documentation management.

#### `updateArchitectureAcceptor`
- **Action**: `UPDATE_ARCHITECTURE`
- **Purpose**: Edit architecture markdown
- **Mutations**: Updates `architecture.content` and `updatedAt`
- **Persistence**: Triggers save to `architecture.md`
- **Location**: `model.js:568-574`

### 6. User Story Acceptors (14 acceptors)

Story management with advanced derivation workflow.

#### **Story Derivation State Machine**:

**`deriveUserStoriesAcceptor`** (Lines 627-640)
- Transition: `idle` → `deriving`
- Stores branch context and original prompt
- Triggers IPC call to Claude for story extraction

**`receiveDerivedStoriesAcceptor`** (Lines 641-653)
- Transition: `deriving` → `reviewing`
- Populates `pendingStories` for user review
- Shows review modal

**`implementStoriesAcceptor`** (Lines 702-773)
- Transition: `reviewing` → `implementing` → `idle`
- Moves ready stories to main `userStories` array
- Creates implementation prompt entry
- Clears derivation state

### 7. Activity Tracking Acceptors (9 acceptors) **[NEW FEATURE]**

Real-time tracking of Claude CLI tool execution for prompt status display.

#### Key Activity Acceptors:

**`setActivityStatusAcceptor`** (Lines 845-849)
- **Purpose**: Set overall activity status
- **Values**: 'idle', 'thinking', 'tool-use', 'complete'
- **Usage**: Controls prompt tab status display

**`toolStartAcceptor`** (Lines 857-868)
- **Purpose**: Track concurrent tool execution
- **Mutations**:
  - Sets `currentTool` for display
  - Adds to `activeTools` array with start time
  - Sets status to 'tool-use'

**`toolEndAcceptor`** (Lines 870-905)
- **Purpose**: Complete tool execution and track file changes
- **Mutations**:
  - Removes tool from `activeTools`
  - Tracks file modifications in `filesModified`
  - Updates `currentTool` to most recent active tool
  - Sets status based on remaining active tools

**`addModifiedFileAcceptor`** (Lines 820-837)
- **Purpose**: Track file operations during prompt execution
- **Features**: Deduplicates by file path, updates with latest action
- **Actions**: 'read', 'write', 'edit'

#### Activity State Flow:
```
idle → thinking → tool-use (with concurrent tools) → thinking → complete → idle
```

### 8. UI Navigation Acceptors (4 acceptors)

Interface state management.

#### `switchViewAcceptor`
- **Action**: `SWITCH_VIEW`
- **Purpose**: Change main application view
- **Valid Views**: 'config', 'prompt', 'designer', 'user-stories', 'architecture', 'cli-output'
- **Location**: `model.js:921-929`

## State Persistence Strategy

The model integrates with automatic persistence via IPC:

### Persistence Mapping:
- **Config changes** → `.puffin/config.json`
- **History changes** → `.puffin/history.json`
- **Architecture changes** → `.puffin/architecture.md`
- **User story changes** → `.puffin/user-stories.json`
- **GUI changes** → `.puffin/gui-designer.json`

### Persistence Triggers:
Acceptors that modify persistent state automatically trigger IPC calls to save data. The main app listens for state changes and writes files to the .puffin directory.

## Validation Layer

The model includes validation for critical operations:

```javascript
import { validatePrompt, validateBranch } from '../../shared/validators.js'
```

### Validation Points:
- **Prompt submission**: Content length, branch existence
- **Branch operations**: Branch ID format, name requirements
- **User story fields**: Required properties, status values

## Design Patterns

### Curried Acceptors
All acceptors follow the pattern: `model => proposal => { mutations }`

```javascript
export const exampleAcceptor = model => proposal => {
  if (proposal?.type === 'ACTION_TYPE') {
    // Validate proposal
    if (!proposal.payload?.requiredField) return

    // Apply mutations
    model.someProperty = proposal.payload.value
  }
}
```

### Type Safety
Actions include type checking via proposal.type comparison:

```javascript
if (proposal?.type === 'EXPECTED_ACTION') {
  // Handle action
}
```

### Error Handling
Acceptors include defensive programming:
- Null/undefined checks on proposal and payload
- Validation before mutations
- Graceful handling of malformed data

## Activity Tracking Implementation **[LATEST FEATURE]**

The activity tracking system provides real-time feedback during Claude CLI execution:

### Status States:
- **`idle`**: No prompt processing
- **`thinking`**: Claude is processing (no tools active)
- **`tool-use`**: Claude is executing tools
- **`complete`**: Prompt finished successfully

### Tool Tracking:
- **Concurrent Support**: Multiple tools can run simultaneously
- **File Modification Tracking**: Records read/write/edit operations
- **Timing Data**: Start times for performance analysis

### UI Integration:
The activity state drives prompt tab status display, showing users:
- Current tool being executed
- Files being modified
- Overall processing stage

This feature enhances user experience by providing transparent feedback about Claude's progress during long-running prompts.

## Model Validation

The model ensures data integrity through:

1. **Type Validation**: Acceptors check proposal types
2. **State Validation**: Validates state transitions (FSM integration)
3. **Data Validation**: Uses shared validators for critical data
4. **Defensive Programming**: Null checks and graceful error handling

## Summary

Puffin's SAM Model implements a comprehensive state management system with:

- **44 acceptors** across 8 functional categories
- **Real-time activity tracking** for enhanced user feedback
- **Automatic persistence** to structured .puffin/ directory
- **Advanced workflows** like user story derivation
- **Robust validation** and error handling
- **Immutable state updates** following SAM principles

The model successfully balances complexity with maintainability, providing a solid foundation for Puffin's role as a management layer over Claude Code CLI.