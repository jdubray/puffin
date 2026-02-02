/**
 * @module graph-navigator
 * Contextual code navigation — traverse the code model graph by following
 * typed relationships (imports, calls, extends, implements, etc.).
 *
 * Operations:
 *   walk      — BFS/depth-limited walk from a starting entity, filtered by
 *               relationship type and direction
 *   path      — find how two entities are connected (shortest path)
 *   neighbors — immediate neighbors of an entity, grouped by relationship type
 */

'use strict';

const { patternToRegex } = require('./explorer');

// ---------------------------------------------------------------------------
// walk — BFS traversal filtered by relationship type
// ---------------------------------------------------------------------------

/**
 * Walk the code model graph from a starting entity.
 *
 * @param {Object} params
 * @param {Object} params.instance
 * @param {Object} params.options
 * @param {string} params.options.start - Starting entity path or glob pattern.
 * @param {string} [params.options.direction='outgoing'] - 'outgoing', 'incoming', or 'both'.
 * @param {string[]} [params.options.relationshipTypes] - Filter to these dep kinds (e.g. ['import','call']).
 * @param {number} [params.options.maxDepth=3] - Maximum traversal depth.
 * @param {number} [params.options.limit=100] - Max nodes to return.
 * @returns {Object} Walk result with nodes, edges, and layers.
 */
function walk({ instance, options }) {
  const {
    start,
    direction = 'outgoing',
    relationshipTypes,
    maxDepth = 3,
    limit = 100
  } = options;

  if (!start) {
    throw new Error('walk requires a "start" field (entity path or pattern)');
  }

  const re = patternToRegex(start);
  const roots = Object.keys(instance.artifacts).filter(p => re.test(p));

  if (roots.length === 0) {
    return { operation: 'walk', start, direction, nodes: [], edges: [], layers: [] };
  }

  // Build filtered adjacency
  const { outAdj, inAdj } = buildAdjacency(instance.dependencies, relationshipTypes);

  // BFS
  const visited = new Set(roots);
  const collectedEdges = [];
  const layers = [{ depth: 0, artifacts: roots.slice() }];
  let frontier = roots.slice();

  for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
    const nextFrontier = [];
    for (const node of frontier) {
      const neighbors = getNeighbors(node, direction, outAdj, inAdj);
      for (const { target, edge } of neighbors) {
        collectedEdges.push(edge);
        if (!visited.has(target)) {
          visited.add(target);
          nextFrontier.push(target);
        }
      }
    }
    if (nextFrontier.length > 0) {
      layers.push({ depth: d + 1, artifacts: nextFrontier });
    }
    frontier = nextFrontier;
    if (visited.size >= limit) break;
  }

  const edges = deduplicateEdges(collectedEdges);
  const nodes = buildNodes(visited, instance);

  return {
    operation: 'walk',
    start,
    direction,
    relationshipTypes: relationshipTypes || null,
    maxDepth,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
    layers
  };
}

// ---------------------------------------------------------------------------
// path — find shortest path between two entities
// ---------------------------------------------------------------------------

/**
 * Find the shortest path between two entities in the code model graph.
 *
 * @param {Object} params
 * @param {Object} params.instance
 * @param {Object} params.options
 * @param {string} params.options.from - Source entity path.
 * @param {string} params.options.to - Target entity path.
 * @param {string[]} [params.options.relationshipTypes] - Filter to these dep kinds.
 * @param {number} [params.options.maxDepth=10] - Max search depth.
 * @returns {Object} Path result with steps, edges, and whether a path was found.
 */
