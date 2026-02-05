'use strict';

/**
 * @module cre/assertion-generator
 * AssertionGenerator — creates and verifies inspection assertions for plan items.
 *
 * Generates InspectionAssertion[] from plan items using AI prompt templates,
 * then verifies them against the codebase returning pass/fail/pending results.
 *
 * Supported assertion types:
 *   - file_exists: Check that a file or directory exists
 *   - function_exists: Check that a function is defined in a file
 *   - export_exists: Check that specific exports exist in a module
 *   - pattern_match: Check for presence/absence of a regex pattern in a file
 */

const fs = require('fs').promises;
const path = require('path');

/** @readonly @enum {string} */
const AssertionType = {
  FILE_EXISTS: 'file_exists',
  FUNCTION_EXISTS: 'function_exists',
  EXPORT_EXISTS: 'export_exists',
  PATTERN_MATCH: 'pattern_match'
};

const VALID_TYPES = new Set(Object.values(AssertionType));

/** @readonly @enum {string} */
const AssertionResult = {
  PASS: 'pass',
  FAIL: 'fail',
  PENDING: 'pending'
};

const { randomUUID: uuidv4 } = require('crypto');
const { sendCrePrompt, MODEL_EXTRACT, TIMEOUT_EXTRACT } = require('./lib/ai-client');

/** JSON Schema for structured assertion output. */
const ASSERTION_SCHEMA = require('../schemas/cre-assertions.schema.json');

/** Maximum allowed length for user/AI-provided regex patterns. */
const MAX_PATTERN_LENGTH = 200;

/**
 * Detects regex patterns likely to cause catastrophic backtracking (ReDoS).
 * Rejects nested quantifiers like (a+)+ or (a|b?)* which are common ReDoS vectors.
 *
 * @param {string} pattern
 * @returns {boolean} true if the pattern appears safe
 */
function isSafeRegex(pattern) {
  if (pattern.length > MAX_PATTERN_LENGTH) return false;
  // Reject nested quantifiers: a quantifier applied to a group containing a quantifier
  // e.g. (a+)+, (a*){2,}, (a|b?)+
  if (/(\+|\*|\?|\{[^}]+\})\s*\)(\+|\*|\?|\{[^}]+\})/.test(pattern)) return false;
  // Reject overlapping alternation with quantifiers inside groups: (a+|b+)+
  if (/\([^)]*(\+|\*)[^)]*\|[^)]*(\+|\*)[^)]*\)(\+|\*|\?)/.test(pattern)) return false;
  return true;
}

/**
 * AssertionGenerator creates inspection assertions from plan items
 * and verifies them against the project codebase.
 */
class AssertionGenerator {
  /**
   * @param {Object} deps
   * @param {Object} deps.db - Database connection (better-sqlite3).
   * @param {string} deps.projectRoot - Absolute path to project root.
   * @param {Object} [deps.promptBuilders] - Prompt template modules (for testing).
   */
  constructor({ db, projectRoot, claudeService = null, promptBuilders = null }) {
    this._db = db;
    this._projectRoot = projectRoot;
    this._claudeService = claudeService;
    this._promptBuilders = promptBuilders || {
      generateAssertions: require('./lib/prompts/generate-assertions')
    };
  }

  /**
   * AC2: Generate InspectionAssertion[] for a plan item using AI prompt.
   *
   * In production, the returned prompt would be sent to the AI and the
   * response parsed. For now, this stores any provided assertions and
   * returns the prompt for the caller to process.
   *
   * @param {Object} params
   * @param {Object} params.planItem - Plan item with storyId, approach, files.
   * @param {Object} params.story - Story with id, title, description, acceptanceCriteria.
   * @param {string} params.planId - The plan ID (FK for DB storage).
   * @param {Object} [params.codeModelContext] - Code model context string.
   * @param {Array<Object>} [params.assertions] - Pre-computed assertions to store directly.
   * @returns {Promise<{ prompt: Object, assertions: Array<Object> }>}
   */
  async generate({ planItem, story, planId, codeModelContext = '', assertions = null }) {
    if (!planItem || !story || !planId) {
      throw new Error('planItem, story, and planId are required');
    }

    const storyId = story.id || planItem.storyId;
    if (!storyId) {
      throw new Error('story.id or planItem.storyId is required');
    }

    // Build prompt for AI (AC2)
    // Disable tool guidance — sendPrompt runs a one-shot CLI process without
    // MCP server connections, so hdsl_* tools are not available.
    const prompt = this._promptBuilders.generateAssertions.buildPrompt({
      planItem,
      story,
      codeModelContext,
      includeToolGuidance: false
    });

    // Use provided assertions, or generate via AI if none given (FR-04)
    let toStore = assertions;
    let fromAI = false;
    if (!toStore || toStore.length === 0) {
      fromAI = true;
      const aiResult = await sendCrePrompt(this._claudeService, prompt, {
        model: MODEL_EXTRACT,
        timeout: TIMEOUT_EXTRACT,
        label: 'generate-assertions',
        jsonSchema: ASSERTION_SCHEMA
      });

      if (aiResult.success && aiResult.data && Array.isArray(aiResult.data.assertions)) {
        toStore = aiResult.data.assertions;
        console.log(`[CRE-ASSERT] AI generated ${toStore.length} assertions for story ${storyId}`);
      } else {
        console.warn(`[CRE-ASSERT] AI assertion generation failed for story ${storyId}`);
        if (aiResult.error) {
          console.warn('[CRE-ASSERT] Error:', aiResult.error);
        }
        if (aiResult.raw) {
          console.warn('[CRE-ASSERT] Raw response (first 300 chars):', aiResult.raw.substring(0, 300));
        }
        toStore = [];
      }
    }

    // Validate and store assertions
    const stored = [];
    let validationFailures = 0;
    for (const a of toStore) {
      if (fromAI) {
        // AI-generated assertions: skip invalid ones gracefully
        try {
          const validated = this._validateAssertion(a);
          const record = this._storeAssertion(planId, storyId, validated);
          stored.push(record);
        } catch (err) {
          validationFailures++;
          console.warn(`[CRE-ASSERT] Skipping invalid assertion: ${err.message}`, JSON.stringify(a).substring(0, 200));
        }
      } else {
        // User-provided assertions: throw on validation failure
        const validated = this._validateAssertion(a);
        const record = this._storeAssertion(planId, storyId, validated);
        stored.push(record);
      }
    }
    if (validationFailures > 0) {
      console.warn(`[CRE-ASSERT] ${validationFailures}/${toStore.length} assertions failed validation for story ${storyId}`);
    }

    return { prompt, assertions: stored };
  }

