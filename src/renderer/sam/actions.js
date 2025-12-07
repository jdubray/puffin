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
export const completeResponse = (response) => ({
  type: 'COMPLETE_RESPONSE',
  payload: {
    content: response.content,
    sessionId: response.sessionId,
    cost: response.cost,
    turns: response.turns,
    duration: response.duration,
    timestamp: Date.now()
  }
})

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
 * UI Navigation Actions
 */

// Switch main view
export const switchView = (view) => ({
  type: 'SWITCH_VIEW',
  payload: {
    view // 'config', 'prompt', 'designer', 'architecture', 'cli-output'
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
