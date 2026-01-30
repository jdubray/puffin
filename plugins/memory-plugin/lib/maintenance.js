/**
 * Startup Maintenance
 *
 * Checks if periodic maintenance tasks are due and runs them asynchronously.
 * Does not block app startup.
 *
 * @module maintenance
 */

const maintenanceLog = require('./schemas/maintenance-log.js')

/** 7 days in milliseconds */
const WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

/** 30 days in milliseconds */
const MONTHLY_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000

class Maintenance {
  /**
   * @param {Object} deps
   * @param {import('./file-system-layer.js').FileSystemLayer} deps.fsLayer
   * @param {import('./memory-manager.js').MemoryManager} deps.memoryManager
   * @param {Object} [deps.logger=console]
   */
  constructor({ fsLayer, memoryManager, logger }) {
    this.fsLayer = fsLayer
    this.memoryManager = memoryManager
    this.logger = logger || console
  }

  /**
   * Run on startup — check if any maintenance is due and run async.
   * Returns immediately; maintenance runs in background.
   */
  startupCheck() {
    // Fire and forget — do not block startup
    this._runStartupCheck().catch(err => {
      this.logger.error('[memory-plugin:maintenance] Startup check failed:', err.message)
    })
  }

  /**
   * Run maintenance by type
   * @param {'weekly'|'monthly'|'full'} type
   * @returns {Promise<{ type: string, ran: string[], skipped: string[] }>}
   */
  async run(type) {
    const log = await this._readLog()
    const ran = []
    const skipped = []

    if (type === 'weekly' || type === 'full') {
      if (type === 'full' || maintenanceLog.isDue(log, 'lastWeeklyConsolidation', WEEKLY_INTERVAL_MS)) {
        await this._runWeeklyConsolidation()
        maintenanceLog.touch(log, 'lastWeeklyConsolidation')
        ran.push('weekly')
      } else {
        skipped.push('weekly')
      }
    }

    if (type === 'monthly' || type === 'full') {
      if (type === 'full' || maintenanceLog.isDue(log, 'lastMonthlyReindex', MONTHLY_INTERVAL_MS)) {
        await this._runMonthlyReindex()
        maintenanceLog.touch(log, 'lastMonthlyReindex')
        ran.push('monthly')
      } else {
        skipped.push('monthly')
      }
    }

    // Persist updated log
    await this.fsLayer.writeJson('maintenance-log.json', log)

    return { type, ran, skipped }
  }

  /**
   * Internal startup check
   * @private
   */
  async _runStartupCheck() {
    const log = await this._readLog()
    const tasks = []

    if (maintenanceLog.isDue(log, 'lastWeeklyConsolidation', WEEKLY_INTERVAL_MS)) {
      this.logger.log('[memory-plugin:maintenance] Weekly consolidation is due')
      tasks.push('weekly')
    }

    if (maintenanceLog.isDue(log, 'lastMonthlyReindex', MONTHLY_INTERVAL_MS)) {
      this.logger.log('[memory-plugin:maintenance] Monthly reindex is due')
      tasks.push('monthly')
    }

    if (tasks.length === 0) {
      this.logger.log('[memory-plugin:maintenance] No maintenance due')
      return
    }

    // Run due tasks
    for (const task of tasks) {
      try {
        if (task === 'weekly') {
          await this._runWeeklyConsolidation()
          maintenanceLog.touch(log, 'lastWeeklyConsolidation')
        } else if (task === 'monthly') {
          await this._runMonthlyReindex()
          maintenanceLog.touch(log, 'lastMonthlyReindex')
        }
        this.logger.log(`[memory-plugin:maintenance] Completed ${task} maintenance`)
      } catch (err) {
        this.logger.error(`[memory-plugin:maintenance] ${task} maintenance failed:`, err.message)
      }
    }

    // Persist updated log
    await this.fsLayer.writeJson('maintenance-log.json', log)
  }

  /**
   * Weekly consolidation: re-memorize all branches
   * @private
   */
  async _runWeeklyConsolidation() {
    const branches = await this.fsLayer.listBranches()
    this.logger.log(`[memory-plugin:maintenance] Weekly consolidation for ${branches.length} branches`)

    for (const branchId of branches) {
      try {
        await this.memoryManager.memorize(branchId)
      } catch (err) {
        this.logger.error(`[memory-plugin:maintenance] Failed to consolidate branch "${branchId}":`, err.message)
      }
    }
  }

  /**
   * Monthly reindex: re-memorize all branches (same as weekly for now,
   * can be extended later with deeper analysis or cleanup)
   * @private
   */
  async _runMonthlyReindex() {
    this.logger.log('[memory-plugin:maintenance] Monthly reindex (full re-memorize)')
    await this._runWeeklyConsolidation()
  }

  /**
   * Read the maintenance log, returning defaults if missing
   * @returns {Promise<Object>}
   * @private
   */
  async _readLog() {
    const data = await this.fsLayer.readJson('maintenance-log.json')
    if (data) {
      const result = maintenanceLog.validate(data)
      if (result.valid) return data
      this.logger.warn('[memory-plugin:maintenance] Invalid log, using defaults:', result.errors)
    }
    return maintenanceLog.createDefault()
  }
}

module.exports = { Maintenance, WEEKLY_INTERVAL_MS, MONTHLY_INTERVAL_MS }
