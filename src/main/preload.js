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

    // GUI design operations
    saveGuiDesign: (name, design) => ipcRenderer.invoke('state:saveGuiDesign', { name, design }),
    listGuiDesigns: () => ipcRenderer.invoke('state:listGuiDesigns'),
    loadGuiDesign: (filename) => ipcRenderer.invoke('state:loadGuiDesign', filename)
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
    }
  },

  /**
   * File operations
   */
  file: {
    export: (data) => ipcRenderer.invoke('file:export', data),
    import: (type) => ipcRenderer.invoke('file:import', type)
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
   * Platform info
   */
  platform: process.platform,

  /**
   * Version info
   */
  version: '0.1.0'
})
