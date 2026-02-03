#!/usr/bin/env node
'use strict';

/**
 * h-DSL Bootstrap CLI
 *
 * Scans an existing project and produces a populated h-DSL schema and Code Model
 * (instance), ready for consumption by Puffin's Central Reasoning Engine.
 *
 * Usage:
 *   node hdsl-bootstrap.js --project /path/to/project [--exclude "pattern1,pattern2"] [--verbose]
 */

const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const program = new Command();

/**
 * Prompt user for confirmation.
 * @param {string} message - The prompt message.
 * @returns {Promise<boolean>} True if user confirms, false otherwise.
 */
function confirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

program
  .name('hdsl-bootstrap')
  .description('Scan a project and produce an h-DSL schema and Code Model')
  .version('0.1.0');

// Default command: bootstrap (backward-compatible — no subcommand needed)
program
  .command('bootstrap', { isDefault: true })
  .description('Scan a project and produce an h-DSL schema and Code Model')
  .requiredOption('--project <path>', 'Root directory of the target project')
  .option('--config <path>', 'Path to config file (default: <project>/.hdslrc.json)')
  .option('--exclude <patterns>', 'Comma-separated glob patterns to skip')
  .option('--include <patterns>', 'Comma-separated glob patterns to include (e.g. "*.js,*.ts")')
  .option('--output <dir>', 'Output directory for schema/instance JSON')
  .option('--annotate', 'Generate .an.md annotation files for each source artifact', false)
  .option('--verbose', 'Print progress and decisions to stdout', false)
  .option('--clean', 'Delete existing schema/instance before running', false)
  .option('-y, --yes', 'Skip confirmation prompts (for scripted/CI usage)', false)
  .action(run);

// Explore command: query an existing code model
program
  .command('explore')
  .description('Query an existing h-DSL code model and return structured JSON')
  .requiredOption('--project <path>', 'Root directory of the target project')
  .requiredOption('--query <json>', 'JSON query object or query type shorthand (e.g. "stats", "artifact")')
  .option('--pattern <pattern>', 'Filter pattern (used with artifact/flow/search query types)')
  .option('--artifact <path>', 'Artifact path (used with deps query type)')
  .option('--direction <dir>', 'Dependency direction: inbound, outbound, or both', 'both')
  .option('--kind <kind>', 'Filter by kind (artifact kind or dependency kind)')
  .option('--element-type <type>', 'Filter by element type')
  .option('--limit <n>', 'Max results to return', '50')
  .option('--output <dir>', 'Data directory (default: <project>/.puffin/cre)')
  .option('--pretty', 'Pretty-print JSON output', false)
  .action(runExplore);

// Query command: high-level code model query interface for LLM consumption
program
  .command('query')
  .description('Query the code model for entities, relationships, structure, or impact analysis')
  .requiredOption('--project <path>', 'Root directory of the target project')
  .requiredOption('--query <json>', 'JSON query object (e.g. \'{"type":"entity","name":"api*"}\')')
  .option('--depth <n>', 'Neighbor traversal depth', '1')
  .option('--limit <n>', 'Max root matches to return', '20')
  .option('--output <dir>', 'Data directory (default: <project>/.puffin/cre)')
  .option('--pretty', 'Pretty-print JSON output', false)
  .action(runQuery);

// Analyze command: impact analysis for proposed changes
program
  .command('analyze')
  .description('Analyze the impact of changing a target entity or file')
  .requiredOption('--project <path>', 'Root directory of the target project')
  .requiredOption('--target <pattern>', 'Entity path or glob pattern to analyze')
  .option('--depth <n>', 'Max transitive traversal depth', '3')
  .option('--no-reverse', 'Skip reverse (who-depends-on-target) analysis')
  .option('--output <dir>', 'Data directory (default: <project>/.puffin/cre)')
  .option('--pretty', 'Pretty-print JSON output', false)
  .action(runAnalyze);

