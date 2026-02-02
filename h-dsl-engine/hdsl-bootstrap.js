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

const program = new Command();

program
  .name('hdsl-bootstrap')
  .description('Scan a project and produce an h-DSL schema and Code Model')
  .version('0.1.0')
  .requiredOption('--project <path>', 'Root directory of the target project')
  .option('--config <path>', 'Path to config file (default: <project>/.hdslrc.json)')
  .option('--exclude <patterns>', 'Comma-separated glob patterns to skip')
  .option('--include <patterns>', 'Comma-separated glob patterns to include (e.g. "*.js,*.ts")')
  .option('--output <dir>', 'Output directory for schema/instance JSON')
  .option('--annotate', 'Generate .an.md annotation files for each source artifact', false)
  .option('--verbose', 'Print progress and decisions to stdout', false)
  .option('--clean', 'Delete existing schema/instance before running', false)
  .action(run);

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

  // Clean existing output if requested
  if (opts.clean) {
    const schemaPath = path.join(outputDir, 'schema.json');
    const instancePath = path.join(outputDir, 'instance.json');
    const annotationsDir = path.join(outputDir, 'annotations');
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
