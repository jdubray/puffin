/**
 * Contribution Parser
 *
 * Parses and validates plugin contributions from manifests.
 * Handles view contributions, commands, menus, and other extension points.
 */

/**
 * Valid view locations in the Puffin UI
 * @type {string[]}
 */
const VALID_VIEW_LOCATIONS = [
  'sidebar',    // Left sidebar panel
  'panel',      // Bottom panel area
  'statusbar',  // Status bar widgets
  'toolbar',    // Top toolbar area
  'editor',     // Editor area views
  'nav'         // Main navigation tabs (header)
]

/**
 * View contribution after parsing
 * @typedef {Object} ParsedView
 * @property {string} id - Unique view ID (qualified with plugin name)
 * @property {string} name - Display name
 * @property {string} location - UI location
 * @property {string} [icon] - Icon name or path
 * @property {number} [order] - Sort order
 * @property {string} [when] - Conditional visibility expression
 * @property {string} [component] - React component name
 * @property {string} pluginName - Owning plugin name
 */

/**
 * Parse result
 * @typedef {Object} ParseResult
 * @property {ParsedView[]} views - Successfully parsed views
 * @property {string[]} errors - Validation error messages
 * @property {string[]} warnings - Non-fatal warning messages
 */

/**
 * Parse view contributions from a plugin manifest
 * @param {Object} manifest - Plugin manifest object
 * @param {string} pluginName - Name of the plugin
 * @returns {ParseResult} Parsed views and any errors/warnings
 */
function parseViewContributions(manifest, pluginName) {
  const result = {
    views: [],
    errors: [],
    warnings: []
  }

  // Check if manifest has contributions
  if (!manifest.contributes) {
    return result
  }

  // Check if views are defined
  const viewsArray = manifest.contributes.views
  if (!viewsArray) {
    return result
  }

  // Validate views is an array
  if (!Array.isArray(viewsArray)) {
    result.errors.push(`[${pluginName}] contributes.views must be an array`)
    return result
  }

  // Track view IDs for duplicate detection
  const seenIds = new Set()

  // Parse each view contribution
  for (let i = 0; i < viewsArray.length; i++) {
    const view = viewsArray[i]
    const viewIndex = `contributes.views[${i}]`

    // Validate view is an object
    if (!view || typeof view !== 'object' || Array.isArray(view)) {
      result.errors.push(`[${pluginName}] ${viewIndex}: View must be an object`)
      continue
    }

    // Validate required fields
    const validationErrors = validateViewContribution(view, viewIndex, pluginName)
    if (validationErrors.length > 0) {
      result.errors.push(...validationErrors)
      continue
    }

    // Check for duplicate IDs
    if (seenIds.has(view.id)) {
      result.errors.push(`[${pluginName}] ${viewIndex}: Duplicate view ID "${view.id}"`)
      continue
    }
    seenIds.add(view.id)

    // Create qualified view ID
    const qualifiedId = `${pluginName}:${view.id}`

    // Build parsed view object
    const parsedView = {
      id: qualifiedId,
      localId: view.id,
      name: view.name,
      location: view.location,
      pluginName
    }

    // Add optional properties
    if (view.icon) {
      parsedView.icon = view.icon
    }
    if (typeof view.order === 'number') {
      parsedView.order = view.order
    }
    if (view.when) {
      parsedView.when = view.when
    }
    if (view.component) {
      parsedView.component = view.component
    }

    // Warn about missing optional but recommended properties
    if (!view.icon) {
      result.warnings.push(`[${pluginName}] ${viewIndex}: View "${view.id}" has no icon specified`)
    }

    result.views.push(parsedView)
  }

  return result
}

/**
 * Validate a single view contribution object
 * @param {Object} view - View contribution object
 * @param {string} path - Path for error messages
 * @param {string} pluginName - Plugin name for error messages
 * @returns {string[]} Array of error messages
 */
