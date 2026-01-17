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
    // Default Claude model for this project
    defaultModel: 'sonnet',
    options: {
      programmingStyle: 'HYBRID',
      testingApproach: 'TDD',
      documentationLevel: 'STANDARD',
      errorHandling: 'EXCEPTIONS',
      codeStyle: {
        naming: 'CAMEL',
        comments: 'JSDoc'
      }
    },
    uxStyle: {
      baselineCss: '',
      alignment: 'left',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '16px',
      colorPalette: {
        primary: '#6c63ff',
        secondary: '#16213e',
        accent: '#48bb78',
        background: '#ffffff',
        text: '#1a1a2e',
        error: '#f56565'
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
    activePromptId: null,
    expandedThreads: {}, // Track which threads are expanded: { promptId: true }
    threadSearchQuery: '' // Search query for filtering threads
  },

  // User stories state (from .puffin/user-stories.json)
  userStories: [],

  // Sprint state - for grouping stories into focused implementation sprints
  activeSprint: null, // { id, stories, status, promptId, createdAt }
  // Sprint statuses: 'created' | 'planning' | 'planned' | 'implementing'
  sprintError: null, // { type, message, details, timestamp } - for validation errors

  // Sprint history - list of archived sprints for viewing in backlog
  sprintHistory: [], // Array of { id, title, description, status, closedAt, storyIds, storyProgress }

  // Sprint filter - selected sprint ID for filtering backlog stories
  selectedSprintFilter: null, // Sprint ID or null for "all stories"

  // Active implementation story - tracks which story is currently being implemented
  activeImplementationStory: null, // { id, title, description, acceptanceCriteria, branchType, startedAt }

  // Stuck detection state - tracks iteration outputs to detect loops
  stuckDetection: {
    isStuck: false,
    consecutiveCount: 0,
    threshold: 3, // Number of similar iterations before triggering alert
    recentOutputs: [], // Array of { hash, summary, timestamp } - last N outputs
    lastAction: null, // 'continue' | 'modify' | 'stop' | 'dismiss' | null
    timestamp: null
  },

  // Story generation tracking state (from .puffin/story-generations.json)
  storyGenerations: {
    generations: [],
    implementation_journeys: [],
    currentGenerationId: null // ID of generation currently being reviewed
  },

  // UI Guidelines state (from .puffin/ui-guidelines.json)
  uiGuidelines: {
    guidelines: {
      layout: '',
      typography: '',
      colors: '',
      components: '',
      interactions: ''
    },
    stylesheets: [],
    designTokens: {
      colors: {},
      typography: { fontFamilies: [], fontSizes: [], fontWeights: [] },
      spacing: [],
      radii: [],
      shadows: []
    },
    componentPatterns: []
  },

  // UI state
  currentView: 'prompt', // 'config', 'prompt', 'user-stories', 'architecture', 'cli-output' (plugins may add more views)
  sidebarVisible: true,
  modal: null,

  // UI Guidelines specific UI state
  activeGuidelinesTab: 'guidelines', // 'guidelines', 'stylesheets', 'tokens', 'patterns'
  activeGuidelinesSection: 'layout', // 'layout', 'typography', 'colors', 'components', 'interactions'
  selectedStylesheet: null,
  selectedComponentPattern: null,

  // User Story Derivation state
  storyDerivation: {
    status: 'idle', // 'idle' | 'deriving' | 'reviewing' | 'requesting-changes' | 'implementing'
    pendingStories: [], // Stories being reviewed before implementation
    originalPrompt: null, // The prompt that triggered derivation
    branchId: null, // Branch context for the stories
    error: null
  },

  // Activity tracking state (for prompt status feedback)
  activity: {
    currentTool: null, // { name: string, input?: object } - currently executing tool
    activeTools: [], // Array of { id, name, startTime } for concurrent tools
    filesModified: [], // Array of { path, action, timestamp } - files changed during this prompt
    status: 'idle' // 'idle' | 'thinking' | 'tool-use' | 'complete'
  },

  // Design documents state (from docs/ directory)
  designDocuments: {
    documents: [], // Array of { filename, name, path } - available documents
    loadedDocument: null, // { filename, name, path, content } - currently loaded document
    isScanning: false,
    lastScanned: null,
    error: null
  },

  // Debug state - stores the last prompt sent to Claude CLI
  debug: {
    lastPrompt: null, // { content, branch, model, sessionId, timestamp }
    enabled: false // Whether debug mode is enabled (from config)
  },

  // Developer profile state (GitHub integration)
  developerProfile: {
    // Authentication state
    isAuthenticated: false,
    isAuthenticating: false,
    authError: null,

    // Profile information
    profile: {
      id: null,
      login: null,
      name: null,
      email: null,
      avatarUrl: null,
      company: null,
      location: null,
      bio: null,
      publicRepos: 0,
      publicGists: 0,
      followers: 0,
      following: 0,
      createdAt: null,
      updatedAt: null
    },

    // Repository data
    repositories: [],
    selectedRepository: null,

    // Activity data
    recentActivity: [],
    contributions: {
      total: 0,
      thisWeek: 0,
      thisMonth: 0
    },

    // Integration settings
    settings: {
      syncEnabled: true,
      autoFetchActivity: true,
      showPrivateRepos: false,
      activityRefreshInterval: 300000 // 5 minutes
    },

    // Cache and metadata
    lastFetched: null,
    rateLimitRemaining: null,
    rateLimitReset: null
  }
}

/**
 * Helper: Find storyIds for a prompt by traversing parent chain
 * Implementation prompts have storyIds directly; child prompts inherit from parent
 */
function findStoryIdsForPrompt(prompt, branchPrompts) {
  // Check if this prompt has storyIds directly
  if (prompt.storyIds && prompt.storyIds.length > 0) {
    return prompt.storyIds
  }
  // If it has a parent, traverse up the chain
  if (prompt.parentId) {
    const parent = branchPrompts.find(p => p.id === prompt.parentId)
    if (parent) {
      return findStoryIdsForPrompt(parent, branchPrompts)
    }
  }
  return null
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
    model.userStories = state.userStories || []
    model.activeSprint = state.activeSprint || null
    model.sprintHistory = state.sprintHistory || []
    model.storyGenerations = state.storyGenerations || model.storyGenerations
    model.uiGuidelines = state.uiGuidelines || model.uiGuidelines

    // Clear any in-progress state from previous session
    // This ensures the prompt textarea is enabled on startup
    model.pendingPromptId = null
    model.streamingResponse = ''
    model._pendingStoryImplementation = null
    model._pendingSprintPlanning = null
    model.storyDerivation = {
      status: 'idle',
      pendingStories: [],
      error: null,
      originalPrompt: null,
      branchId: null
    }

    // Reset stuck detection state to prevent stale alerts
    model.stuckDetection = {
      isStuck: false,
      consecutiveCount: 0,
      threshold: 3,
      recentOutputs: [],
      lastAction: null,
      timestamp: null
    }

    console.log('[LOAD_STATE] Cleared in-progress state to ensure prompt is enabled')

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
      title: proposal.payload.title || null,
      timestamp: proposal.payload.timestamp,
      response: null,
      children: []
    }

    model.history.branches[branchId].prompts.push(prompt)
    model.pendingPromptId = prompt.id
    console.log('[MODEL-DEBUG] submitPromptAcceptor: SET pendingPromptId =', prompt.id)
    model.streamingResponse = ''
    model.currentPrompt = { content: '', branchId: null }

    // Clear any story derivation error when submitting a new prompt
    if (model.storyDerivation) {
      model.storyDerivation.error = null
    }

    // Update parent's children array if this is a child prompt
    if (proposal.payload.parentId) {
      const parentPrompt = model.history.branches[branchId].prompts
        .find(p => p.id === proposal.payload.parentId)
      if (parentPrompt) {
        // Ensure children array exists (for older prompts that may not have it)
        if (!parentPrompt.children) {
          parentPrompt.children = []
        }
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
  // Log all proposals to see what we're getting
  if (proposal) {
    const proposalType = proposal.type || proposal.__actionName || 'UNKNOWN'
    if (proposalType === 'COMPLETE_RESPONSE' || proposalType.includes('COMPLETE')) {
      console.log('[ACCEPTOR-DEBUG] COMPLETE_RESPONSE received')
      console.log('[ACCEPTOR-DEBUG] proposal.type:', proposal.type)
      console.log('[ACCEPTOR-DEBUG] proposal.__actionName:', proposal.__actionName)
      console.log('[ACCEPTOR-DEBUG] pendingPromptId:', model.pendingPromptId)
      console.log('[ACCEPTOR-DEBUG] payload.content length:', proposal.payload?.content?.length || 0)
    }
  }

  // Check for COMPLETE_RESPONSE - handle both type and __actionName
  const isCompleteResponse = proposal?.type === 'COMPLETE_RESPONSE' || proposal?.__actionName === 'COMPLETE_RESPONSE'

  if (isCompleteResponse) {

    if (!model.pendingPromptId) {
      console.log('[ACCEPTOR-DEBUG] ERROR: No pendingPromptId! Response will NOT be saved.')
      // Still clear streamingResponse to prevent stale streaming content from showing
      model.streamingResponse = ''
      return
    }

    // Find the prompt and update its response
    let foundPrompt = false
    for (const [branchId, branch] of Object.entries(model.history.branches)) {
      const prompt = branch.prompts.find(p => p.id === model.pendingPromptId)
      if (prompt) {
        console.log('[ACCEPTOR-DEBUG] Found prompt in branch:', branchId, 'promptId:', prompt.id)

        // Strip the [Complete] keyword from the response content if present
        let responseContent = proposal.payload.content || ''
        const completionKeyword = '[Complete]'
        if (responseContent.includes(completionKeyword)) {
          console.log('[ACCEPTOR-DEBUG] Stripping [Complete] keyword from response')
          responseContent = responseContent.replace(completionKeyword, '').trim()
        }

        prompt.response = {
          content: responseContent,
          sessionId: proposal.payload.sessionId,
          cost: proposal.payload.cost,
          turns: proposal.payload.turns,
          duration: proposal.payload.duration,
          filesModified: proposal.payload.filesModified || [],
          timestamp: proposal.payload.timestamp
        }
        model.history.activePromptId = prompt.id
        foundPrompt = true

        console.log('[ACCEPTOR-DEBUG] SUCCESS: Response saved. Content length:', prompt.response.content?.length || 0)

        // Update implementation journey turn count if this is an implementation thread (US-3)
        const storyIds = findStoryIdsForPrompt(prompt, branch.prompts)
        if (storyIds && storyIds.length > 0) {
          console.log('[ACCEPTOR-DEBUG] Implementation thread detected, updating journey turn count for stories:', storyIds)
          // Find and update journeys for these stories
          storyIds.forEach(storyId => {
            const journey = model.storyGenerations.implementation_journeys.find(
              j => j.story_id === storyId && j.status === 'pending'
            )
            if (journey) {
              journey.turn_count = (journey.turn_count || 0) + 1
              console.log('[ACCEPTOR-DEBUG] Updated journey turn count:', journey.id, 'to', journey.turn_count)
            }
          })
        }
        break
      }
    }

    if (!foundPrompt) {
      console.log('[ACCEPTOR-DEBUG] ERROR: Prompt not found in any branch! pendingPromptId:', model.pendingPromptId)
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

export const rerunPromptAcceptor = model => proposal => {
  if (proposal?.type === 'RERUN_PROMPT') {
    const { promptId } = proposal.payload

    // Find the prompt in any branch
    let foundPrompt = null
    let foundBranchId = null

    for (const [branchId, branch] of Object.entries(model.history.branches)) {
      const prompt = branch.prompts.find(p => p.id === promptId)
      if (prompt) {
        foundPrompt = prompt
        foundBranchId = branchId
        break
      }
    }

    if (!foundPrompt) {
      model.appError = { message: 'Prompt not found' }
      return
    }

    // Store the rerun request for the app to handle
    model.rerunRequest = {
      promptId: foundPrompt.id,
      branchId: foundBranchId,
      content: foundPrompt.content,
      timestamp: proposal.payload.timestamp
    }

    // Clear any story derivation error
    if (model.storyDerivation) {
      model.storyDerivation.error = null
    }
  }
}

export const clearRerunRequestAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_RERUN_REQUEST') {
    model.rerunRequest = null
  }
}

export const requestContinueAcceptor = model => proposal => {
  if (proposal?.type === 'REQUEST_CONTINUE') {
    const { branchId, promptContent, parentId, timestamp } = proposal.payload

    // Store the continue request for the app to handle via next-action
    model.continueRequest = {
      branchId,
      content: promptContent,
      parentId,
      timestamp
    }
  }
}

export const clearContinueRequestAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_CONTINUE_REQUEST') {
    model.continueRequest = null
  }
}

export const selectBranchAcceptor = model => proposal => {
  if (proposal?.type === 'SELECT_BRANCH') {
    const newBranchId = proposal.payload.branchId
    if (model.history.branches[newBranchId]) {
      model.history.activeBranch = newBranchId

      // Also switch to prompt view when selecting a branch
      model.currentView = 'prompt'

      // Check if this branch has a remembered last selected prompt
      const lastSelectedPromptId = model.history.lastSelectedPromptPerBranch?.[newBranchId]
      const newBranch = model.history.branches[newBranchId]

      if (lastSelectedPromptId && newBranch.prompts.some(p => p.id === lastSelectedPromptId)) {
        // Restore the last selected prompt for this branch
        model.history.activePromptId = lastSelectedPromptId
        console.log('[SAM-DEBUG] selectBranchAcceptor: switched to branch', newBranchId, 'restored last selected prompt:', lastSelectedPromptId)
      } else if (newBranch.prompts && newBranch.prompts.length > 0) {
        // Fall back to the most recent prompt in the new branch
        const lastPrompt = newBranch.prompts[newBranch.prompts.length - 1]
        model.history.activePromptId = lastPrompt.id
        console.log('[SAM-DEBUG] selectBranchAcceptor: switched to branch', newBranchId, 'selected prompt:', lastPrompt.id)
      } else {
        // No prompts in this branch, clear the selection
        model.history.activePromptId = null
        console.log('[SAM-DEBUG] selectBranchAcceptor: switched to branch', newBranchId, 'no prompts, cleared activePromptId')
      }
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
      codeModificationAllowed: proposal.payload.codeModificationAllowed !== false,
      prompts: []
    }

    // Add to branchOrder if it exists
    if (model.history.branchOrder) {
      model.history.branchOrder.push(proposal.payload.id)
    }
  }
}

export const deleteBranchAcceptor = model => proposal => {
  if (proposal?.type === 'DELETE_BRANCH') {
    const branchId = proposal.payload.branchId
    // Don't delete default branches
    const defaultBranches = ['specifications', 'architecture', 'ui', 'backend', 'deployment', 'improvements', 'tmp']
    if (!defaultBranches.includes(branchId) && model.history.branches[branchId]) {
      delete model.history.branches[branchId]

      // Remove from branchOrder if it exists
      if (model.history.branchOrder) {
        model.history.branchOrder = model.history.branchOrder.filter(id => id !== branchId)
      }

      if (model.history.activeBranch === branchId) {
        model.history.activeBranch = 'specifications'
      }
    }
  }
}

export const reorderBranchesAcceptor = model => proposal => {
  if (proposal?.type === 'REORDER_BRANCHES') {
    const { fromIndex, toIndex } = proposal.payload

    // Get ordered branch IDs
    if (!model.history.branchOrder) {
      // Initialize branch order from current branches
      model.history.branchOrder = Object.keys(model.history.branches)
    }

    const order = [...model.history.branchOrder]
    if (fromIndex >= 0 && fromIndex < order.length && toIndex >= 0 && toIndex < order.length) {
      // Remove the branch from its original position
      const [movedBranch] = order.splice(fromIndex, 1)
      // Insert it at the new position
      order.splice(toIndex, 0, movedBranch)
      model.history.branchOrder = order
    }
  }
}

export const updateBranchSettingsAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_BRANCH_SETTINGS') {
    const { branchId, settings } = proposal.payload

    if (model.history.branches[branchId]) {
      const branch = model.history.branches[branchId]

      // Update branch properties from settings
      if (settings.name !== undefined) {
        branch.name = settings.name
      }
      if (settings.icon !== undefined) {
        branch.icon = settings.icon
      }
      if (settings.codeModificationAllowed !== undefined) {
        branch.codeModificationAllowed = settings.codeModificationAllowed
      }
      if (settings.assignedPlugins !== undefined) {
        branch.assignedPlugins = settings.assignedPlugins
      }

      console.log('[BRANCH] Updated settings for branch:', branchId, settings)
    }
  }
}