function findPath({ instance, options }) {
  const {
    from,
    to,
    relationshipTypes,
    maxDepth = 10
  } = options;

  if (!from || !to) {
    throw new Error('path requires both "from" and "to" fields');
  }

  // Resolve exact paths (support patterns for from/to)
  const fromRe = patternToRegex(from);
  const toRe = patternToRegex(to);
  const fromPaths = Object.keys(instance.artifacts).filter(p => fromRe.test(p));
  const toPaths = new Set(Object.keys(instance.artifacts).filter(p => toRe.test(p)));

  if (fromPaths.length === 0 || toPaths.size === 0) {
    return { operation: 'path', from, to, found: false, reason: 'entity not found', steps: [], edges: [] };
  }

  // Bidirectional-capable BFS (search both directions to find any connection)
  const { outAdj, inAdj } = buildAdjacency(instance.dependencies, relationshipTypes);

  // BFS from source, following both directions
  const parent = new Map(); // node → { prev, edge }
  const visited = new Set(fromPaths);
  let frontier = fromPaths.slice();

  for (const f of fromPaths) {
    parent.set(f, null); // root
  }

  let foundTarget = null;

  for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
    const nextFrontier = [];
    for (const node of frontier) {
      // Search both directions to find any path
      const neighbors = getNeighbors(node, 'both', outAdj, inAdj);
      for (const { target, edge } of neighbors) {
        if (!visited.has(target)) {
          visited.add(target);
          parent.set(target, { prev: node, edge });
          if (toPaths.has(target)) {
            foundTarget = target;
            break;
          }
          nextFrontier.push(target);
        }
      }
      if (foundTarget) break;
    }
    if (foundTarget) break;
    frontier = nextFrontier;
  }

  if (!foundTarget) {
    return { operation: 'path', from, to, found: false, reason: 'no path within depth limit', steps: [], edges: [] };
  }

  // Reconstruct path
  const steps = [];
  const pathEdges = [];
  let current = foundTarget;
  while (parent.get(current) !== null) {
    const { prev, edge } = parent.get(current);
    steps.unshift(current);
    pathEdges.unshift(formatEdge(edge));
    current = prev;
  }
  steps.unshift(current); // add the root

  // Build node details for the path
  const pathNodes = steps.map(p => {
    const art = instance.artifacts[p];
    return art ? buildNodeSummary(p, art) : { path: p };
  });

  return {
    operation: 'path',
    from,
    to,
    found: true,
    length: steps.length - 1,
    steps,
    pathNodes,
    edges: pathEdges
  };
}

// ---------------------------------------------------------------------------
// neighbors — immediate neighbors grouped by relationship type
// ---------------------------------------------------------------------------

/**
 * Get immediate neighbors of an entity, grouped by relationship type.
 *
 * @param {Object} params
 * @param {Object} params.instance
 * @param {Object} params.options
 * @param {string} params.options.entity - Entity path or pattern.
 * @param {string} [params.options.direction='both'] - 'outgoing', 'incoming', or 'both'.
 * @returns {Object} Neighbors grouped by relationship kind and direction.
 */
