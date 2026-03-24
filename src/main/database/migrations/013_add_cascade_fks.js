/**
 * Migration 013: Add ON DELETE CASCADE to foreign keys missing it.
 *
 * SQLite does not support ALTER TABLE ADD CONSTRAINT, so each table must be
 * recreated via the standard CREATE-INSERT-DROP-RENAME pattern.
 *
 * Tables fixed:
 * - completion_summaries.story_id → user_stories(id)  ON DELETE CASCADE
 * - ris.plan_id               → plans(id)          ON DELETE CASCADE
 * - inspection_assertions.plan_id → plans(id)       ON DELETE CASCADE
 *
 * Without CASCADE, any missed deletion code path hitting one of these tables
 * raises "FOREIGN KEY constraint failed" and leaves the story undeletable until
 * the orphaned child row is manually removed.
 *
 * @module database/migrations/013_add_cascade_fks
 */

const version = 13

/**
 * Apply the migration.
 * @param {import('better-sqlite3').Database} db
 */
function up(db) {
  // ── completion_summaries ──────────────────────────────────────────────────
  // Original schema (migration 009): FK without ON DELETE CASCADE.
  // Workaround in user-story-repository.js deletes from this table before
  // deleting the story, but any direct DELETE FROM user_stories bypasses it.
  db.exec(`
    CREATE TABLE completion_summaries_new (
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
      FOREIGN KEY (story_id) REFERENCES user_stories(id) ON DELETE CASCADE
    )
  `)
  db.exec(`INSERT INTO completion_summaries_new SELECT * FROM completion_summaries`)
  db.exec(`DROP TABLE completion_summaries`)
  db.exec(`ALTER TABLE completion_summaries_new RENAME TO completion_summaries`)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_summaries_story_id
      ON completion_summaries(story_id)
  `)
  console.log('[MIGRATION-013] Recreated completion_summaries with ON DELETE CASCADE on story_id')

  // ── ris ───────────────────────────────────────────────────────────────────
  // Original schema (migration 007, renamed in 008): FK without ON DELETE CASCADE.
  // Column list reflects all additions from migrations 007 and 008.
  db.exec(`
    CREATE TABLE ris_new (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      story_id TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      sprint_id TEXT,
      branch TEXT,
      status TEXT NOT NULL DEFAULT 'generated',
      code_model_version TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
    )
  `)
  db.exec(`INSERT INTO ris_new SELECT * FROM ris`)
  db.exec(`DROP TABLE ris`)
  db.exec(`ALTER TABLE ris_new RENAME TO ris`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ris_plan_id   ON ris(plan_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ris_sprint_id ON ris(sprint_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ris_story_id  ON ris(story_id)`)
  console.log('[MIGRATION-013] Recreated ris with ON DELETE CASCADE on plan_id')

  // ── inspection_assertions ─────────────────────────────────────────────────
  // Original schema (migration 007, renamed in 008): FK without ON DELETE CASCADE.
  db.exec(`
    CREATE TABLE inspection_assertions_new (
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
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
    )
  `)
  db.exec(`INSERT INTO inspection_assertions_new SELECT * FROM inspection_assertions`)
  db.exec(`DROP TABLE inspection_assertions`)
  db.exec(`ALTER TABLE inspection_assertions_new RENAME TO inspection_assertions`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assertions_plan_id  ON inspection_assertions(plan_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assertions_story_id ON inspection_assertions(story_id)`)
  console.log('[MIGRATION-013] Recreated inspection_assertions with ON DELETE CASCADE on plan_id')
}

/**
 * Rollback: recreate tables without CASCADE (restores pre-013 state).
 * @param {import('better-sqlite3').Database} db
 */
function down(db) {
  // completion_summaries — remove CASCADE
  db.exec(`
    CREATE TABLE completion_summaries_old (
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
  db.exec(`INSERT INTO completion_summaries_old SELECT * FROM completion_summaries`)
  db.exec(`DROP TABLE completion_summaries`)
  db.exec(`ALTER TABLE completion_summaries_old RENAME TO completion_summaries`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_completion_summaries_story_id ON completion_summaries(story_id)`)

  // ris — remove CASCADE
  db.exec(`
    CREATE TABLE ris_old (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      story_id TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      sprint_id TEXT,
      branch TEXT,
      status TEXT NOT NULL DEFAULT 'generated',
      code_model_version TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    )
  `)
  db.exec(`INSERT INTO ris_old SELECT * FROM ris`)
  db.exec(`DROP TABLE ris`)
  db.exec(`ALTER TABLE ris_old RENAME TO ris`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ris_plan_id   ON ris(plan_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ris_sprint_id ON ris(sprint_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ris_story_id  ON ris(story_id)`)

  // inspection_assertions — remove CASCADE
  db.exec(`
    CREATE TABLE inspection_assertions_old (
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
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    )
  `)
  db.exec(`INSERT INTO inspection_assertions_old SELECT * FROM inspection_assertions`)
  db.exec(`DROP TABLE inspection_assertions`)
  db.exec(`ALTER TABLE inspection_assertions_old RENAME TO inspection_assertions`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assertions_plan_id  ON inspection_assertions(plan_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assertions_story_id ON inspection_assertions(story_id)`)

  console.log('[MIGRATION-013] Rolled back CASCADE FK additions')
}

module.exports = { version, up, down }
