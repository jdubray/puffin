/**
 * @module schema-deriver
 * Phase 2: DERIVE SCHEMA — identify patterns and create the initial schema.
 *
 * Groups raw artifacts by structural similarity, identifies project-specific
 * element types, and builds the h-DSL schema v1.
 */

'use strict';

const { createBaseSchema, M3Primitives } = require('./hdsl-types');
const { aiQuery } = require('./ai-client');

/**
 * Derive the initial h-DSL schema from discovery results.
 *
 * @param {Object} params
 * @param {import('./discoverer').DiscoveryResult} params.discovery
 * @param {Function} params.log
 * @returns {Promise<Object>} The schema object.
 */
async function deriveSchema({ discovery, log }) {
  const schema = createBaseSchema();

  // Identify project-specific patterns from term frequency
  const patterns = identifyPatterns(discovery);
  log(`  Identified ${patterns.length} project-specific patterns`);

  // Attempt AI-assisted pattern recognition (BR-03)
  const aiExtensions = await aiDeriveTypes(patterns, discovery, log);

  // Add project-specific element types
  for (const ext of aiExtensions) {
    if (!schema.elementTypes[ext.name]) {
      schema.elementTypes[ext.name] = {
        m3Type: ext.m3Type,
        fields: ext.fields
      };
      schema.extensionLog.push({
        timestamp: new Date().toISOString(),
        elementTypes: [ext.name],
        rationale: ext.rationale,
        source: 'bootstrap-derive'
      });
      log(`  Added element type: ${ext.name} (${ext.m3Type})`);
    }
  }

  // Add common archetype types if detected in the codebase
  addArchetypeTypes(schema, discovery, log);

  return schema;
}

/**
 * Identify project-specific patterns from term frequency.
 * @param {import('./discoverer').DiscoveryResult} discovery
 * @returns {Array<{pattern: string, count: number}>}
 */
function identifyPatterns(discovery) {
  const patterns = [];
  const freq = discovery.termFrequency;

  // Find recurring class suffixes (e.g., Manager, Plugin, Handler)
  for (const [key, count] of freq) {
    if (key.startsWith('classSuffix:') && count >= 2) {
      patterns.push({ pattern: key.replace('classSuffix:', ''), count, type: 'classSuffix' });
    }
    if (key.startsWith('suffix:') && count >= 3) {
      patterns.push({ pattern: key.replace('suffix:', ''), count, type: 'fileSuffix' });
    }
    if (key.startsWith('dir:') && count >= 5) {
      patterns.push({ pattern: key.replace('dir:', ''), count, type: 'directory' });
    }
  }

  return patterns.sort((a, b) => b.count - a.count);
}

/**
 * Use AI to suggest project-specific element types from patterns.
 * @param {Array} patterns
 * @param {import('./discoverer').DiscoveryResult} discovery
 * @param {Function} log
 * @returns {Promise<Array>}
 */
async function aiDeriveTypes(patterns, discovery, log) {
  if (patterns.length === 0) return [];

  const systemPrompt = `You are analyzing a codebase's structural patterns to define an h-DSL schema.
h-DSL element types map to h-M3 primitives: SLOT (for artifacts/positions) or RELATION (for connections).
Each element type has fields typed as TERM (structured) or PROSE (natural language).
Keep the schema simple: 1-3 additional types max. Only suggest types that clearly represent recurring concepts.
Return ONLY valid JSON — no markdown code blocks.`;

  const patternSummary = patterns.slice(0, 15).map(p =>
    `${p.pattern} (${p.type}, ${p.count} occurrences)`
  ).join('\n');

  const dirStructure = Object.keys(discovery.dirTree).slice(0, 10).join(', ');

  const userPrompt = `Given these recurring patterns from a codebase:

${patternSummary}

Top-level directories: ${dirStructure}
Total source files: ${discovery.rawArtifacts.length}

Suggest 0-3 additional element types beyond the base types (module, function, dependency, flow).
For each, provide:
- name (lowercase, single word)
- m3Type ("SLOT" or "RELATION")
- fields (object with field definitions, each having m3Type "TERM" or "PROSE" and optionally required/array)
- rationale (one sentence)

Return JSON: { "extensions": [...] }
If no extensions are needed, return { "extensions": [] }`;

  const result = aiQuery(systemPrompt, userPrompt, { log });

  if (result.success && result.data && result.data.extensions) {
    return result.data.extensions.filter(ext =>
      ext.name && ext.m3Type && ext.fields && typeof ext.fields === 'object'
    ).map(ext => ({
      name: ext.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      m3Type: ext.m3Type === 'RELATION' ? M3Primitives.RELATION : M3Primitives.SLOT,
      fields: normalizeFields(ext.fields),
      rationale: ext.rationale || 'AI-derived from codebase patterns'
    }));
  }

  log('  AI schema derivation unavailable — using base types only');
  return [];
}

