/**
 * Claude Config Plugin - Renderer Entry Point
 *
 * Exports all renderer components and registers them with Puffin
 */

import { ClaudeConfigView } from './components/index.js'
import './styles/claude-config-view.css'

/**
 * Plugin renderer module
 */
export default {
  /**
   * Initialize the renderer module
   * @param {Object} context - Renderer plugin context
   */
  init(context) {
    console.log('[claude-config-plugin] Renderer initialized')

    // Register views
    context.registerView('claude-config', ClaudeConfigView)
  },

  /**
   * Export components for direct use
   */
  components: {
    ClaudeConfigView
  }
}

export { ClaudeConfigView }
