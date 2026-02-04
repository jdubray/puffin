/**
 * Migration 009: Add completion summary support
 *
 * Creates a dedicated completion_summaries table to store structured
 * completion data linked to user stories via foreign key. Also adds a
 * denormalized completion_summary JSON column on user_stories/archived_stories
 * for quick access without joins.
 *
 * @module database/migrations/009_add_completion_summary
 */

const version = 9

/**
 * Apply the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function up(db) {
  // Create the normalized completion_summaries table
  db.exec(`
    CREATE TABLE IF NOT EXISTS completion_summaries (
      id TEXT PRIMARY KEY,
      story_id TEXT NOT NULL,
      session_id TEXT,
      summary TEXT NOT NULL DEFAULT '',
      files_modified TEXT NOT NULL DEFAULT '[]',
      tests_status TEXT NOT NULL DEFAULT 'unknown',
      criteria_matched TEXT NOT NULL DEFAULT '[]',
      turns INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      duration INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (story_id) REFERENCES user_stories(id)
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_summaries_story_id
      ON completion_summaries(story_id)
  `)

  // Add denormalized JSON column on user_stories for quick access
  db.exec(`
    ALTER TABLE user_stories ADD COLUMN completion_summary TEXT DEFAULT NULL
  `)

  db.exec(`
    ALTER TABLE archived_stories ADD COLUMN completion_summary TEXT DEFAULT NULL
  `)

  console.log('[MIGRATION-009] Created completion_summaries table and added completion_summary columns')
}

/**
 * Rollback the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function down(db) {
  db.exec('DROP TABLE IF EXISTS completion_summaries')
  // Note: The completion_summary columns added to user_stories and archived_stories
  // are NOT removed here. SQLite < 3.35 does not support DROP COLUMN, and the
  // columns are nullable with DEFAULT NULL so they are harmless if left in place.
  console.log('[MIGRATION-009] Dropped completion_summaries table (denormalized columns retained)')
}

module.exports = { version, up, down }
