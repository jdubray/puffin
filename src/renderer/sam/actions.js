/**
 * Puffin SAM Actions
 *
 * Actions are pure functions that compute proposals based on user intent.
 * They don't mutate state directly - they propose changes to the model.
 */

import { generateId } from '../../shared/formatters.js'

/**
 * Application Actions
 */

// Initialize the application with project path
export const initializeApp = (projectPath, projectName) => ({
  type: 'INITIALIZE_APP',
  payload: {
    projectPath,
    projectName,
    timestamp: Date.now()
  }
})

// Load state from .puffin/ directory
export const loadState = (state) => ({
  type: 'LOAD_STATE',
  payload: {
    state
  }
})

// Application error
export const appError = (error) => ({
  type: 'APP_ERROR',
  payload: {
    error: error.message || error,
    timestamp: Date.now()
  }
})

// Recover from error
export const recover = () => ({
  type: 'RECOVER',
  payload: {}
})

/**
 * Config Actions (replaces Project Actions)
 * Config is automatically persisted to .puffin/config.json
 */

// Update config fields
export const updateConfig = (updates) => ({
  type: 'UPDATE_CONFIG',
  payload: {
    ...updates,
    updatedAt: Date.now()
  }
})

// Update project options (Claude guidance)
export const updateOptions = (options) => ({
  type: 'UPDATE_OPTIONS',
  payload: {
    options,
    updatedAt: Date.now()
  }
})

/**
 * Prompt/History Actions
 */

// Start composing a prompt
export const startCompose = (branchId) => ({
  type: 'START_COMPOSE',
  payload: {
    branchId
  }
})

// Update prompt content while composing
export const updatePromptContent = (content) => ({
  type: 'UPDATE_PROMPT_CONTENT',
  payload: {
    content
  }
})

// Submit prompt to Claude
export const submitPrompt = (data) => ({
  type: 'SUBMIT_PROMPT',
  payload: {
    id: generateId(),
    branchId: data.branchId,
    parentId: data.parentId || null,
    content: data.content,
    timestamp: Date.now()
  }
})

// Receive response from Claude (streaming chunk)
export const receiveResponseChunk = (chunk) => ({
  type: 'RECEIVE_RESPONSE_CHUNK',
  payload: {
    chunk,
    timestamp: Date.now()
  }
})

// Complete response from Claude
export const completeResponse = (response, filesModified = []) => {
  const payload = {
    content: response.content,
    sessionId: response.sessionId,
    cost: response.cost,
    turns: response.turns,
    duration: response.duration,
    filesModified: filesModified,
    timestamp: Date.now()
  }

  return {
    type: 'COMPLETE_RESPONSE',
    payload
  }
}

// Response failed
export const responseError = (error) => ({
  type: 'RESPONSE_ERROR',
  payload: {
    error: error.message || error,
    timestamp: Date.now()
  }
})

// Cancel current prompt
export const cancelPrompt = () => ({
  type: 'CANCEL_PROMPT',
  payload: {}
})

// Rerun a prompt (re-submit with same content)
export const rerunPrompt = (promptId) => ({
  type: 'RERUN_PROMPT',
  payload: {
    promptId,
    timestamp: Date.now()
  }
})

// Clear rerun request (after it's been handled)
export const clearRerunRequest = () => ({
  type: 'CLEAR_RERUN_REQUEST',
  payload: {}
})

// Select a branch
export const selectBranch = (branchId) => ({
  type: 'SELECT_BRANCH',
  payload: {
    branchId
  }
})

// Create a new branch
export const createBranch = (data) => ({
  type: 'CREATE_BRANCH',
  payload: {
    id: data.id || generateId(),
    name: data.name,
    icon: data.icon || 'folder'
  }
})

// Delete a branch
export const deleteBranch = (branchId) => ({
  type: 'DELETE_BRANCH',
  payload: {
    branchId
  }
})