function validateViewContribution(view, path, pluginName) {
  const errors = []

  // Required: id
  if (!view.id) {
    errors.push(`[${pluginName}] ${path}: Missing required property "id"`)
  } else if (typeof view.id !== 'string') {
    errors.push(`[${pluginName}] ${path}: "id" must be a string`)
  } else if (!/^[a-z][a-z0-9-]*$/.test(view.id)) {
    errors.push(`[${pluginName}] ${path}: "id" must be lowercase, start with a letter, and contain only letters, numbers, and hyphens. Got: "${view.id}"`)
  }

  // Required: name
  if (!view.name) {
    errors.push(`[${pluginName}] ${path}: Missing required property "name"`)
  } else if (typeof view.name !== 'string') {
    errors.push(`[${pluginName}] ${path}: "name" must be a string`)
  } else if (view.name.length === 0) {
    errors.push(`[${pluginName}] ${path}: "name" cannot be empty`)
  } else if (view.name.length > 50) {
    errors.push(`[${pluginName}] ${path}: "name" exceeds maximum length of 50 characters`)
  }

  // Required: location
  if (!view.location) {
    errors.push(`[${pluginName}] ${path}: Missing required property "location"`)
  } else if (typeof view.location !== 'string') {
    errors.push(`[${pluginName}] ${path}: "location" must be a string`)
  } else if (!VALID_VIEW_LOCATIONS.includes(view.location)) {
    errors.push(`[${pluginName}] ${path}: Invalid location "${view.location}". Valid locations are: ${VALID_VIEW_LOCATIONS.join(', ')}`)
  }

  // Optional: icon (validate if present)
  if (view.icon !== undefined) {
    if (typeof view.icon !== 'string') {
      errors.push(`[${pluginName}] ${path}: "icon" must be a string`)
    } else if (view.icon.length === 0) {
      errors.push(`[${pluginName}] ${path}: "icon" cannot be empty`)
    }
  }

  // Optional: order (validate if present)
  if (view.order !== undefined) {
    if (typeof view.order !== 'number' || !Number.isInteger(view.order)) {
      errors.push(`[${pluginName}] ${path}: "order" must be an integer`)
    } else if (view.order < 0 || view.order > 1000) {
      errors.push(`[${pluginName}] ${path}: "order" must be between 0 and 1000`)
    }
  }

  // Optional: when (validate if present)
  if (view.when !== undefined) {
    if (typeof view.when !== 'string') {
      errors.push(`[${pluginName}] ${path}: "when" must be a string`)
    }
  }

  // Optional: component (validate if present)
  if (view.component !== undefined) {
    if (typeof view.component !== 'string') {
      errors.push(`[${pluginName}] ${path}: "component" must be a string`)
    } else if (!/^[A-Z][a-zA-Z0-9]*$/.test(view.component)) {
      errors.push(`[${pluginName}] ${path}: "component" must be a valid React component name (PascalCase). Got: "${view.component}"`)
    }
  }

  return errors
}

/**
 * Log view contribution errors in a developer-friendly format
 * @param {string[]} errors - Array of error messages
 * @param {string[]} warnings - Array of warning messages
 */
function logContributionErrors(errors, warnings) {
  if (errors.length > 0) {
    console.error('[ContributionParser] View contribution errors:')
    for (const error of errors) {
      console.error(`  ✗ ${error}`)
    }
  }

  if (warnings.length > 0) {
    console.warn('[ContributionParser] View contribution warnings:')
    for (const warning of warnings) {
      console.warn(`  ⚠ ${warning}`)
    }
  }
}

/**
 * Get all views by location
 * @param {ParsedView[]} views - Array of parsed views
 * @param {string} location - Location to filter by
 * @returns {ParsedView[]} Views at the specified location, sorted by order
 */
function getViewsByLocation(views, location) {
  return views
    .filter(view => view.location === location)
    .sort((a, b) => (a.order || 100) - (b.order || 100))
}

/**
 * Get all unique locations that have views
 * @param {ParsedView[]} views - Array of parsed views
 * @returns {string[]} Array of location names
 */
function getViewLocations(views) {
  const locations = new Set(views.map(v => v.location))
  return Array.from(locations)
}

/**
 * Merge view contributions from multiple plugins
 * @param {Map<string, ParsedView[]>} pluginViews - Map of plugin name to views
 * @returns {ParsedView[]} All views merged and sorted
 */
function mergeViewContributions(pluginViews) {
  const allViews = []
  for (const views of pluginViews.values()) {
    allViews.push(...views)
  }
  return allViews.sort((a, b) => (a.order || 100) - (b.order || 100))
}

module.exports = {
  parseViewContributions,
  validateViewContribution,
  logContributionErrors,
  getViewsByLocation,
  getViewLocations,
  mergeViewContributions,
  VALID_VIEW_LOCATIONS
}
