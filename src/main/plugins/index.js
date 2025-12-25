/**
 * Puffin Plugin System
 *
 * Main exports for the plugin system.
 */

const { ManifestValidator, ManifestValidationError } = require('./manifest-validator')
const { PluginLoader, Plugin, PluginLoadState, PluginLifecycleState } = require('./plugin-loader')
const { PluginContext } = require('./plugin-context')
const { PluginRegistry } = require('./plugin-registry')
const { PluginStateStore } = require('./plugin-state-store')
const { PluginManager } = require('./plugin-manager')
const { ViewRegistry } = require('./view-registry')
const {
  parseViewContributions,
  validateViewContribution,
  logContributionErrors,
  getViewsByLocation,
  getViewLocations,
  mergeViewContributions,
  VALID_VIEW_LOCATIONS
} = require('./contribution-parser')

module.exports = {
  ManifestValidator,
  ManifestValidationError,
  PluginLoader,
  Plugin,
  PluginLoadState,
  PluginLifecycleState,
  PluginContext,
  PluginRegistry,
  PluginStateStore,
  PluginManager,
  ViewRegistry,
  // Contribution parser exports
  parseViewContributions,
  validateViewContribution,
  logContributionErrors,
  getViewsByLocation,
  getViewLocations,
  mergeViewContributions,
  VALID_VIEW_LOCATIONS
}