export const selectPromptAcceptor = model => proposal => {
  if (proposal?.type === 'SELECT_PROMPT') {
    const promptId = proposal.payload.promptId

    // Guard against null/undefined promptId - only accept valid selections
    // This prevents accidental clearing of the prompt view
    if (promptId === null || promptId === undefined) {
      console.warn('[SAM-DEBUG] selectPromptAcceptor: Ignoring null/undefined promptId. Current activePromptId preserved:', model.history.activePromptId)
      return
    }

    model.history.activePromptId = promptId
    // Navigate to prompt view when selecting a prompt/thread
    model.currentView = 'prompt'

    // Remember the selected prompt for this branch
    const activeBranch = model.history.activeBranch
    if (activeBranch) {
      if (!model.history.lastSelectedPromptPerBranch) {
        model.history.lastSelectedPromptPerBranch = {}
      }
      model.history.lastSelectedPromptPerBranch[activeBranch] = promptId
    }
  }
}

// Explicitly clear prompt selection (for new threads and handoffs)
export const clearPromptSelectionAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_PROMPT_SELECTION') {
    model.history.activePromptId = null
    // Also clear from the per-branch cache
    const activeBranch = model.history.activeBranch
    if (activeBranch && model.history.lastSelectedPromptPerBranch) {
      model.history.lastSelectedPromptPerBranch[activeBranch] = null
    }
    console.log('[SAM-DEBUG] clearPromptSelectionAcceptor: Cleared activePromptId')
  }
}

/**
 * Thread Expansion/Collapse Acceptors
 */

export const toggleThreadExpandedAcceptor = model => proposal => {
  if (proposal?.type === 'TOGGLE_THREAD_EXPANDED') {
    const { promptId } = proposal.payload
    // Initialize expandedThreads if not present
    if (!model.history.expandedThreads) {
      model.history.expandedThreads = {}
    }
    // Toggle the expanded state
    model.history.expandedThreads[promptId] = !model.history.expandedThreads[promptId]
  }
}

/**
 * Expand a thread all the way to the last/deepest descendant
 * This expands all nodes that have children along the path to the end
 */
export const expandThreadToEndAcceptor = model => proposal => {
  if (proposal?.type === 'EXPAND_THREAD_TO_END') {
    const { promptId } = proposal.payload

    // Initialize expandedThreads if not present
    if (!model.history.expandedThreads) {
      model.history.expandedThreads = {}
    }

    // Find the active branch
    const activeBranch = model.history.branches[model.history.activeBranch]
    if (!activeBranch || !activeBranch.prompts) return

    const prompts = activeBranch.prompts

    // Build a map of parentId -> children for efficient lookup
    const childrenMap = new Map()
    for (const p of prompts) {
      const parentId = p.parentId || null
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, [])
      }
      childrenMap.get(parentId).push(p)
    }

    // Recursively expand from the given promptId down to the deepest descendant
    const expandRecursively = (currentId) => {
      const children = childrenMap.get(currentId)
      if (children && children.length > 0) {
        // Mark this node as expanded
        model.history.expandedThreads[currentId] = true

        // Sort children by timestamp descending (newest first) and expand the first one
        // This follows the same order as the tree display
        const sortedChildren = [...children].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        expandRecursively(sortedChildren[0].id)
      }
    }

    expandRecursively(promptId)
  }
}

export const updateThreadSearchQueryAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_THREAD_SEARCH_QUERY') {
    const { query } = proposal.payload
    model.history.threadSearchQuery = query || ''
  }
}

export const markThreadCompleteAcceptor = model => proposal => {
  if (proposal?.type === 'MARK_THREAD_COMPLETE') {
    const { promptId, journeyOutcome, outcomeNotes } = proposal.payload
    // Find the prompt in any branch and mark it complete
    for (const branch of Object.values(model.history.branches)) {
      const prompt = branch.prompts.find(p => p.id === promptId)
      if (prompt) {
        prompt.isComplete = true
        prompt.completedAt = proposal.payload.timestamp
        // If it's a story thread, also update its status
        if (prompt.type === 'story-thread') {
          prompt.status = 'completed'
        }

        // Complete implementation journeys for stories in this thread (US-3)
        const storyIds = findStoryIdsForPrompt(prompt, branch.prompts)
        if (storyIds && storyIds.length > 0) {
          storyIds.forEach(storyId => {
            const journey = model.storyGenerations.implementation_journeys.find(
              j => j.story_id === storyId && j.status === 'pending'
            )
            if (journey) {
              journey.status = journeyOutcome || 'success'
              journey.outcome_notes = outcomeNotes || null
              journey.completed_at = new Date().toISOString()
              console.log('[MARK_COMPLETE] Completed journey:', journey.id, 'with status:', journey.status)
            }
          })
        }
        break
      }
    }
  }
}

export const unmarkThreadCompleteAcceptor = model => proposal => {
  if (proposal?.type === 'UNMARK_THREAD_COMPLETE') {
    const { promptId } = proposal.payload
    // Find the prompt in any branch and unmark it
    for (const branch of Object.values(model.history.branches)) {
      const prompt = branch.prompts.find(p => p.id === promptId)
      if (prompt) {
        prompt.isComplete = false
        prompt.completedAt = null
        // If it's a story thread, set status back to implementing
        if (prompt.type === 'story-thread') {
          prompt.status = 'implementing'
        }

        // Reopen implementation journeys for stories in this thread (US-3)
        const storyIds = findStoryIdsForPrompt(prompt, branch.prompts)
        if (storyIds && storyIds.length > 0) {
          storyIds.forEach(storyId => {
            // Find the most recent journey for this story (might be completed)
            const journey = model.storyGenerations.implementation_journeys.find(
              j => j.story_id === storyId && j.prompt_id === promptId
            ) || model.storyGenerations.implementation_journeys.find(
              j => j.story_id === storyId && j.status !== 'pending'
            )
            if (journey && journey.status !== 'pending') {
              journey.status = 'pending'
              journey.outcome_notes = null
              journey.completed_at = null
              console.log('[UNMARK_COMPLETE] Reopened journey:', journey.id)
            }
          })
        }
        break
      }
    }
  }
}

/**
 * User Story Acceptors
 */

export const addUserStoryAcceptor = model => proposal => {
  if (proposal?.type === 'ADD_USER_STORY') {
    // Check for duplicate by ID
    const existingById = model.userStories.find(s => s.id === proposal.payload.id)
    if (existingById) {
      console.warn(`[DUPLICATE] ADD_USER_STORY: Story with ID "${proposal.payload.id}" already exists. Skipping.`, {
        existing: existingById,
        attempted: proposal.payload
      })
      return // Skip duplicate
    }

    model.userStories.push({
      id: proposal.payload.id,
      title: proposal.payload.title,
      description: proposal.payload.description,
      acceptanceCriteria: proposal.payload.acceptanceCriteria,
      inspectionAssertions: proposal.payload.inspectionAssertions || [],
      status: proposal.payload.status,
      sourcePromptId: proposal.payload.sourcePromptId,
      createdAt: proposal.payload.createdAt
    })
  }
}

export const updateUserStoryAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_USER_STORY') {
    const storyId = proposal.payload.id
    const index = model.userStories.findIndex(s => s.id === storyId)

    console.log('[UPDATE_USER_STORY] Acceptor called:', {
      storyId,
      payloadKeys: Object.keys(proposal.payload),
      hasInspectionAssertions: !!proposal.payload.inspectionAssertions,
      assertionCount: proposal.payload.inspectionAssertions?.length || 0,
      modelStoriesCount: model.userStories?.length || 0,
      foundIndex: index
    })

    if (index !== -1) {
      model.userStories[index] = {
        ...model.userStories[index],
        ...proposal.payload
      }
      // Track which story was updated for persistence
      model._lastUpdatedStoryId = storyId

      console.log('[UPDATE_USER_STORY] Story updated in model:', {
        storyId,
        newAssertionCount: model.userStories[index].inspectionAssertions?.length || 0
      })
    } else {
      console.warn('[UPDATE_USER_STORY] Story not found in model.userStories:', storyId)
      console.warn('[UPDATE_USER_STORY] Available story IDs:', model.userStories?.map(s => s.id.substring(0, 8)))
    }
  }
}

export const deleteUserStoryAcceptor = model => proposal => {
  if (proposal?.type === 'DELETE_USER_STORY') {
    model.userStories = model.userStories.filter(s => s.id !== proposal.payload.id)
  }
}

export const loadUserStoriesAcceptor = model => proposal => {
  if (proposal?.type === 'LOAD_USER_STORIES') {
    const newStories = proposal.payload.stories || []
    const currentStories = model.userStories || []

    console.log('[LOAD_USER_STORIES] Received:', newStories.length, 'stories, current:', currentStories.length, 'stories')

    // Debug: Log stories with assertions
    const storiesWithAssertions = newStories.filter(s => s.inspectionAssertions?.length > 0)
    if (storiesWithAssertions.length > 0) {
      console.log('[LOAD_USER_STORIES] Stories with assertions:', storiesWithAssertions.map(s => ({
        id: s.id.substring(0, 8),
        title: s.title.substring(0, 30),
        assertionCount: s.inspectionAssertions?.length || 0
      })))
    }

    // SAFETY: Never wipe stories if we have existing stories and receiving empty
    // This is a defense-in-depth check - the caller should also prevent this
    if (newStories.length === 0 && currentStories.length > 0) {
      console.error('[LOAD_USER_STORIES] BLOCKED: Refusing to wipe', currentStories.length, 'stories with empty array')
      console.error('[LOAD_USER_STORIES] This may indicate a bug in the caller - stories preserved')
      console.error('[LOAD_USER_STORIES] Stack trace:', new Error().stack)
      return // Keep existing stories
    }

    model.userStories = newStories
    console.log('[LOAD_USER_STORIES] Updated model.userStories to', model.userStories.length, 'stories')
  }
}

export const loadSprintHistoryAcceptor = model => proposal => {
  if (proposal?.type === 'LOAD_SPRINT_HISTORY') {
    model.sprintHistory = proposal.payload.sprints || []
  }
}

/**
 * Sprint Filter Acceptors
 */

export const setSprintFilterAcceptor = model => proposal => {
  if (proposal?.type === 'SET_SPRINT_FILTER') {
    model.selectedSprintFilter = proposal.payload.sprintId
  }
}

export const clearSprintFilterAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_SPRINT_FILTER') {
    model.selectedSprintFilter = null
  }
}

/**
 * User Story Derivation Acceptors
 */

export const deriveUserStoriesAcceptor = model => proposal => {
  if (proposal?.type === 'DERIVE_USER_STORIES') {
    model.storyDerivation = {
      status: 'deriving',
      pendingStories: [],
      originalPrompt: proposal.payload.content,
      branchId: proposal.payload.branchId,
      error: null
    }
    // Clear the prompt input
    model.currentPrompt = { content: '', branchId: null }

    // Show the review modal immediately with loading state
    model.modal = {
      type: 'user-story-review',
      data: {}
    }
  }
}

export const receiveDerivedStoriesAcceptor = model => proposal => {
  if (proposal?.type === 'RECEIVE_DERIVED_STORIES') {
    model.storyDerivation.status = 'reviewing'
    model.storyDerivation.pendingStories = proposal.payload.stories
    model.storyDerivation.originalPrompt = proposal.payload.originalPrompt

    // Create a story generation record for tracking (US-1)
    const generationId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
    const generation = {
      id: generationId,
      user_prompt: proposal.payload.originalPrompt,
      project_context: model.config?.description || null,
      generated_stories: proposal.payload.stories.map(story => ({
        id: story.id,
        title: story.title,
        description: story.description || '',
        acceptance_criteria: story.acceptanceCriteria || [],
        user_action: 'pending',
        modification_diff: null,
        rejection_reason: null,
        backlog_story_id: null
      })),
      timestamp: new Date().toISOString(),
      model_used: model.config?.defaultModel || 'sonnet'
    }
    model.storyGenerations.generations.push(generation)
    model.storyGenerations.currentGenerationId = generationId

    // Show the review modal
    model.modal = {
      type: 'user-story-review',
      data: {}
    }
  }
}

export const markStoryReadyAcceptor = model => proposal => {
  if (proposal?.type === 'MARK_STORY_READY') {
    const storyId = proposal.payload.storyId
    const story = model.storyDerivation.pendingStories.find(s => s.id === storyId)
    if (story) {
      story.status = 'ready'

      // Track acceptance in story generations (US-2)
      const currentGenId = model.storyGenerations.currentGenerationId
      if (currentGenId) {
        const generation = model.storyGenerations.generations.find(g => g.id === currentGenId)
        if (generation) {
          const genStory = generation.generated_stories.find(s => s.id === storyId)
          if (genStory) {
            genStory.user_action = 'accepted'
          }
        }
      }
    }
  }
}

export const unmarkStoryReadyAcceptor = model => proposal => {
  if (proposal?.type === 'UNMARK_STORY_READY') {
    const storyId = proposal.payload.storyId
    const story = model.storyDerivation.pendingStories.find(s => s.id === storyId)
    if (story) {
      story.status = 'pending'

      // Reset to pending in story generations (US-2)
      const currentGenId = model.storyGenerations.currentGenerationId
      if (currentGenId) {
        const generation = model.storyGenerations.generations.find(g => g.id === currentGenId)
        if (generation) {
          const genStory = generation.generated_stories.find(s => s.id === storyId)
          if (genStory) {
            genStory.user_action = 'pending'
          }
        }
      }
    }
  }
}

export const updateDerivedStoryAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_DERIVED_STORY') {
    const storyId = proposal.payload.storyId
    const story = model.storyDerivation.pendingStories.find(s => s.id === storyId)
    if (story) {
      // Capture original values before update for diff (US-2)
      const originalTitle = story.title
      const originalDescription = story.description
      const originalCriteria = [...(story.acceptanceCriteria || [])]

      // Apply updates
      Object.assign(story, proposal.payload.updates)

      // Track modification in story generations (US-2)
      const currentGenId = model.storyGenerations.currentGenerationId
      if (currentGenId) {
        const generation = model.storyGenerations.generations.find(g => g.id === currentGenId)
        if (generation) {
          const genStory = generation.generated_stories.find(s => s.id === storyId)
          if (genStory) {
            genStory.user_action = 'modified'
            // Create a simple diff showing what changed
            const changes = []
            if (proposal.payload.updates.title && proposal.payload.updates.title !== originalTitle) {
              changes.push(`title: "${originalTitle}" -> "${proposal.payload.updates.title}"`)
            }
            if (proposal.payload.updates.description && proposal.payload.updates.description !== originalDescription) {
              changes.push('description changed')
            }
            if (proposal.payload.updates.acceptanceCriteria) {
              const newCriteria = proposal.payload.updates.acceptanceCriteria
              if (JSON.stringify(newCriteria) !== JSON.stringify(originalCriteria)) {
                changes.push(`criteria: ${originalCriteria.length} -> ${newCriteria.length} items`)
              }
            }
            genStory.modification_diff = changes.join('; ') || 'modified'
          }
        }
      }
    }
  }
}

export const deleteDerivedStoryAcceptor = model => proposal => {
  if (proposal?.type === 'DELETE_DERIVED_STORY') {
    const storyId = proposal.payload.storyId
    const rejectionReason = proposal.payload.reason || null

    // Track rejection in story generations before removing (US-2)
    const currentGenId = model.storyGenerations.currentGenerationId
    if (currentGenId) {
      const generation = model.storyGenerations.generations.find(g => g.id === currentGenId)
      if (generation) {
        const genStory = generation.generated_stories.find(s => s.id === storyId)
        if (genStory) {
          genStory.user_action = 'rejected'
          genStory.rejection_reason = rejectionReason
        }
      }
    }

    // Remove from pending stories
    model.storyDerivation.pendingStories = model.storyDerivation.pendingStories.filter(
      s => s.id !== storyId
    )
  }
}

export const requestStoryChangesAcceptor = model => proposal => {
  if (proposal?.type === 'REQUEST_STORY_CHANGES') {
    model.storyDerivation.status = 'requesting-changes'
    // The feedback will be sent via IPC, and we'll receive new stories
  }
}

