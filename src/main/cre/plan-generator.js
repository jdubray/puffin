'use strict';

/**
 * @module cre/plan-generator
 * PlanGenerator — drives plan creation through a state machine.
 *
 * States: IDLE → ANALYZING → QUESTIONS_PENDING → GENERATING → REVIEW_PENDING → APPROVED
 *
 * Methods:
 *   analyzeSprint(sprintId)      — loads stories, returns clarifying questions
 *   generatePlan(sprintId, answers) — produces ordered PlanItems
 *   refinePlan(planId, feedback)  — updates plan from feedback
 *   approvePlan(planId)           — transitions to APPROVED, triggers assertion generation
 */

const { randomUUID: uuidv4 } = require('crypto');
const { sendCrePrompt, MODEL_COMPLEX, MODEL_EXTRACT, TIMEOUT_COMPLEX, TIMEOUT_EXTRACT } = require('./lib/ai-client');

/**
 * Valid plan states.
 * @readonly
 * @enum {string}
 */
const PlanState = {
  IDLE: 'idle',
  ANALYZING: 'analyzing',
  QUESTIONS_PENDING: 'questions_pending',
  GENERATING: 'generating',
  REVIEW_PENDING: 'review_pending',
  APPROVED: 'approved'
};

/**
 * Valid state transitions.
 * @type {Object<string, string[]>}
 */
const VALID_TRANSITIONS = {
  [PlanState.IDLE]: [PlanState.ANALYZING],
  [PlanState.ANALYZING]: [PlanState.QUESTIONS_PENDING, PlanState.GENERATING],
  [PlanState.QUESTIONS_PENDING]: [PlanState.GENERATING],
  [PlanState.GENERATING]: [PlanState.REVIEW_PENDING],
  [PlanState.REVIEW_PENDING]: [PlanState.GENERATING, PlanState.APPROVED],
  [PlanState.APPROVED]: [PlanState.IDLE]
};

/**
 * PlanGenerator drives sprint plan creation through a structured state machine.
 */
class PlanGenerator {
  /**
   * @param {Object} deps - Injected dependencies.
   * @param {Object} deps.db - Database connection (better-sqlite3 instance).
   * @param {Object} deps.storage - CRE storage module.
   * @param {string} deps.projectRoot - Absolute path to project root.
   * @param {Object} [deps.claudeService] - ClaudeService instance for AI calls.
   * @param {Object} [deps.promptBuilders] - Prompt template modules (for testing).
   */
  constructor({ db, storage, projectRoot, claudeService = null, promptBuilders = null }) {
    this._db = db;
    this._storage = storage;
    this._projectRoot = projectRoot;
    this._claudeService = claudeService;
    this._promptBuilders = promptBuilders || {
      analyzeAmbiguities: require('./lib/prompts/analyze-ambiguities'),
      generatePlan: require('./lib/prompts/generate-plan'),
      refinePlan: require('./lib/prompts/refine-plan'),
      generateAssertions: require('./lib/prompts/generate-assertions')
    };

    /** @type {string} */
    this._state = PlanState.IDLE;
    /** @type {string|null} */
    this._currentPlanId = null;
    /** @type {string|null} */
    this._currentSprintId = null;
    /** @type {Array<Object>} */
    this._currentStories = [];
    /** @type {Array<string>} */
    this._pendingQuestions = [];
    /** @type {Array<{ questions: Array, answers: Array, feedback: string|null }>} */
    this._clarificationHistory = [];
  }

  /** Current state machine state. */
  get state() { return this._state; }

  /** Current plan ID being worked on. */
  get currentPlanId() { return this._currentPlanId; }

  /** Current pending questions from analysis. */
  get pendingQuestions() { return this._pendingQuestions; }

  /**
   * Whether the plan generator is busy (not IDLE and not waiting for user input).
   * Used by IPC handlers to reject concurrent calls gracefully.
   * @returns {boolean}
   */
  get isBusy() {
    return this._state === PlanState.ANALYZING || this._state === PlanState.GENERATING;
  }

