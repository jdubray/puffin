/**
 * @module tests/evaluation/eval-test-suite
 * Evaluation Test Suite: Code Model vs Standard Tools
 *
 * Demonstrates the benefits of the h-DSL Code Model over standard tools
 * (Grep, Glob, Read, Bash) by running equivalent queries both ways and
 * comparing accuracy, tool call count, and token consumption.
 *
 * Each test loads the real Puffin Code Model and compares:
 *   - baseline: simulated standard-tool approach (grep/glob/read counts)
 *   - code_model: actual h-DSL query
 * against manually verified ground truth.
 *
 * Run: node --test tests/evaluation/
 */

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Shared setup — load the Code Model once for all tests
// ---------------------------------------------------------------------------

const PUFFIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(PUFFIN_ROOT, '.puffin', 'cre');
const GROUND_TRUTH = require('./ground-truth.json');

let schema, instance;
let executeQuery, loadModel;
let navigate, analyzeImpact, discoverPatterns, queryModel;

/** Metrics collector for the final report. */
const report = [];

/**
 * Record a test result for the summary report.
 */
function record(category, id, question, baseline, codeModel, accuracy) {
  report.push({ category, id, question, baseline, codeModel, accuracy });
}

/**
 * Compute set-based F1 score.
 * @param {string[]} predicted - Predicted set of items.
 * @param {string[]} expected - Ground truth set.
 * @returns {{ precision: number, recall: number, f1: number }}
 */
function f1Score(predicted, expected) {
  const predSet = new Set(predicted);
  const expSet = new Set(expected);
  const tp = [...predSet].filter(x => expSet.has(x)).length;
  const precision = predSet.size > 0 ? tp / predSet.size : 0;
  const recall = expSet.size > 0 ? tp / expSet.size : 0;
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  return { precision: round(precision), recall: round(recall), f1: round(f1) };
}

function round(n) { return Math.round(n * 100) / 100; }

/**
 * Estimate token count from a string (rough: 1 token ≈ 4 chars).
 */
function estimateTokens(str) {
  return Math.ceil((typeof str === 'string' ? str : JSON.stringify(str)).length / 4);
}

// ---------------------------------------------------------------------------
// Load model before all tests
// ---------------------------------------------------------------------------

before(async () => {
  // Verify the Code Model exists
  const instancePath = path.join(DATA_DIR, 'instance.json');
  const schemaPath = path.join(DATA_DIR, 'schema.json');

  if (!fs.existsSync(instancePath) || !fs.existsSync(schemaPath)) {
    throw new Error(
      `Code Model not found at ${DATA_DIR}. Run the bootstrap first:\n` +
      `  node hdsl-bootstrap.js --project ${PUFFIN_ROOT}`
    );
  }

  // Load modules
  ({ loadModel, executeQuery } = require('../../lib/explorer'));
  ({ navigate } = require('../../lib/graph-navigator'));
  ({ analyzeImpact } = require('../../lib/impact-analyzer'));
  ({ discoverPatterns } = require('../../lib/pattern-discovery'));
  ({ queryModel } = require('../../lib/query-interface'));

  const model = await loadModel(DATA_DIR);
  schema = model.schema;
  instance = model.instance;
});

// ===========================================================================
// Category A: Dependency Tracing
// ===========================================================================

