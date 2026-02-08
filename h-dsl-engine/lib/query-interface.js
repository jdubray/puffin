/**
 * @module query-interface
 * High-level Code Model Query Interface for LLM consumption.
 *
 * Builds on the low-level explorer primitives to return **subgraphs** —
 * matched entities plus their relationships and immediate neighbors —
 * structured as JSON suitable for AI agent reasoning.
 *
 * Query shapes:
 *   entity    — find entities by name/path, return subgraph with neighbors
 *   relation  — find relationships between two entities or from one entity
 *   structure — return structural overview (directory tree, type breakdown)
 *   impact    — transitive dependency analysis (who depends on X, what does X depend on)
 */

'use strict';

const { executeQuery, patternToRegex } = require('./explorer');

/**
 * Execute a high-level code model query and return an LLM-friendly subgraph.
 *
 * @param {Object} params
 * @param {Object} params.schema
 * @param {Object} params.instance
 * @param {Object} params.query
 * @param {string} params.query.type - One of: entity, relation, structure, impact.
 * @param {string} [params.query.name] - Entity name or path pattern.
 * @param {string} [params.query.entityType] - Filter by element type (module, class, etc.).
 * @param {string} [params.query.from] - Source entity path (for relation queries).
 * @param {string} [params.query.to] - Target entity path (for relation queries).
 * @param {string} [params.query.depKind] - Filter relationships by dependency kind.
 * @param {number} [params.query.depth] - Neighbor traversal depth (default 1).
 * @param {number} [params.query.limit] - Max root matches (default 20).
 * @returns {Object} Subgraph result with nodes, edges, and metadata.
 */
function queryModel({ schema, instance, query }) {
  const { type: queryType } = query;

  switch (queryType) {
    case 'entity':
      return queryEntity(schema, instance, query);
    case 'relation':
      return queryRelation(schema, instance, query);
    case 'structure':
      return queryStructure(schema, instance, query);
    case 'impact':
      return queryImpact(schema, instance, query);
    default:
      throw new Error(
        `Unknown query type: "${queryType}". Use: entity, relation, structure, impact`
      );
  }
}

// ---------------------------------------------------------------------------
// Entity query — find entities, return subgraph with neighbors
// ---------------------------------------------------------------------------

/**
 * @param {Object} schema
 * @param {Object} instance
 * @param {Object} query
 * @returns {Object} Subgraph.
 */
function queryEntity(schema, instance, query) {
  const { name, entityType, depth = 1, limit = 20 } = query;
  if (!name) {
    throw new Error('entity query requires a "name" field (path pattern or name substring)');
  }

  // Find matching artifacts
  const re = patternToRegex(name);
  let matches = Object.entries(instance.artifacts).filter(([p, a]) => {
    if (!re.test(p)) return false;
    if (entityType && a.type !== entityType) return false;
    return true;
  });

  matches = matches.slice(0, limit);
  const rootPaths = new Set(matches.map(([p]) => p));

  // Expand subgraph to requested depth
  const { nodes, edges } = extractSubgraph(instance, rootPaths, depth);

  // Enrich nodes with schema type info
  const enrichedNodes = enrichNodes(nodes, instance, schema);

  return {
    queryType: 'entity',
    pattern: name,
    entityType: entityType || null,
    depth,
    nodeCount: enrichedNodes.length,
    edgeCount: edges.length,
    nodes: enrichedNodes,
    edges
  };
}

// ---------------------------------------------------------------------------
// Relation query — find relationships between/from entities
// ---------------------------------------------------------------------------

function queryRelation(schema, instance, query) {
  const { from, to, depKind, name, limit = 50 } = query;

  if (!from && !to && !name) {
    throw new Error(
      'relation query requires at least one of: "from", "to", or "name" (entity pattern)'
    );
  }

  let edges = instance.dependencies;

  // Filter by source
  if (from) {
    const re = patternToRegex(from);
    edges = edges.filter(d => re.test(d.from));
  }

  // Filter by target
  if (to) {
    const re = patternToRegex(to);
    edges = edges.filter(d => re.test(d.to));
  }

  // If name is given without from/to, match either end
  if (name && !from && !to) {
    const re = patternToRegex(name);
    edges = edges.filter(d => re.test(d.from) || re.test(d.to));
  }

  // Filter by dep kind
  if (depKind) {
    edges = edges.filter(d => d.kind === depKind);
  }

  edges = edges.slice(0, limit);

  // Collect involved nodes
  const involvedPaths = new Set();
  for (const e of edges) {
    involvedPaths.add(e.from);
    involvedPaths.add(e.to);
  }

  const nodes = [];
  for (const p of involvedPaths) {
    if (instance.artifacts[p]) {
      nodes.push(buildNodeSummary(p, instance.artifacts[p]));
    }
  }

  return {
    queryType: 'relation',
    from: from || null,
    to: to || null,
    depKind: depKind || null,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges: edges.map(formatEdge)
  };
}

// ---------------------------------------------------------------------------
// Structure query — directory tree and type breakdown
// ---------------------------------------------------------------------------

function queryStructure(schema, instance, query) {
  const { name, entityType } = query;

  let entries = Object.entries(instance.artifacts);
  if (name) {
    const re = patternToRegex(name);
    entries = entries.filter(([p]) => re.test(p));
  }
  if (entityType) {
    entries = entries.filter(([, a]) => a.type === entityType);
  }

  // Build directory tree
  const tree = {};
  for (const [p, a] of entries) {
    const parts = p.split('/');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = {};
      node = node[parts[i]];
    }
    const fileName = parts[parts.length - 1];
    node[fileName] = { type: a.type, kind: a.kind || null };
  }

  // Type breakdown
  const byType = {};
  const byKind = {};
  for (const [, a] of entries) {
    byType[a.type] = (byType[a.type] || 0) + 1;
    if (a.kind) byKind[a.kind] = (byKind[a.kind] || 0) + 1;
  }

  // Schema type descriptions
  const typeDescriptions = {};
  for (const typeName of Object.keys(byType)) {
    const def = (schema.elementTypes || {})[typeName];
    if (def) typeDescriptions[typeName] = def.description || null;
  }

  return {
    queryType: 'structure',
    pattern: name || null,
    entityType: entityType || null,
    totalArtifacts: entries.length,
    byType,
    byKind,
    typeDescriptions,
    tree
  };
}