  /**
   * Transition to a new state. Throws if transition is invalid (AC6).
   * @param {string} newState
   */
  _transition(newState) {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed || !allowed.includes(newState)) {
      throw new Error(
        `Invalid state transition: ${this._state} → ${newState}. ` +
        `Allowed: [${(allowed || []).join(', ')}]`
      );
    }
    console.log(`[CRE-PLAN] State: ${this._state} → ${newState}`);
    this._state = newState;
  }

  /**
   * AC2: Load user stories for a sprint and return clarifying questions.
   *
   * @param {string} sprintId
   * @param {Array<Object>} stories - Stories with id, title, description, acceptanceCriteria.
   * @param {string} [codeModelSummary] - Optional code model context.
   * @returns {Promise<{ questions: Array, planId: string }>}
   */
  async analyzeSprint(sprintId, stories, codeModelSummary = '') {
    // Reset to IDLE if a previous attempt left us in a non-idle state
    // (e.g. retry after failure during analysis)
    if (this._state !== PlanState.IDLE) {
      console.log(`[CRE-PLAN] Resetting from ${this._state} to IDLE before analysis`);
      this._state = PlanState.IDLE;
    }
    this._transition(PlanState.ANALYZING);
    this._currentSprintId = sprintId;
    this._currentStories = stories;
    this._pendingQuestions = [];
    this._clarificationHistory = [];

    // Create or reuse plan record in DB (AC8)
    // A previous failed attempt may have already inserted a row for this sprint
    const existingPlan = this._db.prepare(
      `SELECT id FROM plans WHERE sprint_id = ?`
    ).get(sprintId);

    let planId;
    const filePath = `plans/${sprintId}.json`;
    const now = new Date().toISOString();

    if (existingPlan) {
      planId = existingPlan.id;
      this._db.prepare(
        `UPDATE plans SET status = 'draft', iteration = 0, updated_at = ? WHERE id = ?`
      ).run(now, planId);
    } else {
      planId = uuidv4();
      this._db.prepare(
        `INSERT INTO plans (id, sprint_id, status, file_path, iteration, created_at, updated_at)
         VALUES (?, ?, 'draft', ?, 0, ?, ?)`
      ).run(planId, sprintId, filePath, now, now);
    }

    this._currentPlanId = planId;

    // Build analysis prompt
    const promptParts = this._promptBuilders.analyzeAmbiguities.buildPrompt({
      stories,
      codeModelSummary
    });

    // Send to AI for ambiguity analysis (FR-02)
    let questions = [];
    const aiResult = await sendCrePrompt(this._claudeService, promptParts, {
      model: MODEL_EXTRACT,
      timeout: TIMEOUT_EXTRACT,
      label: 'analyze-ambiguities'
    });

    if (aiResult.success && aiResult.data) {
      questions = aiResult.data.questions || [];
      console.log(`[CRE-PLAN] AI identified ${questions.length} clarifying questions`);
    } else {
      console.warn('[CRE-PLAN] AI ambiguity analysis unavailable, proceeding without questions');
    }

    // Store pending questions for the Q&A pause (FR-02)
    this._pendingQuestions = questions;

    // Always transition to QUESTIONS_PENDING — the UI decides whether to pause
    this._transition(PlanState.QUESTIONS_PENDING);

    return {
      planId,
      prompt: promptParts,
      questions
    };
  }

  /**
   * AC3: Generate a plan with ordered PlanItems.
   *
   * @param {string} sprintId
   * @param {Array<Object>} stories - Stories with id, title, description, acceptanceCriteria.
   * @param {Array<Object>} [answers] - Answers to clarifying questions.
   * @param {string} [codeModelContext] - Code model context string.
   * @returns {Promise<{ planId: string, plan: Object }>}
   */
  async generatePlan(sprintId, stories, answers = [], codeModelContext = '') {
    // Allow generating from QUESTIONS_PENDING (after analysis) or ANALYZING (skip questions).
    // If a previous error left us in an unexpected state, force to QUESTIONS_PENDING first.
    if (this._state !== PlanState.QUESTIONS_PENDING && this._state !== PlanState.ANALYZING) {
      console.log(`[CRE-PLAN] generatePlan: resetting from ${this._state} to QUESTIONS_PENDING`);
      this._state = PlanState.QUESTIONS_PENDING;
    }
    this._transition(PlanState.GENERATING);

    const planId = this._currentPlanId;
    if (!planId) {
      throw new Error('No active plan. Call analyzeSprint() first.');
    }

    // Record Q&A exchange in clarification history (FR-02)
    if (this._pendingQuestions.length > 0 || answers.length > 0) {
      this._clarificationHistory.push({
        questions: [...this._pendingQuestions],
        answers: Array.isArray(answers) ? answers : [],
        feedback: null
      });
    }
    this._pendingQuestions = [];

    // Build generation prompt (includes answers if provided)
    const promptParts = this._promptBuilders.generatePlan.buildPrompt({
      stories,
      answers,
      codeModelContext
    });

    // Send to AI for plan generation (FR-03)
    let planItems = [];
    let sharedComponents = [];
    let risks = [];
    const aiResult = await sendCrePrompt(this._claudeService, promptParts, {
      model: MODEL_COMPLEX,
      timeout: TIMEOUT_COMPLEX,
      label: 'generate-plan'
    });

    if (aiResult.success && aiResult.data) {
      planItems = aiResult.data.planItems || [];
      sharedComponents = aiResult.data.sharedComponents || [];
      risks = aiResult.data.risks || [];
      console.log(`[CRE-PLAN] AI generated plan with ${planItems.length} items, ${risks.length} risks`);
      if (planItems.length === 0) {
        console.warn('[CRE-PLAN] AI returned success but with 0 planItems — plan may be incomplete');
      }
    } else {
      console.error('[CRE-PLAN] AI plan generation failed:', aiResult.error || 'no data returned');
      console.warn('[CRE-PLAN] Creating empty plan skeleton — user will need to request changes');
    }

    // Create plan document (AC7) — includes clarification history for context preservation
    const plan = {
      id: planId,
      sprintId,
      status: 'review_pending',
      iteration: 1,
      stories: stories.map(s => ({ id: s.id, title: s.title })),
      planItems,
      sharedComponents,
      risks,
      clarificationHistory: this._clarificationHistory,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save plan to file (AC7)
    await this._storage.writePlan(this._projectRoot, sprintId, plan);

    // Update DB row (AC8)
    this._db.prepare(
      `UPDATE plans SET status = 'review_pending', iteration = 1, updated_at = ?
       WHERE id = ?`
    ).run(new Date().toISOString(), planId);

    this._transition(PlanState.REVIEW_PENDING);

    return { planId, plan, prompt: promptParts };
  }

  /**
   * AC4: Refine a plan based on user feedback.
   *
   * @param {string} planId
   * @param {string} feedback - User feedback text.
   * @param {string} [codeModelContext] - Code model context.
   * @returns {Promise<{ plan: Object, prompt: Object }>}
   */
  async refinePlan(planId, feedback, codeModelContext = '') {
    if (planId !== this._currentPlanId) {
      throw new Error(`Plan ${planId} is not the active plan.`);
    }

    // REVIEW_PENDING → GENERATING (allowed by state machine)
    this._transition(PlanState.GENERATING);

    // Read current plan
    const currentPlan = await this._storage.readPlan(this._projectRoot, this._currentSprintId);
    const iteration = (currentPlan.iteration || 0) + 1;

    // Record refinement feedback in clarification history (FR-05)
    this._clarificationHistory.push({
      questions: [],
      answers: [],
      feedback
    });

    // Build refinement prompt — includes full clarification history for context
    const promptParts = this._promptBuilders.refinePlan.buildPrompt({
      plan: currentPlan,
      feedback,
      codeModelContext,
      iteration
    });

    // Send to AI for plan refinement (FR-05)
    const aiResult = await sendCrePrompt(this._claudeService, promptParts, {
      model: MODEL_COMPLEX,
      timeout: TIMEOUT_COMPLEX,
      label: 'refine-plan'
    });

    if (aiResult.success && aiResult.data) {
      // Merge AI refinements into the plan
      if (aiResult.data.planItems) currentPlan.planItems = aiResult.data.planItems;
      if (aiResult.data.sharedComponents) currentPlan.sharedComponents = aiResult.data.sharedComponents;
      if (aiResult.data.risks) currentPlan.risks = aiResult.data.risks;
      if (aiResult.data.changelog) currentPlan.changelog = aiResult.data.changelog;
      // Capture any new questions from refinement
      if (aiResult.data.questions && Array.isArray(aiResult.data.questions)) {
        currentPlan.questions = aiResult.data.questions;
      }
      console.log(`[CRE-PLAN] AI refined plan (iteration ${iteration})`);
    } else {
      console.warn('[CRE-PLAN] AI refinement unavailable, plan unchanged');
    }

    // Update plan metadata and clarification history
    currentPlan.iteration = iteration;
    currentPlan.status = 'review_pending';
    currentPlan.clarificationHistory = this._clarificationHistory;
    currentPlan.updatedAt = new Date().toISOString();

    // Save updated plan (AC7)
    await this._storage.writePlan(this._projectRoot, this._currentSprintId, currentPlan);

    // Update DB (AC8)
    this._db.prepare(
      `UPDATE plans SET status = 'review_pending', iteration = ?, updated_at = ?
       WHERE id = ?`
    ).run(iteration, currentPlan.updatedAt, planId);

    this._transition(PlanState.REVIEW_PENDING);

    return { plan: currentPlan, prompt: promptParts };
  }

  /**
   * AC5: Approve a plan — transitions to APPROVED, triggers assertion generation.
   *
   * @param {string} planId
   * @returns {Promise<{ plan: Object, assertionPrompts: Array }>}
   */
  async approvePlan(planId) {
    if (planId !== this._currentPlanId) {
      throw new Error(`Plan ${planId} is not the active plan.`);
    }

    // REVIEW_PENDING → APPROVED
    this._transition(PlanState.APPROVED);

    const now = new Date().toISOString();

    // Read plan
    const plan = await this._storage.readPlan(this._projectRoot, this._currentSprintId);
    plan.status = 'approved';
    plan.approvedAt = now;
    plan.updatedAt = now;

    // Save approved plan (AC7)
    await this._storage.writePlan(this._projectRoot, this._currentSprintId, plan);

    // Update DB with approval (AC8)
    this._db.prepare(
      `UPDATE plans SET status = 'approved', approved_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(now, now, planId);

    // Generate assertion prompts for each story (AC5)
    const assertionPrompts = (plan.planItems || []).map(item => {
      const story = (plan.stories || []).find(s => s.id === item.storyId) || { id: item.storyId, title: item.title };
      return {
        storyId: item.storyId,
        prompt: this._promptBuilders.generateAssertions.buildPrompt({
          planItem: item,
          story
        })
      };
    });

    console.log(`[CRE-PLAN] Plan ${planId} approved. ${assertionPrompts.length} assertion prompts generated.`);

    // Reset to IDLE for next planning session
    this._transition(PlanState.IDLE);
    this._currentPlanId = null;
    this._currentSprintId = null;

    return { plan, assertionPrompts };
  }

  /**
   * Reset the state machine to IDLE. For error recovery.
   */
  reset() {
    this._state = PlanState.IDLE;
    this._currentPlanId = null;
    this._currentSprintId = null;
    this._currentStories = [];
    this._pendingQuestions = [];
    this._clarificationHistory = [];
  }
}

module.exports = { PlanGenerator, PlanState, VALID_TRANSITIONS };
