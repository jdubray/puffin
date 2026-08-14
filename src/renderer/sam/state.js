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

    // User Stories state
    userStories: model.userStories || [],

    // Story Generation Tracking state
    storyGenerations: model.storyGenerations || {
      generations: [],
      implementation_journeys: [],
      currentGenerationId: null
    },

    // UI state
    ui: computeUIState(model),

    // Rerun request (for triggering prompt resubmission)
    rerunRequest: model.rerunRequest || null,

    // Continue request (for triggering continuation prompt via next-action)
    continueRequest: model.continueRequest || null,

    // Activity tracking state
    activity: computeActivityState(model),

    // Pending implementation context (for Claude submission)
    _pendingImplementation: model._pendingImplementation || null,

    // Last updated story ID (for persistence tracking)
    _lastUpdatedStoryId: model._lastUpdatedStoryId || null,

    // Stuck detection state
    stuckDetection: model.stuckDetection || {
      isStuck: false,
      consecutiveCount: 0,
      threshold: 3,
      recentOutputs: [],
      lastAction: null,
      timestamp: null
    },

    // Debug state
    debug: model.debug || {
      lastPrompt: null,
      enabled: false
    },

    // Website Edition — Puppeteer Visual Feedback Loop (ephemeral, session-only)
    puppeteerLoop: model.puppeteerLoop || false
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

  // Return the full config object — spread all fields so nothing is lost during persistence
  return {
    ...config,
    name: config.name || '',
    description: config.description || '',
    assumptions: config.assumptions || [],
    technicalArchitecture: config.technicalArchitecture || '',
    dataModel: config.dataModel || '',
    defaultModel: config.defaultModel || 'sonnet',
    options: config.options || {},
    uxStyle: config.uxStyle || {},
    websiteEdition: config.websiteEdition || false,
    debugMode: config.debugMode || false
  }
}

/**
 * Prompt state computation
 */
// DEBUG: Track pendingPromptId changes
let _lastPendingPromptId = null

