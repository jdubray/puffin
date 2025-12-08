# Puffin Actions Documentation

## Overview

This document provides a comprehensive review of all actions implemented in Puffin's SAM (State-Action-Model) architecture. Puffin uses pure functions to compute proposals based on user intent, which are then processed by acceptors to update the application state.

**File**: `src/renderer/sam/actions.js`
**Total Actions**: 46 exported action creators
**Total Lines**: 604

## Action Categories

### 1. Application Initialization Actions (4 actions)

These actions handle application startup and error states.

#### `initializeApp(projectPath, projectName)`
- **Type**: `INITIALIZE_APP`
- **Purpose**: Initialize the application with project information
- **Payload**: `{ projectPath, projectName, timestamp }`
- **Location**: `actions.js:15-22`

#### `loadState(state)`
- **Type**: `LOAD_STATE`
- **Purpose**: Load persisted state from .puffin/ directory
- **Payload**: `{ state }`
- **Location**: `actions.js:25-30`

#### `appError(error)`
- **Type**: `APP_ERROR`
- **Purpose**: Capture application errors for display
- **Payload**: `{ error, timestamp }`
- **Location**: `actions.js:33-39`

#### `recover()`
- **Type**: `RECOVER`
- **Purpose**: Clear error state and return to normal operation
- **Payload**: `{}`
- **Location**: `actions.js:42-45`

### 2. Configuration Actions (2 actions)

Manage project configuration and Claude guidance options.

#### `updateConfig(updates)`
- **Type**: `UPDATE_CONFIG`
- **Purpose**: Update project configuration fields (name, description, assumptions, architecture)
- **Payload**: `{ ...updates, updatedAt }`
- **Persistence**: Automatically saved to `config.json`
- **Location**: `actions.js:53-59`

#### `updateOptions(options)`
- **Type**: `UPDATE_OPTIONS`
- **Purpose**: Update Claude guidance options (programming style, testing approach, etc.)
- **Payload**: `{ options, updatedAt }`
- **Persistence**: Automatically saved to `config.json`
- **Location**: `actions.js:62-68`

### 3. Prompt/History Actions (14 actions)

Core conversation flow with Claude CLI.

#### `startCompose(branchId)`
- **Type**: `START_COMPOSE`
- **Purpose**: Begin composing a prompt in the specified branch
- **Payload**: `{ branchId }`
- **Location**: `actions.js:75-80`

#### `updatePromptContent(content)`
- **Type**: `UPDATE_PROMPT_CONTENT`
- **Purpose**: Update prompt text as the user types
- **Payload**: `{ content }`
- **Location**: `actions.js:83-88`

#### `submitPrompt(data)`
- **Type**: `SUBMIT_PROMPT`
- **Purpose**: Submit prompt to Claude CLI for processing
- **Payload**: `{ id, branchId, parentId, content, timestamp }`
- **Features**: Generates unique ID for each prompt
- **Persistence**: Automatically saved to `history.json`
- **Location**: `actions.js:91-100`

#### `receiveResponseChunk(chunk)`
- **Type**: `RECEIVE_RESPONSE_CHUNK`
- **Purpose**: Handle streaming response data from Claude
- **Payload**: `{ chunk, timestamp }`
- **Location**: `actions.js:103-109`

#### `completeResponse(response)`
- **Type**: `COMPLETE_RESPONSE`
- **Purpose**: Finalize complete response from Claude
- **Payload**: `{ content, sessionId, cost, turns, duration, timestamp }`
- **Features**: Extensive debugging logs
- **Persistence**: Automatically saved to `history.json`
- **Location**: `actions.js:112-134`

#### `responseError(error)`
- **Type**: `RESPONSE_ERROR`
- **Purpose**: Handle response failures from Claude CLI
- **Payload**: `{ error, timestamp }`
- **Location**: `actions.js:137-143`