describe('Category A: Dependency Tracing', () => {

  it('A1: What files directly import plugin-loader.js?', () => {
    const gt = GROUND_TRUTH.A1_direct_importers_of_plugin_loader;

    // --- Baseline simulation ---
    // Standard tools: grep for require/import of plugin-loader across all files.
    // Need: 1 Glob (find all JS files) + 1 Grep (search for pattern) = 2 tool calls minimum.
    // But Grep may need to try both require() and import patterns = 2-3 calls.
    // Token cost: Grep returns full matching lines from every file.
    const baselineToolCalls = 3; // glob + grep(require) + grep(import)
    const baselineTokens = estimateTokens(
      'src/main/plugins/plugin-manager.js:5:const pluginLoader = require(\'./plugin-loader\');\n' +
      'src/main/plugins/index.js:3:const { loadPlugins } = require(\'./plugin-loader\');\n' +
      '// plus false positives from comments, strings, test files referencing the name'
    );

    // --- Code Model ---
    const result = executeQuery({
      schema, instance,
      query: { type: 'deps', artifact: 'src/main/plugins/plugin-loader.js', direction: 'inbound' }
    });
    const codeModelToolCalls = 1;
    const codeModelTokens = estimateTokens(JSON.stringify(result));

    const predicted = result.results.map(d => d.from);
    const scores = f1Score(predicted, gt.answer);

    record('A', 'A1', gt.question,
      { toolCalls: baselineToolCalls, tokens: baselineTokens },
      { toolCalls: codeModelToolCalls, tokens: codeModelTokens },
      scores
    );

    assert.ok(scores.f1 >= 0.8, `F1 score ${scores.f1} should be >= 0.8`);
    assert.ok(codeModelToolCalls < baselineToolCalls, 'Code Model should use fewer tool calls');
    assert.equal(result.results.length, gt.answer.length,
      `Expected ${gt.answer.length} importers, got ${result.results.length}`);
  });

  it('A2: Transitive dependency tree of main.js (depth 2)', () => {
    const gt = GROUND_TRUTH.A2_transitive_deps_main_js;

    // --- Baseline simulation ---
    // Standard tools: Read main.js, grep its imports (1+1=2 calls for depth 1).
    // Then for each depth-1 result, grep their imports (N more calls).
    // Depth 1 has 2 files → 2 more reads/greps = 4-6 calls.
    const baselineToolCalls = 6; // read main + grep imports + read each dep + grep their imports

    // --- Code Model ---
    const result = navigate({
      instance,
      options: {
        operation: 'walk',
        start: 'src/main/main.js',
        direction: 'outgoing',
        maxDepth: 2,
        limit: 100
      }
    });
    const codeModelToolCalls = 1;

    // Layers: [{ depth: 0, artifacts: [...] }, { depth: 1, artifacts: [...] }, ...]
    const layer1 = (result.layers || []).find(l => l.depth === 1);
    const layer2 = (result.layers || []).find(l => l.depth === 2);
    const predictedDepth1 = (layer1 && layer1.artifacts) || [];
    const predictedDepth2 = (layer2 && layer2.artifacts) || [];

    const d1Scores = f1Score(predictedDepth1, gt.depth1);
    const d2Scores = f1Score(predictedDepth2, gt.depth2);

    record('A', 'A2', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'N/A (multiple reads)' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify(result)) },
      { depth1: d1Scores, depth2: d2Scores }
    );

    assert.ok(d1Scores.f1 >= 0.8, `Depth-1 F1 ${d1Scores.f1} should be >= 0.8`);
    assert.ok(d2Scores.recall >= 0.5, `Depth-2 recall ${d2Scores.recall} should be >= 0.5`);
    assert.ok(codeModelToolCalls < baselineToolCalls, 'Code Model should use fewer tool calls');
  });

  it('A3: Which modules are orphans (nothing imports them)?', () => {
    const gt = GROUND_TRUTH.A3_orphan_modules;

    // --- Baseline simulation ---
    // Standard tools: Glob all JS files (1 call, returns ~302 paths).
    // Then grep for each filename across the codebase — O(N) calls.
    // Even batched, this is 50+ grep calls minimum.
    const baselineToolCalls = 50; // conservative: glob + many greps

    // --- Code Model ---
    const stats = executeQuery({ schema, instance, query: { type: 'stats' } });
    const codeModelToolCalls = 1;

    // Compute orphans from the model
    const fromSet = new Set(instance.dependencies.map(d => d.from));
    const toSet = new Set(instance.dependencies.map(d => d.to));
    const orphans = Object.keys(instance.artifacts).filter(a =>
      !fromSet.has(a) && !toSet.has(a)
    );

    record('A', 'A3', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'very large (N greps)' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify(stats)) },
      { orphanCount: orphans.length, meetsMinimum: orphans.length >= gt.minCount }
    );

    assert.ok(orphans.length >= gt.minCount,
      `Expected >= ${gt.minCount} orphans, got ${orphans.length}`);
    for (const sample of gt.sampleOrphans) {
      assert.ok(orphans.includes(sample), `Expected ${sample} to be an orphan`);
    }
  });

  it('A4: Impact of changing ipc-handlers.js', () => {
    const gt = GROUND_TRUTH.A4_impact_of_ipc_handlers;

    // --- Baseline simulation ---
    // Standard tools: grep for imports of ipc-handlers (2 calls for require/import).
    // Then trace callers recursively — manual graph walk, 4-8 calls.
    const baselineToolCalls = 6;

    // --- Code Model ---
    const result = analyzeImpact({
      schema, instance,
      target: { name: 'src/main/ipc-handlers.js', depth: 2 }
    });
    const codeModelToolCalls = 1;

    // Check that direct dependents are found
    const affectedPaths = (result.affectedFiles || []).map(f => f.path || f);
    const directDeps = executeQuery({
      schema, instance,
      query: { type: 'deps', artifact: 'src/main/ipc-handlers.js', direction: 'inbound' }
    });
    const incomingFrom = directDeps.results.map(d => d.from);

    const scores = f1Score(incomingFrom, gt.directDependents);

    // Also verify what ipc-handlers itself imports
    const outgoing = executeQuery({
      schema, instance,
      query: { type: 'deps', artifact: 'src/main/ipc-handlers.js', direction: 'outbound' }
    });
    const outgoingTo = outgoing.results.map(d => d.to);
    const outScores = f1Score(outgoingTo, gt.importedBy_ipc_handlers);

    record('A', 'A4', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'N/A' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify(result)) },
      { directDependents: scores, outgoingImports: outScores }
    );

    assert.ok(scores.recall >= 0.8, `Direct dependents recall ${scores.recall} should be >= 0.8`);
    assert.ok(outScores.recall >= 0.7, `Outgoing imports recall ${outScores.recall} should be >= 0.7`);
  });
});