function computePromptState(model) {
  const isComposing = model.currentPrompt.content.length > 0
  const isProcessing = !!model.pendingPromptId
  const hasStreamingResponse = model.streamingResponse.length > 0

  // DEBUG: Log when pendingPromptId changes
  if (model.pendingPromptId !== _lastPendingPromptId) {
    console.log('[STATE-DEBUG] pendingPromptId changed:', {
      from: _lastPendingPromptId,
      to: model.pendingPromptId,
      isProcessing,
      activeBranch: model.history?.activeBranch
    })
    _lastPendingPromptId = model.pendingPromptId
  }

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
  const { branches, activeBranch, activePromptId, expandedThreads, threadSearchQuery } = model.history

  console.log('[SAM-DEBUG] computeHistoryState - activeBranch:', activeBranch, 'activePromptId:', activePromptId)

  // Single implicit stream: everything lives in the 'main' branch.
  const activeBranchData = branches[activeBranch] || branches.main
  const promptTree = activeBranchData ? flattenPromptTree(activeBranchData) : []

  // Create a map of parent IDs to check which prompts have children
  const parentIds = new Set()
  if (activeBranchData) {
    activeBranchData.prompts.forEach(p => {
      if (p.parentId) {
        parentIds.add(p.parentId)
      }
    })
  }

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

  // Build set of expanded parent IDs to determine which children to show
  const expandedSet = new Set(
    Object.entries(expandedThreads || {})
      .filter(([_, isExpanded]) => isExpanded)
      .map(([id, _]) => id)
  )

  // The Tasks list is scoped to the composer you're looking at: design threads
  // on the Sekkei tab, code threads everywhere else. One stream underneath —
  // this is a view filter, not a second history.
  const surfaceForView = model.currentView === 'specs' ? 'sekkei' : 'prompt'
  const surfaceOf = p => p.surface || 'prompt'

  // Map prompts with expansion info
  const mappedPrompts = promptTree.map(p => ({
    ...p,
    surface: surfaceOf(p),
    preview: truncate(p.type === 'story-thread' ? `📖 ${p.title}` : p.content, 50),
    hasResponse: !!p.response,
    isSelected: p.id === activePromptId,
    // Story thread specific fields
    isStoryThread: p.type === 'story-thread',
    isDerivation: p.type === 'derivation',
    storyStatus: p.type === 'story-thread' ? p.status : null,
    storyTitle: p.type === 'story-thread' ? p.title : null,
    // Thread expansion state
    hasChildren: parentIds.has(p.id),
    isExpanded: expandedSet.has(p.id),
    isComplete: p.isComplete || false,
    completedAt: p.completedAt || null
  }))

  // Filter out children of collapsed threads, and threads from the other surface
  const visiblePrompts = mappedPrompts.filter(p => {
    if (p.surface !== surfaceForView) return false
    // Root level prompts (no parent) are always visible
    if (!p.parentId) return true
    // Check if all ancestors are expanded
    let currentParentId = p.parentId
    while (currentParentId) {
      if (!expandedSet.has(currentParentId)) {
        return false // Parent is collapsed, hide this prompt
      }
      // Find the parent prompt to check its parent
      const parent = mappedPrompts.find(mp => mp.id === currentParentId)
      currentParentId = parent?.parentId || null
    }
    return true
  })

  const result = {
    // Keep full raw history for persistence
    raw: {
      branches,
      activeBranch,
      activePromptId
    },
    activeBranch,
    activePromptId,
    expandedThreads: expandedThreads || {},
    threadSearchQuery: threadSearchQuery || '',
    promptTree: visiblePrompts,
    selectedPrompt: selectedPrompt ? {
      id: selectedPrompt.id,
      type: selectedPrompt.type || 'prompt',
      surface: selectedPrompt.surface || 'prompt',
      workspaceId: selectedPrompt.workspaceId || null,
      content: selectedPrompt.content,
      timestamp: selectedPrompt.timestamp,
      response: selectedPrompt.response,
      hasChildren: selectedPrompt.children && selectedPrompt.children.length > 0,
      // Story thread specific fields
      isStoryThread: selectedPrompt.type === 'story-thread',
      story: selectedPrompt.story || null,
      plan: selectedPrompt.plan || null,
      storyStatus: selectedPrompt.status || null,
      sessionId: selectedPrompt.sessionId || null
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
 * UI state computation
 */
function computeUIState(model) {
  return {
    currentView: model.currentView,
    sidebarVisible: model.sidebarVisible,
    modal: model.modal,
    hasModal: !!model.modal,

    // View visibility helpers (plugins may contribute additional views like 'designer')
    showConfig: model.currentView === 'config',
    showPromptEditor: model.currentView === 'prompt',
    showUserStories: model.currentView === 'user-stories',
    showCliOutput: model.currentView === 'cli-output',

    // Navigation state
    canNavigate: !model.pendingPromptId
  }
}

/**
 * Activity tracking state computation
 */
function computeActivityState(model) {
  const activity = model.activity || {
    currentTool: null,
    activeTools: [],
    filesModified: [],
    status: 'idle'
  }

  return {
    // Current status
    status: activity.status,
    isIdle: activity.status === 'idle',
    isThinking: activity.status === 'thinking',
    isToolUse: activity.status === 'tool-use',
    isComplete: activity.status === 'complete',

    // Current tool info
    currentTool: activity.currentTool,
    currentToolName: activity.currentTool?.name || null,
    currentToolInput: activity.currentTool?.input || null,
    hasActiveTool: !!activity.currentTool,

    // Active tools (for concurrent execution)
    activeTools: activity.activeTools || [],
    activeToolCount: (activity.activeTools || []).length,

    // File modifications
    filesModified: activity.filesModified || [],
    modifiedFileCount: (activity.filesModified || []).length,
    hasModifiedFiles: (activity.filesModified || []).length > 0,

    // Derived helpers
    statusText: getActivityStatusText(activity.status, activity.currentTool)
  }
}

/**
 * Get human-readable status text
 */
function getActivityStatusText(status, currentTool) {
  switch (status) {
    case 'idle':
      return 'Idle'
    case 'thinking':
      return 'Thinking...'
    case 'tool-use':
      return currentTool?.name ? `Running ${currentTool.name}...` : 'Using tool...'
    case 'complete':
      return 'Complete'
    default:
      return 'Unknown'
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
export function render(state, previousState = null, actionType = null) {
  // Dispatch custom event for components to listen to
  const event = new CustomEvent('puffin-state-change', {
    detail: {
      state,
      previousState,
      actionType,
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
