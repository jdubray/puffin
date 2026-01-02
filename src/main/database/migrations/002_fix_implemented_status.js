/**
 * Migration: Fix Implemented Status
 *
 * Changes story status from 'implemented' to 'completed' to match UI convention.
 * This fixes a bug where completed stories disappeared from the UI because
 * the database used 'implemented' but the UI expected 'completed'.
 *
 * @module database/migrations/002_fix_implemented_status
 */

/**
 * Apply the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function up(db) {
  // Count stories with 'implemented' status before fix
  const countBefore = db.prepare(
    "SELECT COUNT(*) as count FROM user_stories WHERE status = 'implemented'"
  ).get()

  // Update user_stories: change 'implemented' to 'completed'
  const result = db.prepare(
    "UPDATE user_stories SET status = 'completed' WHERE status = 'implemented'"
  ).run()

  console.log(`[MIGRATION 002] Fixed ${result.changes} stories from 'implemented' to 'completed' status`)

  // Also fix any archived stories that might have 'implemented' status
  const archivedResult = db.prepare(
    "UPDATE archived_stories SET status = 'completed' WHERE status = 'implemented'"
  ).run()

  if (archivedResult.changes > 0) {
    console.log(`[MIGRATION 002] Fixed ${archivedResult.changes} archived stories from 'implemented' to 'completed' status`)
  }
}

/**
 * Rollback the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function down(db) {
  // Reverse: change 'completed' back to 'implemented'
  const result = db.prepare(
    "UPDATE user_stories SET status = 'implemented' WHERE status = 'completed'"
  ).run()

  console.log(`[MIGRATION 002] Reverted ${result.changes} stories from 'completed' to 'implemented' status`)

  const archivedResult = db.prepare(
    "UPDATE archived_stories SET status = 'implemented' WHERE status = 'completed'"
  ).run()

  if (archivedResult.changes > 0) {
    console.log(`[MIGRATION 002] Reverted ${archivedResult.changes} archived stories from 'completed' to 'implemented' status`)
  }
}

module.exports = { up, down }
