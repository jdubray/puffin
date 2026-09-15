/**
 * Migration 014: Board plans and task run state
 *
 * A plan (Claude Code plan mode output approved in Puffin) produces tasks on the
 * board. Adds the `board_plans` table (CRE's legacy `plans` table may still exist
 * in older databases, hence the name) and, on user_stories/archived_stories, the link
 * to the plan (plan_id, plan_step, depends_on, skill) and the implementation
 * run bookkeeping (thread_id, run_state, run_meta).
 *
 * @module database/migrations/014_add_board_plans
 */

const version = 14

const STORY_COLUMNS = [
  "plan_id TEXT DEFAULT NULL",
  "plan_step INTEGER DEFAULT NULL",
  "depends_on TEXT DEFAULT '[]'",
  "skill TEXT DEFAULT NULL",
  "thread_id TEXT DEFAULT NULL",
  "run_state TEXT DEFAULT 'idle'",
  "run_meta TEXT DEFAULT '{}'"
]

/**
 * Add a column unless it already exists (ALTER TABLE ADD COLUMN is not idempotent in SQLite).
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {string} definition - `name TYPE DEFAULT …`
 */
function addColumn(db, table, definition) {
  const name = definition.split(' ')[0]
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === name)
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

/**
 * Apply the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS board_plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      file_path TEXT NOT NULL,
      branch_id TEXT,
      source_prompt_id TEXT,
      status TEXT NOT NULL DEFAULT 'approved',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      approved_at TEXT
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS idx_board_plans_branch_id ON board_plans(branch_id)')

  for (const table of ['user_stories', 'archived_stories']) {
    for (const def of STORY_COLUMNS) addColumn(db, table, def)
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_user_stories_plan_id ON user_stories(plan_id)')

  console.log('[MIGRATION-014] Created board_plans table and added plan/run columns to stories')
}

/**
 * Rollback the migration (story columns are left in place; SQLite cannot drop them cheaply)
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function down(db) {
  db.exec('DROP INDEX IF EXISTS idx_user_stories_plan_id')
  db.exec('DROP INDEX IF EXISTS idx_board_plans_branch_id')
  db.exec('DROP TABLE IF EXISTS board_plans')
}

module.exports = { version, up, down, STORY_COLUMNS }
