/**
 * Puffin SAM Model (Acceptors)
 *
 * Acceptors validate and apply proposals to the model.
 * They ensure the model remains consistent and valid.
 *
 * State is automatically persisted to .puffin/ directory via IPC.
 * No explicit save/load - Puffin opens a directory and state is always synced.
 */

import { validatePrompt, validateBranch } from '../../shared/validators.js'

/**
 * Initial model state
 * Note: Don't use 'error' as a property name - it conflicts with SAM's internal error() method
 * Use 'appError' instead, or rely on SAM's __error
 */
export const initialModel = {
  // Application state
  initialized: false,
  appError: null,

  // Project info (from directory)
  projectPath: null,
  projectName: null,

  // Config state (from .puffin/config.json)
  config: {
    name: '',
    description: '',
    assumptions: [],
    technicalArchitecture: '',
    dataModel: '',
    options: {
      programmingStyle: 'HYBRID',
      testingApproach: 'TDD',
      documentationLevel: 'STANDARD',
      errorHandling: 'EXCEPTIONS',
      codeStyle: {
        naming: 'CAMEL',
        comments: 'JSDoc'
      }
    }
  },

  // Prompt state
  currentPrompt: {
    content: '',
    branchId: null
  },
  pendingPromptId: null,
  streamingResponse: '',

  // History state (from .puffin/history.json)
  history: {
    branches: {
      specifications: { id: 'specifications', name: 'Specifications', prompts: [] },
      architecture: { id: 'architecture', name: 'Architecture', prompts: [] },
      ui: { id: 'ui', name: 'UI', prompts: [] },
      backend: { id: 'backend', name: 'Backend', prompts: [] },
      deployment: { id: 'deployment', name: 'Deployment', prompts: [] },
      tmp: { id: 'tmp', name: 'Tmp', prompts: [] }
    },
    activeBranch: 'specifications',
    activePromptId: null
  },

  // GUI Designer state
  guiElements: [],
  selectedGuiElement: null,

  // Architecture state (from .puffin/architecture.md)
  architecture: {
    content: '',
    updatedAt: null
  },

  // UI state
  currentView: 'prompt', // 'config', 'prompt', 'designer', 'architecture', 'cli-output'
  sidebarVisible: true,
  modal: null
}

/**
 * Application Acceptors
 * Note: SAM pattern expects curried functions: model => proposal => { ... }
 */

export const initializeAcceptor = model => proposal => {
  if (proposal?.type === 'INITIALIZE_APP') {
    model.initialized = true
    model.appError = null

    // Set project info from startup
    if (proposal.payload?.projectPath) {
      model.projectPath = proposal.payload.projectPath
      model.projectName = proposal.payload.projectName
    }
  }
}

export const loadStateAcceptor = model => proposal => {
  if (proposal?.type === 'LOAD_STATE') {
    const { state } = proposal.payload

    model.projectPath = state.projectPath
    model.projectName = state.projectName
    model.config = state.config
    model.history = state.history
    model.architecture = state.architecture

    // Switch to prompt view once loaded
    model.currentView = 'prompt'
  }
}

export const appErrorAcceptor = model => proposal => {
  if (proposal?.type === 'APP_ERROR') {
    model.appError = {
      message: proposal.payload.error,
      timestamp: proposal.payload.timestamp
    }
  }
}

export const recoverAcceptor = model => proposal => {
  if (proposal?.type === 'RECOVER') {
    model.appError = null
  }
}

/**
 * Config Acceptors
 */

export const updateConfigAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_CONFIG') {
    Object.keys(proposal.payload).forEach(key => {
      if (key !== 'type' && proposal.payload[key] !== undefined) {
        model.config[key] = proposal.payload[key]
      }
    })
  }
}

export const updateOptionsAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_OPTIONS') {
    model.config.options = {
      ...model.config.options,
      ...proposal.payload.options
    }
  }
}

/**
 * Prompt/History Acceptors
 */

export const startComposeAcceptor = model => proposal => {
  if (proposal?.type === 'START_COMPOSE') {
    model.currentPrompt = {
      content: '',
      branchId: proposal.payload.branchId
    }
  }
}

export const updatePromptContentAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_PROMPT_CONTENT') {
    model.currentPrompt.content = proposal.payload.content
  }
}

