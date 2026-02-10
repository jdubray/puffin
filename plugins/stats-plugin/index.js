/**
 * Stats Plugin - Entry Point
 * Tracks and visualizes usage statistics across branches
 */

// MetricsService access — optional dependency, guarded for standalone testing
let _getMetricsService = null
try {
  _getMetricsService = require('../../src/main/metrics-service').getMetricsService
} catch {
  // Metrics service unavailable (standalone testing or missing module)
}

const StatsPlugin = {
  context: null,
  historyService: null,
  metricsService: null,

  async activate(context) {
    this.context = context
    this.historyService = context.getService('history')

    if (!this.historyService) {
      context.log.warn('History service not available at activation time - stats will be limited')
    } else {
      context.log.info('History service acquired, isAvailable:', this.historyService.isAvailable())
    }

    // Initialize MetricsService (optional — enriches stats with token/cost data from AI operations)
    this.metricsService = null
    if (_getMetricsService) {
      try {
        this.metricsService = _getMetricsService()
        if (this.metricsService) {
          context.log.info('MetricsService acquired for cognitive architecture metrics')
        } else {
          context.log.warn('MetricsService not yet initialized — metrics-enriched stats will be unavailable')
        }
      } catch (err) {
        context.log.warn('MetricsService initialization failed:', err.message)
      }
    } else {
      context.log.warn('MetricsService module not available — metrics-enriched stats will be unavailable')
    }

    // Register IPC handlers for renderer communication
    context.registerIpcHandler('getWeeklyStats', this.getWeeklyStats.bind(this))
    context.registerIpcHandler('getStats', this.getStats.bind(this))
    context.registerIpcHandler('getComponentMetrics', this.getComponentMetrics.bind(this))
    context.registerIpcHandler('getMetricsSummary', this.getMetricsSummary.bind(this))
    context.registerIpcHandler('getComponentBreakdown', this.getComponentBreakdown.bind(this))
    context.registerIpcHandler('getOperationStats', this.getOperationStats.bind(this))
    context.registerIpcHandler('getDailyTrends', this.getDailyTrends.bind(this))
    context.registerIpcHandler('getWeeklyNormalized', this.getWeeklyNormalized.bind(this))
    context.registerIpcHandler('showSaveDialog', this.showSaveDialog.bind(this))
    context.registerIpcHandler('saveMarkdownExport', this.saveMarkdownExport.bind(this))

    // Register actions (for programmatic access from other plugins)
    context.registerAction('getStats', this.getStats.bind(this))
    context.registerAction('exportStats', this.exportStats.bind(this))

    context.log.info('Stats plugin activated')
  },

  async deactivate() {
    this.historyService = null
    this.metricsService = null
    this.context.log.info('Stats plugin deactivated')
  },

  /**
   * Get weekly statistics data
   * @param {Object} options - Filter options
   * @param {number} options.weeks - Number of weeks to retrieve (default: 26)
   * @returns {Promise<Array>} Weekly stats data
   */
  async getWeeklyStats(options = {}) {
    const weeks = options.weeks || 26

    // Use real history data if available
    if (this.historyService && this.historyService.isAvailable()) {
      const stats = await this.computeWeeklyStatsFromHistory(weeks)
      const totals = this.computeTotals(stats)
      this.context.log.info(`Weekly stats computed from history: ${stats.length} weeks, ${totals.turns} turns, $${totals.cost.toFixed(2)} cost`)
      return stats
    }

    // Fallback to mock data if history is unavailable
    this.context.log.warn('Using mock data - history service unavailable (historyService:', !!this.historyService, ', isAvailable:', this.historyService?.isAvailable?.(), ')')
    return this.generateMockData(weeks)
  },

  /**
   * Compute weekly stats from real history data
   * @param {number} weeks - Number of weeks to compute
   * @returns {Promise<Array>} Weekly stats data
   */
  async computeWeeklyStatsFromHistory(weeks) {
    const allPrompts = await this.historyService.getAllPrompts()

    // Log prompt data quality for debugging
    const withResponse = allPrompts.filter(p => p.response)
    const withCost = withResponse.filter(p => p.response.cost > 0)
    const withTurns = withResponse.filter(p => p.response.turns > 0)
    this.context.log.info(`History: ${allPrompts.length} prompts, ${withResponse.length} with response, ${withCost.length} with cost, ${withTurns.length} with turns`)

    // Group prompts by week
    const weeklyData = new Map()
    const now = new Date()

    // Initialize weeks
    for (let i = weeks - 1; i >= 0; i--) {
      const weekDate = new Date(now)
      weekDate.setDate(weekDate.getDate() - i * 7)
      const weekNumber = this.getWeekNumber(weekDate)
      const year = weekDate.getFullYear()
      const weekKey = `${year}-W${String(weekNumber).padStart(2, '0')}`

      weeklyData.set(weekKey, {
        week: weekKey,
        year,
        weekNumber,
        turns: 0,
        cost: 0,
        duration: 0
      })
    }

    // Aggregate prompt data into weeks
    let matched = 0
    let unmatched = 0
    for (const prompt of allPrompts) {
      if (!prompt.response) continue

      const timestamp = prompt.timestamp
      const weekNumber = this.getWeekNumber(timestamp)
      const year = timestamp.getFullYear()
      const weekKey = `${year}-W${String(weekNumber).padStart(2, '0')}`

      const weekStats = weeklyData.get(weekKey)
      if (weekStats) {
        matched++
        weekStats.turns += prompt.response.turns || 1
        weekStats.cost += prompt.response.cost || 0
        weekStats.duration += prompt.response.duration || 0
      } else {
        unmatched++
      }
    }
    this.context.log.info(`Week matching: ${matched} matched, ${unmatched} outside window`)

    // Convert to array and sort by week
    return Array.from(weeklyData.values())
      .sort((a, b) => a.week.localeCompare(b.week))
  },

  /**
   * Get aggregated statistics
   * @returns {Promise<Object>} Aggregated stats
   */
  async getStats() {
    const weeklyStats = await this.getWeeklyStats()

    // Get per-branch statistics if history service is available
    let branches = []
    if (this.historyService && this.historyService.isAvailable()) {
      branches = await this.computeBranchStats()
    }

    const totals = this.computeTotals(weeklyStats)
    this.context.log.info(`getStats: ${branches.length} branches, totals: turns=${totals.turns}, cost=$${totals.cost.toFixed(2)}, duration=${totals.duration}ms`)

    // Enrich with MetricsService data when available
    let componentMetrics = null
    try {
      componentMetrics = await this.getComponentMetrics()
    } catch {
      // Non-fatal — legacy stats still returned
    }

    return {
      weeklyStats,
      totals,
      branches,
      componentMetrics
    }
  },

  /**
   * Get metrics for cognitive architecture components from MetricsService.
   * Falls back to null when MetricsService is unavailable.
   *
   * @param {Object} [options] - Filter options
   * @param {string} [options.component] - Filter by component (e.g. 'claude-service', 'cre-plan')
   * @param {string} [options.start_date] - ISO date filter start
   * @param {string} [options.end_date] - ISO date filter end
   * @returns {Promise<Object|null>} Component metrics or null if unavailable
   */
  async getComponentMetrics(options = {}) {
    const ms = this._acquireMetricsService()
    if (!ms) {
      this.context.log.warn('MetricsService not available — cannot retrieve component metrics')
      return null
    }

    try {
      const component = options.component || null
      const dateFilters = {}
      if (options.start_date) dateFilters.start_date = options.start_date
      if (options.end_date) dateFilters.end_date = options.end_date

      if (component) {
        // Single component stats
        return ms.getComponentStats(component, dateFilters)
      }

      // All components — query each known component
      const components = [
        'claude-service', 'cre-plan', 'cre-ris', 'cre-assertion',
        'hdsl-engine', 'memory-plugin', 'outcomes-plugin'
      ]

      const results = {}
      for (const comp of components) {
        const stats = ms.getComponentStats(comp, dateFilters)
        if (stats && stats.operation_count > 0) {
          results[comp] = stats
        }
      }

      return results
    } catch (err) {
      this.context.log.error('Failed to retrieve component metrics:', err.message)
      return null
    }
  },

  /**
   * Get 30-day metrics summary with previous period comparison and per-story normalization.
   *
   * @param {Object} [options]
   * @param {number} [options.days=30] - Period length in days.
   * @returns {Promise<Object>} Summary with current, previous, comparison, and perStory fields.
   */
  async getMetricsSummary(options = {}) {
    const ms = this._acquireMetricsService()
    if (!ms) {
      return this._emptyMetricsSummary()
    }

    try {
      const days = options.days || 30
      const now = new Date()
      const periodEnd = now.toISOString()
      const periodStart = new Date(now.getTime() - days * 86400000).toISOString()
      const prevPeriodStart = new Date(now.getTime() - days * 2 * 86400000).toISOString()

      // Query current and previous period events (complete events only carry metrics)
      const currentEvents = ms.queryEvents({
        event_type: 'complete',
        start_date: periodStart,
        end_date: periodEnd,
        limit: 10000
      })
      const previousEvents = ms.queryEvents({
        event_type: 'complete',
        start_date: prevPeriodStart,
        end_date: periodStart,
        limit: 10000
      })

      const current = this._aggregateEvents(currentEvents)
      const previous = this._aggregateEvents(previousEvents)

      // Comparison: percentage change (guarded against division by zero)
      const comparison = {
        operations: this._pctChange(current.operations, previous.operations),
        totalTokens: this._pctChange(current.totalTokens, previous.totalTokens),
        totalCost: this._pctChange(current.totalCost, previous.totalCost),
        avgDuration: this._pctChange(current.avgDuration, previous.avgDuration)
      }

      // Per-story normalization
      const uniqueStories = new Set(
        currentEvents.filter(e => e.story_id).map(e => e.story_id)
      )
      const storyCount = uniqueStories.size || 1 // avoid division by zero
      const perStory = {
        storyCount: uniqueStories.size,
        avgTokensPerStory: Math.round(current.totalTokens / storyCount),
        avgCostPerStory: +(current.totalCost / storyCount).toFixed(4),
        avgDurationPerStory: Math.round(current.totalDuration / storyCount)
      }

      return {
        periodDays: days,
        periodStart,
        periodEnd,
        current,
        previous,
        comparison,
        perStory
      }
    } catch (err) {
      this.context.log.error('getMetricsSummary failed:', err.message)
      return this._emptyMetricsSummary()
    }
  },

  /**
   * Get aggregated stats grouped by component with cost/token percentages.
   *
   * @param {Object} [options]
   * @param {number} [options.days=30] - Period length in days.
   * @returns {Promise<Object>} Component breakdown with totals and per-component stats.
   */
  async getComponentBreakdown(options = {}) {
    const ms = this._acquireMetricsService()
    if (!ms) {
      return { components: [], totals: this._zeroAggregates() }
    }

    try {
      const days = options.days || 30
      const now = new Date()
      const periodStart = new Date(now.getTime() - days * 86400000).toISOString()
      const periodEnd = now.toISOString()

      const allComponents = [
        'claude-service', 'cre-plan', 'cre-ris', 'cre-assertion',
        'hdsl-engine', 'memory-plugin', 'outcomes-plugin'
      ]

      const componentResults = []
      for (const comp of allComponents) {
        const stats = ms.getComponentStats(comp, {
          start_date: periodStart,
          end_date: periodEnd
        })
        if (stats && stats.operation_count > 0) {
          componentResults.push({
            component: comp,
            operations: stats.operation_count || 0,
            totalTokens: stats.total_tokens || 0,
            totalCost: stats.total_cost_usd || 0,
            avgDuration: Math.round(stats.avg_duration_ms || 0),
            maxDuration: stats.max_duration_ms || 0,
            minDuration: stats.min_duration_ms || 0
          })
        }
      }

      // Compute totals
      const totals = componentResults.reduce((acc, c) => ({
        operations: acc.operations + c.operations,
        totalTokens: acc.totalTokens + c.totalTokens,
        totalCost: acc.totalCost + c.totalCost
      }), { operations: 0, totalTokens: 0, totalCost: 0 })

      // Add percentages to each component
      const components = componentResults.map(c => ({
        ...c,
        totalCost: +c.totalCost.toFixed(4),
        pctOfOperations: totals.operations > 0
          ? +((c.operations / totals.operations) * 100).toFixed(1)
          : 0,
        pctOfTokens: totals.totalTokens > 0
          ? +((c.totalTokens / totals.totalTokens) * 100).toFixed(1)
          : 0,
        pctOfCost: totals.totalCost > 0
          ? +((c.totalCost / totals.totalCost) * 100).toFixed(1)
          : 0
      }))

      // Sort by cost descending
      components.sort((a, b) => b.totalCost - a.totalCost)

      return {
        periodDays: days,
        components,
        totals: {
          operations: totals.operations,
          totalTokens: totals.totalTokens,
          totalCost: +totals.totalCost.toFixed(4)
        }
      }
    } catch (err) {
      this.context.log.error('getComponentBreakdown failed:', err.message)
      return { components: [], totals: this._zeroAggregates() }
    }
  },

  /**
   * Get operation-level breakdown for a specific component.
   *
   * @param {Object} options
   * @param {string} options.component - Component identifier (e.g. 'claude-service').
   * @param {number} [options.days=30] - Period length in days.
   * @returns {Promise<Object>} Operation breakdown with per-operation aggregates.
   */
  async getOperationStats(options = {}) {
    const ms = this._acquireMetricsService()
    if (!ms) {
      return { component: options.component || null, operations: [] }
    }

    const component = options.component
    if (!component) {
      return { component: null, operations: [], error: 'component is required' }
    }

    try {
      const days = options.days || 30
      const now = new Date()
      const periodStart = new Date(now.getTime() - days * 86400000).toISOString()

      const events = ms.queryEvents({
        component,
        event_type: 'complete',
        start_date: periodStart,
        limit: 10000
      })

      // Group by operation
      const opMap = new Map()
      for (const evt of events) {
        const op = evt.operation || 'unknown'
        if (!opMap.has(op)) {
          opMap.set(op, {
            operation: op,
            count: 0,
            totalTokens: 0,
            totalCost: 0,
            totalDuration: 0,
            maxDuration: 0,
            minDuration: Infinity
          })
        }
        const entry = opMap.get(op)
        entry.count++
        entry.totalTokens += evt.total_tokens || 0
        entry.totalCost += evt.cost_usd || 0
        entry.totalDuration += evt.duration_ms || 0
        if ((evt.duration_ms || 0) > entry.maxDuration) entry.maxDuration = evt.duration_ms || 0
        if ((evt.duration_ms || 0) < entry.minDuration) entry.minDuration = evt.duration_ms || 0
      }

      const operations = Array.from(opMap.values()).map(op => ({
        operation: op.operation,
        count: op.count,
        totalTokens: op.totalTokens,
        totalCost: +op.totalCost.toFixed(4),
        avgDuration: op.count > 0 ? Math.round(op.totalDuration / op.count) : 0,
        maxDuration: op.maxDuration,
        minDuration: op.minDuration === Infinity ? 0 : op.minDuration,
        avgTokensPerOp: op.count > 0 ? Math.round(op.totalTokens / op.count) : 0,
        avgCostPerOp: op.count > 0 ? +(op.totalCost / op.count).toFixed(4) : 0
      }))

      // Sort by count descending
      operations.sort((a, b) => b.count - a.count)

      return {
        component,
        periodDays: days,
        operations
      }
    } catch (err) {
      this.context.log.error('getOperationStats failed:', err.message)
      return { component, operations: [] }
    }
  },

  /**
   * Get daily aggregated trends for the last N days.
   *
   * @param {Object} [options]
   * @param {number} [options.days=30] - Number of days to retrieve.
   * @returns {Promise<Object>} Daily trend data with per-day aggregates.
   */
  async getDailyTrends(options = {}) {
    const ms = this._acquireMetricsService()
    if (!ms) {
      return { days: [], periodDays: options.days || 30 }
    }

    try {
      const days = options.days || 30
      const now = new Date()
      const periodStart = new Date(now.getTime() - days * 86400000).toISOString()

      const events = ms.queryEvents({
        event_type: 'complete',
        start_date: periodStart,
        limit: 10000
      })

      // Group by date (YYYY-MM-DD)
      const dayMap = new Map()

      // Pre-populate all days so gaps show as zero
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000)
        const dateKey = d.toISOString().slice(0, 10)
        dayMap.set(dateKey, {
          date: dateKey,
          operations: 0,
          totalTokens: 0,
          totalCost: 0,
          totalDuration: 0,
          stories: new Set()
        })
      }

      for (const evt of events) {
        const dateKey = (evt.created_at || '').slice(0, 10)
        const bucket = dayMap.get(dateKey)
        if (!bucket) continue // outside our window
        bucket.operations++
        bucket.totalTokens += evt.total_tokens || 0
        bucket.totalCost += evt.cost_usd || 0
        bucket.totalDuration += evt.duration_ms || 0
        if (evt.story_id) bucket.stories.add(evt.story_id)
      }

      // Convert to array, replace Set with count
      const result = Array.from(dayMap.values()).map(d => ({
        date: d.date,
        operations: d.operations,
        totalTokens: d.totalTokens,
        totalCost: +d.totalCost.toFixed(4),
        totalDuration: d.totalDuration,
        avgDuration: d.operations > 0 ? Math.round(d.totalDuration / d.operations) : 0,
        storyCount: d.stories.size
      }))

      return { periodDays: days, days: result }
    } catch (err) {
      this.context.log.error('getDailyTrends failed:', err.message)
      return { days: [], periodDays: options.days || 30 }
    }
  },

  /**
   * Get weekly normalized metrics (cost/story, tokens/story, duration/operation).
   *
   * @param {Object} [options]
   * @param {number} [options.weeks=12] - Number of weeks to retrieve.
   * @returns {Promise<Object>} Weekly normalized data.
   */
  async getWeeklyNormalized(options = {}) {
    const ms = this._acquireMetricsService()
    if (!ms) {
      return { weeks: [], periodWeeks: options.weeks || 12 }
    }

    try {
      const weeks = options.weeks || 12
      const now = new Date()
      const periodStart = new Date(now.getTime() - weeks * 7 * 86400000).toISOString()

      const events = ms.queryEvents({
        event_type: 'complete',
        start_date: periodStart,
        limit: 10000
      })

      // Group by ISO week (YYYY-Www)
      const weekMap = new Map()

      // Pre-populate weeks so gaps show as zero
      for (let i = weeks - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 7 * 86400000)
        const weekKey = this._isoWeekKey(d)
        if (!weekMap.has(weekKey)) {
          weekMap.set(weekKey, {
            week: weekKey,
            operations: 0,
            totalTokens: 0,
            totalCost: 0,
            totalDuration: 0,
            stories: new Set()
          })
        }
      }

      for (const evt of events) {
        const evtDate = new Date(evt.created_at)
        if (isNaN(evtDate.getTime())) continue
        const weekKey = this._isoWeekKey(evtDate)
        let bucket = weekMap.get(weekKey)
        if (!bucket) {
          // Event falls in a week we didn't pre-populate (edge case with week boundaries)
          bucket = {
            week: weekKey,
            operations: 0,
            totalTokens: 0,
            totalCost: 0,
            totalDuration: 0,
            stories: new Set()
          }
          weekMap.set(weekKey, bucket)
        }
        bucket.operations++
        bucket.totalTokens += evt.total_tokens || 0
        bucket.totalCost += evt.cost_usd || 0
        bucket.totalDuration += evt.duration_ms || 0
        if (evt.story_id) bucket.stories.add(evt.story_id)
      }

      // Convert to sorted array with normalized metrics
      const result = Array.from(weekMap.values())
        .map(w => {
          const storyCount = w.stories.size || 1 // avoid division by zero
          return {
            week: w.week,
            operations: w.operations,
            totalTokens: w.totalTokens,
            totalCost: +w.totalCost.toFixed(4),
            totalDuration: w.totalDuration,
            storyCount: w.stories.size,
            costPerStory: +(w.totalCost / storyCount).toFixed(4),
            tokensPerStory: Math.round(w.totalTokens / storyCount),
            durationPerOp: w.operations > 0 ? Math.round(w.totalDuration / w.operations) : 0
          }
        })
        .sort((a, b) => a.week.localeCompare(b.week))

      return { periodWeeks: weeks, weeks: result }
    } catch (err) {
      this.context.log.error('getWeeklyNormalized failed:', err.message)
      return { weeks: [], periodWeeks: options.weeks || 12 }
    }
  },

  // ── Internal helpers for metrics handlers ─────────────────────────

  /**
   * Lazy re-acquire MetricsService if not yet available.
   * @returns {Object|null}
   */
  _acquireMetricsService() {
    if (!this.metricsService && _getMetricsService) {
      try {
        this.metricsService = _getMetricsService()
      } catch {
        // still unavailable
      }
    }
    return this.metricsService || null
  },

  /**
   * Aggregate an array of metric events into summary numbers.
   * @param {Array<Object>} events - Completed metric events.
   * @returns {Object}
   */
  _aggregateEvents(events) {
    if (!events || events.length === 0) {
      return this._zeroAggregates()
    }

    let totalTokens = 0
    let totalCost = 0
    let totalDuration = 0

    for (const evt of events) {
      totalTokens += evt.total_tokens || 0
      totalCost += evt.cost_usd || 0
      totalDuration += evt.duration_ms || 0
    }

    return {
      operations: events.length,
      totalTokens,
      totalCost: +totalCost.toFixed(4),
      totalDuration,
      avgDuration: events.length > 0 ? Math.round(totalDuration / events.length) : 0
    }
  },

  /**
   * Zero-valued aggregates structure.
   * @returns {Object}
   */
  _zeroAggregates() {
    return { operations: 0, totalTokens: 0, totalCost: 0, totalDuration: 0, avgDuration: 0 }
  },

  /**
   * Empty metrics summary for fallback.
   * @returns {Object}
   */
  _emptyMetricsSummary() {
    const zero = this._zeroAggregates()
    return {
      periodDays: 30,
      periodStart: null,
      periodEnd: null,
      current: zero,
      previous: zero,
      comparison: { operations: 0, totalTokens: 0, totalCost: 0, avgDuration: 0 },
      perStory: { storyCount: 0, avgTokensPerStory: 0, avgCostPerStory: 0, avgDurationPerStory: 0 }
    }
  },

  /**
   * Compute percentage change between two values, safe against division by zero.
   * @param {number} current
   * @param {number} previous
   * @returns {number} Percentage change (e.g. 50 for +50%, -25 for -25%). 0 when previous is 0.
   */
  _pctChange(current, previous) {
    if (!previous || previous === 0) return 0
    return +(((current - previous) / previous) * 100).toFixed(1)
  },

  /**
   * Compute ISO week key (YYYY-Www) for a date.
   * @param {Date} date
   * @returns {string}
   */
  _isoWeekKey(date) {
    const wn = this.getWeekNumber(date)
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const year = d.getUTCFullYear()
    return `${year}-W${String(wn).padStart(2, '0')}`
  },

  /**
   * Compute per-branch statistics
   * @returns {Promise<Array>} Branch stats with turns, cost, duration
   */
  async computeBranchStats() {
    if (!this.historyService || !this.historyService.isAvailable()) {
      return []
    }

    const branchInfos = await this.historyService.getBranches()
    const branchStats = []

    for (const branchInfo of branchInfos) {
      const prompts = await this.historyService.getPrompts(branchInfo.id)

      let turns = 0
      let cost = 0
      let duration = 0

      for (const prompt of prompts) {
        if (prompt.response) {
          turns += prompt.response.turns || 1
          cost += prompt.response.cost || 0
          duration += prompt.response.duration || 0
        }
      }

      branchStats.push({
        id: branchInfo.id,
        name: branchInfo.name,
        promptCount: branchInfo.promptCount,
        lastActivity: branchInfo.lastActivity,
        turns,
        cost,
        duration
      })
    }

    return branchStats
  },

  /**
   * Export statistics data
   * @param {Object} options - Export options
   * @param {string} options.format - Export format ('json' | 'markdown')
   * @returns {Promise<string>} Exported data
   */
  async exportStats(options = {}) {
    const format = options.format || 'json'
    const stats = await this.getStats()

    if (format === 'json') {
      return JSON.stringify(stats, null, 2)
    }

    // Markdown format handled by renderer
    return stats
  },

  /**
   * Show save dialog for file export
   * @param {Object} options - Dialog options
   * @param {string} options.defaultPath - Default filename
   * @param {Array} options.filters - File type filters
   * @returns {Promise<Object>} Dialog result with filePath
   */
  async showSaveDialog(options = {}) {
    const { dialog } = require('electron')

    try {
      const result = await dialog.showSaveDialog({
        defaultPath: options.defaultPath || 'stats-report.md',
        filters: options.filters || [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['showOverwriteConfirmation']
      })

      if (result.canceled) {
        return { filePath: null }
      }

      return { filePath: result.filePath }
    } catch (error) {
      this.context.log.error('Failed to show save dialog:', error.message)
      throw error
    }
  },

  /**
   * Save markdown export to file
   * @param {Object} data - Export data
   * @param {string} data.content - Markdown content
   * @param {string} data.filePath - Target file path
   * @returns {Promise<Object>} Result
   */
  async saveMarkdownExport(data) {
    const { content, filePath } = data
    const fs = require('fs').promises

    try {
      await fs.writeFile(filePath, content, 'utf-8')
      return { success: true, filePath }
    } catch (error) {
      this.context.log.error('Failed to save markdown export:', error.message)
      throw error
    }
  },

  /**
   * Compute totals from weekly stats
   * @param {Array} weeklyStats - Array of weekly stat objects
   * @returns {Object} Totals object
   */
  computeTotals(weeklyStats) {
    return weeklyStats.reduce(
      (totals, week) => ({
        turns: totals.turns + (week.turns || 0),
        cost: totals.cost + (week.cost || 0),
        duration: totals.duration + (week.duration || 0)
      }),
      { turns: 0, cost: 0, duration: 0 }
    )
  },

  /**
   * Generate mock data for development
   * @param {number} weeks - Number of weeks
   * @returns {Array} Mock weekly stats
   */
  generateMockData(weeks) {
    const data = []
    const now = new Date()

    for (let i = weeks - 1; i >= 0; i--) {
      const weekDate = new Date(now)
      weekDate.setDate(weekDate.getDate() - i * 7)

      const weekNumber = this.getWeekNumber(weekDate)
      const year = weekDate.getFullYear()

      data.push({
        week: `${year}-W${String(weekNumber).padStart(2, '0')}`,
        year,
        weekNumber,
        turns: Math.floor(Math.random() * 50) + 10,
        cost: Math.random() * 3 + 0.5,
        duration: Math.floor(Math.random() * 7200000) + 1800000 // 30min to 2.5hrs in ms
      })
    }

    return data
  },

  /**
   * Get ISO week number for a date
   * @param {Date} date - Date object
   * @returns {number} Week number
   */
  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  }
}

module.exports = StatsPlugin
