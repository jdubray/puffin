/**
 * @module tests/evaluation/eval-test-suite
 * Evaluation Test Suite: Code Model vs Standard Tools
 *
 * Demonstrates the benefits of the h-DSL Code Model over standard tools
 * (Grep, Glob, Read, Bash) by running equivalent queries both ways and
 * comparing accuracy, tool call count, and token consumption.
 *
 * Both sides are **real** executions:
 *   - baseline: actual file system grep/glob/read operations
 *   - code_model: actual h-DSL queries against the loaded Code Model
 * Results and timings are compared against manually verified ground truth.
 *
 * Run: node --test tests/evaluation/
 * Debug: HDSL_EVAL_DEBUG=1 node --test tests/evaluation/
 */

'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

const PUFFIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(PUFFIN_ROOT, '.puffin', 'cre');
const SRC_DIR = path.join(PUFFIN_ROOT, 'src');
const GROUND_TRUTH = require('./ground-truth.json');

const DEBUG = process.env.HDSL_EVAL_DEBUG === '1';

let schema, instance;
let executeQuery, loadModel;
let navigate, analyzeImpact, discoverPatterns, queryModel;

/** Metrics collector for the final report. */
const report = [];

// ---------------------------------------------------------------------------
// Baseline tool helpers — real file system operations
// ---------------------------------------------------------------------------

/**
 * Recursively collect all .js files under a directory.
 * Equivalent to: Glob('**\/*.js')
 * @param {string} dir
 * @returns {{ files: string[], ops: number, bytes: number }}
 */
function globJs(dir) {
  const results = [];
  let ops = 1; // the readdir itself
  let bytes = 0;

  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    ops++;
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        walk(full);
      } else if (e.name.endsWith('.js')) {
        results.push(full);
      }
    }
  }
  walk(dir);
  bytes = results.join('\n').length;
  return { files: results, ops, bytes };
}

/**
 * Grep a single file for a regex pattern. Returns matching lines.
 * Equivalent to: Grep(pattern, file)
 * @param {string} filePath
 * @param {RegExp} pattern
 * @returns {{ matches: string[], ops: number, bytes: number }}
 */
function grepFile(filePath, pattern) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { return { matches: [], ops: 1, bytes: 0 }; }
  const bytes = Buffer.byteLength(content);
  const matches = content.split('\n').filter(line => pattern.test(line));
  return { matches, ops: 1, bytes };
}

/**
 * Grep all .js files under a directory for a pattern.
 * Equivalent to: Grep(pattern, '**\/*.js') — a single grep tool call.
 * @param {string} dir
 * @param {RegExp} pattern
 * @returns {{ fileMatches: Array<{file: string, lines: string[]}>, ops: number, bytes: number }}
 */
function grepAll(dir, pattern) {
  const { files, ops: globOps, bytes: globBytes } = globJs(dir);
  let totalOps = globOps;
  let totalBytes = globBytes;
  const fileMatches = [];

  for (const f of files) {
    const { matches, ops, bytes } = grepFile(f, pattern);
    totalOps += ops;
    totalBytes += bytes;
    if (matches.length > 0) {
      const rel = path.relative(PUFFIN_ROOT, f).replace(/\\/g, '/');
      fileMatches.push({ file: rel, lines: matches });
    }
  }
  return { fileMatches, ops: totalOps, bytes: totalBytes };
}

/**
 * Read a file and return its content + byte count.
 * Equivalent to: Read(file)
 * @param {string} relPath - Path relative to PUFFIN_ROOT
 * @returns {{ content: string, ops: number, bytes: number }}
 */
function readFile(relPath) {
  const abs = path.join(PUFFIN_ROOT, relPath);
  try {
    const content = fs.readFileSync(abs, 'utf8');
    return { content, ops: 1, bytes: Buffer.byteLength(content) };
  } catch {
    return { content: '', ops: 1, bytes: 0 };
  }
}

/**
 * Extract require/import paths from file content.
 * @param {string} content
 * @returns {string[]} relative import paths
 */
function extractImports(content) {
  const results = [];
  // require('./foo') or require('../foo')
  const reqRe = /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = reqRe.exec(content)) !== null) results.push(m[1]);
  // import ... from './foo'
  const impRe = /from\s+['"](\.[^'"]+)['"]/g;
  while ((m = impRe.exec(content)) !== null) results.push(m[1]);
  return results;
}

/**
 * Time a function and return { result, durationMs }.
 */
function timed(fn) {
  const start = performance.now();
  const result = fn();
  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  return { result, durationMs };
}

// ---------------------------------------------------------------------------
// Debug helpers
// ---------------------------------------------------------------------------

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';

function dbg(label, text) {
  if (!DEBUG) return;
  console.log(`    ${CYAN}[${label}]${RESET} ${text}`);
}

function dbgBaseline(description, metrics) {
  if (!DEBUG) return;
  console.log(`    ${YELLOW}[Baseline]${RESET} ${description}`);
  console.log(`    ${YELLOW}[Baseline]${RESET} ops=${BOLD}${metrics.ops}${RESET}, bytes=${metrics.bytes}, time=${BOLD}${metrics.durationMs}ms${RESET}`);
}

function dbgBaselineResult(description) {
  if (!DEBUG) return;
  console.log(`    ${YELLOW}[Baseline Result]${RESET} ${description}`);
}

function dbgQuery(toolName, params) {
  if (!DEBUG) return;
  console.log(`    ${GREEN}[Code Model]${RESET} ${BOLD}${toolName}${RESET}(${JSON.stringify(params)})`);
}

function dbgResult(description) {
  if (!DEBUG) return;
  console.log(`    ${GREEN}[Result]${RESET} ${description}`);
}

function dbgGroundTruth(label, expected, actual) {
  if (!DEBUG) return;
  console.log(`    ${MAGENTA}[Ground Truth]${RESET} ${label}`);
  if (Array.isArray(expected)) {
    console.log(`      Expected: [${expected.join(', ')}]`);
    console.log(`      Got:      [${(Array.isArray(actual) ? actual : [actual]).join(', ')}]`);
  } else {
    console.log(`      Expected: ${JSON.stringify(expected)}`);
    console.log(`      Got:      ${JSON.stringify(actual)}`);
  }
}

function dbgVerdict(id, metrics) {
  if (!DEBUG) return;
  const metricsStr = Object.entries(metrics)
    .map(([k, v]) => `${k}=${typeof v === 'number' ? round(v) : JSON.stringify(v)}`)
    .join(', ');
  console.log(`    ${BOLD}[Verdict]${RESET} ${id}: ${metricsStr}`);
  console.log('');
}

function dbgTestHeader(id, question) {
  if (!DEBUG) return;
  console.log('');
  console.log(`  ${'─'.repeat(70)}`);
  console.log(`  ${BOLD}${id}${RESET}: ${question}`);
  console.log(`  ${'─'.repeat(70)}`);
}