// Reorder branches
export const reorderBranches = (fromIndex, toIndex) => ({
  type: 'REORDER_BRANCHES',
  payload: {
    fromIndex,
    toIndex
  }
})

// Update branch settings (including plugin assignments)
export const updateBranchSettings = (branchId, settings) => ({
  type: 'UPDATE_BRANCH_SETTINGS',
  payload: {
    branchId,
    settings,
    timestamp: Date.now()
  }
})

// Select a prompt from history
export const selectPrompt = (promptId) => ({
  type: 'SELECT_PROMPT',
  payload: {
    promptId
  }
})

/**
 * GUI Designer Actions
 */

// Add element to canvas
export const addGuiElement = (element) => ({
  type: 'ADD_GUI_ELEMENT',
  payload: {
    id: generateId(),
    type: element.type,
    properties: element.properties || {},
    parentId: element.parentId || null
  }
})

// Update element properties
export const updateGuiElement = (elementId, properties) => ({
  type: 'UPDATE_GUI_ELEMENT',
  payload: {
    id: elementId,
    properties
  }
})

// Delete element
export const deleteGuiElement = (elementId) => ({
  type: 'DELETE_GUI_ELEMENT',
  payload: {
    id: elementId
  }
})

// Move element
export const moveGuiElement = (elementId, x, y) => ({
  type: 'MOVE_GUI_ELEMENT',
  payload: {
    id: elementId,
    x,
    y
  }
})

// Resize element
export const resizeGuiElement = (elementId, width, height) => ({
  type: 'RESIZE_GUI_ELEMENT',
  payload: {
    id: elementId,
    width,
    height
  }
})

// Select element
export const selectGuiElement = (elementId) => ({
  type: 'SELECT_GUI_ELEMENT',
  payload: {
    elementId
  }
})

// Clear canvas
export const clearGuiCanvas = () => ({
  type: 'CLEAR_GUI_CANVAS',
  payload: {}
})

// Export GUI to description
export const exportGuiDescription = () => ({
  type: 'EXPORT_GUI_DESCRIPTION',
  payload: {}
})

/**
 * GUI Definition Actions
 */

// Save current GUI as a named definition
export const saveGuiDefinition = (name, description) => ({
  type: 'SAVE_GUI_DEFINITION',
  payload: {
    name,
    description,
    timestamp: Date.now()
  }
})

// Load a GUI definition into the designer
export const loadGuiDefinition = (filename, definition) => ({
  type: 'LOAD_GUI_DEFINITION',
  payload: {
    filename,
    definition,
    timestamp: Date.now()
  }
})

// List all available GUI definitions
export const listGuiDefinitions = () => ({
  type: 'LIST_GUI_DEFINITIONS',
  payload: {
    timestamp: Date.now()
  }
})

// Delete a GUI definition
export const deleteGuiDefinition = (filename) => ({
  type: 'DELETE_GUI_DEFINITION',
  payload: {
    filename,
    timestamp: Date.now()
  }
})

// Show GUI definition selection dialog
export const showGuiDefinitionDialog = () => ({
  type: 'SHOW_GUI_DEFINITION_DIALOG',
  payload: {
    timestamp: Date.now()
  }
})

// Show save GUI definition dialog
export const showSaveGuiDefinitionDialog = () => ({
  type: 'SHOW_SAVE_GUI_DEFINITION_DIALOG',
  payload: {
    timestamp: Date.now()
  }
})

/**
 * Architecture Document Actions
 */

// Update architecture content
export const updateArchitecture = (content) => ({
  type: 'UPDATE_ARCHITECTURE',
  payload: {
    content,
    updatedAt: Date.now()
  }
})

// Request Claude review of architecture
export const reviewArchitecture = () => ({
  type: 'REVIEW_ARCHITECTURE',
  payload: {
    timestamp: Date.now()
  }
})

/**
 * User Story Actions
 */

