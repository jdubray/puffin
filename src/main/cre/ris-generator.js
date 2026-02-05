'use strict';

/**
 * @module cre/ris-generator
 * RISGenerator — produces Ready-to-Implement Specifications for user stories.
 *
 * Orchestrates code model queries, branch memory reads, assertion loading,
 * and AI prompt generation to produce context-rich RIS markdown documents.
 */

const fs = require('fs').promises;
const path = require('path');
const { randomUUID: uuidv4 } = require('crypto');
const { formatRis } = require('./lib/ris-formatter');
const generateRisPrompt = require('./lib/prompts/generate-ris');
const { sendCrePrompt, MODEL_COMPLEX, TIMEOUT_COMPLEX } = require('./lib/ai-client');

/** @readonly @enum {string} */
const RisStatus = {
  GENERATED: 'generated',
  SENT: 'sent',
  COMPLETED: 'completed'
};

/**
 * Generates RIS documents for user stories.
 */
class RISGenerator {
  /**
   * @param {Object} deps
   * @param {Object} deps.db - Database connection (better-sqlite3).
   * @param {import('./code-model').CodeModel} deps.codeModel - Code model instance.
   * @param {Object} deps.storage - CRE storage module.
   * @param {string} deps.projectRoot - Absolute path to project root.
   */
  constructor({ db, codeModel, storage, projectRoot, claudeService = null }) {
    this._db = db;
    this._codeModel = codeModel;
    this._storage = storage;
    this._projectRoot = projectRoot;
    this._claudeService = claudeService;
  }