#### `cancelPrompt()`
- **Type**: `CANCEL_PROMPT`
- **Purpose**: Cancel in-flight prompt request
- **Payload**: `{}`
- **Location**: `actions.js:146-149`

#### `rerunPrompt(promptId)`
- **Type**: `RERUN_PROMPT`
- **Purpose**: Re-submit a previous prompt
- **Payload**: `{ promptId, timestamp }`
- **Location**: `actions.js:152-158`

#### `clearRerunRequest()`
- **Type**: `CLEAR_RERUN_REQUEST`
- **Purpose**: Clear rerun state after handling
- **Payload**: `{}`
- **Location**: `actions.js:161-164`

#### `selectBranch(branchId)`
- **Type**: `SELECT_BRANCH`
- **Purpose**: Switch active conversation branch
- **Payload**: `{ branchId }`
- **Location**: `actions.js:167-172`

#### `createBranch(data)`
- **Type**: `CREATE_BRANCH`
- **Purpose**: Create new conversation branch
- **Payload**: `{ id, name, icon }`
- **Features**: Auto-generates ID if not provided, defaults icon to 'folder'
- **Location**: `actions.js:175-182`

#### `deleteBranch(branchId)`
- **Type**: `DELETE_BRANCH`
- **Purpose**: Remove custom branches (protects default branches)
- **Payload**: `{ branchId }`
- **Location**: `actions.js:185-190`

#### `selectPrompt(promptId)`
- **Type**: `SELECT_PROMPT`
- **Purpose**: Select prompt to view its response
- **Payload**: `{ promptId }`
- **Location**: `actions.js:193-198`

### 4. GUI Designer Actions (8 actions)

Visual interface designer for communicating UI layouts.

#### `addGuiElement(element)`
- **Type**: `ADD_GUI_ELEMENT`
- **Purpose**: Add element to design canvas
- **Payload**: `{ id, type, properties, parentId }`
- **Features**: Generates unique ID, supports hierarchical elements
- **Location**: `actions.js:205-213`

#### `updateGuiElement(elementId, properties)`
- **Type**: `UPDATE_GUI_ELEMENT`
- **Purpose**: Modify element properties
- **Payload**: `{ id, properties }`
- **Location**: `actions.js:216-222`

#### `deleteGuiElement(elementId)`
- **Type**: `DELETE_GUI_ELEMENT`
- **Purpose**: Remove element from canvas
- **Payload**: `{ id }`
- **Location**: `actions.js:225-230`

#### `moveGuiElement(elementId, x, y)`
- **Type**: `MOVE_GUI_ELEMENT`
- **Purpose**: Reposition element
- **Payload**: `{ id, x, y }`
- **Location**: `actions.js:233-240`

#### `resizeGuiElement(elementId, width, height)`
- **Type**: `RESIZE_GUI_ELEMENT`
- **Purpose**: Change element dimensions
- **Payload**: `{ id, width, height }`
- **Location**: `actions.js:243-250`

#### `selectGuiElement(elementId)`
- **Type**: `SELECT_GUI_ELEMENT`
- **Purpose**: Mark element as selected
- **Payload**: `{ elementId }`
- **Location**: `actions.js:253-258`

#### `clearGuiCanvas()`
- **Type**: `CLEAR_GUI_CANVAS`
- **Purpose**: Remove all elements from canvas
- **Payload**: `{}`
- **Location**: `actions.js:261-264`

#### `exportGuiDescription()`
- **Type**: `EXPORT_GUI_DESCRIPTION`
- **Purpose**: Convert design to text description
- **Payload**: `{}`
- **Location**: `actions.js:267-270`

### 5. GUI Definition Actions (6 actions)

Manage saved GUI designs.

#### `saveGuiDefinition(name, description)`
- **Type**: `SAVE_GUI_DEFINITION`
- **Purpose**: Save current design as named definition
- **Payload**: `{ name, description, timestamp }`
- **Location**: `actions.js:277-284`

