/**
 * @module emitter
 * Phase 4: EMIT — validate, write schema.json and instance.json to disk.
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');

/**
 * Validate the instance against the schema and write output files.
 *
 * @param {Object} params
 * @param {Object} params.schema
 * @param {Object} params.instance
 * @param {string} params.outputDir - Absolute path to output directory.
 * @param {Function} params.log
 */
async function emit({ schema, instance, outputDir, log }) {
  // Validate: every artifact must reference a known element type
  const knownTypes = new Set(Object.keys(schema.elementTypes));
  const warnings = [];

  for (const [artPath, artifact] of Object.entries(instance.artifacts)) {
    if (!knownTypes.has(artifact.type)) {
      warnings.push(`Artifact ${artPath} has unknown type "${artifact.type}", defaulting to "module"`);
      artifact.type = 'module';
    }
  }

  // Validate: every dependency must reference existing artifacts
  const artKeys = new Set(Object.keys(instance.artifacts));
  instance.dependencies = instance.dependencies.filter(dep => {
    if (!artKeys.has(dep.from)) {
      warnings.push(`Dependency from unknown artifact "${dep.from}" — removed`);
      return false;
    }
    if (!artKeys.has(dep.to)) {
      warnings.push(`Dependency to unknown artifact "${dep.to}" — removed`);
      return false;
    }
    return true;
  });

  if (warnings.length > 0) {
    log(`  ${warnings.length} validation warnings`);
    for (const w of warnings) {
      log(`    ${w}`);
    }
  }

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Write schema.json
  const schemaPath = path.join(outputDir, 'schema.json');
  await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2), 'utf-8');
  log(`  Wrote ${schemaPath}`);

  // Write instance.json
  const instancePath = path.join(outputDir, 'instance.json');
  await fs.writeFile(instancePath, JSON.stringify(instance, null, 2), 'utf-8');
  log(`  Wrote ${instancePath}`);
}

module.exports = { emit };
