'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { AssertionGenerator, AssertionType, AssertionResult, isSafeRegex } = require('../../src/main/cre/assertion-generator');

// ─── Test helpers ────────────────────────────────────────────────────────────

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cre-assert-test-'));
}

function createMockDb() {
  const rows = [];
  return {
    _rows: rows,
    prepare: (sql) => ({
      run: (...args) => {
        rows.push({ sql, args });
        return { changes: 1 };
      },
      get: (id) => rows.find(r => r.args && r.args[0] === id) || null,
      all: (id) => rows.filter(r => r.sql.includes('SELECT') && r.args && r.args[0] === id).map(() => null)
    })
  };
}

/** DB mock that actually stores and retrieves assertion rows. */
function createTrackingDb() {
  const store = new Map();
  return {
    _store: store,
    prepare: (sql) => {
      if (sql.includes('INSERT')) {
        return {
          run: (id, planId, storyId, type, target, message, assertionData, createdAt) => {
            store.set(id, { id, plan_id: planId, story_id: storyId, type, target, message, assertion_data: assertionData, result: 'pending', created_at: createdAt, verified_at: null });
            return { changes: 1 };
          }
        };
      }
      if (sql.includes('UPDATE')) {
        return {
          run: (result, verifiedAt, id) => {
            const row = store.get(id);
            if (row) { row.result = result; row.verified_at = verifiedAt; }
            return { changes: row ? 1 : 0 };
          }
        };
      }
      if (sql.includes('SELECT') && sql.includes('plan_id')) {
        return {
          all: (planId) => [...store.values()].filter(r => r.plan_id === planId)
        };
      }
      if (sql.includes('SELECT') && sql.includes('story_id')) {
        return {
          all: (storyId) => [...store.values()].filter(r => r.story_id === storyId)
        };
      }
      return { run: () => ({ changes: 0 }), all: () => [], get: () => null };
    }
  };
}

const sampleStory = {
  id: 'story-1',
  title: 'Implement Widget',
  description: 'Create a widget component',
  acceptanceCriteria: ['Widget renders correctly', 'Widget handles clicks']
};

const samplePlanItem = {
  storyId: 'story-1',
  title: 'Implement Widget',
  approach: 'Create React component with click handler',
  filesCreated: ['src/components/widget.js'],
  filesModified: ['src/index.js']
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AssertionType and AssertionResult enums', () => {
  it('should define 4 assertion types (AC3)', () => {
    assert.equal(AssertionType.FILE_EXISTS, 'file_exists');
    assert.equal(AssertionType.FUNCTION_EXISTS, 'function_exists');
    assert.equal(AssertionType.EXPORT_EXISTS, 'export_exists');
    assert.equal(AssertionType.PATTERN_MATCH, 'pattern_match');
  });

  it('should define 3 result states', () => {
    assert.equal(AssertionResult.PASS, 'pass');
    assert.equal(AssertionResult.FAIL, 'fail');
    assert.equal(AssertionResult.PENDING, 'pending');
  });
});