// Patterns command: discover codebase patterns and conventions
program
  .command('patterns')
  .description('Discover naming conventions, file organization, module structure, and architectural patterns')
  .requiredOption('--project <path>', 'Root directory of the target project')
  .option('--category <cat>', 'Pattern category: naming, organization, modules, architecture, similar, all', 'all')
  .option('--area <pattern>', 'Focus on a specific area (path glob pattern)')
  .option('--feature-type <type>', 'Find examples of this feature type (for similar category)')
  .option('--output <dir>', 'Data directory (default: <project>/.puffin/cre)')
  .option('--pretty', 'Pretty-print JSON output', false)
  .action(runPatterns);

// Navigate command: contextual code navigation by relationship type
program
  .command('navigate')
  .description('Navigate the code model graph by relationship type (walk, path, neighbors)')
  .requiredOption('--project <path>', 'Root directory of the target project')
  .requiredOption('--op <operation>', 'Operation: walk, path, or neighbors')
  .option('--start <pattern>', 'Starting entity (for walk)')
  .option('--entity <pattern>', 'Entity to inspect (for neighbors)')
  .option('--from <pattern>', 'Source entity (for path)')
  .option('--to <pattern>', 'Target entity (for path)')
  .option('--direction <dir>', 'Direction: outgoing, incoming, or both', 'outgoing')
  .option('--rel <types>', 'Comma-separated relationship types to follow (e.g. "import,call")')
  .option('--depth <n>', 'Max traversal depth', '3')
  .option('--limit <n>', 'Max nodes to return', '100')
  .option('--output <dir>', 'Data directory (default: <project>/.puffin/cre)')
  .option('--pretty', 'Pretty-print JSON output', false)
  .action(runNavigate);

// Freshness command: check/update model freshness
program
  .command('freshness')
  .description('Check if the code model is up-to-date and optionally perform incremental update')
  .requiredOption('--project <path>', 'Root directory of the target project')
  .option('--auto-update', 'Automatically perform incremental update if stale', false)
  .option('--force-refresh', 'Request full rebuild (reports rebuild-required)', false)
  .option('--output <dir>', 'Data directory (default: <project>/.puffin/cre)')
  .option('--verbose', 'Print progress messages', false)
  .option('--pretty', 'Pretty-print JSON output', false)
  .action(runFreshness);

program.parse();

/**
 * Main execution pipeline: DISCOVER → DERIVE → POPULATE → EMIT → ANNOTATE.
 * @param {Object} opts - CLI options.
 */
