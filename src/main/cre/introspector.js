'use strict';

/**
 * @module cre/introspector
 * Introspector — analyzes code changes after implementation and updates the code model.
 *
 * Performs git diff analysis, regex-based artifact extraction, AI-powered intent
 * inference, and schema gap detection. Runs after each story completes, blocking
 * the next story until the code model is updated.
 */

const { execFile } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const inferIntentPrompt = require('./lib/prompts/infer-intent');
const identifySchemaGapsPrompt = require('./lib/prompts/identify-schema-gaps');

/**
 * Analyzes code changes and updates the code model.
 */
class Introspector {
  /**
   * @param {Object} deps
   * @param {import('./code-model').CodeModel} deps.codeModel - Code model instance.
   * @param {import('./schema-manager').SchemaManager} deps.schemaManager - Schema manager.
   * @param {string} deps.projectRoot - Absolute path to project root.
   * @param {Object} [deps.config] - CRE config (cre section).
   */
  constructor({ codeModel, schemaManager, projectRoot, config = {} }) {
    this._codeModel = codeModel;
    this._schemaManager = schemaManager;
    this._projectRoot = projectRoot;
    this._config = config;
    this._excludePatterns = (config.introspection && config.introspection.excludePatterns) || [
      'node_modules/**', 'dist/**', '.git/**'
    ];
  }

  /**
   * AC2: Analyze changes between branches and return ModelDelta[].
   *
   * @param {string} branch - Feature branch.
   * @param {string} baseBranch - Base branch to diff against.
   * @returns {Promise<Array<import('./code-model').ModelDelta>>}
   */
  async analyzeChanges(branch, baseBranch) {
    // 1. Get changed files via git diff
    const changedFiles = await this._gitDiffFiles(branch, baseBranch);

    // 2. AC7: Filter out excluded paths
    const filtered = this._filterExcluded(changedFiles);
    if (filtered.length === 0) {
      console.log('[CRE] Introspector: no relevant file changes to analyze');
      return [];
    }

    // 3. AC3: Extract artifacts from changed files
    const artifacts = await this.extractArtifacts(filtered);
    if (artifacts.length === 0) {
      return [];
    }

    // 4. AC5: Detect schema gaps and propose extensions
    await this.detectSchemaGaps(artifacts);

    // 5. Generate deltas by comparing extracted artifacts to current model
    const deltas = this._generateDeltas(artifacts);

    // 6. Apply deltas to the code model
    if (deltas.length > 0) {
      const result = this._codeModel.update(deltas);
      await this._codeModel.save();
      console.log(`[CRE] Introspector: applied ${result.applied} deltas (${result.skipped} skipped)`);
    }

    return deltas;
  }

  /**
   * AC3: Parse source files to identify modules, classes, functions, exports.
   * Uses regex-based extraction (not full AST).
   *
   * @param {string[]} filePaths - Relative file paths from project root.
   * @returns {Promise<Array<Object>>} Extracted artifact descriptors.
   */
  async extractArtifacts(filePaths) {
    const artifacts = [];

    for (const filePath of filePaths) {
      // Only process JS/TS files
      if (!/\.(js|ts|mjs|cjs)$/.test(filePath)) {
        // Non-JS files get a basic module artifact
        artifacts.push({
          path: filePath,
          type: 'module',
          kind: 'file',
          summary: '',
          exports: [],
          tags: [],
          functions: []
        });
        continue;
      }

      let content;
      try {
        content = await fs.readFile(path.join(this._projectRoot, filePath), 'utf-8');
      } catch {
        continue;
      }

      const artifact = {
        path: filePath,
        type: 'module',
        kind: 'module',
        summary: '',
        exports: [],
        tags: [],
        functions: [],
        _source: content
      };

      // Extract exports
      artifact.exports = this._extractExports(content);

      // Extract classes
      const classMatches = content.matchAll(/class\s+(\w+)(?:\s+extends\s+\w+)?\s*\{/g);
      for (const m of classMatches) {
        artifact.functions.push({ name: m[1], kind: 'class' });
      }

      // Extract function declarations
      const funcMatches = content.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g);
      for (const m of funcMatches) {
        artifact.functions.push({ name: m[1], kind: 'function' });
      }

      // Extract arrow/const function assignments
      const arrowMatches = content.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>/g);
      for (const m of arrowMatches) {
        artifact.functions.push({ name: m[1], kind: 'function' });
      }

      artifacts.push(artifact);
    }