// Add a user story
export const addUserStory = (story) => ({
  type: 'ADD_USER_STORY',
  payload: {
    id: generateId(),
    title: story.title,
    description: story.description || '',
    acceptanceCriteria: story.acceptanceCriteria || [],
    status: story.status || 'pending',
    sourcePromptId: story.sourcePromptId || null,
    createdAt: Date.now()
  }
})

// Update a user story
export const updateUserStory = (storyId, updates) => ({
  type: 'UPDATE_USER_STORY',
  payload: {
    id: storyId,
    ...updates,
    updatedAt: Date.now()
  }
})

// Delete a user story
export const deleteUserStory = (storyId) => ({
  type: 'DELETE_USER_STORY',
  payload: {
    id: storyId
  }
})

// Load user stories from storage
export const loadUserStories = (stories) => ({
  type: 'LOAD_USER_STORIES',
  payload: {
    stories
  }
})

// Load sprint history from storage
export const loadSprintHistory = (sprints) => ({
  type: 'LOAD_SPRINT_HISTORY',
  payload: {
    sprints
  }
})

// Set sprint filter to show only stories from a specific sprint
export const setSprintFilter = (sprintId) => ({
  type: 'SET_SPRINT_FILTER',
  payload: {
    sprintId
  }
})

// Clear sprint filter to show all stories
export const clearSprintFilter = () => ({
  type: 'CLEAR_SPRINT_FILTER',
  payload: {}
})

/**
 * User Story Derivation Actions
 * For the derive -> iterate -> implement workflow
 */

// Start deriving user stories from a prompt
export const deriveUserStories = (data) => ({
  type: 'DERIVE_USER_STORIES',
  payload: {
    branchId: data.branchId,
    content: data.content,
    timestamp: Date.now()
  }
})

// Receive derived stories from Claude
export const receiveDerivedStories = (stories, originalPrompt) => ({
  type: 'RECEIVE_DERIVED_STORIES',
  payload: {
    stories: stories.map(s => ({
      id: generateId(),
      title: s.title,
      description: s.description || '',
      acceptanceCriteria: s.acceptanceCriteria || [],
      status: 'pending',
      notes: ''
    })),
    originalPrompt,
    timestamp: Date.now()
  }
})

// Mark a pending story as ready for implementation
export const markStoryReady = (storyId) => ({
  type: 'MARK_STORY_READY',
  payload: {
    storyId
  }
})

// Unmark a story (set back to pending)
export const unmarkStoryReady = (storyId) => ({
  type: 'UNMARK_STORY_READY',
  payload: {
    storyId
  }
})

// Update a pending story's fields
export const updateDerivedStory = (storyId, updates) => ({
  type: 'UPDATE_DERIVED_STORY',
  payload: {
    storyId,
    updates
  }
})

// Delete a pending story from the review list (with optional rejection reason for tracking)
export const deleteDerivedStory = (storyId, reason = null) => ({
  type: 'DELETE_DERIVED_STORY',
  payload: {
    storyId,
    reason // Optional reason for rejecting the story (US-2)
  }
})

// Request Claude to modify stories based on feedback
export const requestStoryChanges = (feedback) => ({
  type: 'REQUEST_STORY_CHANGES',
  payload: {
    feedback,
    timestamp: Date.now()
  }
})

// Add selected stories to backlog
export const addStoriesToBacklog = (storyIds) => ({
  type: 'ADD_STORIES_TO_BACKLOG',
  payload: {
    storyIds,
    timestamp: Date.now()
  }
})

// Cancel story review (discard pending stories)
export const cancelStoryReview = () => ({
  type: 'CANCEL_STORY_REVIEW',
  payload: {}
})

// Story derivation error
export const storyDerivationError = (error) => ({
  type: 'STORY_DERIVATION_ERROR',
  payload: {
    error: error.error || error.message || error,
    timestamp: Date.now()
  }
})

