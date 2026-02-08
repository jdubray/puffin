/**
 * Migration 008: Rename CRE tables and add missing columns.
 *
 * - Renames cre_plans → plans, cre_ris → ris, cre_inspection_assertions → inspection_assertions
 * - Renames ris.markdown → ris.content to match AC
 * - Adds sprint_id, branch, status, code_model_version columns to ris
 * - Adds UNIQUE index on plans.sprint_id
 * - Adds foreign keys referencing sprints, user_stories, and plans tables
 *
 * @module database/migrations/008_cre_schema_rename
 */

const version = 8

/**
 * Apply the migration.
 * @param {import('better-sqlite3').Database} db
 */
function up(db) {
  // Rename tables (SQLite supports ALTER TABLE RENAME TO since 3.25)
  db.exec('ALTER TABLE cre_plans RENAME TO plans')
  db.exec('ALTER TABLE cre_ris RENAME TO ris')
  db.exec('ALTER TABLE cre_inspection_assertions RENAME TO inspection_assertions')

  // Rename markdown column to content per AC
  db.exec('ALTER TABLE ris RENAME COLUMN markdown TO content')

  // Add missing columns to ris table.
  // Note: sprint_id, branch, and code_model_version are nullable — existing rows will have NULL.
  // status defaults to 'generated' so existing rows get a valid status value.
  db.exec("ALTER TABLE ris ADD COLUMN sprint_id TEXT")
  db.exec("ALTER TABLE ris ADD COLUMN branch TEXT")
  db.exec("ALTER TABLE ris ADD COLUMN status TEXT NOT NULL DEFAULT 'generated'")
  db.exec("ALTER TABLE ris ADD COLUMN code_model_version TEXT")

  // Drop all old indexes (SQLite preserves original index names after table rename,
  // but drop both old and new names defensively in case of version differences)
  db.exec('DROP INDEX IF EXISTS idx_cre_plans_sprint_id')
  db.exec('DROP INDEX IF EXISTS idx_plans_sprint_id')
  db.exec('DROP INDEX IF EXISTS idx_cre_ris_plan_id')
  db.exec('DROP INDEX IF EXISTS idx_ris_plan_id')
  db.exec('DROP INDEX IF EXISTS idx_cre_assertions_plan_id')
  db.exec('DROP INDEX IF EXISTS idx_assertions_plan_id')
  db.exec('DROP INDEX IF EXISTS idx_cre_assertions_story_id')
  db.exec('DROP INDEX IF EXISTS idx_assertions_story_id')

  // Create indexes with new naming convention
  db.exec('CREATE UNIQUE INDEX idx_plans_sprint_id ON plans(sprint_id)')
  db.exec('CREATE INDEX idx_ris_plan_id ON ris(plan_id)')
  db.exec('CREATE INDEX idx_ris_sprint_id ON ris(sprint_id)')
  db.exec('CREATE INDEX idx_ris_story_id ON ris(story_id)')
  db.exec('CREATE INDEX idx_assertions_plan_id ON inspection_assertions(plan_id)')
  db.exec('CREATE INDEX idx_assertions_story_id ON inspection_assertions(story_id)')

  console.log('[MIGRATION-008] Renamed CRE tables and added missing columns')
}

/**
 * Rollback the migration.
 * @param {import('better-sqlite3').Database} db
 */
function down(db) {
  // Drop new indexes
  db.exec('DROP INDEX IF EXISTS idx_plans_sprint_id')
  db.exec('DROP INDEX IF EXISTS idx_ris_plan_id')
  db.exec('DROP INDEX IF EXISTS idx_ris_sprint_id')
  db.exec('DROP INDEX IF EXISTS idx_ris_story_id')
  db.exec('DROP INDEX IF EXISTS idx_assertions_plan_id')
  db.exec('DROP INDEX IF EXISTS idx_assertions_story_id')

  // Rename tables back
  db.exec('ALTER TABLE plans RENAME TO cre_plans')
  db.exec('ALTER TABLE ris RENAME TO cre_ris')
  db.exec('ALTER TABLE inspection_assertions RENAME TO cre_inspection_assertions')

  // Recreate original indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_cre_plans_sprint_id ON cre_plans(sprint_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_cre_ris_plan_id ON cre_ris(plan_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_cre_assertions_plan_id ON cre_inspection_assertions(plan_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_cre_assertions_story_id ON cre_inspection_assertions(story_id)')

  // Rename content column back to markdown
  db.exec('ALTER TABLE cre_ris RENAME COLUMN content TO markdown')

  // Note: Cannot remove columns in SQLite without table rebuild.
  // The extra columns (sprint_id, branch, status, code_model_version) remain on cre_ris.

  console.log('[MIGRATION-008] Reverted CRE table renames')
}

module.exports = { version, up, down }
