'use strict';

/**
 * @module context-builder
 * Assembles navigation context from the code model for AI prompts.
 *
 * Implements the ORIENT → FILTER → EXPLORE navigation protocol:
 *   ORIENT  — identify which artifact types are relevant to the task
 *   FILTER  — narrow candidates by tags, kind, path patterns
 *   EXPLORE — load full details of selected artifacts
 *
 * Produces a structured context string suitable for embedding in prompts.
 */

/**
 * @typedef {Object} NavigationContext
 * @property {string} summary - Human-readable context summary.
 * @property {Array<Object>} artifacts - Selected artifact details.
 * @property {Array<Object>} dependencies - Relevant dependency edges.
 * @property {Array<Object>} flows - Relevant flows.
 * @property {Object} stats - Instance statistics.
 */

/**
 * Builds context for a task by navigating the code model instance.
 *
 * @param {Object} params
 * @param {string} params.taskDescription - What the task is about.
 * @param {Object} params.instance - h-DSL code model instance.
 * @param {Object} [params.schema] - h-DSL schema (for type awareness).
 * @param {Object} [params.memo] - Navigation cache for repeat queries.
 * @param {number} [params.maxArtifacts=20] - Max artifacts to include.
 * @returns {NavigationContext}
 */
function queryForTask({ taskDescription, instance, schema = null, memo = null, maxArtifacts = 20 }) {
  const safeInstance = normalizeInstance(instance);
  const stats = computeStats(safeInstance);

  if (stats.totalArtifacts === 0 && stats.totalDependencies === 0) {
    return {
      summary: 'Code model is empty. No codebase context available.',
      artifacts: [],
      dependencies: [],
      flows: [],
      stats
    };
  }

  const keywords = extractKeywords(taskDescription);

  // ORIENT — identify relevant artifact types
  const relevantTypes = orient(keywords, schema);

  // FILTER — narrow by type, tags, path
  const candidates = filter(safeInstance, relevantTypes, keywords);

  // EXPLORE — take top N and load full details + related deps/flows
  const selected = candidates.slice(0, maxArtifacts);
  const selectedKeys = new Set(selected.map(a => a._key));

  const relatedDeps = safeInstance.dependencies.filter(
    d => selectedKeys.has(d.from) || selectedKeys.has(d.to)
  );

  const relatedFlows = Object.entries(safeInstance.flows)
    .filter(([, flow]) => {
      const steps = flow.steps || [];
      return steps.some(s => selectedKeys.has(s.artifact));
    })
    .map(([key, flow]) => ({ _key: key, ...flow }));

  const summary = buildSummary(selected, relatedDeps, relatedFlows, stats);

  return {
    summary,
    artifacts: selected.map(({ _key, _score, ...rest }) => rest),
    dependencies: relatedDeps,
    flows: relatedFlows.map(({ _key, ...rest }) => rest),
    stats
  };
}

/**
 * Formats a NavigationContext into a string for prompt embedding.
 *
 * @param {NavigationContext} context
 * @returns {string}
 */
