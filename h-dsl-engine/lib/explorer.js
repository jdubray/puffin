/**
 * @module explorer
 * Explore mode — query an existing h-DSL code model (schema + instance)
 * and return structured JSON results.
 *
 * Supports query types:
 *   artifact  — find artifacts by path pattern, type, or kind
 *   deps      — find dependencies for a given artifact (inbound/outbound)
 *   flow      — find flows by name pattern
 *   type      — list element types from the schema
 *   stats     — return aggregate statistics
 *   search    — free-text search across artifact summaries, intents, paths
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');

/**
 * Load the schema and instance from disk.
 * @param {string} dataDir - Absolute path to .puffin/cre directory.
 * @returns {Promise<{schema: Object, instance: Object}>}
 */
async function loadModel(dataDir) {
  const [schemaRaw, instanceRaw] = await Promise.all([
    fs.readFile(path.join(dataDir, 'schema.json'), 'utf-8'),
    fs.readFile(path.join(dataDir, 'instance.json'), 'utf-8')
  ]);
  return { schema: JSON.parse(schemaRaw), instance: JSON.parse(instanceRaw) };
}

/**
 * Execute an explore query against the code model.
 * @param {Object} params
 * @param {Object} params.schema
 * @param {Object} params.instance
 * @param {Object} params.query - The structured query.
 * @param {string} params.query.type - One of: artifact, deps, flow, type, stats, search.
 * @param {string} [params.query.pattern] - Filter pattern (glob-like or substring).
 * @param {string} [params.query.artifact] - Artifact path (for deps query).
 * @param {string} [params.query.direction] - 'inbound', 'outbound', or 'both' (for deps).
 * @param {string} [params.query.kind] - Filter by artifact kind or dep kind.
 * @param {string} [params.query.elementType] - Filter by element type.
 * @param {number} [params.query.limit] - Max results to return.
 * @returns {Object} Structured result with `queryType`, `count`, and `results`.
 */
function executeQuery({ schema, instance, query }) {
  const { type: queryType } = query;
  const limit = query.limit || 50;

  switch (queryType) {
    case 'artifact':
      return queryArtifacts(instance, query, limit);
    case 'deps':
      return queryDeps(instance, query, limit);
    case 'flow':
      return queryFlows(instance, query, limit);
    case 'type':
      return queryTypes(schema);
    case 'stats':
      return queryStats(schema, instance);
    case 'search':
      return querySearch(instance, query, limit);
    default:
      throw new Error(`Unknown query type: "${queryType}". Use: artifact, deps, flow, type, stats, search`);
  }
}

/**
 * Query artifacts by path pattern, element type, or kind.
 */
function queryArtifacts(instance, query, limit) {
  const { pattern, elementType, kind } = query;
  let entries = Object.entries(instance.artifacts);

  if (pattern) {
    const re = patternToRegex(pattern);
    entries = entries.filter(([p]) => re.test(p));
  }
  if (elementType) {
    entries = entries.filter(([, a]) => a.type === elementType);
  }
  if (kind) {
    entries = entries.filter(([, a]) => a.kind === kind);
  }

  const results = entries.slice(0, limit).map(([p, a]) => ({
    path: p,
    type: a.type,
    kind: a.kind,
    summary: a.summary || null,
    intent: a.intent || null,
    size: a.size || null,
    tags: a.tags || [],
    exports: a.exports || []
  }));

  return { queryType: 'artifact', count: results.length, total: entries.length, results };
}

/**
 * Query dependencies for a specific artifact.
 */
