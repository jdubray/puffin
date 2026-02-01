'use strict';

/**
 * @module cre-config
 * CRE configuration defaults and utilities.
 */

/**
 * Returns the default CRE configuration object.
 * These defaults are merged into the Puffin config when the `cre`
 * section is missing or incomplete.
 *
 * @returns {Object} Default CRE configuration.
 */
function getDefaultCreConfig() {
  return {
    enabled: true,
    codeModelPath: '.puffin/cre',
    maxPlanIterations: 5,
    risMaxLength: 5000,
    introspection: {
      autoAfterMerge: true,
      excludePatterns: [
        'node_modules/**',
        'dist/**',
        '.git/**'
      ]
    },
    schema: {
      allowAutoExtension: true,
      extensionApprovalRequired: false
    }
  };
}

/**
 * Ensures a config object has all CRE fields populated.
 * Missing fields are filled from defaults without overwriting
 * user-customized values.
 *
 * @param {Object} config - The full Puffin config object.
 * @returns {Object} The config with `cre` section guaranteed.
 */
function ensureCreConfig(config) {
  const defaults = getDefaultCreConfig();

  if (!config.cre) {
    config.cre = defaults;
    return config;
  }

  const cre = config.cre;

  // Backfill top-level scalars
  if (cre.enabled === undefined) cre.enabled = defaults.enabled;
  if (cre.codeModelPath === undefined) cre.codeModelPath = defaults.codeModelPath;
  if (cre.maxPlanIterations === undefined) cre.maxPlanIterations = defaults.maxPlanIterations;
  if (cre.risMaxLength === undefined) cre.risMaxLength = defaults.risMaxLength;

  // Backfill introspection
  if (!cre.introspection) {
    cre.introspection = defaults.introspection;
  } else {
    if (cre.introspection.autoAfterMerge === undefined) {
      cre.introspection.autoAfterMerge = defaults.introspection.autoAfterMerge;
    }
    if (!cre.introspection.excludePatterns) {
      cre.introspection.excludePatterns = defaults.introspection.excludePatterns;
    }
  }

  // Backfill schema
  if (!cre.schema) {
    cre.schema = defaults.schema;
  } else {
    if (cre.schema.allowAutoExtension === undefined) {
      cre.schema.allowAutoExtension = defaults.schema.allowAutoExtension;
    }
    if (cre.schema.extensionApprovalRequired === undefined) {
      cre.schema.extensionApprovalRequired = defaults.schema.extensionApprovalRequired;
    }
  }

  return config;
}

/**
 * Returns the CRE config section from a full Puffin config object.
 * If the section is missing or incomplete, backfills with defaults first.
 *
 * @param {Object} config - The full Puffin config object.
 * @returns {Object} The `cre` section, guaranteed complete.
 */
function getCreConfig(config) {
  if (!config) return getDefaultCreConfig();
  ensureCreConfig(config);
  return config.cre;
}

module.exports = {
  getDefaultCreConfig,
  ensureCreConfig,
  getCreConfig
};
