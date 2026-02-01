'use strict';

/**
 * @module cre/lib/cre-orchestrator
 * Orchestrates the CRE planning workflow:
 *   generate-plan → submit-answers → (user reviews) → approve → generate-ris per story
 *
 * Called from the renderer's sprint orchestration layer via IPC.
 * This module coordinates CRE IPC calls in the correct sequence,
 * holding the process lock for each phase.
 *
 * Planning and approval are split into separate phases to ensure
 * users have final approval authority (spec A3, FR-05).
 */

/**
 * Orchestration status constants.
 * @readonly
 * @enum {string}
 */
const CrePhase = {
  IDLE: 'idle',
  GENERATING_PLAN: 'generating-plan',
  SUBMITTING_ANSWERS: 'submitting-answers',
  REFINING_PLAN: 'refining-plan',
  APPROVING_PLAN: 'approving-plan',
  GENERATING_RIS: 'generating-ris',
  COMPLETE: 'complete',
  ERROR: 'error'
};

/**
 * Current orchestrator state.
 * @type {{ phase: string, sprintId: string|null, planId: string|null, error: string|null }}
 */
let _state = {
  phase: CrePhase.IDLE,
  sprintId: null,
  planId: null,
  error: null
};

/**
 * Whether an orchestration operation is currently in progress.
 * Guards against concurrent calls clobbering singleton state.
 * @type {boolean}
 */
let _running = false;

/**
 * Get the current orchestrator state (read-only snapshot).
 * @returns {{ phase: string, sprintId: string|null, planId: string|null, error: string|null }}
 */
function getState() {
  return { ..._state };
}

/**
 * Reset orchestrator to idle state.
 */
function reset() {
  _state = {
    phase: CrePhase.IDLE,
    sprintId: null,
    planId: null,
    error: null
  };
  _running = false;
}

/**
 * Run the CRE planning phase for a sprint (plan generation only).
 *
 * Sequence: generate-plan → submit-answers → return plan for user review.
 * Does NOT approve or generate RIS — that requires user-initiated approval.
 * The process lock is held for the duration (AC3).
 *
 * @param {Object} params
 * @param {string} params.sprintId - Sprint identifier.
 * @param {Array<Object>} params.stories - Stories with id, title, description, acceptanceCriteria, dependsOn.
 * @param {Object} handlers - IPC handler functions (injected to allow testing).
 * @param {Function} handlers.generatePlan - cre:generate-plan handler.
 * @param {Function} handlers.submitAnswers - cre:submit-answers handler.
 * @param {Function} handlers.acquireLock - Acquire process lock.
 * @param {Function} handlers.releaseLock - Release process lock.
 * @returns {Promise<{ plan: Object }>} Plan data for user review.
 */
async function runPlanningPhase({ sprintId, stories }, handlers) {
  if (_running) {
    throw new Error('Orchestrator is already running. Concurrent calls are not allowed.');
  }

  const { generatePlan, submitAnswers, acquireLock, releaseLock } = handlers;

  _running = true;
  reset();
  _state.sprintId = sprintId;

  // AC3: Acquire process lock for planning phase
  acquireLock();

  try {
    // Step 1: Generate plan (analyze + produce questions)
    _state.phase = CrePhase.GENERATING_PLAN;
    console.log('[CRE-ORCH] Generating plan for sprint:', sprintId);

    const planResult = await generatePlan({ sprintId, stories });
    if (!planResult.success) {
      throw new Error(`Plan generation failed: ${planResult.error}`);
    }

    const planId = planResult.data?.planId || sprintId;
    _state.planId = planId;

    // Step 2: Submit answers if handler provided (Q&A flow)
    if (submitAnswers) {
      _state.phase = CrePhase.SUBMITTING_ANSWERS;
      console.log('[CRE-ORCH] Submitting answers for plan:', planId);

      const answerResult = await submitAnswers({ planId, sprintId, stories });
      if (!answerResult.success) {
        throw new Error(`Answer submission failed: ${answerResult.error}`);
      }
    }

    // Plan is ready for user review — do NOT auto-approve
    _state.phase = CrePhase.IDLE;
    console.log('[CRE-ORCH] Plan ready for user review:', planId);

    return { plan: planResult.data };
  } catch (err) {
    _state.phase = CrePhase.ERROR;
    _state.error = err.message;
    console.error('[CRE-ORCH] Planning phase error:', err.message);
    throw err;
  } finally {
    // AC3: Always release lock when planning phase ends
    releaseLock();
    _running = false;
  }
}

