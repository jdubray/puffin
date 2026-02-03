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

/** Pattern for splitting camelCase/PascalCase into words. */
const CAMEL_SPLIT = /([a-z])([A-Z])/g;

/** Common verb prefixes that hint at function purpose. */
const VERB_INTENTS = {
  get: 'Retrieves', set: 'Sets', update: 'Updates', create: 'Creates',
  delete: 'Deletes', remove: 'Removes', add: 'Adds', load: 'Loads',
  save: 'Saves', init: 'Initializes', start: 'Starts', stop: 'Stops',
  handle: 'Handles', on: 'Handles event for', emit: 'Emits',
  parse: 'Parses', build: 'Builds', render: 'Renders', format: 'Formats',
  validate: 'Validates', check: 'Checks', is: 'Tests whether',
  has: 'Tests whether it has', find: 'Finds', search: 'Searches for',
  filter: 'Filters', sort: 'Sorts', transform: 'Transforms',
  compute: 'Computes', calculate: 'Calculates', derive: 'Derives',
  resolve: 'Resolves', normalize: 'Normalizes', clear: 'Clears',
  reset: 'Resets', toggle: 'Toggles', show: 'Shows', hide: 'Hides',
  open: 'Opens', close: 'Closes', connect: 'Connects', disconnect: 'Disconnects',
  send: 'Sends', receive: 'Receives', fetch: 'Fetches', submit: 'Submits',
  cancel: 'Cancels', complete: 'Completes', mark: 'Marks',
  extract: 'Extracts', inject: 'Injects', register: 'Registers'
};

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

    // Create artifact entries with structured fields and children
    for (const raw of artifacts) {
      const kind = classifyArtifact(raw, schema);
      const children = buildChildren(raw);

      instance.artifacts[raw.path] = {
        type: kind,
        path: raw.path,
        kind: kind,  // Use same classification for both type and kind
        summary: '',
        intent: '',
        exports: raw.exports || [],
        tags: deriveTags(raw),
        size: null,
        children: children.length > 0 ? children : undefined
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
          const targetPath = resolveImportToArtifact(raw.path, imp.source, instance.artifacts);
          if (targetPath) {
            instance.dependencies.push({
              from: raw.path,
              to: targetPath,
              kind: 'imports',
              weight: 'normal',
              intent: imp.specifiers.length > 0 ? `Imports ${imp.specifiers.join(', ')}` : ''
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
 * Classify an artifact into a semantic kind based on multiple heuristics:
 * 1. Path patterns (/components/, /services/, /utils/, etc.)
 * 2. File name patterns (*.controller.js, *.service.js, etc.)
 * 3. Class suffix patterns (FooService, BarController, etc.)
 * 4. Export patterns (useXxx for hooks)
 *
 * @param {Object} raw - Raw artifact data from discovery.
 * @param {Object} schema - The derived schema (unused but kept for API compatibility).
 * @returns {string} One of: module, service, component, utility, config,
 *                   middleware, controller, model, test, entry, plugin, hook
 */
function classifyArtifact(raw, schema) {
  const p = raw.path.toLowerCase();
  const basename = path.basename(raw.path, path.extname(raw.path)).toLowerCase();

  // 1. Test files (highest priority — test trumps other classifications)
  if (p.includes('.test.') || p.includes('.spec.') ||
      p.includes('/tests/') || p.includes('/test/') ||
      p.includes('/__tests__/') || basename.endsWith('.test') || basename.endsWith('.spec')) {
    return 'test';
  }

  // 2. Config files
  if (p.endsWith('.json') || p.endsWith('.yaml') || p.endsWith('.yml') ||
      basename.includes('config') || basename.endsWith('rc') ||
      basename === '.eslintrc' || basename === '.prettierrc') {
    return 'config';
  }

  // 3. Entry points
  if (basename === 'index' || basename === 'main' || basename === 'app' ||
      basename === 'server' || basename === 'cli') {
    return 'entry';
  }

  // 4. Path-based classification (directory structure)
  if (p.includes('/component') || p.includes('/view') || p.includes('/ui/')) {
    return 'component';
  }
  if (p.includes('/service') || p.includes('/api/') || p.includes('/client/')) {
    return 'service';
  }
  if (p.includes('/util') || p.includes('/helper')) {
    return 'utility';
  }
  if (p.includes('/middleware')) {
    return 'middleware';
  }
  if (p.includes('/controller') || p.includes('/handler') || p.includes('/route')) {
    return 'controller';
  }
  if (p.includes('/model') || p.includes('/entity') || p.includes('/schema')) {
    return 'model';
  }
  if (p.includes('/hook')) {
    return 'hook';
  }
  if (p.includes('/plugin')) {
    return 'plugin';
  }

  // 5. File suffix patterns (e.g., user.service.js, auth.controller.js)
  const suffixMatch = basename.match(/\.(\w+)$/);
  if (suffixMatch) {
    const suffix = suffixMatch[1];
    if (['service', 'svc'].includes(suffix)) return 'service';
    if (['component', 'comp'].includes(suffix)) return 'component';
    if (['controller', 'ctrl'].includes(suffix)) return 'controller';
    if (['middleware', 'mw'].includes(suffix)) return 'middleware';
    if (['util', 'utils', 'helper', 'helpers'].includes(suffix)) return 'utility';
    if (['model', 'entity'].includes(suffix)) return 'model';
    if (['hook', 'hooks'].includes(suffix)) return 'hook';
    if (['plugin'].includes(suffix)) return 'plugin';
  }

  // 6. Class-based classification (class name suffix patterns)
  if (raw.classDetails && raw.classDetails.length > 0) {
    const className = raw.classDetails[0].name;
    if (className.endsWith('Service') || className.endsWith('Client') || className.endsWith('Api')) {
      return 'service';
    }
    if (className.endsWith('Controller') || className.endsWith('Handler')) {
      return 'controller';
    }
    if (className.endsWith('Component') || className.endsWith('View')) {
      return 'component';
    }
    if (className.endsWith('Middleware')) {
      return 'middleware';
    }
    if (className.endsWith('Model') || className.endsWith('Entity') || className.endsWith('Schema')) {
      return 'model';
    }
    if (className.endsWith('Plugin') || className.endsWith('Extension')) {
      return 'plugin';
    }
    if (className.endsWith('Helper') || className.endsWith('Utils') || className.endsWith('Util')) {
      return 'utility';
    }
  }

  // 7. Export-based classification (React hooks pattern: useXxx)
  if (raw.exports && raw.exports.length > 0) {
    const mainExport = raw.exports[0];
    if (mainExport.startsWith('use') && mainExport.length > 3 && /^use[A-Z]/.test(mainExport)) {
      return 'hook';
    }
  }

  // 8. Function-based classification (check if all exports look like utilities)
  if (raw.functionDetails && raw.functionDetails.length > 0 && (!raw.classDetails || raw.classDetails.length === 0)) {
    // Files with only functions and no classes in util-like paths
    const fnNames = raw.functionDetails.map(f => f.name);
    const utilPatterns = ['get', 'set', 'is', 'has', 'to', 'from', 'parse', 'format', 'validate', 'convert', 'create'];
    const utilCount = fnNames.filter(n => utilPatterns.some(p => n.toLowerCase().startsWith(p))).length;
    if (utilCount > fnNames.length / 2) {
      return 'utility';
    }
  }

  // Default fallback
  return 'module';
}

/**
 * Determine the kind of a file artifact.
 * Delegates to classifyArtifact for consistent classification.
 * @param {Object} raw - Raw artifact data.
 * @param {Object} [schema] - Optional schema (for API compatibility).
 * @returns {string}
 */
function getFileKind(raw, schema) {
  return classifyArtifact(raw, schema || {});
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
 * Generate prose summaries for a batch of artifacts using AI,
 * with heuristic fallback when AI is unavailable.
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
      // Heuristic fallback (BNR-04): generate summaries from structural data
      log('    AI unavailable — generating heuristic prose from JSDoc and structure');
      for (const art of batch) {
        if (instance.artifacts[art.path]) {
          generateHeuristicProse(art, instance.artifacts[art.path]);
        }
      }
    }
  }
}

/**
 * Build child artifact entries (functions/classes) from raw parsed data.
 * @param {Object} raw - Raw artifact with functionDetails and classDetails.
 * @returns {Array} Array of child SLOT descriptors.
 */
function buildChildren(raw) {
  const children = [];

  // Add class children
  if (raw.classDetails) {
    for (const cls of raw.classDetails) {
      const child = {
        name: cls.name,
        kind: 'class',
        line: cls.line,
        endLine: cls.endLine,
        superClass: cls.superClass || undefined,
        summary: cls.jsdoc ? extractFirstSentence(cls.jsdoc) : heuristicClassSummary(cls),
        intent: cls.jsdoc || ''
      };
      if (cls.methods && cls.methods.length > 0) {
        child.methods = cls.methods.map(m => ({
          name: m.name,
          params: m.params,
          line: m.line,
          summary: m.jsdoc ? extractFirstSentence(m.jsdoc) : heuristicFunctionSummary(m.name, m.params)
        }));
      }
      children.push(child);
    }
  }

  // Add function children
  if (raw.functionDetails) {
    for (const fn of raw.functionDetails) {
      const signature = `${fn.async ? 'async ' : ''}${fn.name}(${fn.params.join(', ')})`;
      children.push({
        name: fn.name,
        kind: 'function',
        signature,
        line: fn.line,
        endLine: fn.endLine,
        params: fn.params,
        async: fn.async || undefined,
        summary: fn.jsdoc ? extractFirstSentence(fn.jsdoc) : heuristicFunctionSummary(fn.name, fn.params),
        intent: fn.jsdoc || ''
      });
    }
  }

  return children;
}

/**
 * Extract the first sentence from a JSDoc comment.
 * @param {string} jsdoc
 * @returns {string}
 */
function extractFirstSentence(jsdoc) {
  // Strip @tags
  const lines = jsdoc.split('\n').filter(l => !l.trim().startsWith('@'));
  const text = lines.join(' ').trim();
  // Take first sentence
  const match = text.match(/^(.+?[.!?])\s/);
  return match ? match[1] : text.slice(0, 120);
}

/**
 * Generate a heuristic summary for a function from its name and params.
 * @param {string} name
 * @param {string[]} params
 * @returns {string}
 */
function heuristicFunctionSummary(name, params) {
  // Split camelCase name into words
  const words = name.replace(CAMEL_SPLIT, '$1 $2').replace(/_/g, ' ').split(' ');
  const verb = words[0].toLowerCase();
  const rest = words.slice(1).join(' ').toLowerCase();

  const verbIntent = VERB_INTENTS[verb];
  if (verbIntent) {
    const paramNote = params.length > 0 ? ` given ${params.join(', ')}` : '';
    return `${verbIntent} ${rest || 'data'}${paramNote}.`;
  }

  // Fallback: just describe shape
  const paramNote = params.length > 0 ? ` (${params.join(', ')})` : '';
  return `${name}${paramNote}`;
}

/**
 * Generate a heuristic summary for a class.
 * @param {Object} cls - ClassDetail.
 * @returns {string}
 */
function heuristicClassSummary(cls) {
  const words = cls.name.replace(CAMEL_SPLIT, '$1 $2').split(' ');
  const suffix = words[words.length - 1];
  const prefix = words.slice(0, -1).join(' ');

  const methodNames = (cls.methods || []).map(m => m.name).filter(n => n !== 'constructor');
  const methodNote = methodNames.length > 0 ? ` Methods: ${methodNames.slice(0, 5).join(', ')}${methodNames.length > 5 ? '...' : ''}.` : '';

  if (cls.superClass) {
    return `${cls.name} extends ${cls.superClass}.${methodNote}`;
  }
  return `${prefix || ''} ${suffix.toLowerCase() || 'class'}.${methodNote}`.trim();
}

/**
 * Generate heuristic prose for a module artifact when AI is unavailable.
 * Uses the file's leading JSDoc block, children JSDoc, export names, and structural patterns.
 * @param {Object} raw - Raw artifact data.
 * @param {Object} artifact - Instance artifact entry to populate.
 */
function generateHeuristicProse(raw, artifact) {
  const exportNames = raw.exports || [];
  const fnDetails = raw.functionDetails || [];
  const classDetails = raw.classDetails || [];
  const basename = path.basename(raw.path, path.extname(raw.path));

  // Try to find the module-level JSDoc from the raw file content.
  // The module JSDoc comment is stored on the *first* child that has it,
  // since buildJSDocMap maps it to the line after the comment block.
  // We need to check all children for @module tags.
  const allJsdocs = [
    ...fnDetails.map(f => f.jsdoc),
    ...classDetails.map(c => c.jsdoc)
  ].filter(Boolean);

  for (const jsdoc of allJsdocs) {
    if (jsdoc.includes('@module')) {
      const descLines = jsdoc.split('\n').filter(l => !l.trim().startsWith('@'));
      const desc = descLines.join(' ').trim();
      if (desc) {
        artifact.summary = extractFirstSentence(desc);
        artifact.intent = desc;
        return;
      }
    }
  }

  // Also check if raw has a moduleJsdoc field (set by discoverer for leading comment)
  if (raw.moduleJsdoc) {
    const descLines = raw.moduleJsdoc.split('\n').filter(l => !l.trim().startsWith('@'));
    const desc = descLines.join(' ').trim();
    if (desc) {
      artifact.summary = extractFirstSentence(desc);
      artifact.intent = desc;
      return;
    }
  }

  // Build summary from structural data
  const parts = [];

  // Describe by what it exports
  if (classDetails.length > 0) {
    const classNames = classDetails.map(c => c.name);
    parts.push(`Defines ${classNames.join(', ')}`);
  }

  if (exportNames.length > 0 && classDetails.length === 0) {
    if (exportNames.length <= 3) {
      parts.push(`Exports ${exportNames.join(', ')}`);
    } else {
      parts.push(`Exports ${exportNames.length} symbols including ${exportNames.slice(0, 3).join(', ')}`);
    }
  }

  // Describe by function count and purpose
  if (fnDetails.length > 0) {
    const publicFns = fnDetails.filter(f => !f.name.startsWith('_'));
    const privateFns = fnDetails.filter(f => f.name.startsWith('_'));

    // Use function-level JSDoc to build a richer description
    const fnSummaries = publicFns
      .filter(f => f.jsdoc)
      .map(f => `${f.name}: ${extractFirstSentence(f.jsdoc)}`)
      .slice(0, 3);

    if (fnSummaries.length > 0) {
      parts.push(`Key functions — ${fnSummaries.join('; ')}`);
    } else if (publicFns.length > 0) {
      parts.push(`${publicFns.length} public function${publicFns.length > 1 ? 's' : ''}`);
    }
    if (privateFns.length > 0) {
      parts.push(`${privateFns.length} internal helper${privateFns.length > 1 ? 's' : ''}`);
    }
  }

  // Humanize the basename as a hint
  const humanName = basename.replace(CAMEL_SPLIT, '$1 $2').replace(/[-_]/g, ' ').toLowerCase();

  if (parts.length > 0) {
    artifact.summary = `${parts[0]} — ${humanName} module.`;
    artifact.intent = parts.join('. ') + '.';
  } else {
    artifact.summary = `Module: ${humanName}.`;
    artifact.intent = '';
  }
}

/**
 * Resolve a relative import to an existing artifact path.
 * Tries multiple resolution strategies to match CommonJS/ESM conventions.
 * @param {string} fromFile - The importing file's path.
 * @param {string} importSource - The import specifier (e.g. './config').
 * @param {Object} artifacts - The instance artifacts map.
 * @returns {string|null} The matching artifact path, or null.
 */
function resolveImportToArtifact(fromFile, importSource, artifacts) {
  const dir = path.posix.dirname(fromFile);
  const base = path.posix.join(dir, importSource);

  // Normalize: remove leading ./ if present after join
  const normalize = (p) => p.replace(/^\.\//, '');

  // Try in order: exact, .js, .mjs, .cjs, /index.js
  const candidates = [
    base,
    base + '.js',
    base + '.mjs',
    base + '.cjs',
    base + '/index.js'
  ].map(normalize);

  for (const candidate of candidates) {
    if (artifacts[candidate]) return candidate;
  }
  return null;
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