/**
 * Story Generation Tracking Actions
 * For tracking how Claude decomposes prompts into stories and implementation outcomes
 */

// Load story generations from storage
export const loadStoryGenerations = (generations) => ({
  type: 'LOAD_STORY_GENERATIONS',
  payload: {
    generations
  }
})

// Create a new story generation record when Claude derives stories
export const createStoryGeneration = (data) => ({
  type: 'CREATE_STORY_GENERATION',
  payload: {
    id: generateId(),
    user_prompt: data.user_prompt,
    project_context: data.project_context || null,
    generated_stories: data.generated_stories || [],
    model_used: data.model_used || 'sonnet',
    timestamp: new Date().toISOString()
  }
})

// Update feedback on a generated story (accept/modify/reject)
export const updateGeneratedStoryFeedback = (generationId, storyId, feedback) => ({
  type: 'UPDATE_GENERATED_STORY_FEEDBACK',
  payload: {
    generationId,
    storyId,
    feedback // { user_action, modification_diff?, rejection_reason? }
  }
})

// Finalize generation when adding stories to backlog (links backlog IDs)
export const finalizeStoryGeneration = (generationId, storyMappings) => ({
  type: 'FINALIZE_STORY_GENERATION',
  payload: {
    generationId,
    storyMappings // [{ generatedStoryId, backlogStoryId }]
  }
})

// Create an implementation journey when starting to implement a story
export const createImplementationJourney = (data) => ({
  type: 'CREATE_IMPLEMENTATION_JOURNEY',
  payload: {
    id: generateId(),
    story_id: data.story_id,
    prompt_id: data.prompt_id,
    turn_count: data.turn_count || 0,
    inputs: data.inputs || []
  }
})

// Add an input to an implementation journey (for tracking input types)
export const addImplementationInput = (journeyId, input) => ({
  type: 'ADD_IMPLEMENTATION_INPUT',
  payload: {
    journeyId,
    input // { turn_number, type, content_summary }
  }
})

// Update implementation journey (e.g., turn count)
export const updateImplementationJourney = (journeyId, updates) => ({
  type: 'UPDATE_IMPLEMENTATION_JOURNEY',
  payload: {
    journeyId,
    updates
  }
})

// Complete implementation journey with outcome
export const completeImplementationJourney = (journeyId, status, outcome_notes = null) => ({
  type: 'COMPLETE_IMPLEMENTATION_JOURNEY',
  payload: {
    journeyId,
    status, // 'success' | 'partial' | 'failed'
    outcome_notes
  }
})

/**
 * UI Navigation Actions
 */

// Switch main view
export const switchView = (view) => ({
  type: 'SWITCH_VIEW',
  payload: {
    view // 'config', 'prompt', 'designer', 'user-stories', 'architecture', 'cli-output'
  }
})

// Toggle sidebar
export const toggleSidebar = () => ({
  type: 'TOGGLE_SIDEBAR',
  payload: {}
})

// Show modal
export const showModal = (modalType, data = {}) => ({
  type: 'SHOW_MODAL',
  payload: {
    modalType,
    data
  }
})

// Hide modal
export const hideModal = () => ({
  type: 'HIDE_MODAL',
  payload: {}
})

/**
 * Activity Tracking Actions
 */

// Set the current tool being used
export const setCurrentTool = (name, input = null) => ({
  type: 'SET_CURRENT_TOOL',
  payload: {
    name,
    input,
    timestamp: Date.now()
  }
})

// Clear current tool (return to idle/thinking)
export const clearCurrentTool = () => ({
  type: 'CLEAR_CURRENT_TOOL',
  payload: {
    timestamp: Date.now()
  }
})

// Add a file to the modified files list
export const addModifiedFile = (filePath, action) => ({
  type: 'ADD_MODIFIED_FILE',
  payload: {
    filePath,
    action, // 'read', 'write', 'edit'
    timestamp: Date.now()
  }
})

