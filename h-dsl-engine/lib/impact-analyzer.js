/**
 * @module impact-analyzer
 * Analyzes the potential impact of a proposed change to an entity or file.
 *
 * Builds on query-interface's impact traversal to produce a structured
 * impact report with risk scoring, suitable for LLM decision-making.
 *
 * Risk heuristics:
 *   - Dependent count: more dependents → higher risk
 *   - Centrality: ratio of connections to total artifacts
 *   - Transitive reach: how far changes propagate
 *   - Export surface: entities that export many symbols affect more consumers
 */

'use strict';

const { patternToRegex } = require('./explorer');

/**
 * Analyze the impact of changing one or more target entities.
 *
 * @param {Object} params
 * @param {Object} params.schema
 * @param {Object} params.instance
 * @param {Object} params.target
 * @param {string} params.target.name - Entity path or glob pattern.
 * @param {number} [params.target.depth=3] - Max transitive traversal depth.
 * @param {boolean} [params.target.includeReverseImpact=true] - Include who depends on target.
 * @returns {Object} Structured impact report.
 */
function analyzeImpact({ schema, instance, target }) {
  const { name, depth = 3, includeReverseImpact = true } = target;
  if (!name) {
    throw new Error('impact analysis requires a "name" field (entity path or pattern)');
  }

  const re = patternToRegex(name);
  const roots = Object.keys(instance.artifacts).filter(p => re.test(p));

  if (roots.length === 0) {
    return buildEmptyReport(name);
  }

  // Build adjacency maps once
  const outAdj = new Map();
  const inAdj = new Map();
  for (const d of instance.dependencies) {
    if (!outAdj.has(d.from)) outAdj.set(d.from, []);
    outAdj.get(d.from).push(d);
    if (!inAdj.has(d.to)) inAdj.set(d.to, []);
    inAdj.get(d.to).push(d);
  }

  // Forward impact: what does the target depend on (what it might break if APIs change)
  const forwardResult = bfsTraverse(roots, outAdj, depth);

  // Reverse impact: who depends on the target (who breaks if target changes)
  let reverseResult = { visited: new Set(), edges: [], layers: [] };
  if (includeReverseImpact) {
    reverseResult = bfsTraverse(roots, inAdj, depth);
  }

  // Compute risk scores for all affected nodes
  const allAffected = new Set([...roots, ...forwardResult.visited, ...reverseResult.visited]);
  const totalArtifacts = Object.keys(instance.artifacts).length;
  const riskMap = computeRiskScores(allAffected, instance, inAdj, outAdj, totalArtifacts);

  // Build per-file details
  const affectedFiles = buildAffectedFiles(allAffected, roots, instance, riskMap, inAdj, outAdj);

  // Identify high-risk areas
  const highRiskThreshold = 0.6;
  const highRiskEntities = affectedFiles
    .filter(f => f.riskScore >= highRiskThreshold)
    .sort((a, b) => b.riskScore - a.riskScore);

  // Build summary
  const summary = buildSummary(roots, forwardResult, reverseResult, affectedFiles, highRiskEntities, instance);

  return {
    reportType: 'impact-analysis',
    target: name,
    targetEntities: roots,
    depth,
    summary,
    highRiskEntities,
    affectedFiles,
    dependencyChains: {
      forward: {
        description: 'Entities the target depends on (downstream)',
        layers: forwardResult.layers,
        edgeCount: forwardResult.edges.length
      },
      reverse: includeReverseImpact ? {
        description: 'Entities that depend on the target (upstream / will break)',
        layers: reverseResult.layers,
        edgeCount: reverseResult.edges.length
      } : null
    }
  };
}

/**
 * BFS traversal along an adjacency map from roots.
 * @param {string[]} roots
 * @param {Map<string, Object[]>} adj - Adjacency map (key → [{from, to, kind, ...}]).
 * @param {number} maxDepth
 * @returns {{visited: Set<string>, edges: Object[], layers: Array}}
 */
function bfsTraverse(roots, adj, maxDepth) {
  const visited = new Set(roots);
  const edges = [];
  const layers = [{ depth: 0, artifacts: roots.slice() }];
  let frontier = roots.slice();

  for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
    const nextFrontier = [];
    for (const node of frontier) {
      for (const dep of (adj.get(node) || [])) {
        edges.push(dep);
        const neighbor = dep.from === node ? dep.to : dep.from;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          nextFrontier.push(neighbor);
        }
      }
    }
    if (nextFrontier.length > 0) {
      layers.push({ depth: d + 1, artifacts: nextFrontier });
    }
    frontier = nextFrontier;
  }

  // Remove roots from visited for cleaner counting
  for (const r of roots) visited.delete(r);

  return { visited, edges: deduplicateEdges(edges), layers };
}

/**
 * Compute risk scores for a set of artifact paths.
 */
