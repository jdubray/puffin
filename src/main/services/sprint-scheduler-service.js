/**
 * Sprint Scheduler Service
 *
 * Manages recurring sprint schedules that automatically create new sprints
 * (e.g., nightly code review sprints) at a configured time each day.
 *
 * Uses a setInterval tick approach — checks every 60 seconds whether any
 * enabled schedule is due to run, guarding against double-firing via
 * last_run_at (only runs once per calendar day per schedule).
 *
 * @module services/sprint-scheduler-service
 */

const { ActiveSprintExistsError } = require('./sprint-service')

const TICK_INTERVAL_MS = 60 * 1000 // 1 minute

/**
 * Service that manages and executes recurring sprint schedules
 */
class SprintSchedulerService {
  /**
   * @param {Object} options
   * @param {Object} options.db - better-sqlite3 database instance
   * @param {Object} options.sprintService - SprintService instance
   * @param {Object} options.userStoryRepo - User story repository instance
   * @param {Function} [options.onScheduledSprintCreated] - Callback when a scheduled sprint is created; receives (sprint, schedule)
   */
  constructor({ db, sprintService, userStoryRepo, onScheduledSprintCreated }) {
    this.db = db
    this.sprintService = sprintService
    this.userStoryRepo = userStoryRepo
    this.onScheduledSprintCreated = onScheduledSprintCreated || (() => {})
    this._timer = null
    this._initialized = false
    this._ensureTable()
  }

