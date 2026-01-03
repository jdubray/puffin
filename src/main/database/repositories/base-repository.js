/**
 * Base Repository
 *
 * Provides shared CRUD logic and utilities for all repositories.
 * Repositories encapsulate database operations and provide a clean API
 * for data access with proper transaction support.
 *
 * @module database/repositories/base-repository
 */

// SQL Tracing configuration - set to true to enable detailed query logging
let SQL_TRACE_ENABLED = true

/**
 * Enable or disable SQL tracing globally
 * @param {boolean} enabled - Whether to enable tracing
 */
function setSqlTraceEnabled(enabled) {
  SQL_TRACE_ENABLED = enabled
  console.log(`[SQL-TRACE] Tracing ${enabled ? 'ENABLED' : 'DISABLED'}`)
}

/**
 * Check if SQL tracing is enabled
 * @returns {boolean}
 */
function isSqlTraceEnabled() {
  return SQL_TRACE_ENABLED
}

/**
 * Log a SQL query with parameters and results
 * @param {string} operation - Operation name (e.g., 'SELECT', 'INSERT', 'UPDATE', 'DELETE')
 * @param {string} table - Table name
 * @param {string} sql - SQL query
 * @param {Array|Object} params - Query parameters
 * @param {*} result - Query result
 * @param {number} duration - Query duration in ms
 */
function traceSql(operation, table, sql, params, result, duration) {
  if (!SQL_TRACE_ENABLED) return

  const timestamp = new Date().toISOString()
  const resultSummary = summarizeResult(result)

  console.log(`[SQL-TRACE] ========================================`)
  console.log(`[SQL-TRACE] ${timestamp} | ${operation} on ${table}`)
  console.log(`[SQL-TRACE] Query: ${sql.replace(/\s+/g, ' ').trim()}`)
  console.log(`[SQL-TRACE] Params: ${JSON.stringify(params)}`)
  console.log(`[SQL-TRACE] Result: ${resultSummary}`)
  console.log(`[SQL-TRACE] Duration: ${duration}ms`)
  console.log(`[SQL-TRACE] ========================================`)
}

/**
 * Summarize a result for logging
 * @param {*} result - Query result
 * @returns {string} Summary string
 */
function summarizeResult(result) {
  if (result === null || result === undefined) {
    return 'null'
  }
  if (Array.isArray(result)) {
    if (result.length === 0) {
      return '[] (0 rows)'
    }
    if (result.length <= 3) {
      return JSON.stringify(result, null, 0)
    }
    return `[${result.length} rows] First: ${JSON.stringify(result[0])}`
  }
  if (typeof result === 'object') {
    // Check if it's a run result (has changes property)
    if ('changes' in result) {
      return `{ changes: ${result.changes}, lastInsertRowid: ${result.lastInsertRowid} }`
    }
    return JSON.stringify(result, null, 0)
  }
  return String(result)
}

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
   * Execute a query with tracing
   * @param {string} operation - Operation type
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {function} executor - Function that executes the query
   * @returns {*} Query result
   */
  traceQuery(operation, sql, params, executor) {
    const start = Date.now()
    try {
      const result = executor()
      const duration = Date.now() - start
      traceSql(operation, this.tableName, sql, params, result, duration)
      return result
    } catch (error) {
      const duration = Date.now() - start
      traceSql(operation, this.tableName, sql, params, `ERROR: ${error.message}`, duration)
      throw error
    }
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

module.exports = { BaseRepository, setSqlTraceEnabled, isSqlTraceEnabled, traceSql }