/**
 * Normalize field definitions from AI response to valid h-M3 types.
 * @param {Object} fields
 * @returns {Object}
 */
function normalizeFields(fields) {
  const normalized = {};
  for (const [name, def] of Object.entries(fields)) {
    if (typeof def === 'object' && def !== null) {
      normalized[name] = {
        m3Type: def.m3Type === 'PROSE' ? M3Primitives.PROSE : M3Primitives.TERM,
        required: !!def.required,
        ...(def.array ? { array: true } : {}),
        ...(def.enum ? { enum: def.enum } : {})
      };
    }
  }
  // Ensure path and summary fields exist
  if (!normalized.path) {
    normalized.path = { m3Type: M3Primitives.TERM, required: true };
  }
  if (!normalized.summary) {
    normalized.summary = { m3Type: M3Primitives.PROSE, required: true };
  }
  return normalized;
}

/**
 * Add common archetype element types based on file patterns.
 * These archetypes provide schema definitions for the enhanced kind classifications.
 *
 * @param {Object} schema
 * @param {import('./discoverer').DiscoveryResult} discovery
 * @param {Function} log
 */
function addArchetypeTypes(schema, discovery, log) {
  const files = discovery.files;
  const paths = files.map(f => f.relativePath.toLowerCase());

  // Test archetype
  const hasTests = files.some(f =>
    f.relativePath.includes('.test.') || f.relativePath.includes('.spec.') || f.relativePath.includes('test/')
  );
  if (hasTests && !schema.elementTypes.test) {
    schema.elementTypes.test = {
      m3Type: M3Primitives.SLOT,
      fields: {
        path: { m3Type: M3Primitives.TERM, required: true },
        testKind: { m3Type: M3Primitives.TERM, enum: ['unit', 'integration', 'e2e'] },
        summary: { m3Type: M3Primitives.PROSE, required: true },
        tests: { m3Type: M3Primitives.TERM, required: false },
        tags: { m3Type: M3Primitives.TERM, array: true }
      }
    };
    log('  Added archetype: test');
  }

  // Config archetype
  const hasConfigs = files.some(f =>
    f.ext === '.json' && !f.relativePath.includes('node_modules')
  );
  if (hasConfigs && !schema.elementTypes.config) {
    schema.elementTypes.config = {
      m3Type: M3Primitives.SLOT,
      fields: {
        path: { m3Type: M3Primitives.TERM, required: true },
        configKind: { m3Type: M3Primitives.TERM, enum: ['json', 'yaml', 'env'] },
        summary: { m3Type: M3Primitives.PROSE, required: true },
        tags: { m3Type: M3Primitives.TERM, array: true }
      }
    };
    log('  Added archetype: config');
  }

  // Service archetype
  const hasServices = paths.some(p => p.includes('/service') || p.includes('.service.'));
  if (hasServices && !schema.elementTypes.service) {
    schema.elementTypes.service = {
      m3Type: M3Primitives.SLOT,
      fields: {
        path: { m3Type: M3Primitives.TERM, required: true },
        summary: { m3Type: M3Primitives.PROSE, required: true },
        intent: { m3Type: M3Primitives.PROSE, required: false },
        exports: { m3Type: M3Primitives.TERM, array: true },
        tags: { m3Type: M3Primitives.TERM, array: true }
      }
    };
    log('  Added archetype: service');
  }

  // Component archetype
  const hasComponents = paths.some(p => p.includes('/component') || p.includes('.component.'));
  if (hasComponents && !schema.elementTypes.component) {
    schema.elementTypes.component = {
      m3Type: M3Primitives.SLOT,
      fields: {
        path: { m3Type: M3Primitives.TERM, required: true },
        summary: { m3Type: M3Primitives.PROSE, required: true },
        intent: { m3Type: M3Primitives.PROSE, required: false },
        exports: { m3Type: M3Primitives.TERM, array: true },
        tags: { m3Type: M3Primitives.TERM, array: true }
      }
    };
    log('  Added archetype: component');
  }

  // Utility archetype
  const hasUtils = paths.some(p => p.includes('/util') || p.includes('/helper'));
  if (hasUtils && !schema.elementTypes.utility) {
    schema.elementTypes.utility = {
      m3Type: M3Primitives.SLOT,
      fields: {
        path: { m3Type: M3Primitives.TERM, required: true },
        summary: { m3Type: M3Primitives.PROSE, required: true },
        intent: { m3Type: M3Primitives.PROSE, required: false },
        exports: { m3Type: M3Primitives.TERM, array: true },
        tags: { m3Type: M3Primitives.TERM, array: true }
      }
    };
    log('  Added archetype: utility');
  }

  // Controller archetype
  const hasControllers = paths.some(p => p.includes('/controller') || p.includes('/handler') || p.includes('.controller.'));
  if (hasControllers && !schema.elementTypes.controller) {
    schema.elementTypes.controller = {
      m3Type: M3Primitives.SLOT,
      fields: {
        path: { m3Type: M3Primitives.TERM, required: true },
        summary: { m3Type: M3Primitives.PROSE, required: true },
        intent: { m3Type: M3Primitives.PROSE, required: false },
        exports: { m3Type: M3Primitives.TERM, array: true },
        routes: { m3Type: M3Primitives.TERM, array: true },
        tags: { m3Type: M3Primitives.TERM, array: true }
      }
    };
    log('  Added archetype: controller');
  }

  // Middleware archetype
  const hasMiddleware = paths.some(p => p.includes('/middleware') || p.includes('.middleware.'));
  if (hasMiddleware && !schema.elementTypes.middleware) {
    schema.elementTypes.middleware = {
      m3Type: M3Primitives.SLOT,
      fields: {
        path: { m3Type: M3Primitives.TERM, required: true },
        summary: { m3Type: M3Primitives.PROSE, required: true },
        intent: { m3Type: M3Primitives.PROSE, required: false },
        exports: { m3Type: M3Primitives.TERM, array: true },
        tags: { m3Type: M3Primitives.TERM, array: true }
      }
    };
    log('  Added archetype: middleware');
  }

  // Model archetype
  const hasModels = paths.some(p => p.includes('/model') || p.includes('/entity') || p.includes('.model.'));
  if (hasModels && !schema.elementTypes.model) {
    schema.elementTypes.model = {
      m3Type: M3Primitives.SLOT,
      fields: {
        path: { m3Type: M3Primitives.TERM, required: true },
        summary: { m3Type: M3Primitives.PROSE, required: true },
        intent: { m3Type: M3Primitives.PROSE, required: false },
        exports: { m3Type: M3Primitives.TERM, array: true },
        tags: { m3Type: M3Primitives.TERM, array: true }
      }
    };
    log('  Added archetype: model');
  }

  // Plugin archetype
  const hasPlugins = paths.some(p => p.includes('/plugin'));
  if (hasPlugins && !schema.elementTypes.plugin) {
    schema.elementTypes.plugin = {
      m3Type: M3Primitives.SLOT,
      fields: {
        path: { m3Type: M3Primitives.TERM, required: true },
        summary: { m3Type: M3Primitives.PROSE, required: true },
        intent: { m3Type: M3Primitives.PROSE, required: false },
        exports: { m3Type: M3Primitives.TERM, array: true },
        tags: { m3Type: M3Primitives.TERM, array: true }
      }
    };
    log('  Added archetype: plugin');
  }

  // Hook archetype (React hooks)
  const hasHooks = paths.some(p => p.includes('/hook')) ||
    discovery.rawArtifacts.some(a => a.exports && a.exports.some(e => /^use[A-Z]/.test(e)));
  if (hasHooks && !schema.elementTypes.hook) {
    schema.elementTypes.hook = {
      m3Type: M3Primitives.SLOT,
      fields: {
        path: { m3Type: M3Primitives.TERM, required: true },
        summary: { m3Type: M3Primitives.PROSE, required: true },
        intent: { m3Type: M3Primitives.PROSE, required: false },
        exports: { m3Type: M3Primitives.TERM, array: true },
        tags: { m3Type: M3Primitives.TERM, array: true }
      }
    };
    log('  Added archetype: hook');
  }

  // Entry archetype (index.js, main.js, app.js)
  const hasEntries = paths.some(p => {
    const basename = p.split('/').pop().replace(/\.[^.]+$/, '');
    return ['index', 'main', 'app', 'server', 'cli'].includes(basename);
  });
  if (hasEntries && !schema.elementTypes.entry) {
    schema.elementTypes.entry = {
      m3Type: M3Primitives.SLOT,
      fields: {
        path: { m3Type: M3Primitives.TERM, required: true },
        summary: { m3Type: M3Primitives.PROSE, required: true },
        intent: { m3Type: M3Primitives.PROSE, required: false },
        exports: { m3Type: M3Primitives.TERM, array: true },
        tags: { m3Type: M3Primitives.TERM, array: true }
      }
    };
    log('  Added archetype: entry');
  }
}

module.exports = { deriveSchema };
