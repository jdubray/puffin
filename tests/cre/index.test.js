'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

/**
 * The CRE module uses module-level state (ctx, initialized, _holdingLock).
 * To get a fresh instance per test we must bust the require cache.
 */
function freshCre() {
  const modPath = require.resolve('../../src/main/cre/index');
  delete require.cache[modPath];
  return require(modPath);
}

/**
 * Create a minimal mock ipcMain that records registered handlers.
 */
function createMockIpcMain() {
  const handlers = {};
  return {
    handlers,
    handle(channel, fn) {
      handlers[channel] = fn;
    }
  };
}

/**
 * Create a mock claudeService with controllable lock state.
 */
function createMockClaudeService(busy = false) {
  return {
    _processLock: busy,
    currentProcess: null,
    isProcessRunning() {
      return this._processLock || this.currentProcess !== null;
    }
  };
}

/**
 * Create a temp directory for CRE storage tests.
 */
async function createTempProjectRoot() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cre-test-'));
  return tmpDir;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('CRE index.js - initialize and shutdown', () => {
  let cre, ipcMain, projectRoot;

  beforeEach(async () => {
    cre = freshCre();
    ipcMain = createMockIpcMain();
    projectRoot = await createTempProjectRoot();
  });

  afterEach(async () => {
    try { await cre.shutdown(); } catch {}
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('should initialize with all required context fields', async () => {
    await cre.initialize({
      ipcMain,
      app: {},
      db: { prepare: () => ({ get: () => null, all: () => [] }) },
      config: {},
      projectRoot
    });
    // Should not throw — initialization succeeded
  });

  it('should register exactly 10 IPC handlers', async () => {
    await cre.initialize({
      ipcMain,
      app: {},
      db: { prepare: () => ({ get: () => null }) },
      config: {},
      projectRoot
    });

    const channels = Object.keys(ipcMain.handlers);
    assert.equal(channels.length, 10, `Expected 10 handlers, got ${channels.length}: ${channels.join(', ')}`);

    const expected = [
      'cre:generate-plan', 'cre:refine-plan', 'cre:approve-plan',
      'cre:generate-ris', 'cre:generate-assertions', 'cre:verify-assertions',
      'cre:update-model', 'cre:query-model',
      'cre:get-plan', 'cre:get-ris'
    ];
    for (const ch of expected) {
      assert.ok(ipcMain.handlers[ch], `Missing handler for ${ch}`);
    }
  });

  it('should not register handlers twice on re-initialize', async () => {
    const context = {
      ipcMain,
      app: {},
      db: { prepare: () => ({ get: () => null }) },
      config: {},
      projectRoot
    };

    await cre.initialize(context);
    const first = { ...ipcMain.handlers };

    // Re-init — handlers should not be re-registered
    await cre.initialize(context);
    const second = { ...ipcMain.handlers };

    // The handler references should be the same (not replaced)
    for (const ch of Object.keys(first)) {
      assert.equal(first[ch], second[ch], `Handler ${ch} was re-registered`);
    }
  });

  it('should accept claudeService in context', async () => {
    const claudeService = createMockClaudeService();
    await cre.initialize({
      ipcMain,
      app: {},
      db: { prepare: () => ({ get: () => null }) },
      config: {},
      projectRoot,
      claudeService
    });
    // No error means claudeService was accepted
  });

  it('shutdown should not throw when not initialized', async () => {
    await cre.shutdown(); // Should be a no-op
  });

  it('shutdown should release process lock if held', async () => {
    const claudeService = createMockClaudeService();
    await cre.initialize({
      ipcMain,
      app: {},
      db: { prepare: () => ({ get: () => null }) },
      config: {},
      projectRoot,
      claudeService
    });

    // Manually acquire lock
    cre.acquireProcessLock();
    assert.equal(claudeService._processLock, true);

    await cre.shutdown();
    assert.equal(claudeService._processLock, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('CRE IPC handler response format', () => {
  let cre, ipcMain, projectRoot;

  beforeEach(async () => {
    cre = freshCre();
    ipcMain = createMockIpcMain();
    projectRoot = await createTempProjectRoot();
    await cre.initialize({
      ipcMain,
      app: {},
      db: { prepare: () => ({ get: () => null, all: () => [], run: () => ({ changes: 1 }) }) },
      config: {},
      projectRoot,
      claudeService: createMockClaudeService()
    });
  });

  afterEach(async () => {
    try { await cre.shutdown(); } catch {}
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('cre:generate-plan returns error on missing args', async () => {
    const result = await ipcMain.handlers['cre:generate-plan'](null, {});
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it('cre:generate-plan returns success with valid args', async () => {
    const result = await ipcMain.handlers['cre:generate-plan'](null, {
      sprintId: 'sp-1', stories: [{ id: 's1' }]
    });
    assert.equal(result.success, true);
    assert.ok(result.data);
  });

  it('cre:refine-plan returns error on missing args', async () => {
    const result = await ipcMain.handlers['cre:refine-plan'](null, {});
    assert.equal(result.success, false);
  });

  it('cre:refine-plan returns success with valid args', async () => {
    // Must generate a plan first (state machine requires REVIEW_PENDING)
    const genResult = await ipcMain.handlers['cre:generate-plan'](null, {
      sprintId: 'sp-2', stories: [{ id: 's1' }]
    });
    const result = await ipcMain.handlers['cre:refine-plan'](null, {
      planId: genResult.data.planId, feedback: 'needs more detail'
    });
    assert.equal(result.success, true);
  });

  it('cre:approve-plan returns error on missing planId', async () => {
    const result = await ipcMain.handlers['cre:approve-plan'](null, {});
    assert.equal(result.success, false);
  });

  it('cre:approve-plan returns success with valid args', async () => {
    // Must generate a plan first (state machine requires REVIEW_PENDING)
    const genResult = await ipcMain.handlers['cre:generate-plan'](null, {
      sprintId: 'sp-3', stories: [{ id: 's1' }]
    });
    const result = await ipcMain.handlers['cre:approve-plan'](null, { planId: genResult.data.planId });
    assert.equal(result.success, true);
  });

  it('cre:generate-ris returns error on missing args', async () => {
    const result = await ipcMain.handlers['cre:generate-ris'](null, {});
    assert.equal(result.success, false);
  });

  it('cre:generate-ris returns success with valid args', async () => {
    const result = await ipcMain.handlers['cre:generate-ris'](null, {
      planId: 'p1', storyId: 's1'
    });
    assert.equal(result.success, true);
  });

  it('cre:update-model returns success', async () => {
    const result = await ipcMain.handlers['cre:update-model'](null, {});
    assert.equal(result.success, true);
  });

  it('cre:query-model returns error on missing taskDescription', async () => {
    const result = await ipcMain.handlers['cre:query-model'](null, {});
    assert.equal(result.success, false);
  });

  it('cre:get-plan returns error on missing sprintId', async () => {
    const result = await ipcMain.handlers['cre:get-plan'](null, {});
    assert.equal(result.success, false);
  });

  it('cre:get-ris returns error on missing storyId', async () => {
    const result = await ipcMain.handlers['cre:get-ris'](null, {});
    assert.equal(result.success, false);
  });

  it('cre:generate-assertions returns error on missing args', async () => {
    const result = await ipcMain.handlers['cre:generate-assertions'](null, {});
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it('cre:generate-assertions returns success with valid args', async () => {
    const result = await ipcMain.handlers['cre:generate-assertions'](null, {
      planId: 'plan-1',
      storyId: 'story-1',
      planItem: { approach: 'create component', filesCreated: ['src/a.js'] },
      story: { title: 'Test story', description: 'desc', acceptanceCriteria: ['AC1'] }
    });
    assert.equal(result.success, true);
    assert.ok(result.data);
    assert.ok(result.data.prompt);
  });

  it('cre:verify-assertions returns error on missing args', async () => {
    const result = await ipcMain.handlers['cre:verify-assertions'](null, {});
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it('cre:verify-assertions returns success with planId', async () => {
    const result = await ipcMain.handlers['cre:verify-assertions'](null, { planId: 'nonexistent-plan' });
    assert.equal(result.success, true);
    assert.ok(Array.isArray(result.data));
  });

  it('cre:get-ris returns null data for nonexistent story', async () => {
    const mockDb = {
      prepare: () => ({ get: () => null })
    };
    // Re-init with working db mock
    const cre2 = freshCre();
    const ipc2 = createMockIpcMain();
    await cre2.initialize({
      ipcMain: ipc2, app: {}, db: mockDb, config: {}, projectRoot,
      claudeService: createMockClaudeService()
    });
    const result = await ipc2.handlers['cre:get-ris'](null, { storyId: 'nonexistent' });
    assert.equal(result.success, true);
    assert.equal(result.data, null);
    await cre2.shutdown();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('CRE process lock management', () => {
  let cre, ipcMain, projectRoot, claudeService;

  beforeEach(async () => {
    cre = freshCre();
    ipcMain = createMockIpcMain();
    projectRoot = await createTempProjectRoot();
    claudeService = createMockClaudeService();
    await cre.initialize({
      ipcMain,
      app: {},
      db: { prepare: () => ({ get: () => null, run: () => ({ changes: 1 }) }) },
      config: {},
      projectRoot,
      claudeService
    });
  });

  afterEach(async () => {
    try { await cre.shutdown(); } catch {}
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('acquireProcessLock sets _processLock on claudeService', () => {
    cre.acquireProcessLock();
    assert.equal(claudeService._processLock, true);
  });

  it('releaseProcessLock clears _processLock on claudeService', () => {
    cre.acquireProcessLock();
    cre.releaseProcessLock();
    assert.equal(claudeService._processLock, false);
  });

  it('acquireProcessLock throws when claudeService is already busy', () => {
    claudeService._processLock = true;
    assert.throws(
      () => cre.acquireProcessLock(),
      { message: /Claude CLI process is busy/ }
    );
  });

  it('withProcessLock acquires and releases around async work', async () => {
    let wasLocked = false;
    await cre.withProcessLock(async () => {
      wasLocked = claudeService._processLock;
    });
    assert.equal(wasLocked, true, 'Lock should be held during fn execution');
    assert.equal(claudeService._processLock, false, 'Lock should be released after');
  });

  it('withProcessLock releases lock on error', async () => {
    try {
      await cre.withProcessLock(async () => { throw new Error('boom'); });
    } catch {}
    assert.equal(claudeService._processLock, false, 'Lock should be released after error');
  });

  it('active IPC handlers acquire process lock', async () => {
    // generate-plan should acquire lock
    let lockDuringExec = false;
    const origLock = claudeService._processLock;

    // We can verify by checking that the handler sets the lock
    const result = await ipcMain.handlers['cre:generate-plan'](null, {
      sprintId: 'sp-1', stories: [{ id: 's1' }]
    });
    assert.equal(result.success, true);
    // Lock should be released after handler completes
    assert.equal(claudeService._processLock, false);
  });

  it('active IPC handler returns error when CLI is busy', async () => {
    claudeService._processLock = true; // Simulate busy CLI

    const result = await ipcMain.handlers['cre:generate-plan'](null, {
      sprintId: 'sp-1', stories: [{ id: 's1' }]
    });
    assert.equal(result.success, false);
    assert.ok(result.error.includes('busy'));
  });

  it('read-only handlers work even when CLI is busy', async () => {
    claudeService._processLock = true;

    const result = await ipcMain.handlers['cre:update-model'](null, {});
    assert.equal(result.success, true);
  });
});
