/**
 * DAG Engine
 *
 * Directed acyclic graph engine for lifecycle dependencies.
 * Provides dependency management, cycle detection (Kahn's algorithm),
 * topological sorting, and serialization for renderer consumption.
 *
 * @module dag-engine
 */

/**
 * DAG engine operating on lifecycle data via a repository.
 *
 * @example
 * const dag = new DAGEngine(repository);
 * await dag.addDependency(childId, parentId);
 * const order = await dag.topologicalSort();
 * const graph = await dag.serialize();
 */
class DAGEngine {
  /**
   * @param {import('./lifecycle-repository').LifecycleRepository} repository
   */
  constructor(repository) {
    if (!repository) {
      throw new Error('DAGEngine requires a LifecycleRepository instance')
    }
    this.repository = repository
  }

  /**
   * Add a dependency: `fromId` depends on `toId`.
   *
   * Validates both lifecycles exist and that adding the edge
   * would not create a cycle before persisting.
   *
   * @param {string} fromId - Lifecycle that depends on another
   * @param {string} toId - Lifecycle being depended upon
   * @returns {Promise<Object>} Updated lifecycle (fromId)
   * @throws {Error} If either lifecycle not found, self-dependency, duplicate, or would create cycle
   */
  async addDependency(fromId, toId) {
    if (!fromId || !toId) {
      throw new Error('Both fromId and toId are required')
    }
    if (fromId === toId) {
      throw new Error('A lifecycle cannot depend on itself')
    }

    const data = await this.repository.storage.load()
    const from = data.lifecycles.find(lc => lc.id === fromId)
    const to = data.lifecycles.find(lc => lc.id === toId)

    if (!from) throw new Error(`Lifecycle "${fromId}" not found`)
    if (!to) throw new Error(`Lifecycle "${toId}" not found`)

    if (from.dependencies.includes(toId)) {
      return from // already exists
    }

    // Check for cycle: temporarily add edge, run Kahn's
    from.dependencies.push(toId)
    const hasCycle = this._detectCycle(data.lifecycles)

    if (hasCycle) {
      from.dependencies.pop() // rollback
      throw new Error(
        `Adding dependency from "${from.title}" to "${to.title}" would create a cycle`
      )
    }

    from.updatedAt = new Date().toISOString()
    await this.repository.storage.save(data)
    return from
  }

  /**
   * Remove a dependency.
   *
   * @param {string} fromId - Lifecycle that has the dependency
   * @param {string} toId - Dependency to remove
   * @returns {Promise<Object|null>} Updated lifecycle or null if not found
   */
  async removeDependency(fromId, toId) {
    if (!fromId || !toId) return null

    const data = await this.repository.storage.load()
    const from = data.lifecycles.find(lc => lc.id === fromId)
    if (!from) return null

    const idx = from.dependencies.indexOf(toId)
    if (idx === -1) return from

    from.dependencies.splice(idx, 1)
    from.updatedAt = new Date().toISOString()
    await this.repository.storage.save(data)
    return from
  }

  /**
   * Get dependencies for a lifecycle.
   *
   * @param {string} lifecycleId
   * @returns {Promise<string[]>} Dependency IDs
   */
  async getDependencies(lifecycleId) {
    const lc = await this.repository.get(lifecycleId)
    return lc ? [...lc.dependencies] : []
  }

  /**
   * Get lifecycles that depend on the given lifecycle (reverse deps).
   *
   * @param {string} lifecycleId
   * @returns {Promise<string[]>} IDs of lifecycles depending on this one
   */
  async getDependents(lifecycleId) {
    if (!lifecycleId) return []
    const data = await this.repository.storage.load()
    return data.lifecycles
      .filter(lc => lc.dependencies.includes(lifecycleId))
      .map(lc => lc.id)
  }

  /**
   * Produce a topological ordering of all lifecycles using Kahn's algorithm.
   *
   * @returns {Promise<string[]>} Lifecycle IDs in valid execution order
   * @throws {Error} If the graph contains a cycle
   */
  async topologicalSort() {
    const data = await this.repository.storage.load()
    return this._kahnSort(data.lifecycles)
  }