function computeRiskScores(affectedPaths, instance, inAdj, outAdj, totalArtifacts) {
  const scores = new Map();

  for (const p of affectedPaths) {
    const art = instance.artifacts[p];
    if (!art) continue;

    const dependentCount = (inAdj.get(p) || []).length;
    const dependencyCount = (outAdj.get(p) || []).length;
    const connectionCount = dependentCount + dependencyCount;
    const exportCount = (art.exports || []).length;

    // Centrality: fraction of total artifacts this node connects to
    const centrality = totalArtifacts > 1
      ? connectionCount / (totalArtifacts - 1)
      : 0;

    // Dependent weight: more dependents = higher risk (logarithmic scale)
    const dependentWeight = dependentCount > 0
      ? Math.min(1, Math.log2(dependentCount + 1) / 4)
      : 0;

    // Export surface: more exports = more potential breakage
    const exportWeight = exportCount > 0
      ? Math.min(1, exportCount / 10)
      : 0;

    // Combined score (weighted average)
    const riskScore = Math.round(
      (dependentWeight * 0.45 + centrality * 0.30 + exportWeight * 0.25) * 100
    ) / 100;

    scores.set(p, {
      riskScore: Math.min(1, riskScore),
      dependentCount,
      dependencyCount,
      exportCount,
      centrality: Math.round(centrality * 100) / 100
    });
  }

  return scores;
}

/**
 * Build detailed per-file impact entries.
 */
function buildAffectedFiles(affectedPaths, roots, instance, riskMap, inAdj, outAdj) {
  const files = [];

  for (const p of affectedPaths) {
    const art = instance.artifacts[p];
    if (!art) continue;

    const risk = riskMap.get(p) || { riskScore: 0, dependentCount: 0, dependencyCount: 0, exportCount: 0, centrality: 0 };
    const isTarget = roots.includes(p);

    // Collect direct dependents and dependencies
    const dependents = (inAdj.get(p) || []).map(d => ({
      path: d.from,
      kind: d.kind
    }));

    const dependencies = (outAdj.get(p) || []).map(d => ({
      path: d.to,
      kind: d.kind
    }));

    files.push({
      path: p,
      type: art.type,
      kind: art.kind || null,
      summary: art.summary || null,
      isTarget,
      riskScore: risk.riskScore,
      riskFactors: {
        dependentCount: risk.dependentCount,
        dependencyCount: risk.dependencyCount,
        exportCount: risk.exportCount,
        centrality: risk.centrality
      },
      exports: art.exports || [],
      dependents,
      dependencies
    });
  }

  // Sort: targets first, then by risk score descending
  files.sort((a, b) => {
    if (a.isTarget !== b.isTarget) return a.isTarget ? -1 : 1;
    return b.riskScore - a.riskScore;
  });

  return files;
}

/**
 * Build a human/LLM-readable summary section.
 */
function buildSummary(roots, forwardResult, reverseResult, affectedFiles, highRiskEntities, instance) {
  // Count by type
  const affectedByType = {};
  for (const f of affectedFiles) {
    if (!f.isTarget) {
      affectedByType[f.type] = (affectedByType[f.type] || 0) + 1;
    }
  }

  return {
    targetCount: roots.length,
    totalAffected: affectedFiles.length - roots.length,
    directDependentCount: reverseResult.layers.length > 1 ? reverseResult.layers[1].artifacts.length : 0,
    transitiveDependentCount: reverseResult.visited.size,
    directDependencyCount: forwardResult.layers.length > 1 ? forwardResult.layers[1].artifacts.length : 0,
    transitiveDependencyCount: forwardResult.visited.size,
    highRiskCount: highRiskEntities.length,
    affectedByType,
    riskLevel: categorizeOverallRisk(highRiskEntities, reverseResult.visited.size)
  };
}

/**
 * Categorize overall change risk as low/medium/high/critical.
 */
function categorizeOverallRisk(highRiskEntities, transitiveCount) {
  if (highRiskEntities.length >= 5 || transitiveCount >= 20) return 'critical';
  if (highRiskEntities.length >= 2 || transitiveCount >= 10) return 'high';
  if (highRiskEntities.length >= 1 || transitiveCount >= 5) return 'medium';
  return 'low';
}

/**
 * Deduplicate dependency edges by from|to|kind key.
 */
function deduplicateEdges(edges) {
  const seen = new Set();
  const unique = [];
  for (const e of edges) {
    const key = `${e.from}|${e.to}|${e.kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({ from: e.from, to: e.to, kind: e.kind, weight: e.weight != null ? e.weight : null });
    }
  }
  return unique;
}

/**
 * Build empty report when no targets match.
 */
function buildEmptyReport(name) {
  return {
    reportType: 'impact-analysis',
    target: name,
    targetEntities: [],
    depth: 0,
    summary: {
      targetCount: 0,
      totalAffected: 0,
      directDependentCount: 0,
      transitiveDependentCount: 0,
      directDependencyCount: 0,
      transitiveDependencyCount: 0,
      highRiskCount: 0,
      affectedByType: {},
      riskLevel: 'low'
    },
    highRiskEntities: [],
    affectedFiles: [],
    dependencyChains: { forward: null, reverse: null }
  };
}

module.exports = { analyzeImpact, computeRiskScores, categorizeOverallRisk };