export const addStoriesToBacklogAcceptor = model => proposal => {
  if (proposal?.type === 'ADD_STORIES_TO_BACKLOG') {
    const { storyIds } = proposal.payload

    // Get selected stories from pending
    const selectedStories = model.storyDerivation.pendingStories.filter(
      s => storyIds.includes(s.id)
    )

    // Add each story to the backlog (userStories) - with duplicate detection
    const sourceBranchId = model.storyDerivation.branchId || null
    selectedStories.forEach(story => {
      // Check for duplicate by ID
      const existingById = model.userStories.find(s => s.id === story.id)
      if (existingById) {
        console.warn(`[DUPLICATE] Story with ID "${story.id}" already exists in backlog. Skipping.`, {
          existing: existingById,
          attempted: story
        })
        return // Skip this story
      }

      // Check for duplicate by title
      const existingByTitle = model.userStories.find(s => s.title === story.title)
      if (existingByTitle) {
        console.warn(`[DUPLICATE] Story with title "${story.title}" already exists in backlog.`, {
          existingId: existingByTitle.id,
          attemptedId: story.id
        })
        // Still allow adding - titles can legitimately be similar
      }

      model.userStories.push({
        id: story.id,
        branchId: sourceBranchId,
        title: story.title,
        description: story.description,
        acceptanceCriteria: story.acceptanceCriteria,
        inspectionAssertions: story.inspectionAssertions || [],
        status: 'pending',
        implementedOn: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
    })

    // Add the original prompt to the branch history
    const branchId = model.storyDerivation.branchId
    const originalPrompt = model.storyDerivation.originalPrompt

    if (branchId && originalPrompt) {
      // Ensure branch exists
      if (!model.history.branches[branchId]) {
        model.history.branches[branchId] = {
          id: branchId,
          name: branchId.charAt(0).toUpperCase() + branchId.slice(1),
          prompts: []
        }
      }

      // Build response content listing the added stories
      const storyList = selectedStories.map(s => `- ${s.title}`).join('\n')
      const responseContent = `Derived ${selectedStories.length} user ${selectedStories.length === 1 ? 'story' : 'stories'} and added to backlog:\n\n${storyList}`

      // Create prompt entry with response
      const promptId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
      const prompt = {
        id: promptId,
        content: originalPrompt,
        parentId: null,
        timestamp: Date.now(),
        response: {
          content: responseContent,
          timestamp: Date.now()
        }
      }

      // Add to branch
      model.history.branches[branchId].prompts.push(prompt)
      model.history.activeBranch = branchId
      model.history.activePromptId = promptId
    }

    // Finalize story generation tracking - link backlog IDs (US-2)
    const currentGenId = model.storyGenerations.currentGenerationId
    if (currentGenId) {
      const generation = model.storyGenerations.generations.find(g => g.id === currentGenId)
      if (generation) {
        // Update each added story with its backlog ID
        selectedStories.forEach(story => {
          const genStory = generation.generated_stories.find(s => s.id === story.id)
          if (genStory) {
            genStory.backlog_story_id = story.id // Same ID used in backlog
            // Ensure user_action is 'accepted' for added stories
            if (genStory.user_action === 'pending') {
              genStory.user_action = 'accepted'
            }
          }
        })
      }
      // Clear current generation ID (finalized)
      model.storyGenerations.currentGenerationId = null
    }

    // Remove only the added stories from pendingStories (keep unselected ones)
    const remainingStories = model.storyDerivation.pendingStories.filter(
      s => !storyIds.includes(s.id)
    )

    if (remainingStories.length > 0) {
      // Keep modal open with remaining stories for user to review
      model.storyDerivation.pendingStories = remainingStories
      console.log(`[BACKLOG] Added ${selectedStories.length} stories. ${remainingStories.length} remaining for review.`)
    } else {
      // All stories processed - reset derivation state and close modal
      model.storyDerivation.status = 'idle'
      model.storyDerivation.pendingStories = []
      model.storyDerivation.originalPrompt = null
      model.storyDerivation.branchId = null
      model.modal = null
    }
  }
}

export const cancelStoryReviewAcceptor = model => proposal => {
  if (proposal?.type === 'CANCEL_STORY_REVIEW') {
    console.log('[CANCEL_STORY_REVIEW] Acceptor called - cancelling story review')
    console.log('[CANCEL_STORY_REVIEW] Stack trace:', new Error().stack)
    model.storyDerivation = {
      status: 'idle',
      pendingStories: [],
      originalPrompt: null,
      branchId: null,
      error: null
    }
    model.modal = null
  }
}

export const storyDerivationErrorAcceptor = model => proposal => {
  if (proposal?.type === 'STORY_DERIVATION_ERROR') {
    // Restore the original prompt so user doesn't lose their work
    if (model.storyDerivation.originalPrompt) {
      model.currentPrompt = {
        content: model.storyDerivation.originalPrompt,
        branchId: model.storyDerivation.branchId
      }
    }

    model.storyDerivation.status = 'idle'
    model.storyDerivation.error = proposal.payload.error
    model.appError = {
      message: `Story derivation failed: ${proposal.payload.error}`,
      timestamp: proposal.payload.timestamp
    }
  }
}


/**
 * Build UI branch context with design tokens and guidelines
 */
function buildUiBranchContext(model) {
  const guidelines = model.uiGuidelines
  if (!guidelines) return ''

  let context = '\n**UI Implementation Context:**\n'
  context += 'This is a UI-focused implementation. Please follow these guidelines:\n\n'

  // Add design tokens if available
  if (guidelines.designTokens) {
    const tokens = guidelines.designTokens
    if (tokens.colors && Object.keys(tokens.colors).length > 0) {
      context += '**Color Tokens:**\n'
      for (const [name, token] of Object.entries(tokens.colors)) {
        context += `- ${name}: ${token.value}\n`
      }
      context += '\n'
    }
    if (tokens.fontFamilies && tokens.fontFamilies.length > 0) {
      context += '**Font Families:**\n'
      tokens.fontFamilies.forEach(f => {
        context += `- ${f.name}: ${f.value}\n`
      })
      context += '\n'
    }
    if (tokens.spacing && tokens.spacing.length > 0) {
      context += '**Spacing Scale:**\n'
      tokens.spacing.forEach(s => {
        context += `- ${s.name}: ${s.value}\n`
      })
      context += '\n'
    }
  }

  // Add component patterns if available
  if (guidelines.componentPatterns && guidelines.componentPatterns.length > 0) {
    context += '**Existing Component Patterns:**\n'
    guidelines.componentPatterns.forEach(p => {
      context += `- ${p.name}: ${p.description || ''}\n`
    })
    context += '\n'
  }

  // Add general guidelines
  if (guidelines.guidelines) {
    const g = guidelines.guidelines
    if (g.components) {
      context += '**Component Guidelines:**\n' + g.components + '\n\n'
    }
    if (g.interactions) {
      context += '**Interaction Guidelines:**\n' + g.interactions + '\n\n'
    }
  }

  return context
}

/**
 * Build architecture branch context
 */
function buildArchitectureBranchContext(model) {
  let context = '\n**Architecture Implementation Context:**\n'
  context += 'This is an architecture-focused implementation. Consider:\n'
  context += '- System design and component boundaries\n'
  context += '- Data flow and state management patterns\n'
  context += '- API contracts and interfaces\n'
  context += '- Scalability and maintainability\n\n'

  if (model.architecture?.content) {
    context += '**Current Architecture:**\n'
    context += model.architecture.content.substring(0, 2000) + '\n\n'
  }

  return context
}

/**
 * Build backend branch context
 */
function buildBackendBranchContext(model) {
  let context = '\n**Backend Implementation Context:**\n'
  context += 'This is a backend-focused implementation. Consider:\n'
  context += '- API design and REST/GraphQL conventions\n'
  context += '- Data persistence and database patterns\n'
  context += '- Error handling and validation\n'
  context += '- Security and authentication\n\n'

  return context
}

/**
 * Activity Tracking Acceptors
 */

export const setCurrentToolAcceptor = model => proposal => {
  if (proposal?.type === 'SET_CURRENT_TOOL') {
    const { name, input } = proposal.payload
    model.activity.currentTool = { name, input }
    model.activity.status = 'tool-use'
  }
}

export const clearCurrentToolAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_CURRENT_TOOL') {
    model.activity.currentTool = null
    // Only set to thinking if there are no active tools
    if (model.activity.activeTools.length === 0) {
      model.activity.status = 'thinking'
    }
  }
}

export const addModifiedFileAcceptor = model => proposal => {
  if (proposal?.type === 'ADD_MODIFIED_FILE') {
    const { filePath, action, timestamp } = proposal.payload
    // Check if file is already tracked
    const existingIndex = model.activity.filesModified.findIndex(f => f.path === filePath)
    if (existingIndex === -1) {
      model.activity.filesModified.push({
        path: filePath,
        action,
        timestamp
      })
    } else {
      // Update existing entry
      model.activity.filesModified[existingIndex].action = action
      model.activity.filesModified[existingIndex].timestamp = timestamp
    }
  }
}

export const clearModifiedFilesAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_MODIFIED_FILES') {
    model.activity.filesModified = []
  }
}

export const setActivityStatusAcceptor = model => proposal => {
  if (proposal?.type === 'SET_ACTIVITY_STATUS') {
    model.activity.status = proposal.payload.status
  }
}

export const updateActivityStatusAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_ACTIVITY_STATUS') {
    model.activity.status = proposal.payload.status
  }
}

export const toolStartAcceptor = model => proposal => {
  if (proposal?.type === 'TOOL_START') {
    const { id, name, input } = proposal.payload
    model.activity.currentTool = { name, input }
    model.activity.status = 'tool-use'
    model.activity.activeTools.push({
      id,
      name,
      input, // Store input so we can extract file path when tool completes
      startTime: Date.now()
    })
  }
}

export const toolEndAcceptor = model => proposal => {
  if (proposal?.type === 'TOOL_END') {
    const { id, filePath, action } = proposal.payload

    // Remove from active tools
    model.activity.activeTools = model.activity.activeTools.filter(t => t.id !== id)

    // Track file modification if applicable
    if (filePath && action) {
      // Check if we already tracked this file
      const existingIndex = model.activity.filesModified.findIndex(f => f.path === filePath)
      if (existingIndex === -1) {
        model.activity.filesModified.push({
          path: filePath,
          action, // 'read', 'write', 'edit'
          timestamp: Date.now()
        })
      } else {
        // Update existing entry with latest action
        model.activity.filesModified[existingIndex].action = action
        model.activity.filesModified[existingIndex].timestamp = Date.now()
      }
    }

    // Update current tool status
    if (model.activity.activeTools.length === 0) {
      model.activity.currentTool = null
      model.activity.status = 'thinking'
    } else {
      // Show the most recent active tool
      const latestTool = model.activity.activeTools[model.activity.activeTools.length - 1]
      model.activity.currentTool = { name: latestTool.name }
    }
  }
}

export const clearActivityAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_ACTIVITY') {
    model.activity = {
      currentTool: null,
      activeTools: [],
      filesModified: [],
      status: 'idle'
    }
  }
}

/**
 * Developer Profile Acceptors
 */

export const startGithubAuthAcceptor = model => proposal => {
  if (proposal?.type === 'START_GITHUB_AUTH') {
    model.developerProfile.isAuthenticating = true
    model.developerProfile.authError = null
  }
}

export const githubAuthSuccessAcceptor = model => proposal => {
  if (proposal?.type === 'GITHUB_AUTH_SUCCESS') {
    const { profile } = proposal.payload
    model.developerProfile.isAuthenticated = true
    model.developerProfile.isAuthenticating = false
    model.developerProfile.authError = null
    model.developerProfile.profile = {
      id: profile.id,
      login: profile.login,
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatar_url,
      company: profile.company,
      location: profile.location,
      bio: profile.bio,
      publicRepos: profile.public_repos,
      publicGists: profile.public_gists,
      followers: profile.followers,
      following: profile.following,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at
    }
    model.developerProfile.lastFetched = Date.now()
  }
}

export const githubAuthErrorAcceptor = model => proposal => {
  if (proposal?.type === 'GITHUB_AUTH_ERROR') {
    model.developerProfile.isAuthenticated = false
    model.developerProfile.isAuthenticating = false
    model.developerProfile.authError = proposal.payload.error
  }
}

export const githubLogoutAcceptor = model => proposal => {
  if (proposal?.type === 'GITHUB_LOGOUT') {
    model.developerProfile = {
      isAuthenticated: false,
      isAuthenticating: false,
      authError: null,
      profile: {
        id: null,
        login: null,
        name: null,
        email: null,
        avatarUrl: null,
        company: null,
        location: null,
        bio: null,
        publicRepos: 0,
        publicGists: 0,
        followers: 0,
        following: 0,
        createdAt: null,
        updatedAt: null
      },
      repositories: [],
      selectedRepository: null,
      recentActivity: [],
      contributions: {
        total: 0,
        thisWeek: 0,
        thisMonth: 0
      },
      settings: model.developerProfile.settings,
      lastFetched: null,
      rateLimitRemaining: null,
      rateLimitReset: null
    }
  }
}

export const loadGithubRepositoriesAcceptor = model => proposal => {
  if (proposal?.type === 'LOAD_GITHUB_REPOSITORIES') {
    model.developerProfile.repositories = proposal.payload.repositories.map(repo => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      htmlUrl: repo.html_url,
      language: repo.language,
      stargazersCount: repo.stargazers_count,
      forksCount: repo.forks_count,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at
    }))
    model.developerProfile.lastFetched = Date.now()
  }
}

export const selectGithubRepositoryAcceptor = model => proposal => {
  if (proposal?.type === 'SELECT_GITHUB_REPOSITORY') {
    model.developerProfile.selectedRepository = proposal.payload.repositoryId
  }
}

export const loadGithubActivityAcceptor = model => proposal => {
  if (proposal?.type === 'LOAD_GITHUB_ACTIVITY') {
    model.developerProfile.recentActivity = proposal.payload.events.map(event => ({
      id: event.id,
      type: event.type,
      repo: event.repo?.name,
      createdAt: event.created_at,
      payload: {
        action: event.payload?.action,
        ref: event.payload?.ref,
        refType: event.payload?.ref_type,
        commits: event.payload?.commits?.length || 0
      }
    }))
    model.developerProfile.lastFetched = Date.now()
  }
}

export const updateGithubContributionsAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_GITHUB_CONTRIBUTIONS') {
    model.developerProfile.contributions = {
      total: proposal.payload.total || 0,
      thisWeek: proposal.payload.thisWeek || 0,
      thisMonth: proposal.payload.thisMonth || 0
    }
  }
}

export const updateGithubSettingsAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_GITHUB_SETTINGS') {
    model.developerProfile.settings = {
      ...model.developerProfile.settings,
      ...proposal.payload
    }
  }
}

export const updateGithubRateLimitAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_GITHUB_RATE_LIMIT') {
    model.developerProfile.rateLimitRemaining = proposal.payload.remaining
    model.developerProfile.rateLimitReset = proposal.payload.reset
  }
}

export const loadDeveloperProfileAcceptor = model => proposal => {
  if (proposal?.type === 'LOAD_DEVELOPER_PROFILE') {
    const { profile } = proposal.payload
    if (profile) {
      model.developerProfile = {
        ...model.developerProfile,
        ...profile,
        isAuthenticated: !!profile.profile?.id
      }
    }
  }
}

/**
 * Debug Acceptors
 * For storing and displaying prompts sent to Claude CLI
 */

export const storeDebugPromptAcceptor = model => proposal => {
  if (proposal?.type === 'STORE_DEBUG_PROMPT') {
    model.debug.lastPrompt = {
      content: proposal.payload.content,
      branch: proposal.payload.branch,
      model: proposal.payload.model,
      sessionId: proposal.payload.sessionId,
      timestamp: proposal.payload.timestamp
    }
  }
}

export const clearDebugPromptAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_DEBUG_PROMPT') {
    model.debug.lastPrompt = null
  }
}

export const setDebugModeAcceptor = model => proposal => {
  if (proposal?.type === 'SET_DEBUG_MODE') {
    model.debug.enabled = proposal.payload.enabled
  }
}

/**
 * Handoff Acceptors
 * For context handoff between threads
 */

