'use strict';

/**
 * @module cre
 * Central Reasoning Engine — entry point and IPC registration.
 *
 * Initializes all CRE sub-components and registers 10 IPC channels
 * for communication with the orchestration layer.
 *
 * IPC Channels:
 *   cre:generate-plan        — start plan generation for a sprint
 *   cre:refine-plan          — refine an existing plan with feedback
 *   cre:approve-plan         — approve a plan, trigger assertion generation
 *   cre:generate-ris         — generate RIS for a story
 *   cre:generate-assertions  — create inspection assertions for a plan item
 *   cre:verify-assertions    — verify assertions against the codebase
 *   cre:update-model         — update code model after implementation
 *   cre:query-model          — query code model for context
 *   cre:get-plan             — retrieve a plan by sprint ID
 *   cre:get-ris              — retrieve a RIS by story ID
 */

const storage = require('./lib/cre-storage');
const { ensureCreConfig, getCreConfig } = require('./lib/cre-config');
const { queryForTask, formatForPrompt } = require('./lib/context-builder');
const { withRetry, validateAndFilter, markStaleArtifacts, detectPlanCycles } = require('./lib/cre-errors');
const { PlanGenerator } = require('./plan-generator');
const { AssertionGenerator } = require('./assertion-generator');

/**
 * CRE module state — populated during initialize().
 * @type {{ ipcMain: Electron.IpcMain, db: Object, config: Object, projectRoot: string, claudeService: Object|null } | null}
 */
let ctx = null;
let initialized = false;

/** @type {PlanGenerator|null} */
let planGenerator = null;

/** @type {AssertionGenerator|null} */
let assertionGenerator = null;

/**
 * Whether the CRE currently holds the claude-service process lock.
 * @type {boolean}
 */
let _holdingLock = false;

/**
 * Acquire the claude-service process lock for a CRE session.
 * Throws if the lock is already held (by CLI or another CRE session).
 */
function acquireProcessLock() {
  if (!ctx || !ctx.claudeService) return;

  if (ctx.claudeService.isProcessRunning()) {
    throw new Error('Claude CLI process is busy. Wait for the current operation to complete.');
  }

  ctx.claudeService._processLock = true;
  _holdingLock = true;
  console.log('[CRE] Process lock acquired');
}

/**
 * Release the claude-service process lock if held by CRE.
 */
function releaseProcessLock() {
  if (!_holdingLock) return;

  if (ctx && ctx.claudeService) {
    ctx.claudeService._processLock = false;
    console.log('[CRE] Process lock released');
  }
  _holdingLock = false;
}

/**
 * Run an async handler while holding the process lock.
 * Automatically releases the lock on completion or error.
 *
 * @param {Function} fn - Async function to execute while locked
 * @returns {Promise<*>} Result of fn
 */
async function withProcessLock(fn) {
  acquireProcessLock();
  try {
    return await fn();
  } finally {
    releaseProcessLock();
  }
}

/**
 * Initialize the CRE module.
 *
 * @param {Object} context
 * @param {Electron.IpcMain} context.ipcMain - Electron IPC main handle.
 * @param {Electron.App} context.app - Electron app reference.
 * @param {Object} context.db - Database connection (better-sqlite3).
 * @param {Object} context.config - Puffin config object.
 * @param {string} context.projectRoot - Absolute path to the project root.
 * @param {Object} [context.claudeService] - ClaudeService instance for process lock management.
 */
async function initialize(context) {
  const { ipcMain, db, config, projectRoot, claudeService } = context;

  // Ensure CRE config defaults are present
  ensureCreConfig(config);

  // Initialize storage directories and default files
  await storage.initialize(projectRoot);

  ctx = { ipcMain, db, config, projectRoot, claudeService: claudeService || null };

  // Initialize PlanGenerator with dependencies
  planGenerator = new PlanGenerator({ db, storage, projectRoot });

  // Initialize AssertionGenerator
  assertionGenerator = new AssertionGenerator({ db, projectRoot });

  // Register IPC handlers only once (state:init may be called multiple times)
  if (!initialized) {
    registerHandlers(ipcMain);
    initialized = true;
  }

  console.log('[CRE] Initialized');
}

/**
 * Shut down the CRE module. Persists any pending state.
 */