function queryDeps(instance, query, limit) {
  const { artifact: artPath, direction = 'both', kind } = query;
  if (!artPath) {
    throw new Error('deps query requires "artifact" field specifying the artifact path');
  }

  let deps = instance.dependencies;

  let outbound = [];
  let inbound = [];
  if (direction === 'outbound' || direction === 'both') {
    outbound = deps.filter(d => d.from === artPath);
  }
  if (direction === 'inbound' || direction === 'both') {
    inbound = deps.filter(d => d.to === artPath);
  }

  let results;
  if (direction === 'outbound') {
    results = outbound;
  } else if (direction === 'inbound') {
    results = inbound;
  } else {
    results = [
      ...outbound.map(d => ({ ...d, direction: 'outbound' })),
      ...inbound.map(d => ({ ...d, direction: 'inbound' }))
    ];
  }

  if (kind) {
    results = results.filter(d => d.kind === kind);
  }

  results = results.slice(0, limit);
  return { queryType: 'deps', artifact: artPath, direction, count: results.length, results };
}

/**
 * Query flows by name pattern.
 */
function queryFlows(instance, query, limit) {
  const { pattern } = query;
  let entries = Object.entries(instance.flows || {});

  if (pattern) {
    const re = patternToRegex(pattern);
    entries = entries.filter(([name]) => re.test(name));
  }

  const results = entries.slice(0, limit).map(([name, flow]) => ({
    name,
    summary: flow.summary || null,
    stepCount: (flow.steps || []).length,
    steps: flow.steps || []
  }));

  return { queryType: 'flow', count: results.length, total: entries.length, results };
}

/**
 * List all element types from the schema.
 */
function queryTypes(schema) {
  const results = Object.entries(schema.elementTypes || {}).map(([name, def]) => ({
    name,
    description: def.description || null,
    fieldCount: Object.keys(def.fields || {}).length,
    fields: Object.keys(def.fields || {})
  }));

  return { queryType: 'type', count: results.length, results };
}

/**
 * Return aggregate statistics.
 */
function queryStats(schema, instance) {
  const artifacts = Object.values(instance.artifacts);
  const byType = {};
  for (const a of artifacts) {
    byType[a.type] = (byType[a.type] || 0) + 1;
  }

  const byKind = {};
  for (const a of artifacts) {
    if (a.kind) byKind[a.kind] = (byKind[a.kind] || 0) + 1;
  }

  const depsByKind = {};
  for (const d of instance.dependencies) {
    depsByKind[d.kind] = (depsByKind[d.kind] || 0) + 1;
  }

  return {
    queryType: 'stats',
    results: {
      artifactCount: artifacts.length,
      dependencyCount: instance.dependencies.length,
      flowCount: Object.keys(instance.flows || {}).length,
      elementTypeCount: Object.keys(schema.elementTypes || {}).length,
      artifactsByType: byType,
      artifactsByKind: byKind,
      dependenciesByKind: depsByKind,
      totalSize: artifacts.reduce((sum, a) => sum + (a.size || 0), 0)
    }
  };
}

/**
 * Free-text search across artifact paths, summaries, and intents.
 */
function querySearch(instance, query, limit) {
  const { pattern } = query;
  if (!pattern) {
    throw new Error('search query requires a "pattern" field');
  }

  const terms = pattern.toLowerCase().split(/\s+/);
  const scored = [];

  for (const [p, a] of Object.entries(instance.artifacts)) {
    const text = [p, a.summary || '', a.intent || '', ...(a.tags || [])].join(' ').toLowerCase();
    const matchCount = terms.filter(t => text.includes(t)).length;
    if (matchCount > 0) {
      scored.push({ score: matchCount / terms.length, path: p, artifact: a });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, limit).map(s => ({
    path: s.path,
    score: Math.round(s.score * 100) / 100,
    type: s.artifact.type,
    kind: s.artifact.kind,
    summary: s.artifact.summary || null
  }));

  return { queryType: 'search', count: results.length, total: scored.length, results };
}

/**
 * Convert a simple pattern (with * wildcards) to a regex for matching.
 * @param {string} pattern
 * @returns {RegExp}
 */
function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(escaped, 'i');
}

module.exports = { loadModel, executeQuery, patternToRegex };