  /**
   * Ensure the sprint_schedules table exists (migration may not have run yet
   * if the service is instantiated before migrations complete — defensive).
   * @private
   */
  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sprint_schedules (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'Nightly Code Review',
        description TEXT NOT NULL DEFAULT '',
        scheduled_hour INTEGER NOT NULL DEFAULT 22,
        scheduled_minute INTEGER NOT NULL DEFAULT 0,
        timezone TEXT NOT NULL DEFAULT 'local',
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run_at TEXT,
        created_at TEXT NOT NULL
      )
    `)
  }

  /**
   * Generate a unique ID
   * @private
   */
  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
  }

  /**
   * Get current ISO timestamp string
   * @private
   */
  _now() {
    return new Date().toISOString()
  }

  /**
   * Start the scheduler timer. Safe to call multiple times — won't start a second timer.
   */
  start() {
    if (this._timer) return
    console.log('[SprintScheduler] Starting scheduler (60s tick)')
    this._timer = setInterval(() => this._tick(), TICK_INTERVAL_MS)
    this._initialized = true
  }

  /**
   * Stop the scheduler timer.
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
      console.log('[SprintScheduler] Stopped')
    }
  }

  /**
   * List all sprint schedules.
   * @returns {Object[]} Array of schedule objects
   */
  list() {
    const rows = this.db.prepare('SELECT * FROM sprint_schedules ORDER BY created_at DESC').all()
    return rows.map(r => this._deserialize(r))
  }

  /**
   * Create a new sprint schedule.
   * @param {Object} data
   * @param {string} [data.title='Nightly Code Review']
   * @param {string} [data.description='']
   * @param {number} [data.scheduledHour=22] - 0-23
   * @param {number} [data.scheduledMinute=0] - 0-59
   * @param {string} [data.timezone='local']
   * @param {boolean} [data.enabled=true]
   * @returns {Object} Created schedule
   */
  create(data = {}) {
    const schedule = {
      id: this._generateId(),
      title: data.title || 'Nightly Code Review',
      description: data.description || '',
      scheduled_hour: data.scheduledHour != null ? data.scheduledHour : 22,
      scheduled_minute: data.scheduledMinute != null ? data.scheduledMinute : 0,
      timezone: data.timezone || 'local',
      enabled: data.enabled !== false ? 1 : 0,
      last_run_at: null,
      created_at: this._now()
    }
    this.db.prepare(`
      INSERT INTO sprint_schedules (id, title, description, scheduled_hour, scheduled_minute, timezone, enabled, last_run_at, created_at)
      VALUES (@id, @title, @description, @scheduled_hour, @scheduled_minute, @timezone, @enabled, @last_run_at, @created_at)
    `).run(schedule)
    return this._deserialize(schedule)
  }

  /**
   * Update an existing schedule.
   * @param {string} id
   * @param {Object} updates
   * @returns {Object|null} Updated schedule or null if not found
   */
  update(id, updates) {
    const existing = this.db.prepare('SELECT * FROM sprint_schedules WHERE id = ?').get(id)
    if (!existing) return null

    const merged = {
      ...existing,
      title: updates.title != null ? updates.title : existing.title,
      description: updates.description != null ? updates.description : existing.description,
      scheduled_hour: updates.scheduledHour != null ? updates.scheduledHour : existing.scheduled_hour,
      scheduled_minute: updates.scheduledMinute != null ? updates.scheduledMinute : existing.scheduled_minute,
      timezone: updates.timezone != null ? updates.timezone : existing.timezone,
      enabled: updates.enabled != null ? (updates.enabled ? 1 : 0) : existing.enabled
    }

    this.db.prepare(`
      UPDATE sprint_schedules SET
        title = @title,
        description = @description,
        scheduled_hour = @scheduled_hour,
        scheduled_minute = @scheduled_minute,
        timezone = @timezone,
        enabled = @enabled
      WHERE id = @id
    `).run(merged)

    return this._deserialize(merged)
  }

  /**
   * Delete a schedule by ID.
   * @param {string} id
   * @returns {boolean} True if deleted
   */
  delete(id) {
    const result = this.db.prepare('DELETE FROM sprint_schedules WHERE id = ?').run(id)
    return result.changes > 0
  }

  /**
   * Immediately execute a schedule (ignores time check and last_run_at).
   * @param {string} id
   * @returns {Object} Result with sprint or error
   */
  async runNow(id) {
    const row = this.db.prepare('SELECT * FROM sprint_schedules WHERE id = ?').get(id)
    if (!row) return { success: false, error: 'Schedule not found' }
    return this._executeSchedule(this._deserialize(row))
  }

  /**
   * Timer tick — called every 60 seconds.
   * Checks all enabled schedules to see if any should fire now.
   * @private
   */
  async _tick() {
    const now = new Date()
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()
    const todayDate = now.toISOString().substring(0, 10) // 'YYYY-MM-DD'

    const rows = this.db.prepare('SELECT * FROM sprint_schedules WHERE enabled = 1').all()

    for (const row of rows) {
      const schedule = this._deserialize(row)

      // Check if it's the right time
      if (schedule.scheduledHour !== currentHour || schedule.scheduledMinute !== currentMinute) {
        continue
      }

      // Check if already ran today
      if (schedule.lastRunAt) {
        const lastRunDate = schedule.lastRunAt.substring(0, 10)
        if (lastRunDate === todayDate) {
          console.log(`[SprintScheduler] Schedule "${schedule.title}" already ran today, skipping`)
          continue
        }
      }

      console.log(`[SprintScheduler] Firing schedule "${schedule.title}" (${currentHour}:${String(currentMinute).padStart(2, '0')})`)
      await this._executeSchedule(schedule)
    }
  }

  /**
   * Execute a single schedule: find pending stories, create a sprint, update last_run_at.
   * @private
   * @param {Object} schedule - Deserialized schedule object
   * @returns {Object} Result
   */
  async _executeSchedule(schedule) {
    try {
      // Get all pending user stories
      const allStories = this.userStoryRepo.findAll()
      const pendingStories = allStories.filter(s => s.status === 'pending')

      if (pendingStories.length === 0) {
        console.log(`[SprintScheduler] No pending stories for schedule "${schedule.title}", skipping sprint creation`)
        // Update last_run_at so we don't keep retrying today
        this._updateLastRunAt(schedule.id)
        return { success: true, skipped: true, reason: 'No pending stories' }
      }

      const storyIds = pendingStories.map(s => s.id)
      const sprintData = {
        title: schedule.title,
        description: schedule.description || `Auto-created by scheduled nightly review`
      }

      const sprint = this.sprintService.createSprint(sprintData, storyIds)

      // Update last_run_at
      this._updateLastRunAt(schedule.id)

      console.log(`[SprintScheduler] Created sprint "${sprint.title}" (${sprint.id}) with ${storyIds.length} stories`)

      // Notify via callback (used to push to renderer)
      this.onScheduledSprintCreated(sprint, schedule)

      return { success: true, sprint, storyCount: storyIds.length }
    } catch (err) {
      if (err instanceof ActiveSprintExistsError) {
        console.log(`[SprintScheduler] Active sprint exists — skipping schedule "${schedule.title}"`)
        // Still update last_run_at to avoid hammering every minute
        this._updateLastRunAt(schedule.id)
        return { success: false, error: 'Active sprint already exists', skipped: true }
      }
      console.error(`[SprintScheduler] Error executing schedule "${schedule.title}":`, err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Update the last_run_at timestamp for a schedule.
   * @private
   */
  _updateLastRunAt(id) {
    this.db.prepare('UPDATE sprint_schedules SET last_run_at = ? WHERE id = ?').run(this._now(), id)
  }

  /**
   * Convert a DB row to a camelCase schedule object.
   * @private
   */
  _deserialize(row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      scheduledHour: row.scheduled_hour,
      scheduledMinute: row.scheduled_minute,
      timezone: row.timezone,
      enabled: row.enabled === 1 || row.enabled === true,
      lastRunAt: row.last_run_at || null,
      createdAt: row.created_at
    }
  }
}

module.exports = { SprintSchedulerService }