export const showHandoffReviewAcceptor = model => proposal => {
  if (proposal?.type === 'SHOW_HANDOFF_REVIEW') {
    // Generate handoff summary from current thread context
    const activePromptId = model.history.activePromptId
    const activeBranch = model.history.activeBranch
    const branch = model.history.branches[activeBranch]

    let sourceThread = null
    let summary = ''

    if (activePromptId && branch) {
      sourceThread = branch.prompts.find(p => p.id === activePromptId)
      if (sourceThread) {
        // Build summary from thread content and response
        summary = buildHandoffSummary(sourceThread, branch, model)
      }
    }

    model.modal = {
      type: 'handoff-review',
      data: {
        sourceThreadId: activePromptId,
        sourceThreadName: sourceThread?.title || truncateText(sourceThread?.content, 50) || 'Current Thread',
        sourceBranch: activeBranch,
        summary: summary,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    }
  }
}

export const updateHandoffSummaryAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_HANDOFF_SUMMARY') {
    if (model.modal?.type === 'handoff-review') {
      model.modal.data.summary = proposal.payload.summary
      model.modal.data.updatedAt = proposal.payload.timestamp
    }
  }
}

export const completeHandoffAcceptor = model => proposal => {
  if (proposal?.type === 'COMPLETE_HANDOFF') {
    const handoffData = model.modal?.data
    if (!handoffData) return

    // Store the handoff for the new thread to receive
    if (!model.handoffs) {
      model.handoffs = []
    }

    const handoff = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      sourceThreadId: handoffData.sourceThreadId,
      sourceThreadName: handoffData.sourceThreadName,
      sourceBranch: handoffData.sourceBranch,
      summary: handoffData.summary,
      createdAt: handoffData.createdAt,
      updatedAt: handoffData.updatedAt,
      status: 'pending',
      receivingThreadId: null
    }

    model.handoffs.push(handoff)

    // Close the modal
    model.modal = null
  }
}

export const cancelHandoffAcceptor = model => proposal => {
  if (proposal?.type === 'CANCEL_HANDOFF') {
    model.modal = null
  }
}

export const deleteHandoffAcceptor = model => proposal => {
  if (proposal?.type === 'DELETE_HANDOFF') {
    if (model.handoffs) {
      model.handoffs = model.handoffs.filter(h => h.id !== proposal.payload.handoffId)
    }
  }
}

/**
 * Set handoff context for a branch - persisted in history
 * This allows the handoff summary to survive app restarts
 */
export const setBranchHandoffContextAcceptor = model => proposal => {
  if (proposal?.type === 'SET_BRANCH_HANDOFF_CONTEXT') {
    const { branchId, handoffContext } = proposal.payload

    if (model.history.branches[branchId]) {
      model.history.branches[branchId].handoffContext = handoffContext
      console.log('[HANDOFF] Stored handoff context in branch:', branchId)
    }
  }
}

/**
 * Clear handoff context for a branch
 */
export const clearBranchHandoffContextAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_BRANCH_HANDOFF_CONTEXT') {
    const { branchId } = proposal.payload

    if (model.history.branches[branchId]) {
      delete model.history.branches[branchId].handoffContext
      console.log('[HANDOFF] Cleared handoff context from branch:', branchId)
    }
  }
}

/**
 * Sprint Acceptors
 * Handle sprint creation, planning, and management
 */

// Create a sprint from selected stories
export const createSprintAcceptor = model => proposal => {
  if (proposal?.type === 'CREATE_SPRINT') {
    const { stories, timestamp } = proposal.payload

    // Deduplicate stories by ID
    const seenIds = new Set()
    const uniqueStories = []
    stories.forEach(story => {
      if (seenIds.has(story.id)) {
        console.warn(`[SPRINT DUPLICATE] Story with ID "${story.id}" appears multiple times. Skipping duplicate.`, {
          title: story.title,
          id: story.id
        })
        return
      }
      seenIds.add(story.id)
      uniqueStories.push(story)
    })

    // Log if duplicates were found
    if (uniqueStories.length !== stories.length) {
      console.warn(`[SPRINT] Removed ${stories.length - uniqueStories.length} duplicate stories. Original: ${stories.length}, Unique: ${uniqueStories.length}`)
    }

    // Clear any previous sprint error
    model.sprintError = null

    // Generate sprint ID
    const sprintId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9)

    // Update story status to in-progress in both the sprint copy and the backlog
    const sprintStories = uniqueStories.map(story => ({
      ...story,
      status: 'in-progress',
      updatedAt: timestamp
    }))

    // Also update the stories in the userStories array (backlog)
    sprintStories.forEach(sprintStory => {
      const backlogStory = model.userStories.find(s => s.id === sprintStory.id)
      if (backlogStory) {
        backlogStory.status = 'in-progress'
        backlogStory.updatedAt = timestamp
      }
    })

    // Generate sprint title from stories
    // Use first story title, or date-based fallback
    let sprintTitle
    if (sprintStories.length === 1) {
      sprintTitle = sprintStories[0].title
    } else if (sprintStories.length > 1) {
      sprintTitle = `${sprintStories[0].title} (+${sprintStories.length - 1} more)`
    } else {
      const date = new Date(timestamp)
      sprintTitle = `Sprint ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    }

    // Create the sprint with deduplicated stories and title
    model.activeSprint = {
      id: sprintId,
      title: sprintTitle,
      stories: sprintStories,
      status: 'created', // 'created' | 'planning' | 'planned' | 'implementing'
      storyProgress: {}, // Initialize empty story progress
      promptId: null,
      plan: null,
      createdAt: timestamp
    }

    // Switch to prompt view
    model.currentView = 'prompt'
  }
}

// Start sprint planning - builds and submits planning prompt
export const startSprintPlanningAcceptor = model => proposal => {
  if (proposal?.type === 'START_SPRINT_PLANNING') {
    if (!model.activeSprint) return

    const sprint = model.activeSprint
    const stories = sprint.stories

    // Update sprint status to planning
    sprint.status = 'planning'

    // Build planning prompt with all story context (including IDs for order tracking)
    const storyDescriptions = stories.map((story, i) => {
      let desc = `### Story ${i + 1}: ${story.title}\n`
      desc += `**Story ID:** \`${story.id}\`\n`
      if (story.description) {
        desc += `${story.description}\n`
      }
      if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
        desc += `\n**Acceptance Criteria:**\n`
        desc += story.acceptanceCriteria.map((c, idx) => `${idx + 1}. ${c}`).join('\n')
      }
      return desc
    }).join('\n\n')

    // Build story ID reference list for the order/assignment outputs
    const storyIdList = stories.map(s => `- \`${s.id}\`: ${s.title}`).join('\n')

    const planningPrompt = `## Sprint Planning Request

**IMPORTANT: This is a PLANNING ONLY request. Do NOT make any code changes, create files, or modify the codebase. Only analyze and produce a written plan.**

Please create a detailed implementation plan for the following user stories:

${storyDescriptions}

---

**Planning Requirements:**

1. **Architecture Analysis**: Analyze how these stories fit together and identify shared components or dependencies
2. **Implementation Order**: Recommend the optimal order to implement these stories
3. **Technical Approach**: For each story, outline the key technical decisions and approach
4. **File Changes**: Identify the main files that will need to be created or modified
5. **Risk Assessment**: Note any potential challenges or risks
6. **Estimated Complexity**: Rate each story as Low/Medium/High complexity
7. **Open Questions**: List any clarifications needed before implementation

---

## Implementation Order & Branch Assignment Analysis

After completing the implementation plans above, provide the following structured outputs for automated orchestration:

### Story Reference (for your convenience):
${storyIdList}

### Required Outputs:

**1. Implementation Order** - Analyze dependencies between stories and determine the optimal implementation sequence. Consider:
- Dependencies (implement prerequisites first)
- Complexity progression (simpler stories first when no dependencies)
- Branch grouping (cluster UI stories together, Backend stories together)

Output the recommended order as a single line:
\`\`\`
IMPLEMENTATION_ORDER: id1, id2, id3, ...
\`\`\`

**2. Branch Assignments** - For each story, determine the appropriate implementation branch:
- **UI**: Visual components, styling, user interactions, frontend-only changes
- **Backend**: Data processing, APIs, business logic, database changes
- **Fullstack**: Stories requiring both UI and backend changes
- **Plugin**: Extensions to the plugin system

Output assignments as a single line:
\`\`\`
BRANCH_ASSIGNMENTS: id1=ui, id2=backend, id3=fullstack, ...
\`\`\`

---

**Remember: Do NOT execute any tools that modify files. This is analysis and planning only.**

Please provide a comprehensive plan that I can review before starting implementation.`

    // Get the current branch
    const branchId = model.history.activeBranch || 'specifications'

    // Ensure branch exists
    if (!model.history.branches[branchId]) {
      model.history.branches[branchId] = {
        id: branchId,
        name: branchId.charAt(0).toUpperCase() + branchId.slice(1),
        prompts: []
      }
    }

    // Create prompt entry
    const promptId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
    const prompt = {
      id: promptId,
      content: planningPrompt,
      parentId: null,
      timestamp: Date.now(),
      response: null,
      storyIds: stories.map(s => s.id)
    }

    // Add to branch
    model.history.branches[branchId].prompts.push(prompt)

    // Set as active prompt
    model.history.activePromptId = promptId

    // Set pending prompt for streaming
    model.pendingPromptId = promptId
    model.streamingResponse = ''

    // Update sprint with prompt reference
    sprint.promptId = promptId

    // Store for IPC submission
    model._pendingSprintPlanning = {
      promptId,
      promptContent: planningPrompt,
      branchId,
      storyIds: stories.map(s => s.id)
    }
  }
}

// Clear the active sprint
export const clearSprintAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_SPRINT') {
    const sprint = model.activeSprint
    if (!sprint) return

    const timestamp = Date.now()
    const storyProgress = sprint.storyProgress || {}
    const completedStoryIds = []
    const resetToPendingStoryIds = []

    // Process stories in storyProgress
    for (const [storyId, progress] of Object.entries(storyProgress)) {
      const userStory = model.userStories?.find(s => s.id === storyId)
      if (!userStory) continue

      if (progress?.status === 'completed') {
        // Completed - sync status to backlog
        if (userStory.status !== 'completed') {
          userStory.status = 'completed'
          userStory.updatedAt = timestamp
          console.log('[SPRINT-CLEAR] Synced completed status for story:', storyId)
        }
        completedStoryIds.push(storyId)
      } else {
        // Not completed - reset to pending so it can be reassigned
        if (userStory.status === 'in-progress') {
          userStory.status = 'pending'
          userStory.updatedAt = timestamp
          console.log('[SPRINT-CLEAR] Reset in-progress story to pending:', storyId)
          resetToPendingStoryIds.push(storyId)
        }
      }
    }

    // Also reset stories not in storyProgress (never started)
    for (const sprintStory of sprint.stories || []) {
      if (!storyProgress[sprintStory.id]) {
        const userStory = model.userStories?.find(s => s.id === sprintStory.id)
        if (userStory?.status === 'in-progress') {
          userStory.status = 'pending'
          userStory.updatedAt = timestamp
          console.log('[SPRINT-CLEAR] Reset never-started story to pending:', sprintStory.id)
          resetToPendingStoryIds.push(sprintStory.id)
        }
      }
    }

    // Store sprint for archival before clearing (picked up by state-persistence.js)
    model._sprintToArchive = {
      ...sprint,
      closedAt: timestamp
    }

    // Track which stories need to be synced for persistence
    model._completedStoryIdsToSync = completedStoryIds
    model._resetToPendingStoryIds = resetToPendingStoryIds

    // Clear the active sprint
    model.activeSprint = null

    // Also clear the active implementation story when sprint is cleared
    model.activeImplementationStory = null
  }
}

// Clear the active sprint with title and description for history
export const clearSprintWithDetailsAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_SPRINT_WITH_DETAILS') {
    const sprint = model.activeSprint
    if (!sprint) return

    console.log('[CLEAR_SPRINT] Starting sprint close. model.userStories count:', model.userStories?.length || 0)
    console.log('[CLEAR_SPRINT] Sprint stories:', sprint.stories?.length || 0, 'Story IDs:', sprint.stories?.map(s => s.id))

    const { title, description, timestamp } = proposal.payload
    const storyProgress = sprint.storyProgress || {}
    const completedStoryIds = []
    const resetToPendingStoryIds = []

    // Process stories in storyProgress
    for (const [storyId, progress] of Object.entries(storyProgress)) {
      const userStory = model.userStories?.find(s => s.id === storyId)
      if (!userStory) continue

      if (progress?.status === 'completed') {
        // Completed - sync status to backlog
        if (userStory.status !== 'completed') {
          userStory.status = 'completed'
          userStory.updatedAt = timestamp
        }
        completedStoryIds.push(storyId)
      } else {
        // Not completed - reset to pending so it can be reassigned
        if (userStory.status === 'in-progress') {
          userStory.status = 'pending'
          userStory.updatedAt = timestamp
          resetToPendingStoryIds.push(storyId)
        }
      }
    }

    // Also reset stories not in storyProgress (never started)
    for (const sprintStory of sprint.stories || []) {
      if (!storyProgress[sprintStory.id]) {
        const userStory = model.userStories?.find(s => s.id === sprintStory.id)
        if (userStory?.status === 'in-progress') {
          userStory.status = 'pending'
          userStory.updatedAt = timestamp
          resetToPendingStoryIds.push(sprintStory.id)
        }
      }
    }

    // Store sprint for archival with title and description
    model._sprintToArchive = {
      ...sprint,
      title: title || `Sprint ${new Date(timestamp).toLocaleDateString()}`,
      description: description || '',
      closedAt: timestamp
    }

    // Track which stories need to be synced for persistence
    model._completedStoryIdsToSync = completedStoryIds
    model._resetToPendingStoryIds = resetToPendingStoryIds

    // Clear the active sprint
    model.activeSprint = null

    // Also clear the active implementation story when sprint is cleared
    model.activeImplementationStory = null

    console.log('[CLEAR_SPRINT] Sprint close complete. model.userStories count:', model.userStories?.length || 0)
    console.log('[CLEAR_SPRINT] Completed stories:', completedStoryIds.length, 'Reset to pending:', resetToPendingStoryIds.length)
  }
}

// Delete sprint without archiving (for zero-progress sprints)
// Returns ALL stories to pending status, does not archive to history
export const deleteSprintAcceptor = model => proposal => {
  if (proposal?.type === 'DELETE_SPRINT') {
    const sprint = model.activeSprint
    if (!sprint) return

    const { timestamp } = proposal.payload

    console.log('[DELETE_SPRINT] Starting sprint deletion. Sprint ID:', sprint.id)
    console.log('[DELETE_SPRINT] Sprint stories:', sprint.stories?.length || 0)

    // Get all story IDs from the sprint
    const storyIdsToReset = sprint.stories?.map(s => s.id) || []

    // Reset ALL stories to pending (regardless of their current status)
    for (const storyId of storyIdsToReset) {
      const userStory = model.userStories?.find(s => s.id === storyId)
      if (userStory) {
        userStory.status = 'pending'
        userStory.updatedAt = timestamp
      }
    }

    // Track sprint for deletion (NOT archival)
    model._sprintToDelete = sprint.id
    model._resetToPendingStoryIds = storyIdsToReset

    // Clear the active sprint
    model.activeSprint = null

    // Also clear the active implementation story
    model.activeImplementationStory = null

    console.log('[DELETE_SPRINT] Sprint deletion complete. Stories reset to pending:', storyIdsToReset.length)
  }
}

// Approve the sprint plan - shows implementation mode selection modal
export const approvePlanAcceptor = model => proposal => {
  if (proposal?.type === 'APPROVE_PLAN') {
    if (model.activeSprint) {
      // Store approval timestamp but don't transition yet
      // Show modal to let user choose implementation mode
      model.activeSprint = {
        ...model.activeSprint,
        planApprovedAt: proposal.payload.timestamp
      }
      // Show implementation mode selection modal
      model.modal = {
        type: 'implementation-mode-selection',
        data: {}
      }
    }
  }
}

// Valid implementation modes
const VALID_IMPLEMENTATION_MODES = ['automated', 'human']

// Orchestration status constants
export const OrchestrationStatus = {
  IDLE: 'idle',
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  COMPLETE: 'complete'
}

// Orchestration phase constants
export const OrchestrationPhase = {
  IMPLEMENTATION: 'implementation',
  REVIEW: 'review',
  BUGFIX: 'bugfix',
  COMPLETE: 'complete'
}

// Finding status constants
export const FindingStatus = {
  PENDING: 'pending',
  FIXING: 'fixing',
  FIXED: 'fixed',
  WONT_FIX: 'wont_fix'
}

