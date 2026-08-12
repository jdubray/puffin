/**
 * Migration: Drop Legacy 3.x Tables
 *
 * The 3.x code-generation pipeline (CRE plans/RIS/assertions, sprint
 * orchestration, story generations) was removed in 4.0. Its tables have had
 * no readers since; this migration drops them. The Kanban board's
 * user_stories table (and archived_stories) are untouched.
 *
 * @module database/migrations/012_drop_legacy_tables
 */

/**
 * Apply the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function up(db) {
  // Children before parents to respect foreign keys
  const tables = [
    'completion_summaries',
    'inspection_assertions',
    'ris',
    'plans',
    'ambiguities',
    'sprint_stories',
    'sprint_history',
    'sprints',
    'story_generations',
    'implementation_journeys'
  ]

  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS ${table}`)
  }

  console.log('[MIGRATION 012] Legacy 3.x tables dropped')
}

/**
 * Rollback the migration
 *
 * Intentionally a no-op: the dropped tables carried retired 3.x pipeline
 * data with no readers. Restoring their schemas would resurrect dead
 * structures without their data.
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function down(db) {
  console.log('[MIGRATION 012] No rollback — legacy tables are gone for good')
}

module.exports = { up, down }