// ---------------------------------------------------------------------------
// Impact query — transitive dependency analysis
// ---------------------------------------------------------------------------

function queryImpact(schema, instance, query) {
  const { name, depth = 3, direction = 'both', limit = 100 } = query;
  if (!name) {
    throw new Error('impact query requires a "name" field (artifact path or pattern)');
  }

  // Find root artifacts
  const re = patternToRegex(name);
  const roots = Object.keys(instance.artifacts).filter(p => re.test(p));

  if (roots.length === 0) {
    return {
      queryType: 'impact',
      pattern: name,
      direction,
      depth,
      nodeCount: 0,
      edgeCount: 0,
      nodes: [],
      edges: [],
      layers: []
    };
  }

  // Build adjacency maps
  const outAdj = new Map(); // from -> [{to, edge}]
  const inAdj = new Map();  // to -> [{from, edge}]
  for (const d of instance.dependencies) {
    if (!outAdj.has(d.from)) outAdj.set(d.from, []);
    outAdj.get(d.from).push({ target: d.to, edge: d });
    if (!inAdj.has(d.to)) inAdj.set(d.to, []);
    inAdj.get(d.to).push({ target: d.from, edge: d });
  }

  // BFS traversal
  const visited = new Set(roots);
  const collectedEdges = [];
  const layers = [roots.slice()];
  let frontier = roots.slice();

  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const nextFrontier = [];
    for (const node of frontier) {
      const neighbors = [];
      if (direction === 'outbound' || direction === 'both') {
        for (const n of (outAdj.get(node) || [])) {
          neighbors.push(n);
        }
      }
      if (direction === 'inbound' || direction === 'both') {
        for (const n of (inAdj.get(node) || [])) {
          neighbors.push(n);
        }
      }

      for (const { target, edge } of neighbors) {
        collectedEdges.push(edge);
        if (!visited.has(target)) {
          visited.add(target);
          nextFrontier.push(target);
        }
      }
    }

    if (nextFrontier.length > 0) {
      layers.push(nextFrontier.slice());
    }
    frontier = nextFrontier;

    if (visited.size >= limit) break;
  }

  // Deduplicate edges
  const edgeSet = new Set();
  const uniqueEdges = [];
  for (const e of collectedEdges) {
    const key = `${e.from}|${e.to}|${e.kind}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      uniqueEdges.push(e);
    }
  }

  // Build node list
  const nodes = [];
  for (const p of visited) {
    if (instance.artifacts[p]) {
      const n = buildNodeSummary(p, instance.artifacts[p]);
      n.isRoot = roots.includes(p);
      nodes.push(n);
    }
  }

  return {
    queryType: 'impact',
    pattern: name,
    direction,
    depth,
    nodeCount: nodes.length,
    edgeCount: uniqueEdges.length,
    nodes,
    edges: uniqueEdges.map(formatEdge),
    layers: layers.map((l, i) => ({ depth: i, artifacts: l }))
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a subgraph around a set of root paths to a given depth.
 */
function extractSubgraph(instance, rootPaths, depth) {
  const visited = new Set(rootPaths);
  const collectedEdges = [];
  let frontierSet = new Set(rootPaths);

  for (let d = 0; d < depth && frontierSet.size > 0; d++) {
    const nextFrontier = [];
    for (const dep of instance.dependencies) {
      const fromInFrontier = frontierSet.has(dep.from);
      const toInFrontier = frontierSet.has(dep.to);
      if (fromInFrontier || toInFrontier) {
        collectedEdges.push(dep);
        const neighbor = fromInFrontier ? dep.to : dep.from;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          nextFrontier.push(neighbor);
        }
      }
    }
    frontierSet = new Set(nextFrontier);
  }

  // Deduplicate edges
  const edgeSet = new Set();
  const edges = [];
  for (const e of collectedEdges) {
    const key = `${e.from}|${e.to}|${e.kind}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push(formatEdge(e));
    }
  }

  const nodes = [];
  for (const p of visited) {
    if (instance.artifacts[p]) {
      nodes.push(buildNodeSummary(p, instance.artifacts[p]));
    }
  }

  return { nodes, edges };
}

/**
 * Build a compact node summary for an artifact.
 */
function buildNodeSummary(artPath, artifact) {
  return {
    path: artPath,
    type: artifact.type,
    kind: artifact.kind || null,
    summary: artifact.summary || null,
    intent: artifact.intent || null,
    exports: artifact.exports || [],
    tags: artifact.tags || [],
    size: artifact.size || null
  };
}

/**
 * Enrich nodes with schema type definitions.
 */
function enrichNodes(nodes, instance, schema) {
  return nodes.map(n => {
    const typeDef = (schema.elementTypes || {})[n.type];
    return {
      ...n,
      typeDescription: typeDef ? (typeDef.description || null) : null
    };
  });
}

/**
 * Format a dependency edge for output.
 */
function formatEdge(dep) {
  return {
    from: dep.from,
    to: dep.to,
    kind: dep.kind,
    weight: dep.weight != null ? dep.weight : null,
    intent: dep.intent || null
  };
}

module.exports = { queryModel, extractSubgraph, buildNodeSummary };