// Select implementation mode (automated or human-controlled)
export const selectImplementationModeAcceptor = model => proposal => {
  if (proposal?.type === 'SELECT_IMPLEMENTATION_MODE') {
    if (model.activeSprint) {
      const { mode, timestamp } = proposal.payload

      // Validate mode is one of the expected values
      if (!VALID_IMPLEMENTATION_MODES.includes(mode)) {
        console.error('[SPRINT] Invalid implementation mode:', mode)
        return
      }

      model.activeSprint = {
        ...model.activeSprint,
        implementationMode: mode,  // 'automated' | 'human'
        implementationModeSelectedAt: timestamp
      }
      console.log('[SPRINT] Implementation mode selected:', mode)

      if (mode === 'automated') {
        // For automated mode, show orchestration plan modal for review
        // Don't transition to in-progress yet - wait for user to confirm start
        // Determine story order from implementationOrder (parsed from plan) or story list
        const storyOrder = model.activeSprint.implementationOrder ||
          model.activeSprint.stories?.map(s => s.id) || []

        model.activeSprint.orchestration = {
          status: OrchestrationStatus.PENDING,  // Will become 'running' when user confirms start
          currentStoryId: null,
          completedStories: [],
          storyOrder,
          incidents: [],
          phase: OrchestrationPhase.IMPLEMENTATION
        }
        // Show orchestration plan modal
        model.modal = {
          visible: true,
          type: 'orchestration-plan',
          data: {}
        }
      } else {
        // Human-controlled mode - transition immediately to in-progress
        model.activeSprint.status = 'in-progress'
      }
    }
  }
}

// Start automated implementation after user reviews orchestration plan
export const startAutomatedImplementationAcceptor = model => proposal => {
  if (proposal?.type === 'START_AUTOMATED_IMPLEMENTATION') {
    if (model.activeSprint && model.activeSprint.implementationMode === 'automated') {
      const { timestamp } = proposal.payload

      // Transition sprint to in-progress
      model.activeSprint.status = 'in-progress'
      model.activeSprint.automationStartedAt = timestamp

      // Update orchestration status to running
      if (model.activeSprint.orchestration) {
        model.activeSprint.orchestration.status = OrchestrationStatus.RUNNING
        model.activeSprint.orchestration.startedAt = timestamp
      }

      console.log('[SPRINT] Automated implementation started')
    }
  }
}

// Orchestration story started - marks the current story being implemented
export const orchestrationStoryStartedAcceptor = model => proposal => {
  console.log('[ORCHESTRATION-ACCEPTOR] orchestrationStoryStartedAcceptor called, proposal type:', proposal?.type)
  if (proposal?.type === 'ORCHESTRATION_STORY_STARTED') {
    console.log('[ORCHESTRATION-ACCEPTOR] ORCHESTRATION_STORY_STARTED detected, payload:', proposal.payload)
    console.log('[ORCHESTRATION-ACCEPTOR] activeSprint exists:', !!model.activeSprint)
    console.log('[ORCHESTRATION-ACCEPTOR] orchestration exists:', !!model.activeSprint?.orchestration)

    if (model.activeSprint?.orchestration) {
      const { storyId, timestamp } = proposal.payload
      model.activeSprint.orchestration.currentStoryId = storyId
      model.activeSprint.orchestration.currentStoryStartedAt = timestamp

      // Initialize session tracking for this story if not exists
      if (!model.activeSprint.orchestration.storySessions) {
        model.activeSprint.orchestration.storySessions = {}
      }
      model.activeSprint.orchestration.storySessions[storyId] = {
        status: 'in_progress',
        startedAt: timestamp
      }

      console.log('[ORCHESTRATION-ACCEPTOR] Story started successfully:', {
        storyId,
        currentStoryId: model.activeSprint.orchestration.currentStoryId
      })
    } else {
      console.error('[ORCHESTRATION-ACCEPTOR] Cannot set currentStoryId - orchestration not found')
    }
  }
}

// Orchestration story completed - marks story as done in orchestration tracking
// Note: This only updates orchestration state. Story completion with criteria
// is handled separately via proper intents in app.js
export const orchestrationStoryCompletedAcceptor = model => proposal => {
  if (proposal?.type === 'ORCHESTRATION_STORY_COMPLETED') {
    console.log('[MODEL-TRACE-C1] ====== orchestrationStoryCompletedAcceptor ENTER ======')
    console.log('[MODEL-TRACE-C1] Proposal payload:', JSON.stringify(proposal.payload))
    console.log('[MODEL-TRACE-C1] Has orchestration:', !!model.activeSprint?.orchestration)

    if (model.activeSprint?.orchestration) {
      const { storyId, sessionId, timestamp } = proposal.payload

      console.log('[MODEL-TRACE-C2] Before update completedStories:', model.activeSprint.orchestration.completedStories)

      // Add to completed stories list (orchestration tracking)
      if (!model.activeSprint.orchestration.completedStories) {
        console.log('[MODEL-TRACE-C2] Initializing completedStories array')
        model.activeSprint.orchestration.completedStories = []
      }
      if (!model.activeSprint.orchestration.completedStories.includes(storyId)) {
        console.log('[MODEL-TRACE-C2] Adding storyId to completedStories:', storyId)
        model.activeSprint.orchestration.completedStories.push(storyId)
      } else {
        console.log('[MODEL-TRACE-C2] StoryId already in completedStories, skipping')
      }

      console.log('[MODEL-TRACE-C3] After update completedStories:', model.activeSprint.orchestration.completedStories)

      // Update session tracking
      if (!model.activeSprint.orchestration.storySessions) {
        model.activeSprint.orchestration.storySessions = {}
      }
      model.activeSprint.orchestration.storySessions[storyId] = {
        status: 'completed',
        startedAt: model.activeSprint.orchestration.storySessions[storyId]?.startedAt,
        completedAt: timestamp,
        sessionId: sessionId
      }

      // Clear current story if it matches
      if (model.activeSprint.orchestration.currentStoryId === storyId) {
        console.log('[MODEL-TRACE-C4] Clearing currentStoryId (was:', storyId, ')')
        model.activeSprint.orchestration.currentStoryId = null
        model.activeSprint.orchestration.currentStoryStartedAt = null
      }

      console.log('[MODEL-TRACE-C5] ====== orchestrationStoryCompletedAcceptor EXIT ======')
      console.log('[MODEL-TRACE-C5] Final orchestration state:', {
        completedStories: model.activeSprint.orchestration.completedStories,
        currentStoryId: model.activeSprint.orchestration.currentStoryId,
        storyOrder: model.activeSprint.orchestration.storyOrder
      })
    } else {
      console.log('[MODEL-TRACE-C1] ABORT: No orchestration object')
    }
  }
}

// Update orchestration phase
export const updateOrchestrationPhaseAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_ORCHESTRATION_PHASE') {
    if (model.activeSprint?.orchestration) {
      const { phase, timestamp } = proposal.payload
      model.activeSprint.orchestration.phase = phase
      model.activeSprint.orchestration.phaseChangedAt = timestamp

      // Update status to complete if phase is complete
      if (phase === OrchestrationPhase.COMPLETE) {
        model.activeSprint.orchestration.status = OrchestrationStatus.COMPLETE
        model.activeSprint.orchestration.completedAt = timestamp
      }

      console.log('[ORCHESTRATION] Phase changed to:', phase)
    }
  }
}

// Pause orchestration
export const pauseOrchestrationAcceptor = model => proposal => {
  if (proposal?.type === 'PAUSE_ORCHESTRATION') {
    if (model.activeSprint?.orchestration && model.activeSprint.orchestration.status === OrchestrationStatus.RUNNING) {
      const { timestamp } = proposal.payload
      model.activeSprint.orchestration.status = OrchestrationStatus.PAUSED
      model.activeSprint.orchestration.pausedAt = timestamp
      console.log('[ORCHESTRATION] Paused')
    }
  }
}

// Resume orchestration
export const resumeOrchestrationAcceptor = model => proposal => {
  if (proposal?.type === 'RESUME_ORCHESTRATION') {
    if (model.activeSprint?.orchestration && model.activeSprint.orchestration.status === OrchestrationStatus.PAUSED) {
      const { timestamp } = proposal.payload
      model.activeSprint.orchestration.status = OrchestrationStatus.RUNNING
      model.activeSprint.orchestration.resumedAt = timestamp
      model.activeSprint.orchestration.pausedAt = null
      console.log('[ORCHESTRATION] Resumed')
    }
  }
}

// Stop orchestration
export const stopOrchestrationAcceptor = model => proposal => {
  if (proposal?.type === 'STOP_ORCHESTRATION') {
    if (model.activeSprint?.orchestration) {
      const { timestamp } = proposal.payload
      model.activeSprint.orchestration.status = OrchestrationStatus.STOPPED
      model.activeSprint.orchestration.stoppedAt = timestamp
      model.activeSprint.orchestration.currentStoryId = null
      console.log('[ORCHESTRATION] Stopped')
    }
  }
}

/**
 * Code Review Acceptors
 */

// Start code review phase
export const startCodeReviewAcceptor = model => proposal => {
  if (proposal?.type === 'START_CODE_REVIEW') {
    if (model.activeSprint?.orchestration) {
      const { timestamp } = proposal.payload
      model.activeSprint.orchestration.phase = OrchestrationPhase.REVIEW
      model.activeSprint.orchestration.phaseChangedAt = timestamp
      // Keep orchestration running during code review phase
      model.activeSprint.orchestration.status = OrchestrationStatus.RUNNING
      // Clear current story since we're no longer in implementation
      model.activeSprint.orchestration.currentStoryId = null

      // Initialize code review state
      if (!model.activeSprint.codeReview) {
        model.activeSprint.codeReview = {
          status: 'in_progress',
          startedAt: timestamp,
          findings: [],
          incidents: model.activeSprint.orchestration.incidents || []
        }
      } else {
        model.activeSprint.codeReview.status = 'in_progress'
        model.activeSprint.codeReview.startedAt = timestamp
      }

      console.log('[CODE_REVIEW] Started code review phase')
    }
  }
}

// Add a single code review finding
export const addCodeReviewFindingAcceptor = model => proposal => {
  if (proposal?.type === 'ADD_CODE_REVIEW_FINDING') {
    if (model.activeSprint?.codeReview) {
      const { finding, timestamp } = proposal.payload

      // Ensure findings array exists
      if (!model.activeSprint.codeReview.findings) {
        model.activeSprint.codeReview.findings = []
      }

      // Add the finding with metadata
      model.activeSprint.codeReview.findings.push({
        ...finding,
        status: FindingStatus.PENDING,
        addedAt: timestamp
      })

      console.log('[CODE_REVIEW] Added finding:', finding.id, finding.severity)
    }
  }
}

// Set all code review findings (batch update)
export const setCodeReviewFindingsAcceptor = model => proposal => {
  if (proposal?.type === 'SET_CODE_REVIEW_FINDINGS') {
    if (model.activeSprint) {
      const { findings, timestamp } = proposal.payload

      // Initialize code review if not exists
      if (!model.activeSprint.codeReview) {
        model.activeSprint.codeReview = {
          status: 'in_progress',
          startedAt: timestamp,
          findings: [],
          incidents: model.activeSprint.orchestration?.incidents || []
        }
      }

      // Set findings with metadata
      model.activeSprint.codeReview.findings = findings.map(finding => ({
        ...finding,
        status: finding.status || FindingStatus.PENDING,
        addedAt: timestamp
      }))

      console.log('[CODE_REVIEW] Set', findings.length, 'findings')
    }
  }
}

// Complete code review phase
export const completeCodeReviewAcceptor = model => proposal => {
  if (proposal?.type === 'COMPLETE_CODE_REVIEW') {
    if (model.activeSprint?.codeReview) {
      const { summary, timestamp } = proposal.payload

      model.activeSprint.codeReview.status = 'completed'
      model.activeSprint.codeReview.completedAt = timestamp
      model.activeSprint.codeReview.summary = summary

      // If there are findings, move to bugfix phase; otherwise, complete
      const hasFindings = model.activeSprint.codeReview.findings?.length > 0
      if (hasFindings) {
        model.activeSprint.orchestration.phase = OrchestrationPhase.BUGFIX
        model.activeSprint.orchestration.phaseChangedAt = timestamp
        console.log('[CODE_REVIEW] Completed with findings, moving to bugfix phase')
      } else {
        model.activeSprint.orchestration.phase = OrchestrationPhase.COMPLETE
        model.activeSprint.orchestration.status = OrchestrationStatus.COMPLETE
        model.activeSprint.orchestration.completedAt = timestamp
        console.log('[CODE_REVIEW] Completed with no findings, sprint complete')
      }
    }
  }
}

// Update finding status (for bug fix tracking)
export const updateFindingStatusAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_FINDING_STATUS') {
    if (model.activeSprint?.codeReview?.findings) {
      const { findingId, status, bugFixSessionId, timestamp } = proposal.payload

      const finding = model.activeSprint.codeReview.findings.find(f => f.id === findingId)
      if (finding) {
        finding.status = status
        finding.statusUpdatedAt = timestamp
        if (bugFixSessionId) {
          finding.bugFixSessionId = bugFixSessionId
        }
        console.log('[CODE_REVIEW] Updated finding status:', findingId, status)
      }
    }
  }
}

/**
 * Bug Fix Phase Acceptors
 */

// Start bug fix phase
export const startBugFixPhaseAcceptor = model => proposal => {
  if (proposal?.type === 'START_BUG_FIX_PHASE') {
    if (model.activeSprint?.orchestration) {
      const { timestamp } = proposal.payload

      model.activeSprint.orchestration.phase = OrchestrationPhase.BUGFIX
      model.activeSprint.orchestration.phaseChangedAt = timestamp
      // Keep orchestration running during bug fix phase
      model.activeSprint.orchestration.status = OrchestrationStatus.RUNNING

      // Initialize bug fix state
      if (!model.activeSprint.bugFix) {
        model.activeSprint.bugFix = {
          status: 'in_progress',
          startedAt: timestamp,
          currentFindingId: null,
          completedFindings: [],
          fixResults: {}
        }
      } else {
        model.activeSprint.bugFix.status = 'in_progress'
        model.activeSprint.bugFix.startedAt = timestamp
      }

      // Sort findings by severity for processing order
      if (model.activeSprint.codeReview?.findings) {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
        const sortedFindings = [...model.activeSprint.codeReview.findings]
          .sort((a, b) => (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4))
        model.activeSprint.bugFix.findingOrder = sortedFindings.map(f => f.id)
      }

      console.log('[BUG_FIX] Started bug fix phase')
    }
  }
}

// Start fixing a specific finding
export const startFixingFindingAcceptor = model => proposal => {
  if (proposal?.type === 'START_FIXING_FINDING') {
    if (model.activeSprint?.bugFix) {
      const { findingId, timestamp } = proposal.payload

      model.activeSprint.bugFix.currentFindingId = findingId
      model.activeSprint.bugFix.currentFixStartedAt = timestamp

      // Update the finding status to 'fixing'
      if (model.activeSprint.codeReview?.findings) {
        const finding = model.activeSprint.codeReview.findings.find(f => f.id === findingId)
        if (finding) {
          finding.status = FindingStatus.FIXING
          finding.fixStartedAt = timestamp
        }
      }

      console.log('[BUG_FIX] Started fixing finding:', findingId)
    }
  }
}

// Complete fixing a finding
export const completeFixingFindingAcceptor = model => proposal => {
  if (proposal?.type === 'COMPLETE_FIXING_FINDING') {
    if (model.activeSprint?.bugFix) {
      const { findingId, sessionId, result, timestamp } = proposal.payload

      // Add to completed list
      if (!model.activeSprint.bugFix.completedFindings) {
        model.activeSprint.bugFix.completedFindings = []
      }
      model.activeSprint.bugFix.completedFindings.push(findingId)

      // Store fix result
      if (!model.activeSprint.bugFix.fixResults) {
        model.activeSprint.bugFix.fixResults = {}
      }
      model.activeSprint.bugFix.fixResults[findingId] = {
        sessionId,
        result,
        completedAt: timestamp
      }

      // Clear current finding
      model.activeSprint.bugFix.currentFindingId = null
      model.activeSprint.bugFix.currentFixStartedAt = null

      // Update the finding status
      if (model.activeSprint.codeReview?.findings) {
        const finding = model.activeSprint.codeReview.findings.find(f => f.id === findingId)
        if (finding) {
          finding.status = result === 'fixed' ? FindingStatus.FIXED :
                          result === 'skipped' ? FindingStatus.WONT_FIX : FindingStatus.PENDING
          finding.bugFixSessionId = sessionId
          finding.fixCompletedAt = timestamp
        }
      }

      console.log('[BUG_FIX] Completed fixing finding:', findingId, result)
    }
  }
}

