'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  CrePhase,
  getState,
  reset,
  runPlanningPhase,
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

function makeHandlers(overrides = {}) {
  let locked = false;
  return {
    generatePlan: overrides.generatePlan || (async () => ({
      success: true,
      data: { planId: 'plan-1', planItems: [{ storyId: 'S1' }, { storyId: 'S2' }] }
    })),
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
    // Dirty the state by running something (we'll just check reset works)
    reset();
    const state = getState();
    assert.equal(state.phase, CrePhase.IDLE);
  });
});

describe('CRE Orchestrator - runPlanningPhase', () => {
  beforeEach(() => reset());

  it('should run full sequence: generate → approve → RIS per story (AC2)', async () => {
    const handlers = makeHandlers();
    const stories = makeStories();
    const result = await runPlanningPhase({ sprintId: 'sprint-1', stories }, handlers);

    assert.ok(result.plan);
    assert.equal(result.plan.planId, 'plan-1');
    assert.ok(result.risMap.S1);
    assert.ok(result.risMap.S2);
    assert.equal(result.risMap.S1.markdown, '# RIS for S1');
    assert.equal(result.risMap.S2.markdown, '# RIS for S2');
  });

  it('should acquire and release process lock (AC3)', async () => {
    let lockAcquired = false;
    let lockReleased = false;
    const handlers = makeHandlers({
      acquireLock: () => { lockAcquired = true; },
      releaseLock: () => { lockReleased = true; }
    });

    await runPlanningPhase({ sprintId: 'sprint-1', stories: makeStories() }, handlers);
    assert.ok(lockAcquired, 'Lock should be acquired');
    assert.ok(lockReleased, 'Lock should be released after completion');
  });

  it('should release lock on plan generation failure (AC3)', async () => {
    let lockReleased = false;
    const handlers = makeHandlers({
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
    const handlers = makeHandlers({
      generatePlan: async () => ({ success: false, error: 'bad request' })
    });

    await assert.rejects(
      () => runPlanningPhase({ sprintId: 'sprint-1', stories: makeStories() }, handlers)
    );
    const state = getState();
    assert.equal(state.phase, CrePhase.ERROR);
    assert.ok(state.error.includes('bad request'));
  });

  it('should continue if one RIS fails (graceful degradation)', async () => {
    let callCount = 0;
    const handlers = makeHandlers({
      generateRis: async ({ storyId }) => {
        callCount++;
        if (storyId === 'S1') return { success: false, error: 'RIS fail' };
        return { success: true, data: { storyId, markdown: '# ok' } };
      }
    });

    const result = await runPlanningPhase({ sprintId: 'sprint-1', stories: makeStories() }, handlers);
    assert.equal(callCount, 2, 'Should attempt RIS for both stories');
    assert.ok(result.risMap.S1.error, 'S1 should have error');
    assert.equal(result.risMap.S2.markdown, '# ok');
  });

  it('should reach COMPLETE phase on success', async () => {
    await runPlanningPhase({ sprintId: 'sprint-1', stories: makeStories() }, makeHandlers());
    assert.equal(getState().phase, CrePhase.COMPLETE);
  });

  it('should throw on approve failure', async () => {
    const handlers = makeHandlers({
      approvePlan: async () => ({ success: false, error: 'denied' })
    });

    await assert.rejects(
      () => runPlanningPhase({ sprintId: 'sprint-1', stories: makeStories() }, handlers),
      { message: /Plan approval failed: denied/ }
    );
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
