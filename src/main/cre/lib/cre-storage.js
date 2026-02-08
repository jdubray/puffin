'use strict';

const fs = require('fs').promises;
const path = require('path');
const { createBaseSchema, createEmptyInstance } = require('./hdsl-types');

/**
 * CRE storage directory and file management.
 *
 * Manages the `.puffin/cre/` directory structure:
 *   .puffin/cre/
 *   ├── schema.json      — h-DSL base schema
 *   ├── instance.json     — h-DSL code model instance
 *   ├── memo.json         — navigation cache
 *   └── plans/            — plan documents
 *
 * @module cre-storage
 */

/**
 * Validates that an ID contains only safe path characters.
 * Prevents path traversal via IDs like '../../etc/passwd'.
 *
 * @param {string} id - The ID to validate (sprintId, planId, etc.).
 * @returns {string} The validated ID.
 * @throws {Error} If the ID contains unsafe characters.
 */
function validatePathSegment(id) {
  if (typeof id !== 'string' || !id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid ID for path construction: ${String(id).slice(0, 50)}`);
  }
  return id;
}

const CRE_DIR = 'cre';
const PLANS_DIR = 'plans';
const SCHEMA_FILE = 'schema.json';
const INSTANCE_FILE = 'instance.json';
const MEMO_FILE = 'memo.json';

/**
 * Resolves the CRE root directory for a project.
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {string} Absolute path to `.puffin/cre/`.
 */
function crePath(projectRoot) {
  return path.join(projectRoot, '.puffin', CRE_DIR);
}

/**
 * Ensures all required CRE directories exist.
 * Creates `.puffin/cre/` and `.puffin/cre/plans/` if missing.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @throws {Error} If directory creation fails for reasons other than EEXIST.
 */
async function ensureDirectories(projectRoot) {
  const root = crePath(projectRoot);
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, PLANS_DIR), { recursive: true });
}

/**
 * Writes a JSON file only if it does not already exist.
 * @param {string} filePath - Absolute path to the file.
 * @param {Object} data - Data to serialize as JSON.
 * @returns {Promise<boolean>} true if file was written, false if it already existed.
 */
async function writeIfMissing(filePath, data) {
  try {
    await fs.access(filePath);
    return false;
  } catch {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  }
}

/**
 * Initializes default CRE files if they don't exist.
 * - `schema.json` — base h-DSL schema from `createBaseSchema()`
 * - `instance.json` — empty h-DSL instance from `createEmptyInstance()`
 * - `memo.json` — empty navigation cache
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {Promise<{schema: boolean, instance: boolean, memo: boolean}>}
 *   Which files were newly created.
 */
async function initializeDefaults(projectRoot) {
  const root = crePath(projectRoot);
  const [schema, instance, memo] = await Promise.all([
    writeIfMissing(path.join(root, SCHEMA_FILE), createBaseSchema()),
    writeIfMissing(path.join(root, INSTANCE_FILE), createEmptyInstance()),
    writeIfMissing(path.join(root, MEMO_FILE), {})
  ]);
  return { schema, instance, memo };
}

/**
 * Reads and parses a JSON file from the CRE directory.
 * @param {string} projectRoot - Absolute path to the project root.
 * @param {string} filename - File name relative to `.puffin/cre/`.
 * @returns {Promise<Object>} Parsed JSON content.
 */
async function readJson(projectRoot, filename) {
  const filePath = path.join(crePath(projectRoot), filename);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`CRE file not found: ${filename}`);
    }
    if (err instanceof SyntaxError) {
      console.error(`[CRE] Malformed JSON in ${filename}:`, err.message);
      throw new Error(`CRE file contains invalid JSON: ${filename}`);
    }
    throw new Error(`CRE read error for ${filename}: ${err.message}`);
  }
}

/**
 * Writes a JSON object to a file in the CRE directory.
 * Uses atomic write (tmp + rename) to prevent corruption.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @param {string} filename - File name relative to `.puffin/cre/`.
 * @param {Object} data - Data to serialize.
 */
async function writeJson(projectRoot, filename, data) {
  const filePath = path.join(crePath(projectRoot), filename);
  const tmpPath = filePath + '.tmp';
  try {
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    try { await fs.unlink(tmpPath); } catch { /* ignore cleanup failure */ }
    throw new Error(`CRE write error for ${filename}: ${err.message}`);
  }
}

/**
 * Reads the schema file.
 * @param {string} projectRoot
 * @returns {Promise<Object>}
 */
function readSchema(projectRoot) {
  return readJson(projectRoot, SCHEMA_FILE);
}

/**
 * Writes the schema file.
 * @param {string} projectRoot
 * @param {Object} schema
 */
function writeSchema(projectRoot, schema) {
  return writeJson(projectRoot, SCHEMA_FILE, schema);
}

/**
 * Reads the code model instance file.
 * @param {string} projectRoot
 * @returns {Promise<Object>}
 */
function readInstance(projectRoot) {
  return readJson(projectRoot, INSTANCE_FILE);
}

/**
 * Writes the code model instance file.
 * @param {string} projectRoot
 * @param {Object} instance
 */
function writeInstance(projectRoot, instance) {
  return writeJson(projectRoot, INSTANCE_FILE, instance);
}

/**
 * Reads the navigation memo cache.
 * @param {string} projectRoot
 * @returns {Promise<Object>}
 */
function readMemo(projectRoot) {
  return readJson(projectRoot, MEMO_FILE);
}

/**
 * Writes the navigation memo cache.
 * @param {string} projectRoot
 * @param {Object} memo
 */
function writeMemo(projectRoot, memo) {
  return writeJson(projectRoot, MEMO_FILE, memo);
}

/**
 * Reads a plan document by sprint ID.
 * @param {string} projectRoot
 * @param {string} sprintId
 * @returns {Promise<Object>}
 */
function readPlan(projectRoot, sprintId) {
  validatePathSegment(sprintId);
  return readJson(projectRoot, path.join(PLANS_DIR, `${sprintId}.json`));
}

/**
 * Writes a plan document for a sprint.
 * @param {string} projectRoot
 * @param {string} sprintId
 * @param {Object} plan
 */
function writePlan(projectRoot, sprintId, plan) {
  validatePathSegment(sprintId);
  return writeJson(projectRoot, path.join(PLANS_DIR, `${sprintId}.json`), plan);
}

/**
 * Lists all plan files in the plans directory.
 * @param {string} projectRoot
 * @returns {Promise<string[]>} Array of sprint IDs that have plan files.
 */
async function listPlans(projectRoot) {
  const plansDir = path.join(crePath(projectRoot), PLANS_DIR);
  try {
    const files = await fs.readdir(plansDir);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

/**
 * Initializes the full CRE storage: directories + default files.
 * This is the main entry point called during CRE initialization.
 *
 * @param {string} projectRoot - Absolute path to the project root.
 * @returns {Promise<{schema: boolean, instance: boolean, memo: boolean}>}
 *   Which default files were newly created.
 */
async function initialize(projectRoot) {
  await ensureDirectories(projectRoot);
  const created = await initializeDefaults(projectRoot);

  const items = Object.entries(created)
    .filter(([, wasCreated]) => wasCreated)
    .map(([name]) => name);
  if (items.length > 0) {
    console.log(`[CRE] Initialized default files: ${items.join(', ')}`);
  }

  return created;
}

module.exports = {
  validatePathSegment,
  crePath,
  ensureDirectories,
  initializeDefaults,
  initialize,
  readSchema,
  writeSchema,
  readInstance,
  writeInstance,
  readMemo,
  writeMemo,
  readPlan,
  writePlan,
  listPlans,
  readJson,
  writeJson,
  SCHEMA_FILE,
  INSTANCE_FILE,
  MEMO_FILE
};
