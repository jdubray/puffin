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

// Restore pendingPromptId after an auth retry (re-attaches response to existing history entry)
export const setPendingPromptId = (promptId) => ({
  type: 'SET_PENDING_PROMPT_ID',
  payload: { promptId }
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

// Request continue - triggers a continuation prompt via next-action
export const requestContinue = (branchId, promptContent, parentId = null) => ({
  type: 'REQUEST_CONTINUE',
  payload: {
    branchId,
    promptContent,
    parentId,
    timestamp: Date.now()
  }
})

// Clear continue request (after it's been handled)
export const clearContinueRequest = () => ({
  type: 'CLEAR_CONTINUE_REQUEST',
  payload: {}
})

// Select a prompt from history
export const selectPrompt = (promptId) => ({
  type: 'SELECT_PROMPT',
  payload: {
    promptId
  }
})

// Clear the prompt selection (for starting new threads or receiving handoffs)
export const clearPromptSelection = () => ({
  type: 'CLEAR_PROMPT_SELECTION',
  payload: {}
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
    inspectionAssertions: story.inspectionAssertions || [],
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

/**
 * UI Navigation Actions
 */

// Switch main view
export const switchView = (view) => ({
  type: 'SWITCH_VIEW',
  payload: {
    view // 'config', 'prompt', 'user-stories', 'architecture', 'cli-output' (plugins may add more views)
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

// Expand a thread all the way to the last/deepest descendant
export const expandThreadToEnd = (promptId) => ({
  type: 'EXPAND_THREAD_TO_END',
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
 * Add a synthetic (non-Claude) prompt entry to branch history.
 * Used by CRE to make plans, RIS, and assertions visible in the prompt view.
 * @param {string} branchId - Target branch (e.g. 'specifications')
 * @param {string} content - The "prompt" text (what was requested)
 * @param {string} responseContent - The "response" text (the result)
 * @param {object} [metadata] - Optional metadata (title, storyId, sprintId)
 */
export const addSyntheticPrompt = (branchId, content, responseContent, metadata = {}) => ({
  type: 'ADD_SYNTHETIC_PROMPT',
  payload: {
    id: generateId(),
    branchId,
    content,
    responseContent,
    title: metadata.title || null,
    storyId: metadata.storyId || null,
    sprintId: metadata.sprintId || null,
    parentId: metadata.parentId || null,
    timestamp: Date.now()
  }
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

// Enable or disable the Puppeteer Visual Feedback Loop (Website Edition)
export const setPuppeteerLoop = (enabled) => ({
  type: 'SET_PUPPETEER_LOOP',
  payload: { enabled }
})
