/**
 * JSON to SQLite Data Migrator
 *
 * Migrates existing JSON file data to SQLite database.
 * Preserves all existing data including IDs and timestamps.
 * JSON files are kept as backup after migration.
 *
 * @module database/json-migrator
 */

const fs = require('fs').promises
const path = require('path')

/**
 * JSON file types that can be migrated
 * @readonly
 * @enum {string}
 */
const JSON_FILES = {
  USER_STORIES: 'user-stories.json',
  ARCHIVED_STORIES: 'archived-stories.json'
}

/**
 * Migrates JSON file data to SQLite database
 */
class JsonMigrator {
  /**
   * Create a JSON migrator
   *
   * @param {import('./connection').DatabaseConnection} connection - Database connection
   * @param {string} projectPath - Path to the project directory
   */
  constructor(connection, projectPath) {
    this.connection = connection
    this.projectPath = projectPath
    this.puffinDir = path.join(projectPath, '.puffin')
  }

  /**
   * Check if JSON migration is needed
   * Returns true if there are JSON files that haven't been migrated
   *
   * @returns {boolean}
   */
  needsMigration() {
    const db = this.connection.getConnection()
    if (!db) return false

    try {
      // Check what's already been migrated
      const migrated = db.prepare(
        'SELECT file_type FROM _json_migration'
      ).all().map(r => r.file_type)

      // Check which JSON files exist and need migration
      for (const fileType of Object.values(JSON_FILES)) {
        if (!migrated.includes(fileType)) {
          const filePath = path.join(this.puffinDir, fileType)
          try {
            require('fs').accessSync(filePath)
            return true // Found a file that needs migration
          } catch {
            // File doesn't exist, no migration needed for this type
          }
        }
      }

      return false
    } catch (error) {
      console.error(`[JSON-MIGRATOR] Error checking migration status: ${error.message}`)
      return false
    }
  }

  /**
   * Migrate all JSON files to SQLite
   *
   * @returns {Promise<{success: boolean, migratedFiles: string[], errors: string[]}>}
   */
  async migrateAll() {
    const migratedFiles = []
    const errors = []

    // Migrate user stories
    try {
      if (await this._migrateUserStories()) {
        migratedFiles.push(JSON_FILES.USER_STORIES)
      }
    } catch (error) {
      errors.push(`User stories: ${error.message}`)
    }

    // Migrate archived stories
    try {
      if (await this._migrateArchivedStories()) {
        migratedFiles.push(JSON_FILES.ARCHIVED_STORIES)
      }
    } catch (error) {
      errors.push(`Archived stories: ${error.message}`)
    }

    console.log(`[JSON-MIGRATOR] Migration complete: ${migratedFiles.length} files migrated`)
    if (errors.length > 0) {
      console.warn(`[JSON-MIGRATOR] Errors: ${errors.join(', ')}`)
    }

    return {
      success: errors.length === 0,
      migratedFiles,
      errors
    }
  }