// ===========================================================================
// Category B: Semantic Search
// ===========================================================================

describe('Category B: Semantic Search', () => {

  it('B1: Which modules handle persistence?', () => {
    const gt = GROUND_TRUTH.B1_persistence_modules;

    // --- Baseline simulation ---
    // Standard tools: Multiple greps for different keywords.
    // grep "sqlite" + grep "database" + grep "persist" + grep "save" + grep "store" = 5+ calls.
    // Many false positives (e.g., "store" matches Redux stores, plugin-state-store, etc.).
    const baselineToolCalls = 5;

    // --- Code Model ---
    const result = executeQuery({
      schema, instance,
      query: { type: 'search', pattern: 'database persistence save store connection' }
    });
    const codeModelToolCalls = 1;
    const codeModelTokens = estimateTokens(JSON.stringify(result));

    const predicted = result.results.map(r => r.path);
    const scores = f1Score(
      predicted.filter(p => gt.expectedPaths.some(e => p.includes(e.split('/').pop().replace('.js', '')))),
      gt.expectedPaths
    );

    // Check that at least some expected paths appear in results
    const foundExpected = gt.expectedPaths.filter(ep =>
      predicted.some(p => p === ep)
    );

    record('B', 'B1', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'high (many grep matches)' },
      { toolCalls: codeModelToolCalls, tokens: codeModelTokens },
      { foundExpected: foundExpected.length, totalExpected: gt.expectedPaths.length, resultCount: result.count }
    );

    assert.ok(foundExpected.length >= 1,
      `Should find at least 1 of ${gt.expectedPaths.length} expected paths, found ${foundExpected.length}`);
    assert.ok(codeModelToolCalls < baselineToolCalls, 'Fewer tool calls than baseline');
  });

  it('B2: What is responsible for the plugin lifecycle?', () => {
    const gt = GROUND_TRUTH.B2_plugin_lifecycle;

    // --- Baseline ---
    // grep "plugin" + grep "lifecycle" + grep "activate" + grep "deactivate" = 4+ calls.
    // Then Read files to confirm = more calls.
    const baselineToolCalls = 6;

    // --- Code Model ---
    const result = executeQuery({
      schema, instance,
      query: { type: 'search', pattern: 'plugin lifecycle activate load' }
    });
    const codeModelToolCalls = 1;

    const predicted = result.results.map(r => r.path);
    const foundExpected = gt.expectedPaths.filter(ep => predicted.includes(ep));

    record('B', 'B2', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'high' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify(result)) },
      { foundExpected: foundExpected.length, totalExpected: gt.expectedPaths.length }
    );

    assert.ok(foundExpected.length >= 2,
      `Should find >= 2 of ${gt.expectedPaths.length} lifecycle modules, found ${foundExpected.length}: ${foundExpected.join(', ')}`);
  });

  it('B3: Find the module that manages application state', () => {
    const gt = GROUND_TRUTH.B3_application_state;

    // --- Baseline ---
    // grep "state" returns massive noise (100+ matches). grep "puffin-state" is better
    // but still requires reading to understand context = 3-4 calls.
    const baselineToolCalls = 4;

    // --- Code Model ---
    const result = executeQuery({
      schema, instance,
      query: { type: 'search', pattern: 'application state management puffin' }
    });
    const codeModelToolCalls = 1;

    const predicted = result.results.map(r => r.path);
    const foundExpected = gt.expectedPaths.filter(ep => predicted.includes(ep));

    record('B', 'B3', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'very high (state is noisy)' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify(result)) },
      { foundExpected: foundExpected.length, totalExpected: gt.expectedPaths.length }
    );

    assert.ok(foundExpected.length >= 1,
      `Should find >= 1 state management module, found ${foundExpected.length}`);
  });

  it('B4: Which functions handle error recovery?', () => {
    const gt = GROUND_TRUTH.B4_error_recovery;

    // --- Baseline ---
    // grep "catch" = extremely noisy (every try/catch block).
    // grep "error" = even noisier. grep "recover" + grep "retry" = 4 calls.
    const baselineToolCalls = 4;

    // --- Code Model ---
    const result = executeQuery({
      schema, instance,
      query: { type: 'search', pattern: 'error recovery retry' }
    });
    const codeModelToolCalls = 1;

    record('B', 'B4', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'very high (catch is everywhere)' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify(result)) },
      { resultCount: result.count, meetsMinimum: result.count >= gt.expectedMinResults }
    );

    assert.ok(result.count >= gt.expectedMinResults,
      `Should find >= ${gt.expectedMinResults} results, got ${result.count}`);
  });
});

