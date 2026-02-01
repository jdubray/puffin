'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  CrePhase,
  getState,
  reset,
  runPlanningPhase,
  runApprovalPhase,
  runRefinement,
  runIntrospection
} = require('../../src/main/cre/lib/cre-orchestrator');

// --- Helpers ---

function makeStories() {
  return [
    { id: 'S1', title: 'Story One', description: 'First', acceptanceCriteria: ['AC1'], dependsOn: [] },
    { id: 'S2', title: 'Story Two', description: 'Second', acceptanceCriteria: ['AC2'], dependsOn: ['S1'] }
  ];
}

function makePlanningHandlers(overrides = {}) {
  let locked = false;
  return {
    generatePlan: overrides.generatePlan || (async () => ({
      success: true,
      data: { planId: 'plan-1', planItems: [{ storyId: 'S1' }, { storyId: 'S2' }] }
    })),
    submitAnswers: overrides.submitAnswers || (async () => ({
      success: true,
      data: { planId: 'plan-1' }
    })),
    acquireLock: overrides.acquireLock || (() => { locked = true; }),
    releaseLock: overrides.releaseLock || (() => { locked = false; }),
    get locked() { return locked; }
  };
}

function makeApprovalHandlers(overrides = {}) {
  let locked = false;
  return {
    approvePlan: overrides.approvePlan || (async () => ({ success: true, data: { planId: 'plan-1' } })),
    generateRis: overrides.generateRis || (async ({ storyId }) => ({
      success: true,
      data: { storyId, markdown: `# RIS for ${storyId}` }
    })),
    acquireLock: overrides.acquireLock || (() => { locked = true; }),
    releaseLock: overrides.releaseLock || (() => { locked = false; }),
    get locked() { return locked; }
  };
}

// --- Tests ---

describe('CRE Orchestrator - getState and reset', () => {
  beforeEach(() => reset());

  it('should start in idle state', () => {
    const state = getState();
    assert.equal(state.phase, CrePhase.IDLE);
    assert.equal(state.sprintId, null);
    assert.equal(state.planId, null);
    assert.equal(state.error, null);
  });

  it('reset should clear all state', () => {
    reset();
    const state = getState();
    assert.equal(state.phase, CrePhase.IDLE);
  });
});

describe('CRE Orchestrator - runPlanningPhase (plan generation only)', () => {
  beforeEach(() => reset());

  it('should generate plan and return for user review without approving (AC2)', async () => {
    const handlers = makePlanningHandlers();
    const stories = makeStories();
    const result = await runPlanningPhase({ sprintId: 'sprint-1', stories }, handlers);

    assert.ok(result.plan);
    assert.equal(result.plan.planId, 'plan-1');
    // Should NOT have risMap — approval is separate
    assert.equal(result.risMap, undefined);
  });

  it('should call submitAnswers when provided', async () => {
    let submitCalled = false;
    const handlers = makePlanningHandlers({
      submitAnswers: async () => { submitCalled = true; return { success: true, data: {} }; }
    });

    await runPlanningPhase({ sprintId: 'sprint-1', stories: makeStories() }, handlers);
    assert.ok(submitCalled, 'submitAnswers should be called');
  });

  it('should skip submitAnswers when not provided', async () => {
    const handlers = makePlanningHandlers();
    delete handlers.submitAnswers;

    const result = await runPlanningPhase({ sprintId: 'sprint-1', stories: makeStories() }, handlers);
    assert.ok(result.plan);
  });

  it('should acquire and release process lock (AC3)', async () => {
    let lockAcquired = false;
    let lockReleased = false;
    const handlers = makePlanningHandlers({
      acquireLock: () => { lockAcquired = true; },
      releaseLock: () => { lockReleased = true; }
    });

    await runPlanningPhase({ sprintId: 'sprint-1', stories: makeStories() }, handlers);
    assert.ok(lockAcquired, 'Lock should be acquired');
    assert.ok(lockReleased, 'Lock should be released after completion');
  });

  it('should release lock on plan generation failure (AC3)', async () => {
    let lockReleased = false;
    const handlers = makePlanningHandlers({
      generatePlan: async () => ({ success: false, error: 'AI timeout' }),
      releaseLock: () => { lockReleased = true; }
    });

    await assert.rejects(
      () => runPlanningPhase({ sprintId: 'sprint-1', stories: makeStories() }, handlers),
      { message: /Plan generation failed: AI timeout/ }
    );
    assert.ok(lockReleased, 'Lock should be released on error');
  });

  it('should set error state on failure', async () => {
    const handlers = makePlanningHandlers({
      generatePlan: async () => ({ success: false, error: 'bad request' })
    });

    await assert.rejects(
      () => runPlanningPhase({ sprintId: 'sprint-1', stories: makeStories() }, handlers)
    );
    const state = getState();
    assert.equal(state.phase, CrePhase.ERROR);
    assert.ok(state.error.includes('bad request'));
  });

  it('should return to IDLE phase on success (user reviews plan)', async () => {
    await runPlanningPhase({ sprintId: 'sprint-1', stories: makeStories() }, makePlanningHandlers());
    assert.equal(getState().phase, CrePhase.IDLE);
  });
});

