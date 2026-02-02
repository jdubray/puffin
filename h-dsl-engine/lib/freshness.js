/**
 * @module freshness
 * Verifies the h-DSL code model is up-to-date relative to the project's
 * git history and performs incremental updates when the model is stale.
 *
 * Freshness determination:
 *   1. Read instance.json mtime as model timestamp.
 *   2. Get latest git commit timestamp in the project.
 *   3. If commit is newer, get git diff --name-only since model timestamp.
 *   4. If changed files are source files, model is stale.
 *
 * Incremental update:
 *   - Uses git diff to find changed/added/deleted source files.
 *   - Patches the instance: removes deleted artifacts, re-discovers changed
 *     files via the existing discover/populate pipeline.
 *   - Re-emits the updated model.
 */

'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const fsP = require('fs').promises;
const path = require('path');

const execFileAsync = promisify(execFile);

/** Source extensions the code model tracks. */
const SOURCE_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx']);

/**
 * Validate that a project root is an absolute path to an existing directory.
 * @param {string} projectRoot
 * @throws {Error} If validation fails.
 */
function validateProjectRoot(projectRoot) {
  if (!projectRoot || !path.isAbsolute(projectRoot)) {
    throw new Error(`projectRoot must be an absolute path, got: ${projectRoot}`);
  }
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    throw new Error(`projectRoot does not exist or is not a directory: ${projectRoot}`);
  }
}

/**
 * Check whether the code model is fresh relative to git history.
 *
 * @param {Object} params
 * @param {string} params.projectRoot - Absolute path to the project.
 * @param {string} params.dataDir - Absolute path to the model output directory.
 * @returns {Promise<Object>} Freshness report.
 */
async function checkFreshness({ projectRoot, dataDir }) {
  validateProjectRoot(projectRoot);
  const instancePath = path.join(dataDir, 'instance.json');

  // 1. Get model timestamp from instance.json mtime
  let modelTimestamp;
  try {
    const stat = await fsP.stat(instancePath);
    modelTimestamp = stat.mtime;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        status: 'missing',
        modelExists: false,
        modelTimestamp: null,
        gitTimestamp: null,
        stale: true,
        changedFiles: [],
        reason: 'Code model not found. Run bootstrap first.'
      };
    }
    throw err;
  }

  // 2. Get latest git commit timestamp
  let gitTimestamp;
  try {
    gitTimestamp = await getLatestCommitTimestamp(projectRoot);
  } catch {
    // Not a git repo or git not available
    return {
      status: 'unknown',
      modelExists: true,
      modelTimestamp: modelTimestamp.toISOString(),
      gitTimestamp: null,
      stale: false,
      changedFiles: [],
      reason: 'Unable to determine git state. Assuming model is current.'
    };
  }

  // 3. Compare timestamps
  if (modelTimestamp >= gitTimestamp) {
    return {
      status: 'fresh',
      modelExists: true,
      modelTimestamp: modelTimestamp.toISOString(),
      gitTimestamp: gitTimestamp.toISOString(),
      stale: false,
      changedFiles: [],
      reason: 'Code model is up-to-date.'
    };
  }

  // 4. Model is older — find what changed
  const changedFiles = await getChangedSourceFiles(projectRoot, modelTimestamp);

  if (changedFiles.length === 0) {
    return {
      status: 'fresh',
      modelExists: true,
      modelTimestamp: modelTimestamp.toISOString(),
      gitTimestamp: gitTimestamp.toISOString(),
      stale: false,
      changedFiles: [],
      reason: 'Git has newer commits but no tracked source files changed.'
    };
  }

  return {
    status: 'stale',
    modelExists: true,
    modelTimestamp: modelTimestamp.toISOString(),
    gitTimestamp: gitTimestamp.toISOString(),
    stale: true,
    changedFiles,
    reason: `${changedFiles.length} source file(s) changed since last model build.`
  };
}

/**
 * Perform an incremental update of the code model.
 *
 * Patches the existing instance by removing deleted artifacts and
 * re-running the discover+populate pipeline on changed/added files.
 *
 * @param {Object} params
 * @param {string} params.projectRoot
 * @param {string} params.dataDir
 * @param {string[]} params.changedFiles - Relative paths of changed source files.
 * @param {Function} [params.log]
 * @returns {Promise<Object>} Update summary.
 */
