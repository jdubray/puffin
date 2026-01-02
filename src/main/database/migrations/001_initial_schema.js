/**
 * Migration: Initial Schema
 *
 * Creates the initial database schema for Puffin:
 * - user_stories: User story data with acceptance criteria
 * - sprints: Sprint tracking with plans and progress
 * - sprint_stories: Junction table for sprint-story relationships
 *
 * @module database/migrations/001_initial_schema
 */

/**
 * Apply the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function up(db) {
  // User Stories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_stories (
      id TEXT PRIMARY KEY,
      branch_id TEXT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      acceptance_criteria TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      implemented_on TEXT DEFAULT '[]',
      source_prompt_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      archived_at TEXT
    )
  `)

  // Indexes for user_stories
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_stories_status
    ON user_stories(status)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_stories_created
    ON user_stories(created_at DESC)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_stories_branch
    ON user_stories(branch_id)
  `)

  // Sprints table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sprints (
      id TEXT PRIMARY KEY,
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

  // Indexes for sprints
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sprints_status
    ON sprints(status)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sprints_closed
    ON sprints(closed_at DESC)
  `)

  // Sprint-Story junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sprint_stories (
      sprint_id TEXT NOT NULL,
      story_id TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (sprint_id, story_id),
      FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE CASCADE,
      FOREIGN KEY (story_id) REFERENCES user_stories(id) ON DELETE CASCADE
    )
  `)

  // Archived stories table (separate for better query performance)
  db.exec(`
    CREATE TABLE IF NOT EXISTS archived_stories (
      id TEXT PRIMARY KEY,
      branch_id TEXT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      acceptance_criteria TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'archived',
      implemented_on TEXT DEFAULT '[]',
      source_prompt_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Sprint history table (for closed sprints)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sprint_history (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'closed',
      plan TEXT,
      story_progress TEXT DEFAULT '{}',
      story_ids TEXT DEFAULT '[]',
      prompt_id TEXT,
      created_at TEXT NOT NULL,
      plan_approved_at TEXT,
      completed_at TEXT,
      closed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sprint_history_closed
    ON sprint_history(closed_at DESC)
  `)

  // Story generations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS story_generations (
      id TEXT PRIMARY KEY,
      user_prompt TEXT,
      project_context TEXT,
      generated_stories TEXT DEFAULT '[]',
      model_used TEXT DEFAULT 'sonnet',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Implementation journeys table
  db.exec(`
    CREATE TABLE IF NOT EXISTS implementation_journeys (
      id TEXT PRIMARY KEY,
      story_id TEXT NOT NULL,
      prompt_id TEXT,
      turn_count INTEGER DEFAULT 0,
      inputs TEXT DEFAULT '[]',
      status TEXT DEFAULT 'pending',
      outcome_notes TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (story_id) REFERENCES user_stories(id) ON DELETE CASCADE
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_implementation_journeys_story
    ON implementation_journeys(story_id)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_implementation_journeys_status
    ON implementation_journeys(status)
  `)

  // Data migration tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _json_migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_type TEXT NOT NULL UNIQUE,
      migrated_at TEXT NOT NULL DEFAULT (datetime('now')),
      record_count INTEGER DEFAULT 0
    )
  `)

  console.log('[MIGRATION 001] Initial schema created successfully')
}

/**
 * Rollback the migration
 *
 * @param {import('better-sqlite3').Database} db - Database connection
 */
function down(db) {
  // Drop tables in reverse order of creation (respecting foreign keys)
  db.exec('DROP TABLE IF EXISTS _json_migration')
  db.exec('DROP TABLE IF EXISTS implementation_journeys')
  db.exec('DROP TABLE IF EXISTS story_generations')
  db.exec('DROP TABLE IF EXISTS sprint_history')
  db.exec('DROP TABLE IF EXISTS archived_stories')
  db.exec('DROP TABLE IF EXISTS sprint_stories')
  db.exec('DROP TABLE IF EXISTS sprints')
  db.exec('DROP TABLE IF EXISTS user_stories')

  console.log('[MIGRATION 001] Initial schema rolled back')
}

module.exports = { up, down }
