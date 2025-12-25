/**
 * Stats Plugin - Entry Point
 * Tracks and visualizes usage statistics across branches
 */

const StatsPlugin = {
  context: null,

  async activate(context) {
    this.context = context

    // Register IPC handlers for renderer communication
    context.registerIpcHandler('getWeeklyStats', this.getWeeklyStats.bind(this))
    context.registerIpcHandler('saveMarkdownExport', this.saveMarkdownExport.bind(this))

    // Register actions
    context.registerAction('getStats', this.getStats.bind(this))
    context.registerAction('exportStats', this.exportStats.bind(this))

    context.log.info('Stats plugin activated')
  },

  async deactivate() {
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
    // This will be populated from actual data sources
    // For now, return structure that the UI expects
    return this.generateMockData(weeks)
  },

  /**
   * Get aggregated statistics
   * @returns {Promise<Object>} Aggregated stats
   */
  async getStats() {
    const weeklyStats = await this.getWeeklyStats()
    return {
      weeklyStats,
      totals: this.computeTotals(weeklyStats)
    }
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