async function incrementalUpdate({ projectRoot, dataDir, changedFiles, log = () => {} }) {
  const instancePath = path.join(dataDir, 'instance.json');
  const schemaPath = path.join(dataDir, 'schema.json');

  // Load existing model
  const [instanceRaw, schemaRaw] = await Promise.all([
    fsP.readFile(instancePath, 'utf-8'),
    fsP.readFile(schemaPath, 'utf-8')
  ]);
  const instance = JSON.parse(instanceRaw);
  const schema = JSON.parse(schemaRaw);

  const added = [];
  const modified = [];
  const removed = [];

  for (const filePath of changedFiles) {
    const absPath = path.resolve(projectRoot, filePath);
    // Guard against path traversal (e.g. '../' segments in git diff output)
    if (!absPath.startsWith(projectRoot + path.sep) && absPath !== projectRoot) {
      log(`  Skipped (outside project): ${filePath}`);
      continue;
    }
    const exists = fs.existsSync(absPath);

    if (!exists) {
      // File was deleted
      if (instance.artifacts[filePath]) {
        delete instance.artifacts[filePath];
        instance.dependencies = instance.dependencies.filter(
          d => d.from !== filePath && d.to !== filePath
        );
        removed.push(filePath);
        log(`  Removed: ${filePath}`);
      }
    } else if (instance.artifacts[filePath]) {
      // File was modified — update size, mark as needing re-analysis
      try {
        const stat = await fsP.stat(absPath);
        instance.artifacts[filePath].size = stat.size;
        modified.push(filePath);
        log(`  Modified: ${filePath}`);
      } catch {
        modified.push(filePath);
      }
    } else {
      // File was added — create a minimal artifact entry
      try {
        const stat = await fsP.stat(absPath);
        const ext = path.extname(filePath);
        instance.artifacts[filePath] = {
          type: 'module',
          path: filePath,
          kind: classifyNewFile(filePath),
          summary: '',
          intent: '',
          exports: [],
          tags: [],
          size: stat.size
        };
        added.push(filePath);
        log(`  Added: ${filePath}`);
      } catch {
        added.push(filePath);
      }
    }
  }

  // Update instance stats if present
  if (instance.stats) {
    instance.stats.artifactCount = Object.keys(instance.artifacts).length;
    instance.stats.dependencyCount = instance.dependencies.length;
  }

  // Re-emit updated model
  await fsP.mkdir(dataDir, { recursive: true });
  await Promise.all([
    fsP.writeFile(instancePath, JSON.stringify(instance, null, 2), 'utf-8'),
    fsP.writeFile(schemaPath, JSON.stringify(schema, null, 2), 'utf-8')
  ]);

  return {
    updated: true,
    added,
    modified,
    removed,
    totalChanged: added.length + modified.length + removed.length,
    newArtifactCount: Object.keys(instance.artifacts).length,
    newDependencyCount: instance.dependencies.length
  };
}

/**
 * Wrapper that checks freshness and optionally performs incremental update.
 *
 * @param {Object} params
 * @param {string} params.projectRoot
 * @param {string} params.dataDir
 * @param {boolean} [params.autoUpdate=false] - Automatically update if stale.
 * @param {boolean} [params.forceRefresh=false] - Force full rebuild.
 * @param {Function} [params.log]
 * @returns {Promise<Object>} Freshness result with optional update info.
 */
async function ensureFresh({ projectRoot, dataDir, autoUpdate = false, forceRefresh = false, log = () => {} }) {
  validateProjectRoot(projectRoot);
  if (forceRefresh) {
    return {
      freshness: {
        status: 'force-refresh',
        modelExists: fs.existsSync(path.join(dataDir, 'instance.json')),
        stale: true,
        reason: 'Force refresh requested. Run bootstrap with --clean.'
      },
      action: 'rebuild-required',
      update: null
    };
  }

  const freshness = await checkFreshness({ projectRoot, dataDir });

  if (!freshness.stale) {
    return { freshness, action: 'none', update: null };
  }

  if (freshness.status === 'missing') {
    return { freshness, action: 'bootstrap-required', update: null };
  }

  if (autoUpdate && freshness.changedFiles.length > 0) {
    log(`Model is stale. Performing incremental update (${freshness.changedFiles.length} files)...`);
    const update = await incrementalUpdate({
      projectRoot,
      dataDir,
      changedFiles: freshness.changedFiles,
      log
    });
    return {
      freshness: { ...freshness, status: 'refreshed', stale: false, reason: 'Model was stale and has been incrementally updated.' },
      action: 'incremental-update',
      update
    };
  }

  return { freshness, action: 'stale', update: null };
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

/**
 * Get the timestamp of the latest git commit.
 * @param {string} cwd
 * @returns {Promise<Date>}
 */
async function getLatestCommitTimestamp(cwd) {
  const { stdout } = await execFileAsync(
    'git', ['log', '-1', '--format=%aI'],
    { cwd, timeout: 10000 }
  );
  return new Date(stdout.trim());
}

/**
 * Get source files changed since a given timestamp using git.
 * @param {string} cwd
 * @param {Date} since
 * @returns {Promise<string[]>} Changed file paths (relative to project root).
 */
async function getChangedSourceFiles(cwd, since) {
  const isoDate = since.toISOString();

  // Get files changed in commits since the timestamp
  let committedFiles = [];
  try {
    const { stdout } = await execFileAsync(
      'git', ['log', '--since', isoDate, '--name-only', '--pretty=format:'],
      { cwd, timeout: 10000 }
    );
    committedFiles = stdout.split('\n').map(l => l.trim()).filter(Boolean);
  } catch {
    // Fall through — might be no commits
  }

  // Also get working tree changes (unstaged + staged)
  let workingFiles = [];
  try {
    const { stdout } = await execFileAsync(
      'git', ['diff', '--name-only', 'HEAD'],
      { cwd, timeout: 10000 }
    );
    workingFiles = stdout.split('\n').map(l => l.trim()).filter(Boolean);
  } catch {
    // Ignore
  }

  // Combine and deduplicate, filter to source files
  const allFiles = new Set([...committedFiles, ...workingFiles]);
  return [...allFiles].filter(f => {
    const ext = path.extname(f);
    return SOURCE_EXTENSIONS.has(ext);
  });
}

/**
 * Classify a new file by its path into a kind.
 * @param {string} filePath
 * @returns {string}
 */
function classifyNewFile(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.includes('test') || lower.includes('spec')) return 'test';
  if (lower.includes('config') || lower.includes('rc.')) return 'config';
  if (lower.includes('index.')) return 'barrel';
  if (lower.includes('component') || lower.endsWith('.jsx') || lower.endsWith('.tsx')) return 'view';
  if (lower.includes('service') || lower.includes('api')) return 'service';
  if (lower.includes('model') || lower.includes('entity')) return 'model';
  if (lower.includes('util') || lower.includes('helper')) return 'utility';
  return 'module';
}

module.exports = {
  checkFreshness,
  incrementalUpdate,
  ensureFresh,
  getLatestCommitTimestamp,
  getChangedSourceFiles,
  classifyNewFile,
  SOURCE_EXTENSIONS
};
