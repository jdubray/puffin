/**
 * Layout Engine for Synthesized Outcome Flow
 *
 * Computes x/y coordinates for synthesized outcome nodes using a
 * modified Sugiyama-style layered layout. Handles cycles by breaking
 * back-edges before layering, then restoring them for rendering.
 *
 * The result is a left-to-right flow that looks like a state machine.
 *
 * @module layout-engine
 */

const NODE_WIDTH = 180
const NODE_HEIGHT = 64
const LAYER_SPACING = 260
const NODE_SPACING = 100
const PADDING_X = 60
const PADDING_Y = 50

/**
 * Compute layout coordinates for a synthesized outcome flow graph.
 *
 * @param {Array<{id: string, label: string, status: string}>} nodes
 * @param {Array<{from: string, to: string}>} edges
 * @returns {{ nodes: Array, edges: Array }} Nodes with x/y added, edges preserved
 */
function computeLayout(nodes, edges) {
  if (nodes.length === 0) return { nodes: [], edges: [] }

  const nodeIds = new Set(nodes.map(n => n.id))

  // Filter edges to only reference existing nodes
  const validEdges = edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))

  // Step 1: Break cycles by identifying back-edges via DFS
  const { forwardEdges } = breakCycles(nodeIds, validEdges)

  // Step 2: Assign layers using longest-path (topological order)
  const layers = assignLayers(nodeIds, forwardEdges)

  // Step 3: Order nodes within layers to reduce crossings (barycentric)
  orderWithinLayers(layers, validEdges)

  // Step 4: Assign coordinates
  const positioned = assignCoordinates(nodes, layers)

  return { nodes: positioned, edges: validEdges }
}

/**
 * Break cycles via DFS, classifying edges as forward or back.
 * @param {Set<string>} nodeIds
 * @param {Array<{from: string, to: string}>} edges
 * @returns {{ forwardEdges: Array, backEdges: Array }}
 */
function breakCycles(nodeIds, edges) {
  const adj = new Map()
  for (const id of nodeIds) adj.set(id, [])
  for (const e of edges) adj.get(e.from).push(e.to)

  const visited = new Set()
  const inStack = new Set()
  const backEdges = new Set()

  function dfs(node) {
    visited.add(node)
    inStack.add(node)
    for (const neighbor of adj.get(node)) {
      if (inStack.has(neighbor)) {
        backEdges.add(`${node}->${neighbor}`)
      } else if (!visited.has(neighbor)) {
        dfs(neighbor)
      }
    }
    inStack.delete(node)
  }

  for (const id of nodeIds) {
    if (!visited.has(id)) dfs(id)
  }

  const forwardEdges = edges.filter(e => !backEdges.has(`${e.from}->${e.to}`))
  const backEdgeList = edges.filter(e => backEdges.has(`${e.from}->${e.to}`))

  return { forwardEdges, backEdges: backEdgeList }
}

/**
 * Assign layers using longest-path from roots in the DAG (forward edges only).
 * @param {Set<string>} nodeIds
 * @param {Array<{from: string, to: string}>} forwardEdges
 * @returns {Map<number, string[]>} layer index -> node IDs
 */
function assignLayers(nodeIds, forwardEdges) {
  // Build in-degree for forward edges
  const inDegree = new Map()
  const adj = new Map()
  for (const id of nodeIds) {
    inDegree.set(id, 0)
    adj.set(id, [])
  }
  for (const e of forwardEdges) {
    adj.get(e.from).push(e.to)
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1)
  }

  // Kahn's topological sort
  const queue = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const depth = new Map()
  while (queue.length > 0) {
    const node = queue.shift()
    const d = depth.get(node) || 0
    for (const neighbor of adj.get(node)) {
      const newDepth = d + 1
      if (!depth.has(neighbor) || depth.get(neighbor) < newDepth) {
        depth.set(neighbor, newDepth)
      }
      const deg = inDegree.get(neighbor) - 1
      inDegree.set(neighbor, deg)
      if (deg === 0) queue.push(neighbor)
    }
  }

  // Assign depth 0 to any orphans
  for (const id of nodeIds) {
    if (!depth.has(id)) depth.set(id, 0)
  }

  // Group by layer
  const layers = new Map()
  for (const [id, d] of depth) {
    if (!layers.has(d)) layers.set(d, [])
    layers.get(d).push(id)
  }

  return layers
}

/**
 * Reorder nodes within each layer to minimize edge crossings.
 * Uses single-pass barycentric heuristic.
 * @param {Map<number, string[]>} layers
 * @param {Array<{from: string, to: string}>} edges
 */
function orderWithinLayers(layers, edges) {
  // Build position lookup
  const nodeLayer = new Map()
  for (const [layer, ids] of layers) {
    ids.forEach((id, idx) => nodeLayer.set(id, { layer, idx }))
  }

  // For each layer (except first), compute barycenter from predecessors
  const sortedLayerKeys = [...layers.keys()].sort((a, b) => a - b)

  for (let i = 1; i < sortedLayerKeys.length; i++) {
    const layerKey = sortedLayerKeys[i]
    const ids = layers.get(layerKey)

    const barycenters = new Map()
    for (const id of ids) {
      // Find all predecessors (edges pointing to this node)
      const predecessors = edges
        .filter(e => e.to === id && nodeLayer.has(e.from))
        .map(e => nodeLayer.get(e.from).idx)

      if (predecessors.length > 0) {
        const avg = predecessors.reduce((a, b) => a + b, 0) / predecessors.length
        barycenters.set(id, avg)
      } else {
        barycenters.set(id, Infinity)
      }
    }

    ids.sort((a, b) => (barycenters.get(a) || 0) - (barycenters.get(b) || 0))

    // Update positions
    ids.forEach((id, idx) => {
      const info = nodeLayer.get(id)
      if (info) info.idx = idx
    })
  }
}

/**
 * Assign x/y coordinates based on layer assignments.
 * @param {Array} nodes - Original nodes
 * @param {Map<number, string[]>} layers
 * @returns {Array} Nodes with x, y added
 */
function assignCoordinates(nodes, layers) {
  const nodeMap = new Map()
  for (const n of nodes) nodeMap.set(n.id, { ...n })

  // Find max nodes per layer for centering
  let maxPerLayer = 0
  for (const ids of layers.values()) {
    if (ids.length > maxPerLayer) maxPerLayer = ids.length
  }

  const sortedLayerKeys = [...layers.keys()].sort((a, b) => a - b)

  const positioned = []
  for (const layerKey of sortedLayerKeys) {
    const ids = layers.get(layerKey)
    const layerIdx = sortedLayerKeys.indexOf(layerKey)

    // Center this layer vertically relative to the tallest layer
    const totalHeight = ids.length * NODE_SPACING
    const maxHeight = maxPerLayer * NODE_SPACING
    const offsetY = (maxHeight - totalHeight) / 2

    ids.forEach((id, idx) => {
      const node = nodeMap.get(id)
      if (node) {
        node.x = PADDING_X + layerIdx * LAYER_SPACING
        node.y = PADDING_Y + offsetY + idx * NODE_SPACING
        positioned.push(node)
      }
    })
  }

  // Add any orphan nodes not in layers
  for (const n of nodes) {
    if (!positioned.find(p => p.id === n.id)) {
      positioned.push({ ...n, x: PADDING_X, y: PADDING_Y + positioned.length * NODE_SPACING })
    }
  }

  return positioned
}

module.exports = { computeLayout, NODE_WIDTH, NODE_HEIGHT }
