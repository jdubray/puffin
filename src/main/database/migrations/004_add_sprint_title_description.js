/**
 * Migration 004: Add title and description columns to sprints and sprint_history
 *
 * Adds title and description fields to both active sprints and archived sprint history
 * to properly store sprint metadata.
 */

const version = 4

function up(db) {
  // Add title and description to sprints table
  db.exec(`
    ALTER TABLE sprints ADD COLUMN title TEXT
  `)
  db.exec(`
    ALTER TABLE sprints ADD COLUMN description TEXT DEFAULT ''
  `)

  // Add title and description to sprint_history table
  db.exec(`
    ALTER TABLE sprint_history ADD COLUMN title TEXT
  `)
  db.exec(`
    ALTER TABLE sprint_history ADD COLUMN description TEXT DEFAULT ''
  `)

  console.log('[MIGRATION-004] Added title and description columns to sprints and sprint_history')
}

function down(db) {
  // SQLite doesn't support DROP COLUMN easily
  // Columns will remain but won't cause issues
  console.log('[MIGRATION-004] Down migration - title and description columns will remain')
}

module.exports = { version, up, down }
