'use strict';

/**
 * @module cre/code-model
 * CodeModel — manages the h-DSL code model instance with navigation operations.
 *
 * Provides PEEK, FOCUS, TRACE, and FILTER operations for CRE reasoning,
 * plus incremental updates via ModelDelta and AI-assisted context queries.
 */

const { queryForTask, formatForPrompt } = require('./lib/context-builder');
const { isSafeRegex } = require('./assertion-generator');

/**
 * @typedef {Object} ModelDelta
 * @property {'add'|'update'|'remove'} op - Operation type.
 * @property {'artifact'|'dependency'|'flow'} type - Target collection.
 * @property {Object} data - Payload (must include key/path for artifact, from+to for dependency).
 */

/**
 * Manages the h-DSL code model instance and provides navigation operations.
 */
class CodeModel {
  /**
   * @param {Object} deps
   * @param {Object} deps.storage - CRE storage module (cre-storage.js).
   * @param {import('./schema-manager').SchemaManager} deps.schemaManager - Schema manager.
   */
  constructor({ storage, schemaManager }) {
    this._storage = storage;
    this._schemaManager = schemaManager;
    /** @type {string|null} */
    this._projectRoot = null;
    /** @type {Object|null} */
    this._instance = null;
    /** @type {Object|null} */
    this._schema = null;
  }

  /**
   * AC2: Load schema.json and instance.json from .puffin/cre/.
   *
   * @param {string} projectRoot - Absolute path to project root.
   * @returns {Promise<void>}
   */
  async load(projectRoot) {
    this._projectRoot = projectRoot;
    this._schema = await this._schemaManager.load();
    this._instance = await this._storage.readInstance(projectRoot);
    this._normalize();
  }

  /**
   * AC3: Persist current instance state to disk.
   *
   * @returns {Promise<void>}
   */
  async save() {
    if (!this._projectRoot || !this._instance) {
      throw new Error('CodeModel not loaded. Call load() first.');
    }
    this._instance.lastUpdated = new Date().toISOString();
    await this._storage.writeInstance(this._projectRoot, this._instance);
  }

  /**
   * AC4: Return artifact summary without full load.
   * Returns a subset: path, kind/type, summary, tags.
   *
   * @param {string} artifactPath - Key in the artifacts map.
   * @returns {Object|null} Summary object or null if not found.
   */
  peek(artifactPath) {
    const artifacts = this._safeArtifacts();
    const a = artifacts[artifactPath];
    if (!a) return null;
    return {
      path: a.path || artifactPath,
      type: a.type || 'unknown',
      kind: a.kind || a.type || 'unknown',
      summary: a.summary || '',
      tags: a.tags || []
    };
  }

  /**
   * AC5: Return full artifact details plus related dependencies and flows.
   *
   * @param {string} artifactPath - Key in the artifacts map.
   * @returns {Object|null} Full artifact with related deps and flows, or null.
   */
  focus(artifactPath) {
    const artifacts = this._safeArtifacts();
    const a = artifacts[artifactPath];
    if (!a) return null;

    const deps = this._safeDependencies();
    const flows = this._safeFlows();

    const relatedDeps = deps.filter(d => d.from === artifactPath || d.to === artifactPath);
    const relatedFlows = Object.entries(flows)
      .filter(([, flow]) => (flow.steps || []).some(s => s.artifact === artifactPath))
      .map(([key, flow]) => ({ name: key, ...flow }));

    return {
      ...a,
      path: a.path || artifactPath,
      _relatedDependencies: relatedDeps,
      _relatedFlows: relatedFlows
    };
  }