describe('CRE Orchestrator - runApprovalPhase (user-initiated)', () => {
  beforeEach(() => reset());

  it('should approve plan and generate RIS per story', async () => {
    const handlers = makeApprovalHandlers();
    const stories = makeStories();
    const result = await runApprovalPhase({ planId: 'plan-1', stories }, handlers);

    assert.ok(result.risMap);
    assert.ok(result.risMap.S1);
    assert.ok(result.risMap.S2);
    assert.equal(result.risMap.S1.markdown, '# RIS for S1');
    assert.equal(result.risMap.S2.markdown, '# RIS for S2');
  });

  it('should acquire and release process lock (AC3)', async () => {
    let lockAcquired = false;
    let lockReleased = false;
    const handlers = makeApprovalHandlers({
      acquireLock: () => { lockAcquired = true; },
      releaseLock: () => { lockReleased = true; }
    });

    await runApprovalPhase({ planId: 'plan-1', stories: makeStories() }, handlers);
    assert.ok(lockAcquired);
    assert.ok(lockReleased);
  });

  it('should throw on approve failure', async () => {
    const handlers = makeApprovalHandlers({
      approvePlan: async () => ({ success: false, error: 'denied' })
    });

    await assert.rejects(
      () => runApprovalPhase({ planId: 'plan-1', stories: makeStories() }, handlers),
      { message: /Plan approval failed: denied/ }
    );
  });

  it('should release lock on approval failure', async () => {
    let lockReleased = false;
    const handlers = makeApprovalHandlers({
      approvePlan: async () => ({ success: false, error: 'denied' }),
      releaseLock: () => { lockReleased = true; }
    });

    await assert.rejects(
      () => runApprovalPhase({ planId: 'plan-1', stories: makeStories() }, handlers)
    );
    assert.ok(lockReleased);
  });

  it('should continue if one RIS fails (graceful degradation)', async () => {
    let callCount = 0;
    const handlers = makeApprovalHandlers({
      generateRis: async ({ storyId }) => {
        callCount++;
        if (storyId === 'S1') return { success: false, error: 'RIS fail' };
        return { success: true, data: { storyId, markdown: '# ok' } };
      }
    });

    const result = await runApprovalPhase({ planId: 'plan-1', stories: makeStories() }, handlers);
    assert.equal(callCount, 2, 'Should attempt RIS for both stories');
    assert.ok(result.risMap.S1.error, 'S1 should have error');
    assert.equal(result.risMap.S2.markdown, '# ok');
  });

  it('should reach COMPLETE phase on success', async () => {
    await runApprovalPhase({ planId: 'plan-1', stories: makeStories() }, makeApprovalHandlers());
    assert.equal(getState().phase, CrePhase.COMPLETE);
  });
});

describe('CRE Orchestrator - runRefinement', () => {
  beforeEach(() => reset());

  it('should refine plan and return data', async () => {
    let lockAcquired = false;
    let lockReleased = false;
    const refinePlan = async () => ({ success: true, data: { planId: 'plan-1', changelog: ['updated'] } });
    const result = await runRefinement(
      { planId: 'plan-1', feedback: 'change order' },
      refinePlan,
      () => { lockAcquired = true; },
      () => { lockReleased = true; }
    );

    assert.ok(result.changelog);
    assert.ok(lockAcquired);
    assert.ok(lockReleased);
  });

  it('should throw on refinement failure', async () => {
    const refinePlan = async () => ({ success: false, error: 'invalid feedback' });
    await assert.rejects(
      () => runRefinement({ planId: 'p', feedback: 'f' }, refinePlan, () => {}, () => {}),
      { message: /Plan refinement failed/ }
    );
    assert.equal(getState().phase, CrePhase.ERROR);
  });
});

describe('CRE Orchestrator - runIntrospection (AC5)', () => {
  beforeEach(() => reset());

  it('should call updateModel and return result', async () => {
    const updateModel = async () => ({ success: true, data: { updated: true, warnings: [] } });
    const result = await runIntrospection({ instance: {}, existingFiles: [] }, updateModel);
    assert.ok(result.success);
  });

  it('should handle updateModel failure gracefully', async () => {
    const updateModel = async () => ({ success: false, error: 'disk full' });
    const result = await runIntrospection({}, updateModel);
    assert.equal(result.success, false);
    // Should not throw — introspection failure is non-fatal
  });
});
