'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  getDefaultCreConfig,
  ensureCreConfig,
  getCreConfig
} = require('../../src/main/cre/lib/cre-config');

describe('getDefaultCreConfig', () => {
  it('should return all required defaults (AC1-AC8)', () => {
    const defaults = getDefaultCreConfig();

    // AC1: CRE config section exists
    assert.ok(defaults);

    // AC2: codeModelPath
    assert.equal(defaults.codeModelPath, '.puffin/cre');

    // AC3: maxPlanIterations
    assert.equal(defaults.maxPlanIterations, 5);

    // AC4: risMaxLength
    assert.equal(defaults.risMaxLength, 5000);

    // AC5: introspection.autoAfterMerge
    assert.equal(defaults.introspection.autoAfterMerge, true);

    // AC6: introspection.excludePatterns
    assert.deepEqual(defaults.introspection.excludePatterns, [
      'node_modules/**',
      'dist/**',
      '.git/**'
    ]);

    // AC7: schema.allowAutoExtension
    assert.equal(defaults.schema.allowAutoExtension, true);

    // AC8: schema.extensionApprovalRequired
    assert.equal(defaults.schema.extensionApprovalRequired, false);
  });

  it('should include enabled flag', () => {
    assert.equal(getDefaultCreConfig().enabled, true);
  });
});

describe('ensureCreConfig', () => {
  it('should add cre section to empty config', () => {
    const config = {};
    ensureCreConfig(config);
    assert.ok(config.cre);
    assert.equal(config.cre.codeModelPath, '.puffin/cre');
  });

  it('should not overwrite existing user values', () => {
    const config = {
      cre: {
        codeModelPath: '/custom/path',
        maxPlanIterations: 10,
        risMaxLength: 8000
      }
    };
    ensureCreConfig(config);
    assert.equal(config.cre.codeModelPath, '/custom/path');
    assert.equal(config.cre.maxPlanIterations, 10);
    assert.equal(config.cre.risMaxLength, 8000);
  });

  it('should backfill missing nested fields', () => {
    const config = {
      cre: {
        introspection: { autoAfterMerge: false },
        schema: {}
      }
    };
    ensureCreConfig(config);
    // User value preserved
    assert.equal(config.cre.introspection.autoAfterMerge, false);
    // Missing field backfilled
    assert.deepEqual(config.cre.introspection.excludePatterns, ['node_modules/**', 'dist/**', '.git/**']);
    assert.equal(config.cre.schema.allowAutoExtension, true);
    assert.equal(config.cre.schema.extensionApprovalRequired, false);
  });

  it('should backfill entirely missing introspection/schema sections', () => {
    const config = { cre: { codeModelPath: '.puffin/cre' } };
    ensureCreConfig(config);
    assert.ok(config.cre.introspection);
    assert.ok(config.cre.schema);
    assert.equal(config.cre.introspection.autoAfterMerge, true);
    assert.equal(config.cre.schema.allowAutoExtension, true);
  });

  it('should return the config object', () => {
    const config = {};
    const result = ensureCreConfig(config);
    assert.equal(result, config);
  });
});

describe('getCreConfig', () => {
  it('should return cre section from config', () => {
    const config = { cre: { codeModelPath: '/test' } };
    const cre = getCreConfig(config);
    assert.equal(cre.codeModelPath, '/test');
    // Backfilled
    assert.equal(cre.maxPlanIterations, 5);
  });

  it('should create cre section if missing', () => {
    const config = {};
    const cre = getCreConfig(config);
    assert.equal(cre.codeModelPath, '.puffin/cre');
  });
});

describe('CRE getConfig via index module (AC9)', () => {
  it('should return defaults when not initialized', () => {
    // Test the exported getConfig function from index.js
    const cre = require('../../src/main/cre/index');
    const config = cre.getConfig();
    assert.equal(config.codeModelPath, '.puffin/cre');
    assert.equal(config.maxPlanIterations, 5);
    assert.equal(config.risMaxLength, 5000);
  });
});