#### `loadGuiDefinition(filename, definition)`
- **Type**: `LOAD_GUI_DEFINITION`
- **Purpose**: Load saved design into designer
- **Payload**: `{ filename, definition, timestamp }`
- **Location**: `actions.js:287-294`

#### `listGuiDefinitions()`
- **Type**: `LIST_GUI_DEFINITIONS`
- **Purpose**: Fetch available saved definitions
- **Payload**: `{ timestamp }`
- **Location**: `actions.js:297-302`

#### `deleteGuiDefinition(filename)`
- **Type**: `DELETE_GUI_DEFINITION`
- **Purpose**: Remove saved definition
- **Payload**: `{ filename, timestamp }`
- **Location**: `actions.js:305-311`

#### `showGuiDefinitionDialog()`
- **Type**: `SHOW_GUI_DEFINITION_DIALOG`
- **Purpose**: Trigger definition selection modal
- **Payload**: `{ timestamp }`
- **Location**: `actions.js:314-319`

#### `showSaveGuiDefinitionDialog()`
- **Type**: `SHOW_SAVE_GUI_DEFINITION_DIALOG`
- **Purpose**: Trigger save modal
- **Payload**: `{ timestamp }`
- **Location**: `actions.js:322-327`

### 6. Architecture Document Actions (2 actions)

Manage project architecture documentation.

#### `updateArchitecture(content)`
- **Type**: `UPDATE_ARCHITECTURE`
- **Purpose**: Edit architecture markdown content
- **Payload**: `{ content, updatedAt }`
- **Persistence**: Automatically saved to `architecture.md`
- **Location**: `actions.js:334-340`

#### `reviewArchitecture()`
- **Type**: `REVIEW_ARCHITECTURE`
- **Purpose**: Request Claude review of architecture
- **Payload**: `{ timestamp }`
- **Location**: `actions.js:343-348`

### 7. User Story Actions (4 actions)

CRUD operations for user stories.

#### `addUserStory(story)`
- **Type**: `ADD_USER_STORY`
- **Purpose**: Manually add new user story
- **Payload**: `{ id, title, description, acceptanceCriteria, status, sourcePromptId, createdAt }`
- **Features**: Generates unique ID, defaults status to 'pending'
- **Persistence**: Automatically saved to `user-stories.json`
- **Location**: `actions.js:355-366`

#### `updateUserStory(storyId, updates)`
- **Type**: `UPDATE_USER_STORY`
- **Purpose**: Modify story properties
- **Payload**: `{ id, ...updates, updatedAt }`
- **Persistence**: Automatically saved to `user-stories.json`
- **Location**: `actions.js:369-376`

#### `deleteUserStory(storyId)`
- **Type**: `DELETE_USER_STORY`
- **Purpose**: Remove user story
- **Payload**: `{ id }`
- **Persistence**: Automatically saved to `user-stories.json`
- **Location**: `actions.js:379-384`

#### `loadUserStories(stories)`
- **Type**: `LOAD_USER_STORIES`
- **Purpose**: Load stories from persistent storage
- **Payload**: `{ stories }`
- **Location**: `actions.js:387-392`

### 8. User Story Derivation Actions (10 actions)

Advanced workflow for deriving, reviewing, and implementing user stories.

#### `deriveUserStories(data)`
- **Type**: `DERIVE_USER_STORIES`
- **Purpose**: Request Claude derive stories from specifications
- **Payload**: `{ branchId, content, timestamp }`
- **Location**: `actions.js:400-407`

#### `receiveDerivedStories(stories, originalPrompt)`
- **Type**: `RECEIVE_DERIVED_STORIES`
- **Purpose**: Accept derived stories and show review modal
- **Payload**: `{ stories, originalPrompt, timestamp }`
- **Features**: Maps stories to include generated IDs and default status
- **Location**: `actions.js:410-424`