async function shutdown() {
  if (!ctx) return;

  try {
    // Release process lock if still held
    releaseProcessLock();

    // Persist code model instance (in case of in-memory changes)
    // Future: persist plan generator state machine
    console.log('[CRE] Shutdown complete');
  } catch (err) {
    console.error('[CRE] Error during shutdown:', err.message);
  }

  ctx = null;
}

/**
 * Registers all 8 CRE IPC handlers.
 * @param {Electron.IpcMain} ipcMain
 */
function registerHandlers(ipcMain) {
  // ── Active session handlers (acquire process lock) ──────────────────

  ipcMain.handle('cre:generate-plan', async (_event, args) => {
    try {
      const { sprintId, stories } = args;
      if (!sprintId || !stories) {
        return { success: false, error: 'sprintId and stories are required' };
      }
      // AC5: Detect dependency cycles before planning
      const cycleResult = detectPlanCycles(stories);
      if (cycleResult.hasCycle) {
        return { success: false, error: `Plan has dependency cycle involving: ${cycleResult.cycle.join(', ')}` };
      }

      return await withProcessLock(async () => {
        return await withRetry(async () => {
          // Step 1: Analyze sprint for ambiguities
          await planGenerator.analyzeSprint(sprintId, stories);

          // Step 2: Generate plan (with any answers — empty for auto flow)
          const result = await planGenerator.generatePlan(sprintId, stories);
          return { success: true, data: { planId: result.planId, plan: result.plan, sprintId } };
        }, { label: 'generate-plan' });
      });
    } catch (err) {
      console.error('[CRE] cre:generate-plan error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cre:refine-plan', async (_event, args) => {
    try {
      const { planId, feedback } = args;
      if (!planId || !feedback) {
        return { success: false, error: 'planId and feedback are required' };
      }
      return await withProcessLock(async () => {
        return await withRetry(async () => {
          const result = await planGenerator.refinePlan(planId, feedback);
          return { success: true, data: { planId, plan: result.plan } };
        }, { label: 'refine-plan' });
      });
    } catch (err) {
      console.error('[CRE] cre:refine-plan error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cre:approve-plan', async (_event, args) => {
    try {
      const { planId } = args;
      if (!planId) {
        return { success: false, error: 'planId is required' };
      }
      return await withProcessLock(async () => {
        return await withRetry(async () => {
          const result = await planGenerator.approvePlan(planId);
          return { success: true, data: { planId, plan: result.plan, assertionPrompts: result.assertionPrompts } };
        }, { label: 'approve-plan' });
      });
    } catch (err) {
      console.error('[CRE] cre:approve-plan error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cre:generate-ris', async (_event, args) => {
    try {
      const { planId, storyId } = args;
      if (!planId || !storyId) {
        return { success: false, error: 'planId and storyId are required' };
      }
      return await withProcessLock(async () => {
        return await withRetry(async () => {
          return { success: true, data: { planId, storyId, status: 'not-implemented' } };
        }, { label: 'generate-ris' });
      });
    } catch (err) {
      console.error('[CRE] cre:generate-ris error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cre:generate-assertions', async (_event, args) => {
    try {
      const { planId, storyId, planItem, story, assertions: providedAssertions } = args || {};
      if (!planId || !storyId || !planItem || !story) {
        return { success: false, error: 'planId, storyId, planItem, and story are required' };
      }
      return await withProcessLock(async () => {
        const result = await assertionGenerator.generate({
          planItem,
          story: { ...story, id: storyId },
          planId,
          assertions: providedAssertions || null
        });
        return { success: true, data: result };
      });
    } catch (err) {
      console.error('[CRE] cre:generate-assertions error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cre:verify-assertions', async (_event, args) => {
    try {
      const { planId, storyId } = args || {};
      if (planId == null && storyId == null) {
        return { success: false, error: 'planId or storyId is required' };
      }
      const assertions = planId != null
        ? assertionGenerator.getByPlan(planId)
        : assertionGenerator.getByStory(storyId);
      const results = await assertionGenerator.verify(assertions);
      return { success: true, data: results };
    } catch (err) {
      console.error('[CRE] cre:verify-assertions error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── Read-only handlers (no process lock needed) ─────────────────────

  ipcMain.handle('cre:update-model', async (_event, args) => {
    try {
      const { instance: newInstance, existingFiles } = args || {};

      if (newInstance) {
        // AC2: Validate against schema, skip invalid elements
        let schema = null;
        try {
          schema = await storage.readSchema(ctx.projectRoot);
        } catch {
          console.warn('[CRE] Could not read schema for validation, proceeding without');
        }

        const { filtered, warnings } = validateAndFilter(newInstance, schema);

        // AC4: Mark artifacts referencing deleted files as stale
        if (existingFiles) {
          markStaleArtifacts(filtered, existingFiles);
        }

        // AC3: Persist — storage errors surface to user but filtered instance is returned
        try {
          await storage.writeInstance(ctx.projectRoot, filtered);
        } catch (storageErr) {
          console.error('[CRE] Storage write failed during model update:', storageErr.message);
          return {
            success: false,
            error: `Storage write failed: ${storageErr.message}`,
            data: { filtered, warnings, inMemoryOnly: true }
          };
        }

        return {
          success: true,
          data: { updated: true, warnings, skipped: warnings.length }
        };
      }

      return { success: true, data: { updated: false, status: 'not-implemented' } };
    } catch (err) {
      console.error('[CRE] cre:update-model error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cre:query-model', async (_event, args) => {
    try {
      const { taskDescription, maxArtifacts } = args || {};
      if (!taskDescription) {
        return { success: false, error: 'taskDescription is required' };
      }

      let instance;
      try {
        instance = await storage.readInstance(ctx.projectRoot);
      } catch (readErr) {
        // AC3: Storage read failure — surface error but provide empty context
        console.error('[CRE] Instance read failed:', readErr.message);
        const emptyContext = queryForTask({ taskDescription, instance: null, schema: null, maxArtifacts: 0 });
        return {
          success: true,
          data: {
            context: emptyContext,
            formatted: formatForPrompt(emptyContext),
            warning: `Instance read failed: ${readErr.message}`
          }
        };
      }

      let schema = null;
      try {
        schema = await storage.readSchema(ctx.projectRoot);
      } catch {
        console.warn('[CRE] Schema read failed, querying without validation');
      }

      // AC2: Validate and filter invalid elements before querying
      if (schema) {
        const { filtered } = validateAndFilter(instance, schema);
        instance = filtered;
      }

      const context = queryForTask({
        taskDescription,
        instance,
        schema,
        maxArtifacts: maxArtifacts || 20
      });

      return {
        success: true,
        data: {
          context,
          formatted: formatForPrompt(context)
        }
      };
    } catch (err) {
      console.error('[CRE] cre:query-model error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cre:get-plan', async (_event, args) => {
    try {
      const { sprintId } = args;
      if (!sprintId) {
        return { success: false, error: 'sprintId is required' };
      }

      try {
        const plan = await storage.readPlan(ctx.projectRoot, sprintId);
        return { success: true, data: plan };
      } catch {
        return { success: true, data: null };
      }
    } catch (err) {
      console.error('[CRE] cre:get-plan error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cre:get-ris', async (_event, args) => {
    try {
      const { storyId, planId } = args;
      if (!storyId) {
        return { success: false, error: 'storyId is required' };
      }

      // Query from DB
      const row = ctx.db.prepare(
        'SELECT * FROM cre_ris WHERE story_id = ? ORDER BY updated_at DESC LIMIT 1'
      ).get(storyId);

      return { success: true, data: row || null };
    } catch (err) {
      console.error('[CRE] cre:get-ris error:', err.message);
      return { success: false, error: err.message };
    }
  });

  console.log('[CRE] Registered 10 IPC handlers');
}

/**
 * Returns the current CRE config (AC9).
 * Accessible by any sub-component that imports cre/index.
 *
 * @returns {Object} CRE config section, or defaults if not initialized.
 */
function getConfig() {
  if (ctx && ctx.config) {
    return getCreConfig(ctx.config);
  }
  const { getDefaultCreConfig } = require('./lib/cre-config');
  return getDefaultCreConfig();
}

module.exports = { initialize, shutdown, acquireProcessLock, releaseProcessLock, withProcessLock, getConfig };
