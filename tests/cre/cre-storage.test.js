'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

const storage = require('../../src/main/cre/lib/cre-storage');
const { createBaseSchema, createEmptyInstance } = require('../../src/main/cre/lib/hdsl-types');

async function createTempProjectRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'cre-storage-test-'));
}

// ─────────────────────────────────────────────────────────────────────────────

describe('CRE Storage - initialize', () => {
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await createTempProjectRoot();
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('should create .puffin/cre/ directory', async () => {
    await storage.initialize(projectRoot);
    const stat = await fs.stat(path.join(projectRoot, '.puffin', 'cre'));
    assert.ok(stat.isDirectory());
  });

  it('should create .puffin/cre/plans/ directory', async () => {
    await storage.initialize(projectRoot);
    const stat = await fs.stat(path.join(projectRoot, '.puffin', 'cre', 'plans'));
    assert.ok(stat.isDirectory());
  });

  it('should create schema.json with base schema', async () => {
    const created = await storage.initialize(projectRoot);
    assert.equal(created.schema, true);

    const schema = await storage.readSchema(projectRoot);
    assert.equal(schema.version, '1.0.0');
    assert.ok(schema.elementTypes);
    assert.ok(schema.elementTypes.module);
    assert.ok(schema.elementTypes.function);
    assert.ok(schema.elementTypes.dependency);
    assert.ok(schema.elementTypes.flow);
  });

  it('should create instance.json with empty instance', async () => {
    const created = await storage.initialize(projectRoot);
    assert.equal(created.instance, true);

    const instance = await storage.readInstance(projectRoot);
    assert.equal(instance.schemaVersion, '1.0.0');
    assert.deepEqual(instance.artifacts, {});
    assert.deepEqual(instance.dependencies, []);
    assert.deepEqual(instance.flows, {});
  });

  it('should create memo.json as empty object', async () => {
    const created = await storage.initialize(projectRoot);
    assert.equal(created.memo, true);

    const memo = await storage.readMemo(projectRoot);
    assert.deepEqual(memo, {});
  });

  it('should not overwrite existing files on re-init', async () => {
    await storage.initialize(projectRoot);

    // Write custom data to schema
    const customSchema = { version: 'custom', elementTypes: {} };
    await storage.writeSchema(projectRoot, customSchema);

    // Re-initialize
    const created = await storage.initialize(projectRoot);
    assert.equal(created.schema, false);
    assert.equal(created.instance, false);
    assert.equal(created.memo, false);

    // Custom data should be preserved
    const schema = await storage.readSchema(projectRoot);
    assert.equal(schema.version, 'custom');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('CRE Storage - readJson error handling', () => {
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await createTempProjectRoot();
    await storage.initialize(projectRoot);
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('should throw descriptive error for missing file', async () => {
    await assert.rejects(
      () => storage.readJson(projectRoot, 'nonexistent.json'),
      { message: /CRE file not found: nonexistent\.json/ }
    );
  });

  it('should throw descriptive error for malformed JSON', async () => {
    const filePath = path.join(storage.crePath(projectRoot), 'bad.json');
    await fs.writeFile(filePath, '{invalid json!!!', 'utf-8');

    await assert.rejects(
      () => storage.readJson(projectRoot, 'bad.json'),
      { message: /CRE file contains invalid JSON: bad\.json/ }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('CRE Storage - writeJson atomic writes', () => {
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await createTempProjectRoot();
    await storage.initialize(projectRoot);
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('should write and read back data correctly', async () => {
    const data = { test: true, value: 42 };
    await storage.writeJson(projectRoot, 'test.json', data);
    const result = await storage.readJson(projectRoot, 'test.json');
    assert.deepEqual(result, data);
  });

  it('should not leave .tmp files after successful write', async () => {
    await storage.writeJson(projectRoot, 'test.json', { ok: true });
    const creDir = storage.crePath(projectRoot);
    const files = await fs.readdir(creDir);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    assert.equal(tmpFiles.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('CRE Storage - plan operations', () => {
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await createTempProjectRoot();
    await storage.initialize(projectRoot);
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('should write and read a plan by sprint ID', async () => {
    const plan = { sprintId: 'sp-1', stories: ['s1', 's2'] };
    await storage.writePlan(projectRoot, 'sp-1', plan);
    const result = await storage.readPlan(projectRoot, 'sp-1');
    assert.deepEqual(result, plan);
  });

  it('should list plan files', async () => {
    await storage.writePlan(projectRoot, 'sp-1', { id: 'sp-1' });
    await storage.writePlan(projectRoot, 'sp-2', { id: 'sp-2' });
    const plans = await storage.listPlans(projectRoot);
    assert.ok(plans.includes('sp-1'));
    assert.ok(plans.includes('sp-2'));
    assert.equal(plans.length, 2);
  });

  it('should return empty array when no plans exist', async () => {
    const plans = await storage.listPlans(projectRoot);
    assert.deepEqual(plans, []);
  });

  it('should throw for nonexistent plan', async () => {
    await assert.rejects(
      () => storage.readPlan(projectRoot, 'nonexistent'),
      { message: /CRE file not found/ }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('CRE Storage - schema/instance/memo CRUD', () => {
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await createTempProjectRoot();
    await storage.initialize(projectRoot);
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('should round-trip schema', async () => {
    const schema = createBaseSchema();
    schema.version = '2.0.0';
    await storage.writeSchema(projectRoot, schema);
    const result = await storage.readSchema(projectRoot);
    assert.equal(result.version, '2.0.0');
  });

  it('should round-trip instance', async () => {
    const instance = createEmptyInstance();
    instance.artifacts = { 'src/main.js': { kind: 'module' } };
    await storage.writeInstance(projectRoot, instance);
    const result = await storage.readInstance(projectRoot);
    assert.ok(result.artifacts['src/main.js']);
  });

  it('should round-trip memo', async () => {
    const memo = { lastQuery: 'test', cache: [1, 2, 3] };
    await storage.writeMemo(projectRoot, memo);
    const result = await storage.readMemo(projectRoot);
    assert.deepEqual(result, memo);
  });
});