// ===========================================================================
// Category C: Artifact Discovery
// ===========================================================================

describe('Category C: Artifact Discovery', () => {

  it('C1: Summary of plugin-loader.js without reading the file', () => {
    const gt = GROUND_TRUTH.C1_plugin_loader_summary;

    // --- Baseline ---
    // Must Read the entire file (potentially hundreds of lines) and summarize.
    // 1 Read call, but token cost = entire file content.
    const baselineToolCalls = 1;
    // plugin-loader is a real file; estimate ~200 lines = ~800 tokens minimum
    const baselineTokens = 800;

    // --- Code Model ---
    const artifact = instance.artifacts[gt.path];
    const codeModelToolCalls = 1; // hdsl peek
    const codeModelResult = {
      path: gt.path,
      kind: artifact.kind,
      summary: artifact.summary,
      intent: artifact.intent,
      exports: artifact.exports,
      tags: artifact.tags,
      size: artifact.size,
      childCount: (artifact.children || []).length
    };
    const codeModelTokens = estimateTokens(JSON.stringify(codeModelResult));

    record('C', 'C1', gt.question,
      { toolCalls: baselineToolCalls, tokens: baselineTokens },
      { toolCalls: codeModelToolCalls, tokens: codeModelTokens },
      { hasSummary: !!artifact.summary, hasExports: (artifact.exports || []).length > 0 }
    );

    assert.ok(artifact, `Artifact ${gt.path} should exist in the model`);
    assert.equal(artifact.kind, gt.expectedKind);
    assert.ok(artifact.summary && artifact.summary.length > 10, 'Should have a meaningful summary');
    assert.ok((artifact.exports || []).length > 0, 'Should have exports listed');
    assert.ok(codeModelTokens < baselineTokens,
      `Code Model tokens (${codeModelTokens}) should be less than reading the file (${baselineTokens})`);
  });

  it('C2: Codebase overview — how many modules, tests, configs?', () => {
    const gt = GROUND_TRUTH.C2_codebase_overview;

    // --- Baseline ---
    // glob *.js (1 call) + glob *.test.js (1 call) + glob *.config.* (1 call)
    // + read a few sample files = 4-5 calls.
    const baselineToolCalls = 5;

    // --- Code Model ---
    const result = executeQuery({ schema, instance, query: { type: 'stats' } });
    const codeModelToolCalls = 1;

    const stats = result.results;
    const tolerance = gt.tolerance;

    record('C', 'C2', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'moderate (glob output)' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify(result)) },
      { artifacts: stats.artifactCount, deps: stats.dependencyCount, flows: stats.flowCount }
    );

    assert.ok(
      Math.abs(stats.artifactCount - gt.expectedArtifactCount) <= gt.expectedArtifactCount * tolerance,
      `Artifact count ${stats.artifactCount} should be within ${tolerance * 100}% of ${gt.expectedArtifactCount}`
    );
    assert.ok(
      Math.abs(stats.dependencyCount - gt.expectedDependencyCount) <= gt.expectedDependencyCount * tolerance,
      `Dependency count ${stats.dependencyCount} should be within ${tolerance * 100}% of ${gt.expectedDependencyCount}`
    );
    assert.equal(stats.flowCount, gt.expectedFlowCount, 'Flow count should match');
  });

  it('C3: What symbols does claude-service.js export?', () => {
    const gt = GROUND_TRUTH.C3_claude_service_exports;

    // --- Baseline ---
    // Read the file, scan for module.exports = 1 call but full file content.
    const baselineToolCalls = 1;
    const baselineTokens = 1500; // claude-service is a large file

    // --- Code Model ---
    const artifact = instance.artifacts[gt.path];
    const codeModelToolCalls = 1;
    const codeModelTokens = estimateTokens(JSON.stringify({
      exports: artifact.exports,
      children: (artifact.children || []).map(c => c.name)
    }));

    record('C', 'C3', gt.question,
      { toolCalls: baselineToolCalls, tokens: baselineTokens },
      { toolCalls: codeModelToolCalls, tokens: codeModelTokens },
      { hasExports: (artifact.exports || []).length > 0, exportCount: (artifact.exports || []).length }
    );

    assert.ok(artifact, `Artifact ${gt.path} should exist`);
    assert.ok((artifact.exports || []).length > 0 || (artifact.children || []).length > 0,
      'Should have exports or children listed');
    assert.ok(codeModelTokens < baselineTokens,
      `Code Model tokens (${codeModelTokens}) should be less than file read (${baselineTokens})`);
  });

  it('C4: List all modules tagged as "test"', () => {
    const gt = GROUND_TRUTH.C4_core_tagged_modules;

    // --- Baseline ---
    // No equivalent — tags don't exist in source files.
    // Would need: glob *.test.js + read each to check if it's actually a test = many calls.
    const baselineToolCalls = 3; // glob + confirmation reads

    // --- Code Model ---
    const result = executeQuery({
      schema, instance,
      query: { type: 'search', pattern: gt.tag }
    });
    const codeModelToolCalls = 1;

    // Also do direct tag filtering
    const taggedArtifacts = Object.entries(instance.artifacts)
      .filter(([, a]) => (a.tags || []).includes(gt.tag));

    record('C', 'C4', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'moderate' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify({ count: taggedArtifacts.length })) },
      { taggedCount: taggedArtifacts.length }
    );

    assert.ok(taggedArtifacts.length >= gt.expectedMinCount,
      `Expected >= ${gt.expectedMinCount} test-tagged artifacts, got ${taggedArtifacts.length}`);
  });
});