function getEntityNeighbors({ instance, options }) {
  const { entity, direction = 'both' } = options;

  if (!entity) {
    throw new Error('neighbors requires an "entity" field');
  }

  const re = patternToRegex(entity);
  const matchedPaths = Object.keys(instance.artifacts).filter(p => re.test(p));

  if (matchedPaths.length === 0) {
    return { operation: 'neighbors', entity, direction, entities: [] };
  }

  // Build adjacency maps once instead of scanning all deps per entity
  const { outAdj, inAdj } = buildAdjacency(instance.dependencies);
  const results = [];

  for (const artPath of matchedPaths) {
    const outgoing = {};
    const incoming = {};

    if (direction === 'outgoing' || direction === 'both') {
      for (const { target, edge } of (outAdj.get(artPath) || [])) {
        if (!outgoing[edge.kind]) outgoing[edge.kind] = [];
        outgoing[edge.kind].push({
          path: target,
          type: instance.artifacts[target]?.type || null,
          kind: instance.artifacts[target]?.kind || null,
          summary: instance.artifacts[target]?.summary || null
        });
      }
    }
    if (direction === 'incoming' || direction === 'both') {
      for (const { target, edge } of (inAdj.get(artPath) || [])) {
        if (!incoming[edge.kind]) incoming[edge.kind] = [];
        incoming[edge.kind].push({
          path: target,
          type: instance.artifacts[target]?.type || null,
          kind: instance.artifacts[target]?.kind || null,
          summary: instance.artifacts[target]?.summary || null
        });
      }
    }

    const art = instance.artifacts[artPath];
    results.push({
      path: artPath,
      type: art.type,
      kind: art.kind || null,
      summary: art.summary || null,
      outgoing: direction === 'incoming' ? undefined : outgoing,
      incoming: direction === 'outgoing' ? undefined : incoming,
      outgoingCount: direction === 'incoming' ? undefined : Object.values(outgoing).reduce((s, a) => s + a.length, 0),
      incomingCount: direction === 'outgoing' ? undefined : Object.values(incoming).reduce((s, a) => s + a.length, 0)
    });
  }

  return { operation: 'neighbors', entity, direction, entities: results };
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

/**
 * Execute a navigation operation on the code model graph.
 *
 * @param {Object} params
 * @param {Object} params.instance
 * @param {Object} params.options
 * @param {string} params.options.operation - One of: walk, path, neighbors.
 * @returns {Object} Navigation result.
 */
function navigate({ instance, options }) {
  const { operation } = options;

  switch (operation) {
    case 'walk':
      return walk({ instance, options });
    case 'path':
      return findPath({ instance, options });
    case 'neighbors':
      return getEntityNeighbors({ instance, options });
    default:
      throw new Error(`Unknown navigation operation: "${operation}". Use: walk, path, neighbors`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build adjacency maps, optionally filtered by relationship types.
 */
function buildAdjacency(dependencies, relationshipTypes) {
  const typeSet = relationshipTypes ? new Set(relationshipTypes) : null;
  const outAdj = new Map();
  const inAdj = new Map();

  for (const d of dependencies) {
    if (typeSet && !typeSet.has(d.kind)) continue;

    if (!outAdj.has(d.from)) outAdj.set(d.from, []);
    outAdj.get(d.from).push({ target: d.to, edge: d });

    if (!inAdj.has(d.to)) inAdj.set(d.to, []);
    inAdj.get(d.to).push({ target: d.from, edge: d });
  }

  return { outAdj, inAdj };
}

/**
 * Get neighbors for a node given a direction.
 */
function getNeighbors(node, direction, outAdj, inAdj) {
  const neighbors = [];
  if (direction === 'outgoing' || direction === 'both') {
    for (const n of (outAdj.get(node) || [])) {
      neighbors.push(n);
    }
  }
  if (direction === 'incoming' || direction === 'both') {
    for (const n of (inAdj.get(node) || [])) {
      neighbors.push(n);
    }
  }
  return neighbors;
}

/**
 * Deduplicate edges by from|to|kind key.
 */
function deduplicateEdges(edges) {
  const seen = new Set();
  const unique = [];
  for (const e of edges) {
    const key = `${e.from}|${e.to}|${e.kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(formatEdge(e));
    }
  }
  return unique;
}

/**
 * Format a dependency edge for output.
 */
function formatEdge(dep) {
  return {
    from: dep.from,
    to: dep.to,
    kind: dep.kind,
    weight: dep.weight != null ? dep.weight : null
  };
}

/**
 * Build a compact node summary.
 */
function buildNodeSummary(artPath, artifact) {
  return {
    path: artPath,
    type: artifact.type,
    kind: artifact.kind || null,
    summary: artifact.summary || null,
    exports: artifact.exports || [],
    tags: artifact.tags || []
  };
}

/**
 * Build node summaries for a set of paths.
 */
function buildNodes(pathSet, instance) {
  const nodes = [];
  for (const p of pathSet) {
    const art = instance.artifacts[p];
    if (art) nodes.push(buildNodeSummary(p, art));
  }
  return nodes;
}

module.exports = { navigate, walk, findPath, getEntityNeighbors, buildAdjacency };