async function run(opts) {
  // Defer library imports so --help/--version work without all deps installed
  const { resolveConfig } = require('./lib/config');
  const { discover } = require('./lib/discoverer');
  const { deriveSchema } = require('./lib/schema-deriver');
  const { populate } = require('./lib/populator');
  const { emit } = require('./lib/emitter');
  const { emitAnnotations } = require('./lib/annotation-emitter');

  // Build a preliminary logger (may be replaced once config is resolved)
  let log = opts.verbose ? (...args) => console.log('[hdsl]', ...args) : () => {};

  // Resolve merged configuration: defaults ← config file ← CLI flags
  const config = resolveConfig(opts, log);
  const { projectRoot, exclude: excludePatterns, include: includePatterns, outputDir, verbose } = config;

  // Final logger based on resolved verbose flag
  log = verbose ? (...args) => console.log('[hdsl]', ...args) : () => {};

  // Validate project root exists
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    console.error(`Error: Project directory does not exist: ${projectRoot}`);
    process.exit(1);
  }

  // Clean existing output if requested (with confirmation)
  if (opts.clean) {
    const schemaPath = path.join(outputDir, 'schema.json');
    const instancePath = path.join(outputDir, 'instance.json');
    const annotationsDir = path.join(outputDir, 'annotations');

    // Check what exists
    const existingFiles = [];
    if (fs.existsSync(schemaPath)) existingFiles.push('schema.json');
    if (fs.existsSync(instancePath)) existingFiles.push('instance.json');
    if (fs.existsSync(annotationsDir)) existingFiles.push('annotations/');

    if (existingFiles.length > 0 && !opts.yes) {
      console.log('\n⚠️  WARNING: --clean will delete the existing Code Model:');
      existingFiles.forEach(f => console.log(`   • ${path.join(outputDir, f)}`));
      console.log('');

      const confirmed = await confirm('Are you sure you want to delete and rebuild?');
      if (!confirmed) {
        console.log('Aborted. No changes made.');
        process.exit(0);
      }
      console.log('');
    }

    for (const p of [schemaPath, instancePath]) {
      if (fs.existsSync(p)) { fs.unlinkSync(p); log(`  Deleted ${p}`); }
    }
    if (fs.existsSync(annotationsDir)) {
      fs.rmSync(annotationsDir, { recursive: true }); log(`  Deleted ${annotationsDir}`);
    }
    log('Cleaned existing output.');
  }

  try {
    // Phase 1: DISCOVER
    log('Phase 1: DISCOVER — scanning files and parsing source...');
    const discovery = await discover({ projectRoot, excludePatterns, includePatterns, log });
    log(`  Found ${discovery.files.length} files, ${discovery.rawArtifacts.length} raw artifacts`);

    if (discovery.files.length === 0) {
      console.error('Error: No recognizable source files found in project.');
      process.exit(1);
    }

    // Phase 2: DERIVE SCHEMA
    log('Phase 2: DERIVE — building schema from discovered patterns...');
    const schema = await deriveSchema({ discovery, log });
    log(`  Schema has ${Object.keys(schema.elementTypes).length} element types`);

    // Phase 3: POPULATE INSTANCE
    log('Phase 3: POPULATE — building code model instance...');
    const { instance, schema: extendedSchema } = await populate({ discovery, schema, projectRoot, log });
    log(`  ${Object.keys(instance.artifacts).length} artifacts, ${instance.dependencies.length} dependencies, ${Object.keys(instance.flows).length} flows`);

    // Phase 4: EMIT
    log('Phase 4: EMIT — validating and writing output...');
    await emit({ schema: extendedSchema, instance, outputDir, log });

    // Phase 5: ANNOTATE (optional)
    let annotationCount = 0;
    if (opts.annotate) {
      log('Phase 5: ANNOTATE — generating .an.md annotation files...');
      const annFiles = await emitAnnotations({
        schema: extendedSchema,
        instance,
        projectRoot,
        outputDir,
        log
      });
      annotationCount = annFiles.length;
      log(`  Generated ${annotationCount} annotation files`);
    }

    // Summary
    const artifactCount = Object.keys(instance.artifacts).length;
    const depCount = instance.dependencies.length;
    const flowCount = Object.keys(instance.flows).length;
    const elementTypeCount = Object.keys(extendedSchema.elementTypes).length;
    const extensionCount = (extendedSchema.extensionLog || []).length;

    const withSummary = Object.values(instance.artifacts).filter(a => a.summary && a.summary !== 'AI summary unavailable').length;
    const proseCoverage = artifactCount > 0 ? Math.round((withSummary / artifactCount) * 100) : 0;

    console.log('');
    console.log('h-DSL Bootstrap Complete');
    console.log('========================');
    console.log(`Project: ${projectRoot}`);
    console.log(`Files scanned: ${discovery.files.length}`);
    console.log(`Schema element types: ${elementTypeCount} (${Object.keys(extendedSchema.elementTypes).join(', ')})`);
    console.log(`Schema extensions: ${extensionCount}`);
    console.log(`Artifacts: ${artifactCount}`);
    console.log(`Dependencies: ${depCount}`);
    console.log(`Flows: ${flowCount}`);
    console.log(`Prose coverage: ${proseCoverage}%`);
    if (annotationCount > 0) {
      console.log(`Annotations: ${annotationCount} .an.md files`);
    }
    console.log(`Output: ${path.join(outputDir, 'schema.json')}`);
    console.log(`         ${path.join(outputDir, 'instance.json')}`);
    if (annotationCount > 0) {
      console.log(`         ${path.join(outputDir, 'annotations', '')}`);
    }
  } catch (err) {
    console.error(`Fatal error: ${err.message}`);
    if (verbose) console.error(err.stack);
    process.exit(1);
  }
}