// Complete bug fix phase
export const completeBugFixPhaseAcceptor = model => proposal => {
  if (proposal?.type === 'COMPLETE_BUG_FIX_PHASE') {
    if (model.activeSprint?.bugFix) {
      const { summary, timestamp } = proposal.payload

      model.activeSprint.bugFix.status = 'completed'
      model.activeSprint.bugFix.completedAt = timestamp
      model.activeSprint.bugFix.summary = summary

      // Transition orchestration to complete
      if (model.activeSprint.orchestration) {
        model.activeSprint.orchestration.phase = OrchestrationPhase.COMPLETE
        model.activeSprint.orchestration.status = OrchestrationStatus.COMPLETE
        model.activeSprint.orchestration.completedAt = timestamp
      }

      console.log('[BUG_FIX] Completed bug fix phase:', summary)
    }
  }
}

/**
 * Sprint Completion Statistics Acceptors
 */

// Set sprint completion statistics
export const setSprintCompletionStatsAcceptor = model => proposal => {
  if (proposal?.type === 'SET_SPRINT_COMPLETION_STATS') {
    if (model.activeSprint) {
      const { stats, timestamp } = proposal.payload

      model.activeSprint.completionStats = {
        ...stats,
        calculatedAt: timestamp
      }

      console.log('[SPRINT] Completion stats set:', stats)
    }
  }
}

// Toggle sprint summary panel expanded/collapsed
export const toggleSprintSummaryAcceptor = model => proposal => {
  if (proposal?.type === 'TOGGLE_SPRINT_SUMMARY') {
    if (model.activeSprint) {
      model.activeSprint.summaryExpanded = !model.activeSprint.summaryExpanded
      console.log('[SPRINT] Summary panel toggled:', model.activeSprint.summaryExpanded)
    }
  }
}

// Set the sprint plan content (captured from Claude's planning response)
// Also transitions status from 'planning' to 'planned' so approve button becomes visible
export const setSprintPlanAcceptor = model => proposal => {
  if (proposal?.type === 'SET_SPRINT_PLAN') {
    if (model.activeSprint) {
      const previousPlan = model.activeSprint.plan
      const previousStatus = model.activeSprint.status
      const plan = proposal.payload.plan

      // Transition to 'planned' if currently in 'planning' status
      const newStatus = previousStatus === 'planning' ? 'planned' : previousStatus

      // Parse IMPLEMENTATION_ORDER from plan if present
      let implementationOrder = null
      const orderMatch = plan?.match(/IMPLEMENTATION_ORDER:\s*([^\n]+)/i)
      if (orderMatch) {
        const orderIds = orderMatch[1].split(',').map(id => id.trim()).filter(Boolean)
        if (orderIds.length > 0) {
          implementationOrder = orderIds
          console.log('[SPRINT] Parsed implementation order:', implementationOrder)
        }
      }

      // Parse BRANCH_ASSIGNMENTS from plan if present
      let branchAssignments = null
      const assignMatch = plan?.match(/BRANCH_ASSIGNMENTS:\s*([^\n]+)/i)
      if (assignMatch) {
        branchAssignments = {}
        const assignments = assignMatch[1].split(',').map(a => a.trim()).filter(Boolean)
        for (const assignment of assignments) {
          const [id, branch] = assignment.split('=').map(s => s.trim())
          if (id && branch) {
            branchAssignments[id] = branch
          }
        }
        if (Object.keys(branchAssignments).length > 0) {
          console.log('[SPRINT] Parsed branch assignments:', branchAssignments)
        } else {
          branchAssignments = null
        }
      }

      model.activeSprint = {
        ...model.activeSprint,
        plan,
        status: newStatus,
        ...(implementationOrder && { implementationOrder }),
        ...(branchAssignments && { branchAssignments })
      }
      console.log('[SPRINT] Plan content captured, length:', plan?.length || 0,
        'previous:', previousPlan?.length || 0,
        'status:', previousStatus, '->', newStatus)
    } else {
      console.warn('[SPRINT] Cannot set plan - no active sprint')
    }
  }
}

// Clear pending sprint planning flag (after IPC submission)
export const clearPendingSprintPlanningAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_PENDING_SPRINT_PLANNING') {
    model._pendingSprintPlanning = null
  }
}

// Iterate on the sprint plan with clarifying answers
export const iterateSprintPlanAcceptor = model => proposal => {
  if (proposal?.type === 'ITERATE_SPRINT_PLAN') {
    if (!model.activeSprint) {
      console.warn('[SPRINT] Cannot iterate on plan - no active sprint')
      return
    }

    const sprint = model.activeSprint
    const { clarifications } = proposal.payload

    // Track iteration count for context
    const iterationCount = (sprint.iterationCount || 0) + 1
    sprint.iterationCount = iterationCount

    // Build iteration prompt with previous plan and clarifications
    const stories = sprint.stories
    const storyDescriptions = stories.map((story, i) => {
      let desc = `### Story ${i + 1}: ${story.title}\n`
      desc += `**Story ID:** \`${story.id}\`\n`
      if (story.description) {
        desc += `${story.description}\n`
      }
      if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
        desc += `\n**Acceptance Criteria:**\n`
        desc += story.acceptanceCriteria.map((c, idx) => `${idx + 1}. ${c}`).join('\n')
      }
      return desc
    }).join('\n\n')

    // Create story reference list for structured output
    const storyReferenceList = stories.map(s => `- \`${s.id}\`: ${s.title}`).join('\n')

    // Include previous plan context if available
    const previousPlanSection = sprint.plan
      ? `### Previous Implementation Plan (Iteration ${iterationCount - 1}):

${sprint.plan}

---

`
      : ''

    // Include previous clarifications history if available
    const previousClarificationsSection = sprint.clarificationHistory?.length > 0
      ? `### Previous Clarifications:

${sprint.clarificationHistory.map((c, i) => `**Iteration ${i + 1}:**\n${c}`).join('\n\n')}

---

`
      : ''

    // Store current clarifications in history
    if (!sprint.clarificationHistory) {
      sprint.clarificationHistory = []
    }
    sprint.clarificationHistory.push(clarifications)

    const iterationPrompt = `## Sprint Plan Iteration Request (Iteration ${iterationCount})

**IMPORTANT: This is a PLANNING ONLY request. Do NOT make any code changes, create files, or modify the codebase. Only analyze and produce a written plan.**

${previousPlanSection}${previousClarificationsSection}### Current Developer Clarifications:
${clarifications}

---

### User Stories Being Planned:

${storyDescriptions}

---

### Story Reference (for structured output):
${storyReferenceList}

---

**Planning Requirements:**

1. **Architecture Analysis**: Analyze how these stories fit together and identify shared components or dependencies
2. **Implementation Order**: Recommend the optimal order to implement these stories based on dependencies
3. **Technical Approach**: For each story, outline the key technical decisions and approach
4. **File Changes**: Identify the main files that will need to be created or modified
5. **Risk Assessment**: Note any potential challenges or risks
6. **Estimated Complexity**: Rate each story as Low/Medium/High complexity
7. **Open Questions**: List any remaining clarifications needed

---

**REQUIRED STRUCTURED OUTPUT:**

At the end of your plan, include these machine-parseable lines using ONLY the story IDs listed above:

\`\`\`
IMPLEMENTATION_ORDER: <story_id_1>, <story_id_2>, <story_id_3>, ...
BRANCH_ASSIGNMENTS: <story_id_1>=<branch>, <story_id_2>=<branch>, ...
\`\`\`

Where \`<branch>\` is one of: \`ui\`, \`backend\`, \`fullstack\`, \`plugin\`

**Remember: Do NOT execute any tools that modify files. This is analysis and planning only.**

Please incorporate all previous context and the latest clarifications to provide a comprehensive revised plan.`

    // Update sprint status back to planning
    sprint.status = 'planning'

    // Get the current branch
    const branchId = model.history.activeBranch || 'specifications'

    // Ensure branch exists
    if (!model.history.branches[branchId]) {
      model.history.branches[branchId] = {
        id: branchId,
        name: branchId.charAt(0).toUpperCase() + branchId.slice(1),
        prompts: []
      }
    }

    // Create prompt entry for the iteration
    const promptId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
    const prompt = {
      id: promptId,
      content: iterationPrompt,
      parentId: sprint.promptId || null,  // Link to previous plan prompt
      timestamp: Date.now(),
      response: null,
      storyIds: stories.map(s => s.id),
      isIteration: true
    }

    // Add to branch
    model.history.branches[branchId].prompts.push(prompt)

    // Set as active prompt
    model.history.activePromptId = promptId

    // Set pending prompt for streaming
    model.pendingPromptId = promptId
    model.streamingResponse = ''

    // Update sprint with prompt reference
    sprint.promptId = promptId

    // Store for IPC submission
    model._pendingSprintPlanning = {
      promptId,
      promptContent: iterationPrompt,
      branchId,
      storyIds: stories.map(s => s.id),
      isIteration: true
    }

    console.log('[SPRINT] Plan iteration', iterationCount, 'started with clarifications, promptId:', promptId, 'hasPreviousPlan:', !!sprint.plan)
  }
}

// Start implementation for a specific story and branch (sprint workflow)
export const startSprintStoryImplementationAcceptor = model => proposal => {
  if (proposal?.type === 'START_SPRINT_STORY_IMPLEMENTATION') {
    const { storyId, branchType } = proposal.payload
    const sprint = model.activeSprint

    if (!sprint || (sprint.status !== 'in-progress' && sprint.status !== 'implementing')) {
      console.warn('[SPRINT] Cannot start implementation - sprint not in in-progress or implementing state, current:', sprint?.status)
      return
    }

    const story = sprint.stories.find(s => s.id === storyId)
    if (!story) {
      console.warn('[SPRINT] Story not found:', storyId)
      return
    }

    // Map branch type to actual branch
    const branchMap = {
      'ui': 'ui',
      'backend': 'backend',
      'fullstack': 'fullstack',
      'plugin': 'plugin'
    }
    const targetBranch = branchMap[branchType] || branchType

    // Initialize storyProgress if not exists
    if (!model.activeSprint.storyProgress) {
      model.activeSprint.storyProgress = {}
    }

    // Initialize progress for this story if not exists
    if (!model.activeSprint.storyProgress[storyId]) {
      model.activeSprint.storyProgress[storyId] = {
        branches: {}
      }
    }

    // Mark this branch as started
    model.activeSprint.storyProgress[storyId].branches[branchType] = {
      status: 'in_progress',
      startedAt: Date.now()
    }

    // Update sprint status
    model.activeSprint = {
      ...model.activeSprint,
      status: 'implementing',
      storyProgress: model.activeSprint.storyProgress
    }

    // Set the active implementation story for UI tracking
    model.activeImplementationStory = {
      id: story.id,
      title: story.title,
      description: story.description || '',
      acceptanceCriteria: story.acceptanceCriteria || [],
      branchType: branchType,
      startedAt: Date.now()
    }

    // Build implementation prompt context (includes approved plan if available)
    const { prompt: implementationPrompt, planIncluded } = buildStoryImplementationPrompt(story, branchType, sprint, model)

    // Ensure target branch exists
    if (!model.history.branches[targetBranch]) {
      model.history.branches[targetBranch] = {
        id: targetBranch,
        name: targetBranch.charAt(0).toUpperCase() + targetBranch.slice(1),
        prompts: []
      }
    }

    // Create prompt entry in history (like submitPromptAcceptor does)
    const promptId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
    const prompt = {
      id: promptId,
      parentId: null,
      content: implementationPrompt,
      title: `[Sprint] ${story.title} - ${branchType.toUpperCase()}`,
      timestamp: Date.now(),
      response: null,
      children: [],
      sprintId: sprint.id,
      storyId: storyId,
      branchType: branchType
    }

    model.history.branches[targetBranch].prompts.push(prompt)
    model.history.activeBranch = targetBranch
    model.pendingPromptId = promptId
    model.streamingResponse = ''

    // Store pending implementation for IPC
    model._pendingStoryImplementation = {
      storyId,
      branchType,
      branchId: targetBranch,
      promptContent: implementationPrompt,
      promptId: promptId,
      story,
      planMissing: !planIncluded
    }
  }
}

// Clear pending story implementation flag (after IPC submission)
export const clearPendingStoryImplementationAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_PENDING_STORY_IMPLEMENTATION') {
    model._pendingStoryImplementation = null
  }
}

// Mark a story branch as completed
export const completeStoryBranchAcceptor = model => proposal => {
  if (proposal?.type === 'COMPLETE_STORY_BRANCH') {
    const { storyId, branchType, timestamp } = proposal.payload
    const sprint = model.activeSprint

    if (!sprint) {
      console.warn('[SPRINT] Cannot complete branch - no active sprint')
      return
    }

    // Initialize storyProgress if not exists
    if (!sprint.storyProgress) {
      sprint.storyProgress = {}
    }

    // Initialize progress for this story if not exists
    if (!sprint.storyProgress[storyId]) {
      sprint.storyProgress[storyId] = {
        branches: {}
      }
    }

    // Mark this branch as completed
    sprint.storyProgress[storyId].branches[branchType] = {
      status: 'completed',
      startedAt: sprint.storyProgress[storyId].branches[branchType]?.startedAt || timestamp,
      completedAt: timestamp
    }

    // Check if all branches for this story are completed
    const storyProgress = sprint.storyProgress[storyId]
    const allBranchesCompleted = Object.values(storyProgress.branches).every(
      b => b.status === 'completed'
    )

    if (allBranchesCompleted && Object.keys(storyProgress.branches).length > 0) {
      storyProgress.status = 'completed'
      storyProgress.completedAt = timestamp

      // Update the story in userStories as well
      const story = model.userStories.find(s => s.id === storyId)
      if (story) {
        story.status = 'completed'
        story.updatedAt = timestamp
      }
    }

    // Check if all stories in the sprint are completed
    const allStoriesCompleted = sprint.stories.every(story => {
      const progress = sprint.storyProgress[story.id]
      return progress?.status === 'completed'
    })

    if (allStoriesCompleted && sprint.stories.length > 0) {
      sprint.status = 'completed'
      sprint.completedAt = timestamp
    }

    // Trigger persistence
    model._sprintProgressUpdated = true

    console.log('[SPRINT] Marked branch as completed:', { storyId, branchType, allStoriesCompleted })
  }
}

// Update sprint story status (for manual completion toggle)
export const updateSprintStoryStatusAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_SPRINT_STORY_STATUS') {
    console.log('[MODEL-TRACE-A1] ====== updateSprintStoryStatusAcceptor ENTER ======')
    console.log('[MODEL-TRACE-A1] Proposal payload:', JSON.stringify(proposal.payload))

    const { storyId, status, timestamp } = proposal.payload
    const sprint = model.activeSprint

    if (!sprint) {
      console.warn('[MODEL-TRACE-A1] ABORT: No active sprint')
      return
    }

    console.log('[MODEL-TRACE-A2] Sprint found:', {
      sprintId: sprint.id,
      sprintStatus: sprint.status,
      storiesCount: sprint.stories?.length
    })

    // Find and update the story in the sprint's stories array
    const sprintStory = sprint.stories.find(s => s.id === storyId)
    console.log('[MODEL-TRACE-A3] Sprint story lookup:', {
      found: !!sprintStory,
      storyId,
      previousStatus: sprintStory?.status
    })

    if (sprintStory) {
      sprintStory.status = status
      sprintStory.updatedAt = timestamp
      if (status === 'completed') {
        sprintStory.completedAt = timestamp
      }
      console.log('[MODEL-TRACE-A3] Updated sprint story:', {
        storyId,
        newStatus: sprintStory.status,
        updatedAt: sprintStory.updatedAt
      })
    }

    // Initialize storyProgress if not exists
    if (!sprint.storyProgress) {
      console.log('[MODEL-TRACE-A4] Initializing sprint.storyProgress')
      sprint.storyProgress = {}
    }

    // Initialize progress for this story if not exists
    if (!sprint.storyProgress[storyId]) {
      console.log('[MODEL-TRACE-A4] Initializing storyProgress for storyId:', storyId)
      sprint.storyProgress[storyId] = {
        branches: {}
      }
    }

    // Update the story progress status
    console.log('[MODEL-TRACE-A5] Updating storyProgress[storyId].status:', {
      previousStatus: sprint.storyProgress[storyId].status,
      newStatus: status
    })
    sprint.storyProgress[storyId].status = status
    if (status === 'completed') {
      sprint.storyProgress[storyId].completedAt = timestamp
    } else {
      sprint.storyProgress[storyId].completedAt = null
    }

    // Check if all stories in the sprint are completed
    const storyStatuses = sprint.stories.map(s => ({ id: s.id, status: s.status }))
    console.log('[MODEL-TRACE-A6] All story statuses:', JSON.stringify(storyStatuses))
    const allStoriesCompleted = sprint.stories.every(story => story.status === 'completed')
    console.log('[MODEL-TRACE-A6] allStoriesCompleted:', allStoriesCompleted)

    if (allStoriesCompleted && sprint.stories.length > 0) {
      console.log('[MODEL-TRACE-A7] Marking sprint as completed')
      sprint.status = 'completed'
      sprint.completedAt = timestamp
    } else if (sprint.status === 'completed') {
      // If sprint was completed but now a story is marked incomplete
      console.log('[MODEL-TRACE-A7] Reverting sprint from completed to implementing')
      sprint.status = 'implementing'
      sprint.completedAt = null
    }

    // Trigger persistence
    model._sprintProgressUpdated = true

    console.log('[MODEL-TRACE-A8] ====== updateSprintStoryStatusAcceptor EXIT ======')
    console.log('[MODEL-TRACE-A8] Final state:', {
      storyId,
      storyStatus: sprint.stories.find(s => s.id === storyId)?.status,
      progressStatus: sprint.storyProgress[storyId]?.status,
      sprintStatus: sprint.status,
      allStoriesCompleted
    })
  }
}

