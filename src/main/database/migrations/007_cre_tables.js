/**
 * Migration 007: Create CRE (Central Reasoning Engine) tables.
 *
 * Adds three tables for CRE plan management, RIS documents,
 * and AI-generated inspection assertions.
 *
 * @module database/migrations/007_cre_tables
 */

const version = 7

/**
 * Apply the migration.
 * @param {import('better-sqlite3').Database} db
 */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cre_plans (
      id TEXT PRIMARY KEY,
      sprint_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      file_path TEXT NOT NULL,
      iteration INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      approved_at TEXT DEFAULT NULL
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cre_plans_sprint_id ON cre_plans(sprint_id)
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS cre_ris (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      story_id TEXT NOT NULL,
      markdown TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (plan_id) REFERENCES cre_plans(id)
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cre_ris_plan_id ON cre_ris(plan_id)
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS cre_inspection_assertions (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      story_id TEXT NOT NULL,
      type TEXT NOT NULL,
      target TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      assertion_data TEXT NOT NULL DEFAULT '{}',
      result TEXT DEFAULT NULL,
      verified_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (plan_id) REFERENCES cre_plans(id)
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cre_assertions_plan_id ON cre_inspection_assertions(plan_id)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cre_assertions_story_id ON cre_inspection_assertions(story_id)
  `)

  console.log('[MIGRATION-007] Created cre_plans, cre_ris, and cre_inspection_assertions tables')
}

/**
 * Rollback the migration.
 * @param {import('better-sqlite3').Database} db
 */
function down(db) {
  db.exec('DROP TABLE IF EXISTS cre_inspection_assertions')
  db.exec('DROP TABLE IF EXISTS cre_ris')
  db.exec('DROP TABLE IF EXISTS cre_plans')
  console.log('[MIGRATION-007] Dropped CRE tables')
}

module.exports = { version, up, down }