#### `markStoryReady(storyId)`
- **Type**: `MARK_STORY_READY`
- **Purpose**: Mark story as "ready" for implementation
- **Payload**: `{ storyId }`
- **Location**: `actions.js:427-432`

#### `unmarkStoryReady(storyId)`
- **Type**: `UNMARK_STORY_READY`
- **Purpose**: Revert story back to "pending"
- **Payload**: `{ storyId }`
- **Location**: `actions.js:435-440`

#### `updateDerivedStory(storyId, updates)`
- **Type**: `UPDATE_DERIVED_STORY`
- **Purpose**: Modify pending story during review
- **Payload**: `{ storyId, updates }`
- **Location**: `actions.js:443-449`

#### `deleteDerivedStory(storyId)`
- **Type**: `DELETE_DERIVED_STORY`
- **Purpose**: Discard pending story from review
- **Payload**: `{ storyId }`
- **Location**: `actions.js:452-457`

#### `requestStoryChanges(feedback)`
- **Type**: `REQUEST_STORY_CHANGES`
- **Purpose**: Ask Claude to revise stories based on feedback
- **Payload**: `{ feedback, timestamp }`
- **Location**: `actions.js:460-466`

#### `implementStories(storyIds, withPlanning)`
- **Type**: `IMPLEMENT_STORIES`
- **Purpose**: Accept ready stories and generate implementation prompt
- **Payload**: `{ storyIds, withPlanning, timestamp }`
- **Features**: Optional planning mode parameter
- **Location**: `actions.js:469-476`

#### `cancelStoryReview()`
- **Type**: `CANCEL_STORY_REVIEW`
- **Purpose**: Abandon derivation workflow
- **Payload**: `{}`
- **Location**: `actions.js:479-482`

#### `storyDerivationError(error)`
- **Type**: `STORY_DERIVATION_ERROR`
- **Purpose**: Handle derivation failures
- **Payload**: `{ error, timestamp }`
- **Location**: `actions.js:485-491`

### 9. UI Navigation Actions (4 actions)

Control application navigation and interface state.

#### `switchView(view)`
- **Type**: `SWITCH_VIEW`
- **Purpose**: Change main application view
- **Valid Views**: 'config', 'prompt', 'designer', 'user-stories', 'architecture', 'cli-output'
- **Payload**: `{ view }`
- **Location**: `actions.js:498-503`

#### `toggleSidebar()`
- **Type**: `TOGGLE_SIDEBAR`
- **Purpose**: Show/hide sidebar
- **Payload**: `{}`
- **Location**: `actions.js:506-509`

#### `showModal(modalType, data)`
- **Type**: `SHOW_MODAL`
- **Purpose**: Display modal dialog
- **Payload**: `{ modalType, data }`
- **Features**: Accepts optional data parameter
- **Location**: `actions.js:512-518`

#### `hideModal()`
- **Type**: `HIDE_MODAL`
- **Purpose**: Close modal
- **Payload**: `{}`
- **Location**: `actions.js:521-524`

### 10. Activity Tracking Actions (8 actions)

Track Claude CLI tool execution during prompts.

#### `setCurrentTool(name, input)`
- **Type**: `SET_CURRENT_TOOL`
- **Purpose**: Record current tool being used
- **Payload**: `{ name, input, timestamp }`
- **Features**: Optional input parameter
- **Location**: `actions.js:531-538`

#### `clearCurrentTool()`
- **Type**: `CLEAR_CURRENT_TOOL`
- **Purpose**: Clear tool state after execution
- **Payload**: `{ timestamp }`
- **Location**: `actions.js:541-546`

#### `addModifiedFile(filePath, action)`
- **Type**: `ADD_MODIFIED_FILE`
- **Purpose**: Track file modification
- **Valid Actions**: 'read', 'write', 'edit'
- **Payload**: `{ filePath, action, timestamp }`
- **Location**: `actions.js:549-556`