function dbgTiming(baselineMs, modelMs) {
  if (!DEBUG) return;
  const speedup = baselineMs > 0 ? round(baselineMs / modelMs) : '∞';
  const faster = modelMs < baselineMs;
  const color = faster ? GREEN : RED;
  console.log(`    ${color}[Timing]${RESET} Baseline: ${baselineMs}ms, Code Model: ${modelMs}ms (${speedup}x ${faster ? 'faster' : 'slower'})`);
}

/**
 * Record a test result for the summary report.
 */
function record(category, id, question, baseline, codeModel, accuracy) {
  report.push({ category, id, question, baseline, codeModel, accuracy });
}

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

function estimateTokens(str) {
  return Math.ceil((typeof str === 'string' ? str : JSON.stringify(str)).length / 4);
}

// ---------------------------------------------------------------------------
// Load model before all tests
// ---------------------------------------------------------------------------

before(async () => {
  const instancePath = path.join(DATA_DIR, 'instance.json');
  const schemaPath = path.join(DATA_DIR, 'schema.json');

  if (!fs.existsSync(instancePath) || !fs.existsSync(schemaPath)) {
    throw new Error(
      `Code Model not found at ${DATA_DIR}. Run the bootstrap first:\n` +
      `  node hdsl-bootstrap.js --project ${PUFFIN_ROOT}`
    );
  }

  ({ loadModel, executeQuery } = require('../../lib/explorer'));
  ({ navigate } = require('../../lib/graph-navigator'));
  ({ analyzeImpact } = require('../../lib/impact-analyzer'));
  ({ discoverPatterns } = require('../../lib/pattern-discovery'));
  ({ queryModel } = require('../../lib/query-interface'));

  const model = await loadModel(DATA_DIR);
  schema = model.schema;
  instance = model.instance;

  if (DEBUG) {
    const artCount = Object.keys(instance.artifacts).length;
    const depCount = instance.dependencies.length;
    const flowCount = Object.keys(instance.flows || {}).length;
    console.log('');
    console.log(`  ${BOLD}h-DSL Evaluation Test Suite — DEBUG MODE${RESET}`);
    console.log(`  ${'═'.repeat(50)}`);
    console.log(`  Code Model loaded: ${artCount} artifacts, ${depCount} dependencies, ${flowCount} flows`);
    console.log(`  Data dir: ${DATA_DIR}`);
    console.log(`  ${DIM}Each test: real baseline (fs ops) vs Code Model query, timed${RESET}`);
    console.log(`  ${'═'.repeat(50)}`);
  }
});

// ===========================================================================
// Category A: Dependency Tracing
// ===========================================================================

