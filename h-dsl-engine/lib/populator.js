/**
 * @module populator
 * Phase 3: POPULATE INSTANCE — build the Code Model from discovered artifacts.
 *
 * Creates artifact entries, generates AI prose, records dependencies,
 * detects schema gaps, and identifies flows.
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');
const { createEmptyInstance, M3Primitives } = require('./hdsl-types');
const { aiQuery, aiBatchQuery } = require('./ai-client');

/** Max files per AI batch for prose generation. */
const BATCH_SIZE = 8;

/** Max file content sent to AI (chars). */
const MAX_FILE_CONTENT = 3000;

/**
 * Populate the Code Model instance from discovery results.
 *
 * @param {Object} params
 * @param {import('./discoverer').DiscoveryResult} params.discovery
 * @param {Object} params.schema - The derived schema.
 * @param {string} params.projectRoot - Absolute project root.
 * @param {Function} params.log
 * @returns {Promise<{instance: Object, schema: Object}>}
 */
async function populate({ discovery, schema, projectRoot, log }) {
  const instance = createEmptyInstance();
  instance.projectRoot = projectRoot;

  // Group artifacts by top-level directory for batch processing
  const batches = groupByDirectory(discovery.rawArtifacts);
  log(`  ${Object.keys(batches).length} directory batches`);

  // Process each batch
  for (const [dir, artifacts] of Object.entries(batches)) {
    log(`  Processing: ${dir}/ (${artifacts.length} files)`);

    // Create artifact entries with structured fields
    for (const raw of artifacts) {
      const kind = classifyArtifact(raw, schema);
      instance.artifacts[raw.path] = {
        type: kind,
        path: raw.path,
        kind: getFileKind(raw),
        summary: '',
        intent: '',
        exports: raw.exports || [],
        tags: deriveTags(raw),
        size: null
      };

      // Get file size
      try {
        const stat = await fs.stat(path.join(projectRoot, raw.path));
        instance.artifacts[raw.path].size = stat.size;
      } catch { /* ignore */ }
    }

    // AI-generate prose in batches (BR-05)
    await generateProseBatch(artifacts, instance, projectRoot, log);

    // Record dependencies from import graph (BR-06)
    for (const raw of artifacts) {
      for (const imp of raw.imports || []) {
        if (imp.source.startsWith('.')) {
          const resolvedTo = resolveImport(raw.path, imp.source);
          // Only add dependency if target exists in our artifacts
          const targetExists = instance.artifacts[resolvedTo] ||
            instance.artifacts[resolvedTo.replace(/\.js$/, '')] ||
            instance.artifacts[resolvedTo + '/index.js'];

          if (targetExists) {
            const targetPath = instance.artifacts[resolvedTo] ? resolvedTo
              : instance.artifacts[resolvedTo.replace(/\.js$/, '')] ? resolvedTo.replace(/\.js$/, '')
              : resolvedTo + '/index.js';

            instance.dependencies.push({
              from: raw.path,
              to: targetPath,
              kind: 'imports',
              weight: 'normal'
            });
          }
        }
      }
    }
  }

  // Also create entries for non-source files (configs, docs)
  for (const file of discovery.files) {
    if (!instance.artifacts[file.relativePath]) {
      const ext = file.ext;
      if (ext === '.json' && !file.relativePath.includes('package-lock')) {
        instance.artifacts[file.relativePath] = {
          type: 'config',
          path: file.relativePath,
          kind: 'json',
          summary: `Configuration file: ${path.basename(file.relativePath)}`,
          exports: [],
          tags: ['config'],
          size: file.size
        };
      }
    }
  }

  // Detect flows (BR-07)
  detectFlows(instance, discovery, log);

  // Cross-reference pass: remove dependencies pointing to non-existent artifacts
  instance.dependencies = instance.dependencies.filter(dep =>
    instance.artifacts[dep.from] && instance.artifacts[dep.to]
  );

  // Prose coverage pass: fill in missing summaries
  for (const [artPath, artifact] of Object.entries(instance.artifacts)) {
    if (!artifact.summary) {
      artifact.summary = `Module at ${artPath}`;
    }
  }

  // Add stats
  instance.stats = {
    filesScanned: discovery.files.length,
    artifactCount: Object.keys(instance.artifacts).length,
    dependencyCount: instance.dependencies.length,
    flowCount: Object.keys(instance.flows).length,
    proseCoverage: computeProseCoverage(instance)
  };
  instance.bootstrapDate = new Date().toISOString();

  return { instance, schema };
}

/**
 * Group raw artifacts by their top-level directory.
 * @param {Array} rawArtifacts
 * @returns {Object<string, Array>}
 */
function groupByDirectory(rawArtifacts) {
  const groups = {};
  for (const art of rawArtifacts) {
    const dir = art.path.split('/')[0] || '_root';
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(art);
  }
  return groups;
}

/**
 * Classify an artifact into a schema element type.
 * @param {Object} raw
 * @param {Object} schema
 * @returns {string}
 */
function classifyArtifact(raw, schema) {
  const p = raw.path;
  if (p.includes('.test.') || p.includes('.spec.') || p.includes('tests/') || p.includes('test/')) {
    return schema.elementTypes.test ? 'test' : 'module';
  }
  if (p.endsWith('.json') || p.endsWith('.yaml') || p.endsWith('.yml')) {
    return schema.elementTypes.config ? 'config' : 'module';
  }
  if (raw.classes && raw.classes.length > 0) {
    return 'module'; // classes are modules in the base schema
  }
  return 'module';
}

/**
 * Determine the kind of a file artifact.
 * @param {Object} raw
 * @returns {string}
 */
