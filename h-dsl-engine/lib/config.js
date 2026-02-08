/**
 * @module config
 * Loads and merges h-DSL bootstrap configuration from CLI options and config files.
 *
 * Resolution order (later wins):
 *   1. Built-in defaults
 *   2. Config file (.hdslrc.json in project root, or --config path)
 *   3. CLI flags
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** Default config file name looked up in the target project root. */
const DEFAULT_CONFIG_FILENAME = '.hdslrc.json';

/**
 * Built-in defaults — sensible for a generic JS/TS project.
 * @returns {Object}
 */
function defaults() {
  return {
    exclude: ['node_modules', 'dist', '.git', 'coverage'],
    include: [],          // empty = include all recognized extensions
    outputDir: null,      // null = <projectRoot>/.puffin/cre
    verbose: false
  };
}

/**
 * Attempt to read a JSON config file. Returns {} on any failure.
 * @param {string} filePath - Absolute path to config file.
 * @param {Function} log
 * @returns {Object}
 */
function readConfigFile(filePath, log) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    log(`  Loaded config from ${filePath}`);
    return validateConfigShape(parsed, log);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      log(`  Warning: could not read config file ${filePath}: ${err.message}`);
    }
    return {};
  }
}

/** Known config keys. */
const KNOWN_KEYS = new Set(['exclude', 'include', 'outputDir', 'verbose']);

/**
 * Validate config file shape and coerce/drop invalid values.
 * @param {Object} conf - Parsed JSON object.
 * @param {Function} log
 * @returns {Object} Sanitized config (only known keys with correct types).
 */
function validateConfigShape(conf, log) {
  if (typeof conf !== 'object' || conf === null || Array.isArray(conf)) {
    log('  Warning: config file root must be a JSON object — ignoring');
    return {};
  }

  const clean = {};

  for (const key of Object.keys(conf)) {
    if (!KNOWN_KEYS.has(key)) {
      log(`  Warning: unrecognized config key "${key}" — ignoring`);
      continue;
    }
  }

  if (conf.exclude !== undefined) {
    if (Array.isArray(conf.exclude) && conf.exclude.every(v => typeof v === 'string')) {
      clean.exclude = conf.exclude;
    } else {
      log('  Warning: config "exclude" must be an array of strings — ignoring');
    }
  }

  if (conf.include !== undefined) {
    if (Array.isArray(conf.include) && conf.include.every(v => typeof v === 'string')) {
      clean.include = conf.include;
    } else {
      log('  Warning: config "include" must be an array of strings — ignoring');
    }
  }

  if (conf.outputDir !== undefined) {
    if (typeof conf.outputDir === 'string') {
      clean.outputDir = conf.outputDir;
    } else {
      log('  Warning: config "outputDir" must be a string — ignoring');
    }
  }

  if (conf.verbose !== undefined) {
    if (typeof conf.verbose === 'boolean') {
      clean.verbose = conf.verbose;
    } else {
      log('  Warning: config "verbose" must be a boolean — ignoring');
    }
  }

  return clean;
}

/**
 * Resolve the effective configuration by merging defaults, config file, and CLI options.
 *
 * @param {Object} cliOpts - Parsed CLI options from Commander.
 * @param {string} cliOpts.project - Project root (required, already resolved).
 * @param {string} [cliOpts.exclude] - Comma-separated exclude patterns from CLI.
 * @param {string} [cliOpts.include] - Comma-separated include patterns from CLI.
 * @param {string} [cliOpts.output]  - Output directory from CLI.
 * @param {string} [cliOpts.config]  - Explicit config file path from CLI.
 * @param {boolean} [cliOpts.verbose]
 * @param {Function} log
 * @returns {Object} Resolved config with keys: projectRoot, exclude, include, outputDir, verbose.
 */
function resolveConfig(cliOpts, log) {
  const projectRoot = path.resolve(cliOpts.project);
  const base = defaults();

  // Determine config file path
  const configPath = cliOpts.config
    ? path.resolve(cliOpts.config)
    : path.join(projectRoot, DEFAULT_CONFIG_FILENAME);

  const fileConf = readConfigFile(configPath, log);

  // Merge: defaults ← file ← CLI
  const exclude = cliOpts.exclude
    ? cliOpts.exclude.split(',').map(s => s.trim()).filter(Boolean)
    : (fileConf.exclude || base.exclude);

  const include = cliOpts.include
    ? cliOpts.include.split(',').map(s => s.trim()).filter(Boolean)
    : (fileConf.include || base.include);

  let outputDir = cliOpts.output
    ? path.resolve(cliOpts.output)
    : fileConf.outputDir
      ? path.resolve(projectRoot, fileConf.outputDir)
      : path.join(projectRoot, '.puffin', 'cre');

  // Guard against path traversal: config-derived outputDir must be within the project tree
  const normalizedOut = path.normalize(outputDir) + path.sep;
  const normalizedRoot = path.normalize(projectRoot) + path.sep;
  if (!normalizedOut.startsWith(normalizedRoot) && !cliOpts.output) {
    log(`  Warning: config outputDir "${fileConf.outputDir}" resolves outside project root — falling back to default`);
    outputDir = path.join(projectRoot, '.puffin', 'cre');
  }

  const verbose = cliOpts.verbose || fileConf.verbose || base.verbose;

  return { projectRoot, exclude, include, outputDir, verbose };
}

module.exports = { resolveConfig, DEFAULT_CONFIG_FILENAME };