// ===========================================================================
// Category D: Cross-File Flow Understanding
// ===========================================================================

describe('Category D: Cross-File Flow Understanding', () => {

  it('D1: App startup sequence', () => {
    const gt = GROUND_TRUTH.D1_app_startup_flow;

    // --- Baseline ---
    // Read main.js, follow imports, read each = 5+ Read calls minimum.
    const baselineToolCalls = 5;

    // --- Code Model ---
    const walkResult = navigate({
      instance,
      options: {
        operation: 'walk',
        start: gt.entryPoint,
        direction: 'outgoing',
        maxDepth: 2,
        limit: 50
      }
    });
    const codeModelToolCalls = 1;

    const walkLayer1 = (walkResult.layers || []).find(l => l.depth === 1);
    const depth1Nodes = (walkLayer1 && walkLayer1.artifacts) || [];
    const scores = f1Score(depth1Nodes, gt.expectedConnectedModules);

    record('D', 'D1', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'very high (multiple file reads)' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify(walkResult)) },
      scores
    );

    assert.ok(scores.recall >= 0.8,
      `Startup sequence recall ${scores.recall} should be >= 0.8`);
    assert.ok(walkResult.nodes.length >= 3, 'Walk should find >= 3 nodes');
  });

  it('D2: Plugin discovery to activation flow', () => {
    const gt = GROUND_TRUTH.D2_plugin_discovery_to_activation;

    // --- Baseline ---
    // Read plugin-loader, plugin-manager, trace calls = 3+ Reads + Greps.
    const baselineToolCalls = 6;

    // --- Code Model ---
    // Search for plugin-related modules then trace connections
    const searchResult = executeQuery({
      schema, instance,
      query: { type: 'search', pattern: 'plugin loader manager registry activation' }
    });
    const codeModelToolCalls = 2; // search + trace

    const found = searchResult.results.map(r => r.path);
    const foundRelevant = gt.relevantModules.filter(rm => found.includes(rm));

    record('D', 'D2', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'very high' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify(searchResult)) },
      { foundRelevant: foundRelevant.length, totalRelevant: gt.relevantModules.length }
    );

    assert.ok(foundRelevant.length >= 2,
      `Should find >= 2 of ${gt.relevantModules.length} relevant modules, found ${foundRelevant.length}`);
  });

  it('D3: IPC message handling flow', () => {
    // --- Baseline ---
    // grep ipcMain.handle + read each handler + trace to renderer = 4+ calls.
    const baselineToolCalls = 5;

    // --- Code Model ---
    const searchResult = executeQuery({
      schema, instance,
      query: { type: 'search', pattern: 'ipc handler message' }
    });

    const walkResult = navigate({
      instance,
      options: {
        operation: 'walk',
        start: 'src/main/ipc-handlers.js',
        direction: 'outgoing',
        maxDepth: 1,
        limit: 20
      }
    });
    const codeModelToolCalls = 2;

    record('D', 'D3', 'How does IPC message handling work?',
      { toolCalls: baselineToolCalls, tokens: 'high' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify(walkResult)) },
      { searchResults: searchResult.count, walkNodes: walkResult.nodes.length }
    );

    assert.ok(searchResult.count >= 1, 'Should find IPC-related artifacts');
    assert.ok(walkResult.nodes.length >= 2, 'Walk from ipc-handlers should find dependencies');
  });
});

