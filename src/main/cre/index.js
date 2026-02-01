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
const { SchemaManager } = require('./schema-manager');
const { CodeModel } = require('./code-model');
const { RISGenerator } = require('./ris-generator');
const { Introspector } = require('./introspector');

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

/** @type {SchemaManager|null} */
let schemaManager = null;

/** @type {CodeModel|null} */
let codeModel = null;

/** @type {RISGenerator|null} */
let risGenerator = null;

/** @type {Introspector|null} */
let introspector = null;

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

  ctx.claudeService.acquireLock();
  _holdingLock = true;
  console.log('[CRE] Process lock acquired');
}

/**
 * Release the claude-service process lock if held by CRE.
 */
function releaseProcessLock() {
  if (!_holdingLock) return;

  if (ctx && ctx.claudeService) {
    ctx.claudeService.releaseLock();
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

  // Initialize SchemaManager
  const creConfig = getCreConfig(config);
  schemaManager = new SchemaManager({ storage, projectRoot, config: creConfig });

  // Initialize CodeModel
  codeModel = new CodeModel({ storage, schemaManager });
  try {
    await codeModel.load(projectRoot);
  } catch (err) {
    console.warn('[CRE] CodeModel load failed (non-fatal):', err.message);
  }

  const cs = claudeService || null;

  // Initialize PlanGenerator with dependencies
  planGenerator = new PlanGenerator({ db, storage, projectRoot, claudeService: cs });

  // Initialize AssertionGenerator
  assertionGenerator = new AssertionGenerator({ db, projectRoot, claudeService: cs });

  // Initialize RISGenerator
  risGenerator = new RISGenerator({ db, codeModel, storage, projectRoot, claudeService: cs });

  // Initialize Introspector
  introspector = new Introspector({ codeModel, schemaManager, projectRoot, config: creConfig, claudeService: cs });

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
 * Registers all 10 CRE IPC handlers.
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
      // Guard against concurrent planning calls corrupting singleton state
      if (planGenerator.isBusy) {
        return { success: false, error: 'Plan generator is busy. Wait for the current operation to complete.' };
      }
      // AC5: Detect dependency cycles before planning
      const cycleResult = detectPlanCycles(stories);
      if (cycleResult.hasCycle) {
        return { success: false, error: `Plan has dependency cycle involving: ${cycleResult.cycle.join(', ')}` };
      }

      return await withProcessLock(async () => {
        return await withRetry(async () => {
          // Phase 1 only: Analyze sprint for ambiguities, return questions
          const result = await planGenerator.analyzeSprint(sprintId, stories);
          return {
            success: true,
            data: {
              planId: result.planId,
              questions: result.questions,
              sprintId
            }
          };
        }, { label: 'generate-plan' });
      });
    } catch (err) {
      console.error('[CRE] cre:generate-plan error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cre:submit-answers', async (_event, args) => {
    try {
      const { planId, sprintId, stories, answers } = args;
      if (!planId || !sprintId || !stories) {
        return { success: false, error: 'planId, sprintId, and stories are required' };
      }
      // Note: no isBusy guard here — submit-answers is a continuation of the
      // generate-plan flow (QUESTIONS_PENDING → GENERATING). The process lock
      // prevents concurrent operations. If the state machine is stuck from a
      // previous failed attempt, generatePlan will transition from the current state.

      return await withProcessLock(async () => {
        return await withRetry(async () => {
          const result = await planGenerator.generatePlan(sprintId, stories, answers || []);
          return { success: true, data: { planId: result.planId, plan: result.plan, sprintId } };
        }, { label: 'submit-answers' });
      });
    } catch (err) {
      console.error('[CRE] cre:submit-answers error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cre:refine-plan', async (_event, args) => {
    try {
      const { planId, feedback } = args;
      if (!planId || !feedback) {
        return { success: false, error: 'planId and feedback are required' };
      }
      // Guard against concurrent calls corrupting singleton state
      if (planGenerator.isBusy) {
        return { success: false, error: 'Plan generator is busy. Wait for the current operation to complete.' };
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
      const { planId, storyId, sprintId, branch } = args;
      if (!planId || !storyId) {
        return { success: false, error: 'planId and storyId are required' };
      }
      return await withProcessLock(async () => {
        return await withRetry(async () => {
          const result = await risGenerator.generateRIS({
            userStoryId: storyId,
            planId,
            sprintId: sprintId || '',
            branch: branch || 'unknown'
          });
          return { success: true, data: result };
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
      // Hold process lock during verification — reads project files that
      // 3CLI may be writing to during active implementation
      return await withProcessLock(async () => {
        const assertions = planId != null
          ? assertionGenerator.getByPlan(planId)
          : assertionGenerator.getByStory(storyId);
        const results = await assertionGenerator.verify(assertions);
        return { success: true, data: results };
      });
    } catch (err) {
      console.error('[CRE] cre:verify-assertions error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── Model update handlers (process lock for write paths) ────────────

  ipcMain.handle('cre:update-model', async (_event, args) => {
    try {
      const { deltas, instance: newInstance, existingFiles, branch, baseBranch } = args || {};

      // AC6: Introspection path — analyze git changes between branches
      if (branch && baseBranch) {
        return await withProcessLock(async () => {
          const deltaResults = await introspector.analyzeChanges(branch, baseBranch);
          return { success: true, data: { updated: true, applied: deltaResults.length, source: 'introspection' } };
        });
      }

      // Delta-based update path (preferred)
      if (deltas && Array.isArray(deltas)) {
        return await withProcessLock(async () => {
          const result = codeModel.update(deltas);
          await codeModel.save();
          return { success: true, data: { updated: true, ...result } };
        });
      }

      // Legacy full-instance replacement path
      if (newInstance) {
        return await withProcessLock(async () => {
          let schema = null;
          try {
            schema = await storage.readSchema(ctx.projectRoot);
          } catch {
            console.warn('[CRE] Could not read schema for validation, proceeding without');
          }

          const { filtered, warnings } = validateAndFilter(newInstance, schema);

          if (existingFiles) {
            markStaleArtifacts(filtered, existingFiles);
          }

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

          // Reload CodeModel from disk after full replacement
          await codeModel.load(ctx.projectRoot);

          return {
            success: true,
            data: { updated: true, warnings, skipped: warnings.length }
          };
        });
      }

      return { success: true, data: { updated: false } };
    } catch (err) {
      console.error('[CRE] cre:update-model error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ── Read-only handlers (no process lock needed) ─────────────────────

  ipcMain.handle('cre:query-model', async (_event, args) => {
    try {
      const { taskDescription, maxArtifacts } = args || {};
      if (!taskDescription) {
        return { success: false, error: 'taskDescription is required' };
      }

      const result = codeModel.queryForTask(taskDescription, { maxArtifacts: maxArtifacts || 20 });
      return { success: true, data: result };
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

      // Query from DB, optionally filtering by planId
      let row;
      if (planId) {
        row = ctx.db.prepare(
          'SELECT * FROM ris WHERE story_id = ? AND plan_id = ? ORDER BY created_at DESC LIMIT 1'
        ).get(storyId, planId);
      } else {
        row = ctx.db.prepare(
          'SELECT * FROM ris WHERE story_id = ? ORDER BY created_at DESC LIMIT 1'
        ).get(storyId);
      }

      return { success: true, data: row || null };
    } catch (err) {
      console.error('[CRE] cre:get-ris error:', err.message);
      return { success: false, error: err.message };
    }
  });

  console.log('[CRE] Registered 11 IPC handlers');
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
