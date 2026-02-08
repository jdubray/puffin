'use strict';

/**
 * @module cre-errors
 * Shared error handling utilities for the Central Reasoning Engine.
 *
 * Provides:
 *   - withRetry()        — retry async operations with backoff (AC1)
 *   - validateAndFilter() — validate instance data, skip invalid, log warnings (AC2)
 *   - markStaleArtifacts() — detect references to missing files (AC4)
 *   - detectPlanCycles()  — detect dependency cycles in plan stories (AC5)
 */

const { validateInstance } = require('./hdsl-validator');

/**
 * Execute an async function with one retry on failure.
 * On first failure, waits `delayMs` then retries once.
 * If the retry also fails, throws the retry error.
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} [options]
 * @param {number} [options.delayMs=1000] - Delay before retry in milliseconds
 * @param {string} [options.label='operation'] - Label for log messages
 * @returns {Promise<*>} Result of fn
 */
async function withRetry(fn, { delayMs = 1000, label = 'operation' } = {}) {
  try {
    return await fn();
  } catch (firstErr) {
    console.warn(`[CRE] ${label} failed, retrying in ${delayMs}ms:`, firstErr.message);

    await new Promise(resolve => setTimeout(resolve, delayMs));

    try {
      return await fn();
    } catch (retryErr) {
      console.error(`[CRE] ${label} failed after retry:`, retryErr.message);
      throw retryErr;
    }
  }
}

/**
 * Validate an instance against a schema and return only valid elements.
 * Invalid elements are logged as warnings and excluded from the result.
 *
 * @param {Object} instance - h-DSL code model instance
 * @param {Object} schema - h-DSL schema
 * @returns {{ filtered: Object, warnings: Array<{path: string, message: string}> }}
 */
function validateAndFilter(instance, schema) {
  const warnings = [];

  if (!instance || !schema) {
    return { filtered: instance || { artifacts: {}, dependencies: [], flows: {} }, warnings };
  }

  const result = validateInstance(instance, schema);

  if (result.valid) {
    return { filtered: instance, warnings };
  }

  // Build a set of invalid artifact keys and dependency indices
  const invalidArtifacts = new Set();
  const invalidDepIndices = new Set();
  const invalidFlows = new Set();

  for (const err of result.errors) {
    warnings.push({ path: err.path, message: err.message });
    console.warn(`[CRE] Schema violation at ${err.path}: ${err.message}`);

    // Parse path to determine what to skip.
    // Match against actual keys to handle dotted names (e.g. "bad.js").
    if (err.path.startsWith('artifacts.') && instance.artifacts) {
      const rest = err.path.slice('artifacts.'.length);
      const key = Object.keys(instance.artifacts).find(k => rest === k || rest.startsWith(k + '.'));
      if (key) {
        invalidArtifacts.add(key);
        continue;
      }
    }

    const depMatch = err.path.match(/^dependencies\[(\d+)\]/);
    if (depMatch) {
      invalidDepIndices.add(parseInt(depMatch[1], 10));
      continue;
    }

    if (err.path.startsWith('flows.') && instance.flows) {
      const rest = err.path.slice('flows.'.length);
      const key = Object.keys(instance.flows).find(k => rest === k || rest.startsWith(k + '.'));
      if (key) {
        invalidFlows.add(key);
      }
    }
  }

  // Build filtered instance without invalid elements
  const filteredArtifacts = {};
  if (instance.artifacts) {
    for (const [key, value] of Object.entries(instance.artifacts)) {
      if (!invalidArtifacts.has(key)) {
        filteredArtifacts[key] = value;
      }
    }
  }

  const filteredDeps = Array.isArray(instance.dependencies)
    ? instance.dependencies.filter((_, i) => !invalidDepIndices.has(i))
    : [];

  const filteredFlows = {};
  if (instance.flows) {
    for (const [key, value] of Object.entries(instance.flows)) {
      if (!invalidFlows.has(key)) {
        filteredFlows[key] = value;
      }
    }
  }

  const skipped = invalidArtifacts.size + invalidDepIndices.size + invalidFlows.size;
  if (skipped > 0) {
    console.warn(`[CRE] Skipped ${skipped} invalid element(s) due to schema violations`);
  }

  return {
    filtered: {
      ...instance,
      artifacts: filteredArtifacts,
      dependencies: filteredDeps,
      flows: filteredFlows
    },
    warnings
  };
}