/**
 * Explore command handler — query an existing code model.
 * @param {Object} opts - CLI options from Commander.
 */
async function runExplore(opts) {
  const { loadModel, executeQuery } = require('./lib/explorer');

  const projectRoot = path.resolve(opts.project);
  const dataDir = opts.output
    ? path.resolve(opts.output)
    : path.join(projectRoot, '.puffin', 'cre');

  // Validate project root
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    console.error(`Error: Project directory does not exist: ${projectRoot}`);
    process.exit(1);
  }

  // Build query object from options
  let query;
  try {
    // Try parsing --query as JSON first
    query = JSON.parse(opts.query);
  } catch {
    // Treat --query as a shorthand query type name
    query = { type: opts.query };
  }

  // Merge CLI flags into query (CLI flags override JSON fields)
  if (opts.pattern) query.pattern = opts.pattern;
  if (opts.artifact) query.artifact = opts.artifact;
  if (opts.direction) query.direction = opts.direction;
  if (opts.kind) query.kind = opts.kind;
  if (opts.elementType) query.elementType = opts.elementType;
  if (opts.limit) query.limit = parseInt(opts.limit, 10);

  try {
    const { schema, instance } = await loadModel(dataDir);
    const result = executeQuery({ schema, instance, query });
    const json = opts.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
    process.stdout.write(json + '\n');
  } catch (err) {
    const errorResult = { error: err.message };
    process.stderr.write(JSON.stringify(errorResult) + '\n');
    process.exit(1);
  }
}

/**
 * Query command handler — high-level code model query interface.
 * @param {Object} opts - CLI options from Commander.
 */
async function runQuery(opts) {
  const { loadModel } = require('./lib/explorer');
  const { queryModel } = require('./lib/query-interface');

  const projectRoot = path.resolve(opts.project);
  const dataDir = opts.output
    ? path.resolve(opts.output)
    : path.join(projectRoot, '.puffin', 'cre');

  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    console.error(`Error: Project directory does not exist: ${projectRoot}`);
    process.exit(1);
  }

  let query;
  try {
    query = JSON.parse(opts.query);
  } catch {
    throw new Error('--query must be valid JSON for the query command');
  }

  // Merge CLI depth/limit overrides
  if (opts.depth) query.depth = parseInt(opts.depth, 10);
  if (opts.limit) query.limit = parseInt(opts.limit, 10);

  try {
    const { schema, instance } = await loadModel(dataDir);
    const result = queryModel({ schema, instance, query });
    const json = opts.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
    process.stdout.write(json + '\n');
  } catch (err) {
    const errorResult = { error: err.message };
    process.stderr.write(JSON.stringify(errorResult) + '\n');
    process.exit(1);
  }
}

/**
 * Analyze command handler — impact analysis for proposed changes.
 * @param {Object} opts - CLI options from Commander.
 */
async function runAnalyze(opts) {
  const { loadModel } = require('./lib/explorer');
  const { analyzeImpact } = require('./lib/impact-analyzer');

  const projectRoot = path.resolve(opts.project);
  const dataDir = opts.output
    ? path.resolve(opts.output)
    : path.join(projectRoot, '.puffin', 'cre');

  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    console.error(`Error: Project directory does not exist: ${projectRoot}`);
    process.exit(1);
  }

  try {
    const { schema, instance } = await loadModel(dataDir);
    const result = analyzeImpact({
      schema,
      instance,
      target: {
        name: opts.target,
        depth: parseInt(opts.depth, 10),
        includeReverseImpact: opts.reverse !== false
      }
    });
    const json = opts.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
    process.stdout.write(json + '\n');
  } catch (err) {
    const errorResult = { error: err.message };
    process.stderr.write(JSON.stringify(errorResult) + '\n');
    process.exit(1);
  }
}

