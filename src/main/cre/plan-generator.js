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
   * @param {Object} [deps.promptBuilders] - Prompt template modules (for testing).
   */
  constructor({ db, storage, projectRoot, promptBuilders = null }) {
    this._db = db;
    this._storage = storage;
    this._projectRoot = projectRoot;
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
  }

  /** Current state machine state. */
  get state() { return this._state; }

  /** Current plan ID being worked on. */
  get currentPlanId() { return this._currentPlanId; }

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
    this._transition(PlanState.ANALYZING);
    this._currentSprintId = sprintId;

    // Create plan record in DB (AC8)
    const planId = uuidv4();
    const filePath = `plans/${sprintId}.json`;
    const now = new Date().toISOString();

    this._db.prepare(
      `INSERT INTO cre_plans (id, sprint_id, status, file_path, iteration, created_at, updated_at)
       VALUES (?, ?, 'draft', ?, 0, ?, ?)`
    ).run(planId, sprintId, filePath, now, now);

    this._currentPlanId = planId;

    // Build analysis prompt
    const prompt = this._promptBuilders.analyzeAmbiguities.buildPrompt({
      stories,
      codeModelSummary
    });

    // Transition based on whether there would be questions
    // In production, the AI response would be parsed here.
    // For now, we return the prompt data and transition to QUESTIONS_PENDING.
    this._transition(PlanState.QUESTIONS_PENDING);

    return {
      planId,
      prompt,
      questions: [] // Populated by caller after AI invocation
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
    // Allow generating from QUESTIONS_PENDING (after analysis) or ANALYZING (skip questions)
    this._transition(PlanState.GENERATING);

    const planId = this._currentPlanId;
    if (!planId) {
      throw new Error('No active plan. Call analyzeSprint() first.');
    }

    // Build generation prompt
    const prompt = this._promptBuilders.generatePlan.buildPrompt({
      stories,
      answers,
      codeModelContext
    });

    // Create plan document skeleton (AC7)
    const plan = {
      id: planId,
      sprintId,
      status: 'review_pending',
      iteration: 1,
      stories: stories.map(s => ({ id: s.id, title: s.title })),
      planItems: [],     // Populated after AI response
      sharedComponents: [],
      risks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save plan to file (AC7)
    await this._storage.writePlan(this._projectRoot, sprintId, plan);

    // Update DB row (AC8)
    this._db.prepare(
      `UPDATE cre_plans SET status = 'review_pending', iteration = 1, updated_at = ?
       WHERE id = ?`
    ).run(new Date().toISOString(), planId);

    this._transition(PlanState.REVIEW_PENDING);

    return { planId, plan, prompt };
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

    // Build refinement prompt
    const prompt = this._promptBuilders.refinePlan.buildPrompt({
      plan: currentPlan,
      feedback,
      codeModelContext,
      iteration
    });

    // Update plan metadata
    currentPlan.iteration = iteration;
    currentPlan.status = 'review_pending';
    currentPlan.updatedAt = new Date().toISOString();

    // Save updated plan (AC7)
    await this._storage.writePlan(this._projectRoot, this._currentSprintId, currentPlan);

    // Update DB (AC8)
    this._db.prepare(
      `UPDATE cre_plans SET status = 'review_pending', iteration = ?, updated_at = ?
       WHERE id = ?`
    ).run(iteration, currentPlan.updatedAt, planId);

    this._transition(PlanState.REVIEW_PENDING);

    return { plan: currentPlan, prompt };
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
      `UPDATE cre_plans SET status = 'approved', approved_at = ?, updated_at = ?
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
  }
}

module.exports = { PlanGenerator, PlanState, VALID_TRANSITIONS };
