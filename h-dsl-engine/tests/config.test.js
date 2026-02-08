/**
 * @module tests/config
 * Unit tests for config.js resolveConfig merge logic and validation.
 */

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { resolveConfig, DEFAULT_CONFIG_FILENAME } = require('../lib/config');

/** Collect log messages for assertion. */
function makeLog() {
  const messages = [];
  const log = (...args) => messages.push(args.join(' '));
  log.messages = messages;
  return log;
}

/** Create a temp directory to act as a fake project root. */
function makeTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hdsl-config-test-'));
}

// ---------------------------------------------------------------------------
// defaults only (no config file, no CLI overrides)
// ---------------------------------------------------------------------------

describe('resolveConfig — defaults only', () => {
  let tmpDir;
  let log;

  beforeEach(() => {
    tmpDir = makeTmpProject();
    log = makeLog();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns built-in defaults when no config file exists', () => {
    const result = resolveConfig({ project: tmpDir }, log);
    assert.deepEqual(result.exclude, ['node_modules', 'dist', '.git', 'coverage']);
    assert.deepEqual(result.include, []);
    assert.equal(result.outputDir, path.join(path.resolve(tmpDir), '.puffin', 'cre'));
    assert.equal(result.verbose, false);
  });

  it('resolves projectRoot to absolute path', () => {
    const result = resolveConfig({ project: tmpDir }, log);
    assert.ok(path.isAbsolute(result.projectRoot));
  });
});

// ---------------------------------------------------------------------------
// config file override
// ---------------------------------------------------------------------------

describe('resolveConfig — config file override', () => {
  let tmpDir;
  let log;

  beforeEach(() => {
    tmpDir = makeTmpProject();
    log = makeLog();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads .hdslrc.json from project root', () => {
    fs.writeFileSync(
      path.join(tmpDir, DEFAULT_CONFIG_FILENAME),
      JSON.stringify({ exclude: ['build'], include: ['*.ts'], verbose: true })
    );
    const result = resolveConfig({ project: tmpDir }, log);
    assert.deepEqual(result.exclude, ['build']);
    assert.deepEqual(result.include, ['*.ts']);
    assert.equal(result.verbose, true);
  });

  it('reads config from explicit --config path', () => {
    const customPath = path.join(tmpDir, 'custom.json');
    fs.writeFileSync(customPath, JSON.stringify({ exclude: ['vendor'] }));
    const result = resolveConfig({ project: tmpDir, config: customPath }, log);
    assert.deepEqual(result.exclude, ['vendor']);
  });

  it('resolves outputDir relative to project root', () => {
    fs.writeFileSync(
      path.join(tmpDir, DEFAULT_CONFIG_FILENAME),
      JSON.stringify({ outputDir: 'out/models' })
    );
    const result = resolveConfig({ project: tmpDir }, log);
    assert.equal(result.outputDir, path.resolve(tmpDir, 'out/models'));
  });
});

// ---------------------------------------------------------------------------
// CLI override (takes precedence over file)
// ---------------------------------------------------------------------------