function formatForPrompt(context) {
  const lines = [];

  lines.push(`Code Model: ${context.stats.totalArtifacts} artifacts, ${context.stats.totalDependencies} dependencies, ${context.stats.totalFlows} flows`);
  lines.push('');

  if (context.artifacts.length > 0) {
    lines.push('RELEVANT ARTIFACTS:');
    for (const a of context.artifacts) {
      const tags = (a.tags || []).join(', ');
      lines.push(`- [${a.type || 'unknown'}] ${a.path || a.name || '?'}: ${a.summary || 'no summary'}${tags ? ` (${tags})` : ''}`);
    }
    lines.push('');
  }

  if (context.dependencies.length > 0) {
    lines.push('RELATED DEPENDENCIES:');
    for (const d of context.dependencies) {
      lines.push(`- ${d.from} --[${d.kind}]--> ${d.to}`);
    }
    lines.push('');
  }

  if (context.flows.length > 0) {
    lines.push('RELATED FLOWS:');
    for (const f of context.flows) {
      lines.push(`- ${f.name || '?'}: ${f.summary || 'no summary'}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes an instance to safe defaults.
 * @param {Object} instance
 * @returns {Object}
 */
function normalizeInstance(instance) {
  if (!instance || typeof instance !== 'object') {
    return { artifacts: {}, dependencies: [], flows: {} };
  }
  return {
    artifacts: instance.artifacts && typeof instance.artifacts === 'object' ? instance.artifacts : {},
    dependencies: Array.isArray(instance.dependencies) ? instance.dependencies : [],
    flows: instance.flows && typeof instance.flows === 'object' ? instance.flows : {}
  };
}

/**
 * @param {Object} instance
 * @returns {Object}
 */
function computeStats(instance) {
  return {
    totalArtifacts: Object.keys(instance.artifacts).length,
    totalDependencies: instance.dependencies.length,
    totalFlows: Object.keys(instance.flows).length
  };
}

/**
 * Extracts lowercase keywords from a task description.
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter(w => !STOP_WORDS.has(w));
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was',
  'will', 'can', 'has', 'have', 'not', 'but', 'all', 'when', 'should',
  'would', 'could', 'into', 'also', 'been', 'being', 'each', 'which',
  'their', 'them', 'then', 'than', 'want', 'need', 'use', 'using'
]);

/**
 * ORIENT: determine which artifact types are relevant.
 * @param {string[]} keywords
 * @param {Object|null} schema
 * @returns {Set<string>|null} null means all types
 */
function orient(keywords, schema) {
  if (!schema || !schema.elementTypes) return null;

  const typeNames = Object.keys(schema.elementTypes);
  if (typeNames.length === 0) return null;

  const matched = typeNames.filter(name =>
    keywords.some(kw => name.includes(kw) || kw.includes(name))
  );

  // If no types matched keywords, all types are relevant
  return matched.length > 0 ? new Set(matched) : null;
}

/**
 * FILTER: score and sort artifacts by relevance to keywords.
 * @param {Object} instance
 * @param {Set<string>|null} relevantTypes
 * @param {string[]} keywords
 * @returns {Array<Object>}
 */
function filter(instance, relevantTypes, keywords) {
  const scored = [];

  for (const [key, artifact] of Object.entries(instance.artifacts)) {
    if (!artifact || typeof artifact !== 'object') continue;

    // Type filter
    if (relevantTypes && artifact.type && !relevantTypes.has(artifact.type)) continue;

    const score = scoreArtifact(artifact, keywords);
    scored.push({ _key: key, _score: score, ...artifact });
  }

  scored.sort((a, b) => b._score - a._score);
  return scored;
}

/**
 * Scores an artifact's relevance to keywords.
 * @param {Object} artifact
 * @param {string[]} keywords
 * @returns {number}
 */
function scoreArtifact(artifact, keywords) {
  if (keywords.length === 0) return 0;

  let score = 0;
  const searchable = [
    artifact.path || '',
    artifact.summary || '',
    artifact.intent || '',
    artifact.name || '',
    ...(artifact.tags || []),
    ...(artifact.exports || [])
  ].map(s => String(s).toLowerCase());

  for (const kw of keywords) {
    for (const field of searchable) {
      if (field.includes(kw)) {
        score += 1;
      }
    }
  }

  return score;
}

/**
 * @param {Array} artifacts
 * @param {Array} deps
 * @param {Array} flows
 * @param {Object} stats
 * @returns {string}
 */
function buildSummary(artifacts, deps, flows, stats) {
  return `Selected ${artifacts.length} of ${stats.totalArtifacts} artifacts, ` +
    `${deps.length} related dependencies, ${flows.length} related flows.`;
}

module.exports = {
  queryForTask,
  formatForPrompt
};