function getFileKind(raw) {
  if (raw.classes && raw.classes.length > 0) return 'module';
  if (raw.path.endsWith('.json')) return 'config';
  return 'module';
}

/**
 * Derive tags from file path and contents.
 * @param {Object} raw
 * @returns {string[]}
 */
function deriveTags(raw) {
  const tags = [];
  const p = raw.path;
  if (p.includes('test')) tags.push('test');
  if (p.includes('plugin')) tags.push('plugin');
  if (p.includes('util') || p.includes('helper')) tags.push('utility');
  if (p.includes('config') || p.endsWith('.json')) tags.push('config');
  if (p.includes('middleware')) tags.push('middleware');
  if (p.includes('service')) tags.push('service');
  if (p.includes('component')) tags.push('component');
  if (raw.path.includes('index.')) tags.push('entry-point');
  if (raw.classes && raw.classes.length > 0) tags.push('class');
  return [...new Set(tags)];
}

/**
 * Generate prose summaries for a batch of artifacts using AI.
 * @param {Array} artifacts
 * @param {Object} instance
 * @param {string} projectRoot
 * @param {Function} log
 */
async function generateProseBatch(artifacts, instance, projectRoot, log) {
  // Split into batches
  for (let i = 0; i < artifacts.length; i += BATCH_SIZE) {
    const batch = artifacts.slice(i, i + BATCH_SIZE);
    const items = [];

    for (const art of batch) {
      try {
        const content = await fs.readFile(path.join(projectRoot, art.path), 'utf-8');
        items.push({ path: art.path, content: content.slice(0, MAX_FILE_CONTENT) });
      } catch {
        items.push({ path: art.path, content: '// Could not read file' });
      }
    }

    const systemPrompt = `You are summarizing source code modules. For each file, provide:
- summary: One sentence describing what this module does.
- intent: 1-2 sentences about its purpose, responsibilities, and key design decisions.
Return a JSON array with objects { "path": "...", "summary": "...", "intent": "..." } for each file.
Return ONLY valid JSON — no markdown code blocks.`;

    const result = aiBatchQuery(systemPrompt, items, { log });

    if (result.success && Array.isArray(result.data)) {
      for (const item of result.data) {
        if (item.path && instance.artifacts[item.path]) {
          if (item.summary) instance.artifacts[item.path].summary = item.summary;
          if (item.intent) instance.artifacts[item.path].intent = item.intent;
        }
      }
    } else {
      // Graceful degradation (BNR-04): mark as unavailable
      for (const art of batch) {
        if (instance.artifacts[art.path] && !instance.artifacts[art.path].summary) {
          instance.artifacts[art.path].summary = 'AI summary unavailable';
        }
      }
    }
  }
}

/**
 * Resolve a relative import to a project-relative path.
 * @param {string} fromFile
 * @param {string} importSource
 * @returns {string}
 */
function resolveImport(fromFile, importSource) {
  const dir = path.posix.dirname(fromFile);
  let resolved = path.posix.join(dir, importSource);
  if (!path.extname(resolved)) resolved += '.js';
  return resolved;
}

/**
 * Detect multi-step flows from code structure (BR-07).
 * @param {Object} instance
 * @param {import('./discoverer').DiscoveryResult} discovery
 * @param {Function} log
 */
function detectFlows(instance, discovery, log) {
  // Detect chains: find sequences of imports that form a pipeline
  // A flow is a set of files where A→B→C (each imports the next)
  const chains = findImportChains(instance.dependencies, 3);

  for (let i = 0; i < chains.length && i < 10; i++) {
    const chain = chains[i];
    const name = `flow-${i + 1}`;
    instance.flows[name] = {
      name,
      summary: `Import chain from ${path.basename(chain[0])} through ${chain.length} modules`,
      steps: chain.map((artPath, idx) => ({
        order: idx + 1,
        artifact: artPath,
        intent: instance.artifacts[artPath] ? instance.artifacts[artPath].summary : ''
      })),
      tags: ['auto-detected']
    };
  }

  if (Object.keys(instance.flows).length > 0) {
    log(`  Detected ${Object.keys(instance.flows).length} flows`);
  }
}

/**
 * Find linear import chains of at least minLength.
 * @param {Array} dependencies
 * @param {number} minLength
 * @returns {Array<string[]>}
 */
function findImportChains(dependencies, minLength) {
  const outbound = new Map();
  const inbound = new Set();
  for (const dep of dependencies) {
    if (dep.kind !== 'imports') continue;
    if (!outbound.has(dep.from)) outbound.set(dep.from, []);
    outbound.get(dep.from).push(dep.to);
    inbound.add(dep.to);
  }

  // Find chain starts: nodes that import others but aren't imported themselves
  const starts = [...outbound.keys()].filter(k => !inbound.has(k));
  const chains = [];

  for (const start of starts) {
    const chain = [start];
    let current = start;
    const visited = new Set([start]);

    while (true) {
      const targets = outbound.get(current) || [];
      // Follow the chain if there's exactly one outbound import
      const next = targets.find(t => !visited.has(t));
      if (!next) break;
      chain.push(next);
      visited.add(next);
      current = next;
    }

    if (chain.length >= minLength) {
      chains.push(chain);
    }
  }

  return chains.sort((a, b) => b.length - a.length);
}

/**
 * Compute prose coverage as a ratio.
 * @param {Object} instance
 * @returns {number}
 */
function computeProseCoverage(instance) {
  const artifacts = Object.values(instance.artifacts);
  if (artifacts.length === 0) return 0;
  const withProse = artifacts.filter(a =>
    a.summary && a.summary !== 'AI summary unavailable' && a.summary !== `Module at ${a.path}`
  ).length;
  return +(withProse / artifacts.length).toFixed(2);
}

module.exports = { populate };
