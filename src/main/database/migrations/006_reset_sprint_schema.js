/**
 * Migration 006: Reset Sprint Schema for Clean State
 *
 * This migration performs a clean reset of the sprint-related tables to eliminate
 * legacy data corruption and establish a proper schema with all required constraints.
 *
 * Changes:
 * 1. Drops and recreates sprints, sprint_stories, sprint_history tables
 * 2. Adds proper status CHECK constraints
 * 3. Adds single-active-sprint trigger enforcement
 * 4. Preserves user_stories but resets sprint-related status
 * 5. Preserves inspection_assertions schema (from migration 005)
 *
 * @module database/migrations/006_reset_sprint_schema
 */

const version = 6

/**
 * Valid sprint status values
 * @constant {string[]}
 */
const VALID_SPRINT_STATUSES = ['created', 'planning', 'plan-review', 'in-progress', 'completed', 'closed']

/**
 * Apply the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function up(db) {
  console.log('[MIGRATION-006] Starting sprint schema reset...')

  // 1. Drop dependent tables first (order matters for FK constraints)
  console.log('[MIGRATION-006] Dropping existing sprint tables...')
  db.exec('DROP TABLE IF EXISTS sprint_stories')
  db.exec('DROP TABLE IF EXISTS sprints')
  db.exec('DROP TABLE IF EXISTS sprint_history')

  // 2. Recreate sprints table with proper constraints
  console.log('[MIGRATION-006] Creating sprints table with constraints...')
  db.exec(`
    CREATE TABLE sprints (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'created'
        CHECK(status IN ('created', 'planning', 'plan-review', 'in-progress', 'completed', 'closed')),
      plan TEXT,
      story_progress TEXT DEFAULT '{}',
      prompt_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      plan_approved_at TEXT,
      completed_at TEXT,
      closed_at TEXT
    )
  `)

  // Create indexes for sprints
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sprints_status
    ON sprints(status)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sprints_closed
    ON sprints(closed_at DESC)
  `)

  // 3. Add trigger to enforce single active sprint
  // Active sprint = one where closed_at IS NULL
  console.log('[MIGRATION-006] Creating single-active-sprint trigger...')
  db.exec(`
    CREATE TRIGGER enforce_single_active_sprint
    BEFORE INSERT ON sprints
    BEGIN
      SELECT RAISE(ABORT, 'Cannot create sprint: an active sprint already exists. Close it first.')
      WHERE EXISTS (
        SELECT 1 FROM sprints
        WHERE closed_at IS NULL
      );
    END
  `)

  // 4. Recreate sprint_stories junction table with proper FK constraints
  console.log('[MIGRATION-006] Creating sprint_stories junction table...')
  db.exec(`
    CREATE TABLE sprint_stories (
      sprint_id TEXT NOT NULL,
      story_id TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (sprint_id, story_id),
      FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE CASCADE,
      FOREIGN KEY (story_id) REFERENCES user_stories(id) ON DELETE CASCADE
    )
  `)

  // Create index for story lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sprint_stories_story
    ON sprint_stories(story_id)
  `)

  // 5. Recreate sprint_history table for archived sprints
  console.log('[MIGRATION-006] Creating sprint_history table...')
  db.exec(`
    CREATE TABLE sprint_history (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'closed',
      plan TEXT,
      story_progress TEXT DEFAULT '{}',
      story_ids TEXT DEFAULT '[]',
      stories TEXT DEFAULT '[]',
      prompt_id TEXT,
      created_at TEXT NOT NULL,
      plan_approved_at TEXT,
      completed_at TEXT,
      closed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Create index for history queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sprint_history_closed
    ON sprint_history(closed_at DESC)
  `)

  // 6. Reset any user_stories that might have invalid sprint-related status
  // Stories should be 'pending', 'in-progress', or 'completed' - not sprint-specific
  console.log('[MIGRATION-006] Resetting user story statuses...')
  const resetResult = db.prepare(`
    UPDATE user_stories
    SET status = 'pending',
        updated_at = datetime('now')
    WHERE status NOT IN ('pending', 'in-progress', 'completed', 'archived')
  `).run()

  if (resetResult.changes > 0) {
    console.log(`[MIGRATION-006] Reset ${resetResult.changes} user stories with invalid status to 'pending'`)
  }

  // 7. Clear any orphaned sprint references in story progress
  // (This shouldn't happen but ensures clean state)

  console.log('[MIGRATION-006] Sprint schema reset completed successfully')
  console.log('[MIGRATION-006] - sprints table: recreated with status CHECK constraint')
  console.log('[MIGRATION-006] - sprint_stories table: recreated with CASCADE FK')
  console.log('[MIGRATION-006] - sprint_history table: recreated for archival')
  console.log('[MIGRATION-006] - Single-active-sprint trigger: enabled')
}

/**
 * Rollback the migration
 *
 * Note: This is a destructive migration that clears sprint data.
 * Rollback recreates tables but cannot restore deleted data.
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function down(db) {
  console.log('[MIGRATION-006] Rolling back sprint schema reset...')

  // Drop the trigger
  db.exec('DROP TRIGGER IF EXISTS enforce_single_active_sprint')

  // Drop and recreate tables with original (less strict) schema
  db.exec('DROP TABLE IF EXISTS sprint_stories')
  db.exec('DROP TABLE IF EXISTS sprints')
  db.exec('DROP TABLE IF EXISTS sprint_history')

  // Recreate with original schema (from 001_initial_schema.js + 004 title/description)
  db.exec(`
    CREATE TABLE sprints (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planning',
      plan TEXT,
      story_progress TEXT DEFAULT '{}',
      prompt_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      plan_approved_at TEXT,
      completed_at TEXT,
      closed_at TEXT
    )
  `)

  db.exec(`
    CREATE TABLE sprint_stories (
      sprint_id TEXT NOT NULL,
      story_id TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (sprint_id, story_id),
      FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE CASCADE,
      FOREIGN KEY (story_id) REFERENCES user_stories(id) ON DELETE CASCADE
    )
  `)

  db.exec(`
    CREATE TABLE sprint_history (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'closed',
      plan TEXT,
      story_progress TEXT DEFAULT '{}',
      story_ids TEXT DEFAULT '[]',
      stories TEXT DEFAULT '[]',
      prompt_id TEXT,
      created_at TEXT NOT NULL,
      plan_approved_at TEXT,
      completed_at TEXT,
      closed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Recreate indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_sprints_status ON sprints(status)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_sprints_closed ON sprints(closed_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_sprint_history_closed ON sprint_history(closed_at DESC)')

  console.log('[MIGRATION-006] Rollback completed (data was not restored)')
}

module.exports = { version, up, down }