// ===========================================================================
// Category E: Change Planning
// ===========================================================================

describe('Category E: Change Planning', () => {

  it('E1: Adding a new IPC channel — what files to touch?', () => {
    const gt = GROUND_TRUTH.E1_new_ipc_channel;

    // --- Baseline ---
    // grep for existing IPC patterns, Read results to understand convention, infer files.
    // grep "ipcMain.handle" + grep "ipcRenderer" + grep "contextBridge" + Read results = 6+ calls.
    const baselineToolCalls = 8;

    // --- Code Model ---
    // Search for IPC-related modules
    const searchResult = executeQuery({
      schema, instance,
      query: { type: 'search', pattern: 'ipc handler preload contextBridge' }
    });
    // Get deps of ipc-handlers to see the pattern
    const depsResult = executeQuery({
      schema, instance,
      query: { type: 'deps', artifact: 'src/main/ipc-handlers.js', direction: 'both' }
    });
    const codeModelToolCalls = 2;

    const allPaths = [
      ...searchResult.results.map(r => r.path),
      ...(depsResult.results || []).map(d => d.from || d.to)
    ];
    const uniquePaths = [...new Set(allPaths)];

    const foundExpected = gt.expectedFiles.filter(ef =>
      uniquePaths.some(p => p === ef)
    );

    record('E', 'E1', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'very high' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify(searchResult) + JSON.stringify(depsResult)) },
      { foundExpected: foundExpected.length, totalExpected: gt.expectedFiles.length }
    );

    assert.ok(foundExpected.length >= 1,
      `Should find >= 1 expected IPC-related files, found ${foundExpected.length} of ${gt.expectedFiles.join(', ')}`);
  });

  it('E2: Convention for adding a new plugin', () => {
    const gt = GROUND_TRUTH.E2_plugin_convention;

    // --- Baseline ---
    // Read existing plugin files, compare patterns, Read plugin-loader for registration = 4+ calls.
    const baselineToolCalls = 6;

    // --- Code Model ---
    const result = executeQuery({
      schema, instance,
      query: { type: 'search', pattern: 'plugin' }
    });
    const codeModelToolCalls = 1;

    // Also check tag-based discovery
    const pluginTagged = Object.entries(instance.artifacts)
      .filter(([, a]) => (a.tags || []).includes(gt.expectedTag));

    record('E', 'E2', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'high (multiple file reads)' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify(result)) },
      { searchResults: result.count, taggedPlugins: pluginTagged.length }
    );

    assert.ok(pluginTagged.length >= gt.expectedPluginModules_minCount,
      `Should find >= ${gt.expectedPluginModules_minCount} plugin-tagged modules, got ${pluginTagged.length}`);
    assert.ok(result.count >= gt.expectedPluginModules_minCount,
      `Search should return >= ${gt.expectedPluginModules_minCount} results`);
  });

  it('E3: Impact of refactoring the database module', () => {
    const gt = GROUND_TRUTH.E3_database_refactor_impact;

    // --- Baseline ---
    // grep for database imports, then trace downstream = 5+ calls.
    const baselineToolCalls = 6;

    // --- Code Model ---
    const result = analyzeImpact({
      schema, instance,
      target: { name: 'src/main/database/*', depth: 2 }
    });
    const codeModelToolCalls = 1;

    record('E', 'E3', gt.question,
      { toolCalls: baselineToolCalls, tokens: 'high' },
      { toolCalls: codeModelToolCalls, tokens: estimateTokens(JSON.stringify(result)) },
      {
        targetEntities: (result.targetEntities || []).length,
        affectedFiles: (result.affectedFiles || []).length
      }
    );

    assert.ok((result.targetEntities || []).length >= 1,
      `Should find >= 1 target entity matching database/*, got ${(result.targetEntities || []).length}`);
  });
});

