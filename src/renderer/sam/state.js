/**
 * Puffin SAM State
 *
 * State computes the view representation from the model.
 * It derives computed properties and determines what to render.
 *
 * Directory-based workflow - state is loaded from .puffin/
 */

import { flattenPromptTree, truncate } from '../../shared/formatters.js'
import { APP_STATES, PROMPT_STATES } from '../../shared/constants.js'

/**
 * Compute the state representation from the model
 * @param {Object} model - The current model
 * @returns {Object} - The state representation for rendering
 */
export function computeState(model) {
  return {
    // Core state
    initialized: model.initialized,
    projectPath: model.projectPath,
    projectName: model.projectName,

    // Application state
    app: computeAppState(model),

    // Config state (from .puffin/config.json)
    config: computeConfigState(model),

    // Prompt/History state
    prompt: computePromptState(model),
    history: computeHistoryState(model),

    // GUI Designer state
    designer: computeDesignerState(model),

    // Architecture state
    architecture: computeArchitectureState(model),

    // User Stories state
    userStories: model.userStories || [],

    // UI state
    ui: computeUIState(model)
  }
}

/**
 * Application state computation
 */
function computeAppState(model) {
  return {
    initialized: model.initialized,
    hasError: !!model.appError,
    error: model.appError,
    isProcessing: !!model.pendingPromptId,
    appState: model.appState || APP_STATES.INITIALIZING,
    promptState: model.promptState || PROMPT_STATES.IDLE
  }
}

/**
 * Config state computation (replaces project state)
 */
function computeConfigState(model) {
  const config = model.config || {}

  return {
    name: config.name || '',
    description: config.description || '',
    assumptions: config.assumptions || [],
    technicalArchitecture: config.technicalArchitecture || '',
    dataModel: config.dataModel || '',
    options: config.options || {}
  }
}

/**
 * Prompt state computation
 */
function computePromptState(model) {
  const isComposing = model.currentPrompt.content.length > 0
  const isProcessing = !!model.pendingPromptId
  const hasStreamingResponse = model.streamingResponse.length > 0

  return {
    isComposing,
    isProcessing,
    hasStreamingResponse,
    content: model.currentPrompt.content,
    branchId: model.currentPrompt.branchId || model.history.activeBranch,
    streamingResponse: model.streamingResponse,
    canSubmit: isComposing && !isProcessing,
    canCancel: isProcessing
  }
}

/**
 * History state computation
 */
function computeHistoryState(model) {
  const { branches, activeBranch, activePromptId } = model.history

  console.log('[SAM-DEBUG] computeHistoryState - activeBranch:', activeBranch, 'activePromptId:', activePromptId)

  // Build branch list with metadata
  const branchList = Object.entries(branches).map(([id, branch]) => ({
    id,
    name: branch.name,
    icon: branch.icon || 'folder',
    promptCount: branch.prompts.length,
    isActive: id === activeBranch
  }))

  // Get active branch prompts as flat tree
  const activeBranchData = branches[activeBranch]
  const promptTree = activeBranchData ? flattenPromptTree(activeBranchData) : []

  // Get selected prompt details
  let selectedPrompt = null
  if (activePromptId && activeBranchData) {
    selectedPrompt = activeBranchData.prompts.find(p => p.id === activePromptId)
    console.log('[SAM-DEBUG] computeHistoryState - found selectedPrompt:', selectedPrompt?.id)
    if (selectedPrompt) {
      console.log('[SAM-DEBUG] computeHistoryState - selectedPrompt.response:', selectedPrompt.response ? 'exists' : 'null')
      console.log('[SAM-DEBUG] computeHistoryState - response.content length:', selectedPrompt.response?.content?.length || 0)
      console.log('[SAM-DEBUG] computeHistoryState - response.content preview:', selectedPrompt.response?.content?.substring(0, 100) || '(empty)')
    }
  } else {
    console.log('[SAM-DEBUG] computeHistoryState - no selectedPrompt (activePromptId:', activePromptId, ', activeBranchData:', !!activeBranchData, ')')
  }

  const result = {
    branches: branchList,
    // Keep full raw history for persistence
    raw: {
      branches,
      activeBranch,
      activePromptId
    },
    activeBranch,
    activePromptId,
    promptTree: promptTree.map(p => ({
      ...p,
      preview: truncate(p.content, 50),
      hasResponse: !!p.response,
      isSelected: p.id === activePromptId
    })),
    selectedPrompt: selectedPrompt ? {
      id: selectedPrompt.id,
      content: selectedPrompt.content,
      timestamp: selectedPrompt.timestamp,
      response: selectedPrompt.response,
      hasChildren: selectedPrompt.children && selectedPrompt.children.length > 0
    } : null,
    isEmpty: promptTree.length === 0
  }

  console.log('[SAM-DEBUG] computeHistoryState - result.selectedPrompt:', result.selectedPrompt ? 'exists' : 'null')
  if (result.selectedPrompt?.response) {
    console.log('[SAM-DEBUG] computeHistoryState - result.selectedPrompt.response.content length:', result.selectedPrompt.response.content?.length || 0)
  }

  return result
}

