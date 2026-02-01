'use strict';

/**
 * @module cre/schema-manager
 * SchemaManager — loads, validates, and extends the h-DSL schema.
 *
 * Wraps cre-storage for schema I/O and hdsl-validator for validation,
 * enforcing additive-only extensions with auditability logging.
 */

const { validateSchema, validateInstance, validateExtension } = require('./lib/hdsl-validator');

/**
 * Manages h-DSL schema lifecycle: load, validate, and extend.
 */
class SchemaManager {
  /**
   * @param {Object} deps
   * @param {Object} deps.storage - CRE storage module (cre-storage.js).
   * @param {string} deps.projectRoot - Absolute path to the project root.
   * @param {Object} [deps.config] - CRE config (cre section). Used for auto-extension settings.
   */
  constructor({ storage, projectRoot, config = {} }) {
    this._storage = storage;
    this._projectRoot = projectRoot;
    this._config = config;
    /** @type {Object|null} In-memory cached schema. */
    this._schema = null;
  }

  /**
   * AC2: Load schema.json and return the current schema.
   * Caches in memory for subsequent calls. Call reload() to refresh.
   *
   * @returns {Promise<Object>} The current schema object.
   */
  async load() {
    this._schema = await this._storage.readSchema(this._projectRoot);
    const result = validateSchema(this._schema);
    if (!result.valid) {
      console.warn(`[CRE] Schema has ${result.errors.length} validation warning(s):`);
      result.errors.forEach(e => console.warn(`[CRE]   ${e.path}: ${e.message}`));
    }
    return this._schema;
  }

  /**
   * Returns the cached schema, loading from disk if not yet loaded.
   *
   * @returns {Promise<Object>}
   */
  async getSchema() {
    if (!this._schema) {
      await this.load();
    }
    return this._schema;
  }

  /**
   * AC3, AC4, AC5: Extend the schema with a new element type.
   *
   * Validates the extension against h-M3 rules, enforces additive-only
   * (no modification/removal of existing types), appends to elementTypes,
   * logs to extensionLog, and persists to disk.
   *
   * @param {Object} extension - { name, m3Type, fields, rationale, source? }
   * @returns {Promise<{success: boolean, errors?: Array}>}
   */
  async extend(extension) {
    const schema = await this.getSchema();

    // AC7: Check auto-extension config
    const schemaConfig = this._config.schema || {};
    if (schemaConfig.allowAutoExtension === false) {
      return {
        success: false,
        errors: [{ path: '', message: 'Auto-extension is disabled in config', type: 'config' }]
      };
    }

    // Validate extension against h-M3 rules and check for collisions
    const validation = validateExtension(extension, schema);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }

    // AC4: Defense-in-depth — validateExtension already rejects name collisions,
    // but guard here too in case the validator implementation changes
    if (schema.elementTypes[extension.name]) {
      return {
        success: false,
        errors: [{ path: 'name', message: `Element type "${extension.name}" already exists. Extensions are additive-only.`, type: 'schema' }]
      };
    }

    // Add the new element type
    schema.elementTypes[extension.name] = {
      m3Type: extension.m3Type,
      fields: extension.fields
    };

    // AC5: Log extension for auditability
    if (!Array.isArray(schema.extensionLog)) {
      schema.extensionLog = [];
    }
    schema.extensionLog.push({
      timestamp: new Date().toISOString(),
      elementTypes: [extension.name],
      rationale: extension.rationale,
      source: extension.source || 'unknown'
    });

    // Persist
    await this._storage.writeSchema(this._projectRoot, schema);
    this._schema = schema;

    console.log(`[CRE] Schema extended with element type "${extension.name}"`);
    return { success: true };
  }

  /**
   * AC6: Validate an instance against the current schema.
   *
   * @param {Object} instance - h-DSL instance data.
   * @returns {Promise<import('./lib/hdsl-validator').ValidationResult>}
   */
  async validate(instance) {
    const schema = await this.getSchema();
    return validateInstance(instance, schema);
  }

  /**
   * Force reload schema from disk, discarding cached copy.
   *
   * @returns {Promise<Object>}
   */
  async reload() {
    this._schema = null;
    return this.load();
  }
}

module.exports = { SchemaManager };
