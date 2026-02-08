/**
 * Startup Maintenance
 *
 * Checks if periodic maintenance tasks are due and runs them asynchronously.
 * On every startup, discovers unmemoized branches and processes them.
 * Does not block app startup.
 *
 * @module maintenance
 */

const maintenanceLog = require('./schemas/maintenance-log.js')

/** 7 days in milliseconds */
const WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

/** 30 days in milliseconds */
const MONTHLY_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000

/** Maximum branches to process per maintenance run to bound cost/time */
const MAX_BRANCHES_PER_RUN = 20

class Maintenance {
  /**
   * @param {Object} deps
   * @param {import('./file-system-layer.js').FileSystemLayer} deps.fsLayer
   * @param {import('./memory-manager.js').MemoryManager} deps.memoryManager
   * @param {Object} deps.historyService - Must have getBranches() => Promise<string[]>
   * @param {Object} [deps.logger=console]
   */
  constructor({ fsLayer, memoryManager, historyService, logger }) {
    this.fsLayer = fsLayer
    this.memoryManager = memoryManager
    this.historyService = historyService
    this.logger = logger || console
  }

  /**
   * Run on startup — memorize any unmemoized branches, then check if
   * periodic maintenance is due. Returns immediately; work runs in background.
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
    // Step 1: Always memorize branches that don't have memory files yet
    await this._memorizeNewBranches()

    // Step 2: Check periodic maintenance
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
      this.logger.log('[memory-plugin:maintenance] No periodic maintenance due')
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
   * Discover all branches from the history service and memorize any that
   * don't yet have a memory file. This ensures that on restart every branch
   * gets its memory computed.
   * @private
   */
  async _memorizeNewBranches() {
    // History may not be available yet at plugin activation time (PuffinState
    // loads after plugins). Wait up to 30 seconds with exponential backoff.
    let allBranches
    const maxRetries = 6
    let delay = 2000
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        allBranches = await this.historyService.getBranches()
        if (allBranches && allBranches.length > 0) break
      } catch (err) {
        this.logger.error('[memory-plugin:maintenance] Failed to list branches from history:', err.message)
        return
      }
      if (attempt < maxRetries) {
        this.logger.log(`[memory-plugin:maintenance] History not ready, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, delay))
        delay = Math.min(delay * 1.5, 10000)
      }
    }

    if (!allBranches || allBranches.length === 0) {
      this.logger.log('[memory-plugin:maintenance] No branches found in history')
      return
    }

    const existingMemory = new Set(await this.fsLayer.listBranches())
    const { sanitizeBranchId } = require('./file-system-layer.js')

    const unmemoized = allBranches.filter(branchId => {
      const sanitized = sanitizeBranchId(branchId)
      return !existingMemory.has(sanitized)
    })

    if (unmemoized.length === 0) {
      this.logger.log('[memory-plugin:maintenance] All branches already have memory files')
      return
    }

    this.logger.log(
      `[memory-plugin:maintenance] Found ${unmemoized.length} unmemoized branch(es), processing (max ${MAX_BRANCHES_PER_RUN})`
    )

    const toProcess = unmemoized.slice(0, MAX_BRANCHES_PER_RUN)
    let processed = 0

    for (const branchId of toProcess) {
      try {
        await this.memoryManager.memorize(branchId)
        processed++
        this.logger.log(`[memory-plugin:maintenance] Memorized new branch "${branchId}"`)
      } catch (err) {
        this.logger.error(`[memory-plugin:maintenance] Failed to memorize branch "${branchId}":`, err.message)
      }
    }

    if (unmemoized.length > MAX_BRANCHES_PER_RUN) {
      this.logger.warn(
        `[memory-plugin:maintenance] ${unmemoized.length - MAX_BRANCHES_PER_RUN} branches deferred to next startup`
      )
    }

    this.logger.log(`[memory-plugin:maintenance] Startup memorization complete: ${processed}/${toProcess.length} succeeded`)
  }

  /**
   * Weekly consolidation: re-memorize existing branches (capped to prevent runaway cost)
   * @private
   */
  async _runWeeklyConsolidation() {
    const branches = await this.fsLayer.listBranches()
    const toProcess = branches.slice(0, MAX_BRANCHES_PER_RUN)

    this.logger.log(
      `[memory-plugin:maintenance] Weekly consolidation for ${toProcess.length} of ${branches.length} branches`
    )

    if (branches.length > MAX_BRANCHES_PER_RUN) {
      this.logger.warn(
        `[memory-plugin:maintenance] Capped at ${MAX_BRANCHES_PER_RUN} branches; ${branches.length - MAX_BRANCHES_PER_RUN} deferred`
      )
    }

    for (const branchId of toProcess) {
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

module.exports = { Maintenance, WEEKLY_INTERVAL_MS, MONTHLY_INTERVAL_MS, MAX_BRANCHES_PER_RUN }
