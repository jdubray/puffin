/**
 * Stats Plugin - Entry Point
 * Tracks and visualizes usage statistics across branches
 */

const StatsPlugin = {
  context: null,
  historyService: null,

  async activate(context) {
    this.context = context
    this.historyService = context.getService('history')

    if (!this.historyService) {
      context.log.warn('History service not available at activation time - stats will be limited')
    } else {
      context.log.info('History service acquired, isAvailable:', this.historyService.isAvailable())
    }

    // Register IPC handlers for renderer communication
    context.registerIpcHandler('getWeeklyStats', this.getWeeklyStats.bind(this))
    context.registerIpcHandler('getStats', this.getStats.bind(this))
    context.registerIpcHandler('showSaveDialog', this.showSaveDialog.bind(this))
    context.registerIpcHandler('saveMarkdownExport', this.saveMarkdownExport.bind(this))

    // Register actions (for programmatic access from other plugins)
    context.registerAction('getStats', this.getStats.bind(this))
    context.registerAction('exportStats', this.exportStats.bind(this))

    context.log.info('Stats plugin activated')
  },

  async deactivate() {
    this.historyService = null
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

    return {
      weeklyStats,
      totals,
      branches
    }
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
