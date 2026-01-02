/**
 * Migration 003: Add stories column to sprint_history
 *
 * Stores the full story data inline with archived sprints,
 * ensuring stories are preserved even if deleted from user_stories.
 */

const version = 3

function up(db) {
  // Add stories column to sprint_history (JSON array of story objects)
  db.exec(`
    ALTER TABLE sprint_history ADD COLUMN stories TEXT DEFAULT '[]'
  `)

  console.log('[MIGRATION-003] Added stories column to sprint_history')
}

function down(db) {
  // SQLite doesn't support DROP COLUMN easily, so we'd need to recreate the table
  // For now, just leave the column (it won't cause issues)
  console.log('[MIGRATION-003] Down migration - stories column will remain')
}

module.exports = { version, up, down }
