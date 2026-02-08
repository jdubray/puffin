/**
 * Synthesis Engine
 *
 * Orchestrates the outcome flow synthesis pipeline: reads granular
 * lifecycles, invokes Claude for high-level synthesis, validates the
 * response, computes layout, and persists the synthesized graph.
 *
 * @module synthesis-engine
 */

const { buildSynthesisPrompt } = require('./prompts/synthesis')
const { extractJson, validateSynthesis } = require('./synthesis-validation')
const { computeLayout } = require('./layout-engine')

/** Maximum number of Claude invocation retries on validation failure */
const MAX_RETRIES = 2

class SynthesisEngine {
  /**
   * @param {Object} options
   * @param {import('./lifecycle-repository').LifecycleRepository} options.repository
   * @param {import('../../memory-plugin/lib/claude-client').ClaudeClient} options.claudeClient
   * @param {import('./storage').Storage} options.storage
   * @param {Object} [options.logger]
   */
  constructor({ repository, claudeClient, storage, logger }) {
    if (!repository) throw new Error('SynthesisEngine requires a repository')
    if (!claudeClient) throw new Error('SynthesisEngine requires a claudeClient')
    if (!storage) throw new Error('SynthesisEngine requires a storage')

    this.repository = repository
    this.claudeClient = claudeClient
    this.storage = storage
    this.logger = logger || console
  }

  /**
   * Run the full synthesis pipeline.
   *
   * 1. Load all granular lifecycles
   * 2. Build prompt and invoke Claude
   * 3. Validate response (retry on failure)
   * 4. Recompute aggregate statuses from actual data
   * 5. Compute layout coordinates
   * 6. Persist to storage
   *
   * @returns {Promise<{nodes: Array, edges: Array}>}
   */
  async synthesize() {
    const lifecycles = await this.repository.list()

    if (lifecycles.length === 0) {
      this.logger.info('[synthesis-engine] No lifecycles to synthesize')
      return { nodes: [], edges: [] }
    }

    this.logger.info(`[synthesis-engine] Synthesizing from ${lifecycles.length} granular outcomes`)

    const prompt = buildSynthesisPrompt(lifecycles)
    const synthesisData = await this._invokeWithRetry(prompt, lifecycles.length)

    // Recompute statuses from actual lifecycle data (don't trust Claude's computation)
    const enrichedNodes = this._recomputeStatuses(synthesisData.nodes, lifecycles)

    // Compute layout
    const graph = computeLayout(enrichedNodes, synthesisData.edges)

    // Persist
    await this._persist(graph, lifecycles.length)

    this.logger.info(`[synthesis-engine] Synthesis complete: ${graph.nodes.length} nodes, ${graph.edges.length} edges`)
    return graph
  }

  /**
   * Get cached synthesized graph if it exists and is still valid.
   *
   * @returns {Promise<{nodes: Array, edges: Array}|null>}
   */
  async getCached() {
    try {
      const data = await this.storage.load()

      if (!data.synthesizedGraph || !data.synthesizedGraph.version) {
        return null
      }

      // Invalidate cache if lifecycle count has changed
      const lifecycles = await this.repository.list()
      if (data.synthesizedGraph.lifecycleCount !== lifecycles.length) {
        this.logger.info('[synthesis-engine] Cache stale: lifecycle count changed')
        return null
      }

      return data.synthesizedGraph.graph
    } catch (err) {
      this.logger.warn('[synthesis-engine] Failed to load cache:', err.message)
      return null
    }
  }

  /**
   * Clear the cached synthesized graph.
   */
  async clearCache() {
    const data = await this.storage.load()
    delete data.synthesizedGraph
    await this.storage.save(data)
    this.logger.info('[synthesis-engine] Cache cleared')
  }

  /**
   * Invoke Claude with retry on validation failure.
   *
   * @param {string} prompt
   * @param {number} lifecycleCount
   * @returns {Promise<{nodes: Array, edges: Array}>}
   * @private
   */
  async _invokeWithRetry(prompt, lifecycleCount) {
    let lastErrors = []

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        this.logger.info(`[synthesis-engine] Claude invocation attempt ${attempt + 1}/${MAX_RETRIES + 1}`)

        const rawResponse = await this.claudeClient.invoke(prompt, { model: 'haiku' })
        const json = extractJson(rawResponse)

        if (!json) {
          lastErrors = ['Failed to extract JSON from Claude response']
          this.logger.warn('[synthesis-engine] JSON extraction failed, retrying...')
          continue
        }

        const { valid, data, errors } = validateSynthesis(json, lifecycleCount)
        if (!valid) {
          lastErrors = errors
          this.logger.warn('[synthesis-engine] Validation failed:', errors.slice(0, 3).join('; '))
          continue
        }

        return data
      } catch (err) {
        lastErrors = [err.message]
        this.logger.error('[synthesis-engine] Claude invocation error:', err.message)

        // Don't retry on fatal errors
        if (err.message.includes('not found') || err.message.includes('ENOENT')) {
          throw err
        }
      }
    }

    throw new Error(`Synthesis failed after ${MAX_RETRIES + 1} attempts: ${lastErrors.join('; ')}`)
  }

  /**
   * Recompute node statuses from actual lifecycle data.
   * Claude's status computation may be wrong — we use the real data.
   *
   * @param {Array} nodes - Synthesized nodes with aggregates
   * @param {Array} lifecycles - All granular lifecycles
   * @returns {Array} Nodes with corrected statuses
   * @private
   */
  _recomputeStatuses(nodes, lifecycles) {
    return nodes.map(node => {
      const aggregatedStatuses = (node.aggregates || []).map(idx => {
        const lc = lifecycles[idx - 1] // 1-indexed
        return lc ? lc.status : 'not_started'
      })

      let status = 'not_started'
      if (aggregatedStatuses.length > 0) {
        const allAchieved = aggregatedStatuses.every(s => s === 'achieved')
        const anyActive = aggregatedStatuses.some(s => s === 'in_progress' || s === 'achieved')

        if (allAchieved) {
          status = 'achieved'
        } else if (anyActive) {
          status = 'in_progress'
        }
      }

      return { ...node, status }
    })
  }

  /**
   * Persist synthesized graph to storage.
   *
   * @param {{ nodes: Array, edges: Array }} graph
   * @param {number} lifecycleCount
   * @private
   */
  async _persist(graph, lifecycleCount) {
    const data = await this.storage.load()
    data.synthesizedGraph = {
      version: 1,
      lifecycleCount,
      synthesizedAt: new Date().toISOString(),
      graph
    }
    await this.storage.save(data)
  }
}

module.exports = { SynthesisEngine }
