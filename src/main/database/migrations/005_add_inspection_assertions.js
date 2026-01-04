/**
 * Migration 005: Add inspection assertions columns to user_stories and archived_stories
 *
 * Adds two JSON columns to support the inspection assertions feature:
 * - inspection_assertions: Array of assertion definitions linked to acceptance criteria
 * - assertion_results: Object containing evaluation results (null when unevaluated)
 *
 * Schema follows the Inspection Assertions Metamodel defined in docs/INSPECTION_ASSERTIONS_METAMODEL.md
 *
 * @module database/migrations/005_add_inspection_assertions
 */

const version = 5

/**
 * Apply the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function up(db) {
  // Add inspection_assertions column to user_stories
  // Stores array of assertion definitions:
  // [{
  //   id: "IA1",
  //   criterion: "AC1",
  //   type: "FILE_EXISTS",
  //   target: "src/components/Feature.js",
  //   assertion: { type: "file" },
  //   message: "Feature component file exists"
  // }]
  db.exec(`
    ALTER TABLE user_stories ADD COLUMN inspection_assertions TEXT DEFAULT '[]'
  `)

  // Add assertion_results column to user_stories
  // Stores evaluation results object (null when not yet evaluated):
  // {
  //   evaluatedAt: "2024-01-15T10:30:00Z",
  //   summary: { total: 5, passed: 4, failed: 1, undecided: 0 },
  //   results: [
  //     { assertionId: "IA1", status: "passed", message: "...", details: null }
  //   ]
  // }
  db.exec(`
    ALTER TABLE user_stories ADD COLUMN assertion_results TEXT DEFAULT NULL
  `)

  // Add same columns to archived_stories for schema parity
  // This ensures archived stories retain their assertion data
  db.exec(`
    ALTER TABLE archived_stories ADD COLUMN inspection_assertions TEXT DEFAULT '[]'
  `)

  db.exec(`
    ALTER TABLE archived_stories ADD COLUMN assertion_results TEXT DEFAULT NULL
  `)

  console.log('[MIGRATION-005] Added inspection_assertions and assertion_results columns to user_stories and archived_stories')
}

/**
 * Rollback the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function down(db) {
  // SQLite doesn't support DROP COLUMN in older versions
  // The columns will remain but won't cause issues if not used
  // For full rollback, would need to recreate tables without these columns
  console.log('[MIGRATION-005] Down migration - inspection_assertions and assertion_results columns will remain (SQLite limitation)')
}

module.exports = { version, up, down }
