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

    // Story Generation Tracking state
    storyGenerations: model.storyGenerations || {
      generations: [],
      implementation_journeys: [],
      currentGenerationId: null
    },

    // Story Derivation state
    storyDerivation: computeStoryDerivationState(model),

    // UI state
    ui: computeUIState(model),

    // Rerun request (for triggering prompt resubmission)
    rerunRequest: model.rerunRequest || null,

    // Activity tracking state
    activity: computeActivityState(model),

    // Pending implementation context (for Claude submission)
    _pendingImplementation: model._pendingImplementation || null,

    // Last updated story ID (for persistence tracking)
    _lastUpdatedStoryId: model._lastUpdatedStoryId || null,

    // Active Sprint state
    activeSprint: model.activeSprint || null,

    // Active Implementation Story (story-scoped auto-continue)
    activeImplementationStory: model.activeImplementationStory || null,

    // Sprint error (validation errors like story limit exceeded)
    sprintError: model.sprintError || null,

    // Sprint progress (computed)
    sprintProgress: computeSprintProgress(model),

    // Pending sprint planning (for Claude submission)
    _pendingSprintPlanning: model._pendingSprintPlanning || null,

    // Pending story implementation from sprint (for Claude submission)
    _pendingStoryImplementation: model._pendingStoryImplementation || null,

    // Sprint progress update trigger (for persistence)
    _sprintProgressUpdated: model._sprintProgressUpdated || false,

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
    }
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
  const { branches, activeBranch, activePromptId, expandedThreads } = model.history

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

  // Map prompts with expansion info
  const mappedPrompts = promptTree.map(p => ({
    ...p,
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

  // Filter out children of collapsed threads
  const visiblePrompts = mappedPrompts.filter(p => {
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
    branches: branchList,
    // Keep full raw history for persistence
    raw: {
      branches,
      activeBranch,
      activePromptId
    },
    activeBranch,
    activePromptId,
    expandedThreads: expandedThreads || {},
    promptTree: visiblePrompts,
    selectedPrompt: selectedPrompt ? {
      id: selectedPrompt.id,
      type: selectedPrompt.type || 'prompt',
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
 * Sprint Progress computation
 * Provides detailed progress tracking for each story and overall sprint
 */
function computeSprintProgress(model) {
  const sprint = model.activeSprint
  if (!sprint) {
    return null
  }

  const storyProgress = sprint.storyProgress || {}
  const backlogStories = model.userStories || []

  console.log('[SPRINT-PROGRESS-DEBUG] Computing sprint progress:', {
    sprintId: sprint.id,
    sprintStoriesCount: sprint.stories?.length,
    backlogStoriesCount: backlogStories.length,
    storyProgressKeys: Object.keys(storyProgress)
  })

  // Compute per-story progress
  const storiesWithProgress = sprint.stories.map(story => {
    const progress = storyProgress[story.id] || { branches: {}, criteriaProgress: {} }
    const branches = progress.branches || {}
    const criteriaProgress = progress.criteriaProgress || {}

    // Count branch statuses
    const branchEntries = Object.entries(branches)
    const completedBranches = branchEntries.filter(([, b]) => b.status === 'completed').length
    const inProgressBranches = branchEntries.filter(([, b]) => b.status === 'in_progress').length
    const totalBranches = branchEntries.length

    // Get acceptance criteria from backlog (source of truth) or fall back to sprint copy
    const backlogStory = backlogStories.find(bs => bs.id === story.id)
    const acceptanceCriteria = backlogStory?.acceptanceCriteria || story.acceptanceCriteria || []
    const totalCriteria = acceptanceCriteria.length
    const completedCriteria = acceptanceCriteria.filter((_, idx) =>
      criteriaProgress[idx]?.checked === true
    ).length
    const criteriaPercentage = totalCriteria > 0
      ? Math.round((completedCriteria / totalCriteria) * 100)
      : 0

    // Determine overall story status
    // Check multiple sources: sprint storyProgress, sprint story copy, and backlog story
    let storyStatus = 'pending'
    if (progress.status === 'completed' || backlogStory?.status === 'completed' || story.status === 'completed') {
      storyStatus = 'completed'
    } else if (inProgressBranches > 0 || completedBranches > 0) {
      storyStatus = 'in_progress'
    }

    console.log(`[SPRINT-PROGRESS-DEBUG] Story: "${story.title?.substring(0, 30)}" | progress.status: ${progress.status} | backlog.status: ${backlogStory?.status} | story.status: ${story.status} | FINAL: ${storyStatus}`)

    // Check for blocked state (has in_progress for too long without completion)
    const isBlocked = branchEntries.some(([, b]) => {
      if (b.status === 'in_progress' && b.startedAt) {
        // Consider blocked if in progress for more than 2 hours without activity
        const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000)
        return b.startedAt < twoHoursAgo
      }
      return false
    })

    return {
      id: story.id,
      title: story.title,
      status: storyStatus,
      isBlocked,
      branches: Object.entries(branches).map(([branchType, branchData]) => ({
        type: branchType,
        status: branchData.status,
        startedAt: branchData.startedAt,
        completedAt: branchData.completedAt,
        isStarted: !!branchData.startedAt,
        isCompleted: branchData.status === 'completed',
        isInProgress: branchData.status === 'in_progress'
      })),
      completedBranches,
      inProgressBranches,
      totalBranches,
      branchPercentage: totalBranches > 0
        ? Math.round((completedBranches / totalBranches) * 100)
        : 0,
      // Acceptance criteria progress
      acceptanceCriteria: acceptanceCriteria.map((criteria, idx) => ({
        text: criteria,
        index: idx,
        checked: criteriaProgress[idx]?.checked === true,
        checkedAt: criteriaProgress[idx]?.checkedAt || null
      })),
      totalCriteria,
      completedCriteria,
      criteriaPercentage,
      completedAt: progress.completedAt
    }
  })

  // Compute overall sprint progress
  const completedStories = storiesWithProgress.filter(s => s.status === 'completed').length
  const inProgressStories = storiesWithProgress.filter(s => s.status === 'in_progress').length
  const blockedStories = storiesWithProgress.filter(s => s.isBlocked).length
  const totalStories = storiesWithProgress.length

  const totalBranches = storiesWithProgress.reduce((sum, s) => sum + s.totalBranches, 0)
  const completedBranches = storiesWithProgress.reduce((sum, s) => sum + s.completedBranches, 0)
  const inProgressBranches = storiesWithProgress.reduce((sum, s) => sum + s.inProgressBranches, 0)

  return {
    // Sprint metadata
    sprintId: sprint.id,
    sprintStatus: sprint.status,
    isComplete: sprint.status === 'completed',
    createdAt: sprint.createdAt,
    completedAt: sprint.completedAt,

    // Story-level progress
    stories: storiesWithProgress,
    totalStories,
    completedStories,
    inProgressStories,
    blockedStories,
    storyPercentage: totalStories > 0
      ? Math.round((completedStories / totalStories) * 100)
      : 0,

    // Branch-level progress (across all stories)
    totalBranches,
    completedBranches,
    inProgressBranches,
    branchPercentage: totalBranches > 0
      ? Math.round((completedBranches / totalBranches) * 100)
      : 0,

    // Helper flags
    hasBlockedWork: blockedStories > 0,
    hasInProgressWork: inProgressStories > 0,
    allStoriesComplete: completedStories === totalStories && totalStories > 0
  }
}

/**
 * Story Derivation state computation
 */
function computeStoryDerivationState(model) {
  const derivation = model.storyDerivation || {
    status: 'idle',
    pendingStories: [],
    originalPrompt: null,
    branchId: null,
    error: null
  }

  const pendingStories = derivation.pendingStories || []
  const readyCount = pendingStories.filter(s => s.status === 'ready').length
  const pendingCount = pendingStories.filter(s => s.status === 'pending').length

  return {
    status: derivation.status,
    isDeriving: derivation.status === 'deriving',
    isReviewing: derivation.status === 'reviewing',
    isRequestingChanges: derivation.status === 'requesting-changes',
    isImplementing: derivation.status === 'implementing',
    isIdle: derivation.status === 'idle',

    pendingStories: pendingStories,
    storyCount: pendingStories.length,
    readyCount: readyCount,
    pendingCount: pendingCount,
    hasReadyStories: readyCount > 0,
    allStoriesReady: pendingStories.length > 0 && readyCount === pendingStories.length,

    originalPrompt: derivation.originalPrompt,
    branchId: derivation.branchId,
    error: derivation.error
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