// Clear the modified files list
export const clearModifiedFiles = () => ({
  type: 'CLEAR_MODIFIED_FILES',
  payload: {
    timestamp: Date.now()
  }
})

// Set the overall activity status
export const setActivityStatus = (status) => ({
  type: 'SET_ACTIVITY_STATUS',
  payload: {
    status, // 'idle', 'thinking', 'tool-use', 'complete'
    timestamp: Date.now()
  }
})

// Start a tool (for tracking concurrent tools)
export const toolStart = (id, name, input = null) => ({
  type: 'TOOL_START',
  payload: {
    id,
    name,
    input,
    timestamp: Date.now()
  }
})

// End a tool (removes from active tools)
export const toolEnd = (id, filePath = null, action = null) => ({
  type: 'TOOL_END',
  payload: {
    id,
    filePath,
    action,
    timestamp: Date.now()
  }
})

// Clear all activity state (reset to idle)
export const clearActivity = () => ({
  type: 'CLEAR_ACTIVITY',
  payload: {
    timestamp: Date.now()
  }
})

/**
 * Developer Profile Actions
 */

// Start GitHub authentication flow
export const startGithubAuth = () => ({
  type: 'START_GITHUB_AUTH',
  payload: {
    timestamp: Date.now()
  }
})

// GitHub authentication succeeded
export const githubAuthSuccess = (profile) => ({
  type: 'GITHUB_AUTH_SUCCESS',
  payload: {
    profile,
    timestamp: Date.now()
  }
})

// GitHub authentication failed
export const githubAuthError = (error) => ({
  type: 'GITHUB_AUTH_ERROR',
  payload: {
    error: error.message || error,
    timestamp: Date.now()
  }
})

// Logout from GitHub
export const githubLogout = () => ({
  type: 'GITHUB_LOGOUT',
  payload: {
    timestamp: Date.now()
  }
})

// Load GitHub repositories
export const loadGithubRepositories = (repositories) => ({
  type: 'LOAD_GITHUB_REPOSITORIES',
  payload: {
    repositories,
    timestamp: Date.now()
  }
})

// Select a GitHub repository
export const selectGithubRepository = (repositoryId) => ({
  type: 'SELECT_GITHUB_REPOSITORY',
  payload: {
    repositoryId
  }
})

// Load GitHub activity events
export const loadGithubActivity = (events) => ({
  type: 'LOAD_GITHUB_ACTIVITY',
  payload: {
    events,
    timestamp: Date.now()
  }
})

// Update GitHub contributions data
export const updateGithubContributions = (contributions) => ({
  type: 'UPDATE_GITHUB_CONTRIBUTIONS',
  payload: {
    ...contributions,
    timestamp: Date.now()
  }
})

// Update GitHub integration settings
export const updateGithubSettings = (settings) => ({
  type: 'UPDATE_GITHUB_SETTINGS',
  payload: {
    ...settings,
    timestamp: Date.now()
  }
})

// Update GitHub API rate limit info
export const updateGithubRateLimit = (remaining, reset) => ({
  type: 'UPDATE_GITHUB_RATE_LIMIT',
  payload: {
    remaining,
    reset,
    timestamp: Date.now()
  }
})

// Load developer profile from storage
export const loadDeveloperProfile = (profile) => ({
  type: 'LOAD_DEVELOPER_PROFILE',
  payload: {
    profile,
    timestamp: Date.now()
  }
})

/**
 * Thread Expansion/Collapse Actions
 */

// Toggle thread expansion (expand if collapsed, collapse if expanded)
export const toggleThreadExpanded = (promptId) => ({
  type: 'TOGGLE_THREAD_EXPANDED',
  payload: {
    promptId
  }
})