// Update sprint story assertions (when assertions are generated for sprint stories)
export const updateSprintStoryAssertionsAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_SPRINT_STORY_ASSERTIONS') {
    const { storyId, assertions, timestamp } = proposal.payload
    const sprint = model.activeSprint

    if (!sprint) {
      console.warn('[SPRINT] Cannot update story assertions - no active sprint')
      return
    }

    // Find and update the story in the sprint's stories array
    const sprintStory = sprint.stories.find(s => s.id === storyId)
    if (sprintStory) {
      sprintStory.inspectionAssertions = assertions
      sprintStory.updatedAt = timestamp
      console.log('[SPRINT] Updated story assertions:', {
        storyId,
        assertionCount: assertions?.length || 0,
        storyTitle: sprintStory.title?.substring(0, 30)
      })
    } else {
      console.warn('[SPRINT] Story not found in active sprint:', storyId)
    }
  }
}

// Clear sprint validation error
export const clearSprintErrorAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_SPRINT_ERROR') {
    model.sprintError = null
  }
}

// Update story assertion results (after evaluation completes)
// Updates both backlog stories and sprint stories for UI consistency
export const updateStoryAssertionResultsAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_STORY_ASSERTION_RESULTS') {
    const { storyId, results, timestamp } = proposal.payload

    // Update in backlog (userStories)
    const backlogStory = model.userStories?.find(s => s.id === storyId)
    if (backlogStory) {
      backlogStory.assertionResults = results
      backlogStory.updatedAt = timestamp
      console.log('[ASSERTIONS] Updated backlog story results:', {
        storyId,
        passed: results?.summary?.passed || 0,
        failed: results?.summary?.failed || 0
      })
    }

    // Update in sprint stories (if sprint is active)
    const sprintStory = model.activeSprint?.stories?.find(s => s.id === storyId)
    if (sprintStory) {
      sprintStory.assertionResults = results
      sprintStory.updatedAt = timestamp
      console.log('[ASSERTIONS] Updated sprint story results:', {
        storyId,
        passed: results?.summary?.passed || 0,
        failed: results?.summary?.failed || 0
      })
    }
  }
}

// Toggle acceptance criteria completion for a story
export const toggleCriteriaCompletionAcceptor = model => proposal => {
  if (proposal?.type === 'TOGGLE_CRITERIA_COMPLETION') {
    console.log('[MODEL-TRACE-B1] ====== toggleCriteriaCompletionAcceptor ENTER ======')
    console.log('[MODEL-TRACE-B1] Proposal payload:', JSON.stringify(proposal.payload))

    const { storyId, criteriaIndex, checked, timestamp } = proposal.payload
    const sprint = model.activeSprint

    if (!sprint) {
      console.warn('[MODEL-TRACE-B1] ABORT: No active sprint')
      return
    }

    console.log('[MODEL-TRACE-B2] Sprint found:', {
      sprintId: sprint.id,
      storiesCount: sprint.stories?.length,
      hasStoryProgress: !!sprint.storyProgress
    })

    // Initialize storyProgress if not exists
    if (!sprint.storyProgress) {
      console.log('[MODEL-TRACE-B3] Initializing sprint.storyProgress')
      sprint.storyProgress = {}
    }

    // Initialize progress for this story if not exists
    if (!sprint.storyProgress[storyId]) {
      console.log('[MODEL-TRACE-B3] Initializing storyProgress for storyId:', storyId)
      sprint.storyProgress[storyId] = {
        branches: {},
        criteriaProgress: {}
      }
    }

    // Initialize criteriaProgress if not exists
    if (!sprint.storyProgress[storyId].criteriaProgress) {
      console.log('[MODEL-TRACE-B3] Initializing criteriaProgress for storyId:', storyId)
      sprint.storyProgress[storyId].criteriaProgress = {}
    }

    console.log('[MODEL-TRACE-B4] Before update criteriaProgress:', JSON.stringify(sprint.storyProgress[storyId].criteriaProgress))

    // Update the criteria completion state
    sprint.storyProgress[storyId].criteriaProgress[criteriaIndex] = {
      checked,
      checkedAt: checked ? timestamp : null
    }

    console.log('[MODEL-TRACE-B4] After update criteriaProgress:', JSON.stringify(sprint.storyProgress[storyId].criteriaProgress))

    // Check if all criteria are completed for auto-complete
    const story = sprint.stories.find(s => s.id === storyId)
    console.log('[MODEL-TRACE-B5] Story lookup for auto-complete check:', {
      found: !!story,
      storyId,
      hasAcceptanceCriteria: !!story?.acceptanceCriteria,
      criteriaCount: story?.acceptanceCriteria?.length || 0
    })

    if (story && story.acceptanceCriteria?.length > 0) {
      const criteriaProgress = sprint.storyProgress[storyId].criteriaProgress
      const criteriaCheckResults = story.acceptanceCriteria.map((_, idx) => ({
        idx,
        checked: criteriaProgress[idx]?.checked === true
      }))
      console.log('[MODEL-TRACE-B6] Criteria check results:', JSON.stringify(criteriaCheckResults))

      const allChecked = story.acceptanceCriteria.every((_, idx) =>
        criteriaProgress[idx]?.checked === true
      )

      console.log('[MODEL-TRACE-B6] allChecked:', allChecked, 'currentStatus:', sprint.storyProgress[storyId].status)

      // Auto-complete the story if all criteria are checked
      if (allChecked && sprint.storyProgress[storyId].status !== 'completed') {
        console.log('[MODEL-TRACE-B7] Auto-completing story - all criteria checked')
        sprint.storyProgress[storyId].status = 'completed'
        sprint.storyProgress[storyId].completedAt = timestamp

        // Also update the story in the sprint
        const sprintStory = sprint.stories.find(s => s.id === storyId)
        if (sprintStory) {
          console.log('[MODEL-TRACE-B7] Updating sprintStory status to completed')
          sprintStory.status = 'completed'
          sprintStory.completedAt = timestamp
        }

        // Sync to backlog (userStories)
        const backlogStory = model.userStories?.find(s => s.id === storyId)
        if (backlogStory) {
          console.log('[MODEL-TRACE-B7] Updating backlog story status to completed')
          backlogStory.status = 'completed'
          model._userStoriesUpdated = true
        }

        console.log('[MODEL-TRACE-B7] Story auto-completed:', storyId)
      }
    }

    // Trigger persistence
    model._sprintProgressUpdated = true

    console.log('[MODEL-TRACE-B8] ====== toggleCriteriaCompletionAcceptor EXIT ======')
    console.log('[MODEL-TRACE-B8] Final state:', {
      storyId,
      criteriaIndex,
      checked,
      criteriaProgress: JSON.stringify(sprint.storyProgress[storyId].criteriaProgress),
      storyStatus: sprint.storyProgress[storyId].status
    })
  }
}

// Update single acceptance criteria validation status (from automated validation)
export const updateCriteriaValidationAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_CRITERIA_VALIDATION') {
    const { storyId, criteriaIndex, status, reason, timestamp } = proposal.payload
    const sprint = model.activeSprint

    if (!sprint) {
      console.warn('[SPRINT] No active sprint for criteria validation update')
      return
    }

    // Initialize storyProgress if not exists
    if (!sprint.storyProgress) {
      sprint.storyProgress = {}
    }
    if (!sprint.storyProgress[storyId]) {
      sprint.storyProgress[storyId] = { branches: {}, criteriaProgress: {} }
    }
    if (!sprint.storyProgress[storyId].criteriaProgress) {
      sprint.storyProgress[storyId].criteriaProgress = {}
    }

    // Update or create the criteria validation state
    const existing = sprint.storyProgress[storyId].criteriaProgress[criteriaIndex] || {}
    sprint.storyProgress[storyId].criteriaProgress[criteriaIndex] = {
      ...existing,
      validationStatus: status,
      validationReason: reason,
      validatedAt: timestamp,
      // Auto-check if passed
      checked: status === 'passed' ? true : existing.checked,
      checkedAt: status === 'passed' ? timestamp : existing.checkedAt
    }

    model._sprintProgressUpdated = true
    console.log('[SPRINT] Updated criteria validation:', { storyId, criteriaIndex, status })
  }
}

// Batch update all acceptance criteria validation results for a story
export const updateStoryCriteriaValidationAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_STORY_CRITERIA_VALIDATION') {
    const { storyId, validationResults, timestamp } = proposal.payload
    const sprint = model.activeSprint

    if (!sprint) {
      console.warn('[SPRINT] No active sprint for story criteria validation')
      return
    }

    // Initialize storyProgress if not exists
    if (!sprint.storyProgress) {
      sprint.storyProgress = {}
    }
    if (!sprint.storyProgress[storyId]) {
      sprint.storyProgress[storyId] = { branches: {}, criteriaProgress: {} }
    }
    if (!sprint.storyProgress[storyId].criteriaProgress) {
      sprint.storyProgress[storyId].criteriaProgress = {}
    }

    // Update each criterion's validation status
    for (const result of validationResults) {
      const { criteriaIndex, status, reason } = result
      const existing = sprint.storyProgress[storyId].criteriaProgress[criteriaIndex] || {}
      sprint.storyProgress[storyId].criteriaProgress[criteriaIndex] = {
        ...existing,
        validationStatus: status,
        validationReason: reason,
        validatedAt: timestamp,
        // Auto-check if passed
        checked: status === 'passed' ? true : existing.checked,
        checkedAt: status === 'passed' ? timestamp : existing.checkedAt
      }
    }

    model._sprintProgressUpdated = true
    console.log('[SPRINT] Batch updated criteria validation:', { storyId, count: validationResults.length })
  }
}

// Start criteria validation for a story (mark as validating)
export const startCriteriaValidationAcceptor = model => proposal => {
  if (proposal?.type === 'START_CRITERIA_VALIDATION') {
    const { storyId, timestamp } = proposal.payload
    const sprint = model.activeSprint

    if (!sprint) return

    if (!sprint.storyProgress) {
      sprint.storyProgress = {}
    }
    if (!sprint.storyProgress[storyId]) {
      sprint.storyProgress[storyId] = { branches: {}, criteriaProgress: {} }
    }

    sprint.storyProgress[storyId].validationStatus = 'validating'
    sprint.storyProgress[storyId].validationStartedAt = timestamp

    model._sprintProgressUpdated = true
    console.log('[SPRINT] Started criteria validation for story:', storyId)
  }
}

// Complete criteria validation for a story
export const completeCriteriaValidationAcceptor = model => proposal => {
  if (proposal?.type === 'COMPLETE_CRITERIA_VALIDATION') {
    const { storyId, summary, timestamp } = proposal.payload
    const sprint = model.activeSprint

    if (!sprint) return

    if (!sprint.storyProgress) {
      sprint.storyProgress = {}
    }
    if (!sprint.storyProgress[storyId]) {
      sprint.storyProgress[storyId] = { branches: {}, criteriaProgress: {} }
    }

    sprint.storyProgress[storyId].validationStatus = 'completed'
    sprint.storyProgress[storyId].validationCompletedAt = timestamp
    sprint.storyProgress[storyId].validationSummary = summary

    // Auto-complete story if all criteria passed
    if (summary && summary.failed === 0 && summary.passed === summary.total) {
      sprint.storyProgress[storyId].status = 'completed'
      sprint.storyProgress[storyId].completedAt = timestamp

      // Update story in sprint
      const sprintStory = sprint.stories?.find(s => s.id === storyId)
      if (sprintStory) {
        sprintStory.status = 'completed'
        sprintStory.completedAt = timestamp
      }

      // Sync to backlog
      const backlogStory = model.userStories?.find(s => s.id === storyId)
      if (backlogStory) {
        backlogStory.status = 'completed'
        model._userStoriesUpdated = true
      }

      console.log('[SPRINT] Auto-completed story after validation passed:', storyId)
    }

    model._sprintProgressUpdated = true
    console.log('[SPRINT] Completed criteria validation:', { storyId, summary })
  }
}

// Record iteration output for stuck detection
export const recordIterationOutputAcceptor = model => proposal => {
  if (proposal?.type === 'RECORD_ITERATION_OUTPUT') {
    const { outputHash, outputSummary, timestamp } = proposal.payload
    const detection = model.stuckDetection

    // Keep only the last N outputs (threshold + 1 for comparison)
    const maxOutputs = detection.threshold + 1
    detection.recentOutputs.push({ hash: outputHash, summary: outputSummary, timestamp })
    if (detection.recentOutputs.length > maxOutputs) {
      detection.recentOutputs.shift()
    }

    // Check for consecutive similar outputs
    if (detection.recentOutputs.length >= detection.threshold) {
      const recentHashes = detection.recentOutputs.slice(-detection.threshold).map(o => o.hash)
      const allSame = recentHashes.every(h => h === recentHashes[0])

      if (allSame) {
        detection.isStuck = true
        detection.consecutiveCount = detection.threshold
        detection.timestamp = timestamp
        console.log('[STUCK] Detected stuck state after', detection.threshold, 'similar iterations')
      }
    }
  }
}

// Resolve stuck state with user action
export const resolveStuckStateAcceptor = model => proposal => {
  if (proposal?.type === 'RESOLVE_STUCK_STATE') {
    const { action, timestamp } = proposal.payload
    const detection = model.stuckDetection

    detection.lastAction = action
    detection.isStuck = false
    detection.timestamp = timestamp

    if (action === 'stop') {
      // Clear all tracking when stopping
      detection.recentOutputs = []
      detection.consecutiveCount = 0
    } else if (action === 'continue' || action === 'dismiss') {
      // Reset counter but keep tracking
      detection.consecutiveCount = 0
    } else if (action === 'modify') {
      // Clear outputs so new approach starts fresh
      detection.recentOutputs = []
      detection.consecutiveCount = 0
    }

    console.log('[STUCK] Resolved with action:', action)
  }
}

// Reset stuck detection (when output changes significantly)
export const resetStuckDetectionAcceptor = model => proposal => {
  if (proposal?.type === 'RESET_STUCK_DETECTION') {
    model.stuckDetection = {
      isStuck: false,
      consecutiveCount: 0,
      threshold: 3,
      recentOutputs: [],
      lastAction: null,
      timestamp: proposal.payload.timestamp
    }
  }
}

// Clear the active implementation story
export const clearActiveImplementationStoryAcceptor = model => proposal => {
  if (proposal?.type === 'CLEAR_ACTIVE_IMPLEMENTATION_STORY') {
    console.log('[MODEL] Clearing active implementation story')
    model.activeImplementationStory = null
  }
}

/**
 * Helper: Find a prompt by ID across all branches
 */
