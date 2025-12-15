/**
 * Available Claude models for Puffin
 *
 * These are the models available through Claude Code CLI.
 * Users can select a default model in settings and override per-thread.
 */

export const CLAUDE_MODELS = [
  {
    id: 'opus',
    name: 'Claude Opus',
    description: 'Most capable, best for complex tasks',
    tier: 'premium'
  },
  {
    id: 'sonnet',
    name: 'Claude Sonnet',
    description: 'Balanced performance and speed',
    tier: 'standard'
  },
  {
    id: 'haiku',
    name: 'Claude Haiku',
    description: 'Fast and lightweight',
    tier: 'fast'
  }
]

// Default model for new projects
export const DEFAULT_MODEL = 'sonnet'

// Model for quick operations (title generation, etc.)
export const FAST_MODEL = 'haiku'