/**
 * GUI Designer state computation
 */
function computeDesignerState(model) {
  const elements = model.guiElements || []
  const selectedId = model.selectedGuiElement

  // Build element tree (nested structure)
  const rootElements = elements.filter(e => !e.parentId)
  const buildTree = (parentId) => {
    return elements
      .filter(e => e.parentId === parentId)
      .map(e => ({
        ...e,
        isSelected: e.id === selectedId,
        children: buildTree(e.id)
      }))
  }

  const elementTree = rootElements.map(e => ({
    ...e,
    isSelected: e.id === selectedId,
    children: buildTree(e.id)
  }))

  // Get selected element details
  const selectedElement = selectedId
    ? elements.find(e => e.id === selectedId)
    : null

  return {
    elements: elementTree,
    flatElements: elements,
    selectedElement,
    hasElements: elements.length > 0,
    elementCount: elements.length
  }
}

/**
 * Architecture state computation
 */
function computeArchitectureState(model) {
  const arch = model.architecture || {}
  return {
    content: arch.content || '',
    updatedAt: arch.updatedAt,
    lastReviewAt: arch.lastReviewAt,
    hasContent: (arch.content || '').length > 0,
    wordCount: (arch.content || '').split(/\s+/).filter(w => w).length
  }
}

/**
 * UI state computation
 */
function computeUIState(model) {
  return {
    currentView: model.currentView,
    sidebarVisible: model.sidebarVisible,
    modal: model.modal,
    hasModal: !!model.modal,

    // View visibility helpers
    showConfig: model.currentView === 'config',
    showPromptEditor: model.currentView === 'prompt',
    showDesigner: model.currentView === 'designer',
    showUserStories: model.currentView === 'user-stories',
    showArchitecture: model.currentView === 'architecture',
    showCliOutput: model.currentView === 'cli-output',

    // Navigation state
    canNavigate: !model.pendingPromptId
  }
}

/**
 * Reactors (Next-Action Predicates)
 * These trigger automatic actions based on state conditions
 */
export const reactors = [
  // Future: auto-save could be a reactor
]

/**
 * Render function - called after each state transition
 * This is the entry point for updating the UI
 */
export function render(state, previousState = null) {
  // Dispatch custom event for components to listen to
  const event = new CustomEvent('puffin-state-change', {
    detail: {
      state,
      previousState,
      changed: getChangedPaths(state, previousState)
    }
  })
  document.dispatchEvent(event)
}

/**
 * Get paths that changed between states (for optimization)
 */
function getChangedPaths(current, previous) {
  if (!previous) return ['*'] // Everything changed

  const changed = []
  const check = (obj1, obj2, path = '') => {
    if (obj1 === obj2) return
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
      changed.push(path)
      return
    }
    if (obj1 === null || obj2 === null) {
      changed.push(path)
      return
    }

    const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)])
    for (const key of keys) {
      check(obj1[key], obj2[key], path ? `${path}.${key}` : key)
    }
  }

  check(current, previous)
  return changed
}
