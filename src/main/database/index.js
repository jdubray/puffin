/**
 * Database Module Entry Point
 *
 * Provides database initialization, connection management, and access
 * to repositories for Puffin's SQLite persistence layer.
 *
 * @module database
 */

const { connection, DatabaseConnection } = require('./connection')
const { MigrationRunner } = require('./migrations/runner')
const { JsonMigrator } = require('./json-migrator')
const { BaseRepository, UserStoryRepository, StoryStatus, SprintRepository, SprintStatus } = require('./repositories')

/**
 * Database manager - coordinates connection, migrations, and initialization
 */
class Database {
  constructor() {
    this.connection = connection
    this.migrationRunner = null
    this.jsonMigrator = null
    this.initialized = false

    // Repositories (initialized after connection)
    this.userStories = null
    this.sprints = null
  }

  /**
   * Initialize the database for a project
   * - Opens connection
   * - Runs pending migrations
   * - Migrates JSON data if needed
   *
   * @param {string} projectPath - Path to the project directory
   * @returns {Promise<{success: boolean, migrated: boolean, errors: string[]}>}
   */
  async initialize(projectPath) {
    const errors = []

    try {
      // Open database connection
      this.connection.open(projectPath)

      // Initialize migration runner
      this.migrationRunner = new MigrationRunner(this.connection)

      // Run pending schema migrations
      const migrationResult = this.migrationRunner.runPending()
      if (!migrationResult.success) {
        errors.push(...migrationResult.errors)
        return { success: false, migrated: false, errors }
      }

      // Initialize JSON migrator
      this.jsonMigrator = new JsonMigrator(this.connection, projectPath)

      // Migrate JSON data if this is a new database or upgrade
      let migrated = false
      if (this.jsonMigrator.needsMigration()) {
        console.log('[DATABASE] Migrating JSON data to SQLite...')
        const jsonResult = await this.jsonMigrator.migrateAll()
        if (!jsonResult.success) {
          errors.push(...jsonResult.errors)
          // Don't fail - JSON migration errors are non-fatal
          console.warn('[DATABASE] JSON migration had errors, but continuing')
        }
        migrated = jsonResult.migratedFiles.length > 0
      }

      // Initialize repositories
      this.userStories = new UserStoryRepository(this.connection)
      this.sprints = new SprintRepository(this.connection)

      this.initialized = true
      console.log('[DATABASE] Initialization complete')

      return { success: true, migrated, errors }
    } catch (error) {
      console.error(`[DATABASE] Initialization failed: ${error.message}`)
      errors.push(error.message)
      return { success: false, migrated: false, errors }
    }
  }

  /**
   * Close the database connection
   */
  close() {
    this.connection.close()
    this.initialized = false
    this.migrationRunner = null
    this.jsonMigrator = null
    this.userStories = null
    this.sprints = null
  }

  /**
   * Check if database is initialized and connected
   *
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized && this.connection.isConnected()
  }

  /**
   * Get the raw database connection for direct queries
   * Use with caution - prefer repositories for data access
   *
   * @returns {import('better-sqlite3').Database|null}
   */
  getConnection() {
    return this.connection.getConnection()
  }

  /**
   * Execute a function within a transaction
   *
   * @template T
   * @param {function(import('better-sqlite3').Database): T} fn
   * @returns {T}
   */
  transaction(fn) {
    return this.connection.transaction(fn)
  }

  /**
   * Get database status and statistics
   *
   * @returns {Object}
   */
  getStatus() {
    const stats = this.connection.getStats()
    const migrationStatus = this.migrationRunner?.getStatus() || null

    return {
      initialized: this.initialized,
      connected: this.connection.isConnected(),
      path: this.connection.getPath(),
      stats,
      migrations: migrationStatus
    }
  }

  /**
   * Get migration status summary
   *
   * @returns {Object} Migration status with applied and pending migrations
   */
  getMigrationStatus() {
    if (!this.migrationRunner) {
      return {
        currentVersion: null,
        appliedMigrations: [],
        pendingMigrations: [],
        needsMigrations: false
      }
    }

    const status = this.migrationRunner.getStatus()
    return {
      currentVersion: status.currentVersion,
      appliedMigrations: status.applied,
      pendingMigrations: status.pending,
      needsMigrations: status.pendingCount > 0
    }
  }

  /**
   * Run pending migrations
   *
   * @returns {Object} Result with applied migrations and any errors
   */
  runPendingMigrations() {
    if (!this.migrationRunner) {
      return {
        success: false,
        applied: [],
        errors: ['Migration runner not initialized']
      }
    }

    return this.migrationRunner.runPending()
  }

  /**
   * Check database integrity
   *
   * @returns {{ok: boolean, errors: string[]}}
   */
  checkIntegrity() {
    return this.connection.checkIntegrity()
  }

  /**
   * Vacuum the database to reclaim space
   */
  vacuum() {
    this.connection.vacuum()
  }
}

// Singleton instance
const database = new Database()

module.exports = {
  Database,
  database,
  connection,
  DatabaseConnection,
  MigrationRunner,
  BaseRepository,
  UserStoryRepository,
  StoryStatus,
  SprintRepository,
  SprintStatus
}