describe('resolveConfig — CLI overrides file', () => {
  let tmpDir;
  let log;

  beforeEach(() => {
    tmpDir = makeTmpProject();
    log = makeLog();
    // Write a config file that CLI should override
    fs.writeFileSync(
      path.join(tmpDir, DEFAULT_CONFIG_FILENAME),
      JSON.stringify({ exclude: ['build'], include: ['*.ts'], outputDir: 'file-out', verbose: false })
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('CLI --exclude overrides file exclude', () => {
    const result = resolveConfig({ project: tmpDir, exclude: 'tmp,logs' }, log);
    assert.deepEqual(result.exclude, ['tmp', 'logs']);
  });

  it('CLI --include overrides file include', () => {
    const result = resolveConfig({ project: tmpDir, include: '*.js' }, log);
    assert.deepEqual(result.include, ['*.js']);
  });

  it('CLI --output overrides file outputDir', () => {
    const outPath = path.join(tmpDir, 'cli-out');
    const result = resolveConfig({ project: tmpDir, output: outPath }, log);
    assert.equal(result.outputDir, path.resolve(outPath));
  });

  it('CLI --verbose overrides file verbose', () => {
    const result = resolveConfig({ project: tmpDir, verbose: true }, log);
    assert.equal(result.verbose, true);
  });
});

// ---------------------------------------------------------------------------
// missing / malformed config file
// ---------------------------------------------------------------------------

describe('resolveConfig — missing and malformed config files', () => {
  let tmpDir;
  let log;

  beforeEach(() => {
    tmpDir = makeTmpProject();
    log = makeLog();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('falls back to defaults when config file is missing', () => {
    const result = resolveConfig({ project: tmpDir }, log);
    assert.deepEqual(result.exclude, ['node_modules', 'dist', '.git', 'coverage']);
    // No warning for ENOENT
    assert.ok(!log.messages.some(m => m.includes('Warning')));
  });

  it('falls back to defaults when config file contains invalid JSON', () => {
    fs.writeFileSync(path.join(tmpDir, DEFAULT_CONFIG_FILENAME), 'not json {{{');
    const result = resolveConfig({ project: tmpDir }, log);
    assert.deepEqual(result.exclude, ['node_modules', 'dist', '.git', 'coverage']);
    assert.ok(log.messages.some(m => m.includes('Warning')));
  });

  it('falls back to defaults when config file root is an array', () => {
    fs.writeFileSync(path.join(tmpDir, DEFAULT_CONFIG_FILENAME), '["a","b"]');
    const result = resolveConfig({ project: tmpDir }, log);
    assert.deepEqual(result.exclude, ['node_modules', 'dist', '.git', 'coverage']);
    assert.ok(log.messages.some(m => m.includes('must be a JSON object')));
  });
});

// ---------------------------------------------------------------------------
// validation: type checking
// ---------------------------------------------------------------------------

describe('resolveConfig — validation drops bad types', () => {
  let tmpDir;
  let log;

  beforeEach(() => {
    tmpDir = makeTmpProject();
    log = makeLog();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('drops exclude when not an array of strings', () => {
    fs.writeFileSync(path.join(tmpDir, DEFAULT_CONFIG_FILENAME), JSON.stringify({ exclude: 'wrong' }));
    const result = resolveConfig({ project: tmpDir }, log);
    // Should fall back to defaults
    assert.deepEqual(result.exclude, ['node_modules', 'dist', '.git', 'coverage']);
    assert.ok(log.messages.some(m => m.includes('"exclude" must be an array')));
  });

  it('drops outputDir when not a string', () => {
    fs.writeFileSync(path.join(tmpDir, DEFAULT_CONFIG_FILENAME), JSON.stringify({ outputDir: 123 }));
    const result = resolveConfig({ project: tmpDir }, log);
    assert.equal(result.outputDir, path.join(path.resolve(tmpDir), '.puffin', 'cre'));
  });

  it('drops verbose when not a boolean', () => {
    fs.writeFileSync(path.join(tmpDir, DEFAULT_CONFIG_FILENAME), JSON.stringify({ verbose: 'yes' }));
    const result = resolveConfig({ project: tmpDir }, log);
    assert.equal(result.verbose, false);
  });

  it('warns on unrecognized keys', () => {
    fs.writeFileSync(path.join(tmpDir, DEFAULT_CONFIG_FILENAME), JSON.stringify({ unknownKey: true }));
    resolveConfig({ project: tmpDir }, log);
    assert.ok(log.messages.some(m => m.includes('unrecognized config key "unknownKey"')));
  });
});

// ---------------------------------------------------------------------------
// path traversal guard
// ---------------------------------------------------------------------------

describe('resolveConfig — path traversal guard', () => {
  let tmpDir;
  let log;

  beforeEach(() => {
    tmpDir = makeTmpProject();
    log = makeLog();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects config outputDir that escapes project root', () => {
    fs.writeFileSync(
      path.join(tmpDir, DEFAULT_CONFIG_FILENAME),
      JSON.stringify({ outputDir: '../../escape' })
    );
    const result = resolveConfig({ project: tmpDir }, log);
    // Should fall back to default
    assert.equal(result.outputDir, path.join(path.resolve(tmpDir), '.puffin', 'cre'));
    assert.ok(log.messages.some(m => m.includes('outside project root')));
  });

  it('allows CLI --output outside project root (trusted)', () => {
    const outsidePath = path.join(os.tmpdir(), 'hdsl-outside-test');
    const result = resolveConfig({ project: tmpDir, output: outsidePath }, log);
    assert.equal(result.outputDir, path.resolve(outsidePath));
    assert.ok(!log.messages.some(m => m.includes('outside project root')));
  });
});
