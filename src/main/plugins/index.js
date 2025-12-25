/**
 * Puffin Plugin System
 *
 * Main exports for the plugin system.
 */

const { ManifestValidator, ManifestValidationError } = require('./manifest-validator')
const { PluginLoader, Plugin } = require('./plugin-loader')
const { PluginContext } = require('./plugin-context')
const { PluginRegistry } = require('./plugin-registry')
const { PluginStateStore } = require('./plugin-state-store')
const { PluginManager } = require('./plugin-manager')

module.exports = {
  ManifestValidator,
  ManifestValidationError,
  PluginLoader,
  Plugin,
  PluginContext,
  PluginRegistry,
  PluginStateStore,
  PluginManager
}
