/**
 * Puffin SAM Instance
 *
 * This module creates and exports the main SAM instance for the application.
 * SAM (State-Action-Model) provides a unidirectional data flow pattern
 * based on TLA+ semantics.
 *
 * Simplified for directory-based workflow - no project selection needed.
 */

import { createInstance } from '../lib/sam-pattern.js'
import { fsm } from '../lib/sam-fsm.js'
import { APP_STATES, PROMPT_STATES } from '../../shared/constants.js'

// Create the main SAM instance
export const SAM = createInstance({
  instanceName: 'Puffin'
})

/**
 * Application FSM
 * Simplified - Puffin opens directly into a project directory
 */
export const appFsm = fsm({
  pc: 'appState',
  pc0: APP_STATES.INITIALIZING,
  deterministic: true,
  enforceAllowedActions: false, // More flexible for directory-based workflow

  actions: {
    INITIALIZE_APP: [APP_STATES.LOADING],
    LOAD_STATE: [APP_STATES.READY],
    START_PROMPTING: [APP_STATES.PROMPTING],
    SUBMIT_PROMPT: [APP_STATES.PROCESSING],
    COMPLETE_RESPONSE: [APP_STATES.READY],
    APP_ERROR: [APP_STATES.ERROR],
    RECOVER: [APP_STATES.READY]
  },

  states: {
    [APP_STATES.INITIALIZING]: {
      transitions: ['INITIALIZE_APP', 'APP_ERROR']
    },
    [APP_STATES.LOADING]: {
      transitions: ['LOAD_STATE', 'APP_ERROR']
    },
    [APP_STATES.READY]: {
      transitions: ['START_PROMPTING', 'SUBMIT_PROMPT', 'APP_ERROR']
    },
    [APP_STATES.PROMPTING]: {
      transitions: ['SUBMIT_PROMPT', 'APP_ERROR']
    },
    [APP_STATES.PROCESSING]: {
      transitions: ['COMPLETE_RESPONSE', 'APP_ERROR']
    },
    [APP_STATES.ERROR]: {
      transitions: ['RECOVER']
    }
  }
})

/**
 * Prompt FSM
 * Tracks individual prompt lifecycle
 */
export const promptFsm = fsm({
  pc: 'promptState',
  pc0: PROMPT_STATES.IDLE,
  deterministic: true,
  enforceAllowedActions: false,

  actions: {
    START_COMPOSE: [PROMPT_STATES.COMPOSING],
    SUBMIT_PROMPT: [PROMPT_STATES.SUBMITTED],
    RECEIVE_RESPONSE_CHUNK: [PROMPT_STATES.AWAITING],
    COMPLETE_RESPONSE: [PROMPT_STATES.COMPLETED],
    RESPONSE_ERROR: [PROMPT_STATES.FAILED],
    CANCEL_PROMPT: [PROMPT_STATES.IDLE]
  },

  states: {
    [PROMPT_STATES.IDLE]: {
      transitions: ['START_COMPOSE']
    },
    [PROMPT_STATES.COMPOSING]: {
      transitions: ['SUBMIT_PROMPT', 'CANCEL_PROMPT']
    },
    [PROMPT_STATES.SUBMITTED]: {
      transitions: ['RECEIVE_RESPONSE_CHUNK', 'RESPONSE_ERROR', 'CANCEL_PROMPT']
    },
    [PROMPT_STATES.AWAITING]: {
      transitions: ['RECEIVE_RESPONSE_CHUNK', 'COMPLETE_RESPONSE', 'RESPONSE_ERROR', 'CANCEL_PROMPT']
    },
    [PROMPT_STATES.COMPLETED]: {
      transitions: ['START_COMPOSE']
    },
    [PROMPT_STATES.FAILED]: {
      transitions: ['START_COMPOSE']
    }
  }
})

// Export FSM utilities
export const fsms = {
  app: appFsm,
  prompt: promptFsm
}