// Mark a thread as complete (with optional journey outcome for implementation threads)
export const markThreadComplete = (promptId, journeyOutcome = 'success', outcomeNotes = null) => ({
  type: 'MARK_THREAD_COMPLETE',
  payload: {
    promptId,
    journeyOutcome, // 'success' | 'partial' | 'failed'
    outcomeNotes,
    timestamp: Date.now()
  }
})

// Unmark a thread as complete (set back to in-progress)
export const unmarkThreadComplete = (promptId) => ({
  type: 'UNMARK_THREAD_COMPLETE',
  payload: {
    promptId,
    timestamp: Date.now()
  }
})

/**
 * Handoff Actions
 * For context handoff between threads
 */

// Show the handoff review modal
export const showHandoffReview = (handoffData = {}) => ({
  type: 'SHOW_HANDOFF_REVIEW',
  payload: {
    ...handoffData,
    timestamp: Date.now()
  }
})

// Update the handoff summary
export const updateHandoffSummary = (summary) => ({
  type: 'UPDATE_HANDOFF_SUMMARY',
  payload: {
    summary,
    timestamp: Date.now()
  }
})

// Complete the handoff (create new thread with context)
export const completeHandoff = (handoffData) => ({
  type: 'COMPLETE_HANDOFF',
  payload: {
    ...handoffData,
    timestamp: Date.now()
  }
})

// Cancel handoff review
export const cancelHandoff = () => ({
  type: 'CANCEL_HANDOFF',
  payload: {
    timestamp: Date.now()
  }
})

// Delete a saved handoff
export const deleteHandoff = (handoffId) => ({
  type: 'DELETE_HANDOFF',
  payload: {
    handoffId,
    timestamp: Date.now()
  }
})

// Set handoff context for a branch (persisted in history)
export const setBranchHandoffContext = (branchId, handoffContext) => ({
  type: 'SET_BRANCH_HANDOFF_CONTEXT',
  payload: {
    branchId,
    handoffContext,
    timestamp: Date.now()
  }
})

// Clear handoff context for a branch
export const clearBranchHandoffContext = (branchId) => ({
  type: 'CLEAR_BRANCH_HANDOFF_CONTEXT',
  payload: {
    branchId,
    timestamp: Date.now()
  }
})

/**
 * Sprint Actions
 * For grouping user stories into focused implementation sprints
 */

// Create a sprint from selected user stories
export const createSprint = (stories) => ({
  type: 'CREATE_SPRINT',
  payload: {
    stories,
    timestamp: Date.now()
  }
})

// Start sprint planning - triggers planning prompt to Claude
export const startSprintPlanning = () => ({
  type: 'START_SPRINT_PLANNING',
  payload: {
    timestamp: Date.now()
  }
})

// Approve the sprint plan
export const approvePlan = () => ({
  type: 'APPROVE_PLAN',
  payload: {
    timestamp: Date.now()
  }
})

// Clear/close the active sprint
export const clearSprint = () => ({
  type: 'CLEAR_SPRINT',
  payload: {
    timestamp: Date.now()
  }
})

// Clear/close the active sprint with title and description
export const clearSprintWithDetails = (title, description = '') => ({
  type: 'CLEAR_SPRINT_WITH_DETAILS',
  payload: {
    title,
    description,
    timestamp: Date.now()
  }
})

// Show sprint close modal
export const showSprintCloseModal = () => ({
  type: 'SHOW_MODAL',
  payload: {
    type: 'sprint-close',
    data: {}
  }
})

// Clear pending sprint planning flag (after IPC submission)
export const clearPendingSprintPlanning = () => ({
  type: 'CLEAR_PENDING_SPRINT_PLANNING',
  payload: {}
})

// Start implementation for a specific story and branch (sprint workflow)
export const startSprintStoryImplementation = (storyId, branchType) => ({
  type: 'START_SPRINT_STORY_IMPLEMENTATION',
  payload: {
    storyId,
    branchType,
    timestamp: Date.now()
  }
})