function findPromptById(model, promptId) {
  if (!model?.history?.branches || !promptId) return null

  for (const branchId of Object.keys(model.history.branches)) {
    const branch = model.history.branches[branchId]
    if (branch.prompts) {
      const prompt = branch.prompts.find(p => p.id === promptId)
      if (prompt) return prompt
    }
  }
  return null
}

/**
 * Helper: Build implementation prompt for a story
 */
function buildStoryImplementationPrompt(story, branchType, sprint, model) {
  // RICE FACT Framework: Role, Instruction, Context, Example, Format, Aim, Constraints, Tone
  const branchRiceFact = {
    'ui': {
      role: 'You are a Senior UI/Frontend Developer specializing in user experience, accessibility, and modern frontend patterns.',
      instruction: 'Implement the user interface components for this user story. Create clean, reusable components with proper styling and user interactions.',
      context: 'This is the UI implementation thread. The backend may be implemented separately, so focus on the presentation layer and use mocks or stubs for data if needed.',
      example: 'Follow existing component patterns in the codebase. Reference similar UI elements for consistency in styling and behavior.',
      format: 'Provide complete component code with HTML structure, CSS/styling, and JavaScript interactions. Include accessibility attributes (ARIA labels, keyboard navigation).',
      aim: 'Create an intuitive, responsive, and visually consistent user interface that provides excellent user experience.',
      constraints: 'Follow existing design patterns and component architecture. Ensure accessibility (WCAG 2.1). Do not modify backend logic or data models.',
      tone: 'User-focused and detail-oriented. Prioritize clarity, usability, and visual polish.'
    },
    'backend': {
      role: 'You are a Senior Backend Developer specializing in API design, data modeling, and server-side architecture.',
      instruction: 'Implement the backend components for this user story. Design and build APIs, data models, and business logic.',
      context: 'This is the backend implementation thread. The UI may be implemented separately, so focus on providing clean, well-documented APIs.',
      example: 'Follow existing API patterns and data model conventions in the codebase. Reference similar endpoints for consistency.',
      format: 'Provide complete backend code including API endpoints, data models, validation, and error handling. Include JSDoc comments for public interfaces.',
      aim: 'Create performant, secure, and maintainable backend code that provides reliable data operations and business logic.',
      constraints: 'Follow existing architectural patterns. Implement proper error handling and validation. Do not modify UI components directly.',
      tone: 'Technical and precise. Prioritize correctness, security, and performance.'
    },
    'fullstack': {
      role: 'You are a Senior Full Stack Developer capable of implementing complete features across the entire application stack.',
      instruction: 'Implement the complete end-to-end feature for this user story. Build both frontend and backend components with proper integration.',
      context: 'This is the full stack implementation thread. You are responsible for the complete feature including UI, API, data models, and their integration.',
      example: 'Follow existing patterns for both frontend components and backend services. Ensure consistent data flow between layers.',
      format: 'Provide complete implementation across all layers. Include UI components, API endpoints, data models, and integration code. Document the data flow.',
      aim: 'Create a seamless, fully functional feature that works cohesively across the frontend and backend.',
      constraints: 'Maintain separation of concerns between layers. Ensure proper error handling propagates correctly through the stack. Follow existing patterns for both UI and backend.',
      tone: 'Holistic and integration-focused. Balance user experience with technical correctness.'
    }
  }

  const riceFact = branchRiceFact[branchType] || branchRiceFact['fullstack']

  let prompt = `## Implementation Request

### RICE FACT Framework

**Role:** ${riceFact.role}

**Instruction:** ${riceFact.instruction}

**Context:** ${riceFact.context}

**Example:** ${riceFact.example}

**Format:** ${riceFact.format}

**Aim:** ${riceFact.aim}

**Constraints:** ${riceFact.constraints}

**Tone:** ${riceFact.tone}

---

### User Story
**${story.title}**

${story.description || ''}
`

  if (story.acceptanceCriteria?.length > 0) {
    prompt += `
### Acceptance Criteria
${story.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}
`
  }

  // Include the approved plan if available
  let planIncluded = false
  if (sprint?.promptId && model) {
    const planPrompt = findPromptById(model, sprint.promptId)
    if (planPrompt?.response?.content) {
      planIncluded = true
      prompt += `
### Approved Implementation Plan

The following plan was approved for this sprint. Please follow this guidance:

${planPrompt.response.content}

---

`
    }
  }

  prompt += `
### Implementation Notes
This is part of an approved sprint plan. Please implement this story following the established patterns in the codebase and the guidance above.

---

Please proceed with the implementation.`

  return { prompt, planIncluded }
}

/**
 * Helper: Build handoff summary from thread context
 */
function buildHandoffSummary(thread, branch, model) {
  let summary = ''

  // What was worked on
  summary += '🎯 What Was Implemented\n'
  summary += '─'.repeat(30) + '\n\n'
  if (thread.content) {
    summary += `📝 Original Request:\n${thread.content}\n\n`
  }

  // Get response content if available
  if (thread.response?.content) {
    const responsePreview = thread.response.content.substring(0, 500)
    summary += `💬 Work Summary:\n${responsePreview}${thread.response.content.length > 500 ? '...' : ''}\n\n`
  }

  // Files modified
  if (thread.response?.filesModified?.length > 0) {
    summary += '📁 Files Modified\n'
    summary += '─'.repeat(30) + '\n\n'
    thread.response.filesModified.forEach(file => {
      // Handle both string and object formats
      const filePath = typeof file === 'string' ? file : (file?.path || file?.file || String(file))

      // Use different emoji based on file type
      const ext = filePath.split('.').pop()?.toLowerCase()
      let icon = '📄'
      if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) icon = '⚡'
      else if (['css', 'scss', 'less'].includes(ext)) icon = '🎨'
      else if (['html', 'htm'].includes(ext)) icon = '🌐'
      else if (['json', 'yaml', 'yml'].includes(ext)) icon = '⚙️'
      else if (['md', 'txt'].includes(ext)) icon = '📝'
      else if (['test', 'spec'].some(t => filePath.includes(t))) icon = '🧪'

      summary += `  ${icon} ${filePath}\n`
    })
    summary += '\n'
  }

  // Story context if available
  if (thread.storyIds?.length > 0) {
    const stories = model.userStories.filter(s => thread.storyIds.includes(s.id))
    if (stories.length > 0) {
      summary += '📖 Related User Stories\n'
      summary += '─'.repeat(30) + '\n\n'
      stories.forEach(story => {
        const statusIcon = story.status === 'done' ? '✅' :
                          story.status === 'in-progress' ? '🔄' : '📋'
        summary += `  ${statusIcon} ${story.title}\n`
      })
      summary += '\n'
    }
  }

  // Add notes section
  summary += '📌 Notes for Next Thread\n'
  summary += '─'.repeat(30) + '\n\n'
  summary += '  ℹ️ Add any additional context or notes here before handing off.\n'

  return summary
}

/**
 * Helper: Truncate text
 */
function truncateText(text, maxLength) {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

/**
 * UI Navigation Acceptors
 */

export const switchViewAcceptor = model => proposal => {
  if (proposal?.type === 'SWITCH_VIEW') {
    // Core views plus plugin-contributed views (e.g., 'designer' from designer-plugin)
    const validViews = ['config', 'prompt', 'user-stories', 'cli-output', 'profile', 'git', 'debug', 'designer']
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
 * Story Generation Tracking Acceptors
 */

export const loadStoryGenerationsAcceptor = model => proposal => {
  if (proposal?.type === 'LOAD_STORY_GENERATIONS') {
    model.storyGenerations = proposal.payload.generations || model.storyGenerations
  }
}

export const createStoryGenerationAcceptor = model => proposal => {
  if (proposal?.type === 'CREATE_STORY_GENERATION') {
    const generation = {
      id: proposal.payload.id || (Date.now().toString(36) + Math.random().toString(36).substr(2, 9)),
      user_prompt: proposal.payload.user_prompt,
      project_context: proposal.payload.project_context || null,
      generated_stories: (proposal.payload.generated_stories || []).map(story => ({
        id: story.id || (Date.now().toString(36) + Math.random().toString(36).substr(2, 9)),
        title: story.title,
        description: story.description || '',
        acceptance_criteria: story.acceptance_criteria || [],
        user_action: 'pending',
        modification_diff: null,
        rejection_reason: null,
        backlog_story_id: null
      })),
      timestamp: proposal.payload.timestamp || new Date().toISOString(),
      model_used: proposal.payload.model_used || 'sonnet'
    }
    model.storyGenerations.generations.push(generation)
    model.storyGenerations.currentGenerationId = generation.id
  }
}

export const updateGeneratedStoryFeedbackAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_GENERATED_STORY_FEEDBACK') {
    const { generationId, storyId, feedback } = proposal.payload
    const generation = model.storyGenerations.generations.find(g => g.id === generationId)
    if (generation) {
      const story = generation.generated_stories.find(s => s.id === storyId)
      if (story) {
        Object.assign(story, feedback)
      }
    }
  }
}

export const finalizeStoryGenerationAcceptor = model => proposal => {
  if (proposal?.type === 'FINALIZE_STORY_GENERATION') {
    // Called when adding stories to backlog - link backlog IDs
    const { generationId, storyMappings } = proposal.payload
    const generation = model.storyGenerations.generations.find(g => g.id === generationId)
    if (generation) {
      storyMappings.forEach(({ generatedStoryId, backlogStoryId }) => {
        const story = generation.generated_stories.find(s => s.id === generatedStoryId)
        if (story) {
          story.backlog_story_id = backlogStoryId
        }
      })
    }
    model.storyGenerations.currentGenerationId = null
  }
}

export const createImplementationJourneyAcceptor = model => proposal => {
  if (proposal?.type === 'CREATE_IMPLEMENTATION_JOURNEY') {
    const journey = {
      id: proposal.payload.id || (Date.now().toString(36) + Math.random().toString(36).substr(2, 9)),
      story_id: proposal.payload.story_id,
      prompt_id: proposal.payload.prompt_id,
      turn_count: proposal.payload.turn_count || 0,
      inputs: proposal.payload.inputs || [],
      status: 'pending',
      outcome_notes: null,
      started_at: new Date().toISOString(),
      completed_at: null
    }
    model.storyGenerations.implementation_journeys.push(journey)
  }
}

export const addImplementationInputAcceptor = model => proposal => {
  if (proposal?.type === 'ADD_IMPLEMENTATION_INPUT') {
    const { journeyId, input } = proposal.payload
    const journey = model.storyGenerations.implementation_journeys.find(j => j.id === journeyId)
    if (journey) {
      journey.inputs.push({
        turn_number: input.turn_number,
        type: input.type || 'technical',
        content_summary: input.content_summary || '',
        timestamp: new Date().toISOString()
      })
    }
  }
}

export const updateImplementationJourneyAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_IMPLEMENTATION_JOURNEY') {
    const { journeyId, updates } = proposal.payload
    const journey = model.storyGenerations.implementation_journeys.find(j => j.id === journeyId)
    if (journey) {
      Object.assign(journey, updates)
    }
  }
}

export const completeImplementationJourneyAcceptor = model => proposal => {
  if (proposal?.type === 'COMPLETE_IMPLEMENTATION_JOURNEY') {
    const { journeyId, status, outcome_notes } = proposal.payload
    const journey = model.storyGenerations.implementation_journeys.find(j => j.id === journeyId)
    if (journey) {
      journey.status = status
      journey.outcome_notes = outcome_notes || null
      journey.completed_at = new Date().toISOString()
    }
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
  rerunPromptAcceptor,
  clearRerunRequestAcceptor,
  requestContinueAcceptor,
  clearContinueRequestAcceptor,
  selectBranchAcceptor,
  createBranchAcceptor,
  deleteBranchAcceptor,
  reorderBranchesAcceptor,
  updateBranchSettingsAcceptor,
  selectPromptAcceptor,
  clearPromptSelectionAcceptor,
  toggleThreadExpandedAcceptor,
  expandThreadToEndAcceptor,
  updateThreadSearchQueryAcceptor,
  markThreadCompleteAcceptor,
  unmarkThreadCompleteAcceptor,

  // User Stories
  addUserStoryAcceptor,
  updateUserStoryAcceptor,
  deleteUserStoryAcceptor,
  loadUserStoriesAcceptor,
  loadSprintHistoryAcceptor,
  setSprintFilterAcceptor,
  clearSprintFilterAcceptor,

  // Story Derivation
  deriveUserStoriesAcceptor,
  receiveDerivedStoriesAcceptor,
  markStoryReadyAcceptor,
  unmarkStoryReadyAcceptor,
  updateDerivedStoryAcceptor,
  deleteDerivedStoryAcceptor,
  requestStoryChangesAcceptor,
  addStoriesToBacklogAcceptor,
  cancelStoryReviewAcceptor,
  storyDerivationErrorAcceptor,

  // Story Generation Tracking
  loadStoryGenerationsAcceptor,
  createStoryGenerationAcceptor,
  updateGeneratedStoryFeedbackAcceptor,
  finalizeStoryGenerationAcceptor,
  createImplementationJourneyAcceptor,
  addImplementationInputAcceptor,
  updateImplementationJourneyAcceptor,
  completeImplementationJourneyAcceptor,

  // UI Navigation
  switchViewAcceptor,
  toggleSidebarAcceptor,
  showModalAcceptor,
  hideModalAcceptor,

  // Handoff
  showHandoffReviewAcceptor,
  updateHandoffSummaryAcceptor,
  completeHandoffAcceptor,
  cancelHandoffAcceptor,
  deleteHandoffAcceptor,
  setBranchHandoffContextAcceptor,
  clearBranchHandoffContextAcceptor,

  // Sprint
  createSprintAcceptor,
  startSprintPlanningAcceptor,
  clearSprintAcceptor,
  clearSprintWithDetailsAcceptor,
  deleteSprintAcceptor,
  approvePlanAcceptor,
  selectImplementationModeAcceptor,
  startAutomatedImplementationAcceptor,
  orchestrationStoryStartedAcceptor,
  orchestrationStoryCompletedAcceptor,
  updateOrchestrationPhaseAcceptor,
  pauseOrchestrationAcceptor,
  resumeOrchestrationAcceptor,
  stopOrchestrationAcceptor,
  // Code Review
  startCodeReviewAcceptor,
  addCodeReviewFindingAcceptor,
  setCodeReviewFindingsAcceptor,
  completeCodeReviewAcceptor,
  updateFindingStatusAcceptor,
  // Bug Fix Phase
  startBugFixPhaseAcceptor,
  startFixingFindingAcceptor,
  completeFixingFindingAcceptor,
  completeBugFixPhaseAcceptor,
  // Sprint Completion Statistics
  setSprintCompletionStatsAcceptor,
  toggleSprintSummaryAcceptor,
  setSprintPlanAcceptor,
  iterateSprintPlanAcceptor,
  clearPendingSprintPlanningAcceptor,
  startSprintStoryImplementationAcceptor,
  clearPendingStoryImplementationAcceptor,
  completeStoryBranchAcceptor,
  updateSprintStoryStatusAcceptor,
  updateSprintStoryAssertionsAcceptor,
  clearSprintErrorAcceptor,
  updateStoryAssertionResultsAcceptor,
  toggleCriteriaCompletionAcceptor,
  updateCriteriaValidationAcceptor,
  updateStoryCriteriaValidationAcceptor,
  startCriteriaValidationAcceptor,
  completeCriteriaValidationAcceptor,

  // Stuck Detection
  recordIterationOutputAcceptor,
  resolveStuckStateAcceptor,
  resetStuckDetectionAcceptor,

  // Active Implementation Story
  clearActiveImplementationStoryAcceptor,

  // Activity Tracking
  setCurrentToolAcceptor,
  clearCurrentToolAcceptor,
  addModifiedFileAcceptor,
  clearModifiedFilesAcceptor,
  setActivityStatusAcceptor,
  updateActivityStatusAcceptor,
  toolStartAcceptor,
  toolEndAcceptor,
  clearActivityAcceptor,

  // Developer Profile
  startGithubAuthAcceptor,
  githubAuthSuccessAcceptor,
  githubAuthErrorAcceptor,
  githubLogoutAcceptor,
  loadGithubRepositoriesAcceptor,
  selectGithubRepositoryAcceptor,
  loadGithubActivityAcceptor,
  updateGithubContributionsAcceptor,
  updateGithubSettingsAcceptor,
  updateGithubRateLimitAcceptor,
  loadDeveloperProfileAcceptor,

  // Debug
  storeDebugPromptAcceptor,
  clearDebugPromptAcceptor,
  setDebugModeAcceptor
]
