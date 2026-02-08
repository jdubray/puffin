/**
 * @module hdsl-validator
 * Validates h-DSL schema definitions and instance data against h-M3 v2 primitives.
 *
 * Two main entry points:
 *   - validateSchema(schema)   — checks the schema itself is well-formed
 *   - validateInstance(instance, schema) — checks instance data conforms to schema
 *
 * Both return a ValidationResult: { valid: boolean, errors: ValidationError[] }
 */

'use strict';

const {
  M3Primitives,
  FIELD_M3_TYPES,
  ELEMENT_M3_TYPES
} = require('./hdsl-types');

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ValidationError
 * @property {string} path  - Dot-separated path to the violating element
 * @property {string} message - Human-readable description
 * @property {string} type - Error category (schema|instance|field|relation)
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {ValidationError[]} errors
 */

/**
 * Build a successful result.
 * @param {ValidationError[]} errors
 * @returns {ValidationResult}
 */
function result(errors) {
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

/**
 * Validate that a schema object is well-formed according to h-M3 v2.
 * Checks:
 *   - Required top-level properties (version, m3Version, elementTypes)
 *   - Each element type has a valid m3Type (SLOT or RELATION)
 *   - Each field within an element type has a valid m3Type (TERM or PROSE)
 *     or is a nested/compound field with a `fields` sub-object
 *
 * @param {Object} schema
 * @returns {ValidationResult}
 */
function validateSchema(schema) {
  const errors = [];

  if (!schema || typeof schema !== 'object') {
    errors.push({ path: '', message: 'Schema must be a non-null object', type: 'schema' });
    return result(errors);
  }

  if (!schema.version) {
    errors.push({ path: 'version', message: 'Schema version is required', type: 'schema' });
  }
  if (!schema.m3Version) {
    errors.push({ path: 'm3Version', message: 'h-M3 version is required', type: 'schema' });
  }

  if (!schema.elementTypes || typeof schema.elementTypes !== 'object') {
    errors.push({ path: 'elementTypes', message: 'elementTypes must be a non-null object', type: 'schema' });
    return result(errors);
  }

  for (const [typeName, typeDef] of Object.entries(schema.elementTypes)) {
    const prefix = `elementTypes.${typeName}`;

    if (!typeDef || typeof typeDef !== 'object') {
      errors.push({ path: prefix, message: `Element type "${typeName}" must be an object`, type: 'schema' });
      continue;
    }

    if (!ELEMENT_M3_TYPES.has(typeDef.m3Type)) {
      errors.push({
        path: `${prefix}.m3Type`,
        message: `Element type "${typeName}" has invalid m3Type "${typeDef.m3Type}". Must be SLOT or RELATION`,
        type: 'schema'
      });
    }

    if (typeDef.fields && typeof typeDef.fields === 'object') {
      validateFieldDefs(typeDef.fields, prefix, errors);
    }
  }

  return result(errors);
}

/**
 * Recursively validate field definitions within an element type.
 * @param {Object} fields
 * @param {string} parentPath
 * @param {ValidationError[]} errors
 */
function validateFieldDefs(fields, parentPath, errors) {
  for (const [fieldName, fieldDef] of Object.entries(fields)) {
    const path = `${parentPath}.fields.${fieldName}`;

    if (!fieldDef || typeof fieldDef !== 'object') {
      errors.push({ path, message: `Field "${fieldName}" must be an object`, type: 'field' });
      continue;
    }

    // Compound field — has nested `fields` but no direct m3Type
    if (fieldDef.fields && !fieldDef.m3Type) {
      validateFieldDefs(fieldDef.fields, path, errors);
      continue;
    }

    // Leaf field — must have a valid m3Type
    if (fieldDef.m3Type && !FIELD_M3_TYPES.has(fieldDef.m3Type)) {
      errors.push({
        path: `${path}.m3Type`,
        message: `Field "${fieldName}" has invalid m3Type "${fieldDef.m3Type}". Must be TERM or PROSE`,
        type: 'field'
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Instance validation
// ---------------------------------------------------------------------------

/**
 * Validate an instance against its schema.
 * Checks:
 *   - artifacts: each artifact has a declared type that exists in the schema,
 *     and required fields are present
 *   - dependencies: each dependency conforms to the dependency element type
 *   - flows: each flow conforms to the flow element type
 *
 * @param {Object} instance
 * @param {Object} schema
 * @returns {ValidationResult}
 */
function validateInstance(instance, schema) {
  const errors = [];

  if (!instance || typeof instance !== 'object') {
    errors.push({ path: '', message: 'Instance must be a non-null object', type: 'instance' });
    return result(errors);
  }

  if (!schema || !schema.elementTypes) {
    errors.push({ path: '', message: 'Schema with elementTypes is required for instance validation', type: 'schema' });
    return result(errors);
  }

  // Validate artifacts
  if (instance.artifacts && typeof instance.artifacts === 'object') {
    for (const [key, artifact] of Object.entries(instance.artifacts)) {
      validateArtifact(key, artifact, schema, errors);
    }
  }

  // Validate dependencies against the dependency element type
  if (Array.isArray(instance.dependencies)) {
    const depSchema = schema.elementTypes.dependency;
    if (depSchema) {
      instance.dependencies.forEach((dep, i) => {
        validateFields(dep, depSchema.fields, `dependencies[${i}]`, errors);
      });
    }
  }

  // Validate flows
  if (instance.flows && typeof instance.flows === 'object') {
    const flowSchema = schema.elementTypes.flow;
    if (flowSchema) {
      for (const [key, flow] of Object.entries(instance.flows)) {
        validateFields(flow, flowSchema.fields, `flows.${key}`, errors);
      }
    }
  }

  return result(errors);
}

/**
 * Validate a single artifact entry.
 * @param {string} key
 * @param {Object} artifact
 * @param {Object} schema
 * @param {ValidationError[]} errors
 */
function validateArtifact(key, artifact, schema, errors) {
  const path = `artifacts.${key}`;

  if (!artifact || typeof artifact !== 'object') {
    errors.push({ path, message: 'Artifact must be an object', type: 'instance' });
    return;
  }

  const typeName = artifact.type;
  if (!typeName) {
    errors.push({ path: `${path}.type`, message: 'Artifact is missing "type" field', type: 'instance' });
    return;
  }

  const elementDef = schema.elementTypes[typeName];
  if (!elementDef) {
    errors.push({
      path: `${path}.type`,
      message: `Artifact type "${typeName}" is not defined in the schema`,
      type: 'instance'
    });
    return;
  }

  if (elementDef.fields) {
    validateFields(artifact, elementDef.fields, path, errors);
  }
}

/**
 * Check that an object's fields satisfy the schema field definitions.
 * Validates required fields and enum constraints.
 *
 * @param {Object} data
 * @param {Object} fieldDefs
 * @param {string} parentPath
 * @param {ValidationError[]} errors
 */
function validateFields(data, fieldDefs, parentPath, errors) {
  if (!fieldDefs || typeof fieldDefs !== 'object') return;

  for (const [fieldName, fieldDef] of Object.entries(fieldDefs)) {
    const path = `${parentPath}.${fieldName}`;
    const value = data[fieldName];

    // Required check
    if (fieldDef.required === true && (value === undefined || value === null || value === '')) {
      errors.push({ path, message: `Required field "${fieldName}" is missing`, type: 'field' });
      continue;
    }

    if (value === undefined || value === null) continue;

    // Enum check
    if (fieldDef.enum && !fieldDef.array) {
      if (!fieldDef.enum.includes(value)) {
        errors.push({
          path,
          message: `Field "${fieldName}" value "${value}" is not in allowed values: [${fieldDef.enum.join(', ')}]`,
          type: 'field'
        });
      }
    }

    // Array items with enum
    if (fieldDef.array && fieldDef.enum && Array.isArray(value)) {
      value.forEach((item, i) => {
        if (!fieldDef.enum.includes(item)) {
          errors.push({
            path: `${path}[${i}]`,
            message: `Array item "${item}" is not in allowed values: [${fieldDef.enum.join(', ')}]`,
            type: 'field'
          });
        }
      });
    }

    // Nested compound fields (non-array)
    if (fieldDef.fields && !fieldDef.array && typeof value === 'object' && !Array.isArray(value)) {
      validateFields(value, fieldDef.fields, path, errors);
    }

    // Array of compound objects
    if (fieldDef.array && fieldDef.fields && Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          validateFields(item, fieldDef.fields, `${path}[${i}]`, errors);
        }
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Schema extension validation
// ---------------------------------------------------------------------------

/**
 * Validate a proposed schema extension before it is applied.
 * Checks:
 *   - Extension has name, m3Type, fields, rationale
 *   - m3Type is a valid ELEMENT type (SLOT or RELATION)
 *   - Fields have valid m3Type annotations
 *   - Name does not collide with existing element types
 *
 * @param {Object} extension - { name, m3Type, fields, rationale }
 * @param {Object} schema - Current schema to check for collisions
 * @returns {ValidationResult}
 */
function validateExtension(extension, schema) {
  const errors = [];

  if (!extension || typeof extension !== 'object') {
    errors.push({ path: '', message: 'Extension must be a non-null object', type: 'schema' });
    return result(errors);
  }

  if (!extension.name || typeof extension.name !== 'string') {
    errors.push({ path: 'name', message: 'Extension name is required and must be a string', type: 'schema' });
  }

  if (!ELEMENT_M3_TYPES.has(extension.m3Type)) {
    errors.push({
      path: 'm3Type',
      message: `Extension m3Type "${extension.m3Type}" is invalid. Must be SLOT or RELATION`,
      type: 'schema'
    });
  }

  if (!extension.fields || typeof extension.fields !== 'object') {
    errors.push({ path: 'fields', message: 'Extension must define fields', type: 'schema' });
  } else {
    validateFieldDefs(extension.fields, `extension(${extension.name || '?'})`, errors);
  }

  if (!extension.rationale || typeof extension.rationale !== 'string') {
    errors.push({ path: 'rationale', message: 'Extension rationale is required for auditability', type: 'schema' });
  }

  // Collision check
  if (extension.name && schema && schema.elementTypes && schema.elementTypes[extension.name]) {
    errors.push({
      path: 'name',
      message: `Element type "${extension.name}" already exists in the schema`,
      type: 'schema'
    });
  }

  return result(errors);
}

module.exports = {
  validateSchema,
  validateInstance,
  validateExtension
};
