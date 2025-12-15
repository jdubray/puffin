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
    expandedThreads: {} // Track which threads are expanded: { promptId: true }
  },

  // GUI Designer state
  guiElements: [],
  selectedGuiElement: null,

  // Architecture state (from .puffin/architecture.md)
  architecture: {
    content: '',
    updatedAt: null
  },

  // User stories state (from .puffin/user-stories.json)
  userStories: [],

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
  currentView: 'prompt', // 'config', 'prompt', 'designer', 'user-stories', 'architecture', 'cli-output'
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
    model.userStories = state.userStories || []
    model.uiGuidelines = state.uiGuidelines || model.uiGuidelines

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
      return
    }

    // Find the prompt and update its response
    let foundPrompt = false
    for (const [branchId, branch] of Object.entries(model.history.branches)) {
      const prompt = branch.prompts.find(p => p.id === model.pendingPromptId)
      if (prompt) {
        console.log('[ACCEPTOR-DEBUG] Found prompt in branch:', branchId, 'promptId:', prompt.id)

        prompt.response = {
          content: proposal.payload.content,
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

export const selectBranchAcceptor = model => proposal => {
  if (proposal?.type === 'SELECT_BRANCH') {
    const newBranchId = proposal.payload.branchId
    if (model.history.branches[newBranchId]) {
      model.history.activeBranch = newBranchId

      // Reset activePromptId when switching branches
      // Set to the most recent prompt in the new branch, or null if empty
      const newBranch = model.history.branches[newBranchId]
      if (newBranch.prompts && newBranch.prompts.length > 0) {
        // Select the most recent prompt in the new branch
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
    // Navigate to prompt view when selecting a prompt/thread
    model.currentView = 'prompt'
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

export const markThreadCompleteAcceptor = model => proposal => {
  if (proposal?.type === 'MARK_THREAD_COMPLETE') {
    const { promptId } = proposal.payload
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
        break
      }
    }
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
 * User Story Acceptors
 */

export const addUserStoryAcceptor = model => proposal => {
  if (proposal?.type === 'ADD_USER_STORY') {
    model.userStories.push({
      id: proposal.payload.id,
      title: proposal.payload.title,
      description: proposal.payload.description,
      acceptanceCriteria: proposal.payload.acceptanceCriteria,
      status: proposal.payload.status,
      sourcePromptId: proposal.payload.sourcePromptId,
      createdAt: proposal.payload.createdAt
    })
  }
}

export const updateUserStoryAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_USER_STORY') {
    const index = model.userStories.findIndex(s => s.id === proposal.payload.id)
    if (index !== -1) {
      model.userStories[index] = {
        ...model.userStories[index],
        ...proposal.payload
      }
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
    model.userStories = proposal.payload.stories || []
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
  }
}

export const receiveDerivedStoriesAcceptor = model => proposal => {
  if (proposal?.type === 'RECEIVE_DERIVED_STORIES') {
    model.storyDerivation.status = 'reviewing'
    model.storyDerivation.pendingStories = proposal.payload.stories
    model.storyDerivation.originalPrompt = proposal.payload.originalPrompt
    // Show the review modal
    model.modal = {
      type: 'user-story-review',
      data: {}
    }
  }
}

export const markStoryReadyAcceptor = model => proposal => {
  if (proposal?.type === 'MARK_STORY_READY') {
    const story = model.storyDerivation.pendingStories.find(
      s => s.id === proposal.payload.storyId
    )
    if (story) {
      story.status = 'ready'
    }
  }
}

export const unmarkStoryReadyAcceptor = model => proposal => {
  if (proposal?.type === 'UNMARK_STORY_READY') {
    const story = model.storyDerivation.pendingStories.find(
      s => s.id === proposal.payload.storyId
    )
    if (story) {
      story.status = 'pending'
    }
  }
}

export const updateDerivedStoryAcceptor = model => proposal => {
  if (proposal?.type === 'UPDATE_DERIVED_STORY') {
    const story = model.storyDerivation.pendingStories.find(
      s => s.id === proposal.payload.storyId
    )
    if (story) {
      Object.assign(story, proposal.payload.updates)
    }
  }
}

export const deleteDerivedStoryAcceptor = model => proposal => {
  if (proposal?.type === 'DELETE_DERIVED_STORY') {
    model.storyDerivation.pendingStories = model.storyDerivation.pendingStories.filter(
      s => s.id !== proposal.payload.storyId
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

    // Add each story to the backlog (userStories)
    const sourceBranchId = model.storyDerivation.branchId || null
    selectedStories.forEach(story => {
      model.userStories.push({
        id: story.id,
        branchId: sourceBranchId,
        title: story.title,
        description: story.description,
        acceptanceCriteria: story.acceptanceCriteria,
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

    // Reset derivation state
    model.storyDerivation.status = 'idle'
    model.storyDerivation.pendingStories = []
    model.storyDerivation.originalPrompt = null
    model.storyDerivation.branchId = null

    // Close modal
    model.modal = null
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
 * Start implementation for selected stories
 * - Updates story status to 'in-progress'
 * - Uses the currently active branch for implementation
 * - Adds branch-specific context (UI guidelines for ui branch, architecture for others)
 * - Tracks which branches have implemented each story
 */
export const startStoryImplementationAcceptor = model => proposal => {
  if (proposal?.type === 'START_STORY_IMPLEMENTATION') {
    const { stories } = proposal.payload

    if (!stories || stories.length === 0) return

    // Use the currently active branch for implementation
    const branchId = model.history.activeBranch || 'backend'

    // Update story statuses to in-progress and track implementation branch
    stories.forEach(story => {
      const existingStory = model.userStories.find(s => s.id === story.id)
      if (existingStory) {
        existingStory.status = 'in-progress'
        existingStory.updatedAt = Date.now()
        // Track which branches have implemented this story
        if (!existingStory.implementedOn) {
          existingStory.implementedOn = []
        }
        if (!existingStory.implementedOn.includes(branchId)) {
          existingStory.implementedOn.push(branchId)
        }
      }
    })

    // Build implementation prompt with numbered acceptance criteria
    const storyDescriptions = stories.map((story, i) => {
      let desc = `### Story ${i + 1}: ${story.title}\n`
      if (story.description) {
        desc += `${story.description}\n`
      }
      if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
        desc += `\n**Acceptance Criteria:**\n`
        desc += story.acceptanceCriteria.map((c, idx) => `${idx + 1}. ${c}`).join('\n')
      }
      return desc
    }).join('\n\n')

    // Build branch-specific context
    let branchContext = ''
    if (branchId === 'ui') {
      branchContext = buildUiBranchContext(model)
    } else if (branchId === 'architecture') {
      branchContext = buildArchitectureBranchContext(model)
    } else if (branchId === 'backend') {
      branchContext = buildBackendBranchContext(model)
    }

    const promptContent = `Please implement the following user ${stories.length === 1 ? 'story' : 'stories'}:

${storyDescriptions}
${branchContext}
**Instructions:**
1. First, think hard about the implementation approach and create a detailed plan
2. Consider the existing codebase structure and patterns
3. Identify all files that need to be created or modified
4. Then implement the changes step by step

**Criteria Verification Requirements:**
After completing the implementation, you MUST verify each numbered acceptance criterion and report its status using this format:

- ✅ Criterion N: [Brief explanation of how the implementation satisfies this criterion]
- ⚠️ Criterion N: [Partially implemented - describe what's done and what's missing]
- ❌ Criterion N: [Not implemented - explain why or what's blocking]

**Important:** Do not skip any criteria. Every numbered criterion must have a verification status in your final response.

Please start by outlining your implementation plan, then proceed with the implementation, and conclude with the criteria verification.`

    // Ensure branch exists
    if (!model.history.branches[branchId]) {
      model.history.branches[branchId] = {
        id: branchId,
        name: branchId.charAt(0).toUpperCase() + branchId.slice(1),
        prompts: []
      }
    }

    // Create prompt entry (response will be filled by Claude)
    const promptId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
    const prompt = {
      id: promptId,
      content: promptContent,
      parentId: null,
      timestamp: Date.now(),
      response: null, // Will be filled when Claude responds
      storyIds: stories.map(s => s.id) // Track which stories this implements
    }

    // Add to branch
    model.history.branches[branchId].prompts.push(prompt)

    // Keep the active branch (don't switch)
    model.history.activePromptId = promptId

    // Set pending prompt for streaming
    model.pendingPromptId = promptId
    model.streamingResponse = ''

    // Switch view to prompt
    model.currentView = 'prompt'

    // Store implementation context for IPC submission
    model._pendingImplementation = {
      promptId,
      promptContent,
      branchId,
      storyIds: stories.map(s => s.id)
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
 * UI Navigation Acceptors
 */

export const switchViewAcceptor = model => proposal => {
  if (proposal?.type === 'SWITCH_VIEW') {
    const validViews = ['config', 'prompt', 'designer', 'user-stories', 'architecture', 'cli-output', 'profile']
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
    console.log('[HIDE_MODAL] Acceptor called - hiding modal')
    console.log('[HIDE_MODAL] Stack trace:', new Error().stack)
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
  rerunPromptAcceptor,
  clearRerunRequestAcceptor,
  selectBranchAcceptor,
  createBranchAcceptor,
  deleteBranchAcceptor,
  selectPromptAcceptor,
  toggleThreadExpandedAcceptor,
  markThreadCompleteAcceptor,
  unmarkThreadCompleteAcceptor,

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

  // User Stories
  addUserStoryAcceptor,
  updateUserStoryAcceptor,
  deleteUserStoryAcceptor,
  loadUserStoriesAcceptor,

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
  startStoryImplementationAcceptor,

  // UI Navigation
  switchViewAcceptor,
  toggleSidebarAcceptor,
  showModalAcceptor,
  hideModalAcceptor,

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
  loadDeveloperProfileAcceptor
]
