/**
 * @module hdsl-types
 * h-M3 v2 primitive type definitions for the CRE code model.
 *
 * Defines the four strata (SUBSTANCE, STRUCTURE, DYNAMICS, TELOS),
 * their primitives, and the base schema element types used by
 * the code model (module, function, dependency, flow).
 */

'use strict';

// ---------------------------------------------------------------------------
// h-M3 Primitive Types
// ---------------------------------------------------------------------------

/**
 * h-M3 primitive type identifiers.
 * These map directly to the four strata of h-M3 v2.
 *
 * SUBSTANCE: TERM (formal/symbolic) and PROSE (natural language)
 * STRUCTURE: SLOT (position) and RELATION (connection)
 * DYNAMICS:  STATE and TRANSITION (not used in code-model schema yet)
 * TELOS:     OUTCOME and ALIGNMENT (not used in code-model schema yet)
 *
 * @enum {string}
 */
const M3Primitives = Object.freeze({
  // Substance
  TERM: 'TERM',
  PROSE: 'PROSE',
  // Structure
  SLOT: 'SLOT',
  RELATION: 'RELATION',
  // Dynamics
  STATE: 'STATE',
  TRANSITION: 'TRANSITION',
  // Telos
  OUTCOME: 'OUTCOME',
  ALIGNMENT: 'ALIGNMENT'
});

/**
 * The set of all valid m3Type values that can annotate a field definition.
 * Fields are filled with SUBSTANCE primitives (TERM or PROSE).
 * @type {Set<string>}
 */
const FIELD_M3_TYPES = new Set([M3Primitives.TERM, M3Primitives.PROSE]);

/**
 * The set of all valid m3Type values for top-level element types.
 * Element types map to STRUCTURE primitives (SLOT or RELATION).
 * @type {Set<string>}
 */
const ELEMENT_M3_TYPES = new Set([M3Primitives.SLOT, M3Primitives.RELATION]);

// ---------------------------------------------------------------------------
// Prose operations (the interpreter contract)
// ---------------------------------------------------------------------------

/**
 * PROSE interpreter operations as defined by h-M3 v2.
 * @enum {string}
 */
const ProseOperations = Object.freeze({
  GROUND: 'GROUND',
  FOLLOW: 'FOLLOW',
  JUDGE: 'JUDGE',
  ACCEPT: 'ACCEPT',
  DERIVE: 'DERIVE'
});

// ---------------------------------------------------------------------------
// Base schema element types
// ---------------------------------------------------------------------------

/**
 * Base schema shipped with every new CRE instance.
 * Defines four element types: module, function, dependency, flow.
 *
 * @returns {Object} Fresh copy of the base schema.
 */
function createBaseSchema() {
  return {
    version: '1.0.0',
    m3Version: '2.0',
    elementTypes: {
      module: {
        m3Type: M3Primitives.SLOT,
        fields: {
          path: { m3Type: M3Primitives.TERM, required: true },
          kind: {
            m3Type: M3Primitives.TERM,
            required: true,
            enum: ['module', 'file', 'config']
          },
          summary: { m3Type: M3Primitives.PROSE, required: true },
          intent: { m3Type: M3Primitives.PROSE, required: false },
          exports: { m3Type: M3Primitives.TERM, array: true },
          tags: { m3Type: M3Primitives.TERM, array: true },
          size: { m3Type: M3Primitives.TERM, required: false }
        }
      },
      function: {
        m3Type: M3Primitives.SLOT,
        fields: {
          path: { m3Type: M3Primitives.TERM, required: true },
          signature: { m3Type: M3Primitives.TERM, required: false },
          summary: { m3Type: M3Primitives.PROSE, required: true },
          intent: { m3Type: M3Primitives.PROSE, required: false },
          behavior: {
            fields: {
              pre: { m3Type: M3Primitives.PROSE },
              post: { m3Type: M3Primitives.PROSE },
              err: { m3Type: M3Primitives.PROSE }
            }
          },
          tags: { m3Type: M3Primitives.TERM, array: true }
        }
      },
      dependency: {
        m3Type: M3Primitives.RELATION,
        fields: {
          from: { m3Type: M3Primitives.TERM, required: true },
          to: { m3Type: M3Primitives.TERM, required: true },
          kind: {
            m3Type: M3Primitives.TERM,
            required: true,
            enum: ['imports', 'calls', 'extends', 'implements', 'configures', 'tests']
          },
          weight: {
            m3Type: M3Primitives.TERM,
            enum: ['critical', 'normal', 'weak']
          },
          intent: { m3Type: M3Primitives.PROSE, required: false }
        }
      },
      flow: {
        m3Type: M3Primitives.SLOT,
        fields: {
          name: { m3Type: M3Primitives.TERM, required: true },
          summary: { m3Type: M3Primitives.PROSE, required: true },
          steps: {
            array: true,
            fields: {
              order: { m3Type: M3Primitives.TERM },
              artifact: { m3Type: M3Primitives.TERM },
              intent: { m3Type: M3Primitives.PROSE }
            }
          },
          tags: { m3Type: M3Primitives.TERM, array: true }
        }
      }
    },
    extensionLog: []
  };
}

/**
 * Returns the set of base element type names.
 * @type {Set<string>}
 */
const BASE_ELEMENT_TYPES = new Set(['module', 'function', 'dependency', 'flow']);

// ---------------------------------------------------------------------------
// Empty instance template
// ---------------------------------------------------------------------------

/**
 * Creates a fresh, empty h-DSL instance.
 * @returns {Object}
 */
function createEmptyInstance() {
  return {
    schemaVersion: '1.0.0',
    lastUpdated: new Date().toISOString(),
    artifacts: {},
    dependencies: [],
    flows: {}
  };
}

module.exports = {
  M3Primitives,
  FIELD_M3_TYPES,
  ELEMENT_M3_TYPES,
  ProseOperations,
  BASE_ELEMENT_TYPES,
  createBaseSchema,
  createEmptyInstance
};
