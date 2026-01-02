/**
 * Puffin Constants
 */

// Branch types for prompt history
export const BRANCH_TYPES = {
  SPECIFICATIONS: 'specifications',
  ARCHITECTURE: 'architecture',
  UI: 'ui',
  BACKEND: 'backend',
  DEPLOYMENT: 'deployment',
  TESTING: 'testing',
  DOCUMENTATION: 'documentation',
  CUSTOM: 'custom'
}

// Programming style options
export const PROGRAMMING_STYLES = {
  OOP: 'Object-Oriented Programming',
  FP: 'Functional Programming',
  TEMPORAL: 'Temporal Logic (TLA+/SAM)',
  HYBRID: 'Hybrid Approach'
}

// Testing approaches
export const TESTING_APPROACHES = {
  TDD: 'Test-Driven Development',
  BDD: 'Behavior-Driven Development',
  INTEGRATION: 'Integration First'
}

// Documentation levels
export const DOCUMENTATION_LEVELS = {
  MINIMAL: 'Minimal',
  STANDARD: 'Standard',
  COMPREHENSIVE: 'Comprehensive'
}

// Error handling strategies
export const ERROR_HANDLING = {
  EXCEPTIONS: 'Exceptions',
  RESULT: 'Result Types',
  EITHER: 'Either Monad'
}

// Naming conventions
export const NAMING_CONVENTIONS = {
  CAMEL: 'camelCase',
  SNAKE: 'snake_case',
  PASCAL: 'PascalCase'
}

// UI Layout constants
export const LAYOUT_BREAKPOINTS = {
  KANBAN_MIN_WIDTH: 1200 // Minimum width in pixels to show kanban view
}

// GUI Designer element types
export const GUI_ELEMENT_TYPES = {
  CONTAINER: 'container',
  TEXT: 'text',
  INPUT: 'input',
  BUTTON: 'button',
  IMAGE: 'image',
  LIST: 'list',
  FORM: 'form',
  NAV: 'nav',
  CARD: 'card',
  MODAL: 'modal'
}

// IPC Channels
export const IPC_CHANNELS = {
  // State operations
  STATE_INIT: 'state:init',
  STATE_GET: 'state:get',
  STATE_UPDATE_CONFIG: 'state:updateConfig',
  STATE_UPDATE_HISTORY: 'state:updateHistory',
  STATE_ADD_PROMPT: 'state:addPrompt',

  // Claude operations
  CLAUDE_CHECK: 'claude:check',
  CLAUDE_SUBMIT: 'claude:submit',
  CLAUDE_RESPONSE: 'claude:response',
  CLAUDE_COMPLETE: 'claude:complete',
  CLAUDE_ERROR: 'claude:error',
  CLAUDE_RAW: 'claude:raw',
  CLAUDE_CANCEL: 'claude:cancel',

  // File operations
  FILE_EXPORT: 'file:export',
  FILE_IMPORT: 'file:import',

  // App lifecycle
  APP_READY: 'app:ready'
}

// Application states (FSM) - Simplified for directory-based workflow
export const APP_STATES = {
  INITIALIZING: 'INITIALIZING',
  LOADING: 'LOADING',
  READY: 'READY',
  PROMPTING: 'PROMPTING',
  PROCESSING: 'PROCESSING',
  ERROR: 'ERROR'
}

// Prompt states (FSM)
export const PROMPT_STATES = {
  IDLE: 'IDLE',
  COMPOSING: 'COMPOSING',
  SUBMITTED: 'SUBMITTED',
  AWAITING: 'AWAITING_RESPONSE',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
}

// Default config template
export const DEFAULT_CONFIG = {
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
}

// Default history template
export const DEFAULT_HISTORY = {
  branches: {
    specifications: { id: 'specifications', name: 'Specifications', prompts: [] },
    architecture: { id: 'architecture', name: 'Architecture', prompts: [] },
    ui: { id: 'ui', name: 'UI', prompts: [] },
    backend: { id: 'backend', name: 'Backend', prompts: [] },
    deployment: { id: 'deployment', name: 'Deployment', prompts: [] }
  },
  activeBranch: 'specifications',
  activePromptId: null
}