/**
 * Run the CRE approval phase (user-initiated).
 *
 * Sequence: approve-plan → generate-ris per story.
 * Called after the user reviews the plan and clicks "Approve".
 * The process lock is held for the duration (AC3).
 *
 * @param {Object} params
 * @param {string} params.planId - Plan to approve.
 * @param {Array<Object>} params.stories - Stories for RIS generation.
 * @param {Object} handlers - IPC handler functions (injected to allow testing).
 * @param {Function} handlers.approvePlan - cre:approve-plan handler.
 * @param {Function} handlers.generateRis - cre:generate-ris handler.
 * @param {Function} handlers.acquireLock - Acquire process lock.
 * @param {Function} handlers.releaseLock - Release process lock.
 * @returns {Promise<{ risMap: Object<string, Object> }>}
 */
async function runApprovalPhase({ planId, stories }, handlers) {
  if (_running) {
    throw new Error('Orchestrator is already running. Concurrent calls are not allowed.');
  }

  const { approvePlan, generateRis, acquireLock, releaseLock } = handlers;

  _running = true;
  _state.phase = CrePhase.APPROVING_PLAN;
  _state.planId = planId;

  acquireLock();

  try {
    // Step 1: Approve plan
    console.log('[CRE-ORCH] Approving plan:', planId);
    const approveResult = await approvePlan({ planId });
    if (!approveResult.success) {
      throw new Error(`Plan approval failed: ${approveResult.error}`);
    }

    // Step 2: Generate RIS for each story in order
    _state.phase = CrePhase.GENERATING_RIS;
    const risMap = {};

    for (const story of stories) {
      console.log('[CRE-ORCH] Generating RIS for story:', story.id, story.title);
      const risResult = await generateRis({ planId, storyId: story.id });
      if (!risResult.success) {
        console.warn('[CRE-ORCH] RIS generation failed for story:', story.id, risResult.error);
        risMap[story.id] = { error: risResult.error };
      } else {
        risMap[story.id] = risResult.data;
      }
    }

    _state.phase = CrePhase.COMPLETE;
    console.log('[CRE-ORCH] Approval phase complete for plan:', planId);

    return { risMap };
  } catch (err) {
    _state.phase = CrePhase.ERROR;
    _state.error = err.message;
    console.error('[CRE-ORCH] Approval phase error:', err.message);
    throw err;
  } finally {
    releaseLock();
    _running = false;
  }
}

/**
 * Run the refine-plan loop.
 * Called when the user provides feedback on a generated plan.
 *
 * @param {Object} params
 * @param {string} params.planId - Plan to refine.
 * @param {string} params.feedback - User feedback text.
 * @param {Function} refinePlan - cre:refine-plan handler.
 * @param {Function} acquireLock - Acquire process lock.
 * @param {Function} releaseLock - Release process lock.
 * @returns {Promise<Object>} Refined plan data.
 */
async function runRefinement({ planId, feedback }, refinePlan, acquireLock, releaseLock) {
  if (_running) {
    throw new Error('Orchestrator is already running. Concurrent calls are not allowed.');
  }

  _running = true;
  _state.phase = CrePhase.REFINING_PLAN;
  _state.planId = planId;

  acquireLock();
  try {
    console.log('[CRE-ORCH] Refining plan:', planId);
    const result = await refinePlan({ planId, feedback });
    if (!result.success) {
      throw new Error(`Plan refinement failed: ${result.error}`);
    }
    _state.phase = CrePhase.IDLE;
    return result.data;
  } catch (err) {
    _state.phase = CrePhase.ERROR;
    _state.error = err.message;
    throw err;
  } finally {
    releaseLock();
    _running = false;
  }
}

/**
 * Run introspection (cre:update-model) after a story completes.
 * Blocks until complete (AC5).
 *
 * @param {Object} params
 * @param {Object} [params.instance] - Updated code model instance.
 * @param {string[]} [params.existingFiles] - Current file list for stale detection.
 * @param {Function} updateModel - cre:update-model handler.
 * @returns {Promise<Object>} Update result.
 */
async function runIntrospection({ instance, existingFiles }, updateModel) {
  console.log('[CRE-ORCH] Running introspection (cre:update-model)');
  const result = await updateModel({ instance, existingFiles });
  if (!result.success && !result.data?.inMemoryOnly) {
    console.warn('[CRE-ORCH] Introspection warning:', result.error);
  }
  console.log('[CRE-ORCH] Introspection complete');
  return result;
}

module.exports = {
  CrePhase,
  getState,
  reset,
  runPlanningPhase,
  runApprovalPhase,
  runRefinement,
  runIntrospection
};