// Clear pending story implementation flag (after IPC submission)
export const clearPendingStoryImplementation = () => ({
  type: 'CLEAR_PENDING_STORY_IMPLEMENTATION',
  payload: {}
})

// Mark a story branch as completed
export const completeStoryBranch = (storyId, branchType) => ({
  type: 'COMPLETE_STORY_BRANCH',
  payload: {
    storyId,
    branchType,
    timestamp: Date.now()
  }
})

// Update sprint story status (for completion toggle)
export const updateSprintStoryStatus = (storyId, status) => ({
  type: 'UPDATE_SPRINT_STORY_STATUS',
  payload: {
    storyId,
    status,
    timestamp: Date.now()
  }
})

// Clear sprint validation error
export const clearSprintError = () => ({
  type: 'CLEAR_SPRINT_ERROR',
  payload: { timestamp: Date.now() }
})

// Record iteration output for stuck detection
export const recordIterationOutput = (outputHash, outputSummary) => ({
  type: 'RECORD_ITERATION_OUTPUT',
  payload: {
    outputHash,
    outputSummary,
    timestamp: Date.now()
  }
})

// Resolve stuck state with user action
export const resolveStuckState = (action) => ({
  type: 'RESOLVE_STUCK_STATE',
  payload: {
    action, // 'continue' | 'modify' | 'stop' | 'dismiss'
    timestamp: Date.now()
  }
})

// Reset stuck detection (when output changes significantly)
export const resetStuckDetection = () => ({
  type: 'RESET_STUCK_DETECTION',
  payload: { timestamp: Date.now() }
})

// Clear active implementation story (when [Complete] detected or manually cancelled)
export const clearActiveImplementationStory = () => ({
  type: 'CLEAR_ACTIVE_IMPLEMENTATION_STORY',
  payload: { timestamp: Date.now() }
})

// Toggle acceptance criteria completion for a story in sprint
export const toggleCriteriaCompletion = (storyId, criteriaIndex, checked) => ({
  type: 'TOGGLE_CRITERIA_COMPLETION',
  payload: {
    storyId,
    criteriaIndex,
    checked,
    timestamp: Date.now()
  }
})

/**
 * Git Integration Actions
 */

// Generate commit message with Claude (includes handoff summary context)
export const generateCommitMessage = (gitContext) => ({
  type: 'GENERATE_COMMIT_MESSAGE',
  payload: {
    stagedFiles: gitContext.stagedFiles,
    diff: gitContext.diff,
    currentBranch: gitContext.currentBranch,
    timestamp: Date.now()
  }
})

// Receive generated commit message from Claude
export const receiveCommitMessage = (message) => ({
  type: 'RECEIVE_COMMIT_MESSAGE',
  payload: {
    message,
    timestamp: Date.now()
  }
})

// Commit message generation error
export const commitMessageError = (error) => ({
  type: 'COMMIT_MESSAGE_ERROR',
  payload: {
    error: error.message || error,
    timestamp: Date.now()
  }
})

/**
 * Debug Actions
 */

// Store the last prompt sent to Claude CLI for debugging
export const storeDebugPrompt = (promptData) => ({
  type: 'STORE_DEBUG_PROMPT',
  payload: {
    content: promptData.content,
    branch: promptData.branch,
    model: promptData.model,
    sessionId: promptData.sessionId,
    timestamp: Date.now()
  }
})

// Clear the debug prompt
export const clearDebugPrompt = () => ({
  type: 'CLEAR_DEBUG_PROMPT',
  payload: { timestamp: Date.now() }
})

// Update debug mode setting
export const setDebugMode = (enabled) => ({
  type: 'SET_DEBUG_MODE',
  payload: { enabled }
})

/**
 * Thread Search Actions
 */

// Update thread search query
export const updateThreadSearchQuery = (query) => ({
  type: 'UPDATE_THREAD_SEARCH_QUERY',
  payload: {
    query
  }
})
