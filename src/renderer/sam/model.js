/**
 * Puffin SAM Model (Acceptors)
 *
 * Acceptors validate and apply proposals to the model.
 * They ensure the model remains consistent and valid.
 *
 * State is automatically persisted to .puffin/ directory via IPC.
 * No explicit save/load - Puffin opens a directory and state is always synced.
 */

import { validatePrompt } from '../../shared/validators.js'

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
    },
    helpMode: false
  },

  // Prompt state
  currentPrompt: {
    content: '',
    branchId: null
  },
  pendingPromptId: null,
  streamingResponse: '',

  // History state (from .puffin/history.json)
  // Single implicit stream: 'main' is the only branch; the internal shape is
  // kept for plumbing compatibility (prompt chains still link via parentId).
  history: {
    branches: {
      main: { id: 'main', name: 'Main', prompts: [] }
    },
    activeBranch: 'main',
    activePromptId: null,
    expandedThreads: {}, // Track which threads are expanded: { promptId: true }
    threadSearchQuery: '' // Search query for filtering threads
  },

  // User stories state (from .puffin/user-stories.json)
  userStories: [],

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

  // Website Edition — Visual Feedback Loop (ephemeral, not persisted)
  puppeteerLoop: false,

  // UI Guidelines specific UI state
  activeGuidelinesTab: 'guidelines', // 'guidelines', 'stylesheets', 'tokens', 'patterns'
  activeGuidelinesSection: 'layout', // 'layout', 'typography', 'colors', 'components', 'interactions'
  selectedStylesheet: null,
  selectedComponentPattern: null,

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
    model.storyGenerations = state.storyGenerations || model.storyGenerations
    model.uiGuidelines = state.uiGuidelines || model.uiGuidelines

    // Clear any in-progress state from previous session
    // This ensures the prompt textarea is enabled on startup
    model.pendingPromptId = null
    model.streamingResponse = ''

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
      // Which composer this turn came from; older entries have no surface and
      // are read as 'prompt'.
      surface: proposal.payload.surface || 'prompt',
      workspaceId: proposal.payload.workspaceId || null,
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

export const setPendingPromptIdAcceptor = model => proposal => {
  if (proposal?.type === 'SET_PENDING_PROMPT_ID') {
    model.pendingPromptId = proposal.payload.promptId
    model.streamingResponse = ''
    model.appError = null
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
    console.log('[DELETE-DEBUG] deleteUserStoryAcceptor called with storyId:', proposal.payload.id, 'current story count:', model.userStories.length)
    model.userStories = model.userStories.filter(s => s.id !== proposal.payload.id)
    console.log('[DELETE-DEBUG] After filter, story count:', model.userStories.length)
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

// Add a synthetic prompt entry to branch history (for CRE plan/RIS/assertion visibility)
export const addSyntheticPromptAcceptor = model => proposal => {
  if (proposal?.type === 'ADD_SYNTHETIC_PROMPT') {
    const { id, branchId, content, responseContent, title, parentId, timestamp } = proposal.payload

    // Ensure branch exists
    if (!model.history.branches[branchId]) {
      model.history.branches[branchId] = {
        id: branchId,
        name: branchId.charAt(0).toUpperCase() + branchId.slice(1),
        prompts: []
      }
    }

    const prompt = {
      id,
      parentId: parentId || null,
      content,
      title: title || null,
      timestamp,
      response: {
        content: responseContent,
        timestamp
      },
      children: []
    }

    // If parentId, add to parent's children array
    if (parentId) {
      const parent = model.history.branches[branchId].prompts.find(p => p.id === parentId)
      if (parent) {
        if (!parent.children) parent.children = []
        parent.children.push(id)
      }
    }

    model.history.branches[branchId].prompts.push(prompt)
    model.history.activeBranch = branchId
    model.history.activePromptId = id

    // Navigate to prompt view so the user sees the entry
    model.currentView = 'prompt'

    console.log(`[CRE] Synthetic prompt added to ${branchId}:`, title || id)
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

/**
 * UI Navigation Acceptors
 */

export const switchViewAcceptor = model => proposal => {
  if (proposal?.type === 'SWITCH_VIEW') {
    // Core views plus plugin-contributed views (e.g., 'designer' from designer-plugin)
    const validViews = ['config', 'prompt', 'specs', 'board', 'docs', 'user-stories', 'cli-output', 'polygraph', 'profile', 'git', 'debug', 'designer']
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

/**
 * Toggle the Puppeteer Visual Feedback Loop on/off.
 * Ephemeral — resets to false on page reload.
 */
export const setPuppeteerLoopAcceptor = model => proposal => {
  if (proposal?.type === 'SET_PUPPETEER_LOOP') {
    model.puppeteerLoop = !!proposal.payload.enabled
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
  setPendingPromptIdAcceptor,
  rerunPromptAcceptor,
  clearRerunRequestAcceptor,
  requestContinueAcceptor,
  clearContinueRequestAcceptor,
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

  // Story Generation Tracking
  loadStoryGenerationsAcceptor,
  createStoryGenerationAcceptor,
  updateGeneratedStoryFeedbackAcceptor,
  finalizeStoryGenerationAcceptor,

  // UI Navigation
  switchViewAcceptor,
  toggleSidebarAcceptor,
  showModalAcceptor,
  hideModalAcceptor,

  // Synthetic prompt (CRE plan/RIS/assertion visibility)
  addSyntheticPromptAcceptor,

  // Stuck Detection
  recordIterationOutputAcceptor,
  resolveStuckStateAcceptor,
  resetStuckDetectionAcceptor,

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
  setDebugModeAcceptor,

  // Website Edition — Puppeteer Visual Loop
  setPuppeteerLoopAcceptor
]