describe('Category A: Dependency Tracing', () => {

  it('A1: What files directly import plugin-loader.js?', () => {
    const gt = GROUND_TRUTH.A1_direct_importers_of_plugin_loader;
    dbgTestHeader('A1', gt.question);

    // --- Real baseline: grep for require/import of plugin-loader ---
    const baselineRun = timed(() => {
      const pattern = /require\s*\(\s*['"][^'"]*plugin-loader[^'"]*['"]\s*\)|from\s+['"][^'"]*plugin-loader[^'"]*['"]/;
      const { fileMatches, ops, bytes } = grepAll(SRC_DIR, pattern);
      // Exclude the file itself
      const importers = fileMatches
        .map(m => m.file)
        .filter(f => !f.endsWith('plugin-loader.js'));
      return { importers, ops, bytes };
    });

    const baselineResult = baselineRun.result;
    dbgBaseline('Grep for require/import plugin-loader across all .js files', {
      ops: baselineResult.ops, bytes: baselineResult.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`Found ${baselineResult.importers.length} importers: [${baselineResult.importers.join(', ')}]`);

    // --- Code Model ---
    const modelRun = timed(() => {
      const queryParams = { type: 'deps', artifact: 'src/main/plugins/plugin-loader.js', direction: 'inbound' };
      dbgQuery('executeQuery', queryParams);
      return executeQuery({ schema, instance, query: queryParams });
    });

    const predicted = modelRun.result.results.map(d => d.from);
    dbgResult(`Found ${predicted.length} importers: [${predicted.join(', ')}]`);
    dbgGroundTruth('Direct importers', gt.answer, predicted);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    const scores = f1Score(predicted, gt.answer);
    const baselineScores = f1Score(baselineResult.importers, gt.answer);

    dbgVerdict('A1', {
      'baseline.f1': baselineScores.f1, 'model.f1': scores.f1,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs,
      baselineOps: baselineResult.ops, modelOps: 1
    });

    record('A', 'A1', gt.question,
      { toolCalls: baselineResult.ops, tokens: estimateTokens(baselineResult.bytes + ''), durationMs: baselineRun.durationMs, f1: baselineScores.f1 },
      { toolCalls: 1, tokens: estimateTokens(JSON.stringify(modelRun.result)), durationMs: modelRun.durationMs, f1: scores.f1 },
      { baseline: baselineScores, model: scores }
    );

    assert.ok(scores.f1 >= 0.8, `Model F1 score ${scores.f1} should be >= 0.8`);
    assert.equal(modelRun.result.results.length, gt.answer.length);
  });

  it('A2: Transitive dependency tree of main.js (depth 2)', () => {
    const gt = GROUND_TRUTH.A2_transitive_deps_main_js;
    dbgTestHeader('A2', gt.question);

    // --- Real baseline: read main.js, extract imports, read each, extract their imports ---
    const baselineRun = timed(() => {
      let totalOps = 0;
      let totalBytes = 0;

      // Depth 0: read main.js
      const main = readFile('src/main/main.js');
      totalOps += main.ops; totalBytes += main.bytes;
      const mainImports = extractImports(main.content);

      // Resolve depth-1 paths relative to main.js dir
      const mainDir = 'src/main';
      const depth1 = mainImports.map(imp => {
        let resolved = path.posix.normalize(mainDir + '/' + imp);
        if (!resolved.endsWith('.js')) resolved += '.js';
        // Also check for index.js in directory
        const absCheck = path.join(PUFFIN_ROOT, resolved);
        if (!fs.existsSync(absCheck)) {
          const indexCheck = path.join(PUFFIN_ROOT, resolved.replace('.js', ''), 'index.js');
          if (fs.existsSync(indexCheck)) {
            resolved = resolved.replace('.js', '/index.js');
          }
        }
        return resolved;
      }).filter(p => {
        try { fs.accessSync(path.join(PUFFIN_ROOT, p)); return true; } catch { return false; }
      });

      // Depth 1: read each and extract their imports
      const depth2 = [];
      for (const dep of depth1) {
        const f = readFile(dep);
        totalOps += f.ops; totalBytes += f.bytes;
        const imports = extractImports(f.content);
        const depDir = path.posix.dirname(dep);
        for (const imp of imports) {
          let resolved = path.posix.normalize(depDir + '/' + imp);
          if (!resolved.endsWith('.js')) resolved += '.js';
          const absCheck = path.join(PUFFIN_ROOT, resolved);
          if (!fs.existsSync(absCheck)) {
            const indexCheck = path.join(PUFFIN_ROOT, resolved.replace('.js', ''), 'index.js');
            if (fs.existsSync(indexCheck)) {
              resolved = resolved.replace('.js', '/index.js');
            }
          }
          try { fs.accessSync(path.join(PUFFIN_ROOT, resolved)); depth2.push(resolved); } catch { /* skip */ }
        }
      }

      return {
        depth1: [...new Set(depth1)],
        depth2: [...new Set(depth2)],
        ops: totalOps,
        bytes: totalBytes
      };
    });

    dbgBaseline('Read main.js → extract imports → read each → extract their imports', {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`Depth-1: [${baselineRun.result.depth1.join(', ')}]`);
    dbgBaselineResult(`Depth-2: ${baselineRun.result.depth2.length} modules`);

    // --- Code Model ---
    const modelRun = timed(() => {
      const navParams = { operation: 'walk', start: 'src/main/main.js', direction: 'outgoing', maxDepth: 2, limit: 100 };
      dbgQuery('navigate', navParams);
      return navigate({ instance, options: navParams });
    });

    const layer1 = (modelRun.result.layers || []).find(l => l.depth === 1);
    const layer2 = (modelRun.result.layers || []).find(l => l.depth === 2);
    const predictedDepth1 = (layer1 && layer1.artifacts) || [];
    const predictedDepth2 = (layer2 && layer2.artifacts) || [];

    dbgResult(`Depth 1: [${predictedDepth1.join(', ')}]`);
    dbgResult(`Depth 2: ${predictedDepth2.length} modules`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    const d1Scores = f1Score(predictedDepth1, gt.depth1);
    const d1BaselineScores = f1Score(baselineRun.result.depth1, gt.depth1);
    const d2Scores = f1Score(predictedDepth2, gt.depth2);

    dbgVerdict('A2', {
      'baseline.d1.f1': d1BaselineScores.f1, 'model.d1.f1': d1Scores.f1,
      'model.d2.f1': d2Scores.f1,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('A', 'A2', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs, f1: d1BaselineScores.f1 },
      { toolCalls: 1, tokens: estimateTokens(JSON.stringify(modelRun.result)), durationMs: modelRun.durationMs, f1: d1Scores.f1 },
      { baseline: { depth1: d1BaselineScores }, model: { depth1: d1Scores, depth2: d2Scores } }
    );

    assert.ok(d1Scores.f1 >= 0.8, `Depth-1 F1 ${d1Scores.f1} should be >= 0.8`);
    assert.ok(d2Scores.recall >= 0.5, `Depth-2 recall ${d2Scores.recall} should be >= 0.5`);
  });

  it('A3: Which modules are orphans (nothing imports them)?', () => {
    const gt = GROUND_TRUTH.A3_orphan_modules;
    dbgTestHeader('A3', gt.question);

    // --- Real baseline: glob all .js, then for each file check if any other file imports it ---
    const baselineRun = timed(() => {
      const { files, ops: globOps, bytes: globBytes } = globJs(SRC_DIR);
      let totalOps = globOps;
      let totalBytes = globBytes;

      // Read all files into memory (simulates N read calls)
      const fileContents = {};
      for (const f of files) {
        try {
          const content = fs.readFileSync(f, 'utf8');
          totalOps++;
          totalBytes += Buffer.byteLength(content);
          fileContents[path.relative(PUFFIN_ROOT, f).replace(/\\/g, '/')] = content;
        } catch { totalOps++; }
      }

      // For each file, check if its basename appears in any other file's import
      const allPaths = Object.keys(fileContents);
      const orphans = [];
      for (const filePath of allPaths) {
        const basename = path.basename(filePath, '.js');
        let imported = false;
        for (const [otherPath, content] of Object.entries(fileContents)) {
          if (otherPath === filePath) continue;
          if (content.includes(basename)) {
            imported = true;
            break;
          }
        }
        if (!imported) orphans.push(filePath);
      }

      return { orphans, ops: totalOps, bytes: totalBytes };
    });

    dbgBaseline('Glob all .js → read all → check if each filename is imported anywhere', {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`Found ${baselineRun.result.orphans.length} potential orphans (name-based heuristic)`);

    // --- Code Model ---
    const modelRun = timed(() => {
      dbgQuery('executeQuery', { type: 'stats' });
      executeQuery({ schema, instance, query: { type: 'stats' } });

      const fromSet = new Set(instance.dependencies.map(d => d.from));
      const toSet = new Set(instance.dependencies.map(d => d.to));
      const orphans = Object.keys(instance.artifacts).filter(a =>
        !fromSet.has(a) && !toSet.has(a)
      );
      return { orphans };
    });

    dbgResult(`Code Model found ${modelRun.result.orphans.length} orphans (graph-based, exact)`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);
    dbgGroundTruth('Minimum orphan count', gt.minCount, modelRun.result.orphans.length);

    dbgVerdict('A3', {
      baselineOrphans: baselineRun.result.orphans.length,
      modelOrphans: modelRun.result.orphans.length,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs,
      baselineOps: baselineRun.result.ops, modelOps: 1
    });

    record('A', 'A3', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs },
      { toolCalls: 1, tokens: estimateTokens(JSON.stringify({ orphanCount: modelRun.result.orphans.length })), durationMs: modelRun.durationMs },
      { baselineOrphans: baselineRun.result.orphans.length, modelOrphans: modelRun.result.orphans.length }
    );

    assert.ok(modelRun.result.orphans.length >= gt.minCount,
      `Expected >= ${gt.minCount} orphans, got ${modelRun.result.orphans.length}`);
    for (const sample of gt.sampleOrphans) {
      assert.ok(modelRun.result.orphans.includes(sample), `Expected ${sample} to be an orphan`);
    }
  });

  it('A4: Impact of changing ipc-handlers.js', () => {
    const gt = GROUND_TRUTH.A4_impact_of_ipc_handlers;
    dbgTestHeader('A4', gt.question);

    // --- Real baseline: grep for files that import ipc-handlers ---
    const baselineRun = timed(() => {
      const pattern = /require\s*\(\s*['"][^'"]*ipc-handlers[^'"]*['"]\s*\)|from\s+['"][^'"]*ipc-handlers[^'"]*['"]/;
      const { fileMatches, ops, bytes } = grepAll(SRC_DIR, pattern);
      const dependents = fileMatches.map(m => m.file).filter(f => !f.endsWith('ipc-handlers.js'));

      // Also read ipc-handlers to find what it imports
      const ipcFile = readFile('src/main/ipc-handlers.js');
      const imports = extractImports(ipcFile.content).map(imp => {
        let resolved = path.posix.normalize('src/main/' + imp);
        if (!resolved.endsWith('.js')) resolved += '.js';
        return resolved;
      });

      return { dependents, imports, ops: ops + ipcFile.ops, bytes: bytes + ipcFile.bytes };
    });

    dbgBaseline('Grep for ipc-handlers imports + read file to find its deps', {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`Dependents: [${baselineRun.result.dependents.join(', ')}]`);
    dbgBaselineResult(`Imports: [${baselineRun.result.imports.slice(0, 5).join(', ')}...]`);

    // --- Code Model ---
    const modelRun = timed(() => {
      const result = analyzeImpact({ schema, instance, target: { name: 'src/main/ipc-handlers.js', depth: 2 } });
      const directDeps = executeQuery({
        schema, instance,
        query: { type: 'deps', artifact: 'src/main/ipc-handlers.js', direction: 'inbound' }
      });
      const outgoing = executeQuery({
        schema, instance,
        query: { type: 'deps', artifact: 'src/main/ipc-handlers.js', direction: 'outbound' }
      });
      return { impact: result, incomingFrom: directDeps.results.map(d => d.from), outgoingTo: outgoing.results.map(d => d.to) };
    });

    dbgResult(`Impact: ${(modelRun.result.impact.affectedFiles || []).length} affected files`);
    dbgResult(`Incoming: [${modelRun.result.incomingFrom.join(', ')}]`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    const scores = f1Score(modelRun.result.incomingFrom, gt.directDependents);
    const baselineScores = f1Score(baselineRun.result.dependents, gt.directDependents);
    const outScores = f1Score(modelRun.result.outgoingTo, gt.importedBy_ipc_handlers);

    dbgVerdict('A4', {
      'baseline.dependents.f1': baselineScores.f1, 'model.dependents.f1': scores.f1,
      'model.imports.f1': outScores.f1,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('A', 'A4', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs, f1: baselineScores.f1 },
      { toolCalls: 1, tokens: estimateTokens(JSON.stringify(modelRun.result.impact)), durationMs: modelRun.durationMs, f1: scores.f1 },
      { baseline: baselineScores, model: { dependents: scores, imports: outScores } }
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
    dbgTestHeader('B1', gt.question);

    // --- Real baseline: grep for persistence-related keywords ---
    const baselineRun = timed(() => {
      let totalOps = 0, totalBytes = 0;
      const allMatches = new Set();

      for (const keyword of gt.keywords) {
        const { fileMatches, ops, bytes } = grepAll(SRC_DIR, new RegExp(keyword, 'i'));
        totalOps += ops; totalBytes += bytes;
        for (const m of fileMatches) allMatches.add(m.file);
      }

      return { files: [...allMatches], ops: totalOps, bytes: totalBytes };
    });

    const baselineFound = gt.expectedPaths.filter(ep => baselineRun.result.files.some(f => f === ep));

    dbgBaseline(`Grep for [${gt.keywords.join(', ')}] across all .js files`, {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`${baselineRun.result.files.length} total matches, ${baselineFound.length}/${gt.expectedPaths.length} expected found`);

    // --- Code Model ---
    const modelRun = timed(() => {
      const queryParams = { type: 'search', pattern: 'database persistence save store connection' };
      dbgQuery('executeQuery', queryParams);
      return executeQuery({ schema, instance, query: queryParams });
    });

    const predicted = modelRun.result.results.map(r => r.path);
    const modelFound = gt.expectedPaths.filter(ep => predicted.includes(ep));
    dbgResult(`Found ${modelRun.result.count} results, ${modelFound.length}/${gt.expectedPaths.length} expected`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    dbgVerdict('B1', {
      baselineMatches: baselineRun.result.files.length, baselineFound: baselineFound.length,
      modelMatches: modelRun.result.count, modelFound: modelFound.length,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('B', 'B1', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs, found: baselineFound.length },
      { toolCalls: 1, tokens: estimateTokens(JSON.stringify(modelRun.result)), durationMs: modelRun.durationMs, found: modelFound.length },
      { baselineFound: baselineFound.length, modelFound: modelFound.length, expected: gt.expectedPaths.length }
    );

    assert.ok(modelFound.length >= 1, `Should find >= 1 expected persistence module`);
  });

  it('B2: What is responsible for the plugin lifecycle?', () => {
    const gt = GROUND_TRUTH.B2_plugin_lifecycle;
    dbgTestHeader('B2', gt.question);

    // --- Real baseline ---
    const baselineRun = timed(() => {
      let totalOps = 0, totalBytes = 0;
      const allMatches = new Set();
      for (const keyword of gt.keywords) {
        const { fileMatches, ops, bytes } = grepAll(SRC_DIR, new RegExp(keyword, 'i'));
        totalOps += ops; totalBytes += bytes;
        for (const m of fileMatches) allMatches.add(m.file);
      }
      return { files: [...allMatches], ops: totalOps, bytes: totalBytes };
    });

    const baselineFound = gt.expectedPaths.filter(ep => baselineRun.result.files.includes(ep));

    dbgBaseline(`Grep for [${gt.keywords.join(', ')}]`, {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`${baselineRun.result.files.length} total matches, ${baselineFound.length}/${gt.expectedPaths.length} expected`);

    // --- Code Model ---
    const modelRun = timed(() => {
      dbgQuery('executeQuery', { type: 'search', pattern: 'plugin lifecycle activate load' });
      return executeQuery({ schema, instance, query: { type: 'search', pattern: 'plugin lifecycle activate load' } });
    });

    const predicted = modelRun.result.results.map(r => r.path);
    const modelFound = gt.expectedPaths.filter(ep => predicted.includes(ep));
    dbgResult(`${modelRun.result.count} results, ${modelFound.length}/${gt.expectedPaths.length} expected`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    dbgVerdict('B2', {
      baselineFound: baselineFound.length, modelFound: modelFound.length,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('B', 'B2', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs, found: baselineFound.length },
      { toolCalls: 1, tokens: estimateTokens(JSON.stringify(modelRun.result)), durationMs: modelRun.durationMs, found: modelFound.length },
      { baselineFound: baselineFound.length, modelFound: modelFound.length, expected: gt.expectedPaths.length }
    );

    assert.ok(modelFound.length >= 2, `Should find >= 2 lifecycle modules`);
  });

  it('B3: Find the module that manages application state', () => {
    const gt = GROUND_TRUTH.B3_application_state;
    dbgTestHeader('B3', gt.question);

    // --- Real baseline ---
    const baselineRun = timed(() => {
      let totalOps = 0, totalBytes = 0;
      const allMatches = new Set();
      for (const keyword of gt.keywords) {
        const { fileMatches, ops, bytes } = grepAll(SRC_DIR, new RegExp(keyword, 'i'));
        totalOps += ops; totalBytes += bytes;
        for (const m of fileMatches) allMatches.add(m.file);
      }
      return { files: [...allMatches], ops: totalOps, bytes: totalBytes };
    });

    const baselineFound = gt.expectedPaths.filter(ep => baselineRun.result.files.includes(ep));

    dbgBaseline(`Grep for [${gt.keywords.join(', ')}]`, {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`${baselineRun.result.files.length} total matches, ${baselineFound.length}/${gt.expectedPaths.length} expected (very noisy)`);

    // --- Code Model ---
    const modelRun = timed(() => {
      dbgQuery('executeQuery', { type: 'search', pattern: 'application state management puffin' });
      return executeQuery({ schema, instance, query: { type: 'search', pattern: 'application state management puffin' } });
    });

    const predicted = modelRun.result.results.map(r => r.path);
    const modelFound = gt.expectedPaths.filter(ep => predicted.includes(ep));
    dbgResult(`${modelRun.result.count} results, ${modelFound.length}/${gt.expectedPaths.length} expected`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    dbgVerdict('B3', {
      baselineMatches: baselineRun.result.files.length, baselineFound: baselineFound.length,
      modelMatches: modelRun.result.count, modelFound: modelFound.length,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('B', 'B3', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs, found: baselineFound.length },
      { toolCalls: 1, tokens: estimateTokens(JSON.stringify(modelRun.result)), durationMs: modelRun.durationMs, found: modelFound.length },
      { baselineMatches: baselineRun.result.files.length, baselineFound: baselineFound.length, modelFound: modelFound.length }
    );

    assert.ok(modelFound.length >= 1, `Should find >= 1 state management module`);
  });

  it('B4: Which functions handle error recovery?', () => {
    const gt = GROUND_TRUTH.B4_error_recovery;
    dbgTestHeader('B4', gt.question);

    // --- Real baseline ---
    const baselineRun = timed(() => {
      let totalOps = 0, totalBytes = 0;
      const allMatches = new Set();
      for (const keyword of gt.searchTerms) {
        const { fileMatches, ops, bytes } = grepAll(SRC_DIR, new RegExp(keyword, 'i'));
        totalOps += ops; totalBytes += bytes;
        for (const m of fileMatches) allMatches.add(m.file);
      }
      return { files: [...allMatches], ops: totalOps, bytes: totalBytes };
    });

    dbgBaseline(`Grep for [${gt.searchTerms.join(', ')}]`, {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`${baselineRun.result.files.length} total files matched (very noisy — 'catch' matches almost everything)`);

    // --- Code Model ---
    const modelRun = timed(() => {
      dbgQuery('executeQuery', { type: 'search', pattern: 'error recovery retry' });
      return executeQuery({ schema, instance, query: { type: 'search', pattern: 'error recovery retry' } });
    });

    dbgResult(`${modelRun.result.count} results (prose-matched, lower noise)`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    dbgVerdict('B4', {
      baselineMatches: baselineRun.result.files.length, modelMatches: modelRun.result.count,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs,
      'noise_reduction': baselineRun.result.files.length > 0 ? round(baselineRun.result.files.length / modelRun.result.count) : 'N/A'
    });

    record('B', 'B4', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs, matches: baselineRun.result.files.length },
      { toolCalls: 1, tokens: estimateTokens(JSON.stringify(modelRun.result)), durationMs: modelRun.durationMs, matches: modelRun.result.count },
      { baselineNoise: baselineRun.result.files.length, modelResults: modelRun.result.count }
    );

    assert.ok(modelRun.result.count >= gt.expectedMinResults, `Should find >= ${gt.expectedMinResults} results`);
  });
});

// ===========================================================================
// Category C: Artifact Discovery
// ===========================================================================

describe('Category C: Artifact Discovery', () => {

  it('C1: Summary of plugin-loader.js without reading the file', () => {
    const gt = GROUND_TRUTH.C1_plugin_loader_summary;
    dbgTestHeader('C1', gt.question);

    // --- Real baseline: read the entire file ---
    const baselineRun = timed(() => {
      const file = readFile(gt.path);
      return { content: file.content, ops: file.ops, bytes: file.bytes };
    });

    dbgBaseline(`Read entire file (${baselineRun.result.bytes} bytes)`, {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });

    // --- Code Model: peek ---
    const modelRun = timed(() => {
      dbgQuery('hdsl_peek', { path: gt.path });
      const artifact = instance.artifacts[gt.path];
      return {
        path: gt.path, kind: artifact.kind, summary: artifact.summary,
        exports: artifact.exports, tags: artifact.tags,
        size: artifact.size, childCount: (artifact.children || []).length
      };
    });

    const modelTokens = estimateTokens(JSON.stringify(modelRun.result));
    const baselineTokens = estimateTokens(baselineRun.result.content);
    dbgResult(`Summary: "${(modelRun.result.summary || '').slice(0, 80)}..."`);
    dbgResult(`Exports: [${(modelRun.result.exports || []).join(', ')}]`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);
    dbg('Token savings', `Baseline: ~${baselineTokens} tokens vs Code Model: ~${modelTokens} tokens (${round(baselineTokens / modelTokens)}x reduction)`);

    dbgVerdict('C1', {
      baselineTokens, modelTokens, tokenReduction: round(baselineTokens / modelTokens),
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('C', 'C1', gt.question,
      { toolCalls: 1, tokens: baselineTokens, durationMs: baselineRun.durationMs },
      { toolCalls: 1, tokens: modelTokens, durationMs: modelRun.durationMs },
      { tokenReduction: round(baselineTokens / modelTokens) }
    );

    assert.ok(modelRun.result.summary && modelRun.result.summary.length > 10, 'Should have a meaningful summary');
    assert.ok((modelRun.result.exports || []).length > 0, 'Should have exports');
    assert.ok(modelTokens < baselineTokens, `Model tokens (${modelTokens}) < baseline (${baselineTokens})`);
  });

  it('C2: Codebase overview — how many modules, tests, configs?', () => {
    const gt = GROUND_TRUTH.C2_codebase_overview;
    dbgTestHeader('C2', gt.question);

    // --- Real baseline: glob and count ---
    const baselineRun = timed(() => {
      const allJs = globJs(path.join(PUFFIN_ROOT, 'src'));
      const testJs = globJs(path.join(PUFFIN_ROOT, 'tests'));
      return {
        srcFiles: allJs.files.length,
        testFiles: testJs.files.length,
        ops: allJs.ops + testJs.ops,
        bytes: allJs.bytes + testJs.bytes
      };
    });

    dbgBaseline('Glob src/**/*.js + tests/**/*.js and count', {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`${baselineRun.result.srcFiles} src files, ${baselineRun.result.testFiles} test files (no dependency or flow info)`);

    // --- Code Model ---
    const modelRun = timed(() => {
      dbgQuery('executeQuery', { type: 'stats' });
      return executeQuery({ schema, instance, query: { type: 'stats' } });
    });

    const stats = modelRun.result.results;
    dbgResult(`Artifacts: ${stats.artifactCount}, Dependencies: ${stats.dependencyCount}, Flows: ${stats.flowCount}`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    dbgVerdict('C2', {
      artifacts: stats.artifactCount, deps: stats.dependencyCount, flows: stats.flowCount,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('C', 'C2', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs },
      { toolCalls: 1, tokens: estimateTokens(JSON.stringify(modelRun.result)), durationMs: modelRun.durationMs },
      { artifacts: stats.artifactCount, deps: stats.dependencyCount, flows: stats.flowCount }
    );

    const tolerance = gt.tolerance;
    assert.ok(
      Math.abs(stats.artifactCount - gt.expectedArtifactCount) <= gt.expectedArtifactCount * tolerance,
      `Artifact count ${stats.artifactCount} within ${tolerance * 100}% of ${gt.expectedArtifactCount}`
    );
    assert.equal(stats.flowCount, gt.expectedFlowCount, 'Flow count should match');
  });

  it('C3: What symbols does claude-service.js export?', () => {
    const gt = GROUND_TRUTH.C3_claude_service_exports;
    dbgTestHeader('C3', gt.question);

    // --- Real baseline: read the file, grep for exports ---
    const baselineRun = timed(() => {
      const file = readFile(gt.path);
      const exportLines = file.content.split('\n').filter(l =>
        /module\.exports|exports\.|export\s+(default|class|function|const|let|var)/.test(l)
      );
      return { exportLines, ops: file.ops, bytes: file.bytes };
    });

    dbgBaseline(`Read ${gt.path} and scan for export statements`, {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`Found ${baselineRun.result.exportLines.length} export lines`);

    // --- Code Model ---
    const modelRun = timed(() => {
      dbgQuery('hdsl_peek', { path: gt.path });
      const artifact = instance.artifacts[gt.path];
      return { exports: artifact.exports, children: (artifact.children || []).map(c => c.name) };
    });

    dbgResult(`Exports: [${(modelRun.result.exports || []).join(', ')}], Children: [${modelRun.result.children.join(', ')}]`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    const baselineTokens = estimateTokens(baselineRun.result.bytes + '');
    const modelTokens = estimateTokens(JSON.stringify(modelRun.result));

    dbgVerdict('C3', {
      exports: (modelRun.result.exports || []).length, children: modelRun.result.children.length,
      baselineTokens, modelTokens, baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('C', 'C3', gt.question,
      { toolCalls: 1, tokens: baselineTokens, durationMs: baselineRun.durationMs },
      { toolCalls: 1, tokens: modelTokens, durationMs: modelRun.durationMs },
      { exports: (modelRun.result.exports || []).length }
    );

    assert.ok((modelRun.result.exports || []).length > 0 || modelRun.result.children.length > 0, 'Should have exports or children');
  });

  it('C4: List all modules tagged as "test"', () => {
    const gt = GROUND_TRUTH.C4_core_tagged_modules;
    dbgTestHeader('C4', gt.question);

    // --- Real baseline: glob for *.test.js ---
    const baselineRun = timed(() => {
      const { files, ops, bytes } = globJs(PUFFIN_ROOT);
      const testFiles = files.filter(f => f.endsWith('.test.js')).map(f =>
        path.relative(PUFFIN_ROOT, f).replace(/\\/g, '/')
      );
      return { testFiles, ops, bytes };
    });

    dbgBaseline('Glob for *.test.js files', {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`Found ${baselineRun.result.testFiles.length} .test.js files (no tag concept in baseline)`);

    // --- Code Model ---
    const modelRun = timed(() => {
      dbgQuery('tag filter', { tag: gt.tag });
      const tagged = Object.entries(instance.artifacts)
        .filter(([, a]) => (a.tags || []).includes(gt.tag));
      return { count: tagged.length };
    });

    dbgResult(`${modelRun.result.count} artifacts tagged "${gt.tag}"`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    dbgVerdict('C4', {
      baselineTestFiles: baselineRun.result.testFiles.length, modelTagged: modelRun.result.count,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('C', 'C4', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs },
      { toolCalls: 1, tokens: estimateTokens(JSON.stringify({ count: modelRun.result.count })), durationMs: modelRun.durationMs },
      { baselineTestFiles: baselineRun.result.testFiles.length, modelTagged: modelRun.result.count }
    );

    assert.ok(modelRun.result.count >= gt.expectedMinCount,
      `Expected >= ${gt.expectedMinCount} test-tagged artifacts, got ${modelRun.result.count}`);
  });
});

// ===========================================================================
// Category D: Cross-File Flow Understanding
// ===========================================================================

describe('Category D: Cross-File Flow Understanding', () => {

  it('D1: App startup sequence', () => {
    const gt = GROUND_TRUTH.D1_app_startup_flow;
    dbgTestHeader('D1', gt.question);

    // --- Real baseline: read main.js, follow imports ---
    const baselineRun = timed(() => {
      let totalOps = 0, totalBytes = 0;
      const main = readFile(gt.entryPoint);
      totalOps += main.ops; totalBytes += main.bytes;
      const imports = extractImports(main.content);
      const mainDir = path.posix.dirname(gt.entryPoint);
      const depth1 = imports.map(imp => {
        let resolved = path.posix.normalize(mainDir + '/' + imp);
        if (!resolved.endsWith('.js')) resolved += '.js';
        const absCheck = path.join(PUFFIN_ROOT, resolved);
        if (!fs.existsSync(absCheck)) {
          const indexCheck = path.join(PUFFIN_ROOT, resolved.replace('.js', ''), 'index.js');
          if (fs.existsSync(indexCheck)) resolved = resolved.replace('.js', '/index.js');
        }
        return resolved;
      }).filter(p => { try { fs.accessSync(path.join(PUFFIN_ROOT, p)); return true; } catch { return false; } });

      // Read each depth-1 file
      for (const dep of depth1) {
        const f = readFile(dep);
        totalOps += f.ops; totalBytes += f.bytes;
      }

      return { depth1, ops: totalOps, bytes: totalBytes };
    });

    dbgBaseline('Read main.js → extract imports → read each depth-1 file', {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`Depth-1: [${baselineRun.result.depth1.join(', ')}]`);

    // --- Code Model ---
    const modelRun = timed(() => {
      const navParams = { operation: 'walk', start: gt.entryPoint, direction: 'outgoing', maxDepth: 2, limit: 50 };
      dbgQuery('navigate', navParams);
      return navigate({ instance, options: navParams });
    });

    const walkLayer1 = (modelRun.result.layers || []).find(l => l.depth === 1);
    const depth1Nodes = (walkLayer1 && walkLayer1.artifacts) || [];
    dbgResult(`Walk: ${modelRun.result.nodes.length} total nodes, depth-1: [${depth1Nodes.join(', ')}]`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    const scores = f1Score(depth1Nodes, gt.expectedConnectedModules);
    const baselineScores = f1Score(baselineRun.result.depth1, gt.expectedConnectedModules);

    dbgVerdict('D1', {
      'baseline.f1': baselineScores.f1, 'model.f1': scores.f1,
      totalNodes: modelRun.result.nodes.length,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('D', 'D1', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs, f1: baselineScores.f1 },
      { toolCalls: 1, tokens: estimateTokens(JSON.stringify(modelRun.result)), durationMs: modelRun.durationMs, f1: scores.f1 },
      { baseline: baselineScores, model: scores }
    );

    assert.ok(scores.recall >= 0.8, `Startup sequence recall ${scores.recall} should be >= 0.8`);
  });

  it('D2: Plugin discovery to activation flow', () => {
    const gt = GROUND_TRUTH.D2_plugin_discovery_to_activation;
    dbgTestHeader('D2', gt.question);

    // --- Real baseline: read plugin files manually ---
    const baselineRun = timed(() => {
      let totalOps = 0, totalBytes = 0;
      const found = [];
      for (const mod of gt.relevantModules) {
        const f = readFile(mod);
        totalOps += f.ops; totalBytes += f.bytes;
        if (f.content.length > 0) found.push(mod);
      }
      // Also grep for 'plugin' to discover additional files
      const { fileMatches, ops, bytes } = grepAll(path.join(SRC_DIR, 'main', 'plugins'), /activate|lifecycle|register/i);
      totalOps += ops; totalBytes += bytes;
      for (const m of fileMatches) {
        if (!found.includes(m.file)) found.push(m.file);
      }
      return { found, ops: totalOps, bytes: totalBytes };
    });

    dbgBaseline('Read plugin-loader, plugin-manager, plugin-registry + grep for activate/lifecycle/register', {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`Found ${baselineRun.result.found.length} relevant files`);

    // --- Code Model ---
    const modelRun = timed(() => {
      dbgQuery('executeQuery', { type: 'search', pattern: 'plugin loader manager registry activation' });
      return executeQuery({ schema, instance, query: { type: 'search', pattern: 'plugin loader manager registry activation' } });
    });

    const predicted = modelRun.result.results.map(r => r.path);
    const foundRelevant = gt.relevantModules.filter(rm => predicted.includes(rm));
    dbgResult(`${modelRun.result.count} results, ${foundRelevant.length}/${gt.relevantModules.length} relevant found`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    dbgVerdict('D2', {
      found: foundRelevant.length, expected: gt.relevantModules.length,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('D', 'D2', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs },
      { toolCalls: 2, tokens: estimateTokens(JSON.stringify(modelRun.result)), durationMs: modelRun.durationMs },
      { foundRelevant: foundRelevant.length, totalRelevant: gt.relevantModules.length }
    );

    assert.ok(foundRelevant.length >= 2, `Should find >= 2 relevant modules`);
  });

  it('D3: IPC message handling flow', () => {
    dbgTestHeader('D3', 'How does IPC message handling work?');

    // --- Real baseline: grep for ipcMain.handle and follow ---
    const baselineRun = timed(() => {
      const { fileMatches, ops, bytes } = grepAll(SRC_DIR, /ipcMain\.handle|ipcRenderer\.invoke|contextBridge/i);
      // Also read ipc-handlers.js
      const ipcFile = readFile('src/main/ipc-handlers.js');
      return {
        ipcFiles: fileMatches.map(m => m.file),
        ops: ops + ipcFile.ops,
        bytes: bytes + ipcFile.bytes
      };
    });

    dbgBaseline('Grep for ipcMain.handle / ipcRenderer.invoke / contextBridge', {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`Found ${baselineRun.result.ipcFiles.length} IPC-related files`);

    // --- Code Model ---
    const modelRun = timed(() => {
      dbgQuery('executeQuery', { type: 'search', pattern: 'ipc handler message' });
      const searchResult = executeQuery({ schema, instance, query: { type: 'search', pattern: 'ipc handler message' } });
      dbgQuery('navigate', { operation: 'walk', start: 'src/main/ipc-handlers.js', direction: 'outgoing', maxDepth: 1 });
      const walkResult = navigate({ instance, options: { operation: 'walk', start: 'src/main/ipc-handlers.js', direction: 'outgoing', maxDepth: 1, limit: 20 } });
      return { searchResult, walkResult };
    });

    dbgResult(`Search: ${modelRun.result.searchResult.count} results, Walk: ${modelRun.result.walkResult.nodes.length} nodes`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    dbgVerdict('D3', {
      baselineFiles: baselineRun.result.ipcFiles.length,
      modelSearch: modelRun.result.searchResult.count,
      modelWalk: modelRun.result.walkResult.nodes.length,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('D', 'D3', 'How does IPC message handling work?',
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs },
      { toolCalls: 2, tokens: estimateTokens(JSON.stringify(modelRun.result.walkResult)), durationMs: modelRun.durationMs },
      { baselineFiles: baselineRun.result.ipcFiles.length, searchResults: modelRun.result.searchResult.count, walkNodes: modelRun.result.walkResult.nodes.length }
    );

    assert.ok(modelRun.result.searchResult.count >= 1, 'Should find IPC-related artifacts');
    assert.ok(modelRun.result.walkResult.nodes.length >= 2, 'Walk should find dependencies');
  });
});

// ===========================================================================
// Category E: Change Planning
// ===========================================================================

describe('Category E: Change Planning', () => {

  it('E1: Adding a new IPC channel — what files to touch?', () => {
    const gt = GROUND_TRUTH.E1_new_ipc_channel;
    dbgTestHeader('E1', gt.question);

    // --- Real baseline ---
    const baselineRun = timed(() => {
      const { fileMatches, ops, bytes } = grepAll(SRC_DIR, /ipcMain\.handle|ipcRenderer|contextBridge|preload/i);
      return { files: fileMatches.map(m => m.file), ops, bytes };
    });

    const baselineFound = gt.expectedFiles.filter(ef => baselineRun.result.files.includes(ef));

    dbgBaseline('Grep for ipcMain.handle / ipcRenderer / contextBridge / preload', {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`${baselineRun.result.files.length} files, ${baselineFound.length}/${gt.expectedFiles.length} expected found`);

    // --- Code Model ---
    const modelRun = timed(() => {
      dbgQuery('executeQuery (search)', { type: 'search', pattern: 'ipc handler preload contextBridge' });
      const searchResult = executeQuery({ schema, instance, query: { type: 'search', pattern: 'ipc handler preload contextBridge' } });
      dbgQuery('executeQuery (deps)', { type: 'deps', artifact: 'src/main/ipc-handlers.js', direction: 'both' });
      const depsResult = executeQuery({ schema, instance, query: { type: 'deps', artifact: 'src/main/ipc-handlers.js', direction: 'both' } });
      const allPaths = [
        ...searchResult.results.map(r => r.path),
        ...(depsResult.results || []).map(d => d.from || d.to)
      ];
      return { uniquePaths: [...new Set(allPaths)], searchCount: searchResult.count, depsCount: (depsResult.results || []).length };
    });

    const modelFound = gt.expectedFiles.filter(ef => modelRun.result.uniquePaths.includes(ef));
    dbgResult(`${modelRun.result.uniquePaths.length} unique paths, ${modelFound.length}/${gt.expectedFiles.length} expected`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    dbgVerdict('E1', {
      baselineFiles: baselineRun.result.files.length, baselineFound: baselineFound.length,
      modelPaths: modelRun.result.uniquePaths.length, modelFound: modelFound.length,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('E', 'E1', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs, found: baselineFound.length },
      { toolCalls: 2, tokens: estimateTokens(JSON.stringify(modelRun.result)), durationMs: modelRun.durationMs, found: modelFound.length },
      { baselineFound: baselineFound.length, modelFound: modelFound.length, expected: gt.expectedFiles.length }
    );

    assert.ok(modelFound.length >= 1, `Should find >= 1 expected IPC-related files`);
  });

  it('E2: Convention for adding a new plugin', () => {
    const gt = GROUND_TRUTH.E2_plugin_convention;
    dbgTestHeader('E2', gt.question);

    // --- Real baseline: read existing plugin files to understand patterns ---
    const baselineRun = timed(() => {
      const pluginDir = path.join(SRC_DIR, 'main', 'plugins');
      const { files, ops: globOps, bytes: globBytes } = globJs(pluginDir);
      let totalOps = globOps, totalBytes = globBytes;
      for (const f of files.slice(0, 5)) { // read first 5 as sample
        const content = readFile(path.relative(PUFFIN_ROOT, f).replace(/\\/g, '/'));
        totalOps += content.ops; totalBytes += content.bytes;
      }
      return { pluginFiles: files.length, ops: totalOps, bytes: totalBytes };
    });

    dbgBaseline('Glob plugins dir + read sample plugin files', {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`${baselineRun.result.pluginFiles} plugin files found, read samples`);

    // --- Code Model ---
    const modelRun = timed(() => {
      dbgQuery('executeQuery', { type: 'search', pattern: 'plugin' });
      const result = executeQuery({ schema, instance, query: { type: 'search', pattern: 'plugin' } });
      const pluginTagged = Object.entries(instance.artifacts)
        .filter(([, a]) => (a.tags || []).includes(gt.expectedTag));
      return { searchCount: result.count, taggedCount: pluginTagged.length };
    });

    dbgResult(`Search: ${modelRun.result.searchCount} results, Tagged "${gt.expectedTag}": ${modelRun.result.taggedCount}`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    dbgVerdict('E2', {
      baselinePluginFiles: baselineRun.result.pluginFiles,
      modelSearch: modelRun.result.searchCount, modelTagged: modelRun.result.taggedCount,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('E', 'E2', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs },
      { toolCalls: 1, tokens: estimateTokens(JSON.stringify({ search: modelRun.result.searchCount, tagged: modelRun.result.taggedCount })), durationMs: modelRun.durationMs },
      { searchResults: modelRun.result.searchCount, taggedPlugins: modelRun.result.taggedCount }
    );

    assert.ok(modelRun.result.taggedCount >= gt.expectedPluginModules_minCount,
      `Should find >= ${gt.expectedPluginModules_minCount} plugin-tagged modules`);
  });

  it('E3: Impact of refactoring the database module', () => {
    const gt = GROUND_TRUTH.E3_database_refactor_impact;
    dbgTestHeader('E3', gt.question);

    // --- Real baseline: grep for database imports ---
    const baselineRun = timed(() => {
      const { fileMatches, ops, bytes } = grepAll(SRC_DIR, /require\s*\(\s*['"][^'"]*database[^'"]*['"]\s*\)|from\s+['"][^'"]*database[^'"]*['"]/i);
      return { files: fileMatches.map(m => m.file), ops, bytes };
    });

    dbgBaseline('Grep for imports of database modules', {
      ops: baselineRun.result.ops, bytes: baselineRun.result.bytes, durationMs: baselineRun.durationMs
    });
    dbgBaselineResult(`${baselineRun.result.files.length} files import database modules`);

    // --- Code Model ---
    const modelRun = timed(() => {
      dbgQuery('analyzeImpact', { name: 'src/main/database/*', depth: 2 });
      return analyzeImpact({ schema, instance, target: { name: 'src/main/database/*', depth: 2 } });
    });

    dbgResult(`Targets: ${(modelRun.result.targetEntities || []).length}, Affected: ${(modelRun.result.affectedFiles || []).length}`);
    dbgTiming(baselineRun.durationMs, modelRun.durationMs);

    dbgVerdict('E3', {
      baselineImporters: baselineRun.result.files.length,
      modelTargets: (modelRun.result.targetEntities || []).length,
      modelAffected: (modelRun.result.affectedFiles || []).length,
      baselineMs: baselineRun.durationMs, modelMs: modelRun.durationMs
    });

    record('E', 'E3', gt.question,
      { toolCalls: baselineRun.result.ops, tokens: estimateTokens(baselineRun.result.bytes + ''), durationMs: baselineRun.durationMs },
      { toolCalls: 1, tokens: estimateTokens(JSON.stringify(modelRun.result)), durationMs: modelRun.durationMs },
      {
        baselineImporters: baselineRun.result.files.length,
        targetEntities: (modelRun.result.targetEntities || []).length,
        affectedFiles: (modelRun.result.affectedFiles || []).length
      }
    );

    assert.ok((modelRun.result.targetEntities || []).length >= 1, `Should find >= 1 target entity`);
  });
});

// ===========================================================================
// Summary Report
// ===========================================================================

describe('Summary Report', () => {
  it('prints the evaluation summary', () => {
    console.log('\n' + '='.repeat(80));
    console.log('  h-DSL Code Model vs Standard Tools — Evaluation Summary');
    console.log('  Both baseline (real fs ops) and Code Model (real queries) timed');
    console.log('='.repeat(80));

    const categories = ['A', 'B', 'C', 'D', 'E'];
    const categoryNames = {
      A: 'Dependency Tracing',
      B: 'Semantic Search',
      C: 'Artifact Discovery',
      D: 'Cross-File Flow Understanding',
      E: 'Change Planning'
    };

    let totalBaselineMs = 0;
    let totalModelMs = 0;
    let totalBaselineOps = 0;
    let totalModelOps = 0;

    for (const cat of categories) {
      const tests = report.filter(r => r.category === cat);
      if (tests.length === 0) continue;

      console.log(`\n  Category ${cat}: ${categoryNames[cat]}`);
      console.log('  ' + '-'.repeat(60));

      for (const t of tests) {
        const speedup = t.codeModel.durationMs > 0
          ? round(t.baseline.durationMs / t.codeModel.durationMs)
          : '∞';
        console.log(`  ${t.id}: ${t.question}`);
        console.log(`    Baseline:    ${t.baseline.durationMs}ms (${t.baseline.toolCalls} fs ops)`);
        console.log(`    Code Model:  ${t.codeModel.durationMs}ms (${t.codeModel.toolCalls} query ops)`);
        console.log(`    Speedup:     ${speedup}x`);
        console.log(`    Accuracy:    ${JSON.stringify(t.accuracy)}`);

        totalBaselineMs += t.baseline.durationMs;
        totalModelMs += t.codeModel.durationMs;
        totalBaselineOps += (typeof t.baseline.toolCalls === 'number' ? t.baseline.toolCalls : 0);
        totalModelOps += (typeof t.codeModel.toolCalls === 'number' ? t.codeModel.toolCalls : 0);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`  Total baseline time:     ${round(totalBaselineMs)}ms (${totalBaselineOps} fs ops)`);
    console.log(`  Total Code Model time:   ${round(totalModelMs)}ms (${totalModelOps} query ops)`);
    console.log(`  Overall time speedup:    ${totalModelMs > 0 ? round(totalBaselineMs / totalModelMs) : '∞'}x`);
    console.log('='.repeat(80) + '\n');

    assert.ok(true);
  });
});
