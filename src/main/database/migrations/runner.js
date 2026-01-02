/**
 * Database Migration Runner
 *
 * Manages schema versioning and migration execution for SQLite database.
 * Migrations are applied in order and tracked in a _migrations table.
 * Migration history is logged in _migration_log for debugging.
 *
 * Features:
 * - Versioned migrations applied in order (NNN_name.js format)
 * - Schema version tracking in _migrations table
 * - Automatic execution on application startup
 * - Transaction-based execution with automatic rollback on failure
 * - Migration history logging for debugging
 * - Checksum verification for migration integrity
 *
 * @module database/migrations/runner
 */

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

/**
 * Migration runner for SQLite schema management
 */
class MigrationRunner {
  /**
   * Create a migration runner
   *
   * @param {import('../connection').DatabaseConnection} connection - Database connection manager
   */
  constructor(connection) {
    this.connection = connection
    this.migrationsDir = path.join(__dirname)
  }

  /**
   * Initialize the migrations table if it doesn't exist
   *
   * @private
   */
  _ensureMigrationsTable() {
    const db = this.connection.getConnection()
    if (!db) {
      throw new Error('Database not connected')
    }

    // Main migrations tracking table
    db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now')),
        checksum TEXT,
        execution_time_ms INTEGER
      )
    `)

    // Migration history log for debugging
    db.exec(`
      CREATE TABLE IF NOT EXISTS _migration_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        error_details TEXT,
        executed_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)

    // Index for faster log queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_migration_log_version
      ON _migration_log(version)
    `)

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_migration_log_executed
      ON _migration_log(executed_at DESC)
    `)
  }

  /**
   * Log a migration action to the history table
   *
   * @private
   * @param {string} version - Migration version
   * @param {string} action - Action performed (apply, rollback, check)
   * @param {string} status - Status (started, success, failed)
   * @param {string} [message] - Optional message
   * @param {string} [errorDetails] - Optional error details
   */
  _logMigrationAction(version, action, status, message = null, errorDetails = null) {
    try {
      const db = this.connection.getConnection()
      if (!db) return

      db.prepare(`
        INSERT INTO _migration_log (version, action, status, message, error_details, executed_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(version, action, status, message, errorDetails)
    } catch (error) {
      // Don't fail on logging errors
      console.error(`[MIGRATIONS] Failed to log action: ${error.message}`)
    }
  }

  /**
   * Calculate checksum for a migration file
   *
   * @private
   * @param {string} filePath - Path to migration file
   * @returns {string} MD5 checksum
   */
  _calculateChecksum(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return crypto.createHash('md5').update(content).digest('hex')
    } catch (error) {
      console.error(`[MIGRATIONS] Failed to calculate checksum: ${error.message}`)
      return null
    }
  }

  /**
   * Get list of applied migrations
   *
   * @returns {Array<{version: string, name: string, applied_at: string}>}
   */
  getAppliedMigrations() {
    const db = this.connection.getConnection()
    if (!db) {
      return []
    }

    try {
      this._ensureMigrationsTable()
      return db.prepare('SELECT version, name, applied_at FROM _migrations ORDER BY version ASC').all()
    } catch (error) {
      console.error(`[MIGRATIONS] Error getting applied migrations: ${error.message}`)
      return []
    }
  }

  /**
   * Get list of pending migrations
   *
   * @returns {Array<{version: string, name: string, file: string}>}
   */
  getPendingMigrations() {
    const applied = new Set(this.getAppliedMigrations().map(m => m.version))
    const available = this._discoverMigrations()

    return available.filter(m => !applied.has(m.version))
  }

  /**
   * Discover migration files in the migrations directory
   *
   * @private
   * @returns {Array<{version: string, name: string, file: string}>}
   */
  _discoverMigrations() {
    const migrations = []

    try {
      const files = fs.readdirSync(this.migrationsDir)

      for (const file of files) {
        // Match pattern: NNN_name.js (e.g., 001_initial_schema.js)
        const match = file.match(/^(\d{3})_(.+)\.js$/)
        if (match) {
          migrations.push({
            version: match[1],
            name: match[2].replace(/_/g, ' '),
            file: path.join(this.migrationsDir, file)
          })
        }
      }

      // Sort by version
      migrations.sort((a, b) => a.version.localeCompare(b.version))
    } catch (error) {
      console.error(`[MIGRATIONS] Error discovering migrations: ${error.message}`)
    }

    return migrations
  }

  /**
   * Run all pending migrations
   *
   * @returns {{success: boolean, applied: string[], errors: string[], details: Object[]}}
   */
  runPending() {
    const pending = this.getPendingMigrations()
    const applied = []
    const errors = []
    const details = []

    if (pending.length === 0) {
      console.log('[MIGRATIONS] No pending migrations')
      return { success: true, applied, errors, details }
    }

    console.log(`[MIGRATIONS] Running ${pending.length} pending migration(s)...`)

    for (const migration of pending) {
      const startTime = Date.now()

      try {
        // Log start
        this._logMigrationAction(
          migration.version,
          'apply',
          'started',
          `Starting migration: ${migration.name}`
        )

        const result = this._runMigration(migration)
        const executionTime = Date.now() - startTime

        applied.push(migration.version)
        details.push({
          version: migration.version,
          name: migration.name,
          status: 'applied',
          executionTimeMs: executionTime,
          checksum: result.checksum
        })

        // Log success
        this._logMigrationAction(
          migration.version,
          'apply',
          'success',
          `Applied in ${executionTime}ms`
        )

        console.log(`[MIGRATIONS] Applied: ${migration.version} - ${migration.name} (${executionTime}ms)`)
      } catch (error) {
        const executionTime = Date.now() - startTime
        const errorMsg = `Migration ${migration.version} failed: ${error.message}`
        const errorStack = error.stack || error.message

        // Log failure
        this._logMigrationAction(
          migration.version,
          'apply',
          'failed',
          errorMsg,
          errorStack
        )

        console.error(`[MIGRATIONS] ${errorMsg}`)
        errors.push(errorMsg)
        details.push({
          version: migration.version,
          name: migration.name,
          status: 'failed',
          executionTimeMs: executionTime,
          error: error.message
        })

        // Stop on first error - transaction ensures no partial state
        break
      }
    }

    return {
      success: errors.length === 0,
      applied,
      errors,
      details
    }
  }

  /**
   * Run a single migration within a transaction
   *
   * @private
   * @param {{version: string, name: string, file: string}} migration
   * @returns {{checksum: string, executionTimeMs: number}}
   */
  _runMigration(migration) {
    const db = this.connection.getConnection()
    if (!db) {
      throw new Error('Database not connected')
    }

    // Calculate checksum before running
    const checksum = this._calculateChecksum(migration.file)

    // Load migration module
    const migrationModule = require(migration.file)

    if (typeof migrationModule.up !== 'function') {
      throw new Error(`Migration ${migration.version} does not export an 'up' function`)
    }

    const startTime = Date.now()

    // Execute migration in a transaction (automatic rollback on error)
    const runMigration = db.transaction(() => {
      // Run the up migration
      migrationModule.up(db)

      const executionTime = Date.now() - startTime

      // Record the migration with checksum and timing
      const stmt = db.prepare(`
        INSERT INTO _migrations (version, name, applied_at, checksum, execution_time_ms)
        VALUES (?, ?, datetime('now'), ?, ?)
      `)
      stmt.run(migration.version, migration.name, checksum, executionTime)
    })

    try {
      runMigration()
    } catch (error) {
      // Transaction automatically rolled back
      // Re-throw with additional context
      const enhancedError = new Error(
        `Failed to apply migration ${migration.version} (${migration.name}): ${error.message}`
      )
      enhancedError.originalError = error
      enhancedError.migration = migration
      throw enhancedError
    }

    return {
      checksum,
      executionTimeMs: Date.now() - startTime
    }
  }

  /**
   * Rollback the last applied migration
   *
   * @returns {{success: boolean, rolledBack: string|null, error: string|null, executionTimeMs: number}}
   */
  rollbackLast() {
    const db = this.connection.getConnection()
    if (!db) {
      return { success: false, rolledBack: null, error: 'Database not connected', executionTimeMs: 0 }
    }

    const applied = this.getAppliedMigrations()
    if (applied.length === 0) {
      return { success: true, rolledBack: null, error: null, executionTimeMs: 0 }
    }

    const lastMigration = applied[applied.length - 1]
    const available = this._discoverMigrations()
    const migrationFile = available.find(m => m.version === lastMigration.version)

    if (!migrationFile) {
      const error = `Migration file for ${lastMigration.version} not found`
      this._logMigrationAction(lastMigration.version, 'rollback', 'failed', error)
      return {
        success: false,
        rolledBack: null,
        error,
        executionTimeMs: 0
      }
    }

    const startTime = Date.now()

    // Log rollback start
    this._logMigrationAction(
      lastMigration.version,
      'rollback',
      'started',
      `Starting rollback: ${lastMigration.name}`
    )

    try {
      const migrationModule = require(migrationFile.file)

      if (typeof migrationModule.down !== 'function') {
        const error = `Migration ${lastMigration.version} does not export a 'down' function`
        this._logMigrationAction(lastMigration.version, 'rollback', 'failed', error)
        return {
          success: false,
          rolledBack: null,
          error,
          executionTimeMs: Date.now() - startTime
        }
      }

      // Execute rollback in a transaction (automatic rollback on error)
      const rollback = db.transaction(() => {
        migrationModule.down(db)

        const stmt = db.prepare('DELETE FROM _migrations WHERE version = ?')
        stmt.run(lastMigration.version)
      })

      rollback()

      const executionTime = Date.now() - startTime

      // Log success
      this._logMigrationAction(
        lastMigration.version,
        'rollback',
        'success',
        `Rolled back in ${executionTime}ms`
      )

      console.log(`[MIGRATIONS] Rolled back: ${lastMigration.version} - ${lastMigration.name} (${executionTime}ms)`)

      return {
        success: true,
        rolledBack: lastMigration.version,
        error: null,
        executionTimeMs: executionTime
      }
    } catch (error) {
      const executionTime = Date.now() - startTime
      const errorMsg = `Rollback failed: ${error.message}`

      // Log failure
      this._logMigrationAction(
        lastMigration.version,
        'rollback',
        'failed',
        errorMsg,
        error.stack || error.message
      )

      console.error(`[MIGRATIONS] ${errorMsg}`)

      return {
        success: false,
        rolledBack: null,
        error: errorMsg,
        executionTimeMs: executionTime
      }
    }
  }

  /**
   * Get current schema version
   *
   * @returns {string|null} Current version or null if no migrations applied
   */
  getCurrentVersion() {
    const applied = this.getAppliedMigrations()
    return applied.length > 0 ? applied[applied.length - 1].version : null
  }

  /**
   * Check if database needs migrations
   *
   * @returns {boolean} True if there are pending migrations
   */
  needsMigrations() {
    return this.getPendingMigrations().length > 0
  }

  /**
   * Get migration status summary
   *
   * @returns {Object} Migration status
   */
  getStatus() {
    const applied = this.getAppliedMigrations()
    const pending = this.getPendingMigrations()

    return {
      currentVersion: this.getCurrentVersion(),
      appliedCount: applied.length,
      pendingCount: pending.length,
      applied: applied.map(m => ({ version: m.version, name: m.name })),
      pending: pending.map(m => ({ version: m.version, name: m.name }))
    }
  }

  /**
   * Get migration history log
   *
   * @param {Object} [options] - Query options
   * @param {number} [options.limit=100] - Maximum entries to return
   * @param {string} [options.version] - Filter by version
   * @param {string} [options.status] - Filter by status (started, success, failed)
   * @returns {Array<Object>} Migration log entries
   */
  getHistory(options = {}) {
    const db = this.connection.getConnection()
    if (!db) return []

    const { limit = 100, version, status } = options

    try {
      this._ensureMigrationsTable()

      let sql = 'SELECT * FROM _migration_log WHERE 1=1'
      const params = []

      if (version) {
        sql += ' AND version = ?'
        params.push(version)
      }

      if (status) {
        sql += ' AND status = ?'
        params.push(status)
      }

      sql += ' ORDER BY executed_at DESC LIMIT ?'
      params.push(limit)

      return db.prepare(sql).all(...params)
    } catch (error) {
      console.error(`[MIGRATIONS] Error getting history: ${error.message}`)
      return []
    }
  }

  /**
   * Get failed migrations from history
   *
   * @param {number} [limit=10] - Maximum entries to return
   * @returns {Array<Object>} Failed migration log entries
   */
  getFailedMigrations(limit = 10) {
    return this.getHistory({ limit, status: 'failed' })
  }

  /**
   * Verify migration integrity by comparing checksums
   *
   * @returns {{valid: boolean, mismatches: Array<{version: string, expected: string, actual: string}>}}
   */
  verifyIntegrity() {
    const db = this.connection.getConnection()
    if (!db) {
      return { valid: false, mismatches: [{ version: 'N/A', expected: 'N/A', actual: 'Database not connected' }] }
    }

    const applied = this.getAppliedMigrations()
    const available = this._discoverMigrations()
    const mismatches = []

    for (const migration of applied) {
      const file = available.find(m => m.version === migration.version)
      if (!file) {
        mismatches.push({
          version: migration.version,
          expected: migration.checksum || 'unknown',
          actual: 'file not found'
        })
        continue
      }

      if (migration.checksum) {
        const currentChecksum = this._calculateChecksum(file.file)
        if (currentChecksum !== migration.checksum) {
          mismatches.push({
            version: migration.version,
            expected: migration.checksum,
            actual: currentChecksum
          })
        }
      }
    }

    return {
      valid: mismatches.length === 0,
      mismatches
    }
  }

  /**
   * Clear migration history log (keeps _migrations table intact)
   *
   * @param {Object} [options] - Options
   * @param {number} [options.olderThanDays] - Only clear entries older than N days
   * @returns {number} Number of entries cleared
   */
  clearHistory(options = {}) {
    const db = this.connection.getConnection()
    if (!db) return 0

    try {
      if (options.olderThanDays) {
        const result = db.prepare(`
          DELETE FROM _migration_log
          WHERE executed_at < datetime('now', '-' || ? || ' days')
        `).run(options.olderThanDays)
        return result.changes
      }

      const result = db.prepare('DELETE FROM _migration_log').run()
      return result.changes
    } catch (error) {
      console.error(`[MIGRATIONS] Error clearing history: ${error.message}`)
      return 0
    }
  }
}

module.exports = { MigrationRunner }
