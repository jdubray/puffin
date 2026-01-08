/**
 * Toast History Plugin - Entry Point
 *
 * Provides a view for displaying toast notification history.
 * Storage and retrieval is handled by the core puffin-state.js via
 * window.puffin.toastHistory API in the renderer.
 *
 * This plugin primarily exists to:
 * 1. Register the toast-history-view in the navigation
 * 2. Provide the ToastHistoryComponent renderer component
 */

const ToastHistoryPlugin = {
  context: null,

  /**
   * Activate the plugin
   * @param {Object} context - Plugin context from PluginManager
   */
  async activate(context) {
    this.context = context

    // View registration is handled declaratively via puffin-plugin.json
    // The contributes.views section registers the toast-history-view

    context.log.info('Toast History plugin activated')
    context.log.debug('Toast history storage delegated to core puffin-state.js')
  },

  /**
   * Deactivate the plugin
   */
  async deactivate() {
    this.context.log.info('Toast History plugin deactivated')
  }
}

module.exports = ToastHistoryPlugin
