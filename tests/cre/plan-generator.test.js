'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { PlanGenerator, PlanState, VALID_TRANSITIONS } = require('../../src/main/cre/plan-generator');

// --- Test helpers ---

/** Create a temp directory for test storage. */
function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cre-plan-test-'));
}

/** Minimal in-memory SQLite mock using maps. */
function mockDb() {
  const tables = { cre_plans: [] };
  return {
    prepare(sql) {
      return {
        run(...params) {
          tables.cre_plans.push({ sql: sql.trim(), params });
          return { changes: 1 };
        },
        get(...params) {
          return tables.cre_plans.find(r => r.params.includes(params[0])) || null;
        },
        all() {
          return tables.cre_plans;
        }
      };
    },
    _tables: tables
  };
}

/** Minimal storage mock that reads/writes plans as files. */
function mockStorage(projectRoot) {
  const plansDir = path.join(projectRoot, '.puffin', 'cre', 'plans');
  fs.mkdirSync(plansDir, { recursive: true });

  return {
    async writePlan(root, sprintId, plan) {
      const file = path.join(plansDir, `${sprintId}.json`);
      fs.writeFileSync(file, JSON.stringify(plan, null, 2));
    },
    async readPlan(root, sprintId) {
      const file = path.join(plansDir, `${sprintId}.json`);
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    },
    async listPlans(root) {
      return fs.readdirSync(plansDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    }
  };
}

/** Minimal prompt builder mocks. */
function mockPromptBuilders() {
  return {
    analyzeAmbiguities: {
      buildPrompt: (params) => ({ system: 'sys', task: 'analyze', constraints: 'c', _params: params })
    },
    generatePlan: {
      buildPrompt: (params) => ({ system: 'sys', task: 'generate', constraints: 'c', _params: params })
    },
    refinePlan: {
      buildPrompt: (params) => ({ system: 'sys', task: 'refine', constraints: 'c', _params: params })
    },
    generateAssertions: {
      buildPrompt: (params) => ({ system: 'sys', task: 'assertions', constraints: 'c', _params: params })
    }
  };
}

const stories = [
  { id: 'S1', title: 'Story One', description: 'First', acceptanceCriteria: ['AC1'] },
  { id: 'S2', title: 'Story Two', description: 'Second', acceptanceCriteria: ['AC2'] }
];

// --- Tests ---

describe('PlanState and VALID_TRANSITIONS (AC6)', () => {
  it('should define all 6 states', () => {
    assert.equal(Object.keys(PlanState).length, 6);
    assert.ok(PlanState.IDLE);
    assert.ok(PlanState.ANALYZING);
    assert.ok(PlanState.QUESTIONS_PENDING);
    assert.ok(PlanState.GENERATING);
    assert.ok(PlanState.REVIEW_PENDING);
    assert.ok(PlanState.APPROVED);
  });

  it('should define valid transitions for all states', () => {
    for (const state of Object.values(PlanState)) {
      assert.ok(Array.isArray(VALID_TRANSITIONS[state]), `Missing transitions for ${state}`);
    }
  });

  it('IDLE can only go to ANALYZING', () => {
    assert.deepEqual(VALID_TRANSITIONS[PlanState.IDLE], [PlanState.ANALYZING]);
  });

  it('APPROVED can go back to IDLE', () => {
    assert.deepEqual(VALID_TRANSITIONS[PlanState.APPROVED], [PlanState.IDLE]);
  });
});

describe('PlanGenerator - state machine (AC6)', () => {
  let gen, tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
    gen = new PlanGenerator({
      db: mockDb(),
      storage: mockStorage(tmpDir),
      projectRoot: tmpDir,
      promptBuilders: mockPromptBuilders()
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should start in IDLE state', () => {
    assert.equal(gen.state, PlanState.IDLE);
  });

  it('should reject invalid transitions', () => {
    // Cannot go from IDLE to GENERATING directly
    assert.throws(
      () => gen._transition(PlanState.GENERATING),
      { message: /Invalid state transition: idle → generating/ }
    );
  });

  it('should allow valid transitions', () => {
    gen._transition(PlanState.ANALYZING);
    assert.equal(gen.state, PlanState.ANALYZING);
  });
});

describe('PlanGenerator - analyzeSprint (AC2)', () => {
  let gen, tmpDir, db;

  beforeEach(() => {
    tmpDir = makeTempDir();
    db = mockDb();
    gen = new PlanGenerator({
      db,
      storage: mockStorage(tmpDir),
      projectRoot: tmpDir,
      promptBuilders: mockPromptBuilders()
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should transition to QUESTIONS_PENDING', async () => {
    await gen.analyzeSprint('sprint-1', stories);
    assert.equal(gen.state, PlanState.QUESTIONS_PENDING);
  });

  it('should return a planId', async () => {
    const result = await gen.analyzeSprint('sprint-1', stories);
    assert.ok(result.planId);
    assert.equal(gen.currentPlanId, result.planId);
  });

  it('should insert a plan row into DB (AC8)', async () => {
    await gen.analyzeSprint('sprint-1', stories);
    const inserts = db._tables.cre_plans.filter(r => r.sql.includes('INSERT'));
    assert.equal(inserts.length, 1);
    assert.ok(inserts[0].params.includes('sprint-1'));
  });

  it('should return prompt data', async () => {
    const result = await gen.analyzeSprint('sprint-1', stories);
    assert.ok(result.prompt.system);
    assert.ok(result.prompt.task);
  });
});

describe('PlanGenerator - generatePlan (AC3)', () => {
  let gen, tmpDir;

  beforeEach(async () => {
    tmpDir = makeTempDir();
    gen = new PlanGenerator({
      db: mockDb(),
      storage: mockStorage(tmpDir),
      projectRoot: tmpDir,
      promptBuilders: mockPromptBuilders()
    });
    await gen.analyzeSprint('sprint-1', stories);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should transition to REVIEW_PENDING', async () => {
    await gen.generatePlan('sprint-1', stories);
    assert.equal(gen.state, PlanState.REVIEW_PENDING);
  });

  it('should return plan with expected structure', async () => {
    const result = await gen.generatePlan('sprint-1', stories);
    assert.ok(result.plan.id);
    assert.equal(result.plan.sprintId, 'sprint-1');
    assert.equal(result.plan.status, 'review_pending');
    assert.equal(result.plan.iteration, 1);
  });

  it('should save plan to file (AC7)', async () => {
    await gen.generatePlan('sprint-1', stories);
    const planFile = path.join(tmpDir, '.puffin', 'cre', 'plans', 'sprint-1.json');
    assert.ok(fs.existsSync(planFile));
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    assert.equal(plan.sprintId, 'sprint-1');
  });

  it('should reject if called from IDLE (no analysis done)', async () => {
    const gen2 = new PlanGenerator({
      db: mockDb(),
      storage: mockStorage(tmpDir),
      projectRoot: tmpDir,
      promptBuilders: mockPromptBuilders()
    });
    // In IDLE, cannot jump to GENERATING
    await assert.rejects(
      () => gen2.generatePlan('sprint-1', stories),
      { message: /Invalid state transition/ }
    );
  });
});

describe('PlanGenerator - refinePlan (AC4)', () => {
  let gen, tmpDir;

  beforeEach(async () => {
    tmpDir = makeTempDir();
    gen = new PlanGenerator({
      db: mockDb(),
      storage: mockStorage(tmpDir),
      projectRoot: tmpDir,
      promptBuilders: mockPromptBuilders()
    });
    await gen.analyzeSprint('sprint-1', stories);
    await gen.generatePlan('sprint-1', stories);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should transition through GENERATING back to REVIEW_PENDING', async () => {
    await gen.refinePlan(gen.currentPlanId, 'change the order');
    assert.equal(gen.state, PlanState.REVIEW_PENDING);
  });

  it('should increment iteration', async () => {
    const result = await gen.refinePlan(gen.currentPlanId, 'change the order');
    assert.equal(result.plan.iteration, 2);
  });

  it('should reject wrong planId', async () => {
    await assert.rejects(
      () => gen.refinePlan('wrong-id', 'feedback'),
      { message: /not the active plan/ }
    );
  });

  it('should update plan file (AC7)', async () => {
    await gen.refinePlan(gen.currentPlanId, 'more detail');
    const planFile = path.join(tmpDir, '.puffin', 'cre', 'plans', 'sprint-1.json');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    assert.equal(plan.iteration, 2);
  });
});

describe('PlanGenerator - approvePlan (AC5)', () => {
  let gen, tmpDir, planId;

  beforeEach(async () => {
    tmpDir = makeTempDir();
    gen = new PlanGenerator({
      db: mockDb(),
      storage: mockStorage(tmpDir),
      projectRoot: tmpDir,
      promptBuilders: mockPromptBuilders()
    });
    await gen.analyzeSprint('sprint-1', stories);
    const result = await gen.generatePlan('sprint-1', stories);
    planId = result.planId;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should transition to APPROVED then back to IDLE', async () => {
    await gen.approvePlan(planId);
    // After approval, resets to IDLE
    assert.equal(gen.state, PlanState.IDLE);
  });

  it('should set plan status to approved in file (AC7)', async () => {
    await gen.approvePlan(planId);
    const planFile = path.join(tmpDir, '.puffin', 'cre', 'plans', 'sprint-1.json');
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    assert.equal(plan.status, 'approved');
    assert.ok(plan.approvedAt);
  });

  it('should update DB with approval (AC8)', async () => {
    const db = gen._db;
    await gen.approvePlan(planId);
    const updates = db._tables.cre_plans.filter(r => r.sql.includes('approved'));
    assert.ok(updates.length > 0);
  });

  it('should return assertion prompts', async () => {
    const result = await gen.approvePlan(planId);
    assert.ok(Array.isArray(result.assertionPrompts));
  });

  it('should clear currentPlanId after approval', async () => {
    await gen.approvePlan(planId);
    assert.equal(gen.currentPlanId, null);
  });

  it('should reject wrong planId', async () => {
    await assert.rejects(
      () => gen.approvePlan('wrong-id'),
      { message: /not the active plan/ }
    );
  });
});

describe('PlanGenerator - full lifecycle', () => {
  let gen, tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
    gen = new PlanGenerator({
      db: mockDb(),
      storage: mockStorage(tmpDir),
      projectRoot: tmpDir,
      promptBuilders: mockPromptBuilders()
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should complete full cycle: analyze → generate → refine → approve', async () => {
    // Analyze
    const analysis = await gen.analyzeSprint('sprint-1', stories);
    assert.equal(gen.state, PlanState.QUESTIONS_PENDING);

    // Generate
    const plan = await gen.generatePlan('sprint-1', stories);
    assert.equal(gen.state, PlanState.REVIEW_PENDING);

    // Refine
    await gen.refinePlan(plan.planId, 'reorder stories');
    assert.equal(gen.state, PlanState.REVIEW_PENDING);

    // Approve
    const approved = await gen.approvePlan(plan.planId);
    assert.equal(gen.state, PlanState.IDLE);
    assert.equal(approved.plan.status, 'approved');
  });

  it('should support multiple refine iterations before approval', async () => {
    await gen.analyzeSprint('sprint-1', stories);
    const plan = await gen.generatePlan('sprint-1', stories);

    await gen.refinePlan(plan.planId, 'feedback 1');
    assert.equal(gen.state, PlanState.REVIEW_PENDING);

    await gen.refinePlan(plan.planId, 'feedback 2');
    assert.equal(gen.state, PlanState.REVIEW_PENDING);

    const planFile = path.join(tmpDir, '.puffin', 'cre', 'plans', 'sprint-1.json');
    const saved = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    assert.equal(saved.iteration, 3);
  });

  it('reset should return to IDLE', async () => {
    await gen.analyzeSprint('sprint-1', stories);
    gen.reset();
    assert.equal(gen.state, PlanState.IDLE);
    assert.equal(gen.currentPlanId, null);
  });
});
