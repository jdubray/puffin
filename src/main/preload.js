/**
 * Puffin - Preload Script
 *
 * Exposes a safe API to the renderer process via contextBridge.
 * This is the only bridge between the renderer and main process.
 */

const { contextBridge, ipcRenderer } = require('electron')

/**
 * Puffin API exposed to renderer
 */
contextBridge.exposeInMainWorld('puffin', {
  /**
   * State operations (replaces project operations)
   * State is automatically persisted to .puffin/ directory
   */
  state: {
    // Initialize state from .puffin/ (creates if doesn't exist)
    init: () => ipcRenderer.invoke('state:init'),

    // Get current state
    get: () => ipcRenderer.invoke('state:get'),

    // Update config (partial updates)
    updateConfig: (updates) => ipcRenderer.invoke('state:updateConfig', updates),

    // Update full history
    updateHistory: (history) => ipcRenderer.invoke('state:updateHistory', history),

    // Add a prompt to history
    addPrompt: (branchId, prompt) => ipcRenderer.invoke('state:addPrompt', { branchId, prompt }),

    // Update a prompt's response
    updatePromptResponse: (branchId, promptId, response) =>
      ipcRenderer.invoke('state:updatePromptResponse', { branchId, promptId, response }),

    // Update architecture document
    updateArchitecture: (content) => ipcRenderer.invoke('state:updateArchitecture', content),

    // GUI design operations (legacy)
    saveGuiDesign: (name, design) => ipcRenderer.invoke('state:saveGuiDesign', { name, design }),
    listGuiDesigns: () => ipcRenderer.invoke('state:listGuiDesigns'),
    loadGuiDesign: (filename) => ipcRenderer.invoke('state:loadGuiDesign', filename),

    // GUI definition operations
    saveGuiDefinition: (name, description, elements) =>
      ipcRenderer.invoke('state:saveGuiDefinition', { name, description, elements }),
    listGuiDefinitions: () => ipcRenderer.invoke('state:listGuiDefinitions'),
    loadGuiDefinition: (filename) => ipcRenderer.invoke('state:loadGuiDefinition', filename),
    updateGuiDefinition: (filename, updates) =>
      ipcRenderer.invoke('state:updateGuiDefinition', { filename, updates }),
    deleteGuiDefinition: (filename) => ipcRenderer.invoke('state:deleteGuiDefinition', filename),

    // User story operations
    getUserStories: () => ipcRenderer.invoke('state:getUserStories'),
    addUserStory: (story) => ipcRenderer.invoke('state:addUserStory', story),
    updateUserStory: (storyId, updates) =>
      ipcRenderer.invoke('state:updateUserStory', { storyId, updates }),
    deleteUserStory: (storyId) => ipcRenderer.invoke('state:deleteUserStory', storyId),

    // Sprint operations
    updateActiveSprint: (sprint) => ipcRenderer.invoke('state:updateActiveSprint', sprint),

    // Sprint progress tracking
    updateSprintStoryProgress: (storyId, branchType, progressUpdate) =>
      ipcRenderer.invoke('state:updateSprintStoryProgress', { storyId, branchType, progressUpdate }),
    getSprintProgress: () => ipcRenderer.invoke('state:getSprintProgress'),

    // Story generation tracking operations
    getStoryGenerations: () => ipcRenderer.invoke('state:getStoryGenerations'),
    addStoryGeneration: (generation) => ipcRenderer.invoke('state:addStoryGeneration', generation),
    updateStoryGeneration: (generationId, updates) =>
      ipcRenderer.invoke('state:updateStoryGeneration', { generationId, updates }),
    updateGeneratedStoryFeedback: (generationId, storyId, feedback) =>
      ipcRenderer.invoke('state:updateGeneratedStoryFeedback', { generationId, storyId, feedback }),
    addImplementationJourney: (journey) => ipcRenderer.invoke('state:addImplementationJourney', journey),
    updateImplementationJourney: (journeyId, updates) =>
      ipcRenderer.invoke('state:updateImplementationJourney', { journeyId, updates }),
    addImplementationInput: (journeyId, input) =>
      ipcRenderer.invoke('state:addImplementationInput', { journeyId, input }),
    exportStoryGenerations: () => ipcRenderer.invoke('state:exportStoryGenerations'),

    // UI Guidelines operations
    updateUiGuidelines: (updates) => ipcRenderer.invoke('state:updateUiGuidelines', updates),
    updateGuidelineSection: (section, content) =>
      ipcRenderer.invoke('state:updateGuidelineSection', { section, content }),

    // Stylesheet operations
    addStylesheet: (stylesheet) => ipcRenderer.invoke('state:addStylesheet', stylesheet),
    updateStylesheet: (stylesheetId, updates) =>
      ipcRenderer.invoke('state:updateStylesheet', { stylesheetId, updates }),
    deleteStylesheet: (stylesheetId) => ipcRenderer.invoke('state:deleteStylesheet', stylesheetId),

    // Design tokens operations
    updateDesignTokens: (tokenUpdates) => ipcRenderer.invoke('state:updateDesignTokens', tokenUpdates),

    // Component pattern operations
    addComponentPattern: (pattern) => ipcRenderer.invoke('state:addComponentPattern', pattern),
    updateComponentPattern: (patternId, updates) =>
      ipcRenderer.invoke('state:updateComponentPattern', { patternId, updates }),
    deleteComponentPattern: (patternId) => ipcRenderer.invoke('state:deleteComponentPattern', patternId),

    // Export UI guidelines
    exportUiGuidelines: (options) => ipcRenderer.invoke('state:exportUiGuidelines', options),

    // Generate Claude.md file (legacy)
    generateClaudeMd: (options) => ipcRenderer.invoke('state:generateClaudeMd', options),

    // Activate branch - swaps CLAUDE.md to branch-specific content
    activateBranch: (branchId) => ipcRenderer.invoke('state:activateBranch', branchId)
  },

  /**
   * Claude CLI operations
   */
  claude: {
    // Check if Claude CLI is installed and available
    check: () => ipcRenderer.invoke('claude:check'),

    // Submit a prompt to Claude CLI
    submit: (data) => ipcRenderer.send('claude:submit', data),

    // Cancel the current request
    cancel: () => ipcRenderer.send('claude:cancel'),

    // Subscribe to streaming response chunks
    onResponse: (callback) => {
      const handler = (event, chunk) => callback(chunk)
      ipcRenderer.on('claude:response', handler)
      return () => ipcRenderer.removeListener('claude:response', handler)
    },

    // Subscribe to completion event
    onComplete: (callback) => {
      const handler = (event, response) => callback(response)
      ipcRenderer.on('claude:complete', handler)
      return () => ipcRenderer.removeListener('claude:complete', handler)
    },

    // Subscribe to error event
    onError: (callback) => {
      const handler = (event, error) => callback(error)
      ipcRenderer.on('claude:error', handler)
      return () => ipcRenderer.removeListener('claude:error', handler)
    },

    // Subscribe to raw JSON messages (for CLI Output view)
    onRawMessage: (callback) => {
      const handler = (event, jsonLine) => callback(jsonLine)
      ipcRenderer.on('claude:raw', handler)
      return () => ipcRenderer.removeListener('claude:raw', handler)
    },

    // User Story Derivation Operations
    // Derive user stories from a prompt
    deriveStories: (data) => ipcRenderer.send('claude:deriveStories', data),

    // Modify stories based on feedback
    modifyStories: (data) => ipcRenderer.send('claude:modifyStories', data),

    // Subscribe to stories derived event
    onStoriesDerived: (callback) => {
      const handler = (event, data) => callback(data)
      ipcRenderer.on('claude:storiesDerived', handler)
      return () => ipcRenderer.removeListener('claude:storiesDerived', handler)
    },

    // Subscribe to story derivation error event
    onStoryDerivationError: (callback) => {
      const handler = (event, error) => callback(error)
      ipcRenderer.on('claude:storyDerivationError', handler)
      return () => ipcRenderer.removeListener('claude:storyDerivationError', handler)
    },

    // Subscribe to story derivation progress (for debugging)
    onDerivationProgress: (callback) => {
      const handler = (event, data) => callback(data)
      ipcRenderer.on('claude:derivationProgress', handler)
      return () => ipcRenderer.removeListener('claude:derivationProgress', handler)
    },

    // Generate a title for a prompt (used for new threads)
    generateTitle: (content) => ipcRenderer.invoke('claude:generateTitle', content),

    // Send a simple prompt and get a response (non-streaming)
    sendPrompt: (prompt, options = {}) => ipcRenderer.invoke('claude:sendPrompt', prompt, options)
  },

  /**
   * File operations
   */
  file: {
    export: (data) => ipcRenderer.invoke('file:export', data),
    import: (type) => ipcRenderer.invoke('file:import', type),
    saveMarkdown: (content) => ipcRenderer.invoke('file:saveMarkdown', content)
  },

  /**
   * Developer profile operations
   */
  profile: {
    // Get the current developer profile
    get: () => ipcRenderer.invoke('profile:get'),

    // Check if a profile exists
    exists: () => ipcRenderer.invoke('profile:exists'),

    // Create a new developer profile
    create: (profileData) => ipcRenderer.invoke('profile:create', profileData),

    // Update the developer profile
    update: (updates) => ipcRenderer.invoke('profile:update', updates),

    // Delete the developer profile
    delete: () => ipcRenderer.invoke('profile:delete'),

    // Export profile to file (opens save dialog)
    export: () => ipcRenderer.invoke('profile:export'),

    // Import profile from file (opens open dialog)
    import: (options) => ipcRenderer.invoke('profile:import', options),

    // Get available coding style options
    getOptions: () => ipcRenderer.invoke('profile:getOptions'),

    // Validate profile data without saving
    validate: (profileData) => ipcRenderer.invoke('profile:validate', profileData)
  },

  /**
   * Git repository operations
   */
  git: {
    // Check if Git is installed and available
    isAvailable: () => ipcRenderer.invoke('git:isAvailable'),

    // Check if project is a Git repository
    isRepository: () => ipcRenderer.invoke('git:isRepository'),

    // Get repository status (branch, files, ahead/behind)
    getStatus: () => ipcRenderer.invoke('git:getStatus'),

    // Get current branch name
    getCurrentBranch: () => ipcRenderer.invoke('git:getCurrentBranch'),

    // Get list of all branches
    getBranches: () => ipcRenderer.invoke('git:getBranches'),

    // Validate a branch name
    validateBranchName: (name) => ipcRenderer.invoke('git:validateBranchName', name),

    // Create a new branch
    createBranch: (name, prefix, checkout = true) =>
      ipcRenderer.invoke('git:createBranch', { name, prefix, checkout }),

    // Checkout a branch
    checkout: (name) => ipcRenderer.invoke('git:checkout', name),

    // Stage files for commit
    stageFiles: (files) => ipcRenderer.invoke('git:stageFiles', files),

    // Unstage files
    unstageFiles: (files) => ipcRenderer.invoke('git:unstageFiles', files),

    // Create a commit
    commit: (message, sessionId = null) =>
      ipcRenderer.invoke('git:commit', { message, sessionId }),

    // Merge a branch into current branch
    merge: (sourceBranch, noFf = false) =>
      ipcRenderer.invoke('git:merge', { sourceBranch, noFf }),

    // Abort an ongoing merge
    abortMerge: () => ipcRenderer.invoke('git:abortMerge'),

    // Delete a branch
    deleteBranch: (name, force = false) =>
      ipcRenderer.invoke('git:deleteBranch', { name, force }),

    // Get commit log
    getLog: (options = {}) => ipcRenderer.invoke('git:getLog', options),

    // Get diff
    getDiff: (options = {}) => ipcRenderer.invoke('git:getDiff', options),

    // Get Git settings
    getSettings: () => ipcRenderer.invoke('git:getSettings'),

    // Update Git settings
    updateSettings: (settings) => ipcRenderer.invoke('git:updateSettings', settings),

    // Get Git operation history (tracked by Puffin)
    getOperationHistory: (options = {}) =>
      ipcRenderer.invoke('git:getOperationHistory', options),

    // Configure Git user identity
    configureUserIdentity: (name, email, global = false) =>
      ipcRenderer.invoke('git:configureUserIdentity', { name, email, global }),

    // Get Git user identity
    getUserIdentity: (global = false) =>
      ipcRenderer.invoke('git:getUserIdentity', global)
  },

  /**
   * GitHub integration operations
   */
  github: {
    // Connect with Personal Access Token
    connectWithPAT: (token) => ipcRenderer.invoke('github:connectWithPAT', token),

    // Start OAuth Device Flow authentication
    startAuth: () => ipcRenderer.invoke('github:startAuth'),

    // Open GitHub verification URL in browser
    openAuth: (verificationUri) => ipcRenderer.invoke('github:openAuth', verificationUri),

    // Open external URL (for generating PAT)
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

    // Poll for access token (call after user authorizes in browser)
    pollToken: (deviceCode, interval, expiresIn) =>
      ipcRenderer.invoke('github:pollToken', { deviceCode, interval, expiresIn }),

    // Check if GitHub is connected
    isConnected: () => ipcRenderer.invoke('github:isConnected'),

    // Disconnect GitHub from profile
    disconnect: () => ipcRenderer.invoke('github:disconnect'),

    // Refresh GitHub profile data
    refreshProfile: () => ipcRenderer.invoke('github:refreshProfile'),

    // Fetch user's repositories
    getRepositories: (options) => ipcRenderer.invoke('github:getRepositories', options),

    // Fetch user's activity events
    getActivity: (perPage) => ipcRenderer.invoke('github:getActivity', perPage)
  },

  /**
   * App lifecycle
   */
  app: {
    // Called when app is ready, receives initial project info
    onReady: (callback) => {
      const handler = (event, data) => callback(data)
      ipcRenderer.on('app:ready', handler)
      return () => ipcRenderer.removeListener('app:ready', handler)
    }
  },

  /**
   * Menu event listeners (for Electron menu actions)
   */
  menu: {
    // Profile menu actions
    onProfileView: (callback) => {
      const handler = () => callback()
      ipcRenderer.on('profile:view', handler)
      return () => ipcRenderer.removeListener('profile:view', handler)
    },
    onProfileCreate: (callback) => {
      const handler = () => callback()
      ipcRenderer.on('profile:create', handler)
      return () => ipcRenderer.removeListener('profile:create', handler)
    },
    onProfileEdit: (callback) => {
      const handler = () => callback()
      ipcRenderer.on('profile:edit', handler)
      return () => ipcRenderer.removeListener('profile:edit', handler)
    },
    onProfileExport: (callback) => {
      const handler = () => callback()
      ipcRenderer.on('profile:export', handler)
      return () => ipcRenderer.removeListener('profile:export', handler)
    },
    onProfileImport: (callback) => {
      const handler = () => callback()
      ipcRenderer.on('profile:import', handler)
      return () => ipcRenderer.removeListener('profile:import', handler)
    },
    onProfileDelete: (callback) => {
      const handler = () => callback()
      ipcRenderer.on('profile:delete', handler)
      return () => ipcRenderer.removeListener('profile:delete', handler)
    }
  },

  /**
   * Platform info
   */
  platform: process.platform,

  /**
   * Version info
   */
  version: '0.1.0'
})