export const submitPromptAcceptor = model => proposal => {
  if (proposal?.type === 'SUBMIT_PROMPT') {
    const validation = validatePrompt({
      content: proposal.payload.content,
      branchId: proposal.payload.branchId
    })

    if (!validation.valid) {
      model.appError = { message: validation.errors.join(', ') }
      return
    }

    const branchId = proposal.payload.branchId
    if (!model.history.branches[branchId]) {
      model.appError = { message: `Branch '${branchId}' not found` }
      return
    }

    const prompt = {
      id: proposal.payload.id,
      parentId: proposal.payload.parentId,
      content: proposal.payload.content,
      timestamp: proposal.payload.timestamp,
      response: null,
      children: []
    }

    model.history.branches[branchId].prompts.push(prompt)
    model.pendingPromptId = prompt.id
    model.streamingResponse = ''
    model.currentPrompt = { content: '', branchId: null }

    // Update parent's children array if this is a child prompt
    if (proposal.payload.parentId) {
      const parentPrompt = model.history.branches[branchId].prompts
        .find(p => p.id === proposal.payload.parentId)
      if (parentPrompt) {
        parentPrompt.children.push(prompt.id)
      }
    }
  }
}

export const receiveResponseChunkAcceptor = model => proposal => {
  if (proposal?.type === 'RECEIVE_RESPONSE_CHUNK') {
    model.streamingResponse += proposal.payload.chunk
  }
}

export const completeResponseAcceptor = model => proposal => {
  if (proposal?.type === 'COMPLETE_RESPONSE' && model.pendingPromptId) {
    // Find the prompt and update its response
    for (const branch of Object.values(model.history.branches)) {
      const prompt = branch.prompts.find(p => p.id === model.pendingPromptId)
      if (prompt) {
        prompt.response = {
          content: proposal.payload.content,
          sessionId: proposal.payload.sessionId,
          cost: proposal.payload.cost,
          turns: proposal.payload.turns,
          duration: proposal.payload.duration,
          timestamp: proposal.payload.timestamp
        }
        model.history.activePromptId = prompt.id
        break
      }
    }
    model.pendingPromptId = null
    model.streamingResponse = ''
  }
}

export const responseErrorAcceptor = model => proposal => {
  if (proposal?.type === 'RESPONSE_ERROR') {
    model.appError = {
      message: proposal.payload.error,
      timestamp: proposal.payload.timestamp
    }
    model.pendingPromptId = null
    model.streamingResponse = ''
  }
}

export const cancelPromptAcceptor = model => proposal => {
  if (proposal?.type === 'CANCEL_PROMPT') {
    model.pendingPromptId = null
    model.streamingResponse = ''
  }
}

export const selectBranchAcceptor = model => proposal => {
  if (proposal?.type === 'SELECT_BRANCH') {
    if (model.history.branches[proposal.payload.branchId]) {
      model.history.activeBranch = proposal.payload.branchId
    }
  }
}

export const createBranchAcceptor = model => proposal => {
  if (proposal?.type === 'CREATE_BRANCH') {
    const validation = validateBranch({
      id: proposal.payload.id,
      name: proposal.payload.name
    })

    if (!validation.valid) {
      model.appError = { message: validation.errors.join(', ') }
      return
    }

    model.history.branches[proposal.payload.id] = {
      id: proposal.payload.id,
      name: proposal.payload.name,
      icon: proposal.payload.icon,
      prompts: []
    }
  }
}

export const deleteBranchAcceptor = model => proposal => {
  if (proposal?.type === 'DELETE_BRANCH') {
    const branchId = proposal.payload.branchId
    // Don't delete default branches
    const defaultBranches = ['specifications', 'architecture', 'ui', 'backend', 'deployment', 'tmp']
    if (!defaultBranches.includes(branchId) && model.history.branches[branchId]) {
      delete model.history.branches[branchId]
      if (model.history.activeBranch === branchId) {
        model.history.activeBranch = 'specifications'
      }
    }
  }
}

export const selectPromptAcceptor = model => proposal => {
  if (proposal?.type === 'SELECT_PROMPT') {
    model.history.activePromptId = proposal.payload.promptId
  }
}

/**
 * GUI Designer Acceptors
 */

export const addGuiElementAcceptor = model => proposal => {
  if (proposal?.type === 'ADD_GUI_ELEMENT') {
    model.guiElements.push({
      id: proposal.payload.id,
      type: proposal.payload.type,
      properties: proposal.payload.properties,
      parentId: proposal.payload.parentId,
      children: []
    })
    model.selectedGuiElement = proposal.payload.id
  }
}

export const updateGuiElementAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_GUI_ELEMENT') {
    const element = model.guiElements.find(e => e.id === proposal.payload.id)
    if (element) {
      element.properties = { ...element.properties, ...proposal.payload.properties }
    }
  }
}

export const deleteGuiElementAcceptor = model => proposal => {
  if (proposal?.type === 'DELETE_GUI_ELEMENT') {
    model.guiElements = model.guiElements.filter(e => e.id !== proposal.payload.id)
    if (model.selectedGuiElement === proposal.payload.id) {
      model.selectedGuiElement = null
    }
  }
}

