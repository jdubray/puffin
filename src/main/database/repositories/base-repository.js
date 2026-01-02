/**
 * Base Repository
 *
 * Provides shared CRUD logic and utilities for all repositories.
 * Repositories encapsulate database operations and provide a clean API
 * for data access with proper transaction support.
 *
 * @module database/repositories/base-repository
 */

/**
 * Base repository with shared functionality
 */
class BaseRepository {
  /**
   * Create a base repository
   *
   * @param {import('../connection').DatabaseConnection} connection - Database connection
   * @param {string} tableName - Name of the primary table
   */
  constructor(connection, tableName) {
    this.connection = connection
    this.tableName = tableName
  }

  /**
   * Get the database connection
   *
   * @returns {import('better-sqlite3').Database}
   * @throws {Error} If database is not connected
   */
  getDb() {
    const db = this.connection.getConnection()
    if (!db) {
      throw new Error('Database not connected')
    }
    return db
  }

  /**
   * Check if a record exists by ID
   *
   * @param {string} id - Record ID
   * @returns {boolean}
   */
  exists(id) {
    const db = this.getDb()
    const result = db.prepare(`SELECT 1 FROM ${this.tableName} WHERE id = ?`).get(id)
    return !!result
  }

  /**
   * Count all records in the table
   *
   * @param {string} [whereClause] - Optional WHERE clause (without 'WHERE' keyword)
   * @param {Array} [params] - Parameters for the WHERE clause
   * @returns {number}
   */
  count(whereClause, params = []) {
    const db = this.getDb()
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`
    if (whereClause) {
      sql += ` WHERE ${whereClause}`
    }
    const result = db.prepare(sql).get(...params)
    return result.count
  }

  /**
   * Delete a record by ID
   *
   * @param {string} id - Record ID
   * @returns {boolean} True if a record was deleted
   */
  deleteById(id) {
    const db = this.getDb()
    const result = db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id)
    return result.changes > 0
  }

  /**
   * Delete multiple records by IDs
   *
   * @param {string[]} ids - Array of record IDs
   * @returns {number} Number of records deleted
   */
  deleteByIds(ids) {
    if (!ids || ids.length === 0) return 0

    const db = this.getDb()
    const placeholders = ids.map(() => '?').join(',')
    const result = db.prepare(
      `DELETE FROM ${this.tableName} WHERE id IN (${placeholders})`
    ).run(...ids)
    return result.changes
  }

  /**
   * Execute a function within a transaction
   *
   * @template T
   * @param {function(): T} fn - Function to execute
   * @returns {T}
   */
  transaction(fn) {
    const db = this.getDb()
    const transaction = db.transaction(fn)
    return transaction()
  }

  /**
   * Execute a function within an immediate transaction
   * Acquires write lock immediately, preventing SQLITE_BUSY errors
   *
   * @template T
   * @param {function(): T} fn - Function to execute
   * @returns {T}
   */
  immediateTransaction(fn) {
    const db = this.getDb()
    const transaction = db.transaction(fn).immediate
    return transaction()
  }

  /**
   * Convert camelCase to snake_case
   *
   * @param {string} str - camelCase string
   * @returns {string} snake_case string
   */
  toSnakeCase(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
  }

  /**
   * Convert snake_case to camelCase
   *
   * @param {string} str - snake_case string
   * @returns {string} camelCase string
   */
  toCamelCase(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
  }

  /**
   * Transform a database row to a JavaScript object with camelCase keys
   *
   * @param {Object} row - Database row with snake_case keys
   * @returns {Object} Object with camelCase keys
   */
  rowToObject(row) {
    if (!row) return null

    const obj = {}
    for (const [key, value] of Object.entries(row)) {
      const camelKey = this.toCamelCase(key)
      obj[camelKey] = value
    }
    return obj
  }

  /**
   * Transform a JavaScript object to database row format with snake_case keys
   *
   * @param {Object} obj - Object with camelCase keys
   * @returns {Object} Object with snake_case keys
   */
  objectToRow(obj) {
    if (!obj) return null

    const row = {}
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = this.toSnakeCase(key)
      row[snakeKey] = value
    }
    return row
  }

  /**
   * Parse a JSON column value safely
   *
   * @param {string|null} value - JSON string or null
   * @param {*} defaultValue - Default value if parsing fails
   * @returns {*} Parsed value or default
   */
  parseJson(value, defaultValue = null) {
    if (value === null || value === undefined) {
      return defaultValue
    }
    try {
      return JSON.parse(value)
    } catch {
      return defaultValue
    }
  }

  /**
   * Stringify a value for JSON column storage
   *
   * @param {*} value - Value to stringify
   * @returns {string} JSON string
   */
  toJson(value) {
    return JSON.stringify(value)
  }

  /**
   * Get current ISO timestamp
   *
   * @returns {string} ISO date string
   */
  now() {
    return new Date().toISOString()
  }
}

module.exports = { BaseRepository }