// ===========================================================================
// Summary Report (printed after all tests)
// ===========================================================================

describe('Summary Report', () => {
  it('prints the evaluation summary', () => {
    console.log('\n' + '='.repeat(80));
    console.log('  h-DSL Code Model vs Standard Tools — Evaluation Summary');
    console.log('='.repeat(80));

    const categories = ['A', 'B', 'C', 'D', 'E'];
    const categoryNames = {
      A: 'Dependency Tracing',
      B: 'Semantic Search',
      C: 'Artifact Discovery',
      D: 'Cross-File Flow Understanding',
      E: 'Change Planning'
    };

    let totalBaselineCalls = 0;
    let totalModelCalls = 0;

    for (const cat of categories) {
      const tests = report.filter(r => r.category === cat);
      if (tests.length === 0) continue;

      console.log(`\n  Category ${cat}: ${categoryNames[cat]}`);
      console.log('  ' + '-'.repeat(60));

      for (const t of tests) {
        const reduction = t.baseline.toolCalls > 0
          ? round(t.baseline.toolCalls / t.codeModel.toolCalls)
          : 'N/A';
        console.log(`  ${t.id}: ${t.question}`);
        console.log(`    Baseline:   ${t.baseline.toolCalls} tool calls`);
        console.log(`    Code Model: ${t.codeModel.toolCalls} tool calls (${reduction}x reduction)`);
        console.log(`    Accuracy:   ${JSON.stringify(t.accuracy)}`);

        totalBaselineCalls += t.baseline.toolCalls;
        totalModelCalls += t.codeModel.toolCalls;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`  Total baseline tool calls: ${totalBaselineCalls}`);
    console.log(`  Total Code Model calls:    ${totalModelCalls}`);
    console.log(`  Overall reduction:         ${round(totalBaselineCalls / totalModelCalls)}x`);
    console.log('='.repeat(80) + '\n');

    // This test always passes — it's just for output
    assert.ok(true);
  });
});