  /**
   * Read a JSON file safely
   *
   * @private
   * @param {string} filename - JSON filename
   * @returns {Promise<any|null>} Parsed JSON or null if file doesn't exist
   */
  async _readJsonFile(filename) {
    const filePath = path.join(this.puffinDir, filename)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null // File doesn't exist
      }
      throw error
    }
  }

  /**
   * Check if a file type has already been migrated
   *
   * @private
   * @param {string} fileType - JSON file type
   * @returns {boolean}
   */
  _isAlreadyMigrated(fileType) {
    const db = this.connection.getConnection()
    const result = db.prepare(
      'SELECT 1 FROM _json_migration WHERE file_type = ?'
    ).get(fileType)
    return !!result
  }

  /**
   * Record that a file type has been migrated
   *
   * @private
   * @param {string} fileType - JSON file type
   * @param {number} recordCount - Number of records migrated
   */
  _recordMigration(fileType, recordCount) {
    const db = this.connection.getConnection()
    db.prepare(`
      INSERT INTO _json_migration (file_type, record_count)
      VALUES (?, ?)
    `).run(fileType, recordCount)
  }

  /**
   * Migrate user stories from JSON to SQLite
   *
   * @private
   * @returns {Promise<boolean>} True if migration was performed
   */
  async _migrateUserStories() {
    const fileType = JSON_FILES.USER_STORIES
    if (this._isAlreadyMigrated(fileType)) {
      return false
    }

    const stories = await this._readJsonFile(fileType)
    if (!stories || !Array.isArray(stories) || stories.length === 0) {
      this._recordMigration(fileType, 0)
      return false
    }

    const db = this.connection.getConnection()
    const insert = db.prepare(`
      INSERT OR REPLACE INTO user_stories (
        id, branch_id, title, description, acceptance_criteria,
        status, implemented_on, source_prompt_id, created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertMany = db.transaction((items) => {
      for (const story of items) {
        insert.run(
          story.id,
          story.branchId || story.branch_id || null,
          story.title,
          story.description || '',
          JSON.stringify(story.acceptanceCriteria || story.acceptance_criteria || []),
          story.status || 'pending',
          JSON.stringify(story.implementedOn || story.implemented_on || []),
          story.sourcePromptId || story.source_prompt_id || null,
          story.createdAt || story.created_at || new Date().toISOString(),
          story.updatedAt || story.updated_at || new Date().toISOString(),
          story.archivedAt || story.archived_at || null
        )
      }
    })

    insertMany(stories)
    this._recordMigration(fileType, stories.length)
    console.log(`[JSON-MIGRATOR] Migrated ${stories.length} user stories`)
    return true
  }

  /**
   * Migrate archived stories from JSON to SQLite
   *
   * @private
   * @returns {Promise<boolean>} True if migration was performed
   */
  async _migrateArchivedStories() {
    const fileType = JSON_FILES.ARCHIVED_STORIES
    if (this._isAlreadyMigrated(fileType)) {
      return false
    }

    const stories = await this._readJsonFile(fileType)
    if (!stories || !Array.isArray(stories) || stories.length === 0) {
      this._recordMigration(fileType, 0)
      return false
    }

    const db = this.connection.getConnection()
    const insert = db.prepare(`
      INSERT OR REPLACE INTO archived_stories (
        id, branch_id, title, description, acceptance_criteria,
        status, implemented_on, source_prompt_id, created_at, updated_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertMany = db.transaction((items) => {
      for (const story of items) {
        insert.run(
          story.id,
          story.branchId || story.branch_id || null,
          story.title,
          story.description || '',
          JSON.stringify(story.acceptanceCriteria || story.acceptance_criteria || []),
          story.status || 'archived',
          JSON.stringify(story.implementedOn || story.implemented_on || []),
          story.sourcePromptId || story.source_prompt_id || null,
          story.createdAt || story.created_at || new Date().toISOString(),
          story.updatedAt || story.updated_at || new Date().toISOString(),
          story.archivedAt || story.archived_at || new Date().toISOString()
        )
      }
    })

    insertMany(stories)
    this._recordMigration(fileType, stories.length)
    console.log(`[JSON-MIGRATOR] Migrated ${stories.length} archived stories`)
    return true
  }

  /**
   * Get migration status
   *
   * @returns {{migrated: string[], pending: string[]}}
   */
  getStatus() {
    const db = this.connection.getConnection()
    if (!db) {
      return { migrated: [], pending: Object.values(JSON_FILES) }
    }

    const migrated = db.prepare(
      'SELECT file_type, record_count, migrated_at FROM _json_migration'
    ).all()

    const migratedTypes = migrated.map(m => m.file_type)
    const pending = Object.values(JSON_FILES).filter(f => !migratedTypes.includes(f))

    return {
      migrated: migrated.map(m => ({
        fileType: m.file_type,
        recordCount: m.record_count,
        migratedAt: m.migrated_at
      })),
      pending
    }
  }
}

module.exports = { JsonMigrator, JSON_FILES }
