'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { withRetry, validateAndFilter, markStaleArtifacts, detectPlanCycles } = require('../../src/main/cre/lib/cre-errors');
const { createBaseSchema, createEmptyInstance } = require('../../src/main/cre/lib/hdsl-types');

// ─────────────────────────────────────────────────────────────────────────────

describe('withRetry', () => {
  it('should return result on first success', async () => {
    const result = await withRetry(async () => 42, { delayMs: 10, label: 'test' });
    assert.equal(result, 42);
  });

  it('should retry once and return result on second success', async () => {
    let attempt = 0;
    const result = await withRetry(async () => {
      attempt++;
      if (attempt === 1) throw new Error('first fail');
      return 'ok';
    }, { delayMs: 10, label: 'test' });
    assert.equal(result, 'ok');
    assert.equal(attempt, 2);
  });

  it('should throw after retry fails', async () => {
    await assert.rejects(
      () => withRetry(async () => { throw new Error('always fails'); }, { delayMs: 10, label: 'test' }),
      { message: 'always fails' }
    );
  });

  it('should use custom delay', async () => {
    const start = Date.now();
    let attempt = 0;
    await withRetry(async () => {
      attempt++;
      if (attempt === 1) throw new Error('fail');
      return 'ok';
    }, { delayMs: 50, label: 'test' });
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 40, `Expected >= 40ms delay, got ${elapsed}ms`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('validateAndFilter', () => {
  it('should return instance unchanged when valid', () => {
    const schema = createBaseSchema();
    const instance = createEmptyInstance();
    instance.artifacts = {
      'src/main.js': { type: 'module', path: 'src/main.js', kind: 'module', summary: 'Entry point' }
    };

    const { filtered, warnings } = validateAndFilter(instance, schema);
    assert.equal(warnings.length, 0);
    assert.ok(filtered.artifacts['src/main.js']);
  });

  it('should skip artifacts with invalid type', () => {
    const schema = createBaseSchema();
    const instance = createEmptyInstance();
    instance.artifacts = {
      'good.js': { type: 'module', path: 'good.js', kind: 'module', summary: 'Good' },
      'bad.js': { type: 'nonexistent_type', path: 'bad.js', kind: 'x', summary: 'Bad' }
    };

    const { filtered, warnings } = validateAndFilter(instance, schema);
    assert.ok(filtered.artifacts['good.js'], 'Good artifact should remain');
    assert.ok(!filtered.artifacts['bad.js'], 'Bad artifact should be filtered');
    assert.ok(warnings.length > 0);
  });

  it('should skip dependencies with validation errors', () => {
    const schema = createBaseSchema();
    const instance = createEmptyInstance();
    // dependency missing required 'from' field
    instance.dependencies = [
      { from: 'a', to: 'b', kind: 'imports' },
      { to: 'c', kind: 'imports' } // missing 'from'
    ];

    const { filtered, warnings } = validateAndFilter(instance, schema);
    assert.equal(filtered.dependencies.length, 1);
    assert.equal(filtered.dependencies[0].from, 'a');
    assert.ok(warnings.length > 0);
  });

  it('should handle null instance gracefully', () => {
    const { filtered, warnings } = validateAndFilter(null, createBaseSchema());
    assert.ok(filtered);
    assert.equal(warnings.length, 0);
  });

  it('should handle null schema gracefully', () => {
    const instance = createEmptyInstance();
    const { filtered, warnings } = validateAndFilter(instance, null);
    assert.equal(filtered, instance);
    assert.equal(warnings.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('markStaleArtifacts', () => {
  it('should mark artifacts with missing file paths as stale', () => {
    const instance = {
      artifacts: {
        'src/main.js': { path: 'src/main.js', type: 'module', summary: 'Entry' },
        'src/deleted.js': { path: 'src/deleted.js', type: 'module', summary: 'Gone' }
      },
      dependencies: [],
      flows: {}
    };

    const existingFiles = new Set(['src/main.js']);
    const { instance: result, staleCount } = markStaleArtifacts(instance, existingFiles);

    assert.equal(staleCount, 1);
    assert.equal(result.artifacts['src/main.js']._stale, undefined);
    assert.equal(result.artifacts['src/deleted.js']._stale, true);
  });

  it('should clear stale flag when file reappears', () => {
    const instance = {
      artifacts: {
        'src/back.js': { path: 'src/back.js', type: 'module', summary: 'Back', _stale: true }
      },
      dependencies: [],
      flows: {}
    };

    const { instance: result, staleCount } = markStaleArtifacts(instance, ['src/back.js']);
    assert.equal(staleCount, 0);
    assert.equal(result.artifacts['src/back.js']._stale, undefined);
  });

  it('should mark dependencies to stale artifacts', () => {
    const instance = {
      artifacts: {
        'a.js': { path: 'a.js', type: 'module', summary: 'A' },
        'b.js': { path: 'b.js', type: 'module', summary: 'B' }
      },
      dependencies: [
        { from: 'a.js', to: 'b.js', kind: 'imports' }
      ],
      flows: {}
    };

    // b.js doesn't exist
    markStaleArtifacts(instance, ['a.js']);
    assert.equal(instance.dependencies[0]._stale, true);
  });

  it('should handle null instance', () => {
    const { instance, staleCount } = markStaleArtifacts(null, []);
    assert.ok(instance);
    assert.equal(staleCount, 0);
  });

  it('should accept array of files', () => {
    const instance = {
      artifacts: { 'x.js': { path: 'x.js', type: 'module', summary: 'X' } },
      dependencies: [],
      flows: {}
    };
    const { staleCount } = markStaleArtifacts(instance, ['x.js']);
    assert.equal(staleCount, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('detectPlanCycles', () => {
  it('should detect no cycle in linear dependencies', () => {
    const stories = [
      { id: 's1', title: 'Story 1', dependsOn: [] },
      { id: 's2', title: 'Story 2', dependsOn: ['s1'] },
      { id: 's3', title: 'Story 3', dependsOn: ['s2'] }
    ];
    const { hasCycle, sorted } = detectPlanCycles(stories);
    assert.equal(hasCycle, false);
    assert.deepEqual(sorted, ['s1', 's2', 's3']);
  });

  it('should detect a simple cycle', () => {
    const stories = [
      { id: 's1', dependsOn: ['s2'] },
      { id: 's2', dependsOn: ['s1'] }
    ];
    const { hasCycle, cycle } = detectPlanCycles(stories);
    assert.equal(hasCycle, true);
    assert.equal(cycle.length, 2);
  });

  it('should detect cycle in larger graph', () => {
    const stories = [
      { id: 's1', dependsOn: [] },
      { id: 's2', dependsOn: ['s1'] },
      { id: 's3', dependsOn: ['s4'] },
      { id: 's4', dependsOn: ['s3'] }  // cycle between s3 and s4
    ];
    const { hasCycle, cycle, sorted } = detectPlanCycles(stories);
    assert.equal(hasCycle, true);
    assert.ok(cycle.length === 2);
    // s1 and s2 should still be in sorted
    assert.ok(sorted.includes('s1'));
    assert.ok(sorted.includes('s2'));
  });

  it('should handle stories with no dependencies', () => {
    const stories = [
      { id: 's1' },
      { id: 's2' }
    ];
    const { hasCycle, sorted } = detectPlanCycles(stories);
    assert.equal(hasCycle, false);
    assert.equal(sorted.length, 2);
  });

  it('should handle empty array', () => {
    const { hasCycle } = detectPlanCycles([]);
    assert.equal(hasCycle, false);
  });

  it('should handle null', () => {
    const { hasCycle } = detectPlanCycles(null);
    assert.equal(hasCycle, false);
  });

  it('should ignore external dependencies not in story list', () => {
    const stories = [
      { id: 's1', dependsOn: ['external-lib'] },
      { id: 's2', dependsOn: ['s1'] }
    ];
    const { hasCycle, sorted } = detectPlanCycles(stories);
    assert.equal(hasCycle, false);
    assert.deepEqual(sorted, ['s1', 's2']);
  });

  it('should use title in cycle labels when available', () => {
    const stories = [
      { id: 's1', title: 'Auth Feature', dependsOn: ['s2'] },
      { id: 's2', title: 'Login Page', dependsOn: ['s1'] }
    ];
    const { cycle } = detectPlanCycles(stories);
    assert.ok(cycle.includes('Auth Feature') || cycle.includes('Login Page'));
  });
});