describe('AssertionGenerator - generate (AC2)', () => {
  let gen, db, projectRoot;

  beforeEach(() => {
    projectRoot = createTempDir();
    db = createMockDb();
    gen = new AssertionGenerator({ db, projectRoot });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('should return a prompt with system, task, constraints', async () => {
    const result = await gen.generate({ planItem: samplePlanItem, story: sampleStory, planId: 'plan-1' });
    assert.ok(result.prompt);
    assert.ok(result.prompt.system);
    assert.ok(result.prompt.task);
    assert.ok(result.prompt.constraints);
  });

  it('should store provided assertions in DB (AC5)', async () => {
    const assertions = [
      { type: 'file_exists', target: 'src/widget.js', message: 'Widget file exists', assertion: { kind: 'file' } }
    ];
    const result = await gen.generate({ planItem: samplePlanItem, story: sampleStory, planId: 'plan-1', assertions });
    assert.equal(result.assertions.length, 1);
    assert.equal(result.assertions[0].type, 'file_exists');
    assert.equal(result.assertions[0].result, 'pending');
    // DB should have an INSERT
    assert.ok(db._rows.some(r => r.sql.includes('INSERT')));
  });

  it('should return empty assertions array when none provided', async () => {
    const result = await gen.generate({ planItem: samplePlanItem, story: sampleStory, planId: 'plan-1' });
    assert.deepEqual(result.assertions, []);
  });

  it('should throw on missing required params', async () => {
    await assert.rejects(() => gen.generate({}), { message: /planItem, story, and planId are required/ });
    await assert.rejects(() => gen.generate({ planItem: { approach: 'test' }, story: {}, planId: 'p1' }), { message: /storyId is required/ });
  });

  it('should reject unsupported assertion type (AC3)', async () => {
    const assertions = [{ type: 'invalid_type', target: 'foo.js', message: 'bad' }];
    await assert.rejects(
      () => gen.generate({ planItem: samplePlanItem, story: sampleStory, planId: 'plan-1', assertions }),
      { message: /Unsupported assertion type/ }
    );
  });

  it('should reject assertion without target', async () => {
    const assertions = [{ type: 'file_exists', message: 'no target' }];
    await assert.rejects(
      () => gen.generate({ planItem: samplePlanItem, story: sampleStory, planId: 'plan-1', assertions }),
      { message: /target is required/ }
    );
  });
});

describe('AssertionGenerator - verify file_exists (AC4)', () => {
  let gen, db, projectRoot;

  beforeEach(() => {
    projectRoot = createTempDir();
    db = createMockDb();
    gen = new AssertionGenerator({ db, projectRoot });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('should pass when file exists', async () => {
    fs.writeFileSync(path.join(projectRoot, 'exists.js'), 'content');
    const results = await gen.verify([
      { id: 'a1', type: 'file_exists', target: 'exists.js', assertion: { kind: 'file' } }
    ]);
    assert.equal(results[0].result, 'pass');
    assert.ok(results[0].verifiedAt);
  });

  it('should fail when file missing', async () => {
    const results = await gen.verify([
      { id: 'a2', type: 'file_exists', target: 'missing.js', assertion: { kind: 'file' } }
    ]);
    assert.equal(results[0].result, 'fail');
  });

  it('should check directory kind', async () => {
    fs.mkdirSync(path.join(projectRoot, 'subdir'));
    const results = await gen.verify([
      { id: 'a3', type: 'file_exists', target: 'subdir', assertion: { kind: 'directory' } }
    ]);
    assert.equal(results[0].result, 'pass');
  });

  it('should fail when expecting directory but found file', async () => {
    fs.writeFileSync(path.join(projectRoot, 'afile'), 'x');
    const results = await gen.verify([
      { id: 'a4', type: 'file_exists', target: 'afile', assertion: { kind: 'directory' } }
    ]);
    assert.equal(results[0].result, 'fail');
  });
});

describe('AssertionGenerator - verify function_exists (AC4)', () => {
  let gen, db, projectRoot;

  beforeEach(() => {
    projectRoot = createTempDir();
    db = createMockDb();
    gen = new AssertionGenerator({ db, projectRoot });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('should pass when function is declared', async () => {
    fs.writeFileSync(path.join(projectRoot, 'mod.js'), 'function doStuff() { return 1; }');
    const results = await gen.verify([
      { id: 'f1', type: 'function_exists', target: 'mod.js', assertion: { name: 'doStuff' } }
    ]);
    assert.equal(results[0].result, 'pass');
  });

  it('should pass for async function', async () => {
    fs.writeFileSync(path.join(projectRoot, 'async.js'), 'async function fetchData() {}');
    const results = await gen.verify([
      { id: 'f2', type: 'function_exists', target: 'async.js', assertion: { name: 'fetchData' } }
    ]);
    assert.equal(results[0].result, 'pass');
  });

  it('should fail when function not found', async () => {
    fs.writeFileSync(path.join(projectRoot, 'empty.js'), 'const x = 1;');
    const results = await gen.verify([
      { id: 'f3', type: 'function_exists', target: 'empty.js', assertion: { name: 'missingFn' } }
    ]);
    assert.equal(results[0].result, 'fail');
  });

  it('should fail when file missing', async () => {
    const results = await gen.verify([
      { id: 'f4', type: 'function_exists', target: 'nope.js', assertion: { name: 'foo' } }
    ]);
    assert.equal(results[0].result, 'fail');
  });
});

describe('AssertionGenerator - verify export_exists (AC4)', () => {
  let gen, db, projectRoot;

  beforeEach(() => {
    projectRoot = createTempDir();
    db = createMockDb();
    gen = new AssertionGenerator({ db, projectRoot });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('should pass for CommonJS exports', async () => {
    fs.writeFileSync(path.join(projectRoot, 'cjs.js'), 'module.exports = { Foo, bar };');
    const results = await gen.verify([
      { id: 'e1', type: 'export_exists', target: 'cjs.js', assertion: { exports: [{ name: 'Foo', kind: 'class' }] } }
    ]);
    assert.equal(results[0].result, 'pass');
  });

  it('should pass for exports.name pattern', async () => {
    fs.writeFileSync(path.join(projectRoot, 'named.js'), 'exports.doThing = function() {};');
    const results = await gen.verify([
      { id: 'e2', type: 'export_exists', target: 'named.js', assertion: { exports: [{ name: 'doThing', kind: 'function' }] } }
    ]);
    assert.equal(results[0].result, 'pass');
  });

  it('should fail when export missing', async () => {
    fs.writeFileSync(path.join(projectRoot, 'no.js'), 'module.exports = { alpha };');
    const results = await gen.verify([
      { id: 'e3', type: 'export_exists', target: 'no.js', assertion: { exports: [{ name: 'beta', kind: 'const' }] } }
    ]);
    assert.equal(results[0].result, 'fail');
  });

  it('should require all exports present', async () => {
    fs.writeFileSync(path.join(projectRoot, 'partial.js'), 'module.exports = { one };');
    const results = await gen.verify([
      { id: 'e4', type: 'export_exists', target: 'partial.js', assertion: { exports: [{ name: 'one' }, { name: 'two' }] } }
    ]);
    assert.equal(results[0].result, 'fail');
  });
});

describe('AssertionGenerator - verify pattern_match (AC4)', () => {
  let gen, db, projectRoot;

  beforeEach(() => {
    projectRoot = createTempDir();
    db = createMockDb();
    gen = new AssertionGenerator({ db, projectRoot });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('should pass when pattern is present', async () => {
    fs.writeFileSync(path.join(projectRoot, 'code.js'), 'class Widget extends Component {}');
    const results = await gen.verify([
      { id: 'p1', type: 'pattern_match', target: 'code.js', assertion: { pattern: 'class\\s+Widget', operator: 'present' } }
    ]);
    assert.equal(results[0].result, 'pass');
  });

  it('should fail when pattern is absent but expected present', async () => {
    fs.writeFileSync(path.join(projectRoot, 'code2.js'), 'const x = 1;');
    const results = await gen.verify([
      { id: 'p2', type: 'pattern_match', target: 'code2.js', assertion: { pattern: 'class\\s+Widget', operator: 'present' } }
    ]);
    assert.equal(results[0].result, 'fail');
  });

  it('should pass when pattern is absent and operator is absent', async () => {
    fs.writeFileSync(path.join(projectRoot, 'clean.js'), 'const x = 1;');
    const results = await gen.verify([
      { id: 'p3', type: 'pattern_match', target: 'clean.js', assertion: { pattern: 'debugger', operator: 'absent' } }
    ]);
    assert.equal(results[0].result, 'pass');
  });

  it('should fail when pattern is present but operator is absent', async () => {
    fs.writeFileSync(path.join(projectRoot, 'debug.js'), 'debugger; const x = 1;');
    const results = await gen.verify([
      { id: 'p4', type: 'pattern_match', target: 'debug.js', assertion: { pattern: 'debugger', operator: 'absent' } }
    ]);
    assert.equal(results[0].result, 'fail');
  });
});

describe('isSafeRegex - ReDoS guard (F001)', () => {
  it('should accept simple patterns', () => {
    assert.equal(isSafeRegex('class\\s+Widget'), true);
    assert.equal(isSafeRegex('function\\s+\\w+'), true);
    assert.equal(isSafeRegex('debugger'), true);
  });

  it('should reject nested quantifiers like (a+)+', () => {
    assert.equal(isSafeRegex('(a+)+'), false);
    assert.equal(isSafeRegex('(a*)*'), false);
    assert.equal(isSafeRegex('(x+){2,}'), false);
  });

  it('should reject overlapping alternation with quantifiers', () => {
    assert.equal(isSafeRegex('(a+|b+)+'), false);
    assert.equal(isSafeRegex('(x*|y*)*'), false);
  });

  it('should reject patterns exceeding max length', () => {
    assert.equal(isSafeRegex('a'.repeat(201)), false);
    assert.equal(isSafeRegex('a'.repeat(200)), true);
  });
});

describe('AssertionGenerator - ReDoS protection in verify (F001)', () => {
  let gen, db, projectRoot;

  beforeEach(() => {
    projectRoot = createTempDir();
    db = createMockDb();
    gen = new AssertionGenerator({ db, projectRoot });
    fs.writeFileSync(path.join(projectRoot, 'target.js'), 'some content');
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('should fail for unsafe regex patterns instead of hanging', async () => {
    const results = await gen.verify([
      { id: 'r1', type: 'pattern_match', target: 'target.js', assertion: { pattern: '(a+)+', operator: 'present' } }
    ]);
    assert.equal(results[0].result, 'fail');
  });
});

describe('AssertionGenerator - path traversal protection (F002)', () => {
  let gen, db, projectRoot;

  beforeEach(() => {
    projectRoot = createTempDir();
    db = createMockDb();
    gen = new AssertionGenerator({ db, projectRoot });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('should fail for targets with ../ path traversal', async () => {
    const results = await gen.verify([
      { id: 'pt1', type: 'file_exists', target: '../../../etc/passwd', assertion: { kind: 'file' } }
    ]);
    assert.equal(results[0].result, 'fail');
  });

  it('should fail for absolute paths outside project root', async () => {
    const results = await gen.verify([
      { id: 'pt2', type: 'file_exists', target: '/etc/passwd', assertion: { kind: 'file' } }
    ]);
    assert.equal(results[0].result, 'fail');
  });

  it('should allow targets within project root', async () => {
    fs.writeFileSync(path.join(projectRoot, 'safe.js'), 'ok');
    const results = await gen.verify([
      { id: 'pt3', type: 'file_exists', target: 'safe.js', assertion: { kind: 'file' } }
    ]);
    assert.equal(results[0].result, 'pass');
  });
});

describe('AssertionGenerator - DB persistence (AC5, AC6)', () => {
  let gen, db, projectRoot;

  beforeEach(() => {
    projectRoot = createTempDir();
    db = createTrackingDb();
    gen = new AssertionGenerator({ db, projectRoot });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('should store assertions with pending result on generate', async () => {
    const assertions = [
      { type: 'file_exists', target: 'src/a.js', message: 'File A exists', assertion: { kind: 'file' } },
      { type: 'function_exists', target: 'src/a.js', message: 'fn exists', assertion: { name: 'init' } }
    ];
    await gen.generate({ planItem: samplePlanItem, story: sampleStory, planId: 'plan-1', assertions });
    assert.equal(db._store.size, 2);
    for (const row of db._store.values()) {
      assert.equal(row.result, 'pending');
      assert.equal(row.plan_id, 'plan-1');
      assert.equal(row.story_id, 'story-1');
    }
  });

  it('should update result and verifiedAt on verify (AC6)', async () => {
    fs.writeFileSync(path.join(projectRoot, 'real.js'), 'function init() {}');
    const assertions = [
      { type: 'file_exists', target: 'real.js', message: 'exists', assertion: { kind: 'file' } }
    ];
    const { assertions: stored } = await gen.generate({ planItem: samplePlanItem, story: sampleStory, planId: 'plan-2', assertions });

    const results = await gen.verify(stored);
    assert.equal(results[0].result, 'pass');
    assert.ok(results[0].verifiedAt);
    // DB should have been updated
    const row = db._store.get(stored[0].id);
    assert.equal(row.result, 'pass');
    assert.ok(row.verified_at);
  });

  it('getByPlan retrieves assertions for a plan', async () => {
    const assertions = [
      { type: 'file_exists', target: 'a.js', message: 'A', assertion: {} }
    ];
    await gen.generate({ planItem: samplePlanItem, story: sampleStory, planId: 'plan-3', assertions });
    const retrieved = gen.getByPlan('plan-3');
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0].plan_id, 'plan-3');
  });

  it('getByStory retrieves assertions for a story', async () => {
    const assertions = [
      { type: 'file_exists', target: 'b.js', message: 'B', assertion: {} }
    ];
    await gen.generate({ planItem: samplePlanItem, story: sampleStory, planId: 'plan-4', assertions });
    const retrieved = gen.getByStory('story-1');
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0].story_id, 'story-1');
  });
});

describe('AssertionGenerator - multiple assertions verify (AC4)', () => {
  let gen, db, projectRoot;

  beforeEach(() => {
    projectRoot = createTempDir();
    db = createMockDb();
    gen = new AssertionGenerator({ db, projectRoot });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('should verify mixed pass/fail results', async () => {
    fs.writeFileSync(path.join(projectRoot, 'exists.js'), 'function hello() {}');
    const assertions = [
      { id: 'm1', type: 'file_exists', target: 'exists.js', assertion: { kind: 'file' } },
      { id: 'm2', type: 'file_exists', target: 'missing.js', assertion: { kind: 'file' } },
      { id: 'm3', type: 'function_exists', target: 'exists.js', assertion: { name: 'hello' } },
      { id: 'm4', type: 'function_exists', target: 'exists.js', assertion: { name: 'nope' } }
    ];
    const results = await gen.verify(assertions);
    assert.equal(results[0].result, 'pass');
    assert.equal(results[1].result, 'fail');
    assert.equal(results[2].result, 'pass');
    assert.equal(results[3].result, 'fail');
  });
});

// ─── Regression: assertions must be available for user_stories persistence ────
// Bug: CRE-generated assertions were stored in inspection_assertions table
// but never written to user_stories.inspection_assertions column, causing
// "0 inspection assertions" when evaluation was triggered on story completion.
describe('AssertionGenerator - regression: assertions returned for user_stories persistence', () => {
  let gen, db, projectRoot;

  beforeEach(() => {
    projectRoot = createTempDir();
    db = createTrackingDb();
    gen = new AssertionGenerator({ db, projectRoot });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('should return generated assertions array that can be persisted to user_stories', async () => {
    const assertions = [
      { type: 'file_exists', target: 'src/widget.js', message: 'Widget file exists', assertion: { kind: 'file' } },
      { type: 'function_exists', target: 'src/widget.js', message: 'render function exists', assertion: { name: 'render' } }
    ];
    const result = await gen.generate({
      planItem: samplePlanItem,
      story: sampleStory,
      planId: 'plan-regression-1',
      assertions
    });

    // The returned assertions array must have the shape needed for user_stories persistence
    assert.ok(Array.isArray(result.assertions), 'generate() must return assertions array');
    assert.equal(result.assertions.length, 2, 'All valid assertions should be returned');

    // Each assertion must have the fields the UI reads
    for (const a of result.assertions) {
      assert.ok(a.id, 'assertion must have id');
      assert.ok(a.type, 'assertion must have type');
      assert.ok(a.target, 'assertion must have target');
      assert.ok(a.message !== undefined, 'assertion must have message');
      assert.ok(a.storyId, 'assertion must have storyId for DB association');
      assert.equal(a.result, 'pending', 'new assertions must have pending result');
    }
  });

  it('should return empty array (not undefined/null) when AI generation unavailable', async () => {
    // No claudeService and no provided assertions → AI path returns []
    const result = await gen.generate({
      planItem: samplePlanItem,
      story: sampleStory,
      planId: 'plan-regression-2'
    });

    assert.ok(Array.isArray(result.assertions), 'assertions must be an array even when empty');
    assert.equal(result.assertions.length, 0, 'empty array when no AI and no provided assertions');
  });

  it('should store assertions in inspection_assertions table AND return them for user_stories', async () => {
    const assertions = [
      { type: 'file_exists', target: 'src/main.js', message: 'Main file', assertion: { kind: 'file' } }
    ];
    const result = await gen.generate({
      planItem: samplePlanItem,
      story: sampleStory,
      planId: 'plan-regression-3',
      assertions
    });

    // Assertions in inspection_assertions table (via _storeAssertion)
    assert.equal(db._store.size, 1, 'assertion stored in inspection_assertions table');

    // Same assertions returned for user_stories persistence
    assert.equal(result.assertions.length, 1, 'assertion returned for user_stories');
    assert.equal(result.assertions[0].storyId, 'story-1');

    // The returned assertion ID matches the stored one
    const storedRow = [...db._store.values()][0];
    assert.equal(result.assertions[0].id, storedRow.id, 'returned assertion ID matches DB row');
  });
});