  /**
   * AC3: Validate an assertion object has the correct type and shape.
   *
   * @param {Object} assertion - Raw assertion from AI response.
   * @returns {Object} Validated assertion.
   * @throws {Error} If type is not supported.
   */
  _validateAssertion(assertion) {
    const { type, target, message, assertion: data } = assertion;

    if (!type || !VALID_TYPES.has(type)) {
      throw new Error(`Unsupported assertion type: ${type}. Valid: ${[...VALID_TYPES].join(', ')}`);
    }
    if (!target) {
      throw new Error('Assertion target is required');
    }

    return {
      id: assertion.id || uuidv4(),
      type,
      target,
      message: message || '',
      assertion: data || {}
    };
  }

  /**
   * AC5: Store an assertion in the inspection_assertions table.
   *
   * @param {string} planId
   * @param {string} storyId
   * @param {Object} assertion - Validated assertion.
   * @returns {Object} Stored assertion record.
   */
  _storeAssertion(planId, storyId, assertion) {
    const id = assertion.id || uuidv4();
    const now = new Date().toISOString();

    this._db.prepare(
      `INSERT INTO inspection_assertions (id, plan_id, story_id, type, target, message, assertion_data, result, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).run(id, planId, storyId, assertion.type, assertion.target, assertion.message, JSON.stringify(assertion.assertion), now);

    return {
      id,
      planId,
      storyId,
      type: assertion.type,
      target: assertion.target,
      message: assertion.message,
      assertion: assertion.assertion,
      result: AssertionResult.PENDING,
      createdAt: now
    };
  }

  /**
   * AC4: Verify assertions against the codebase, returning pass/fail/pending.
   *
   * @param {Array<Object>} assertions - Assertions to verify (from DB or generate).
   * @param {string} [projectRoot] - Override project root (defaults to constructor value).
   * @returns {Promise<Array<Object>>} Assertions with updated result and verifiedAt.
   */
  async verify(assertions, projectRoot) {
    const root = projectRoot || this._projectRoot;
    const results = [];

    for (const assertion of assertions) {
      const result = await this._verifyOne(assertion, root);
      results.push(result);

      // AC6: Persist verification results and timestamps
      this._persistResult(assertion.id, result.result, result.verifiedAt);
    }

    return results;
  }

  /**
   * Verify a single assertion against the codebase.
   *
   * @param {Object} assertion
   * @param {string} root - Project root.
   * @returns {Promise<Object>} Assertion with result.
   */
  async _verifyOne(assertion, root) {
    const normalizedRoot = path.resolve(root) + path.sep;
    const target = path.resolve(root, assertion.target);
    if (!target.startsWith(normalizedRoot) && target !== path.resolve(root)) {
      console.warn(`[CRE-ASSERT] Path traversal blocked: ${assertion.target}`);
      return { ...assertion, result: AssertionResult.FAIL, verifiedAt: new Date().toISOString() };
    }
    const now = new Date().toISOString();
    let result;

    try {
      switch (assertion.type) {
        case AssertionType.FILE_EXISTS:
          result = await this._verifyFileExists(target, assertion.assertion);
          break;
        case AssertionType.FUNCTION_EXISTS:
          result = await this._verifyFunctionExists(target, assertion.assertion);
          break;
        case AssertionType.EXPORT_EXISTS:
          result = await this._verifyExportExists(target, assertion.assertion);
          break;
        case AssertionType.PATTERN_MATCH:
          result = await this._verifyPatternMatch(target, assertion.assertion);
          break;
        default:
          result = AssertionResult.FAIL;
      }
    } catch {
      result = AssertionResult.FAIL;
    }

    return { ...assertion, result, verifiedAt: now };
  }

  /**
   * Check that a file or directory exists.
   * @param {string} target - Absolute path.
   * @param {Object} data - { kind: 'file' | 'directory' }
   * @returns {Promise<string>}
   */
  async _verifyFileExists(target, data) {
    try {
      const stat = await fs.stat(target);
      if (data && data.kind === 'directory') {
        return stat.isDirectory() ? AssertionResult.PASS : AssertionResult.FAIL;
      }
      return stat.isFile() ? AssertionResult.PASS : AssertionResult.FAIL;
    } catch {
      return AssertionResult.FAIL;
    }
  }

  /**
   * Check that a function is defined in a file.
   * @param {string} target - Absolute file path.
   * @param {Object} data - { name: string }
   * @returns {Promise<string>}
   */
  async _verifyFunctionExists(target, data) {
    if (!data || !data.name) return AssertionResult.FAIL;
    try {
      const content = await fs.readFile(target, 'utf8');
      // Match function declarations, methods, arrow functions assigned to the name
      const patterns = [
        new RegExp(`function\\s+${this._escapeRegex(data.name)}\\s*\\(`),
        new RegExp(`${this._escapeRegex(data.name)}\\s*\\(`),
        new RegExp(`${this._escapeRegex(data.name)}\\s*=\\s*(?:async\\s+)?(?:function|\\()`),
        new RegExp(`async\\s+${this._escapeRegex(data.name)}\\s*\\(`)
      ];
      return patterns.some(p => p.test(content)) ? AssertionResult.PASS : AssertionResult.FAIL;
    } catch {
      return AssertionResult.FAIL;
    }
  }

  /**
   * Check that exports exist in a module.
   * @param {string} target - Absolute file path.
   * @param {Object} data - { exports: [{ name, kind }] }
   * @returns {Promise<string>}
   */
  async _verifyExportExists(target, data) {
    if (!data || !data.exports || !data.exports.length) return AssertionResult.FAIL;
    try {
      const content = await fs.readFile(target, 'utf8');
      const allFound = data.exports.every(exp => {
        const name = this._escapeRegex(exp.name);
        const patterns = [
          new RegExp(`exports\\.${name}\\b`),
          new RegExp(`module\\.exports\\b[^;]*${name}`),
          new RegExp(`export\\s+(const|let|var|function|class|default)\\s+${name}\\b`),
          new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`)
        ];
        return patterns.some(p => p.test(content));
      });
      return allFound ? AssertionResult.PASS : AssertionResult.FAIL;
    } catch {
      return AssertionResult.FAIL;
    }
  }