    return artifacts;
  }

  /**
   * AC4: Use AI to generate PROSE descriptions for artifacts.
   * Returns the prompt data; in production, the caller sends to 3CLI.
   *
   * @param {Array<Object>} artifacts - Extracted artifact descriptors.
   * @returns {Promise<Array<Object>>} Artifacts with prompt data attached.
   */
  async inferIntent(artifacts) {
    const results = [];

    for (const artifact of artifacts) {
      // Use cached source from extractArtifacts when available
      let sourceCode = artifact._source || '';
      if (!sourceCode) {
        try {
          sourceCode = await fs.readFile(path.join(this._projectRoot, artifact.path), 'utf-8');
        } catch {
          // Can't read — skip intent inference
          results.push(artifact);
          continue;
        }
      }

      const existingArtifact = this._codeModel.peek(artifact.path);
      const prompt = inferIntentPrompt.buildPrompt({
        sourceCode,
        filePath: artifact.path,
        artifactType: artifact.type || 'module',
        existingArtifact
      });

      results.push({ ...artifact, _inferPrompt: prompt });
    }

    return results;
  }

  /**
   * AC5: Detect schema gaps and propose extensions.
   *
   * @param {Array<Object>} artifacts - Extracted artifacts.
   * @returns {Promise<{ prompt: Object, extensions: Array }>}
   */
  async detectSchemaGaps(artifacts) {
    const schema = await this._schemaManager.getSchema();
    const instance = this._codeModel.instance;

    const recentChanges = artifacts.map(a => {
      const funcs = (a.functions || []).map(f => f.name).join(', ');
      return `${a.path}: ${a.exports.length} exports${funcs ? `, functions: ${funcs}` : ''}`;
    });

    const prompt = identifySchemaGapsPrompt.buildPrompt({
      schema,
      instance,
      recentChanges
    });

    // In production, prompt is sent to 3CLI and response parsed.
    // Auto-extension would call schemaManager.extend() for each proposed extension.
    return { prompt, extensions: [] };
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  /**
   * Run git diff to get changed file paths.
   * @param {string} branch
   * @param {string} baseBranch
   * @returns {Promise<string[]>}
   */
  _gitDiffFiles(branch, baseBranch) {
    return new Promise((resolve, reject) => {
      execFile('git', ['diff', '--name-only', `${baseBranch}...${branch}`], {
        cwd: this._projectRoot,
        windowsHide: true
      }, (err, stdout, stderr) => {
        if (err) {
          // Fallback: try without triple-dot (for cases where branches share no ancestor)
          execFile('git', ['diff', '--name-only', baseBranch, branch], {
            cwd: this._projectRoot,
            windowsHide: true
          }, (err2, stdout2) => {
            if (err2) {
              console.warn(`[CRE] git diff failed: ${err2.message}`);
              resolve([]);
              return;
            }
            resolve(this._parseFileList(stdout2));
          });
          return;
        }
        resolve(this._parseFileList(stdout));
      });
    });
  }

  /**
   * Parse newline-separated file list from git output.
   * @param {string} output
   * @returns {string[]}
   */
  _parseFileList(output) {
    return output
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);
  }

  /**
   * AC7: Filter out files matching exclude patterns.
   * @param {string[]} files
   * @returns {string[]}
   */
  _filterExcluded(files) {
    return files.filter(f => {
      const normalized = f.replace(/\\/g, '/');
      return !this._excludePatterns.some(pattern => {
        // Convert glob pattern to prefix: "node_modules/**" → "node_modules/"
        const prefix = pattern.replace(/\/?\*\*.*$/, '/').replace(/\*.*$/, '');
        return normalized.startsWith(prefix) || normalized === prefix.replace(/\/$/, '');
      });
    });
  }

  /**
   * Extract exported identifiers from JS source.
   * @param {string} content
   * @returns {string[]}
   */
  _extractExports(content) {
    const exports = new Set();

    // module.exports = { a, b }
    const moduleExportsMatch = content.match(/module\.exports\s*=\s*\{([^}]+)\}/);
    if (moduleExportsMatch) {
      moduleExportsMatch[1].split(',').forEach(s => {
        const name = s.trim().split(/[:\s]/)[0].trim();
        if (name) exports.add(name);
      });
    }

    // module.exports = ClassName
    const singleExport = content.match(/module\.exports\s*=\s*(\w+)/);
    if (singleExport && !moduleExportsMatch) {
      exports.add(singleExport[1]);
    }

    // exports.name = ...
    const namedExports = content.matchAll(/exports\.(\w+)\s*=/g);
    for (const m of namedExports) {
      exports.add(m[1]);
    }

    // export function/class/const
    const esExports = content.matchAll(/export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g);
    for (const m of esExports) {
      exports.add(m[1]);
    }

    // export { a, b }
    const exportBlock = content.match(/export\s*\{([^}]+)\}/);
    if (exportBlock) {
      exportBlock[1].split(',').forEach(s => {
        const name = s.trim().split(/\s+as\s+/)[0].trim();
        if (name) exports.add(name);
      });
    }

    return [...exports];
  }

  /**
   * Generate ModelDelta[] by comparing extracted artifacts to current model state.
   * @param {Array<Object>} artifacts
   * @returns {Array<import('./code-model').ModelDelta>}
   */
  _generateDeltas(artifacts) {
    const deltas = [];

    for (const artifact of artifacts) {
      const existing = this._codeModel.peek(artifact.path);

      if (existing) {
        // Update existing artifact
        deltas.push({
          op: 'update',
          type: 'artifact',
          data: {
            path: artifact.path,
            type: artifact.type,
            kind: artifact.kind,
            exports: artifact.exports,
            tags: artifact.tags
          }
        });
      } else {
        // Add new artifact
        deltas.push({
          op: 'add',
          type: 'artifact',
          data: {
            path: artifact.path,
            type: artifact.type,
            kind: artifact.kind,
            summary: artifact.summary || `Module at ${artifact.path}`,
            exports: artifact.exports,
            tags: artifact.tags
          }
        });
      }

      // Add dependency deltas for imports (if we detect them)
      // This is a basic implementation — can be enhanced later
    }

    return deltas;
  }
}

module.exports = { Introspector };