  /**
   * AC6: Follow dependency chains via BFS.
   *
   * @param {string} from - Starting artifact path.
   * @param {Object} [opts]
   * @param {'up'|'down'|'both'} [opts.direction='both'] - Traversal direction.
   * @param {string} [opts.kind] - Filter by dependency kind (imports, calls, etc.).
   * @param {number} [opts.depth=5] - Maximum traversal depth.
   * @returns {Array<Object>} Ordered list of { path, depth, via } entries.
   */
  trace(from, opts = {}) {
    const { direction = 'both', kind, depth: maxDepth = 5 } = opts;
    const deps = this._safeDependencies();

    // Build adjacency index once — O(D) — instead of scanning all deps per node
    const outbound = new Map(); // from → [{ to, kind }]
    const inbound = new Map();  // to → [{ from, kind }]
    for (const dep of deps) {
      if (kind && dep.kind !== kind) continue;
      if (direction === 'down' || direction === 'both') {
        if (!outbound.has(dep.from)) outbound.set(dep.from, []);
        outbound.get(dep.from).push(dep);
      }
      if (direction === 'up' || direction === 'both') {
        if (!inbound.has(dep.to)) inbound.set(dep.to, []);
        inbound.get(dep.to).push(dep);
      }
    }

    const visited = new Set();
    const results = [];
    const queue = [{ path: from, depth: 0, via: null }];

    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current.path)) continue;
      visited.add(current.path);

      if (current.depth > 0) {
        results.push(current);
      }
      if (current.depth >= maxDepth) continue;

      // Follow outbound edges (down/both)
      const out = outbound.get(current.path);
      if (out) {
        for (const dep of out) {
          if (!visited.has(dep.to)) {
            queue.push({ path: dep.to, depth: current.depth + 1, via: dep.kind });
          }
        }
      }

      // Follow inbound edges (up/both)
      const inc = inbound.get(current.path);
      if (inc) {
        for (const dep of inc) {
          if (!visited.has(dep.from)) {
            queue.push({ path: dep.from, depth: current.depth + 1, via: dep.kind });
          }
        }
      }
    }

    return results;
  }

  /**
   * AC7: Find artifacts matching criteria.
   *
   * @param {Object} criteria
   * @param {string[]} [criteria.tags] - Match any of these tags.
   * @param {string} [criteria.kind] - Match artifact type/kind.
   * @param {string} [criteria.pattern] - Regex pattern to match against path.
   * @returns {Array<Object>} Matching artifacts with their keys.
   */
  filter(criteria = {}) {
    const artifacts = this._safeArtifacts();
    const results = [];
    let pathRegex = null;

    if (criteria.pattern) {
      if (!isSafeRegex(criteria.pattern)) {
        console.warn(`[CRE] Rejected unsafe filter pattern: ${criteria.pattern.slice(0, 50)}`);
        return [];
      }
      try {
        pathRegex = new RegExp(criteria.pattern, 'i');
      } catch {
        console.warn(`[CRE] Invalid filter pattern: ${criteria.pattern}`);
        return [];
      }
    }

    for (const [key, artifact] of Object.entries(artifacts)) {
      if (criteria.kind && (artifact.type || artifact.kind) !== criteria.kind) continue;

      if (criteria.tags && criteria.tags.length > 0) {
        const aTags = artifact.tags || [];
        if (!criteria.tags.some(t => aTags.includes(t))) continue;
      }

      if (pathRegex && !pathRegex.test(artifact.path || key)) continue;

      results.push({ _key: key, ...artifact });
    }

    return results;
  }

  /**
   * AC8: Apply incremental ModelDelta changes.
   *
   * @param {ModelDelta[]} deltas - Array of add/update/remove operations.
   * @returns {{ applied: number, skipped: number }}
   */
  update(deltas) {
    if (!this._instance) this._normalize();
    let applied = 0;
    let skipped = 0;

    for (const delta of deltas) {
      try {
        this._applyDelta(delta);
        applied++;
      } catch (err) {
        console.warn(`[CRE] Skipped delta (${delta.op} ${delta.type}): ${err.message}`);
        skipped++;
      }
    }

    return { applied, skipped };
  }

  /**
   * AC9: Implement ORIENT → FILTER → EXPLORE protocol via context-builder.
   *
   * @param {string} taskDescription - Description of the task.
   * @param {Object} [opts]
   * @param {number} [opts.maxArtifacts=20] - Max artifacts to include.
   * @returns {{ context: Object, formatted: string }}
   */
  queryForTask(taskDescription, opts = {}) {
    const context = queryForTask({
      taskDescription,
      instance: this._instance,
      schema: this._schema,
      maxArtifacts: opts.maxArtifacts || 20
    });

    return {
      context,
      formatted: formatForPrompt(context)
    };
  }

  /**
   * Returns the current schema version string.
   * @returns {string}
   */
  get schemaVersion() {
    return (this._schema && this._schema.version) || 'unknown';
  }

  /**
   * Returns the raw instance (for direct inspection/serialization).
   * @returns {Object}
   */
  get instance() {
    return this._instance || { artifacts: {}, dependencies: [], flows: {} };
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  /** Ensure instance has the expected shape. */
  _normalize() {
    if (!this._instance || typeof this._instance !== 'object') {
      this._instance = {};
    }
    if (!this._instance.artifacts || typeof this._instance.artifacts !== 'object') {
      this._instance.artifacts = {};
    }
    if (!Array.isArray(this._instance.dependencies)) {
      this._instance.dependencies = [];
    }
    if (!this._instance.flows || typeof this._instance.flows !== 'object') {
      this._instance.flows = {};
    }
  }

  /** @returns {Object} */
  _safeArtifacts() {
    return (this._instance && this._instance.artifacts) || {};
  }

  /** @returns {Array} */
  _safeDependencies() {
    return (this._instance && Array.isArray(this._instance.dependencies)) ? this._instance.dependencies : [];
  }

  /** @returns {Object} */
  _safeFlows() {
    return (this._instance && this._instance.flows) || {};
  }

  /**
   * Apply a single delta to the instance.
   * @param {ModelDelta} delta
   */
  _applyDelta(delta) {
    const { op, type, data } = delta;
    if (!op || !type || !data) {
      throw new Error('Delta must have op, type, and data');
    }

    switch (type) {
      case 'artifact':
        this._applyArtifactDelta(op, data);
        break;
      case 'dependency':
        this._applyDependencyDelta(op, data);
        break;
      case 'flow':
        this._applyFlowDelta(op, data);
        break;
      default:
        throw new Error(`Unknown delta type: ${type}`);
    }
  }

  _applyArtifactDelta(op, data) {
    const key = data.path || data.key;
    if (!key) throw new Error('Artifact delta requires path or key');

    if (op === 'add' || op === 'update') {
      this._instance.artifacts[key] = { ...this._instance.artifacts[key], ...data };
    } else if (op === 'remove') {
      delete this._instance.artifacts[key];
    } else {
      throw new Error(`Unknown op: ${op}`);
    }
  }

  _applyDependencyDelta(op, data) {
    if (op === 'add') {
      if (!data.from || !data.to) throw new Error('Dependency delta requires from and to');
      this._instance.dependencies.push(data);
    } else if (op === 'remove') {
      this._instance.dependencies = this._instance.dependencies.filter(
        d => !(d.from === data.from && d.to === data.to && (!data.kind || d.kind === data.kind))
      );
    } else if (op === 'update') {
      const idx = this._instance.dependencies.findIndex(
        d => d.from === data.from && d.to === data.to
      );
      if (idx >= 0) {
        this._instance.dependencies[idx] = { ...this._instance.dependencies[idx], ...data };
      }
    } else {
      throw new Error(`Unknown op: ${op}`);
    }
  }

  _applyFlowDelta(op, data) {
    const key = data.name || data.key;
    if (!key) throw new Error('Flow delta requires name or key');

    if (op === 'add' || op === 'update') {
      this._instance.flows[key] = { ...this._instance.flows[key], ...data };
    } else if (op === 'remove') {
      delete this._instance.flows[key];
    } else {
      throw new Error(`Unknown op: ${op}`);
    }
  }
}

module.exports = { CodeModel };