  /**
   * Check for regex pattern presence/absence in a file.
   * @param {string} target - Absolute file path.
   * @param {Object} data - { pattern: string, operator: 'present' | 'absent' }
   * @returns {Promise<string>}
   */
  async _verifyPatternMatch(target, data) {
    if (!data || !data.pattern) return AssertionResult.FAIL;
    if (!isSafeRegex(data.pattern)) {
      console.warn(`[CRE-ASSERT] Rejected unsafe regex pattern: ${data.pattern.slice(0, 50)}`);
      return AssertionResult.FAIL;
    }
    try {
      const content = await fs.readFile(target, 'utf8');
      const regex = new RegExp(data.pattern);
      const found = regex.test(content);
      const operator = data.operator || 'present';
      if (operator === 'present') {
        return found ? AssertionResult.PASS : AssertionResult.FAIL;
      }
      return found ? AssertionResult.FAIL : AssertionResult.PASS;
    } catch {
      return AssertionResult.FAIL;
    }
  }

  /**
   * AC6: Persist a verification result to the DB.
   * @param {string} assertionId
   * @param {string} result - pass/fail/pending
   * @param {string} verifiedAt - ISO timestamp
   */
  _persistResult(assertionId, result, verifiedAt) {
    this._db.prepare(
      `UPDATE inspection_assertions SET result = ?, verified_at = ? WHERE id = ?`
    ).run(result, verifiedAt, assertionId);
  }

  /**
   * Retrieve all assertions for a plan from the DB.
   * @param {string} planId
   * @returns {Array<Object>}
   */
  getByPlan(planId) {
    const rows = this._db.prepare(
      'SELECT * FROM inspection_assertions WHERE plan_id = ? ORDER BY created_at'
    ).all(planId);
    return rows.map(r => ({
      ...r,
      assertion: JSON.parse(r.assertion_data || '{}')
    }));
  }

  /**
   * Retrieve assertions for a specific story from the DB.
   * @param {string} storyId
   * @returns {Array<Object>}
   */
  getByStory(storyId) {
    const rows = this._db.prepare(
      'SELECT * FROM inspection_assertions WHERE story_id = ? ORDER BY created_at'
    ).all(storyId);
    return rows.map(r => ({
      ...r,
      assertion: JSON.parse(r.assertion_data || '{}')
    }));
  }

  /**
   * Escape a string for use in a RegExp.
   * @param {string} str
   * @returns {string}
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = { AssertionGenerator, AssertionType, AssertionResult, isSafeRegex };