export const moveGuiElementAcceptor = model => proposal => {
  if (proposal?.type === 'MOVE_GUI_ELEMENT') {
    const element = model.guiElements.find(e => e.id === proposal.payload.id)
    if (element) {
      element.properties.x = proposal.payload.x
      element.properties.y = proposal.payload.y
    }
  }
}

export const resizeGuiElementAcceptor = model => proposal => {
  if (proposal?.type === 'RESIZE_GUI_ELEMENT') {
    const element = model.guiElements.find(e => e.id === proposal.payload.id)
    if (element) {
      element.properties.width = proposal.payload.width
      element.properties.height = proposal.payload.height
    }
  }
}

export const selectGuiElementAcceptor = model => proposal => {
  if (proposal?.type === 'SELECT_GUI_ELEMENT') {
    model.selectedGuiElement = proposal.payload.elementId
  }
}

export const clearGuiCanvasAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_GUI_CANVAS') {
    model.guiElements = []
    model.selectedGuiElement = null
  }
}

/**
 * GUI Definition Acceptors
 */

export const loadGuiDefinitionAcceptor = model => proposal => {
  if (proposal?.type === 'LOAD_GUI_DEFINITION') {
    const { definition } = proposal.payload
    model.guiElements = definition.elements || []
    model.selectedGuiElement = null
  }
}

export const showGuiDefinitionDialogAcceptor = model => proposal => {
  if (proposal?.type === 'SHOW_GUI_DEFINITION_DIALOG') {
    model.modal = {
      type: 'gui-definition-selector',
      data: {}
    }
  }
}

export const showSaveGuiDefinitionDialogAcceptor = model => proposal => {
  if (proposal?.type === 'SHOW_SAVE_GUI_DEFINITION_DIALOG') {
    model.modal = {
      type: 'save-gui-definition',
      data: {
        elements: [...model.guiElements]
      }
    }
  }
}

/**
 * Architecture Acceptors
 */

export const updateArchitectureAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_ARCHITECTURE') {
    model.architecture.content = proposal.payload.content
    model.architecture.updatedAt = new Date().toISOString()
  }
}

export const reviewArchitectureAcceptor = model => proposal => {
  if (proposal?.type === 'REVIEW_ARCHITECTURE') {
    model.architecture.lastReviewAt = proposal.payload.timestamp
  }
}

/**
 * UI Navigation Acceptors
 */

export const switchViewAcceptor = model => proposal => {
  if (proposal?.type === 'SWITCH_VIEW') {
    const validViews = ['config', 'prompt', 'designer', 'architecture', 'cli-output']
    if (validViews.includes(proposal.payload.view)) {
      model.currentView = proposal.payload.view
    }
  }
}

export const toggleSidebarAcceptor = model => proposal => {
  if (proposal?.type === 'TOGGLE_SIDEBAR') {
    model.sidebarVisible = !model.sidebarVisible
  }
}

export const showModalAcceptor = model => proposal => {
  if (proposal?.type === 'SHOW_MODAL') {
    model.modal = {
      type: proposal.payload.modalType,
      data: proposal.payload.data
    }
  }
}

export const hideModalAcceptor = model => proposal => {
  if (proposal?.type === 'HIDE_MODAL') {
    model.modal = null
  }
}

/**
 * All acceptors combined
 */
export const acceptors = [
  // Application
  initializeAcceptor,
  loadStateAcceptor,
  appErrorAcceptor,
  recoverAcceptor,

  // Config
  updateConfigAcceptor,
  updateOptionsAcceptor,

  // Prompt/History
  startComposeAcceptor,
  updatePromptContentAcceptor,
  submitPromptAcceptor,
  receiveResponseChunkAcceptor,
  completeResponseAcceptor,
  responseErrorAcceptor,
  cancelPromptAcceptor,
  selectBranchAcceptor,
  createBranchAcceptor,
  deleteBranchAcceptor,
  selectPromptAcceptor,

  // GUI Designer
  addGuiElementAcceptor,
  updateGuiElementAcceptor,
  deleteGuiElementAcceptor,
  moveGuiElementAcceptor,
  resizeGuiElementAcceptor,
  selectGuiElementAcceptor,
  clearGuiCanvasAcceptor,

  // GUI Definitions
  loadGuiDefinitionAcceptor,
  showSaveGuiDefinitionDialogAcceptor,

  // Architecture
  updateArchitectureAcceptor,
  reviewArchitectureAcceptor,

  // UI Navigation
  switchViewAcceptor,
  toggleSidebarAcceptor,
  showModalAcceptor,
  hideModalAcceptor
]