#### `clearModifiedFiles()`
- **Type**: `CLEAR_MODIFIED_FILES`
- **Purpose**: Reset files list
- **Payload**: `{ timestamp }`
- **Location**: `actions.js:559-564`

#### `setActivityStatus(status)`
- **Type**: `SET_ACTIVITY_STATUS`
- **Purpose**: Set overall activity status
- **Valid Statuses**: 'idle', 'thinking', 'tool-use', 'complete'
- **Payload**: `{ status, timestamp }`
- **Location**: `actions.js:567-573`

#### `toolStart(id, name, input)`
- **Type**: `TOOL_START`
- **Purpose**: Start concurrent tool tracking
- **Payload**: `{ id, name, input, timestamp }`
- **Features**: Optional input parameter
- **Location**: `actions.js:576-584`

#### `toolEnd(id, filePath, action)`
- **Type**: `TOOL_END`
- **Purpose**: Finish tool execution
- **Payload**: `{ id, filePath, action, timestamp }`
- **Features**: Optional filePath and action parameters
- **Location**: `actions.js:587-595`

#### `clearActivity()`
- **Type**: `CLEAR_ACTIVITY`
- **Purpose**: Reset all activity state to idle
- **Payload**: `{ timestamp }`
- **Location**: `actions.js:598-603`

## Key Workflows

### Prompt Submission Flow
1. `startCompose(branchId)` - Begin composing
2. `updatePromptContent(content)` - Update as user types
3. `submitPrompt(data)` - Submit to Claude CLI
4. `receiveResponseChunk(chunk)` - Handle streaming response
5. `completeResponse(response)` - Finalize response

### User Story Derivation Flow
1. `deriveUserStories(data)` - Request derivation from Claude
2. `receiveDerivedStories(stories, originalPrompt)` - Show review modal
3. `markStoryReady(storyId)` / `unmarkStoryReady(storyId)` - Review stories
4. `implementStories(storyIds, withPlanning)` - Generate implementation prompt
5. `cancelStoryReview()` - Abandon if needed

### Activity Tracking Flow
1. `setActivityStatus('thinking')` - Set overall status
2. `toolStart(id, name, input)` - Track individual tools
3. `addModifiedFile(filePath, action)` - Track file operations
4. `toolEnd(id, filePath, action)` - Complete tool
5. `setActivityStatus('complete')` - Mark complete
6. `clearActivity()` - Reset for next prompt

## Action Design Patterns

### Consistent Payload Structure
- All actions include a `type` and `payload`
- Timestamps are added for actions that modify state
- IDs are generated using `generateId()` from shared utilities

### Error Handling
- Dedicated error actions for different contexts:
  - `appError()` - Application-level errors
  - `responseError()` - Claude CLI response failures
  - `storyDerivationError()` - Story derivation failures

### State Management Integration
- Actions trigger acceptors in `model.js`
- Acceptors validate and apply changes to application state
- State changes trigger re-rendering and persistence
- FSM validation ensures valid state transitions

### Persistence Strategy
- Actions mark which state should be persisted
- App automatically saves to .puffin/ directory
- Different data types use different files:
  - `config.json` - Project configuration
  - `history.json` - Conversation history
  - `user-stories.json` - User stories
  - `architecture.md` - Architecture document
  - `gui-designer.json` - GUI designs

## Summary

Puffin implements a comprehensive SAM architecture with 46 action creators organized into 10 semantic categories. The actions support:

- **Conversation Management**: Full prompt/response lifecycle with branching
- **Visual Design**: GUI designer with save/load capabilities
- **Project Organization**: User stories with derive → iterate → implement workflow
- **Architecture Documentation**: Markdown editor with Claude review
- **Activity Monitoring**: Real-time tracking of Claude CLI tool usage
- **Persistent State**: Automatic saving to structured .puffin/ directory

Each action follows consistent patterns for payload structure, error handling, and integration with the broader SAM pattern, making the codebase maintainable and debuggable.