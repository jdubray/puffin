/**
 * Database Connection Manager
 *
 * Manages SQLite database connections with proper lifecycle handling
 * for multi-project support. Each project has its own isolated database.
 *
 * @module database/connection
 */

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

/**
 * Database connection manager for SQLite
 * Handles connection lifecycle, WAL mode, and multi-project isolation
 */
class DatabaseConnection {
  constructor() {
    /** @type {Database.Database|null} */
    this.db = null
    /** @type {string|null} */
    this.dbPath = null
    /** @type {string|null} */
    this.projectPath = null
  }

  /**
   * Open a database connection for a project
   * Closes any existing connection before opening new one
   *
   * @param {string} projectPath - Path to the project directory
   * @returns {Database.Database} The opened database connection
   * @throws {Error} If database cannot be opened
   */
  open(projectPath) {
    // Close existing connection if switching projects
    if (this.db) {
      this.close()
    }

    this.projectPath = projectPath
    const puffinDir = path.join(projectPath, '.puffin')
    this.dbPath = path.join(puffinDir, 'puffin.db')

    // Ensure .puffin directory exists
    if (!fs.existsSync(puffinDir)) {
      fs.mkdirSync(puffinDir, { recursive: true })
    }

    try {
      // Open database with verbose logging in debug mode
      const options = {
        verbose: process.env.DEBUG ? console.log : null,
        fileMustExist: false
      }

      this.db = new Database(this.dbPath, options)

      // Enable WAL mode for better concurrent access
      this.db.pragma('journal_mode = WAL')

      // Enforce foreign key constraints
      this.db.pragma('foreign_keys = ON')

      // Optimize for performance
      this.db.pragma('synchronous = NORMAL')
      this.db.pragma('cache_size = -64000') // 64MB cache

      console.log(`[DATABASE] Opened database at: ${this.dbPath}`)

      return this.db
    } catch (error) {
      console.error(`[DATABASE] Failed to open database: ${error.message}`)
      this.db = null
      this.dbPath = null
      this.projectPath = null
      throw error
    }
  }

  /**
   * Close the current database connection
   * Safe to call even if no connection is open
   */
  close() {
    if (this.db) {
      try {
        // Checkpoint WAL before closing for data integrity
        this.db.pragma('wal_checkpoint(TRUNCATE)')
        this.db.close()
        console.log(`[DATABASE] Closed database at: ${this.dbPath}`)
      } catch (error) {
        console.error(`[DATABASE] Error closing database: ${error.message}`)
      } finally {
        this.db = null
        this.dbPath = null
        this.projectPath = null
      }
    }
  }

  /**
   * Get the current database connection
   *
   * @returns {Database.Database|null} The current database or null if not connected
   */
  getConnection() {
    return this.db
  }

  /**
   * Check if database is currently connected
   *
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.db !== null
  }

  /**
   * Get the current database file path
   *
   * @returns {string|null} Path to database file or null if not connected
   */
  getPath() {
    return this.dbPath
  }

  /**
   * Execute a function within a transaction
   * Automatically rolls back on error
   *
   * @template T
   * @param {function(Database.Database): T} fn - Function to execute within transaction
   * @returns {T} Result of the function
   * @throws {Error} If transaction fails (after rollback)
   */
  transaction(fn) {
    if (!this.db) {
      throw new Error('Database not connected')
    }

    const transaction = this.db.transaction(fn)
    return transaction(this.db)
  }

  /**
   * Execute a function within an immediate transaction
   * Acquires write lock immediately
   *
   * @template T
   * @param {function(Database.Database): T} fn - Function to execute
   * @returns {T} Result of the function
   */
  immediateTransaction(fn) {
    if (!this.db) {
      throw new Error('Database not connected')
    }

    const transaction = this.db.transaction(fn).immediate
    return transaction(this.db)
  }

  /**
   * Prepare a SQL statement for repeated execution
   *
   * @param {string} sql - SQL statement to prepare
   * @returns {Database.Statement} Prepared statement
   */
  prepare(sql) {
    if (!this.db) {
      throw new Error('Database not connected')
    }
    return this.db.prepare(sql)
  }

  /**
   * Execute a SQL statement directly
   * Use for DDL statements or one-off queries
   *
   * @param {string} sql - SQL statement to execute
   * @returns {Database.RunResult} Execution result
   */
  exec(sql) {
    if (!this.db) {
      throw new Error('Database not connected')
    }
    return this.db.exec(sql)
  }

  /**
   * Check database integrity
   *
   * @returns {{ok: boolean, errors: string[]}} Integrity check result
   */
  checkIntegrity() {
    if (!this.db) {
      return { ok: false, errors: ['Database not connected'] }
    }

    try {
      const result = this.db.pragma('integrity_check')
      const ok = result.length === 1 && result[0].integrity_check === 'ok'
      return {
        ok,
        errors: ok ? [] : result.map(r => r.integrity_check)
      }
    } catch (error) {
      return { ok: false, errors: [error.message] }
    }
  }

  /**
   * Get database statistics
   *
   * @returns {Object} Database statistics
   */
  getStats() {
    if (!this.db) {
      return null
    }

    try {
      const pageCount = this.db.pragma('page_count')[0].page_count
      const pageSize = this.db.pragma('page_size')[0].page_size
      const freelistCount = this.db.pragma('freelist_count')[0].freelist_count

      return {
        path: this.dbPath,
        sizeBytes: pageCount * pageSize,
        pageCount,
        pageSize,
        freelistCount,
        walMode: this.db.pragma('journal_mode')[0].journal_mode === 'wal'
      }
    } catch (error) {
      console.error(`[DATABASE] Error getting stats: ${error.message}`)
      return null
    }
  }

  /**
   * Vacuum the database to reclaim space
   * Should be called periodically or after large deletions
   */
  vacuum() {
    if (!this.db) {
      throw new Error('Database not connected')
    }

    console.log('[DATABASE] Running VACUUM...')
    this.db.exec('VACUUM')
    console.log('[DATABASE] VACUUM complete')
  }
}

// Singleton instance for the application
const connection = new DatabaseConnection()

module.exports = {
  DatabaseConnection,
  connection
}