  /**
   * AC2: Generate a RIS markdown document for a user story.
   *
   * @param {Object} params
   * @param {string} params.userStoryId - Story ID.
   * @param {string} params.planId - Plan ID (FK for DB storage).
   * @param {string} params.sprintId - Sprint ID.
   * @param {string} [params.branch] - Current branch name.
   * @returns {Promise<{ id: string, markdown: string, status: string }>}
   */
  async generateRIS({ userStoryId, planId, sprintId, branch = 'unknown' }) {
    // 1. Load story from DB
    const story = this._db.prepare(
      'SELECT * FROM user_stories WHERE id = ?'
    ).get(userStoryId);
    if (!story) {
      throw new Error(`User story not found: ${userStoryId}`);
    }

    // Parse JSON fields
    const parsedStory = {
      id: story.id,
      title: story.title,
      description: story.description || '',
      acceptanceCriteria: this._parseJson(story.acceptance_criteria, [])
    };

    // 2. Load plan and find this story's plan item
    let planItem = { order: 0, approach: '', filesCreated: [], filesModified: [], dependencies: [] };
    try {
      const plan = await this._storage.readPlan(this._projectRoot, sprintId);
      const item = (plan.planItems || []).find(
        p => p.storyId === userStoryId || p.userStoryId === userStoryId
      );
      if (item) planItem = item;
    } catch (err) {
      console.warn(`[CRE] Could not load plan for sprint ${sprintId}: ${err.message}`);
    }

    // 3. AC5: Read branch memory from disk
    const branchMemory = await this._readBranchMemory(branch);

    // 4. AC3: Query code model for relevant artifacts
    const codeContext = this.consultModel(userStoryId, planItem);

    // 5. Load assertions for this story
    const assertions = this._loadAssertions(userStoryId);

    // 6. Build prompt
    // Disable tool guidance — sendPrompt runs a one-shot CLI process without
    // MCP server connections, so hdsl_* tools are not available.
    const prompt = generateRisPrompt.buildPrompt({
      planItem,
      story: parsedStory,
      assertions,
      codeModelContext: codeContext.formatted,
      projectConfig: { branch },
      includeToolGuidance: false
    });

    // 7. AC4: Generate RIS via AI, with local fallback
    let markdown;
    const aiResult = await sendCrePrompt(this._claudeService, prompt, {
      model: MODEL_COMPLEX,
      timeout: TIMEOUT_COMPLEX,
      label: 'generate-ris'
    });

    if (aiResult.success && aiResult.data) {
      // AI returned structured RIS — use the markdown field directly
      markdown = aiResult.data.markdown || '';
      if (!markdown && aiResult.data.sections) {
        // Fallback: reconstruct from sections if markdown field is missing
        markdown = formatRis({
          context: { branch, dependencies: planItem.dependencies || [], codeModelVersion: this._codeModel.schemaVersion },
          objective: aiResult.data.sections.objective || `Implement "${parsedStory.title}"`,
          instructions: [aiResult.data.sections.instructions || ''],
          conventions: [aiResult.data.sections.conventions || ''],
          assertions: assertions.map(a => ({ message: a.message || a.description || '', type: a.type, target: a.target }))
        });
      }
      console.log(`[CRE-RIS] AI generated RIS for story ${userStoryId} (${markdown.length} chars)`);
    } else {
      // Local fallback — build RIS from plan metadata (FR-08 degraded)
      console.warn('[CRE-RIS] AI RIS generation unavailable, using local fallback');
      const risData = {
        context: {
          branch,
          dependencies: planItem.dependencies || [],
          codeModelVersion: this._codeModel.schemaVersion
        },
        objective: `Implement "${parsedStory.title}": ${parsedStory.description}`,
        instructions: this._buildInstructions(planItem),
        conventions: ['Follow camelCase naming', 'Use JSDoc for public interfaces', 'Follow existing patterns in the codebase'],
        assertions: assertions.map(a => ({
          message: a.message || a.description || '',
          type: a.type,
          target: a.target
        }))
      };
      markdown = formatRis(risData);
    }

    // 8. AC6: Store in ris table
    const risId = uuidv4();
    const now = new Date().toISOString();

    this._db.prepare(
      `INSERT INTO ris (id, plan_id, story_id, sprint_id, branch, content, status, code_model_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(risId, planId, userStoryId, sprintId, branch, markdown, RisStatus.GENERATED, this._codeModel.schemaVersion, now);

    return {
      id: risId,
      markdown,
      status: RisStatus.GENERATED,
      prompt
    };
  }

  /**
   * AC3: Query the code model for artifacts relevant to a story and plan item.
   *
   * @param {string} userStoryId - Story ID.
   * @param {Object} planItem - Plan item with approach, files, dependencies.
   * @returns {{ context: Object, formatted: string }}
   */
  consultModel(userStoryId, planItem) {
    const taskDescription = [
      planItem.approach || '',
      (planItem.filesCreated || []).join(', '),
      (planItem.filesModified || []).join(', ')
    ].filter(Boolean).join('. ');

    if (!taskDescription) {
      return { context: { summary: 'No context available', artifacts: [], dependencies: [], flows: [], stats: { totalArtifacts: 0, totalDependencies: 0, totalFlows: 0 } }, formatted: '' };
    }

    return this._codeModel.queryForTask(taskDescription);
  }

  /**
   * AC7: Update RIS status (generated → sent → completed).
   *
   * @param {string} risId - RIS record ID.
   * @param {string} newStatus - New status value.
   */
  updateStatus(risId, newStatus) {
    const valid = Object.values(RisStatus);
    if (!valid.includes(newStatus)) {
      throw new Error(`Invalid RIS status: ${newStatus}. Must be one of: ${valid.join(', ')}`);
    }
    this._db.prepare('UPDATE ris SET status = ? WHERE id = ?').run(newStatus, risId);
  }

  /**
   * Retrieve the latest RIS for a story.
   *
   * @param {string} storyId
   * @returns {Object|null}
   */
  getByStory(storyId) {
    return this._db.prepare(
      'SELECT * FROM ris WHERE story_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(storyId) || null;
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  /**
   * AC5: Read branch memory markdown from disk.
   * @param {string} branch
   * @returns {Promise<string>}
   */
  async _readBranchMemory(branch) {
    if (!branch || branch === 'unknown') return '';
    const slug = branch.replace(/\//g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
    const memoryPath = path.join(this._projectRoot, '.puffin', 'memory', 'branches', `${slug}.md`);
    try {
      return await fs.readFile(memoryPath, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Load inspection assertions for a story from DB.
   * @param {string} storyId
   * @returns {Array<Object>}
   */
  _loadAssertions(storyId) {
    try {
      return this._db.prepare(
        'SELECT * FROM inspection_assertions WHERE story_id = ? ORDER BY created_at'
      ).all(storyId);
    } catch {
      return [];
    }
  }

  /**
   * Build instruction strings from a plan item.
   * @param {Object} planItem
   * @returns {string[]}
   */
  _buildInstructions(planItem) {
    const instructions = [];
    if (planItem.approach) {
      instructions.push(planItem.approach);
    }
    if (planItem.filesCreated && planItem.filesCreated.length > 0) {
      instructions.push(`Create files: ${planItem.filesCreated.join(', ')}`);
    }
    if (planItem.filesModified && planItem.filesModified.length > 0) {
      instructions.push(`Modify files: ${planItem.filesModified.join(', ')}`);
    }
    return instructions.length > 0 ? instructions : ['Implement according to acceptance criteria'];
  }

  /**
   * Safely parse a JSON string, returning fallback on failure.
   * @param {string} json
   * @param {*} fallback
   * @returns {*}
   */
  _parseJson(json, fallback) {
    if (!json) return fallback;
    try {
      return JSON.parse(json);
    } catch {
      return fallback;
    }
  }
}

module.exports = { RISGenerator, RisStatus };