/**
 * Scan instance artifacts and mark any that reference files not in the
 * provided file list as stale. Does not remove them — just adds a
 * `_stale: true` flag and logs a warning.
 *
 * @param {Object} instance - h-DSL code model instance
 * @param {Set<string>|string[]} existingFiles - Set or array of existing file paths
 * @returns {{ instance: Object, staleCount: number }}
 */
function markStaleArtifacts(instance, existingFiles) {
  if (!instance || !instance.artifacts) {
    return { instance: instance || { artifacts: {}, dependencies: [], flows: {} }, staleCount: 0 };
  }

  const fileSet = existingFiles instanceof Set ? existingFiles : new Set(existingFiles);
  let staleCount = 0;

  for (const [key, artifact] of Object.entries(instance.artifacts)) {
    if (!artifact || typeof artifact !== 'object') continue;

    const artifactPath = artifact.path;
    if (artifactPath && !fileSet.has(artifactPath)) {
      if (!artifact._stale) {
        artifact._stale = true;
        staleCount++;
        console.warn(`[CRE] Artifact "${key}" references missing file "${artifactPath}", marked as stale`);
      }
    } else if (artifact._stale) {
      // File exists again — clear stale flag
      delete artifact._stale;
    }
  }

  // Also check dependency references to stale artifacts
  if (Array.isArray(instance.dependencies)) {
    for (const dep of instance.dependencies) {
      const fromArtifact = instance.artifacts[dep.from];
      const toArtifact = instance.artifacts[dep.to];
      if ((fromArtifact && fromArtifact._stale) || (toArtifact && toArtifact._stale)) {
        dep._stale = true;
      } else if (dep._stale) {
        delete dep._stale;
      }
    }
  }

  if (staleCount > 0) {
    console.warn(`[CRE] Marked ${staleCount} artifact(s) as stale (referencing deleted files)`);
  }

  return { instance, staleCount };
}

/**
 * Detect dependency cycles in a plan's story ordering.
 * Stories are nodes; dependencies between stories are edges.
 * Uses Kahn's algorithm for topological sort.
 *
 * @param {Array<Object>} stories - Plan stories with { id, dependsOn: string[] }
 * @returns {{ hasCycle: boolean, cycle: string[], sorted: string[] }}
 */
function detectPlanCycles(stories) {
  if (!Array.isArray(stories) || stories.length === 0) {
    return { hasCycle: false, cycle: [], sorted: [] };
  }

  const ids = new Set(stories.map(s => s.id));
  const inDegree = new Map();
  const adj = new Map(); // parent -> children

  for (const s of stories) {
    inDegree.set(s.id, 0);
    adj.set(s.id, []);
  }

  for (const story of stories) {
    const deps = story.dependsOn || [];
    for (const dep of deps) {
      if (!ids.has(dep)) continue; // skip external deps
      adj.get(dep).push(story.id);
      inDegree.set(story.id, (inDegree.get(story.id) || 0) + 1);
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted = [];
  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);
    for (const child of adj.get(node) || []) {
      const deg = inDegree.get(child) - 1;
      inDegree.set(child, deg);
      if (deg === 0) queue.push(child);
    }
  }

  if (sorted.length === ids.size) {
    return { hasCycle: false, cycle: [], sorted };
  }

  // Nodes not in sorted are in the cycle
  const cycle = [...ids].filter(id => !sorted.includes(id));
  const cycleLabels = cycle.map(id => {
    const story = stories.find(s => s.id === id);
    return story ? (story.title || id) : id;
  });

  console.error(`[CRE] Plan dependency cycle detected involving: ${cycleLabels.join(', ')}`);
  return { hasCycle: true, cycle: cycleLabels, sorted };
}

module.exports = {
  withRetry,
  validateAndFilter,
  markStaleArtifacts,
  detectPlanCycles
};