/**
 * Patterns command handler — discover codebase patterns and conventions.
 * @param {Object} opts - CLI options from Commander.
 */
async function runPatterns(opts) {
  const { loadModel } = require('./lib/explorer');
  const { discoverPatterns } = require('./lib/pattern-discovery');

  const projectRoot = path.resolve(opts.project);
  const dataDir = opts.output
    ? path.resolve(opts.output)
    : path.join(projectRoot, '.puffin', 'cre');

  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    console.error(`Error: Project directory does not exist: ${projectRoot}`);
    process.exit(1);
  }

  try {
    const { schema, instance } = await loadModel(dataDir);
    const result = discoverPatterns({
      schema,
      instance,
      query: {
        category: opts.category,
        area: opts.area || undefined,
        featureType: opts.featureType || undefined
      }
    });
    const json = opts.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
    process.stdout.write(json + '\n');
  } catch (err) {
    const errorResult = { error: err.message };
    process.stderr.write(JSON.stringify(errorResult) + '\n');
    process.exit(1);
  }
}

/**
 * Navigate command handler — contextual code navigation.
 * @param {Object} opts - CLI options from Commander.
 */
async function runNavigate(opts) {
  const { loadModel } = require('./lib/explorer');
  const { navigate } = require('./lib/graph-navigator');

  const projectRoot = path.resolve(opts.project);
  const dataDir = opts.output
    ? path.resolve(opts.output)
    : path.join(projectRoot, '.puffin', 'cre');

  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    console.error(`Error: Project directory does not exist: ${projectRoot}`);
    process.exit(1);
  }

  const navOptions = {
    operation: opts.op,
    start: opts.start || undefined,
    entity: opts.entity || undefined,
    from: opts.from || undefined,
    to: opts.to || undefined,
    direction: opts.direction,
    relationshipTypes: opts.rel ? opts.rel.split(',').map(s => s.trim()) : undefined,
    maxDepth: parseInt(opts.depth, 10),
    limit: parseInt(opts.limit, 10)
  };

  try {
    const { instance } = await loadModel(dataDir);
    const result = navigate({ instance, options: navOptions });
    const json = opts.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
    process.stdout.write(json + '\n');
  } catch (err) {
    const errorResult = { error: err.message };
    process.stderr.write(JSON.stringify(errorResult) + '\n');
    process.exit(1);
  }
}

/**
 * Freshness command handler — check and optionally update model freshness.
 * @param {Object} opts - CLI options from Commander.
 */
async function runFreshness(opts) {
  const { ensureFresh } = require('./lib/freshness');

  const projectRoot = path.resolve(opts.project);
  const dataDir = opts.output
    ? path.resolve(opts.output)
    : path.join(projectRoot, '.puffin', 'cre');

  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    console.error(`Error: Project directory does not exist: ${projectRoot}`);
    process.exit(1);
  }

  const log = opts.verbose ? (...args) => console.error('[freshness]', ...args) : () => {};

  try {
    const result = await ensureFresh({
      projectRoot,
      dataDir,
      autoUpdate: opts.autoUpdate || false,
      forceRefresh: opts.forceRefresh || false,
      log
    });
    const json = opts.pretty ? JSON.stringify(result, null, 2) : JSON.stringify(result);
    process.stdout.write(json + '\n');
  } catch (err) {
    const errorResult = { error: err.message };
    process.stderr.write(JSON.stringify(errorResult) + '\n');
    process.exit(1);
  }
}