  /**
   * Serialize the DAG for renderer consumption.
   *
   * Returns nodes with layer-based x/y coordinates and edges.
   * Layer 0 = nodes with no dependencies (roots); deeper layers
   * follow dependency depth.
   *
   * @returns {Promise<{nodes: Object[], edges: Object[]}>}
   */
  async serialize() {
    const data = await this.repository.storage.load()
    const lifecycles = data.lifecycles
    const sorted = this._kahnSort(lifecycles)

    // Build lookup
    const lcMap = new Map()
    for (const lc of lifecycles) lcMap.set(lc.id, lc)

    // Compute depth (layer) for each node
    const depth = new Map()
    for (const id of sorted) {
      const lc = lcMap.get(id)
      let maxParentDepth = -1
      for (const dep of lc.dependencies) {
        if (depth.has(dep)) {
          maxParentDepth = Math.max(maxParentDepth, depth.get(dep))
        }
      }
      depth.set(id, maxParentDepth + 1)
    }

    // Group by layer for y positioning
    const layers = new Map()
    for (const [id, d] of depth) {
      if (!layers.has(d)) layers.set(d, [])
      layers.get(d).push(id)
    }

    const NODE_X_SPACING = 200
    const NODE_Y_SPACING = 80

    // For layer 0 with many disconnected nodes, use a grid layout
    const GRID_COLUMNS = 5

    const nodes = []
    for (const [layer, ids] of layers) {
      const useGrid = layer === 0 && ids.length > 6 && layers.size === 1
      ids.forEach((id, idx) => {
        const lc = lcMap.get(id)
        let x, y
        if (useGrid) {
          const col = idx % GRID_COLUMNS
          const row = Math.floor(idx / GRID_COLUMNS)
          x = col * NODE_X_SPACING
          y = row * NODE_Y_SPACING
        } else {
          x = layer * NODE_X_SPACING
          y = idx * NODE_Y_SPACING
        }
        nodes.push({
          id: lc.id,
          title: lc.title,
          status: lc.status,
          x,
          y
        })
      })
    }

    const edges = []
    for (const lc of lifecycles) {
      for (const dep of lc.dependencies) {
        edges.push({ from: dep, to: lc.id })
      }
    }

    return { nodes, edges }
  }

  /**
   * Kahn's algorithm — topological sort with cycle detection.
   *
   * @param {Object[]} lifecycles - Array of lifecycle objects
   * @returns {string[]} Sorted IDs
   * @throws {Error} If a cycle is detected
   * @private
   */
  _kahnSort(lifecycles) {
    // Build adjacency and in-degree
    const inDegree = new Map()
    const adj = new Map() // parent -> children (who depends on parent)
    const ids = new Set()

    for (const lc of lifecycles) ids.add(lc.id)

    for (const lc of lifecycles) {
      if (!inDegree.has(lc.id)) inDegree.set(lc.id, 0)
      if (!adj.has(lc.id)) adj.set(lc.id, [])

      for (const dep of lc.dependencies) {
        if (!ids.has(dep)) continue
        if (!adj.has(dep)) adj.set(dep, [])
        adj.get(dep).push(lc.id)
        inDegree.set(lc.id, (inDegree.get(lc.id) || 0) + 1)
      }
    }

    // Seed queue with zero in-degree
    const queue = []
    for (const id of ids) {
      if ((inDegree.get(id) || 0) === 0) queue.push(id)
    }

    const sorted = []
    while (queue.length > 0) {
      const node = queue.shift()
      sorted.push(node)

      for (const child of (adj.get(node) || [])) {
        const deg = inDegree.get(child) - 1
        inDegree.set(child, deg)
        if (deg === 0) queue.push(child)
      }
    }

    if (sorted.length !== ids.size) {
      // Find nodes in the cycle for a better error message
      const sortedSet = new Set(sorted)
      const inCycle = [...ids].filter(id => !sortedSet.has(id))
      const cycleNames = inCycle
        .map(id => {
          const lc = lifecycles.find(l => l.id === id)
          return lc ? `"${lc.title}"` : id
        })
        .join(', ')
      throw new Error(`Circular dependency detected involving: ${cycleNames}`)
    }

    return sorted
  }

  /**
   * Check if the graph has a cycle.
   *
   * @param {Object[]} lifecycles
   * @returns {boolean} True if a cycle exists
   * @private
   */
  _detectCycle(lifecycles) {
    try {
      this._kahnSort(lifecycles)
      return false
    } catch {
      return true
    }
  }
}

module.exports = { DAGEngine }
